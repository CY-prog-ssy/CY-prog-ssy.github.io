/* =========================================================================
   vm_anim.js
   手持模型动画 —— 呼吸摆动 / 走路摆动 / 后坐 / 开镜 / 换弹 / 拉栓

   依赖：utils.js / renderer.js / weapons.js / shooting.js（vmRec）/ effects.js
   暴露：updateViewmodel
   ========================================================================= */
"use strict";

/* --------------------------------------------------------------------------
   本地临时向量

   原单文件版本里 _tmpV 是全局的；拆分成模块后必须在这里自己声明 ——
   否则 `_tmpV is not defined` 会在每一帧的开火闪烁代码里抛出。
   -------------------------------------------------------------------------- */
const _tmpV = new THREE.Vector3();

/* 摆动状态：跨帧记忆 */
let swayX = 0, swayY = 0;
let swayLagX = 0, swayLagY = 0;

/* --------------------------------------------------------------------------
   每帧调用
     dt    帧间隔（秒）
     mdx   本帧鼠标横向位移（像素）
     mdy   本帧鼠标纵向位移
   -------------------------------------------------------------------------- */
function updateViewmodel(dt, mdx, mdy){
  const w = WEAPONS[player.weapon];
  const vm = w.vm;

  /* -----------------------------------------------------------------------
     鼠标摆动

     鼠标移动时手持模型延迟跟手，读起来像有重量。
     摆动量被 clamp 住，否则高灵敏度玩家一甩鼠标枪就飞出屏幕。 */
  swayX = damp(swayX, clamp(-mdx * 0.0016, -0.055, 0.055), 12, dt);
  swayY = damp(swayY, clamp( mdy * 0.0016, -0.045, 0.045), 12, dt);
  swayLagX = damp(swayLagX, swayX, 9, dt);
  swayLagY = damp(swayLagY, swayY, 9, dt);

  /* -----------------------------------------------------------------------
     后坐弹簧

     K = 210（弹性系数），D = 19（阻尼）。
     由 shooting.js 的 vmKick() 给速度一个冲量，这里做弹簧-阻尼积分。
     独立于主循环的弹簧系统，因为后坐的手感由这两个常数决定，
     和帧率无关。 */
  const K = 210, D = 19;
  vmRec.vz  += (-vmRec.pz * K) * dt; vmRec.vz  -= vmRec.vz  * D * dt; vmRec.pz  += vmRec.vz  * dt;
  vmRec.vy  += (-vmRec.py * K) * dt; vmRec.vy  -= vmRec.vy  * D * dt; vmRec.py  += vmRec.vy  * dt;
  vmRec.vrx += (-vmRec.rx * K) * dt; vmRec.vrx -= vmRec.vrx * D * dt; vmRec.rx  += vmRec.vrx * dt;
  vmRec.vry += (-vmRec.ry * K) * dt; vmRec.vry -= vmRec.vry * D * dt; vmRec.ry  += vmRec.vry * dt;
  vmRec.vrz += (-vmRec.rz * K) * dt; vmRec.vrz -= vmRec.vrz * D * dt; vmRec.rz  += vmRec.vrz * dt;

  /* -----------------------------------------------------------------------
     基础姿态 —— 从武器的 basePos / baseRot 出发 */
  let px = vm.basePos.x, py = vm.basePos.y, pz = vm.basePos.z;
  let rx = vm.baseRot.x, ry = vm.baseRot.y, rz = vm.baseRot.z;

  /* -----------------------------------------------------------------------
     走路摆动 —— 与脚步同步 */
  const amp = player.bobAmp;
  px += Math.sin(player.bob) * 0.022 * amp;
  py += (Math.abs(Math.cos(player.bob)) - 0.5) * 0.020 * amp;
  rz += Math.sin(player.bob) * 0.030 * amp;
  rx += Math.cos(player.bob * 2) * 0.014 * amp;

  /* -----------------------------------------------------------------------
     空中漂浮 —— 跳跃/下落时枪随身体起伏 */
  if (!player.onGround){
    py -= clamp(player.vel.y * 0.006, -0.05, 0.05);
    rx += clamp(player.vel.y * 0.010, -0.09, 0.09);
  }

  /* -----------------------------------------------------------------------
     冲刺：枪压低并侧倾

     用阻尼过渡到目标值，玩家松开 Shift 后姿态平滑回到基础。 */
  const sprintK = damp(vm._sprintK || 0,
    (player.sprint && player.bobAmp > 0.6) ? 1 : 0, 9, dt);
  vm._sprintK = sprintK;
  px += sprintK * 0.045; py -= sprintK * 0.085; pz += sprintK * 0.055;
  rx += sprintK * 0.30;  ry -= sprintK * 0.55;  rz += sprintK * 0.42;

  /* -----------------------------------------------------------------------
     蹲下：稍微往里收 */
  const crouchK = damp(vm._crouchK || 0, player.crouch ? 1 : 0, 10, dt);
  vm._crouchK = crouchK;
  px -= crouchK * 0.018; py += crouchK * 0.012; pz += crouchK * 0.020;

  /* -----------------------------------------------------------------------
     换弹：下摆到画面外再抬回来 */
  if (player.reloadT > 0){
    const total = w.reloadTime;
    const t = 1 - player.reloadT / total;

    /* 三阶段：进场 / 保持 / 回位 */
    const dip = t < 0.22 ? easeOutCubic(t / 0.22)
              : t < 0.72 ? 1
              : 1 - easeInOutCubic((t - 0.72) / 0.28);

    py -= dip * 0.34;
    pz += dip * 0.14;
    px += dip * 0.05;
    rx += dip * 0.85;
    rz += dip * 0.55;
    ry -= dip * 0.30;

    /* 中间插一段换弹匣抖动 */
    if (t > 0.25 && t < 0.70){
      const j = Math.sin((t - 0.25) * 46);
      py += j * 0.010;
      rx += j * 0.030;
    }
  }

  /* -----------------------------------------------------------------------
     切枪：收起 / 取出 */
  if (player.switching > 0){
    const w2 = WEAPONS[player.switchTo >= 0 ? player.switchTo : player.weapon];
    let k;
    if (player.switchTo >= 0){
      /* 收起：0 → 1 */
      k = 1 - clamp((player.switching - w2.drawTime) / 0.22, 0, 1);
    } else {
      /* 取出 */
      k = clamp(player.switching / w.drawTime, 0, 1);
    }
    const e2 = easeOutCubic(k);
    py -= e2 * 0.40;
    pz += e2 * 0.10;
    rx += e2 * 1.05;
    rz += e2 * 0.45;
  }

  /* -----------------------------------------------------------------------
     泵动：护木前后滑动 */
  if (vm.forend){
    let slide = 0;
    if (player.pumpT > 0){
      const t = 1 - player.pumpT / w.pumpTime;
      slide = t < 0.45 ? easeOutCubic(t / 0.45)
                       : 1 - easeOutCubic((t - 0.45) / 0.55);
    }
    vm.forend.position.z = -0.34 + slide * 0.105;
    pz += slide * 0.028;
    rx -= slide * 0.05;
  }

  /* -----------------------------------------------------------------------
     手枪套筒循环：开火后一瞬间往后弹 */
  if (vm.slide){
    const t = clamp(flashT / flashDur, 0, 1);
    vm.slide.position.z = t * 0.045;
  }

  /* -----------------------------------------------------------------------
     狙击枪拉栓：抬起 / 后拉 / 保持 / 前推 / 闭锁 */
  if (vm.bolt){
    let back = 0, lift = 0;
    if (player.boltT > 0){
      const t = 1 - player.boltT / w.boltTime;
      lift = t < 0.14 ? easeOutCubic(t / 0.14)
           : t > 0.74 ? 1 - easeOutCubic((t - 0.74) / 0.26)
           : 1;
      back = t < 0.14 ? 0
           : t < 0.40 ? easeOutCubic((t - 0.14) / 0.26)
           : t < 0.56 ? 1
           : t < 0.74 ? 1 - easeInOutCubic((t - 0.56) / 0.18)
           : 0;
    }
    vm.bolt.position.z = 0.10 + back * 0.125;
    /* 正的 Z 会把拉机柄抬过机匣上方，从玩家实际看到的左侧视角可见 */
    vm.bolt.rotation.z = lift * 1.20;

    px -= back * 0.012;
    pz += back * 0.022;
    ry -= lift * 0.055;
    rz -= lift * 0.035;
  }

  /* -----------------------------------------------------------------------
     开镜：把瞄具滑到相机轴上

     用 ease 混合过渡到 adsPos / adsRot。
     由于瞄具在相机的 -Z 轴上，沿这个轴滑动不会破坏对准 ——
     它只是用广角鼓胀换长焦压缩。 */
  const ae = player.adsEase;

  if (ae > 0.0005 && vm.adsPos){
    px = lerp(px, vm.adsPos.x, ae);
    py = lerp(py, vm.adsPos.y, ae);
    pz = lerp(pz, vm.adsPos.z, ae);
    rx = lerp(rx, vm.adsRot.x, ae);
    ry = lerp(ry, vm.adsRot.y, ae);
    rz = lerp(rz, vm.adsRot.z, ae);
  }

  /* 眼睛后撤、镜头收窄，同比例。
     瞄具在相机的 -Z 轴上，所以沿那个轴滑动不会破坏对准 ——
     它只是用广角鼓胀换长焦压缩。 */
  {
    const ref = vm.adsRef || 0.68;
    const dolly = VM_ADS_DOLLY * ae;
    const f = Math.atan(Math.tan(VM_FOV * PI / 360) * ref / (ref + dolly)) * 360 / PI;
    if (vmCamera.position.z !== dolly || vmCamera.fov !== f){
      vmCamera.position.z = dolly;
      vmCamera.fov = f;
      vmCamera.updateProjectionMatrix();
    }
  }

  /* 开镜时给手持模型补光：瞄具背面是主光照不到的那一面 */
  vmAmb.intensity  = VM_LIGHT_BASE.amb  + 0.24 * ae;
  vmKey.intensity  = VM_LIGHT_BASE.key  + 0.40 * ae;
  vmFill.intensity = VM_LIGHT_BASE.fill + 0.30 * ae;
  vmRim.intensity  = VM_LIGHT_BASE.rim  + 0.16 * ae;

  /* 摆动是破坏瞄准线的元凶，开镜时狠狠压住 */
  const swayK = 1 - 0.88 * ae;

  /* -----------------------------------------------------------------------
     应用变换 */
  vmSway.position.set(
    px + swayLagX * swayK,
    py + swayLagY * swayK,
    pz
  );
  vmSway.rotation.set(
    rx + swayLagY * 1.6 * swayK,
    ry + swayLagX * 2.1 * swayK,
    rz - swayLagX * 1.4 * swayK
  );
  vmRecoil.position.set(0, vmRec.py * 0.5, vmRec.pz);
  vmRecoil.rotation.set(vmRec.rx * 0.6, vmRec.ry * 0.6, vmRec.rz * 0.6);

  /* -----------------------------------------------------------------------
     枪口火光 —— 由 shooting.js 的 flashT 驱动 */
  if (flashT > 0){
    flashT -= dt;
    const k = clamp(flashT / flashDur, 0, 1);

    vm.muzzle.getWorldPosition(_tmpV);
    muzzleSprite.position.copy(_tmpV);
    muzzleGlow.position.copy(_tmpV);

    /* 尺寸对着画面算，不是对着枪算。枪口离 vm 眼约 1.6 单位，
       可见画面在那里只有约 1.2 单位高，所以一个按模型单位缩放的精灵会
       胀开：旧的 0.89 盖住了屏幕高度的四分之三，
       全自动时会把画面下半部变成一张白纸。
       真实的火光大约读到画面高度的六分之一。 */
    const sc = (0.065 + 0.075 * flashPower) * (0.55 + k * 0.8);

    /* 精灵挂在 vmScene 上而不是 vmRoot 上，
       所以把枪藏到镜片后面时它们还会飘在镜片画面中间。
       狙击镜里枪口在一米外、远在光学轴下方 —— 你根本看不到火光，
       所以它跟着武器一起淡出。 */
    const seen = 1 - (w.scope ? clamp((player.adsEase - 0.45) / 0.40, 0, 1) : 0);

    muzzleSprite.scale.set(sc, sc, 1);
    muzzleSprite.material.opacity = k * seen;
    muzzleGlow.scale.set(sc * 1.9, sc * 1.9, 1);
    muzzleGlow.material.opacity = k * 0.62 * seen;

    vmMuzzleLight.position.copy(_tmpV);
    vmMuzzleLight.intensity = k * 9 * flashPower * seen;

    camera.getWorldDirection(_fwd);
    muzzleLight.position.copy(camera.position).addScaledVector(_fwd, 0.8);
    muzzleLight.intensity = k * 11 * flashPower;

    if (flashT <= 0){
      muzzleSprite.material.opacity = 0;
      muzzleGlow.material.opacity = 0;
      vmMuzzleLight.intensity = 0;
      muzzleLight.intensity = 0;
    }
  }
}