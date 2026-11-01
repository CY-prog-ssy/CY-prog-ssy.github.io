'use strict';
// ============================================================
//  通用工具：数学、哈希、随机数、噪声、矩阵
// ============================================================

const CELL = 2.0;      // 每个格子的边长（米）
const CHUNK = 16;      // 每个区块的格子数（必须是 16，world.js 用了位运算）
const WALL_T = 0.09;   // 墙体半厚度
const PILLAR_HALF = [0, 0.22, 0.32, 0.46]; // 柱子半宽：1 = Level 0 方柱，2 = 走廊柱，3 = Level 1 结构柱

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

function ihash(a, b, c) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
const rand01 = (a, b, c) => ihash(a, b, c) / 4294967296;

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function vnoise(x, z, seed) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = rand01(xi, zi, seed), b = rand01(xi + 1, zi, seed);
  const c = rand01(xi, zi + 1, seed), d = rand01(xi + 1, zi + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

function fbm(x, z, seed, oct = 3) {
  let s = 0, amp = 1, tot = 0, f = 1;
  for (let i = 0; i < oct; i++) {
    s += vnoise(x * f, z * f, seed + i * 131) * amp;
    tot += amp; amp *= 0.5; f *= 2;
  }
  return s / tot;
}

function vnoise1(t, seed) {
  const i = Math.floor(t), f = t - i;
  const u = f * f * (3 - 2 * f);
  return lerp(rand01(i, seed, 7), rand01(i + 1, seed, 7), u);
}

// ---------- 4x4 矩阵（列主序） ----------
const Mat4 = {
  create() { return new Float32Array(16); },
  perspective(out, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
    return out;
  },
  // yaw=0 时朝向 -Z
  view(out, px, py, pz, yaw, pitch, roll) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const fx = -sy * cp, fy = sp, fz = -cy * cp;
    let rx = cy, ry = 0, rz = -sy;
    // up = right x forward
    let ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
    if (roll) {
      const cr = Math.cos(roll), sr = Math.sin(roll);
      const nrx = rx * cr + ux * sr, nry = ry * cr + uy * sr, nrz = rz * cr + uz * sr;
      const nux = ux * cr - rx * sr, nuy = uy * cr - ry * sr, nuz = uz * cr - rz * sr;
      rx = nrx; ry = nry; rz = nrz; ux = nux; uy = nuy; uz = nuz;
    }
    const bx = -fx, by = -fy, bz = -fz;
    out[0] = rx; out[4] = ry; out[8] = rz; out[12] = -(rx * px + ry * py + rz * pz);
    out[1] = ux; out[5] = uy; out[9] = uz; out[13] = -(ux * px + uy * py + uz * pz);
    out[2] = bx; out[6] = by; out[10] = bz; out[14] = -(bx * px + by * py + bz * pz);
    out[3] = 0; out[7] = 0; out[11] = 0; out[15] = 1;
    return out;
  },
  mul(out, a, b) {
    const r = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let rr = 0; rr < 4; rr++) {
        r[c * 4 + rr] =
          a[rr] * b[c * 4] + a[4 + rr] * b[c * 4 + 1] + a[8 + rr] * b[c * 4 + 2] + a[12 + rr] * b[c * 4 + 3];
      }
    }
    out.set(r);
    return out;
  },
};

function angleWrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
