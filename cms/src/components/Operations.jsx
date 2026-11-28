'use client';
import { Action, DeskBack, DeskTitle } from './OfficialUI';
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { FiCheckCircle, FiChevronDown, FiClock, FiCornerUpLeft, FiXCircle } from 'react-icons/fi';
import { desk, deskCreateLabels, deskHref, deskSections, deskTabs, sectionForTab, statuses } from './desk';
import AlbumEditor from './AlbumEditor';
import EventEditor from './EventEditor';
import OpsMonitor from './OpsMonitor';
import ProjectEditor from './ProjectEditor';
import HomePinEditor, { HomePinLabel } from './HomePinEditor';
import { matchesFilter, queueFilters } from '../ops/workflow.mjs';
import { eventCategories, eventCategory } from '../../../server/event-categories.mjs';
import { homePinLimit } from '../../../server/home-pins.mjs';
import { useDeskLanguage } from './DeskLanguage';
import { publicAuthorId } from '../../../server/project-author.mjs';
const listPageSize = 20;
const unpinnedPosition = homePinLimit + 1;
const activityFilters = { all: '全部', ...eventCategories };
const projectSources = { all: '全部', event: '零一赛事', independent: '自主投稿' };
const statusIcons = { pending: FiClock, approved: FiCheckCircle, returned: FiCornerUpLeft, rejected: FiXCircle };
const reviewDate = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function ReviewFilters({ tab, filter, counts, onChange }) {
  const { t } = useDeskLanguage();
  const options = queueFilters[tab];
  const total = counts && Object.values(counts).reduce((sum, count) => sum + count, 0);
  return <div className="op-review-filters" role="group" aria-label={t('审核状态')}>
    {Object.entries(options).map(([value, label]) => {
      const Icon = statusIcons[value];
      return <button key={value} type="button" aria-pressed={value === filter} onClick={() => onChange(value)}>
        {Icon && <Icon aria-hidden="true" />}
        <span>{t(value === 'all' ? '全部' : label)}</span>
        <strong>{counts ? value === 'all' ? total : counts[value] || 0 : '—'}</strong>
      </button>;
    })}
  </div>;
}

function Review({ row, events, tab, reload, onEdit }) {
  const { t } = useDeskLanguage();
  const [note, setNote] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const project = tab === 'projects';
  const event = events.find((e) => e.id === row.eventId);
  const Icon = statusIcons[row.status];
  const timestamp = Date.parse(row.createdAt);
  const context = event?.name || (project ? row.externalSource : '');
  const facts = project
    ? []
    : [[t(row.phone ? '电话号码' : '联系方式'), row.phone || row.contact], [t('微信'), row.wechat]];
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
    <details className="editor-row op-review-card">
      <summary>
        <span className="op-review-person">
          <strong className="op-row-title">{row.name}</strong>
          {(context || Number.isFinite(timestamp)) && <span className="op-row-meta">
            {context && <span title={context}>{context}</span>}
            {Number.isFinite(timestamp) && <time dateTime={row.createdAt}>{reviewDate.format(timestamp)}</time>}
          </span>}
          {project && <HomePinLabel position={row.homePinPosition} />}
        </span>
        <span className="op-review-badge" data-status={row.status}>
          {Icon && <Icon aria-hidden="true" />}
          {t(statuses[row.status] || row.status)}
        </span>
        <FiChevronDown aria-hidden="true" />
        {project && row.summary && <span className="op-review-summary">{row.summary}</span>}
      </summary>
      <div className="op-review-content">
        {project && row.summary && <p>{row.summary}</p>}
        {!project && row.accountId && <p><a href={'/admin/community-users?user=' + encodeURIComponent(row.accountId)}>
          {t('查看报名账号')} ↗
        </a></p>}
        {(row.description || row.note) && <p className="op-prose">{row.description || row.note}</p>}
        {row.imageUrl && <img className="op-thumb" src={row.imageUrl} alt={t('作品封面')} loading="lazy" />}
        {row.demoUrl && (
          <a href={row.demoUrl} target="_blank" rel="noreferrer">
            {t('查看项目演示')} ↗
          </a>
        )}
        {(facts.some(([, value]) => value) || Object.keys(row.answers || {}).length > 0) && (
          <dl className="op-review-facts">
            {facts.map(([label, value]) => value && <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            {Object.entries(row.answers || {}).map(([key, value]) => (
              <div key={key}>
                <dt>{row.formFields?.find(field => field.id === key)?.label || event?.formFields?.find(field => field.id === key)?.label || key}</dt>
                <dd>{Array.isArray(value) ? value.join('、') : value}</dd>
              </div>
            ))}
          </dl>
        )}
        {row.status === 'pending' && (
          <>
            <label className="community-field">
              {t('审核备注')}
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <div className="op-line">
              <Action disabled={busy} onClick={() => review('approved')}>
                {t('通过')}
              </Action>
              <Action
                disabled={busy || (project && !note.trim())}
                onClick={() => review(project ? 'returned' : 'rejected')}
              >
                {t(project ? '退回修改' : '婉拒申请')}
              </Action>
            </div>
          </>
        )}
        {row.reviewNote && <p><strong>{t('审核备注')}</strong><br />{row.reviewNote}</p>}
        {row.status === 'returned' && row.createdByStaff && <Action onClick={() => onEdit(row)}>{t('修改并重新提交')}</Action>}
        {error && (
          <div role="alert">
            <p>{t(error)}</p>
            <Action disabled={busy} onClick={reload}>
              {t('重新读取名单')}
            </Action>
          </div>
        )}
        {project && row.author && <p className="op-review-author">
          <span>{t('作者')}</span>
          <a href={row.accountId ? '/admin/community-users?user=' + encodeURIComponent(row.accountId)
            : row.status === 'approved' && !row.ownerId ? '/plaza?view=player&user=' + encodeURIComponent(publicAuthorId(row))
              : deskHref('projects', '&author=' + encodeURIComponent(row.author))}>{row.author} ↗</a>
        </p>}
      </div>
    </details>
  );
}
export default function Operations({ initialTab }) {
  const { t } = useDeskLanguage();
  const [tab, setTab] = useState(Object.hasOwn(deskTabs, initialTab) ? initialTab : 'events'),
    [rows, setRows] = useState([]),
    [events, setEvents] = useState([]),
    [selected, setSelected] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [event, setEvent] = useState(''),
    [filter, setFilter] = useState('all'),
    [category, setCategory] = useState('all');
  const [source, setSource] = useState('all');
  const [author, setAuthor] = useState('');
  const [roster, setRoster] = useState(null);
  const [listPage, setListPage] = useState(1);
  const [addressReady, setAddressReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const rosterPage = useRef(1);
  const rosterEvents = useRef(null);
  const rosterStatus = tab === 'registrations' && filter !== 'all' ? filter : '';
  const editGuard = useRef(null);
  const initialEdit = useRef(null);
  const section = deskSections[sectionForTab(tab)];
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
    const requestedCategory = url.searchParams.get('category');
    if (page === 'events' && Object.hasOwn(eventCategories, requestedCategory)) setCategory(requestedCategory);
    const requestedSource = url.searchParams.get('source');
    if (page === 'projects' && Object.hasOwn(projectSources, requestedSource)) setSource(requestedSource);
    if (page === 'projects') setAuthor((url.searchParams.get('author') || '').slice(0, 80));
    if (page === 'events' || page === 'projects') {
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
          const query = { page: String(rosterPage.current), pageSize: '20', summary: '1' };
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
        if (initialEdit.current) {
          const target = result.find((r) => r.id === initialEdit.current
            && (tab === 'events' || (r.createdByStaff && r.status === 'returned')));
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
    setNotice('');
    setTab(t);
    setFilter('all');
    setCategory('all');
    setSource('all');
    setAuthor('');
    setListPage(1);
    setSelected(null);
    setEvent(eventId);
    rosterEvents.current = null;
    rosterPage.current = 1;
    setRoster(null);
    syncAddress({ tab: t, event: eventId, filter: null, category: null, source: null, author: null, new: null, edit: null, page: null });
    if (t === tab) refresh();
  }
  function edit(row) {
    setNotice('');
    setSelected(row);
    syncAddress({ edit: row.id, new: row.id ? null : '1' });
  }
  function returnToList() {
    if (editGuard.current && !editGuard.current()) return;
    setSelected(null);
    syncAddress({ edit: null, new: null });
    if (tab === 'events') refresh();
  }
  const sourceRows = tab === 'projects' ? rows.filter(row =>
    (source === 'all' || Boolean(row.eventId) === (source === 'event')) && (!author || row.author === author)) : rows;
  const visibleRows = tab === 'registrations' ? roster?.items ?? [] : sourceRows.filter(row =>
    matchesFilter(tab, row, filter) && (tab !== 'events' || category === 'all' || eventCategory(row) === category));
  const localPagination = tab === 'events' || tab === 'projects';
  if (localPagination) {
    visibleRows.sort((a, b) => (a.homePinPosition || unpinnedPosition) - (b.homePinPosition || unpinnedPosition));
  }
  const listPageCount = Math.max(1, Math.ceil(visibleRows.length / listPageSize));
  const currentListPage = Math.min(listPage, listPageCount);
  const displayedRows = localPagination
    ? visibleRows.slice((currentListPage - 1) * listPageSize, currentListPage * listPageSize)
    : visibleRows;
  const reviewList = tab === 'registrations' || tab === 'projects';
  const reviewCounts = tab === 'registrations' ? roster?.statusCounts
    : tab === 'projects' && !loading && !error ? sourceRows.reduce((counts, row) => {
      counts[row.status] = (counts[row.status] || 0) + 1;
      return counts;
    }, Object.create(null)) : undefined;
  function changeFilter(value) {
    if (value === filter) return;
    setFilter(value);
    setListPage(1);
    rosterPage.current = 1;
    syncAddress({ filter: value, page: null });
  }
  if (tab === 'status') return (
    <main className="community-page op-shell">
      <DeskTitle title={deskTabs.status} />
      <OpsMonitor />
    </main>
  );
  if (tab === 'photos') return (
    <main className="community-page op-shell">
      <AlbumEditor title={deskTabs.photos} events={events} eventsLoading={loading} eventsError={error} onRefresh={refresh} />
    </main>
  );
  const creatingProject = tab === 'projects' && selected && !selected.id;
  return (
    <main className="community-page op-shell">
      {!selected && deskCreateLabels[tab] ? (
        <HomePinEditor key={tab} title={section.label} kind={tab} rows={rows}
          disabled={loading || Boolean(error)} onSaved={refresh}>
          <Action onClick={() => edit({})}>＋ {t(deskCreateLabels[tab])}</Action>
        </HomePinEditor>
      ) : (
        <DeskTitle title={section.label}>
          {selected ? !creatingProject && <DeskBack onClick={returnToList} /> :
            <Action onClick={() => { rosterEvents.current = null; refresh(); }}>{t('刷新')}</Action>}
        </DeskTitle>
      )}
      {section.tabs.length > 1 && (
        <nav className="op-tabs" aria-label={t('玩家计划功能')}>
          {section.tabs.map(key => (
            <a href={deskHref(key)} aria-current={tab === key ? 'page' : undefined} key={key}
              onClick={event => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                go(key);
              }}>
              {t(deskTabs[key])}
            </a>
          ))}
        </nav>
      )}
      {selected && tab === 'events' ? (
        <EventEditor
          key={selected.id || 'new'}
          item={selected}
          guard={editGuard}
          onSaved={(id) => {
            syncAddress({ edit: id, new: null });
            refresh();
          }}
        />
      ) : selected && tab === 'projects' ? (
        <ProjectEditor
          key={selected.id || 'new'}
          item={selected}
          events={events}
          guard={editGuard}
          onBack={creatingProject ? returnToList : undefined}
          onSaved={() => {
            setSelected(null);
            setFilter('pending');
            setListPage(1);
            setNotice('作品已提交审核。');
            syncAddress({ edit: null, new: null, filter: 'pending' });
            refresh();
          }}
        />
      ) : (
        <>
          {tab === 'projects' && <h2 className="op-section-title">{t(deskTabs.projects)}</h2>}
          {tab === 'projects' && <div className="op-tabs op-category-tabs" role="group" aria-label={t('投稿来源')}>
            {Object.entries(projectSources).map(([key, label]) =>
              <button type="button" key={key} aria-pressed={source === key} onClick={() => {
                setSource(key);
                setListPage(1);
                syncAddress({ source: key === 'all' ? null : key });
              }}>{t(label)}</button>
            )}
          </div>}
          {author && tab === 'projects' && <div className="op-line">
            <span>{t('作者')} · {author}</span>
            <Action onClick={() => { setAuthor(''); setListPage(1); syncAddress({ author: null }); }}>{t('清除筛选')}</Action>
          </div>}
          {notice && <p role="status">{t(notice)}</p>}
          {tab === 'events' && <div className="op-tabs op-category-tabs" role="group" aria-label={t('活动类型')}>
            {Object.entries(activityFilters).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={category === value} onClick={() => {
                setCategory(value);
                setListPage(1);
                syncAddress({ category: value === 'all' ? null : value });
              }}>{t(label)}</button>
            ))}
          </div>}
          {queueFilters[tab] && (
            <div className={reviewList ? 'op-review-toolbar' : 'op-filters'}>
              {tab === 'registrations' && (
                <label className="community-field">
                  {t('场次')}{' '}
                  <select
                    value={event}
                    onChange={(e) => {
                      setEvent(e.target.value);
                      setRoster(null);
                      rosterPage.current = 1;
                      syncAddress({ event: e.target.value, page: null });
                    }}
                  >
                    <option value="">{t('所有活动')}</option>
                    {registrationOptions}
                  </select>
                </label>
              )}
              {reviewList ? <ReviewFilters tab={tab} filter={filter} counts={reviewCounts} onChange={changeFilter} /> :
                <label className="community-field">
                  {t('发布状态')}
                  <select value={filter} onChange={event => changeFilter(event.target.value)}>
                  {Object.entries(queueFilters[tab]).map(([value, label]) => (
                    <option key={value} value={value}>
                      {t(label)}
                    </option>
                  ))}
                  </select>
                </label>}
              {!loading && !error && (
                <span role="status" className={reviewList ? 'op-review-result-count' : undefined}>
                  {t(tab === 'events' ? '共 {0} 场活动' : '共 {0} 条记录',
                    [tab === 'registrations' ? roster?.total ?? 0 : visibleRows.length])}
                </span>
              )}
            </div>
          )}
          {error ? (
            <p role="alert">{t(error)}</p>
          ) : loading ? (
            <p role="status">{t('正在读取…')}</p>
          ) : (
            <div className={reviewList ? 'op-list op-review-grid' : 'op-list'}>
              {displayedRows.map((r) =>
                tab === 'events' ? (
                  <div className="op-event-row" key={r.id}>
                    <button className="op-event-name" onClick={() => edit(r)}>
                      <strong className="op-row-title">{r.name}</strong>
                      {(category === 'all' || r.date || r.location) && <span className="op-row-meta op-event-meta">
                        {category === 'all' && <span className="op-event-category">{t(eventCategories[eventCategory(r)])}</span>}
                        {[r.date, r.location].filter(Boolean).join(' · ')}
                      </span>}
                    </button>
                    <span className="op-row-status">
                      {t(r.hasDraftChanges ? '有未发布更改' : statuses[r.publicationStatus])}
                      <HomePinLabel position={r.homePinPosition} />
                    </span>
                    <Action onClick={() => go('registrations', r.id)}>{t('报名名单')} ↗</Action>
                  </div>
                ) : (
                  <Review key={r.id} row={r} events={events} tab={tab} reload={refresh} onEdit={edit} />
                ),
              )}
              {!visibleRows.length && (
                <p className="op-empty">
                  {t(filter === 'pending'
                    ? '当前没有待审核的记录。'
                    : filter === 'unpublished'
                      ? '所有活动的草稿都已处理。'
                      : '当前没有符合条件的记录。')}
                  {(filter !== 'all' || category !== 'all' || source !== 'all' || event) && <Action onClick={() => go(tab)}>{t('清除筛选')}</Action>}
                </p>
              )}
            </div>
          )}
          {localPagination && !loading && !error && listPageCount > 1 && (
            <nav className="cu-pagination" aria-label={t('{0}分页', [t(deskTabs[tab])])}>
              <Action disabled={currentListPage <= 1} onClick={() => setListPage(currentListPage - 1)}>{t('上一页')}</Action>
              <span aria-live="polite">{t('第 {0} 页 / 共 {1} 页', [currentListPage, listPageCount])}</span>
              <Action disabled={currentListPage >= listPageCount} onClick={() => setListPage(currentListPage + 1)}>{t('下一页')}</Action>
            </nav>
          )}
          {tab === 'registrations' && !error && roster?.totalPages > 1 && (
            <nav className="cu-pagination" aria-label={t('报名名单分页')}>
              <Action disabled={loading || roster.page <= 1} onClick={() => changePage(roster.page - 1)}>{t('上一页')}</Action>
              <span aria-live="polite">{t('第 {0} 页 / 共 {1} 页', [roster.page, roster.totalPages])}</span>
              <Action disabled={loading || roster.page >= roster.totalPages} onClick={() => changePage(roster.page + 1)}>{t('下一页')}</Action>
            </nav>
          )}
        </>
      )}
    </main>
  );
}
