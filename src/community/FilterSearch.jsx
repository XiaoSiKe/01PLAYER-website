import { useRef } from 'react';
import { FiSearch, FiX } from 'react-icons/fi';
import useMediaQuery from '../components/useMediaQuery';
import { Button } from './CommunityUi';
import './filter-search.css';

export default function FilterSearch({ label, value, onChange, specular = false, iconOnly = false, onSearch, onResultFocus, resultsId }) {
  const mobile = useMediaQuery('(max-width: 760px)');
  const dialog = useRef(null), input = useRef(null);
  const field = <><FiSearch aria-hidden="true" /><input type="search" aria-label={label} aria-controls={resultsId} placeholder={label}
    value={value} onChange={event => onChange(event.target.value)} /></>;
  return <>
    {mobile || iconOnly ? <Button size="sm" shineOnInteraction className="community-search-toggle" ariaLabel={label}
      aria-haspopup="dialog" aria-pressed={Boolean(value)} onClick={() => {dialog.current.showModal();input.current.focus();}}>
      <FiSearch aria-hidden="true" />
    </Button> : specular ? <Button as="label" size="sm" shineOnInteraction className="community-search community-search--specular">{field}</Button>
      : <label className="community-search">{field}</label>}
    <dialog className="community-filter-search-dialog" ref={dialog} aria-label={label} onKeyDown={event => {if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dialog.current.close();}}}
      onClick={event => {if(event.target===event.currentTarget)dialog.current.close();}}>
      <header><h2>{label}</h2><Button size="sm" ariaLabel="关闭搜索" onClick={() => dialog.current.close()}><FiX aria-hidden="true" /></Button></header>
      <input ref={input} type="search" aria-label={label} aria-controls={resultsId} placeholder={label} value={value}
        onChange={event => onChange(event.target.value)} onKeyDown={event => {
          if(event.key==='Enter'){event.preventDefault();onSearch?.();dialog.current.close();}
          else if(event.key==='ArrowDown'&&onResultFocus){event.preventDefault();dialog.current.close();onResultFocus();}
        }} />
    </dialog>
  </>;
}
