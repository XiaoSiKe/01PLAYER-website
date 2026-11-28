"use client";


/**
 * Cue Foundations · Phantom Infinite Gallery
 * ────────────────────────────────────────────
 * An infinite draggable/throwable image grid with cursor spotlight, 3D arc tilt, and a typewriter-caption focus mode on click.
 *
 * The full AI prompt used to design this lives at:
 *   lib/prompts/phantom-infinite-gallery.md
 *
 * Awwwards-tier premium version → https://cuedesign.space/component/cue129
 *
 * Original Cue ID: cue129
 * Category: Gallery & Images
 * ────────────────────────────────────────────
 */

import { useEffect, useRef } from "react";
import { PhotoPreviewHeader } from "../components/ImageLightbox";

/* ============================================================================
   PhantomGallery
   ----------------------------------------------------------------------------
   Draggable image grid on a dark stage. Cursor spotlight brightens
   the local area; everything else sits in shadow. Click any card to lift it
   out of its slot, enlarge it in the center, and type the
   title / year / description in a monospaced typewriter with a blinking
   caret. Cursor tilts the focused card in 3D. Click anywhere to send it
   back. Full drag + throw / inertia + press-hold zoom preserved.
   ============================================================================ */

// Zero One supplies the archive records. The viewport and animation below
// are from the supplied component.
type Item = { title: string; src: string; fullSrc: string; aspectRatio?: number; year: string; desc: string };
type Cell = { element: HTMLDivElement; thumb: HTMLImageElement; ratio: number };
type Placement = { left: number; top: number; height: number; imageHeight: number };

const CFG = {
  cellSize:              215.6,
  cellPadding:           10,
  gap:                   12,
  captionHeight:         18,
  arcAmount:             0.6,
  arcMaxAngleDeg:        28,
  arcAxis:               "horizontal" as "horizontal" | "vertical",
  edgeFade:              0.25,
  parallaxEnabled:       true,
  parallaxStrength:      0.04,
  parallaxEase:          0.12,
  inertiaEnabled:        true,
  throwFriction:         0.92,
  throwVelocityScale:    1,
  throwMinSpeed:         80,
  throwMaxSpeed:         2500,
  zoomValue:             0.7,
  PRESS_ZOOM_DELAY:      240,
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const validRatio = (ratio?: number): ratio is number => typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0;

function computePinnedOffset(prevSize: number, nextSize: number, pivot: {x:number;y:number}, prevOffset: {x:number;y:number}) {
  const worldX = (pivot.x - prevOffset.x) / prevSize;
  const worldY = (pivot.y - prevOffset.y) / prevSize;
  return { x: pivot.x - worldX * nextSize, y: pivot.y - worldY * nextSize };
}
const toRad = (d: number) => d * Math.PI / 180;

function calcArcTransform(opts: {
  cellCenterX: number; cellCenterY: number;
  viewportW: number; viewportH: number;
  arcAxis: "horizontal" | "vertical"; arcMaxAngleDeg: number; arcAmount: number;
}) {
  const { cellCenterX, cellCenterY, viewportW, viewportH, arcAxis, arcMaxAngleDeg, arcAmount } = opts;
  const maxAngle = toRad(arcMaxAngleDeg) * clamp(arcAmount, 0, 1);
  if (maxAngle === 0) return { z: 0, yawDeg: 0, pitchDeg: 0, edgeFactor: 0 };
  if (arcAxis === "horizontal") {
    const dx = (cellCenterX - viewportW / 2) / (viewportW / 2);
    const angle = dx * maxAngle;
    const radius = viewportW / (2 * Math.sin(Math.max(0.001, maxAngle)));
    const z = -radius * (Math.cos(angle) - 1);
    const yawDeg = -(angle * 180) / Math.PI;
    return { z, yawDeg, pitchDeg: 0, edgeFactor: Math.min(1, Math.abs(dx)) };
  } else {
    const dy = (cellCenterY - viewportH / 2) / (viewportH / 2);
    const angle = dy * maxAngle;
    const radius = viewportH / (2 * Math.sin(Math.max(0.001, maxAngle)));
    const z = -radius * (Math.cos(angle) - 1);
    const pitchDeg = angle * 180 / Math.PI;
    return { z, yawDeg: 0, pitchDeg, edgeFactor: Math.min(1, Math.abs(dy)) };
  }
}

export default function PhantomGallery({ items, tileScale = 1, bright = false }: { items: Item[]; tileScale?: number; bright?: boolean }) {
  const stageRef      = useRef<HTMLDivElement>(null);
  const gridRef       = useRef<HTMLDivElement>(null);
  const spotlightRef  = useRef<HTMLDivElement>(null);
  const focusCardRef  = useRef<HTMLDivElement>(null);
  const focusDimRef   = useRef<HTMLDivElement>(null);
  const focusImgRef   = useRef<HTMLImageElement>(null);
  const focusTitleRef = useRef<HTMLSpanElement>(null);
  const focusYearRef  = useRef<HTMLSpanElement>(null);
  const focusDescRef  = useRef<HTMLSpanElement>(null);
  const focusCaretRef = useRef<HTMLSpanElement>(null);
  const exitFocusRef  = useRef<(() => void) | null>(null);

  useEffect(() => {
    const stage = stageRef.current!;
    const grid = gridRef.current!;
    const header = stage.closest(".time-machine")?.querySelector(".staggered-menu-header");
    const photos = [...new Map(items.map(item => [item.fullSrc, item])).values()];
    const measureViewport = () => ({
      w: window.innerWidth,
      h: window.innerHeight,
      top: header?.getBoundingClientRect().bottom ?? 0,
    });
    let viewport = measureViewport();
    const baseSize = () => Math.min(CFG.cellSize, Math.max(1, (viewport.w - 24) * 0.4928)) * tileScale;
    const cellPadding = CFG.cellPadding * (bright ? Math.min(1, tileScale) : 1);

    /* ------- Motion state ------- */
    let offset          = { x: 0, y: 0 };
    let targetOffset    = { x: 0, y: 0 };
    let velocity        = { x: 0, y: 0 };
    let mouseOffset     = { x: 0, y: 0 };
    let targetMouseOff  = { x: 0, y: 0 };
    let currentCellSize = baseSize();
    let targetCellSize  = currentCellSize;
    let isPressing      = false;
    let isDragging      = false;
    let didZoom         = false;
    let pressedCell: HTMLDivElement | null = null;
    let pendingClickCell: HTMLDivElement | null = null;
    let inertiaActive   = false;
    let pressPos        = { x: 0, y: 0 };
    let startOffset     = { x: 0, y: 0 };
    let lastMove        = { x: 0, y: 0, t: performance.now() };
    let pressTimer: number | null = null;
    let lastTime = performance.now();
    let previousPaint = "";
    let rafId = 0;
    let ratioRevision = 0;

    const cells = photos.map(item => {
      const cell = document.createElement("div");
      cell.className = "pg-cell";
      cell.style.padding = cellPadding + "px";
      cell.dataset.src = item.fullSrc;
      cell.dataset.title = item.title;
      cell.dataset.year = item.year;
      cell.dataset.desc = item.desc;

      const thumb = document.createElement("img");
      thumb.className = "pg-thumb";
      thumb.alt = "";
      thumb.draggable = false;
      thumb.loading = "lazy";
      thumb.decoding = "async";
      thumb.style.marginBottom = CFG.gap + "px";
      const entry: Cell = { element: cell, thumb, ratio: validRatio(item.aspectRatio) ? item.aspectRatio : 1 };
      if (!validRatio(item.aspectRatio)) {
        thumb.addEventListener("load", () => {
          const ratio = thumb.naturalWidth / thumb.naturalHeight;
          if (validRatio(ratio) && ratio !== entry.ratio) {
            entry.ratio = ratio;
            ratioRevision++;
          }
        }, { once: true });
      }
      thumb.src = item.src;
      const meta = document.createElement("div");
      meta.className = "pg-meta";
      meta.style.lineHeight = CFG.captionHeight + "px";
      const title = document.createElement("span");
      title.textContent = item.title;
      const year = document.createElement("span");
      year.className = "pg-year";
      year.textContent = item.year;
      meta.append(title, year);
      cell.append(thumb, meta);
      return entry;
    });
    const cellsByElement = new Map(cells.map(cell => [cell.element, cell]));
    grid.replaceChildren(...cells.map(cell => cell.element));

    let cachedLayout: { key: string; placements: Placement[]; x: number; y: number; minX: number; minY: number } | null = null;
    function gridLayout(size: number) {
      const key = [size, viewport.w, viewport.h, viewport.top, ratioRevision].join(":");
      if (cachedLayout?.key === key) return cachedLayout;
      const width = Math.max(1, viewport.w - 24);
      const height = Math.max(1, viewport.h - viewport.top - 24);
      const columnGap = Math.min(CFG.gap, width * 0.014);
      const maxColumns = Math.floor((width + columnGap) / (baseSize() + columnGap));
      const columns = Math.max(1, Math.min(cells.length, maxColumns, Math.ceil(Math.sqrt(cells.length * width / height))));
      const bottoms = Array<number>(columns).fill(0);
      const placements = cells.map(cell => {
        const top = Math.min(...bottoms);
        const column = bottoms.indexOf(top);
        const imageHeight = Math.max(1, size - cellPadding * 2) / cell.ratio;
        const cellHeight = imageHeight + cellPadding * 2 + CFG.gap + CFG.captionHeight;
        bottoms[column] = top + cellHeight + CFG.gap;
        return { left: column * (size + columnGap), top, height: cellHeight, imageHeight };
      });
      const gridWidth = columns * size + (columns - 1) * columnGap;
      const gridHeight = Math.max(0, Math.max(...bottoms) - CFG.gap);
      cachedLayout = {
        key,
        placements,
        x: 12 + Math.max(0, (width - gridWidth) / 2),
        y: viewport.top + 12 + Math.max(0, (height - gridHeight) / 2),
        minX: Math.min(0, width - gridWidth),
        minY: Math.min(0, height - gridHeight),
      };
      return cachedLayout;
    }

    function boundPan(pan: { x: number; y: number }, layout = gridLayout(currentCellSize)) {
      return { x: clamp(pan.x, layout.minX, 0), y: clamp(pan.y, layout.minY, 0) };
    }

    function zoomAtCenter(size: number) {
      const from = gridLayout(currentCellSize);
      const to = gridLayout(size);
      const pivot = { x: viewport.w / 2, y: (viewport.top + viewport.h) / 2 };
      const pinned = computePinnedOffset(currentCellSize, size, pivot, { x: from.x + offset.x, y: from.y + offset.y });
      targetCellSize = size;
      targetOffset = boundPan({ x: pinned.x - to.x, y: pinned.y - to.y }, to);
    }

    function render(layout: ReturnType<typeof gridLayout>) {
      const { placements, x, y } = layout;
      cells.forEach(({ element: cell, thumb }, index) => {
        const placement = placements[index];
        const left = x + placement.left + offset.x + mouseOffset.x;
        const top = y + placement.top + offset.y + mouseOffset.y;
        const { z, yawDeg, pitchDeg, edgeFactor } = calcArcTransform({
          cellCenterX: left + currentCellSize / 2, cellCenterY: top + placement.height / 2,
          viewportW: viewport.w, viewportH: viewport.h, arcAxis: CFG.arcAxis,
          arcMaxAngleDeg: CFG.arcMaxAngleDeg, arcAmount: bright ? 0 : CFG.arcAmount,
        });
        const scale = 1 - CFG.edgeFade * edgeFactor * edgeFactor;
        cell.style.left = left + "px";
        cell.style.top = top + "px";
        cell.style.width = currentCellSize + "px";
        cell.style.height = placement.height + "px";
        thumb.style.height = placement.imageHeight + "px";
        cell.style.transform = `translate3d(0, 0, ${z}px) rotateY(${yawDeg}deg) rotateX(${pitchDeg}deg) scale(${scale})`;
        cell.style.opacity = String(1 - 0.4 * edgeFactor * CFG.arcAmount);
      });
    }

    /* ------- rAF loop ------- */
    function tick() {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      currentCellSize += (targetCellSize - currentCellSize) * 0.15;
      if (Math.abs(currentCellSize - targetCellSize) < 0.05) currentCellSize = targetCellSize;

      const layout = gridLayout(currentCellSize);
      if (inertiaActive) {
        const friction = Math.pow(CFG.throwFriction, dt * 60);
        velocity.x *= friction;
        velocity.y *= friction;
        const next = { x: offset.x + velocity.x * dt, y: offset.y + velocity.y * dt };
        offset = boundPan(next, layout);
        if (offset.x !== next.x) velocity.x = 0;
        if (offset.y !== next.y) velocity.y = 0;
        targetOffset = { ...offset };
        inertiaActive = Math.hypot(velocity.x, velocity.y) >= 1;
      } else if (!isDragging) {
        offset.x += (targetOffset.x - offset.x) * 0.15;
        offset.y += (targetOffset.y - offset.y) * 0.15;
        if (Math.abs(offset.x - targetOffset.x) < 0.1) offset.x = targetOffset.x;
        if (Math.abs(offset.y - targetOffset.y) < 0.1) offset.y = targetOffset.y;
        offset = boundPan(offset, layout);
      }
      const applyPa = CFG.parallaxEnabled;
      const paTx = applyPa ? targetMouseOff.x : 0;
      const paTy = applyPa ? targetMouseOff.y : 0;
      mouseOffset.x += (paTx - mouseOffset.x) * CFG.parallaxEase;
      mouseOffset.y += (paTy - mouseOffset.y) * CFG.parallaxEase;

      const paint = [offset.x, offset.y, currentCellSize, mouseOffset.x, mouseOffset.y, viewport.w, viewport.h, viewport.top, ratioRevision]
        .map(value => value.toFixed(2)).join(":");
      if (paint !== previousPaint) {
        render(layout);
        previousPaint = paint;
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);

    /* ------- Interaction: pointer + spotlight ------- */
    const spotlightEl = spotlightRef.current!;
    const cellAt = (target: EventTarget | null) => {
      const cell = target instanceof Element ? target.closest<HTMLDivElement>(".pg-cell") : null;
      return cell && grid.contains(cell) ? cell : null;
    };
    function updateSpotlight(x: number, y: number) {
      if (bright) return;
      spotlightEl.style.setProperty("--mx", x + "px");
      spotlightEl.style.setProperty("--my", y + "px");
    }
    updateSpotlight(window.innerWidth / 2, window.innerHeight / 2);

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || isPressing) return;
      inertiaActive = false;
      targetOffset = { ...offset };
      targetMouseOff = { ...mouseOffset };
      pressedCell = cellAt(e.target);
      pendingClickCell = null;
      stage.setPointerCapture(e.pointerId);
      isPressing = true;
      isDragging = false;
      didZoom = false;
      stage.classList.remove("dragging");
      lastMove = { x: e.clientX, y: e.clientY, t: performance.now() };
      velocity = { x: 0, y: 0 };
      pressPos = { x: e.clientX, y: e.clientY };
      startOffset = { ...offset };

      if (pressTimer) clearTimeout(pressTimer);
      pressTimer = window.setTimeout(() => {
        if (!isDragging && isPressing) {
          didZoom = true;
          zoomAtCenter(baseSize() * CFG.zoomValue);
        }
      }, CFG.PRESS_ZOOM_DELAY);
    };

    const onPointerMove = (e: PointerEvent) => {
      updateSpotlight(e.clientX, e.clientY);
      if (isPressing) {
        const now = performance.now();
        const dt = Math.max(0.001, (now - lastMove.t) / 1000);
        const dx = e.clientX - lastMove.x;
        const dy = e.clientY - lastMove.y;
        const vx = clamp(dx / dt * CFG.throwVelocityScale, -CFG.throwMaxSpeed, CFG.throwMaxSpeed);
        const vy = clamp(dy / dt * CFG.throwVelocityScale, -CFG.throwMaxSpeed, CFG.throwMaxSpeed);
        velocity.x = vx * 0.6 + velocity.x * 0.4;
        velocity.y = vy * 0.6 + velocity.y * 0.4;
        lastMove = { x: e.clientX, y: e.clientY, t: now };
      }
      if (!isPressing) {
        if (bright) return;
        if (cellAt(e.target)) targetMouseOff = { ...mouseOffset };
        else {
          targetMouseOff.x = (viewport.w / 2 - e.clientX) * CFG.parallaxStrength;
          targetMouseOff.y = (viewport.h / 2 - e.clientY) * CFG.parallaxStrength;
        }
        return;
      }
      const dx = e.clientX - pressPos.x;
      const dy = e.clientY - pressPos.y;
      const dragThreshold = e.pointerType === "touch" ? 12 : 8;
      if (!isDragging && Math.hypot(dx, dy) > dragThreshold) {
        isDragging = true;
        stage.classList.add("dragging");
        startOffset = { ...offset };
      }
      if (isDragging) {
        offset = boundPan({ x: startOffset.x + dx, y: startOffset.y + dy });
        targetOffset = { ...offset };
      }
    };

    const endPress = (e: PointerEvent) => {
      if (!isPressing) return;
      const wasDragging = isDragging;
      isPressing = false;
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      const speed = Math.hypot(velocity.x, velocity.y);
      inertiaActive = wasDragging && e.type === "pointerup" && CFG.inertiaEnabled && speed >= CFG.throwMinSpeed && currentCellSize === baseSize();
      isDragging = false;
      stage.classList.remove("dragging");

      targetMouseOff = { x: 0, y: 0 };
      zoomAtCenter(baseSize());

      pendingClickCell = !wasDragging && !didZoom && e.type === "pointerup"
        ? pressedCell ?? cellAt(document.elementFromPoint(e.clientX, e.clientY))
        : null;
      pressedCell = null;
    };

    /* ------- Focus mode + typewriter + 3D tilt ------- */
    const focusDim   = focusDimRef.current!;
    const focusCard  = focusCardRef.current!;
    const focusImg   = focusImgRef.current!;
    const focusTitle = focusTitleRef.current!;
    const focusYear  = focusYearRef.current!;
    const focusDesc  = focusDescRef.current!;
    const focusCaret = focusCaretRef.current!;
    let focusOn = false;
    let focusCell: HTMLDivElement | null = null;
    let focusRatio = 1;

    let typeTimer: number | null = null;
    let focusTimer: number | undefined;
    let closeTimer: number | undefined;
    let tiltFrame = 0;
    const stopTypewriter = () => {
      if (typeTimer) { clearTimeout(typeTimer); typeTimer = null; }
      focusCaret.hidden = true;
    };
    const typewriter = (snap: { title: string; year: string; desc: string }) => {
      stopTypewriter();
      focusTitle.textContent = "";
      focusYear.textContent  = "";
      focusDesc.textContent  = "";
      focusCaret.hidden = false;
      const parts = [
        { el: focusTitle, text: snap.title, speed: 60 },
        { el: focusYear,  text: snap.year,  speed: 45 },
        { el: focusDesc,  text: snap.desc,  speed: 22 },
      ];
      let pi = 0, ci = 0;
      const step = () => {
        if (pi >= parts.length) {
          typeTimer = window.setTimeout(() => { focusCaret.hidden = true; }, 400);
          return;
        }
        const p = parts[pi];
        if (ci < p.text.length) {
          p.el.textContent += p.text[ci++];
          typeTimer = window.setTimeout(step, p.speed + Math.random() * 20);
        } else {
          pi++; ci = 0;
          typeTimer = window.setTimeout(step, 180);
        }
      };
      step();
    };

    function previewGeometry(ratio: number) {
      const top = Math.min(Math.max(80, viewport.top), viewport.h * 0.28);
      const captionSpace = Math.min(110, viewport.h * 0.18) + 28;
      const height = Math.max(1, viewport.h - top - captionSpace);
      const width = Math.max(1, Math.min(600, viewport.w * 0.9, viewport.w - 32, height * ratio));
      return { width, height: width / ratio, centerY: top + height / 2 };
    }

    function fitFocusImage() {
      if (!focusOn) return;
      const ratio = focusImg.naturalWidth / focusImg.naturalHeight;
      if (validRatio(ratio)) focusRatio = ratio;
      const geometry = previewGeometry(focusRatio);
      focusCard.style.width = geometry.width + "px";
      focusCard.style.height = geometry.height + "px";
      focusCard.style.left = viewport.w / 2 + "px";
      focusCard.style.top = geometry.centerY + "px";
    }

    function openFocus(cell: HTMLDivElement) {
      clearTimeout(closeTimer);
      const original = cellsByElement.get(cell);
      const rect = (original?.thumb ?? cell).getBoundingClientRect();
      const cx = rect.left + rect.width  / 2;
      const cy = rect.top  + rect.height / 2;
      focusRatio = original?.ratio ?? 1;
      const { width: finalW, height: finalH, centerY } = previewGeometry(focusRatio);
      const initScale = rect.width / finalW;

      const snap = {
        src:   cell.dataset.src   || "",
        title: cell.dataset.title || "",
        year:  cell.dataset.year  || "",
        desc:  cell.dataset.desc  || "",
      };
      focusImg.src = snap.src;
      focusImg.alt = snap.title;
      focusTitle.textContent = "";
      focusYear.textContent  = "";
      focusDesc.textContent  = "";

      focusCard.style.width  = finalW + "px";
      focusCard.style.height = finalH + "px";
      focusCard.style.transition = "none";
      focusCard.style.left = cx + "px";
      focusCard.style.top  = cy + "px";
      focusCard.style.transform = `translate(-50%, -50%) scale(${initScale})`;
      focusCard.style.opacity = "0";
      /* force reflow */
      void focusCard.offsetHeight;
      focusCard.style.transition =
        "left 0.55s cubic-bezier(0.22, 1, 0.36, 1), " +
        "top 0.55s cubic-bezier(0.22, 1, 0.36, 1), " +
        "transform 0.6s cubic-bezier(0.34, 1.25, 0.64, 1), " +
        "opacity 0.3s ease";
      focusCard.style.opacity = "1";
      focusCard.style.left = viewport.w / 2 + "px";
      focusCard.style.top  = centerY + "px";
      focusCard.style.transform = "translate(-50%, -50%) scale(1)";

      focusDim.classList.add("on");
      focusCard.classList.add("on");
      document.body.classList.add("pg-focused");
      focusOn = true;
      focusCell = cell;
      focusCard.focus({ preventScroll: true });

      focusTimer = window.setTimeout(() => {
        if (!focusOn) return;
        typewriter(snap);
      }, 550);
    }
    function closeFocus() {
      if (!focusOn) return;
      stopTypewriter();
      clearTimeout(focusTimer);
      cancelAnimationFrame(tiltFrame);
      const finalW = parseFloat(focusCard.style.width);
      let toLeft: number, toTop: number, toScale: number;
      if (focusCell && document.body.contains(focusCell)) {
        const rect = (cellsByElement.get(focusCell)?.thumb ?? focusCell).getBoundingClientRect();
        toLeft  = rect.left + rect.width  / 2;
        toTop   = rect.top  + rect.height / 2;
        toScale = rect.width / finalW;
      } else {
        toLeft  = window.innerWidth  / 2;
        toTop   = window.innerHeight / 2;
        toScale = 0.3;
      }
      focusCard.style.left = toLeft + "px";
      focusCard.style.top  = toTop  + "px";
      focusCard.style.transform = `translate(-50%, -50%) scale(${toScale})`;
      focusCard.style.opacity = "0";
      focusDim.classList.remove("on");
      document.body.classList.remove("pg-focused");
      closeTimer = window.setTimeout(() => focusCard.classList.remove("on"), 450);
      stage.focus({ preventScroll: true });
      focusOn = false;
      focusCell = null;
    }
    function handleClick() {
      const cell = pendingClickCell;
      pendingClickCell = null;
      if (cell) openFocus(cell);
    }
    exitFocusRef.current = closeFocus;

    /* 3D tilt on focus card */
    let tiltRX = 0, tiltRY = 0, tiltTX = 0, tiltTY = 0;
    function tiltTick() {
      if (!focusOn || bright) return;
      tiltRX += (tiltTX - tiltRX) * 0.14;
      tiltRY += (tiltTY - tiltRY) * 0.14;
      focusCard.style.transform =
        `translate(-50%, -50%) rotateX(${tiltRX}deg) rotateY(${tiltRY}deg) scale(1)`;
      tiltFrame = requestAnimationFrame(tiltTick);
    }
    const onTiltMove = (e: MouseEvent) => {
      if (!focusOn || bright) return;
      const rect = focusCard.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top  + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width  / 2);
      const dy = (e.clientY - cy) / (rect.height / 2);
      const cl = (v: number) => Math.max(-1.4, Math.min(1.4, v));
      tiltTY =  cl(dx) * 10;
      tiltTX = -cl(dy) * 10;
    };
    window.addEventListener("mousemove", onTiltMove);

    stage.addEventListener("pointerdown",   onPointerDown as any);
    stage.addEventListener("pointermove",   onPointerMove as any);
    stage.addEventListener("pointerup",     endPress      as any);
    stage.addEventListener("pointercancel", endPress      as any);
    stage.addEventListener("click", handleClick);
    const onPointerLeave = () => { targetMouseOff = { x: 0, y: 0 }; };
    const onKeyDown = (event: KeyboardEvent) => {
      if (focusOn && (event.key === "Escape" || event.target === focusCard && ["Enter", " "].includes(event.key))) {
        event.preventDefault();
        closeFocus();
      }
    };
    stage.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("keydown", onKeyDown);
    focusImg.addEventListener("click", closeFocus);
    focusImg.addEventListener("load", fitFocusImage);
    focusDim.addEventListener("click",  closeFocus);

    const onResize = () => {
      const zoom = targetCellSize / baseSize();
      viewport = measureViewport();
      targetCellSize = baseSize() * zoom;
      targetOffset = boundPan(targetOffset, gridLayout(targetCellSize));
      fitFocusImage();
    };
    const headerObserver = new ResizeObserver(onResize);
    if (header) headerObserver.observe(header);
    window.addEventListener("resize", onResize);

    /* When focus opens, kick the tilt loop */
    const focusObserver = new MutationObserver(() => {
      if (focusCard.classList.contains("on") && focusOn && !bright) {
        tiltRX = tiltRY = tiltTX = tiltTY = 0;
        tiltFrame = requestAnimationFrame(tiltTick);
      }
    });
    focusObserver.observe(focusCard, { attributes: true, attributeFilter: ["class"] });

    return () => {
      cancelAnimationFrame(rafId);
      cancelAnimationFrame(tiltFrame);
      clearTimeout(pressTimer ?? undefined);
      clearTimeout(focusTimer);
      clearTimeout(closeTimer);
      stage.classList.remove("dragging");
      document.body.classList.remove("pg-focused");
      exitFocusRef.current = null;
      focusCard.classList.remove("on");
      focusDim.classList.remove("on");
      focusCard.removeAttribute("style");
      focusImg.removeEventListener("click", closeFocus);
      focusImg.removeEventListener("load", fitFocusImage);
      window.removeEventListener("keydown", onKeyDown);
      focusDim.removeEventListener("click", closeFocus);
      stage.removeEventListener("pointerleave", onPointerLeave);
      stopTypewriter();
      focusObserver.disconnect();
      stage.removeEventListener("pointerdown",   onPointerDown as any);
      stage.removeEventListener("pointermove",   onPointerMove as any);
      stage.removeEventListener("pointerup",     endPress      as any);
      stage.removeEventListener("pointercancel", endPress      as any);
      stage.removeEventListener("click", handleClick);
      window.removeEventListener("mousemove", onTiltMove);
      window.removeEventListener("resize", onResize);
      headerObserver.disconnect();
      grid.replaceChildren();
    };
  }, [items, tileScale, bright]);

  return (
    <>
      <div id="pg-stage" ref={stageRef} data-presentation={bright ? 'bright' : 'spotlight'} role="region" aria-label="零一影像画廊" tabIndex={-1}>
        <div id="pg-grid" ref={gridRef}></div>
      </div>
      <div id="pg-dim"></div>
      <div id="pg-spotlight" ref={spotlightRef}></div>
      <div id="pg-vignette"></div>

      <div id="pg-focus-dim" ref={focusDimRef}></div>
      <div className="pg-focus-controls"><PhotoPreviewHeader onClose={() => exitFocusRef.current?.()} /></div>
      <div id="pg-focus-card" ref={focusCardRef} tabIndex={-1}>
        <img id="pg-focus-img" ref={focusImgRef} alt="" />
        <div className="pg-cap">
          <div className="pg-cap-head">
            <span ref={focusTitleRef}></span>
            <span ref={focusYearRef}></span>
          </div>
          <div className="pg-cap-desc">
            <span ref={focusDescRef}></span>
            <span ref={focusCaretRef} className="pg-caret" hidden></span>
          </div>
        </div>
      </div>

      <style>{`
        #pg-stage {
          position: fixed; inset: 0; z-index: 1;
          background: #000; overflow: hidden;
          touch-action: none; cursor: grab; user-select: none;
          perspective: 1000px; transform-style: preserve-3d;
        }
        #pg-stage.dragging { cursor: grabbing; }
        #pg-grid { position: absolute; width: 100%; height: 100%; transform-style: preserve-3d; }
        .pg-cell {
          position: absolute;
          background-color: rgba(0, 0, 0, 0.1);
          cursor: pointer;
          transition: background-color 120ms ease;
          display: flex; flex-direction: column;
          box-sizing: border-box;
          transform-style: preserve-3d;
          will-change: transform, opacity;
        }
        #pg-stage:not([data-presentation='bright']):not(.dragging) .pg-cell:hover { background-color: #fff; }
        #pg-stage:not([data-presentation='bright']):not(.dragging) .pg-cell:hover .pg-meta { color: #252525; }
        #pg-stage[data-presentation='bright'] { perspective: none; }
        #pg-stage[data-presentation='bright'] .pg-meta { color: #d0d0d0; }
        #pg-stage[data-presentation='bright'] ~ #pg-dim,
        #pg-stage[data-presentation='bright'] ~ #pg-spotlight,
        #pg-stage[data-presentation='bright'] ~ #pg-vignette { display: none; }
        .pg-thumb {
          flex: none;
          display: block;
          width: 100%;
          object-fit: contain;
          border-radius: 4px;
        }
        .pg-meta {
          display: flex; justify-content: space-between; align-items: center;
          color: #808080;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12px;
        }
        .pg-meta span:first-child {
          min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          font-weight: 700; text-transform: uppercase;
        }
        .pg-year { flex-shrink: 0; }
        .pg-year:not(:empty) { margin-left: 6px; }
        #pg-stage:focus, #pg-focus-card:focus { outline: none; }

        #pg-dim {
          position: fixed; inset: 0; pointer-events: none; z-index: 8;
          background: rgba(0, 0, 0, 0.38);
        }
        #pg-spotlight {
          position: fixed; inset: 0; pointer-events: none; z-index: 9;
          background: radial-gradient(
            circle 420px at var(--mx, 50%) var(--my, 50%),
            rgba(255, 255, 255, var(--pg-light-core, 0.76)) 0%,
            rgba(255, 255, 255, var(--pg-light-mid, 0.50)) 25%,
            rgba(255, 255, 255, var(--pg-light-edge, 0.18)) 50%,
            rgba(0, 0, 0, 0)           65%,
            rgba(0, 0, 0, 0.30)        100%
          );
          mix-blend-mode: overlay;
          transition: background 0.05s linear;
        }
        @media (hover: hover) {
          #pg-stage:not(.dragging):has(.pg-cell:hover) ~ #pg-spotlight {
            --pg-light-core: 0.98;
            --pg-light-mid: 0.78;
            --pg-light-edge: 0.32;
          }
        }
        #pg-vignette {
          position: fixed; inset: 0; pointer-events: none; z-index: 10;
          background: radial-gradient(ellipse at center,
            transparent 30%,
            rgba(0,0,0,0.2) 60%,
            rgba(0,0,0,0.8) 90%,
            rgba(0,0,0,1) 100%);
        }

        #pg-focus-dim {
          position: fixed; inset: 0; pointer-events: none; z-index: 11;
          background: rgba(0, 0, 0, 0.72);
          opacity: 0;
          transition: opacity 0.45s cubic-bezier(0.22, 1, 0.36, 1);
        }
        #pg-focus-dim.on { opacity: 1; pointer-events: auto; cursor: pointer; }

        #pg-focus-card {
          position: fixed; z-index: 12;
          opacity: 0; pointer-events: none;
          transform-style: preserve-3d;
        }
        #pg-focus-card.on { pointer-events: auto; cursor: pointer; }
        #pg-focus-card img {
          width: 100%; height: 100%;
          object-fit: contain;
          display: block;
          border-radius: 8px;
          transform: translateZ(0);
        }
        .pg-cap {
          position: absolute;
          inset: calc(100% + 12px) 0 auto;
          max-height: min(110px, 18vh);
          overflow: auto;
          display: flex; flex-direction: column; gap: 6px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          color: rgba(255, 255, 255, 0.95);
          font-size: clamp(16px, 2.5vw, 19px);
          font-weight: 400;
          letter-spacing: 0.02em;
          text-shadow: 0 2px 12px rgba(0, 0, 0, 0.75);
        }
        .pg-cap-head {
          display: flex; justify-content: space-between; align-items: baseline; gap: 10px;
          font-weight: 400;
          line-height: 1.35;
          text-transform: uppercase;
        }
        .pg-cap-head > span:first-child { min-width: 0; overflow-wrap: anywhere; }
        .pg-cap-head > span:last-child { flex-shrink: 0; }
        .pg-cap-desc {
          font-size: clamp(14px, 2vw, 16px);
          line-height: 1.55;
          color: rgba(255, 255, 255, 0.78);
          font-weight: 400;
        }
        .pg-caret {
          display: inline-block;
          width: 6px; height: 12px;
          background: rgba(255, 255, 255, 0.85);
          vertical-align: middle;
          margin-left: 2px;
          animation: pg-caret-blink 0.8s steps(1) infinite;
        }
        @keyframes pg-caret-blink { 50% { opacity: 0; } }

        body.pg-focused #pg-spotlight { opacity: 0; transition: opacity 0.4s ease; }
        body.pg-focused #pg-dim       { background: rgba(0, 0, 0, 0.72); transition: background 0.45s ease; }
        body.pg-focused              { perspective: 1400px; }

        @media (prefers-reduced-motion: reduce) {
          .pg-cell { transition: none !important; }
        }
      `}</style>
    </>
  );
}
