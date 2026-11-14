/* =========================================================================
   shooting.js
   ========================================================================= */
"use strict";

const shootRay = new THREE.Raycaster();
shootRay.far = 200;

const _fwd = new THREE.Vector3();
const _rgt = new THREE.Vector3();
const _up  = new THREE.Vector3(0, 1, 0);
const _muzzleWorld = new THREE.Vector3();
const _hitN = new THREE.Vector3();
const _shootTargets = [];

// ✅ 全局连射计数器
var _m4BurstCount = 0;
var _shotgunBurstCount = 0;
var _sniperBurstCount = 0;

function currentSpreadMult(){
  const w = WEAPONS[player.weapon];
  const speed = Math.hypot(player.vel.x, player.vel.z);
  let s = w.spread;
  s += (speed / 7) * w.moveSpread;
  
  if (!player.onGround) {
    if (w.ammoType === 'magnum' || w.ammoType === 'bmg50' || w.ammoType === 'super_ap') {
      s += 0.25; 
    } else {
      s += w.airSpread;
    }
  }
  
  if (player.crouch && speed < 0.6) s *= w.crouchMult;
  
  s *= lerp(1, w.adsSpread, player.adsEase);

  if (w.id === 'shotgun') {
    s *= lerp(1, 0.85, player.adsEase);
  }
  
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
  if (!WEAPONS[i]) return;
  if (i === player.weapon && player.switchTo < 0) return;
  if (player.switching > 0){ player.pendingWpn = i; return; }
  if (player.reloadT > 0) player.reloadT = 0;
  if (typeof cancelHeal === 'function') cancelHeal();
  setADS(false);
  player.boltT = 0;
  player.switchTo = i;
  player.switching = WEAPONS[i].drawTime + 0.22;
  player.holsterAt = 0.22;
  if(typeof SFX !== 'undefined') SFX.boltClick();
}

function startReload(){
  const w = WEAPONS[player.weapon];
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
  if(typeof SFX !== 'undefined') SFX.magOut();
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

var recentMisses = 0;
function fireWeapon(){
  if (typeof cancelHeal === 'function') cancelHeal();

  const w = WEAPONS[player.weapon];
  if (player.fireCooldown > 0 || player.reloadT > 0 || player.switching > 0 || player.pumpT > 0 || player.boltT > 0) return false;

  if (w.mag <= 0){
    if (SET.infiniteAmmo){ w.mag = w.magSize; w.res = w.maxReserve; if (typeof updateAmmoUI === 'function') updateAmmoUI(); }
    else {
      if (player.triggerReleased && typeof SFX !== 'undefined'){ SFX.dryFire(); player.triggerReleased = false; }
      if (w.res > 0) startReload();
      return true;
    }
  }

  if (!SET.infiniteAmmo) w.mag--;
  else w.mag = w.magSize;

  player.noSprintT = 0.5;
  player.fireCooldown = 60 / w.rpm;
  G.shots++;
  player.triggerReleased = false;

  // ✅ 连射计数器更新
  if (w.id === 'rifle') _m4BurstCount++;
  if (w.id === 'shotgun') _shotgunBurstCount++;
  if (w.id === 'sniper') _sniperBurstCount++;

  for (const e of enemies) { if (!e.dead) e.obj.updateMatrixWorld(true); }

  camera.getWorldDirection(_fwd);
  _rgt.crossVectors(_fwd, _up).normalize();
  const upv = new THREE.Vector3().crossVectors(_rgt, _fwd).normalize();

  w.vm.muzzle.updateWorldMatrix(true, false);
// ★ 开镜时曳光弹从准心前方打出，腰射时从屏幕右下"假枪口"打出
// 用 adsEase 平滑插值，开镜/关镜过程不会突跳
const _adsK = player.adsEase || 0;
if (_adsK > 0.01) {
  const adsDist = lerp(0.55, 1.15, _adsK);
  _muzzleWorld.copy(camera.position).addScaledVector(_fwd, adsDist);
  // 过渡期间残留一点腰射偏移，避免视觉跳变
  _muzzleWorld.addScaledVector(_rgt, 0.16 * (1 - _adsK)).addScaledVector(upv, -0.12 * (1 - _adsK));
} else {
  _muzzleWorld.copy(camera.position).addScaledVector(_fwd, 0.55).addScaledVector(_rgt, 0.16).addScaledVector(upv, -0.12);
}

const spread = currentSpreadMult();
  
  let anyHit = false, killedSomething = false, headHit = false;

  _shootTargets.length = 0;
  for (let i = 0; i < enemyHitMeshes.length; i++) _shootTargets.push(enemyHitMeshes[i]);
  for (let i = 0; i < worldSolid.length; i++) _shootTargets.push(worldSolid[i]);

  for (let p = 0; p < w.pellets; p++){
    const dir = _fwd.clone();
    
    if (w.ammoType === 'magnum' && !player.onGround) {
      const randA = Math.random() * PI * 2;
      const randElev = rand(-0.3, 0.9);
      dir.addScaledVector(_rgt, Math.cos(randA) * 0.18).addScaledVector(upv, randElev).normalize();
    } else {
      const a = Math.random() * PI * 2;
      const r = (w.pellets > 1 ? Math.sqrt(Math.random()) : Math.random()) * spread;
      dir.addScaledVector(_rgt, Math.cos(a) * r).addScaledVector(upv, Math.sin(a) * r).normalize();
    }

    shootRay.set(camera.position, dir);
    shootRay.far = w.range;
    const hits = shootRay.intersectObjects(_shootTargets, false);
    
    let dmgMult = 1.0;
    let enemiesHit = 0;
    let cratesHit = 0;
    let wallsHit = 0;
    let end = camera.position.clone().addScaledVector(dir, w.range);
    
    let baseDmg = w.damage * PLR.dmgMult;
    
    let maxCrates = 0, maxEnemies = 1, maxWalls = 0;
    let dmgDecayCrate = 1.0, dmgDecayEnemy = 1.0;

    if (w.ammoType === 'magnum') {
      maxCrates = 1; maxEnemies = 3; maxWalls = 0; 
      dmgDecayCrate = 0.7; dmgDecayEnemy = 0.85;
      baseDmg *= 1.15;
    } else if (w.ammoType === 'bmg50') {
      maxCrates = 3; maxEnemies = 6; maxWalls = 0; 
      dmgDecayCrate = 0.85; dmgDecayEnemy = 0.9;
      baseDmg *= 2.0;
    } else if (w.ammoType === 'super_ap') {
      maxCrates = 6; maxEnemies = 6; maxWalls = 6; 
      dmgDecayCrate = 0.95; dmgDecayEnemy = 0.95;
      baseDmg *= 3.5;
    }

    for (let hIdx = 0; hIdx < hits.length; hIdx++) {
      const h = hits[hIdx];
      const ud = h.object.userData;
      const isCrate = h.object.material && h.object.material.map === TEX.crate;
      
      if (ud && ud.enemy && !ud.enemy.dead) {
        if (enemiesHit >= maxEnemies) break;
        const e = ud.enemy;
        const dist = h.distance;
        let dmg = baseDmg * dmgMult;
        const fo = clamp(1 - Math.max(0, dist - w.falloffStart) / w.falloffRange, w.falloffMin, 1);
        dmg *= fo;

        const isHead = ud.part === 'head';
        if (isHead) dmg *= w.headMult;
        else if (ud.part === 'legs') dmg *= 0.78;

        const hitPoint = h.point.clone();
        const killed = damageEnemy(e, dmg, isHead, dir, hitPoint, false);
        
        anyHit = true;
        if (isHead) headHit = true;
        if (killed) killedSomething = true;

        fxImpactFlesh(hitPoint, dir, dist, isHead);
        end = hitPoint;
        enemiesHit++;
        dmgMult *= dmgDecayEnemy;
      } 
      else if (isCrate) {
        if (cratesHit >= maxCrates) break;
        const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
        fxImpactWall(h.point, n, h.distance);
        end = h.point.clone();
        cratesHit++;
        dmgMult *= dmgDecayCrate;
        
        if (w.ammoType === 'super_ap') {
          for (let i = 0; i < 12; i++) {
            spawnParticle(PS_SPARK, h.point.x, h.point.y, h.point.z, rand(-2,2), rand(-1,3), rand(-2,2), 
              { color: [1.0, 0.85, 0.2], size: 0.08, life: 0.4, grow: 1.2, drag: 1.5, grav: 0 });
          }
        }
      }
      else { 
        if (w.ammoType === 'super_ap') {
          if (wallsHit >= maxWalls) break;
          const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
          fxImpactWall(h.point, n, h.distance);
          end = h.point.clone();
          wallsHit++;
          
          for (let i = 0; i < 15; i++) {
            spawnParticle(PS_SPARK, h.point.x, h.point.y, h.point.z, rand(-2,2), rand(-1,3), rand(-2,2), 
              { color: [1.0, 0.9, 0.3], size: 0.12, life: 0.5, grow: 1.5, drag: 1.2, grav: 0 });
          }
        } else {
          const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
          fxImpactWall(h.point, n, h.distance);
          end = h.point.clone();
          break; 
        }
      }
    }

    let tracerColor = 0xffd27a;
    if (w.ammoType === 'magnum') tracerColor = 0xc98cff;
    if (w.ammoType === 'bmg50') tracerColor = 0xff3b30;
    if (w.ammoType === 'super_ap') tracerColor = 0xffd700;

    if (w.id === 'sniper' || w.id === 'barrett') {
        spawnTracer(_muzzleWorld, end, tracerColor, 3.5, true);
        
        if (w.ammoType === 'super_ap') {
           for(let i=0; i<10; i++) {
             const t = i / 10;
             const px = _muzzleWorld.x + (end.x - _muzzleWorld.x) * t;
             const py = _muzzleWorld.y + (end.y - _muzzleWorld.y) * t;
             const pz = _muzzleWorld.z + (end.z - _muzzleWorld.z) * t;
             spawnParticle(PS_SPARK, px, py, pz, rand(-1,1), rand(-1,1), rand(-1,1), 
               { color: [1.0, 0.85, 0.2], size: 0.15, life: 0.6, grow: 2, drag: 0.5, grav: 0 });
           }
        }
    } else if (p === 0 || w.pellets <= 3 || Math.random() < 0.45) {
        spawnTracer(_muzzleWorld, end, tracerColor, 1.5, false);
    }
  }

  if (anyHit){
  G.hits++;
  recentMisses = 0;
  SFX.hitBeep(headHit);
    if (typeof showHitmark === 'function') showHitmark(killedSomething);
    if (typeof triggerHitFeedback === 'function') triggerHitFeedback(headHit, killedSomething);
  }

  let soundId = w.sound;
  if (w.suppressed) {
    if (w.id === 'rifle') soundId = 'suppressed_rifle';
    else if (w.id === 'sniper') soundId = 'suppressed_sniper';
  }
  if(typeof SFX !== 'undefined') SFX.gunshot(soundId, 0, 0);

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

  if (typeof vmKick === 'function') vmKick(w);
  
  flashT = flashDur;
  if (w.ammoType === 'super_ap') flashPower = 2.8;
  else if (w.ammoType === 'bmg50') flashPower = 2.2;
  else flashPower = w.id === 'shotgun' ? 1.7 : (w.id === 'sniper' || w.id === 'barrett') ? 1.9 : w.id === 'rifle' ? 1.0 : 0.8;

  // ✅ 冒烟逻辑判定
  let smokeDur = 0;
  let smokePow = 0;

  if (w.id === 'rifle') {
    if (_m4BurstCount >= 20) {
      smokeDur = 1.5;
      smokePow = 2; 
    }
  } else if (w.id === 'shotgun') {
    if (_shotgunBurstCount >= 4) { 
      smokeDur = 1.5;
      smokePow = 2;
    }
  } else if (w.id === 'sniper') {
    if (w.ammoType === 'normal') {
      smokeDur = 1.7; smokePow = 1;
    } else if (w.ammoType === 'magnum') {
      smokeDur = 2.0; smokePow = 2;
    }
  } else if (w.id === 'barrett') {
    if (w.ammoType === 'normal') {
      smokeDur = 1.7; smokePow = 1;
    } else if (w.ammoType === 'magnum') {
      smokeDur = 2.0; smokePow = 2;
    } else if (w.ammoType === 'bmg50') {
      smokeDur = 2.5; smokePow = 3;
    } else if (w.ammoType === 'super_ap') {
      smokeDur = 3.0; smokePow = 4;
    }
  }

  // 如果触发了冒烟，更新全局变量
  if (smokeDur > 0) {
    // 优先保留当前最高的强度
    if (vmSmokeT <= 0 || smokePow >= vmSmokePower) {
      vmSmokeT = smokeDur;
      vmSmokePower = smokePow;
    }
  }

  if (w.id === 'shotgun'){ player.pumpT = w.pumpTime; player.pumpEjected = false; }
  else if (w.id === 'sniper' || w.id === 'barrett'){ 
    player.boltT = w.boltTime; 
    player.boltPhase = 0; 
    if(typeof SFX !== 'undefined') SFX.boltCycle(0); 
  }
  else {
    const ejPos = camera.position.clone().addScaledVector(_fwd, 0.36).addScaledVector(_rgt, 0.24).addScaledVector(upv, -0.08);
    let sType = 'rifle';
    if (w.id === 'shotgun') sType = 'shotgun';
    if (w.ammoType === 'super_ap') sType = 'super_ap';
    else if (w.id === 'barrett' || w.id === 'sniper') sType = 'barrett';
    
    ejectShell(ejPos, _rgt.clone().addScaledVector(_fwd, 0.15), sType);
  }

  for (let i = 0; i < 2; i++){
    spawnParticle(PS_SOFT, _muzzleWorld.x, _muzzleWorld.y, _muzzleWorld.z, _fwd.x * rand(1, 3) + rand(-.4, .4), rand(.2, .7), _fwd.z * rand(1, 3) + rand(-.4, .4), { color: [0.62, 0.60, 0.58], size: 0.09, grow: 0.42, life: rand(0.4, 0.8), drag: 2.6, grav: 0.5, alpha: 0.30 });
  }

  if (typeof updateAmmoUI === 'function') updateAmmoUI();
  return true;
}