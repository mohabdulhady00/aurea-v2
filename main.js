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
  antialias: true,
  alpha: true,
  powerPreference: "high-performance",
});
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.6 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
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
  roughness: 0.16,
  clearcoat: 1.0,
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

const detail = reduceMotion ? 12 : isMobile ? 24 : 48;
const geo = new THREE.IcosahedronGeometry(1.55, detail);
const blob = new THREE.Mesh(geo, goldMat);
scene.add(blob);

/* ---- floating gold motes ---- */
let motes;
{
  const N = isMobile ? 180 : 380;
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
------------------------------------------------------------ */
const pose = { x: 0, y: 0, scale: 1, rotX: 0, rotY: 0, morph: 0.4, opacity: 1, amp: 0.28 };

function setPose(trigger, start, end, to) {
  gsap.to(pose, {
    ...to,
    ease: "none",
    scrollTrigger: { trigger, start, end, scrub: reduceMotion ? false : 1 },
  });
}
if (!reduceMotion) {
  setPose("#statement", "top bottom", "bottom center", { x: 1.5, y: 0.15, scale: 0.82, morph: 0.7, rotY: 1.1, amp: 0.34 });
  setPose("#metal", "top bottom", "bottom top", { x: 1.7, y: -0.1, scale: 0.92, rotY: 2.0, morph: 0.55, amp: 0.3 });
  setPose("#method", "top bottom", "bottom top", { x: -1.75, y: 0.1, scale: 0.72, rotY: 3.0, morph: 0.85, opacity: 0.85, amp: 0.4 });
  // hide behind the dark WORKS section
  gsap.to(pose, { opacity: 0, ease: "none", scrollTrigger: { trigger: "#works", start: "top 80%", end: "top 30%", scrub: 1 } });
  gsap.to(pose, { opacity: 1, ease: "none", scrollTrigger: { trigger: "#manifesto", start: "top 80%", end: "top 40%", scrub: 1 } });
  setPose("#manifesto", "top bottom", "center center", { x: 0, y: 0, scale: 1.18, rotY: 4.2, morph: 0.45, amp: 0.26 });
  setPose("#contact", "top bottom", "bottom bottom", { x: 0, y: -1.6, scale: 0.9, rotY: 5.0, morph: 0.6, opacity: 0.45, amp: 0.3 });
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

function render() {
  const t = clock.getElapsedTime();
  uniforms.uTime.value = t;

  // ease pointer
  mouse.x += (mouse.tx - mouse.x) * 0.05;
  mouse.y += (mouse.ty - mouse.y) * 0.05;

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
------------------------------------------------------------ */
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.6 : 2));
});

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
