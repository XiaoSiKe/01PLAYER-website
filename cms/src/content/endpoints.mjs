import { guideEndpoints, researchEndpoints } from './section-editor.mjs';
import { business, allowedRoute, isUserActivityRoute, ownerAction } from '../bridge.mjs';
import { manifest, mergeSection } from './model.mjs';
import { readPlayerDirectory } from './player-directory.mjs';
import { readSiteTraffic } from '../ops/site-traffic.mjs';
const json = (v, status = 200) =>
  Response.json(v, { status, headers: { 'Cache-Control': 'private, no-store' } });
const staff = (req) =>
  req.user?.collection === 'staff' && ['owner', 'operator'].includes(req.user.role);
const queryKeys = new Map([
  ['staff/users', ['q', 'status', 'page', 'pageSize']],
  ['staff/registrations', ['event', 'status', 'page', 'pageSize', 'summary']],
  ['staff/events', ['view']],
]);
export const endpoints = [
  ...guideEndpoints,
  ...researchEndpoints,
  {
    path: '/project-media/:filename', method: 'get',
    handler: async req => {
      if (!staff(req)) return json({error:'请登录运营后台'},403);
      const filename = req.routeParams?.filename;
      if (typeof filename !== 'string' || !/^[a-f0-9]{64}\.jpg$/.test(filename)) return json({error:'图片不存在'},404);
      try {
        const response = await business('project-media/'+filename,{signal:req.signal});
        if (!response.ok) return json({error:'图片不存在'},response.status);
        return new Response(await response.arrayBuffer(),{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
      } catch {return json({error:'暂时无法读取图片'},503);}
    },
  },
  {
    path: '/player-directory',
    method: 'get',
    handler: async (req) => {
      if (!staff(req)) return json({ error: '请登录运营后台' }, 403);
      const params = new URL(req.url).searchParams;
      const q = (params.get('q') || '').trim();
      const status = params.get('status') || 'all';
      const role = params.get('role') || 'all';
      const page = Number(params.get('page') || 1);
      if (q.length > 160 || !['all', 'active', 'disabled'].includes(status) ||
          !['all', 'admin', 'head', 'pioneer', 'player'].includes(role) || !Number.isSafeInteger(page) ||
          page < 1 || page > Math.floor(Number.MAX_SAFE_INTEGER / 20)) {
        return json({ error: '账号筛选参数无效' }, 400);
      }
      try {
        return json(await readPlayerDirectory(req, { q, status, role, page }));
      } catch {
        return json({ error: '暂时无法读取玩家名单，请重试。' }, 503);
      }
    },
  },
  {
    path: '/site-preview',
    method: 'get',
    handler: async (req) => {
      if (!staff(req)) return json({ error: '请登录后台' }, 401);
      const key = new URL(req.url).searchParams.get('key');
      const result = await req.payload.find({
        collection: 'sections',
        where: { sectionKey: { equals: key } },
        limit: 1,
        draft: true,
        req,
        overrideAccess: false,
      });
      const doc = result.docs[0];
      if (!doc) return json({ error: '栏目不存在' }, 404);
      return json(mergeSection(manifest(), key, doc.rows));
    },
  },
  {
    path: '/site-traffic',
    method: 'get',
    handler: async (req) => {
      if (!staff(req)) return json({ error: '请登录运营后台' }, 403);
      try {
        const { traffic } = await readSiteTraffic({ waitForRefresh: true });
        return json(traffic);
      } catch {
        return json({ error: '暂时无法读取访问统计' }, 503);
      }
    },
  },
  {
    path: '/work-queue',
    method: 'get',
    handler: async (req) => {
      if (!staff(req)) return json({ error: '请登录运营后台' }, 403);
      try {
        const response = await business('staff/work-queue', { signal: req.signal });
        if (!response.ok) throw Error('社区服务暂时不可用');
        return json(await response.json());
      } catch {
        return json({ error: '暂时无法读取运营待办' }, 503);
      }
    },
  },
  {
    path: '/desk',
    method: 'post',
    handler: async (req) => {
      if (!staff(req)) return json({ error: '请登录运营后台' }, 403);
      if (req.headers.get('x-01-desk') !== '1') return json({ error: '请求来源无效' }, 403);
      const input = await req.json().catch(() => null);
      if (!input || !['GET', 'POST'].includes(input.method) || !allowedRoute(input.path, input.method))
        return json({ error: '未知运营操作' }, 400);
      if (ownerAction(input.path) && req.user.role !== 'owner')
        return json({ error: '仅头号玩家可以管理官网账号状态和登录会话。' }, 403);
      const qs = new URLSearchParams();
      for (const key of isUserActivityRoute(input.path) ? ['kind', 'page'] : queryKeys.get(input.path) ?? ['event', 'status'])
        if (typeof input.query?.[key] === 'string') qs.set(key, input.query[key]);
      try {
        const r = await business(input.path, {
          method: input.method,
          body: input.method === 'POST' ? input.data : undefined,
          query: qs.toString(),
          actorId: req.user.id,
          role: req.user.role,
          signal: req.signal,
        });
        return json(await r.json(), r.status);
      } catch {
        return json({ error: '社区服务暂时不可用，请检查系统状态。' }, 503);
      }
    },
  },
  {
    path: '/health-board',
    method: 'get',
    handler: async (req) => {
      if (!staff(req)) return json({ error: '没有运维查看权限' }, 403);
      const { getOpsStatus } = await import('../ops/monitor.mjs');
      return json(await getOpsStatus());
    },
  },
  {
    path: '/media-usage/:id',
    method: 'get',
    handler: async (req) => {
      if (!staff(req)) return json({ error: '请登录后台' }, 403);
      const media = await req.payload.findByID({ collection: 'media', id: req.routeParams.id, req });
      if (!media) return json({ error: '素材不存在' }, 404);
      return json(await usage(req, media));
    },
  },
];
export async function usage(req, media) {
  const found = new Set();
  // The upload path is globally unique within this site's media collection.
  function mediaPath(v) {
    if (typeof v !== 'string') return null;
    try {
      const u = new URL(v, 'https://01player.invalid');
      return u.pathname.startsWith('/cms-api/media/file/') ? decodeURIComponent(u.pathname) : null;
    } catch {
      return null;
    }
  }
  const urls = new Set(
    [media.url, ...Object.values(media.sizes || {}).map((s) => s?.url)].map(mediaPath).filter(Boolean),
  );
  const contains = (v) =>
    typeof v === 'string'
      ? urls.has(mediaPath(v))
      : v && typeof v === 'object' && Object.values(v).some(contains);
  for (const draft of [true, false]) {
    const content = await req.payload.find({
      collection: 'sections',
      draft,
      limit: 100,
      depth: 0,
      req,
      overrideAccess: false,
    });
    for (const s of content.docs) if (contains(s.rows)) found.add(s.title);
  }
  let page = 1;
  while (true) {
    const versions = await req.payload.findVersions({
      collection: 'sections',
      page,
      limit: 75,
      depth: 0,
      req,
      overrideAccess: false,
    });
    for (const item of versions.docs)
      if (contains(item.version?.rows)) found.add((item.version.title || '网站栏目') + '（历史版本）');
    if (!versions.hasNextPage) break;
    page++;
  }
  for (const resource of ['events', 'projects', 'photos']) {
    const resp = await business('staff/' + resource);
    if (!resp.ok) throw Error('暂时无法核对活动与作品的素材引用');
    const rows = await resp.json();
    for (const row of rows) if (contains(row)) found.add(row.name || row.title);
  }
  // A public snapshot may still refer to a prior version of a draft event.
  const publicOrigin = process.env.COMMUNITY_INTERNAL_ORIGIN || 'http://127.0.0.1:5173';
  const published = await fetch(new URL('/api/community/events', publicOrigin), {
    signal: AbortSignal.timeout(3000),
  });
  if (!published.ok) throw Error('暂时无法核对已发布活动');
  for (const row of await published.json()) if (contains(row)) found.add(row.name || row.title);
  return [...found];
}
