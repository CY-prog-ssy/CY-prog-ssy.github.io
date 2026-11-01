/* =========================================================================
   intro.js
   开场运镜 —— 从出生点后上方俯冲下来落到第一人称眼位

   依赖：utils.js / renderer.js / input.js
   暴露：INTRO, intro, startIntro, updateIntro
   ========================================================================= */
"use strict";

/* --------------------------------------------------------------------------
   运镜设计

   2.0 秒。目的三个：
     1. 让玩家看清自己落在什么样的场地里
     2. 给"开始"这件事一个明确的仪式感
     3. 把出生点后方的告示牌带进视野

   运镜期间锁输入：镜头不是你在操控，此时按 W 或开枪都只会让落位时的
   状态跟玩家预期对不上。锁的是输入而不是整个 updatePlayer ——
   重力、落地、武器待机这些照常跑，落位瞬间不会有状态跳变。

   高度和水平用两条不同的缓动是这套运镜的关键：
   水平慢起慢收（看得清），高度快落（有俯冲感）。
   两者都不用同一条曲线，否则要么像电梯要么像抛物线。
   还要保证穿过 z=30 的围栏时高度足够 —— 围栏 3.3m。
   -------------------------------------------------------------------------- */
const INTRO = {
  dur: 2.0,
  /* 起点：出生点后上方。x 偏到牌子那一侧（-x），运镜才会从牌子上空掠过；
     偏一点而不是正对落位，是为了让镜头斜着切进来，
     正对着落位会让画面像一张正视图。 */
  from: { x: -3.4, y: 14.2, z: 33.0 },
  /* 看向场地深处，而不是看向落点 —— 看向落点在最后会变成一个急转 */
  look: { x: -1.5, y: 1.2, z: 6.0 },
  /* 落位时略微低头，是"站定扫视"的自然姿态，不是死盯水平线 */
  endPitch: -0.055
};

const intro = { t: 0, active: false };

/** 由 startGame 调用。重开一局也会走一遍，所以必须能重复触发。 */
function startIntro(){
  intro.t = 0;
  intro.active = true;
  G.introLock = true;

  player.vel.set(0, 0, 0);
  player.yaw = 0;
  player.pitch = INTRO.endPitch;      // 结束时就是玩家自己的朝向

  UI.cross.classList.add('hidden');   // 运镜中不显示准心
  vmRoot.visible = false;             // 也不显示手里的枪
}

/** 每帧推进运镜。返回 true 表示这一帧镜头由运镜接管。 */
function updateIntro(dt){
  if (!intro.active) return false;
  intro.t += dt;
  const k = clamp(intro.t / INTRO.dur, 0, 1);

  /* 水平：慢-快-慢，看得清两侧的集装箱 */
  const kh = k * k * (3 - 2 * k);
  /* 高度：先快后慢，前 40% 就掉掉一大半高度，这是俯冲感的来源 */
  const ky = 1 - (1 - k) * (1 - k);

  const B = player.pos;
  camera.position.set(
    lerp(INTRO.from.x, B.x, kh),
    lerp(INTRO.from.y, B.y + player.eye, ky),
    lerp(INTRO.from.z, B.z, kh)
  );

  /* 朝向：起点用 lookAt 反解出 yaw/pitch，终点就是玩家自己的朝向。
     两端都是明确的欧拉角，中间直接插值，不会出现万向节抖动。 */
  const dx = INTRO.look.x - INTRO.from.x;
  const dy = INTRO.look.y - INTRO.from.y;
  const dz = INTRO.look.z - INTRO.from.z;
  const horiz = Math.hypot(dx, dz) || 1;
  const yaw0 = Math.atan2(-dx, -dz);
  const pit0 = Math.atan2(dy, horiz);

  /* 插值的权重比位置稍微靠后一点：镜头先到位、朝向再跟上，
     读起来像"人站定了才转头看"，而不是整个画面一起平移 */
  const kr = clamp((k - 0.10) / 0.90, 0, 1);
  const krE = kr * kr * (3 - 2 * kr);

  /* 极轻微的 roll 摆动，模拟手持/吊臂。幅度必须很小：
     这是第一人称，roll 一多就是晕。 */
  const roll = Math.sin(k * PI) * 0.016 +
               Math.sin(intro.t * 2.7) * 0.004 * (1 - k);

  camera.rotation.set(
    lerp(pit0, player.pitch, krE),
    lerp(yaw0, player.yaw,   krE),
    roll
  );

  /* FOV：起点略窄（长焦压缩，像航拍），落到 75 的腰射。
     这条曲线本身就贡献一大部分"冲进来"的感觉。 */
  const f = lerp(BASE_FOV - 11, BASE_FOV, kh);
  if (Math.abs(camera.fov - f) > 0.01){
    camera.fov = f;
    camera.updateProjectionMatrix();
  }

  if (k >= 1){
    intro.active = false;
    G.introLock = false;
    camera.fov = BASE_FOV;
    camera.updateProjectionMatrix();

    UI.cross.classList.remove('hidden');
    vmRoot.visible = true;

    /* 指针锁定必须在运镜结束后：运镜期间锁会跟镜头打架，
       而且浏览器的 pointerlock 需要用户手势，
       落位时通常已经隔了两秒 */
    if (typeof IS_TOUCH !== 'undefined' && !IS_TOUCH){
      if (typeof requestLock === 'function') requestLock();
    }
  }
  return true;
}