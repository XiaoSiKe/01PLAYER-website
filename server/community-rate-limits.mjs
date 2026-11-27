import { isIP } from 'node:net';
import { fail } from './community-input.mjs';

// Production Nginx overwrites X-Real-IP and connects on the loopback interface.
export function clientAddress(req, secure) {
  const peer = req.socket.remoteAddress || 'local';
  const real = req.headers['x-real-ip'];
  const localProxy = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer);
  return secure && localProxy && typeof real === 'string' && isIP(real) ? real : peer;
}

// A venue can share one public address. Admit 100 simultaneous applicants plus
// ten retries, then refill at the former sustained rate of 35 attempts per minute.
export function createEnrollmentLimiter() {
  return tokenBucket(110, 35, '报名请求较多，请稍后再试。');
}

export function createTrafficLimiter() {
  return tokenBucket(240, 120, '访问统计请求过于频繁。');
}

function tokenBucket(capacity, perMinute, message) {
  const refillPerMs = perMinute / 60000;
  const sources = new Map();
  let nextSweep = 0;
  return function admit(address) {
    const now = Date.now();
    if (now >= nextSweep) {
      for (const [key, entry] of sources) {
        if (entry.tokens + (now - entry.at) * refillPerMs >= capacity) sources.delete(key);
      }
      nextSweep = now + 60000;
    }
    const entry = sources.get(address);
    const tokens = entry ? Math.min(capacity, entry.tokens + Math.max(0, now - entry.at) * refillPerMs) : capacity;
    if (tokens < 1) {
      const retryAfter = Math.ceil((1 - tokens) / refillPerMs / 1000);
      throw Object.assign(Error(message), { status: 429, retryAfter });
    }
    sources.set(address, { at: now, tokens: tokens - 1 });
  };
}

const tenMinutes = 10 * 60 * 1000;
export function createAuthLimiter() {
  const clients = new Map();
  let nextSweep = 0;
  function windowFor(address) {
    const now = Date.now();
    if (now >= nextSweep) {
      for (const [ip, entry] of clients) if (entry.until <= now) clients.delete(ip);
      nextSweep = now + 60000;
    }
    let entry = clients.get(address);
    if (!entry || entry.until <= now) {
      entry = { until: now + tenMinutes, accounts: new Map(), failures: 0, registrations: 0 };
      clients.set(address, entry);
    }
    return entry;
  }
  function loginWindow(address, email) {
    const entry = windowFor(address);
    if ((entry.accounts.get(email) || 0) >= 20 || entry.failures >= 100) {
      fail(429, '登录尝试过于频繁，请十分钟后重试。');
    }
    return entry;
  }
  return {
    checkLogin: loginWindow,
    finishLogin(address, email, matches) {
      const entry = loginWindow(address, email);
      const prior = entry.accounts.get(email) || 0;
      if (!matches) {
        entry.accounts.set(email, prior + 1);
        entry.failures++;
        fail(401, '账号或密码不正确。');
      }
      // A correct password clears only this account's prior mistakes on this IP.
      entry.failures -= prior;
      entry.accounts.delete(email);
    },
    checkRegistration(address) {
      const entry = windowFor(address);
      if (entry.registrations >= 20) fail(429, '注册过于频繁，请十分钟后重试。');
      return () => { entry.registrations++; };
    },
  };
}
