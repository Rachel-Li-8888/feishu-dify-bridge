import axios from 'axios'

async function getTenantAccessToken() {
  const res = await axios.post(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    { app_id: process.env.FEISHU_APP_ID, app_secret: process.env.FEISHU_APP_SECRET }
  )
  return res.data.tenant_access_token
}

export default async function handler(req, res) {
  const token = await getTenantAccessToken()
  const r = await axios.get(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${process.env.FEISHU_APP_TOKEN}/tables/${process.env.FEISHU_TABLE_ID}/records`,
    { headers: { Authorization: `Bearer ${token}` }, params: { page_size: 1 } }
  )
  const fields = r.data.data.items[0]?.fields || {}
  res.json({ fieldNames: Object.keys(fields), sample: fields })
}
