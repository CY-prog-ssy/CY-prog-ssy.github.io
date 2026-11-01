'use strict';
// ============================================================
//  音频：全部由 Web Audio 实时合成
// ============================================================

class Sound {
  constructor() {
    this.ctx = null;
    this.vol = 0.8;
    this.ent = null;
    this.beacon = null;
    this.drone = [];
    this.steamSnd = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.vol;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 5;
    comp.attack.value = 0.004; comp.release.value = 0.25;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.sfx = this.gain(1, this.master);
    this.amb = this.gain(0.9, this.master);
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(3.2, 2.4);
    this.verbIn = this.gain(0.55, this.verb);
    this.verb.connect(this.master);
    this.noiseBuf = this.makeNoise(3, false);
    this.brownBuf = this.makeNoise(4, true);
    this.shaperCurve = this.distCurve(10);
    this.buildHum();
  }

  get t() { return this.ctx.currentTime; }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
    if (window.speechSynthesis) speechSynthesis.cancel();
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  setVolume(v) {
    this.vol = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.t, 0.05);
  }

  // ---------- 基础构件 ----------
  gain(v, dest) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    if (dest) g.connect(dest);
    return g;
  }
  osc(type, f) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    return o;
  }
  filter(type, f, q = 1) {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }
  noise(brown, loop) {
    const s = this.ctx.createBufferSource();
    s.buffer = brown ? this.brownBuf : this.noiseBuf;
    s.loop = !!loop;
    return s;
  }
  shaper() {
    const w = this.ctx.createWaveShaper();
    w.curve = this.shaperCurve;
    return w;
  }
  env(g, t, a, peak, d) {
    peak = Math.max(peak, 0.0002);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  impulse(dur, decay) {
    const ctx = this.ctx, rate = ctx.sampleRate, len = Math.floor(rate * dur);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  makeNoise(dur, brown) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return buf;
  }
  distCurve(k) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return c;
  }
  // 播放一段噪声并在结束时停止
  burst(t, dur, brown, filt, dest) {
    const n = this.noise(brown, false);
    n.connect(filt);
    n.start(t, Math.random() * 2);
    n.stop(t + dur + 0.05);
    if (dest) filt.connect(dest);
    return n;
  }
  tone(t, type, f0, f1, a, peak, d, dest) {
    const o = this.osc(type, f0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + a + d);
    const g = this.gain(0, dest);
    this.env(g, t, a, peak, d);
    o.connect(g);
    o.start(t);
    o.stop(t + a + d + 0.05);
    return { o, g };
  }

  // ---------- 空间音频 ----------
  panner(ref = 3, roll = 1.3) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.maxDistance = 10000;
    p.rolloffFactor = roll;
    p.connect(this.sfx);
    return p;
  }
  setPos(p, x, y, z) {
    if (p.positionX) {
      const t = this.t;
      p.positionX.setValueAtTime(x, t); p.positionY.setValueAtTime(y, t); p.positionZ.setValueAtTime(z, t);
    } else p.setPosition(x, y, z);
  }
  listener(x, y, z, fx, fy, fz) {
    if (!this.ctx) return;
    const L = this.ctx.listener, t = this.t;
    if (L.positionX) {
      L.positionX.setValueAtTime(x, t); L.positionY.setValueAtTime(y, t); L.positionZ.setValueAtTime(z, t);
      L.forwardX.setValueAtTime(fx, t); L.forwardY.setValueAtTime(fy, t); L.forwardZ.setValueAtTime(fz, t);
      L.upX.setValueAtTime(0, t); L.upY.setValueAtTime(1, t); L.upZ.setValueAtTime(0, t);
    } else {
      L.setPosition(x, y, z);
      L.setOrientation(fx, fy, fz, 0, 1, 0);
    }
  }

  // ---------- 荧光灯嗡鸣 ----------
  buildHum() {
    this.humG = this.gain(0, this.amb);
    const lp = this.filter('lowpass', 1500, 0.8);
    lp.connect(this.humG);
    const o1 = this.osc('sawtooth', 120); o1.connect(this.gain(0.05, lp));
    const o2 = this.osc('sine', 240); o2.connect(this.gain(0.035, lp));
    const o3 = this.osc('square', 60); o3.connect(this.gain(0.012, lp));
    const o4 = this.osc('sine', 7900); o4.connect(this.gain(0.0025, this.humG));
    const n = this.noise(false, true);
    const bp = this.filter('bandpass', 2600, 2.5);
    const ng = this.gain(0.018, this.humG);
    n.connect(bp); bp.connect(ng);
    const lfo = this.osc('sine', 3.3); lfo.connect(this.gain(0.01, ng.gain));
    for (const s of [o1, o2, o3, o4, n, lfo]) s.start();
  }
  setHum(v) {
    if (this.humG) this.humG.gain.setTargetAtTime(v, this.t, 0.12);
  }

  // ---------- 各层背景音 ----------
  setLevel(L) {
    if (!this.ctx) return;
    this.stopDrone();
    this.roomVerb = L.drone === 'silence' ? 0 : L.drone === 'pool' ? 0.08 : 0.25;
    const t = this.t;
    const out = this.gain(0, this.amb);
    out.gain.setTargetAtTime(1, t, 1.5);
    const nodes = [out];
    const src = (n) => { nodes.push(n); n.start(); return n; };
    switch (L.drone) {
      case 'lobby': {
        const n = src(this.noise(true, true));
        n.connect(this.filter('lowpass', 180, 0.5)).connect(this.gain(0.1, out));
        for (const f of [55, 55.4, 110.3]) src(this.osc('sine', f)).connect(this.gain(0.016, out));
        break;
      }
      case 'warehouse': {
        const n = src(this.noise(true, true));
        const f = this.filter('bandpass', 420, 0.7);
        n.connect(f).connect(this.gain(0.16, out));
        const lfo = src(this.osc('sine', 0.06));
        lfo.connect(this.gain(260, f.frequency));
        src(this.osc('sine', 41)).connect(this.gain(0.03, out));
        break;
      }
      case 'pipes': {
        const n = src(this.noise(true, true));
        n.connect(this.filter('lowpass', 140, 0.7)).connect(this.gain(0.24, out));
        src(this.osc('sawtooth', 31)).connect(this.filter('lowpass', 90, 1)).connect(this.gain(0.07, out));
        const h = src(this.noise(false, true));
        h.connect(this.filter('highpass', 5200, 0.5)).connect(this.gain(0.01, out));
        break;
      }
      case 'office': {
        // 空调出风的气流声 + 远处服务器似的低鸣
        const n = src(this.noise(true, true));
        n.connect(this.filter('lowpass', 260, 0.5)).connect(this.gain(0.08, out));
        const a = src(this.noise(false, true));
        a.connect(this.filter('bandpass', 650, 0.4)).connect(this.gain(0.025, out));
        src(this.osc('sine', 98)).connect(this.gain(0.008, out));
        break;
      }
      case 'house': {
        // 几乎死寂，只有耳鸣般的高音和极低的闷响
        const n = src(this.noise(true, true));
        n.connect(this.filter('lowpass', 110, 0.5)).connect(this.gain(0.12, out));
        src(this.osc('sine', 6200)).connect(this.gain(0.0025, out));
        break;
      }
      case 'station': {
        src(this.osc('sawtooth', 49.5)).connect(this.filter('lowpass', 190, 0.7)).connect(this.gain(0.07, out));
        src(this.noise(true, true)).connect(this.filter('bandpass', 280, 0.8)).connect(this.gain(0.12, out));
        const motor = this.gain(0, out);
        src(this.osc('sawtooth', 63)).connect(this.filter('lowpass', 480, 1)).connect(motor);
        src(this.osc('sine', 9)).connect(this.gain(0.015, motor.gain));
        this.machineG = motor;
        break;
      }
      case 'pool': {
        const water = this.gain(0.1, out);
        src(this.noise(true, true)).connect(this.filter('bandpass', 580, 0.5)).connect(water);
        src(this.osc('sine', 0.13)).connect(this.gain(0.035, water.gain));
        water.connect(this.gain(0.08, this.verbIn));
        break;
      }
      case 'party': {
        const music = this.gain(0.025, out);
        for (const f of [261.6, 329.1, 393.4]) {
          const o = src(this.osc('triangle', f));
          src(this.osc('sine', 0.6)).connect(this.gain(3, o.frequency));
          o.connect(music);
        }
        src(this.osc('sine', 1.7)).connect(this.gain(0.012, music.gain));
        src(this.noise(true, true)).connect(this.filter('lowpass', 130, 0.6)).connect(this.gain(0.06, out));
        break;
      }
      case 'sea': {
        // 海风与远处的浪；另有一路含混的人声和机器声混在浪里，只有靠近海水才听得见
        const wind = this.gain(0.05, out);
        src(this.noise(false, true)).connect(this.filter('bandpass', 420, 0.35)).connect(wind);
        src(this.osc('sine', 0.07)).connect(this.gain(0.03, wind.gain));
        const surf = this.gain(0.12, out);
        src(this.noise(true, true)).connect(this.filter('lowpass', 500, 0.5)).connect(surf);
        src(this.osc('sine', 0.12)).connect(this.gain(0.08, surf.gain));
        const voice = this.gain(0, out);
        const babble = this.gain(0.5, voice);
        src(this.noise(false, true)).connect(this.filter('bandpass', 700, 4)).connect(babble);
        src(this.osc('sine', 5.3)).connect(this.gain(0.35, babble.gain));
        const cry = this.gain(0.35, voice);
        src(this.noise(false, true)).connect(this.filter('bandpass', 1600, 6)).connect(cry);
        src(this.osc('sine', 3.1)).connect(this.gain(0.3, cry.gain));
        const mach = this.gain(0.25, voice);
        src(this.osc('sawtooth', 48)).connect(this.filter('lowpass', 180, 1)).connect(mach);
        src(this.osc('sawtooth', 50.5)).connect(this.filter('lowpass', 160, 1)).connect(mach);
        voice.connect(this.gain(0.4, this.verbIn));
        this.seaVoice = voice;
        break;
      }
      case 'silence': break;
      case 'alarm': {
        const o = src(this.osc('square', 520));
        const ag = this.gain(0.03, out);
        o.connect(this.filter('bandpass', 1000, 1.5)).connect(ag);
        const lfo = src(this.osc('square', 1.2));
        lfo.connect(this.gain(130, o.frequency));
        lfo.connect(this.gain(0.012, ag.gain));
        const n = src(this.noise(true, true));
        n.connect(this.filter('lowpass', 130, 0.7)).connect(this.gain(0.25, out));
        break;
      }
    }
    this.drone = nodes;
  }
  setSeaVoice(v) {
    if (this.seaVoice) this.seaVoice.gain.setTargetAtTime(v * 0.5, this.t, 0.3);
  }
  stopDrone() {
    this.seaVoice = null;
    if (!this.drone.length) return;
    const t = this.t;
    const [out, ...srcs] = this.drone;
    out.gain.cancelScheduledValues(t);
    out.gain.setTargetAtTime(0, t, 0.3);
    for (const s of srcs) { try { s.stop(t + 1.5); } catch (e) { /* 已停止 */ } }
    setTimeout(() => out.disconnect(), 1700);
    this.drone = [];
    this.machineG = null;
  }

  // ---------- 脚步 ----------
  footstep(surface, vol) {
    if (!this.ctx) return;
    const t = this.t;
    const g = this.gain(0, this.sfx);
    g.connect(this.gain(this.roomVerb === undefined ? 0.25 : this.roomVerb, this.verbIn));
    let f, a = 0.003, d = 0.09, pk = 0.45;
    switch (surface) {
      case 'carpet': f = this.filter('lowpass', 380 + Math.random() * 140, 0.6); a = 0.01; d = 0.14; pk = 0.4; break;
      case 'concrete': f = this.filter('bandpass', 1000 + Math.random() * 350, 0.9); break;
      case 'metal': f = this.filter('bandpass', 1700 + Math.random() * 600, 2.2); d = 0.12; pk = 0.5; break;
      case 'water': f = this.filter('bandpass', 600 + Math.random() * 500, 0.6); a = 0.006; d = 0.24; pk = 0.75; break;
      case 'wood': f = this.filter('bandpass', 520 + Math.random() * 200, 1.4); d = 0.13; pk = 0.55; break;
      case 'soft': f = this.filter('lowpass', 180, 0.5); a = 0.01; d = 0.05; pk = 0.13; break;
      case 'sand': f = this.filter('bandpass', 700 + Math.random() * 300, 0.5); a = 0.012; d = 0.12; pk = 0.3; break;
      default: f = this.filter('bandpass', 1500 + Math.random() * 400, 1.2); d = 0.08; break;
    }
    this.env(g, t, a, pk * vol, d);
    this.burst(t, a + d, false, f, g);
    this.tone(t, 'sine', surface === 'carpet' ? 75 : 95, 45, 0.005, (surface === 'soft' ? 0.035 : 0.28) * vol, 0.09, this.sfx);
    if (surface === 'metal') {
      this.tone(t, 'triangle', 650 + Math.random() * 300, 0, 0.002, 0.045 * vol, 0.3, this.sfx);
    } else if (surface === 'water') {
      // 水花溅起的高频部分
      const sg = this.gain(0, this.sfx);
      sg.connect(this.gain(0.3, this.verbIn));
      this.env(sg, t + 0.02, 0.01, 0.35 * vol, 0.2);
      this.burst(t + 0.02, 0.25, false, this.filter('highpass', 2600 + Math.random() * 1500, 0.7), sg);
    }
  }

  // ---------- 母亲的念叨 ----------
  // vol 越大表示她离得越远。共振峰合成一段含混的“人声”，再用浏览器语音念出支离破碎的句子
  motherSpeak(vol) {
    if (!this.ctx) return;
    const t = this.t;
    const out = this.gain(vol * 0.8, this.sfx);
    out.connect(this.gain(0.7 * vol, this.verbIn));
    const f0 = 180 + Math.random() * 70;
    const src = this.osc('sawtooth', f0);
    const vib = this.osc('sine', 5 + Math.random() * 2);
    vib.connect(this.gain(5, src.frequency));
    const env = this.gain(0, out);
    const f1 = this.filter('bandpass', 700, 7), f2 = this.filter('bandpass', 1200, 9);
    src.connect(f1); src.connect(f2);
    f1.connect(env); f2.connect(this.gain(0.6, env));
    const V = [[730, 1090], [270, 2290], [300, 870], [530, 1840], [660, 1720], [400, 800], [490, 1350]];
    env.gain.setValueAtTime(0.0001, t);
    let tt = t;
    const syl = 5 + Math.floor(Math.random() * 10);
    for (let k = 0; k < syl; k++) {
      const d = 0.1 + Math.random() * 0.25, v = V[Math.floor(Math.random() * V.length)];
      f1.frequency.setTargetAtTime(v[0], tt, 0.03);
      f2.frequency.setTargetAtTime(v[1], tt, 0.03);
      src.frequency.setTargetAtTime(f0 * (0.75 + Math.random() * 0.6), tt, 0.05);
      env.gain.setTargetAtTime(0.55, tt, 0.02);
      env.gain.setTargetAtTime(0.02, tt + d * 0.75, 0.03);
      tt += d + (Math.random() < 0.15 ? 0.3 : 0);
    }
    env.gain.setTargetAtTime(0.0001, tt, 0.05);
    src.start(t); vib.start(t); src.stop(tt + 0.5); vib.stop(tt + 0.5);
    const S = window.speechSynthesis;
    if (S && !S.speaking) {
      const words = ['回来', '孩子', '吃饭了', '你在哪', '别走', '妈妈在这里', '把灯关上', '该睡觉了', '门没锁', '别开窗',
        '我看见你了', '过来', '外面冷', '乖', '为什么不说话', '回家'];
      let s = '';
      const n = 2 + Math.floor(Math.random() * 4);
      for (let k = 0; k < n; k++) {
        let w = words[Math.floor(Math.random() * words.length)];
        if (Math.random() < 0.35) w = w.split('').reverse().join(''); // 倒着念
        s += w + (Math.random() < 0.5 ? '，' : '');
      }
      const u = new SpeechSynthesisUtterance(s);
      u.lang = 'zh-CN';
      u.volume = clamp(vol * this.vol, 0, 1);
      u.pitch = 0.1 + Math.random() * 0.5;
      u.rate = 0.55 + Math.random() * 0.6;
      S.speak(u);
    }
  }

  // ---------- 停电 / 来电 ----------
  powerDown() {
    if (!this.ctx) return;
    const t = this.t, tc = t + 1.45;
    const g = this.gain(0, this.verbIn);
    g.connect(this.gain(0.5, this.sfx));
    this.env(g, tc, 0.003, 0.9, 0.6);
    this.burst(tc, 0.6, true, this.filter('lowpass', 320, 0.8), g);
    this.tone(tc, 'sine', 55, 30, 0.004, 0.5, 0.5, this.sfx);
    // 镇流器的嗡鸣随之降调消失
    const o = this.osc('sawtooth', 120);
    o.frequency.setValueAtTime(120, tc);
    o.frequency.exponentialRampToValueAtTime(28, tc + 1.6);
    const og = this.gain(0, this.sfx);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.setValueAtTime(0.05, tc);
    og.gain.exponentialRampToValueAtTime(0.0001, tc + 1.6);
    o.connect(this.filter('lowpass', 600, 0.7)).connect(og);
    o.start(t); o.stop(tc + 1.8);
  }
  powerUp() {
    if (!this.ctx) return;
    const t = this.t;
    const g = this.gain(0, this.verbIn);
    g.connect(this.gain(0.4, this.sfx));
    this.env(g, t, 0.002, 0.7, 0.3);
    this.burst(t, 0.3, false, this.filter('bandpass', 900, 1.2), g);
    this.tone(t + 0.05, 'sawtooth', 40, 120, 0.3, 0.05, 0.8, this.sfx);
  }

  // ---------- 蒸汽泄漏（持续的空间音源） ----------
  startSteam() {
    this.stopSteam();
    if (!this.ctx) return;
    const p = this.panner(2, 1.2);
    const out = this.gain(0, p);
    const n = this.noise(false, true);
    n.connect(this.filter('highpass', 1800, 0.5)).connect(this.filter('lowpass', 7500, 0.5)).connect(out);
    const lfo = this.osc('sine', 0.7);
    const lg = this.gain(0.15, out.gain);
    lfo.connect(lg);
    n.start(); lfo.start();
    this.steamSnd = { p, out, srcs: [n, lfo] };
  }
  setSteam(x, y, z, vol) {
    const s = this.steamSnd;
    if (!s) return;
    this.setPos(s.p, x, y, z);
    s.out.gain.setTargetAtTime(vol, this.t, 0.25);
  }
  stopSteam() {
    const s = this.steamSnd;
    if (!s) return;
    const t = this.t;
    s.out.gain.cancelScheduledValues(t);
    s.out.gain.setTargetAtTime(0, t, 0.1);
    for (const n of s.srcs) { try { n.stop(t + 0.5); } catch (e) { /* 已停止 */ } }
    setTimeout(() => s.p.disconnect(), 700);
    this.steamSnd = null;
  }

  // ---------- 出口收音机 ----------
  startBeacon(L, x, y, z) {
    this.stopBeacon();
    if (!this.ctx) return;
    if (L.beacon === 'waves') {
      const p = this.panner(10, 0.65), out = this.gain(0.75, p), muff = this.filter('lowpass', 1800, 0.6);
      const swell = this.gain(0.22, out), n = this.noise(false, true), lfo = this.osc('sine', 0.16);
      n.connect(muff).connect(swell);
      lfo.connect(this.gain(0.13, swell.gain));
      n.start(); lfo.start();
      this.beacon = { p, out, muff, srcs: [n, lfo], waves: true };
      this.setPos(p, x, y, z);
      return;
    }
    const p = this.panner(8, 0.8);
    const muff = this.filter('lowpass', 2500, 0.7);
    muff.connect(p);
    const out = this.gain(0, muff);
    out.gain.setTargetAtTime(1.6, this.t, 1.0);
    const bus = this.gain(0.9);
    const sh = this.shaper();
    const bp = this.filter('bandpass', 1300, 0.55);
    bus.connect(sh); sh.connect(bp); bp.connect(out);
    const st = this.noise(false, true);
    const sg = this.gain(0.025, out);
    st.connect(this.filter('highpass', 2400, 0.5)).connect(sg);
    const lfo = this.osc('square', 13);
    lfo.connect(this.gain(0.018, sg.gain));
    st.start(); lfo.start();
    this.beacon = { p, out, bus, muff, srcs: [st, lfo], next: this.t + 0.4, idx: 0, melody: L.melody, tempo: L.tempo };
    this.setPos(p, x, y, z);
  }
  updateBeacon(dist) {
    const b = this.beacon;
    if (!b) return;
    // 越远越闷，靠近时逐渐清晰
    b.muff.frequency.setTargetAtTime(500 + 5500 * Math.pow(clamp(1 - dist / 70, 0, 1), 1.5), this.t, 0.3);
    if (b.waves) return;
    while (b.next < this.t + 0.25) {
      const [m, beats] = b.melody[b.idx % b.melody.length];
      b.idx++;
      const dur = beats * b.tempo;
      if (m > 0) this.note(b.next, 440 * Math.pow(2, (m - 69) / 12), dur, b.bus);
      b.next += dur;
    }
  }
  note(t, f, dur, dest) {
    const len = Math.max(0.35, dur * 1.6);
    const g = this.gain(0, dest);
    this.env(g, t, 0.01, 0.5, len);
    const o = this.osc('triangle', f);
    o.detune.setValueAtTime((Math.random() - 0.5) * 24, t);
    const o2 = this.osc('sine', f * 2.004);
    o.connect(g);
    o2.connect(this.gain(0.35, g));
    o.start(t); o2.start(t);
    o.stop(t + len + 0.1); o2.stop(t + len + 0.1);
  }
  stopBeacon() {
    const b = this.beacon;
    if (!b) return;
    const t = this.t;
    b.out.gain.cancelScheduledValues(t);
    b.out.gain.setTargetAtTime(0, t, 0.2);
    for (const s of b.srcs) { try { s.stop(t + 1); } catch (e) { /* 已停止 */ } }
    setTimeout(() => b.p.disconnect(), 1200);
    this.beacon = null;
  }

  // ---------- 实体 ----------
  startEntity(type) {
    this.stopEntity();
    if (!this.ctx) return;
    const p = this.panner(2, 1.5);
    const out = this.gain(0, p);
    const srcs = [];
    const src = (n) => { srcs.push(n); n.start(); return n; };
    switch (type) {
      case 'smiler': {
        src(this.osc('sine', 46)).connect(this.gain(0.4, out));
        const g2 = this.gain(0.03, out);
        src(this.osc('sine', 3100)).connect(g2);
        src(this.osc('sine', 5)).connect(this.gain(0.03, g2.gain));
        src(this.noise(false, true)).connect(this.filter('bandpass', 700, 6)).connect(this.gain(0.15, out));
        break;
      }
      case 'hound': {
        const ag = this.gain(0.4, out);
        src(this.osc('sawtooth', 55)).connect(this.filter('lowpass', 420, 1)).connect(ag);
        src(this.osc('sawtooth', 11)).connect(this.gain(0.35, ag.gain));
        src(this.noise(true, true)).connect(this.filter('bandpass', 320, 1)).connect(this.gain(0.35, out));
        break;
      }
      case 'stalker': {
        const bg = this.gain(0.35, out);
        src(this.noise(false, true)).connect(this.filter('bandpass', 1100, 5)).connect(bg);
        src(this.osc('sine', 0.33)).connect(this.gain(0.35, bg.gain));
        const o = src(this.osc('sine', 180));
        src(this.osc('sine', 5)).connect(this.gain(8, o.frequency));
        o.connect(this.gain(0.06, out));
        break;
      }
      case 'partygoer': {
        const voice = this.osc('sawtooth', 145);
        src(voice).connect(this.filter('bandpass', 660, 3)).connect(this.gain(0.08, out));
        src(this.osc('sine', 3.5)).connect(this.gain(7, voice.frequency));
        break;
      }
      case 'wretch': {
        // 沉重、缓慢的喘息
        const breath = this.gain(0.3, out);
        src(this.noise(true, true)).connect(this.filter('bandpass', 520, 1.4)).connect(breath);
        src(this.osc('sine', 0.28)).connect(this.gain(0.28, breath.gain));
        src(this.osc('sawtooth', 48)).connect(this.filter('lowpass', 200, 1)).connect(this.gain(0.08, out));
        break;
      }
      case 'mimic': {
        p.refDistance = 8; p.rolloffFactor = 0.8;
        const swell = this.gain(0.16, out);
        src(this.noise(false, true)).connect(this.filter('lowpass', 1200, 0.6)).connect(swell);
        src(this.osc('sine', 0.19)).connect(this.gain(0.1, swell.gain));
        break;
      }
      case 'chaser': {
        const lp = this.filter('lowpass', 700, 2);
        lp.connect(this.gain(0.35, out));
        src(this.osc('sawtooth', 70)).connect(lp);
        src(this.osc('sawtooth', 73.5)).connect(lp);
        src(this.osc('sine', 7)).connect(this.gain(250, lp.frequency));
        src(this.noise(true, true)).connect(this.filter('lowpass', 420, 0.7)).connect(this.gain(0.5, out));
        break;
      }
    }
    this.ent = { p, out, srcs, type };
  }
  setEntity(x, y, z, vol) {
    if (!this.ent) return;
    this.setPos(this.ent.p, x, y, z);
    this.ent.out.gain.setTargetAtTime(vol, this.t, 0.15);
  }
  stopEntity() {
    if (window.speechSynthesis) speechSynthesis.cancel();
    const e = this.ent;
    if (!e) return;
    const t = this.t;
    e.out.gain.cancelScheduledValues(t);
    e.out.gain.setTargetAtTime(0, t, 0.1);
    for (const s of e.srcs) { try { s.stop(t + 0.6); } catch (err) { /* 已停止 */ } }
    setTimeout(() => e.p.disconnect(), 800);
    this.ent = null;
  }
  entityStep(vol) {
    if (!this.ent) return;
    const t = this.t;
    const g = this.gain(0, this.ent.p);
    this.env(g, t, 0.004, 0.6 * vol, 0.12);
    this.burst(t, 0.15, true, this.filter('lowpass', 260, 0.8), g);
    this.tone(t, 'sine', 55, 35, 0.004, 0.4 * vol, 0.1, this.ent.p);
  }
  entityCry(type) {
    if (!this.ent) return;
    const t = this.t, p = this.ent.p;
    if (type === 'mimic') {
      const g = this.gain(0, p);
      this.env(g, t, 0.6, 0.2, 1.1);
      this.burst(t, 1.8, false, this.filter('bandpass', 950, 1.6), g);
    } else if (type === 'partygoer') {
      for (let k = 0; k < 4; k++) {
        const g = this.gain(0, p), at = t + k * 0.22;
        const bp = this.filter('bandpass', 850, 2);
        bp.connect(g);
        this.env(g, at, 0.025, 0.28, 0.17);
        this.tone(at, 'sawtooth', 230 - k * 15, 130, 0.03, 0.35, 0.16, bp);
      }
    } else if (type === 'hound') {
      const o = this.osc('sawtooth', 240);
      o.frequency.exponentialRampToValueAtTime(520, t + 0.3);
      o.frequency.exponentialRampToValueAtTime(330, t + 1.4);
      const vib = this.osc('sine', 6);
      vib.connect(this.gain(14, o.frequency));
      const g = this.gain(0, p);
      this.env(g, t, 0.08, 0.7, 1.4);
      g.connect(this.gain(0.4, this.verbIn));
      o.connect(this.filter('bandpass', 900, 2.5)).connect(g);
      o.start(t); vib.start(t); o.stop(t + 1.6); vib.stop(t + 1.6);
    } else if (type === 'stalker') {
      const g = this.gain(0, p);
      this.env(g, t, 0.05, 0.45, 1.3);
      g.connect(this.gain(0.4, this.verbIn));
      const bp = this.filter('bandpass', 1500, 1);
      bp.connect(g);
      for (const f of [620, 664, 931]) {
        const o = this.osc('sawtooth', f);
        o.frequency.exponentialRampToValueAtTime(f * 1.35, t + 0.9);
        o.connect(bp); o.start(t); o.stop(t + 1.5);
      }
    } else if (type === 'chaser') {
      const g = this.gain(0, p);
      this.env(g, t, 0.1, 0.9, 1.6);
      g.connect(this.gain(0.5, this.verbIn));
      const o = this.osc('sawtooth', 95);
      o.frequency.exponentialRampToValueAtTime(55, t + 1.6);
      o.connect(this.shaper()).connect(this.filter('lowpass', 900, 1)).connect(g);
      o.start(t); o.stop(t + 1.8);
      this.burst(t, 1.6, true, this.filter('lowpass', 700, 0.8), g);
    } else {
      const g = this.gain(0, p);
      this.env(g, t, 0.02, 0.25, 0.8);
      const o = this.osc('sine', 950);
      o.frequency.exponentialRampToValueAtTime(500, t + 0.8);
      const am = this.gain(0.5, g);
      o.connect(am);
      const lfo = this.osc('square', 11);
      lfo.connect(this.gain(0.5, am.gain));
      o.start(t); lfo.start(t); o.stop(t + 0.9); lfo.stop(t + 0.9);
    }
  }

  // ---------- 猎杀模式：人类的脚步与尖叫 ----------
  humanStep(x, z, vol) {
    if (!this.ctx || vol < 0.02) return;
    const t = this.t, p = this.panner(3, 1.4), g = this.gain(0, p);
    this.setPos(p, x, 0.9, z);
    this.env(g, t, 0.004, 0.42 * vol, 0.1);
    this.burst(t, 0.12, true, this.filter('lowpass', 850, 0.8), g);
    setTimeout(() => p.disconnect(), 220);
  }
  humanScream(x, z) {
    if (!this.ctx) return;
    const t = this.t, p = this.panner(3, 1.2), g = this.gain(0, p);
    this.setPos(p, x, 1.2, z);
    this.env(g, t, 0.02, 0.5, 0.75);
    g.connect(this.gain(0.4, this.verbIn));
    const o = this.osc('sawtooth', 640);
    o.frequency.exponentialRampToValueAtTime(420, t + 0.6);
    o.connect(this.filter('bandpass', 1150, 2)).connect(g);
    o.start(t); o.stop(t + 0.9);
    setTimeout(() => p.disconnect(), 1000);
  }

  // ---------- 各类音效 ----------
  generatorStart(x, z) {
    if (!this.ctx) return;
    const t = this.t, p = this.panner(4, 1);
    const lp = this.filter('lowpass', 500, 0.7);
    lp.connect(p);
    this.setPos(p, x, 1.2, z);
    this.tone(t, 'sawtooth', 24, 70, 0.5, 0.3, 1.7, lp);
    for (let k = 0; k < 4; k++) this.tone(t + k * 0.12, 'triangle', 110, 40, 0.005, 0.18, 0.1, p);
    setTimeout(() => p.disconnect(), 2500);
  }

  electricSpark(x, y, z, vol) {
    if (!this.ctx || vol < 0.01) return;
    const t = this.t, p = this.panner(3, 1.2), g = this.gain(0, p);
    this.setPos(p, x, y, z);
    this.env(g, t, 0.002, 0.3 * vol, 0.09);
    this.burst(t, 0.1, false, this.filter('highpass', 2600, 0.8), g);
    setTimeout(() => p.disconnect(), 300);
  }

  setMachines(vol) {
    if (this.machineG) this.machineG.gain.setTargetAtTime(vol * 0.12, this.t, 0.3);
  }

  stinger() {
    if (!this.ctx) return;
    const t = this.t;
    const lp = this.filter('lowpass', 400, 2);
    lp.frequency.exponentialRampToValueAtTime(2600, t + 0.6);
    const g = this.gain(0, this.sfx);
    g.connect(this.verbIn);
    this.env(g, t, 0.06, 0.12, 2.6);
    lp.connect(g);
    for (const f of [110, 116.5, 164.8, 174.6, 233]) {
      const o = this.osc('sawtooth', f);
      o.connect(lp); o.start(t); o.stop(t + 2.8);
    }
  }
  heartbeat(vol) {
    if (!this.ctx) return;
    const t = this.t;
    this.tone(t, 'sine', 60, 40, 0.012, 0.8 * vol, 0.15, this.sfx);
    this.tone(t + 0.25, 'sine', 52, 36, 0.012, 0.6 * vol, 0.18, this.sfx);
  }
  breath(vol, inhale) {
    if (!this.ctx) return;
    const t = this.t;
    const g = this.gain(0, this.sfx);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.1 * vol, t + (inhale ? 0.3 : 0.12));
    g.gain.linearRampToValueAtTime(0.0001, t + (inhale ? 0.55 : 0.5));
    this.burst(t, 0.6, false, this.filter('bandpass', inhale ? 1500 : 900, 0.8), g);
  }
  whisper(vol = 1) {
    if (!this.ctx) return;
    const t = this.t, dur = 1.2 + Math.random();
    const g = this.gain(0, this.sfx);
    g.connect(this.verbIn);
    const curve = new Float32Array(32);
    for (let i = 0; i < 32; i++) curve[i] = Math.random() * 0.22 * vol * Math.sin((i / 31) * Math.PI);
    g.gain.setValueCurveAtTime(curve, t, dur);
    const pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    const dest = pan || g;
    if (pan) { pan.pan.value = Math.random() * 2 - 1; pan.connect(g); }
    const n = this.noise(false, false);
    for (const [lo, hi, q] of [[450, 900, 9], [1100, 2500, 11]]) {
      const bp = this.filter('bandpass', lo + Math.random() * (hi - lo), q);
      bp.frequency.linearRampToValueAtTime(lo + Math.random() * (hi - lo), t + dur);
      n.connect(bp); bp.connect(dest);
    }
    n.start(t, Math.random() * 2);
    n.stop(t + dur + 0.1);
  }
  distant(kind) {
    if (!this.ctx) return;
    const t = this.t;
    switch (kind) {
      case 'thud': {
        const g = this.gain(0, this.verbIn);
        g.connect(this.gain(0.2, this.sfx));
        this.env(g, t, 0.01, 0.7, 1.2);
        this.burst(t, 1.3, true, this.filter('lowpass', 170, 0.8), g);
        this.tone(t, 'sine', 42, 30, 0.01, 0.25, 0.8, this.verbIn);
        break;
      }
      case 'slam': {
        const g = this.gain(0, this.verbIn);
        this.env(g, t, 0.002, 0.6, 0.3);
        this.burst(t, 0.35, false, this.filter('bandpass', 480, 0.7), g);
        this.tone(t, 'sine', 70, 40, 0.003, 0.4, 0.25, this.verbIn);
        break;
      }
      case 'steps': {
        const n = 4 + Math.floor(Math.random() * 4);
        for (let k = 0; k < n; k++) {
          const tt = t + k * (0.42 + Math.random() * 0.08);
          const g = this.gain(0, this.verbIn);
          this.env(g, tt, 0.005, 0.35, 0.12);
          this.burst(tt, 0.15, true, this.filter('lowpass', 300, 0.8), g);
        }
        break;
      }
      case 'drip': {
        this.tone(t, 'sine', 1700, 480, 0.002, 0.07, 0.07, this.verbIn);
        this.tone(t, 'sine', 1700, 480, 0.002, 0.025, 0.07, this.sfx);
        break;
      }
      case 'clank': {
        const g = this.gain(0, this.verbIn);
        this.env(g, t, 0.002, 0.5, 0.4);
        this.burst(t, 0.45, false, this.filter('bandpass', 1700, 10), g);
        this.tone(t, 'triangle', 520, 0, 0.002, 0.08, 1.2, this.verbIn);
        this.tone(t, 'triangle', 781, 0, 0.002, 0.05, 1.0, this.verbIn);
        break;
      }
      case 'hiss': {
        const g = this.gain(0, this.sfx);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.07, t + 0.4);
        g.gain.linearRampToValueAtTime(0.0001, t + 2.0);
        this.burst(t, 2.1, false, this.filter('highpass', 3200, 0.6), g);
        break;
      }
      case 'groan': {
        // 金属管道受热膨胀发出的低沉呻吟
        const g = this.gain(0, this.verbIn);
        g.connect(this.gain(0.15, this.sfx));
        this.env(g, t, 0.5, 0.35, 2.2);
        const o = this.osc('sawtooth', 55 + Math.random() * 40);
        o.frequency.linearRampToValueAtTime(40 + Math.random() * 90, t + 2.6);
        o.connect(this.filter('bandpass', 300 + Math.random() * 200, 7)).connect(g);
        o.start(t); o.stop(t + 2.9);
        break;
      }
      case 'scream': {
        const g = this.gain(0, this.verbIn);
        this.env(g, t, 0.15, 0.08, 1.3);
        const o = this.osc('sawtooth', 780);
        const vib = this.osc('sine', 7);
        vib.connect(this.gain(25, o.frequency));
        o.connect(this.filter('bandpass', 1200, 2)).connect(this.filter('lowpass', 1500, 0.7)).connect(g);
        o.start(t); vib.start(t); o.stop(t + 1.6); vib.stop(t + 1.6);
        break;
      }
    }
  }
  scream() {
    if (!this.ctx) return;
    const t = this.t;
    const g = this.gain(0, this.master);
    this.env(g, t, 0.01, 0.9, 1.5);
    const sh = this.shaper();
    sh.connect(g);
    for (const f of [300, 452, 610, 893, 1210]) {
      const o = this.osc('sawtooth', f);
      o.frequency.exponentialRampToValueAtTime(f * 1.7, t + 0.35);
      o.frequency.exponentialRampToValueAtTime(f * 1.1, t + 1.4);
      o.connect(this.gain(0.22, sh));
      o.start(t); o.stop(t + 1.6);
    }
    const ng = this.gain(0, this.master);
    this.env(ng, t, 0.005, 0.6, 1.3);
    this.burst(t, 1.4, false, this.filter('highpass', 800, 0.5), ng);
    this.tone(t, 'sine', 70, 28, 0.01, 0.9, 1.0, this.master);
  }
  pickup() {
    if (!this.ctx) return;
    const t = this.t;
    this.tone(t, 'sine', 660, 0, 0.005, 0.14, 0.35, this.sfx);
    this.tone(t + 0.08, 'sine', 990, 0, 0.005, 0.12, 0.45, this.sfx);
    this.tone(t + 0.08, 'sine', 990, 0, 0.005, 0.05, 0.45, this.verbIn);
  }
  drink() {
    if (!this.ctx) return;
    const t = this.t;
    for (let k = 0; k < 3; k++) this.tone(t + k * 0.24, 'sine', 190, 105, 0.01, 0.3, 0.12, this.sfx);
    this.tone(t + 0.8, 'sine', 523, 0, 0.02, 0.06, 0.8, this.verbIn);
  }
  batterySfx() {
    if (!this.ctx) return;
    const t = this.t;
    this.click(0.5);
    this.tone(t + 0.05, 'square', 400, 900, 0.005, 0.04, 0.16, this.sfx);
  }
  // LiDAR 雷达的哔声
  blip(vol = 0.2, f = 1400) {
    if (!this.ctx) return;
    this.tone(this.t, 'sine', f, f, 0.003, vol, 0.09, this.sfx);
  }

  click(vol = 0.3) {
    if (!this.ctx) return;
    const t = this.t;
    const g = this.gain(0, this.sfx);
    this.env(g, t, 0.001, vol, 0.02);
    this.burst(t, 0.03, false, this.filter('highpass', 2200, 0.7), g);
  }
  lightBuzz(vol) {
    if (!this.ctx || vol < 0.02) return;
    const t = this.t;
    const g = this.gain(0, this.sfx);
    this.env(g, t, 0.002, 0.12 * vol, 0.06);
    this.burst(t, 0.08, false, this.filter('bandpass', 3200, 3), g);
    this.tone(t, 'sawtooth', 120, 0, 0.002, 0.05 * vol, 0.07, this.sfx);
  }
  whoosh() {
    if (!this.ctx) return;
    const t = this.t;
    const bp = this.filter('bandpass', 200, 1.5);
    bp.frequency.exponentialRampToValueAtTime(3500, t + 1.0);
    bp.frequency.exponentialRampToValueAtTime(150, t + 2.3);
    const g = this.gain(0, this.sfx);
    g.connect(this.verbIn);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.6, t + 0.9);
    g.gain.linearRampToValueAtTime(0.0001, t + 2.4);
    this.burst(t, 2.5, false, bp, g);
  }
  glitch() {
    if (!this.ctx) return;
    const t = this.t;
    for (let k = 0; k < 6; k++) {
      const tt = t + k * 0.05 + Math.random() * 0.03;
      this.tone(tt, 'square', 80 + Math.random() * 1600, 0, 0.001, 0.05, 0.04, this.sfx);
    }
  }
}
