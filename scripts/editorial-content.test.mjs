import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rename, rm, utimes, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { mergeCatalogDefaults, validateRows } from '../cms/src/content/rules.mjs';
import { siteAsset, siteRows } from '../src/editorial/content.js';
import { sharedPortrait, memberPortraits } from '../src/data/member-portraits.js';
import { serveEditorial } from '../server/editorial-snapshot.mjs';

const catalog = JSON.parse(readFileSync(new URL('../cms/src/content/catalog.json', import.meta.url)));
const rowsOf = key => catalog.find(section => section.key === key).rows;

test('all seeded sections can be edited and published without losing original content', () => {
  for (const section of catalog) {
    assert.equal(validateRows(section.rows, section.key, section.rows), true, section.key);
    assert.deepEqual(mergeCatalogDefaults(section.key, section.rows, section.rows), section.rows);
  }
});

test('upgrades retain old menu IDs, operator order and removal of list entries', () => {
  const [first, second] = rowsOf('menu');
  const old = [{ ...second, id: undefined, link: '/new-route' }, first];
  delete old[0].id;
  const result = mergeCatalogDefaults('menu', old, rowsOf('menu'));
  assert.deepEqual(result.map(row => row.id), [second.id,first.id]);
  assert.equal(result[0].link, '/new-route');
  assert.deepEqual(mergeCatalogDefaults('menu', [], rowsOf('menu')), []);
});

test('fixed slots retain customized URLs while adding newly introduced assets', () => {
  const defaults = rowsOf('siteAssets');
  const current = [{ ...defaults.at(-1), url: '/media/custom.png' }];
  const merged = mergeCatalogDefaults('siteAssets', current, defaults);
  assert.equal(merged.length, defaults.length);
  assert.deepEqual(merged[0], current[0]);
  assert.notEqual(validateRows([{id:'unknown',url:'/fake.png'}], 'siteAssets', defaults), true);
});

test('invalid links and malformed nested content cannot be saved', () => {
  assert.notEqual(validateRows([{id:'example',title:'资源',href:'javascript:void(0)'}], 'learningFolderItems'), true);
  assert.notEqual(validateRows([{id:'example',name:'项目',features:['lost detail']}], 'projects'), true);
  assert.notEqual(validateRows([{id:'event',title:'活动',src:'//elsewhere.example/a.jpg'}], 'activityPhotos'), true);
});

test('a published member portrait reaches related entries while preserving local overrides', t => {
  const stock = memberPortraits.Miracle;
  const custom = '/cms-api/media/file/new-portrait.webp';
  globalThis.__clubContent = { sections: { pioneers: [{id:'miracle-fjnu',name:'Miracle',photo:custom}] } };
  t.after(() => { delete globalThis.__clubContent; });
  assert.equal(sharedPortrait('Miracle', 'miracle-fjnu', stock), custom);
  assert.equal(sharedPortrait('Miracle', 'miracle-fjnu', '/department/photo.jpg'), '/department/photo.jpg');
  assert.equal(siteRows('pioneers', [{id:'miracle-fjnu',photo:stock,photoPlaceholder:true}])[0].photoPlaceholder, false);
  assert.equal(siteAsset('join-qq','/assets/original.png'), '/assets/original.png');
});

test('public manifest revalidates immediately across equal-size atomic publishes, removal and recovery', async t => {
  const dir = await mkdtemp(join(tmpdir(), '01player-manifest-'));
  const prior = process.env.CLUB_CMS_DATA;
  process.env.CLUB_CMS_DATA = dir;
  const server = createServer((req, res) => serveEditorial(req, res, () => { res.statusCode = 404; res.end(); }));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    if (prior === undefined) delete process.env.CLUB_CMS_DATA;
    else process.env.CLUB_CMS_DATA = prior;
    await rm(dir, { recursive: true, force: true });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/site-content/manifest.json';
  const target = join(dir, 'manifest.json');
  async function publish(letter) {
    const file = join(dir, 'next.json');
    await writeFile(file, JSON.stringify({ sections: { a: letter } }));
    await utimes(file, 1700000000, 1700000000);
    await rename(file, target);
  }
  const missing = await fetch(url);
  assert.deepEqual(await missing.json(), {});
  await publish('A');
  const first = await fetch(url, { headers: { 'If-None-Match': missing.headers.get('etag') } });
  assert.equal((await first.json()).sections.a, 'A');
  const tag = first.headers.get('etag');
  const same = await fetch(url, { headers: { 'If-None-Match': '"another-tag", W/' + tag } });
  assert.equal(same.status, 304);
  assert.equal(await same.text(), '');
  assert.equal(same.headers.get('etag'), tag);
  await publish('B');
  const updated = await Promise.all(Array.from({ length: 6 }, () => fetch(url, { headers: { 'If-None-Match': tag } })));
  for (const response of updated) {
    assert.notEqual(response.headers.get('etag'), tag);
    assert.equal((await response.json()).sections.a, 'B');
  }
  const head = await fetch(url, { method: 'HEAD' });
  assert.equal(head.headers.get('etag'), updated[0].headers.get('etag'));
  assert.ok(Number(head.headers.get('content-length')) > 0);
  assert.equal(await head.text(), '');
  await rm(target);
  assert.deepEqual(await (await fetch(url)).json(), {});
  await mkdir(target);
  assert.equal((await fetch(url)).status, 503);
  await rm(target, { recursive: true });
  await publish('C');
  assert.equal((await (await fetch(url)).json()).sections.a, 'C');
});
