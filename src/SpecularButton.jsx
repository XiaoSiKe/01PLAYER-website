import { useRef, useEffect, useImperativeHandle, useState } from 'react';
import { useTheme } from './ThemeControl';
import './SpecularButton.css';

const PAD = 20;

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uCenter;
uniform vec2 uHalfSize;
uniform float uRadius;
uniform float uAngle;
uniform float uPx;
uniform vec3 uLineColor;
uniform vec3 uBaseColor;
uniform float uIntensity;
uniform float uShineSize;
uniform float uShineFade;
uniform float uThickness;
uniform float uBaseWidth;

out vec4 fragColor;

float sdRoundedRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float shapeSDF(vec2 p) { return sdRoundedRect(p, uHalfSize, uRadius); }

float gaussianLine(float d, float sigma) {
  float x = d / (sigma + 1e-6);
  float k = mix(1.0, 1.6, smoothstep(0.0, 1.5, x));
  return exp(-k * x * x);
}

void main() {
  vec2 p = gl_FragCoord.xy - uCenter;
  float d = shapeSDF(p);
  vec2 L = vec2(cos(uAngle), sin(uAngle));

  float base = (1.0 - smoothstep(0.0, uBaseWidth, abs(d))) * 0.45;
  vec2 nEll = normalize(p / (uHalfSize * uHalfSize) + 1e-6);
  float phi = acos(clamp(abs(dot(nEll, L)), 0.0, 1.0));
  float rim = 1.0 - smoothstep(uShineSize - uShineFade, uShineSize + uShineFade + 1e-4, phi);
  float line = gaussianLine(d, uThickness);
  float edgeClamp = 1.0 - smoothstep(0.5 * uPx, 3.0 * uPx, abs(d));
  float hi = line * rim * edgeClamp * uIntensity;
  vec3 col = uBaseColor * base + uLineColor * hi;
  float a = clamp(base + hi, 0.0, 1.0);
  fragColor = vec4(col, a);
}
`;

const SpecularButton = (buttonProps) => {
  const { theme } = useTheme();
  const light = theme === 'light';
  const {
    children = 'Get Started',
    as,
    size = 'lg',
    radius = 18,
    tint = '#ffffff',
    tintOpacity = 0,
    blur = 0,
    textColor = light ? '#202024' : '#f5f5f5',
    lineColor = light ? '#000000' : '#ffffff',
    baseColor = light ? '#8e8e93' : '#525252',
    intensity = light ? 2.625 : 1.875,
    shineSize = 10,
    shineFade = 40,
    thickness = 1,
    speed = 0.35,
    followMouse = true,
    proximity = 250,
    autoAnimate = false,
    staticShine = false,
    shineOnInteraction = false,
    disabled = false,
    onClick,
    href,
    target,
    rel,
    ariaLabel,
    ref,
    className = '',
    type = 'button',
    ...elementProps
  } = buttonProps;
  const btnRef = useRef(null);
  const fxRef = useRef(null);
  const propsRef = useRef({});
  const requestRenderRef = useRef(null);
  const entryPointerRef = useRef(null);
  const [rendererApi, setRendererApi] = useState(null);
  const deferMenuShine = elementProps['aria-haspopup'] === 'menu';
  propsRef.current = {
    radius,
    lineColor,
    baseColor,
    intensity,
    shineSize,
    shineFade,
    thickness,
    speed,
    followMouse,
    proximity,
    autoAnimate
  };

  useEffect(() => {
    if (staticShine || typeof IntersectionObserver === 'undefined') return;
    const btn = btnRef.current;
    const rendererPreference = window.matchMedia('(any-pointer: fine) and (prefers-reduced-motion: no-preference)');
    let nearby = false;
    let active = true;
    let hovered = false;
    let focused = btn.contains(document.activeElement);
    let releaseTimer;
    let activationTimer;
    const canRender = () => active && nearby && !document.hidden && rendererPreference.matches;
    const interacting = () => !shineOnInteraction || hovered || focused;
    const canActivate = () => interacting() && !(deferMenuShine && btn.getAttribute('aria-expanded') === 'true');
    const activate = () => {
      if (!canRender()) {
        setRendererApi(null);
        return;
      }
      if (!canActivate()) return;
      import('./specular-renderer.js').then(api => {
        if (canRender() && canActivate()) setRendererApi(api);
      }).catch(() => { /* The static rim and the button already work. */ });
    };
    const update = () => {
      window.clearTimeout(activationTimer);
      // An immediate click should open the menu before creating a WebGL context for its rim.
      if (deferMenuShine && canRender() && canActivate()) activationTimer = window.setTimeout(activate, 150);
      else activate();
    };
    const renew = () => {
      window.clearTimeout(releaseTimer);
      update();
    };
    const release = () => {
      if (interacting()) return;
      window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(() => setRendererApi(null), 500);
    };
    const enter = event => {
      if (event.pointerType === 'touch' || btn.matches(':disabled, [aria-disabled="true"]')) return;
      hovered = true;
      entryPointerRef.current = event;
      renew();
    };
    const leave = () => {
      hovered = false;
      entryPointerRef.current = null;
      release();
    };
    const focusIn = () => { focused = true; renew(); };
    const focusOut = event => {
      if (btn.contains(event.relatedTarget)) return;
      focused = false;
      release();
    };
    // Release offscreen contexts instead of accumulating one for every visited
    // button. The margin prepares the original rim before it enters the screen.
    const observer = new IntersectionObserver(([entry]) => {
      nearby = entry.isIntersecting;
      update();
    }, { rootMargin: '200px' });
    observer.observe(btn);
    if (shineOnInteraction) {
      btn.addEventListener('pointerenter', enter);
      btn.addEventListener('pointerleave', leave);
      btn.addEventListener('focusin', focusIn);
      btn.addEventListener('focusout', focusOut);
    }
    document.addEventListener('visibilitychange', update);
    rendererPreference.addEventListener('change', update);
    return () => {
      active = false;
      window.clearTimeout(releaseTimer);
      window.clearTimeout(activationTimer);
      entryPointerRef.current = null;
      btn.removeEventListener('pointerenter', enter);
      btn.removeEventListener('pointerleave', leave);
      btn.removeEventListener('focusin', focusIn);
      btn.removeEventListener('focusout', focusOut);
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
      rendererPreference.removeEventListener('change', update);
    };
  }, [staticShine, shineOnInteraction, deferMenuShine]);

  useEffect(() => {
    const btn = btnRef.current;
    const fx = fxRef.current;
    if (!btn || !fx || !rendererApi || staticShine) return;
    const { Renderer, Program, Mesh, Triangle, Color } = rendererApi;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let renderer;
    try {
      renderer = new Renderer({ alpha: true, premultipliedAlpha: true, antialias: true, dpr });
      if (!renderer.gl || !renderer.isWebgl2) throw new Error('WebGL 2 is unavailable');
    } catch {
      renderer?.gl?.getExtension('WEBGL_lose_context')?.loseContext();
      btn.dataset.staticShine = 'true';
      return;
    }
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const geometry = new Triangle(gl);
    if (geometry.attributes.uv) delete geometry.attributes.uv;
    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uCenter: { value: [0, 0] },
        uHalfSize: { value: [1, 1] },
        uRadius: { value: 0 },
        uAngle: { value: 2.4 },
        uPx: { value: dpr },
        uLineColor: { value: [1, 1, 1] },
        uBaseColor: { value: [0.32, 0.32, 0.32] },
        uIntensity: { value: 1 },
        uShineSize: { value: 0.17 },
        uShineFade: { value: 0.7 },
        uThickness: { value: 1 },
        uBaseWidth: { value: dpr }
      }
    });

    const mesh = new Mesh(gl, { geometry, program });
    fx.appendChild(gl.canvas);
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sizeRef = { w: 1, h: 1 };
    let reduceMotion = motionPreference.matches;
    let inView = typeof IntersectionObserver === 'undefined';
    let pointerAngle = null;
    let proximityT = 0;
    let focused = btn.contains(document.activeElement);
    let angle = 2.4;
    let idleAngle = 2.4;
    let brightness = 0;
    let last = performance.now();
    let frame = 0;
    let pointerFrame = 0;
    let queuedPointer = null;
    const line = new Color();
    const base = new Color();

    // A settled, offscreen, or background button does not need an animation loop.
    const requestRender = () => {
      if (frame || !inView || document.hidden) return;
      last = performance.now();
      frame = requestAnimationFrame(update);
    };
    requestRenderRef.current = requestRender;

    function update(now) {
      frame = 0;
      if (!inView || document.hidden) return;
      const deltaTime = Math.min((now - last) / 1000, 0.05);
      last = now;
      const props = propsRef.current;
      const followsPointer = props.followMouse && pointerAngle != null && proximityT > 0;
      const rotates = props.autoAnimate && !followsPointer && !reduceMotion;
      if (rotates) idleAngle += props.speed * deltaTime;
      const target = reduceMotion ? 2.4 : followsPointer ? pointerAngle : props.autoAnimate ? idleAngle : angle;
      const difference = Math.atan2(Math.sin(target - angle), Math.cos(target - angle));
      angle = reduceMotion ? target : angle + difference * (1 - Math.exp(-deltaTime * 7));
      const brightnessTarget = props.autoAnimate || focused ? 1 : proximityT;
      const brightnessDifference = brightnessTarget - brightness;
      brightness = reduceMotion || Math.abs(brightnessDifference) < 0.001
        ? brightnessTarget
        : brightness + brightnessDifference * (1 - Math.exp(-deltaTime * 8));
      line.set(props.lineColor);
      base.set(props.baseColor);
      program.uniforms.uAngle.value = angle;
      program.uniforms.uRadius.value = Math.min(props.radius, Math.min(sizeRef.w, sizeRef.h) / 2) * dpr;
      program.uniforms.uLineColor.value = [line.r, line.g, line.b];
      program.uniforms.uBaseColor.value = [base.r, base.g, base.b];
      program.uniforms.uIntensity.value = props.intensity * brightness;
      program.uniforms.uShineSize.value = (props.shineSize * Math.PI) / 180;
      program.uniforms.uShineFade.value = (props.shineFade * Math.PI) / 180;
      program.uniforms.uThickness.value = props.thickness * dpr;
      renderer.render({ scene: mesh });
      if (!reduceMotion && (rotates || (brightness > 0 && Math.abs(difference) > 0.001) || Math.abs(brightnessDifference) > 0.001)) {
        frame = requestAnimationFrame(update);
      }
    }

    const resize = () => {
      // Layout dimensions stay stable while the press transform is active.
      const w = Math.max(btn.offsetWidth, 1);
      const h = Math.max(btn.offsetHeight, 1);
      sizeRef.w = w;
      sizeRef.h = h;
      renderer.setSize(w + PAD * 2, h + PAD * 2);
      program.uniforms.uCenter.value = [(PAD + w / 2) * dpr, (PAD + h / 2) * dpr];
      program.uniforms.uHalfSize.value = [(w / 2) * dpr, (h / 2) * dpr];
      requestRender();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(btn);
    resize();

    const updatePointer = () => {
      pointerFrame = 0;
      const event = queuedPointer;
      queuedPointer = null;
      if (!event || !inView || document.hidden || !propsRef.current.followMouse || btn.matches(':disabled, [aria-disabled="true"]')) return;
      const rect = btn.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const deltaX = Math.max(rect.left - event.clientX, 0, event.clientX - rect.right);
      const deltaY = Math.max(rect.top - event.clientY, 0, event.clientY - rect.bottom);
      const distance = Math.hypot(deltaX, deltaY);
      const previousProximity = proximityT;
      const proximityValue = Math.max(0, 1 - distance / Math.max(propsRef.current.proximity, 1));
      proximityT = proximityValue * proximityValue * (3 - 2 * proximityValue);
      if (proximityT === 0 && previousProximity === 0) return;

      if (distance === 0) {
        const normalizedX = (event.clientX - centerX) / Math.max(rect.width / 2, 1);
        const normalizedY = (centerY - event.clientY) / Math.max(rect.height / 2, 1);
        pointerAngle = Math.atan2(2 / rect.height, -2 / rect.width) + normalizedX * 0.3 + normalizedY * 0.15;
      } else {
        pointerAngle = Math.atan2(centerY - event.clientY, event.clientX - centerX);
      }
      requestRender();
    };
    const onPointerMove = event => {
      if (!inView || document.hidden || event.pointerType === 'touch' || !propsRef.current.followMouse) return;
      if (shineOnInteraction && (!(event.target instanceof Node) || !btn.contains(event.target))) return;
      queuedPointer = event;
      if (!pointerFrame) pointerFrame = requestAnimationFrame(updatePointer);
    };
    const cancelPointerUpdate = () => {
      cancelAnimationFrame(pointerFrame);
      pointerFrame = 0;
      queuedPointer = null;
    };
    const clearPointer = () => {
      cancelPointerUpdate();
      if (proximityT === 0) return;
      pointerAngle = null;
      proximityT = 0;
      requestRender();
    };
    const onFocus = () => { focused = true; requestRender(); };
    const onBlur = event => {
      if (btn.contains(event.relatedTarget)) return;
      focused = false;
      requestRender();
    };
    const onMotionChange = event => {
      reduceMotion = event.matches;
      requestRender();
    };
    const onVisibilityChange = () => {
      cancelAnimationFrame(frame);
      cancelPointerUpdate();
      frame = 0;
      pointerAngle = null;
      proximityT = 0;
      requestRender();
    };
    const observer = 'IntersectionObserver' in window ? new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      if (!inView) {
        cancelAnimationFrame(frame);
        cancelPointerUpdate();
        frame = 0;
        pointerAngle = null;
        proximityT = 0;
        brightness = focused || propsRef.current.autoAnimate ? 1 : 0;
      } else {
        if (entryPointerRef.current) onPointerMove(entryPointerRef.current);
        requestRender();
      }
    }) : null;
    observer?.observe(btn);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('scroll', clearPointer, { passive: true });
    window.addEventListener('blur', clearPointer);
    document.documentElement.addEventListener('pointerleave', clearPointer);
    document.addEventListener('visibilitychange', onVisibilityChange);
    motionPreference.addEventListener('change', onMotionChange);
    btn.addEventListener('focusin', onFocus);
    btn.addEventListener('focusout', onBlur);
    if (shineOnInteraction) btn.addEventListener('pointerleave', clearPointer);
    requestRender();

    return () => {
      requestRenderRef.current = null;
      cancelAnimationFrame(frame);
      cancelPointerUpdate();
      ro.disconnect();
      observer?.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('scroll', clearPointer);
      window.removeEventListener('blur', clearPointer);
      document.documentElement.removeEventListener('pointerleave', clearPointer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      motionPreference.removeEventListener('change', onMotionChange);
      btn.removeEventListener('focusin', onFocus);
      btn.removeEventListener('focusout', onBlur);
      btn.removeEventListener('pointerleave', clearPointer);
      if (gl.canvas.parentNode === fx) fx.removeChild(gl.canvas);
      geometry.remove();
      program.remove();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [rendererApi, staticShine, shineOnInteraction]);

  useEffect(() => {
    requestRenderRef.current?.();
  }, [radius, lineColor, baseColor, intensity, shineSize, shineFade, thickness, speed, followMouse, proximity, autoAnimate]);

  // An unavailable link must not navigate through pointer, keyboard or a context menu.
  const link = Boolean(href) && !disabled;
  const Element = as || (link ? 'a' : 'button');
  useImperativeHandle(ref, () => btnRef.current, [Element]);

  return (
    <Element
      {...elementProps}
      ref={btnRef}
      {...(link ? { href, target, rel } : Element === 'button' ? { type: href ? 'button' : type, disabled } : {})}
      aria-label={ariaLabel ?? elementProps['aria-label']}
      data-static-shine={staticShine || !rendererApi || undefined}
      onClick={onClick}
      className={`specular-button specular-button--${size}${className ? ` ${className}` : ''}`}
      style={{
        '--sb-radius': `${radius}px`,
        '--sb-tint': tint,
        '--sb-tint-opacity': tintOpacity,
        '--sb-blur': `${blur}px`,
        '--sb-text-color': textColor,
        '--sb-line-color': lineColor,
        '--sb-base-color': baseColor
      }}
    >
      <span ref={fxRef} className="specular-button__fx" aria-hidden="true" />
      <span className="specular-button__label">{children}</span>
    </Element>
  );
};

export default SpecularButton;
