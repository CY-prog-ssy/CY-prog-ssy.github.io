/* =========================================================================
   weapons.js
   ========================================================================= */
"use strict";

const WEAPONS = [
  {
    id: 'rifle', name: 'M4 CARBINE', sound: 'rifle',
    magSize: 30, reserve: 210, maxReserve: 210,
    damage: 31, headMult: 2.0,
    rpm: 760, auto: true, semiToggle: true, pellets: 1,
    spreadBase: 0.0055, spreadMax: 0.052, spreadShot: 0.0058, spreadRecover: 0.075,
    moveSpread: 0.010, airSpread: 0.020, crouchMult: 0.62,
    recoilKick: 0.04025, recoilRot: 0.06325,
    camPitch: 0.0144, camYaw: 0.00552, fovKick: 0.55,
    reloadTime: 2.15, drawTime: 0.55, shakeAmt: 0.16, range: 140,
    falloffStart: 45, falloffRange: 60, falloffMin: 0.55,
    adsFov: 38, adsSpread: 0.42, adsTime: 0.42, noise: 36,
    shellBig: false, build: buildRifle
  },
  {
    id: 'shotgun', name: 'KS-12 PUMP', sound: 'shotgun',
    magSize: 8, reserve: 48, maxReserve: 48,
    damage: 15, headMult: 1.7,
    rpm: 999, auto: false, semiToggle: false, pellets: 9, pumpTime: 0.62,
    spreadBase: 0.052, spreadMax: 0.075, spreadShot: 0.006, spreadRecover: 0.12,
    moveSpread: 0.012, airSpread: 0.022, crouchMult: 0.80,
    recoilKick: 0.14375, recoilRot: 0.20625,
    camPitch: 0.05, camYaw: 0.01125, fovKick: 2.6,
    reloadTime: 2.75, drawTime: 0.72, shakeAmt: 0.68, range: 60,
    falloffStart: 7, falloffRange: 16, falloffMin: 0.20,
    adsFov: 60, adsSpread: 0.72, adsTime: 0.42, noise: 40,
    shellBig: true, build: buildShotgun
  },
  
    {
  id: 'pistol', name: 'P-9 SIDEARM', sound: 'pistol',
  magSize: 15, reserve: 90, maxReserve: 90,
  damage: 35, headMult: 2.0,
  moveSpeedMult: 1.15,
  rpm: 430, auto: false, semiToggle: false, pellets: 1,
  spreadBase: 0.0028, spreadMax: 0.030, spreadShot: 0.0060, spreadRecover: 0.090,
  moveSpread: 0.008, airSpread: 0.016, crouchMult: 0.55,
  recoilKick: 0.0552, recoilRot: 0.1035,
  camPitch: 0.02415, camYaw: 0.0069, fovKick: 0.85,
  reloadTime: 1.55, drawTime: 0.30, shakeAmt: 0.24, range: 110,
  falloffStart: 30, falloffRange: 45, falloffMin: 0.55,
  adsFov: 50, adsSpread: 0.34, adsTime: 0.40, noise: 26,
  shellBig: false, build: buildPistol
},
  {
    id: 'sniper', name: 'SR-7 LONGBOW', sound: 'sniper',
    magSize: 5, reserve: 25, maxReserve: 25,
    damage: 125, headMult: 2.0,
    rpm: 999, auto: false, semiToggle: false, pellets: 1, boltTime: 1.5,
    spreadBase: 0.030, spreadMax: 0.070, spreadShot: 0.010, spreadRecover: 0.10,
    moveSpread: 0.022, airSpread: 0.045, crouchMult: 0.55,
    recoilKick: 0.21875, recoilRot: 0.25,
    camPitch: 0.06875, camYaw: 0.0125, fovKick: 2.2,
    reloadTime: 3.10, drawTime: 0.85, shakeAmt: 0.80, range: 220,
    falloffStart: 220, falloffRange: 1, falloffMin: 1.0,
    adsFov: 9, adsSpread: 0.012, adsTime: 0.52, scope: true, noise: 60,
    shellBig: true, build: buildSniper
  },
  {
    id: 'barrett', name: '.50 CAL BARRETT', sound: 'sniper',
    magSize: 5, reserve: 15, maxReserve: 15, // 只有15发备弹
    damage: 350, headMult: 2.5, // 基础伤害巨高
    rpm: 60, auto: false, semiToggle: false, pellets: 1, boltTime: 1.2, // 极长的后摇
    spreadBase: 0.01, spreadMax: 0.20, spreadShot: 0.02, spreadRecover: 0.05,
    moveSpread: 0.15, airSpread: 0.35, crouchMult: 0.50, // 极恐怖的移动腰射惩罚
    recoilKick: 0.65, recoilRot: 0.85,
    camPitch: 0.15, camYaw: 0.05, fovKick: 5.0,
    reloadTime: 4.5, drawTime: 1.2, shakeAmt: 1.5, range: 250,
    falloffStart: 250, falloffRange: 1, falloffMin: 1.0,
    adsFov: 8, adsSpread: 0.005, adsTime: 0.52, scope: true, noise: 80,
    shellBig: true, build: buildBarrett
  }
];

const vmRoot   = new THREE.Group();
const vmSway   = new THREE.Group();
const vmRecoil = new THREE.Group();
vmScene.add(vmRoot);
vmRoot.add(vmSway);
vmSway.add(vmRecoil);

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

  w.mag = w.magSize;
  w.res = w.reserve;
  w.semi = false;
  w.spread = w.spreadBase;
});

const WICONS = [
  `<svg width="72" height="20" viewBox="0 0 72 20" fill="none"><path d="M2 8h30l3-3h10v3h23v4H45l-2 3H33l-2-3h-7l-3 7h-5l2-7H2z" fill="#dfe6ec" opacity=".85"/><rect x="20" y="12" width="6" height="7" fill="#dfe6ec" opacity=".85"/></svg>`,
  `<svg width="72" height="20" viewBox="0 0 72 20" fill="none"><path d="M2 9h20l4-4h8v4h36v3H34v3h-9l-3 6h-5l2-6H2z" fill="#dfe6ec" opacity=".85"/><rect x="34" y="12" width="16" height="3" fill="#dfe6ec" opacity=".85"/></svg>`,
  `<svg width="72" height="20" viewBox="0 0 72 20" fill="none"><path d="M26 5h30v6H44l-2 3h-6l-3 8h-6l3-8h-4z" fill="#dfe6ec" opacity=".85"/></svg>`,
  `<svg width="72" height="20" viewBox="0 0 72 20" fill="none"><path d="M2 9h34l4-3h10v3h20v3H48l-2 3h-8l-3 6h-5l2-6H2z" fill="#dfe6ec" opacity=".85"/><rect x="22" y="2" width="22" height="4" rx="2" fill="#dfe6ec" opacity=".85"/><rect x="26" y="6" width="3" height="3" fill="#dfe6ec" opacity=".6"/><rect x="37" y="6" width="3" height="3" fill="#dfe6ec" opacity=".6"/></svg>`,
  `<svg width="72" height="20" viewBox="0 0 72 20" fill="none"><path d="M2 10h40l6-4h12v4h10v4H58l-4 4h-8l-4 6h-6l3-6H2z" fill="#dfe6ec" opacity=".85"/><rect x="18" y="3" width="30" height="5" rx="2.5" fill="#dfe6ec" opacity=".85"/></svg>`
];