import { createHash } from 'node:crypto';
import { validateGuide } from '../../../server/guide-content.mjs';
import { validateRows } from './rules.mjs';
const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
const staff = req => req.user?.collection === 'staff' && ['owner', 'operator'].includes(req.user.role);
const revision = doc => createHash('sha256').update(JSON.stringify([doc.rows, doc._status, doc.updatedAt])).digest('hex');
const result = doc => ({ rows: doc.rows, revision: revision(doc), status: doc._status, updatedAt: doc.updatedAt });
function sectionEndpoints(path, sectionKey, validate, label) {
  async function current(req) {
    const found = await req.payload.find({ collection: 'sections', where: { sectionKey: { equals: sectionKey } },
      limit: 1, draft: true, depth: 0, req, overrideAccess: false });
    if (!found.docs[0]) throw Error(label + '栏目尚未初始化，请重启运营后台。');
    return found.docs[0];
  }
  // Each section serializes revision checks and writes within the CMS process.
  let saving = Promise.resolve();
  return [
  { path, method: 'get', handler: async req => {
    if (!staff(req)) return json({ error: '请登录运营后台' }, 403);
    return json(result(await current(req)));
  } },
  { path, method: 'post', handler: async req => {
    if (!staff(req)) return json({ error: '请登录运营后台' }, 403);
    if (req.headers.get('x-01-desk') !== '1') return json({ error: '请求来源无效' }, 403);
    const input = await req.json().catch(() => null);
    if (!input || !['draft', 'published'].includes(input.status) || typeof input.revision !== 'string')
      return json({ error: label + '保存参数无效。' }, 400);
    const valid = validate(input.rows);
    if (valid !== true) return json({ error: valid }, 400);
    const pending = saving.then(async () => {
      const doc = await current(req);
      if (revision(doc) !== input.revision) return json({ error: label + '已有更新，请先重新加载。当前未保存内容仍保留在编辑器中。' }, 409);
      const updated = await req.payload.update({ collection: 'sections', id: doc.id, data: { rows: input.rows, _status: input.status },
        draft: input.status === 'draft', req, overrideAccess: false });
      return json(result(updated));
    });
    saving = pending.catch(() => {});
    return pending;
  } },
  ];
}
export const guideEndpoints = sectionEndpoints('/guide', 'earthGuide', validateGuide, '攻略');
export const researchEndpoints = sectionEndpoints('/research', 'competitionItems', rows => validateRows(rows, 'competitionItems'), '科研与竞赛');
