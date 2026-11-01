/* =========================================================================
   lighting.js
   世界光照 + 程序化天空穹顶 + 远景天际线

   依赖：utils.js（sRGB/rand/randI/clamp/pick/PI）
         renderer.js（scene/camera/FOG_COLOR）
   暴露：SUN_DIR, sun, hemi, bounce, skyFill, skyUniforms, skyMat, skyLine
   ========================================================================= */
"use strict";

/* --------------------------------------------------------------------------
   太阳方向 —— 仰角约 31°

   低到能让 2.85m 的集装箱投出 4.7m 的影子（影子是这张地图最重要的读图信息），
   又高到不会让仓库在场地中央划出一大片死黑。
   -------------------------------------------------------------------------- */
const SUN_DIR = new THREE.Vector3(-0.62, 0.47, 0.46).normalize();

/* 日与补光比约 2.35:1.4。再拉大会让阴影面直接拍黑，再收窄则集装箱平贴在天空上。
   场地本身很开阔，多数画面直接受光，所以对比靠「垂直面」而不是「投影面积」。 */
const hemi = new THREE.HemisphereLight(0xa6bacd, 0x6f6450, 0.74);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffdcae, 2.35);
sun.position.copy(SUN_DIR).multiplyScalar(92);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near   = 24;
sun.shadow.camera.far    = 230;
sun.shadow.camera.left   = -52;
sun.shadow.camera.right  =  52;
sun.shadow.camera.top    =  52;
sun.shadow.camera.bottom = -52;
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.026;
scene.add(sun);
scene.add(sun.target);

/* 地面反弹：让背光面呈暖灰而不是黑 */
const bounce = new THREE.DirectionalLight(0xb0916a, 0.36);
bounce.position.set(0.45, -0.85, -0.55);
scene.add(bounce);

/* 天空侧向补光：从太阳对面来的冷补，压住背光面的色偏 */
const skyFill = new THREE.DirectionalLight(0x8fa8c4, 0.28);
skyFill.position.set(0.75, 0.55, -0.62);
scene.add(skyFill);

/* --------------------------------------------------------------------------
   SKY —— 每像素求值的天空穹顶

   为什么不贴图？
     4096×2048 的 equirect 贴图 = 11 texel/度，
     狙击镜 15° 视场下屏幕 1920px 分摊约 170 texel —— 每个 texel 撑起 11 个像素。
     再翻倍也只多一档清晰度，还多花 64MB 显存。
     此外 equirect 会把每一列都挤压到天顶，极点会旋成风车。

   所以天空是逐片元算出来的：分辨率无关，狙击镜放大的是射线方向而非位图。
   -------------------------------------------------------------------------- */
const SKY_HAZE = '#b0a99c';

/* 天空色全部按 sRGB 书写，和其他代码一致。
   着色器末尾统一转线性。 */
const SKY_C = hex => {
  const c = new THREE.Color(hex);
  return new THREE.Vector3(c.r, c.g, c.b);
};

const skyUniforms = {
  uTime:   { value: 0 },
  uSun:    { value: SUN_DIR.clone() },
  uSunXZ:  { value: new THREE.Vector2(SUN_DIR.x, SUN_DIR.z).normalize() },
  uZen:    { value: SKY_C('#2f4055') },
  uHigh:   { value: SKY_C('#5c6d7c') },
  uMid:    { value: SKY_C('#8b9196') },
  uLow:    { value: SKY_C('#a8a79f') },
  uHaze:   { value: SKY_C(SKY_HAZE) },
  uGround: { value: SKY_C('#8a8378') },
  /* 云色调刻意压得很近：这是重工业场地上空的脏云层，不是晴天的积云。
     两层色差一拉开就会散成一片片独立的亮斑。 */
  uCloudD: { value: SKY_C('#71757c') },
  uCloudL: { value: SKY_C('#c6c1b6') },
  /* 云量偏移：0 = 原始云量，正值云层变厚（阴 / 雨 / 雪） */
  uCovBias:{ value: 0 }
};

const skyMat = new THREE.ShaderMaterial({
  uniforms: skyUniforms,
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  extensions: { derivatives: true },
  vertexShader: `
  varying vec3 vDir;
  void main(){
    /* 穹顶钉在相机上，所以 object space 就是视线方向 */
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`,
  fragmentShader: `
  precision highp float;
  varying vec3 vDir;
  uniform float uTime, uCovBias;
  uniform vec3  uSun, uZen, uHigh, uMid, uLow, uHaze, uGround, uCloudD, uCloudL;
  uniform vec2  uSunXZ;

  float hash21(vec2 p){
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i),             hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  /* 带限 fBm：fw 是本片元在噪声坐标系里的足迹宽度，
     比足迹更细的倍频直接丢弃而不采样。
     没有这个，云顶会在接近地平线处闪烁 —— 那里一块天顶角能横跨几百个噪声格。
     用存活倍频的权重重新归一化，保证均值恒为 0.5，覆盖率不随倍频减少而漂移。 */
  float fbm5(vec2 p, float fw){
    float s = 0.0, n = 0.0, a = 0.5, f = 1.0;
    for (int i = 0; i < 5; i++){
      float w = a * (1.0 - smoothstep(0.30, 0.90, fw * f));
      s += w * vnoise(p * f); n += w; f *= 2.03; a *= 0.44;
    }
    return n > 1e-4 ? s / n : 0.5;
  }
  float fbm3(vec2 p, float fw){
    float s = 0.0, n = 0.0, a = 0.5, f = 1.0;
    for (int i = 0; i < 3; i++){
      float w = a * (1.0 - smoothstep(0.30, 0.90, fw * f));
      s += w * vnoise(p * f); n += w; f *= 2.03; a *= 0.5;
    }
    return n > 1e-4 ? s / n : 0.5;
  }
  float fbm2(vec2 p, float fw){
    float s = 0.0, n = 0.0, a = 0.5, f = 1.0;
    for (int i = 0; i < 2; i++){
      float w = a * (1.0 - smoothstep(0.30, 0.90, fw * f));
      s += w * vnoise(p * f); n += w; f *= 2.03; a *= 0.5;
    }
    return n > 1e-4 ? s / n : 0.5;
  }

  void main(){
    vec3 d = normalize(vDir);
    float sd = max(dot(d, uSun), 0.0);

    /* 高度按 1/4 圆的分数走 —— 与原梯度对齐（按角度线性，不是 sin） */
    float t = clamp(asin(clamp(d.y, -1.0, 1.0)) * 0.63661977, 0.0, 1.0);
    vec3 col = mix(uHaze, uLow,  smoothstep(0.00, 0.11, t));
    col = mix(col, uMid,  smoothstep(0.11, 0.36, t));
    col = mix(col, uHigh, smoothstep(0.36, 0.68, t));
    col = mix(col, uZen,  smoothstep(0.68, 1.00, t));
    col += vec3(0.30, 0.21, 0.11) * pow(sd, 2.2) * 0.62;

    if (d.y > -0.02){
      /* 投影到一块平板上 —— 云天然向地平线聚拢，天顶就是普普通通的一个点，
         没有极点要抹平。equirect 贴图的失败模式在这里被彻底设计掉了。 */
      vec2  cp = d.xz / max(d.y, 0.055);
      float fw = max(length(dFdx(cp)), length(dFdy(cp)));
      vec2  wind = vec2(uTime * 0.0040, uTime * 0.0016);
      const float K = 2.35;

      float n = fbm5(cp * K + wind, fw * K);
      /* 阈值故意开得很宽。收窄会把每一层倍频都切成硬边斑块，
         天空读起来像鲭鱼纹；让斜坡横跨整个场值域，云层才是连续的，
         细节靠明暗而非轮廓来承担。 */
      float cov = smoothstep(0.30 - uCovBias, 0.80 - uCovBias * 1.35, n);

      /* 向太阳方向位移的第二次采样，代劳一次光照行进：
         云层在那个方向加厚，本片元就在自己的阴影里；在那个方向变薄，就吃到冠部亮光。 */
      float n2 = fbm2((cp + uSunXZ * 0.30) * K + wind, fw * K);
      vec3 cc = mix(uCloudD, uCloudL, clamp((n - n2) * 2.6 + 0.50, 0.0, 1.0));

      /* 卷云：同一场被一根轴压扁 —— 风切变条带就是这么来的。
         刻意画得很淡，它是天花板上的纹理，不是和主体抢戏的第二层云。 */
      vec2 sp = vec2(cp.x * 0.22, cp.y * 1.35) * (K * 1.9) + wind * 2.4;
      float cir = smoothstep(0.52, 0.86, fbm3(sp, fw * K * 2.6)) * 0.10;

      float fade = smoothstep(0.008, 0.075, d.y);
      col = mix(col, vec3(0.80, 0.81, 0.82), cir * fade);
      col = mix(col, cc, cov * fade * 0.94);
      col += vec3(0.40, 0.30, 0.17) * pow(sd, 55.0) * (1.0 - cov * 0.55);
    }

    /* 雾带要高到 20°，它是唯一让场地与背景之间产生空气的东西。
       没有它云层会一路贴到集装箱后面，整个画面会塌平。 */
    float hz = 1.0 - smoothstep(0.0, 0.42, d.y);
    col = mix(col, uHaze, pow(hz, 1.5) * 0.85);
    col = mix(col, uGround, smoothstep(0.0, -0.055, d.y));

    /* 略小于一个 8bit 灰阶，刚好散掉色调映射在这么宽的渐变里会拉出的等高线 */
    col += (hash21(gl_FragCoord.xy) - 0.5) * 0.0045;

    gl_FragColor = vec4(pow(max(col, 0.0), vec3(2.2)), 1.0);
  }`
});

/* 64×32 就够 —— 不再从贴图采样后，分段只需要防止球面在自身渐变上显出棱角 */
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(300, 64, 32), skyMat);
skyDome.frustumCulled = false;
/* 排在所有不透明物体的最后画：穹顶不写深度，
   被墙挡住的天空像素会被 early-z 干掉，不再跑噪声。
   这么封闭的场地里，这一条省掉的几乎是整个屏幕。 */
skyDome.renderOrder = 1000;
/* 钉在眼睛上 —— 天空在无穷远。
   放在原点，300m 的穹顶在 90m 的地图上会露出明显视差，太阳会跟着你走。 */
skyDome.matrixAutoUpdate = false;
skyDome.updateMatrixWorld = function(){
  this.matrixWorld.setPosition(camera.position);
};
scene.add(skyDome);

/* --------------------------------------------------------------------------
   远景天际线

   剪影，不是贴图。之前在 equirect 贴图里这些只有三十个像素高，
   狙击镜一抬起来就第一个糊掉。改成几何体，六百个三角，
   任何放大倍率下边缘都是实的；雾色烘进顶点色，
   所以它们是坐在空气里，而不是浮在前面 ——
   270m 处的场景雾会把它们直接抹掉。
   -------------------------------------------------------------------------- */
let skyLine = null;
{
  const pos = [], col = [], idx = [];
  const DARK = new THREE.Color('#56565b');
  const HAZE = new THREE.Color(SKY_HAZE);
  const D2R = Math.PI / 180;

  /* az 单位是角度方位；wDeg 是宽度；y0/y1 是仰角。
     剪影按它张开的角度书写，再投影到所在半径。 */
  const push = (R, az, wDeg, y0Deg, y1Deg, blend) => {
    const hw = R * Math.tan(wDeg * 0.5 * D2R);
    const s = Math.sin(az * D2R), c = Math.cos(az * D2R);
    const cx = R * s, cz = R * c, tx = c, tz = -s;
    const y0 = y0Deg * D2R * R, y1 = y1Deg * D2R * R;
    const k = DARK.clone().lerp(HAZE, blend).convertSRGBToLinear();
    const b = pos.length / 3;
    pos.push(cx - tx*hw, y0, cz - tz*hw,  cx + tx*hw, y0, cz + tz*hw,
             cx + tx*hw, y1, cz + tz*hw,  cx - tx*hw, y1, cz - tz*hw);
    for (let i = 0; i < 4; i++) col.push(k.r, k.g, k.b);
    idx.push(b, b+1, b+2, b, b+2, b+3);
  };

  const rank = (R, scale, blend) => {
    let az = rand(0, 40);
    while (az < 360){
      const k = Math.random();
      if (k < 0.16){                                   // 烟囱
        const w = rand(0.30, 0.62) * scale, h = rand(1.9, 3.2) * scale;
        push(R, az + w * 0.5, w, -0.4, h, blend);
        az += w + rand(0.9, 3.6) * scale;
      } else if (k < 0.32){                            // 门式起重机
        const w = rand(3.2, 5.6) * scale, h = rand(1.2, 1.9) * scale, leg = 0.26 * scale;
        push(R, az + leg * 0.5, leg, -0.4, h, blend);
        push(R, az + w - leg * 0.5, leg, -0.4, h, blend);
        push(R, az + w * 0.5, w + 1.6 * scale, h, h + 0.30 * scale, blend);
        az += w + rand(1.6, 5.4) * scale;
      } else if (k < 0.46){                            // 储罐
        const w = rand(1.4, 2.7) * scale, h = w * 0.62;
        push(R, az + w * 0.5, w, -0.4, h, blend);
        push(R, az + w * 0.5, w * 0.78, h, h + w * 0.22, blend);
        az += w + rand(1.1, 3.9) * scale;
      } else if (k < 0.62){                            // 桁架塔
        const w = rand(0.75, 1.1) * scale, h = rand(1.5, 2.5) * scale;
        push(R, az + w * 0.5, 0.17 * scale, -0.4, h, blend);
        for (let j = 0; j < 3; j++)
          push(R, az + w * 0.5, w, h * (0.30 + j * 0.235), h * (0.30 + j * 0.235) + 0.13 * scale, blend);
        az += w + rand(4.0, 11.5) * scale;
      } else {                                         // 仓库块体
        const w = rand(3.8, 15.0) * scale, h = rand(0.5, 1.3) * scale;
        push(R, az + w * 0.5, w, -0.4, h, blend);
        if (Math.random() < 0.45) push(R, az + w * 0.3, w * 0.22, h, h + 0.30 * scale, blend);
        az += w + rand(1.1, 5.0) * scale;
      }
    }
  };

  rank(292, 1.00, 0.62);    // 远环：更深地陷在雾里
  rank(258, 0.74, 0.40);    // 近环

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color',    new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);

  const sl = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
    vertexColors: true,
    fog: false,
    side: THREE.DoubleSide
  }));
  sl.frustumCulled = false;
  scene.add(sl);
  skyLine = sl;
}

/* --------------------------------------------------------------------------
   天气系统需要把天空色写进着色器 vec3 uniform。
   Vector3.copy 读的是 .x/.y/.z，塞 Color 会写成 NaN 让天空变黑，
   所以走这个专门的辅助函数。
   -------------------------------------------------------------------------- */
function skySet(u, c){ u.value.set(c.r, c.g, c.b); }