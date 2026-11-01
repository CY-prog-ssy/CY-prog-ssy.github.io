'use strict';

// Each finger owns one control. Capture and cancellation keep a second touch
// from stealing the joystick or leaving movement held after an interruption.
class TouchControls {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('touch-controls');
    this.pad = document.getElementById('move-pad');
    this.stick = document.getElementById('move-stick');
    this.look = document.getElementById('look-pad');
    this.media = window.matchMedia('(pointer: coarse)');
    this.x = 0; this.y = 0;
    this.sprint = false; this.crouch = false; this.scan = false;
    this.moveId = null; this.lookId = null; this.scanId = null;
    this.enabled = false;
    this.visible = false;
    this.uiCache = {};
    this.bind();
    this.refresh();
    this.media.addEventListener('change', () => {
      this.refresh();
      this.game.applyDisplaySettings();
    });
  }

  refresh() {
    const mode = this.game.settings.touch;
    const enabled = mode === 'on' || (mode !== 'off' && this.media.matches);
    if (this.enabled !== enabled) this.reset();
    this.enabled = enabled;
    document.body.classList.toggle('touch-ui', enabled);
    document.getElementById('note-close').textContent = enabled ? '点按「合上」· 走开也会自动合上' : '[E] 合上 · 走开也会自动合上';
    document.documentElement.style.setProperty('--touch-opacity', this.game.settings.touchOpacity);
    this.update();
  }

  active() { return this.enabled && this.game.state === 'playing'; }

  bind() {
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.pad.addEventListener('pointerdown', (e) => {
      if (!this.active() || this.moveId !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      this.moveId = e.pointerId;
      this.pad.setPointerCapture(e.pointerId);
      this.pad.classList.add('engaged');
      this.move(e);
    });
    this.pad.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.moveId) { e.preventDefault(); this.move(e); }
    });
    const releaseMove = (e) => { if (e.pointerId === this.moveId) this.resetMove(); };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.pad.addEventListener(type, releaseMove);

    this.look.addEventListener('pointerdown', (e) => {
      if (!this.active() || this.lookId !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      this.lookId = e.pointerId;
      this.lookX = e.clientX; this.lookY = e.clientY;
      this.look.setPointerCapture(e.pointerId);
      this.root.classList.add('look-used');
    });
    this.look.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookId || !this.active()) return;
      e.preventDefault();
      const dx = e.clientX - this.lookX, dy = e.clientY - this.lookY;
      this.lookX = e.clientX; this.lookY = e.clientY;
      const scale = 0.004 * this.game.settings.touchSens;
      this.game.player.yaw -= dx * scale;
      this.game.player.pitch = clamp(this.game.player.pitch - dy * scale, -1.45, 1.45);
    });
    const releaseLook = (e) => { if (e.pointerId === this.lookId) this.lookId = null; };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.look.addEventListener(type, releaseLook);

    const bindPress = (button, action) => {
      button.addEventListener('pointerdown', (e) => {
        if (!this.active() || (e.pointerType === 'mouse' && e.button !== 0)) return;
        e.preventDefault();
        action();
      });
      button.addEventListener('click', (e) => {
        if (e.detail === 0 && !e.pointerType && this.active()) action();
      });
    };
    for (const button of this.root.querySelectorAll('[data-action]')) {
      bindPress(button, () => {
        if (this.active()) this.game.performAction(button.dataset.action);
      });
    }
    for (const button of this.root.querySelectorAll('[data-toggle]')) {
      bindPress(button, () => {
        if (!this.active()) return;
        const key = button.dataset.toggle;
        this[key] = !this[key];
        if (key === 'crouch' && this.crouch) this.sprint = false;
        if (key === 'sprint' && this.sprint) this.crouch = false;
        this.update();
      });
    }
    const scan = document.getElementById('touch-scan');
    scan.addEventListener('pointerdown', (e) => {
      if (!this.active() || this.scanId !== null || !this.game.player.lidar) return;
      e.preventDefault();
      this.scanId = e.pointerId; this.scan = true;
      scan.setPointerCapture(e.pointerId);
      scan.classList.add('is-active');
    });
    const releaseScan = (e) => {
      if (e.pointerId !== this.scanId) return;
      this.scanId = null; this.scan = false;
      scan.classList.remove('is-active');
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) scan.addEventListener(type, releaseScan);
    window.addEventListener('blur', () => this.reset());
    window.addEventListener('resize', () => this.reset());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
  }

  move(e) {
    if (!this.active()) { this.resetMove(); return; }
    const rect = this.pad.getBoundingClientRect();
    const radius = rect.width * 0.34;
    const dx = e.clientX - rect.left - rect.width / 2;
    const dy = e.clientY - rect.top - rect.height / 2;
    const distance = Math.hypot(dx, dy);
    const fraction = Math.min(1, distance / radius);
    const magnitude = Math.max(0, (fraction - 0.12) / 0.88);
    this.x = distance ? dx / distance * magnitude : 0;
    this.y = distance ? -dy / distance * magnitude : 0;
    const factor = distance ? Math.min(radius, distance) / distance : 0;
    this.stick.style.setProperty('--stick-x', (dx * factor).toFixed(1) + 'px');
    this.stick.style.setProperty('--stick-y', (dy * factor).toFixed(1) + 'px');
  }

  resetMove() {
    const id = this.moveId;
    this.moveId = null; this.x = 0; this.y = 0;
    if (id !== null && this.pad.hasPointerCapture(id)) this.pad.releasePointerCapture(id);
    this.stick.style.setProperty('--stick-x', '0px');
    this.stick.style.setProperty('--stick-y', '0px');
    this.pad.classList.remove('engaged');
  }

  reset() {
    this.resetMove();
    const lookId = this.lookId;
    this.lookId = null;
    if (lookId !== null && this.look.hasPointerCapture(lookId)) this.look.releasePointerCapture(lookId);
    const scan = document.getElementById('touch-scan'), scanId = this.scanId;
    this.scanId = null; this.scan = false;
    if (scanId !== null && scan.hasPointerCapture(scanId)) scan.releasePointerCapture(scanId);
    scan.classList.remove('is-active');
    this.sprint = false; this.crouch = false;
  }

  update() {
    const playing = this.game.state === 'playing';
    const visible = this.enabled && playing;
    if (visible !== this.visible) {
      this.visible = visible;
      this.root.classList.toggle('hidden', !visible);
      if (!visible) this.reset();
    }
    document.getElementById('game-tools').classList.toggle('hidden', !playing);
    if (!visible) return;
    const P = this.game.player;
    const text = (id, value) => {
      if (this.uiCache[id] === value) return;
      this.uiCache[id] = value;
      document.getElementById(id).textContent = value;
    };
    const pressed = (id, value) => {
      if (this.uiCache[id] === value) return;
      this.uiCache[id] = value;
      const el = document.getElementById(id);
      el.setAttribute('aria-pressed', String(value));
      el.classList.toggle('is-active', value);
    };
    pressed('touch-sprint', this.sprint);
    pressed('touch-crouch', this.crouch);
    pressed('touch-flash', !!P.flash);
    pressed('touch-map', !!this.game.bigMap);
    text('touch-almond-count', String(P.almond));
    text('touch-battery-count', String(P.batteries));
    text('touch-interact', this.game.noteSrc ? '合上' : '交互');
    document.getElementById('touch-scan').classList.toggle('hidden', !P.lidar);
    document.getElementById('touch-interact').classList.toggle('available', !!this.game.focus || !!this.game.noteSrc);
  }
}
