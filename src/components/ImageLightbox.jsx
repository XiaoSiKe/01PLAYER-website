import { useLanguage } from '../Language';
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiX } from 'react-icons/fi';
import { useTheme } from '../Theme';
import { siteAsset } from '../editorial/content';
import SpecularButton from '../SpecularButton';
import ResponsiveImage from './ResponsiveImage';
import UniqueLoading from './UniqueLoading';
import './ImageLightbox.css';

export function PhotoPreviewHeader({ onClose, autoFocus = false }) {
  const { t } = useLanguage();
  const { theme } = useTheme();
  return (
    <header className="image-lightbox__header">
      <img className="image-lightbox__brand" width={1602} height={560} alt=""
        src={siteAsset(theme === 'light' ? '/images/club-logo-horizontal-black.svg' : '/images/club-logo-horizontal-white.svg')} />
      <SpecularButton size="sm" className="image-lightbox__close" ariaLabel={t("退出")} autoFocus={autoFocus} onClick={onClose}>
        {t("退出")}<FiX aria-hidden="true" />
      </SpecularButton>
    </header>
  );
}

export default function ImageLightbox({ item, opener, onClose, visualCaption }) {
  const { t } = useLanguage();
  const dialogRef = useRef(null);
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false);
  const close = () => {
    dialogRef.current.close();
    opener?.focus({ preventScroll: true });
    onClose();
  };
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = previousOverflow; };
  }, []);
  return createPortal(
    <dialog ref={dialogRef} className={`image-lightbox${item.downloadName ? ' image-lightbox--qr' : ''}`} aria-labelledby="lightbox-caption"
      style={{ '--lightbox-aspect': item.fullAspectRatio || item.aspectRatio || 1.5 }}
      onCancel={event => { event.preventDefault(); close(); }}
      onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <PhotoPreviewHeader onClose={close} autoFocus />
      <figure className="image-lightbox__figure">
        <div className="image-lightbox__media" aria-busy={!ready && !failed}>
          {!ready && <ResponsiveImage className="image-lightbox__preview" src={item.image || item.src} alt="" aria-hidden="true" eager />}
          <ResponsiveImage className={`image-lightbox__full${ready ? ' is-ready' : ''}`} src={item.fullImage || item.image || item.src} eager
            alt={t(item.title || item.alt || '')} decoding="async" onLoad={() => setReady(true)} onError={() => setFailed(true)} />
          {!ready && !failed && <div className="image-lightbox__loading"><UniqueLoading /></div>}
        </div>
        <figcaption id="lightbox-caption" aria-label={t(item.title || item.alt)}>
          {visualCaption ?? t(item.title || item.alt)}
          {item.organization && <span className="image-lightbox__organization">{t(item.organization)}</span>}
          {item.credit && <span className="image-lightbox__credit">{t(item.credit)}</span>}
          {failed && <span>{t("高清图暂时无法加载，当前显示预览图。")}</span>}
        </figcaption>
      </figure>
      {item.downloadName && <div className="image-lightbox__actions">
        <SpecularButton className="image-lightbox__save"
          href={item.fullImage || item.image || item.src} download={item.downloadName} ariaLabel={t("保存{0}", [item.title || '二维码'])}>{t("保存二维码")}</SpecularButton>
      </div>}
    </dialog>, document.body
  );
}
