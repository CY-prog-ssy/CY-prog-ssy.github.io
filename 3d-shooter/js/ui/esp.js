/* =========================================================================
   esp.js —— 透视绘制：方框 / 距离 / 名字 / 血条 / 射线 / 骨骼
   ★ 可见 = 红，遮挡 = 绿；支持自定义颜色与彩虹流光模式
   ========================================================================= */
"use strict";

const ESP = (() => {
  let canvas = null, ctx = null, dpr = 1, W = 0, H = 0;
  const _v = new THREE.Vector3();
  const _eye = new THREE.Vector3();
  const _losRay = new THREE.Raycaster();
  const _p1 = new THREE.Vector3();
  const _p2 = new THREE.Vector3();
  const _boneV = new THREE.Vector3();

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

  function boneWorld(obj){
    if (!obj) return null;
    obj.getWorldPosition(_boneV);
    return { x: _boneV.x, y: _boneV.y, z: _boneV.z };
  }

  function drawSkeleton(e, color){
    if (!e.p) return;
    const p = e.p;

    const parts = {};
    if (p.head) parts.head = boneWorld(p.head);
    if (p.rig)  parts.rig  = boneWorld(p.rig);
    if (p.legs && p.legs[0] && p.legs[1]){
      const l = boneWorld(p.legs[0].hip);
      const r = boneWorld(p.legs[1].hip);
      if (l && r) parts.hip = { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2, z: (l.z + r.z) / 2 };
    }
    if (p.legs && p.legs[0]) parts.kneeL = boneWorld(p.legs[0].knee);
    if (p.legs && p.legs[1]) parts.kneeR = boneWorld(p.legs[1].knee);
    if (p.arms && p.arms[0]) parts.elbowL = boneWorld(p.arms[0].el);
    if (p.arms && p.arms[1]) parts.elbowR = boneWorld(p.arms[1].el);

    const scr = {};
    for (const k in parts){
      if (!parts[k]) continue;
      const v = new THREE.Vector3();
      if (project(parts[k].x, parts[k].y, parts[k].z, v)) scr[k] = v;
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';

    const line = (a, b) => {
      if (!scr[a] || !scr[b]) return;
      ctx.beginPath();
      ctx.moveTo(scr[a].x, scr[a].y);
      ctx.lineTo(scr[b].x, scr[b].y);
      ctx.stroke();
    };

    line('head', 'rig');
    line('rig', 'hip');
    line('rig', 'elbowL');
    line('rig', 'elbowR');
    line('hip', 'kneeL');
    line('hip', 'kneeR');

    if (scr.head){
      ctx.beginPath();
      ctx.arc(scr.head.x, scr.head.y, 3.2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function draw(){
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    if (typeof SET === 'undefined' || !SET.esp) return;
    if (!G.started || G.over) return;

    _eye.set(player.pos.x, player.pos.y + player.eye, player.pos.z);

// ★ 彩虹流光计算器
const now = performance.now() * 0.001;
function getColor(baseColor, phaseOffset) {
  if (SET.espRainbow) {
    // 随时间流动的 HSL 颜色，色相相隔确保方框/射线/骨骼颜色互不干扰
    const hue = (now * 60 + phaseOffset) % 360; 
    return `hsl(${hue}, 100%, 60%)`;
  }
  return baseColor;
}

// =========================================================
// ★ 绘制辅助瞄准范围圆圈与预判线
// =========================================================
if (SET.espAimLine) {
  const cx = W / 2;
  const cy = H / 2;
  const colAim = getColor(SET.espColorAimLine || '#ff0000', 180);
  
  // 计算辅助瞄准的屏幕圆圈半径 (匹配 AA.CONE 的角度)
  const fovRad = camera.fov * Math.PI / 180;
  const coneRad = typeof AA !== 'undefined' ? AA.CONE : 0.155;
  const circleRadius = (Math.tan(coneRad) / Math.tan(fovRad / 2)) * (H / 2);

  ctx.strokeStyle = colAim;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]); // 虚线圆圈
  
  // 1. 画圆
  ctx.beginPath();
  ctx.arc(cx, cy, circleRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]); // 恢复实线

  // 2. 画目标预判线
  if (window._aimAssistTargetInfo && window._aimAssistTargetInfo.e && !window._aimAssistTargetInfo.e.dead) {
    const targetE = window._aimAssistTargetInfo.e;
    const _aimTgt = new THREE.Vector3();
    
    // 使用玩家_update里的getTargetPoint获取当前的瞄准部位
    if (typeof getTargetPoint === 'function') {
      getTargetPoint(targetE, _aimTgt);
    } else {
      _aimTgt.set(targetE.obj.position.x, targetE.obj.position.y + 1.15, targetE.obj.position.z);
    }
    
    if (project(_aimTgt.x, _aimTgt.y, _aimTgt.z, _v)) {
      ctx.strokeStyle = colAim;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(_v.x, _v.y);
      ctx.stroke();

      // 目标点上画个小准心
      ctx.beginPath();
      ctx.arc(_v.x, _v.y, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

    // ★ 独立颜色配置（如果彩虹开启，会覆盖下方选的颜色）
    const colVisible = getColor(SET.espColorVisible || '#ff3c32', 0);
    const colHidden  = getColor(SET.espColorHidden  || '#5fd06a', 120);
    const colRay     = getColor(SET.espColorRay     || '#ffcc44', 240);
    const colBone    = getColor(SET.espColorBone    || '#00e0ff', 60);
    
    const drawRay    = !!SET.espDrawRay;
    const drawBone   = !!SET.espDrawBone;

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
      const boxColor = visible ? colVisible : colHidden;

      // ★ 射线：从屏幕正上方中间连到敌人的方框顶部
      if (drawRay){
        ctx.strokeStyle = colRay;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        
        // 起点：屏幕正上方中间（如果想让起点在准星，把 0 改成 H / 2 即可）
        const startX = W / 2;
        const startY = 0; 
        
        // 终点：敌人方框的顶部正中间
        const endX = cx;
        const endY = cy - h / 2;
        
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      }

      // ★ 方框（使用线性渐变，让方框上下边缘颜色略有不同以增加立体感）
      const grad = ctx.createLinearGradient(cx, cy - h/2, cx, cy + h/2);
      if (SET.espRainbow) {
        const hue = (now * 60) % 360;
        grad.addColorStop(0, `hsl(${hue}, 100%, 60%)`);
        grad.addColorStop(1, `hsl(${(hue + 40) % 360}, 100%, 60%)`);
      } else {
        grad.addColorStop(0, boxColor);
        grad.addColorStop(1, boxColor);
      }
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);

      // 名字 + 距离
      ctx.font = 'bold 11px ui-monospace, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const label = e.name + '  ' + dist.toFixed(0) + 'm';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(cx - tw / 2 - 4, cy - h / 2 - 18, tw + 8, 15);
      
      // 文字颜色也同样受流光控制
      ctx.fillStyle = SET.espRainbow ? colVisible : boxColor;
      ctx.fillText(label, cx, cy - h / 2 - 4);

      // 血条
      const hpFrac = clamp(e.hp / e.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(cx - w / 2, cy + h / 2 + 2, w, 3);
      ctx.fillStyle = hpFrac > 0.6 ? '#5fd06a' : (hpFrac > 0.28 ? '#ffb340' : '#ff3b30');
      ctx.fillRect(cx - w / 2, cy + h / 2 + 2, w * hpFrac, 3);

      // ★ 骨骼
      if (drawBone) drawSkeleton(e, colBone);
    }
  }

  return { init, draw, resize };
})();

ESP.init();