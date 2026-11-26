#!/usr/bin/env node
// Anonymous, read-only checks for the public website and its two business services.
import { pathToFileURL } from 'node:url';

function fail(path, message) { throw Error(path + ' — ' + message); }

async function read(url, statuses = [200]) {
  let response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(10000), redirect: 'manual', headers: { 'Cache-Control': 'no-cache' }
    });
  } catch (error) {
    fail(url.pathname, '请求失败：' + error.message);
  }
  if (!statuses.includes(response.status)) {
    await response.body?.cancel();
    fail(url.pathname, 'HTTP ' + response.status);
  }
  return response;
}

function mime(response) {
  return (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
}

async function readJSON(origin, path, statuses) {
  const response = await read(new URL(path, origin), statuses);
  const type = mime(response);
  if (type !== 'application/json' && !type.endsWith('+json')) {
    await response.body?.cancel();
    fail(path, '应返回 JSON，实际类型为 ' + (type || '未设置'));
  }
  try { return await response.json(); }
  catch { fail(path, '响应不是有效 JSON'); }
}

// Next can send an HTTP redirect before streaming starts, or encode it in a streamed HTML page.
function streamedRedirect(html) {
  const refresh = (html.match(/<meta\b[^>]+>/gi) || []).find(tag => /\bhttp-equiv=["']refresh["']/i.test(tag));
  return refresh?.match(/\bcontent=["'][^"']*?\burl\s*=\s*([^"']+)/i)?.[1]
    || html.match(/NEXT_REDIRECT;(?:replace|push);([^;\s"\\<>]+);(?:303|307|308);/)?.[1];
}

function assetURL(html, page, kind) {
  const tags = html.match(kind === 'js' ? /<script\b[^>]*>/gi : /<link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if (kind === 'css' && !/\brel=["']stylesheet["']/i.test(tag)) continue;
    const source = tag.match(kind === 'js' ? /\ssrc=["']([^"']+)["']/i : /\shref=["']([^"']+)["']/i)?.[1];
    if (!source) continue;
    const url = new URL(source.replaceAll('&amp;', '&'), page);
    if (url.origin === page.origin && !url.username && !url.password &&
        url.pathname.startsWith('/_next/static/') && url.pathname.endsWith('.' + kind)) return url;
  }
  fail(page.pathname, '运营登录页缺少同源 Next.js .' + kind + ' 资源');
}

async function checkAsset(url, kind) {
  const response = await read(url);
  const type = mime(response);
  const correctType = kind === 'css' ? type === 'text/css' : /^(application|text)\/(javascript|ecmascript|x-javascript)$/.test(type);
  if (!correctType) {
    await response.body?.cancel();
    fail(url.pathname, '应返回 ' + kind.toUpperCase() + '，实际类型为 ' + (type || '未设置'));
  }
  const reader = response.body?.getReader();
  const chunk = await reader?.read();
  await reader?.cancel();
  if (!chunk?.value?.length || /^\s*</.test(new TextDecoder().decode(chunk.value.subarray(0, 256)))) {
    fail(url.pathname, '资源为空或返回了 HTML');
  }
}

const redirects = [301, 302, 303, 307, 308];
async function checkAdmin(origin) {
  let page = new URL('/admin', origin);
  const visited = new Set();
  while (visited.size < 8) {
    if (visited.has(page.href)) fail(page.pathname, '运营后台跳转循环');
    visited.add(page.href);
    const response = await read(page, [200, ...redirects]);
    let destination;
    if (response.status !== 200) {
      await response.body?.cancel();
      destination = response.headers.get('location');
      if (!destination) fail(page.pathname, '后台跳转缺少 Location');
    } else {
      if (mime(response) !== 'text/html') {
        await response.body?.cancel();
        fail(page.pathname, '运营后台应返回 HTML 登录页');
      }
      const html = await response.text();
      destination = streamedRedirect(html);
      if (!destination) {
        if (!/<title\b[^>]*>[^<]*(?:登录|登錄|log\s*in|sign\s*in)/i.test(html) ||
            !/(?:data-staff-login|LoginForm|login__form|type=["']password["'])/i.test(html)) {
          fail(page.pathname, '没有返回运营登录页');
        }
        await checkAsset(assetURL(html, page, 'js'), 'js');
        await checkAsset(assetURL(html, page, 'css'), 'css');
        return;
      }
    }
    const next = new URL(destination.replaceAll('&amp;', '&'), page);
    if (next.origin !== origin.origin || next.username || next.password || !/^\/admin(?:\/|$)/.test(next.pathname)) {
      fail(page.pathname, '跳转离开了同源 /admin 范围');
    }
    page = next;
  }
  fail(page.pathname, '运营后台跳转次数过多');
}

async function checkCommunity(origin, requireProduction) {
  const health = await readJSON(origin, '/api/community/health');
  if (health?.service !== '01player-community' || health.status !== 'ok') fail('/api/community/health', '社区服务未就绪');
  if (requireProduction && health.demo !== false) fail('/api/community/health', '未确认正式业务模式');
  if (!Array.isArray(await readJSON(origin, '/api/community/events'))) fail('/api/community/events', '活动目录响应无效');
  const manifest = await readJSON(origin, '/site-content/manifest.json');
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) fail('/site-content/manifest.json', '发布快照响应无效');
}

async function checkCms(origin) {
  await checkAdmin(origin);
  const denial = await readJSON(origin, '/cms-api/health-board', [401, 403]);
  if (typeof denial?.error !== 'string' && !Array.isArray(denial?.errors)) fail('/cms-api/health-board', '缺少后台匿名访问的 JSON 错误');
}

async function checkAll(probes) {
  const failures = (await Promise.allSettled(probes)).filter(result => result.status === 'rejected');
  if (failures.length) throw Error(failures.map(result => result.reason.message).join('\n'));
}

export async function checkBusinessRoutes(origin, { requireProduction = false } = {}) {
  await checkAll([checkCommunity(origin, requireProduction), checkCms(new URL(origin))]);
}

async function checkStatic(origin, expectedCommit, requireProduction) {
  const home = await read(new URL('/', origin));
  if (!(await home.text()).includes('01PLAYER')) fail('/', '首页品牌标识缺失');
  const version = await readJSON(origin, '/version.json');
  if (!/^[a-f0-9]{40}$/.test(version?.commit) || (expectedCommit && version.commit !== expectedCommit)) {
    fail('/version.json', '静态制品提交号无效或与预期版本不匹配');
  }
  if (requireProduction && version.source === 'working-tree-snapshot') fail('/version.json', '制品来自本地工作区快照');
}

export async function checkOperationsSite(address, { expectedCommit, requireProduction = false } = {}) {
  const origin = new URL(address);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) {
    throw Error('需要不含凭据的 HTTP(S) 站点地址。');
  }
  await checkAll([checkStatic(origin, expectedCommit, requireProduction), checkBusinessRoutes(origin, { requireProduction })]);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    await checkOperationsSite(process.argv[2] || 'http://127.0.0.1:5173', {
      expectedCommit: process.argv[3], requireProduction: process.env.REQUIRE_PRODUCTION === '1',
    });
    console.log('官网、版本、活动目录、持久服务、公开快照、运营登录页及后台访问权限均正常。');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
