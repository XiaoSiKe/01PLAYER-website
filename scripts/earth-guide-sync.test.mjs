import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createEarthGuideHandler } from '../server/earth-guide.mjs';

const endpoint = '/site-content/earth-guide.json';
const firstRevision = '1'.repeat(40);
const secondRevision = '2'.repeat(40);
const invalidRevision = '3'.repeat(40);
const manifest = { groups: [{ id: 'reading-campus', title: '大学生活' }] };

test('discovers Markdown from one GitHub commit and keeps the last complete version', async t => {
  let revision = firstRevision;
  let now = 0;
  const requests = [];
  const versions = {
    [firstRevision]: { 'reading-campus/learning.md': '# 学习方法\n\n初版内容' },
    [secondRevision]: {
      'reading-campus/learning.md': '---\ntitle: 更新后的学习方法\norder: 20\n---\n\n新版内容',
      'reading-campus/new-article.md': '---\ntitle: 新文章\norder: 10\n---\n\n新文章内容',
    },
    [invalidRevision]: { 'reading-campus/incomplete.md': '没有可以登记的篇名' },
  };
  const serve = createEarthGuideHandler({
    now: () => now,
    fetchResource: async url => {
      requests.push(url);
      const path = new URL(url).pathname;
      if (path.endsWith('/git/ref/heads/main')) return Response.json({ object: { sha: revision } });
      if (path.includes('/git/trees/')) {
        const sha = path.split('/').at(-1);
        return Response.json({
          tree: Object.keys(versions[sha]).map(file => ({ type: 'blob', path: 'articles/' + file, mode: '100644' })),
        });
      }
      const sha = new URL(url).searchParams.get('ref');
      const file = path.split('/contents/articles/')[1];
      if (file === 'chapters.json') return Response.json(manifest);
      const entry = versions[sha]?.[file];
      return entry ? new Response(entry) : new Response(null, { status: 404 });
    },
  });
  const server = createServer((req, res) => serve(req, res, () => res.writeHead(404).end()));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}${endpoint}`;

  async function read() {
    const response = await fetch(url);
    assert.equal(response.status, 200);
    return response.json();
  }
  const results = await Promise.all([read(), read()]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0].articles.learning, versions[firstRevision]['reading-campus/learning.md']);
  assert.equal(requests.length, 4);
  assert.ok(requests.slice(1).every(url => url.includes(firstRevision)));

  revision = secondRevision;
  assert.equal((await read()).revision, firstRevision);
  now += 120_000;
  const updated = await read();
  assert.equal(updated.revision, secondRevision);
  assert.deepEqual(updated.groups[0].chapters, [
    { id: 'new-article', title: '新文章' },
    { id: 'learning', title: '更新后的学习方法' },
  ]);
  assert.equal(updated.articles['new-article'], versions[secondRevision]['reading-campus/new-article.md']);
  assert.equal((await fetch(url, { headers: { 'If-None-Match': '"' + secondRevision + '"' } })).status, 304);

  revision = invalidRevision;
  now += 120_000;
  assert.deepEqual(await read(), updated);
  assert.equal((await fetch(url, { method: 'POST' })).status, 405);
});
