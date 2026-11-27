import { useEffect, useMemo, useRef, useState } from 'react';
import SiteNavigation from '../components/SiteNavigation';
import SpecularButton from '../SpecularButton';
import ImageLightbox from '../components/ImageLightbox';
import ResponsiveImage from '../components/ResponsiveImage';
import { imageSource } from '../components/imageSource';
import PhantomGallery from './PhantomGallery';
import EventAlbums from './EventAlbums';
import { communityApi } from '../community/api';
import { AccountHeading } from '../community/account/AccountForms';
import { useLanguage } from '../Language';
import { timeMachinePhotos } from './photos';
import './time-machine.css';

const categories = [
  ['all', '全部影像'],
  ['activity', '活动照片'],
  ['competition', '比赛现场'],
  ['certificate', '获奖记录'],
];

export default function TimeMachinePage() {
  const { t } = useLanguage();
  const title = t('零一时光机');
  const [category, setCategory] = useState('all');
  const [selected, setSelected] = useState(null);
  const [albums, setAlbums] = useState([]);
  const [admin, setAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const archive = useRef(null);
  const [eventId, setEventId] = useState(() => new URLSearchParams(location.search).get('event') || '');

  async function loadAlbums() {
    try {
      const [next, session] = await Promise.all([communityApi('albums'), communityApi('session')]);
      setAlbums(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      setAdmin(session.user?.role === 'admin');
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAlbums();
    const refresh = () => { if (!document.hidden) loadAlbums(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  useEffect(() => {
    document.title = `${title} · 零一玩家`;
  }, [title]);
  useEffect(() => {
    if (new URLSearchParams(location.search).get('view') === 'archive' && !archive.current.open)
      archive.current.showModal();
  }, []);

  function selectAlbum(id) {
    setEventId(id);
    setCategory('all');
    const address = new URL(location.href);
    if (id) address.searchParams.set('event', id);
    else address.searchParams.delete('event');
    history.replaceState(history.state, '', address);
  }

  const items = useMemo(() => {
    const archive = albums.flatMap(album => album.photos.map(photo => ({ ...photo, organization: album.name, date: album.date })));
    const pool = eventId ? archive.filter(photo => photo.eventId === eventId) : [...timeMachinePhotos, ...archive];
    return pool.filter(item => category === 'all' || item.category === category);
  }, [category, eventId, albums]);
  const galleryItems = useMemo(() => items.map(item => ({
    title: item.title,
    src: imageSource(item.image, 360, 360),
    fullSrc: item.fullImage || item.image,
    year: (item.date || item.title).match(/(?:19|20)\d{2}(?!\d)/)?.[0] || '',
    desc: [item.organization, item.credit].filter(Boolean).join(' · '),
  })), [items]);

  return <div className="time-machine time-machine--immersive">
    <SiteNavigation standalone headerBrand={<AccountHeading title={title} />}
      headerTools={<SpecularButton size="sm" staticShine className="nav-control tm-catalog-toggle" aria-haspopup="dialog"
        onClick={() => archive.current.showModal()}>影像目录</SpecularButton>} />
    <a className="skip-link" href="#time-machine-main">跳到照片墙</a>
    <main id="time-machine-main" tabIndex={-1}>
      {galleryItems.length > 0 ? <PhantomGallery items={galleryItems} />
        : <p className="tm-wall-status" role="status">{loading ? '正在加载影像…' : '此分类暂无影像，可在影像目录选择其他记录。'}</p>}
    </main>
    <dialog ref={archive} className="tm-directory" aria-labelledby="tm-directory-title"
      onClick={event => { if (event.currentTarget === event.target) archive.current.close(); }}>
      <div className="tm-directory-body">
        <header className="tm-header">
          <h2 id="tm-directory-title">影像目录</h2>
          <SpecularButton size="sm" onClick={() => archive.current.close()}>关闭目录</SpecularButton>
        </header>
        <EventAlbums albums={albums} eventId={eventId} onSelect={selectAlbum} admin={admin}
          onSaved={loadAlbums} loading={loading} error={error} retry={loadAlbums} />
        <div className="tm-toolbar tm-filters" aria-label="影像分类">
          {categories.map(([id, label]) =>
            <button key={id} aria-pressed={category === id} onClick={() => setCategory(id)}>{label}</button>
          )}
        </div>
        {items.length ? <div className="tm-catalog">
          {items.map(item => <button key={item.id} onClick={event => setSelected({ item, opener: event.currentTarget })}>
            <ResponsiveImage src={item.image} alt="" width={320} height={240} />
            <span>{item.title}</span>
            {item.organization && <small>{item.organization}</small>}
          </button>)}
        </div> : <div className="tm-album-empty" role="status">
          {loading ? '正在加载影像…' : eventId ? '本专题暂无此分类的照片。' : '这个分类暂无影像。'}
        </div>}
        <footer className="tm-footer">{items.length} 张影像 · 零一玩家</footer>
      </div>
    </dialog>
    {selected && <ImageLightbox item={selected.item} opener={selected.opener} onClose={() => setSelected(null)} />}
  </div>;
}
