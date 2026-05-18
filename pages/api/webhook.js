export const config = { runtime: 'edge' }

const REPORT_KEYWORDS = ['生成报告', '导出报告', '生成分析报告', '生成投诉报告', '下载报告', '生成月报']

function isReportRequest(text) {
  return REPORT_KEYWORDS.some(kw => text.includes(kw))
}

async function generateReport() {
  const res = await fetch('https://feishu-dify-bridge.vercel.app/api/generate-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(120000),
  })
  return res.json()
}

async function getTenantAccessToken() {
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: process.env.FEISHU_APP_ID,
      app_secret: process.env.FEISHU_APP_SECRET,
    }),
  })
  const data = await res.json()
  return data.tenant_access_token
}

async function replyFeishu(messageId, content, token) {
  await fetch(`https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/reply`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: JSON.stringify({ text: content }),
      msg_type: 'text',
    }),
  })
}

async function callDify(query) {
  const res = await fetch(`${process.env.DIFY_BASE_URL}/chat-messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DIFY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: {},
      query,
      response_mode: 'blocking',
      user: 'feishu-user',
      conversation_id: '',
    }),
    signal: AbortSignal.timeout(60000),
  })
  const data = await res.json()
  return data.answer
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const body = await req.json()

  // 飞书 URL 验证（必须在 3 秒内响应）
  if (body.type === 'url_verification') {
    return new Response(JSON.stringify({ challenge: body.challenge }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 立即返回 200，异步处理消息
  if (body.header?.event_type === 'im.message.receive_v1') {
    const event = body.event
    const messageId = event.message.message_id
    const msgType = event.message.message_type

    if (msgType !== 'text') {
      return new Response('ok')
    }

    const content = JSON.parse(event.message.content)
    const userQuery = content.text?.replace(/@\S+/g, '').trim()

    if (!userQuery) {
      return new Response('ok')
    }

    // 异步处理，不阻塞响应
    ;(async () => {
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
        console.error('处理失败:', err.message)
      }
    })()

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
