export async function readDeskJson(url, options, signal) {
  const request = new AbortController();
  const cancel = () => request.abort();
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 20000);
  try {
    const res = await fetch(url, { ...options, signal: request.signal })
      .catch(() => { throw Error('连接中断，请检查网络后重试。'); });
    const result = await res.json().catch(() => null);
    if (!res.ok) {
      const error = new Error(res.status === 401 ? '登录状态已失效，请重新登录后台。'
        : result?.error || result?.message || result?.errors?.[0]?.message || '暂时无法完成操作');
      error.status = res.status;
      throw error;
    }
    if (result === null) throw Error('运营服务暂时无法连接，请稍后重试。');
    return result;
  } catch (error) {
    if (signal?.aborted) throw signal.reason || error;
    if (request.signal.aborted) throw Error('服务器响应超时，请重试。');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}
export function desk(path, data, query, signal) {
  return readDeskJson('/cms-api/desk', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-01-desk': '1' },
    body: JSON.stringify({ path, method: data === undefined ? 'GET' : 'POST', data, query }),
  }, signal);
}
export const deskTabs = {
  events: '活动管理',
  registrations: '报名审核',
  projects: '作品审核',
  photos: '活动相册',
  status: '零一运维',
};
export const statuses = {
  draft: '草稿',
  published: '已发布',
  archived: '已下架',
  open: '报名中',
  active: '进行中',
  ended: '已结束',
  pending: '待审核',
  approved: '已通过',
  returned: '已退回',
  rejected: '未通过',
  ok: '正常',
  error: '异常',
  stale: '数据过期',
  unconfigured: '未接入',
};
