/* =========================================================================
   bgm.js
   开始界面背景音乐 —— ./music/ 随机播放

   依赖：无
   暴露：BGM

   每次进入页面时从 ./music/ 目录随机选一首曲目，在开始界面循环播放；
   点击开始进入游戏后淡出停止，不干扰战斗音效。
   浏览器会拦截带声音的自动播放：先尝试直接播放，被拦截则在用户第一次
   与页面交互（按下鼠标 / 按键盘 / 触摸）时启动。

   如需添加曲目：把音频文件放进 music/ 目录，并把文件名加进 MUSIC 数组。
   ========================================================================= */
"use strict";

const BGM = (function(){
  /* 曲目列表 —— 与 music/ 目录一一对应，新歌加在这里即可 */
  const MUSIC = [
    'music/music1.mp3',
    'music/music2.mp3',
    'music/music3.mp3'
  ];
  const VOLUME = 0.35;            // 相对音量
  const FADE   = 1.2;             // 开始游戏时的淡出时长（秒）

  let el = null, started = false, stopped = false, arming = false;

  function play(){
    /* stopped：已进入游戏（或主动关闭），之后的手势不再把音乐叫回来 */
    if (stopped || started || !el) return;
    started = true;
    try { el.volume = VOLUME; } catch (e){}
    const p = el.play();
    /* 自动播放被拦截时把 started 复位，等下一次用户手势再试 */
    if (p && p.catch) p.catch(() => { started = false; });
  }

  /* 第一次用户手势后启动（pointerdown 早于 click，可在开战前一瞬起播） */
  function arm(){
    if (arming) return;
    arming = true;
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
      window.addEventListener(ev, play, { passive: true }));
    play();                    // 顺手先试一次自动播放（部分浏览器允许）
  }

  /* 游戏开始：淡出并停止，之后不再重启，避免与合成环境音/枪声混在一起 */
  function stop(){
    if (!el) return;
    stopped = true;
    if (!started) return;
    started = false;
    const t0 = performance.now();
    (function fade(){
      const k = Math.max(0, 1 - (performance.now() - t0) / 1000 / FADE);
      try { el.volume = VOLUME * k; } catch (e){}
      if (k > 0) requestAnimationFrame(fade);
      else { try { el.pause(); } catch (e){} }
    })();
  }

  function init(){
    if (el) return;
    try {
      el = new Audio(MUSIC[(Math.random() * MUSIC.length) | 0]);
      el.loop = true;
      el.preload = 'auto';
    } catch (e){ el = null; return; }
    arm();
  }

  /* 只读状态查询（调试 / 音量面板用） */
  function state(){
    if (!el) return { ready: false };
    return { ready: true, src: el.currentSrc || el.src, paused: el.paused, volume: el.volume };
  }

  return { init, stop, state };
})();