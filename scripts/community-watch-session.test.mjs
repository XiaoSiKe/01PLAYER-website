import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { watchSession } from '../src/community/account/watchSession.js';

test('identity checks poll only foreground protected pages, deduplicate focus and detect revocation', async (t) => {
  const user = { id: 'example', name: '玩家', role: 'member', email: 'member@example.test' };
  const page = new EventTarget(),
    document = new EventTarget();
  const prior = new Map(
    ['window', 'document', 'fetch'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  let focused = true,
    current = user,
    reads = 0;
  Object.assign(document, { hidden: false, hasFocus: () => focused });
  Object.assign(globalThis, {
    window: page,
    document,
    fetch: async () => {
      reads++;
      return Response.json({ user: current });
    },
  });
  t.after(() => {
    for (const [key, desc] of prior) {
      if (desc) Object.defineProperty(globalThis, key, desc);
      else delete globalThis[key];
    }
  });
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 100000 });
  let changed;
  let clean = watchSession(user, false, (session) => {
    changed = session;
  });
  t.mock.timers.tick(31000);
  await setImmediate();
  assert.equal(reads, 0);
  clean();
  clean = watchSession(null, true, (session) => {
    changed = session;
  });
  t.mock.timers.tick(31000);
  await setImmediate();
  assert.equal(reads, 0);
  clean();
  clean = watchSession(user, true, (session) => {
    changed = session;
  });
  focused = false;
  page.dispatchEvent(new Event('blur'));
  t.mock.timers.tick(60000);
  await setImmediate();
  assert.equal(reads, 0);
  focused = true;
  page.dispatchEvent(new Event('focus'));
  document.dispatchEvent(new Event('visibilitychange'));
  await setImmediate();
  assert.equal(reads, 1);
  assert.equal(changed, undefined);
  current = null;
  t.mock.timers.tick(30000);
  await setImmediate();
  assert.equal(reads, 2);
  assert.equal(changed.user, null);
  clean();
});
