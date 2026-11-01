/* =========================================================================
   esp.js —— 透视绘制：方框 / 距离 / 名字 / 血条
   ========================================================================= */
"use strict";

const ESP = (() => {
  let canvas = null, ctx = null, dpr = 1, W = 0, H = 0;
  const _v = new THREE.Vector3();
  const _eye = new THREE.Vector3();
  const _losRay = new THREE.Raycaster();
  const _p1 = new THREE.Vector3();
  const _p2 = new THREE.Vector3();

  function init(){
    canvas = document.getElementById('espLayer');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resize();
    canvas.style.display = 'none';
  }

  function resize(){
    if (!canvas) return;
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width  = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function project(x, y, z, out){
    out.set(x, y, z).project(camera);
    if (out.z > 1) return false;
    out.x = (out.x * 0.5 + 0.5) * W;
    out.y = (-out.y * 0.5 + 0.5) * H;
    return true;
  }

  function losClear(from, tx, ty, tz, maxD){
    _v.set(tx - from.x, ty - from.y, tz - from.z);
    const len = _v.length();
    if (len < 0.5) return true;
    _v.divideScalar(len);
    _losRay.set(from, _v);
    _losRay.far = Math.min(len - 0.35, maxD || len);
    return _losRay.intersectObjects(worldSolid, false).length === 0;
  }

  function draw(){
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    if (typeof SET === 'undefined' || !SET.esp) return;
    if (!G.started || G.over) return;

    _eye.set(player.pos.x, player.pos.y + player.eye, player.pos.z);

    for (const e of enemies){
      if (e.dead) continue;

      const ex = e.obj.position.x, ey = e.obj.position.y, ez = e.obj.position.z;

      if (!project(ex, ey + 1.95, ez, _p1)) continue;
      if (!project(ex, ey - 0.05, ez, _p2)) continue;

      const h = Math.abs(_p2.y - _p1.y);
      if (h < 4) continue;
      const w = h * 0.42;
      const cx = (_p1.x + _p2.x) * 0.5;
      const cy = (_p1.y + _p2.y) * 0.5;

      const dx = ex - _eye.x, dy = ey + 1.0 - _eye.y, dz = ez - _eye.z;
      const dist = Math.hypot(dx, dy, dz);

      const visible = e.canSee || losClear(_eye, ex, ey + 1.0, ez, dist);

      ctx.strokeStyle = visible ? 'rgba(255,60,50,0.92)' : 'rgba(180,30,30,0.55)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);

      ctx.font = 'bold 11px ui-monospace, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const label = e.name + '  ' + dist.toFixed(0) + 'm';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(cx - tw / 2 - 4, cy - h / 2 - 18, tw + 8, 15);
      ctx.fillStyle = visible ? '#ff8a80' : '#c07070';
      ctx.fillText(label, cx, cy - h / 2 - 4);

      const hpFrac = clamp(e.hp / e.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(cx - w / 2, cy + h / 2 + 2, w, 3);
      ctx.fillStyle = hpFrac > 0.6 ? '#5fd06a' : (hpFrac > 0.28 ? '#ffb340' : '#ff3b30');
      ctx.fillRect(cx - w / 2, cy + h / 2 + 2, w * hpFrac, 3);
    }
  }

  return { init, draw, resize };
})();

ESP.init();