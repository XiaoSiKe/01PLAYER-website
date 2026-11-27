'use client';
import { Action, DeskTitle } from './OfficialUI';
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { desk, deskTabs, statuses } from './desk';
import AlbumEditor from './AlbumEditor';
import EventEditor from './EventEditor';
import OpsMonitor from './OpsMonitor';
import { matchesFilter, queueFilters } from '../ops/workflow.mjs';
const listPageSize = 20;
function Review({ row, events, tab, reload }) {
  const [note, setNote] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const project = tab === 'projects';
  const event = events.find((e) => e.id === row.eventId);
  async function review(status) {
    setBusy(true);
    try {
      await desk('staff/' + tab + '/' + row.id + '/review', { status, note });
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="editor-row">
      <summary>
        <b>{row.name}</b>　{event?.name} <small>{statuses[row.status] || row.status}</small>
      </summary>
      <p>{project ? row.summary : row.contact}</p>
      {row.accountId && <p><a href={'/admin/community-users?user=' + encodeURIComponent(row.accountId)}>
        {project ? '查看作者账号' : '查看报名账号'} ↗
      </a></p>}
      <p>{row.description || row.note}</p>
      {row.imageUrl && <img className="op-thumb" src={row.imageUrl} alt="作品封面" />}
      {row.demoUrl && (
        <a href={row.demoUrl} target="_blank" rel="noreferrer">
          查看项目演示 ↗
        </a>
      )}
      {Object.entries(row.answers || {}).map(([k, v]) => (
        <p key={k}>
          <b>
            {row.formFields?.find((q) => q.id === k)?.label ||
              event?.formFields?.find((q) => q.id === k)?.label ||
              k}
          </b>
          　{Array.isArray(v) ? v.join('、') : v}
        </p>
      ))}
      {row.status === 'pending' && (
        <>
          <label className="community-field">
            审核备注
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="op-line">
            <Action disabled={busy} onClick={() => review('approved')}>
              通过
            </Action>
            <Action
              disabled={busy || (project && !note.trim())}
              onClick={() => review(project ? 'returned' : 'rejected')}
            >
              {project ? '退回修改' : '婉拒申请'}
            </Action>
          </div>
        </>
      )}
      {row.reviewNote && <p>{row.reviewNote}</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <Action disabled={busy} onClick={reload}>
            重新读取名单
          </Action>
        </div>
      )}
    </details>
  );
}
export default function Operations() {
  const [tab, setTab] = useState('events'),
    [rows, setRows] = useState([]),
    [events, setEvents] = useState([]),
    [selected, setSelected] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [event, setEvent] = useState(''),
    [filter, setFilter] = useState('all');
  const [roster, setRoster] = useState(null);
  const [listPage, setListPage] = useState(1);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState('');
  const [addressReady, setAddressReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const rosterPage = useRef(1);
  const rosterEvents = useRef(null);
  const rosterStatus = tab === 'registrations' && filter !== 'all' ? filter : '';
  const editGuard = useRef(null);
  const initialEdit = useRef(null);
  const registrationOptions = useMemo(() => events.map(({ id, name }) => (
    <option value={id} key={id}>{name}</option>
  )), [events]);
  function syncAddress(changes) {
    const url = new URL(location.href);
    for (const [key, value] of Object.entries(changes)) {
      if (value && !(key === 'filter' && value === 'all')) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    history.replaceState(null, '', url);
  }
  useEffect(() => {
    const url = new URL(location.href);
    const t = url.searchParams.get('tab');
    const page = Object.hasOwn(deskTabs, t) ? t : 'events';
    setTab(page);
    const requested = url.searchParams.get('filter');
    if (Object.hasOwn(queueFilters[page] || {}, requested)) setFilter(requested);
    if (page === 'events') {
      initialEdit.current = url.searchParams.get('edit');
      if (!initialEdit.current && url.searchParams.get('new') === '1') setSelected({});
    }
    if (page === 'registrations') {
      setEvent(url.searchParams.get('event') || '');
      const number = Number(url.searchParams.get('page'));
      rosterPage.current = Number.isSafeInteger(number) && number > 0 ? number : 1;
    }
    setAddressReady(true);
  }, []);
  useEffect(() => {
    if (!addressReady || tab === 'status') return;
    const request = new AbortController();
    const { signal } = request;
    async function read() {
      setLoading(true);
      setError('');
      try {
        const list = tab === 'registrations'
          ? rosterEvents.current ?? desk('staff/events', undefined, { view: 'roster' }, signal)
          : desk('staff/events', undefined, undefined, signal);
        let records = list;
        if (tab === 'projects') records = desk('staff/projects', undefined, undefined, signal);
        if (tab === 'photos') records = [];
        if (tab === 'registrations') {
          const query = { page: String(rosterPage.current), pageSize: '20' };
          if (event) query.event = event;
          if (rosterStatus) query.status = rosterStatus;
          records = desk('staff/registrations', undefined, query, signal);
        }
        const [eventList, result] = await Promise.all([list, records]);
        if (signal.aborted) return;
        setEvents(eventList);
        if (tab === 'registrations') {
          if (!Array.isArray(result?.items)) throw Error('报名服务未返回分页名单，请刷新重试。');
          rosterEvents.current = eventList;
          rosterPage.current = result.page;
          setRoster(result);
          syncAddress({ page: result.page > 1 ? result.page : null });
        } else {
          setRows(result);
        }
        if (tab === 'events' && initialEdit.current) {
          const target = eventList.find((r) => r.id === initialEdit.current);
          initialEdit.current = null;
          if (target) setSelected(target);
          else syncAddress({ edit: null });
        }
      } catch (e) {
        if (!signal.aborted) setError(e.message);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    }
    void read();
    return () => request.abort();
  }, [addressReady, tab, event, rosterStatus, revision]);
  function refresh() {
    setRevision(value => value + 1);
  }
  function changePage(number) {
    rosterPage.current = number;
    syncAddress({ page: number > 1 ? number : null });
    refresh();
  }
  function go(t, eventId = '') {
    if (editGuard.current && !editGuard.current()) return;
    initialEdit.current = null;
    setPinError('');
    setTab(t);
    setFilter('all');
    setListPage(1);
    setSelected(null);
    setEvent(eventId);
    rosterEvents.current = null;
    rosterPage.current = 1;
    setRoster(null);
    syncAddress({ tab: t, event: eventId, filter: null, new: null, edit: null, page: null });
    if (t === tab) refresh();
  }
  function edit(row) {
    setSelected(row);
    syncAddress({ edit: row.id, new: row.id ? null : '1' });
  }
  async function toggleHomePin(row) {
    setPinBusy(true);
    setPinError('');
    try {
      await desk('staff/events/' + row.id + '/pin', { pinned: !row.miniHomePinned });
      refresh();
    } catch (e) {
      setPinError(e.message);
    } finally {
      setPinBusy(false);
    }
  }
  const visibleRows = tab === 'registrations' ? roster?.items ?? [] : rows.filter((row) => matchesFilter(tab, row, filter));
  const localPagination = tab === 'events' || tab === 'projects';
  const listPageCount = Math.max(1, Math.ceil(visibleRows.length / listPageSize));
  const currentListPage = Math.min(listPage, listPageCount);
  const displayedRows = localPagination
    ? visibleRows.slice((currentListPage - 1) * listPageSize, currentListPage * listPageSize)
    : visibleRows;
  if (tab === 'status') return (
    <main className="community-page op-shell">
      <DeskTitle title={deskTabs.status} />
      <OpsMonitor />
    </main>
  );
  return (
    <main className="community-page op-shell">
      <DeskTitle title={deskTabs[tab]}>
        {!selected && (tab === 'events' ? (
          <button className="discovery-action" onClick={() => edit({})}>＋ 新建活动</button>
        ) : (
          <Action onClick={() => { rosterEvents.current = null; refresh(); }}>刷新</Action>
        ))}
      </DeskTitle>
      <nav className="plaza-tabs op-tabs" aria-label="运营功能">
        {Object.entries(deskTabs).map(([k, v]) => (
          <button aria-current={tab === k ? 'page' : undefined} aria-pressed={tab === k} key={k} onClick={() => go(k)}>
            {v}
          </button>
        ))}
      </nav>
      {selected && tab === 'events' ? (
        <EventEditor
          key={selected.id || 'new'}
          item={selected}
          guard={editGuard}
          onBack={() => {
            if (editGuard.current && !editGuard.current()) return;
            setSelected(null);
            syncAddress({ edit: null, new: null });
            refresh();
          }}
          onSaved={(id) => {
            syncAddress({ edit: id, new: null });
            refresh();
          }}
        />
      ) : (
        <>
          {queueFilters[tab] && (
            <div className="op-filters">
              {tab === 'registrations' && (
                <label className="community-field">
                  场次{' '}
                  <select
                    value={event}
                    onChange={(e) => {
                      setEvent(e.target.value);
                      rosterPage.current = 1;
                      syncAddress({ event: e.target.value, page: null });
                    }}
                  >
                    <option value="">所有活动</option>
                    {registrationOptions}
                  </select>
                </label>
              )}
              <label className="community-field">
                {tab === 'events' ? '发布状态' : '审核状态'}
                <select
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.target.value);
                    setListPage(1);
                    rosterPage.current = 1;
                    syncAddress({ filter: e.target.value, page: null });
                  }}
                >
                  {Object.entries(queueFilters[tab]).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {!loading && !error && (
                <span role="status">
                  共 {tab === 'registrations' ? roster?.total ?? 0 : visibleRows.length} {tab === 'events' ? '场活动' : '条记录'}
                </span>
              )}
            </div>
          )}
          {tab === 'events' && pinError && <p role="alert">{pinError}</p>}
          {error ? (
            <p role="alert">{error}</p>
          ) : loading ? (
            <p role="status">正在读取…</p>
          ) : tab === 'photos' ? (
            <AlbumEditor events={events} />
          ) : (
            <div className="op-list">
              {displayedRows.map((r) =>
                tab === 'events' ? (
                  <div className="op-event-row" key={r.id}>
                    <button onClick={() => edit(r)}>
                      <b>{r.name}</b>
                      <small>
                        {r.date}　{r.location}
                      </small>
                    </button>
                    <span>{r.hasDraftChanges ? '有未发布更改' : statuses[r.publicationStatus]}</span>
                    {r.publicationStatus === 'published' && (
                      <Action disabled={pinBusy} aria-pressed={r.miniHomePinned}
                        aria-label={r.name + '，小程序首页置顶'} onClick={() => toggleHomePin(r)}>
                        {r.miniHomePinned ? '取消置顶' : '小程序首页置顶'}
                      </Action>
                    )}
                    <Action onClick={() => go('registrations', r.id)}>报名名单 ↗</Action>
                  </div>
                ) : (
                  <Review key={r.id} row={r} events={events} tab={tab} reload={refresh} />
                ),
              )}
              {!visibleRows.length && (
                <p className="op-empty">
                  {filter === 'pending'
                    ? '当前没有待审核的记录。'
                    : filter === 'unpublished'
                      ? '所有活动的草稿都已处理。'
                      : '当前没有符合条件的记录。'}
                  {(filter !== 'all' || event) && <Action onClick={() => go(tab)}>清除筛选</Action>}
                </p>
              )}
            </div>
          )}
          {localPagination && !loading && !error && listPageCount > 1 && (
            <nav className="cu-pagination" aria-label={deskTabs[tab] + '分页'}>
              <Action disabled={currentListPage <= 1} onClick={() => setListPage(currentListPage - 1)}>上一页</Action>
              <span aria-live="polite">第 {currentListPage} 页 / 共 {listPageCount} 页</span>
              <Action disabled={currentListPage >= listPageCount} onClick={() => setListPage(currentListPage + 1)}>下一页</Action>
            </nav>
          )}
          {tab === 'registrations' && !error && roster?.totalPages > 1 && (
            <nav className="cu-pagination" aria-label="报名名单分页">
              <Action disabled={loading || roster.page <= 1} onClick={() => changePage(roster.page - 1)}>上一页</Action>
              <span aria-live="polite">第 {roster.page} 页 / 共 {roster.totalPages} 页</span>
              <Action disabled={loading || roster.page >= roster.totalPages} onClick={() => changePage(roster.page + 1)}>下一页</Action>
            </nav>
          )}
        </>
      )}
    </main>
  );
}
