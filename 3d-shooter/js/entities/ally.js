/* =========================================================================
   ally.js
   友军 —— 三个等级 / 跟随或固守 / 独立索敌 / 会倒下

   依赖：utils.js / renderer.js / enemy_model.js / queries.js / effects.js /
         enemy_ai.js（losRay 复用）/ audio.js
   暴露：ally, ALLY_TIERS, ALLY_COST, spawnAlly, despawnAlly, restoreAlly,
         updateAlly, damageAlly, commandAlly
   ========================================================================= */
"use strict";

/* --------------------------------------------------------------------------
   三个等级

   HP 从 100 到 260，护甲从 0 到 100。买完三档就是一条完整的小队。
   -------------------------------------------------------------------------- */
const ALLY_TIERS = [
  { hp: 100, ap: 0,   title: 'RIFLEMAN' },
  { hp: 150, ap: 50,  title: 'VETERAN'  },
  { hp: 260, ap: 100, title: 'HEAVY'    }
];
const ALLY_COST = [280, 250, 370];      // 买 L1，再升 L2，再升 L3

/* 友军武器参数 —— 比玩家的 M4 稍弱一点，但持续开火不换弹那么频繁 */
const A_GUN = {
  dmg: 16, gap: 0.115, burst: 3, rest: 1.15,
  reload: 2.4, rounds: 24, range: 46, spread: 0.030
};
const A_REGEN = { delay: 6.0, rate: 7 };
/* 超过这个距离就不试图走过去，直接落到你身边。
   让他一路跟着你走遍整个场地意味着他在你买他的那场战斗里缺席，
   而一个一分钟后才到的队友只是装饰。 */
const ALLY_LEASH = 26;
const ALLY_BLINK_CD = 5.0;              // 别频繁播报"我在赶路"
/* 固守半径：固守时友军可以在这个范围内走位交火，但不会离开 */
const ALLY_HOLD_R = 5.0;

let ally = null;

/* 复用 enemy_ai.js 里的射线检测（同一个 Raycaster 实例） */
const _alEye = new THREE.Vector3();
const _alMuz = new THREE.Vector3();
const _alDir = new THREE.Vector3();
const _alUp  = new THREE.Vector3(0, 1, 0);

/* --------------------------------------------------------------------------
   模型 —— 复用敌人骨架，染成蓝
   -------------------------------------------------------------------------- */
function buildAllyModel(){
  const p = buildEnemyModel();
  /* 材质在所有士兵之间是共享的，所以必须逐部件 clone，
     否则整个小队会跟着他一起变色。 */
  const blue = new THREE.Color(0x2f6fb0);
  p.model.traverse(o => {
    if (!o.isMesh || o.material === INVIS) return;
    const m = o.material.clone();
    m.color.lerp(blue, 0.55);
    /* IFF 频闪：红→绿 */
    if (m.emissive && m.emissiveIntensity > 0.5) m.emissive.setHex(0x2ad07a);
    o.material = m;
  });
  return p;
}

function despawnAlly(){
  if (!ally) return;
  scene.remove(ally.obj);
  ally.tag.tex.dispose();
  ally = null;
  updateSquadUI();
}

/** level 是 1..3。在玩家附近满状态重新生成 ——
    所以升级同时是一个新的队友，而不是一个被补丁过的旧的。 */
function spawnAlly(level){
  despawnAlly();
  const t = ALLY_TIERS[level - 1];
  const p = buildAllyModel();

  const obj = new THREE.Group();          // 外层：死亡倾斜
  const pivot = new THREE.Group();        // 内层：yaw
  obj.add(pivot);
  pivot.add(p.model);

  const tag = makeTag('ALLY-' + t.title, true);
  pivot.add(tag.sprite);

  const f = nearestFree(player.pos.x + rand(-2.5, 2.5),
                        player.pos.z + rand(-2.5, 2.5),
                        0.5, 1.7, 8, player.pos.y);
  obj.position.set(f[0], player.pos.y, f[1]);
  scene.add(obj);

  ally = {
    level, obj, pivot, p, tag, title: t.title,
    hp: t.hp, maxHp: t.hp, armor: t.ap, maxArmor: t.ap,
    yaw: player.yaw, walkPhase: rand(0, 7), speed: 0, vel: new THREE.Vector3(),
    target: null, tgtT: 0, fireT: 0, burst: 0, reloadT: 0, rounds: A_GUN.rounds,
    strafe: 1, regenCd: 0, aimPitch: 0, dead: false, deathT: 0, tagHp: t.hp,
    strafeT: rand(1.8, 3.4), blinkCd: 0,
    /* 指令模式：'follow' 跟随玩家，'hold' 原地固守。
       固守时他会留在下令位置附近交火，不再被牵引传送。 */
    mode: 'follow', holdX: 0, holdY: 0, holdZ: 0
  };
  tag.draw(ally.hp, false, ally.armor, ally.maxArmor);

  pushComms('SQUAD', t.title + ' ON STATION — WATCHING YOUR BACK');
  SFX.radio();
  updateSquadUI();
}

/** 波次间隙：满血满甲，倒下也重新站起来 */
function restoreAlly(){
  if (!ally) return;
  const a = ally;
  a.hp = a.maxHp;
  a.armor = a.maxArmor;
  a.regenCd = 0;
  a.rounds = A_GUN.rounds;
  a.reloadT = 0;
  a.burst = 0;
  a.target = null;
  a.dead = false;
  a.deathT = 0;
  /* 休整阶段解除固守，回到跟随状态，免得下一波开场他还在上一波的位置 */
  a.mode = 'follow';
  a.obj.rotation.x = 0;
  a.tag.sprite.visible = true;
  a.tagHp = a.hp;
  a.tag.draw(a.hp, false, a.armor, a.maxArmor);

  const f = nearestFree(player.pos.x + rand(-2.5, 2.5),
                        player.pos.z + rand(-2.5, 2.5),
                        0.5, 1.7, 8, player.pos.y);
  a.obj.position.set(f[0], player.pos.y, f[1]);
  updateSquadUI();
}

function allyDown(){
  const a = ally;
  a.dead = true;
  a.deathT = 0;
  a.target = null;
  a.tag.sprite.visible = false;
  pushComms('SQUAD', a.title + ' IS DOWN — HE COMES BACK NEXT WAVE');
  SFX.enemyDeath(0, 14);
  updateSquadUI();
}

function damageAlly(amount, fromPos){
  if (!ally || ally.dead) return;
  const a = ally;
  a.regenCd = A_REGEN.delay;

  let dmg = amount;
  if (a.armor > 0 && dmg > 0){
    const cost = dmg * ARMOR_DRAIN;
    if (a.armor >= cost){
      a.armor -= cost;
      dmg = 0;
    } else {
      dmg -= a.armor / ARMOR_DRAIN;
      a.armor = 0;
    }
  }
  a.hp -= dmg;

  if (a.hp <= 0){
    a.hp = 0;
    allyDown();
    return;
  }

  if (Math.abs(a.hp - a.tagHp) > a.maxHp / 60){
    a.tagHp = a.hp;
    a.tag.draw(a.hp, true, a.armor, a.maxArmor);
  }
}

/* --------------------------------------------------------------------------
   索敌 —— 有视线的最近的敌人
   -------------------------------------------------------------------------- */
function allyTarget(a){
  let best = null, bestD = A_GUN.range;
  _alEye.set(a.obj.position.x, a.obj.position.y + 1.62, a.obj.position.z);

  for (const e of enemies){
    if (e.dead) continue;
    const dx = e.obj.position.x - _alEye.x;
    const dz = e.obj.position.z - _alEye.z;
    const d = Math.hypot(dx, dz);
    if (d >= bestD || d < 1.2) continue;

    _alDir.set(dx, (e.obj.position.y + 1.15) - _alEye.y, dz).divideScalar(
      Math.hypot(dx, (e.obj.position.y + 1.15) - _alEye.y, dz) || 1);
    losRay.set(_alEye, _alDir);
    losRay.far = d - 0.55;
    if (losRay.intersectObjects(worldSolid, false).length) continue;

    bestD = d;
    best = e;
  }
  return best;
}

/* --------------------------------------------------------------------------
   开火
   -------------------------------------------------------------------------- */
function allyShoot(a, e){
  a.p.gunMuzzle.getWorldPosition(_alMuz);
  _alDir.set(
    e.obj.position.x - _alMuz.x,
    (e.obj.position.y + 1.15) - _alMuz.y,
    e.obj.position.z - _alMuz.z
  ).normalize();

  const rgt = new THREE.Vector3().crossVectors(_alDir, _alUp).normalize();
  const upv = new THREE.Vector3().crossVectors(rgt, _alDir).normalize();
  const ang = Math.random() * PI * 2;
  const rad = Math.sqrt(Math.random()) * A_GUN.spread * 2.2;

  const dir = _alDir.clone()
    .addScaledVector(rgt, Math.cos(ang) * rad)
    .addScaledVector(upv, Math.sin(ang) * rad)
    .normalize();

  enemyMuzzleFlash(_alMuz);
  const dist = _alMuz.distanceTo(e.obj.position);
  SFX.gunshot('rifle', clamp((a.obj.position.x - camera.position.x) / 16, -1, 1), dist);

  losRay.set(_alMuz, dir);
  losRay.far = A_GUN.range + 6;
  const hits = losRay.intersectObjects(enemyHitMeshes.concat(worldSolid), false);

  const end = hits.length ? hits[0].point.clone()
                          : _alMuz.clone().addScaledVector(dir, A_GUN.range);
  spawnTracer(_alMuz, end, 0xffe0a0, 1.1);

  if (!hits.length) return;
  const ud = hits[0].object.userData;

  if (ud && ud.enemy && !ud.enemy.dead){
    const t = ud.enemy;
    const dmg = A_GUN.dmg *
                (ud.part === 'head' ? 1.8 : (ud.part === 'legs' ? 0.8 : 1));
    fxImpactFlesh(hits[0].point, dir, dist, ud.part === 'head');
    /* 他的爆头同样无视护甲 —— 和玩家规则一致 */
    damageEnemy(t, dmg, ud.part === 'head', dir, hits[0].point, true, undefined, 'ally');
  } else {
    const n = hits[0].face
      ? hits[0].face.normal.clone().transformDirection(hits[0].object.matrixWorld)
      : new THREE.Vector3(0, 1, 0);
    fxImpactWall(hits[0].point, n, hits[0].distance);
  }
}

/* --------------------------------------------------------------------------
   主更新
   -------------------------------------------------------------------------- */
function updateAlly(dt){
  const a = ally;
  if (!a) return;
  const obj = a.obj, p = a.p;

  /* 死亡动画 */
  if (a.dead){
    if (a.deathT < 1){
      a.deathT = Math.min(1, a.deathT + dt / 0.7);
      obj.rotation.x = -PI / 2 * easeOutCubic(a.deathT);
      p.model.position.y = 0;
    }
    return;
  }
  if (!G.running || G.over || G.shopOpen) return;

  /* ---- 每隔几帧重新挑一次目标，不是每帧 ---- */
  a.tgtT -= dt;
  if (a.tgtT <= 0){
    a.tgtT = 0.28;
    const t = allyTarget(a);
    if (t !== a.target){
      a.target = t;
      a.burst = 0;
      a.fireT = t ? 0.12 : 0;
    }
  }
  const tgt = (a.target && !a.target.dead) ? a.target : null;

  /* ---- 想去哪 ----
     固守模式下目标点被夹在固守点周围 ALLY_HOLD_R 米内：
     他仍然会走位、会侧移交火，但不会离开你指定的那块地。 */
  const px = player.pos.x, pz = player.pos.z;
  const holding = a.mode === 'hold' && !a.dead;
  let gx, gz, wantYaw;

  if (tgt){
    const ex = tgt.obj.position.x, ez = tgt.obj.position.z;
    const dx = ex - obj.position.x, dz = ez - obj.position.z;
    const d = Math.hypot(dx, dz) || 1;
    wantYaw = Math.atan2(-dx, -dz);

    /* 保持一个工作距离并横向滑动。
       保持点是从**敌人**的角度写的，而不是从他当前位置 ——
       从自己位置偏移出去的目标他永远到不了，
       他会在整个场地里追着它跑。 */
    const ux = -dx / d, uz = -dz / d;         // 敌人 → 友军
    const hold = d > 20 ? 12 : (d < 6 ? 11 : d);
    gx = ex + ux * hold - uz * a.strafe * 3.0;
    gz = ez + uz * hold + ux * a.strafe * 3.0;

    a.strafeT -= dt;
    if (a.strafeT <= 0){
      a.strafeT = rand(1.8, 3.4);
      a.strafe = -a.strafe;
    }
  } else {
    /* 没有目标：站到玩家侧后方的僚机位置 */
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    gx = px - fx * 3.4 - fz * 1.7;
    gz = pz - fz * 3.4 + fx * 1.7;
    wantYaw = player.yaw;
    a.strafe = a.strafe || 1;
  }

  if (holding){
    /* 把目标点拉回固守点半径内；超出就截断到圆上 */
    let ox = gx - a.holdX, oz = gz - a.holdZ;
    const od = Math.hypot(ox, oz);
    if (od > ALLY_HOLD_R){
      ox = ox / od * ALLY_HOLD_R;
      oz = oz / od * ALLY_HOLD_R;
    }
    gx = a.holdX + ox;
    gz = a.holdZ + oz;
  }

  /* ---- 移动 ---- */
  const dxg = gx - obj.position.x;
  const dzg = gz - obj.position.z;
  const dg = Math.hypot(dxg, dzg) || 1;

  if (dg > 1.0){
    const sp = (tgt ? 4.7 : 5.8) * (dg < 2.6 ? 0.55 : 1);
    a.vel.set(dxg / dg * sp, 0, dzg / dg * sp);
    moveSlide(obj.position, dxg / dg * sp * dt, dzg / dg * sp * dt, 0.42, 1.7);
  } else {
    a.vel.set(0, 0, 0);
  }
  a.speed = Math.hypot(a.vel.x, a.vel.z);

  /* ---- 皮带 ----
     远到走不到，或者被困在另一个楼层：落回玩家身边，
     而不是拖在半张地图后面。 */
  const dp = Math.hypot(obj.position.x - px, obj.position.z - pz);
  const split = Math.abs(player.pos.y - obj.position.y) > 2.0;

  /* 固守是你下的命令，牵引传送会直接违背它 —— 固守时只处理跨楼层 */
  if ((!holding && dp > ALLY_LEASH) || (split && dp > 9)){
    const f = nearestFree(px + rand(-2.2, 2.2), pz + rand(-2.2, 2.2),
                          0.5, 1.7, 8, player.pos.y);
    obj.position.set(f[0], player.pos.y, f[1]);
    a.vel.set(0, 0, 0);
    a.speed = 0;
    if (a.blinkCd <= 0){
      a.blinkCd = ALLY_BLINK_CD;
      pushComms('SQUAD', split ? 'MOVING UP TO YOUR FLOOR'
                               : 'FALLING IN — CATCHING UP');
      SFX.radio();
    }
  }
  if (a.blinkCd > 0) a.blinkCd -= dt;

  obj.position.x = clamp(obj.position.x, -HALF + 1, HALF - 1);
  obj.position.z = clamp(obj.position.z, -HALF + 1, HALF - 1);

  /* 停在你所在的楼层；等你走远了才直接吸附 —— 那时候没人看这个过渡 */
  const wantY = player.pos.y > 2 ? 4.42 : 0;
  if (Math.hypot(px - obj.position.x, pz - obj.position.z) > 9) obj.position.y = wantY;
  else obj.position.y = damp(obj.position.y, wantY, 2.5, dt);

  /* ---- 朝向 ---- */
  let dYaw = wantYaw - a.yaw;
  while (dYaw >  PI) dYaw -= PI * 2;
  while (dYaw < -PI) dYaw += PI * 2;
  a.yaw += dYaw * Math.min(1, dt * 9);
  a.pivot.rotation.y = a.yaw;

  /* ---- 开火，但要先真的指向敌人 ---- */
  a.fireT -= dt;

  if (a.reloadT > 0){
    a.reloadT -= dt;
  } else if (tgt && Math.abs(dYaw) < 0.30){
    if (a.burst > 0 && a.fireT <= 0){
      a.burst--;
      a.rounds--;
      allyShoot(a, tgt);
      a.fireT = a.burst > 0 ? A_GUN.gap * rand(0.85, 1.2)
                            : A_GUN.rest * rand(0.8, 1.3);
      if (a.rounds <= 0){
        a.reloadT = A_GUN.reload;
        a.burst = 0;
        a.rounds = A_GUN.rounds;
      }
    } else if (a.burst <= 0 && a.fireT <= 0){
      a.burst = A_GUN.burst;
      a.fireT = 0.05;
    }
  }

  /* ---- 脱离接触：自己包扎 ---- */
  if (a.regenCd > 0) a.regenCd -= dt;
  else if (!tgt && a.hp < a.maxHp){
    a.hp = Math.min(a.maxHp, a.hp + A_REGEN.rate * dt);
    if (Math.abs(a.hp - a.tagHp) > a.maxHp / 60){
      a.tagHp = a.hp;
      a.tag.draw(a.hp, false, a.armor, a.maxArmor);
    }
  }

  /* ---- 动画 ---- */
  const walk = clamp(a.speed / 2.4, 0, 1);
  a.walkPhase += dt * (3.0 + a.speed * 2.2);
  const s1 = Math.sin(a.walkPhase), c1 = Math.cos(a.walkPhase);

  p.legs[0].hip.rotation.x  = s1 * 0.62 * walk;
  p.legs[1].hip.rotation.x  = -s1 * 0.62 * walk;
  p.legs[0].knee.rotation.x = Math.max(0, -c1) * 0.7 * walk;
  p.legs[1].knee.rotation.x = Math.max(0,  c1) * 0.7 * walk;
  p.body.position.y = Math.abs(c1) * 0.045 * walk;
  p.body.rotation.z = s1 * 0.035 * walk;

  /* 始终是枪托入肩的姿态：他在执勤，不在巡逻 */
  p.arms[0].sh.rotation.x = 1.50; p.arms[0].sh.rotation.z =  0.62; p.arms[0].el.rotation.x = -0.15;
  p.arms[1].sh.rotation.x = 1.99; p.arms[1].sh.rotation.z = -0.68; p.arms[1].el.rotation.x = -1.69;
  p.gun.position.set(0.10, -0.05, -0.26);
  p.gun.rotation.set(0, 0, 0);

  const pitch = tgt
    ? clamp(Math.atan2(
        (tgt.obj.position.y + 1.15) - (obj.position.y + 1.40),
        Math.hypot(tgt.obj.position.x - obj.position.x,
                   tgt.obj.position.z - obj.position.z)
      ), -0.7, 0.7)
    : 0;
  a.aimPitch = damp(a.aimPitch, pitch, 8, dt);
  p.rig.rotation.x = a.aimPitch;
  p.head.rotation.x = a.aimPitch * 0.5;
}

/* --------------------------------------------------------------------------
   小队指令：跟随 / 原地固守

   让友军留在某处是有意义的战术选择 —— 固守的友军可以守住一条通道。
   代价是你得自己过去找他。
   -------------------------------------------------------------------------- */
function commandAlly(){
  if (!ally || ally.dead){ SFX.dryFire(); return; }

  if (ally.mode === 'follow'){
    ally.mode = 'hold';
    ally.holdX = ally.obj.position.x;
    ally.holdY = ally.obj.position.y;
    ally.holdZ = ally.obj.position.z;
    pushComms('SQUAD', ally.title + ' HOLDING THIS POSITION');
  } else {
    ally.mode = 'follow';
    pushComms('SQUAD', ally.title + ' ON ME — FOLLOWING');
  }
  SFX.radio();
  updateSquadUI();
}