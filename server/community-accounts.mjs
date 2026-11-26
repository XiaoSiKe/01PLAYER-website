import { createHash } from 'node:crypto';
import { fail, positiveInteger, text } from './community-input.mjs';
import { AVATAR_DATA_LIMIT, AVATAR_EDGE } from '../src/community/account/profile.js';

function isAvatarJpeg(bytes) {
  if (bytes.length < 8 || bytes.readUInt16BE(0) !== 0xffd8 ||
      bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) return false;
  for (let offset = 2; offset + 4 <= bytes.length && bytes[offset] === 0xff;) {
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (marker === 0xda || marker === 0xd9 || length < 2 || offset + 2 + length > bytes.length) return false;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      return length >= 8 && bytes.readUInt16BE(offset + 5) === AVATAR_EDGE &&
        bytes.readUInt16BE(offset + 7) === AVATAR_EDGE;
    }
    offset += 2 + length;
  }
  return false;
}

export function updateAccountProfile(user, body) {
  const profile = {
    ...user,
    name: text(body.name, '昵称', 40),
    university: text(body.university ?? '', '大学', 100, false),
  };
  if (body.avatar === '') {
    delete profile.avatar;
  } else if (body.avatar !== undefined) {
    const input = text(body.avatar, '头像', AVATAR_DATA_LIMIT);
    const data = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(input)?.[1];
    const bytes = data && Buffer.from(data, 'base64');
    if (!bytes || bytes.toString('base64') !== data || !isAvatarJpeg(bytes))
      fail(400, '头像格式无效，请重新选择图片。');
    profile.avatar = { data, version: createHash('sha256').update(bytes).digest('hex').slice(0, 20) };
  }
  return profile;
}

export function accountStatus(user) {
  return user.status == null || user.status === 'active' ? 'active' : 'disabled';
}

function sessionCounts(db) {
  const counts = new Map();
  const now = Date.now();
  for (const session of db.sessions) {
    if (session.expires > now) counts.set(session.userId, (counts.get(session.userId) || 0) + 1);
  }
  return counts;
}

function accountRow(user, counts) {
  const status = accountStatus(user);
  return {
    id: user.id, name: user.name, email: user.email, role: user.role, status,
    createdAt: user.createdAt || null, lastLoginAt: user.lastLoginAt || null,
    disabledAt: status === 'disabled' ? user.disabledAt || null : null,
    activeSessions: status === 'active' ? counts.get(user.id) || 0 : 0,
  };
}

function searchText(value) {
  return value.normalize('NFKC').toLowerCase();
}

function listAccounts(db, search) {
  const q = searchText(text(search.get('q') || '', '搜索关键词', 250, false));
  const status = search.get('status') || 'all';
  if (!['all', 'active', 'disabled'].includes(status)) fail(400, '账号状态无效。');
  const role = search.get('role') || 'all';
  if (!['all', 'admin', 'player'].includes(role)) fail(400, '账号角色无效。');
  const pageSize = positiveInteger(search, 'pageSize', 20, 100);
  const requestedPage = positiveInteger(search, 'page', 1);
  const start = search.get('offset');
  if (start !== null && (!/^\d+$/.test(start) || !Number.isSafeInteger(Number(start)))) {
    fail(400, '分页参数无效。');
  }
  const matched = db.users.filter(user => (status === 'all' || accountStatus(user) === status) &&
    (role === 'all' || user.role === role) &&
    (!q || [user.name, user.email, user.id].some(field => typeof field === 'string' && searchText(field).includes(q))));
  matched.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || a.id.localeCompare(b.id));
  const total = matched.length;
  const totalPages = Math.ceil(total / pageSize);
  const page = Math.min(requestedPage, totalPages || 1);
  const offset = start === null ? (page - 1) * pageSize : Number(start);
  const counts = sessionCounts(db);
  return { items: matched.slice(offset, offset + pageSize).map(user => accountRow(user, counts)), total, page, pageSize, totalPages };
}

function accountDetail(db, user, registrations) {
  return {
    ...accountRow(user, sessionCounts(db)),
    university: user.university || '',
    accountRevision: user.accountRevision ?? 0,
    projectCount: db.projects.filter(project => project.ownerId === user.id).length,
    registrationCount: registrations.countForUser(user.id),
    accountHistory: (user.accountHistory || []).slice(0, 30).map(({ kind, at, actorId }) => ({ kind, at, actorId })),
  };
}

export function revokeAccountSessions(db, id) {
  const before = db.sessions.length;
  db.sessions = db.sessions.filter(session => session.userId !== id);
  return db.sessions.length !== before;
}
export function advanceAccountRevision(user) {
  user.accountRevision = (user.accountRevision ?? 0) + 1;
}

function manageAccount(db, user, kind, actorId) {
  const at = new Date().toISOString();
  if (kind === 'revoke-sessions') {
    if (!revokeAccountSessions(db, user.id)) return false;
  } else {
    const status = kind === 'disable' ? 'disabled' : 'active';
    if (accountStatus(user) === status) return false;
    revokeAccountSessions(db, user.id);
    user.status = status;
    user.disabledAt = status === 'disabled' ? at : null;
  }
  user.accountHistory = [{ kind, at, actorId }, ...(user.accountHistory || []).slice(0, 29)];
  advanceAccountRevision(user);
  return true;
}

export function handleStaffAccounts({ db, registrations, staff, get, id, action, body, search, persist, send }) {
  if (staff.role !== 'operator' && staff.role !== 'owner') fail(403, '请使用运营后台账号查看官网用户。');
  if (get && !id && !action) { send(listAccounts(db, search)); return true; }
  if (!id || (get ? Boolean(action) : !['disable', 'restore', 'revoke-sessions'].includes(action))) {
    fail(404, '账号管理接口不存在。');
  }
  if (!get && staff.role !== 'owner') fail(403, '仅运营负责人可以管理用户状态与会话。');
  const index = db.users.findIndex(item => item.id === id);
  let user = db.users[index];
  if (!user) fail(404, '用户不存在。');
  if (!get) {
    const expected = body.expectedRevision;
    if (expected !== undefined) {
      if (!Number.isSafeInteger(expected) || expected < 0) fail(400, '账号版本必须是非负整数。');
      if (expected !== (user.accountRevision ?? 0)) fail(409, '账号状态或会话已变更，请刷新用户详情，核对后再操作。');
    }
    user = structuredClone(user);
    db = { ...db, users: db.users.slice() };
    db.users[index] = user;
    if (manageAccount(db, user, action, staff.id)) persist(db);
  }
  send(accountDetail(db, user, registrations));
  return true;
}
