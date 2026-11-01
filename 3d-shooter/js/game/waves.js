/* =========================================================================
   waves.js
   波次逻辑 —— 无尽波次 / 敌人配比 / 击杀赏金
   ========================================================================= */
"use strict";

const WAVE_MAX_ENEMIES = 32;
const INTER_TIME        = 30;
const SKIP_GOLD_PER_SEC = 3;

function waveStats(n){
  return {
    count: Math.min(WAVE_MAX_ENEMIES, 8 + 2 * n),
    hp:    Math.round(100 * (1 + 0.20 * (n - 1))),
    dmg:   1 + 0.12 * (n - 1)
  };
}

const killGold  = (n, head) => Math.round(20 + 5 * (n - 1) + (head ? 10 : 0));
const waveBonus = n => 70 + 30 * n;
const fmtTime   = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

function clearEnemies(){
  for (const e of enemies){
    scene.remove(e.obj);
    if (e.gunDropped) scene.remove(e.p.gun);
    e.tag.tex.dispose();
  }
  enemies.length = 0;
  enemyHitMeshes = [];
}

function showWaveBanner(n, st){
  const el = UI.banner;
  const nb = enemies.filter(e => !e.dead && e.tier === TIER.BOSS).length;
  const ne = enemies.filter(e => !e.dead && e.tier === TIER.ELITE).length;
  let extra = '';
  if (nb) extra += ' · BOSS: ' + enemies.find(e => e.tier === TIER.BOSS).name;
  if (ne) extra += ' · ' + ne + ' ELITE' + (ne > 1 ? 'S' : '');

  UI.bannerNum.textContent = n;
  UI.bannerSub.textContent = enemies.length + ' HOSTILES · HP ' + st.hp +
                             ' · DMG ×' + st.dmg.toFixed(2) + extra;

  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
}

function startWave(n){
  G.wave = n;
  G.phase = 'combat';
  G.waveKills = 0;

  const st = waveStats(n);
  G.waveTotal = st.count;
  G.waveT = 0;

  ENEMY_HP_MAX = st.hp;

  clearSniperLasers();
  cancelPlacing();
  clearEnemies();

  spawnEnemies(st.count, st.hp, st.dmg, n);

  G.waveTotal = enemies.length;
  G.grace = GRACE_TIME;
  _sweepAt = 0;

  if (G.shopOpen) closeShop();

  updateWaveUI();
  updateVitalsUI();
  updateAmmoUI();
  updateSquadUI();
  updateBossUI();
  showWaveBanner(n, st);

  pushComms('COMMAND', 'WAVE ' + n + ' INBOUND — ' + st.count + ' HOSTILES');
  SFX.radio();
}

function startIntermission(){
  if (G.phase === 'inter' || G.over) return;
  G.phase = 'inter';
  G.wavesCleared = G.wave;
  G.interT = INTER_TIME;

  const bonus = waveBonus(G.wave);
  G.gold += bonus;

  restoreAlly();
  restoreDrone();

  pushComms('COMMAND', 'WAVE ' + G.wave + ' CLEARED — +' + bonus + ' CREDITS');
  SFX.killChime();
  updateWaveUI();
  openShop();
}