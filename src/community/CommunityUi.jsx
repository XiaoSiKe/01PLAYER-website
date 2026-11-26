import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { FiArrowLeft, FiArrowRight, FiArrowUpRight, FiBookmark, FiHeart, FiShare2, FiUsers } from 'react-icons/fi';
import SpecularButton from '../SpecularButton';
import BorderGlow, { SITE_BORDER_GLOW } from '../BorderGlow';
import ProjectArtwork from './plaza/ProjectArtwork';
import { communityLink as link } from './api';

export function Frame({ children, className = '', radius = SITE_BORDER_GLOW.borderRadius, flush = false, ...props }) {
  return <BorderGlow {...SITE_BORDER_GLOW} {...props} borderRadius={radius}
    className={`community-panel${flush ? ' community-panel--flush' : ''}${className ? ` ${className}` : ''}`}>
    {children}
  </BorderGlow>;
}
export function Button({ children, shineOnInteraction = false, ...props }) {
  return <SpecularButton size="md" staticShine={!shineOnInteraction} shineOnInteraction={shineOnInteraction} {...props}>{children}</SpecularButton>;
}
export function DetailBack({ href, children, inline = false, shineOnInteraction = false }) {
  const button = <Button href={href} size={inline ? 'sm' : 'md'} shineOnInteraction={shineOnInteraction}
    className={`discovery-detail-back${inline ? ' discovery-detail-back--inline' : ''}`}><FiArrowLeft aria-hidden="true" />{children}</Button>;
  return inline ? button : <div className="discovery-detail-actions">{button}</div>;
}

export function DetailShare({ label }) {
  const [copied, setCopied] = useState(false);
  const field = useRef(null);
  const [showLink, setShowLink] = useState(false);
  async function share() {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
    } catch {
      setShowLink(true);
    }
  }
  useEffect(() => { if (showLink) field.current?.select(); }, [showLink]);
  return <>
    {showLink && <input className="detail-share-link" aria-label="分享链接" ref={field} value={location.href} readOnly />}
    <button className="detail-share-button" type="button" onClick={share}><FiShare2 aria-hidden="true" /> {copied ? '已复制链接' : label}</button>
  </>;
}

export function DetailHero({ title, subtitle, attribution, thumbnail, children }) {
  return <header className="detail-hero">
    <div className="detail-hero-media">{children}</div>
    <div className="detail-hero-caption gallery-detail-inner">
      {thumbnail && <div className="detail-hero-thumbnail" aria-hidden="true">{thumbnail}</div>}
      <div className="detail-hero-copy">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
        {attribution && <div className="detail-hero-attribution">{attribution}</div>}
      </div>
    </div>
  </header>;
}

export function DetailSections({ label, sections, children }) {
  const nav = useRef(null);
  const sectionIds = sections.map(section => section.id).join(' ');
  const [current, setCurrent] = useState(sections[0].id);

  useLayoutEffect(() => {
    const menu = nav.current;
    const layout = menu.closest('.discovery-detail');
    const header = layout.closest('.community-page').querySelector('.staggered-menu-header');
    const sidebar = layout.querySelector('.detail-sidebar');
    const targets = sectionIds.split(' ').map(id => document.getElementById(id));
    let frame = 0;
    let contentTop = 0;
    const update = () => {
      frame = 0;
      const visible = targets.findLast(target => target && target.getBoundingClientRect().top <= contentTop);
      setCurrent(visible?.id ?? targets[0]?.id);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const measure = () => {
      const headerHeight = header?.getBoundingClientRect().height ?? 0;
      const menuHeight = getComputedStyle(menu).position === 'sticky' ? menu.getBoundingClientRect().height : 0;
      const sidebarHeight = sidebar?.getBoundingClientRect().height ?? 0;
      layout.style.setProperty('--detail-header-height', `${headerHeight}px`);
      layout.style.setProperty('--detail-menu-height', `${menuHeight}px`);
      contentTop = headerHeight + menuHeight + 26;
      layout.toggleAttribute('data-pin-sidebar', Boolean(sidebar && sidebarHeight + contentTop <= window.innerHeight));
      schedule();
    };
    const observer = new ResizeObserver(measure);
    if (header) observer.observe(header);
    if (sidebar) observer.observe(sidebar);
    observer.observe(menu);
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', schedule, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', schedule);
      cancelAnimationFrame(frame);
    };
  }, [sectionIds]);

  return <nav className="detail-section-nav" ref={nav} aria-label={label}>
    <div className="detail-section-links">
      {sections.map(section => <a key={section.id} href={`#${section.id}`}
        aria-current={current === section.id ? 'location' : undefined}>{section.label}</a>)}
    </div>
    {children && <div className="detail-section-actions">{children}</div>}
  </nav>;
}

export function Empty({ children }) { return <div className="community-empty">{children}</div>; }
export function Heading({ eyebrow, title, description, children }) { return <header className="community-heading"><div>{eyebrow && <p className="community-eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="community-lead">{description}</p>}</div>{children}</header>; }
export function Field({ label, name, multiline, ...props }) { return <label className="community-field"><span>{label}{props.required ? ' *' : ''}</span>{multiline ? <textarea name={name} rows={5} maxLength={12000} {...props} /> : <input name={name} maxLength={2000} {...props} />}</label>; }
export function Form({ children, onSubmit, submit = '提交', draftKey }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const form = useRef(null);
  useEffect(() => {
    if (!draftKey) return;
    try { const draft = JSON.parse(sessionStorage.getItem(draftKey) || '{}'); for (const [key, value] of Object.entries(draft)) { const field = form.current.elements.namedItem(key); if (field && field.type !== 'checkbox') field.value = value; } } catch { /* Draft storage is optional. */ }
  }, [draftKey]);
  return <form ref={form} className="community-form" onChange={() => { if (draftKey) try { sessionStorage.setItem(draftKey, JSON.stringify(Object.fromEntries(new FormData(form.current)))); } catch { /* Submission still works. */ } }} onSubmit={async e => {
    e.preventDefault(); if (busy) return; setError(''); setBusy(true);
    try { await onSubmit(Object.fromEntries(new FormData(e.currentTarget))); if (draftKey) sessionStorage.removeItem(draftKey); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }}>{children}{error && <p className="community-feedback" role="alert">{error}</p>}<div className="community-form-actions"><Button type="submit" disabled={busy}>{busy ? '正在保存…' : submit}<FiArrowRight /></Button></div></form>;
}
export function RecruitmentInfo({ value }) { return <dl className="community-recruit-info">{[['roles','希望招募的伙伴'],['work','参与内容'],['requirements','具体要求'],['contact','联系方式']].map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{value[key]}</dd></div>)}</dl>; }
export function Source({ project, events, linked = true }) {
  const event = events.find(item => item.id === project.eventId);
  if (!event || !linked) return <span className="community-source">{event?.name || project.externalSource || '自主投稿'}</span>;
  return <a className="community-source" href={link('players', { event: event.id })}><span>{event.name}</span><FiArrowUpRight aria-hidden="true" /></a>;
}

export function ListingCard({ className = '', href, title, heading: Heading = 'h2', cover, labels, summary, children, footer, actions }) {
  const titleId = useId();
  const titleContent = <><span>{title}</span><FiArrowUpRight aria-hidden="true" /></>;
  return <Frame as={actions ? 'article' : 'a'} className={`community-list-card ${className}`}
    radius={12} href={actions ? undefined : href} aria-labelledby={titleId} flush>
    <div className="community-list-card-cover">{cover}</div>
    <div className="community-list-card-content">
      {labels}
      <Heading id={titleId} className="community-list-card-title">
        {actions ? <a className="community-card-link" href={href}>{titleContent}</a> : titleContent}
      </Heading>
      {summary && <p className="community-list-card-summary">{summary}</p>}
      {children}
      {(footer || actions) && <div className="community-list-card-footer">{footer}{actions}</div>}
    </div>
  </Frame>;
}

function ProjectCard({ project, events, listContext, busy, onReaction }) {
  const likes = project.likes || 0;
  const actions = onReaction && <div className="community-card-actions">
    <button type="button" className="community-card-reaction" disabled={busy} aria-pressed={Boolean(project.liked)}
      aria-label={project.liked ? '取消点赞' : '点赞'} title={project.liked ? '取消点赞' : '点赞'}
      onClick={() => onReaction(project, 'like')}>
      <FiHeart aria-hidden="true" /><span aria-hidden="true">{likes}</span>
    </button>
    <button type="button" className="community-card-reaction" disabled={busy} aria-pressed={Boolean(project.saved)}
      aria-label={project.saved ? '取消收藏' : '收藏'} title={project.saved ? '取消收藏' : '收藏'}
      onClick={() => onReaction(project, 'save')}>
      <FiBookmark aria-hidden="true" />
    </button>
  </div>;
  return <ListingCard className={actions ? '' : 'community-card-link'} href={link('plaza', { project: project.id, ...listContext })}
    title={project.name} cover={<ProjectArtwork project={project} />} summary={project.summary}
    actions={actions}
    footer={<>
      <Source project={project} events={events} linked={false} />
      {!actions && <span className="community-card-likes" aria-label={`${likes} 个赞`}><FiHeart aria-hidden="true" />{likes}</span>}
    </>}
  >
    <div className="community-card-meta">
      {project.author && <span className="community-card-author">{project.author}</span>}
      {project.recruitment && <span className="community-badge"><FiUsers aria-hidden="true" />招募中</span>}
      {project.example && <span className="community-badge">示例</span>}
    </div>
  </ListingCard>;
}
export function ProjectGrid({ projects, events, listContext, busy, onReaction, empty = "这里还没有公开作品。" }) {
  return projects.length ? <div className="community-grid">
    {projects.map(project => <ProjectCard key={project.id} project={project} events={events}
      listContext={listContext} busy={busy} onReaction={onReaction} />)}
  </div> : <Empty>{empty}</Empty>;
}
