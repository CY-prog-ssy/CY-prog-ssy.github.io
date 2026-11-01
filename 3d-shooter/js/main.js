/* =========================================================================
   main.js
   入口引导 / 装配顺序 / 主循环
   ========================================================================= */
"use strict";

if (typeof IS_TOUCH !== 'undefined' && IS_TOUCH &&
    screen.orientation && typeof screen.orientation.lock === 'function'){
  screen.orientation.lock('landscape').catch(() => {});
}

/* ------------------------------------------------------------------ *
 *  fps meter
 * ------------------------------------------------------------------ */
const _fpsEl = document.getElementById('fpsCounter');
let _fpsFrames = 0, _fpsAccum = 0;

let last = perfNow;
let mapAccum = 0, hudAccum = 0;

/* ---- 投掷物 HUD ---- */
const _grenTimerEl = document.getElementById('grenadeTimer');
const _grenFuseEl  = document.getElementById('grenadeFuse');
function updateGrenadeHud(){
  if (!_grenTimerEl) return;
  if (typeof grenadeHudInfo !== 'function') return;
  const info = grenadeHudInfo();

  /* 不在手雷模式 → 直接隐藏 */
  if (!info){
    _grenTimerEl.classList.remove('on');
    _grenTimerEl.classList.add('hide');
    document.body.classList.remove('grenadeMode');
    return;
  }
  document.body.classList.add('grenadeMode');

  /* 手雷模式但没在捏 → 隐藏 */
  if (!info.charging){
    _grenTimerEl.classList.remove('on');
    _grenTimerEl.classList.add('hide');
    return;
  }

  /* 正在捏 → 显示方框 */
  _grenTimerEl.classList.remove('hide');
  _grenTimerEl.classList.add('on');
  _grenFuseEl.textContent = info.fuse.toFixed(1);
  _grenTimerEl.classList.toggle('warn', info.cookWarn);
}

function frame(now){
  requestAnimationFrame(frame);
  perfNow = now;

  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;
  if (dt <= 0) return;

  adaptive(dt);

/* ★ FPS 计数器（开关打开时才累积） */
if (_fpsEl && _fpsEl.classList.contains('on')){
  _fpsFrames++;
  _fpsAccum += dt;
  if (_fpsAccum >= 0.5){
    _fpsEl.textContent = 'FPS ' + Math.round(_fpsFrames / _fpsAccum);
    _fpsFrames = 0;
    _fpsAccum = 0;
  }
}

  if (hitStopT > 0){
    hitStopT -= dt;
    if (hitStopT <= 0){ hitStopT = 0; hitStopScale = 1; }
    dt *= hitStopScale;
  }

  if (G.edgeT > 0){
    G.edgeT -= dt;
    if (G.edgeT <= 0){ G.edgeT = 0; UI.edgeGlow.style.opacity = '0'; }
  }

  const mdx = mouseDX, mdy = mouseDY;

  /* =====================================================================
     状态推进
     ===================================================================== */
  if (G.running && !G.over){
    G.elapsed += dt;

    if (G.phase === 'inter'){
      G.interT -= dt;
      if (G.interT <= 0){ G.interT = 0; startWave(G.wave + 1); }
    } else {
      G.waveT += dt;
      if (G.grace > 0) G.grace -= dt;
    }

    if (!G.shopOpen){
      updatePlayer(dt);
      updateRecovery(dt);
    }

    updateGhost();
    updateCombatDirector();

    for (let i = 0; i < enemies.length; i++){
      const e = enemies[i];
      const hot = e.state === ST.COMBAT || e.state === ST.DEAD;
      if (hot){ updateEnemy(e, dt); }
      else {
        e._aiAcc = (e._aiAcc || 0) + dt;
        if (e._aiAcc >= 1/12){
          const sub = e._aiAcc;
          e._aiAcc = 0;
          updateEnemy(e, sub);
        }
      }
    }

    updateAlly(dt);
    updateDrone(dt);
    updateTurrets(dt);
    if (typeof updateGrenades === 'function') updateGrenades(dt);

    if (intro.active) updateIntro(dt);
  } else {
    mouseDX = mouseDY = 0;
    if (!G.started && !G.over){
      const t = now * 0.000048;
      const r = 23.0 + Math.sin(t * 0.83) * 2.4;
      camera.position.set(
        Math.sin(t) * r,
        6.3 + Math.sin(t * 1.31) * 0.9,
        Math.cos(t) * r * 1.04
      );
      camera.lookAt(
        Math.sin(t + 0.7) * 4.5,
        1.4 + Math.sin(t * 0.7) * 0.4,
        Math.cos(t + 0.7) * 4.5
      );
      camera.rotateZ(Math.sin(t * 1.9) * 0.012);
      if (camera.fov !== BASE_FOV - 8){
        camera.fov = BASE_FOV - 8;
        camera.updateProjectionMatrix();
      }
      for (const e of enemies) e.tag.sprite.visible = false;
    }
  }

  /* =====================================================================
     持续运行的视觉系统
     ===================================================================== */
  dustField.time.value = now * 0.001;
  dustField.camPos.value.copy(camera.position);
  skyUniforms.uTime.value = now * 0.001;
  WX.uTime.value = now * 0.001;

  updateEnv(dt, now * 0.001);
  updateSunShafts();
  updateViewmodel(dt, mdx, mdy);

  /* ★ 清零 —— 必须放在所有消费者读完之后 */
  mouseDX = 0;
  mouseDY = 0;

  updateShells(dt);
  updateTracers(dt);
  updateEnemyFlashes(dt);

  updateParticles(PS_SPARK, dt);
  updateParticles(PS_SOFT, dt);
  updateParticles(PS_SPLASH, dt);

  updateCrosshair(dt);

  if (G.introLock){
    UI.cross.classList.add('hidden');
    vmRoot.visible = false;
  }

  updateDmgArcs(dt);

  /* =====================================================================
     HUD 节流
     ===================================================================== */
  hudAccum += dt;
  if (hudAccum > 0.1){
    hudAccum = 0;
    if (G.running){
      if (G.phase === 'inter'){
        const t = Math.max(0, G.interT);
        UI.timer.textContent = fmtTime(t);
        UI.timer.classList.toggle('warn', t < 8);
        UI.shopTimer.textContent = fmtTime(t);
        UI.shopTimer.classList.toggle('warn', t < 8);
      } else {
        UI.timer.textContent = fmtTime(G.waveT);
        UI.timer.classList.remove('warn');
      }
      updateVitalsUI();
      updateSquadUI();
      updateBossUI();
      updateGrenadeHud();
    }
  }

  mapAccum += dt;
  if (mapAccum > 0.055){
    mapAccum = 0;
    if (G.started) drawMinimap();
  }

  /* =====================================================================
     受伤 / 低血后处理
     ===================================================================== */
  G.dmgFlash = damp(G.dmgFlash, 0, 4.2, dt);

  const lowT = (G.running && player.hp < player.maxHp * 0.2 && player.hp > 0) ? 1 : 0;
  G.lowPulse = damp(G.lowPulse, lowT, 3, dt);

  if (lowT){
    G.hbTimer -= dt;
    if (G.hbTimer <= 0){ SFX.heartbeat(); G.hbTimer = 0.95; }
  }

  G.shieldFlash = damp(G.shieldFlash, 0, 3.2, dt);
  UI.shieldGlow.style.opacity = String(G.shieldFlash * 0.9);

  const pulse = G.lowPulse * (0.55 + 0.45 * Math.sin(now * 0.006));
  UI.lowhp.style.opacity = String(pulse * 0.8);
  G.killFlash = damp(G.killFlash, 0, 7, dt);
  if (G.streakT > 0){
    G.streakT -= dt;
    if (G.streakT <= 0) G.streak = 0;
  }

  compMat.uniforms.time.value  = now * 0.001;
  compMat.uniforms.dmg.value   = G.dmgFlash;
  compMat.uniforms.low.value   = pulse * 0.55;
  compMat.uniforms.flash.value = G.killFlash * 0.045;
  compMat.uniforms.ab.value    = 0.18;

  /* =====================================================================
     渲染
     ===================================================================== */
  renderer.setRenderTarget(sceneRT);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);

  if (G.started){
    renderer.clearDepth();
    renderer.render(vmScene, vmCamera);
  }

  brightMat.uniforms.tDiffuse.value = sceneRT.texture;
  blit(brightMat, bloomA);

  const bw = 1 / Math.max(1, RTW >> 2);
  const bh = 1 / Math.max(1, RTH >> 2);

  blurMat.uniforms.tDiffuse.value = bloomA.texture;
  blurMat.uniforms.dir.value.set(bw * 1.6, 0);
  blit(blurMat, bloomB);
  blurMat.uniforms.tDiffuse.value = bloomB.texture;
  blurMat.uniforms.dir.value.set(0, bh * 1.6);
  blit(blurMat, bloomA);

  compMat.uniforms.tScene.value = sceneRT.texture;
  compMat.uniforms.tBloom.value = bloomA.texture;
  blit(compMat, null);

  if (SET.esp) ESP.draw();
}

/* --------------------------------------------------------------------------
   初始化
   -------------------------------------------------------------------------- */
requestAnimationFrame(frame);

{
  const st = waveStats(1);
  ENEMY_HP_MAX = st.hp;
  spawnEnemies(st.count, st.hp, st.dmg, 1);
}

WEAPONS[0].vm.group.visible = true;

updateWaveUI();
updateVitalsUI();
updateAmmoUI();
updateSquadUI();
updateBossUI();
layoutCrosshair();

BGM.init();

if (UI.boot) UI.boot.classList.add('hide');

{
  const box = new THREE.Box3(), sz = new THREE.Vector3();
  scene.traverse(o => {
    if (!o.isMesh || !o.castShadow || o.isInstancedMesh) return;
    box.setFromObject(o);
    box.getSize(sz);
    if (Math.max(sz.x, sz.y, sz.z) < 0.45) o.castShadow = false;
  });
}