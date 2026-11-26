import { siteDestination } from '../data/destinations';
import { useLanguage } from '../Language';
import { lazy, Suspense, useMemo, useLayoutEffect, useRef, useState } from 'react';
import ViewportMount from './ViewportMount';
import BorderGlow from '../BorderGlow';
import { useTheme } from '../Theme';
import { learningFolderItems, practiceFolderItems } from '../data/explore';
import { COMMUNITY_SLOGAN } from '../data/positioning';
import SocialIcon from './SocialIcon';
import ExploreEntry from './ExploreEntry';
import ExploreModuleIcon from './ExploreModuleIcon';
import { LoadingSlot } from './UniqueLoading';
import { socialChannels } from '../data/social';
import './ExploreSection.css';
const Folder = lazy(() => import('./Folder'));
const mediaChannels = socialChannels.filter(channel => channel.id !== 'channels');
const resourceEntries = [
  { id: 'compass', title: '「零一玩家」地球生存攻略', href: siteDestination('earth'), label: '打开「零一玩家」地球生存攻略（新窗口）', external: true },
  { id: 'knowledge', title: '零一开源知识库', href: siteDestination('wiki'), label: '零一开源知识库（新窗口）', external: true },
  { id: 'architecture', title: '战略、架构与发展', href: siteDestination('strategy'), label: '战略、架构与发展（新窗口）', external: true },
  { id: 'archive', title: '零一时光机', href: '/?page=time-machine', label: '零一时光机' },
];

const documentItems = (items, t) => items.map((item, index) => ({
  ...item,
  content: (
    <span className="home-folder-document">
      <span className="home-folder-document__masthead"><span>01PLAYER</span><span aria-hidden="true">↗</span></span>
      <span className="home-folder-document__rule" />
      <strong className="home-folder-document__title">{t(item.title)}</strong>
      <span className="home-folder-document__footer"><span className="home-folder-document__index">{String(index + 1).padStart(2, '0')}</span><span>{t("阅读专栏")}</span></span>
    </span>
  ),
}));

export default function ExploreSection({ id, borderGlowProps, onItemClick }) {
  const { t } = useLanguage();
  const folderTitle = t("零一公众号");
  const folderGroups = useMemo(() => {
    const learningItems = documentItems(learningFolderItems, t);
    const practiceItems = documentItems(practiceFolderItems, t);
    return [
      { id: 'learn', title: '从零到一', items: learningItems },
      { id: 'practice', title: '零一实践', items: practiceItems },
    ];
  }, [t]);
  const { theme } = useTheme();
  const [openFolder, setOpenFolder] = useState(null);
  const [folderLayouts, setFolderLayouts] = useState(() => folderGroups.map(() => ({ size: .78, documentScale: 1.276, documentOffsetX: 0 })));
  const folderViewportRefs = useRef([]);

  useLayoutEffect(() => {
    const viewportWidths = new WeakMap();
    const centerFolders = () => {
      folderViewportRefs.current.forEach((viewport, index) => {
        if (!viewport || viewportWidths.get(viewport) === viewport.clientWidth) return;
        viewportWidths.set(viewport, viewport.clientWidth);
        const compact = window.matchMedia('(max-width: 760px)').matches;
        const size = compact ? Math.min(.5, Math.max(.3, (viewport.clientWidth - 12) / 224)) : Math.min(.78, viewport.clientWidth / 224);
        const frame = viewport.closest('.home-explore-folder-frame').getBoundingClientRect();
        const bounds = viewport.getBoundingClientRect();
        const width = 224 * size, count = folderGroups[index].items.length;
        const available = frame.width - 24, gap = 12 * size;
        const documentScale = compact ? Math.min(1.276, Math.max(1,
          (available - gap * (count - 1)) / (count * .94 * width * .54), available / (width * 2.3))) : 1.276;
        const documentOffsetX = compact ? frame.left + frame.width / 2 - bounds.left - bounds.width / 2 : 0;
        const layout = { size, documentScale, documentOffsetX };
        setFolderLayouts(previous => Object.keys(layout).every(key => previous[index][key] === layout[key]) ? previous : previous.map((value, i) => i === index ? layout : value));
        viewport.scrollLeft = Math.round(Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2));
      });
    };
    centerFolders();
    const observer = new ResizeObserver(centerFolders);
    folderViewportRefs.current.forEach(viewport => { if (viewport) observer.observe(viewport); });
    return () => observer.disconnect();
  }, []);

  const renderFolder = (group, index) => (
    <BorderGlow key={group.id} {...borderGlowProps} borderRadius={16} className={`home-explore-folder-frame home-explore-folder-frame--${group.id}${openFolder === group.id ? ' is-open' : ''}`}>
      <article className="home-explore-folder-card">
        <header className="home-explore-card-heading">
          <h3>{t(group.title)}</h3>
        </header>
        <div className="home-explore-folder-viewport" ref={node => { folderViewportRefs.current[index] = node; }}>
          <div className="home-explore-folder-space">
            <ViewportMount className="home-explore-folder-mount" minHeight={196 * folderLayouts[index].size}>
              <Suspense fallback={<LoadingSlot />}>
                <Folder label={folderTitle} items={group.items} size={folderLayouts[index].size} color="#141416" paperColor="#f2f2f0" theme={theme} intro stationary peek
                  documentScale={folderLayouts[index].documentScale} documentOffsetX={folderLayouts[index].documentOffsetX}
                  open={openFolder === group.id} onOpenChange={open => setOpenFolder(open ? group.id : null)} onItemClick={onItemClick} />
              </Suspense>
            </ViewportMount>
          </div>
        </div>
      </article>
    </BorderGlow>
  );

  return (
    <section className="home-section home-how-section" id={id} aria-labelledby="directions-title">
      <header className="home-section-heading">
        <h2 className="home-flow-title" id="directions-title" tabIndex={-1}>{t("零一玩家生态")}</h2>
        <p>{t(COMMUNITY_SLOGAN)}</p>
      </header>

      <div className="home-explore-bento">
        <nav className="home-explore-links" aria-label={t("探索入口")}>
          <div className="home-explore-folders">
            {folderGroups.map(renderFolder)}
          </div>
          <div className="home-explore-resources">
            {resourceEntries.map(entry => <ExploreEntry key={entry.id} entry={entry} borderGlowProps={borderGlowProps} />)}
            <BorderGlow {...borderGlowProps} borderRadius={16} className="home-explore-entry-frame home-explore-entry-frame--media">
              <article className="home-explore-media-card" aria-labelledby="home-media-title">
                <ExploreModuleIcon kind="media" />
                <h3 id="home-media-title"><span><span className="home-explore-word">{t("零一")}</span><span className="home-explore-word">{t("自媒体")}</span></span></h3>
                <div className="home-explore-socials" aria-label={t("零一自媒体平台")}>
                  {mediaChannels.map(channel => {
                    const Platform = channel.href ? 'a' : 'span';
                    return <Platform key={channel.id} className="home-explore-social" href={channel.href || undefined}
                      target={channel.href ? '_blank' : undefined} rel={channel.href ? 'noopener noreferrer' : undefined}
                      role={channel.href ? undefined : 'img'} aria-label={channel.href ? t("{0}主页（新窗口）", [channel.title]) : t(channel.title)}>
                      <SocialIcon platform={channel.id} />
                    </Platform>;
                  })}
                </div>
              </article>
            </BorderGlow>
          </div>
        </nav>
      </div>
    </section>
  );
}
