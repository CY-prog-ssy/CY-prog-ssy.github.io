/* =========================================================================
   weather.js
   降水粒子 / 遮蔽栅格 / 材质天气注入（湿滑、积雪、积水、涟漪）

   依赖：utils.js / renderer.js / lighting.js / environment.js
   暴露：WX, injectWeather, updateWeatherUniforms, buildCover, coverAt,
         isUnderRoof, updatePrecip, updateRainSound, updateSplashes
   ========================================================================= */
"use strict";

/* --------------------------------------------------------------------------
   WX —— 共享 uniform 字典

   所有受天气影响的 MeshStandardMaterial 都注入同一批 uniform 对象。
   更新一处即可全局生效，无需遍历材质。
   -------------------------------------------------------------------------- */
const WX = {
  uWet:     { value: 0 },
  uSnow:    { value: 0 },
  uTime:    { value: 0 },
  /* 雪是高反照率漫反射体，比混凝土亮一个量级，是雪天“泛白”的主要来源。
     0.77 已经比混凝土亮三倍，足够“泛白”，同时留住对比度（0.88 会把地面推
     到近纯白，敌人轮廓反而糊掉）。 */
  uSnowCol: { value: new THREE.Color(0xdde4ec).convertSRGBToLinear() },
  /* 下面这些是 sRGB 数值，wxSky 内部末尾统一 pow(2.2) 转线性，
     与天空着色器口径一致 */
  uSkyZen:  { value: new THREE.Vector3() },
  uSkyHigh: { value: new THREE.Vector3() },
  uSkyMid:  { value: new THREE.Vector3() },
  uSkyLow:  { value: new THREE.Vector3() },
  uSkyHaze: { value: new THREE.Vector3() },
  uSkyGnd:  { value: new THREE.Vector3() },
  uSunDir:  { value: new THREE.Vector3(0, 1, 0) }
};

/* --------------------------------------------------------------------------
   GLSL 公共片段

   hash 用天空那套无 sin 的版本：世界坐标能与 127.1/311.7 点乘到一万以上，
   sin 在中精度 GPU 上会塌成一堆重复值，水坑就变成规则条纹。
   -------------------------------------------------------------------------- */
const WX_COMMON = `
float wxHash(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float wxNoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wxHash(i),              wxHash(i + vec2(1.0, 0.0)), f.x),
             mix(wxHash(i + vec2(0.0, 1.0)), wxHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float wxFbm(vec2 p){ return wxNoise(p) * 0.68 + wxNoise(p * 2.07) * 0.32; }

/* 水坑是少数几滩，不是满地湿痕 —— 阈值卡在噪声的高端 */
float wxPuddle(vec2 xz){ return smoothstep(0.54, 0.71, wxFbm(xz * 0.17)); }

/* 涟漪：地面按 2m 分格，每格一个同心圆，格与格之间节奏不同。
   圆心偏移 ±0.35m、最大半径 0.62m，最远只到 0.97m —— 不到半格 1.0m，
   所以只算自己这一格也不会在格线上断开。 */
float wxRipple(vec2 xz, float t){
  vec2 cid = floor(xz * 0.5);
  vec2 ctr = (cid + 0.5) * 2.0 + (vec2(wxHash(cid), wxHash(cid + 17.3)) - 0.5) * 0.7;
  float sp = 0.55 + wxHash(cid + 5.1) * 0.45;
  float ph = fract(t * sp * 0.9 + wxHash(cid + 9.7));
  float q  = (length(xz - ctr) - ph * 0.62) * 11.0;
  /* 平方写成 q*q 而不是 pow(q, 2.0)：q 可能为负，GLSL 的 pow 对负底数未定义 */
  return exp(-q * q) * (1.0 - ph) * (1.0 - ph);
}
vec3 wxSky(vec3 d){
  float t = clamp(asin(clamp(d.y, -1.0, 1.0)) * 0.63661977, 0.0, 1.0);
  vec3 c = mix(uSkyHaze, uSkyLow,  smoothstep(0.00, 0.11, t));
  c = mix(c, uSkyMid,  smoothstep(0.11, 0.36, t));
  c = mix(c, uSkyHigh, smoothstep(0.36, 0.68, t));
  c = mix(c, uSkyZen,  smoothstep(0.68, 1.00, t));
  c += vec3(0.30, 0.21, 0.11) * pow(max(dot(d, uSunDir), 0.0), 2.2) * 0.62;
  float hz = 1.0 - smoothstep(0.0, 0.42, d.y);
  c = mix(c, uSkyHaze, pow(hz, 1.5) * 0.85);
  c = mix(c, uSkyGnd,  smoothstep(0.0, -0.055, d.y));
  return pow(max(c, 0.0), vec3(2.2));
}
`;

/* 顶点注入头：全世界位置 + 世界法线 */
const WX_VERT_HEAD = `
varying vec3 vWxP;
varying vec3 vWxN;
`;
/* 世界法线要在物体空间就转，因为 <defaultnormal_vertex> 之后得到的是视空间的 */
const WX_VERT_NORMAL = `
  vWxN = objectNormal;
  #ifdef USE_INSTANCING
    vWxN = mat3(instanceMatrix) * vWxN;
  #endif
  vWxN = mat3(modelMatrix) * vWxN;
`;
const WX_VERT_POS = `
  vec4 wxP4 = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wxP4 = instanceMatrix * wxP4;
  #endif
  vWxP = (modelMatrix * wxP4).xyz;
`;

const WX_FRAG_HEAD = `
varying vec3 vWxP;
varying vec3 vWxN;
uniform float uWet, uSnow, uTime;
uniform vec3 uSnowCol, uSkyZen, uSkyHigh, uSkyMid, uSkyLow, uSkyHaze, uSkyGnd, uSunDir;
` + WX_COMMON;

/* 主注入：积雪 + 湿地 + 水坑。PUDDLE_BLOCK 由调用方决定是否留下 */
const WX_FRAG_MAIN = `
  vec3 wxN = normalize(vWxN);
  float wxSnowM = 0.0;
  float wxPudM  = 0.0;
  if (uWet + uSnow > 0.002){
    float sn = wxNoise(vWxP.xz * 0.55);
    /* 只有朝上的面堆得住雪 —— 集装箱侧壁不该跟着变白 */
    wxSnowM = clamp(uSnow * smoothstep(0.34, 0.78, wxN.y) * (0.84 + 0.32 * sn), 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, uSnowCol * (0.90 + 0.18 * sn), wxSnowM);
    roughnessFactor  = mix(roughnessFactor, 0.86, wxSnowM);
    /* 雨天日照本来就只剩 0.34 倍，湿地再压到 0.58 就成了双重减光、地面发黑。
       0.68 依然一眼看得出“湿了”，但保住了混凝土的读法。 */
    float wxWetM = uWet * (1.0 - wxSnowM);
    diffuseColor.rgb *= mix(1.0, 0.68, wxWetM);
    roughnessFactor   = mix(roughnessFactor, 0.30, wxWetM);
PUDDLE_BLOCK
  }
`;
const WX_FRAG_PUDDLE = `
    wxPudM = wxPuddle(vWxP.xz) * uWet * (1.0 - wxSnowM);
    /* 水坑里的漫反射几乎全被吸收，剩下的亮度来自下面的天空反射 */
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.32, wxPudM);
    roughnessFactor  = mix(roughnessFactor, 0.06, wxPudM);
`;
/* 水面反射 + 涟漪高光，追加在 outgoingLight 定义之后 */
const WX_FRAG_TAIL = `
  if (wxPudM > 0.01){
    vec3 wxV = normalize(cameraPosition - vWxP);
    vec3 wxR = reflect(-wxV, wxN);
    float wxF = 0.028 + 0.972 * pow(1.0 - clamp(dot(wxN, wxV), 0.0, 1.0), 5.0);
    /* 掠射角几乎全反射、正视时只剩一点天光 —— 这正是水坑的读法 */
    outgoingLight = mix(outgoingLight, wxSky(wxR) * 0.62 + outgoingLight * 0.16, wxF * wxPudM * 0.92);
    outgoingLight += vec3(0.55, 0.62, 0.70) * wxRipple(vWxP.xz, uTime) * wxPudM * 0.55;
  }
`;
/* outgoingLight 原文，作为追加反射项的锚点 */
const WX_OUT_ANCHOR = 'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse'
                    + ' + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;';

/* --------------------------------------------------------------------------
   injectWeather —— 给一个 MeshStandardMaterial 装上天气反应

   puddles=true 时额外出现积水与涟漪（只给地面、平台这类能存住水的面）。
   做法是注入 MeshStandardMaterial 的着色器，而不是另铺透明面片：
   地面本来就是一张大网格，再叠一层会引出排序和 z-fighting；
   而注入被一个 uniform 分支包住，晴天（uWet=0 且 uSnow=0）几乎零开销。
   -------------------------------------------------------------------------- */
function injectWeather(mat, puddles){
  if (!mat || mat.userData.wx) return;
  mat.userData.wx = 1;

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, WX);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>',             '#include <common>\n' + WX_VERT_HEAD)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + WX_VERT_NORMAL)
      .replace('#include <project_vertex>',     '#include <project_vertex>\n' + WX_VERT_POS);

    let frag = shader.fragmentShader
      .replace('#include <common>',             '#include <common>\n' + WX_FRAG_HEAD)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n'
                                                  + WX_FRAG_MAIN.replace('PUDDLE_BLOCK', puddles ? WX_FRAG_PUDDLE : ''));

    /* 锚点找不到就只放弃反射项，绝不留下半截着色器 */
    if (frag.indexOf(WX_OUT_ANCHOR) >= 0)
      frag = frag.replace(WX_OUT_ANCHOR, WX_OUT_ANCHOR + WX_FRAG_TAIL);

    shader.fragmentShader = frag;
  };

  /* onBeforeCompile 的改动不参与 three 的程序缓存键，必须自己区分 */
  mat.customProgramCacheKey = () => 'wx_' + (puddles ? 'p' : 'd');
}

/* --------------------------------------------------------------------------
   把当前环境颜色推给 WX uniform

   由 environment.js 的 applyEnv 每帧调用 —— 天空反射必须跟着时间/天气一起变，
   否则夜里的水坑会映出一片白天的天。
   -------------------------------------------------------------------------- */
function updateWeatherUniforms(){
  const c = ENV_CUR.col;
  WX.uWet.value  = ENV_CUR.num.rainAmt;
  WX.uSnow.value = ENV_CUR.num.snowAmt;
  WX.uSunDir.value.copy(ENV_CUR.dir);
  WX.uSkyZen.value.set(c.zen.r, c.zen.g, c.zen.b);
  WX.uSkyHigh.value.set(c.high.r, c.high.g, c.high.b);
  WX.uSkyMid.value.set(c.mid.r, c.mid.g, c.mid.b);
  WX.uSkyLow.value.set(c.low.r, c.low.g, c.low.b);
  WX.uSkyHaze.value.set(c.haze.r, c.haze.g, c.haze.b);
  WX.uSkyGnd.value.set(c.ground.r, c.ground.g, c.ground.b);
}

/* =========================================================================
   降水遮蔽图
   -------------------------------------------------------------------------
   雨滴是在相机周围 22m 半径、20m 高的圆柱里随机撒的，它不知道头顶有没有
   东西。站在仓库里、集装箱旁、平台下方都会看到雨滴悬在自己周围 ——
   深度测试挡不住，因为那些雨滴和相机之间确实没有任何几何体，
   它们本来就在室内空间里。

   修法：预计算“每个 xz 位置上方多高开始有遮挡”的栅格图，雨滴落到这个
   高度以下就隐藏。用栅格而不是每帧 raycast：1000 条雨滴 × 每帧一次射线，
   在满编 32 人的帧里是纯粹的浪费，而栅格查询只是一次数组取值。
   ========================================================================= */
const COV_STEP = 0.5;
let COV_W = 0, COV = null, covBuilt = false;

/** 把 colliders 光栅化进遮蔽图。炮塔这类后加的碰撞体靠这个重建。 */
function buildCover(){
  if (!COV){
    COV_W = Math.round(HALF * 2 / COV_STEP) + 1;
    COV = new Float32Array(COV_W * COV_W);
  }
  COV.fill(0);
  for (let n = 0; n < colliders.length; n++){
    const c = colliders[n];
    const top = c.maxY;
    /* 太矮的杂物不值得让雨在它上方消失 —— 那会在地面附近抠出一堆空洞 */
    if (top < 0.6) continue;
    let i0 = Math.round((c.minX + HALF) / COV_STEP), i1 = Math.round((c.maxX + HALF) / COV_STEP);
    let j0 = Math.round((c.minZ + HALF) / COV_STEP), j1 = Math.round((c.maxZ + HALF) / COV_STEP);
    if (i1 < 0 || j1 < 0 || i0 >= COV_W || j0 >= COV_W) continue;
    if (i0 < 0) i0 = 0; if (i1 >= COV_W) i1 = COV_W - 1;
    if (j0 < 0) j0 = 0; if (j1 >= COV_W) j1 = COV_W - 1;
    for (let j = j0; j <= j1; j++){
      const row = j * COV_W;
      for (let i = i0; i <= i1; i++){
        if (top > COV[row + i]) COV[row + i] = top;
      }
    }
  }
  covBuilt = true;
}

/** 该 xz 上方最近遮挡面的高度；0 表示露天。场地之外一律当作露天 */
function coverAt(x, z){
  if (!covBuilt) buildCover();
  const i = Math.round((x + HALF) / COV_STEP), j = Math.round((z + HALF) / COV_STEP);
  if (i < 0 || j < 0 || i >= COV_W || j >= COV_W) return 0;
  return COV[j * COV_W + i];
}

/** 相机是否处在有顶的空间里（用于压低雨声） */
function isUnderRoof(){
  return coverAt(camera.position.x, camera.position.z) > camera.position.y + 0.25;
}

/* --------------------------------------------------------------------------
   降水粒子系统
   -------------------------------------------------------------------------- */
const PR_HIDDEN_Y = -900;         // 隐藏位置：挪到地面以下足够深，深度测试会剔除
const PR_N_RAIN = 1000, PR_N_SNOW = 700, PR_R = 22, PR_H = 20;

let rainMesh = null, snowMesh = null;
const prX = new Float32Array(PR_N_RAIN), prY = new Float32Array(PR_N_RAIN), prZ = new Float32Array(PR_N_RAIN);
const snX = new Float32Array(PR_N_SNOW), snY = new Float32Array(PR_N_SNOW),
      snZ = new Float32Array(PR_N_SNOW), snPh = new Float32Array(PR_N_SNOW);

function softDotTex(){
  const [c, x] = cvs(32);
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0,    'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,.82)');
  g.addColorStop(1,    'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** 随机一个相机周围的露天位置（世界坐标）。
    必须围绕相机取，不能照搬“原点附近 ±22 再靠 wrapAxis 拉回来”那套 ——
    那样遮蔽检查查的是相机以外的地方，筛了等于没筛。 */
function randomOpenXZ(){
  const px = camera.position.x, pz = camera.position.z;
  for (let k = 0; k < 6; k++){
    const x = px + rand(-PR_R, PR_R), z = pz + rand(-PR_R, PR_R);
    if (coverAt(x, z) === 0) return [x, z];
  }
  return [px + rand(-PR_R, PR_R), pz + rand(-PR_R, PR_R)];
}

function buildPrecip(){
  /* ---- 雨 ---- */
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PR_N_RAIN * 6), 3));
  rainMesh = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({
    color: 0xaec6dc, transparent: true, opacity: 0.32, fog: false,
    /* 不写深度（免得雨丝互相遮挡出硬边），但必须测深度 —— 穿过屋顶的
       那半截雨丝要靠屋顶的深度值裁掉，否则就会漏进屋里 */
    depthWrite: false, depthTest: true
  }));
  rainMesh.frustumCulled = false;
  rainMesh.visible = false;
  rainMesh.renderOrder = 5;
  scene.add(rainMesh);

  /* 这里不挑位置：buildPrecip 在世界构建之前跑，colliders 还是空的，
     此时触发 buildCover 会锁死一张全露天的空图。第一帧的逐粒检查会
     把落在屋里的藏起来，落地重生时再挑露天位置。 */
  for (let i = 0; i < PR_N_RAIN; i++){
    prX[i] = rand(-PR_R, PR_R); prZ[i] = rand(-PR_R, PR_R); prY[i] = rand(0, PR_H);
  }

  /* ---- 雪 ---- */
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PR_N_SNOW * 3), 3));
  snowMesh = new THREE.Points(sg, new THREE.PointsMaterial({
    size: 0.09, map: softDotTex(), transparent: true, opacity: 0.9,
    depthWrite: false, depthTest: true, sizeAttenuation: true, fog: false
  }));
  snowMesh.frustumCulled = false;
  snowMesh.visible = false;
  scene.add(snowMesh);

  for (let i = 0; i < PR_N_SNOW; i++){
    snX[i] = rand(-PR_R, PR_R); snZ[i] = rand(-PR_R, PR_R); snY[i] = rand(0, PR_H); snPh[i] = rand(0, 7);
  }

  covBuilt = false;          // 世界还没建完，强制下一帧重新光栅化
}
buildPrecip();

/** 以相机为中心环绕：越过边界就从对侧回来，视觉上雨是钉在世界里的 */
function wrapAxis(v, c){
  const d = v - c;
  if (d >  PR_R) return v - PR_R * 2;
  if (d < -PR_R) return v + PR_R * 2;
  return v;
}

/* --------------------------------------------------------------------------
   updatePrecip —— 每帧推进降水
   -------------------------------------------------------------------------- */
function updatePrecip(dt, tSec){
  const px = camera.position.x, pz = camera.position.z;
  const rainA = ENV_CUR.num.rainAmt, snowA = ENV_CUR.num.snowAmt;
  const dens = (typeof FX_DENSITY === 'number' ? FX_DENSITY : 1.0);

  if (rainMesh){
    rainMesh.visible = rainA > 0.02;
    if (rainMesh.visible){
      const p = rainMesh.geometry.attributes.position.array;
      const fall = 15.5 * dt, len = 0.62, sxw = 0.10, szw = 0.06;
      const activeRain = Math.max(0, Math.floor(PR_N_RAIN * dens));
      for (let i = 0; i < PR_N_RAIN; i++){
        const o = i * 6;
        /* 密度限制：超出范围的粒子推到隐藏高度，GPU 深度剔除 */
        if (i >= activeRain){
          p[o] = 0; p[o+1] = PR_HIDDEN_Y; p[o+2] = 0;
          p[o+3] = 0; p[o+4] = PR_HIDDEN_Y; p[o+5] = 0;
          continue;
        }
        prY[i] -= fall;
        if (prY[i] < -1){
          prY[i] = PR_H;
          const oo = randomOpenXZ();
          prX[i] = oo[0]; prZ[i] = oo[1];
        }
        prX[i] = wrapAxis(prX[i], px); prZ[i] = wrapAxis(prZ[i], pz);
        const x = prX[i], y = prY[i], z = prZ[i];
        const cov = coverAt(x, z);
        if (cov > 0 && y < cov){
          p[o] = x; p[o+1] = PR_HIDDEN_Y; p[o+2] = z;
          p[o+3] = x; p[o+4] = PR_HIDDEN_Y; p[o+5] = z;
          continue;
        }
        p[o]   = x;             p[o+1] = y;       p[o+2] = z;
        p[o+3] = x + sxw * len; p[o+4] = y - len; p[o+5] = z + szw * len;
      }
      rainMesh.geometry.attributes.position.needsUpdate = true;
      rainMesh.material.opacity = 0.32 * rainA * Math.min(1, dens * 1.6);
    }
  }

  if (snowMesh){
    snowMesh.visible = snowA > 0.02;
    if (snowMesh.visible){
      const p = snowMesh.geometry.attributes.position.array;
      const fall = 1.15 * dt;
      const activeSnow = Math.max(0, Math.floor(PR_N_SNOW * dens));
      for (let i = 0; i < PR_N_SNOW; i++){
        const o = i * 3;
        if (i >= activeSnow){
          p[o] = 0; p[o+1] = PR_HIDDEN_Y; p[o+2] = 0;
          continue;
        }
        snY[i] -= fall;
        if (snY[i] < -1){
          snY[i] = PR_H;
          const oo = randomOpenXZ();
          snX[i] = oo[0]; snZ[i] = oo[1];
        }
        snX[i] = wrapAxis(snX[i], px); snZ[i] = wrapAxis(snZ[i], pz);
        const y = snY[i];
        const fx = snX[i] + Math.sin(tSec * 0.6 + snPh[i]) * 0.45;
        const fz = snZ[i] + Math.cos(tSec * 0.47 + snPh[i]) * 0.45;
        const cov = coverAt(fx, fz);
        if (cov > 0 && y < cov){
          p[o] = fx; p[o+1] = PR_HIDDEN_Y; p[o+2] = fz;
          continue;
        }
        p[o] = fx; p[o+1] = y; p[o+2] = fz;
      }
      snowMesh.geometry.attributes.position.needsUpdate = true;
      snowMesh.material.opacity = 0.9 * snowA * Math.min(1, dens * 1.4);
    }
  }

  updateSplashes(dt);
}

/* --------------------------------------------------------------------------
   溅射 —— 雨滴砸到地上弹起的一小撮水花

   涟漪（着色器里）负责“水面被敲了一下”，这个负责“水花跳起来”——
   两者缺一个，雨落在地上都像落在玻璃上。

   只在相机周围 8m 里撒：更远的根本看不清，撒了是白扔粒子。
   -------------------------------------------------------------------------- */
let splashAcc = 0;

function updateSplashes(dt){
  const rainA = ENV_CUR.num.rainAmt;
  if (rainA < 0.05) return;
  if (typeof spawnParticle !== 'function' || typeof PS_SPLASH === 'undefined') return;

  splashAcc += dt * 16 * rainA;
  /* 用玩家脚下的高度而不是每次去 raycast：玩家和相机基本重合，
     而 groundAt 是一次对整片 groundMesh 的射线检测，一秒撒十几次不值当。 */
  const baseY = (typeof player !== 'undefined' && player.pos) ? player.pos.y : 0;

  let guard = 0;
  while (splashAcc >= 1 && guard++ < 6){
    splashAcc -= 1;
    const a = Math.random() * Math.PI * 2, r = 1.1 + Math.random() * 7.0;
    const x = camera.position.x + Math.cos(a) * r;
    const z = camera.position.z + Math.sin(a) * r;
    if (Math.abs(x) > 29 || Math.abs(z) > 29) continue;      // 别撒到围栏外面
    /* 头顶有东西就不会有雨滴砸下来，也就没有水花 */
    if (coverAt(x, z) > baseY + 0.3) continue;
    spawnParticle(PS_SPLASH, x, baseY + 0.03, z,
      (Math.random() - 0.5) * 0.55, 1.15 + Math.random() * 0.85, (Math.random() - 0.5) * 0.55,
      { color: [0.74, 0.82, 0.90], size: 0.055, life: 0.26, drag: 3.4, grav: -9.5, alpha: 0.7 });
  }
}

/* --------------------------------------------------------------------------
   雨声

   只在跨过 0.05 台阶时才更新，免得每帧去动 Web Audio 参数。
   音频未就绪（还没开始游戏）时每帧重试一次 —— 一旦拿到上下文就不再重试。

   站在屋顶底下时把雨声压掉七成：画面里已经没有雨了，耳朵里还哗哗响
   会比“雨漏进来”更让人出戏。用的是同一张遮蔽图，不额外开销。
   切换有 0.05 的滞回，免得在屋檐边上来回横跳时声音抖动。
   -------------------------------------------------------------------------- */
let _rainSent = -1, _rainLive = false;

function updateRainSound(){
  const v = ENV_CUR.num.rainAmt * (isUnderRoof() ? 0.28 : 1);
  if (_rainLive && Math.abs(v - _rainSent) < 0.05) return;
  if (typeof SFX === 'undefined' || typeof SFX.setRain !== 'function') return;
  _rainLive = SFX.setRain(v) === true;
  if (_rainLive) _rainSent = v;
}