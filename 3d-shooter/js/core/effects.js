/* =========================================================================
   effects.js
   ========================================================================= */
"use strict";

const _sfxOK = () => typeof SFX !== 'undefined' && SFX;

function makeParticleSystem(count, additive){
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count*3);
  const col = new Float32Array(count*3);
  const siz = new Float32Array(count);
  const alp = new Float32Array(count);
  const posAttr = new THREE.BufferAttribute(pos, 3);
  const colAttr = new THREE.BufferAttribute(col, 3);
  const sizAttr = new THREE.BufferAttribute(siz, 1);
  const alpAttr = new THREE.BufferAttribute(alp, 1);
  posAttr.usage = THREE.DynamicDrawUsage;
  colAttr.usage = THREE.DynamicDrawUsage;
  sizAttr.usage = THREE.DynamicDrawUsage;
  alpAttr.usage = THREE.DynamicDrawUsage;
  geo.setAttribute('position', posAttr);
  geo.setAttribute('pcolor',   colAttr);
  geo.setAttribute('psize',    sizAttr);
  geo.setAttribute('palpha',   alpAttr);

  const mat = new THREE.ShaderMaterial({
    uniforms: { hscale: { value: innerHeight * DPR * 0.5 } },
    vertexShader: `
      attribute vec3 pcolor; attribute float psize; attribute float palpha;
      uniform float hscale;
      varying vec3 vC; varying float vA;
      void main(){
        vC = pcolor; vA = palpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(1.0, psize * hscale / max(0.001, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vC; varying float vA;
      void main(){
        if (vA <= 0.001) discard;
        vec2 d = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.08, length(d));
        gl_FragColor = vec4(vC, a * vA);
      }`,
    transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
  });

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);

  const data = new Array(count);
  for (let i = 0; i < count; i++)
    data[i] = { life: 0, max: 1, vx: 0, vy: 0, vz: 0, drag: 2, grav: -9, size: .1, grow: 0, fade: 1 };

  return { geo, pts, data, count, head: 0, pos, col, siz, alp,
           posAttr, colAttr, sizAttr, alpAttr };
}

const PS_SPARK  = makeParticleSystem(360, true);
const PS_SOFT   = makeParticleSystem(360, false);
const PS_SPLASH = makeParticleSystem(200, false);

var FX_DENSITY = 1.0;

function spawnParticle(sys, x, y, z, vx, vy, vz, o){
  if (FX_DENSITY < 1 && Math.random() > FX_DENSITY) return;
  const i = sys.head;
  sys.head = (sys.head + 1) % sys.count;

  sys.pos[i*3]     = x;
  sys.pos[i*3 + 1] = y;
  sys.pos[i*3 + 2] = z;

  const c = o.color;
  sys.col[i*3]     = c[0];
  sys.col[i*3 + 1] = c[1];
  sys.col[i*3 + 2] = c[2];

  sys.siz[i] = o.size;
  sys.alp[i] = o.alpha !== undefined ? o.alpha : 1;

  const d = sys.data[i];
  d.life = o.life;
  d.max  = o.life;
  d.vx = vx; d.vy = vy; d.vz = vz;
  d.drag = o.drag !== undefined ? o.drag : 2.4;
  d.grav = o.grav !== undefined ? o.grav : -9.0;
  d.size = o.size;
  d.grow = o.grow || 0;
  d.fade = o.alpha !== undefined ? o.alpha : 1;
}

function updateParticles(sys, dt){
  const { pos, siz, alp, data, count, posAttr, colAttr, sizAttr, alpAttr } = sys;
  let any = false;

  for (let i = 0; i < count; i++){
    const d = data[i];
if (d.life <= 0){ if (alp[i] !== 0){ alp[i] = 0; any = true; } continue; }

// ★ 开启优化时：超过 35 米的粒子不再计算物理轨迹，直接隐藏，省下大量运算
if (typeof SET !== 'undefined' && SET.extremeOptimize) {
  const dx = pos[i*3] - camera.position.x;
  const dz = pos[i*3+2] - camera.position.z;
  if (dx*dx + dz*dz > 1225) { // 35^2
    alp[i] = 0; 
    d.life = 0;
    any = true; 
    continue;
  }
}

d.life -= dt;
if (d.life <= 0){ alp[i] = 0; any = true; continue; }
    const k = Math.exp(-d.drag * dt);
    d.vx *= k; d.vz *= k;
    d.vy = d.vy * k + d.grav * dt;

    pos[i*3]     += d.vx * dt;
    pos[i*3 + 1] += d.vy * dt;
    pos[i*3 + 2] += d.vz * dt;

    if (pos[i*3 + 1] < 0.02){
      pos[i*3 + 1] = 0.02;
      d.vy *= -0.28; d.vx *= 0.6; d.vz *= 0.6;
    }

    const t = d.life / d.max;
    alp[i] = d.fade * (t > 0.7 ? 1 : t / 0.7);
    siz[i] = d.size + d.grow * (1 - t);
    any = true;
  }

  if (any){
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    sizAttr.needsUpdate = true;
    alpAttr.needsUpdate = true;
  }
}

/* --- 曳光弹 --- */
const tracerGeo = new THREE.CylinderGeometry(0.014, 0.014, 1, 5, 1, true);
tracerGeo.rotateX(PI / 2);

const TRACERS = [];
for (let i = 0; i < 26; i++){
  const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({
    color: 0xffcf7a, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  }));
  m.visible = false;
  m.frustumCulled = false;
  scene.add(m);
  TRACERS.push({ mesh: m, t: 0, dur: 0.06, isSniper: false });
}
let tracerHead = 0;
const _tv1 = new THREE.Vector3(), _tv2 = new THREE.Vector3();

function spawnTracer(from, to, color, width, isSniper){
  const tr = TRACERS[tracerHead];
  tracerHead = (tracerHead + 1) % TRACERS.length;

  const len = _tv1.subVectors(to, from).length();
  if (len < 0.2) return;

  tr.mesh.position.copy(_tv2.addVectors(from, to).multiplyScalar(0.5));
  tr.mesh.lookAt(to);
  tr.mesh.scale.set(width || 1, width || 1, len);
  tr.mesh.material.color.setHex(color || 0xffcf7a);
  tr.mesh.material.opacity = 0.95;
  tr.mesh.visible = true;
  tr.w = width || 1;
  tr.t = 0;
  tr.isSniper = !!isSniper;
  
  tr.dur = isSniper ? 1.5 : (0.055 + len * 0.0015) * (tr.w > 1.5 ? 2.6 : 1);
}

function updateTracers(dt){
  for (const tr of TRACERS){
    if (!tr.mesh.visible) continue;
    tr.t += dt;
    const k = 1 - tr.t / tr.dur;
    if (k <= 0){ tr.mesh.visible = false; continue; }
    
    if (tr.isSniper) {
        tr.mesh.material.opacity = k * 0.85;
        tr.mesh.scale.x = tr.mesh.scale.y = (tr.w || 1) * 1.5;
    } else {
        tr.mesh.material.opacity = k * 0.95;
        tr.mesh.scale.x = tr.mesh.scale.y = (0.4 + k * 0.8) * (tr.w || 1);
    }
  }
}

/* --- 弹孔贴花 --- */
const DECALS = [];
{
  const g = new THREE.CircleGeometry(0.085, 8);
  const m = new THREE.MeshBasicMaterial({
    map: TEX.hole, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
    fog: true, opacity: 1
  });
  for (let i = 0; i < 44; i++){
    const d = new THREE.Mesh(g, m);
    d.visible = false;
    scene.add(d);
    DECALS.push(d);
  }
}
let decalHead = 0;
const _dq = new THREE.Vector3();

function addDecal(point, normal){
  const d = DECALS[decalHead];
  decalHead = (decalHead + 1) % DECALS.length;
  d.position.copy(point).addScaledVector(normal, 0.012);
  d.lookAt(_dq.copy(point).add(normal));
  d.rotation.z = Math.random() * 7;
  d.scale.setScalar(rand(0.75, 1.25));
  d.visible = true;
}

/* --- 弹壳 --- */
const SHELLS = [];
{
  const rifleGeo = new THREE.CylinderGeometry(0.0092, 0.0088, 0.045, 7);
  const shellGeo = new THREE.CylinderGeometry(0.0135, 0.0135, 0.062, 8);
  
  // 巴雷特 .50 BMG 黄铜弹壳
  const bmgGeo = new THREE.CylinderGeometry(0.012, 0.016, 0.14, 10); 

  // ✅ 究极穿甲弹 .50 BMG 黄金弹壳（口径更大，更粗）
  const apGeo = new THREE.CylinderGeometry(0.014, 0.019, 0.17, 12);

  const brass = new THREE.MeshStandardMaterial({ color: 0xd8b04a, metalness: .40, roughness: .25 });
  const red   = new THREE.MeshStandardMaterial({ color: 0xa8342c, metalness: .10, roughness: .6 });
  const bmgBrass = new THREE.MeshStandardMaterial({ color: 0xe8b828, metalness: .50, roughness: .20 });
  
  // ✅ 金色高亮发光材质
  const superGold = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.15, emissive: 0x553300, emissiveIntensity: 0.5 });

  // 分配对象池：小壳, 霰弹, 巴雷特重壳, 穿甲金壳
  for (let i = 0; i < 60; i++){
    let m, type;
    if (i < 12) { m = new THREE.Mesh(rifleGeo, brass); type = 'rifle'; }
    else if (i < 24) { m = new THREE.Mesh(shellGeo, red); type = 'shotgun'; }
    else if (i < 42) { m = new THREE.Mesh(bmgGeo, bmgBrass); type = 'barrett'; }
    else { m = new THREE.Mesh(apGeo, superGold); type = 'super_ap'; } // 额外18个穿甲金壳

    m.castShadow = true;
    m.visible = false;
    scene.add(m);
    SHELLS.push({
      mesh: m, type, life: 0,
      v: new THREE.Vector3(), av: new THREE.Vector3(), rest: false,
      smokeT: 0
    });
  }
}

function ejectShell(pos, dir, shellType){
  let s = null, oldest = null;
  for (const c of SHELLS){
    if (c.type !== shellType) continue;
    if (c.life <= 0){ s = c; break; }
    if (!oldest || c.life < oldest.life) oldest = c;
  }
  s = s || oldest;
  if (!s) return;

  const g = groundAt(pos.x, pos.z, pos.y);
  s.floorY = (g === null ? 0 : g) + 0.014;
  s.mesh.scale.setScalar(1);
  s.mesh.position.copy(pos);
  s.mesh.rotation.set(rand(0, 7), rand(0, 7), rand(0, 7));
  
  if (shellType === 'super_ap') {
    // 究极穿甲弹弹壳：抛射力大，冒烟时间极长，密度极高
    s.v.copy(dir).multiplyScalar(rand(2.5, 3.8));
    s.v.y += rand(2.0, 3.2);
    s.av.set(rand(-20, 20), rand(-20, 20), rand(-20, 20));
    s.smokeT = 1.5; 
  } else if (shellType === 'barrett') {
    s.v.copy(dir).multiplyScalar(rand(1.8, 2.8));
    s.v.y += rand(1.8, 2.5);
    s.av.set(rand(-15, 15), rand(-15, 15), rand(-15, 15));
    s.smokeT = 0.8;
  } else {
    s.v.copy(dir).multiplyScalar(rand(2.2, 3.6));
    s.v.y += rand(1.6, 2.7);
    s.av.set(rand(-22, 22), rand(-22, 22), rand(-22, 22));
    s.smokeT = 0;
  }

  s.v.x += rand(-.5, .5);
  s.v.z += rand(-.5, .5);
  s.life = 6.5;
  s.rest = false;
  s.mesh.visible = true;
  s.bounces = 0;
}

function updateShells(dt){
  for (const s of SHELLS){
    if (s.life <= 0) continue;
    s.life -= dt;
    if (s.life <= 0){ s.mesh.visible = false; continue; }

    if (s.smokeT > 0) {
      s.smokeT -= dt;
      
      // 根据弹壳类型决定烟雾量
      let spawnChance = 0.45;
      let smokeSize = 0.06;
      let smokeLife = 0.7;
      if (s.type === 'super_ap') {
        spawnChance = 0.9; // 极高概率爆烟
        smokeSize = 0.15;  // 烟团更大
        smokeLife = 1.2;   // 烟存在更久
      } else if (s.type === 'barrett') {
        spawnChance = 0.5;
        smokeSize = 0.08;
        smokeLife = 0.8;
      }

      if (Math.random() < spawnChance) {
        spawnParticle(PS_SOFT, s.mesh.position.x, s.mesh.position.y, s.mesh.position.z,
          rand(-0.4, 0.4), rand(0.4, 1.2), rand(-0.4, 0.4),
          { color: [0.6, 0.6, 0.6], size: smokeSize, grow: 0.6, life: smokeLife, drag: 1.2, grav: 0.8, alpha: 0.55 });
      }
    }

    if (s.rest){
      if (s.life < 0.9) s.mesh.scale.setScalar(clamp(s.life / 0.9, 0, 1));
      continue;
    }

    s.v.y -= 19 * dt;
    s.mesh.position.addScaledVector(s.v, dt);
    s.mesh.rotation.x += s.av.x * dt;
    s.mesh.rotation.y += s.av.y * dt;
    s.mesh.rotation.z += s.av.z * dt;

    if (s.mesh.position.y <= s.floorY){
      s.mesh.position.y = s.floorY;
      s.bounces++;
      if (Math.abs(s.v.y) < 0.55 || s.bounces > 3){
        s.rest = true;
        s.v.set(0, 0, 0);
        s.mesh.rotation.x = PI / 2;
        s.life = Math.min(s.life, 3.0);
      } else {
        s.v.y = -s.v.y * 0.42;
        s.v.x *= 0.62; s.v.z *= 0.62;
        s.av.multiplyScalar(0.55);
        if (_sfxOK()) SFX.shellDrop(clamp((s.mesh.position.x - camera.position.x) / 12, -1, 1));
      }
    }
  }
}

function fxSparks(point){
  for (let i = 0; i < 9; i++){
    const v = new THREE.Vector3(rand(-1, 1), rand(-.1, 1), rand(-1, 1))
              .normalize().multiplyScalar(rand(2.0, 6.0));
    spawnParticle(PS_SPARK, point.x, point.y, point.z, v.x, v.y, v.z,
      { color: i < 3 ? [1.0, 0.96, 0.80] : [0.85, 0.92, 1.0], size: 0.030,
        life: rand(0.10, 0.30), drag: 1.8, grav: -15 });
  }
  if (_sfxOK()) SFX.impactWall(clamp((point.x - camera.position.x) / 14, -1, 1), 6);
}

function fxImpactWall(point, normal, dist){
  addDecal(point, normal);
  const pan = clamp((point.x - camera.position.x) / 14, -1, 1);
  if (_sfxOK()) SFX.impactWall(pan, dist);
  for (let i = 0; i < 11; i++){
    const v = new THREE.Vector3(normal.x + rand(-.7, .7), normal.y + rand(-.2, 1.0), normal.z + rand(-.7, .7)).normalize().multiplyScalar(rand(2.2, 7.5));
    spawnParticle(PS_SPARK, point.x, point.y, point.z, v.x, v.y, v.z, { color: i < 4 ? [1.0, 0.95, 0.72] : [1.0, 0.66, 0.24], size: i < 4 ? 0.036 : 0.026, life: rand(0.10, 0.34), drag: 1.5, grav: -15 });
  }
  spawnParticle(PS_SOFT, point.x, point.y, point.z, normal.x * 1.6, normal.y * 1.6 + 0.4, normal.z * 1.6, { color: [0.78, 0.75, 0.70], size: 0.14, grow: 1.5, life: 0.16, drag: 5.0, grav: 0, alpha: 0.60 });
  for (let i = 0; i < 5; i++){
    spawnParticle(PS_SOFT, point.x, point.y, point.z, normal.x * rand(.3, 1.4) + rand(-.5, .5), rand(.3, 1.2), normal.z * rand(.3, 1.4) + rand(-.5, .5), { color: [0.55, 0.53, 0.50], size: 0.10, grow: 0.42, life: rand(0.5, 1.1), drag: 2.6, grav: 0.35, alpha: 0.42 });
  }
}

function fxImpactFlesh(point, dir, dist, head){
  const pan = clamp((point.x - camera.position.x) / 14, -1, 1);
  if (_sfxOK()) SFX.impactFlesh(pan, dist);
  const n = head ? 18 : 11;
  for (let i = 0; i < n; i++){
    const v = new THREE.Vector3(-dir.x + rand(-.8, .8), rand(0.1, 1.3), -dir.z + rand(-.8, .8)).normalize().multiplyScalar(rand(1.2, 4.4));
    spawnParticle(PS_SOFT, point.x, point.y, point.z, v.x, v.y, v.z, { color: [0.52, 0.03, 0.03], size: 0.045, life: rand(0.35, 0.8), drag: 1.4, grav: -11, alpha: 0.9 });
  }
  spawnParticle(PS_SOFT, point.x, point.y, point.z, 0, 0.4, 0, { color: [0.35, 0.02, 0.02], size: head ? 0.42 : 0.30, grow: 0.6, life: 0.45, drag: 3, grav: 0.2, alpha: 0.55 });
}

const muzzleSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.flash, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, opacity: 0 }));
muzzleSprite.scale.set(0.42, 0.42, 1);
vmScene.add(muzzleSprite);

const muzzleGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: 0xffc06a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, opacity: 0 }));
muzzleGlow.scale.set(0.55, 0.55, 1);
vmScene.add(muzzleGlow);

const muzzleLight = new THREE.PointLight(0xffbb66, 0, 26, 2.0);
scene.add(muzzleLight);

const vmMuzzleLight = new THREE.PointLight(0xffcc88, 0, 3.2, 2.0);
vmScene.add(vmMuzzleLight);

let flashT = 0, flashDur = 0.055, flashPower = 1;

const ENEMY_FLASH = [];
for (let i = 0; i < 6; i++){
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.flash, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  s.scale.set(0.9, 0.9, 1);
  s.visible = false;
  scene.add(s);
  const l = new THREE.PointLight(0xffaa55, 0, 12, 2);
  scene.add(l);
  ENEMY_FLASH.push({ s, l, t: 0 });
}
let efHead = 0;

function enemyMuzzleFlash(pos){
  const f = ENEMY_FLASH[efHead];
  efHead = (efHead + 1) % ENEMY_FLASH.length;
  f.s.position.copy(pos);
  f.s.visible = true;
  f.s.material.opacity = 1;
  f.s.material.rotation = Math.random() * 7;
  f.l.position.copy(pos);
  f.l.intensity = 7;
  f.t = 0.06;
}

function updateEnemyFlashes(dt){
  for (const f of ENEMY_FLASH){
    if (f.t <= 0) continue;
    f.t -= dt;
    const k = clamp(f.t / 0.06, 0, 1);
    f.s.material.opacity = k;
    f.l.intensity = 7 * k;
    if (f.t <= 0){
      f.s.visible = false;
      f.l.intensity = 0;
    }
  }
}