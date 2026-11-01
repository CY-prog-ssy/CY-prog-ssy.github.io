/* =========================================================================
   weapon_models.js
   手持武器模型 —— M4 / 霰弹枪 / 手枪 / 狙击枪，含手套和袖管

   依赖：utils.js（part/B/CYL/CYLZ/TUBEZ/PI/rand/randI/cvs/finishTex/grain/sRGB/linearizeMats）
         textures.js（TEX）
   暴露：buildRifle, buildShotgun, buildPistol, buildSniper,
         makeHand, texelize, GUN_PER_M,
         GUNMETAL, POLYMER, POLYTAN, STEEL, GLOVE, GLOVEPAD, SKIN,
         SLEEVE, SLEEVE_D, ACCENT_R, OPTIC_GLASS, TUBE_MAT
   ========================================================================= */
"use strict";

/* --------------------------------------------------------------------------
   武器表面磨损贴图 */
function makeWearTex(base, dark, light, speckle){
  const S = 256, [c, x] = cvs(S);
  x.fillStyle = base; x.fillRect(0, 0, S, S);

  for (let i = 0; i < 90; i++){
    const cx = rand(0, S), cy = rand(0, S), r = rand(10, 54);
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, Math.random() < 0.5 ? dark : light);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.globalAlpha = rand(0.05, 0.16);
    x.fillStyle = g;
    x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
  }

  x.globalAlpha = 1;
  for (let i = 0; i < 220; i++){
    const x0 = rand(0, S), y0 = rand(0, S), len = rand(6, 70);
    x.strokeStyle = Math.random() < 0.55 ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.085)';
    x.lineWidth = Math.random() < 0.85 ? 1 : 2;
    x.beginPath(); x.moveTo(x0, y0);
    x.lineTo(x0 + len, y0 + rand(-2.5, 2.5)); x.stroke();
  }

  if (speckle){
    for (let i = 0; i < 170; i++){
      x.fillStyle = 'rgba(255,255,255,' + rand(0.18, 0.46).toFixed(2) + ')';
      x.fillRect(rand(0, S), rand(0, S), rand(1, 3), rand(1, 2));
    }
  }
  grain(x, S, 11);
  return finishTex(c, [1, 1]);
}

const TEX_GUNMETAL = makeWearTex('#e2e2e0', '#a6a6a4', '#ffffff', true);
const TEX_POLYMER  = makeWearTex('#e0dfdc', '#a3a29e', '#ffffff', false);

const TEX_SLEEVE = (() => {
  const S = 256, [c, x] = cvs(S);
  x.fillStyle = '#dedbd4'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++){
    const cx = rand(0, S), cy = rand(0, S), r = rand(14, 52);
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, Math.random() < 0.5 ? '#9d9a92' : '#ffffff');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.globalAlpha = rand(0.06, 0.20);
    x.fillStyle = g;
    x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
  }
  x.globalAlpha = 1;
  x.strokeStyle = 'rgba(0,0,0,0.055)'; x.lineWidth = 1;
  for (let i = 0; i < S; i += 6){
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i, S); x.stroke();
    x.beginPath(); x.moveTo(0, i); x.lineTo(S, i); x.stroke();
  }
  x.strokeStyle = 'rgba(255,255,255,0.05)';
  for (let i = 3; i < S; i += 6){
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i, S); x.stroke();
  }
  grain(x, S, 9);
  return finishTex(c, [1, 1]);
})();

const GUN_PER_M = 5.5;

function texelize(root, perM){
  root.traverse(o => {
    const g = o.isMesh && o.material && o.material.map ? o.geometry : null;
    if (!g || !g.attributes.uv || g.userData.uvScaled) return;
    g.userData.uvScaled = true;
    const uv = g.attributes.uv;
    g.computeBoundingBox();
    const s = g.boundingBox.getSize(new THREE.Vector3());
    if (uv.count === 24){
      const face = [[s.z, s.y], [s.z, s.y], [s.x, s.z], [s.x, s.z], [s.x, s.y], [s.x, s.y]];
      for (let f = 0; f < 6; f++){
        const su = face[f][0] * perM, sv = face[f][1] * perM;
        for (let i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
      }
    } else {
      const k = Math.max(s.x, s.y, s.z) * perM;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
    }
    uv.needsUpdate = true;
  });
}

const GUNMETAL = new THREE.MeshStandardMaterial({map:TEX_GUNMETAL, color:0x585855, metalness:.22, roughness:.46});
const POLYMER  = new THREE.MeshStandardMaterial({map:TEX_POLYMER,  color:0x444340, metalness:.05, roughness:.76});
const POLYTAN  = new THREE.MeshStandardMaterial({map:TEX_POLYMER,  color:0x685c47, metalness:.05, roughness:.78});
const STEEL    = new THREE.MeshStandardMaterial({map:TEX_GUNMETAL, color:0x9a9c9b, metalness:.28, roughness:.32});
const GLOVE    = new THREE.MeshStandardMaterial({map:TEX_POLYMER,  color:0x474645, metalness:.04, roughness:.88});
const GLOVEPAD = new THREE.MeshStandardMaterial({color:0x2b2b2a, metalness:.10, roughness:.60});
const SKIN     = new THREE.MeshStandardMaterial({color:0xb08560, metalness:.0, roughness:.85});
const SLEEVE   = new THREE.MeshStandardMaterial({map:TEX_SLEEVE, color:0x5d6350, metalness:.02, roughness:.92});
const SLEEVE_D = new THREE.MeshStandardMaterial({map:TEX_SLEEVE, color:0x474c3d, metalness:.02, roughness:.94});
const ACCENT_R = new THREE.MeshStandardMaterial({color:0xff2a1a, emissive:0xff2a1a, emissiveIntensity:1.4, roughness:.5});
const OPTIC_GLASS = new THREE.MeshStandardMaterial({color:0x3d6274, metalness:.42, roughness:.10,
                                                    emissive:0x0b1a22, emissiveIntensity:.30,
                                                    transparent:true, opacity:0.20, depthWrite:false});
const TUBE_MAT = new THREE.MeshStandardMaterial({color:0x33383e, metalness:.18, roughness:.55,
                                                 side:THREE.DoubleSide});
linearizeMats({GUNMETAL,POLYMER,POLYTAN,STEEL,GLOVE,GLOVEPAD,SKIN,SLEEVE,SLEEVE_D,ACCENT_R,OPTIC_GLASS,TUBE_MAT});

function part(parent, geo, mat, x, y, z, rx, ry, rz, sx, sy, sz){
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x || 0, y || 0, z || 0);
  m.rotation.set(rx || 0, ry || 0, rz || 0);
  if (sx !== undefined) m.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz);
  parent.add(m);
  return m;
}

/* --------------------------------------------------------------------------
   战术手套
   -------------------------------------------------------------------------- */
function makeHand(flip){
  const g = new THREE.Group();
  const s = flip ? -1 : 1;
  part(g, B(0.072, 0.048, 0.10), GLOVE, 0, 0, 0);
  part(g, B(0.074, 0.024, 0.052), GLOVEPAD, 0, 0.014, -0.012);

  for (let i = 0; i < 4; i++){
    const fg = new THREE.Group();
    fg.position.set(s * (0.026 - i * 0.0175), -0.016, 0.046);
    fg.rotation.x = -1.15 - i * 0.06;
    g.add(fg);
    part(fg, B(0.016, 0.014, 0.044), GLOVE, 0, 0, 0.020);
    const tip = new THREE.Group();
    tip.position.set(0, 0, 0.042);
    tip.rotation.x = -0.95;
    fg.add(tip);
    part(tip, B(0.016, 0.013, 0.034), GLOVE, 0, 0, 0.016);
  }

  const th = new THREE.Group();
  th.position.set(s * -0.032, 0.004, 0.024);
  th.rotation.set(-0.5, s * 0.55, 0);
  g.add(th);
  part(th, B(0.019, 0.018, 0.050), GLOVE, 0, 0, 0.024);

  part(g, CYLZ(0.030, 0.034, 0.046, 10), GLOVEPAD, 0, 0, -0.052);
  const fore = new THREE.Group();
  fore.rotation.set(1.30, 0, s * 0.16);
  g.add(fore);
  part(fore, CYLZ(0.040, 0.040, 0.022, 12), GLOVEPAD, 0, 0, 0.026);
  part(fore, CYLZ(0.038, 0.049, 0.20, 12),  SLEEVE,   0, 0, 0.14);
  part(fore, CYLZ(0.049, 0.056, 0.30, 12),  SLEEVE_D, 0, 0, 0.38);
  part(fore, B(0.084, 0.030, 0.10), GLOVEPAD, 0, -0.030, 0.30);

  return g;
}

/* =========================================================================
   M4 卡宾枪
   ========================================================================= */
function buildRifle(){
  const G = new THREE.Group();

  /* 上机匣 */
  part(G, B(0.076, 0.088, 0.30), GUNMETAL, 0, 0, -0.05);
  part(G, B(0.060, 0.028, 0.34), GUNMETAL, 0, 0.052, -0.06);
  /* 皮轨：连续轨底 + 细齿 */
  part(G, B(0.056, 0.006, 0.34), GUNMETAL, 0, 0.064, -0.06);
  for (let i = 0; i < 16; i++)
    part(G, B(0.050, 0.012, 0.010), POLYMER, 0, 0.072, -0.22 + i * 0.022);
  /* 机匣铆钉 */
  for (const z of [-0.14, -0.02, 0.10]){
    part(G, CYLZ(0.005, 0.005, 0.004, 6), STEEL,  0.040, 0.016, z);
    part(G, CYLZ(0.005, 0.005, 0.004, 6), STEEL, -0.040, 0.016, z);
  }
  /* 抛壳口加强边 */
  part(G, B(0.012, 0.036, 0.082), GUNMETAL, 0.042, 0.014, -0.045);

  /* 下机匣 + 弹匣井 */
  part(G, B(0.056, 0.072, 0.13), POLYMER, 0, -0.062, -0.06);
  const mag = new THREE.Group();
  mag.position.set(0, -0.135, -0.045);
  mag.rotation.x = 0.18;
  G.add(mag);
  part(mag, B(0.048, 0.150, 0.082), POLYTAN, 0, 0, 0);
  /* 弹匣侧加强筋 */
  for (let i = 0; i < 4; i++){
    part(mag, B(0.052, 0.014, 0.006), POLYMER, 0, 0.048 - i * 0.028, 0.040);
    part(mag, B(0.052, 0.014, 0.006), POLYMER, 0, 0.048 - i * 0.028, -0.040);
  }
  part(mag, B(0.054, 0.014, 0.088), GLOVEPAD, 0, -0.082, 0);

  /* 护木精致化 */
  part(G, B(0.070, 0.074, 0.26), POLYMER, 0, -0.004, -0.30);
  for (let i = 0; i < 4; i++){
    const z = -0.40 + i * 0.058;
    part(G, B(0.076, 0.014, 0.036), GUNMETAL, 0, -0.018, z);
    part(G, B(0.076, 0.010, 0.020), GLOVEPAD, 0, -0.026, z);
  }
  for (let i = 0; i < 7; i++){
    part(G, B(0.046, 0.008, 0.008), POLYMER, 0, 0.042, -0.38 + i * 0.024);
  }
  part(G, B(0.076, 0.078, 0.018), GUNMETAL, 0, -0.004, -0.430);
  part(G, B(0.030, 0.024, 0.020), GLOVEPAD, 0, -0.042, -0.418);
  part(G, B(0.004, 0.068, 0.26), GUNMETAL,  0.036, -0.004, -0.30);
  part(G, B(0.004, 0.068, 0.26), GUNMETAL, -0.036, -0.004, -0.30);
  for (const z of [-0.42, -0.30, -0.18]){
    part(G, CYLZ(0.006, 0.006, 0.004, 6), STEEL,  0.038, -0.018, z);
    part(G, CYLZ(0.006, 0.006, 0.004, 6), STEEL, -0.038, -0.018, z);
  }

  /* 枪管 + 消焰器 */
  part(G, CYLZ(0.0165, 0.0165, 0.34, 10), STEEL, 0, 0.006, -0.50);
  part(G, CYLZ(0.024, 0.021, 0.062, 10), GUNMETAL, 0, 0.006, -0.685);
  for (let i = 0; i < 3; i++) part(G, B(0.052, 0.006, 0.018), GUNMETAL, 0, 0.006, -0.672 + i * 0.02);
  part(G, CYLZ(0.020, 0.020, 0.014, 10), POLYMER, 0, 0.006, -0.716);
  /* 气块 + 前照门 */
  part(G, B(0.040, 0.052, 0.05), GUNMETAL, 0, 0.020, -0.44);
  part(G, B(0.014, 0.052, 0.012), GUNMETAL, 0, 0.062, -0.44);

  /* 红点瞄具 */
  const opt = new THREE.Group();
  opt.position.set(0, 0.100, -0.10);
  G.add(opt);
  part(opt, B(0.034, 0.024, 0.090), POLYMER, 0, -0.008, 0);
  part(opt, TUBEZ(0.0235, 0.115, 18), TUBE_MAT, 0, 0.018, 0);
  part(opt, TUBEZ(0.0265, 0.010, 18), TUBE_MAT, 0, 0.018, -0.058);
  part(opt, TUBEZ(0.0265, 0.010, 18), TUBE_MAT, 0, 0.018,  0.058);
  part(opt, CYLZ(0.0210, 0.0210, 0.003, 18), OPTIC_GLASS, 0, 0.018, -0.048);
  part(opt, B(0.017, 0.012, 0.026), POLYMER, 0, 0.046, 0.012);

  const dot = part(opt, new THREE.SphereGeometry(0.0032, 8, 6), ACCENT_R, 0, 0.018, -0.040);
  const dotGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TEX.glow, color: 0xff3320, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.80
  }));
  dotGlow.scale.set(0.015, 0.015, 1);
  dotGlow.position.set(0, 0.018, -0.0385);
  opt.add(dotGlow);

  /* 拉机柄 + 抛壳口 + 铜挡板 */
  part(G, B(0.030, 0.014, 0.05), GUNMETAL, 0, 0.038, 0.10);
  part(G, B(0.010, 0.030, 0.075), GUNMETAL, 0.040, 0.014, -0.045);
  part(G, B(0.016, 0.034, 0.030), GUNMETAL, 0.042, 0.030, 0.030);
  part(G, CYLZ(0.011, 0.011, 0.03, 8), GUNMETAL, -0.042, 0.008, 0.03);

  /* 手枪握把 */
  const grip = new THREE.Group();
  grip.position.set(0, -0.086, 0.048);
  grip.rotation.x = -0.30;
  G.add(grip);
  part(grip, B(0.048, 0.125, 0.062), POLYMER, 0, -0.055, 0);
  part(grip, B(0.050, 0.030, 0.066), GLOVEPAD, 0, -0.108, 0);

  /* 扳机 + 护圈 */
  part(G, B(0.014, 0.030, 0.010), STEEL, 0, -0.052, -0.015);
  part(G, B(0.048, 0.010, 0.056), POLYMER, 0, -0.072, -0.020);
  part(G, B(0.048, 0.036, 0.010), POLYMER, 0, -0.056, -0.046);

  /* 枪托 */
  part(G, CYLZ(0.021, 0.021, 0.14, 10), GUNMETAL, 0, -0.006, 0.18);
  const st = new THREE.Group();
  st.position.set(0, -0.010, 0.235);
  G.add(st);
  part(st, B(0.062, 0.088, 0.13), POLYMER, 0, 0, 0);
  part(st, B(0.066, 0.104, 0.024), GLOVEPAD, 0, -0.006, 0.072);
  part(st, B(0.048, 0.030, 0.10), POLYMER, 0, 0.052, -0.01);
  part(G, B(0.008, 0.026, 0.008), STEEL, 0.036, -0.036, 0.16);

  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.006, -0.73); G.add(muzzle);
  const eject  = new THREE.Object3D(); eject.position.set(0.055, 0.02, -0.03); G.add(eject);

  const hands = new THREE.Group(); G.add(hands);
  const rh = makeHand(false); rh.position.set(0.008, -0.140, 0.075); rh.rotation.set(0.30, 0, 0.10); hands.add(rh);
  const lh = makeHand(true);  lh.position.set(-0.010, -0.072, -0.315); lh.rotation.set(0.05, 0.0, -0.18); hands.add(lh);

  return {
    group: G, muzzle, eject, dot, hands,
    basePos: new THREE.Vector3(0.205, -0.243, -0.928),
    baseRot: new THREE.Vector3(-0.028, 0.082, 0.055),
    adsPos:  new THREE.Vector3(0.0006, -0.1180, -0.866),
    adsRot:  new THREE.Vector3(0, 0, 0),
    adsRef: 0.986
  };
}

/* =========================================================================
   KS-12 泵动霰弹枪
   ========================================================================= */
function buildShotgun(){
  const G = new THREE.Group();
  part(G, B(0.082, 0.098, 0.26), GUNMETAL, 0, 0, -0.02);
  part(G, B(0.086, 0.020, 0.20), POLYMER, 0, 0.052, -0.03);
  part(G, B(0.014, 0.040, 0.075), GUNMETAL, 0.044, 0.006, -0.03);

  part(G, CYLZ(0.0235, 0.0235, 0.60, 12), GUNMETAL, 0, 0.020, -0.44);
  for (let i = 0; i < 7; i++)
    part(G, B(0.056, 0.010, 0.014), STEEL, 0, 0.050, -0.30 - i * 0.055);
  part(G, B(0.010, 0.016, 0.30), STEEL,  0.030, 0.038, -0.42);
  part(G, B(0.010, 0.016, 0.30), STEEL, -0.030, 0.038, -0.42);
  part(G, CYLZ(0.028, 0.026, 0.05, 12), GUNMETAL, 0, 0.020, -0.735);
  part(G, CYLZ(0.021, 0.021, 0.012, 12), POLYMER, 0, 0.020, -0.756);
  part(G, B(0.008, 0.020, 0.010), STEEL, 0, 0.052, -0.72);
  part(G, new THREE.SphereGeometry(0.0065, 8, 6), ACCENT_R, 0, 0.065, -0.72);

  part(G, CYLZ(0.0195, 0.0195, 0.52, 10), GUNMETAL, 0, -0.030, -0.40);
  part(G, CYLZ(0.022, 0.022, 0.03, 10), STEEL, 0, -0.030, -0.665);
  part(G, B(0.012, 0.030, 0.014), STEEL, 0, -0.052, -0.34);

  const forend = new THREE.Group();
  forend.position.set(0, -0.014, -0.34);
  G.add(forend);
  part(forend, B(0.078, 0.070, 0.185), POLYMER, 0, 0, 0);
  for (let i = 0; i < 6; i++)
    part(forend, B(0.082, 0.011, 0.013), GLOVEPAD, 0, -0.016, -0.070 + i * 0.028);
  part(forend, B(0.070, 0.020, 0.19), POLYMER, 0, 0.034, 0);

  const st = new THREE.Group();
  st.position.set(0, -0.028, 0.19);
  st.rotation.x = 0.10;
  G.add(st);
  part(st, B(0.066, 0.10, 0.20), POLYMER, 0, -0.008, 0.06);
  part(st, B(0.070, 0.118, 0.026), GLOVEPAD, 0, -0.020, 0.164);
  part(st, B(0.050, 0.036, 0.14), POLYMER, 0, 0.056, 0.03);

  const grip = new THREE.Group();
  grip.position.set(0, -0.062, 0.075);
  grip.rotation.x = -0.38;
  G.add(grip);
  part(grip, B(0.050, 0.115, 0.062), POLYMER, 0, -0.052, 0);
  part(G, B(0.014, 0.028, 0.010), STEEL, 0, -0.048, -0.012);
  part(G, B(0.046, 0.010, 0.056), GUNMETAL, 0, -0.068, -0.016);
  part(G, B(0.052, 0.014, 0.08), GLOVEPAD, 0, -0.052, -0.06);

  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.020, -0.77); G.add(muzzle);
  const eject  = new THREE.Object3D(); eject.position.set(0.06, 0.01, -0.02); G.add(eject);

  const hands = new THREE.Group(); G.add(hands);
  const rh = makeHand(false); rh.position.set(0.006, -0.118, 0.100); rh.rotation.set(0.38, 0, 0.10); hands.add(rh);
  const lh = makeHand(true);  lh.rotation.set(0.06, 0, -0.15);
  forend.add(lh); lh.position.set(-0.006, -0.064, -0.005);

  return {
    group: G, muzzle, eject, forend, hands,
    basePos: new THREE.Vector3(0.222, -0.255, -0.986),
    baseRot: new THREE.Vector3(-0.023, 0.086, 0.055),
    adsPos:  new THREE.Vector3(0.0006, -0.0650, -1.033),
    adsRot:  new THREE.Vector3(0, 0, 0),
    adsRef: 1.653
  };
}

/* =========================================================================
   P-9 手枪
   ========================================================================= */
function buildPistol(){
  const G = new THREE.Group();

  const slide = new THREE.Group(); G.add(slide);
  part(slide, B(0.046, 0.054, 0.215), GUNMETAL, 0, 0.012, -0.055);
  part(slide, B(0.048, 0.014, 0.215), POLYMER, 0, 0.036, -0.055);
  for (let i = 0; i < 7; i++)
    part(slide, B(0.049, 0.030, 0.007), GLOVEPAD, 0, 0.010, 0.010 + i * 0.014);
  part(slide, B(0.009, 0.013, 0.010), STEEL, 0, 0.045, -0.150);
  part(slide, B(0.006, 0.008, 0.011), ACCENT_R, 0, 0.047, -0.150);
  part(slide, B(0.010, 0.013, 0.012), STEEL, -0.010, 0.045, 0.036);
  part(slide, B(0.010, 0.013, 0.012), STEEL,  0.010, 0.045, 0.036);
  part(slide, B(0.005, 0.006, 0.013), ACCENT_R, -0.011, 0.046, 0.036);
  part(slide, B(0.005, 0.006, 0.013), ACCENT_R,  0.011, 0.046, 0.036);
  part(slide, B(0.014, 0.030, 0.062), GUNMETAL, 0.026, 0.014, -0.030);
  part(slide, CYLZ(0.0135, 0.0135, 0.03, 10), STEEL, 0, 0.008, -0.160);
  part(slide, CYLZ(0.010, 0.010, 0.012, 10), POLYMER, 0, 0.008, -0.170);

  part(G, B(0.040, 0.032, 0.185), POLYMER, 0, -0.024, -0.045);
  part(G, B(0.044, 0.012, 0.10), POLYMER, 0, -0.040, -0.100);
  for (let i = 0; i < 3; i++)
    part(G, B(0.046, 0.014, 0.010), GLOVEPAD, 0, -0.040, -0.070 - i * 0.024);

  const grip = new THREE.Group();
  grip.position.set(0, -0.040, 0.030);
  grip.rotation.x = -0.28;
  G.add(grip);
  part(grip, B(0.042, 0.135, 0.058), POLYMER, 0, -0.066, 0);
  for (let i = 0; i < 5; i++)
    part(grip, B(0.044, 0.009, 0.062), GLOVEPAD, 0, -0.028 - i * 0.021, 0);
  part(grip, B(0.046, 0.014, 0.062), GUNMETAL, 0, -0.136, 0);

  part(G, B(0.040, 0.009, 0.052), POLYMER, 0, -0.056, -0.018);
  part(G, B(0.040, 0.030, 0.009), POLYMER, 0, -0.043, -0.041);
  part(G, B(0.011, 0.026, 0.009), STEEL, 0, -0.038, -0.014);

  part(G, B(0.020, 0.020, 0.026), GUNMETAL, 0, 0.006, 0.062);
  part(G, B(0.034, 0.010, 0.040), POLYMER, 0, -0.010, 0.058);

  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.008, -0.185); G.add(muzzle);
  const eject  = new THREE.Object3D(); eject.position.set(0.04, 0.02, -0.03); G.add(eject);

  const hands = new THREE.Group(); G.add(hands);
  const rh = makeHand(false); rh.position.set(0.010, -0.108, 0.052); rh.rotation.set(0.28, 0, 0.12); hands.add(rh);
  const lh = makeHand(true);  lh.position.set(-0.046, -0.100, 0.036); lh.rotation.set(0.34, 0.22, -0.30); hands.add(lh);

  return {
    group: G, muzzle, eject, slide, hands,
    basePos: new THREE.Vector3(0.175, -0.232, -0.754),
    baseRot: new THREE.Vector3(-0.022, 0.072, 0.050),
    adsPos:  new THREE.Vector3(0.0006, -0.0448, -0.4935),
    adsRot:  new THREE.Vector3(0, 0, 0),
    adsRef: 0.6235
  };
}

/* =========================================================================
   SR-7 长弓
   ========================================================================= */
function buildSniper(){
  const G = new THREE.Group();
  part(G, B(0.070, 0.082, 0.40), GUNMETAL, 0, 0, -0.02);
  part(G, B(0.056, 0.022, 0.44), GUNMETAL, 0, 0.050, -0.03);
  for (let i = 0; i < 16; i++)
    part(G, B(0.048, 0.009, 0.010), POLYMER, 0, 0.064, -0.22 + i * 0.026);
  part(G, CYLZ(0.0215, 0.0195, 0.62, 12), STEEL, 0, 0.004, -0.55);
  for (let i = 0; i < 8; i++)
    part(G, B(0.046, 0.007, 0.030), GUNMETAL, 0, 0.004, -0.34 - i * 0.062);
  part(G, CYLZ(0.030, 0.028, 0.09, 12), GUNMETAL, 0, 0.004, -0.90);
  for (let i = 0; i < 4; i++)
    part(G, B(0.064, 0.008, 0.012), GUNMETAL, 0, 0.004, -0.875 - i * 0.020);
  part(G, CYLZ(0.023, 0.023, 0.014, 12), POLYMER, 0, 0.004, -0.946);
  part(G, B(0.076, 0.062, 0.34), POLYTAN, 0, -0.020, -0.36);
  for (let i = 0; i < 5; i++)
    part(G, B(0.080, 0.014, 0.024), POLYMER, 0, -0.030, -0.48 + i * 0.058);
  part(G, B(0.050, 0.014, 0.30), POLYTAN, 0, 0.014, -0.36);

  const bp = new THREE.Group();
  bp.position.set(0, -0.056, -0.47);
  G.add(bp);
  part(bp, B(0.026, 0.020, 0.07), GUNMETAL, 0, 0, 0);
  part(bp, CYLZ(0.0075, 0.0075, 0.17, 8), STEEL, -0.020, -0.010, 0.055, 0.30, 0, 0);
  part(bp, CYLZ(0.0075, 0.0075, 0.17, 8), STEEL,  0.020, -0.010, 0.055, 0.30, 0, 0);

  const sc = new THREE.Group();
  sc.position.set(0, 0.118, -0.10);
  G.add(sc);
  part(sc, CYLZ(0.0225, 0.0225, 0.30, 16), GUNMETAL, 0, 0, 0);
  part(sc, CYLZ(0.0335, 0.0335, 0.075, 16), GUNMETAL, 0, 0, -0.185);
  part(sc, CYLZ(0.0290, 0.0290, 0.060, 16), GUNMETAL, 0, 0,  0.170);
  part(sc, CYLZ(0.0300, 0.0300, 0.008, 16), OPTIC_GLASS, 0, 0, -0.221);
  part(sc, CYLZ(0.0255, 0.0255, 0.008, 16), OPTIC_GLASS, 0, 0,  0.199);
  part(sc, CYL(0.017, 0.017, 0.030, 12), GUNMETAL, 0, 0.030, -0.02);
  part(sc, B(0.030, 0.006, 0.030), POLYMER, 0, 0.046, -0.02);
  part(sc, CYLZ(0.016, 0.016, 0.030, 12), GUNMETAL, 0.030, 0, -0.02, 0, PI / 2, 0);
  part(sc, CYLZ(0.0155, 0.0155, 0.028, 12), GUNMETAL, 0, 0,  0.075);
  for (let i = 0; i < 8; i++)
    part(sc, B(0.005, 0.034, 0.026), POLYMER, 0, 0, 0.075, 0, 0, i * PI / 4);
  part(G, B(0.036, 0.052, 0.030), GUNMETAL, 0, 0.086, -0.20);
  part(G, B(0.036, 0.052, 0.030), GUNMETAL, 0, 0.086,  0.00);

  const bolt = new THREE.Group();
  bolt.position.set(0.038, 0.026, 0.10);
  G.add(bolt);
  part(bolt, CYLZ(0.012, 0.012, 0.11, 10), STEEL, 0, 0, 0);
  const knob = new THREE.Group();
  knob.position.set(0, 0, 0.050);
  bolt.add(knob);
  part(knob, CYLZ(0.0095, 0.0095, 0.062, 8), STEEL, 0.026, 0, 0, 0, PI / 2, 0);
  part(knob, new THREE.SphereGeometry(0.0185, 10, 8), GUNMETAL, 0.058, 0, 0);

  const mag = new THREE.Group();
  mag.position.set(0, -0.098, -0.055);
  G.add(mag);
  part(mag, B(0.044, 0.110, 0.095), POLYMER, 0, 0, 0);
  part(mag, B(0.048, 0.014, 0.099), GLOVEPAD, 0, -0.058, 0);

  part(G, B(0.013, 0.030, 0.010), STEEL, 0, -0.052, 0.020);
  part(G, B(0.046, 0.010, 0.062), POLYMER, 0, -0.070, 0.014);
  part(G, B(0.046, 0.032, 0.010), POLYMER, 0, -0.056, -0.014);

  const grip = new THREE.Group();
  grip.position.set(0, -0.080, 0.105);
  grip.rotation.x = -0.22;
  G.add(grip);
  part(grip, B(0.046, 0.130, 0.060), POLYTAN, 0, -0.058, 0);
  part(grip, B(0.048, 0.030, 0.064), GLOVEPAD, 0, -0.112, 0);

  const st = new THREE.Group();
  st.position.set(0, -0.006, 0.235);
  G.add(st);
  part(st, B(0.058, 0.070, 0.10), POLYTAN, 0, 0, 0);
  part(st, B(0.050, 0.028, 0.15), POLYTAN, 0, 0.052, 0.075);
  part(st, CYLZ(0.008, 0.008, 0.05, 8), STEEL, -0.018, 0.026, 0.075, 1.57, 0, 0);
  part(st, CYLZ(0.008, 0.008, 0.05, 8), STEEL,  0.018, 0.026, 0.075, 1.57, 0, 0);
  part(st, B(0.052, 0.020, 0.16), POLYTAN, 0, -0.028, 0.080);
  part(st, B(0.058, 0.110, 0.026), GLOVEPAD, 0, 0.006, 0.168);
  part(st, B(0.030, 0.040, 0.05), GUNMETAL, 0, -0.052, 0.150);

  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.004, -0.96); G.add(muzzle);
  const eject  = new THREE.Object3D(); eject.position.set(0.055, 0.02, 0.06); G.add(eject);

  const hands = new THREE.Group(); G.add(hands);
  const rh = makeHand(false); rh.position.set(0.010, -0.136, 0.128); rh.rotation.set(0.26, 0, 0.10); hands.add(rh);
  const lh = makeHand(true);  lh.position.set(-0.012, -0.078, -0.380); lh.rotation.set(0.04, 0, -0.16); hands.add(lh);

  return {
    group: G, muzzle, eject, bolt, knob, hands,
    basePos: new THREE.Vector3(0.224, -0.262, -1.16),
    baseRot: new THREE.Vector3(-0.022, 0.084, 0.055),
    adsPos:  new THREE.Vector3(0.0006, -0.1185, -0.6205),
    adsRot:  new THREE.Vector3(0, 0, 0),
    adsRef: 0.7105
  };
}