/* =========================================================================
   queries.js
   世界查询 —— 空间网格加速版碰撞 / 地面高度缓存 / 可站立区域泛洪
   ========================================================================= */
"use strict";

/* --------------------------------------------------------------------------
   空间哈希网格 —— 把 O(N) blocked() 降到 O(附近格子)
   -------------------------------------------------------------------------- */
const GRID_CELL = 4.0;
let gridCols = 0, gridRows = 0, gridOriginX = -30, gridOriginZ = -30;
let colliderGrid = null;
let _gridStamp = 0;
let _gridSeen = new Uint32Array(0);
let _cachedColliderCount = -1;

function buildColliderGrid(){
  gridCols = Math.ceil(60 / GRID_CELL) + 1;
  gridRows = gridCols;
  colliderGrid = new Array(gridCols * gridRows);
  for (let i = 0; i < colliderGrid.length; i++) colliderGrid[i] = [];

  for (let n = 0; n < colliders.length; n++){
    const c = colliders[n];
    const i0 = Math.max(0, Math.floor((c.minX - gridOriginX) / GRID_CELL));
    const i1 = Math.min(gridCols - 1, Math.floor((c.maxX - gridOriginX) / GRID_CELL));
    const j0 = Math.max(0, Math.floor((c.minZ - gridOriginZ) / GRID_CELL));
    const j1 = Math.min(gridRows - 1, Math.floor((c.maxZ - gridOriginZ) / GRID_CELL));
    for (let j = j0; j <= j1; j++){
      const row = j * gridCols;
      for (let i = i0; i <= i1; i++) colliderGrid[row + i].push(n);
    }
  }
  _gridSeen = new Uint32Array(colliders.length);
  _cachedColliderCount = colliders.length;
  _gridStamp = 0;
}

function ensureGrid(){
  if (!colliderGrid || _cachedColliderCount !== colliders.length) buildColliderGrid();
}

const _qScratch = [];

function queryColliders(x, z, r){
  ensureGrid();
  _qScratch.length = 0;
  _gridStamp++;
  const i0 = Math.max(0, Math.floor((x - r - gridOriginX) / GRID_CELL));
  const i1 = Math.min(gridCols - 1, Math.floor((x + r - gridOriginX) / GRID_CELL));
  const j0 = Math.max(0, Math.floor((z - r - gridOriginZ) / GRID_CELL));
  const j1 = Math.min(gridRows - 1, Math.floor((z + r - gridOriginZ) / GRID_CELL));

  for (let j = j0; j <= j1; j++){
    const row = j * gridCols;
    for (let i = i0; i <= i1; i++){
      const cell = colliderGrid[row + i];
      for (let k = 0; k < cell.length; k++){
        const n = cell[k];
        if (_gridSeen[n] === _gridStamp) continue;
        _gridSeen[n] = _gridStamp;
        _qScratch.push(colliders[n]);
      }
    }
  }
  return _qScratch;
}

/* --------------------------------------------------------------------------
   blocked / depenetrate / moveSlide —— 改用网格
   -------------------------------------------------------------------------- */
function blocked(x, z, y0, y1, radius){
  const list = queryColliders(x, z, radius + 0.1);
  for (let i = 0; i < list.length; i++){
    const c = list[i];
    if (y1 <= c.minY + 0.02 || y0 >= c.maxY - 0.02) continue;
    const cx = clamp(x, c.minX, c.maxX), cz = clamp(z, c.minZ, c.maxZ);
    const dx = x - cx, dz = z - cz;
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  return false;
}

function depenetrate(pos, radius, y0, y1){
  for (let pass = 0; pass < 2; pass++){
    let moved = false;
    const list = queryColliders(pos.x, pos.z, radius + 0.1);
    for (let i = 0; i < list.length; i++){
      const c = list[i];
      if (y1 <= c.minY + 0.02 || y0 >= c.maxY - 0.02) continue;
      const cx = clamp(pos.x, c.minX, c.maxX), cz = clamp(pos.z, c.minZ, c.maxZ);
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      moved = true;
      if (d2 > 1e-8){
        const d = Math.sqrt(d2), push = radius - d;
        pos.x += dx / d * push;
        pos.z += dz / d * push;
      } else {
        const l = pos.x - c.minX, r = c.maxX - pos.x;
        const b = pos.z - c.minZ, f = c.maxZ - pos.z;
        const m = Math.min(l, r, b, f);
        if      (m === l) pos.x = c.minX - radius;
        else if (m === r) pos.x = c.maxX + radius;
        else if (m === b) pos.z = c.minZ - radius;
        else              pos.z = c.maxZ + radius;
      }
    }
    if (!moved) break;
  }
}

function moveSlide(pos, dx, dz, radius, height){
  const y0 = pos.y + 0.30, y1 = pos.y + height - 0.05;
  if (blocked(pos.x, pos.z, y0, y1, radius)){
    pos.x += dx; pos.z += dz;
    depenetrate(pos, radius, y0, y1);
    return;
  }
  if (dx !== 0 && !blocked(pos.x + dx, pos.z, y0, y1, radius)) pos.x += dx;
  if (dz !== 0 && !blocked(pos.x, pos.z + dz, y0, y1, radius)) pos.z += dz;
}

/* --------------------------------------------------------------------------
   groundAt —— 2m 网格缓存
   -------------------------------------------------------------------------- */
const GC_STEP = 2.0;
const GC_W = Math.round(60 / GC_STEP) + 1;
const _gcHi = new Float32Array(GC_W * GC_W);
const _gcStamp = new Uint32Array(GC_W * GC_W);
let _gcSeq = 0;

function _gcIdx(x, z){
  const i = Math.round((x + 30) / GC_STEP);
  const j = Math.round((z + 30) / GC_STEP);
  if (i < 0 || j < 0 || i >= GC_W || j >= GC_W) return -1;
  return j * GC_W + i;
}

const DOWN = new THREE.Vector3(0, -1, 0);
const UPV  = new THREE.Vector3(0, 1, 0);
const _downRay = new THREE.Raycaster(new THREE.Vector3(), DOWN, 0, 90);
const _upRay   = new THREE.Raycaster(new THREE.Vector3(), UPV, 0, 12);
const _qTmpV   = new THREE.Vector3();

function groundAt(x, z, maxY){
  const k = _gcIdx(x, z);
  if (k >= 0 && _gcStamp[k] === _gcSeq){
    const cached = _gcHi[k];
    if (cached <= maxY + 0.02) return cached;
  }
  _downRay.set(_qTmpV.set(x, maxY + 0.12, z), DOWN);
  _downRay.far = 90;
  const hits = _downRay.intersectObjects(groundMesh, false);
  for (let i = 0; i < hits.length; i++){
    if (hits[i].point.y <= maxY + 0.02){
      if (k >= 0){ _gcHi[k] = hits[i].point.y; _gcStamp[k] = _gcSeq; }
      return hits[i].point.y;
    }
  }
  return null;
}

function ceilingAt(x, z, headY){
  _upRay.set(_qTmpV.set(x, headY - 0.05, z), UPV);
  const hits = _upRay.intersectObjects(ceilMesh, false);
  return hits.length ? hits[0].point.y : Infinity;
}

function invalidateGroundCache(){ _gcSeq++; }

/* --------------------------------------------------------------------------
   nearestFree —— 在 maxR 内找最近的可站立位置
   -------------------------------------------------------------------------- */
function nearestFree(x, z, radius, height, maxR, baseY){
  const y = baseY || 0;
  const free = (px, pz) => !blocked(px, pz, y + 0.30, y + height - 0.05, radius);
  if (free(x, z)) return [x, z];

  for (let r = 0.8; r <= (maxR || 7); r += 0.8){
    for (let i = 0; i < 16; i++){
      const a = (i / 16) * PI * 2 + r;
      const nx = x + Math.cos(a) * r, nz = z + Math.sin(a) * r;
      if (Math.abs(nx) > HALF - 1.5 || Math.abs(nz) > HALF - 1.5) continue;
      if (free(nx, nz)) return [nx, nz];
    }
  }
  return [x, z];
}

/* --------------------------------------------------------------------------
   walkable —— 从出生点泛洪出来的"能走到的地面"网格
   -------------------------------------------------------------------------- */
const walkable = (() => {
  const STEP = 0.5, W = Math.round(HALF * 2 / STEP) + 1;
  const cell  = v => Math.round((v + HALF) / STEP);
  const world = c => c * STEP - HALF;
  let ok = null;

  function build(){
    const free = new Uint8Array(W * W);
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++)
      free[j * W + i] = blocked(world(i), world(j), 0.30, 1.65, 0.34) ? 0 : 1;

    ok = new Uint8Array(W * W);
    const s = cell(SPAWN.z) * W + cell(SPAWN.x);
    const q = [s];
    ok[s] = 1;

    for (let h = 0; h < q.length; h++){
      const cur = q[h], ci = cur % W, cj = (cur - ci) / W;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++){
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= W) continue;
        const n = nj * W + ni;
        if (ok[n] || !free[n]) continue;
        if (di && dj && (!free[cj * W + ni] || !free[nj * W + ci])) continue;
        ok[n] = 1;
        q.push(n);
      }
    }
  }

  return (x, z) => {
    if (!ok) build();
    const i = cell(x), j = cell(z);
    if (i < 0 || j < 0 || i >= W || j >= W) return false;
    return !!ok[j * W + i];
  };
})();

function nearestReachable(x, z, radius, height, maxR){
  const good = (px, pz) => !blocked(px, pz, 0.30, height - 0.05, radius) && walkable(px, pz);
  if (good(x, z)) return [x, z];

  for (let r = 0.8; r <= (maxR || 10); r += 0.8){
    for (let i = 0; i < 24; i++){
      const a = (i / 24) * PI * 2 + r;
      const nx = x + Math.cos(a) * r, nz = z + Math.sin(a) * r;
      if (Math.abs(nx) > HALF - 1.5 || Math.abs(nz) > HALF - 1.5) continue;
      if (good(nx, nz)) return [nx, nz];
    }
  }
  return nearestFree(x, z, radius, height, maxR, 0);
}