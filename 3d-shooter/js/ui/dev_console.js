/* =========================================================================
   dev_console.js
   开发者控制台 —— 隐蔽安全锁 / 双核日志 / 运行时热拦截
   ========================================================================= */
"use strict";

const DevConsole = (function () {
  let isOpen = false;
  let isCapturing = true;
  let isErrShielded = false;
  let currentTab = 'capture'; 
  let dom = {};
  let isAvailable = false;

  // ✅ 内部隐蔽安全锁 (默认锁定，每次打开面板都会重新锁定)
  let isLocked = true;

  const COMMANDS = {};
  
  // ✅ 危险指令黑名单：未解锁时直接拒绝
  const DANGEROUS_COMMANDS = ['resetdata', 'block', 'unblock', 'crash', 'stopai', 'noclip'];

  // 记录被热拦截的函数及其原版，用于热恢复
  const hotBlockedBackup = {}; 
  const HOT_BLOCK_MAP = {
    'shooting': ['fireWeapon', 'startReload', 'switchWeapon', 'cycleWeapon'],
    'audio': ['SFX'],
    'enemy_ai': ['updateEnemy', 'damageEnemy'],
    'player_update': ['updatePlayer'],
    'hud': ['updateVitalsUI', 'updateAmmoUI', 'updateCrosshair'],
    'flow': ['startGame', 'endGame', 'restart', 'resetWorldState'],
    'grenade': ['toggleGrenade', 'throwGrenade', 'updateGrenades'],
    'main': ['frame']
  };

  // --- 1. 样式注入 ---
  function injectStyles() {
    if (document.getElementById('devConsoleStyles')) return;
    const style = document.createElement('style');
    style.id = 'devConsoleStyles';
    style.textContent = `
      #dcToggleBtn {
        position: fixed; left: 10px; top: 190px; z-index: 2147483646;
        background: rgba(8, 10, 14, 0.85); border: 1px solid #ffb340;
        color: #ffb340; font-family: monospace; font-size: 12px;
        padding: 8px 14px; border-radius: 4px; cursor: pointer;
        display: none; user-select: none; font-weight: bold;
        pointer-events: auto; backdrop-filter: blur(4px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.5); touch-action: none;
      }
      #dcToggleBtn.show { display: block; }
      #dcToggleBtn:active { transform: scale(0.95); }
      body.touch #dcToggleBtn { top: 100px; left: 8px; }

      #devConsole {
        position: fixed; bottom: 0; left: 0; width: 100vw;
        height: 40vh; max-height: 400px;
        background: rgba(8, 10, 14, 0.95); backdrop-filter: blur(10px);
        border-top: 2px solid #ffb340; z-index: 2147483647;
        display: flex; flex-direction: column;
        font-family: ui-monospace, Consolas, monospace; font-size: 12px;
        transform: translateY(100%); transition: transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1);
        pointer-events: auto; color: #dfe6ec;
        box-shadow: 0 -10px 30px rgba(0,0,0,0.8);
      }
      #devConsole.show { transform: translateY(0); }

      .dc-head {
        display: flex; justify-content: space-between; align-items: center;
        padding: 4px 12px; background: rgba(255, 179, 64, 0.15);
        border-bottom: 1px solid rgba(255, 179, 64, 0.3); user-select: none;
      }
      .dc-title { font-weight: 800; color: #ffb340; letter-spacing: 1px; font-size: 11px; margin-right: 15px;}
      
      .dc-tabs { display: flex; gap: 5px; margin-right: auto; }
      .dc-tab {
        background: transparent; border: 1px solid transparent; color: rgba(255,255,255,0.5);
        padding: 4px 10px; border-radius: 3px; font-size: 11px; font-family: inherit; cursor: pointer;
      }
      .dc-tab.on { color: #fff; border-color: rgba(255,179,64,0.5); background: rgba(255,179,64,0.1); }

      .dc-tools { display: flex; gap: 8px; align-items: center; }
      .dc-btn {
        background: transparent; border: 1px solid rgba(255,255,255,0.2);
        color: #dfe6ec; cursor: pointer; padding: 4px 10px; border-radius: 3px;
        font-size: 10px; font-family: inherit; touch-action: manipulation;
      }
      .dc-btn:hover { background: rgba(255,255,255,0.1); }
      .dc-btn.on { border-color: #7ee081; color: #7ee081; background: rgba(126,224,129,0.1); }
      .dc-btn.close-btn { 
        border-color: rgba(255,59,48,0.8); color: #ff3b30; font-weight: bold; 
        padding: 6px 18px; font-size: 14px; margin-left: 10px; border-radius: 4px;
      }
      .dc-btn.close-btn:active { background: rgba(255,59,48,0.2); }

      .dc-logs {
        flex: 1; overflow-y: auto; padding: 8px 12px; line-height: 1.4;
        scrollbar-width: thin; scrollbar-color: #ffb340 transparent;
        touch-action: pan-y !important;
        -webkit-overflow-scrolling: touch;
      }
      .dc-logs::-webkit-scrollbar { width: 6px; }
      .dc-logs::-webkit-scrollbar-thumb { background: rgba(255,179,64,0.4); }
      
      .dc-line { margin-bottom: 2px; word-break: break-all; }
      .dc-line.info { color: #dfe6ec; }
      .dc-line.success { color: #7ee081; }
      .dc-line.error { color: #ff3b30; }
      .dc-line.warn { color: #ffb340; }

      .dc-input-row {
        display: flex; border-top: 1px solid rgba(255,255,255,0.1);
        background: rgba(0,0,0,0.6); padding: 4px 12px; align-items: center;
        padding-bottom: max(4px, env(safe-area-inset-bottom, 4px));
        touch-action: manipulation;
      }
      .dc-prefix { color: #ffb340; font-weight: bold; margin-right: 10px; }
      .dc-input {
        flex: 1; background: transparent; border: none; outline: none;
        color: #fff; font-family: inherit; font-size: 13px; padding: 6px 0;
        touch-action: auto !important;
      }
      .dc-input::placeholder { color: rgba(255,255,255,0.2); }

      body.touch #devConsole { height: 50vh; font-size: 11px; }
      body.touch .dc-input { font-size: 16px; }
    `;
    document.head.appendChild(style);
  }

  // --- 2. DOM 构建 ---
  function initDOM() {
    injectStyles();
    
    let btn = document.getElementById('dcToggleBtn');
    if (!btn) {
      btn = document.createElement('div');
      btn.id = 'dcToggleBtn';
      btn.setAttribute('data-ui', '1');
      btn.innerHTML = '>_ DEV';
      btn.addEventListener('mousedown', (e) => { e.stopPropagation(); });
      btn.addEventListener('touchstart', (e) => { e.stopPropagation(); e.preventDefault(); toggle(); }, { passive: false });
      btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
      document.body.appendChild(btn);
    }

    let el = document.getElementById('devConsole');
    if (!el) {
      el = document.createElement('div');
      el.id = 'devConsole';
      el.setAttribute('data-ui', '1');
      el.innerHTML = `
        <div class="dc-head">
          <span class="dc-title">DEV CONSOLE</span>
          <div class="dc-tabs">
            <button class="dc-tab on" id="dcTabCapture">日志本</button>
            <button class="dc-tab" id="dcTabCommand">指令本</button>
          </div>
          <div class="dc-tools">
            <button class="dc-btn on" id="dcCaptureBtn">监听: ON</button>
            <button class="dc-btn" id="dcShieldBtn">屏蔽报错</button>
            <button class="dc-btn" id="dcClearBtn">清空</button>
            <button class="dc-btn close-btn" id="dcCloseBtn">✕</button>
          </div>
        </div>
        
        <div class="dc-logs-container" style="flex:1; position:relative; display:flex; overflow:hidden;">
          <div class="dc-logs" id="dcCaptureLogs" style="width:100%;"></div>
          <div class="dc-logs" id="dcCommandLogs" style="width:100%; display:none;"></div>
        </div>

        <div class="dc-input-row">
          <span class="dc-prefix">&gt;</span>
          <input type="text" id="dcInput" class="dc-input" autocomplete="off" spellcheck="false" placeholder="输入指令... (help 查看列表)">
        </div>
      `;
      document.body.appendChild(el);
    }

    dom = {
      el,
      toggleBtn: btn,
      tabCapture: el.querySelector('#dcTabCapture'),
      tabCommand: el.querySelector('#dcTabCommand'),
      logsCapture: el.querySelector('#dcCaptureLogs'),
      logsCommand: el.querySelector('#dcCommandLogs'),
      input: el.querySelector('#dcInput'),
      captureBtn: el.querySelector('#dcCaptureBtn'),
      shieldBtn: el.querySelector('#dcShieldBtn'),
      clearBtn: el.querySelector('#dcClearBtn'),
      closeBtn: el.querySelector('#dcCloseBtn')
    };

    dom.tabCapture.addEventListener('click', () => switchTab('capture'));
    dom.tabCommand.addEventListener('click', () => switchTab('command'));
    dom.captureBtn.addEventListener('click', toggleCapture);
    dom.shieldBtn.addEventListener('click', toggleShield);
    
    dom.clearBtn.addEventListener('click', () => {
      if (currentTab === 'capture') dom.logsCapture.innerHTML = '';
      else dom.logsCommand.innerHTML = '';
    });
    
    dom.closeBtn.addEventListener('click', (e) => { e.stopPropagation(); hide(); });
    dom.closeBtn.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); hide(); }, { passive: false });

    dom.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const cmd = dom.input.value.trim();
        dom.input.value = '';
        if (cmd) execute(cmd);
      }
    });

    dom.el.addEventListener('mousedown', e => e.stopPropagation());
    dom.el.addEventListener('touchstart', e => e.stopPropagation(), { passive: false });
    dom.el.addEventListener('touchmove', e => e.stopPropagation(), { passive: false });
    dom.el.addEventListener('touchend', e => e.stopPropagation(), { passive: false });

    registerCommands();
    bindGlobalEvents();
  }

  // --- 3. 双核日志输出 ---
  function switchTab(tab) {
    currentTab = tab;
    dom.tabCapture.classList.toggle('on', tab === 'capture');
    dom.tabCommand.classList.toggle('on', tab === 'command');
    dom.logsCapture.style.display = (tab === 'capture') ? 'block' : 'none';
    dom.logsCommand.style.display = (tab === 'command') ? 'block' : 'none';
  }

  function appendLog(container, text, type) {
    if (!container) return;
    if (type === 'error' && container.lastChild && container.lastChild.textContent === text) return;
    
    const line = document.createElement('div');
    line.className = `dc-line ${type}`;
    line.textContent = text;
    container.appendChild(line);
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 40;
    if (isAtBottom) container.scrollTop = container.scrollHeight;
    if (container.children.length > 200) container.removeChild(container.firstChild);
  }

  function logCapture(text, type = 'info') { appendLog(dom.logsCapture, text, type); }
  function logCommand(text, type = 'info') { appendLog(dom.logsCommand, text, type); }

  // --- 4. 指令解析与隐蔽安全锁 ---
  function execute(cmdStr) {
    switchTab('command');
    logCommand(`> ${cmdStr}`, 'warn');
    
    const args = cmdStr.split(' ');
    const cmd = args[0].toLowerCase();
    
    // ✅ 隐蔽安全拦截：只拦截危险指令
    if (isLocked && DANGEROUS_COMMANDS.includes(cmd)) {
      logCommand(`[拒绝] 您的权限拒绝执行危险指令！`, 'error');
      return;
    }
    
    if (COMMANDS[cmd]) {
      try { COMMANDS[cmd](args.slice(1)); } catch (err) { logCommand(`[失败] ${err.message}`, 'error'); }
    } else {
      logCommand(`[错误] 未知指令: ${cmd}`, 'error');
    }
  }

  // --- 5. 热拦截与热恢复逻辑 ---
  function applyHotBlock(moduleName) {
    const fns = HOT_BLOCK_MAP[moduleName];
    if (!fns) return logCommand(`[失败] 未知模块: ${moduleName}`, 'error');
    
    let count = 0;
    for (const fn of fns) {
      if (typeof window[fn] === 'function' && !hotBlockedBackup[fn]) {
        hotBlockedBackup[fn] = window[fn]; 
        window[fn] = function() {
          console.warn(`[拦截] 模块 ${fn} 已被热拦截`);
        };
        count++;
      }
    }
    
    if (count > 0) {
      logCommand(`[成功] ${moduleName} 已热拦截（防死锁）。点顶部【强心针】恢复。`, 'success');
    } else {
      logCommand(`[失败] 不在全局或已被拦截`, 'error');
    }
  }

  function restoreAllHotBlocks() {
    let count = 0;
    for (const fn in hotBlockedBackup) {
      if (typeof hotBlockedBackup[fn] === 'function') {
        window[fn] = hotBlockedBackup[fn]; // 强行塞回全局
        count++;
      }
      delete hotBlockedBackup[fn];
    }
    
    if (typeof G !== 'undefined') {
      G.paused = false;
      G.running = true;
      G.over = false;
      G.introLock = false;
      const pauseEl = document.getElementById('pause');
      if (pauseEl) pauseEl.classList.remove('on');
    }
    
    if (typeof frame === 'function') {
      try { requestAnimationFrame(frame); } catch(e){}
    }

    const errBox = document.getElementById('err');
    if (errBox) { errBox.style.display = 'none'; errBox.textContent = ''; }

    logCommand(`[成功] 已恢复 ${count} 个函数并唤醒主循环。`, 'success');
  }

  function registerCommands() {
    // help 只展示安全的指令
    COMMANDS['help'] = () => {
      logCommand(`=== 指令列表 ===`, 'warn');
      logCommand(`gold / heal / spawn / killall / wave / godmode / infammo / reset`);
      logCommand(`请输入合法指令进行操作。`);
    };

    // ✅ 隐藏的解锁指令
    COMMANDS['unlock'] = () => {
      if (!isLocked) return logCommand(`[提示] 权限已开放，请勿重复操作。`, 'info');
      isLocked = false;
      logCommand(`[系统] 权限验证通过，危险指令已解锁。`, 'success');
    };

    // ✅ 隐藏的终极恢复出厂指令
    COMMANDS['resetdata'] = () => {
      logCommand(`[系统] 正在清空所有本地缓存并恢复出厂设置...`, 'warn');
      localStorage.clear();
      setTimeout(() => { location.reload(); }, 500);
    };

    // ✅ 隐藏的热恢复指令
    COMMANDS['restore'] = () => {
      restoreAllHotBlocks();
    };

    COMMANDS['gold'] = (args) => {
      const amt = parseInt(args[0]);
      if (isNaN(amt)) return logCommand('[失败] 请输入正确数字', 'error');
      if (typeof G !== 'undefined') { G.gold += amt; if (typeof updateWaveUI === 'function') updateWaveUI(); logCommand(`[成功] 金币+${amt}`, 'success'); }
    };
    
    COMMANDS['heal'] = () => {
      if (typeof player !== 'undefined') { player.hp = player.maxHp; player.armor = player.maxArmor; if (typeof updateVitalsUI === 'function') updateVitalsUI(); logCommand(`[成功] 状态已恢复`, 'success'); }
    };
    
    COMMANDS['spawn'] = (args) => {
      const cnt = parseInt(args[0]) || 1;
      if (typeof spawnEnemies === 'function') { spawnEnemies(cnt, ENEMY_HP_MAX, 1, G.wave); logCommand(`[成功] 刷出 ${cnt} 个敌人`, 'success'); }
    };
    
    COMMANDS['killall'] = () => {
      if (typeof enemies !== 'undefined') {
        let n = 0; for (const e of enemies) { if (!e.dead) { e.hp = 0; e.dead = true; e.state = 3; if(e.tag) e.tag.sprite.visible = false; n++; } }
        if (typeof rebuildHitMeshes === 'function') rebuildHitMeshes(); logCommand(`[成功] 击杀 ${n} 个敌人`, 'success');
      }
    };
    
    COMMANDS['wave'] = (args) => { if (typeof startWave === 'function') { startWave(parseInt(args[0])); logCommand(`[成功] 跳转波次`, 'success'); } };
    COMMANDS['godmode'] = () => { if (typeof SET !== 'undefined') { SET.godMode = !SET.godMode; logCommand(`[成功] 无敌: ${SET.godMode ? '开' : '关'}`, 'success'); } };
    COMMANDS['reset'] = () => { if(typeof restart === 'function'){ restart(); logCommand(`[成功] 游戏已重置`, 'success'); } };

    // ✅ 隐藏的热拦截指令
    COMMANDS['block'] = (args) => {
      if (!args[0]) return logCommand('[失败] 请指定模块名 (如: block shooting)', 'error');
      const file = args[0].toLowerCase();
      if (!HOT_BLOCK_MAP[file]) return logCommand(`[失败] 不支持该模块: ${file}`, 'error');
      applyHotBlock(file);
    };
  }

  // --- 6. 捕获与 UI 绑定 ---
  function toggleCapture() {
    isCapturing = !isCapturing;
    dom.captureBtn.classList.toggle('on', isCapturing);
    dom.captureBtn.textContent = isCapturing ? '监听: ON' : '监听: OFF';
    if (isCapturing) logCapture('[系统] 已开启后台监听', 'success');
  }

  function toggleShield() {
    isErrShielded = !isErrShielded;
    window.__hideErrUI = isErrShielded;
    dom.shieldBtn.classList.toggle('on', isErrShielded);
    logCapture(isErrShielded ? '[系统] 已屏蔽底层红字报错' : '[系统] 恢复底层报错', 'warn');
  }

  function bindGlobalEvents() {
    window.addEventListener('click', (e) => {
      if (!isCapturing) return;
      if (e.target.closest('#devConsole') || e.target.closest('#dcToggleBtn')) return;
      let desc = e.target.id ? `#${e.target.id}` : (e.target.className ? `.${String(e.target.className).split(' ')[0]}` : e.target.tagName.toLowerCase());
      logCapture(`[CLICK] 交互: ${desc}`, 'success');
    }, true);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote' || e.code === 'F8' || e.key === '`' || e.key === '~') {
        if (isAvailable) {
          e.preventDefault(); e.stopPropagation();
          if (document.activeElement !== dom.input) toggle();
        }
      } else if (e.code === 'Escape' && isOpen) {
        hide();
      }
      if (isCapturing && document.activeElement !== dom.input) {
        logCapture(`[KEY] ${e.code} (按下)`, 'info');
      }
    }, true);

    window.addEventListener('error', (e) => { 
      if (isCapturing) logCapture(`[ERROR] ${e.message}`, 'error'); 
    });
    
    window.addEventListener('unhandledrejection', (e) => { 
      if (isCapturing) logCapture(`[PROMISE] ${e.reason}`, 'error'); 
    });
  }

  function show() {
    if (!dom.el) initDOM();
    isOpen = true;
    
    // ✅ 每次打开面板，重新锁定安全模式
    isLocked = true;
    
    dom.el.classList.add('show');
    if (dom.toggleBtn) dom.toggleBtn.classList.remove('show');
    setTimeout(() => { if (dom.input) dom.input.focus(); }, 250);
  }

  function hide() {
    if (!dom.el) return;
    isOpen = false;
    dom.el.classList.remove('show');
    if (dom.input) dom.input.blur();
    if (isAvailable && dom.toggleBtn) dom.toggleBtn.classList.add('show');
  }

  function toggle() { if (isOpen) hide(); else show(); }

  function setAvailable(avail) {
    isAvailable = avail;
    if (!dom.el) initDOM();
    if (avail) {
      if (dom.toggleBtn) dom.toggleBtn.classList.add('show');
      show();
      if(dom.logsCapture.children.length === 0) logCapture('[系统] 控制台就绪。', 'success');
    } else {
      if (dom.toggleBtn) dom.toggleBtn.classList.remove('show');
      hide();
    }
  }

  window.logToConsole = logCapture;
  window.addEventListener('DOMContentLoaded', initDOM);

  return { logCapture, logCommand, show, hide, toggle, setAvailable };
})();