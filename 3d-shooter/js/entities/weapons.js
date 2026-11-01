/* =========================================================================
   weapons.js
   武器数据表 + 手持模型装配（VM rig）

   依赖：utils.js（sRGB/linearizeMats）、renderer.js（vmScene / VM_FOV）、
         weapon_models.js（buildRifle 等 / texelize / GUN_PER_M）
   暴露：WEAPONS, vmRoot, vmSway, vmRecoil, VM_SCALE, WICONS
   ========================================================================= */
"use strict";

/* --------------------------------------------------------------------------
   武器数据

   M4 / 霰弹枪 / 手枪 / 狙击枪。射速、散布、后坐、开镜倍率、伤害衰减都
   在这里；商店的"伤害 +10%"是全局倍率，不改动这些基础值。

   每一把武器通过 `build` 指向 weapon_models.js 里的构建函数。
   -------------------------------------------------------------------------- */
const WEAPONS = [
  {
    id: 'rifle', name: 'M4 CARBINE', sound: 'rifle',
    magSize: 30, reserve: 210, maxReserve: 210,
    damage: 31, headMult: 2.0,
    rpm: 760, auto: true, semiToggle: true, pellets: 1,
    spreadBase: 0.0055, spreadMax: 0.052, spreadShot: 0.0058, spreadRecover: 0.075,
    moveSpread: 0.010, airSpread: 0.020, crouchMult: 0.62,
    recoilKick: 0.035, recoilRot: 0.055,
    camPitch: 0.0125, camYaw: 0.0048, fovKick: 0.55,
    reloadTime: 2.15, drawTime: 0.55, shakeAmt: 0.16, range: 140,
    falloffStart: 45, falloffRange: 60, falloffMin: 0.55,
    /* 2.2 倍。此前 55（=1.47 倍）在实际交战距离上几乎看不出变化 ——
       一个 25m 外的敌人在瞄具护罩后面藏得严严实实。 */
    adsFov: 38, adsSpread: 0.42, adsTime: 0.20, noise: 36,
    shellBig: false, build: buildRifle
  },
  {
    id: 'shotgun', name: 'KS-12 PUMP', sound: 'shotgun',
    magSize: 8, reserve: 48, maxReserve: 48,
    damage: 15, headMult: 1.7,
    rpm: 999, auto: false, semiToggle: false, pellets: 9, pumpTime: 0.62,
    spreadBase: 0.052, spreadMax: 0.075, spreadShot: 0.006, spreadRecover: 0.12,
    moveSpread: 0.012, airSpread: 0.022, crouchMult: 0.80,
    recoilKick: 0.115, recoilRot: 0.165,
    camPitch: 0.040, camYaw: 0.009, fovKick: 2.6,
    reloadTime: 2.75, drawTime: 0.72, shakeAmt: 0.68, range: 60,
    falloffStart: 7, falloffRange: 16, falloffMin: 0.20,
    adsFov: 60, adsSpread: 0.72, adsTime: 0.20, noise: 40,
    shellBig: true, build: buildShotgun
  },
  {
    id: 'pistol', name: 'P-9 SIDEARM', sound: 'pistol',
    magSize: 15, reserve: 90, maxReserve: 90,
    damage: 35, headMult: 2.0,
    rpm: 430, auto: false, semiToggle: false, pellets: 1,
    spreadBase: 0.0028, spreadMax: 0.030, spreadShot: 0.0060, spreadRecover: 0.090,
    moveSpread: 0.008, airSpread: 0.016, crouchMult: 0.55,
    recoilKick: 0.048, recoilRot: 0.090,
    camPitch: 0.021, camYaw: 0.006, fovKick: 0.85,
    reloadTime: 1.55, drawTime: 0.30, shakeAmt: 0.24, range: 110,
    falloffStart: 30, falloffRange: 45, falloffMin: 0.55,
    adsFov: 50, adsSpread: 0.34, adsTime: 0.20, noise: 26,
    shellBig: false, build: buildPistol
  },
  {
    id: 'sniper', name: 'SR-7 LONGBOW', sound: 'sniper',
    magSize: 5, reserve: 25, maxReserve: 25,
    damage: 125, headMult: 2.0,
    rpm: 999, auto: false, semiToggle: false, pellets: 1, boltTime: 1.5,
    spreadBase: 0.030, spreadMax: 0.070, spreadShot: 0.010, spreadRecover: 0.10,
    moveSpread: 0.022, airSpread: 0.045, crouchMult: 0.55,
    recoilKick: 0.175, recoilRot: 0.20,
    camPitch: 0.055, camYaw: 0.010, fovKick: 2.2,
    reloadTime: 3.10, drawTime: 0.85, shakeAmt: 0.80, range: 220,
    falloffStart: 220, falloffRange: 1, falloffMin: 1.0,
    adsFov: 15, adsSpread: 0.012, adsTime: 0.20, scope: true, noise: 60,
    shellBig: true, build: buildSniper
  }
];

/* --------------------------------------------------------------------------
   手持模型 rig

   三层嵌套：
     vmRoot   相机空间锚点 —— 恒定不动
     vmSway   摆动 / 走路 / 姿态 —— 被 updateViewmodel 每帧写入
     vmRecoil 后坐弹簧 —— 独立的弹簧-阻尼系统
   -------------------------------------------------------------------------- */
const vmRoot   = new THREE.Group();
const vmSway   = new THREE.Group();
const vmRecoil = new THREE.Group();
vmScene.add(vmRoot);
vmRoot.add(vmSway);
vmSway.add(vmRecoil);

/* 模型是按 1:1 缩放搭的；在这里整体缩小，可以在不重调每一个部件偏移量的
   前提下给屏幕中心让出空间。ADS 姿态声明在模型空间，会跟着一起缩。 */
const VM_SCALE = 0.86;

WEAPONS.forEach(w => {
  const vm = w.build();
  w.vm = vm;
  texelize(vm.group, GUN_PER_M);
  vm.group.visible = false;
  vm.group.scale.setScalar(VM_SCALE);
  vm.adsPos.x *= VM_SCALE;
  vm.adsPos.y *= VM_SCALE;
  vmRecoil.add(vm.group);

  /* 运行时状态 */
  w.mag = w.magSize;
  w.res = w.reserve;
  w.semi = false;
  w.spread = w.spreadBase;
});

/* --------------------------------------------------------------------------
   武器 HUD 图标 —— 内联 SVG 剪影，避免加载外部图标
   -------------------------------------------------------------------------- */
const WICONS = [
  /* M4 卡宾枪 */
  `<svg width="72" height="20" viewBox="0 0 72 20" fill="none"><path d="M2 8h30l3-3h10v3h23v4H45l-2 3H33l-2-3h-7l-3 7h-5l2-7H2z" fill="#dfe6ec" opacity=".85"/><rect x="20" y="12" width="6" height="7" fill="#dfe6ec" opacity=".85"/></svg>`,
  /* KS-12 */
  `<svg width="72" height="20" viewBox="0 0 72 20" fill="none"><path d="M2 9h20l4-4h8v4h36v3H34v3h-9l-3 6h-5l2-6H2z" fill="#dfe6ec" opacity=".85"/><rect x="34" y="12" width="16" height="3" fill="#dfe6ec" opacity=".85"/></svg>`,
  /* P-9 */
  `<svg width="72" height="20" viewBox="0 0 72 20" fill="none"><path d="M26 5h30v6H44l-2 3h-6l-3 8h-6l3-8h-4z" fill="#dfe6ec" opacity=".85"/></svg>`,
  /* SR-7 */
  `<svg width="72" height="20" viewBox="0 0 72 20" fill="none"><path d="M2 9h34l4-3h10v3h20v3H48l-2 3h-8l-3 6h-5l2-6H2z" fill="#dfe6ec" opacity=".85"/><rect x="22" y="2" width="22" height="4" rx="2" fill="#dfe6ec" opacity=".85"/><rect x="26" y="6" width="3" height="3" fill="#dfe6ec" opacity=".6"/><rect x="37" y="6" width="3" height="3" fill="#dfe6ec" opacity=".6"/></svg>`
];