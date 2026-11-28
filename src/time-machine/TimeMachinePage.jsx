import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import ChoiceMenu from '../components/ChoiceMenu';
import SiteNavigation, { SiteReturn } from '../components/SiteNavigation';
import useMediaQuery from '../components/useMediaQuery';
import SpecularButton from '../SpecularButton';
import { imageDimensions, imageSource } from '../components/imageSource';
import PhantomGallery from './PhantomGallery';
import EventAlbumPhotoForm from './EventAlbums';
import { communityApi } from '../community/api';
import { AccountHeading } from '../community/account/AccountForms';
import { useLanguage } from '../Language';
import { siteAsset } from '../editorial/content';
import { historicalPhotoId, historicalTimeMachineAlbums, timeMachinePhotos } from './photos';
import { archiveCategories as categories, archiveModules, archivePhotoCategory, archivePhotoMatches, archiveAlbumMatches } from '../../server/archive-categories.mjs';
import { eventCategories } from '../../server/event-categories.mjs';
import './time-machine.css';

const archiveCategories = { ...categories, ...archiveModules };

export default function TimeMachinePage() {
  const { t } = useLanguage();
  const mobile = useMediaQuery('(max-width: 760px)');
  const title = t('零一时光机');
  const [albums, setAlbums] = useState([]);
  const [historicalEdits, setHistoricalEdits] = useState([]);
  const [admin, setAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const archive = useRef(null);
  const archiveAnchor = useRef(null);
  const management = useRef(null);
  const albumRequest = useRef(null);
  const [{ category, eventId }, setSelection] = useState(() => {
    const search = new URLSearchParams(location.search);
    const category = search.get('category');
    return { category: Object.hasOwn(archiveCategories, category) ? category : 'all', eventId: search.get('event') || '' };
  });
  const publishedAlbum = albums.find(album => album.eventId === eventId);
  const activeAlbum = publishedAlbum || historicalTimeMachineAlbums.find(album => album.eventId === eventId);
  const activeCategory = activeAlbum ? category !== 'all' && archiveAlbumMatches(activeAlbum,category) ? category : archivePhotoCategory(activeAlbum) : category;
  const planSelected = activeCategory === 'plan' || Object.hasOwn(eventCategories,activeCategory);
  const categoryLabel = planSelected ? archiveModules.plan : activeCategory === 'all' ? null : archiveModules[activeCategory];
  const categoryAlbums = useMemo(() => [...albums, ...historicalTimeMachineAlbums]
    .filter(album => archiveAlbumMatches(album,activeCategory)), [albums, activeCategory]);
  const sessionOptions = useMemo(() => [{ id: '', label: '全部场次' }, ...categoryAlbums.map(album => ({
    id: album.eventId,
    label: album.name + (album.example ? '（示例）' : ''),
  }))], [categoryAlbums]);

  function positionArchive() {
    const bounds = archiveAnchor.current.getBoundingClientRect();
    const width = Math.min(144, window.innerWidth - 16);
    const left = Math.max(8, Math.min(bounds.right - width, window.innerWidth - width - 8));
    archive.current.style.width = `${width}px`;
    archive.current.style.left = `${left}px`;
    archive.current.style.top = `${Math.min(bounds.bottom + 6, Math.max(8, window.innerHeight - ((Object.keys(archiveModules).length + Object.keys(eventCategories).length) * 45 + 10)))}px`;
  }

  function openArchive() {
    if (archive.current.open) return;
    positionArchive();
    archive.current.showModal();
  }

  async function loadAlbums() {
    albumRequest.current?.abort();
    const request = new AbortController();
    albumRequest.current = request;
    communityApi('session', undefined, undefined, request.signal)
      .then(session => { if (!request.signal.aborted) setAdmin(session.user?.role === 'admin'); })
      .catch(() => { if (!request.signal.aborted) setAdmin(false); });
    try {
      const result = await communityApi('albums?historical=1', undefined, undefined, request.signal);
      if (request.signal.aborted) return;
      const { albums: next, historicalPhotos } = Array.isArray(result)
        ? { albums: result, historicalPhotos: [] }
        : result;
      setAlbums(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      setHistoricalEdits(previous => JSON.stringify(previous) === JSON.stringify(historicalPhotos) ? previous : historicalPhotos);
      setError('');
    } catch (err) {
      if (!request.signal.aborted) setError(err.message);
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    loadAlbums();
    const refresh = () => { if (!document.hidden) loadAlbums(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      albumRequest.current?.abort();
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  useEffect(() => {
    document.title = `${title} · 零一玩家`;
  }, [title]);
  useEffect(() => {
    if (new URLSearchParams(location.search).get('view') === 'archive') openArchive();
    const reposition = () => { if (archive.current.open) positionArchive(); };
    window.addEventListener('resize', reposition);
    return () => window.removeEventListener('resize', reposition);
  }, []);
  function selectGallery(nextCategory, nextEventId = '') {
    if (archive.current.open) archive.current.close();
    const address = new URL(location.href);
    if (nextCategory === 'all') address.searchParams.delete('category');
    else address.searchParams.set('category', nextCategory);
    if (nextEventId) address.searchParams.set('event', nextEventId);
    else address.searchParams.delete('event');
    address.searchParams.delete('view');
    history.replaceState(history.state, '', address);
    if (nextCategory !== activeCategory || nextEventId !== eventId) {
      startTransition(() => setSelection({ category: nextCategory, eventId: nextEventId }));
    }
  }

  const items = useMemo(() => {
    const visibleAlbums = eventId ? [activeAlbum].filter(Boolean) : categoryLabel ? categoryAlbums : albums;
    const eventPhotos = visibleAlbums.flatMap(album => album.photos
      .filter(photo => photo.category !== 'certificate' && (!categoryLabel || archivePhotoMatches(album,photo,activeCategory)))
      .map(photo => ({ ...photo, organization: photo.organization || album.name, date: photo.date || album.date })));
    return eventId || categoryLabel ? eventPhotos : [...timeMachinePhotos, ...eventPhotos];
  }, [eventId, activeAlbum, activeCategory, categoryLabel, categoryAlbums, albums]);
  const galleryItems = useMemo(() => {
    const editsById = new Map(historicalEdits.map(photo => [photo.id, photo]));
    return items.map(item => {
      const edit = editsById.get(historicalPhotoId(item));
      const title = edit?.title ?? item.title;
      const originalSrc = item.fullImage || item.image;
      const fullSrc = siteAsset(edit?.fullImage || originalSrc);
      const { width, height } = imageDimensions(fullSrc);
      const originalRatio = !edit || edit.fullImage === originalSrc ? item.fullAspectRatio || item.aspectRatio : undefined;
      return {
        title,
        src: imageSource(fullSrc, 260),
        fullSrc,
        aspectRatio: width && height ? width / height : originalRatio,
        year: (item.date || title).match(/(?:19|20)\d{2}(?!\d)/)?.[0] || '',
        desc: [item.organization, edit?.credit ?? item.credit].filter(Boolean).join(' · '),
      };
    });
  }, [items, historicalEdits]);
  return <div className="time-machine time-machine--immersive">
    <SiteNavigation standalone mobileDetail headerBrand={<AccountHeading title={title} />} backHref={mobile ? undefined : '/#directions'}
      headerTools={<div className="tm-catalog-controls">
        {categoryLabel && <ChoiceMenu compact openBelow className="tm-session-select" label="选择场次" options={sessionOptions}
          value={categoryAlbums.some(album => album.eventId === eventId) ? eventId : ''}
          onChange={id => selectGallery(activeCategory, id)} />}
        <SpecularButton ref={archiveAnchor} size="sm" staticShine className="nav-control tm-catalog-toggle" aria-haspopup="dialog" title="影像目录"
          onClick={openArchive}>{categoryLabel || '影像目录'}</SpecularButton>
        {mobile && <SiteReturn fallback="/#directions" className="tm-mobile-return" />}
      </div>} />
    <a className="skip-link" href="#time-machine-main">跳到照片墙</a>
    <main id="time-machine-main" tabIndex={-1}>
      {galleryItems.length > 0 ? <PhantomGallery items={galleryItems} tileScale={activeAlbum ? 1.3 : mobile && activeCategory === 'all' ? .85 : 1} bright={mobile} />
        : <p className="tm-wall-status" role="status">{loading ? '正在加载影像…' : error || (activeAlbum ? '本场暂无影像。' : '没有找到公开的活动影像。')}</p>}
      {admin && publishedAlbum && <div className="tm-event-controls">
        <SpecularButton size="sm" aria-haspopup="dialog"
          onClick={() => management.current.showModal()}>添加本场照片</SpecularButton>
      </div>}
    </main>
    <dialog ref={archive} className="tm-archive-menu" aria-label="影像目录"
      onClick={event => { if (event.currentTarget === event.target) archive.current.close(); }}>
      <ul className="tm-directory-list" aria-label="影像分类">
        {Object.entries(archiveModules).map(([id, label]) => <li key={id}>
          <button type="button" aria-current={(id === 'plan' ? planSelected : activeCategory === id) ? 'true' : undefined}
            onClick={() => selectGallery(id)}>{label}</button>
          {id === 'plan' && <ul className="tm-directory-types" aria-label="玩家计划分类">
            {Object.entries(eventCategories).map(([type,label]) => <li key={type}>
              <button type="button" aria-current={activeCategory === type ? 'true' : undefined}
                onClick={() => selectGallery(type)}>{label}</button>
            </li>)}
          </ul>}
        </li>)}
      </ul>
    </dialog>
    {admin && publishedAlbum && <dialog ref={management} className="tm-directory" aria-labelledby="tm-management-title">
      <div className="tm-directory-body">
        <header className="tm-header">
          <h2 id="tm-management-title">添加本场照片</h2>
          <SpecularButton size="sm" onClick={() => management.current.close()}>关闭</SpecularButton>
        </header>
        <EventAlbumPhotoForm key={publishedAlbum.eventId} album={publishedAlbum} onSaved={loadAlbums} />
      </div>
    </dialog>}
  </div>;
}
