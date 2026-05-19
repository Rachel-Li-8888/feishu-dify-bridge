import axios from 'axios'

// 内存缓存，5分钟有效
let _cache = null
let _cacheTime = 0
const CACHE_TTL = 5 * 60 * 1000

async function getTenantAccessToken() {
  const res = await axios.post(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    { app_id: process.env.FEISHU_APP_ID, app_secret: process.env.FEISHU_APP_SECRET }
  )
  return res.data.tenant_access_token
}

async function getAllRecords(token) {
  const records = []
  let pageToken = null
  do {
    const params = { page_size: 500 }
    if (pageToken) params.page_token = pageToken
    const res = await axios.get(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${process.env.FEISHU_APP_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records`,
      { headers: { Authorization: `Bearer ${token}` }, params }
    )
    const data = res.data.data
    records.push(...data.items)
    pageToken = data.has_more ? data.page_token : null
  } while (pageToken)
  return records
}

function getField(fields, key) {
  const val = fields[key]
  if (val === undefined || val === null) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number') return val
  if (Array.isArray(val)) return val.map(v => v.text || v).join('')
  if (typeof val === 'object' && val.text) return val.text
  return String(val)
}

function computeStats(rawRecords) {
  const rows = rawRecords.map(item => {
    const f = item.fields
    return {
      varian: getField(f, '产品系列 Varian'),
      factory: getField(f, '生产工厂 Factory'),
      l1: getField(f, '一级目录 First level directory'),
      sensitivity: getField(f, '敏感级别  Sensitivity Level'),
      handling: getField(f, '处理意见 Handing Opinion Copy'),
      province: getField(f, '省份 Province'),
      date: getField(f, '创建日期 Time'),
    }
  })

  const total = rows.length
  const majorCount = rows.filter(r => r.sensitivity === 'Major').length
  const compensationCount = rows.filter(r =>
    (r.handling || '').includes('赔偿') ||
    (r.handling || '').toLowerCase().includes('compensation')
  ).length

  const byVarian = {}, majorByVarian = {}, byL1 = {}, byFactory = {}, byProvince = {}, byMonth = {}

  rows.forEach(r => {
    const v = r.varian || '未知'
    byVarian[v] = (byVarian[v] || 0) + 1
    if (r.sensitivity === 'Major') majorByVarian[v] = (majorByVarian[v] || 0) + 1

    const l1 = r.l1 || '未知'
    byL1[l1] = (byL1[l1] || 0) + 1

    const f = r.factory || '未知'
    byFactory[f] = (byFactory[f] || 0) + 1

    const p = r.province || '未知'
    if (p && p !== '未知') byProvince[p] = (byProvince[p] || 0) + 1

    if (r.date) {
      const ts = typeof r.date === 'number' ? r.date : Date.parse(r.date)
      if (!isNaN(ts)) {
        const d = new Date(ts)
        const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        byMonth[month] = (byMonth[month] || 0) + 1
      }
    }
  })

  return {
    total,
    majorCount,
    compensationCount,
    majorRate: total > 0 ? (majorCount / total * 100).toFixed(1) : '0',
    compensationRate: total > 0 ? (compensationCount / total * 100).toFixed(1) : '0',
    byVarian: Object.entries(byVarian).sort((a, b) => b[1] - a[1]).slice(0, 8),
    majorByVarian,
    byL1: Object.entries(byL1).sort((a, b) => b[1] - a[1]).slice(0, 6),
    byFactory: Object.entries(byFactory).sort((a, b) => b[1] - a[1]),
    byProvince: Object.entries(byProvince).sort((a, b) => b[1] - a[1]).slice(0, 10),
    byMonth: Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0])),
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // 命中缓存直接返回
  const now = Date.now()
  if (_cache && (now - _cacheTime) < CACHE_TTL) {
    res.setHeader('X-Cache', 'HIT')
    return res.status(200).json(_cache)
  }

  try {
    const token = await getTenantAccessToken()
    const rawRecords = await getAllRecords(token)
    const stats = computeStats(rawRecords)

    _cache = stats
    _cacheTime = now

    res.setHeader('X-Cache', 'MISS')
    return res.status(200).json(stats)
  } catch (err) {
    console.error('get-report-stats error:', err?.response?.data || err.message)
    return res.status(500).json({ error: err?.response?.data?.msg || err.message })
  }
}
