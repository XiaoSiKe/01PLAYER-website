import { randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const freshSalt = () => randomBytes(16).toString('hex');

// The synchronous factory writes brand-new seed accounts before accepting requests.
export function initialPasswordHash(password) {
  const salt = freshSalt();
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}

export async function passwordHash(password) {
  const salt = freshSalt();
  return salt + ':' + (await derive(password, salt, 64)).toString('hex');
}

export async function passwordMatches(password, stored) {
  const [salt, digest] = typeof stored === 'string' ? stored.split(':') : [];
  if (!salt || !/^[a-f0-9]{128}$/i.test(digest)) return false;
  return timingSafeEqual(await derive(password, salt, 64), Buffer.from(digest, 'hex'));
}

export function createPasswordQueue({ concurrency = 2, maxWaiting = 16 } = {}) {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || !Number.isSafeInteger(maxWaiting) || maxWaiting < 0) {
    throw Error('密码计算并发数或等候数无效。');
  }
  let active = 0;
  const waiting = [];
  return async function run(work) {
    if (active < concurrency) active++;
    else {
      if (waiting.length >= maxWaiting) {
        throw Object.assign(new Error('账号服务正在处理其他请求，请稍后重试。'), { status: 503, retryAfter: 1 });
      }
      await new Promise(resolve => waiting.push(resolve));
    }
    try {
      return await work();
    } finally {
      // Hand the same active slot directly to the oldest waiter.
      const resume = waiting.shift();
      if (resume) resume();
      else active--;
    }
  };
}

export const runPasswordWork = createPasswordQueue();
