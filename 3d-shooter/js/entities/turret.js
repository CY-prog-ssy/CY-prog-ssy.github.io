/* =========================================================================
   turret.js
   固定炮塔 —— 两种型号 / 建造预览 / 修复 / 拆除

   依赖：utils.js / renderer.js / map.js（addCollider）/ queries.js /
         effects.js / enemy_ai.js（damageEnemy / losRay）
   暴露：TURRETS, turrets, TURRET_MAX, spawnTurret, removeTurret,
         salvageTurret, startPlacing, cancelPlacing, confirmPlace,
         updateTurrets, updateGhost, damageTurret,
         totalRepairCost, anyTurretDamaged, repairAllTurrets
   ========================================================================= */
"use strict";

/* 单人 3 座；多人 HOST 提升到 6 座（在 net.js 的 netStartHostGame 里设置） */
let TURRET_MAX = 3;

/* --------------------------------------------------------------------------
   两种型号

   取舍明确：
     连射炮塔  便宜、射速快，但耐久和射程都低，适合放在通道口压制
     单发炮塔  贵，伤害和耐久高、射程远，适合架在长直线上
   -------------------------------------------------------------------------- */
const TURRETS = {
  auto: {
    key: 'auto', title: 'AUTO TURRET', name: '连射炮塔',
    hp: 180, dmg: [6, 9],
    burst: [4, 7], gap: [0.10, 0.14], rest: [0.7, 1.2],
    reload: [2.2, 2.8], rounds: 40, range: 18, cost: 320,
    snd: 'rifle', spread: 1.6, pellets: 1, turn: 4.2, seek: 0.30,
    desc: '射速快 · 伤害、耐久、射程偏低'
  },
  heavy: {
    key: 'heavy', title: 'HEAVY TURRET', name: '单发炮塔',
    hp: 420, dmg: [38, 52],
    burst: [1, 1], gap: [0, 0], rest: [1.5, 2.1],
    reload: [3.2, 4.0], rounds: 8, range: 34, cost: 520,
    snd: 'sniper', spread: 0.35, pellets: 1, turn: 2.4, seek: 0.45,
    desc: '单发高伤 · 耐久高 · 射程远'
  }
};

const turrets = [];
const _ttMuz = new THREE.Vector3();
const _ttAim = new THREE.Vector3();
const _ttDir = new THREE.Vector3();
const _gsTmp = new THREE.Vector3();

/* --------------------------------------------------------------------------
   炮塔材质：深灰机体 + 琥珀指示灯，和小队的绿色区分开
   -------------------------------------------------------------------------- */
const T_MAT = {
  body:    new THREE.MeshStandardMaterial({ color: 0x4a5158, roughness: .52, metalness: .62 }),
  dark:    new THREE.MeshStandardMaterial({ color: 0x1c2024, roughness: .66, metalness: .34 }),
  barrel:  new THREE.MeshStandardMaterial({ color: 0x2b3035, roughness: .44, metalness: .76 }),
  lamp:    new THREE.MeshStandardMaterial({ color: 0xffb340, emissive: 0xff9500, emissiveIntensity: 2.0, roughness: .4 }),
  lampLow: new THREE.MeshStandardMaterial({ color: 0xff5a4a, emissive: 0xff2a18, emissiveIntensity: 2.4, roughness: .4 }),
  glass:   new THREE.MeshStandardMaterial({ color: 0x22303c, roughness: .16, metalness: .30 })
};
linearizeMats(T_MAT);

/* --------------------------------------------------------------------------
   模型 —— 底座 + 可旋转头部 + 可俯仰枪管
   -------------------------------------------------------------------------- */
function buildTurretModel(type){
  const g = new THREE.Group();

  /* 底座：三脚架 + 中间转盘 */
  part(g, CYL(0.42, 0.50, 0.16, 12), T_MAT.dark, 0, 0.08, 0);
  for (let i = 0; i < 3; i++){
    const a = i * (PI * 2 / 3) + 0.5;
    const leg = part(g, B(0.07, 0.44, 0.07), T_MAT.dark,
                     Math.cos(a) * 0.30, 0.22, Math.sin(a) * 0.30);
    leg.rotation.z = Math.cos(a) * 0.34;
    leg.rotation.x = -Math.sin(a) * 0.34;
  }
  part(g, CYL(0.26, 0.30, 0.26, 12), T_MAT.body, 0, 0.30, 0);

  /* 头部：绕 Y 轴旋转，带传感器窗和指示灯 */
  const head = new THREE.Group();
  head.position.y = 0.52;
  g.add(head);
  part(head, B(0.44, 0.30, 0.40), T_MAT.body, 0, 0, 0);
  part(head, B(0.30, 0.12, 0.06), T_MAT.glass, 0, 0.06, -0.20);
  part(head, new THREE.SphereGeometry(0.045, 8, 6), T_MAT.lamp, 0.13, 0.10, -0.19);
  part(head, new THREE.SphereGeometry(0.045, 8, 6), T_MAT.lamp, -0.13, 0.10, -0.19);
  part(head, B(0.50, 0.09, 0.34), T_MAT.dark, 0, 0.18, 0);

  /* 枪管组：绕 X 轴俯仰 */
  const barrel = new THREE.Group();
  barrel.position.set(0, 0, -0.16);
  head.add(barrel);

  const muzzle = new THREE.Object3D();
  if (type === 'heavy'){
    /* 单发：一根长管 + 制退器 + 弹匣，剪影一眼能认出来 */
    part(barrel, CYLZ(0.045, 0.045, 0.62, 10), T_MAT.barrel, 0, 0, -0.24);
    part(barrel, CYLZ(0.062, 0.062, 0.10, 10), T_MAT.dark,   0, 0, -0.58);
    part(barrel, B(0.09, 0.14, 0.22), T_MAT.body, 0, -0.10, 0.10);
    muzzle.position.set(0, 0, -0.64);
  } else {
    /* 连射：双短管 + 弹链盒 */
    part(barrel, CYLZ(0.032, 0.032, 0.40, 8), T_MAT.barrel,  0.055, 0, -0.16);
    part(barrel, CYLZ(0.032, 0.032, 0.40, 8), T_MAT.barrel, -0.055, 0, -0.16);
    part(barrel, B(0.17, 0.16, 0.24), T_MAT.body, 0, 0, 0.06);
    part(barrel, B(0.13, 0.13, 0.16), T_MAT.dark, 0.16, -0.06, 0.06);
    muzzle.position.set(0.055, 0, -0.38);
  }
  barrel.add(muzzle);

  g.traverse(o => {
    if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; }
  });
  return { group: g, head, barrel, muzzle };
}

/* --------------------------------------------------------------------------
   建造预览用的半透明"幽灵"炮塔
   -------------------------------------------------------------------------- */
let turretGhost = null;

function ensureGhost(type){
  if (turretGhost && turretGhost.type === type) return turretGhost;
  if (turretGhost) scene.remove(turretGhost.m.group);

  const m = buildTurretModel(type);
  m.group.traverse(o => {
    if (o.isMesh){
      o.castShadow = o.receiveShadow = false;
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.42;
      o.material.depthWrite = false;
    }
  });
  m.group.visible = false;
  scene.add(m.group);
  turretGhost = { type, m };
  return turretGhost;
}

function hideGhost(){ if (turretGhost) turretGhost.m.group.visible = false; }

function ghostOK(){
  if (!turretGhost || !turretGhost.m.group.visible) return false;
  return !!turretGhost.legal;
}

/** 建造预览位置：玩家正前方 3.4m 的地面，吸附到可站立处 */
function ghostSpot(out){
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  const d = 3.4;
  const f = nearestFree(player.pos.x + fx * d, player.pos.z + fz * d,
                        0.4, 1.2, 6, player.pos.y);
  out.set(f[0], player.pos.y, f[1]);
  return out;
}

/* --------------------------------------------------------------------------
   进入 / 退出建造模式
   -------------------------------------------------------------------------- */
function startPlacing(type){
  if (turrets.length >= TURRET_MAX){ SFX.dryFire(); return; }
  const def = TURRETS[type];
  if (G.gold < def.cost){ SFX.dryFire(); return; }

  G.placing = type;
  ensureGhost(type);

  /* 立刻点亮放置按钮，不等下一帧的 updateGhost —— 否则手机端点完商品
     会有一帧看不到按钮在哪 */
  if (UI.placeBtn){
    UI.placeBtn.classList.add('on');
    UI.cancelBtn.classList.add('on');
  }
  pushComms('COMMAND', '选择位置 — 点击 / 按 F 放置，ESC 取消');
  SFX.radio();
}

function cancelPlacing(){
  if (!G.placing) return;
  G.placing = null;
  hideGhost();
  if (UI.placeBtn){
    UI.placeBtn.classList.remove('on');
    UI.cancelBtn.classList.remove('on');
  }
  pushComms('COMMAND', '取消建造');
}

/** 确认放置：扣钱、落地、退出预览 */
function confirmPlace(){
  if (!G.placing) return;
  const type = G.placing, def = TURRETS[type];
  if (!ghostOK()){ SFX.dryFire(); return; }
  if (G.gold < def.cost){ SFX.dryFire(); cancelPlacing(); return; }

  const p = turretGhost.m.group.position;
  G.gold -= def.cost;
  spawnTurret(type, p.x, p.z, p.y);
  cancelPlacing();
  SFX.magIn();
  SFX.killChime();
  updateWaveUI();
  updateSquadUI();
  renderShop();
}

/* --------------------------------------------------------------------------
   生成 / 移除
   -------------------------------------------------------------------------- */
function spawnTurret(type, x, z, y){
  const def = TURRETS[type];
  const m = buildTurretModel(type);
  const obj = m.group;
  obj.position.set(x, y, z);
  scene.add(obj);

  const t = {
    type, def, obj, m,
    hp: def.hp, maxHp: def.hp, dead: false,
    yaw: player.yaw, pitch: 0,
    target: null, tgtT: 0, fireT: 0, burst: 0, reloadT: 0, rounds: def.rounds,
    hitT: 0, builtAt: perfNow
  };
  turrets.push(t);
  pushComms('COMMAND', def.title + ' ONLINE');
  return t;
}

function removeTurret(t, silent){
  const i = turrets.indexOf(t);
  if (i < 0) return;
  turrets.splice(i, 1);
  scene.remove(t.obj);
  if (!silent) pushComms('COMMAND', t.def.title + ' SALVAGED');
}

/** 主动拆除：返还一半造价 */
function salvageTurret(t){
  if (!t) return;
  const refund = Math.round(t.def.cost * 0.5);
  removeTurret(t);
  G.gold += refund;
  pushComms('COMMAND', 'SALVAGED — +' + refund + ' CREDITS');
  SFX.magIn();
  SFX.killChime();
  updateWaveUI();
  updateSquadUI();
  renderShop();
}

/** 修复费用：按缺失耐久比例计，最少 40 */
function repairCostTurret(t){
  const missing = t.maxHp - t.hp;
  if (missing <= 0.5) return 0;
  return Math.max(40, Math.round(t.def.cost * 0.55 * missing / t.maxHp));
}

function repairAllTurrets(){
  let spent = 0;
  for (const t of turrets){
    if (t.hp >= t.maxHp - 0.5) continue;
    t.hp = t.maxHp;
    t.hitT = 0;
    spent++;
  }
  if (spent) pushComms('COMMAND', 'TURRETS REPAIRED ×' + spent);
}

function totalRepairCost(){
  let c = 0;
  for (const t of turrets) c += repairCostTurret(t);
  return c;
}

function anyTurretDamaged(){
  for (const t of turrets) if (t.hp < t.maxHp - 0.5) return true;
  return false;
}

function damageTurret(t, amount){
  if (!t || t.dead) return;
  t.hp -= amount;
  t.hitT = 0.18;

  if (t.hp <= 0){
    t.hp = 0;
    const p = t.obj.position;
    for (let i = 0; i < 14; i++){
      const v = new THREE.Vector3(rand(-1, 1), rand(-0.2, 1), rand(-1, 1))
                .normalize().multiplyScalar(rand(2.5, 7));
      spawnParticle(PS_SPARK, p.x, p.y + 0.5, p.z, v.x, v.y, v.z,
        { color: i < 5 ? [1.0, 0.9, 0.6] : [0.7, 0.75, 0.8],
          size: 0.036, life: rand(0.2, 0.6), drag: 1.5, grav: -13 });
    }
    SFX.magOut();
    SFX.impactWall(0, 5);
    /* 被敌人打掉就是彻底损失，不返还任何信用点 */
    pushComms('COMMAND', t.def.title + ' DESTROYED');
    removeTurret(t, true);
    updateSquadUI();
  }
}

/* --------------------------------------------------------------------------
   建造预览更新 —— 把幽灵炮塔摆到玩家正前方，判断此处是否合法
   -------------------------------------------------------------------------- */
function updateGhost(){
  if (!G.placing || !turretGhost){ if (turretGhost) hideGhost(); return; }

  const g = turretGhost.m.group;
  ghostSpot(_gsTmp);
  g.position.set(_gsTmp.x, _gsTmp.y, _gsTmp.z);
  g.rotation.y = player.yaw;

  const dp = Math.hypot(_gsTmp.x - player.pos.x, _gsTmp.z - player.pos.z);
  const clear = !blocked(_gsTmp.x, _gsTmp.z, _gsTmp.y + 0.2, _gsTmp.y + 1.3, 0.55);
  /* 太近会挡住自己的视线，太远说明吸附失败 */
  const legal = clear && dp > 1.2 && dp < 8 && turrets.length < TURRET_MAX;

  turretGhost.legal = legal;
  g.visible = true;

  /* 合法位置是琥珀色，非法位置转红 */
  const op = legal ? 0.45 : 0.22;
  g.traverse(o => { if (o.isMesh) o.material.opacity = op; });

  if (UI.placeBtn){
    UI.placeBtn.classList.toggle('on', G.placing);
    UI.placeBtn.classList.toggle('no', !legal);
  }
}

/* --------------------------------------------------------------------------
   索敌与开火
   -------------------------------------------------------------------------- */
function muzzlePointTurret(t, out){
  t.m.muzzle.getWorldPosition(out);
  return out;
}

function turretTarget(t){
  let best = null, bestD = Infinity;
  const ox = t.obj.position.x, oz = t.obj.position.z;

  for (const e of enemies){
    if (e.dead) continue;
    const d = Math.hypot(e.obj.position.x - ox, e.obj.position.z - oz);
    if (d > t.def.range || d >= bestD) continue;

    /* 视线：从炮塔口朝敌人胸口打一条射线，被墙挡住就不算 */
    muzzlePointTurret(t, _ttMuz);
    _ttAim.set(e.obj.position.x, e.obj.position.y + 1.05, e.obj.position.z);
    _ttDir.subVectors(_ttAim, _ttMuz);
    const len = _ttDir.length();
    if (len < 0.5) continue;
    _ttDir.divideScalar(len);
    losRay.set(_ttMuz, _ttDir);
    losRay.far = len - 0.3;
    if (losRay.intersectObjects(worldSolid, false).length) continue;

    best = e;
    bestD = d;
  }
  return best;
}

/** 炮塔开火：朝目标胸口打一发，命中判定与玩家武器一致 */
function turretShoot(t, tgt){
  const def = t.def;
  muzzlePointTurret(t, _ttMuz);
  _ttAim.set(tgt.obj.position.x, tgt.obj.position.y + 1.02, tgt.obj.position.z);
  _ttDir.subVectors(_ttAim, _ttMuz);
  const len = _ttDir.length();
  if (len < 0.2) return;
  _ttDir.divideScalar(len);

  /* 散布：炮塔是固定平台，比人稳，但连射型的散布明显更大 */
  const sp = def.spread * 0.030;
  _ttDir.x += rand(-sp, sp);
  _ttDir.y += rand(-sp, sp) * 0.6;
  _ttDir.z += rand(-sp, sp);
  _ttDir.normalize();

  losRay.set(_ttMuz, _ttDir);
  losRay.far = def.range + 4;
  const hits = losRay.intersectObjects(enemyHitMeshes, false);

  enemyMuzzleFlash(_ttMuz);
  const pan = clamp((t.obj.position.x - camera.position.x) / 16, -1, 1);
  SFX.gunshot(def.snd, pan,
    Math.hypot(t.obj.position.x - camera.position.x,
               t.obj.position.z - camera.position.z));

  if (hits.length && hits[0].object.userData &&
      hits[0].object.userData.enemy === tgt){
    const head = hits[0].object.userData.part === 'head';
    damageEnemy(tgt, rand(def.dmg[0], def.dmg[1]) * (head ? 2 : 1),
            head, _ttDir, hits[0].point, true, undefined,
            def.snd === 'sniper' ? 'sniper' : 'rifle');
    fxImpactFlesh(hits[0].point, _ttDir, hits[0].distance, head);
    if (head) SFX.hitBeep(true);
    SFX.hitBeep(false);
  }
}

/* --------------------------------------------------------------------------
   每帧更新
   -------------------------------------------------------------------------- */
function updateTurret(t, dt){
  const def = t.def;
  if (t.hitT > 0) t.hitT -= dt;

  /* 选敌每 0.25s 一次，不必每帧算 */
  t.tgtT -= dt;
  if (t.tgtT <= 0){
    t.tgtT = 0.25;
    const n = turretTarget(t);
    if (n !== t.target){
      t.target = n;
      t.burst = 0;
      t.fireT = n ? 0.18 : 0;
    }
  }
  const tgt = (t.target && !t.target.dead) ? t.target : null;

  if (t.reloadT > 0){
    t.reloadT -= dt;
    t.burst = 0;
    if (t.reloadT <= 0) t.rounds = def.rounds;
  }

  let aimed = false;

  if (tgt){
    const ox = t.obj.position.x, oz = t.obj.position.z;
    const dx = tgt.obj.position.x - ox, dz = tgt.obj.position.z - oz;
    const wantYaw = Math.atan2(-dx, -dz);

    /* 转速有限：这是炮塔相对于人形敌人的主要弱点，绕侧可以快速通过 */
    let dYaw = wantYaw - t.yaw;
    while (dYaw >  PI) dYaw -= PI * 2;
    while (dYaw < -PI) dYaw += PI * 2;
    const step = def.turn * dt;
    t.yaw += clamp(dYaw, -step, step);

    muzzlePointTurret(t, _ttMuz);
    const horiz = Math.hypot(dx, dz) || 1;
    const wantPitch = clamp(
      Math.atan2((tgt.obj.position.y + 1.05) - _ttMuz.y, horiz), -0.5, 0.5);
    t.pitch = damp(t.pitch, wantPitch, 8, dt);

    aimed = Math.abs(dYaw) < 0.16 && Math.abs(wantPitch - t.pitch) < 0.18;

    /* 开火 */
    t.fireT -= dt;
    if (t.reloadT <= 0 && aimed){
      if (t.burst > 0 && t.fireT <= 0){
        t.burst--;
        t.rounds--;
        turretShoot(t, tgt);
        t.fireT = def.gap[1] ? rand(def.gap[0], def.gap[1]) : 0.05;
        if (t.burst === 0) t.fireT = rand(def.rest[0], def.rest[1]);
        if (t.rounds <= 0){
          t.reloadT = rand(def.reload[0], def.reload[1]);
          t.burst = 0;
          t.rounds = def.rounds;
        }
      } else if (t.burst <= 0 && t.fireT <= 0){
        t.burst = randI(def.burst[0], def.burst[1]);
        t.fireT = 0.03;
      }
    }
  } else {
    /* 无目标：缓慢回正扫描 */
    t.pitch = damp(t.pitch, 0, 3, dt);
    t.yaw += dt * 0.25;
    t.fireT -= dt;
  }

  /* 姿态与受击抖动 */
  t.m.head.rotation.y = t.yaw;
  t.m.barrel.rotation.x = t.pitch + (t.hitT > 0 ? Math.sin(t.hitT * 80) * 0.05 : 0);
  t.obj.position.y += (t.hitT > 0 ? Math.sin(t.hitT * 60) * 0.006 : 0);

  /* 耐久低于一半时指示灯由琥珀转为红色，远处也能看出哪座快撑不住了 */
  const low = t.hp < t.maxHp * 0.5;
  if (t._low !== low){
    t._low = low;
    t.m.head.traverse(o => {
      if (o.isMesh && o.material && o.material.emissive !== undefined &&
          o.geometry.type === 'SphereGeometry')
        o.material = low ? T_MAT.lampLow : T_MAT.lamp;
    });
  }
}

function updateTurrets(dt){
  for (const t of turrets) updateTurret(t, dt);
}