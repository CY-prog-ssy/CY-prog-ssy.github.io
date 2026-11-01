/* =========================================================================
   dust.js
   空气尘埃场 / 太阳光柱

   依赖：utils.js / renderer.js / lighting.js
   暴露：dustField, sunShafts, shaftMat, shaftSpots, shaftAxis,
         updateSunShafts
   ========================================================================= */
"use strict";

/* --------------------------------------------------------------------------
   空气尘埃

   一组在相机周围 26m 盒子里飘浮的微粒，相机移动时它们按 modulo 环绕。
   看向太阳时亮度骤增 —— 这是让空气有“介质感”而不是空白空间的关键。
   -------------------------------------------------------------------------- */
const dustField = (() => {
  const N = 2600, EXT = 26;
  const pos  = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++){
    pos[i*3    ] = rand(-EXT, EXT);
    pos[i*3 + 1] = rand(-1.0, 11.0);
    pos[i*3 + 2] = rand(-EXT, EXT);
    seed[i]      = Math.random() * 100;
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed',    new THREE.BufferAttribute(seed, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      time:    { value: 0 },
      camPos:  { value: new THREE.Vector3() },
      sunDir:  { value: SUN_DIR.clone() },
      ext:     { value: EXT },
      pxScale: { value: innerHeight * 0.5 }
    },
    vertexShader: `
      attribute float aSeed;
      uniform float time, ext, pxScale;
      uniform vec3 camPos, sunDir;
      varying float vA;
      void main(){
        vec3 p = position;
        /* 缓慢对流 */
        p.x += sin(time * 0.14 + aSeed * 2.1) * 1.5;
        p.y += sin(time * 0.09 + aSeed * 3.7) * 0.9 + mod(time * 0.10 + aSeed, 2.0) - 1.0;
        p.z += cos(time * 0.12 + aSeed * 1.7) * 1.5;
        /* 环绕进一个跟随相机的盒子 */
        vec3 d = p - camPos;
        d = mod(d + ext, 2.0 * ext) - ext;
        p = camPos + d;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float dist = -mv.z;
        /* 近场和盒子边缘淡出，避免突然弹出 */
        float edge = 1.0 - smoothstep(ext * 0.62, ext * 0.98, length(d));
        float near = smoothstep(0.6, 3.0, dist);
        /* 逆光时尘埃被点亮 */
        vec3 vd = normalize(p - camPos);
        float halo = pow(max(dot(vd, normalize(sunDir)), 0.0), 3.0);
        vA = edge * near * (0.05 + halo * 0.55) * (0.6 + 0.4 * sin(aSeed * 9.1 + time * 1.3));
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(pxScale * 0.016 / max(dist, 0.4), 1.0, 4.0);
      }`,
    fragmentShader: `
      varying float vA;
      void main(){
        vec2 d = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.06, length(d)) * vA;
        if (a < 0.002) discard;
        gl_FragColor = vec4(1.0, 0.94, 0.84, a);
      }`
  });

  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  scene.add(pts);

  return mat.uniforms;
})();

/* --------------------------------------------------------------------------
   太阳光柱

   沿太阳向量摆放的一叠加性面片，塞在集装箱留出的缝隙里。
   真正的体积光超出预算；朝向正确的软边四边形从场地内看过去读感一样。
   -------------------------------------------------------------------------- */
var sunShafts = [];          // 由 environment.js 通过 var 共享
var shaftMat = null;
var shaftSpots = null;
var shaftAxis = new THREE.Vector3();
let shaftDir = null;

{
  const shaftGeo = new THREE.PlaneGeometry(1, 1, 1, 6);

  shaftMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: { opacity: { value: 1 } },
    vertexShader: `
      varying vec2 vUv; varying float vD;
      void main(){
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vD = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec2 vUv; varying float vD; uniform float opacity;
      void main(){
        float across = smoothstep(0.0, 0.28, vUv.x) * smoothstep(1.0, 0.72, vUv.x);
        float along  = smoothstep(0.0, 0.30, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
        float near   = smoothstep(1.5, 7.0, vD) * (1.0 - smoothstep(28.0, 60.0, vD));
        gl_FragColor = vec4(1.0, 0.86, 0.66, across * along * near * 0.030 * opacity);
      }`
  });

  const dir = SUN_DIR.clone().negate();     // 光的传播方向
  shaftDir = dir;
  shaftSpots = [
    [ 8.6, -14.2, 5.2, 11], [ 8.6,  4.8, 5.2, 11], [ 16.0, -4.6, 4.2, 10],
    [-13.6, 10.6, 6.0, 12], [ 0.6, -6.0, 6.6, 12], [ 22.4, 12.0, 5.0, 10],
    [-19.0, -8.0, 5.6, 11], [ 4.0, 20.0, 5.4, 11]
  ];

  for (const [sx, sz, w, len] of shaftSpots){
    const m = new THREE.Mesh(shaftGeo, shaftMat);
    const top = new THREE.Vector3(sx, 0, sz).addScaledVector(dir, -len * 0.5);
    m.position.copy(top).addScaledVector(dir, len * 0.5);
    m.scale.set(w, len, 1);
    m.renderOrder = 4;
    m.frustumCulled = false;
    scene.add(m);
    sunShafts.push(m);
  }

  shaftAxis.copy(dir);
}

/* --------------------------------------------------------------------------
   保持光柱面向相机

   一个固定面片一旦被从侧面看到，会立刻变成一条亮线 —— 那是反体积的。
   让每个柱体绕光线旋转以保持正面朝向相机，代价是每帧 8 个四元数，
   但总能显示柔和的横截面。 */

const _sfT = new THREE.Vector3();
const _sfX = new THREE.Vector3();
const _sfM = new THREE.Matrix4();

function updateSunShafts(){
  if (!sunShafts.length) return;
  for (const m of sunShafts){
    _sfT.copy(camera.position).sub(m.position);
    _sfT.addScaledVector(shaftAxis, -_sfT.dot(shaftAxis));
    if (_sfT.lengthSq() < 1e-6) continue;
    _sfT.normalize();
    _sfX.crossVectors(shaftAxis, _sfT).normalize();
    _sfM.makeBasis(_sfX, shaftAxis, _sfT);
    m.quaternion.setFromRotationMatrix(_sfM);
  }
}