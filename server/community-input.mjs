export function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

export function positiveInteger(search, key, fallback, max = Number.MAX_SAFE_INTEGER) {
  const value = search.get(key);
  if (value === null) return fallback;
  const n = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(n) || n > max) fail(400, '分页参数无效。');
  return n;
}

export function optionalPage(search) {
  if (!search.has('page') && !search.has('pageSize')) return null;
  return { page: positiveInteger(search, 'page', 1), pageSize: positiveInteger(search, 'pageSize', 20, 100) };
}

export function sameOriginSubmission(req, secure) {
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  try {
    const scheme = secure || req.socket?.encrypted ? 'https:' : 'http:';
    return origin === new URL(scheme + '//' + req.headers.host).origin;
  } catch {
    return false;
  }
}

export function text(value, label, max = 500, required = true) {
  if (typeof value !== 'string') fail(400, `${label}格式错误。`);
  const clean = value.trim();
  if (required && !clean) fail(400, `请填写${label}。`);
  if (clean.length > max) fail(400, `${label}不能超过 ${max} 字。`);
  return clean;
}

export function url(value, label) {
  const clean = text(value || '', label, 2000, false);
  if (!clean) return '';
  let parsed;
  try { parsed = new URL(clean); } catch { fail(400, `${label}请填写完整的 HTTPS 链接。`); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) fail(400, `${label}仅支持 HTTP 或 HTTPS 链接。`);
  return clean;
}
