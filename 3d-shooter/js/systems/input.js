/* =========================================================================
   input.js
   键盘 / 鼠标 / 触屏输入 + 全屏 + 横屏锁定
   ========================================================================= */
"use strict";

const keys = Object.create(null);
let mouseDX = 0, mouseDY = 0;

const SENS_BASE = 0.0022;
let SENS = SENS_BASE;
let sensScale = 1;

const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

/* --------------------------------------------------------------------------
   ★ 键位映射
   DEFAULT_KEYBINDS 是初始值；KEYBINDS 由 settings.js 在加载后赋值为
   SET.keybinds（同一引用）。用户修改键位时 SET.keybinds 被改写，
   下一次 keydown 立即生效，无需刷新。
   -------------------------------------------------------------------------- */
const DEFAULT_KEYBINDS = {
  forward:  ['KeyW', 'ArrowUp'],
  back:     ['KeyS', 'ArrowDown'],
  left:     ['KeyA', 'ArrowLeft'],
  right:    ['KeyD', 'ArrowRight'],
  jump:     ['Space'],
  sprint:   ['ShiftLeft', 'ShiftRight'],
  crouch:   ['ControlLeft', 'ControlRight', 'KeyC'],
  reload:   ['KeyR'],
  heal:     ['KeyH'],
  grenade:  ['KeyG'],
  fireMode: ['KeyV'],
  allyCmd:  ['KeyZ'],
  droneCmd: ['KeyX'],
  shop:     ['KeyB'],
  weapon1:  ['Digit1'],
  weapon2:  ['Digit2'],
  weapon3:  ['Digit3'],
  weapon4:  ['Digit4'],
  pause:    ['Escape']
};

/* settings.js 加载后 = SET.keybinds（同一引用） */
let KEYBINDS = null;

function isBoundCode(code, action){
  const map = KEYBINDS || DEFAULT_KEYBINDS;
  const list = map[action];
  return !!list && list.indexOf(code) >= 0;
}

function isActionDown(action){
  const map = KEYBINDS || DEFAULT_KEYBINDS;
  const list = map[action];
  if (!list) return false;
  for (let i = 0; i < list.length; i++){
    if (keys[list[i]]) return true;
  }
  return false;
}

/* --------------------------------------------------------------------------
   横屏锁定 / 全屏
   -------------------------------------------------------------------------- */
function tryLockLandscape(){
  if (screen.orientation && typeof screen.orientation.lock === 'function'){
    screen.orientation.lock('landscape').catch(() => {});
  }
}
if (IS_TOUCH) tryLockLandscape();

function isFullscreen(){
  return !!(document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement);
}

function enterFullscreen(){
  const el = document.documentElement;
  const fn = el.requestFullscreen ||
             el.webkitRequestFullscreen ||
             el.mozRequestFullScreen ||
             el.msRequestFullscreen;
  if (fn){
    try {
      const p = fn.call(el);
      if (p && p.catch) p.catch(() => {});
    } catch (e){}
  }
  tryLockLandscape();
}

function exitFullscreen(){
  const fn = document.exitFullscreen ||
             document.webkitExitFullscreen ||
             document.mozCancelFullScreen ||
             document.msExitFullscreen;
  if (fn){
    try { fn.call(document); } catch (e){}
  }
}

function toggleFullscreen(){
  if (isFullscreen()) exitFullscreen();
  else                enterFullscreen();
}

function forceLandscapeFullscreen(){
  if (!IS_TOUCH) return;
  if (!isFullscreen()) enterFullscreen();
  tryLockLandscape();
}
if (IS_TOUCH){
  window.addEventListener('touchstart', function onFirstTouch(){
    forceLandscapeFullscreen();
    window.removeEventListener('touchstart', onFirstTouch);
  }, { passive: true });
}

/* =========================================================================
   键盘
   ========================================================================= */
addEventListener('keydown', e => {
  if (e.repeat){
    if (isBoundCode(e.code, 'jump') || isBoundCode(e.code, 'reload')) e.preventDefault();
    return;
  }

  keys[e.code] = true;

  /* ★ 跳跃的边沿触发：任何绑定到 jump 的键都会置位 */
  if (isBoundCode(e.code, 'jump')) player.spaceEdge = true;

  /* 阻止系统级滚动 / 光标移动 */
  const PREVENT = ['Space','Tab','Enter','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ControlLeft'];
  if (PREVENT.includes(e.code)) e.preventDefault();

  if (G.shopOpen){
    if (isBoundCode(e.code, 'pause') || isBoundCode(e.code, 'shop')){
      if (typeof closeShop === 'function') closeShop(true);
    }
    return;
  }

  if (G.needLock) grabLock();

  if (isBoundCode(e.code, 'shop') && G.phase === 'inter'){
    if (G.placing && typeof cancelPlacing === 'function') cancelPlacing();
    if (typeof openShop === 'function') openShop();
    return;
  }

  if (!G.running) return;

  if (isBoundCode(e.code, 'reload')  && typeof startReload    === 'function') startReload();
  if (isBoundCode(e.code, 'heal')    && typeof startHeal      === 'function') startHeal();
  if (isBoundCode(e.code, 'allyCmd') && typeof commandAlly    === 'function') commandAlly();
  if (isBoundCode(e.code, 'droneCmd')&& typeof commandDrone   === 'function') commandDrone();
  if (isBoundCode(e.code, 'grenade') && typeof toggleGrenade  === 'function') toggleGrenade();

  if (G.placing){
    if (e.code === 'KeyF' || e.code === 'Enter' || isBoundCode(e.code, 'jump')){
      if (typeof confirmPlace === 'function') confirmPlace();
      return;
    }
    if (isBoundCode(e.code, 'pause')){
      if (typeof cancelPlacing === 'function') cancelPlacing();
      return;
    }
  }

  if (isBoundCode(e.code, 'weapon1') && typeof switchWeapon === 'function') switchWeapon(0);
  if (isBoundCode(e.code, 'weapon2') && typeof switchWeapon === 'function') switchWeapon(1);
  if (isBoundCode(e.code, 'weapon3') && typeof switchWeapon === 'function') switchWeapon(2);
  if (isBoundCode(e.code, 'weapon4') && typeof switchWeapon === 'function') switchWeapon(3);

  if (isBoundCode(e.code, 'fireMode')){
    const w = WEAPONS[player.weapon];
    if (w.semiToggle){
      w.semi = !w.semi;
      SFX.boltClick();
      if (typeof updateAmmoUI === 'function') updateAmmoUI();
    }
  }
});

addEventListener('keyup', e => { keys[e.code] = false; });

/* =========================================================================
   鼠标
   ========================================================================= */
addEventListener('mousemove', e => {
  if (document.pointerLockElement !== document.body){
    if (G.needLock) grabLock();
    return;
  }
  mouseDX += e.movementX || 0;
  mouseDY += e.movementY || 0;
});

addEventListener('mousedown', e => {
  if (G.shopOpen) return;
  if (G.needLock) grabLock();

  /* 投掷物模式：左键捏雷 */
  if (e.button === 0 && typeof grenadeState !== 'undefined' && grenadeState.active){
    grenadeState.charging = true;
    grenadeState.chargeT = 0;
    grenadeState.fuse = 0;
    return;
  }

  if (G.placing && e.button === 0){
    if (typeof confirmPlace === 'function') confirmPlace();
    return;
  }
  if (G.placing && e.button === 2){
    if (typeof cancelPlacing === 'function') cancelPlacing();
    return;
  }

  if (!G.running) return;

  if (e.button === 0){
    player.triggerHeld = true;
    player.clickBuf = 0.12;
  }

  if (e.button === 2){
    e.preventDefault();
    if (typeof SET !== 'undefined' && SET.adsMode === 'toggle'){
      if (typeof toggleADS === 'function') toggleADS();
    } else {
      if (typeof setADS === 'function') setADS(true);
    }
  }
});

addEventListener('mouseup', e => {
  if (e.button === 0){
    /* 投掷物模式：松开丢出去 */
    if (typeof grenadeState !== 'undefined' && grenadeState.active && grenadeState.charging){
      if (typeof throwGrenade === 'function') throwGrenade();
      return;
    }
    player.triggerHeld = false;
    player.triggerReleased = true;
  }
  if (e.button === 2 && typeof SET !== 'undefined' && SET.adsMode !== 'toggle'){
    if (typeof setADS === 'function') setADS(false);
  }
});

addEventListener('wheel', e => {
  if (G.shopOpen || !G.running) return;
  if (typeof cycleWeapon === 'function') cycleWeapon(e.deltaY > 0 ? 1 : -1);
}, { passive: true });

addEventListener('contextmenu', e => e.preventDefault());

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === document.body;
  if (locked) G.needLock = false;

  if (!locked && G.started && !G.over && !G.shopOpen){
    G.paused = true;
    G.running = false;
    player.ads = false;
    player.adsK = 0;
    player.adsEase = 0;
    if (typeof UI !== 'undefined' && UI._scopeK !== -1){
      UI._scopeK = -1;
      UI.scope.style.opacity = 0;
      compMat.uniforms.scope.value = 0;
      if (UI.cross) UI.cross.classList.remove('hidden');
      vmRoot.visible = true;
    }
    if (typeof UI !== 'undefined' && UI.pause) UI.pause.classList.add('on');
    SFX.suspend();
  } else if (locked){
    G.paused = false;
    if (typeof UI !== 'undefined' && UI.pause) UI.pause.classList.remove('on');
    if (G.started && !G.over){
      G.running = true;
      SFX.resume();
    }
  }
});

function grabLock(){
  if (IS_TOUCH || !G.started || G.over || G.shopOpen) return false;
  if (document.pointerLockElement === document.body) return true;
  if (perfNow - G.lockTryAt < 600) return false;
  G.lockTryAt = perfNow;
  G.needLock = true;
  requestLock();
  return false;
}

function requestLock(){
  const p = document.body.requestPointerLock();
  if (p && p.catch) p.catch(() => {});
  clearTimeout(requestLock._t);
  requestLock._t = setTimeout(() => {
    if (document.pointerLockElement === document.body) return;
    if (!G.started || G.over) return;
    if (G.shopOpen || G.needLock) return;
    G.paused = true;
    G.running = false;
    if (typeof UI !== 'undefined' && UI.pause) UI.pause.classList.add('on');
  }, 350);
}

function pauseGameTouch(){
  if (!G.started || G.over || !G.running) return;
  G.paused = true;
  G.running = false;
  if (typeof setADS === 'function') setADS(false);
  if (typeof UI !== 'undefined' && UI.pause) UI.pause.classList.add('on');
  SFX.suspend();
}

/* =========================================================================
   触屏
   ========================================================================= */
if (IS_TOUCH){
  document.body.classList.add('touch');

  const solo = document.getElementById('btnSolo');
  if (solo) solo.textContent = 'TAP TO START';

  const stickBase = document.getElementById('stickBase');
  const stickKnob = document.getElementById('stickKnob');

  const SPRINT_AT = 0.86;
  const joy  = { id: null, ox: 0, oy: 0 };
  const look = { id: null, lx: 0, ly: 0 };

  function showStick(x, y){
    stickBase.style.left = x + 'px';
    stickBase.style.top  = y + 'px';
    stickKnob.style.left = x + 'px';
    stickKnob.style.top  = y + 'px';
    stickBase.style.display = 'block';
    stickKnob.style.display = 'block';
  }

  function hideStick(){
    stickBase.style.display = 'none';
    stickKnob.style.display = 'none';
    stickBase.classList.remove('run');
    stickKnob.classList.remove('run');
    keys['KeyW'] = keys['KeyS'] = keys['KeyA'] = keys['KeyD'] = false;
    keys['ShiftLeft'] = false;
  }

  window.addEventListener('touchstart', e => {
  if (!G.running) return;
  if (window.__keyEditMode) return; // ★ 拦截编辑模式
  if (e.target && e.target.closest && e.target.closest('#shop')) return;

    for (const t of e.changedTouches){
      if (t.target.closest && t.target.closest('[data-ui]')) continue;
      if (t.clientX < innerWidth * 0.5 && joy.id === null){
        joy.id = t.identifier;
        joy.ox = t.clientX;
        joy.oy = t.clientY;
        showStick(t.clientX, t.clientY);
      } else if (look.id === null){
        look.id = t.identifier;
        look.lx = t.clientX;
        look.ly = t.clientY;
      }
    }
    e.preventDefault();
  }, { passive: false });

  window.addEventListener('touchmove', e => {
    if (!G.running) return;
    if (e.target && e.target.closest && e.target.closest('#shop')) return;

    for (const t of e.changedTouches){
      if (t.identifier === joy.id){
        let dx = t.clientX - joy.ox, dy = t.clientY - joy.oy;
        const R = 56, m = Math.hypot(dx, dy);
        if (m > R){ dx = dx / m * R; dy = dy / m * R; }
        stickKnob.style.left = (joy.ox + dx) + 'px';
        stickKnob.style.top  = (joy.oy + dy) + 'px';

        const nx = dx / R, ny = dy / R;
        keys['KeyW'] = ny < -0.32;
        keys['KeyS'] = ny >  0.32;
        keys['KeyA'] = nx < -0.32;
        keys['KeyD'] = nx >  0.32;

        const running = (m / R) > SPRINT_AT;
        keys['ShiftLeft'] = running;
        stickBase.classList.toggle('run', running);
        stickKnob.classList.toggle('run', running);
      } else if (t.identifier === look.id){
        mouseDX += (t.clientX - look.lx) * SET.touchSens;
        mouseDY += (t.clientY - look.ly) * SET.touchSens;
        look.lx = t.clientX;
        look.ly = t.clientY;
      }
    }
    e.preventDefault();
  }, { passive: false });

  function endTouch(e){
    for (const t of e.changedTouches){
      if (t.identifier === joy.id){ joy.id = null; hideStick(); }
      else if (t.identifier === look.id){ look.id = null; }
    }
  }
  window.addEventListener('touchend', endTouch);
  window.addEventListener('touchcancel', endTouch);

  const DRAG_DEADZONE = 7;

  function hold(el, down, up){
    if (!el) return;
    let tid = null, lx = 0, ly = 0, moved = 0;
    el.addEventListener('touchstart', e => {
  e.preventDefault(); e.stopPropagation();
  if (!G.running) return;
  if (window.__keyEditMode) return; // ★ 拦截编辑模式
      const t = e.changedTouches[0];
      tid = t.identifier;
      lx = t.clientX;
      ly = t.clientY;
      moved = 0;
      down();
    }, { passive: false });

    el.addEventListener('touchmove', e => {
      if (!SET.dragLook || tid === null || !G.running) return;
      for (const t of e.changedTouches){
        if (t.identifier !== tid) continue;
        const dx = t.clientX - lx, dy = t.clientY - ly;
        lx = t.clientX;
        ly = t.clientY;
        moved += Math.hypot(dx, dy);
        if (moved < DRAG_DEADZONE) continue;
        mouseDX += dx * SET.touchSens;
        mouseDY += dy * SET.touchSens;
      }
      e.preventDefault();
    }, { passive: false });

    el.addEventListener('touchend',    e => { e.preventDefault(); tid = null; if (up) up(); }, { passive: false });
    el.addEventListener('touchcancel', () => { tid = null; if (up) up(); });
  }

  /* FIRE 键：手雷模式 = 捏雷/丢出；普通模式 = 开火 */
  hold(document.getElementById('btnFire'),
       () => {
         if (typeof grenadeState !== 'undefined' && grenadeState.active){
           grenadeState.charging = true;
           grenadeState.chargeT = 0;
           grenadeState.fuse = 0;
         } else {
           player.triggerHeld = true;
           player.clickBuf = 0.12;
         }
       },
       () => {
         if (typeof grenadeState !== 'undefined' && grenadeState.active && grenadeState.charging){
           if (typeof throwGrenade === 'function') throwGrenade();
         } else {
           player.triggerHeld = false;
           player.triggerReleased = true;
         }
       });

  (function bindAdsButton(){
    const el = document.getElementById('btnAds');
    if (!el) return;
    let tid = null, lx = 0, ly = 0, moved = 0;

    const finish = () => {
      if (SET.adsMode !== 'toggle'){
        if (typeof setADS === 'function') setADS(false);
        el.classList.remove('on');
      }
      tid = null;
    };

    el.addEventListener('touchstart', e => {
  e.preventDefault(); e.stopPropagation();
  if (!G.running || tid !== null) return;
  if (window.__keyEditMode) return; // ★ 拦截编辑模式
      const t = e.changedTouches[0];
      tid = t.identifier;
      lx = t.clientX;
      ly = t.clientY;
      moved = 0;
      if (SET.adsMode === 'toggle'){
        if (typeof toggleADS === 'function') toggleADS();
      } else {
        if (typeof setADS === 'function') setADS(true);
        el.classList.add('on');
      }
    }, { passive: false });

    el.addEventListener('touchmove', e => {
      if (!SET.dragLook || tid === null || !G.running) return;
      for (const t of e.changedTouches){
        if (t.identifier !== tid) continue;
        const dx = t.clientX - lx, dy = t.clientY - ly;
        lx = t.clientX;
        ly = t.clientY;
        moved += Math.hypot(dx, dy);
        if (moved < DRAG_DEADZONE) continue;
        mouseDX += dx * SET.touchSens;
        mouseDY += dy * SET.touchSens;
      }
      e.preventDefault();
    }, { passive: false });

    el.addEventListener('touchend',    e => { if (tid === null) return; e.preventDefault(); finish(); }, { passive: false });
    el.addEventListener('touchcancel', () => { if (tid === null) return; finish(); });
  })();

  hold(document.getElementById('btnCrouch'),
       () => {
         keys['ControlLeft'] = true;
         const b = document.getElementById('btnCrouch');
         if (b) b.classList.add('on');
       },
       () => {
         keys['ControlLeft'] = false;
         const b = document.getElementById('btnCrouch');
         if (b) b.classList.remove('on');
       });

  function tap(id, fn){
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', e => {
      e.preventDefault();
      e.stopPropagation();
      if (G.running) fn();
    }, { passive: false });
  }

  tap('btnJump',    () => { player.spaceEdge = true; });
  tap('btnReload',  () => { if (typeof startReload === 'function') startReload(); });
  tap('btnPause',   () => pauseGameTouch());
  tap('btnHeal',    () => { if (typeof startHeal === 'function') startHeal(); });
  tap('btnSet',     () => {
    pauseGameTouch();
    if (typeof openSettings === 'function') openSettings();
  });
  tap('btnShop',    () => { if (typeof openShop === 'function') openShop(); });
  tap('btnPlace',   () => { if (typeof confirmPlace === 'function') confirmPlace(); });
  tap('btnCancel',  () => { if (typeof cancelPlacing === 'function') cancelPlacing(); });
  tap('btnGrenade', () => { if (typeof toggleGrenade === 'function') toggleGrenade(); });

  const fsBtn = document.getElementById('btnFullscreen');
  if (fsBtn){
    const doFs = (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFullscreen();
      setTimeout(tryLockLandscape, 300);
    };
    fsBtn.addEventListener('touchstart', doFs, { passive: false });
    fsBtn.addEventListener('click', doFs);
  }

  if (typeof UI !== 'undefined' && UI.medRow)
    UI.medRow.addEventListener('click', () => { if (G.running) startHeal(); });

  const cmdRow = (el, fn) => {
    if (!el) return;
    el.addEventListener('click', () => {
      if (G.running && !G.shopOpen && !G.paused) fn();
    });
    el.addEventListener('touchstart', e => {
  e.preventDefault();
  e.stopPropagation();
  if (window.__keyEditMode) return; // ★ 拦截编辑模式
  if (G.running) fn();
}, { passive: false });
  };
  if (typeof UI !== 'undefined'){
    cmdRow(UI.rowAllyCmd,  commandAlly);
    cmdRow(UI.rowDroneCmd, commandDrone);
    cmdRow(UI.squadHead, () => {
      setSquadOpen(!SET.squadOpen);
      syncSettingsUI();
      saveSettings();
    });
  }

  const WEAPON_TAP = fn => el => {
    if (!el) return;
    el.addEventListener('touchstart', e => {
      e.preventDefault();
      e.stopPropagation();
      if (!G.running || G.shopOpen || G.paused) return;
      fn();
    }, { passive: false });
    el.addEventListener('click', () => {
      if (G.running && !G.shopOpen && !G.paused) fn();
    });
  };

  if (typeof UI !== 'undefined' && UI.slots)
    UI.slots.forEach((el, i) => WEAPON_TAP(() => switchWeapon(i))(el));
  if (typeof UI !== 'undefined' && UI.wname)
    WEAPON_TAP(() => cycleWeapon(1))(UI.wname);
}

/* =========================================================================
   加载完成
   ========================================================================= */
window.addEventListener('load', () => {
  if (typeof UI === 'undefined') return;

  if (UI.startScreen){
    UI.startScreen.addEventListener('click', () => {
      SFX.init();
      if (IS_TOUCH) forceLandscapeFullscreen();
      if (typeof startGame === 'function') startGame();
    });
  }

  if (UI.pause){
    UI.pause.addEventListener('click', () => {
      SFX.init();
      if (IS_TOUCH){
        G.paused = false;
        G.running = true;
        UI.pause.classList.remove('on');
        SFX.resume();
      } else {
        requestLock();
      }
    });
  }

  const restartBtn = document.getElementById('restartBtn');
  if (restartBtn){
    const doRestart = (e) => {
      if (e){ e.preventDefault(); e.stopPropagation(); }
      if (typeof restart === 'function') restart();
    };
    restartBtn.addEventListener('click', doRestart);
    restartBtn.addEventListener('touchend', doRestart, { passive: false });
  }
});