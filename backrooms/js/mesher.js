'use strict';
// ============================================================
//  网格构建：顶点格式 = pos(3) normal(3) u v layer(3) emit(1)
// ============================================================

const VSTRIDE = 10;

class MeshBuilder {
  constructor(cap = 8192) {
    this.data = new Float32Array(cap * VSTRIDE);
    this.n = 0;
  }
  reset() { this.n = 0; }
  ensure(k) {
    if ((this.n + k) * VSTRIDE <= this.data.length) return;
    let len = this.data.length * 2;
    while ((this.n + k) * VSTRIDE > len) len *= 2;
    const nd = new Float32Array(len);
    nd.set(this.data.subarray(0, this.n * VSTRIDE));
    this.data = nd;
  }
  v(x, y, z, nx, ny, nz, u, vv, l, e) {
    const d = this.data, o = this.n * VSTRIDE;
    d[o] = x; d[o + 1] = y; d[o + 2] = z;
    d[o + 3] = nx; d[o + 4] = ny; d[o + 5] = nz;
    d[o + 6] = u; d[o + 7] = vv; d[o + 8] = l; d[o + 9] = e;
    this.n++;
  }
  // 四边形 a b c d（逆/顺时针均可，关闭了背面剔除）
  quad(a, b, c, d, n, uv, l, e) {
    this.ensure(6);
    this.v(a[0], a[1], a[2], n[0], n[1], n[2], uv[0], uv[1], l, e);
    this.v(b[0], b[1], b[2], n[0], n[1], n[2], uv[2], uv[3], l, e);
    this.v(c[0], c[1], c[2], n[0], n[1], n[2], uv[4], uv[5], l, e);
    this.v(a[0], a[1], a[2], n[0], n[1], n[2], uv[0], uv[1], l, e);
    this.v(c[0], c[1], c[2], n[0], n[1], n[2], uv[4], uv[5], l, e);
    this.v(d[0], d[1], d[2], n[0], n[1], n[2], uv[6], uv[7], l, e);
  }
  result() { return this.data.subarray(0, this.n * VSTRIDE); }
}

// 墙体盒子：UV 取自世界坐标（相对区块原点），因此跨区块无缝
function meshWallBox(mb, x0, z0, x1, z1, y0, y1, H, ox, oz, layer, bottom) {
  const U = 1 / CELL;
  const v0 = 1 - y0 / H, v1 = 1 - y1 / H;
  const lx0 = (x0 - ox) * U, lx1 = (x1 - ox) * U, lz0 = (z0 - oz) * U, lz1 = (z1 - oz) * U;
  mb.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [lz0, v0, lz1, v0, lz1, v1, lz0, v1], layer, 0);
  mb.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [lz1, v0, lz0, v0, lz0, v1, lz1, v1], layer, 0);
  mb.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [lx1, v0, lx0, v0, lx0, v1, lx1, v1], layer, 0);
  mb.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [lx0, v0, lx1, v0, lx1, v1, lx0, v1], layer, 0);
  if (bottom) {
    mb.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [lx0, lz0, lx1, lz0, lx1, lz1, lx0, lz1], layer, 0);
  }
}

// 道具盒子：每个面完整 0..1 UV
function meshPropBox(mb, p, layer) {
  const { x0, z0, x1, z1, y0, y1 } = p;
  const uv = [0, 1, 1, 1, 1, 0, 0, 0];
  mb.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], uv, layer, 0);
  mb.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], uv, layer, 0);
  mb.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], uv, layer, 0);
  mb.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], uv, layer, 0);
  mb.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], uv, layer, 0);
}

// 结构柱：每个面 u 为 0..1，纵向覆盖整根柱高
function meshColumn(mb, x, z, s, H, layer) {
  const x0 = x - s, x1 = x + s, z0 = z - s, z1 = z + s;
  const uv = [0, 1, 1, 1, 1, 0, 0, 0];
  mb.quad([x0, 0, z1], [x0, 0, z0], [x0, H, z0], [x0, H, z1], [-1, 0, 0], uv, layer, 0);
  mb.quad([x1, 0, z0], [x1, 0, z1], [x1, H, z1], [x1, H, z0], [1, 0, 0], uv, layer, 0);
  mb.quad([x0, 0, z0], [x1, 0, z0], [x1, H, z0], [x0, H, z0], [0, 0, -1], uv, layer, 0);
  mb.quad([x1, 0, z1], [x0, 0, z1], [x0, H, z1], [x1, H, z1], [0, 0, 1], uv, layer, 0);
}

// 梁：沿 axis 方向，u 沿长度每 2m 重复，v 横跨侧面 / 底面
function meshBeam(mb, axis, a0, a1, c, hw, y0, y1, ox, oz, layer) {
  const ua = (a0 - (axis === 'x' ? ox : oz)) / CELL, ub = (a1 - (axis === 'x' ? ox : oz)) / CELL;
  const uv = [ua, 1, ub, 1, ub, 0, ua, 0];
  if (axis === 'x') {
    mb.quad([a0, y0, c - hw], [a1, y0, c - hw], [a1, y1, c - hw], [a0, y1, c - hw], [0, 0, -1], uv, layer, 0);
    mb.quad([a0, y0, c + hw], [a1, y0, c + hw], [a1, y1, c + hw], [a0, y1, c + hw], [0, 0, 1], uv, layer, 0);
    mb.quad([a0, y0, c - hw], [a1, y0, c - hw], [a1, y0, c + hw], [a0, y0, c + hw], [0, -1, 0], [ua, 0, ub, 0, ub, 1, ua, 1], layer, 0);
  } else {
    mb.quad([c - hw, y0, a0], [c - hw, y0, a1], [c - hw, y1, a1], [c - hw, y1, a0], [-1, 0, 0], uv, layer, 0);
    mb.quad([c + hw, y0, a0], [c + hw, y0, a1], [c + hw, y1, a1], [c + hw, y1, a0], [1, 0, 0], uv, layer, 0);
    mb.quad([c - hw, y0, a0], [c - hw, y0, a1], [c + hw, y0, a1], [c + hw, y0, a0], [0, -1, 0], [ua, 0, ub, 0, ub, 1, ua, 1], layer, 0);
  }
}

// 小盒子（支架、配电箱、灯具等），每个面完整 0..1 UV，可带自发光
function meshSmallBox(mb, x0, y0, z0, x1, y1, z1, layer, e = 0) {
  const uv = [0, 1, 1, 1, 1, 0, 0, 0];
  mb.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], uv, layer, e);
  mb.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], uv, layer, e);
  mb.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], uv, layer, e);
  mb.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], uv, layer, e);
  mb.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], uv, layer, e);
  mb.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], uv, layer, e);
}

// 沿 x / z / y 轴的圆柱（管道），平滑法线。axis 为 'y' 时 c1 = x，cy = z
function meshPipe(mb, axis, a0, a1, c1, cy, r, layer) {
  const seg = r > 0.06 ? 10 : 6;
  mb.ensure(seg * 6);
  const len = a1 - a0;
  for (let k = 0; k < seg; k++) {
    const t0 = (k / seg) * Math.PI * 2, t1 = ((k + 1) / seg) * Math.PI * 2;
    const c0 = Math.cos(t0), s0 = Math.sin(t0), cc1 = Math.cos(t1), s1 = Math.sin(t1);
    const v0 = k / seg, v1 = (k + 1) / seg;
    const P = (along, c, s) => (axis === 'z'
      ? [c1 + c * r, cy + s * r, along, c, s, 0]
      : axis === 'y' ? [c1 + c * r, along, cy + s * r, c, 0, s]
        : [along, cy + s * r, c1 + c * r, 0, s, c]);
    const A = P(a0, c0, s0), B = P(a1, c0, s0), C = P(a1, cc1, s1), D = P(a0, cc1, s1);
    const vt = (p, u, vv) => mb.v(p[0], p[1], p[2], p[3], p[4], p[5], u, vv, layer, 0);
    vt(A, 0, v0); vt(B, len, v0); vt(C, len, v1);
    vt(A, 0, v0); vt(C, len, v1); vt(D, 0, v1);
  }
}

// Level 994 的岩壁：沿西侧岩脚线、南北两道岬角铺出向后倾斜、带噪声起伏的岩面（每个面片平直法线，呈现棱角）。
// 铁门附近的岩面向后退让出门洞
const ROCK_H = [0, 1.2, 3.5, 7, 12, 17, 23];
const ROCK_LEAN = [-0.2, 0.6, 1.4, 2.8, 4.8, 7.2, 9.8];
function meshBeachRocks(mb, c, world) {
  const B = BEACH, S = CHUNK * CELL, zN = B.NZ * CELL, zS = B.SZ * CELL;
  const gates = [(B.exitGx + 0.5) * CELL, (B.startGx + 0.5) * CELL];
  // path(a) → [x, z]；away = 远离沙滩的方向；gate：门所在的 a
  const faces = [
    { a0: zN - 6, a1: zS + 6, at: (a) => [B.cliff(a) - 0.3, a], away: [-1, 0], gate: null, seed: 11 },
    { a0: B.cliff(zN) - 6, a1: 210, at: (a) => [a, zN], away: [0, -1], gate: gates[0], seed: 23 },
    { a0: B.cliff(zS) - 6, a1: 210, at: (a) => [a, zS], away: [0, 1], gate: gates[1], seed: 37 },
  ];
  const off = (f, a, k) => {
    const h = ROCK_H[k];
    const n = (vnoise(a * 0.3, h * 0.22, f.seed) - 0.5) * 2.6 + (vnoise(a * 1.05, h * 0.8, f.seed + 1) - 0.5) * 0.9;
    let o = ROCK_LEAN[k] + n * (k === 0 ? 0.25 : 1);
    if (f.gate !== null) {
      const m = smoothstep(1.5, 3.6, Math.abs(a - f.gate));
      o = o * m + (1 - m) * (k <= 2 ? 1.4 + k * 0.2 : ROCK_LEAN[k]);
    }
    return o;
  };
  for (const f of faces) {
    for (let a = f.a0; a < f.a1; a += 2) {
      const mid = f.at(a + 1);
      if (Math.floor(mid[0] / S) !== c.cx || Math.floor(mid[1] / S) !== c.cz) continue;
      const pa = f.at(a), pb = f.at(a + 2);
      const ya = beachGround(pa[0], pa[1]) - 0.7, yb = beachGround(pb[0], pb[1]) - 0.7;
      const P = (p, aa, k) => {
        const o = off(f, aa, k), x = p[0] + f.away[0] * o, z = p[1] + f.away[1] * o;
        return [x, ROCK_H[k] + (aa === a ? ya : yb), z];
      };
      for (let k = 0; k < ROCK_H.length - 1; k++) {
        const A = P(pa, a, k), Bv = P(pb, a + 2, k), C = P(pb, a + 2, k + 1), D = P(pa, a, k + 1);
        // 面片法线朝向沙滩
        const ux = Bv[0] - A[0], uy = Bv[1] - A[1], uz = Bv[2] - A[2];
        const vx = D[0] - A[0], vy = D[1] - A[1], vz = D[2] - A[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        if (nx * f.away[0] + nz * f.away[1] > 0) { nx = -nx; ny = -ny; nz = -nz; }
        const nl = Math.hypot(nx, ny, nz) || 1;
        const u0 = a / 4, u1 = (a + 2) / 4, v0 = 1 - ROCK_H[k] / 23, v1 = 1 - ROCK_H[k + 1] / 23;
        mb.quad(A, Bv, C, D, [nx / nl, ny / nl, nz / nl], [u0, v0, u1, v0, u1, v1, u0, v1], TEX.CLIFF, 0);
      }
    }
  }
}

// Level 994 的沙滩地形：水边 1m 一格，远处（海里）4m 一格；岩壁背后看不见的部分不生成
function meshBeachGround(mb, c) {
  const S = CHUNK * CELL, ox = c.cx * S, oz = c.cz * S;
  const step = c.cx <= 3 ? 1 : 4, n = S / step;
  const zN = BEACH.NZ * CELL - 6, zS = BEACH.SZ * CELL + 6;
  const hs = new Float32Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) hs[j * (n + 1) + i] = beachGround(ox + i * step, oz + j * step);
  const H = (i, j) => hs[clamp(j, 0, n) * (n + 1) + clamp(i, 0, n)];
  const nor = (i, j) => {
    const dx = (H(i + 1, j) - H(i - 1, j)) / (2 * step), dz = (H(i, j + 1) - H(i, j - 1)) / (2 * step);
    const l = Math.hypot(dx, 1, dz);
    return [-dx / l, 1 / l, -dz / l];
  };
  mb.ensure(n * n * 6);
  for (let j = 0; j < n; j++) {
    const z0 = oz + j * step, z1 = z0 + step;
    if (z1 < zN || z0 > zS) continue;
    for (let i = 0; i < n; i++) {
      const x0 = ox + i * step, x1 = x0 + step;
      if (x1 < BEACH.cliff(z0) - 8) continue;
      const v = (ii, jj) => {
        const x = ox + ii * step, z = oz + jj * step, nn = nor(ii, jj);
        mb.v(x, H(ii, jj), z, nn[0], nn[1], nn[2], x / CELL, z / CELL, TEX.SAND, 0);
      };
      v(i, j); v(i + 1, j); v(i + 1, j + 1);
      v(i, j); v(i + 1, j + 1); v(i, j + 1);
    }
  }
}

// 不规则的礁石：经纬球按噪声起伏、压扁，底部埋进沙里；每个面片平直法线
function meshBeachRock(mb, k) {
  const SEG = 9, RING = 6, rr = mulberry32(k.seed);
  const ph = rr() * 10, sx = 0.8 + rr() * 0.5, sz = 0.8 + rr() * 0.5;
  const pts = [];
  for (let a = 0; a <= RING; a++) {
    const th = (a / RING) * Math.PI * 0.62; // 只到赤道以下一点，底部埋在沙里
    const row = [];
    for (let b = 0; b < SEG; b++) {
      const fi = (b / SEG) * Math.PI * 2;
      const n = 0.75 + 0.5 * vnoise(Math.cos(fi) * 1.6 + ph, Math.sin(fi) * 1.6 + a * 0.7, k.seed & 1023);
      const rad = k.r * n * Math.sin(th + 0.25);
      row.push([k.x + Math.cos(fi) * rad * sx, k.y - 0.25 + k.h * Math.cos(th) * n, k.z + Math.sin(fi) * rad * sz]);
    }
    pts.push(row);
  }
  const tri = (A, B, C) => {
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const cx = (A[0] + B[0] + C[0]) / 3 - k.x, cz = (A[2] + B[2] + C[2]) / 3 - k.z;
    if (nx * cx + nz * cz + ny * 0.5 < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const l = Math.hypot(nx, ny, nz) || 1;
    for (const P of [A, B, C]) mb.v(P[0], P[1], P[2], nx / l, ny / l, nz / l, (P[0] + P[2]) * 0.4, P[1] * 0.12, TEX.CLIFF, 0);
  };
  mb.ensure(SEG * RING * 6 + SEG * 3);
  const top = [k.x, k.y - 0.25 + k.h * 1.02, k.z];
  for (let b = 0; b < SEG; b++) tri(top, pts[0][(b + 1) % SEG], pts[0][b]);
  for (let a = 0; a < RING; a++) {
    for (let b = 0; b < SEG; b++) {
      const b1 = (b + 1) % SEG;
      tri(pts[a][b], pts[a + 1][b], pts[a + 1][b1]);
      tri(pts[a][b], pts[a + 1][b1], pts[a][b1]);
    }
  }
}

function buildChunkMesh(c, world) {
  if (c.empty) return null;
  if (c.pool) return buildPoolChunkMesh(c, world);
  const L = world.L;
  const H = L.wallH;
  const mb = new MeshBuilder(4096);
  const ox = c.cx * CHUNK * CELL, oz = c.cz * CHUNK * CELL;
  const S = CHUNK * CELL, T = WALL_T;
  const wallTex = L.tex.wall;
  const U = 1 / CELL;
  const doorTop = L.doorTop;

  // 地板与天花板
  if (L.water) meshPoolFloor(mb, c, world, ox, oz);
  else if (L.gen === 'beach') meshBeachGround(mb, c);
  else mb.quad([ox, 0, oz], [ox + S, 0, oz], [ox + S, 0, oz + S], [ox, 0, oz + S], [0, 1, 0], [0, 0, S * U, 0, S * U, S * U, 0, S * U], L.tex.floor, 0);
  if (!L.outdoor) mb.quad([ox, H, oz], [ox + S, H, oz], [ox + S, H, oz + S], [ox, H, oz + S], [0, -1, 0], [0, 0, S * U, 0, S * U, S * U, 0, S * U], L.tex.ceil, 0);
  // 室外层：墙只用于碰撞，画面上是起伏的岩面
  if (L.gen === 'beach') {
    meshBeachRocks(mb, c, world);
    for (const k of c.rocks) meshBeachRock(mb, k);
  }

  const runs = []; // 用于在墙边布置管道 / 线管
  // 墙：合并共线的连续段
  for (let i = 0; i < 16; i++) {
    const lineX = ox + i * CELL;
    for (const [arr, y0, isLintel] of [[c.wallW, 0, false], [c.lintW, doorTop, true]]) {
      if (L.outdoor) break;
      let j = 0;
      while (j < 16) {
        if (!arr[I16(i, j)]) { j++; continue; }
        const j0 = j;
        while (j < 16 && arr[I16(i, j)]) j++;
        meshWallBox(mb, lineX - T, oz + j0 * CELL - T, lineX + T, oz + j * CELL + T, y0, H, H, ox, oz, wallTex, isLintel);
        if (!isLintel) runs.push(['z', lineX, oz + j0 * CELL, oz + j * CELL, i * 97 + j0]);
      }
    }
  }
  for (let j = 0; j < 16; j++) {
    const lineZ = oz + j * CELL;
    for (const [arr, y0, isLintel] of [[c.wallN, 0, false], [c.lintN, doorTop, true]]) {
      if (L.outdoor) break;
      let i = 0;
      while (i < 16) {
        if (!arr[I16(i, j)]) { i++; continue; }
        const i0 = i;
        while (i < 16 && arr[I16(i, j)]) i++;
        meshWallBox(mb, ox + i0 * CELL - T, lineZ - T, ox + i * CELL + T, lineZ + T, y0, H, H, ox, oz, wallTex, isLintel);
        if (!isLintel) runs.push(['x', lineZ, ox + i0 * CELL, ox + i * CELL, j * 131 + i0 + 7]);
      }
    }
  }

  // 柱子（包含区块西/北边界上的柱子）
  for (let j = 0; j < 16; j++) {
    for (let i = 0; i < 16; i++) {
      const p = c.pillar[I16(i, j)];
      if (!p) continue;
      const s = PILLAR_HALF[p];
      const x = ox + i * CELL, z = oz + j * CELL;
      if (p === 3 && L.tex.column !== undefined) meshColumn(mb, x, z, s, H, L.tex.column);
      else meshWallBox(mb, x - s, z - s, x + s, z + s, 0, H, H, ox, oz, wallTex, false);
    }
  }

  // Level 1：沿柱网的井字梁，以及墙上的电线管与配电箱
  if (L.tex.beam !== undefined) {
    const B = L.bay, bh = 0.5, hw = 0.26;
    for (let k = 0; k < 16; k++) {
      if (imod(c.cx * 16 + k, B) === 0) meshBeam(mb, 'z', oz, oz + S, ox + k * CELL, hw, H - bh, H, ox, oz, L.tex.beam);
      if (imod(c.cz * 16 + k, B) === 0) meshBeam(mb, 'x', ox, ox + S, oz + k * CELL, hw, H - bh - 0.002, H, ox, oz, L.tex.beam);
    }
    for (const [axis, line, a0, a1, h] of runs) {
      const rr = rand01(h, c.cx * 31 + c.cz, world.seed + 19);
      if (rr > 0.55 || a1 - a0 < CELL * 1.5) continue;
      const side = rr < 0.27 ? 1 : -1, off = line + side * (T + 0.035);
      meshPipe(mb, axis, a0, a1, off, H - 0.78, 0.022, TEX.METAL);
      if (rr < 0.2) {
        // 配电箱 + 竖向线管
        const p = a0 + CELL * (0.5 + Math.floor(rr * 40) % Math.max(1, Math.floor((a1 - a0) / CELL))), bw = 0.22, d0 = line + side * T, d1 = line + side * (T + 0.14);
        const lo = Math.min(d0, d1), hi = Math.max(d0, d1);
        if (axis === 'x') meshSmallBox(mb, p - bw, 1.25, lo, p + bw, 1.8, hi, TEX.METAL);
        else meshSmallBox(mb, lo, 1.25, p - bw, hi, 1.8, p + bw, TEX.METAL);
        const cx = axis === 'x' ? p : off, cz = axis === 'x' ? off : p;
        meshPipe(mb, 'y', 1.8, H - 0.78, cx, cz, 0.022, TEX.METAL);
      }
    }
  }

  // Level 3：铁栅栏（竖向铁条 + 上下横档，贯穿整面墙高）
  for (let j = 0; j < 16; j++) {
    for (let i = 0; i < 16; i++) {
      const k = I16(i, j);
      for (const west of [true, false]) {
        if (!(west ? c.barW[k] : c.barN[k])) continue;
        const x0 = ox + i * CELL, z0 = oz + j * CELL;
        for (let s = 0.08; s < CELL; s += 0.16) {
          if (west) meshPipe(mb, 'y', 0, H, x0, z0 + s, 0.022, TEX.METAL);
          else meshPipe(mb, 'y', 0, H, x0 + s, z0, 0.022, TEX.METAL);
        }
        for (const y of [0.12, 1.1, H - 0.15]) {
          if (west) meshSmallBox(mb, x0 - 0.03, y - 0.03, z0, x0 + 0.03, y + 0.03, z0 + CELL, TEX.METAL);
          else meshSmallBox(mb, x0, y - 0.03, z0 - 0.03, x0 + CELL, y + 0.03, z0 + 0.03, TEX.METAL);
        }
      }
    }
  }

  // Level 3：墙上成束的电缆、流着黑色液体的管道
  if (L.gen === 'station') {
    for (const [axis, line, a0, a1, h] of runs) {
      const rr = rand01(h, c.cx * 31 + c.cz, world.seed + 29);
      const side = rr < 0.5 ? 1 : -1;
      for (let q = 0; q < 3; q++) meshPipe(mb, axis, a0, a1, line + side * (T + 0.03 + q * 0.035), H - 0.3 - q * 0.05, 0.016, TEX.CONVEYOR);
      if (rr < 0.35) meshPipe(mb, axis, a0, a1, line - side * (T + 0.08), rr < 0.17 ? 0.45 : H - 0.65, 0.06, TEX.PIPE);
    }
  }
  // 配电箱
  for (const f of c.fixtures) {
    const rx = f.nz, rz = -f.nx, hw = 0.26;
    const xa = f.x - rx * hw, xb = f.x + rx * hw, za = f.z - rz * hw, zb = f.z + rz * hw;
    const xc = f.x + f.nx * 0.2, zc = f.z + f.nz * 0.2;
    meshSmallBox(mb, Math.min(xa, xb, f.x, xc), f.y, Math.min(za, zb, f.z, zc), Math.max(xa, xb, f.x, xc), f.y + 0.6, Math.max(za, zb, f.z, zc), TEX.ELECBOX);
  }
  // 地上的断线
  for (const w of c.wires) {
    const ca = Math.cos(w.rot) * 0.6, sa = Math.sin(w.rot) * 0.6, y = 0.006;
    mb.quad([w.x - ca + sa, y, w.z - sa - ca], [w.x + ca + sa, y, w.z + sa - ca], [w.x + ca - sa, y, w.z + sa + ca], [w.x - ca - sa, y, w.z - sa + ca],
      [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], TEX.WIRE, 0);
  }
  // Level Fun：飘在天花板下的气球（十字交叉的两片面 + 细绳）
  for (const b of c.balloons) {
    const s = 0.2, u0 = (b.q & 1) * 0.5, v0 = (b.q >> 1) * 0.5, uv = [u0, v0 + 0.5, u0 + 0.5, v0 + 0.5, u0 + 0.5, v0, u0, v0];
    mb.quad([b.x - s, b.y, b.z], [b.x + s, b.y, b.z], [b.x + s, b.y + 0.5, b.z], [b.x - s, b.y + 0.5, b.z], [0, 0, 1], uv, TEX.BALLOON, 0);
    mb.quad([b.x, b.y, b.z - s], [b.x, b.y, b.z + s], [b.x, b.y + 0.5, b.z + s], [b.x, b.y + 0.5, b.z - s], [1, 0, 0], uv, TEX.BALLOON, 0);
    meshSmallBox(mb, b.x - 0.004, b.y - 0.9, b.z - 0.004, b.x + 0.004, b.y + 0.02, b.z + 0.004, TEX.METAL);
  }
  // Level 37：水面。emit 通道存放该处的水深，着色器据此做折射与吸收
  if (L.water) {
    const wy = L.water;
    for (let j = 0; j < 16; j++) {
      for (let i = 0; i < 16; i++) {
        const x0 = ox + i * CELL, z0 = oz + j * CELL;
        const d = c.deep[I16(i, j)], steps = d === 1 ? 8 : 1;
        for (let k = 0; k < steps; k++) {
          const za = z0 + k * CELL / steps, zb = za + CELL / steps;
          const depth = wy - world.floorAt(x0 + CELL / 2, (za + zb) / 2);
          mb.quad([x0, wy, za], [x0 + CELL, wy, za], [x0 + CELL, wy, zb], [x0, wy, zb],
            [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], TEX.WATER, depth);
        }
      }
    }
  }

  // 箱子 / 储水罐
  for (const p of c.props) {
    if (p.hidden) continue; // 只用于碰撞
    if (p.office) meshOfficeFurniture(mb, p);
    else if (p.kind === 'tank') meshTank(mb, p, H);
    else meshPropBox(mb, p, p.tex !== undefined ? p.tex : TEX.CRATE);
  }

  // “窗户”实体（自发光）
  for (const w of c.windows) {
    const rx = w.nz, rz = -w.nx, hw = w.w / 2, y1 = w.y0 + w.h;
    mb.quad([w.x - rx * hw, w.y0, w.z - rz * hw], [w.x + rx * hw, w.y0, w.z + rz * hw], [w.x + rx * hw, y1, w.z + rz * hw], [w.x - rx * hw, y1, w.z - rz * hw],
      [w.nx, 0, w.nz], [0, 1, 1, 1, 1, 0, 0, 0], w.blacked ? TEX.WINDOW_BLACK : TEX.WINDOW, w.blacked ? 0 : 1.25);
  }

  // 管道（Level 2）
  if (L.pipes && c.zone) meshTunnelPipes(mb, c, world, ox, oz);

  // 地上的水洼
  c.puddles.forEach((p, k) => {
    const ca = Math.cos(p.rot), sa = Math.sin(p.rot);
    const ax = ca * p.rx, az = sa * p.rx, bx = -sa * p.rz, bz = ca * p.rz, y = 0.004 + (k % 4) * 0.0015;
    mb.quad([p.x - ax - bx, y, p.z - az - bz], [p.x + ax - bx, y, p.z + az - bz], [p.x + ax + bx, y, p.z + az + bz], [p.x - ax + bx, y, p.z - az + bz],
      [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], p.layer, 0);
  });
  // 墙上的贴花
  for (const d of c.decals) {
    const rx = d.nz, rz = -d.nx, hw = d.w / 2, [u0, v0, u1, v1] = d.uv;
    mb.quad([d.x - rx * hw, d.y0, d.z - rz * hw], [d.x + rx * hw, d.y0, d.z + rz * hw], [d.x + rx * hw, d.y0 + d.h, d.z + rz * hw], [d.x - rx * hw, d.y0 + d.h, d.z - rz * hw],
      [d.nx, 0, d.nz], [u0, v1, u1, v1, u1, v0, u0, v0], d.layer !== undefined ? d.layer : TEX.DECAL, 0);
    if (d.frame) {
      // 凸出墙面的门框：两根立柱 + 门楣
      const fw = 0.08, dep = 0.045, y1 = d.y0 + d.h;
      const box = (a0, a1, yy0, yy1) => {
        // 墙是轴对齐的：沿墙方向取 a0..a1，法线方向取墙面到凸出深度
        const [xa, xb] = rx !== 0 ? [d.x + rx * a0, d.x + rx * a1] : [d.x - d.nx * 0.006, d.x + d.nx * dep];
        const [za, zb] = rz !== 0 ? [d.z + rz * a0, d.z + rz * a1] : [d.z - d.nz * 0.006, d.z + d.nz * dep];
        meshSmallBox(mb, Math.min(xa, xb), yy0, Math.min(za, zb), Math.max(xa, xb), yy1, Math.max(za, zb), TEX.DESK);
      };
      box(-hw - fw, -hw, 0, y1 + fw);
      box(hw, hw + fw, 0, y1 + fw);
      box(-hw, hw, y1, y1 + fw);
    }
  }

  return mb.result().slice();
}

// 办公家具按零件建模；显示器的屏幕只出现在正面，桌下和椅座下留空
function meshOfficeFurniture(mb, p) {
  const ca = [1, 0, -1, 0][p.rot], sa = [0, 1, 0, -1][p.rot];
  const P = (x, y, z) => [p.x + ca * x + sa * z, y, p.z - sa * x + ca * z];
  const uv = [0, 1, 1, 1, 1, 0, 0, 0];
  const quad = (a, b, c, d, n, tex = TEX.OFFICE_PARTS, color = 0) => {
    const u = (color + 0.5) / 8;
    mb.quad(P(...a), P(...b), P(...c), P(...d), [ca * n[0] + sa * n[2], n[1], -sa * n[0] + ca * n[2]],
      tex === TEX.OFFICE_PARTS ? [u, 0.5, u, 0.5, u, 0.5, u, 0.5] : uv, tex, 0);
  };
  const box = (x0, y0, z0, x1, y1, z1, tex = TEX.OFFICE_PARTS, color = 0) => {
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], tex, color);
    quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], tex, color);
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], tex, color);
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], tex, color);
    quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], tex, color);
    quad([x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], [0, -1, 0], tex, color);
  };
  const front = (x0, y0, x1, y1, z, tex) => quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [0, 0, 1], tex);
  const chair = (x, z, reverse = false) => {
    const back = z + (reverse ? -0.27 : 0.27);
    box(x-0.27, 0.43, z-0.24, x+0.27, 0.5, z+0.24, TEX.OFFICE_PARTS, 1);
    box(x-0.27, 0.52, back-0.055, x+0.27, 1.04, back+0.055, TEX.OFFICE_PARTS, 1);
    box(x-0.035, 0.16, z-0.035, x+0.035, 0.43, z+0.035, TEX.OFFICE_PARTS, 7);
    box(x-0.33, 0.09, z-0.025, x+0.33, 0.14, z+0.025, TEX.OFFICE_PARTS, 1);
    box(x-0.025, 0.09, z-0.33, x+0.025, 0.14, z+0.33, TEX.OFFICE_PARTS, 1);
    for (const [wx, wz] of [[x-0.32, z], [x+0.32, z], [x, z-0.32], [x, z+0.32]]) box(wx-0.045, 0.025, wz-0.045, wx+0.045, 0.11, wz+0.045, TEX.OFFICE_PARTS, 2);
    for (const side of [-1, 1]) {
      const xx = x + side * 0.31;
      box(xx-0.022, 0.46, z-0.08, xx+0.022, 0.65, z+0.08, TEX.OFFICE_PARTS, 7);
      box(xx-0.045, 0.64, z-0.2, xx+0.045, 0.69, z+0.19, TEX.OFFICE_PARTS, 1);
    }
  };
  const cylinder = (x, z, y0, y1, r0, r1, color) => {
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2, b = (k+1) / 12 * Math.PI * 2;
      const A = [x+Math.cos(a)*r0, y0, z+Math.sin(a)*r0], B = [x+Math.cos(b)*r0, y0, z+Math.sin(b)*r0];
      const C = [x+Math.cos(b)*r1, y1, z+Math.sin(b)*r1], D = [x+Math.cos(a)*r1, y1, z+Math.sin(a)*r1];
      quad(A, B, C, D, [Math.cos((a+b)/2), 0, Math.sin((a+b)/2)], TEX.OFFICE_PARTS, color);
      quad([x, y1, z], D, C, [x, y1, z], [0, 1, 0], TEX.OFFICE_PARTS, color);
    }
  };
  if (p.kind === 'desk') {
    box(-0.86, 0.71, -0.46, 0.86, 0.77, 0.46, TEX.DESK);
    for (const x of [-0.75, 0.75]) for (const z of [-0.34, 0.34]) box(x-0.026, 0.03, z-0.026, x+0.026, 0.71, z+0.026, TEX.OFFICE_PARTS, 7);
    box(0.46, 0.18, -0.33, 0.78, 0.70, 0.34);
    for (const y of [0.34, 0.51, 0.68]) {
      box(0.47, y, -0.332, 0.77, y+0.009, 0.347, TEX.OFFICE_PARTS, 7);
      box(0.57, y-0.085, 0.345, 0.68, y-0.06, 0.369, TEX.OFFICE_PARTS, 1);
    }
    chair(0, 1.07);
    if (p.computer) {
      // 厚背 CRT、支架、底座；屏幕不包到侧面或顶面
      box(-0.4, 0.77, -0.26, 0.06, 0.81, 0.04, TEX.OFFICE_PARTS, 7);
      box(-0.22, 0.81, -0.17, -0.12, 0.89, -0.05);
      box(-0.52, 0.87, -0.09, 0.18, 1.34, 0.14);
      box(-0.46, 0.92, -0.40, 0.12, 1.29, -0.09);
      front(-0.51, 0.88, 0.17, 1.33, 0.142, TEX.MONITOR);
      for (let q=0;q<6;q++) box(-0.43, 1.04+q*0.025, -0.404, 0.09, 1.049+q*0.025, -0.401, TEX.OFFICE_PARTS, 7);
      // 键盘、鼠标垫、鼠标与线
      box(-0.56, 0.772, 0.21, 0.04, 0.809, 0.42);
      quad([-0.55, 0.81, 0.22], [0.03, 0.81, 0.22], [0.03, 0.81, 0.41], [-0.55, 0.81, 0.41], [0, 1, 0], TEX.KEYBOARD);
      box(0.18, 0.772, 0.20, 0.45, 0.78, 0.43, TEX.OFFICE_PARTS, 1);
      box(0.28, 0.781, 0.27, 0.38, 0.818, 0.40);
      box(0.324, 0.817, 0.28, 0.334, 0.824, 0.32, TEX.OFFICE_PARTS, 7);
      box(0.32, 0.777, 0.01, 0.327, 0.783, 0.27, TEX.OFFICE_PARTS, 1);
      // 桌下独立主机，正面有光驱、按钮与散热孔
      box(-0.75, 0.025, -0.34, -0.46, 0.65, 0.31);
      front(-0.748, 0.03, -0.462, 0.646, 0.312, TEX.PC_FRONT);
    } else {
      box(-0.16, 0.771, -0.06, 0.18, 0.775, 0.2, TEX.OFFICE_PARTS, 6);
    }
  } else if (p.kind === 'meeting') {
    box(-1.65, 0.72, -0.68, 1.65, 0.79, 0.68, TEX.DESK);
    for (const x of [-1, 1]) box(x-0.12, 0, -0.4, x+0.12, 0.72, 0.4, TEX.OFFICE_PARTS, 7);
    for (const x of [-0.9, 0.9]) { chair(x, 1.24); chair(x, -1.24, true); }
  } else if (p.kind === 'cabinet') {
    box(-0.4, 0, -0.3, 0.4, 1.32, 0.3, TEX.OFFICE_PARTS, 7);
    for (const y of [0.05, 0.37, 0.69, 1.01]) {
      box(-0.37, y, 0.3, 0.37, y+0.28, 0.318);
      box(-0.09, y+0.16, 0.319, 0.09, y+0.185, 0.345, TEX.OFFICE_PARTS, 1);
    }
  } else if (p.kind === 'cooler') {
    box(-0.29, 0.04, -0.28, 0.29, 1.0, 0.28);
    box(-0.23, 0.02, -0.25, 0.23, 0.07, 0.25, TEX.OFFICE_PARTS, 1);
    box(-0.21, 0.36, 0.282, 0.21, 0.74, 0.293, TEX.OFFICE_PARTS, 2);
    box(-0.21, 0.34, 0.28, 0.21, 0.38, 0.36, TEX.OFFICE_PARTS, 7);
    for (const x of [-0.095, 0.095]) box(x-0.033, 0.69, 0.29, x+0.033, 0.74, 0.35, TEX.OFFICE_PARTS, x<0?4:3);
    cylinder(0, 0, 1.0, 1.10, 0.09, 0.20, 5);
    cylinder(0, 0, 1.10, 1.49, 0.20, 0.20, 5);
    cylinder(0, 0, 1.49, 1.56, 0.20, 0.14, 5);
    cylinder(0, 0, 1.56, 1.585, 0.14, 0.14, 7);
  } else if (p.kind === 'vending') {
    box(-0.46, 0.02, -0.34, 0.46, 1.94, 0.34, TEX.OFFICE_PARTS, 7);
    front(-0.435, 0.12, 0.435, 1.90, 0.342, TEX.VENDING);
    box(-0.32, 0.17, 0.344, 0.20, 0.37, 0.39, TEX.OFFICE_PARTS, 2);
    box(-0.37, 0.02, -0.27, -0.27, 0.1, 0.27, TEX.OFFICE_PARTS, 1);
    box(0.27, 0.02, -0.27, 0.37, 0.1, 0.27, TEX.OFFICE_PARTS, 1);
  }
}

// 泳池地形：合并同高的地面，只有低于水位的部分才铺水面
function meshPoolFloor(mb, c, world, ox, oz) {
  const L = world.L, N = 64, step = 0.5, ys = new Float32Array(N * N), used = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) ys[j * N + i] = world.floorAt(ox + (i + 0.5) * step, oz + (j + 0.5) * step);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i, y = ys[k];
      if (used[k]) continue;
      let iw = i + 1, jh = j + 1;
      while (iw < N && !used[j * N + iw] && ys[j * N + iw] === y) iw++;
      outer: while (jh < N) {
        for (let q = i; q < iw; q++) if (used[jh * N + q] || ys[jh * N + q] !== y) break outer;
        jh++;
      }
      for (let z = j; z < jh; z++) used.fill(1, z * N + i, z * N + iw);
      const x0 = ox + i * step, x1 = ox + iw * step, z0 = oz + j * step, z1 = oz + jh * step;
      meshPoolSurface(mb, [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 1, 0]);
      if (y < L.water) {
        const wy = L.water;
        meshPoolSurface(mb, [x0, wy, z0], [x1, wy, z0], [x1, wy, z1], [x0, wy, z1], [0, 1, 0], TEX.WATER, wy - y);
      }
    }
  }
  // 台阶立面与真正下沉的池壁，水面上方还留有可辨认的白色池沿
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x0 = ox + i * step, x1 = x0 + step, z0 = oz + j * step, z1 = z0 + step, y = ys[j * N + i];
      for (const [ax, az, bx, bz, nx, nz] of [[x0, z0, x0, z1, -1, 0], [x1, z1, x1, z0, 1, 0],
        [x1, z0, x0, z0, 0, -1], [x0, z1, x1, z1, 0, 1]]) {
        const top = world.floorAt((ax + bx) / 2 + nx * 0.001, (az + bz) / 2 + nz * 0.001);
        if (top - y < 0.001) continue;
        meshPoolSurface(mb, [ax, y, az], [bx, y, bz], [bx, top, bz], [ax, top, az], [-nx, 0, -nz]);
      }
    }
  }
}

function meshPoolSurface(mb, a, b, c, d, n, layer = TEX.L37_TILE, emit = 0) {
  const uv = [];
  for (const v of [a, b, c, d]) {
    if (Math.abs(n[1]) > 0.7) uv.push(v[0] / 2, v[2] / 2);
    else uv.push((Math.abs(n[0]) > 0.7 ? v[2] : v[0]) / 2, -v[1] / 2);
  }
  mb.quad(a, b, c, d, n, uv, layer, emit);
}

function buildPoolChunkMesh(c, world) {
  const mb = new MeshBuilder(8192), p = c.pool, ox = c.cx * 32, oz = c.cz * 32, H = p.h, T = WALL_T;
  meshPoolFloor(mb, c, world, ox, oz);
  // 厚墙只分隔完整池厅，不再使用小房间 BSP 或随机隔板
  for (const d of c.poolDoors) {
    for (const [a, b] of [[0, d.a0], [d.a1, 32]]) {
      if (d.west) meshWallBox(mb, ox - T, oz + a, ox + T, oz + b, 0.62, d.top, 2, 0, 0, TEX.L37_TILE, false);
      else meshWallBox(mb, ox + a, oz - T, ox + b, oz + T, 0.62, d.top, 2, 0, 0, TEX.L37_TILE, false);
    }
    meshPoolArch(mb, d, ox, oz);
  }
  for (const a of p.arches) meshPoolArch(mb, a, ox, oz);
  // 外墙由边界池厅自己持有，东、南两侧不依赖地图外的区块。
  const bounds = world.poolBounds;
  const wall = (x0, z0, x1, z1, y0 = 0.62, y1 = H) =>
    meshWallBox(mb, x0, z0, x1, z1, y0, y1, 2, 0, 0, TEX.L37_TILE, false);
  if (c.cx === bounds.minX) wall(ox - T, oz - T, ox + T, oz + 32 + T);
  if (c.cz === bounds.minZ) wall(ox - T, oz - T, ox + 32 + T, oz + T);
  if (c.cz === bounds.maxZ) wall(ox - T, oz + 32 - T, ox + 32 + T, oz + 32 + T);
  if (c.cx === bounds.maxX) {
    const front = ox + 32 - T, back = front + 0.6;
    const side = p.openings.find((a) => a.axis === 'x');
    if (side) {
      // 在完整外墙中留出真实的矩形洞口，天空位于墙厚之外。
      wall(front, oz - T, back, oz + side.z0);
      wall(front, oz + side.z1, back, oz + 32 + T);
      wall(front, oz + side.z0, back, oz + side.z1, 0.62, side.y);
      wall(front, oz + side.z0, back, oz + side.z1, side.y1, H);
    } else wall(front, oz - T, back, oz + 32 + T);
  }
  // 天花板上真正留出光井；其余部分为不发光的瓷砖
  for (let z = 0; z < 32; z++) {
    let x = 0;
    const hole = (xx) => p.openings.some((a) => a.axis === 'y' && xx + 0.5 >= a.x0 && xx + 0.5 < a.x1 && z + 0.5 >= a.z0 && z + 0.5 < a.z1);
    while (x < 32) {
      if (hole(x)) { x++; continue; }
      const x0 = x;
      while (x < 32 && !hole(x)) x++;
      meshPoolSurface(mb, [ox + x0, H, oz + z], [ox + x, H, oz + z], [ox + x, H, oz + z + 1], [ox + x0, H, oz + z + 1], [0, -1, 0]);
    }
  }
  for (const a of p.openings) {
    const x0 = ox + a.x0, x1 = ox + a.x1, z0 = oz + a.z0, z1 = oz + a.z1;
    if (a.axis === 'y') {
      const top = H + 1.1;
      meshPoolSurface(mb, [x0, H, z0], [x0, H, z1], [x0, top, z1], [x0, top, z0], [1, 0, 0]);
      meshPoolSurface(mb, [x1, H, z1], [x1, H, z0], [x1, top, z0], [x1, top, z1], [-1, 0, 0]);
      meshPoolSurface(mb, [x1, H, z0], [x0, H, z0], [x0, top, z0], [x1, top, z0], [0, 0, 1]);
      meshPoolSurface(mb, [x0, H, z1], [x1, H, z1], [x1, top, z1], [x0, top, z1], [0, 0, -1]);
      mb.quad([x0, top, z0], [x1, top, z0], [x1, top, z1], [x0, top, z1], [0, -1, 0], [0, 0, 1, 0, 1, 1, 0, 1], TEX.POOL_SKY, 0);
    } else {
      mb.quad([x0, a.y, z0], [x0, a.y, z1], [x0, a.y1, z1], [x0, a.y1, z0], [-1, 0, 0], [0, 1, 1, 1, 1, 0, 0, 0], TEX.POOL_SKY, 0);
      // 两侧和过梁已由外墙生成；补上窗台的上表面。
      const front = x0 - 0.6;
      meshPoolSurface(mb, [front, a.y, z1], [x0, a.y, z1],
        [x0, a.y, z0], [front, a.y, z0], [0, 1, 0]);
      meshPoolSurface(mb, [front, a.y1, z0], [x0, a.y1, z0],
        [x0, a.y1, z1], [front, a.y1, z1], [0, -1, 0]);
    }
  }
  for (const q of p.columns) meshPoolColumn(mb, ox + q.x, oz + q.z, q.r, world.floorAt(ox + q.x, oz + q.z), q.top);
  if (p.slide) meshPoolSlide(mb, p.slide, world);
  return mb.result().slice();
}

function meshPoolColumn(mb, x, z, r, y0, y1) {
  const seg = 24;
  mb.ensure(seg * 6);
  for (let k = 0; k < seg; k++) {
    const a = k / seg * Math.PI * 2, b = (k + 1) / seg * Math.PI * 2;
    const v = (t, y) => mb.v(x + Math.cos(t) * r, y, z + Math.sin(t) * r, Math.cos(t), 0, Math.sin(t), t * r / 2, -y / 2, TEX.L37_TILE, 0);
    v(a, y0); v(b, y0); v(b, y1); v(a, y0); v(b, y1); v(a, y1);
  }
}

function meshPoolArch(mb, d, ox, oz) {
  const mid = (d.a0 + d.a1) / 2, r = (d.a1 - d.a0) / 2, dep = d.free ? 0.28 : WALL_T;
  const P = (u, y, side) => d.west ? [ox + d.line + side * dep, y, oz + u] : [ox + u, y, oz + d.line + side * dep];
  for (let k = 0; k < 24; k++) {
    const a = k / 24 * Math.PI, b = (k + 1) / 24 * Math.PI, m = (a + b) / 2;
    const ua = mid - Math.cos(a) * r, ub = mid - Math.cos(b) * r;
    const ya = d.spring + Math.sin(a) * d.rise, yb = d.spring + Math.sin(b) * d.rise;
    const va = d.free ? mid - Math.cos(a) * (r + 0.32) : ua, vb = d.free ? mid - Math.cos(b) * (r + 0.32) : ub;
    const ta = d.free ? d.spring + Math.sin(a) * (d.rise + 0.32) : d.top, tb = d.free ? d.spring + Math.sin(b) * (d.rise + 0.32) : d.top;
    for (const s of [-1, 1]) meshPoolSurface(mb, P(ua, ya, s), P(ub, yb, s), P(vb, tb, s), P(va, ta, s), d.west ? [s, 0, 0] : [0, 0, s]);
    const n = d.west ? [0, -Math.sin(m), Math.cos(m)] : [Math.cos(m), -Math.sin(m), 0];
    meshPoolSurface(mb, P(ua, ya, -1), P(ub, yb, -1), P(ub, yb, 1), P(ua, ya, 1), n);
    if (d.free) meshPoolSurface(mb, P(va, ta, 1), P(vb, tb, 1), P(vb, tb, -1), P(va, ta, -1), n.map((v) => -v));
  }
}

function poolColorUV(q) {
  const u = (q + 0.5) / 8;
  return [u, 0.5, u, 0.5, u, 0.5, u, 0.5];
}

// 弯曲管道与滑行共用同一条曲线
function poolSlidePoint(s, t) {
  const a = 1 - t, p = s.points;
  const out = [0, 0, 0];
  for (let k = 0; k < 3; k++) out[k] = a * a * a * p[0][k] + 3 * a * a * t * p[1][k] + 3 * a * t * t * p[2][k] + t * t * t * p[3][k];
  out[0] += s.ox; out[2] += s.oz;
  return out;
}

function meshPoolSlide(mb, s, world) {
  const sections = 44, seg = 16, rings = [];
  for (let k = 0; k <= sections; k++) {
    const t = k / sections, p = poolSlidePoint(s, t), a = poolSlidePoint(s, Math.max(0, t - 0.001)), b = poolSlidePoint(s, Math.min(1, t + 0.001));
    const f = b.map((v, i) => v - a[i]), len = Math.hypot(...f), h = Math.hypot(f[0], f[2]);
    for (let q = 0; q < 3; q++) f[q] /= len;
    const right = [(b[2] - a[2]) / h, 0, -(b[0] - a[0]) / h];
    const up = [f[1] * right[2], f[2] * right[0] - f[0] * right[2], -f[1] * right[0]];
    rings.push({ p, right, up });
  }
  const vertex = (ring, a, rad, inward, color) => {
    const n = ring.right.map((v, i) => v * Math.cos(a) + ring.up[i] * Math.sin(a));
    const p = ring.p.map((v, i) => v + n[i] * rad), sign = inward ? -1 : 1;
    mb.v(p[0], p[1], p[2], n[0] * sign, n[1] * sign, n[2] * sign, (color + 0.5) / 8, 0.5, TEX.POOL_COLORS, 0);
  };
  for (let k = 0; k < sections; k++) {
    for (let j = 0; j < seg; j++) {
      const a = j / seg * Math.PI * 2, b = (j + 1) / seg * Math.PI * 2;
      if (k >= 36 && Math.sin((a + b) / 2) > 0.2) continue; // 末端敞开的滑槽
      for (const [rad, inward, color] of [[0.74, true, 3], [0.82, false, 4]]) {
        mb.ensure(6);
        vertex(rings[k], a, rad, inward, color); vertex(rings[k + 1], a, rad, inward, color); vertex(rings[k + 1], b, rad, inward, color);
        vertex(rings[k], a, rad, inward, color); vertex(rings[k + 1], b, rad, inward, color); vertex(rings[k], b, rad, inward, color);
      }
      if (k === 0 || k === sections - 1) {
        const r = rings[k === 0 ? 0 : sections];
        mb.ensure(6);
        vertex(r, a, 0.74, false, 4); vertex(r, a, 0.82, false, 4); vertex(r, b, 0.82, false, 4);
        vertex(r, a, 0.74, false, 4); vertex(r, b, 0.82, false, 4); vertex(r, b, 0.74, false, 4);
      }
    }
  }
  for (const t of [0.25, 0.62]) {
    const [x, y, z] = poolSlidePoint(s, t);
    meshPipe(mb, 'y', world.floorAt(x, z), y - 0.78, x, z, 0.09, TEX.METAL);
  }
}

// 实体几何的小黄鸭；随水面轻轻漂动，不是贴在屏幕上的图片
function meshPoolDuck(mb, x, y, z, rot, scale) {
  const ca = Math.cos(rot), sa = Math.sin(rot);
  const ellipsoid = (cx, cy, cz, rx, ry, rz, color, seg = 10, rows = 6) => {
    const vert = (a, b) => {
      const nx = Math.cos(a) * Math.cos(b), ny = Math.sin(b), nz = Math.sin(a) * Math.cos(b);
      const px = (cx + nx * rx) * scale, py = (cy + ny * ry) * scale, pz = (cz + nz * rz) * scale;
      let ax = nx / rx, ay = ny / ry, az = nz / rz;
      const len = Math.hypot(ax, ay, az); ax /= len; ay /= len; az /= len;
      mb.v(x + ca * px + sa * pz, y + py, z - sa * px + ca * pz,
        ca * ax + sa * az, ay, -sa * ax + ca * az, (color + 0.5) / 8, 0.5, TEX.POOL_COLORS, 0);
    };
    mb.ensure(seg * rows * 6);
    for (let j = 0; j < rows; j++) for (let i = 0; i < seg; i++) {
      const a = i / seg * Math.PI * 2, b = (i + 1) / seg * Math.PI * 2, v0 = -Math.PI / 2 + j / rows * Math.PI, v1 = v0 + Math.PI / rows;
      vert(a, v0); vert(b, v0); vert(b, v1); vert(a, v0); vert(b, v1); vert(a, v1);
    }
  };
  ellipsoid(0, 0.15, 0.04, 0.36, 0.22, 0.48, 0);
  ellipsoid(0, 0.5, -0.27, 0.23, 0.24, 0.23, 0);
  ellipsoid(0, 0.44, -0.52, 0.17, 0.065, 0.2, 1, 8, 4);
  for (const side of [-1, 1]) {
    ellipsoid(side * 0.29, 0.18, 0.09, 0.1, 0.115, 0.28, 0, 8, 4);
    ellipsoid(side * 0.18, 0.56, -0.41, 0.034, 0.038, 0.034, 2, 6, 4);
  }
  ellipsoid(0, 0.29, 0.43, 0.13, 0.14, 0.2, 0, 8, 4);
}

// 立式储水罐：圆柱 + 顶盖 + 通往天花板的竖管
function meshTank(mb, p, H) {
  const x = (p.x0 + p.x1) / 2, z = (p.z0 + p.z1) / 2;
  meshPipe(mb, 'y', 0, p.y1, x, z, p.r, TEX.PIPE_PAINT);
  const seg = 10;
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
    const A = [x + Math.cos(a0) * p.r, p.y1, z + Math.sin(a0) * p.r], B = [x + Math.cos(a1) * p.r, p.y1, z + Math.sin(a1) * p.r];
    mb.quad([x, p.y1 + 0.06, z], A, B, [x, p.y1 + 0.06, z], [0, 1, 0], [0.5, 0.5, 0, 0, 1, 0, 0.5, 0.5], TEX.METAL, 0);
  }
  meshPipe(mb, 'y', p.y1, H, x + p.r * 0.35, z, 0.08, TEX.PIPE);
  meshPipe(mb, 'y', p.y1, H, x - p.r * 0.4, z + p.r * 0.2, 0.05, TEX.PIPE_INSUL);
  meshPipe(mb, 'y', 0.5, 0.56, x, z, p.r + 0.03, TEX.METAL);
}

// 阀门手轮：垂直于墙面的一圈八边形 + 两根辐条
function meshValve(mb, cx, cy, cz, nx, nz, rad) {
  const tx = nz, tz = -nx, w = 0.03, seg = 8;
  const P = (a, rr) => [cx + tx * Math.cos(a) * rr, cy + Math.sin(a) * rr, cz + tz * Math.cos(a) * rr];
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
    mb.quad(P(a0, rad - w), P(a1, rad - w), P(a1, rad), P(a0, rad), [nx, 0, nz], [0, 0, 1, 0, 1, 1, 0, 1], TEX.VALVE, 0);
  }
  for (const a of [0.4, 0.4 + Math.PI / 2]) {
    const A = P(a, rad), B = P(a + Math.PI, rad), o = 0.012;
    mb.quad([A[0], A[1] - o, A[2]], [B[0], B[1] - o, B[2]], [B[0], B[1] + o, B[2]], [A[0], A[1] + o, A[2]], [nx, 0, nz], [0, 0, 1, 0, 1, 1, 0, 1], TEX.VALVE, 0);
  }
}

const PIPE_TEX = [TEX.PIPE, TEX.PIPE_PAINT, TEX.PIPE_INSUL];

// Level 2：沿隧道墙面铺设的管道。管道参数只取决于全局墙线编号，所以跨区块首尾相接；
// 低处的管道只沿实墙铺设，高处的管道会跨过岔路口继续延伸
function meshTunnelPipes(mb, c, world, ox, oz) {
  const L = world.L, H = L.wallH, T = WALL_T, sd = world.seed;
  const zone = (i, j) => (i < 0 || j < 0 || i > 15 || j > 15 ? 0 : c.zone[I16(i, j)]);

  // 一条管道：沿 axis，从 a0 到 a1；cross 为横向坐标；ends 表示两端是否需要法兰
  const pipe = (axis, a0, a1, cross, y, r, tex, endA, endB, seed) => {
    if (a1 - a0 < 0.05) return;
    meshPipe(mb, axis, a0, a1, cross, y, r, tex);
    const fr = r * 1.3 + 0.012, fl = 0.035;
    if (endA) meshPipe(mb, axis, a0, a0 + fl * 2, cross, y, fr, TEX.METAL);
    if (endB) meshPipe(mb, axis, a1 - fl * 2, a1, cross, y, fr, TEX.METAL);
    const step = 3, off = rand01(seed, 3, sd) * step;
    for (let p = Math.ceil((a0 - off) / step) * step + off; p < a1 - 0.2; p += step) {
      if (p > a0 + 0.2) meshPipe(mb, axis, p - fl, p + fl, cross, y, fr, tex === TEX.PIPE_INSUL ? TEX.METAL : tex);
    }
  };

  // ---- 墙面管道 ----
  for (const axis of ['x', 'z']) {
    for (let li = 1; li < 16; li++) {
      const gLine = axis === 'x' ? c.cz * 16 + li : c.cx * 16 + li;
      const lineC = gLine * CELL;
      const h = ihash(gLine, axis === 'x' ? 11 : 13, sd);
      const R = mulberry32(h);
      const set = [];
      const highs = axis === 'x' ? [2.02, 2.46] : [2.24];
      for (const y of highs) if (R() < 0.8) set.push({ y, r: 0.04 + R() * 0.045, high: true });
      for (const y of [0.3, 0.62]) if (R() < 0.5) set.push({ y, r: 0.05 + R() * 0.06, high: false });
      if (R() < 0.4) set.push({ y: 1.45, r: 0.022, high: false, conduit: true });
      for (const p of set) {
        p.tex = p.conduit ? TEX.METAL : PIPE_TEX[Math.floor(R() * (p.r >= 0.07 ? 3 : 2))];
        p.gap = 0.02 + R() * 0.05;
      }
      // 逐格扫描这条墙线：wall = 有墙时空地所在的一侧（±1），open = 这条线附近是否属于隧道
      const cellInfo = [];
      for (let k = 0; k < 16; k++) {
        const za = axis === 'x' ? zone(k, li - 1) : zone(li - 1, k);
        const zb = axis === 'x' ? zone(k, li) : zone(li, k);
        const wall = (axis === 'x' ? c.wallN : c.wallW)[axis === 'x' ? I16(k, li) : I16(li, k)];
        let side = 0;
        if (wall) side = zb && (!za || zb === 1) ? 1 : -1;
        cellInfo.push({ side, open: za === 1 || zb === 1 });
      }
      const base = axis === 'x' ? ox : oz;
      for (const p of set) {
        let k = 0;
        while (k < 16) {
          const inRun = (q) => (p.high ? cellInfo[q].open : cellInfo[q].side !== 0);
          if (!inRun(k)) { k++; continue; }
          const k0 = k;
          let side = cellInfo[k].side;
          while (k < 16 && inRun(k) && (p.high || cellInfo[k].side === side)) {
            if (!side) side = cellInfo[k].side;
            k++;
          }
          if (!side) side = 1;
          const a0 = base + k0 * CELL + (k0 > 0 ? T : 0), a1 = base + k * CELL - (k < 16 ? T : 0);
          const cross = lineC + side * (T + p.r + p.gap);
          pipe(axis, a0, a1, cross, p.y, p.r, p.tex, k0 > 0, k < 16, h + p.y * 100);
          // 墙上的管卡
          for (let q = k0; q < k; q++) {
            if (!cellInfo[q].side) continue;
            const along = base + (q + 0.5) * CELL, w0 = lineC + side * T, w1 = cross;
            const lo = Math.min(w0, w1), hi = Math.max(w0, w1), s = 0.018;
            if (axis === 'x') meshSmallBox(mb, along - s, p.y - s, lo, along + s, p.y + s, hi, TEX.METAL);
            else meshSmallBox(mb, lo, p.y - s, along - s, hi, p.y + s, along + s, TEX.METAL);
          }
        }
      }
      // 竖向立管，偶尔带阀门
      for (let k = 0; k < 16; k++) {
        const side = cellInfo[k].side;
        if (!side) continue;
        const hv = rand01(gLine * 16 + (axis === 'x' ? c.cx : c.cz) * 16 + k, axis === 'x' ? 5 : 6, sd + 31);
        if (hv > 0.1) continue;
        const along = base + (k + 0.3 + hv * 4) * CELL, rr = 0.055, cross = lineC + side * (T + rr + 0.04);
        const x = axis === 'x' ? along : cross, z = axis === 'x' ? cross : along;
        meshPipe(mb, 'y', 0, H, x, z, rr, hv < 0.05 ? TEX.PIPE_PAINT : TEX.PIPE);
        meshPipe(mb, 'y', 0, 0.05, x, z, rr + 0.03, TEX.METAL);
        if (hv < 0.06) {
          const nx = axis === 'x' ? 0 : side, nz = axis === 'x' ? side : 0;
          meshPipe(mb, axis === 'x' ? 'z' : 'x', axis === 'x' ? z : x, (axis === 'x' ? z : x) + side * 0.14, axis === 'x' ? x : z, 1.25, 0.02, TEX.METAL);
          meshValve(mb, x + nx * 0.14, 1.25, z + nz * 0.14, nx, nz, 0.15);
        }
      }
    }
  }

  // ---- 天花板上沿隧道中线的主管 ----
  for (const axis of ['x', 'z']) {
    for (let li = 2; li < 16; li += 4) {
      const gLine = axis === 'x' ? c.cz * 16 + li : c.cx * 16 + li;
      const R = mulberry32(ihash(gLine, axis === 'x' ? 21 : 23, sd));
      const r = 0.09 + R() * 0.06, off = (R() < 0.5 ? -1 : 1) * (0.25 + R() * 0.2);
      const y = axis === 'x' ? H - r - 0.05 : H - 0.42 - (r - 0.09);
      const tex = PIPE_TEX[Math.floor(R() * 3)];
      const second = R() < 0.5, r2 = 0.04 + R() * 0.03;
      const cross = (gLine + 0.5) * CELL + off;
      const base = axis === 'x' ? ox : oz;
      let k = 0;
      while (k < 16) {
        const zz = axis === 'x' ? zone(k, li) : zone(li, k);
        if (zz !== 1) { k++; continue; }
        const k0 = k;
        while (k < 16 && (axis === 'x' ? zone(k, li) : zone(li, k)) === 1) k++;
        const a0 = base + k0 * CELL + (k0 > 0 ? T : 0), a1 = base + k * CELL - (k < 16 ? T : 0);
        pipe(axis, a0, a1, cross, y, r, tex, k0 > 0, k < 16, gLine * 7 + (axis === 'x' ? 1 : 2));
        if (second) pipe(axis, a0, a1, cross - off * 1.6, y + r - r2, r2, TEX.PIPE, k0 > 0, k < 16, gLine * 7 + 5);
        // 吊杆
        for (let q = k0; q < k; q++) {
          const along = base + (q + 0.5) * CELL, s = 0.012;
          const x = axis === 'x' ? along : cross, z = axis === 'x' ? cross : along;
          meshSmallBox(mb, x - s, y + r, z - s, x + s, H, z + s, TEX.METAL);
        }
      }
    }
  }
}
