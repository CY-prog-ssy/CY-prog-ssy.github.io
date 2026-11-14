/* =========================================================================
   vm_anim.js
   手持模型动画 —— 呼吸摆动 / 走路摆动 / 后坐 / 开镜 / 换弹 / 拉栓
   ========================================================================= */
"use strict";

const _tmpV = new THREE.Vector3();

let swayX = 0, swayY = 0;
let swayLagX = 0, swayLagY = 0;

var vmRec = { pz: 0, py: 0, rx: 0, ry: 0, rz: 0, vz: 0, vy: 0, vrx: 0, vry: 0, vrz: 0 };

// ✅ 枪口持续冒烟状态
var vmSmokeT = 0;       
var vmSmokePower = 0;   

function vmKick(w){
  vmRec.vz  += w.recoilKick * 46;
  vmRec.vy  += w.recoilKick * 13;
  vmRec.vrx -= w.recoilRot * 46;
  vmRec.vry += (Math.random() - 0.5) * w.recoilRot * 24;
  vmRec.vrz += (Math.random() - 0.5) * w.recoilRot * 30;
}

function updateViewmodel(dt, mdx, mdy){
  // ★ 护盾：防止因为其他文件报错导致 WEAPONS 未定义时刷屏
  if (typeof WEAPONS === 'undefined' || !WEAPONS || !WEAPONS[player.weapon]) return;
  const w = WEAPONS[player.weapon];
  const vm = w.vm;

  swayX = damp(swayX, clamp(-mdx * 0.0016, -0.055, 0.055), 12, dt);
  swayY = damp(swayY, clamp( mdy * 0.0016, -0.045, 0.045), 12, dt);
  swayLagX = damp(swayLagX, swayX, 9, dt);
  swayLagY = damp(swayLagY, swayY, 9, dt);

  const K = 210, D = 19;
  vmRec.vz  += (-vmRec.pz * K) * dt; vmRec.vz  -= vmRec.vz  * D * dt; vmRec.pz  += vmRec.vz  * dt;
  vmRec.vy  += (-vmRec.py * K) * dt; vmRec.vy  -= vmRec.vy  * D * dt; vmRec.py  += vmRec.vy  * dt;
  vmRec.vrx += (-vmRec.rx * K) * dt; vmRec.vrx -= vmRec.vrx * D * dt; vmRec.rx  += vmRec.vrx * dt;
  vmRec.vry += (-vmRec.ry * K) * dt; vmRec.vry -= vmRec.vry * D * dt; vmRec.ry  += vmRec.vry * dt;
  vmRec.vrz += (-vmRec.rz * K) * dt; vmRec.vrz -= vmRec.vrz * D * dt; vmRec.rz  += vmRec.vrz * dt;

  let px = vm.basePos.x, py = vm.basePos.y, pz = vm.basePos.z;
  let rx = vm.baseRot.x, ry = vm.baseRot.y, rz = vm.baseRot.z;

  const amp = player.bobAmp;
  px += Math.sin(player.bob) * 0.022 * amp;
  py += (Math.abs(Math.cos(player.bob)) - 0.5) * 0.020 * amp;
  rz += Math.sin(player.bob) * 0.030 * amp;
  rx += Math.cos(player.bob * 2) * 0.014 * amp;

  if (!player.onGround){
    py -= clamp(player.vel.y * 0.006, -0.05, 0.05);
    rx += clamp(player.vel.y * 0.010, -0.09, 0.09);
  }

  // ✅ 修复：奔跑姿态（往左下方收枪，枪口向左）
  const sprintK = damp(vm._sprintK || 0,
    (player.sprint && player.bobAmp > 0.6) ? 1 : 0, 9, dt);
  vm._sprintK = sprintK;
  
  px -= sprintK * 0.10;  // 往屏幕左侧平移
  py -= sprintK * 0.12;  // 往下压低
  pz += sprintK * 0.02;  // 略微贴近身体
  rx += sprintK * 0.28;  // 枪口下压
  ry += sprintK * 0.65;  // 枪管向左旋转
  rz += sprintK * 0.35;  // 枪身向左倾斜

  const crouchK = damp(vm._crouchK || 0, player.crouch ? 1 : 0, 10, dt);
  vm._crouchK = crouchK;
  px -= crouchK * 0.018; py += crouchK * 0.012; pz += crouchK * 0.020;

  if (player.reloadT > 0){
    const total = w.reloadTime;
    const t = 1 - player.reloadT / total;

    const dip = t < 0.22 ? easeOutCubic(t / 0.22)
              : t < 0.72 ? 1
              : 1 - easeInOutCubic((t - 0.72) / 0.28);

    py -= dip * 0.34;
    pz += dip * 0.14;
    px += dip * 0.05;
    rx += dip * 0.85;
    rz += dip * 0.55;
    ry -= dip * 0.30;

    if (t > 0.25 && t < 0.70){
      const j = Math.sin((t - 0.25) * 46);
      py += j * 0.010;
      rx += j * 0.030;
    }
  }

  if (player.switching > 0){
    const w2 = WEAPONS[player.switchTo >= 0 ? player.switchTo : player.weapon];
    let k;
    if (player.switchTo >= 0){
      k = 1 - clamp((player.switching - w2.drawTime) / 0.22, 0, 1);
    } else {
      k = clamp(player.switching / w.drawTime, 0, 1);
    }
    const e2 = easeOutCubic(k);
    py -= e2 * 0.40;
    pz += e2 * 0.10;
    rx += e2 * 1.05;
    rz += e2 * 0.45;
  }

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

  if (vm.slide){
    const t = clamp(flashT / flashDur, 0, 1);
    vm.slide.position.z = t * 0.045;
  }

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
    vm.bolt.rotation.z = lift * 1.20;

    px -= back * 0.012;
    pz += back * 0.022;
    ry -= lift * 0.055;
    rz -= lift * 0.035;
  }

  const ae = player.adsEase;

  if (ae > 0.0005 && vm.adsPos){
    const adsZClose = vm.adsPos.z * 0.82;
    px = lerp(px, vm.adsPos.x, ae);
    py = lerp(py, vm.adsPos.y, ae);
    pz = lerp(pz, adsZClose, ae);
    rx = lerp(rx, vm.adsRot.x, ae);
    ry = lerp(ry, vm.adsRot.y, ae);
    rz = lerp(rz, vm.adsRot.z, ae);
  }

  let targetVMFov = VM_FOV;
  if (!w.scope) {
    targetVMFov = lerp(VM_FOV, 34, ae); 
  } else {
    targetVMFov = lerp(VM_FOV, 15, ae);
  }
  
  if (Math.abs(vmCamera.fov - targetVMFov) > 0.01 || vmCamera.position.z !== 0){
    vmCamera.fov = targetVMFov;
    vmCamera.position.z = 0; 
    vmCamera.updateProjectionMatrix();
  }

  vmAmb.intensity  = VM_LIGHT_BASE.amb  + 0.24 * ae;
  vmKey.intensity  = VM_LIGHT_BASE.key  + 0.40 * ae;
  vmFill.intensity = VM_LIGHT_BASE.fill + 0.30 * ae;
  vmRim.intensity  = VM_LIGHT_BASE.rim  + 0.16 * ae;

  const swayK = 1 - 0.88 * ae;

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

  if (flashT > 0){
    flashT -= dt;
    const k = clamp(flashT / flashDur, 0, 1);

    vm.muzzle.getWorldPosition(_tmpV);
    muzzleSprite.position.copy(_tmpV);
    muzzleGlow.position.copy(_tmpV);

    let sc = (0.065 + 0.075 * flashPower) * (0.55 + k * 0.8);
    
    if (w.ammoType === 'super_ap') sc *= 1.6;
    else if (w.id === 'barrett') sc *= 1.3;

    const seen = 1 - (w.scope ? clamp((player.adsEase - 0.45) / 0.40, 0, 1) : 0);
    const flashMul = w.suppressed ? 0 : 1;

    if (w.ammoType === 'super_ap') {
      muzzleSprite.material.color.setHex(0xffd700); 
      muzzleGlow.material.color.setHex(0xffaa00);
    } else if (w.ammoType === 'bmg50') {
      muzzleSprite.material.color.setHex(0xff3b30); 
      muzzleGlow.material.color.setHex(0xff5500);
    } else if (w.ammoType === 'magnum') {
      muzzleSprite.material.color.setHex(0xc98cff); 
      muzzleGlow.material.color.setHex(0xaa55ff);
    } else {
      muzzleSprite.material.color.setHex(0xffffff); 
      muzzleGlow.material.color.setHex(0xffc06a);
    }

    muzzleSprite.scale.set(sc, sc, 1);
    muzzleSprite.material.opacity = k * seen * flashMul;
    muzzleGlow.scale.set(sc * 1.9, sc * 1.9, 1);
    muzzleGlow.material.opacity = k * 0.62 * seen * flashMul;

    vmMuzzleLight.position.copy(_tmpV);
    vmMuzzleLight.intensity = k * 9 * flashPower * seen * flashMul;

    camera.getWorldDirection(_fwd);
    muzzleLight.position.copy(camera.position).addScaledVector(_fwd, 0.8);
    muzzleLight.intensity = k * 11 * flashPower * flashMul;

    if (flashT <= 0){
      muzzleSprite.material.opacity = 0;
      muzzleGlow.material.opacity = 0;
      vmMuzzleLight.intensity = 0;
      muzzleLight.intensity = 0;
    }
  }

  // ✅ 枪口白烟持续特效处理
  if (vmSmokeT > 0) {
    vmSmokeT -= dt;
    if (vmSmokeT > 0) {
      vm.muzzle.getWorldPosition(_tmpV);
      
      let count = 0;
      if (vmSmokePower === 1) count = Math.random() < 0.3 ? 1 : 0; 
      else if (vmSmokePower === 2) count = Math.random() < 0.55 ? 1 : 0; 
      else if (vmSmokePower === 3) count = Math.random() < 0.8 ? 1 : 0; 
      else if (vmSmokePower === 4) count = Math.random() < 0.5 ? 2 : 1; 
      
      for (let i = 0; i < count; i++) {
        spawnParticle(PS_SOFT, 
          _tmpV.x + rand(-0.02, 0.02), 
          _tmpV.y + rand(-0.02, 0.02), 
          _tmpV.z + rand(-0.02, 0.02),
          _fwd.x * rand(0.1, 0.4) + rand(-0.1, 0.1), 
          rand(0.2, 0.5), 
          _fwd.z * rand(0.1, 0.4) + rand(-0.1, 0.1),
          { 
            color: [0.85, 0.85, 0.85], 
            size: 0.04 + vmSmokePower * 0.02, 
            grow: 0.3 + vmSmokePower * 0.1, 
            life: 0.8 + vmSmokePower * 0.3, 
            drag: 1.2, 
            grav: 0.2, 
            alpha: 0.25 + vmSmokePower * 0.08 
          }
        );
      }
    }
  }
}