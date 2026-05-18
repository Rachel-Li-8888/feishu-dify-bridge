import axios from 'axios'

const REPORT_KEYWORDS = ['生成报告', '导出报告', '生成分析报告', '生成投诉报告', '下载报告', '生成月报']

function isReportRequest(text) {
  return REPORT_KEYWORDS.some(kw => text.includes(kw))
}

async function generateReport() {
  const res = await axios.post(
    'https://feishu-dify-bridge.vercel.app/api/generate-report',
    {},
    { timeout: 120000 }
  )
  return res.data
}

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

async function replyFeishu(messageId, content, token) {
  await axios.post(
    `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/reply`,
    {
      content: JSON.stringify({ text: content }),
      msg_type: 'text',
    },
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  )
}

async function callDify(query) {
  const res = await axios.post(
    `${process.env.DIFY_BASE_URL}/chat-messages`,
    {
      inputs: {},
      query,
      response_mode: 'blocking',
      user: 'feishu-user',
      conversation_id: '',
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.DIFY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    }
  )
  return res.data.answer
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  const body = req.body

  // 飞书 URL 验证
  if (body.type === 'url_verification') {
    return res.json({ challenge: body.challenge })
  }

  // 处理消息事件
  if (body.header?.event_type === 'im.message.receive_v1') {
    const event = body.event
    const messageId = event.message.message_id
    const msgType = event.message.message_type

    if (msgType !== 'text') {
      return res.status(200).end()
    }

    const content = JSON.parse(event.message.content)
    const userQuery = content.text?.replace(/@\S+/g, '').trim()

    if (!userQuery) {
      return res.status(200).end()
    }

    res.status(200).json({ ok: true })

    try {
      const token = await getTenantAccessToken()
      if (isReportRequest(userQuery)) {
        const report = await generateReport()
        const replyText = report.success
          ? `📊 报告已生成！${report.message}\n\n下载链接：${report.downloadUrl}`
          : `报告生成失败：${report.error}`
        await replyFeishu(messageId, replyText, token)
      } else {
        const difyAnswer = await callDify(userQuery)
        await replyFeishu(messageId, difyAnswer, token)
      }
    } catch (err) {
      console.error('转发失败:', err?.response?.data || err.message)
    }

    return
  }

  return res.status(200).json({ ok: true })
}
