import axios from 'axios'
import ExcelJS from 'exceljs'
import FormData from 'form-data'

// 获取飞书 tenant_access_token
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

// 分页获取全量数据
async function getAllRecords(token) {
  const records = []
  let pageToken = null

  do {
    const params = { page_size: 500 }
    if (pageToken) params.page_token = pageToken

    const res = await axios.get(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${process.env.FEISHU_APP_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params,
      }
    )

    const data = res.data.data
    records.push(...data.items)
    pageToken = data.has_more ? data.page_token : null
  } while (pageToken)

  return records
}

// 解析字段值
function getField(fields, key) {
  const val = fields[key]
  if (val === undefined || val === null) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number') return val
  if (Array.isArray(val)) return val.map(v => v.text || v).join('')
  if (typeof val === 'object' && val.text) return val.text
  return String(val)
}

// 统计分组
function groupBy(data, key) {
  return data.reduce((acc, row) => {
    const k = row[key] || '未知'
    acc[k] = (acc[k] || [])
    acc[k].push(row)
    return acc
  }, {})
}

// 设置表头样式
function styleHeader(row, bgColor = 'FF4472C4') {
  row.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' }
    }
  })
}

// 设置数据行样式
function styleDataRow(row, isEven) {
  row.eachCell(cell => {
    cell.fill = {
      type: 'pattern', pattern: 'solid',
      fgColor: { argb: isEven ? 'FFD9E1F2' : 'FFFFFFFF' }
    }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      right: { style: 'thin', color: { argb: 'FFBFBFBF' } }
    }
  })
}

// 生成 Excel
async function generateExcel(rows) {
  const wb = new ExcelJS.Workbook()
  const total = rows.length
  const majorRows = rows.filter(r => r.sensitivity === 'Major')
  const compensationRows = rows.filter(r =>
    (r.handlingOpinion || '').includes('赔偿') ||
    (r.handlingOpinion || '').toLowerCase().includes('compensation')
  )

  // ===== Sheet 1: 总览 Dashboard =====
  const ws1 = wb.addWorksheet('总览 Dashboard')
  ws1.columns = [
    { width: 25 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }
  ]
  const titleRow1 = ws1.addRow(['2026年投诉工单分析报告 | 总览 Dashboard'])
  titleRow1.getCell(1).font = { bold: true, size: 16, color: { argb: 'FF1F3864' } }
  ws1.mergeCells('A1:F1')
  ws1.addRow([])

  const headerRow1 = ws1.addRow(['指标', '数值', '', '', '', ''])
  styleHeader(headerRow1)

  const metricsData = [
    ['总投诉工单数', total],
    ['Major 级别数', majorRows.length],
    ['Major 率', total > 0 ? (majorRows.length / total * 100).toFixed(1) + '%' : '0%'],
    ['赔偿处理数', compensationRows.length],
    ['赔偿率', total > 0 ? (compensationRows.length / total * 100).toFixed(1) + '%' : '0%'],
  ]
  metricsData.forEach((d, i) => {
    const r = ws1.addRow(d)
    styleDataRow(r, i % 2 === 0)
  })

  // ===== Sheet 2: 产品线分析 =====
  const ws2 = wb.addWorksheet('产品线分析')
  ws2.columns = [{ width: 30 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }]
  ws2.addRow(['2a. 各产品线投诉量及严重程度']).getCell(1).font = { bold: true, size: 13 }
  const h2 = ws2.addRow(['产品线', '投诉总数', 'Major', 'Minor', 'Major率'])
  styleHeader(h2)

  const byVarian = groupBy(rows, 'varian')
  Object.entries(byVarian)
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([k, v], i) => {
      const maj = v.filter(r => r.sensitivity === 'Major').length
      const min = v.length - maj
      const r = ws2.addRow([k, v.length, maj, min, (maj / v.length * 100).toFixed(1) + '%'])
      styleDataRow(r, i % 2 === 0)
    })

  // ===== Sheet 3: 投诉类型分析 =====
  const ws3 = wb.addWorksheet('投诉类型分析')
  ws3.columns = [{ width: 35 }, { width: 15 }, { width: 15 }, { width: 35 }, { width: 15 }, { width: 15 }]
  ws3.addRow(['3a. 一级投诉分类']).getCell(1).font = { bold: true, size: 13 }
  const h3a = ws3.addRow(['一级分类', '数量', '占比'])
  styleHeader(h3a)

  const byL1 = groupBy(rows, 'l1')
  Object.entries(byL1)
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([k, v], i) => {
      const r = ws3.addRow([k, v.length, (v.length / total * 100).toFixed(1) + '%'])
      styleDataRow(r, i % 2 === 0)
    })

  ws3.addRow([])
  ws3.addRow(['3b. 三级投诉分类 TOP20']).getCell(1).font = { bold: true, size: 13 }
  const h3b = ws3.addRow(['三级分类', '数量', '占比'])
  styleHeader(h3b)

  const byL3 = groupBy(rows, 'l3')
  Object.entries(byL3)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 20)
    .forEach(([k, v], i) => {
      const r = ws3.addRow([k, v.length, (v.length / total * 100).toFixed(1) + '%'])
      styleDataRow(r, i % 2 === 0)
    })

  // ===== Sheet 4: 工厂分析 =====
  const ws4 = wb.addWorksheet('工厂分析')
  ws4.columns = [{ width: 25 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }]
  ws4.addRow(['4a. 各工厂投诉量及严重级别']).getCell(1).font = { bold: true, size: 13 }
  const h4 = ws4.addRow(['工厂', '投诉总数', 'Major', 'Minor', 'Major率'])
  styleHeader(h4)

  const byFactory = groupBy(rows, 'factory')
  Object.entries(byFactory)
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([k, v], i) => {
      const maj = v.filter(r => r.sensitivity === 'Major').length
      const r = ws4.addRow([k, v.length, maj, v.length - maj, (maj / v.length * 100).toFixed(1) + '%'])
      styleDataRow(r, i % 2 === 0)
    })

  // ===== Sheet 5: 渠道分析 =====
  const ws5 = wb.addWorksheet('渠道分析')
  ws5.columns = [{ width: 30 }, { width: 15 }, { width: 15 }, { width: 5 }, { width: 30 }, { width: 15 }, { width: 15 }]
  ws5.addRow(['5a. 接触渠道分布']).getCell(1).font = { bold: true, size: 13 }
  const h5a = ws5.addRow(['接触渠道', '数量', '占比'])
  styleHeader(h5a)

  const byContact = groupBy(rows, 'contactChannel')
  Object.entries(byContact)
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([k, v], i) => {
      const r = ws5.addRow([k, v.length, (v.length / total * 100).toFixed(1) + '%'])
      styleDataRow(r, i % 2 === 0)
    })

  ws5.addRow([])
  ws5.addRow(['5b. 购买渠道分布']).getCell(1).font = { bold: true, size: 13 }
  const h5b = ws5.addRow(['购买渠道', '数量', '占比'])
  styleHeader(h5b)

  const byPurchase = groupBy(rows, 'purchaseChannel')
  Object.entries(byPurchase)
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([k, v], i) => {
      const r = ws5.addRow([k, v.length, (v.length / total * 100).toFixed(1) + '%'])
      styleDataRow(r, i % 2 === 0)
    })

  // ===== Sheet 6: 地区分析 =====
  const ws6 = wb.addWorksheet('地区分析')
  ws6.columns = [{ width: 25 }, { width: 15 }, { width: 15 }]
  ws6.addRow(['6a. 各省份 TOP20 投诉量']).getCell(1).font = { bold: true, size: 13 }
  const h6 = ws6.addRow(['省份', '投诉数', '占比'])
  styleHeader(h6)

  const byProvince = groupBy(rows, 'province')
  Object.entries(byProvince)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 20)
    .forEach(([k, v], i) => {
      const r = ws6.addRow([k, v.length, (v.length / total * 100).toFixed(1) + '%'])
      styleDataRow(r, i % 2 === 0)
    })

  // ===== Sheet 7: 机台号分析 =====
  const ws7 = wb.addWorksheet('机台号(产线)分析')
  ws7.columns = [{ width: 30 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }]
  ws7.addRow(['7a. 各产线投诉总量及严重程度']).getCell(1).font = { bold: true, size: 13 }
  const h7 = ws7.addRow(['机台号/产线', '投诉总数', 'Major', 'Minor', 'Major率'])
  styleHeader(h7)

  const byMachine = groupBy(rows.filter(r => r.batchNumber), 'batchNumber')
  Object.entries(byMachine)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 30)
    .forEach(([k, v], i) => {
      const maj = v.filter(r => r.sensitivity === 'Major').length
      const r = ws7.addRow([k, v.length, maj, v.length - maj, (maj / v.length * 100).toFixed(1) + '%'])
      styleDataRow(r, i % 2 === 0)
    })

  // ===== Sheet 8: 原始数据 =====
  const ws8 = wb.addWorksheet('原始数据')
  const rawHeaders = [
    '工单编号', '创建日期', '月份', '产品系列', '产品类别', '品牌', '产品名称',
    '问题尺码', '生产工厂', '生产批号', '一级目录', '二级目录', '三级目录',
    '敏感级别', '处理意见', '省份', '城市', '接触渠道', '购买渠道', '情况描述'
  ]
  ws8.columns = rawHeaders.map((h, i) => ({ header: h, width: i === 19 ? 40 : 20 }))
  const rawHeaderRow = ws8.getRow(1)
  styleHeader(rawHeaderRow, 'FF1F3864')

  rows.forEach((r, i) => {
    const row = ws8.addRow([
      r.workNumber, r.createTime, r.month, r.varian, r.productCategory,
      r.brand, r.productName, r.size, r.factory, r.batchNumber,
      r.l1, r.l2, r.l3, r.sensitivity, r.handlingOpinion,
      r.province, r.city, r.contactChannel, r.purchaseChannel, r.description
    ])
    if (i % 2 === 0) {
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
      })
    }
  })

  const buffer = await wb.xlsx.writeBuffer()
  return buffer
}

// 上传 Excel 到飞书云盘
// 获取或创建「质量投诉报告」文件夹
async function getOrCreateReportFolder(token) {
  // 获取根目录 token
  const rootRes = await axios.get(
    'https://open.feishu.cn/open-apis/drive/explorer/v2/root_folder/meta',
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const rootToken = rootRes.data.data.token

  // 列出根目录下的子文件夹，找「质量投诉报告」
  const listRes = await axios.get(
    `https://open.feishu.cn/open-apis/drive/explorer/v2/folder/${rootToken}/children`,
    {
      headers: { Authorization: `Bearer ${token}` },
      params: { types: 'folder' },
    }
  )
  const children = listRes.data.data?.children || []
  const existing = children.find(c => c.name === '质量投诉报告')
  if (existing) return existing.token

  // 不存在则创建
  const createRes = await axios.post(
    `https://open.feishu.cn/open-apis/drive/explorer/v2/folder/${rootToken}`,
    { name: '质量投诉报告' },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  )
  return createRes.data.data.token
}

async function uploadToFeishu(buffer, token) {
  const fileName = `投诉分析报告_${new Date().toISOString().slice(0, 10)}.xlsx`

  // 获取或创建「质量投诉报告」文件夹
  const folderToken = await getOrCreateReportFolder(token)

  const form = new FormData()
  form.append('file_name', fileName)
  form.append('parent_type', 'explorer')
  form.append('parent_node', folderToken)
  form.append('size', buffer.length)
  form.append('file', Buffer.from(buffer), {
    filename: fileName,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  const res = await axios.post(
    'https://open.feishu.cn/open-apis/drive/v1/files/upload_all',
    form,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        ...form.getHeaders(),
      },
    }
  )

  const fileToken = res.data.data.file_token

  // 设置文件对组织内所有人可读
  await axios.patch(
    `https://open.feishu.cn/open-apis/drive/v1/permissions/${fileToken}/public?type=file`,
    { external_access_entity: 'open', link_share_entity: 'tenant_readable' },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  )

  const shareUrl = `https://feishu.cn/file/${fileToken}`
  return { fileToken, shareUrl, fileName }
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const token = await getTenantAccessToken()
    const rawRecords = await getAllRecords(token)

    // 解析字段
    const rows = rawRecords.map(item => {
      const f = item.fields
      return {
        workNumber: getField(f, '工单编号 Work Number'),
        createTime: getField(f, '创建日期 Time'),
        month: getField(f, '月份'),
        varian: getField(f, '产品系列 Varian'),
        productCategory: getField(f, '产品类别 Product Category'),
        brand: getField(f, '品牌 Brand'),
        productName: getField(f, '产品名称 Product Name'),
        size: getField(f, '问题尺码 Size'),
        factory: getField(f, '生产工厂 Factory'),
        batchNumber: getField(f, '生产批号喷码 Production Batch Number'),
        l1: getField(f, '一级目录 First level directory'),
        l2: getField(f, '二级目录 Secondary directory'),
        l3: getField(f, '三级目录 Third-level directory'),
        sensitivity: getField(f, '敏感级别  Sensitivity Level'),
        handlingOpinion: getField(f, '处理意见 Handing Opinion Copy'),
        province: getField(f, '省份 Province'),
        city: getField(f, '城市 City'),
        contactChannel: getField(f, '接触渠道 Contact Channel'),
        purchaseChannel: getField(f, '购买渠道 Purchase Channel'),
        description: getField(f, '情况描述 Situation Description'),
      }
    })

    const buffer = await generateExcel(rows)
    const { shareUrl, fileName } = await uploadToFeishu(buffer, token)

    // 生成文字摘要
    const total = rows.length
    const majorCount = rows.filter(r => r.sensitivity === 'Major').length
    const compensationCount = rows.filter(r =>
      (r.handlingOpinion || '').includes('赔偿') ||
      (r.handlingOpinion || '').toLowerCase().includes('compensation')
    ).length

    const topVarians = Object.entries(
      rows.reduce((acc, r) => { acc[r.varian || '未知'] = (acc[r.varian || '未知'] || 0) + 1; return acc }, {})
    ).sort((a, b) => b[1] - a[1]).slice(0, 3)

    const topL1 = Object.entries(
      rows.reduce((acc, r) => { acc[r.l1 || '未知'] = (acc[r.l1 || '未知'] || 0) + 1; return acc }, {})
    ).sort((a, b) => b[1] - a[1]).slice(0, 3)

    const topFactory = Object.entries(
      rows.reduce((acc, r) => { acc[r.factory || '未知'] = (acc[r.factory || '未知'] || 0) + 1; return acc }, {})
    ).sort((a, b) => b[1] - a[1]).slice(0, 3)

    const topProvince = Object.entries(
      rows.reduce((acc, r) => { acc[r.province || '未知'] = (acc[r.province || '未知'] || 0) + 1; return acc }, {})
    ).sort((a, b) => b[1] - a[1]).slice(0, 5)

    const reportUrl = 'https://feishu-dify-bridge.vercel.app/report'

    const summaryText = `📊 **投诉分析报告已生成**

**📌 核心指标**
• 总投诉工单：${total} 条
• Major 级别：${majorCount} 条（${(majorCount / total * 100).toFixed(1)}%）
• 赔偿处理：${compensationCount} 条（${(compensationCount / total * 100).toFixed(1)}%）

**🏷️ 投诉产品线 TOP3**
${topVarians.map((v, i) => `${i + 1}. ${v[0]}：${v[1]} 条（${(v[1] / total * 100).toFixed(1)}%）`).join('\n')}

**📋 一级投诉类型 TOP3**
${topL1.map((v, i) => `${i + 1}. ${v[0]}：${v[1]} 条（${(v[1] / total * 100).toFixed(1)}%）`).join('\n')}

**🏭 工厂投诉量 TOP3**
${topFactory.map((v, i) => `${i + 1}. ${v[0]}：${v[1]} 条`).join('\n')}

**📍 投诉省份 TOP5**
${topProvince.map((v, i) => `${i + 1}. ${v[0]}：${v[1]} 条`).join('\n')}

🌐 **查看完整可视化报告（含图表）：**
${reportUrl}

📥 **下载 Excel 原始报告：**
${shareUrl}`

    return res.status(200).json({
      success: true,
      message: `报告生成成功，共 ${rows.length} 条数据`,
      fileName,
      downloadUrl: shareUrl,
      reportUrl,
      summaryText,
    })
  } catch (err) {
    console.error('生成报告失败:', err?.response?.data || err.message)
    return res.status(500).json({
      success: false,
      error: err?.response?.data?.msg || err.message,
    })
  }
}
