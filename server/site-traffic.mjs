import { createHash } from 'node:crypto';
import { trafficPages } from '../src/data/traffic-pages.js';
import { fail } from './community-input.mjs';

const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const dayMs = 86_400_000;
const businessDay = now => new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);

export function createSiteTraffic(dataFile) {
  let db, insert, prune, daily, pages, lastPrunedDay;
  function connect() {
    if (db) return;
    const DatabaseSync = process.getBuiltinModule?.('node:sqlite')?.DatabaseSync;
    if (!DatabaseSync) fail(503, '访问统计需要支持 SQLite 的运行时。');
    db = new DatabaseSync(dataFile + '.traffic.sqlite');
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS views (
        id TEXT PRIMARY KEY, day TEXT NOT NULL, page TEXT NOT NULL, visitor TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS views_day ON views(day);
    `);
    insert = db.prepare('INSERT OR IGNORE INTO views VALUES (?, ?, ?, ?)');
    prune = db.prepare('DELETE FROM views WHERE day < ?');
    daily = db.prepare('SELECT day, count(*) AS views, count(DISTINCT visitor) AS visitors FROM views WHERE day >= ? GROUP BY day ORDER BY day');
    pages = db.prepare('SELECT page, count(*) AS views FROM views WHERE day >= ? GROUP BY page ORDER BY views DESC, page LIMIT 5');
  }
  return {
    record(input, now = Date.now()) {
      if (typeof input.page !== 'string' || !Object.hasOwn(trafficPages, input.page) ||
          typeof input.visitor !== 'string' || !uuid.test(input.visitor) ||
          typeof input.id !== 'string' || !uuid.test(input.id)) fail(400, '访问记录格式错误。');
      connect();
      const day = businessDay(now);
      if (day !== lastPrunedDay) {
        prune.run(businessDay(now - 30 * dayMs));
        lastPrunedDay = day;
      }
      const visitor = createHash('sha256').update(day + ':' + input.visitor.toLowerCase()).digest('hex');
      insert.run(input.id.toLowerCase(), day, input.page, visitor);
    },
    read(now = Date.now()) {
      connect();
      const start = businessDay(now - 6 * dayMs);
      const today = businessDay(now);
      const counts = new Map(daily.all(start).map(row => [row.day, row]));
      const trend = Array.from({ length: 7 }, (_, index) => {
        const day = businessDay(now - (6 - index) * dayMs);
        return counts.get(day) ?? { day, views: 0, visitors: 0 };
      });
      return {
        today: counts.get(today) ?? { day: today, views: 0, visitors: 0 },
        views7d: trend.reduce((total, item) => total + item.views, 0),
        trend,
        popular: pages.all(start).map(item => ({ ...item, label: trafficPages[item.page] })),
      };
    },
    close() { db?.close(); },
  };
}
