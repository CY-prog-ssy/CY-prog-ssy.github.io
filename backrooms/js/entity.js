'use strict';
// ============================================================
//  实体 AI
//  smiler  —— 只在你不看它时移动（盯住它会消耗理智）
//  hound   —— 靠声音狩猎：奔跑会引来它，蹲伏可以避开
//  stalker —— 被光吸引：手电筒照到它就会被追
//  chaser  —— LEVEL ! 的追逐者，永远在你身后
//  wretch  —— 熄灯层的怨魂：完全失明，只循声追踪；蹲下移动时它听不见你
// ============================================================

const ENTITY_TYPES = {
  smiler: { tex: TEX.SMILER, eyes: -1, w: 1.15, h: 1.15, y0: 1.0, emit: 1.8, catchDist: 1.1, speed: 2.4, name: '笑魇（Smiler）' },
  hound: { tex: TEX.HOUND, eyes: TEX.HOUND_EYES, w: 1.7, h: 1.2, y0: 0, emit: 0, eyesEmit: 3.5, catchDist: 1.15,
    wander: 1.4, investigate: 2.7, chase: 3.75, name: '猎犬（Hound）' },
  stalker: { tex: TEX.STALKER, eyes: TEX.STALKER_EYES, w: 1.0, h: 2.4, y0: 0, emit: 0, eyesEmit: 4, catchDist: 1.1,
    wander: 1.1, investigate: 2.2, chase: 3.4, name: '窃皮者（Skin-Stealer）' },
  chaser: { tex: TEX.STALKER, eyes: TEX.STALKER_EYES, w: 1.15, h: 2.75, y0: 0, emit: 0, eyesEmit: 5, catchDist: 1.2,
    chase: 3.7, name: '？？？' },
  // 母亲：没有形体，只有声音。离得越远念得越响，越近越轻
  mother: { tex: -1, eyes: -1, w: 0, h: 1.6, y0: 0, emit: 0, catchDist: 1.0, speed: 1.4, name: '母亲（Mother）' },
  partygoer: { tex: TEX.PARTYGOER, eyes: -1, w: 1.2, h: 2.2, y0: 0, emit: 0, catchDist: 1.0,
    wander: 0.9, investigate: 1.7, chase: 2.8, name: '派对客（Partygoer）' },
  // 熄灯里的声音错觉：没有模型，也不会抓人
  mimic: { tex: -1, eyes: -1, w: 0, h: 1.5, y0: 0, emit: 0, catchDist: 0, name: '回声' },
  wretch: { tex: TEX.STALKER, eyes: -1, w: 0.95, h: 2.2, y0: 0, emit: 0, catchDist: 1.1,
    wander: 1.2, investigate: 3.1, chase: 3.1, name: '怨魂（Wretch）' },
};

class Entity {
  constructor(game, type) {
    this.g = game;
    this.type = type;
    this.cfg = ENTITY_TYPES[type] || { tex: -1, eyes: -1, h: 0, y0: 0, catchDist: 0 }; // 'none'：本层没有实体
    this.active = false;
    this.spawnTimer = game.level.entityDelay;
    this.x = 0; this.z = 0;
    this.state = 'wander';
    this.path = null; this.pathIdx = 0; this.repath = 0; this.pathKey = '';
    this.target = null;
    this.lastSeenT = -999;
    this.lastKnown = null;
    this.onScreen = false; this.los = false; this.dist = 999;
    this.unseen = 0; this.seenAgo = 99;
    this.stepAcc = 0; this.idle = 0; this.moving = false;
    this.cryTimer = 4;
    this.farT = 0;
    this.anim = Math.random() * 10;
    this.rng = mulberry32(game.world.seed ^ 0x1234567);
  }

  cell() { return [Math.floor(this.x / CELL), Math.floor(this.z / CELL)]; }

  // 在玩家看不见的可达位置出现
  placeAway(minD, maxD) {
    const G = this.g, P = G.player, W = G.world;
    const pg = [Math.floor(P.x / CELL), Math.floor(P.z / CELL)];
    const cells = W.reachableCells(pg[0], pg[1], minD, maxD);
    const ok = cells.filter(([gx, gz]) => {
      const x = (gx + 0.5) * CELL, z = (gz + 0.5) * CELL;
      return !(W.los(P.x, P.z, x, z) && G.inView(x, 1.2, z, 0.25));
    });
    if (!ok.length) return false;
    const c = ok[Math.floor(this.rng() * ok.length)];
    this.x = (c[0] + 0.5) * CELL;
    this.z = (c[1] + 0.5) * CELL;
    this.path = null;
    this.target = null;
    return true;
  }

  trySpawn() {
    const P = this.g.player;
    if (this.type === 'chaser') {
      this.x = P.x - 26;
      this.z = 7 * CELL;
    } else if (!this.placeAway(this.type === 'smiler' ? 9 : 12, this.type === 'smiler' ? 15 : 20)) {
      this.spawnTimer = 2;
      return;
    }
    this.active = true;
    this.state = this.type === 'chaser' ? 'chase' : 'wander';
    this.g.sound.startEntity(this.type);
    if (this.type === 'chaser') this.g.sound.entityCry('chaser');
  }

  update(dt) {
    const G = this.g, P = G.player, W = G.world;
    if (!this.active) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) this.trySpawn();
      return;
    }
    this.anim += dt;
    this.dist = Math.hypot(P.x - this.x, P.z - this.z);
    this.los = this.dist < 45 && W.los(this.x, this.z, P.x, P.z);
    const cy = this.cfg.y0 + this.cfg.h * 0.5;
    this.onScreen = this.los && this.dist < G.visDist && G.inView(this.x, cy, this.z, 0.02);
    this.moving = false;

    // 难度保证：长时间没靠近就重新落到玩家附近，避免一层楼里永远碰不上
    if (this.type !== 'chaser' && this.type !== 'mimic' && !G.settings.stealth) {
      if (this.dist > 24) this.farT += dt; else this.farT = 0;
      const lim = [70, 45, 26][G.settings.diff | 0] || 45;
      if (this.farT > lim) {
        this.farT = 0;
        if (this.placeAway(this.type === 'smiler' ? 9 : 11, 18)) {
          G.sound.distant('steps');
          if (Math.random() < 0.5) G.msg('远处传来脚步——它正在靠近。');
        }
      }
    }

    const stealth = !!G.settings.stealth;
    if (this.type === 'mimic') this.thinkMimic(dt);
    else if (stealth) this.thinkPassive(dt);
    else {
      switch (this.type) {
        case 'smiler': this.thinkSmiler(dt); break;
        case 'hound': case 'wretch': this.thinkHunter(dt, false); break;
        case 'stalker': this.thinkHunter(dt, true); break;
        case 'chaser': this.thinkChaser(dt); break;
        case 'mother': this.thinkMother(dt); break;
        case 'partygoer': this.thinkPartygoer(dt); break;
      }
    }

    this.dist = Math.hypot(P.x - this.x, P.z - this.z);
    if (!stealth && this.dist < this.cfg.catchDist && W.los(this.x, this.z, P.x, P.z, true) && G.state === 'playing') G.caught(this);

    let vol = 0.6;
    if (this.type === 'smiler') vol = this.onScreen ? 1.0 : 0.55;
    else if (this.state === 'chase') vol = 1.0;
    else if (this.state === 'investigate') vol = 0.75;
    G.sound.setEntity(this.x, cy, this.z, vol);
  }

  thinkSmiler(dt) {
    const G = this.g, P = G.player;
    if (this.onScreen) {
      if (this.seenAgo > 6 && this.dist < 26) G.sound.stinger();
      this.seenAgo = 0;
      this.unseen = 0;
      return; // 被注视时静止
    }
    this.seenAgo += dt;
    this.unseen += dt;
    if (this.dist > 36 && this.unseen > 6) {
      this.placeAway(10, 16);
      return;
    }
    const speed = this.cfg.speed * (this.dist < 8 ? 1.3 : 1);
    this.chaseTarget(P.x, P.z, speed, dt);
    this.cryTimer -= dt;
    if (this.cryTimer <= 0 && this.dist < 18) {
      G.sound.entityCry('smiler');
      this.cryTimer = 7 + this.rng() * 8;
    }
  }

  thinkHunter(dt, lightSeeker) {
    const G = this.g, P = G.player, cfg = this.cfg, t = G.time;
    let see, hear;
    if (lightSeeker) {
      const beam = G.player.flash && this.dist < 24 && this.los && G.angleTo(this.x, 1.4, this.z) < 0.55;
      see = this.los && (beam || (this.dist < 14 && P.light > 0.55) || this.dist < 3.5);
      hear = G.playerNoise >= 15 && this.dist < 13;
    } else {
      // 怨魂是瞎的，只能靠听
      see = this.type !== 'wretch' && this.los && this.dist < 17 && (P.light > 0.28 || P.flash || this.dist < 5);
      // 停电时它的听觉更加敏锐
      const hearK = [0.8, 1.0, 1.3][G.settings.diff | 0] || 1;
      hear = G.playerNoise > 0 && this.dist < (G.playerNoise * (G.power < 0.5 ? 1.6 : 1) * (G.level.gen === 'station' ? 1.3 : 1) + 4) * hearK;
    }
    if (see) {
      if (this.state !== 'chase') {
        G.sound.entityCry(this.type);
        G.onChaseStart(this);
      }
      this.state = 'chase';
      this.lastSeenT = t;
      this.lastKnown = [P.x, P.z];
    } else if (hear && this.state !== 'chase') {
      if (this.state !== 'investigate') G.sound.entityStep(0.6);
      this.state = 'investigate';
      this.target = [P.x, P.z];
      this.idle = 0;
      this.path = null;
    }

    const loseAfter = lightSeeker ? 3.5 : G.level.gen === 'station' ? 7 : 4.5;
    switch (this.state) {
      case 'chase': {
        if (!see && t - this.lastSeenT > loseAfter) {
          this.state = 'investigate';
          this.target = this.lastKnown;
          this.idle = 0;
          break;
        }
        // 刚失去视线的一两秒里仍能追踪玩家（气味 / 余光）
        const track = see || t - this.lastSeenT < 1.5;
        const tx = track ? P.x : this.lastKnown[0], tz = track ? P.z : this.lastKnown[1];
        if (track) this.lastKnown = [P.x, P.z];
        this.chaseTarget(tx, tz, cfg.chase, dt);
        break;
      }
      case 'investigate': {
        if (this.goTo(this.target[0], this.target[1], cfg.investigate, dt)) {
          this.idle += dt;
          if (this.idle > 3) { this.state = 'wander'; this.target = null; }
        }
        break;
      }
      default: {
        if (!this.target || this.goTo(this.target[0], this.target[1], cfg.wander, dt)) {
          this.idle += dt;
          if (!this.target || this.idle > 1.2) { this.pickWander(); this.idle = 0; }
        }
        if (this.dist > 55) this.placeAway(14, 22);
      }
    }
  }

  // 母亲：缓慢而执着地向玩家摸过来，一路念叨。音量与距离成正比——声音变轻才是危险的信号
  thinkMother(dt) {
    const G = this.g, P = G.player;
    if (this.dist > 45) { this.placeAway(16, 24); return; }
    // 她只靠声音找人：屏住呼吸（蹲下、站定）时，她只能摸向最后听见的位置
    const noise = G.playerNoise || 0;
    const sure = noise >= 5 || this.dist < 5;
    if (sure || !this.lastKnown) this.lastKnown = [P.x, P.z];
    const tx = sure || !this.lastKnown ? P.x : this.lastKnown[0];
    const tz = sure || !this.lastKnown ? P.z : this.lastKnown[1];
    this.chaseTarget(tx, tz, this.cfg.speed * (sure ? 1 : 0.42) * (this.dist < 6 ? 1.2 : 1), dt);
    this.cryTimer -= dt;
    if (this.cryTimer <= 0) {
      G.sound.motherSpeak(clamp(this.dist / 22, 0.05, 1));
      this.cryTimer = 2.2 + this.rng() * 3.2;
    }
  }

  // 派对客不急着冲刺，但会记住玩家最后出现的位置
  thinkPartygoer(dt) {
    this.thinkHunter(dt, false);
    this.cryTimer -= dt;
    if (this.cryTimer <= 0 && this.dist < 24) {
      this.g.sound.entityCry('partygoer');
      this.cryTimer = 5 + this.rng() * 6;
    }
  }

  // 假浪声固定在远处，混着呼吸；靠近以后消散，不变成追逐实体
  thinkMimic(dt) {
    this.cryTimer -= dt;
    if (this.cryTimer <= 0) {
      this.g.sound.entityCry('mimic');
      this.cryTimer = 4 + this.rng() * 4;
    }
    if (this.dist < 3.5 || this.dist > 55) {
      this.active = false;
      this.spawnTimer = 10 + this.rng() * 8;
      this.g.sound.stopEntity();
    }
  }

  // 隐身模式：看不见、听不见玩家，只在附近漫无目的地游荡（母亲仍会念叨）
  thinkPassive(dt) {
    const G = this.g;
    this.state = 'wander';
    const speed = this.cfg.wander || this.cfg.speed || 1.2;
    if (!this.target || this.goTo(this.target[0], this.target[1], speed, dt)) {
      this.idle += dt;
      if (!this.target || this.idle > 1.5) { this.pickWander(); this.idle = 0; }
    }
    if (this.dist > 55 && this.type !== 'chaser') this.placeAway(14, 22);
    if (this.type === 'mother') {
      this.cryTimer -= dt;
      if (this.cryTimer <= 0) {
        G.sound.motherSpeak(clamp(this.dist / 22, 0.05, 1));
        this.cryTimer = 2.2 + this.rng() * 3.2;
      }
    }
  }

  // 被外部事件（如停电）惊动，前往大致位置查看
  alert(x, z) {
    if (this.g.settings.stealth || !this.active || this.state === 'chase' || !['hound', 'stalker', 'partygoer'].includes(this.type)) return;
    this.state = 'investigate';
    this.target = [x, z];
    this.idle = 0;
    this.path = null;
    this.g.sound.entityCry(this.type);
  }

  thinkChaser(dt) {
    const G = this.g, P = G.player;
    let speed = this.cfg.chase;
    if (this.dist > 26) speed = 5.4;
    else if (this.dist < 7) speed = 3.45;
    if (P.x - this.x > 70) this.x = P.x - 32;
    this.chaseTarget(P.x, P.z, speed, dt);
    this.cryTimer -= dt;
    if (this.cryTimer <= 0) {
      G.sound.entityCry('chaser');
      this.cryTimer = 5 + this.rng() * 5;
    }
  }

  pickWander() {
    const [cgx, cgz] = this.cell();
    const cells = this.g.world.reachableCells(cgx, cgz, 5, 14);
    if (!cells.length) { this.target = null; return; }
    let c = cells[Math.floor(this.rng() * cells.length)];
    if (!this.g.settings.stealth && this.rng() < 0.45 + 0.15 * (this.g.settings.diff | 0)) {
      // 倾向于朝玩家的方向游荡
      const P = this.g.player;
      let best = Infinity;
      for (let k = 0; k < 12; k++) {
        const cc = cells[Math.floor(this.rng() * cells.length)];
        const d = Math.hypot((cc[0] + 0.5) * CELL - P.x, (cc[1] + 0.5) * CELL - P.z);
        if (d < best) { best = d; c = cc; }
      }
    }
    this.target = [(c[0] + 0.5) * CELL, (c[1] + 0.5) * CELL];
  }

  // ---------- 移动 ----------
  stepToward(tx, tz, speed, dt, collide) {
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    if (d < 0.001) return 0;
    const s = Math.min(d, speed * dt);
    let nx = this.x, nz = this.z;
    if (collide) {
      // 高速追逐也分步，避免贴墙时一步跨进墙里
      const rad = 0.3;
      const n = Math.max(1, Math.ceil(s / 0.22));
      const stepX = (dx / d) * (s / n), stepZ = (dz / d) * (s / n);
      for (let k = 0; k < n; k++) {
        const q = this.g.world.collide(nx + stepX, nz + stepZ, rad);
        const moved2 = Math.hypot(q[0] - nx, q[1] - nz);
        if (moved2 < Math.hypot(stepX, stepZ) * 0.4) {
          // 正前方被家具或墙角挡住：沿单轴滑一下，别僵在原地
          const qx = this.g.world.collide(nx + stepX, nz, rad);
          const qz = this.g.world.collide(nx, nz + stepZ, rad);
          const ax = Math.hypot(qx[0] - nx, qx[1] - nz), az = Math.hypot(qz[0] - nx, qz[1] - nz);
          if (ax >= az && ax > 1e-4) { nx = qx[0]; nz = qx[1]; }
          else if (az > 1e-4) { nx = qz[0]; nz = qz[1]; }
          else { nx = q[0]; nz = q[1]; }
        } else { nx = q[0]; nz = q[1]; }
      }
    } else { nx += (dx / d) * s; nz += (dz / d) * s; }
    const moved = Math.hypot(nx - this.x, nz - this.z);
    this.x = nx; this.z = nz;
    if (moved > 1e-4) {
      this.moving = true;
      this.stepAcc += moved;
      const stride = this.type === 'hound' ? 0.85 : 1.15;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        this.g.onEntityStep(this);
      }
    }
    return d - s;
  }

  followPath(tgx, tgz, speed, dt) {
    const [cgx, cgz] = this.cell();
    const key = tgx + ',' + tgz;
    this.repath -= dt;
    if (!this.path || this.pathKey !== key || this.repath <= 0) {
      this.path = cgx === tgx && cgz === tgz ? [] : this.g.world.findPath(cgx, cgz, tgx, tgz, 30);
      this.pathIdx = 0;
      this.pathKey = key;
      this.repath = 0.5;
      if (!this.path) return 'nopath';
    }
    if (this.pathIdx >= this.path.length) return 'arrived';
    const [px, pz] = this.path[this.pathIdx];
    const bx = this.x, bz = this.z;
    const rem = this.stepToward((px + 0.5) * CELL, (pz + 0.5) * CELL, speed, dt, true);
    const adv = Math.hypot(this.x - bx, this.z - bz);
    // 到达、或者这一步被墙角和家具完全挡住：跳过这个路点，避免原地卡死
    if (rem < 0.08 || adv < 0.012) this.pathIdx++;
    return 'moving';
  }

  chaseTarget(tx, tz, speed, dt) {
    const d = Math.hypot(tx - this.x, tz - this.z);
    if (d < 6 && this.g.world.los(this.x, this.z, tx, tz, true)) {
      this.path = null;
      this.stepToward(tx, tz, speed, dt, true);
      return;
    }
    const r = this.followPath(Math.floor(tx / CELL), Math.floor(tz / CELL), speed, dt);
    if (r !== 'moving') this.stepToward(tx, tz, speed, dt, true);
  }

  goTo(tx, tz, speed, dt) {
    if (Math.hypot(tx - this.x, tz - this.z) < 0.4) return true;
    const r = this.followPath(Math.floor(tx / CELL), Math.floor(tz / CELL), speed, dt);
    if (r === 'nopath') return true;
    if (r === 'arrived') return this.stepToward(tx, tz, speed, dt, true) < 0.4;
    return false;
  }

  // ---------- 渲染 ----------
  sprites(out) {
    if (!this.active || this.cfg.tex < 0) return;
    const c = this.cfg;
    let y0 = c.y0;
    if (this.type === 'smiler') y0 += Math.sin(this.anim * 1.3) * 0.05;
    if (this.type === 'hound' && this.moving) y0 += Math.abs(Math.sin(this.anim * 10)) * 0.06;
    let x = this.x, z = this.z;
    // 贴墙时把贴图整体往外推，减少半张脸穿过墙面的观感
    {
      const r = this.g.world.collide(x, z, 0.9);
      const sx = r[0] - x, sz = r[1] - z, pen = Math.hypot(sx, sz);
      if (pen > 0.01 && pen < 1.4) {
        const k = Math.min(0.6, pen * 1.15) / (pen || 1);
        x += sx * k; z += sz * k;
      }
    }
    if ((this.type === 'stalker' || this.type === 'chaser') && this.moving) {
      const P = this.g.player;
      const sway = Math.sin(this.anim * 7) * 0.05;
      x += Math.cos(P.yaw) * sway;
      z -= Math.sin(P.yaw) * sway;
    }
    out.push({ x, z, y0, w: c.w, h: c.h, layer: c.tex, emit: c.emit, off: 0 });
    if (c.eyes >= 0) out.push({ x, z, y0, w: c.w, h: c.h, layer: c.eyes, emit: c.eyesEmit, off: 0.03 });
  }
}
