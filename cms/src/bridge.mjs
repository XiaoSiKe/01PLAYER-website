import { localSecret } from './env.mjs';
const patterns = [
  /^staff\/photos(?:\/[A-Za-z0-9_-]+(?:\/remove)?)?$/,
  /^staff\/events(?:\/[a-zA-Z0-9_-]+(?:\/(?:publish|archive))?)?$/,
  /^staff\/registrations(?:\/[a-zA-Z0-9_-]+\/review)?$/,
  /^staff\/projects(?:\/[a-zA-Z0-9_-]+\/review)?$/,
];
const userRead = /^staff\/users(?:\/[A-Za-z0-9_-]+)?$/;
const userAction = /^staff\/users\/[A-Za-z0-9_-]+\/(?:disable|restore|revoke-sessions)$/;
export function allowedRoute(path, method = 'GET') {
  if (typeof path !== 'string') return false;
  if (/^staff\/events\/[A-Za-z0-9_-]+\/pin$/.test(path)) return method === 'POST';
  if (['staff/work-queue', 'staff/traffic'].includes(path) || userRead.test(path)) return method === 'GET';
  if (userAction.test(path)) return method === 'POST';
  return patterns.some((re) => re.test(path));
}
export function ownerAction(path) {
  return userAction.test(path);
}
export async function business(path, { method = 'GET', body, query, actorId = 'operator', role = 'operator', signal } = {}) {
  if (!allowedRoute(path, method)) throw Error('未知运营请求');
  if (ownerAction(path) && role !== 'owner') throw Error('需要站点负责人权限');
  const base = process.env.COMMUNITY_INTERNAL_ORIGIN || 'http://127.0.0.1:5173';
  const url = new URL('/api/community/' + path, base);
  if (query) url.search = query;
  const timeout = AbortSignal.timeout(8000);
  return fetch(url, {
    method,
    cache: 'no-store',
    redirect: 'error',
    signal: method === 'GET' && signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: {
      'Content-Type': 'application/json',
      'x-community-request': '1',
      'x-01-staff-role':
        role === 'owner' && (userRead.test(path) || userAction.test(path)) ? 'owner' : 'operator',
      'x-01-staff-id': String(actorId),
      'x-01-staff-secret': localSecret('bridge.key', 'COMMUNITY_STAFF_BRIDGE_SECRET'),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
