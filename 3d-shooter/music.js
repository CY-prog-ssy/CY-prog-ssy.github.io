(function () {
  'use strict';

  // 防止重复初始化
  if (document.getElementById('music-plugin-init')) return;
  const initFlag = document.createElement('div');
  initFlag.id = 'music-plugin-init';
  initFlag.style.display = 'none';
  document.body.appendChild(initFlag);

  // ==========================================
  // 1. 注入音乐专属样式
  // ==========================================
  const style = document.createElement('style');
  style.id = 'music-plugin-styles';
  style.textContent = `
    #musicUI {
      position: fixed; inset: 0; z-index: 2147483647;
      display: none; overflow: hidden; background: #08080c;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif;
      color: #fff; -webkit-font-smoothing: antialiased; user-select: none;
    }
    #musicUI.show { display: block; }
    #musicUI * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; margin: 0; padding: 0; letter-spacing: -0.1px; }
    #musicUI #bgCanvas { position: absolute; inset: 0; z-index: 0; width: 100%; height: 100%; pointer-events: none; }
    #musicUI .vignette { position: absolute; inset: 0; z-index: 1; pointer-events: none; background: radial-gradient(120% 90% at 50% 40%, transparent 30%, rgba(0, 0, 0, 0.55) 100%); }
    #musicUI .side-viz { position: absolute; top: 50%; transform: translateY(-50%); width: 26px; height: 62vh; z-index: 5; pointer-events: none; opacity: 0.72; }
    #musicUI .side-viz-left { left: 0; }
    #musicUI .side-viz-right { right: 0; }
    #musicUI .side-viz canvas { width: 100%; height: 100%; display: block; }
    
    #musicUI .app { position: relative; z-index: 10; width: 100%; max-width: 900px; margin: 0 auto; height: 100%; display: flex; flex-direction: column; transition: padding-bottom 0.4s; }
    #musicUI .app.with-player { padding-bottom: 130px; }
    #musicUI .top-bar { flex-shrink: 0; padding: 22px 20px 4px; text-align: center; }
    #musicUI .app-title { font-size: 24px; font-weight: 800; letter-spacing: 1px; background: linear-gradient(135deg, #7dd3fc, #c4b5fd, #f0abfc); -webkit-background-clip: text; background-clip: text; color: transparent; }
    #musicUI .app-sub { font-size: 12px; color: rgba(255, 255, 255, 0.42); margin-top: 4px; }
    
    /* 把原本的按钮改成了带输入框的组合 */
    #musicUI .search-entry { 
      flex-shrink: 0; display: flex; align-items: center; gap: 9px; 
      height: 44px; margin: 12px 18px 6px; padding: 0 14px; 
      border-radius: 999px; background: rgba(255, 255, 255, 0.08); 
      box-shadow: inset 1px 1px 1px -0.5px rgba(255, 255, 255, 0.5), inset 0 0 0 0.5px rgba(255, 255, 255, 0.16); 
    }
    #musicUI .se-icon { opacity: 0.65; flex-shrink: 0; }
    #musicUI .search-input { flex: 1; border: none; background: transparent; color: #fff; font-size: 14px; outline: none; font-family: inherit; }
    #musicUI .search-input::placeholder { color: rgba(255,255,255,0.4); }
    #musicUI .sp-search-btn { width: 28px; height: 28px; border-radius: 50%; border: none; background: linear-gradient(135deg, #0ea5e9, #6366f1); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
    
    #musicUI .song-list { flex: 1; overflow-y: auto; padding: 10px 14px 20px; scrollbar-width: none; }
    #musicUI .song-list::-webkit-scrollbar { display: none; }
    #musicUI .song-item { display: flex; align-items: center; gap: 12px; padding: 12px 14px; margin-bottom: 8px; border-radius: 20px; cursor: pointer; background: rgba(255, 255, 255, 0.05); box-shadow: inset 1px 1px 1px -0.5px rgba(255, 255, 255, 0.3), 0 4px 12px rgba(0, 0, 0, 0.2); transition: transform 0.2s; }
    #musicUI .song-item:active { transform: scale(0.98); }
    #musicUI .song-item.playing { box-shadow: 0 0 16px rgba(14, 165, 233, 0.4), inset 0 0 0 1px rgba(14, 165, 233, 0.6); }
    #musicUI .song-index { width: 28px; height: 28px; border-radius: 50%; background: rgba(255, 255, 255, 0.1); display: flex; align-items: center; justify-content: center; font-size: 12px; }
    #musicUI .song-info { flex: 1; min-width: 0; }
    #musicUI .song-name { font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #musicUI .song-artist { font-size: 12px; color: rgba(255, 255, 255, 0.55); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    
    #musicUI .empty { text-align: center; padding: 60px 20px; color: rgba(255, 255, 255, 0.5); font-size: 14px; }
    #musicUI .loader { width: 28px; height: 28px; margin: 0 auto 14px; border: 2.5px solid rgba(255, 255, 255, 0.15); border-top-color: #0ea5e9; border-radius: 50%; animation: spin 0.7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    
    /* 迷你播放器 */
    #musicUI .player-bar { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); width: calc(100% - 24px); max-width: 876px; z-index: 50; padding: 14px 16px; border-radius: 26px; background: rgba(255, 255, 255, 0.08); box-shadow: inset 1px 1px 1px -0.5px rgba(255, 255, 255, 0.6), inset 0 0 0 0.5px rgba(255, 255, 255, 0.2); transition: transform 0.4s; display: flex; flex-direction: column; gap: 10px; }
    #musicUI .player-bar.hidden { transform: translate(-50%, calc(100% + 40px)); pointer-events: none; }
    #musicUI .player-row { display: flex; align-items: center; gap: 12px; cursor: pointer; }
    #musicUI .disc { width: 46px; height: 46px; border-radius: 50%; background: radial-gradient(circle at 50% 50%, #1a1a2e 30%, #0d0d18 70%); box-shadow: inset 0 0 12px rgba(0, 0, 0, 0.8); position: relative; overflow: hidden; }
    #musicUI .disc::after { content: ""; position: absolute; inset: 35%; border-radius: 50%; background: linear-gradient(135deg, #0ea5e9, #6366f1); }
    #musicUI .disc.spinning { animation: spin 3s linear infinite; }
    #musicUI .player-info { flex: 1; min-width: 0; }
    #musicUI .player-title { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #musicUI .player-artist { font-size: 11px; color: rgba(255, 255, 255, 0.62); }
    #musicUI .player-controls { display: flex; align-items: center; gap: 8px; }
    #musicUI .ctrl-btn { width: 40px; height: 40px; border-radius: 50%; border: none; background: rgba(255, 255, 255, 0.14); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; }
    #musicUI .ctrl-btn.play-btn { width: 44px; height: 44px; background: linear-gradient(135deg, #0ea5e9, #6366f1); }
    #musicUI .ctrl-btn svg { width: 20px; height: 20px; fill: currentColor; }
    #musicUI .progress-row { display: flex; align-items: center; gap: 8px; }
    #musicUI .time { font-size: 10px; color: rgba(255, 255, 255, 0.72); width: 34px; text-align: center; }
    #musicUI .progress-track { flex: 1; height: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.24); position: relative; cursor: pointer; }
    #musicUI .progress-fill { height: 100%; border-radius: 2px; background: linear-gradient(90deg, #0ea5e9, #6366f1, #c4b5fd); width: 0%; position: relative; }
    
    /* 全屏播放器 (锁定圆形) */
    #musicUI .full-player { position: absolute; inset: 0; z-index: 500; background: rgba(6, 6, 14, 0.98); display: flex; flex-direction: column; padding: 16px 24px; transform: translateY(100%); transition: transform 0.45s; overflow: hidden; }
    #musicUI .full-player.show { transform: translateY(0); }
    #musicUI .fp-header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 20px; z-index: 3; margin-top: env(safe-area-inset-top, 10px); }
    #musicUI .fp-btn { width: 40px; height: 40px; border-radius: 50%; border: none; background: rgba(255, 255, 255, 0.1); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; }
    #musicUI .fp-header-text { text-align: center; }
    #musicUI .fp-header-title { font-size: 13px; color: rgba(255, 255, 255, 0.85); font-weight: 600; }
    #musicUI .fp-disc-wrap { flex: 1; position: relative; display: flex; align-items: center; justify-content: center; min-height: 0; }
    
    #musicUI .fp-disc { 
      width: 200px !important; height: 200px !important; flex-shrink: 0; aspect-ratio: 1 / 1;
      border-radius: 50%; background: radial-gradient(circle at 50% 50%, #1a1a2e 0%, #0a0a16 60%, #05050c 100%); 
      box-shadow: inset 0 0 60px rgba(0, 0, 0, 0.9), 0 20px 60px rgba(0, 0, 0, 0.6); 
      display: flex; align-items: center; justify-content: center; 
    }
    #musicUI .fp-disc::after { content: ""; position: absolute; inset: 30%; border-radius: 50%; background: linear-gradient(135deg, #0ea5e9, #6366f1); }
    #musicUI .fp-disc.spinning { animation: spin 12s linear infinite; }
    
    #musicUI .fp-info { text-align: center; padding: 20px 20px 12px; z-index: 3; }
    #musicUI .fp-title { font-size: 22px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #musicUI .fp-artist { font-size: 13px; color: rgba(255, 255, 255, 0.55); margin-top: 6px; }
    #musicUI .fp-progress-row { display: flex; align-items: center; gap: 10px; padding: 12px 4px 0; z-index: 3; }
    #musicUI .fp-controls { display: flex; align-items: center; justify-content: center; gap: 28px; padding: 28px 20px 10px; z-index: 3; }
    #musicUI .fp-ctrl-btn { width: 56px; height: 56px; border-radius: 50%; border: none; background: rgba(255, 255, 255, 0.09); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; }
    #musicUI .fp-ctrl-btn.fp-play-btn { width: 72px; height: 72px; background: linear-gradient(135deg, #0ea5e9, #6366f1); }
    #musicUI .fp-ctrl-btn svg { width: 26px; height: 26px; fill: currentColor; }
    
    #musicUI .music-close-btn { position: absolute; top: 16px; left: 16px; z-index: 1000; padding: 8px 16px; border-radius: 20px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; backdrop-filter: blur(10px); display: flex; align-items: center; gap: 6px; }
    #musicUI .music-close-btn:active { transform: scale(0.95); }
  `;
  document.head.appendChild(style);

  // ==========================================
  // 2. 动态注入音乐 HTML（去掉了搜索页，直接首页输入）
  // ==========================================
  const ui = document.createElement('div');
  ui.id = 'musicUI';
  ui.innerHTML = `
    <button class="music-close-btn" id="musicCloseBtn">
      <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
      返回游戏
    </button>

    <canvas id="bgCanvas"></canvas>
    <div class="vignette"></div>

    <div class="side-viz side-viz-left"><canvas id="sideVizLeft"></canvas></div>
    <div class="side-viz side-viz-right"><canvas id="sideVizRight"></canvas></div>

    <div class="app" id="app">
      <header class="top-bar">
        <div class="app-title">锐龙音乐</div>
        <div class="app-sub">边玩边听 · 战术专属电台</div>
      </header>

      <!-- 替换成了真正的输入框 -->
      <div class="search-entry">
        <svg class="se-icon" viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
        <input class="search-input" id="searchInput" type="text" placeholder="搜索歌曲、歌手，回车搜索..." autocomplete="off">
        <button class="sp-search-btn" id="searchBtn" type="button">
          <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
        </button>
      </div>

      <div class="song-list" id="songList">
        <div class="empty">
          <div style="font-size:52px;opacity:0.55;margin-bottom:14px;">🎵</div>
          <div style="font-size:15px;color:rgba(255,255,255,0.75);margin-bottom:6px;">输入歌名或歌手进行搜索</div>
        </div>
      </div>
    </div>

    <div class="player-bar hidden" id="playerBar">
      <div class="player-row" id="miniPlayerTap">
        <div class="disc" id="disc"></div>
        <div class="player-info">
          <div class="player-title" id="playerTitle">—</div>
          <div class="player-artist" id="playerArtist">—</div>
        </div>
        <div class="player-controls">
          <button class="ctrl-btn" id="prevBtn"><svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg></button>
          <button class="ctrl-btn play-btn" id="playBtn"><svg viewBox="0 0 24 24" id="playIcon"><path d="M8 5v14l11-7z"/></svg></button>
          <button class="ctrl-btn" id="nextBtn"><svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg></button>
        </div>
      </div>
      <div class="progress-row">
        <span class="time" id="currentTime">0:00</span>
        <div class="progress-track" id="progressTrack"><div class="progress-fill" id="progressFill"></div></div>
        <span class="time" id="totalTime">0:00</span>
      </div>
    </div>

    <div class="full-player" id="fullPlayer">
      <canvas class="fp-viz-bg" id="fpVizCanvas"></canvas>
      <div class="fp-header">
        <button class="fp-btn" id="fpClose"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg></button>
        <div class="fp-header-text">
          <div class="fp-header-title">正在播放</div>
          <div class="fp-header-sub" id="fpHeaderSub">—</div>
        </div>
        <div style="width:40px;"></div>
      </div>
      <div class="fp-disc-wrap">
        <div class="fp-disc" id="fpDisc"><div style="position:relative; z-index:2;"><svg viewBox="0 0 24 24" width="60" height="60"><path fill="rgba(255,255,255,0.95)" d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div></div>
      </div>
      <div class="fp-info">
        <div class="fp-title" id="fpTitle">—</div>
        <div class="fp-artist" id="fpArtist">—</div>
      </div>
      <div class="fp-progress-row">
        <span class="time" id="fpCurrentTime">0:00</span>
        <div class="progress-track" id="fpProgressTrack"><div class="progress-fill" id="fpProgressFill"></div></div>
        <span class="time" id="fpTotalTime">0:00</span>
      </div>
      <div class="fp-controls">
        <button class="fp-ctrl-btn" id="fpPrev"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg></button>
        <button class="fp-ctrl-btn fp-play-btn" id="fpPlay"><svg viewBox="0 0 24 24" id="fpPlayIcon"><path fill="currentColor" d="M8 5v14l11-7z"/></svg></button>
        <button class="fp-ctrl-btn" id="fpNext"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg></button>
      </div>
    </div>
  `;
  document.body.appendChild(ui);

  // ==========================================
  // 3. 音乐核心逻辑
  // ==========================================
  const $ = id => document.getElementById(id);
  const API_BASE = 'https://xiaoapi.cn/v1/music_kw.php';
  let songs = [], currentIndex = -1, isPlaying = false;
  const audio = new Audio();
  audio.crossOrigin = 'anonymous'; audio.preload = 'auto'; audio.volume = 0.8;

  const songList = $('songList'), searchInput = $('searchInput'), searchBtn = $('searchBtn');
  const playerBar = $('playerBar'), miniTap = $('miniPlayerTap');
  const pTitle = $('playerTitle'), pArtist = $('playerArtist'), playBtn = $('playBtn'), playIcon = $('playIcon');
  const prevBtn = $('prevBtn'), nextBtn = $('nextBtn'), disc = $('disc');
  const progressFill = $('progressFill'), cTime = $('currentTime'), tTime = $('totalTime');
  const fullPlayer = $('fullPlayer'), fpClose = $('fpClose'), fpDisc = $('fpDisc');
  const fpTitle = $('fpTitle'), fpArtist = $('fpArtist'), fpSub = $('fpHeaderSub');
  const fpPlay = $('fpPlay'), fpPlayIcon = $('fpPlayIcon'), fpPrev = $('fpPrev'), fpNext = $('fpNext');
  const fpProgressFill = $('fpProgressFill'), fpCTime = $('fpCurrentTime'), fpTTime = $('fpTotalTime');

  const bgCanvas = $('bgCanvas'), bgCtx = bgCanvas.getContext('2d');
  const offCanvas = document.createElement('canvas'), offCtx = offCanvas.getContext('2d');
  const BLOBS = [
    { c: [56, 189, 248], x: 0.2, y: 0.2, r: 0.72, spd: 0.00028, amp: 0.13 },
    { c: [129, 140, 248], x: 0.8, y: 0.15, r: 0.62, spd: 0.00035, amp: 0.11 },
    { c: [52, 211, 153], x: 0.78, y: 0.85, r: 0.74, spd: 0.00032, amp: 0.12 },
    { c: [244, 114, 182], x: 0.18, y: 0.82, r: 0.55, spd: 0.00042, amp: 0.1 }
  ];
  function resizeBg() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    bgCanvas.width = Math.round(window.innerWidth * dpr); bgCanvas.height = Math.round(window.innerHeight * dpr);
    offCanvas.width = Math.max(2, Math.ceil(bgCanvas.width / 6)); offCanvas.height = Math.max(2, Math.ceil(bgCanvas.height / 6));
  }
  function drawBg(t) {
    const w = offCanvas.width, h = offCanvas.height;
    offCtx.globalCompositeOperation = 'source-over'; offCtx.fillStyle = '#08080c'; offCtx.fillRect(0, 0, w, h);
    offCtx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < BLOBS.length; i++) {
      const b = BLOBS[i], phase = i * 1.7;
      const x = (b.x + Math.sin(t * b.spd + phase) * b.amp) * w;
      const y = (b.y + Math.cos(t * b.spd * 1.27 + phase) * b.amp) * h;
      const r = b.r * Math.max(w, h);
      const g = offCtx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},0.55)`);
      g.addColorStop(0.5, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},0.15)`);
      g.addColorStop(1, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},0)`);
      offCtx.fillStyle = g; offCtx.fillRect(0, 0, w, h);
    }
    offCtx.globalCompositeOperation = 'source-over';
    bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    bgCtx.drawImage(offCanvas, 0, 0, offCanvas.width, offCanvas.height, 0, 0, bgCanvas.width, bgCanvas.height);
  }
  let lastBgDraw = 0;
  function bgLoop(now) {
    if (!ui.classList.contains('show')) return;
    if (now - lastBgDraw >= 33) { drawBg(now); lastBgDraw = now; }
    requestAnimationFrame(bgLoop);
  }

  const vizLeftCanvas = $('sideVizLeft'), vizLeftCtx = vizLeftCanvas.getContext('2d');
  const vizRightCanvas = $('sideVizRight'), vizRightCtx = vizRightCanvas.getContext('2d');
  let audioCtx, analyser, sourceNode, freqData;
  function resizeViz(canvas, ctx) {
    const rect = canvas.getBoundingClientRect(); if (!rect.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function initAudioAnalyser() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser(); analyser.fftSize = 128; analyser.smoothingTimeConstant = 0.82;
      sourceNode = audioCtx.createMediaElementSource(audio); sourceNode.connect(analyser); analyser.connect(audioCtx.destination);
      freqData = new Uint8Array(analyser.frequencyBinCount);
    } catch (e) {}
  }
  function drawSideViz(canvas, ctx, side) {
    const w = canvas.width / 2, h = canvas.height / 2;
    if (w <= 0 || h <= 0) return; ctx.clearRect(0, 0, w, h);
    if (!analyser || !freqData) return;
    analyser.getByteFrequencyData(freqData);
    const barCount = 22, step = Math.floor(freqData.length / barCount), barSlot = h / barCount, gap = Math.max(1.5, barSlot * 0.35);
    for (let i = 0; i < barCount; i++) {
      let sum = 0; for (let j = 0; j < step; j++) sum += freqData[i * step + j];
      const v = sum / step / 255, barW = Math.max(2, v * w * 0.95), y = i * barSlot + gap / 2;
      let grad = ctx.createLinearGradient(0, 0, w, 0);
      if (side === 'right') grad = ctx.createLinearGradient(w, 0, 0, 0);
      grad.addColorStop(0, 'rgba(14,165,233,0.95)'); grad.addColorStop(0.6, 'rgba(99,102,241,0.7)'); grad.addColorStop(1, 'rgba(196,181,253,0.15)');
      ctx.fillStyle = grad;
      ctx.fillRect(side === 'left' ? 0 : w - barW, y, barW, barSlot - gap);
    }
  }
  function vizLoop() {
    if (!ui.classList.contains('show')) return;
    requestAnimationFrame(vizLoop);
    drawSideViz(vizLeftCanvas, vizLeftCtx, 'left'); drawSideViz(vizRightCanvas, vizRightCtx, 'right');
  }

  const safeParse = t => { try { return JSON.parse(t); } catch(e) { return null; } };
  function requestSearch(kw) {
    return fetch(API_BASE + '?action=search&msg=' + encodeURIComponent(kw)).then(r => r.text()).then(t => {
      const j = safeParse(t); if (!j) throw new Error('API Error'); return j;
    });
  }
  function requestPlay(rid, br) {
    return fetch(API_BASE + '?action=play&rid=' + encodeURIComponent(rid) + '&br=' + encodeURIComponent(br || 'p')).then(r => r.text()).then(t => {
      const j = safeParse(t); if (j) return j; if (/^https?:\/\//.test(t.trim())) return t.trim(); throw new Error('Play Error');
    });
  }
  function extractSongList(data) {
    if (Array.isArray(data)) { if (data.length && typeof data[0] === 'object') return data; for (let i=0;i<data.length;i++){ const f = extractSongList(data[i]); if(f) return f; } }
    if (data && typeof data === 'object') { for (const k in data) { const v = data[k]; if (Array.isArray(v) && v.length && typeof v[0]==='object') return v; const f2 = extractSongList(v); if(f2) return f2; } }
    return null;
  }
  function extractPlayUrl(data) {
    if (!data) return null; if (typeof data === 'string') return /^https?:\/\//.test(data) ? data : null;
    const keys = ['url','play_url','playUrl','playurl','src','file','link','audio','music'];
    for (let i=0;i<keys.length;i++){ const v = data[keys[i]]; if (typeof v === 'string' && /^https?:\/\//.test(v)) return v; }
    for (const k in data) { const v2 = data[k]; if (typeof v2 === 'string' && /^https?:\/\//.test(v2)) return v2; if (typeof v2 === 'object') { const u = extractPlayUrl(v2); if(u) return u; } }
    return null;
  }
  const pick = (o, k, d) => { for(let i=0;i<k.length;i++){ if(o[k[i]]!=null && o[k[i]]!=='') return o[k[i]]; } return d; };
  const getSongName = s => pick(s, ['songname','song_name','name','filename','title'], '未知歌曲');
  const getArtist = s => pick(s, ['singername','singer_name','author','artist'], '未知歌手');
  const getRid = s => pick(s, ['rid','id','hash','song_id'], null);
  const getBr = s => pick(s, ['br','bitrate','rate'], 'p');

  function doSearch() {
    const kw = searchInput.value.trim(); if (!kw) return;
    songList.innerHTML = '<div class="empty"><div class="loader"></div>搜索中...</div>';
    requestSearch(kw).then(data => {
      const list = extractSongList(data);
      if (!list || !list.length) { songList.innerHTML = '<div class="empty">没有找到相关歌曲</div>'; return; }
      songs = list; renderSongList();
    }).catch(err => { songList.innerHTML = '<div class="empty">请求失败: ' + err.message + '</div>'; });
  }

  function renderSongList() {
    songList.innerHTML = '';
    songs.forEach((song, i) => {
      const html = `
        <div class="song-index">${i + 1}</div>
        <div class="song-info">
          <div class="song-name">${getSongName(song)}</div>
          <div class="song-artist">${getArtist(song)}</div>
        </div>`;
      const div = document.createElement('div'); div.className = 'song-item'; div.innerHTML = html;
      div.addEventListener('click', () => playSong(i)); 
      songList.appendChild(div);
    });
  }

  function playSong(index) {
    if (index < 0 || index >= songs.length) return;
    const song = songs[index], rid = getRid(song);
    if (!rid) return alert('缺少播放 ID');
    document.querySelectorAll('.song-item').forEach((el, i) => {
      el.classList.toggle('playing', i === index);
    });
    
    pTitle.textContent = fpTitle.textContent = getSongName(song);
    pArtist.textContent = fpArtist.textContent = fpSub.textContent = getArtist(song);
    playerBar.classList.remove('hidden'); $('app').classList.add('with-player');

    requestPlay(rid, getBr(song)).then(data => {
      const url = extractPlayUrl(data); if (!url) return alert('未获取到播放地址');
      currentIndex = index; audio.src = url; initAudioAnalyser();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      audio.play().then(() => { isPlaying = true; updatePlayIcons(); });
    }).catch(() => alert('播放失败'));
  }

  function togglePlay() {
    if (!audio.src) return;
    if (isPlaying) audio.pause();
    else audio.play().then(() => { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); });
  }
  function updatePlayIcons() {
    const p = '<path d="M8 5v14l11-7z"/>', s = '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>';
    playIcon.innerHTML = fpPlayIcon.innerHTML = isPlaying ? s : p;
  }

  // ==========================================
  // 4. 事件绑定
  // ==========================================
  
  searchBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') { searchInput.blur(); doSearch(); } });

  playBtn.addEventListener('click', e => { e.stopPropagation(); togglePlay(); });
  prevBtn.addEventListener('click', e => { e.stopPropagation(); if (currentIndex > 0) playSong(currentIndex - 1); });
  nextBtn.addEventListener('click', e => { e.stopPropagation(); if (currentIndex < songs.length - 1) playSong(currentIndex + 1); });
  miniTap.addEventListener('click', () => { if (audio.src) fullPlayer.classList.add('show'); });

  fpClose.addEventListener('click', () => fullPlayer.classList.remove('show'));
  fpPlay.addEventListener('click', togglePlay);
  fpPrev.addEventListener('click', () => { if (currentIndex > 0) playSong(currentIndex - 1); });
  fpNext.addEventListener('click', () => { if (currentIndex < songs.length - 1) playSong(currentIndex + 1); });

  audio.addEventListener('timeupdate', () => {
    if (!audio.duration) return;
    const p = (audio.currentTime / audio.duration) * 100;
    progressFill.style.width = fpProgressFill.style.width = p + '%';
    const fmt = t => Math.floor(t / 60) + ':' + (Math.floor(t % 60) < 10 ? '0' : '') + Math.floor(t % 60);
    cTime.textContent = fpCTime.textContent = fmt(audio.currentTime);
    tTime.textContent = fpTTime.textContent = fmt(audio.duration);
  });
  audio.addEventListener('pause', () => { isPlaying = false; updatePlayIcons(); disc.classList.remove('spinning'); fpDisc.classList.remove('spinning'); });
  audio.addEventListener('play', () => { isPlaying = true; updatePlayIcons(); disc.classList.add('spinning'); fpDisc.classList.add('spinning'); });
  audio.addEventListener('ended', () => { isPlaying = false; updatePlayIcons(); if (currentIndex < songs.length - 1) playSong(currentIndex + 1); });

  $('musicCloseBtn').addEventListener('click', () => {
    ui.classList.remove('show');
    if (window.G) {
      window.G.paused = false;
      if (window.G.started && !window.G.over) {
        window.G.running = true;
        const pauseEl = document.getElementById('pause');
        if (pauseEl) pauseEl.classList.remove('on');
        if (window.IS_TOUCH === false && window.requestLock) window.requestLock();
      }
    }
  });

  const btnMusic = document.getElementById('btnMusic');
  if (btnMusic) {
    const openMusic = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      ui.classList.add('show');
      resizeBg(); requestAnimationFrame(bgLoop);
      resizeViz(vizLeftCanvas, vizLeftCtx); resizeViz(vizRightCanvas, vizRightCtx);
      requestAnimationFrame(vizLoop);
      
      if (window.pauseGameTouch) window.pauseGameTouch();
      if (document.exitPointerLock) document.exitPointerLock();
    };
    btnMusic.addEventListener('touchstart', openMusic, { passive: false });
    btnMusic.addEventListener('click', openMusic);
  }
})();