import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { FiArrowRight, FiFileText, FiFolder, FiMinus, FiPlus } from 'react-icons/fi';
import './guide-folders.css';

// Tray and paper springs follow the supplied PhotoBox component.
const traySpring = { type: 'spring', stiffness: 280, damping: 30, mass: 0.9 };
const paperSpring = { type: 'spring', stiffness: 320, damping: 28, mass: 0.85 };

function GuideFolder({ group }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(null);
  const reduce = useReducedMotion();
  const preview = group.chapters.slice(0, 3);
  const remaining = group.chapters.slice(3);
  const panelId = group.id + '-papers';
  const instant = { duration: 0 };
  const toggle = () => { setOpen(current => !current); setActive(null); };

  return <section className="guide-folder" data-open={open || undefined} aria-labelledby={group.id}
    onKeyDown={event => {
      if (event.key === 'Escape' && open) {
        setOpen(false);
        event.currentTarget.querySelector('.guide-folder-sleeve').focus();
      }
    }}>
    <div className="guide-folder-stage">
      <motion.div className="guide-folder-tray" initial={false}
        animate={{ transform: open ? 'translateX(22%)' : 'translateX(0%)' }}
        transition={reduce ? instant : traySpring}>
        <div id={panelId} className="guide-folder-papers" aria-hidden={!open} inert={!open}>
          {preview.map((chapter, index) => {
            const offset = index - (preview.length - 1) / 2;
            const lifted = open && active === chapter.id;
            const transform = reduce ? `translate(${open ? offset * 100 : 0}%, ${open ? -84 : 0}px)` : open
              ? `translate(${offset * 66}%, ${lifted ? -102 : -84 + Math.abs(offset) * 5}px) rotate(${lifted ? 0 : offset * 6.5}deg) scale(${lifted ? 1.06 : 1})`
              : `translate(${offset * 28}%, 26px) rotate(${offset * 2}deg) scale(.9)`;
            return <motion.a key={chapter.id} href={`#${chapter.id}`} className="guide-folder-paper"
              initial={false} animate={{ transform }} transition={reduce ? instant : paperSpring}
              style={{ zIndex: lifted ? 5 : index + 1 }}
              tabIndex={open ? 0 : -1} onFocus={() => setActive(chapter.id)} onBlur={() => setActive(null)}
              onPointerEnter={event => { if (event.pointerType === 'mouse' && open) setActive(chapter.id); }}
              onPointerLeave={() => setActive(null)}>
              <span className="guide-folder-paper-text">{chapter.title}</span>
              <span className="guide-folder-paper-lines" aria-hidden="true"><i /><i /><i /></span>
              <FiArrowRight aria-hidden="true" />
            </motion.a>;
          })}
        </div>
        <svg className="guide-folder-pocket" viewBox="0 0 292 84" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 0 H122 A24 22 0 0 0 170 0 H292 V70 A14 14 0 0 1 278 84 H14 A14 14 0 0 1 0 70 Z" />
        </svg>
        <button className="guide-folder-tab" type="button" aria-label={`${open ? '收起' : '打开'}「${group.title}」文件夹`}
          aria-expanded={open} aria-controls={panelId} onClick={toggle}>
          {open ? <FiMinus aria-hidden="true" /> : <FiPlus aria-hidden="true" />}
        </button>
      </motion.div>
      <motion.button className="guide-folder-sleeve" type="button" initial={false}
        animate={{ transform: open ? 'translateX(-22%)' : 'translateX(0%)' }}
        transition={reduce ? instant : traySpring} onClick={toggle} aria-expanded={open} aria-controls={panelId}
        aria-label={`${open ? '收起' : '打开'}「${group.title}」文件夹，${group.chapters.length} 篇文章`}
      >
        <FiFolder className="guide-folder-icon" aria-hidden="true" />
        <span className="guide-folder-title" id={group.id} tabIndex={-1} role="heading" aria-level={3}>{group.title}</span>
        <span className="guide-folder-caption">{group.chapters.length} 篇文章<FiArrowRight aria-hidden="true" /></span>
      </motion.button>
    </div>
    <ul className="guide-folder-extra" hidden={!open || !remaining.length}>
      {remaining.map(chapter => <li key={chapter.id}><a href={`#${chapter.id}`}><FiFileText aria-hidden="true" />{chapter.title}<FiArrowRight aria-hidden="true" /></a></li>)}
    </ul>
  </section>;
}

export default function GuideFolders({ groups }) {
  return <div className="guide-folders">
    {groups.map(group => <GuideFolder key={group.id} group={group} />)}
  </div>;
}
