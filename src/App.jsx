import { siteDestination } from './data/destinations';
import HomeRegions from './editorial/regions';
import { siteAsset } from './editorial/content';
import { useLanguage } from './Language';
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SiGithub, SiX } from 'react-icons/si';
import MobileLineBreak from './components/MobileLineBreak';
import SiteBackground from './components/SiteBackground';
import ViewportMount from './components/ViewportMount';
import ResponsiveImage from './components/ResponsiveImage';
import ImageLightbox from './components/ImageLightbox';
import renderDisplayedQr from './components/renderDisplayedQr';
import { imageSource } from './components/imageSource';
import { LoadingSlot } from './components/UniqueLoading';
import EchoText from './EchoText';
import { BRAND_ECHO_PROPS } from './components/EchoText/brandEchoProps';
import SpecularButton from './SpecularButton';
import SiteNavigation from './components/SiteNavigation';
import ClubLogo from './components/ClubLogo';
import ShadowWordmark from './components/ShadowWordmark';
import BorderGlow, { SITE_BORDER_GLOW } from './BorderGlow';
import LogoLoop from './LogoLoop';
import ExploreSection from './components/ExploreSection';
import ExploreEntry from './components/ExploreEntry';
import WorkShowcase from './components/WorkShowcase';
import ExploreModuleIcon from './components/ExploreModuleIcon';
import LogoMarquee from './components/LogoMarquee';
import BranchAtlas from './components/BranchAtlas';
import ResearchSection from './components/ResearchSection';
import ShutterWordmark from './components/ShutterWordmark';
import PerspectiveTunnelHero from './components/ui/perspective-tunnel-hero';
import SocialIcon from './components/SocialIcon';
import { socialChannels, extraFooterLinks } from './data/social';
import { businesses } from './data/business';
import { contactQr, wechatChannel } from './data/community';
import { homeSectionFromPath, homeSectionPaths, pagePaths } from './data/page-paths';
import { COMMUNITY_SLOGAN, COMMUNITY_SLOGAN_EN, CORE_ENTRIES } from './data/positioning';
import { memberPageLink } from './data/people-navigation';
import { linkWithSource } from './community/account/navigation';
import { pioneers } from './data/pioneers';
import { leadership } from './data/leadership';
import joinQr from './assets/join-qq-qr.webp';

gsap.registerPlugin(ScrollToPlugin, ScrollTrigger);
const FlexCarousel = lazy(() => import('./FlexCarousel'));
const HERO_ECHO_PROPS = { ...BRAND_ECHO_PROPS, mode: 'pointer' };
const [shadowEntry, playersEntry, plazaEntry] = CORE_ENTRIES;
const HERO_ENTRIES = [playersEntry, shadowEntry, plazaEntry];

const PRESIDENT = leadership.find(member => member.id === 'XiaoSiKe') || pioneers.find(member => member.id === 'XiaoSiKe');
const ABOUT_PEOPLE_ENTRIES = [
  { id: 'mentor', title: '启航导师', href: pagePaths.mentors, label: '认识启航导师' },
  { id: 'leadership', title: '头号玩家', href: pagePaths.leadership, label: '认识头号玩家' },
  { id: 'pioneers', title: '先锋玩家', href: pagePaths.pioneers, label: '认识先锋玩家' },
  { id: 'join', title: '加入零一', href: pagePaths.join, label: '加入零一' },
];
const RECRUITMENT_DEPARTMENTS = [
  { name: '技术开发部', mark: 'terminal' },
  { name: '商务拓展部', mark: 'business' },
  { name: '人力组织部', mark: 'people' },
  { name: '运营公关部', mark: 'operations' },
];
const JOIN_QR_ITEMS = {
  qq: { image: siteAsset('join-qq', joinQr), title: '零一玩家 QQ 社区群', downloadName: '零一玩家-QQ社区群.png' },
  official: { image: siteAsset('join-wechat', wechatChannel.qr), title: '零一玩家微信公众号', downloadName: '零一玩家-微信公众号.png' },
  contact: { image: siteAsset(contactQr.assetKey, contactQr.image), title: '官方合作联系：零小一', downloadName: '零一玩家-官方合作微信.png' },
};
const footerMarks = {
  telegram: <SocialIcon platform="telegram" />,
  club: <span className="home-footer-brand-mark home-footer-club-mark"><ResponsiveImage eager src="/images/club-logo-white.svg" alt="" width={48} height={48} /></span>,
  github: <SiGithub style={{ color: 'var(--site-ink)' }} />,
  x: <SiX style={{ color: 'var(--site-ink)' }} />,
  feishu: <span className="home-footer-brand-mark"><ResponsiveImage eager src="/images/feishu-logo.png" alt="" width={48} height={48} /></span>,
  founder: <span className="home-footer-brand-mark home-footer-lingyiyang-mark" style={{ '--brand-mask': `url("${imageSource('/images/lingyiyang-logo.jpg', 77, 77)}")` }} />,
  qq: <span className="home-footer-brand-mark"><ResponsiveImage eager src="/images/qq-logo.png" alt="" width={48} height={48} /></span>,
};
const FOOTER_LOGOS = [
  ...socialChannels.map(channel => ({ ...channel, node: <SocialIcon platform={channel.id} /> })),
  ...extraFooterLinks.map(row => ({
    ...row, node: row.image ? <ResponsiveImage eager src={row.image} alt="" width={48} height={48} /> : footerMarks[row.id] || <span>{row.title}</span>,
  })),
];
export default function App() {
  const { t, locale } = useLanguage();
  useEffect(() => { document.title = t('零一玩家｜01PLAYER'); }, [t]);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => cancelAnimationFrame(frame);
  }, [locale]);
  const borderGlowProps = SITE_BORDER_GLOW;
  const pageRef = useRef(null);
  const scrollTweenRef = useRef(null);
  const [selectedQr, setSelectedQr] = useState(null);
  const [qrError, setQrError] = useState('');
  const qrRequestRef = useRef(0);
  useEffect(() => () => {
    const image = selectedQr?.item.image;
    if (image?.startsWith('blob:')) URL.revokeObjectURL(image);
  }, [selectedQr]);
  useEffect(() => () => { qrRequestRef.current += 1; }, []);
  const openQr = async (event, item) => {
    const opener = event.currentTarget, request = ++qrRequestRef.current;
    setQrError('');
    try {
      const rendered = await renderDisplayedQr(opener.querySelector('.home-join-qr-media'), item.image);
      if (request !== qrRequestRef.current) { URL.revokeObjectURL(rendered.image); return; }
      setSelectedQr({ item: { ...item, ...rendered }, opener });
    } catch {
      if (request === qrRequestRef.current) setQrError('二维码暂时无法打开，请稍后再试。');
    }
  };

  const scrollToSection = useCallback((id) => {
    const target = document.getElementById(id);
    if (!target) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const targetY = target.getBoundingClientRect().top + window.scrollY;
    const destinationY = id === 'hero-title' || id === 'top'
      ? 0
      : Math.max(0, targetY - 88);
    const finishNavigation = () => {
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      const address = new URL(window.location.href);
      if (Object.hasOwn(homeSectionPaths, id)) {
        address.pathname = homeSectionPaths[id];
        address.hash = '';
      } else {
        if (homeSectionFromPath(address.pathname)) address.pathname = '/';
        address.hash = id;
      }
      window.history.replaceState(window.history.state, '', address);
    };

    scrollTweenRef.current?.kill();
    if (reduceMotion) {
      window.scrollTo({ top: destinationY });
      finishNavigation();
      return;
    }

    const distance = Math.abs(destinationY - window.scrollY);
    const duration = gsap.utils.clamp(0.62, 1.05, 0.56 + distance / 2600);

    scrollTweenRef.current = gsap.to(window, {
      scrollTo: { y: destinationY, autoKill: true },
      duration,
      ease: 'power3.inOut',
      overwrite: 'auto',
      onComplete: finishNavigation
    });
  }, []);

  const handleInternalLinkClick = useCallback((event) => {
    const link = event.target.closest?.('a[href]');
    if (
      !link ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) return;

    const href = link.getAttribute('href');
    if (!href || href === '#') return;
    const id = href.startsWith('#') ? decodeURIComponent(href.slice(1)) : homeSectionFromPath(href);
    if (!id || !document.getElementById(id)) return;
    event.preventDefault();
    scrollToSection(id);
  }, [scrollToSection]);

  useLayoutEffect(() => {
    const root = pageRef.current;
    if (!root) return undefined;

    const motion = gsap.matchMedia();
    motion.add('(prefers-reduced-motion: no-preference)', () => {
      const context = gsap.context(() => {
        const joinChannels = Array.from(root.querySelectorAll('.home-join-channel'));
        const joinRows = new Map();
        joinChannels.forEach(channel => {
          const row = channel.offsetTop;
          const order = joinRows.get(row) || 0;
          joinRows.set(row, order + 1);
          channel.dataset.entrance = 'pending';
          channel.style.setProperty('--join-entrance-delay', `${order * 550}ms`);
          ScrollTrigger.create({
            trigger: channel, start: 'top 88%', once: true,
            onEnter: () => { channel.dataset.entrance = 'visible'; },
          });
        });

        gsap.timeline({
          scrollTrigger: { trigger: '.home-trust-section', start: 'top 80%', once: true }
        })
          .fromTo(
            '#about-title',
            { opacity: 0.42, x: -22, clipPath: 'inset(0 100% 0 0)' },
            { opacity: 1, x: 0, clipPath: 'inset(0 0% 0 0)', duration: 0.58, ease: 'power4.out', clearProps: 'opacity,transform,clip-path' }
          )
          .fromTo(
            '.home-about-layout',
            { opacity: 0.4, y: 28 },
            { opacity: 1, y: 0, duration: 0.58, ease: 'power4.out', clearProps: 'opacity,transform' },
            '-=0.36'
          )
          .fromTo(
            '.home-about-block',
            { opacity: 0.38, y: 20 },
            { opacity: 1, y: 0, duration: 0.5, stagger: 0.07, ease: 'power4.out', clearProps: 'opacity,transform' },
            '-=0.42'
          );

        gsap.timeline({
          scrollTrigger: { trigger: '.home-how-section', start: 'top 82%', once: true }
        })
          .fromTo(
            '#directions-title',
            { opacity: 0.42, x: 22, clipPath: 'inset(0 0 0 100%)' },
            { opacity: 1, x: 0, clipPath: 'inset(0 0 0 0%)', duration: 0.58, ease: 'power4.out', clearProps: 'opacity,transform,clip-path' }
          )
          .fromTo(
            '.home-explore-bento',
            { opacity: 0.45 },
            { opacity: 1, duration: 0.56, ease: 'power4.out', clearProps: 'opacity' },
            '-=0.38'
          );

        gsap.timeline({
          scrollTrigger: { trigger: '.home-note', start: 'top 84%', once: true }
        })
          .fromTo(
            '.home-note > .home-flow-title',
            { opacity: 0.42, y: 22, clipPath: 'inset(0 0 100% 0)' },
            { opacity: 1, y: 0, clipPath: 'inset(0 0 0% 0)', duration: 0.58, ease: 'power4.out', clearProps: 'opacity,transform,clip-path' }
          )
          .fromTo(
            '.home-note > p',
            { opacity: 0.4, y: 18 },
            { opacity: 1, y: 0, duration: 0.5, ease: 'power4.out', clearProps: 'opacity,transform' },
            '-=0.36'
          );

        gsap.timeline({
          scrollTrigger: { trigger: '.home-footer', start: 'top 88%', once: true }
        })
          .fromTo(
            '.home-footer-brand',
            { opacity: 0.18, x: -28 },
            { opacity: 1, x: 0, duration: 0.8, ease: 'power3.out', clearProps: 'opacity,transform' }
          )
          .fromTo(
            '.home-footer-logo-loop',
            { opacity: 0.16, y: 26 },
            { opacity: 1, y: 0, duration: 0.72, stagger: 0.1, ease: 'power3.out', clearProps: 'opacity,transform' },
            '-=0.5'
          )
          .fromTo(
            '.home-footer-copyright',
            { opacity: 0.18, y: 16 },
            { opacity: 1, y: 0, duration: 0.65, ease: 'power3.out', clearProps: 'opacity,transform' },
            '-=0.34'
          );

        return () => joinChannels.forEach(channel => {
          delete channel.dataset.entrance;
          channel.style.removeProperty('--join-entrance-delay');
        });
      }, root);
      return () => context.revert();
    });

    ScrollTrigger.refresh();
    // Restore fragment targets after React mounts their corresponding sections.
    const restoreFragment = () => {
      const section = window.location.hash.slice(1) || homeSectionFromPath(window.location.pathname);
      const id = section === 'strategy' ? 'directions' : section;
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;
      const top = id === 'hero-title' || id === 'top' ? 0 : Math.max(0, target.getBoundingClientRect().top + window.scrollY - 88);
      window.scrollTo({ top, behavior: 'auto' });
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    };
    let fragmentFrame = requestAnimationFrame(() => {
      fragmentFrame = requestAnimationFrame(restoreFragment);
    });
    window.addEventListener('load', restoreFragment, { once: true });
    window.addEventListener('hashchange', restoreFragment);
    const cancelScroll = () => scrollTweenRef.current?.kill();
    const onScrollKey = event => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) cancelScroll();
    };
    window.addEventListener('wheel', cancelScroll, { passive: true });
    window.addEventListener('touchstart', cancelScroll, { passive: true });
    window.addEventListener('keydown', onScrollKey);
    return () => {
      scrollTweenRef.current?.kill();
      cancelAnimationFrame(fragmentFrame);
      window.removeEventListener('load', restoreFragment);
      window.removeEventListener('hashchange', restoreFragment);
      window.removeEventListener('wheel', cancelScroll);
      window.removeEventListener('touchstart', cancelScroll);
      window.removeEventListener('keydown', onScrollKey);
      motion.revert();
    };
  }, []);

  return (
    <div ref={pageRef} className="homepage" id="top" onClickCapture={handleInternalLinkClick}>
      <a className="skip-link" href="#introduction">{t("跳到主要内容")}</a>

      <SiteBackground />

      <SiteNavigation />

      <main className="hero" aria-labelledby="hero-title">
        <PerspectiveTunnelHero>
          <div className="hero-content">
            <h1 id="hero-title" className="hero-title" tabIndex="-1">
              <EchoText {...HERO_ECHO_PROPS} tint={null}>
                <ClubLogo horizontal className="hero-brand-logo" label={t('零一玩家｜01PLAYER')} />
              </EchoText>
            </h1>

            <div className="hero-lower">
              <p className="slogan-echo">
                <EchoText {...HERO_ECHO_PROPS} fontSize={locale === 'en' ? 'clamp(20px, 3.8vw, 36px)' : 'clamp(22px, 4.3vw, 43px)'} text={t(COMMUNITY_SLOGAN)} />
              </p>
              <p className="slogan-echo slogan-english" lang="en" hidden={locale === 'en'}>
                <EchoText {...HERO_ECHO_PROPS} fontSize="calc(clamp(13px, 2.1vw, 20px) * var(--slogan-english-scale, 1))" text={COMMUNITY_SLOGAN_EN} />
              </p>

              <div className="hero-meta-row">
                <SpecularButton className="hero-button hero-founded-button" href="#about">{t("成立于 · 2026.09.01")}</SpecularButton>
              </div>

              <div className="hero-proof">
                <p className="hero-proof-meta"><strong><MobileLineBreak after={/群[体體]/}>{t("一个以大学生为主要群体、面向全社会开放的「AI 共创社区」")}</MobileLineBreak></strong></p>
              </div>

              <div className="hero-actions">
                {HERO_ENTRIES.map(({ id, title, href }) => (
                  <div className="hero-entry" data-entry={id} key={id}>
                    <SpecularButton className="hero-button" href={href} ariaLabel={id === 'shadow' ? t(title) : undefined}>{id === 'shadow' ? <ShadowWordmark className="hero-shadow-mark" aria-hidden="true" /> : t(title)}</SpecularButton>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </PerspectiveTunnelHero>

        <HomeRegions>
          <section className="home-section home-trust-section" id="about" aria-labelledby="about-title">
            <h2 className="home-flow-title" id="about-title" tabIndex="-1">{t("关于我们")}</h2>

            <div className="home-about-layout">
              <BorderGlow {...borderGlowProps} className="home-trust-glow">
                <div className="home-trust-panel">
                  <ol className="home-trust-intro">
                    <li className="home-about-block">
                      <p className="home-about-lead"><strong>{t("这里是「零一玩家｜01PLAYER」！")}</strong></p>
                      <blockquote className="home-about-quote">
                        <p>{t("一个以大学生为主要群体、面向全社会开放的「AI 共创社区」！")}</p>
                        <p>{t("我们把现实生活看作一个开放的世界游戏：「地球Online：零一玩家」，每个人都是自己故事的主角！")}</p>
                        <p>{t("我们带着「玩家」的勇气与好奇心，在实践中不断探索与成长，完成自己的从零到一！")}</p>
                      </blockquote>
                    </li>

                    <li className="home-about-block">
                      <p className="home-about-lead"><strong>{t("「零一玩家」主要在做什么？")}</strong></p>
                      <blockquote className="home-about-quote">
                        {CORE_ENTRIES.map(({ id, title, description, href }, index) => (
                          <p key={id}>
                            {locale === 'en' ? `${index + 1}. ` : `${index + 1}、`}
                            <strong><a className="home-about-join-link" href={href}>{t('「{0}」', [title])}</a></strong>
                            {locale === 'en' ? ': ' : '：'}{t(description)}
                          </p>
                        ))}
                      </blockquote>
                    </li>

                    <li className="home-about-block">
                      <p className="home-about-lead"><strong><MobileLineBreak after={/2026\.9\.1/}>{t("「零一玩家」成立于 2026.9.1，我是社长，")}</MobileLineBreak><span className="home-about-signature"><a className="home-about-president" href={PRESIDENT ? linkWithSource(memberPageLink(PRESIDENT.id)) : undefined} aria-label={t("查看社长零一扬的头号玩家介绍")}><ResponsiveImage src={PRESIDENT?.photo} alt="" width="28" height="28" fit="cover" /><span>{t(PRESIDENT?.name || '零一扬')}</span></a>{locale === 'en' ? '.' : '！'}</span></strong></p>
                      <blockquote className="home-about-quote">
                        <p><strong>{t("不当牢玩家！不做NPC！")}<wbr />{t(COMMUNITY_SLOGAN)}</strong></p>
                      </blockquote>
                    </li>
                  </ol>
                </div>
              </BorderGlow>
              <nav className="home-about-people" aria-label={t("认识零一玩家")}>
                {ABOUT_PEOPLE_ENTRIES.map(entry => <ExploreEntry key={entry.id} entry={entry} borderGlowProps={borderGlowProps} />)}
              </nav>
            </div>
            <section className="home-core-section" id="work" aria-labelledby="work-title" tabIndex={-1}>
              <header className="home-section-heading">
                <h2 className="home-flow-title" id="work-title">{t("我们在做什么")}</h2>
                <p><MobileLineBreak after={/能[够夠]改[变變]世界的人/}>{t("那些疯狂到相信自己能够改变世界的人，正是改变世界的人！")}</MobileLineBreak></p>
              </header>
              <WorkShowcase borderGlowProps={borderGlowProps} />
            </section>
          </section>

          <ExploreSection id="directions" borderGlowProps={borderGlowProps} />

          <section className="home-section home-business-section" id="business" aria-labelledby="business-title" tabIndex="-1">
            <h2 className="home-flow-title" id="business-title">{t("零一商业")}</h2>
            <div className="home-business-intro">
              <p>{t("我们是「福州零一玩家智能科技有限公司」！")}</p>
            </div>
            <ViewportMount className="home-business-carousel" minHeight="var(--business-placeholder-height, 640px)">
              <Suspense fallback={<LoadingSlot />}>
              <FlexCarousel
                items={businesses}
                preset="liquid"
                intro="rise"
                cardHeight={0.5}
                gap={12}
                radius={20}
                squeeze={0.2}
                focusOnClick
                captions
                captionCredit={t("零一玩家")}
                captureWheel
              />
              </Suspense>
            </ViewportMount>
          </section>

          <ResearchSection id="research" />

          <section className="home-section home-cooperation-section home-partners-section" id="partners" aria-labelledby="partners-title" tabIndex="-1">
            <div className="home-partners-heading">
              <h2 className="home-flow-title" id="partners-title">{t("零一合作生态")}</h2>
              <p className="home-cooperation-intro">{t("创造力，就是把事物连接起来。")}</p>
            </div>
            <div className="home-partners-row">
              <ViewportMount className="home-partners-marquee"><LogoMarquee /></ViewportMount>
              <div className="home-cooperation-actions">
                <SpecularButton href={siteDestination('partners')} target="_blank" rel="noopener noreferrer" className="home-cooperation-link">{t("关于零一合作生态 ")}<span aria-hidden="true">↗</span>
                </SpecularButton>
              </div>
            </div>
          </section>

          <section className="home-section home-cooperation-section" id="cooperation" aria-labelledby="cooperation-title" tabIndex="-1">
            <h2 className="home-flow-title" id="cooperation-title">{t("零一高校分社")}</h2>
            <p className="home-cooperation-intro">{t("团结一切可以团结的力量！")}</p>
            <BranchAtlas borderGlowProps={borderGlowProps} />
          </section>

          <section className="home-note" id="join" aria-labelledby="join-title" tabIndex="-1">
            <h2 className="home-flow-title" id="join-title">{t("欢迎加入「零一玩家」")}</h2>
            <p className="home-join-slogan">
              {t("不当牢玩家！不做NPC！")}<wbr />{t(COMMUNITY_SLOGAN)}
            </p>
            <div className="home-join-channels">
              <figure className="home-join-channel">
                <button type="button" className="home-join-qr-button" aria-label={t("放大零一玩家 QQ 社区群二维码")} aria-haspopup="dialog"
                  onClick={event => openQr(event, JOIN_QR_ITEMS.qq)}>
                <BorderGlow {...borderGlowProps} borderRadius={16} className="home-join-qr-glow">
                  <div className="home-join-qr-media">
                    <ResponsiveImage
                      className={JOIN_QR_ITEMS.qq.image === joinQr ? "home-join-qr home-join-qr--inverse" : "home-join-qr"}
                      original src={JOIN_QR_ITEMS.qq.image}
                      alt={t("零一玩家 QQ 群二维码")}
                      width="640"
                      height="640"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                </BorderGlow>
                </button>
                <figcaption>{t("零一玩家 QQ 社区群")}</figcaption>
              </figure>
              <figure className="home-join-channel">
                <button type="button" className="home-join-qr-button" aria-label={t("放大零一玩家微信公众号二维码")} aria-haspopup="dialog"
                  onClick={event => openQr(event, JOIN_QR_ITEMS.official)}>
                <BorderGlow {...borderGlowProps} borderRadius={16} className="home-join-qr-glow">
                  <div className="home-join-qr-media">
                    <ResponsiveImage
                      className="home-join-qr"
                      original src={JOIN_QR_ITEMS.official.image}
                      alt={t("零一玩家微信公众号二维码")}
                      width="1280"
                      height="1280"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                </BorderGlow>
                </button>
                <figcaption>{t("「零一玩家」公众号")}</figcaption>
              </figure>
              <figure className="home-join-channel" id="join-contact">
                <button type="button" className="home-join-qr-button" aria-label={t("放大官方合作微信二维码")} aria-haspopup="dialog"
                  onClick={event => openQr(event, JOIN_QR_ITEMS.contact)}>
                <BorderGlow {...borderGlowProps} borderRadius={16} className="home-join-qr-glow">
                  <div className="home-join-qr-media">
                    <ResponsiveImage
                      className="home-join-qr"
                      original src={JOIN_QR_ITEMS.contact.image}
                      alt={t("官方合作联系零小一的微信二维码")}
                      width="1140"
                      height="1140"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                </BorderGlow>
                </button>
                <figcaption><span className="home-contact-full">{t("官方合作联系：零小一")}</span><span className="home-contact-mobile">{t("官方：零小一")}</span></figcaption>
              </figure>
            </div>
            {qrError && <p role="alert">{t(qrError)}</p>}

            <section className="home-recruitment" id="recruitment" aria-labelledby="recruitment-title" tabIndex="-1">
              <h3 className="home-recruitment-title" id="recruitment-title">
                <span className="home-recruitment-label">{t("零一团队招募：")}</span><strong>{t("充满热情的人，能够让世界变得更好。")}</strong>
              </h3>
              <ul className="home-recruitment-departments" role="list">
                {RECRUITMENT_DEPARTMENTS.map(({ name, mark }) => (
                  <BorderGlow key={name} as="li" {...borderGlowProps} borderRadius={16} className="home-recruitment-department">
                    <span className="home-recruitment-icon" aria-hidden="true">
                      <ExploreModuleIcon kind={mark} />
                    </span>
                    <span>{t(name)}</span>
                  </BorderGlow>
                ))}
              </ul>
              <SpecularButton href={siteDestination('recruitment')} target="_blank" rel="noopener noreferrer" className="home-recruitment-plan">
                {t("零一团队招募计划")}<span aria-hidden="true">↗</span>
              </SpecularButton>
            </section>
          </section>
        </HomeRegions>
      </main>
      {selectedQr && <ImageLightbox item={selectedQr.item} opener={selectedQr.opener} onClose={() => setSelectedQr(null)} />}

      <footer className="home-footer">
        <div className="home-footer-inner">
          <div className="home-footer-brand">
            <a href={siteDestination('wordmark')}>
              <ResponsiveImage className="home-footer-brand-logo" src="/images/club-logo-horizontal-white.svg" alt={t("零一玩家｜01PLAYER")} width={1602} height={560} />
            </a>
          </div>
          <ViewportMount className="home-footer-logo-loop" minHeight={64}>
          <LogoLoop
            logos={FOOTER_LOGOS}
            speed={90}
            direction="left"
            logoHeight={48}
            gap={40}
            hoverSpeed={0}
            scaleOnHover
            fadeOut
            ariaLabel={t("社区与社交平台")}
          />
          </ViewportMount>
        </div>

        <ShutterWordmark />
        <div className="home-footer-copyright">
          <span>{t("版权所有 © 2026 零一玩家")}</span>
          <span className="home-footer-credit">{t("官网设计与制作：")}<a className="home-about-president" href={PRESIDENT ? linkWithSource(memberPageLink(PRESIDENT.id)) : undefined} aria-label={t("查看官网设计与制作者零一扬的头号玩家介绍")}><ResponsiveImage src={PRESIDENT?.photo} alt="" width="28" height="28" fit="cover" /><span>{t(PRESIDENT?.name || '零一扬')}</span></a>
          </span>
          <a href={siteDestination('icp')} target="_blank" rel="noopener noreferrer">{t("ICP备案号：闽ICP备2026024313号-3")}</a>
          <a href={siteDestination('police')} target="_blank" rel="noopener noreferrer">{t("闽公网安备35011102351280号")}</a>
        </div>
      </footer>
    </div>
  );
}
