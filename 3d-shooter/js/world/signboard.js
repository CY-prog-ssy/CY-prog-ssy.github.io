/* =========================================================================
   signboard.js
   出生点告示牌 —— 站在出生点向后转就能看到

   依赖：utils.js / renderer.js / textures.js / weather.js / map.js
   暴露：无（副作用：往 MAT / worldSolid / mapRects / colliders 里加东西）

   说明：
     开场运镜的俯冲路径特意从它上空掠过（间隙 1.44m）—— 不过镜头那会儿
     是朝前看的，画面里看不到牌子，只是避免相机穿模。真正看到它还是要转身。

     位置不是随手定的：出生点正后方 (0.5, 27.5) 立着一根 7.2m 的路灯杆，
     牌子原本在 x=0 正好被它穿透。挪动方向取的是玩家转身面对出生方向时的
     右手边（世界 -x）：出生点右后方那一带是空地，而左后方（+x）堆着一排
     货箱，空间不够。同时绕 Y 轴转向出生点，牌面正对玩家而不是平行于围栏。
   ========================================================================= */
"use strict";

/* --------------------------------------------------------------------------
   ★★★ 要改联系方式就改这里 ★★★

   每一行 { t: 文字, k: 样式 }，样式可选 'title' | 'head' | 'row'。
   行数随便加减，画布会自动重新排版。
   -------------------------------------------------------------------------- */
const SIGN_LINES = [
  { t: 'OPERATION IRONHOLD', k: 'title' },
  { t: 'CONTACT // 联系方式', k: 'head' },
  { t: '原作者   Alsay（开源的不确定性）', k: 'row' },
  { t: '二改       cc创意', k: 'row' },
  { t: '架构       cc创意自研架构', k: 'row' },
  { t: '参考       锐龙', k: 'row' }
];

/** 把 SIGN_LINES 画成一张告示牌贴图。
    宽高比定死 16:10，和板面 BoxGeometry 的比例一致，字才不会被拉扁。 */
function makeSignTexture(){
  const W = 1024, H = 640;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');

  /* 底色是一块脏掉的搪瓷白，不是纯白 —— 纯白在雾里会像一块灯箱 */
  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0,    '#cfc9bc');
  bg.addColorStop(0.55, '#c4bfb1');
  bg.addColorStop(1,    '#b3aea1');
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);

  /* 锈迹沿底边往上渗，是这类牌子最典型的旧化方式 */
  for (let i = 0; i < 26; i++){
    const rx = Math.random() * W, ry = H - Math.random() * Math.random() * H * 0.55;
    const rr = rand(18, 95);
    const g = x.createRadialGradient(rx, ry, 0, rx, ry, rr);
    g.addColorStop(0, 'rgba(126,84,44,' + rand(0.10, 0.30).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(126,84,44,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(rx, ry, rr, 0, 7); x.fill();
  }

  /* 边缘一圈磨损：边框压深，内侧掉漆 */
  x.strokeStyle = 'rgba(70,62,52,.55)'; x.lineWidth = 9;
  x.strokeRect(4.5, 4.5, W - 9, H - 9);
  for (let i = 0; i < 44; i++){
    const ex = Math.random() < 0.5 ? Math.random() * W : (Math.random() < 0.5 ? 8 : W - 8);
    const ey = Math.random() < 0.5 ? Math.random() * H : (Math.random() < 0.5 ? 8 : H - 8);
    x.fillStyle = 'rgba(150,144,132,' + rand(0.15, 0.45).toFixed(3) + ')';
    x.beginPath(); x.arc(ex, ey, rand(3, 13), 0, 7); x.fill();
  }

  /* ---- 排版：行高按内容行数均分，所以加减行不用动任何数字 ---- */
  const padX = 74, top = 78, bottom = H - 62;
  const n = SIGN_LINES.length;
  const span = (bottom - top) / n;
  x.textBaseline = 'middle';

  SIGN_LINES.forEach((ln, i) => {
    const cy = top + span * (i + 0.5);
    if (ln.k === 'title'){
      x.textAlign = 'center';
      x.fillStyle = '#8a4a1c';
      x.font = 'bold 62px "Arial Narrow", Arial, sans-serif';
      x.letterSpacing = '4px';
      x.fillText(ln.t, W / 2, cy);
      x.letterSpacing = '0px';
      x.strokeStyle = 'rgba(90,70,50,.5)';
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(padX, cy + span * 0.42);
      x.lineTo(W - padX, cy + span * 0.42);
      x.stroke();
    } else if (ln.k === 'head'){
      x.textAlign = 'center';
      x.fillStyle = '#4b453c';
      x.font = 'bold 34px "Arial Narrow", Arial, sans-serif';
      x.fillText(ln.t, W / 2, cy);
    } else {
      /* 联系方式用等宽字体：数字和字母对齐了才像块牌子 */
      x.textAlign = 'left';
      x.fillStyle = '#2b2620';
      x.font = 'bold 40px ui-monospace, "Cascadia Mono", Consolas, Menlo, monospace';
      x.fillText(ln.t, padX, cy);
      x.strokeStyle = 'rgba(60,54,46,.16)';
      x.lineWidth = 1.5;
      x.beginPath();
      x.moveTo(padX, cy + span * 0.30);
      x.lineTo(W - padX, cy + span * 0.30);
      x.stroke();
    }
  });

  /* 最后一层细颗粒，免得干净的渐变在近距离露馅。
     不能复用 grain()：那个函数按正方形取样，1024×640 的画布只会盖住左上角。 */
  {
    const img = x.getImageData(0, 0, W, H), d = img.data;
    for (let i = 0; i < d.length; i += 4){
      const n = (Math.random() - 0.5) * 17;
      d[i]   = clamp(d[i]   + n, 0, 255);
      d[i+1] = clamp(d[i+1] + n, 0, 255);
      d[i+2] = clamp(d[i+2] + n, 0, 255);
    }
    x.putImageData(img, 0, 0);
  }

  const t = new THREE.CanvasTexture(c);
  t.anisotropy = MAXANISO;
  t.encoding = THREE.sRGBEncoding;
  return t;
}

/* --------------------------------------------------------------------------
   构建告示牌

   告示牌材质单独一份：它要参与天气反应（会湿、会积雪），
   但贴图本身不能拷进 MAT 里共用，否则每块板子都印着联系方式。
   -------------------------------------------------------------------------- */
MAT.sign = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .82, metalness: .04 });
MAT.sign.map = makeSignTexture();
MAT.sign.color.convertSRGBToLinear();
MAT.sign.map.encoding = THREE.sRGBEncoding;
injectWeather(MAT.sign, false);

{
  const BW = 3.2, BH = 2.0;            // 板面宽高（16:10，与贴图一致）
  const BASE = 0.92;                   // 板面底边离地
  const cyH  = BASE + BH / 2;          // 板面中心高
  /* 出生点在 (0, 24)。牌子往玩家右手边（世界 -x）偏 2.2m、退到 z=28.8：
     正后方 (0.5,27.5) 有根 7.2m 的路灯灯杆，原位置被它穿透，现在留出 1.07m。
     +x 那一侧堆着一排货箱，放不下；z 再往南就顶到 z=30 的围栏。

     偏移别再加大：牌子偏离正后方 24.6°，已经接近手机竖屏水平视野
     （半角约 19°）的边缘，再往边上挪玩家转身就看不见了。 */
  const SX = -2.2, SZ = 28.8;
  const SRY = Math.atan2(SX - 0, SZ - 24);

  /* 板面是一块薄盒子而不是一片平面：有厚度、能投影、背面不是纸片。
     但 BoxGeometry 六个面共用同一张贴图，侧面和顶底也会印上字 ——
     所以只给朝向玩家的那一面（-Z，材质索引 5）用文字贴图，其余用素背板。 */
  const SIGN_BACK = new THREE.MeshStandardMaterial({ color: 0x6d737a, roughness: .72, metalness: .14 });
  SIGN_BACK.color.convertSRGBToLinear();
  injectWeather(SIGN_BACK, false);
  const faceMats = [SIGN_BACK, SIGN_BACK, SIGN_BACK, SIGN_BACK, SIGN_BACK, MAT.sign];

  /* 板面、立柱、压条装进一个 Group 整体旋转 —— 逐个算旋转后的世界坐标容易出错 */
  const sign = new THREE.Group();
  sign.position.set(SX, 0, SZ);
  sign.rotation.y = SRY;

  const face = new THREE.Mesh(new THREE.BoxGeometry(BW, BH, 0.14), faceMats);
  face.position.set(0, cyH, 0);
  face.castShadow = face.receiveShadow = true;
  sign.add(face);

  /* 两根立柱。插进地里而不是坐在地上，风一吹才不像要倒 */
  const postGeo = new THREE.CylinderGeometry(0.075, 0.085, cyH + 0.55, 8);
  for (const px of [-BW * 0.36, BW * 0.36]){
    const p = new THREE.Mesh(postGeo, MAT.darkMetal);
    p.position.set(px, (cyH + 0.55) / 2 - 0.25, 0);
    p.castShadow = true;
    sign.add(p);
  }

  /* 板面顶部一道压条，把"钉在柱子上"这件事说清楚 */
  const rail = new THREE.Mesh(new THREE.BoxGeometry(BW + 0.18, 0.09, 0.2), MAT.darkMetal);
  rail.position.set(0, BASE + BH + 0.045, 0);
  rail.castShadow = true;
  sign.add(rail);

  scene.add(sign);
  worldSolid.push(face);              // 只有板面参与弹道，立柱太细不必

  /* 碰撞用旋转后的水平包围盒：addCollider 只认轴对齐的盒子，
     给旋转后的 AABB 会让边角稍微挡多一点路，但牌子贴着围栏，无人经过。 */
  const ca = Math.abs(Math.cos(SRY)), sa = Math.abs(Math.sin(SRY));
  const cw = BW * ca + 0.14 * sa, cd = BW * sa + 0.14 * ca;
  addCollider(SX, 0, SZ, cw, BASE + BH, cd);

  /* 小地图同样只支持轴对齐矩形，按 AABB 画 */
  mapRects.push({ x: SX, z: SZ, w: cw, d: cd, c: '#4e555c' });
}