import { startTransition, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import SpecularButton from '../SpecularButton';

function optionScrollTop(menu, option) {
  if (!menu || !option) return null;
  const top = option.offsetTop;
  const bottom = top + option.offsetHeight;
  if (top < menu.scrollTop) return top;
  if (bottom > menu.scrollTop + menu.clientHeight) return bottom - menu.clientHeight;
  return null;
}

function focusOption(menu, option, scrollTop = optionScrollTop(menu, option)) {
  if (!menu || !option) return;
  if (scrollTop !== null) menu.scrollTop = scrollTop;
  option.focus({ preventScroll: true });
}

export default function ChoiceMenu({ label, value, options, onChange, icon, compact = false, openBelow = false, shineOnInteraction = false, className = '' }) {
  const id = useId();
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const optionsRef = useRef([]);
  const openingIndex = useRef(0);
  const openingBounds = useRef(null);
  const [open, setOpen] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [keyboardOpening, setKeyboardOpening] = useState(false);
  const selectedIndex = Math.max(0, options.findIndex(item => item.id === value));
  const trigger = useCallback(() => rootRef.current?.querySelector('button'), []);
  const menuWidth = bounds => Math.min(compact ? Math.max(208, bounds.width) : 232, window.innerWidth - 24);
  const menuLeft = (bounds, width) => Math.max(12, Math.min(bounds.right - width, window.innerWidth - width - 12));
  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) trigger()?.focus({ preventScroll: true });
  }, [trigger]);
  const select = useCallback(itemId => {
    close(true);
    startTransition(() => onChange(itemId));
  }, [close, onChange]);
  const show = (index = selectedIndex, keyboard = false) => {
    const bounds = trigger()?.getBoundingClientRect();
    if (!bounds) return;
    const width = menuWidth(bounds);
    openingBounds.current = { bounds, width, left: menuLeft(bounds, width) };
    openingIndex.current = index;
    setKeyboardOpening(keyboard);
    setPrepared(true);
    setOpen(true);
  };

  useEffect(() => {
    if (prepared || !options.length) return;
    const prepare = () => startTransition(() => setPrepared(true));
    if (window.requestIdleCallback) {
      const request = window.requestIdleCallback(prepare);
      return () => window.cancelIdleCallback(request);
    }
    const timer = window.setTimeout(prepare, 200);
    return () => window.clearTimeout(timer);
  }, [options.length, prepared]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const menu = menuRef.current;
    let frame = 0;
    let menuHeight = 0;
    const placeMenu = (rect, focus) => {
      if (!rect || !menu) return;
      if (rect.bottom < 0 || rect.top > window.innerHeight) { setOpen(false); return; }
      const width = menuWidth(rect);
      const widthStyle = `${width}px`;
      if (menu.style.width !== widthStyle) {
        menu.style.width = widthStyle;
        menuHeight = 0;
      }
      const below = Math.max(12, rect.bottom + 10);
      const bottomLimit = window.innerHeight - 12;
      if (openBelow) {
        const maxHeight = `${Math.max(0, bottomLimit - below)}px`;
        if (menu.style.maxHeight !== maxHeight) menu.style.maxHeight = maxHeight;
      } else if (!menuHeight) menuHeight = menu.offsetHeight;
      const scrollTop = optionScrollTop(menu, focus);
      const left = `${menuLeft(rect, width)}px`;
      const top = `${openBelow ? below : Math.max(12, Math.min(below, bottomLimit - menuHeight))}px`;
      if (menu.style.left !== left) menu.style.left = left;
      if (menu.style.top !== top) menu.style.top = top;
      if (focus) focusOption(menu, focus, scrollTop);
    };
    const schedulePlacement = event => {
      if (event?.type === 'scroll' && event.target instanceof Node && menu?.contains(event.target)) return;
      if (event?.type === 'resize') menuHeight = 0;
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        placeMenu(trigger()?.getBoundingClientRect());
      });
    };
    placeMenu(openingBounds.current?.bounds, optionsRef.current[openingIndex.current]);
    const observer = menu && !openBelow ? new ResizeObserver(([entry]) => {
      const height = Math.round(entry.borderBoxSize?.[0]?.blockSize ?? menu.offsetHeight);
      if (height === menuHeight) return;
      menuHeight = height;
      schedulePlacement();
    }) : null;
    observer?.observe(menu, { box: 'border-box' });
    window.addEventListener('resize', schedulePlacement);
    window.addEventListener('scroll', schedulePlacement, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedulePlacement);
      window.removeEventListener('scroll', schedulePlacement, true);
    };
  }, [open, compact, openBelow]);

  useEffect(() => {
    if (!open) return undefined;
    const dismissOutside = event => {
      if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('focusin', dismissOutside);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('focusin', dismissOutside);
    };
  }, [open]);

  const handleMenuKeyDown = event => {
    const index = optionsRef.current.indexOf(document.activeElement);
    let next;
    if (event.key === 'ArrowDown') next = (index + 1) % options.length;
    if (event.key === 'ArrowUp') next = (index - 1 + options.length) % options.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = options.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      event.stopPropagation();
      focusOption(menuRef.current, optionsRef.current[next]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'Tab') {
      // Continue the page's tab order from the trigger, rather than the portal.
      close(true);
    }
  };

  // Keep prepared rows so toggling only changes visibility and placement.
  const menuRows = useMemo(() => prepared && options.map((item, index) => <div key={item.id} role="presentation">
    {item.group && item.group !== options[index - 1]?.group && <div className="choice-menu__group" aria-hidden="true">{item.group}</div>}
    <button ref={node => { optionsRef.current[index] = node; }}
      className="language-menu__option" type="button" role="menuitemradio" aria-checked={value === item.id}
      tabIndex={-1} onClick={() => select(item.id)}>
      {item.symbol && <span className="language-menu__symbol" aria-hidden="true">{item.symbol}</span>}
      <span className="language-menu__copy"><span lang={item.lang}>{item.label}</span>{item.description && <span lang="en">{item.description}</span>}</span>
      <svg className="language-menu__check" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 10 4 4 8-8" /></svg>
    </button>
  </div>), [prepared, options, value, select]);

  return <div ref={rootRef} className={`language-switcher${compact ? ' choice-menu--compact' : ''}${className ? ' ' + className : ''}`}>
    <SpecularButton size="sm" staticShine={!shineOnInteraction} shineOnInteraction={shineOnInteraction}
      className="nav-control language-switcher__trigger" id={`${id}-trigger`}
      ariaLabel={`${label} · ${options[selectedIndex].label}`}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? `${id}-menu` : undefined}
      data-keyboard={keyboardOpening || undefined}
      onClick={event => open ? close() : show(selectedIndex, event.detail === 0)}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          show(event.key === 'ArrowUp' ? options.length - 1 : 0, true);
        }
      }}>
      {icon}
      <span className="choice-menu__label" lang={options[selectedIndex].lang}>{options[selectedIndex].shortLabel ?? options[selectedIndex].label}</span>
      <svg className="language-switcher__chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m3 4.5 3 3 3-3" /></svg>
    </SpecularButton>
    {prepared && createPortal(
      <div ref={menuRef} className={compact ? "language-menu choice-menu-panel--compact" : "language-menu"} id={`${id}-menu`} role="menu" aria-labelledby={`${id}-trigger`}
        hidden={!open} data-keyboard={keyboardOpening || undefined}
        style={{ width: openingBounds.current?.width, left: openingBounds.current?.left }} onKeyDown={handleMenuKeyDown}>
        <div className="language-menu__heading" aria-hidden="true">{label}</div>
        {menuRows}
      </div>, document.body,
    )}
  </div>;
}
