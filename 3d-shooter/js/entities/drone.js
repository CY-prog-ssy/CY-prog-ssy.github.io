/* =========================================================================
   drone.js
   医疗无人机 —— 医疗脉冲 / 悬停 / 跟随

   依赖：utils.js / renderer.js / enemy_model.js（D_MAT）/ queries.js /
         effects.js / audio.js
   暴露：drone, DRONE, spawnDrone, despawnDrone, restoreDrone,
         updateDrone, damageDrone, commandDrone
   ========================================================================= */
"use strict";

/* --------------------------------------------------------------------------
   无人机参数

   昂贵、脆弱，但值得。悬在肩上，每 3 秒向你与友军脉冲 40 血 20 甲 ——
   而且它是场上对带甲敌人来说最诱人的目标，
   所以它买来的续航是需要你亲自去守的东西。
   -------------------------------------------------------------------------- */
const DRONE = {
  hp: 170, heal: 40, plate: 20,
  cd: 3.0, r: 0.55, h: 0.62,
  leash: 18, healRadius: 12
};

let drone = null;
const _dpTmp = new THREE.Vector3();

/* --------------------------------------------------------------------------
   模型
   -------------------------------------------------------------------------- */
function buildDroneModel(){
  const g = new THREE.Group();
  /* 机身：一块平板两端倒角，读起来像注塑件 */
  part(g, B(0.46, 0.13, 0.34), D_MAT.shell, 0, 0, 0);
  part(g, B(0.36, 0.07, 0.26), D_MAT.dark,  0, 0.085, 0);
  part(g, B(0.20, 0.05, 0.30), D_MAT.shell, 0, 0.02, -0.02);

  /* 四臂，每角一个旋翼 */
  const rotors = [];
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]){
    part(g, B(0.26, 0.05, 0.055), D_MAT.dark, sx * 0.28, 0.02, sz * 0.20);
    const hub = new THREE.Group();
    hub.position.set(sx * 0.40, 0.055, sz * 0.28);
    g.add(hub);
    part(hub, CYL(0.045, 0.055, 0.05, 10), D_MAT.dark, 0, 0, 0);
    const rot = new THREE.Group();
    rot.position.y = 0.045;
    hub.add(rot);
    /* 三片桨：两片在任何正常帧率下都会频闪，三片就只是模糊 */
    for (let i = 0; i < 3; i++)
      part(rot, B(0.30, 0.008, 0.055), D_MAT.rotor, 0.15, 0, 0, 0, i * (PI * 2 / 3), 0);
    part(hub, CYL(0.10, 0.10, 0.012, 14), D_MAT.rotor, 0, 0.10, 0);   // 桨尖尾迹
    rotors.push(rot);
  }

  /* 关键部位：底部发射镜与 IFF 频闪 */
  part(g, new THREE.SphereGeometry(0.062, 10, 8), D_MAT.glow, 0, -0.085, 0);
  part(g, CYL(0.075, 0.055, 0.05, 10), D_MAT.dark, 0, -0.05, 0);
  part(g, B(0.09, 0.05, 0.09), D_MAT.lens, 0, 0.03, -0.16);

  /* 起落橇，让它有地方降 */
  for (const sx of [-1, 1]){
    part(g, B(0.035, 0.09, 0.035), D_MAT.dark, sx * 0.17, -0.10,  0.10);
    part(g, B(0.035, 0.09, 0.035), D_MAT.dark, sx * 0.17, -0.10, -0.10);
    part(g, B(0.038, 0.022, 0.30), D_MAT.dark, sx * 0.17, -0.145, 0);
  }

  g.traverse(o => {
    if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; }
  });
  return { group: g, rotors, lamp: g.children[8] };
}

/* --------------------------------------------------------------------------
   治疗环池 —— 平铺、接近加性的圆环，从地面上升起
   -------------------------------------------------------------------------- */
const HEAL_RINGS = [0, 1, 2].map(() => {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.28, 0.40, 28),
    new THREE.MeshBasicMaterial({
      color: 0x7ee081, transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false, fog: false
    }));
  m.rotation.x = -PI / 2;
  m.visible = false;
  scene.add(m);
  return { mesh: m, t: 0 };
});

function healRingAt(pos){
  const r = HEAL_RINGS.find(x => x.t <= 0) || HEAL_RINGS[0];
  r.t = 0.55;
  r.mesh.visible = true;
  r.mesh.position.set(pos.x, pos.y + 0.08, pos.z);
}

/* --------------------------------------------------------------------------
   生命周期
   -------------------------------------------------------------------------- */
function despawnDrone(){
  if (!drone) return;
  scene.remove(drone.obj);
  drone = null;
  updateSquadUI();
}

function spawnDrone(atFull){
  const p = buildDroneModel();
  const obj = new THREE.Group();
  obj.add(p.group);
  scene.add(obj);
  obj.position.set(player.pos.x, player.pos.y + 1.75, player.pos.z + 2);

  drone = {
    obj, p,
    hp: DRONE.hp, maxHp: DRONE.hp,
    dead: false, healT: 0,
    spin: rand(0, 7), bob: rand(0, 7),
    tiltX: 0, tiltZ: 0, hitT: 0,
    vel: new THREE.Vector3(),
    /* 指令模式：'follow' 跟随，'hold' 悬停在指定点（当固定治疗站用） */
    mode: 'follow',
    holdX: 0, holdY: 0, holdZ: 0
  };
  pushComms('MEDIC', 'DRONE ON STATION — PULSE EVERY 3 SECONDS');
  SFX.radio();
  SFX.healDone();
  updateSquadUI();
}

/** 波次间隙：满耐久回到空中，不管你此刻在哪 */
function restoreDrone(){
  if (!drone) return;
  const d = drone;
  d.hp = d.maxHp;
  d.dead = false;
  d.healT = 0;
  d.hitT = 0;
  d.mode = 'follow';                     // 休整阶段解除悬停，重新跟随
  d.obj.visible = true;
  d.obj.rotation.set(0, 0, 0);
  d.obj.position.set(player.pos.x, player.pos.y + 1.75, player.pos.z + 2);
  updateSquadUI();
}

function droneDown(){
  const d = drone;
  d.dead = true;
  d.hp = 0;
  d.obj.visible = false;

  _dpTmp.copy(d.obj.position);
  for (let i = 0; i < 16; i++){
    const v = new THREE.Vector3(rand(-1, 1), rand(-.3, 1), rand(-1, 1))
              .normalize().multiplyScalar(rand(2.5, 8));
    spawnParticle(PS_SPARK, _dpTmp.x, _dpTmp.y, _dpTmp.z, v.x, v.y, v.z,
      { color: i < 6 ? [1.0, 0.9, 0.6] : [0.6, 0.9, 1.0],
        size: 0.034, life: rand(0.2, 0.6), drag: 1.4, grav: -14 });
  }
  SFX.magOut();
  SFX.impactWall(0, 4);
  pushComms('MEDIC', 'DRONE DOWN — REPAIR IT IN THE SHOP');
  updateSquadUI();
}

function damageDrone(amount){
  if (!drone || drone.dead) return;
  drone.hp -= amount;
  drone.hitT = 0.22;
  if (drone.hp <= 0){ droneDown(); return; }
  updateSquadUI();
}

/* --------------------------------------------------------------------------
   治疗脉冲

   向你与友军各投 40 血 20 甲。悬停时只治疗半径内的人。
   -------------------------------------------------------------------------- */
function dronePulse(){
  const d = drone;
  let did = false;

  /* 玩家优先 —— 你是买它的人 */
  const needP = player.hp < player.maxHp - 0.5 ||
                player.armor < player.maxArmor - 0.5;
  const needA = (typeof ally !== 'undefined' && ally && !ally.dead) &&
                (ally.hp < ally.maxHp - 0.5 || ally.armor < ally.maxArmor - 0.5);

  if (!needP && !needA) return false;

  if (needP){
    player.hp    = Math.min(player.maxHp,    player.hp + DRONE.heal);
    player.armor = Math.min(player.maxArmor, player.armor + DRONE.plate);
    healRingAt(player.pos);
    for (let i = 0; i < 9; i++)
      spawnParticle(PS_SOFT,
        player.pos.x + rand(-.4, .4),
        player.pos.y + rand(0, 1.7),
        player.pos.z + rand(-.4, .4),
        0, rand(0.5, 1.4), 0,
        { color: [0.49, 0.88, 0.51], size: 0.05,
          life: rand(0.4, 0.8), drag: 1.2, grav: 1.2, alpha: .85 });
    updateVitalsUI();
    did = true;
  }

  if (needA){
    ally.hp    = Math.min(ally.maxHp,    ally.hp + DRONE.heal);
    ally.armor = Math.min(ally.maxArmor, ally.armor + DRONE.plate);
    ally.tagHp = ally.hp;
    ally.tag.draw(ally.hp, false, ally.armor, ally.maxArmor);
    healRingAt(ally.obj.position);
    for (let i = 0; i < 9; i++)
      spawnParticle(PS_SOFT,
        ally.obj.position.x + rand(-.4, .4),
        ally.obj.position.y + rand(0, 1.7),
        ally.obj.position.z + rand(-.4, .4),
        0, rand(0.5, 1.4), 0,
        { color: [0.49, 0.88, 0.51], size: 0.05,
          life: rand(0.4, 0.8), drag: 1.2, grav: 1.2, alpha: .85 });
    updateSquadUI();
    did = true;
  }

  if (did){
    SFX.dronePulse();
    d.p.lamp.material.emissiveIntensity = 6;
  }
  return did;
}

/* --------------------------------------------------------------------------
   每帧更新
   -------------------------------------------------------------------------- */
function updateDrone(dt){
  const d = drone;
  if (!d) return;

  /* 治疗环不管无人机死活都要淡出 */
  for (const r of HEAL_RINGS){
    if (r.t <= 0){ if (r.mesh.visible) r.mesh.visible = false; continue; }
    r.t -= dt;
    const k = clamp(r.t / 0.55, 0, 1);
    const s = lerp(2.6, 0.35, k);
    r.mesh.scale.set(s, s, s);
    r.mesh.material.opacity = 0.75 * k;
    if (r.t <= 0) r.mesh.visible = false;
  }

  if (d.p.lamp.material.emissiveIntensity > 2.4)
    d.p.lamp.material.emissiveIntensity =
      damp(d.p.lamp.material.emissiveIntensity, 2.4, 4, dt);

  /* 波次间隙也保持站位，让你在哨声之前被补满 */
  if (d.dead || !G.running || G.over) return;

  /* ---- 站定：在肩上，靠后略偏右 ---- */
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  const rx =  Math.cos(player.yaw), rz = -Math.sin(player.yaw);
  let tx, tz, ty;

  if (d.mode === 'hold'){
    /* 悬停：停在下令时的高度，对玩家只做很弱的跟随（不移动） */
    tx = d.holdX;
    tz = d.holdZ;
    ty = d.holdY;
  } else {
    tx = player.pos.x - fx * 1.9 + rx * 0.9;
    tz = player.pos.z - fz * 1.9 + rz * 0.9;
    ty = player.pos.y + 1.75;
  }

  /* 站定位置可能落在集装箱里 —— 与其悬穿钢，
     不如把它缩回你自己的头顶上方 */
  if (blocked(tx, tz, ty - 0.25, ty + 0.25, 0.4)){
    tx = player.pos.x;
    tz = player.pos.z;
  }

  const dist = Math.hypot(d.obj.position.x - tx, d.obj.position.z - tz);

  /* 同友军：距离太远直接落到目标点，而不是横穿整个场地飞过去。
     悬停模式下不做这件事（悬停点就是目标点，本来就在那儿）。 */
  if (d.mode !== 'hold' && (dist > DRONE.leash || Math.abs(d.obj.position.y - ty) > 4)){
    d.obj.position.set(tx, ty, tz);
    d.vel.set(0, 0, 0);
  } else {
    const k = 1 - Math.exp(-dt * 3.4);
    d.vel.set((tx - d.obj.position.x) * k / dt, 0, (tz - d.obj.position.z) * k / dt);
    d.obj.position.x += (tx - d.obj.position.x) * k;
    d.obj.position.z += (tz - d.obj.position.z) * k;
    d.obj.position.y = damp(d.obj.position.y, ty, 3.0, dt);
  }

  d.obj.position.x = clamp(d.obj.position.x, -HALF + 0.6, HALF - 0.6);
  d.obj.position.z = clamp(d.obj.position.z, -HALF + 0.6, HALF - 0.6);

  /* ---- 悬停、倾斜、旋转 ---- */
  d.bob += dt * 2.4;
  d.spin += dt * (26 + Math.hypot(d.vel.x, d.vel.z) * 4);
  for (const r of d.p.rotors) r.rotation.y = d.spin;

  const y0 = (d.mode === 'hold' ? d.holdY : player.pos.y + 1.75) +
             Math.sin(d.bob) * 0.06;
  if (Math.abs(d.obj.position.y - ty) < 4)
    d.obj.position.y = damp(d.obj.position.y, y0, 5, dt);

  /* 向前倾 + 被击中时的一下抖动 */
  d.tiltX = damp(d.tiltX, clamp(d.vel.z * 0.05, -0.3, 0.3), 6, dt);
  d.tiltZ = damp(d.tiltZ, clamp(-d.vel.x * 0.05, -0.3, 0.3), 6, dt);
  d.obj.rotation.x = d.tiltX + (d.hitT > 0 ? Math.sin(d.hitT * 90) * 0.18 : 0);
  d.obj.rotation.z = d.tiltZ + (d.hitT > 0 ? Math.cos(d.hitT * 70) * 0.14 : 0);
  d.obj.rotation.y += dt * 0.25;
  if (d.hitT > 0) d.hitT -= dt;

  /* ---- 治疗脉冲 ----
     悬停状态下只治疗范围内的人：把无人机留在原地当固定治疗站是有代价的，
     你得待在它旁边。 */
  d.healT -= dt;
  if (d.healT <= 0){
    if (d.mode === 'hold'){
      const dp = Math.hypot(player.pos.x - d.obj.position.x,
                            player.pos.z - d.obj.position.z);
      const da = (typeof ally !== 'undefined' && ally && !ally.dead)
        ? Math.hypot(ally.obj.position.x - d.obj.position.x,
                     ally.obj.position.z - d.obj.position.z)
        : 0;
      const r = DRONE.healRadius;
      d.outOfRange = dp > r && (!(typeof ally !== 'undefined' && ally && !ally.dead) || da > r);
      if (d.outOfRange){
        d.healT = 0.25;
        return;
      }
    }
    /* 没人受伤：保留充能，而不是烧掉冷却 */
    if (dronePulse()) d.healT = DRONE.cd;
    else d.healT = 0.25;
  }
}

/* --------------------------------------------------------------------------
   指令
   -------------------------------------------------------------------------- */
function commandDrone(){
  if (!drone || drone.dead){ SFX.dryFire(); return; }

  if (drone.mode === 'follow'){
    drone.mode = 'hold';
    drone.holdX = drone.obj.position.x;
    drone.holdY = drone.obj.position.y;
    drone.holdZ = drone.obj.position.z;
    pushComms('MEDIC', 'DRONE HOLDING STATION — COME TO IT FOR HEALS');
  } else {
    drone.mode = 'follow';
    pushComms('MEDIC', 'DRONE RETURNING TO YOU');
  }
  SFX.radio();
  updateSquadUI();
}