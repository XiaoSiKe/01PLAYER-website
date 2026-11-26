import { useEffect, useState } from 'react';
import { FiArrowRight, FiArrowUpRight, FiCalendar, FiMapPin, FiPlus, FiSearch } from 'react-icons/fi';
import CommunityPage from '../CommunityPage';
import { siteAsset } from '../../editorial/content';
import { Button, DetailBack, DetailHero, DetailSections, DetailShare, Empty, Form, Frame, ListingCard, ProjectGrid, RecruitmentInfo } from '../CommunityUi';
import { communityLink as link, communityApi as api } from '../api';
import ChoiceMenu from '../../components/ChoiceMenu';
import ResponsiveImage from '../../components/ResponsiveImage';
import { accountLink, pageLocation } from '../account/navigation';
import SignupHandoff from './SignupHandoff';
import SignupGuide from './SignupGuide';
import { eventCategories, eventCategory } from '../../../server/event-categories.mjs';
import { eventDate, eventLocationLabel, eventStatuses, eventStatus, sortCalendarEvents } from './events';
import { listFilters, matchesSearch, selectedOption, updateFilters } from '../filters';

const samplePosters = {
  'weekend-lab': { src: '/images/activity-photos/activity-14-kaiwu-venue.jpg', position: 'center 91%' },
  'ai-build-sprint': { src: '/images/activity-photos/activity-16-kaiwu-venue.jpg', position: 'center 25%' },
  'autumn-hack': { src: '/images/activity-photos/activity-05.jpg' },
};
const categoryOptions = [
  { id: 'all', label: '全部模块' },
  ...['competition', 'salon'].map(id => ({ id, label: eventCategories[id] })),
];
const statusOptions = [{ id: 'all', label: '全部状态' }, ...Object.entries(eventStatuses).map(([id, label]) => ({ id, label }))];

function EventPoster({ event, eager = false }) {
  const [failed, setFailed] = useState('');
  const sample = !event.coverUrl && event.example ? samplePosters[event.id] : null;
  const image = event.coverUrl || sample?.src;
  const available = image && failed !== image;
  return <div className="event-poster">
    <img aria-hidden="true" className="event-poster-mark" src={siteAsset('/images/club-logo-white.svg')} alt="" />
    {available && <ResponsiveImage className="event-poster-image" src={image} alt="" fit="cover"
      style={sample?.position ? { objectPosition: sample.position } : undefined} eager={eager} onError={() => setFailed(image)} />}
  </div>;
}

function EventFacts({ event }) {
  const date = eventDate(event);
  const location = eventLocationLabel(event.location);
  return <div className="calendar-facts">
    {date && <span><FiCalendar aria-hidden="true" />{date}</span>}
    {location && <span><FiMapPin aria-hidden="true" />{location}</span>}
  </div>;
}

function EventLabels({ event, now, featured = false }) {
  const status = eventStatus(event, now);
  const category = eventCategory(event);
  const displayCategory = featured && category === 'activity' ? 'salon' : category;
  return <div className="calendar-labels">
    <span data-event-status={status}>{eventStatuses[status]}</span>
    {displayCategory !== 'activity' && <span>{eventCategories[displayCategory]}</span>}
  </div>;
}

function FeaturedEvent({ event, filters, now }) {
  return <Frame as="a" className="calendar-lead" radius={12} flush href={link('players', { event: event.id, ...filters })}>
    <div className="calendar-card-text">
      <EventLabels event={event} now={now} featured />
      <div className="calendar-lead-details">
        <h2 className="calendar-event-title">{event.name}</h2>
        {event.subtitle && <p>{event.subtitle}</p>}
        <EventFacts event={event} />
      </div>
    </div>
    <EventPoster event={event} eager />
  </Frame>;
}

function EventCard({ event, filters, now }) {
  return <ListingCard className="calendar-card" href={link('players', { event: event.id, ...filters })} heading="h3"
    title={event.name} cover={<EventPoster event={event} />} labels={<EventLabels event={event} now={now} />}
    summary={event.subtitle || event.description} footer={<EventFacts event={event} />} />;
}

function PlayersListing({ data }) {
  const initial = new URLSearchParams(window.location.search);
  const [status, setStatus] = useState(selectedOption(statusOptions, initial.get('filter')));
  const [category, setCategory] = useState(selectedOption(categoryOptions, initial.get('category')));
  const [search, setSearch] = useState(initial.get('q') || '');
  useEffect(() => updateFilters('players', { filter: status, category, q: search }), [status, category, search]);
  const filters = listFilters('players', {filter:status, category, q:search});
  const filtering = Object.keys(filters).length > 0;
  const now = Date.now();
  const events = sortCalendarEvents(data.events, now);
  const featured = events.slice(0, 2);
  const featuredIds = new Set(featured.map(event => event.id));
  const matches = events.filter(event => (filtering || !featuredIds.has(event.id))
    && (status === 'all' || eventStatus(event, now) === status)
    && (category === 'all' || eventCategory(event) === category)
    && matchesSearch([event.name, event.subtitle, event.type, event.location, eventLocationLabel(event.location), event.description], search));
  return <>
    <section className="calendar-highlights" aria-label="优先展示与报名">
      {featured.length > 0 && <div className="calendar-featured">
        {featured.map(event => <FeaturedEvent key={event.id} event={event} filters={filters} now={now} />)}
      </div>}
      <SignupGuide />
    </section>
    <section id="calendar-heading" aria-labelledby="calendar-title" className="calendar-program">
      <header className="calendar-tools">
        <h2 id="calendar-title" className="calendar-head">{featured.length ? '更多活动' : '活动日程'}</h2>
        <div className="calendar-categories" role="group" aria-label="活动分类">
          {categoryOptions.map(({ id, label }) => (
            <Button key={id} size="sm" shineOnInteraction className="filter-choice" aria-pressed={category === id} onClick={() => setCategory(id)}>{label}</Button>
          ))}
        </div>
        <div className="calendar-controls">
          <ChoiceMenu compact shineOnInteraction label="活动状态" value={status} onChange={setStatus} options={statusOptions} />
          <Button as="label" size="sm" shineOnInteraction className="community-search community-search--specular">
            <FiSearch aria-hidden="true" /><input type="search" aria-label="搜索玩家计划" placeholder="搜索玩家计划" value={search} onChange={e => setSearch(e.target.value)} />
          </Button>
        </div>
      </header>
      <span className="discovery-sr-only" role="status" aria-atomic="true">共 {matches.length} 场活动</span>
      {matches.length ? <div className="calendar-cards">{matches.map(event => <EventCard key={event.id} event={event} filters={filters} now={now} />)}</div> : <Empty>{filtering ? '没有找到符合条件的活动。' : featured.length ? '其余活动公布后会出现在这里。' : '活动公布后会出现在这里。'}</Empty>}
    </section>
  </>;
}

function EventDetail({ data, event, query, user, load }) {
  const filters = listFilters('players', query);
  const back = link('players', filters);
  if (!event) return <div className="event-detail-meta"><p>没有找到这场活动。</p><DetailBack href={back} inline shineOnInteraction>返回</DetailBack></div>;
  const eventContext = { event: event.id, ...filters };
  const teams = data.recruitments.filter(item => item.eventId === event.id);
  const selected = teams.find(item => item.id === query.get('recruit'));
  const works = data.projects.filter(item => item.eventId === event.id);
  const active = event.status === 'active';
  const ended = event.status === 'ended';
  const hasWorks = ended || works.length > 0;
  const hasRules = event.rules?.length > 0;
  const date = eventDate(event);
  const deadline = eventDate({ startsAt: event.registrationClosesAt });
  const sections = [{ id: 'event-overview', label: '概览' }];
  if (hasRules) sections.push({ id: 'event-rules', label: '参与规则' });
  if (active) sections.push({ id: 'event-teams', label: '组队招募' });
  if (hasWorks) sections.push({ id: 'event-works', label: '本场作品' });
  return <div className="discovery-detail discovery-detail--event">
    <DetailHero title={event.name} subtitle={event.subtitle}>
      <EventPoster event={event} eager />
    </DetailHero>
    <div className="gallery-detail-inner">
      <DetailSections label="活动详情目录" sections={sections}>
        {eventStatus(event) === 'open' && <a className="gallery-demo-link" href="#event-entry-title">活动报名</a>}
        <DetailShare label="分享活动" />
      </DetailSections>
      <div className="event-detail-layout">
        <aside className="event-entry detail-sidebar" aria-labelledby="event-entry-title">
          <h2 className="detail-section" id="event-entry-title">活动信息</h2>
          <EventLabels event={event} />
          {(date || deadline || event.location) && <dl className="event-entry-facts">
            {date && <div><dt>活动时间</dt><dd>{date}</dd></div>}
            {deadline && <div><dt>报名截止时间</dt><dd>{deadline}</dd></div>}
            {event.location && <div><dt>活动地点</dt><dd>{event.location}</dd></div>}
          </dl>}
          {event.status === 'open' && <SignupHandoff event={event} embedded />}
          {active && <section className="event-entry-actions">
            <h3>参与方式</h3>
            <Button href={accountLink('team',pageLocation(),'players',{event:event.id})}>发布组队招募 <FiPlus aria-hidden="true" /></Button>
            {event.submissionsOpen && <Button href={accountLink('publish',pageLocation(),'players',{event:event.id})}>提交本场作品 <FiArrowRight aria-hidden="true" /></Button>}
          </section>}
          {ended && <Button size="sm" className="discovery-action" href="#event-works">查看本场作品 <FiArrowRight aria-hidden="true" /></Button>}
          {event.hasAlbum && <a className="event-album-link" href={`./?page=time-machine&event=${encodeURIComponent(event.id)}`}>查看本场影像 <FiArrowUpRight /></a>}
          {user?.role === 'admin' && <EventStatusForm event={event} user={user} onSaved={load} />}
        </aside>
        <div className="event-intro">
          <section className="community-prose detail-section" id="event-overview"><h2>活动介绍</h2><p>{event.description}</p></section>
          {hasRules && <section className="community-prose detail-section" id="event-rules"><h2>参与规则</h2><ol>{event.rules.map((rule, index) => <li key={index}>{rule}</li>)}</ol></section>}
        </div>
      </div>
      {query.get('posted') && <p className="community-feedback" role="status">招募已发布。</p>}
      {active && <section className="event-linked detail-section" id="event-teams"><h2>本场组队招募 <small>{teams.length}</small></h2>
        {selected ? <Frame><DetailBack href={link('players', eventContext)}>本场全部招募</DetailBack><h3>{selected.title}</h3><p>{selected.description}</p><p>发布者 · {selected.author}</p><RecruitmentInfo value={selected} />{selected.projectPublic && <Button href={link('plaza', { project: selected.projectId })}>查看关联项目 <FiArrowUpRight /></Button>}</Frame>
          : teams.length ? <div className="community-stack">{teams.map(team => <Frame key={team.id}><a className="community-team-link" href={link('players', { ...eventContext, recruit: team.id })}><h3>{team.title} <FiArrowUpRight /></h3><p>{team.description}</p><p>{team.roles} · {team.author}</p></a></Frame>)}</div> : <Empty>本场还没有队伍发布招募。</Empty>}
      </section>}
      {hasWorks && <section className="event-linked detail-section" id="event-works"><h2>本场作品 <small>{works.length}</small></h2><ProjectGrid projects={works} events={data.events} /></section>}
    </div>
  </div>;
}

export default function PlayersPage() {
  return <CommunityPage section="players" Listing={PlayersListing} Detail={EventDetail} />;
}

function EventStatusForm({ event, user, onSaved }) {
  return <details className="community-demo-login"><summary>管理活动状态</summary><Form submit="保存活动状态" onSubmit={async values => { await api(`event-status/${event.id}`, { status: values.status, submissionsOpen: values.submissionsOpen === 'on' },user.id); await onSaved(); }}>
    <label className="community-field"><span>活动状态</span><select name="status" defaultValue={event.status}><option value="open">报名中</option><option value="active">进行中</option><option value="ended">已结束</option></select></label>
    <label className="community-check"><input type="checkbox" name="submissionsOpen" defaultChecked={event.submissionsOpen} />开放作品提交（仅进行中生效）</label>
    <p className="community-muted">开始活动时自动建立时光机专题；已结束活动保留原有作品与照片。</p>
  </Form></details>;
}

