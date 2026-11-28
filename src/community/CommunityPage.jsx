import ProjectImageFields from './plaza/ProjectImageFields';
import { useEffect, useRef, useState } from 'react';
import { FiArrowUpRight, FiCheck } from 'react-icons/fi';
import PublicPlayer from './account/PublicPlayer';
import SiteBackground from '../components/SiteBackground';
import SiteNavigation from '../components/SiteNavigation';
import { communityApi as api, communityLink as link } from './api';
import { Button, DetailBack, Empty, Field, Form, Frame, Heading, RecruitmentInfo, Source } from './CommunityUi';
import RegistrationForm, { RegistrationList, RegistrationReceipt } from './players/Registration';
import { nextCalendarChange } from './players/events';
import { AccountHeading, AccountReturn, LoginForm, PlayerProfileSettings, PlayerSpace } from './account/AccountForms';
import { accountContinuation, accountLink, announceSessionChange, isPlayerSpaceView, pageLocation, playerSpaceTab, reactionIntent, safeSitePath, linkWithSource, returnDestination } from './account/navigation';
import { watchSession } from './account/watchSession';
import { listFilters } from './filters';
import { acceptsProjectSubmissions, acceptsRecruitment } from '../../server/event-state.mjs';
import './community.css';
import './discovery.css';
import './gallery-detail.css';

const reviewStatuses = { pending: '待审核', approved: '已公开', returned: '退回修改' };
const registrationStatuses = { pending: '待审核', approved: '报名成功', rejected: '未通过' };

async function loadEvent(id) {
  if (!id) return null;
  try {
    return await api('events/' + encodeURIComponent(id));
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

function RecordGroup({ title, empty, children }) {
  return <Frame as="section" className="player-space-card player-record-group" radius={16} flush>
    <h3>{title}</h3>
    {children.length ? <ul>{children}</ul> : <p className="player-record-empty">{empty}</p>}
  </Frame>;
}

function RecordItem({ as, href, children }) {
  return <Frame as={as} href={href} className="player-record-item" radius={10}
    backgroundColor="var(--player-record-surface)" flush>{children}</Frame>;
}
function PlayerAccount({ section, submitted, revision, user, back, tab, notice, onTabChange, onSaved, onLogout, ...spaceProps }) {
  const recordsOpen = tab === 'records';
  const spaceUrl = safeSitePath(pageLocation());
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!recordsOpen) return;
    const controller = new AbortController();
    const read = path => api(path, undefined, undefined, controller.signal);
    setError('');
    Promise.all([read('mine'), read('events'), read('projects')])
      .then(([mine, events, projects]) => {
        if (!controller.signal.aborted) setResult({ mine, events, projects });
      })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [recordsOpen, retry, revision]);
  const saved = recordsOpen && <RecordGroup title="我的收藏"
    empty={error ? '暂时无法读取收藏。' : result ? '还没有收藏项目。' : '正在加载收藏…'}>
    {error || !result ? [] : result.projects.filter(project => project.saved).map(project => <li key={project.id}>
      <RecordItem as="a" href={link('plaza', { project: project.id, from: spaceUrl })}>
        <div>
          <h4>{project.name}</h4>
          <p>{project.author}</p>
        </div>
        <FiArrowUpRight aria-hidden="true" />
      </RecordItem>
    </li>)}
  </RecordGroup>;
  let content;
  if (!recordsOpen) content = <PlayerProfileSettings user={user} back={back} section={section} notice={notice}
    onSaved={onSaved} onLogout={onLogout} />;
  else if (error) content = <Frame className="player-space-card" radius={16} flush>
    <p role="alert">{error}</p><Button onClick={() => setRetry(value => value + 1)}>重试</Button>
  </Frame>;
  else if (!result) content = <Frame className="player-space-card" radius={16} role="status" flush>正在加载参与记录…</Frame>;
  else content = <PlayerSpaceRecords submitted={submitted} result={result} spaceUrl={spaceUrl} />;
  return <PlayerSpace {...spaceProps} user={user} back={back} section={section} tab={tab}
    notice={recordsOpen ? notice : ''} onTabChange={onTabChange} saved={saved}>{content}</PlayerSpace>;
}

function PlayerSpaceRecords({ submitted, result, spaceUrl }) {
  const { mine, events } = result;
  const eventNames = new Map(events.map(event => [event.id, event.name]));
  return <section aria-label="参与记录">
    {submitted && <p className="community-feedback" role="status">作品已提交，当前状态：待审核。</p>}
    <div className="player-space-records">
      <RecordGroup title="我的项目" empty="还没有项目，发布你的第一个想法吧。">
        {mine.projects.map(project => <li key={project.id}>
          <RecordItem as="a" href={link('plaza', { project: project.id, from: spaceUrl })}>
            <div>
              <div className="player-record-title">
                <h4>{project.name}</h4>
                <span>{reviewStatuses[project.status]}</span>
              </div>
              <p>{project.summary}</p>
              {project.reviewNote && <p>修改建议：{project.reviewNote}</p>}
            </div>
            <FiArrowUpRight aria-hidden="true" />
          </RecordItem>
        </li>)}
      </RecordGroup>
      <RecordGroup title="我的报名" empty="还没有报名记录。">
        {mine.registrations.map(row => {
          const name = eventNames.get(row.eventId);
          return <li key={row.id}>
            <RecordItem as="a" href={linkWithSource(link('players', { view: 'receipt', event: row.eventId, receipt: row.id }),spaceUrl)}>
              <div>
                <div className="player-record-title">
                  <h4>{name || '历史活动'}</h4>
                  <span>{registrationStatuses[row.status] || '状态待确认'}</span>
                </div>
                <p>报名编号：{row.id}</p>
              </div>
              {name && <FiArrowUpRight aria-hidden="true" />}
            </RecordItem>
          </li>;
        })}
      </RecordGroup>
    </div>
  </section>;
}
function RecruitmentFields({ value }) { return <fieldset><legend>招募信息</legend><Field label="希望招募的伙伴" name="roles" defaultValue={value?.roles} required maxLength={1500} placeholder="例如：1 位前端开发、1 位产品设计伙伴" /><Field label="参与内容" name="work" defaultValue={value?.work} multiline required maxLength={1500} /><Field label="具体要求" name="requirements" defaultValue={value?.requirements} multiline required maxLength={1500} /><Field label="公开联系方式" name="contact" defaultValue={value?.contact} required maxLength={1500} /><p className="community-muted">联系方式将公开展示，请填写你愿意公开的联系渠道。</p></fieldset>; }
const recruitFrom = values => ({ roles: values.roles, work: values.work, requirements: values.requirements, contact: values.contact });
function ProjectForm({ event, events, existing, user, onComplete, back }) {
  const draftKey = `community-draft-${user.id}-${existing?.id || event?.id || 'independent'}`;
  const [draft] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(draftKey) || 'null'); }
    catch { return null; }
  });
  const [recruiting, setRecruiting] = useState(draft ? draft.recruiting === 'on' : Boolean(existing?.recruitment));
  const [source, setSource] = useState(event ? 'event' : draft?.submissionSource ?? (draft ? 'independent' : ''));
  const [selectedEventId, setSelectedEventId] = useState(event?.id ?? draft?.eventId ?? '');
  const availableEvents = events.filter(item => acceptsProjectSubmissions(item));
  const selectedEvent = existing ? event : source === 'event' ? availableEvents.find(item => item.id === selectedEventId) : null;
  const independent = existing ? !existing.eventId : source === 'independent';

  async function submitProject({ submissionSource, ...values }) {
    if (!existing && submissionSource !== 'independent' && !selectedEvent) throw Error('请选择开放投稿的活动。');
    const result = await api(existing ? `edit/${existing.id}` : 'projects', {
      ...values, showcaseImages: JSON.parse(values.showcaseImages || '[]'), eventId: selectedEvent?.id, recruitment: recruiting ? recruitFrom(values) : null,
    }, user.id);
    onComplete(result);
  }

  return <div className="community-narrow"><Frame>
    <div className="community-page-return"><AccountReturn href={back} /></div>
    <Form draftKey={draftKey} submit="提交审核" onSubmit={submitProject}>
    {!existing && <fieldset className="project-submission-source">
      <legend>投稿类型</legend>
      <div className="project-submission-source-options">
        <label className="community-check"><input type="radio" name="submissionSource" data-draft-controlled value="event" checked={source === 'event'} required onChange={() => setSource('event')} />玩家计划</label>
        <label className="community-check"><input type="radio" name="submissionSource" data-draft-controlled value="independent" checked={source === 'independent'} required onChange={() => setSource('independent')} />自主投稿</label>
      </div>
      {source === 'event' && <label className="community-field">
        <span>选择活动 *</span>
        <select name="eventId" data-draft-controlled value={selectedEvent?.id || ''} onChange={e => setSelectedEventId(e.target.value)} required>
          <option value="">{availableEvents.length ? '请选择活动' : '暂无开放投稿的活动'}</option>
          {availableEvents.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>}
    </fieldset>}
    <Field label="项目名称" name="name" defaultValue={existing?.name} required maxLength={80} />
    <Field label="项目简介" name="summary" defaultValue={existing?.summary} required maxLength={20} />
    <Field label="完整介绍" name="description" defaultValue={existing?.description} multiline required placeholder="想解决什么问题？已经做到了哪一步？接下来想做什么？" />
    <ProjectImageFields value={draft || existing} />
    <Field label="项目链接（选填）" name="demoUrl" type="url" defaultValue={existing?.demoUrl} placeholder="https://…" />
    {!existing?.eventId && <div hidden={!independent}>
      <Field label="外部活动名称（选填）" name="externalSource" defaultValue={existing?.externalSource} disabled={!independent} maxLength={100} />
    </div>}
    <label className="community-check"><input name="recruiting" type="checkbox" checked={recruiting} onChange={e => setRecruiting(e.target.checked)} />这个项目正在招募伙伴</label>
    {recruiting && <RecruitmentFields value={existing?.recruitment} />}
  </Form></Frame></div>;
}

const withAccountSession = session => ({ ...session, events: [], projects: [], recruitments: [] });

export default function CommunityPage({ section, Listing, Detail }) {
  const [search, setSearch] = useState(() => window.location.search);
  const query = new URLSearchParams(search);
  const requestedView = query.get('view');
  const spaceView = isPlayerSpaceView(requestedView);
  const requestedTab = query.get('tab');
  const tab = playerSpaceTab(requestedView, requestedTab);
  const view = spaceView ? 'account' : requestedView;
  const eventId = query.get('event'), projectId = query.get('project');
  const [data, setData] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [recordsRevision, setRecordsRevision] = useState(0);
  const requestVersion = useRef(0);
  const accountView = spaceView || view === 'login';
  const isProtected = accountView || ['publish','team','review'].includes(view);
  const isListing = !view && !eventId && !projectId;
  const load = async (knownSession) => {
    const ticket = ++requestVersion.current;
    const commit = payload => {
      if (ticket === requestVersion.current) { setData(payload);setError(''); }
    };
    if (accountView) {
      const session=knownSession || await api('session');
      commit(withAccountSession(session));
      return;
    }
    if (view === 'player') {
      const [session, profile, events] = await Promise.all([
        knownSession || api('session'),
        api('profiles/' + encodeURIComponent(query.get('user') || '')).catch(error => { if (error.status === 404) return null; throw error; }),
        api('events'),
      ]);
      commit({...session, profile, events, projects:[], recruitments:[]});
      return;
    }
    // Registration and receipt pages share the existing public event and account session.
    if (['register', 'receipt', 'tickets'].includes(view)) {
      const [event, session, catalog] = await Promise.all([loadEvent(eventId), api('session').catch(() => ({ user: null })), view === 'tickets' ? api('events') : []]);
      const mine = view === 'register' && session.user ? await api('mine') : null;
      commit({ ...session, events: event ? [event] : catalog, projects: [], recruitments: [], mine });
      return;
    }
    const eventDetail = Boolean(eventId) && !view;
    const needsProjects = section === 'plaza' && isListing || eventDetail;
    const projectList = eventDetail ? 'projects?event=' + encodeURIComponent(eventId) : 'projects';
    const singleEvent = section === 'players' && eventDetail;
    const [session, eventData, projects, recruitments] = await Promise.all([
      knownSession || api('session'),
      singleEvent ? loadEvent(eventId) : api('events'),
      needsProjects ? api(projectList) : [],
      eventDetail ? api('recruitments?event=' + encodeURIComponent(eventId)) : [],
    ]);
    const events = singleEvent ? [eventData].filter(Boolean) : eventData;
    const needsMine = session.user && (eventDetail || ['publish', 'team'].includes(view));
    const reviewing = session.user?.role === 'admin' && view === 'review';
    const [mine, review, project] = await Promise.all([
      needsMine ? api('mine') : null,
      reviewing ? api('review') : [],
      projectId ? api(`projects/${encodeURIComponent(projectId)}`).catch(err => ({ unavailable: err.message })) : null,
    ]);
    commit({ ...session, events, projects, recruitments, mine, review, project });
  };
  const reload = session => {
    const response = load(session);
    const version = requestVersion.current;
    return response.catch(err => {if(version===requestVersion.current)setError(err.message);});
  };
  useEffect(() => { reload(); return () => {requestVersion.current++;}; }, []);
  useEffect(() => {
    if(!data)return;
    return watchSession(data.user,isProtected,session=>{
      setData(null);
      setError('');
      setNotice('');
      reload(session);
    });
  }, [data,view,isProtected]);
  const replaceAddress = next => {
    window.history.replaceState(window.history.state, '', next);
    setSearch(next.search);
  };
  const changeTab = nextTab => {
    const next = new URL(window.location.href);
    next.searchParams.set('view', 'account');
    if (nextTab === 'records') next.searchParams.delete('tab');
    else next.searchParams.set('tab', nextTab);
    replaceAddress(next);
    setNotice('');
  };
  useEffect(() => {
    if (spaceView && (requestedView !== 'account' || requestedTab === 'password')) changeTab(tab);
  }, [requestedView, requestedTab, spaceView, tab]);
  const [calendarTime, setCalendarTime] = useState(Date.now);
  useEffect(() => {
    if (!data || (section !== 'players' && view !== 'publish')) return;
    const refresh = () => setCalendarTime(Date.now());
    const deadline = nextCalendarChange(data.events, calendarTime);
    const timer = Number.isFinite(deadline) ? window.setTimeout(refresh, Math.min(2147483647, Math.max(0, deadline - Date.now()))) : null;
    const visible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('pageshow', refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('pageshow', refresh);
    };
  }, [section, view, data, calendarTime]);
  const event = data?.events.find(e => e.id === eventId), user = data?.user;
  const showLogin = isProtected && !user;
  const register = query.get('mode') === 'signup';
  const sectionTitle = section === 'players' ? '玩家计划' : '共创广场';
  const registrationTitle = { register: '活动报名', receipt: '报名票根', tickets: '我的报名' }[view];
  const headerTitle = registrationTitle || (showLogin && (data || view === 'login') ? (register ? '注册账号' : '登陆账号')
    : accountView ? '玩家空间'
    : view === 'publish' ? (query.get('edit') ? '修改项目' : eventId ? '提交本场作品' : '发布你的项目')
    : view === 'team' ? '发布组队招募'
    : view === 'player' ? '玩家主页'
    : view === 'review' ? '作品审核' : sectionTitle);
  useEffect(() => { document.title = `${headerTitle} · 零一玩家`; }, [headerTitle]);
  const defaultBack = eventId ? link('players', {event:eventId,...listFilters('players',query)})
    : projectId ? link('plaza',{project:projectId,...listFilters('plaza',query)}) : link(section,listFilters(section,query));
  const backUrl = returnDestination(query.get(view === 'login' ? 'returnTo' : 'from'),defaultBack,pageLocation());
  const action = view==='login' ? reactionIntent(query,backUrl) : null;
  const continuation = view==='account' ? accountContinuation(query.get('continue'), backUrl) : null;
  const askReaction = (project, kind) => {
    const destination = projectId === project.id ? pageLocation()
      : link('plaza', { project: project.id, ...listFilters('plaza', new URLSearchParams(location.search)) });
    location.assign(accountLink('login', destination, section, { project: project.id, intent: kind }));
  };
  const finishLogin = async (session) => {
    const next = new URL(accountLink('account', backUrl, section, {
      tab: spaceView && tab !== 'records' ? tab : undefined,
      continue: ['publish','team'].includes(view) ? safeSitePath(pageLocation(), '') : undefined,
    }), location.origin);
    const ticket = ++requestVersion.current;
    replaceAddress(next);
    setData(withAccountSession(session));
    setError('');
    setNotice('');
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.getElementById('community-main')?.focus({ preventScroll: true });
    if(action) {
      const verb = action.kind === 'like' ? '点赞' : '收藏';
      try {
        await api('reaction/'+encodeURIComponent(action.project),{kind:action.kind,active:true},session.user.id);
        if (ticket === requestVersion.current) {
          setNotice(`已${verb}这件作品。`);
          setRecordsRevision(value => value + 1);
        }
      } catch {
        if (ticket === requestVersion.current) setNotice(`已登录，刚才的${verb}未完成，请再试一次。`);
      }
    }
  };
  const reactToProject = async (project, kind) => {
    if (busy) return;
    if (!user) { askReaction(project, kind); return; }
    setBusy(true);
    setNotice('');
    try {
      const active = !(kind === 'like' ? project.liked : project.saved);
      await api(`reaction/${encodeURIComponent(project.id)}`, { kind, active }, user.id);
      await load();
    } catch (error) {
      if (error.status === 401) askReaction(project, kind);
      else setNotice(error.message);
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    await api('logout',{},user.id);
    announceSessionChange();
    const target=new URL(backUrl,location.origin);
    const targetView = target.searchParams.get('view');
    location.replace(isPlayerSpaceView(targetView) || ['publish','team','review'].includes(targetView) ? link(section) : backUrl);
  };
  const context = pageLocation();
  const accountActions = <>
    <Button size="sm" shineOnInteraction={section === 'players'} href={accountLink('account',context,section)}>玩家空间</Button>
    {user?.role==='admin' && <Button size="sm" href={accountLink('review',context,section)}>审核管理</Button>}
  </>;
  let content;
  if (!data) content = <Empty><span role={error ? 'alert' : 'status'}>{error || (isProtected ? '正在检查登录状态…' : '正在加载活动与作品…')}</span>{error && <Button onClick={() => {setError('');reload();}}>重试</Button>}</Empty>;
  else if (showLogin) content = <LoginForm key={view || 'guest'} title={headerTitle} register={register} onSuccess={finishLogin} onModeChange={nextRegister => {
    const next = new URL(window.location.href);
    if (nextRegister) next.searchParams.set('mode', 'signup');
    else next.searchParams.delete('mode');
    replaceAddress(next);
  }}
    purpose={action ? `登录后将继续${action.kind==='like'?'点赞':'收藏'}这件作品。` : ({publish:'登录后可从玩家空间继续提交项目。',team:'登录后可从玩家空间继续发布组队招募。',review:'使用官网头号玩家账号查看审核任务。'})[view]}
    notice={query.get('authNotice')==='password-changed'?'密码已更新，请使用新密码重新登录。':null}/>;
  else if (accountView) content = <PlayerAccount key={user.id} user={user} back={backUrl} section={section}
    onLogout={logout} continuation={continuation} action={action} onContinue={() => finishLogin(data)}
    notice={notice} tab={tab} onTabChange={changeTab} submitted={query.get('submitted')} revision={recordsRevision}
    onSaved={profile => {
      setData(current => current?.user?.id === profile.id ? { ...current, user: profile } : current);
      setNotice('玩家资料已保存。');
      announceSessionChange();
    }} />;
  else if (eventId && !event && !['publish','team','register','receipt','tickets'].includes(view)) content = <div className="event-detail-meta">
    <p>没有找到这场活动。</p><DetailBack href={link('players',listFilters('players',query))} inline>返回</DetailBack>
  </div>;
  else if (view === 'publish') {
    const existing = query.get('edit') ? data.mine.projects.find(p => p.id === query.get('edit')) : null;
    const projectEvent = existing ? data.events.find(item => item.id === existing.eventId) : event;
    const blocked = (query.get('edit') && !existing && '无法修改此项目。') ||
      (!existing && eventId && !event && '没有找到这场活动。') ||
      (!existing && event && !acceptsProjectSubmissions(event) && '本场暂未开放作品提交。');
    content = blocked ? <div className="community-narrow">
      <div className="community-page-return"><AccountReturn href={backUrl} /></div><Empty>{blocked}</Empty>
    </div> : <ProjectForm key={user.id+':'+(existing?.id || event?.id || 'new')} event={projectEvent} events={data.events} existing={existing} user={user} back={backUrl} onComplete={project => location.assign(link(section, { view: 'account', submitted: project.id }))} />;
  } else if (view === 'team') {
    content = <div className="community-narrow recruitment-editor">
      {acceptsRecruitment(event) ? <>
        <Frame>
          {data.mine.projects.length ? <Form key={user.id} submit="发布招募" secondaryAction={<AccountReturn href={backUrl} />}
            onSubmit={async values => {
            await api('recruitments', { ...values, eventId, recruitment: recruitFrom(values) }, user.id);
            const filters = listFilters('players', new URL(backUrl, location.origin).searchParams);
            location.href = link('players', { event: eventId, posted: '1', ...filters });
          }}>
            <label className="community-field">
              <span>关联我的项目 *</span>
              <select name="projectId" required defaultValue="">
                <option value="" disabled>选择你的项目</option>
                {data.mine.projects.map(project => <option key={project.id} value={project.id}>{project.name} · {reviewStatuses[project.status]}</option>)}
              </select>
            </label>
            <Field label="招募标题" name="title" required maxLength={100} />
            <Field label="项目简介" name="description" multiline required maxLength={30} placeholder="用不超过 30 个字介绍项目" />
            <RecruitmentFields />
          </Form> : <><div className="community-page-return"><AccountReturn href={backUrl} /></div><Empty>先发布一个项目，再为它寻找队友。<Button href={link('plaza', { view: 'publish' })}>创建我的项目</Button></Empty></>}
        </Frame>
      </> : <><div className="community-page-return"><AccountReturn href={backUrl} /></div><Empty>{eventId && !event ? '没有找到这场活动。' : '本场暂不接受组队招募。'}</Empty></>}
    </div>;
  } else if (view === 'player') {
    content = <PublicPlayer profile={data.profile} events={data.events} back={backUrl} />;
  } else if (view === 'register') {
    const back = <DetailBack href={event ? backUrl : link('players', listFilters('players',query))} inline>返回</DetailBack>;
    content = event ? <RegistrationForm key={event.id} event={event} user={user} existing={data.mine?.registrations.find(row => row.eventId === event.id)} />
      : <div className="event-detail-meta"><p>{eventId ? '没有找到这场活动。' : '请选择想报名的活动。'}</p>{back}</div>;
  } else if (view === 'receipt') {
    content = <RegistrationReceipt key={query.get('receipt')} id={query.get('receipt')} event={event} user={user} />;
  } else if (view === 'tickets') {
    content = <RegistrationList user={user} events={data.events} />;
  } else if (view === 'review') {
    content = <>
      {user.role === 'admin' ? <>
        <p className="account-description">{data.review.length} 个项目等待审核。通过后，作品会出现在共创广场与关联活动中。</p>
        <div className="account-page-actions">{accountActions}</div>
        <div className="community-stack">{data.review.length ? data.review.map(project => <ReviewCard key={project.id} project={project} user={user} events={data.events} onReviewed={load} />) : <Empty>目前没有待审核项目。</Empty>}</div>
        <ReviewRegistrations key={user.id} events={data.events} />
      </> : <Empty>此页面仅对官网头号玩家开放。</Empty>}
    </>;

  } else if (event || projectId) {
    content = <Detail data={data} event={event} query={query} user={user}
      busy={busy} load={load} reactToProject={reactToProject} />;
  } else {
    content = <Listing data={data} busy={busy} reactToProject={reactToProject} />;
  }
  const galleryDetail = !view && Boolean(eventId || projectId);
  return <div className={`community-page community-page--${section} ${showLogin ? 'community-page--account-access' : 'community-page--branded'}${isListing ? ' community-page--listing' : ''}${galleryDetail ? ' community-page--detail' : ''}`}>
    <a className="skip-link" href="#community-main">跳到主要内容</a>
    <SiteBackground />
    <SiteNavigation standalone mobileDetail textOnly={showLogin} accountUser={user || null} accountSection={section} accountSource={accountView ? backUrl : undefined}
      headerTools={section === 'players' && !showLogin ? <Button size="sm" shineOnInteraction className="nav-control site-tickets-link" href={view === 'tickets' ? pageLocation() : linkWithSource(link('players', {view:'tickets'}))}>我的报名</Button> : undefined}
      headerBrand={showLogin ? undefined : <AccountHeading title={headerTitle} as={isProtected || isListing ? 'h1' : 'span'} />} />
    <div className="community-shell">
      <main id="community-main" tabIndex={-1}>
        {!accountView && (notice || user && query.get('authNotice')==='reaction-failed') && <p className="community-feedback" role="status">{notice || '已登录，刚才的操作未完成，请再试一次。'}</p>}
        {content}
      </main>
    </div>
  </div>;
}
function ReviewRegistrations({ events }) {
  const [requested, setRequested] = useState({ page: 1 });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api('registrations?page=' + requested.page, undefined, undefined, controller.signal)
      .then(page => { if (!controller.signal.aborted) setResult(page); })
      .catch(err => {
        if (controller.signal.aborted) return;
        if (err.status === 401 || err.status === 403) setResult(null);
        setError(err.message);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [requested]);

  return <section aria-labelledby="review-signups" aria-busy={loading}>
    <h2 id="review-signups" className="community-section-title">
      活动报名{result && ' · ' + result.total}
    </h2>
    {error && <p role="alert">{error} <button className="community-text-button"
      onClick={() => setRequested({ page: requested.page })}>重试</button></p>}
    {!result && loading && <p role="status">正在读取报名名单…</p>}
    {result && <>
      {result.totalPages > 1 && <nav className="community-heading-actions" aria-label="活动报名分页">
        <button className="community-text-button" disabled={loading || result.page <= 1}
          onClick={() => setRequested({ page: result.page - 1 })}>上一页</button>
        <span aria-live="polite">第 {result.page} 页 / 共 {result.totalPages} 页</span>
        <button className="community-text-button" disabled={loading || result.page >= result.totalPages}
          onClick={() => setRequested({ page: result.page + 1 })}>下一页</button>
      </nav>}
      {result.items.map(r => <Frame key={r.id}>
        <h3>{r.name} · {events.find(e => e.id === r.eventId)?.name || '历史活动'}</h3>
        <p>{r.phone ? `电话号码：${r.phone}` : `联系方式：${r.contact}`}</p>{r.wechat && <p>微信：{r.wechat}</p>}<p>{r.note}</p>
      </Frame>)}
    </>}
  </section>;
}
function ReviewCard({ project, user, events, onReviewed }) {
  const [note, setNote] = useState(''), [error,setError]=useState(''), [busy,setBusy]=useState(false);
  const review = async status => { setBusy(true); setError(''); try { await api(`review/${project.id}`,{status,note},user.id); await onReviewed(); } catch(err) {setError(err.message);} finally {setBusy(false);} };
  return <Frame><h2><a href={link('plaza',{project:project.id})}>{project.name}<FiArrowUpRight /></a></h2><p>{project.summary}</p><p className="community-muted">作者：{project.author} · <Source project={project} events={events} /></p><p className="community-prose">{project.description}</p>{project.imageUrl&&<a href={project.imageUrl} target="_blank" rel="noopener noreferrer">查看封面图片</a>}{project.demoUrl&&<p><a href={project.demoUrl} target="_blank" rel="noopener noreferrer">打开演示链接<FiArrowUpRight /></a></p>}{project.recruitment&&<RecruitmentInfo value={project.recruitment} />}<Field label="退回修改建议（退回时必填）" name="reviewNote" value={note} onChange={e=>setNote(e.target.value)} maxLength={1500} />{error&&<p role="alert">{error}</p>}<div className="community-inline"><Button disabled={busy} onClick={()=>review('approved')}>审核通过<FiCheck /></Button><Button disabled={busy} onClick={()=>review('returned')}>退回修改</Button></div></Frame>;
}

