import { pagePaths } from '../data/page-paths.js';

export async function communityApi(path, body, expectedAccount, signal) {
  let response;
  try {
    response = await fetch(`/api/community/${path}`, {
      credentials: 'same-origin',
      signal,
      ...(body !== undefined
        ? {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Community-Request': '1',
              ...(expectedAccount ? { 'X-Community-Account': expectedAccount } : {}),
            },
            body: JSON.stringify(body),
          }
        : {}),
    });
  } catch {
    throw new Error('暂时无法连接社区服务，请检查网络后重试。');
  }
  const data = await response
    .json()
    .catch(() => ({ error: '互动服务未连接。请使用包含后台的启动方式。' }));
  if (!response.ok || data.error) {
    if (
      response.status === 401 &&
      !['login', 'register', 'session'].includes(path) &&
      typeof window !== 'undefined'
    ) {
      window.dispatchEvent(new Event('01player-unauthorized'));
    }
    const error = new Error(data.error || '请求失败，请重试。');
    error.status = response.status;
    throw error;
  }
  return data;
}
export function communityLink(page = 'plaza', params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value != null && value !== ''),
  );
  const path = pagePaths[page];
  return query.size ? `${path}?${query}` : path;
}
