import { business } from '../bridge.mjs';
import { loadSourceTraffic } from './source-link.mjs';

const freshFor = 45_000;
const keepFor = 15 * 60_000;
const retryAfter = 10_000;
const beijingDay = now => new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);

export function createTrafficReader(load, now = Date.now) {
  let cached, pending, failedAt = -Infinity, lastError;
  function usable(time) {
    return cached && time - cached.at < keepFor && cached.traffic.today.day === beijingDay(time);
  }
  return function read({ waitForRefresh = false } = {}) {
    const time = now();
    const hasCache = usable(time);
    if (hasCache && time - cached.at < freshFor) return { traffic: cached.traffic, refreshing: false };
    if (!pending && time - failedAt >= retryAfter) {
      pending = Promise.resolve().then(load).then(traffic => {
        if (!traffic?.today?.day || !traffic.trend?.length || !Array.isArray(traffic.popular)) {
          throw Error('访问统计暂不可用。');
        }
        cached = { traffic, at: now() };
      }).catch(error => {
        failedAt = now();
        lastError = error;
      }).finally(() => { pending = null; });
    }
    if (hasCache && !waitForRefresh) return { traffic: cached.traffic, refreshing: Boolean(pending) };
    return (pending ?? Promise.resolve()).then(() => {
      if (usable(now())) return { traffic: cached.traffic, refreshing: false };
      throw lastError || Error('访问统计暂不可用。');
    });
  };
}

// Payload's server page and API route share the same cache within a CMS process.
const trafficCacheKey = Symbol.for('01player.cms.siteTrafficReader');
export const readSiteTraffic = globalThis[trafficCacheKey] ??= createTrafficReader(async () => {
  if (process.env.OPS_SOURCE_HOST) return loadSourceTraffic(process.env);
  const response = await business('staff/traffic');
  if (!response.ok) throw Error('社区服务暂时不可用。');
  return response.json();
});
