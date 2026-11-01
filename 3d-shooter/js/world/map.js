/* =========================================================================
   map.js
   60×60 废弃仓库区 —— 场地、围栏、建筑、集装箱、掩体、杂物、远景

   依赖：utils.js / renderer.js / textures.js / lighting.js /
         environment.js / weather.js
   暴露：HALF, colliders, worldSolid, groundMesh, ceilMesh, mapRects,
         CLUTTER_MAP, extraShadows, MAT, addCollider, instancedByColor, box,
         contactShadows
   ========================================================================= */
"use strict";

/* --------------------------------------------------------------------------
   全局容器

   这些数组是所有碰撞、射线、迷你地图的源头。
   queries.js 直接读它们做碰撞滑动与地面查询；
   enemy_ai.js 读 colliders 生成掩体锚点；
   hud.js 读 mapRects 画小地图。
   -------------------------------------------------------------------------- */
const HALF = 30;
const colliders  = [];   // 移动用的 AABB
const worldSolid = [];   // 子弹 / 视线用的可命中物体
const groundMesh = [];   // 向下射线（可站立面）
const ceilMesh   = [];   // 向上射线（头部碰撞）
const mapRects   = [];   // 迷你地图 footprint {x,z,w,d,c}

/* 小件的杂物读起来比结构更暗，好让迷你地图上仍能区分“能挡人”和“只挡脚” */
const CLUTTER_MAP = '#3f464d';
const extraShadows = []; // 无自身碰撞体但有投影的杂物 {x,z,hw,hd,s}

/* --------------------------------------------------------------------------
   材质表

   这里有一条重要的取舍：没有 IBL（环境贴图）时，metalness≈1 会渲染成近黑，
   只有窄窄的高光条。所以金属全部压在 0.6–0.8 之间，靠 roughness 出高光。
   -------------------------------------------------------------------------- */
const MAT = {
  floor    : new THREE.MeshStandardMaterial({ map: TEX.concrete,    roughness: .96, metalness: .02 }),
  concrete : new THREE.MeshStandardMaterial({ map: TEX_CONCRETE_1,  roughness: .95, metalness: .02 }),
  wall     : new THREE.MeshStandardMaterial({ map: TEX.wall,        roughness: .94, metalness: .03 }),
  container: new THREE.MeshStandardMaterial({ map: TEX.container,   roughness: .62, metalness: .10 }),
  crate    : new THREE.MeshStandardMaterial({ map: TEX.crate,       roughness: .92, metalness: .02 }),
  barrel   : new THREE.MeshStandardMaterial({ map: TEX.barrel,      roughness: .56, metalness: .12 }),
  metal    : new THREE.MeshStandardMaterial({ color: 0x8d949b,      roughness: .48, metalness: .16 }),
  darkMetal: new THREE.MeshStandardMaterial({ color: 0x4a5158,      roughness: .58, metalness: .14 }),
  rust     : new THREE.MeshStandardMaterial({ color: 0x7d4c2e,      roughness: .9,  metalness: .06 }),
  /* 炭黑和橡胶本质很暗，但在这套光照下纯黑会像画面被戳了个洞 —— 抬离底部 */
  charred  : new THREE.MeshStandardMaterial({ color: 0x44403b,      roughness: .94, metalness: .05 }),
  rubber   : new THREE.MeshStandardMaterial({ color: 0x31312f,      roughness: .98, metalness: .0  }),
  glassBroke: new THREE.MeshStandardMaterial({ color: 0x4a5c66,     roughness: .2,  metalness: .12,
                                               transparent: true, opacity: .35, side: THREE.DoubleSide }),
  /* alphaTest 压到 .34：远距离 mip 平均后仍能保住网格线。
     比这更松铁丝网就会整片消失。 */
  fence    : new THREE.MeshStandardMaterial({ map: TEX.fence, alphaTest: .34,
                                              side: THREE.DoubleSide, roughness: .72, metalness: .10,
                                              color: 0x71777d })
};
linearizeMats(MAT);

/* 天气反应（见 weather.js）：地面、平台、集装箱这类有水平顶面的给积水与涟漪；
   垂直面上出现水坑是不对的，其余只做“湿了变深变滑”和积雪。
   透明与 alphaTest 的两个不注入，免得和它们自己的剔除逻辑打架。 */
injectWeather(MAT.floor,     true);
injectWeather(MAT.concrete,  true);
injectWeather(MAT.container, true);
injectWeather(MAT.crate,     true);
injectWeather(MAT.wall,      false);
injectWeather(MAT.barrel,    false);
injectWeather(MAT.metal,     false);
injectWeather(MAT.darkMetal, false);
injectWeather(MAT.rust,      false);
injectWeather(MAT.charred,   false);
injectWeather(MAT.rubber,    false);

/* --------------------------------------------------------------------------
   建造辅助函数
   -------------------------------------------------------------------------- */

/** 添加一个 AABB 碰撞体。参数是中心 x/z 与底 y，不是角点。 */
function addCollider(x, y, z, w, h, d){
  colliders.push({
    minX: x - w/2, maxX: x + w/2,
    minY: y,       maxY: y + h,
    minZ: z - d/2, maxZ: z + d/2
  });
}

/**
 * 按颜色分桶的实例化

 * r128 里 USE_INSTANCING_COLOR 声明的 vColor 只在 USE_COLOR 下才会乘进 diffuse，
 * 所以直接 setColorAt() 是无效的。按材质颜色分桶是可靠的路子，仍然只产生几个 draw call。
 */
function instancedByColor(geo, baseMat, entries){
  const buckets = new Map();
  for (const e of entries){
    if (!buckets.has(e.color)) buckets.set(e.color, []);
    buckets.get(e.color).push(e);
  }
  const dummy = new THREE.Object3D();
  for (const [color, list] of buckets){
    const mat = baseMat.clone();
    mat.color = sRGB(color);
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    im.castShadow = im.receiveShadow = true;
    list.forEach((e, i) => {
      dummy.position.set(e.x, e.y, e.z);
      dummy.rotation.set(0, e.rotY || 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
    scene.add(im);
    worldSolid.push(im);
    groundMesh.push(im);
  }
}

/**
 * 通用带碰撞体的长方体

 * 语义：
 *   collide   默认 true —— 是否加入 colliders
 *   solid     默认 true —— 是否加入 worldSolid（子弹/视线）
 *   ground    默认 = collide —— 是否加入 groundMesh（可站立）
 *   ceiling   默认 false —— 是否加入 ceilMesh（头部碰撞）

 * ground 必须能显式覆盖：二楼楼板是 collide:false（它是地板不是墙），
 * 如果仍然按 collide 推导就会悄悄丢掉它，
 * 结果整块狙击平台、平台上的屋顶、集装箱上方的走道全部没有落脚点。
 */
function box(w, h, d, x, y, z, mat, opt){
  opt = opt || {};
  const g = new THREE.BoxGeometry(w, h, d);
  if (opt.uvScale){
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, uv.getX(i) * opt.uvScale[0], uv.getY(i) * opt.uvScale[1]);
  }
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y + h/2, z);
  if (opt.rotY) m.rotation.y = opt.rotY;
  m.castShadow = opt.cast !== false;
  m.receiveShadow = true;
  scene.add(m);

  if (opt.collide !== false) addCollider(x, y, z, w, h, d);
  if (opt.solid   !== false) worldSolid.push(m);

  const walkable = opt.ground !== undefined ? !!opt.ground : opt.collide !== false;
  if (walkable) groundMesh.push(m);
  if (opt.ceiling) ceilMesh.push(m);

  if (opt.map) mapRects.push({ x, z, w, d, c: opt.map });
  return m;
}

/* =========================================================================
   地面
   ========================================================================= */
{
  const g = new THREE.PlaneGeometry(HALF * 2 + 16, HALF * 2 + 16);
  g.rotateX(-PI / 2);
  const floor = new THREE.Mesh(g, MAT.floor);
  floor.receiveShadow = true;
  scene.add(floor);
  worldSolid.push(floor);
  groundMesh.push(floor);
}

/* =========================================================================
   场地印花层

   混凝土贴图重复 18×18 次，再细节也压不住这个重复。
   一张不重复的整幅覆盖做两件事：
     1. 用低频污渍打破重复
     2. 承载场地标线 —— 车位号、危险条纹、人行道、胎痕、油污
   这些是把“工地”和“灰色平面”区分开的东西。一张透明 draw call。
   ========================================================================= */
{
  const SPAN = HALF * 2 + 16, S = 2048, PPM = S / SPAN;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  const WX = wx => (wx + SPAN / 2) * PPM;
  const WZ = wz => (wz + SPAN / 2) * PPM;
  const M  = m  => m * PPM;

  /* ---- 低频污渍：打破贴图重复 ---- */
  for (let i = 0; i < 120; i++){
    const px = Math.random() * S, py = Math.random() * S, r = rand(60, 420);
    const g2 = x.createRadialGradient(px, py, 0, px, py, r);
    const dark = Math.random() < 0.72;
    const col = dark ? '26,25,23' : '150,148,142';
    g2.addColorStop(0, `rgba(${col},${dark ? rand(0.05, 0.20) : rand(0.03, 0.09)})`);
    g2.addColorStop(1, `rgba(${col},0)`);
    x.fillStyle = g2;
    x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
  }

  /* ---- 场地标线 ---- */
  const paint  = 'rgba(196,164,58,';      // 褪色黄
  const paintW = 'rgba(206,206,198,';     // 褪色白

  /* 仓库卷帘门前的危险条纹 */
  x.save();
  x.beginPath(); x.rect(WX(-15), WZ(-9), M(5.5), M(12)); x.clip();
  x.strokeStyle = paint + '0.75)'; x.lineWidth = M(0.42);
  for (let i = -14; i < 20; i++){
    x.beginPath();
    x.moveTo(WX(-15) + M(i * 0.9), WZ(-9));
    x.lineTo(WX(-15) + M(i * 0.9 + 5.5), WZ(3));
    x.stroke();
  }
  x.restore();

  /* 装货区框，东侧场地 */
  x.strokeStyle = paint + '0.7)'; x.lineWidth = M(0.22);
  x.strokeRect(WX(3), WZ(-9), M(16), M(17));
  x.lineWidth = M(0.14);
  for (let i = 1; i < 4; i++){
    x.beginPath(); x.moveTo(WX(3 + i * 4), WZ(-9)); x.lineTo(WX(3 + i * 4), WZ(8)); x.stroke();
  }
  x.fillStyle = paint + '0.60)';
  x.font = `bold ${M(2.0)}px "Arial Narrow", Arial, sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let i = 0; i < 4; i++) x.fillText('B' + (i + 1), WX(5 + i * 4), WZ(6.2));

  /* 南北向人行道 */
  x.strokeStyle = paintW + '0.30)'; x.lineWidth = M(0.16);
  x.beginPath(); x.moveTo(WX(-8.4), WZ(-26)); x.lineTo(WX(-8.4), WZ(26)); x.stroke();
  x.beginPath(); x.moveTo(WX(-6.0), WZ(-26)); x.lineTo(WX(-6.0), WZ(26)); x.stroke();

  /* 人行横道 */
  for (let z = -20; z <= -12; z += 1.6){
    x.fillStyle = paintW + '0.24)';
    x.fillRect(WX(-9.6), WZ(z), M(5.0), M(0.7));
  }

  /* 印花文字 */
  const stencil = (t, wx, wz, size, rot, al) => {
    x.save(); x.translate(WX(wx), WZ(wz)); x.rotate(rot);
    x.fillStyle = paintW + al + ')';
    x.font = `bold ${M(size)}px "Arial Narrow", Arial, sans-serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(t, 0, 0); x.restore();
  };
  stencil('NO PARKING', 12, 16, 1.6, 0, 0.34);
  stencil('KEEP CLEAR', -2, -20, 1.8, PI/2, 0.30);
  stencil('SECTOR 7',  20, -18, 2.4, 0.0, 0.26);
  stencil('DANGER — MOVING PLANT', 6, 22, 1.2, 0, 0.22);

  /* 大型方向箭头 */
  x.save(); x.translate(WX(16), WZ(4)); x.rotate(-PI / 2);
  x.fillStyle = paint + '0.40)';
  x.beginPath();
  x.moveTo(0, -M(2.4)); x.lineTo(M(1.5), -M(0.4)); x.lineTo(M(0.6), -M(0.4));
  x.lineTo(M(0.6), M(2.4)); x.lineTo(-M(0.6), M(2.4)); x.lineTo(-M(0.6), -M(0.4));
  x.lineTo(-M(1.5), -M(0.4)); x.closePath(); x.fill();
  x.restore();

  /* ---- 磨损：新漆在废弃场地上是穿帮 ---- */
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 420; i++){
    const px = Math.random() * S, py = Math.random() * S, r = rand(6, 64);
    const g2 = x.createRadialGradient(px, py, 0, px, py, r);
    g2.addColorStop(0, `rgba(0,0,0,${rand(0.25, 0.95)})`);
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g2;
    x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
  }
  x.globalCompositeOperation = 'source-over';

  /* ---- 胎痕：成对的暗色带穿过场地 ---- */
  for (let t = 0; t < 7; t++){
    const ax = rand(-30, 30), az = rand(-30, 30);
    const bx = ax + rand(-34, 34), bz = az + rand(-34, 34);
    const cx1 = (ax + bx) / 2 + rand(-16, 16), cz1 = (az + bz) / 2 + rand(-16, 16);
    for (const off of [-0.9, 0.9]){
      const nx = -(bz - az), nz = (bx - ax);
      const l = Math.hypot(nx, nz) || 1;
      x.strokeStyle = `rgba(30,28,26,${rand(0.10, 0.24)})`;
      x.lineWidth = M(rand(0.16, 0.30));
      x.beginPath();
      x.moveTo(WX(ax + nx/l * off), WZ(az + nz/l * off));
      x.quadraticCurveTo(WX(cx1 + nx/l * off), WZ(cz1 + nz/l * off),
                         WX(bx  + nx/l * off), WZ(bz  + nz/l * off));
      x.stroke();
    }
  }

  /* ---- 油污：核心最暗 ---- */
  for (let i = 0; i < 26; i++){
    const px = Math.random() * S, py = Math.random() * S, r = rand(14, 70);
    const g2 = x.createRadialGradient(px, py, 0, px, py, r);
    g2.addColorStop(0,    `rgba(12,11,10,${rand(0.35, 0.66)})`);
    g2.addColorStop(0.45, `rgba(18,17,15,${rand(0.18, 0.34)})`);
    g2.addColorStop(1,    'rgba(20,18,16,0)');
    x.fillStyle = g2;
    x.save(); x.translate(px, py); x.rotate(Math.random() * 7); x.scale(1, rand(0.5, 1.0));
    x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill(); x.restore();
    if (Math.random() < 0.5){
      x.strokeStyle = `rgba(14,13,12,${rand(0.15, 0.3)})`;
      x.lineWidth = rand(2, 6);
      x.beginPath(); x.moveTo(px, py);
      x.lineTo(px + rand(-60, 60), py + rand(-60, 60)); x.stroke();
    }
  }

  /* ---- 积水：暗、微蓝、软边 ---- */
  for (let i = 0; i < 16; i++){
    const px = Math.random() * S, py = Math.random() * S, r = rand(30, 120);
    const g2 = x.createRadialGradient(px, py, r * 0.3, px, py, r);
    g2.addColorStop(0,   `rgba(30,38,46,${rand(0.22, 0.40)})`);
    g2.addColorStop(0.8, `rgba(34,42,50,${rand(0.10, 0.20)})`);
    g2.addColorStop(1,   'rgba(34,42,50,0)');
    x.fillStyle = g2;
    x.save(); x.translate(px, py); x.rotate(Math.random() * 7); x.scale(rand(0.7, 1.5), rand(0.5, 1.0));
    x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill(); x.restore();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = MAXANISO;
  tex.encoding = THREE.sRGBEncoding;

  const og = new THREE.PlaneGeometry(SPAN, SPAN);
  og.rotateX(-PI / 2);
  const overlay = new THREE.Mesh(og, new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
  }));
  overlay.position.y = 0.008;
  overlay.renderOrder = 0;
  scene.add(overlay);
}

/* =========================================================================
   围栏 —— 硬碰撞 + 铁丝网视觉
   ========================================================================= */
{
  const H = 3.3;
  const fenceGeos = [];

  for (const side of [0, 1, 2, 3]){
    for (let i = -HALF; i < HALF; i += 5){
      const g = new THREE.PlaneGeometry(5, H);
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 3.0, uv.getY(k) * 2.0);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const pos = new THREE.Vector3();
      if (side === 0)      pos.set(i + 2.5, H / 2, -HALF);
      else if (side === 1){ q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), PI / 2); pos.set(HALF, H / 2, i + 2.5); }
      else if (side === 2) pos.set(i + 2.5, H / 2, HALF);
      else                 { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), PI / 2); pos.set(-HALF, H / 2, i + 2.5); }
      m.compose(pos, q, new THREE.Vector3(1, 1, 1));
      g.applyMatrix4(m);
      fenceGeos.push(g);
    }
  }
  const fence = new THREE.Mesh(mergeGeoms(fenceGeos), MAT.fence);
  fence.castShadow = false; fence.receiveShadow = false;
  scene.add(fence);
  worldSolid.push(fence);

  /* 立柱 */
  const postGeo = new THREE.CylinderGeometry(0.09, 0.09, H + 0.35, 7);
  const posts = [];
  for (let i = -HALF; i <= HALF; i += 5){
    posts.push([i, -HALF], [i, HALF], [-HALF, i], [HALF, i]);
  }
  const pm = new THREE.InstancedMesh(postGeo, MAT.darkMetal, posts.length);
  const dm = new THREE.Object3D();
  posts.forEach((p, i) => {
    dm.position.set(p[0], (H + 0.35) / 2, p[1]);
    dm.rotation.set(0, 0, 0); dm.scale.setScalar(1); dm.updateMatrix();
    pm.setMatrixAt(i, dm.matrix);
  });
  pm.castShadow = true;
  pm.instanceMatrix.needsUpdate = true;
  scene.add(pm);

  /* 顶部横梁、倾斜倒刺、三道铁丝。
     光秃秃的铁丝网读起来像渔网，顶部那些五金件才是“这是隔离带”的关键。 */
  {
    const rails = [], arms = [], wires = [];
    const railGeo = new THREE.CylinderGeometry(0.055, 0.055, HALF * 2, 6);
    railGeo.rotateZ(PI / 2);
    const armGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.62, 5);

    for (const side of [0, 1, 2, 3]){
      const along = (side === 0 || side === 2);
      const fixed = (side === 0 || side === 3) ? -HALF : HALF;

      const r = railGeo.clone();
      const mm = new THREE.Matrix4();
      if (along) mm.makeTranslation(0, H + 0.10, side === 0 ? -HALF : HALF);
      else { mm.makeRotationY(PI / 2); mm.setPosition(side === 3 ? -HALF : HALF, H + 0.10, 0); }
      r.applyMatrix4(mm);
      rails.push(r);

      /* 倒刺：每 5m 一根，向内倾 */
      for (let i = -HALF; i <= HALF; i += 5){
        const a = armGeo.clone();
        const inward = (side === 0 || side === 3) ? 1 : -1;
        const rot = new THREE.Matrix4().makeRotationX(inward * 0.62);
        if (!along) rot.multiplyMatrices(new THREE.Matrix4().makeRotationY(PI / 2),
                                          new THREE.Matrix4().makeRotationX(inward * 0.62));
        a.applyMatrix4(rot);
        const t = new THREE.Matrix4().makeTranslation(
          along ? i : fixed,
          H + 0.36,
          along ? (side === 0 ? -HALF : HALF) : i);
        a.applyMatrix4(t);
        arms.push(a);
      }

      /* 倒刺上的三道铁丝 */
      for (let k = 0; k < 3; k++){
        const yOff = 0.30 + k * 0.13;
        const zOff = (0.10 + k * 0.14) * ((side === 0 || side === 3) ? 1 : -1);
        const w = new THREE.CylinderGeometry(0.018, 0.018, HALF * 2, 4);
        w.rotateZ(PI / 2);
        const mw = new THREE.Matrix4();
        if (along) mw.makeTranslation(0, H + 0.30 + yOff, (side === 0 ? -HALF : HALF) + zOff);
        else { mw.makeRotationY(PI / 2); mw.setPosition((side === 3 ? -HALF : HALF) + zOff, H + 0.30 + yOff, 0); }
        w.applyMatrix4(mw);
        wires.push(w);
      }
    }

    const railMesh = new THREE.Mesh(mergeGeoms(rails.concat(arms)), MAT.darkMetal);
    railMesh.castShadow = true;
    scene.add(railMesh);

    const wireMesh = new THREE.Mesh(mergeGeoms(wires), MAT.metal);
    wireMesh.castShadow = false;
    scene.add(wireMesh);
  }

  /* 隐形外墙 —— 不允许任何人跑出场地 */
  const invis = new THREE.MeshBasicMaterial({ visible: false });
  const t = 1.2;
  [[0, -HALF - t/2, HALF * 2 + t * 2, t], [0, HALF + t/2, HALF * 2 + t * 2, t]].forEach(([x, z, w, d]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 12, d), invis);
    m.position.set(x, 6, z);
    scene.add(m); worldSolid.push(m);
    addCollider(x, 0, z, w, 12, d);
  });
  [[-HALF - t/2, 0, t, HALF * 2 + t * 2], [HALF + t/2, 0, t, HALF * 2 + t * 2]].forEach(([x, z, w, d]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 12, d), invis);
    m.position.set(x, 6, z);
    scene.add(m); worldSolid.push(m);
    addCollider(x, 0, z, w, 12, d);
  });
}

/* =========================================================================
   两层仓库（西侧）—— 狙击平台
   ========================================================================= */
{
  const X0 = -29, X1 = -15, Z0 = -14, Z1 = 6;
  const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2, W = X1 - X0, D = Z1 - Z0;
  const DECK = 4.42;

  /* 西墙与北墙实墙 */
  box(0.6, 9.5, D + 0.6, X0, 0, cz, MAT.wall, { uvScale: [5.2, 2.4], map: '#3b4147' });
  box(W + 0.6, 9.5, 0.6, cx, 0, Z0, MAT.wall, { uvScale: [3.7, 2.4], map: '#3b4147' });
  /* 部分南墙（给坡道口留空） */
  box(6.2, 9.5, 0.6, X0 + 3.4, 0, Z1, MAT.wall, { uvScale: [1.6, 2.4], map: '#3b4147' });

  /* 一层立柱（沿开放东面） */
  for (let z = Z0 + 2.4; z <= Z1 - 1.4; z += 4.4)
    box(0.7, 4.0, 0.7, X1 - 0.5, 0, z, MAT.concrete, { uvScale: [.2, 1], map: '#3b4147' });
  box(0.7, 4.0, 0.7, X0 + 3.5, 0, Z1 - 0.6, MAT.concrete, { uvScale: [.2, 1] });

  /* 二楼楼板：可站立、是天护顶，但不是墙 */
  box(W, 0.42, D, cx, 4.0, cz, MAT.concrete,
      { uvScale: [3.5, 5.0], collide: false, ground: true, ceiling: true, map: '#4a525a' });

  /* 栏杆 —— 南边留开口给坡道 */
  box(7.5, 1.05, 0.24, -25.25, DECK, Z1 - 0.15, MAT.darkMetal);
  box(1.7, 1.05, 0.24, -15.85, DECK, Z1 - 0.15, MAT.darkMetal);
  box(0.24, 1.05, 12.0, X1 - 0.15, DECK, Z0 + 6.4, MAT.darkMetal);
  box(0.24, 1.05, 4.4,  X1 - 0.15, DECK, Z1 - 2.4, MAT.darkMetal);
  /* 平台上的沙袋掩体 */
  box(2.6, 0.95, 0.5, X1 - 2.2, DECK, Z0 + 3.0, MAT.rust);
  box(0.5, 0.95, 2.4, X1 - 4.6, DECK, Z0 + 7.4, MAT.rust);

  /* 上层墙体 + 半幅屋顶 */
  box(0.6, 5.0, D + 0.6, X0, DECK, cz, MAT.wall, { uvScale: [5.2, 1.25] });
  box(W + 0.6, 5.0, 0.6, cx, DECK, Z0, MAT.wall, { uvScale: [3.7, 1.25] });
  for (let z = Z0 + 2; z <= Z1 - 2; z += 4.2)
    box(0.5, 3.4, 0.5, X0 + 7.2, DECK, z, MAT.concrete, { uvScale: [.15, .85] });
  box(8.0, 0.4, D + 0.4, X0 + 3.9, 7.82, cz, MAT.concrete,
      { uvScale: [2, 5.1], collide: false, ground: true });

  /* 上层西墙上的窗洞 */
  for (let z = Z0 + 3; z < Z1 - 1; z += 4.0)
    box(0.9, 1.5, 1.7, X0 + 0.35, 5.6, z, MAT.glassBroke, { collide: false, solid: false, cast: false });

  /* =====================================================================
     ★ 上坡坡道：修复版

     改动：
       1. 加宽到 5.0 米，好走
       2. 删掉那堵 4.2 米高、横在坡顶前 0.15 米的「北端封口」矮墙
          —— 它原本会卡住玩家（脚在坡面 4.08 米时撞上 4.2 米的墙）
       3. ★ 新增：坡顶过渡平台 —— 楔形挤出体在坡顶是一条线（无水平面），
          玩家走到顶会踩空，平台补上落脚点，并跨过坡顶与楼板南边缘
       4. 坡底加黄黑警示条、两侧加低护栏、坡顶加过渡板
     ===================================================================== */
  const rampLen = 9.5, rampW = 5.0;
  const sh = new THREE.Shape();
  sh.moveTo(0, 0); sh.lineTo(rampLen, 0); sh.lineTo(rampLen, DECK); sh.lineTo(0, 0);
  const rg = new THREE.ExtrudeGeometry(sh, { depth: rampW, bevelEnabled: false });
  rg.rotateY(PI);
  rg.rotateY(-PI / 2);
  rg.computeVertexNormals();
  {                                                  // extrude UV 是世界单位
    const uv = rg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.25, uv.getY(i) * 0.25);
  }
  const RX = -21.2, RZ = 15.2;                       // 与楼板边缘重叠 0.3
  const ramp = new THREE.Mesh(rg, MAT.concrete);
  ramp.position.set(RX, 0, RZ);
  ramp.castShadow = ramp.receiveShadow = true;
  scene.add(ramp);
  worldSolid.push(ramp);
  groundMesh.push(ramp);
  mapRects.push({ x: RX + rampW / 2, z: RZ - rampLen / 2, w: rampW, d: rampLen, c: '#5d666e' });

  /* ★★ 坡顶过渡平台 ★★
     楔形挤出体在坡顶只是一条线，玩家走到顶会踩空。
     这块板补上落脚点：顶面正好在 DECK 高度，深 1.4 米，
     跨过坡顶（z = 5.7）和楼板南边缘（z = 6），衔接两处。
     collide: false 防止挡住从下方爬坡的玩家。 */
  box(rampW + 0.4, 0.42, 1.4,
      RX + rampW / 2, DECK - 0.42, RZ - rampLen + 0.6,
      MAT.concrete,
      { uvScale: [1.5, 0.5], ground: true, ceiling: false, collide: false, map: '#5d666e' });

  /* 两侧封墙：只比坡顶高一点，用来挡住从侧面翻越的玩家 */
  addCollider(RX - 0.12,        0, RZ - rampLen / 2, 0.26, DECK + 0.3, rampLen);
  addCollider(RX + rampW + 0.12, 0, RZ - rampLen / 2, 0.26, DECK + 0.3, rampLen);

  /* 斜坡扶手 —— 从坡底到坡顶连贯不断 */
  const rampAng = Math.atan2(DECK, rampLen), hyp = Math.hypot(rampLen, DECK);
  for (const sx of [RX - 0.10, RX + rampW + 0.10]){
    for (const rise of [0.50, 0.98]){
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, hyp), MAT.darkMetal);
      r.position.set(sx, DECK / 2 + rise, RZ - rampLen / 2);
      r.rotation.x = rampAng;
      r.castShadow = true;
      scene.add(r);
    }
    /* 扶手立柱：每 2 米一根 */
    const n = Math.ceil(hyp / 2);
    for (let i = 0; i <= n; i++){
      const t = i / n;
      const pz = RZ - t * rampLen;
      const py = t * DECK;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.05, 0.08), MAT.darkMetal);
      post.position.set(sx, py + 0.55, pz);
      post.castShadow = true;
      scene.add(post);
    }
  }

  /* 坡底黄黑警示条 —— 提示"这里是入口" */
  {
    const stripeLen = rampW - 0.5;
    const stripeG = new THREE.PlaneGeometry(stripeLen, 0.5);
    stripeG.rotateX(-PI / 2);
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 32;
    const sc = canvas.getContext('2d');
    for (let i = 0; i < 16; i++){
      sc.fillStyle = (i % 2 === 0) ? '#c4a43a' : '#1a1a1a';
      sc.fillRect(i * 16, 0, 16, 32);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = MAXANISO;
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(3, 1);
    const stripe = new THREE.Mesh(stripeG, new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5
    }));
    stripe.position.set(RX + rampW / 2, 0.016, RZ + 0.9);
    scene.add(stripe);
  }

  /* -----------------------------------------------------------------------
     建筑内装：卷帘门、管线、标识、屋顶设备。
     纯装饰，不改动任何碰撞。
     ----------------------------------------------------------------------- */
  const deco = [];
  const decoMats = new Map();
  const dput = (geo, mat, mtx) => {
    const g = geo.clone(); g.applyMatrix4(mtx);
    if (!decoMats.has(mat)) decoMats.set(mat, []);
    decoMats.get(mat).push(g);
  };
  const T3 = (x, y, z, sx, sy, sz, ry) => new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry || 0, 0)),
    new THREE.Vector3(sx, sy, sz));
  const Bx = new THREE.BoxGeometry(1, 1, 1);
  const Cy = new THREE.CylinderGeometry(1, 1, 1, 10);

  const MSHUT = new THREE.MeshStandardMaterial({ color: sRGB(0x7c7f7f), roughness: .62, metalness: .20 });
  const MPIPE = new THREE.MeshStandardMaterial({ color: sRGB(0x4d5257), roughness: .66, metalness: .16 });
  const MTRIM = new THREE.MeshStandardMaterial({ color: sRGB(0x3a3f44), roughness: .70, metalness: .14 });
  const MVENT = new THREE.MeshStandardMaterial({ color: sRGB(0x8b8d8a), roughness: .58, metalness: .20 });

  /* 卷帘门，北墙，面向场地 */
  {
    const sx = cx + 1.6, sy = 0, sz = Z0 - 0.32;
    dput(Bx, MTRIM, T3(sx, 1.7, sz - 0.06, 5.0, 3.4, 0.14));
    for (let i = 0; i < 17; i++)
      dput(Bx, MSHUT, T3(sx, 0.24 + i * 0.19, sz - 0.14, 4.7, 0.155, 0.09));
    dput(Bx, MTRIM, T3(sx, 3.44, sz - 0.16, 5.2, 0.30, 0.24));
    dput(Bx, MTRIM, T3(sx - 3.1, 3.0, sz - 0.10, 0.9, 0.6, 0.06));
  }

  /* 管线：北、东立面 */
  for (const [px, pz, ry] of [[X0 + 2.2, Z0 - 0.34, 0], [X0 + 10.6, Z0 - 0.34, 0], [X1 + 0.34, Z0 + 4.0, PI / 2]]){
    dput(Cy, MPIPE, T3(px, 4.4, pz, 0.055, 8.8, 0.055, ry));
    dput(Bx, MPIPE, T3(px, 2.1, pz + (ry ? 0.0 : -0.02), 0.26, 0.34, 0.18, ry));
    dput(Bx, MPIPE, T3(px, 6.2, pz + (ry ? 0.0 : -0.02), 0.22, 0.28, 0.16, ry));
    for (let y = 1.0; y < 9.0; y += 1.6)
      dput(Bx, MTRIM, T3(px, y, pz, 0.13, 0.06, 0.13, ry));
  }
  /* 落水管 + 屋顶集水斗 */
  {
    const px = X0 + 13.2, pz = Z0 - 0.36;
    dput(Cy, MPIPE, T3(px, 4.6, pz, 0.08, 9.2, 0.08));
    dput(Bx, MPIPE, T3(px, 9.35, pz, 0.34, 0.36, 0.28));
    dput(Cy, MPIPE, T3(px, 0.24, pz + 0.16, 0.08, 0.5, 0.08));
  }

  /* 面向场地的壁挂泛光灯 */
  for (const [px, py, pz] of [[X0 + 3.0, 8.4, Z0 - 0.4], [X0 + 11.0, 8.4, Z0 - 0.4]]){
    dput(Bx, MTRIM, T3(px, py, pz, 0.14, 0.14, 0.5));
    dput(Bx, MVENT, T3(px, py - 0.28, pz - 0.34, 0.62, 0.44, 0.30));
  }

  /* 高处排风扇 */
  for (let i = 0; i < 3; i++){
    const px = X0 + 3.4 + i * 3.8;
    const fan = new THREE.CylinderGeometry(0.52, 0.52, 0.24, 12);
    fan.rotateX(PI / 2);
    dput(fan, MVENT, T3(px, 7.6, Z0 - 0.40, 1, 1, 1));
    for (let b = 0; b < 4; b++){
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(px, 7.6, Z0 - 0.52),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, b * PI / 4 + 0.3)),
        new THREE.Vector3(0.86, 0.09, 0.06));
      dput(Bx, MTRIM, m);
    }
  }

  /* 屋顶压型钢板与设备 */
  {
    const rx = X0 + 3.9, ry0 = 8.04, rz = cz, rw = 8.0, rd = D + 0.4;
    for (let i = 0; i < Math.floor(rw / 0.42); i++)
      dput(Bx, MVENT, T3(rx - rw/2 + 0.21 + i * 0.42, ry0, rz, 0.16, 0.09, rd));
    dput(Bx, MTRIM, T3(rx, ry0 + 0.16, rz - rd/2 + 0.1, rw, 0.42, 0.2));
    dput(Bx, MTRIM, T3(rx, ry0 + 0.16, rz + rd/2 - 0.1, rw, 0.42, 0.2));
    dput(Bx, MTRIM, T3(rx - rw/2 + 0.1, ry0 + 0.16, rz, 0.2, 0.42, rd));
    dput(Bx, MVENT, T3(rx - 1.6, ry0 + 0.55, rz - 3.2, 1.5, 1.0, 1.5));
    dput(Cy, MVENT, T3(rx - 1.6, ry0 + 1.15, rz - 3.2, 0.55, 0.22, 0.55));
    dput(Bx, MVENT, T3(rx + 1.4, ry0 + 0.40, rz + 2.4, 1.0, 0.7, 1.8));
    dput(Cy, MPIPE, T3(rx + 2.6, ry0 + 0.9, rz - 1.0, 0.16, 1.7, 0.16));
  }

  for (const [mat, geos] of decoMats){
    const m = new THREE.Mesh(mergeGeoms(geos), mat);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    worldSolid.push(m);
  }

  /* 墙面彩绘标识 —— 地图上唯一一处大字排版 */
  {
    const SW = 1024, SH = 256;
    const sc = document.createElement('canvas'); sc.width = SW; sc.height = SH;
    const sx2 = sc.getContext('2d');
    sx2.fillStyle = 'rgba(212,206,192,0.90)';
    sx2.font = 'bold 118px "Arial Narrow", Arial, sans-serif';
    sx2.textAlign = 'center'; sx2.textBaseline = 'middle';
    sx2.fillText('IRONHOLD', SW / 2, 84);
    sx2.font = 'bold 52px "Arial Narrow", Arial, sans-serif';
    sx2.fillStyle = 'rgba(206,166,60,0.85)';
    sx2.fillText('LOGISTICS   ·   TERMINAL 7', SW / 2, 168);
    sx2.strokeStyle = 'rgba(206,166,60,0.5)';
    sx2.lineWidth = 5;
    sx2.beginPath(); sx2.moveTo(180, 212); sx2.lineTo(SW - 180, 212); sx2.stroke();

    /* 重度做旧 —— 废弃墙上新漆是穿帮 */
    sx2.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 300; i++){
      const px = rand(0, SW), py = rand(0, SH), r = rand(6, 54);
      const g2 = sx2.createRadialGradient(px, py, 0, px, py, r);
      g2.addColorStop(0, `rgba(0,0,0,${rand(0.2, 0.95)})`);
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      sx2.fillStyle = g2;
      sx2.beginPath(); sx2.arc(px, py, r, 0, 7); sx2.fill();
    }

    const st = new THREE.CanvasTexture(sc);
    st.anisotropy = MAXANISO;
    st.encoding = THREE.sRGBEncoding;
    const sg = new THREE.PlaneGeometry(11.5, 2.9);
    const sm = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({
      map: st, transparent: true, roughness: .95, metalness: 0,
      side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3
    }));
    sm.position.set(cx + 0.4, 6.4, Z0 - 0.33);
    sm.rotation.y = PI;
    scene.add(sm);
  }
}

/* =========================================================================
   集装箱
   颜色向灰拉 —— 一个饱和的集装箱场看起来像玩具箱。
   这些是给中灰瓦楞图上色，所以这里的 sRGB 值落到屏幕上大约暗 40%。
   把它们当成色卡，不是最终像素。
   ========================================================================= */
const CONTAINER_COLORS = [0xa85748, 0x53718c, 0x707f56, 0xab8a3f, 0x8b9096, 0x7e5243, 0x4f6f69];
{
  const CW = 2.7, CH = 2.85, CL = 9.0;
  const geo = new THREE.BoxGeometry(CW, CH, CL);
  {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2.4, uv.getY(i) * 1.0);
  }
  const list = [
    /* 东侧走廊 —— 两排南北向，位置对齐让通道笔直通畅 */
    [12.6, 0, -20], [12.6, 0, -10], [12.6, 0, 0], [12.6, 0, 10], [12.6, 0, 20],
    [19.4, 0, -20], [19.4, 0, -10], [19.4, 0, 0], [19.4, 0, 10], [19.4, 0, 20],
    /* 走廊里只叠一层，打破视线又不至于形成整面高墙 */
    [19.4, CH, 0],
    /* 散落掩体 —— 兼顾层次感与出生点视野 */
    [-4.5, 0, -21.5],       // 北侧
    [-13.0, 0, -4.0],       // 西侧
    [-18.0, 0, 14.0],       // 西北
    [24.0, 0, -3.0], [24.0, 0, 8.0],   // 东侧靠墙但不贴围栏
    [6.5, 0, 18.0],         // 出生点前方偏右的观察掩体
    [-9.0, 0, 21.0],        // 出生点左后方
    [17.0, 0, -24.0]        // 北侧偏东
  ];
  const entries = list.map((p, i) => {
    const rotY = (i >= 11) ? (i % 2 === 0 ? PI / 2 : 0) : 0;
    const w = rotY === 0 ? CW : CL;
    const l = rotY === 0 ? CL : CW;
    addCollider(p[0], p[1], p[2], w, CH, l);
    mapRects.push({ x: p[0], z: p[2], w, d: l, c: '#5a6068' });
    return { x: p[0], y: p[1] + CH / 2, z: p[2], rotY, color: CONTAINER_COLORS[i % CONTAINER_COLORS.length] };
  });
  instancedByColor(geo, MAT.container, entries);

  /* ---- 序列号贴花 ----
     一个 4×6 图集给每个集装箱分配自己的编号，不需要每个箱子一张贴图，
     整组贴花合并成一次 alpha-test 绘制。 */
  {
    const COLS = 4, ROWS = 6, CELLS = COLS * ROWS, CW2 = 512, CH2 = 256;
    const AW = COLS * CW2, AH = ROWS * CH2;
    const ac = document.createElement('canvas'); ac.width = AW; ac.height = AH;
    const ax = ac.getContext('2d');
    const owners = ['MAEU', 'TGHU', 'CSQU', 'HLXU', 'MSCU', 'OOLU', 'TCNU', 'GESU', 'APZU', 'DFSU',
                    'FCIU', 'TRLU', 'SEGU', 'CAIU', 'BEAU', 'WHLU'];
    for (let cell = 0; cell < CELLS; cell++){
      const ox = (cell % COLS) * CW2, oy = ((cell / COLS) | 0) * CH2;
      ax.save(); ax.translate(ox, oy);
      ax.fillStyle = 'rgba(228,228,224,0.74)';
      ax.font = 'bold 52px "Arial Narrow", Arial, sans-serif';
      ax.textAlign = 'left'; ax.textBaseline = 'alphabetic';
      ax.fillText(pick(owners) + ' ' + randI(100, 999) + ' ' + randI(100, 999) + '-' + randI(0, 9), 22, 58);
      ax.font = 'bold 28px "Arial Narrow", Arial, sans-serif';
      ax.fillStyle = 'rgba(232,232,228,0.60)';
      ax.fillText(pick(['45 G1', '22 G1', '42 G1', '45 R1', '22 U1']), 22, 94);
      ax.font = 'bold 19px "Arial Narrow", Arial, sans-serif';
      ax.fillStyle = 'rgba(228,228,224,0.38)';
      ax.fillText('MAX GROSS  ' + randI(28, 32) + ',480 KG', 22, 124);
      ax.fillText('TARE        ' + randI(3, 4) + ',' + randI(100, 990) + ' KG', 22, 148);
      ax.fillText('CU CAP      ' + randI(60, 86) + '.' + randI(1, 9) + ' CU M', 22, 172);

      /* CSC 铭牌 */
      ax.strokeStyle = 'rgba(228,228,224,0.40)'; ax.lineWidth = 3;
      ax.strokeRect(CW2 - 176, 34, 150, 96);
      ax.fillStyle = 'rgba(228,228,224,0.32)';
      ax.font = 'bold 18px monospace';
      ax.fillText('CSC SAFETY', CW2 - 166, 62);
      ax.fillText('APPROVAL',   CW2 - 166, 86);
      ax.fillText('GB/' + randI(1000, 9999), CW2 - 166, 112);

      /* 做旧 */
      ax.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 70; i++){
        const px = rand(0, CW2), py = rand(0, CH2), r = rand(4, 26);
        const g2 = ax.createRadialGradient(px, py, 0, px, py, r);
        g2.addColorStop(0, `rgba(0,0,0,${rand(0.2, 0.9)})`);
        g2.addColorStop(1, 'rgba(0,0,0,0)');
        ax.fillStyle = g2;
        ax.beginPath(); ax.arc(px, py, r, 0, 7); ax.fill();
      }
      ax.globalCompositeOperation = 'source-over';
      ax.restore();
    }
    const atlas = new THREE.CanvasTexture(ac);
    atlas.anisotropy = MAXANISO;
    atlas.encoding = THREE.sRGBEncoding;

    /* 真实船东代号块约 2.4m 宽、0.3m 字高，位置偏上、偏向一端 ——
       再大就读成广告牌了。 */
    const DW = 2.7, DH = 1.35;
    const parts = [];
    const order = entries.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--){
      const j = randI(0, i);
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    entries.forEach((e, i) => {
      const cell = order[i] % CELLS;
      const u0 = (cell % COLS) / COLS, v0 = 1 - (((cell / COLS) | 0) + 1) / ROWS;
      for (const s of [1, -1]){
        const q = new THREE.PlaneGeometry(DW, DH);
        const uv = q.attributes.uv;
        for (let k = 0; k < uv.count; k++)
          uv.setXY(k, u0 + uv.getX(k) / COLS, v0 + uv.getY(k) / ROWS);
        const mtx = new THREE.Matrix4();
        const rot = new THREE.Matrix4().makeRotationY(e.rotY + s * PI / 2);
        const local = new THREE.Vector3(s * (CW / 2 + 0.012), 0.60, s * -2.55);
        local.applyAxisAngle(new THREE.Vector3(0, 1, 0), e.rotY);
        mtx.multiplyMatrices(
          new THREE.Matrix4().makeTranslation(e.x + local.x, e.y + local.y, e.z + local.z),
          rot);
        q.applyMatrix4(mtx);
        parts.push(q);
      }
    });
    const dec = new THREE.Mesh(mergeGeoms(parts), new THREE.MeshStandardMaterial({
      map: atlas, transparent: true, alphaTest: 0.06, roughness: 0.85, metalness: 0.0,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide
    }));
    dec.castShadow = false;
    dec.receiveShadow = true;
    scene.add(dec);
  }
}

/* =========================================================================
   警卫室（东北）
   ========================================================================= */
{
  const x = 25.0, z = -14.0;
  box(6.4, 0.25, 6.4, x, 0, z, MAT.concrete, { uvScale: [2, 2], collide: false, ground: true });
  box(6.4, 3.2, 0.35, x, 0.25, z - 3.0, MAT.wall, { uvScale: [2, 1], map: '#3b4147' });
  box(0.35, 3.2, 6.4, x - 3.0, 0.25, z, MAT.wall, { uvScale: [2, 1], map: '#3b4147' });
  box(0.35, 3.2, 6.4, x + 3.0, 0.25, z, MAT.wall, { uvScale: [2, 1], map: '#3b4147' });
  box(2.0, 3.2, 0.35, x - 2.2, 0.25, z + 3.0, MAT.wall, { uvScale: [.8, 1], map: '#3b4147' });
  box(6.6, 0.3, 6.6, x, 3.45, z, MAT.darkMetal, { collide: false, ground: true, ceiling: true });
  box(2.4, 1.4, 0.2, x + 1.2, 1.5, z + 3.0, MAT.glassBroke, { collide: false, solid: false, cast: false });
}

/* =========================================================================
   混凝土隔离墩
   ========================================================================= */
{
  const g = new THREE.BoxGeometry(2.5, 1.05, 0.55);
  const list = [
    [-2, 0, -8, 0], [1.2, 0, -8, 0], [6.5, 0, 4.5, PI/2], [6.5, 0, 7.4, PI/2],
    [-16, 0, 18, 0], [-13, 0, 18, 0], [9.5, 0, -15, PI/2], [9.5, 0, -12.2, PI/2],
    [-24, 0, -22, 0], [-21, 0, -22, 0], [17, 0, -26, 0], [20, 0, -26, 0],
    /* 出生点庇护 —— 左右各一块，中间留 3 米通道 */
    [-2.8, 0, 19.5, 0], [2.8, 0, 19.5, 0]
  ];
  const im = new THREE.InstancedMesh(g, MAT.concrete, list.length);
  im.castShadow = im.receiveShadow = true;
  const d = new THREE.Object3D();
  list.forEach((p, i) => {
    d.position.set(p[0], 0.525, p[2]);
    d.rotation.set(0, p[3], 0);
    d.scale.setScalar(1);
    d.updateMatrix();
    im.setMatrixAt(i, d.matrix);
    const w = p[3] === 0 ? 2.5 : 0.55;
    const l = p[3] === 0 ? 0.55 : 2.5;
    addCollider(p[0], 0, p[2], w, 1.05, l);
    mapRects.push({ x: p[0], z: p[2], w, d: l, c: '#4e555c' });
  });
  im.instanceMatrix.needsUpdate = true;
  scene.add(im);
  worldSolid.push(im);
  groundMesh.push(im);
}

/* =========================================================================
   长隔墙（留缺口）
   ========================================================================= */
{
  box(0.6, 3.6, 9.0, -8.0, 0, -20.0, MAT.wall, { uvScale: [3, 1.5], map: '#3b4147' });
  box(0.6, 3.6, 6.0, -8.0, 0, -8.0,  MAT.wall, { uvScale: [2, 1.5], map: '#3b4147' });
  box(0.6, 1.1, 3.2, -8.0, 0, -14.0, MAT.concrete, { uvScale: [1, .5], map: '#3b4147' });
}

/* =========================================================================
   木箱（实例化，含叠放）
   ========================================================================= */
{
  const S = 1.25;
  const g = new THREE.BoxGeometry(S, S, S);
  const list = [];
  const clusters = [
    [-3.5, -3.0], [16.0, 4.6], [16.0, -5.2], [-13.0, 10.0], [8.0, -20.0],
    [22.0, 14.0], [-20.0, -6.0], [5.5, 27.0], [-25.5, 24.0], [27.0, -24.0], [-2.0, 12.0], [16.0, -22.0]
  ];
  for (const [cx, cz] of clusters){
    const n = randI(2, 4);
    for (let i = 0; i < n; i++){
      const x = cx + rand(-1.3, 1.3), z = cz + rand(-1.3, 1.3);
      list.push([x, 0, z, rand(0, PI)]);
      if (Math.random() < 0.45) list.push([x + rand(-.25, .25), S, z + rand(-.25, .25), rand(0, PI)]);
    }
  }
  const CRATE_TINTS = [0xd8c39c, 0xc2a679, 0xa98d64, 0xe0cfae];
  const entries = list.map((p, i) => {
    addCollider(p[0], p[1], p[2], S * 1.25, S, S * 1.25);
    if (p[1] === 0) mapRects.push({ x: p[0], z: p[2], w: S, d: S, c: '#4a4238' });
    return { x: p[0], y: p[1] + S / 2, z: p[2], rotY: p[3], color: CRATE_TINTS[i % CRATE_TINTS.length] };
  });
  instancedByColor(g, MAT.crate, entries);
}

/* =========================================================================
   油桶堆
   ========================================================================= */
{
  const R = 0.36, H = 0.95;
  const g = new THREE.CylinderGeometry(R, R, H, 14, 1);
  const list = [];
  const stacks = [
    [6.5, -12.5], [-6.0, 14.0], [8.5, 16.5], [-10.5, -20.5], [24.0, -24.5], [4.5, 23.5],
    [-17.0, 2.0], [13.5, -2.5], [-27.0, 14.0], [21.0, 10.0]
  ];
  for (const [cx, cz] of stacks){
    const n = randI(3, 5);
    for (let i = 0; i < n; i++){
      const a = (i / n) * 7 + rand(-.4, .4), rr = rand(0.3, 0.62);
      list.push([cx + Math.cos(a) * rr, 0, cz + Math.sin(a) * rr]);
    }
    if (Math.random() < 0.7) list.push([cx + rand(-.2, .2), H, cz + rand(-.2, .2)]);
  }
  const BARREL_TINTS = [0xb8402c, 0x6f7d64, 0x7d8288, 0x8a6a3c];
  const entries = list.map(p => {
    addCollider(p[0], p[1], p[2], R * 2.1, H, R * 2.1);
    if (p[1] === 0) mapRects.push({ x: p[0], z: p[2], w: R * 2, d: R * 2, c: '#4a4a48' });
    return { x: p[0], y: p[1] + H / 2, z: p[2], rotY: rand(0, 7), color: pick(BARREL_TINTS) };
  });
  instancedByColor(g, MAT.barrel, entries);
}

/* =========================================================================
   烧毁的平板卡车（场地中央开阔处）

   炭黑只出现在火真正烧过的面板上，其余是褪色漆与锈 ——
   这样残骸不会读成一整团黑。 */
{
  const G = new THREE.Group();
  G.position.set(0.5, 0, -1.5);
  G.rotation.y = 0.42;

  const PAINT  = new THREE.MeshStandardMaterial({ color: sRGB(0x6d6a5e), roughness: .88, metalness: .10 });
  const SOOT   = new THREE.MeshStandardMaterial({ color: sRGB(0x4b4741), roughness: .97, metalness: .03 });
  const FRAME  = new THREE.MeshStandardMaterial({ color: sRGB(0x574c42), roughness: .92, metalness: .08 });
  const GLASSX = new THREE.MeshStandardMaterial({ color: sRGB(0x76837f), roughness: .32, metalness: .10,
                                                  transparent: true, opacity: .30, side: THREE.DoubleSide });

  const add = (w, h, d, x, y, z, mat, rx, rz, solid) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (rx) m.rotation.x = rx;
    if (rz) m.rotation.z = rz;
    m.castShadow = m.receiveShadow = true;
    G.add(m);
    if (solid !== false){ worldSolid.push(m); groundMesh.push(m); }
    return m;
  };

  /* 梯形大梁 + 车轴 */
  add(4.9, 0.16, 0.20,  0, 0.46,  0.72, FRAME, 0, 0.03);
  add(4.9, 0.16, 0.20,  0, 0.46, -0.72, FRAME, 0, 0.03);
  add(0.24, 0.14, 1.70,  1.45, 0.44, 0, FRAME);
  add(0.24, 0.14, 1.70, -1.45, 0.44, 0, FRAME);

  /* 平板 —— 可站立 */
  add(3.0, 0.14, 2.10, -1.05, 0.62, 0, FRAME, 0, 0.03);
  for (let i = 0; i < 7; i++) add(0.30, 0.05, 2.06, -2.40 + i * 0.44, 0.71, 0, MAT.rust, 0, 0.03, false);

  /* 侧栏，一块掉了 */
  add(3.0, 0.42, 0.09, -1.05, 0.90,  1.02, PAINT, 0, 0.03);
  add(1.4, 0.42, 0.09, -0.35, 0.72, -1.32, PAINT, 0.62, 0.03, false);
  add(0.09, 0.42, 2.10, -2.52, 0.90, 0, PAINT, 0, 0.03);

  /* 驾驶室：顶与近侧烧毁，远侧仍留漆 */
  add(1.85, 0.86, 1.95,  1.05, 1.02, 0, PAINT, 0, 0.05);
  add(1.87, 0.30, 1.97,  1.05, 1.52, 0, SOOT,  0, 0.05);
  add(1.60, 0.05, 1.80,  1.02, 1.70, 0, SOOT,  0, 0.05);
  add(0.10, 0.62, 1.86,  1.98, 1.34, 0, SOOT, -0.16, 0);
  add(1.72, 0.06, 0.06,  1.05, 1.66, 0.94, FRAME, 0, 0.05, false);
  const wsc = add(0.06, 0.56, 1.72, 1.99, 1.33, 0, GLASSX, -0.16, 0, false);
  wsc.castShadow = false;

  /* 引擎舱，盖板被掀开又折回 */
  add(1.05, 0.62, 1.90,  2.55, 0.86, 0, PAINT, 0, 0.04);
  add(1.10, 0.07, 1.80,  2.30, 1.34, 0, MAT.rust, -0.75, 0, false);
  add(0.95, 0.34, 1.60,  2.62, 1.06, 0, SOOT, 0, 0.02, false);
  add(1.30, 0.16, 0.12,  2.95, 0.52,  0.80, FRAME, 0, 0, false);
  add(1.30, 0.16, 0.12,  2.95, 0.52, -0.80, FRAME, 0, 0, false);

  /* 车轮：三只挂着，一只烧成轮毂，一只丢在泥里 */
  const wheel = new THREE.CylinderGeometry(0.44, 0.44, 0.32, 16); wheel.rotateZ(PI / 2);
  const rim   = new THREE.CylinderGeometry(0.25, 0.25, 0.34, 14); rim.rotateZ(PI / 2);
  [[1.45, 0.44, 0.98], [1.45, 0.44, -0.98], [-1.45, 0.44, -0.98]].forEach(p => {
    const m = new THREE.Mesh(wheel, MAT.rubber);
    m.position.set(p[0], p[1], p[2]);
    m.castShadow = true;
    G.add(m); worldSolid.push(m);
  });
  const burnt = new THREE.Mesh(rim, MAT.metal);
  burnt.position.set(-1.45, 0.26, 0.98);
  burnt.castShadow = true;
  G.add(burnt); worldSolid.push(burnt);

  const loose = new THREE.Mesh(wheel, MAT.rubber);
  loose.position.set(-2.9, 0.16, 1.9);
  loose.rotation.z = PI / 2;
  loose.castShadow = true;
  G.add(loose); worldSolid.push(loose);

  /* 焦痕圈 + 散落残片 */
  {
    const sg = new THREE.CircleGeometry(3.4, 28); sg.rotateX(-PI / 2);
    const sm = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.30, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
    }));
    sm.position.set(1.0, 0.02, 0);
    G.add(sm);
  }
  for (let i = 0; i < 11; i++){
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(rand(.2, .62), rand(.03, .10), rand(.18, .5)),
      Math.random() < .45 ? SOOT : MAT.rust);
    m.position.set(rand(-3.6, 3.9), rand(.02, .07), rand(-2.9, 2.9));
    m.rotation.set(rand(0, .3), rand(0, 7), rand(0, .3));
    m.castShadow = true;
    G.add(m);
  }
  /* 从驾驶室飞出的碎玻璃 */
  for (let i = 0; i < 14; i++){
    const m = new THREE.Mesh(new THREE.BoxGeometry(rand(.05, .13), 0.012, rand(.05, .12)), MAT.glassBroke);
    m.position.set(rand(1.6, 3.6), 0.014, rand(-1.9, 1.9));
    m.rotation.y = rand(0, 7);
    G.add(m);
  }

  /* 每个材质一次 draw —— 残骸是静态的，射线列表也乐于接受一个 mesh 而不是六十个 */
  {
    G.updateMatrixWorld(true);
    const solid = new Set(worldSolid), walk = new Set(groundMesh);
    const buckets = new Map(), keepSolid = new Map(), keepWalk = new Map();
    G.traverse(o => {
      if (!o.isMesh) return;
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      if (!buckets.has(o.material)) buckets.set(o.material, []);
      buckets.get(o.material).push(g);
      if (solid.has(o)) keepSolid.set(o.material, true);
      if (walk.has(o))  keepWalk.set(o.material, true);
    });
    for (let i = worldSolid.length - 1; i >= 0; i--) if (worldSolid[i].parent === G) worldSolid.splice(i, 1);
    for (let i = groundMesh.length - 1; i >= 0; i--) if (groundMesh[i].parent === G) groundMesh.splice(i, 1);
    for (const [mat, geos] of buckets){
      const m = new THREE.Mesh(mergeGeoms(geos), mat);
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
      if (keepSolid.get(mat)) worldSolid.push(m);
      if (keepWalk.get(mat))  groundMesh.push(m);
    }
  }
  /* 残骸在 24° 斜角上，而碰撞体是轴对齐的。
     一整块大盒子要么在四角多出三米无形墙，要么（早先那样）小到可以走进引擎舱、
     站在驾驶室里。三块沿底盘的短盒把误差压到大约 30cm 以内。 */
  {
    const cy = Math.cos(G.rotation.y), sy = Math.sin(G.rotation.y);
    const hull = [
      [-2.60, 0.55, -1.20, 1.20, 1.05],    // 车斗与大梁
      [ 0.10, 2.05, -1.05, 1.05, 1.72],    // 驾驶室
      [ 2.00, 3.25, -1.00, 1.00, 1.25]     // 引擎舱与保险杠
    ];
    for (const [x0, x1, z0, z1, h] of hull){
      let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
      for (const lx of [x0, x1]) for (const lz of [z0, z1]){
        const wx = G.position.x + lx * cy + lz * sy;
        const wz = G.position.z - lx * sy + lz * cy;
        if (wx < mnx) mnx = wx; if (wx > mxx) mxx = wx;
        if (wz < mnz) mnz = wz; if (wz > mxz) mxz = wz;
      }
      addCollider((mnx + mxx) / 2, 0, (mnz + mxz) / 2, mxx - mnx, h, mxz - mnz);
      /* 画的就是挡住你的：每个体块一条迷你地图矩形，
         所以形状是你能撞到的东西，而不是一个漏掉引擎舱的整洁矩形 */
      mapRects.push({ x: (mnx + mxx) / 2, z: (mnz + mxz) / 2, w: mxx - mnx, d: mxz - mnz, c: '#4a4038' });
    }
  }
}

/* =========================================================================
   场地杂物

   “平面上的盒子”和“有人在干活的场地”之间的差别，就是没人愿意搬走的垃圾。
   这些都不是掩体 —— 是剪影、是尺度参照、是使用痕迹。
   每个材质合并一次，整个铺装成本大约十几次 draw call。
   ========================================================================= */
{
  const MC = {
    wood   : new THREE.MeshStandardMaterial({ color: sRGB(0x8a7250), roughness: .95, metalness: .02 }),
    woodDk : new THREE.MeshStandardMaterial({ color: sRGB(0x5e4c33), roughness: .96, metalness: .02 }),
    rubber : new THREE.MeshStandardMaterial({ color: sRGB(0x323231), roughness: .98, metalness: .0  }),
    plastic: new THREE.MeshStandardMaterial({ color: sRGB(0xc4571f), roughness: .62, metalness: .03 }),
    card   : new THREE.MeshStandardMaterial({ color: sRGB(0x9b7a52), roughness: .97, metalness: .0  }),
    steel  : new THREE.MeshStandardMaterial({ color: sRGB(0x767c83), roughness: .52, metalness: .18 }),
    dark   : new THREE.MeshStandardMaterial({ color: sRGB(0x3d4247), roughness: .62, metalness: .16 }),
    rusty  : new THREE.MeshStandardMaterial({ color: sRGB(0x6b5040), roughness: .93, metalness: .05 }),
    yellow : new THREE.MeshStandardMaterial({ color: sRGB(0xb08a1e), roughness: .68, metalness: .10 }),
    sack   : new THREE.MeshStandardMaterial({ color: sRGB(0x7d7358), roughness: .99, metalness: .0  }),
    green  : new THREE.MeshStandardMaterial({ color: sRGB(0x4d5f45), roughness: .72, metalness: .08 })
  };
  /* 每个杂物材质都用顶点色，这样合并后仍然有变化：
     一个平面颜色铺到四十个箱子上，就是“这堆东西是程序生成”的最明显破绽。 */
  for (const k in MC) MC[k].vertexColors = true;

  const bucket = new Map();
  const V = new THREE.Vector3(), Q = new THREE.Quaternion(), E = new THREE.Euler();

  function put(geo, mat, x, y, z, rx, ry, rz, sx, sy, sz){
    const g = geo.clone();
    E.set(rx || 0, ry || 0, rz || 0);
    Q.setFromEuler(E);
    V.set(sx === undefined ? 1 : sx, sy === undefined ? 1 : sy, sz === undefined ? 1 : sz);
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), Q, V));
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const t = rand(0.74, 1.16), warm = rand(0.94, 1.07);
    for (let i = 0; i < n; i++){ col[i*3] = t * warm; col[i*3+1] = t; col[i*3+2] = t / warm; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!bucket.has(mat)) bucket.set(mat, []);
    bucket.get(mat).push(g);
  }

  const BOX  = new THREE.BoxGeometry(1, 1, 1);
  const CYL  = new THREE.CylinderGeometry(1, 1, 1, 10);
  const CYL16= new THREE.CylinderGeometry(1, 1, 1, 16);
  const TOR  = new THREE.TorusGeometry(1, 0.34, 8, 18);
  const CONE = new THREE.ConeGeometry(1, 1, 10);

  /* ---------- 托盘：3 根纵梁 + 5 块甲板 ---------- */
  function pallet(px, py, pz, ry, tilt){
    for (let i = 0; i < 3; i++){
      const off = (i - 1) * 0.44;
      const c = Math.cos(ry), s = Math.sin(ry);
      put(BOX, MC.woodDk, px + s * off, py + 0.05, pz + c * off, 0, ry, 0, 1.18, 0.09, 0.10);
    }
    for (let i = 0; i < 5; i++){
      const off = (i - 2) * 0.24;
      const c = Math.cos(ry), s = Math.sin(ry);
      put(BOX, MC.wood, px + s * off, py + 0.13, pz + c * off, tilt || 0, ry, 0, 1.18, 0.045, 0.16);
    }
  }
  const palletSpots = [[-5.2, -6.4], [-4.4, -5.2], [14.2, 7.8], [14.4, 6.6], [21.6, -16.4],
                       [-12.6, 14.2], [2.6, -23.4], [27.2, 10.4], [-22.4, 3.2], [9.4, 20.6]];
  /* 杂物是布景，但能穿过去的布景是地图里“未完成”感最强的信号。
     任何高到一眼能辨成实物的杂物都挂一个 AABB；
     blocked 会忽略顶面低于 0.30 台阶的碰撞体，
     所以平摊在地上的垃圾自动可以迈过去，这些调用对它们是白给的。 */
  palletSpots.forEach(([px, pz], i) => {
    const n = randI(1, 3), ry = rand(0, PI);
    for (let k = 0; k < n; k++) pallet(px + rand(-.05, .05), k * 0.18, pz + rand(-.05, .05), ry + rand(-.12, .12));
    extraShadows.push({ x: px, z: pz, hw: 0.65, hd: 0.65, s: 0.5 });
    const top = 0.15 + (n - 1) * 0.18;
    addCollider(px, 0, pz, 1.24, top, 1.24);
    /* 真正挡得住你的堆才上迷你地图；单只托盘顶面低于台阶，一迈就过去了 */
    if (top > 0.30) mapRects.push({ x: px, z: pz, w: 1.24, d: 1.24, c: CLUTTER_MAP });
  });
  /* 靠在集装箱上的几块 */
  put(BOX, MC.wood, 11.0, 0.62, -14.2, 0, 0.1, 0.42, 1.2, 1.15, 0.11);
  put(BOX, MC.wood, 11.1, 0.60,  4.6,  0, 0.0, -0.38, 1.2, 1.15, 0.11);
  addCollider(11.0, 0, -14.2, 1.2, 1.2, 0.6);
  addCollider(11.1, 0,   4.6, 1.2, 1.2, 0.6);
  mapRects.push({ x: 11.0, z: -14.2, w: 1.2, d: 0.6, c: CLUTTER_MAP });
  mapRects.push({ x: 11.1, z:   4.6, w: 1.2, d: 0.6, c: CLUTTER_MAP });

  /* ---------- 轮胎堆 ---------- */
  const tyreSpots = [[-6.8, 4.2], [17.8, -9.6], [-18.2, -18.6], [24.6, 17.2], [6.2, -11.4], [-25.4, -11.0]];
  tyreSpots.forEach(([px, pz]) => {
    const n = randI(2, 5);
    for (let k = 0; k < n; k++)
      put(TOR, MC.rubber, px + rand(-.06, .06), 0.14 + k * 0.24, pz + rand(-.06, .06),
          PI / 2, rand(0, 3), 0, 0.42, 0.42, 0.42);
    extraShadows.push({ x: px, z: pz, hw: 0.48, hd: 0.48, s: 0.62 });
    addCollider(px, 0, pz, 1.06, 0.28 + (n - 1) * 0.24, 1.06);
    mapRects.push({ x: px, z: pz, w: 1.06, d: 1.06, c: CLUTTER_MAP });
  });
  /* 单独几只平躺的 */
  for (const [px, pz] of [[1.4, -16.2], [-14.8, -2.4], [20.2, 3.4], [-2.6, 19.4]]){
    put(TOR, MC.rubber, px, 0.14, pz, PI / 2, rand(0, 3), 0, 0.42, 0.42, 0.42);
    extraShadows.push({ x: px, z: pz, hw: 0.44, hd: 0.44, s: 0.45 });
  }

  /* ---------- 交通锥 ---------- */
  const coneSpots = [[-1.2, -10.4], [0.6, -10.9], [2.4, -11.2], [15.4, 11.6], [16.9, 11.3],
                     [-16.2, 7.4], [8.8, 24.2], [22.4, -20.6], [-9.4, -24.2], [4.2, 2.6]];
  coneSpots.forEach(([px, pz]) => {
    const tip = Math.random() < 0.18;
    if (tip){
      put(CONE, MC.plastic, px, 0.16, pz, PI / 2, rand(0, 6), 0, 0.20, 0.62, 0.20);
      put(BOX,  MC.dark,    px, 0.02, pz, 0, rand(0, 6), 0, 0.40, 0.04, 0.40);
    } else {
      put(BOX,  MC.dark,    px, 0.02, pz, 0, 0, 0, 0.42, 0.045, 0.42);
      put(CONE, MC.plastic, px, 0.34, pz, 0, 0, 0, 0.19, 0.62, 0.19);
      put(CYL,  MC.card,    px, 0.40, pz, 0, 0, 0, 0.145, 0.09, 0.145);
    }
    extraShadows.push({ x: px, z: pz, hw: 0.24, hd: 0.24, s: 0.5 });
    /* 倒下的锥矮到可以跨过去；立着的挡脚 */
    if (!tip) addCollider(px, 0, pz, 0.40, 0.66, 0.40);
  });

  /* ---------- 电缆盘 ---------- */
  for (const [px, pz, ry] of [[-19.6, 20.4, 0.4], [10.6, -25.2, 1.1], [28.0, -9.4, 0.0]]){
    const c = Math.cos(ry), s = Math.sin(ry);
    put(CYL16, MC.woodDk, px + c * 0.30, 0.92, pz - s * 0.30, PI / 2, ry, 0, 0.92, 0.12, 0.92);
    put(CYL16, MC.woodDk, px - c * 0.30, 0.92, pz + s * 0.30, PI / 2, ry, 0, 0.92, 0.12, 0.92);
    put(CYL16, MC.dark,   px, 0.92, pz, PI / 2, ry, 0, 0.46, 0.56, 0.46);
    extraShadows.push({ x: px, z: pz, hw: 0.95, hd: 0.95, s: 0.62 });
    addCollider(px, 0, pz, 1.9, 1.84, 1.9);
    mapRects.push({ x: px, z: pz, w: 1.9, d: 1.9, c: '#4e555c' });
  }

  /* ---------- 纸箱、木板、砖块 ---------- */
  for (let i = 0; i < 26; i++){
    const px = rand(-27, 27), pz = rand(-27, 27);
    if (Math.abs(px) < 3 && Math.abs(pz - 24) < 4) continue;    // 别挡住出生点
    const w = rand(0.32, 0.62), h = rand(0.24, 0.5), d = rand(0.32, 0.6);
    const flat = Math.random() < 0.3;
    put(BOX, MC.card, px, flat ? h * 0.14 : h / 2, pz,
        flat ? PI / 2 * rand(0.8, 1.0) : 0, rand(0, 6), flat ? rand(-.3, .3) : 0,
        w, flat ? h * 0.28 : h, d);
    extraShadows.push({ x: px, z: pz, hw: w * 0.6, hd: d * 0.6, s: 0.42 });
    if (!flat) addCollider(px, 0, pz, w * 1.05, h, d * 1.05);
  }
  for (let i = 0; i < 14; i++){
    const px = rand(-27, 27), pz = rand(-27, 27);
    put(BOX, MC.wood, px, 0.035, pz, 0, rand(0, 6), 0, rand(1.2, 2.6), 0.06, rand(0.14, 0.22));
  }
  for (let i = 0; i < 40; i++){
    const px = rand(-28, 28), pz = rand(-28, 28);
    put(BOX, MC.rusty, px, 0.035, pz, rand(-.3, .3), rand(0, 6), rand(-.3, .3),
        rand(0.1, 0.24), 0.07, rand(0.06, 0.12));
  }

  /* ---------- 气瓶架 ---------- */
  {
    const px = -13.4, pz = -11.2, ry = 0.2;
    put(BOX, MC.steel, px, 0.06, pz, 0, ry, 0, 1.9, 0.12, 0.6);
    put(BOX, MC.steel, px, 1.30, pz, 0, ry, 0, 1.9, 0.08, 0.08);
    for (let i = 0; i < 5; i++){
      const off = (i - 2) * 0.34, c = Math.cos(ry), s = Math.sin(ry);
      put(CYL, i % 2 ? MC.green : MC.rusty, px + c * off, 0.75, pz - s * off, 0, 0, 0, 0.145, 1.30, 0.145);
      put(CYL, MC.dark, px + c * off, 1.44, pz - s * off, 0, 0, 0, 0.07, 0.14, 0.07);
    }
    addCollider(px, 0, pz, 2.0, 1.5, 0.7);
    extraShadows.push({ x: px, z: pz, hw: 1.0, hd: 0.4, s: 0.6 });
    mapRects.push({ x: px, z: pz, w: 2.0, d: 0.7, c: '#4e555c' });
  }
  /* 平放的气瓶 */
  for (const [px, pz, ry] of [[7.2, 13.4, 0.7], [-21.2, -16.8, 2.1]]){
    put(CYL, MC.rusty, px, 0.145, pz, PI / 2, ry, 0, 0.145, 1.25, 0.145);
    extraShadows.push({ x: px, z: pz, hw: 0.6, hd: 0.3, s: 0.45 });
  }

  /* ---------- 垃圾箱 ---------- */
  {
    const px = -11.8, pz = 17.6, ry = 0.16;
    put(BOX, MC.rusty, px, 0.62, pz, 0, ry, 0, 2.9, 1.24, 1.55);
    put(BOX, MC.dark,  px, 1.26, pz, 0, ry, 0, 2.98, 0.10, 1.63);
    put(BOX, MC.dark,  px, 0.16, pz, 0, ry, 0, 3.0, 0.14, 1.62);
    for (let i = 0; i < 7; i++)
      put(BOX, i % 2 ? MC.card : MC.wood, px + rand(-1.2, 1.2), 1.32 + rand(0, 0.2), pz + rand(-.6, .6),
          rand(0, 1), rand(0, 6), rand(0, 1), rand(0.2, 0.5), rand(0.14, 0.3), rand(0.2, 0.4));
    addCollider(px, 0, pz, 3.0, 1.35, 1.65);
    mapRects.push({ x: px, z: pz, w: 3.0, d: 1.65, c: '#4e555c' });
  }

  /* ---------- 沙袋 ---------- */
  for (const [px, pz, ry] of [[3.6, -2.2, 0.3], [-18.0, -1.0, 1.4]]){
    for (let row = 0; row < 3; row++){
      const n = 5 - row;
      for (let i = 0; i < n; i++){
        const off = (i - (n - 1) / 2) * 0.46;
        const c = Math.cos(ry), s = Math.sin(ry);
        put(BOX, MC.sack, px + c * off, 0.11 + row * 0.21, pz - s * off, 0, ry + rand(-.1, .1), 0, 0.44, 0.21, 0.30);
      }
    }
    addCollider(px, 0, pz, 2.4, 0.66, 0.4);
    extraShadows.push({ x: px, z: pz, hw: 1.2, hd: 0.3, s: 0.6 });
    mapRects.push({ x: px, z: pz, w: 2.4, d: 0.4, c: '#4e555c' });
  }

  /* ---------- 场地灯杆 ---------- */
  for (const [px, pz, ry] of [[-9.0, -27.0, 0.0], [22.0, -27.5, 0.0], [-27.5, 9.0, PI/2], [27.5, 26.0, PI/2], [0.5, 27.5, PI]]){
    put(CYL, MC.dark, px, 3.6, pz, 0, 0, 0, 0.10, 7.2, 0.10);
    put(BOX, MC.dark, px, 0.09, pz, 0, ry, 0, 0.44, 0.18, 0.44);
    const c = Math.cos(ry), s = Math.sin(ry);
    put(BOX, MC.dark, px + c * 0.42, 7.14, pz - s * 0.42, 0, ry, 0, 0.9, 0.07, 0.07);
    for (const side of [-1, 1]){
      put(BOX, MC.dark, px + c * 0.78, 7.02, pz - s * 0.78 + side * 0.28, 0.34, ry, 0, 0.52, 0.14, 0.34);
    }
    addCollider(px, 0, pz, 0.3, 7.2, 0.3);
    extraShadows.push({ x: px, z: pz, hw: 0.3, hd: 0.3, s: 0.6 });
  }

  /* ---------- 叉车，停在装货区 ---------- */
  {
    const px = 17.6, pz = 1.2, ry = -0.5;
    const c = Math.cos(ry), s = Math.sin(ry);
    const L = (fx, fz) => [px + c * fx + s * fz, pz - s * fx + c * fz];
    let p;
    p = L(0, 0);    put(BOX, MC.yellow, p[0], 0.62, p[1], 0, ry, 0, 1.05, 0.70, 1.60);
    p = L(0, -0.5); put(BOX, MC.dark,   p[0], 1.02, p[1], 0, ry, 0, 0.95, 0.22, 0.55);
    p = L(0, -0.2); put(BOX, MC.dark,   p[0], 0.99, p[1], 0, ry, 0, 0.80, 0.10, 0.50);
    p = L(0, 0.85); put(BOX, MC.dark,   p[0], 1.06, p[1], 0, ry, 0, 0.72, 0.06, 0.10);
    for (const side of [-0.34, 0.34]){
      p = L(side, 1.02); put(BOX, MC.steel, p[0], 1.30, p[1], 0, ry, 0, 0.11, 2.55, 0.13);
    }
    p = L(0, 1.02); put(BOX, MC.steel, p[0], 2.52, p[1], 0, ry, 0, 0.80, 0.12, 0.14);
    for (const side of [-0.28, 0.28]){
      p = L(side, 1.42); put(BOX, MC.steel, p[0], 0.08, p[1], 0, ry, 0, 0.14, 0.05, 0.95);
      p = L(side, 1.02); put(BOX, MC.steel, p[0], 0.28, p[1], 0, ry, 0, 0.14, 0.45, 0.09);
    }
    for (const [fx, fz] of [[-0.44, 0.5], [0.44, 0.5], [-0.44, -0.6], [0.44, -0.6]]){
      p = L(fx, fz); put(BOX, MC.steel, p[0], 1.55, p[1], 0, ry, 0, 0.07, 1.30, 0.07);
    }
    p = L(0, -0.05); put(BOX, MC.steel, p[0], 2.22, p[1], 0, ry, 0, 1.00, 0.07, 1.25);
    for (const [fx, fz] of [[-0.55, 0.62], [0.55, 0.62], [-0.45, -0.62], [0.45, -0.62]]){
      p = L(fx, fz); put(CYL, MC.rubber, p[0], 0.30, p[1], 0, ry, PI / 2, 0.30, 0.20, 0.30);
    }
    addCollider(px, 0, pz, 1.9, 2.5, 2.4);
    mapRects.push({ x: px, z: pz, w: 1.9, d: 2.4, c: '#5a6068' });
    extraShadows.push({ x: px, z: pz, hw: 0.9, hd: 1.2, s: 0.7 });
  }

  /* ---------- 管架 ---------- */
  {
    const rackAt = (px, pz, ry) => {
      const c = Math.cos(ry), s = Math.sin(ry);
      for (const side of [-1.6, 1.6]){
        put(BOX, MC.steel, px + c * side, 0.20, pz - s * side, 0, ry, 0, 0.12, 0.40, 1.0);
      }
      for (let lvl = 0; lvl < 3; lvl++){
        const n = 4 - lvl;
        for (let i = 0; i < n; i++){
          const off = (i - (n - 1) / 2) * 0.36;
          put(CYL, MC.rusty, px, 0.44 + lvl * 0.32, pz + off, 0, ry, PI / 2, 0.16, 3.4, 0.16);
        }
      }
      addCollider(px, 0, pz, 3.6, 1.1, 1.6);
      extraShadows.push({ x: px, z: pz, hw: 1.8, hd: 0.8, s: 0.62 });
      mapRects.push({ x: px, z: pz, w: 3.6, d: 1.6, c: '#4e555c' });
    };
    rackAt(-24.0, 14.0, 0.0);
    rackAt( 6.5, -27.0, PI / 2);
  }
  /* 散落管道 */
  for (let i = 0; i < 5; i++){
    const px = rand(-26, 26), pz = rand(-26, 26);
    put(CYL, MC.rusty, px, 0.16, pz, 0, rand(0, 6), PI / 2, 0.16, rand(3, 5.5), 0.16);
    extraShadows.push({ x: px, z: pz, hw: 2.0, hd: 0.3, s: 0.42 });
  }

  /* ---------- 合并 ---------- */
  for (const [mat, geos] of bucket){
    const m = new THREE.Mesh(mergeGeoms(geos), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    worldSolid.push(m);
  }
}

/* =========================================================================
   接触阴影 / 地面污渍

   没有 GI 时，道具读起来像贴在混凝土上的贴纸。
   每块 footprint 拿到一片软暗裙边：
   一个 4×4 顶点网格，内侧矩形不透明、外圈淡出，
   这样无论盒子多长，衰减带在世界上都是固定宽度
   （被拉伸的径向渐变做不到这一点）。
   全部合并成一个 buffer，所以只有一次 draw call。
   ========================================================================= */
const contactShadows = (() => {
  const pos = [], alp = [], idx = [];
  let base = 0;
  const FEATHER = 0.62;

  function skirt(cx, cz, hw, hd, strength, y){
    const xs = [cx - hw - FEATHER, cx - hw, cx + hw, cx + hw + FEATHER];
    const zs = [cz - hd - FEATHER, cz - hd, cz + hd, cz + hd + FEATHER];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++){
      pos.push(xs[j], y, zs[i]);
      const edge = (i === 0 || i === 3 || j === 0 || j === 3) ? 0 : 1;
      alp.push(edge * strength);
    }
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++){
      const a = base + i * 4 + j;
      idx.push(a, a + 4, a + 1, a + 1, a + 4, a + 5);
    }
    base += 16;
  }

  return {
    add(cx, cz, hw, hd, strength, y){ skirt(cx, cz, hw, hd, strength, y === undefined ? 0.014 : y); },
    build(){
      if (!idx.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aAlpha',   new THREE.Float32BufferAttribute(alp, 1));
      g.setIndex(idx);

      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        uniforms: (() => {
          const u = { fogColor: { value: new THREE.Color(FOG_COLOR) }, fogDensity: { value: scene.fog.density } };
          fogUniforms.push(u);
          return u;
        })(),
        vertexShader: `
          attribute float aAlpha;
          varying float vA;
          varying float vD;
          void main(){
            vA = aAlpha;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vD = -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          varying float vA;
          varying float vD;
          uniform float fogDensity;
          void main(){
            float f = 1.0 - exp(-fogDensity * fogDensity * vD * vD);
            gl_FragColor = vec4(0.030, 0.034, 0.042, vA * (1.0 - f));
          }`
      });
      const m = new THREE.Mesh(g, mat);
      m.frustumCulled = false;
      m.renderOrder = 1;
      scene.add(m);
    }
  };
})();

/* =========================================================================
   场外区域

   围栏之外的一切 —— 不可碰撞、不可射击。
   它们的存在是为了让游戏空间读起来是某块更大地方的一角，
   而不是一座 60m 的孤岛。它们有正确的视差，这是画上去的背景做不到的。
   ========================================================================= */
{
  /* 场地的贴图板到 38m 就没了；这一层把地面一直铺到地平线，
     好让远处的结构有东西站 */
  const gp = new THREE.PlaneGeometry(460, 460);
  gp.rotateX(-PI / 2);
  const far = new THREE.Mesh(gp, new THREE.MeshBasicMaterial({ color: sRGB(0x5d5c57), fog: true }));
  far.position.y = -0.06;
  scene.add(far);

  const distant = new THREE.Group();
  /* 刻意调暗的反照率：它们几乎完全透过雾来读，
     任何比雾色更亮的表面都会变成一块白切纸 */
  const dm = c => new THREE.MeshLambertMaterial({ color: sRGB(c) });
  const MD = { hull: dm(0x3c3b37), dark: dm(0x2e2e2c), rust: dm(0x3f3128), pale: dm(0x46453f), steel: dm(0x35383c) };
  const put = (geo, mat, x, y, z, ry, sx, sy, sz) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (ry) m.rotation.y = ry;
    if (sx !== undefined) m.scale.set(sx, sy, sz);
    m.castShadow = false;
    m.receiveShadow = false;
    distant.add(m);
    return m;
  };
  const BOX = new THREE.BoxGeometry(1, 1, 1);
  const CYL = new THREE.CylinderGeometry(1, 1, 1, 14);

  /* 锯齿屋顶的长条厂房，环绕场地。
     没有一栋比 85m 更近：在更近的距离上，雾太薄，卖不出“背景”感，
     还会和可玩几何抢戏。 */
  const sheds = [
    [-104,  -8, 46, 13, 30, 0.10], [ -74,  92, 52, 11, 26, 1.62],
    [ 112,  30, 40, 15, 28, 1.55], [  26, -108, 66, 12, 24, 0.04],
    [ -24, 118, 58, 10, 28, 3.10], [ 118, -78, 44, 14, 30, 0.72],
    [-138,  26, 50, 17, 34, 1.50], [  78, 118, 60, 13, 26, 2.90],
    [ -46,-124, 54, 12, 26, 0.20], [ 152,  84, 48, 16, 30, 2.20]
  ];
  for (const [x, z, w, h, d, ry] of sheds){
    put(BOX, Math.random() < 0.5 ? MD.hull : MD.pale, x, h / 2, z, ry, w, h, d);
    const teeth = Math.max(3, Math.round(w / 7));
    for (let i = 0; i < teeth; i++){
      const off = (i / (teeth - 1) - 0.5) * (w * 0.86);
      const m = put(BOX, MD.dark, 0, h + 1.4, 0, 0, w / teeth * 0.7, 2.8, d * 0.94);
      m.position.set(x + Math.cos(ry) * off, h + 1.4, z - Math.sin(ry) * off);
      m.rotation.y = ry;
    }
    put(BOX, MD.dark, x, h * 0.22, z, ry, w * 0.99, h * 0.30, d * 1.005);
  }

  /* 储罐 */
  for (const [x, z, r, h] of [[-128, -64, 9, 11], [-108, -80, 7, 9], [132, 76, 11, 13], [150, 14, 8, 10], [-58, -136, 10, 12]]){
    put(CYL, MD.pale, x, h / 2, z, 0, r, h, r);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 7, 0, PI * 2, 0, PI / 2), MD.pale);
    cap.position.set(x, h, z);
    cap.scale.set(r, r * 0.42, r);
    distant.add(cap);
    put(BOX, MD.dark, x, h * 0.5, z, 0, r * 2.02, 0.5, r * 2.02);
  }

  /* 远处集装箱堆场上方的门式起重机 */
  for (const [x, z, ry, s] of [[-118, -30, 0.2, 1.0], [96, -62, 1.5, 0.9], [34, 142, 0.05, 1.2]]){
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    const leg = dx => {
      const l = new THREE.Mesh(BOX, MD.steel);
      l.position.set(dx, 11 * s, 0); l.scale.set(1.5 * s, 22 * s, 1.5 * s); g.add(l);
      const f = new THREE.Mesh(BOX, MD.steel);
      f.position.set(dx, 1.2 * s, 0); f.scale.set(4 * s, 2.4 * s, 7 * s); g.add(f);
    };
    leg(-13 * s); leg(13 * s);
    const beam = new THREE.Mesh(BOX, MD.steel);
    beam.position.set(0, 23 * s, 0); beam.scale.set(44 * s, 2.4 * s, 2.6 * s); g.add(beam);
    const cab = new THREE.Mesh(BOX, MD.rust);
    cab.position.set(-4 * s, 20.4 * s, 1.6 * s); cab.scale.set(3 * s, 3 * s, 3 * s); g.add(cab);
    g.traverse(o => { o.castShadow = false; o.receiveShadow = false; });
    distant.add(g);
  }

  /* 水塔 */
  {
    const g = new THREE.Group(); g.position.set(-92, 0, -112);
    for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]){
      const l = new THREE.Mesh(BOX, MD.steel);
      l.position.set(dx, 9, dz); l.scale.set(0.7, 18, 0.7);
      l.rotation.set(dz * 0.02, 0, -dx * 0.02); g.add(l);
    }
    const tank = new THREE.Mesh(CYL, MD.pale);
    tank.position.set(0, 21, 0); tank.scale.set(6, 8, 6); g.add(tank);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 14), MD.dark);
    cone.position.set(0, 26.6, 0); cone.scale.set(6.2, 3, 6.2); g.add(cone);
    g.traverse(o => { o.castShadow = false; o.receiveShadow = false; });
    distant.add(g);
  }

  /* 烟囱 */
  for (const [x, z, r, h] of [[-146, -132, 3.2, 44], [-130, -142, 2.6, 36], [168, -104, 3.0, 40]]){
    put(CYL, MD.rust, x, h / 2, z, 0, r, h, r);
    put(CYL, MD.dark, x, h * 0.86, z, 0, r * 1.12, 2, r * 1.12);
  }

  /* 输电塔，向地平线延伸 */
  for (let i = 0; i < 6; i++){
    const t = i / 5;
    const px = -170 + t * 330, pz = 176 - t * 40;
    const g = new THREE.Group(); g.position.set(px, 0, pz);
    const mast = new THREE.Mesh(BOX, MD.steel);
    mast.position.y = 13; mast.scale.set(1.1, 26, 1.1); g.add(mast);
    for (const [y, w] of [[16, 11], [20, 9], [24, 6]]){
      const arm = new THREE.Mesh(BOX, MD.steel);
      arm.position.y = y; arm.scale.set(w, 0.6, 0.6); g.add(arm);
    }
    g.traverse(o => { o.castShadow = false; o.receiveShadow = false; });
    distant.add(g);
  }

  /* 远处集装箱堆，呼应场地的剪影 */
  for (let i = 0; i < 26; i++){
    const a = Math.random() * PI * 2, r = rand(78, 150);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < 58 && Math.abs(z) < 58) continue;
    const lvl = randI(1, 3);
    for (let k = 0; k < lvl; k++){
      put(BOX, [MD.rust, MD.hull, MD.dark, MD.pale][randI(0, 3)],
          x, 1.42 + k * 2.85, z, a, rand(9, 13), 2.8, 2.5);
    }
  }

  /* 天际线不动也不播动画 —— 在进场景前把 ~220 个 mesh 合并成每材质一次 draw */
  {
    const buckets = new Map();
    distant.updateMatrixWorld(true);
    distant.traverse(o => {
      if (!o.isMesh) return;
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      if (!buckets.has(o.material)) buckets.set(o.material, []);
      buckets.get(o.material).push(g);
    });
    for (const [mat, geos] of buckets){
      const m = new THREE.Mesh(mergeGeoms(geos), mat);
      m.castShadow = false;
      m.receiveShadow = false;
      m.frustumCulled = false;
      scene.add(m);
    }
  }
}

/* --------------------------------------------------------------------------
   为所有接触地面的 footprint 生成裙边

   叠在别人上面的箱子是坐在邻居上，跳过。
   -------------------------------------------------------------------------- */
for (const c of colliders){
  if (c.minY > 0.22) continue;
  const hw = (c.maxX - c.minX) / 2, hd = (c.maxZ - c.minZ) / 2;
  if (hw < 0.12 || hd < 0.12) continue;
  const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
  contactShadows.add(cx, cz, hw * 0.98, hd * 0.98, 0.62);
  contactShadows.add(cx, cz, hw + 0.55, hd + 0.55, 0.17);   // 外圈污渍
}
for (const e of extraShadows) contactShadows.add(e.x, e.z, e.hw, e.hd, e.s);
contactShadows.build();

/* --------------------------------------------------------------------------
   世界构建完成的标记

   这时 colliders 才真正有内容，weather.js 的遮蔽栅格才能正确光栅化。
   把它标为脏，下一帧第一次 coverAt() 会重建。
   -------------------------------------------------------------------------- */
covBuilt = false;