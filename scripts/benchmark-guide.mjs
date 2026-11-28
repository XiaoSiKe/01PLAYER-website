// A published guide near the supported content size, served from disposable data.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { createEarthGuideHandler } from '../server/earth-guide.mjs';

const directory = await mkdtemp(join(tmpdir(), '01player-guide-benchmark-'));
const manifestFile = join(directory, 'manifest.json');
const rows = [{ id: 'reading-benchmark', title: '攻略性能样本', chapters: Array.from({ length: 60 }, (_, i) => ({
  id: 'chapter-' + i, title: '文章 ' + i, body: 'Markdown content. '.repeat(2800),
  author: '测试作者', university: '测试大学', uploadedAt: '2026-11-28',
})) }];
await writeFile(manifestFile, JSON.stringify({ sections: { earthGuide: rows } }));
const handler = createEarthGuideHandler({ manifestFile });
const server = createServer((req, res) => handler(req, res, () => res.writeHead(404).end()));
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/site-content/earth-guide.json';
  const first = await fetch(url), tag = first.headers.get('etag');
  const content = await first.json();
  assert.equal(Object.keys(content.articles).length, 60);
  const timings = [];
  for (let i = 0; i < 100; i++) {
    const start = performance.now();
    const response = await fetch(url, { headers: { 'If-None-Match': tag } });
    assert.equal(response.status, 304);
    assert.equal(response.headers.get('etag'), tag);
    await response.arrayBuffer();
    if (i >= 10) timings.push(performance.now() - start);
  }
  timings.sort((a, b) => a - b);
  console.log(JSON.stringify({ articles: 60, bodyBytes: Buffer.byteLength(rows[0].chapters[0].body) * 60,
    samples: timings.length, conditionalP50Ms: +timings[45].toFixed(2),
    conditionalP95Ms: +timings[Math.floor(timings.length * .95)].toFixed(2), revision: content.revision }));
} finally {
  await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
