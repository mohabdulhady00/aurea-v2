/* ============================================================
   AUREA — main.js
   Three.js molten-gold form + GSAP/ScrollTrigger + Lenis
   ============================================================ */
import * as THREE from "three";
import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

// don't let the browser restore a mid-page scroll on reload (would snap the form)
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
ScrollTrigger.config({ ignoreMobileResize: true });

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = window.matchMedia("(max-width: 820px)").matches;
const isTouch = window.matchMedia("(hover: none)").matches;

/* ------------------------------------------------------------
   1 · SMOOTH SCROLL (Lenis) wired to GSAP ticker
------------------------------------------------------------ */
let lenis;
if (!reduceMotion) {
  lenis = new Lenis({
    lerp: 0.085,
    wheelMultiplier: 1.0,
    smoothWheel: true,
    syncTouch: false,
  });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  // internal anchor links via Lenis
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (id.length > 1) {
        e.preventDefault();
        lenis.scrollTo(id, { offset: 0, duration: 1.4 });
      }
    });
  });
}

/* ------------------------------------------------------------
   2 · WEBGL — the molten gold form
------------------------------------------------------------ */
const canvas = document.getElementById("stage");
const renderer = new THREE.WebGLRenderer({
  canvas,
  // MSAA is one of the more expensive things this scene asks of a GPU:
  // multisampling the custom vertex-displaced clearcoat/iridescent material
  // costs real time per frame. Its only job here is smoothing the form's
  // silhouette, and above 1x density the display is already doing that — at
  // devicePixelRatio 2 turning it off measured ~34% off the desktop GPU frame
  // with no visible difference in the edge. So it is kept only where it
  // actually shows: non-retina desktop.
  antialias: !isMobile && window.devicePixelRatio < 2,
  alpha: true,
  powerPreference: "high-performance",
});
renderer.setClearColor(0x000000, 0);
// This scene is fill-rate bound, not vertex bound (GPU timer queries: halving
// the buffer saved ~31% of frame time, while cutting 83% of the vertices saved
// only ~13%). Dropping mobile clearcoat below freed enough headroom that the
// buffer no longer has to pay for it — at 1.5 the silhouette stays crisp on a
// high-density screen for ~0.2ms, so the resolution stays where it was.
const DPR_CAP = isMobile ? 1.5 : 2;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, DPR_CAP));
// updateStyle=false: #stage's CSS (width:100vw; height:100lvh) stays the single
// source of truth for the canvas's box size. Without this, Three.js writes an
// inline style="width:...px;height:...px" that overrides the stylesheet — on
// mobile that pins the canvas to whatever size it was on the last resize event,
// which drifts from the live box, stretching the render non-uniformly (the gold
// form reads as squashed). The stylesheet uses lvh rather than dvh so that box
// no longer changes at all while the phone's toolbar animates — see styles.css.
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 6);

/* ---- lights (env map carries most of it) ---- */
const key = new THREE.DirectionalLight(0xffe4b0, 1.6);
key.position.set(4, 5, 6);
scene.add(key);
const rim = new THREE.DirectionalLight(0xffd27a, 1.1);
rim.position.set(-6, -2, -4);
scene.add(rim);
scene.add(new THREE.AmbientLight(0xf4ede1, 0.35));

/* ---- distortion GLSL injected into a physical gold material ---- */
const NOISE = /* glsl */ `
  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
    vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
    i=mod289(i);
    vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
    float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.0*floor(p*ns.z*ns.z);
    vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
    vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
    vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
    return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }
  float fbm(vec3 p){ float f=0.0,a=0.5; for(int i=0;i<3;i++){ f+=a*snoise(p); p*=2.02; a*=0.5;} return f; }
  vec3 distort(vec3 p, float t, float amp, float freq, float morph){
    float n = fbm(p*freq + vec3(0.0, t*0.35, 0.0));
    float n2 = snoise(p*freq*0.5 - vec3(0.0, t*0.5, 0.0));
    float d = n*amp + n2*amp*0.55*morph;
    return p + normalize(p)*d;
  }
  vec3 orthogonal(vec3 v){ return normalize( abs(v.x) > abs(v.z) ? vec3(-v.y, v.x, 0.0) : vec3(0.0, -v.z, v.y) ); }
`;

const uniforms = {
  uTime: { value: 0 },
  uAmp: { value: 0.28 },
  uFreq: { value: 1.15 },
  uMorph: { value: 0.4 },
};

const goldMat = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color(0xcaa04a),
  metalness: 1.0,
  // Clearcoat is a second full specular + env-reflection lobe evaluated per
  // pixel, and this scene is fill-rate bound: GPU timer queries put it at ~46%
  // of the entire frame — by far the most expensive single thing on the page.
  // On a phone its extra highlight sits almost on top of the base metal lobe
  // and reads as the same gold, so mobile drops it and compensates with
  // slightly tighter roughness to keep the surface looking wet rather than dry.
  roughness: isMobile ? 0.13 : 0.16,
  clearcoat: isMobile ? 0 : 1.0,
  clearcoatRoughness: 0.28,
  iridescence: 0.35,
  iridescenceIOR: 1.35,
  envMapIntensity: 1.25,
  reflectivity: 1.0,
});
goldMat.onBeforeCompile = (shader) => {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      `#include <common>
       uniform float uTime; uniform float uAmp; uniform float uFreq; uniform float uMorph;
       ${NOISE}`
    )
    .replace(
      "#include <beginnormal_vertex>",
      `vec3 dp = distort(position, uTime, uAmp, uFreq, uMorph);
       vec3 tang = orthogonal(normal);
       vec3 bitang = normalize(cross(normal, tang));
       float eps = 0.12;
       vec3 nb1 = distort(position + tang*eps, uTime, uAmp, uFreq, uMorph);
       vec3 nb2 = distort(position + bitang*eps, uTime, uAmp, uFreq, uMorph);
       vec3 objectNormal = normalize(cross(nb1 - dp, nb2 - dp));
       if(dot(objectNormal, normal) < 0.0) objectNormal = -objectNormal;
       #ifdef USE_TANGENT
         vec3 objectTangent = vec3( tangent.xyz );
       #endif`
    )
    .replace("#include <begin_vertex>", `vec3 transformed = dp;`);
};

// Vertex count grows roughly with detail^2, and the vertex shader runs the
// noise-distortion function 3x per vertex per frame (once for position,
// twice more for the finite-difference normal recalculation) — this is the
// single biggest lever on sustained mobile GPU/vertex load. 16 keeps the
// form reading smooth on a small, high-density phone screen at meaningfully
// lower cost than 24.
const detail = reduceMotion ? 12 : isMobile ? 16 : 48;
const geo = new THREE.IcosahedronGeometry(1.55, detail);
const blob = new THREE.Mesh(geo, goldMat);
scene.add(blob);

/* ---- floating gold motes ---- */
let motes;
{
  // additive-ish transparent points with depthWrite off = pure overdraw; they
  // measured ~14% of the mobile GPU frame for background sparkle, so thin them.
  const N = isMobile ? 120 : 380;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 2.6 + Math.random() * 3.2;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
    pos[i * 3 + 2] = r * Math.cos(ph);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({
    color: 0xc99a3f,
    size: 0.028,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  motes = new THREE.Points(g, m);
  scene.add(motes);
}

/* ------------------------------------------------------------
   3 · ENVIRONMENT MAP  → drives the gold reflections + preloader
------------------------------------------------------------ */
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();

function proceduralEnv() {
  // fallback warm-studio gradient if the image fails
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 512;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#fff6e6"); g.addColorStop(0.5, "#e8c98f"); g.addColorStop(1, "#7a5a22");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 512);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath(); ctx.ellipse(320, 150, 180, 90, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,220,150,0.7)";
  ctx.beginPath(); ctx.ellipse(760, 200, 120, 120, 0, 0, Math.PI * 2); ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const env = pmrem.fromEquirectangular(tex).texture;
  scene.environment = env;
  tex.dispose();
}

let started = false;
function startScene() {
  if (started) return; started = true;
  canvas.classList.add("is-ready");
  clock.start();
  renderer.setAnimationLoop(render);
}

new THREE.TextureLoader().load(
  "assets/env/studio.jpg",
  (tex) => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const env = pmrem.fromEquirectangular(tex).texture;
    scene.environment = env;
    tex.dispose();
    finishPreloader();
  },
  undefined,
  () => { proceduralEnv(); finishPreloader(); } // error → fallback
);

/* ------------------------------------------------------------
   4 · SCROLL CHOREOGRAPHY of the form
   Each section sets a TARGET pose; the render loop eases toward it.
   A lerp can never snap, so section boundaries are always continuous.
------------------------------------------------------------ */
const pose   = { x: 0, y: 0, scale: 1, rotX: 0, rotY: 0, morph: 0.4, opacity: 1, amp: 0.28 };
const target = { x: 0, y: 0, scale: 1, rotX: 0, rotY: 0, morph: 0.4, opacity: 1, amp: 0.28 };
const POSE_KEYS = ["x", "y", "scale", "rotY", "morph", "opacity", "amp"];

const POSES = {
  hero:      { x: 0,     y: 0,     scale: 1,    rotY: 0,   morph: 0.40, amp: 0.28, opacity: 1    },
  statement: { x: 1.35,  y: 0.12,  scale: 0.82, rotY: 0.8, morph: 0.68, amp: 0.34, opacity: 1    },
  metal:     { x: 1.6,   y: -0.1,  scale: 0.94, rotY: 1.6, morph: 0.55, amp: 0.30, opacity: 1    },
  method:    { x: -1.6,  y: 0.12,  scale: 0.72, rotY: 2.6, morph: 0.85, amp: 0.40, opacity: 0.92 },
  works:     { x: -1.2,  y: 0.0,   scale: 0.70, rotY: 3.2, morph: 0.85, amp: 0.40, opacity: 0    },
  manifesto: { x: 0,     y: 0,     scale: 1.18, rotY: 4.2, morph: 0.45, amp: 0.26, opacity: 1    },
  contact:   { x: 0,     y: -1.5,  scale: 0.9,  rotY: 5.0, morph: 0.60, amp: 0.30, opacity: 0.5  },
};

// Map each section to its pose. Target = the section that owns the viewport
// centre RIGHT NOW (live rects) — this is immune to the pinned Works section,
// which position:fixed pinning would otherwise desync from ScrollTrigger math.
const SECTION_ELS = reduceMotion ? [] : [
  ["hero", POSES.hero], ["statement", POSES.statement], ["metal", POSES.metal],
  ["method", POSES.method], ["works", POSES.works], ["manifesto", POSES.manifesto],
  ["contact", POSES.contact],
].map(([id, p]) => [document.getElementById(id), p]).filter(([el]) => el);

function updateTarget() {
  const mid = window.innerHeight * 0.5;
  for (let i = 0; i < SECTION_ELS.length; i++) {
    const el = SECTION_ELS[i][0];
    const r = el.getBoundingClientRect();
    if (r.top <= mid && r.bottom >= mid) { Object.assign(target, SECTION_ELS[i][1]); return; }
  }
}

/* ------------------------------------------------------------
   5 · RENDER LOOP
------------------------------------------------------------ */
const clock = new THREE.Clock(false);
const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
if (!isTouch) {
  window.addEventListener("pointermove", (e) => {
    mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
  });
}

let lastScrollY = -1;
let sinceTargetSync = 0;

function render() {
  const t = clock.getElapsedTime();
  uniforms.uTime.value = t;

  // ease pointer
  mouse.x += (mouse.tx - mouse.x) * 0.05;
  mouse.y += (mouse.ty - mouse.y) * 0.05;

  // pick the section that owns the viewport centre, then ease toward its pose
  // (a lerp can never snap → section boundaries are always continuous).
  // updateTarget() reads seven element rects, which forces a layout flush; the
  // targets can only change when the page has actually scrolled, so idle frames
  // skip the reads entirely. The periodic resync covers layout moving without a
  // scroll (ScrollTrigger.refresh inserting the Works pin spacer, font swap).
  const sy = window.scrollY;
  if (sy !== lastScrollY || ++sinceTargetSync > 30) {
    lastScrollY = sy;
    sinceTargetSync = 0;
    updateTarget();
  }
  for (let i = 0; i < POSE_KEYS.length; i++) {
    const k = POSE_KEYS[i];
    pose[k] += (target[k] - pose[k]) * 0.06;
  }

  // The form is fully faded out for the whole pinned Works gallery, but a
  // faded mesh costs exactly as much as a visible one — measured 3.16ms of a
  // 3.36ms GPU frame, spent to draw nothing, precisely where the horizontal
  // pin needs the headroom most. Drop it from the draw once it can't be seen.
  const formVisible = pose.opacity > 0.01;
  blob.visible = formVisible;
  if (motes) motes.visible = formVisible;

  if (formVisible) {
    // breathing morph + scroll morph
    uniforms.uMorph.value = pose.morph + Math.sin(t * 0.6) * 0.08;
    uniforms.uAmp.value = pose.amp + Math.sin(t * 0.8) * 0.015;

    blob.position.x = pose.x + mouse.x * 0.25;
    blob.position.y = pose.y - mouse.y * 0.2;
    blob.scale.setScalar(pose.scale);
    blob.rotation.y = pose.rotY + t * 0.12 + mouse.x * 0.25;
    blob.rotation.x = pose.rotX + Math.sin(t * 0.25) * 0.08 - mouse.y * 0.18;

    goldMat.opacity = pose.opacity;
    goldMat.transparent = pose.opacity < 0.99;

    if (motes) {
      motes.rotation.y = t * 0.02;
      motes.rotation.x = t * 0.01;
      motes.material.opacity = 0.55 * pose.opacity;
      motes.position.x = blob.position.x * 0.3;
    }
  }

  renderer.render(scene, camera);
}

if (reduceMotion) { startScene(); }

/* ------------------------------------------------------------
   6 · PRELOADER
------------------------------------------------------------ */
const pre = document.getElementById("preloader");
const preFill = document.getElementById("preloader-fill");
const preCount = document.getElementById("preloader-count");
let progress = { v: 0 };
const preTween = gsap.to(progress, {
  v: 92, duration: 2.2, ease: "power1.inOut",
  onUpdate: () => {
    preFill.style.width = progress.v + "%";
    preCount.textContent = Math.round(progress.v);
  },
});

function finishPreloader() {
  preTween.kill();
  gsap.to(progress, {
    v: 100, duration: 0.5, ease: "power2.out",
    onUpdate: () => { preFill.style.width = progress.v + "%"; preCount.textContent = Math.round(progress.v); },
    onComplete: () => {
      startScene();
      // recalc all triggers ONCE, while the preloader still covers the view and
      // we're pinned at the top — so the pin spacer can't nudge scroll mid-intro
      window.scrollTo(0, 0);
      if (lenis) lenis.scrollTo(0, { immediate: true });
      ScrollTrigger.refresh();
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
      tl.to(pre, { yPercent: -100, duration: 1.1, ease: "expo.inOut" })
        .from(".hero__title .word", { yPercent: 110, duration: 1.2, stagger: 0.08 }, "-=0.6")
        .from(".hero__eyebrow, .hero__tag, .hero__scroll", { y: 24, opacity: 0, duration: 1, stagger: 0.12 }, "-=0.8");
    },
  });
}

/* ------------------------------------------------------------
   7 · TEXT REVEALS + counters + statement + manifesto
------------------------------------------------------------ */
function initReveals() {
  // generic upward reveals
  gsap.utils.toArray(".reveal-up").forEach((el) => {
    gsap.from(el, {
      y: 40, opacity: 0, duration: 1, ease: "power3.out",
      scrollTrigger: { trigger: el, start: "top 88%", once: true },
    });
  });

  // line reveals (chapter titles, contact mail) — wrap content so overflow clips it
  gsap.utils.toArray(".reveal-line").forEach((el) => {
    const inner = document.createElement("span");
    inner.style.display = "block";
    inner.innerHTML = el.innerHTML;
    el.innerHTML = "";
    el.appendChild(inner);
    gsap.from(inner, {
      yPercent: 120, duration: 1.15, ease: "expo.out",
      scrollTrigger: { trigger: el, start: "top 92%", once: true },
    });
  });

  // statement: dim → ink word by word
  gsap.to("#statement .w", {
    color: "#1a1712", stagger: 0.4, ease: "none",
    scrollTrigger: { trigger: "#statement", start: "top 70%", end: "bottom 65%", scrub: 1 },
  });

  // manifesto words rise
  gsap.from("#manifesto .mword", {
    yPercent: 120, opacity: 0, duration: 1, stagger: 0.06, ease: "expo.out",
    scrollTrigger: { trigger: "#manifesto", start: "top 65%", once: true },
  });

  // counters
  gsap.utils.toArray("[data-count]").forEach((el) => {
    const target = +el.dataset.count;
    const obj = { v: 0 };
    gsap.to(obj, {
      v: target, duration: 2, ease: "power2.out",
      scrollTrigger: { trigger: el, start: "top 90%", once: true },
      onUpdate: () => { el.textContent = Math.round(obj.v); },
    });
  });
}

/* ------------------------------------------------------------
   8 · HORIZONTAL WORKS
------------------------------------------------------------ */
function initWorks() {
  const track = document.getElementById("works-track");
  if (!track) return;
  const getScroll = () => track.scrollWidth - window.innerWidth;
  gsap.to(track, {
    x: () => -getScroll(),
    ease: "none",
    scrollTrigger: {
      trigger: "#works",
      start: "top top",
      end: () => "+=" + getScroll(),
      pin: true,
      scrub: reduceMotion ? false : 1,
      invalidateOnRefresh: true,
      anticipatePin: 1,
    },
  });
}

/* ------------------------------------------------------------
   9 · CURSOR + hover + nav state
------------------------------------------------------------ */
function initCursor() {
  if (isTouch) return;
  const cur = document.getElementById("cursor");
  const p = { x: innerWidth / 2, y: innerHeight / 2, tx: innerWidth / 2, ty: innerHeight / 2 };
  window.addEventListener("pointermove", (e) => { p.tx = e.clientX; p.ty = e.clientY; });
  gsap.ticker.add(() => {
    p.x += (p.tx - p.x) * 0.2; p.y += (p.ty - p.y) * 0.2;
    cur.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%,-50%)`;
  });
  document.querySelectorAll("a, [data-hover], .work").forEach((el) => {
    el.addEventListener("pointerenter", () => cur.classList.add("is-hover"));
    el.addEventListener("pointerleave", () => cur.classList.remove("is-hover"));
  });
}

/* ------------------------------------------------------------
   10 · RESIZE
   Synced off the canvas's own rendered box (ResizeObserver) rather than
   window "resize": on mobile, the browser toolbar showing/hiding during
   scroll changes the canvas's actual CSS size (100dvh) without reliably
   firing a window resize event, which is what let the drawing buffer and
   the on-screen box drift apart in the first place.
------------------------------------------------------------ */
let bufW = 0, bufH = 0;
function syncRendererSize(width, height) {
  const w = Math.round(width), h = Math.round(height);
  if (w <= 0 || h <= 0) return;
  // ResizeObserver also fires for sub-pixel noise and for re-observations that
  // report an unchanged box. Every one of those used to reallocate the WebGL
  // drawing buffer (setSize + setPixelRatio both realloc), which is a GPU stall
  // in the middle of a scroll frame — the exact shape of a one-off stutter.
  if (w === bufW && h === bufH) return;
  bufW = w; bufH = h;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // The pixel ratio is fixed for the life of the page, so it is set once at
  // init; re-setting it here would force a redundant buffer reallocation.
  renderer.setSize(w, h, false);
}

if ("ResizeObserver" in window) {
  new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    syncRendererSize(width, height);
  }).observe(canvas);
} else {
  window.addEventListener("resize", () => {
    syncRendererSize(window.innerWidth, window.innerHeight);
  });
}

/* ------------------------------------------------------------
   11 · WIRE GALLERY IMAGES (lazy)
------------------------------------------------------------ */
function initImages() {
  document.querySelectorAll("[data-img]").forEach((img) => {
    const name = img.dataset.img;
    img.loading = "lazy";
    img.decoding = "async";
    img.src = `assets/img/${name}.webp`;
  });
}

/* ------------------------------------------------------------
   BOOT
------------------------------------------------------------ */
initImages();
initReveals();
initWorks();
initCursor();
ScrollTrigger.refresh();
// re-measure once webfonts settle (layout can shift); harmless now that reveals are `once`
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());

// safety: if env image is very slow, don't trap the user
setTimeout(() => { if (!started) { proceduralEnv(); finishPreloader(); } }, 6000);

// resume the intro if the page was loaded while backgrounded (rAF was paused)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") { ScrollTrigger.refresh(); }
});
