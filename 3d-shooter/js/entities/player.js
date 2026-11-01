/* =========================================================================
   player.js
   玩家状态 / 全局游戏状态 / 全局常量
   ========================================================================= */
"use strict";

const STAND_H  = 1.72;
const CROUCH_H = 1.08;
const P_RADIUS = 0.36;
const SPAWN = { x: 0, z: 24 };
const GRACE_TIME = 3.0;

const ARMOR_MAX    = 50;
const ARMOR_DRAIN  = 2.0;
const REVIVE_CAP   = 3;

const E_ARMOR_ABSORB = 0.5;
const E_ARMOR_FRAC   = 0.45;

const E_REGEN_DELAY  = 5.0;
const E_REGEN_RATE   = 10;

const ARMOR_REGEN_DELAY = 4.0;
const ARMOR_REGEN_RATE  = 7.0;

const MEDKIT_MAX   = 3;
const MEDKIT_CAP   = 5;
const HEAL_DUR     = 2.2;
const HEAL_FRAC    = 0.45;

const MAX_HP_CAP   = 300;
const MAX_AP_CAP   = 150;

const player = {
  pos: new THREE.Vector3(SPAWN.x, 0, SPAWN.z),
  vel: new THREE.Vector3(),
  yaw: 0, pitch: 0,

  hp: 100, armor: 50, maxHp: 100, maxArmor: 50,
  medkits: MEDKIT_MAX, healT: 0, armorRegenT: 0,
  revives: 0, invulnT: 0,

  height: STAND_H, eye: STAND_H,
  onGround: true, crouch: false, sprint: false,
  bob: 0, bobAmp: 0, stepPhase: 0,
  landShake: 0, shake: 0, shakeSeed: rand(0, 100),
  recoilPitch: 0, recoilYaw: 0, recoilVelP: 0, recoilVelY: 0,
  burstCount: 0, burstIdle: 0, fovKick: 0,

  weapon: 0, switching: 0, switchTo: -1, pendingWpn: -1,
  reloadT: 0, pumpT: 0, boltT: 0, boltPhase: 0, fireCooldown: 0,
  triggerHeld: false, triggerReleased: true, clickBuf: 0,

  ads: false, adsK: 0, adsEase: 0,
  breath: 0, breathHeld: false, breathLock: false, swayT: 0,
  swayAmp: 1,

  jumpsLeft: 0, spaceEdge: false,
  mantleT: 0, mantleDur: 0, mantleFrom: new THREE.Vector3(), mantleTo: new THREE.Vector3(),
  mantleTilt: 0,

  /* ★ 惩罚计时器
     noSprintT  开火后 2 秒不能疾跑（哪怕只开一枪）
     landLockT  从空中落地后 0.5 秒强制不可移动（跳跃也锁） */
  noSprintT: 0, landLockT: 0,

  dead: false,

  /* ★ 闪光弹护目镜：初始没有，商店购买后免疫闪光弹白屏 */
  hasFlashGoggles: false
};

const G = {
  running: false, over: false, paused: false, started: false,
  time: 180, kills: 0, headshots: 0, shots: 0, hits: 0, elapsed: 0,
  dmgFlash: 0, lowPulse: 0, hbTimer: 0, killFlash: 0, shieldFlash: 0, edgeT: 0,
  streak: 0, streakT: 0,
  grace: GRACE_TIME,
  wave: 1, wavesCleared: 0, waveKills: 0, waveTotal: 10, waveT: 0,
  gold: 0, phase: 'combat',
  interT: 0, shopOpen: false, needLock: false, lockTryAt: -1e9,
  placing: null,
  introLock: false,
};

/* 局域网已移除。这些空对象保留只为兼容旧守卫。 */
let remotePlayers = [];
let NET = null;
let NET_READY = {};
let NET_NICK = 'OPERATOR';

const PLR = { maxHp: 100, maxArmor: ARMOR_MAX, dmgMult: 1, hpBuys: 0, apBuys: 0, dmgBuys: 0 };