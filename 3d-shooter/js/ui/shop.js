/* =========================================================================
   shop.js
   波次间商店 UI —— 军火补给 / 升级 / 炮塔列表
   ========================================================================= */
"use strict";

const SHOP = [
  {
    id: 'ammo', name: 'AMMO RESUPPLY', cost: () => 15,
    desc: () => '所有武器备弹回满',
    can: () => WEAPONS.some(w => w.res < w.maxReserve),
    buy: () => {
      for (const w of WEAPONS) w.res = w.maxReserve;
      if (typeof updateAmmoUI === 'function') updateAmmoUI();
    }
  },
  {
    id: 'fullResupply', name: 'FULL RESUPPLY', cost: () => 35,
    desc: () => {
      let line = '所有武器备弹回满';
      if (typeof THROWABLES !== 'undefined' && typeof grenadeState !== 'undefined'){
        const parts = [];
        for (const k in THROWABLES){
          const cap = THROWABLES[k].maxCount || THROWABLES[k].count || 0;
          const cur = grenadeState.invCount[k] || 0;
          parts.push(THROWABLES[k].shortLabel + ' ' + cur + '/' + cap);
        }
        if (parts.length) line += ' · ' + parts.join(' · ');
      }
      return line;
    },
    can: () => {
      if (WEAPONS.some(w => w.res < w.maxReserve)) return true;
      if (typeof THROWABLES !== 'undefined' && typeof grenadeState !== 'undefined'){
        for (const k in THROWABLES){
          const cap = THROWABLES[k].maxCount || THROWABLES[k].count || 0;
          if ((grenadeState.invCount[k] || 0) < cap) return true;
        }
      }
      return false;
    },
    buy: () => {
      for (const w of WEAPONS) w.res = w.maxReserve;
      if (typeof THROWABLES !== 'undefined' && typeof grenadeState !== 'undefined'){
        for (const k in THROWABLES){
          grenadeState.invCount[k] = THROWABLES[k].maxCount || THROWABLES[k].count || 0;
        }
      }
      if (typeof updateAmmoUI === 'function') updateAmmoUI();
    }
  },
  {
    id: 'flash_goggles', name: 'FLASH GOGGLES', cost: () => 350,
    desc: () => '免疫闪光弹致盲（对敌人依然有效）',
    can: () => !player.hasFlashGoggles,
    buy: () => { player.hasFlashGoggles = true; }
  },
  {
    id: 'medkit', name: 'MEDKIT +1', cost: () => 20,
    desc: () => '急救包 +1（上限 ' + MEDKIT_CAP + '）',
    can: () => player.medkits < MEDKIT_CAP,
    buy: () => { player.medkits++; }
  },
  {
    id: 'heal', name: 'FULL RECOVERY', cost: () => 25,
    desc: () => '生命与护甲立刻回满（护甲优先抵挡）',
    can: () => player.hp < player.maxHp - 0.5 || player.armor < player.maxArmor - 0.5,
    buy: () => { player.hp = player.maxHp; player.armor = player.maxArmor; }
  },
  {
    id: 'maxhp', name: 'MAX HEALTH +25',
    cost: () => 65 + 12 * PLR.hpBuys,
    desc: () => '当前 ' + player.maxHp + ' / 上限 ' + MAX_HP_CAP,
    can: () => player.maxHp < MAX_HP_CAP,
    buy: () => {
      PLR.hpBuys++;
      player.maxHp = Math.min(MAX_HP_CAP, player.maxHp + 25);
      player.hp += 25;
    }
  },
  {
    id: 'maxap', name: 'MAX ARMOR +15',
    cost: () => 40 + 16 * PLR.apBuys,
    desc: () => '当前 ' + player.maxArmor + ' / 上限 ' + MAX_AP_CAP + ' · 抵挡伤害但双倍消耗',
    can: () => player.maxArmor < MAX_AP_CAP,
    buy: () => {
      PLR.apBuys++;
      player.maxArmor = Math.min(MAX_AP_CAP, player.maxArmor + 15);
      player.armor += 15;
    }
  },
  {
    id: 'dmg', name: 'DAMAGE +10%',
    cost: () => 115 + 45 * PLR.dmgBuys,
    desc: () => '全武器伤害倍率 ×' + PLR.dmgMult.toFixed(2) +
                ' → ×' + (PLR.dmgMult + 0.10).toFixed(2),
    can: () => true,
    buy: () => { PLR.dmgBuys++; PLR.dmgMult = +(PLR.dmgMult + 0.10).toFixed(2); }
  },
  {
    id: 'revive', name: 'REVIVE COIN',
    cost: () => 100 + 50 * player.revives,
    desc: () => '阵亡时自动消耗，原地半血半甲复活（持有 ' + player.revives +
                ' / ' + REVIVE_CAP + '）',
    can: () => player.revives < REVIVE_CAP,
    buy: () => { player.revives++; }
  },
  {
    id: 'drone',
    name: () => !(typeof drone !== 'undefined' && drone)
                ? 'MED DRONE'
                : (drone.dead ? 'REPAIR DRONE' : 'DRONE ACTIVE'),
    cost: () => (typeof drone === 'undefined' || !drone) ? 600 : (drone.dead ? 200 : 0),
    desc: () => {
      if (typeof drone === 'undefined' || !drone)
        return '治疗无人机 · 每 3 秒为你和友军各恢复 ' + DRONE.heal +
               ' 生命 + ' + DRONE.plate + ' 护甲 · 会被敌人击毁';
      if (drone.dead)
        return '无人机已被击毁 · 修复后回到空中（' + DRONE.hp + 'HP）';
      return '无人机 ' + Math.round(drone.hp) + ' / ' + DRONE.hp +
             ' HP · 护甲敌人优先攻击它';
    },
    can: () => (typeof drone === 'undefined' || !drone) || drone.dead,
    buy: () => {
      if (typeof drone === 'undefined' || !drone) spawnDrone();
      else restoreDrone();
    }
  },
  {
    id: 'turretAuto', name: () => 'BUILD AUTO TURRET',
    cost: () => TURRETS.auto.cost,
    desc: () => '连射炮塔 · ' + TURRETS.auto.hp + '耐久 · ' +
                TURRETS.auto.range + 'm · ' +
                TURRETS.auto.dmg[0] + '-' + TURRETS.auto.dmg[1] + ' 伤害 · 已建 ' +
                turrets.length + '/' + TURRET_MAX +
                ' · 休整阶段放置，被击毁后消失',
    can: () => G.phase === 'inter' && turrets.length < TURRET_MAX,
    buy: () => { startPlacing('auto'); }
  },
  {
    id: 'turretHeavy', name: () => 'BUILD HEAVY TURRET',
    cost: () => TURRETS.heavy.cost,
    desc: () => '单发炮塔 · ' + TURRETS.heavy.hp + '耐久 · ' +
                TURRETS.heavy.range + 'm · ' +
                TURRETS.heavy.dmg[0] + '-' + TURRETS.heavy.dmg[1] + ' 伤害 · 已建 ' +
                turrets.length + '/' + TURRET_MAX,
    can: () => G.phase === 'inter' && turrets.length < TURRET_MAX,
    buy: () => { startPlacing('heavy'); }
  },
  {
    id: 'turretRepair',
    name: () => 'REPAIR TURRETS',
    cost: () => totalRepairCost(),
    desc: () => anyTurretDamaged()
      ? '把受损炮塔修满 · 当前 ' + turrets.filter(t => t.hp < t.maxHp - 0.5).length + ' 座受损'
      : '所有炮塔都是满耐久',
    can: () => G.phase === 'inter' && anyTurretDamaged(),
    buy: () => { repairAllTurrets(); }
  },
  {
    id: 'ally',
    name: () => !(typeof ally !== 'undefined' && ally)
                ? 'DEPLOY ALLY'
                : (ally.level < 3 ? 'ALLY → LV' + (ally.level + 1) : 'ALLY · MAXED'),
    cost: () => !(typeof ally !== 'undefined' && ally)
                ? ALLY_COST[0]
                : (ally.level < 3 ? ALLY_COST[ally.level] : 0),
    desc: () => {
      if (typeof ally === 'undefined' || !ally)
        return '派一名友军随你作战 · LV1 ' + ALLY_TIERS[0].title + ' ' +
               ALLY_TIERS[0].hp + 'HP / ' + ALLY_TIERS[0].ap + 'AP';
      if (ally.level >= 3)
        return 'LV3 ' + ALLY_TIERS[2].title + ' · ' +
               ALLY_TIERS[2].hp + 'HP / ' + ALLY_TIERS[2].ap + 'AP（已满级）';
      const t = ALLY_TIERS[ally.level];
      return '升级为 LV' + (ally.level + 1) + ' ' + t.title + ' · ' +
             t.hp + 'HP / ' + t.ap + 'AP';
    },
    can: () => (typeof ally === 'undefined' || !ally) || ally.level < 3,
    buy: () => {
      const lvl = (typeof ally !== 'undefined' && ally) ? ally.level + 1 : 1;
      spawnAlly(lvl);
    }
  }
];

/* ★ 重建商店列表：整行不再可点，右侧单独加"购买"按钮，避免移动端滑动误触 */
function renderShop(){
  UI.shopItems.innerHTML = '';
  for (const it of SHOP){
    const c = it.cost();
    const usable = it.can();
    const affordable = usable && G.gold >= c;
    const el = document.createElement('div');
    el.className = 'item' + (affordable ? '' : ' no');

    const nm = typeof it.name === 'function' ? it.name() : it.name;

    /* 左：名字 + 说明 */
    const info = document.createElement('div');
    info.className = 'info';
    info.innerHTML = '<div class="nmz">' + nm + '</div>' +
                     '<div class="dsz">' + it.desc() + '</div>';

    /* 右：价格 + 购买按钮 */
    const right = document.createElement('div');
    right.className = 'right';

    const cost = document.createElement('div');
    cost.className = 'cost';
    cost.innerHTML = usable ? '&#9678; ' + c : 'MAX';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'buyBtn';
    btn.textContent = !usable ? '已满' : (affordable ? '购买' : '金币不足');
    if (!affordable) btn.disabled = true;

    /* ★ 只监听 click —— 移动端滑动松手不会触发 click，避免误买 */
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!affordable) return;
      tryBuy(it);
    });

    right.appendChild(cost);
    right.appendChild(btn);

    el.appendChild(info);
    el.appendChild(right);
    UI.shopItems.appendChild(el);
  }
  renderTurretList();
}

function renderTurretList(){
  if (!UI.turretList) return;
  UI.turretList.innerHTML = '';
  UI.turretCount.textContent = turrets.length + ' / ' + TURRET_MAX;
  UI.shopTurrets.classList.toggle('hide', turrets.length === 0);

  turrets.forEach((t, i) => {
    const row = document.createElement('div');
    row.className = 'tr';
    const pct = Math.round(t.hp / t.maxHp * 100);
    row.innerHTML = '<div><div class="tn">' + t.def.title + '</div>' +
                    '<div class="thp' + (pct < 50 ? ' low' : '') + '">' +
                    Math.round(t.hp) + ' / ' + t.maxHp + ' (' + pct + '%)</div></div>';

    const b = document.createElement('button');
b.type = 'button';
b.className = 'buyBtn salvage';
b.textContent = 'SALVAGE +' + Math.round(t.def.cost * 0.5);
const doIt = () => {
  cancelPlacing();
  salvageTurret(t);
};
/* ★ 只 click，不再 touchend —— 避免滚动误触 */
b.addEventListener('click', doIt);
row.appendChild(b);
    UI.turretList.appendChild(row);
  });
}

const _lastBuy = { id: null, at: -1e9 };
function tryBuy(it){
  if (it.id === _lastBuy.id && perfNow - _lastBuy.at < 320) return;
  _lastBuy.id = it.id;
  _lastBuy.at = perfNow;
  buyItem(it);
}

function buyItem(it){
  const c = it.cost();
  if (!it.can() || G.gold < c){ SFX.dryFire(); return; }

  if (it.id === 'turretAuto' || it.id === 'turretHeavy'){
    closeShop(true);
    startPlacing(it.id === 'turretAuto' ? 'auto' : 'heavy');
    return;
  }

  G.gold -= c;
  it.buy();
  SFX.magIn();
  SFX.killChime();

  if (typeof updateVitalsUI === 'function') updateVitalsUI();
  if (typeof updateAmmoUI   === 'function') updateAmmoUI();
  if (typeof updateWaveUI   === 'function') updateWaveUI();
  if (typeof updateSquadUI  === 'function') updateSquadUI();
  renderShop();
}

function openShop(){
  if (G.phase !== 'inter' || G.over || G.shopOpen) return;
  cancelPlacing();
  G.shopOpen = true;
  UI.shop.classList.remove('hide');
  if (UI.btnShop) UI.btnShop.classList.remove('on');
  renderShop();

  const panel = UI.shop.querySelector('.shopbox');
  if (panel) panel.scrollTop = 0;

  if (document.pointerLockElement) document.exitPointerLock();
  document.body.style.overflow = 'hidden';
}

function closeShop(gesture){
  if (!G.shopOpen) return;
  G.shopOpen = false;
  UI.shop.classList.add('hide');
  document.body.style.overflow = '';
  if (UI.btnShop)
    UI.btnShop.classList.toggle('on', G.phase === 'inter' && !G.over);

  if (typeof IS_TOUCH !== 'undefined' && !IS_TOUCH && G.started && !G.over){
    G.needLock = true;
    if (gesture) requestLock();
  }
}

function deployNow(){
  if (G.phase !== 'inter' || G.over) return;
  doDeployNow();
}

function doDeployNow(){
  if (G.phase !== 'inter' || G.over) return;
  const bonus = Math.floor(Math.max(0, G.interT)) * SKIP_GOLD_PER_SEC;
  if (bonus > 0){
    G.gold += bonus;
    if (typeof updateWaveUI === 'function') updateWaveUI();
    if (typeof pushComms === 'function')
      pushComms('COMMAND', 'EARLY DEPLOY — +' + bonus + ' CREDITS');
  }
  closeShop(true);
  startWave(G.wave + 1);
}

window.openShop  = openShop;
window.closeShop = closeShop;