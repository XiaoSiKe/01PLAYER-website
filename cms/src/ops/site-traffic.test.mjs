import assert from 'node:assert/strict';
import test from 'node:test';
import { createTrafficReader } from './site-traffic.mjs';

test('same-day statistics render from cache during a shared background refresh', async () => {
  let now = Date.parse('2026-11-27T12:00:00Z');
  let calls = 0;
  let complete;
  const read = createTrafficReader(() => {
    calls++;
    return new Promise(resolve => { complete = resolve; });
  }, () => now);
  const cold = read();
  const concurrent = read();
  await Promise.resolve();
  assert.equal(calls, 1);
  const traffic = { today: { day: '2026-11-27', views: 10 }, trend: [{}], popular: [] };
  complete(traffic);
  assert.equal((await cold).traffic, traffic);
  assert.equal((await concurrent).traffic, traffic);
  assert.deepEqual(read(), { traffic, refreshing: false });
  now += 46_000;
  assert.deepEqual(read(), { traffic, refreshing: true });
  const api = read({ waitForRefresh: true });
  await Promise.resolve();
  assert.equal(calls, 2);
  const latest = { ...traffic, today: { ...traffic.today, views: 12 } };
  complete(latest);
  assert.equal((await api).traffic, latest);
});

test('refresh failure keeps a recent sample, but never passes yesterday as today', async () => {
  let now = Date.parse('2026-11-27T15:50:00Z');
  const traffic = { today: { day: '2026-11-27', views: 10 }, trend: [{}], popular: [] };
  let available = true;
  const read = createTrafficReader(() => {
    if (!available) throw Error('offline');
    return traffic;
  }, () => now);
  assert.equal((await read()).traffic, traffic);
  available = false;
  now += 46_000;
  assert.equal((await read({ waitForRefresh: true })).traffic, traffic);
  now += 10 * 60_000;
  await assert.rejects(read(), /offline/);
});
