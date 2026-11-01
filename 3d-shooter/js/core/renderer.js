/* =========================================================================
   renderer.js
   WebGL 渲染器 / 场景 / 双相机 / 渲染目标 / 后处理链
   移动端自适应
   ========================================================================= */
"use strict";

const canvas   = document.getElementById('c');

/* ★ 移动端检测 */
const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent)
                || (navigator.maxTouchPoints > 1 && innerWidth < 1400);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: 'high-performance',
  stencil: false
});

/* ★ 画质系统：DPR / 分辨率比例 / 阴影全部由 settings.js 的 QUALITY_PRESETS 驱动。
   DPR 改为 let，便于 applyQualityPreset() 在运行时改写。 */
let DPR = Math.min(window.devicePixelRatio || 1, IS_MOBILE ? 1.0 : 1.5);
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight);
renderer.autoClear = false;

renderer.shadowMap.enabled = !IS_MOBILE;
renderer.shadowMap.type = IS_MOBILE ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;

const isGL2      = renderer.capabilities.isWebGL2;
const MAXANISO   = renderer.capabilities.getMaxAnisotropy();

const FOG_COLOR = 0xa39b8d;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0074);

const BASE_FOV = 75;
const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.14, 400);
camera.rotation.order = 'YXZ';

const vmScene = new THREE.Scene();
const VM_FOV = 41.9;
const VM_ADS_DOLLY = 0.58;
const vmCamera = new THREE.PerspectiveCamera(VM_FOV, innerWidth / innerHeight, 0.008, 12);

const vmAmb  = new THREE.AmbientLight(0x9b9a96, 0.40); vmScene.add(vmAmb);
const vmKey  = new THREE.DirectionalLight(0xffeed6, 1.52); vmKey.position.set(-0.6, 1.1, 0.9); vmScene.add(vmKey);
const vmFill = new THREE.DirectionalLight(0x7f8894, 0.38); vmFill.position.set(1.0, -0.3, 0.4); vmScene.add(vmFill);
const vmRim  = new THREE.DirectionalLight(0xe2e4e6, 0.42); vmRim.position.set(0.2, 0.4, -1.0); vmScene.add(vmRim);
const VM_LIGHT_BASE = { amb: 0.40, key: 1.52, fill: 0.38, rim: 0.42 };

const rtType = isGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType;

/* ------------------------------------------------------------------ *
 *  render target —— MSAA 采样数由 SET.aaSamples 驱动
 * ------------------------------------------------------------------ */
function makeRT(w, h, depth){
  const opts = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: rtType,
    depthBuffer: !!depth,
    stencilBuffer: false
  };
  if (depth && isGL2 && THREE.WebGLMultisampleRenderTarget){
    const rt = new THREE.WebGLMultisampleRenderTarget(w, h, opts);
    let s = 4;
    if (typeof SET !== 'undefined' && SET.aaSamples) s = SET.aaSamples;
    rt.samples = Math.min(16, Math.max(1, s | 0));
    return rt;
  }
  return new THREE.WebGLRenderTarget(w, h, opts);
}

let sceneRT, bloomA, bloomB, RTW, RTH;
let renderScale = 1.0;
/* 画质档位锁：非 null 时自适应分辨率不再介入（由 settings.js 控制） */
let qualityLock = null;

const SCALE_STEPS = IS_MOBILE
  ? [0.75, 0.65, 0.55, 0.45]
  : [1.0, 0.88, 0.76, 0.64, 0.55];
let scaleIdx = 0;

function allocTargets(){
  RTW = Math.max(2, Math.floor(innerWidth  * DPR * renderScale));
  RTH = Math.max(2, Math.floor(innerHeight * DPR * renderScale));
  if (sceneRT) { sceneRT.dispose(); bloomA.dispose(); bloomB.dispose(); }

  sceneRT = makeRT(RTW, RTH, true);
  const bw = Math.max(2, RTW >> 2);
  const bh = Math.max(2, RTH >> 2);
  bloomA = makeRT(bw, bh, false);
  bloomB = makeRT(bw, bh, false);

  if (allocTargets.onResize) allocTargets.onResize();
}
allocTargets();

/* ------------------------------------------------------------------ *
 *  graphics / performance
 *  子项独立生效：SET.renderScale / SET.shadowQuality /
 *  SET.modelQuality / SET.aaSamples
 * ------------------------------------------------------------------ */
const SHADOW_SIZES = { off: 0, low: 512, medium: 1024, high: 2048, ultra: 4096 };

function applyShadowQuality(level){
  const size = SHADOW_SIZES[level] || 0;
  const enabled = size > 0;

  let type = THREE.PCFSoftShadowMap;
  if (level === 'off')          type = THREE.BasicShadowMap;
  else if (level === 'low')     type = THREE.PCFShadowMap;
  else if (level === 'medium')  type = THREE.PCFShadowMap;

  const prevEnabled = renderer.shadowMap.enabled;
  const prevType    = renderer.shadowMap.type;

  renderer.shadowMap.enabled = enabled;
  renderer.shadowMap.type    = type;

  if (typeof sun !== 'undefined' && sun.shadow){
    sun.castShadow = enabled;
    const target = enabled ? size : 1024;
    if (sun.shadow.mapSize.x !== target){
      sun.shadow.mapSize.set(target, target);
      if (sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
  }

  if (prevEnabled !== enabled || prevType !== type){
    const markAll = (root) => {
      if (!root || !root.traverse) return;
      root.traverse(o => {
        if (o.isMesh && o.material){
          const arr = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of arr) if (m) m.needsUpdate = true;
        }
      });
    };
    try { markAll(typeof scene   !== 'undefined' ? scene   : null); } catch(e){}
    try { markAll(typeof vmScene !== 'undefined' ? vmScene : null); } catch(e){}
  }
  renderer.shadowMap.needsUpdate = true;
}

function applyModelQuality(level){
  let aniso = Math.max(1, Math.min(16, Math.round(+level || 1)));
  let maxA = 16;
  try {
    if (renderer && renderer.capabilities && renderer.capabilities.getMaxAnisotropy){
      maxA = renderer.capabilities.getMaxAnisotropy() || 16;
    }
  } catch (e){}
  aniso = Math.min(aniso, maxA);

  const seen = new Set();
  const scan = (root) => {
    if (!root || !root.traverse) return;
    root.traverse(o => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats){
        if (!m) continue;
        for (const k of ['map','emissiveMap','alphaMap','normalMap','roughnessMap','metalnessMap']){
          const t = m[k];
          if (t && t.isTexture && !seen.has(t)){
            seen.add(t);
            if (t.anisotropy !== aniso){ t.anisotropy = aniso; t.needsUpdate = true; }
          }
        }
      }
    });
  };
  try { scan(typeof scene   !== 'undefined' ? scene   : null); } catch(e){}
  try { scan(typeof vmScene !== 'undefined' ? vmScene : null); } catch(e){}
  try {
    if (typeof TEX !== 'undefined'){
      for (const k in TEX){
        const t = TEX[k];
        if (t && t.isTexture && !seen.has(t)){
          seen.add(t);
          if (t.anisotropy !== aniso){ t.anisotropy = aniso; t.needsUpdate = true; }
        }
      }
    }
  } catch(e){}
}

function applyQualityPreset(q){
  if (!q) return;
  qualityLock = q.key || 'custom';

  DPR = Math.min(window.devicePixelRatio || 1, q.dpr || 1.0);
  renderer.setPixelRatio(DPR);
  renderer.setSize(innerWidth, innerHeight);

  renderScale = (typeof SET !== 'undefined' && SET.renderScale != null)
    ? SET.renderScale
    : (q.renderScale || 1.0);
  allocTargets();

  applyShadowQuality((typeof SET !== 'undefined' && SET.shadowQuality) || 'high');
  applyModelQuality((typeof SET !== 'undefined' && SET.modelQuality) || 8);
}

/* --------------------------------------------------------------------------
   自适应分辨率 —— 仅在画质未被锁定（qualityLock === null）时生效
   -------------------------------------------------------------------------- */
const adaptive = (() => {
  const N = 48;
  const ring   = new Float32Array(N).fill(16);
  const sorted = new Float32Array(N);
  let head = 0, filled = 0, hold = 1.5;
  let pending = 0, floorIdx = SCALE_STEPS.length - 1;

  return function(dt){
    /* ★ 玩家选择了固定画质档位，不再自动降分辨率 */
    if (qualityLock) return;

    ring[head] = dt * 1000;
    head = (head + 1) % N;
    if (filled < N){ filled++; return; }
    hold -= dt;
    if (hold > 0) return;

    sorted.set(ring);
    Array.prototype.sort.call(sorted, (a, b) => a - b);
    const med = sorted[N >> 1];

    if (pending){
      if (med > pending * 0.94){
        floorIdx = Math.max(0, scaleIdx - 1);
        scaleIdx = floorIdx;
        renderScale = SCALE_STEPS[scaleIdx];
        allocTargets();
      }
      pending = 0;
      hold = 3.0;
      return;
    }

    if (med > 20.5 && scaleIdx < floorIdx){
      pending = med;
      scaleIdx++; renderScale = SCALE_STEPS[scaleIdx];
      allocTargets();
      hold = 2.5;
    } else if (med < 11.5 && scaleIdx > 0){
      scaleIdx--; renderScale = SCALE_STEPS[scaleIdx];
      allocTargets();
      hold = 4.0;
    } else {
      hold = 1.0;
    }
  };
})();

/* --------------------------------------------------------------------------
   全屏四边形
   -------------------------------------------------------------------------- */
const fsScene = new THREE.Scene();
const fsCam   = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const fsQuad  = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
fsQuad.frustumCulled = false;
fsScene.add(fsQuad);

const FS_VERT = `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

function postMat(frag, uniforms){
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: FS_VERT,
    fragmentShader: frag,
    depthTest: false,
    depthWrite: false
  });
}

function blit(mat, target){
  fsQuad.material = mat;
  renderer.setRenderTarget(target || null);
  renderer.render(fsScene, fsCam);
}

/* Pass 1：亮度阈值 */
const brightMat = postMat(`
  uniform sampler2D tDiffuse;
  uniform float threshold;
  uniform float knee;
  varying vec2 vUv;
  void main(){
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    float l = max(c.r, max(c.g, c.b));
    float s = smoothstep(threshold, threshold + knee, l);
    gl_FragColor = vec4(c * s, 1.0);
  }`, {
  tDiffuse:  { value: null },
  threshold: { value: 0.95 },
  knee:      { value: 0.55 }
});

/* Pass 2：9-tap 高斯模糊 */
const blurMat = postMat(`
  uniform sampler2D tDiffuse;
  uniform vec2 dir;
  varying vec2 vUv;
  void main(){
    vec3 c = vec3(0.0);
    c += texture2D(tDiffuse, vUv + dir * -4.0).rgb * 0.0162;
    c += texture2D(tDiffuse, vUv + dir * -3.0).rgb * 0.0540;
    c += texture2D(tDiffuse, vUv + dir * -2.0).rgb * 0.1216;
    c += texture2D(tDiffuse, vUv + dir * -1.0).rgb * 0.1946;
    c += texture2D(tDiffuse, vUv                ).rgb * 0.2270;
    c += texture2D(tDiffuse, vUv + dir *  1.0).rgb * 0.1946;
    c += texture2D(tDiffuse, vUv + dir *  2.0).rgb * 0.1216;
    c += texture2D(tDiffuse, vUv + dir *  3.0).rgb * 0.0540;
    c += texture2D(tDiffuse, vUv + dir *  4.0).rgb * 0.0162;
    gl_FragColor = vec4(c, 1.0);
  }`, {
  tDiffuse: { value: null },
  dir:      { value: new THREE.Vector2() }
});

/* Pass 3：合成 */
const compMat = postMat(`
  uniform sampler2D tScene, tBloom;
  uniform vec2  res;
  uniform float time, bloom, vig, dmg, low, ab, flash, scope, uExpo, uLgt;
  varying vec2 vUv;

  vec3 aces(vec3 x){
    const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }
  float hash(vec2 p){
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main(){
    vec2 uv = vUv;
    vec2 d  = uv - 0.5;
    float r2 = dot(d, d);

    float chroma = (ab + dmg * 0.9) * 0.02;
    vec3 col;
    col.r = texture2D(tScene, uv - d * chroma * r2).r;
    col.g = texture2D(tScene, uv).g;
    col.b = texture2D(tScene, uv + d * chroma * r2).b;

    col += texture2D(tBloom, uv).rgb * bloom;
    col += flash + uLgt;

    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(lum), col, 0.78);
    float sh = 1.0 - smoothstep(0.0, 0.34, lum);
    float hi = smoothstep(0.30, 0.95, lum);
    col *= mix(vec3(1.0), vec3(0.945, 0.985, 1.095), sh);
    col *= mix(vec3(1.0), vec3(1.075, 1.012, 0.925), hi);
    col = aces(col * uExpo);

    col = col * col * (3.0 - 2.0 * col) * 0.34 + col * 0.66;
    col = (col - 0.5) * 1.07 + 0.5;
    col = col * 0.955 + vec3(0.0155, 0.0180, 0.0225);

    if (scope > 0.001){
      float rr = length(d * vec2(res.x / res.y, 1.0)) / 0.36;
      vec3 g = col;
      g = (g - 0.5) * 1.05 + 0.5;
      g += vec3(0.013, 0.014, 0.018);
      g *= 1.06;
      float glum = dot(g, vec3(0.2126, 0.7152, 0.0722));
      g = mix(vec3(glum), g, 1.06);
      g *= vec3(0.975, 0.995, 1.035);
      g *= 1.0 - 0.20 * smoothstep(0.58, 1.0, rr);
      g += vec3(0.06, 0.02, -0.04) * smoothstep(0.80, 1.0, rr) * 0.5;
      col = mix(col, g, scope);
    }

    col = mix(col, vec3(0.52, 0.02, 0.02), dmg * 0.42);
    float edge = smoothstep(0.05, 0.30, r2);
    col = mix(col, mix(col, vec3(0.42, 0.0, 0.0), 0.8), low * edge);

    float vg = 1.0 - smoothstep(0.09, 0.52, r2 * 1.5);
    col *= mix(1.0, 0.40 + 0.60 * vg, vig * (1.0 - scope));

    col += (hash(uv * res + fract(time) * vec2(37.0, 17.0)) - 0.5) * 0.030;

    gl_FragColor = vec4(pow(max(col, 0.0), vec3(0.4545)), 1.0);
  }`, {
  tScene: { value: null },
  tBloom: { value: null },
  res:    { value: new THREE.Vector2() },
  time:   { value: 0 },
  bloom:  { value: 0.60 },
  vig:    { value: 1.0 },
  dmg:    { value: 0 },
  low:    { value: 0 },
  ab:     { value: 0.5 },
  flash:  { value: 0 },
  scope:  { value: 0 },
  uExpo:  { value: 1.14 },
  uLgt:   { value: 0 }
});