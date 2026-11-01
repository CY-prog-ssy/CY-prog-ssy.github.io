/* =========================================================================
   textures.js
   程序化 Canvas 贴图 —— 混凝土 / 集装箱 / 油桶 / 木箱 / 铁丝网 / 砖墙
                          弹孔贴花 / 柔光斑 / 星形闪光

   依赖：utils.js（cvs/finishTex/grain/splotches/rand/randI/pick/clamp）
         renderer.js（MAXANISO）
   暴露：TEX（贴图字典）
   ========================================================================= */
"use strict";

/* --------------------------------------------------------------------------
   混凝土地面 —— 板缝 + 污渍 + 裂纹 + 油渍
   -------------------------------------------------------------------------- */
function makeConcrete(){
  const S = 512, [c, x] = cvs(S);
  x.fillStyle = '#5f6164'; x.fillRect(0, 0, S, S);
  splotches(x, S, 70, ['82,84,87','70,71,74','92,93,95','52,54,56'], 20, 110, 0.35);
  grain(x, S, 42);

  /* 板缝：两横两竖 */
  x.strokeStyle = 'rgba(30,32,34,.85)'; x.lineWidth = 3;
  for (let i = 0; i <= 2; i++){
    const p = (S / 2) * i;
    x.beginPath(); x.moveTo(p, 0); x.lineTo(p, S); x.stroke();
    x.beginPath(); x.moveTo(0, p); x.lineTo(S, p); x.stroke();
  }
  x.strokeStyle = 'rgba(160,163,166,.28)'; x.lineWidth = 1;
  for (let i = 0; i <= 2; i++){
    const p = (S / 2) * i + 2;
    x.beginPath(); x.moveTo(p, 0); x.lineTo(p, S); x.stroke();
    x.beginPath(); x.moveTo(0, p); x.lineTo(S, p); x.stroke();
  }

  /* 裂纹 */
  x.strokeStyle = 'rgba(38,40,42,.6)';
  for (let i = 0; i < 16; i++){
    x.lineWidth = rand(.6, 1.8);
    x.beginPath();
    let px = Math.random() * S, py = Math.random() * S;
    x.moveTo(px, py);
    for (let s = 0; s < 7; s++){
      px += rand(-34, 34); py += rand(-34, 34);
      x.lineTo(px, py);
    }
    x.stroke();
  }

  /* 机油 */
  splotches(x, S, 10, ['22,20,18','30,26,20'], 14, 50, 0.5);

  return finishTex(c, [18, 18]);
}

/* --------------------------------------------------------------------------
   集装箱瓦楞板

   注意：贴图里没有序列号 —— 那是在 decal 层单独画的，
   因为这一格会沿集装箱长度方向重复 2.4 次，重复的编号一眼假。
   -------------------------------------------------------------------------- */
function makeContainerTex(){
  const S = 512, [c, x] = cvs(S);
  x.fillStyle = '#b0b0b0'; x.fillRect(0, 0, S, S);

  /* 瓦楞：每 26px 一根 */
  for (let i = 0; i < S; i += 26){
    const g = x.createLinearGradient(i, 0, i + 26, 0);
    g.addColorStop(0,    'rgba(0,0,0,.30)');
    g.addColorStop(.32,  'rgba(255,255,255,.20)');
    g.addColorStop(.62,  'rgba(255,255,255,.06)');
    g.addColorStop(1,    'rgba(0,0,0,.34)');
    x.fillStyle = g;
    x.fillRect(i, 0, 26, S);
  }

  /* 上下横梁 */
  x.fillStyle = 'rgba(0,0,0,.34)';
  x.fillRect(0, 0, S, 18);
  x.fillRect(0, S - 20, S, 20);
  x.fillStyle = 'rgba(255,255,255,.07)';
  x.fillRect(0, 17, S, 2);
  x.fillRect(0, S - 21, S, 2);

  /* 锈斑与流挂 */
  splotches(x, S, 54, ['92,54,26','120,66,30','60,40,26','40,38,36'], 8, 50, 0.42);
  for (let i = 0; i < 34; i++){
    const rx = Math.random() * S, ry = rand(12, S * 0.5);
    const h = rand(30, 180), w = rand(2, 9);
    const g = x.createLinearGradient(0, ry, 0, ry + h);
    g.addColorStop(0, 'rgba(96,52,24,.42)');
    g.addColorStop(1, 'rgba(96,52,24,0)');
    x.fillStyle = g;
    x.fillRect(rx, ry, w, h);
  }

  /* 底部积垢 */
  const gb = x.createLinearGradient(0, S * 0.76, 0, S);
  gb.addColorStop(0, 'rgba(28,26,24,0)');
  gb.addColorStop(1, 'rgba(26,24,22,.5)');
  x.fillStyle = gb;
  x.fillRect(0, S * 0.76, S, S * 0.24);

  grain(x, S, 24);
  return finishTex(c, [1, 1]);
}

/* --------------------------------------------------------------------------
   油桶：色带 + 锈 + 纵向拉丝
   -------------------------------------------------------------------------- */
function makeBarrelTex(){
  const S = 256, [c, x] = cvs(S);
  x.fillStyle = '#8f8d88'; x.fillRect(0, 0, S, S);
  x.fillStyle = 'rgba(0,0,0,.35)';
  x.fillRect(0, S * 0.20, S, 10);
  x.fillRect(0, S * 0.72, S, 10);
  x.fillStyle = 'rgba(255,255,255,.14)';
  x.fillRect(0, S * 0.20 - 4, S, 4);
  x.fillRect(0, S * 0.72 - 4, S, 4);
  splotches(x, S, 70, ['110,54,20','138,70,28','70,44,24','48,44,40'], 5, 32, 0.55);
  grain(x, S, 30);
  for (let i = 0; i < S; i += 6){
    x.fillStyle = i % 12 === 0 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)';
    x.fillRect(i, 0, 3, S);
  }
  return finishTex(c, [1, 1]);
}

/* --------------------------------------------------------------------------
   胶合板货箱

   结构：6 块横板 + 四角压条 + 对角撑 + 钉头 + 少量喷码。
   注意喷码是「适度」的 —— 真实货箱上就是一小块，不是满屏横幅。
   -------------------------------------------------------------------------- */
function makeCrateTex(){
  const S = 512, [c, x] = cvs(S);
  x.fillStyle = '#82653f'; x.fillRect(0, 0, S, S);

  /* 横板 */
  const boards = 6, bh = S / boards;
  for (let b = 0; b < boards; b++){
    const v = randI(-14, 14);
    x.fillStyle = `rgb(${clamp(134+v,0,255)},${clamp(104+v,0,255)},${clamp(64+v,0,255)})`;
    x.fillRect(0, b * bh, S, bh - 2);
    x.fillStyle = 'rgba(44,30,16,.55)';   x.fillRect(0, b * bh + bh - 2, S, 2);
    x.fillStyle = 'rgba(210,180,140,.10)'; x.fillRect(0, b * bh, S, 1.5);

    /* 板内木纹 */
    for (let i = 0; i < 26; i++){
      x.strokeStyle = `rgba(${randI(70,120)},${randI(48,84)},${randI(22,48)},.30)`;
      x.lineWidth = rand(.5, 1.8);
      x.beginPath();
      const y = b * bh + rand(2, bh - 4);
      x.moveTo(0, y);
      x.bezierCurveTo(S*.33, y+rand(-4,4), S*.66, y+rand(-4,4), S, y+rand(-3,3));
      x.stroke();
    }

    /* 木结 */
    if (Math.random() < 0.45){
      const kx = rand(20, S - 20), ky = b * bh + bh / 2, kr = rand(4, 9);
      const g = x.createRadialGradient(kx, ky, 0, kx, ky, kr);
      g.addColorStop(0,   'rgba(52,34,16,.85)');
      g.addColorStop(.6,  'rgba(84,58,30,.55)');
      g.addColorStop(1,   'rgba(84,58,30,0)');
      x.fillStyle = g;
      x.beginPath(); x.ellipse(kx, ky, kr, kr * 0.7, 0, 0, 7); x.fill();
    }
  }

  /* 四角压条 */
  x.fillStyle = 'rgba(72,50,26,.85)';
  x.fillRect(0, 0, 26, S); x.fillRect(S - 26, 0, 26, S);
  x.fillRect(0, 0, S, 22); x.fillRect(0, S - 22, S, 22);
  x.fillStyle = 'rgba(196,164,120,.12)';
  x.fillRect(0, 0, 26, 3); x.fillRect(S - 26, 0, 26, 3);

  /* 对角撑 */
  x.save();
  x.strokeStyle = 'rgba(74,52,28,.7)';
  x.lineWidth = 20;
  x.beginPath(); x.moveTo(26, S - 22); x.lineTo(S - 26, 22); x.stroke();
  x.restore();

  /* 钉头 */
  x.fillStyle = 'rgba(38,34,30,.75)';
  for (let i = 30; i < S - 20; i += 44){
    for (const px of [13, S - 13]) { x.beginPath(); x.arc(px, i, 2.2, 0, 7); x.fill(); }
    for (const py of [11, S - 11]) { x.beginPath(); x.arc(i, py, 2.2, 0, 7); x.fill(); }
  }

  /* 喷码 */
  x.save();
  x.translate(S * 0.30, S * 0.40);
  x.fillStyle = 'rgba(38,26,12,.62)';
  x.font = 'bold 20px monospace'; x.textAlign = 'left';
  x.fillText('FRAGILE', 0, 0);
  x.font = 'bold 13px monospace';
  x.fillText('LOT 44-' + randI(100, 999), 0, 17);
  x.strokeStyle = 'rgba(38,26,12,.55)'; x.lineWidth = 2.4;
  for (const ax of [0, 20]){
    x.beginPath();
    x.moveTo(ax + 2, 44); x.lineTo(ax + 2, 28);
    x.moveTo(ax - 4, 34); x.lineTo(ax + 2, 28); x.lineTo(ax + 8, 34);
    x.stroke();
  }
  x.restore();

  /* 磨损与水渍 */
  splotches(x, S, 26, ['58,42,22','44,34,20','96,76,48'], 10, 52, 0.28);
  const wet = x.createLinearGradient(0, S * 0.72, 0, S);
  wet.addColorStop(0, 'rgba(46,32,16,0)');
  wet.addColorStop(1, 'rgba(42,30,15,.45)');
  x.fillStyle = wet;
  x.fillRect(0, S * 0.72, S, S * 0.28);

  grain(x, S, 20);
  return finishTex(c, [1, 1]);
}

/* --------------------------------------------------------------------------
   铁丝网 —— 带 alpha 的菱形网
   一格 14px 铺 1.7m，菱形孔径约 9cm。
   比这更粗就变成渔网，比这更细就看不到。
   -------------------------------------------------------------------------- */
function makeFenceTex(){
  const S = 256, [c, x] = cvs(S);
  x.clearRect(0, 0, S, S);
  const step = 14;

  x.strokeStyle = 'rgba(150,156,162,1)';
  x.lineWidth = 1.55;
  x.lineCap = 'square';
  for (let i = -S; i < S * 2; i += step){
    x.beginPath(); x.moveTo(i, 0);     x.lineTo(i + S, S); x.stroke();
    x.beginPath(); x.moveTo(i, S);     x.lineTo(i + S, 0); x.stroke();
  }
  /* 一点内阴影，让铁丝有立体感 */
  x.globalAlpha = .45;
  x.strokeStyle = 'rgba(34,38,42,1)';
  x.lineWidth = 0.9;
  for (let i = -S; i < S * 2; i += step){
    x.beginPath(); x.moveTo(i + 1.4, 0); x.lineTo(i + S + 1.4, S); x.stroke();
  }
  x.globalAlpha = 1;

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = MAXANISO;
  t.encoding = THREE.sRGBEncoding;
  return t;
}

/* --------------------------------------------------------------------------
   砖墙（仓库外墙）
   -------------------------------------------------------------------------- */
function makeWallTex(){
  const S = 512, [c, x] = cvs(S);
  x.fillStyle = '#7a7168'; x.fillRect(0, 0, S, S);
  const bw = 64, bh = 26;
  for (let r = 0, y = 0; y < S; y += bh, r++){
    for (let xx = (r % 2 ? -bw / 2 : 0); xx < S; xx += bw){
      const v = randI(-16, 16);
      x.fillStyle = `rgb(${clamp(126+v,0,255)},${clamp(114+v,0,255)},${clamp(102+v,0,255)})`;
      x.fillRect(xx + 1.5, y + 1.5, bw - 3, bh - 3);
    }
  }
  splotches(x, S, 50, ['64,58,50','92,84,74','48,46,44','110,60,26'], 14, 80, 0.4);
  grain(x, S, 26);
  return finishTex(c, [1, 1]);
}

/* --------------------------------------------------------------------------
   弹孔贴花
   -------------------------------------------------------------------------- */
function makeHoleTex(){
  const S = 64, [c, x] = cvs(S);
  x.clearRect(0, 0, S, S);
  const g = x.createRadialGradient(S/2, S/2, 1, S/2, S/2, S/2);
  g.addColorStop(0,   'rgba(6,6,7,1)');
  g.addColorStop(.32, 'rgba(16,15,14,.95)');
  g.addColorStop(.55, 'rgba(60,56,50,.55)');
  g.addColorStop(1,   'rgba(90,86,80,0)');
  x.fillStyle = g;
  x.beginPath(); x.arc(S/2, S/2, S/2, 0, 7); x.fill();

  /* 边缘放射裂纹 */
  x.strokeStyle = 'rgba(150,146,138,.35)'; x.lineWidth = 1;
  for (let i = 0; i < 9; i++){
    const a  = Math.random() * 7;
    const r0 = S * 0.16, r1 = S * rand(.22, .42);
    x.beginPath();
    x.moveTo(S/2 + Math.cos(a) * r0, S/2 + Math.sin(a) * r0);
    x.lineTo(S/2 + Math.cos(a) * r1, S/2 + Math.sin(a) * r1);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

/* --------------------------------------------------------------------------
   柔光斑 —— 枪口火光核心、烟雾、粒子精灵的默认贴图
   -------------------------------------------------------------------------- */
function makeGlowTex(){
  const S = 128, [c, x] = cvs(S);
  const g = x.createRadialGradient(S/2, S/2, 0, S/2, S/2, S/2);
  g.addColorStop(0,   'rgba(255,255,255,1)');
  g.addColorStop(.22, 'rgba(255,236,180,.95)');
  g.addColorStop(.5,  'rgba(255,150,40,.45)');
  g.addColorStop(1,   'rgba(255,90,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

/* --------------------------------------------------------------------------
   星形枪口火光 —— 随机方向的 9 条星芒 + 中心热核
   -------------------------------------------------------------------------- */
function makeFlashTex(){
  const S = 128, [c, x] = cvs(S);
  x.translate(S/2, S/2);
  for (let i = 0; i < 9; i++){
    const a = Math.random() * 7;
    const len = rand(S * 0.22, S * 0.5), w = rand(4, 13);
    const g = x.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
    g.addColorStop(0, 'rgba(255,248,222,.95)');
    g.addColorStop(1, 'rgba(255,140,20,0)');
    x.fillStyle = g;
    x.save(); x.rotate(a);
    x.beginPath();
    x.moveTo(0, -w / 2); x.lineTo(len, 0); x.lineTo(0, w / 2);
    x.closePath(); x.fill();
    x.restore();
  }
  const g2 = x.createRadialGradient(0, 0, 0, 0, 0, S * 0.28);
  g2.addColorStop(0,   'rgba(255,255,255,1)');
  g2.addColorStop(.4,  'rgba(255,225,150,.8)');
  g2.addColorStop(1,   'rgba(255,140,20,0)');
  x.fillStyle = g2;
  x.beginPath(); x.arc(0, 0, S * 0.28, 0, 7); x.fill();
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

/* --------------------------------------------------------------------------
   贴图字典 —— 全局唯一实例，其他模块从这里取
   顺序无关，但 init 时全部生成一次（约 30ms，可接受）
   -------------------------------------------------------------------------- */
const TEX = {
  concrete : makeConcrete(),
  container: makeContainerTex(),
  barrel   : makeBarrelTex(),
  crate    : makeCrateTex(),
  fence    : makeFenceTex(),
  wall     : makeWallTex(),
  hole     : makeHoleTex(),
  glow     : makeGlowTex(),
  flash    : makeFlashTex()
};

/* 地面用一张单独克隆的混凝土贴图：repeat 是 1:1，而不是像共用那份一样 18x18。
   map.js 在铺地面和搭建掩体时会分别取这两份。 */
const TEX_CONCRETE_1 = TEX.concrete.clone();
TEX_CONCRETE_1.repeat.set(1, 1);
TEX_CONCRETE_1.needsUpdate = true;