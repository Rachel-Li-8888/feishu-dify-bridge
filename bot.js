/**
 * 飞书机器人长连接脚本
 * 运行方式：node bot.js
 * 接收飞书消息 → 生成报告 or Dify 问答 → 回复
 */

import * as Lark from '@larksuiteoapi/node-sdk'

const FEISHU_APP_ID = process.env.FEISHU_APP_ID
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET
const DIFY_API_KEY = process.env.DIFY_API_KEY
const DIFY_BASE_URL = process.env.DIFY_BASE_URL || 'https://api.dify.ai/v1'
const VERCEL_API = 'https://feishu-dify-bridge.vercel.app'

const REPORT_KEYWORDS = ['生成报告', '导出报告', '生成分析报告', '生成投诉报告', '下载报告', '生成月报']

const client = new Lark.Client({
  appId: FEISHU_APP_ID,
  appSecret: FEISHU_APP_SECRET,
  domain: Lark.Domain.Feishu,
})

const wsClient = new Lark.WSClient({
  appId: FEISHU_APP_ID,
  appSecret: FEISHU_APP_SECRET,
})

function isReportRequest(text) {
  return REPORT_KEYWORDS.some(kw => text.includes(kw))
}

async function callDify(query) {
  const res = await fetch(`${DIFY_BASE_URL}/chat-messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DIFY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: {},
      query,
      response_mode: 'blocking',
      user: 'feishu-user',
      conversation_id: '',
    }),
  })
  const data = await res.json()
  return data.answer || '抱歉，暂时无法回答，请稍后再试。'
}

async function generateReport() {
  const res = await fetch(`${VERCEL_API}/api/generate-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(120000),
  })
  return res.json()
}

async function replyMessage(messageId, text) {
  await client.im.message.reply({
    path: { message_id: messageId },
    data: {
      content: JSON.stringify({ text }),
      msg_type: 'text',
    },
  })
}

wsClient.start({
  eventDispatcher: new Lark.EventDispatcher({}).register({
    'im.message.receive_v1': async (data) => {
      const messageId = data.message.message_id
      const msgType = data.message.message_type

      if (msgType !== 'text') return

      const content = JSON.parse(data.message.content)
      const userQuery = content.text?.replace(/@\S+/g, '').trim()

      if (!userQuery) return

      console.log(`收到消息: ${userQuery}`)

      try {
        if (isReportRequest(userQuery)) {
          console.log('生成报告中...')
          await replyMessage(messageId, '⏳ 正在生成报告，请稍等（约30秒）...')
          const report = await generateReport()
          const replyText = report.success
            ? (report.summaryText || `📊 报告已生成！${report.message}\n\n下载链接：${report.downloadUrl}`)
            : `报告生成失败：${report.error}`
          await replyMessage(messageId, replyText)
        } else {
          console.log('调用 Dify 分析...')
          const answer = await callDify(userQuery)
          await replyMessage(messageId, answer)
        }
      } catch (err) {
        console.error('处理失败:', err.message)
        await replyMessage(messageId, '处理出错，请稍后重试。')
      }
    },
  }),
})

console.log('🚀 飞书机器人已启动，长连接模式运行中...')
console.log('Ctrl+C 退出')
