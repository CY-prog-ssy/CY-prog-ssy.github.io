/* =========================================================================
   flow.js
   游戏流程 —— 开局 / 结算 / 重开 / 重置世界状态
   ========================================================================= */
"use strict";

function resetWorldState(){
  /* ★ 手雷状态清理 —— 必须在武器重置之前跑。
     若死亡时正处于手雷模式，grenadeState.active 和手持模型可见性会
     遗留到下一局，出现"左手枪右手雷"的叠影。同时把世界里所有活跃
     手雷收掉、爆炸环熄灭，避免上一局的遗留物砸到新生的自己。 */
  if (typeof grenadeState !== 'undefined'){
    grenadeState.active = false;
    grenadeState.charging = false;
    grenadeState.chargeT = 0;
    grenadeState.fuse = 0;
    grenadeState.prevWeapon = 0;
    for (const k in THROWABLES){
      grenadeState.invCount[k] = THROWABLES[k].count || 3;
    }
  }
  if (typeof grenadeHandRoot !== 'undefined' && grenadeHandRoot){
    grenadeHandRoot.visible = false;
  }
  if (typeof grenades !== 'undefined' && grenades.length){
    for (const g of grenades){
      if (g.mesh){
        g.mesh.visible = false;
        g.mesh.position.set(0, -1000, 0);
      }
    }
    grenades.length = 0;
  }
  /* ★ 对象池现在是按 kind 分桶的对象 —— 遍历所有桶 */
  if (typeof _grenadePool !== 'undefined' && _grenadePool){
    for (const k in _grenadePool){
      const bucket = _grenadePool[k];
      if (!bucket) continue;
      for (const m of bucket){
        if (m){ m.visible = false; m.position.set(0, -1000, 0); }
      }
    }
  }
  if (typeof EXPLOSION_RINGS !== 'undefined'){
    for (const r of EXPLOSION_RINGS){
      r.t = 0;
      if (r.mesh) r.mesh.visible = false;
    }
  }
  document.body.classList.remove('grenadeMode');

  /* ★ 清掉闪光弹白屏遮罩 —— 防止重开时残留 */
  const _flashOv = document.getElementById('flashOverlay');
  if (_flashOv) _flashOv.classList.remove('on');

  /* 武器：先全部隐藏，下面统一点亮当前武器 */
  for (const w of WEAPONS){
    w.mag = w.magSize;
    w.res = w.reserve;
    w.spread = w.spreadBase;
    w.semi = false;
    w.vm.group.visible = false;
  }

  player.pos.set(SPAWN.x, 0, SPAWN.z);
  player.vel.set(0, 0, 0);
  player.yaw = 0;
  player.pitch = 0;

  PLR.maxHp = 100;
  PLR.maxArmor = ARMOR_MAX;
  PLR.dmgMult = 1;
  PLR.hpBuys = PLR.apBuys = PLR.dmgBuys = 0;

  player.maxHp = 100;
  player.maxArmor = ARMOR_MAX;
  player.hp = player.maxHp;
  player.armor = player.maxArmor;
  player.medkits = MEDKIT_MAX;
  player.healT = 0;
  player.armorRegenT = 0;
  player.revives = 0;
  player.invulnT = 0;

  /* ★ 闪光弹护目镜：每局重置，必须重新购买 */
  player.hasFlashGoggles = false;

  despawnAlly();
  despawnDrone();
  cancelPlacing();
  while (turrets.length) removeTurret(turrets[0], true);

  G.gold = 0;
  G.wave = 1;
  G.wavesCleared = 0;
  G.waveKills = 0;
  G.waveTotal = 10;
  G.waveT = 0;
  G.phase = 'combat';
  G.interT = 0;
  G.shopOpen = false;
  G.needLock = false;
  UI.shop.classList.add('hide');
  if (UI.btnShop) UI.btnShop.classList.remove('on');

  UI._bossRef = null;
  UI.bossBar.classList.add('hide');

  player.dead = false;
  player.weapon = 0;
  player.switching = 0;
  player.switchTo = -1;
  player.pendingWpn = -1;
  player.reloadT = 0;
  player.pumpT = 0;
  player.boltT = 0;
  player.fireCooldown = 0;
  player.triggerHeld = false;
  player.clickBuf = 0;
  player.triggerReleased = true;
  player.recoilPitch = player.recoilYaw = 0;
  player.recoilVelP = player.recoilVelY = 0;
  player.burstCount = 0;
  player.burstIdle = 0;
  player.fovKick = 0;
  player.shake = 0;
  player.landShake = 0;
  player.crouch = false;
/* ★ 惩罚计时器：重开一局必须清零，否则上一局最后开的一枪
   会让重开后头 2 秒不能疾跑。 */
  player.noSprintT = 0;
  player.landLockT = 0;
  player.height = STAND_H;
  player.eye = STAND_H;
  player.ads = false;
  player.adsK = 0;
  player.adsEase = 0;
  player.swayAmp = 1;
  player.breath = 0;
  player.breathHeld = false;
  player.breathLock = false;
  player.mantleT = 0;
  player.mantleTilt = 0;
  player.jumpsLeft = 1;
  player.spaceEdge = false;

  sensScale = 1;
  fovCur = BASE_FOV;
  vmRoot.visible = true;
  vmCamera.position.z = 0;
  vmCamera.fov = VM_FOV;
  vmCamera.updateProjectionMatrix();
  UI._scopeK = -1;
  UI.scope.style.opacity = 0;
  compMat.uniforms.scope.value = 0;
  UI.cross.classList.remove('hidden');
  crossSpread = 0;
  crossFireT = 0;
  crossShots = G.shots;
  UI.breathTag.classList.remove('on');
  UI._breathTip = null;
  WEAPONS[0].vm.group.visible = true;

  clearEnemies();

  for (const d of DECALS) d.visible = false;
  for (const s of SHELLS){ s.life = 0; s.mesh.visible = false; s.mesh.scale.setScalar(1); }
  for (const t of TRACERS) t.mesh.visible = false;
  for (const sys of [PS_SPARK, PS_SOFT, PS_SPLASH]){
    for (let i = 0; i < sys.count; i++){ sys.data[i].life = 0; sys.alp[i] = 0; }
    sys.geo.attributes.palpha.needsUpdate = true;
  }
  UI.feed.innerHTML = '';

  G.time = 180;
  G.kills = 0;
  G.headshots = 0;
  G.shots = 0;
  G.hits = 0;
  G.elapsed = 0;
  G.over = false;
  G.dmgFlash = 0;
  G.lowPulse = 0;
  G.hbTimer = 0;
  G.killFlash = 0;
  G.shieldFlash = 0;
  G.streak = 0;
  G.streakT = 0;
  _sweepAt = 0;
  _noiseCd = 0;

  updateWaveUI();
  updateVitalsUI();
  updateAmmoUI();
  updateSquadUI();
  updateBossUI();

  /* 手雷 HUD 也清一下，避免残留的倒计时框 */
  if (typeof updateGrenadeHud === 'function') updateGrenadeHud();
}

function startGame(){
  BGM.stop();

  resetWorldState();
  UI.startScreen.classList.add('hide');
  UI.endScreen.classList.add('hide');
  UI.hud.classList.add('on');

  G.started = true;
  G.running = true;
  G.over = false;

  startWave(1);

  startIntro();
}

function restart(){
  UI.endScreen.classList.add('hide');
  startGame();
}

function endGame(win){
  if (G.over) return;
  G.over = true;
  G.running = false;
  G.started = false;

  G.shopOpen = false;
  G.needLock = false;
  UI.shop.classList.add('hide');
  if (UI.btnShop) UI.btnShop.classList.remove('on');
  if (document.pointerLockElement) document.exitPointerLock();

  player.ads = false;
  player.adsK = 0;
  player.adsEase = 0;
  UI._scopeK = -1;
  UI.scope.style.opacity = 0;
  compMat.uniforms.scope.value = 0;
  UI.cross.classList.remove('hidden');
  vmRoot.visible = true;

  UI.hud.classList.remove('on');
  UI.pause.classList.remove('on');

  for (const e of enemies) e.tag.sprite.visible = false;

  const es = UI.endScreen;
  es.classList.remove('hide', 'win', 'lose');
  es.classList.add(win ? 'win' : 'lose');

  document.getElementById('endTitle').textContent =
    win ? 'SECTOR CLEARED' : 'KILLED IN ACTION';
  document.getElementById('endTag').textContent =
    win ? 'MISSION REPORT // SUCCESS' : 'MISSION REPORT // FAILURE';
  document.getElementById('sKills').textContent = G.kills;
  document.getElementById('sWaves').textContent = G.wavesCleared;
  document.getElementById('sHeads').textContent = G.headshots;

  const acc = G.shots > 0 ? Math.round(G.hits / G.shots * 100) : 0;
  document.getElementById('sAcc').innerHTML = acc + '<span>%</span>';

  const secs = Math.floor(G.elapsed);
  document.getElementById('sTime').textContent =
    Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');

  SFX.alarm(win);
}