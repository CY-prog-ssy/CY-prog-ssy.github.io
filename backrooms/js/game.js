'use strict';
// ============================================================
//  主程序：状态机、玩家、HUD、主循环
// ============================================================

const $ = (id) => document.getElementById(id);
const SETTINGS_KEY = 'backrooms.settings.v1';
const PROGRESS_KEY = 'backrooms.progress.v1';
const QUALITY_SCALE = [0.5, 0.75, 1.0];

const CHUNK_ORDER = [];
for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) CHUNK_ORDER.push([dx, dz]);
CHUNK_ORDER.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]));

const DEATH_TEXT = {
  smiler: ['它在笑。', '你移开了视线，哪怕只有一瞬间。\n黑暗中的那张笑脸，现在离你只有一寸。'],
  hound: ['你被找到了。', '它听见了你的脚步声。\n在后室里，奔跑是一种奢侈。'],
  stalker: ['光引来了它。', '你的手电筒像灯塔一样照亮了自己。\n它现在穿着你的脸，继续在管道间游荡。'],
  chaser: ['你停下了。', '在 LEVEL ! 里，停下就意味着结束。'],
  wretch: ['它听见你了。', '黑暗里那阵沉重的喘息，最后一次贴到了你的耳边。\n它看不见你——它根本不需要看见。'],
  mother: ['她找到你了。', '那个声音一直在你耳边——\n轻得你根本没有注意到。'],
  partygoer: ['派对开始了。', '它笑着拉住了你的手。\n那张海报上的邀请，现在轮到你来写了。'],
  tide: ['潮水来了。', '你没能在涨潮之前离开。\n海水漫过脚踝、膝盖、胸口——那不是水。一张张泡胀的脸贴了上来，一起念着同一句话。\n现在，你也存在于此了。'],
  insanity: ['理智崩溃', '嗡鸣声钻进了你的脑子，再也出不去了。\n你坐在潮湿的地毯上，开始对着墙纸微笑。'],
};

// Level 6：各区域的视野 [雾密度, 环境光]，以及 LiDAR 参数
const LO_VIEW = { 1: [0.13, 0.008], 2: [0.09, 0.02], 3: [0.028, 0], 4: [0.09, 0.02], 5: [0.07, 0.03] };
const LIDAR_MAX = 3200, LIDAR_RAYS = 14, LIDAR_RANGE = 22, LIDAR_LIFE = 9;

// Level 3 剧情电站的文本
const PLANT_NOTES = {
  console: '如果你看到了这条记录，说明你也被困在这里了。\n\n' +
    '电梯是唯一的出口，可它接在主电网上，而主电网已经断了。\n' +
    '三台发电机分别在 A（西）、B（东）、C（北）三个分区。全部启动之后，再回这里合上西墙上的总闸，电梯才会通电。\n\n' +
    'A 区的闸门要刷卡。钥匙卡我留在南边值班室的桌上。\n' +
    'B、C 两区是电动闸门，前一台发电机转起来，下一道闸门就会通电。\n\n' +
    '发电机的声音很大。它们会听见的。别跑。\n—— K.',
  A: 'A 区巡检记录\n\n' +
    '2 号发电机（B 区）的保险丝又烧了，备用的放在 B 区东北角的仓库里。\n' +
    '另：有人在走廊里看见“猎犬”。它们记得人走过的路——蹲下，慢慢走。',
  C: '……我启动了第三台。它们全都醒了。\n\n' +
    '我躲在这个仓库里，听着爪子一遍遍刮过铁栅栏。\n' +
    '总闸就在控制室西墙，离这里只有两条走廊。\n' +
    '如果我没能回去——替我把它合上。\n—— K.',
};
const PLANT_PROMPTS = {
  console: '[E] 查看值班终端', note: '[E] 阅读纸条', key: '[E] 拿起钥匙卡', fuse: '[E] 拿起保险丝',
  panel: '[E] 操作闸门面板', switch: '[E] 拉下总闸',
};

// Level Fun =) 剧情版的文本
const PARTY_NOTES = {
  invite: '亲爱的客人：\n\n' +
    '欢迎登上 SS Fun =)！派对永远不会结束，我们为你准备了最好的房间。\n' +
    '请到北边的宴会厅来——蛋糕已经切好了。船长室的钥匙就放在蛋糕旁边，是送给你的小礼物。\n\n' +
    '我们都很期待见到你。 =)\n\n' +
    '（请柬背面有人用铅笔潦草地写着：别碰带笑脸的海报。钥匙一拿走，它们就会出来。）',
  log: '航海日志 · 最后一页\n\n' +
    '这艘船原本叫“冒险号”。那晚的派对之后，船名就被涂掉了。\n' +
    '它们靠广播里的音乐把整层甲板锁在一起——只要音乐还在放，舞台后面那扇门就永远打不开。\n\n' +
    '广播开关就在这间屋子的东墙上。关掉它，后台的门锁会松开。\n' +
    '后台墙上有一张字是反的海报。碰它。那是这艘船上唯一不属于派对的东西。\n\n' +
    '音乐一停，它们会发疯。跑。\n—— 船长',
};
const PARTY_PROMPTS = { invite: '[E] 阅读请柬', key: '[E] 拿起钥匙', log: '[E] 阅读航海日志', radio: '[E] 关掉派对广播' };

class Game {
  constructor() {
    this.canvas = $('gl');
    this.scare = $('scare');
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch (e) { saved = {}; }
    this.settings = Object.assign({ sens: 1, vol: 0.8, quality: 1, fov: 75, guide: true,
      touch: 'auto', touchSens: 1, touchOpacity: 0.75, resolution: 'auto', diff: 1 }, saved);
    for (const [key, min, max, fallback] of [['sens', 0.2, 3, 1], ['vol', 0, 1, 0.8], ['quality', 0, 2, 1],
      ['fov', 60, 100, 75], ['touchSens', 0.2, 3, 1], ['touchOpacity', 0.35, 1, 0.75]]) {
      const value = Number(this.settings[key]);
      this.settings[key] = Number.isFinite(value) ? clamp(value, min, max) : fallback;
    }
    this.settings.quality = Math.round(this.settings.quality);
    this.settings.diff = clamp(Math.round(Number(this.settings.diff) || 0), 0, 2);
    if (!['auto', 'on', 'off'].includes(this.settings.touch)) this.settings.touch = 'auto';
    if (!['auto', 'battery', 'sharp'].includes(this.settings.resolution)) this.settings.resolution = 'auto';
    this.progress = 0;
    try { this.progress = parseInt(localStorage.getItem(PROGRESS_KEY) || '0', 10) || 0; } catch (e) { /* Private browsing can disable storage. */ }
    this.sound = new Sound();
    this.sound.vol = this.settings.vol;
    this.keys = {};
    this.state = 'loading';
    this.time = 0;
    this.levelTime = 0;
    this.runTime = 0;
    this.stats = { deaths: 0, almond: 0 };
    this.view = Mat4.create();
    this.proj = Mat4.create();
    this.vp = Mat4.create();
    this.fwd = [0, 0, -1];
    this.flDir = [0, 0, -1];
    this.camY = 1.6;
    this.curFov = this.settings.fov;
    this.dyn = new MeshBuilder(8192);
    this.nearLights = [];
    this.sprites = [];
    this.lightCount = 0;
    this.fade = 1;
    this.glitch = 0;
    this.hurt = 0;
    this.shakeAmt = 0;
    this.ins = 0;
    this.globalFlicker = 1; this.gfTimer = 2; this.gfDur = 0;
    this.power = 1; this.boState = 0; this.boTimer = Infinity;
    this.steam = [];
    this.sparks = [];
    this.floorY = 0; this.underwater = 0; this.submergeTime = 0; this.wireCool = 0;
    this.slideRide = null;
    this.splash = 0;
    this.visDist = 34;
    this.playerNoise = 0;
    this.player = this.newPlayer();
    this.levelIdx = 0;
    this.level = LEVELS[0];
    this.world = null;
    this.entity = null;
    this.focus = null;
    this.mode = 'survival';
    this.pendingMode = 'survival';
    this.pendingMonster = 'hound';
    this.selectedMonster = 'hound';
    this.gim = null;
    this.hunt = null;
    this.humans = null;
    this.hudCache = {};
    this.last = performance.now() / 1000;
  }

  newPlayer() {
    return {
      x: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vz: 0,
      bob: 0, bobAmt: 0, stepIdx: 0, crouch: 0, speed: 0,
      sanity: 100, stamina: 100, exhausted: false, staminaDelay: 0, sprinting: false,
      battery: 100, flash: false, almond: 0, batteries: 1,
      light: 1, lightSmooth: 1, glow: 2,
    };
  }

  // ---------------------------------------------------------
  //  启动
  // ---------------------------------------------------------
  boot() {
    try {
      this.renderer = new Renderer(this.canvas);
    } catch (e) {
      showError(e.message);
      return;
    }
    this.controls = new TouchControls(this);
    this.applyDisplaySettings();
    setTimeout(() => {
      const t0 = performance.now();
      const layers = buildTextureLayers();
      this.renderer.initTextures(layers);
      console.log('纹理生成耗时', Math.round(performance.now() - t0), 'ms');
      this.bindUI();
      this.bindInput();
      this.enterTitle();
      $('loading').classList.add('hidden');
      $('menu').classList.remove('hidden');
      requestAnimationFrame((t) => this.frame(t));
    }, 30);
    const resize = () => {
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = requestAnimationFrame(() => {
        this.renderer.resize();
        if (this.world && this.state !== 'loading') this.render(0);
      });
    };
    window.addEventListener('resize', resize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
    document.addEventListener('fullscreenchange', () => { this.updateFullscreenButtons(); resize(); });
    document.addEventListener('webkitfullscreenchange', () => { this.updateFullscreenButtons(); resize(); });
  }

  bindUI() {
    const S = this.settings;
    const sens = $('s-sens'), vol = $('s-vol'), fov = $('s-fov'), q = $('s-quality'), guide = $('s-guide');
    const save = () => this.saveSettings();
    guide.checked = !!S.guide;
    guide.onchange = () => { S.guide = guide.checked; save(); };
    const stealth = $('s-stealth');
    stealth.checked = !!S.stealth;
    stealth.onchange = () => { S.stealth = stealth.checked; save(); };
    sens.value = S.sens; vol.value = S.vol; fov.value = S.fov; q.value = S.quality;
    const output = () => {
      $('v-sens').textContent = S.sens.toFixed(2);
      $('v-vol').textContent = Math.round(S.vol * 100) + '%';
      $('v-fov').textContent = S.fov + '°';
      $('v-touch-sens').textContent = S.touchSens.toFixed(2);
      $('v-touch-opacity').textContent = Math.round(S.touchOpacity * 100) + '%';
    };
    sens.oninput = () => { S.sens = parseFloat(sens.value); output(); save(); };
    vol.oninput = () => { S.vol = parseFloat(vol.value); this.sound.setVolume(S.vol); output(); save(); };
    fov.oninput = () => { S.fov = parseFloat(fov.value); output(); save(); };
    q.onchange = () => {
      S.quality = parseInt(q.value, 10);
      this.applyDisplaySettings();
      save();
    };
    const diffSel = $('s-diff');
    if (diffSel) {
      diffSel.value = String(S.diff);
      diffSel.onchange = () => {
        S.diff = clamp(parseInt(diffSel.value, 10) || 0, 0, 2);
        save();
        this.notice('难度：' + ['轻松 · 探索', '标准', '紧张 · 猎杀'][S.diff] + '（下一层生效）');
      };
    }
    $('s-resolution').value = S.resolution;
    $('s-resolution').onchange = () => { S.resolution = $('s-resolution').value; this.applyDisplaySettings(); save(); };
    $('s-touch').value = S.touch;
    $('s-touch').onchange = () => { S.touch = $('s-touch').value; this.controls.refresh(); this.applyDisplaySettings(); save(); };
    $('s-touch-sens').value = S.touchSens;
    $('s-touch-sens').oninput = () => { S.touchSens = Number($('s-touch-sens').value); output(); save(); };
    $('s-touch-opacity').value = S.touchOpacity;
    $('s-touch-opacity').oninput = () => { S.touchOpacity = Number($('s-touch-opacity').value); this.controls.refresh(); output(); save(); };
    output();
    $('btn-settings').onclick = () => this.openSettings();
    $('btn-pause-settings').onclick = () => this.openSettings();
    $('btn-settings-close').onclick = () => this.closeSettings();
    $('btn-game-pause').onclick = () => this.pause();
    const gate = $('gate-fullscreen');
    if (gate) gate.onclick = () => this.enterLandscape();
    for (const button of document.querySelectorAll('[data-fullscreen]')) button.onclick = () => this.toggleFullscreen();
    this.updateFullscreenButtons();
    $('btn-new').onclick = () => this.openLevelSelect('survival');
    const huntBtn = $('btn-hunt');
    if (huntBtn) huntBtn.onclick = () => this.openHuntSelect();
    const huntBack = $('btn-hunt-back');
    if (huntBack) huntBack.onclick = () => this.enterTitle();
    const huntNext = $('btn-hunt-next');
    if (huntNext) huntNext.onclick = () => {
      this.pendingMonster = this.selectedMonster || 'hound';
      this.openLevelSelect('hunt');
    };
    this.buildHuntSelect();
    $('btn-select-back').onclick = () => this.closeLevelSelect();
    $('btn-select-enter').onclick = () => {
      if (this.pendingMode === 'hunt') this.newHuntGame(this.selectedLevel || 0);
      else this.newGame(this.selectedLevel || 0);
    };
    $('btn-resume').onclick = () => this.requestLock();
    $('btn-quit').onclick = () => this.enterTitle();
    $('btn-retry').onclick = () => { this.sound.init(); this.loadLevel(this.levelIdx, true); };
    $('btn-dead-quit').onclick = () => this.enterTitle();
    $('btn-end').onclick = () => this.enterTitle();
    $('card').onclick = () => { this.sound.init(); this.requestLock(); };
    this.buildLevelSelect();
  }

  saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); }
    catch (e) { this.notice('浏览器未允许保存设置，本次游玩仍会使用当前设置。'); }
  }

  applyDisplaySettings() {
    if (!this.renderer) return;
    const R = this.renderer, S = this.settings;
    const mobile = this.controls ? this.controls.enabled : window.matchMedia('(pointer: coarse)').matches;
    R.scale = QUALITY_SCALE[S.quality];
    R.bloom = S.quality > 0;
    R.dprLimit = S.resolution === 'battery' ? 1.5 : 3;
    R.maxPixels = S.resolution === 'battery' ? 1280 * 720 : S.resolution === 'sharp' ? 3200 * 1440
      : mobile ? 1920 * 1080 : 2560 * 1440;
    R.resize();
  }

  openSettings() {
    if (this.state === 'playing') this.pause();
    this.settingsReturn = this.state === 'paused' ? 'pause' : 'title';
    this.showScreen('settings-screen');
    $('btn-settings-close').focus();
  }

  closeSettings() {
    const target = this.settingsReturn || 'title';
    this.showScreen(target);
    $(target === 'pause' ? 'btn-pause-settings' : 'btn-settings').focus();
  }

  notice(text) {
    clearTimeout(this.noticeTimer);
    $('ui-toast').textContent = text;
    $('ui-toast').classList.remove('hidden');
    this.noticeTimer = setTimeout(() => $('ui-toast').classList.add('hidden'), 4500);
  }

  updateFullscreenButtons() {
    const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
    for (const button of document.querySelectorAll('[data-fullscreen]')) {
      button.textContent = active ? '退出全屏' : button.id === 'btn-fullscreen' ? '进入全屏' : '全屏';
      button.setAttribute('aria-label', active ? '退出全屏' : '进入全屏');
      button.setAttribute('aria-pressed', String(active));
    }
  }

  async toggleFullscreen() {
    if (this.fullscreenBusy) return;
    this.fullscreenBusy = true;
    this.controls.reset();
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) await exit.call(document);
        if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
      } else {
        const root = document.documentElement;
        const enter = root.requestFullscreen || root.webkitRequestFullscreen;
        if (!enter) { this.notice('此浏览器暂不支持网页全屏。可手动横屏，或添加到主屏幕后游玩。'); return; }
        await enter.call(root);
        if (this.controls.enabled) await this.lockLandscape();
      }
    } catch (e) { this.notice('未能进入全屏。可以继续游玩，或在浏览器菜单中尝试全屏。'); }
    finally { this.fullscreenBusy = false; this.updateFullscreenButtons(); }
  }

  // 手机端：请求全屏并尝试把屏幕方向锁到横屏。
  // 浏览器只在用户手势里允许全屏，所以这里必须由点击/触摸触发。
  async lockLandscape() {
    if (!screen.orientation || !screen.orientation.lock) return false;
    try { await screen.orientation.lock('landscape'); return true; }
    catch (e) { return false; }
  }

  async enterLandscape() {
    this.sound.init();
    if (this.fullscreenBusy) return;
    const root = document.documentElement;
    const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (!active) {
      const enter = root.requestFullscreen || root.webkitRequestFullscreen;
      if (!enter) { this.notice('此浏览器不支持网页全屏。请手动把手机横过来使用。'); return; }
      this.fullscreenBusy = true;
      try { await enter.call(root); }
      catch (e) { this.fullscreenBusy = false; this.notice('未能进入全屏。请手动把手机横过来使用。'); return; }
      this.fullscreenBusy = false;
      this.updateFullscreenButtons();
    }
    await this.lockLandscape();
  }

  // 触屏设备上从竖屏进入游戏时，自动尝试一次全屏横屏。
  autoLandscapeOnce() {
    if (this.landscapeTried) return;
    if (!this.controls || !this.controls.enabled) return;
    if (document.fullscreenElement || document.webkitFullscreenElement) { this.landscapeTried = true; return; }
    this.landscapeTried = true;
    this.enterLandscape();
  }

  performAction(action) {
    if (this.state !== 'playing') return;
    switch (action) {
      case 'flash': this.toggleFlash(); break;
      case 'interact': if (this.noteSrc) this.hideNote(); else this.interact(); break;
      case 'map': if (this.mapBase) this.setBigMap(!this.bigMap); break;
      case 'drink': this.drink(); break;
      case 'battery': this.changeBattery(); break;
      case 'glow': if (this.gim) this.gim.throwGlow(); break;
      case 'lunge': if (this.hunt) this.hunt.lunge(); break;
      case 'ability': if (this.hunt) this.hunt.ability(); break;
    }
  }

  buildLevelSelect() {
    this.levelPreviews = new Map();
    this.previewFailures = new Set();
    this.levelButtons = [];
    const box = $('level-grid');
    box.replaceChildren();
    for (let i = 0; i < LEVELS.length; i++) {
      const L = LEVELS[i];
      const b = document.createElement('button');
      b.className = 'level-option';
      b.setAttribute('aria-pressed', 'false');
      b.innerHTML = '<span class="level-thumb"><img alt=""><span class="level-thumb-label"></span></span>' +
        '<span class="level-option-copy"><strong></strong><small></small></span>';
      b.querySelector('.level-thumb-label').textContent = L.name;
      b.querySelector('strong').textContent = L.title;
      b.querySelector('small').textContent = L.sub;
      b.onclick = () => this.selectLevel(i);
      box.appendChild(b);
      this.levelButtons.push(b);
    }
  }

  openLevelSelect(mode) {
    this.pendingMode = mode || 'survival';
    $('select-heading').textContent = this.pendingMode === 'hunt' ? '选择猎场' : '选择层级';
    $('btn-select-enter').textContent = this.pendingMode === 'hunt' ? '进入猎场' : '进入此层级';
    this.showScreen('level-select');
    this.selectLevel(this.selectedLevel || 0);
    this.levelButtons[this.selectedLevel].focus();
    this.queueLevelPreview();
  }

  closeLevelSelect() {
    if (this.pendingMode === 'hunt') { this.showScreen('hunt-select'); return; }
    this.showScreen('title');
    $('btn-new').focus();
  }

  // ---- 猎杀模式：怪物选择 ----
  buildHuntSelect() {
    const grid = $('monster-grid');
    if (!grid || typeof HUNT_MONSTERS === 'undefined') return;
    grid.replaceChildren();
    for (const id of Object.keys(HUNT_MONSTERS)) {
      const m = HUNT_MONSTERS[id];
      const b = document.createElement('button');
      b.className = 'monster-card' + (id === this.selectedMonster ? ' on' : '');
      b.type = 'button';
      b.dataset.id = id;
      b.innerHTML = '<div class="mc-head"><strong></strong><em></em></div><p></p>' +
        '<div class="mc-abil"><span>Q</span><b></b><small></small></div>';
      b.querySelector('strong').textContent = m.name;
      b.querySelector('em').textContent = m.en;
      b.querySelector('p').textContent = m.desc;
      b.querySelector('.mc-abil b').textContent = m.abil.name;
      b.querySelector('.mc-abil small').textContent = m.abil.tip;
      b.onclick = () => {
        this.selectedMonster = id;
        for (const c of grid.children) c.classList.toggle('on', c === b);
        this.pendingMonster = id;
        this.updateHuntPreview();
      };
      grid.appendChild(b);
    }
    this.updateHuntPreview();
  }

  updateHuntPreview() {
    const m = HUNT_MONSTERS[this.selectedMonster] || HUNT_MONSTERS.hound;
    const el = $('hunt-preview');
    if (!el) return;
    el.innerHTML = '';
    const line = (k, v) => {
      const d = document.createElement('div');
      d.className = 'hp-row';
      d.innerHTML = '<span></span><b></b>';
      d.firstChild.textContent = k;
      d.lastChild.textContent = v;
      el.appendChild(d);
    };
    line('移动 / 冲刺', m.speed.toFixed(2) + ' / ' + m.sprint.toFixed(2) + ' m·s⁻¹');
    line('扑击', 'E · 向前扑出 4 米，冷却 3.6 秒');
    line('专属技能', 'Q · ' + m.abil.name + ' · 冷却 ' + m.abil.cd + ' 秒');
    line('目标', '在 5 分钟内抓住所有人类；有人逃出去就算失败');
  }

  openHuntSelect() {
    this.pendingMode = 'hunt';
    this.buildHuntSelect();
    this.showScreen('hunt-select');
    const first = $('monster-grid') && $('monster-grid').firstChild;
    if (first) first.focus();
  }

  selectLevel(idx) {
    this.selectedLevel = idx;
    const L = LEVELS[idx];
    this.levelButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === idx)));
    $('select-name').textContent = L.name;
    $('select-title').textContent = L.title;
    $('select-sub').textContent = L.sub;
    $('select-desc').textContent = L.desc;
    $('select-hint').innerHTML = L.hint;
    $('select-image').alt = L.name + ' · ' + L.title + '场景';
    const preview = this.levelPreviews.get(idx);
    if (preview) $('select-image').src = preview;
    else $('select-image').removeAttribute('src');
    $('select-image-status').textContent = this.previewFailures.has(idx) ? '场景影像暂不可用' : '正在载入场景影像……';
    $('select-image-status').classList.toggle('hidden', !!preview);
    this.queueLevelPreview();
  }

  queueLevelPreview() {
    if (this.previewTimer || $('level-select').classList.contains('hidden')) return;
    this.previewTimer = setTimeout(() => {
      this.previewTimer = null;
      if ($('level-select').classList.contains('hidden')) return;
      const missing = (i) => !this.levelPreviews.has(i) && !this.previewFailures.has(i);
      const idx = missing(this.selectedLevel) ? this.selectedLevel : LEVELS.findIndex((_, i) => missing(i));
      if (idx < 0) return;
      try {
        const preview = renderLevelPreview(LEVELS[idx], this.renderer);
        this.levelPreviews.set(idx, preview);
        this.levelButtons[idx].querySelector('img').src = preview;
      } catch (e) {
        console.warn('层级场景影像生成失败', LEVELS[idx].name, e);
        this.previewFailures.add(idx);
      }
      if (idx === this.selectedLevel) this.selectLevel(idx);
      this.queueLevelPreview();
    }, 40);
  }

  bindInput() {
    document.addEventListener('keydown', (e) => {
      if (!$('settings-screen').classList.contains('hidden')) {
        if (e.code === 'Escape') { e.preventDefault(); this.closeSettings(); }
        if (e.code === 'Tab') {
          const items = Array.from($('settings-screen').querySelectorAll('button, input, select')).filter((el) => !el.disabled && el.getClientRects().length);
          const first = items[0], last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
        return;
      }
      if (e.repeat) { if (this.state === 'playing') e.preventDefault(); return; }
      if (e.code === 'Escape' && !$('level-select').classList.contains('hidden')) {
        e.preventDefault(); this.closeLevelSelect(); return;
      }
      if (this.state === 'card' && (e.code === 'Space' || e.code === 'Enter')) {
        this.sound.init(); this.requestLock();
      }
      if (this.state !== 'playing') return;
      this.keys[e.code] = true;
      if (e.code === 'Escape') { e.preventDefault(); this.pause(); return; }
      switch (e.code) {
        case 'KeyF': this.performAction('flash'); break;
        case 'KeyE': this.performAction('interact'); break;
        case 'KeyM': this.performAction('map'); break;
        case 'KeyQ': this.performAction('drink'); break;
        case 'KeyR': this.performAction('battery'); break;
        case 'Tab': case 'Space': e.preventDefault(); break;
      }
    });
    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; if (this.state === 'playing') this.pause(); });
    document.addEventListener('mousemove', (e) => {
      if (this.state !== 'playing' || this.controls.enabled) return;
      if (e.target.closest && e.target.closest('button, input, select')) return;
      if (document.pointerLockElement !== this.canvas && !(e.buttons & 1)) return;
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return; // 指针锁定时偶发的跳变
      const s = 0.0022 * this.settings.sens;
      const P = this.player;
      P.yaw -= e.movementX * s;
      P.pitch = clamp(P.pitch - e.movementY * s, -1.45, 1.45);
    });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      if (locked && (this.state === 'card' || this.state === 'paused')) this.beginPlay();
      else if (!locked && this.state === 'playing') this.pause();
    });
    document.addEventListener('pointerlockerror', () => {
      // 无法锁定鼠标时也允许游戏（按住左键拖动视角）
      if (this.state === 'card' || this.state === 'paused') this.beginPlay();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
    this.canvas.addEventListener('click', () => {
      if (!this.controls.enabled && this.state === 'playing' && document.pointerLockElement !== this.canvas) this.requestLock();
    });
    // 触屏设备：进入游戏时自动尝试一次「全屏 + 锁定横屏」（必须有用户手势）
    document.addEventListener('pointerdown', () => {
      if (!this.landscapeTried && (this.state === 'card' || this.state === 'playing')) this.autoLandscapeOnce();
    }, true);
  }

  requestLock() {
    this.sound.resume();
    if (this.controls.enabled) { this.beginPlay(); return; }
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { if (this.state === 'card' || this.state === 'paused') this.beginPlay(); });
    } catch (e) {
      if (this.state === 'card' || this.state === 'paused') this.beginPlay();
    }
  }

  // ---------------------------------------------------------
  //  状态切换
  // ---------------------------------------------------------
  showScreen(id) {
    for (const s of ['title', 'level-select', 'hunt-select', 'settings-screen', 'card', 'pause', 'dead', 'ending']) $(s).classList.toggle('hidden', s !== id);
    $('hud').classList.toggle('hidden', id !== null);
    if (id !== null) { this.keys = {}; this.controls.reset(); }
    this.controls.update();
  }

  enterTitle() {
    if (document.pointerLockElement) document.exitPointerLock();
    this.state = 'title';
    this.mode = 'survival';
    this.pendingMode = 'survival';
    this.gim = null;
    this.hunt = null;
    this.humans = null;
    document.body.classList.remove('hunt-mode');
    const mech = $('mech');
    if (mech) mech.classList.add('hidden');
    const blink = $('blink');
    if (blink) blink.style.opacity = '0';
    this.sound.stopEntity();
    this.sound.stopBeacon();
    this.sound.stopSteam();
    this.sound.resume();
    this.power = 1; this.boState = 0; this.steam.length = 0;
    this.sparks.length = 0; this.floorY = 0; this.underwater = 0;
    this.slideRide = null;
    this.focus = null;
    this.level = LEVELS[0];
    this.world = new World(this.level, 12345);
    this.entity = null;
    this.phantom = null;
    const P = this.player;
    P.x = (this.world.start.gx + 0.5) * CELL;
    P.z = (this.world.start.gz + 0.5) * CELL;
    P.yaw = this.openYaw(P.x, P.z); P.pitch = 0.05; P.flash = false; P.sanity = 100; P.crouch = 0; P.bobAmt = 0;
    P.light = 1; P.lightSmooth = 1;
    this.renderer.clearMeshes();
    this.streamChunks(true);
    this.fade = 0; this.glitch = 0; this.hurt = 0; this.ins = 0;
    this.scare.classList.add('hidden');
    this.showScreen('title');
    if (this.sound.ctx) this.sound.setLevel(this.level);
  }

  newGame(idx) {
    this.sound.init();
    this.pendingMode = 'survival';
    this.player = this.newPlayer();
    if (idx > 0) { this.player.almond = 1; this.player.batteries = 2; }
    this.stats = { deaths: 0, almond: 0 };
    this.runTime = 0;
    this.loadLevel(idx, false);
  }

  newHuntGame(idx) {
    this.sound.init();
    this.pendingMode = 'hunt';
    this.player = this.newPlayer();
    this.stats = { deaths: 0, almond: 0 };
    this.runTime = 0;
    this.loadLevel(idx, false);
  }

  loadLevel(idx, retry) {
    this.levelIdx = idx;
    this.level = LEVELS[idx];
    const L = this.level;
    this.world = new World(L, (Math.random() * 4294967296) >>> 0);
    this.renderer.clearMeshes();
    const P = this.player;
    if (retry && this.levelStart) Object.assign(P, this.levelStart);
    else this.levelStart = { almond: P.almond, batteries: P.batteries, battery: P.battery };
    const s = this.world.start;
    P.x = (s.gx + 0.5) * CELL; P.z = (s.gz + 0.5) * CELL;
    if (L.gen === 'corridor') P.z = 7 * CELL;
    P.yaw = L.gen === 'corridor' || L.gen === 'pools' || L.gen === 'beach' || L.story ? s.yaw : this.openYaw(P.x, P.z); P.pitch = 0; P.vx = P.vz = 0;
    P.sanity = 100; P.stamina = 100; P.exhausted = false; P.flash = false; P.crouch = 0;
    P.light = 1; P.lightSmooth = 1;
    this.mode = this.pendingMode === 'hunt' ? 'hunt' : 'survival';
    this.gim = new Gimmick(this);
    if (this.mode === 'hunt') {
      this.entity = new Entity(this, 'none');
      this.hunt = new Hunt(this, this.pendingMonster || 'hound');
      this.humans = this.hunt.humans;
    } else {
      this.entity = new Entity(this, L.entity);
      this.entity.spawnTimer *= [1.6, 1, 0.62][this.settings.diff | 0];
      this.hunt = null;
      this.humans = null;
    }
    document.body.classList.toggle('hunt-mode', this.mode === 'hunt');
    if (this.hunt) { this.sound.stopBeacon(); this.sound.stopEntity(); }
    this.phantom = null; this.phantomTimer = 25;
    this.ambTimer = 6; this.whisperTimer = 8; this.heartTimer = 0; this.breathTimer = 0; this.breathIn = false;
    this.levelTime = 0; this.dimWarned = false;
    P.lidar = false; this.loZone = 0; this.loSeen = {}; this.inDark = false; this.loFog = L.fogDen; this.loAmb = L.ambient[0];
    this.dots = new Float64Array(LIDAR_MAX * 5); this.dotN = 0; this.dotTick = 0; this.beepT = 0; this.blip = null;
    $('radar').classList.add('hidden');
    this.tide = { rise: 0, front: L.gen === 'beach' ? BEACH.FRONT0 : 0 };
    this.haze = 0; this.haunt = 0; this.beachWade = 0; this.beachSoft = 0; this.beachSaid = {}; this.surge = null;
    this.surgeT = L.tide ? L.tide.surgeEvery[0] : 0; this.prints = [];
    this.focus = null; this.sparks.length = 0;
    this.floorY = L.water || L.gen === 'beach' ? this.world.floorAt(P.x, P.z) : 0;
    this.underwater = 0; this.submergeTime = 0; this.wireCool = 0; this.slideRide = null;
    this.hurt = 0; this.ins = 0; this.glitch = 0; this.fade = 1;
    this.globalFlicker = 1; this.gfDur = 0;
    this.power = 1; this.boState = 0; this.splash = 0; this.steam.length = 0;
    this.boTimer = L.blackout ? L.blackout.every[0] * 0.7 + Math.random() * 20 : Infinity;
    this.visDist = L.fogDen > 0.04 ? 26 : 34;
    this.streamChunks(true);
    this.gatherLights(0);
    this.sound.stopEntity();
    this.sound.setLevel(L);
    if (L.steam) this.sound.startSteam(); else this.sound.stopSteam();
    const e = this.world.exit;
    if (L.noExit || L.exitKind === 'poster' || L.exitKind === 'pit' || L.generators || L.story) this.sound.stopBeacon();
    else this.sound.startBeacon(L, e.x + e.nx * 0.5, 1.5, e.z + e.nz * 0.5);
    this.noclip = 0; this.ncCool = 5; this.ncGrow = 0;
    $('noclip').classList.toggle('hidden', !L.noclipTo);
    $('objective').classList.toggle('hidden', !L.generators && !L.story && L.gen !== 'beach');
    this.hideNote();
    this.mapOX = this.mapOZ = 0; this.mapPx = 8; this.mapT = this.time;
    this.mapBase = this.world.plant ? this.buildMinimap() : this.buildAreaMap();
    this.setBigMap(false);
    $('minimap').classList.toggle('hidden', !this.mapBase);
    $('minimap').classList.toggle('low', !!L.noclipTo);
    this.sound.suspend();
    this.scare.classList.add('hidden');
    $('card-name').textContent = (this.hunt ? 'HUNT · ' : '') + L.name;
    $('card-title').textContent = L.title;
    $('card-sub').textContent = L.sub;
    $('card-desc').textContent = L.desc;
    if (this.hunt) {
      const m = HUNT_MONSTERS[this.hunt.kind];
      $('card-hint').innerHTML = '你现在是 <b>' + m.name + '</b>（' + m.en + '）。<br>' +
        m.desc + '<br>本层有 <b>' + this.hunt.total + '</b> 个人类，他们正在找出口。<br>' +
        '<b>E</b> 扑击 · <b>Q</b> ' + m.abil.name + ' · <b>Shift</b> 冲刺 · <b>C</b> 潜行<br>' +
        '五分钟内全部抓住；只要有人逃出去，你就输了。<br>' +
        '<span class="dim">屏幕下方会一直指着最近的活人——你能闻到他们的气味。</span>';
    } else {
      const gim = this.gim;
      let extra = gim && gim.kind !== 'none'
        ? '<br><br><b>【本层玩法 · ' + gim.name + '】</b>' + gim.tip : '';
      if (L.entity === 'none') extra += '<br><b>这一层没有游荡的实体</b>——危险来自环境本身。';
      else if (L.entityDelay === Infinity) extra += '<br><b>实体暂时不会出现</b>，要等你推进剧情（或者走得更深）。';
      if (this.settings.stealth) extra += '<br><b>隐身模式已开启</b>：实体不会发现你，适合单纯看风景。';
      $('card-hint').innerHTML = L.hint + extra;
    }
    $('card').classList.toggle('red', L.gen === 'corridor');
    $('lvl').textContent = L.name + ' · ' + L.title;
    this.state = 'card';
    if (document.pointerLockElement) document.exitPointerLock();
    this.showScreen('card');
  }

  beginPlay() {
    if (this.state !== 'card' && this.state !== 'paused') return;
    const fromPause = this.state === 'paused';
    this.state = 'playing';
    this.showScreen(null);
    this.sound.resume();
    this.last = performance.now() / 1000;
    if (!fromPause) {
      this.fade = 1;
      this.glitch = 1;
      this.sound.glitch();
      this.msg(this.level.name + ' —— ' + this.level.title);
      if (this.level.gen === 'beach') {
        setTimeout(() => { if (this.state === 'playing') this.msg('身后的铁门……消失了。只剩下海浪声。'); }, 2200);
        setTimeout(() => { if (this.state === 'playing') this.msg('潮水正在退。沿着沙滩往北走，找到另一道刻着 EXIST 的铁门。'); }, 5200);
      }
      if (this.level.heat) setTimeout(() => { if (this.state === 'playing') this.msg('空气又热又闷，汗水很快浸透了衣服……'); }, 2500);
      if (this.settings.stealth && !this.hunt) {
        setTimeout(() => { if (this.state === 'playing') this.msg('隐身模式已开启：实体不会发现你。想被追就在设置里关掉它。'); }, 1400);
      }
      if (this.hunt) {
        const m = HUNT_MONSTERS[this.hunt.kind];
        setTimeout(() => { if (this.state === 'playing') this.msg('你是' + m.name + '。' + this.hunt.total + ' 个人类在这层里，找到他们。'); }, 900);
        setTimeout(() => { if (this.state === 'playing') this.msg('E 扑击 · Q ' + m.abil.name + ' · 拖到 Q 上可以看它还剩多久。'); }, 3200);
      } else if (this.gim) this.gim.intro();
    }
    setTimeout(() => {
      if (this.state === 'playing' && !this.controls.enabled && document.pointerLockElement !== this.canvas) this.msg('点击画面以锁定鼠标视角');
    }, 600);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.keys = {};
    this.sound.suspend();
    this.showScreen('pause');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  caught(e) {
    if (this.state !== 'playing' || this.settings.stealth) return;
    this.state = 'dying';
    this.deathCause = e.type;
    this.dieTimer = 0;
    this.stats.deaths++;
    this.sound.stopBeacon();
    this.sound.stopEntity();
    this.sound.stopSteam();
    this.sound.scream();
    this.scare.width = window.innerWidth;
    this.scare.height = window.innerHeight;
    this.scare.classList.remove('hidden');
  }

  die(cause) {
    if (this.state !== 'playing') return;
    this.state = 'dying';
    this.deathCause = cause;
    this.dieTimer = 0;
    this.stats.deaths++;
    this.sound.stopBeacon();
    this.sound.stopEntity();
    this.sound.stopSteam();
    this.sound.glitch();
    for (let k = 0; k < 3; k++) this.sound.whisper(1.2);
  }

  updateDying(dt) {
    this.dieTimer += dt;
    if (this.deathCause === 'insanity') {
      this.glitch = Math.min(1, this.dieTimer * 0.8);
      this.fade = clamp((this.dieTimer - 1.2) / 1.2, 0, 1);
      this.ins = 1;
      if (this.dieTimer > 2.6) this.showDeath();
    } else {
      this.drawScare(this.dieTimer);
      if (this.dieTimer > 1.7) this.showDeath();
    }
  }

  showDeath() {
    this.state = 'dead';
    this.scare.classList.add('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
    const [t, d] = DEATH_TEXT[this.deathCause] || DEATH_TEXT.insanity;
    $('dead-title').textContent = t;
    $('dead-text').textContent = d;
    this.fade = 1;
    this.showScreen('dead');
  }

  // 正常出口通往的层级（level.next 可以跳过隐藏层）
  nextIdx() {
    const L = this.level;
    return L.next !== undefined ? LEVELS.findIndex((l) => l.id === L.next) : this.levelIdx + 1;
  }

  // target 省略时走正常出口；传入则是被传送到指定层级（如窗户 → Level 1.5）
  reachExit(target) {
    if (this.state !== 'playing') return;
    if (target === undefined && !this.exitReady()) {
      if (this.world.party) { this.msg('海报纹丝不动。派对的音乐还在响。'); return; }
      this.msg(this.world.plant ? '电梯没有电。总闸还没有合上。'
        : '电梯没有电。还需要启动 ' + (this.level.generators - this.world.gensOn.size) + ' 台发电机。');
      return;
    }
    this.state = 'exiting';
    this.exitTimer = 0;
    this.exitTo = target !== undefined ? target : this.nextIdx();
    this.sound.whoosh();
    this.sound.stopEntity();
    this.sound.stopBeacon();
    this.sound.stopSteam();
    if (target === undefined && this.exitTo > this.progress && this.exitTo < LEVELS.length) {
      this.progress = this.exitTo;
      try { localStorage.setItem(PROGRESS_KEY, String(this.progress)); } catch (e) { /* Storage is optional. */ }
    }
  }

  updateExiting(dt) {
    this.exitTimer += dt;
    this.fade = clamp(this.exitTimer / 1.4, 0, 1);
    this.glitch = clamp(this.exitTimer / 1.2, 0, 1);
    if (this.exitTimer > 2.0) {
      if (this.exitTo < LEVELS.length) this.loadLevel(this.exitTo, false);
      else this.showEnding();
    }
  }

  // Level 4 的窗户：一靠近就被“吸”进去，来到 Level 1.5
  checkWindows() {
    if (!this.level.windows) return;
    const P = this.player, W = this.world, cs = CHUNK * CELL;
    const pcx = Math.floor(P.x / cs), pcz = Math.floor(P.z / cs);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = W.peekChunk(pcx + dx, pcz + dz);
        if (!c) continue;
        for (const w of c.windows) {
          if (w.blacked) continue;
          const ox = P.x - w.x, oz = P.z - w.z;
          const dn = ox * w.nx + oz * w.nz, dt = Math.abs(ox * w.nz - oz * w.nx);
          if (dn < -0.2 || dt > 2.5) continue;
          if (dn < 0.55 && dt < w.w / 2 + 0.1) {
            this.msg('窗外的光把你整个吞了进去——');
            this.reachExit(LEVELS.findIndex((l) => l.id === 1.5));
            return;
          }
          if (dn < 4 && !w.warned) {
            w.warned = true;
            this.msg('窗外……是阳光？');
            this.sound.whisper(0.5);
          }
        }
      }
    }
  }

  huntResult(h) {
    if (this.state !== 'playing') return;
    this.state = 'ending';
    if (document.pointerLockElement) document.exitPointerLock();
    this.sound.stopEntity();
    this.sound.stopBeacon();
    this.sound.stopSteam();
    this.sound.stopDrone();
    this.sound.setHum(0);
    const alive = h.activeHumans();
    const killed = h.total - h.escapes - alive;
    const timeout = h.left <= 0;
    const win = alive === 0 && h.escapes === 0;
    const title = win ? 'HUNT COMPLETE' : timeout ? 'TIME IS UP' : 'SOMEONE GOT OUT';
    $('ending').querySelector('h3').textContent = title;
    const m = HUNT_MONSTERS[h.kind];
    $('end-text').innerHTML = win
      ? '你听见最后一声心跳在走廊里停下。<br><br>荧光灯还在嗡嗡作响，地毯吸饱了新的气味。<br>' +
        '<span class="dim">这层楼又是你的了。</span>'
      : timeout
        ? '你在这层楼里转得太久了。<br><br>远处传来铁门合上的声音——他们走了。<br>' +
          '<span class="dim">还有 ' + alive + ' 个人活着，灯又亮了一盏。</span>'
        : '有 ' + h.escapes + ' 个人摸到了出口。<br><br>门在你眼前关上，走廊里只剩下他们的脚步声。<br>' +
          '<span class="dim">你抓住了 ' + killed + ' 个。剩下的被记住了。</span>';
    $('end-stats').innerHTML =
      '<div>' + m.name + ' · ' + h.total + ' 人进入</div>' +
      '<div>抓住 <b>' + killed + '</b> · 逃脱 <b>' + h.escapes + '</b></div>' +
      '<div>用时 <b>' + fmtTime(h.limit - Math.max(0, h.left)) + '</b></div>';
    this.showScreen('ending');
  }

  showEnding() {
    this.state = 'ending';
    if (document.pointerLockElement) document.exitPointerLock();
    this.sound.stopDrone();
    this.sound.setHum(0);
    $('end-text').innerHTML = '你撞开了那扇门——<br><br>刺眼的阳光。汽车的鸣笛声。远处有孩子在笑。<br>潮湿地毯的气味终于消失了。<br><br>' +
      '你站在一条再普通不过的街道上，大口喘着气。<br>一切都和记忆中一模一样……<br><br><span class="dim">……除了你身后那栋建筑里，隐约传来的荧光灯嗡鸣声。</span>';
    $('end-stats').innerHTML =
      `<div>总用时 <b>${fmtTime(this.runTime)}</b></div>` +
      `<div>死亡次数 <b>${this.stats.deaths}</b></div>` +
      `<div>饮用杏仁水 <b>${this.stats.almond}</b></div>`;
    this.showScreen('ending');
  }

  // ---------------------------------------------------------
  //  玩家动作
  // ---------------------------------------------------------
  msg(text) {
    const box = $('msgs');
    const d = document.createElement('div');
    d.className = 'msg';
    d.textContent = text;
    box.appendChild(d);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(() => d.remove(), 3800);
  }

  toggleFlash() {
    const P = this.player;
    if (this.inDark) {
      P.flash = false;
      this.sound.click(0.15);
      this.msg('手电筒亮了一下，光刚照出去就被黑暗吞没了。');
      return;
    }
    if (this.level.noFlash) {
      P.flash = false;
      this.sound.click(0.15);
      this.msg('开关还在响，但没有一丝光。');
      return;
    }
    if (!P.flash && P.battery <= 0) {
      this.msg(P.batteries > 0 ? '手电筒没电了 —— 按 R 更换电池' : '手电筒没电了');
      this.sound.click(0.15);
      return;
    }
    P.flash = !P.flash;
    this.sound.click(0.35);
  }

  drink() {
    const P = this.player;
    if (P.almond <= 0) { this.msg('你没有杏仁水'); return; }
    if (P.sanity > 97 && !(this.gim && this.gim.waterNeed && this.gim.water < 90)) { this.msg('你现在很清醒'); return; }
    P.almond--;
    P.sanity = Math.min(100, P.sanity + 38);
    if (this.gim) this.gim.onDrink();
    this.stats.almond++;
    this.sound.drink();
    this.msg('你喝下了杏仁水，头脑清醒了一些');
  }

  changeBattery() {
    const P = this.player;
    if (P.batteries <= 0) { this.msg('你没有备用电池'); return; }
    if (P.battery > 90) { this.msg('电量还很充足'); return; }
    P.batteries--;
    P.battery = 100;
    this.sound.batterySfx();
    this.msg('更换了电池');
  }

  interact() {
    if (this.state !== 'playing' || this.slideRide) return;
    this.updateFocus();
    if (this.state !== 'playing') return;
    if (this.gim && this.gim.interact()) return;
    const f = this.focus;
    if (!f) return;
    if (f.type === 'exit') this.reachExit();
    else if (f.type === 'item') this.pickup(f.item, f.chunk);
    else if (f.type === 'generator') this.startGenerator(f.gen);
    else if (f.type === 'plant') this.usePlant(f.obj);
    else if (f.type === 'party') this.useParty(f.obj);
    else if (f.type === 'dispenser') {
      const d = f.dispenser;
      if (d.next > this.levelTime) { this.msg('等一会儿，机器还在补水。'); return; }
      d.next = this.levelTime + 8;
      this.player.almond++;
      this.sound.pickup();
      this.msg(d.kind === 'cooler' ? '你接了一瓶杏仁水（Q 饮用）。' : '售货机里落下一瓶杏仁水（Q 饮用）。');
    }
    else if (f.type === 'slide') {
      this.slideRide = { slide: f.slide, time: 0, start: [this.player.x, this.camY, this.player.z] };
      this.player.vx = this.player.vz = 0;
      this.focus = null;
      this.sound.footstep('water', 0.5);
      this.msg('水流带着你滑进了弯曲的管道。');
    }
    else if (f.type === 'poster') {
      if (f.poster.cool > this.levelTime) return;
      f.poster.cool = this.levelTime + 3;
      this.glitch = Math.max(this.glitch, 0.5);
      this.msg(this.settings.stealth ? '纸面上留下了一道新的笑脸。' : '海报背后传来笑声——它知道你在哪里了。');
      this.alertEntity(this.player.x, this.player.z);
    }
  }

  startGenerator(gen) {
    const W = this.world, L = this.level;
    if (W.gensOn.has(gen.id)) { this.msg('这台发电机已经在运转。'); return; }
    if (W.plant && gen.no === 2 && !W.plant.flags.fuse) {
      this.sound.click(0.3);
      this.msg('启动杆拉不动——保险丝座是空的，烧断的保险丝还扔在地上。得先找一根备用的。');
      return;
    }
    W.gensOn.add(gen.id);
    this.sound.generatorStart(gen.x, gen.z);
    this.shakeAmt = Math.max(this.shakeAmt, 0.12);
    this.alertEntity(gen.x, gen.z);
    if (W.plant) { this.plantGenerator(gen.no); this.focus = null; return; }
    if (W.gensOn.size === L.generators) {
      const e = W.exit;
      this.sound.startBeacon(L, e.x + e.nx * 0.5, 1.5, e.z + e.nz * 0.5);
      this.msg('电力恢复了。远处响起电梯的提示音。');
    } else this.msg('发电机已启动（' + W.gensOn.size + '/' + L.generators + '）——轰鸣在走廊里回荡。');
    this.focus = null;
  }

  // ---------------------------------------------------------
  //  Level 3 剧情：终端 → 钥匙卡 → A 闸门 → 1 号机 → 保险丝 → 2 号机 → 3 号机 → 总闸 → 电梯
  // ---------------------------------------------------------
  exitReady() {
    const L = this.level, W = this.world;
    if (W.plant) return W.plant.flags.main;
    if (W.party) return W.party.flags.radio;
    return !L.generators || W.gensOn.size >= L.generators;
  }

  // 当前目标：[说明, 指引位置]；前置条件可以乱序完成，永远指向第一个没做完的
  plantObjective() {
    const pl = this.world.plant, F = pl.flags;
    const obj = (kind, gate) => pl.objs.find((o) => o.kind === kind && (!gate || o.gate === gate));
    const gen = (no) => pl.gens[no - 1];
    if (!F.read && !F.key) return ['查看控制室的值班终端', obj('console')];
    if (!F.key) return ['去南边的值班室找到 A 区钥匙卡', obj('key')];
    if (!this.world.plantGate('A').open) return ['刷卡打开西侧 A 区的闸门', obj('panel', 'A')];
    if (!F.gen1) return ['启动 A 区的 1 号发电机', gen(1)];
    if (!F.fuse && !F.gen2) return ['从控制区东侧的闸门进入 B 区，在东北角仓库找到备用保险丝', obj('fuse')];
    if (!F.gen2) return ['装上保险丝，启动 B 区的 2 号发电机', gen(2)];
    if (!F.gen3) return ['从控制区北侧的闸门进入 C 区，启动 3 号发电机', gen(3)];
    if (!F.main) return ['回到控制室，合上西墙上的总闸', obj('switch')];
    const e = this.world.exit;
    return ['乘电梯离开', { x: e.x, z: e.z, nx: e.nx, nz: e.nz }];
  }

  // 指引路线：目标在另一个分区时，先把玩家带到正确的闸门（分区之间只能经控制区相通）
  plantGuide(t) {
    const W = this.world, P = this.player;
    const reg = (x, z) => W.plantRegion(Math.floor(x / CELL), Math.floor(z / CELL));
    const pr = reg(P.x, P.z), tr = reg(t.x, t.z);
    if (pr === tr) return t;
    const g = W.plantGate(pr !== 'H' ? pr : tr);
    // 回控制区时指向闸门格；去分区时指向闸门另一侧的第一格
    let gx = +g.cell.split(',')[0], gz = +g.cell.split(',')[1];
    if (pr === 'H') { if (g.west) gx = gx === g.gx ? gx - 1 : g.gx; else gz -= 1; }
    return { x: (gx + 0.5) * CELL, z: (gz + 0.5) * CELL, nx: 0, nz: 0 };
  }

  // 设施地图底图：地面、房间、墙和分区标注只画一次，每帧再叠加闸门、目标和玩家
  buildMinimap() {
    const W = this.world, N = 37, px = 8;
    const c = document.createElement('canvas');
    c.width = c.height = N * px;
    const g = c.getContext('2d');
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        if (W.stationZone(x, z) === 0) continue;
        g.fillStyle = W.blocked(x, z) ? '#4a463c' : W.stationZone(x, z) === 2 ? '#34312a' : '#26241f';
        g.fillRect(x * px, z * px, px, px);
      }
    }
    g.strokeStyle = '#9a917b';
    g.lineWidth = 1.5;
    g.beginPath();
    for (let z = 0; z <= N; z++) {
      for (let x = 0; x <= N; x++) {
        if (W.wallW(x, z)) { g.moveTo(x * px, z * px); g.lineTo(x * px, (z + 1) * px); }
        if (W.wallN(x, z)) { g.moveTo(x * px, z * px); g.lineTo((x + 1) * px, z * px); }
      }
    }
    g.stroke();
    g.fillStyle = 'rgba(233, 226, 196, 0.5)';
    g.font = 'bold 22px "Microsoft YaHei", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [t, x, z] of [['A', 6, 21], ['B', 30, 21], ['C', 18, 9]]) g.fillText(t, x * px, z * px);
    g.font = '11px "Microsoft YaHei", sans-serif';
    g.fillText('控制室', 15.5 * px, 15.5 * px);
    g.fillText('电梯', 15.5 * px, 35.3 * px);
    return c;
  }

  // 通用地图：有限地图画整张；无限层级画玩家周围已加载的区块，定时重画
  buildAreaMap() {
    const W = this.world, P = this.player, L = this.level, b = W.fixedBounds, px = 6;
    let x0, z0, n;
    if (b) {
      x0 = b.minX * CHUNK; z0 = b.minZ * CHUNK;
      n = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * CHUNK + CHUNK;
    } else {
      n = 81; x0 = Math.floor(P.x / CELL) - 40; z0 = Math.floor(P.z / CELL) - 40;
    }
    this.mapOX = x0; this.mapOZ = z0; this.mapPx = px;
    const c = this.mapBase && this.mapBase.width === n * px ? this.mapBase : document.createElement('canvas');
    c.width = c.height = n * px;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    const get = (gx, gz) => (b ? W.chunk(gx >> 4, gz >> 4) : W.peekChunk(gx >> 4, gz >> 4));
    const lo = L.gen === 'lightsout';
    const LO_COL = ['#26241f', '#2c2a24', '#3a362c', '#1b1b24', '#3a3a30', '#44402e'];
    const walls = new Path2D(), bars = new Path2D();
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const gx = x0 + i, gz = z0 + j, ch = get(gx, gz);
        if (!ch || ch.empty) continue;
        const k = ((gz & 15) << 4) | (gx & 15), X = i * px, Z = j * px;
        if (i < n && j < n) {
          if (ch.block[k]) { if (!lo) { g.fillStyle = L.gen === 'beach' ? '#4a4238' : '#3e3b33'; g.fillRect(X, Z, px, px); } }
          else {
            g.fillStyle = lo ? LO_COL[W.loZone(gx, gz)] : L.gen === 'beach' ? '#9a8660' : '#2a2822';
            g.fillRect(X, Z, px, px);
            if (ch.pillar[k]) { g.fillStyle = '#8a826c'; g.fillRect(X + px * 0.3, Z + px * 0.3, px * 0.4, px * 0.4); }
          }
        }
        if (j < n && ch.wallW[k]) { walls.moveTo(X, Z); walls.lineTo(X, Z + px); }
        if (i < n && ch.wallN[k]) { walls.moveTo(X, Z); walls.lineTo(X + px, Z); }
        if (j < n && ch.barW[k]) { bars.moveTo(X, Z); bars.lineTo(X, Z + px); }
        if (i < n && ch.barN[k]) { bars.moveTo(X, Z); bars.lineTo(X + px, Z); }
      }
    }
    g.lineWidth = 1.5;
    g.strokeStyle = '#9a917b'; g.stroke(walls);
    g.strokeStyle = '#6f8a9a'; g.stroke(bars);
    if (L.gen === 'party') {
      g.fillStyle = 'rgba(233, 226, 196, 0.6)';
      g.font = '6px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const R of PARTY.rooms) if (R.name) g.fillText(R.name, ((R.x0 + R.x1 + 1) / 2 - x0) * px, ((R.z0 + R.z1 + 1) / 2 - z0) * px);
    }
    if (lo) {
      g.fillStyle = 'rgba(233, 226, 196, 0.6)';
      g.font = '6px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const [t, x, z] of [['出生', 20.5, 33.5], ['杏仁水', 13.5, 33.5], ['电池', 27.5, 33.5], ['电脑室', 5.5, 16.5],
        ['第一段', 20.5, 22], ['第二段 · 全黑', 18, 4], ['出口', 36, 8.6]]) g.fillText(t, (x - x0) * px, (z - z0) * px);
    }
    this.mapT = this.time;
    return c;
  }

  setBigMap(on) {
    this.bigMap = on;
    const cv = $('minimap'), s = on ? 600 : 200;
    cv.classList.toggle('big', on);
    if (cv.width !== s) { cv.width = s; cv.height = s; }
  }

  drawMinimap() {
    if (this.hunt || !this.mapBase) return;
    const W = this.world;
    if (!W.plant && !W.fixedBounds && this.time - this.mapT > 0.5) this.mapBase = this.buildAreaMap();
    const cv = this.mapCv || (this.mapCv = $('minimap'));
    const g = cv.getContext('2d'), P = this.player, px = this.mapPx, t = this.time;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    // 大图显示整张地图；小图以玩家为中心放大
    const k = this.bigMap ? cv.width / this.mapBase.width : 12.8 / px;
    const ox = (this.bigMap ? 0 : cv.width / 2 - (P.x / CELL - this.mapOX) * px * k) - this.mapOX * px * k;
    const oz = (this.bigMap ? 0 : cv.height / 2 - (P.z / CELL - this.mapOZ) * px * k) - this.mapOZ * px * k;
    g.setTransform(k, 0, 0, k, ox, oz);
    g.drawImage(this.mapBase, this.mapOX * px, this.mapOZ * px);
    if (!W.plant) { this.drawMapOverlay(g, px, t); return; }
    g.lineWidth = 3;
    for (const gate of W.plant.gates) {
      g.strokeStyle = gate.open ? '#5fd36b' : '#e0463a';
      g.beginPath();
      if (gate.west) { g.moveTo(gate.gx * px, gate.gz * px); g.lineTo(gate.gx * px, (gate.gz + 1) * px); }
      else { g.moveTo(gate.gx * px, gate.gz * px); g.lineTo((gate.gx + 1) * px, gate.gz * px); }
      g.stroke();
    }
    const e = W.exit;
    g.fillStyle = this.exitReady() ? '#5fd36b' : '#8a8472';
    g.fillRect((e.x / CELL) * px - 4, (e.z / CELL) * px - 1, 8, 3);
    const tg = this.plantObjective()[1];
    if (tg) {
      const r = 4 + 2 * Math.sin(t * 4);
      g.strokeStyle = '#ffd24a'; g.lineWidth = 2;
      g.beginPath(); g.arc((tg.x / CELL) * px, (tg.z / CELL) * px, r + 2, 0, Math.PI * 2); g.stroke();
    }
    // 玩家：朝向箭头
    const x = (P.x / CELL) * px, z = (P.z / CELL) * px, fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(x + fx * 6, z + fz * 6);
    g.lineTo(x - fx * 3.5 + fz * 3.5, z - fz * 3.5 - fx * 3.5);
    g.lineTo(x - fx * 3.5 - fz * 3.5, z - fz * 3.5 + fx * 3.5);
    g.closePath(); g.fill();
    if (this.bigMap) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = 'rgba(233, 226, 196, 0.8)';
      g.font = '14px "Microsoft YaHei", sans-serif';
      g.textAlign = 'left'; g.textBaseline = 'top';
      g.fillText('电站平面图 · 黄圈为当前目标 · 红 / 绿线为闸门 · M 收起', 12, 10);
    }
  }

  // 通用地图的出口标记与玩家箭头（坐标已按底图原点平移）
  drawMapOverlay(g, px, t) {
    const W = this.world, P = this.player, L = this.level, e = W.exit;
    if (L.gen === 'beach') {
      // 当前的海水范围
      const xe = 230 / CELL * px;
      g.fillStyle = 'rgba(46, 128, 176, 0.8)';
      g.beginPath();
      g.moveTo(xe, 0);
      for (let z = 0; z <= 320; z += 4) g.lineTo(Math.max(-40, beachWaterline(z, beachSea(z, this.tide, t))) / CELL * px, z / CELL * px);
      g.lineTo(xe, 320 / CELL * px);
      g.closePath(); g.fill();
    }
    if (W.gates) {
      g.lineWidth = 3;
      for (const gate of W.gates) {
        g.strokeStyle = gate.open ? '#5fd36b' : '#e0463a';
        g.beginPath();
        if (gate.west) { g.moveTo(gate.gx * px, gate.gz * px); g.lineTo(gate.gx * px, (gate.gz + 1) * px); }
        else { g.moveTo(gate.gx * px, gate.gz * px); g.lineTo((gate.gx + 1) * px, gate.gz * px); }
        g.stroke();
      }
    }
    if (W.party) {
      const tg = this.partyObjective()[1], r = 4 + 1.5 * Math.sin(t * 4);
      g.strokeStyle = '#ffd24a'; g.lineWidth = 2;
      g.beginPath(); g.arc((tg.x / CELL) * px, (tg.z / CELL) * px, r, 0, Math.PI * 2); g.stroke();
    } else if (e && this.settings.guide && !L.noExit && !L.noGuide) {
      const r = 4 + 1.5 * Math.sin(t * 4);
      g.strokeStyle = '#5fd36b'; g.lineWidth = 2;
      g.beginPath(); g.arc((e.x / CELL) * px, (e.z / CELL) * px, r, 0, Math.PI * 2); g.stroke();
    }
    const x = (P.x / CELL) * px, z = (P.z / CELL) * px, fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(x + fx * 5, z + fz * 5);
    g.lineTo(x - fx * 3 + fz * 3, z - fz * 3 - fx * 3);
    g.lineTo(x - fx * 3 - fz * 3, z - fz * 3 + fx * 3);
    g.closePath(); g.fill();
    if (this.bigMap) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = 'rgba(233, 226, 196, 0.8)';
      g.font = '14px "Microsoft YaHei", sans-serif';
      g.textAlign = 'left'; g.textBaseline = 'top';
      const tip = W.party ? ' · 黄圈为当前目标 · 红 / 绿线为门' : this.settings.guide && !L.noExit && !L.noGuide ? ' · 绿圈为出口' : '';
      g.fillText(L.name + ' · ' + L.title + ' 地图' + tip + ' · M 收起', 12, 10);
    }
  }

  plantStep() {
    const F = this.world.plant.flags;
    return [F.read || F.key, F.key, this.world.plantGate('A').open, F.gen1, F.fuse || F.gen2, F.gen2, F.gen3, F.main].filter(Boolean).length;
  }

  openGate(id) {
    const g = this.world.plantGate(id);
    if (g.open) return;
    g.open = true;
    const x = g.gx * CELL, z = g.gz * CELL;
    this.sound.powerUp();
    this.sound.electricSpark(x, 2.4, z, 0.8);
    this.shakeAmt = Math.max(this.shakeAmt, 0.15);
    if (this.entity.active) this.alertEntity(x, z); // 闸门的动静只惊动已经醒来的猎犬
  }

  plantGenerator(no) {
    const F = this.world.plant.flags;
    const later = (text) => setTimeout(() => { if (this.state === 'playing') this.msg(text); }, 2200);
    if (no === 1) {
      F.gen1 = true;
      this.openGate('B');
      this.msg('1 号发电机轰鸣着转了起来，A 区的灯一盏接一盏亮起。');
      later('远处传来铁闸升起的声音——东侧 B 区的电动闸门通电了。');
    } else if (no === 2) {
      F.gen2 = true;
      this.openGate('C');
      this.msg('你把保险丝按进插座。2 号发电机咳嗽了几声，稳稳地运转起来。');
      later('北侧 C 区的电动闸门升起来了。');
    } else {
      F.gen3 = true;
      this.msg('三台发电机全部在运转。可电梯依然没有反应——');
      later('还得回控制室，把总闸合上。');
    }
  }

  usePlant(o) {
    const W = this.world, F = W.plant.flags;
    this.focus = null;
    if (o.kind === 'console') {
      F.read = true;
      this.sound.click(0.35);
      this.showNote('值班终端 · 最后一条日志', PLANT_NOTES.console, o);
    } else if (o.kind === 'note') {
      this.sound.click(0.25);
      this.showNote(o.id === 'A' ? '夹在工作台上的巡检记录' : '压在工作台下的纸条', PLANT_NOTES[o.id], o);
    } else if (o.kind === 'key') {
      o.taken = true; F.key = true;
      this.sound.pickup();
      this.msg('拿到了 A 区闸门钥匙卡。卡面上用记号笔写着：“K.”');
    } else if (o.kind === 'fuse') {
      o.taken = true; F.fuse = true;
      this.sound.pickup();
      this.msg('拿到了一根备用保险丝。玻璃管里的熔丝还是完好的。');
    } else if (o.kind === 'panel') {
      const g = W.plantGate(o.gate);
      if (g.open) { this.msg('闸门已经打开了。'); return; }
      this.sound.click(0.3);
      if (o.gate === 'A') {
        if (!F.key) { this.msg('读卡器亮着红灯。需要 A 区的钥匙卡。'); return; }
        this.openGate('A');
        this.msg('读卡器“滴”的一声变绿，铁闸缓缓升了起来。');
      } else {
        this.msg(o.gate === 'B' ? '电动闸门没有电。面板上印着：由 1 号发电机（A 区）供电。'
          : '电动闸门没有电。面板上印着：由 2 号发电机（B 区）供电。');
      }
    } else if (o.kind === 'switch') {
      if (F.main) { this.msg('总闸已经合上了。'); return; }
      const n = [F.gen1, F.gen2, F.gen3].filter(Boolean).length;
      if (n < 3) { this.sound.click(0.3); this.msg('总闸纹丝不动——并网电压不足（' + n + ' / 3 台发电机）。'); return; }
      F.main = true;
      const e = W.exit, P = this.player;
      this.sound.powerUp();
      this.shakeAmt = Math.max(this.shakeAmt, 0.3);
      this.glitch = Math.max(this.glitch, 0.4);
      this.sound.startBeacon(this.level, e.x + e.nx * 0.5, 1.5, e.z + e.nz * 0.5);
      this.msg('你用全身的重量压下了总闸。整座电站猛地一震，远处响起电梯的提示音。');
      setTimeout(() => { if (this.state === 'playing') this.msg('……有什么东西也被惊醒了。快去南边的电梯。'); }, 2400);
      this.alertEntity(P.x, P.z);
    }
  }

  // ---------------------------------------------------------
  //  Level 6 熄灯：分区提示、LiDAR 扫描、雷达哔声
  // ---------------------------------------------------------
  updateLightsOut(dt) {
    const P = this.player, W = this.world, E = this.entity, L = this.level;
    const z = W.loZone(Math.floor(P.x / CELL), Math.floor(P.z / CELL));
    if (z) this.loZone = z;
    this.inDark = this.loZone === 3;
    if (this.inDark) P.flash = false;
    if (!this.loSeen[this.loZone]) {
      this.loSeen[this.loZone] = true;
      const tip = {
        1: '门外的走廊一片漆黑。打开手电筒（F）。',
        4: '一间堆着旧电脑的屋子，灯管还在闪。桌上好像放着什么设备。',
        3: P.lidar ? '伸手不见五指。按住 G 用 LiDAR 扫描四周——远处好像有人在喘气。'
          : '伸手不见五指，手电筒也照不亮……也许该回电脑室找找有什么能用的。',
        5: '前面有光。走廊尽头是一扇普通的白色房门。',
      }[this.loZone];
      if (tip) this.msg(tip);
    }
    // 怨魂只在第二段出没：玩家第一次走进全黑区时它才出现
    if (this.inDark && !E.active && !this.settings.stealth && E.spawnTimer === Infinity) E.spawnTimer = 3;
    if (P.lidar && (this.keys.KeyG || this.controls.scan) && this.state === 'playing') {
      for (let k = 0; k < LIDAR_RAYS; k++) this.lidarCast();
      this.dotTick -= dt;
      if (this.dotTick <= 0) { this.dotTick = 0.07; this.sound.click(0.04); }
    }
    // 雷达每 2 秒扫一圈；实体在范围内时按距离加快哔声
    if (!P.lidar) return;
    const near = E.active && this.inDark ? Math.hypot(E.x - P.x, E.z - P.z) : Infinity;
    if (near < LIDAR_RANGE) {
      this.beepT -= dt;
      if (this.beepT <= 0) {
        this.beepT = 0.22 + (near / LIDAR_RANGE) * 1.4;
        this.sound.blip(0.12 + 0.18 * (1 - near / LIDAR_RANGE), 1500);
      }
    }
    const sweep = (this.time * Math.PI) % (Math.PI * 2);
    if (this.lastSweep !== undefined && sweep < this.lastSweep) {
      this.blip = near < LIDAR_RANGE ? { x: E.x, z: E.z, t: this.time } : null;
    }
    this.lastSweep = sweep;
    this.drawRadar(sweep);
  }

  // 从视线方向的锥体里随机射出一条射线，在墙 / 地 / 天花板 / 实体上留下光点
  lidarCast() {
    const P = this.player, W = this.world, E = this.entity, H = this.level.wallH;
    const yaw = P.yaw + (Math.random() - 0.5) * 1.1, pitch = clamp(P.pitch + (Math.random() - 0.5) * 0.8, -1.45, 1.45);
    const cp = Math.cos(pitch), dx = -Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = -Math.cos(yaw) * cp;
    const ox = P.x, oy = this.camY, oz = P.z, hl = Math.hypot(dx, dz);
    let t = LIDAR_RANGE, red = 0;
    if (hl > 1e-4) t = Math.min(t, W.rayWall(ox, oz, dx / hl, dz / hl, LIDAR_RANGE * hl) / hl);
    if (dy < -1e-4) t = Math.min(t, -oy / dy);
    else if (dy > 1e-4) t = Math.min(t, (H - oy) / dy);
    if (E.active && E.cfg.tex >= 0 && hl > 1e-4) {
      // 与实体的竖直圆柱求交：它在扫描里是一团红色的轮廓
      const ex = E.x - ox, ez = E.z - oz, tc = (ex * dx + ez * dz) / (hl * hl);
      const qx = dx * tc - ex, qz = dz * tc - ez, y = oy + dy * tc;
      if (tc > 0 && tc < t && qx * qx + qz * qz < 0.16 && y > 0 && y < E.cfg.h) { t = tc; red = 1; }
    }
    if (t >= LIDAR_RANGE) return;
    t -= 0.02;
    const o = (this.dotN % LIDAR_MAX) * 5, D = this.dots;
    D[o] = ox + dx * t; D[o + 1] = oy + dy * t; D[o + 2] = oz + dz * t; D[o + 3] = this.time; D[o + 4] = red;
    this.dotN++;
  }

  drawRadar(sweep) {
    const cv = this.radarCv || (this.radarCv = $('radar'));
    const g = cv.getContext('2d'), w = cv.width, c = w / 2, P = this.player;
    g.clearRect(0, 0, w, w);
    g.fillStyle = 'rgba(4, 14, 10, 0.85)';
    g.beginPath(); g.arc(c, c, c - 1, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(90, 255, 150, 0.25)'; g.lineWidth = 1;
    for (const r of [0.33, 0.66, 1]) { g.beginPath(); g.arc(c, c, (c - 4) * r, 0, Math.PI * 2); g.stroke(); }
    g.strokeStyle = 'rgba(90, 255, 150, 0.7)';
    g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(sweep - Math.PI / 2) * (c - 4), c + Math.sin(sweep - Math.PI / 2) * (c - 4)); g.stroke();
    if (this.blip) {
      // 以玩家朝向为上方
      const rx = this.blip.x - P.x, rz = this.blip.z - P.z;
      const lx = rx * Math.cos(P.yaw) - rz * Math.sin(P.yaw), ly = -rx * Math.sin(P.yaw) - rz * Math.cos(P.yaw);
      const s = (c - 6) / LIDAR_RANGE, a = clamp(1 - (this.time - this.blip.t) / 2, 0, 1);
      g.fillStyle = `rgba(255, 60, 50, ${a})`;
      g.beginPath(); g.arc(c + lx * s, c - ly * s, 4, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#7dffae';
    g.beginPath(); g.moveTo(c, c - 5); g.lineTo(c + 4, c + 4); g.lineTo(c - 4, c + 4); g.closePath(); g.fill();
    g.fillStyle = 'rgba(125, 255, 174, 0.8)'; g.font = '11px monospace'; g.textAlign = 'center';
    g.fillText('LiDAR · G', c, w - 10);
  }

  // LiDAR 光点：朝向镜头的小方片，随时间变暗
  buildDots(mb) {
    if (!this.dotN) return;
    const P = this.player, D = this.dots, t = this.time;
    const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw), nx = Math.sin(P.yaw), nz = Math.cos(P.yaw), s = 0.018;
    const white = [0.45, 0.55, 0.55, 0.55, 0.55, 0.45, 0.45, 0.45], red = [0.37, 0.51, 0.39, 0.51, 0.39, 0.49, 0.37, 0.49];
    for (let k = Math.min(this.dotN, LIDAR_MAX) - 1; k >= 0; k--) {
      const o = k * 5, age = t - D[o + 3];
      if (age > LIDAR_LIFE) continue;
      const x = D[o], y = D[o + 1], z = D[o + 2];
      if ((x - P.x) ** 2 + (z - P.z) ** 2 > 28 * 28) continue;
      const e = (D[o + 4] ? 3.2 : 2.2) * (1 - age / LIDAR_LIFE);
      mb.quad([x - rx * s, y - s, z - rz * s], [x + rx * s, y - s, z + rz * s], [x + rx * s, y + s, z + rz * s], [x - rx * s, y + s, z - rz * s],
        [nx, 0, nz], D[o + 4] ? red : white, D[o + 4] ? TEX.INDICATOR : TEX.LIGHT, e);
    }
  }

  // 闸门升起的动画
  updatePlant(dt) {
    for (const g of this.world.plant.gates) if (g.open && g.lift < 1) g.lift = Math.min(1, g.lift + dt * 0.45);
    const n = this.noteSrc, P = this.player;
    if (n && Math.hypot(n.x - P.x, n.z - P.z) > 3) this.hideNote();
  }

  // ---------------------------------------------------------
  //  Level Fun =) 剧情：请柬 → 钥匙 → 船长室 → 航海日志 → 关掉广播 → 后台的颠倒海报
  // ---------------------------------------------------------
  partyObjective() {
    const pa = this.world.party, F = pa.flags;
    const obj = (kind, gate) => pa.objs.find((o) => o.kind === kind && (!gate || o.gate === gate));
    if (!F.invite) return ['读一读桌上的请柬', obj('invite')];
    if (!F.key) return ['去北边的宴会厅，拿走蛋糕旁的船长室钥匙', obj('key')];
    if (!F.door) return ['用钥匙打开走廊东端的船长室', obj('lock', 'K')];
    if (!F.log) return ['看看船长桌上的航海日志', obj('log')];
    if (!F.radio) return ['关掉船长室东墙上的派对广播', obj('radio')];
    return ['回到宴会厅，穿过舞台后的门，触摸那张颠倒的海报', this.world.exit];
  }

  partyStep() {
    const F = this.world.party.flags;
    return [F.invite, F.key, F.door, F.log, F.radio].filter(Boolean).length;
  }

  useParty(o) {
    const W = this.world, F = W.party.flags, P = this.player;
    const later = (text, ms = 2400) => setTimeout(() => { if (this.state === 'playing') this.msg(text); }, ms);
    this.focus = null;
    if (o.kind === 'invite') {
      F.invite = true;
      this.sound.click(0.25);
      this.showNote('桌上的请柬', PARTY_NOTES.invite, o);
    } else if (o.kind === 'key') {
      o.taken = true; F.key = true;
      this.sound.pickup();
      this.glitch = Math.max(this.glitch, 0.4);
      this.msg('你拿起了钥匙。钥匙牌上写着：船长室。');
      later('音乐忽然变响了。走廊里传来很多很多轻快的脚步声——派对客醒了。');
      setTimeout(() => { if (this.state === 'playing') this.alertEntity(P.x, P.z); }, 2600);
    } else if (o.kind === 'log') {
      F.log = true;
      this.sound.click(0.25);
      this.showNote('船长的航海日志', PARTY_NOTES.log, o);
    } else if (o.kind === 'lock') {
      const g = W.partyGate(o.gate);
      if (g.open) { this.msg('门已经开了。'); return; }
      this.sound.click(0.3);
      if (o.gate === 'K') {
        if (!F.key) { this.msg('门锁着。门牌上写着“船长室”。钥匙应该在宴会厅。'); return; }
        g.open = true; F.door = true;
        this.sound.pickup();
        this.msg('钥匙转动了。船长室的门慢慢升了起来。');
      } else {
        this.msg('门锁死了。门后震耳的派对音乐一刻不停——好像声音本身就是那把锁。');
      }
    } else if (o.kind === 'radio') {
      if (F.radio) { this.msg('广播已经关掉了。'); return; }
      F.radio = true;
      W.partyGate('T').open = true;
      this.sound.powerUp();
      this.shakeAmt = Math.max(this.shakeAmt, 0.25);
      this.glitch = Math.max(this.glitch, 0.5);
      this.msg('你拔掉了广播的电源。整艘船一下子安静得可怕——');
      later('宴会厅的方向传来“咔哒”一声：舞台后的门开了。');
      later('……然后是很多很多愤怒的尖笑声。快跑。', 4600);
      this.alertEntity(P.x, P.z);
    }
  }

  updateParty(dt) {
    for (const g of this.world.party.gates) if (g.open && g.lift < 1) g.lift = Math.min(1, g.lift + dt * 0.6);
    const n = this.noteSrc, P = this.player;
    if (n && Math.hypot(n.x - P.x, n.z - P.z) > 3) this.hideNote();
  }

  // ---------------------------------------------------------
  //  Level 994：潮水。短暂的退潮之后，涨潮前锋从南端一路向北推进，整体水位也在不规则地上涨，
  //  隔一阵还会有一道大浪冲上沙滩。站进水里会减速，水深过膝就会被卷走
  // ---------------------------------------------------------
  updateBeach(dt) {
    const P = this.player, L = this.level, C = L.tide, T = this.tide, S = this.sound, t = this.levelTime;
    const say = (k, text) => { if (!this.beachSaid[k]) { this.beachSaid[k] = true; this.msg(text); } };
    const run = Math.max(0, t - C.delay);
    T.front = BEACH.FRONT0 - run * C.speed;
    // 整体水位：缓慢上涨 + 不规则的起伏；隔一阵还有一道大浪
    let rise = run * C.rise + 0.18 * (0.5 + 0.5 * Math.sin(t * 0.17 + 1.3 * Math.sin(t * 0.05)));
    this.surgeT -= dt;
    if (this.surgeT <= 0 && !this.surge && run > 0) {
      this.surge = { t: 0 };
      this.shakeAmt = Math.max(this.shakeAmt, 0.12);
      if (S.ctx) S.whoosh();
      say('surge', '一道大浪扑上了沙滩——离水边远一点！');
    }
    if (this.surge) {
      this.surge.t += dt;
      const k = this.surge.t / 4.5;
      rise += Math.sin(Math.min(1, k) * Math.PI) * C.surge;
      if (k >= 1) { this.surge = null; this.surgeT = C.surgeEvery[0] + Math.random() * (C.surgeEvery[1] - C.surgeEvery[0]); }
    }
    T.rise = rise;
    const ground = beachGround(P.x, P.z), sea = beachSea(P.z, T, this.time);
    const depth = sea - ground, dry = -depth;
    this.floorY = damp(this.floorY, ground + Math.max(0, depth) * -0.25, 12, dt);
    this.beachWade = depth > 0.02 ? 1 : 0;
    // 干沙松软难跑；被海水压实的湿沙最好跑，但离浪也最近
    this.beachSoft = smoothstep(0.35, 0.9, dry - 0.12);
    if (depth > C.drown) { this.die('tide'); return; }
    if (this.beachWade) say('wade', '海水没过了脚踝——冰凉、黏稠，还在往你腿上爬。快回到沙滩上！');
    // 靠近海水：理智流失，水下的东西越来越清楚，浪声里混进了别的声音
    const near = smoothstep(0.9, 0.0, dry);
    this.haunt = damp(this.haunt, clamp(near + (run > 0 ? 0.15 : 0), 0, 1), 1.5, dt);
    P.sanity = clamp(P.sanity - near * C.sanity * dt, 0, 100);
    if (near > 0.5) say('near', '浪声里……混着机器声、履带声、说话声、哭声和祈祷声。水底下有东西在看着你。');
    if (S.ctx) {
      S.setSeaVoice(near * (0.35 + 0.65 * this.haunt));
      if (S.beacon && S.beacon.waves) S.setPos(S.beacon.p, Math.max(P.x, beachWaterline(P.z, sea)) + 3, 0.4, P.z);
    }
    this.beachWhisper = (this.beachWhisper || 3) - dt;
    if (near > 0.6 && this.beachWhisper <= 0) {
      if (S.ctx) S.whisper(0.8);
      this.beachWhisper = 2.5 + Math.random() * 3;
      if (Math.random() < 0.35) this.msg('……趁潮水来之前，离开……');
    }
    // 涨潮前锋逼近
    const gap = T.front - P.z;
    if (run > 0) say('flood', '远处的海平面忽然隆起——涨潮了！海水正从南边一路吞过来，快往北跑！');
    if (run > 0 && gap < 40) say('behind', '身后的浪声越来越响。别回头，别停下。');
    if (run > 0 && gap < 20) this.shakeAmt = Math.max(this.shakeAmt, 0.06 * (1 - gap / 20));
    if (P.z < 222 && P.z > 188) say('narrow', '前面的礁石一直伸进了海里——只能踩着水边绕过去。');
    // 起雾
    this.haze = smoothstep(C.fogAt, C.fogAt + 12, t);
    if (this.haze > 0.05) say('fog', '海滩上忽然起雾了。沿着岩壁直走，不要停。');
    const e = this.world.exit;
    if (Math.hypot(e.x - P.x, e.z - P.z) < 30) say('gate', '雾里出现了一道铁门，门楣上刻着：EXIST。');
  }

  // 纸条 / 终端面板：再按一次 E 或走开就会合上，放着不管也会在一段时间后自动收起
  showNote(title, body, src) {
    $('note-title').textContent = title;
    $('note-body').textContent = body;
    $('note').classList.remove('hidden');
    this.noteSrc = src;
    clearTimeout(this.noteTimer);
    this.noteTimer = setTimeout(() => this.hideNote(), Math.max(8000, body.length * 90));
  }

  hideNote() {
    clearTimeout(this.noteTimer);
    this.noteSrc = null;
    $('note').classList.add('hidden');
  }

  alertEntity(x, z) {
    if (this.settings.stealth) return;
    const E = this.entity;
    if (!E.active) E.trySpawn();
    E.alert(x, z);
  }

  // Level 1.5 的被动切出：活得越久概率越高（每 2 秒 +0.5%），每 5 秒自动判定一次
  updateNoclip(dt) {
    const L = this.level;
    if (!L.noclipTo) return;
    this.ncGrow += dt;
    while (this.ncGrow >= 2) { this.ncGrow -= 2; this.noclip = Math.min(1, this.noclip + 0.005); }
    this.ncCool -= dt;
    if (this.ncCool > 0) return;
    this.ncCool = 5;
    if (Math.random() < this.noclip) {
      this.msg('你的身体毫无预兆地穿过了墙壁——');
      this.glitch = 1;
      this.reachExit(LEVELS.findIndex((l) => l.id === L.noclipTo));
      return;
    }
    // 没有切出：画面轻微闪烁一下作为提示
    this.glitch = Math.max(this.glitch, 0.25);
    const nc = $('noclip');
    nc.classList.add('fail');
    setTimeout(() => nc.classList.remove('fail'), 600);
  }

  pickup(it, chunk) {
    const P = this.player;
    this.world.picked.add(it.id);
    const i = chunk.items.indexOf(it);
    if (i >= 0) chunk.items.splice(i, 1);
    if (it.type === 'almond') { P.almond++; this.msg('获得 杏仁水（按 Q 饮用，恢复理智）'); }
    else if (it.type === 'lidar') {
      P.lidar = true;
      $('radar').classList.remove('hidden');
      this.msg('拿到了 LiDAR 扫描仪。在全黑的地方按住 G 向前扫描，墙面会亮起光点。');
      setTimeout(() => { if (this.state === 'playing') this.msg('右下角的屏幕会显示附近的“怨魂”：红点越近，哔声越急。'); }, 2600);
    }
    else { P.batteries++; this.msg('获得 电池（按 R 更换）'); }
    this.sound.pickup();
    this.focus = null;
  }

  onChaseStart(e) {
    this.shakeAmt = Math.max(this.shakeAmt, 0.25);
    if (e.onScreen) this.sound.stinger();
  }

  onEntityStep(e) {
    const v = { hound: 0.7, stalker: 0.8, chaser: 1.0, partygoer: 0.55 }[e.type];
    if (v) this.sound.entityStep(v);
  }

  // ---------------------------------------------------------
  //  辅助
  // ---------------------------------------------------------
  inView(x, y, z, margin = 0) {
    const v = this.view;
    const vx = v[0] * x + v[4] * y + v[8] * z + v[12];
    const vy = v[1] * x + v[5] * y + v[9] * z + v[13];
    const vz = v[2] * x + v[6] * y + v[10] * z + v[14];
    if (vz > -0.2) return false;
    const f = 1 / Math.tan((this.curFov * Math.PI) / 360);
    const aspect = this.renderer.cw / this.renderer.ch;
    const nx = (vx * f) / aspect / -vz, ny = (vy * f) / -vz;
    return Math.abs(nx) < 1 + margin && Math.abs(ny) < 1 + margin;
  }

  // 找到视野最开阔的朝向
  openYaw(x, z) {
    let best = 0, bestD = -1;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, fx = -Math.sin(a), fz = -Math.cos(a);
      let d = 1;
      while (d < 30 && this.world.los(x, z, x + fx * d, z + fz * d)) d += 0.5;
      if (d > bestD) { bestD = d; best = a; }
    }
    return best;
  }

  angleTo(x, y, z) {
    const P = this.player;
    const dx = x - P.x, dy = y - this.camY, dz = z - P.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    const f = this.fwd;
    return Math.acos(clamp((dx * f[0] + dy * f[1] + dz * f[2]) / d, -1, 1));
  }

  streamChunks(all) {
    if (this.world.fixedBounds) {
      // 封闭池厅 / 剧情电站一次加载完整地图，边界处不会再生成新的房间。
      const b = this.world.fixedBounds;
      for (let cz = b.minZ; cz <= b.maxZ; cz++) for (let cx = b.minX; cx <= b.maxX; cx++) {
        const key = (cx & 0xffff) * 65536 + (cz & 0xffff);
        if (this.renderer.meshes.has(key)) continue;
        const c = this.world.chunk(cx, cz);
        this.renderer.addChunkMesh(key, buildChunkMesh(c, this.world), cx, cz);
      }
      return;
    }
    const P = this.player, R = 2, cs = CHUNK * CELL;
    const pcx = Math.floor(P.x / cs), pcz = Math.floor(P.z / cs);
    let budget = all ? 999 : 2;
    for (const [dx, dz] of CHUNK_ORDER) {
      const cx = pcx + dx, cz = pcz + dz;
      const key = (cx & 0xffff) * 65536 + (cz & 0xffff);
      if (this.renderer.meshes.has(key)) continue;
      if (budget-- <= 0) break;
      const c = this.world.chunk(cx, cz);
      this.renderer.addChunkMesh(key, buildChunkMesh(c, this.world), cx, cz);
    }
    for (const [key, m] of this.renderer.meshes) {
      if (Math.abs(m.cx - pcx) > R + 1 || Math.abs(m.cz - pcz) > R + 1) this.renderer.deleteMesh(key);
    }
  }

  gatherLights(dt) {
    const P = this.player, W = this.world, L = this.level, t = this.time;
    const list = this.nearLights;
    list.length = 0;
    const cs = CHUNK * CELL;
    const pcx = Math.floor(P.x / cs), pcz = Math.floor(P.z / cs);
    const R2 = 46 * 46;
    const playing = this.state === 'playing';
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const c = W.peekChunk(pcx + dx, pcz + dz);
        if (!c) continue;
        for (const l of c.lights) {
          const ddx = l.x - P.x, ddz = l.z - P.z, d2 = ddx * ddx + ddz * ddz;
          if (d2 > R2) continue;
          if (c.pool && !W.los(P.x, P.z, l.x, l.z)) continue;
          const lv = W.lightLevel(l, t) * this.globalFlicker * this.power * (W.plant ? W.plantPower(l.x, l.z) : 1)
            * (this.gim ? this.gim.lightMul : 1);
          const on = lv > 0.3;
          if (on !== l.on) {
            l.on = on;
            if (playing && d2 < 64 && l.type === 1 && !L.light.strobe) this.sound.lightBuzz(1 - Math.sqrt(d2) / 8);
          }
          l.level = lv;
          l.d2 = d2;
          list.push(l);
        }
      }
    }
    const rad = L.light.radius;
    const lim = L.gen === 'pools' ? R2 : (rad + 3) * (rad + 3);
    const cand = list.filter((l) => l.level > 0.02 && l.d2 < lim).sort((a, b) => a.d2 - b.d2);
    const lp = this.renderer.lp, lc = this.renderer.lc;
    const col = L.light.color, I = L.light.intensity;
    let n = 0;
    const e = W.exit;
    if (e && this.state !== 'title' && !L.noExit && !L.noFlash && !['poster', 'pit'].includes(L.exitKind)) {
      const d2 = (e.x - P.x) ** 2 + (e.z - P.z) ** 2;
      if (d2 < 22 * 22) {
        const ready = this.exitReady();
        const pulse = (0.85 + 0.15 * Math.sin(t * 3)) * (ready ? 1 : 0.15);
        lp[0] = e.x + e.nx * 0.7; lp[1] = L.doorTop + 0.25; lp[2] = e.z + e.nz * 0.7; lp[3] = 1.3 * pulse;
        if (L.exitKind === 'hdoor') { lp[3] = 1.5; lc[0] = 1.0; lc[1] = 0.9; lc[2] = 0.72; }
        else { lc[0] = 1.0; lc[1] = 0.1; lc[2] = 0.06; }
        n = 1;
      }
    }
    for (const l of cand) {
      if (n >= MAXL) break;
      lp[n * 4] = l.x; lp[n * 4 + 1] = l.y - 0.05; lp[n * 4 + 2] = l.z; lp[n * 4 + 3] = I * l.level * (l.power === undefined ? 1 : l.power);
      lc[n * 3] = col[0]; lc[n * 3 + 1] = col[1]; lc[n * 3 + 2] = col[2];
      n++;
    }
    if (this.gim) n = this.gim.lights(lp, lc, n);
    if (this.hunt) n = this.hunt.lights(lp, lc, n);
    this.lightCount = n;
    this.poolColumnCount = 0;
    if (L.gen === 'pools') {
      const columns = [];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const c = W.peekChunk(pcx + dx, pcz + dz);
        if (!c || !c.pool) continue;
        for (const q of c.pool.columns) {
          const x = c.cx * cs + q.x, z = c.cz * cs + q.z;
          columns.push({ x, z, r: q.r, top: q.top, d: (x - P.x) ** 2 + (z - P.z) ** 2 });
        }
      }
      columns.sort((a, b) => a.d - b.d);
      for (const q of columns.slice(0, MAX_POOL_COLUMNS)) {
        this.renderer.poolColumns.set([q.x, q.z, q.r, q.top], this.poolColumnCount * 4);
        this.poolColumnCount++;
      }
    }
    let sum = 0;
    for (let k = 0; k < n; k++) {
      const dx = lp[k * 4] - P.x, dy = lp[k * 4 + 1] - 1.2, dz = lp[k * 4 + 2] - P.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const x2 = d2 / (rad * rad);
      const win = clamp(1 - x2 * x2, 0, 1);
      sum += (lp[k * 4 + 3] * win * win) / (1 + d2 * 0.35);
    }
    P.light = L.outdoor ? 1.2 : clamp(sum / 1.3, 0, 1.5);
    P.lightSmooth = dt > 0 ? damp(P.lightSmooth, P.light, 2.5, dt) : P.light;
  }

  // ---------------------------------------------------------
  //  主循环
  // ---------------------------------------------------------
  frame(ts) {
    requestAnimationFrame((t) => this.frame(t));
    this.controls.update();
    const now = ts / 1000;
    let dt = now - this.last;
    this.last = now;
    if (!(dt > 0)) dt = 0.016;
    dt = Math.min(dt, 0.05);
    try {
      this.step(dt);
    } catch (e) {
      console.error(e);
      showError(e.stack || e.message);
      throw e;
    }
  }

  step(dt) {
    if (this.state === 'paused' || this.state === 'card' || this.state === 'dead' || this.state === 'ending') {
      return; // 画布保留最后一帧
    }
    this.time += dt;
    if (this.state === 'playing') this.update(dt);
    else if (this.state === 'dying') this.updateDying(dt);
    else if (this.state === 'exiting') this.updateExiting(dt);
    else if (this.state === 'title') this.updateTitle(dt);
    if (this.world) this.render(dt);
  }

  updateTitle(dt) {
    const P = this.player;
    P.yaw += dt * 0.05;
    P.pitch = 0.04 + Math.sin(this.time * 0.2) * 0.03;
    this.gatherLights(dt);
    if (this.sound.ctx) this.sound.setHum(0.35 * this.level.hum);
  }

  update(dt) {
    const P = this.player, L = this.level, W = this.world, K = this.keys;
    this.levelTime += dt;
    this.runTime += dt;
    if (this.hunt) { this.hunt.update(dt); if (this.state !== 'playing') return; this.fade = damp(this.fade, 0, 2.2, dt); return; }
    if (this.slideRide) {
      this.updateSlide(dt);
      this.streamChunks(false); this.gatherLights(dt); this.updateAudio(dt);
      this.fade = damp(this.fade, 0, 2.2, dt);
      return;
    }

    // ---- 移动 ----
    const crouch = !!(K.KeyC || this.controls.crouch);
    P.crouch = damp(P.crouch, crouch ? 1 : 0, 10, dt);
    const fwdIn = clamp((K.KeyW || K.ArrowUp ? 1 : 0) - (K.KeyS || K.ArrowDown ? 1 : 0) + this.controls.y, -1, 1);
    const strIn = clamp((K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0) + this.controls.x, -1, 1);
    const moving = fwdIn !== 0 || strIn !== 0;
    const wantSprint = (K.ShiftLeft || K.ShiftRight || this.controls.sprint) && fwdIn > 0 && !crouch && !P.exhausted;
    P.sprinting = wantSprint && P.stamina > 0 && moving;
    const sDrain = L.staminaDrain || 17, sRegen = (L.staminaRegen || 11) * (this.gim ? this.gim.staminaRegenMul : 1);
    if (P.sprinting) {
      P.stamina -= sDrain * dt;
      P.staminaDelay = 0.9;
      if (P.stamina <= 0) { P.stamina = 0; P.exhausted = true; this.msg('你已经跑不动了……'); }
    } else {
      P.staminaDelay -= dt;
      if (P.staminaDelay <= 0) P.stamina = Math.min(100, P.stamina + sRegen * (moving ? 0.7 : 1) * dt);
      if (P.exhausted && P.stamina > 35) P.exhausted = false;
    }
    let speed = crouch ? 1.15 : P.sprinting ? 4.4 * (L.sprintMul || 1) : 2.3;
    speed *= L.speedMul || 1;
    if (this.gim) speed *= this.gim.speedMul;
    const waterDepth = L.water ? Math.max(0, L.water - W.floorAt(P.x, P.z)) : 0;
    if (waterDepth > 0.12) speed *= waterDepth > 1.15 ? 0.62 : 0.78;
    if (P.sanity < 20) speed *= 0.9;
    if (L.gen === 'beach') speed *= this.beachWade > 0 ? 0.6 : 1 - 0.2 * this.beachSoft;
    const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
    let mx = -sy * fwdIn + cy * strIn, mz = -cy * fwdIn - sy * strIn;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    P.vx = damp(P.vx, mx * speed, 10, dt);
    P.vz = damp(P.vz, mz * speed, 10, dt);
    const ox = P.x, oz = P.z;
    {
      // 大位移拆成 0.22 米的小步，低帧率下也不会一步跨过薄墙
      const dx = P.vx * dt, dz = P.vz * dt;
      const rad = 0.28 + (L.wallPad || 0);
      const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.22));
      let nx = P.x, nz = P.z;
      for (let k = 0; k < n; k++) [nx, nz] = W.collide(nx + dx / n, nz + dz / n, rad);
      P.x = nx; P.z = nz;
    }
    if (L.water) {
      const top = W.floorAt(ox, oz) + 0.34;
      if (W.floorAt(P.x, P.z) > top) {
        // 池壁不能直接爬上去，沿台阶逐级返回池沿
        if (W.floorAt(P.x, oz) <= top) P.z = oz;
        else if (W.floorAt(ox, P.z) <= top) P.x = ox;
        else { P.x = ox; P.z = oz; }
      }
    }
    const moved = Math.hypot(P.x - ox, P.z - oz);
    P.speed = moved / dt;

    // ---- 头部晃动 & 脚步声 ----
    const stride = P.sprinting ? 1.05 : crouch ? 0.6 : 0.8;
    P.bob += (moved / stride) * Math.PI;
    const idx = Math.floor(P.bob / Math.PI);
    if (idx !== P.stepIdx) {
      P.stepIdx = idx;
      if (P.speed > 0.4) {
        const wet = L.water ? W.floorAt(P.x, P.z) < L.water - 0.02 : this.beachWade > 0 || this.inPuddle(P.x, P.z);
        if (wet) this.splash = 0.6;
        this.sound.footstep(wet ? 'water' : L.surface, crouch ? 0.22 : P.sprinting ? 1.0 : 0.6);
        if (L.gen === 'beach' && !wet) {
          // 沙地上的脚印，左右交替
          const side = (idx & 1) ? 1 : -1, rx = Math.cos(P.yaw) * 0.13 * side, rz = -Math.sin(P.yaw) * 0.13 * side;
          this.prints.push({ x: P.x + rx, z: P.z + rz, yaw: P.yaw, side });
          if (this.prints.length > 90) this.prints.shift();
        }
      }
    }
    P.bobAmt = damp(P.bobAmt, clamp(P.speed / 4.4, 0, 1), 8, dt);
    this.playerNoise = P.speed < 0.3 ? 0 : crouch ? (L.silentCrouch ? 0 : 2) : P.sprinting ? 22 : 7.5;
    // 踩水的声音传得更远
    this.splash -= dt;
    if (this.splash > 0 && P.speed > 0.3) this.playerNoise = Math.max(this.playerNoise, crouch ? 6 : 13);

    this.updateBlackout(dt);
    this.updateSteam(dt);
    if (L.noFlash || this.inDark) P.flash = false;

    // ---- 手电筒 ----
    if (P.flash) {
      P.battery -= 0.85 * dt;
      if (P.battery <= 0) {
        P.battery = 0; P.flash = false;
        this.msg(P.batteries > 0 ? '手电筒没电了 —— 按 R 更换电池' : '手电筒没电了');
        this.sound.click(0.3);
      }
    }

    // ---- 全局闪烁（理智低时） ----
    this.gfTimer -= dt;
    if (this.gfTimer <= 0) {
      if (this.ins > 0.45 && Math.random() < this.ins * 0.6) {
        this.globalFlicker = 0.08;
        this.gfDur = 0.06 + Math.random() * 0.3;
        this.sound.lightBuzz(0.8);
      }
      this.gfTimer = 1 + Math.random() * 3;
    }
    if (this.gfDur > 0) {
      this.gfDur -= dt;
      if (this.gfDur <= 0) this.globalFlicker = 1;
    }

    this.streamChunks(false);
    this.gatherLights(dt);
    this.entity.update(dt);
    if (this.state !== 'playing') return;
    if (this.gim) this.gim.update(dt);

    // ---- 理智 ----
    const E = this.entity;
    let drain = L.sanityDrain * (this.gim ? this.gim.sanityMul : 1) + (this.gim ? this.gim.extraDrain : 0);
    if (P.lightSmooth < 0.22) drain *= P.flash ? 1.5 : L.darkDrainMul;
    if (E.active && L.gen !== 'corridor') {
      if (E.onScreen && E.dist < 20 && E.cfg.tex >= 0) drain += (E.type === 'smiler' ? 3.2 : 1.5) * (1 - E.dist / 20) + 0.4;
      if (E.state === 'chase') drain += 0.6;
    }
    if (this.phantom) drain += 1.5;
    if (L.calm && (P.lightSmooth > 0.25 || (waterDepth > 0.12 && this.underwater < 0.2))) drain = -0.8;
    P.sanity = clamp(P.sanity - drain * dt, 0, 100);
    this.ins = smoothstep(65, 0, P.sanity);
    if (P.sanity <= 0) { this.die('insanity'); return; }

    this.updatePhantom(dt);
    this.updateNoclip(dt);
    this.checkWindows();
    if (this.state !== 'playing') return;
    this.updateLevelRules(dt);
    if (this.state !== 'playing') return;
    this.updateFocus();
    this.updateAudio(dt);

    this.fade = damp(this.fade, 0, 2.2, dt);
    this.glitch = damp(this.glitch, this.ins > 0.85 ? 0.15 : 0, 1.8, dt);
    this.hurt = damp(this.hurt, 0, 2, dt);
    if (E.active && E.state === 'chase' && E.dist < 8) this.hurt = Math.max(this.hurt, (1 - E.dist / 8) * 0.35);
  }

  // 电站的断线 / 火花，泳池里的下沉；均使用各层已经生成的数据
  updateLevelRules(dt) {
    const P = this.player, L = this.level, W = this.world;
    if (L.water) {
      const floor = W.floorAt(P.x, P.z), stand = lerp(1.62, 1, P.crouch);
      const target = (this.keys.KeyC || this.controls.crouch) ? floor : Math.max(floor, L.water + 0.18 - stand);
      this.floorY = damp(this.floorY, target, 5, dt);
      this.underwater = clamp((L.water - this.floorY - lerp(1.62, 1, P.crouch)) * 2, 0, 1);
      if (W.deepAt(P.x, P.z) === 2 && this.underwater > 0.7 && this.floorY < -2.2) this.submergeTime += dt;
      else this.submergeTime = 0;
      if (this.submergeTime > 0.9) {
        this.msg('你沉进了池底。脚下的瓷砖忽然消失了——');
        this.reachExit();
      }
    }
    if (L.gen === 'lightsout') this.updateLightsOut(dt);
    if (W.party) this.updateParty(dt);
    if (L.gen === 'beach') { this.updateBeach(dt); if (this.state !== 'playing') return; }
    if (L.dim && !this.dimWarned && this.levelTime > L.dim.start) {
      this.dimWarned = true;
      this.msg('四周的余光……正在一点点暗下去。');
    }
    if (L.gen !== 'station') return;
    if (W.plant) this.updatePlant(dt);
    this.wireCool = Math.max(0, this.wireCool - dt);
    for (let k = this.sparks.length - 1; k >= 0; k--) {
      const s = this.sparks[k];
      s.t -= dt; s.x += s.vx * dt; s.z += s.vz * dt; s.y += s.vy * dt; s.vy -= dt * 5;
      if (s.t <= 0 || s.y < 0) this.sparks.splice(k, 1);
    }
    const cs = CHUNK * CELL, pcx = Math.floor(P.x / cs), pcz = Math.floor(P.z / cs);
    let motor = 0;
    const spark = (f, y) => {
      const d = Math.hypot(P.x - f.x, P.z - f.z);
      if (d > 22) return;
      f.t -= dt;
      if (f.t > 0) return;
      f.t = 0.7 + Math.random() * 2.2;
      this.sound.electricSpark(f.x, y, f.z, clamp(1 - d / 22, 0, 1));
      for (let k = 0; k < 5 && this.sparks.length < 90; k++) {
        this.sparks.push({ x: f.x, y, z: f.z, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2,
          vy: 0.5 + Math.random() * 2, t: 0.15 + Math.random() * 0.3 });
      }
    };
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = W.peekChunk(pcx + dx, pcz + dz);
        if (!c) continue;
        for (const g of c.gens) {
          if (W.gensOn.has(g.id)) motor = Math.max(motor, 1 / (1 + Math.hypot(g.x - P.x, g.z - P.z) * 0.18));
        }
        for (const f of c.fixtures) if (f.spark) spark(f, f.y + 0.25);
        for (const w of c.wires) {
          spark(w, 0.04);
          if (this.wireCool > 0 || Math.hypot(w.x - P.x, w.z - P.z) > 0.65) continue;
          this.wireCool = 2;
          P.stamina = Math.max(0, P.stamina - 20); P.sanity = Math.max(1, P.sanity - 6);
          this.hurt = 0.65; this.shakeAmt = 0.4;
          this.sound.electricSpark(w.x, 0.1, w.z, 1);
          this.msg('断线迸出火花，你被电得浑身一麻。');
        }
      }
    }
    this.sound.setMachines(motor);
  }

  updateSlide(dt) {
    const r = this.slideRide, P = this.player;
    r.time += dt;
    const t = smoothstep(0, 6, r.time), p = poolSlidePoint(r.slide, t);
    const b = poolSlidePoint(r.slide, Math.min(1, t + 0.008)), a = poolSlidePoint(r.slide, Math.max(0, t - 0.008));
    const enter = smoothstep(0, 0.45, r.time);
    P.x = lerp(r.start[0], p[0], enter); P.z = lerp(r.start[2], p[2], enter);
    this.floorY = lerp(r.start[1], p[1], enter) - lerp(1.62, 1, P.crouch);
    this.underwater = 0;
    P.yaw = Math.atan2(-(b[0] - a[0]), -(b[2] - a[2]));
    P.pitch = Math.atan2(b[1] - a[1], Math.hypot(b[0] - a[0], b[2] - a[2]));
    P.bobAmt = 0; P.sprinting = false;
    if (r.time >= 6) {
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
      P.x += (b[0] - a[0]) / len * 1.2; P.z += (b[2] - a[2]) / len * 1.2;
      this.slideRide = null;
      this.sound.footstep('water', 0.8);
      this.msg('你滑入了温暖的池水。按住 C 可以下潜。');
    }
  }

  // 玩家当前是否站在水洼里
  inPuddle(x, z) {
    const cs = CHUNK * CELL;
    const c = this.world.peekChunk(Math.floor(x / cs), Math.floor(z / cs));
    if (!c) return false;
    for (const p of c.puddles) {
      const dx = x - p.x, dz = z - p.z, ca = Math.cos(p.rot), sa = Math.sin(p.rot);
      const u = (dx * ca + dz * sa) / (p.rx * 0.7), v = (-dx * sa + dz * ca) / (p.rz * 0.7);
      if (u * u + v * v < 1) return true;
    }
    return false;
  }

  // Level 1 的周期性停电：闪烁 → 全黑 → 恢复。停电时猎犬会被惊动，循着你的方向摸过来
  updateBlackout(dt) {
    const B = this.level.blackout;
    if (!B) { this.power = 1; return; }
    const was = this.power;
    this.boTimer -= dt;
    if (this.boState === 0) {
      if (this.boTimer <= 0) { this.boState = 1; this.boTimer = 1.5; this.sound.powerDown(); }
    } else if (this.boState === 1) {
      this.power = Math.sin(this.boTimer * 31) > 0.1 ? clamp(this.boTimer / 1.5 + 0.25, 0, 1) : 0.05;
      if (this.boTimer <= 0) {
        this.boState = 2; this.power = 0;
        this.boTimer = B.dur[0] + Math.random() * (B.dur[1] - B.dur[0]);
        this.msg('灯……全灭了。');
        const P = this.player;
        if (this.entity) this.entity.alert(P.x + (Math.random() - 0.5) * 12, P.z + (Math.random() - 0.5) * 12);
      }
    } else if (this.boState === 2) {
      this.power = 0;
      if (this.boTimer <= 0) { this.boState = 3; this.boTimer = 1.2; this.sound.powerUp(); }
    } else {
      this.power = Math.sin(this.boTimer * 23) > 0.3 ? 1 : 0.1;
      if (this.boTimer <= 0) {
        this.boState = 0; this.power = 1;
        this.boTimer = B.every[0] + Math.random() * (B.every[1] - B.every[0]);
      }
    }
    if ((was > 0.5) !== (this.power > 0.5) && this.boState !== 2) this.sound.lightBuzz(0.7);
  }

  // Level 2 的蒸汽泄漏：从墙边管道喷出、上升、扩散、消散
  updateSteam(dt) {
    const S = this.steam;
    for (let k = S.length - 1; k >= 0; k--) {
      const p = S[k];
      p.t += dt;
      if (p.t > p.life) { S.splice(k, 1); continue; }
      const drag = Math.exp(-1.8 * dt);
      p.vx *= drag; p.vz *= drag; p.vy = p.vy * drag + 0.5 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y > this.level.wallH - 0.2) { p.y = this.level.wallH - 0.2; p.vy = 0; }
    }
    if (!this.level.steam) return;
    const P = this.player, W = this.world, cs = CHUNK * CELL;
    const pcx = Math.floor(P.x / cs), pcz = Math.floor(P.z / cs);
    let best = null, bestD = 1e9;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = W.peekChunk(pcx + dx, pcz + dz);
        if (!c) continue;
        for (const v of c.vents) {
          const d = Math.hypot(v.x - P.x, v.z - P.z);
          const on = (v.offT || 0) <= 0 && Math.sin(this.time * v.rate + v.phase) > -0.2;
          if (on && d < bestD) { bestD = d; best = v; }
          if (!on || d > 20) continue;
          v.acc = (v.acc || 0) + dt * 26;
          while (v.acc > 1) {
            v.acc -= 1;
            if (S.length >= 120) break;
            const sp = 1.3 + Math.random() * 1.0, j = () => (Math.random() - 0.5) * 0.5;
            S.push({ x: v.x, y: v.y, z: v.z, vx: v.nx * sp + j(), vy: j() * 0.6, vz: v.nz * sp + j(),
              t: 0, life: 1.3 + Math.random() * 0.9, s0: 0.1, s1: 0.8 + Math.random() * 0.6 });
          }
        }
      }
    }
    if (best) this.sound.setSteam(best.x, best.y, best.z, 0.5);
    else this.sound.setSteam(P.x, 0, P.z, 0);
  }

  updateFocus() {
    const P = this.player, W = this.world, L = this.level;
    this.focus = null;
    if (this.slideRide) return;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    const e = W.exit;
    if (!L.noExit && L.exitKind !== 'pit') {
      const de = Math.hypot(e.x - P.x, e.z - P.z);
      const front = (P.x - e.x) * e.nx + (P.z - e.z) * e.nz > 0;
      const visible = de < 2.3 && front && W.los(P.x, P.z, e.x + e.nx * 0.2, e.z + e.nz * 0.2);
      const ready = this.exitReady();
      if (visible && de < 0.75 && ready && L.exitKind !== 'poster') { this.reachExit(); return; }
      if (visible && (de < 1 || ((e.x - P.x) * fx + (e.z - P.z) * fz) / de > 0.4)) {
        this.focus = { type: 'exit' };
        return;
      }
    }
    let best = 0;
    const story = W.plant || W.party, stype = W.plant ? 'plant' : 'party';
    if (story) {
      for (const o of story.objs) {
        if (o.taken) continue;
        const ix = o.x - P.x, iz = o.z - P.z, d = Math.hypot(ix, iz);
        if (d > 2.3 || !W.los(P.x, P.z, o.x + (o.nx || 0) * 0.2, o.z + (o.nz || 0) * 0.2, true)) continue;
        if (o.nx !== undefined && ix * o.nx + iz * o.nz > 0) continue; // 墙上的面板只能从正面操作
        const dot = d > 0.01 ? (ix * fx + iz * fz) / d : 1, score = dot + 2.3 - d;
        if ((dot > 0.3 || d < 0.7) && score > best) { best = score; this.focus = { type: stype, obj: o }; }
      }
    }
    const cs = CHUNK * CELL;
    const pcx = Math.floor(P.x / cs), pcz = Math.floor(P.z / cs);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = W.peekChunk(pcx + dx, pcz + dz);
        if (!c) continue;
        if (c.pool && c.pool.slide) {
          const slide = c.pool.slide, ix = slide.x - P.x, iz = slide.z - P.z, d = Math.hypot(ix, iz);
          if (d < 1.8 && Math.abs(this.floorY - slide.y) < 0.5 && iz * fz + ix * fx > -0.2) {
            this.focus = { type: 'slide', slide };
            return;
          }
        }
        for (const gen of c.gens) {
          if (W.gensOn.has(gen.id)) continue;
          const ix = gen.x - P.x, iz = gen.z - P.z, d = Math.hypot(ix, iz);
          if (d > 2.3 || !W.los(P.x, P.z, gen.x, gen.z, true)) continue;
          const dot = d > 0.01 ? (ix * fx + iz * fz) / d : 1, score = dot + 2.3 - d;
          if (dot > 0.3 && score > best) { best = score; this.focus = { type: 'generator', gen }; }
        }
        for (const dispenser of c.dispensers) {
          const ix = dispenser.x - P.x, iz = dispenser.z - P.z, d = Math.hypot(ix, iz);
          if (d > 1.8 || !W.los(P.x, P.z, dispenser.x, dispenser.z)) continue;
          const dot = d > 0.01 ? (ix * fx + iz * fz) / d : 1, score = dot + 1.8 - d;
          if (dot > 0.3 && score > best) { best = score; this.focus = { type: 'dispenser', dispenser }; }
        }
        for (const poster of c.posters) {
          const ix = poster.x - P.x, iz = poster.z - P.z, d = Math.hypot(ix, iz);
          if (d > 1.8 || ix * poster.nx + iz * poster.nz > 0) continue;
          if (!W.los(P.x, P.z, poster.x + poster.nx * 0.2, poster.z + poster.nz * 0.2)) continue;
          const dot = d > 0.01 ? (ix * fx + iz * fz) / d : 1, score = dot + 1.8 - d;
          if (dot > 0.4 && score > best) { best = score; this.focus = { type: 'poster', poster }; }
        }
        for (const it of c.items) {
          const ix = it.x - P.x, iz = it.z - P.z, d = Math.hypot(ix, iz);
          if (d > (L.touch ? 1.1 : 1.8) || !W.los(P.x, P.z, it.x, it.z, true)) continue;
          const dot = d > 0.01 ? (ix * fx + iz * fz) / d : 1;
          const score = dot + (1.8 - d);
          if ((dot > 0.4 || d < 0.8) && score > best) {
            best = score;
            this.focus = { type: 'item', item: it, chunk: c };
          }
        }
      }
    }
  }

  updatePhantom(dt) {
    const P = this.player;
    if (this.level.gen === 'corridor') return;
    if (this.phantom) {
      this.phantom.t -= dt;
      const d = Math.hypot(this.phantom.x - P.x, this.phantom.z - P.z);
      if (this.phantom.t <= 0 || d < 7) this.phantom = null;
      return;
    }
    const cfg = ENTITY_TYPES[this.level.entity];
    if (this.ins < 0.45 || !cfg || cfg.tex < 0) return; // 没有形体的实体不会产生幻影
    this.phantomTimer -= dt;
    if (this.phantomTimer > 0) return;
    this.phantomTimer = 6 + Math.random() * 14 * (1.2 - this.ins);
    const a = P.yaw + (Math.random() - 0.5) * 0.9;
    const d = 9 + Math.random() * 9;
    const x = P.x - Math.sin(a) * d, z = P.z - Math.cos(a) * d;
    if (!this.world.los(P.x, P.z, x, z)) return;
    this.phantom = { x, z, t: 0.35 + Math.random() * 0.9, cfg };
    this.sound.whisper(0.9);
  }

  updateAudio(dt) {
    const P = this.player, L = this.level, S = this.sound, E = this.entity;
    if (!S.ctx) return;
    S.setHum(L.hum * clamp(P.lightSmooth, 0, 1) * 0.55 * this.globalFlicker * this.power);
    const e = this.world.exit;
    S.updateBeacon(Math.hypot(e.x - P.x, e.z - P.z));

    this.ambTimer -= dt;
    if (this.ambTimer <= 0) {
      const kinds = { lobby: ['thud', 'steps', 'slam', 'thud'], warehouse: ['drip', 'drip', 'drip', 'thud', 'clank', 'steps'],
        pipes: ['groan', 'clank', 'groan', 'drip', 'hiss', 'thud'], office: ['thud', 'slam', 'steps'],
        house: ['steps', 'groan', 'thud', 'slam', 'steps'], station: ['clank', 'groan', 'clank'],
        party: ['steps', 'thud'], pool: ['drip', 'drip'], silence: [], alarm: [] }[L.drone] || [];
      if (kinds.length) S.distant(kinds[Math.floor(Math.random() * kinds.length)]);
      const quiet = L.drone === 'lobby' || L.drone === 'office';
      this.ambTimer = (quiet ? 12 : 4) + Math.random() * (quiet ? 22 : 14);
    }

    if (this.ins > 0.5) {
      this.whisperTimer -= dt;
      if (this.whisperTimer <= 0) {
        S.whisper(this.ins);
        if (this.ins > 0.8 && Math.random() < 0.3) S.distant('scream');
        this.whisperTimer = 4 + Math.random() * 8;
      }
    }

    let fear = this.ins * 0.7;
    if (E.active) {
      // 母亲只能靠声音判断远近，心跳只在她几乎贴到身边时才会加速
      if (E.type === 'mimic') { /* 声音错觉没有真实的追逐距离 */ }
      else if (E.type === 'mother') fear = Math.max(fear, clamp(1 - E.dist / 5, 0, 1) * 0.8);
      else fear = Math.max(fear, clamp(1 - E.dist / 16, 0, 1) * (E.state === 'chase' || E.onScreen ? 1 : 0.6));
    }
    if (fear > 0.2) {
      this.heartTimer -= dt;
      if (this.heartTimer <= 0) {
        S.heartbeat(0.3 + fear * 0.7);
        this.heartTimer = 60 / (65 + fear * 85);
      }
    }

    if (P.stamina < 35 || P.exhausted) {
      this.breathTimer -= dt;
      if (this.breathTimer <= 0) {
        this.breathIn = !this.breathIn;
        S.breath(0.4 + (1 - P.stamina / 35) * 0.6, this.breathIn);
        this.breathTimer = this.breathIn ? 0.55 : 0.5;
      }
    }
  }

  // ---------------------------------------------------------
  //  渲染
  // ---------------------------------------------------------
  billboard(mb, x, z, y0, w, h, layer, emit, off) {
    const P = this.player;
    const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    const nx = Math.sin(P.yaw), nz = Math.cos(P.yaw);
    const cx = x + nx * off, cz = z + nz * off, hw = w / 2;
    mb.quad([cx - rx * hw, y0, cz - rz * hw], [cx + rx * hw, y0, cz + rz * hw],
      [cx + rx * hw, y0 + h, cz + rz * hw], [cx - rx * hw, y0 + h, cz - rz * hw],
      [nx, 0, nz], [0, 1, 1, 1, 1, 0, 0, 0], layer, emit);
  }

  buildDynamic() {
    const mb = this.dyn;
    mb.reset();
    const P = this.player, L = this.level, W = this.world, t = this.time;
    const H = L.wallH, py = H - 0.006;
    const fixture = L.light.fixture || 'panel';
    for (const l of this.nearLights) {
      if (fixture === 'none') break; // 光源不可见（Level 1.5）
      const dead = l.type === 2 || l.level < 0.02;
      const em = dead ? 0 : -(0.2 + l.level * 2.4);
      if (fixture === 'tube') {
        // 吊链悬挂的双管荧光灯：金属灯架 + 两根裸露的灯管
        const y = l.y, hl = 0.62;
        meshSmallBox(mb, l.x - hl - 0.04, y + 0.045, l.z - 0.1, l.x + hl + 0.04, y + 0.09, l.z + 0.1, TEX.METAL);
        for (const dz of [-0.055, 0.055]) {
          meshSmallBox(mb, l.x - hl, y, l.z + dz - 0.02, l.x + hl, y + 0.04, l.z + dz + 0.02, dead ? TEX.LIGHT_OFF : TEX.LIGHT, em * 1.5);
        }
        if (l.d2 < 500) {
          for (const dx of [-0.45, 0.45]) meshSmallBox(mb, l.x + dx - 0.006, y + 0.09, l.z - 0.006, l.x + dx + 0.006, H, l.z + 0.006, TEX.METAL);
        }
      } else if (fixture === 'bulb') {
        // 从天花板垂下的防护罩灯泡
        const y = l.y;
        meshSmallBox(mb, l.x - 0.065, y - 0.11, l.z - 0.065, l.x + 0.065, y + 0.05, l.z + 0.065, dead ? TEX.METAL : TEX.BULB, dead ? 0 : em * 1.2);
        meshSmallBox(mb, l.x - 0.05, y + 0.05, l.z - 0.05, l.x + 0.05, y + 0.12, l.z + 0.05, TEX.METAL);
        meshSmallBox(mb, l.x - 0.012, y + 0.12, l.z - 0.012, l.x + 0.012, H, l.z + 0.012, TEX.METAL);
      } else if (fixture === 'skylight') {
        // 宽大的天光口，边框仍是同样的白瓷砖
        const pw = 1.15, pd = 0.75;
        mb.quad([l.x - pw, py, l.z - pd], [l.x + pw, py, l.z - pd], [l.x + pw, py, l.z + pd], [l.x - pw, py, l.z + pd],
          [0, -1, 0], [0, 0, 1, 0, 1, 1, 0, 1], dead ? TEX.L37_TILE : TEX.LIGHT, dead ? 0 : em * 0.65);
      } else {
        const pw = 0.5, pd = 0.25;
        mb.quad([l.x - pw, py, l.z - pd], [l.x + pw, py, l.z - pd], [l.x + pw, py, l.z + pd], [l.x - pw, py, l.z + pd],
          [0, -1, 0], [0, 0, 1, 0, 1, 1, 0, 1], dead ? TEX.LIGHT_OFF : TEX.LIGHT, em);
      }
    }
    // 蒸汽（emit 通道存放不透明度）
    for (const p of this.steam) {
      const k = p.t / p.life, s = lerp(p.s0, p.s1, Math.sqrt(k));
      const op = 0.6 * (1 - k) * smoothstep(0, 0.12, p.t);
      this.billboard(mb, p.x, p.z, p.y - s / 2, s, s, TEX.STEAM, op, 0);
    }
    for (const s of this.sparks) this.billboard(mb, s.x, s.z, s.y, 0.025, 0.07, TEX.BULB, 4, 0);
    const face = (e, y, w, h, layer, emit = 0, uv = [0, 1, 1, 1, 1, 0, 0, 0]) => {
      const rx = e.nz * w / 2, rz = -e.nx * w / 2;
      mb.quad([e.x - rx, y, e.z - rz], [e.x + rx, y, e.z + rz], [e.x + rx, y + h, e.z + rz], [e.x - rx, y + h, e.z - rz],
        [e.nx, 0, e.nz], uv, layer, emit);
    };
    // 各层出口：电梯、楼梯、反写海报；深水池已经在静态地形里
    const e = W.exit;
    if (e && !L.noExit && L.exitKind !== 'pit' && L.exitKind !== 'exist' && (e.x - P.x) ** 2 + (e.z - P.z) ** 2 < 55 * 55) {
      if (L.exitKind === 'poster') face(e, 1.25, 0.62, 0.62, TEX.REV_POSTER);
      else if (L.exitKind === 'stairs') face(e, 0, 1.5, 2.1, TEX.STAIRS);
      else if (L.exitKind === 'hdoor') face(e, 0, 1.1, 2.05, TEX.HDOOR);
      else if (L.exitKind === 'elevator') {
        face(e, 0, 1.5, 2.2, TEX.METAL);
        meshSmallBox(mb, e.x - 0.013, 0, e.z + 0.001, e.x + 0.013, 2.2, e.z + 0.006, TEX.CONVEYOR);
        for (const x of [e.x - 0.8, e.x + 0.74]) meshSmallBox(mb, x, 0, e.z - 0.02, x + 0.06, 2.3, e.z + 0.05, TEX.METAL);
        meshSmallBox(mb, e.x - 0.8, 2.2, e.z - 0.02, e.x + 0.8, 2.3, e.z + 0.05, TEX.METAL);
        const u = this.exitReady() ? 0.5 : 0;
        face({ x: e.x + 0.86, z: e.z + 0.03, nx: e.nx, nz: e.nz }, 1.2, 0.14, 0.14, TEX.INDICATOR, 0.7,
          [u, 1, u + 0.5, 1, u + 0.5, 0, u, 0]);
      } else {
        const rx = e.nz, rz = -e.nx;
        const dw = 0.55, dh = Math.min(2.1, L.doorTop);
        const bx = e.x, bz = e.z;
        mb.quad([bx - rx * dw, 0, bz - rz * dw], [bx + rx * dw, 0, bz + rz * dw], [bx + rx * dw, dh, bz + rz * dw], [bx - rx * dw, dh, bz - rz * dw],
          [e.nx, 0, e.nz], [0, 1, 1, 1, 1, 0, 0, 0], TEX.DOOR, 0);
        const sx = bx + e.nx * 0.05, sz = bz + e.nz * 0.05, sw = 0.34, y0 = dh + 0.1, y1 = dh + 0.36;
        const em = 2.2 + 0.4 * Math.sin(t * 2.3);
        mb.quad([sx - rx * sw, y0, sz - rz * sw], [sx + rx * sw, y0, sz + rz * sw], [sx + rx * sw, y1, sz + rz * sw], [sx - rx * sw, y1, sz - rz * sw],
          [e.nx, 0, e.nz], [0, 1, 1, 1, 1, 0, 0, 0], TEX.SIGN, em);
      }
    }
    if (W.plant) this.buildPlant(mb, face);
    if (W.party) this.buildParty(mb, face);
    if (L.gen === 'lightsout') this.buildDots(mb);
    if (L.gen === 'beach') {
      // 两道刻着 EXIST 的铁门：门框、横梁与门扇（北端是出口，南端是你进来的那扇，已经锁死）
      for (const g of [W.exit, W.entryGate]) {
        if ((g.x - P.x) ** 2 + (g.z - P.z) ** 2 > 90 * 90) continue;
        const y = g.y - 0.15;
        face(g, y, 2.3, 3.2, TEX.EXIST_GATE);
        const b = g.z - g.nz * 0.1;
        for (const s of [-1, 1]) meshSmallBox(mb, g.x + s * 1.22 - 0.12, y - 0.4, b - 0.12, g.x + s * 1.22 + 0.12, y + 3.5, b + 0.12, TEX.METAL);
        meshSmallBox(mb, g.x - 1.34, y + 3.2, b - 0.12, g.x + 1.34, y + 3.5, b + 0.12, TEX.METAL);
      }
      for (const f of this.prints) {
        if ((f.x - P.x) ** 2 + (f.z - P.z) ** 2 > 40 * 40) continue;
        const y = beachGround(f.x, f.z) + 0.015;
        if (y < beachSea(f.z, this.tide, t) + 0.02) continue; // 被海水抹平了
        const fx = -Math.sin(f.yaw) * 0.15, fz = -Math.cos(f.yaw) * 0.15, rx = Math.cos(f.yaw) * 0.07, rz = -Math.sin(f.yaw) * 0.07;
        const u0 = f.side > 0 ? 0.5 : 0, uv = [u0, 1, u0 + 0.5, 1, u0 + 0.5, 0, u0, 0];
        mb.quad([f.x - fx - rx, y, f.z - fz - rz], [f.x - fx + rx, y, f.z - fz + rz], [f.x + fx + rx, y, f.z + fz + rz], [f.x + fx - rx, y, f.z + fz - rz],
          [0, 1, 0], uv, TEX.FOOTPRINT, 0);
      }
    }
    if (this.state === 'title') return;
    // 物品
    const cs = CHUNK * CELL;
    const pcx = Math.floor(P.x / cs), pcz = Math.floor(P.z / cs);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = W.peekChunk(pcx + dx, pcz + dz);
        if (!c) continue;
        if (c.pool) {
          for (const duck of c.pool.ducks) {
            const x = c.cx * cs + duck.x, z = c.cz * cs + duck.z;
            if ((x - P.x) ** 2 + (z - P.z) ** 2 > 28 * 28) continue;
            meshPoolDuck(mb, x + Math.sin(t * 0.3 + duck.rot) * 0.07, L.water + Math.sin(t * 1.1 + duck.rot) * 0.024,
              z, duck.rot + Math.sin(t * 0.27) * 0.1, duck.scale);
          }
        }
        for (const gen of c.gens) {
          if ((gen.x - P.x) ** 2 + (gen.z - P.z) ** 2 > 36 * 36) continue;
          const u = W.gensOn.has(gen.id) ? 0.5 : 0;
          for (const nz of [-1, 1]) face({ x: gen.x, z: gen.z + nz * 0.608, nx: 0, nz }, 1.35, 0.16, 0.16, TEX.INDICATOR, 0.8,
            [u, 1, u + 0.5, 1, u + 0.5, 0, u, 0]);
        }
        for (const it of c.items) {
          if ((it.x - P.x) ** 2 + (it.z - P.z) ** 2 > 36 * 36) continue;
          const glow = 0.25 + 0.15 * Math.sin(t * 3 + it.phase) + (this.focus && this.focus.item === it ? 0.4 : 0);
          if (it.type === 'lidar') {
            meshSmallBox(mb, it.x - 0.16, 0.8, it.z - 0.1, it.x + 0.16, 0.9, it.z + 0.1, TEX.METAL);
            meshSmallBox(mb, it.x - 0.1, 0.9, it.z - 0.06, it.x + 0.1, 0.905, it.z + 0.06, TEX.LIGHT, 0.6 + glow);
            continue;
          }
          this.billboard(mb, it.x, it.z, L.water ? L.water + 0.02 : 0, 0.42, 0.42, it.type === 'almond' ? TEX.ALMOND : TEX.BATTERY, glow, 0);
        }
      }
    }
    if (this.gim) this.gim.build(mb);
    // 实体
    const sp = this.sprites;
    sp.length = 0;
    if (this.entity) this.entity.sprites(sp);
    if (this.humans) for (const h of this.humans) h.sprite(sp);
    if (this.phantom) {
      const c = this.phantom.cfg;
      sp.push({ x: this.phantom.x, z: this.phantom.z, y0: c.y0, w: c.w, h: c.h, layer: c.tex, emit: c.emit, off: 0 });
      if (c.eyes >= 0) sp.push({ x: this.phantom.x, z: this.phantom.z, y0: c.y0, w: c.w, h: c.h, layer: c.eyes, emit: c.eyesEmit, off: 0.03 });
    }
    for (const s of sp) this.billboard(mb, s.x, s.z, s.y0, s.w, s.h, s.layer, s.emit, s.off);
  }

  // 升降闸门：顶部导轨一直都在，栅栏整体向上收进导轨
  buildGates(mb, gates) {
    const P = this.player, H = this.level.wallH;
    const near = (x, z, r) => (x - P.x) ** 2 + (z - P.z) ** 2 < r * r;
    for (const g of gates) {
      const x0 = g.gx * CELL, z0 = g.gz * CELL;
      if (!near(x0, z0, 40)) continue;
      // 顶部导轨一直都在；栅栏整体向上收进导轨
      if (g.west) meshSmallBox(mb, x0 - 0.07, H - 0.2, z0, x0 + 0.07, H, z0 + CELL, TEX.METAL);
      else meshSmallBox(mb, x0, H - 0.2, z0 - 0.07, x0 + CELL, H, z0 + 0.07, TEX.METAL);
      if (g.lift >= 1) continue;
      const y0 = g.lift * (H - 0.25);
      for (let s = 0.08; s < CELL; s += 0.16) {
        if (g.west) meshPipe(mb, 'y', y0, H - 0.2, x0, z0 + s, 0.022, TEX.METAL);
        else meshPipe(mb, 'y', y0, H - 0.2, x0 + s, z0, 0.022, TEX.METAL);
      }
      for (const dy of [0.12, 1.1]) {
        const y = y0 + dy;
        if (y > H - 0.25) continue;
        if (g.west) meshSmallBox(mb, x0 - 0.03, y - 0.03, z0, x0 + 0.03, y + 0.03, z0 + CELL, TEX.METAL);
        else meshSmallBox(mb, x0, y - 0.03, z0 - 0.03, x0 + CELL, y + 0.03, z0 + 0.03, TEX.METAL);
      }
    }
  }

  // 派对甲板：船长室 / 后台的门、门锁面板、请柬 / 钥匙 / 日志、广播开关
  buildParty(mb, face) {
    const P = this.player, W = this.world, pa = W.party, F = pa.flags, t = this.time;
    const near = (x, z, r) => (x - P.x) ** 2 + (z - P.z) ** 2 < r * r;
    const lamp = (o, on) => {
      const u = on ? 0.5 : 0;
      face(o, o.y, 0.12, 0.12, TEX.INDICATOR, 0.8, [u, 1, u + 0.5, 1, u + 0.5, 0, u, 0]);
    };
    const wallBox = (o, w, h0, h1, d) => {
      const rx = o.nz * w, rz = -o.nx * w, ex = o.x + o.nx * d, ez = o.z + o.nz * d;
      meshSmallBox(mb, Math.min(o.x - rx, ex + rx), o.y + h0, Math.min(o.z - rz, ez + rz),
        Math.max(o.x - rx, ex + rx), o.y + h1, Math.max(o.z - rz, ez + rz), TEX.ELECBOX);
    };
    this.buildGates(mb, pa.gates);
    for (const o of pa.objs) {
      if (o.taken || !near(o.x, o.z, 30)) continue;
      const hi = this.focus && this.focus.obj === o ? 0.5 : 0;
      if (o.kind === 'lock') {
        wallBox(o, 0.12, -0.2, 0.16, 0.05);
        lamp({ x: o.x + o.nx * 0.056, z: o.z + o.nz * 0.056, nx: o.nx, nz: o.nz, y: o.y }, W.partyGate(o.gate).open);
      } else if (o.kind === 'radio') {
        wallBox(o, 0.3, -0.3, 0.3, 0.14);
        if (F.radio || Math.sin(t * 5) > 0) lamp({ x: o.x + o.nx * 0.146, z: o.z + o.nz * 0.146, nx: o.nx, nz: o.nz, y: o.y + 0.12 }, F.radio);
      } else if (o.kind === 'key') {
        meshSmallBox(mb, o.x - 0.09, o.y, o.z - 0.06, o.x + 0.09, o.y + 0.012, o.z + 0.06, TEX.SIGN, 0.6 + 0.3 * Math.sin(t * 3) + hi);
      } else {
        // 请柬 / 航海日志：没读过时微微发亮
        const glow = (o.kind === 'invite' ? F.invite : F.log) ? 0.12 : 0.35 + 0.2 * Math.sin(t * 3);
        meshSmallBox(mb, o.x - 0.15, o.y, o.z - 0.1, o.x + 0.15, o.y + 0.004, o.z + 0.1, TEX.LIGHT, glow + hi);
      }
    }
  }

  // 剧情电站：升降闸门、闸门面板、钥匙卡 / 保险丝 / 纸条、总闸拉杆
  buildPlant(mb, face) {
    const P = this.player, W = this.world, pl = W.plant, F = pl.flags, H = this.level.wallH, t = this.time;
    const near = (x, z, r) => (x - P.x) ** 2 + (z - P.z) ** 2 < r * r;
    const lamp = (o, on) => {
      const u = on ? 0.5 : 0;
      face(o, o.y, 0.12, 0.12, TEX.INDICATOR, 0.8, [u, 1, u + 0.5, 1, u + 0.5, 0, u, 0]);
    };
    this.buildGates(mb, pl.gates);
    for (const o of pl.objs) {
      if (o.taken || !near(o.x, o.z, 30)) continue;
      const hi = this.focus && this.focus.obj === o ? 0.5 : 0;
      if (o.kind === 'panel') {
        const rx = o.nz * 0.16, rz = -o.nx * 0.16, ex = o.x + o.nx * 0.05, ez = o.z + o.nz * 0.05;
        meshSmallBox(mb, Math.min(o.x - rx, ex + rx), o.y - 0.25, Math.min(o.z - rz, ez + rz),
          Math.max(o.x - rx, ex + rx), o.y + 0.2, Math.max(o.z - rz, ez + rz), TEX.ELECBOX);
        lamp({ x: o.x + o.nx * 0.056, z: o.z + o.nz * 0.056, nx: o.nx, nz: o.nz, y: o.y }, W.plantGate(o.gate).open);
      } else if (o.kind === 'console') {
        // 没读过日志时红灯闪烁，读过后常亮绿灯
        if (F.read || Math.sin(t * 5) > 0) lamp({ x: o.x, z: o.z - 0.24, nx: 0, nz: 1, y: 0.8 }, F.read);
      } else if (o.kind === 'switch') {
        const y = F.main ? 1.05 : 1.55;
        meshSmallBox(mb, o.x - 0.3, y, o.z - 0.22, o.x - 0.05, y + 0.05, o.z + 0.22, TEX.METAL);
        meshSmallBox(mb, o.x - 0.1, y - 0.01, o.z - 0.2, o.x - 0.03, y + 0.06, o.z + 0.2, TEX.CONVEYOR, hi);
        lamp({ x: o.x - 0.29, z: o.z, nx: 1, nz: 0, y: 1.8 }, F.main);
      } else if (o.kind === 'key') {
        meshSmallBox(mb, o.x - 0.09, o.y, o.z - 0.06, o.x + 0.09, o.y + 0.012, o.z + 0.06, TEX.SIGN, 0.6 + 0.3 * Math.sin(t * 3) + hi);
      } else if (o.kind === 'fuse') {
        meshSmallBox(mb, o.x - 0.08, o.y + 0.005, o.z - 0.022, o.x + 0.08, o.y + 0.05, o.z + 0.022, TEX.BULB, 0.5 + 0.3 * Math.sin(t * 3) + hi);
        for (const s of [-1, 1]) meshSmallBox(mb, o.x + s * 0.08 - 0.02, o.y, o.z - 0.028, o.x + s * 0.08 + 0.02, o.y + 0.056, o.z + 0.028, TEX.METAL);
      } else if (o.kind === 'note') {
        meshSmallBox(mb, o.x - 0.15, o.y, o.z - 0.1, o.x + 0.15, o.y + 0.004, o.z + 0.1, TEX.LIGHT, 0.12 + hi);
      }
    }
  }

  render(dt) {
    const P = this.player, L = this.level, R = this.renderer;
    const standY = lerp(1.62, 1.0, P.crouch);
    const bobY = (Math.abs(Math.sin(P.bob)) - 0.5) * 0.075 * P.bobAmt;
    this.camY = standY + bobY + this.floorY;
    this.shakeAmt = dt > 0 ? damp(this.shakeAmt, 0, 3, dt) : this.shakeAmt;
    const sh = this.shakeAmt;
    const shY = (Math.random() - 0.5) * sh * 0.05, shP = (Math.random() - 0.5) * sh * 0.05;
    const roll = Math.sin(P.bob) * 0.008 * P.bobAmt + Math.sin(this.time * 0.5) * 0.04 * this.ins * this.ins;
    const targetFov = this.settings.fov + (P.sprinting ? 7 : 0) + Math.sin(this.time * 0.8) * 3 * this.ins;
    this.curFov = dt > 0 ? damp(this.curFov, targetFov, 5, dt) : targetFov;
    const yaw = P.yaw + shY, pitch = P.pitch + shP;
    Mat4.perspective(this.proj, (this.curFov * Math.PI) / 180, R.cw / R.ch, 0.05, 160);
    Mat4.view(this.view, P.x, this.camY, P.z, yaw, pitch, roll);
    Mat4.mul(this.vp, this.proj, this.view);
    const cp = Math.cos(pitch);
    this.fwd = [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];

    // 手电筒方向稍微滞后于视线
    const f = this.flDir, k = dt > 0 ? 1 - Math.exp(-14 * dt) : 1;
    for (let i = 0; i < 3; i++) f[i] += (this.fwd[i] - f[i]) * k;
    const fl = Math.hypot(f[0], f[1], f[2]) || 1;
    const flDir = [f[0] / fl, f[1] / fl, f[2] / fl];
    let flI = 0;
    if (P.flash && !L.noFlash) {
      flI = 1.35;
      if (P.battery < 15 && Math.random() < 0.12) flI *= 0.2;
      else if (P.battery < 30) flI *= 0.75;
    }
    const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    const flPos = [P.x + rx * 0.18, this.camY - 0.12, P.z + rz * 0.18];

    const lf = 0.18 + 0.82 * clamp(P.lightSmooth, 0, 1);
    const fogCol = [L.fog[0] * lf, L.fog[1] * lf, L.fog[2] * lf];
    const exposure = L.exposure * (L.autoExposure === false ? 1 : lerp(1.7, 1.0, clamp(P.lightSmooth, 0, 1)));
    const clear = tonemapJS(fogCol, exposure);
    let poolSun = [0, 0, 0, 1], poolSunTop = 0, poolRoom = [0, 0], ambient = L.ambient, fogDen = L.fogDen;
    if (L.gen === 'beach') fogDen = lerp(L.fogDen, L.tide.fogDen, this.haze);
    if (L.gen === 'lightsout') {
      const [fd, am] = LO_VIEW[this.loZone] || LO_VIEW[1];
      this.loFog = dt > 0 ? damp(this.loFog, fd, 1.5, dt) : fd;
      this.loAmb = dt > 0 ? damp(this.loAmb, am, 1.5, dt) : am;
      fogDen = this.loFog;
      ambient = [this.loAmb, this.loAmb, this.loAmb * 1.1];
    }
    if (L.dim) {
      // 缓和的开场：先保留一点余光，之后视野慢慢收窄到正常难度
      const k = smoothstep(L.dim.start, L.dim.start + L.dim.dur, this.levelTime);
      fogDen = lerp(L.dim.fogDen, L.fogDen, k);
      ambient = L.ambient.map((v, i) => lerp(L.dim.ambient[i], v, k));
    }
    let poolSky = [0, 0, 1, 1], poolSkyHeights = [0, 0];
    if (L.gen === 'pools') {
      poolRoom = [Math.floor(P.x / 32), Math.floor(P.z / 32)];
      const room = this.world.poolRoom(poolRoom[0], poolRoom[1]);
      if (room.kind === 3) ambient = L.ambient.map((v) => v * 0.16);
      const a = room.openings.find((v) => v.axis === 'x');
      if (a) { poolSun = [poolRoom[0] * 32 + a.x0, a.y, poolRoom[1] * 32 + a.z0, poolRoom[1] * 32 + a.z1]; poolSunTop = a.y1; }
      const sky = room.openings.find((v) => v.axis === 'y');
      if (sky) {
        poolSky = [poolRoom[0] * 32 + sky.x0, poolRoom[1] * 32 + sky.z0, poolRoom[0] * 32 + sky.x1, poolRoom[1] * 32 + sky.z1];
        poolSkyHeights = [room.h, room.h + 1.1];
      }
    }

    this.buildDynamic();
    R.setDynamic(this.dyn.result());
    R.drawWorld({
      vp: this.vp, lightCount: this.lightCount, lightRadius: L.light.radius, ambient,
      cam: [P.x, this.camY, P.z], fwd: this.fwd, fogCol, fogDen,
      flPos, flDir, flCol: [1.0, 0.9, 0.74], fl: flI, wallH: L.wallH, exposure,
      panelTint: L.light.panel, clear, time: this.time,
      mist: L.mist ? [L.mist.den, L.mist.fall, 0] : [0, 0, 0], mistCol: L.mist ? L.mist.col : [0, 0, 0],
      joint: L.joint || 0,
      pool: L.water ? 1 : 0, touch: L.touch ? 1 : 0, waterHeight: L.water || 0,
      poolColumnCount: this.poolColumnCount || 0, poolSun, poolSunTop, poolRoom,
      poolSky, poolSkyHeights,
      beach: L.gen === 'beach' ? { rise: this.tide.rise, front: this.tide.front, haze: this.haze, haunt: this.haunt } : null,
    });
    R.post({
      time: this.time, ins: this.ins, hurt: this.hurt, fade: this.fade,
      bloom: L.bloom === undefined ? 0.85 : L.bloom, glitch: this.glitch, grade: L.grade, heat: L.heat || 0, invert: L.invert || 0,
      dark: L.noFlash || this.inDark ? 1 : 0, underwater: this.underwater, clean: L.outdoor ? 1 : 0,
    });

    if (this.state === 'playing' || this.state === 'exiting') {
      this.sound.listener(P.x, this.camY, P.z, this.fwd[0], this.fwd[1], this.fwd[2]);
      this.updateHUD();
      this.updateMarker();
      this.drawMinimap();
    }
  }

  // 原神式目标指引：屏幕内显示在出口上方，屏幕外贴边并用箭头指向
  updateMarker() {
    const el = this.markerEl || (this.markerEl = $('marker'));
    if (this.hunt) { el.style.display = 'none'; return; }
    let e = this.world && this.world.exit;
    if (!this.settings.guide || !e || this.level.noExit || this.level.noGuide) { el.style.display = 'none'; return; }
    const P = this.player;
    if (this.world.plant) {
      let t = this.plantObjective()[1];
      if (!t) { el.style.display = 'none'; return; }
      t = this.plantGuide(t);
      e = { x: t.x, z: t.z, nx: t.nx || 0, nz: t.nz || 0 };
    } else if (this.world.party) {
      const t = this.partyObjective()[1];
      e = { x: t.x, z: t.z, nx: t.nx || 0, nz: t.nz || 0 };
    } else if (this.level.generators && this.world.gensOn.size < this.level.generators) {
      let best = Infinity, target = null;
      for (const c of this.world.chunks.values()) {
        for (const gen of c.gens) {
          if (this.world.gensOn.has(gen.id)) continue;
          const d = (gen.x - P.x) ** 2 + (gen.z - P.z) ** 2;
          if (d < best) { best = d; target = gen; }
        }
      }
      if (!target) { el.style.display = 'none'; return; }
      e = { x: target.x, z: target.z, nx: 0, nz: 0 };
    }
    const dist = Math.hypot(e.x - P.x, e.z - P.z);
    const x = e.x + e.nx * 0.2, y = Math.min(2.1, this.level.doorTop) + 0.75, z = e.z + e.nz * 0.2;
    const m = this.vp;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    const W = window.innerWidth, H = window.innerHeight;
    let sx, sy, off = true, dx, dy;
    if (cw > 0.01) {
      const nx = cx / cw, ny = cy / cw;
      if (Math.abs(nx) <= 0.9 && Math.abs(ny) <= 0.85) {
        off = false;
        sx = ((nx + 1) / 2) * W; sy = ((1 - ny) / 2) * H;
      } else { dx = nx; dy = -ny; }
    } else {
      dx = cx >= 0 ? 1 : -1; dy = 0; // 在身后：贴在左/右边缘，提示转身方向
    }
    if (off) {
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      const mx = W / 2 - 60, my = H / 2 - 80;
      const k = Math.min(mx / Math.max(Math.abs(dx), 1e-4), my / Math.max(Math.abs(dy), 1e-4));
      sx = W / 2 + dx * k; sy = H / 2 + dy * k;
      el.querySelector('.m-arrow').style.transform = `rotate(${Math.atan2(dy, dx)}rad) translateX(30px)`;
    }
    el.style.display = 'block';
    el.classList.toggle('off', off);
    el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
    el.style.opacity = dist < 2.5 ? 0.3 : 1;
    const txt = Math.round(dist) + 'm';
    if (this._mdist !== txt) { this._mdist = txt; $('m-dist').textContent = txt; }
  }

  updateHUD() {
    const P = this.player, c = this.hudCache;
    const set = (id, prop, val) => {
      const key = id + prop;
      if (c[key] === val) return;
      c[key] = val;
      const el = $(id);
      if (!el) return;
      if (prop === 'text') el.textContent = val;
      else if (prop === 'width') el.style.width = val;
      else if (prop === 'class') el.className = val;
    };
    if (this.hunt) {
      this.hunt.updateHUD();
      set('b-stamina', 'width', P.stamina.toFixed(0) + '%');
      set('b-stamina', 'class', P.stamina < 20 ? 'low' : '');
      $('mech').classList.add('hidden');
      return;
    }
    set('b-sanity', 'width', P.sanity.toFixed(1) + '%');
    set('b-stamina', 'width', P.stamina.toFixed(1) + '%');
    set('b-battery', 'width', P.battery.toFixed(1) + '%');
    set('b-sanity', 'class', P.sanity < 30 ? 'low' : '');
    set('b-stamina', 'class', P.exhausted ? 'low' : '');
    set('b-battery', 'class', P.battery < 20 ? 'low' : '');
    set('n-almond', 'text', String(P.almond));
    set('n-glow', 'text', String(P.glow === undefined ? 0 : P.glow));
    set('n-battery', 'text', String(P.batteries));
    set('n-flash', 'text', this.level.noFlash || this.inDark ? '失效' : P.flash ? '开' : '关');
    set('tc', 'text', fmtTime(this.runTime));
    if (this.gim && this.gim.kind !== 'none') {
      const m = this.gim.hud();
      const box = $('mech');
      box.classList.remove('hidden');
      box.classList.toggle('warn', !!m.warn);
      set('mech-name', 'text', m.name);
      set('mech-label', 'text', m.label || '');
      set('mech-val', 'text', m.value || '');
      if (m.pct !== null && m.pct !== undefined) set('mech-fill', 'width', (clamp(m.pct, 0, 1) * 100).toFixed(0) + '%');
    } else {
      $('mech').classList.add('hidden');
    }
    let prompt = '';
    if (this.focus) {
      if (this.focus.type === 'exit') {
        const L = this.level;
        if (L.exitKind === 'elevator') {
          prompt = this.exitReady() ? '[E] 乘坐电梯' : this.world.plant ? '[E] 电梯没有电'
            : '[E] 电梯没有电（' + this.world.gensOn.size + '/' + L.generators + '）';
        }
        else if (L.exitKind === 'poster') prompt = '[E] 触摸海报';
        else if (L.exitKind === 'stairs') prompt = '[E] 摸索着走下楼梯';
        else if (L.exitKind === 'hdoor') prompt = '[E] 推开白色的房门';
        else if (L.exitKind === 'exist') prompt = '[E] 推开铁门';
        else prompt = '[E] 打开出口';
      } else if (this.focus.type === 'generator') prompt = '[E] 启动' + (this.focus.gen.no ? ' ' + this.focus.gen.no + ' 号' : '') + '发电机';
      else if (this.focus.type === 'plant') prompt = PLANT_PROMPTS[this.focus.obj.kind];
      else if (this.focus.type === 'party') {
        const o = this.focus.obj;
        prompt = o.kind === 'lock' ? (this.world.partyGate(o.gate).open ? '' : o.gate === 'K' ? '[E] 开锁' : '[E] 推门') : PARTY_PROMPTS[o.kind];
      }
      else if (this.focus.type === 'dispenser') prompt = this.focus.dispenser.next > this.levelTime ? '机器正在补水……' : '[E] 取杏仁水';
      else if (this.focus.type === 'slide') prompt = '[E] 滑入管道';
      else if (this.focus.type === 'poster') prompt = '[E] 触摸海报';
      else if (this.focus.type === 'item') prompt = '[E] 拾取 ' + ({ almond: '杏仁水', lidar: 'LiDAR 扫描仪' }[this.focus.item.type] || '电池');
    }
    if (!prompt && this.gim && this.gim.prompt) prompt = this.gim.prompt;
    if (this.noteSrc) prompt = '[E] 合上';
    else if (this.slideRide) prompt = '顺着水流滑行……';
    else if (!prompt && this.level.water && this.level.water - this.world.floorAt(P.x, P.z) > 1.1) prompt = (this.keys.KeyC || this.controls.crouch) ? '松开 C 上浮' : '[C] 按住下潜';
    if (this.controls.enabled) prompt = prompt.replace(/\[E\]/g, '交互 ·').replace(/\[C\] 按住下潜/g, '点按蹲伏下潜').replace(/松开 C 上浮/g, '再次点按蹲伏上浮').replace(/\[G\]/g, '扫描 ·');
    set('prompt', 'text', prompt);
    if (this.world.plant) set('objective', 'text', '目标 ' + this.plantStep() + ' / 8 · ' + this.plantObjective()[0]);
    else if (this.level.gen === 'beach') {
      const e = this.world.exit, gap = this.tide.front - P.z;
      set('objective', 'text', '向北 · 距铁门 ' + Math.round(Math.hypot(e.x - P.x, e.z - P.z)) + 'm' +
        (this.levelTime < this.level.tide.delay ? ' · 退潮中' : gap < 60 ? ' · 潮水在身后 ' + Math.max(0, Math.round(gap)) + 'm' : ' · 涨潮了'));
    }
    else if (this.world.party) set('objective', 'text', '目标 ' + (this.partyStep() + 1) + ' / 6 · ' + this.partyObjective()[0]);
    else if (this.level.generators) set('objective', 'text', '发电机 ' + Math.min(this.world.gensOn.size, this.level.generators) + ' / ' + this.level.generators +
      (this.world.gensOn.size >= this.level.generators ? ' · 电梯已通电' : ' · 电梯未通电'));
    if (this.level.noclipTo) {
      const pct = (this.noclip * 100).toFixed(1);
      set('nc-val', 'text', pct + '%');
      set('nc-bar', 'width', pct + '%');
      set('nc-next', 'text', '下次判定 ' + Math.max(0, Math.ceil(this.ncCool)) + 's');
    }
  }

  drawScare(t) {
    const c = this.scare, g = c.getContext('2d');
    const w = c.width, h = c.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    const shake = 50 * Math.max(0.15, 1 - t * 0.7);
    const zoom = 0.7 + Math.min(t * 4, 1) * 0.5 + t * 0.12;
    g.save();
    g.translate(w / 2 + (Math.random() - 0.5) * shake, h / 2 + (Math.random() - 0.5) * shake);
    const type = this.deathCause;
    if (type === 'smiler') {
      const s = (Math.min(w, h) * 1.25 * zoom) / 100;
      g.scale(s, s);
      g.translate(-50, -55);
      g.shadowColor = 'rgba(255,255,255,0.8)';
      g.shadowBlur = 30;
      drawSmiler(g);
    } else if (type === 'mother') {
      // 母亲没有形体：满屏抖动的、念不完的话
      g.setTransform(1, 0, 0, 1, 0, 0);
      const lines = ['回来', '孩子', '别走', '妈妈在这里', '该睡觉了', '我看见你了', '为什么不说话', '回家'];
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (let k = 0; k < 26; k++) {
        const s = Math.min(w, h) * (0.04 + Math.random() * 0.14) * zoom;
        g.font = `bold ${s | 0}px "Microsoft YaHei", "SimHei", sans-serif`;
        g.fillStyle = `rgba(${200 + Math.random() * 55 | 0},${190 + Math.random() * 40 | 0},${170 + Math.random() * 30 | 0},${0.15 + Math.random() * 0.6})`;
        g.fillText(lines[Math.floor(Math.random() * lines.length)], Math.random() * w, Math.random() * h);
      }
      g.font = `bold ${Math.min(w, h) * 0.2 * zoom | 0}px "Microsoft YaHei", "SimHei", sans-serif`;
      g.fillStyle = 'rgba(240,230,210,0.95)';
      g.fillText('找到你了', w / 2 + (Math.random() - 0.5) * shake, h / 2 + (Math.random() - 0.5) * shake);
    } else if (type === 'partygoer') {
      const s = (h / 62) * zoom;
      g.scale(s, s); g.translate(-50, -40);
      drawPartygoer(g);
    } else if (type === 'hound') {
      const s = (h / 68) * zoom;
      g.scale(s, s);
      g.translate(-85, -64);
      drawHound(g, false);
      g.shadowColor = '#fff';
      g.shadowBlur = 25;
      drawHound(g, true);
    } else {
      const s = (h / 46) * zoom;
      g.scale(s, s);
      g.translate(-50, -29);
      drawStalker(g, false);
      g.shadowColor = '#fff';
      g.shadowBlur = 25;
      drawStalker(g, true);
    }
    g.restore();
    const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(40,0,0,0.85)');
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
    if (Math.random() < 0.5) {
      g.fillStyle = `rgba(255,0,0,${Math.random() * 0.35})`;
      g.fillRect(0, 0, w, h);
    }
    for (let k = 0; k < 14; k++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.18})`;
      g.fillRect(0, Math.random() * h, w, 1 + Math.random() * 5);
    }
    if (t > 1.3) {
      g.fillStyle = `rgba(0,0,0,${clamp((t - 1.3) / 0.4, 0, 1)})`;
      g.fillRect(0, 0, w, h);
    }
  }
}

// ============================================================
//  每层独特玩法 + 通用小工具（原 js/gimmicks.js）
// ============================================================
// ============================================================
//  每层独特玩法 + 通用小工具
//  · 全部逻辑只做距离 / 计时 / 少量格子查询，绝不在每帧做射线或寻路
//  · 新增的视觉都走已有的动态网格（每帧重建一次），不额外增加 draw call
// ============================================================

const MECH_INFO = {
  0: { kind: 'blink', name: '眨眼', tip: '每十几秒你会眨一次眼——眨眼的一瞬间，笑魇会动。' },
  1: { kind: 'blackout', name: '停电潜行', tip: '停电时别跑：站定不动才能甩开猎犬。' },
  2: { kind: 'heat', name: '体温', tip: '蒸汽和管道会让你升温，水洼能降温。过热会喘、会慢、也更容易被听见。' },
  3: { kind: 'overload', name: '电网过载', tip: '每次启动发电机，电网会过载三十多秒：离发电机远一点。' },
  4: { kind: 'curfew', name: '熄灯值班', tip: '办公室的灯是一组一组熄灭的。坐在椅子上休息能回理智，但会让灯灭得更快。' },
  1.5: { kind: 'breath', name: '呼吸', tip: '你会不自觉地呼吸出声。蹲下或站定能把呼吸压到最低——“母亲”靠声音找你。' },
  6: { kind: 'lidar', name: 'LiDAR 耗电', tip: '扫描会吃电池，也会被黑暗里的东西听见。' },
  26: { kind: 'balloon', name: '气球', tip: '走廊里散落着气球。踩爆一只，整层都会知道你在这里。' },
  37: { kind: 'oxygen', name: '氧气', tip: '潜进水里会消耗氧气，耗尽会开始掉理智。' },
  994: { kind: 'dry', name: '脱水', tip: '在烈日下奔跑会脱水。脱水时跑不快、也回不了体力，杏仁水可以补。' },
  99: { kind: 'obstacle', name: '障碍', tip: '走廊里有倒塌的货架，必须左右闪避，撞上去会被追上。' },
};

// 通用工具：屏幕尺寸无关的平滑
function gDamp(a, b, k, dt) { return a + (b - a) * (1 - Math.exp(-k * dt)); }

class Gimmick {
  constructor(g) {
    this.g = g;
    this.L = g.level;
    this.id = g.level.id;
    const info = MECH_INFO[this.id] || null;
    this.kind = info ? info.kind : 'none';
    this.name = info ? info.name : '';
    this.tip = info ? info.tip : '';
    this.label = '';
    this.value = '';
    this.pct = null;
    this.warn = false;
    this.prompt = '';
    this.speedMul = 1;
    this.staminaRegenMul = 1;
    this.sanityMul = 1;
    this.extraDrain = 0;
    this.lightMul = 1;
    this.waterNeed = 0;      // 饮用杏仁水的额外理由（海滩脱水）
    this.blinkEl = null;
    this.blinkAmt = 0;
    this.desk = null;
    this.resting = false;
    this.restSpot = null;
    this.glows = [];
    this.glowCd = 0;
    this.steady = 0;
    this.said = {};
    this.t = 0;
    this.init();
  }

  say(key, text, cool) {
    const now = this.t;
    if (this.said[key] && now - this.said[key] < (cool || 20)) return;
    this.said[key] = now;
    this.g.msg(text);
  }

  init() {
    const g = this.g, P = g.player, L = this.L;
    P.glow = 2;
    switch (this.kind) {
      case 'blink':
        this.blinkTimer = 11 + Math.random() * 4;
        this.blinkT = 0;
        this.blinkEl = document.getElementById('blink');
        break;
      case 'heat':
        this.temp = 36.6;
        this.heatScan = 0;
        this.ventOff = new Map();
        break;
      case 'blackout':
        this.still = 0;
        break;
      case 'overload':
        this.prevGens = g.world.gensOn.size;
        this.over = 0;
        this.arcT = 0;
        break;
      case 'curfew':
        this.groups = 4;
        this.groupT = 78;
        this.lightMul = 1;
        break;
      case 'breath': {
        this.breathT = 3 + Math.random() * 2;
        this.inhale = false;
        break;
      }
      case 'lidar':
        this.scanAcc = 0;
        this.spent = 0;
        break;
      case 'balloon':
        this.balloons = [];
        this.cellSeen = new Set();
        this.popped = 0;
        break;
      case 'oxygen':
        this.o2 = 100;
        break;
      case 'dry':
        this.water = 100;
        this.waterNeed = 1;
        break;
      case 'obstacle':
        this.obs = [];
        this.buildObstacles();
        this.slowT = 0;
        this.nextObs = 0;
        break;
    }
  }

  intro() {
    if (this.kind === 'none') return;
    this.g.msg('【本层玩法 · ' + this.name + '】' + this.tip);
  }

  // ---------------------------------------------------------------
  //  障碍：走廊里每隔一段有一排倒塌的货架，只留半边可过
  // ---------------------------------------------------------------
  buildObstacles() {
    const L = this.L;
    go: for (let gx = 30; gx < L.corridorLen - 8; gx += 17 + Math.floor(Math.random() * 8)) {
      const side = Math.random() < 0.5 ? 0 : 1;
      const half = side === 0 ? 6 : 7;
      if (this.g.world.blocked(gx, half)) continue;   // 那里已经有倒塌的箱子，别再叠一层
      const x = (gx + 0.5) * CELL;
      this.obs.push({ gx, x, side, hit: false });
      if (this.obs.length > 12) break go;
    }
  }

  // ---------------------------------------------------------------
  //  每帧
  // ---------------------------------------------------------------
  update(dt) {
    const g = this.g, P = g.player, L = this.L;
    this.t += dt;
    this.speedMul = 1; this.staminaRegenMul = 1; this.sanityMul = 1; this.extraDrain = 0;
    this.prompt = '';
    if (this.glowCd > 0) this.glowCd -= dt;
    this.updateGlows(dt);

    // 站定不动：缓慢恢复理智（所有层通用的喘息手段）
    if (P.speed < 0.25 && !this.resting) {
      this.steady += dt;
      if (this.steady > 2.4 && P.sanity < 100) {
        P.sanity = Math.min(100, P.sanity + 0.9 * dt);
        if (this.steady > 2.4 && this.steady - dt <= 2.4) this.say('steady', '你停下脚步，试着让呼吸慢下来……', 40);
      }
    } else this.steady = 0;

    switch (this.kind) {
      case 'blink': this.updBlink(dt); break;
      case 'blackout': this.updBlackout(dt); break;
      case 'heat': this.updHeat(dt); break;
      case 'overload': this.updOverload(dt); break;
      case 'curfew': this.updCurfew(dt); break;
      case 'breath': this.updBreath(dt); break;
      case 'lidar': this.updLidar(dt); break;
      case 'balloon': this.updBalloon(dt); break;
      case 'oxygen': this.updOxygen(dt); break;
      case 'dry': this.updDry(dt); break;
      case 'obstacle': this.updObstacle(dt); break;
    }
  }

  // ---------------- Level 0：眨眼 ----------------
  updBlink(dt) {
    const g = this.g, P = g.player, E = g.entity;
    if (this.blinkT > 0) {
      this.blinkT -= dt;
      // 0.0~0.09 闭眼，0.35 睁眼
      const k = Math.min(1, (0.45 - this.blinkT) / 0.09);
      this.blinkAmt = Math.max(0, Math.min(1, k));
      if (this.blinkEl) this.blinkEl.style.opacity = this.blinkAmt.toFixed(3);
      if (this.blinkT <= 0) {
        this.blinkT = 0; this.blinkAmt = 0;
        if (this.blinkEl) this.blinkEl.style.opacity = '0';
        this.blinkTimer = 11 + Math.random() * 5;
      }
      return;
    }
    this.blinkTimer -= dt;
    this.value = Math.max(0, this.blinkTimer).toFixed(1) + 's';
    this.pct = 1 - Math.max(0, this.blinkTimer) / 16;
    this.warn = this.blinkTimer < 3;
    if (this.blinkTimer > 0) return;

    // 眨眼：视线断掉的一瞬
    this.blinkT = 0.45;
    P.sanity = Math.max(1, P.sanity - 1.2);
    if (E && E.active && E.type === 'smiler' && E.dist < 20 && E.onScreen) {
      // 你正盯着它——眨眼时它向前挪了一大步
      const dx = P.x - E.x, dz = P.z - E.z, d = Math.hypot(dx, dz) || 1;
      const step = Math.min(d - 1.4, 4.2);
      const nx = E.x + (dx / d) * step, nz = E.z + (dz / d) * step;
      const [cx, cz] = g.world.collide(nx, nz, 0.3);
      E.x = cx; E.z = cz; E.path = null; E.target = null;
      g.sound.stinger();
      g.shakeAmt = Math.max(g.shakeAmt, 0.3);
      this.say('blinkHit', '眨眼的一瞬间，那张笑脸靠近了。别一直盯着它。', 25);
    } else {
      g.sound.click(0.12);
    }
    this.value = '眨眼';
    this.pct = 0;
    this.warn = true;
  }

  // ---------------- Level 1：停电潜行 ----------------
  updBlackout(dt) {
    const g = this.g, P = g.player, E = g.entity;
    const dark = g.power < 0.5;
    this.label = dark ? '停电中 · 站住别动' : '供电正常';
    this.value = dark ? '静默' : '稳定';
    this.pct = dark ? clamp(1 - this.still / 1.6, 0, 1) : 1;
    this.warn = dark;
    if (!dark) { this.still = 0; return; }
    if (P.speed > 0.7) {
      this.still = 0;
      g.playerNoise = Math.max(g.playerNoise, 25);   // 黑暗里每一步都被放大
      if (E && E.active && E.type === 'hound' && E.state !== 'chase' && E.dist < 22 && Math.random() < dt * 0.9) {
        E.alert(P.x, P.z);
      }
    } else {
      this.still += dt;
      if (this.still > 1.4 && E && E.active && E.type === 'hound' && E.state === 'chase') {
        E.state = 'investigate';
        E.lastSeenT = -999;
        E.target = [E.x, E.z];
        E.path = null;
        this.say('lost', '你停住了。黑暗里那阵脚步声犹豫了一下，转向别处。', 14);
      }
    }
  }

  // ---------------- Level 2：体温 ----------------
  updHeat(dt) {
    const g = this.g, P = g.player, W = g.world, L = this.L;
    this.heatScan -= dt;
    if (this.heatScan <= 0) {
      this.heatScan = 0.25;
      const cs = CHUNK * CELL;
      const pcx = Math.floor(P.x / cs), pcz = Math.floor(P.z / cs);
      let heat = 1.0 + L.heat * 0.7;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const c = W.peekChunk(pcx + dx, pcz + dz);
          if (!c) continue;
          for (const v of c.vents) {
            const d = Math.hypot(v.x - P.x, v.z - P.z);
            if (d > 7) continue;
            if (this.ventOff.has(v)) {
              const left = this.ventOff.get(v) - 0.25;
              if (left > 0) { this.ventOff.set(v, left); v.offT = left; continue; }
              this.ventOff.delete(v); v.offT = 0;
            }
            const on = (v.offT || 0) <= 0 && Math.sin(g.time * v.rate + v.phase) > -0.2;
            if (on) heat += (1 - d / 7) * 3.0;
          }
          for (const gen of c.gens) {
            if (!W.gensOn.has(gen.id)) continue;
            const d = Math.hypot(gen.x - P.x, gen.z - P.z);
            if (d < 8) heat += (1 - d / 8) * 1.2;
          }
          if (c.pool) { /* 泳池不在此层 */ }
        }
      }
      if (g.inPuddle(P.x, P.z)) heat -= 2.2;
      if (L.water) heat -= 1.5;
      this.heatTarget = clamp(36.4 + heat, 36.2, 41.8);
    }
    this.temp = gDamp(this.temp, this.heatTarget === undefined ? 36.6 : this.heatTarget, 0.55, dt);
    const stress = clamp((this.temp - 38.8) / 1.6, 0, 1);
    if (stress > 0) {
      this.sanityMul = 1 + 0.7 * stress;
      this.staminaRegenMul = 1 - 0.6 * stress;
      this.extraDrain = 0.06 * stress;
      this.speedMul = 1 - 0.06 * stress;
      if (stress > 0.55) this.say('hot', '太热了。再这样下去，你会先被闷垮——找水洼，或者把阀门拧上。', 40);
    }
    this.label = '体温';
    this.value = this.temp.toFixed(1) + '°C';
    this.pct = clamp((this.temp - 36.2) / 5.4, 0, 1);
    this.warn = this.temp > 38.9;

    // 拧阀门：把身边正在喷气的管道关 22 秒
    if (this.temp > 38.4) this.prompt = '在喷气的阀门旁按 E 关掉它';
  }

  interactHeat() {
    const g = this.g, P = g.player, W = g.world, cs = CHUNK * CELL;
    const pcx = Math.floor(P.x / cs), pcz = Math.floor(P.z / cs);
    let best = null, bestD = 2.8;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = W.peekChunk(pcx + dx, pcz + dz);
        if (!c) continue;
        for (const v of c.vents) {
          const d = Math.hypot(v.x - P.x, v.z - P.z);
          if (d < bestD) { bestD = d; best = v; }
        }
      }
    }
    if (!best) return false;
    if ((best.offT || 0) > 0) { g.msg('这只阀门已经关上了。'); return true; }
    best.offT = 22;
    this.ventOff.set(best, 22);
    this.temp = Math.max(36.4, this.temp - 0.7);
    g.sound.click(0.4);
    g.sound.electricSpark(best.x, best.y || 1.4, best.z, 0.4);
    g.msg('你把阀门拧死了。蒸汽慢慢停了——二十来秒后会重新顶开。');
    return true;
  }

  // ---------------- Level 3：电网过载 ----------------
  updOverload(dt) {
    const g = this.g, P = g.player, W = g.world;
    const n = W.gensOn.size;
    if (n > this.prevGens) {
      this.over = 34;
      this.arcT = 0;
      this.say('over', '电网过载了。你听见电流在墙里尖叫——离发电机远一点。', 10);
    }
    this.prevGens = n;
    if (this.over <= 0) {
      this.label = '电网稳定'; this.value = '—'; this.pct = 1; this.warn = false;
      return;
    }
    this.over -= dt;
    this.label = '电网过载';
    this.value = Math.ceil(this.over) + 's';
    this.pct = clamp(this.over / 34, 0, 1);
    this.warn = this.over < 10;
    g.globalFlicker = Math.sin(g.time * 37) > 0.6 ? 0.35 : 1;
    this.arcT -= dt;
    if (this.arcT > 0) return;
    this.arcT = 0.9;
    let near = null, nd = 9.5;
    const cs0 = CHUNK * CELL;
    const pcx0 = Math.floor(P.x / cs0), pcz0 = Math.floor(P.z / cs0);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = W.peekChunk(pcx0 + dx, pcz0 + dz);
        if (!c) continue;
        for (const gen of c.gens) {
          if (!W.gensOn.has(gen.id)) continue;
          const d = Math.hypot(gen.x - P.x, gen.z - P.z);
          if (d < nd) { nd = d; near = gen; }
        }
      }
    }
    if (!near) return;
    g.hurt = Math.max(g.hurt, 0.45);
    g.shakeAmt = Math.max(g.shakeAmt, 0.35);
    P.sanity = Math.max(1, P.sanity - 4);
    P.stamina = Math.max(0, P.stamina - 8);
    g.sound.electricSpark(near.x, 1.2, near.z, 1);
    for (let k = 0; k < 5; k++) g.sparks.push({ x: near.x, y: 1.2, z: near.z, vx: (Math.random() - 0.5) * 3, vz: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 2, t: 0.2 + Math.random() * 0.3 });
    this.say('arc', '电弧从发电机外壳上炸开，把你掀得后退半步。', 8);
  }

  // ---------------- Level 4：熄灯值班 ----------------
  updCurfew(dt) {
    const g = this.g, P = g.player, W = g.world, L = this.L;
    // 找到身边可以坐下的办公桌
    this.desk = null;
    if (!this.resting) {
      const cs = CHUNK * CELL;
      const pcx = Math.floor(P.x / cs), pcz = Math.floor(P.z / cs);
      let best = 1.9;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const c = W.peekChunk(pcx + dx, pcz + dz);
          if (!c) continue;
          for (const p of c.props) {
            if (p.kind !== 'desk' && p.kind !== 'meeting') continue;
            const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2;
            const d = Math.hypot(cx - P.x, cz - P.z);
            if (d < best) { best = d; this.desk = { x: cx, z: cz, p }; }
          }
        }
      }
      if (this.desk) this.prompt = '按 E 坐下休息（会加快熄灯）';
    }

    if (this.resting) {
      P.x = this.restSpot.x; P.z = this.restSpot.z;
      P.vx = P.vz = 0;
      P.sanity = Math.min(100, P.sanity + 9 * dt);
      P.stamina = Math.min(100, P.stamina + 15 * dt);
      this.groupT -= dt * 3.6;
      this.value = '休息中';
      // 任何移动输入都站起来
      const K = g.keys, C = g.controls;
      if (K.KeyW || K.KeyA || K.KeyS || K.KeyD || (C && (C.x || C.y)) || this.restCool > 0) {
        this.resting = false;
        this.restCool = 0.6;
        g.msg('你站起来，继续往前。');
      }
    } else {
      this.restCool = Math.max(0, this.restCool - dt);
      this.groupT -= dt;
    }
    if (this.groupT <= 0 && this.groups > 0) {
      this.groups--;
      this.groupT = 70;
      this.lightMul = 1 - 0.16 * (4 - this.groups);
      g.sound.powerDown();
      P.sanity = Math.max(1, P.sanity - 3);
      if (this.groups > 0) g.msg('远处又一片灯管灭了。照亮的区域只剩 ' + this.groups + ' 组。');
      else g.msg('最后一片灯也灭了。这里再也没有安全的地方了。');
      if (this.groups === 0) this.lightMul = 0.12;
    }
    this.label = '照明组 ' + this.groups + ' / 4';
    this.value = this.groupT.toFixed(0) + 's';
    this.pct = clamp(this.groupT / 70, 0, 1);
    this.warn = this.groups <= 1;
    if (this.resting) { this.value = '休息'; this.pct = 1; }
  }

  // ---------------- Level 1.5：呼吸 ----------------
  updBreath(dt) {
    const g = this.g, P = g.player;
    const crouch = P.crouch > 0.5;
    const rate = P.stamina < 40 || g.ins > 0.5 ? 3.4 : 6.2;
    this.breathT -= dt;
    this.pct = 1 - clamp(this.breathT / rate, 0, 1);
    if (this.breathT <= 0) {
      this.breathT = rate * (0.8 + Math.random() * 0.5);
      this.inhale = !this.inhale;
      const loud = crouch ? 3.5 : P.stamina < 40 ? 12 : 7;
      g.playerNoise = Math.max(g.playerNoise, loud);
      g.sound.breath(crouch ? 0.25 : 0.6, this.inhale);
    }
    this.label = '呼吸';
    this.value = crouch ? '压得很低' : P.stamina < 40 ? '急促' : '平稳';
    this.warn = !crouch && P.stamina < 40;
    if (!crouch) this.prompt = '蹲下（C）可以让呼吸更轻';
  }

  // ---------------- Level 6：LiDAR 耗电 ----------------
  updLidar(dt) {
    const g = this.g, P = g.player, E = g.entity;
    const scanning = P.lidar && (g.keys.KeyG || (g.controls && g.controls.scan));
    if (scanning) {
      P.battery = Math.max(0, P.battery - 3.0 * dt);
      this.spent += dt;
      this.scanAcc += dt;
      if (P.battery <= 0) {
        P.battery = 0;
        g.msg('扫描仪的电池耗尽了。');
        this.say('empty', '电量见底，屏幕上的光点一片片熄灭。', 30);
      }
      if (this.scanAcc > 1.1) {
        this.scanAcc = 0;
        if (E && E.active && E.type === 'wretch' && E.dist < 26) {
          E.alert(P.x, P.z);
          this.say('heard', '声呐的回波在黑暗里传得很远。有东西朝这边来了。', 18);
        }
      }
      this.label = '扫描耗电';
      this.value = Math.round(P.battery) + '%';
      this.pct = P.battery / 100;
      this.warn = P.battery < 25;
    } else {
      this.label = 'LiDAR';
      this.value = this.spent > 0 ? '已耗 ' + this.spent.toFixed(0) + 's' : '待机';
      this.pct = 0;
      this.warn = false;
    }
  }

  // ---------------- Level Fun =)：气球 ----------------
  updBalloon(dt) {
    const g = this.g, P = g.player;
    const cs = CHUNK * CELL;
    const gx = Math.floor(P.x / CELL), gz = Math.floor(P.z / CELL);
    const key = gx + ',' + gz;
    if (!this.cellSeen.has(key) && this.balloons.length < 42) {
      this.cellSeen.add(key);
      if (Math.random() < 0.3) {
        const bx0 = (gx + 0.32 + Math.random() * 0.36) * CELL;
        const bz0 = (gz + 0.32 + Math.random() * 0.36) * CELL;
        if (!g.world.blocked(gx, gz) && g.world.los(P.x, P.z, bx0, bz0)) {
          const q = g.world.collide(bx0, bz0, 0.28);
          if (Math.floor(q[0] / CELL) === gx && Math.floor(q[1] / CELL) === gz) {
            this.balloons.push({ x: q[0], z: q[1], color: Math.floor(Math.random() * 4), alive: true, phase: Math.random() * 6 });
          }
        }
      }
    }
    for (const b of this.balloons) {
      if (!b.alive) continue;
      const d = Math.hypot(b.x - P.x, b.z - P.z);
      if (d > 2.2) continue;
      if (d < 0.55) {
        b.alive = false;
        this.popped++;
        P.sanity = Math.max(1, P.sanity - 4);
        g.shakeAmt = Math.max(g.shakeAmt, 0.25);
        g.sound.blip(0.35, 700 + Math.random() * 500);
        g.sound.entityStep(0.7);
        g.playerNoise = Math.max(g.playerNoise, 30);
        g.alertEntity(b.x, b.z);
        this.say('pop', '气球在你脚边炸开。整层甲板都听见了。', 12);
      }
    }
    this.label = '气球';
    this.value = '踩爆 ' + this.popped;
    this.pct = clamp(this.popped / 6, 0, 1);
    this.warn = false;
  }

  // ---------------- Level 37：氧气 ----------------
  updOxygen(dt) {
    const g = this.g, P = g.player, L = this.L;
    const under = g.underwater > 0.35 || (L.water && g.floorY + 1.2 < L.water - 0.4);
    if (under) {
      this.o2 = Math.max(0, this.o2 - 5.6 * dt);
      if (this.o2 <= 0) {
        this.extraDrain = 7.5;
        this.say('drown', '肺里最后一点空气也用完了。你必须浮上去。', 12);
      }
    } else {
      this.o2 = Math.min(100, this.o2 + 17 * dt);
    }
    this.label = '氧气';
    this.value = Math.round(this.o2) + '%';
    this.pct = this.o2 / 100;
    this.warn = this.o2 < 35;
    if (under) this.prompt = '松开 C 上浮换气';
  }

  // ---------------- Level 994：脱水 ----------------
  updDry(dt) {
    const g = this.g, P = g.player, L = this.L;
    const drain = P.sprinting ? 0.95 : P.speed > 0.6 ? 0.34 : 0.1;
    this.water = Math.max(0, this.water - drain * dt);
    if (g.beachWade > 0.05) this.water = Math.min(100, this.water + 0.25 * dt);
    const low = this.water < 30;
    if (low) {
      this.staminaRegenMul = 0.55;
      this.speedMul = 0.94;
      this.extraDrain = 0.05;
      this.say('dry', '喉咙干得发疼。再跑下去，你会先脱水倒下。', 45);
    }
    this.label = '水分';
    this.value = Math.round(this.water) + '%';
    this.pct = this.water / 100;
    this.warn = low;
  }

  // ---------------- Level !：障碍 ----------------
  updObstacle(dt) {
    const g = this.g, P = g.player;
    this.slowT = Math.max(0, this.slowT - dt);
    if (this.slowT > 0) { this.speedMul = 0.18; }
    // 障碍是有实体的：把玩家挤出箱体，避免穿模
    this.bumpCool = Math.max(0, (this.bumpCool || 0) - dt);
    for (const o of this.obs) {
      if (Math.abs(P.x - o.x) > 1.2) continue;
      const z0 = (o.side === 0 ? 6 : 7) * CELL - 0.3, z1 = z0 + CELL + 0.6;
      const x0 = o.x - 0.72, x1 = o.x + 0.72;
      if (P.x <= x0 || P.x >= x1 || P.z <= z0 || P.z >= z1) continue;
      const dl = P.x - x0, dr = x1 - P.x, dt2 = P.z - z0, db = z1 - P.z;
      const m = Math.min(dl, dr, dt2, db);
      if (m === dl) P.x = x0; else if (m === dr) P.x = x1; else if (m === dt2) P.z = z0; else P.z = z1;
      this.slowT = Math.max(this.slowT, 0.5);
      if (this.bumpCool <= 0) {
        this.bumpCool = 1.4;
        this.g.shakeAmt = Math.max(this.g.shakeAmt, 0.4);
        this.g.hurt = Math.max(this.g.hurt, 0.35);
        this.g.sound.footstep(this.g.level.surface, 1);
        this.say('obb', '你撞上了倒塌的货架，只能贴着它挤过去。', 5);
      }
    }
    let next = null;
    for (const o of this.obs) {
      if (Math.abs(P.x - o.x) > 1.6) continue;
      const blocked = o.side === 0 ? (P.z < 7 * CELL) : (P.z > 7 * CELL);
      if (!blocked) continue;
      if (Math.abs(P.x - o.x) < 0.7 && this.slowT <= 0) {
        this.slowT = 0.95;
        P.stamina = Math.max(0, P.stamina - 12);
        P.sanity = Math.max(1, P.sanity - 3);
        g.shakeAmt = Math.max(g.shakeAmt, 0.5);
        g.hurt = Math.max(g.hurt, 0.4);
        g.sound.footstep(g.level.surface, 1);
        this.say('obb', '你撞上了倒塌的货架，卡了半秒才挣脱。', 6);
      }
    }
    for (const o of this.obs) if (o.x > P.x - 8) { next = o; break; }
    this.label = '障碍';
    this.value = next ? '前方 ' + Math.max(0, Math.round((next.x - P.x) / CELL)) + 'm' : '已通过';
    this.pct = next ? clamp(1 - (next.x - P.x) / (20 * CELL), 0, 1) : 1;
    this.warn = !!next && next.x - P.x < 8;
  }

  // ---------------------------------------------------------------
  //  通用：荧光棒
  // ---------------------------------------------------------------
  updateGlows(dt) {
    for (let k = this.glows.length - 1; k >= 0; k--) {
      const s = this.glows[k];
      s.t -= dt;
      if (s.t <= 0) this.glows.splice(k, 1);
    }
  }

  throwGlow() {
    const g = this.g, P = g.player;
    if (this.glowCd > 0) return;
    if (!P.glow || P.glow <= 0) { g.msg('你没有荧光棒了。'); return; }
    P.glow--;
    this.glowCd = 0.45;
    const dx = -Math.sin(P.yaw), dz = -Math.cos(P.yaw);
    let dist = 1.6;
    // 沿视线推进，撞墙就停在墙前
    for (; dist < 9; dist += 0.4) {
      const x = P.x + dx * dist, z = P.z + dz * dist;
      if (g.world.blocked(Math.floor(x / CELL), Math.floor(z / CELL))) break;
      if (!g.world.los(P.x, P.z, x, z)) break;
    }
    dist = Math.max(1.2, Math.min(8.5, dist - 0.5));
    const hit = g.world.collide(P.x + dx * dist, P.z + dz * dist, 0.2);
    const gy = g.world.floorAt(hit[0], hit[1]);
    this.glows.push({ x: hit[0], z: hit[1], y: gy, t: 24, life: 24 });
    if (this.glows.length > 3) this.glows.shift();
    g.sound.pickup();
    g.playerNoise = Math.max(g.playerNoise, 15);
    g.alertEntity(x, z);
    g.msg('荧光棒在远处亮起来——声音和光都会把它们引过去（剩 ' + P.glow + ' 根）。');
  }

  // 供渲染器：把荧光棒的光塞进灯光数组
  lights(lp, lc, n) {
    const P = this.g.player;
    for (const s of this.glows) {
      if (n >= MAXL) break;
      const d2 = (s.x - P.x) ** 2 + (s.z - P.z) ** 2;
      if (d2 > 40 * 40) continue;
      if (!this.g.world.los(P.x, P.z, s.x, s.z)) continue;
      const fade = Math.min(1, s.t / 2.2);
      lp[n * 4] = s.x; lp[n * 4 + 1] = (s.y || 0) + 0.35; lp[n * 4 + 2] = s.z; lp[n * 4 + 3] = 1.25 * fade;
      lc[n * 3] = 0.42; lc[n * 3 + 1] = 1.0; lc[n * 3 + 2] = 0.5;
      n++;
    }
    return n;
  }

  // 供渲染器：气球 / 荧光棒 / 障碍
  build(mb) {
    const g = this.g, P = g.player, t = g.time;
    for (const s of this.glows) {
      if ((s.x - P.x) ** 2 + (s.z - P.z) ** 2 > 30 * 30) continue;
      const e = 1.4 * Math.min(1, s.t / 2.2);
      const gy = s.y || 0;
      meshSmallBox(mb, s.x - 0.035, gy + 0.015, s.z - 0.035, s.x + 0.035, gy + 0.06, s.z + 0.035, TEX.BULB, e);
      meshSmallBox(mb, s.x - 0.05, gy, s.z - 0.05, s.x + 0.05, gy + 0.01, s.z + 0.05, TEX.METAL, 0);
    }
    if (this.kind === 'balloon' && this.balloons) {
      const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw), nx = Math.sin(P.yaw), nz = Math.cos(P.yaw);
      for (const b of this.balloons) {
        if (!b.alive) continue;
        if ((b.x - P.x) ** 2 + (b.z - P.z) ** 2 > 26 * 26) continue;
        const q = b.color, u0 = (q & 1) * 0.5, v0 = (q >> 1) * 0.5;
        const y0 = 0.55 + Math.sin(t * 1.4 + b.phase) * 0.05, w = 0.26, h = 0.5;
        const cx = b.x, cz = b.z, hw = w / 2;
        mb.quad([cx - rx * hw, y0, cz - rz * hw], [cx + rx * hw, y0, cz + rz * hw],
          [cx + rx * hw, y0 + h, cz + rz * hw], [cx - rx * hw, y0 + h, cz - rz * hw],
          [nx, 0, nz], [u0, v0 + 0.5, u0 + 0.5, v0 + 0.5, u0 + 0.5, v0, u0, v0], TEX.BALLOON, 0.12);
        meshSmallBox(mb, cx - 0.004, 0.02, cz - 0.004, cx + 0.004, y0, cz + 0.004, TEX.METAL, 0);
      }
    }
    if (this.kind === 'obstacle' && this.obs && !g.hunt) {
      for (const o of this.obs) {
        if (Math.abs(o.x - P.x) > 26) continue;
        const z0 = o.side === 0 ? 6 * CELL : 7 * CELL;
        const z1 = o.side === 0 ? 7 * CELL : 8 * CELL;
        meshSmallBox(mb, o.x - 0.42, 0, z0, o.x + 0.42, 1.55, z1, TEX.CRATE, 0);
        meshSmallBox(mb, o.x - 0.5, 1.5, z0 + 0.2, o.x + 0.5, 1.62, z1 - 0.2, TEX.METAL, 0);
      }
    }
  }

  // ---------------------------------------------------------------
  //  交互 / HUD
  // ---------------------------------------------------------------
  interact() {
    const g = this.g;
    if (this.kind === 'heat' && this.interactHeat()) return true;
    if (this.kind === 'curfew') {
      if (this.resting) {
        this.resting = false;
        this.restCool = 0.6;
        g.sound.click(0.3);
        return true;
      }
      if (this.desk) {
        this.resting = true;
        this.restCool = 0;
        this.restSpot = { x: g.player.x, z: g.player.z };
        g.sound.click(0.3);
        g.msg('你靠着办公桌坐下来。绷紧的神经慢慢松开——但楼里的灯正在一盏盏熄灭。');
        return true;
      }
    }
    return false;
  }

  onDrink() {
    if (this.kind === 'dry') this.water = Math.min(100, this.water + 42);
    if (this.kind === 'heat') this.temp = Math.max(36.4, this.temp - 0.5);
  }

  hud() {
    return { name: this.name, label: this.label, value: this.value, pct: this.pct, warn: this.warn };
  }
}

// ============================================================
//  猎杀模式：扮演怪物，人类由 AI 操控（原 js/hunt.js）
// ============================================================
// ============================================================
//  猎杀模式：你扮演后室里的东西，人类由 AI 操控
//  · 人类用 world.findPath 走路，寻路按 0.9~1.4 秒节流，逐帧只做距离判断
//  · 每帧开销：4~5 个人类 × 一次向量运算，渲染复用同一批 billboard
// ============================================================

const HUNT_MONSTERS = {
  smiler: {
    name: '笑魇', en: 'THE SMILER', tex: TEX.SMILER,
    desc: '只在别人看不见你的时候移动。狞笑会让直视你的人僵在原地。',
    speed: 2.85, sprint: 4.45, catch: 1.65, tint: [1.0, 0.95, 0.86],
    abil: { name: '狞笑', key: 'Q', cd: 16, tip: '20 米内直视你的人类僵直 3 秒' },
  },
  hound: {
    name: '猎犬', en: 'THE HOUND', tex: TEX.HOUND,
    desc: '跑得最快，靠声音狩猎。长嚎能让整片区域的人暴露位置。',
    speed: 3.15, sprint: 5.15, catch: 1.6, tint: [0.92, 0.94, 0.98],
    abil: { name: '长嚎', key: 'Q', cd: 20, tip: '45 米内所有人类暴露 7 秒并陷入恐慌' },
  },
  stalker: {
    name: '窃皮者', en: 'SKIN-STEALER', tex: TEX.STALKER,
    desc: '拟态成人的样子靠近猎物。披着人皮时，他们不会跑。',
    speed: 3.0, sprint: 4.7, catch: 1.6, tint: [0.9, 1.0, 0.96],
    abil: { name: '拟态', key: 'Q', cd: 22, tip: '9 秒内被当成同伴：4 米外的人类不会逃跑' },
  },
  wretch: {
    name: '怨魂', en: 'THE WRETCH', tex: TEX.STALKER,
    desc: '你什么都看不见，但你听得见一切。声呐能把整层的人喊出来。',
    speed: 3.0, sprint: 4.9, catch: 1.6, tint: [0.86, 0.9, 0.9],
    abil: { name: '声呐', key: 'Q', cd: 14, tip: '全图人类暴露 6 秒，并被拖慢 4 秒' },
  },
  partygoer: {
    name: '派对客', en: 'PARTYGOER', tex: TEX.PARTYGOER,
    desc: '你邀请他们跳舞。被邀请的人会笑着朝你走过来。',
    speed: 2.95, sprint: 4.5, catch: 1.65, tint: [1.0, 0.9, 0.82],
    abil: { name: '派对邀请', key: 'Q', cd: 24, tip: '18 米内的人类不由自主地向你走来 4 秒' },
  },
};

const HUMAN_NAMES = ['M.E.G. 侦察员', '流浪者', '摄影师', '研究员', '拾荒者', '迷路的孩子'];

class Human {
  constructor(hunt, x, z, i) {
    this.hunt = hunt;
    this.g = hunt.g;
    this.x = x; this.z = z;
    this.yaw = Math.random() * Math.PI * 2;
    this.name = HUMAN_NAMES[i % HUMAN_NAMES.length];
    this.i = i;
    this.state = 'search';
    this.dead = false; this.escaped = false;
    this.deadT = 0;
    this.fear = 0;
    this.stamina = 80 + Math.random() * 20;
    this.speed = 0; this.moved = 0;
    this.path = null; this.pathKey = ''; this.pathIdx = 0; this.repath = 0.3 + Math.random() * 0.8;
    this.escTarget = null; this.repathT = 0;
    this.freeze = 0; this.charm = 0; this.slow = 0;
    this.mark = 0;
    this.anim = Math.random() * 10;
    this.stepAcc = 0;
    this.flash = i % 3 !== 2;
    this.flick = 0;
    this.seen = 0;
    this.screamT = 0;
    this.stateT = 0;
    this.known = null;
    this.wander = null;
    this.stuck = 0; this.detour = null; this.detourT = 0;
  }

  cell() { return [Math.floor(this.x / CELL), Math.floor(this.z / CELL)]; }

  stepTo(tx, tz, speed, dt) {
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    if (d < 0.001) return 0;
    const s = Math.min(d, speed * dt);
    const stepX = (dx / d) * s, stepZ = (dz / d) * s;
    let q = this.g.world.collide(this.x + stepX, this.z + stepZ, 0.3);
    if (Math.hypot(q[0] - this.x, q[1] - this.z) < s * 0.4) {
      // 正面被挡住时沿墙滑行，避免人类被家具卡死
      const qx = this.g.world.collide(this.x + stepX, this.z, 0.3);
      const qz = this.g.world.collide(this.x, this.z + stepZ, 0.3);
      const ax = Math.hypot(qx[0] - this.x, qx[1] - this.z), az = Math.hypot(qz[0] - this.x, qz[1] - this.z);
      q = ax >= az && ax > 1e-4 ? qx : (az > 1e-4 ? qz : q);
    }
    const nx = q[0], nz = q[1];
    const moved = Math.hypot(nx - this.x, nz - this.z);
    this.x = nx; this.z = nz;
    if (moved > 1e-4) this.yaw = Math.atan2(-(tx - this.x), -(tz - this.z));
    this.moved = moved;
    return moved;
  }

  follow(tx, tz, speed, dt) {
    const W = this.g.world;
    const [cgx, cgz] = this.cell();
    const tgx = Math.floor(tx / CELL), tgz = Math.floor(tz / CELL);
    if (cgx === tgx && cgz === tgz) { this.stepTo(tx, tz, speed, dt); return true; }
    const key = tgx + ',' + tgz;
    this.repath -= dt;
    if (!this.path || this.pathKey !== key || this.repath <= 0) {
      this.path = W.findPath(cgx, cgz, tgx, tgz, this.hunt.pathR);
      this.pathIdx = 0; this.pathKey = key;
      this.repath = 1.0 + Math.random() * 0.6;
      if (!this.path) this.path = [];
    }
    if (this.pathIdx < this.path.length) {
      const p = this.path[this.pathIdx];
      const bx = this.x, bz = this.z;
      this.stepTo((p[0] + 0.5) * CELL, (p[1] + 0.5) * CELL, speed, dt);
      const adv = Math.hypot(this.x - bx, this.z - bz);
      if (adv < 0.008) this.pathIdx++;                       // 被家具挡死：换下一个路点
      else if (Math.hypot((p[0] + 0.5) * CELL - this.x, (p[1] + 0.5) * CELL - this.z) < 0.5) this.pathIdx++;
      return false;
    }
    this.path = null;
    this.stepTo(tx, tz, speed, dt);
    return true;
  }

  // 找一个远离怪物的格子逃跑
  pickEscape() {
    const W = this.g.world, P = this.g.player;
    const [gx, gz] = this.cell();
    const cells = W.reachableCells(gx, gz, 5, 13);
    if (!cells.length) return null;
    let best = null, bestScore = -1e9;
    const n = Math.min(cells.length, 60);
    for (let k = 0; k < n; k++) {
      const c = cells[Math.floor(Math.random() * cells.length)];
      const x = (c[0] + 0.5) * CELL, z = (c[1] + 0.5) * CELL;
      const dm = Math.hypot(x - P.x, z - P.z);
      const de = Math.hypot(x - this.g.world.exit.x, z - this.g.world.exit.z);
      let score = dm * 1.6 - de * 0.25 + Math.random() * 3;
      if (W.los(P.x, P.z, x, z)) score -= 6;
      if (score > bestScore) { bestScore = score; best = [x, z]; }
    }
    return best;
  }

  update(dt) {
    const g = this.g, P = g.player, W = g.world;
    if (this.dead) { this.deadT += dt; return; }
    if (this.escaped) return;
    this.anim += dt;
    this.moved = 0;
    this.freeze = Math.max(0, this.freeze - dt);
    this.charm = Math.max(0, this.charm - dt);
    this.slow = Math.max(0, this.slow - dt);
    this.mark = Math.max(0, this.mark - dt);
    this.screamT -= dt;
    this.stateT += dt;
    this.flick -= dt;

    const dx = P.x - this.x, dz = P.z - this.z;
    const dist = Math.hypot(dx, dz);
    this.dist = dist;
    const cloak = this.hunt.cloak > 0;
    const los = dist < Math.max(18, this.seen > 0 ? 26 : 18) && W.los(this.x, this.z, P.x, P.z);
    const toMonster = Math.atan2(-dx, -dz);
    let d = toMonster - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const facing = Math.abs(d) < (this.seen > 0 ? 1.5 : 1.15);
    const hear = g.playerNoise >= 9 && dist < g.playerNoise * 0.85;

    if (!cloak) {
      const see = los && (facing || this.seen > 0) && dist < (this.flash ? 19 : 13) && !(this.state === 'hide');
      if (see || hear || dist < 4.2) {
        if (this.state !== 'flee') {
          this.state = 'flee';
          this.stateT = 0;
          this.path = null;
          this.repathT = 0;
          if (see && this.screamT <= 0) {
            this.screamT = 5 + Math.random() * 4;
            g.sound.humanScream(this.x, this.z);
            g.msg('尖叫声在走廊里炸开——她看见你了。');
          }
        }
        this.fear = Math.max(this.fear, hear && !see ? 3.2 : 7);
        this.seen = 2.6;
        this.known = [P.x, P.z];
      } else {
        this.seen = Math.max(0, this.seen - dt);
      }
    }

    if (this.freeze > 0) {
      this.speed = 0;
      if (this.flick <= 0) { this.flick = 0.2 + Math.random() * 0.4; }
      return;
    }
    if (this.charm > 0) {
      this.state = 'charm';
      this.follow(P.x, P.z, 1.7, dt);
      this.speed = 1.7;
      return;
    }

    if (this.fear > 0) this.fear -= dt;
    if (this.state === 'flee') {
      if (this.fear <= 0 && this.seen <= 0) { this.state = 'objective'; this.path = null; this.stateT = 0; }
      else {
        this.stamina = Math.max(0, this.stamina - 11 * dt);
        const exhausted = this.stamina <= 0;
        const speed = (exhausted ? 1.85 : 3.85) * (this.slow > 0 ? 0.7 : 1);
        // 体力耗尽时找地方躲一下
        if (exhausted && this.stateT > 1.2 && Math.random() < dt * 0.7) {
          this.state = 'hide'; this.stateT = 0; this.hideT = 4 + Math.random() * 4;
          this.path = null;
        }
        this.repathT -= dt;
        if (!this.escTarget || this.repathT <= 0) {
          this.escTarget = this.pickEscape();
          this.repathT = 1.8 + Math.random();
        }
        if (this.escTarget) this.follow(this.escTarget[0], this.escTarget[1], speed, dt);
        this.speed = speed;
      }
    }
    if (this.state === 'hide') {
      this.stamina = Math.min(100, this.stamina + 24 * dt);
      this.speed = 0;
      this.flash = false;
      if (this.stateT > (this.hideT || 5) || this.dist < 6) {
        this.state = 'flee'; this.stateT = 0; this.repathT = 0;
        this.flash = this.i % 3 !== 2;
      }
    } else if (this.state === 'search') {
      this.stamina = Math.min(100, this.stamina + 11 * dt);
      this.repathT -= dt;
      if (!this.wander || this.repathT <= 0) {
        this.repathT = 4 + Math.random() * 4;
        const [gx, gz] = this.cell();
        const cells = W.reachableCells(gx, gz, 4, 13);
        const c = cells.length ? cells[Math.floor(Math.random() * cells.length)] : null;
        this.wander = c ? [(c[0] + 0.5) * CELL, (c[1] + 0.5) * CELL] : null;
      }
      if (this.wander) { this.follow(this.wander[0], this.wander[1], 1.95, dt); this.speed = 1.95; }
      else this.speed = 0;
    } else if (this.state === 'objective') {
      this.stamina = Math.min(100, this.stamina + 9 * dt);
      const e = W.exit;
      if (this.detourT > 0 && this.detour) {
        this.detourT -= dt;
        this.follow(this.detour[0], this.detour[1], 2.2, dt);
        this.speed = 2.2;
      } else if (!this.g.level.noExit && e) {
        const dExit = Math.hypot(e.x - this.x, e.z - this.z);
        if (dExit < 1.9 && W.los(this.x, this.z, e.x, e.z)) {
          this.escaped = true;
          g.sound.whoosh();
          g.msg(this.name + ' 找到出口了。');
          this.hunt.escapes++;
          return;
        }
        const speed = 2.45;
        this.follow(e.x, e.z, speed, dt);
        this.speed = speed;
      } else {
        this.stamina = Math.min(100, this.stamina + 12 * dt);
        this.repathT -= dt;
        if (!this.wander || this.repathT <= 0) {
          this.repathT = 6 + Math.random() * 5;
          const [gx, gz] = this.cell();
          const cells = W.reachableCells(gx, gz, 4, 12);
          const c = cells.length ? cells[Math.floor(Math.random() * cells.length)] : null;
          this.wander = c ? [(c[0] + 0.5) * CELL, (c[1] + 0.5) * CELL] : null;
        }
        if (this.wander) { this.follow(this.wander[0], this.wander[1], 1.7, dt); this.speed = 1.7; }
        else this.speed = 0;
      }
    }

    // 卡住了就临时换一个目标点绕开
    if (this.speed > 0.5 && this.moved < 0.004) this.stuck += dt;
    else this.stuck = Math.max(0, this.stuck - dt * 2);
    if (this.stuck > 1.5) {
      this.stuck = 0;
      const [gx, gz] = this.cell();
      const cells = W.reachableCells(gx, gz, 4, 12);
      if (cells.length) {
        const c = cells[Math.floor(Math.random() * cells.length)];
        this.detour = [(c[0] + 0.5) * CELL, (c[1] + 0.5) * CELL];
        this.detourT = 5;
        this.path = null;
      }
    }
    // 脚步声：怪物听得到，也用来给 AI 一点情报
    if (this.moved > 0.001 && this.speed > 0.3) {
      this.stepAcc += this.moved;
      if (this.stepAcc > 0.85) {
        this.stepAcc = 0;
        g.sound.humanStep(this.x, this.z, this.state === 'flee' ? 0.7 : 0.35);
      }
    }
    if (this.flash && this.flick <= 0 && this.state === 'flee' && Math.random() < dt * 0.9) this.flick = 0.15;
  }

  kill() {
    if (this.dead || this.escaped) return;
    this.dead = true;
    this.deadT = 0;
    this.speed = 0;
    this.g.sound.humanScream(this.x, this.z);
    this.g.shakeAmt = Math.max(this.g.shakeAmt, 0.55);
    this.g.sound.entityCry('chaser');
    // 其他人听见了
    for (const h of this.hunt.humans) if (h !== this && !h.dead && !h.escaped) {
      h.fear = Math.max(h.fear, 6);
      h.state = 'flee'; h.stateT = 0; h.repathT = 0; h.path = null;
    }
    this.g.msg(this.name + ' 被你抓住了。');
  }

  sprite(out) {
    if (this.dead && this.deadT > 3.2) return;
    const sink = this.dead ? Math.min(1.4, this.deadT * 1.2) : 0;
    let x = this.x, z = this.z;
    // 贴墙时整体往外推，避免贴图穿墙
    const r = this.g.world.collide(x, z, 0.75);
    const sx = r[0] - x, sz = r[1] - z, pen = Math.hypot(sx, sz);
    if (pen > 0.01 && pen < 1.2) {
      const k = Math.min(0.42, pen) / pen;
      x += sx * k; z += sz * k;
    }
    const fy = this.g.world.floorAt(x, z);
    let base = fy;
    if (this.g.level.water) base = Math.max(fy, this.g.level.water - 1.15);
    out.push({ x, z, y0: base - sink, w: 0.78, h: 1.68 - sink * 0.5, layer: TEX.SURVIVOR, emit: 0.03, off: 0 });
    if (this.hunt.mark > 0 && !this.dead) {
      out.push({ x, z, y0: base + 1.85, w: 0.28, h: 0.28, layer: TEX.INDICATOR, emit: 1.6, off: 0 });
    }
  }
}

class Hunt {
  constructor(g, kind) {
    this.g = g;
    this.kind = HUNT_MONSTERS[kind] ? kind : 'hound';
    this.cfg = HUNT_MONSTERS[this.kind];
    this.diff = clamp(g.settings.diff | 0, 0, 2);
    this.limit = [360, 300, 240][this.diff];
    this.left = this.limit;
    this.searchLeft = [55, 38, 24][this.diff];
    this.humans = [];
    this.escapes = 0;
    this.lungeT = 0; this.lungeCd = 0;
    this.abilCd = 0; this.cloak = 0;
    this.pathR = 40;
    this.hitT = 0;
    this.marks = [];
    this.done = false;
    this.uiT = 0;
    this.lungeDir = [0, -1];
    this.spawnAll();
  }

  spawnAll() {
    const g = this.g, W = g.world, P = g.player, L = g.level;
    const s = W.start;
    // 怪物：出生在离人类 16~28 米的地方
    let cells = W.reachableCells(s.gx, s.gz, 8, 16);
    if (!cells.length) cells = W.reachableCells(s.gx, s.gz, 5, 10);
    if (L.gen === 'corridor') {
      P.x = 2.5 * CELL; P.z = 7 * CELL; P.yaw = -Math.PI / 2;
    } else if (cells.length) {
      const c = cells[Math.floor(Math.random() * cells.length)];
      P.x = (c[0] + 0.5) * CELL;
      P.z = (c[1] + 0.5) * CELL;
      P.yaw = Math.atan2(-(s.gx - c[0]), -(s.gz - c[1]));
    } else {
      P.x = (s.gx + 0.5) * CELL; P.z = (s.gz + 0.5) * CELL;
      P.yaw = s.yaw || 0;
    }
    // 人类：靠近出生点，彼此分散
    const near = L.gen === 'corridor'
      ? W.reachableCells(s.gx, s.gz, 6, 34).filter((c) => c[0] > 8)
      : W.reachableCells(s.gx, s.gz, 1, 9);
    const count = L.gen === 'corridor' ? [2, 3, 4][this.diff] : [3, 4, 5][this.diff];
    let placed = 0;
    for (let k = 0; k < count && near.length; k++) {
      let cell = null, tries = 0;
      while (tries++ < 24) {
        const c = near[Math.floor(Math.random() * near.length)];
        const x = (c[0] + 0.5) * CELL, z = (c[1] + 0.5) * CELL;
        if (Math.hypot(x - P.x, z - P.z) < 6) continue;
        if (this.humans.some((h) => Math.hypot(h.x - x, h.z - z) < 3)) continue;
        cell = [x, z]; break;
      }
      if (!cell) continue;
      const h = new Human(this, cell[0], cell[1], placed);
      this.humans.push(h);
      placed++;
    }
    if (!this.humans.length) {
      const x = (s.gx + 2.5) * CELL, z = (s.gz + 0.5) * CELL;
      this.humans.push(new Human(this, x, z, 0));
    }
    this.total = this.humans.length;
  }

  activeHumans() {
    let n = 0;
    for (const h of this.humans) if (!h.dead && !h.escaped) n++;
    return n;
  }

  update(dt) {
    const g = this.g, P = g.player, L = g.level, K = g.keys, C = g.controls;
    this.left -= dt;
    this.lungeCd = Math.max(0, this.lungeCd - dt);
    this.abilCd = Math.max(0, this.abilCd - dt);
    this.cloak = Math.max(0, this.cloak - dt);
    this.hitT = Math.max(0, this.hitT - dt);

    // ---- 视角 / 移动 ----
    P.crouch = gDamp(P.crouch, (K.KeyC || (C && C.crouch)) ? 1 : 0, 10, dt);
    const crouch = P.crouch > 0.5;
    const fwdIn = clamp((K.KeyW || K.ArrowUp ? 1 : 0) - (K.KeyS || K.ArrowDown ? 1 : 0) + (C ? C.y : 0), -1, 1);
    const strIn = clamp((K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0) + (C ? C.x : 0), -1, 1);
    const moving = fwdIn !== 0 || strIn !== 0;
    const wantSprint = (K.ShiftLeft || K.ShiftRight || (C && C.sprint)) && fwdIn > 0 && !crouch;
    const sprinting = wantSprint && P.stamina > 1 && moving;
    if (sprinting) {
      P.stamina = Math.max(0, P.stamina - 19 * dt);
    } else {
      P.stamina = Math.min(100, P.stamina + (crouch ? 20 : 13) * dt);
    }
    let speed = crouch ? 1.25 : sprinting ? this.cfg.sprint : this.cfg.speed;
    if (L.water) {
      const depth = Math.max(0, L.water - g.world.floorAt(P.x, P.z));
      if (depth > 1.1) speed *= 0.62;
      else if (depth > 0.12) speed *= 0.82;
    }
    let mx = 0, mz = 0;
    if (this.lungeT > 0) {
      this.lungeT -= dt;
      mx = this.lungeDir[0] * 12.5;
      mz = this.lungeDir[1] * 12.5;
    } else {
      const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
      mx = -sy * fwdIn + cy * strIn;
      mz = -cy * fwdIn - sy * strIn;
      const ml = Math.hypot(mx, mz);
      if (ml > 1) { mx /= ml; mz /= ml; }
      mx *= speed; mz *= speed;
    }
    P.vx = gDamp(P.vx, mx, 11, dt);
    P.vz = gDamp(P.vz, mz, 11, dt);
    const ox = P.x, oz = P.z;
    {
      const dx = P.vx * dt, dz = P.vz * dt;
      const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.22));
      let nx = P.x, nz = P.z;
      for (let k = 0; k < n; k++) {
        const q = g.world.collide(nx + dx / n, nz + dz / n, 0.32);
        nx = q[0]; nz = q[1];
      }
      P.x = nx; P.z = nz;
    }
    const moved = Math.hypot(P.x - ox, P.z - oz);
    P.speed = moved / Math.max(dt, 1e-4);
    P.bob += (moved / (sprinting ? 1.1 : 0.85)) * Math.PI;
    P.bobAmt = gDamp(P.bobAmt, clamp(P.speed / 5, 0, 1), 8, dt);
    if (P.speed > 0.5) {
      const idx = Math.floor(P.bob / Math.PI);
      if (idx !== P.stepIdx) {
        P.stepIdx = idx;
        const wet = L.water && g.world.floorAt(P.x, P.z) < L.water - 0.02;
        g.sound.footstep(wet ? 'water' : L.surface, sprinting ? 1 : crouch ? 0.15 : 0.5);
      }
    }
    g.playerNoise = P.speed < 0.3 ? 0 : crouch ? 1 : sprinting ? 26 : 11;

    // 水面高度（角色站立/下潜）
    if (L.water) {
      const floor = g.world.floorAt(P.x, P.z);
      g.floorY = gDamp(g.floorY, Math.max(floor, L.water + 0.18 - 1.62), 5, dt);
      g.underwater = clamp((L.water - g.floorY - 1.62) * 2, 0, 1);
    }

    // ---- 环境音 / 区块 / 灯光 ----
    g.streamChunks(false);
    g.gatherLights(dt);
    P.lightSmooth = Math.max(P.lightSmooth, 0.42);   // 怪物的眼睛适应黑暗
    g.sound.setHum(L.hum * 0.3);

    // ---- 人类 ----
    if (this.searchLeft > 0) {
      this.searchLeft -= dt;
      if (this.searchLeft <= 0) {
        for (const h of this.humans) if (h.state === 'search') { h.state = 'objective'; h.path = null; h.stateT = 0; }
        g.msg('他们开始朝出口移动了。别让他们走到那里。');
      }
    }
    for (const h of this.humans) h.update(dt);
    // 人类之间互相分离，避免两三个人叠成一坨
    for (let a = 0; a < this.humans.length; a++) {
      const ha = this.humans[a];
      if (ha.dead || ha.escaped) continue;
      for (let b = a + 1; b < this.humans.length; b++) {
        const hb = this.humans[b];
        if (hb.dead || hb.escaped) continue;
        const dx = hb.x - ha.x, dz = hb.z - ha.z, d = Math.hypot(dx, dz);
        if (d > 0.62 || d < 1e-4) continue;
        const push = (0.62 - d) * 0.5 / d;
        const qa = g.world.collide(ha.x - dx * push, ha.z - dz * push, 0.3);
        const qb = g.world.collide(hb.x + dx * push, hb.z + dz * push, 0.3);
        ha.x = qa[0]; ha.z = qa[1];
        hb.x = qb[0]; hb.z = qb[1];
      }
    }

    // ---- 接触捕食 ----
    const reach = this.cfg.catch + (this.lungeT > 0 ? 0.8 : 0);
    for (const h of this.humans) {
      if (h.dead || h.escaped) continue;
      const d = Math.hypot(h.x - P.x, h.z - P.z);
      if (d > reach + 0.6) continue;
      if (!g.world.los(P.x, P.z, h.x, h.z, true)) continue;
      h.kill();
      this.hitT = 0.7;
      P.sanity = Math.min(100, P.sanity);
    }

    // ---- 胜负 ----
    if (this.activeHumans() === 0 && !this.done) {
      this.done = true;
      g.huntResult(this);
    } else if (this.left <= 0 && !this.done) {
      this.done = true;
      g.huntResult(this);
    }
  }

  // ---- 技能 ----
  lunge() {
    const g = this.g, P = g.player;
    if (this.lungeCd > 0 || this.done) return;
    this.lungeCd = 3.6;
    this.lungeT = 0.32;
    this.lungeDir = [-Math.sin(P.yaw), -Math.cos(P.yaw)];
    g.sound.glitch();
    g.shakeAmt = Math.max(g.shakeAmt, 0.2);
  }

  ability() {
    const g = this.g, P = g.player;
    if (this.abilCd > 0 || this.done) return;
    this.abilCd = this.cfg.abil.cd;
    if (this.kind === 'smiler') {
      let n = 0;
      for (const h of this.humans) {
        if (h.dead || h.escaped) continue;
        if (Math.hypot(h.x - P.x, h.z - P.z) < 20 && g.world.los(P.x, P.z, h.x, h.z)) {
          h.freeze = 3; h.fear = 8; n++;
        }
      }
      g.sound.entityCry('smiler');
      g.glitch = Math.max(g.glitch, 0.5);
      g.msg(n ? '狞笑让 ' + n + ' 个人僵在原地，动不了了。' : '狞笑在空荡的走廊里回响，没有人看见。');
    } else if (this.kind === 'hound') {
      let n = 0;
      for (const h of this.humans) {
        if (h.dead || h.escaped) continue;
        if (Math.hypot(h.x - P.x, h.z - P.z) < 45) { h.mark = 7; h.fear = Math.max(h.fear, 5); h.state = 'flee'; h.stateT = 0; n++; }
      }
      g.sound.entityCry('hound');
      g.msg('长嚎撕开了整层楼。' + (n ? n + ' 个人在跑。' : '没有人回应。'));
    } else if (this.kind === 'stalker') {
      this.cloak = 9;
      g.sound.whisper(0.5);
      g.msg('你披上了人皮。现在，你看起来和他们一样。');
    } else if (this.kind === 'wretch') {
      let n = 0;
      for (const h of this.humans) {
        if (h.dead || h.escaped) continue;
        h.mark = 6; h.slow = 4; n++;
      }
      g.sound.blip(0.5, 1800);
      g.msg('声呐脉冲扫过墙壁。' + (n ? '你听见了 ' + n + ' 个心跳。' : '整层都是空的。'));
    } else {
      let n = 0;
      for (const h of this.humans) {
        if (h.dead || h.escaped) continue;
        if (Math.hypot(h.x - P.x, h.z - P.z) < 18 && g.world.los(P.x, P.z, h.x, h.z)) {
          h.charm = 4; h.state = 'charm'; n++;
        }
      }
      g.sound.entityCry('partygoer');
      g.msg(n ? n + ' 个人笑着朝你走来。' : '没有人接受你的邀请。');
    }
  }

  lights(lp, lc, n) {
    const P = this.g.player;
    for (const h of this.humans) {
      if (h.dead || h.escaped || !h.flash || n >= MAXL) continue;
      const d2 = (h.x - P.x) ** 2 + (h.z - P.z) ** 2;
      if (d2 > 34 * 34) continue;
      if (!this.g.world.los(P.x, P.z, h.x, h.z)) continue;
      const flick = h.flick > 0 ? 0.35 : 1;
      lp[n * 4] = h.x - Math.sin(h.yaw) * 1.1;
      lp[n * 4 + 1] = 1.45;
      lp[n * 4 + 2] = h.z - Math.cos(h.yaw) * 1.1;
      lp[n * 4 + 3] = 1.15 * flick;
      lc[n * 3] = 1.0; lc[n * 3 + 1] = 0.9; lc[n * 3 + 2] = 0.72;
      n++;
    }
    return n;
  }

  updateHUD() {
    const g = this.g, P = g.player;
    const set = (id, text) => { const el = document.getElementById(id); if (el && el.textContent !== text) el.textContent = text; };
    this.uiT -= 1 / 60;
    set('hh-alive', String(this.activeHumans()));
    set('hh-total', String(this.total));
    set('hh-escaped', String(this.escapes));
    set('hh-time', fmtTime(Math.max(0, this.left)));
    set('hh-noise', P.speed < 0.3 ? '静止' : P.crouch > 0.5 ? '很轻' : P.sprinting ? '很响' : '一般');
    set('hh-abil', this.cfg.abil.name);
    // 始终指向最近的活人（你能闻到活人的气味），距离精确到米
    const scent = document.getElementById('hunt-scent');
    let near = null, nd = Infinity;
    for (const h of this.humans) {
      if (h.dead || h.escaped) continue;
      const d = Math.hypot(h.x - P.x, h.z - P.z);
      if (d < nd) { nd = d; near = h; }
    }
    if (scent) {
      if (!near) scent.classList.add('hidden');
      else {
        scent.classList.remove('hidden');
        scent.classList.toggle('close', nd < 12);
        let rel = Math.atan2(-(near.x - P.x), -(near.z - P.z)) - P.yaw;
        while (rel > Math.PI) rel -= Math.PI * 2;
        while (rel < -Math.PI) rel += Math.PI * 2;
        const arrow = document.getElementById('hs-arrow');
        if (arrow) arrow.style.transform = 'rotate(' + (-rel * 180 / Math.PI).toFixed(0) + 'deg)';
        const txt = '最近的气味 · ' + Math.round(nd) + 'm';
        const label = document.getElementById('hs-text');
        if (label && label.textContent !== txt) label.textContent = txt;
      }
    }
    const a1 = document.getElementById('hh-a1');
    if (a1) a1.style.width = clamp(100 - (this.lungeCd / 3.6) * 100, 0, 100).toFixed(1) + '%';
    const a2 = document.getElementById('hh-a2');
    if (a2) a2.style.width = clamp(100 - (this.abilCd / this.cfg.abil.cd) * 100, 0, 100).toFixed(1) + '%';
    if (this.cloak > 0) set('hh-abil', this.cfg.abil.name + '（' + Math.ceil(this.cloak) + 's）');

    // 被标记的人类：屏幕下方的小箭头
    const box = document.getElementById('hunt-marks');
    if (!box) return;
    const marks = [];
    for (const h of this.humans) {
      if (h.dead || h.escaped || h.mark <= 0) continue;
      marks.push(h);
    }
    if (box.childElementCount !== marks.length) {
      box.replaceChildren();
      for (let k = 0; k < marks.length; k++) {
        const d = document.createElement('div');
        d.className = 'hmark';
        d.innerHTML = '<i>▲</i><span></span>';
        box.appendChild(d);
      }
    }
    for (let k = 0; k < marks.length; k++) {
      const h = marks[k], el = box.children[k];
      if (!el) continue;
      const dx = h.x - P.x, dz = h.z - P.z;
      const dist = Math.hypot(dx, dz);
      let rel = Math.atan2(-dx, -dz) - P.yaw;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      const arrow = el.firstChild, span = el.lastChild;
      arrow.style.transform = 'rotate(' + (-rel * 180 / Math.PI).toFixed(0) + 'deg)';
      const txt = Math.round(dist) + 'm';
      if (span.textContent !== txt) span.textContent = txt;
    }
  }
}

function showError(msg) {
  const el = $('error');
  if (!el) return;
  el.textContent = '出错了：\n' + msg;
  el.classList.remove('hidden');
}

window.addEventListener('error', (e) => showError((e.error && e.error.stack) || e.message));

const game = new Game();
window.game = game;
window.addEventListener('load', () => game.boot());
