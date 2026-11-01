'use strict';
// ============================================================
//  WebGL2 渲染器
// ============================================================

const MAXL = 32;
const MAX_POOL_COLUMNS = 12;

const WORLD_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
layout(location=2) in vec3 aUVL;
layout(location=3) in float aEmit;
uniform mat4 uVP;
out vec3 vPos;
out vec3 vNor;
out vec2 vUV;
flat out float vLayer;
out float vEmit;
void main() {
  vPos = aPos; vNor = aNor; vUV = aUVL.xy; vLayer = aUVL.z; vEmit = aEmit;
  gl_Position = uVP * vec4(aPos, 1.0);
}`;

const WORLD_FS = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec3 vPos;
in vec3 vNor;
in vec2 vUV;
flat in float vLayer;
in float vEmit;
uniform sampler2DArray uTex;
uniform vec4 uLP[${MAXL}];
uniform vec3 uLC[${MAXL}];
uniform int uLN;
uniform float uLRad;
uniform vec3 uAmb;
uniform vec3 uCam;
uniform vec3 uFogCol;
uniform float uFogDen;
uniform vec3 uFlPos;
uniform vec3 uFlDir;
uniform vec3 uFlCol;
uniform float uFl;
uniform float uWallH;
uniform float uExposure;
uniform vec3 uPanelTint;
uniform float uTime;
uniform vec3 uMist;       // x 密度，y 随高度衰减的速率（0 = 无低雾）
uniform vec3 uMistCol;
uniform float uJoint;     // 地坪伸缩缝间距（0 = 无）
uniform float uDitherFrom;
uniform float uSteamLayer;
uniform float uWet0;
uniform float uWet1;
uniform float uWaterLayer;
uniform float uTileLayer;
uniform float uSkyLayer;
uniform float uPool;
uniform float uWaterHeight;
uniform int uWaterPass;
uniform vec4 uPoolColumns[${MAX_POOL_COLUMNS}]; // x,z,半径,柱顶
uniform int uPoolColumnCount;
uniform vec4 uPoolSun; // 东侧采光口：x,y0,z0,z1
uniform float uPoolSunTop;
uniform vec2 uPoolRoom;
uniform vec4 uPoolSky; // 天井边界 x0,z0,x1,z1
uniform vec2 uPoolSkyHeights; // 瓷砖顶棚与光井上沿的高度
uniform float uTouch;
uniform float uBeach;       // Level 994：室外日光、海面、天空
uniform float uSeaLayer;
uniform float uSandLayer;
uniform vec4 uTide;         // x 整体上涨 y 涨潮前锋 z 前锋坡度 w 水下坡度
uniform float uHaze;        // 海雾 0..1
uniform float uHaunt;       // 靠近海水时，水下浮现的人脸
out vec4 oCol;

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

float poolVisibility(vec3 p, vec3 ray) {
  float vis = 1.0;
  float den = max(dot(ray.xz, ray.xz), 0.001);
  for (int i = 0; i < ${MAX_POOL_COLUMNS}; i++) {
    if (i >= uPoolColumnCount) break;
    vec4 c = uPoolColumns[i];
    float t = dot(c.xy - p.xz, ray.xz) / den;
    if (t < 0.015 || t > 0.985) continue;
    float y = p.y + ray.y * t;
    if (y < -3.2 || y > c.w) continue;
    float d = length(p.xz + ray.xz * t - c.xy);
    vis = min(vis, smoothstep(c.z - 0.08, c.z + 0.12, d));
  }
  return vis;
}

float cloudNoise(vec2 p) {
  float n = 0.0, amp = 0.55, total = 0.0;
  for (int i = 0; i < 5; i++) {
    n += vnoise(p) * amp;
    total += amp;
    p = mat2(1.6, -1.2, 1.2, 1.6) * p + vec2(7.1, 3.8);
    amp *= 0.5;
  }
  return n / total;
}

// 视线指向远处的天空，同一片云会连续地出现在不同采光口里。
vec3 poolSkyColor(vec3 dir) {
  float elevation = clamp(dir.y, 0.0, 1.0);
  vec3 sky = mix(vec3(0.57, 0.78, 0.93), vec3(0.12, 0.43, 0.78), pow(elevation, 0.55));
  vec2 p = dir.xz / max(dir.y + 0.2, 0.12) * 1.7 + vec2(uTime * 0.0025, uTime * 0.0006);
  float n = cloudNoise(p + vec2(4.7, 8.3));
  float body = smoothstep(0.47, 0.64, n) * smoothstep(-0.02, 0.12, dir.y);
  float light = smoothstep(0.35, 0.66, cloudNoise(p + vec2(4.6, 8.1)));
  vec3 cloud = mix(vec3(0.70, 0.79, 0.85), vec3(0.98, 0.985, 0.98), 0.45 + light * 0.55);
  sky = mix(sky, cloud, body);
  float sun = max(dot(dir, normalize(vec3(0.8, 0.65, 0.22))), 0.0);
  sky += vec3(1.0, 0.86, 0.63) * pow(sun, 180.0) * 0.10 * (1.0 - body * 0.8);
  sky = mix(sky, vec3(1.0, 0.98, 0.88), smoothstep(0.9995, 0.9999, sun) * (1.0 - body));
  return clamp(sky, 0.0, 1.0);
}

const vec3 BEACH_SUN = vec3(0.7385, 0.6000, 0.2031); // normalize(0.8, 0.65, 0.22)，与天空里的太阳一致
const vec3 HAZE_COL = vec3(0.80, 0.82, 0.84);

// 与 world.js 的 BEACH / beachProfile / beachSea 完全相同
float bCliff(float z) { return 8.0 + 3.2 * sin(z * 0.031 + 0.7) + 1.6 * sin(z * 0.083 + 2.1) + 0.7 * sin(z * 0.21); }
float bWidth(float z) {
  float a = (z - 205.0) / 12.0, b = (z - 105.0) / 11.0;
  return 27.0 + 6.0 * sin(z * 0.019 + 1.3) + 3.5 * sin(z * 0.061 + 0.4) - 15.0 * exp(-a * a) - 14.0 * exp(-b * b);
}
float bProfile(float x, float z) {
  float c = bCliff(z), s = c + bWidth(z);
  if (x < s) return (2.4 + 0.4 * sin(z * 0.05 + 0.3)) * pow(clamp((s - x) / (s - c), 0.0, 1.3), 0.75);
  return max(-6.0, -(x - s) * uTide.w);
}
float bSeaTop(float z) { return uTide.x + clamp((z - uTide.y) * uTide.z, 0.0, 3.2) + 0.12; }
float bSea(float z) { return bSeaTop(z) - 0.12 + 0.12 * (0.5 + 0.5 * sin(uTime * 0.8 + z * 0.043)); }

// 地平线附近的天色，海雾浓时发白
vec3 beachHorizon(vec3 dir) {
  vec3 h = poolSkyColor(normalize(vec3(dir.x, 0.015, dir.z)));
  return mix(h, HAZE_COL, uHaze);
}

float seaHeight(vec2 q, float t) {
  return vnoise(q * 0.18 + vec2(t * 0.12, t * 0.05)) + 0.5 * vnoise(q * 0.7 + vec2(-t * 0.3, t * 0.2)) + 0.25 * vnoise(q * 2.3 + vec2(t * 0.6, -t * 0.4));
}

// 海面：在显示空间里着色（与天空同一套颜色），按水深给出透明度——浅水能看见水底的沙
vec4 seaColor(vec3 p) {
  float d = p.y - bProfile(p.x, p.z);
  vec3 V = normalize(uCam - p);
  float t = uTime, e = 0.35, dist = length(uCam - p);
  vec2 q = p.xz;
  float h0 = seaHeight(q, t), hx = seaHeight(q + vec2(e, 0.0), t), hz = seaHeight(q + vec2(0.0, e), t);
  float amp = 0.5 / (1.0 + dist * 0.03);
  vec3 N = normalize(vec3(-(hx - h0) / e * amp, 1.0, -(hz - h0) / e * amp));
  float F = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 body = mix(vec3(0.30, 0.78, 0.76), vec3(0.06, 0.50, 0.62), smoothstep(0.2, 2.5, d));
  body = mix(body, vec3(0.03, 0.27, 0.46), smoothstep(2.5, 6.0, d));
  vec3 sky = poolSkyColor(reflect(-V, N));
  vec3 col = mix(body * (0.78 + 0.22 * max(dot(N, BEACH_SUN), 0.0)), sky, F * 0.9);
  col += vec3(1.0, 0.95, 0.82) * pow(max(dot(N, normalize(BEACH_SUN + V)), 0.0), 380.0) * 1.8 * (1.0 - uHaze);
  float alpha = clamp(0.16 + d * 0.5 + F * 0.6, 0.0, 0.97);
  // 水下的“东西”：一张张泡胀的人脸，只在靠近时才看得清
  if (uHaunt > 0.0 && d > 0.5) {
    vec2 g = p.xz / 3.4 + N.xz * 0.6;
    vec2 id = floor(g), f = fract(g) - 0.5;
    float hsh = hash12(id + 17.0);
    if (hsh > 0.45) {
      vec2 o = (vec2(hash12(id + 3.1), hash12(id + 7.7)) - 0.5) * 0.35;
      float ang = hash12(id + 1.9) * 6.283;
      vec2 cq = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * ((f - o) * 3.4);
      float face = smoothstep(0.62, 0.5, length(cq * vec2(1.0, 0.78)));
      float eyes = smoothstep(0.13, 0.07, length(cq - vec2(0.2, -0.12))) + smoothstep(0.13, 0.07, length(cq - vec2(-0.2, -0.12)));
      float mouth = smoothstep(0.1, 0.05, length((cq - vec2(0.0, 0.25)) * vec2(0.55, 1.0 + 0.4 * sin(t * 2.0 + hsh * 9.0))));
      vec3 fc = mix(vec3(0.62, 0.70, 0.62), vec3(0.05, 0.08, 0.07), clamp(eyes + mouth, 0.0, 1.0));
      float vis = face * uHaunt * smoothstep(20.0, 5.0, dist) * smoothstep(0.5, 2.0, d) * (0.6 - F * 0.5);
      col = mix(col, fc, clamp(vis, 0.0, 0.8));
      alpha = max(alpha, vis * 0.8);
    }
  }
  // 一道道碎浪向岸边推进，在浅水区翻成白沫；水线上是一圈细碎的泡沫
  float ph = p.x * 0.55 + t * 1.5 + vnoise(q * 0.07) * 7.0;
  float crest = pow(max(sin(ph), 0.0), 10.0);
  float brk = crest * smoothstep(2.6, 0.9, d) * smoothstep(0.08, 0.45, d)
            * smoothstep(0.3, 0.6, vnoise(q * vec2(0.8, 0.22) + vec2(t * 0.3, 0.0)));
  float edge = smoothstep(0.1, 0.0, d) * (0.55 + 0.45 * vnoise(q * 3.0 + t));
  // 退浪留下的细碎泡沫纹：两层噪声相减只留下细线
  float lw = abs(vnoise(q * 1.1 + vec2(t * 0.35, 0.0)) - vnoise(q * 1.1 + vec2(3.7, -t * 0.25)));
  float lace = smoothstep(0.05, 0.0, lw) * smoothstep(1.2, 0.1, d) * 0.45;
  float foam = clamp(brk * 1.3 + edge + lace, 0.0, 1.0);
  col = mix(col, vec3(0.97, 0.98, 0.97), foam);
  alpha = max(alpha, foam * 0.95);
  float fd = dist * uFogDen, fog = clamp(1.0 - exp(-fd * fd), 0.0, 1.0);
  return vec4(mix(clamp(col, 0.0, 1.0), beachHorizon(-V), fog), max(alpha, fog));
}

float skyRect(vec2 p, vec4 bounds) {
  vec2 enter = smoothstep(bounds.xy, bounds.xy + 0.07, p);
  vec2 leave = 1.0 - smoothstep(bounds.zw - 0.07, bounds.zw, p);
  return enter.x * enter.y * leave.x * leave.y;
}

// 返回穿过采光口的比例，以及到开口的距离参数
vec2 poolOpening(vec3 p, vec3 ray) {
  vec2 result = vec2(0.0, 1.0);
  if (uPoolSunTop > 0.0 && ray.x > 0.001) {
    float t = (uPoolSun.x - p.x) / ray.x;
    vec3 hit = p + ray * t;
    float edge = skyRect(hit.yz, vec4(uPoolSun.y, uPoolSun.z, uPoolSunTop, uPoolSun.w));
    float front = (uPoolSun.x - 0.6 - p.x) / ray.x;
    edge *= skyRect((p + ray * front).yz,
      vec4(uPoolSun.y, uPoolSun.z, uPoolSunTop, uPoolSun.w));
    if (t > 0.0) result = vec2(edge, t);
  }
  if (uPoolSkyHeights.y > 0.0 && ray.y > 0.001) {
    float top = (uPoolSkyHeights.y - p.y) / ray.y;
    float bottom = (uPoolSkyHeights.x - p.y) / ray.y;
    float edge = skyRect((p + ray * top).xz, uPoolSky) * skyRect((p + ray * bottom).xz, uPoolSky);
    if (top > 0.0 && bottom >= 0.0 && edge > result.x) result = vec2(edge, top);
  }
  return result;
}

void main() {
  bool water = abs(vLayer - uWaterLayer) < 0.5;
  if ((uWaterPass == 1 && !water) || (uWaterPass == 0 && water)) discard;
  if (abs(vLayer - uSkyLayer) < 0.5) {
    // 保留原来的蓝天白云；天空只出现在真正通向室外的采光口。
    vec3 dir = normalize(vPos - uCam);
    vec3 sky = poolSkyColor(dir);
    if (uBeach > 0.5) sky = mix(sky, HAZE_COL, uHaze * mix(1.0, 0.88, smoothstep(0.0, 0.6, dir.y)));
    oCol = vec4(sky, 1.0);
    return;
  }
  if (uBeach > 0.5 && abs(vLayer - uSeaLayer) < 0.5) {
    oCol = seaColor(vPos);
    return;
  }
  vec4 tex = texture(uTex, vec3(vUV, vLayer));
  // 蒸汽的顶点 emit 通道存放的是不透明度；贴花 / 水洼 / 蒸汽用抖动透明
  bool steam = abs(vLayer - uSteamLayer) < 0.5;
  float waterF = pow(1.0 - abs(normalize(uCam - vPos).y), 4.0);
  float alpha = water ? clamp(0.32 + vEmit * 0.09 + waterF * 0.45, 0.35, 0.82) : steam ? tex.a * vEmit : tex.a;
  float th = 0.5;
  if (!water && vLayer > uDitherFrom - 0.5) th = max(hash12(gl_FragCoord.xy + (steam ? fract(uTime * 7.31) * 131.0 : 0.0)), 0.004);
  if (!water && alpha < th) discard;
  float emit = steam || water ? 0.0 : vEmit;
  bool wet = water || abs(vLayer - uWet0) < 0.5 || abs(vLayer - uWet1) < 0.5;
  vec3 alb = tex.rgb * tex.rgb;
  vec3 N = normalize(vNor);
  if (uTouch > 0.5) {
    // 熄灯没有照明：只给伸手可及的表面一点触觉轮廓，远处与自发光都归零
    vec3 hand = uCam - vec3(0.0, 0.35, 0.0);
    float reach = 1.0 - smoothstep(0.3, 1.1, length(vPos - hand));
    float edge = 0.15 + 0.85 * pow(1.0 - abs(dot(N, normalize(uCam - vPos))), 2.0);
    oCol = vec4(vec3(0.065, 0.07, 0.08) * reach * edge, 1.0);
    return;
  }
  // 世界空间的大尺度变化，打破地板/天花板/墙面的纹理重复
  if (N.y > 0.5 && vPos.y < 0.05 && uPool < 0.5 && uBeach < 0.5) {
    float m = vnoise(vPos.xz * 0.31) * 0.65 + vnoise(vPos.xz * 1.13 + 7.0) * 0.35;
    alb *= mix(0.62, 1.12, m);
    if (uJoint > 0.0 && !wet) {
      vec2 q = abs(fract(vPos.xz / uJoint + 0.5) - 0.5) * uJoint;
      alb *= mix(0.4, 1.0, smoothstep(0.006, 0.02, min(q.x, q.y)));
    }
  } else if (N.y < -0.5 && vPos.y > uWallH - 0.05 && emit == 0.0) {
    alb *= mix(0.8, 1.05, vnoise(vPos.xz * 0.45 + 3.0));
  } else if (abs(N.y) < 0.5 && emit == 0.0 && !steam && uPool < 0.5) {
    alb *= mix(0.82, 1.08, vnoise(vec2(vPos.x + vPos.z, vPos.y * 0.6) * 0.37 + 11.0));
  }
  float sandWet = 0.0;
  if (uBeach > 0.5 && abs(vLayer - uSandLayer) < 0.5) {
    // 大尺度的明暗变化；浪花冲刷过的地方颜色更深、发亮；水下的沙带一点青色和焦散光纹
    alb *= mix(0.82, 1.08, vnoise(vPos.xz * 0.21) * 0.65 + vnoise(vPos.xz * 0.9 + 7.0) * 0.35);
    float sea = bSea(vPos.z);
    sandWet = smoothstep(0.4, 0.0, vPos.y - bSeaTop(vPos.z));
    float under = smoothstep(0.0, 0.2, sea - vPos.y);
    alb *= mix(1.0, 0.52, sandWet);
    float cw = abs(vnoise(vPos.xz * 1.8 + vec2(uTime * 0.5, uTime * 0.3)) - vnoise(vPos.xz * 1.8 + vec2(5.1 - uTime * 0.35, 2.3 + uTime * 0.2)));
    float caustic = smoothstep(0.08, 0.0, cw);
    alb = mix(alb, alb * vec3(0.6, 0.82, 0.8) * (1.0 + caustic * 0.9), under);
  }
  vec3 V = normalize(uCam - vPos);
  if (wet) {
    // 水面的细微波纹
    vec2 p = vPos.xz * 2.5;
    float t = uTime * 0.5;
    N = normalize(vec3((vnoise(p + vec2(t, 0.0)) - 0.5) * 0.07, 1.0, (vnoise(p.yx + vec2(5.0, -t)) - 0.5) * 0.07));
  }
  if (water) {
    // 从水深重建池底瓷砖的折射位置，深处逐渐吸收红光
    vec2 refr = vPos.xz / 2.0 + (N.xz * 0.7 - V.xz * 0.06) * vEmit;
    vec3 tile = texture(uTex, vec3(refr, uTileLayer)).rgb;
    vec3 trans = exp(-vec3(0.85, 0.18, 0.10) * vEmit);
    alb = tile * tile * trans * vec3(0.55, 0.91, 0.92) + vec3(0.012, 0.16, 0.19) * (1.0 - trans);
  }
  if (uPool > 0.5 && (water || vPos.y < 0.7)) {
    float ca = sin(vPos.x * 5.7 + sin(vPos.z * 3.1 + uTime))
             + sin(vPos.z * 6.1 + sin(vPos.x * 2.7 - uTime * 0.8));
    alb *= 0.92 + 0.23 * smoothstep(0.7, 1.9, ca);
  }
  vec3 lit = uAmb;
  vec3 spec = vec3(0.0);
  float invR = 1.0 / uLRad;
  for (int i = 0; i < ${MAXL}; i++) {
    if (i >= uLN) break;
    vec3 L = uLP[i].xyz - vPos;
    float d2 = dot(L, L);
    float x2 = d2 * invR * invR;
    float win = clamp(1.0 - x2 * x2, 0.0, 1.0);
    float att = win * win / (1.0 + d2 * 0.35);
    vec3 Ld = L * inversesqrt(d2);
    float ndl = dot(N, Ld);
    float shadow = uPool > 0.5 ? poolVisibility(vPos, L) : 1.0;
    lit += uLC[i] * (uLP[i].w * att * (max(ndl, 0.0) * 0.78 * shadow + mix(0.22, 0.12, uPool)));
    if (wet) {
      float w2 = clamp(1.0 - x2 * 0.25, 0.0, 1.0);
      float sp = pow(max(dot(N, normalize(Ld + V)), 0.0), 260.0);
      spec += uLC[i] * (uLP[i].w * sp * w2 * shadow * mix(9.0, 1.8, uPool) / (1.0 + d2 * 0.05));
    }
  }
  // 日光穿过侧窗或天井，方向与窗外太阳一致
  if (uPool > 0.5 && all(equal(floor(vPos.xz / 32.0), uPoolRoom))) {
    vec3 sunDir = vec3(0.8, 0.65, 0.22);
    vec2 opening = poolOpening(vPos, sunDir);
    if (opening.x > 0.0) lit += vec3(1.0, 0.96, 0.82) * 0.75 * opening.x * max(dot(N, normalize(sunDir)), 0.0) * poolVisibility(vPos, sunDir * opening.y);
  }
  if (uBeach > 0.5) lit += vec3(1.25, 1.16, 0.98) * max(dot(N, BEACH_SUN), 0.0) * (1.0 - uHaze * 0.6);
  vec3 litP = lit;
  if (uFl > 0.001) {
    vec3 Lf = uFlPos - vPos;
    float df = length(Lf);
    vec3 ld = Lf / df;
    float cs = dot(-ld, uFlDir);
    float spot = smoothstep(0.80, 0.94, cs);
    float hot = smoothstep(0.94, 0.992, cs);
    float ring = smoothstep(0.90, 0.93, cs) * (1.0 - smoothstep(0.93, 0.96, cs));
    float ndl = max(dot(N, ld), 0.0);
    lit += uFlCol * (uFl * (spot * 0.6 + hot * 0.5 + ring * 0.2) * (ndl * 0.85 + 0.15) / (1.0 + df * df * 0.12));
    if (wet) spec += uFlCol * (uFl * spot * pow(max(dot(N, normalize(ld + V)), 0.0), 120.0) * 4.0 / (1.0 + df * df * 0.12));
  }
  float ao = 1.0;
  if (abs(N.y) < 0.5 && !steam) {
    ao = mix(0.45, 1.0, smoothstep(0.0, 0.55, vPos.y)) * mix(0.72, 1.0, smoothstep(0.0, 0.35, uWallH - vPos.y));
  }
  vec3 ec = emit < 0.0 ? uPanelTint : vec3(1.0);
  vec3 col = alb * lit * ao + alb * abs(emit) * ec;
  if (sandWet > 0.0) col += vec3(1.0, 0.95, 0.85) * pow(max(dot(reflect(-V, N), BEACH_SUN), 0.0), 24.0) * sandWet * 0.55;
  if (uPool > 0.5 && !water && vPos.y < uWaterHeight) {
    vec3 tr = exp(-vec3(0.55, 0.16, 0.08) * (uWaterHeight - vPos.y));
    col = col * tr + vec3(0.008, 0.025, 0.03) * (1.0 - tr);
  }
  if (wet) {
    float F = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    col += spec * mix(0.25 + 2.5 * F, 0.18 + 0.55 * F, uPool) + uFogCol * F * 0.5;
    if (water && all(equal(floor(vPos.xz / 32.0), uPoolRoom))) {
      vec3 reflected = reflect(-V, N);
      vec2 opening = poolOpening(vPos, reflected);
      if (opening.x > 0.0) {
        vec3 sky = poolSkyColor(reflected);
        col += sky * sky * opening.x * (0.08 + 0.3 * F) * poolVisibility(vPos, reflected * opening.y);
      }
    }
  }
  float dist = length(vPos - uCam);
  // 贴地低雾：沿视线对 exp(-k·y) 的密度做解析积分
  if (uMist.x > 0.0) {
    float k = uMist.y, h0 = max(uCam.y, 0.0), h1 = max(vPos.y, 0.0), dh = h1 - h0;
    float e0 = exp(-k * h0), e1 = exp(-k * h1);
    float integ = abs(dh) > 0.01 ? (e0 - e1) / (k * dh) : e0;
    float n = vnoise(vPos.xz * 0.28 + vec2(uTime * 0.05, uTime * 0.02)) * 0.6
            + vnoise(vPos.xz * 0.9 + vec2(-uTime * 0.04, uTime * 0.06)) * 0.4;
    float fm = 1.0 - exp(-uMist.x * dist * integ * mix(0.2, 1.6, n));
    vec3 mc = uMistCol * (litP * 0.45 + (lit - litP) * 0.2);
    col = mix(col, mc, clamp(fm, 0.0, 0.9));
  }
  float fd = dist * uFogDen;
  float f = 1.0 - exp(-fd * fd);
  if (uBeach > 0.5) {
    // 室外的雾直接混向地平线的天色
    col = pow(aces(col * uExposure), vec3(1.0 / 2.2));
    oCol = vec4(mix(col, beachHorizon(-V), clamp(f, 0.0, 1.0)), 1.0);
    return;
  }
  col = mix(col, uFogCol, clamp(f, 0.0, 1.0));
  col = aces(col * uExposure);
  oCol = vec4(pow(col, vec3(1.0 / 2.2)), water ? alpha : 1.0);
}`;

const FS_VS = `#version 300 es
out vec2 vUV;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uThresh;
out vec4 oCol;
void main() {
  vec3 s = texture(uTex, vUV + uTexel * vec2(-1.0, -1.0)).rgb;
  s += texture(uTex, vUV + uTexel * vec2(1.0, -1.0)).rgb;
  s += texture(uTex, vUV + uTexel * vec2(-1.0, 1.0)).rgb;
  s += texture(uTex, vUV + uTexel * vec2(1.0, 1.0)).rgb;
  s *= 0.25;
  float l = max(s.r, max(s.g, s.b));
  oCol = vec4(s * smoothstep(uThresh, 1.0, l), 1.0);
}`;

const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uDir;
out vec4 oCol;
void main() {
  vec3 c = texture(uTex, vUV).rgb * 0.227027;
  c += (texture(uTex, vUV + uDir * 1.384615).rgb + texture(uTex, vUV - uDir * 1.384615).rgb) * 0.316216;
  c += (texture(uTex, vUV + uDir * 3.230769).rgb + texture(uTex, vUV - uDir * 3.230769).rgb) * 0.070270;
  oCol = vec4(c, 1.0);
}`;

const POST_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uTime;
uniform float uIns;
uniform float uHurt;
uniform float uFade;
uniform float uBloomStr;
uniform float uGlitch;
uniform vec2 uRes;
uniform vec3 uGrade;
uniform float uHeat;
uniform float uDark;
uniform float uUnderwater;
uniform float uInvert;
uniform float uClean;
out vec4 oCol;
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
void main() {
  vec2 c = vUV - 0.5;
  float r2 = dot(c, c);
  vec2 uv = 0.5 + c * (0.955 + 0.09 * r2);
  // 高温造成的空气扭曲
  uv += vec2(sin(uv.y * 38.0 + uTime * 2.7), cos(uv.x * 27.0 + uTime * 2.1)) * 0.0012 * uHeat * (0.6 + 0.4 * sin(uTime * 0.7 + uv.y * 5.0));
  uv += vec2(sin(uv.y * 18.0 + uTime * 1.8), cos(uv.x * 15.0 - uTime * 1.4)) * 0.006 * uUnderwater;
  float w = uIns * uIns;
  uv += vec2(sin(uv.y * 17.0 + uTime * 2.1), cos(uv.x * 13.0 + uTime * 1.7)) * 0.004 * w;
  float g = uGlitch;
  float band = step(0.985 - g * 0.35, hash(vec2(floor(uv.y * 36.0), floor(uTime * 14.0))));
  uv.x += band * (hash(vec2(uTime, floor(uv.y * 36.0))) - 0.5) * (0.015 + g * 0.09);
  uv.x += (hash(vec2(floor(uv.y * uRes.y * 0.5), floor(uTime * 60.0))) - 0.5) * 0.0009 * (1.0 + g * 8.0);
  float ca = 0.0014 + w * 0.008 + uHurt * 0.014 + g * 0.012;
  vec3 col;
  col.r = texture(uScene, uv + c * ca).r;
  col.g = texture(uScene, uv).g;
  col.b = texture(uScene, uv - c * ca).b;
  col += texture(uBloom, uv).rgb * uBloomStr;
  col *= uGrade;
  // 底片效果：去色后黑白反相，越亮越黑、越暗越亮（噪点、淡出仍在反相之后叠加）
  if (uInvert > 0.0) {
    float l0 = clamp(dot(col, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
    col = mix(col, vec3(1.0 - smoothstep(0.0, 0.85, l0)), uInvert);
  }
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(lum), (0.1 - uClean * 0.08) + w * 0.45);
  col = mix(col, col * vec3(1.25, 0.55, 0.55), w * 0.35 * (0.5 + 0.5 * sin(uTime * 1.3)) + uHurt * 0.5);
  col *= 0.95 + 0.05 * sin(vUV.y * uRes.y * 3.14159);
  float n = hash(vUV * uRes + fract(uTime * 37.0) * 100.0);
  col += (n - 0.5) * (0.075 - uClean * 0.05 + w * 0.12 + g * 0.35) * mix(1.0, 0.06, uDark);
  col = mix(col, col * vec3(0.3, 0.8, 0.88) + vec3(0.005, 0.035, 0.045), uUnderwater);
  float vig = smoothstep(0.86 - w * 0.3, 0.18, length(c) * (1.0 + w * 0.35));
  // 反相时暗角也要反过来：边缘趋向白色而不是黑色
  float vm = mix(0.22 + uClean * 0.5, 1.0, vig);
  col = mix(col * vm, 1.0 - (1.0 - col) * vm, uInvert);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);
  col *= 1.0 - uFade;
  oCol = vec4(col, 1.0);
}`;

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      antialias: false, depth: false, stencil: false, alpha: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('你的浏览器不支持 WebGL2');
    this.gl = gl;
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    this.pWorld = this.program(WORLD_VS, WORLD_FS);
    this.pBright = this.program(FS_VS, BRIGHT_FS);
    this.pBlur = this.program(FS_VS, BLUR_FS);
    this.pPost = this.program(FS_VS, POST_FS);
    this.emptyVao = gl.createVertexArray();
    this.meshes = new Map();
    this.dyn = this.createMesh(null, true);
    this.beachMesh = this.createMesh(null, true);
    this.beachMb = new MeshBuilder(64);
    this.scale = 0.75;
    this.bloom = true;
    this.dprLimit = 3;
    this.maxPixels = 2560 * 1440;
    this.maxDimension = Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), gl.getParameter(gl.MAX_TEXTURE_SIZE));
    this.lp = new Float32Array(MAXL * 4);
    this.lc = new Float32Array(MAXL * 3);
    this.poolColumns = new Float32Array(MAX_POOL_COLUMNS * 4);
    this.sw = 1; this.sh = 1;
    this.fb = {};
  }

  program(vs, fs) {
    const gl = this.gl;
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        throw new Error('着色器编译失败：\n' + log);
      }
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('着色器链接失败：\n' + gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let k = 0; k < n; k++) {
      const info = gl.getActiveUniform(p, k);
      const name = info.name.replace(/\[0\]$/, '');
      u[name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }

  initTextures(layers) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    const levels = Math.log2(TS) + 1;
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.RGBA8, TS, TS, layers.length);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    layers.forEach((cv, i) => {
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, TS, TS, 1, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    });
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
    if (this.aniso) {
      const max = gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
      gl.texParameterf(gl.TEXTURE_2D_ARRAY, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max));
    }
    this.tex = tex;
  }

  createMesh(data, dynamic) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    if (data) gl.bufferData(gl.ARRAY_BUFFER, data, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    const st = VSTRIDE * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, st, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, st, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, st, 36);
    gl.bindVertexArray(null);
    return { vao, vbo, count: data ? data.length / VSTRIDE : 0, cap: data ? data.length : 0 };
  }

  setDynamic(data) {
    const gl = this.gl, m = this.dyn;
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo);
    if (data.length > m.cap) {
      m.cap = Math.max(data.length, m.cap * 2);
      gl.bufferData(gl.ARRAY_BUFFER, m.cap * 4, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    m.count = data.length / VSTRIDE;
  }

  addChunkMesh(key, data, cx, cz) {
    const m = data ? this.createMesh(data, false) : { vao: null, vbo: null, count: 0 };
    m.cx = cx; m.cz = cz;
    this.meshes.set(key, m);
  }

  deleteMesh(key) {
    const m = this.meshes.get(key);
    if (!m) return;
    if (m.vao) { this.gl.deleteVertexArray(m.vao); this.gl.deleteBuffer(m.vbo); }
    this.meshes.delete(key);
  }

  clearMeshes() {
    for (const k of [...this.meshes.keys()]) this.deleteMesh(k);
  }

  makeTarget(w, h, depth) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    let rb = null;
    if (depth) {
      rb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, rb, w, h };
  }

  freeTarget(t) {
    if (!t) return;
    const gl = this.gl;
    gl.deleteTexture(t.tex);
    gl.deleteFramebuffer(t.fb);
    if (t.rb) gl.deleteRenderbuffer(t.rb);
  }

  resize(width, height) {
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprLimit);
    let w = width === undefined ? (this.canvas.clientWidth || window.innerWidth) * dpr : width;
    let h = height === undefined ? (this.canvas.clientHeight || window.innerHeight) * dpr : height;
    // CSS pixels determine controls; the framebuffer has a separate budget so
    // high-density phones do not allocate native-resolution postprocessing targets by default.
    const budget = width === undefined && height === undefined ? Math.sqrt(this.maxPixels / Math.max(1, w * h)) : 1;
    const factor = Math.min(1, budget, this.maxDimension / Math.max(w, h));
    w = Math.max(1, Math.floor(w * factor));
    h = Math.max(1, Math.floor(h * factor));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.cw = w; this.ch = h;
    const sw = Math.max(1, Math.floor(w * this.scale)), sh = Math.max(1, Math.floor(h * this.scale));
    if (sw === this.sw && sh === this.sh && this.fb.scene) return;
    this.sw = sw; this.sh = sh;
    for (const k of Object.keys(this.fb)) this.freeTarget(this.fb[k]);
    this.fb.scene = this.makeTarget(sw, sh, true);
    const bw = Math.max(1, Math.floor(sw / 4)), bh = Math.max(1, Math.floor(sh / 4));
    this.fb.a = this.makeTarget(bw, bh, false);
    this.fb.b = this.makeTarget(bw, bh, false);
  }

  drawWorld(s) {
    const gl = this.gl;
    const t = this.fb.scene;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.viewport(0, 0, t.w, t.h);
    gl.clearColor(s.clear[0], s.clear[1], s.clear[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    const { p, u } = this.pWorld;
    gl.useProgram(p);
    gl.uniformMatrix4fv(u.uVP, false, s.vp);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    gl.uniform1i(u.uTex, 0);
    gl.uniform4fv(u.uLP, this.lp);
    gl.uniform3fv(u.uLC, this.lc);
    gl.uniform1i(u.uLN, s.lightCount);
    gl.uniform1f(u.uLRad, s.lightRadius);
    gl.uniform3fv(u.uAmb, s.ambient);
    gl.uniform3fv(u.uCam, s.cam);
    gl.uniform3fv(u.uFogCol, s.fogCol);
    gl.uniform1f(u.uFogDen, s.fogDen);
    gl.uniform3fv(u.uFlPos, s.flPos);
    gl.uniform3fv(u.uFlDir, s.flDir);
    gl.uniform3fv(u.uFlCol, s.flCol);
    gl.uniform1f(u.uFl, s.fl);
    gl.uniform1f(u.uWallH, s.wallH);
    gl.uniform1f(u.uExposure, s.exposure);
    gl.uniform3fv(u.uPanelTint, s.panelTint);
    gl.uniform1f(u.uTime, s.time);
    gl.uniform3fv(u.uMist, s.mist);
    gl.uniform3fv(u.uMistCol, s.mistCol);
    gl.uniform1f(u.uJoint, s.joint);
    gl.uniform1f(u.uDitherFrom, DITHER_FROM);
    gl.uniform1f(u.uSteamLayer, TEX.STEAM);
    gl.uniform1f(u.uWet0, TEX.PUDDLE);
    gl.uniform1f(u.uWet1, TEX.OOZE);
    gl.uniform1f(u.uWaterLayer, TEX.WATER);
    gl.uniform1f(u.uTileLayer, TEX.L37_TILE);
    gl.uniform1f(u.uSkyLayer, TEX.POOL_SKY);
    gl.uniform1f(u.uPool, s.pool || 0);
    gl.uniform1f(u.uWaterHeight, s.waterHeight || 0);
    gl.uniform1i(u.uWaterPass, 0);
    gl.uniform4fv(u.uPoolColumns, this.poolColumns);
    gl.uniform1i(u.uPoolColumnCount, s.poolColumnCount || 0);
    gl.uniform4fv(u.uPoolSun, s.poolSun || [0, 0, 0, 1]);
    gl.uniform1f(u.uPoolSunTop, s.poolSunTop || 0);
    gl.uniform2fv(u.uPoolRoom, s.poolRoom || [0, 0]);
    gl.uniform4fv(u.uPoolSky, s.poolSky || [0, 0, 1, 1]);
    gl.uniform2fv(u.uPoolSkyHeights, s.poolSkyHeights || [0, 0]);
    gl.uniform1f(u.uTouch, s.touch || 0);
    const bc = s.beach;
    gl.uniform1f(u.uBeach, bc ? 1 : 0);
    gl.uniform1f(u.uSeaLayer, TEX.SEA);
    if (bc) {
      gl.uniform1f(u.uSandLayer, TEX.SAND);
      gl.uniform4f(u.uTide, bc.rise, bc.front, BEACH.FLOOD, BEACH.UNDER);
      gl.uniform1f(u.uHaze, bc.haze);
      gl.uniform1f(u.uHaunt, bc.haunt);
      // 天空盒跟着镜头走，不写深度，最先画；海面是一整块大平面，岸线以西的部分在着色器里裁掉
      const mb = this.beachMb, cx = s.cam[0], cy = s.cam[1], cz = s.cam[2], R = 60, sk = TEX.POOL_SKY, uv = [0, 0, 0, 0, 0, 0, 0, 0];
      mb.reset();
      const v = (x, y, z) => [cx + x * R, cy + y * R, cz + z * R];
      mb.quad(v(-1, -1, -1), v(1, -1, -1), v(1, 1, -1), v(-1, 1, -1), [0, 0, 1], uv, sk, 0);
      mb.quad(v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1), [0, 0, -1], uv, sk, 0);
      mb.quad(v(-1, -1, -1), v(-1, -1, 1), v(-1, 1, 1), v(-1, 1, -1), [1, 0, 0], uv, sk, 0);
      mb.quad(v(1, -1, -1), v(1, -1, 1), v(1, 1, 1), v(1, 1, -1), [-1, 0, 0], uv, sk, 0);
      mb.quad(v(-1, 1, -1), v(1, 1, -1), v(1, 1, 1), v(-1, 1, 1), [0, -1, 0], uv, sk, 0);
      mb.quad(v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1), v(-1, -1, 1), [0, 1, 0], uv, sk, 0);
      const skyN = mb.n;
      // 海面沿 z 分条：每条的高度随涨潮前锋和浪花相位变化
      const x0 = Math.max(0, cx - 150), x1 = cx + 150, zs = Math.floor((cz - 150) / 2) * 2;
      for (let z = zs; z < cz + 150; z += 2) {
        const ya = beachSea(z, bc, s.time), yb = beachSea(z + 2, bc, s.time);
        mb.quad([x0, ya, z], [x1, ya, z], [x1, yb, z + 2], [x0, yb, z + 2], [0, 1, 0], uv, TEX.SEA, 0);
      }
      const m = this.beachMesh, data = mb.result();
      gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo);
      if (data.length > m.cap) { m.cap = data.length; gl.bufferData(gl.ARRAY_BUFFER, m.cap * 4, gl.DYNAMIC_DRAW); }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
      gl.bindVertexArray(m.vao);
      gl.depthMask(false);
      gl.drawArrays(gl.TRIANGLES, 0, skyN);
      gl.depthMask(true);
      this.seaRange = [skyN, mb.n - skyN];
    }

    const cs = CHUNK * CELL;
    const fx = s.fwd[0], fz = s.fwd[2];
    const visible = [];
    for (const m of this.meshes.values()) {
      if (!m.count) continue;
      const mx = (m.cx + 0.5) * cs - s.cam[0], mz = (m.cz + 0.5) * cs - s.cam[2];
      if (mx * fx + mz * fz < -cs * 0.75) continue; // 在身后的区块
      if (s.pool) visible.push(m);
      gl.bindVertexArray(m.vao);
      gl.drawArrays(gl.TRIANGLES, 0, m.count);
    }
    if (this.dyn.count) {
      gl.bindVertexArray(this.dyn.vao);
      gl.drawArrays(gl.TRIANGLES, 0, this.dyn.count);
    }
    if (bc) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.bindVertexArray(this.beachMesh.vao);
      gl.drawArrays(gl.TRIANGLES, this.seaRange[0], this.seaRange[1]);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    // 水面最后绘制并透明混合，池底、台阶和水下柱脚都能透过水面看见
    if (s.pool) {
      gl.uniform1i(u.uWaterPass, 1);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      for (const m of visible) {
        gl.bindVertexArray(m.vao);
        gl.drawArrays(gl.TRIANGLES, 0, m.count);
      }
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.uniform1i(u.uWaterPass, 0);
    }
    gl.bindVertexArray(null);
  }

  fullscreen(target) {
    const gl = this.gl;
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
      gl.viewport(0, 0, target.w, target.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.cw, this.ch);
    }
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  post(s) {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    const { scene, a, b } = this.fb;
    if (this.bloom) {
      gl.useProgram(this.pBright.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, scene.tex);
      gl.uniform1i(this.pBright.u.uTex, 0);
      gl.uniform2f(this.pBright.u.uTexel, 1 / scene.w, 1 / scene.h);
      gl.uniform1f(this.pBright.u.uThresh, 0.72);
      this.fullscreen(a);
      gl.useProgram(this.pBlur.p);
      gl.uniform1i(this.pBlur.u.uTex, 0);
      for (let k = 0; k < 2; k++) {
        gl.bindTexture(gl.TEXTURE_2D, a.tex);
        gl.uniform2f(this.pBlur.u.uDir, (1 + k) / a.w, 0);
        this.fullscreen(b);
        gl.bindTexture(gl.TEXTURE_2D, b.tex);
        gl.uniform2f(this.pBlur.u.uDir, 0, (1 + k) / a.h);
        this.fullscreen(a);
      }
    }
    const { p, u } = this.pPost;
    gl.useProgram(p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, scene.tex);
    gl.uniform1i(u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, a.tex);
    gl.uniform1i(u.uBloom, 1);
    gl.uniform1f(u.uTime, s.time);
    gl.uniform1f(u.uIns, s.ins);
    gl.uniform1f(u.uHurt, s.hurt);
    gl.uniform1f(u.uFade, s.fade);
    gl.uniform1f(u.uBloomStr, this.bloom ? s.bloom : 0);
    gl.uniform1f(u.uGlitch, s.glitch);
    gl.uniform2f(u.uRes, this.cw, this.ch);
    gl.uniform3fv(u.uGrade, s.grade);
    gl.uniform1f(u.uHeat, s.heat || 0);
    gl.uniform1f(u.uInvert, s.invert || 0);
    gl.uniform1f(u.uClean, s.clean || 0);
    gl.uniform1f(u.uDark, s.dark || 0);
    gl.uniform1f(u.uUnderwater, s.underwater || 0);
    this.fullscreen(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
}

// 与着色器一致的色调映射（用于清屏色与雾色匹配）
function tonemapJS(c, exposure) {
  return c.map((x) => {
    x *= exposure;
    const y = Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
    return Math.pow(y, 1 / 2.2);
  });
}
