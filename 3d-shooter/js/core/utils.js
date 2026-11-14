/* =========================================================================
   utils.js
   全局辅助函数 / 数学工具 / 几何合并 / 错误兜底

   这是所有模块的根：clamp / lerp / rand / damp / sRGB / mergeGeoms
   在后续几乎所有文件里都会被引用，必须在 index.html 中最先加载。
   ========================================================================= */
"use strict";

/* --------------------------------------------------------------------------
   错误兜底 —— 任何未捕获异常直接打到屏幕底部
   -------------------------------------------------------------------------- */
(function(){
  const box = document.getElementById('err');
  if (!box) return;

  function shortSrc(url){
    if (!url) return '?';
    const parts = url.split('/');
    return parts.slice(-2).join('/');           // 保留目录名 + 文件名
  }

  function show(msg){
    box.style.display = 'block';
    box.textContent += msg + "\n";
    /* 只保留最近 20 行，防止长跑之后堆满 */
    const lines = box.textContent.split('\n');
    if (lines.length > 20) box.textContent = lines.slice(-20).join('\n');
  }

  window.addEventListener('error', e => {
  // 如果控制台开启了屏蔽，直接跳过
  if (window.__hideErrUI) return;
  // 忽略音频文件找不到的报错，防止刷屏
  if (e.message && e.message.includes('no supported source')) return;
  show(`⛔ ${shortSrc(e.filename)}:${e.lineno} — ${e.message}`);
});

window.addEventListener('unhandledrejection', e => {
  if (window.__hideErrUI) return;
  const msg = e.reason && e.reason.message ? e.reason.message : String(e.reason);
  if (msg.includes('no supported source') || msg.includes('play() failed')) return;
  show(`⛔ promise — ${msg}`);
});
})();

if (typeof THREE === 'undefined') {
  const boot = document.getElementById('boot');
  if (boot) boot.textContent = 'FAILED TO LOAD THREE.JS — CHECK NETWORK';
  throw new Error('three.js missing');
}

/* --------------------------------------------------------------------------
   数学与随机
   -------------------------------------------------------------------------- */
const clamp = THREE.MathUtils.clamp;
const lerp  = THREE.MathUtils.lerp;
const PI    = Math.PI;

let perfNow = performance.now();

const rand  = (a, b)  => a + Math.random() * (b - a);
const randI = (a, b)  => Math.floor(rand(a, b + 1));
const pick  = arr     => arr[(Math.random() * arr.length) | 0];

const damp = (cur, tgt, lambda, dt) => lerp(cur, tgt, 1 - Math.exp(-lambda * dt));

const easeOutCubic   = t => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/* --------------------------------------------------------------------------
   色彩空间
   -------------------------------------------------------------------------- */
const sRGB = hex => new THREE.Color(hex).convertSRGBToLinear();

function linearizeMats(dict){
  for (const k in dict){
    const m = dict[k];
    if (m && m.color)    m.color.convertSRGBToLinear();
    if (m && m.emissive) m.emissive.convertSRGBToLinear();
  }
  return dict;
}

/* --------------------------------------------------------------------------
   几何合并
   -------------------------------------------------------------------------- */
function mergeGeoms(list){
  const geos = list.map(g => g.index ? g.toNonIndexed() : g);
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;

  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const uv  = new Float32Array(n * 2);

  let po = 0, uo = 0;
  for (const g of geos){
    pos.set(g.attributes.position.array, po);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, po);
    if (g.attributes.uv)     uv.set(g.attributes.uv.array, uo);
    po += g.attributes.position.count * 3;
    uo += g.attributes.position.count * 2;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal',   new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv',       new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

/* --------------------------------------------------------------------------
   便捷的几何/材质构造器
   -------------------------------------------------------------------------- */
const B    = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const CYL  = (r1, r2, h, s) => new THREE.CylinderGeometry(r1, r2, h, s || 10);
const CYLZ = (r1, r2, h, s) => { const g = CYL(r1, r2, h, s); g.rotateX(PI / 2); return g; };

const TUBEZ = (r, h, s) => {
  const g = new THREE.CylinderGeometry(r, r, h, s || 16, 1, true);
  g.rotateX(PI / 2);
  return g;
};

function part(parent, geo, mat, x, y, z, rx, ry, rz, sx, sy, sz){
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x || 0, y || 0, z || 0);
  m.rotation.set(rx || 0, ry || 0, rz || 0);
  if (sx !== undefined) m.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz);
  parent.add(m);
  return m;
}

/* --------------------------------------------------------------------------
   2D 画布与贴图工具
   -------------------------------------------------------------------------- */
function cvs(size){
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function finishTex(c, rep, srgb){
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (rep) t.repeat.set(rep[0], rep[1]);
  t.anisotropy = MAXANISO;
  if (srgb !== false) t.encoding = THREE.sRGBEncoding;
  return t;
}

function grain(ctx, size, amt){
  const img = ctx.getImageData(0, 0, size, size), d = img.data;
  for (let i = 0; i < d.length; i += 4){
    const n = (Math.random() - 0.5) * amt;
    d[i]   = clamp(d[i]   + n, 0, 255);
    d[i+1] = clamp(d[i+1] + n, 0, 255);
    d[i+2] = clamp(d[i+2] + n, 0, 255);
  }
  ctx.putImageData(img, 0, 0);
}

function splotches(ctx, size, n, colors, rMin, rMax, alpha){
  for (let i = 0; i < n; i++){
    const x = Math.random() * size, y = Math.random() * size, r = rand(rMin, rMax);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const col = pick(colors);
    g.addColorStop(0, `rgba(${col},${alpha})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
}