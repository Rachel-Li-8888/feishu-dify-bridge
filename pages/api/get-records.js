import axios from 'axios'

async function getTenantAccessToken() {
  const res = await axios.post(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    {
      app_id: process.env.FEISHU_APP_ID,
      app_secret: process.env.FEISHU_APP_SECRET,
    }
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).end()
  }

  try {
    const token = await getTenantAccessToken()
    const rawRecords = await getAllRecords(token)

    const rows = rawRecords.map(r => {
      const f = r.fields
      return {
        orderId: getField(f, '工单编号 Work Number'),
        date: getField(f, '创建日期 Time'),
        varian: getField(f, '产品系列 Varian'),
        productCategory: getField(f, '产品类别 Product Category'),
        brand: getField(f, '品牌 Brand'),
        factory: getField(f, '生产工厂 Factory'),
        batchNo: getField(f, '生产批号喷码 Production Batch Number'),
        level1: getField(f, '一级目录 First level directory'),
        level2: getField(f, '二级目录 Secondary directory'),
        level3: getField(f, '三级目录 Third-level directory'),
        sensitivity: getField(f, '敏感级别  Sensitivity Level'),
        handling: getField(f, '处理意见 Handing Opinion Copy'),
        province: getField(f, '省份 Province'),
        city: getField(f, '城市 City'),
        contactChannel: getField(f, '接触渠道 Contact Channel'),
        purchaseChannel: getField(f, '购买渠道 Purchase Channel'),
        description: getField(f, '情况描述 Situation Description'),
      }
    })

    return res.status(200).json({
      total: rows.length,
      records: rows,
    })
  } catch (err) {
    console.error('获取数据失败:', err?.response?.data || err.message)
    return res.status(500).json({ error: err?.response?.data?.msg || err.message })
  }
}
