/* =========================================================================
   environment.js
   环境档案（时间 × 天气）+ 平滑过渡 + 闪电

   依赖：utils.js / renderer.js / lighting.js
   暴露：setEnvironment, applyEnv, updateEnv, ENV, ENV_CUR, envLift,
         fogUniforms, reorientShafts
   ========================================================================= */
"use strict";

/* --------------------------------------------------------------------------
   时间档案

   每一档决定太阳方向 + 全套色温。

     day   基准档 —— 手调的默认外观，绝对不能改数值，
           否则老玩家一进游戏就能看出不对
     dusk  太阳压到 15°，长影 + 暖侧光
     night 月亮当太阳用，方向抬高、色温转冷。强度比“真实”高，
           因为这是要打仗的地图，提不亮就没法辨认敌人
   -------------------------------------------------------------------------- */
const TIME_P = {
  day: {
    dir: [-0.62, 0.47, 0.46],           // 仰角约 31°，2.85m 集装箱投 4.7m 影子
    sunCol: '#ffdcae', sunI: 2.35,
    hemiSky: '#a6bacd', hemiGnd: '#6f6450', hemiI: 0.74,
    bounceCol: '#b0916a', bounceI: 0.36,
    fillCol: '#8fa8c4', fillI: 0.28,
    fogCol: '#a39b8d', fogD: 0.0074,
    zen: '#2f4055', high: '#5c6d7c', mid: '#8b9196', low: '#a8a79f',
    haze: '#b0a99c', ground: '#8a8378', cloudD: '#71757c', cloudL: '#c6c1b6',
    expo: 1.14, shaftI: 1.00, skyTint: '#ffffff'
  },
  dusk: {
    dir: [-0.72, 0.22, 0.40],           // 约 15°，长影 + 暖侧光
    sunCol: '#ff9a52', sunI: 2.15,
    hemiSky: '#6e6a7a', hemiGnd: '#4a3a2e', hemiI: 0.62,
    bounceCol: '#a86a3a', bounceI: 0.22,
    fillCol: '#6a5f8a', fillI: 0.30,
    fogCol: '#8a7a6a', fogD: 0.0092,
    zen: '#1e2c46', high: '#4a4160', mid: '#96684f', low: '#c08a5a',
    haze: '#b08a6a', ground: '#6a5a4a', cloudD: '#4a4456', cloudL: '#d8a074',
    expo: 1.22, shaftI: 1.10, skyTint: '#c8a894'
  },
  night: {
    dir: [-0.50, 0.68, 0.54],
    sunCol: '#9fb8e0', sunI: 1.10,
    hemiSky: '#2c3a52', hemiGnd: '#15181c', hemiI: 0.50,
    bounceCol: '#3a4a60', bounceI: 0.12,
    fillCol: '#44608c', fillI: 0.30,
    fogCol: '#2a3140', fogD: 0.0105,
    zen: '#080f1c', high: '#16233a', mid: '#24334a', low: '#35404f',
    haze: '#39414c', ground: '#1e2229', cloudD: '#1a2028', cloudL: '#5a6470',
    expo: 1.46, shaftI: 0.22, skyTint: '#5a6472'
  }
};

/* --------------------------------------------------------------------------
   天气乘数

   每个天气在时间档的基础上做乘性修正，再叠加降水与云量。
   fog 的浓度是玩法参数而不是美术参数：
     3.8 倍下 20m 处还剩 75% 透光、30m 处剩 53% —— 看不清远处，
     但近战完全正常。再高就是挨打找不到人。
   -------------------------------------------------------------------------- */
const WEATHER_M = {
  clear:    { label:'晴', sunMul:1.00, hemiMul:1.00, fillMul:1.00, fogMul:1.00,
              cov:0.00, precip:'none', fogTint:null,    fogMix:0.00, grey:0.00, dim:1.00 },
  overcast: { label:'阴', sunMul:0.42, hemiMul:1.00, fillMul:1.20, fogMul:1.55,
              cov:0.20, precip:'none', fogTint:'#9a978e', fogMix:0.55, grey:0.42, dim:0.95 },
  rain:     { label:'雨', sunMul:0.34, hemiMul:1.00, fillMul:1.30, fogMul:2.30,
              cov:0.30, precip:'rain', fogTint:'#7e838a', fogMix:0.72, grey:0.62, dim:0.86 },
  fog:      { label:'雾', sunMul:0.30, hemiMul:0.96, fillMul:1.12, fogMul:3.80,
              cov:0.16, precip:'none', fogTint:'#a8a49c', fogMix:0.80, grey:0.30, dim:0.96 },
  snow:     { label:'雪', sunMul:0.50, hemiMul:1.20, fillMul:1.35, fogMul:2.00,
              cov:0.26, precip:'snow', fogTint:'#b8bcc0', fogMix:0.70, grey:0.50, dim:0.96 }
};

/* 哪些键是标量（走线性插值），哪些是颜色（走 lerp） */
const ENV_NUM = ['sunI','hemiI','bounceI','fillI','fogD','expo','covBias','shaftI','rainAmt','snowAmt'];
const ENV_COL = ['sunCol','hemiSky','hemiGnd','bounceCol','fillCol','fogCol',
                 'zen','high','mid','low','haze','ground','cloudD','cloudL','skyTint'];

/* --------------------------------------------------------------------------
   天空各层向自身亮度靠拢 = “褪成灰”，这是阴天最省事也最像的做法：
   不是叠一层灰，而是把本来有的色度抽掉。
   -------------------------------------------------------------------------- */
const _greyTmp = new THREE.Color();
function greyish(c, k){
  if (k <= 0) return c;
  const l = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
  _greyTmp.setRGB(l * 1.06, l * 1.05, l * 1.02);
  return c.lerp(_greyTmp, k);
}

/** 把 (时间, 天气) 折算成一份完整的灯光档案 */
function profileFor(timeKey, weatherKey){
  const t = TIME_P[timeKey] || TIME_P.day;
  const w = WEATHER_M[weatherKey] || WEATHER_M.clear;
  const col = {};
  for (const k of ENV_COL) col[k] = new THREE.Color(t[k]);
  for (const k of ['zen','high','mid','low','haze','ground','cloudD','cloudL']){
    col[k] = greyish(col[k], w.grey);
    if (w.dim !== 1) col[k].multiplyScalar(w.dim);
  }
  if (w.fogTint) col.fogCol.lerp(new THREE.Color(w.fogTint), w.fogMix);

  const num = {
    sunI:    t.sunI    * w.sunMul,
    hemiI:   t.hemiI   * w.hemiMul,
    bounceI: t.bounceI * w.sunMul,       // 地面反弹跟着太阳走
    fillI:   t.fillI   * w.fillMul,
    fogD:    t.fogD    * w.fogMul,
    expo:    t.expo,
    covBias: w.cov,
    shaftI:  t.shaftI  * (w.precip === 'rain' ? 0.30 : w.sunMul),
    rainAmt: w.precip === 'rain' ? 1 : 0,
    snowAmt: w.precip === 'snow' ? 1 : 0
  };
  return { num, col, dir: new THREE.Vector3(t.dir[0], t.dir[1], t.dir[2]).normalize() };
}

/* --------------------------------------------------------------------------
   运行时状态

   ENV_CUR 是“当前实际值”，每帧向 ENV_TGT 平滑靠拢（约 1.5 秒收敛）。
   这样切换设置时不会画面跳变。
   -------------------------------------------------------------------------- */
const ENV_CUR = profileFor('day', 'clear');
const ENV_TGT = profileFor('day', 'clear');
let envLift = 0;                     // 闪电的瞬时提亮（由 updateLightning 写入）

const ENV = { envTime: 'day', envWeather: 'clear' };

/* map.js 里的接触阴影（contact shadows）会把它们自己的 uniform 挂进这里，
   让环境切换时雾色/雾浓度一并更新。 */
const fogUniforms = [];

/* dust.js 里会初始化这些变量（用 var 提升为全局，见该文件） */
var shaftMat = null;
var sunShafts = [];
var shaftSpots = null;
var shaftAxis = null;

/* --------------------------------------------------------------------------
   applyEnv —— 把当前档案写进 three 的光、雾、天空、后处理

   这个函数每帧都会被 updateEnv 调用（因为 ENV_CUR 一直在向 ENV_TGT 收敛）。
   注意大多数 uniform 的赋值是 copy / set，不是重新 new —— 避免 GC 抖动。
   -------------------------------------------------------------------------- */
function applyEnv(){
  const n = ENV_CUR.num, c = ENV_CUR.col;

  sun.color.copy(c.sunCol);
  sun.intensity = n.sunI;
  sun.position.copy(ENV_CUR.dir).multiplyScalar(92);

  hemi.color.copy(c.hemiSky);
  hemi.groundColor.copy(c.hemiGnd);
  hemi.intensity = n.hemiI + envLift * 0.50;

  bounce.color.copy(c.bounceCol);  bounce.intensity = n.bounceI;
  skyFill.color.copy(c.fillCol);   skyFill.intensity = n.fillI + envLift * 0.85;

  scene.fog.color.copy(c.fogCol);
  scene.fog.density = n.fogD;

  for (const u of fogUniforms){
    u.fogColor.value.copy(c.fogCol);
    u.fogDensity.value = n.fogD;
  }

  /* 天空那几个 uniform 是 Vector3 而不是 Color（着色器里按 vec3 用），
     Vector3.copy 读的是 .x/.y/.z，传 Color 进去会写成 NaN，整个天空变黑。 */
  skyUniforms.uSun.value.copy(ENV_CUR.dir);
  skyUniforms.uSunXZ.value.set(ENV_CUR.dir.x, ENV_CUR.dir.z).normalize();
  skySet(skyUniforms.uZen,    c.zen);    skySet(skyUniforms.uHigh, c.high);
  skySet(skyUniforms.uMid,    c.mid);    skySet(skyUniforms.uLow,  c.low);
  skySet(skyUniforms.uHaze,   c.haze);   skySet(skyUniforms.uGround, c.ground);
  skySet(skyUniforms.uCloudD, c.cloudD); skySet(skyUniforms.uCloudL, c.cloudL);
  skyUniforms.uCovBias.value = n.covBias;

  compMat.uniforms.uExpo.value = n.expo;

  if (shaftMat) shaftMat.uniforms.opacity.value = n.shaftI;
  if (skyLine)  skyLine.material.color.copy(c.skyTint);

  reorientShafts(ENV_CUR.dir);

  /* weather.js 里的 WX uniform 要跟着环境一起更新，
     否则夜里的积水会映出一片白天的天 */
  if (typeof updateWeatherUniforms === 'function') updateWeatherUniforms();
}

/* --------------------------------------------------------------------------
   太阳光柱朝向重排

   太阳方向变了（切换时间），光柱的落点和朝向都得跟着走，
   否则黄昏时柱子还指着白天太阳的位置。
   这几个变量由 dust.js 初始化，所以运行时才存在。
   -------------------------------------------------------------------------- */
const _rsTop = new THREE.Vector3();
const _rsDir = new THREE.Vector3();

function reorientShafts(dir){
  if (!shaftSpots || !sunShafts.length) return;
  _rsDir.copy(dir).negate();                // 光的传播方向
  shaftAxis.copy(_rsDir);
  for (let i = 0; i < sunShafts.length; i++){
    const sp = shaftSpots[i]; if (!sp) continue;
    const [sx, sz, w, len] = sp;
    _rsTop.set(sx, 0, sz).addScaledVector(_rsDir, -len * 0.5);
    sunShafts[i].position.copy(_rsTop).addScaledVector(_rsDir, len * 0.5);
    sunShafts[i].scale.set(w, len, 1);
  }
}

/* --------------------------------------------------------------------------
   setEnvironment —— 切换时间 / 天气

   instant=true 时立即落到目标值（开局用），否则走 updateEnv 里的
   指数平滑（约 1.5 秒收敛）。
   -------------------------------------------------------------------------- */
function setEnvironment(timeKey, weatherKey, instant){
  const p = profileFor(timeKey, weatherKey);
  ENV_TGT.num = p.num;
  ENV_TGT.col = p.col;
  ENV_TGT.dir.copy(p.dir);
  ENV.envTime    = TIME_P[timeKey]      ? timeKey    : 'day';
  ENV.envWeather = WEATHER_M[weatherKey] ? weatherKey : 'clear';
  if (instant){
    for (const k of ENV_NUM) ENV_CUR.num[k] = ENV_TGT.num[k];
    for (const k of ENV_COL) ENV_CUR.col[k].copy(ENV_TGT.col[k]);
    ENV_CUR.dir.copy(ENV_TGT.dir);
    applyEnv();
  }
}

/* --------------------------------------------------------------------------
   updateEnv —— 每帧推进

   帧率无关的指数平滑：
     k = 1 - e^(-dt / 0.40)，40% 的收敛常数
     1.5 秒左右达到 95% 目标值
   -------------------------------------------------------------------------- */
function updateEnv(dt, tSec){
  /* 闪电先算，因为它要给这一帧的环境光加一个瞬时抬升 */
  updateLightning(dt);

  const k = 1 - Math.exp(-dt / 0.40);
  for (const key of ENV_NUM) ENV_CUR.num[key] += (ENV_TGT.num[key] - ENV_CUR.num[key]) * k;
  for (const key of ENV_COL) ENV_CUR.col[key].lerp(ENV_TGT.col[key], k);
  ENV_CUR.dir.lerp(ENV_TGT.dir, k);
  if (ENV_CUR.dir.lengthSq() > 1e-6) ENV_CUR.dir.normalize();

  applyEnv();

  /* 降水和雨声由 weather.js 提供（可能尚未加载，用守卫） */
  if (typeof updatePrecip     === 'function') updatePrecip(dt, tSec);
  if (typeof updateRainSound  === 'function') updateRainSound();
}

/* --------------------------------------------------------------------------
   闪电

   仅在雨中触发。亮起曲线：
     lgtV = 1  →  envLift = lgtV² × 0.9
   平方衰减是刻意的：亮一下立刻收，不留一层灰。
   雷声用一个随机延迟到达 —— 光和声不同步才是“远处打雷”的听感。
   -------------------------------------------------------------------------- */
let lgtT = rand(7, 18), lgtV = 0;

function updateLightning(dt){
  const rainA = ENV_CUR.num.rainAmt;

  if (rainA < 0.40){
    lgtV = Math.max(0, lgtV - dt * 3);
    envLift = lgtV * 0.6;
    compMat.uniforms.uLgt.value = lgtV * 0.05;
    return;
  }

  lgtT -= dt;
  if (lgtT <= 0){
    lgtT = rand(9, 22);
    lgtV = 1;
    /* 雷声按随机距离延后到达 */
    setTimeout(() => {
      if (ENV_CUR.num.rainAmt > 0.3 && typeof SFX !== 'undefined' && SFX.thunder)
        SFX.thunder();
    }, rand(250, 1400));
  }

  if (lgtV > 0) lgtV = Math.max(0, lgtV - dt * 4.2);
  envLift = lgtV * lgtV * 0.9;
  compMat.uniforms.uLgt.value = lgtV * lgtV * 0.055;
}