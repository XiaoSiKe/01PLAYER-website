'use client';
import { Action, DeskTitle } from './OfficialUI';
import React, { useEffect, useRef, useState } from 'react';
import { Field, Form } from '../../../src/community/CommunityUi';
import { desk, readDeskJson } from './desk';

const directoryPath = '/admin/community-users';
const staffPrefix = 'staff:';
const roleLabel = { admin: '管理员', player: '玩家' };
const statusLabel = { active: '正常', disabled: '已停用' };
const actionLabel = { disable: '停用账号', restore: '恢复账号', 'revoke-sessions': '退出全部设备' };
const auditLabel = {
  disable: '停用了账号',
  restore: '恢复了账号',
  'revoke-sessions': '撤销了所有登录会话',
};
const timeFormat = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Shanghai',
});
function prettyTime(value) {
  const time = value && Date.parse(value);
  return Number.isFinite(time) ? timeFormat.format(time) : '暂无记录';
}
function Status({ value }) {
  return (
    <span className={'cu-status ' + (value === 'disabled' ? 'cu-disabled' : '')}>
      {statusLabel[value] || '未知'}
    </span>
  );
}
function listPath(key) {
  if (!key) return directoryPath;
  const administrator = key.startsWith(staffPrefix);
  const query = administrator ? 'admin=' + encodeURIComponent(key.slice(staffPrefix.length)) : 'user=' + encodeURIComponent(key);
  return directoryPath + '?' + query;
}
function UsersList({ filters, changeFilters, open, returnFocus }) {
  const [input, setInput] = useState(filters.q),
    [result, setResult] = useState(null);
  const [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  const { q, status, role, page } = filters;
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError('');
    const query = new URLSearchParams({ q, status, role, page: String(page) });
    readDeskJson('/cms-api/player-directory?' + query, {}, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [q, status, role, page, revision]);
  useEffect(() => {
    if (result && returnFocus.current) {
      document.getElementById('cu-user-' + returnFocus.current)?.focus();
      returnFocus.current = '';
    }
  }, [result, returnFocus]);
  function clear() {
    setInput('');
    changeFilters({ q: '', status: 'all', role: 'all', page: 1 });
  }
  const pageCount = result ? Math.max(1, result.totalPages) : 1;
  return (
    <>
      <form
        className="cu-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          changeFilters({ ...filters, q: input.trim(), page: 1 });
        }}
      >
        <label className="community-field">
          搜索账号
          <input
            type="search"
            maxLength={160}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入昵称、邮箱或账号 ID"
          />
        </label>
        <label className="community-field">
          <span id="cu-role-label">角色</span>
          <select aria-labelledby="cu-role-label" value={role} onChange={(e) =>
            changeFilters({ ...filters, role: e.target.value, q: input.trim(), page: 1 })
          }>
            <option value="all">全部角色</option>
            <option value="admin">管理员</option>
            <option value="player">玩家</option>
          </select>
        </label>
        <label className="community-field">
          <span id="cu-status-label">账号状态</span>
          <select
            aria-labelledby="cu-status-label"
            value={status}
            onChange={(e) =>
              changeFilters({ ...filters, status: e.target.value, q: input.trim(), page: 1 })
            }
          >
            <option value="all">全部状态</option>
            <option value="active">正常</option>
            <option value="disabled">已停用</option>
          </select>
        </label>
        <Action type="submit">搜索</Action>
      </form>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <Action onClick={() => setRevision((n) => n + 1)}>重试</Action>
        </div>
      ) : !result ? (
        <p role="status">正在读取账号…</p>
      ) : (
        <>
          <p className="cu-count" role="status">
            共 {result.total} 个账号
          </p>
          {result.items.length ? (
            <ul className="cu-list">
              {result.items.map((person) => {
                const key = person.source === 'staff' ? staffPrefix + person.id : person.id;
                return (
                <li key={key}>
                  <a
                    id={'cu-user-' + key}
                    href={listPath(key)}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                      e.preventDefault();
                      open(key);
                    }}
                  >
                    <div className="cu-identity">
                      <strong>{person.name}</strong>
                      <span>{person.source === 'staff' ? '零一运营' : person.email}</span>
                    </div>
                    <span className="cu-login">
                      {person.lastLoginAt
                        ? '最近登录　' + prettyTime(person.lastLoginAt)
                        : '尚无登录时间记录'}
                    </span>
                    <span className="cu-role">{roleLabel[person.role] || '玩家'}</span>
                    <Status value={person.status} />
                    <span aria-hidden="true" className="cu-arrow">
                      →
                    </span>
                  </a>
                </li>
                );
              })}
            </ul>
          ) : (
            <div className="op-empty">
              没有符合条件的账号。{(q || status !== 'all' || role !== 'all') && <Action onClick={clear}>清除筛选</Action>}
            </div>
          )}
          {(pageCount > 1 || page > 1) && (
            <nav className="cu-pagination" aria-label="账号列表分页">
              <Action
                disabled={result.page <= 1}
                onClick={() => changeFilters({ ...filters, page: result.page - 1 })}
              >
                上一页
              </Action>
              <span>
                第 {result.page} 页 / 共 {pageCount} 页
              </span>
              <Action
                disabled={result.page >= pageCount}
                onClick={() => changeFilters({ ...filters, page: result.page + 1 })}
              >
                下一页
              </Action>
            </nav>
          )}
        </>
      )}
    </>
  );
}
function UserDetail({ id, isOwner }) {
  const [person, setPerson] = useState(null),
    [revision, setRevision] = useState(0),
    [loadError, setLoadError] = useState('');
  const [pending, setPending] = useState(''),
    [notice, setNotice] = useState(null);
  const [confirm, setConfirm] = useState('');
  const changing = useRef(false);
  const endpoint = 'staff/users/' + encodeURIComponent(id);
  useEffect(() => {
    const controller = new AbortController();
    setLoadError('');
    setPerson(null);
    desk(endpoint, undefined, undefined, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setPerson(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setLoadError(e.message);
      });
    return () => controller.abort();
  }, [endpoint, revision]);
  async function perform(action) {
    if (changing.current) return;
    changing.current = true;
    setPending(action);
    setNotice(null);
    try {
      const updated = await desk(endpoint + '/' + action, { expectedRevision: person.accountRevision });
      setPerson(updated);
      setConfirm('');
      setNotice({
        text: {
          disable: '账号已停用，所有设备均已退出。',
          restore: '账号已恢复，玩家现在可以重新登录。',
          'revoke-sessions': '全部设备已退出，玩家可以重新登录。',
        }[action],
      });
    } catch (e) {
      setNotice({ error: true, stale: e.status === 409, text: e.message });
    } finally {
      changing.current = false;
      setPending('');
    }
  }
  if (loadError)
    return (
      <div role="alert">
        <p>{loadError}</p>
        <Action onClick={() => setRevision((n) => n + 1)}>重新读取</Action>
      </div>
    );
  if (!person) return <p role="status">正在读取用户资料…</p>;
  const facts = [
    ['账号 ID', person.id],
    ['角色', roleLabel[person.role] || '玩家'],
    ['大学', person.university || '未填写'],
    ['注册时间', prettyTime(person.createdAt)],
    ['最近登录', prettyTime(person.lastLoginAt)],
    ['有效登录会话', person.activeSessions],
    ['关联作品', person.projectCount],
    ['账号报名', person.registrationCount],
  ];
  if (person.status === 'disabled') facts.push(['停用时间', prettyTime(person.disabledAt)]);
  const descriptions = {
    disable: '停用后，官网和玩家系统会撤销这个账号的全部会话，阻止再次登录。已提交的内容会保留。',
    restore: '恢复后，玩家可以用原密码重新登录。之前退出的设备需要重新验证。',
    'revoke-sessions': '官网和玩家系统会撤销这个账号当前的全部会话。玩家仍可用原密码重新登录。',
  };
  return (
    <>
      <div className="cu-detail-head">
        <div>
          <h2>{person.name}</h2>
          <p>{person.email}</p>
        </div>
        <Status value={person.status} />
      </div>
      <section aria-label="账号资料">
        <dl className="cu-facts">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="cu-section">
        <h2>账号操作</h2>
        {isOwner ? (
          <>
            {!confirm ? (
              <div className="op-line">
                <Action
                  onClick={() => {
                    setNotice(null);
                    setConfirm(person.status === 'disabled' ? 'restore' : 'disable');
                  }}
                >
                  {person.status === 'disabled' ? '恢复账号' : '停用账号'}
                </Action>
                {person.activeSessions > 0 && (
                  <Action
                    onClick={() => {
                      setNotice(null);
                      setConfirm('revoke-sessions');
                    }}
                  >
                    退出全部设备
                  </Action>
                )}
              </div>
            ) : (
              <div className="cu-confirm">
                <p>{descriptions[confirm]}</p>
                <div className="op-line">
                  <button
                    className="discovery-action"
                    disabled={Boolean(pending) || Boolean(notice?.stale)}
                    onClick={() => perform(confirm)}
                  >
                    {pending ? '处理中…' : '确认' + actionLabel[confirm]}
                  </button>
                  <Action
                    disabled={Boolean(pending)}
                    onClick={() => {
                      setConfirm('');
                      setNotice(null);
                    }}
                  >
                    取消
                  </Action>
                </div>
              </div>
            )}
          </>
        ) : (
          <p>运营人员可查看用户资料。账号状态与登录设备由站点负责人管理。</p>
        )}
        {notice && <p role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
        {notice?.stale && (
          <Action
            onClick={() => {
              setConfirm('');
              setNotice(null);
              setRevision((n) => n + 1);
            }}
          >
            读取最新资料
          </Action>
        )}
      </section>
      <section className="cu-section">
        <h2>最近管理记录</h2>
        {person.accountHistory?.length ? (
          <ol className="cu-history">
            {person.accountHistory.map((entry, i) => (
              <li key={entry.at + '-' + i}>
                <span>
                  管理员 #{entry.actorId}　{auditLabel[entry.kind] || entry.kind}
                </span>
                <time dateTime={entry.at}>{prettyTime(entry.at)}</time>
              </li>
            ))}
          </ol>
        ) : (
          <p>暂无管理操作记录。</p>
        )}
      </section>
    </>
  );
}

function AdministratorDetail({ id, isOwner, onCreated }) {
  const creating = id === 'new';
  const endpoint = creating ? '/cms-api/staff' : '/cms-api/staff/' + encodeURIComponent(id);
  const [account, setAccount] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (creating) return;
    const controller = new AbortController();
    readDeskJson(endpoint, {}, controller.signal)
      .then(setAccount)
      .catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [creating, endpoint]);
  if (creating && !isOwner) return <p role="alert">请联系站点负责人新增管理员。</p>;
  if (error) return <p role="alert">{error}</p>;
  if (!creating && !account) return <p role="status">正在读取管理员资料…</p>;
  return (
    <>
      <div className="cu-detail-head"><h2>{creating ? '新增管理员' : account.email}</h2></div>
      {!creating && <dl className="cu-facts">
        <div><dt>角色</dt><dd>管理员</dd></div>
        <div><dt>账号 ID</dt><dd>{account.id}</dd></div>
        <div><dt>创建时间</dt><dd>{prettyTime(account.createdAt)}</dd></div>
      </dl>}
      {isOwner && <section className="cu-section">
        <h2>{creating ? '账号信息' : '更新账号'}</h2>
        <Form submit={creating ? '创建管理员' : '保存账号'} onSubmit={async ({ email, password }) => {
          setNotice('');
          const data = { email: email.trim(), ...(password ? { password } : {}) };
          const result = await readDeskJson(endpoint, {
            method: creating ? 'POST' : 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(data),
          });
          if (creating) onCreated(staffPrefix + result.doc.id);
          else {
            setAccount(result.doc);
            setNotice('管理员账号已更新。');
          }
        }}>
          <Field label="邮箱" name="email" type="email" autoComplete="off" required defaultValue={account?.email} />
          <Field label={creating ? '密码' : '新密码（可选）'} name="password" type="password" autoComplete="new-password" required={creating} key={account?.updatedAt} />
        </Form>
        {notice && <p role="status">{notice}</p>}
      </section>}
    </>
  );
}

export default function CommunityUsers({ isOwner }) {
  const [selected, setSelected] = useState(undefined);
  const [filters, setFilters] = useState({ q: '', status: 'all', role: 'all', page: 1 });
  const returnFocus = useRef('');
  useEffect(() => {
    const read = () => {
      const query = new URLSearchParams(location.search);
      const admin = query.get('admin');
      setSelected(admin ? staffPrefix + admin : query.get('user') || '');
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);
  function open(id) {
    returnFocus.current = id;
    history.pushState({ ...history.state, communityUsersDrilldown: true }, '', listPath(id));
    setSelected(id);
    window.scrollTo(0, 0);
  }
  function back(e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (history.state?.communityUsersDrilldown) history.back();
    else {
      history.replaceState(history.state, '', directoryPath);
      setSelected('');
    }
  }
  return (
    <main className="community-page op-shell cu-shell">
      <DeskTitle title="玩家管理">
        {selected ? (
          <Action href={directoryPath} onClick={back}>返回玩家管理</Action>
        ) : isOwner && selected === '' ? (
          <Action href={listPath(staffPrefix + 'new')} onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            open(staffPrefix + 'new');
          }}>新增管理员</Action>
        ) : null}
      </DeskTitle>
      {selected === undefined ? (
        <p role="status">正在读取…</p>
      ) : selected?.startsWith(staffPrefix) ? (
        <AdministratorDetail key={selected} id={selected.slice(staffPrefix.length)} isOwner={isOwner}
          onCreated={(key) => {
            history.replaceState(history.state, '', listPath(key));
            setSelected(key);
          }} />
      ) : selected ? (
        <UserDetail key={selected} id={selected} isOwner={isOwner} />
      ) : (
        <UsersList filters={filters} changeFilters={setFilters} open={open} returnFocus={returnFocus} />
      )}
    </main>
  );
}
