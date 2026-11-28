import FilterSearch from '../FilterSearch';
import { useEffect, useState } from 'react';
import { FiArrowRight, FiArrowUpRight, FiCalendar, FiMapPin } from 'react-icons/fi';
import CommunityPage from '../CommunityPage';
import { siteAsset } from '../../editorial/content';
import { Button, DetailBack, DetailHero, DetailSections, DetailShare, Empty, Form, Frame, HomePinBadge, ListingCard, ProjectGrid, RecruitmentInfo } from '../CommunityUi';
import { communityLink as link, communityApi as api } from '../api';
import ChoiceMenu from '../../components/ChoiceMenu';
import ResponsiveImage from '../../components/ResponsiveImage';
import { accountLink, pageLocation, linkWithSource, returnDestination } from '../account/navigation';
import { localReceipts } from './registration-store';
import SignupGuide from './SignupGuide';
import { eventCategories, eventCategory, eventParticipationLabels } from '../../../server/event-categories.mjs';
import { acceptsProjectSubmissions, acceptsRecruitment, usesExternalRegistration } from '../../../server/event-state.mjs';
import { acceptsSignup, eventDate, eventLocationLabel, eventStatuses, eventStatus, sortCalendarEvents } from './events';
import { listFilters, matchesSearch, selectedOption, updateFilters } from '../filters';
import { featuredInSlots } from '../featured';

const samplePosters = {
  'weekend-lab': { src: '/images/activity-photos/activity-14-kaiwu-venue.jpg', position: 'center 91%' },
  'ai-build-sprint': { src: '/images/activity-photos/activity-16-kaiwu-venue.jpg', position: 'center 25%' },
  'autumn-hack': { src: '/images/activity-photos/activity-05.jpg' },
};
const categoryOptions = [
  { id: 'all', label: '全部' },
  ...Object.entries(eventCategories).map(([id, label]) => ({ id, label })),
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

function EventLabels({ event, now, showHomePin = false }) {
  const status = eventStatus(event, now);
  const category = eventCategory(event);
  return <div className="calendar-labels">
    <span data-event-status={status}>{eventStatuses[status]}</span>
    <span>{eventCategories[category]}</span>
    {showHomePin && <HomePinBadge position={event.homePinPosition} />}
  </div>;
}

function FeaturedEvent({ event, filters, now }) {
  return <Frame as="a" className="calendar-lead" radius={12} flush href={linkWithSource(link('players', { event: event.id, ...filters }),link('players',filters))}>
    <div className="calendar-card-text">
      <EventLabels event={event} now={now} showHomePin />
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
  return <ListingCard source={link('players',filters)} className="calendar-card" href={link('players', { event: event.id, ...filters })} heading="h3"
    title={event.name} cover={<EventPoster event={event} />} labels={<EventLabels event={event} now={now} showHomePin />}
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
  const featured = featuredInSlots(events, 2);
  const featuredIds = new Set(featured.map(event => event.id));
  const matches = events.filter(event => (filtering || !featuredIds.has(event.id))
    && (status === 'all' || eventStatus(event, now) === status)
    && (category === 'all' || eventCategory(event) === category)
    && matchesSearch([event.name, event.subtitle, event.type, eventCategories[eventCategory(event)],
      event.location, eventLocationLabel(event.location), event.description], search));
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
        <div className="calendar-filter-row"><div className="calendar-categories" role="group" aria-label="活动分类">
          {categoryOptions.map(({ id, label }) => (
            <Button key={id} size="sm" shineOnInteraction className="filter-choice" aria-pressed={category === id} onClick={() => setCategory(id)}>{label}</Button>
          ))}
        </div>
        <div className="calendar-controls">
          <ChoiceMenu compact shineOnInteraction label="活动状态" value={status} onChange={setStatus} options={statusOptions} />
          <FilterSearch specular label="搜索玩家计划" value={search} onChange={setSearch} />
        </div></div>
      </header>
      <span className="discovery-sr-only" role="status" aria-atomic="true">共 {matches.length} 场活动</span>
      {matches.length ? <div className="calendar-cards">{matches.map(event => <EventCard key={event.id} event={event} filters={filters} now={now} />)}</div> : <Empty>{filtering ? '没有找到符合条件的活动。' : featured.length ? '其余活动公布后会出现在这里。' : '活动公布后会出现在这里。'}</Empty>}
    </section>
  </>;
}

function shortRecruitmentSummary(value = '') {
  const text = Array.from(value.trim());
  return text.length > 30 ? text.slice(0, 29).join('') + '…' : text.join('');
}

function RecruitmentDetail({ event, team, back }) {
  return <div className="discovery-detail discovery-detail--recruitment">
    <div className="gallery-detail-inner">
      <article className="recruitment-detail">
        <nav className="recruitment-detail-actions" aria-label="招募详情操作">
          {team?.projectPublic && <a className="detail-share-button" href={linkWithSource(link('plaza',{project:team.projectId}))}>查看项目</a>}
          <DetailShare /><a href={back} className="detail-share-button detail-return-link">返回</a>
        </nav>
        {team ? <>
          <header className="recruitment-detail-heading">
            <p className="recruitment-project-name">{team.projectName}</p>
            <h1>{team.title}</h1>
            <p>{team.description}</p>
          </header>
          <nav className="recruitment-detail-meta" aria-label="招募发布信息">
            <a href={link('plaza',{view:'player',user:team.ownerId,from:pageLocation()})} aria-label={`查看${team.author}的个人主页`}>{team.author}</a>
            <a href={back.split('#')[0]}>{event.name}</a>
          </nav>
          <RecruitmentInfo value={team} />
        </> : <Empty>没有找到这条招募。</Empty>}
      </article>
    </div>
  </div>;
}

function EventDetail({ data, event, query, user, load }) {
  const filters = listFilters('players', query);
  const back = returnDestination(query.get('from'),link('players', filters),pageLocation());
  if (!event) return <div className="event-detail-meta"><p>没有找到这场活动。</p><DetailBack href={back} inline shineOnInteraction>返回</DetailBack></div>;
  const eventContext = { event: event.id, ...filters };
  const teams = data.recruitments.filter(item => item.eventId === event.id);
  if (query.has('recruit')) return <RecruitmentDetail event={event} team={teams.find(item => item.id === query.get('recruit'))}
    back={returnDestination(query.get('from'),link('players', eventContext) + '#event-teams',pageLocation())} />;
  const works = data.projects.filter(item => item.eventId === event.id);
  const recruiting = acceptsRecruitment(event);
  const ended = eventStatus(event) === 'ended';
  const hasWorks = ended || works.length > 0;
  const hasRules = event.rules?.length > 0;
  const participationLabel = eventParticipationLabels[eventCategory(event)];
  const receipt = localReceipts().find(row => row.eventId === event.id) || data.mine?.registrations.find(row => row.eventId === event.id);
  const registrationLink = receipt ? linkWithSource(link('players', {view:'receipt',event:event.id,receipt:receipt.id})) : usesExternalRegistration(event) ? event.registrationUrl : linkWithSource(link('players', { view: 'register', event: event.id }));
  const date = eventDate(event);
  const deadline = eventDate({ startsAt: event.registrationClosesAt });
  const sections = [{ id: 'event-overview', label: '概览' }];
  if (hasRules) sections.push({ id: 'event-rules', label: '参与规则' });
  if (recruiting) sections.push({ id: 'event-teams', label: '组队招募' });
  if (hasWorks) sections.push({ id: 'event-works', label: '本场作品' });
  return <div className="discovery-detail discovery-detail--event">
    <DetailHero title={event.name} subtitle={event.subtitle}>
      <EventPoster event={event} eager />
    </DetailHero>
    <div className="gallery-detail-inner">
      <DetailSections label="活动详情目录" sections={sections}>
        <a className="detail-action-link" href="#event-overview">详情</a>
        {recruiting && <a className="detail-share-button"
          href={accountLink('team',pageLocation(),'players',{event:event.id})}>组队招募</a>}
        <div className="detail-share-return"><DetailShare />
          <a href={back} className="detail-share-button detail-return-link">返回</a></div>
      </DetailSections>
      <div className="event-detail-layout">
        <aside className="event-entry detail-sidebar" aria-labelledby="event-entry-title">
          <h2 className="detail-section" id="event-entry-title">活动信息</h2>
          <EventLabels event={event} />
          <dl className="event-entry-facts">
            {date && <div><dt>活动时间</dt><dd>{date}</dd></div>}
            {deadline && <div><dt>报名截止时间</dt><dd>{deadline}</dd></div>}
            {event.location && <div><dt>活动地点</dt><dd>{event.location}</dd></div>}
            <div className="event-entry-participation"><dt>参与方式</dt><dd>
              {acceptsSignup(event) ? <Button size="sm" href={registrationLink}>{receipt ? '查看报名' : participationLabel} <FiArrowRight aria-hidden="true" /></Button>
                : <span className="event-registration-closed">报名已截止</span>}
            </dd></div>
          </dl>
          {acceptsProjectSubmissions(event) && <Button size="sm" className="discovery-action"
            href={accountLink('publish', pageLocation(), 'players', { event: event.id })}>提交作品 <FiArrowRight aria-hidden="true" /></Button>}
          {ended && <Button size="sm" className="discovery-action" href="#event-works">查看本场作品 <FiArrowRight aria-hidden="true" /></Button>}
          {ended && event.hasAlbum && <Button size="sm" className="discovery-action" href={`./?page=time-machine&event=${encodeURIComponent(event.id)}`}>查看本场影像 <FiArrowUpRight aria-hidden="true" /></Button>}
          {user?.role === 'admin' && <EventStatusForm event={event} user={user} onSaved={load} />}
        </aside>
        <div className="event-intro">
          <section className="community-prose detail-section" id="event-overview"><h2>活动介绍</h2><p>{event.description}</p></section>
          {hasRules && <section className="community-prose detail-section" id="event-rules"><h2>参与规则</h2><ol>{event.rules.map((rule, index) => <li key={index}>{rule}</li>)}</ol></section>}
          {query.get('posted') && <p className="community-feedback" role="status">招募已发布。</p>}
          {recruiting && <section className="event-linked detail-section" id="event-teams"><h2>组队招募 <small>{teams.length}</small></h2>
            {teams.length ? <div className="event-team-grid">
                {teams.map(team => <Frame as="a" className="community-team-link" key={team.id} radius={10} flush
                  href={linkWithSource(link('players', { ...eventContext, recruit: team.id }))}>
                  <h3 className="community-team-project"><span>{team.projectName}</span><FiArrowUpRight aria-hidden="true" /></h3>
                  <p className="community-team-summary">{shortRecruitmentSummary(team.description)}</p>
                </Frame>)}
              </div> : null}
          </section>}
          {hasWorks && <section className="event-linked detail-section event-works-grid" id="event-works"><h2>本场作品 <small>{works.length}</small></h2><ProjectGrid projects={works} events={data.events} /></section>}
        </div>
      </div>
    </div>
  </div>;
}

export default function PlayersPage() {
  return <CommunityPage section="players" Listing={PlayersListing} Detail={EventDetail} />;
}

function EventStatusForm({ event, user, onSaved }) {
  return <details className="community-demo-login"><summary>管理活动状态</summary><Form submit="保存活动状态" onSubmit={async values => { await api(`event-status/${event.id}`, { status: values.status, submissionsOpen: values.submissionsOpen === 'on' },user.id); await onSaved(); }}>
    <label className="community-field"><span>活动状态</span><select name="status" defaultValue={event.status}><option value="open">报名中</option><option value="active">进行中</option><option value="ended">已结束</option></select></label>
    <label className="community-check"><input type="checkbox" name="submissionsOpen" defaultChecked={event.submissionsOpen} />开放作品提交</label>
    <p className="community-muted">开始活动时自动建立时光机专题；已结束活动保留原有作品与照片。</p>
  </Form></details>;
}

