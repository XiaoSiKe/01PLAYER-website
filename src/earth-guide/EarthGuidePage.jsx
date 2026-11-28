import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FiArrowLeft, FiArrowRight, FiFolder, FiGithub, FiList, FiSearch, FiX } from 'react-icons/fi';
import SiteNavigation from '../components/SiteNavigation';
import SpecularButton from '../SpecularButton';
import { AccountHeading } from '../community/account/AccountAccess';
import { useLanguage } from '../Language';
import { useGuideContent } from './useGuideContent';
import GuideOutline from './GuideOutline';
import GuideFolders from './GuideFolders';
import { findArticleHeading, GuideHeading, GuideMarkdown, readArticle } from './GuideMarkdown';
import './earth-guide.css';

const emptyGroups = [];
const title = '「零一玩家」地球生存攻略';
const installCommand = 'npx skills add XiaoSiKe/01player-earth-survival-guide --skill 01player-earth-survival-guide';
const repository = 'https://github.com/XiaoSiKe/01player-earth-survival-guide';
const startLinks = [{ id: 'overview', title: '攻略首页' }, { id: 'skill', title: '安装 Skill' }];
function ChapterDirectory({ groups, current, onNavigate }) {
  const directoryGroups = [{ title: '开始阅读', chapters: startLinks }, ...groups];
  return <nav aria-label="章节导航" className="guide-directory">
    {directoryGroups.map(group => <section key={group.title}>
      <h2>{group.title}</h2>
      {group.chapters.map(chapter => <a key={chapter.id} href={`#${chapter.id}`}
        aria-current={chapter.id === current ? 'page' : undefined} onClick={onNavigate}>{chapter.title}</a>)}
    </section>)}
  </nav>;
}

function GuideOverview({ groups }) {
  const command = useRef(null);
  const [copyStatus, setCopyStatus] = useState('');

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(installCommand);
      setCopyStatus('已复制安装命令。');
    } catch {
      const selection = window.getSelection();
      if (!selection || !command.current) return;
      const range = document.createRange();
      range.selectNodeContents(command.current);
      selection.removeAllRanges();
      selection.addRange(range);
      setCopyStatus('已选中安装命令，可手动复制。');
    }
  }

  return <article id="overview" className="guide-article">
    <h1>{title}</h1>
    <p className="guide-lead">一本面向大学生的学习、生活与 AI 实践指南。</p>
    <section className="guide-skill" aria-labelledby="skill">
      <div className="guide-skill-heading">
        <h2 id="skill">「零一玩家」地球生存攻略 Skill</h2>
        <span className="guide-version">v0.3.2</span>
      </div>
      <p>在支持 Agent Skills 的 AI 助手里，带着一个课程问题、学习卡点或小项目开始。</p>
      <div className="guide-command">
        <code ref={command}>{installCommand}</code>
        <SpecularButton size="sm" onClick={copyCommand}>复制命令</SpecularButton>
      </div>
      <div className="guide-skill-links">
        <SpecularButton size="sm" download href="https://raw.githubusercontent.com/XiaoSiKe/01player-earth-survival-guide/main/01player-earth-survival-guide.zip">下载 Skill 安装包</SpecularButton>
        <SpecularButton size="sm" href={`${repository}/tree/main/01player-earth-survival-guide`}>查看 Skill 源码</SpecularButton>
      </div>
      {copyStatus && <p className="guide-copy-status" role="status">{copyStatus}</p>}
    </section>
    <section className="guide-reading" aria-labelledby="reading">
      <h2 id="reading">章节目录</h2>
      {groups.length ? <GuideFolders groups={groups} /> : <p>暂无已发布文章。</p>}
    </section>
  </article>;
}

function GuideChapter({ chapter, chapters, article }) {
  const { body, author, university, uploadedAt } = readArticle(chapter.id, article);
  const index = chapters.indexOf(chapter);
  const opening = chapter.group.chapters[0];
  const previous = chapters[index - 1];
  const next = chapters[index + 1];
  return <article className="guide-article guide-article--chapter">
    <nav className="guide-breadcrumb" aria-label="所属分组">
      <a href={`#${opening.id}`} aria-label={`返回「${chapter.group.title}」开篇`}>
        <FiFolder aria-hidden="true" />{chapter.group.title}
      </a>
    </nav>
    <GuideHeading as="h1" id={chapter.id} href={`#${chapter.id}`}>{chapter.title}</GuideHeading>
    <dl className="guide-article-meta">
      <div><dt>作者</dt><dd>{author || '待补充'}</dd></div>
      <div><dt>学校</dt><dd>{university || '待补充'}</dd></div>
      <div><dt>上传时间</dt><dd>{uploadedAt ? <time dateTime={uploadedAt}>{uploadedAt}</time> : '待发布'}</dd></div>
    </dl>
    <GuideMarkdown chapterId={chapter.id} body={body || '本章内容待补充。'} />
    <footer className="guide-chapter-footer">
      <nav className="guide-adjacent" aria-label="相邻章节">
        {previous && <SpecularButton size="sm" radius={12} href={`#${previous.id}`} rel="prev">
          <FiArrowLeft aria-hidden="true" />
          <span className="guide-adjacent-copy"><small lang="en">Previous</small><span>{previous.title}</span></span>
        </SpecularButton>}
        {next && <SpecularButton size="sm" radius={12} href={`#${next.id}`} rel="next">
          <span className="guide-adjacent-copy"><small lang="en">Next</small><span>{next.title}</span></span>
          <FiArrowRight aria-hidden="true" />
        </SpecularButton>}
      </nav>
    </footer>
  </article>;
}

export default function EarthGuidePage() {
  const { t } = useLanguage();
  const page = useRef(null);
  const main = useRef(null);
  const directoryToggle = useRef(null);
  const searchDialog = useRef(null);
  const searchInput = useRef(null);
  const [hash, setHash] = useState(() => location.hash.slice(1));
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [query, setQuery] = useState('');
  const content = useGuideContent();
  const groups = content?.groups ?? emptyGroups;
  const chapters = useMemo(() => groups.flatMap(group => group.chapters.map(chapter => ({ ...chapter, group }))), [groups]);
  const [chapterHash, headingHash] = hash.split('/', 2);
  const chapter = chapters.find(item => item.id === chapterHash);
  const chapterId = chapter?.id;
  const chapterTitle = chapter?.title;
  const article = chapter && content?.articles[chapterId];
  const fragmentArticle = headingHash ? article : undefined;
  const groupId = groups.find(group => group.id === hash)?.id;
  const current = chapterId ?? (hash === 'skill' ? 'skill' : 'overview');
  const matchedItems = [...startLinks, ...chapters].filter(item => (item.title + (item.group?.title || '')).toLowerCase().includes(query.trim().toLowerCase()));

  useLayoutEffect(() => {
    const root = page.current;
    const header = root.querySelector('.staggered-menu-header');
    if (!header) return;
    const measure = () => root.style.setProperty('--guide-header-height', `${header.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    measure();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function navigate() {
      setHash(location.hash.slice(1));
      setDirectoryOpen(false);
    }
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);

  useLayoutEffect(() => {
    document.title = chapterTitle ? `${chapterTitle} · ${title}` : title;
    const articleHeading = chapterId && headingHash && findArticleHeading(headingHash);
    if (articleHeading) {
      articleHeading.focus({ preventScroll: true });
      articleHeading.scrollIntoView();
    } else if (groupId) {
      const heading = document.getElementById(groupId);
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView();
    } else if (hash === 'skill' || hash === 'reading') {
      document.getElementById(hash)?.scrollIntoView();
    } else if (chapterId || hash === 'overview') {
      main.current.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }, [chapterId, chapterTitle, hash, headingHash, groupId, fragmentArticle]);

  const openSearch = useCallback(() => {
    const dialog = searchDialog.current;
    if (dialog.open) {
      searchInput.current.focus();
      return;
    }
    setDirectoryOpen(false);
    setQuery('');
    dialog.showModal();
    searchInput.current.focus();
  }, []);

  useEffect(() => {
    function keydown(event) {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        openSearch();
      } else if (event.key === 'Escape' && directoryOpen && !searchDialog.current.open) {
        setDirectoryOpen(false);
        directoryToggle.current?.focus();
      }
    }
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [directoryOpen, openSearch]);

  return <div className="earth-guide" ref={page}>
    <a className="skip-link" href="#guide-content" onClick={event => {
      event.preventDefault();
      main.current.focus({ preventScroll: true });
      main.current.scrollIntoView();
    }}>跳到正文</a>
    <SiteNavigation standalone mobileDetail headerBrand={<AccountHeading title={t('地球生存攻略')} as="span" />} />
    <div className={chapter ? 'guide-layout guide-layout--chapter' : 'guide-layout'}>
      <aside className="guide-directory-desktop">
        <ChapterDirectory groups={groups} current={current} />
      </aside>
      <main id="guide-content" ref={main} tabIndex={-1} lang="zh-CN">
        <div className="guide-toolbar">
          <div className="guide-tools">
            <SpecularButton size="sm" className="guide-directory-toggle" ref={directoryToggle}
              aria-expanded={directoryOpen} aria-controls="guide-directory-mobile"
              onClick={() => setDirectoryOpen(!directoryOpen)}><FiList aria-hidden="true" />目录</SpecularButton>
            <SpecularButton size="sm" href="/#directions"><FiArrowLeft aria-hidden="true" />返回</SpecularButton>
            <SpecularButton size="sm" aria-haspopup="dialog" aria-keyshortcuts="Control+F Meta+F" onClick={openSearch}>
              <FiSearch aria-hidden="true" />搜索<kbd className="guide-search-shortcut" aria-hidden="true">Ctrl+F</kbd>
            </SpecularButton>
            <SpecularButton size="sm" className="guide-github" href={repository} target="_blank" rel="noopener noreferrer" ariaLabel="GitHub">
              <FiGithub size={18} aria-hidden="true" />
            </SpecularButton>
          </div>
        </div>
        <div className="guide-directory-mobile" id="guide-directory-mobile" hidden={!directoryOpen}>
          <ChapterDirectory groups={groups} current={current} onNavigate={() => setDirectoryOpen(false)} />
        </div>
        {chapter ? <GuideChapter chapter={chapter} chapters={chapters} article={article} /> : <GuideOverview groups={groups} />}
      </main>
      {chapter ? <GuideOutline key={chapter.id} chapter={chapter} article={article} main={main} /> : <aside className="guide-outline" aria-label="本页目录">
        <p>本页目录</p>
        <nav aria-label="首页小节"><a href="#skill">地球生存攻略 Skill</a><a href="#reading">章节目录</a>{groups.map(group => <a key={group.id} href={`#${group.id}`} style={{'--outline-level':1}}>{group.title}</a>)}</nav>
      </aside>}
    </div>
    <dialog ref={searchDialog} className="guide-search-dialog" aria-labelledby="guide-search-title"
      onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
      <div className="guide-search-panel">
        <header>
          <h2 id="guide-search-title">搜索攻略</h2>
          <SpecularButton size="sm" ariaLabel="关闭搜索" onClick={() => searchDialog.current.close()}><FiX aria-hidden="true" /></SpecularButton>
        </header>
        <label className="guide-search-label">
          <FiSearch aria-hidden="true" />
          <input ref={searchInput} type="search" aria-label="章节或 Skill 名称" placeholder="输入章节或 Skill 名称…" value={query} onChange={event => setQuery(event.target.value)} />
        </label>
        {matchedItems.length ? <ul className="guide-search-results">
          {matchedItems.map(item => <li key={item.id}><a href={`#${item.id}`} onClick={() => searchDialog.current.close()}>{item.title}</a></li>)}
        </ul> : <p className="guide-search-empty" role="status">没有匹配的章节。</p>}
      </div>
    </dialog>
  </div>;
}
