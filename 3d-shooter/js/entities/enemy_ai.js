/* =========================================================================
   enemy_ai.js
   敌人 AI —— 感官 / 状态机 / 掩体 / 兵种特效 / 射击 / 战斗调度器
   增强：精准度 +15% · 伤害 +5% · 残血躲掩体 · 远距离保持距离
   ★ 死亡动画：18 个独立倒地动画，按击杀武器 id 严格分池
   ★ 闪光弹致盲：乱走 + 完全随机方向乱射，3 秒后自然恢复
   ========================================================================= */
"use strict";

const losRay = new THREE.Raycaster();
losRay.far = 70;

const _eDir = new THREE.Vector3(), _ePos = new THREE.Vector3(), _eEye = new THREE.Vector3();
const _revDir = new THREE.Vector3();

const AI_AIM_BONUS = 0.85;
const AI_DMG_BONUS = 1.05;

function _isBlind(e){
  return typeof e.blindT === 'number' && e.blindT > 0;
}

function enemyEye(e, out){
  return out.set(e.obj.position.x, e.obj.position.y + 1.62, e.obj.position.z);
}

let _FOCUS = player;

function playerChest(out){
  return out.set(_FOCUS.pos.x, _FOCUS.pos.y + (_FOCUS.height || 1.6) * 0.62, _FOCUS.pos.z);
}

function hasLOS(e){
  enemyEye(e, _eEye);
  playerChest(_ePos);
  _eDir.subVectors(_ePos, _eEye);
  const dist = _eDir.length();
  if (dist > 52) return false;
  _eDir.divideScalar(dist);

  if (!e.alerted){
    const fwd = new THREE.Vector3(-Math.sin(e.yaw), 0, -Math.cos(e.yaw));
    if (fwd.dot(_eDir) < 0.20) return false;
  }

  losRay.set(_ePos, _eDir.clone().negate());
  losRay.far = dist - 0.4;
  const hits = losRay.intersectObjects(worldSolid, false);
  return hits.length === 0;
}

const _mzTmp = new THREE.Vector3();
function muzzleClear(e){
  e.p.gunMuzzle.getWorldPosition(_mzTmp);
  playerChest(_ePos);
  _revDir.subVectors(_mzTmp, _ePos);
  const len = _revDir.length();
  if (len < 0.8) return true;
  _revDir.divideScalar(len);
  losRay.set(_ePos, _revDir);
  losRay.far = len - 0.35;
  return losRay.intersectObjects(worldSolid, false).length === 0;
}

const _altTmp = new THREE.Vector3();
function pickAltTarget(e){
  const cands = [];
  if (typeof drone !== 'undefined' && drone && !drone.dead)
    cands.push({ pos: drone.obj.position, h: DRONE.h, r: DRONE.r, prio: e.maxArmor > 0 ? 0.85 : 0.22, hurt: d => damageDrone(d) });
  if (typeof ally !== 'undefined' && ally && !ally.dead)
    cands.push({ pos: ally.obj.position, h: 1.70, r: 0.46, prio: 0.45, hurt: d => damageAlly(d, e.obj.position) });
  if (typeof turrets !== 'undefined' && turrets.length){
    let bt = null, bd = Infinity;
    for (const t of turrets){
      const d = Math.hypot(t.obj.position.x - e.obj.position.x, t.obj.position.z - e.obj.position.z);
      if (d > t.def.range + 6) continue;
      if (d < bd){ bd = d; bt = t; }
    }
    if (bt) cands.push({ pos: bt.obj.position, h: 1.0, r: 0.5, prio: 0.30, hurt: d => damageTurret(bt, d) });
  }
  if (!cands.length) return null;
  if (!(e.maxArmor > 0) && cands.length > 1) cands.reverse();

  enemyEye(e, _eEye);
  for (const c of cands){
    const d = Math.hypot(c.pos.x - e.obj.position.x, c.pos.z - e.obj.position.z);
    if (d > 40 || d < 1.2) continue;
    if (c.prio < 0.5){
      const dp = Math.hypot(_FOCUS.pos.x - e.obj.position.x, _FOCUS.pos.z - e.obj.position.z);
      if (d > dp * 0.9) continue;
    }
    _altTmp.set(c.pos.x, c.pos.y + c.h * 0.6, c.pos.z);
    _revDir.subVectors(_altTmp, _eEye);
    const len = _revDir.length();
    if (len < 1) continue;
    _revDir.divideScalar(len);
    losRay.set(_eEye, _revDir);
    losRay.far = len - 0.35;
    if (losRay.intersectObjects(worldSolid, false).length) continue;
    if (Math.random() < c.prio) return c;
  }
  return null;
}

function chestPoint(out, alt){
  return alt
    ? out.set(alt.pos.x, alt.pos.y + alt.h * 0.62, alt.pos.z)
    : out.set(_FOCUS.pos.x, _FOCUS.pos.y + (_FOCUS.height || 1.6) * 0.62, _FOCUS.pos.z);
}

let SNIPE_LASER = null;
const _fxMuz = new THREE.Vector3(), _fxDir = new THREE.Vector3();
function sniperLaser(e, on){
  if (!SNIPE_LASER){
    const g = new THREE.CylinderGeometry(0.014, 0.014, 1, 6);
    g.rotateX(PI / 2);
    g.translate(0, 0, 0.5);
    SNIPE_LASER = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xff2a18, transparent: true, opacity: 0.5, fog: false, depthWrite: false }));
    SNIPE_LASER.visible = false;
    SNIPE_LASER.frustumCulled = false;
    scene.add(SNIPE_LASER);
  }
  if (!on || e.dead){ SNIPE_LASER.visible = false; e.laserOn = false; return; }
  e.p.gunMuzzle.getWorldPosition(_fxMuz);
  playerChest(_ePos);
  const d = _fxMuz.distanceTo(_ePos);
  SNIPE_LASER.position.copy(_fxMuz);
  SNIPE_LASER.lookAt(_ePos);
  SNIPE_LASER.scale.set(1, 1, Math.max(0.2, d));
  SNIPE_LASER.material.opacity = 0.28 + 0.42 * clamp(1 - e.chargeT / ((e.wep.charge) || 1), 0, 1);
  SNIPE_LASER.visible = true;
  e.laserOn = true;
}

function clearSniperLasers(){
  for (const e of enemies) if (e.laserOn){ e.laserOn = false; e.chargeT = 0; }
  if (SNIPE_LASER) SNIPE_LASER.visible = false;
}

function flameJet(e, dt, dist){
  e.p.gunMuzzle.getWorldPosition(_fxMuz);
  playerChest(_ePos);
  _fxDir.subVectors(_ePos, _fxMuz).normalize();
  const n = Math.random() < 0.75 ? 2 : 1;
  for (let i = 0; i < n; i++){
    const v = _fxDir.clone().multiplyScalar(rand(6.5, 10.5));
    v.x += rand(-1.3, 1.3); v.y += rand(-0.5, 1.3); v.z += rand(-1.3, 1.3);
    spawnParticle(PS_SOFT, _fxMuz.x, _fxMuz.y, _fxMuz.z, v.x, v.y, v.z,
      { color: i ? [1.0, 0.52, 0.14] : [1.0, 0.86, 0.44], size: rand(0.10, 0.19), life: rand(0.18, 0.34), drag: 2.8, grav: 2.4, grow: 1.6, alpha: .8 });
  }
  if (Math.random() < dt * 9) SFX.impactWall(clamp((e.obj.position.x - camera.position.x) / 14, -1, 1), 8);
}

function slamShock(e, W){
  const p = e.obj.position;
  for (let i = 0; i < 28; i++){
    const a = (i / 28) * PI * 2, r = rand(0.4, 1.0);
    const v = new THREE.Vector3(Math.cos(a) * 9 * r, rand(0.6, 2.6), Math.sin(a) * 9 * r);
    spawnParticle(PS_SOFT, p.x + Math.cos(a) * 0.4, p.y + 0.12, p.z + Math.sin(a) * 0.4, v.x, v.y, v.z,
      { color: [0.72, 0.60, 0.44], size: rand(0.10, 0.20), life: rand(0.35, 0.7), drag: 2.4, grav: 1.6, grow: 1.2, alpha: .7 });
  }
  SFX.impactWall(clamp((p.x - camera.position.x) / 14, -1, 1), 6);
  SFX.landSound(1);
  if (_FOCUS.shake !== undefined) _FOCUS.shake = Math.min(1.4, _FOCUS.shake + 0.45);
}

function flameBurst(e){
  const p = e.obj.position;
  for (let i = 0; i < 22; i++){
    const v = new THREE.Vector3(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).normalize().multiplyScalar(rand(3, 9));
    spawnParticle(PS_SPARK, p.x, p.y + 1.0, p.z, v.x, v.y, v.z,
      { color: i < 8 ? [1.0, 0.92, 0.6] : [1.0, 0.5, 0.12], size: rand(0.06, 0.13), life: rand(0.3, 0.75), drag: 1.7, grav: -3 });
  }
  SFX.magOut();
  const d = Math.hypot(_FOCUS.pos.x - p.x, _FOCUS.pos.z - p.z);
  if (d < 4.5 && Math.abs(_FOCUS.pos.y - p.y) < 2.5)
    applyDamageTo(_FOCUS, 26 * (d < 2 ? 1 : 0.55) * (e.dmgMul || 1) * AI_DMG_BONUS, e.obj.position, 0.5);
}

const _tmpAim = new THREE.Vector3();
function enemyShoot(e, atPoint, sprd){
  const alt = atPoint ? null : pickAltTarget(e);
  const W = e.wep || EWEAP.rifle;
  enemyEye(e, _eEye);
  const muzzle = _eEye.clone();
  e.p.gunMuzzle.getWorldPosition(muzzle);
  chestPoint(_ePos, alt);
  const tgtPos = alt ? alt.pos : _FOCUS.pos;
  const tgtH   = alt ? alt.h : (_FOCUS.height || 1.6);
  const tgtR   = alt ? alt.r : P_RADIUS;
  const aim = atPoint ? _tmpAim.set(atPoint.x, 1.2, atPoint.z) : _ePos;
  const dist = muzzle.distanceTo(_ePos);
  const speed = Math.hypot(_FOCUS.vel ? _FOCUS.vel.x : 0, _FOCUS.vel ? _FOCUS.vel.z : 0);
  const warm = atPoint ? 2.2 : lerp(1.55, 0.80, clamp((e.engage || 0) / 5.5, 0, 1));
  const err = 0.040 * warm * (1 + dist * 0.028) * (1 + speed * 0.075)
            * (W.spread || 1) * (sprd || 1)
            * ((!alt && (_FOCUS.crouch || false)) ? 1.15 : 1) * AI_AIM_BONUS;

  const dir = aim.clone().sub(muzzle).normalize();
  const rgt = new THREE.Vector3().crossVectors(dir, UPV).normalize();
  const upv = new THREE.Vector3().crossVectors(rgt, dir).normalize();
  const a = Math.random() * PI * 2, r = Math.sqrt(Math.random()) * err * 2.4;
  dir.addScaledVector(rgt, Math.cos(a) * r).addScaledVector(upv, Math.sin(a) * r).normalize();

  enemyMuzzleFlash(muzzle);
  const pan = clamp((e.obj.position.x - camera.position.x) / 16, -1, 1);
  SFX.gunshot(W.snd ? (W.snd === 'rifle' && Math.random() < 0.5 ? 'pistol' : W.snd) : 'rifle', pan, dist);

  losRay.set(muzzle, dir);
  losRay.far = 90;
  const hits = losRay.intersectObjects(worldSolid, false);
  const wallDist = hits.length ? hits[0].distance : 90;

  const px = tgtPos.x - muzzle.x, pz = tgtPos.z - muzzle.z;
  const dx = dir.x, dz = dir.z;
  const dd = dx * dx + dz * dz;
  const baseY = alt ? alt.pos.y : _FOCUS.pos.y;
  let tHit = Infinity;

  if (dd > 1e-6){
    const t = (px * dx + pz * dz) / dd;
    if (t > 0){
      const cx = dx * t - px, cz = dz * t - pz;
      const lateral = Math.hypot(cx, cz);
      if (lateral < tgtR * 1.05){
        const y = muzzle.y + dir.y * t;
        if (y > baseY + 0.05 && y < baseY + tgtH) tHit = t;
      }
    }
  }

  const end = muzzle.clone().addScaledVector(dir, Math.min(wallDist, tHit === Infinity ? 90 : tHit));
  spawnTracer(muzzle, end, 0xff9a5a, 1.25);

  let clearPath = tHit < wallDist;
  if (clearPath){
    _revDir.subVectors(muzzle, _ePos);
    const revLen = _revDir.length();
    if (revLen > 0.6){
      _revDir.divideScalar(revLen);
      losRay.set(_ePos, _revDir);
      losRay.far = revLen - 0.35;
      if (losRay.intersectObjects(worldSolid, false).length) clearPath = false;
    }
  }

  if (clearPath){
    const d0 = W.dmg ? W.dmg[0] : 5.5;
    const d1 = W.dmg ? W.dmg[1] : 9.0;
    const near = W.near || 25, far = W.far || 55;
    const dmg = rand(d0, d1) * clamp(1 - Math.max(0, dist - near) / far, 0.35, 1) * (e.dmgMul || 1) * AI_DMG_BONUS;
    if (alt) alt.hurt(dmg);
    else applyDamageTo(_FOCUS, dmg, e.obj.position);
  } else if (hits.length){
    const n = hits[0].face ? hits[0].face.normal.clone().transformDirection(hits[0].object.matrixWorld) : new THREE.Vector3(0, 1, 0);
    fxImpactWall(hits[0].point, n, hits[0].distance);
    if (hits[0].point.distanceTo(camera.position) < 4.5 && Math.random() < 0.6){
      SFX.impactWall(clamp((hits[0].point.x - camera.position.x) / 6, -1, 1), 2);
    }
  }
}

function enemyPullTrigger(e, atPoint){
  const W = e.wep || EWEAP.rifle;
  const n = W.pellets || 1;
  for (let i = 0; i < n; i++) enemyShoot(e, atPoint, i === 0 ? 1 : 1.6);
}

const COVER = [];
for (const r of mapRects){
  if (r.w < 0.9 && r.d < 0.9) continue;
  const hw = r.w / 2, hd = r.d / 2, off = 1.05;
  COVER.push({ x: r.x, z: r.z + hd + off, ox: r.x, oz: r.z },
             { x: r.x, z: r.z - hd - off, ox: r.x, oz: r.z },
             { x: r.x + hw + off, z: r.z, ox: r.x, oz: r.z },
             { x: r.x - hw - off, z: r.z, ox: r.x, oz: r.z });
}

function pickCover(e, tx, tz){
  let best = null, bestScore = Infinity;
  const ex = e.obj.position.x, ez = e.obj.position.z;
  for (let i = 0; i < COVER.length; i++){
    const c = COVER[i];
    if (Math.abs(c.x) > HALF - 1.5 || Math.abs(c.z) > HALF - 1.5) continue;
    const dp = Math.hypot(c.x - tx, c.z - tz);
    if (dp < 7 || dp > 24) continue;
    const ax = c.x - c.ox, az = c.z - c.oz;
    const px = tx - c.ox, pz = tz - c.oz;
    if (ax * px + az * pz > 0) continue;
    const de = Math.hypot(c.x - ex, c.z - ez);
    if (de > 20) continue;
    const score = de + Math.abs(dp - 13) * 0.8;
    if (score < bestScore){ bestScore = score; best = c; }
  }
  return best;
}

const COMMS_COOLDOWN = {};
function comms(e, text, priority){
  if (!G.running || G.over) return;
  const now = perfNow;
  if (!priority && COMMS_COOLDOWN.last && now - COMMS_COOLDOWN.last < 1700) return;
  if (COMMS_COOLDOWN.last && now - COMMS_COOLDOWN.last < 420) return;
  COMMS_COOLDOWN.last = now;
  if (typeof pushComms === 'function') pushComms(e ? e.name : 'COMMAND', text);
  SFX.radio();
}

function bearingWord(e){
  const dx = e.obj.position.x - _FOCUS.pos.x;
  const dz = e.obj.position.z - _FOCUS.pos.z;
  const a = Math.atan2(dx, -dz);
  const i = Math.round(((a + PI * 2) % (PI * 2)) / (PI / 4)) % 8;
  return ['NORTH', 'NORTH-EAST', 'EAST', 'SOUTH-EAST', 'SOUTH', 'SOUTH-WEST', 'WEST', 'NORTH-WEST'][i];
}

const _active = [];
const MAX_SHOOTERS = 2;
const shooterCap = () => Math.min(5, MAX_SHOOTERS + Math.floor(Math.max(0, G.wave - 1) / 3));
let _sweepAt = 0;

function updateCombatDirector(){
  _active.length = 0;
  for (const e of enemies){
    e.mayFire = false;
    if (!e.dead && e.state === ST.COMBAT && e.canSee && !_isBlind(e)){
      const w = e.wep || EWEAP.rifle;
      if (w.alwaysFire || e.tier === TIER.BOSS) e.mayFire = true;
      else _active.push(e);
    }
  }

  if (G.running && perfNow > _sweepAt){
    let alive = 0;
    for (const e of enemies) if (!e.dead) alive++;
    if (alive > 0 && alive <= 3){
      _sweepAt = perfNow + 6000;
      for (const e of enemies){
        if (e.dead || e.canSee || _isBlind(e)) continue;
        e.alerted = true;
        e.state = ST.COMBAT;
        e.saidLost = true;
        e.cover = null;
        e.hunt = Math.max(e.hunt, 9);
        const f = nearestFree(player.pos.x + rand(-4, 4), player.pos.z + rand(-4, 4), 0.5, 1.7, 6, e.obj.position.y);
        e.lastKnown.set(f[0], e.obj.position.y, f[1]);
      }
    }
  }

  if (G.grace > 0) return;
  _active.sort((a, b) => a.obj.position.distanceToSquared(camera.position) - b.obj.position.distanceToSquared(camera.position));
  const cap = shooterCap();
  for (let i = 0; i < Math.min(cap, _active.length); i++) _active[i].mayFire = true;
}

function alertSquad(radius, spread, line, chance){
  const px = player.pos.x, pz = player.pos.z;
  const alive = enemies.reduce((n, e) => n + (e.dead ? 0 : 1), 0);
  if (alive <= 3) radius = Math.max(radius, 200);

  let called = false;
  for (const e of enemies){
    if (e.dead || e.state === ST.COMBAT || _isBlind(e)) continue;
    const d = Math.hypot(e.obj.position.x - px, e.obj.position.z - pz);
    if (d > radius) continue;
    e.alerted = true; e.state = ST.COMBAT; e.tacticT = 0; e.engage = 0; e.cover = null; e.saidLost = true;
    e.lastKnown.set(px + rand(-spread, spread), 0, pz + rand(-spread, spread));
    e.lastSeen = 2.6; e.hunt = 8 + d * 0.28;
    if (!called && Math.random() < chance){ called = true; comms(e, line(e)); }
  }
}

let _noiseCd = 0;
function alertToGunfire(radius){
  if (perfNow - _noiseCd < 0.55) return;
  _noiseCd = perfNow;
  alertSquad(radius, 3, e => pick(['SHOTS FIRED — ' + bearingWord(e), 'CONTACT, MOVING TO SUPPORT', 'GUNFIRE, SWEEPING ' + bearingWord(e)]), 0.7);
}

/* =========================================================================
   ★★★ 死亡动画系统 ★★★
   每个枪械独立 3 种倒地方式，按武器 id 严格分池，绝不互串
   ========================================================================= */
function _eoCubic(x){ return 1 - Math.pow(1 - x, 3); }
function _eiCubic(x){ return x * x * x; }

/* -------------------------------------------------------------------------
   【M4 步枪】3 种：向后仰倒 / 原地转倒 / 先跪后扑
   ------------------------------------------------------------------------- */

/* rifle_back —— 中口径向后仰倒，头先着地 */
function animRifleBack(e, p, t, dt){
  const fall = _eoCubic(clamp(t / 0.55, 0, 1));
  const bounce = Math.sin(clamp((t - 0.55) / 0.30, 0, 1) * PI) * 0.030;
  p.model.rotation.x = -fall * (PI * 0.46);
  p.model.rotation.z = fall * 0.08;
  p.model.position.y = fall * 0.06 + bounce;
  const k = _eoCubic(clamp(t / 0.50, 0, 1));
  p.legs[0].hip.rotation.x = lerp(0, -0.35, k);
  p.legs[1].hip.rotation.x = lerp(0, -0.22, k);
  p.legs[0].hip.rotation.z = lerp(0, 0.16, k);
  p.legs[1].hip.rotation.z = lerp(0, -0.16, k);
  p.legs[0].knee.rotation.x = lerp(0, 0.55, k);
  p.legs[1].knee.rotation.x = lerp(0, 0.42, k);
  p.arms[0].sh.rotation.x = lerp(0.85, -0.75, k);
  p.arms[0].sh.rotation.z = lerp(0.65, 1.20, k);
  p.arms[0].el.rotation.x = lerp(-0.11, -0.45, k);
  p.arms[1].sh.rotation.x = lerp(1.12, -0.85, k);
  p.arms[1].sh.rotation.z = lerp(-0.28, -1.25, k);
  p.arms[1].el.rotation.x = lerp(-1.39, -0.35, k);
  p.head.rotation.x = lerp(0, -0.30, k);
  p.head.rotation.z = lerp(0, 0.15, k);
}

/* rifle_spin —— 被打得原地转圈后倒下 */
function animRifleSpin(e, p, t, dt){
  const dir = e._rollDir || 1;
  const spinT = clamp(t / 0.45, 0, 1);
  const fallT = clamp((t - 0.45) / 0.55, 0, 1);
  const spinAngle = _eoCubic(spinT) * PI * 1.05 * dir;
  const fall = _eoCubic(fallT);
  const bounce = Math.sin(clamp((t - 0.85) / 0.30, 0, 1) * PI) * 0.028;
  p.model.rotation.y = spinAngle;
  p.model.rotation.z = fall * (PI * 0.48) * dir;
  p.model.rotation.x = fall * 0.15;
  p.model.position.y = fall * 0.06 + bounce;
  const k = _eoCubic(clamp(t / 0.60, 0, 1));
  p.legs[0].hip.rotation.x = lerp(0, 0.28, k);
  p.legs[1].hip.rotation.x = lerp(0, -0.20, k);
  p.legs[0].hip.rotation.z = lerp(0, 0.35, k);
  p.legs[1].hip.rotation.z = lerp(0, -0.25, k);
  p.legs[0].knee.rotation.x = lerp(0, 0.62, k);
  p.legs[1].knee.rotation.x = lerp(0, 0.48, k);
  p.arms[0].sh.rotation.x = lerp(0.85, 0.35, k);
  p.arms[0].sh.rotation.z = lerp(0.65, 1.55, k);
  p.arms[0].el.rotation.x = lerp(-0.11, -0.75, k);
  p.arms[1].sh.rotation.x = lerp(1.12, 0.20, k);
  p.arms[1].sh.rotation.z = lerp(-0.28, -1.65, k);
  p.arms[1].el.rotation.x = lerp(-1.39, -0.55, k);
  p.head.rotation.y = spinT * 0.8 * dir;
  p.head.rotation.x = lerp(0, 0.25, k);
}

/* rifle_kneel —— 膝盖先软，跪地 0.35s，再向前扑 */
function animRifleKneel(e, p, t, dt){
  const kneel = _eoCubic(clamp(t / 0.35, 0, 1));
  const fallT = clamp((t - 0.35) / 0.50, 0, 1);
  const fall = _eoCubic(fallT);
  const bounce = Math.sin(clamp((t - 0.80) / 0.25, 0, 1) * PI) * 0.025;
  p.model.position.y = -kneel * 0.35 + fall * 0.42 + bounce;
  p.model.rotation.x = -fall * (PI * 0.42);
  p.model.rotation.z = fall * 0.12;
  const k = _eoCubic(clamp(t / 0.55, 0, 1));
  p.legs[0].hip.rotation.x = lerp(0, 0.95, kneel);
  p.legs[1].hip.rotation.x = lerp(0, 0.85, kneel);
  p.legs[0].hip.rotation.z = lerp(0, 0.18, kneel);
  p.legs[1].hip.rotation.z = lerp(0, -0.18, kneel);
  p.legs[0].knee.rotation.x = lerp(0, 1.55, kneel);
  p.legs[1].knee.rotation.x = lerp(0, 1.45, kneel);
  p.arms[0].sh.rotation.x = lerp(0.85, 1.20, k);
  p.arms[0].sh.rotation.z = lerp(0.65, 0.55, k);
  p.arms[0].el.rotation.x = lerp(-0.11, -0.90, k);
  p.arms[1].sh.rotation.x = lerp(1.12, 1.35, k);
  p.arms[1].sh.rotation.z = lerp(-0.28, -0.45, k);
  p.arms[1].el.rotation.x = lerp(-1.39, -1.05, k);
  p.head.rotation.x = lerp(0, 0.35, kneel);
  p.head.rotation.z = lerp(0, 0.15, k);
}

/* -------------------------------------------------------------------------
   【KS-12 霰弹枪】3 种：被轰飞 / 上身后折后倒 / 推撞墙滑落
   ------------------------------------------------------------------------- */

/* shotgun_blast —— 被轰飞出去，空中翻滚，落地弹两下 */
function animShotgunBlast(e, p, t, dt){
  const dir = e._rollDir || 1;
  if (!e._blastVel){
    e._blastVel = new THREE.Vector3(
      (Math.random() - 0.5) * 2, rand(2.5, 4.0), -dir * rand(4, 6)
    );
    e._blastAV = new THREE.Vector3(rand(-6, 6), rand(-3, 3), rand(-5, 5) * dir);
  }
  e._blastVel.y -= 24 * dt;
  p.model.position.x += e._blastVel.x * dt;
  p.model.position.y += e._blastVel.y * dt;
  p.model.position.z += e._blastVel.z * dt;
  p.model.rotation.x += e._blastAV.x * dt;
  p.model.rotation.y += e._blastAV.y * dt;
  p.model.rotation.z += e._blastAV.z * dt;
  if (p.model.position.y <= 0.10 && e._blastVel.y < 0){
    p.model.position.y = 0.10;
    if (Math.abs(e._blastVel.y) < 1.5){
      e._blastVel = null; e._blastAV = null;
      p.model.rotation.x = PI * 0.5; p.model.rotation.y = 0; p.model.rotation.z = rand(-0.3, 0.3);
    } else {
      e._blastVel.y *= -0.30; e._blastVel.x *= 0.5; e._blastVel.z *= 0.5; e._blastAV.multiplyScalar(0.5);
    }
  }
  const k = _eoCubic(clamp(t / 0.40, 0, 1));
  p.legs[0].hip.rotation.x = lerp(0, -0.55, k);
  p.legs[1].hip.rotation.x = lerp(0, 0.30, k);
  p.legs[0].hip.rotation.z = lerp(0, 0.42, k);
  p.legs[1].hip.rotation.z = lerp(0, -0.38, k);
  p.legs[0].knee.rotation.x = lerp(0, 0.75, k);
  p.legs[1].knee.rotation.x = lerp(0, 0.65, k);
  p.arms[0].sh.rotation.x = lerp(0.85, -0.85, k);
  p.arms[0].sh.rotation.z = lerp(0.65, 1.55, k);
  p.arms[0].el.rotation.x = lerp(-0.11, -0.20, k);
  p.arms[1].sh.rotation.x = lerp(1.12, -0.95, k);
  p.arms[1].sh.rotation.z = lerp(-0.28, -1.65, k);
  p.arms[1].el.rotation.x = lerp(-1.39, -0.15, k);
  p.head.rotation.x = lerp(0, -0.45, k);
}

/* shotgun_double —— 上身后折，然后整个人向后倒，平躺 */
function animShotgunDouble(e, p, t, dt){
  const bend = _eoCubic(clamp(t / 0.30, 0, 1));
  const fall = _eoCubic(clamp((t - 0.30) / 0.55, 0, 1));
  const bounce = Math.sin(clamp((t - 0.85) / 0.30, 0, 1) * PI) * 0.022;
  p.body.rotation.x = -bend * 0.55;
  p.body.position.y = bend * 0.15;
  p.model.rotation.x = -fall * (PI * 0.44);
  p.model.position.y = fall * 0.08 + bounce;
  p.model.rotation.z = fall * 0.10;
  const k = _eoCubic(clamp(t / 0.60, 0, 1));
  p.legs[0].hip.rotation.x = lerp(0, -0.28, k);
  p.legs[1].hip.rotation.x = lerp(0, -0.22, k);
  p.legs[0].hip.rotation.z = lerp(0, 0.22, k);
  p.legs[1].hip.rotation.z = lerp(0, -0.18, k);
  p.legs[0].knee.rotation.x = lerp(0, 0.42, k);
  p.legs[1].knee.rotation.x = lerp(0, 0.35, k);
  p.arms[0].sh.rotation.x = lerp(0.85, 1.35, k);
  p.arms[0].sh.rotation.z = lerp(0.65, 0.85, k);
  p.arms[0].el.rotation.x = lerp(-0.11, -0.55, k);
  p.arms[1].sh.rotation.x = lerp(1.12, 1.55, k);
  p.arms[1].sh.rotation.z = lerp(-0.28, -0.85, k);
  p.arms[1].el.rotation.x = lerp(-1.39, -0.65, k);
  p.head.rotation.x = lerp(0, -0.55, k);
}

/* shotgun_wall —— 被推向后方的墙，撞墙后滑落 */
function animShotgunWall(e, p, t, dt){
  if (!e._blastVel){
    e._blastVel = new THREE.Vector3(0, rand(1.5, 2.5), rand(2.5, 4.0));
    e._blastAV = new THREE.Vector3(rand(-3, 3), 0, rand(-2, 2));
  }
  e._blastVel.y -= 22 * dt;
  p.model.position.y += e._blastVel.y * dt;
  p.model.position.z += e._blastVel.z * dt;
  p.model.position.x += e._blastVel.x * dt;
  p.model.rotation.x += e._blastAV.x * dt;
  p.model.rotation.y += e._blastAV.y * dt;
  p.model.rotation.z += e._blastAV.z * dt;
  if (p.model.position.y <= 0.10 && e._blastVel.y < 0){
    p.model.position.y = 0.10;
    e._blastVel.y = 0;
    e._blastVel.z *= 0.6;
  }
  if (t > 1.2 && e._blastVel){
    e._blastVel = null;
    p.model.rotation.x = PI * 0.5;
  }
  const k = _eoCubic(clamp(t / 0.40, 0, 1));
  p.legs[0].hip.rotation.x = lerp(0, -0.20, k);
  p.legs[1].hip.rotation.x = lerp(0, 0.15, k);
  p.legs[0].hip.rotation.z = lerp(0, 0.20, k);
  p.legs[1].hip.rotation.z = lerp(0, -0.20, k);
  p.legs[0].knee.rotation.x = lerp(0, 0.30, k);
  p.legs[1].knee.rotation.x = lerp(0, 0.25, k);
  p.arms[0].sh.rotation.x = lerp(0.85, 1.20, k);
  p.arms[0].sh.rotation.z = lerp(0.65, 1.40, k);
  p.arms[0].el.rotation.x = lerp(-0.11, -0.35, k);
  p.arms[1].sh.rotation.x = lerp(1.12, 1.45, k);
  p.arms[1].sh.rotation.z = lerp(-0.28, -1.55, k);
  p.arms[1].el.rotation.x = lerp(-1.39, -0.25, k);
  p.head.rotation.x = lerp(0, -0.30, k);
}

/* -------------------------------------------------------------------------
   【P-9 手枪】3 种：头偏软倒 / 踉跄后退 / 拧转侧倒
   ------------------------------------------------------------------------- */

/* pistol_snap —— 头猛地一偏，身体软倒 */
function animPistolSnap(e, p, t, dt){
  const snap = _eoCubic(clamp(t / 0.18, 0, 1));
  const fall = _eoCubic(clamp((t - 0.18) / 0.65, 0, 1));
  const bounce = Math.sin(clamp((t - 0.83) / 0.25, 0, 1) * PI) * 0.018;
  p.head.rotation.z = snap * 0.65;
  p.head.rotation.y = snap * 0.30;
  p.head.rotation.x = lerp(0, 0.25, snap);
  p.model.rotation.x = -fall * (PI * 0.35);
  p.model.rotation.z = fall * 0.20;
  p.model.position.y = fall * 0.05 + bounce;
  const k = _eoCubic(clamp(t / 0.55, 0, 1));
  p.body.rotation.z = -fall * 0.20;
  p.legs[0].hip.rotation.x = lerp(0, 0.30, k);
  p.legs[1].hip.rotation.x = lerp(0, 0.22, k);
  p.legs[0].hip.rotation.z = lerp(0, 0.18, k);
  p.legs[1].hip.rotation.z = lerp(0, -0.15, k);
  p.legs[0].knee.rotation.x = lerp(0, 0.55, k);
  p.legs[1].knee.rotation.x = lerp(0, 0.48, k);
  p.arms[0].sh.rotation.x = lerp(0.85, 1.10, k);
  p.arms[0].sh.rotation.z = lerp(0.65, 0.95, k);
  p.arms[0].el.rotation.x = lerp(-0.11, -0.45, k);
  p.arms[1].sh.rotation.x = lerp(1.12, 1.30, k);
  p.arms[1].sh.rotation.z = lerp(-0.28, -0.85, k);
  p.arms[1].el.rotation.x = lerp(-1.39, -0.55, k);
}

/* pistol_stumble —— 踉跄后退几步后倒 */
function animPistolStumble(e, p, t, dt){
  if (!e._stumbleVel){
    e._stumbleVel = new THREE.Vector3((Math.random() - 0.5) * 1.0, 0, rand(1.5, 2.5));
  }
  if (t < 0.5){
    const stumbleFactor = Math.sin(clamp(t / 0.5, 0, 1) * PI);
    p.model.position.x += e._stumbleVel.x * stumbleFactor * dt;
    p.model.position.z += e._stumbleVel.z * stumbleFactor * dt;
    p.model.rotation.z = Math.sin(t * 15) * 0.10 * stumbleFactor;
    p.model.rotation.x = -Math.sin(t * 12) * 0.08 * stumbleFactor;
  }
  if (t >= 0.5){
    const fall = _eoCubic(clamp((t - 0.5) / 0.55, 0, 1));
    const bounce = Math.sin(clamp((t - 1.05) / 0.25, 0, 1) * PI) * 0.020;
    p.model.rotation.x = -fall * (PI * 0.40);
    p.model.rotation.z = fall * 0.08;
    p.model.position.y = fall * 0.06 + bounce;
  }
  const k = _eoCubic(clamp(t / 0.55, 0, 1));
  p.legs[0].hip.rotation.x = lerp(0, 0.15, k);
  p.legs[1].hip.rotation.x = lerp(0, 0.30, k);
  p.legs[0].hip.rotation.z = lerp(0, 0.12, k);
  p.legs[1].hip.rotation.z = lerp(0, -0.12, k);
  p.legs[0].knee.rotation.x = lerp(0, 0.40, k);
  p.legs[1].knee.rotation.x = lerp(0, 0.55, k);
  p.arms[0].sh.rotation.x = lerp(0.85, 0.55, k);
  p.arms[0].sh.rotation.z = lerp(0.65, 1.10, k);
  p.arms[0].el.rotation.x = lerp(-0.11, -0.30, k);
  p.arms[1].sh.rotation.x = lerp(1.12, 0.85, k);
  p.arms[1].sh.rotation.z = lerp(-0.28, -1.15, k);
  p.arms[1].el.rotation.x = lerp(-1.39, -0.40, k);
  p.head.rotation.z = lerp(0, 0.25, k);
}

/* pistol_twist —— 身体拧转，侧倒 */
function animPistolTwist(e, p, t, dt){
  const dir = e._rollDir || 1;
  const twist = _eoCubic(clamp(t / 0.30, 0, 1));
  const fall = _eoCubic(clamp((t - 0.30) / 0.60, 0, 1));
  const bounce = Math.sin(clamp((t - 0.85) / 0.28, 0, 1) * PI) * 0.020;
  p.model.rotation.y = twist * 0.65 * dir;
  p.model.rotation.z = fall * (PI * 0.42) * dir;
  p.model.rotation.x = fall * 0.20;
  p.model.position.y = fall * 0.05 + bounce;
  const k = _eoCubic(clamp(t / 0.55, 0, 1));
  p.body.rotation.y = twist * 0.30 * dir;
  p.legs[0].hip.rotation.x = lerp(0, 0.20, k);
  p.legs[1].hip.rotation.x = lerp(0, -0.15, k);
  p.legs[0].hip.rotation.z = lerp(0, 0.22, k);
  p.legs[1].hip.rotation.z = lerp(0, -0.18, k);
  p.legs[0].knee.rotation.x = lerp(0, 0.45, k);
  p.legs[1].knee.rotation.x = lerp(0, 0.32, k);
  p.arms[0].sh.rotation.x = lerp(0.85, 0.65, k);
  p.arms[0].sh.rotation.z = lerp(0.65, 0.95, k);
  p.arms[0].el.rotation.x = lerp(-0.11, -0.35, k);
  p.arms[1].sh.rotation.x = lerp(1.12, 0.85, k);
  p.arms[1].sh.rotation.z = lerp(-0.28, -0.85, k);
  p.arms[1].el.rotation.x = lerp(-1.39, -0.40, k);
  p.head.rotation.y = twist * 0.40 * dir;
}

/* -------------------------------------------------------------------------
   【SR-7 狙击枪】3 种：被抬起 / 剧烈旋转 / 从腰部折断
   ------------------------------------------------------------------------- */

/* sniper_lift —— 被穿透力抬起，双脚离地，向后飞 */
function animSniperLift(e, p, t, dt){
  if (!e._liftVel){
    e._liftVel = new THREE.Vector3(0, rand(4.0, 5.5), rand(1.5, 2.5));
    e._liftAV = new THREE.Vector3(rand(-4, 4), 0, rand(-3, 3));
  }
  e._liftVel.y -= 20 * dt;
  p.model.position.y += e._liftVel.y * dt;
  p.model.position.z += e._liftVel.z * dt;
  p.model.rotation.x += e._liftAV.x * dt;
  p.model.rotation.z += e._liftAV.z * dt;
  if (p.model.position.y <= 0.10 && e._liftVel.y < 0){
    p.model.position.y = 0.10;
    if (Math.abs(e._liftVel.y) < 1.5){
      e._liftVel = null; e._liftAV = null;
      p.model.rotation.x = PI * 0.5; p.model.rotation.y = 0; p.model.rotation.z = rand(-0.3, 0.3);
    } else {
      e._liftVel.y *= -0.25; e._liftVel.z *= 0.4; e._liftAV.multiplyScalar(0.4);
    }
  }
  const k = _eoCubic(clamp(t / 0.35, 0, 1));
  p.legs[0].hip.rotation.x = lerp(0, -0.40, k);
  p.legs[1].hip.rotation.x = lerp(0, -0.30, k);
  p.legs[0].knee.rotation.x = lerp(0, 0.55, k);
  p.legs[1].knee.rotation.x = lerp(0, 0.45, k);
  p.arms[0].sh.rotation.x = lerp(0.85, 0.10, k);
  p.arms[0].sh.rotation.z = lerp(0.65, 1.45, k);
  p.arms[0].el.rotation.x = lerp(-0.11, -0.25, k);
  p.arms[1].sh.rotation.x = lerp(1.12, 0.05, k);
  p.arms[1].sh.rotation.z = lerp(-0.28, -1.55, k);
  p.arms[1].el.rotation.x = lerp(-1.39, -0.20, k);
  p.head.rotation.x = lerp(0, -0.55, k);
}

/* sniper_spin —— 被穿透力带着剧烈旋转，慢慢倒下 */
function animSniperSpin(e, p, t, dt){
  const dir = e._rollDir || 1;
  if (!e._spinT){ e._spinT = 0; e._spinDir = Math.random() < 0.5 ? 1 : -1; }
  e._spinT += dt;
  const spinDecay = Math.exp(-t * 2.0);
  const spinAngle = e._spinT * 12 * spinDecay * e._spinDir;
  const fall = _eoCubic(clamp((t - 0.35) / 0.60, 0, 1));
  p.model.rotation.y = spinAngle;
  p.model.rotation.x = fall * (PI * 0.42);
  p.model.rotation.z = fall * 0.15 * dir;
  p.model.position.y = fall * 0.08;
  const k = _eoCubic(clamp(t / 0.55, 0, 1));
  p.legs[0].hip.rotation.x = lerp(0, 0.35, k);
  p.legs[1].hip.rotation.x = lerp(0, -0.30, k);
  p.legs[0].hip.rotation.z = lerp(0, 0.30, k);
  p.legs[1].hip.rotation.z = lerp(0, -0.25, k);
  p.legs[0].knee.rotation.x = lerp(0, 0.65, k);
  p.legs[1].knee.rotation.x = lerp(0, 0.50, k);
  p.arms[0].sh.rotation.x = lerp(0.85, 0.20, k);
  p.arms[0].sh.rotation.z = lerp(0.65, 1.65, k);
  p.arms[0].el.rotation.x = lerp(-0.11, -0.65, k);
  p.arms[1].sh.rotation.x = lerp(1.12, 0.10, k);
  p.arms[1].sh.rotation.z = lerp(-0.28, -1.75, k);
  p.arms[1].el.rotation.x = lerp(-1.39, -0.55, k);
  p.head.rotation.x = lerp(0, 0.30, k);
}

/* sniper_buckle —— 从腰部折断，上身前折后倒 */
function animSniperBuckle(e, p, t, dt){
  const buckle = _eoCubic(clamp(t / 0.20, 0, 1));
  const fold = _eoCubic(clamp((t - 0.20) / 0.60, 0, 1));
  const bounce = Math.sin(clamp((t - 0.80) / 0.30, 0, 1) * PI) * 0.020;
  p.body.rotation.x = buckle * 0.85;
  p.body.position.y = -buckle * 0.35;
  p.model.rotation.x = -fold * (PI * 0.40);
  p.model.position.y = fold * 0.10 + bounce;
  const k = _eoCubic(clamp(t / 0.55, 0, 1));
  p.legs[0].hip.rotation.x = lerp(0, 0.75, buckle);
  p.legs[1].hip.rotation.x = lerp(0, 0.65, buckle);
  p.legs[0].knee.rotation.x = lerp(0, 1.20, buckle);
  p.legs[1].knee.rotation.x = lerp(0, 1.10, buckle);
  p.legs[0].hip.rotation.z = lerp(0, 0.15, k);
  p.legs[1].hip.rotation.z = lerp(0, -0.15, k);
  p.arms[0].sh.rotation.x = lerp(0.85, 1.55, k);
  p.arms[0].sh.rotation.z = lerp(0.65, 0.65, k);
  p.arms[0].el.rotation.x = lerp(-0.11, -1.20, k);
  p.arms[1].sh.rotation.x = lerp(1.12, 1.65, k);
  p.arms[1].sh.rotation.z = lerp(-0.28, -0.75, k);
  p.arms[1].el.rotation.x = lerp(-1.39, -1.30, k);
  p.head.rotation.x = lerp(0, 0.75, k);
  p.head.rotation.z = lerp(0, 0.20, k);
}

/* -------------------------------------------------------------------------
   【手雷】3 种：被炸飞 / 被震趴 / 炸成碎片
   ------------------------------------------------------------------------- */

/* grenade_launch —— 被炸飞，空中抛物，落地弹跳 */
function animGrenadeLaunch(e, p, t, dt){
  if (!e._launchVel){
    const bx = (e._blastFrom ? (e.obj.position.x - e._blastFrom.x) : rand(-1, 1));
    const bz = (e._blastFrom ? (e.obj.position.z - e._blastFrom.z) : rand(-1, 1));
    const len = Math.hypot(bx, bz) || 1; const nx = bx / len, nz = bz / len;
    const speed = rand(6, 10);
    e._launchVel = new THREE.Vector3(nx * speed + rand(-1.5, 1.5), rand(5, 8), nz * speed + rand(-1.5, 1.5));
    e._launchAV = new THREE.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9));
  }
  e._launchVel.y -= 22 * dt;
  p.model.position.x += e._launchVel.x * dt;
  p.model.position.y += e._launchVel.y * dt;
  p.model.position.z += e._launchVel.z * dt;
  p.model.rotation.x += e._launchAV.x * dt;
  p.model.rotation.y += e._launchAV.y * dt;
  p.model.rotation.z += e._launchAV.z * dt;
  if (p.model.position.y <= 0.10 && e._launchVel.y < 0){
    p.model.position.y = 0.10;
    if (Math.abs(e._launchVel.y) < 1.6){
      e._launchVel = null; e._launchAV = null;
      p.model.rotation.x = PI * 0.5; p.model.rotation.y = 0; p.model.rotation.z = rand(-0.35, 0.35);
    } else {
      e._launchVel.y *= -0.32; e._launchVel.x *= 0.55; e._launchVel.z *= 0.55; e._launchAV.multiplyScalar(0.5);
    }
  }
  const k = _eoCubic(clamp(t / 0.50, 0, 1));
  p.legs[0].hip.rotation.x = lerp(0, -0.55, k);
  p.legs[1].hip.rotation.x = lerp(0, 0.35, k);
  p.legs[0].hip.rotation.z = lerp(0, 0.45, k);
  p.legs[1].hip.rotation.z = lerp(0, -0.40, k);
  p.legs[0].knee.rotation.x = lerp(0, 0.60, k);
  p.legs[1].knee.rotation.x = lerp(0, 0.85, k);
  p.arms[0].sh.rotation.x = lerp(0.85, 0.25, k);
  p.arms[0].sh.rotation.z = lerp(0.65, 1.45, k);
  p.arms[0].el.rotation.x = lerp(-0.11, -0.35, k);
  p.arms[1].sh.rotation.x = lerp(1.12, 0.40, k);
  p.arms[1].sh.rotation.z = lerp(-0.28, -1.35, k);
  p.arms[1].el.rotation.x = lerp(-1.39, -0.40, k);
}

/* grenade_slam —— 被冲击波震得原地趴下 */
function animGrenadeSlam(e, p, t, dt){
  const fall = _eiCubic(clamp(t / 0.35, 0, 1));
  const settle = _eoCubic(clamp((t - 0.35) / 0.45, 0, 1));
  const twitch = Math.sin(t * 30) * 0.05 * Math.max(0, 1 - t * 2);
  p.model.rotation.x = -fall * (PI * 0.48) + settle * 0.15;
  p.model.rotation.z = fall * 0.05;
  p.model.position.y = -fall * 0.15 + settle * 0.18;
  const k = _eoCubic(clamp(t / 0.45, 0, 1));
  p.legs[0].hip.rotation.x = lerp(0, -0.25, k);
  p.legs[1].hip.rotation.x = lerp(0, 0.45, k);
  p.legs[0].hip.rotation.z = lerp(0, 0.30, k);
  p.legs[1].hip.rotation.z = lerp(0, -0.25, k);
  p.legs[0].knee.rotation.x = lerp(0, 0.85, k) + twitch;
  p.legs[1].knee.rotation.x = lerp(0, 1.05, k) - twitch;
  p.arms[0].sh.rotation.x = lerp(0.85, 0.15, k) + twitch;
  p.arms[0].sh.rotation.z = lerp(0.65, 1.25, k);
  p.arms[0].el.rotation.x = lerp(-0.11, -0.40, k);
  p.arms[1].sh.rotation.x = lerp(1.12, 0.35, k) - twitch;
  p.arms[1].sh.rotation.z = lerp(-0.28, -1.15, k);
  p.arms[1].el.rotation.x = lerp(-1.39, -0.55, k);
  p.head.rotation.x = lerp(0, -0.25, k);
}

/* grenade_vaporize —— 被炸成碎片，快速消散 */
function animGrenadeVaporize(e, p, t, dt){
  if (!e._vapVel){
    e._vapVel = new THREE.Vector3((Math.random() - 0.5) * 6, rand(3, 7), (Math.random() - 0.5) * 6);
    e._vapAV = new THREE.Vector3(rand(-15, 15), rand(-15, 15), rand(-15, 15));
  }
  e._vapVel.y -= 25 * dt;
  p.model.position.x += e._vapVel.x * dt;
  p.model.position.y += e._vapVel.y * dt;
  p.model.position.z += e._vapVel.z * dt;
  p.model.rotation.x += e._vapAV.x * dt;
  p.model.rotation.y += e._vapAV.y * dt;
  p.model.rotation.z += e._vapAV.z * dt;
  const shrink = clamp(t / 0.6, 0, 1);
  e._vapScale = 1 - _eiCubic(shrink) * 0.85;
  p.model.scale.setScalar(Math.max(0.15, e._vapScale));
  const k = _eoCubic(clamp(t / 0.15, 0, 1));
  p.legs[0].hip.rotation.x = lerp(0, -0.85, k);
  p.legs[1].hip.rotation.x = lerp(0, 0.85, k);
  p.legs[0].hip.rotation.z = lerp(0, 0.75, k);
  p.legs[1].hip.rotation.z = lerp(0, -0.75, k);
  p.legs[0].knee.rotation.x = lerp(0, 1.40, k);
  p.legs[1].knee.rotation.x = lerp(0, 1.40, k);
  p.arms[0].sh.rotation.x = lerp(0.85, -1.30, k);
  p.arms[0].sh.rotation.z = lerp(0.65, 1.90, k);
  p.arms[0].el.rotation.x = lerp(-0.11, -0.15, k);
  p.arms[1].sh.rotation.x = lerp(1.12, -1.30, k);
  p.arms[1].sh.rotation.z = lerp(-0.28, -1.90, k);
  p.arms[1].el.rotation.x = lerp(-1.39, -0.15, k);
  p.head.rotation.x = lerp(0, -0.65, k);
  p.head.rotation.z = lerp(0, 0.45, k);
}

/* -------------------------------------------------------------------------
   【火焰】3 种：燃烧乱舞 / 跪地塌陷 / 站直尖叫后焦黑倒下
   ------------------------------------------------------------------------- */

/* fire_panic —— 燃烧乱舞 */
function animFirePanic(e, p, t, dt){
  const dir = e._rollDir || 1;
  const struggleT = clamp(t / 0.40, 0, 1);
  const fall = _eoCubic(clamp((t - 0.35) / 0.50, 0, 1));
  const shake = Math.sin(t * 35) * 0.15 * (1 - struggleT);
  p.model.rotation.z = shake * (1 - fall) + fall * (PI * 0.48) * dir;
  p.model.rotation.x = fall * 0.25;
  p.model.position.y = fall * 0.08;
  const k = _eoCubic(clamp(t / 0.55, 0, 1));
  p.legs[0].hip.rotation.x = lerp(0, 0.35, k);
  p.legs[1].hip.rotation.x = lerp(0, -0.15, k);
  p.legs[0].hip.rotation.z = lerp(0, 0.25, k);
  p.legs[1].hip.rotation.z = lerp(0, -0.20, k);
  p.legs[0].knee.rotation.x = lerp(0, 0.70, k);
  p.legs[1].knee.rotation.x = lerp(0, 0.55, k);
  const armShake = Math.sin(t * 28) * 0.25 * (1 - struggleT);
  p.arms[0].sh.rotation.x = lerp(0.85, 1.55, k) + armShake;
  p.arms[0].sh.rotation.z = lerp(0.65, 1.05, k);
  p.arms[0].el.rotation.x = lerp(-0.11, -0.85, k) - armShake;
  p.arms[1].sh.rotation.x = lerp(1.12, 1.35, k) - armShake;
  p.arms[1].sh.rotation.z = lerp(-0.28, -1.05, k);
  p.arms[1].el.rotation.x = lerp(-1.39, -0.75, k) + armShake;
  p.head.rotation.x = lerp(0, 0.30, k);
  p.head.rotation.z = shake * 0.5 * (1 - fall);
}

/* fire_collapse —— 跪地塌陷 */
function animFireCollapse(e, p, t, dt){
  const dir = e._rollDir || 1;
  const kneel = _eoCubic(clamp(t / 0.30, 0, 1));
  const fall = _eoCubic(clamp((t - 0.30) / 0.45, 0, 1));
  p.model.position.y = -kneel * 0.35 + fall * 0.38;
  p.model.rotation.x = -fall * (PI * 0.45);
  p.model.rotation.z = fall * 0.15 * dir;
  const k = _eoCubic(clamp(t / 0.60, 0, 1));
  p.legs[0].hip.rotation.x = lerp(0, 0.95, kneel);
  p.legs[1].hip.rotation.x = lerp(0, 0.85, kneel);
  p.legs[0].hip.rotation.z = lerp(0, 0.15, kneel);
  p.legs[1].hip.rotation.z = lerp(0, -0.15, kneel);
  p.legs[0].knee.rotation.x = lerp(0, 1.55, kneel);
  p.legs[1].knee.rotation.x = lerp(0, 1.45, kneel);
  p.arms[0].sh.rotation.x = lerp(0.85, 1.45, k);
  p.arms[0].sh.rotation.z = lerp(0.65, 0.55, k);
  p.arms[0].el.rotation.x = lerp(-0.11, -0.65, k);
  p.arms[1].sh.rotation.x = lerp(1.12, 1.55, k);
  p.arms[1].sh.rotation.z = lerp(-0.28, -0.60, k);
  p.arms[1].el.rotation.x = lerp(-1.39, -0.70, k);
  p.head.rotation.x = lerp(0, 0.45, k);
}

/* fire_scream —— 站直尖叫，双臂向上，抖动，然后焦黑倒下 */
function animFireScream(e, p, t, dt){
  const dir = e._rollDir || 1;
  const scream = _eoCubic(clamp(t / 0.30, 0, 1));
  const fall = _eoCubic(clamp((t - 0.30) / 0.55, 0, 1));
  const shiver = Math.sin(t * 45) * 0.10 * (1 - fall);
  p.body.rotation.x = -scream * 0.10 + shiver * 0.5;
  p.body.position.y = scream * 0.05;
  p.model.rotation.x = -fall * (PI * 0.42);
  p.model.rotation.z = fall * 0.18 * dir;
  p.model.position.y = fall * 0.06 + Math.sin(clamp((t - 0.85) / 0.25, 0, 1) * PI) * 0.018;
  const k = _eoCubic(clamp(t / 0.55, 0, 1));
  p.arms[0].sh.rotation.x = lerp(0.85, -0.85 + shiver * 2, scream);
  p.arms[0].sh.rotation.z = lerp(0.65, 1.60, scream);
  p.arms[0].el.rotation.x = lerp(-0.11, -0.15, scream);
  p.arms[1].sh.rotation.x = lerp(1.12, -0.85 + shiver * 2, scream);
  p.arms[1].sh.rotation.z = lerp(-0.28, -1.60, scream);
  p.arms[1].el.rotation.x = lerp(-1.39, -0.15, scream);
  p.legs[0].hip.rotation.x = lerp(0, 0.25, k);
  p.legs[1].hip.rotation.x = lerp(0, -0.20, k);
  p.legs[0].hip.rotation.z = lerp(0, 0.20, k);
  p.legs[1].hip.rotation.z = lerp(0, -0.18, k);
  p.legs[0].knee.rotation.x = lerp(0, 0.45, k);
  p.legs[1].knee.rotation.x = lerp(0, 0.35, k);
  p.head.rotation.x = lerp(0, -0.55, scream);
  p.head.rotation.z = lerp(0, 0.20 + shiver, scream);
}

/* -------------------------------------------------------------------------
   动画注册表 + 死亡池
   每个池 3 个独立动画，按武器 id 严格索引，绝不互相串用。
   ------------------------------------------------------------------------- */
const DEATH_ANIM = {
  rifle_back:      animRifleBack,
  rifle_spin:      animRifleSpin,
  rifle_kneel:     animRifleKneel,
  shotgun_blast:   animShotgunBlast,
  shotgun_double:  animShotgunDouble,
  shotgun_wall:    animShotgunWall,
  pistol_snap:     animPistolSnap,
  pistol_stumble:  animPistolStumble,
  pistol_twist:    animPistolTwist,
  sniper_lift:     animSniperLift,
  sniper_spin:     animSniperSpin,
  sniper_buckle:   animSniperBuckle,
  grenade_launch:  animGrenadeLaunch,
  grenade_slam:    animGrenadeSlam,
  grenade_vaporize: animGrenadeVaporize,
  fire_panic:      animFirePanic,
  fire_collapse:   animFireCollapse,
  fire_scream:     animFireScream
};

/* ★ 每种武器独立 3 池。ally / turret 用步枪池（它们的武器本质就是步枪） */
const DEATH_POOLS = {
  rifle:   ['rifle_back',     'rifle_spin',     'rifle_kneel'],
  shotgun: ['shotgun_blast',  'shotgun_double', 'shotgun_wall'],
  pistol:  ['pistol_snap',    'pistol_stumble', 'pistol_twist'],
  sniper:  ['sniper_lift',    'sniper_spin',    'sniper_buckle'],
  grenade: ['grenade_launch', 'grenade_slam',   'grenade_vaporize'],
  fire:    ['fire_panic',     'fire_collapse',  'fire_scream'],
  ally:    ['rifle_back',     'rifle_spin',     'rifle_kneel'],
  turret:  ['rifle_back',     'rifle_spin',     'rifle_kneel']
};

function damageEnemy(e, dmg, head, dir, point, byAlly, killer, source){
  if (!head && e.armor > 0){
    const absorbed = dmg * E_ARMOR_ABSORB;
    e.armor -= absorbed; dmg -= absorbed;
    if (e.armor <= 0){ e.armor = 0; if (point) fxSparks(point); }
  }
  e.hp -= dmg; e.regenCd = E_REGEN_DELAY; e.flinch = Math.min(1, e.flinch + (head ? 0.9 : 0.55));
  e.alerted = true; e.lastSeen = 0;
  if (e.state === ST.PATROL){ e.state = ST.ALERT; e.reactT = rand(0.14, 0.30); }
  if (e.hp <= 0){ killEnemy(e, head, dir, byAlly, killer, source); return true; }
  e.tagHp = e.hp; e.tag.draw(e.hp, true, e.armor, e.maxArmor);
  return false;
}

function killEnemy(e, head, dir, byAlly, killer, source){
  if (e.dead) return;
  e.dead = true; e.hp = 0; e.state = ST.DEAD;
  e.deathTime = 0; e.deathT = 0;

  /* ★ 按武器 id 选池；未知 → 步枪池（最中性） */
  const pool = DEATH_POOLS[source] || DEATH_POOLS.rifle;
  e.deathAnim = pool[(Math.random() * pool.length) | 0];
  e._rollDir  = Math.random() < 0.5 ? 1 : -1;

  /* 清空所有可能从上一局继承的物理状态 */
  e._launchVel = null; e._launchAV = null;
  e._blastVel  = null; e._blastAV  = null;
  e._liftVel   = null; e._liftAV   = null;
  e._stumbleVel = null;
  e._spinT = 0; e._spinDir = 1;
  e._vapVel = null; e._vapAV = null; e._vapScale = 1;

  if (source === 'grenade' && dir){
    e._blastFrom = { x: e.obj.position.x - dir.x * 0.8, z: e.obj.position.z - dir.z * 0.8 };
  } else {
    e._blastFrom = null;
  }
  if (e.p && e.p.model){
    e.p.model.position.set(0, 0, 0);
    e.p.model.rotation.set(0, 0, 0);
    e.p.model.scale.set(1, 1, 1);       // ★ 清空 grenade_vaporize 的缩小
  }
  if (e.laserOn) sniperLaser(e, false);
  e.chargeT = 0; e.flameT = 0;
  e.tag.sprite.visible = false;
  rebuildHitMeshes();
  G.kills++; if (head) G.headshots++;
  if (typeof killFeed === 'function') killFeed(e.name, head, byAlly);
  G.streak = G.streakT > 0 ? G.streak + 1 : 1; G.streakT = 4.0;
  SFX.killChime(G.streak);
  if (G.streak >= 2){
    const words = ['', '', 'DOUBLE KILL', 'TRIPLE KILL', 'QUAD KILL — RAMPAGE', 'PENTA KILL — UNSTOPPABLE'];
    if (typeof pushComms === 'function') pushComms('COMMAND', words[Math.min(G.streak, 5)] + ' ×' + G.streak);
  }
  const fxKind = e.tier === TIER.BOSS ? 'boss' : e.tier === TIER.ELITE ? 'elite' : (head ? 'head' : 'kill');
  if (typeof killFeedback === 'function') killFeedback(fxKind, byAlly, G.streak);
  if (G.streak >= 2 && typeof showStreakBanner === 'function') showStreakBanner(G.streak);
  if (e.tier === TIER.BOSS && SFX.bossDown) SFX.bossDown();
  SFX.enemyDeath(clamp((e.obj.position.x - camera.position.x) / 14, -1, 1), e.obj.position.distanceTo(camera.position));
  G.killFlash = 1; G.waveKills++;
  const tMul = e.tier === TIER.BOSS ? 8 : (e.tier === TIER.ELITE ? 2.5 : 1);
  const goldAmt = Math.round(killGold(G.wave, head) * tMul);
  if (typeof addGold === 'function'){ addGold(goldAmt); if (typeof popGold === 'function') popGold(goldAmt, fxKind); }
  if (e.tier === TIER.BOSS){ if (typeof pushComms === 'function') pushComms('COMMAND', e.name + ' DOWN — BOSS ELIMINATED'); }
  else if (e.tier === TIER.ELITE){ if (typeof pushComms === 'function') pushComms('COMMAND', 'ELITE DOWN'); }
  if (e.wep && e.wep.explodes) flameBurst(e);
  alertSquad(30 + G.waveKills * 7, 5, ex => pick([e.name + ' IS DOWN — ' + bearingWord(ex), 'MAN DOWN, CONVERGE', 'WE LOST ' + e.name + ', PUSH IN']), 0.85);
  if (typeof updateWaveUI === 'function') updateWaveUI();
  let alive = 0; for (const x of enemies) if (!x.dead) alive++;
  if (alive === 0 && typeof startIntermission === 'function') startIntermission();
}

/* =========================================================================
   每帧更新 —— 致盲时乱走 + 完全随机方向乱射
   ========================================================================= */
function updateEnemy(e, dt){
  const obj = e.obj, p = e.p;
  _FOCUS = player;

  if (typeof e.blindT === 'number' && e.blindT > 0) e.blindT -= dt;

  if (e.regenCd > 0) e.regenCd -= dt;
  else if (e.state !== ST.COMBAT && e.hp < e.maxHp){
    e.hp = Math.min(e.maxHp, e.hp + E_REGEN_RATE * dt);
    if (Math.abs(e.hp - e.tagHp) > e.maxHp / 60){ e.tagHp = e.hp; e.tag.draw(e.hp, e.state !== ST.PATROL, e.armor, e.maxArmor); }
  }

  /* death */
  if (e.dead){
    e.deathTime += dt; e.deathT = clamp(e.deathTime / 0.80, 0, 1);
    /* ★ 默认 fallback 改为步枪池中第一个 */
    const animFn = DEATH_ANIM[e.deathAnim] || animRifleBack;
    animFn(e, p, e.deathTime, dt);
    if (!e.gunDropped && e.deathTime > 0.14){
      e.gunDropped = true; scene.attach(p.gun);
      e.gunVel = new THREE.Vector3(rand(-1.6, 1.6), rand(0.6, 1.8), rand(-1.6, 1.6));
      e.gunAV  = new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6));
    }
    if (e.gunDropped && e.gunVel){
      e.gunVel.y -= 17 * dt; p.gun.position.addScaledVector(e.gunVel, dt);
      p.gun.rotation.x += e.gunAV.x * dt; p.gun.rotation.y += e.gunAV.y * dt; p.gun.rotation.z += e.gunAV.z * dt;
      const gy = 0.07;
      if (p.gun.position.y <= gy){
        p.gun.position.y = gy;
        if (Math.abs(e.gunVel.y) < 0.7){ e.gunVel = null; p.gun.rotation.set(rand(-.1, .1), rand(0, 7), PI / 2 + rand(-.3, .3)); }
        else { e.gunVel.y *= -0.32; e.gunVel.x *= 0.55; e.gunVel.z *= 0.55; e.gunAV.multiplyScalar(0.5); SFX.shellDrop(clamp((p.gun.position.x - camera.position.x) / 14, -1, 1)); }
      }
    }
    return;
  }

  e.losTimer -= dt;
  if (e.losTimer <= 0){
    e.losTimer = 0.13 + Math.random() * 0.06;
    const see = hasLOS(e);
    if (see && !e.canSee && e.state === ST.PATROL && !_isBlind(e)){
      e.state = ST.ALERT; e.reactT = rand(0.30, 0.80); e.alerted = true; e.tag.draw(e.hp, true);
    }
    e.canSee = see;
    if (see) e.lastSeen = 0;
  }

  e.lastSeen += dt;
  if (e.hunt > 0) e.hunt -= dt;
  if (e.alerted && e.lastSeen > 7 && e.hunt <= 0 && e.state !== ST.PATROL){
    e.state = ST.PATROL; e.alerted = false; e.tag.draw(e.hp, false);
  }
  if (e.flinch > 0) e.flinch = Math.max(0, e.flinch - dt * 3.2);

  playerChest(_ePos);
  const toP = _ePos.clone().sub(obj.position);
  const distToP = toP.length();
  let desiredX = 0, desiredZ = 0, moveSpeed = 0;

  if (e.state === ST.ALERT){
    e.reactT -= dt;
    e.targetYaw = Math.atan2(toP.x, toP.z) + PI;
    if (e.reactT <= 0){
      e.state = ST.COMBAT; e.tacticT = 0; e.engage = 0;
      comms(e, pick(['CONTACT ' + bearingWord(e), 'TARGET SPOTTED — ' + bearingWord(e), 'EYES ON, ' + bearingWord(e), 'HOSTILE ' + bearingWord(e)]), true);
    }
  }
  else if (e.state === ST.COMBAT){
    const W = e.wep || EWEAP.rifle;
    const spd = e.spdMul || 1;

    if (_isBlind(e)){
      e.targetYaw += rand(-6, 6) * dt;
      e.aimPitch = lerp(e.aimPitch, rand(-0.4, 0.4), dt * 3);
      if (e.wanderT === undefined || e.wanderT <= 0){
        e.wanderT = rand(0.4, 1.2);
        e.wanderDir = Math.random() * PI * 2;
      }
      e.wanderT -= dt;
      desiredX = Math.sin(e.wanderDir);
      desiredZ = Math.cos(e.wanderDir);
      moveSpeed = (e.upper ? 1.4 : 2.2) * spd;
      e.fireT -= dt;
      if (e.fireT <= 0 && e.reloadT <= 0 && e.rounds > 0 && !W.flame && !W.slam){
        e.fireT = rand(0.55, 1.10);
        const wildAngle = Math.random() * PI * 2;
        const wildDist = rand(8, 25);
        const wildPoint = {
          x: obj.position.x + Math.sin(wildAngle) * wildDist,
          z: obj.position.z + Math.cos(wildAngle) * wildDist
        };
        enemyPullTrigger(e, wildPoint);
        e.rounds -= (W.pellets || 1);
        if (e.rounds <= 0){ e.reloadT = rand(2.5, 4.5); e.rounds = 30; }
      }
      e.burst = 0;
      if (e.chargeT > 0){ e.chargeT = 0; sniperLaser(e, false); }
    }
    else {
      e.targetYaw = Math.atan2(toP.x, toP.z) + PI;
      e.aimPitch = lerp(e.aimPitch, clamp(Math.atan2(toP.y - 1.5, Math.hypot(toP.x, toP.z)), -0.7, 0.7), dt * 8);
      e.lastKnown.set(_ePos.x, 0, _ePos.z);
      if (e.reloadT > 0){ e.reloadT -= dt; e.burst = 0; if (e.reloadT <= 0) e.rounds = 30; }

      e.tacticT -= dt;
      if (e.tacticT <= 0){
        e.tacticT = rand(2.6, 5.2);
        const roll = Math.random(); const wasFlank = e.tactic === 'flank';
        const wounded = e.hp < e.maxHp * 0.40;
        if (wounded){ e.tactic = 'hold'; } else { e.tactic = roll < 0.42 ? 'hold' : (roll < 0.72 ? 'flank' : 'push'); }
        e.cover = null;
        if (wounded && Math.random() < 0.35){ comms(e, pick(['TAKING FIRE — FALLING BACK', 'HIT — NEED COVER', 'WOUNDED, PULLING BACK']), true); }
        if (e.tactic === 'flank' && !wasFlank && Math.random() < 0.55) comms(e, pick(['FLANKING ' + (e.strafeDir > 0 ? 'RIGHT' : 'LEFT'), 'MOVING WIDE', 'GOING AROUND, PIN HIM']));
        if (e.tactic === 'push' && Math.random() < 0.35) comms(e, pick(['PUSHING UP', 'CLOSING IN', 'ON HIM']));
      }

      if (W.ideal > 20) e.tactic = 'hold';
      if (distToP > 18 && e.kind !== 'flamer' && e.kind !== 'rusher') e.tactic = 'hold';
      if (e.hp < e.maxHp * 0.40) e.tactic = 'hold';

      if (e.canSee){
        e.engage += dt;
        e.strafeT -= dt;
        if (e.strafeT <= 0){ e.strafeT = rand(0.7, 1.9); if (Math.random() < 0.55) e.strafeDir *= -1; }
        const fwd  = new THREE.Vector3(toP.x, 0, toP.z).normalize();
        const side = new THREE.Vector3(-fwd.z, 0, fwd.x).multiplyScalar(e.strafeDir);

        if (e.tactic === 'hold' || e.reloadT > 0){
          if (!e.cover) e.cover = pickCover(e, _ePos.x, _ePos.z);
          if (e.cover && !W.charge){
            const cdx = e.cover.x - obj.position.x, cdz = e.cover.z - obj.position.z;
            const cd = Math.hypot(cdx, cdz);
            if (cd > 1.1){ desiredX = cdx / cd; desiredZ = cdz / cd; moveSpeed = (e.upper ? 2.0 : 3.4) * spd; }
            else { desiredX = side.x * 0.55; desiredZ = side.z * 0.55; moveSpeed = 1.1; }
          } else {
            const back = distToP < W.ideal * 0.7 ? -1 : (distToP > W.ideal * 1.25 ? 1 : 0);
            desiredX = side.x * 0.85 + fwd.x * back * 0.9; desiredZ = side.z * 0.85 + fwd.z * back * 0.9;
            moveSpeed = (e.upper ? 1.6 : 2.5) * spd;
          }
        } else if (e.tactic === 'flank'){
          const ideal = W.orbit; const closeness = clamp((distToP - ideal) / 9, -1, 1);
          desiredX = side.x * 1.0 + fwd.x * closeness * 0.5; desiredZ = side.z * 1.0 + fwd.z * closeness * 0.5;
          moveSpeed = (e.upper ? 1.9 : 3.5) * spd;
        } else {
          const ideal = W.ideal; const closeness = clamp((distToP - ideal) / 7, -1, 1);
          desiredX = side.x * 0.55 + fwd.x * closeness * 1.1; desiredZ = side.z * 0.55 + fwd.z * closeness * 1.1;
          moveSpeed = (e.upper ? 1.8 : 3.3) * spd;
        }

        e.fireT -= dt;
        if (W.flame){
          const inRange = distToP < W.range;
          if (inRange && e.mayFire && e.reloadT <= 0 && e.fireT <= 0){
            e.flameT += dt; e.burnT = (e.burnT || 0) + dt;
            if (e.burnT >= 0.2){ const dmg = W.dps * e.burnT * (e.dmgMul || 1) * AI_DMG_BONUS; e.burnT = 0; applyDamageTo(_FOCUS, dmg, e.obj.position, W.pierce || 0); }
            flameJet(e, dt, distToP); e.rounds -= dt * 8;
            if (e.rounds <= 0){ e.reloadT = 2.6; e.rounds = 60; e.flameT = 0; if (Math.random() < 0.5) comms(e, pick(['TANK OUT', 'REFUELLING'])); }
          } else { e.flameT = Math.max(0, e.flameT - dt * 3); e.burnT = 0; }
          if (e.reloadT > 0) e.reloadT -= dt;
          e.burst = 0;
        }
        else if (W.slam){
          if (e.slamCd > 0) e.slamCd -= dt;
          if (e.slamT > 0){
            e.slamT -= dt;
            if (Math.random() < dt * 22) spawnParticle(PS_SOFT, obj.position.x + rand(-2, 2), obj.position.y + 0.2, obj.position.z + rand(-2, 2), 0, rand(0.2, 0.7), 0, { color: [0.75, 0.62, 0.42], size: 0.09, life: 0.5, drag: 2.2, grav: -1.5, alpha: .5 });
            if (e.slamT <= 0){
              slamShock(e, W);
              const dSlam = Math.hypot(_FOCUS.pos.x - obj.position.x, _FOCUS.pos.z - obj.position.z);
              if (dSlam < W.radius && Math.abs(_FOCUS.pos.y - obj.position.y) < 2.5){ applyDamageTo(_FOCUS, rand(W.dmg[0], W.dmg[1]) * (e.dmgMul || 1) * AI_DMG_BONUS, e.obj.position, 0.35); if (_FOCUS.shake !== undefined) _FOCUS.shake = Math.min(1.8, _FOCUS.shake + 0.9); }
              e.slamCd = rand(W.rest[0], W.rest[1]); e.fireT = e.slamCd;
            }
          } else if (e.fireT <= 0 && e.slamCd <= 0 && distToP < 6.5){ e.slamT = W.windup; SFX.magIn(); comms(e, pick(['BRACE', 'GET BACK', 'GROUND POUND']), true); }
          else if (e.fireT <= 0){ e.fireT = 0.4; }
        }
        else if (e.fireT <= 0 && e.reloadT <= 0){
          if (W.charge && e.chargeT > 0){
            e.chargeT -= dt; sniperLaser(e, true);
            if (e.chargeT <= 0){ enemyPullTrigger(e); e.rounds--; e.fireT = rand(W.rest[0], W.rest[1]); sniperLaser(e, false); if (e.rounds <= 0){ e.reloadT = rand(W.reload[0], W.reload[1]); e.rounds = 6; } }
          } else if (e.burst > 0){
            e.burst--; e.rounds--; enemyPullTrigger(e);
            const g = W.gap && W.gap[1] ? rand(W.gap[0], W.gap[1]) : 0.12; e.fireT = g;
            if (e.burst === 0) e.fireT = rand(W.rest[0], W.rest[1]);
            if (e.rounds <= 0){ e.burst = 0; e.reloadT = rand(W.reload[0], W.reload[1]); e.cover = null; if (Math.random() < 0.6) comms(e, pick(['RELOADING — COVER ME', 'MAG OUT', 'CHANGING MAGS'])); }
          } else if (e.mayFire){
            if (muzzleClear(e)){
              if (W.charge){ e.chargeT = W.charge; sniperLaser(e, true); SFX.hitBeep(false); if (e.tier === TIER.BOSS) comms(e, 'MARKSMAN — TRACKING', true); }
              else { e.burst = randI(W.burst[0], W.burst[1]); e.fireT = 0.03; }
            } else { e.fireT = 0.3; e.cover = null; e.tacticT = 0; }
          } else { e.fireT = 0.25; }
        }
      } else {
        if (e.chargeT > 0){ e.chargeT = 0; sniperLaser(e, false); }
        e.engage = Math.max(0, e.engage - dt * 0.6);
        const lk = e.lastKnown; const dx = lk.x - obj.position.x, dz = lk.z - obj.position.z;
        const d = Math.hypot(dx, dz) || 1; desiredX = dx / d; desiredZ = dz / d;
        moveSpeed = e.upper ? 1.8 : 3.2;
        e.fireT -= dt;
        if (e.suppress > 0 && e.reloadT <= 0 && e.fireT <= 0 && e.mayFire && d > 3){
          e.suppress--; e.rounds--; enemyPullTrigger(e, lk);
          e.fireT = e.suppress > 0 ? rand(0.12, 0.18) : rand(1.4, 2.6);
          if (e.rounds <= 0){ e.reloadT = rand(2.0, 2.9); e.suppress = 0; }
        } else if (e.fireT <= 0 && e.lastSeen < 2.2 && Math.random() < 0.02){ e.suppress = randI(2, 4); }
        e.burst = 0;
        if (e.lastSeen > 2.4 && !e.saidLost){ e.saidLost = true; if (Math.random() < 0.5) comms(e, pick(['LOST VISUAL', 'WHERE IS HE', 'HE BROKE CONTACT'])); }
        if (e.lastSeen > 4.5 && e.hunt <= 0) e.state = ST.PATROL;
      }
      if (e.canSee) e.saidLost = false;
    }
  }
  else {
    if (e.chargeT > 0){ e.chargeT = 0; sniperLaser(e, false); }
    e.aimPitch = lerp(e.aimPitch, 0, dt * 4);
    const wp = e.route[e.wp];
    const wpDir = new THREE.Vector3(wp[0] - obj.position.x, 0, wp[1] - obj.position.z);
    const d = wpDir.length();
    if (d < 1.4){ e.wp = (e.wp + 1) % e.route.length; e.idleT = Math.random() < 0.35 ? rand(0.6, 1.8) : 0; }
    if (e.idleT > 0){ e.idleT -= dt; e.targetYaw += Math.sin(perfNow * 0.0006 + e.idx) * dt * 0.6; moveSpeed = 0; }
    else { wpDir.divideScalar(Math.max(d, 0.001)); desiredX = wpDir.x; desiredZ = wpDir.z; moveSpeed = e.upper ? 1.2 : 1.75; e.targetYaw = Math.atan2(desiredX, desiredZ) + PI; }
  }

  if (moveSpeed > 0){
    const px = obj.position.x, pz = obj.position.z;
    const y0 = obj.position.y + 0.30, y1 = obj.position.y + 1.65;
    const clearAt = (nx, nz, len) => !blocked(px + nx * 0.55, pz + nz * 0.55, y0, y1, 0.46) && !blocked(px + nx * len,  pz + nz * len,  y0, y1, 0.50);
    e.repathT -= dt;
    if (e.repathT <= 0){
      e.repathT = 0.15;
      const probe = 1.9;
      if (clearAt(desiredX, desiredZ, probe)){ e.clearT += 0.15; if (e.clearT > 0.45){ e.avoidT = 0; e.avoidSide = 0; } else e.avoidT = 0.25; }
      else {
        e.clearT = 0;
        const ang = Math.atan2(desiredX, desiredZ);
        if (!e.avoidSide) e.avoidSide = Math.random() < 0.5 ? 1 : -1;
        let best = null;
        for (let pass = 0; pass < 2 && !best; pass++){
          const s = pass ? -e.avoidSide : e.avoidSide;
          for (const mag of [0.55, 0.95, 1.4, 1.9, 2.45]){
            const a2 = ang + s * mag, nx = Math.sin(a2), nz = Math.cos(a2);
            if (clearAt(nx, nz, probe)){ best = [nx, nz]; e.avoidSide = s; break; }
          }
        }
        if (best){ e.avoidX = best[0]; e.avoidZ = best[1]; e.avoidT = 0.25; }
        else { e.avoidX = -desiredX; e.avoidZ = -desiredZ; e.avoidT = 0.3; e.avoidSide = -e.avoidSide; }
      }
    }
    if (e.avoidT > 0){
      e.avoidT -= dt; desiredX = e.avoidX; desiredZ = e.avoidZ;
      if (!(e.state === ST.COMBAT && e.lastSeen < 1.2 && !_isBlind(e))) e.targetYaw = Math.atan2(desiredX, desiredZ) + PI;
    }
  } else { e.avoidT = 0; e.avoidSide = 0; e.clearT = 0; }

  const flinchSlow = 1 - e.flinch * 0.6;
  const sp = moveSpeed * flinchSlow;

  if (sp > 0.01){
    moveSlide(obj.position, desiredX * sp * dt, desiredZ * sp * dt, 0.42, 1.7);
    obj.position.x = clamp(obj.position.x, -HALF + 1, HALF - 1);
    obj.position.z = clamp(obj.position.z, -HALF + 1, HALF - 1);
  }
  e.speed = damp(e.speed, sp, 10, dt);

  {
    const y0 = obj.position.y + 0.30, y1 = obj.position.y + 1.65;
    if (blocked(obj.position.x, obj.position.z, y0, y1, 0.42)){
      depenetrate(obj.position, 0.42, y0, y1);
      if (blocked(obj.position.x, obj.position.z, y0, y1, 0.42)){
        const f = nearestFree(obj.position.x, obj.position.z, 0.5, 1.7, 8, obj.position.y);
        obj.position.x = f[0]; obj.position.z = f[1];
        e.avoidT = 0; e.avoidSide = 0; e.clearT = 0; e.cover = null;
      }
    }
  }

  e.stuckT += dt;
  if (e.stuckT >= 0.5){
    const moved = Math.hypot(obj.position.x - e.stuckX, obj.position.z - e.stuckZ);
    if (sp > 0.2 && moved < 0.22){
      if (++e.stuckN >= 2){
        e.stuckN = 0; e.avoidSide = 0; e.avoidT = 0; e.clearT = 0;
        if (e.state === ST.PATROL){ e.wp = (e.wp + 1) % e.route.length; e.idleT = 0; }
        else { const f = nearestFree(obj.position.x + rand(-5, 5), obj.position.z + rand(-5, 5), 0.5, 1.7, 6, obj.position.y); e.lastKnown.set(f[0], obj.position.y, f[1]); e.cover = null; }
      }
    } else e.stuckN = 0;
    e.stuckT = 0; e.stuckX = obj.position.x; e.stuckZ = obj.position.z;
  }

  const gy = groundAt(obj.position.x, obj.position.z, obj.position.y + 0.75);
  if (gy !== null){ if (obj.position.y > gy + 0.05) obj.position.y = Math.max(gy, obj.position.y - 12 * dt); else obj.position.y = gy; }
  else obj.position.y = Math.max(0, obj.position.y - 12 * dt);

  let dy = e.targetYaw - e.yaw;
  while (dy >  PI) dy -= PI * 2;
  while (dy < -PI) dy += PI * 2;
  e.yaw += dy * Math.min(1, dt * (e.state === ST.COMBAT ? 9 : 4.2));
  obj.rotation.y = e.yaw;

  const walk = clamp(e.speed / 2.4, 0, 1);
  e.walkPhase += dt * (3.0 + e.speed * 2.2);
  const s1 = Math.sin(e.walkPhase), c1 = Math.cos(e.walkPhase);

  p.legs[0].hip.rotation.x  = s1 * 0.62 * walk;
  p.legs[1].hip.rotation.x  = -s1 * 0.62 * walk;
  p.legs[0].knee.rotation.x = Math.max(0, -Math.cos(e.walkPhase)) * 0.7 * walk;
  p.legs[1].knee.rotation.x = Math.max(0,  Math.cos(e.walkPhase)) * 0.7 * walk;
  p.body.position.y = Math.abs(c1) * 0.045 * walk - e.flinch * 0.03;
  p.body.rotation.z = s1 * 0.035 * walk;

  const combat = (e.state === ST.COMBAT || e.state === ST.ALERT) ? 1 : 0;
  e.combatBlend = damp(e.combatBlend === undefined ? 0 : e.combatBlend, combat, 7, dt);
  const cb = e.combatBlend;

  p.arms[0].sh.rotation.x = lerp(0.85 + s1 * 0.25 * walk, 1.50, cb);
  p.arms[0].sh.rotation.z = lerp(0.65, 0.62, cb);
  p.arms[0].el.rotation.x = lerp(-0.11, -0.15, cb);
  p.arms[1].sh.rotation.x = lerp(1.12 - s1 * 0.25 * walk, 1.99, cb);
  p.arms[1].sh.rotation.z = lerp(-0.28, -0.68, cb);
  p.arms[1].el.rotation.x = lerp(-1.39, -1.69, cb);
  p.gun.position.set(lerp(0.14, 0.10, cb), lerp(-0.30, -0.05, cb), lerp(-0.20, -0.26, cb));
  p.gun.rotation.set(lerp(-0.42, 0, cb), lerp(-0.16, 0, cb), lerp(0.20, 0, cb));
  p.rig.rotation.x = lerp(0, e.aimPitch, cb);
  p.head.rotation.x = lerp(0, e.aimPitch * 0.5, cb);

  p.model.position.z = e.flinch * 0.14;
  p.model.rotation.x = e.flinch * 0.20;

  const dCam = obj.position.distanceTo(camera.position);
  e.tag.sprite.visible = G.started && dCam < 46;
  if (e.tag.sprite.visible){
    const s = clamp(dCam * 0.055, 0.85, 2.4) * (camera.fov / BASE_FOV);
    e.tag.sprite.scale.set(1.55 * s, 0.46 * s, 1);
    e.tag.sprite.position.y = 2.16;
  }
}