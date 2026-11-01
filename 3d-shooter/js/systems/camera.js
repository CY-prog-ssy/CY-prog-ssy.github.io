/* =========================================================================
   camera.js
   尺寸自适应 —— 视口 / DPR / 渲染目标重分配 / 触屏按键缩放 / ESP 同步
   ========================================================================= */
"use strict";

function onResize(){
  const w = innerWidth, h = innerHeight;

  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  vmCamera.aspect = w / h;
  vmCamera.updateProjectionMatrix();

  renderer.setSize(w, h);
  allocTargets();

  /* 重算准心 */
  if (typeof layoutCrosshair === 'function') layoutCrosshair();

  /* 重算触屏按钮面板 */
  if (typeof layoutTouchCluster === 'function') layoutTouchCluster();

  /* ESP 层跟着重算 */
  if (typeof ESP !== 'undefined' && typeof ESP.resize === 'function') ESP.resize();
}

addEventListener('resize', onResize);
addEventListener('orientationchange', () => setTimeout(onResize, 120));

/* --------------------------------------------------------------------------
   渲染目标重分配后的回调
   -------------------------------------------------------------------------- */
allocTargets.onResize = () => {
  compMat.uniforms.res.value.set(RTW, RTH);

  if (typeof PS_SPARK !== 'undefined'){
    PS_SPARK.pts.material.uniforms.hscale.value = RTH * 0.5;
    PS_SOFT.pts.material.uniforms.hscale.value  = RTH * 0.5;
  }
  if (typeof PS_SPLASH !== 'undefined'){
    PS_SPLASH.pts.material.uniforms.hscale.value = RTH * 0.5;
  }
};

allocTargets.onResize();