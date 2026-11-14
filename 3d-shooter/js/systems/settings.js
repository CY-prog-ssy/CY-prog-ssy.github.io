/* =========================================================================
   settings.js
   ========================================================================= */
"use strict";

const SET_KEY = 'ironhold_settings_v2';

const QUALITY_PRESETS = {
  smooth: { key: 'smooth', label: '流畅', desc: '低分辨率 · 关阴影 · 最省电', dpr: 0.85, renderScale: 0.60, modelQuality: 2, shadowQuality: 'off',  aaSamples: 2 },
  balanced: { key: 'balanced', label: '均衡', desc: '中等分辨率 · 低阴影 · 平衡', dpr: 1.00, renderScale: 0.80, modelQuality: 4, shadowQuality: 'low',  aaSamples: 2 },
  high: { key: 'high', label: '高清', desc: '全分辨率 · 软阴影 · 默认', dpr: 1.00, renderScale: 1.00, modelQuality: 8, shadowQuality: 'high', aaSamples: 4 },
  ultra: { key: 'ultra', label: '超清', desc: '高 DPR · 高清阴影 · 高性能机型', dpr: 1.50, renderScale: 1.00, modelQuality: 16, shadowQuality: 'high', aaSamples: 8 },
  pc: { key: 'pc', label: 'PC级画质', desc: '极限光影', dpr: 2.0, renderScale: 1.50, modelQuality: 16, shadowQuality: 'ultra', aaSamples: 26 }
};
const QUALITY_ORDER = ['smooth', 'balanced', 'high', 'ultra'];

const SET_DEFAULT = {
  quality: IS_TOUCH ? 'smooth' : 'high',
  renderScale: 1.0, modelQuality: 8, shadowQuality: 'high', aaSamples: 4, showFps: false,
  fpsLimit: 60,
  extremeOptimize: false,
  lowRenderMode: false,
  fxDensity: 1.0, sens: 1.0, touchSens: 2.2, adsSens: 1.0, dragLook: true, btnScale: 1.0,
  adsMode: IS_TOUCH ? 'toggle' : 'hold',
  aimAssist: true, aimStrength: 0.65, aimSlowdown: 0.35,
  aimPower: 0.75, 
  aimPart: 'head',
  
  armorRegen: true, healing: true, weather: 'clear', time: 'day', squadOpen: true,
  godMode: false, infiniteAmmo: false, esp: false,
  espDrawRay: false, espDrawBone: false, espRainbow: false,
  espAimLine: false, espColorAimLine: '#ff0000',
  aaCorrect: false,
  auraMode: false, auraRadius: 5, auraDmg: 50, auraColor: '#ff0044',
  enemyColorMode: false, enemyColor: '#9d00ff',
  flyMode: false,
  
  // ★ 新增：魂环配置
  soulRingEnabled: false,
  soulRingColor: '#00ffff',
  soulRingCount: 1,
  soulRingSize: 1.0,
  soulRingThickness: 0.1,
  soulRingGap: 0.1,
  
  espColorVisible: '#ff3c32',
  espColorHidden:  '#5fd06a',
  espColorRay:     '#ffcc44',
  espColorBone:    '#00e0ff',
  devConsole: false, 
  keybinds: Object.assign({}, DEFAULT_KEYBINDS)
};

const SET = Object.assign({}, SET_DEFAULT, (() => {
  try { const raw = localStorage.getItem(SET_KEY); return raw ? JSON.parse(raw) : {}; } catch (err){ return {}; }
})());

for (const k in SET_DEFAULT){
  if (k === 'keybinds') continue;
  if (typeof SET[k] !== typeof SET_DEFAULT[k]) SET[k] = SET_DEFAULT[k];
}

SET.keybinds = Object.assign({}, DEFAULT_KEYBINDS, SET.keybinds || {});
KEYBINDS = SET.keybinds;

SET.quality   = QUALITY_PRESETS[SET.quality] ? SET.quality : SET_DEFAULT.quality;
SET.sens      = clamp(+SET.sens      || SET_DEFAULT.sens,      0.2, 4.0);
SET.touchSens = clamp(+SET.touchSens || SET_DEFAULT.touchSens, 0.4, 6.0);
SET.adsSens   = clamp(+SET.adsSens   || SET_DEFAULT.adsSens,   0.2, 2.0);

const setNum = (v, d, lo, hi) => { const n = +v; return Number.isFinite(n) ? clamp(n, lo, hi) : d; };
SET.fxDensity   = setNum(SET.fxDensity,   SET_DEFAULT.fxDensity,   0.10, 3.00);
SET.btnScale    = setNum(SET.btnScale,    SET_DEFAULT.btnScale,    0.70, 1.30);
SET.adsMode     = (SET.adsMode === 'toggle') ? 'toggle' : 'hold';
SET.aimStrength = setNum(SET.aimStrength, SET_DEFAULT.aimStrength, 0, 1);
SET.aimSlowdown = setNum(SET.aimSlowdown, SET_DEFAULT.aimSlowdown, 0, 1);
SET.aimPower    = setNum(SET.aimPower,    SET_DEFAULT.aimPower,    0, 1);
SET.aimPart     = ['head', 'body', 'legs'].includes(SET.aimPart) ? SET.aimPart : 'head';

SET.weather = WEATHER_M[SET.weather] ? SET.weather : 'clear';
SET.time    = TIME_P[SET.time]       ? SET.time    : 'day';
SET.squadOpen  = !!SET.squadOpen;
SET.godMode    = !!SET.godMode;
SET.infiniteAmmo = !!SET.infiniteAmmo;
SET.esp        = !!SET.esp;
SET.espDrawRay  = !!SET.espDrawRay;
SET.espRainbow  = !!SET.espRainbow;
SET.aaCorrect = !!SET.aaCorrect;
SET.auraMode = !!SET.auraMode;
SET.auraRadius = setNum(SET.auraRadius, 5, 1, 30);
SET.auraDmg = setNum(SET.auraDmg, 50, 10, 2000);
SET.auraColor = typeof SET.auraColor === 'string' ? SET.auraColor : '#ff0044';
SET.enemyColorMode = !!SET.enemyColorMode;
SET.enemyColor = typeof SET.enemyColor === 'string' ? SET.enemyColor : '#9d00ff';
SET.flyMode = !!SET.flyMode;
SET.espDrawBone = !!SET.espDrawBone;
SET.espAimLine = !!SET.espAimLine;
SET.espColorAimLine = typeof SET.espColorAimLine === 'string' ? SET.espColorAimLine : '#ff0000';
SET.espColorVisible = typeof SET.espColorVisible === 'string' ? SET.espColorVisible : '#ff3c32';
SET.espColorHidden  = typeof SET.espColorHidden  === 'string' ? SET.espColorHidden  : '#5fd06a';
SET.espColorRay     = typeof SET.espColorRay     === 'string' ? SET.espColorRay     : '#ffcc44';
SET.espColorBone    = typeof SET.espColorBone    === 'string' ? SET.espColorBone    : '#00e0ff';
SET.devConsole = !!SET.devConsole;
SET.renderScale   = setNum(SET.renderScale, SET_DEFAULT.renderScale, 0.50, 1.50);
SET.modelQuality  = clamp(Math.round(+SET.modelQuality || SET_DEFAULT.modelQuality), 1, 16);
SET.shadowQuality = (['off','low','medium','high','ultra'].indexOf(SET.shadowQuality) >= 0) ? SET.shadowQuality : SET_DEFAULT.shadowQuality;
SET.aaSamples     = ([2,4,8,16,26].indexOf(+SET.aaSamples) >= 0) ? +SET.aaSamples : SET_DEFAULT.aaSamples;
SET.fpsLimit      = parseInt(SET.fpsLimit) || 60;
SET.showFps       = !!SET.showFps;
SET.lowRenderMode = !!SET.lowRenderMode;
SET.extremeOptimize = !!SET.extremeOptimize;

SET.soulRingEnabled = !!SET.soulRingEnabled;
SET.soulRingColor = typeof SET.soulRingColor === 'string' ? SET.soulRingColor : '#00ffff';
SET.soulRingCount = setNum(SET.soulRingCount, 1, 1, 15);
SET.soulRingSize = setNum(SET.soulRingSize, 1.0, 0.5, 3.0);
SET.soulRingThickness = setNum(SET.soulRingThickness, 0.1, 0.02, 0.5);
SET.soulRingGap = setNum(SET.soulRingGap, 0.1, 0.0, 0.5);

function applyQuality(){
  const q = QUALITY_PRESETS[SET.quality] || QUALITY_PRESETS.high;
  if (typeof applyQualityPreset === 'function') applyQualityPreset(q);
}

function applyQualityLoadPreset(){
  const q = QUALITY_PRESETS[SET.quality] || QUALITY_PRESETS.high;
  SET.renderScale = q.renderScale; SET.modelQuality = q.modelQuality;
  SET.shadowQuality = q.shadowQuality; SET.aaSamples = q.aaSamples;
  if (typeof applyQualityPreset === 'function') applyQualityPreset(q);
}

function applyFpsDisplay(){
  const el = document.getElementById('fpsCounter');
  if (el) el.classList.toggle('on', !!SET.showFps);
  document.body.classList.toggle('fps-on', !!SET.showFps);
}

function layoutTouchCluster(){
  const cl = document.getElementById('tcluster');
  if (!cl) return;
  const portrait = innerHeight >= innerWidth;
  const base = portrait ? Math.min(innerWidth * 0.68, innerHeight * 0.36) / 260 : Math.min(innerWidth * 0.48, innerHeight * 0.56) / 190;
  const ts = clamp(base, 0.60, portrait ? 1.12 : 1.0) * (SET.btnScale || 1);
  cl.style.setProperty('--ts', ts.toFixed(3));
}
addEventListener('resize', layoutTouchCluster);
addEventListener('orientationchange', () => setTimeout(layoutTouchCluster, 120));

let settingsSaved = true;
function saveSettings(){ try { localStorage.setItem(SET_KEY, JSON.stringify(SET)); settingsSaved = localStorage.getItem(SET_KEY) !== null; } catch (err){ settingsSaved = false; } syncStorageNote(); }
function syncStorageNote(){ const el = document.getElementById('stornote'); if (el) el.classList.toggle('on', !settingsSaved); }
function probeStorage(){ try { localStorage.setItem(SET_KEY + '__probe', '1'); const ok = localStorage.getItem(SET_KEY + '__probe') === '1'; localStorage.removeItem(SET_KEY + '__probe'); settingsSaved = ok; } catch (err){ settingsSaved = false; } syncStorageNote(); }

function applySettings(){
  SENS = SENS_BASE * SET.sens;
  layoutTouchCluster();
  if (typeof UI !== 'undefined' && UI.espLayer) UI.espLayer.style.display = SET.esp ? 'block' : 'none';
  applyQuality();
  window.FX_DENSITY = SET.fxDensity;
  applyFpsDisplay();
  
  setTimeout(() => {
    if (typeof DevConsole !== 'undefined') DevConsole.setAvailable(SET.devConsole);
  }, 1000);
}
applySettings();

setEnvironment(SET.time, SET.weather, true);
if (typeof setSquadOpen === 'function') setSquadOpen(SET.squadOpen);

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
  vAAPowText: document.getElementById('vAAPowText'),
  segAAPow:   document.getElementById('segAAPow'),
  segAimPart: document.getElementById('segAimPart'),
  rBtn:       document.getElementById('rBtn'),
  vBtn:       document.getElementById('vBtn'),
  togAAAll:   [...document.querySelectorAll('.togAA-btn')],
  togAACheat: document.getElementById('togAACheat'),
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
  togGod:     document.getElementById('togGod'),
  togInfAmmo: document.getElementById('togInfAmmo'),
  togEsp:     document.getElementById('togEsp'),
  togEspRainbow: document.getElementById('togEspRainbow'),
  togAACorrect: document.getElementById('togAACorrect'),
  togAura: document.getElementById('togAura'),
  rAuraRadius: document.getElementById('rAuraRadius'), vAuraRadius: document.getElementById('vAuraRadius'),
  rAuraDmg: document.getElementById('rAuraDmg'), vAuraDmg: document.getElementById('vAuraDmg'),
  auraColorPicker: document.getElementById('auraColorPicker'),
  togEnemyColor: document.getElementById('togEnemyColor'),
  enemyColorPicker: document.getElementById('enemyColorPicker'),
  togFly: document.getElementById('togFly'),
  togDevConsole: document.getElementById('togDevConsole'),
  segQuality: document.getElementById('segQuality'),
  vQuality:   document.getElementById('vQuality'),
  rFX:        document.getElementById('rFX'),
  vFX:        document.getElementById('vFX'),
  resetQuality: document.getElementById('resetQuality'),
  rRenderScale:   document.getElementById('rRenderScale'),
  vRenderScale:   document.getElementById('vRenderScale'),
  rModelQuality:  document.getElementById('rModelQuality'),
  vModelQuality:  document.getElementById('vModelQuality'),
  segShadow:      document.getElementById('segShadow'),
  vShadowQuality: document.getElementById('vShadowQuality'),
  segAntialias:   document.getElementById('segAntialias'),
  vAntialias:     document.getElementById('vAntialias'),
  togFps:         document.getElementById('togFps'),
  togLowRender:   document.getElementById('togLowRender'),
  togExtremeOpt:  document.getElementById('togExtremeOpt'),
  segFPSLimit:    document.getElementById('segFPSLimit'),
  keybindList: document.getElementById('keybindList'),
  keybindHint: document.getElementById('keybindHint'),
  resetKeybinds: document.getElementById('resetKeybinds'),
  setNav:     document.getElementById('setNav'),
  setPanes:   document.getElementById('setPanes'),
  
  // 魂环
  togSoulRing: document.getElementById('togSoulRing'),
  rSoulCount: document.getElementById('rSoulCount'), vSoulCount: document.getElementById('vSoulCount'),
  rSoulSize: document.getElementById('rSoulSize'), vSoulSize: document.getElementById('vSoulSize'),
  rSoulThick: document.getElementById('rSoulThick'), vSoulThick: document.getElementById('vSoulThick'),
  rSoulGap: document.getElementById('rSoulGap'), vSoulGap: document.getElementById('vSoulGap'),
  soulRingColor: document.getElementById('soulRingColor')
};

function syncSettingsUI(){
  if (!SETUI.box) return;

  if (SETUI.segQuality) for (const b of SETUI.segQuality.children) b.classList.toggle('on', b.dataset.v === SET.quality);
  if (SETUI.vQuality) { const q = QUALITY_PRESETS[SET.quality] || QUALITY_PRESETS.high; SETUI.vQuality.textContent = q.label; }
  
  const isPC = SET.quality === 'pc';
  const aa26Btn = document.getElementById('btnAA26');
  if (aa26Btn) {
    aa26Btn.style.display = isPC ? 'inline-block' : 'none';
    if (isPC) aa26Btn.style.zIndex = '10';
  }

  if (SETUI.rFX) {
    if (!isPC && SET.fxDensity > 1.0) { SET.fxDensity = 1.0; window.FX_DENSITY = 1.0; }
    SETUI.rFX.value = Math.round(SET.fxDensity * 100);
    SETUI.vFX.textContent = Math.round(SET.fxDensity * 100) + '%';
  }

  if (SETUI.rRenderScale){ SETUI.rRenderScale.value = Math.round(SET.renderScale * 100); SETUI.vRenderScale.textContent = Math.round(SET.renderScale * 100) + '%'; }
  if (SETUI.rModelQuality){ SETUI.rModelQuality.value = SET.modelQuality; SETUI.vModelQuality.textContent = SET.modelQuality + '×'; }
  if (SETUI.segShadow){ for (const b of SETUI.segShadow.children) b.classList.toggle('on', b.dataset.v === SET.shadowQuality); const LBL = { off:'关闭', low:'低', medium:'中', high:'高', ultra:'超高' }; SETUI.vShadowQuality.textContent = LBL[SET.shadowQuality] || '高'; }
  if (SETUI.segAntialias){ for (const b of SETUI.segAntialias.children) b.classList.toggle('on', b.dataset.v === String(SET.aaSamples)); SETUI.vAntialias.textContent = '×' + SET.aaSamples; }
  
  if (SETUI.segFPSLimit) {
    for (const b of SETUI.segFPSLimit.children) b.classList.toggle('on', b.dataset.v === String(SET.fpsLimit));
    const fpsLabel = document.getElementById('vFPSLimit');
    if (fpsLabel) fpsLabel.textContent = SET.fpsLimit === 0 ? '无限制' : SET.fpsLimit;
  }

  if (SETUI.togFps){ SETUI.togFps.classList.toggle('on', !!SET.showFps); SETUI.togFps.textContent = SET.showFps ? 'ON' : 'OFF'; }
  if (SETUI.togLowRender){ SETUI.togLowRender.classList.toggle('on', !!SET.lowRenderMode); SETUI.togLowRender.textContent = SET.lowRenderMode ? 'ON' : 'OFF'; }
  if (SETUI.togExtremeOpt){ SETUI.togExtremeOpt.classList.toggle('on', !!SET.extremeOptimize); SETUI.togExtremeOpt.textContent = SET.extremeOptimize ? 'ON' : 'OFF'; }

  SETUI.rSens.value  = Math.round(SET.sens * 100);
  SETUI.rTouch.value = Math.round(SET.touchSens * 100);
  SETUI.rAds.value   = Math.round(SET.adsSens * 100);
  SETUI.vSens.textContent  = SET.sens.toFixed(2);
  SETUI.vTouch.textContent = SET.touchSens.toFixed(2);
  SETUI.vAds.textContent   = SET.adsSens.toFixed(2);

  SETUI.tOnly.forEach(el => el.classList.toggle('off', !IS_TOUCH));
  SETUI.rBtn.value = Math.round(SET.btnScale * 100);
  SETUI.vBtn.textContent = SET.btnScale.toFixed(2);

  SETUI.aaOnly.forEach(el => el.classList.toggle('off', !SET.aimAssist));
  SETUI.togAAAll.forEach(b => {
    b.classList.toggle('on', !!SET.aimAssist);
    b.textContent = SET.aimAssist ? 'ON' : 'OFF';
  });
  if (SETUI.togAACheat) {
    SETUI.togAACheat.classList.toggle('on', !!SET.aimAssist);
    SETUI.togAACheat.textContent = SET.aimAssist ? 'ON' : 'OFF';
  }

  if (SETUI.vAAPowText) SETUI.vAAPowText.textContent = Math.round(SET.aimPower * 100) + '%';
  if (SETUI.segAAPow) for (const b of SETUI.segAAPow.children) b.classList.toggle('on', Math.abs(parseFloat(b.dataset.v) - SET.aimPower) < 0.05);
  if (SETUI.segAimPart) for (const b of SETUI.segAimPart.children) b.classList.toggle('on', b.dataset.v === SET.aimPart);

  SETUI.togDrag.classList.toggle('on', !!SET.dragLook);
  SETUI.togDrag.textContent = SET.dragLook ? 'ON' : 'OFF';
  const holdADS = SET.adsMode !== 'toggle';
  SETUI.togAdsMode.classList.add('on');
  SETUI.togAdsMode.textContent = holdADS ? '按下 HOLD' : '点击 TOGGLE';
  SETUI.togArmor.classList.toggle('on', !!SET.armorRegen);
  SETUI.togArmor.textContent = SET.armorRegen ? 'ON' : 'OFF';
  SETUI.togHeal.classList.toggle('on', !!SET.healing);
  SETUI.togHeal.textContent = SET.healing ? 'ON' : 'OFF';
  for (const b of SETUI.segWeather.children) b.classList.toggle('on', b.dataset.v === SET.weather);
  for (const b of SETUI.segTime.children) b.classList.toggle('on', b.dataset.v === SET.time);
  SETUI.vWeather.textContent = WEATHER_M[SET.weather].label;
  SETUI.vTime.textContent    = ({ day: '白天', dusk: '黄昏', night: '夜晚' })[SET.time];

  SETUI.togSquad.classList.add('on');
  SETUI.togSquad.textContent = SET.squadOpen ? '展开' : '收起';
  if (SETUI.togGod){ SETUI.togGod.classList.toggle('on', !!SET.godMode); SETUI.togGod.textContent = SET.godMode ? 'ON' : 'OFF'; }
  if (SETUI.togInfAmmo){ SETUI.togInfAmmo.classList.toggle('on', !!SET.infiniteAmmo); SETUI.togInfAmmo.textContent = SET.infiniteAmmo ? 'ON' : 'OFF'; }
  if (SETUI.togEsp){ SETUI.togEsp.classList.toggle('on', !!SET.esp); SETUI.togEsp.textContent = SET.esp ? 'ON' : 'OFF'; }
  if (SETUI.togEspRay){ SETUI.togEspRay.classList.toggle('on', !!SET.espDrawRay); SETUI.togEspRay.textContent = SET.espDrawRay ? 'ON' : 'OFF'; }
  if (SETUI.togEspRainbow){ SETUI.togEspRainbow.classList.toggle('on', !!SET.espRainbow); SETUI.togEspRainbow.textContent = SET.espRainbow ? 'ON' : 'OFF'; }
  if (SETUI.togEspBone){ SETUI.togEspBone.classList.toggle('on', !!SET.espDrawBone); SETUI.togEspBone.textContent = SET.espDrawBone ? 'ON' : 'OFF'; }
  
  if (SETUI.espColorVisible && SETUI.espColorVisible.value !== SET.espColorVisible) SETUI.espColorVisible.value = SET.espColorVisible;
  if (SETUI.espColorHidden  && SETUI.espColorHidden.value  !== SET.espColorHidden)  SETUI.espColorHidden.value  = SET.espColorHidden;
  if (SETUI.espColorRay     && SETUI.espColorRay.value     !== SET.espColorRay)     SETUI.espColorRay.value     = SET.espColorRay;
  if (SETUI.espColorBone    && SETUI.espColorBone.value    !== SET.espColorBone)    SETUI.espColorBone.value    = SET.espColorBone;
  
  if (SETUI.togDevConsole) {
    SETUI.togDevConsole.classList.toggle('on', !!SET.devConsole);
    SETUI.togDevConsole.textContent = SET.devConsole ? 'ON' : 'OFF';
  }

  if (SETUI.togAACorrect) { SETUI.togAACorrect.classList.toggle('on', !!SET.aaCorrect); SETUI.togAACorrect.textContent = SET.aaCorrect ? 'ON' : 'OFF'; }
  if (SETUI.togAura) { SETUI.togAura.classList.toggle('on', !!SET.auraMode); SETUI.togAura.textContent = SET.auraMode ? 'ON' : 'OFF'; }
  if (SETUI.rAuraRadius) { SETUI.rAuraRadius.value = SET.auraRadius; SETUI.vAuraRadius.textContent = SET.auraRadius.toFixed(1); }
  if (SETUI.rAuraDmg) { SETUI.rAuraDmg.value = SET.auraDmg; SETUI.vAuraDmg.textContent = SET.auraDmg; }
  if (SETUI.auraColorPicker) SETUI.auraColorPicker.value = SET.auraColor;

  if (SETUI.togEnemyColor) { SETUI.togEnemyColor.classList.toggle('on', !!SET.enemyColorMode); SETUI.togEnemyColor.textContent = SET.enemyColorMode ? 'ON' : 'OFF'; }
  if (SETUI.enemyColorPicker) SETUI.enemyColorPicker.value = SET.enemyColor;

  if (SETUI.togFly) { SETUI.togFly.classList.toggle('on', !!SET.flyMode); SETUI.togFly.textContent = SET.flyMode ? 'ON' : 'OFF'; }

  // 魂环
  if (SETUI.togSoulRing) {
    SETUI.togSoulRing.classList.toggle('on', !!SET.soulRingEnabled);
    SETUI.togSoulRing.textContent = SET.soulRingEnabled ? 'ON' : 'OFF';
    SETUI.rSoulCount.value = SET.soulRingCount; SETUI.vSoulCount.textContent = SET.soulRingCount;
    SETUI.rSoulSize.value = SET.soulRingSize;   SETUI.vSoulSize.textContent = SET.soulRingSize;
    SETUI.rSoulThick.value = SET.soulRingThickness; SETUI.vSoulThick.textContent = SET.soulRingThickness;
    SETUI.rSoulGap.value = SET.soulRingGap;     SETUI.vSoulGap.textContent = SET.soulRingGap;
    SETUI.soulRingColor.value = SET.soulRingColor;
  }
}

function openSettings(){
  probeStorage();
  if (G.running && IS_TOUCH && typeof pauseGameTouch === 'function') pauseGameTouch();
  syncSettingsUI();
  const box = SETUI.box; if (!box) return;
  box.classList.remove('hide');
  const panel = box.querySelector('.setbox'); if (panel) panel.scrollTop = 0;
  document.body.classList.add('modal-open');
}

function closeSettings(){
  if (!SETUI.box) return;
  SETUI.box.classList.add('hide');
  document.body.classList.remove('modal-open');
  saveSettings();
}

function bindSlider(el, key, lo, hi){
  if (!el) return;
  const on = () => { SET[key] = clamp(el.value / 100, lo, hi); applySettings(); syncSettingsUI(); saveSettings(); };
  el.addEventListener('input', on); el.addEventListener('change', on);
}

bindSlider(SETUI.rSens,  'sens',      0.2, 4.0);
bindSlider(SETUI.rTouch, 'touchSens', 0.4, 6.0);
bindSlider(SETUI.rAds,   'adsSens',   0.2, 2.0);
bindSlider(SETUI.rBtn,   'btnScale',  0.70, 1.30);

if (SETUI.rFX){ 
  const onFX = () => { 
    SET.fxDensity = clamp(SETUI.rFX.value / 100, 0.10, 3.00); 
    window.FX_DENSITY = SET.fxDensity; 
    SETUI.vFX.textContent = Math.round(SET.fxDensity * 100) + '%'; 
    saveSettings(); 
  }; 
  SETUI.rFX.addEventListener('input', onFX); SETUI.rFX.addEventListener('change', onFX); 
}

SETUI.togAAAll.forEach(b => {
  b.addEventListener('click', () => {
    SET.aimAssist = !SET.aimAssist;
    syncSettingsUI();
    saveSettings();
  });
});

if (SETUI.togAACheat) SETUI.togAACheat.addEventListener('click', () => { SET.aimAssist = !SET.aimAssist; syncSettingsUI(); saveSettings(); });
if (SETUI.togDrag) SETUI.togDrag.addEventListener('click', () => { SET.dragLook = !SET.dragLook; syncSettingsUI(); saveSettings(); });
if (SETUI.togAdsMode) SETUI.togAdsMode.addEventListener('click', () => { SET.adsMode = (SET.adsMode === 'toggle') ? 'hold' : 'toggle'; if (typeof setADS === 'function') setADS(false); syncSettingsUI(); saveSettings(); });
if (SETUI.togArmor) SETUI.togArmor.addEventListener('click', () => { SET.armorRegen = !SET.armorRegen; syncSettingsUI(); saveSettings(); if (typeof updateVitalsUI === 'function') updateVitalsUI(); });
if (SETUI.togHeal) SETUI.togHeal.addEventListener('click', () => { SET.healing = !SET.healing; syncSettingsUI(); saveSettings(); if (typeof updateVitalsUI === 'function') updateVitalsUI(); });
if (SETUI.togSquad) SETUI.togSquad.addEventListener('click', () => { setSquadOpen(!SET.squadOpen); syncSettingsUI(); saveSettings(); });

function customConfirm(title, message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(3,5,7,0.85);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;font-family:"PingFang SC","Helvetica Neue",sans-serif;opacity:0;transition:opacity 0.2s;';
  
  const box = document.createElement('div');
  box.style.cssText = 'background:linear-gradient(180deg,#10151b,#090c10);border:1px solid rgba(255,179,64,0.4);border-radius:8px;padding:24px 30px;width:min(500px, 85vw);box-shadow:0 20px 50px rgba(0,0,0,0.8);transform:scale(0.95);transition:transform 0.2s;';
  
  box.innerHTML = `
    <div style="color:#ffb340;font-size:18px;font-weight:800;letter-spacing:2px;margin-bottom:12px;text-align:center;">${title}</div>
    <div style="color:#dfe6ec;font-size:13px;line-height:1.6;margin-bottom:24px;text-align:left;white-space:pre-wrap;">${message}</div>
    <div style="display:flex;gap:12px;justify-content:center;">
      <button id="ccCancel" style="flex:1;padding:12px;background:rgba(223,230,236,0.06);border:1px solid rgba(223,230,236,0.28);color:#dfe6ec;font-size:13px;font-weight:700;border-radius:4px;cursor:pointer;letter-spacing:2px;">取消</button>
      <button id="ccConfirm" style="flex:1;padding:12px;background:rgba(255,179,64,0.15);border:1px solid rgba(255,179,64,0.6);color:#ffb340;font-size:13px;font-weight:700;border-radius:4px;cursor:pointer;letter-spacing:2px;">确认开启</button>
    </div>
  `;
  
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    box.style.transform = 'scale(1)';
  });
  
  const close = (val) => {
    overlay.style.opacity = '0';
    box.style.transform = 'scale(0.95)';
    setTimeout(() => { overlay.remove(); if (val) onConfirm(); }, 200);
  };
  
  box.querySelector('#ccCancel').onclick = () => close(false);
  box.querySelector('#ccConfirm').onclick = () => close(true);
}

if (SETUI.togDevConsole) {
  SETUI.togDevConsole.addEventListener('click', () => {
    if (!SET.devConsole) {
      customConfirm(
        "⚠️ 安全警告",
        "开发者控制台拥有极高权限，可以修改游戏数据。\n开启后将默认进入【安全模式】，涉及底层崩溃的危险指令将被禁用。\n\n是否确认开启控制台？",
        () => {
          SET.devConsole = true;
          syncSettingsUI();
          saveSettings();
          if (typeof DevConsole !== 'undefined') DevConsole.setAvailable(SET.devConsole);
        }
      );
    } else {
      SET.devConsole = false;
      syncSettingsUI();
      saveSettings();
      if (typeof DevConsole !== 'undefined') DevConsole.setAvailable(SET.devConsole);
    }
  });
}

if (SETUI.segAAPow) {
    for (const b of SETUI.segAAPow.children) {
        b.addEventListener('click', () => {
            SET.aimPower = parseFloat(b.dataset.v);
            syncSettingsUI();
            saveSettings();
        });
    }
}
if (SETUI.segAimPart) {
    for (const b of SETUI.segAimPart.children) {
        b.addEventListener('click', () => {
            SET.aimPart = b.dataset.v;
            syncSettingsUI();
            saveSettings();
        });
    }
}

if (SETUI.togGod){ SETUI.togGod.addEventListener('click', () => { SET.godMode = !SET.godMode; syncSettingsUI(); saveSettings(); }); }
if (SETUI.togInfAmmo){ SETUI.togInfAmmo.addEventListener('click', () => { SET.infiniteAmmo = !SET.infiniteAmmo; if (SET.infiniteAmmo){ for (const w of WEAPONS){ w.mag = w.magSize; w.res = w.maxReserve; } if (typeof updateAmmoUI === 'function') updateAmmoUI(); } syncSettingsUI(); saveSettings(); }); }
if (SETUI.togEsp){ SETUI.togEsp.addEventListener('click', () => { SET.esp = !SET.esp; if (typeof UI !== 'undefined' && UI.espLayer) UI.espLayer.style.display = SET.esp ? 'block' : 'none'; syncSettingsUI(); saveSettings(); }); }
if (SETUI.togEspRay){ SETUI.togEspRay.addEventListener('click', () => { SET.espDrawRay = !SET.espDrawRay; syncSettingsUI(); saveSettings(); }); }
if (SETUI.togEspRainbow){ SETUI.togEspRainbow.addEventListener('click', () => { SET.espRainbow = !SET.espRainbow; syncSettingsUI(); saveSettings(); }); }
if (SETUI.togAACorrect) SETUI.togAACorrect.addEventListener('click', () => { SET.aaCorrect = !SET.aaCorrect; syncSettingsUI(); saveSettings(); });
if (SETUI.togAura) SETUI.togAura.addEventListener('click', () => { SET.auraMode = !SET.auraMode; syncSettingsUI(); saveSettings(); });
if (SETUI.rAuraRadius) SETUI.rAuraRadius.addEventListener('input', () => { SET.auraRadius = parseFloat(SETUI.rAuraRadius.value); SETUI.vAuraRadius.textContent = SET.auraRadius.toFixed(1); saveSettings(); });
if (SETUI.rAuraDmg) SETUI.rAuraDmg.addEventListener('input', () => { SET.auraDmg = parseFloat(SETUI.rAuraDmg.value); SETUI.vAuraDmg.textContent = SET.auraDmg; saveSettings(); });
if (SETUI.auraColorPicker) SETUI.auraColorPicker.addEventListener('input', (e) => { SET.auraColor = e.target.value; saveSettings(); });
if (SETUI.togEnemyColor) SETUI.togEnemyColor.addEventListener('click', () => { SET.enemyColorMode = !SET.enemyColorMode; syncSettingsUI(); saveSettings(); });
if (SETUI.enemyColorPicker) SETUI.enemyColorPicker.addEventListener('input', (e) => { SET.enemyColor = e.target.value; saveSettings(); });
if (SETUI.togFly) SETUI.togFly.addEventListener('click', () => { SET.flyMode = !SET.flyMode; syncSettingsUI(); saveSettings(); });
if (SETUI.togEspBone){ SETUI.togEspBone.addEventListener('click', () => { SET.espDrawBone = !SET.espDrawBone; syncSettingsUI(); saveSettings(); }); }
if (SETUI.espColorVisible){ SETUI.espColorVisible.addEventListener('input', (e) => { SET.espColorVisible = e.target.value; saveSettings(); }); }
if (SETUI.espColorHidden) { SETUI.espColorHidden.addEventListener('input',  (e) => { SET.espColorHidden  = e.target.value; saveSettings(); }); }
if (SETUI.espColorRay)    { SETUI.espColorRay.addEventListener('input',     (e) => { SET.espColorRay     = e.target.value; saveSettings(); }); }
if (SETUI.espColorBone)   { SETUI.espColorBone.addEventListener('input',    (e) => { SET.espColorBone    = e.target.value; saveSettings(); }); }

// 魂环事件绑定
if (SETUI.togSoulRing) SETUI.togSoulRing.addEventListener('click', () => { SET.soulRingEnabled = !SET.soulRingEnabled; syncSettingsUI(); saveSettings(); });
if (SETUI.rSoulCount) SETUI.rSoulCount.addEventListener('input', () => { SET.soulRingCount = parseInt(SETUI.rSoulCount.value); SETUI.vSoulCount.textContent = SET.soulRingCount; saveSettings(); });
if (SETUI.rSoulSize) SETUI.rSoulSize.addEventListener('input', () => { SET.soulRingSize = parseFloat(SETUI.rSoulSize.value); SETUI.vSoulSize.textContent = SET.soulRingSize; saveSettings(); });
if (SETUI.rSoulThick) SETUI.rSoulThick.addEventListener('input', () => { SET.soulRingThickness = parseFloat(SETUI.rSoulThick.value); SETUI.vSoulThick.textContent = SET.soulRingThickness; saveSettings(); });
if (SETUI.rSoulGap) SETUI.rSoulGap.addEventListener('input', () => { SET.soulRingGap = parseFloat(SETUI.rSoulGap.value); SETUI.vSoulGap.textContent = SET.soulRingGap; saveSettings(); });
if (SETUI.soulRingColor) SETUI.soulRingColor.addEventListener('input', (e) => { SET.soulRingColor = e.target.value; saveSettings(); });

// 模拟封号
let _isFakeBanShowing = false;
const btnFakeBan = document.getElementById('btnFakeBan');
if (btnFakeBan) {
  btnFakeBan.addEventListener('click', () => {
    if (_isFakeBanShowing) return; 
    _isFakeBanShowing = true;
    
    const banOverlay = document.createElement('div');
    banOverlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(3,5,7,0.9);backdrop-filter:blur(8px);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:"PingFang SC",sans-serif;opacity:0;transition:opacity 0.3s;';
    
    banOverlay.innerHTML = `
      <div style="background:#10151b; border:1px solid rgba(255,59,48,0.5); border-radius:8px; padding:30px 40px; text-align:center; box-shadow:0 10px 40px rgba(255,0,0,0.2); max-width:80vw;">
        <div style="color:#ff3b30; font-size:20px; font-weight:800; letter-spacing:2px; margin-bottom:15px;">系统警告</div>
        <div style="color:#dfe6ec; font-size:15px; line-height:1.6; margin-bottom:25px;">数据发生变化，您被迫下线。</div>
        <button id="btnBanConfirm" style="background:rgba(255,59,48,0.15); border:1px solid #ff3b30; color:#ff3b30; padding:10px 40px; font-size:14px; font-weight:bold; border-radius:4px; cursor:pointer;">确 定</button>
      </div>
    `;
    document.body.appendChild(banOverlay);
    requestAnimationFrame(() => { banOverlay.style.opacity = '1'; });
    
    banOverlay.querySelector('#btnBanConfirm').addEventListener('click', () => {
      banOverlay.style.opacity = '0';
      setTimeout(() => {
        banOverlay.remove();
        _isFakeBanShowing = false;
      }, 300);
    });
  });
}

function bindSeg(el, key, apply){
  if (!el) return;
  for (const b of el.children){
    const doIt = () => { if (SET[key] === b.dataset.v) return; SET[key] = b.dataset.v; apply(); syncSettingsUI(); saveSettings(); };
    b.addEventListener('click', doIt);
    b.addEventListener('touchend', e => { e.preventDefault(); doIt(); }, { passive: false });
  }
}
bindSeg(SETUI.segWeather, 'weather', () => setEnvironment(SET.time, SET.weather));
bindSeg(SETUI.segTime,    'time',    () => setEnvironment(SET.time, SET.weather));

if (SETUI.segQuality) {
  for (const b of SETUI.segQuality.children) {
    b.addEventListener('click', (e) => {
      e.preventDefault();
      if (b.dataset.v === 'pc' && SET.quality !== 'pc') {
        customConfirm(
          "⚠️ SYSTEM OVERRIDE ⚠️",
          "警告：您正在启用【PC级极限画质】。\n\n此模式将强制拉满所有光影、开启 300% 粒子运算及极限抗锯齿 (x26)。\n\n【危险警告】：非旗舰级设备强行开启，极大概率会导致发热、严重掉帧、甚至内存溢出导致游戏闪退！\n\n您确定要解除限制并继续吗？",
          () => {
            SET.quality = 'pc';
            applyQualityLoadPreset();
            syncSettingsUI();
            saveSettings();
          }
        );
      } else if (b.dataset.v !== 'pc') {
        SET.quality = b.dataset.v;
        applyQualityLoadPreset();
        syncSettingsUI();
        saveSettings();
      }
    });
  }
}

if (SETUI.segFPSLimit) {
  bindSeg(SETUI.segFPSLimit, 'fpsLimit', () => {});
}

if (SETUI.rRenderScale){ const on = () => { SET.renderScale = clamp(SETUI.rRenderScale.value / 100, 0.50, 1.50); SETUI.vRenderScale.textContent = Math.round(SET.renderScale * 100) + '%'; applyQuality(); saveSettings(); }; SETUI.rRenderScale.addEventListener('input', on); SETUI.rRenderScale.addEventListener('change', on); }
if (SETUI.rModelQuality){ const on = () => { SET.modelQuality = clamp(Math.round(+SETUI.rModelQuality.value || 8), 1, 16); SETUI.vModelQuality.textContent = SET.modelQuality + '×'; if (typeof applyModelQuality === 'function') applyModelQuality(SET.modelQuality); saveSettings(); }; SETUI.rModelQuality.addEventListener('input', on); SETUI.rModelQuality.addEventListener('change', on); }
if (SETUI.segShadow){ for (const b of SETUI.segShadow.children){ b.addEventListener('click', () => { if (SET.shadowQuality === b.dataset.v) return; SET.shadowQuality = b.dataset.v; if (typeof applyShadowQuality === 'function') applyShadowQuality(SET.shadowQuality); syncSettingsUI(); saveSettings(); }); } }
if (SETUI.segAntialias) {
  for (const b of SETUI.segAntialias.children) {
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation(); 
      const s = +b.dataset.v;
      if (!s || SET.aaSamples === s) return;
      SET.aaSamples = s;
      if (typeof allocTargets === 'function') allocTargets();
      syncSettingsUI();
      saveSettings();
    });
  }
}
if (SETUI.togFps){ SETUI.togFps.addEventListener('click', () => { SET.showFps = !SET.showFps; applyFpsDisplay(); syncSettingsUI(); saveSettings(); }); }
if (SETUI.togLowRender){
  SETUI.togLowRender.addEventListener('click', () => {
    SET.lowRenderMode = !SET.lowRenderMode;
    syncSettingsUI();
    saveSettings();
    if (typeof lrRestoreAll === 'function') lrRestoreAll(); 
  });
}
if (SETUI.togExtremeOpt){
  SETUI.togExtremeOpt.addEventListener('click', () => {
    SET.extremeOptimize = !SET.extremeOptimize;
    syncSettingsUI();
    saveSettings();
  });
}
if (SETUI.resetQuality){ SETUI.resetQuality.addEventListener('click', () => { SET.quality = SET_DEFAULT.quality; SET.fxDensity = SET_DEFAULT.fxDensity; window.FX_DENSITY = SET.fxDensity; applyQualityLoadPreset(); saveSettings(); }); }

bindSeg(SETUI.segQuality, 'quality', () => applyQualityLoadPreset());

const setCloseBtn = document.getElementById('setClose');
if (setCloseBtn) setCloseBtn.addEventListener('click', closeSettings);

const setResetBtn = document.getElementById('setReset');
if (setResetBtn) setResetBtn.addEventListener('click', () => { Object.assign(SET, SET_DEFAULT); KEYBINDS = SET.keybinds; applySettings(); setEnvironment(SET.time, SET.weather); setSquadOpen(SET.squadOpen); syncSettingsUI(); renderKeybindsUI(); saveSettings(); if (typeof updateVitalsUI === 'function') updateVitalsUI(); applyFpsDisplay(); });

const pauseSetBtn = document.getElementById('pauseSetBtn');
if (pauseSetBtn) pauseSetBtn.addEventListener('click', e => { e.stopPropagation(); openSettings(); });

const shopDeployBtn = document.getElementById('shopDeploy');
if (shopDeployBtn) shopDeployBtn.addEventListener('click', e => { e.stopPropagation(); if (typeof deployNow === 'function') deployNow(); });

if (typeof UI !== 'undefined' && UI.shop){ UI.shop.addEventListener('click', e => { if (e.target === UI.shop && G.shopOpen){ if (typeof closeShop === 'function') closeShop(true); } }); }

const startSetBtn = document.getElementById('startSet');
if (startSetBtn) startSetBtn.addEventListener('click', e => { e.stopPropagation(); openSettings(); });

if (SETUI.box){ SETUI.box.addEventListener('click', e => { if (e.target === SETUI.box) closeSettings(); }); }
addEventListener('keydown', e => { if (e.code === 'Escape' && SETUI.box && !SETUI.box.classList.contains('hide')) closeSettings(); });

(function bindSettingsTabs(){ const nav = SETUI.setNav; const panes = SETUI.setPanes; if (!nav || !panes) return; nav.addEventListener('click', (e) => { const btn = e.target.closest ? e.target.closest('.settab') : null; if (!btn || !btn.dataset.tab) return; const tab = btn.dataset.tab; for (const b of nav.querySelectorAll('.settab')) b.classList.toggle('on', b === btn); for (const p of panes.querySelectorAll('.setpane')) p.classList.toggle('on', p.dataset.pane === tab); panes.scrollTop = 0; }); })();

const devSuicide = document.getElementById('devSuicide');
if (devSuicide) {
  devSuicide.addEventListener('click', () => {
    if (typeof G !== 'undefined' && G.running && !player.dead) {
      if (player.revives > 0) {
        player.revives--;
        player.hp = player.maxHp * 0.5;
        player.armor = player.maxArmor * 0.5;
        if (typeof pushComms === 'function') pushComms('MEDIC', 'REVIVE COIN SPENT');
        if (typeof updateVitalsUI === 'function') updateVitalsUI();
      } else {
        player.hp = 0;
        player.dead = true;
        if (typeof setADS === 'function') setADS(false);
        if (typeof updateVitalsUI === 'function') updateVitalsUI();
        if (typeof endGame === 'function') endGame(false);
      }
    }
  });
}

const devAddGold = document.getElementById('devAddGold');
if (devAddGold) {
  devAddGold.addEventListener('click', () => {
    if (typeof G !== 'undefined') {
      G.gold += 1000;
      if (typeof updateWaveUI === 'function') updateWaveUI();
      if (typeof renderShop === 'function') renderShop();
      if (typeof SFX !== 'undefined' && SFX.magIn) SFX.magIn();
    }
  });
}

const devEndWave = document.getElementById('devEndWave');
if (devEndWave) {
  devEndWave.addEventListener('click', () => {
    if (typeof G !== 'undefined' && G.running && G.phase === 'combat') {
      for (const e of enemies) {
        if (!e.dead) {
          e.hp = 0;
          e.dead = true;
          e.state = ST.DEAD;
          e.deathTime = 0;
          if (e.tag) e.tag.sprite.visible = false;
        }
      }
      if (typeof rebuildHitMeshes === 'function') rebuildHitMeshes();
      if (typeof startIntermission === 'function') startIntermission();
    }
  });
}

const KEYBIND_LABELS = { forward: '前进', back: '后退', left: '左移', right: '右移', jump: '跳跃', sprint: '冲刺', crouch: '下蹲', reload: '换弹', heal: '医疗包', grenade: '投掷物', fireMode: '开火模式', allyCmd: '友军指令', droneCmd: '无人机指令', shop: '商店', weapon1: '武器 1', weapon2: '武器 2', weapon3: '武器 3', weapon4: '武器 4', pause: '暂停' };
function prettyKeyName(code){ if (!code) return '—'; if (code.startsWith('Key')) return code.slice(3); if (code.startsWith('Digit')) return code.slice(5); if (code.startsWith('Numpad')) return 'Num ' + code.slice(6); if (code === 'Space') return 'Space'; if (code === 'Escape') return 'Esc'; if (code === 'ShiftLeft') return 'Shift L'; if (code === 'ShiftRight') return 'Shift R'; if (code === 'ControlLeft') return 'Ctrl L'; if (code === 'ControlRight') return 'Ctrl R'; if (code === 'ArrowUp') return '↑'; if (code === 'ArrowDown') return '↓'; if (code === 'ArrowLeft') return '←'; if (code === 'ArrowRight') return '→'; return code; }
let _bindEditing = null;
let _bindHandlerRef = null;
function _detachBindHandler(){ if (_bindHandlerRef){ document.removeEventListener('keydown', _bindHandlerRef, true); _bindHandlerRef = null; } }
function cancelBindEdit(){ _detachBindHandler(); _bindEditing = null; renderKeybindsUI(); if (SETUI.keybindHint) SETUI.keybindHint.textContent = '点击任意键位进行编辑'; }
function startBindEdit(action){
  if (_bindEditing === action) return;
  _detachBindHandler(); _bindEditing = action; renderKeybindsUI();
  if (SETUI.keybindHint) SETUI.keybindHint.textContent = '按下新键…（Esc 取消）';
  _bindHandlerRef = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.code === 'Escape' && action !== 'pause'){ cancelBindEdit(); return; }
    for (const act in SET.keybinds){ if (act === action) continue; const list = SET.keybinds[act]; const idx = list.indexOf(e.code); if (idx >= 0) list.splice(idx, 1); }
    SET.keybinds[action] = [e.code];
    _detachBindHandler(); _bindEditing = null; saveSettings(); renderKeybindsUI();
    if (SETUI.keybindHint){ SETUI.keybindHint.textContent = '已保存'; setTimeout(() => { if (SETUI.keybindHint && !_bindEditing) SETUI.keybindHint.textContent = '点击任意键位进行编辑'; }, 1200); }
  };
  document.addEventListener('keydown', _bindHandlerRef, true);
}
function renderKeybindsUI(){
  const box = SETUI.keybindList; if (!box) return; box.innerHTML = '';
  for (const action in KEYBIND_LABELS){
    const row = document.createElement('div'); row.className = 'kbbind';
    const lbl = document.createElement('span'); lbl.className = 'kblbl'; lbl.textContent = KEYBIND_LABELS[action];
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'kbkey' + (_bindEditing === action ? ' listening' : '');
    const list = SET.keybinds[action] || []; btn.textContent = list.length ? list.map(prettyKeyName).join(' / ') : '未绑定';
    btn.addEventListener('click', () => startBindEdit(action));
    row.appendChild(lbl); row.appendChild(btn); box.appendChild(row);
  }
}
if (SETUI.resetKeybinds){ SETUI.resetKeybinds.addEventListener('click', () => { for (const k in SET.keybinds) delete SET.keybinds[k]; Object.assign(SET.keybinds, DEFAULT_KEYBINDS); saveSettings(); renderKeybindsUI(); if (SETUI.keybindHint) SETUI.keybindHint.textContent = '已恢复默认键位'; setTimeout(() => { if (SETUI.keybindHint && !_bindEditing) SETUI.keybindHint.textContent = '点击任意键位进行编辑'; }, 1200); }); }

const _origOpenSettings = openSettings;
window.openSettings = function(){ _origOpenSettings(); renderKeybindsUI(); if (SETUI.keybindHint) SETUI.keybindHint.textContent = '点击任意键位进行编辑'; };
renderKeybindsUI();
window.openSettings  = openSettings;
window.closeSettings = closeSettings;

// =====================================================================
// ★ 原生触屏按键拖拽编辑器（全局唯一版本）
// =====================================================================
const BTN_IDS = [
  'btnFire', 'btnAds', 'btnJump', 'btnReload', 'btnCrouch', 'btnHeal', 'btnShop', 
  'btnGrenade', 'btnAttach', 'btnWeaponShop', 'btnMusic', 'btnPause', 'btnSet'
];
const originalStyles = new Map(); 
let isKeyEditMode = false; window.__keyEditMode = false;
let _wasRunningBeforeEdit = false;
let _draggingBtn = null;
let _dragStartX = 0, _dragStartY = 0, _btnStartL = 0, _btnStartT = 0, _dragMoved = false;

function enterKeyEdit() {
  if (isKeyEditMode) return;
  isKeyEditMode = true; 
  window.__keyEditMode = true; 
  document.body.classList.add('key-edit');
  
  _wasRunningBeforeEdit = (typeof G !== 'undefined' && G.running);
  if (typeof G !== 'undefined') { G.paused = true; G.running = false; }
  if (typeof pauseGameTouch === 'function') pauseGameTouch();
  if (typeof setADS === 'function') setADS(false);

  if (typeof closeSettings === 'function') closeSettings();
  const pauseEl = document.getElementById('pause'); if (pauseEl) pauseEl.classList.remove('on');
  const shopEl = document.getElementById('shop'); if (shopEl) shopEl.classList.add('hide');
  
  let savedKeys = {}; 
  try { savedKeys = JSON.parse(localStorage.getItem('ironhold_keys')) || {}; } catch (e) {}
  
  const touchUI = document.getElementById('touchUI'); 
  
  BTN_IDS.forEach(id => {
    const b = document.getElementById(id); 
    if (!b) return;
    
    if (!originalStyles.has(id)) {
      originalStyles.set(id, {
        styleAttr: b.getAttribute('style') || '',
        parent: b.parentNode
      });
    }
    
    if (b.parentNode) b.parentNode.removeChild(b);
    touchUI.appendChild(b);
    
    b.style.position = 'fixed'; 
    b.style.right = 'auto'; 
    b.style.bottom = 'auto'; 
    b.style.transform = 'translate(-50%, -50%)';
    b.style.display = 'flex';
    b.style.pointerEvents = 'auto';
    
    if (savedKeys[id]) { 
      b.style.left = savedKeys[id][0] + '%'; 
      b.style.top  = savedKeys[id][1] + '%'; 
    } else { 
      const r = b.getBoundingClientRect(); 
      b.style.left = ((r.left + r.width / 2) / window.innerWidth * 100) + '%'; 
      b.style.top  = ((r.top + r.height / 2) / window.innerHeight * 100) + '%'; 
    }
  });
}

function exitKeyEdit() {
  if (!isKeyEditMode) return;
  isKeyEditMode = false; 
  window.__keyEditMode = false; 
  document.body.classList.remove('key-edit');
  
  BTN_IDS.forEach(id => {
    const b = document.getElementById(id); 
    if (!b) return;
    const backup = originalStyles.get(id);
    if (backup) {
      b.setAttribute('style', backup.styleAttr);
      if (backup.parent) {
        if (b.parentNode) b.parentNode.removeChild(b);
        backup.parent.appendChild(b);
      }
    }
    b.classList.remove('dragging');
  });
  
  if (typeof G !== 'undefined') {
    if (_wasRunningBeforeEdit) {
      G.paused = false;
      G.running = true;
      const pauseEl = document.getElementById('pause'); 
      if (pauseEl) pauseEl.classList.remove('on');
      if (typeof SFX !== 'undefined' && SFX.resume) SFX.resume();
    }
  }
}

function onGlobalTouchStart(e) {
  if (!isKeyEditMode) return;
  const btn = e.target.closest('.tbtn');
  if (!btn) return;
  
  e.preventDefault();
  e.stopPropagation();
  
  _draggingBtn = btn;
  const t = e.changedTouches[0];
  _dragStartX = t.clientX;
  _dragStartY = t.clientY;
  _btnStartL = parseFloat(btn.style.left) || 50;
  _btnStartT = parseFloat(btn.style.top) || 50;
  _dragMoved = false;
  
  btn.classList.add('dragging');
}

function onGlobalTouchMove(e) {
  if (!isKeyEditMode || !_draggingBtn) return;
  e.preventDefault();
  e.stopPropagation();
  
  for (const t of e.changedTouches) {
    if (t.identifier !== e.changedTouches[0].identifier) continue;
    
    const dx = t.clientX - _dragStartX;
    const dy = t.clientY - _dragStartY;
    
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) _dragMoved = true;
    
    let newL = _btnStartL + (dx / window.innerWidth * 100);
    let newT = _btnStartT + (dy / window.innerHeight * 100);
    
    newL = Math.max(5, Math.min(95, newL));
    newT = Math.max(5, Math.min(95, newT));
    
    _draggingBtn.style.left = newL + '%';
    _draggingBtn.style.top  = newT + '%';
  }
}

function onGlobalTouchEnd(e) {
  if (!isKeyEditMode || !_draggingBtn) return;
  e.preventDefault();
  e.stopPropagation();
  
  if (_dragMoved) {
    let saved = {}; 
    try { saved = JSON.parse(localStorage.getItem('ironhold_keys')) || {}; } catch(err){}
    saved[_draggingBtn.id] = [
      parseFloat(_draggingBtn.style.left), 
      parseFloat(_draggingBtn.style.top)
    ];
    localStorage.setItem('ironhold_keys', JSON.stringify(saved));
  }
  
  _draggingBtn.classList.remove('dragging');
  _draggingBtn = null;
}

window.addEventListener('touchstart', onGlobalTouchStart, { passive: false });
window.addEventListener('touchmove', onGlobalTouchMove, { passive: false });
window.addEventListener('touchend', onGlobalTouchEnd, { passive: false });
window.addEventListener('touchcancel', onGlobalTouchEnd, { passive: false });

const btnEditKeys = document.getElementById('btnEditKeys');
if (btnEditKeys) { 
  const handleEdit = (e) => { if (e) { e.preventDefault(); e.stopPropagation(); } enterKeyEdit(); };
  btnEditKeys.addEventListener('click', handleEdit); 
  btnEditKeys.addEventListener('touchend', handleEdit, { passive: false }); 
}

const btnEditDone = document.getElementById('keyEditDone');
if (btnEditDone) { 
  const handleDone = (e) => { if (e) { e.preventDefault(); e.stopPropagation(); } exitKeyEdit(); };
  btnEditDone.addEventListener('click', handleDone); 
  btnEditDone.addEventListener('touchend', handleDone, { passive: false }); 
}

const btnEditReset = document.getElementById('keyEditReset');
if (btnEditReset) {
  const handleReset = (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    localStorage.removeItem('ironhold_keys');
    exitKeyEdit();
    setTimeout(enterKeyEdit, 50);
  };
  btnEditReset.addEventListener('click', handleReset);
  btnEditReset.addEventListener('touchend', handleReset, { passive: false });
}


/* =========================================================================
   ★ ESP 扩展选项统一绑定（事件代理，彻底解决手机端点不动的问题）
   ========================================================================= */
(function initEspExtensions(){
  window.syncEspExtensionsUI = function() {
    document.querySelectorAll('.esp-toggle-btn').forEach(btn => {
      const key = btn.dataset.key;
      if (key && typeof SET !== 'undefined') {
        btn.classList.toggle('on', !!SET[key]);
        btn.textContent = SET[key] ? 'ON' : 'OFF';
      }
    });
    document.querySelectorAll('.esp-color-picker').forEach(picker => {
      const key = picker.dataset.key;
      if (key && typeof SET !== 'undefined' && picker.value !== SET[key]) {
        picker.value = SET[key] || '#ffffff';
      }
    });
  };

  setTimeout(syncEspExtensionsUI, 500);

  document.body.addEventListener('click', function(e) {
    const btn = e.target.closest('.esp-toggle-btn');
    if (btn) {
      e.preventDefault(); 
      const key = btn.dataset.key;
      if (key && typeof SET !== 'undefined') {
        SET[key] = !SET[key];
        syncEspExtensionsUI();
        if (typeof saveSettings === 'function') saveSettings();
        if (typeof SFX !== 'undefined' && SFX.boltClick) SFX.boltClick(); 
      }
    }
  });

  document.body.addEventListener('input', function(e) {
    const picker = e.target.closest('.esp-color-picker');
    if (picker) {
      const key = picker.dataset.key;
      if (key && typeof SET !== 'undefined') {
        SET[key] = picker.value;
        if (typeof saveSettings === 'function') saveSettings();
      }
    }
  });
})();

/* =========================================================================
   ★ 全局防误触：滑动时不触发按钮点击
   ========================================================================= */
(function initAntiMisclick() {
  let startX = 0, startY = 0;
  let isScrolling = false;
  let scrollTimer = null;

  window.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isScrolling = false;
  }, { passive: true, capture: true });

  window.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      isScrolling = true;
    }
  }, { passive: true, capture: true });

  window.addEventListener('touchend', (e) => {
    if (isScrolling) {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => { isScrolling = false; }, 50);
    } else {
      isScrolling = false;
    }
  }, { passive: true, capture: true });

  window.addEventListener('click', (e) => {
    if (isScrolling) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, { capture: true });
})();