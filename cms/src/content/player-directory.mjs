import { business } from '../bridge.mjs';
import { playerIdentityForRole } from '../../../src/community/account/identity.js';

const pageSize = 20;

function administratorRow(account) {
  return {
    id: String(account.id),
    name: account.email,
    email: account.email,
    role: 'admin',
    identity: playerIdentityForRole(account.role),
    status: 'active',
    source: 'staff',
    createdAt: account.createdAt,
  };
}

export async function readPlayerDirectory(req, { q, status, role, page }) {
  const search = q.normalize('NFKC').toLowerCase();
  const emailFilter = { email: { like: search } };
  const searchFilter = !search ? undefined : /^\d+$/.test(search) && Number.isSafeInteger(Number(search))
    ? { or: [emailFilter, { id: { equals: Number(search) } }] }
    : emailFilter;
  const staffRole = { head: 'owner', pioneer: 'operator' }[role];
  const roleFilter = staffRole && { role: { equals: staffRole } };
  const where = searchFilter && roleFilter ? { and: [searchFilter, roleFilter] } : searchFilter || roleFilter;
  // Staff records precede community accounts, so one offset can address both lists.
  while (true) {
    const administrators = role === 'player' || status === 'disabled'
      ? { docs: [], totalDocs: 0 }
      : await req.payload.find({
          collection: 'staff', where, sort: '-id', page, limit: pageSize, depth: 0,
          select: { email: true, role: true, createdAt: true },
          req, overrideAccess: false,
        });
    const staffCount = administrators.totalDocs;
    const items = administrators.docs.map(administratorRow);
    const remaining = pageSize - items.length;
    const offset = Math.max(0, (page - 1) * pageSize - staffCount);
    let community = { total: 0, items: [] };
    if (role !== 'pioneer') {
      const query = new URLSearchParams({
        q, status, role: role === 'head' ? 'admin' : role, offset: String(offset), pageSize: String(remaining || 1),
      });
      const response = await business('staff/users', { query: query.toString(), actorId: req.user.id, role: req.user.role, signal: req.signal });
      if (!response.ok) throw Error('暂时无法读取社区账号');
      community = await response.json();
    }
    const total = staffCount + community.total;
    const totalPages = Math.ceil(total / pageSize);
    const availablePage = Math.min(page, totalPages || 1);
    if (availablePage === page) {
      return {
        items: [...items, ...community.items.slice(0, remaining).map(account => ({
          ...account, identity: playerIdentityForRole(account.role), source: 'community',
        }))],
        total, totalPages, page, pageSize,
      };
    }
    page = availablePage;
  }
}
