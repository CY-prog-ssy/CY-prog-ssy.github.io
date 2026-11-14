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
let lastFrameLimitTime = 0; // ★ 新增：帧率控制记录

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

/* ★ 减少渲染性能（实验性）：只保留地图本体 */
const _lrHidden = [];
function lrHide(o){
  if (!o || !o.visible || o.userData._lrHidden) return;
  o.visible = false;
  o.userData._lrHidden = true;
  _lrHidden.push(o);
}
function lrRestoreAll(){
  for (let i = _lrHidden.length - 1; i >= 0; i--){
    const o = _lrHidden[i];
    if (o && o.userData && o.userData._lrHidden){
      o.visible = true;
      o.userData._lrHidden = false;
    }
  }
  _lrHidden.length = 0;
}
function applyLowRenderVisibility(){
  if (!SET || !SET.lowRenderMode) return;
  // 敌人
  for (const e of enemies) lrHide(e.obj);
  // 友军 / 无人机 / 炮塔
  if (typeof ally  !== 'undefined' && ally)  lrHide(ally.obj);
  if (typeof drone !== 'undefined' && drone) lrHide(drone.obj);
  if (typeof turrets !== 'undefined') for (const t of turrets) lrHide(t.obj);
  // 粒子三件套
  if (typeof PS_SPARK !== 'undefined'){
    lrHide(PS_SPARK.pts);
    lrHide(PS_SOFT.pts);
    lrHide(PS_SPLASH.pts);
  }
  // 曳光弹 / 弹壳 / 弹孔
  if (typeof TRACERS !== 'undefined') for (const t of TRACERS) if (t.mesh) lrHide(t.mesh);
  if (typeof SHELLS  !== 'undefined') for (const s of SHELLS)  if (s.mesh && s.life > 0) lrHide(s.mesh);
  if (typeof DECALS  !== 'undefined') for (const d of DECALS)  lrHide(d);
  // 敌人枪口火光
  if (typeof ENEMY_FLASH !== 'undefined') for (const f of ENEMY_FLASH) lrHide(f.s);
  // 手雷
  if (typeof grenades !== 'undefined') for (const g of grenades) if (g.mesh) lrHide(g.mesh);
  // 火焰区域
  if (typeof fireZones !== 'undefined') for (const z of fireZones){
    if (z.outer) lrHide(z.outer);
    if (z.ring)  lrHide(z.ring);
    if (z.core)  lrHide(z.core);
  }
  // 爆炸冲击环
  if (typeof EXPLOSION_RINGS !== 'undefined') for (const r of EXPLOSION_RINGS) if (r.mesh && r.t > 0) lrHide(r.mesh);
  // 手持武器（vmScene 整体隐藏）
  if (typeof vmRoot !== 'undefined') lrHide(vmRoot);
}

/* =====================================================================
   ★ 魂环系统渲染逻辑（平铺同心圆版）
   ===================================================================== */
let soulRingGroup = new THREE.Group();
scene.add(soulRingGroup);
let soulRingMeshes = []; 
let _lastSoulThick = -1; // 用于监测粗细是否改变，以便重生成几何体

function updateSoulRings() {
  if (typeof SET === 'undefined') return;
  
  // 如果没开，隐藏并返回
  if (!SET.soulRingEnabled) {
    if (soulRingGroup.visible) soulRingGroup.visible = false;
    return;
  }
  soulRingGroup.visible = true;

  // 如果数量或粗细变了，重新生成环
  if (soulRingMeshes.length !== SET.soulRingCount || _lastSoulThick !== SET.soulRingThickness) {
    _lastSoulThick = SET.soulRingThickness;
    
    // 清理旧的
    soulRingMeshes.forEach(m => { 
      soulRingGroup.remove(m); 
      m.geometry.dispose(); 
      m.material.dispose(); 
    });
    soulRingMeshes = [];
    
    // 计算内径和外径（基础几何体外径为 1.0）
    const innerR = Math.max(0.01, 1.0 - SET.soulRingThickness);
    const outerR = 1.0;
    const geo = new THREE.RingGeometry(innerR, outerR, 64);
    geo.rotateX(-Math.PI / 2); // 躺平在地面
    
    for (let i = 0; i < SET.soulRingCount; i++) {
      const mat = new THREE.MeshBasicMaterial({ 
        color: SET.soulRingColor, 
        transparent: true, 
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false 
      });
      const mesh = new THREE.Mesh(geo, mat);
      soulRingGroup.add(mesh);
      soulRingMeshes.push(mesh);
    }
  }

  // 位置绑定在玩家脚下
  soulRingGroup.position.set(player.pos.x, player.pos.y + 0.02, player.pos.z);
  
  for (let i = 0; i < soulRingMeshes.length; i++) {
    const mesh = soulRingMeshes[i];
    mesh.material.color.set(SET.soulRingColor);
    
    // ★ 由内向外递增：第 0 个环最小，第 1 个稍微大点，以此类推
    const ringRadius = SET.soulRingSize + i * SET.soulRingGap;
    
    // 缩放 X 和 Z 来控制圆圈大小（因为几何体是平铺的），Y 轴保持不变
    mesh.scale.set(ringRadius, 1, ringRadius);
    
    // 稍微抬高一点点，防止多个圈重合在一起产生闪烁（Z-fighting）
    mesh.position.y = i * 0.005;
    
    // 让每个圈缓慢旋转
    const dir = (i % 2 === 0) ? 1 : -1;
    mesh.rotation.y += perfNow * 0.0005 * dir;
  }
}

function frame(now){
  requestAnimationFrame(frame);
  perfNow = now;
  
  // ★ 帧率限制逻辑
  if (SET && SET.fpsLimit > 0) {
    const interval = 1000 / SET.fpsLimit;
    if (now - lastFrameLimitTime < interval - 1) {
      return; // 如果距离上一帧渲染时间还没到，直接跳过这一帧
    }
    lastFrameLimitTime = now;
  }

  if (SET && SET.lowRenderMode) applyLowRenderVisibility();

  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;
  if (dt <= 0) return;

  adaptive(dt);

  /* ★ FPS 计数器 */
  if (_fpsEl && typeof SET !== 'undefined' && SET.showFps){
    _fpsEl.style.display = 'block';
    _fpsFrames++;
    _fpsAccum += dt;
    if (_fpsAccum >= 0.5){
      _fpsEl.textContent = 'FPS ' + Math.round(_fpsFrames / _fpsAccum);
      _fpsFrames = 0;
      _fpsAccum = 0;
    }
  } else if (_fpsEl) {
    _fpsEl.style.display = 'none';
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
  // ★ 杀戮光环渲染与伤害
  if (SET.auraMode && G.running && !G.over) {
    if (!window._auraMesh) {
      window._auraMesh = new THREE.Mesh(
        new THREE.CircleGeometry(1, 32), 
        new THREE.MeshBasicMaterial({color: 0xff0044, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false})
      );
      window._auraMesh.rotation.x = -Math.PI / 2;
      scene.add(window._auraMesh);
    }
    window._auraMesh.visible = true;
    window._auraMesh.position.set(player.pos.x, player.pos.y + 0.05, player.pos.z);
    window._auraMesh.scale.setScalar(SET.auraRadius);
    
    if (SET.espRainbow) {
      const t = performance.now() * 0.001;
      window._auraMesh.material.color.setHSL((t * 0.5) % 1, 1, 0.5);
    } else {
      window._auraMesh.material.color.set(SET.auraColor);
    }
    
    const px = player.pos.x, pz = player.pos.z;
    const r = SET.auraRadius;
    const dmg = SET.auraDmg * dt;
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.obj.position.x - px;
      const dz = e.obj.position.z - pz;
      if (dx*dx + dz*dz <= r*r) {
        damageEnemy(e, dmg, false, new THREE.Vector3(0,1,0), e.obj.position, false);
      }
    }
  } else if (window._auraMesh) {
    window._auraMesh.visible = false;
  }

  // ★ 敌人AI模型变色
  if (SET.enemyColorMode) {
    if (!window._savedEnemyMats) {
      window._savedEnemyMats = {};
      for (const k in E_MAT) {
        window._savedEnemyMats[k] = E_MAT[k].color.getHex();
      }
    }
    let colHex = SET.enemyColor;
    if (SET.espRainbow) {
      const t = performance.now() * 0.001;
      colHex = new THREE.Color().setHSL((t * 0.5) % 1, 1, 0.5).getHex();
    }
    for (const k in E_MAT) {
      E_MAT[k].color.setHex(colHex);
      if (E_MAT[k].emissive) E_MAT[k].emissive.setHex(colHex);
    }
  } else if (window._savedEnemyMats) {
    for (const k in E_MAT) {
      E_MAT[k].color.setHex(window._savedEnemyMats[k]);
      if (E_MAT[k].emissive) E_MAT[k].emissive.setHex(0x000000);
    }
    window._savedEnemyMats = null;
  }
  
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
      
      // ★ 开启优化时：远于 20 米且没有处于交战状态的敌人，更新频率降到 1/4 秒一次
      const distSq = e.obj.position.distanceToSquared(camera.position);
      const isFarAndIdle = (SET && SET.extremeOptimize) && distSq > 400 && !e.canSee;

      if (hot && !isFarAndIdle){ 
        updateEnemy(e, dt); 
      } else {
        e._aiAcc = (e._aiAcc || 0) + dt;
        const limit = isFarAndIdle ? 0.25 : 1/12;
        if (e._aiAcc >= limit){
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

  // ★ 判断是否是夜晚，平滑控制路灯
  if (typeof window.streetLights !== 'undefined' && typeof ENV !== 'undefined') {
    const isNight = (ENV.envTime === 'night');
    const targetIntensity = isNight ? 8.0 : 0;
    for (let i = 0; i < window.streetLights.length; i++) {
      const light = window.streetLights[i];
      light.intensity += (targetIntensity - light.intensity) * 0.05;
    }
  }

  /* ★ 清零 —— 必须放在所有消费者读完之后 */
  mouseDX = 0;
  mouseDY = 0;

  updateShells(dt);
  updateTracers(dt);
  updateEnemyFlashes(dt);
  
  updateSoulRings(); // ★ 更新魂环特效（平铺同心圆）

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

  // ★ 开启优化时，Bloom 渲染分辨率从 1/4 降到 1/8，大幅节省 GPU
  const bloomDiv = (SET && SET.extremeOptimize) ? 3 : 2; 
  const bw = 1 / Math.max(1, RTW >> bloomDiv);
  const bh = 1 / Math.max(1, RTH >> bloomDiv);

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

/* =========================================================================
   ★★★ PRESS TO START 兜底绑定 ★★★
   ========================================================================= */
(function bindStartScreenFallback(){
  if (typeof UI === 'undefined' || !UI.startScreen) return;
  if (UI.startScreen._boundStart) return;
  UI.startScreen._boundStart = true;
  UI.startScreen.addEventListener('click', function(e){
    if (typeof G !== 'undefined' && (G.started || G.over)) return;
    try { if (typeof SFX !== 'undefined' && SFX.init) SFX.init(); } catch(err){}
    try {
      if (typeof IS_TOUCH !== 'undefined' && IS_TOUCH && typeof forceLandscapeFullscreen === 'function') {
        forceLandscapeFullscreen();
      }
    } catch(err){}
    if (typeof startGame === 'function') {
      try { startGame(); } catch(err){ console.error('[startGame] 失败:', err); }
    } else {
      console.warn('[start] startGame 未就绪，检查脚本加载');
    }
  });
})();