// Concorde: scroll-driven 3D story, from a white studio with a red runway up into the blue (travel-poster look).
// Built from the SR-71 Blackbird template.
// How it works:
//   1. SCENE   three.js stage: the jet, black studio, floor with real shadows, poster type, blueprint
//              backdrop, reheat flames, speed streaks.
//   2. KEYS    one "camera + lighting state" per <section data-key> in the HTML.
//   3. SCROLL  every frame, read where each section sits on screen and blend the two nearest keys.
//              Because this is recomputed from the live layout each frame, the 3D scene can never drift
//              out of step with the text (fonts loading, phone toolbars resizing the page, etc.).
//   4. RENDER  apply the blended state to the scene.
// To add a chapter: add a <section data-key="name"> to the HTML and a KEYS.name entry below.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// index.html loads this file as main.js?v=N; the same tag goes on the data files, so a new version is never mixed
// with stale cached copies (GitHub Pages lets browsers cache files for 10 minutes)
const VERSION = new URL(import.meta.url).search;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = v => Math.min(1, Math.max(0, v));
const smooth = t => t * t * (3 - 2 * t);

/* ---------------------------------------------------------------- 1. SCENE */
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;          // keeps the white studio and white paint white
renderer.shadowMap.enabled = true;               // the jet casts a real shadow on the studio floor and poster type
renderer.shadowMap.type = THREE.PCFShadowMap;
canvas.addEventListener('webglcontextlost', e => {
  e.preventDefault();
  const el = document.getElementById('loader'); el.classList.remove('done', 'gone');
  window.loader.msg('The graphics driver reset. Reload the page to continue.');
});

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.05, 3000);

// Reflections: a light grey-blue "photo studio" with softbox strips, baked into an environment map.
function studioEnvironment() {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ color: 0x5d6b80, side: THREE.BackSide })));
  const ground = new THREE.Mesh(new THREE.CircleGeometry(48, 32), new THREE.MeshBasicMaterial({ color: 0xb9b4ac }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -8; env.add(ground);   // a bright floor to light the undersides
  const strip = (w, h, pos, bright, tint = 0xffffff) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(bright), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); env.add(m);
  };
  strip(36, 4, [0, 22, 0], 3);
  strip(4, 16, [-26, 6, 6], 1.6, 0xcfe0ff);
  strip(4, 16, [26, 6, -6], 1.6, 0xcfe0ff);
  strip(20, 2, [0, 4, -30], 1.2, 0xffe2c4);
  return env;
}
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(studioEnvironment(), 0.03).texture;

const keyLight = new THREE.DirectionalLight(0xfff1e0, 2);   keyLight.position.set(5, 12, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
Object.assign(keyLight.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 50 });
keyLight.shadow.bias = -0.0004; keyLight.shadow.normalBias = 0.02; keyLight.shadow.radius = 2;
const rimA = new THREE.DirectionalLight(0x9fc7ff, 3);       rimA.position.set(-6, 3, -9);
const rimB = new THREE.DirectionalLight(0xc8dcff, 2);       rimB.position.set(7, 1.5, -7);
scene.add(keyLight, rimA, rimB);

// Backdrop: a vertical gradient drawn on a small canvas, from the white studio (sky 0, matches --bg in index.html)
// to altitude blue (sky 1), lighter toward the horizon like the haze at the bottom of a travel poster.
// The blue vignette at the screen edges is CSS (#veil). main.js toggles html.sky so the text turns white in the blue.
const SKY_STOPS = [[0, '#e4e8ee', '#7ba3da', '#0c2a66'], [0.55, '#efede8', '#a8c4e8', '#2b5899'], [1, '#f3f1ec', '#d9e5f2', '#9fb9da']]; // [pos, studio, light sky, altitude]
const bgCanvas = document.createElement('canvas'); bgCanvas.width = 4; bgCanvas.height = 256;
const bgTex = new THREE.CanvasTexture(bgCanvas); bgTex.colorSpace = THREE.SRGBColorSpace;
scene.background = bgTex;
let skyShown = -1;
const ca = new THREE.Color(), cb = new THREE.Color();
function updateSky(k) {
  if (Math.abs(k - skyShown) < 0.004) return;
  skyShown = k;
  const g = bgCanvas.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  // white -> bright sky blue -> deep blue, so the blend never passes through a dull grey
  for (const [p, a, m, b] of SKY_STOPS) {
    if (k < 0.5) ca.set(a).lerp(cb.set(m), k * 2); else ca.set(m).lerp(cb.set(b), k * 2 - 1);
    gr.addColorStop(p, '#' + ca.getHexString());
  }
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256); bgTex.needsUpdate = true;
  document.documentElement.classList.toggle('sky', k > 0.45);
}
scene.add(camera);                                   // so things can be pinned to the screen (the blueprint)

function radialTexture(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Studio floor: shadows only, drawn over the backdrop, so the floor never shows an edge. Plus a soft contact shadow.
const FLOOR_SHADOW = 0.3;
const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.ShadowMaterial({ color: 0x0e2348, opacity: FLOOR_SHADOW, transparent: true }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
const shadow = new THREE.Mesh(new THREE.PlaneGeometry(7, 12), new THREE.MeshBasicMaterial({
  map: radialTexture([[0, 'rgba(0,0,0,.85)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false,
}));
shadow.rotation.x = -Math.PI / 2;
shadow.renderOrder = 3;
scene.add(floor, shadow);

// The red runway: a long strip down the studio floor with thin white edge lines, fading out at both ends.
// The aircraft taxis up it in the opening, and takes off from it.
const RUNWAY_W = 3.1, RUNWAY_L = 70;
function runwayTextures() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 4;
  const g = c.getContext('2d');
  g.fillStyle = '#b8101c'; g.fillRect(0, 0, 256, 4);
  g.fillStyle = '#f3f1ec'; g.fillRect(9, 0, 4, 4); g.fillRect(243, 0, 4, 4);       // edge lines
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  const a = document.createElement('canvas'); a.width = 4; a.height = 256;
  const ag = a.getContext('2d'), gr = ag.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#000'); gr.addColorStop(0.18, '#fff'); gr.addColorStop(0.82, '#fff'); gr.addColorStop(1, '#000');
  ag.fillStyle = gr; ag.fillRect(0, 0, 4, 256);
  return { map, alphaMap: new THREE.CanvasTexture(a) };
}
const runway = new THREE.Mesh(new THREE.PlaneGeometry(RUNWAY_W, RUNWAY_L),
  new THREE.MeshLambertMaterial({ ...runwayTextures(), transparent: true, depthWrite: false, emissive: 0x8a0a14, emissiveIntensity: 0.35 }));
runway.renderOrder = 1;                                          // floor layers draw in order: runway, poster type, contact shadow
runway.rotation.x = -Math.PI / 2;
runway.receiveShadow = true;
scene.add(runway);

// Speed streaks: thin lines rushing past in flight, the cue of speed once the aircraft is up in the blue.
// They live in a field around the camera and fade out with distance, so the field never shows an edge.
const STREAKS = 220, FIELD = 60;
const streaks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.018, 0.018, 1),
  new THREE.MeshBasicMaterial({ color: 0xcfd8e6, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }), STREAKS);
const streakPos = Array.from({ length: STREAKS }, () => new THREE.Vector3((Math.random() - 0.5) * 2 * FIELD, (Math.random() - 0.5) * FIELD, (Math.random() - 0.5) * 2 * FIELD));
streaks.frustumCulled = false;
streaks.renderOrder = 5;                                         // over the floor layers too
scene.add(streaks);
const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), s3 = new THREE.Vector3(), v3 = new THREE.Vector3(), col = new THREE.Color();
const wrap = (v, r) => ((v + r) % (2 * r) + 2 * r) % (2 * r) - r;
function updateStreaks(dt, speed) {
  streaks.visible = speed > 0.01;
  if (!streaks.visible) return;
  s3.set(1, 1, 1 + speed * 7);
  for (let i = 0; i < STREAKS; i++) {
    const p = streakPos[i];
    p.z -= dt * speed * 120;                                          // air streams backwards (-Z) past the jet
    // position relative to the camera, wrapped so the field always surrounds it
    v3.set(wrap(p.x - camera.position.x, FIELD), wrap(p.y - camera.position.y, FIELD / 2), wrap(p.z - camera.position.z, FIELD));
    const d = v3.length();
    const fade = Math.min(1, speed) * 0.4 * clamp01((d - 2) / 4) * clamp01((FIELD * 0.9 - d) / (FIELD * 0.5)); // fade near and far
    streaks.setColorAt(i, col.setScalar(fade));
    streaks.setMatrixAt(i, m4.compose(v3.add(camera.position), q0, s3));
  }
  streaks.instanceMatrix.needsUpdate = true; streaks.instanceColor.needsUpdate = true;
}

// Opening poster: thin, widely spaced type printed on the studio floor, across the red runway. Red on the white
// floor, white where it crosses the runway. The aircraft taxis up the runway onto it and shadows it.
const POSTER_H = 13.4, POSTER_W = POSTER_H * 0.715;                 // world units (the jet is 10 long)
const posterMat = new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false, emissive: 0xffffff, emissiveIntensity: 0.12 });
const poster = new THREE.Mesh(new THREE.PlaneGeometry(POSTER_W, POSTER_H), posterMat);
poster.rotation.set(-Math.PI / 2, 0, Math.PI);                      // lie flat, readable from above with the nose pointing up-screen
poster.receiveShadow = true;
poster.renderOrder = 2;
scene.add(poster);
async function drawPoster() {
  try { await Promise.all([document.fonts.load('300 100px Jost'), document.fonts.load('400 100px Jost'), document.fonts.load('500 100px Jost')]); } catch {}
  const W = 1430, H = 2000, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const px = W / POSTER_W, rw = RUNWAY_W * px, rx0 = (W - rw) / 2, rx1 = rx0 + rw;
  const FONT = (weight, size) => `${weight} ${size}px Jost, "Century Gothic", Futura, sans-serif`;
  // `text` with its letters spread evenly so it spans `width`, centred on cx, baseline at y
  const tracked = (text, cx, y, size, weight, width) => {
    g.font = FONT(weight, size);
    const ws = [...text].map(ch => g.measureText(ch).width), gap = (width - ws.reduce((a, b) => a + b, 0)) / (text.length - 1);
    let x = cx - width / 2;
    [...text].forEach((ch, i) => { g.fillText(ch, x, y); x += ws[i] + gap; });
  };
  const label = (title, value, cx) => {                              // small spec block on the white floor beside the runway
    const w = (rx0 - 0) * 0.72;
    tracked(title, cx, H * 0.335, 42, 500, w);
    g.fillRect(cx - w / 2, H * 0.352, w, 4);
    tracked(value, cx, H * 0.405, 64, 400, w);
  };
  const paint = () => {
    tracked('CONCORDE', W / 2, H * 0.17, 236, 300, W * 0.94);
    label('ENGINES', 'OLYMPUS 593', rx0 / 2);
    label('SPEED', 'MACH 2.04', (rx1 + W) / 2);
    tracked('MACH 2', W / 2, H * 0.95, 236, 300, W * 0.66);
  };
  g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  for (const [color, onRunway] of [['#c8102e', false], ['#f3f1ec', true]]) {
    g.save(); g.beginPath();
    if (onRunway) g.rect(rx0, 0, rw, H); else { g.rect(0, 0, rx0, H); g.rect(rx1, 0, W - rx1, H); }
    g.clip(); g.fillStyle = color; paint(); g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  posterMat.map = posterMat.emissiveMap = t; posterMat.needsUpdate = true;
}

// Blueprint scene: the pre-series exploded-view drawing, callouts removed (tools/clean-blueprint.py), tinted navy on the
// white studio, on a screen pinned to the camera,
// sized so the whole sheet fits the window. state.bpY slides it up and out of view.
const BP_ASPECT = 1580 / 706, BP_DIST = 40;                        // far behind the jet
const bpMat = new THREE.MeshBasicMaterial({ color: 0x1b3a72, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
const blueprint = new THREE.Mesh(new THREE.PlaneGeometry(BP_ASPECT, 1), bpMat);
blueprint.renderOrder = -1;
camera.add(blueprint);
function placeBlueprint(s, W, H) {
  const visH = 2 * BP_DIST * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), perPx = visH / H;
  const h = Math.min(visH, (visH * W / H) / BP_ASPECT) * 0.94;      // "contain": the whole sheet on screen
  blueprint.scale.set(h, h, 1);
  // the view offset slides the picture sideways for the text; slide the sheet back so it stays centred
  const offX = W < 700 ? 0 : -s.shift * W * 0.5;
  blueprint.position.set(offX * perPx, s.bpY * (visH + h) / 2 * 1.05, -BP_DIST);
}
async function loadBlueprint() {
  const url = JSON.parse(await (await fetch('assets/blueprint.json' + VERSION)).text())[0];
  const t = await new THREE.TextureLoader().loadAsync(url);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  bpMat.map = t; bpMat.needsUpdate = true;
}

// The jet. `jet` is flown by the story; `model` holds the Sketchfab scene, turned and scaled so that
// the aircraft is 10 units long, nose toward +Z, up +Y. Points on the aircraft (anchors, nozzles, the nose
// hinge) are listed in the model's own raw coordinates (as measured with tools/inspect.html: nose toward -Z,
// about 60 units long) and converted to jet units once the model has loaded.
const jet = new THREE.Group(), model = new THREE.Group();
jet.add(model); scene.add(jet);
const raw = p => model.localToWorld(new THREE.Vector3(...p));      // raw model point -> jet units (jet at rest)

// Feature points for the exterior tour (raw model units). The camera key for each sits on the same side.
const ANCHORS = {
  nose: [0, 1.5, -28.6],              // droop nose, ahead of the hinge
  wing: [-9.3, 1.0, 6.2],             // ogee leading edge
  intake: [-5.2, 0.45, 3.6],          // left intake mouth
  nozzle: [-5.2, 0.6, 15.4],          // left nacelle's nozzles
  tail: [0, 2.6, 22.5],               // rear fuselage (aft trim tank)
};
const anchors = {};
for (const k of Object.keys(ANCHORS)) { anchors[k] = new THREE.Object3D(); jet.add(anchors[k]); }

// Heat glow: an additive fresnel shell (kept from the template; Concorde's skin heat doesn't glow, so heat stays 0).
const heatU = { uHeat: { value: 0 } };

// Reheat: two cones (outer orange, inner hot core) + shock diamonds + a nozzle glow, per engine. Jet units.
// The cones use normal blending so they show against the white studio too (additive light vanishes on white).
// Their alpha fades toward the silhouette (fresnel) and in over the first few % at the nozzle lip, so they read
// as soft gas, not solid tubes. The glow and diamonds are additive: they light up against the blue sky.
const NOZZLES = [[-5.88, 0.6, 15.45], [-4.57, 0.6, 15.45], [4.55, 0.6, 15.45], [5.85, 0.6, 15.45]]; // raw
const FLAME_LEN = 1.7, FLAME_R = 0.1;
const flameU = { uI: { value: 0 }, uT: { value: 0 }, uGreen: { value: 0 } };
function flameMat(inner) {
  return new THREE.ShaderMaterial({
    uniforms: { ...flameU, uInner: { value: inner ? 1 : 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    vertexShader: `varying float vT; varying vec3 vN; varying vec3 vV; uniform float uT;
      void main(){ vT = .5 - position.y / ${FLAME_LEN.toFixed(2)}; vec3 p = position; p.xz *= 1. + .05 * sin(uT * 40. + position.y * 6.);
        vec4 mv = modelViewMatrix * vec4(p,1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uI, uInner, uGreen, uT; varying float vT; varying vec3 vN; varying vec3 vV;
      void main(){
        float t = clamp(vT, 0., 1.);
        float body = pow(t, uInner > .5 ? 2.2 : 1.3);                        // brightest at the nozzle, fading down the plume
        float edge = pow(abs(dot(normalize(vN), vV)), 1.6);                  // soft silhouette: no hard tube outline
        float lip = smoothstep(1., .9, t);                                   // fade in just behind the nozzle lip
        float flick = .92 + .08 * sin(uT * 60. + vT * 9.);
        vec3 c = uInner > .5 ? mix(vec3(1.,.78,.45), vec3(1.,.97,.9), t) : mix(vec3(1.,.36,.1), vec3(1.,.66,.32), t);
        c = mix(c, vec3(.35,1.,.45), uGreen);                                // (green ignition flash: unused on Concorde)
        gl_FragColor = vec4(c, clamp(body * edge * lip * flick * uI * (uInner > .5 ? .8 : .6), 0., 1.)); }`,
  });
}
const diamondTex = radialTexture([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,190,120,.6)'], [1, 'rgba(255,120,40,0)']]);
const glowTex = radialTexture([[0, 'rgba(255,236,200,1)'], [0.3, 'rgba(255,160,80,.45)'], [1, 'rgba(255,110,40,0)']]);
const flames = [], diamonds = [], glows = [];
const flameLight = new THREE.PointLight(0xff7a30, 0, 30, 1.6);
jet.add(flameLight);
function buildFlames() {
  for (const p of NOZZLES) {
    const g = new THREE.Group();
    g.position.copy(raw(p));
    g.rotation.x = -Math.PI / 2;                          // cones are built along +Y; point them backwards (-Z)
    const outer = new THREE.Mesh(new THREE.ConeGeometry(FLAME_R, FLAME_LEN, 32, 1, true), flameMat(false));
    const inner = new THREE.Mesh(new THREE.ConeGeometry(FLAME_R * 0.55, FLAME_LEN * 0.75, 24, 1, true), flameMat(true));
    outer.position.y = FLAME_LEN / 2; inner.position.y = FLAME_LEN * 0.375;  // wide base at the nozzle, tip trailing behind
    g.add(outer, inner);
    outer.renderOrder = inner.renderOrder = 5;            // after the floor layers (renderOrder 1-3), or the runway paints over them
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: diamondTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false }));
      s.position.y = 0.22 + i * 0.25; s.scale.setScalar(0.12 - i * 0.016); s.renderOrder = 6; g.add(s); diamonds.push(s);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false }));
    glow.position.y = 0.06; glow.scale.setScalar(0.42); glow.renderOrder = 6; g.add(glow); glows.push(glow);
    jet.add(g); flames.push(g);
  }
  flameLight.position.copy(raw([0, 0.6, 17]));
}

// Split a mesh's triangles into groups (by where each triangle's centre lies in raw model space), one new mesh
// per group sharing the original vertex data. Used to separate the drooping nose and the individual gear legs,
// which the model stores merged with their neighbours.
function splitMesh(mesh, classify) {
  const geo = mesh.geometry, pos = geo.attributes.position, idx = geo.index;
  const n = idx ? idx.count : pos.count, at = i => (idx ? idx.getX(i) : i);
  const groups = {}, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(pos, at(i)); b.fromBufferAttribute(pos, at(i + 1)); c.fromBufferAttribute(pos, at(i + 2));
    const key = classify(a.add(b).add(c).divideScalar(3).applyMatrix4(mesh.matrixWorld));
    (groups[key] ??= []).push(at(i), at(i + 1), at(i + 2));
  }
  const out = {};
  for (const [key, list] of Object.entries(groups)) {
    const g = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(geo.attributes)) g.setAttribute(name, attr);
    g.setIndex(list);
    const m = new THREE.Mesh(g, mesh.material); m.name = mesh.name + ':' + key;
    m.position.copy(mesh.position); m.quaternion.copy(mesh.quaternion); m.scale.copy(mesh.scale);
    mesh.parent.add(m); out[key] = m;
  }
  mesh.parent.remove(mesh);
  return out;
}

// Droop nose: the skin ahead of the hinge (raw z < NOSE_HINGE.z) is bent down around the hinge, blending over
// NOSE_BLEND so the skin stays in one piece. Done on the vertices (CPU) and only when the angle changes.
// The visor (a separate part, plus its panes in the glass mesh) slides down into the nose to uncover the windscreen.
const NOSE_HINGE = [0, 1.0, -26.6], NOSE_BLEND = 0.7;
const droopers = [];                                                   // { geo, idx, rawP, rawN, M, Minv }
let visorParts = [], droopShown = -1, visorShown = -1;
const visorFairing = new THREE.Group();                                 // fills the opening when the visor is down (built at load)
const VISOR_DROP = [0, -0.75, -0.12];                                  // raw units: down into the nose and slightly forward
// The visor is the skin over that part of the nose (the model has nothing under it). When it is down, a low painted
// fairing in its shape (visorFairing) closes the opening, as the real nose top does; the visor slides down into it
// and is hidden once fully stowed. In practice the keys keep the visor up (visor: 0) and only droop the nose: the
// model has no windscreen surround or flight deck to show with the visor down, and its own glazed visor looks right.
const VISOR_BASE_Y = 2.41, FAIRING_SQUASH = 0.32;                      // raw: bottom of the visor, fairing height factor
function prepareDroop(mesh) {
  const geo = mesh.geometry, M = mesh.matrixWorld.clone(), Minv = M.clone().invert(), N = new THREE.Matrix3().getNormalMatrix(M);
  const pos = geo.attributes.position, nor = geo.attributes.normal, v = new THREE.Vector3(), idx = [];
  for (let i = 0; i < pos.count; i++) if (v.fromBufferAttribute(pos, i).applyMatrix4(M).z < NOSE_HINGE[2]) idx.push(i);
  if (!idx.length) return;
  // quantized (Int16) positions can't leave the mesh's original bounds: switch these to plain floats
  const toFloat = a => { const f = new Float32Array(a.count * a.itemSize); for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = a.getComponent(i, k); return new THREE.BufferAttribute(f, a.itemSize); };
  geo.setAttribute('position', toFloat(pos));
  if (nor) geo.setAttribute('normal', toFloat(nor));
  const rawP = new Float32Array(idx.length * 3), rawN = new Float32Array(idx.length * 3);
  idx.forEach((i, j) => {
    v.fromBufferAttribute(geo.attributes.position, i).applyMatrix4(M).toArray(rawP, j * 3);
    if (nor) v.fromBufferAttribute(geo.attributes.normal, i).applyMatrix3(N).normalize().toArray(rawN, j * 3);
  });
  droopers.push({ geo, idx, rawP, rawN: nor ? rawN : null, Minv, Ninv: new THREE.Matrix3().getNormalMatrix(Minv) });
}
const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion(), _ax = new THREE.Vector3(1, 0, 0);
const visorDrop = new THREE.Vector3(...VISOR_DROP);
function updateNose(droopDeg, visorDown) {
  if (Math.abs(droopDeg - droopShown) > 0.02) {
    droopShown = droopDeg;
    const ang = -THREE.MathUtils.degToRad(droopDeg), [hx, hy, hz] = NOSE_HINGE;   // raw nose points -Z: a negative turn about X lowers it
    for (const d of droopers) {
      const P = d.geo.attributes.position, Nn = d.geo.attributes.normal;
      d.idx.forEach((i, j) => {
        const k = j * 3, w = smooth(clamp01((hz - d.rawP[k + 2]) / NOSE_BLEND));
        _q.setFromAxisAngle(_ax, ang * w);
        _p.set(d.rawP[k] - hx, d.rawP[k + 1] - hy, d.rawP[k + 2] - hz).applyQuaternion(_q).add(_n.set(hx, hy, hz)).applyMatrix4(d.Minv);
        P.setXYZ(i, _p.x, _p.y, _p.z);
        if (d.rawN) { _n.fromArray(d.rawN, k).applyQuaternion(_q).applyMatrix3(d.Ninv).normalize(); Nn.setXYZ(i, _n.x, _n.y, _n.z); }
      });
      P.needsUpdate = true; if (Nn) Nn.needsUpdate = true;
    }
  }
  if (Math.abs(visorDown - visorShown) > 0.002) {
    visorShown = visorDown;
    for (const v of visorParts) {
      v.mesh.position.copy(v.up).add(_p.copy(visorDrop).applyMatrix3(v.toLocal).multiplyScalar(visorDown));
      v.mesh.visible = visorDown < 0.98;
    }
    visorFairing.visible = visorDown > 0.02;
  }
}

// Landing gear: legs (split out of the merged gear meshes) that fold and shrink into their bays on takeoff.
// The model has gear doors: the open doors show while any gear is out, the closed ones once it is stowed,
// so (unlike the SR-71) the camera is free to look at the underside in flight.
const legOf = p => (p.z < -8 ? 'nose' : p.z > 15 ? 'tail' : p.x < 0 ? 'mainL' : 'mainR');
const legs = [], doorsOpen = [], doorsClosed = [];
function buildGear(root) {
  const parts = {};
  const gearMeshes = [];
  root.getObjectByName('LandingGear_4_14').traverse(o => { if (o.isMesh) gearMeshes.push(o); });
  for (const m of gearMeshes) for (const [k, sub] of Object.entries(splitMesh(m, legOf))) (parts[k] ??= []).push(sub);
  root.getObjectByName('LGCoversOpen_6_18').traverse(o => { if (o.isMesh) doorsOpen.push(o); });
  root.getObjectByName('LGCoversClosed_5_16').traverse(o => { if (o.isMesh) doorsClosed.push(o); });
  for (const [leg, list] of Object.entries(parts)) {
    const box = new THREE.Box3(); list.forEach(p => box.expandByObject(p, true));
    const pivot = new THREE.Group();
    const c = box.getCenter(new THREE.Vector3());
    pivot.position.set(c.x, box.max.y, c.z);           // fold from the top of the leg, inside the body (raw units)
    root.add(pivot); pivot.updateMatrixWorld(true);
    list.forEach(p => pivot.attach(p));                // keep each part where it is
    legs.push({ pivot, side: leg === 'nose' || leg === 'tail' ? 0 : Math.sign(c.x) });
  }
}
function updateGear(g) {
  for (const { pivot, side } of legs) {
    const t = 1 - g;                                     // 0 = down, 1 = stowed
    // fold a little and shrink toward the top of the leg (the gear bay), so no part ever rises
    // above the bay and pokes through the top of the airframe
    if (side === 0) pivot.rotation.x = t * 0.55;             // nose and tail legs tip forward (raw nose is -Z)
    else pivot.rotation.z = -side * t * 0.55;                // main legs tip inward
    pivot.scale.setScalar(Math.max(0.001, 1 - smooth(t)));
    pivot.visible = g > 0.01;
  }
  const out = g > 0.04;
  doorsOpen.forEach(d => { d.visible = out; });
  doorsClosed.forEach(d => { d.visible = !out; });
}

// Post-processing: bloom makes the reheat flames bleed like a camera lens.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.5, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ----------------------------------------------------------------- 2. KEYS */
const DEFAULT = {
  cam: [8, 2, 10], look: [0, 0, 0], fov: 32,     // camera position, what it looks at, lens
  yaw: 0, pitch: 0, roll: 0, jy: 0, jz: 0,      // jet attitude and position (pitch < 0 = nose up)
  floor: 1, gear: 1, speed: 0,                  // studio floor, landing gear (1 = down), speed streaks
  droop: 5, visor: 0,                           // nose droop in degrees (0, 5 or 12.5), visor (1 = lowered: kept at 0, see VISOR_DROP)
  sky: 0,                                       // backdrop: 0 = white studio, 1 = altitude blue (text turns white past 0.45)
  poster: 0, bp: 0, bpY: 0,                     // opening poster type, blueprint backdrop (+ how far it has scrolled away)
  vis: 1,                                       // 0 hides the jet (used while it is repositioned off screen)
  env: 1, key: 2, rim: 2, exposure: 1, bloom: 0,
  flame: 0, green: 0, heat: 0, shake: 0,
  shift: 0,                                     // slide the jet sideways in frame, away from the text (-1..1)
  lift: 1,                                      // on phones, lift the picture above the text (0 = keep centred)
  low: 0,                                       // 1 = low raking key light (long shadows across the poster type)
  pz: 1,                                        // on phones, multiply the camera distance (pull back for wide shots)
};// Each key inherits everything from the key before it, so it only lists what changes.
// `look` may name an anchor; `cam` is then an offset from that anchor.
// The model has gear doors, so the camera may look at the underside once the gear is up.
const KEYS = {
  poster:   { cam: [0, 33, -0.3], look: [0, 0, 0], fov: 32, jz: -19, poster: 1, env: 0.8, key: 2.6, rim: 1, bloom: 0, lift: 0, low: 1 },
  arrive:   { jz: 0, shift: 0.34 },
  airframe: { cam: [-11.5, 4, -8], look: [0, -0.2, 0], fov: 32, poster: 0, low: 0, env: 1, key: 2.2, rim: 2, shift: -0.2, lift: 1 },
  // blueprint: the text pins (see .pin in the HTML) while the sheet is shown whole, then slides up and away
  blueprint:{ at: ['blueprint', 0, 0.3], cam: [0, 0.95, 14], look: [0, 0.15, 0], fov: 32, bp: 1, bpY: 0, floor: 0, env: 1.1, key: 2, rim: 2.4, shift: 0.2 },
  bpout:    { at: ['blueprint', 0.85, 1], bpY: 1 },
  // nose leaves bpY at 1: once the blueprint has slid away it never slides back in while scrolling forward
  nose:     { look: 'nose', cam: [-2.4, 0.5, 2.2], fov: 30, bp: 0, floor: 1, rim: 1.2, droop: 12.5, shift: -0.22, pz: 1.5 },
  wing:     { look: 'wing', cam: [-8, 8.5, 6.5], droop: 5, shift: 0.22 },
  intakes:  { look: 'intake', cam: [-2.6, -0.4, 2.4], shift: -0.22 },
  engines:  { look: 'nozzle', cam: [-4.6, 0.7, -5.2], fov: 32, rim: 2.6, key: 1.6, env: 1.6, shift: 0.22 },
  tail:     { look: 'tail', cam: [6.5, 2.4, -5], shift: -0.22 },
  // takeoff chapter is pinned: the four engines light up in reheat under "Four engines in reheat", and the
  // jet rolls and lifts off while the next chapter's text (cost) takes over.
  ignite:   { at: ['takeoff', 0, 1.4], look: [0, 0, -2], cam: [-4.5, 1.4, -12], fov: 38, pz: 1, flame: 0.8, bloom: 0.15, env: 0.9, key: 1.4, shift: 0.15 },
  spool:    { at: ['cost', -0.25], flame: 1 },
  // low side view while the gear comes up and the doors close
  liftoff:  { at: ['cost', 0.4], look: [0, 1.1, 0.3], cam: [21, 0.3, 4.3], fov: 33, shift: -0.36, pz: 1.4, jy: 1.1, pitch: -0.12, gear: 0.5, floor: 0.3, speed: 0.5, shake: 0.6, key: 1.6, env: 1.2, sky: 0.1 },
  takeoff:  { at: ['cost', 0.85, 1], look: [0, 2.2, 2], cam: [-6, 5.5, -14], fov: 40, pz: 1, floor: 0, gear: 0, speed: 1, flame: 1, jy: 2.2, pitch: -0.14, env: 0.9, key: 1.4, rim: 2.5, bloom: 0.2, shake: 1, sky: 0.35, shift: -0.15 },
  // climbing out the nose comes up and the visor closes; reheat stays lit through the sound barrier
  climb:    { look: [0, 2.6, 1], cam: [11, 8, -12], fov: 36, pitch: -0.3, roll: 0.15, droop: 0, flame: 0.6, env: 0.8, key: 1.6, bloom: 0.25, shake: 0.4, sky: 0.8, shift: -0.12 },
  // cruise: reheat off (Concorde cruised at Mach 2 without it), streaks rushing past
  cruise:   { look: [0, 2.2, 0.5], cam: [22, 6, 6], fov: 30, speed: 1.4, flame: 0, pitch: 0, roll: 0, env: 0.8, key: 1.8, rim: 3, bloom: 0.25, shake: 0.15, sky: 1, shift: 0.3 },
  records:  { look: [0, 2.2, 0], cam: [-9, 22, -20], fov: 34, speed: 0.8, roll: -0.08, shift: 0.42 },
  outro:    { look: [0, 3, 30], cam: [3, 10, -46], fov: 30, speed: 1, jz: 130, jy: 4, roll: 0, pitch: -0.05, bloom: 0.25, shift: 0 },
  // the aircraft shrinks into the distance and is gone...
  gone:     { between: ['outro', 'finaleIn', 0.45], jz: 420, jy: 8, vis: 0 },
  // ...is quietly moved off the left edge of the next shot...
  repo:     { between: ['outro', 'finaleIn', 0.85], look: [0, -0.55, 0], cam: [-17, 9.4, -0.92], fov: 30, jz: -70, jy: 0, roll: 0.35, pitch: -0.08, flame: 1, speed: 0.4, lift: 0, pz: 1.75, vis: 0 },
  // ...and once the closing poster has scrolled into place, flies in from the left into the gap in the type
  finaleIn: { at: ['finale', 0], vis: 1 },
  finale:   { at: ['finale', 0.45, 1], jz: 0, speed: 0.25, bloom: 0.3 },  // (repo sets pz for phones)
};
const FIELDS = Object.keys(DEFAULT).filter(f => f !== 'cam' && f !== 'look');
const JET_FIELDS = new Set(['jz', 'jy', 'pitch', 'roll', 'yaw']);

// Camera moves are stored as an orbit around `look` (radius, azimuth, elevation) so that blending
// between two keys swings the camera around the jet instead of cutting straight through it.
function resolveKey(name, prevAz, inherited) {
  const k = { ...inherited, ...KEYS[name] };
  const anchored = typeof k.look === 'string';
  // Anchors are read in the jet's resting pose (their position relative to the jet), NOT its current world position:
  // layout() also runs on resize / full screen / font load, when the jet may be parked or flying somewhere else.
  const look = anchored ? anchors[k.look].position.clone() : new THREE.Vector3(...k.look);
  const camPos = anchored ? look.clone().add(new THREE.Vector3(...k.cam)) : new THREE.Vector3(...k.cam);
  const off = camPos.sub(look), r = off.length();
  let az = Math.atan2(off.x, off.z);
  const el = Math.asin(off.y / r);
  if (prevAz !== undefined) { while (az - prevAz > Math.PI) az -= 2 * Math.PI; while (prevAz - az > Math.PI) az += 2 * Math.PI; }
  const out = { lx: look.x, ly: look.y, lz: look.z, r, az, el };
  for (const f of FIELDS) out[f] = k[f];
  return { out, merged: k };
}

/* --------------------------------------------------------------- 3. SCROLL */
const lenis = reduceMotion ? null : new Lenis({ lerp: 0.09, wheelMultiplier: 0.9 });
const story = document.getElementById('story');
const sections = [...story.querySelectorAll('section[data-key]')];
const state = {}, target = {};
let stops = [];          // [{ name, y0, y1, r }] : the key is held still while scrollY is between y0 and y1
let layoutVersion = 0;

// Measure the page and work out, for every key, the scroll range where it is fully shown:
// the middle part of its section, centred on screen. Keys between sections (like `ignite`) get a point.
const HOLD = 0.3;        // fraction of each section's height during which its scene holds still
function layout() {
  const vh = innerHeight, top = story.getBoundingClientRect().top + scrollY;
  const secTop = name => { const sec = sections.find(s => s.dataset.key === name); return [top + sec.offsetTop, sec.offsetHeight]; };
  // a key's place: by default the middle of its section, centred on screen; with `at: [section, f0, f1]` a stretch
  // of that section's pinned scroll (0 = section top reaches the top of the window, 1 = its bottom reaches the bottom)
  const place = (name, fallback) => {
    const at = KEYS[name]?.at;
    if (!at) return fallback;
    const [t, h] = secTop(at[0]), y = f => t + f * (h - vh);
    return { name, y0: y(at[1]), y1: y(at[2] ?? at[1]) };
  };
  // sections without a KEYS entry (like `cost`) add no stop of their own: the keys placed inside them drive the scene
  const list = sections.filter(sec => KEYS[sec.dataset.key]).map(sec => {
    const c = top + sec.offsetTop + sec.offsetHeight / 2 - vh / 2, h = sec.offsetHeight * HOLD / 2;
    return place(sec.dataset.key, { name: sec.dataset.key, y0: c - h, y1: c + h });
  });
  for (const name of Object.keys(KEYS)) if (KEYS[name].at && !list.some(s => s.name === name)) list.push(place(name));
  list.sort((a, b) => a.y0 - b.y0);
  for (const [name, k] of Object.entries(KEYS)) if (k.between) {
    const [a, b, f] = k.between, A = list.find(s => s.name === a), B = list.find(s => s.name === b);
    const y = lerp(A.y1, B.y0, f); list.push({ name, y0: y, y1: y });
  }
  list.sort((a, b) => a.y0 - b.y0);
  list[0].y0 = -1e9; list.at(-1).y1 = 1e9;
  let prevAz, inherited = DEFAULT;
  stops = list.map(s => { const { out, merged } = resolveKey(s.name, prevAz, inherited); prevAz = out.az; inherited = merged; return { ...s, r: out }; });
  layoutVersion++;
}

// The state the scene should show at scroll position y.
function sample(y, into) {
  let i = 0;
  while (i < stops.length - 1 && y > stops[i].y1) i++;
  const b = stops[i], a = stops[i - 1];
  if (!a || y >= b.y0) { Object.assign(into, b.r); return; }          // inside a hold
  const t = smooth(clamp01((y - a.y1) / (b.y0 - a.y1)));               // between two holds
  for (const f in b.r) into[f] = lerp(a.r[f], b.r[f], t);
}

// Which section's text is on screen: the one under the middle of the viewport.
function activeSection() {
  const mid = innerHeight / 2;
  return sections.find(sec => { const r = sec.getBoundingClientRect(); return r.top <= mid && r.bottom > mid; }) || null;
}

// Rail, counters and the 3D callout marker.
const marker = document.getElementById('marker'), markerLabel = marker.querySelector('b');
const rail = document.getElementById('rail');
const dots = sections.map((sec, i) => {
  const dot = document.createElement('a');
  dot.href = '#'; dot.setAttribute('aria-label', 'Chapter ' + (i + 1) + ': ' + (sec.querySelector('h1,h2')?.textContent || ''));
  dot.addEventListener('click', e => {
    e.preventDefault();
    const y = sec.getBoundingClientRect().top + scrollY + sec.offsetHeight / 2 - innerHeight / 2;
    lenis ? lenis.scrollTo(y, { duration: 1.8 }) : scrollTo(0, y);
  });
  rail.append(dot);
  return dot;
});
// One more dot for the very end (the jet in its place on the closing poster), so the poster doesn't look like the end
const endDot = document.createElement('a');
endDot.href = '#'; endDot.setAttribute('aria-label', 'The end');
endDot.addEventListener('click', e => { e.preventDefault(); const y = document.documentElement.scrollHeight - innerHeight; lenis ? lenis.scrollTo(y, { duration: 1.8 }) : scrollTo(0, y); });
rail.append(endDot);
const hint = document.getElementById('hint');
const finaleMore = document.querySelector('.finale .more');
function runCounters(sec) {
  sec.querySelectorAll('[data-count]').forEach(el => {
    const small = el.querySelector('small').outerHTML, end = +el.dataset.count, dec = +el.dataset.dec, t0 = performance.now(), dur = reduceMotion ? 1 : 2200;
    const run = el._run = {};                                         // a newer run cancels this one
    const step = now => {
      if (el._run !== run) return;
      const t = clamp01((now - t0) / dur), v = end * (1 - (1 - t) ** 3);
      el.innerHTML = v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + small;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
let current = null;
function updateOverlays() {
  const sec = activeSection();
  if (sec !== current) {
    sections.forEach(s => { if (!s.dataset.static) s.querySelector('.copy').classList.toggle('on', s === sec); });
    if (sec) runCounters(sec);
    current = sec;
  }
  // rail: the finale's own dot until the jet has arrived; the last dot only at the very end
  const finaleStop = stops.find(st => st.name === 'finale');
  const atEnd = !!finaleStop && scrollY >= finaleStop.y0 - 4;
  sections.forEach((s, i) => dots[i].classList.toggle('on', s === sec && !(s.dataset.key === 'finale' && atEnd)));
  endDot.classList.toggle('on', atEnd);
  finaleMore.classList.toggle('on', sec?.dataset.key === 'finale' && !atEnd);
  hint.classList.toggle('on', scrollY < 40 && !touring);
  if (!sec && scrollY < innerHeight) sections[0].querySelector('.copy').classList.add('on');
  // marker: only while that section is showing, and only if its point is in front of the camera and on screen
  const anchor = sec?.dataset.anchor && anchors[sec.dataset.anchor];
  let show = false;
  if (anchor) {
    const p = anchor.getWorldPosition(tmp).project(camera);
    show = p.z < 1 && Math.abs(p.x) < 0.95 && Math.abs(p.y) < 0.95;
    marker.style.transform = `translate(${(p.x * 0.5 + 0.5) * innerWidth}px, ${(-p.y * 0.5 + 0.5) * innerHeight}px)`;
    markerLabel.textContent = sec.dataset.label;
  }
  marker.classList.toggle('on', show);
}

/* --------------------------------------------------------------- 4. RENDER */
const look = new THREE.Vector3(), tmp = new THREE.Vector3();
let floorY = 0, last = performance.now(), loaded = false;
function frame(now) {
  requestAnimationFrame(frame);
  lenis?.raf(now);
  if (!loaded) return;
  const dt = Math.min(0.05, (now - last) / 1000), t = now / 1000; last = now;

  // ease the shown state toward the state for the current scroll position
  sample(scrollY, target);
  const k = reduceMotion ? 1 : 1 - Math.exp(-Math.min(0.25, (now - (frame.prev ?? now)) / 1000) * 9); // time-based, even on slow devices
  frame.prev = now;
  const hidden = target.vis < 0.5;                                    // jet out of sight: move it instantly, no easing
  for (const f in target) {
    const snap = state[f] === undefined || !Number.isFinite(state[f]) || f === 'vis' || (hidden && JET_FIELDS.has(f));
    state[f] = snap ? target[f] : lerp(state[f], target[f], k);
  }
  const s = state;

  // jet: attitude from the story, plus a gentle bob once airborne
  const air = clamp01(1 - s.floor);
  jet.position.set(0, s.jy + Math.sin(t * 0.9) * 0.06 * air, s.jz);
  jet.rotation.set(s.pitch + Math.sin(t * 0.7) * 0.01 * air, s.yaw, s.roll + Math.sin(t * 0.5) * 0.02 * air, 'YXZ');
  updateGear(s.gear);
  updateNose(s.droop, s.visor);
  jet.visible = s.vis > 0.5;

  // camera: orbit around the look point, with a little handheld shake
  look.set(s.lx, s.ly, s.lz);
  const shake = reduceMotion ? 0 : s.shake * 0.05, r = s.r * (innerWidth < 700 ? s.pz : 1);
  camera.position.set(
    look.x + r * Math.cos(s.el) * Math.sin(s.az) + Math.sin(t * 23) * shake,
    look.y + r * Math.sin(s.el) + Math.sin(t * 31 + 1) * shake,
    look.z + r * Math.cos(s.el) * Math.cos(s.az));
  camera.lookAt(look);
  const W = innerWidth, H = innerHeight, aspect = W / H, narrow = W < 700;
  camera.fov = aspect < 1 ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(s.fov) / 2) * Math.min(2.2, 0.95 / aspect))) : s.fov;
  camera.setViewOffset(W, H, narrow ? 0 : -s.shift * W * 0.5, narrow ? H * 0.16 * s.lift : 0, W, H); // on phones the text sits low: lift the jet
  camera.updateProjectionMatrix();

  // studio
  floor.material.opacity = s.floor * FLOOR_SHADOW; shadow.material.opacity = s.floor * 0.35; runway.material.opacity = s.floor;
  floor.visible = shadow.visible = runway.visible = s.floor > 0.01;
  floor.position.y = floorY; shadow.position.y = floorY + 0.012; runway.position.y = floorY + 0.004;
  renderer.shadowMap.autoUpdate = floor.visible;                       // no floor, no shadow pass
  posterMat.opacity = s.poster; poster.visible = s.poster > 0.01; poster.position.y = floorY + 0.008;
  bpMat.opacity = s.bp * 0.8; blueprint.visible = s.bp > 0.01;
  updateSky(s.sky);
  if (blueprint.visible) placeBlueprint(s, W, H);
  updateStreaks(dt, s.speed);

  // lighting
  scene.environmentIntensity = s.env;
  keyLight.position.set(lerp(5, 9, s.low), lerp(12, 4.2, s.low), lerp(6, 6.5, s.low)); // high studio light, or low and raking
  keyLight.intensity = s.key; rimA.intensity = s.rim; rimB.intensity = s.rim * 0.6;
  renderer.toneMappingExposure = s.exposure;
  bloom.strength = s.bloom;

  // engines and heat
  flameU.uI.value = s.flame; flameU.uT.value = t; flameU.uGreen.value = s.green;
  for (const f of flames) { f.visible = s.flame > 0.01; f.scale.set(1, 0.55 + 0.6 * s.flame + Math.sin(t * 30) * 0.03, 1); }
  diamonds.forEach((d, i) => { d.material.opacity = clamp01(s.flame * 1.4 - 0.4) * (0.3 + 0.15 * Math.sin(t * 50 + i)); });
  glows.forEach((g, i) => { g.material.opacity = s.flame * (0.75 + 0.15 * Math.sin(t * 37 + i * 2)); });
  flameLight.intensity = s.flame * 6;
  heatU.uHeat.value = s.heat;

  updateOverlays();
  composer.render();
}
requestAnimationFrame(frame);

/* ----------------------------------------------------------------- 5. LOAD */
// The model ships as base64 inside a JSON file (the page host serves .json but not .glb).
async function fetchModel(url) {
  const res = await fetch(url);
  const total = +res.headers.get('content-length') || 1.77e7, reader = res.body.getReader(), chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    chunks.push(value); got += value.length;
    window.loader.set(Math.min(1, got / total) * 0.75);
  }
  const b64 = JSON.parse(await new Blob(chunks).text())[0];
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
}
function onFail(err) { window.loader.msg('The model could not load: ' + (err?.message || err)); }
fetchModel('assets/concorde.json' + VERSION).then(buf => new GLTFLoader().parse(buf, '', onModel, onFail)).catch(onFail);

const glass = new THREE.MeshPhysicalMaterial({ color: 0x0c1520, metalness: 0.2, roughness: 0.04, clearcoat: 1, envMapIntensity: 2, transparent: true, opacity: 0.85 });
async function onModel(gltf) {
  const root = gltf.scene;                                    // already Y up; nose toward -Z
  root.updateMatrixWorld(true);

  // Drooping nose: prepare every airframe mesh that reaches ahead of the hinge (raw coordinates, before the
  // model is moved). The visor's panes live in the glass mesh: split them out so they move with the visor.
  const isGear = o => { for (let p = o; p; p = p.parent) if (/^(LandingGear|LGCovers|LGInside)/.test(p.name)) return true; return false; };
  const glassMesh = []; root.traverse(o => { if (o.isMesh && o.material.name === 'Glass') glassMesh.push(o); });
  const visorMeshes = [root.getObjectByName('Object_64')];
  for (const g of glassMesh) {
    const parts = splitMesh(g, p => (p.z < -24.65 && p.z > -26.8 && p.y > 2.3 ? 'visor' : 'rest'));
    if (parts.visor) visorMeshes.push(parts.visor);
  }
  root.updateMatrixWorld(true);
  for (const m of visorMeshes) {
    const toLocal = new THREE.Matrix3().setFromMatrix4(m.parent.matrixWorld).invert();   // raw direction -> parent space
    visorParts.push({ mesh: m, up: m.position.clone(), toLocal });
  }
  // the fairing: painted copies of the visor and its panes, squashed down onto the visor's base line
  visorFairing.position.set(0, VISOR_BASE_Y, 0); root.add(visorFairing); visorFairing.updateMatrixWorld(true);
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.2, side: THREE.DoubleSide });
  for (const m of visorMeshes) {
    const c = new THREE.Mesh(m.geometry, paint);
    m.updateMatrixWorld(true); c.matrixAutoUpdate = true;
    m.matrixWorld.decompose(c.position, c.quaternion, c.scale);    // raw-space transform (root is still at the origin)
    c.updateMatrixWorld(true); visorFairing.attach(c);
  }
  visorFairing.scale.y = FAIRING_SQUASH;
  visorFairing.visible = false;
  const airframe = [];
  root.traverse(o => { if (o.isMesh && !isGear(o) && !visorMeshes.includes(o)) airframe.push(o); });
  airframe.forEach(prepareDroop);
  // The model is a hollow shell with no flight deck: looking in through the windscreen you would see out through the
  // far side of the fuselage (the floor, the gear). A dark shell fills the flight deck instead, sized from the
  // measured fuselage profile (top 3.21 at z -24.5, 3.37 at -23.5) so it reaches up under the roof but stays inside
  // the skin, behind the nose hinge. (Drawing the airframe's inside faces dark was tried: it exposes flipped faces.)
  const cabin = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.MeshBasicMaterial({ color: 0x1d2229, side: THREE.DoubleSide }));
  cabin.position.set(0, 2.2, -23.5); cabin.scale.set(0.8, 0.95, 2.6);
  cabin.name = 'cockpit_interior'; root.add(cabin);
  buildGear(root);

  model.add(root);
  model.rotation.y = Math.PI;                                 // turn the nose to +Z
  const LENGTH = 31.73 + 28.55, CENTER = [0, 2.2, -1.59];     // raw: nose tip to tail cone, centre of the airframe
  model.scale.setScalar(10 / LENGTH);                         // 10 units nose to tail
  model.updateMatrix();
  model.position.copy(new THREE.Vector3(...CENTER).applyMatrix4(model.matrix)).negate();
  jet.updateMatrixWorld(true);
  for (const [k, p] of Object.entries(ANCHORS)) anchors[k].position.copy(raw(p));
  buildFlames();

  // Materials: keep the model's painted textures (livery, panel lines) on a glossy white-paint finish so they
  // respond to the studio lighting. Glass is tinted; metal parts (engines, gear) are a little more metallic.
  const meshes = [];
  root.traverse(o => { if (o.isMesh) meshes.push(o); });
  const made = new Map();
  for (const o of meshes) {
    const m = o.material;
    if (m.name === 'Glass') { o.material = glass; continue; }
    if (!made.has(m)) {
      const metal = /Engines|gear|wheel/.test(m.name);
      const mat = new THREE.MeshPhysicalMaterial({
        map: m.map, color: m.color, roughness: metal ? 0.45 : 0.38, metalness: metal ? 0.55 : 0.05, clearcoat: metal ? 0.2 : 0.6, clearcoatRoughness: 0.2,
      });
      made.set(m, mat);
    }
    o.material = made.get(m);
  }
  meshes.forEach(o => { o.castShadow = true; o.frustumCulled = false; }); // never culled: the jet is always drawn when visible
  window.loader.set(0.8);

  jet.updateMatrixWorld(true);
  floorY = new THREE.Box3().setFromObject(jet, true).min.y;   // wheels on the floor
  await Promise.all([drawPoster(), loadBlueprint().catch(e => console.warn('blueprint', e))]);
  window.loader.set(0.9); window.loader.msg('Warming up the engines');
  await warmUp();
  layout();
  loaded = true;
  window.loader.done();
  // handy for debugging in the browser console: goTo('cruise')
  window.goTo = key => { const sec = sections.find(s => s.dataset.key === key); const y = sec.getBoundingClientRect().top + scrollY + sec.offsetHeight / 2 - innerHeight / 2; lenis ? lenis.scrollTo(y, { immediate: true }) : scrollTo(0, y); };
  window.scrollToY = f => { const y = f * (document.documentElement.scrollHeight - innerHeight); lenis ? lenis.scrollTo(y, { immediate: true }) : scrollTo(0, y); };
  window.goKey = (name, f = 0.5) => { const st = stops.find(s => s.name === name); const y = st.y0 < -1e8 ? 0 : st.y1 > 1e8 ? st.y0 + 50 : lerp(st.y0, st.y1, f); lenis ? lenis.scrollTo(y, { immediate: true }) : scrollTo(0, y); };
  window.goBetween = (a, b, f) => { const A = stops.find(s => s.name === a), B = stops.find(s => s.name === b); const y = lerp(A.y1, B.y0, f); lenis ? lenis.scrollTo(y, { immediate: true }) : scrollTo(0, y); };
  window.ready = true;
}

// Compile every shader and upload every texture before the page appears, with everything that can ever be
// shown switched on, so nothing has to get ready (and blink) in the middle of a scroll.
async function warmUp() {
  const show = [poster, blueprint, streaks, floor, shadow, runway, jet, ...flames];
  const was = show.map(o => o.visible);
  show.forEach(o => { o.visible = true; });
  legs.forEach(l => { l.pivot.visible = true; });
  flameU.uI.value = 1; heatU.uHeat.value = 1;
  camera.position.set(14, 8, 14); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  try { await renderer.compileAsync(scene, camera); } catch { renderer.compile(scene, camera); }
  renderer.shadowMap.needsUpdate = true;
  composer.render();                                                  // first real frame: uploads textures, shadow map
  show.forEach((o, i) => { o.visible = was[i]; });
  window.loader.set(1);
}

/* ----------------------------------------------------------- 7. AUTO-PLAY */
// Glides through the whole story: a pause on each chapter so its text can be read, smooth moves between
// them, ending on the closing poster. Any wheel, touch, key or the Stop button hands control back.
let touring = false;
const tourBtn = document.getElementById('tourBtn'), tourStop = document.getElementById('tourStop');
const setY = y => (lenis ? lenis.scrollTo(y, { immediate: true, force: true }) : scrollTo(0, y));
function tourPlan() {
  const max = document.documentElement.scrollHeight - innerHeight, vh = innerHeight;
  const clampY = y => Math.min(max, Math.max(0, y));
  // pauses: the holds of chapters that show text. Not the opening poster (start moving at once) and not the
  // closing poster (it rolls through to the end in one smooth move, like end credits).
  const holds = stops
    .filter(st => st.y1 > st.y0 + 1 && st.y0 > 0 && st.name !== 'finale')
    .map(st => [clampY(st.y0), clampY(st.y1)])
    .sort((a, b) => a[0] - b[0]);
  const legs = [];
  let y = 0;
  for (const [a, b] of holds) {
    if (a < y + 1) continue;
    const first = !legs.length, d = (a - y) / vh;
    legs.push({ from: y, to: a, dur: Math.min(7, Math.max(first ? 1.8 : 2.2, d * 1.6)), ease: first ? 'out' : 'inout' });
    legs.push({ from: a, to: b, dur: Math.max(3.4, (b - a) / vh * 2.4), ease: 'linear' }); // slow glide while reading
    y = b;
  }
  if (max > y + 1) legs.push({ from: y, to: max, dur: Math.min(14, Math.max(5, (max - y) / vh * 2)), ease: 'inout' }); // the finale roll
  return legs;
}
const EASE = { linear: t => t, inout: smooth, out: t => 1 - (1 - t) ** 3 };
let route = [], leg = 0, legT0 = 0;
function startTour() {
  if (touring) return;
  touring = true; tourStop.classList.add('on'); tourStop.focus({ preventScroll: true });
  cancelLoop();
  route = tourPlan(); leg = 0; legT0 = performance.now();
  if (scrollY > 2) route.unshift({ from: scrollY, to: route[0]?.from ?? 0, dur: 1.5, ease: 'inout' });
  const step = now => {
    if (!touring) return;
    const L = route[leg];
    if (!L) { stopTour(); startLoop(); return; }                    // finished: on the final page, offer a replay
    const t = Math.min(1, (now - legT0) / 1000 / L.dur);
    setY(lerp(L.from, L.to, EASE[L.ease](t)));
    if (t >= 1) { leg++; legT0 = now; }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
// The window changed size mid-tour (e.g. full screen): re-plan the route and carry on from where we are.
function retargetTour() {
  if (!touring) return;
  const y = scrollY, fresh = tourPlan();
  const i = fresh.findIndex(l => l.to > y + 1);
  if (i < 0) { route = []; leg = 0; return; }
  const L = fresh[i];
  fresh[i] = { ...L, from: y, dur: Math.max(0.8, L.dur * (L.to - y) / Math.max(1, L.to - L.from)) };
  route = fresh.slice(i); leg = 0; legT0 = performance.now();
}
function stopTour() {
  touring = false; tourStop.classList.remove('on');
}
// After a full run: a 10 second countdown, then fade to black and play again (a moving wallpaper).
// "Stay on this page", or any scroll, touch or key, cancels it and leaves the final poster on screen.
const LOOP_SECONDS = 10;
const loopBar = document.getElementById('loopBar'), loopN = document.getElementById('loopN'), loopFill = document.getElementById('loopFill');
const fade = document.getElementById('fade');
let loopTimer = null;
function startLoop() {
  cancelLoop();
  const t0 = performance.now();
  loopBar.classList.add('on');
  loopTimer = setInterval(() => {
    const left = Math.max(0, LOOP_SECONDS - (performance.now() - t0) / 1000);
    loopN.textContent = Math.ceil(left);
    loopFill.style.transform = `scaleX(${left / LOOP_SECONDS})`;
    if (left <= 0) { cancelLoop(); replay(); }
  }, 100);
}
function cancelLoop() {
  clearInterval(loopTimer); loopTimer = null; loopBar.classList.remove('on');
  loopN.textContent = LOOP_SECONDS; loopFill.style.transform = 'scaleX(1)';
}
function replay() {
  fade.classList.add('on');
  setTimeout(() => {                                                 // under black: back to the top, let the scene settle
    setY(0);
    setTimeout(() => { fade.classList.remove('on'); startTour(); }, 900);
  }, 900);
}
/* Full screen: a toggle in the corner, plus "Full-screen tour" (full screen + auto-play) on the opening screen.
   Hidden where the browser doesn't allow it (e.g. iPhone Safari, which only does full screen for video). */
const fsBtn = document.getElementById('fsBtn'), fsTourBtn = document.getElementById('fsTourBtn');
const root = document.documentElement;
const fsSupported = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
const enterFS = () => Promise.resolve((root.requestFullscreen || root.webkitRequestFullscreen).call(root, { navigationUI: 'hide' }));
const exitFS = () => Promise.resolve((document.exitFullscreen || document.webkitExitFullscreen).call(document));
if (!fsSupported) { fsBtn.hidden = true; fsTourBtn.hidden = true; }
let fsFadeTimer;
const syncFS = () => {
  const on = !!fsElement();
  // brief fade to black while the page re-measures at the new size, so the switch never shows a half-updated frame
  fade.classList.add('on'); clearTimeout(fsFadeTimer);
  fsFadeTimer = setTimeout(() => fade.classList.remove('on'), 650);
  fsBtn.setAttribute('aria-pressed', on);
  fsBtn.querySelector('span').textContent = on ? 'Exit full screen' : 'Full screen';
  fsBtn.classList.toggle('active', on);
};
document.addEventListener('fullscreenchange', syncFS);
document.addEventListener('webkitfullscreenchange', syncFS);
fsBtn.addEventListener('click', () => (fsElement() ? exitFS() : enterFS()).catch(() => {}));
fsTourBtn.addEventListener('click', () => {
  enterFS().catch(() => {}).finally(() => setTimeout(startTour, 450)); // let the page re-measure at the new size first
});
tourBtn.addEventListener('click', startTour);
tourStop.addEventListener('click', stopTour);
document.getElementById('loopStay').addEventListener('click', cancelLoop);
for (const ev of ['wheel', 'touchstart', 'keydown']) addEventListener(ev, e => {
  const onButton = ev === 'keydown' && (e.key === 'Enter' || e.key === ' ') && (e.target === tourStop || e.target.id === 'loopStay');
  if (onButton) return;
  if (touring) stopTour();
  if (loopTimer) cancelLoop();
}, { passive: true });

// Re-measure whenever anything could move the sections: window size, web fonts arriving, content reflow.
let relayoutTimer;
const relayout = () => { clearTimeout(relayoutTimer); relayoutTimer = setTimeout(() => { if (loaded) { lenis?.resize(); layout(); retargetTour(); } }, 120); };
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  relayout();
});
new ResizeObserver(relayout).observe(story);
document.fonts?.ready.then(relayout);
