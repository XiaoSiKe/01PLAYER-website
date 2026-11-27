import { useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { FiArrowRight, FiFileText, FiMinus, FiPlus } from 'react-icons/fi';
import './guide-folders.css';

const coverSpring = { type: 'spring', stiffness: 280, damping: 30, mass: 0.9 };
const easeOut = [.23, 1, .32, 1];

function GuideFolder({ group, index }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  const reduce = useReducedMotion();
  const panelId = group.id + '-papers';
  const controls = panelId + ' ' + panelId + '-cover';

  function toggle() {
    setOpen(current => !current);
    trigger.current.focus({ preventScroll: true });
  }

  return <motion.section className="guide-folder" data-open={open || undefined} aria-labelledby={group.id}
    initial={reduce ? false : { transform: 'translateY(22px)', opacity: .65 }}
    whileInView={{ transform: 'translateY(0px)', opacity: 1 }}
    viewport={{ once: true, amount: .15 }}
    transition={{ duration: reduce ? 0 : .48, delay: reduce ? 0 : Math.min(index, 5) * .07, ease: easeOut }}
    onKeyDown={event => {
      if (event.key === 'Escape' && open) {
        setOpen(false);
        trigger.current.focus();
      }
    }}>
    <h3 className="guide-folder-heading">
      <button ref={trigger} type="button" className="guide-folder-toggle" onClick={toggle}
        aria-expanded={open} aria-controls={controls} aria-label={`${open ? '收起' : '打开'}「${group.title}」文件夹`}>
        <span className="guide-folder-title" id={group.id} tabIndex={-1}>{group.title}</span>
        <span className="guide-folder-count">{group.chapters.length} 篇</span>
        <span className="guide-folder-toggle-icon">{open ? <FiMinus aria-hidden="true" /> : <FiPlus aria-hidden="true" />}</span>
      </button>
    </h3>
    <div className="guide-folder-stage">
      <div className="guide-folder-back" aria-hidden="true" />
      <div className="guide-folder-stack" aria-hidden="true">
        {group.chapters.slice(0, 2).map(chapter => <span key={chapter.id} />)}
      </div>
      <ul id={panelId} className="guide-folder-papers" aria-hidden={!open} inert={!open}>
        {group.chapters.map((chapter, position) => <motion.li key={chapter.id} initial={false}
          animate={{ transform: open ? 'translateY(0px)' : 'translateY(18px)', opacity: open ? 1 : 0 }}
          transition={{ duration: reduce ? 0 : .26, delay: open && !reduce ? Math.min(position, 5) * .035 : 0, ease: easeOut }}>
          <a href={`#${chapter.id}`} className="guide-folder-paper" tabIndex={open ? 0 : -1}>
            <FiFileText className="guide-folder-paper-icon" aria-hidden="true" />
            <span className="guide-folder-paper-text">{chapter.title}</span>
            <FiArrowRight className="guide-folder-paper-arrow" aria-hidden="true" />
          </a>
        </motion.li>)}
      </ul>
      <motion.button id={panelId + '-cover'} className="guide-folder-sleeve" type="button" initial={false}
        animate={{
          transform: open && !reduce ? 'perspective(900px) translateY(30px) rotateX(-12deg)' : 'perspective(900px) translateY(0px) rotateX(0deg)',
          opacity: open ? 0 : 1,
        }}
        transition={reduce ? { duration: 0 } : coverSpring}
        onClick={toggle} aria-expanded={open} aria-controls={panelId}
        aria-label={`打开「${group.title}」文件夹，${group.chapters.length} 篇文章`}
        aria-hidden={open} inert={open} tabIndex={open ? -1 : 0}>
        <span className="guide-folder-cover-mark" aria-hidden="true"><span /></span>
        <span className="guide-folder-cover-label">展开文章<FiArrowRight aria-hidden="true" /></span>
      </motion.button>
    </div>
  </motion.section>;
}

export default function GuideFolders({ groups }) {
  return <div className="guide-folders">
    {groups.map((group, index) => <GuideFolder key={group.id} group={group} index={index} />)}
  </div>;
}
