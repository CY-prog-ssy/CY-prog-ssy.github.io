/* =========================================================================
   weapon_shop.js — 军火库 / 武器购买
   纯内存状态，不进行本地持久化，每次重开自动重置为只有初始武器
   ========================================================================= */
"use strict";

const WEAPON_SHOP_DATA = {
  rifle: { id: 'rifle', name: 'M4 CARBINE', price: 0, desc: '初始武器，均衡可靠。' },
  shotgun: { id: 'shotgun', name: 'KS-12 PUMP', price: 800, desc: '近战大杀器，一枪一个。' },
  pistol: { id: 'pistol', name: 'P-9 SIDEARM', price: 300, desc: '轻巧备用武器。' },
  sniper: { id: 'sniper', name: 'SR-7 LONGBOW', price: 1500, desc: '高倍率狙击枪。' },
  barrett: { id: 'barrett', name: '.50 CAL BARRETT', price: 5000, desc: '反器材狙击步枪。极贵，威力巨大，限制极高。' }
};

// ✅ 纯内存状态：初始只有 M4，不写入 localStorage
let unlockedWeapons = ['rifle'];

function renderWeaponShop() {
  const list = document.getElementById('weaponShopList');
  if (!list) return;
  list.innerHTML = '';
  document.getElementById('weaponShopGold').textContent = G.gold;

  // 强制覆盖原本的内联样式，改为自适应网格布局，整齐排列
  list.style.display = 'grid';
  list.style.gridTemplateColumns = 'repeat(auto-fill, minmax(240px, 1fr))';
  list.style.gap = '16px';
  list.style.padding = '20px';
  list.style.alignContent = 'start';
  list.style.justifyContent = 'center';

  for (const id in WEAPON_SHOP_DATA) {
    const w = WEAPON_SHOP_DATA[id];
    const isOwned = unlockedWeapons.includes(id);
    
    const item = document.createElement('div');
    // 卡片使用 flex 纵排，保证高度撑满，按钮永远在底部对齐
    item.style.cssText = 'display: flex; flex-direction: column; padding: 18px; background: rgba(12,16,20,.85); border: 1px solid rgba(223,230,236,.14); border-radius: 8px; gap: 12px; transition: border-color 0.2s, transform 0.2s;';
    
    // 武器名称
    const nameHTML = `<div style="font-size: 15px; font-weight: 800; letter-spacing: 1px; color: #ffb340; text-shadow: 0 2px 4px #000;">${w.name}</div>`;
    // 武器描述（设最小高度，防止长短不一导致按钮错位）
    const descHTML = `<div style="font-size: 11px; color: rgba(223,230,236,.6); line-height: 1.5; flex: 1; min-height: 48px;">${w.desc}</div>`;
    
    // 底部价格与购买按钮（使用 flex 撑满宽度）
    const bottomHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto; gap: 10px;">
        <div style="font-family: ui-monospace, monospace; font-size: 18px; font-weight: bold; color: #ffd98a; text-shadow: 0 1px 3px #000;">
          ${isOwned ? '' : '◎ ' + w.price}
        </div>
        <button class="buyBtn ${isOwned?'salvage':'equip'}" data-id="${id}" ${isOwned?'disabled':''} style="flex: 1; padding: 10px; font-size: 12px; letter-spacing: 2px; border-radius: 4px; border: 1px solid ${isOwned ? 'rgba(126,224,129,.5)' : 'rgba(0,208,255,.5)'}; background: ${isOwned ? 'rgba(126,224,129,.15)' : 'rgba(0,208,255,.15)'}; color: ${isOwned ? '#a8f5ff' : '#fff'}; transition: all 0.2s;">
          ${isOwned ? '已解锁' : '购 买'}
        </button>
      </div>
    `;

    item.innerHTML = nameHTML + descHTML + bottomHTML;
    
    // 添加悬停高亮效果
    item.onmouseenter = () => { item.style.borderColor = 'rgba(255,179,64,0.5)'; item.style.transform = 'translateY(-2px)'; };
    item.onmouseleave = () => { item.style.borderColor = 'rgba(223,230,236,.14)'; item.style.transform = 'none'; };

    list.appendChild(item);
  }

  // 绑定购买事件
  list.querySelectorAll('.buyBtn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (unlockedWeapons.includes(id)) return;
      const w = WEAPON_SHOP_DATA[id];
      
      if (G.gold >= w.price) {
        G.gold -= w.price;
        unlockedWeapons.push(id);
        if (typeof SFX !== 'undefined') SFX.magIn();
        if (typeof updateWaveUI === 'function') updateWaveUI();
        renderWeaponShop(); // 重新渲染刷新状态
        if (typeof updateWeaponSlotsUI === 'function') updateWeaponSlotsUI(); // 刷新 HUD 武器槽
      } else {
        if (typeof SFX !== 'undefined') SFX.dryFire();
        // 金币不足的点击反馈
        btn.style.transform = 'translateX(-3px)';
        setTimeout(()=>btn.style.transform = 'translateX(3px)', 50);
        setTimeout(()=>btn.style.transform = 'none', 100);
      }
    };
  });
}

function openWeaponShop() {
  if (G.over) return;
  if (typeof pauseGameTouch === 'function') pauseGameTouch();
  const el = document.getElementById('weaponShop');
  if (!el) return;
  
  const oldBtn = document.getElementById('weaponShopClose');
  if (oldBtn) {
    const newBtn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(newBtn, oldBtn);
    const closeFn = (e) => { if(e){e.preventDefault();e.stopPropagation();} closeWeaponShop(); };
    newBtn.addEventListener('click', closeFn);
    newBtn.addEventListener('touchstart', closeFn, { passive: false });
  }
  
  renderWeaponShop();
  el.classList.remove('hide');
  el.style.display = 'flex';
}

function closeWeaponShop() {
  const el = document.getElementById('weaponShop');
  if (el) { el.classList.add('hide'); el.style.display = 'none'; }
  if (!G.over) {
    G.paused = false; G.running = true;
    const pauseEl = document.getElementById('pause');
    if (pauseEl) pauseEl.classList.remove('on');
    if (typeof IS_TOUCH !== 'undefined' && !IS_TOUCH && typeof requestLock === 'function') requestLock();
  }
}

window.closeWeaponShop = closeWeaponShop;

// 动态更新 HUD 上的武器槽显示
function updateWeaponSlotsUI() {
  const slotsContainer = document.getElementById('slots');
  if (!slotsContainer) return;
  slotsContainer.innerHTML = '';
  
  let slotIndex = 0;
  for (let i = 0; i < WEAPONS.length; i++) {
    const w = WEAPONS[i];
    if (unlockedWeapons.includes(w.id)) {
      const div = document.createElement('div');
      div.className = 'slot' + (player.weapon === i ? ' act' : '');
      div.setAttribute('data-slot', i);
      div.setAttribute('data-ui', '1');
      div.innerHTML = `<b>${slotIndex+1}</b><span>${w.name}</span>`;
      
      div.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (G.running && !G.shopOpen && !G.paused) switchWeapon(i);
      }, { passive: false });
      div.addEventListener('click', () => {
        if (G.running && !G.shopOpen && !G.paused) switchWeapon(i);
      });
      
      slotsContainer.appendChild(div);
      slotIndex++;
    }
  }
}