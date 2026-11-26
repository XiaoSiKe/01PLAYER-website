import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { digest, sceneFor } from './player-events.mjs';

const DAY = 86400000;
const RETRY_DELAY = 60000;
const apiRoot = 'https://api.weixin.qq.com';
const pngHeader = Buffer.from([137,80,78,71,13,10,26,10]);
function imageType(bytes) {
  if (bytes.subarray(0, 8).equals(pngHeader)) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  return null;
}
function apiError(data) {
  const error = new Error('微信暂时无法生成报名入口，请稍后重试。');
  error.wxCode = Number(data?.errcode);
  return error;
}

// Provider calls stay on the server. Cache keys isolate AppIDs, page paths and events.
export function createWechatHandoff({ demo, cacheDir, appId = process.env.WECHAT_APP_ID,
  appSecret = process.env.WECHAT_APP_SECRET, page = process.env.WECHAT_MINIPROGRAM_EVENT_PAGE || 'pages/registration/index',
  homePage = 'pages/events/index',
  fetchApi = fetch, now = Date.now } = {}) {
  const inflight = new Map();
  const unavailableUntil = new Map();
  let token = null;
  function coalesce(key, callback) {
    if (!inflight.has(key)) inflight.set(key, Promise.resolve().then(callback).finally(() => inflight.delete(key)));
    return inflight.get(key);
  }
  function save(file, bytes) {
    mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
    writeFileSync(file + '.tmp', bytes, { mode: 0o600 });
    renameSync(file + '.tmp', file);
  }
  async function post(path, body) {
    return fetchApi(apiRoot + path, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(8000), redirect: 'error' });
  }
  async function getToken() {
    if (token && token.expiresAt > now()) return token.value;
    return coalesce('access-token', async () => {
      const response = await post('/cgi-bin/stable_token', { grant_type: 'client_credential', appid: appId, secret: appSecret });
      if (!response.ok) throw apiError();
      const data = await response.json();
      if (!data.access_token || !(Number(data.expires_in) > 0)) throw apiError(data);
      token = { value: data.access_token, expiresAt: now() + Math.max(1, Number(data.expires_in) - 120) * 1000 };
      return token.value;
    });
  }
  const destination = eventId => eventId ? page : homePage;
  async function generate(kind, eventId, secondAttempt = false) {
    const access = await getToken();
    const isLink = kind === 'link';
    const path = isLink ? '/wxa/generate_urllink' : '/wxa/getwxacodeunlimit';
    const body = isLink ? { path: destination(eventId), ...(eventId && { query: 'id=' + encodeURIComponent(eventId) }), env_version: 'release', expire_type: 1, expire_interval: 28 }
      : { page: destination(eventId), scene: eventId ? sceneFor(eventId) : 'players', env_version: 'release', check_path: true, width: 430 };
    const response = await post(path + '?access_token=' + encodeURIComponent(access), body);
    if (!response.ok) throw apiError();
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!isLink && imageType(bytes)) return bytes;
    let data;
    try { data = JSON.parse(bytes.toString('utf8')); } catch { throw apiError(); }
    if (!secondAttempt && [40001, 40014, 42001].includes(data.errcode)) {
      if (token?.value === access) token = null;
      return generate(kind, eventId, true);
    }
    if (isLink && typeof data.url_link === 'string') {
      let parsed;
      try { parsed = new URL(data.url_link); } catch { throw apiError(); }
      if (parsed.protocol === 'https:' && !parsed.username && !parsed.password && ['wxaurl.cn', 'wxmpurl.cn'].includes(parsed.hostname))
        return { url: parsed.href, refreshAt: now() + 27 * DAY };
    }
    throw apiError(data);
  }
  function resourceKey(kind, eventId) {
    return digest(JSON.stringify([appId, destination(eventId), eventId, kind]));
  }
  function resource(kind, eventId) {
    const key = resourceKey(kind, eventId);
    return coalesce(key, async () => {
      const file = join(cacheDir, key + (kind === 'link' ? '.json' : '.img'));
      if (existsSync(file)) {
        try {
          const bytes = readFileSync(file);
          if (kind === 'image' && imageType(bytes)) return bytes;
          if (kind === 'link') { const item = JSON.parse(bytes); if (item.refreshAt > now()) return item; }
        } catch { /* Recreate an incomplete or obsolete cache entry. */ }
      }
      if (unavailableUntil.get(key) > now()) throw apiError();
      try {
        const item = await generate(kind, eventId);
        save(file, kind === 'link' ? JSON.stringify(item) : item);
        unavailableUntil.delete(key);
        return item;
      } catch (error) {
        unavailableUntil.set(key, now() + RETRY_DELAY);
        throw error;
      }
    });
  }
  const configured = !demo && Boolean(appId && appSecret);
  async function handoff(eventId) {
    const label = eventId ? '微信报名入口' : '微信小程序入口';
    const reason = demo ? `当前为本地示例，正式${label}尚未启用。` : !configured ? `${label}尚未配置。` : null;
    if (reason) return { available: false, codeUrl: null, urlLink: null, reason };
    const [link, image] = await Promise.allSettled([resource('link', eventId), resource('image', eventId)]);
    const urlLink = link.status === 'fulfilled' ? link.value.url : null;
    const codeUrl = image.status === 'fulfilled'
      ? eventId ? '/api/community/events/' + encodeURIComponent(eventId) + '/wechat-code' : '/api/community/miniprogram/wechat-code'
      : null;
    if (urlLink || codeUrl) return { available: true, codeUrl, urlLink };
    const nextAttempt = Math.min(...['link', 'image'].map(kind =>
      unavailableUntil.get(resourceKey(kind, eventId)) ?? now() + RETRY_DELAY));
    return { available: false, codeUrl, urlLink, reason: `${label}暂时不可用，请稍后再试。`,
      retryAfterSeconds: Math.max(1, Math.ceil((nextAttempt - now()) / 1000)) };
  }
  async function code(eventId) {
    if (!configured) return null;
    try { const bytes = await resource('image', eventId); return { type: imageType(bytes), bytes }; }
    catch { return null; }
  }
  return { handoff, code };
}
