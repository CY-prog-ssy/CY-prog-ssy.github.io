/* =========================================================================
   damage.js
   伤害结算 / 护甲规则 / 治疗 / 护甲自动恢复 / 无敌
   ========================================================================= */
"use strict";

function panOf(fromPos){
  if (!fromPos) return 0;
  const dx = fromPos.x - player.pos.x;
  const dz = fromPos.z - player.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  const side = dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw);
  return clamp(side / d, -1, 1);
}

function shieldBreak(fromPos){
  SFX.shieldBreak(panOf(fromPos));
  G.shieldFlash = 1;
  player.shake = Math.min(1.6, player.shake + 0.34);
  if (typeof pushComms === 'function') pushComms('ARMOR', 'PLATE DEPLETED — SHIELD DOWN');
}

function applyDamageTo(p, amount, fromPos, pierce){
  if (!p || p.dead || G.over) return;
  if (p.invulnT > 0) return;

  /* ★ 无敌：只对玩家生效 */
  if (p === player && SET.godMode){
    if (typeof updateVitalsUI === 'function') updateVitalsUI();
    return;
  }

  const local = (p === player);
  const pf = clamp(pierce || 0, 0, 1);

  if (pf > 0){
    const through = amount * pf;
    amount -= through;
    p.hp -= through;
    if (local && typeof updateVitalsUI === 'function') updateVitalsUI();
    if (!amount){
      if (p.hp <= 0){ p.hp = 0; onPlayerDown(p, fromPos); }
      return;
    }
  }

  p.armorRegenT = ARMOR_REGEN_DELAY;
  if (local) cancelHeal();

  let dmg = amount;

  if (p.armor > 0 && dmg > 0){
    const cost = dmg * ARMOR_DRAIN;
    if (p.armor >= cost){
      p.armor -= cost;
      dmg = 0;
      if (p.armor <= 0.001){
        p.armor = 0;
        if (local) shieldBreak(fromPos);
      }
    } else {
      dmg -= p.armor / ARMOR_DRAIN;
      p.armor = 0;
      if (local) shieldBreak(fromPos);
    }
  }

  p.hp -= dmg;

  if (local){
    if (dmg > 0){
      G.dmgFlash = Math.min(0.72, G.dmgFlash + clamp(amount / 30, 0.22, 0.55));
      player.shake = Math.min(1.6, player.shake + clamp(amount / 24, 0.18, 0.6));
      SFX.damageTaken(panOf(fromPos));
    } else {
      G.shieldFlash = Math.max(G.shieldFlash, 0.32);
      player.shake = Math.min(1.6, player.shake + clamp(amount / 24, 0.05, 0.20));
      SFX.shieldHit(panOf(fromPos));
    }
    if (typeof damageIndicator === 'function') damageIndicator(fromPos);
    if (typeof updateVitalsUI === 'function') updateVitalsUI();
  }

  if (p.hp <= 0){
    p.hp = 0;
    onPlayerDown(p, fromPos);
  }
}

function damagePlayer(amount, fromPos, pierce){
  applyDamageTo(player, amount, fromPos, pierce);
}

function onPlayerDown(p, fromPos){
  if (p.revives > 0){ revivePlayer(); return; }
  p.dead = true;
  setADS(false);
  if (typeof updateVitalsUI === 'function') updateVitalsUI();
  if (typeof endGame === 'function') endGame(false);
}

function revivePlayer(){
  player.revives--;
  player.dead = false;
  player.hp    = player.maxHp * 0.5;
  player.armor = player.maxArmor * 0.5;
  player.invulnT = 2.6;
  player.armorRegenT = 0;
  player.healT = 0;
  setADS(false);
  G.grace = Math.max(G.grace, 1.6);
  G.dmgFlash = 0;
  if (typeof pushComms === 'function')
    pushComms('MEDIC', 'REVIVE COIN SPENT — BACK ON YOUR FEET');
  SFX.healDone();
  SFX.radio();
  if (typeof updateVitalsUI === 'function') updateVitalsUI();
  if (typeof updateSquadUI  === 'function') updateSquadUI();
}

function startHeal(){
  if (!G.running || G.over || player.dead) return;
  if (!SET.healing) return;
  if (player.healT > 0) return;
  if (G.shopOpen) return;
  if (player.medkits <= 0){ SFX.dryFire(); return; }
  if (player.hp >= player.maxHp) return;
  if (player.reloadT > 0 || player.switching > 0 || player.pumpT > 0 || player.boltT > 0) return;

  setADS(false);
  player.medkits--;
  player.healT = HEAL_DUR;
  SFX.healStart();
  if (typeof updateVitalsUI === 'function') updateVitalsUI();
}

function cancelHeal(){
  if (player.healT <= 0) return;
  player.healT = 0;
  if (typeof updateVitalsUI === 'function') updateVitalsUI();
}

function updateRecovery(dt){
  if (player.dead) return;

  if (SET.armorRegen){
    if (player.armorRegenT > 0) player.armorRegenT -= dt;
    else if (player.armor < player.maxArmor){
      player.armor = Math.min(player.maxArmor, player.armor + ARMOR_REGEN_RATE * dt);
    }
  }

  if (player.healT > 0){
    player.healT -= dt;
    player.hp = Math.min(player.maxHp,
                         player.hp + (player.maxHp * HEAL_FRAC / HEAL_DUR) * dt);
    if (player.hp >= player.maxHp || player.healT <= 0){
      player.healT = 0;
      SFX.healDone();
      if (typeof updateVitalsUI === 'function') updateVitalsUI();
    }
  }
}

function liveBoss(){
  for (const e of enemies) if (!e.dead && e.tier === TIER.BOSS) return e;
  return null;
}

function updateBossUI(){
  if (typeof UI === 'undefined') return;
  const b = liveBoss();
  if (!b){
    if (!UI.bossBar.classList.contains('hide')){
      UI.bossBar.classList.add('hide');
      UI._bossRef = null;
    }
    return;
  }
  if (UI._bossRef !== b){
    UI._bossRef = b;
    UI.bossBar.classList.remove('hide');
    UI.bossName.textContent = b.name;
    UI.bossBlurb.textContent = b.boss ? b.boss.blurb : '';
  }
  UI.bossFill.style.transform  = 'scaleX(' + clamp(b.hp / b.maxHp, 0, 1) + ')';
  UI.bossApFill.style.transform = 'scaleX(' +
    clamp(b.armor / Math.max(b.maxArmor, 1), 0, 1) + ')';
}

function setSquadOpen(open){
  SET.squadOpen = !!open;
  if (typeof UI !== 'undefined'){
    if (UI.squad) UI.squad.classList.toggle('collapsed', !SET.squadOpen);
    if (UI.squadCaret) UI.squadCaret.textContent = SET.squadOpen ? '▾' : '▸';
  }
}