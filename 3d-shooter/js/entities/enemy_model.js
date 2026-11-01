/* =========================================================================
   enemy_model.js
   敌人模型 —— 迷彩贴图 / 图元身体 / 骨骼合并 / 血条精灵
   精致化：手部（五指） / 面部（五官） / 头盔导轨 / 护目镜 / 耳麦 / 扣具

   依赖：utils.js（cvs/finishTex/grain/rand/randI/pick/clamp/part/
                    B/CYL/CYLZ/PI/sRGB/linearizeMats/mergeGeoms）
         textures.js（TEX）
   暴露：E_MAT, D_MAT, INVIS, TEX_CAMO, CAMO_PER_M,
         EB, capsuleGroup, collapseRig, buildEnemyModel, makeTag,
         ENEMY_HP_MAX
   ========================================================================= */
"use strict";

/* --------------------------------------------------------------------------
   多尺度斑点迷彩
   -------------------------------------------------------------------------- */
function makeCamoTex(){
  const S = 256, [c, x] = cvs(S);
  x.fillStyle = '#585a41';
  x.fillRect(0, 0, S, S);

  const blob = (fill, count, rMin, rMax, lobes) => {
    x.fillStyle = fill;
    for (let i = 0; i < count; i++){
      const cx = rand(0, S), cy = rand(0, S), r = rand(rMin, rMax);
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++){
        const px = cx + ox * S, py = cy + oy * S;
        if (px < -r * 2 || px > S + r * 2 || py < -r * 2 || py > S + r * 2) continue;
        x.beginPath();
        for (let k = 0; k <= lobes; k++){
          const a = k / lobes * PI * 2;
          const rr = r * (0.62 + 0.38 * Math.abs(Math.sin(a * 2.3 + cx)));
          const qx = px + Math.cos(a) * rr, qy = py + Math.sin(a) * rr;
          k ? x.lineTo(qx, qy) : x.moveTo(qx, qy);
        }
        x.closePath();
        x.fill();
      }
    }
  };

  blob('#464934', 16, 16, 34, 9);
  blob('#33372a', 13, 11, 26, 8);
  blob('#6d6650', 11, 10, 22, 8);
  blob('#22241d',  9,  6, 15, 7);
  grain(x, S, 14);
  return finishTex(c, [1, 1]);
}
const TEX_CAMO = makeCamoTex();

/* --------------------------------------------------------------------------
   按比例重设 UV
   -------------------------------------------------------------------------- */
const CAMO_PER_M = 3.6;

function EB(w, h, d){
  const g = B(w, h, d);
  const uv = g.attributes.uv;
  const face = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++){
    const su = face[f][0] * CAMO_PER_M, sv = face[f][1] * CAMO_PER_M;
    for (let i = f * 4; i < f * 4 + 4; i++)
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  return g;
}

/* --------------------------------------------------------------------------
   敌人材质
   -------------------------------------------------------------------------- */
const E_MAT = {
  cloth : new THREE.MeshStandardMaterial({ map: TEX_CAMO, roughness: .94, metalness: .02 }),
  webb  : new THREE.MeshStandardMaterial({ color: 0x565842, roughness: .94, metalness: .02 }),
  vest  : new THREE.MeshStandardMaterial({ color: 0x32342f, roughness: .80, metalness: .06 }),
  skin  : new THREE.MeshStandardMaterial({ color: 0xa87f5b, roughness: .86, metalness: .0 }),
  helm  : new THREE.MeshStandardMaterial({ color: 0x4b4d40, roughness: .62, metalness: .08 }),
  boot  : new THREE.MeshStandardMaterial({ color: 0x26262a, roughness: .94, metalness: .04 }),
  dark  : new THREE.MeshStandardMaterial({ color: 0x181b1f, roughness: .62, metalness: .22 }),
  gun   : new THREE.MeshStandardMaterial({ color: 0x44484c, roughness: .48, metalness: .16 }),
  glass : new THREE.MeshStandardMaterial({ color: 0x2a3542, roughness: .14, metalness: .24 }),
  accent: new THREE.MeshStandardMaterial({ color: 0xff3b2a, emissive: 0xff2a18, emissiveIntensity: 1.6, roughness: .5 }),
  /* ★ 新增：用于精细细节 */
  buckle: new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: .35, metalness: .70 }),
  strap : new THREE.MeshStandardMaterial({ color: 0x2a2c28, roughness: .92, metalness: .02 }),
  lens  : new THREE.MeshStandardMaterial({ color: 0x1a2836, roughness: .08, metalness: .55,
                                           emissive: 0x101820, emissiveIntensity: .6 }),
  finger: new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: .90, metalness: .02 })
};
linearizeMats(E_MAT);

/* 医疗无人机材质 */
const D_MAT = {
  shell: new THREE.MeshStandardMaterial({ color: 0xd7dbe0, roughness: .38, metalness: .28 }),
  dark : new THREE.MeshStandardMaterial({ color: 0x1b2025, roughness: .55, metalness: .40 }),
  rotor: new THREE.MeshStandardMaterial({ color: 0x8b949c, roughness: .5, metalness: .2,
                                          transparent: true, opacity: .42, side: THREE.DoubleSide }),
  glow : new THREE.MeshStandardMaterial({ color: 0x7ee081, emissive: 0x39d968, emissiveIntensity: 2.4, roughness: .4 }),
  lens : new THREE.MeshStandardMaterial({ color: 0x22303c, roughness: .16, metalness: .30 })
};
linearizeMats(D_MAT);

const INVIS = new THREE.MeshBasicMaterial({ visible: false });

/* --------------------------------------------------------------------------
   胶囊 = 圆柱 + 两个半球
   -------------------------------------------------------------------------- */
function capsuleGroup(parent, r, h, mat, x, y, z){
  x = x || 0; y = y || 0; z = z || 0;
  part(parent, CYL(r, r, h, 12), mat, x, y, z);
  part(parent, new THREE.SphereGeometry(r, 12, 8), mat, x, y + h / 2, z);
  part(parent, new THREE.SphereGeometry(r, 12, 8), mat, x, y - h / 2, z);
}

/* --------------------------------------------------------------------------
   骨骼折叠
   -------------------------------------------------------------------------- */
function collapseRig(root){
  const groups = [];
  root.traverse(o => { if (o.isGroup || o === root) groups.push(o); });
  for (const g of groups){
    const byMat = new Map();
    for (const c of g.children){
      if (!c.isMesh || c.material === INVIS) continue;
      if (!byMat.has(c.material)) byMat.set(c.material, []);
      byMat.get(c.material).push(c);
    }
    for (const [mat, list] of byMat){
      if (list.length < 2) continue;
      const geos = list.map(m => {
        m.updateMatrix();
        return m.geometry.clone().applyMatrix4(m.matrix);
      });
      for (const m of list) g.remove(m);
      const merged = new THREE.Mesh(mergeGeoms(geos), mat);
      merged.castShadow = merged.receiveShadow = true;
      g.add(merged);
    }
  }
}

/* --------------------------------------------------------------------------
   ★ 五指手部构建
   fingers: 每根手指的弯曲角度（0 = 伸直，1 = 完全握拳）
   -------------------------------------------------------------------------- */
function buildHand(parent, side, curl){
  /* side: -1 左手 / +1 右手
     curl: 0..1 手指握拳程度 */
  const sx = side;
  const c = curl || 0;
  const hand = new THREE.Group();
  parent.add(hand);

  /* 手掌基座（手套）*/
  part(hand, B(0.070, 0.075, 0.105), E_MAT.vest, 0, 0, -0.010);
  part(hand, B(0.070, 0.020, 0.105), E_MAT.finger, 0, 0.040, -0.010);   // 手背细节

  /* 手腕护具 */
  part(hand, B(0.085, 0.055, 0.060), E_MAT.webb, 0, -0.005, 0.055);

  /* 四根手指，从食指到小指 */
  const fx = [-0.024, -0.008, 0.008, 0.024];           // 手指横向位置
  const flen = [0.062, 0.068, 0.064, 0.054];           // 每根手指长度
  const fw = 0.013;                                    // 每根手指宽度
  for (let i = 0; i < 4; i++){
    const fg = new THREE.Group();
    fg.position.set(fx[i] * sx, 0.002, -0.058);
    hand.add(fg);
    /* 近节 —— 绕X轴旋转，指向 -Z */
    part(fg, B(fw, 0.016, flen[i]), E_MAT.finger, 0, 0, -flen[i] / 2);

    /* 远节 —— 相对近节弯曲 */
    const tip = new THREE.Group();
    tip.position.set(0, 0, -flen[i]);
    fg.add(tip);
    const tipLen = flen[i] * 0.85;
    part(tip, B(fw * 0.88, 0.014, tipLen), E_MAT.finger, 0, 0, -tipLen / 2);
    /* 指关节的暗色分节 */
    part(tip, B(fw * 1.02, 0.018, 0.010), E_MAT.vest, 0, 0, 0.006);

    /* 弯曲 */
    fg.rotation.x = c * 1.15;
    tip.rotation.x = c * 1.35;
  }

  /* 拇指 —— 位置更靠下、朝侧面 */
  const th = new THREE.Group();
  th.position.set(0.030 * sx, -0.018, 0.005);
  hand.add(th);
  th.rotation.z = -0.55 * sx;
  th.rotation.x = 0.3;
  part(th, B(0.020, 0.015, 0.040), E_MAT.finger, 0, 0, -0.020);
  const thTip = new THREE.Group();
  thTip.position.set(0, 0, -0.040);
  th.add(thTip);
  part(thTip, B(0.018, 0.013, 0.032), E_MAT.finger, 0, 0, -0.016);
  th.rotation.x += c * 0.85;
  thTip.rotation.x = c * 0.70;

  return hand;
}

/* --------------------------------------------------------------------------
   ★ 面部细节构建
   -------------------------------------------------------------------------- */
function buildFace(head){
  /* 头骨基础 —— 略呈椭圆 */
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 14), E_MAT.skin);
  skull.scale.set(0.92, 1.05, 0.98);
  head.add(skull);

  /* 颧骨（左右各一块，略微突出）*/
  part(head, B(0.055, 0.045, 0.060), E_MAT.skin,  0.078, -0.025, -0.098);
  part(head, B(0.055, 0.045, 0.060), E_MAT.skin, -0.078, -0.025, -0.098);

  /* 下巴 —— 半圆底 */
  const chin = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 10, 8, 0, PI * 2, PI * 0.55, PI * 0.45),
    E_MAT.skin
  );
  chin.position.set(0, -0.062, -0.045);
  chin.scale.set(1.0, 1.15, 1.0);
  head.add(chin);

  /* 鼻子 —— 三角柱 */
  part(head, B(0.030, 0.038, 0.055), E_MAT.skin, 0, -0.018, -0.135);
  part(head, B(0.024, 0.014, 0.045), E_MAT.skin, 0, -0.036, -0.138);   // 鼻翼

  /* 眼睛凹陷（护目镜下面的阴影）*/
  part(head, B(0.038, 0.022, 0.020), E_MAT.dark,  0.052, 0.020, -0.122);
  part(head, B(0.038, 0.022, 0.020), E_MAT.dark, -0.052, 0.020, -0.122);

  /* 嘴唇轮廓（面罩下方可见的部分）*/
  part(head, B(0.045, 0.014, 0.025), E_MAT.skin, 0, -0.068, -0.118);

  /* 耳朵 */
  const earL = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), E_MAT.skin);
  earL.scale.set(0.35, 1.0, 0.75);
  earL.position.set( 0.130, 0.000, 0.008);
  head.add(earL);
  const earR = earL.clone();
  earR.position.x = -0.130;
  head.add(earR);
}

/* --------------------------------------------------------------------------
   ★ 头盔 + 导轨 + NVG 支架 + 扣具
   -------------------------------------------------------------------------- */
function buildHelmet(head){
  /* 主盔体 —— 半球壳 */
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.158, 16, 12, 0, PI * 2, 0, PI * 0.62),
    E_MAT.helm
  );
  shell.position.y = 0.012;
  head.add(shell);

  /* 帽檐（前方一块倾斜的板）*/
  part(head, B(0.300, 0.028, 0.145), E_MAT.helm, 0, -0.055, -0.108);

  /* ★ 头盔导轨（左右各一条，从侧面向后延伸）*/
  part(head, B(0.020, 0.018, 0.155), E_MAT.dark,  0.148, -0.020, -0.020);
  part(head, B(0.020, 0.018, 0.155), E_MAT.dark, -0.148, -0.020, -0.020);

  /* 导轨上的小扣具（左右各两个）*/
  part(head, B(0.024, 0.022, 0.028), E_MAT.buckle,  0.150, -0.020, -0.070);
  part(head, B(0.024, 0.022, 0.028), E_MAT.buckle,  0.150, -0.020,  0.030);
  part(head, B(0.024, 0.022, 0.028), E_MAT.buckle, -0.150, -0.020, -0.070);
  part(head, B(0.024, 0.022, 0.028), E_MAT.buckle, -0.150, -0.020,  0.030);

  /* 头盔后部的魔术贴 */
  part(head, B(0.110, 0.030, 0.030), E_MAT.dark, 0, -0.040,  0.145);

  /* 顶部透气孔（视觉符号，非几何孔）*/
  part(head, B(0.048, 0.008, 0.016), E_MAT.dark, 0,  0.140, -0.040);
  part(head, B(0.048, 0.008, 0.016), E_MAT.dark, 0,  0.140,  0.010);

  /* ★ NVG 底座 + 支架（前方）*/
  part(head, B(0.040, 0.040, 0.035), E_MAT.dark, 0, 0.052, -0.128);
  part(head, B(0.055, 0.012, 0.070), E_MAT.dark, 0, 0.070, -0.118);   // 支架臂
  part(head, B(0.068, 0.055, 0.060), E_MAT.helm, 0, 0.082, -0.142);   // NVG 罩

  /* ★ 头盔前方的反光贴（一小块）*/
  part(head, B(0.038, 0.020, 0.008), E_MAT.accent, 0, -0.048, -0.180);
}

/* --------------------------------------------------------------------------
   ★ 护目镜 —— 镜框 + 镜片 + 反光
   -------------------------------------------------------------------------- */
function buildGoggles(head){
  /* 镜框 */
  part(head, B(0.210, 0.055, 0.030), E_MAT.dark, 0, 0.010, -0.132);
  /* 上下框条 */
  part(head, B(0.215, 0.008, 0.025), E_MAT.dark, 0, 0.038, -0.130);
  part(head, B(0.215, 0.008, 0.025), E_MAT.dark, 0, -0.018, -0.130);
  /* ★ 镜片（反光）*/
  part(head, B(0.190, 0.040, 0.010), E_MAT.lens, 0, 0.010, -0.150);
  /* 中间鼻梁扣 */
  part(head, B(0.020, 0.048, 0.020), E_MAT.dark, 0, 0.008, -0.152);
  /* 镜带（绕头一圈的窄带）*/
  part(head, B(0.230, 0.020, 0.160), E_MAT.strap, 0, 0.048, -0.030);
  /* 镜带侧扣 */
  part(head, B(0.028, 0.030, 0.020), E_MAT.buckle,  0.112, 0.038, -0.115);
  part(head, B(0.028, 0.030, 0.020), E_MAT.buckle, -0.112, 0.038, -0.115);
}

/* --------------------------------------------------------------------------
   ★ 面罩 —— 下半脸防护 + 褶皱
   -------------------------------------------------------------------------- */
function buildFaceMask(head){
  /* 面罩主体（覆盖口鼻）*/
  part(head, B(0.160, 0.095, 0.075), E_MAT.vest, 0, -0.055, -0.108);

  /* 面罩上的褶皱线条（两条）*/
  part(head, B(0.150, 0.006, 0.070), E_MAT.dark, 0, -0.038, -0.108);
  part(head, B(0.150, 0.006, 0.070), E_MAT.dark, 0, -0.075, -0.108);

  /* 面罩下方的过滤阀（小圆盘）*/
  part(head, CYL(0.022, 0.022, 0.014, 10), E_MAT.dark, 0.048, -0.078, -0.148);
  part(head, CYL(0.022, 0.022, 0.014, 10), E_MAT.dark, -0.048, -0.078, -0.148);
}

/* --------------------------------------------------------------------------
   ★ 耳麦 + 麦克风 + 下巴带
   -------------------------------------------------------------------------- */
function buildComms(head){
  /* 耳罩（左右）*/
  part(head, B(0.058, 0.105, 0.055), E_MAT.vest,  0.148, -0.035, 0.010);
  part(head, B(0.058, 0.105, 0.055), E_MAT.vest, -0.148, -0.035, 0.010);

  /* ★ 耳罩外圈的金属环（细节）*/
  part(head, CYL(0.036, 0.036, 0.012, 14), E_MAT.dark,  0.178, -0.035, 0.010).rotation.z = PI / 2;
  part(head, CYL(0.036, 0.036, 0.012, 14), E_MAT.dark, -0.178, -0.035, 0.010).rotation.z = PI / 2;

  /* 麦克风吊杆（右侧）*/
  part(head, B(0.008, 0.008, 0.100), E_MAT.dark,  0.155, -0.075, -0.055);
  part(head, CYL(0.012, 0.012, 0.014, 8), E_MAT.dark,  0.155, -0.078, -0.108);

  /* 下巴带（从头盔两侧延伸到下巴）*/
  part(head, B(0.014, 0.130, 0.014), E_MAT.strap,  0.130, -0.055, 0.045).rotation.z = 0.18;
  part(head, B(0.014, 0.130, 0.014), E_MAT.strap, -0.130, -0.055, 0.045).rotation.z = -0.18;

  /* 下巴带扣具 */
  part(head, B(0.020, 0.024, 0.016), E_MAT.buckle, 0, -0.108, -0.010);
}

/* --------------------------------------------------------------------------
   ★ 躯干装备细节 —— MOLLE 织带 / 肩带 / 扣具
   -------------------------------------------------------------------------- */
function buildTorsoDetails(body){
  /* ★ MOLLE 织带（胸前三条横向织带）*/
  part(body, B(0.300, 0.014, 0.012), E_MAT.strap, 0, 1.20, -0.180);
  part(body, B(0.300, 0.014, 0.012), E_MAT.strap, 0, 1.13, -0.185);
  part(body, B(0.300, 0.014, 0.012), E_MAT.strap, 0, 1.06, -0.180);

  /* 弹匣袋上的小扣具 */
  part(body, B(0.028, 0.024, 0.016), E_MAT.buckle,  0.135, 1.095, -0.180);
  part(body, B(0.028, 0.024, 0.016), E_MAT.buckle,  0.000, 1.095, -0.180);
  part(body, B(0.028, 0.024, 0.016), E_MAT.buckle, -0.135, 1.095, -0.180);

  /* ★ 肩带（从前胸翻过肩膀到后背）*/
  part(body, B(0.045, 0.245, 0.016), E_MAT.strap,  0.115, 1.42, -0.170);
  part(body, B(0.045, 0.245, 0.016), E_MAT.strap, -0.115, 1.42, -0.170);
  /* 肩带扣具 */
  part(body, B(0.055, 0.030, 0.020), E_MAT.buckle,  0.115, 1.30, -0.180);
  part(body, B(0.055, 0.030, 0.020), E_MAT.buckle, -0.115, 1.30, -0.180);

  /* ★ 腰带扣具（正中）*/
  part(body, B(0.055, 0.045, 0.020), E_MAT.buckle, 0, 1.055, -0.168);

  /* 背部的背包扣具（侧面能看到）*/
  part(body, B(0.028, 0.020, 0.016), E_MAT.buckle,  0.075, 1.24, 0.290);
  part(body, B(0.028, 0.020, 0.016), E_MAT.buckle, -0.075, 1.24, 0.290);

  /* ★ 卷毯的捆绑带 */
  part(body, B(0.115, 0.014, 0.014), E_MAT.strap, 0.13, 1.30, 0.300);
  part(body, B(0.115, 0.014, 0.014), E_MAT.strap, 0.13, 1.42, 0.300);
}

/* --------------------------------------------------------------------------
   敌人模型构建
   -------------------------------------------------------------------------- */
function buildEnemyModel(emOpt){
  const opt = emOpt || {};
  const model = new THREE.Group();
  const body  = new THREE.Group(); model.add(body);

  /* ---- 腿（枢轴在髋）---- */
  const legs = [];
  for (const s of [-1, 1]){
    const hip = new THREE.Group();
    hip.position.set(s * 0.135, 0.90, 0);
    body.add(hip);
    part(hip, EB(0.185, 0.46, 0.20), E_MAT.cloth, 0, -0.23, 0);
    part(hip, B(0.155, 0.115, 0.055), E_MAT.vest, 0, -0.40, -0.106);       // 护膝
    /* ★ 护膝扣具 */
    part(hip, B(0.045, 0.020, 0.012), E_MAT.buckle, 0, -0.36, -0.108);
    const knee = new THREE.Group();
    knee.position.set(0, -0.46, 0);
    hip.add(knee);
    part(knee, EB(0.165, 0.44, 0.185), E_MAT.cloth, 0, -0.22, 0);
    part(knee, B(0.172, 0.17, 0.195), E_MAT.boot, 0, -0.38, -0.004);       // 靴筒
    part(knee, B(0.175, 0.10, 0.28), E_MAT.boot, 0, -0.42, -0.035);        // 靴头
    /* ★ 靴子绑带 */
    part(knee, B(0.180, 0.014, 0.200), E_MAT.strap, 0, -0.30, -0.004);
    part(knee, B(0.180, 0.014, 0.200), E_MAT.strap, 0, -0.36, -0.004);
    legs.push({ hip, knee });
  }

  /* ---- 躯干 ---- */
  capsuleGroup(body, 0.215, 0.44, E_MAT.cloth, 0, 1.20, 0);
  part(body, B(0.455, 0.50, 0.315), E_MAT.vest, 0, 1.25, -0.005);          // 载具
  part(body, B(0.30, 0.20, 0.075),  E_MAT.vest, 0, 1.30, -0.175);          // 前插板
  part(body, B(0.115, 0.115, 0.075), E_MAT.webb,  0.135, 1.13, -0.175);    // 弹匣袋
  part(body, B(0.115, 0.115, 0.075), E_MAT.webb,  0.0,   1.13, -0.178);
  part(body, B(0.115, 0.115, 0.075), E_MAT.webb, -0.135, 1.13, -0.175);
  part(body, B(0.20, 0.075, 0.06),  E_MAT.webb,   0, 1.44, -0.168);        // 电台
  part(body, B(0.075, 0.020, 0.020), E_MAT.accent, 0, 1.40, -0.196);       // IFF 频闪
  part(body, B(0.485, 0.115, 0.30), E_MAT.vest, 0, 1.48, -0.005);          // 肩托
  part(body, B(0.40, 0.10, 0.32),   E_MAT.webb, 0, 1.06, -0.005);          // 腰带
  part(body, B(0.11, 0.15, 0.09),   E_MAT.webb, 0.20, 1.02, -0.06);        // 跨包
  part(body, B(0.11, 0.15, 0.09),   E_MAT.webb, -0.20, 1.02, -0.06);
  part(body, B(0.30, 0.30, 0.16),   E_MAT.webb, 0, 1.34, 0.21);            // 背包
  part(body, B(0.11, 0.24, 0.10),   E_MAT.vest, 0.13, 1.36, 0.30);         // 卷毯

  /* ★ 躯干装备细节 */
  buildTorsoDetails(body);

  /* ---- 脖子 + 头部 ---- */
  part(body, CYL(0.062, 0.062, 0.10, 8), E_MAT.skin, 0, 1.53, 0);
  const head = new THREE.Group();
  head.position.set(0, 1.655, 0);
  body.add(head);

  /* ★ 面部 */
  buildFace(head);
  /* ★ 头盔 */
  buildHelmet(head);
  /* ★ 护目镜 */
  buildGoggles(head);
  /* ★ 面罩 */
  buildFaceMask(head);
  /* ★ 通讯装备 */
  buildComms(head);

  /* ---- 手臂 + 手 ---- */
  const rig = new THREE.Group();
  rig.position.set(0, 1.40, 0);
  body.add(rig);
  const arms = [];
  for (const s of [-1, 1]){
    const sh = new THREE.Group();
    sh.position.set(s * 0.275, 0.02, 0);
    rig.add(sh);
    part(sh, B(0.150, 0.135, 0.165), E_MAT.vest, 0, -0.035, 0);              // 肩甲
    part(sh, EB(0.135, 0.34, 0.145), E_MAT.cloth, 0, -0.17, 0);
    part(sh, B(0.140, 0.075, 0.150), E_MAT.vest, 0, -0.30, 0);              // 肘垫

    /* ★ 肩甲的肩带扣具 */
    part(sh, B(0.040, 0.024, 0.016), E_MAT.buckle, 0, -0.005, -0.080);

    const el = new THREE.Group();
    el.position.set(0, -0.34, 0);
    sh.add(el);
    part(el, EB(0.115, 0.30, 0.125), E_MAT.cloth, 0, -0.15, 0);
    /* ★ 前臂护具（战术护臂）*/
    part(el, B(0.128, 0.155, 0.138), E_MAT.vest, 0, -0.14, 0);
    /* 护臂上的绑带 */
    part(el, B(0.135, 0.012, 0.145), E_MAT.strap, 0, -0.09, 0);
    part(el, B(0.135, 0.012, 0.145), E_MAT.strap, 0, -0.19, 0);

    /* ★ 手部：用五指模型代替原来的盒子 */
    const hand = buildHand(el, s, 0.85);   // 战斗握拳姿态
    hand.position.set(0, -0.30, 0.010);

    arms.push({ sh, el });
  }

  /* ---- 武器 ---- */
  const gun = new THREE.Group();
  rig.add(gun);
  part(gun, B(0.065, 0.085, 0.34), E_MAT.gun, 0, 0, -0.10);
  part(gun, CYLZ(0.016, 0.016, 0.32, 8), E_MAT.gun, 0, 0.006, -0.40);
  part(gun, B(0.045, 0.14, 0.07), E_MAT.gun, 0, -0.10, -0.05);
  part(gun, B(0.05, 0.10, 0.06), E_MAT.gun, 0, -0.075, 0.05);
  part(gun, B(0.055, 0.075, 0.16), E_MAT.gun, 0, -0.005, 0.16);

  const gunMuzzle = new THREE.Object3D();
  gunMuzzle.position.set(0, 0.006, -0.56);
  gun.add(gunMuzzle);

  const k = (opt && opt.kind) || 'rifle';

  if (k === 'sniper'){
    gun.children.forEach(m => { m.visible = false; });
    part(gun, B(0.058, 0.082, 0.62), E_MAT.gun, 0, 0, -0.22);
    part(gun, CYLZ(0.013, 0.013, 0.72, 8), E_MAT.gun, 0, 0.004, -0.62);
    part(gun, CYLZ(0.030, 0.030, 0.10, 8), E_MAT.gun, 0, 0.004, -0.98);      // 制退器
    part(gun, CYLZ(0.038, 0.038, 0.30, 10), E_MAT.gun, 0, 0.088, -0.18);     // 瞄准镜
    part(gun, CYLZ(0.048, 0.048, 0.06, 10), E_MAT.glass, 0, 0.088, -0.33);   // 物镜
    part(gun, B(0.05, 0.11, 0.06), E_MAT.gun, 0, -0.09, -0.02);
    part(gun, B(0.05, 0.09, 0.20), E_MAT.gun, 0, -0.01, 0.18);
    gunMuzzle.position.set(0, 0.004, -1.02);
  } else if (k === 'flamer'){
    gun.children.forEach(m => { m.visible = false; });
    part(gun, B(0.075, 0.10, 0.40), E_MAT.gun, 0, 0, -0.12);                 // 喷枪体
    part(gun, CYLZ(0.028, 0.028, 0.34, 8), E_MAT.gun, 0, 0.004, -0.44);      // 喷嘴
    part(gun, CYLZ(0.046, 0.046, 0.07, 8), E_MAT.dark, 0, 0.004, -0.62);     // 点火罩
    part(gun, CYL(0.105, 0.105, 0.30, 12), E_MAT.vest, 0.02, -0.16, 0.10);   // 燃料罐 L
    part(gun, CYL(0.105, 0.105, 0.30, 12), E_MAT.vest, -0.02, -0.16, 0.10);  // 燃料罐 R
    part(gun, B(0.045, 0.11, 0.06), E_MAT.gun, 0, -0.10, -0.02);
    gunMuzzle.position.set(0, 0.004, -0.66);
  } else if (k === 'rusher'){
    gun.children.forEach(m => { m.visible = false; });
    part(gun, B(0.070, 0.095, 0.30), E_MAT.gun, 0, 0, -0.10);
    part(gun, CYLZ(0.026, 0.026, 0.26, 8), E_MAT.gun, 0, 0.004, -0.36);
    part(gun, CYLZ(0.030, 0.030, 0.14, 8), E_MAT.dark, 0, -0.052, -0.30);    // 管状弹匣
    part(gun, B(0.048, 0.12, 0.06), E_MAT.gun, 0, -0.09, -0.02);
    part(gun, B(0.05, 0.09, 0.14), E_MAT.gun, 0, -0.01, 0.14);
    gunMuzzle.position.set(0, 0.004, -0.50);
  }

  const gasMuzzle = new THREE.Object3D();
  gasMuzzle.position.copy(gunMuzzle.position);
  gun.add(gasMuzzle);

  /* ---- 命中盒 ---- */
  const hbHead = new THREE.Mesh(B(0.33, 0.34, 0.33), INVIS); hbHead.position.set(0, 1.66, 0); body.add(hbHead);
  const hbBody = new THREE.Mesh(B(0.62, 0.62, 0.42), INVIS); hbBody.position.set(0, 1.20, 0); body.add(hbBody);
  const hbLegs = new THREE.Mesh(B(0.55, 0.92, 0.36), INVIS); hbLegs.position.set(0, 0.46, 0); body.add(hbLegs);

  /* ---- 阶级信标 ---- */
  let beacon = null;
  const tier = (opt && opt.tier) || TIER.NORMAL;
  if (tier !== TIER.NORMAL){
    const col = tier === TIER.BOSS ? 0xff2f2f : ELITE.tint;
    const bm  = new THREE.MeshBasicMaterial({ color: col, fog: false });
    if (tier === TIER.BOSS){
      beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.115, 0), bm);
      beacon.position.set(0, 1.62, -0.10);
    } else {
      beacon = new THREE.Mesh(B(0.10, 0.10, 0.05), bm);
      beacon.position.set(0.20, 1.50, -0.16);
    }
    body.add(beacon);
  }

  const sc = (opt && opt.scale) ||
             (tier === TIER.BOSS ? 1.3 : tier === TIER.ELITE ? ELITE.scale : 1);
  if (sc !== 1) model.scale.setScalar(sc);

  model.traverse(o => {
    if (o.isMesh && o.material !== INVIS){ o.castShadow = true; o.receiveShadow = true; }
  });
  collapseRig(model);

  return {
    model, body, legs, arms, rig, gun, gunMuzzle, gasMuzzle, head,
    hbHead, hbBody, hbLegs, beacon, scale: sc
  };
}

/* --------------------------------------------------------------------------
   敌人血条
   -------------------------------------------------------------------------- */
let ENEMY_HP_MAX = 100;

function makeTag(name, friendly, tint){
  const c = document.createElement('canvas'); c.width = 256; c.height = 76;
  const NAME_COL = tint || (friendly ? '#7ee081' : '#e9eef3');
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;

  const mat = new THREE.SpriteMaterial({
    map: t, transparent: true, depthTest: true, depthWrite: false, fog: false
  });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(1.55, 0.46, 1);
  spr.position.y = 2.16;
  const ctx = c.getContext('2d');

  function draw(hp, alerted, armor, armorMax){
    ctx.clearRect(0, 0, 256, 76);

    ctx.font = 'bold 27px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,.85)';
    ctx.strokeText(name, 128, 22);
    ctx.fillStyle = alerted ? '#ff6a58' : NAME_COL;
    ctx.fillText(name, 128, 22);

    const bx = 40, bw = 176, by = 44, bh = 13;

    ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
    ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(bx, by, bw, bh);
    const f = clamp(hp / ENEMY_HP_MAX, 0, 1);
    ctx.fillStyle = f > 0.6 ? '#5fd06a' : (f > 0.28 ? '#ffb340' : '#ff3b30');
    ctx.fillRect(bx, by, bw * f, bh);
    ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(bx, by, bw * f, 3);
    ctx.strokeStyle = 'rgba(255,255,255,.42)'; ctx.lineWidth = 1.5; ctx.strokeRect(bx, by, bw, bh);
    for (let i = 1; i < 4; i++){
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(bx + bw * i / 4, by, 2, bh);
    }

    if (armor > 0 && armorMax > 0){
      const ay = 61, ah = 8;
      ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(bx - 2, ay - 2, bw + 4, ah + 4);
      ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(bx, ay, bw, ah);
      ctx.fillStyle = '#7cc0f5'; ctx.fillRect(bx, ay, bw * clamp(armor / armorMax, 0, 1), ah);
      ctx.fillStyle = 'rgba(255,255,255,.30)'; ctx.fillRect(bx, ay, bw * clamp(armor / armorMax, 0, 1), 2);
      ctx.strokeStyle = 'rgba(255,255,255,.34)'; ctx.lineWidth = 1; ctx.strokeRect(bx, ay, bw, ah);
    }

    t.needsUpdate = true;
  }

  draw(100, false);
  return { sprite: spr, draw, tex: t };
}