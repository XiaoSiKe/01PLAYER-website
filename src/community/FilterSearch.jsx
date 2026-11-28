import { useId, useRef, useState } from 'react';
import { FiSearch, FiX } from 'react-icons/fi';
import useMediaQuery from '../components/useMediaQuery';
import { Button } from './CommunityUi';
import './filter-search.css';

export default function FilterSearch({ label, value, onChange, specular = false, iconOnly = false, onSearch, resultsId, renderResults }) {
  const mobile = useMediaQuery('(max-width: 760px)');
  const isolated = mobile && Boolean(renderResults);
  const [draft, setDraft] = useState('');
  const dialogValue = isolated ? draft : value;
  const dialog = useRef(null), input = useRef(null), results = useRef(null);
  const id = useId();
  const dialogResultsId = renderResults ? `${resultsId || id}-dialog` : resultsId;
  const field = <><FiSearch aria-hidden="true" /><input type="search" aria-label={label} aria-controls={resultsId} placeholder={label}
    value={value} onChange={event => onChange(event.target.value)} /></>;
  return <>
    {mobile || iconOnly ? <Button size="sm" shineOnInteraction className="community-search-toggle" ariaLabel={label}
      aria-haspopup="dialog" aria-pressed={Boolean(isolated ? draft : value)} onClick={() => {if(isolated)setDraft('');dialog.current.showModal();input.current.focus();}}>
      <FiSearch aria-hidden="true" />
    </Button> : specular ? <Button as="label" size="sm" shineOnInteraction className="community-search community-search--specular">{field}</Button>
      : <label className="community-search">{field}</label>}
    <dialog className={`community-filter-search-dialog${renderResults ? ' community-filter-search-dialog--results' : ''}`} ref={dialog} aria-label={label} onClose={() => {if(isolated)setDraft('');}} onKeyDown={event => {
      if(event.nativeEvent.isComposing){event.stopPropagation();return;}
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dialog.current.close();}
    }}
      onClick={event => {if(event.target===event.currentTarget)dialog.current.close();}}>
      <header><h2>{label}</h2><Button size="sm" ariaLabel="关闭搜索" onClick={() => dialog.current.close()}><FiX aria-hidden="true" /></Button></header>
      <input ref={input} type="search" aria-label={label} aria-controls={dialogResultsId} placeholder={label} value={dialogValue}
        onChange={event => (isolated ? setDraft : onChange)(event.target.value)} onKeyDown={event => {
          if(event.nativeEvent.isComposing)return;
          if(event.key==='Enter'){event.preventDefault();if(onSearch?.(dialogValue)!==false)dialog.current.close();}
          else if(event.key==='ArrowDown'&&renderResults){event.preventDefault();results.current?.querySelector('button, a[href]')?.focus();}
        }} />
      {renderResults && <div ref={results} id={dialogResultsId} className="community-filter-search-results">{renderResults(() => dialog.current.close(), dialogValue)}</div>}
    </dialog>
  </>;
}
