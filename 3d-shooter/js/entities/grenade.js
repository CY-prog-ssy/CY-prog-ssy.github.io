/* =========================================================================
   grenade.js
   投掷物系统 —— 破片手雷 (frag) + 闪光弹 (flash) + 燃烧瓶 (molotov)
   已修复：丢失的变量声明、粒子爆炸全面强化、动态光源接入
   ========================================================================= */
"use strict";

/* =========================================================================
   投掷物注册表
   ========================================================================= */
const THROWABLES = {
  frag: {
    id: 'frag', label: '破片手雷', shortLabel: 'FRAG', icon: '\u2738',
    count: 3, maxCount: 5, fuse: 3.0, canCook: true, chargeTime: 1.30, cookWarnAt: 1.2,
    throwSpeedMin: 13, throwSpeedMax: 26, throwLift: 0.18,
    dmgCenter: 240, dmgRadius: 8.5, killRadius: 1.7, falloffPow: 1.8,
    color: 0x3a4a30, trailColor: 0x2a3824, buildModel: null,
  },
  flash: {
    id: 'flash', label: '闪光弹', shortLabel: 'FLASH', icon: '\u2735',
    count: 2, maxCount: 3, fuse: 3.0, canCook: true, chargeTime: 1.30, cookWarnAt: 1.2,
    throwSpeedMin: 13, throwSpeedMax: 26, throwLift: 0.18,
    dmgCenter: 0, dmgRadius: 0, killRadius: 0, falloffPow: 0,
    flashRadius: 15.0, flashDuration: 3.0,
    color: 0xd0d0d0, trailColor: 0x808080, buildModel: null,
  },
  molotov: {
    id: 'molotov', label: '燃烧瓶', shortLabel: 'MOLOTOV', icon: '\u2668',
    count: 2, maxCount: 2, fuse: 999, canCook: false, chargeTime: 1.30, cookWarnAt: 999,
    throwSpeedMin: 13, throwSpeedMax: 26, throwLift: 0.18,
    dmgCenter: 0, dmgRadius: 0, killRadius: 0, falloffPow: 0,
    fireRadius: 10.0, fireDps: 15, fireDuration: 5.5,
    color: 0x8a5a3a, trailColor: 0x4a2a1a, buildModel: null,
  }
};

const THROWABLE_ORDER = ['frag', 'flash', 'molotov'];

/* =========================================================================
   模型 —— 手雷
   ========================================================================= */
function buildGrenadeBody(){
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: THROWABLES.frag.color, roughness: 0.72, metalness: 0.18 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), bodyMat);
  body.scale.y = 1.12; body.castShadow = true; g.add(body);

  const grooveMat = new THREE.MeshStandardMaterial({ color: THROWABLES.frag.trailColor, roughness: 0.80, metalness: 0.10 });
  for (let i = 0; i < 6; i++){
    const r = Math.sqrt(Math.max(0.05, 1 - Math.pow((i - 2.5) / 3.2, 2)));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.054 * r + 0.001, 0.0045, 4, 14), grooveMat);
    ring.rotation.x = PI / 2; ring.position.y = -0.032 + i * 0.0128; g.add(ring);
  }
  const fuzeMat = new THREE.MeshStandardMaterial({ color: 0x222422, roughness: 0.5, metalness: 0.6 });
  const fuze = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.032, 8), fuzeMat);
  fuze.position.y = 0.070; fuze.castShadow = true; g.add(fuze);

  const ringMat = new THREE.MeshStandardMaterial({ color: 0xc8c8c8, roughness: 0.28, metalness: 0.85 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0038, 6, 14), ringMat);
  ring.position.set(0, 0.088, 0); ring.rotation.set(0.4, 0.5, 0); g.add(ring);

  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.052, 0.004), ringMat);
  lever.position.set(0.020, 0.048, 0); lever.rotation.z = 0.15; g.add(lever);
  return g;
}
THROWABLES.frag.buildModel = buildGrenadeBody;

/* =========================================================================
   模型 —— 闪光弹
   ========================================================================= */
function buildFlashbangBody(){
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6a7a8a, roughness: 0.5, metalness: 0.6 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 12), bodyMat);
  body.castShadow = true; g.add(body);

  const holeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, metalness: 0.1 });
  for (let i = 0; i < 4; i++){
    const hole = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, 0.08), holeMat);
    hole.rotation.y = (i / 4) * PI * 2;
    hole.position.set(Math.sin(i / 4 * PI * 2) * 0.04, 0, Math.cos(i / 4 * PI * 2) * 0.04);
    g.add(hole);
  }

  const capMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4, metalness: 0.7 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.015, 12), capMat);
  cap.position.y = 0.067; g.add(cap);
  const cap2 = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.015, 12), capMat);
  cap2.position.y = -0.067; g.add(cap2);

  const ringMat = new THREE.MeshStandardMaterial({ color: 0xc8c8c8, roughness: 0.28, metalness: 0.85 });
  const pin = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.003, 6, 12), ringMat);
  pin.position.set(0.03, 0.08, 0); pin.rotation.z = 0.5; g.add(pin);

  return g;
}
THROWABLES.flash.buildModel = buildFlashbangBody;

/* =========================================================================
   模型 —— 燃烧瓶
   ========================================================================= */
function buildMolotovBody(){
  const g = new THREE.Group();
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.30, metalness: 0.08, transparent: true, opacity: 0.88 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.055, 0.145, 12), glassMat);
  body.position.y = 0.0; body.castShadow = true; g.add(body);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.008, 12), glassMat);
  base.position.y = -0.076; base.castShadow = true; g.add(base);

  const neckMat = new THREE.MeshStandardMaterial({ color: 0x4a2a15, roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.9 });
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.030, 0.075, 10), neckMat);
  neck.position.y = 0.110; neck.castShadow = true; g.add(neck);
  const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.014, 10), neckMat);
  mouth.position.y = 0.155; g.add(mouth);

  const ragMat = new THREE.MeshStandardMaterial({ color: 0xe8d9b0, roughness: 0.92 });
  const rag = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.016, 0.055, 6), ragMat);
  rag.position.set(0.004, 0.192, 0); rag.rotation.z = 0.28; rag.castShadow = true; g.add(rag);

  const liquidMat = new THREE.MeshStandardMaterial({ color: 0xc85a20, roughness: 0.4, metalness: 0.05, transparent: true, opacity: 0.55 });
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.048, 0.10, 10), liquidMat);
  liquid.position.y = -0.012; g.add(liquid);

  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, depthWrite: false });
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 6), flameMat);
  flame.position.set(0.010, 0.222, 0); flame.scale.y = 1.6; g.add(flame);
  g.userData.flame = flame;
  return g;
}
THROWABLES.molotov.buildModel = buildMolotovBody;

/* =========================================================================
   第一人称手持
   ========================================================================= */
let grenadeHandRoot = null;
let grenadeHandSway = null;
let grenadeHandBody = null;
let grenadeHandModel = null;

function ensureGrenadeHand(){
  if (grenadeHandRoot) return;
  grenadeHandRoot = new THREE.Group();
  grenadeHandSway = new THREE.Group();
  grenadeHandRoot.add(grenadeHandSway);
  grenadeHandRoot.visible = false;
  vmRoot.add(grenadeHandRoot);
  grenadeHandSway.position.set(0.20, -0.22, -0.72);
  grenadeHandSway.rotation.set(-0.05, 0.18, 0.06);
  grenadeHandSway.scale.setScalar(VM_SCALE);
}

function _rebuildHandModel(kind){
  if (!grenadeHandSway) return;
  if (grenadeHandModel){ grenadeHandSway.remove(grenadeHandModel); grenadeHandModel = null; }
  if (!grenadeHandBody){
    grenadeHandBody = makeHand(false);
    grenadeHandBody.position.set(0, -0.02, 0.02);
    grenadeHandBody.scale.setScalar(0.95);
    grenadeHandSway.add(grenadeHandBody);
  }
  const def = THROWABLES[kind];
  grenadeHandModel = def.buildModel ? def.buildModel() : buildGrenadeBody();
  grenadeHandModel.position.set(-0.008, 0.030, -0.02);
  grenadeHandModel.rotation.set(0.9, 0.4, 0.1);
  grenadeHandModel.scale.setScalar(1.05);
  grenadeHandSway.add(grenadeHandModel);
}

/* =========================================================================
   运行时状态与常量
   ========================================================================= */
const grenades = [];
const fireZones = [];
let grenadeState = { active: false, kind: 'frag', prevWeapon: 0, charging: false, chargeT: 0, fuse: 0, invCount: {} };
for (const k in THROWABLES) grenadeState.invCount[k] = THROWABLES[k].count || 1;

/* ★ 全局 ID 与对象池 ★ */
let _grenadeIdCounter = 0;
const _grenadePool = Object.create(null);

const _gFwd = new THREE.Vector3();
const _gRgt = new THREE.Vector3();
const _gUp  = new THREE.Vector3(0, 1, 0);
const _gTmp = new THREE.Vector3();
const _gTmp2 = new THREE.Vector3();
const _gRay = new THREE.Raycaster();
const GRENADE_GRAVITY = -19.5;
const GRENADE_RADIUS = 0.06;

/* ★ 爆炸动态光源池 ★ */
const EXPLOSION_LIGHTS = [];
for (let i = 0; i < 4; i++) {
  const l = new THREE.PointLight(0xffaa55, 0, 35, 2);
  l.visible = false;
  scene.add(l);
  EXPLOSION_LIGHTS.push({ light: l, t: 0, maxT: 1, maxIntensity: 0 });
}
let _expLightHead = 0;

function triggerExplosionLight(pos, color, intensity, duration) {
  const slot = EXPLOSION_LIGHTS[_expLightHead];
  _expLightHead = (_expLightHead + 1) % EXPLOSION_LIGHTS.length;
  slot.light.position.copy(pos);
  slot.light.color.setHex(color);
  slot.light.intensity = intensity;
  slot.light.visible = true;
  slot.t = duration;
  slot.maxT = duration;
  slot.maxIntensity = intensity;
}

function _acquireGrenadeMesh(kind){
  let bucket = _grenadePool[kind];
  if (!bucket) bucket = _grenadePool[kind] = [];
  for (const m of bucket){ if (!m.visible){ m.visible = true; return m; } }
  const def = THROWABLES[kind];
  const model = def.buildModel ? def.buildModel() : buildGrenadeBody();
  model.traverse(o => { if (o.isMesh) o.castShadow = true; });
  model.userData.kind = kind;
  scene.add(model);
  bucket.push(model);
  return model;
}

function throwableActive(){ return grenadeState.active; }

function _nextKindAfter(kind){
  if (kind === null){
    for (const k of THROWABLE_ORDER){ if ((grenadeState.invCount[k] || 0) > 0) return k; }
    return null;
  }
  const idx = THROWABLE_ORDER.indexOf(kind);
  for (let i = idx + 1; i < THROWABLE_ORDER.length; i++){
    const k = THROWABLE_ORDER[i];
    if ((grenadeState.invCount[k] || 0) > 0) return k;
  }
  return null;
}

function toggleGrenade(){
  if (!G.running || G.over || G.shopOpen || G.placing) return;
  if (player.dead) return;
  if (player.switching > 0) return;

  if (!grenadeState.active){
    const first = _nextKindAfter(null);
    if (!first){ SFX.dryFire(); pushComms('THROWABLE', 'NO THROWABLES'); return; }
    _equipThrowable(first, true);
    return;
  }
  const next = _nextKindAfter(grenadeState.kind);
  if (next) _equipThrowable(next, false);
  else _unequipThrowable();
}

function _equipThrowable(kind, fromGun){
  const def = THROWABLES[kind];
  if (fromGun){
    grenadeState.prevWeapon = player.weapon;
    if (WEAPONS[player.weapon] && WEAPONS[player.weapon].vm){ WEAPONS[player.weapon].vm.group.visible = false; }
  }
  grenadeState.active = true;
  grenadeState.kind = kind;
  grenadeState.charging = false;
  grenadeState.chargeT = 0;
  grenadeState.fuse = 0;
  ensureGrenadeHand();
  _rebuildHandModel(kind);
  grenadeHandRoot.visible = true;
  grenadeHandSway.position.set(0.20, -0.22, -0.72);
  grenadeHandSway.rotation.set(-0.05, 0.18, 0.06);
  if (grenadeHandModel){
    grenadeHandModel.traverse(o => {
      if (o.isMesh && o.material && o.material.emissive){ o.material.emissive.setHex(0x000000); o.material.emissiveIntensity = 1; }
    });
  }
  if (typeof updateAmmoUI === 'function') updateAmmoUI();
  SFX.boltClick();
  pushComms('THROWABLE', def.shortLabel + ' READY');
}

function _unequipThrowable(){
  grenadeState.active = false;
  grenadeState.charging = false;
  grenadeState.chargeT = 0;
  grenadeState.fuse = 0;
  if (grenadeHandRoot) grenadeHandRoot.visible = false;
  if (WEAPONS[player.weapon] && WEAPONS[player.weapon].vm){ WEAPONS[player.weapon].vm.group.visible = true; }
  if (typeof updateAmmoUI === 'function') updateAmmoUI();
  SFX.boltClick();
}

function exitThrowableMode(){
  if (!grenadeState.active) return;
  _unequipThrowable();
  if (WEAPONS[player.weapon] && WEAPONS[player.weapon].vm){
    WEAPONS[player.weapon].vm.group.visible = true;
  }
  if (grenadeHandRoot) grenadeHandRoot.visible = false;
  if (typeof updateAmmoUI === 'function') updateAmmoUI();
}
window.exitThrowableMode = exitThrowableMode;

document.addEventListener('click', (ev) => {
  const slot = ev.target.closest ? ev.target.closest('.slot[data-slot]') : null;
  if (slot && grenadeState.active){
    exitThrowableMode();
  }
}, true);

function throwGrenade(){
  if (!grenadeState.active || !grenadeState.charging) return;
  const kind = grenadeState.kind;
  const def = THROWABLES[kind];
  if ((grenadeState.invCount[kind] || 0) <= 0){
    const next = _nextKindAfter(kind);
    if (next) _equipThrowable(next, false);
    else _unequipThrowable();
    return;
  }
  const chargeK = clamp(grenadeState.chargeT / def.chargeTime, 0, 1);
  const speed = lerp(def.throwSpeedMin, def.throwSpeedMax, chargeK);
  camera.getWorldDirection(_gFwd);
  _gRgt.crossVectors(_gFwd, _gUp).normalize();
  const upv = _gTmp.crossVectors(_gRgt, _gFwd).normalize();
  const origin = camera.position.clone().addScaledVector(_gFwd, 0.35).addScaledVector(_gRgt, 0.14).addScaledVector(upv, -0.05);
  const vel = _gFwd.clone().multiplyScalar(speed);
  vel.y += speed * def.throwLift;
  _spawnGrenade(kind, origin, vel, grenadeState.fuse);
  grenadeState.invCount[kind] = Math.max(0, grenadeState.invCount[kind] - 1);
  grenadeState.charging = false; grenadeState.chargeT = 0; grenadeState.fuse = 0;
  if (grenadeState.invCount[kind] > 0){ if (typeof updateAmmoUI === 'function') updateAmmoUI(); }
  else { const next = _nextKindAfter(kind); if (next) _equipThrowable(next, false); else _unequipThrowable(); }
  SFX.pumpSound(false);
}

function _spawnGrenade(kind, origin, vel, alreadyFused){
  const def = THROWABLES[kind];
  const mesh = _acquireGrenadeMesh(kind);
  mesh.position.copy(origin);
  mesh.rotation.set(rand(0, 7), rand(0, 7), rand(0, 7));
  const g = {
    id: ++_grenadeIdCounter, kind, mesh, pos: origin.clone(), vel: vel.clone(),
    angVel: new THREE.Vector3(rand(-14, 14), rand(-14, 14), rand(-14, 14)),
    fuse: (kind === 'molotov') ? Infinity : Math.max(0.35, def.fuse - alreadyFused),
    grounded: false, exploded: false, bounces: 0,
  };
  grenades.push(g);
  return g;
}

function _grenadePhysics(g, dt){
  if (g.grounded){ g.angVel.multiplyScalar(Math.exp(-3 * dt)); if (g.angVel.lengthSq() < 0.01) g.angVel.set(0, 0, 0); return; }
  g.vel.y += GRENADE_GRAVITY * dt;
  g.pos.addScaledVector(g.vel, dt);
  const floorY = groundAt(g.pos.x, g.pos.z, g.pos.y + 0.5);
  const groundY = floorY === null ? 0 : floorY;
  if (g.pos.y <= groundY + GRENADE_RADIUS){
    g.pos.y = groundY + GRENADE_RADIUS;
    if (g.kind === 'molotov'){ _igniteMolotov(g, groundY); return; }
    const vy = Math.abs(g.vel.y);
    if (vy > 3.0 && g.bounces < 4){
      g.vel.y = -g.vel.y * 0.42; g.vel.x *= 0.62; g.vel.z *= 0.62;
      g.angVel.multiplyScalar(0.55); g.bounces++;
      if (typeof SFX !== 'undefined' && SFX.shellDrop) SFX.shellDrop(clamp((g.pos.x - camera.position.x) / 12, -1, 1));
    } else { g.vel.set(0, 0, 0); g.grounded = true; }
  }
  if (blocked(g.pos.x, g.pos.z, g.pos.y - 0.04, g.pos.y + 0.04, GRENADE_RADIUS)){
    depenetrate(g.pos, GRENADE_RADIUS, g.pos.y - 0.04, g.pos.y + 0.04);
    g.vel.x *= -0.45; g.vel.z *= -0.45; g.angVel.multiplyScalar(0.7);
    if (typeof SFX !== 'undefined' && SFX.impactWall) SFX.impactWall(clamp((g.pos.x - camera.position.x) / 12, -1, 1), 4);
  }
  g.pos.x = clamp(g.pos.x, -HALF + 0.5, HALF - 0.5);
  g.pos.z = clamp(g.pos.z, -HALF + 0.5, HALF - 0.5);
  if (g.mesh){ g.mesh.rotation.x += g.angVel.x * dt; g.mesh.rotation.y += g.angVel.y * dt; g.mesh.rotation.z += g.angVel.z * dt; }
}

/* =========================================================================
   火焰区域
   ========================================================================= */

let _fireRingTex = null;
function _getFireRingTex(){
  if (_fireRingTex) return _fireRingTex;
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  x.clearRect(0, 0, S, S);
  const g1 = x.createRadialGradient(S/2, S/2, S*0.10, S/2, S/2, S*0.50);
  g1.addColorStop(0.00, 'rgba(0,0,0,0)');
  g1.addColorStop(0.28, 'rgba(120,20,0,0.18)');
  g1.addColorStop(0.45, 'rgba(200,60,10,0.45)');
  g1.addColorStop(0.62, 'rgba(255,110,25,0.55)');
  g1.addColorStop(0.78, 'rgba(255,150,55,0.35)');
  g1.addColorStop(0.92, 'rgba(140,30,5,0.15)');
  g1.addColorStop(1.00, 'rgba(0,0,0,0)');
  x.fillStyle = g1; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 140; i++){
    const a = Math.random() * Math.PI * 2;
    const r = S*0.30 + Math.random() * S*0.16;
    const px = S/2 + Math.cos(a) * r; const py = S/2 + Math.sin(a) * r;
    const rad = 2 + Math.random() * 7;
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    const warm = Math.random();
    const col = warm < 0.45 ? '255,150,55' : (warm < 0.80 ? '255,90,20' : '180,40,10');
    g.addColorStop(0, `rgba(${col},${(0.35 + Math.random()*0.45).toFixed(2)})`);
    g.addColorStop(1, `rgba(${col},0)`);
    x.fillStyle = g; x.beginPath(); x.arc(px, py, rad, 0, 7); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.encoding = THREE.sRGBEncoding;
  _fireRingTex = t;
  return t;
}

function _disposeFireZone(z){
  for (const key of ['outer', 'ring', 'core']){
    const m = z[key];
    if (!m) continue;
    scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) m.material.dispose();
  }
}

function createFireZone(pos, def){
  const radius = def.fireRadius;
  const tex = _getFireRingTex();

  const outer = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2.5, radius * 2.5),
    new THREE.MeshBasicMaterial({ map: tex, color: 0xb02000, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide })
  );
  outer.rotation.x = -PI / 2; outer.position.set(pos.x, pos.y + 0.02, pos.z);

  const ring = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2.0, radius * 2.0),
    new THREE.MeshBasicMaterial({ map: tex, color: 0xff6a20, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide })
  );
  ring.rotation.x = -PI / 2; ring.position.set(pos.x, pos.y + 0.04, pos.z);

  const core = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.45, 36),
    new THREE.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0.50, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide })
  );
  core.rotation.x = -PI / 2; core.position.set(pos.x, pos.y + 0.06, pos.z);

  scene.add(outer); scene.add(ring); scene.add(core);

  fireZones.push({
    pos: pos.clone(), radius, duration: def.fireDuration, maxDuration: def.fireDuration, dps: def.fireDps,
    outer, ring, core, t: 0, rotation: Math.random() * Math.PI * 2, smokeT: 0, sparkT: 0
  });
}

function updateFireZones(dt){
  for (let i = fireZones.length - 1; i >= 0; i--){
    const z = fireZones[i];
    z.duration -= dt; z.t += dt;
    if (z.duration <= 0){ _disposeFireZone(z); fireZones.splice(i, 1); continue; }
    const lifeK = clamp(z.duration / z.maxDuration, 0, 1);
    const lifeSq = lifeK * lifeK;
    const pulse = 0.80 + 0.20 * Math.sin(z.t * 8.0);
    z.rotation += dt * 0.55;

    z.outer.rotation.z = -z.rotation * 0.40; z.outer.scale.setScalar(0.90 + lifeK * 0.15);
    z.outer.material.opacity = 0.30 * lifeSq * (0.6 + 0.4 * Math.sin(z.t * 4.2 + 1.3));
    z.outer.material.color.setRGB(0.68 * lifeK, 0.12 * lifeK, 0);

    z.ring.rotation.z = z.rotation * 0.70; z.ring.scale.setScalar(0.85 + lifeK * 0.20);
    z.ring.material.opacity = 0.55 * lifeK * pulse;

    z.core.rotation.z = -z.rotation * 1.10; z.core.scale.setScalar(0.70 + lifeK * 0.45 + 0.05 * Math.sin(z.t * 11.0));
    z.core.material.opacity = 0.50 * lifeK * (0.7 + 0.3 * Math.sin(z.t * 13.0));

    if (Math.random() < 0.30 * lifeK){
      const a = Math.random() * Math.PI * 2, r = Math.random() * z.radius * 0.25;
      spawnParticle(PS_SPARK, z.pos.x + Math.cos(a) * r, z.pos.y + rand(0.8, 1.5), z.pos.z + Math.sin(a) * r, rand(-0.3, 0.3), rand(2.5, 5.0), rand(-0.3, 0.3), { color: [1.0, 0.96, 0.82], size: rand(0.10, 0.20), grow: 0.6, life: rand(0.20, 0.40), drag: 2.5, grav: 2.0, alpha: 0.85 * lifeK });
    }
    const nB = 1 + (Math.random() < 0.35 ? 1 : 0);
    for (let p = 0; p < nB; p++){
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * z.radius * 0.32;
      spawnParticle(PS_SPARK, z.pos.x + Math.cos(a) * r, z.pos.y + rand(0.1, 0.4), z.pos.z + Math.sin(a) * r, rand(-0.35, 0.35), rand(4.0, 8.0), rand(-0.35, 0.35), { color: [1.0, 0.92, 0.55], size: rand(0.14, 0.26), grow: 0.7, life: rand(0.35, 0.75), drag: 1.6, grav: 2.8, alpha: 0.95 * lifeK });
    }
    const nC = 2 + (Math.random() < 0.50 ? 2 : 0);
    for (let p = 0; p < nC; p++){
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * z.radius * 0.85;
      const heat = 1 - r / (z.radius * 0.85);
      const col = heat > 0.5 ? [1.0, 0.55, 0.14] : (Math.random() < 0.5 ? [1.0, 0.40, 0.08] : [0.88, 0.28, 0.05]);
      spawnParticle(PS_SPARK, z.pos.x + Math.cos(a) * r, z.pos.y + rand(0.05, 0.35), z.pos.z + Math.sin(a) * r, rand(-0.6, 0.6), rand(1.5, 3.8), rand(-0.6, 0.6), { color: col, size: rand(0.22, 0.42), grow: 1.0, life: rand(0.40, 0.90), drag: 1.6, grav: 1.4, alpha: 0.90 * lifeK });
    }
    z.smokeT -= dt;
    if (z.smokeT <= 0){
      z.smokeT = 0.30;
      for (let s = 0; s < 2; s++){
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * z.radius * 0.55;
        const dark = Math.random() < 0.65;
        spawnParticle(PS_SOFT, z.pos.x + Math.cos(a) * r, z.pos.y + rand(0.9, 1.6), z.pos.z + Math.sin(a) * r, rand(-0.3, 0.3), rand(1.0, 2.4), rand(-0.3, 0.3), { color: dark ? [0.14, 0.13, 0.12] : [0.35, 0.31, 0.27], size: rand(0.40, 0.70), grow: 1.5, life: rand(1.6, 3.2), drag: 0.7, grav: 0.5, alpha: 0.55 * lifeK });
      }
    }
    _applyFireDamage(z, dt);
  }
}

function _fireLOS(x0, y0, z0, x1, y1, z1){
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const len2 = dx*dx + dy*dy + dz*dz;
  if (len2 < 0.36) return true;
  const len = Math.sqrt(len2);
  const inv = 1 / len;
  _gRay.set(_gTmp2.set(x0, y0 + 0.05, z0), _gTmp.set(dx * inv, dy * inv, dz * inv));
  _gRay.near = 0; _gRay.far = len - 0.25;
  return _gRay.intersectObjects(worldSolid, false).length === 0;
}

function _applyFireDamage(z, dt){
  const dmg = z.dps * dt;
  const r2 = z.radius * z.radius;
  const srcY = z.pos.y + 0.35;

  if (!player.dead && !G.god && !G.godMode){
    const dx = player.pos.x - z.pos.x, dz = player.pos.z - z.pos.z;
    if (dx*dx + dz*dz <= r2){
      const py = player.pos.y + (player.height || STAND_H) * 0.55;
      if (_fireLOS(z.pos.x, srcY, z.pos.z, player.pos.x, py, player.pos.z)) applyDamageTo(player, dmg, z.pos, 0);
    }
  }
  if (typeof enemies !== 'undefined'){
    for (const e of enemies){
      if (e.dead) continue;
      const sc = (e.p && e.p.scale) || 1;
      const dx = e.obj.position.x - z.pos.x, dz = e.obj.position.z - z.pos.z;
      if (dx*dx + dz*dz <= r2){
        const ey = e.obj.position.y + 1.1 * sc;
        if (_fireLOS(z.pos.x, srcY, z.pos.z, e.obj.position.x, ey, e.obj.position.z)){
          const dir = _gTmp.set(dx, 0.4, dz).normalize().clone();
          const hitPos = _gTmp2.set(e.obj.position.x, ey, e.obj.position.z).clone();
          damageEnemy(e, dmg, false, dir, hitPos, false, undefined, 'fire');
        }
      }
    }
  }
}

function extinguishFireAt(pos){
  let n = 0;
  for (let i = fireZones.length - 1; i >= 0; i--){
    const z = fireZones[i];
    const dx = z.pos.x - pos.x, dz = z.pos.z - pos.z;
    if (Math.sqrt(dx*dx + dz*dz) <= z.radius + 2.0){ _disposeFireZone(z); fireZones.splice(i, 1); n++; }
  }
  if (n > 0){
    pushComms('THROWABLE', 'FIRE EXTINGUISHED');
    if (typeof SFX !== 'undefined' && SFX.bossDown){ try { SFX.bossDown(); } catch(e){} }
  }
  return n;
}

/* =========================================================================
   闪光弹白屏遮罩
   ========================================================================= */
let _flashOverlayEl = null;
let _flashTimeoutId = null;

function _ensureFlashOverlay(){
  if (_flashOverlayEl && _flashOverlayEl.parentNode) return _flashOverlayEl;
  _flashOverlayEl = document.getElementById('flashOverlay');
  if (!_flashOverlayEl){
    _flashOverlayEl = document.createElement('div');
    _flashOverlayEl.id = 'flashOverlay';
    document.body.appendChild(_flashOverlayEl);
  }
  const s = _flashOverlayEl.style;
  s.position = 'fixed'; s.top = '0'; s.left = '0'; s.right = '0'; s.bottom = '0';
  s.width = '100vw'; s.height = '100vh';
  s.background = '#ffffff'; s.opacity = '0'; s.pointerEvents = 'none';
  s.zIndex = '2147483647'; s.transition = 'opacity 0.05s ease-in';
  s.display = 'block'; s.visibility = 'visible';
  return _flashOverlayEl;
}

function _triggerFlashOverlay(durationMs){
  const el = _ensureFlashOverlay();
  if (!el) return;
  if (_flashTimeoutId){ clearTimeout(_flashTimeoutId); _flashTimeoutId = null; }
  el.style.transition = 'none'; el.style.opacity = '1'; void el.offsetWidth;
  el.style.transition = 'opacity 0.05s ease-in';
  _flashTimeoutId = setTimeout(() => {
    el.style.transition = 'opacity 0.35s ease-out'; el.style.opacity = '0';
    _flashTimeoutId = null;
  }, durationMs || 3000);
}

function applyFlashEffect(pos){
  const flashDef = THROWABLES.flash;
  if (!player.dead){
    const distToPlayer = pos.distanceTo(camera.position);
    if (distToPlayer <= flashDef.flashRadius){
      let hit = false;
      if (distToPlayer < 6.0) hit = true;
      else {
        const eyePos = player.pos.clone().setY(player.pos.y + (player.height || STAND_H) * 0.9);
        _gTmp2.subVectors(eyePos, pos);
        const len = _gTmp2.length();
        if (len > 0.5){
          _gTmp2.divideScalar(len); _gRay.set(pos, _gTmp2); _gRay.far = len - 0.35;
          if (_gRay.intersectObjects(worldSolid, false).length === 0) hit = true;
        }
      }
      if (hit && !player.hasFlashGoggles) _triggerFlashOverlay(3000);
    }
  }
  if (typeof enemies !== 'undefined'){
    for (const e of enemies){
      if (e.dead) continue;
      const dist = pos.distanceTo(e.obj.position);
      if (dist > flashDef.flashRadius) continue;
      if (dist < 6.0){
        e.blindT = 3.0; e.alerted = true; if (e.state !== ST.DEAD) e.state = ST.COMBAT; continue;
      }
      const eyePos = e.obj.position.clone().setY(e.obj.position.y + 1.75);
      _gTmp2.subVectors(eyePos, pos);
      const len = _gTmp2.length();
      if (len < 0.5){ e.blindT = 3.0; e.alerted = true; if (e.state !== ST.DEAD) e.state = ST.COMBAT; continue; }
      _gTmp2.divideScalar(len); _gRay.set(pos, _gTmp2); _gRay.far = len - 0.6;
      if (_gRay.intersectObjects(worldSolid, false).length === 0){ e.blindT = 3.0; e.alerted = true; if (e.state !== ST.DEAD) e.state = ST.COMBAT; }
    }
  }
}

/* =========================================================================
   爆炸冲击波环
   ========================================================================= */
const EXPLOSION_RINGS = [];
for (let i = 0; i < 10; i++){
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.65, 48),
    new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
  );
  m.rotation.x = -PI / 2; m.visible = false; scene.add(m);
  EXPLOSION_RINGS.push({ mesh: m, t: 0, dur: 0.55, r0: 0.5, r1: 8.5, thick: 0.35, ease: 2 });
}

function spawnExplosionRing(pos, r0, r1, opts){
  opts = opts || {};
  let slot = null, minT = Infinity;
  for (const r of EXPLOSION_RINGS){
    if (r.t <= 0){ slot = r; break; }
    if (r.t < minT){ minT = r.t; slot = r; }
  }
  if (!slot) return;
  slot.t = opts.dur || 0.55; slot.dur = slot.t; slot.r0 = r0; slot.r1 = r1;
  slot.thick = opts.thick || 0.35; slot.ease = opts.ease || 2;
  slot.mesh.visible = true;
  slot.mesh.position.set(pos.x, pos.y + 0.05, pos.z);
  slot.mesh.material.color.setHex(opts.color !== undefined ? opts.color : 0xffb060);
}

/* =========================================================================
   ★★★ 引爆逻辑（超级加强版） ★★★
   ========================================================================= */
function _flashExplode(g){
  /* 1. 纯白核心爆闪 */
  for (let i = 0; i < 48; i++){
    const v = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(12, 28));
    spawnParticle(PS_SPARK, g.pos.x, g.pos.y, g.pos.z, v.x, v.y, v.z,
      { color: [1.0, 1.0, 1.0], size: rand(0.20, 0.42), grow: 1.8, life: rand(0.08, 0.20), drag: 5.0, grav: 0, alpha: 1.0 });
  }
  /* 2. 径向放射光柱 */
  for (let i = 0; i < 24; i++){
    const a = Math.random() * PI * 2, el = rand(-0.5, 0.5);
    const dir = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
    spawnParticle(PS_SPARK, g.pos.x, g.pos.y, g.pos.z, dir.x * 32, dir.y * 32, dir.z * 32,
      { color: [1.0, 1.0, 1.0], size: rand(0.04, 0.08), life: rand(0.15, 0.32), drag: 0.2, grav: 0, alpha: 0.95 });
  }
  /* 3. 光晕冲击波 */
  spawnExplosionRing(g.pos, 0.2, 15.0, { color: 0xffffff, dur: 0.28, thick: 0.10, ease: 3 });
  spawnExplosionRing(g.pos, 0.4, 20.0, { color: 0xbfe0ff, dur: 0.55, thick: 0.06, ease: 1 });
  
  /* 4. 动态光源 + FOV冲击 */
  triggerExplosionLight(g.pos, 0xffffff, 15, 0.25);
  player.fovKick = Math.min(6.0, player.fovKick + 2.0);

  try {
    if (typeof SFX.flashBang === 'function') SFX.flashBang(g.pos.distanceTo(camera.position));
    else SFX.grenade(0, g.pos.distanceTo(camera.position));
  } catch(e){}

  applyFlashEffect(g.pos);
  g.exploded = true;
  if (g.mesh){ g.mesh.visible = false; g.mesh.position.set(0, -1000, 0); }
}

function _grenadeExplode(g){
  const def = THROWABLES[g.kind];
  const airborne = !g.grounded;
  const px = g.pos.x, py = g.pos.y, pz = g.pos.z;

  /* L0：白光核心 */
  for (let i = 0; i < 34; i++){
    const v = new THREE.Vector3(rand(-1, 1), rand(-0.2, 1.2), rand(-1, 1)).normalize().multiplyScalar(rand(10, 22));
    spawnParticle(PS_SPARK, px, py, pz, v.x, v.y, v.z, { color: [1.0, 1.0, 1.0], size: rand(0.20, 0.32), life: rand(0.05, 0.12), drag: 6.0, grav: 0, grow: 1.5, alpha: 1.0 });
  }
  /* L1：热核 */
  for (let i = 0; i < 36; i++){
    const v = new THREE.Vector3(rand(-1, 1), rand(-0.1, 1.3), rand(-1, 1)).normalize().multiplyScalar(rand(5, 14));
    spawnParticle(PS_SPARK, px, py, pz, v.x, v.y, v.z, { color: [1.0, 0.94, 0.55], size: rand(0.16, 0.30), grow: 1.2, life: rand(0.14, 0.30), drag: 3.0, grav: 0.5, alpha: 1.0 });
  }
  /* L2：橙红主火球 */
  for (let i = 0; i < 56; i++){
    const v = new THREE.Vector3(rand(-1, 1), rand(-0.1, 1.3), rand(-1, 1)).normalize().multiplyScalar(rand(4, 13));
    const warm = Math.random();
    const col = warm < 0.22 ? [1.0, 0.72, 0.25] : warm < 0.48 ? [1.0, 0.55, 0.12] : warm < 0.74 ? [1.0, 0.38, 0.06] : warm < 0.90 ? [0.88, 0.24, 0.04] : [0.70, 0.14, 0.02];
    spawnParticle(PS_SPARK, px, py, pz, v.x, v.y, v.z, { color: col, size: rand(0.22, 0.42), grow: 1.6, life: rand(0.35, 0.90), drag: 1.8, grav: 1.5, alpha: 0.95 });
  }
  /* L3：高速碎片（带重力抛物线） */
  for (let i = 0; i < 42; i++){
    const v = new THREE.Vector3(rand(-1, 1), rand(0.4, 1.5), rand(-1, 1)).normalize().multiplyScalar(rand(16, 32));
    spawnParticle(PS_SPARK, px, py, pz, v.x, v.y, v.z, { color: i < 20 ? [1.0, 0.95, 0.65] : [1.0, 0.55, 0.15], size: rand(0.03, 0.09), life: rand(0.6, 1.3), drag: 0.4, grav: -26, alpha: 1.0 });
  }
  /* L4：浓烟 */
  for (let i = 0; i < 36; i++){
    const v = new THREE.Vector3(rand(-0.8, 0.8), rand(0.5, 1.5), rand(-0.8, 0.8)).normalize().multiplyScalar(rand(1.5, 5));
    const dark = Math.random() < 0.6;
    spawnParticle(PS_SOFT, px, py + 0.2, pz, v.x, v.y, v.z, { color: dark ? [0.14, 0.13, 0.12] : [0.35, 0.32, 0.28], size: rand(0.35, 0.65), grow: 1.5, life: rand(1.5, 3.2), drag: 1.1, grav: 0.5, alpha: 0.75 });
  }
  /* L5：地面扩散气浪 */
  for (let i = 0; i < 22; i++){
    const a = Math.random() * PI * 2;
    const v = new THREE.Vector3(Math.cos(a), rand(0.1, 0.5), Math.sin(a)).multiplyScalar(rand(5, 11));
    spawnParticle(PS_SOFT, px, py + 0.08, pz, v.x, v.y, v.z, { color: [0.42, 0.38, 0.32], size: rand(0.30, 0.52), grow: 2.0, life: rand(0.8, 1.7), drag: 1.4, grav: 0.3, alpha: 0.55 });
  }
  /* L6：二次爆燃 */
  setTimeout(() => {
    const offX = rand(-0.4, 0.4), offZ = rand(-0.4, 0.4);
    for (let i = 0; i < 14; i++){
      const v = new THREE.Vector3(rand(-1, 1), rand(0.3, 1.2), rand(-1, 1)).normalize().multiplyScalar(rand(4, 9));
      spawnParticle(PS_SPARK, px + offX, py + 0.3, pz + offZ, v.x, v.y, v.z, { color: [1.0, 0.60, 0.18], size: rand(0.15, 0.28), grow: 1.2, life: rand(0.25, 0.55), drag: 2.2, grav: 1.4, alpha: 0.92 });
    }
  }, 120);

  /* 冲击波环 */
  spawnExplosionRing(g.pos, 0.2, def.dmgRadius * 1.55, { color: 0xffffff, dur: 0.20, thick: 0.06, ease: 3 });
  spawnExplosionRing(g.pos, 0.5, def.dmgRadius * 1.10, { color: 0xff8020, dur: 0.58, thick: 0.24, ease: 2 });
  spawnExplosionRing(g.pos, 0.6, def.dmgRadius * 0.88, { color: 0xb02000, dur: 0.90, thick: 0.30, ease: 1 });
  spawnExplosionRing(g.pos, 0.8, def.dmgRadius * 1.85, { color: 0x803010, dur: 1.30, thick: 0.10, ease: 1 });

  /* 光源与屏幕冲击 */
  triggerExplosionLight(g.pos, 0xffaa55, 25, 0.4);
  const dist = g.pos.distanceTo(camera.position);
  const shakeD = clamp(1 - dist / 30, 0, 1);
  if (shakeD > 0){
    player.shake = Math.min(2.5, player.shake + 1.65 * shakeD);
    player.fovKick = Math.min(8.0, player.fovKick + 4.0 * shakeD);
    G.dmgFlash = Math.max(G.dmgFlash, 0.28 * shakeD);
    G.killFlash = Math.max(G.killFlash, 0.55 * shakeD);
  }

  try {
    if (typeof SFX.grenade === 'function') SFX.grenade(0, dist);
    else { SFX.impactWall(clamp((px - camera.position.x) / 16, -1, 1), 2); SFX.bossDown(); }
  } catch(e){}

  extinguishFireAt(g.pos);
  applyThrowableDamage(g, def, airborne);
  g.exploded = true;
  if (g.mesh){ g.mesh.visible = false; g.mesh.position.set(0, -1000, 0); }
}

function _igniteMolotov(g, groundY){
  const def = THROWABLES.molotov;
  for (let i = 0; i < 22; i++){
    const v = new THREE.Vector3(rand(-1,1), rand(0.3,1.6), rand(-1,1)).normalize().multiplyScalar(rand(4, 11));
    spawnParticle(PS_SPARK, g.pos.x, g.pos.y + 0.1, g.pos.z, v.x, v.y, v.z, { color: [0.72, 0.85, 0.95], size: rand(0.03, 0.06), life: rand(0.5, 1.0), drag: 1.4, grav: -14 });
  }
  for (let i = 0; i < 32; i++){
    const a = Math.random() * PI * 2, r = Math.random() * def.fireRadius * 0.6;
    const px = g.pos.x + Math.cos(a) * r, pz = g.pos.z + Math.sin(a) * r;
    const v = new THREE.Vector3(Math.cos(a) * rand(3, 8), rand(1, 4), Math.sin(a) * rand(3, 8));
    spawnParticle(PS_SPARK, px, groundY + 0.05, pz, v.x, v.y, v.z, { color: i < 16 ? [1.0, 0.85, 0.35] : [1.0, 0.55, 0.15], size: rand(0.06, 0.14), life: rand(0.3, 0.7), drag: 1.2, grav: -8, alpha: 0.95 });
  }
  for (let i = 0; i < 24; i++){
    const v = new THREE.Vector3(rand(-1,1), rand(0.3,1.3), rand(-1,1)).normalize().multiplyScalar(rand(4, 10));
    spawnParticle(PS_SPARK, g.pos.x, g.pos.y + 0.2, g.pos.z, v.x, v.y, v.z, { color: [1.0, 0.92, 0.52], size: rand(0.15, 0.28), grow: 1.2, life: rand(0.30, 0.65), drag: 1.8, grav: 1.2, alpha: 0.95 });
  }
  spawnExplosionRing(g.pos, 0.3, def.fireRadius * 1.05, { color: 0xff8030, dur: 0.45, thick: 0.18, ease: 2 });
  
  triggerExplosionLight(g.pos, 0xff6020, 15, 0.3);
  createFireZone(g.pos.clone().setY(groundY), def);

  try {
    if (typeof SFX.molotovBreak === 'function') SFX.molotovBreak(g.pos.distanceTo(camera.position));
    else if (typeof SFX.impactWall === 'function') SFX.impactWall(clamp((g.pos.x - camera.position.x) / 12, -1, 1), 3);
  } catch(e){}
  const d = clamp(1 - g.pos.distanceTo(camera.position) / 25, 0, 1);
  if (d > 0) player.shake = Math.min(2.0, player.shake + 0.45 * d);
  g.exploded = true;
  if (g.mesh){ g.mesh.visible = false; g.mesh.position.set(0, -1000, 0); }
}

/* =========================================================================
   伤害结算
   ========================================================================= */
function _grenadeLineBlocked(from, to, worldList){
  _gTmp2.copy(to).sub(from);
  const len = _gTmp2.length();
  if (len < 0.2) return false;
  _gTmp2.divideScalar(len);
  _gRay.set(from, _gTmp2); _gRay.far = len - 0.35;
  return _gRay.intersectObjects(worldList, false).length > 0;
}

function applyThrowableDamage(g, def, airborne){
  const expl = g.pos;
  _applyToTarget(expl, def, airborne, player,
    { x: player.pos.x, y: player.pos.y + (player.height || STAND_H) * 0.62, z: player.pos.z }, 'player');

  for (const e of enemies){
    if (e.dead) continue;
    const sc = (e.p && e.p.scale) || 1;
    _applyToTarget(expl, def, airborne, e,
      { x: e.obj.position.x, y: e.obj.position.y + 1.15 * sc, z: e.obj.position.z }, 'enemy');
  }
  if (typeof ally !== 'undefined' && ally && !ally.dead){
    _applyToTarget(expl, def, airborne, ally, { x: ally.obj.position.x, y: ally.obj.position.y + 1.15, z: ally.obj.position.z }, 'ally');
  }
  if (typeof drone !== 'undefined' && drone && !drone.dead){
    _applyToTarget(expl, def, airborne, drone, { x: drone.obj.position.x, y: drone.obj.position.y, z: drone.obj.position.z }, 'drone');
  }
}

function _applyToTarget(expl, def, airborne, target, chest, kindTag){
  const dx = chest.x - expl.x, dy = chest.y - expl.y, dz = chest.z - expl.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist > def.dmgRadius) return;

  if (!airborne && dist > 0.6){
    if (_grenadeLineBlocked(expl, chest, worldSolid)) return;
  }

  let dmg;
  if (dist <= def.killRadius) dmg = 99999;
  else {
    const k = clamp(dist / def.dmgRadius, 0, 1);
    dmg = def.dmgCenter * Math.pow(1 - k, def.falloffPow);
  }
  if (dmg <= 0) return;

  if (kindTag === 'player') applyDamageTo(player, dmg, expl, 0);
  else if (kindTag === 'enemy'){
    const dir = _gTmp.set(dx, dy, dz).normalize().clone();
    const hitPos = _gTmp2.set(chest.x, chest.y, chest.z).clone();
    damageEnemy(target, dmg, false, dir, hitPos, false, undefined, 'grenade');
  } else if (kindTag === 'ally' && typeof damageAlly === 'function') damageAlly(dmg, expl);
  else if (kindTag === 'drone' && typeof damageDrone === 'function') damageDrone(dmg);
}

/* =========================================================================
   主更新
   ========================================================================= */
function updateGrenades(dt){
  /* 光源衰减 */
  for (const l of EXPLOSION_LIGHTS) {
    if (l.t > 0) {
      l.t -= dt;
      if (l.t <= 0) { l.light.visible = false; l.light.intensity = 0; }
      else { l.light.intensity = l.maxIntensity * (l.t / l.maxT); }
    }
  }

  /* 玩家手持 */
  if (grenadeState.active && grenadeState.charging){
    grenadeState.chargeT += dt;
    const def = THROWABLES[grenadeState.kind];
    if (def.canCook){
      grenadeState.fuse += dt;
      if (grenadeState.fuse >= def.fuse - 0.02){ _detonateInHand(); return; }
    }
    if (grenadeHandSway){
      const rawK = grenadeState.chargeT / def.chargeTime;
      const k = def.canCook ? clamp(rawK, 0, 1) : clamp(rawK, 0, 1.6);
      grenadeHandSway.position.x = 0.20 + Math.sin(perfNow * 0.06) * 0.004 * k;
      grenadeHandSway.position.y = -0.22 + Math.cos(perfNow * 0.05) * 0.004 * k;
      grenadeHandSway.rotation.z = 0.06 + Math.sin(perfNow * 0.04) * 0.02 * k;
    }
  }

  /* 世界中的手雷 */
  for (let i = grenades.length - 1; i >= 0; i--){
    const g = grenades[i];
    if (g.kind !== 'molotov'){
      g.fuse -= dt;
      if (g.fuse <= 0){
        if (g.kind === 'flash') _flashExplode(g);
        else _grenadeExplode(g);
        grenades.splice(i, 1);
        continue;
      }
    }
    _grenadePhysics(g, dt);
    if (g.exploded){ grenades.splice(i, 1); continue; }
    if (g.mesh) g.mesh.position.copy(g.pos);

    if (!g.grounded && !g.exploded && (g.vel.lengthSq() > 2 || Math.abs(g.vel.y) > 1.5)){
      if (Math.random() < 0.55){
        spawnParticle(PS_SOFT, g.pos.x, g.pos.y, g.pos.z, rand(-0.15, 0.15), rand(-0.15, 0.15), rand(-0.15, 0.15),
          { color: g.kind === 'molotov' ? [0.8, 0.5, 0.25] : [0.55, 0.52, 0.48], size: rand(0.05, 0.09), grow: 0.35, life: rand(0.18, 0.35), drag: 2.0, grav: 0.4, alpha: 0.45 });
      }
    }
  }

  /* 冲击波环推进 */
  for (const r of EXPLOSION_RINGS){
    if (r.t <= 0){ if (r.mesh.visible) r.mesh.visible = false; continue; }
    r.t -= dt;
    if (r.t <= 0){ r.mesh.visible = false; continue; }
    const k = clamp(r.t / r.dur, 0, 1);
    const prog = 1 - k;
    let easeP;
    if (r.ease === 1) easeP = prog;
    else if (r.ease === 3) easeP = 1 - Math.pow(1 - prog, 3);
    else easeP = 1 - Math.pow(1 - prog, 2);
    const radius = lerp(r.r0, r.r1, easeP);
    const thick = Math.max(0.04, r.thick * (1 - prog) + 0.02);
    r.mesh.geometry.dispose();
    r.mesh.geometry = new THREE.RingGeometry(Math.max(0.05, radius - thick), radius, 48);
    r.mesh.material.opacity = k * k * 0.95;
  }

  updateFireZones(dt);
}

function _detonateInHand(){
  const kind = grenadeState.kind;
  camera.getWorldDirection(_gFwd);
  _gRgt.crossVectors(_gFwd, _gUp).normalize();
  const upv = _gTmp.crossVectors(_gRgt, _gFwd).normalize();
  const origin = camera.position.clone().addScaledVector(_gFwd, 0.5).addScaledVector(_gRgt, 0.16).addScaledVector(upv, -0.08);
  const g = { id: ++_grenadeIdCounter, kind, mesh: null, pos: origin, vel: new THREE.Vector3(), angVel: new THREE.Vector3(), fuse: 0, grounded: false, exploded: false, bounces: 0 };
  
  if (kind === 'flash') _flashExplode(g);
  else if (kind === 'molotov') _igniteMolotov(g, groundY);
  else _grenadeExplode(g);

  grenadeState.invCount[kind] = Math.max(0, (grenadeState.invCount[kind] || 0) - 1);
  grenadeState.charging = false;
  grenadeState.chargeT = 0;
  grenadeState.fuse = 0;

  if (grenadeState.invCount[kind] <= 0){
    const next = _nextKindAfter(kind);
    if (next) _equipThrowable(next, false);
    else _unequipThrowable();
  } else if (typeof updateAmmoUI === 'function'){
    updateAmmoUI();
  }
}

function resetThrowables(){
  for (const g of grenades){
    if (g.mesh){ g.mesh.visible = false; g.mesh.position.set(0, -1000, 0); }
  }
  grenades.length = 0;

  for (const z of fireZones){ _disposeFireZone(z); }
  fireZones.length = 0;

  for (const k in _grenadePool){
    const bucket = _grenadePool[k];
    if (!bucket) continue;
    for (const m of bucket){
      scene.remove(m);
      m.traverse(o => {
        if (o.isMesh){
          o.geometry && o.geometry.dispose && o.geometry.dispose();
          if (Array.isArray(o.material)) o.material.forEach(mm => mm.dispose && mm.dispose());
          else o.material && o.material.dispose && o.material.dispose();
        }
      });
    }
    bucket.length = 0;
  }

  for (const r of EXPLOSION_RINGS){
    r.t = 0;
    if (r.mesh) r.mesh.visible = false;
  }
  for (const l of EXPLOSION_LIGHTS){
    l.t = 0; l.light.visible = false;
  }

  for (const k in THROWABLES) grenadeState.invCount[k] = THROWABLES[k].count || 1;
  grenadeState.active = false;
  grenadeState.kind = 'frag';
  grenadeState.prevWeapon = 0;
  grenadeState.charging = false;
  grenadeState.chargeT = 0;
  grenadeState.fuse = 0;

  if (grenadeHandRoot) grenadeHandRoot.visible = false;
  if (typeof WEAPONS !== 'undefined' && WEAPONS[player.weapon] && WEAPONS[player.weapon].vm){
    WEAPONS[player.weapon].vm.group.visible = true;
  }
  if (typeof updateAmmoUI === 'function') updateAmmoUI();
}

function grenadeHudInfo(){
  if (!grenadeState.active) return null;
  const def = THROWABLES[grenadeState.kind];
  const isMolotov = def.id === 'molotov';
  return {
    kind: def.id, label: def.shortLabel, count: grenadeState.invCount[def.id] || 0,
    fuse: isMolotov ? def.fireDuration : Math.max(0, def.fuse - grenadeState.fuse),
    charging: grenadeState.charging,
    cookWarn: (!isMolotov) && ((def.fuse - grenadeState.fuse) <= def.cookWarnAt)
  };
}