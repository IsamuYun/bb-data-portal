/* Fairfax Donor Exporter - background service worker
   代理 Claude API 调用（扩展源不受页面 CORS 限制）。API Key 由用户在面板中填写并保存在 chrome.storage.sync。 */
const API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-opus-5-5';

const SYSTEM = `你是专业的中英翻译。用户会给出一组来自精子库捐献者档案的英文文本（可能是枚举值、职业、学位、族裔组合，或一段人物介绍）。
请把每条翻译成自然、准确的简体中文：
- 保留 "Donor 8118" 这类编号原样；
- 枚举值保持简短（例如 "Real Estate Agent" -> "房地产经纪人"），不要加解释；
- 介绍段落按原意完整翻译，不要省略或添加内容；
- 逐条返回，src 必须与输入完全一致。`;

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: { type: 'object', properties: { src: { type: 'string' }, zh: { type: 'string' } }, required: ['src', 'zh'], additionalProperties: false },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

async function translate(texts, apiKey, model) {
  const body = {
    model: model || DEFAULT_MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: JSON.stringify({ texts }) }],
  };
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2026-10-21',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Claude API ${r.status}: ${data?.error?.message || r.statusText}`);
  if (data.stop_reason === 'refusal') throw new Error('Claude API 拒绝了该请求（refusal）');
  if (data.stop_reason === 'max_tokens') throw new Error('翻译输出被截断（max_tokens），请减少每批数量');
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const parsed = JSON.parse(text);
  return parsed.items || [];
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'FDE_TRANSLATE') return false;
  (async () => {
    try {
      let apiKey = msg.apiKey;
      if (!apiKey) { const o = await chrome.storage.sync.get('fdeApiKey'); apiKey = o.fdeApiKey; }
      if (!apiKey) throw new Error('未设置 Claude API Key');
      const items = await translate(msg.texts || [], apiKey, msg.model);
      sendResponse({ ok: true, items });
    } catch (e) { sendResponse({ ok: false, error: e.message }); }
  })();
  return true; // async sendResponse
});
