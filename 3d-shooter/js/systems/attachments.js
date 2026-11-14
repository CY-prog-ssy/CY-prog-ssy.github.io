/* =========================================================================
   attachments.js
   ========================================================================= */
"use strict";

const ATTACHMENTS = {
  // --- 步枪配件 ---
  suppressor_rifle: {
    id: 'suppressor_rifle', slot: 'muzzle', name: '战术消音器', desc: '大幅降低枪声传播与后坐力', price: 60,
    weapons: ['rifle'], isSuppressor: true,
    stats: { noise: -20, recoilKick: 0.8, recoilRot: 0.85 },
    buildModel: () => {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.8, transparent: false });
      part(g, CYLZ(0.024, 0.024, 0.18, 12), mat, 0, 0, -0.09);
      part(g, CYLZ(0.026, 0.026, 0.03, 12), mat, 0, 0, -0.015);
      return g;
    }
  },
  ext_mag_rifle: {
    id: 'ext_mag_rifle', slot: 'mag', name: '加长快拔弹匣', desc: '弹匣容量 +10，换弹略微变慢', price: 45,
    weapons: ['rifle'],
    stats: { magSize: 10, reloadTime: 0.2 },
    buildModel: () => {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x3b3a30, roughness: 0.8, transparent: false });
      part(g, B(0.048, 0.20, 0.082), mat, 0, -0.05, 0);
      part(g, B(0.052, 0.014, 0.086), mat, 0, -0.14, 0);
      return g;
    }
  },
  foregrip: {
    id: 'foregrip', slot: 'under', name: '战术垂直握把', desc: '大幅降低水平与垂直后坐力', price: 40,
    weapons: ['rifle', 'shotgun', 'sniper'],
    stats: { recoilKick: 0.75, recoilRot: 0.75 },
    buildModel: () => {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.9, transparent: false });
      part(g, B(0.03, 0.10, 0.04), mat, 0, -0.05, 0);
      part(g, CYL(0.02, 0.02, 0.11, 8), mat, 0, -0.05, 0);
      return g;
    }
  },

  // --- 狙击枪配件 ---
  suppressor_sniper: {
    id: 'suppressor_sniper', slot: 'muzzle', name: '重型消音器', desc: '狙击枪专用，消除开火火光与巨响', price: 70,
    weapons: ['sniper'], isSuppressor: true,
    stats: { noise: -40, recoilKick: 0.7, recoilRot: 0.8 },
    buildModel: () => {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.7, transparent: false });
      part(g, CYLZ(0.030, 0.030, 0.25, 12), mat, 0, 0, -0.125);
      part(g, CYLZ(0.032, 0.032, 0.04, 12), mat, 0, 0, -0.02);
      return g;
    }
  },

  // --- 巴雷特专属配件 ---
  ext_mag_barrett: {
    id: 'ext_mag_barrett', slot: 'mag', name: '加长重型弹匣', desc: '装弹量 +2，换弹极慢', price: 150,
    weapons: ['barrett'],
    stats: { magSize: 2, reloadTime: 1.5 },
    buildModel: () => {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.9 });
      part(g, B(0.09, 0.3, 0.18), mat, 0, -0.15, 0);
      part(g, B(0.095, 0.02, 0.185), mat, 0, -0.29, 0);
      return g;
    }
  },
  heavy_muzzle_barrett: {
    id: 'heavy_muzzle_barrett', slot: 'muzzle', name: '战术三角制退器', desc: '减少 20% 垂直后坐力，略微增加隐蔽性', price: 300,
    weapons: ['barrett'],
    stats: { recoilKick: 0.8, noise: -10 },
    buildModel: () => {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.3, metalness: 0.95 });
      const glow = new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff2a1a, emissiveIntensity: 1.5, metalness: 0.8 });
      
      part(g, CYLZ(0.07, 0.07, 0.35, 3), mat, 0, 0, 0); 
      part(g, CYLZ(0.08, 0.03, 0.08, 3), mat, 0, 0, -0.20); 
      part(g, CYLZ(0.05, 0.05, 0.37, 12), glow, 0, 0, 0); 
      return g;
    }
  },
  super_bmg_mag: {
    id: 'super_bmg_mag', slot: 'mag', name: '究极穿甲弹鼓', desc: '装弹量 +4，换弹极慢，专为灭杀一切准备', price: 800,
    weapons: ['barrett'],
    stats: { magSize: 4, reloadTime: 2.0 },
    buildModel: () => {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x2a2200, metalness: 0.95, roughness: 0.25 });
      const glow = new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffaa00, emissiveIntensity: 1.8 });
      
      part(g, B(0.12, 0.35, 0.20), mat, 0, -0.15, 0);
      part(g, B(0.125, 0.02, 0.21), mat, 0, -0.32, 0);
      part(g, B(0.01, 0.28, 0.15), glow, 0.06, -0.15, 0);
      part(g, B(0.01, 0.28, 0.15), glow, -0.06, -0.15, 0);
      return g;
    }
  },
  super_bmg_muzzle: {
    id: 'super_bmg_muzzle', slot: 'muzzle', name: '究极黄金三角制退器', desc: '穿甲效果拉满，伤害极致', price: 1200,
    weapons: ['barrett'],
    stats: { recoilKick: 0.9, recoilRot: 0.9, noise: 5 },
    buildModel: () => {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.98, roughness: 0.12 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x553300, metalness: 0.9, roughness: 0.4 });
      
      part(g, CYLZ(0.08, 0.08, 0.38, 5), mat, 0, 0, 0); 
      part(g, CYLZ(0.09, 0.03, 0.10, 5), dark, 0, 0, -0.22); 
      part(g, CYLZ(0.06, 0.06, 0.40, 12), dark, 0, 0, 0); 
      return g;
    }
  },

  // --- 霰弹枪配件 ---
  drum_mag_shotgun: {
    id: 'drum_mag_shotgun', slot: 'mag', name: '大容量弹鼓', desc: '装弹量 +4，换弹明显变慢', price: 50,
    weapons: ['shotgun'],
    stats: { magSize: 4, reloadTime: 0.5 },
    buildModel: () => {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7, transparent: false });
      part(g, CYLZ(0.06, 0.06, 0.06, 16), mat, 0, -0.05, 0, PI/2, 0, 0);
      return g;
    }
  }
};

const AMMO_TYPES = {
  normal: { 
    id: 'normal', name: '标准弹药', desc: '常规全金属被甲弹，无特殊穿透效果', price: 0, color: '#e8eef3', 
    weapons: ['rifle', 'shotgun', 'sniper', 'pistol', 'barrett'] 
  },
  magnum: { 
    id: 'magnum', name: '.700马格南', desc: '狙击枪/巴雷特共用。伤害+15%，可穿1箱3人。', price: 450, color: '#c98cff', 
    weapons: ['sniper', 'barrett']
  },
  bmg50: { 
    id: 'bmg50', name: '.50 BMG', desc: '巴雷特专属，伤害翻倍！可穿3箱6人。', price: 1500, color: '#ff3b30', 
    weapons: ['barrett']
  },
  super_ap: { 
    id: 'super_ap', name: '究极穿甲弹', desc: '巴雷特专属，伤害拉满！穿透一切物体6层！', price: 3500, color: '#ffd700', 
    weapons: ['barrett']
  }
};

let ownedAttachments = [];
let ownedAmmo = ['normal'];
let equippedAttachments = {};
let equippedAmmo = { 
  rifle: 'normal', 
  shotgun: 'normal', 
  sniper: 'normal', 
  pistol: 'normal', 
  barrett: 'normal' 
};

function updateEquippedAmmo(wId, ammoId) {
  const ammo = AMMO_TYPES[ammoId];
  if (!ammo) return;
  
  if (ammo.weapons.includes(wId)) {
    equippedAmmo[wId] = ammoId;
  }
  
  if (ammoId === 'magnum') {
    if (wId === 'sniper') equippedAmmo['barrett'] = 'magnum';
    if (wId === 'barrett') equippedAmmo['sniper'] = 'magnum';
  }
}

if (!WEAPONS[0]._baseStats) {
  WEAPONS.forEach(w => {
    w._baseStats = {
      magSize: w.magSize, reloadTime: w.reloadTime,
      recoilKick: w.recoilKick, recoilRot: w.recoilRot, 
      camPitch: w.camPitch, camYaw: w.camYaw, shakeAmt: w.shakeAmt,
      boltTime: w.boltTime, noise: w.noise
    };
  });
}

function applyAllAttachments() {
  WEAPONS.forEach(w => {
    Object.assign(w, w._baseStats);
    w.suppressed = false;
    w.ammoType = equippedAmmo[w.id] || 'normal';
    
    const eq = equippedAttachments[w.id] || {};
    for (const slot in eq) {
      const attId = eq[slot];
      const att = ATTACHMENTS[attId];
      if (!att) continue;
      if (att.isSuppressor) w.suppressed = true;
      for (const stat in att.stats) {
        if (stat === 'magSize' || stat === 'reloadTime') {
          w[stat] += att.stats[stat];
        } else {
          w[stat] *= att.stats[stat];
        }
      }
    }

    if (w.ammoType === 'magnum') {
      w.recoilKick *= 1.8; w.recoilRot *= 1.8; w.camPitch *= 2.0; w.reloadTime += 0.2;
      if (w.id === 'sniper' || w.id === 'barrett') w.boltTime += 0.1;
    } else if (w.ammoType === 'bmg50') {
      w.recoilKick *= 2.5; w.recoilRot *= 2.5; w.camPitch *= 3.0; w.shakeAmt *= 1.5; w.reloadTime += 0.5;
      if (w.id === 'barrett') w.boltTime += 0.3;
    } else if (w.ammoType === 'super_ap') {
      w.recoilKick *= 3.5; w.recoilRot *= 3.5; w.camPitch *= 4.0; w.shakeAmt *= 2.0; w.reloadTime += 1.0;
      if (w.id === 'barrett') w.boltTime += 0.6;
    }

    if (w.mag > w.magSize) w.mag = w.magSize;
  });
  
  if (typeof updateAmmoUI === 'function') updateAmmoUI();
}

function updateWeaponModels() {
  WEAPONS.forEach(w => {
    const vm = w.vm;
    if (!vm) return;
    
    if (vm.attachmentsGroup) vm.group.remove(vm.attachmentsGroup);
    vm.attachmentsGroup = new THREE.Group();
    vm.group.add(vm.attachmentsGroup);
    
    const eq = equippedAttachments[w.id] || {};
    for (const slot in eq) {
      const att = ATTACHMENTS[eq[slot]];
      if (!att || !att.buildModel) continue;
      
      const model = att.buildModel();
      if (slot === 'muzzle') {
        model.position.set(0, 0, 0);
        if (w.id === 'rifle') model.position.set(0, 0.006, -0.71);
        if (w.id === 'sniper') model.position.set(0, 0.004, -1.36);
        if (w.id === 'barrett') model.position.set(0, 0.005, -1.95); // 适配新版枪口位置
        vm.attachmentsGroup.add(model);
      } 
      else if (slot === 'mag') {
        if (w.id === 'rifle') model.position.set(0, -0.135, -0.045);
        if (w.id === 'shotgun') model.position.set(0, -0.12, 0.05);
        if (w.id === 'barrett') model.position.set(0, -0.12, -0.20); // 适配新版弹匣井
        vm.attachmentsGroup.add(model);
      }
      else if (slot === 'under') {
        if (w.id === 'rifle') model.position.set(0, -0.06, -0.30);
        if (w.id === 'shotgun') model.position.set(0, -0.07, -0.34);
        if (w.id === 'sniper') model.position.set(0, -0.06, -0.58);
        vm.attachmentsGroup.add(model);
      }
    }
  });
}

function toggleAttachment(attId, wId) {
  const att = ATTACHMENTS[attId];
  if (!att || !wId || !att.weapons.includes(wId)) return;
  if (!equippedAttachments[wId]) equippedAttachments[wId] = {};
  
  if (equippedAttachments[wId][att.slot] === attId) delete equippedAttachments[wId][att.slot];
  else equippedAttachments[wId][att.slot] = attId;
  
  applyAllAttachments();
  updateWeaponModels();
  renderAttachShop();
}

function buyAttachment(attId, wId) {
  const att = ATTACHMENTS[attId];
  if (!att || ownedAttachments.includes(attId)) return;
  if (G.gold >= att.price) {
    G.gold -= att.price;
    ownedAttachments.push(attId);
    if (!equippedAttachments[wId]) equippedAttachments[wId] = {};
    equippedAttachments[wId][att.slot] = attId;
    applyAllAttachments();
    updateWeaponModels();
    if (typeof SFX !== 'undefined' && SFX.magIn) SFX.magIn();
    if (typeof updateWaveUI === 'function') updateWaveUI();
    const goldEl = document.getElementById('attachShopGold');
    if (goldEl) goldEl.textContent = G.gold;
    renderAttachShop();
  } else {
    if (typeof SFX !== 'undefined' && SFX.dryFire) SFX.dryFire();
  }
}

function equipAmmo(wId, ammoId) {
  if (!ownedAmmo.includes(ammoId)) return;
  const ammo = AMMO_TYPES[ammoId];
  if (ammo && ammo.weapons && !ammo.weapons.includes(wId)) return;
  
  updateEquippedAmmo(wId, ammoId);
  applyAllAttachments();
  renderAttachShop();
}

function buyAmmo(ammoId, wId) {
  const ammo = AMMO_TYPES[ammoId];
  if (!ammo || ownedAmmo.includes(ammoId)) return;
  if (ammo.weapons && !ammo.weapons.includes(wId)) return;
  
  if (G.gold >= ammo.price) {
    G.gold -= ammo.price;
    ownedAmmo.push(ammoId);
    updateEquippedAmmo(wId, ammoId);
    applyAllAttachments();
    if (typeof SFX !== 'undefined' && SFX.magIn) SFX.magIn();
    if (typeof updateWaveUI === 'function') updateWaveUI();
    const goldEl = document.getElementById('attachShopGold');
    if (goldEl) goldEl.textContent = G.gold;
    renderAttachShop();
  } else {
    if (typeof SFX !== 'undefined' && SFX.dryFire) SFX.dryFire();
  }
}

function renderAttachShop() {
  const listAttach = document.getElementById('attachShopList');
  const listAmmo = document.getElementById('ammoShopList');
  if (!listAttach || !listAmmo) return;
  listAttach.innerHTML = '';
  listAmmo.innerHTML = '';
  
  const currentTab = document.getElementById('attachShop').dataset.wid || 'rifle';
  
  for (const id in ATTACHMENTS) {
    const att = ATTACHMENTS[id];
    if (!att.weapons.includes(currentTab)) continue;
    
    const isOwned = ownedAttachments.includes(id);
    const isEquipped = (equippedAttachments[currentTab] || {})[att.slot] === id;
    
    const item = document.createElement('div');
    item.className = 'item' + (!isOwned && G.gold < att.price ? ' no' : '');
    const btnText = !isOwned ? '购买 (' + att.price + ')' : (isEquipped ? '卸下' : '装备');
    const btnClass = !isOwned ? 'buyBtn' : 'buyBtn ' + (isEquipped ? 'salvage' : 'equip');
    
    item.innerHTML = 
      '<div class="info">' +
        '<div class="nmz">' + att.name + '</div>' +
        '<div class="dsz">' + att.desc + '</div>' +
      '</div>' +
      '<div class="right">' +
        (!isOwned ? '<div class="cost">◎ ' + att.price + '</div>' : '') +
        '<button class="' + btnClass + '" data-id="' + id + '">' + btnText + '</button>' +
      '</div>';
    listAttach.appendChild(item);
  }

  for (const id in AMMO_TYPES) {
    const ammo = AMMO_TYPES[id];
    if (ammo.weapons && !ammo.weapons.includes(currentTab)) continue;
    
    const isOwned = ownedAmmo.includes(id);
    const isEquipped = equippedAmmo[currentTab] === id;
    
    const item = document.createElement('div');
    item.className = 'item' + (!isOwned && G.gold < ammo.price ? ' no' : '');
    
    const btnText = !isOwned ? '购买 (' + ammo.price + ')' : (isEquipped ? '已装备' : '装备');
    const btnClass = !isOwned ? 'buyBtn' : 'buyBtn ' + (isEquipped ? 'salvage' : 'equip');
    
    item.innerHTML = 
      '<div class="info">' +
        '<div class="nmz" style="color: ' + ammo.color + '">' + ammo.name + '</div>' +
        '<div class="dsz">' + ammo.desc + '</div>' +
      '</div>' +
      '<div class="right">' +
        (!isOwned ? '<div class="cost">◎ ' + ammo.price + '</div>' : '') +
        '<button class="' + btnClass + '" data-ammo="' + id + '" ' + (isEquipped ? 'disabled' : '') + '>' + btnText + '</button>' +
      '</div>';
    listAmmo.appendChild(item);
  }

  listAttach.querySelectorAll('.buyBtn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (ownedAttachments.includes(id)) toggleAttachment(id, currentTab);
      else buyAttachment(id, currentTab);
    };
  });
  
  listAmmo.querySelectorAll('.buyBtn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.dataset.ammo;
      if (ownedAmmo.includes(id)) equipAmmo(currentTab, id);
      else buyAmmo(id, currentTab);
    };
  });
}

function openAttachShop() {
  if (G.over) return;
  if (typeof pauseGameTouch === 'function') pauseGameTouch();
  
  const el = document.getElementById('attachShop');
  if (!el) return;

  const oldBtn = document.getElementById('attachShopClose');
  if (oldBtn) {
    const newBtn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(newBtn, oldBtn);
    const closeFn = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (typeof closeAttachShop === 'function') closeAttachShop();
    };
    newBtn.addEventListener('click', closeFn);
    newBtn.addEventListener('touchstart', closeFn, { passive: false });
  }
  
  const currentWep = (typeof player !== 'undefined' && WEAPONS[player.weapon]) ? WEAPONS[player.weapon].id : 'rifle';
  el.dataset.wid = currentWep;
  
  document.querySelectorAll('.subTab').forEach(t => {
    const isAttach = t.dataset.tab === 'attach';
    t.classList.toggle('on', isAttach);
    t.style.color = isAttach ? '#fff' : 'rgba(255,255,255,.4)';
    t.style.borderBottom = isAttach ? '2px solid #ffb340' : 'none';
  });
  document.getElementById('attachShopList').style.display = 'flex';
  document.getElementById('ammoShopList').style.display = 'none';

  el.querySelectorAll('.attachTab').forEach(t => {
    const isOn = (t.dataset.wid === currentWep);
    t.classList.toggle('on', isOn);
    t.style.color = isOn ? '#ffb340' : 'rgba(223,230,236,.5)';
    t.style.borderColor = isOn ? 'rgba(255,179,64,.45)' : 'transparent';
    t.style.background = isOn ? 'rgba(255,179,64,.12)' : 'transparent';
  });
  
  const goldEl = document.getElementById('attachShopGold');
  if (goldEl) goldEl.textContent = G.gold;
  
  renderAttachShop();
  
  el.classList.remove('hide');
  el.style.display = 'flex';
}

function closeAttachShop() {
  const el = document.getElementById('attachShop');
  if (el) {
    el.classList.add('hide');
    el.style.display = 'none';
  }
  
  try {
    if (!G.over) {
      G.paused = false;
      G.running = true;
      const pauseEl = document.getElementById('pause');
      if (pauseEl) pauseEl.classList.remove('on');
      if (typeof IS_TOUCH !== 'undefined' && !IS_TOUCH && typeof requestLock === 'function') {
        requestLock();
      }
    }
  } catch(e) {
    console.warn("Close error:", e);
  }
}

window.closeAttachShop = closeAttachShop;

setTimeout(() => {
  applyAllAttachments();
  updateWeaponModels();
}, 1000);