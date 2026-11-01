'use strict';

// 选关图使用关卡本身的网格、材质与后期；独立世界不会改变游戏进度。
function renderLevelPreview(L, R) {
  const W = new World(L, 12345);
  const S = CHUNK * CELL;
  let x = (W.start.gx + 0.5) * CELL, z = (W.start.gz + 0.5) * CELL;
  let yaw = W.start.yaw, pitch = 0.02;
  if (L.gen === 'pools') {
    x = 22; z = 3.5; yaw = Math.atan2(6, -14.5); pitch = 0.08;
  } else if (L.gen === 'beach') {
    yaw = -0.55; pitch = -0.02; // 朝东北：一边是岩壁和沙滩，一边是海
  } else {
    // 选取能看见走廊、房间纵深的角度，避免封面正对墙面。
    let best = -1;
    for (let k = 0; k < 24; k++) {
      const a = k * Math.PI / 12;
      let score = 0;
      for (const offset of [-0.35, 0, 0.35]) {
        let d = 0.5;
        while (d < 28 && W.los(x, z, x - Math.sin(a + offset) * d, z - Math.cos(a + offset) * d)) d += 0.5;
        score += d * (offset === 0 ? 2 : 1);
      }
      if (score > best) { best = score; yaw = a; }
    }
  }
  const y = 1.62 + W.floorAt(x, z);
  const cx = Math.floor(x / S), cz = Math.floor(z / S);
  const b = W.poolBounds || { minX: cx - 1, maxX: cx + 1, minZ: cz - 1, maxZ: cz + 1 };
  const saved = {};
  for (const key of ['meshes', 'dyn', 'lp', 'lc', 'poolColumns', 'fb', 'cw', 'ch', 'sw', 'sh', 'scale', 'bloom']) saved[key] = R[key];
  const width = R.canvas.width, height = R.canvas.height;
  try {
    // 借用同一 WebGL 上下文和纹理，临时资源用完即释放。
    R.meshes = new Map(); R.dyn = { count: 0 };
    R.lp = new Float32Array(MAXL * 4); R.lc = new Float32Array(MAXL * 3);
    R.poolColumns = new Float32Array(MAX_POOL_COLUMNS * 4);
    R.fb = {}; R.sw = 1; R.sh = 1; R.scale = 1; R.bloom = true;
    R.resize(800, 450);
    const lights = [];
    for (let rz = b.minZ; rz <= b.maxZ; rz++) for (let rx = b.minX; rx <= b.maxX; rx++) {
      const c = W.chunk(rx, rz);
      const key = (rx & 0xffff) * 65536 + (rz & 0xffff);
      R.addChunkMesh(key, buildChunkMesh(c, W), rx, rz);
      for (const l of c.lights) lights.push(l);
    }
    lights.sort((a, b) => ((a.x - x) ** 2 + (a.z - z) ** 2) - ((b.x - x) ** 2 + (b.z - z) ** 2));
    const lightCount = Math.min(MAXL, lights.length);
    for (let i = 0; i < lightCount; i++) {
      const l = lights[i];
      R.lp.set([l.x, l.y, l.z, L.light.intensity * (l.power === undefined ? 1 : l.power)], i * 4);
      R.lc.set(L.light.color, i * 3);
    }
    let poolSun = [0, 0, 0, 1], poolSunTop = 0, poolSky = [0, 0, 1, 1], poolSkyHeights = [0, 0];
    let poolColumnCount = 0;
    if (W.poolBounds) {
      const room = W.poolRoom(cx, cz);
      const side = room.openings.find((a) => a.axis === 'x');
      if (side) {
        poolSun = [cx * S + side.x0, side.y, cz * S + side.z0, cz * S + side.z1];
        poolSunTop = side.y1;
      }
      const sky = room.openings.find((a) => a.axis === 'y');
      if (sky) {
        poolSky = [cx * S + sky.x0, cz * S + sky.z0, cx * S + sky.x1, cz * S + sky.z1];
        poolSkyHeights = [room.h, room.h + 1.1];
      }
      for (const c of room.columns.slice(0, MAX_POOL_COLUMNS)) {
        R.poolColumns.set([cx * S + c.x, cz * S + c.z, c.r, c.top], poolColumnCount++ * 4);
      }
    }
    const view = Mat4.create(), proj = Mat4.create(), vp = Mat4.create();
    Mat4.perspective(proj, Math.PI * 0.42, 800 / 450, 0.05, 120);
    Mat4.view(view, x, y, z, yaw, pitch, 0);
    Mat4.mul(vp, proj, view);
    const fwd = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    R.drawWorld({
      vp, lightCount, lightRadius: L.light.radius, ambient: L.ambient,
      cam: [x, y, z], fwd, fogCol: L.fog, fogDen: L.fogDen,
      flPos: [x, y - 0.12, z], flDir: fwd, flCol: [1, 0.9, 0.74], fl: 0,
      wallH: L.wallH, exposure: L.exposure, panelTint: L.light.panel,
      clear: tonemapJS(L.fog, L.exposure), time: 12,
      mist: L.mist ? [L.mist.den, L.mist.fall, 0] : [0, 0, 0], mistCol: L.mist ? L.mist.col : [0, 0, 0],
      joint: L.joint || 0, pool: L.water ? 1 : 0, touch: L.touch ? 1 : 0, waterHeight: L.water || 0,
      poolColumnCount, poolSun, poolSunTop, poolRoom: [cx, cz], poolSky, poolSkyHeights,
      beach: L.gen === 'beach' ? { rise: 0, front: BEACH.FRONT0, haze: 0, haunt: 0 } : null,
    });
    R.post({ time: 12, ins: 0, hurt: 0, fade: 0, glitch: 0,
      bloom: L.bloom === undefined ? 0.85 : L.bloom, grade: L.grade, heat: 0,
      invert: L.invert || 0, dark: L.noFlash ? 1 : 0, underwater: 0, clean: L.outdoor ? 1 : 0 });
    // 在当前帧内读取，兼容 preserveDrawingBuffer: false。
    return R.canvas.toDataURL('image/jpeg', 0.9);
  } finally {
    R.clearMeshes();
    for (const target of Object.values(R.fb)) R.freeTarget(target);
    Object.assign(R, saved);
    R.canvas.width = width; R.canvas.height = height;
    R.gl.bindFramebuffer(R.gl.FRAMEBUFFER, null);
    R.gl.viewport(0, 0, R.cw, R.ch);
  }
}
