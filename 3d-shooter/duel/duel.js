/* =========================================================================
   duel.js — 1v1 单挑模式
   共享：utils / textures / audio / effects / enemy_data / enemy_model
   独立：场景布局 / 玩家 / AI 行为 / 计分
   ★ 强制横屏按钮已由 duel.html 独立绑定，本文件不再处理
   ========================================================================= */
"use strict";

/* =====================================================================
   常量
   ===================================================================== */
const ARENA_HALF      = 14;
const WIN_SCORE       = 40;
const PLAYER_HP_MAX   = 100;
const AI_HP_MAX       = 100;
const HEADSHOT_DMG    = 55;
const BODY_DMG        = 25;
const AI_HEADSHOT_RATE= 0.70;
const MOVE_SPEED      = 5.5;
const CROUCH_SPEED    = 2.6;
const MOUSE_SENS      = 0.0022;
const TOUCH_SENS      = 0.010;

const IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
if (IS_TOUCH) document.body.classList.add('touch');

/* 共享模块可用性检测 */
const HAS_EFFECTS = (typeof spawnParticle === 'function');
const HAS_TRACER  = (typeof spawnTracer === 'function');
const HAS_SFX     = (typeof SFX !== 'undefined' && typeof SFX.gunshot === 'function');

/* =====================================================================
   渲染器
   ===================================================================== */
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
window.renderer = renderer;

/* scene / camera 已在 duel.html 里创建好 */
camera.aspect = window.innerWidth / window.innerHeight;
camera.updateProjectionMatrix();

scene.background = new THREE.Color(0x9fb3c8);
scene.fog = new THREE.Fog(0x9fb3c8, 32, 90);

scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.7));
const sun = new THREE.DirectionalLight(0xffe9c8, 1.3);
sun.position.set(14, 24, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left   = -18;
sun.shadow.camera.right  =  18;
sun.shadow.camera.top    =  18;
sun.shadow.camera.bottom = -18;
sun.shadow.camera.far    = 60;
scene.add(sun);

/* =====================================================================
   全局状态
   ===================================================================== */
const G = {
  playerHP: PLAYER_HP_MAX,
  aiHP: AI_HP_MAX,
  playerScore: 0,
  aiScore: 0,
  magazine: 30,
  magazineSize: 30,
  reloading: false,
  reloadT: 0,
  fireCd: 0,
  started: false,
  ended: false,
  needRespawnPlayer: false,
  needRespawnAI: false,
  respawnT: 0,
  invulnT: 0,
};

const player = {
  pos: new THREE.Vector3(0, 1.72, 10),
  yaw: Math.PI,
  pitch: 0,
  crouch: false,
};

const ai = {
  pos: new THREE.Vector3(0, 1.72, -10),
  vel: new THREE.Vector3(0, 0, 0),
  yaw: 0,
  pitch: 0,
  stance: 'stand',
  stanceT: 0,
  targetPos: new THREE.Vector3(0, 1.72, -10),
  targetT: 0,
  fireT: 0,
  onGround: true,
  dead: false,
  deadT: 0,
  model: null,
  group: null,
};

const keys = {};
let pointerLocked = false;

const moveTouch = { id: null, baseX: 0, baseY: 0, x: 0, y: 0 };
const lookTouch = { id: null, x: 0, y: 0 };

const planks = [];

/* =====================================================================
   地图
   ===================================================================== */
function buildMap() {
  const floorGeo = new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xa0907a, roughness: 0.95, metalness: 0.02 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  scene.add(floor);

  const plankA = new THREE.MeshStandardMaterial({ color: 0x8a6a3e, roughness: 0.92, metalness: 0.03 });
  const plankB = new THREE.MeshStandardMaterial({ color: 0x6b5030, roughness: 0.94, metalness: 0.03 });

  const layout = [
    { x: -4, z: 0, w: 0.5, h: 1.7, d: 4.5, mat: plankA },
    { x:  4, z: 0, w: 0.5, h: 1.7, d: 4.5, mat: plankA },
    { x: -8, z: -4, w: 3.2, h: 1.0, d: 0.4, mat: plankB },
    { x:  8, z: -4, w: 3.2, h: 1.0, d: 0.4, mat: plankB },
    { x: -8, z:  4, w: 3.2, h: 1.0, d: 0.4, mat: plankB },
    { x:  8, z:  4, w: 3.2, h: 1.0, d: 0.4, mat: plankB },
    { x: 0, z: -12, w: 5.5, h: 1.9, d: 0.5, mat: plankA },
    { x: 0, z:  12, w: 5.5, h: 1.9, d: 0.5, mat: plankA },
    { x: -3, z: -6, w: 1.2, h: 1.1, d: 1.2, mat: plankB },
    { x:  3, z:  6, w: 1.2, h: 1.1, d: 1.2, mat: plankB },
    { x: -10, z: -10, w: 1.5, h: 1.5, d: 0.4, mat: plankB },
    { x:  10, z: -10, w: 1.5, h: 1.5, d: 0.4, mat: plankB },
    { x: -10, z:  10, w: 1.5, h: 1.5, d: 0.4, mat: plankB },
    { x:  10, z:  10, w: 1.5, h: 1.5, d: 0.4, mat: plankB },
  ];

  for (let i = 0; i < layout.length; i++) {
    const p = layout[i];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), p.mat);
    mesh.position.set(p.x, p.h / 2, p.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    planks.push({
      minX: p.x - p.w / 2, maxX: p.x + p.w / 2,
      minZ: p.z - p.d / 2, maxZ: p.z + p.d / 2,
      topY: p.h,
    });
  }

  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 0.7, metalness: 0.15 });
  const fenceH = 3.5;
  const mkFence = function(x, z, w, d){
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, fenceH, d), fenceMat);
    mesh.position.set(x, fenceH / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    planks.push({
      minX: x - w / 2, maxX: x + w / 2,
      minZ: z - d / 2, maxZ: z + d / 2,
      topY: fenceH,
    });
  };
  mkFence(0, -ARENA_HALF, ARENA_HALF * 2 + 0.4, 0.4);
  mkFence(0,  ARENA_HALF, ARENA_HALF * 2 + 0.4, 0.4);
  mkFence(-ARENA_HALF, 0, 0.4, ARENA_HALF * 2 + 0.4);
  mkFence( ARENA_HALF, 0, 0.4, ARENA_HALF * 2 + 0.4);
}

/* =====================================================================
   玩家第一人称武器
   ===================================================================== */
function buildWeaponVM() {
  const vm = new THREE.Group();

  const bodyMat  = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.5, metalness: 0.4 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.4, metalness: 0.3 });

  vm.add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.42), bodyMat));

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.38, 8), blackMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.01, -0.38);
  vm.add(barrel);

  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.08), blackMat);
  mag.position.set(0, -0.12, 0.02);
  vm.add(mag);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.15, 0.06), blackMat);
  grip.position.set(0, -0.12, 0.16);
  grip.rotation.x = 0.2;
  vm.add(grip);

  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.18), bodyMat);
  stock.position.set(0, 0, 0.28);
  vm.add(stock);

  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.05), blackMat);
  sight.position.set(0, 0.09, -0.14);
  vm.add(sight);

  vm.position.set(0.16, -0.14, -0.35);
  vm.rotation.set(0, 0.06, 0);
  camera.add(vm);
}

/* =====================================================================
   AI 模型
   ===================================================================== */
function buildAIModel() {
  try {
    if (typeof buildEnemyModel === 'function'){
      const tierNormal = (typeof TIER !== 'undefined' && TIER.NORMAL !== undefined) ? TIER.NORMAL : 0;
      const built = buildEnemyModel({ kind: 'rifle', tier: tierNormal, scale: 1 });
      ai.model = built;
      ai.group = built.model;
      ai.group.position.set(ai.pos.x, 0, ai.pos.z);
      scene.add(ai.group);
      console.log('[DUEL] ✓ 使用主游戏 buildEnemyModel');
      return;
    }
  } catch (err){
    console.warn('[DUEL] buildEnemyModel 失败，退回简单模型：', err);
  }

  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: 0x2d3a2a, roughness: 0.85 });
  const skin  = new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.9 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.72, 0.32), cloth);
  body.position.y = 1.22; body.castShadow = true; g.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), skin);
  head.position.y = 1.72; head.castShadow = true; g.add(head);

  const helm = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.14, 0.30), cloth);
  helm.position.y = 1.84; helm.castShadow = true; g.add(helm);

  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.82, 0.20), cloth);
    leg.position.set(s * 0.14, 0.42, 0); leg.castShadow = true; g.add(leg);
  }
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.60, 0.13), cloth);
    arm.position.set(s * 0.36, 1.26, 0); arm.castShadow = true; g.add(arm);
  }

  const gunM = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.4 });
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.55), gunM);
  gun.position.set(0.20, 1.26, -0.34); gun.castShadow = true; g.add(gun);

  ai.group = g;
  scene.add(g);
  console.log('[DUEL] ⚠ 使用兜底简单模型');
}

/* =====================================================================
   命中盒
   ===================================================================== */
function hitboxesFor(entity, stance) {
  const px = entity.x, py = entity.y, pz = entity.z;
  const eyeH = stance === 'crouch' ? 1.08 : stance === 'prone' ? 0.55 : 1.72;
  const baseY = py - eyeH;

  return {
    head: { minX: px - 0.20, maxX: px + 0.20, minY: baseY + 1.45, maxY: baseY + 1.95, minZ: pz - 0.20, maxZ: pz + 0.20 },
    body: { minX: px - 0.32, maxX: px + 0.32, minY: baseY + 0.85, maxY: baseY + 1.45, minZ: pz - 0.32, maxZ: pz + 0.32 },
    legs: { minX: px - 0.28, maxX: px + 0.28, minY: baseY + 0.00, maxY: baseY + 0.85, minZ: pz - 0.28, maxZ: pz + 0.28 },
  };
}

/* =====================================================================
   视线 / 碰撞
   ===================================================================== */
function hasLineOfSight(from, to) {
  const steps = 24;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = from.x + (to.x - from.x) * t;
    const z = from.z + (to.z - from.z) * t;
    const y = from.y + (to.y - from.y) * t;
    for (let j = 0; j < planks.length; j++) {
      const p = planks[j];
      if (x > p.minX && x < p.maxX && z > p.minZ && z < p.maxZ && y < p.topY && y > 0) return false;
    }
  }
  return true;
}

function blockedAt(x, z, r) {
  for (let i = 0; i < planks.length; i++) {
    const p = planks[i];
    if (x + r > p.minX && x - r < p.maxX && z + r > p.minZ && z - r < p.maxZ) return true;
  }
  return false;
}

function tryMove(ent, dx, dz, r) {
  r = r || 0.35;
  const nx = ent.pos.x + dx;
  if (!blockedAt(nx, ent.pos.z, r)) ent.pos.x = nx;
  const nz = ent.pos.z + dz;
  if (!blockedAt(ent.pos.x, nz, r)) ent.pos.z = nz;
  ent.pos.x = Math.max(-ARENA_HALF + 0.6, Math.min(ARENA_HALF - 0.6, ent.pos.x));
  ent.pos.z = Math.max(-ARENA_HALF + 0.6, Math.min(ARENA_HALF - 0.6, ent.pos.z));
}

/* =====================================================================
   玩家
   ===================================================================== */
function updatePlayer(dt) {
  camera.position.copy(player.pos);
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;

  let mx = 0, mz = 0;
  if (IS_TOUCH && moveTouch.id !== null) {
    const dx = moveTouch.x - moveTouch.baseX;
    const dy = moveTouch.y - moveTouch.baseY;
    const d = Math.hypot(dx, dy);
    if (d > 8) {
      const k = Math.min(1, d / 60);
      mx = (dx / d) * k;
      mz = (dy / d) * k;
    }
  } else {
    if (keys['KeyW'] || keys['ArrowUp'])    mz -= 1;
    if (keys['KeyS'] || keys['ArrowDown'])  mz += 1;
    if (keys['KeyA'] || keys['ArrowLeft'])  mx -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) mx += 1;
  }

  if (mx || mz) {
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const cos = Math.cos(player.yaw), sin = Math.sin(player.yaw);
    const wx =  mx * cos + mz * sin;
    const wz = -mx * sin + mz * cos;
    const speed = player.crouch ? CROUCH_SPEED : MOVE_SPEED;
    tryMove(player, wx * speed * dt, wz * speed * dt, 0.35);
  }

  player.pos.y = player.crouch ? 1.08 : 1.72;

  if (G.reloading) {
    G.reloadT -= dt;
    if (G.reloadT <= 0) { G.reloading = false; G.magazine = G.magazineSize; updateAmmoUI(); }
  }
  if (G.fireCd > 0) G.fireCd -= dt;
  if (G.invulnT > 0) G.invulnT -= dt;

  if (G.needRespawnPlayer) {
    G.respawnT -= dt;
    if (G.respawnT <= 0) respawnPlayer();
  }
}

/* =====================================================================
   AI
   ===================================================================== */
function updateAI(dt) {
  if (ai.dead) {
    ai.deadT += dt;
    updateAIModel();
    if (ai.deadT > 1.5 && G.needRespawnAI) respawnAI();
    return;
  }

  ai.stanceT -= dt;
  if (ai.stanceT <= 0) {
    const roll = Math.random();
    if (roll < 0.45) { ai.stance = 'stand';  ai.stanceT = 1.6 + Math.random() * 1.4; }
    else if (roll < 0.68) { ai.stance = 'crouch'; ai.stanceT = 1.0 + Math.random() * 1.0; }
    else if (roll < 0.82) { ai.stance = 'prone';  ai.stanceT = 0.8 + Math.random() * 0.8; }
    else {
      ai.stance = 'stand';  ai.stanceT = 1.2 + Math.random() * 0.8;
      if (ai.onGround) { ai.vel.y = 6.0; ai.onGround = false; }
    }
  }

  const eyeBase = ai.stance === 'crouch' ? 1.08 : ai.stance === 'prone' ? 0.55 : 1.72;
  if (!ai.onGround) {
    ai.vel.y -= 22 * dt;
    ai.pos.y += ai.vel.y * dt;
    if (ai.pos.y <= eyeBase) { ai.pos.y = eyeBase; ai.vel.y = 0; ai.onGround = true; }
  } else {
    ai.pos.y = eyeBase;
  }

  ai.targetT -= dt;
  if (ai.targetT <= 0) {
    const angle = Math.random() * Math.PI * 2;
    const dist  = 5 + Math.random() * 6;
    let tx = player.pos.x + Math.cos(angle) * dist;
    let tz = player.pos.z + Math.sin(angle) * dist;
    tx = Math.max(-ARENA_HALF + 2, Math.min(ARENA_HALF - 2, tx));
    tz = Math.max(-ARENA_HALF + 2, Math.min(ARENA_HALF - 2, tz));
    ai.targetPos.set(tx, ai.pos.y, tz);
    ai.targetT = 1.4 + Math.random() * 2.0;
  }

  const dx = ai.targetPos.x - ai.pos.x;
  const dz = ai.targetPos.z - ai.pos.z;
  const d  = Math.hypot(dx, dz);
  if (d > 0.6) {
    const speed = ai.stance === 'prone' ? 0.6 : ai.stance === 'crouch' ? 1.6 : 3.2;
    tryMove(ai, dx / d * speed * dt, dz / d * speed * dt, 0.35);
  }

  const tdx = player.pos.x - ai.pos.x;
  const tdz = player.pos.z - ai.pos.z;
  const targetYaw = Math.atan2(tdx, tdz) + Math.PI;
  let dy = targetYaw - ai.yaw;
  while (dy >  Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  ai.yaw += dy * Math.min(1, dt * 10);

  ai.fireT -= dt;
  if (ai.fireT <= 0) {
    const eyePos    = new THREE.Vector3(ai.pos.x, ai.pos.y, ai.pos.z);
    const targetPos = new THREE.Vector3(player.pos.x, player.pos.y - 0.25, player.pos.z);
    if (hasLineOfSight(eyePos, targetPos)) {
      aiFire();
      ai.fireT = 0.10 + Math.random() * 0.14;
    } else {
      ai.fireT = 0.25;
    }
  }

  updateAIModel();
}

function aiFire() {
  try {
    if (HAS_TRACER){
      const origin = new THREE.Vector3(ai.pos.x, ai.pos.y - 0.3, ai.pos.z);
      const dir = new THREE.Vector3(
        player.pos.x - ai.pos.x, 0, player.pos.z - ai.pos.z
      ).normalize();
      const end = origin.clone().addScaledVector(dir, 5);
      spawnTracer(origin, end, 0xff9a5a, 1.0);
    }
    if (HAS_SFX){
      const pan = Math.max(-1, Math.min(1, (ai.pos.x - player.pos.x) / 16));
      const dist = Math.hypot(ai.pos.x - player.pos.x, ai.pos.z - player.pos.z);
      SFX.gunshot('rifle', pan, dist);
    }
  } catch (err){}

  const dist = Math.hypot(player.pos.x - ai.pos.x, player.pos.z - ai.pos.z);
  const distFactor = Math.max(0.45, 1 - dist / 25);
  const stanceFactor = ai.stance === 'prone' ? 1.25 : ai.stance === 'crouch' ? 1.10 : 1.0;
  const hitChance = Math.min(0.90, 0.72 * distFactor * stanceFactor);
  if (Math.random() > hitChance) return;

  if (Math.random() < AI_HEADSHOT_RATE) damagePlayer(HEADSHOT_DMG, true);
  else                                  damagePlayer(BODY_DMG, false);
}

/* =====================================================================
   伤害
   ===================================================================== */
function damagePlayer(dmg, isHead) {
  if (G.ended) return;
  if (G.invulnT > 0) return;
  if (G.needRespawnPlayer) return;

  G.playerHP -= dmg;
  updateHPUI();

  if (G.playerHP <= 0) {
    G.playerHP = 0;
    updateHPUI();
    G.aiScore++;
    updateScoreUI();
    if (G.aiScore >= WIN_SCORE) { endGame(false); return; }
    G.needRespawnPlayer = true;
    G.respawnT = 1.5;
  }
}

function damageAI(dmg, isHead) {
  if (G.ended) return;
  if (ai.dead) return;

  G.aiHP -= dmg;
  if (G.aiHP <= 0) {
    G.aiHP = 0;
    G.playerScore++;
    updateScoreUI();
    ai.dead = true;
    ai.deadT = 0;
    G.needRespawnAI = true;
    if (G.playerScore >= WIN_SCORE) endGame(true);
  }
}

function respawnPlayer() {
  G.needRespawnPlayer = false;
  G.playerHP = PLAYER_HP_MAX;
  player.pos.set(0, 1.72, 10);
  player.yaw = Math.PI;
  player.pitch = 0;
  player.crouch = false;
  G.magazine = G.magazineSize;
  G.reloading = false;
  G.invulnT = 1.2;
  updateHPUI();
  updateAmmoUI();
}

function respawnAI() {
  G.needRespawnAI = false;
  G.aiHP = AI_HP_MAX;
  ai.pos.set(0, 1.72, -10);
  ai.vel.set(0, 0, 0);
  ai.yaw = 0;
  ai.stance = 'stand';
  ai.stanceT = 1.5;
  ai.fireT = 0.8;
  ai.onGround = true;
  ai.dead = false;
  ai.deadT = 0;
  ai.targetT = 0;
  updateAIModel();
}

function updateAIModel() {
  if (!ai.group) return;
  const g = ai.group;

  g.position.set(ai.pos.x, 0, ai.pos.z);
  g.rotation.set(0, ai.yaw, 0);
  g.scale.set(1, 1, 1);

  if (ai.dead) {
    const t = Math.min(1, ai.deadT / 0.55);
    g.rotation.z = t * Math.PI / 2;
    g.position.y = t * 0.1;
    return;
  }

  if (ai.stance === 'crouch') {
    g.scale.set(1, 0.63, 1);
  } else if (ai.stance === 'prone') {
    g.scale.set(1, 0.32, 1);
    g.rotation.x = -0.35;
  } else {
    g.scale.set(1, 1, 1);
  }
}

/* =====================================================================
   玩家射击
   ===================================================================== */
function playerShoot() {
  if (G.ended || !G.started) return;
  if (G.reloading) return;
  if (G.fireCd > 0) return;
  if (G.magazine <= 0) { startReload(); return; }

  G.magazine--;
  G.fireCd = 0.085;
  updateAmmoUI();

  player.pitch += (Math.random() - 0.5) * 0.012 - 0.009;
  player.pitch = Math.max(-Math.PI/2 + 0.01, Math.min(Math.PI/2 - 0.01, player.pitch));

  const origin = new THREE.Vector3().copy(player.pos);
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);

  try {
    if (HAS_TRACER){
      const end = origin.clone().addScaledVector(dir, 30);
      spawnTracer(origin, end, 0xffcf80, 1.2);
    }
    if (HAS_SFX) SFX.gunshot('rifle', 0, 0);
  } catch (err){}

  const hit = raycastAI(origin, dir);
  if (hit) {
    try {
      if (HAS_SFX && typeof SFX.hitBeep === 'function') SFX.hitBeep(hit.head);
    } catch (err){}

    if (hit.head) damageAI(HEADSHOT_DMG, true);
    else          damageAI(BODY_DMG, false);
  }
}

function raycastAI(origin, dir) {
  if (ai.dead) return null;

  const hb = hitboxesFor(ai.pos, ai.stance);
  const boxes = [
    { name: 'head', box: hb.head },
    { name: 'body', box: hb.body },
    { name: 'legs', box: hb.legs },
  ];

  const maxDist = 60;
  const step = 0.12;
  for (let t = 0; t < maxDist; t += step) {
    const x = origin.x + dir.x * t;
    const y = origin.y + dir.y * t;
    const z = origin.z + dir.z * t;

    let hitWall = false;
    for (let i = 0; i < planks.length; i++) {
      const p = planks[i];
      if (x > p.minX && x < p.maxX && z > p.minZ && z < p.maxZ && y < p.topY && y > 0) { hitWall = true; break; }
    }
    if (hitWall) return null;

    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (x > b.box.minX && x < b.box.maxX &&
          y > b.box.minY && y < b.box.maxY &&
          z > b.box.minZ && z < b.box.maxZ) {
        return { head: b.name === 'head', dist: t };
      }
    }
  }
  return null;
}

/* =====================================================================
   输入（强制横屏已由 HTML 独立处理）
   ===================================================================== */
function setupInput() {
  window.addEventListener('keydown', function(e){
    keys[e.code] = true;
    if (e.code === 'KeyR') startReload();
    if (e.code === 'KeyC') player.crouch = !player.crouch;
  });
  window.addEventListener('keyup', function(e){ keys[e.code] = false; });

  const startScreenEl = document.getElementById('startScreen');
  if (startScreenEl){
    const onStart = function(e){
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (G.started || G.ended) return;
      G.started = true;
      startScreenEl.classList.add('hide');
      try { if (HAS_SFX && typeof SFX.init === 'function') SFX.init(); } catch (err){}
      if (!IS_TOUCH && canvas.requestPointerLock) canvas.requestPointerLock();
    };
    startScreenEl.addEventListener('click', onStart);
    startScreenEl.addEventListener('touchstart', onStart, { passive: false });
  }

  canvas.addEventListener('click', function(){
    if (G.ended || !G.started || IS_TOUCH) return;
    if (!pointerLocked && canvas.requestPointerLock) canvas.requestPointerLock();
    else playerShoot();
  });

  document.addEventListener('pointerlockchange', function(){
    pointerLocked = (document.pointerLockElement === canvas);
  });

  document.addEventListener('mousemove', function(e){
    if (!pointerLocked) return;
    player.yaw   -= e.movementX * MOUSE_SENS;
    player.pitch -= e.movementY * MOUSE_SENS;
    player.pitch = Math.max(-Math.PI/2 + 0.01, Math.min(Math.PI/2 - 0.01, player.pitch));
  });

  const onTouchStart = function(e){
    if (G.ended || !G.started) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const el = document.elementFromPoint ? document.elementFromPoint(t.clientX, t.clientY) : null;
      if (el && el.closest && el.closest('.tbtn')) continue;

      if (t.clientX < window.innerWidth / 2 && moveTouch.id === null) {
        moveTouch.id = t.identifier;
        moveTouch.baseX = t.clientX;
        moveTouch.baseY = t.clientY;
        moveTouch.x = t.clientX;
        moveTouch.y = t.clientY;
        const base = document.getElementById('stickBase');
        const knob = document.getElementById('stickKnob');
        if (base){ base.style.display = 'block'; base.style.left = t.clientX + 'px'; base.style.top = t.clientY + 'px'; }
        if (knob){ knob.style.display = 'block'; knob.style.left = t.clientX + 'px'; knob.style.top = t.clientY + 'px'; }
      } else if (t.clientX >= window.innerWidth / 2 && lookTouch.id === null) {
        lookTouch.id = t.identifier;
        lookTouch.x = t.clientX;
        lookTouch.y = t.clientY;
      }
    }
  };

  const onTouchMove = function(e){
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === moveTouch.id) {
        moveTouch.x = t.clientX;
        moveTouch.y = t.clientY;
        const dx = moveTouch.x - moveTouch.baseX;
        const dy = moveTouch.y - moveTouch.baseY;
        const d = Math.hypot(dx, dy);
        const maxR = 55;
        const k = d > maxR ? maxR / d : 1;
        const knob = document.getElementById('stickKnob');
        if (knob){ knob.style.left = (moveTouch.baseX + dx * k) + 'px'; knob.style.top = (moveTouch.baseY + dy * k) + 'px'; }
      } else if (t.identifier === lookTouch.id) {
        const dx = t.clientX - lookTouch.x;
        const dy = t.clientY - lookTouch.y;
        player.yaw   -= dx * TOUCH_SENS;
        player.pitch -= dy * TOUCH_SENS;
        player.pitch = Math.max(-Math.PI/2 + 0.01, Math.min(Math.PI/2 - 0.01, player.pitch));
        lookTouch.x = t.clientX;
        lookTouch.y = t.clientY;
      }
    }
  };

  const onTouchEnd = function(e){
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === moveTouch.id) {
        moveTouch.id = null;
        const base = document.getElementById('stickBase');
        const knob = document.getElementById('stickKnob');
        if (base) base.style.display = 'none';
        if (knob) knob.style.display = 'none';
      } else if (t.identifier === lookTouch.id) {
        lookTouch.id = null;
      }
    }
  };

  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove',  onTouchMove,  { passive: true });
  window.addEventListener('touchend',   onTouchEnd,   { passive: true });
  window.addEventListener('touchcancel', function(){
    moveTouch.id = null;
    lookTouch.id = null;
    const base = document.getElementById('stickBase');
    const knob = document.getElementById('stickKnob');
    if (base) base.style.display = 'none';
    if (knob) knob.style.display = 'none';
  });

  const btnFire   = document.getElementById('btnFire');
  const btnReload = document.getElementById('btnReload');
  const btnCrouch = document.getElementById('btnCrouch');

  if (btnFire) btnFire.addEventListener('touchstart', function(e){
    e.preventDefault(); e.stopPropagation();
    if (G.started && !G.ended) playerShoot();
  }, { passive: false });

  if (btnReload) btnReload.addEventListener('touchstart', function(e){
    e.preventDefault(); e.stopPropagation();
    startReload();
  }, { passive: false });

  if (btnCrouch) btnCrouch.addEventListener('touchstart', function(e){
    e.preventDefault(); e.stopPropagation();
    player.crouch = !player.crouch;
  }, { passive: false });

  const btnRestart = document.getElementById('btnRestart');
  if (btnRestart) btnRestart.addEventListener('click', function(){ location.reload(); });

  window.addEventListener('resize', function(){
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function startReload() {
  if (G.reloading || G.magazine === G.magazineSize) return;
  G.reloading = true;
  G.reloadT = 2.0;
  updateAmmoUI();
}

/* =====================================================================
   UI
   ===================================================================== */
function updateScoreUI() {
  const a = document.getElementById('enemyScore');
  const b = document.getElementById('playerScore');
  if (a) a.textContent = G.aiScore;
  if (b) b.textContent = G.playerScore;
}

function updateHPUI() {
  const el = document.getElementById('hpFill');
  if (!el) return;
  const k = Math.max(0, G.playerHP) / PLAYER_HP_MAX;
  el.style.transform = 'scaleX(' + k + ')';
}

function updateAmmoUI() {
  const mag = document.getElementById('magNum');
  const hint = document.getElementById('reloadHint');
  if (mag)  mag.textContent = G.magazine;
  if (hint) hint.textContent = G.reloading ? 'RELOADING...' : '';
}

function endGame(win) {
  G.ended = true;
  if (document.pointerLockElement) document.exitPointerLock();

  setTimeout(function(){
    const el = document.getElementById('endScreen');
    if (!el) return;
    el.classList.remove('hide', 'win', 'lose');
    el.classList.add(win ? 'win' : 'lose');
    const t = document.getElementById('endTitle');
    const s = document.getElementById('endSub');
    if (t) t.textContent = win ? 'YOU WIN' : 'YOU LOSE';
    if (s) s.textContent = 'YOU ' + G.playerScore + '  —  AI ' + G.aiScore;
  }, 900);
}

/* =====================================================================
   主循环 / 启动
   ===================================================================== */
let lastT = performance.now();

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  if (G.started && !G.ended) {
    updatePlayer(dt);
    updateAI(dt);
  }

  try {
    if (HAS_EFFECTS && typeof updateParticles === 'function') updateParticles(dt);
  } catch (err){}

  renderer.render(scene, camera);
}

function boot() {
  try { setupInput(); }    catch (err){ console.error('[DUEL] setupInput 失败：', err); }
  try { buildMap(); }       catch (err){ console.error('[DUEL] buildMap 失败：', err); }
  try { buildWeaponVM(); }  catch (err){ console.error('[DUEL] buildWeaponVM 失败：', err); }
  try { buildAIModel(); }   catch (err){ console.error('[DUEL] buildAIModel 失败：', err); }
  try { updateScoreUI(); updateHPUI(); updateAmmoUI(); }
  catch (err){ console.error('[DUEL] UI 初始化失败：', err); }
  requestAnimationFrame(loop);
}

boot();