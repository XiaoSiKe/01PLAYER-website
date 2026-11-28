import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { createEarthGuideHandler } from '../server/earth-guide.mjs';
import { validateGuide } from '../server/guide-content.mjs';
const group = () => [{ id: 'reading-campus', title: '大学生活', chapters: [
  { id: 'learning', title: '学习方法', body: '## 开始\n\n内容', author: '作者', university: '大学', uploadedAt: '2026-11-27' },
] }];
test('website guide reads only CMS publications, revalidates atomic updates and clears removals', async t => {
  const directory = await mkdtemp(join(tmpdir(), '01player-guide-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifestFile = join(directory, 'manifest.json');
  const publish = async rows => { await writeFile(manifestFile + '.tmp', JSON.stringify({ sections: { earthGuide: rows } })); await rename(manifestFile + '.tmp', manifestFile); };
  const serve = createEarthGuideHandler({ manifestFile });
  const server = createServer((req, res) => serve(req, res, () => res.writeHead(404).end()));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/site-content/earth-guide.json`;
  assert.deepEqual((await (await fetch(url)).json()).groups, []);
  await publish(group());
  const first = await fetch(url), etag = first.headers.get('etag'), initial = await first.json();
  assert.equal(initial.articles.learning.author, '作者');
  assert.equal(initial.groups[0].chapters[0].title, '学习方法');
  assert.equal((await fetch(url, { headers: { 'If-None-Match': 'W/' + etag } })).status, 304);
  assert.equal((await fetch(url, { method: 'HEAD' })).status, 200);
  assert.equal((await fetch(url, { method: 'POST' })).status, 405);
  const changed = group(); changed[0].chapters[0].body = '更新正文'; await publish(changed);
  const updated = await (await fetch(url)).json();
  assert.notEqual(initial.revision, updated.revision);
  assert.equal(updated.articles.learning.body, '更新正文');
  await publish([]);
  assert.deepEqual((await (await fetch(url)).json()).articles, {});
  await publish([{ id: 'broken' }]);
  assert.equal((await fetch(url)).status, 503);
  assert.equal((await fetch(url, { headers: { 'If-None-Match': etag } })).status, 503,
    'a cached valid guide must not hide an invalid newer publication');
  await publish(group());
  assert.equal((await fetch(url)).status, 200);
});
test('guide validates stable links, metadata, dates, duplicates and Markdown size', () => {
  assert.equal(validateGuide(group()), true);
  const badDate = group(); badDate[0].chapters[0].uploadedAt = '2026-02-30'; assert.notEqual(validateGuide(badDate), true);
  const duplicate = group(); duplicate[0].chapters.push(duplicate[0].chapters[0]); assert.notEqual(validateGuide(duplicate), true);
  const tooLarge = group(); tooLarge[0].chapters[0].body = '文'.repeat(50000); assert.notEqual(validateGuide(tooLarge), true);
  assert.equal(validateGuide([]), true);
});
