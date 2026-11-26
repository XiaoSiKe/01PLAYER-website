import { useEffect, useMemo, useState } from 'react';
import { FiArrowUpRight, FiBookmark, FiEdit2, FiHeart, FiSearch, FiUsers } from 'react-icons/fi';
import ChoiceMenu from '../../components/ChoiceMenu';
import CommunityPage from '../CommunityPage';
import { Button, DetailBack, DetailHero, DetailSections, DetailShare, Empty, Frame, ProjectGrid, RecruitmentInfo, Source } from '../CommunityUi';
import { communityLink as link } from '../api';
import { listFilters, matchesSearch, selectedOption, updateFilters } from '../filters';
import { accountLink, isPlayerSpaceView, pageLocation, safeSitePath } from '../account/navigation';
import ProjectArtwork from './ProjectArtwork';

const sources = [
  { id: 'all', label: '全部来源' }, { id: 'club', label: '零一赛事' }, { id: 'independent', label: '自主投稿' },
];
const sorts = [{ id: 'all', label: '最新发布' }, { id: 'popular', label: '点赞最多' }];
const reviewStatuses = { pending: '待审核', approved: '已公开', returned: '退回修改' };
const newestFirst = (a, b) => (Date.parse(b.reviewedAt || b.createdAt) || 0) - (Date.parse(a.reviewedAt || a.createdAt) || 0);
const mostLiked = (a, b) => (b.likes || 0) - (a.likes || 0) || newestFirst(a, b);

function PlazaListing({ data, busy, reactToProject }) {
  const initial = new URLSearchParams(window.location.search);
  const events = data.events.map(event => ({ id: 'event:' + event.id, label: event.name }));
  const eventOptions = [{ id: 'all', label: '全部赛事' }, ...events];
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
  const popular = useMemo(() => [...data.projects].sort(mostLiked).slice(0, 3), [data.projects]);
  const popularIds = new Set(popular.map(project => project.id));
  const projects = data.projects.filter(project => {
    const origin = project.eventId ? 'club' : 'independent';
    return (selectedSource === 'all' || selectedSource === origin)
      && (selectedEvent === 'all' || selectedEvent === `event:${project.eventId}`)
      && matchesSearch([project.name, project.summary, project.author, eventNames.get(project.eventId), project.externalSource], search);
  }).sort(sort === 'popular' ? mostLiked : newestFirst);
  const listed = filtering ? projects : projects.filter(project => !popularIds.has(project.id));
  return <>
    <section className="plaza-popular" aria-label="热门项目">
      <ProjectGrid projects={popular} listContext={filters} events={data.events} busy={busy} onReaction={reactToProject}
        empty="公开作品上线后会在这里展示。" />
    </section>
    <section className="plaza-results" aria-labelledby="plaza-results-title">
      <header className="plaza-tools">
        <h2 id="plaza-results-title" className="plaza-results-title">更多项目</h2>
        <div className="community-filter-controls">
          {selectedSource === 'club' && <ChoiceMenu compact label="赛事" value={selectedEvent} options={eventOptions}
            onChange={value => setSource(value === 'all' ? 'club' : value)} />}
          <ChoiceMenu compact label="项目来源" value={selectedSource} onChange={setSource} options={sources} />
          <ChoiceMenu compact label="项目排序" value={sort} onChange={setSort} options={sorts} />
          <label className="community-search"><FiSearch aria-hidden="true" /><input type="search" aria-label="搜索项目或作者" placeholder="搜索项目或作者" value={search} onChange={e => setSearch(e.target.value)} /></label>
        </div>
      </header>
      <p className="community-results" role="status">{projects.length} 个公开项目</p>
      {(filtering || listed.length > 0) && <ProjectGrid projects={listed} listContext={filters} events={data.events}
        busy={busy} onReaction={reactToProject} empty="没有找到符合条件的项目。" />}
    </section>
  </>;
}

function ProjectDetail({ data, query, user, busy, reactToProject }) {
  const p = data.project;
  const source = safeSitePath(query.get('from'), '');
  const fromSpace = source && isPlayerSpaceView(new URL(source, location.origin).searchParams.get('view'));
  const back = fromSpace ? source : link('plaza', listFilters('plaza',query));
  if (!p || p.unavailable) return <><DetailBack href={back}>返回</DetailBack><Empty>{p?.unavailable || '没有找到这个项目。'}</Empty></>;
  const canEdit = user && p.ownerId === user.id;
  const sections = [];
  if (p.imageUrl) sections.push({ id: 'project-media', label: '作品展示' });
  sections.push({ id: 'project-overview', label: '项目介绍' });
  if (p.recruitment) sections.push({ id: 'project-recruitment', label: '项目招募' });
  return <div className="discovery-detail discovery-detail--project">
    <DetailHero title={p.name} subtitle={p.summary}
      thumbnail={<ProjectArtwork project={p} />} attribution={<>
        <span>{p.author}</span>
        <Source project={p} events={data.events} />
        <span>{reviewStatuses[p.status]}</span>
      </>}>
      <ProjectArtwork project={p} large />
    </DetailHero>
    <div className="gallery-detail-inner">
      <DetailSections label="项目详情目录" sections={sections}>
        {p.demoUrl && <a className="gallery-demo-link" href={p.demoUrl} target="_blank" rel="noopener noreferrer">
          打开项目演示 <FiArrowUpRight aria-hidden="true" />
        </a>}
        {canEdit && <Button className="project-detail-edit" size="sm"
          href={accountLink('publish', pageLocation(), 'plaza', { edit: p.id, event: p.eventId })}>
          <FiEdit2 aria-hidden="true" /> 修改项目
        </Button>}
        <DetailShare label="分享作品" />
      </DetailSections>
      {p.eventId && data.events.some(event => event.id === p.eventId) && <section className="gallery-related-event">
        <h2>参与活动</h2><Source project={p} events={data.events} />
      </section>}
      <div className="project-detail-layout">
        <article className="project-detail-main">
          {p.imageUrl && <section className="detail-section project-media-section" id="project-media">
            <h2>作品展示</h2>
            <Frame as="a" className="project-detail-media" radius={12} href={p.imageUrl} target="_blank"
              rel="noopener noreferrer" aria-label="查看作品原图" flush>
              <ProjectArtwork project={p} large fit="contain" />
              <span className="project-image-action">查看原图 <FiArrowUpRight aria-hidden="true" /></span>
            </Frame>
          </section>}
          <section className="community-prose detail-section" id="project-overview"><h2>项目介绍</h2><p>{p.description}</p></section>
          {p.recruitment && <section className="detail-section project-recruitment-section" id="project-recruitment">
            <h2><FiUsers aria-hidden="true" /> 项目招募</h2>
            <RecruitmentInfo value={p.recruitment} />
          </section>}
        </article>
        <aside className="project-detail-side detail-sidebar" aria-labelledby="project-info-title">
          <h2 id="project-info-title">项目信息</h2>
          <dl className="project-detail-facts"><div><dt>作者</dt><dd>{p.author}</dd></div>
            <div><dt>项目来源</dt><dd><Source project={p} events={data.events} /></dd></div>
            <div><dt>状态</dt><dd>{reviewStatuses[p.status]}{p.example && ' · 示例作品'}</dd></div></dl>
          {p.reviewNote && <p>修改建议：{p.reviewNote}</p>}
          <div className="community-reactions"><Button disabled={busy || p.status !== 'approved'} aria-pressed={p.liked} onClick={() => reactToProject(p,'like')}><FiHeart />{p.liked ? '已点赞' : '点赞'} {p.likes || 0}</Button>
            <Button disabled={busy || p.status !== 'approved'} aria-pressed={p.saved} onClick={() => reactToProject(p,'save')}><FiBookmark />{p.saved ? '已收藏' : '收藏'}</Button></div>
        </aside>
      </div>
    </div>
  </div>;
}

export default function PlazaPage() {
  return <CommunityPage section="plaza" Listing={PlazaListing} Detail={ProjectDetail} />;
}
