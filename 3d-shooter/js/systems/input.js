/* =========================================================================
   input.js
   ========================================================================= */
"use strict";

const keys = Object.create(null);
let mouseDX = 0, mouseDY = 0;

const SENS_BASE = 0.0022;
let SENS = SENS_BASE;
let sensScale = 1;

const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

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

addEventListener('keydown', e => {
  if (e.repeat){
    if (isBoundCode(e.code, 'jump') || isBoundCode(e.code, 'reload')) e.preventDefault();
    return;
  }

  keys[e.code] = true;

  if (isBoundCode(e.code, 'jump')) player.spaceEdge = true;

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
    if (window.__keyEditMode) return;
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
      if (window.__keyEditMode) return;
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

 // ★ 开镜按钮改为点击切换开镜（慢速平滑过渡在 adsTime 里控制）
(function bindAdsButton(){
  const el = document.getElementById('btnAds');
  if (!el) return;
  let tid = null, lx = 0, ly = 0, moved = 0;

  el.addEventListener('touchstart', e => {
    e.preventDefault(); e.stopPropagation();
    if (!G.running || tid !== null) return;
    if (window.__keyEditMode) return;
    const t = e.changedTouches[0];
    tid = t.identifier;
    lx = t.clientX;
    ly = t.clientY;
    moved = 0;
    // ★ 点击切换开镜，避免每帧按键状态判断
    if (typeof toggleADS === 'function') toggleADS();
    el.classList.toggle('on', player.ads);
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

  el.addEventListener('touchend',    e => { if (tid === null) return; e.preventDefault(); tid = null; }, { passive: false });
  el.addEventListener('touchcancel', () => { if (tid === null) return; tid = null; });
})();

  // ★ 蹲按钮改为点击切换（不再按住生效）
(function bindCrouchButton(){
  const el = document.getElementById('btnCrouch');
  if (!el) return;
  el.addEventListener('touchstart', e => {
    e.preventDefault(); e.stopPropagation();
    if (!G.running || G.shopOpen || G.paused) return;
    if (window.__keyEditMode) return;
    player.crouchLatch = !player.crouchLatch;
    el.classList.toggle('on', player.crouchLatch);
  }, { passive: false });
})();

  function tap(id, fn){
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', e => {
      e.preventDefault();
      e.stopPropagation();
      
      if (id === 'btnPause' || id === 'btnSet' || id === 'btnAttach' || id === 'btnWeaponShop') {
        fn();
      } else if (G.running) {
        fn();
      }
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
  tap('btnAttach',  () => { if (typeof openAttachShop === 'function') openAttachShop(); });
  
  // ✅ 军火库按钮
  tap('btnWeaponShop', () => { if (typeof openWeaponShop === 'function') openWeaponShop(); });

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
      if (window.__keyEditMode) return;
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
   ★ 启动界面 / 暂停界面 / 各弹窗的绑定
   以前用 window.addEventListener('load', ...) —— 但在异步串行加载器下，
   多个脚本之间存在"让出一帧"的空隙，浏览器会误以为资源加载完毕，
   在 input.js 执行前就触发了 window.load，导致这里注册的监听器
   永远不会被调用，开始按钮点了没反应。

   现在改成：DOM 一就绪就尝试绑定；UI（hud.js）还没就绪就轮询等待。
   完全不依赖 window.load，任何加载方案下都稳。
   ========================================================================= */
function _initStartScreenBindings(){
  if (typeof UI === 'undefined') return false;

  if (UI.startScreen && !UI.startScreen._boundStart){
    UI.startScreen._boundStart = true;
    UI.startScreen.addEventListener('click', () => {
      // ★ 加保护：即使 SFX.init 出错也要能开始游戏
      try { SFX.init(); } catch (e){ console.error('[SFX.init 失败]', e); }
      if (IS_TOUCH) forceLandscapeFullscreen();
      if (typeof startGame === 'function') {
        try { startGame(); } catch (e){ console.error('[startGame 失败]', e); }
      }
    });
  }

  if (UI.pause && !UI.pause._boundPause){
    UI.pause._boundPause = true;
    UI.pause.addEventListener('click', () => {
      try { SFX.init(); } catch (e){}
      if (IS_TOUCH){
        G.paused = false;
        G.running = true;
        UI.pause.classList.remove('on');
        try { SFX.resume(); } catch (e){}
      } else {
        requestLock();
      }
    });
  }

  const restartBtn = document.getElementById('restartBtn');
  if (restartBtn && !restartBtn._boundRestart){
    restartBtn._boundRestart = true;
    const doRestart = (e) => {
      if (e){ e.preventDefault(); e.stopPropagation(); }
      if (typeof restart === 'function') restart();
    };
    restartBtn.addEventListener('click', doRestart);
    restartBtn.addEventListener('touchend', doRestart, { passive: false });
  }

  document.querySelectorAll('.attachTab').forEach(tab => {
    if (tab._boundTab) return;
    tab._boundTab = true;
    tab.addEventListener('click', () => {
      document.querySelectorAll('.attachTab').forEach(t => {
        t.classList.remove('on');
        t.style.color = 'rgba(223,230,236,.5)';
        t.style.borderColor = 'transparent';
        t.style.background = 'transparent';
      });
      tab.classList.add('on');
      tab.style.color = '#ffb340';
      tab.style.borderColor = 'rgba(255,179,64,.45)';
      tab.style.background = 'rgba(255,179,64,.12)';

      const shopEl = document.getElementById('attachShop');
      if (shopEl) shopEl.dataset.wid = tab.dataset.wid;

      if (typeof renderAttachShop === 'function') renderAttachShop();
    });
  });

  document.querySelectorAll('.subTab').forEach(tab => {
    if (tab._boundSubTab) return;
    tab._boundSubTab = true;
    tab.addEventListener('click', () => {
      document.querySelectorAll('.subTab').forEach(t => {
        t.classList.remove('on');
        t.style.color = 'rgba(255,255,255,.4)';
        t.style.borderBottom = 'none';
      });
      tab.classList.add('on');
      tab.style.color = '#fff';
      tab.style.borderBottom = '2px solid #ffb340';

      const isAttach = tab.dataset.tab === 'attach';
      document.getElementById('attachShopList').style.display = isAttach ? 'flex' : 'none';
      document.getElementById('ammoShopList').style.display = isAttach ? 'none' : 'flex';
    });
  });

  if (typeof updateWeaponSlotsUI === 'function') updateWeaponSlotsUI();
  return true;
}

(function bindStartScreen(){
  // 万一 HTML 还没解析完（一般不会，但保险）
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bindStartScreen, { once: true });
    return;
  }
  // DOM 已就绪，立即尝试
  if (_initStartScreenBindings()) return;
  // UI 还没定义（hud.js 还在路上），轮询等待
  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    if (_initStartScreenBindings()) { clearInterval(timer); return; }
    if (tries > 100){ // 5 秒超时
      clearInterval(timer);
      console.error('❌ [启动] 等待 UI 超时，开始按钮未绑定。请检查 hud.js 是否加载成功。');
    }
  }, 50);
})();