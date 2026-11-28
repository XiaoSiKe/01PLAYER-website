import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { FiArrowLeft, FiArrowRight, FiFolder, FiMinus, FiPlus } from 'react-icons/fi';
import './guide-folders.css';

// Keep the folder fixed; only its papers fan out using the supplied spring.
const paperSpring = { type: 'spring', stiffness: 320, damping: 28, mass: 0.85 };

function GuideFolder({ group, index }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(null);
  const [sheetPage, setSheetPage] = useState(0);
  const reduce = useReducedMotion();
  const pageCount = Math.max(1, Math.ceil(group.chapters.length / 3));
  const currentPage = Math.min(sheetPage, pageCount - 1);
  const preview = group.chapters.slice(currentPage * 3, currentPage * 3 + 3);
  const panelId = group.id + '-papers';
  const controls = panelId;
  const instant = { duration: 0 };
  const toggle = () => { setOpen(current => !current); setActive(null); setSheetPage(0); };

  return <motion.section className="guide-folder"
    initial={reduce ? false : { y: 20, opacity: .6 }} whileInView={{ y: 0, opacity: 1 }}
    viewport={{ once: true, amount: .15 }} transition={{ duration: reduce ? 0 : .45, delay: Math.min(index, 5) * .07 }} data-open={open || undefined} aria-labelledby={group.id}
    onKeyDown={event => {
      if (event.key === 'Escape' && open) {
        setOpen(false);
        event.currentTarget.querySelector('.guide-folder-sleeve').focus();
      }
    }}>
    <div className="guide-folder-stage">
      <div className="guide-folder-tray">
        <div id={panelId} className="guide-folder-papers" aria-hidden={!open} inert={!open}>
          {preview.map((chapter, index) => {
            const offset = index - (preview.length - 1) / 2;
            const lifted = open && active === chapter.id;
            const transform = reduce ? `translate(${open ? offset * 66 : 0}%, ${open ? -42 : 0}px)` : open
              ? `translate(${offset * 66}%, ${lifted ? -54 : -42 + Math.abs(offset) * 5}px) rotate(${lifted ? 0 : offset * 6.5}deg) scale(${lifted ? 1.06 : 1})`
              : `translate(${offset * 28}%, 12px) rotate(${offset * 2}deg) scale(.9)`;
            return <motion.a key={chapter.id} href={`#${chapter.id}`} title={chapter.title} className="guide-folder-paper"
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
          aria-expanded={open} aria-controls={controls} onClick={toggle}>
          {open ? <FiMinus aria-hidden="true" /> : <FiPlus aria-hidden="true" />}
        </button>
      </div>
      <button className="guide-folder-sleeve" type="button" onClick={toggle} aria-expanded={open} aria-controls={controls}
        aria-label={`${open ? '收起' : '打开'}「${group.title}」文件夹，${group.chapters.length} 篇文章`}
      >
        <FiFolder className="guide-folder-icon" aria-hidden="true" />
        <span className="guide-folder-title" id={group.id} tabIndex={-1} role="heading" aria-level={3}>{group.title}</span>
        <span className="guide-folder-caption">{group.chapters.length} 篇文章<FiArrowRight aria-hidden="true" /></span>
      </button>
    </div>
    {pageCount > 1 && <nav className="guide-folder-pagination" aria-hidden={!open} inert={!open} style={{visibility:open ? 'visible' : 'hidden'}} aria-label={`「${group.title}」文件翻页`}>
      <button type="button" aria-label={`「${group.title}」上一页文章`} disabled={currentPage === 0}
        onClick={() => { setSheetPage(currentPage - 1); setActive(null); }}><FiArrowLeft aria-hidden="true" /></button>
      <span role="status">{currentPage + 1} / {pageCount}</span>
      <button type="button" aria-label={`「${group.title}」下一页文章`} disabled={currentPage === pageCount - 1}
        onClick={() => { setSheetPage(currentPage + 1); setActive(null); }}><FiArrowRight aria-hidden="true" /></button>
    </nav>}

  </motion.section>;
}

export default function GuideFolders({ groups }) {
  return <div className="guide-folders">
    {groups.map((group, index) => <GuideFolder key={group.id} group={group} index={index} />)}
  </div>;
}
