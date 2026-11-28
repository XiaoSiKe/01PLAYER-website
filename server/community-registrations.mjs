import { closeSync, existsSync, openSync } from 'node:fs';

export const registrationFormat = 'sqlite-v1';
export const registrationFile = identity => identity + '.registrations.sqlite';
const DatabaseSync = process.getBuiltinModule?.('node:sqlite')?.DatabaseSync;
const contactKey = value => value?.trim().toLowerCase() ?? null;

export function pageBounds(total, { page, pageSize }) {
  const totalPages = Math.ceil(total / pageSize);
  return { total, page: Math.min(page, totalPages || 1), pageSize, totalPages };
}

// Static-site development still supports Node 20. Its legacy JSON store uses the
// same validation and HTTP contracts, and newer runtimes import that file on boot.
function jsonRegistrations(current, persist) {
  const rows = () => current().registrations;
  const save = registrations => persist({ ...current(), registrations });
  const matches = (row, event, status) => (!event || row.eventId === event) && (!status || (row.status || 'approved') === status);
  return {
    write: work => work(),
    byId: id => structuredClone(rows().find(r => r.id === id)),
    byKey: (event, key) => rows().find(r => r.eventId === event && r.keyDigest === key),
    hasContact: (event, contact) => rows().some(r => r.eventId === event && contactKey(r.contact) === contactKey(contact)),
    hasUser: (event, user) => rows().some(r => r.eventId === event && r.userId === user),
    forUser: user => rows().filter(r => r.userId === user),
    receiptIdForEvent: (user, event) => rows().find(r => r.userId === user && r.eventId === event)?.id,
    pageForUser(user, requested) {
      const matches = rows().filter(row => row.userId === user).reverse();
      const bounds = pageBounds(matches.length, requested);
      const offset = (bounds.page - 1) * bounds.pageSize;
      return { ...bounds, items: matches.slice(offset, offset + bounds.pageSize) };
    },
    countForUser: user => rows().filter(r => r.userId === user).length,
    countStatus: status => rows().reduce((count, row) => count + Number((row.status || 'approved') === status), 0),
    list: (event, status) => rows().filter(row => matches(row, event, status)),
    page(event, status, requested, includeCounts = false) {
      const all = rows();
      const total = event || status ? all.reduce((n, row) => n + Number(matches(row, event, status)), 0) : all.length;
      const bounds = pageBounds(total, requested);
      if (includeCounts) {
        const statusCounts = { pending: 0, approved: 0, rejected: 0 };
        for (const row of all) if (matches(row, event, null)) statusCounts[row.status || 'approved']++;
        bounds.statusCounts = statusCounts;
      }
      const offset = (bounds.page - 1) * bounds.pageSize;
      if (!event && !status) return { ...bounds, items: all.slice(offset, offset + bounds.pageSize) };
      const items = [];
      let seen = 0;
      for (const row of all) {
        if (!matches(row, event, status)) continue;
        if (seen++ >= offset) items.push(row);
        if (items.length === bounds.pageSize) break;
      }
      return { ...bounds, items };
    },
    add: row => save([...rows(), row]),
    update: row => save(rows().map(old => old.id === row.id ? row : old)),
    close() {},
  };
}

export function checkRegistrationIdentity(state) {
  const migrated = state.registrationStore !== undefined;
  if (migrated && !(typeof state.instanceId === 'string' && state.instanceId.length))
    throw Error('缺少报名库对应的社区实例标识，请恢复配套备份。');
  const needsSecret = migrated || state.registrations?.some(r => r.keyDigest);
  if (needsSecret && !(typeof state.registrationSecret === 'string' && state.registrationSecret.length))
    throw Error('缺少原报名回执签名密钥，请恢复配套备份。');
}

function checkPair(db, state) {
  const meta = db.prepare('SELECT instance, format FROM registration_store').get();
  if (meta?.instance !== state.instanceId || meta.format !== registrationFormat)
    throw Error('报名数据库与社区实例不匹配，请恢复配套备份。');
}

export function openRegistrations(identity, current, persist) {
  const state = current(), file = registrationFile(identity);
  const migrated = state.registrationStore === registrationFormat;
  if (state.registrationStore !== undefined && !migrated) throw Error('无法识别报名数据库版本。');
  if (migrated ? state.registrations !== null : !Array.isArray(state.registrations))
    throw Error('社区报名数据格式错误，请检查备份。');
  if (!DatabaseSync) {
    if (migrated || existsSync(file)) throw Error('此报名库需要支持 node:sqlite 的 Node 运行时。');
    return jsonRegistrations(current, persist);
  }
  // Open a missing destination privately. Never re-create a missing migrated DB.
  if (!existsSync(file)) {
    if (migrated) throw Error('缺少配套报名数据库，请恢复完整备份。');
    closeSync(openSync(file, 'wx', 0o600));
  }
  const db = new DatabaseSync(file);
  function transaction(begin, work) {
    try {
      db.exec(begin);
      try {
        const result = work();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    } catch (error) {
      if ((error.errcode & 255) === 5 || (error.errcode & 255) === 6) {
        throw Object.assign(Error('报名服务繁忙，请稍后重试。'), { status: 503, retryAfter: 1 });
      }
      throw error;
    }
  }
  const write = work => transaction('BEGIN IMMEDIATE', work);
  try {
    db.exec('PRAGMA busy_timeout=0; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL');
    const insert = 'INSERT INTO registrations(id,event,contact,user,key_digest,status,body) VALUES(?,?,?,?,?,?,?)';
    const values = r => [r.id, r.eventId, contactKey(r.contact), r.userId ?? null, r.keyDigest ?? null, r.status || 'approved', JSON.stringify(r)];
    if (!migrated) {
      write(() => {
        if (db.prepare("SELECT 1 FROM sqlite_schema WHERE name='registration_store'").get()) {
          // A crash after SQLite committed but before the JSON pointer switched.
          // Resume only if both stores still contain exactly the same receipts.
          checkPair(db, state);
          const saved = db.prepare('SELECT body FROM registrations ORDER BY rowid').iterate();
          for (const row of state.registrations)
            if (saved.next().value?.body !== JSON.stringify(row)) throw Error('已有报名库与待迁移数据不一致。');
          if (!saved.next().done) throw Error('已有报名库含其他记录，请检查配套备份。');
          return;
        }
        db.exec(`CREATE TABLE registration_store(instance TEXT NOT NULL, format TEXT NOT NULL);
          CREATE TABLE registrations(id TEXT NOT NULL PRIMARY KEY, event TEXT NOT NULL, contact TEXT, user TEXT, key_digest TEXT, status TEXT NOT NULL, body TEXT NOT NULL);
          CREATE INDEX registration_key ON registrations(event,key_digest) WHERE key_digest IS NOT NULL;
          CREATE INDEX registration_contact ON registrations(event,contact);
          CREATE INDEX registration_user ON registrations(user,event) WHERE user IS NOT NULL;
          CREATE INDEX registration_status ON registrations(event,status);`);
        db.prepare('INSERT INTO registration_store VALUES(?,?)').run(state.instanceId, registrationFormat);
        const add = db.prepare(insert);
        for (const row of state.registrations) add.run(...values(row));
      });
      persist({ ...state, registrations: null, registrationStore: registrationFormat });
    } else checkPair(db, state);
    db.exec(`CREATE INDEX IF NOT EXISTS registration_by_status ON registrations(status);
      CREATE INDEX IF NOT EXISTS registration_by_event ON registrations(event)`);
    const byId = db.prepare('SELECT body FROM registrations WHERE id=?');
    const byKey = db.prepare('SELECT body FROM registrations WHERE event=? AND key_digest=?');
    const byContact = db.prepare('SELECT 1 FROM registrations WHERE event=? AND contact=?');
    const byUser = db.prepare('SELECT 1 FROM registrations WHERE event=? AND user=?');
    const forUser = db.prepare('SELECT body FROM registrations WHERE user=? ORDER BY rowid');
    const forUserEvent = db.prepare('SELECT id FROM registrations WHERE user=? AND event=? ORDER BY rowid LIMIT 1');
    const forUserPage = db.prepare('SELECT body FROM registrations WHERE user=? ORDER BY rowid DESC LIMIT ? OFFSET ?');
    const count = db.prepare('SELECT count(*) AS n FROM registrations WHERE user=?');
    const countStatus = db.prepare('SELECT count(*) AS n FROM registrations WHERE status=?');
    const countsByStatus = db.prepare('SELECT status, count(*) AS n FROM registrations GROUP BY status');
    const eventCountsByStatus = db.prepare('SELECT status, count(*) AS n FROM registrations WHERE event=? GROUP BY status');
    const add = db.prepare(insert);
    const update = db.prepare('UPDATE registrations SET status=?,body=? WHERE id=?');
    const unpack = r => r && JSON.parse(r.body);
    // Four fixed combinations. Bound user values never become statement cache keys.
    const rosterQueries = new Map();
    function roster(event, status) {
      const filters = [], params = [];
      if (event) { filters.push('event=?'); params.push(event); }
      if (status) { filters.push('status=?'); params.push(status); }
      const where = filters.length ? ' WHERE ' + filters.join(' AND ') : '';
      let queries = rosterQueries.get(where);
      if (!queries) {
        const select = 'SELECT body FROM registrations' + where + ' ORDER BY rowid';
        queries = { all: db.prepare(select), page: db.prepare(select + ' LIMIT ? OFFSET ?'),
          count: db.prepare('SELECT count(*) AS n FROM registrations' + where) };
        rosterQueries.set(where, queries);
      }
      return { queries, params };
    }
    return {
      write, close: () => db.close(),
      byId: id => typeof id === 'string' ? unpack(byId.get(id)) : undefined,
      byKey: (event, key) => unpack(byKey.get(event, key)),
      hasContact: (event, contact) => Boolean(byContact.get(event, contactKey(contact))),
      hasUser: (event, user) => Boolean(byUser.get(event, user)),
      forUser: user => Array.from(forUser.iterate(user), unpack),
      receiptIdForEvent: (user, event) => forUserEvent.get(user, event)?.id,
      pageForUser(user, requested) {
        return transaction('BEGIN', () => {
          const bounds = pageBounds(count.get(user).n, requested);
          const offset = (bounds.page - 1) * bounds.pageSize;
          return { ...bounds, items: forUserPage.all(user, bounds.pageSize, offset).map(unpack) };
        });
      },
      countForUser: user => count.get(user).n,
      countStatus: status => countStatus.get(status).n,
      list(event, status) {
        const { queries, params } = roster(event, status);
        return Array.from(queries.all.iterate(...params), unpack);
      },
      page(event, status, requested, includeCounts = false) {
        const { queries, params } = roster(event, status);
        return transaction('BEGIN', () => {
          const bounds = pageBounds(queries.count.get(...params).n, requested);
          const offset = (bounds.page - 1) * bounds.pageSize;
          const items = Array.from(queries.page.iterate(...params, bounds.pageSize, offset), unpack);
          if (includeCounts) {
            const counts = event ? eventCountsByStatus.all(event) : countsByStatus.all();
            bounds.statusCounts = Object.fromEntries(counts.map(({ status, n }) => [status, n]));
          }
          return { ...bounds, items };
        });
      },
      add: row => add.run(...values(row)),
      update: row => update.run(row.status, JSON.stringify(row), row.id),
    };
  } catch (error) {
    db.close();
    throw error;
  }
}

// A portable maintenance snapshot folds committed WAL rows back into legacy JSON.
export function snapshotCommunity(identity, state) {
  checkRegistrationIdentity(state);
  if (state.registrationStore === undefined) {
    if (existsSync(registrationFile(identity)))
      throw Error('旧版身份文件旁已有报名数据库，请先用配套新版服务核对实例与记录并完成迁移，再备份。');
    if (!Array.isArray(state.registrations)) throw Error('备份缺少报名数据。');
    return state;
  }
  if (state.registrationStore !== registrationFormat) throw Error('无法识别报名数据库版本。');
  if (state.registrations !== null || !state.instanceId) throw Error('社区报名数据格式错误，请检查配套备份。');
  const db = new DatabaseSync(registrationFile(identity), { readOnly: true });
  try {
    checkPair(db, state);
    const { registrationStore, ...portable } = state;
    const rows = db.prepare('SELECT body FROM registrations ORDER BY rowid').iterate();
    portable.registrations = Array.from(rows, r => JSON.parse(r.body));
    return portable;
  } finally {
    db.close();
  }
}
