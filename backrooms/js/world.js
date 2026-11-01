'use strict';
// ============================================================
//  按区块生成世界；Level 37 使用固定边界的有限池厅。
//  墙位于格子边上：wallW[i,j] 是格子 (i,j) 的 -X 边，wallN[i,j] 是 -Z 边。
//  每个区块只拥有自己的西边界(i=0)与北边界(j=0)，因此不需要相邻区块的数据。
// ============================================================

const I16 = (i, j) => (j << 4) | i;
const imod = (a, n) => ((a % n) + n) % n;

// Level 6 熄灯（参照《逃离后室》）：南边是出生的小房间和两侧储藏间；
// 中间第一段迷宫手电筒还能用，西北角的电脑室放着 LiDAR 扫描仪；
// 北边第二段迷宫伸手不见五指，东北角亮着灯的短走廊尽头是白色房门。迷宫用固定种子生成，每次都一样
const LIGHTS_OUT = (() => {
  const W = 41, H = 37, r = mulberry32(606);
  const g = Array.from({ length: H }, () => Array(W).fill('#'));
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const maze = (x0, z0, nx, nz, ch, loops) => {
    const vis = new Uint8Array(nx * nz), stack = [0];
    vis[0] = 1; g[z0][x0] = ch;
    while (stack.length) {
      const cur = stack[stack.length - 1], a = cur % nx, b = (cur / nx) | 0;
      const nb = DIRS.filter(([dx, dz]) => a + dx >= 0 && a + dx < nx && b + dz >= 0 && b + dz < nz && !vis[(b + dz) * nx + a + dx]);
      if (!nb.length) { stack.pop(); continue; }
      const [dx, dz] = nb[Math.floor(r() * nb.length)], n = (b + dz) * nx + a + dx;
      vis[n] = 1; stack.push(n);
      g[z0 + 2 * b + dz][x0 + 2 * a + dx] = ch;
      g[z0 + 2 * (b + dz)][x0 + 2 * (a + dx)] = ch;
    }
    // 打通少量墙体形成回路，给躲避实体留出绕路的余地
    for (let b = 0; b < nz; b++) for (let a = 0; a < nx; a++) {
      if (a < nx - 1 && r() < loops) g[z0 + 2 * b][x0 + 2 * a + 1] = ch;
      if (b < nz - 1 && r() < loops) g[z0 + 2 * b + 1][x0 + 2 * a] = ch;
    }
  };
  const fill = (x0, z0, x1, z1, ch) => { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) g[z][x] = ch; };
  maze(1, 1, 17, 7, ',', 0.12); // 第二段：全黑
  maze(1, 19, 20, 6, '.', 0.22); // 第一段：手电筒可用，回路多一些
  // 第一段打通两条笔直的主干道：出生房北门一路向北，再沿中间横贯东西，西端直通电脑室
  fill(21, 25, 21, 29, '.'); fill(1, 25, 39, 25, '.'); fill(3, 19, 3, 25, '.');
  fill(17, 31, 23, 35, 'S'); g[30][21] = '.'; // 出生的房间，北门通向第一段
  fill(11, 32, 15, 34, 'L'); g[33][16] = 'L'; // 左：杏仁水储藏间
  fill(25, 32, 29, 34, 'R'); g[33][24] = 'R'; // 右：电池储藏间
  fill(2, 15, 8, 17, 'C'); g[18][3] = 'C'; g[14][7] = 'C'; // 电脑室：南接第一段，北接第二段
  fill(34, 7, 37, 7, 'E'); // 通往白色房门的短走廊
  return { W, H, rows: g.map((row) => row.join('')) };
})();
const LO_ZONE = { '.': 1, S: 2, L: 2, R: 2, ',': 3, C: 4, E: 5 }; // 1 第一段 2 出生区 3 第二段（全黑）4 电脑室 5 出口走廊
const LO_LIGHTS = [[13, 33, 0], [27, 33, 1], [5, 16, 1], [35, 7, 0]]; // 格子坐标 + 类型（0 常亮 1 闪烁）
const LO_ITEMS = [
  ['lo:a1', 'almond', 11.6, 32.6], ['lo:a2', 'almond', 13.4, 32.6], ['lo:a3', 'almond', 15, 34.3],
  ['lo:b1', 'battery', 25.8, 32.6], ['lo:b2', 'battery', 27.6, 32.6], ['lo:b3', 'battery', 29, 34.3],
  ['lo:lidar', 'lidar', 4.375, 15.35],
];
const LO_PROPS = [
  { x0: 22.2, z0: 64.1, x1: 31.8, z1: 64.55, y0: 0, y1: 1.9, tex: TEX.METAL }, // 储藏间靠北墙的货架
  { x0: 50.2, z0: 64.1, x1: 59.8, z1: 64.55, y0: 0, y1: 1.9, tex: TEX.METAL },
  { x0: 5, z0: 30.1, x1: 12.5, z1: 31.1, y0: 0, y1: 0.8, tex: TEX.DESK }, // 电脑室的长桌和显示器
  { x0: 5.4, z0: 30.2, x1: 6.8, z1: 30.6, y0: 0.8, y1: 1.4, tex: TEX.MONITOR },
  { x0: 10.6, z0: 30.2, x1: 12, z1: 30.6, y0: 0.8, y1: 1.4, tex: TEX.MONITOR },
  { x0: 4.2, z0: 34.5, x1: 5.4, z1: 35.8, y0: 0, y1: 1.1, tex: TEX.PC_FRONT },
];

// Level Fun =) 剧情版：封闭的一层甲板，不是迷宫。一条东西向的主走廊，两侧是派对客舱；
// 北边正中是宴会厅，舞台后面锁着后台（出口海报在那里）；走廊东端是上锁的船长室
const PARTY = (() => {
  const W = 40, H = 19;
  const g = Array.from({ length: H }, () => new Uint8Array(W));
  const rooms = [];
  const room = (name, x0, z0, x1, z1, deco) => {
    const id = rooms.length + 1;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) g[z][x] = id;
    rooms.push({ id, name, x0, z0, x1, z1, deco });
  };
  room('走廊', 1, 11, 38, 12, false);
  room('宴会厅', 12, 4, 27, 10, false);
  room('后台', 15, 1, 24, 3, false);
  room('船长室', 33, 5, 38, 10, false);
  room('', 1, 6, 5, 10, true); room('', 6, 6, 11, 10, true); room('', 28, 6, 32, 10, true);
  room('你的客舱', 1, 13, 5, 17, false);
  room('', 6, 13, 11, 17, true); room('', 12, 13, 18, 17, true); room('', 19, 13, 25, 17, true);
  room('', 26, 13, 31, 17, true); room('', 32, 13, 38, 17, true);
  // 门洞都开在格子的北边：N,x,z 表示格子 (x,z) 与 (x,z-1) 之间
  const doors = new Set();
  for (const x of [3, 9, 16, 23, 30, 36]) doors.add('N,' + x + ',11');
  for (const x of [3, 9, 15, 22, 28, 35]) doors.add('N,' + x + ',13');
  doors.add('N,20,4');
  return {
    W, H, g, rooms, doors,
    // 船长室的门要钥匙；后台的门在关掉派对广播后才会松开
    gates: [
      { id: 'K', west: false, gx: 36, gz: 11 },
      { id: 'T', west: false, gx: 20, gz: 4 },
    ],
  };
})();
const PARTY_PROPS = [
  { x0: 10.1, z0: 29.9, x1: 11.7, z1: 31.3, y0: 0, y1: 0.75, tex: TEX.CLOTH, cell: [5, 15] }, // 你客舱里放请柬的小桌
  { x0: 34.2, z0: 13.3, x1: 45.8, z1: 15.3, y0: 0, y1: 0.75, tex: TEX.CLOTH, cells: [17, 22, 6, 7] }, // 宴会厅的长桌与大蛋糕
  { x0: 39.3, z0: 13.7, x1: 40.7, z1: 14.9, y0: 0.75, y1: 1.15, tex: TEX.CAKE },
  { x0: 36.2, z0: 13.9, x1: 36.8, z1: 14.5, y0: 0.75, y1: 0.98, tex: TEX.CAKE },
  { x0: 42.8, z0: 13.9, x1: 43.4, z1: 14.5, y0: 0.75, y1: 0.98, tex: TEX.CAKE },
  { x0: 69.4, z0: 10.2, x1: 74.6, z1: 11.4, y0: 0, y1: 0.8, tex: TEX.DESK, cells: [34, 37, 5, 5] }, // 船长的办公桌
];

// Level 994「存在于此」：一片朝东的海滩，西、北、南三面是岩壁。
// 你从南端刻着 EXIST 的铁门进来，身后的门随即消失；北端还有一道同样的铁门。
// 沙滩从岩壁脚下的干沙坡向大海，退潮时海面高度为 0；涨潮时海面整体上涨，
// 涨潮前锋以南的海面还会迅速抬高，把沙滩一路吞掉。地形剖面与海面高度在着色器里有一份相同的实现
const BEACH = (() => {
  const NZ = 3, SZ = 156; // 可走的沙滩：格子 z ∈ [NZ, SZ)，北(-z)端与南(+z)端之外都是岩壁
  const cliff = (z) => 8 + 3.2 * Math.sin(z * 0.031 + 0.7) + 1.6 * Math.sin(z * 0.083 + 2.1) + 0.7 * Math.sin(z * 0.21);
  // 退潮时沙滩的宽度（岩脚到水线）；z≈105 与 z≈205 两处岩壁逼近海面，只剩一条窄窄的沙带
  const width = (z) => 27 + 6 * Math.sin(z * 0.019 + 1.3) + 3.5 * Math.sin(z * 0.061 + 0.4)
    - 15 * Math.exp(-(((z - 205) / 12) ** 2)) - 14 * Math.exp(-(((z - 105) / 11) ** 2));
  const berm = (z) => 2.4 + 0.4 * Math.sin(z * 0.05 + 0.3); // 岩脚处干沙的高度
  const gateX = (gz) => Math.round(cliff(gz * CELL) / CELL) + 3;
  return {
    NZ, SZ, cliff, width, berm, FLOOD: 0.09, UNDER: 0.07,
    FRONT0: SZ * CELL + 10, // 涨潮前锋从南端的岩壁之外出发
    exitGx: gateX(NZ), startGx: gateX(SZ - 4) + 2,
  };
})();

// 平滑的沙滩剖面（不含起伏）：岩脚处最高，向海缓降，水线以下继续以固定坡度没入海中
function beachProfile(x, z) {
  const c = BEACH.cliff(z), s = c + BEACH.width(z);
  if (x < s) return BEACH.berm(z) * Math.pow(clamp((s - x) / (s - c), 0, 1.3), 0.75);
  return Math.max(-6, -(x - s) * BEACH.UNDER);
}
// 实际地面：远离水边的干沙上叠加风吹出的沙丘起伏
function beachGround(x, z) {
  const s = BEACH.cliff(z) + BEACH.width(z);
  const dry = smoothstep(3, 10, s - x);
  if (dry <= 0) return beachProfile(x, z);
  return beachProfile(x, z) + dry * ((vnoise(x * 0.16, z * 0.12, 941) - 0.5) * 0.6 + (vnoise(x * 0.7, z * 0.55, 942) - 0.5) * 0.08);
}
// 海面高度。tide.rise：整体上涨；tide.front：涨潮前锋所在的 z；time 决定浪花冲上沙滩的相位
function beachSea(z, tide, time) {
  return tide.rise + clamp((z - tide.front) * BEACH.FLOOD, 0, 3.2) + 0.12 * (0.5 + 0.5 * Math.sin(time * 0.8 + z * 0.043));
}
// 某个海面高度对应的水线 x（地图用，按平滑剖面反解）
function beachWaterline(z, y) {
  const c = BEACH.cliff(z), s = c + BEACH.width(z), H = BEACH.berm(z);
  if (y <= 0) return s - y / BEACH.UNDER;
  return s - (s - c) * Math.pow(Math.min(1.3, y / H), 1 / 0.75);
}

// Level 3 剧情版：6×6 街区的封闭电站（格子 0..36）。中央是控制区，
// 西 A、东 B、北 C 三个分区各被一整条封死的走廊隔开，只留一道闸门相通
const PLANT = {
  size: 36,
  // [bz][bx]：0 实心 1 发电机房 2 流水线 3 锅炉房 4 控制室 5 值班室 / 仓库
  map: [
    [0, 2, 1, 0, 0, 5],
    [1, 0, 2, 5, 3, 0],
    [3, 0, 4, 3, 2, 0],
    [0, 2, 0, 2, 1, 0],
    [5, 0, 5, 0, 0, 2],
    [0, 3, 0, 3, 3, 0],
  ],
  // 每个房间的门朝向，只开向同一分区内的走廊
  doors: {
    '1,0': 'S', '2,0': 'S', '5,0': 'SW',
    '0,1': 'E', '2,1': 'E', '3,1': 'W', '4,1': 'E',
    '0,2': 'N', '2,2': 'SE', '3,2': 'W', '4,2': 'N',
    '1,3': 'W', '3,3': 'W', '4,3': 'E',
    '0,4': 'E', '2,4': 'NE', '5,4': 'W',
    '1,5': 'N', '3,5': 'W', '4,5': 'N',
  },
  // 发电机房中心格 → 编号（1 在 A 区，2 在 B 区，3 在 C 区）
  gens: { '3,9': 1, '27,21': 2, '15,3': 3 },
  // 闸门：cell 是闸门所在的走廊格（属于控制区一侧），栅栏立在它的西 / 北边
  gates: [
    { id: 'A', west: true, gx: 12, gz: 18, cell: '12,18' },
    { id: 'B', west: true, gx: 25, gz: 24, cell: '24,24' },
    { id: 'C', west: false, gx: 18, gz: 12, cell: '18,12' },
  ],
};

class World {
  constructor(level, seed) {
    this.L = level;
    this.seed = seed >>> 0;
    this.chunks = new Map();
    this.picked = new Set();
    this._lk = null; this._lc = null;
    this._boxes = [];
    this.start = level.gen === 'tunnels' || level.gen === 'station' ? { gx: 6, gz: 6, yaw: 0 } : { gx: 8, gz: 8, yaw: 0 };
    if (level.gen === 'lightsout') this.start = { gx: 20, gz: 34, yaw: 0 }; // 出生房间里，面朝通往迷宫的北门
    this.forced = new Map(); // Level 3：被强制指定类型的街区
    this.gensOn = new Set();
    this.poolRooms = new Map();
    this.poolBounds = level.gen === 'pools' ? { minX: -2, maxX: 0, minZ: 0, maxZ: 2 } : null;
    if (level.gen === 'pools') this.start = { gx: 8, gz: 1, yaw: Math.PI };
    this.plant = level.story === 'station' ? this.makePlant() : null;
    this.party = level.story === 'party' ? this.makeParty() : null;
    this.gates = this.plant ? this.plant.gates : this.party ? this.party.gates : null;
    // 有限地图：一次加载全部区块，范围外是实心
    if (level.gen === 'beach') this.start = { gx: BEACH.startGx, gz: BEACH.SZ - 4, yaw: 0.25 }; // 背对进来的铁门，面朝北偏东（看得见海）
    this.fixedBounds = this.poolBounds || (this.plant || level.closed ? level.bounds || { minX: 0, maxX: 2, minZ: 0, maxZ: 2 } : null);
    this.exit = null;
    this.placeExit();
    if (this.fixedBounds) this.poolOutside = this.generate(this.fixedBounds.minX - 1, this.fixedBounds.minZ - 1);
  }

  // 剧情电站的固定布局：闸门、剧情物件、发电机位置。物件坐标都按街区推算
  makePlant() {
    const B = this.L.block, T = WALL_T + 0.012;
    const room = (bx, bz) => ({ x0: (bx * B + 1) * CELL, z0: (bz * B + 1) * CELL, x1: (bx * B + B) * CELL, z1: (bz * B + B) * CELL });
    const desk = (bx, bz) => { const r = room(bx, bz); return { x: r.x0 + 2.25, z: r.z1 - 2, y: 0.8 }; };
    const ctl = room(2, 2);
    this.start = { gx: 2 * B + 3, gz: 2 * B + 4, yaw: 0 }; // 控制室里，面朝值班控制台
    const gate = (id) => PLANT.gates.find((g) => g.id === id);
    const gA = gate('A'), gB = gate('B'), gC = gate('C');
    const gens = Object.entries(PLANT.gens).map(([k, no]) => {
      const [gx, gz] = k.split(',').map(Number);
      return { id: k, no, x: (gx + 0.5) * CELL, z: (gz + 0.5) * CELL };
    }).sort((a, b) => a.no - b.no);
    return {
      flags: { read: false, key: false, fuse: false, gen1: false, gen2: false, gen3: false, main: false },
      gates: PLANT.gates.map((g) => ({ ...g, lift: 0, open: false })),
      open: new Set(PLANT.gates.map((g) => g.cell)),
      gens,
      objs: [
        { kind: 'console', x: ctl.x0 + 5, z: ctl.z0 + 1.25, y: 1.0 },
        { kind: 'switch', x: ctl.x0 + 0.95, z: ctl.z0 + 5, y: 1.3 },
        { kind: 'key', ...desk(2, 4) },
        { kind: 'fuse', ...desk(5, 0) },
        { kind: 'note', id: 'A', ...desk(0, 4) },
        { kind: 'note', id: 'C', ...desk(3, 1) },
        // 闸门旁的控制面板：贴在控制区一侧的墙上
        { kind: 'panel', gate: 'A', x: gA.gx * CELL + 1, z: gA.gz * CELL + T, nx: 0, nz: 1, y: 1.3 },
        { kind: 'panel', gate: 'B', x: gB.gx * CELL - 1, z: gB.gz * CELL + T, nx: 0, nz: 1, y: 1.3 },
        { kind: 'panel', gate: 'C', x: gC.gx * CELL + T, z: gC.gz * CELL + 1, nx: 1, nz: 0, y: 1.3 },
      ],
    };
  }

  plantGate(id) { return this.plant.gates.find((g) => g.id === id); }

  // Level Fun =) 剧情：请柬 → 宴会厅的钥匙 → 船长室 → 航海日志 → 关掉广播 → 后台的颠倒海报
  makeParty() {
    const T = WALL_T + 0.012;
    this.start = { gx: 3, gz: 15, yaw: 0 }; // 你的客舱里，面朝通向走廊的门
    return {
      flags: { invite: false, key: false, door: false, log: false, radio: false },
      gates: PARTY.gates.map((g) => ({ ...g, lift: 0, open: false })),
      objs: [
        { kind: 'invite', x: 10.9, z: 30.6, y: 0.75 },
        { kind: 'key', x: 44.6, z: 14.3, y: 0.75 },
        { kind: 'lock', gate: 'K', x: 37 * CELL + 0.6, z: 11 * CELL + T, nx: 0, nz: 1, y: 1.3 },
        { kind: 'log', x: 71.2, z: 10.8, y: 0.8 },
        { kind: 'radio', x: 39 * CELL - T, z: 8 * CELL, nx: -1, nz: 0, y: 1.4 },
        { kind: 'lock', gate: 'T', x: 21 * CELL + 0.6, z: 4 * CELL + T, nx: 0, nz: 1, y: 1.3 },
      ],
    };
  }

  partyGate(id) { return this.party.gates.find((g) => g.id === id); }

  partyZone(gx, gz) {
    const M = PARTY;
    return gx < 0 || gz < 0 || gx >= M.W || gz >= M.H ? 0 : M.g[gz][gx];
  }

  // 所属分区：A 西 / B 东 / C 北 / H 控制区（闸门格都算控制区）
  plantRegion(gx, gz) {
    return gx < 12 ? 'A' : gx > 24 ? 'B' : gz < 12 ? 'C' : 'H';
  }

  // 分区照明：对应的发电机启动前只剩一点应急余光
  plantPower(x, z) {
    const r = this.plantRegion(Math.floor(x / CELL), Math.floor(z / CELL)), F = this.plant.flags;
    const on = r === 'H' || (r === 'A' && F.gen1) || (r === 'B' && F.gen2) || (r === 'C' && F.gen3);
    return on ? 1 : 0.06;
  }

  // 闸门在升到头顶以上之前都算挡路
  gateShut(west, gx, gz) {
    for (const g of this.gates) if (g.west === west && g.gx === gx && g.gz === gz) return g.lift < 0.65;
    return false;
  }

  placeExit() {
    const L = this.L;
    if (L.gen === 'lightsout') {
      // 白色房门开在出口走廊尽头那一格的北墙上
      const gx = 37, gz = 7;
      this.exit = { gx, gz, x: (gx + 0.5) * CELL, z: gz * CELL + WALL_T + 0.012, nx: 0, nz: 1 };
      return;
    }
    if (L.gen === 'beach') {
      // 出口：北端岩壁脚下的铁门；入口的铁门在南端，只是个摆设
      const gx = BEACH.exitGx, gz = BEACH.NZ;
      this.exit = { gx, gz, x: (gx + 0.5) * CELL, z: gz * CELL + WALL_T + 0.35, nx: 0, nz: 1 };
      const ex = (BEACH.startGx - 2 + 0.5) * CELL;
      this.entryGate = { x: ex, z: BEACH.SZ * CELL - WALL_T - 0.35, nx: 0, nz: -1 };
      this.exit.y = beachGround(this.exit.x, this.exit.z + 0.6);
      this.entryGate.y = beachGround(ex, this.entryGate.z - 0.6);
      return;
    }
    if (L.gen === 'party') {
      // 颠倒的海报贴在后台北墙正中
      const gx = 20, gz = 1;
      this.exit = { gx, gz, x: (gx + 0.5) * CELL, z: gz * CELL + WALL_T + 0.012, nx: 0, nz: 1 };
      return;
    }
    if (L.gen === 'pools') {
      const gx = this.poolBounds.minX * CHUNK + 8, gz = this.poolBounds.maxZ * CHUNK + 9;
      this.exit = { gx, gz, x: (gx + 0.5) * CELL, z: (gz + 0.5) * CELL, nx: 0, nz: 1 };
      return;
    }
    if (L.gen === 'corridor') {
      this.start = { gx: 0, gz: 6, yaw: -Math.PI / 2 };
      const ex = L.corridorLen * CELL;
      this.exit = { gx: L.corridorLen - 1, gz: 6, x: ex - WALL_T - 0.012, z: 7 * CELL, nx: -1, nz: 0, end: true };
      return;
    }
    const r = mulberry32(this.seed ^ 0x5bd1e995);
    // 封闭的隧道层：出口只落在出生点东南方向，保证在边界之内
    const ang = L.closed ? r() * Math.PI / 2 : r() * Math.PI * 2;
    const dist = L.exitDist[0] + r() * (L.exitDist[1] - L.exitDist[0]);
    let gx = Math.round(this.start.gx + Math.cos(ang) * dist);
    let gz = Math.round(this.start.gz + Math.sin(ang) * dist);
    const lx = gx & 15, lz = gz & 15;
    if (L.gen === 'tunnels') {
      // 出口放在节点东侧的隧道格里：它的北侧一定是实心混凝土
      const a = clamp(Math.round((lx - 3) / 4), 0, 2), b = clamp(Math.round((lz - 2) / 4), 0, 3);
      gx = (gx & ~15) + 3 + a * 4;
      gz = (gz & ~15) + 2 + b * 4;
    } else if (this.plant) {
      // 电梯开在控制区最南端走廊的北墙上，北侧街区是实心
      gx = 2 * L.block + 3; gz = PLANT.size;
      this.exit = { gx, gz, x: (gx + 0.5) * CELL, z: gz * CELL + WALL_T + 0.012, nx: 0, nz: 1 };
      return;
    } else if (L.gen === 'station') {
      // 电梯开在走廊北墙上，北侧街区强制为实心
      const B = L.block;
      gz = Math.round(gz / B) * B;
      gx = Math.floor(gx / B) * B + 3;
      this.forced.set(Math.floor(gx / B) + ',' + (gz / B - 1), 0);
      // 出生点周围三个方向各保证有一间发电机房
      const a0 = r() * Math.PI * 2;
      for (let k = 0; k < 3; k++) {
        const a = a0 + k * 2.094, d = 2 + r() * 1.5;
        let bx = Math.round(1 + Math.cos(a) * d), bz = Math.round(1 + Math.sin(a) * d);
        while (this.forced.has(bx + ',' + bz)) bx++;
        this.forced.set(bx + ',' + bz, 1);
      }
    } else if (L.gen === 'office') {
      gx = (gx & ~15) + 3;
      gz = gz & ~15; // 楼梯间开在办公楼的实墙上，外侧过道保持畅通
    } else if (L.gen === 'ship') {
      // 海报贴在船舱走廊的北墙上
      gz = Math.round(gz / 4) * 4;
      if (imod(gx, 15) === 0) gx += 1;
    } else {
      if (lx < 1) gx += 1 - lx; else if (lx > 14) gx -= lx - 14;
      if (lz < 1) gz += 1 - lz; else if (lz > 14) gz -= lz - 14;
    }
    if (L.exitKind === 'pit') this.exit = { gx, gz, x: (gx + 0.5) * CELL, z: (gz + 0.5) * CELL, nx: 0, nz: 1 };
    else this.exit = { gx, gz, x: (gx + 0.5) * CELL, z: gz * CELL + WALL_T + 0.012, nx: 0, nz: 1 };
    this.start.yaw = L.gen === 'pools' ? Math.PI : r() * Math.PI * 2;
  }

  containsChunk(cx, cz) {
    const b = this.fixedBounds;
    return !b || (cx >= b.minX && cx <= b.maxX && cz >= b.minZ && cz <= b.maxZ);
  }

  chunk(cx, cz) {
    if (!this.containsChunk(cx, cz)) return this.poolOutside;
    const k = (cx & 0xffff) * 65536 + (cz & 0xffff);
    if (k === this._lk) return this._lc;
    let c = this.chunks.get(k);
    if (!c) {
      c = this.generate(cx, cz);
      this.chunks.set(k, c);
    }
    this._lk = k; this._lc = c;
    return c;
  }
  peekChunk(cx, cz) {
    return this.chunks.get((cx & 0xffff) * 65536 + (cz & 0xffff));
  }

  wallW(gx, gz) { return this.chunk(gx >> 4, gz >> 4).wallW[((gz & 15) << 4) | (gx & 15)]; }
  wallN(gx, gz) { return this.chunk(gx >> 4, gz >> 4).wallN[((gz & 15) << 4) | (gx & 15)]; }
  pillar(gx, gz) { return this.chunk(gx >> 4, gz >> 4).pillar[((gz & 15) << 4) | (gx & 15)]; }
  blocked(gx, gz) { return this.chunk(gx >> 4, gz >> 4).block[((gz & 15) << 4) | (gx & 15)]; }
  // 铁栅栏：挡路但不挡视线（剧情电站的闸门也算栅栏）
  barW(gx, gz) { return this.chunk(gx >> 4, gz >> 4).barW[((gz & 15) << 4) | (gx & 15)] || (this.gates !== null && this.gateShut(true, gx, gz)); }
  barN(gx, gz) { return this.chunk(gx >> 4, gz >> 4).barN[((gz & 15) << 4) | (gx & 15)] || (this.gates !== null && this.gateShut(false, gx, gz)); }

  canMove(gx, gz, dx, dz) {
    // 熄灯层的实体只在全黑的第二段里游荡
    if (this.L.gen === 'lightsout' && this.loZone(gx, gz) === 3 && this.loZone(gx + dx, gz + dz) !== 3) return false;
    if (dx === 1) return !this.wallW(gx + 1, gz) && !this.barW(gx + 1, gz) && !this.blocked(gx + 1, gz);
    if (dx === -1) return !this.wallW(gx, gz) && !this.barW(gx, gz) && !this.blocked(gx - 1, gz);
    if (dz === 1) return !this.wallN(gx, gz + 1) && !this.barN(gx, gz + 1) && !this.blocked(gx, gz + 1);
    return !this.wallN(gx, gz) && !this.barN(gx, gz) && !this.blocked(gx, gz - 1);
  }

  // Level 37：2 表示通往出口的深水，其他池子也有深度，但不会随便传送
  deepAt(x, z) {
    if (this.L.gen !== 'pools') return 0;
    const S = CHUNK * CELL, cx = Math.floor(x / S), cz = Math.floor(z / S);
    if (!this.containsChunk(cx, cz)) return 0;
    const p = this.poolRoom(cx, cz), lx = imod(x, S), lz = imod(z, S);
    return p.exit && lx >= 8 && lx <= 24 && lz >= 17 && lz <= 27 ? 2 : 0;
  }

  // 台阶与池底共用这份高度，画面和玩家脚下不会分开
  floorAt(x, z) {
    if (this.L.gen === 'beach') return beachGround(x, z);
    if (!this.L.water) return 0;
    const S = CHUNK * CELL, p = this.poolRoom(Math.floor(x / S), Math.floor(z / S));
    if (!p) return 0.62;
    // 半米一格，与池底网格一致；台阶的每级高度不超过 0.3m
    const lx = Math.floor(imod(x, S) * 2) / 2 + 0.25, lz = Math.floor(imod(z, S) * 2) / 2 + 0.25;
    const deck = 0.62;
    let y = deck;
    if (p.kind === 0) {
      if (lx >= 4 && lx < 28 && lz >= 8 && lz < 28) {
        y = lz < 13 ? -0.18 : lz < 17 ? -0.18 - (Math.floor((lz - 13) * 2) + 1) * 0.18 : -1.62;
      }
      if (lx >= 14 && lx < 18 && lz >= 4 && lz < 8) y = deck - (Math.floor((lz - 4) * 2) + 1) * 0.1;
    } else if (p.kind === 1) {
      if (lx >= 3 && lx < 29 && lz >= 3 && lz < 29) y = -0.25;
      if (lx >= 13 && lx < 19 && lz >= 1.5 && lz < 3) y = deck - (Math.floor((lz - 1.5) * 2) + 1) * 0.29;
    } else if (p.kind === 2) {
      if (lx >= 4 && lx < 28 && lz >= 6 && lz < 28 && (lx < 14 || lx >= 18)) y = -1.18;
      if (((lx >= 6 && lx < 10) || (lx >= 22 && lx < 26)) && lz >= 3 && lz < 6) y = deck - (Math.floor((lz - 3) * 2) + 1) * 0.3;
    } else if (p.kind === 3) {
      if (lx >= 4 && lx < 28 && lz >= 6 && lz < 28) y = -3.1;
      if (lx >= 12 && lx < 20 && lz >= 3 && lz < 10) y = deck - (Math.floor((lz - 3) * 2) + 1) * (3.72 / 14);
    } else {
      if (lx >= 4 && lx < 28 && lz >= 4 && lz < 28) y = -0.58;
      if (lx >= 13 && lx < 19 && lz >= 1 && lz < 4) y = deck - (Math.floor((lz - 1) * 2) + 1) * 0.2;
    }
    // 滑道上方的平台和登高台阶，同样是实际地形
    if (p.slide) {
      if (lx >= 3 && lx < 7 && lz >= 3 && lz < 10) y = deck + (Math.floor((lz - 3) * 2) + 1) * (2.68 / 14);
      if (lx >= 3 && lx < 7 && lz >= 10 && lz < 13) y = 3.3;
    }
    return y;
  }

  // ---------------------------------------------------------
  //  生成
  // ---------------------------------------------------------
  generate(cx, cz) {
    const r = mulberry32(ihash(cx, cz, this.seed));
    const c = {
      cx, cz,
      wallW: new Uint8Array(256), wallN: new Uint8Array(256),
      lintW: new Uint8Array(256), lintN: new Uint8Array(256),
      pillar: new Uint8Array(256), block: new Uint8Array(256),
      barW: new Uint8Array(256), barN: new Uint8Array(256), deep: null,
      lights: [], items: [], props: [], puddles: [], decals: [], vents: [], windows: [],
      gens: [], posters: [], balloons: [], wires: [], fixtures: [], dispensers: [], rocks: [],
      empty: false,
    };
    if (!this.containsChunk(cx, cz)) {
      c.empty = true;
      c.block.fill(1);
      c.wallW.fill(1);
      c.wallN.fill(1);
      return c;
    }
    switch (this.L.gen) {
      case 'rooms': this.genRooms(c, r); break;
      case 'halls': this.genHalls(c, r); break;
      case 'warehouse': this.genWarehouse(c, r); break;
      case 'maze': this.genMaze(c, r); break;
      case 'tunnels': this.genTunnels(c, r); break;
      case 'office': this.genOffice(c, r); break;
      case 'house': this.genHouse(c, r); break;
      case 'station': this.genStation(c, r); break;
      case 'pools': this.genPools(c, r); break;
      case 'ship': this.genShip(c, r); break;
      case 'corridor': this.genCorridor(c, r); break;
      case 'lightsout': this.genLightsOut(c); break;
      case 'party': this.genParty(c); break;
      case 'beach': this.genBeach(c); break;
    }
    this.fixExit(c);
    if (!c.empty) {
      this.genLights(c, r);
      this.genItems(c, r);
      if (this.L.puddles) this.genPuddles(c, r);
      if (this.L.decals) this.genDecals(c, r);
      if (this.L.steam) this.genVents(c, r);
      if (this.L.windows) this.genWindows(c, r);
      if (this.L.hallDecor) this.genHallDecor(c, r);
    }
    return c;
  }

  nearStart(gx, gz, d) {
    return Math.abs(gx - this.start.gx) <= d && Math.abs(gz - this.start.gz) <= d;
  }

  genBorder(c, r, pWall, minGaps, lintel) {
    for (const axis of [0, 1]) {
      const arr = axis === 0 ? c.wallW : c.wallN;
      const larr = axis === 0 ? c.lintW : c.lintN;
      const idx = (q) => (axis === 0 ? I16(0, q) : I16(q, 0));
      let p = 0;
      while (p < 16) {
        const seg = 2 + Math.floor(r() * 5);
        const on = r() < pWall;
        const end = Math.min(16, p + seg);
        for (let q = p; q < end; q++) arr[idx(q)] = on ? 1 : 0;
        if (on && end - p >= 4 && r() < 0.5) {
          const q = p + 1 + Math.floor(r() * (end - p - 2));
          arr[idx(q)] = 0;
          if (r() < lintel) larr[idx(q)] = 1;
        }
        p = end;
      }
      let open = 0;
      for (let q = 0; q < 16; q++) if (!arr[idx(q)]) open++;
      let guard = 0;
      while (open < minGaps && guard++ < 50) {
        const q = Math.floor(r() * 16);
        if (arr[idx(q)]) { arr[idx(q)] = 0; open++; if (r() < lintel) larr[idx(q)] = 1; }
      }
    }
  }

  bsp(c, r, x0, z0, x1, z1, minRoom, depth, o) {
    const w = x1 - x0, h = z1 - z0;
    const canV = w >= minRoom * 2, canH = h >= minRoom * 2;
    if (!canV && !canH) return;
    if (depth > 0 && r() < o.stop * (w * h <= o.bigArea ? 1 : 0.25)) return;
    let vertical;
    if (canV && canH) vertical = w > h * 1.3 ? true : h > w * 1.3 ? false : r() < 0.5;
    else vertical = canV;
    if (vertical) {
      const sx = x0 + minRoom + Math.floor(r() * (w - 2 * minRoom + 1));
      for (let z = z0; z < z1; z++) c.wallW[I16(sx, z)] = 1;
      this.cutDoors(c, r, 0, sx, z0, z1, o);
      this.bsp(c, r, x0, z0, sx, z1, minRoom, depth + 1, o);
      this.bsp(c, r, sx, z0, x1, z1, minRoom, depth + 1, o);
    } else {
      const sz = z0 + minRoom + Math.floor(r() * (h - 2 * minRoom + 1));
      for (let x = x0; x < x1; x++) c.wallN[I16(x, sz)] = 1;
      this.cutDoors(c, r, 1, sz, x0, x1, o);
      this.bsp(c, r, x0, z0, x1, sz, minRoom, depth + 1, o);
      this.bsp(c, r, x0, sz, x1, z1, minRoom, depth + 1, o);
    }
  }

  cutDoors(c, r, axis, line, a0, a1, o) {
    const len = a1 - a0;
    const n = 1 + Math.floor(len / o.doorEvery) + (r() < 0.3 ? 1 : 0);
    const arr = axis === 0 ? c.wallW : c.wallN;
    const larr = axis === 0 ? c.lintW : c.lintN;
    for (let k = 0; k < n; k++) {
      const p = a0 + Math.floor(r() * len);
      const wide = r() < o.wideDoor ? 2 : 1;
      const lint = r() < o.lintel;
      for (let q = p; q < Math.min(a1, p + wide); q++) {
        const idx = axis === 0 ? I16(line, q) : I16(q, line);
        arr[idx] = 0;
        if (lint) larr[idx] = 1;
      }
    }
  }

  cornerFree(c, i, j) {
    return !c.wallW[I16(i, j)] && !c.wallW[I16(i, j - 1)] && !c.wallN[I16(i, j)] && !c.wallN[I16(i - 1, j)];
  }

  genRooms(c, r) {
    this.genBorder(c, r, 0.62, 2, 0.5);
    this.bsp(c, r, 0, 0, 16, 16, 2, 0, { stop: 0.22, bigArea: 20, doorEvery: 5, wideDoor: 0.3, lintel: 0.55 });
    const ox = c.cx * 16, oz = c.cz * 16;
    for (let j = 0; j < 16; j++) {
      for (let i = 0; i < 16; i++) {
        const open = fbm((ox + i) / 22, (oz + j) / 22, this.seed + 3, 2);
        const pr = open > 0.63 ? 0.72 : 0.06;
        const k = I16(i, j);
        if (c.wallW[k] && r() < pr) c.wallW[k] = 0;
        if (c.wallN[k] && r() < pr) c.wallN[k] = 0;
      }
    }
    for (let j = 1; j < 16; j++) {
      for (let i = 1; i < 16; i++) {
        if (!this.cornerFree(c, i, j)) continue;
        const open = fbm((ox + i) / 22, (oz + j) / 22, this.seed + 3, 2);
        if ((open > 0.58 && (i & 1) === 0 && (j & 1) === 0 && r() < 0.55) || r() < 0.012) c.pillar[I16(i, j)] = 1;
      }
    }
  }

  genHalls(c, r) {
    this.genBorder(c, r, 0.45, 3, 0.2);
    this.bsp(c, r, 0, 0, 16, 16, 4, 0, { stop: 0.35, bigArea: 50, doorEvery: 4, wideDoor: 0.6, lintel: 0.25 });
    for (let k = 0; k < 256; k++) {
      if ((k & 15) > 0 && c.wallW[k] && r() < 0.12) c.wallW[k] = 0;
      if ((k >> 4) > 0 && c.wallN[k] && r() < 0.12) c.wallN[k] = 0;
    }
    const ox = c.cx * 16, oz = c.cz * 16;
    for (let j = 1; j < 16; j++) {
      for (let i = 1; i < 16; i++) {
        if (imod(ox + i, 3) === 0 && imod(oz + j, 3) === 0 && this.cornerFree(c, i, j)) c.pillar[I16(i, j)] = 2;
      }
    }
    // M.E.G. 补给箱
    const n = 2 + Math.floor(r() * 5);
    for (let k = 0; k < n; k++) {
      const i = 1 + Math.floor(r() * 14), j = 1 + Math.floor(r() * 14);
      const gx = ox + i, gz = oz + j;
      const kk = I16(i, j);
      if (c.block[kk] || this.nearStart(gx, gz, 2)) continue;
      if (c.wallW[kk] || c.wallW[I16(i + 1, j)] || c.wallN[kk] || c.wallN[I16(i, j + 1)]) continue;
      c.block[kk] = 1;
      const cxm = (gx + 0.5) * CELL + (r() - 0.5) * 0.4, czm = (gz + 0.5) * CELL + (r() - 0.5) * 0.4;
      const s = 0.55 + r() * 0.15;
      c.props.push({ x0: cxm - s, z0: czm - s, x1: cxm + s, z1: czm + s, y0: 0, y1: s * 2 });
      if (r() < 0.55) {
        const s2 = s * (0.6 + r() * 0.25), ddx = (r() - 0.5) * 0.3, ddz = (r() - 0.5) * 0.3;
        c.props.push({ x0: cxm + ddx - s2, z0: czm + ddz - s2, x1: cxm + ddx + s2, z1: czm + ddz + s2, y0: s * 2, y1: s * 2 + s2 * 2 });
      }
      c.supply = (c.supply || 0) + 1;
    }
  }

  // Level 1：规则的结构柱网（每 bay 格一根柱）+ 沿柱网轴线砌的混凝土隔墙。
  // 墙段按全局坐标哈希决定，因此跨区块连续；大尺度噪声决定哪里是空旷大厅、哪里是隔间密集的库区
  isColumn(gx, gz) {
    const B = this.L.bay;
    return imod(gx, B) === 0 && imod(gz, B) === 0 && !this.nearExit(gx, gz);
  }

  nearExit(gx, gz) {
    const e = this.exit;
    return !!e && !e.end && gx >= e.gx && gx <= e.gx + 1 && gz >= e.gz && gz <= e.gz + 1;
  }

  wallSegment(axis, line, seg) {
    const B = this.L.bay, sd = this.seed, h = line * 2 + axis;
    const mx = axis === 0 ? line : (seg + 0.5) * B, mz = axis === 0 ? (seg + 0.5) * B : line;
    const dens = fbm(mx / 26, mz / 26, sd + 3, 2);
    if (rand01(h, seg, sd + 71) >= smoothstep(0.38, 0.68, dens) * 0.8) return 0;
    let mask = (1 << B) - 1;
    if (rand01(h, seg, sd + 73) < 0.6) {
      const g0 = Math.floor(rand01(h, seg, sd + 72) * B);
      mask &= ~(1 << g0);
      if (rand01(h, seg, sd + 74) < 0.3) mask &= ~(1 << ((g0 + 1) % B));
    }
    return mask;
  }

  genWarehouse(c, r) {
    const B = this.L.bay, ox = c.cx * 16, oz = c.cz * 16;
    for (let j = 0; j < 16; j++) {
      for (let i = 0; i < 16; i++) {
        const gx = ox + i, gz = oz + j, k = I16(i, j);
        if (this.isColumn(gx, gz)) c.pillar[k] = 3;
        if (this.nearStart(gx, gz, 3)) continue;
        if (imod(gx, B) === 0 && (this.wallSegment(0, gx, Math.floor(gz / B)) >> imod(gz, B)) & 1) c.wallW[k] = 1;
        if (imod(gz, B) === 0 && (this.wallSegment(1, gz, Math.floor(gx / B)) >> imod(gx, B)) & 1) c.wallN[k] = 1;
      }
    }
    // M.E.G. 补给箱：成堆摆放在空地上，避开柱子
    const n = 1 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const i = Math.floor(r() * 15), j = Math.floor(r() * 15);
      const gx = ox + i, gz = oz + j, kk = I16(i, j);
      if (c.block[kk] || this.nearStart(gx, gz, 2)) continue;
      if (c.wallW[kk] || c.wallW[I16(i + 1, j)] || c.wallN[kk] || c.wallN[I16(i, j + 1)]) continue;
      if (this.isColumn(gx, gz) || this.isColumn(gx + 1, gz) || this.isColumn(gx, gz + 1) || this.isColumn(gx + 1, gz + 1)) continue;
      c.block[kk] = 1;
      const cxm = (gx + 0.5) * CELL + (r() - 0.5) * 0.3, czm = (gz + 0.5) * CELL + (r() - 0.5) * 0.3;
      const s = 0.5 + r() * 0.12;
      c.props.push({ x0: cxm - s, z0: czm - s, x1: cxm + s, z1: czm + s, y0: 0, y1: s * 2 });
      if (r() < 0.6) {
        const s2 = s * (0.65 + r() * 0.25), ddx = (r() - 0.5) * 0.3, ddz = (r() - 0.5) * 0.3;
        c.props.push({ x0: cxm + ddx - s2, z0: czm + ddz - s2, x1: cxm + ddx + s2, z1: czm + ddz + s2, y0: s * 2, y1: s * 2 + s2 * 2 });
      }
      c.supply = (c.supply || 0) + 1;
      (c.supplyAt || (c.supplyAt = [])).push([i, j]);
    }
  }

  genMaze(c, r) {
    c.wallW.fill(1);
    c.wallN.fill(1);
    const visited = new Uint8Array(256);
    const stack = [Math.floor(r() * 256)];
    visited[stack[0]] = 1;
    const nb = [];
    while (stack.length) {
      const cur = stack[stack.length - 1];
      const i = cur & 15, j = cur >> 4;
      nb.length = 0;
      if (i > 0 && !visited[I16(i - 1, j)]) nb.push(0);
      if (i < 15 && !visited[I16(i + 1, j)]) nb.push(1);
      if (j > 0 && !visited[I16(i, j - 1)]) nb.push(2);
      if (j < 15 && !visited[I16(i, j + 1)]) nb.push(3);
      if (!nb.length) { stack.pop(); continue; }
      const d = nb[Math.floor(r() * nb.length)];
      let ni = i, nj = j;
      if (d === 0) { c.wallW[I16(i, j)] = 0; ni--; }
      else if (d === 1) { c.wallW[I16(i + 1, j)] = 0; ni++; }
      else if (d === 2) { c.wallN[I16(i, j)] = 0; nj--; }
      else { c.wallN[I16(i, j + 1)] = 0; nj++; }
      visited[I16(ni, nj)] = 1;
      stack.push(I16(ni, nj));
    }
    // 打通部分死路，形成回环
    for (let k = 0; k < 256; k++) {
      if ((k & 15) > 0 && c.wallW[k] && r() < 0.13) c.wallW[k] = 0;
      if ((k >> 4) > 0 && c.wallN[k] && r() < 0.13) c.wallN[k] = 0;
    }
    // 锅炉房
    const rooms = Math.floor(r() * 3);
    for (let k = 0; k < rooms; k++) {
      const w = 2 + Math.floor(r() * 2), h = 2 + Math.floor(r() * 2);
      const i0 = 1 + Math.floor(r() * (14 - w)), j0 = 1 + Math.floor(r() * (14 - h));
      for (let j = j0; j < j0 + h; j++) for (let i = i0; i < i0 + w; i++) {
        if (i > i0) c.wallW[I16(i, j)] = 0;
        if (j > j0) c.wallN[I16(i, j)] = 0;
      }
    }
    for (const axis of [0, 1]) {
      for (let k = 0; k < 3; k++) {
        const q = Math.floor(r() * 16);
        if (axis === 0) c.wallW[I16(0, q)] = 0; else c.wallN[I16(q, 0)] = 0;
      }
    }
    // 出生点附近开阔一些
    if (c.cx === 0 && c.cz === 0) {
      for (let j = 7; j <= 9; j++) for (let i = 7; i <= 9; i++) {
        if (i > 7) c.wallW[I16(i, j)] = 0;
        if (j > 7) c.wallN[I16(i, j)] = 0;
      }
    }
  }

  // Level 2：节点位于局部坐标 2/6/10/14 的 4×4 网格，用带直行偏好的 DFS 连成生成树，
  // 每条边是一段 1 格宽的隧道 → 长而直、偶有岔路和死胡同。其余格子都是实心混凝土。
  // 区块边界上的通道由两侧共同的哈希决定，且每条边界至少有一条通道，保证全局连通
  tunnelBorder(cx, cz, axis) {
    const b = this.fixedBounds;
    // 封闭地图的外圈不开口；内部区块之间照常连通
    if (b && (cx < b.minX || cz < b.minZ || (axis === 0 ? cx >= b.maxX || cz > b.maxZ : cz >= b.maxZ || cx > b.maxX))) return 0;
    let m = 1 << Math.floor(rand01(cx, cz, this.seed + 201 + axis) * 4);
    for (let b = 0; b < 4; b++) if (rand01(cx * 4 + b, cz, this.seed + 203 + axis) < 0.3) m |= 1 << b;
    return m;
  }

  genTunnels(c, r) {
    const open = new Uint8Array(256), zone = new Uint8Array(256);
    const N = (a) => 2 + a * 4;
    const DX = [1, -1, 0, 0], DZ = [0, 0, 1, -1];
    const set = (i, j, z = 1) => { open[I16(i, j)] = 1; zone[I16(i, j)] = z; };
    const carve = (a, b, d) => { for (let s = 1; s <= 3; s++) set(N(a) + DX[d] * s, N(b) + DZ[d] * s); };
    const vis = new Uint8Array(16);
    const stack = [Math.floor(r() * 16)];
    vis[stack[0]] = 1;
    let lastDir = -1;
    const nb = [];
    while (stack.length) {
      const cur = stack[stack.length - 1], a = cur & 3, b = cur >> 2;
      nb.length = 0;
      for (let d = 0; d < 4; d++) {
        const na = a + DX[d], nz = b + DZ[d];
        if (na >= 0 && na < 4 && nz >= 0 && nz < 4 && !vis[nz * 4 + na]) nb.push(d);
      }
      if (!nb.length) { stack.pop(); lastDir = -1; continue; }
      let d = nb[Math.floor(r() * nb.length)];
      if (nb.includes(lastDir) && r() < 0.7) d = lastDir;
      carve(a, b, d);
      const nn = (b + DZ[d]) * 4 + a + DX[d];
      vis[nn] = 1;
      stack.push(nn);
      lastDir = d;
    }
    for (let b = 0; b < 4; b++) {
      for (let a = 0; a < 4; a++) {
        if (a < 3 && r() < 0.12) carve(a, b, 0);
        if (b < 3 && r() < 0.12) carve(a, b, 2);
        set(N(a), N(b));
      }
    }
    const east = this.tunnelBorder(c.cx, c.cz, 0), west = this.tunnelBorder(c.cx - 1, c.cz, 0);
    const south = this.tunnelBorder(c.cx, c.cz, 1), north = this.tunnelBorder(c.cx, c.cz - 1, 1);
    for (let b = 0; b < 4; b++) {
      if ((east >> b) & 1) set(15, N(b));
      if ((west >> b) & 1) { set(0, N(b)); set(1, N(b)); }
      if ((south >> b) & 1) set(N(b), 15);
      if ((north >> b) & 1) { set(N(b), 0); set(N(b), 1); }
    }
    const e = this.exit;
    let exitNorth = -1;
    if (e && (e.gx >> 4) === c.cx && (e.gz >> 4) === c.cz) {
      set(e.gx & 15, e.gz & 15);
      exitNorth = I16(e.gx & 15, (e.gz & 15) - 1);
    }
    // 偶尔出现的设备间：占据隧道之间的一整块 3×3，通过带门楣的门洞与隧道相连
    const doors = new Set();
    const rooms = !this.L.noRooms && r() < 0.55 ? 1 + (r() < 0.25 ? 1 : 0) : 0;
    for (let k = 0; k < rooms; k++) {
      const i0 = N(Math.floor(r() * 3)) + 1, j0 = N(Math.floor(r() * 3)) + 1;
      if (zone[I16(i0 + 1, j0 + 1)]) continue;
      if (exitNorth >= 0 && (exitNorth & 15) >= i0 && (exitNorth & 15) < i0 + 3 && (exitNorth >> 4) >= j0 && (exitNorth >> 4) < j0 + 3) continue;
      const sides = [];
      if (open[I16(i0 + 1, j0 - 1)]) sides.push('N' + I16(i0 + 1, j0));
      if (open[I16(i0 + 1, j0 + 3)]) sides.push('N' + I16(i0 + 1, j0 + 3));
      if (open[I16(i0 - 1, j0 + 1)]) sides.push('W' + I16(i0, j0 + 1));
      if (open[I16(i0 + 3, j0 + 1)]) sides.push('W' + I16(i0 + 3, j0 + 1));
      if (!sides.length) continue;
      for (let j = j0; j < j0 + 3; j++) for (let i = i0; i < i0 + 3; i++) set(i, j, 2);
      const first = Math.floor(r() * sides.length);
      doors.add(sides[first]);
      if (sides.length > 1 && r() < 0.4) doors.add(sides[(first + 1) % sides.length]);
      // 房间中央的锅炉 / 储水罐
      const ci = i0 + 1, cj = j0 + 1, gx = c.cx * 16 + ci, gz = c.cz * 16 + cj;
      const cx = (gx + 0.5) * CELL, cz = (gz + 0.5) * CELL, rad = 0.55 + r() * 0.2;
      c.props.push({ kind: 'tank', x0: cx - rad, z0: cz - rad, x1: cx + rad, z1: cz + rad, y0: 0, y1: 1.7 + r() * 0.5, r: rad });
      c.blockLater = (c.blockLater || []).concat(I16(ci, cj));
      if (r() < 0.7) {
        const corner = [[i0, j0], [i0 + 2, j0], [i0, j0 + 2], [i0 + 2, j0 + 2]][Math.floor(r() * 4)];
        const qx = (c.cx * 16 + corner[0] + 0.5) * CELL, qz = (c.cz * 16 + corner[1] + 0.5) * CELL, s = 0.42 + r() * 0.1;
        c.props.push({ x0: qx - s, z0: qz - s, x1: qx + s, z1: qz + s, y0: 0, y1: s * 2 });
        c.blockLater.push(I16(corner[0], corner[1]));
      }
    }
    for (let j = 0; j < 16; j++) {
      for (let i = 0; i < 16; i++) {
        const k = I16(i, j);
        c.block[k] = open[k] ? 0 : 1;
        if (i > 0) {
          const k2 = I16(i - 1, j);
          if (open[k] !== open[k2] || (open[k] && zone[k] !== zone[k2] && !doors.has('W' + k))) c.wallW[k] = 1;
          if (doors.has('W' + k)) c.lintW[k] = 1;
        }
        if (j > 0) {
          const k2 = I16(i, j - 1);
          if (open[k] !== open[k2] || (open[k] && zone[k] !== zone[k2] && !doors.has('N' + k))) c.wallN[k] = 1;
          if (doors.has('N' + k)) c.lintN[k] = 1;
        }
      }
    }
    for (const k of c.blockLater || []) c.block[k] = 1;
    c.zone = zone;
  }

  // Level 4：家具几乎搬空的办公楼，大厅、宽过道和少量独立办公室
  genOffice(c, r) {
    const ox = c.cx * 32, oz = c.cz * 32, start = c.cx === 0 && c.cz === 0;
    const kind = start ? 0 : Math.floor(r() * 4);
    const roomSets = [
      [[1, 1, 6, 5], [10, 1, 15, 5]],
      [[1, 1, 6, 6], [10, 1, 15, 6], [1, 10, 6, 15], [10, 10, 15, 15]],
      [[1, 1, 6, 5], [1, 5, 6, 10], [1, 10, 6, 15]],
      [[10, 3, 15, 13]],
    ];
    // 各片办公区之间留八米宽的开口，中央始终有贯通的交通空间
    for (let q = 0; q < 16; q++) {
      if (q < 6 || q >= 10) { c.wallW[I16(0, q)] = 1; c.wallN[I16(q, 0)] = 1; }
      else { c.lintW[I16(0, q)] = 1; c.lintN[I16(q, 0)] = 1; }
    }
    for (const [x0, z0, x1, z1] of roomSets[kind]) {
      for (let i = x0; i < x1; i++) { c.wallN[I16(i, z0)] = 1; c.wallN[I16(i, z1)] = 1; }
      for (let j = z0; j < z1; j++) { c.wallW[I16(x0, j)] = 1; c.wallW[I16(x1, j)] = 1; }
      const doorX = x0 < 8 ? x1 : x0, doorZ = Math.floor((z0 + z1) / 2);
      c.wallW[I16(doorX, doorZ)] = 0; c.lintW[I16(doorX, doorZ)] = 1;
      if (kind === 3) { c.wallW[I16(x1, doorZ)] = 0; c.lintW[I16(x1, doorZ)] = 1; }
      // 大多数房间是空的，少数留下桌椅、电脑或一张会议桌
      if (r() < 0.38 || (start && x0 === 1)) {
        if (kind === 3) this.officeProp(c, 'meeting', ox + (x0 + x1) * CELL / 2, oz + (z0 + z1) * CELL / 2, 0);
        else {
          this.officeProp(c, 'desk', ox + (x0 + 1.6) * CELL, oz + (z0 + 1.2) * CELL, 0, true);
          if (r() < 0.35) this.officeProp(c, 'desk', ox + (x1 - 1.5) * CELL, oz + (z0 + 1.2) * CELL, 0, false);
          if (r() < 0.6) this.officeProp(c, 'cabinet', ox + (x0 + 0.6) * CELL, oz + (z1 - 0.7) * CELL, 1);
        }
      }
    }
    if (start) this.officeProp(c, 'desk', 10.8, 17, 1, true);
    // 空大厅只有少量结构柱，不铺满隔板和工位
    if (kind === 0 || kind === 3) for (const [i, j] of [[3, 11], [12, 11]]) {
      if (kind === 3 && i > 8) continue;
      c.pillar[I16(i, j)] = 2;
    }
    if (start || r() < 0.7) {
      const machine = this.officeProp(c, 'cooler', ox + 13.1, oz + 9.4, 1);
      if (machine) c.dispensers.push(machine);
    }
    if (start || r() < 0.35) {
      const machine = this.officeProp(c, 'vending', ox + 13.0, oz + 4.5, 1);
      if (machine) c.dispensers.push(machine);
    }
  }

  officeProp(c, kind, x, z, rot, computer = false) {
    const e = this.exit;
    if (Math.hypot(x - e.x, z - e.z) < 3.5) return null;
    const bounds = kind === 'desk' ? [-0.9, -0.48, 0.9, 1.58] : kind === 'meeting' ? [-1.8, -1.65, 1.8, 1.65]
      : kind === 'cabinet' ? [-0.4, -0.3, 0.4, 0.3] : kind === 'vending' ? [-0.47, -0.34, 0.47, 0.34] : [-0.3, -0.3, 0.3, 0.3];
    const ca = [1, 0, -1, 0][rot], sa = [0, 1, 0, -1][rot];
    const ax = ca * bounds[0] + sa * bounds[1], az = -sa * bounds[0] + ca * bounds[1];
    const bx = ca * bounds[2] + sa * bounds[3], bz = -sa * bounds[2] + ca * bounds[3];
    const p = { kind, office: true, x, z, rot, computer, x0: x + Math.min(ax, bx), x1: x + Math.max(ax, bx),
      z0: z + Math.min(az, bz), z1: z + Math.max(az, bz), y0: 0, y1: 1.9, next: 0 };
    c.props.push(p);
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      const gx = (c.cx * 16 + i + 0.5) * CELL, gz = (c.cz * 16 + j + 0.5) * CELL;
      if (gx >= p.x0 && gx <= p.x1 && gz >= p.z0 && gz <= p.z1) c.block[I16(i, j)] = 1;
    }
    return p;
  }

  // Level 1.5：一间接一间的小房间和走廊，几乎每个门洞都有门楣
  genHouse(c, r) {
    this.genBorder(c, r, 0.75, 2, 0.9);
    this.bsp(c, r, 0, 0, 16, 16, 2, 0, { stop: 0.12, bigArea: 12, doorEvery: 4, wideDoor: 0.05, lintel: 0.95 });
  }

  // ---------------------------------------------------------
  //  Level 3：电站。走廊沿 6 格间距的网格铺开（像城市街区），街区内部要么是实心，
  //  要么是发电机房 / 流水线 / 锅炉房。所有判断都基于全局坐标，跨区块一致
  // ---------------------------------------------------------
  stationBlock(bx, bz) {
    if (this.plant) return bx >= 0 && bz >= 0 && bx < 6 && bz < 6 ? PLANT.map[bz][bx] : 0;
    const f = this.forced.get(bx + ',' + bz);
    if (f !== undefined) return f;
    const h = rand01(bx, bz, this.seed + 301);
    return h < 0.4 ? 0 : h < 0.62 ? 1 : h < 0.82 ? 2 : 3; // 0 实心 1 发电机房 2 流水线 3 锅炉房
  }

  stationZone(gx, gz) {
    const B = this.L.block;
    if (this.plant) {
      const S = PLANT.size;
      if (gx < 0 || gz < 0 || gx > S || gz > S) return 0;
      // 分区之间的隔离带：整条走廊封死，只留闸门格
      if ((gx === 12 || gx === 24 || (gz === 12 && gx > 12 && gx < 24)) && !this.plant.open.has(gx + ',' + gz)) return 0;
    }
    if (imod(gx, B) === 0 || imod(gz, B) === 0) return 1;
    return this.stationBlock(Math.floor(gx / B), Math.floor(gz / B)) ? 2 : 0;
  }

  // 房间门：side 0 北 1 南 2 西 3 东；每个房间至少一扇
  roomDoor(bx, bz, side) {
    if (!this.stationBlock(bx, bz)) return false;
    if (this.plant) return (PLANT.doors[bx + ',' + bz] || '').includes('NSWE'[side]);
    if (side === Math.floor(rand01(bx, bz, this.seed + 311) * 4)) return true;
    return rand01(bx * 4 + side, bz, this.seed + 312) < 0.45;
  }

  stationDoor(west, gx, gz) {
    const B = this.L.block, bx = Math.floor(gx / B), bz = Math.floor(gz / B);
    if (west) {
      if (imod(gz, B) !== 3) return false;
      const lx = imod(gx, B);
      return lx === 1 ? this.roomDoor(bx, bz, 2) : lx === 0 ? this.roomDoor(bx - 1, bz, 3) : false;
    }
    if (imod(gx, B) !== 3) return false;
    const lz = imod(gz, B);
    return lz === 1 ? this.roomDoor(bx, bz, 0) : lz === 0 ? this.roomDoor(bx, bz - 1, 1) : false;
  }

  // 横穿走廊的铁栅栏（出生点和出口附近不会有）
  stationBar(west, gx, gz) {
    const B = this.L.block, e = this.exit;
    if (this.plant) return false; // 剧情电站只有固定的闸门
    if (west ? imod(gz, B) !== 0 || imod(gx, B) !== 3 : imod(gx, B) !== 0 || imod(gz, B) !== 3) return false;
    if (this.nearStart(gx, gz, 14) || (e && Math.abs(e.gx - gx) < 14 && Math.abs(e.gz - gz) < 14)) return false;
    // 保留贯通的主走廊，发电机房四周也不封死；栅栏只截断支路
    if (imod(west ? gz : gx, B * 2) === 0) return false;
    const bx = Math.floor(gx / B), bz = Math.floor(gz / B);
    if (this.stationBlock(bx, bz) === 1 || this.stationBlock(west ? bx : bx - 1, west ? bz - 1 : bz) === 1) return false;
    return rand01(Math.floor(gx / B) * 2 + (west ? 0 : 1), Math.floor(gz / B), this.seed + 321) < 0.16;
  }

  // 房间里哪些格子被机器占据（用于寻路）
  stationCellBlocked(gx, gz) {
    const B = this.L.block, lx = imod(gx, B), lz = imod(gz, B);
    if (!lx || !lz) return false;
    const t = this.stationBlock(Math.floor(gx / B), Math.floor(gz / B));
    if (t === 1 || t === 3) return lx === 3 && lz === 3;
    if (t === 2) return (lz === 2 && lx >= 2) || (lz === 4 && lx <= 4); // 两条传送带，蛇形留出通道
    if (t === 4) return lz === 1 && lx >= 2 && lx <= 4; // 值班控制台
    return false;
  }

  genStation(c, r) {
    const B = this.L.block, ox = c.cx * 16, oz = c.cz * 16;
    for (let j = 0; j < 16; j++) {
      for (let i = 0; i < 16; i++) {
        const gx = ox + i, gz = oz + j, k = I16(i, j);
        const z = this.stationZone(gx, gz);
        c.block[k] = z === 0 || this.stationCellBlocked(gx, gz) ? 1 : 0;
        if (z !== this.stationZone(gx - 1, gz)) {
          if (this.stationDoor(true, gx, gz)) c.lintW[k] = 1; else c.wallW[k] = 1;
        }
        if (z !== this.stationZone(gx, gz - 1)) {
          if (this.stationDoor(false, gx, gz)) c.lintN[k] = 1; else c.wallN[k] = 1;
        }
        if (this.stationBar(true, gx, gz)) c.barW[k] = 1;
        if (this.stationBar(false, gx, gz)) c.barN[k] = 1;
        if (imod(gx, B) === 3 && imod(gz, B) === 3) {
          const t = this.stationBlock(Math.floor(gx / B), Math.floor(gz / B));
          if (t) this.stationRoom(c, t, gx, gz);
        }
      }
    }
    // 墙上的配电箱，部分会冒火花
    const nb = 3 + Math.floor(r() * 5);
    for (let k = 0; k < nb; k++) {
      const f = this.randomWallFace(c, r);
      if (f) c.fixtures.push({ x: f[0], z: f[1], nx: f[2], nz: f[3], y: 1.2 + r() * 0.7, spark: r() < 0.35, t: r() * 5 });
    }
    // 地上冒火花的断线
    if (r() < 0.6) {
      const cell = this.randomOpenCell(c, r);
      if (cell) {
        const gx = ox + cell[0], gz = oz + cell[1];
        if (!this.nearStart(gx, gz, 3) && this.stationZone(gx, gz) === 1) {
          c.wires.push({ x: (gx + 0.3 + r() * 0.4) * CELL, z: (gz + 0.3 + r() * 0.4) * CELL, rot: r() * Math.PI * 2, t: r() * 5 });
        }
      }
    }
  }

  loZone(gx, gz) {
    const M = LIGHTS_OUT;
    return gx < 0 || gz < 0 || gx >= M.W || gz >= M.H ? 0 : LO_ZONE[M.rows[gz][gx]] || 0;
  }

  // Level 6：按固定地图铺墙；不同区域之间的门洞带门楣。灯、物品、陈设都落在各自所属的区块里
  genLightsOut(c) {
    const ox = c.cx * 16, oz = c.cz * 16, S = CHUNK * CELL;
    for (let j = 0; j < 16; j++) {
      for (let i = 0; i < 16; i++) {
        const gx = ox + i, gz = oz + j, k = I16(i, j), z = this.loZone(gx, gz);
        c.block[k] = z ? 0 : 1;
        const zw = this.loZone(gx - 1, gz), zn = this.loZone(gx, gz - 1);
        if (!z !== !zw) c.wallW[k] = 1; else if (z && z !== zw) c.lintW[k] = 1;
        if (!z !== !zn) c.wallN[k] = 1; else if (z && z !== zn) c.lintN[k] = 1;
      }
    }
    const mine = (x, z) => Math.floor(x / S) === c.cx && Math.floor(z / S) === c.cz;
    for (const [gx, gz, type] of LO_LIGHTS) {
      const x = (gx + 0.5) * CELL, z = (gz + 0.5) * CELL;
      if (mine(x, z)) c.lights.push({ x, y: this.L.wallH - (this.L.light.drop || 0.3), z, type, seed: gx * 97 + gz, rate: 7, level: 1, on: true });
    }
    for (const [id, type, gx, gz] of LO_ITEMS) {
      const x = gx * CELL, z = gz * CELL;
      if (mine(x, z) && !this.picked.has(id)) c.items.push({ id, type, x, z, phase: gx });
    }
    for (const p of LO_PROPS) if (mine((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2)) c.props.push({ ...p });
  }

  // 房间陈设（由房间中心格所在的区块负责生成）
  stationRoom(c, t, gx, gz) {
    const rr = mulberry32(ihash(gx, gz, this.seed + 331));
    const cx = (gx + 0.5) * CELL, cz = (gz + 0.5) * CELL, x0 = (gx - 2) * CELL, x1 = (gx + 3) * CELL, z0 = (gz - 2) * CELL, z1 = (gz + 3) * CELL;
    // 靠墙的电气柜
    const cab = (x, z, w, d) => c.props.push({ x0: x - w, z0: z - d, x1: x + w, z1: z + d, y0: 0, y1: 1.9 + rr() * 0.3, tex: TEX.ELECBOX });
    if (t === 1) {
      c.props.push({ x0: cx - 0.8, z0: cz - 0.6, x1: cx + 0.8, z1: cz + 0.6, y0: 0, y1: 1.7, tex: TEX.GENERATOR });
      c.gens.push({ id: gx + ',' + gz, x: cx, z: cz, no: this.plant ? PLANT.gens[gx + ',' + gz] : 0 });
      for (const [x, z] of [[x0 + 0.4, z0 + 1.2], [x1 - 0.4, z0 + 1.2], [x0 + 0.4, z1 - 1.2], [x1 - 0.4, z1 - 1.2]]) if (rr() < 0.7) cab(x, z, 0.3, 0.45);
    } else if (t === 4) {
      // 控制室：北墙下的值班控制台和三块监视器，西墙上是总闸柜
      c.props.push({ x0: x0 + 2, z0: z0 + 0.1, x1: x0 + 8, z1: z0 + 1.0, y0: 0, y1: 1.05, tex: TEX.ELECBOX });
      for (const m of [2.3, 4.3, 6.3]) c.props.push({ x0: x0 + m, z0: z0 + 0.2, x1: x0 + m + 1.4, z1: z0 + 0.6, y0: 1.05, y1: 1.85, tex: TEX.MONITOR });
      c.props.push({ x0: x0 + 0.1, z0: z0 + 3.8, x1: x0 + 0.65, z1: z0 + 6.2, y0: 0, y1: 2.0, tex: TEX.ELECBOX });
      cab(x1 - 0.4, z0 + 1.2, 0.3, 0.45);
      cab(x1 - 0.4, z1 - 1.2, 0.3, 0.45);
    } else if (t === 5) {
      // 值班室 / 仓库：西南角一张工作台，北墙两排货架（避开门洞），角落里留着补给
      c.props.push({ x0: x0 + 1, z0: z1 - 3, x1: x0 + 3.5, z1: z1 - 1, y0: 0, y1: 0.8, tex: TEX.DESK });
      cab(x0 + 2, z0 + 0.4, 1.7, 0.3);
      cab(x0 + 8, z0 + 0.4, 1.7, 0.3);
      const id = 'plant:' + gx + ',' + gz;
      if (!this.picked.has(id + 'b')) c.items.push({ id: id + 'b', type: 'battery', x: x0 + 7.5, z: z1 - 1.5, phase: rr() * 6 });
      if (!this.picked.has(id + 'a')) c.items.push({ id: id + 'a', type: 'almond', x: x0 + 8.5, z: z1 - 2.2, phase: rr() * 6 });
    } else if (t === 2) {
      // 两条传送带，上面堆着不知从哪来的货物
      for (const [a, b, row] of [[x0 + CELL + 0.25, x1 - 0.3, gz - 1], [x0 + 0.3, x1 - CELL - 0.25, gz + 1]]) {
        const zc = (row + 0.5) * CELL;
        c.props.push({ x0: a, z0: zc - 0.45, x1: b, z1: zc + 0.45, y0: 0, y1: 0.85, tex: TEX.CONVEYOR });
        for (let k = 0; k < 3; k++) {
          if (rr() < 0.4) continue;
          const px = a + 0.5 + rr() * (b - a - 1), s = 0.25 + rr() * 0.12;
          c.props.push({ x0: px - s, z0: zc - s, x1: px + s, z1: zc + s, y0: 0.85, y1: 0.85 + s * 2 });
        }
      }
    } else {
      c.props.push({ kind: 'tank', x0: cx - 0.75, z0: cz - 0.75, x1: cx + 0.75, z1: cz + 0.75, y0: 0, y1: 2.1, r: 0.75 });
      if (rr() < 0.6) cab(x0 + 0.4, z0 + 1.2, 0.3, 0.45);
    }
  }

  // ---------------------------------------------------------
  //  Level 37：完整的池厅。每厅有池沿、台阶和池底，宽拱洞连到下一厅
  // ---------------------------------------------------------
  poolRoom(cx, cz) {
    if (!this.containsChunk(cx, cz)) return null;
    const key = cx + ',' + cz;
    if (this.poolRooms.has(key)) return this.poolRooms.get(key);
    const start = cx === 0 && cz === 0, exit = (this.exit.gx >> 4) === cx && (this.exit.gz >> 4) === cz;
    const layout = [[1, 2, 0], [4, 0, 1], [3, 2, 4]];
    const kind = layout[cz - this.poolBounds.minZ][cx - this.poolBounds.minX];
    const h = [6.2, 5.2, 6.2, 4.4, 6.6][kind];
    const p = { kind, h, exit, columns: [], arches: [], openings: [], ducks: [], slide: null };
    this.poolRooms.set(key, p);
    const col = (x, z, r, top = h) => p.columns.push({ x, z, r, top });
    const sky = (x0, z0, x1, z1, power = 1) => p.openings.push({ axis: 'y', x0, z0, x1, z1, y: h, power });
    const window = (z0, z1, power = 1) => {
      // 只在建筑最东侧开窗；内墙后面是池厅，不能贴天空。
      if (cx !== this.poolBounds.maxX) return;
      p.openings.push({ axis: 'x', x0: 32 - WALL_T + 0.6, x1: 32 - WALL_T + 0.6,
        z0, z1, y: h - 2.3, y1: h - 0.6, power });
    };
    if (kind === 0) {
      sky(12, 3, 20, 7, 1.1); window(20, 25, 0.65);
      col(26, 25, 0.85); col(24, 7, 0.6);
      p.ducks.push({ x: 17, z: 10, rot: 0.6, scale: 0.8 }, { x: 23, z: 20, rot: 2.4, scale: 0.65 });
      if (start || rand01(cx, cz, this.seed + 374) < 0.35) {
        p.slide = { points: [[5, 4.08, 12], [5, 3.95, 22], [12, 2.6, 26], [20, 1.08, 19]],
          x: cx * 32 + 5, z: cz * 32 + 11, y: 3.3, ox: cx * 32, oz: cz * 32 };
      }
    } else if (kind === 1) {
      sky(3, 5, 7, 11, 0.85); window(22, 27, 0.55);
      for (const x of [8, 12, 20, 24]) for (const z of [8, 18, 26]) col(x, z, 0.68);
      p.ducks.push({ x: 17, z: 14, rot: 1.7, scale: 0.7 });
    } else if (kind === 2) {
      sky(20, 3, 26, 7, 0.85); window(18, 24, 0.65);
      col(12, 17, 0.55, 2.12); col(20, 17, 0.55, 2.12);
      p.arches.push({ west: false, line: 17, a0: 12, a1: 20, spring: 2.12, rise: 3.65, top: h, free: true });
      p.ducks.push({ x: 8, z: 15, rot: -0.8, scale: 0.7 }, { x: 25, z: 24, rot: 1, scale: 0.55 });
    } else if (kind === 3) {
      sky(13, 1, 19, 3, 0.38);
      col(8, 21, 1.2); col(24, 21, 1.2);
    } else {
      sky(22, 6, 27, 12, 1.0);
      col(16, 17, 3.2); col(7, 25, 0.7); col(25, 25, 0.7);
      p.ducks.push({ x: 8, z: 13, rot: 2.8, scale: 0.65 });
    }
    return p;
  }

  poolDoor(cx, cz, west) {
    if (!this.containsChunk(cx, cz) || !this.containsChunk(cx - (west ? 1 : 0), cz - (west ? 0 : 1))) return null;
    const mid = 16, w = 8;
    const a = this.poolRoom(cx, cz).h, b = this.poolRoom(cx - (west ? 1 : 0), cz - (west ? 0 : 1)).h;
    return { west, line: 0, a0: mid - w / 2, a1: mid + w / 2, spring: 2.12,
      rise: Math.min(w / 2, Math.min(a, b) - 2.35), top: Math.max(a, b), free: false };
  }

  genPools(c, r) {
    const S = CHUNK * CELL, ox = c.cx * S, oz = c.cz * S;
    const p = c.pool = this.poolRoom(c.cx, c.cz);
    c.deep = new Uint8Array(256);
    c.poolDoors = [this.poolDoor(c.cx, c.cz, true), this.poolDoor(c.cx, c.cz, false)].filter(Boolean);
    for (let k = 0; k < CHUNK; k++) {
      if (c.cx === this.poolBounds.minX) c.wallW[I16(0, k)] = 1;
      if (c.cz === this.poolBounds.minZ) c.wallN[I16(k, 0)] = 1;
    }
    for (const door of c.poolDoors) {
      for (let k = 0; k < 16; k++) {
        const a = (k + 0.5) * CELL;
        if (a < door.a0 || a >= door.a1) {
          if (door.west) c.wallW[I16(0, k)] = 1;
          else c.wallN[I16(k, 0)] = 1;
        }
      }
    }
    for (let j = 0; j < 16; j++) {
      for (let i = 0; i < 16; i++) {
        const x = (i + 0.5) * CELL, z = (j + 0.5) * CELL, k = I16(i, j);
        if (p.columns.some((q) => Math.hypot(x - q.x, z - q.z) < q.r)) c.block[k] = 1;
        c.deep[k] = this.deepAt(ox + x, oz + z);
      }
    }
    for (const a of p.openings) {
      c.lights.push({ x: ox + (a.axis === 'x' ? a.x0 - 0.8 : (a.x0 + a.x1) / 2),
        y: a.axis === 'x' ? (a.y + a.y1) / 2 : p.h - 0.35, z: oz + (a.z0 + a.z1) / 2,
        type: 0, seed: 0, rate: 0, level: 1, on: true, power: a.power });
    }
  }

  // ---------------------------------------------------------
  //  Level Fun =)：邮轮下层甲板。每 4 格一条东西向走廊、每 15 格一条南北向走廊，
  //  走廊之间是一排排 3×3 的派对客舱，门朝北开
  // ---------------------------------------------------------
  shipZone(gx, gz) {
    if (imod(gz, 4) === 0 || imod(gx, 15) === 0) return -1;
    return Math.floor(gx / 3) + ',' + Math.floor(gz / 4);
  }

  shipDoorN(gx, gz) {
    if (imod(gz, 4) === 1 && imod(gx, 3) === 1) return true;
    const e = this.exit;
    if (e && gx === e.gx && gz === e.gz) return false;
    return imod(gz, 4) === 0 && imod(gx, 3) === 1 && rand01(Math.floor(gx / 3), Math.floor((gz - 1) / 4), this.seed + 401) < 0.3;
  }

  genShip(c, r) {
    const ox = c.cx * 16, oz = c.cz * 16, off = WALL_T + 0.008;
    for (let j = 0; j < 16; j++) {
      for (let i = 0; i < 16; i++) {
        const gx = ox + i, gz = oz + j, k = I16(i, j);
        const z = this.shipZone(gx, gz);
        if (z !== this.shipZone(gx - 1, gz)) c.wallW[k] = 1;
        if (z !== this.shipZone(gx, gz - 1)) {
          if (this.shipDoorN(gx, gz)) c.lintN[k] = 1; else c.wallN[k] = 1;
        }
      }
    }
    const H = this.L.wallH;
    for (let j = 0; j < 16; j++) {
      for (let i = 0; i < 16; i++) {
        const gx = ox + i, gz = oz + j, z = this.shipZone(gx, gz);
        if (z === -1) {
          // 走廊墙上零星的笑脸海报
          if (imod(gz, 4) !== 0 || rand01(gx, gz, this.seed + 405) > 0.08 || this.nearExitCell(gx, gz)) continue;
          if (this.shipZone(gx, gz - 1) !== -1 && !this.shipDoorN(gx, gz)) this.addPoster(c, (gx + 0.5) * CELL, gz * CELL + off, 0, 1, rand01(gx, gz, 7) < 0.5);
          else if (this.shipZone(gx, gz + 1) !== -1 && !this.shipDoorN(gx, gz + 1)) this.addPoster(c, (gx + 0.5) * CELL, (gz + 1) * CELL - off, 0, -1, true);
          continue;
        }
        if (imod(gx, 3) !== 1 || imod(gz, 4) !== 2) continue;
        // 客舱中央：派对桌 + 蛋糕、满屋的气球、墙上的海报与涂鸦
        const rr = mulberry32(ihash(Math.floor(gx / 3), Math.floor(gz / 4), this.seed + 402));
        const cx = (gx + 0.5) * CELL, cz = (gz + 0.5) * CELL;
        if (rr() < 0.75) {
          c.props.push({ x0: cx - 0.6, z0: cz - 0.45, x1: cx + 0.6, z1: cz + 0.45, y0: 0, y1: 0.75, tex: TEX.CLOTH });
          c.props.push({ x0: cx - 0.22, z0: cz - 0.22, x1: cx + 0.22, z1: cz + 0.22, y0: 0.75, y1: 1.0, tex: TEX.CAKE });
          c.block[I16(i, j)] = 1;
        }
        const nb = 3 + Math.floor(rr() * 5);
        for (let k = 0; k < nb; k++) {
          c.balloons.push({ x: (gx - 1 + 0.3 + rr() * 2.4) * CELL, z: (gz - 1 + 0.3 + rr() * 2.4) * CELL, y: H - 0.75 - rr() * 0.35, q: Math.floor(rr() * 4) });
        }
        let f = this.randomWallFace(c, rr, [i, j]);
        if (f && rr() < 0.8) this.addPoster(c, f[0], f[1], f[2], f[3], rr() < 0.5);
        f = this.randomWallFace(c, rr, [i, j]);
        if (f && rr() < 0.4) c.decals.push({ x: f[0], z: f[1], nx: f[2], nz: f[3], w: 0.9, h: 0.9, y0: 1.1, uv: PARTY_UV.smile, layer: TEX.PARTY });
        f = this.randomWallFace(c, rr, [i, j]);
        if (f && rr() < 0.6) c.decals.push({ x: f[0], z: f[1], nx: f[2], nz: f[3], w: 1.8, h: 0.45, y0: H - 0.62, uv: PARTY_UV.bunting, layer: TEX.PARTY });
      }
    }
  }

  // Level 994：岩壁只在碰撞里是整格的墙（画面上是 mesher 里的岩面），岩脚散落几块礁石
  beachSolid(gx, gz) {
    const B = BEACH;
    if (gz < B.NZ || gz >= B.SZ) return true;
    return gx * CELL < B.cliff((gz + 0.5) * CELL); // 碰撞墙总在岩脚外侧，宁可留一道缝也不让人走进岩石里
  }

  genBeach(c) {
    const ox = c.cx * 16, oz = c.cz * 16;
    for (let j = 0; j < 16; j++) {
      for (let i = 0; i < 16; i++) {
        const gx = ox + i, gz = oz + j, k = I16(i, j), s = this.beachSolid(gx, gz);
        c.block[k] = s ? 1 : 0;
        if (s !== this.beachSolid(gx - 1, gz)) c.wallW[k] = 1;
        if (s !== this.beachSolid(gx, gz - 1)) c.wallN[k] = 1;
      }
    }
    // 礁石：岩脚下的碎石、沙滩上零星的大石头；两处窄口有一道礁石从岩壁伸进海里，只能贴着水边绕过去
    const r = mulberry32(ihash(c.cx, c.cz, 994)), S = CHUNK * CELL;
    const rock = (x, z, rad, h) => {
      if (Math.floor(x / S) !== c.cx || Math.floor(z / S) !== c.cz) return;
      c.rocks.push({ x, z, r: rad, h, y: beachGround(x, z), seed: Math.floor(r() * 1e6) });
      const k = rad * 0.72;
      if (h > 0.45) c.props.push({ x0: x - k, z0: z - k, x1: x + k, z1: z + k, y0: 0, y1: 0.01, hidden: true });
    };
    for (let j = 0; j < 16; j++) {
      const z0 = (oz + j) * CELL;
      if (z0 < BEACH.NZ * CELL + 2 || z0 > BEACH.SZ * CELL - 2) continue;
      for (let q = 0; q < 2; q++) {
        if (r() > 0.35) continue;
        const z = z0 + r() * CELL, cl = BEACH.cliff(z);
        rock(cl + 0.3 + r() * 2.5, z, 0.4 + r() * 1.1, 0.4 + r() * 1.2);
      }
      if (r() < 0.05) {
        const z = z0 + r() * CELL, w = BEACH.width(z), x = BEACH.cliff(z) + 5 + r() * Math.max(1, w - 12);
        rock(x, z, 0.5 + r() * 1.3, 0.4 + r() * 1.0);
      }
    }
    for (const zc of [205, 105]) {
      for (let k = 0; k < 7; k++) {
        const z = zc - 3 + k * 0.4 + r() * 0.6, cl = BEACH.cliff(z), w = BEACH.width(z);
        const t = k / 6;
        // 北边那道窄口到得晚，潮水已经涨上来，礁石只伸到沙滩中间，留出一条干沙路
        const reach = zc === 105 ? w * 0.45 : w - 3.2;
        rock(cl + 1 + t * reach, z + (r() - 0.5) * 1.5, 1.6 - t * 0.6 + r() * 0.4, 2.4 - t * 1.3 + r() * 0.4);
      }
    }
  }

  // Level Fun =) 剧情版：按固定平面图铺墙，门洞带门楣；客舱里摆派对桌、气球和海报
  genParty(c) {
    const ox = c.cx * 16, oz = c.cz * 16, S = CHUNK * CELL, H = this.L.wallH, off = WALL_T + 0.008, M = PARTY;
    for (let j = 0; j < 16; j++) {
      for (let i = 0; i < 16; i++) {
        const gx = ox + i, gz = oz + j, k = I16(i, j), z = this.partyZone(gx, gz);
        c.block[k] = z ? 0 : 1;
        const zw = this.partyZone(gx - 1, gz), zn = this.partyZone(gx, gz - 1);
        if (z !== zw) c.wallW[k] = 1;
        if (z !== zn) {
          if (z && zn && M.doors.has('N,' + gx + ',' + gz)) c.lintN[k] = 1; else c.wallN[k] = 1;
        }
      }
    }
    const mine = (x, z) => Math.floor(x / S) === c.cx && Math.floor(z / S) === c.cz;
    const own = (gx, gz) => (gx >> 4) === c.cx && (gz >> 4) === c.cz;
    for (const p of PARTY_PROPS) {
      if (mine((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2)) c.props.push({ x0: p.x0, z0: p.z0, x1: p.x1, z1: p.z1, y0: p.y0, y1: p.y1, tex: p.tex });
      // 桌子占的格子标成实心，派对客会绕开
      const cells = p.cell ? [p.cell] : [];
      if (p.cells) for (let x = p.cells[0]; x <= p.cells[1]; x++) for (let z = p.cells[2]; z <= p.cells[3]; z++) cells.push([x, z]);
      for (const [gx, gz] of cells) if (own(gx, gz)) c.block[I16(gx & 15, gz & 15)] = 1;
    }
    const balloons = (rr, x0, z0, x1, z1, n) => {
      for (let k = 0; k < n; k++) {
        c.balloons.push({ x: (x0 + 0.3 + rr() * (x1 - x0 + 0.4)) * CELL, z: (z0 + 0.3 + rr() * (z1 - z0 + 0.4)) * CELL, y: H - 0.75 - rr() * 0.35, q: Math.floor(rr() * 4) });
      }
    };
    for (const R of M.rooms) {
      const cx = (R.x0 + R.x1) >> 1, cz = (R.z0 + R.z1) >> 1;
      if (!own(cx, cz)) continue;
      const rr = mulberry32(ihash(cx, cz, this.seed + 402)), i = cx & 15, j = cz & 15;
      if (R.name === '宴会厅') {
        balloons(rr, R.x0, R.z0, R.x1, R.z1, 26);
        for (let k = 0; k < 4; k++) {
          const f = this.randomWallFace(c, rr, [i + ((k - 1.5) * 3 | 0), j]);
          if (f) c.decals.push({ x: f[0], z: f[1], nx: f[2], nz: f[3], w: 1.8, h: 0.45, y0: H - 0.62, uv: PARTY_UV.bunting, layer: TEX.PARTY });
        }
      } else if (R.name === '后台') {
        // 两张普通的笑脸海报夹着那张颠倒的
        for (const gx of [17, 23]) if (own(gx, 1)) this.addPoster(c, (gx + 0.5) * CELL, CELL + off, 0, 1, gx === 23);
        balloons(rr, R.x0, R.z0, R.x1, R.z1, 4);
      } else if (R.name === '你的客舱') {
        balloons(rr, R.x0, R.z0, R.x1, R.z1, 3);
      } else if (R.deco) {
        if (rr() < 0.8) {
          const x = (cx + 0.5) * CELL, z = (cz + 0.5) * CELL;
          c.props.push({ x0: x - 0.6, z0: z - 0.45, x1: x + 0.6, z1: z + 0.45, y0: 0, y1: 0.75, tex: TEX.CLOTH });
          c.props.push({ x0: x - 0.22, z0: z - 0.22, x1: x + 0.22, z1: z + 0.22, y0: 0.75, y1: 1.0, tex: TEX.CAKE });
          c.block[I16(i, j)] = 1;
        }
        balloons(rr, R.x0, R.z0, R.x1, R.z1, 4 + Math.floor(rr() * 5));
        let f = this.randomWallFace(c, rr, [i, j]);
        if (f && rr() < 0.8) this.addPoster(c, f[0], f[1], f[2], f[3], rr() < 0.5);
        f = this.randomWallFace(c, rr, [i, j]);
        if (f && rr() < 0.5) c.decals.push({ x: f[0], z: f[1], nx: f[2], nz: f[3], w: 0.9, h: 0.9, y0: 1.1, uv: PARTY_UV.smile, layer: TEX.PARTY });
        f = this.randomWallFace(c, rr, [i, j]);
        if (f && rr() < 0.6) c.decals.push({ x: f[0], z: f[1], nx: f[2], nz: f[3], w: 1.8, h: 0.45, y0: H - 0.62, uv: PARTY_UV.bunting, layer: TEX.PARTY });
      }
    }
    // 主走廊两侧墙上零星的笑脸海报（避开门洞和船长室的门锁）
    for (let j = 0; j < 16; j++) {
      for (let i = 0; i < 16; i++) {
        const gx = ox + i, gz = oz + j;
        if (this.partyZone(gx, gz) !== 1 || (gx >= 35 && gx <= 38) || rand01(gx, gz, this.seed + 405) > 0.12) continue;
        if (gz === 11 && c.wallN[I16(i, j)]) this.addPoster(c, (gx + 0.5) * CELL, gz * CELL + off, 0, 1, rand01(gx, gz, 7) < 0.5);
        else if (gz === 12 && !M.doors.has('N,' + gx + ',13')) this.addPoster(c, (gx + 0.5) * CELL, (gz + 1) * CELL - off, 0, -1, true);
      }
    }
  }

  nearExitCell(gx, gz) {
    const e = this.exit;
    return !!e && Math.abs(e.gx - gx) <= 1 && Math.abs(e.gz - gz) <= 1;
  }

  // 带笑脸的普通海报：可以触摸（会惊动派对客）
  addPoster(c, x, z, nx, nz, second) {
    c.decals.push({ x, z, nx, nz, w: 0.62, h: 0.62, y0: 1.25, uv: second ? PARTY_UV.poster2 : PARTY_UV.poster1, layer: TEX.PARTY });
    c.posters.push({ x, z, nx, nz });
  }

  // Level 1.5：走廊两侧挂满打不开的房门和旧相框；死胡同尽头一定是一扇门
  genHallDecor(c, r) {
    const off = WALL_T + 0.006, e = this.exit;
    const wall = (arr, i, j) => (i < 16 && j < 16 ? arr[I16(i, j)] : 0);
    for (let j = 1; j < 16; j++) {
      for (let i = 1; i < 16; i++) {
        for (const west of [true, false]) {
          const k = I16(i, j);
          if (!(west ? c.wallW[k] : c.wallN[k])) continue;
          const k0 = west ? I16(i - 1, j) : I16(i, j - 1);
          if (c.block[k] === c.block[k0]) continue;
          const side = c.block[k] ? -1 : 1;
          const oi = side > 0 ? i : west ? i - 1 : i, oj = side > 0 ? j : west ? j : j - 1;
          const gx = c.cx * 16 + i, gz = c.cz * 16 + j;
          if (e && Math.abs(e.gx - (c.cx * 16 + oi)) <= 1 && Math.abs(e.gz - (c.cz * 16 + oj)) <= 1) continue;
          const walls = wall(c.wallW, oi, oj) + wall(c.wallW, oi + 1, oj) + wall(c.wallN, oi, oj) + wall(c.wallN, oi, oj + 1);
          const x = west ? gx * CELL + side * off : (gx + 0.5) * CELL;
          const z = west ? (gz + 0.5) * CELL : gz * CELL + side * off;
          const nx = west ? side : 0, nz = west ? 0 : side, tx = nz, tz = -nx;
          const roll = r();
          if (walls >= 3 || roll < 0.45) {
            c.decals.push({ x, z, nx, nz, w: 0.92, h: 2.05, y0: 0, uv: [0, 0, 1, 1], layer: TEX.HDOOR, frame: true });
          } else if (roll < 0.8) {
            const n = r() < 0.4 ? 2 : 1;
            for (let q = 0; q < n; q++) {
              const s = 0.32 + r() * 0.3, along = n === 2 ? (q ? 0.35 : -0.35) : (r() - 0.5) * 0.6;
              c.decals.push({ x: x + tx * along, z: z + tz * along, nx, nz, w: s, h: s * (0.9 + r() * 0.4), y0: 1.25 + r() * 0.35,
                uv: PICTURE_UV[Math.floor(r() * 4)], layer: TEX.PICTURE });
            }
          }
        }
      }
    }
  }

  // Level 4 的“窗户”：嵌在墙上的发光窗户实体，靠近就会被带去 Level 1.5
  genWindows(c, r) {
    const [lo, hi] = this.L.windows;
    const n = lo + Math.floor(r() * (hi - lo + 1));
    for (let k = 0; k < n; k++) {
      const f = this.randomWallFace(c, r);
      if (!f) continue;
      const [x, z, nx, nz] = f;
      if (this.nearStart(Math.floor(x / CELL), Math.floor(z / CELL), 4)) continue;
      c.windows.push({ x: x + nx * 0.004, z: z + nz * 0.004, nx, nz, w: 1.6, h: 1.25, y0: 0.95,
        blacked: this.L.gen === 'office' && r() < 0.85 });
    }
  }

  genCorridor(c, r) {
    if (c.cz !== 0) { c.empty = true; return; }
    const ox = c.cx * 16;
    const endX = this.L.corridorLen;
    for (let i = 0; i < 16; i++) {
      const gx = ox + i;
      if (gx >= endX) continue;
      c.wallN[I16(i, 6)] = 1;
      c.wallN[I16(i, 8)] = 1;
    }
    if (endX >= ox && endX < ox + 16) {
      const i = endX - ox;
      c.wallW[I16(i, 6)] = 1;
      c.wallW[I16(i, 7)] = 1;
    }
    let lastCrate = -9;
    for (let i = 1; i < 15; i++) {
      const gx = ox + i;
      if (gx > endX - 3 || (gx > -3 && gx < 4)) continue;
      let roll = r();
      if (roll >= 0.2 && roll < 0.27 && i - lastCrate < 3) roll = 1; // 箱子不能斜向相邻，否则会堵住通道
      if (roll < 0.08) {
        // 侧面凹室（死胡同）
        const north = r() < 0.5;
        const j = north ? 5 : 8;
        const edgeJ = north ? 6 : 8;
        c.wallN[I16(i, edgeJ)] = 0;
        c.wallW[I16(i, j)] = 1;
        c.wallW[I16(i + 1, j)] = 1;
        c.wallN[I16(i, north ? 5 : 9)] = 1;
      } else if (roll < 0.2) {
        c.pillar[I16(i, 7)] = 2;
      } else if (roll < 0.27) {
        const j = r() < 0.5 ? 6 : 7;
        lastCrate = i;
        c.block[I16(i, j)] = 1;
        const cxm = (gx + 0.5) * CELL, czm = (j + 0.5) * CELL + (j === 6 ? -0.3 : 0.3);
        const s = 0.5 + r() * 0.15;
        c.props.push({ x0: cxm - s, z0: czm - s, x1: cxm + s, z1: czm + s, y0: 0, y1: s * 2 });
      }
    }
  }

  fixExit(c) {
    const e = this.exit;
    // 这些布局在生成时已经为出口留好位置
    if (!e || e.end || ['tunnels', 'station', 'ship', 'party', 'beach', 'pools', 'office', 'lightsout'].includes(this.L.gen)) return;
    if ((e.gx >> 4) !== c.cx || (e.gz >> 4) !== c.cz) return;
    const i = e.gx & 15, j = e.gz & 15;
    c.wallN[I16(i, j)] = 1;
    c.lintN[I16(i, j)] = 0;
    c.wallW[I16(i, j)] = 0;
    c.wallW[I16(i + 1, j)] = 0;
    c.wallN[I16(i, j + 1)] = 0;
    for (const [a, b] of [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]]) {
      if (a < 16 && b < 16) c.pillar[I16(a, b)] = 0;
    }
    c.block[I16(i, j)] = 0;
    c.block[I16(i, j + 1)] = 0;
    const x0 = e.gx * CELL, z0 = e.gz * CELL;
    c.props = c.props.filter((p) => p.x1 < x0 - 0.1 || p.x0 > x0 + CELL + 0.1 || p.z1 < z0 - 0.1 || p.z0 > z0 + 2 * CELL + 0.1);
  }

  genLights(c, r) {
    const L = this.L.light;
    if (c.pool) return;
    if (L.none) return;
    const ox = c.cx * 16, oz = c.cz * 16;
    const corridor = this.L.gen === 'corridor';
    for (let j = 0; j < 16; j++) {
      for (let i = 0; i < 16; i++) {
        const gx = ox + i, gz = oz + j;
        let x = (gx + 0.5) * CELL, z = (gz + 0.5) * CELL;
        let place;
        if (corridor) {
          place = j === 6 && (i & 1) === 0 && gx < this.L.corridorLen;
          z = 7 * CELL;
        } else if (L.every) {
          const off = L.offset || 0;
          place = imod(gx - off, L.every) === 0 && imod(gz - off, L.every) === 0;
        } else {
          place = rand01(gx, gz, this.seed + 5) < L.chance || (gx === this.start.gx && gz === this.start.gz);
        }
        if (!place || (!corridor && c.block[I16(i, j)])) continue;
        let type = 0;
        if (corridor) {
          type = r() < L.dead ? 2 : 1;
        } else {
          const dz = fbm(gx / L.darkScale, gz / L.darkScale, this.seed + 17, 2);
          if (dz < L.darkThresh) type = r() < 0.85 ? 2 : 1;
          else if (r() < L.dead) type = 2;
          else if (r() < L.flicker) type = 1;
          if (this.nearStart(gx, gz, 4)) type = 0;
        }
        const y = this.L.wallH - (L.drop || 0.25);
        c.lights.push({ x, y, z, type, seed: Math.floor(r() * 100000), rate: 6 + r() * 12, level: 1, on: true });
      }
    }
  }

  genItems(c, r) {
    const it = this.L.items;
    if (this.L.gen === 'pools') return;
    let k = 0;
    const place = (type, prob) => {
      const id = c.cx + ':' + c.cz + ':' + (k++);
      if (r() >= prob) return;
      // 隧道层大部分格子是实心的，多试几次
      for (let tries = 0; tries < 8; tries++) {
        const i = Math.floor(r() * 16), j = Math.floor(r() * 16);
        const jx = r(), jz = r(), ph = r() * 6;
        const gx = c.cx * 16 + i, gz = c.cz * 16 + j;
        if (c.block[I16(i, j)]) continue;
        if (this.nearStart(gx, gz, 2) || this.picked.has(id)) return;
        c.items.push({ id, type, x: (gx + 0.25 + jx * 0.5) * CELL, z: (gz + 0.25 + jz * 0.5) * CELL, phase: ph });
        return;
      }
    };
    place('almond', it.almond);
    place('almond', it.almond * 0.35);
    place('battery', it.battery);
    // 补给箱附近多放一些
    const sup = c.supply || 0;
    for (let s = 0; s < sup; s++) place(r() < 0.5 ? 'almond' : 'battery', 0.4);
  }

  // 随机选一个非实心格
  randomOpenCell(c, r, tries = 10) {
    for (let t = 0; t < tries; t++) {
      const i = Math.floor(r() * 16), j = Math.floor(r() * 16);
      if (!c.block[I16(i, j)]) return [i, j];
    }
    return null;
  }

  // 地上的水洼 / 黑色油污（贴花，着色器会给它镜面反射）
  genPuddles(c, r) {
    const [lo, hi] = this.L.puddles;
    const n = lo + Math.floor(r() * (hi - lo + 1));
    const tunnel = this.L.gen === 'tunnels';
    for (let k = 0; k < n; k++) {
      const cell = this.randomOpenCell(c, r);
      if (!cell) continue;
      const gx = c.cx * 16 + cell[0], gz = c.cz * 16 + cell[1];
      if (this.nearStart(gx, gz, 1)) continue;
      const rx = tunnel ? 0.45 + r() * 0.5 : 0.6 + r() * 1.4, rz = rx * (0.45 + r() * 0.45);
      c.puddles.push({
        x: (gx + 0.2 + r() * 0.6) * CELL, z: (gz + 0.2 + r() * 0.6) * CELL, rx, rz, rot: r() * Math.PI,
        layer: r() < (this.L.ooze || 0) ? TEX.OOZE : TEX.PUDDLE,
      });
    }
  }

  // 找一段墙并返回它朝向空地一侧的表面：[x, z, nx, nz, 沿墙方向 tx, tz]
  randomWallFace(c, r, near) {
    for (let t = 0; t < 12; t++) {
      let i, j;
      if (near) { i = clamp(near[0] + Math.floor(r() * 5) - 2, 1, 15); j = clamp(near[1] + Math.floor(r() * 5) - 2, 1, 15); }
      else { i = 1 + Math.floor(r() * 15); j = 1 + Math.floor(r() * 15); }
      const west = r() < 0.5;
      const k = I16(i, j);
      if (west ? !c.wallW[k] || c.lintW[k] : !c.wallN[k] || c.lintN[k]) continue;
      const k0 = west ? I16(i - 1, j) : I16(i, j - 1);
      let side;
      if (c.block[k] && c.block[k0]) continue;
      if (c.block[k]) side = -1; else if (c.block[k0]) side = 1; else side = r() < 0.5 ? 1 : -1;
      const gx = c.cx * 16 + i, gz = c.cz * 16 + j;
      const e = this.exit;
      if (e && Math.abs(e.gx - gx) <= 1 && Math.abs(e.gz - gz) <= 1) continue;
      const off = WALL_T + 0.008;
      if (west) return [gx * CELL + side * off, (gz + 0.5) * CELL, side, 0, 0, 1];
      return [(gx + 0.5) * CELL, gz * CELL + side * off, 0, side, 1, 0];
    }
    return null;
  }

  // 墙上的贴花：混凝土剥落露筋、渗水痕、M.E.G. 的喷漆标记、幸存者留下的刻痕
  genDecals(c, r) {
    const L = this.L, H = L.wallH;
    const kinds = L.gen === 'tunnels' ? ['spall', 'leak', 'leak', 'spall'] : ['spall', 'leak', 'spall', 'tally', 'leak'];
    const add = (f, kind) => {
      if (!f) return;
      const [x, z, nx, nz, tx, tz] = f;
      const j = (r() - 0.5) * 0.8;
      let w, h, y0;
      if (kind === 'leak') { w = 1.1 + r() * 0.5; h = 1.6 + r() * 0.8; y0 = H - h; }
      else if (kind === 'spall') { w = 0.8 + r() * 0.6; h = w * 0.75; y0 = 0.3 + r() * (H - 1.3); }
      else { w = 1.0 + r() * 0.2; h = w; y0 = 0.9 + r() * 0.4; }
      c.decals.push({ x: x + tx * j, z: z + tz * j, nx, nz, tx, tz, w, h, y0, uv: DECAL_UV[kind] });
    };
    for (const s of c.supplyAt || []) if (r() < 0.7) add(this.randomWallFace(c, r, s), 'arrow');
    const n = Math.floor(L.decals * (4 + r() * 5));
    for (let k = 0; k < n; k++) add(this.randomWallFace(c, r), kinds[Math.floor(r() * kinds.length)]);
  }

  // Level 2 的蒸汽泄漏点：贴着墙、在管道的高度
  genVents(c, r) {
    const n = r() < 0.6 ? 1 + (r() < 0.3 ? 1 : 0) : 0;
    for (let k = 0; k < n; k++) {
      const f = this.randomWallFace(c, r);
      if (!f) continue;
      const [x, z, nx, nz, tx, tz] = f;
      const j = (r() - 0.5) * 1.2;
      c.vents.push({ x: x + tx * j + nx * 0.2, y: 1.9 + r() * 0.5, z: z + tz * j + nz * 0.2, nx, nz, phase: r() * 10, rate: 0.6 + r() * 0.8 });
    }
  }

  // ---------------------------------------------------------
  //  查询：光照、视线、寻路、碰撞
  // ---------------------------------------------------------
  lightLevel(l, t) {
    if (l.type === 0) return 1;
    if (l.type === 2) return 0;
    if (this.L.light.strobe) {
      const s = Math.floor(t * l.rate * 0.6);
      const h = rand01(s, l.seed, 13);
      return h < 0.25 ? 0.05 : 0.6 + 0.4 * h;
    }
    const burst = vnoise1(t * 0.3 + l.seed * 0.001, l.seed);
    if (burst < 0.5) return 1;
    const s = Math.floor(t * l.rate);
    const h = rand01(s, l.seed, 11);
    return h < 0.45 ? 0.03 : h < 0.6 ? 0.45 : 1;
  }

  // 格子 DDA，墙在格子边上
  los(ax, az, bx, bz, bars = false) {
    const x = ax / CELL, z = az / CELL, ex = bx / CELL, ez = bz / CELL;
    let gx = Math.floor(x), gz = Math.floor(z);
    const tgx = Math.floor(ex), tgz = Math.floor(ez);
    const dx = ex - x, dz = ez - z;
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tmx = dx > 0 ? (gx + 1 - x) * tdx : dx < 0 ? (x - gx) * tdx : Infinity;
    let tmz = dz > 0 ? (gz + 1 - z) * tdz : dz < 0 ? (z - gz) * tdz : Infinity;
    let n = Math.abs(tgx - gx) + Math.abs(tgz - gz);
    if (n > 120) return false;
    while (n-- > 0) {
      if (tmx < tmz) {
        if (this.wallW(stepX > 0 ? gx + 1 : gx, gz) || (bars && this.barW(stepX > 0 ? gx + 1 : gx, gz))) return false;
        gx += stepX; tmx += tdx;
      } else {
        if (this.wallN(gx, stepZ > 0 ? gz + 1 : gz) || (bars && this.barN(gx, stepZ > 0 ? gz + 1 : gz))) return false;
        gz += stepZ; tmz += tdz;
      }
    }
    return true;
  }

  // 水平射线（单位方向 ux,uz）到第一面墙的距离，最远 maxD；LiDAR 用
  rayWall(x0, z0, ux, uz, maxD) {
    const x = x0 / CELL, z = z0 / CELL;
    let gx = Math.floor(x), gz = Math.floor(z);
    const sx = ux > 0 ? 1 : -1, sz = uz > 0 ? 1 : -1;
    const tdx = ux !== 0 ? Math.abs(CELL / ux) : Infinity, tdz = uz !== 0 ? Math.abs(CELL / uz) : Infinity;
    let tmx = ux > 0 ? (gx + 1 - x) * tdx : ux < 0 ? (x - gx) * tdx : Infinity;
    let tmz = uz > 0 ? (gz + 1 - z) * tdz : uz < 0 ? (z - gz) * tdz : Infinity;
    for (let n = 0; n < 200; n++) {
      if (tmx < tmz) {
        if (tmx > maxD) return maxD;
        if (this.wallW(sx > 0 ? gx + 1 : gx, gz)) return Math.max(0, tmx - WALL_T / Math.abs(ux));
        gx += sx; tmx += tdx;
      } else {
        if (tmz > maxD) return maxD;
        if (this.wallN(gx, sz > 0 ? gz + 1 : gz)) return Math.max(0, tmz - WALL_T / Math.abs(uz));
        gz += sz; tmz += tdz;
      }
    }
    return maxD;
  }

  // 以 (sgx,sgz) 为中心、半径 R 的广度优先搜索
  bfs(sgx, sgz, R, tgx, tgz) {
    const W = R * 2 + 1, ox = sgx - R, oz = sgz - R;
    const size = W * W;
    if (!this._bfsDist || this._bfsDist.length < size) {
      this._bfsDist = new Int16Array(size);
      this._bfsPrev = new Int32Array(size);
      this._bfsQ = new Int32Array(size);
    }
    const dist = this._bfsDist, prev = this._bfsPrev, q = this._bfsQ;
    dist.fill(-1, 0, size);
    const s = R * W + R;
    dist[s] = 0; prev[s] = -1;
    let qh = 0, qt = 0;
    q[qt++] = s;
    const target = tgx === undefined ? -1 : (tgz - oz) * W + (tgx - ox);
    while (qh < qt) {
      const cur = q[qh++];
      if (cur === target) break;
      const lx = cur % W, lz = (cur / W) | 0;
      const gx = lx + ox, gz = lz + oz;
      const d = dist[cur] + 1;
      if (lx < W - 1 && dist[cur + 1] < 0 && this.canMove(gx, gz, 1, 0)) { dist[cur + 1] = d; prev[cur + 1] = cur; q[qt++] = cur + 1; }
      if (lx > 0 && dist[cur - 1] < 0 && this.canMove(gx, gz, -1, 0)) { dist[cur - 1] = d; prev[cur - 1] = cur; q[qt++] = cur - 1; }
      if (lz < W - 1 && dist[cur + W] < 0 && this.canMove(gx, gz, 0, 1)) { dist[cur + W] = d; prev[cur + W] = cur; q[qt++] = cur + W; }
      if (lz > 0 && dist[cur - W] < 0 && this.canMove(gx, gz, 0, -1)) { dist[cur - W] = d; prev[cur - W] = cur; q[qt++] = cur - W; }
    }
    return { W, ox, oz, dist, prev, target, count: qt, q };
  }

  findPath(sgx, sgz, tgx, tgz, R = 30) {
    if (Math.abs(tgx - sgx) > R || Math.abs(tgz - sgz) > R) return null;
    const b = this.bfs(sgx, sgz, R, tgx, tgz);
    if (b.dist[b.target] < 0) return null;
    const path = [];
    let cur = b.target;
    while (cur >= 0 && b.prev[cur] >= 0) {
      path.push([(cur % b.W) + b.ox, ((cur / b.W) | 0) + b.oz]);
      cur = b.prev[cur];
    }
    path.reverse();
    return path;
  }

  // 返回所有路径距离在 [minD,maxD] 内的格子
  reachableCells(sgx, sgz, minD, maxD) {
    const b = this.bfs(sgx, sgz, maxD);
    const out = [];
    for (let k = 0; k < b.count; k++) {
      const cur = b.q[k];
      const d = b.dist[cur];
      if (d >= minD && d <= maxD) out.push([(cur % b.W) + b.ox, ((cur / b.W) | 0) + b.oz, d]);
    }
    return out;
  }

  pathDistance(sgx, sgz, tgx, tgz, R = 24) {
    if (Math.abs(tgx - sgx) > R || Math.abs(tgz - sgz) > R) return Infinity;
    const b = this.bfs(sgx, sgz, R, tgx, tgz);
    const d = b.dist[b.target];
    return d < 0 ? Infinity : d;
  }

  // 圆形碰撞，返回修正后的位置
  collide(px, pz, rad) {
    if (this.poolBounds) {
      const b = this.poolBounds, S = CHUNK * CELL;
      px = clamp(px, b.minX * S + WALL_T + rad, (b.maxX + 1) * S - WALL_T - rad);
      pz = clamp(pz, b.minZ * S + WALL_T + rad, (b.maxZ + 1) * S - WALL_T - rad);
    }
    const gx = Math.floor(px / CELL), gz = Math.floor(pz / CELL);
    const B = this._boxes;
    B.length = 0;
    for (let z = gz - 1; z <= gz + 1; z++) {
      for (let x = gx - 1; x <= gx + 2; x++) {
        if (this.wallW(x, z) || this.barW(x, z)) B.push(x * CELL - WALL_T, z * CELL - WALL_T, x * CELL + WALL_T, (z + 1) * CELL + WALL_T);
      }
    }
    for (let z = gz - 1; z <= gz + 2; z++) {
      for (let x = gx - 1; x <= gx + 1; x++) {
        if (this.wallN(x, z) || this.barN(x, z)) B.push(x * CELL - WALL_T, z * CELL - WALL_T, (x + 1) * CELL + WALL_T, z * CELL + WALL_T);
      }
    }
    for (let z = gz - 1; z <= gz + 2; z++) {
      for (let x = gx - 1; x <= gx + 2; x++) {
        const p = this.pillar(x, z);
        if (p) {
          const s = PILLAR_HALF[p];
          B.push(x * CELL - s, z * CELL - s, x * CELL + s, z * CELL + s);
        }
      }
    }
    // 机器和传送带可能跨出所属区块，按它们的最大延伸距离寻找碰撞盒
    const cs = CHUNK * CELL, reach = this.L.gen === 'station' ? 6 : 3;
    for (let z = Math.floor((pz - reach) / cs); z <= Math.floor((pz + reach) / cs); z++) {
      for (let x = Math.floor((px - reach) / cs); x <= Math.floor((px + reach) / cs); x++) {
        const c = this.chunk(x, z);
        for (const p of c.props) {
          if (p.y0 > 0.01) continue;
          if (p.x1 < px - 3 || p.x0 > px + 3 || p.z1 < pz - 3 || p.z0 > pz + 3) continue;
          B.push(p.x0, p.z0, p.x1, p.z1);
        }
      }
    }
    const r2 = rad * rad;
    for (let it = 0; it < 3; it++) {
      let moved = false;
      for (let k = 0; k < B.length; k += 4) {
        const x0 = B[k], z0 = B[k + 1], x1 = B[k + 2], z1 = B[k + 3];
        const cx = px < x0 ? x0 : px > x1 ? x1 : px;
        const cz = pz < z0 ? z0 : pz > z1 ? z1 : pz;
        const dx = px - cx, dz = pz - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r2) continue;
        moved = true;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2), push = (rad - d) / d;
          px += dx * push; pz += dz * push;
        } else {
          // 圆心已在盒内：沿最短方向推出
          const l = px - x0, rr = x1 - px, t = pz - z0, b = z1 - pz;
          const m = Math.min(l, rr, t, b);
          if (m === l) px = x0 - rad; else if (m === rr) px = x1 + rad; else if (m === t) pz = z0 - rad; else pz = z1 + rad;
        }
      }
      if (!moved) break;
    }
    if (this.L.gen === 'pools') {
      const S = CHUNK * CELL, cx = Math.floor(px / S), cz = Math.floor(pz / S);
      const room = this.poolRoom(cx, cz);
      for (const p of room.columns) {
        const x = cx * S + p.x, z = cz * S + p.z, dx = px - x, dz = pz - z, d = Math.hypot(dx, dz);
        const rr = p.r + rad;
        if (d < rr) {
          px = x + (d > 0.001 ? dx / d : 1) * rr;
          pz = z + (d > 0.001 ? dz / d : 0) * rr;
        }
      }
    }
    return [px, pz];
  }
}
