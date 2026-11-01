/* =========================================================================
   settings.js
   设置面板 —— 灵敏度 / 按键大小 / 开镜模式 / 环境 / HUD / 作弊
   ========================================================================= */
"use strict";

const SET_KEY = 'ironhold_settings_v2';

/* --------------------------------------------------------------------------
   ★ 画质档位（快捷值）
   点击档位会把下面 5 个子项一起写成该档位预置值；
   之后仍可单独微调任意一项，微调会独立覆盖。
   -------------------------------------------------------------------------- */
const QUALITY_PRESETS = {
  smooth: {
    key: 'smooth', label: '流畅',
    desc: '低分辨率 · 关阴影 · 最省电',
    dpr: 0.85,
    renderScale: 0.60, modelQuality: 2, shadowQuality: 'off',  aaSamples: 2
  },
  balanced: {
    key: 'balanced', label: '均衡',
    desc: '中等分辨率 · 低阴影 · 平衡',
    dpr: 1.00,
    renderScale: 0.80, modelQuality: 4, shadowQuality: 'low',  aaSamples: 2
  },
  high: {
    key: 'high', label: '高清',
    desc: '全分辨率 · 软阴影 · 默认',
    dpr: 1.00,
    renderScale: 1.00, modelQuality: 8, shadowQuality: 'high', aaSamples: 4
  },
  ultra: {
    key: 'ultra', label: '超清',
    desc: '高 DPR · 高清阴影 · 高性能机型',
    dpr: 1.50,
    renderScale: 1.00, modelQuality: 16, shadowQuality: 'high', aaSamples: 8
  }
};

const QUALITY_ORDER = ['smooth', 'balanced', 'high', 'ultra'];

const SET_DEFAULT = {
  /* ★ 画质：触屏默认「流畅」，桌面默认「高清」 */
  quality: IS_TOUCH ? 'smooth' : 'high',
  /* ★ 5 个独立画质子项 */
  renderScale:   1.0,        // 0.50 ~ 1.50
  modelQuality:  8,          // 1 ~ 16（各向异性过滤）
  shadowQuality: 'high',     // off / low / medium / high / ultra
  aaSamples:     4,          // 2 / 4 / 8 / 16
  showFps:       false,
  /* ★ 粒子 / 特效密度 */
  fxDensity: 1.0,
  sens: 1.0, touchSens: 2.2, adsSens: 1.0, dragLook: true, btnScale: 1.0,
  adsMode: 'hold',
  aimAssist: true, aimStrength: 0.65,
  aimSlowdown: 0.35,
  armorRegen: true, healing: true,
  weather: 'clear', time: 'day',
  squadOpen: true,
  godMode: false,
  infiniteAmmo: false,
  esp: false,
  aimPower: 0.65,
  /* ★ 键位：由 input.js 的 DEFAULT_KEYBINDS 提供 */
  keybinds: Object.assign({}, DEFAULT_KEYBINDS)
};

const SET = Object.assign({}, SET_DEFAULT, (() => {
  try {
    const raw = localStorage.getItem(SET_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err){ return {}; }
})());

for (const k in SET_DEFAULT){
  if (k === 'keybinds') continue;              // keybinds 单独合并
  if (typeof SET[k] !== typeof SET_DEFAULT[k]) SET[k] = SET_DEFAULT[k];
}

/* ★ 键位合并：用户存的关键位覆盖默认值（不破坏默认值） */
SET.keybinds = Object.assign({}, DEFAULT_KEYBINDS, SET.keybinds || {});
/* 让 input.js 的 keydown 能读到最新键位（同一引用） */
KEYBINDS = SET.keybinds;

SET.quality   = QUALITY_PRESETS[SET.quality] ? SET.quality : SET_DEFAULT.quality;
SET.sens      = clamp(+SET.sens      || SET_DEFAULT.sens,      0.2, 4.0);
SET.touchSens = clamp(+SET.touchSens || SET_DEFAULT.touchSens, 0.4, 6.0);
SET.adsSens   = clamp(+SET.adsSens   || SET_DEFAULT.adsSens,   0.2, 2.0);

const setNum = (v, d, lo, hi) => {
  const n = +v;
  return Number.isFinite(n) ? clamp(n, lo, hi) : d;
};
SET.fxDensity   = setNum(SET.fxDensity,   SET_DEFAULT.fxDensity,   0.10, 1.00);
SET.btnScale    = setNum(SET.btnScale,    SET_DEFAULT.btnScale,    0.70, 1.30);
SET.adsMode     = (SET.adsMode === 'toggle') ? 'toggle' : 'hold';
SET.aimStrength = setNum(SET.aimStrength, SET_DEFAULT.aimStrength, 0, 1);
SET.aimSlowdown = setNum(SET.aimSlowdown, SET_DEFAULT.aimSlowdown, 0, 1);
SET.aimPower    = setNum(SET.aimPower,    SET_DEFAULT.aimPower,    0, 1);
SET.weather = WEATHER_M[SET.weather] ? SET.weather : 'clear';
SET.time    = TIME_P[SET.time]       ? SET.time    : 'day';
SET.squadOpen  = !!SET.squadOpen;
SET.godMode    = !!SET.godMode;
SET.infiniteAmmo = !!SET.infiniteAmmo;
SET.esp        = !!SET.esp;
/* ★ 5 个独立画质子项的类型校验 */
SET.renderScale   = setNum(SET.renderScale, SET_DEFAULT.renderScale, 0.50, 1.50);
SET.modelQuality  = clamp(Math.round(+SET.modelQuality || SET_DEFAULT.modelQuality), 1, 16);
SET.shadowQuality = (['off','low','medium','high','ultra'].indexOf(SET.shadowQuality) >= 0)
                  ? SET.shadowQuality : SET_DEFAULT.shadowQuality;
SET.aaSamples     = ([2,4,8,16].indexOf(+SET.aaSamples) >= 0)
                  ? +SET.aaSamples : SET_DEFAULT.aaSamples;
SET.showFps       = !!SET.showFps;

/* --------------------------------------------------------------------------
   应用画质 —— 单点应用（滑块 / 单按钮使用）
   -------------------------------------------------------------------------- */
function applyQuality(){
  const q = QUALITY_PRESETS[SET.quality] || QUALITY_PRESETS.high;
  if (typeof applyQualityPreset === 'function') applyQualityPreset(q);
}

/* --------------------------------------------------------------------------
   应用画质 —— 点击档位快选时使用
   把 5 个子项统一写成该档位预设值
   -------------------------------------------------------------------------- */
function applyQualityLoadPreset(){
  const q = QUALITY_PRESETS[SET.quality] || QUALITY_PRESETS.high;
  SET.renderScale   = q.renderScale;
  SET.modelQuality  = q.modelQuality;
  SET.shadowQuality = q.shadowQuality;
  SET.aaSamples     = q.aaSamples;
  if (typeof applyQualityPreset === 'function') applyQualityPreset(q);
}

/* --------------------------------------------------------------------------
   FPS 显示开关 —— 对应 body.fps-on + #fpsCounter.on
   -------------------------------------------------------------------------- */
function applyFpsDisplay(){
  const el = document.getElementById('fpsCounter');
  if (el) el.classList.toggle('on', !!SET.showFps);
  document.body.classList.toggle('fps-on', !!SET.showFps);
}

/* --------------------------------------------------------------------------
   屏按键面板缩放
   -------------------------------------------------------------------------- */
function layoutTouchCluster(){
  const cl = document.getElementById('tcluster');
  if (!cl) return;
  const portrait = innerHeight >= innerWidth;
  const base = portrait
    ? Math.min(innerWidth * 0.68, innerHeight * 0.36) / 260
    : Math.min(innerWidth * 0.48, innerHeight * 0.56) / 190;
  const ts = clamp(base, 0.60, portrait ? 1.12 : 1.0) * (SET.btnScale || 1);
  cl.style.setProperty('--ts', ts.toFixed(3));
}
addEventListener('resize', layoutTouchCluster);
addEventListener('orientationchange', () => setTimeout(layoutTouchCluster, 120));

let settingsSaved = true;

function saveSettings(){
  try {
    localStorage.setItem(SET_KEY, JSON.stringify(SET));
    settingsSaved = localStorage.getItem(SET_KEY) !== null;
  } catch (err){ settingsSaved = false; }
  syncStorageNote();
}

function syncStorageNote(){
  const el = document.getElementById('stornote');
  if (!el) return;
  el.classList.toggle('on', !settingsSaved);
}

function probeStorage(){
  try {
    localStorage.setItem(SET_KEY + '__probe', '1');
    const ok = localStorage.getItem(SET_KEY + '__probe') === '1';
    localStorage.removeItem(SET_KEY + '__probe');
    settingsSaved = ok;
  } catch (err){ settingsSaved = false; }
  syncStorageNote();
}

function applySettings(){
  SENS = SENS_BASE * SET.sens;
  layoutTouchCluster();
  if (typeof UI !== 'undefined' && UI.espLayer)
    UI.espLayer.style.display = SET.esp ? 'block' : 'none';
  applyQuality();
  /* ★ 粒子密度：effects.js / weather.js 读取这个全局变量 */
  window.FX_DENSITY = SET.fxDensity;
  applyFpsDisplay();
}
applySettings();

setEnvironment(SET.time, SET.weather, true);

if (typeof setSquadOpen === 'function') setSquadOpen(SET.squadOpen);

/* --------------------------------------------------------------------------
   面板 UI 句柄
   -------------------------------------------------------------------------- */
const SETUI = {
  box:        document.getElementById('settings'),
  rSens:      document.getElementById('rSens'),
  rTouch:     document.getElementById('rTouch'),
  rAds:       document.getElementById('rAds'),
  vSens:      document.getElementById('vSens'),
  vTouch:     document.getElementById('vTouch'),
  vAds:       document.getElementById('vAds'),
  tOnly:      [...document.querySelectorAll('#settings .tOnly')],
  aaOnly:     [...document.querySelectorAll('#settings .aaOnly')],
  rAA:        document.getElementById('rAA'),
  rSlow:      document.getElementById('rSlow'),
  vAA:        document.getElementById('vAA'),
  vSlow:      document.getElementById('vSlow'),
  rBtn:       document.getElementById('rBtn'),
  vBtn:       document.getElementById('vBtn'),
  togAA:      document.getElementById('togAA'),
  togDrag:    document.getElementById('togDrag'),
  togAdsMode: document.getElementById('togAdsMode'),
  togArmor:   document.getElementById('togArmor'),
  togHeal:    document.getElementById('togHeal'),
  togSquad:   document.getElementById('togSquad'),
  segWeather: document.getElementById('segWeather'),
  segTime:    document.getElementById('segTime'),
  vWeather:   document.getElementById('vWeather'),
  vTime:      document.getElementById('vTime'),
  rAAPow:     document.getElementById('rAAPow'),
  vAAPow:     document.getElementById('vAAPow'),
  togGod:     document.getElementById('togGod'),
  togInfAmmo: document.getElementById('togInfAmmo'),
  togEsp:     document.getElementById('togEsp'),
  /* ★ 开发者面板 */
  devSuicide: document.getElementById('devSuicide'),
  devAddGold: document.getElementById('devAddGold'),
  devEndWave: document.getElementById('devEndWave'),
  /* 画质 */
  segQuality: document.getElementById('segQuality'),
  vQuality:   document.getElementById('vQuality'),
  rFX:        document.getElementById('rFX'),
  vFX:        document.getElementById('vFX'),
  resetQuality: document.getElementById('resetQuality'),
  /* ★ 5 个独立画质子项 */
  rRenderScale:   document.getElementById('rRenderScale'),
  vRenderScale:   document.getElementById('vRenderScale'),
  rModelQuality:  document.getElementById('rModelQuality'),
  vModelQuality:  document.getElementById('vModelQuality'),
  segShadow:      document.getElementById('segShadow'),
  vShadowQuality: document.getElementById('vShadowQuality'),
  segAntialias:   document.getElementById('segAntialias'),
  vAntialias:     document.getElementById('vAntialias'),
  togFps:         document.getElementById('togFps'),
  /* 键位 */
  keybindList: document.getElementById('keybindList'),
  keybindHint: document.getElementById('keybindHint'),
  resetKeybinds: document.getElementById('resetKeybinds'),
  /* 分类导航 */
  setNav:     document.getElementById('setNav'),
  setPanes:   document.getElementById('setPanes')
};
function syncSettingsUI(){
  if (!SETUI.box) return;

  /* ---- 画质档位 ---- */
  if (SETUI.segQuality){
    for (const b of SETUI.segQuality.children)
      b.classList.toggle('on', b.dataset.v === SET.quality);
  }
  if (SETUI.vQuality){
    const q = QUALITY_PRESETS[SET.quality] || QUALITY_PRESETS.high;
    SETUI.vQuality.textContent = q.label;
  }
  if (SETUI.rFX){
    SETUI.rFX.value = Math.round(SET.fxDensity * 100);
    SETUI.vFX.textContent = Math.round(SET.fxDensity * 100) + '%';
  }

  /* ---- ★ 5 个独立画质子项 ---- */
  if (SETUI.rRenderScale){
    SETUI.rRenderScale.value = Math.round(SET.renderScale * 100);
    SETUI.vRenderScale.textContent = Math.round(SET.renderScale * 100) + '%';
  }
  if (SETUI.rModelQuality){
    SETUI.rModelQuality.value = SET.modelQuality;
    SETUI.vModelQuality.textContent = SET.modelQuality + '×';
  }
  if (SETUI.segShadow){
    for (const b of SETUI.segShadow.children)
      b.classList.toggle('on', b.dataset.v === SET.shadowQuality);
    const LBL = { off:'关闭', low:'低', medium:'中', high:'高', ultra:'超高' };
    SETUI.vShadowQuality.textContent = LBL[SET.shadowQuality] || '高';
  }
  if (SETUI.segAntialias){
    for (const b of SETUI.segAntialias.children)
      b.classList.toggle('on', b.dataset.v === String(SET.aaSamples));
    SETUI.vAntialias.textContent = '×' + SET.aaSamples;
  }
  if (SETUI.togFps){
    SETUI.togFps.classList.toggle('on', !!SET.showFps);
    SETUI.togFps.textContent = SET.showFps ? 'ON' : 'OFF';
  }

  /* ---- 灵敏度 ---- */
  SETUI.rSens.value  = Math.round(SET.sens * 100);
  SETUI.rTouch.value = Math.round(SET.touchSens * 100);
  SETUI.rAds.value   = Math.round(SET.adsSens * 100);
  SETUI.vSens.textContent  = SET.sens.toFixed(2);
  SETUI.vTouch.textContent = SET.touchSens.toFixed(2);
  SETUI.vAds.textContent   = SET.adsSens.toFixed(2);

  SETUI.tOnly.forEach(el => el.classList.toggle('off', !IS_TOUCH));

  SETUI.rBtn.value = Math.round(SET.btnScale * 100);
  SETUI.vBtn.textContent = SET.btnScale.toFixed(2);

  SETUI.rAA.value   = Math.round(SET.aimStrength * 100);
  SETUI.rSlow.value = Math.round(SET.aimSlowdown * 100);
  SETUI.vAA.textContent   = SET.aimStrength.toFixed(2);
  SETUI.vSlow.textContent = SET.aimSlowdown.toFixed(2);
  SETUI.aaOnly.forEach(el => el.classList.toggle('off', !SET.aimAssist));

  SETUI.togAA.classList.toggle('on', !!SET.aimAssist);
  SETUI.togAA.textContent = SET.aimAssist ? 'ON' : 'OFF';

  SETUI.togDrag.classList.toggle('on', !!SET.dragLook);
  SETUI.togDrag.textContent = SET.dragLook ? 'ON' : 'OFF';

  const holdADS = SET.adsMode !== 'toggle';
  SETUI.togAdsMode.classList.add('on');
  SETUI.togAdsMode.textContent = holdADS ? '按下 HOLD' : '点击 TOGGLE';

  SETUI.togArmor.classList.toggle('on', !!SET.armorRegen);
  SETUI.togArmor.textContent = SET.armorRegen ? 'ON' : 'OFF';

  SETUI.togHeal.classList.toggle('on', !!SET.healing);
  SETUI.togHeal.textContent = SET.healing ? 'ON' : 'OFF';

  for (const b of SETUI.segWeather.children)
    b.classList.toggle('on', b.dataset.v === SET.weather);
  for (const b of SETUI.segTime.children)
    b.classList.toggle('on', b.dataset.v === SET.time);
  SETUI.vWeather.textContent = WEATHER_M[SET.weather].label;
  SETUI.vTime.textContent    = ({ day: '白天', dusk: '黄昏', night: '夜晚' })[SET.time];

  SETUI.togSquad.classList.add('on');
  SETUI.togSquad.textContent = SET.squadOpen ? '展开' : '收起';

  if (SETUI.rAAPow){
    SETUI.rAAPow.value = Math.round(SET.aimPower * 100);
    SETUI.vAAPow.textContent = SET.aimPower.toFixed(2);
  }
  if (SETUI.togGod){
    SETUI.togGod.classList.toggle('on', !!SET.godMode);
    SETUI.togGod.textContent = SET.godMode ? 'ON' : 'OFF';
  }
  if (SETUI.togInfAmmo){
    SETUI.togInfAmmo.classList.toggle('on', !!SET.infiniteAmmo);
    SETUI.togInfAmmo.textContent = SET.infiniteAmmo ? 'ON' : 'OFF';
  }
  if (SETUI.togEsp){
    SETUI.togEsp.classList.toggle('on', !!SET.esp);
    SETUI.togEsp.textContent = SET.esp ? 'ON' : 'OFF';
  }
}

/* --------------------------------------------------------------------------
   ★ 打开 / 关闭 —— 强制设置面板以覆盖层显示
   -------------------------------------------------------------------------- */
function openSettings(){
  probeStorage();
  if (G.running && IS_TOUCH && typeof pauseGameTouch === 'function') pauseGameTouch();
  syncSettingsUI();

  const box = SETUI.box;
  if (!box) return;
  box.classList.remove('hide');

  /* 打开时把内容滚回顶部 */
  const panel = box.querySelector('.setbox');
  if (panel) panel.scrollTop = 0;

  /* 锁定 body 滚动 */
  document.body.classList.add('modal-open');
}

function closeSettings(){
  if (!SETUI.box) return;
  SETUI.box.classList.add('hide');
  document.body.classList.remove('modal-open');
  saveSettings();
}

/* --------------------------------------------------------------------------
   绑定控件
   -------------------------------------------------------------------------- */
function bindSlider(el, key, lo, hi){
  if (!el) return;
  const on = () => {
    SET[key] = clamp(el.value / 100, lo, hi);
    applySettings();
    syncSettingsUI();
    saveSettings();
  };
  el.addEventListener('input', on);
  el.addEventListener('change', on);
}

bindSlider(SETUI.rSens,  'sens',      0.2, 4.0);
bindSlider(SETUI.rTouch, 'touchSens', 0.4, 6.0);
bindSlider(SETUI.rAds,   'adsSens',   0.2, 2.0);
bindSlider(SETUI.rBtn,   'btnScale',  0.70, 1.30);
bindSlider(SETUI.rAA,    'aimStrength', 0, 1);
bindSlider(SETUI.rSlow,  'aimSlowdown', 0, 1);
if (SETUI.rAAPow) bindSlider(SETUI.rAAPow, 'aimPower', 0, 1);

/* ★ 粒子密度滑块 —— 独立于画质档位，改动立即写入 window.FX_DENSITY */
if (SETUI.rFX){
  const onFX = () => {
    SET.fxDensity = clamp(SETUI.rFX.value / 100, 0.10, 1.00);
    window.FX_DENSITY = SET.fxDensity;
    SETUI.vFX.textContent = Math.round(SET.fxDensity * 100) + '%';
    saveSettings();
  };
  SETUI.rFX.addEventListener('input', onFX);
  SETUI.rFX.addEventListener('change', onFX);
}

if (SETUI.togAA) SETUI.togAA.addEventListener('click', () => {
  SET.aimAssist = !SET.aimAssist;
  syncSettingsUI();
  saveSettings();
});

if (SETUI.togDrag) SETUI.togDrag.addEventListener('click', () => {
  SET.dragLook = !SET.dragLook;
  syncSettingsUI();
  saveSettings();
});

if (SETUI.togAdsMode) SETUI.togAdsMode.addEventListener('click', () => {
  SET.adsMode = (SET.adsMode === 'toggle') ? 'hold' : 'toggle';
  if (typeof setADS === 'function') setADS(false);
  syncSettingsUI();
  saveSettings();
});

if (SETUI.togArmor) SETUI.togArmor.addEventListener('click', () => {
  SET.armorRegen = !SET.armorRegen;
  syncSettingsUI();
  saveSettings();
  if (typeof updateVitalsUI === 'function') updateVitalsUI();
});

if (SETUI.togHeal) SETUI.togHeal.addEventListener('click', () => {
  SET.healing = !SET.healing;
  syncSettingsUI();
  saveSettings();
  if (typeof updateVitalsUI === 'function') updateVitalsUI();
});

if (SETUI.togSquad) SETUI.togSquad.addEventListener('click', () => {
  setSquadOpen(!SET.squadOpen);
  syncSettingsUI();
  saveSettings();
});

if (SETUI.togGod){
  SETUI.togGod.addEventListener('click', () => {
    SET.godMode = !SET.godMode;
    syncSettingsUI();
    saveSettings();
  });
}
if (SETUI.togInfAmmo){
  SETUI.togInfAmmo.addEventListener('click', () => {
    SET.infiniteAmmo = !SET.infiniteAmmo;
    if (SET.infiniteAmmo){
      for (const w of WEAPONS){ w.mag = w.magSize; w.res = w.maxReserve; }
      if (typeof updateAmmoUI === 'function') updateAmmoUI();
    }
    syncSettingsUI();
    saveSettings();
  });
}
if (SETUI.togEsp){
  SETUI.togEsp.addEventListener('click', () => {
    SET.esp = !SET.esp;
    if (typeof UI !== 'undefined' && UI.espLayer)
      UI.espLayer.style.display = SET.esp ? 'block' : 'none';
    syncSettingsUI();
    saveSettings();
  });
}

/* ★★★ 开发者面板：自杀 / 加金币 / 结束波次 ★★★ */

/* 若设置面板是从暂停状态打开的（桌面 ESC / 手机齿轮都会暂停），
   点任何开发者按钮之前先把游戏恢复运行，否则波次间计时不走、
   商店打开后暂停遮罩会盖住商店。 */
function _devResumeGame(){
  if (typeof UI !== 'undefined' && UI.pause) UI.pause.classList.remove('on');
  if (G.paused) G.paused = false;
  if (!G.running && G.started && !G.over) G.running = true;
  if (typeof SFX !== 'undefined' && SFX.resume){
    try { SFX.resume(); } catch (e){}
  }
}

/* --- 自杀 --- */
if (SETUI.devSuicide){
  const doSuicide = () => {
    if (!G.started || G.over || player.dead) return;
    closeSettings();
    _devResumeGame();

    /* 直接清零生命与护甲，绕过无敌（SET.godMode 只在 applyDamageTo 里生效），
       再走标准的死亡流程，这样复活币会先消耗，符合"这是死亡"的语义。 */
    player.hp = 0;
    player.armor = 0;
    if (typeof updateVitalsUI === 'function') updateVitalsUI();

    if (typeof onPlayerDown === 'function'){
      onPlayerDown(player, null);
    } else {
      player.dead = true;
      if (typeof endGame === 'function') endGame(false);
    }

    /* 复活后（有复活币）回到游戏，桌面上把指针锁重新抢回来 */
    if (G.started && !G.over && !player.dead &&
        typeof IS_TOUCH !== 'undefined' && !IS_TOUCH &&
        typeof requestLock === 'function'){
      requestLock();
    }
  };
  SETUI.devSuicide.addEventListener('click', (e) => {
    e.stopPropagation();
    doSuicide();
  });
  SETUI.devSuicide.addEventListener('touchend', (e) => {
    e.preventDefault(); e.stopPropagation();
    doSuicide();
  }, { passive: false });
}

/* --- 加金币 --- */
if (SETUI.devAddGold){
  const doAddGold = () => {
    if (!G.started || G.over) return;
    G.gold += 1000;
    if (typeof updateWaveUI === 'function') updateWaveUI();
    /* 商店/顶栏的金币数字 + 顶栏 bump 动画 */
    if (typeof UI !== 'undefined' && UI.goldRow){
      UI.goldRow.classList.remove('bump');
      void UI.goldRow.offsetWidth;
      UI.goldRow.classList.add('bump');
    }
    /* 商店打开时重新渲染，让"金币不足"瞬间变成"购买" */
    if (G.shopOpen && typeof renderShop === 'function') renderShop();
    if (typeof SFX !== 'undefined' && SFX.killChime){
      try { SFX.killChime(1); } catch (e){}
    }
  };
  SETUI.devAddGold.addEventListener('click', (e) => { e.stopPropagation(); doAddGold(); });
  SETUI.devAddGold.addEventListener('touchend', (e) => {
    e.preventDefault(); e.stopPropagation(); doAddGold();
  }, { passive: false });
}

/* --- 强制结束当前波次 --- */
if (SETUI.devEndWave){
  const doEndWave = () => {
    if (!G.started || G.over) return;
    if (G.phase === 'inter') return;             // 已经在波次间，忽略

    closeSettings();
    _devResumeGame();

    /* 清掉场上还活着的敌人，否则商店开着敌人还会继续开枪。 */
    if (typeof clearEnemies === 'function') clearEnemies();
    if (typeof clearSniperLasers === 'function') clearSniperLasers();

    /* 走正常的波次结束流程：结算赏金、恢复友军与无人机、打开商店 */
    if (typeof startIntermission === 'function'){
      startIntermission();
    }
  };
  SETUI.devEndWave.addEventListener('click', (e) => { e.stopPropagation(); doEndWave(); });
  SETUI.devEndWave.addEventListener('touchend', (e) => {
    e.preventDefault(); e.stopPropagation(); doEndWave();
  }, { passive: false });
}

/* ★★★ 开发者面板结束 ★★★ */

function bindSeg(el, key, apply){
  if (!el) return;
  for (const b of el.children){
    const doIt = () => {
      if (SET[key] === b.dataset.v) return;
      SET[key] = b.dataset.v;
      apply();
      syncSettingsUI();
      saveSettings();
    };
    b.addEventListener('click', doIt);
    b.addEventListener('touchend', e => { e.preventDefault(); doIt(); }, { passive: false });
  }
}
bindSeg(SETUI.segWeather, 'weather', () => setEnvironment(SET.time, SET.weather));
bindSeg(SETUI.segTime,    'time',    () => setEnvironment(SET.time, SET.weather));

/* ★ 画质档位点击：立即把 5 个子项一起写成预设值并应用 */
bindSeg(SETUI.segQuality, 'quality', () => applyQualityLoadPreset());

/* ------------------------------------------------------------------ *
 *  bind —— 5 个独立画质子项
 * ------------------------------------------------------------------ */
if (SETUI.rRenderScale){
  const on = () => {
    SET.renderScale = clamp(SETUI.rRenderScale.value / 100, 0.50, 1.50);
    SETUI.vRenderScale.textContent = Math.round(SET.renderScale * 100) + '%';
    applyQuality();
    saveSettings();
  };
  SETUI.rRenderScale.addEventListener('input',  on);
  SETUI.rRenderScale.addEventListener('change', on);
}

if (SETUI.rModelQuality){
  const on = () => {
    SET.modelQuality = clamp(Math.round(+SETUI.rModelQuality.value || 8), 1, 16);
    SETUI.vModelQuality.textContent = SET.modelQuality + '×';
    if (typeof applyModelQuality === 'function') applyModelQuality(SET.modelQuality);
    saveSettings();
  };
  SETUI.rModelQuality.addEventListener('input',  on);
  SETUI.rModelQuality.addEventListener('change', on);
}

if (SETUI.segShadow){
  for (const b of SETUI.segShadow.children){
    b.addEventListener('click', () => {
      if (SET.shadowQuality === b.dataset.v) return;
      SET.shadowQuality = b.dataset.v;
      if (typeof applyShadowQuality === 'function') applyShadowQuality(SET.shadowQuality);
      syncSettingsUI();
      saveSettings();
    });
  }
}

if (SETUI.segAntialias){
  for (const b of SETUI.segAntialias.children){
    b.addEventListener('click', () => {
      const s = +b.dataset.v;
      if (!s || SET.aaSamples === s) return;
      SET.aaSamples = s;
      if (typeof allocTargets === 'function') allocTargets();
      syncSettingsUI();
      saveSettings();
    });
  }
}

if (SETUI.togFps){
  SETUI.togFps.addEventListener('click', () => {
    SET.showFps = !SET.showFps;
    applyFpsDisplay();
    syncSettingsUI();
    saveSettings();
  });
}

/* ★ 恢复默认画质 */
if (SETUI.resetQuality){
  SETUI.resetQuality.addEventListener('click', () => {
    SET.quality   = SET_DEFAULT.quality;
    SET.fxDensity = SET_DEFAULT.fxDensity;
    window.FX_DENSITY = SET.fxDensity;
    applyQualityLoadPreset();
    saveSettings();
  });
}

/* ★ 画质档位：点击立即把 5 个子项一起写成预设值并应用 */
bindSeg(SETUI.segQuality, 'quality', () => applyQualityLoadPreset());

/* --------------------------------------------------------------------------
   按钮绑定
   -------------------------------------------------------------------------- */
const setCloseBtn = document.getElementById('setClose');
if (setCloseBtn) setCloseBtn.addEventListener('click', closeSettings);

const setResetBtn = document.getElementById('setReset');
if (setResetBtn) setResetBtn.addEventListener('click', () => {
  Object.assign(SET, SET_DEFAULT);
  /* ★ 键位重置：保持 KEYBINDS 与 SET.keybinds 同一引用 */
  KEYBINDS = SET.keybinds;
  applySettings();
  setEnvironment(SET.time, SET.weather);
  setSquadOpen(SET.squadOpen);
  syncSettingsUI();
  renderKeybindsUI();
  saveSettings();
  if (typeof updateVitalsUI === 'function') updateVitalsUI();
applyFpsDisplay();
});

const pauseSetBtn = document.getElementById('pauseSetBtn');
if (pauseSetBtn) pauseSetBtn.addEventListener('click', e => {
  e.stopPropagation();
  openSettings();
});

const shopDeployBtn = document.getElementById('shopDeploy');
if (shopDeployBtn) shopDeployBtn.addEventListener('click', e => {
  e.stopPropagation();
  if (typeof deployNow === 'function') deployNow();
});

if (typeof UI !== 'undefined' && UI.shop){
  UI.shop.addEventListener('click', e => {
    if (e.target === UI.shop && G.shopOpen){
      if (typeof closeShop === 'function') closeShop(true);
    }
  });
}

const startSetBtn = document.getElementById('startSet');
if (startSetBtn) startSetBtn.addEventListener('click', e => {
  e.stopPropagation();
  openSettings();
});

/* 点击设置面板遮罩层关闭 */
if (SETUI.box){
  SETUI.box.addEventListener('click', e => {
    if (e.target === SETUI.box) closeSettings();
  });
}

addEventListener('keydown', e => {
  if (e.code === 'Escape' && SETUI.box && !SETUI.box.classList.contains('hide'))
    closeSettings();
});

/* --------------------------------------------------------------------------
   ★ 左侧分类导航切换
   -------------------------------------------------------------------------- */
(function bindSettingsTabs(){
  const nav   = SETUI.setNav;
  const panes = SETUI.setPanes;
  if (!nav || !panes) return;

  nav.addEventListener('click', (e) => {
    const btn = e.target.closest ? e.target.closest('.settab') : null;
    if (!btn || !btn.dataset.tab) return;
    const tab = btn.dataset.tab;
    for (const b of nav.querySelectorAll('.settab')) b.classList.toggle('on', b === btn);
    for (const p of panes.querySelectorAll('.setpane'))
      p.classList.toggle('on', p.dataset.pane === tab);
    panes.scrollTop = 0;
  });
})();

/* =========================================================================
   ★ 键位 UI
   ========================================================================= */
const KEYBIND_LABELS = {
  forward: '前进', back: '后退', left: '左移', right: '右移',
  jump: '跳跃', sprint: '冲刺', crouch: '下蹲',
  reload: '换弹', heal: '医疗包', grenade: '投掷物',
  fireMode: '开火模式', allyCmd: '友军指令', droneCmd: '无人机指令',
  shop: '商店', weapon1: '武器 1', weapon2: '武器 2',
  weapon3: '武器 3', weapon4: '武器 4', pause: '暂停'
};

function prettyKeyName(code){
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  if (code === 'Space') return 'Space';
  if (code === 'Escape') return 'Esc';
  if (code === 'Enter') return 'Enter';
  if (code === 'Tab') return 'Tab';
  if (code === 'CapsLock') return 'Caps';
  if (code === 'Backspace') return '⌫';
  if (code === 'ShiftLeft') return 'Shift L';
  if (code === 'ShiftRight') return 'Shift R';
  if (code === 'ControlLeft') return 'Ctrl L';
  if (code === 'ControlRight') return 'Ctrl R';
  if (code === 'AltLeft') return 'Alt L';
  if (code === 'AltRight') return 'Alt R';
  if (code === 'ArrowUp') return '↑';
  if (code === 'ArrowDown') return '↓';
  if (code === 'ArrowLeft') return '←';
  if (code === 'ArrowRight') return '→';
  if (code === 'Comma') return ',';
  if (code === 'Period') return '.';
  if (code === 'Slash') return '/';
  if (code === 'Semicolon') return ';';
  if (code === 'Quote') return "'";
  if (code === 'BracketLeft') return '[';
  if (code === 'BracketRight') return ']';
  if (code === 'Backquote') return '`';
  if (code === 'Minus') return '-';
  if (code === 'Equal') return '=';
  return code;
}

let _bindEditing = null;
let _bindHandlerRef = null;

function _detachBindHandler(){
  if (_bindHandlerRef){
    document.removeEventListener('keydown', _bindHandlerRef, true);
    _bindHandlerRef = null;
  }
}

function cancelBindEdit(){
  _detachBindHandler();
  _bindEditing = null;
  renderKeybindsUI();
  if (SETUI.keybindHint) SETUI.keybindHint.textContent = '点击任意键位进行编辑';
}

function startBindEdit(action){
  if (_bindEditing === action) return;
  _detachBindHandler();
  _bindEditing = action;
  renderKeybindsUI();
  if (SETUI.keybindHint) SETUI.keybindHint.textContent = '按下新键…（Esc 取消）';

  _bindHandlerRef = (e) => {
    e.preventDefault();
    e.stopPropagation();

    /* 编辑"暂停"时允许把 Esc 绑上去；其他情况 Esc 就是取消 */
    if (e.code === 'Escape' && action !== 'pause'){
      cancelBindEdit();
      return;
    }

    /* 冲突：从其他动作里移除同一个 code */
    for (const act in SET.keybinds){
      if (act === action) continue;
      const list = SET.keybinds[act];
      const idx = list.indexOf(e.code);
      if (idx >= 0) list.splice(idx, 1);
    }

    SET.keybinds[action] = [e.code];

    _detachBindHandler();
    _bindEditing = null;
    saveSettings();
    renderKeybindsUI();
    if (SETUI.keybindHint){
      SETUI.keybindHint.textContent = '已保存';
      setTimeout(() => {
        if (SETUI.keybindHint && !_bindEditing)
          SETUI.keybindHint.textContent = '点击任意键位进行编辑';
      }, 1200);
    }
  };

  document.addEventListener('keydown', _bindHandlerRef, true);
}

function renderKeybindsUI(){
  const box = SETUI.keybindList;
  if (!box) return;
  box.innerHTML = '';

  for (const action in KEYBIND_LABELS){
    const row = document.createElement('div');
    row.className = 'kbbind';

    const lbl = document.createElement('span');
    lbl.className = 'kblbl';
    lbl.textContent = KEYBIND_LABELS[action];

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kbkey' + (_bindEditing === action ? ' listening' : '');
    const list = SET.keybinds[action] || [];
    btn.textContent = list.length ? list.map(prettyKeyName).join(' / ') : '未绑定';
    btn.addEventListener('click', () => startBindEdit(action));

    row.appendChild(lbl);
    row.appendChild(btn);
    box.appendChild(row);
  }
}

/* 恢复默认键位 */
if (SETUI.resetKeybinds){
  SETUI.resetKeybinds.addEventListener('click', () => {
    /* 保持 SET.keybinds 与 KEYBINDS 同一引用：清空再填 */
    for (const k in SET.keybinds) delete SET.keybinds[k];
    Object.assign(SET.keybinds, DEFAULT_KEYBINDS);
    saveSettings();
    renderKeybindsUI();
    if (SETUI.keybindHint) SETUI.keybindHint.textContent = '已恢复默认键位';
    setTimeout(() => {
      if (SETUI.keybindHint && !_bindEditing)
        SETUI.keybindHint.textContent = '点击任意键位进行编辑';
    }, 1200);
  });
}

/* =========================================================================
   ★ 左侧分类导航切换
   ========================================================================= */
(function bindSettingsTabs(){
  const nav   = SETUI.setNav;
  const panes = SETUI.setPanes;
  if (!nav || !panes) return;

  nav.addEventListener('click', (e) => {
    const btn = e.target.closest ? e.target.closest('.settab') : null;
    if (!btn || !btn.dataset.tab) return;
    const tab = btn.dataset.tab;
    for (const b of nav.querySelectorAll('.settab')) b.classList.toggle('on', b === btn);
    for (const p of panes.querySelectorAll('.setpane'))
      p.classList.toggle('on', p.dataset.pane === tab);
    panes.scrollTop = 0;
  });
})();

/* =========================================================================
   ★ openSettings 里也要刷新键位列表（覆盖"每次打开时重建 UI"）
   ========================================================================= */
const _origOpenSettings = openSettings;
window.openSettings = function(){
  _origOpenSettings();
  renderKeybindsUI();
  if (SETUI.keybindHint) SETUI.keybindHint.textContent = '点击任意键位进行编辑';
};

/* 首次加载时渲染一遍（隐藏状态下也能构建 DOM，无副作用） */
renderKeybindsUI();

/* 暴露到 window */
window.openSettings  = openSettings;
window.closeSettings = closeSettings;


/* =========================================================================
   ★ 键位编辑模式：拖动按钮重定位（终极修复版）
   ========================================================================= */
const BTN_IDS = [
  'btnFire', 'btnAds', 'btnJump', 'btnReload', 'btnCrouch', 
  'btnHeal', 'btnShop', 'btnGrenade', 'btnPause', 'btnSet', 'btnFullscreen'
];

let isKeyEditMode = false;
window.__keyEditMode = false;

// 1. 进入编辑模式
function enterKeyEdit() {
  isKeyEditMode = true;
  window.__keyEditMode = true;
  document.body.classList.add('key-edit');

  // 隐藏设置面板和暂停界面
  if (typeof closeSettings === 'function') closeSettings();
  const pauseEl = document.getElementById('pause');
  if (pauseEl) pauseEl.classList.remove('on');

  let savedKeys = {};
  try { savedKeys = JSON.parse(localStorage.getItem('ironhold_keys')) || {}; } catch (e) {}

  const touchUI = document.getElementById('touchUI');
  const tcluster = document.getElementById('tcluster');

  BTN_IDS.forEach(id => {
    const b = document.getElementById(id);
    if (!b) return;

    // 【关键修复】如果是 tcluster 里的按钮，把它移出来！
    // 因为 #tcluster 有 transform: scale 缩放，会导致拖拽坐标错乱
    if (b.parentNode && b.parentNode.id === 'tcluster') {
      touchUI.appendChild(b);
    }

    // 设为固定定位
    b.style.position = 'fixed';
    b.style.right = 'auto';
    b.style.bottom = 'auto';
    b.style.transform = 'translate(-50%, -50%)'; 

    if (savedKeys[id]) {
      b.style.left = savedKeys[id][0] + '%';
      b.style.top  = savedKeys[id][1] + '%';
    } else {
      // 第一次进入：读取当前实际位置，转为百分比
      const r = b.getBoundingClientRect();
      const cx = (r.left + r.width / 2) / window.innerWidth * 100;
      const cy = (r.top + r.height / 2) / window.innerHeight * 100;
      b.style.left = cx + '%';
      b.style.top  = cy + '%';
    }
  });
}

// 2. 退出编辑模式
function exitKeyEdit() {
  isKeyEditMode = false;
  window.__keyEditMode = false;
  document.body.classList.remove('key-edit');

  const tcluster = document.getElementById('tcluster');
  const touchUI = document.getElementById('touchUI');

  BTN_IDS.forEach(id => {
    const b = document.getElementById(id);
    if (!b) return;
    
    // 清除内联样式
    b.style.position = '';
    b.style.right = '';
    b.style.bottom = '';
    b.style.left = '';
    b.style.top = '';
    b.style.transform = '';

    // 归位：原本属于 tcluster 的放回去，其他的放回 touchUI
    if (['btnFire', 'btnAds', 'btnJump', 'btnReload', 'btnCrouch', 'btnHeal', 'btnShop', 'btnGrenade'].includes(id)) {
      if (tcluster) tcluster.appendChild(b);
    } else {
      if (touchUI) touchUI.appendChild(b);
    }
  });
}

// 3. 绑定拖拽事件
BTN_IDS.forEach(id => {
  const b = document.getElementById(id);
  if (!b) return;

  let kfid = null, kMoved = false;
  let startL = 0, startT = 0, startX = 0, startY = 0;

  b.addEventListener('touchstart', e => {
    if (!isKeyEditMode) return;
    e.preventDefault();
    e.stopPropagation();

    const t = e.changedTouches[0];
    kfid = t.identifier;
    kMoved = false;
    startX = t.clientX;
    startY = t.clientY;
    
    startL = parseFloat(b.style.left) || 50;
    startT = parseFloat(b.style.top) || 50;
    
    b.classList.add('dragging');
  }, { passive: false });

  b.addEventListener('touchmove', e => {
    if (!isKeyEditMode || kfid === null) return;
    e.preventDefault();
    e.stopPropagation();
    
    for (const t of e.changedTouches) {
      if (t.identifier !== kfid) continue;
      
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) kMoved = true;

      let newL = startL + (dx / window.innerWidth * 100);
      let newT = startT + (dy / window.innerHeight * 100);
      
      // 限制在屏幕内 (5% ~ 95%)
      newL = Math.max(5, Math.min(95, newL));
      newT = Math.max(5, Math.min(95, newT));

      b.style.left = newL + '%';
      b.style.top  = newT + '%';
    }
  }, { passive: false });

  b.addEventListener('touchend', e => {
    if (!isKeyEditMode || kfid === null) return;
    e.preventDefault();
    e.stopPropagation();
    
    for (const t of e.changedTouches) {
      if (t.identifier === kfid) {
        kfid = null;
        b.classList.remove('dragging');
        
        if (kMoved) {
          let saved = {};
          try { saved = JSON.parse(localStorage.getItem('ironhold_keys')) || {}; } catch(err){}
          saved[id] = [parseFloat(b.style.left), parseFloat(b.style.top)];
          localStorage.setItem('ironhold_keys', JSON.stringify(saved));
        }
      }
    }
  }, { passive: false });

  b.addEventListener('touchcancel', e => {
    if (kfid !== null) {
      kfid = null;
      b.classList.remove('dragging');
    }
  });
});

// 4. 绑定入口和完成按钮（注意这里用的是你在 HTML 里设置的新 ID）
const btnEditKeys = document.getElementById('btnEditKeys');
if (btnEditKeys) {
  btnEditKeys.addEventListener('click', enterKeyEdit);
  btnEditKeys.addEventListener('touchend', e => { e.preventDefault(); enterKeyEdit(); }, { passive: false });
}

const btnEditDone = document.getElementById('keyEditDone');
if (btnEditDone) {
  btnEditDone.addEventListener('click', exitKeyEdit);
  btnEditDone.addEventListener('touchend', e => { e.preventDefault(); exitKeyEdit(); }, { passive: false });
}