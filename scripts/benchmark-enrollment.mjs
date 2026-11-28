// Independent one-shot enrollment bursts against a disposable, loopback-only origin.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { Agent, createServer, request } from 'node:http';
import { once } from 'node:events';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { createCommunityApi } from '../server/community-api.mjs';
import { registrationFile } from '../server/community-registrations.mjs';
import { receiptToken } from '../server/player-events.mjs';
import { startRegistrationProxy } from './local-registration-proxy.mjs';

const eventId = 'enrollment-benchmark';
const endpoint = '/api/community/events/' + eventId + '/registrations';
const history = 10000;

function seed(file) {
  const event = { id: eventId, name: '测试报名', status: 'open', publicationStatus: 'published', registrationMode: 'review',
    formFields: [{ id: 'track', type: 'select', label: '方向', required: true, options: ['设计', '开发'] }] };
  const registrations = Array.from({ length: history }, (_, i) => ({
    id: 'history-' + i, eventId, name: '历史样本', contact: 'history-' + i + '@example.test', status: 'approved',
    answers: { track: '设计' }, formFields: event.formFields, source: 'website',
  }));
  writeFileSync(file, JSON.stringify({ version: 1, instanceId: randomUUID(), demo: false, users: [], sessions: [],
    events: [event], registrations, projects: [], reactions: [], recruitments: [] }), { mode: 0o600 });
  createCommunityApi({ dataFile: file, secure: true, demo: false, eventsFile: null }).close();
}

function serveFixture(file) {
  const api = createCommunityApi({ dataFile: file, secure: true, demo: false, eventsFile: null });
  const server = createServer((req, res) => api(req, res, () => { res.writeHead(204); res.end(); }));
  server.listen(0, '127.0.0.1', () => parentPort.postMessage(server.address().port));
  parentPort.once('message', () => server.close(() => { api.close(); parentPort.close(); }));
}

async function startFixture(file) {
  const worker = new Worker(new URL(import.meta.url), { workerData: file });
  const [port] = await once(worker, 'message');
  return { port, origin: 'http://127.0.0.1:' + port, stop: async () => {
    const exited = once(worker, 'exit');
    worker.postMessage('stop');
    const [code] = await exited;
    assert.equal(code, 0);
  } };
}

function visit(origin, path, agent, body) {
  return new Promise((resolve, reject) => {
    const post = body !== undefined;
    const req = request(origin + path, { method: post ? 'POST' : 'GET', agent,
      headers: post ? { 'Content-Type': 'application/json' } : {}, signal: AbortSignal.timeout(15000) }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString();
          resolve({ status: res.statusCode, data: raw ? JSON.parse(raw) : null, reused: req.reusedSocket });
        } catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    req.end(post ? JSON.stringify(body) : undefined);
  });
}

function application(i) {
  return { name: '报名样本 ' + i, contact: 'attendee-' + i + '@example.test', note: '现场活动',
    answers: { track: i % 2 ? '开发' : '设计' }, idempotencyKey: randomUUID() };
}

function percentile(sorted, fraction) {
  if (!sorted.length) return null;
  return Math.round(sorted[Math.ceil(sorted.length * fraction) - 1] * 10) / 10;
}

function statusCounts(rows) {
  const counts = {};
  for (const row of rows) counts[row.status] = (counts[row.status] || 0) + 1;
  return counts;
}

async function readApprovedPage(business) {
  const query = new URLSearchParams({ event: eventId, status: 'approved', page: '2', pageSize: '20' });
  const start = performance.now();
  const response = await business('staff/registrations', { query: query.toString(), actorId: 'benchmark-operator' });
  assert.equal(response.status, 200);
  const result = await response.json();
  const ms = Math.round((performance.now() - start) * 10) / 10;
  assert.equal(result.total, history);
  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 20);
  assert.equal(result.items.length, 20);
  assert.equal(new Set(result.items.map(row => row.id)).size, 20);
  assert.ok(result.items.every(row => row.status === 'approved' && row.eventId === eventId));
  return { status: response.status, total: result.total, page: result.page, rows: result.items.length, ms };
}

async function verifyReceipts(file, success) {
  const state = JSON.parse(readFileSync(file, 'utf8'));
  const db = new DatabaseSync(registrationFile(file), { readOnly: true });
  try {
    assert.equal(db.prepare('SELECT count(*) AS n FROM registrations').get().n, history + success.length);
    assert.equal(new Set(success.map(r => r.data.id)).size, success.length);
    const byId = db.prepare('SELECT body FROM registrations WHERE id=?');
    for (const { body, data } of success) {
      const row = JSON.parse(byId.get(data.id).body);
      assert.equal(row.contact, body.contact);
      assert.equal(row.keyDigest, createHash('sha256').update(body.idempotencyKey).digest('hex'));
      assert.deepEqual(row.answers, body.answers);
      assert.equal(row.status, 'pending');
      assert.equal(data.eventId, eventId);
      assert.equal(receiptToken(state, row), data.receiptToken);
    }
  } finally { db.close(); }

  const restarted = await startFixture(file);
  try {
    for (const { data } of success) {
      const receipt = await visit(restarted.origin, '/api/community/registration-status', undefined,
        { id: data.id, receiptToken: data.receiptToken });
      assert.equal(receipt.status, 200);
      assert.equal(receipt.data.id, data.id);
      assert.equal(receipt.data.status, 'pending');
    }
    if (success.length) {
      const replay = await visit(restarted.origin, endpoint, undefined, success[0].body);
      assert.equal(replay.status, 200);
      assert.deepEqual(replay.data, success[0].data);
    }
  } finally { await restarted.stop(); }
}

async function trial(file, route, users) {
  const app = await startFixture(file);
  const agents = Array.from({ length: users }, () => new Agent({ keepAlive: true, maxSockets: 1 }));
  let edge, wave, elapsed, zones;
  try {
    if (route === 'nginx') edge = await startRegistrationProxy(app.port);
    const origin = edge?.origin || app.origin;
    await Promise.all(agents.map(agent => visit(origin, '/_benchmark_ready', agent)));
    const forms = agents.map((_, i) => application(i));
    const start = performance.now();
    wave = await Promise.all(agents.map(async (agent, i) => {
      try {
        const response = await visit(origin, endpoint, agent, forms[i]);
        return { ...response, body: forms[i], ms: performance.now() - start };
      } catch (error) { return { status: 'transport-error', error: error.message, ms: performance.now() - start }; }
    }));
    elapsed = performance.now() - start;
    zones = edge ? await edge.rejectionZones() : {};
  } finally {
    for (const agent of agents) agent.destroy();
    try { if (edge) await edge.stop(); } finally { await app.stop(); }
  }
  const success = wave.filter(row => row.status === 200);
  await verifyReceipts(file, success);
  const latency = success.map(row => row.ms).sort((a, b) => a - b);
  const statuses = statusCounts(wave);
  return { route, users, statuses, zones, verified: success.length, p50: percentile(latency, .50),
    p95: percentile(latency, .95), lastMs: Math.round(elapsed), warmSockets: wave.filter(r => r.reused).length };
}

async function journey(file, users) {
  const app = await startFixture(file);
  const people = Array.from({ length: users }, (_, i) => ({
    i, agent: new Agent({ keepAlive: true, maxSockets: 1 }), body: application(i),
  }));
  const phases = {};
  let edge, enrolled, completed, staffPage;
  try {
    process.env.COMMUNITY_INTERNAL_ORIGIN = app.origin;
    const { business } = await import('../cms/src/bridge.mjs');
    edge = await startRegistrationProxy(app.port);
    const origin = edge.origin;
    let previousZones = {};
    async function step(name, participants, send) {
      const results = await Promise.all(participants.map(async person => {
        try { return { ...person, ...await send(person) }; }
        catch (error) { return { ...person, status: 'transport-error', error: error.message }; }
      }));
      const currentZones = await edge.rejectionZones();
      const zones = {};
      for (const [zone, total] of Object.entries(currentZones)) {
        const added = total - (previousZones[zone] || 0);
        if (added) zones[zone] = added;
      }
      previousZones = currentZones;
      phases[name] = { attempted: participants.length, statuses: statusCounts(results), zones };
      return results.filter(row => row.status === 200);
    }

    const detail = '/api/community/events/' + eventId;
    const opened = await step('open', people, p => visit(origin, detail, p.agent));
    for (const { data } of opened) {
      assert.equal(data.id, eventId);
      assert.equal(data.registrationOpen, true);
    }
    const submit = person => visit(origin, endpoint, person.agent, person.body);
    const first = opened[0];
    const firstReply = first ? submit(first) : Promise.resolve();
    // The staff request uses the CMS loopback bridge while NGINX paces the remaining public writes.
    [enrolled, staffPage] = await Promise.all([
      step('submit', opened, person => person === first ? firstReply : submit(person)),
      firstReply.then(() => readApprovedPage(business)),
    ]);
    const credentials = enrolled.map(({ agent, data }) => ({ agent, id: data.id, receiptToken: data.receiptToken }));
    const receipts = await step('receipt', credentials, p => visit(origin, '/api/community/registration-status', p.agent,
      { id: p.id, receiptToken: p.receiptToken }));
    for (const { id, data } of receipts) {
      assert.equal(data.id, id);
      assert.equal(data.eventId, eventId);
      assert.equal(data.status, 'pending');
    }
    completed = receipts.length;
  } finally {
    for (const { agent } of people) agent.destroy();
    try { if (edge) await edge.stop(); } finally { await app.stop(); }
  }
  await verifyReceipts(file, enrolled);
  return { route: 'nginx-journey', users, phases, staffPage, completed, verified: enrolled.length };
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), '01player-signups-'));
  try {
    process.env.CLUB_CMS_DATA = join(dir, 'cms');
    process.env.COMMUNITY_STAFF_BRIDGE_SECRET = randomUUID();
    const template = join(dir, 'template.json');
    seed(template);
    let rejected = false;
    for (const users of [10, 25, 50, 75, 100]) {
      for (const route of ['direct', 'nginx']) {
        const file = join(dir, route + '-' + users + '.json');
        copyFileSync(template, file);
        copyFileSync(registrationFile(template), registrationFile(file));
        const result = await trial(file, route, users);
        console.log(JSON.stringify(result));
        if (result.verified !== users) rejected = true;
      }
    }
    const result = await journey(template, 100);
    console.log(JSON.stringify(result));
    if (rejected || result.completed !== result.users) process.exitCode = 1;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

if (isMainThread) await main();
else serveFixture(workerData);
