import { startTransition, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
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

export default function ChoiceMenu({ label, value, options, onChange, icon, compact = false, shineOnInteraction = false }) {
  const id = useId();
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const optionsRef = useRef([]);
  const openingIndex = useRef(0);
  const openingBounds = useRef(null);
  const [open, setOpen] = useState(false);
  const [keyboardOpening, setKeyboardOpening] = useState(false);
  const selectedIndex = Math.max(0, options.findIndex(item => item.id === value));
  const trigger = () => rootRef.current?.querySelector('button');
  const menuWidth = bounds => Math.min(compact ? Math.max(208, bounds.width) : 232, window.innerWidth - 24);
  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) trigger()?.focus({ preventScroll: true });
  };
  const show = (index = selectedIndex, keyboard = false) => {
    const bounds = trigger()?.getBoundingClientRect();
    if (!bounds) return;
    openingBounds.current = { bounds, width: menuWidth(bounds) };
    openingIndex.current = index;
    setKeyboardOpening(keyboard);
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) return undefined;
    let frame = 0;
    const placeMenu = (rect, focus) => {
      const menu = menuRef.current;
      if (!rect || !menu) return;
      if (rect.bottom < 0 || rect.top > window.innerHeight) { setOpen(false); return; }
      const width = menuWidth(rect);
      const widthStyle = `${width}px`;
      if (menu.style.width !== widthStyle) menu.style.width = widthStyle;
      const height = menu.offsetHeight;
      const scrollTop = optionScrollTop(menu, focus);
      menu.style.left = `${Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))}px`;
      menu.style.top = `${Math.max(12, Math.min(rect.bottom + 10, window.innerHeight - height - 12))}px`;
      if (focus) focusOption(menu, focus, scrollTop);
    };
    const schedulePlacement = event => {
      if (event.type === 'scroll' && event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        placeMenu(trigger()?.getBoundingClientRect());
      });
    };
    placeMenu(openingBounds.current?.bounds, optionsRef.current[openingIndex.current]);
    window.addEventListener('resize', schedulePlacement);
    window.addEventListener('scroll', schedulePlacement, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedulePlacement);
      window.removeEventListener('scroll', schedulePlacement, true);
    };
  }, [open, compact]);

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

  return <div ref={rootRef} className={compact ? "language-switcher choice-menu--compact" : "language-switcher"}>
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
      <span className="choice-menu__label" lang={options[selectedIndex].lang}>{options[selectedIndex].label}</span>
      <svg className="language-switcher__chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m3 4.5 3 3 3-3" /></svg>
    </SpecularButton>
    {open && createPortal(
      <div ref={menuRef} className={compact ? "language-menu choice-menu-panel--compact" : "language-menu"} id={`${id}-menu`} role="menu" aria-labelledby={`${id}-trigger`}
        data-keyboard={keyboardOpening || undefined} style={{ width: openingBounds.current?.width }} onKeyDown={handleMenuKeyDown}>
        <div className="language-menu__heading" aria-hidden="true">{label}</div>
        {options.map((item, index) => <div key={item.id} role="presentation">
          {item.group && item.group !== options[index - 1]?.group && <div className="choice-menu__group" aria-hidden="true">{item.group}</div>}
          <button ref={node => { optionsRef.current[index] = node; }}
            className="language-menu__option" type="button" role="menuitemradio" aria-checked={value === item.id}
            tabIndex={-1} onClick={() => { close(true); startTransition(() => onChange(item.id)); }}>
            {item.symbol && <span className="language-menu__symbol" aria-hidden="true">{item.symbol}</span>}
            <span className="language-menu__copy"><span lang={item.lang}>{item.label}</span>{item.description && <span lang="en">{item.description}</span>}</span>
            <svg className="language-menu__check" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 10 4 4 8-8" /></svg>
          </button>
        </div>)}
      </div>, document.body,
    )}
  </div>;
}
