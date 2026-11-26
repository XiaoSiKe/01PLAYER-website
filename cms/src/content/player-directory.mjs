import { business } from '../bridge.mjs';

const pageSize = 20;

function administratorRow(account) {
  return {
    id: String(account.id),
    name: account.email,
    email: account.email,
    role: 'admin',
    status: 'active',
    source: 'staff',
    createdAt: account.createdAt,
  };
}

export async function readPlayerDirectory(req, { q, status, role, page }) {
  const search = q.normalize('NFKC').toLowerCase();
  const emailFilter = { email: { like: search } };
  const where = !search ? undefined : /^\d+$/.test(search) && Number.isSafeInteger(Number(search))
    ? { or: [emailFilter, { id: { equals: Number(search) } }] }
    : emailFilter;
  // Staff records precede community accounts, so one offset can address both lists.
  while (true) {
    const administrators = role === 'player' || status === 'disabled'
      ? { docs: [], totalDocs: 0 }
      : await req.payload.find({
          collection: 'staff', where, sort: '-id', page, limit: pageSize, depth: 0,
          select: { email: true, createdAt: true },
          req, overrideAccess: false,
        });
    const staffCount = administrators.totalDocs;
    const items = administrators.docs.map(administratorRow);
    const remaining = pageSize - items.length;
    const offset = Math.max(0, (page - 1) * pageSize - staffCount);
    const query = new URLSearchParams({ q, status, role, offset: String(offset), pageSize: String(remaining || 1) });
    const response = await business('staff/users', { query: query.toString(), actorId: req.user.id, role: req.user.role, signal: req.signal });
    if (!response.ok) throw Error('暂时无法读取社区账号');
    const community = await response.json();
    const total = staffCount + community.total;
    const totalPages = Math.ceil(total / pageSize);
    const availablePage = Math.min(page, totalPages || 1);
    if (availablePage === page) {
      return {
        items: [...items, ...community.items.slice(0, remaining).map(account => ({ ...account, source: 'community' }))],
        total, totalPages, page, pageSize,
      };
    }
    page = availablePage;
  }
}
