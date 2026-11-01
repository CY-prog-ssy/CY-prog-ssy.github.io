/* =========================================================================
   shooting.js
   射击逻辑 —— 命中判定 / 开镜 / 切枪 / 换弹 / 后坐 / 无限子弹
   ========================================================================= */
"use strict";

const shootRay = new THREE.Raycaster();
shootRay.far = 200;

const _fwd = new THREE.Vector3();
const _rgt = new THREE.Vector3();
const _up  = new THREE.Vector3(0, 1, 0);
const _muzzleWorld = new THREE.Vector3();
const _hitN = new THREE.Vector3();

/* 预分配射击目标数组 */
const _shootTargets = [];

function currentSpreadMult(){
  const w = WEAPONS[player.weapon];
  const speed = Math.hypot(player.vel.x, player.vel.z);
  let s = w.spread;
  s += (speed / 7) * w.moveSpread;
  if (!player.onGround) s += w.airSpread;
  if (player.crouch && speed < 0.6) s *= w.crouchMult;
  s *= lerp(1, w.adsSpread, player.adsEase);
  return s;
}

function setADS(on){
  if (on === player.ads) return;
  if (on && (player.dead || !G.running)) return;
  player.ads = on;
  if (!on){
    player.breathHeld = false;
    player.breathLock = false;
  }
}

function toggleADS(){ setADS(!player.ads); }

function cycleWeapon(dir){
  const n = WEAPONS.length;
  let i = (player.weapon + dir) % n;
  if (i < 0) i += n;
  switchWeapon(i);
}

function switchWeapon(i){
  if (i === player.weapon && player.switchTo < 0) return;
  if (player.switching > 0){
    player.pendingWpn = i;
    return;
  }
  if (player.reloadT > 0) player.reloadT = 0;
  if (typeof cancelHeal === 'function') cancelHeal();
  setADS(false);
  player.boltT = 0;
  player.switchTo = i;
  player.switching = WEAPONS[i].drawTime + 0.22;
  player.holsterAt = 0.22;
  SFX.boltClick();
}

function startReload(){
  const w = WEAPONS[player.weapon];
  /* ★ 无限子弹：直接补满 */
  if (SET.infiniteAmmo){
    w.mag = w.magSize;
    w.res = w.maxReserve;
    if (typeof updateAmmoUI === 'function') updateAmmoUI();
    return;
  }
  if (player.reloadT > 0 || player.switching > 0 || player.pumpT > 0 || player.boltT > 0) return;
  if (w.mag >= w.magSize || w.res <= 0) return;

  if (typeof cancelHeal === 'function') cancelHeal();
  setADS(false);
  player.reloadT = w.reloadTime;
  player.reloadPhase = 0;
  SFX.magOut();
}

function finishReload(){
  const w = WEAPONS[player.weapon];
  const need = w.magSize - w.mag;
  const take = Math.min(need, w.res);
  w.mag += take;
  w.res -= take;
  w.spread = w.spreadBase;
  if (typeof updateAmmoUI === 'function') updateAmmoUI();
}

function fireWeapon(){
  if (typeof cancelHeal === 'function') cancelHeal();

  const w = WEAPONS[player.weapon];
  if (player.fireCooldown > 0 || player.reloadT > 0 || player.switching > 0 ||
      player.pumpT > 0 || player.boltT > 0) return false;

  if (w.mag <= 0){
    if (SET.infiniteAmmo){
      /* 无限弹直接补满，不进入空射逻辑 */
      w.mag = w.magSize;
      w.res = w.maxReserve;
      if (typeof updateAmmoUI === 'function') updateAmmoUI();
    } else {
      if (player.triggerReleased){
        SFX.dryFire();
        player.triggerReleased = false;
      }
      if (w.res > 0) startReload();
      return true;
    }
  }

  /* ★ 无限子弹：不扣弹匣 */
  if (!SET.infiniteAmmo){
    w.mag--;
  } else {
    w.mag = w.magSize;
  }

  /* ★ 开火惩罚：2 秒内不能疾跑（哪怕只开一枪）。
     放在扣弹之后 —— 空射 / 干拉 / 冷却中不触发。 */
  player.noSprintT = 0.5;

  player.fireCooldown = 60 / w.rpm;
  G.shots++;
  player.triggerReleased = false;

  for (const e of enemies){
    if (!e.dead) e.obj.updateMatrixWorld(true);
  }

  camera.getWorldDirection(_fwd);
  _rgt.crossVectors(_fwd, _up).normalize();
  const upv = new THREE.Vector3().crossVectors(_rgt, _fwd).normalize();

  w.vm.muzzle.updateWorldMatrix(true, false);
  _muzzleWorld.copy(camera.position)
    .addScaledVector(_fwd, 0.55)
    .addScaledVector(_rgt, 0.16)
    .addScaledVector(upv, -0.12);

  const spread = currentSpreadMult();
  let anyHit = false, killedSomething = false, headHit = false;

  /* 预分配目标数组 */
  _shootTargets.length = 0;
  for (let i = 0; i < enemyHitMeshes.length; i++) _shootTargets.push(enemyHitMeshes[i]);
  for (let i = 0; i < worldSolid.length; i++) _shootTargets.push(worldSolid[i]);

  for (let p = 0; p < w.pellets; p++){
    const dir = _fwd.clone();
    const a = Math.random() * PI * 2;
    const r = (w.pellets > 1 ? Math.sqrt(Math.random()) : Math.random()) * spread;
    dir.addScaledVector(_rgt, Math.cos(a) * r)
       .addScaledVector(upv, Math.sin(a) * r)
       .normalize();

    shootRay.set(camera.position, dir);
    shootRay.far = w.range;
    const hits = shootRay.intersectObjects(_shootTargets, false);
    let end = camera.position.clone().addScaledVector(dir, w.range);

    if (hits.length){
      const h = hits[0];
      end = h.point.clone();
      const ud = h.object.userData;

      if (ud && ud.enemy && !ud.enemy.dead){
        const e = ud.enemy;
        const dist = h.distance;
        let dmg = w.damage * PLR.dmgMult;
        const fo = clamp(1 - Math.max(0, dist - w.falloffStart) / w.falloffRange,
                         w.falloffMin, 1);
        dmg *= fo;

        const isHead = ud.part === 'head';
        if (isHead) dmg *= w.headMult;
        else if (ud.part === 'legs') dmg *= 0.78;

        /* ★ 传入当前武器 id 作为 source，让 killEnemy 选对独立的倒地方式池。
   'rifle' / 'shotgun' / 'pistol' / 'sniper'。 */
const killed = damageEnemy(e, dmg, isHead, dir, h.point, false, undefined, w.id);

        anyHit = true;
        if (isHead) headHit = true;
        if (killed) killedSomething = true;

        fxImpactFlesh(h.point, dir, dist, isHead);
      } else {
        _hitN.set(0, 1, 0);
        if (h.face) _hitN.copy(h.face.normal).transformDirection(h.object.matrixWorld);
        fxImpactWall(h.point, _hitN, h.distance);
      }
    }

    if (p === 0 || w.pellets <= 3 || Math.random() < 0.45)
      spawnTracer(_muzzleWorld, end,
                  w.id === 'sniper' ? 0xfff3c8 : 0xffd27a,
                  w.id === 'sniper' ? 2.1 : 1);
  }

  if (anyHit){
    G.hits++;
    SFX.hitBeep(headHit);
    if (typeof showHitmark === 'function') showHitmark(killedSomething);
  }

  SFX.gunshot(w.sound, 0, 0);
  if (typeof alertToGunfire === 'function') alertToGunfire(w.noise || 34);
  w.spread = Math.min(w.spreadMax, w.spread + w.spreadShot);

  const n = player.burstCount++;
  player.burstIdle = 0;
  const vert  = n === 0 ? 1.55 : (n < 4 ? 1.12 : 0.82 + Math.sin(n * 0.9) * 0.10);
  const drift = Math.sin(n * 0.62) * 0.85 + Math.sin(n * 0.23 + 1.1) * 0.45;
  player.recoilVelP += w.camPitch * 38 * vert;
  player.recoilVelY += (drift + (Math.random() - 0.5) * 0.55) * w.camYaw * 38;
  player.shake = Math.min(1.4, player.shake + w.shakeAmt * 0.5);
  player.fovKick = Math.min(3.2, player.fovKick + (w.fovKick || 1.0));

  vmKick(w);
  flashT = flashDur;
  flashPower = w.id === 'shotgun' ? 1.7
             : w.id === 'sniper'  ? 1.9
             : w.id === 'rifle'   ? 1.0 : 0.8;

  if (w.id === 'shotgun'){
    player.pumpT = w.pumpTime;
    player.pumpEjected = false;
  } else if (w.id === 'sniper'){
    player.boltT = w.boltTime;
    player.boltPhase = 0;
    SFX.boltCycle(0);
  } else {
    const ejPos = camera.position.clone()
      .addScaledVector(_fwd, 0.36)
      .addScaledVector(_rgt, 0.24)
      .addScaledVector(upv, -0.08);
    ejectShell(ejPos, _rgt.clone().addScaledVector(_fwd, 0.15), false);
  }

  for (let i = 0; i < 2; i++){
    spawnParticle(PS_SOFT,
      _muzzleWorld.x, _muzzleWorld.y, _muzzleWorld.z,
      _fwd.x * rand(1, 3) + rand(-.4, .4),
      rand(.2, .7),
      _fwd.z * rand(1, 3) + rand(-.4, .4),
      { color: [0.62, 0.60, 0.58], size: 0.09, grow: 0.42,
        life: rand(0.4, 0.8), drag: 2.6, grav: 0.5, alpha: 0.30 });
  }

  if (typeof updateAmmoUI === 'function') updateAmmoUI();
  return true;
}

const vmRec = { pz: 0, py: 0, rx: 0, ry: 0, rz: 0, vz: 0, vy: 0, vrx: 0, vry: 0, vrz: 0 };

function vmKick(w){
  vmRec.vz  += w.recoilKick * 46;
  vmRec.vy  += w.recoilKick * 13;
  vmRec.vrx -= w.recoilRot * 46;
  vmRec.vry += (Math.random() - 0.5) * w.recoilRot * 24;
  vmRec.vrz += (Math.random() - 0.5) * w.recoilRot * 30;
}