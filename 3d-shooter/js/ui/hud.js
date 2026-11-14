/* =========================================================================
   hud.js
   ========================================================================= */
"use strict";

let hitStopT = 0, hitStopScale = 1;

function hitStop(scale, dur){
  if (!G.running || G.over) return;
  if (dur >= hitStopT){
    hitStopT = dur;
    hitStopScale = scale;
  } else if (scale < hitStopScale){
    hitStopScale = scale;
  }
}

const $ = id => document.getElementById(id);

const UI = {
  hud:       $('hud'),
  cctx:      $('cross').getContext('2d'),
  hitmark:   $('hitmark'),
  feed:      $('feed'),
  dmgDirs:   $('dmgDirs'),
  hpNum:     $('hpNum'),  hpFill: $('hpFill'),
  apNum:     $('apNum'),  apFill: $('apFill'),
  hpMax:     $('hpMax'),  apMax:  $('apMax'),
  squad:     $('squad'),  allyLvl: $('allyLvl'),
  allyHpNum: $('allyHpNum'), allyHpMax: $('allyHpMax'),
  allyHpFill:$('allyHpFill'), allyApNum: $('allyApNum'), allyApFill: $('allyApFill'),
  revNum:    $('revNum'), droneNum: $('droneNum'),
  allyMode:  $('allyMode'), droneMode: $('droneMode'), turretNum: $('turretNum'),
  rowAllyCmd:$('rowAllyCmd'), rowDroneCmd: $('rowDroneCmd'),
  squadHead: $('squadHead'), squadCaret: $('squadCaret'),
  placeBtn:  $('btnPlace'), cancelBtn: $('btnCancel'),
  bossBar:   $('bossBar'), bossName: $('bossName'), bossBlurb: $('bossBlurb'),
  bossFill:  $('bossFill'), bossApFill: $('bossApFill'),
  apTag:     $('apTag'), medNum: $('medNum'), medRow: $('medRow'),
  healWrap:  $('healWrap'), healFill: $('healFill'), healTag: $('healTag'),
  btnHeal:   $('btnHeal'), medWrap: $('medWrap'),
  magNum:    $('magNum'), resNum: $('resNum'),
  wname:     $('wname'), wmode: $('wmode'),
  wicon:     $('wicon'), reloadHint: $('reloadHint'),
  timer:     $('timer'), killCount: $('killCount'), lowhp: $('lowhp'),
  edgeGlow:  $('edgeGlow'), hitFeedGlow: $('hitFeedbackGlow'),
  killBadge: $('killBadge'), killRing: $('killRing'),
  goldPop:   $('goldPop'),  streakBanner: $('streakBanner'),
  shieldGlow:$('shieldGlow'),
  waveNum:   $('waveNum'), waveTotal: $('waveTotal'),
  goldNum:   $('goldNum'), goldRow: $('goldRow'),
  objLeft:   $('objLeft'), objClear: $('objClear'),
  banner:    $('waveBanner'), bannerNum: $('wbNum'), bannerSub: $('wbSub'),
  shop:      $('shop'), shopItems: $('shopItems'), shopGold: $('shopGold'),
  shopTurrets:$('shopTurrets'), turretList: $('turretList'), turretCount: $('turretCount'),
  shopWave:  $('shopWave'), shopTimer: $('shopTimer'), btnShop: $('btnShop'),
  minimap:   $('minimap'), mctx: $('minimap').getContext('2d'),
  slots:     [], // 动态获取
  cross:     $('cross'), scope: $('scope'), retWrap: $('retWrap'), breathTag: $('breathTag'),
  comms:     $('comms'),
  espLayer:  $('espLayer'),
  _scopeK: -1, _breathTip: null, _icon: -1, _bossRef: null,
  startScreen: $('startScreen'),
  endScreen:   $('endScreen'),
  pause:       $('pause'),
  boot:        $('boot')
};

function updateVitalsUI(){
  UI.hpNum.textContent = Math.max(0, Math.round(player.hp));
  UI.apNum.textContent = Math.max(0, Math.round(player.armor));
  UI.hpFill.style.transform = `scaleX(${clamp(player.hp / player.maxHp, 0, 1)})`;
  UI.apFill.style.transform = `scaleX(${clamp(player.armor / player.maxArmor, 0, 1)})`;
  UI.hpFill.classList.toggle('low', player.hp <= player.maxHp * 0.3);
  UI.hpMax.textContent = '/ ' + Math.round(player.maxHp);
  UI.apMax.textContent = '/ ' + Math.round(player.maxArmor);

  UI.medWrap.classList.toggle('off', !SET.healing);
  if (UI.btnHeal) UI.btnHeal.classList.toggle('off', !SET.healing);
  UI.medNum.textContent = '\u00d7 ' + player.medkits;
  UI.medNum.classList.toggle('empty', player.medkits <= 0);
  if (UI.btnHeal) UI.btnHeal.classList.toggle('empty', player.medkits <= 0 || player.hp >= 100);

  const healing = player.healT > 0;
  UI.healWrap.classList.toggle('on', healing);
  UI.healFill.style.transform = `scaleX(${healing ? clamp(1 - player.healT / HEAL_DUR, 0, 1) : 0})`;

  const nudge = !healing && SET.healing && player.medkits > 0 && player.hp < player.maxHp * 0.45 && !player.dead;
  UI.healTag.textContent = healing ? 'HEALING…' : (typeof IS_TOUCH !== 'undefined' && IS_TOUCH ? 'TAP HEAL' : 'PRESS H TO HEAL');
  UI.healTag.classList.toggle('hide', !healing && !nudge);

  UI.apTag.classList.toggle('on', !!SET.armorRegen && !player.dead && player.armor < player.maxArmor - 0.05 && player.armorRegenT <= 0);
}

function updateAmmoUI(){
  const w = WEAPONS[player.weapon];
  UI.magNum.textContent = w.mag;
  UI.resNum.textContent = '/ ' + w.res;
  UI.magNum.classList.toggle('empty', w.mag === 0);
  UI.wname.textContent = w.name;

  // ✅ 子弹颜色
  let ammoColor = '';
  if (w.ammoType === 'magnum') ammoColor = '#c98cff';
  else if (w.ammoType === 'bmg50') ammoColor = '#ff3b30';
  else if (w.ammoType === 'super_ap') ammoColor = '#ffd700';

  UI.magNum.style.color = ammoColor;
  UI.resNum.style.color = ammoColor;
  UI.wname.style.color = ammoColor || '#ffb340';

  if (UI._icon !== player.weapon){
    UI._icon = player.weapon;
    UI.wicon.innerHTML = WICONS[player.weapon] || WICONS[0];
  }

  const need = w.mag === 0 || (w.mag <= w.magSize * 0.25 && w.res > 0);
  UI.reloadHint.textContent = (w.mag === 0 && w.res === 0) ? 'NO AMMO' : (need && player.reloadT <= 0 ? 'PRESS R TO RELOAD' : '');
  UI.reloadHint.classList.toggle('blink', w.mag === 0 && w.res > 0);

  // 更新武器槽高亮
  UI.slots = [...document.querySelectorAll('.slot')]; 
  UI.slots.forEach((s) => {
    const idx = parseInt(s.getAttribute('data-slot'));
    s.classList.toggle('act', idx === player.weapon);
  });
}

function showHitmark(kill){
  UI.hitmark.classList.remove('show', 'kill');
  void UI.hitmark.offsetWidth;
  if (kill) UI.hitmark.classList.add('kill');
  UI.hitmark.classList.add('show');
}

const ICON_HEAD = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="7.5" stroke="#ffb340" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="#ffb340"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" stroke="#ffb340" stroke-width="2"/></svg>`;
const ICON_SKULL = `<svg width="14" height="14" viewBox="0 0 24 24" fill="#dfe6ec" opacity=".8"><path d="M12 2C7 2 3.5 5.4 3.5 10c0 2.6 1.2 4.6 3 5.9V19a2 2 0 002 2h1v-3h1.2v3h2.6v-3H14.5v3h1a2 2 0 002-2v-3.1c1.8-1.3 3-3.3 3-5.9C20.5 5.4 17 2 12 2zM8.6 12.2a1.9 1.9 0 110-3.8 1.9 1.9 0 010 3.8zm6.8 0a1.9 1.9 0 110-3.8 1.9 1.9 0 010 3.8z"/></svg>`;

const KILL_ICONS = {
  rifle: `<svg width="20" height="20" viewBox="0 0 24 24" fill="#dfe6ec"><path d="M2 18h18v2H2zm2-8h14v4H4z"/></svg>`,
  pistol: `<svg width="20" height="20" viewBox="0 0 24 24" fill="#dfe6ec"><path d="M6 16h10v2H6zm2-6h6v4H8z"/></svg>`,
  shotgun: `<svg width="20" height="20" viewBox="0 0 24 24" fill="#dfe6ec"><circle cx="7" cy="18" r="1.5"/><circle cx="12" cy="18" r="1.5"/><circle cx="17" cy="18" r="1.5"/><path d="M3 8h18v4H3z"/></svg>`,
  sniper: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffb340" stroke-width="2"><circle cx="12" cy="12" r="6"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>`,
  barrett: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffb340" stroke-width="2"><circle cx="12" cy="12" r="6"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>`,
  grenade: `<svg width="20" height="20" viewBox="0 0 24 24" fill="#ff6a58"><path d="M12 2l2.4 7.4L22 12l-7.6 2.6L12 22l-2.4-7.4L2 12l7.6-2.6z"/></svg>`,
  fire: `<svg width="20" height="20" viewBox="0 0 24 24" fill="#ff9d96"><path d="M12 2c0 0-4 4-4 9 0 3.3 2.7 6 6 6s6-2.7 6-6c0-2-1-4-2-5.5 0 0-1 2.5-2 2.5S12 2 12 2z"/></svg>`,
  ally: `<svg width="20" height="20" viewBox="0 0 24 24" fill="#7ee081"><path d="M12 2l1.8 5.2H19l-4.2 3.6 1.6 5.4L12 13l-4.4 3.2 1.6-5.4L5 7.2h5.2z"/></svg>`,
  turret: `<svg width="20" height="20" viewBox="0 0 24 24" fill="#dfe6ec"><rect x="8" y="10" width="8" height="8" rx="2"/><path d="M10 10V4h4v6z"/></svg>`,
  boss: `<svg width="60" height="60" viewBox="0 0 24 24" fill="currentColor"><path d="M3.2 5.6l2.9 2.1L12 1.8l5.9 5.9 2.9-2.1-1.5 5.2H4.7L3.2 5.6z" opacity=".95"/><path d="M12 2.4C7.1 2.4 3.7 5.8 3.7 10.3c0 2.5 1.1 4.5 2.9 5.8V19a2 2 0 002 2h1v-3h1.2v3h2.6v-3h1.2v3h1a2 2 0 002-2v-2.9c1.8-1.3 2.9-3.3 2.9-5.8C20.3 5.8 16.9 2.4 12 2.4zM8.7 12.3a1.95 1.95 0 110-3.9 1.95 1.95 0 010 3.9zm6.6 0a1.95 1.95 0 110-3.9 1.95 1.95 0 010 3.9z"/></svg>`,
  elite: `<svg width="50" height="50" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .8l3.1 3.1L12 7 8.9 3.9 12 .8z" opacity=".95"/><path d="M12 2.4C7.1 2.4 3.7 5.8 3.7 10.3c0 2.5 1.1 4.5 2.9 5.8V19a2 2 0 002 2h1v-3h1.2v3h2.6v-3h1.2v3h1a2 2 0 002-2v-2.9c1.8-1.3 2.9-3.3 2.9-5.8C20.3 5.8 16.9 2.4 12 2.4zM8.7 12.3a1.95 1.95 0 110-3.9 1.95 1.95 0 010 3.9zm6.6 0a1.95 1.95 0 110-3.9 1.95 1.95 0 010 3.9z"/></svg>`,
  head: `<svg width="52" height="52" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="9.4" r="5.2" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".95"/><circle cx="12" cy="9.4" r="1.1" fill="currentColor"/><path d="M12 2.2v2.6M12 14v2.6M2.2 9.4h2.6M19.2 9.4h2.6" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>`
};

const KB_FX = { kill: { stop: [0.30, 0.055], shake: 0.00, ring: true }, head: { stop: [0.24, 0.085], shake: 0.14, ring: true }, elite: { stop: [0.22, 0.100], shake: 0.24, ring: true }, boss: { stop: [0.16, 0.170], shake: 0.50, ring: true } };

function replayAnim(el, cls){
  el.classList.remove('on', 'kill', 'head', 'elite', 'boss');
  void el.offsetWidth;
  if (cls) el.classList.add(cls);
  el.classList.add('on');
}

function triggerHitFeedback(head, kill){
  if (typeof SET !== 'undefined' && !SET.hitFeed) return;
  if (UI.hitFeedGlow) {
    UI.hitFeedGlow.classList.toggle('head', head);
    UI.hitFeedGlow.style.opacity = head ? '1' : '0.6';
    setTimeout(() => { UI.hitFeedGlow.style.opacity = '0'; }, kill ? 120 : 60);
  }
}

function showKillBadge(kind, byAlly, streak, source){
  const el = UI.killBadge;
  if (!el) return;
  
  let iconHTML = KILL_ICONS[source] || KILL_ICONS.rifle;
  if (kind === 'boss' || kind === 'elite' || kind === 'head') {
      iconHTML = KILL_ICONS[kind];
  }

  el.querySelector('.kbIc').innerHTML = iconHTML;
  el.querySelector('.kbTxt').textContent = (byAlly ? 'ALLY — ' : '') + (kind === 'head' ? 'HEADSHOT' : kind === 'elite' ? 'ELITE DOWN' : kind === 'boss' ? 'TARGET DOWN' : 'ELIMINATED');

  let ct = el.querySelector('.kbCt');
  if (streak >= 2){
    if (!ct){ ct = document.createElement('span'); ct.className = 'kbCt'; el.appendChild(ct); }
    ct.textContent = '×' + streak;
  } else if (ct) ct.remove();

  replayAnim(el, kind);
  if (byAlly) el.classList.add('ally'); else el.classList.remove('ally');
}

function showKillRing(kind){
  const el = UI.killRing; if (!el) return;
  replayAnim(el, kind);
}

function popGold(amt, kind){
  const el = UI.goldPop; if (!el) return;
  el.textContent = '+' + amt;
  replayAnim(el, kind);
}

function showStreakBanner(n){
  const el = UI.streakBanner; if (!el) return;
  const words = ['', '', 'DOUBLE KILL', 'TRIPLE KILL', 'QUAD KILL', 'PENTA KILL'];
  const subs  = ['', '', '', '', 'RAMPAGE', 'UNSTOPPABLE'];
  const i = Math.min(n, 5);
  el.innerHTML = (words[i] || '') + (subs[i] ? `<small>${subs[i]}</small>` : '');
  replayAnim(el, '');
}

function killFeedback(kind, byAlly, streak, source){
  showKillBadge(kind, byAlly, streak, source);
  showKillRing(kind);
  const fx = KB_FX[kind] || KB_FX.kill;
  if (fx.shake > 0) player.shake = Math.min(1.8, player.shake + fx.shake);
  hitStop(fx.stop[0], fx.stop[1]);
  G.edgeT = 0.13;
  UI.edgeGlow.style.opacity = kind === 'boss' ? '1' : '0.9';
}

function killFeed(victim, head, byAlly, source){
  const el = document.createElement('div');
  el.className = 'kf';
  
  let iconHTML = KILL_ICONS[source] || KILL_ICONS.rifle;
  if (head) iconHTML = ICON_HEAD;
  else if (byAlly) iconHTML = KILL_ICONS.ally;

  el.innerHTML = `<span class="me">${byAlly ? 'ALLY' : 'YOU'}</span>` +
                 `<span class="ic">${iconHTML}</span>` +
                 `<span class="vic">${victim}</span>`;
  UI.feed.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
  }, 4200);
  while (UI.feed.children.length > 5) UI.feed.firstChild.remove();
}

function pushComms(who, text){
  const el = document.createElement('div');
  el.className = 'cm';
  el.innerHTML = `<i>&gt;&gt;</i> <b>${who}</b> — ${text}`;
  UI.comms.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 520);
  }, 3400);
  while (UI.comms.children.length > 4) UI.comms.firstChild.remove();
}

const DMG_ARCS = [];
for (let i = 0; i < 5; i++){
  const d = document.createElement('div');
  d.className = 'dmgArc';
  UI.dmgDirs.appendChild(d);
  DMG_ARCS.push({ el: d, t: 0 });
}
let dmgHead = 0;

function damageIndicator(worldPos){
  if (!worldPos) return;
  const dx = worldPos.x - camera.position.x;
  const dz = worldPos.z - camera.position.z;
  const angToSrc = Math.atan2(dx, dz);
  const rel = angToSrc - (player.yaw + PI);
  const a = DMG_ARCS[dmgHead];
  dmgHead = (dmgHead + 1) % DMG_ARCS.length;
  a.el.style.transform = `rotate(${-rel}rad)`;
  a.t = 1.35;
}

function updateDmgArcs(dt){
  for (const a of DMG_ARCS){
    if (a.t <= 0) continue;
    a.t -= dt;
    a.el.style.opacity = clamp(a.t / 1.35, 0, 1) * 0.95;
  }
}

const XH = { inGap: 1, inLen: 4, inThick: 2, outGap: 2, outLen: 3, outThick: 2, outline: 1, maxSpread: 12, moveErr: 0.26, airErr: 3.0, reloadErr: 2.0, crouchMult: 0.7, fireScale: 240, fireHold: 0.11, fallRate: 20, dpr: 1, cx: 0, cy: 0, _last: -1 };
XH.size = 2 * Math.ceil(XH.inGap + XH.maxSpread + XH.inLen + XH.outline) + 8;

let crossSpread = 0, crossShots = 0, crossFireT = 0;

function layoutCrosshair(){
  const cv = UI.cross, d = Math.max(1, devicePixelRatio || 1);
  cv.width = cv.height = Math.round(XH.size * d);
  cv.style.width = cv.style.height = XH.size + 'px';
  const snap = v => Math.round(v * d) / d + 'px';
  cv.style.left = snap(innerWidth / 2 - XH.size / 2);
  cv.style.top  = snap(innerHeight / 2 - XH.size / 2);
  XH.dpr = d; XH.cx = Math.round(cv.width / 2); XH.cy = Math.round(cv.height / 2);
  XH._last = Math.round((XH.inGap + crossSpread) * d);
  drawCrosshair(XH._last);
}

function drawCrosshair(iA){
  const cv = UI.cross, ctx = UI.cctx, d = XH.dpr, cx = XH.cx, cy = XH.cy;
  ctx.clearRect(0, 0, cv.width, cv.height);
  const u = v => Math.max(1, Math.round(v * d));
  const o = Math.max(1, Math.round(XH.outline * d));
  const oA = Math.round((XH.inGap + XH.inLen + XH.outGap) * d);
  const arms = [[iA, u(XH.inLen),  u(XH.inThick),  0], [oA, u(XH.outLen), u(XH.outThick), 1]];
  for (let pass = 0; pass < 2; pass++){
    ctx.fillStyle = pass ? 'rgba(255,255,255,.97)' : 'rgba(0,0,0,.88)';
    const kf = pass ? 0 : o;
    for (const [a, len, t, near] of arms){
      const kn = pass ? 0 : o * near;
      const thin = t + (pass ? 0 : 2 * o);
      const long = len + kf + kn;
      const off = (t >> 1) + (pass ? 0 : o);
      ctx.fillRect(cx - off, cy - a - len - kf, thin, long);
      ctx.fillRect(cx - off, cy + a - kn, thin, long);
      ctx.fillRect(cx - a - len - kf, cy - off, long, thin);
      ctx.fillRect(cx + a - kn, cy - off, long, thin);
    }
  }
}

function updateCrosshair(dt){
  const w = WEAPONS[player.weapon];
  const speed = Math.hypot(player.vel.x, player.vel.z);
  let target = speed * XH.moveErr + (player.onGround ? 0 : XH.airErr);
  if (player.crouch) target *= XH.crouchMult;
  if (player.reloadT > 0) target += XH.reloadErr;
  crossFireT = Math.max(0, crossFireT - dt);
  if (G.shots !== crossShots){ if (G.shots > crossShots) crossFireT = XH.fireHold; crossShots = G.shots; }
  if (crossFireT > 0) target += (w.spread - w.spreadBase) * XH.fireScale;
  target *= lerp(1, 0.45, player.adsEase);
  target = clamp(target, 0, XH.maxSpread);
  crossSpread = target > crossSpread ? target : damp(crossSpread, target, XH.fallRate, dt);
  const iA = Math.round((XH.inGap + crossSpread) * XH.dpr);
  if (iA !== XH._last){ XH._last = iA; drawCrosshair(iA); }

  const scopeK = w.scope ? clamp((player.adsEase - 0.45) / 0.40, 0, 1) : 0;

// ★ 新增：任何枪械开镜时，中间十字准星都自动隐藏
const isAds = player.adsEase > 0.2 || scopeK > 0.02;
UI.cross.classList.toggle('hidden', isAds);

if (scopeK !== UI._scopeK){
  UI._scopeK = scopeK;
  UI.scope.style.opacity = scopeK;
  compMat.uniforms.scope.value = scopeK;
  vmRoot.visible = scopeK < 0.92;
}

  const showBreath = scopeK > 0.5 && !player.breathLock && player.breath <= 0 && !player.breathHeld;
  if (showBreath !== UI._breathTip){
    UI._breathTip = showBreath;
    UI.breathTag.classList.toggle('on', showBreath);
  }
}

function drawMinimap(){
  const ctx = UI.mctx, S = 172, cx = S / 2, cy = S / 2, scale = 2.35;
  ctx.clearRect(0, 0, S, S);
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, cx - 2, 0, 7); ctx.clip();
  ctx.fillStyle = 'rgba(8,12,16,.82)'; ctx.fillRect(0, 0, S, S);
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(player.yaw); ctx.scale(scale, scale); ctx.translate(-player.pos.x, -player.pos.z);
  ctx.strokeStyle = 'rgba(255,179,64,.35)'; ctx.lineWidth = 0.6; ctx.strokeRect(-HALF, -HALF, HALF * 2, HALF * 2);
  for (const r of mapRects){ ctx.fillStyle = r.c; ctx.fillRect(r.x - r.w / 2, r.z - r.d / 2, r.w, r.d); }
  for (const e of enemies){
    const p = e.obj.position;
    if (e.dead){ ctx.strokeStyle = 'rgba(120,130,140,.55)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(p.x - 0.8, p.z - 0.8); ctx.lineTo(p.x + 0.8, p.z + 0.8); ctx.moveTo(p.x + 0.8, p.z - 0.8); ctx.lineTo(p.x - 0.8, p.z + 0.8); ctx.stroke(); continue; }
    const spotted = e.canSee || e.alerted;
    if (e.tier === TIER.BOSS){ ctx.fillStyle = '#ff3b30'; ctx.beginPath(); ctx.moveTo(p.x, p.z - 2.6); ctx.lineTo(p.x + 2.6, p.z); ctx.lineTo(p.x, p.z + 2.6); ctx.lineTo(p.x - 2.6, p.z); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(255,59,48,.55)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.arc(p.x, p.z, 4.2 + Math.sin(perfNow / 260) * 0.7, 0, 7); ctx.stroke(); continue; }
    if (e.tier === TIER.ELITE){ ctx.fillStyle = spotted ? '#c48cff' : 'rgba(180,108,255,.45)'; ctx.beginPath(); ctx.arc(p.x, p.z, spotted ? 2.0 : 1.5, 0, 7); ctx.fill(); continue; }
    ctx.fillStyle = spotted ? '#ff3b30' : 'rgba(255,120,90,.42)'; ctx.beginPath(); ctx.arc(p.x, p.z, spotted ? 1.5 : 1.1, 0, 7); ctx.fill();
  }
  if (typeof turrets !== 'undefined'){ for (const t of turrets){ const k = t.hp / t.maxHp; ctx.fillStyle = k > 0.5 ? '#ffb340' : '#ff6a58'; ctx.fillRect(t.obj.position.x - 1.4, t.obj.position.z - 1.4, 2.8, 2.8); } }
  if (typeof ally !== 'undefined' && ally){ const ap = ally.obj.position; ctx.fillStyle = ally.dead ? 'rgba(126,224,129,.35)' : '#7ee081'; ctx.beginPath(); ctx.arc(ap.x, ap.z, 1.5, 0, 7); ctx.fill(); }
  ctx.restore();
  ctx.fillStyle = 'rgba(255,179,64,.13)'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 44, -PI / 2 - 0.62, -PI / 2 + 0.62); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffb340'; ctx.beginPath(); ctx.moveTo(cx, cy - 6); ctx.lineTo(cx + 4.6, cy + 5); ctx.lineTo(cx, cy + 2.6); ctx.lineTo(cx - 4.6, cy + 5); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(223,230,236,.20)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, cx - 2, 0, 7); ctx.stroke();
}

function updateSquadUI(){
  UI.revNum.textContent = '× ' + player.revives;
  UI.droneNum.textContent = (typeof drone === 'undefined' || !drone) ? '—' : drone.dead ? 'DOWN' : Math.round(drone.hp) + ' / ' + Math.round(drone.maxHp);
  UI.droneNum.classList.toggle('warn', typeof drone !== 'undefined' && !!drone && drone.dead);
  const a = (typeof ally !== 'undefined') ? ally : null;
  UI.squad.classList.toggle('empty', !a);
  UI.allyMode.textContent = a && !a.dead ? (a.mode === 'hold' ? 'HOLD' : 'FOLLOW') : '';
  UI.allyMode.className = 'mode' + (!a || a.dead ? ' off' : (a.mode === 'hold' ? ' hold' : ''));
  UI.droneMode.textContent = (typeof drone !== 'undefined' && drone && !drone.dead) ? (drone.mode === 'hold' ? 'HOVER' : 'FOLLOW') : '';
  UI.droneMode.className = 'mode' + ((typeof drone === 'undefined' || !drone || drone.dead) ? ' off' : (drone.mode === 'hold' ? ' hold' : ''));
  UI.turretNum.textContent = (typeof turrets !== 'undefined' ? turrets.length : 0) + ' / ' + (typeof TURRET_MAX !== 'undefined' ? TURRET_MAX : 3);
  if (!a){ UI.allyLvl.textContent = '—'; UI.allyHpNum.textContent = UI.allyApNum.textContent = '—'; UI.allyHpMax.textContent = ''; UI.allyHpFill.style.transform = UI.allyApFill.style.transform = 'scaleX(0)'; UI.squad.classList.remove('down'); return; }
  UI.allyLvl.textContent = 'LV ' + a.level;
  UI.allyHpNum.textContent = Math.max(0, Math.round(a.hp));
  UI.allyApNum.textContent = Math.max(0, Math.round(a.armor));
  UI.allyHpMax.textContent = '/ ' + Math.round(a.maxHp);
  UI.allyHpFill.style.transform = 'scaleX(' + clamp(a.hp / a.maxHp, 0, 1) + ')';
  UI.allyApFill.style.transform = 'scaleX(' + clamp(a.armor / Math.max(a.maxArmor, 1), 0, 1) + ')';
  UI.squad.classList.toggle('down', !!a.dead);
}

function updateWaveUI(){
  UI.waveNum.textContent = G.wave; UI.waveTotal.textContent = G.waveTotal; UI.killCount.textContent = G.waveKills;
  UI.goldNum.textContent = G.gold; UI.shopGold.textContent = G.gold; UI.shopWave.textContent = G.wave;
  const inter = G.phase === 'inter';
  UI.objLeft.classList.toggle('hide', inter); UI.objClear.classList.toggle('hide', !inter);
}

function addGold(n){
  G.gold += n; UI.goldNum.textContent = G.gold; UI.shopGold.textContent = G.gold;
  UI.goldRow.classList.remove('bump'); void UI.goldRow.offsetWidth; UI.goldRow.classList.add('bump');
}