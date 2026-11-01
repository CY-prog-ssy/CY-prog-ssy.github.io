'use strict';
// ============================================================
//  程序化纹理：全部用 Canvas 2D 实时绘制，无外部素材
// ============================================================

const TS = 512;

const TEX = {
  L0_WALL: 0, L0_FLOOR: 1, L0_CEIL: 2, LIGHT: 3, LIGHT_OFF: 4,
  L1_WALL: 5, L1_FLOOR: 6, L1_CEIL: 7, CRATE: 8,
  L2_WALL: 9, L2_FLOOR: 10, L2_CEIL: 11, PIPE: 12,
  LR_WALL: 13, LR_FLOOR: 14,
  DOOR: 15, SIGN: 16,
  ALMOND: 17, BATTERY: 18,
  SMILER: 19, HOUND: 20, HOUND_EYES: 21, STALKER: 22, STALKER_EYES: 23,
  L1_COLUMN: 24, L1_BEAM: 25, PIPE_PAINT: 26, PIPE_INSUL: 27, BULB: 28, METAL: 29, VALVE: 30,
  // 以下图层使用抖动透明（贴花、水洼、蒸汽）
  PUDDLE: 31, OOZE: 32, DECAL: 33, STEAM: 34,
  // 以下均为不透明图层（抖动阈值 < 1，不会被裁掉）
  L4_WALL: 35, L4_FLOOR: 36, L4_CEIL: 37, DESK: 38, PARTITION: 39, MONITOR: 40, WINDOW: 41,
  L15_WALL: 42, L15_FLOOR: 43, L15_CEIL: 44, HDOOR: 45, PICTURE: 46,
  L3_WALL: 47, ELECBOX: 48, GENERATOR: 49, CONVEYOR: 50, INDICATOR: 51, STAIRS: 52,
  L37_TILE: 53, L37_WALL: 54, WATER: 55,
  L26_WALL: 56, L26_FLOOR: 57, L26_CEIL: 58, CAKE: 59, CLOTH: 60, BALLOON: 61, PARTY: 62, REV_POSTER: 63, PARTYGOER: 64,
  WIRE: 65,
  POOL_COLORS: 66, POOL_SKY: 67,
  OFFICE_PARTS: 68, KEYBOARD: 69, PC_FRONT: 70, VENDING: 71, WINDOW_BLACK: 72,
  SAND: 73, CLIFF: 74, EXIST_GATE: 75, SEA: 76, FOOTPRINT: 77,
  SURVIVOR: 78,
  COUNT: 79,
};
// PARTY 图集：两种笑脸海报 / 喷涂的“=)” / 三角彩旗
const PARTY_UV = { poster1: [0, 0, 0.5, 0.5], poster2: [0.5, 0, 1, 0.5], smile: [0, 0.5, 0.5, 1], bunting: [0.5, 0.5, 1, 1] };
// PICTURE 图集的四个象限
const PICTURE_UV = [[0, 0, 0.5, 0.5], [0.5, 0, 1, 0.5], [0, 0.5, 0.5, 1], [0.5, 0.5, 1, 1]];
const DITHER_FROM = TEX.PUDDLE;
// DECAL 图集的四个象限：u0 v0 u1 v1
const DECAL_UV = {
  spall: [0, 0, 0.5, 0.5], arrow: [0.5, 0, 1, 0.5], leak: [0, 0.5, 0.5, 1], tally: [0.5, 0.5, 1, 1],
};

function newCanvas(w = TS, h = TS) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

const _noiseCache = new Map();
// 可平铺的分形值噪声，返回 [0,1]。cellsY 用于非正方形映射的纹理（例如 2m 宽 × 4.2m 高的墙）
function periodicNoise(cells, seed, oct = 4, pers = 0.5, cellsY = cells) {
  const key = cells + ':' + cellsY + ':' + seed + ':' + oct + ':' + pers;
  if (_noiseCache.has(key)) return _noiseCache.get(key);
  const out = new Float32Array(TS * TS);
  let amp = 1, total = 0;
  for (let o = 0; o < oct; o++) {
    const P = cells << o, PY = cellsY << o;
    const lat = new Float32Array(P * PY);
    for (let i = 0; i < P * PY; i++) lat[i] = rand01(i % P, (i / P) | 0, seed + o * 101);
    const xs0 = new Int32Array(TS), xs1 = new Int32Array(TS), sxs = new Float32Array(TS);
    for (let x = 0; x < TS; x++) {
      const fx = (x / TS) * P, xi = Math.floor(fx), t = fx - xi;
      xs0[x] = xi % P; xs1[x] = (xi + 1) % P; sxs[x] = t * t * (3 - 2 * t);
    }
    for (let y = 0; y < TS; y++) {
      const fy = (y / TS) * PY, yi = Math.floor(fy), ty = fy - yi, sy = ty * ty * (3 - 2 * ty);
      const r0 = (yi % PY) * P, r1 = ((yi + 1) % PY) * P;
      for (let x = 0; x < TS; x++) {
        const sx = sxs[x];
        const a = lat[r0 + xs0[x]], b = lat[r0 + xs1[x]], c = lat[r1 + xs0[x]], d = lat[r1 + xs1[x]];
        const top = a + (b - a) * sx, bot = c + (d - c) * sx;
        out[y * TS + x] += amp * (top + (bot - top) * sy);
      }
    }
    total += amp; amp *= pers;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  _noiseCache.set(key, out);
  return out;
}

function eachPixel(g, fn) {
  const img = g.getImageData(0, 0, TS, TS), d = img.data;
  for (let i = 0, p = 0; i < TS * TS; i++, p += 4) fn(d, p, i, i % TS, (i / TS) | 0);
  g.putImageData(img, 0, 0);
}

// 为可平铺纹理在 9 个位置重复绘制
function wrapDraw(fn) {
  for (let dx = -TS; dx <= TS; dx += TS) for (let dy = -TS; dy <= TS; dy += TS) fn(dx, dy);
}

// ------------------------------------------------------------
//  LEVEL 0：单调黄色墙纸、潮湿地毯、吊顶
// ------------------------------------------------------------
function texL0Wall() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(196,183,120)';
  g.fillRect(0, 0, TS, TS);
  for (let x = 0; x < TS; x += 32) {
    g.fillStyle = 'rgba(120,96,30,0.075)';
    g.fillRect(x, 0, 13, TS);
    g.fillStyle = 'rgba(255,246,190,0.07)';
    g.fillRect(x + 20, 0, 2, TS);
  }
  // 细小的菱形花纹
  g.fillStyle = 'rgba(105,85,25,0.10)';
  for (let y = 0; y < TS; y += 24) {
    for (let x = 0; x < TS; x += 32) {
      const cx = x + 26, cy = y + ((x / 32) % 2) * 12;
      g.beginPath();
      g.moveTo(cx, cy - 4); g.lineTo(cx + 3, cy); g.lineTo(cx, cy + 4); g.lineTo(cx - 3, cy);
      g.closePath(); g.fill();
    }
  }
  const n1 = periodicNoise(4, 11, 5), n2 = periodicNoise(2, 12, 4), n3 = periodicNoise(16, 13, 2);
  eachPixel(g, (d, p, i, x, y) => {
    const v = y / TS;
    const grain = (rand01(i, 5, 1) - 0.5) * 9;
    const m = 0.9 + n1[i] * 0.18 + (n3[i] - 0.5) * 0.05;
    const topMask = smoothstep(0.32, 0.0, v), botMask = smoothstep(0.72, 1.0, v);
    let stain = smoothstep(0.52, 0.7, n2[i]) * (topMask * 0.95 + botMask * 0.75) + smoothstep(0.74, 0.86, n2[i]) * 0.35;
    stain = Math.min(stain, 1);
    const k = m * (1 - stain * 0.32);
    d[p] = d[p] * k + grain - stain * 6;
    d[p + 1] = d[p + 1] * k + grain - stain * 12;
    d[p + 2] = d[p + 2] * k * (1 - stain * 0.25) + grain;
  });
  // 水渍流痕
  const r = mulberry32(99);
  for (let k = 0; k < 9; k++) {
    const x = 10 + r() * (TS - 20), len = 40 + r() * 190, w = 1.5 + r() * 4;
    const gr = g.createLinearGradient(0, 0, 0, len);
    gr.addColorStop(0, 'rgba(90,70,20,0.16)');
    gr.addColorStop(1, 'rgba(90,70,20,0)');
    g.fillStyle = gr;
    g.fillRect(x, 0, w, len);
  }
  // 踢脚线
  const bb = Math.round(TS * 0.955);
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(0, bb - 4, TS, 4);
  g.fillStyle = 'rgb(146,124,76)';
  g.fillRect(0, bb, TS, TS - bb);
  g.fillStyle = 'rgba(255,238,200,0.28)';
  g.fillRect(0, bb, TS, 2);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, TS - 4, TS, 4);
  return c;
}

function texL0Floor() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(146,124,74)';
  g.fillRect(0, 0, TS, TS);
  const n1 = periodicNoise(16, 21, 3), n2 = periodicNoise(3, 22, 4), n3 = periodicNoise(64, 23, 1);
  eachPixel(g, (d, p, i, x, y) => {
    const fiber = (rand01(i, 7, 2) - 0.5) * 30;
    const weave = ((x + y) & 3) < 2 ? 1.035 : 0.965;
    const m = (0.86 + n1[i] * 0.26) * weave * (0.94 + n3[i] * 0.12);
    const damp = smoothstep(0.5, 0.82, n2[i]);
    const k = m * (1 - damp * 0.2);
    d[p] = d[p] * k + fiber;
    d[p + 1] = d[p + 1] * k + fiber * 0.9;
    d[p + 2] = d[p + 2] * k * (1 - damp * 0.1) + fiber * 0.6;
  });
  return c;
}

function texL0Ceil() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(222,216,192)';
  g.fillRect(0, 0, TS, TS);
  const n1 = periodicNoise(8, 31, 4), n2 = periodicNoise(2, 32, 4);
  eachPixel(g, (d, p, i) => {
    const hole = rand01(i, 9, 3) < 0.035 ? 0.72 : 1;
    const grain = (rand01(i, 9, 4) - 0.5) * 10;
    const stain = smoothstep(0.66, 0.8, n2[i]);
    const k = (0.94 + n1[i] * 0.1) * hole;
    d[p] = d[p] * k + grain - stain * 10;
    d[p + 1] = d[p + 1] * k + grain - stain * 22;
    d[p + 2] = d[p + 2] * k + grain - stain * 48;
  });
  // 吊顶龙骨：x 方向每 1 米，z 方向每 0.5 米
  g.fillStyle = 'rgb(176,168,140)';
  for (const x of [128, 384]) g.fillRect(x - 3, 0, 6, TS);
  for (const y of [64, 192, 320, 448]) g.fillRect(0, y - 3, TS, 6);
  g.fillStyle = 'rgba(255,255,240,0.5)';
  for (const x of [128, 384]) g.fillRect(x - 3, 0, 1, TS);
  for (const y of [64, 192, 320, 448]) g.fillRect(0, y - 3, TS, 1);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  for (const x of [128, 384]) g.fillRect(x + 3, 0, 2, TS);
  for (const y of [64, 192, 320, 448]) g.fillRect(0, y + 3, TS, 2);
  return c;
}

function texLight(on) {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = on ? 'rgb(236,234,222)' : 'rgb(128,126,118)';
  g.fillRect(0, 0, TS, TS);
  if (on) {
    for (const v of [0.3, 0.7]) {
      const gr = g.createLinearGradient(0, TS * (v - 0.16), 0, TS * (v + 0.16));
      gr.addColorStop(0, 'rgba(255,255,250,0)');
      gr.addColorStop(0.5, 'rgba(255,255,252,1)');
      gr.addColorStop(1, 'rgba(255,255,250,0)');
      g.fillStyle = gr;
      g.fillRect(0, TS * (v - 0.16), TS, TS * 0.32);
    }
  }
  // 棱镜格纹
  g.fillStyle = on ? 'rgba(160,160,150,0.10)' : 'rgba(40,40,36,0.18)';
  for (let x = 0; x < TS; x += 10) g.fillRect(x, 0, 1, TS);
  for (let y = 0; y < TS; y += 20) g.fillRect(0, y, TS, 2);
  if (!on) {
    const r = mulberry32(7);
    g.fillStyle = 'rgba(20,18,14,0.8)';
    for (let k = 0; k < 16; k++) { g.beginPath(); g.arc(40 + r() * 430, 60 + r() * 390, 2 + r() * 4, 0, 7); g.fill(); }
    const gr = g.createRadialGradient(256, 256, 30, 256, 256, 360);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(60,50,20,0.35)');
    g.fillStyle = gr;
    g.fillRect(0, 0, TS, TS);
  }
  // 金属边框
  g.lineWidth = 26;
  g.strokeStyle = on ? 'rgb(150,148,140)' : 'rgb(80,78,72)';
  g.strokeRect(13, 13, TS - 26, TS - 26);
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.strokeRect(28, 28, TS - 56, TS - 56);
  return c;
}

// ------------------------------------------------------------
//  LEVEL 1：巨型仓库 —— 现浇混凝土墙、结构柱、梁、抹光地坪
//  墙面纹理横向 2m、纵向覆盖整面墙高（wallH），因此纵向像素密度不同
// ------------------------------------------------------------
const L1_H = 4.2;

function texL1Wall() {
  const c = newCanvas(), g = c.getContext('2d');
  const PX = TS / L1_H; // 纵向每米像素
  g.fillStyle = 'rgb(134,132,126)';
  g.fillRect(0, 0, TS, TS);
  const n1 = periodicNoise(8, 41, 5, 0.5, 16), n2 = periodicNoise(2, 42, 3, 0.5, 4), n3 = periodicNoise(32, 43, 2, 0.5, 64);
  eachPixel(g, (d, p, i, x, y) => {
    const h = (TS - y) / PX; // 离地高度（米）
    const grain = (rand01(i, 11, 1) - 0.5) * 14;
    const pore = rand01(i, 11, 2) < 0.01 ? 0.62 : 1; // 气孔
    const blot = smoothstep(0.5, 0.8, n2[i]);
    // 返潮：离地 0.5~0.9m 的波浪形水迹线
    const tide = 0.5 + n2[i] * 0.45;
    const damp = h < tide ? 0.74 + 0.26 * smoothstep(0, tide, h) : 1;
    const tideLine = Math.exp(-Math.pow((h - tide) * 26, 2)) * 0.14;
    const k = (0.84 + n1[i] * 0.26 + (n3[i] - 0.5) * 0.07) * (1 - blot * 0.14) * damp * (1 - tideLine) * pore;
    d[p] = d[p] * k + grain;
    d[p + 1] = d[p + 1] * k + grain;
    d[p + 2] = d[p + 2] * k * 0.98 + grain;
  });
  // 模板拼缝：每块 1m × 1.2m
  for (const m of [1.2, 2.4, 3.6]) {
    const y = Math.round(TS - m * PX);
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, y, TS, 2);
    g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(0, y + 2, TS, 1);
  }
  for (const x of [0, 256]) {
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x, 0, 2, TS);
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x + 2, 0, 1, TS);
  }
  // 对拉螺栓孔，以及孔下方流出的锈迹
  for (const x of [64, 192, 320, 448]) {
    for (const m of [0.6, 1.8, 3.0]) {
      const y = TS - m * PX, len = 30 + ((x * 7 + m * 13) % 5) * 14;
      const gr = g.createLinearGradient(0, y, 0, y + len);
      gr.addColorStop(0, 'rgba(112,62,26,0.32)'); gr.addColorStop(1, 'rgba(112,62,26,0)');
      g.fillStyle = gr; g.fillRect(x - 2, y, 4, len);
      g.fillStyle = 'rgba(200,196,186,0.2)'; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill();
      g.fillStyle = 'rgba(22,20,18,0.75)'; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill();
    }
  }
  // 顶部渗水形成的竖向水痕
  const r = mulberry32(5);
  for (let k = 0; k < 16; k++) {
    const x = r() * TS, len = 60 + r() * 320, w = 2 + r() * 8;
    const gr = g.createLinearGradient(0, 0, 0, len);
    gr.addColorStop(0, 'rgba(34,34,30,0.24)');
    gr.addColorStop(1, 'rgba(34,34,30,0)');
    g.fillStyle = gr;
    wrapDraw((dx) => g.fillRect(x + dx, 0, w, len));
  }
  // 贴地的污渍
  const gb = g.createLinearGradient(0, TS - 0.35 * PX, 0, TS);
  gb.addColorStop(0, 'rgba(30,28,24,0)'); gb.addColorStop(1, 'rgba(30,28,24,0.5)');
  g.fillStyle = gb; g.fillRect(0, TS - 0.35 * PX, TS, 0.35 * PX);
  return c;
}

function drawCracks(g, seed, n, alpha) {
  const r = mulberry32(seed);
  g.strokeStyle = `rgba(20,20,18,${alpha})`;
  for (let k = 0; k < n; k++) {
    let x = r() * TS, y = r() * TS, a = r() * Math.PI * 2;
    g.lineWidth = 1 + r() * 1.5;
    g.beginPath(); g.moveTo(x, y);
    const steps = 20 + r() * 40;
    for (let s = 0; s < steps; s++) {
      a += (r() - 0.5) * 0.9;
      x += Math.cos(a) * 6; y += Math.sin(a) * 6;
      g.lineTo(x, y);
    }
    g.stroke();
  }
}

// 抹光混凝土地坪；伸缩缝由着色器按 6m 柱网绘制
function texL1Floor() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(122,118,110)';
  g.fillRect(0, 0, TS, TS);
  const n1 = periodicNoise(8, 51, 5), n2 = periodicNoise(2, 52, 4), n3 = periodicNoise(32, 53, 2);
  eachPixel(g, (d, p, i) => {
    const grain = (rand01(i, 13, 1) - 0.5) * 11;
    const oil = smoothstep(0.64, 0.78, n2[i]);
    const k = (0.84 + n1[i] * 0.26 + (n3[i] - 0.5) * 0.08) * (1 - oil * 0.32);
    d[p] = d[p] * k + grain;
    d[p + 1] = d[p + 1] * k + grain;
    d[p + 2] = d[p + 2] * k * 0.97 + grain;
  });
  // 抹光机留下的弧形纹路
  const r = mulberry32(51);
  g.lineWidth = 12;
  for (let k = 0; k < 24; k++) {
    const x = r() * TS, y = r() * TS, rad = 40 + r() * 90, a = r() * 6.28, span = 0.8 + r() * 1.2;
    g.strokeStyle = r() < 0.5 ? 'rgba(255,255,245,0.03)' : 'rgba(0,0,0,0.035)';
    wrapDraw((dx, dy) => { g.beginPath(); g.arc(x + dx, y + dy, rad, a, a + span); g.stroke(); });
  }
  drawCracks(g, 77, 3, 0.35);
  return c;
}

// 顶板：留有胶合板模板的印子（每块 1m × 2m）
function texL1Ceil() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(112,110,104)';
  g.fillRect(0, 0, TS, TS);
  const n1 = periodicNoise(8, 61, 5), n2 = periodicNoise(2, 62, 3), wood = periodicNoise(64, 63, 2, 0.5, 4);
  eachPixel(g, (d, p, i, x) => {
    const grain = (rand01(i, 15, 1) - 0.5) * 10;
    const st = smoothstep(0.6, 0.8, n2[i]);
    const panel = x < 256 ? 1.0 : 0.95;
    const k = (0.82 + n1[i] * 0.24 + (wood[i] - 0.5) * 0.08) * (1 - st * 0.3) * panel;
    d[p] = d[p] * k + grain; d[p + 1] = d[p + 1] * k + grain; d[p + 2] = d[p + 2] * k * 0.97 + grain;
  });
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, 0, 3, TS); g.fillRect(256, 0, 3, TS); g.fillRect(0, 0, TS, 3);
  return c;
}

// 结构柱：每个面 u 为 0..1，纵向覆盖整根柱高。底部刷有磨损的黄黑防撞漆
function texL1Column() {
  const c = newCanvas(), g = c.getContext('2d');
  const PX = TS / L1_H, SX = TS / 0.92; // 纵向 / 横向每米像素
  const n1 = periodicNoise(4, 151, 5, 0.5, 18), n2 = periodicNoise(2, 152, 3, 0.5, 8), wear = periodicNoise(8, 153, 4, 0.55, 8);
  const img = g.createImageData(TS, TS), d = img.data;
  const y0 = TS - 1.0 * PX, y1 = TS - 0.12 * PX, slope = SX / PX;
  for (let i = 0, p = 0; i < TS * TS; i++, p += 4) {
    const x = i % TS, y = (i / TS) | 0, h = (TS - y) / PX;
    const grain = (rand01(i, 31, 1) - 0.5) * 13;
    const blot = smoothstep(0.5, 0.8, n2[i]);
    let k = (0.84 + n1[i] * 0.26) * (1 - blot * 0.12);
    if (h < 0.4) k *= 0.8 + 0.2 * (h / 0.4);
    let R = 140 * k, G = 138 * k, B = 132 * k;
    if (y >= y0 && y <= y1) {
      const s = ((x + (y1 - y) * slope) % 190 + 190) % 190;
      const yellow = s > 95;
      const scuff = wear[i] + (rand01(i, 31, 2) - 0.5) * 0.12 + smoothstep(y0 + 30, y1, y) * 0.2;
      if (scuff < 0.58) {
        const pk = 0.78 + n1[i] * 0.3;
        if (yellow) { R = 172 * pk; G = 140 * pk; B = 52 * pk; } else { R = 36 * pk; G = 34 * pk; B = 32 * pk; }
      }
    }
    // 倒角棱边
    if (x < 7) { R *= 1.1; G *= 1.1; B *= 1.1; } else if (x > TS - 8) { R *= 0.82; G *= 0.82; B *= 0.82; }
    d[p] = R + grain; d[p + 1] = G + grain; d[p + 2] = B + grain * 0.9; d[p + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // 被撞掉的棱角，露出锈蚀的竖向钢筋
  for (const [side, hm, len] of [[0, 1.35, 0.5], [1, 2.7, 0.7], [0, 3.6, 0.3]]) {
    const yA = TS - (hm + len) * PX, yB = TS - hm * PX;
    const ex = side ? TS : 0, dir = side ? -1 : 1;
    const r = mulberry32(side * 17 + hm * 10);
    g.beginPath();
    g.moveTo(ex, yA);
    const steps = 9;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      g.lineTo(ex + dir * (12 + r() * 18) * Math.sin(t * Math.PI), yA + (yB - yA) * t);
    }
    g.lineTo(ex, yB);
    g.closePath();
    g.save();
    g.fillStyle = 'rgb(86,84,78)';
    g.fill();
    g.clip();
    for (let k = 0; k < 40; k++) {
      const v = 60 + r() * 70;
      g.fillStyle = `rgb(${v | 0},${(v * 0.97) | 0},${(v * 0.92) | 0})`;
      g.beginPath(); g.arc(ex + dir * r() * 30, yA + r() * (yB - yA), 1.5 + r() * 3, 0, 7); g.fill();
    }
    const bx = ex + dir * 9;
    g.fillStyle = 'rgb(72,48,34)'; g.fillRect(bx - 4, yA - 4, 8, yB - yA + 8);
    g.fillStyle = 'rgba(150,100,70,0.35)'; g.fillRect(bx - 2, yA - 4, 2, yB - yA + 8);
    g.strokeStyle = 'rgba(30,16,8,0.7)'; g.lineWidth = 2;
    for (let yy = yA; yy < yB; yy += 7) { g.beginPath(); g.moveTo(bx - 4, yy); g.lineTo(bx + 4, yy + 3); g.stroke(); }
    g.restore();
    const gr = g.createLinearGradient(0, yB, 0, yB + 60);
    gr.addColorStop(0, 'rgba(110,64,34,0.22)'); gr.addColorStop(1, 'rgba(110,64,34,0)');
    g.fillStyle = gr; g.fillRect(ex + (side ? -16 : 4), yB, 12, 60);
  }
  return c;
}

// 梁：u 沿长度方向（每 2m 重复），v 横跨梁的侧面/底面
function texL1Beam() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(118,116,110)';
  g.fillRect(0, 0, TS, TS);
  const n1 = periodicNoise(16, 161, 5, 0.5, 4), n2 = periodicNoise(4, 162, 3, 0.5, 1);
  eachPixel(g, (d, p, i, x, y) => {
    const v = y / TS;
    const grain = (rand01(i, 33, 1) - 0.5) * 12;
    const st = smoothstep(0.55, 0.8, n2[i]);
    const edge = 1 - 0.18 * (smoothstep(0.1, 0.0, v) + smoothstep(0.9, 1.0, v));
    const k = (0.88 + n1[i] * 0.15) * (1 - st * 0.16) * edge;
    d[p] = d[p] * k + grain; d[p + 1] = d[p + 1] * k + grain; d[p + 2] = d[p + 2] * k * 0.97 + grain;
  });
  g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(0, 254, TS, 2); g.fillRect(0, 0, 2, TS);
  return c;
}

function texCrate() {
  const c = newCanvas(), g = c.getContext('2d');
  const r = mulberry32(88);
  const ph = TS / 6;
  for (let k = 0; k < 6; k++) {
    const t = r();
    g.fillStyle = `rgb(${140 + t * 30 | 0},${100 + t * 22 | 0},${58 + t * 14 | 0})`;
    g.fillRect(0, k * ph, TS, ph);
    g.strokeStyle = 'rgba(70,45,20,0.25)';
    g.lineWidth = 1;
    for (let l = 0; l < 7; l++) {
      g.beginPath();
      const y0 = k * ph + 6 + r() * (ph - 12), amp = 2 + r() * 4, fr = 0.01 + r() * 0.02, ph0 = r() * 6;
      for (let x = 0; x <= TS; x += 8) {
        const y = y0 + Math.sin(x * fr + ph0) * amp;
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
    g.fillStyle = 'rgba(30,18,6,0.8)';
    g.fillRect(0, k * ph, TS, 3);
  }
  const n1 = periodicNoise(8, 71, 4);
  eachPixel(g, (d, p, i) => {
    const k = 0.85 + n1[i] * 0.25, grain = (rand01(i, 17, 1) - 0.5) * 10;
    d[p] = d[p] * k + grain; d[p + 1] = d[p + 1] * k + grain; d[p + 2] = d[p + 2] * k + grain;
  });
  g.lineWidth = 46;
  g.strokeStyle = 'rgb(112,78,42)';
  g.strokeRect(23, 23, TS - 46, TS - 46);
  g.save();
  g.beginPath(); g.rect(46, 46, TS - 92, TS - 92); g.clip();
  g.lineWidth = 44;
  g.beginPath(); g.moveTo(30, TS - 30); g.lineTo(TS - 30, 30); g.stroke();
  g.restore();
  g.lineWidth = 3; g.strokeStyle = 'rgba(30,18,6,0.7)';
  g.strokeRect(46, 46, TS - 92, TS - 92);
  g.strokeRect(2, 2, TS - 4, TS - 4);
  g.fillStyle = 'rgb(50,50,50)';
  for (const [x, y] of [[23, 23], [TS - 23, 23], [23, TS - 23], [TS - 23, TS - 23]]) {
    g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill();
  }
  g.save();
  g.translate(TS * 0.5, TS * 0.36);
  g.fillStyle = 'rgba(25,20,15,0.55)';
  g.font = 'bold 54px "Courier New", monospace';
  g.textAlign = 'center';
  g.fillText('M.E.G.', 0, 0);
  g.font = 'bold 26px "Courier New", monospace';
  g.fillText('SUPPLY  NO.' + (100 + Math.floor(r() * 800)), 0, 40);
  g.restore();
  return c;
}

// ------------------------------------------------------------
//  LEVEL 2：管道之梦 —— 灰色混凝土维修隧道、管道、闷热潮湿
// ------------------------------------------------------------
const L2_H = 2.7;

function texL2Wall() {
  const c = newCanvas(), g = c.getContext('2d');
  const PX = TS / L2_H;
  g.fillStyle = 'rgb(108,108,103)';
  g.fillRect(0, 0, TS, TS);
  const n1 = periodicNoise(8, 81, 5, 0.5, 11), n2 = periodicNoise(3, 82, 3, 0.5, 4), n3 = periodicNoise(32, 83, 2, 0.5, 43);
  eachPixel(g, (d, p, i, x, y) => {
    const h = (TS - y) / PX;
    const grain = (rand01(i, 19, 1) - 0.5) * 15;
    const soot = smoothstep(1.9, L2_H, h) * (0.35 + n2[i] * 0.25);
    const damp = smoothstep(0.55 + n2[i] * 0.5, 0.0, h) * 0.38;
    const blot = smoothstep(0.5, 0.82, n2[i]) * 0.2;
    const k = (0.8 + n1[i] * 0.3 + (n3[i] - 0.5) * 0.08) * (1 - soot) * (1 - damp) * (1 - blot);
    d[p] = d[p] * k + grain;
    d[p + 1] = d[p + 1] * k + grain + damp * 5;
    d[p + 2] = d[p + 2] * k + grain * 0.9;
  });
  // 浇筑冷缝
  const yj = Math.round(TS - 1.15 * PX);
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, yj, TS, 2);
  g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, yj + 2, TS, 1);
  const r = mulberry32(123);
  // 管道滴下的锈水：宽而淡、边缘模糊，由几条细流叠成一片
  g.filter = 'blur(3px)';
  for (let k = 0; k < 7; k++) {
    const x = r() * TS, y = r() * 40, len = 120 + r() * 300;
    for (let s = 0; s < 4; s++) {
      const xx = x + (r() - 0.5) * 26, w = 4 + r() * 12, l2 = len * (0.5 + r() * 0.5);
      const gr = g.createLinearGradient(0, y, 0, y + l2);
      gr.addColorStop(0, 'rgba(96,62,38,0.2)');
      gr.addColorStop(1, 'rgba(96,62,38,0)');
      g.fillStyle = gr;
      wrapDraw((dx) => g.fillRect(xx + dx, y, w, l2));
    }
  }
  // 黑色的不明液体流痕
  g.filter = 'blur(1.5px)';
  for (let k = 0; k < 3; k++) {
    const x = r() * TS, y = 20 + r() * 120, len = 80 + r() * 220, w = 3 + r() * 5;
    const gr = g.createLinearGradient(0, y, 0, y + len);
    gr.addColorStop(0, 'rgba(14,12,12,0.45)');
    gr.addColorStop(0.7, 'rgba(14,12,12,0.25)');
    gr.addColorStop(1, 'rgba(14,12,12,0)');
    g.fillStyle = gr;
    wrapDraw((dx) => g.fillRect(x + dx, y, w, len));
  }
  g.filter = 'none';
  return c;
}

function texL2Floor() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(86,85,80)';
  g.fillRect(0, 0, TS, TS);
  const n1 = periodicNoise(8, 91, 5), n2 = periodicNoise(3, 92, 4), n3 = periodicNoise(48, 93, 2);
  eachPixel(g, (d, p, i) => {
    const grain = (rand01(i, 21, 1) - 0.5) * 16;
    const grit = rand01(i, 21, 2) < 0.02 ? 1.25 : 1;
    const stain = smoothstep(0.55, 0.75, n2[i]);
    const k = (0.76 + n1[i] * 0.34 + (n3[i] - 0.5) * 0.1) * (1 - stain * 0.35) * grit;
    d[p] = d[p] * k + grain;
    d[p + 1] = d[p + 1] * k + grain;
    d[p + 2] = d[p + 2] * k * 0.96 + grain;
  });
  drawCracks(g, 5, 5, 0.5);
  return c;
}

function texL2Ceil() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(78,77,73)';
  g.fillRect(0, 0, TS, TS);
  const n1 = periodicNoise(8, 101, 5), n2 = periodicNoise(2, 102, 3);
  eachPixel(g, (d, p, i) => {
    const grain = (rand01(i, 23, 1) - 0.5) * 12;
    const st = smoothstep(0.52, 0.8, n2[i]);
    const k = (0.72 + n1[i] * 0.4) * (1 - st * 0.45);
    d[p] = d[p] * k + grain; d[p + 1] = d[p + 1] * k + grain; d[p + 2] = d[p + 2] * k + grain;
  });
  return c;
}

// 管道纹理：u 沿管道长度（每 1m 重复），v 绕圆周一圈（v≈0.75 为管底）
function pipeBase(g, rgb, seedA, rustAmt) {
  g.fillStyle = `rgb(${rgb})`;
  g.fillRect(0, 0, TS, TS);
  const n1 = periodicNoise(8, seedA, 5), n2 = periodicNoise(4, seedA + 1, 4), n3 = periodicNoise(32, seedA + 2, 2, 0.5, 8);
  eachPixel(g, (d, p, i, x, y) => {
    const v = y / TS;
    const bottom = Math.exp(-Math.pow((v - 0.75) * 4.5, 2));
    const grain = (rand01(i, seedA, 1) - 0.5) * 14;
    const rust = smoothstep(0.62 - rustAmt * 0.3 - bottom * 0.2, 0.8, n2[i] + (n3[i] - 0.5) * 0.3);
    const k = (0.72 + n1[i] * 0.4) * (1 - bottom * 0.25);
    const R = d[p] * k, G = d[p + 1] * k, B = d[p + 2] * k;
    d[p] = lerp(R, 90 * k, rust) + grain;
    d[p + 1] = lerp(G, 58 * k, rust) + grain;
    d[p + 2] = lerp(B, 38 * k, rust) + grain;
  });
}

function texPipe() {
  const c = newCanvas(), g = c.getContext('2d');
  pipeBase(g, '92,88,82', 111, 0.7);
  g.fillStyle = 'rgba(30,26,22,0.5)'; g.fillRect(0, 0, 5, TS); // 焊缝
  g.fillStyle = 'rgba(200,180,160,0.15)'; g.fillRect(5, 0, 2, TS);
  return c;
}

function texPipePaint() {
  const c = newCanvas(), g = c.getContext('2d');
  pipeBase(g, '78,96,82', 115, 0.35);
  g.fillStyle = 'rgba(30,26,22,0.4)'; g.fillRect(0, 0, 4, TS);
  return c;
}

// 包着保温棉的管道：脏污的布面 + 每 0.5m 一道金属箍
function texPipeInsul() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(176,170,156)';
  g.fillRect(0, 0, TS, TS);
  const n1 = periodicNoise(8, 121, 5), n2 = periodicNoise(3, 122, 4), weave = periodicNoise(64, 123, 1);
  eachPixel(g, (d, p, i, x, y) => {
    const v = y / TS;
    const bottom = Math.exp(-Math.pow((v - 0.75) * 4, 2));
    const grain = (rand01(i, 35, 1) - 0.5) * 10;
    const dirt = smoothstep(0.45, 0.8, n2[i]) * 0.45 + bottom * 0.3;
    const wrap = 0.94 + 0.06 * Math.sin((x + y * 0.35) * 0.35);
    const k = (0.8 + n1[i] * 0.25) * (1 - dirt) * wrap * (0.95 + weave[i] * 0.1);
    d[p] = d[p] * k + grain; d[p + 1] = d[p + 1] * k * 0.98 + grain; d[p + 2] = d[p + 2] * k * 0.92 + grain;
  });
  for (const x of [120, 376]) {
    g.fillStyle = 'rgb(120,122,122)'; g.fillRect(x, 0, 14, TS);
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(x + 2, 0, 3, TS);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 14, 0, 3, TS);
  }
  return c;
}

// 灯具外壳、支架等涂漆钢件
function texMetal() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(84,86,84)';
  g.fillRect(0, 0, TS, TS);
  const n1 = periodicNoise(8, 131, 4), n2 = periodicNoise(4, 132, 3);
  eachPixel(g, (d, p, i) => {
    const grain = (rand01(i, 37, 1) - 0.5) * 12;
    const rust = smoothstep(0.66, 0.8, n2[i]);
    const k = 0.78 + n1[i] * 0.3;
    d[p] = lerp(d[p] * k, 100 * k, rust) + grain;
    d[p + 1] = lerp(d[p + 1] * k, 56 * k, rust) + grain;
    d[p + 2] = lerp(d[p + 2] * k, 30 * k, rust) + grain;
  });
  return c;
}

// 带防护网罩的白炽灯泡（自发光）
function texBulb() {
  const c = newCanvas(), g = c.getContext('2d');
  const gr = g.createRadialGradient(256, 256, 10, 256, 256, 330);
  gr.addColorStop(0, 'rgb(255,250,230)');
  gr.addColorStop(0.5, 'rgb(250,214,150)');
  gr.addColorStop(1, 'rgb(170,110,60)');
  g.fillStyle = gr;
  g.fillRect(0, 0, TS, TS);
  g.strokeStyle = 'rgb(30,26,22)';
  g.lineWidth = 16;
  for (const x of [0, 128, 256, 384]) { g.beginPath(); g.moveTo(x + 64, 0); g.lineTo(x + 64, TS); g.stroke(); }
  g.beginPath(); g.moveTo(0, 256); g.lineTo(TS, 256); g.stroke();
  return c;
}

function texValve() {
  const c = newCanvas(), g = c.getContext('2d');
  pipeBase(g, '150,34,26', 141, 0.25);
  return c;
}

// ------------------------------------------------------------
//  贴花与半透明效果（抖动透明）
// ------------------------------------------------------------
// 水洼 / 黑色油污：不规则形状，着色器会给它加上镜面反射
function texPuddle(ooze) {
  const c = newCanvas(), g = c.getContext('2d');
  const img = g.createImageData(TS, TS), d = img.data;
  const n1 = periodicNoise(4, ooze ? 171 : 161, 5), n2 = periodicNoise(16, ooze ? 172 : 162, 3);
  for (let i = 0, p = 0; i < TS * TS; i++, p += 4) {
    const x = i % TS, y = (i / TS) | 0;
    const u = (x / TS) * 2 - 1, v = (y / TS) * 2 - 1;
    const shape = 1 - Math.sqrt(u * u + v * v) + (n1[i] - 0.5) * 0.95;
    const a = smoothstep(0.1, 0.16, shape);
    const deep = smoothstep(0.16, 0.45, shape);
    const grain = (rand01(i, 39, 1) - 0.5) * 6;
    let R, G, B;
    if (ooze) {
      const sheen = n2[i];
      R = 16 + 14 * Math.sin(sheen * 9) * (1 - deep); G = 14 + 10 * Math.sin(sheen * 9 + 2); B = 18 + 14 * Math.sin(sheen * 9 + 4);
    } else {
      const k = lerp(1, 0.55, deep);
      R = 78 * k; G = 78 * k; B = 76 * k;
    }
    d[p] = R + grain; d[p + 1] = G + grain; d[p + 2] = B + grain; d[p + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

function sprayText(g, text, x, y, font, color, blur) {
  g.save();
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.shadowColor = color;
  g.shadowBlur = blur;
  g.fillText(text, x, y);
  g.shadowBlur = 0;
  g.fillText(text, x, y);
  g.restore();
}

// 油漆往下流的痕迹
function sprayDrips(g, r, x0, x1, y, color, n) {
  g.fillStyle = color;
  for (let k = 0; k < n; k++) {
    const x = x0 + r() * (x1 - x0), len = 8 + r() * 36;
    g.fillRect(x, y, 2, len);
    g.beginPath(); g.arc(x + 1, y + len, 2, 0, 7); g.fill();
  }
}

// 贴花图集：剥落露筋 / 喷漆箭头 / 渗水痕 / 刻痕与警告
function texDecal() {
  const c = newCanvas(), g = c.getContext('2d');
  const r = mulberry32(2024);
  // ---- 左上：混凝土剥落，露出锈蚀钢筋 ----
  g.save();
  g.beginPath();
  const pts = 22;
  for (let k = 0; k < pts; k++) {
    const a = (k / pts) * Math.PI * 2, rad = (0.62 + r() * 0.3) * (k % 2 ? 1 : 0.9);
    const x = 128 + Math.cos(a) * 108 * rad, y = 118 + Math.sin(a) * 80 * rad;
    if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
  g.fillStyle = 'rgb(86,84,78)';
  g.fill();
  g.strokeStyle = 'rgba(190,188,178,0.9)'; g.lineWidth = 3; g.stroke();
  g.clip();
  for (let k = 0; k < 220; k++) {
    const v = 55 + r() * 80;
    g.fillStyle = `rgb(${v | 0},${(v * 0.97) | 0},${(v * 0.9) | 0})`;
    g.beginPath(); g.arc(20 + r() * 216, 30 + r() * 180, 1.5 + r() * 4, 0, 7); g.fill();
  }
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 150, 256, 60);
  for (const [x0, y0, x1, y1] of [[0, 92, 256, 96], [0, 146, 256, 142], [96, 0, 100, 256]]) {
    g.strokeStyle = 'rgb(92,46,22)'; g.lineWidth = 11;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = 'rgba(200,120,70,0.45)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x0, y0 - 3); g.lineTo(x1, y1 - 3); g.stroke();
    g.strokeStyle = 'rgba(40,16,6,0.7)'; g.lineWidth = 2;
    const len = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / len, uy = (y1 - y0) / len;
    for (let s = 0; s < len; s += 8) {
      const px = x0 + ux * s, py = y0 + uy * s;
      g.beginPath(); g.moveTo(px - uy * 5, py + ux * 5); g.lineTo(px + uy * 5 + ux * 3, py - ux * 5 + uy * 3); g.stroke();
    }
  }
  g.restore();
  for (let k = 0; k < 4; k++) {
    const x = 40 + r() * 170, y = 150 + r() * 20, len = 40 + r() * 60;
    const gr = g.createLinearGradient(0, y, 0, y + len);
    gr.addColorStop(0, 'rgba(120,60,24,0.7)'); gr.addColorStop(1, 'rgba(120,60,24,0)');
    g.fillStyle = gr; g.fillRect(x, y, 4 + r() * 6, len);
  }
  // ---- 右上：红色喷漆箭头 + M.E.G. 标记 ----
  g.save();
  g.translate(256, 0);
  g.strokeStyle = 'rgb(170,28,22)'; g.fillStyle = 'rgb(170,28,22)';
  g.shadowColor = 'rgba(170,28,22,0.9)'; g.shadowBlur = 8;
  g.lineWidth = 16; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(34, 96); g.lineTo(196, 90); g.stroke();
  g.beginPath(); g.moveTo(160, 52); g.lineTo(214, 90); g.lineTo(162, 132); g.stroke();
  g.shadowBlur = 0;
  sprayDrips(g, r, 40, 190, 100, 'rgba(160,26,20,0.85)', 7);
  sprayText(g, 'M.E.G.', 118, 180, 'bold 44px "Courier New", monospace', 'rgb(170,28,22)', 6);
  sprayText(g, 'BASE 2km', 118, 222, 'bold 26px "Courier New", monospace', 'rgb(150,30,24)', 4);
  g.restore();
  // ---- 左下：顶部渗漏留下的水渍 ----
  g.save();
  g.translate(0, 256);
  for (let k = 0; k < 40; k++) {
    const x = 70 + r() * 110 + (r() - 0.5) * 30, w = 3 + r() * 16, len = 80 + r() * 176;
    const gr = g.createLinearGradient(0, 0, 0, len);
    gr.addColorStop(0, 'rgba(58,48,30,0.35)'); gr.addColorStop(1, 'rgba(58,48,30,0)');
    g.fillStyle = gr; g.fillRect(x, 0, w, len);
  }
  g.restore();
  // ---- 右下：刻痕计数 + “别出声” ----
  g.save();
  g.translate(256, 256);
  g.strokeStyle = 'rgba(24,22,20,0.9)'; g.lineWidth = 5; g.lineCap = 'round';
  for (let grp = 0; grp < 3; grp++) {
    const gx = 30 + grp * 66;
    for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(gx + k * 11, 34 + r() * 4); g.lineTo(gx + k * 11 + 2, 84 + r() * 4); g.stroke(); }
    if (grp < 2) { g.beginPath(); g.moveTo(gx - 8, 76); g.lineTo(gx + 44, 42); g.stroke(); }
  }
  sprayText(g, '别出声', 128, 164, 'bold 66px "Microsoft YaHei", "SimHei", sans-serif', 'rgb(22,20,18)', 7);
  sprayDrips(g, r, 50, 206, 192, 'rgba(22,20,18,0.8)', 6);
  sprayText(g, '它听得见', 128, 226, 'bold 30px "Microsoft YaHei", "SimHei", sans-serif', 'rgb(30,26,24)', 4);
  g.restore();
  return c;
}

// 蒸汽团：柔和的圆形，alpha 通过抖动实现
function texSteam() {
  const c = newCanvas(), g = c.getContext('2d');
  const img = g.createImageData(TS, TS), d = img.data;
  const n1 = periodicNoise(4, 181, 5, 0.55);
  for (let i = 0, p = 0; i < TS * TS; i++, p += 4) {
    const x = i % TS, y = (i / TS) | 0;
    const u = (x / TS) * 2 - 1, v = (y / TS) * 2 - 1;
    const rr = Math.sqrt(u * u + v * v);
    const a = smoothstep(1.0, 0.15, rr + (n1[i] - 0.5) * 0.6) * (0.55 + n1[i] * 0.45);
    const k = 225 + n1[i] * 30;
    d[p] = k; d[p + 1] = k; d[p + 2] = k; d[p + 3] = clamp(a, 0, 1) * 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ------------------------------------------------------------
//  LEVEL 4：废弃办公室
// ------------------------------------------------------------
function texL4Wall() {
  const c = newCanvas(), g = c.getContext('2d');
  const PX = TS / 2.9;
  g.fillStyle = 'rgb(202,200,190)';
  g.fillRect(0, 0, TS, TS);
  const n1 = periodicNoise(8, 191, 4, 0.5, 12), n2 = periodicNoise(2, 192, 3, 0.5, 3);
  eachPixel(g, (d, p, i, x, y) => {
    const h = (TS - y) / PX;
    const grain = (rand01(i, 41, 1) - 0.5) * 6;
    const grime = smoothstep(0.6, 0.0, h) * 0.12 + smoothstep(0.6, 0.85, n2[i]) * 0.1;
    const k = (0.93 + n1[i] * 0.09) * (1 - grime);
    d[p] = d[p] * k + grain; d[p + 1] = d[p + 1] * k + grain; d[p + 2] = d[p + 2] * k * 0.98 + grain;
  });
  // 石膏板接缝
  for (const x of [0, 256]) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(x, 0, 2, TS); }
  // 椅背、推车留下的划痕
  const r = mulberry32(44);
  g.strokeStyle = 'rgba(70,64,56,0.18)';
  for (let k = 0; k < 18; k++) {
    const x = r() * TS, y = TS - (0.7 + r() * 0.4) * PX;
    g.lineWidth = 1 + r() * 2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 20 + r() * 60, y + (r() - 0.5) * 6); g.stroke();
  }
  // 橡胶踢脚线
  const bb = Math.round(TS - 0.1 * PX);
  g.fillStyle = 'rgb(58,58,60)'; g.fillRect(0, bb, TS, TS - bb);
  g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(0, bb, TS, 2);
  return c;
}

// 0.5m 见方的方块地毯，相邻方块纹理方向交错
function texL4Floor() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(80,86,94)';
  g.fillRect(0, 0, TS, TS);
  const n1 = periodicNoise(8, 201, 4), n2 = periodicNoise(2, 202, 4);
  eachPixel(g, (d, p, i, x, y) => {
    const tx = x >> 7, ty = y >> 7, alt = (tx + ty) & 1;
    const fiber = (rand01(alt ? x : y, alt ? y >> 2 : x >> 2, 43) - 0.5) * 16 + (rand01(i, 43, 2) - 0.5) * 14;
    const shade = alt ? 1.04 : 0.96;
    const stain = smoothstep(0.62, 0.8, n2[i]);
    const k = (0.88 + n1[i] * 0.2) * shade * (1 - stain * 0.25);
    d[p] = d[p] * k + fiber; d[p + 1] = d[p + 1] * k + fiber; d[p + 2] = d[p + 2] * k + fiber;
  });
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let k = 0; k < 4; k++) { g.fillRect(k * 128, 0, 1, TS); g.fillRect(0, k * 128, TS, 1); }
  return c;
}

// 0.5m 见方的矿棉吊顶板 + 铝龙骨
function texL4Ceil() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(226,226,220)';
  g.fillRect(0, 0, TS, TS);
  const n1 = periodicNoise(16, 211, 3), n2 = periodicNoise(2, 212, 3);
  eachPixel(g, (d, p, i) => {
    const fis = rand01(i, 45, 1) < 0.05 ? 0.82 : 1;
    const stain = smoothstep(0.68, 0.82, n2[i]);
    const k = (0.94 + n1[i] * 0.08) * fis;
    d[p] = d[p] * k - stain * 12; d[p + 1] = d[p + 1] * k - stain * 22; d[p + 2] = d[p + 2] * k - stain * 44;
  });
  for (let k = 0; k < 4; k++) {
    g.fillStyle = 'rgb(196,196,192)'; g.fillRect(k * 128 - 3, 0, 6, TS); g.fillRect(0, k * 128 - 3, TS, 6);
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(k * 128 + 3, 0, 2, TS); g.fillRect(0, k * 128 + 3, TS, 2);
  }
  return c;
}

function texDesk() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(150,120,86)';
  g.fillRect(0, 0, TS, TS);
  const wood = periodicNoise(2, 221, 3, 0.5, 32), n1 = periodicNoise(8, 222, 3);
  eachPixel(g, (d, p, i) => {
    const k = 0.85 + wood[i] * 0.2 + n1[i] * 0.06, grain = (rand01(i, 47, 1) - 0.5) * 6;
    d[p] = d[p] * k + grain; d[p + 1] = d[p + 1] * k + grain; d[p + 2] = d[p + 2] * k + grain;
  });
  g.strokeStyle = 'rgb(60,50,40)'; g.lineWidth = 14; g.strokeRect(0, 0, TS, TS);
  return c;
}

// 工位隔板：灰蓝色布面 + 顶部铝条
function texPartition() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(104,112,122)';
  g.fillRect(0, 0, TS, TS);
  const n1 = periodicNoise(8, 231, 3), n2 = periodicNoise(2, 232, 3);
  eachPixel(g, (d, p, i) => {
    const weave = (rand01(i, 49, 1) - 0.5) * 18;
    const k = (0.9 + n1[i] * 0.14) * (1 - smoothstep(0.65, 0.85, n2[i]) * 0.2);
    d[p] = d[p] * k + weave; d[p + 1] = d[p + 1] * k + weave; d[p + 2] = d[p + 2] * k + weave;
  });
  g.fillStyle = 'rgb(176,178,178)'; g.fillRect(0, 0, TS, 26);
  g.fillStyle = 'rgb(176,178,178)'; g.fillRect(0, 0, 14, TS); g.fillRect(TS - 14, 0, 14, TS);
  return c;
}

function texOfficeParts() {
  const c = newCanvas(), g = c.getContext('2d');
  const colors = ['#c8c3ad', '#343b43', '#11191d', '#376d9b', '#a04b40', '#658ea7', '#dedbc9', '#7f8685'];
  colors.forEach((color, i) => { g.fillStyle = color; g.fillRect(i * TS / 8, 0, TS / 8, TS); });
  return c;
}

function texKeyboard() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = '#b2af9e'; g.fillRect(0, 0, TS, TS);
  for (let row = 0; row < 6; row++) for (let col = 0; col < 18; col++) {
    if (row === 5 && col > 3 && col < 10) continue;
    const x = 9 + col * 27.5, y = 20 + row * 76;
    g.fillStyle = '#74766f'; g.fillRect(x, y, 24, 65);
    g.fillStyle = '#d3cfba'; g.fillRect(x+2, y+2, 20, 57);
    g.fillStyle = '#5c605c'; g.fillRect(x+7, y+10, 8, 4);
  }
  g.fillStyle = '#77796f'; g.fillRect(115, 400, 190, 65);
  g.fillStyle = '#d3cfba'; g.fillRect(118, 402, 184, 57);
  return c;
}

function texPcFront() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = '#bbb8a5'; g.fillRect(0, 0, TS, TS);
  for (const y of [40, 112]) {
    g.fillStyle = '#77796f'; g.fillRect(28, y, 456, 60);
    g.fillStyle = '#cac6b2'; g.fillRect(33, y+4, 446, 49);
    g.fillStyle = '#424b49'; g.fillRect(47, y+24, 352, 5); g.fillRect(420, y+33, 24, 9);
  }
  g.fillStyle = '#494f4c'; g.beginPath(); g.arc(425, 242, 24, 0, Math.PI*2); g.fill();
  g.fillStyle = '#53664d'; g.fillRect(330, 234, 13, 9);
  for (let row = 0; row < 7; row++) for (let col = 0; col < 12; col++) {
    g.fillStyle = '#777c73'; g.fillRect(45+col*36, 330+row*19, 24, 7);
  }
  return c;
}

function texVending() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = '#797f7b'; g.fillRect(0, 0, TS, TS);
  g.fillStyle = '#c0c1ac'; g.fillRect(22, 14, 468, 63);
  g.fillStyle = '#475b57'; g.textAlign = 'center'; g.font = 'bold 34px Arial';
  g.fillText('ALMOND WATER', TS/2, 57);
  g.fillStyle = '#172629'; g.fillRect(28, 95, 354, 312);
  for (let row=0;row<3;row++) {
    for (let col=0;col<5;col++) {
      const x=45+col*65, y=108+row*96;
      g.fillStyle='#99a09a'; g.fillRect(x+12,y,20,11);
      g.fillStyle='#837755'; g.fillRect(x+5,y+11,34,65);
      g.fillStyle='#c4be9a'; g.fillRect(x+5,y+31,34,25);
      g.fillStyle='#687662'; g.fillRect(x+10,y+36,24,4);
    }
    g.fillStyle='#838b86'; g.fillRect(30,190+row*96,349,7);
  }
  for (let row=0;row<5;row++) for(let col=0;col<2;col++) {
    g.fillStyle='#c0c3b4'; g.fillRect(401+col*41,142+row*38,28,23);
  }
  g.fillStyle='#252e2d'; g.fillRect(407,348,56,10); g.fillRect(415,374,45,25);
  g.fillRect(53,430,292,60);
  return c;
}

function texWindowBlack() {
  const c = texWindow(), g = c.getContext('2d'), r = mulberry32(404);
  g.fillStyle = '#101315'; g.fillRect(33, 33, TS-66, TS-72);
  for (let k=0;k<46;k++) {
    g.fillStyle = `rgba(67,72,74,${0.06+r()*0.13})`;
    g.fillRect(35+r()*(TS-80), 35+r()*30, 2+r()*9, TS-110-r()*65);
  }
  return c;
}

// 老式 CRT 显示器正面：米色边框、曲面玻璃与熄灭的屏幕
function texMonitor() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(196,188,168)';
  g.fillRect(0, 0, TS, TS);
  g.fillStyle = 'rgb(18,20,22)';
  g.fillRect(60, 50, TS - 120, TS - 150);
  const gr = g.createLinearGradient(60, 50, TS - 60, TS - 100);
  gr.addColorStop(0, 'rgba(255,255,255,0.12)'); gr.addColorStop(0.4, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(60, 50, TS - 120, TS - 150);
  g.strokeStyle = 'rgba(42,46,43,0.75)'; g.lineWidth = 9; g.strokeRect(57,47,TS-114,TS-144);
  g.fillStyle = 'rgb(62,76,59)'; g.fillRect(TS - 90, TS - 70, 12, 8);
  g.fillStyle = 'rgb(93,96,85)';
  for (const x of [TS-154,TS-131,TS-108]) g.fillRect(x,TS-69,13,7);
  return c;
}

// “窗户”：本不该存在于后室的窗，窗外是明亮而模糊的户外景色（自发光）
function texWindow() {
  const c = newCanvas(), g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, TS);
  sky.addColorStop(0, 'rgb(170,196,222)');
  sky.addColorStop(0.55, 'rgb(236,238,232)');
  sky.addColorStop(0.62, 'rgb(150,160,120)');
  sky.addColorStop(1, 'rgb(96,110,70)');
  g.fillStyle = sky;
  g.fillRect(0, 0, TS, TS);
  const r = mulberry32(77);
  g.fillStyle = 'rgba(70,86,60,0.8)';
  g.beginPath(); g.moveTo(0, TS * 0.6);
  for (let x = 0; x <= TS; x += 16) g.lineTo(x, TS * 0.6 - 10 - r() * 26);
  g.lineTo(TS, TS * 0.62); g.lineTo(0, TS * 0.62); g.closePath(); g.fill();
  const sun = g.createRadialGradient(360, 150, 5, 360, 150, 160);
  sun.addColorStop(0, 'rgba(255,255,245,1)'); sun.addColorStop(1, 'rgba(255,255,245,0)');
  g.fillStyle = sun; g.fillRect(0, 0, TS, TS);
  // 窗框与十字窗棂
  g.fillStyle = 'rgb(214,212,204)';
  g.fillRect(0, 0, TS, 34); g.fillRect(0, TS - 40, TS, 40); g.fillRect(0, 0, 34, TS); g.fillRect(TS - 34, 0, 34, TS);
  g.fillRect(TS / 2 - 10, 0, 20, TS); g.fillRect(0, TS / 2 - 10, TS, 20);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(34, 34, TS - 68, 4); g.fillRect(34, TS / 2 + 10, TS - 68, 4);
  return c;
}

// ------------------------------------------------------------
//  LEVEL 1.5：狭窄的住宅走廊 —— 素色灰泥墙、木地板、房门与相框（整层以底片反相渲染）
// ------------------------------------------------------------
function texL15Wall() {
  const c = newCanvas(), g = c.getContext('2d');
  const PX = TS / 2.5;
  g.fillStyle = 'rgb(176,172,164)';
  g.fillRect(0, 0, TS, TS);
  const n1 = periodicNoise(8, 241, 4, 0.5, 10), n2 = periodicNoise(2, 242, 3, 0.5, 3);
  eachPixel(g, (d, p, i, x, y) => {
    const h = (TS - y) / PX;
    const grain = (rand01(i, 51, 1) - 0.5) * 7;
    const grime = smoothstep(0.5, 0.82, n2[i]) * 0.14 + smoothstep(0.5, 0.0, h) * 0.12;
    const k = (0.9 + n1[i] * 0.12) * (1 - grime);
    d[p] = d[p] * k + grain; d[p + 1] = d[p + 1] * k + grain; d[p + 2] = d[p + 2] * k + grain;
  });
  // 踢脚线
  const bb = Math.round(TS - 0.12 * PX);
  g.fillStyle = 'rgb(72,56,42)'; g.fillRect(0, bb, TS, TS - bb);
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, bb, TS, 2);
  return c;
}

// 六格木门（贴在走廊墙上，打不开）
function texHouseDoor() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(206,200,188)';
  g.fillRect(0, 0, TS, TS);
  const n1 = periodicNoise(4, 271, 4);
  eachPixel(g, (d, p, i) => {
    const k = 0.9 + n1[i] * 0.12, grain = (rand01(i, 57, 1) - 0.5) * 6;
    d[p] = d[p] * k + grain; d[p + 1] = d[p + 1] * k + grain; d[p + 2] = d[p + 2] * k + grain;
  });
  // 门板在纹理里横向 0.92m、纵向 2.05m，按比例画出六块凹板
  const panel = (x, y, w, h) => {
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(x + 6, y + 4, w - 12, h - 8);
    g.strokeStyle = 'rgba(40,34,28,0.5)'; g.lineWidth = 3; g.strokeRect(x, y, w, h);
  };
  for (const x of [70, 272]) {
    panel(x, 36, 170, 96);
    panel(x, 160, 170, 150);
    panel(x, 338, 170, 140);
  }
  // 门把手
  g.fillStyle = 'rgb(150,120,60)'; g.beginPath(); g.arc(TS - 58, 262, 16, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,240,190,0.6)'; g.beginPath(); g.arc(TS - 62, 257, 5, 0, 7); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 0, 6, TS); g.fillRect(TS - 6, 0, 6, TS);
  return c;
}

// 相框图集：四张褪色的老照片（肖像、合影、房子、空椅子）
function texPictures() {
  const c = newCanvas(), g = c.getContext('2d');
  const r = mulberry32(281);
  for (let q = 0; q < 4; q++) {
    const ox = (q & 1) * 256, oy = (q >> 1) * 256;
    g.fillStyle = 'rgb(40,30,22)'; g.fillRect(ox, oy, 256, 256);
    g.fillStyle = 'rgb(214,208,192)'; g.fillRect(ox + 22, oy + 22, 212, 212);
    const ix = ox + 44, iy = oy + 44, iw = 168, ih = 168;
    const bg = g.createLinearGradient(0, iy, 0, iy + ih);
    bg.addColorStop(0, 'rgb(150,140,124)'); bg.addColorStop(1, 'rgb(80,72,62)');
    g.fillStyle = bg; g.fillRect(ix, iy, iw, ih);
    g.fillStyle = 'rgba(30,24,20,0.85)';
    if (q === 0) {
      g.beginPath(); g.ellipse(ix + 84, iy + 70, 26, 32, 0, 0, 7); g.fill();
      g.beginPath(); g.ellipse(ix + 84, iy + 168, 62, 64, 0, Math.PI, 0); g.fill();
    } else if (q === 1) {
      for (let k = 0; k < 4; k++) {
        const x = ix + 26 + k * 38, s = 0.75 + r() * 0.3;
        g.beginPath(); g.ellipse(x, iy + 84 - s * 10, 12 * s, 15 * s, 0, 0, 7); g.fill();
        g.fillRect(x - 16 * s, iy + 104 - s * 10, 32 * s, 70);
      }
    } else if (q === 2) {
      g.fillRect(ix + 40, iy + 80, 88, 70);
      g.beginPath(); g.moveTo(ix + 30, iy + 82); g.lineTo(ix + 84, iy + 40); g.lineTo(ix + 138, iy + 82); g.fill();
      g.fillStyle = 'rgba(230,220,190,0.8)'; g.fillRect(ix + 60, iy + 96, 16, 16); g.fillRect(ix + 94, iy + 96, 16, 16);
    } else {
      g.fillRect(ix + 60, iy + 90, 50, 10); g.fillRect(ix + 60, iy + 40, 8, 110); g.fillRect(ix + 102, iy + 96, 8, 54); g.fillRect(ix + 62, iy + 96, 6, 54);
    }
    g.fillStyle = 'rgba(120,100,70,0.25)'; g.fillRect(ix, iy, iw, ih); // 泛黄
  }
  return c;
}

function texL15Floor() {
  const c = newCanvas(), g = c.getContext('2d');
  const pw = TS / 12; // 每块地板约 16cm 宽
  const r = mulberry32(251);
  for (let k = 0; k < 12; k++) {
    const t = r();
    g.fillStyle = `rgb(${96 + t * 30 | 0},${62 + t * 18 | 0},${38 + t * 10 | 0})`;
    g.fillRect(0, k * pw, TS, pw);
    const cut = r() * TS;
    g.fillStyle = 'rgba(20,10,4,0.7)'; g.fillRect(cut, k * pw, 3, pw);
  }
  const wood = periodicNoise(2, 252, 3, 0.5, 48), n1 = periodicNoise(4, 253, 4);
  eachPixel(g, (d, p, i) => {
    const k = (0.8 + wood[i] * 0.3) * (0.85 + n1[i] * 0.2), grain = (rand01(i, 53, 1) - 0.5) * 8;
    d[p] = d[p] * k + grain; d[p + 1] = d[p + 1] * k + grain; d[p + 2] = d[p + 2] * k + grain;
  });
  g.fillStyle = 'rgba(15,8,4,0.8)';
  for (let k = 0; k < 12; k++) g.fillRect(0, k * pw, TS, 2);
  return c;
}

function texL15Ceil() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(176,166,140)';
  g.fillRect(0, 0, TS, TS);
  const n1 = periodicNoise(8, 261, 5), n2 = periodicNoise(2, 262, 3);
  eachPixel(g, (d, p, i) => {
    const grain = (rand01(i, 55, 1) - 0.5) * 8;
    const stain = smoothstep(0.58, 0.8, n2[i]);
    const k = 0.86 + n1[i] * 0.16;
    d[p] = d[p] * k + grain - stain * 20; d[p + 1] = d[p + 1] * k + grain - stain * 30; d[p + 2] = d[p + 2] * k + grain - stain * 46;
  });
  drawCracks(g, 263, 4, 0.35);
  return c;
}

// ------------------------------------------------------------
//  LEVEL 3：电站 —— 颜色不一的砖墙、配电箱、发电机、流水线
// ------------------------------------------------------------
function texL3Wall() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(96,90,82)'; // 灰浆
  g.fillRect(0, 0, TS, TS);
  const pal = [[132, 62, 44], [116, 78, 58], [160, 140, 112], [98, 94, 88], [144, 96, 64]];
  const zone = periodicNoise(2, 301, 3);
  const bw = 64, bh = 13;
  for (let row = 0; row * bh < TS; row++) {
    const off = (row & 1) * 32;
    for (let col = -1; col < 9; col++) {
      const x = col * bw + off, y = row * bh;
      const cxp = ((x + 32) % TS + TS) % TS, cyp = Math.min(TS - 1, y + 6);
      const z = zone[cyp * TS + cxp];
      const base = pal[Math.min(pal.length - 1, Math.floor(z * pal.length * 1.2) % pal.length)];
      const j = 0.82 + rand01(col + 20, row, 303) * 0.3;
      g.fillStyle = `rgb(${base[0] * j | 0},${base[1] * j | 0},${base[2] * j | 0})`;
      wrapDraw((dx) => g.fillRect(x + 2 + dx, y + 2, bw - 3, bh - 3));
    }
  }
  const n1 = periodicNoise(16, 302, 4, 0.5, 20);
  eachPixel(g, (d, p, i, x, y) => {
    const v = y / TS;
    const grain = (rand01(i, 61, 1) - 0.5) * 18;
    const soot = smoothstep(0.25, 0.0, v) * 0.35 + smoothstep(0.8, 1.0, v) * 0.3;
    const k = (0.78 + n1[i] * 0.34) * (1 - soot);
    d[p] = d[p] * k + grain; d[p + 1] = d[p + 1] * k + grain; d[p + 2] = d[p + 2] * k + grain;
  });
  return c;
}

// 墙上的配电箱：灰色铁皮、铰链、黄色高压警示、散热格栅
function texElecBox() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(118,122,118)';
  g.fillRect(0, 0, TS, TS);
  const n1 = periodicNoise(8, 311, 4), n2 = periodicNoise(4, 312, 3);
  eachPixel(g, (d, p, i) => {
    const rust = smoothstep(0.62, 0.8, n2[i]);
    const k = 0.8 + n1[i] * 0.25, grain = (rand01(i, 63, 1) - 0.5) * 10;
    d[p] = lerp(d[p] * k, 96 * k, rust) + grain; d[p + 1] = lerp(d[p + 1] * k, 58 * k, rust) + grain; d[p + 2] = lerp(d[p + 2] * k, 36 * k, rust) + grain;
  });
  g.strokeStyle = 'rgba(20,20,20,0.6)'; g.lineWidth = 8; g.strokeRect(24, 24, TS - 48, TS - 48);
  g.fillStyle = 'rgb(50,50,50)'; g.fillRect(30, 120, 14, 60); g.fillRect(30, 330, 14, 60);
  for (let y = 360; y < 460; y += 16) { g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(150, y, 212, 7); }
  g.save(); g.translate(256, 190);
  g.fillStyle = 'rgb(236,196,40)'; g.beginPath(); g.moveTo(0, -95); g.lineTo(100, 80); g.lineTo(-100, 80); g.closePath(); g.fill();
  g.strokeStyle = 'rgb(20,20,20)'; g.lineWidth = 10; g.stroke();
  g.fillStyle = 'rgb(20,20,20)'; g.beginPath(); g.moveTo(10, -50); g.lineTo(-25, 15); g.lineTo(2, 15); g.lineTo(-12, 60); g.lineTo(28, -5); g.lineTo(2, -5); g.closePath(); g.fill();
  g.restore();
  return c;
}

// 老式发电机：墨绿色涂漆机身、仪表盘、散热栅、警示条纹
function texGenerator() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(58,78,62)';
  g.fillRect(0, 0, TS, TS);
  const n1 = periodicNoise(8, 321, 4), n2 = periodicNoise(4, 322, 3);
  eachPixel(g, (d, p, i) => {
    const wear = smoothstep(0.64, 0.8, n2[i]);
    const k = 0.8 + n1[i] * 0.25, grain = (rand01(i, 65, 1) - 0.5) * 10;
    d[p] = lerp(d[p] * k, 90 * k, wear) + grain; d[p + 1] = lerp(d[p + 1] * k, 64 * k, wear) + grain; d[p + 2] = lerp(d[p + 2] * k, 44 * k, wear) + grain;
  });
  for (let x = 40; x < 300; x += 22) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x, 60, 12, 240); }
  for (const [x, y] of [[380, 110], [380, 230]]) {
    g.fillStyle = 'rgb(220,214,196)'; g.beginPath(); g.arc(x, y, 44, 0, 7); g.fill();
    g.strokeStyle = 'rgb(30,30,30)'; g.lineWidth = 6; g.stroke();
    g.strokeStyle = 'rgb(160,30,20)'; g.lineWidth = 4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 28, y - 22); g.stroke();
  }
  for (let x = -40; x < TS; x += 60) {
    g.fillStyle = 'rgb(200,160,40)';
    g.beginPath(); g.moveTo(x, TS - 20); g.lineTo(x + 30, TS - 20); g.lineTo(x + 70, TS - 90); g.lineTo(x + 40, TS - 90); g.closePath(); g.fill();
  }
  g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, TS - 90, TS, 4); g.fillRect(0, TS - 20, TS, 20);
  g.fillStyle = 'rgb(30,30,30)';
  for (const [x, y] of [[20, 20], [TS - 20, 20], [20, TS - 110], [TS - 20, TS - 110]]) { g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill(); }
  return c;
}

// 传送带：黑色橡胶带面 + 横向肋条（也用作黑色电缆）
function texConveyor() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(34,34,36)';
  g.fillRect(0, 0, TS, TS);
  const n1 = periodicNoise(8, 331, 3);
  eachPixel(g, (d, p, i) => {
    const k = 0.8 + n1[i] * 0.3, grain = (rand01(i, 67, 1) - 0.5) * 10;
    d[p] = d[p] * k + grain; d[p + 1] = d[p + 1] * k + grain; d[p + 2] = d[p + 2] * k + grain;
  });
  for (let x = 0; x < TS; x += 32) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x, 0, 6, TS); g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x + 6, 0, 3, TS); }
  return c;
}

// 指示灯：左半红灯、右半绿灯（自发光）
function texIndicator() {
  const c = newCanvas(), g = c.getContext('2d');
  for (const [x, col] of [[128, '255,40,30'], [384, '60,255,90']]) {
    const gr = g.createRadialGradient(x, 256, 10, x, 256, 180);
    gr.addColorStop(0, 'rgb(255,255,240)'); gr.addColorStop(0.35, `rgb(${col})`); gr.addColorStop(1, 'rgb(20,10,10)');
    g.fillStyle = gr; g.fillRect(x - 128, 0, 256, TS);
  }
  return c;
}

// Level 6 的出口：通往楼下的楼梯间入口
function texStairs() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(10,10,12)';
  g.fillRect(0, 0, TS, TS);
  for (let k = 0; k < 9; k++) {
    const y = 250 + k * 30, s = 1 - k * 0.07;
    g.fillStyle = `rgb(${70 - k * 6},${70 - k * 6},${74 - k * 6})`;
    g.fillRect(TS / 2 - 200 * s, TS - y + 180, 400 * s, 12);
  }
  g.strokeStyle = 'rgb(110,112,116)'; g.lineWidth = 8;
  g.beginPath(); g.moveTo(60, 200); g.lineTo(200, 470); g.stroke();
  g.fillStyle = 'rgb(80,80,84)'; g.fillRect(0, 0, 24, TS); g.fillRect(TS - 24, 0, 24, TS); g.fillRect(0, 0, TS, 20);
  return c;
}

// ------------------------------------------------------------
//  LEVEL 37：崇高（泳池房）—— 洁白无瑕、完全相同的瓷砖
// ------------------------------------------------------------
// 水鸭、滑道和光井的小型纯色图集；几何本身负责曲面与阴影
function texPoolColors() {
  const c = newCanvas(), g = c.getContext('2d');
  const colors = ['#f3bf25', '#e68024', '#171b1c', '#67989e', '#d8e2de', '#8a9a9c', '#e4e9e4', '#e9efeb'];
  colors.forEach((color, i) => { g.fillStyle = color; g.fillRect(i * TS / 8, 0, TS / 8, TS); });
  return c;
}

function tileTex(rows, seed) {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(177,191,189)'; // 细而清楚的填缝，亮处仍能看见砖面
  g.fillRect(0, 0, TS, TS);
  const cw = TS / 16, ch = TS / rows;
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < 16; q++) {
      const j = 0.99 + rand01(q, r, seed) * 0.01;
      g.fillStyle = `rgb(${225 * j | 0},${233 * j | 0},${231 * j | 0})`;
      g.fillRect(q * cw + 0.9, r * ch + 0.9, cw - 1.8, ch - 1.8);
      const gr = g.createLinearGradient(q * cw, r * ch, q * cw + cw, r * ch + ch);
      gr.addColorStop(0, 'rgba(255,255,255,0.15)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(q * cw + 0.9, r * ch + 0.9, cw - 1.8, ch - 1.8);
    }
  }
  return c;
}

function texWater() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(120,200,200)';
  g.fillRect(0, 0, TS, TS);
  return c;
}

// ------------------------------------------------------------
//  LEVEL FUN =)：派对邮轮
// ------------------------------------------------------------
function texL26Wall() {
  const c = newCanvas(), g = c.getContext('2d');
  const PX = TS / 2.6, rail = Math.round(TS - 0.95 * PX);
  g.fillStyle = 'rgb(232,212,150)';
  g.fillRect(0, 0, TS, TS);
  for (let x = 0; x < TS; x += 64) { g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, 0, 30, rail); }
  g.fillStyle = 'rgb(176,96,120)'; g.fillRect(0, rail, TS, TS - rail); // 护墙板
  g.fillStyle = 'rgb(120,70,40)'; g.fillRect(0, rail - 8, TS, 16); // 木扶手
  g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(0, rail - 8, TS, 3);
  const r = mulberry32(341);
  const cols = ['230,60,80', '60,160,230', '250,200,40', '90,200,110', '190,90,220'];
  for (let k = 0; k < 90; k++) {
    g.fillStyle = `rgba(${cols[k % 5]},0.55)`;
    const x = r() * TS, y = r() * rail;
    wrapDraw((dx) => g.fillRect(x + dx, y, 4, 7));
  }
  const n1 = periodicNoise(8, 342, 4, 0.5, 10), n2 = periodicNoise(2, 343, 3, 0.5, 3);
  eachPixel(g, (d, p, i) => {
    const grime = smoothstep(0.55, 0.85, n2[i]) * 0.25;
    const k = (0.88 + n1[i] * 0.16) * (1 - grime), grain = (rand01(i, 69, 1) - 0.5) * 7;
    d[p] = d[p] * k + grain; d[p + 1] = d[p + 1] * k + grain; d[p + 2] = d[p + 2] * k + grain;
  });
  // 早已干涸的深色污渍
  g.filter = 'blur(2px)';
  for (let k = 0; k < 3; k++) {
    const x = r() * TS, y = rail - 40 - r() * 150;
    g.fillStyle = 'rgba(90,20,20,0.35)';
    g.beginPath(); g.ellipse(x, y, 14 + r() * 20, 8 + r() * 10, r(), 0, 7); g.fill();
    g.fillRect(x - 2, y, 4, 30 + r() * 60);
  }
  g.filter = 'none';
  return c;
}

// 邮轮地毯：深紫红底 + 金色花纹 + 满地彩屑
function texL26Floor() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(96,30,58)';
  g.fillRect(0, 0, TS, TS);
  g.strokeStyle = 'rgba(214,170,70,0.5)'; g.lineWidth = 6;
  for (let y = 0; y <= TS; y += 128) {
    for (let x = 0; x <= TS; x += 128) {
      g.beginPath(); g.arc(x, y, 44, 0, 7); g.stroke();
      g.beginPath(); g.arc(x + 64, y + 64, 20, 0, 7); g.stroke();
    }
  }
  const n1 = periodicNoise(8, 351, 4), n2 = periodicNoise(2, 352, 3);
  eachPixel(g, (d, p, i) => {
    const fiber = (rand01(i, 71, 1) - 0.5) * 16, stain = smoothstep(0.62, 0.82, n2[i]);
    const k = (0.85 + n1[i] * 0.2) * (1 - stain * 0.3);
    d[p] = d[p] * k + fiber; d[p + 1] = d[p + 1] * k + fiber; d[p + 2] = d[p + 2] * k + fiber;
  });
  const r = mulberry32(353);
  const cols = ['240,70,90', '70,170,240', '255,215,50', '100,220,120', '220,120,240', '255,255,255'];
  for (let k = 0; k < 260; k++) {
    const x = r() * TS, y = r() * TS, a = r() * 3;
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = `rgb(${cols[k % cols.length]})`; g.fillRect(-4, -2, 8, 4);
    g.restore();
  }
  return c;
}

function texL26Ceil() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(228,222,208)';
  g.fillRect(0, 0, TS, TS);
  const n1 = periodicNoise(8, 361, 4);
  eachPixel(g, (d, p, i) => {
    const k = 0.92 + n1[i] * 0.1; d[p] *= k; d[p + 1] *= k; d[p + 2] *= k;
  });
  g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(0, 0, TS, 4); g.fillRect(0, 0, 4, TS); g.fillRect(256, 0, 4, TS);
  return c;
}

function texCake() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(246,220,228)';
  g.fillRect(0, 0, TS, TS);
  g.fillStyle = 'rgb(250,250,246)';
  g.beginPath(); g.moveTo(0, 0); g.lineTo(TS, 0); g.lineTo(TS, 110);
  for (let x = TS; x >= 0; x -= 32) g.lineTo(x, 110 + ((x / 32) % 2 ? 50 : 10) + rand01(x, 1, 5) * 30);
  g.closePath(); g.fill();
  const cols = ['230,60,80', '70,150,230', '250,200,40', '90,200,110'];
  for (let k = 0; k < 40; k++) { g.fillStyle = `rgb(${cols[k % 4]})`; g.fillRect(rand01(k, 2, 7) * TS, 200 + rand01(k, 3, 7) * 280, 10, 5); }
  g.fillStyle = 'rgb(200,120,150)'; g.fillRect(0, TS - 40, TS, 40);
  return c;
}

function texCloth() {
  const c = newCanvas(), g = c.getContext('2d');
  for (let y = 0; y < TS; y += 64) for (let x = 0; x < TS; x += 64) {
    g.fillStyle = ((x + y) / 64) % 2 ? 'rgb(236,110,140)' : 'rgb(248,240,236)';
    g.fillRect(x, y, 64, 64);
  }
  const n1 = periodicNoise(8, 371, 3);
  eachPixel(g, (d, p, i) => { const k = 0.88 + n1[i] * 0.14; d[p] *= k; d[p + 1] *= k; d[p + 2] *= k; });
  return c;
}

// 气球图集：红黄蓝绿四个
function texBalloon() {
  const c = newCanvas(), g = c.getContext('2d');
  const cols = [[220, 40, 50], [245, 200, 30], [40, 110, 220], [60, 180, 80]];
  cols.forEach(([R, G, B], q) => {
    const ox = (q & 1) * 256, oy = (q >> 1) * 256;
    const gr = g.createRadialGradient(ox + 100, oy + 90, 8, ox + 128, oy + 118, 110);
    gr.addColorStop(0, `rgb(${Math.min(255, R + 110)},${Math.min(255, G + 110)},${Math.min(255, B + 110)})`);
    gr.addColorStop(0.3, `rgb(${R},${G},${B})`);
    gr.addColorStop(1, `rgb(${R * 0.45 | 0},${G * 0.45 | 0},${B * 0.45 | 0})`);
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(ox + 128, oy + 116, 86, 104, 0, 0, 7); g.fill();
    g.beginPath(); g.moveTo(ox + 118, oy + 226); g.lineTo(ox + 138, oy + 226); g.lineTo(ox + 128, oy + 212); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.ellipse(ox + 96, oy + 70, 14, 24, -0.5, 0, 7); g.fill();
  });
  return c;
}

function partyPoster(g, ox, oy, title, sub, bg) {
  g.fillStyle = bg; g.fillRect(ox + 20, oy + 10, 216, 236);
  g.strokeStyle = 'rgb(250,240,200)'; g.lineWidth = 6; g.strokeRect(ox + 30, oy + 20, 196, 216);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgb(255,236,90)'; g.font = 'bold 34px Arial, sans-serif';
  g.fillText(title, ox + 128, oy + 62);
  g.fillStyle = 'rgb(255,255,255)'; g.font = 'bold 22px Arial, sans-serif';
  g.fillText(sub, ox + 128, oy + 98);
  g.fillStyle = 'rgb(255,220,40)'; g.beginPath(); g.arc(ox + 128, oy + 170, 50, 0, 7); g.fill();
  g.fillStyle = 'rgb(20,20,20)';
  g.fillRect(ox + 108, oy + 146, 10, 18); g.fillRect(ox + 138, oy + 146, 10, 18);
  g.lineWidth = 7; g.strokeStyle = 'rgb(20,20,20)';
  g.beginPath(); g.arc(ox + 128, oy + 172, 30, 0.2, Math.PI - 0.2); g.stroke();
}

function texParty() {
  const c = newCanvas(), g = c.getContext('2d');
  partyPoster(g, 0, 0, 'TIME 4 FUN', '=)  =)  =)', 'rgb(200,40,120)');
  partyPoster(g, 256, 0, 'JOIN US!', 'THE PARTY =)', 'rgb(40,90,200)');
  // 喷涂的“=)”
  sprayText(g, '=)', 128, 384, 'bold 150px Arial, sans-serif', 'rgb(250,210,30)', 10);
  sprayDrips(g, mulberry32(9), 60, 200, 440, 'rgba(240,200,30,0.8)', 8);
  // 三角彩旗
  const cols = ['230,60,80', '60,150,230', '250,200,40', '90,200,110', '200,90,220'];
  g.strokeStyle = 'rgb(240,240,240)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(256, 290); g.quadraticCurveTo(384, 330, 512, 290); g.stroke();
  for (let k = 0; k < 7; k++) {
    const x = 262 + k * 36, t = (x - 256) / 256, y = 290 + Math.sin(t * Math.PI) * 20;
    g.fillStyle = `rgb(${cols[k % 5]})`;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 30, y + 2); g.lineTo(x + 15, y + 50); g.closePath(); g.fill();
  }
  return c;
}

// 唯一的出路：文字左右颠倒、模糊失焦、没有笑脸的海报
function texRevPoster() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(36,30,34)';
  g.fillRect(0, 0, TS, TS);
  g.save();
  g.filter = 'blur(5px)';
  g.translate(TS, 0); g.scale(-1, 1);
  g.fillStyle = 'rgb(150,60,110)'; g.fillRect(40, 30, TS - 80, TS - 60);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgb(230,220,150)'; g.font = 'bold 76px Arial, sans-serif';
  g.fillText('TIME 4', TS / 2, 150);
  g.fillText('FUN', TS / 2, 240);
  g.font = 'bold 38px Arial, sans-serif'; g.fillStyle = 'rgb(220,220,220)';
  g.fillText('NO PARTY', TS / 2, 350);
  g.restore();
  g.filter = 'none';
  return c;
}

// 派对客（Partygoer）：黄色的人形，漆黑的眼睛，咧到耳根的笑。逻辑坐标 100x220
function drawPartygoer(g) {
  const Y = 'rgb(236,196,40)', D = 'rgb(150,110,20)';
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = D; g.lineWidth = 8;
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(50 + s * 9, 130); g.lineTo(50 + s * 12, 175); g.lineTo(50 + s * 11, 216); g.stroke(); }
  g.fillStyle = Y;
  g.beginPath(); g.moveTo(32, 64); g.lineTo(68, 64); g.lineTo(64, 136); g.lineTo(36, 136); g.closePath(); g.fill();
  g.strokeStyle = Y; g.lineWidth = 7;
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(50 + s * 17, 68); g.lineTo(50 + s * 28, 112); g.lineTo(50 + s * 26, 150); g.stroke(); }
  g.fillStyle = Y; g.beginPath(); g.arc(50, 34, 26, 0, 7); g.fill();
  g.fillStyle = 'rgb(10,8,6)';
  g.beginPath(); g.ellipse(40, 28, 5, 8, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(60, 28, 5, 8, 0, 0, 7); g.fill();
  g.beginPath(); g.moveTo(28, 38); g.quadraticCurveTo(50, 64, 72, 38); g.quadraticCurveTo(50, 50, 28, 38); g.fill();
  g.fillStyle = 'rgb(250,248,236)';
  for (let k = 0; k < 7; k++) { const x = 33 + k * 5.6; g.beginPath(); g.moveTo(x, 41 + Math.sin(k / 6 * Math.PI) * 4); g.lineTo(x + 4, 41 + Math.sin(k / 6 * Math.PI) * 4); g.lineTo(x + 2, 47 + Math.sin(k / 6 * Math.PI) * 5); g.fill(); }
}

// 地上的断线（冒火花）
function texWire() {
  const c = newCanvas(), g = c.getContext('2d');
  g.strokeStyle = 'rgb(20,20,22)'; g.lineWidth = 16; g.lineCap = 'round';
  g.beginPath(); g.moveTo(20, 400); g.bezierCurveTo(140, 250, 260, 470, 380, 300); g.quadraticCurveTo(430, 230, 440, 170); g.stroke();
  g.strokeStyle = 'rgb(200,120,50)'; g.lineWidth = 3;
  for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(440, 170); g.lineTo(440 + Math.cos(k) * 30, 170 - Math.abs(Math.sin(k * 1.7)) * 34); g.stroke(); }
  return c;
}

// ------------------------------------------------------------
//  LEVEL !：红灯长廊
// ------------------------------------------------------------
function texLRWall() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(60,58,56)';
  g.fillRect(0, 0, TS, TS);
  const r = mulberry32(333);
  for (let y = 0; y < TS; y += 64) {
    for (let x = 0; x < TS; x += 64) {
      const t = r();
      g.fillStyle = `rgb(${200 + t * 20 | 0},${198 + t * 18 | 0},${190 + t * 16 | 0})`;
      g.fillRect(x + 3, y + 3, 58, 58);
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x + 3, y + 3, 58, 3);
    }
  }
  const n1 = periodicNoise(4, 121, 5), n2 = periodicNoise(2, 122, 4);
  eachPixel(g, (d, p, i, x, y) => {
    const v = y / TS;
    const grime = smoothstep(0.5, 0.8, n2[i]) * 0.5 + smoothstep(0.55, 1.0, v) * 0.45;
    const k = (0.78 + n1[i] * 0.3) * (1 - Math.min(grime, 0.85));
    const grain = (rand01(i, 27, 1) - 0.5) * 10;
    d[p] = d[p] * k + grain; d[p + 1] = d[p + 1] * k * 0.97 + grain; d[p + 2] = d[p + 2] * k * 0.92 + grain;
  });
  return c;
}

function texLRFloor() {
  const c = newCanvas(), g = c.getContext('2d');
  for (let y = 0; y < TS; y += 128) {
    for (let x = 0; x < TS; x += 128) {
      g.fillStyle = ((x + y) / 128) % 2 ? 'rgb(58,56,54)' : 'rgb(84,82,78)';
      g.fillRect(x, y, 128, 128);
    }
  }
  const n1 = periodicNoise(8, 131, 5), n2 = periodicNoise(3, 132, 4);
  eachPixel(g, (d, p, i) => {
    const grain = (rand01(i, 29, 1) - 0.5) * 14;
    const st = smoothstep(0.58, 0.75, n2[i]);
    const k = (0.75 + n1[i] * 0.4) * (1 - st * 0.4);
    d[p] = d[p] * k + grain; d[p + 1] = d[p + 1] * k + grain; d[p + 2] = d[p + 2] * k + grain;
  });
  drawCracks(g, 5, 4, 0.5);
  return c;
}

// ------------------------------------------------------------
//  出口门 & EXIT 标志
// ------------------------------------------------------------
function texDoor() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(40,40,38)';
  g.fillRect(0, 0, TS, TS);
  g.fillStyle = 'rgb(92,100,94)';
  g.fillRect(34, 20, TS - 68, TS - 20);
  const n1 = periodicNoise(8, 141, 4);
  eachPixel(g, (d, p, i, x, y) => {
    if (x < 34 || x > TS - 34 || y < 20) return;
    const k = 0.82 + n1[i] * 0.3, grain = (rand01(i, 31, 1) - 0.5) * 10;
    d[p] = d[p] * k + grain; d[p + 1] = d[p + 1] * k + grain; d[p + 2] = d[p + 2] * k + grain;
  });
  // 推杆
  g.fillStyle = 'rgb(58,60,58)'; g.fillRect(60, 238, TS - 120, 30);
  g.fillStyle = 'rgb(170,172,168)'; g.fillRect(64, 242, TS - 128, 18);
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(64, 242, TS - 128, 4);
  // 踢脚板
  g.fillStyle = 'rgb(130,132,128)'; g.fillRect(40, 452, TS - 80, 56);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(40, 452, TS - 80, 3);
  const r = mulberry32(1);
  g.strokeStyle = 'rgba(210,210,200,0.18)';
  for (let k = 0; k < 30; k++) {
    const x = 40 + r() * (TS - 80), y = 30 + r() * 420;
    g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 60, y + (r() - 0.5) * 10); g.stroke();
  }
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(34, 20, 4, TS); g.fillRect(TS - 38, 20, 4, TS);
  return c;
}

// ------------------------------------------------------------
//  LEVEL 994：细沙、海边的岩壁、刻着 EXIST 的铁门
// ------------------------------------------------------------
function texSand() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(222,200,158)';
  g.fillRect(0, 0, TS, TS);
  const n1 = periodicNoise(4, 941, 4), n2 = periodicNoise(16, 942, 3), ripple = periodicNoise(2, 943, 2);
  eachPixel(g, (d, p, i, x, y) => {
    // 风吹出的细密沙纹 + 颗粒
    const w = Math.sin((y / TS) * Math.PI * 2 * 22 + ripple[i] * 9 + (x / TS) * Math.PI * 2 * 2) * 0.5 + 0.5;
    const grain = (rand01(i, 17, 9) - 0.5) * 26;
    const k = 0.86 + n1[i] * 0.16 + (n2[i] - 0.5) * 0.08 + w * 0.05;
    d[p] = d[p] * k + grain; d[p + 1] = d[p + 1] * k + grain * 0.95; d[p + 2] = d[p + 2] * k + grain * 0.85;
  });
  // 零星的小石子与贝壳碎片
  const r = mulberry32(944);
  for (let k = 0; k < 70; k++) {
    const x = r() * TS, y = r() * TS, s = 1 + r() * 3.5, v = 120 + r() * 120;
    g.fillStyle = r() < 0.3 ? `rgb(${v + 60 | 0},${v + 50 | 0},${v + 40 | 0})` : `rgb(${v * 0.6 | 0},${v * 0.58 | 0},${v * 0.55 | 0})`;
    wrapDraw((dx, dy) => { g.beginPath(); g.ellipse(x + dx, y + dy, s, s * 0.7, r() * 3, 0, Math.PI * 2); g.fill(); });
  }
  return c;
}

// 岩壁：一张贴图横向覆盖 4m、纵向覆盖 23m，所以纹理在纵向上是“压扁”画的。
// 砂岩的水平沉积层（颜色一层层变化）、风化的细密颗粒、从上往下的水渍，以及几道斜向的节理裂缝
function texCliff() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(150,128,102)';
  g.fillRect(0, 0, TS, TS);
  const wob = periodicNoise(2, 951, 3, 0.5, 6), fine = periodicNoise(24, 952, 3, 0.55, 64), mid = periodicNoise(6, 953, 4, 0.5, 20);
  const layerTone = [];
  const rr = mulberry32(955);
  for (let k = 0; k < 64; k++) layerTone.push([0.78 + rr() * 0.35, rr()]);
  const pal = [[168, 142, 110], [138, 116, 92], [184, 160, 126], [120, 104, 88], [158, 124, 96]];
  eachPixel(g, (d, p, i, x, y) => {
    // 层理：y 方向按带状变化，边界被低频噪声扭曲
    const yy = (y / TS) * 64 + (wob[i] - 0.5) * 3.2;
    const li = ((Math.floor(yy) % 64) + 64) % 64, fr = yy - Math.floor(yy);
    const [tone, pc] = layerTone[li];
    const base = pal[Math.floor(pc * pal.length)];
    const seam = smoothstep(0.08, 0.0, fr) * 0.35 + smoothstep(0.92, 1.0, fr) * 0.12;
    const k = tone * (0.8 + mid[i] * 0.32) * (0.9 + fine[i] * 0.2) * (1 - seam);
    const grain = (rand01(i, 23, 5) - 0.5) * 16;
    d[p] = base[0] * k + grain; d[p + 1] = base[1] * k + grain; d[p + 2] = base[2] * k + grain;
  });
  // 水渍：从上往下的深色竖条
  const r = mulberry32(956);
  for (let k = 0; k < 26; k++) {
    const x = r() * TS, w = 3 + r() * 14, y0 = r() * TS, len = 60 + r() * 260;
    const gr = g.createLinearGradient(0, y0, 0, y0 + len);
    gr.addColorStop(0, 'rgba(40,30,22,0.22)'); gr.addColorStop(1, 'rgba(40,30,22,0)');
    g.fillStyle = gr;
    wrapDraw((dx, dy) => g.fillRect(x + dx, y0 + dy, w, len));
  }
  // 节理裂缝
  g.lineCap = 'round';
  for (let k = 0; k < 14; k++) {
    let x = r() * TS, y = r() * TS;
    const segs = 6 + Math.floor(r() * 10);
    g.strokeStyle = 'rgba(30,22,16,0.55)'; g.lineWidth = 1 + r() * 2;
    wrapDraw((dx, dy) => {
      let px = x, py = y;
      g.beginPath(); g.moveTo(px + dx, py + dy);
      const rs = mulberry32(k * 31 + 7);
      for (let q = 0; q < segs; q++) { px += (rs() - 0.5) * 24; py += 4 + rs() * 10; g.lineTo(px + dx, py + dy); }
      g.stroke();
    });
  }
  return c;
}

// 沙地上的脚印（左 / 右各占一半），边缘半透明
function texFootprint() {
  const c = newCanvas(), g = c.getContext('2d');
  g.clearRect(0, 0, TS, TS);
  for (const [cx, flip] of [[TS * 0.25, -1], [TS * 0.75, 1]]) {
    g.save();
    g.translate(cx, TS / 2);
    g.scale(flip, 1);
    const gr = g.createRadialGradient(0, 0, 10, 0, 0, 140);
    gr.addColorStop(0, 'rgba(70,52,34,0.75)'); gr.addColorStop(1, 'rgba(70,52,34,0)');
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(6, -60, 54, 110, 0.08, 0, Math.PI * 2); g.fill(); // 前掌
    g.beginPath(); g.ellipse(-4, 130, 42, 70, 0, 0, Math.PI * 2); g.fill(); // 脚跟
    g.restore();
  }
  return c;
}

// 铁门：锈蚀的竖向铁条、上下横档，门楣铁牌上刻着 EXIST
function texExistGate() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(18,16,14)';
  g.fillRect(0, 0, TS, TS);
  const rust = (x, y, w, h, base) => {
    const gr = g.createLinearGradient(x, 0, x + w, 0);
    gr.addColorStop(0, `rgb(${base * 0.55 | 0},${base * 0.36 | 0},${base * 0.26 | 0})`);
    gr.addColorStop(0.5, `rgb(${base | 0},${base * 0.62 | 0},${base * 0.42 | 0})`);
    gr.addColorStop(1, `rgb(${base * 0.5 | 0},${base * 0.33 | 0},${base * 0.24 | 0})`);
    g.fillStyle = gr; g.fillRect(x, y, w, h);
  };
  for (let x = 30; x < TS - 20; x += 38) rust(x, 110, 14, TS - 110, 150);
  rust(10, 0, 26, TS, 130); rust(TS - 36, 0, 26, TS, 130);
  for (const y of [110, 300, TS - 34]) { g.fillStyle = 'rgb(96,62,44)'; g.fillRect(10, y, TS - 20, 22); }
  // 门楣铁牌
  g.fillStyle = 'rgb(70,52,40)'; g.fillRect(40, 18, TS - 80, 80);
  g.strokeStyle = 'rgb(30,22,18)'; g.lineWidth = 4; g.strokeRect(44, 22, TS - 88, 72);
  g.save();
  g.translate(TS / 2, 60);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 64px "Times New Roman", serif';
  g.fillStyle = 'rgb(28,20,16)'; g.fillText('EXIST', 2, 3);
  g.fillStyle = 'rgb(190,150,110)'; g.fillText('EXIST', 0, 0);
  g.restore();
  const n1 = periodicNoise(8, 961, 4);
  eachPixel(g, (d, p, i) => {
    if (d[p] < 30 && d[p + 1] < 30) { d[p + 3] = 255; return; }
    const k = 0.75 + n1[i] * 0.5, grain = (rand01(i, 29, 3) - 0.5) * 18;
    d[p] = d[p] * k + grain; d[p + 1] = d[p + 1] * k * 0.95 + grain; d[p + 2] = d[p + 2] * k * 0.9 + grain;
  });
  return c;
}

function texSign() {
  const c = newCanvas(), g = c.getContext('2d');
  g.fillStyle = 'rgb(28,10,10)';
  g.fillRect(0, 0, TS, TS);
  g.fillStyle = 'rgb(60,56,52)';
  g.fillRect(0, 0, TS, 26); g.fillRect(0, TS - 26, TS, 26); g.fillRect(0, 0, 14, TS); g.fillRect(TS - 14, 0, 14, TS);
  g.save();
  g.translate(TS / 2, TS / 2);
  g.scale(1, 2.4);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'bold 150px Arial, Helvetica, sans-serif';
  g.fillStyle = 'rgb(255,48,34)';
  g.fillText('EXIT', 0, 6);
  g.restore();
  return c;
}

// ------------------------------------------------------------
//  物品精灵
// ------------------------------------------------------------
function drawAlmond(g) {
  g.save();
  g.scale(TS / 100, TS / 100); // 逻辑坐标 100x100 对应 0.45m 见方
  const cx = 50;
  // 瓶身
  g.fillStyle = 'rgb(214,226,232)';
  g.beginPath();
  g.moveTo(cx - 15, 96); g.lineTo(cx + 15, 96);
  g.quadraticCurveTo(cx + 18, 96, cx + 18, 90);
  g.lineTo(cx + 18, 44);
  g.quadraticCurveTo(cx + 18, 34, cx + 7, 28);
  g.lineTo(cx + 7, 18); g.lineTo(cx - 7, 18); g.lineTo(cx - 7, 28);
  g.quadraticCurveTo(cx - 18, 34, cx - 18, 44);
  g.lineTo(cx - 18, 90);
  g.quadraticCurveTo(cx - 18, 96, cx - 15, 96);
  g.fill();
  // 液体
  g.fillStyle = 'rgb(244,236,212)';
  g.fillRect(cx - 16, 50, 32, 44);
  // 标签
  g.fillStyle = 'rgb(210,168,96)';
  g.fillRect(cx - 18, 58, 36, 20);
  g.fillStyle = 'rgb(110,70,30)';
  g.font = 'bold 6.4px Arial';
  g.textAlign = 'center';
  g.fillText('ALMOND', cx, 66);
  g.fillText('WATER', cx, 74);
  g.fillStyle = 'rgb(160,110,50)';
  g.beginPath(); g.ellipse(cx, 84, 4, 2.5, 0.4, 0, 7); g.fill();
  // 高光
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.fillRect(cx - 13, 42, 3, 46);
  // 瓶盖
  g.fillStyle = 'rgb(56,110,190)';
  g.fillRect(cx - 8, 10, 16, 9);
  g.fillStyle = 'rgb(120,170,240)';
  g.fillRect(cx - 8, 10, 16, 2);
  g.restore();
}

function drawBattery(g) {
  g.save();
  g.scale(TS / 100, TS / 100);
  const cx = 50;
  g.fillStyle = 'rgb(20,20,22)';
  g.fillRect(cx - 17, 30, 34, 66);
  g.fillStyle = 'rgb(214,120,30)';
  g.fillRect(cx - 17, 20, 34, 26);
  g.fillStyle = 'rgb(160,160,165)';
  g.fillRect(cx - 7, 13, 14, 7);
  g.fillStyle = 'rgb(200,200,205)';
  g.fillRect(cx - 17, 93, 34, 3);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(cx - 13, 22, 4, 72);
  g.fillStyle = 'rgb(240,240,240)';
  g.font = 'bold 12px Arial';
  g.textAlign = 'center';
  g.fillText('+', cx + 2, 38);
  g.font = 'bold 8px Arial';
  g.fillStyle = 'rgb(214,120,30)';
  g.fillText('9V', cx, 70);
  g.fillText('MAX', cx, 80);
  g.restore();
}

// ------------------------------------------------------------
//  实体精灵（也用于跳吓画面）
// ------------------------------------------------------------
// Smiler：黑暗中漂浮的眼睛与笑容。逻辑坐标 100x100
function drawSmiler(g) {
  g.fillStyle = 'rgb(250,250,246)';
  for (const s of [-1, 1]) {
    g.save();
    g.translate(50 + s * 17, 36);
    g.rotate(s * 0.28);
    g.beginPath();
    g.moveTo(-11, 0);
    g.quadraticCurveTo(0, -9 * 1.0, 11, 0);
    g.quadraticCurveTo(0, 5, -11, 0);
    g.fill();
    g.restore();
  }
  // 嘴：黑色月牙里一排尖牙
  const mouth = new Path2D();
  mouth.moveTo(14, 54);
  mouth.quadraticCurveTo(50, 70, 86, 54);
  mouth.quadraticCurveTo(50, 96, 14, 54);
  g.fillStyle = 'rgb(8,6,6)';
  g.fill(mouth);
  g.save();
  g.clip(mouth);
  g.fillStyle = 'rgb(246,244,236)';
  const n = 15;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, x = 14 + t * 72;
    const yTop = 54 + Math.sin(t * Math.PI) * 8;
    const yBot = 54 + Math.sin(t * Math.PI) * 21;
    const w = 72 / n * 0.55;
    g.beginPath(); g.moveTo(x - w, yTop - 2); g.lineTo(x + w, yTop - 2); g.lineTo(x, yTop + 7 + Math.sin(t * Math.PI) * 4); g.fill();
    g.beginPath(); g.moveTo(x - w, yBot + 2); g.lineTo(x + w, yBot + 2); g.lineTo(x, yBot - 6 - Math.sin(t * Math.PI) * 3); g.fill();
  }
  g.restore();
}

// Hound：四肢着地的人形生物。逻辑坐标 170x120（1.7m x 1.2m）
function drawHound(g, eyesOnly) {
  if (eyesOnly) {
    g.fillStyle = 'rgb(255,250,235)';
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(85 + s * 6, 52, 2.2, 1.6, 0, 0, 7); g.fill(); }
    return;
  }
  const skin = 'rgb(112,104,98)', dark = 'rgb(40,36,34)';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // 后腿
  g.strokeStyle = dark;
  g.lineWidth = 7;
  for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(85 + s * 14, 50); g.lineTo(85 + s * 38, 36); g.lineTo(85 + s * 46, 118); g.stroke();
  }
  // 身体
  g.fillStyle = skin;
  g.beginPath(); g.ellipse(85, 52, 26, 18, 0, 0, 7); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.3)';
  for (let k = 0; k < 5; k++) { g.fillRect(64, 44 + k * 5, 42, 1.6); }
  // 前臂
  g.strokeStyle = skin;
  g.lineWidth = 6.5;
  for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(85 + s * 20, 48); g.lineTo(85 + s * 52, 70); g.lineTo(85 + s * 60, 116); g.stroke();
    g.lineWidth = 2.2;
    for (let f = -2; f <= 2; f++) {
      g.beginPath(); g.moveTo(85 + s * 60, 116); g.lineTo(85 + s * 60 + f * 4 + s * 3, 119.5); g.stroke();
    }
    g.lineWidth = 6.5;
  }
  // 头
  g.fillStyle = skin;
  g.beginPath(); g.ellipse(85, 58, 13, 15, 0, 0, 7); g.fill();
  // 长发垂下
  g.fillStyle = 'rgb(14,12,12)';
  g.beginPath();
  g.moveTo(70, 50);
  g.quadraticCurveTo(85, 36, 100, 50);
  for (let k = 0; k <= 12; k++) {
    const t = k / 12, x = 101 - t * 32;
    g.lineTo(x, 88 + ((k % 2) ? 10 : 0) + Math.sin(k * 1.7) * 5);
  }
  g.closePath();
  g.fill();
  // 发缝中露出的眼窝
  g.fillStyle = 'rgb(4,2,2)';
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(85 + s * 6, 52, 3.4, 2.6, 0, 0, 7); g.fill(); }
}

// Stalker：高瘦的苍白人形。逻辑坐标 100x240（1.0m x 2.4m）
function drawStalker(g, eyesOnly) {
  if (eyesOnly) {
    g.fillStyle = 'rgb(255,255,255)';
    for (const s of [-1, 1]) { g.beginPath(); g.arc(50 + s * 6, 27, 1.5, 0, 7); g.fill(); }
    return;
  }
  const skin = 'rgb(178,172,164)', shade = 'rgb(120,114,108)';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // 腿
  g.strokeStyle = shade;
  g.lineWidth = 7;
  for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(50 + s * 7, 128); g.lineTo(50 + s * 10, 182); g.lineTo(50 + s * 9, 236); g.stroke();
  }
  // 躯干
  g.fillStyle = skin;
  g.beginPath();
  g.moveTo(35, 58); g.lineTo(65, 58); g.lineTo(60, 132); g.lineTo(40, 132);
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(60,54,50,0.5)';
  g.lineWidth = 1.2;
  for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(40, 70 + k * 6); g.quadraticCurveTo(50, 74 + k * 6, 60, 70 + k * 6); g.stroke(); }
  // 手臂（过长）
  g.strokeStyle = skin;
  g.lineWidth = 5;
  for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(50 + s * 15, 60); g.lineTo(50 + s * 22, 118); g.lineTo(50 + s * 20, 178); g.stroke();
    g.lineWidth = 1.8;
    for (let f = -2; f <= 2; f++) { g.beginPath(); g.moveTo(50 + s * 20, 178); g.lineTo(50 + s * 20 + f * 1.8, 194); g.stroke(); }
    g.lineWidth = 5;
  }
  // 脖子和头
  g.fillStyle = skin;
  g.fillRect(46, 40, 8, 20);
  const fg = g.createRadialGradient(48, 20, 2, 50, 27, 19);
  fg.addColorStop(0, 'rgb(196,190,180)');
  fg.addColorStop(1, 'rgb(104,98,92)');
  g.fillStyle = fg;
  g.beginPath(); g.ellipse(50, 26, 11, 17, 0, 0, 7); g.fill();
  // 皮肤上的裂纹
  g.strokeStyle = 'rgba(70,40,40,0.55)';
  g.lineWidth = 0.5;
  for (const [x0, y0, x1, y1, x2, y2] of [[43, 12, 46, 17, 44, 21], [56, 11, 54, 16, 57, 19], [47, 33, 45, 37, 46, 41], [55, 32, 57, 36, 55, 40]]) {
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  }
  g.fillStyle = 'rgb(6,4,4)';
  for (const s of [-1, 1]) {
    g.beginPath(); g.ellipse(50 + s * 5.5, 26, 3.6, 5, s * 0.15, 0, 7); g.fill();
    // 黑色泪痕
    g.beginPath();
    g.moveTo(50 + s * 5.5 - 1.2, 29);
    g.quadraticCurveTo(50 + s * 5.8, 35, 50 + s * 5.2, 40);
    g.lineTo(50 + s * 5.5 + 0.6, 40);
    g.quadraticCurveTo(50 + s * 6.4, 34, 50 + s * 5.5 + 1.2, 29);
    g.fill();
  }
  // 张开的嘴和牙
  g.beginPath(); g.ellipse(50, 37.5, 3.4, 5.2, 0, 0, 7); g.fill();
  g.fillStyle = 'rgb(214,206,186)';
  for (let k = -2; k <= 2; k++) {
    g.beginPath(); g.moveTo(50 + k * 1.25 - 0.55, 33.2 + Math.abs(k) * 0.35); g.lineTo(50 + k * 1.25 + 0.55, 33.2 + Math.abs(k) * 0.35); g.lineTo(50 + k * 1.25, 35.2); g.fill();
    g.beginPath(); g.moveTo(50 + k * 1.25 - 0.55, 41.8 - Math.abs(k) * 0.35); g.lineTo(50 + k * 1.25 + 0.55, 41.8 - Math.abs(k) * 0.35); g.lineTo(50 + k * 1.25, 40); g.fill();
  }
}

// 人类幸存者：逻辑坐标 100x240（1.7m 高）。轮廓要在一眼之内看清是人
function drawSurvivor(g) {
  const coat = 'rgb(96,104,84)', coatDark = 'rgb(62,70,56)', jeans = 'rgb(58,66,80)', skin = 'rgb(206,176,150)';
  g.lineCap = 'round'; g.lineJoin = 'round';
  // 腿 + 鞋
  g.strokeStyle = jeans; g.lineWidth = 9;
  for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(50 + s * 8, 128); g.lineTo(50 + s * 9, 188); g.lineTo(50 + s * 8, 232); g.stroke();
    g.fillStyle = 'rgb(28,26,24)';
    g.beginPath(); g.ellipse(50 + s * 8, 234, 7, 4, 0, 0, 7); g.fill();
    g.strokeStyle = jeans; g.lineWidth = 9;
  }
  // 躯干
  g.fillStyle = coat;
  g.beginPath();
  g.moveTo(34, 62); g.lineTo(66, 62); g.lineTo(62, 132); g.lineTo(38, 132);
  g.closePath(); g.fill();
  g.fillStyle = coatDark;
  g.fillRect(47, 64, 6, 66);
  // 反光背心条
  g.fillStyle = 'rgba(226,214,120,0.75)';
  g.fillRect(36, 88, 28, 5);
  g.fillRect(36, 104, 28, 5);
  // 背包
  g.fillStyle = 'rgb(48,52,44)';
  g.beginPath(); g.roundRect ? g.roundRect(30, 70, 12, 46, 4) : g.rect(30, 70, 12, 46); g.fill();
  // 手臂：一只手举着手电
  g.strokeStyle = coat; g.lineWidth = 7;
  g.beginPath(); g.moveTo(36, 66); g.lineTo(26, 118); g.lineTo(30, 150); g.stroke();
  g.beginPath(); g.moveTo(64, 66); g.lineTo(74, 108); g.lineTo(70, 126); g.stroke();
  g.strokeStyle = skin; g.lineWidth = 6;
  g.beginPath(); g.moveTo(30, 150); g.lineTo(30, 160); g.stroke();
  g.beginPath(); g.moveTo(70, 126); g.lineTo(70, 136); g.stroke();
  // 手电
  g.fillStyle = 'rgb(36,36,34)';
  g.fillRect(66, 133, 8, 14);
  g.fillStyle = 'rgb(255,244,206)';
  g.beginPath(); g.ellipse(70, 148, 5, 3, 0, 0, 7); g.fill();
  // 脖子 + 头
  g.fillStyle = skin;
  g.fillRect(46, 44, 8, 18);
  g.beginPath(); g.ellipse(50, 30, 12, 15, 0, 0, 7); g.fill();
  // 头发 / 帽子
  g.fillStyle = 'rgb(40,36,32)';
  g.beginPath(); g.ellipse(50, 21, 13, 9, 0, Math.PI, 0); g.fill();
  // 眼睛的反光
  g.fillStyle = 'rgb(20,18,16)';
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(50 + s * 4.5, 30, 1.9, 2.4, 0, 0, 7); g.fill(); }
  // 围巾
  g.fillStyle = 'rgb(126,72,58)';
  g.fillRect(42, 44, 16, 7);
  g.beginPath(); g.moveTo(56, 50); g.lineTo(62, 66); g.lineTo(56, 68); g.lineTo(52, 52); g.fill();
}

function spriteCanvas(drawFn, lw, lh) {
  const c = newCanvas(), g = c.getContext('2d');
  g.save();
  g.scale(TS / lw, TS / lh);
  drawFn(g);
  g.restore();
  return c;
}

// 生成所有纹理层，返回 canvas 数组
function buildTextureLayers(onProgress) {
  const L = new Array(TEX.COUNT);
  const jobs = [
    [TEX.L0_WALL, texL0Wall], [TEX.L0_FLOOR, texL0Floor], [TEX.L0_CEIL, texL0Ceil],
    [TEX.LIGHT, () => texLight(true)], [TEX.LIGHT_OFF, () => texLight(false)],
    [TEX.L1_WALL, texL1Wall], [TEX.L1_FLOOR, texL1Floor], [TEX.L1_CEIL, texL1Ceil], [TEX.CRATE, texCrate],
    [TEX.L2_WALL, texL2Wall], [TEX.L2_FLOOR, texL2Floor], [TEX.L2_CEIL, texL2Ceil], [TEX.PIPE, texPipe],
    [TEX.LR_WALL, texLRWall], [TEX.LR_FLOOR, texLRFloor],
    [TEX.DOOR, texDoor], [TEX.SIGN, texSign],
    [TEX.ALMOND, () => spriteCanvas(drawAlmond, TS, TS)],
    [TEX.BATTERY, () => spriteCanvas(drawBattery, TS, TS)],
    [TEX.SMILER, () => spriteCanvas(drawSmiler, 100, 100)],
    [TEX.HOUND, () => spriteCanvas((g) => drawHound(g, false), 170, 120)],
    [TEX.HOUND_EYES, () => spriteCanvas((g) => drawHound(g, true), 170, 120)],
    [TEX.STALKER, () => spriteCanvas((g) => drawStalker(g, false), 100, 240)],
    [TEX.STALKER_EYES, () => spriteCanvas((g) => drawStalker(g, true), 100, 240)],
    [TEX.L1_COLUMN, texL1Column], [TEX.L1_BEAM, texL1Beam],
    [TEX.PIPE_PAINT, texPipePaint], [TEX.PIPE_INSUL, texPipeInsul],
    [TEX.BULB, texBulb], [TEX.METAL, texMetal], [TEX.VALVE, texValve],
    [TEX.PUDDLE, () => texPuddle(false)], [TEX.OOZE, () => texPuddle(true)],
    [TEX.DECAL, texDecal], [TEX.STEAM, texSteam],
    [TEX.L4_WALL, texL4Wall], [TEX.L4_FLOOR, texL4Floor], [TEX.L4_CEIL, texL4Ceil],
    [TEX.DESK, texDesk], [TEX.PARTITION, texPartition], [TEX.MONITOR, texMonitor], [TEX.WINDOW, texWindow],
    [TEX.L15_WALL, texL15Wall], [TEX.L15_FLOOR, texL15Floor], [TEX.L15_CEIL, texL15Ceil],
    [TEX.HDOOR, texHouseDoor], [TEX.PICTURE, texPictures],
    [TEX.L3_WALL, texL3Wall], [TEX.ELECBOX, texElecBox], [TEX.GENERATOR, texGenerator], [TEX.CONVEYOR, texConveyor],
    [TEX.INDICATOR, texIndicator], [TEX.STAIRS, texStairs],
    [TEX.L37_TILE, () => tileTex(16, 381)], [TEX.L37_WALL, () => tileTex(27, 382)], [TEX.WATER, texWater],
    [TEX.L26_WALL, texL26Wall], [TEX.L26_FLOOR, texL26Floor], [TEX.L26_CEIL, texL26Ceil], [TEX.CAKE, texCake], [TEX.CLOTH, texCloth],
    [TEX.BALLOON, texBalloon], [TEX.PARTY, texParty], [TEX.REV_POSTER, texRevPoster],
    [TEX.PARTYGOER, () => spriteCanvas(drawPartygoer, 100, 220)], [TEX.WIRE, texWire],
    [TEX.POOL_COLORS, texPoolColors],
    [TEX.POOL_SKY, () => newCanvas()], // 天空由着色器按视线方向绘制
    [TEX.OFFICE_PARTS, texOfficeParts], [TEX.KEYBOARD, texKeyboard], [TEX.PC_FRONT, texPcFront],
    [TEX.VENDING, texVending], [TEX.WINDOW_BLACK, texWindowBlack],
    [TEX.SAND, texSand], [TEX.CLIFF, texCliff], [TEX.EXIST_GATE, texExistGate],
    [TEX.SEA, () => newCanvas()], // 海面由着色器按潮位绘制
    [TEX.FOOTPRINT, texFootprint],
    [TEX.SURVIVOR, () => spriteCanvas(drawSurvivor, 100, 240)],
  ];
  jobs.forEach(([idx, fn], k) => {
    L[idx] = fn();
    if (onProgress) onProgress((k + 1) / jobs.length);
  });
  _noiseCache.clear();
  return L;
}
