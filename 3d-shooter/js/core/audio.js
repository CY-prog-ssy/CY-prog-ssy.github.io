/* =========================================================================
   audio.js
   程序化 Web Audio 合成 + ./sound/ 采样文件回退

   ★ 预渲染枪声（2025 最终方案）
     问题：一个 rifle 枪声 = 6 层 × 3 节点 = 18 个 AudioNode。
           人机交战时玩家 + 几十个敌人同帧开火，瞬间打满移动端
           32~64 个节点的硬上限，新节点建了也不出声 —— 就是"突然没声音"。
     解法：init() 之后用 OfflineAudioContext 把 4 种枪声各渲染成
           一段单声道 AudioBuffer。播放时只建 1 个 bufferSource，
           节点占用从 18 降到 3。1000 发/秒也不会耗尽。

   ★ 其他优化：
     - 主链 WaveShaper 软限幅器（tanh）—— 不再削波爆音
     - latencyHint: 'interactive'
     - 敌人枪声限流 + 距离优先（不让远处的枪把近处的挤掉）
     - autodisconnect —— 播完自动断开，避免节点泄漏
     - visibilitychange 主动 resume —— 切后台回来不会静音
   ========================================================================= */
"use strict";

const SFX = (function(){
  let ctx = null, master = null, noiseBuf = null, ready = false, ambNodes = [];
  let verbSend = null;

  /* ---- 预渲染的枪声 buffer ---- */
  const GUN_BUF = { rifle: null, shotgun: null, sniper: null, pistol: null };
  let prerenderStarted = false;

  /* ---- 敌人枪声限流 ---- */
  const ENEMY_GUN = {
    maxVoices: 8,           // 同时活跃的敌人枪声上限
    minGap: 0.008,          // 敌人枪声之间最小间隔
    voices: [],
    lastAt: 0,
    lastPlayerAt: 0,
    playerWindow: 0.12,     // 玩家开火后的清场窗口
  };

  /* -------------------------------------------------------------------
     init
     ------------------------------------------------------------------- */
  function init(){
    if (ctx){
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    ctx = new AC({ latencyHint: 'interactive' });

    /* 软限幅器 —— tanh 曲线 */
    const limiter = ctx.createWaveShaper();
    const N = 2048;
    const curve = new Float32Array(N);
    for (let i = 0; i < N; i++){
      const x = (i / (N - 1)) * 2 - 1;
      curve[i] = Math.tanh(x);
    }
    limiter.curve = curve;
    limiter.oversample = '2x';

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value      = 20;
    comp.ratio.value     = 8;
    comp.attack.value    = 0.003;
    comp.release.value   = 0.22;

    master = ctx.createGain();
    master.gain.value = 1.0;
    master.connect(comp);
    comp.connect(limiter);
    limiter.connect(ctx.destination);

    /* 噪声缓冲区 4s */
    const len = ctx.sampleRate * 4;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    /* 场地混响 */
    if (ctx.createConvolver){
      const sr = ctx.sampleRate, ir = ctx.createBuffer(2, (sr * 1.6) | 0, sr);
      const echoes = [0.021, 0.037, 0.058, 0.081, 0.112, 0.147, 0.191, 0.244];
      for (let ch = 0; ch < 2; ch++){
        const b = ir.getChannelData(ch);
        for (let i = 0; i < b.length; i++){
          const t = i / sr;
          b[i] = (Math.random() * 2 - 1) * Math.pow(1 - t / 1.6, 3.2) * 0.34;
        }
        echoes.forEach((e, k) => {
          const i = ((e + (ch ? 0.004 : 0)) * sr) | 0;
          const a = 0.62 * Math.pow(0.72, k);
          for (let j = 0; j < 220; j++)
            if (i + j < b.length) b[i + j] += (Math.random() * 2 - 1) * a * (1 - j / 220);
        });
      }
      const conv = ctx.createConvolver(); conv.buffer = ir;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';  lp.frequency.value = 4200;
      const wet = ctx.createGain(); wet.gain.value = 0.60;
      verbSend = ctx.createGain(); verbSend.gain.value = 1.0;
      verbSend.connect(hp); hp.connect(lp); lp.connect(conv); conv.connect(wet); wet.connect(master);
    }

    ready = true;
    startAmbient();
    loadSamples();

    /* 异步预渲染 4 种枪声，不阻塞初始化 */
    if (!prerenderStarted){
      prerenderStarted = true;
      prerenderGunshots().catch(() => {});
    }
  }

  const T = () => ctx.currentTime;

  function panner(pan){
    if (!ctx.createStereoPanner) return null;
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    return p;
  }

  function chain(nodes, pan, out, verb){
    let prev = null;
    for (const n of nodes){ if (prev) prev.connect(n); prev = n; }
    const p = pan ? panner(pan) : null;
    if (p){ prev.connect(p); prev = p; }
    prev.connect(out || master);
    if (verb && verbSend && !out){
      const s = ctx.createGain(); s.gain.value = verb;
      prev.connect(s); s.connect(verbSend);
    }
    return function cleanup(){
      for (const n of nodes){ try { n.disconnect(); } catch(e){} }
      if (p) try { p.disconnect(); } catch(e){}
    };
  }

  /* ==========================================================================
     参数化合成内核 —— 在线和离线共用

     mkNoise / mkTone 由调用方提供：
       在线版直接用模块级的 noise / tone
       离线版用临时上下文里的同名函数
     ========================================================================== */

  function synthGunshot(kind, vol, delay, noiseFn, toneFn){
    if (kind === 'rifle'){
      noiseFn({ type: 'highpass', freq: 4200, gain: .62 * vol, dur: .022, atk: .0004, delay });
      noiseFn({ freq: 2100, q: .7, gain: .90 * vol, dur: .14, atk: .001, sweep: 600, delay, verb: .55 });
      noiseFn({ type: 'lowpass', freq: 420, gain: .66 * vol, dur: .11, atk: .001, delay, verb: .35 });
      toneFn({ type: 'triangle', f0: 210, f1: 48, dur: .10, gain: .42 * vol, delay });
      toneFn({ type: 'sine', f0: 82, f1: 38, dur: .14, gain: .34 * vol, lp: 200, delay });
      noiseFn({ type: 'highpass', freq: 1400, gain: .10 * vol, dur: .42, atk: .02, delay: delay + .02 });
    } else if (kind === 'shotgun'){
      noiseFn({ type: 'highpass', freq: 3600, gain: .50 * vol, dur: .026, atk: .0004, delay });
      noiseFn({ type: 'lowpass', freq: 900, gain: 1.05 * vol, dur: .42, atk: .001, sweep: 170, delay, verb: .75 });
      noiseFn({ freq: 1500, q: .6, gain: .60 * vol, dur: .12, atk: .001, delay });
      toneFn({ type: 'sine', f0: 110, f1: 30, dur: .32, gain: .72 * vol, delay });
      toneFn({ type: 'sine', f0: 62, f1: 28, dur: .20, gain: .40 * vol, lp: 150, delay });
      noiseFn({ type: 'highpass', freq: 900, gain: .16 * vol, dur: .70, atk: .03, delay: delay + .02 });
    } else if (kind === 'sniper'){
      noiseFn({ type: 'highpass', freq: 5200, gain: .85 * vol, dur: .014, atk: .0002, delay });
      noiseFn({ type: 'highpass', freq: 3200, gain: 1.0 * vol, dur: .05, atk: .0005, delay });
      noiseFn({ freq: 1250, q: .5, gain: 1.05 * vol, dur: .30, atk: .0008, sweep: 340, delay, verb: 1.0 });
      noiseFn({ type: 'lowpass', freq: 260, gain: .95 * vol, dur: .24, atk: .001, delay, verb: .6 });
      toneFn({ type: 'triangle', f0: 150, f1: 34, dur: .28, gain: .62 * vol, delay });
      toneFn({ type: 'sine', f0: 58, f1: 26, dur: .30, gain: .44 * vol, lp: 150, delay });
      noiseFn({ type: 'bandpass', freq: 900, q: .8, gain: .30 * vol, dur: 1.25, atk: .05, delay: delay + .05 });
      noiseFn({ type: 'highpass', freq: 2200, gain: .14 * vol, dur: .85, atk: .03, delay: delay + .02 });
    } else { /* pistol */
      noiseFn({ type: 'highpass', freq: 4600, gain: .42 * vol, dur: .016, atk: .0003, delay });
      noiseFn({ freq: 1700, q: 1.1, gain: .70 * vol, dur: .11, atk: .001, sweep: 520, delay, verb: .45 });
      noiseFn({ type: 'lowpass', freq: 340, gain: .40 * vol, dur: .075, atk: .001, delay });
      toneFn({ type: 'square', f0: 280, f1: 70, dur: .06, gain: .24 * vol, lp: 1600, delay });
      toneFn({ type: 'sine', f0: 96, f1: 44, dur: .10, gain: .20 * vol, lp: 220, delay });
      noiseFn({ type: 'highpass', freq: 1800, gain: .07 * vol, dur: .28, atk: .02, delay: delay + .02 });
    }
  }

  /* ==========================================================================
     在线 noise / tone —— 用实时 ctx
     ========================================================================== */
  function noise(o){
    if (!ready) return;
    const t0 = T() + (o.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.playbackRate.value = o.rate || 1;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.value = o.freq || 1000;
    f.Q.value = o.q || 1;
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.sweep), t0 + (o.dur || .15));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(.0002, o.gain || .4), t0 + (o.atk || 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (o.dur || .15));
    const cleanup = chain([src, f, g], o.pan, o.out, o.verb);
    const dur = o.dur || .15;
    src.start(t0, Math.random() * 3);
    src.stop(t0 + dur + 0.02);
    src.onended = cleanup;
  }

  function tone(o){
    if (!ready) return;
    const t0 = T() + (o.delay || 0);
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0 || 200, t0);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + (o.dur || .2));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(.0002, o.gain || .2), t0 + (o.atk || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (o.dur || .2));
    const nodes = [osc, g];
    if (o.lp){
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = o.lp;
      nodes.splice(1, 0, f);
    }
    const cleanup = chain(nodes, o.pan, o.out, o.verb);
    const dur = o.dur || .2;
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    osc.onended = cleanup;
  }

  /* ==========================================================================
     OfflineAudioContext 预渲染
     ========================================================================== */
  function mkOfflineSynth(off, offNoiseBuf){
    const offVerb = null;
    function offNoise(o){
      const t0 = o.delay || 0;
      const src = off.createBufferSource();
      src.buffer = offNoiseBuf;
      src.loop = true;
      src.playbackRate.value = o.rate || 1;
      const f = off.createBiquadFilter();
      f.type = o.type || 'bandpass';
      f.frequency.value = o.freq || 1000;
      f.Q.value = o.q || 1;
      if (o.sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.sweep), t0 + (o.dur || .15));
      const g = off.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(.0002, o.gain || .4), t0 + (o.atk || 0.002));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + (o.dur || .15));
      src.connect(f); f.connect(g); g.connect(off.destination);
      src.start(t0, Math.random() * 3);
      src.stop(t0 + (o.dur || .15) + 0.02);
    }
    function offTone(o){
      const t0 = o.delay || 0;
      const osc = off.createOscillator();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.f0 || 200, t0);
      if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + (o.dur || .2));
      const g = off.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(.0002, o.gain || .2), t0 + (o.atk || 0.004));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + (o.dur || .2));
      const nodes = [osc, g];
      if (o.lp){
        const f = off.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = o.lp;
        nodes.splice(1, 0, f);
      }
      let prev = null;
      for (const n of nodes){ if (prev) prev.connect(n); prev = n; }
      prev.connect(off.destination);
      osc.start(t0);
      osc.stop(t0 + (o.dur || .2) + 0.02);
    }
    return { noise: offNoise, tone: offTone };
  }

  async function renderGunshot(kind){
    const dur = kind === 'shotgun' ? 1.2 : kind === 'sniper' ? 2.6 : 0.9;
    const sr = ctx.sampleRate;
    const off = new OfflineAudioContext(1, Math.ceil(sr * dur), sr);
    /* 离线版也需要一条噪声源 */
    const offNB = off.createBuffer(1, sr * 4, sr);
    const nd = offNB.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const synth = mkOfflineSynth(off, offNB);
    synthGunshot(kind, 1.0, 0, synth.noise, synth.tone);
    return await off.startRendering();
  }

  async function prerenderGunshots(){
    const kinds = ['rifle', 'shotgun', 'sniper', 'pistol'];
    for (const kind of kinds){
      try {
        GUN_BUF[kind] = await renderGunshot(kind);
      } catch (e){
        GUN_BUF[kind] = null;
      }
    }
  }

  /* ==========================================================================
     枪声播放
     ========================================================================== */
  function gunshot(kind, pan, dist){
    if (!ready) return;

    /* 上下文被浏览器自动挂起时先恢复，否则这一发就彻底丢了 */
    if (ctx.state !== 'running'){
      try { ctx.resume(); } catch(e){}
      return;
    }

    const isPlayer = (pan === 0 && (dist === 0 || dist === undefined || dist === null));

    /* ---- 玩家枪声：永远优先 ---- */
    if (isPlayer){
      ENEMY_GUN.lastPlayerAt = T();
      ENEMY_GUN.lastAt = T();
      playGunBuffer(kind, 1.0, 0, false);
      return;
    }

    /* ---- 敌人枪声：限流 ---- */
    const now = T();
    if (now - ENEMY_GUN.lastPlayerAt < ENEMY_GUN.playerWindow) return;
    if (now - ENEMY_GUN.lastAt < ENEMY_GUN.minGap) return;

    ENEMY_GUN.voices = ENEMY_GUN.voices.filter(v => now - v.at < 0.5);
    if (ENEMY_GUN.voices.length >= ENEMY_GUN.maxVoices){
      const oldest = ENEMY_GUN.voices[0];
      if (oldest && oldest.dist <= (dist || 0)) return;
      ENEMY_GUN.voices.shift();
    }
    ENEMY_GUN.lastAt = now;
    ENEMY_GUN.voices.push({ at: now, dist: dist || 0 });

    const far = clamp(1 - (dist || 0) / 60, 0.10, 1);
    playGunBuffer(kind, far * far, pan, true);
  }

  /** 播放一发枪声。每发只占 1 个 bufferSource + 1 个 gain（+ 1 个 panner）。
      节点数从 18 降到最多 3，永不会打满移动端的节点上限。 */
  function playGunBuffer(kind, vol, pan, isEnemy){
    const buf = GUN_BUF[kind];
    if (!buf){
      /* 预渲染还没完成 —— 用在线合成兜底 */
      if (isEnemy){
        const synth = { rifle: 'rifle', shotgun: 'shotgun', sniper: 'sniper', pistol: 'pistol' }[kind] || 'rifle';
        const far = clamp(vol, 0.05, 1);
        synthGunshot(synth, far, 0, noise, tone);
      } else {
        synthGunshot(kind, 1.0, 0, noise, tone);
      }
      return;
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    /* 敌人枪声音量随距离衰减；播放速率轻微随机化，避免同款枪听感克隆 */
    src.playbackRate.value = 0.97 + Math.random() * 0.06;

    const g = ctx.createGain();
    g.gain.value = clamp(vol, 0, 1);

    const p = panner(pan);
    src.connect(g);
    if (p){ g.connect(p); p.connect(master); }
    else g.connect(master);

    src.start();
    src.onended = () => {
      try { src.disconnect(); } catch(e){}
      try { g.disconnect(); } catch(e){}
      if (p) try { p.disconnect(); } catch(e){}
    };
  }

  /* ==========================================================================
     环境底噪
     ========================================================================== */
  function startAmbient(){
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 170; lp.Q.value = .6;
    const g = ctx.createGain(); g.gain.value = 0.055;
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start();
    ambNodes.push(src);

    [46, 69, 103].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = 0.016 / (i + 1);
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.04 + i * 0.031;
      const lg = ctx.createGain(); lg.gain.value = 0.009 / (i + 1);
      lfo.connect(lg); lg.connect(og.gain);
      o.connect(og); og.connect(master);
      o.start(); lfo.start();
      ambNodes.push(o, lfo);
    });

    (function creak(){
      if (!ready) return;
      tone({ type: 'sawtooth', f0: rand(90, 220), f1: rand(60, 130),
             dur: rand(.7, 1.6), gain: 0.012, lp: 700, pan: rand(-.9, .9) });
      setTimeout(creak, rand(6000, 15000));
    })();
  }

  /* ==========================================================================
     其他音效
     ========================================================================== */
  function radio(){
    noise({ type: 'bandpass', freq: 2600, q: 3.2, gain: .055, dur: .045, atk: .001 });
    tone({ type: 'square', f0: 1180, f1: 1180, dur: .028, gain: .028, lp: 3000, delay: .03 });
    noise({ type: 'bandpass', freq: 1800, q: 2.0, gain: .030, dur: .09, atk: .004, delay: .055 });
  }

  function dryFire(){
    tone({ type: 'square', f0: 1500, f1: 700, dur: .035, gain: .10, lp: 4000 });
    noise({ type: 'highpass', freq: 3000, gain: .10, dur: .04 });
  }

  function magOut(){
    noise({ type: 'bandpass', freq: 2300, q: 2, gain: .20, dur: .07 });
    tone({ type: 'square', f0: 520, f1: 300, dur: .05, gain: .07, lp: 2500 });
  }
  function magIn(){
    noise({ type: 'lowpass', freq: 1300, gain: .30, dur: .09, atk: .001 });
    tone({ type: 'square', f0: 240, f1: 120, dur: .07, gain: .10, lp: 1800 });
  }
  function boltClick(){
    noise({ type: 'highpass', freq: 3200, gain: .24, dur: .05, atk: .001 });
    tone({ type: 'square', f0: 1100, f1: 600, dur: .04, gain: .08, lp: 5000 });
  }
  function pumpSound(back){
    noise({ type: 'bandpass', freq: back ? 1500 : 2600, q: 2.2, gain: .30, dur: .09, atk: .001 });
    tone({ type: 'square', f0: back ? 380 : 820, f1: back ? 200 : 420, dur: .06, gain: .09, lp: 3000 });
  }
  function boltCycle(phase){
    if (phase === 0){
      noise({ type: 'bandpass', freq: 2900, q: 3.0, gain: .26, dur: .05, atk: .001 });
      noise({ type: 'bandpass', freq: 1250, q: 1.6, gain: .30, dur: .16, atk: .004, sweep: -420, delay: .05 });
      tone({ type: 'square', f0: 520, f1: 250, dur: .10, gain: .07, lp: 2600, delay: .04 });
    } else {
      noise({ type: 'bandpass', freq: 1500, q: 1.8, gain: .26, dur: .11, atk: .003, sweep: 600 });
      noise({ type: 'highpass', freq: 3400, gain: .30, dur: .05, atk: .0008, delay: .09 });
      tone({ type: 'square', f0: 900, f1: 420, dur: .05, gain: .09, lp: 4200, delay: .09 });
    }
  }

  function shellDrop(pan){
    noise({ type: 'bandpass', freq: rand(3000, 5200), q: 6, gain: .10, dur: .09, pan });
    tone({ type: 'triangle', f0: rand(1500, 2600), f1: rand(700, 1200), dur: .10, gain: .045, pan });
  }

  function footstep(vol, pan){
    noise({ type: 'lowpass', freq: rand(380, 620), gain: .16 * vol, dur: .075, atk: .002, rate: rand(.85, 1.15), pan });
    noise({ type: 'highpass', freq: rand(2400, 4200), gain: .045 * vol, dur: .035, pan });
  }
  function jumpSound(){
    noise({ type: 'lowpass', freq: 500, gain: .10, dur: .09 });
  }
  function landSound(f){
    noise({ type: 'lowpass', freq: 300, gain: .10 + .28 * f, dur: .16, atk: .002 });
    tone({ type: 'sine', f0: 110, f1: 44, dur: .13, gain: .14 * f });
  }

  function impactWall(pan, dist){
    const v = clamp(1 - dist / 60, .15, 1);
    noise({ type: 'bandpass', freq: rand(2200, 3800), q: 2.5, gain: .26 * v, dur: .07, atk: .001, pan });
    noise({ type: 'lowpass', freq: 700, gain: .14 * v, dur: .09, pan });
    if (Math.random() < 0.28)
      tone({ type: 'sine', f0: rand(2400, 3400), f1: rand(700, 1100), dur: .30, gain: .05 * v, pan });
  }

  function impactFlesh(pan, dist){
    const v = clamp(1 - dist / 60, .2, 1);
    noise({ type: 'lowpass', freq: rand(250, 420), gain: .42 * v, dur: .13, atk: .001, pan });
    tone({ type: 'sine', f0: 160, f1: 60, dur: .10, gain: .16 * v, pan });
  }

  function hitBeep(head){
    tone({ type: 'sine', f0: head ? 1900 : 1350, dur: .045, gain: .13 });
    if (head) tone({ type: 'sine', f0: 2550, dur: .05, gain: .11, delay: .045 });
  }

  function killChime(streak){
    const n = clamp(streak | 0 || 1, 1, 5);
    if (sample('kill' + n, 0.80)) return;
    tone({ type: 'sine', f0: 900, dur: .07, gain: .11 });
    tone({ type: 'sine', f0: 1350, dur: .11, gain: .11, delay: .06 });
  }

  function enemyDeath(pan, dist){
    const v = clamp(1 - dist / 50, .15, 1);
    tone({ type: 'sawtooth', f0: rand(240, 330), f1: rand(60, 95), dur: .55, gain: .13 * v, lp: 1100, pan });
    noise({ type: 'lowpass', freq: 500, gain: .22 * v, dur: .35, atk: .03, pan, delay: .18 });
  }

  function bossDown(){
    if (!ready) return;
    tone({ type: 'sawtooth', f0: 150, f1: 34, dur: 1.5, gain: 0.30, lp: 420 });
    tone({ type: 'sine',     f0: 78,  f1: 24, dur: 1.9, gain: 0.34, lp: 150 });
    noise({ type: 'lowpass', freq: 340, gain: 0.24, dur: 1.5, atk: 0.02, sweep: 80, verb: 0.7 });
    [392, 523, 659].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: .30, gain: 0.13, delay: 0.30 + i * 0.11, lp: 3000 }));
  }

  function heartbeat(){
    tone({ type: 'sine', f0: 62, f1: 34, dur: .16, gain: .42, lp: 180 });
    tone({ type: 'sine', f0: 52, f1: 30, dur: .20, gain: .30, lp: 180, delay: .20 });
  }

  function shieldHit(pan){
    if (sample('armor', 0.62, pan)) return;
    noise({ type: 'bandpass', freq: 1750, q: 1.6, gain: .22, dur: .10, atk: .001 });
    tone({ type: 'square', f0: 430, f1: 250, dur: .09, gain: .09, lp: 2400 });
  }
  function shieldBreak(pan){
    if (!sample('armor', 0.85, pan, 0.72))
      noise({ type: 'highpass', freq: 2500, gain: .26, dur: .24, atk: .001 });
    tone({ type: 'sawtooth', f0: 320, f1: 64, dur: .32, gain: .12, lp: 1500 });
  }

  function damageTaken(pan){
    if (sample('hurt', 0.95, pan)) return;
    noise({ type: 'lowpass', freq: 220, gain: .30, dur: .20, atk: .002 });
    tone({ type: 'sine', f0: 150, f1: 52, dur: .22, gain: .20 });
  }

  function healStart(){
    tone({ type: 'sine', f0: 520, f1: 780, dur: .18, gain: .09 });
    noise({ type: 'lowpass', freq: 900, gain: .13, dur: .22, atk: .02 });
  }
  function healDone(){
    tone({ type: 'sine', f0: 880, dur: .09, gain: .10 });
    tone({ type: 'sine', f0: 1320, dur: .13, gain: .09, delay: .07 });
  }

  function dronePulse(){
    tone({ type: 'sine', f0: 660, f1: 990, dur: .20, gain: .075 });
    tone({ type: 'sine', f0: 1320, dur: .16, gain: .05, delay: .09 });
    noise({ type: 'bandpass', freq: 2600, q: 2.5, gain: .03, dur: .10 });
  }

  /* ★ 闪光弹音效：震撼爆炸 + 3秒尖锐耳鸣 */
  function flashBang(dist){
    if (!ready) return;
    const vol = clamp(1 - (dist || 0) / 30, 0, 1);
    if (vol <= 0.01) return;

    // 巨大的爆炸声
    noise({ type: 'lowpass', freq: 600, gain: 1.2 * vol, dur: 0.4, atk: 0.001, sweep: 80, verb: 0.9 });
    tone({ type: 'sine', f0: 100, f1: 30, dur: 0.3, gain: 0.8 * vol, lp: 150 });

    // 3秒的尖锐耳鸣声（3个频率叠加，模拟真实耳鸣）
    tone({ type: 'sine', f0: 4200, dur: 3.0, gain: 0.18 * vol, lp: 8000 });
    tone({ type: 'sine', f0: 4800, dur: 3.0, gain: 0.12 * vol, lp: 8000, delay: 0.03 });
    tone({ type: 'sine', f0: 3600, dur: 3.0, gain: 0.08 * vol, lp: 8000, delay: 0.05 });
  }

  /* ==========================================================================
     采样文件
     ========================================================================== */
  const SAMP = {
    kill1: 'kill1.wav', kill2: 'kill2.wav', kill3: 'kill3.wav',
    kill4: 'kill4.wav', kill5: 'kill5.wav',
    hurt:  'hurt.wav',  armor:  'armor.wav'
  };
  const sampBuf = Object.create(null);
  const sampEl  = Object.create(null);
  let sampMode = 'idle';
  let sampIdx  = 0;
  const sampURL = n => 'sound/' + SAMP[n];

  function buildSampleElements(){
    for (const n in SAMP)
      sampEl[n] = [0, 1, 2].map(() => { const a = new Audio(sampURL(n)); a.preload = 'auto'; return a; });
  }

  function loadSamples(){
    if (sampMode !== 'idle' || !ctx) return;
    if (location.protocol === 'file:'){ sampMode = 'el'; buildSampleElements(); return; }
    const decode = ab => new Promise((res, rej) => {
      const p = ctx.decodeAudioData(ab, res, rej);
      if (p && p.then) p.then(res, rej);
    });
    Promise.all(Object.keys(SAMP).map(n =>
      fetch(sampURL(n))
        .then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status)))
        .then(decode)
        .then(b => { sampBuf[n] = b; })
        .catch(() => {})
    )).then(() => {
      sampMode = Object.keys(sampBuf).length ? 'buf' : 'el';
      if (sampMode === 'el') buildSampleElements();
    });
  }

  function sample(name, vol, pan, rate){
    if (sampMode === 'idle') return false;
    if (sampMode === 'buf' && sampBuf[name]){
      if (!ready) return false;
      const src = ctx.createBufferSource();
      src.buffer = sampBuf[name];
      src.playbackRate.value = rate || 1;
      const g = ctx.createGain(); g.gain.value = vol == null ? 1 : vol;
      const p = pan ? panner(pan) : null;
      src.connect(g); g.connect(p || master);
      src.start();
      src.onended = () => {
        try { src.disconnect(); } catch(e){}
        try { g.disconnect(); } catch(e){}
        if (p) try { p.disconnect(); } catch(e){}
      };
      return true;
    }
    const pool = sampEl[name];
    if (pool){
      const a = pool[sampIdx++ % pool.length];
      try {
        a.currentTime = 0;
        a.volume = clamp((vol == null ? 1 : vol) * 0.9, 0, 1);
        a.playbackRate = clamp(rate || 1, 0.25, 4);
        const pr = a.play();
        if (pr && pr.catch) pr.catch(() => {});
        return true;
      } catch (err){}
    }
    return false;
  }

  function alarm(win){
    if (win) [660, 880, 1320].forEach((f, i) => tone({ type: 'square', f0: f, dur: .24, gain: .10, lp: 3000, delay: i * .13 }));
    else     [420, 330, 220].forEach((f, i) => tone({ type: 'sawtooth', f0: f, f1: f * .6, dur: .5, gain: .11, lp: 1200, delay: i * .22 }));
  }

  let rainGain = null;
  function startRainBed(){
    if (!ready || rainGain) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 850;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';  lp.frequency.value = 7200; lp.Q.value = 0.4;
    const g  = ctx.createGain(); g.gain.value = 0.0001;
    src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(master);
    src.start();
    rainGain = g;
    ambNodes.push(src);
  }
  function setRain(level){
    if (!ready) return false;
    if (!rainGain) startRainBed();
    if (!rainGain) return false;
    rainGain.gain.setTargetAtTime(Math.max(0.0001, level * 0.085), T(), 0.4);
    return true;
  }
  function thunder(){
    if (!ready) return;
    const vol = rand(0.5, 1.0);
    noise({ type: 'lowpass', freq: 260, gain: 0.30 * vol, dur: 1.9, atk: 0.02, sweep: 70, verb: 0.8 });
    noise({ type: 'lowpass', freq: 900, gain: 0.16 * vol, dur: 0.30, atk: 0.004, sweep: 200 });
    tone({ type: 'sine', f0: 52, f1: 26, dur: 2.2, gain: 0.26 * vol, lp: 120 });
  }

  function suspend(){ if (ctx && ctx.state === 'running')   ctx.suspend(); }
  function resume(){  if (ctx && ctx.state === 'suspended') ctx.resume();  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ctx && ctx.state === 'suspended') ctx.resume();
  });
  window.addEventListener('focus', () => {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  });

  return {
    init, gunshot, radio, dryFire, magOut, magIn, boltClick, pumpSound, boltCycle,
    shellDrop, footstep, jumpSound, landSound, impactWall, impactFlesh,
    hitBeep, killChime, enemyDeath, heartbeat, damageTaken,
    shieldHit, shieldBreak, healStart, healDone, dronePulse,
    alarm, suspend, resume, setRain, thunder, bossDown,
    flashBang /* ★ 新增：闪光弹音效 */
  };
})();