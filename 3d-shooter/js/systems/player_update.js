/* =========================================================================
   player_update.js
   玩家更新 —— 移动 / 跳跃 / 攀爬 / 辅助瞄准 / 视角 / 相机
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

/* --------------------------------------------------------------------------
   辅助瞄准参数

   ★ 已改：瞄准点从胸口（y+1.15）改为头部中心（y+1.66×scale）。
   辅助瞄准的目的是帮你把准星放到致命部位上，落在胸口上的吸附会让
   远处只露半个头的敌人打不中 —— 子弹打墙，或者擦着肩膀飞过去。
   -------------------------------------------------------------------------- */
const AA = {
  CONE: 0.155,          // 锥形半角（弧度），捕捉范围
  MIN_D: 2.0,           // 比这近就不吸了（会跟你抢准星）
  MAX_D: 55,            // 比这远就不吸了（人已经小到几个像素）
  HEAD_Y: 1.66,         // ★ 头部中心距脚底的高度，对应 enemy_model.js 里 hbHead.position.y
  REF_RATE: 0.65,       // 视为"满输入"的转向速率（rad/s）
  MAX_ERR_FIX: 0.5,     // 单帧最多修正剩余偏差的比例
  INPUT_CAP: 0.6,       // 单帧修正量不得超过你本人转向量的这个比例
  ray: new THREE.Raycaster(),
  from: new THREE.Vector3(),
  dir:  new THREE.Vector3(),
  to:   new THREE.Vector3()
};

/* 上一帧是否在开火 —— 用于检测"开火沿" */
let _aaWasFiring = false;

/**
 * 找出准星锥内最近且可见的敌人，返回其头部中心相对准星的角度偏差。
 *
 * ★ 瞄准点是头，不是胸口：
 *   - 头中心高度 = 1.66m × 敌人缩放（精英 1.06 / 首领 1.26~1.42）
 *   - 不做缩放补偿的话，高个子会被吸到脖子甚至肩膀
 *   - 头被掩体挡住就不吸（吸一个打不到的点比不吸更糟）
 */
function findAssistTarget(cone, power){
  if (!enemies.length) return null;
  AA.from.set(player.pos.x, player.pos.y + player.eye, player.pos.z);
  let best = null, bestErr = cone;

  /* 强度越高，锥形范围越宽 */
  const useCone = cone * (1 + (power || 0) * 0.8);

  for (const e of enemies){
    if (e.dead) continue;
    const dx = e.obj.position.x - AA.from.x;
    const dz = e.obj.position.z - AA.from.z;
    /* ★ 精英和首领的 model.scale 不是 1，头部高度要一起缩放 */
    const sc = (e.p && e.p.scale) || 1;
    const dy = (e.obj.position.y + AA.HEAD_Y * sc) - AA.from.y;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < AA.MIN_D || dist > AA.MAX_D) continue;

    let dYaw = Math.atan2(-dx, -dz) - player.yaw;
    while (dYaw >  PI) dYaw -= PI * 2;
    while (dYaw < -PI) dYaw += PI * 2;
    const dPitch = Math.atan2(dy, Math.hypot(dx, dz)) - player.pitch;
    const err = Math.hypot(dYaw, dPitch);
    if (err >= bestErr || err > useCone) continue;

    /* 头部射线被墙挡住 → 放弃这个目标 */
    AA.dir.set(dx, dy, dz).divideScalar(dist);
    AA.ray.set(AA.from, AA.dir);
    AA.ray.far = dist - 0.45;
    if (AA.ray.intersectObjects(worldSolid, false).length) continue;

    bestErr = err;
    best = { e, dYaw, dPitch, err, dist };
  }
  return best;
}

/**
 * 输入已经落地后重新测量到某个敌人的头部偏差。
 *
 * 第二次测量是这套机制的核心：如果你自己的转动把准星甩过了头，
 * 偏差会反号，吸附会把你拽回来而不是继续往外推 ——
 * 这个符号翻转是它读起来像"磁性"而不是"恒定漂移"的原因。
 */
function assistErrorTo(e, cone){
  AA.from.set(player.pos.x, player.pos.y + player.eye, player.pos.z);
  const dx = e.obj.position.x - AA.from.x;
  const dz = e.obj.position.z - AA.from.z;
  /* ★ 同 findAssistTarget：头部高度按敌人缩放补偿 */
  const sc = (e.p && e.p.scale) || 1;
  const dy = (e.obj.position.y + AA.HEAD_Y * sc) - AA.from.y;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < AA.MIN_D * 0.5 || dist > AA.MAX_D) return null;

  let dYaw = Math.atan2(-dx, -dz) - player.yaw;
  while (dYaw >  PI) dYaw -= PI * 2;
  while (dYaw < -PI) dYaw += PI * 2;
  const dPitch = Math.atan2(dy, Math.hypot(dx, dz)) - player.pitch;
  const err = Math.hypot(dYaw, dPitch);
  return err < cone ? { dYaw, dPitch, err } : null;
}

/* --------------------------------------------------------------------------
   攀爬检测
   -------------------------------------------------------------------------- */
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

/* --------------------------------------------------------------------------
   主更新
   -------------------------------------------------------------------------- */
function updatePlayer(dt){
  if (G.introLock){
    mouseDX = 0;
    mouseDY = 0;
    player.triggerHeld = false;
  }

  /* ★ 惩罚计时器递减（每帧都走，IntroLock 期间也走） */
  if (player.noSprintT > 0) player.noSprintT = Math.max(0, player.noSprintT - dt);
  if (player.landLockT > 0) player.landLockT = Math.max(0, player.landLockT - dt);

  /* ---- 视角 ---- */
  const wpn = WEAPONS[player.weapon];
  const aaFov = lerp(fovCur, wpn.adsFov, player.adsEase);
  const aaCone = AA.CONE *
    clamp(Math.tan(aaFov * PI / 360) / Math.tan(BASE_FOV * PI / 360), 0.45, 1.6);

  /* ★ 是否正在开火 */
  const firing = player.triggerHeld || player.clickBuf > 0;
  const firingEdge = firing && !_aaWasFiring;
  _aaWasFiring = firing;

  /* ★ 只在开火时寻找辅助目标 */
  const aaActive = SET.aimAssist && SET.aimPower > 0 && firing && !player.dead;
  const aaTgt = aaActive ? findAssistTarget(aaCone, SET.aimPower) : null;

  /* 目标降速 */
  let aaSlow = 1;
  if (aaTgt && SET.aimSlowdown > 0){
    const closeness = 1 - clamp(aaTgt.err / aaCone, 0, 1);
    aaSlow = 1 - SET.aimSlowdown * 0.5 * easeInOutCubic(closeness);
  }

  const sensNow = SENS * sensScale * lerp(1, SET.adsSens, player.adsEase) * aaSlow;
  player.yaw   -= mouseDX * sensNow;
  player.pitch -= mouseDY * sensNow;
  player.pitch = clamp(player.pitch, -PI / 2 + 0.02, PI / 2 - 0.02);

  /* ★ 辅助瞄准应用 */
  if (aaTgt && SET.aimAssist && SET.aimPower > 0){
    const useCone = aaCone * (1 + SET.aimPower * 0.8);
    const now = assistErrorTo(aaTgt.e, useCone);
    if (now && now.err > 1e-6){
      if (SET.aimPower >= 0.98){
        /* 拉满 = 完全自瞄：直接锁定头部 */
        player.yaw   += now.dYaw;
        player.pitch += now.dPitch;
      } else {
        /* 部分吸附：强度由 aimPower × aimStrength 决定 */
        const k = clamp(SET.aimStrength * SET.aimPower, 0, 1);
        player.yaw   += now.dYaw   * k;
        player.pitch += now.dPitch * k;
      }
      player.pitch = clamp(player.pitch, -PI / 2 + 0.02, PI / 2 - 0.02);
    }
  }

  /* ---- 后坐弹簧 ---- */
  player.recoilVelP = damp(player.recoilVelP, 0, 16, dt);
  player.recoilVelY = damp(player.recoilVelY, 0, 16, dt);
  player.recoilPitch += player.recoilVelP * dt;
  player.recoilYaw   += player.recoilVelY * dt;
  player.recoilPitch = damp(player.recoilPitch, 0, 6.5, dt);
  player.recoilYaw   = damp(player.recoilYaw,   0, 6.5, dt);

  /* ---- 开镜 ---- */
  if (player.ads && (player.reloadT > 0 || player.dead)) setADS(false);
  const adsWant = player.ads && player.switching <= 0;
  const adsSpeed = 1 / (wpn.adsTime || 0.20);
  player.adsK = clamp(player.adsK + (adsWant ? adsSpeed : -adsSpeed) * dt, 0, 1);
  player.adsEase = easeInOutCubic(player.adsK);
  const scoped = !!wpn.scope && player.adsEase > 0.55;

 /* 镜内摆动 */
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
player.swayAmp = damp(player.swayAmp === undefined ? 1 : player.swayAmp,
                      player.breathHeld ? 0.04 : 1,
                      player.breathHeld ? 9 : 3.4, dt);
const swayAmp = player.swayAmp;

let scopeSwayX = 0, scopeSwayY = 0;
if (wpn.scope && player.adsEase > 0.02){
  const a = 0.0125 * player.adsEase * swayAmp;
  scopeSwayX = Math.sin(player.swayT * 0.62) * a +
               Math.sin(player.swayT * 1.13 + 1.7) * a * 0.30;
  scopeSwayY = Math.sin(player.swayT * 0.47 + 2.2) * a * 0.72 +
               Math.sin(player.swayT * 0.91) * a * 0.22;
}

/* ---- 姿态 ---- */
const wantCrouch = isActionDown('crouch');

/* ★ 疾跑惩罚：只要 noSprintT > 0（开火后 2 秒）就不能疾跑，
   哪怕玩家一直按住 Shift + W。 */
const wantSprint = shiftDown && !wantCrouch && !player.ads && !firing &&
                   player.noSprintT <= 0 &&
                   isActionDown('forward') && player.reloadT <= 0 && player.healT <= 0;

  if (!wantCrouch && player.crouch){
    const ceil = ceilingAt(player.pos.x, player.pos.z, player.pos.y + CROUCH_H);
    if (ceil - player.pos.y > STAND_H + 0.1) player.crouch = false;
  } else player.crouch = wantCrouch;
  player.sprint = wantSprint && !player.crouch;

  player.height = damp(player.height, player.crouch ? CROUCH_H : STAND_H, 13, dt);

  /* ---- 期望方向 ---- */
/* ★ 落地锁定：从空中落地后 0.5 秒内，水平移动输入全部清零。
   视角 / 射击不受影响，但走路 / 疾跑 / 攀爬全部锁死。 */
const moveLocked = G.introLock || player.landLockT > 0;
const f = moveLocked ? 0 : (isActionDown('forward') ? 1 : 0) - (isActionDown('back') ? 1 : 0);
const s = moveLocked ? 0 : (isActionDown('right')   ? 1 : 0) - (isActionDown('left') ? 1 : 0);
  const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
  let wx = (-sy * f) + (cy * s);
  let wz = (-cy * f) - (sy * s);
  const wl = Math.hypot(wx, wz);
  if (wl > 0){ wx /= wl; wz /= wl; }

  let maxSpeed = player.crouch ? CROUCH_SPEED
               : (player.sprint ? SPRINT_SPEED : WALK_SPEED);
  if (player.reloadT > 0) maxSpeed *= 0.86;
  if (player.healT > 0)   maxSpeed *= 0.45;
  maxSpeed *= 1 - 0.40 * player.adsEase;

  const accel = player.onGround ? ACCEL : AIR_ACCEL;
  if (wl > 0){
    player.vel.x += wx * accel * dt;
    player.vel.z += wz * accel * dt;
  }

  if (player.onGround){
    const sp = Math.hypot(player.vel.x, player.vel.z);
    if (sp > 0){
      const drop = sp * FRICTION * dt * (wl > 0 ? 0.55 : 1.0);
      const k = Math.max(0, sp - drop) / sp;
      player.vel.x *= k;
      player.vel.z *= k;
    }
  }

  {
    const sp = Math.hypot(player.vel.x, player.vel.z);
    if (sp > maxSpeed){
      const k = maxSpeed / sp;
      player.vel.x *= k;
      player.vel.z *= k;
    }
  }

  /* ---- 跳 / 二段跳 / 攀爬 ---- */
  const spacePressed = player.spaceEdge;
  player.spaceEdge = false;

  if (player.onGround) player.jumpsLeft = 1;
  let jumpedNow = false;

  /* ★ 修复触屏点「跳」无效的 bug：
     - 触屏的 JUMP 按钮只设置 player.spaceEdge = true（边沿触发），
       从没走过 isActionDown('jump') —— 而第一段跳原本只看键盘的按住状态，
       所以手机上点跳从来不会起跳。
     - 现在第一段跳同时接受「边沿触发」和「按住」两种输入：
       键盘按住仍然保留落地后自动再跳的手感，
       触屏点击则走 spacePressed 分支。
     - landLockT 也一并在起跳判定里检查：落地 0.5 秒内不能起跳。 */
  const wantJump = spacePressed || isActionDown('jump');
  const canJump  = player.landLockT <= 0;

  if (wantJump && canJump && player.onGround && !player.crouch){
    player.vel.y = JUMP_V;
    player.onGround = false;
    player.jumpsLeft = 1;
    jumpedNow = true;
    SFX.jumpSound();
  }

  if (!jumpedNow && !player.onGround && player.mantleT <= 0){
    if (isActionDown('jump') && player.vel.y < 2.6){
      const led = findMantle();
      if (led) startMantle(led);
    }
    if (player.mantleT <= 0 && spacePressed && player.jumpsLeft > 0 && canJump){
      player.jumpsLeft--;
      player.vel.y = DOUBLE_JUMP_V;
      SFX.jumpSound();
      player.shake = Math.min(1.2, player.shake + 0.10);
    }
  }

  player.vel.y += GRAVITY * dt;
  if (player.vel.y < -46) player.vel.y = -46;

  if (player.mantleT > 0){
    player.mantleT += dt;
    const k  = clamp(player.mantleT / player.mantleDur, 0, 1);
    const ku = easeOutCubic(clamp(k * 1.42, 0, 1));
    const kf = easeInOutCubic(clamp((k - 0.30) / 0.70, 0, 1));
    player.pos.y = lerp(player.mantleFrom.y, player.mantleTo.y, ku);
    player.pos.x = lerp(player.mantleFrom.x, player.mantleTo.x, kf);
    player.pos.z = lerp(player.mantleFrom.z, player.mantleTo.z, kf);
    player.vel.set(0, 0, 0);
    player.mantleTilt = Math.sin(k * PI) * 0.085;
    if (k >= 1){
      player.mantleT = 0;
      player.mantleTilt = 0;
      player.onGround = true;
      player.jumpsLeft = 1;
      invalidateGroundCache();
      SFX.footstep(0.7, 0);
    } else player.onGround = false;
  } else {
    moveSlide(player.pos, player.vel.x * dt, player.vel.z * dt, P_RADIUS, player.height);
    player.pos.x = clamp(player.pos.x, -HALF + 0.8, HALF - 0.8);
    player.pos.z = clamp(player.pos.z, -HALF + 0.8, HALF - 0.8);

    const prevVy = player.vel.y;
    const prevY  = player.pos.y;
    player.pos.y += player.vel.y * dt;

    if (player.vel.y > 0){
      const ceil = ceilingAt(player.pos.x, player.pos.z, player.pos.y + player.height);
      if (player.pos.y + player.height > ceil){
        player.pos.y = ceil - player.height - 0.01;
        player.vel.y = 0;
      }
    }

    const step = (player.onGround && player.vel.y <= 0) ? 0.62 : 0.0;
    const probeTop = Math.max(prevY, player.pos.y) + step;
    const gy = groundAt(player.pos.x, player.pos.z, probeTop);
    const floorY = gy === null ? 0 : gy;

    if (player.pos.y <= floorY + 0.02){
      /* ★ 落地锁定：只在"从空中落到地面"的那一帧触发，
         站/走在平地上不会每帧刷新计时器。 */
      if (!player.onGround){
        player.landLockT = 0.5;

        if (prevVy < -3){
          const f2 = clamp(-prevVy / 16, 0, 1);
          player.landShake = f2 * 0.9;
          player.shake = Math.min(1.5, player.shake + f2 * 0.55);
          SFX.landSound(f2);
        }
      }
      player.pos.y = floorY;
      player.vel.y = 0;
      player.onGround = true;
    } else {
      player.onGround = false;
    }
  }

  {
    const y0 = player.pos.y + 0.30;
    const y1 = player.pos.y + player.height - 0.05;
    if (blocked(player.pos.x, player.pos.z, y0, y1, P_RADIUS))
      depenetrate(player.pos, P_RADIUS, y0, y1);
  }

  /* ---- 头部摆动 + 脚步 ---- */
  const hSpeed = Math.hypot(player.vel.x, player.vel.z);
  const moving = hSpeed > 0.6 && player.onGround;
  player.bobAmp = damp(player.bobAmp,
                       moving ? clamp(hSpeed / WALK_SPEED, 0, 1.5) : 0, 9, dt);

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

  /* ---- 相机 ---- */
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
    player.pitch + player.recoilPitch - player.landShake * 0.10 -
      (player.mantleTilt || 0) + sY * 0.6 * steady + scopeSwayY,
    player.yaw + player.recoilYaw + scopeSwayX,
    (bobR + sR) * steady +
      ((keys['KeyA'] ? 0.014 : 0) - (keys['KeyD'] ? 0.014 : 0)) * steady
  );

  /* ---- FOV ---- */
  const hipFov = BASE_FOV +
    (player.sprint && hSpeed > 4.5 ? 7.5 : 0) +
    clamp(hSpeed - 5, 0, 3) * 0.6;
  fovCur = damp(fovCur, hipFov, 7, dt);

  player.fovKick = damp(player.fovKick, 0, 13, dt);
  const fovNow = lerp(fovCur, wpn.adsFov, player.adsEase) +
                 player.fovKick * (1 - player.adsEase * 0.75);
  if (Math.abs(camera.fov - fovNow) > 0.005){
    camera.fov = fovNow;
    camera.updateProjectionMatrix();
  }
  sensScale = lerp(1,
    clamp(Math.tan(wpn.adsFov * PI / 360) / Math.tan(BASE_FOV * PI / 360), 0.18, 1),
    player.adsEase);

  /* ---- 武器散布恢复 ---- */
  const w = WEAPONS[player.weapon];
  w.spread = Math.max(w.spreadBase, w.spread - w.spreadRecover * dt);

  /* ---- 开火 ---- */
  player.fireCooldown -= dt;
  player.burstIdle += dt;
  if (player.burstIdle > 0.32) player.burstCount = 0;
  player.clickBuf = Math.max(0, player.clickBuf - dt);

  if (!player.dead && (player.triggerHeld || player.clickBuf > 0)){
    if (w.auto && !w.semi){
      if (fireWeapon()) player.clickBuf = 0;
    } else if (player.triggerReleased){
      if (fireWeapon()) player.clickBuf = 0;
    }
  }

  /* ---- 换弹 ---- */
  if (player.reloadT > 0){
    const before = player.reloadT;
    player.reloadT -= dt;
    const total = w.reloadTime;
    if (before / total > 0.62 && player.reloadT / total <= 0.62) SFX.magIn();
    if (before / total > 0.22 && player.reloadT / total <= 0.22) SFX.boltClick();
    if (player.reloadT <= 0){
      player.reloadT = 0;
      finishReload();
    }
  }

  /* ---- 泵动 ---- */
  if (player.pumpT > 0){
    player.pumpT -= dt;
    const w2 = WEAPONS[1];
    const k = 1 - player.pumpT / w2.pumpTime;
    if (!player.pumpEjected && k > 0.42){
      player.pumpEjected = true;
      SFX.pumpSound(true);
      camera.getWorldDirection(_fwd);
      _rgt.crossVectors(_fwd, _up).normalize();
      const ejPos = camera.position.clone()
        .addScaledVector(_fwd, 0.30).addScaledVector(_rgt, 0.22);
      ejPos.y -= 0.06;
      ejectShell(ejPos, _rgt.clone().addScaledVector(_fwd, 0.1), true);
    }
    if (player.pumpT <= 0){
      player.pumpT = 0;
      SFX.pumpSound(false);
    }
  }

  /* ---- 拉栓 ---- */
  if (player.boltT > 0){
    const wS = WEAPONS[3];
    player.boltT -= dt;
    const k = 1 - player.boltT / wS.boltTime;
    if (player.boltPhase === 0 && k > 0.30){
      player.boltPhase = 1;
      camera.getWorldDirection(_fwd);
      _rgt.crossVectors(_fwd, _up).normalize();
      const ejPos = camera.position.clone()
        .addScaledVector(_fwd, 0.20).addScaledVector(_rgt, 0.20);
      ejPos.y -= 0.04;
      ejectShell(ejPos, _rgt.clone().addScaledVector(_fwd, 0.05), true);
    }
    if (player.boltPhase === 1 && k > 0.60){
      player.boltPhase = 2;
      SFX.boltCycle(1);
    }
    if (player.boltT <= 0){
      player.boltT = 0;
      player.boltPhase = 3;
    }
  }

  /* ---- 换枪 ---- */
  if (player.switching > 0){
    const before = player.switching;
    player.switching -= dt;

    if (player.switchTo >= 0 && before > 0 &&
        player.switching <= WEAPONS[player.switchTo].drawTime){
      WEAPONS[player.weapon].vm.group.visible = false;
      player.weapon = player.switchTo;
      player.switchTo = -1;
      WEAPONS[player.weapon].vm.group.visible = true;
      if (typeof updateAmmoUI === 'function') updateAmmoUI();
    }

    if (player.switching <= 0){
      player.switching = 0;
      if (player.pendingWpn >= 0){
        const q = player.pendingWpn;
        player.pendingWpn = -1;
        if (q !== player.weapon) switchWeapon(q);
      }
    }
  }
}