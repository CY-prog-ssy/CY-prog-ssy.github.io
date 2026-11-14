/* =========================================================================
   player_update.js
   ========================================================================= */
"use strict";

const WALK_SPEED   = 4.9;
const SPRINT_SPEED = 7.9;
const CROUCH_SPEED = 2.35;
const ACCEL        = 64;
const AIR_ACCEL    = 11;
const FRICTION     = 11.5;
const GRAVITY      = -19.5;
const JUMP_V       = 6.95;
const DOUBLE_JUMP_V = 6.05;
const BREATH_TIME   = 3.0;
const MANTLE_RISE = 1.95;
const MANTLE_MIN  = 0.45;

let fovCur = BASE_FOV;

const AA = {
  CONE: 0.155,
  MIN_D: 2.0,
  MAX_D: 55,
  ray: new THREE.Raycaster(),
  from: new THREE.Vector3(),
  dir:  new THREE.Vector3(),
  to:   new THREE.Vector3()
};

let _aaWasFiring = false;

function getTargetPoint(e, out) {
    // 基础体型缩放（精英/Boss变大）
    const sc = (e.p && e.p.scale) || 1;
    // ★ 实时获取当前姿态（站立/蹲/趴）的纵向缩放，防止敌人蹲下后辅助瞄准锁在空气上
    const postureScale = (e.p && e.p.model) ? e.p.model.scale.y : 1;
    
    let yOffset = 1.66;
    if (typeof SET !== 'undefined') {
        if (SET.aimPart === 'body') yOffset = 1.15;
        else if (SET.aimPart === 'legs') yOffset = 0.45;
    }
    
    // 加入目标动态提前量（补偿手速和屏幕延迟）
    let leadX = 0, leadZ = 0;
    if (e.vel) {
        const dist = Math.hypot(e.obj.position.x - player.pos.x, e.obj.position.z - player.pos.z);
        const leadTime = clamp(dist * 0.002, 0.02, 0.15); 
        leadX = e.vel.x * leadTime;
        leadZ = e.vel.z * leadTime;
    }
    
    // ★ 目标高度 = 底部高度 + (基础高度 * 体型缩放 * 姿态缩放)
    return out.set(
        e.obj.position.x + leadX, 
        e.obj.position.y + (yOffset * sc * postureScale), 
        e.obj.position.z + leadZ
    );
}

const _tgtPos = new THREE.Vector3();

// 在函数外、全局作用域加一行缓存变量：
let _lockedAssistTarget = null;

function findAssistTarget(cone, power){
  if (!enemies.length) return null;
  AA.from.set(player.pos.x, player.pos.y + player.eye, player.pos.z);
  let best = null, bestErr = cone;

  const curPitch = player.pitch + player.recoilPitch;
  const curYaw = player.yaw + player.recoilYaw;
  const useCone = cone * (1 + (power || 0) * 0.8);

  // ★ 目标锁定校验：如果上一个锁定的目标还活着，且依然在圈内，就死咬住它，绝不换人！
  if (_lockedAssistTarget && !_lockedAssistTarget.dead) {
    const dist = AA.from.distanceTo(_lockedAssistTarget.obj.position);
    if (dist < AA.MAX_D) {
      getTargetPoint(_lockedAssistTarget, _tgtPos);
      const dx = _tgtPos.x - AA.from.x;
      const dz = _tgtPos.z - AA.from.z;
      const dy = _tgtPos.y - AA.from.y;
      let dYaw = Math.atan2(-dx, -dz) - curYaw;
      while (dYaw >  PI) dYaw -= PI * 2;
      while (dYaw < -PI) dYaw += PI * 2;
      const dPitch = Math.atan2(dy, Math.hypot(dx, dz)) - curPitch;
      const err = Math.hypot(dYaw, dPitch);
      
      if (err < useCone) {
        return { e: _lockedAssistTarget, dYaw, dPitch, err, dist };
      }
    }
  }

  // 如果没有锁定的目标，或者目标跑出圈了，重新寻找
  for (const e of enemies){
  
    if (e.dead) continue;
    getTargetPoint(e, _tgtPos);
    const dx = _tgtPos.x - AA.from.x;
    const dz = _tgtPos.z - AA.from.z;
    const dy = _tgtPos.y - AA.from.y;
    const dist = Math.hypot(dx, dy, dz);
    
    if (dist < AA.MIN_D || dist > AA.MAX_D) continue;

    let dYaw = Math.atan2(-dx, -dz) - curYaw;
    while (dYaw >  PI) dYaw -= PI * 2;
    while (dYaw < -PI) dYaw += PI * 2;
    const dPitch = Math.atan2(dy, Math.hypot(dx, dz)) - curPitch;
    
    const err = Math.hypot(dYaw, dPitch);
    if (err >= bestErr || err > useCone) continue;

    AA.dir.set(dx, dy, dz).divideScalar(dist);
    AA.ray.set(AA.from, AA.dir);
    AA.ray.far = dist - 0.45;
    if (AA.ray.intersectObjects(worldSolid, false).length) continue;

	    bestErr = err;
    best = { e, dYaw, dPitch, err, dist };
  }
  
  // ★ 记录当前死咬的目标
  _lockedAssistTarget = best ? best.e : null;
  
  return best;
}

function assistErrorTo(e, cone){
  AA.from.set(player.pos.x, player.pos.y + player.eye, player.pos.z);
  getTargetPoint(e, _tgtPos);
  const dx = _tgtPos.x - AA.from.x;
  const dz = _tgtPos.z - AA.from.z;
  const dy = _tgtPos.y - AA.from.y;
  const dist = Math.hypot(dx, dy, dz);
  
  if (dist < AA.MIN_D * 0.5 || dist > AA.MAX_D) return null;
  const curPitch = player.pitch + player.recoilPitch;
  const curYaw = player.yaw + player.recoilYaw;

  let dYaw = Math.atan2(-dx, -dz) - curYaw;
  while (dYaw >  PI) dYaw -= PI * 2;
  while (dYaw < -PI) dYaw += PI * 2;
  const dPitch = Math.atan2(dy, Math.hypot(dx, dz)) - curPitch;
  
  const err = Math.hypot(dYaw, dPitch);
  return err < cone ? { dYaw, dPitch, err } : null;
}

const _mtA = new THREE.Vector3();
function findMantle(){
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  const feet = player.pos.y;
  for (let i = 0; i < 3; i++){
    const reach = 0.55 + i * 0.25;
    const px = player.pos.x + fx * reach;
    const pz = player.pos.z + fz * reach;
    const top = groundAt(px, pz, feet + MANTLE_RISE);
    if (top === null) continue;
    const rise = top - feet;
    if (rise < MANTLE_MIN || rise > MANTLE_RISE) continue;
    if (blocked(px, pz, top + 0.10, top + STAND_H - 0.06, P_RADIUS * 0.92)) continue;
    const ahead = groundAt(px + fx * 0.35, pz + fz * 0.35, top + 0.35);
    if (ahead === null || ahead < top - 0.45) continue;
    return _mtA.set(px + fx * 0.28, top + 0.02, pz + fz * 0.28);
  }
  return null;
}

function startMantle(target){
  player.mantleFrom.copy(player.pos);
  player.mantleTo.copy(target);
  const rise = Math.max(0.2, target.y - player.pos.y);
  player.mantleDur = clamp(0.26 + rise * 0.13, 0.28, 0.55);
  player.mantleT = 1e-4;
  player.vel.set(0, 0, 0);
  player.onGround = false;
  player.jumpsLeft = 0;
  SFX.footstep(0.5, 0);
}

function updatePlayer(dt){
  // ✅ 修复：如果超过 1 秒没开枪，清空全自动武器的连射计数
  if (player.fireCooldown <= 0) {
    if (typeof _m4BurstCount !== 'undefined') _m4BurstCount = 0;
    if (typeof _shotgunBurstCount !== 'undefined') _shotgunBurstCount = 0;
    if (typeof _sniperBurstCount !== 'undefined') _sniperBurstCount = 0;
  }

  if (G.introLock){
    mouseDX = 0;
    mouseDY = 0;
    player.triggerHeld = false;
  }

  if (player.noSprintT > 0) player.noSprintT = Math.max(0, player.noSprintT - dt);
  if (player.landLockT > 0) player.landLockT = Math.max(0, player.landLockT - dt);

  const wpn = WEAPONS[player.weapon];
  const isBarrett = wpn.id === 'barrett'; 
  
  const aaFov = lerp(fovCur, wpn.adsFov, player.adsEase);
  const aaCone = AA.CONE * clamp(Math.tan(aaFov * PI / 360) / Math.tan(BASE_FOV * PI / 360), 0.45, 1.6);

  const firing = player.triggerHeld || player.clickBuf > 0;
const firingEdge = firing && !_aaWasFiring;
_aaWasFiring = firing;

// ★ 无论开不开枪，每帧都寻找可瞄准目标，暴露给全局供 ESP 绘制预判线
window._aimAssistTargetInfo = (SET.aimAssist && !player.dead) ? findAssistTarget(aaCone, 0) : null;

const aaActive = SET.aimAssist && SET.aimPower > 0 && firing && !player.dead;
const aaTgt = aaActive ? window._aimAssistTargetInfo : null;

  let aaSlow = 1;
  if (aaTgt && SET.aimSlowdown > 0){
    const closeness = 1 - clamp(aaTgt.err / aaCone, 0, 1);
    aaSlow = 1 - SET.aimSlowdown * 0.5 * easeInOutCubic(closeness);
  }

  const sensNow = SENS * sensScale * lerp(1, SET.adsSens, player.adsEase) * aaSlow;
  player.yaw   -= mouseDX * sensNow;
  player.pitch -= mouseDY * sensNow;
  player.pitch = clamp(player.pitch, -PI / 2 + 0.02, PI / 2 - 0.02);

  if (aaTgt && SET.aimAssist && SET.aimPower > 0){
  const useCone = aaCone * (1 + SET.aimPower * 0.8);
  const now = assistErrorTo(aaTgt.e, useCone);
  if (now && now.err > 1e-6){
    const k = clamp(SET.aimPower, 0, 1);
    
    // ★ 预判点与视线校验：防止预判点落在掩体后面导致强行拉枪
    getTargetPoint(aaTgt.e, _tgtPos);
    AA.from.set(player.pos.x, player.pos.y + player.eye, player.pos.z);
    AA.dir.subVectors(_tgtPos, AA.from).normalize();
    const checkDist = AA.from.distanceTo(_tgtPos);
    AA.ray.set(AA.from, AA.dir);
    AA.ray.far = checkDist - 0.45;
    const isBlocked = AA.ray.intersectObjects(worldSolid, false).length > 0;

    // 只有目标点确实在视野内（没被墙挡）才允许吸附
    if (!isBlocked) {
      if (k >= 0.98){
        const dx = _tgtPos.x - player.pos.x;
        const dz = _tgtPos.z - player.pos.z;
        const dy = _tgtPos.y - (player.pos.y + player.eye);
        
        const targetYaw = Math.atan2(-dx, -dz);
        const targetPitch = Math.atan2(dy, Math.hypot(dx, dz));
        
        // ★ 平滑拉枪：限制每帧最大旋转幅度，防止瞬间闪现引发头晕和误触
        let deltaYaw = targetYaw - player.yaw;
        while (deltaYaw >  PI) deltaYaw -= PI * 2;
        while (deltaYaw < -PI) deltaYaw += PI * 2;
        let deltaPitch = targetPitch - player.pitch;

        const maxRot = 0.25; // 每帧最多拉 0.25 弧度
        player.yaw += clamp(deltaYaw, -maxRot, maxRot);
        player.pitch += clamp(deltaPitch, -maxRot, maxRot);
        
        player.recoilPitch = 0; 
        player.recoilYaw = 0;
        player.recoilVelP = 0;
        player.recoilVelY = 0;
      } else {
        // 普通辅助，加入平滑系数
        player.yaw   += clamp(now.dYaw * k, -0.2, 0.2);
        player.pitch += clamp(now.dPitch * k, -0.2, 0.2);
        if (now.dPitch < 0) {
            player.recoilPitch *= (1 - k * 0.85); 
            player.recoilVelP *= (1 - k * 0.85);
        }
      }
      player.pitch = clamp(player.pitch, -PI / 2 + 0.02, PI / 2 - 0.02);
    }
  }
}
  
  // ★ 自适应辅助矫正（修复版）
if (SET.aaCorrect && typeof recentMisses !== 'undefined' && recentMisses >= 3 && !player.dead){
  const tgt = findAssistTarget(1.5); // 超大判定范围
  if (tgt && tgt.e) {
    // 使用 getTargetPoint 获取包含速度预判的三维坐标
    getTargetPoint(tgt.e, _tgtPos); 
    
    const dx = _tgtPos.x - player.pos.x;
    const dz = _tgtPos.z - player.pos.z;
    const dy = _tgtPos.y - (player.pos.y + player.eye);
    
    const targetYaw = Math.atan2(-dx, -dz);
    const targetPitch = Math.atan2(dy, Math.hypot(dx, dz));
    
    // 以极快的速度强行拉过去（兼顾平滑）
    player.yaw += (targetYaw - player.yaw) * 0.85;
    player.pitch += (targetPitch - player.pitch) * 0.85;
    
    player.recoilPitch = 0; // 清空后坐力，防止拉枪飘
    player.recoilYaw = 0;
    recentMisses = 0; // 吸附成功重置
  }
}

  player.recoilVelP = damp(player.recoilVelP, 0, 16, dt);
  player.recoilVelY = damp(player.recoilVelY, 0, 16, dt);
  player.recoilPitch += player.recoilVelP * dt;
  player.recoilYaw   += player.recoilVelY * dt;
  player.recoilPitch = damp(player.recoilPitch, 0, 6.5, dt);
  player.recoilYaw   = damp(player.recoilYaw,   0, 6.5, dt);

  if (player.ads && (player.reloadT > 0 || player.dead)) setADS(false);
  const adsWant = player.ads && player.switching <= 0;
  const adsSpeed = 1 / (wpn.adsTime || 0.20);
  player.adsK = clamp(player.adsK + (adsWant ? adsSpeed : -adsSpeed) * dt, 0, 1);
  player.adsEase = easeInOutCubic(player.adsK);
  const scoped = !!wpn.scope && player.adsEase > 0.55;

  const shiftDown = isActionDown('sprint');
  if (scoped && shiftDown && !player.breathLock && player.breath <= 0){
    player.breath = BREATH_TIME;
    player.breathHeld = true;
  }
  if (!shiftDown) player.breathLock = false;
  if (player.breath > 0){
    player.breath -= dt;
    if (!shiftDown || !scoped){
      player.breath = 0;
      player.breathHeld = false;
    } else if (player.breath <= 0){
      player.breathHeld = false;
      player.breathLock = true;
    }
  } else player.breathHeld = false;

  player.swayT += dt;
  player.swayAmp = damp(player.swayAmp === undefined ? 1 : player.swayAmp, player.breathHeld ? 0.04 : 1, player.breathHeld ? 9 : 3.4, dt);
  const swayAmp = player.swayAmp;

  let scopeSwayX = 0, scopeSwayY = 0;
  if (wpn.scope && player.adsEase > 0.02){
    const a = 0.0125 * player.adsEase * swayAmp;
    scopeSwayX = Math.sin(player.swayT * 0.62) * a + Math.sin(player.swayT * 1.13 + 1.7) * a * 0.30;
    scopeSwayY = Math.sin(player.swayT * 0.47 + 2.2) * a * 0.72 + Math.sin(player.swayT * 0.91) * a * 0.22;
  }

  // ★ 键盘按住 ctrl 依旧生效；触屏按钮点击后通过 crouchLatch 切换
  const wantCrouch = isActionDown('crouch') || player.crouchLatch;
player.wantCrouch = wantCrouch; // ★ 记录玩家的输入意图，供落地时判定

const wantSprint = shiftDown && !isBarrett && !wantCrouch && !player.ads && !firing && player.noSprintT <= 0 && isActionDown('forward') && player.reloadT <= 0 && player.healT <= 0;

// ★ 优化：只有在“站在地面”时，才改变身体的蹲下状态。
// 在空中按下蹲，只记下意图，身体高度和模型完全不变，等落地瞬间再变。
if (player.onGround) {
  if (!wantCrouch && player.crouch){
    const ceil = ceilingAt(player.pos.x, player.pos.z, player.pos.y + CROUCH_H);
    if (ceil - player.pos.y > STAND_H + 0.1) player.crouch = false;
  } else {
    player.crouch = wantCrouch;
  }
}
  player.sprint = wantSprint && !player.crouch;

  player.height = damp(player.height, player.crouch ? CROUCH_H : STAND_H, 13, dt);

  const moveLocked = G.introLock || player.landLockT > 0;
  const f = moveLocked ? 0 : (isActionDown('forward') ? 1 : 0) - (isActionDown('back') ? 1 : 0);
  const s = moveLocked ? 0 : (isActionDown('right')   ? 1 : 0) - (isActionDown('left') ? 1 : 0);
  const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
  let wx = (-sy * f) + (cy * s);
  let wz = (-cy * f) - (sy * s);
  const wl = Math.hypot(wx, wz);
  if (wl > 0){ wx /= wl; wz /= wl; }

  let maxSpeed = player.crouch ? CROUCH_SPEED : (player.sprint ? SPRINT_SPEED : WALK_SPEED);

// ★ 应用当前手持武器的移速倍率（如手枪更轻便）
if (wpn.moveSpeedMult) {
  maxSpeed *= wpn.moveSpeedMult;
}

if (player.reloadT > 0) maxSpeed *= 0.86;
if (player.healT > 0)   maxSpeed *= 0.45;
  // ★ 优化：仅在处于地面时，开镜才降低水平移动速度。空中开镜保留原本的惯性速度。
  if (player.onGround) {
    maxSpeed *= 1 - 0.40 * player.adsEase;
  }

  const accel = player.onGround ? ACCEL : AIR_ACCEL;
  if (wl > 0){ player.vel.x += wx * accel * dt; player.vel.z += wz * accel * dt; }

  if (player.onGround){
    const sp = Math.hypot(player.vel.x, player.vel.z);
    if (sp > 0){
      const drop = sp * FRICTION * dt * (wl > 0 ? 0.55 : 1.0);
      const k = Math.max(0, sp - drop) / sp;
      player.vel.x *= k; player.vel.z *= k;
    }
  }

  { const sp = Math.hypot(player.vel.x, player.vel.z); if (sp > maxSpeed){ const k = maxSpeed / sp; player.vel.x *= k; player.vel.z *= k; } }

const spacePressed = player.spaceEdge;
player.spaceEdge = false;

if (player.onGround) player.jumpsLeft = 1;
let jumpedNow = false;

// ★ 1. 飞天模式下彻底屏蔽跳跃，防止按空格和起跳冲突
if (!SET.flyMode) {
  const wantJump = !isBarrett && (spacePressed || isActionDown('jump'));
  const canJump  = player.landLockT <= 0;

  if (wantJump && canJump && player.onGround && !player.crouch){
    player.vel.y = JUMP_V; player.onGround = false; player.jumpsLeft = 1; jumpedNow = true; SFX.jumpSound();
  }

  if (!jumpedNow && !player.onGround && player.mantleT<=0){
    if ((keys['Space'] || player.vel.y < 0) && player.vel.y < 3.5){
      const led = findMantle();
      if (led) startMantle(led);
    }
    if (player.mantleT <= 0 && spacePressed && player.jumpsLeft > 0 && canJump && !isBarrett){
      player.jumpsLeft--; player.vel.y = DOUBLE_JUMP_V; SFX.jumpSound(); player.shake = Math.min(1.2, player.shake + 0.10);
    }
  }
}

// ★ 2. 飞天模式（指着哪飞哪）
if (SET.flyMode) {
  player.vel.set(0, 0, 0);
  player.onGround = false;
  player.jumpsLeft = 1;
  
  const flySpeed = player.sprint ? 35 : 15;
  
  const cosPitch = Math.cos(player.pitch);
  const forward = new THREE.Vector3(
    -Math.sin(player.yaw) * cosPitch,
    Math.sin(player.pitch),
    -Math.cos(player.yaw) * cosPitch
  ).normalize();
  
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw)).normalize();
  
  let moveF = 0, moveS = 0;
  if (keys['KeyW'] || keys['ArrowUp']) moveF += 1;
  if (keys['KeyS'] || keys['ArrowDown']) moveF -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) moveS += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) moveS -= 1;
  
  if (moveF !== 0 || moveS !== 0) {
    const oldX = player.pos.x, oldY = player.pos.y, oldZ = player.pos.z;
    player.pos.addScaledVector(forward, moveF * flySpeed * dt);
    player.pos.addScaledVector(right, moveS * flySpeed * dt);
    
    if (blocked(player.pos.x, player.pos.z, player.pos.y + 0.3, player.pos.y + player.height - 0.05, P_RADIUS)) {
      player.pos.set(oldX, oldY, oldZ);
    }
    player.pos.y = clamp(player.pos.y, 0, 80);
  }
} else if (player.mantleT > 0){
  
    player.mantleT += dt;
    const k  = clamp(player.mantleT / player.mantleDur, 0, 1);
    const ku = easeOutCubic(clamp(k * 1.42, 0, 1));
    const kf = easeInOutCubic(clamp((k - 0.30) / 0.70, 0, 1));
    player.pos.y = lerp(player.mantleFrom.y, player.mantleTo.y, ku);
    player.pos.x = lerp(player.mantleFrom.x, player.mantleTo.x, kf);
    player.pos.z = lerp(player.mantleFrom.z, player.mantleTo.z, kf);
    player.vel.set(0, 0, 0);
    player.mantleTilt = Math.sin(k * PI) * 0.085;
    if (k >= 1){ player.mantleT = 0; player.mantleTilt = 0; player.onGround = true; player.jumpsLeft = 1; invalidateGroundCache(); SFX.footstep(0.7, 0); } 
    else player.onGround = false;
  } else {
  // ★ 3. 补上原代码缺失的重力（这就是为什么之前跳一下会一直升天的罪魁祸首）
  player.vel.y += GRAVITY * dt;

  moveSlide(player.pos, player.vel.x * dt, player.vel.z * dt, P_RADIUS, player.height);
    player.pos.x = clamp(player.pos.x, -HALF + 0.8, HALF - 0.8);
    player.pos.z = clamp(player.pos.z, -HALF + 0.8, HALF - 0.8);

    const prevVy = player.vel.y;
    const prevY  = player.pos.y;
    player.pos.y += player.vel.y * dt;

    if (player.vel.y > 0){
      const ceil = ceilingAt(player.pos.x, player.pos.z, player.pos.y + player.height);
      if (player.pos.y + player.height > ceil){ player.pos.y = ceil - player.height - 0.01; player.vel.y = 0; }
    }

    const step = (player.onGround && player.vel.y <= 0) ? 0.62 : 0.0;
    const probeTop = Math.max(prevY, player.pos.y) + step;
    const gy = groundAt(player.pos.x, player.pos.z, probeTop);
    const floorY = gy === null ? 0 : gy;

    if (player.pos.y <= floorY + 0.02){
      if (!player.onGround){
        player.landLockT = 0.3;
        if (prevVy < -3){
          const f2 = clamp(-prevVy / 16, 0, 1);
          player.landShake = f2 * 0.9;
          player.shake = Math.min(1.5, player.shake + f2 * 0.55);
          SFX.landSound(f2);
        }
      }
      player.pos.y = floorY; player.vel.y = 0; player.onGround = true;
    } else { player.onGround = false; }
  }

  {
  // 只在空中时才做二次推离（防止穿透地面/物体）。
  // 站在地面/物体上时（onGround = true）不再推离，
  // 避免玩家站在矮物上靠近高物时被"排挤"出去。
  if (!player.onGround){
    const y0 = player.pos.y + 0.30;
    const y1 = player.pos.y + player.height - 0.05;
    if (blocked(player.pos.x, player.pos.z, y0, y1, P_RADIUS)) depenetrate(player.pos, P_RADIUS, y0, y1);
  }
}

  const hSpeed = Math.hypot(player.vel.x, player.vel.z);
  const moving = hSpeed > 0.6 && player.onGround;
  player.bobAmp = damp(player.bobAmp, moving ? clamp(hSpeed / WALK_SPEED, 0, 1.5) : 0, 9, dt);

  if (moving){
    const prev = player.stepPhase;
    player.stepPhase += dt * hSpeed * (player.crouch ? 1.05 : 1.42);
    if (Math.floor(prev / PI) !== Math.floor(player.stepPhase / PI)){
      const vol = player.crouch ? 0.35 : (player.sprint ? 1.15 : 0.8);
      SFX.footstep(vol, clamp(Math.sin(player.stepPhase) * 0.35, -1, 1));
    }
  }
  player.bob = player.stepPhase;

  if (player.invulnT > 0) player.invulnT = Math.max(0, player.invulnT - dt);

  player.shake = damp(player.shake, 0, 7.5, dt);
  player.landShake = damp(player.landShake, 0, 9, dt);

  const bobY = Math.sin(player.bob * 2) * 0.032 * player.bobAmp;
  const bobX = Math.sin(player.bob) * 0.036 * player.bobAmp;
  const bobR = Math.sin(player.bob) * 0.010 * player.bobAmp;
  player.eye = damp(player.eye, player.height * 0.92, 16, dt);

  const t = perfNow * 0.001;
  const shk = player.shake;
  const sX = (Math.sin(t * 57.3 + player.shakeSeed) + Math.sin(t * 31.1)) * 0.5 * shk * 0.030;
  const sY = (Math.sin(t * 43.7 + player.shakeSeed * 2) + Math.sin(t * 67.3)) * 0.5 * shk * 0.030;
  const sR = Math.sin(t * 39.9 + player.shakeSeed * 3) * shk * 0.016;

  const steady = 1 - 0.82 * player.adsEase;

  camera.position.set(
    player.pos.x + (bobX * 0.4 + sX) * steady,
    player.pos.y + player.eye + (bobY + sY) * steady - player.landShake * 0.16,
    player.pos.z + sX * 0.5 * steady
  );
  camera.rotation.set(
    player.pitch + player.recoilPitch - player.landShake * 0.10 - (player.mantleTilt || 0) + sY * 0.6 * steady + scopeSwayY,
    player.yaw + player.recoilYaw + scopeSwayX,
    (bobR + sR) * steady + ((keys['KeyA'] ? 0.014 : 0) - (keys['KeyD'] ? 0.014 : 0)) * steady
  );

  const hipFov = BASE_FOV + (player.sprint && hSpeed > 4.5 ? 7.5 : 0) + clamp(hSpeed - 5, 0, 3) * 0.6;
  fovCur = damp(fovCur, hipFov, 7, dt);

  player.fovKick = damp(player.fovKick, 0, 13, dt);
  const fovNow = lerp(fovCur, wpn.adsFov, player.adsEase) + player.fovKick * (1 - player.adsEase * 0.75);
  if (Math.abs(camera.fov - fovNow) > 0.005){
    camera.fov = fovNow;
    camera.updateProjectionMatrix();
  }
  sensScale = lerp(1, clamp(Math.tan(wpn.adsFov * PI / 360) / Math.tan(BASE_FOV * PI / 360), 0.18, 1), player.adsEase);

  const w = WEAPONS[player.weapon];
  w.spread = Math.max(w.spreadBase, w.spread - w.spreadRecover * dt);

  player.fireCooldown -= dt;
  player.burstIdle += dt;
  if (player.burstIdle > 0.32) player.burstCount = 0;
  player.clickBuf = Math.max(0, player.clickBuf - dt);

  if (!player.dead && (player.triggerHeld || player.clickBuf > 0)){
    if (w.auto && !w.semi){ if (fireWeapon()) player.clickBuf = 0; } 
    else if (player.triggerReleased){ if (fireWeapon()) player.clickBuf = 0; }
  }

  if (player.reloadT > 0){
    const before = player.reloadT;
    player.reloadT -= dt;
    const total = w.reloadTime;
    if (before / total > 0.62 && player.reloadT / total <= 0.62) SFX.magIn();
    if (before / total > 0.22 && player.reloadT / total <= 0.22) SFX.boltClick();
    if (player.reloadT <= 0){ player.reloadT = 0; finishReload(); }
  }

  if (player.pumpT > 0){
    player.pumpT -= dt;
    const w2 = WEAPONS[1];
    const k = 1 - player.pumpT / w2.pumpTime;
    if (!player.pumpEjected && k > 0.42){
      player.pumpEjected = true; SFX.pumpSound(true);
      camera.getWorldDirection(_fwd); _rgt.crossVectors(_fwd, _up).normalize();
      const ejPos = camera.position.clone().addScaledVector(_fwd, 0.30).addScaledVector(_rgt, 0.22);
      ejPos.y -= 0.06; 
      ejectShell(ejPos, _rgt.clone().addScaledVector(_fwd, 0.1), 'shotgun');
    }
    if (player.pumpT <= 0){ player.pumpT = 0; SFX.pumpSound(false); }
  }

  if (player.boltT > 0){
    const wS = WEAPONS[player.weapon];
    player.boltT -= dt;
    const k = 1 - player.boltT / wS.boltTime;
    if (player.boltPhase === 0 && k > 0.30){
      player.boltPhase = 1;
      camera.getWorldDirection(_fwd); _rgt.crossVectors(_fwd, _up).normalize();
      const ejPos = camera.position.clone().addScaledVector(_fwd, 0.20).addScaledVector(_rgt, 0.20);
      ejPos.y -= 0.04; 
      
      let sType = 'barrett';
      if (wS.ammoType === 'super_ap') sType = 'super_ap';
      ejectShell(ejPos, _rgt.clone().addScaledVector(_fwd, 0.05), sType);
    }
    if (player.boltPhase === 1 && k > 0.60){ player.boltPhase = 2; SFX.boltCycle(1); }
    if (player.boltT <= 0){ player.boltT = 0; player.boltPhase = 3; }
  }

  if (player.switching > 0){
    const before = player.switching;
    player.switching -= dt;

    if (player.switchTo >= 0 && before > 0 && player.switching <= WEAPONS[player.switchTo].drawTime){
      WEAPONS[player.weapon].vm.group.visible = false;
      player.weapon = player.switchTo;
      player.switchTo = -1;
      WEAPONS[player.weapon].vm.group.visible = true;
      if (typeof updateAmmoUI === 'function') updateAmmoUI();
    }

    if (player.switching <= 0){
      player.switching = 0;
      if (player.pendingWpn >= 0){
        const q = player.pendingWpn; player.pendingWpn = -1;
        if (q !== player.weapon) switchWeapon(q);
      }
    }
  }
}