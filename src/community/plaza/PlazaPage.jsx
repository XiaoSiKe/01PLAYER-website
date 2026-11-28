import FilterSearch from '../FilterSearch';
import useMediaQuery from '../../components/useMediaQuery';
import { publicAuthorId } from '../../../server/project-author.mjs';
import { useEffect, useMemo, useState } from 'react';
import { FiArrowUpRight, FiBookmark, FiHeart, FiUsers } from 'react-icons/fi';
import ChoiceMenu from '../../components/ChoiceMenu';
import CommunityPage from '../CommunityPage';
import { Button, DetailBack, DetailHero, DetailSections, DetailShare, Empty, Frame, ProjectGrid, RecruitmentInfo, Source } from '../CommunityUi';
import { communityLink as link } from '../api';
import { listFilters, matchesSearch, selectedOption, updateFilters } from '../filters';
import { accountLink, pageLocation, linkWithSource, returnDestination } from '../account/navigation';
import ProjectArtwork from './ProjectArtwork';
import { featuredInSlots } from '../featured';

const sources = [
  { id: 'all', label: '全部来源' }, { id: 'club', label: '玩家计划' }, { id: 'independent', label: '自主投稿' },
];
const sorts = [{ id: 'all', label: '最新发布' }, { id: 'popular', label: '点赞最多' }];
const reviewStatuses = { pending: '待审核', approved: '已公开', returned: '退回修改' };
const newestFirst = (a, b) => (Date.parse(b.reviewedAt || b.createdAt) || 0) - (Date.parse(a.reviewedAt || a.createdAt) || 0);
const mostLiked = (a, b) => (b.likes || 0) - (a.likes || 0) || newestFirst(a, b);

function PlazaListing({ data, isReactionPending, reactToProject }) {
  const mobile = useMediaQuery('(max-width: 760px)');
  const initial = new URLSearchParams(window.location.search);
  const events = data.events.map(event => ({ id: 'event:' + event.id, label: event.name }));
  const eventOptions = [{ id: 'all', label: '全部活动' }, ...events];
  const mobileSources = [...sources,...events.map(event=>({...event,group:'具体活动',shortLabel:'活动'}))];
  const initialSource = initial.get('source');
  const [search, setSearch] = useState(initial.get('q') || '');
  const [source, setSource] = useState(selectedOption([...sources, ...events], initialSource === 'external' ? 'independent' : initialSource));
  const [sort, setSort] = useState(initial.get('sort') === 'popular' ? 'popular' : 'all');
  const selectedEvent = source.startsWith('event:') ? source : 'all';
  const selectedSource = selectedEvent === 'all' ? source : 'club';
  useEffect(() => updateFilters('plaza', { q: search, source, sort }), [search, source, sort]);
  const eventNames = new Map(data.events.map(event => [event.id, event.name]));
  const filters = listFilters('plaza', {source, sort, q:search});
  const filtering = Object.keys(filters).length > 0;
  const featured = useMemo(() => featuredInSlots([...data.projects].sort(newestFirst), 3), [data.projects]);
  const featuredIds = new Set(featured.map(project => project.id));
  const findProjects = query => data.projects.filter(project => {
    const origin = project.eventId ? 'club' : 'independent';
    return (selectedSource === 'all' || selectedSource === origin)
      && (selectedEvent === 'all' || selectedEvent === `event:${project.eventId}`)
      && matchesSearch([project.name, project.summary, project.author, eventNames.get(project.eventId), project.externalSource, project.example ? '示例' : '', project.recruitment ? '招募中' : ''], query);
  }).sort(sort === 'popular' ? mostLiked : newestFirst);
  const projects = findProjects(search);
  const listed = filtering ? projects : projects.filter(project => !featuredIds.has(project.id));
  const resultHref = project => linkWithSource(link('plaza', {project:project.id,...filters}),link('plaza',filters));
  return <>
    <section className="plaza-popular" aria-label="优先项目">
      <ProjectGrid projects={featured} listContext={filters} events={data.events} isReactionPending={isReactionPending} onReaction={reactToProject} showHomePins
        empty="公开作品上线后会在这里展示。" />
    </section>
    <section className="plaza-results" aria-labelledby="plaza-results-title">
      <header className="plaza-tools">
        <div className="plaza-results-heading">
          <h2 id="plaza-results-title" className="plaza-results-title">更多项目</h2>
          {!mobile && <Button size="sm" shineOnInteraction href={accountLink('publish', link('plaza', filters))}>发布项目</Button>}
        </div>
        <div className="community-filter-controls">
          {mobile && <Button size="sm" className="plaza-publish-button" shineOnInteraction href={accountLink('publish',link('plaza',filters))}>发布项目</Button>}
          {!mobile && selectedSource === 'club' && <ChoiceMenu compact label="活动" value={selectedEvent} options={eventOptions}
            onChange={value => setSource(value === 'all' ? 'club' : value)} />}
          <ChoiceMenu compact label="项目来源" value={mobile ? source : selectedSource} onChange={setSource} options={mobile ? mobileSources : sources} />
          <ChoiceMenu compact label="项目排序" value={sort} onChange={setSort} options={sorts} />
          <FilterSearch label="搜索项目或作者" value={search} onChange={setSearch}
            onSearch={mobile ? query => {
              const first = findProjects(query)[0];
              if (!query.trim() || !first) return false;
              window.location.assign(resultHref(first));
              return true;
            } : undefined}
            renderResults={mobile ? (close, query) => { const results = findProjects(query); return query.trim() ? <div className="community-search-results">
              <p className="community-search-summary" role="status">{results.length} 个公开项目</p>
              {results.length ? results.map(project => <a key={project.id} className="community-search-result plaza-search-result" href={resultHref(project)} aria-label={project.name} onClick={close}>
                <ProjectArtwork project={project} />
                <div className="community-search-copy"><strong>{project.name}</strong>{project.author && <span className="community-search-author">{project.author}</span>}{project.summary && <span className="community-search-description">{project.summary}</span>}</div>
                <FiArrowUpRight aria-hidden="true" />
              </a>) : <Empty>没有找到符合条件的项目。</Empty>}
            </div> : null; } : undefined} />
        </div>
      </header>
      <p className="community-results" role="status">{projects.length} 个公开项目</p>
      {(filtering || listed.length > 0) && <ProjectGrid projects={listed} listContext={filters} events={data.events} showHomePins
        isReactionPending={isReactionPending} onReaction={reactToProject} empty="没有找到符合条件的项目。" />}
    </section>
  </>;
}

function ProjectDetail({ data, query, user, isReactionPending, reactToProject }) {
  const p = data.project;
  useEffect(() => {
    if (!p?.id || location.hash !== '#project-recruitment') return;
    const frame = requestAnimationFrame(() => document.getElementById('project-recruitment')?.scrollIntoView());
    return () => cancelAnimationFrame(frame);
  }, [p?.id]);
  const back = returnDestination(query.get('from'),link('plaza',listFilters('plaza',query)),pageLocation());
  if (!p || p.unavailable) return <><DetailBack href={back}>返回</DetailBack><Empty>{p?.unavailable || '没有找到这个项目。'}</Empty></>;
  const authorLink = link('plaza',{view:'player',user:publicAuthorId(p),from:pageLocation()});
  const statusLink = p.status === 'approved' ? link('plaza') : accountLink('account',pageLocation(),'plaza');
  const canEdit = user && p.ownerId === user.id;
  const sections = [];
  const showcase = p.showcaseImages ?? (p.imageUrl ? [p.imageUrl] : []);
  sections.push({ id: 'project-overview', label: '项目介绍' });
  if (showcase.length) sections.push({id:'project-media',label:'作品展示'});
  if (p.recruitment) sections.push({ id: 'project-recruitment', label: '项目招募' });
  return <div className="discovery-detail discovery-detail--project">
    <DetailHero title={p.name} subtitle={p.summary}
      thumbnail={<ProjectArtwork project={p} />} attribution={<>
        <a className="project-author-link" href={authorLink}>{p.author}</a>
        <Source project={p} events={data.events} />
        <a href={statusLink}>{reviewStatuses[p.status]}</a>
      </>}>
      <ProjectArtwork project={p} large />
    </DetailHero>
    <div className="gallery-detail-inner">
      <DetailSections label="项目详情目录" sections={sections}>
        {p.demoUrl && <a className="gallery-demo-link" href={p.demoUrl} target="_blank" rel="noopener noreferrer">
          项目 <FiArrowUpRight aria-hidden="true" />
        </a>}
        {canEdit && <a className="detail-action-link project-detail-edit"
          href={accountLink('publish', pageLocation(), 'plaza', { edit: p.id, event: p.eventId })}>
          修改
        </a>}
        <div className="detail-share-return"><DetailShare />
          <a href={back} className="detail-share-button detail-return-link">返回</a></div>
      </DetailSections>
      <div className="project-detail-layout">
        <article className="project-detail-main">
          <section className="community-prose detail-section" id="project-overview">
            <h2>项目介绍</h2>
            {(p.description ?? '').trim().split(/\r?\n(?:[^\S\r\n]*\r?\n)+/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </section>
          {showcase.length > 0 && <section className="detail-section project-media-section" id="project-media">
            <h2>作品展示</h2><div className="project-showcase-images">{showcase.slice(0,2).map((src,index) =>
              <Frame key={src} className="project-detail-media" radius={12} flush>
                <img src={src} alt={`${p.name}作品展示 ${index+1}`} loading="lazy" />
              </Frame>)}</div>
          </section>}
          {p.recruitment && <section className="detail-section project-recruitment-section" id="project-recruitment">
            <h2><FiUsers aria-hidden="true" /> 项目招募</h2>
            <RecruitmentInfo value={p.recruitment} />
          </section>}
        </article>
        <aside className="project-detail-side detail-sidebar" aria-labelledby="project-info-title">
          <h2 id="project-info-title">项目信息</h2>
          <dl className="project-detail-facts"><div><dt>作者</dt><dd><a className="project-author-link" href={authorLink}>{p.author}</a></dd></div>
            <div><dt>项目来源</dt><dd><Source project={p} events={data.events} /></dd></div>
            <div><dt>状态</dt><dd><a href={statusLink}>{reviewStatuses[p.status]}</a>{p.example && <> · <a href={link('plaza',{q:'示例'})}>示例作品</a></>}</dd></div></dl>
          {p.reviewNote && <p>修改建议：{p.reviewNote}</p>}
          <div className="community-reactions"><Button data-reaction="like" disabled={p.status !== 'approved'} aria-busy={isReactionPending(p.id, 'like') || undefined} aria-disabled={isReactionPending(p.id, 'like') || undefined} aria-pressed={p.liked} onClick={() => reactToProject(p,'like')}><FiHeart />{p.liked ? '已点赞' : '点赞'} {p.likes || 0}</Button>
            <Button data-reaction="save" disabled={p.status !== 'approved'} aria-busy={isReactionPending(p.id, 'save') || undefined} aria-disabled={isReactionPending(p.id, 'save') || undefined} aria-pressed={p.saved} onClick={() => reactToProject(p,'save')}><FiBookmark />{p.saved ? '已收藏' : '收藏'} {p.saves || 0}</Button></div>
        </aside>
      </div>
    </div>
  </div>;
}

export default function PlazaPage() {
  return <CommunityPage section="plaza" Listing={PlazaListing} Detail={ProjectDetail} />;
}
