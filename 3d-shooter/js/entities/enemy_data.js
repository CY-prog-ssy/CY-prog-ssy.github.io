/* =========================================================================
   enemy_data.js
   敌人兵种 / 阶级 / 首领 / 巡逻路线 / 刷怪

   依赖：player.js（TIER/ELITE 常量在 enemy_data 里定义，
                      所以这个文件先于 player.js 使用是没问题的 ——
                      它只读自己定义的常量）
         utils.js / renderer.js / enemy_model.js / queries.js
   暴露：ENEMY_NAMES, EWEAP, EKIND_NAMES, kindRoll, kindRoster,
         BOSSES, TIER, ELITE, ELITE_MAX, BOSS_FIRST_WAVE,
         ST, enemies, enemyHitMeshes,
         eliteCountFor, bossFor, spawnEnemies, rebuildHitMeshes,
         ROUTES, UPPER_ROUTES
   ========================================================================= */
"use strict";

/* --------------------------------------------------------------------------
   士兵代号池 —— 名字是给人记住"刚才我杀的是谁"用的，
   所以刻意挑简短的无线电呼号。
   -------------------------------------------------------------------------- */
const ENEMY_NAMES = [
  'VIPER','GHOST','REAPER','HAVOC','STRIKER','COBRA','TALON','WOLF','DIESEL','SHADOW',
  'BLADE','NOMAD','RAZOR','SPECTRE','VOLT','ONYX',
  'GRIZZLY','PHANTOM','VENOM','CINDER','MARAUDER','TITAN','WRENCH','HALCYON',
  'BRAWLER','NITRO','OSSUARY','PYRE','QUARTZ','RIVET','SABRE','TEMPEST'
];

/* --------------------------------------------------------------------------
   阶级常量

   ELITE_MAX 是单波精英上限，防止玩家被一堆紫色士兵围死。
   BOSS_FIRST_WAVE 是第一个必定出现首领的波次。
   -------------------------------------------------------------------------- */
const TIER = { NORMAL: 0, ELITE: 1, BOSS: 2 };
const ELITE = { hp: 1.45, plate: 2.0, dmg: 1.35, scale: 1.06, tint: 0xb46cff };
const ELITE_MAX = 3;
const BOSS_FIRST_WAVE = 5;

/* --------------------------------------------------------------------------
   敌人状态机常量

   四态：
     PATROL  沿航线巡逻
     ALERT   看见你，反应延迟中
     COMBAT  交战 / 走位 / 开火
     DEAD    尸体物理
   -------------------------------------------------------------------------- */
const ST = { PATROL: 0, ALERT: 1, COMBAT: 2, DEAD: 3 };

/* 运行时容器 */
const enemies = [];
let enemyHitMeshes = [];

/* --------------------------------------------------------------------------
   敌兵种武器参数

   一个步枪兵是公平的交换；十个一样的步枪兵就是行刑队。
   波次里混合角色：
     狙击手  远程封锁，逼你换掩体
     喷火兵  站桩变得昂贵
     突袭兵  惩罚你盯着眼前那个
   每一种都有一个明确的交手距离和一个应对方式。
   -------------------------------------------------------------------------- */
const EWEAP = {
  rifle: {
    dmg: [5.5, 9.0], burst: [2, 4], gap: [0.11, 0.15], rest: [0.85, 1.9], reload: [2.0, 2.9],
    rounds: 30, snd: 'rifle', spread: 1.0, pellets: 1, near: 25, far: 55,
    ideal: 8.5, orbit: 12, speed: 1.0
  },
  sniper: {
    dmg: [19, 25], burst: [1, 1], gap: [0, 0], rest: [1.9, 2.9], reload: [3.0, 3.9],
    rounds: 6, snd: 'sniper', spread: 0.20, pellets: 1, near: 60, far: 95,
    ideal: 30, orbit: 34, speed: 0.82, charge: 1.05, laser: true, alwaysFire: true
  },
  flamer: {
    flame: true, dps: 17, range: 6.5, pierce: 0.5,
    ideal: 5.0, orbit: 7, speed: 1.12, hpMul: 0.9, explodes: true
  },
  rusher: {
    dmg: [4.4, 6.8], burst: [2, 3], gap: [0.07, 0.11], rest: [0.55, 1.05], reload: [2.2, 3.0],
    rounds: 24, snd: 'shotgun', spread: 2.9, pellets: 3, near: 9, far: 26,
    ideal: 4.5, orbit: 6, speed: 1.55, hpMul: 0.75
  }
};

const EKIND_NAMES = ['rifle', 'sniper', 'flamer', 'rusher'];

/* --------------------------------------------------------------------------
   波次兵种配比

   一波里的完整名单一次定好。逐个随机会偶尔刷出八个喷火兵的一波，
   那读起来像是 bug 而不像是设计决定 —— 所以混合方式是先按配额再打乱。
   -------------------------------------------------------------------------- */
function kindRoll(waveN){
  const r = Math.random();
  if (waveN <= 1) return 'rifle';
  if (waveN === 2) return r < 0.22 ? 'sniper' : 'rifle';
  if (waveN === 3) return r < 0.20 ? 'sniper' : (r < 0.34 ? 'flamer' : 'rifle');
  if (waveN === 4) return r < 0.18 ? 'sniper' : (r < 0.36 ? 'flamer' : (r < 0.52 ? 'rusher' : 'rifle'));
  if (r < 0.17) return 'sniper';
  if (r < 0.36) return 'flamer';
  if (r < 0.56) return 'rusher';
  return 'rifle';
}

function kindRoster(count, waveN){
  const out = new Array(count).fill('rifle');
  if (waveN <= 1) return out;

  const cap = (n, m) => Math.max(0, Math.min(m, Math.round(n)));
  const nSniper = cap(count * 0.20, 4);
  const nFlamer = waveN >= 3 ? cap(count * 0.18, 4) : 0;
  const nRusher = waveN >= 4 ? cap(count * 0.20, 5) : 0;
  /* 永远不少过三分之一的步枪兵：他们是战斗的节奏 */
  const spec = Math.min(count - Math.max(1, Math.floor(count / 3)), nSniper + nFlamer + nRusher);

  let i = 0;
  const add = (k, n) => { for (let j = 0; j < n && i < spec; j++) out[i++] = k; };
  add('sniper', nSniper);
  add('flamer', nFlamer);
  add('rusher', nRusher);

  for (let j = out.length - 1; j > 0; j--){
    const k = (Math.random() * (j + 1)) | 0;
    const t = out[j]; out[j] = out[k]; out[k] = t;
  }
  return out;
}

/* --------------------------------------------------------------------------
   首领

   每一位都是一个已知的问题，而不是一个更大的数字：
     执事   铁墙，持续输出
     焰术士 让掩体变得没有意义
     神射手 站在那里不动就要赔上护甲
     攻城兵 必须一直移动才能躲开的倒计时
   -------------------------------------------------------------------------- */
const BOSSES = [
  {
    key: 'warden', title: 'WARDEN', hp: 5.0, plate: 3.2, dmg: 1.45, scale: 1.26, kind: 'rifle',
    wep: {
      dmg: [9, 13], burst: [5, 8], gap: [0.07, 0.10], rest: [0.45, 0.85], reload: [2.2, 2.8],
      rounds: 60, snd: 'rifle', spread: 0.75, pellets: 1, near: 35, far: 75,
      ideal: 11, orbit: 14, speed: 0.72
    },
    blurb: 'HEAVY PLATE · SUSTAINED FIRE'
  },
  {
    key: 'pyro', title: 'PYROMANCER', hp: 4.2, plate: 1.7, dmg: 1.0, scale: 1.20, kind: 'flamer',
    wep: {
      flame: true, dps: 26, range: 12, pierce: 0.6,
      ideal: 8, orbit: 10, speed: 1.0, explodes: true, boss: true
    },
    blurb: 'FLAME PROJECTOR · DETONATES ON DEATH'
  },
  {
    key: 'marksman', title: 'MARKSMAN', hp: 3.4, plate: 1.5, dmg: 1.0, scale: 1.12, kind: 'sniper',
    wep: {
      dmg: [34, 44], burst: [1, 1], gap: [0, 0], rest: [1.15, 1.8], reload: [2.4, 3.0],
      rounds: 8, snd: 'sniper', spread: 0.12, pellets: 1, near: 70, far: 120,
      ideal: 28, orbit: 32, speed: 0.95, charge: 0.72, laser: true, alwaysFire: true
    },
    blurb: 'ANTI-MATERIAL RIFLE · DO NOT STAND STILL'
  },
  {
    key: 'juggernaut', title: 'JUGGERNAUT', hp: 6.5, plate: 4.0, dmg: 1.0, scale: 1.42, kind: 'rusher',
    wep: {
      slam: true, dmg: [26, 34], radius: 4.4, windup: 0.95, rest: [2.3, 3.2],
      ideal: 3.0, orbit: 4, speed: 0.85
    },
    blurb: 'SIEGE ARMOUR · SLAMS THE GROUND'
  }
];

/* --------------------------------------------------------------------------
   巡逻路线

   每条线是一组航点。原版有 10 条，后来发现 32 人上限下每条线要复用 3 次
   以上，靠随机偏移已不足以分开，所以扩到 16 条。
   -------------------------------------------------------------------------- */
const ROUTES = [
  /* 0 */ [[16, -22], [16, -6], [16, 8], [16, 20], [16, 4]],               // 走廊南北向
  /* 1 */ [[-22, -10], [-18, 0], [-22, 3], [-26, -6]],                     // 二楼
  /* 2 */ [[-2, 6], [5, -4], [0, -10], [-5, -2]],                          // 中央/车辆
  /* 3 */ [[16, 20], [8, 22], [2, 16], [10, 10]],                          // 东南
  /* 4 */ [[-14, -22], [-4, -25], [4, -20], [-6, -16]],                    // 北带
  /* 5 */ [[24, -8], [24, -18], [18, -22], [20, -10]],                     // 警卫室
  /* 6 */ [[-20, -6], [-24, 2], [-18, 4], [-16, -4]],                      // 二楼 2
  /* 7 */ [[-6, 20], [2, 24], [-10, 26], [-16, 20]],                       // 南侧开阔
  /* 8 */ [[-14, 10], [-6, 12], [-10, 4], [-16, 2]],                       // 西场地
  /* 9 */ [[8, -14], [2, -6], [10, 2], [14, -10]],                         // 游荡
  /* 10 */ [[22, 4], [26, -2], [22, -12], [26, 6]],                        // 东侧走廊
  /* 11 */ [[-26, -18], [-24, -14], [-20, -20], [-24, -22]],               // 西北角落
  /* 12 */ [[4, -18], [10, -20], [6, -24], [0, -20]],                      // 北中场
  /* 13 */ [[-8, -14], [-12, -8], [-6, -12], [-14, -16]],                  // 西侧中区
  /* 14 */ [[12, 14], [18, 10], [14, 4], [20, 16]],                        // 东南回环
  /* 15 */ [[-18, 16], [-22, 22], [-14, 20], [-20, 14]]                    // 西南回环
];

/* 走二楼的路线索引 —— 它们的 y 是 4.42，不走 walkable 约束 */
const UPPER_ROUTES = new Set([1, 6]);

/* --------------------------------------------------------------------------
   阶级与首领选择
   -------------------------------------------------------------------------- */

/** 本波携带多少个精英。第 3 波是首次出现，且**恰好**有一个 ——
    那是"这一个不一样"的教学。 */
function eliteCountFor(waveN){
  if (waveN < 3) return 0;
  if (waveN === 3) return 1;
  const p = Math.min(0.72, 0.34 + 0.045 * (waveN - 4));
  let n = 0;
  if (Math.random() < p) n = 1;
  if (Math.random() < 0.20) n++;
  if (waveN >= 10 && Math.random() < 0.35) n++;
  return Math.min(n, ELITE_MAX);
}

/** 第 5 波一个首领，之后每 10 波必出，其余时候是小概率惊喜。一次只有一个。 */
function bossFor(waveN){
  const guaranteed = waveN === BOSS_FIRST_WAVE || (waveN > BOSS_FIRST_WAVE && waveN % 10 === 0);
  if (!guaranteed && (waveN < BOSS_FIRST_WAVE + 1 || Math.random() > 0.16)) return null;
  return BOSSES[(waveN + Math.floor(Math.random() * BOSSES.length)) % BOSSES.length];
}

/* --------------------------------------------------------------------------
   刷怪

   每一波的敌人从 ROUTES 里挑起点。第一个航点位于"离玩家出生点最远的那段"，
   所以没人会一开局就盯着你开火。
   -------------------------------------------------------------------------- */
function spawnEnemies(count, hp, dmgMul, waveN){
  count = count || 10;
  waveN = waveN || 1;

  /* 护甲在波次里越来越常见 —— 第 1 波大多是软目标，第一场交火
     还是原来的味道。 */
  const armorChance = Math.min(0.7, 0.18 + 0.09 * (waveN - 1));
  const nElite = eliteCountFor(waveN);
  const bossDef = bossFor(waveN);
  const kinds = kindRoster(count, waveN);

  /* 首领值好几个兵：从普通名额里扣，免得变成二十个加上一个首领。 */
  if (bossDef) count = Math.max(6, count - 2);

  /* 名单：先首领、再精英、然后普通兵打乱 */
  const roster = [];
  if (bossDef) roster.push({ tier: TIER.BOSS, def: bossDef, kind: bossDef.kind });
  for (let i = 0; i < nElite; i++) roster.push({ tier: TIER.ELITE, kind: kinds[i % kinds.length] });
  for (let i = roster.length; i < count; i++) roster.push({ tier: TIER.NORMAL, kind: kinds[i % kinds.length] });

  /* 只打乱普通兵，让兵种不按索引挤成堆，但首领（slot 0）和精英仍在最前 */
  const normStart = (bossDef ? 1 : 0) + nElite;
  for (let i = roster.length - 1; i > normStart; i--){
    const j = normStart + Math.floor(Math.random() * (i - normStart + 1));
    const t = roster[i]; roster[i] = roster[j]; roster[j] = t;
  }

  const _sBox = new THREE.Box3(), _sSz = new THREE.Vector3();
  const _spawnPlaced = [];             // 已占用的出生点，用于分散

  for (let i = 0; i < roster.length; i++){
    const spec = roster[i];
    const tier = spec.tier;
    const boss = tier === TIER.BOSS ? spec.def : null;
    const kind = spec.kind;
    /* 首领自带武器数值；其余走原型 */
    const wep = boss ? boss.wep : EWEAP[kind];

    const parts = buildEnemyModel({ kind, tier, scale: boss ? boss.scale : undefined });

    /* 十个士兵每个 26 个投影网格加起来就是整个阴影 pass。
       躯干、头、四肢和背包仍然投影 —— 地上的剪影仍然明确是人；
       去掉的是弹匣袋、护膝之类 —— 在 2048 阴影图里从来没有超过一个像素。 */
    parts.model.traverse(o => {
      if (!o.isMesh || !o.castShadow) return;
      _sBox.setFromObject(o);
      _sBox.getSize(_sSz);
      if (Math.max(_sSz.x, _sSz.y, _sSz.z) < 0.40) o.castShadow = false;
    });

    const obj = new THREE.Group();
    obj.add(parts.model);

    const nm = boss ? boss.title
             : (tier === TIER.ELITE ? '◆ ' + ENEMY_NAMES[i % ENEMY_NAMES.length] + ' [E]'
                                    : ENEMY_NAMES[i % ENEMY_NAMES.length]);

    const tag = makeTag(nm, false,
      boss ? '#ff5a4a' : (tier === TIER.ELITE ? '#c48cff' : null));
    obj.add(tag.sprite);

    /* 超过第一条路线之后，路线会重复。相同的路线上走相同的步伐，
       读起来像一个人被画了两遍，所以航点要抖动、起始腿要偏移。 */
    const dup = i >= ROUTES.length;
    /* 第 2 轮复用时偏移 ±3m 已不够，第 3 轮更是会重叠。
       按复用轮次递增偏移量（±3 → ±5 → ±7），并整体旋转路线，
       让 32 个人在同一条动线上也能拉开距离。 */
    const cycle = Math.floor(i / ROUTES.length);
    const jit = 3 + cycle * 2;
    const upper = UPPER_ROUTES.has(i % ROUTES.length);
    /* 手工摆放的航点会随着地图变化漂进道具里，而站在集装箱里的身体
       永远无法解析出一个合法移动 —— 它会原地站三分钟。加载时把所有腿
       吸附到开阔地面。 */
    /* 二楼只能靠坡道上，平坦的泛洪看不到，所以只有地面路线才做可达性约束 */
    const floorY = upper ? 4.42 : 0;
    const src = dup
      ? ROUTES[i % ROUTES.length].map(([wx, wz]) => {
          /* 绕场地中心整体旋转一个小角度，再叠加随机偏移 */
          const ang = (cycle % 2 ? 1 : -1) * cycle * 0.22;
          const ca = Math.cos(ang), sa = Math.sin(ang);
          return [wx * ca - wz * sa + rand(-jit, jit), wx * sa + wz * ca + rand(-jit, jit)];
        })
      : ROUTES[i % ROUTES.length];
    const route = upper
      ? src.map(([wx, wz]) => nearestFree(wx, wz, 0.5, 1.7, 6, floorY))
      : src.map(([wx, wz]) => nearestReachable(wx, wz, 0.5, 1.7, 10));

    /* 两条路线直接经过玩家出生点 —— 让这些人从对侧起飞，
       免得你还没站稳就被打。 */
    let wpStart = 0;
    for (let k = 0; k < route.length; k++){
      const d = Math.hypot(route[k][0] - SPAWN.x, route[k][1] - SPAWN.z);
      const dBest = Math.hypot(route[wpStart][0] - SPAWN.x, route[wpStart][1] - SPAWN.z);
      if (d > dBest) wpStart = k;
    }
    if (dup) wpStart = (wpStart + 1 + Math.floor(rand(0, route.length))) % route.length;

    /* 出生点分散：32 人时多条路线会吸附到几乎同一个可站立点，两个人
       叠在一起看起来就是一个人在抽搐。逐个挑与已放置敌人距离最远的航点。 */
    const placed = _spawnPlaced;
    let start = route[wpStart], bestGap = -1;
    for (let k = 0; k < route.length; k++){
      const cand = route[(wpStart + k) % route.length];
      let gap = Infinity;
      for (let m = 0; m < placed.length; m++){
        if (Math.abs(placed[m][1] - floorY) > 1.5) continue;    // 不同楼层互不干扰
        gap = Math.min(gap, Math.hypot(cand[0] - placed[m][0], cand[1] - placed[m][2]));
      }
      if (gap === Infinity) gap = 99;
      if (gap > bestGap){ bestGap = gap; start = cand; }
      if (gap > 3.2) break;                                        // 够开了就用它
    }
    placed.push([start[0], floorY, start[1]]);
    obj.position.set(start[0], floorY, start[1]);
    scene.add(obj);

    const e = {
      idx: i, name: nm, obj, tag, upper, route,
      wp: (wpStart + 1) % route.length,
      kind, tier, boss, wep,
      p: parts, hp: (hp || 100), dmgMul: (dmgMul || 1),
      state: ST.PATROL, dead: false,
      maxHp: (hp || 100), armor: 0, maxArmor: 0, regenCd: 0, tagHp: (hp || 100),
      chargeT: 0, flameT: 0, slamT: 0, slamCd: 0, laserOn: false,
      yaw: rand(0, 7), targetYaw: rand(0, 7),
      vel: new THREE.Vector3(),
      walkPhase: rand(0, 7), speed: 0,
      losTimer: rand(0, 0.2), canSee: false, lastSeen: 0,
      reactT: 0, alerted: false, fireT: 0, burst: 0, burstT: 0,
      strafeDir: Math.random() < .5 ? -1 : 1, strafeT: rand(.6, 1.8),
      flinch: 0, deathT: 0, aimPitch: 0, gunDropped: false, combatBlend: 0,
      idleT: rand(0, 2), repathT: 0, avoidT: 0, avoidX: 0, avoidZ: 0,
      avoidSide: 0, clearT: 0, stuckT: 0, stuckN: 0, stuckX: 0, stuckZ: 0,
      tactic: 'push', tacticT: 0, cover: null, engage: 0, rounds: 30, reloadT: 0,
      suppress: 0, saidLost: false, hunt: 0, lastKnown: new THREE.Vector3()
    };

    /* ---- 按阶级和原型分配属性 ----
       血量和护甲先定，因为护甲池从血量推导出来。 */
    let ehp = (hp || 100) * (wep.hpMul || 1);
    let epl = Math.round(ehp * E_ARMOR_FRAC);
    let edm = (dmgMul || 1);
    let espd = wep.speed || 1;

    if (tier === TIER.ELITE){
      ehp *= ELITE.hp; epl = Math.round(epl * ELITE.plate); edm *= ELITE.dmg;
    } else if (boss){
      ehp *= boss.hp; epl = Math.round(epl * boss.plate); edm *= boss.dmg;
      if (boss.key === 'juggernaut') epl = Math.round(ehp * 0.18);   // 攻城护甲
    } else if (kind === 'flamer' || kind === 'rusher'){
      /* 轻装兵少穿护甲 —— 用护甲换来的射程 */
      epl = Math.round(epl * 0.55);
    }
    if (tier === TIER.NORMAL && Math.random() >= armorChance) epl = 0;

    e.hp = e.maxHp = Math.round(ehp);
    e.armor = e.maxArmor = epl;
    e.dmgMul = edm;
    e.spdMul = espd;
    e.tagHp = e.hp;
    e.tag.draw(e.hp, false, e.armor, e.maxArmor);

    parts.hbHead.userData = { enemy: e, part: 'head' };
    parts.hbBody.userData = { enemy: e, part: 'body' };
    parts.hbLegs.userData = { enemy: e, part: 'legs' };

    enemies.push(e);
  }
  rebuildHitMeshes();
}

function rebuildHitMeshes(){
  enemyHitMeshes = [];
  for (const e of enemies){
    if (e.dead) continue;
    enemyHitMeshes.push(e.p.hbHead, e.p.hbBody, e.p.hbLegs);
  }
}