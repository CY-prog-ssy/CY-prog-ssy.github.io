(function () {
  'use strict';

  // ==========================================
  // 1. 公告配置（你可以随时修改这里的内容）
  // ==========================================
  const ANNOUNCEMENT_DATA = [
    {
      title: '公告一',
      date: '2026-*-*',
      content: 'by Ljh<br>https://cy-prog-ssy.github.io<br>1.下次更新作弊和娱乐（说白了就是外挂）'
    }
  ];

  // ==========================================
  // 2. 动态注入 CSS
  // ==========================================
  const style = document.createElement('style');
  style.id = 'game-announcement-style';
  style.textContent = `
    #gameAnnouncementOverlay {
      position: fixed; inset: 0; z-index: 2147483647;
      background: rgba(0, 0, 0, 0.6); /* 遮罩背景 */
      -webkit-backdrop-filter: blur(4px);
      backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif;
      opacity: 0; transition: opacity 0.3s ease;
      pointer-events: auto; /* 拦截点击 */
    }
    #gameAnnouncementOverlay.show { opacity: 1; }
    
    #gameAnnouncementCard {
      background: #ffffff; color: #333333;
      width: min(480px, 85vw); max-height: 80vh;
      border-radius: 20px; display: flex; flex-direction: column;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
      transform: translateY(20px) scale(0.95); transition: all 0.3s cubic-bezier(0.2, 0.9, 0.3, 1);
      overflow: hidden;
    }
    #gameAnnouncementOverlay.show #gameAnnouncementCard {
      transform: translateY(0) scale(1);
    }

    /* 顶部标题 */
    .ga-header {
      padding: 20px 24px 10px;
      font-size: 20px; font-weight: bold; color: #000;
      display: flex; align-items: center; gap: 8px;
    }

    /* 内容滚动区 */
    .ga-body {
      flex: 1; overflow-y: auto; padding: 0 24px;
      scrollbar-width: thin; scrollbar-color: #ccc transparent;
    }
    .ga-body::-webkit-scrollbar { width: 6px; }
    .ga-body::-webkit-scrollbar-thumb { background: #ddd; border-radius: 3px; }

    /* 单条公告 */
    .ga-item { padding: 16px 0; border-bottom: 1px solid #f0f0f0; }
    .ga-item:last-child { border-bottom: none; padding-bottom: 20px; }
    .ga-item-title { font-size: 16px; font-weight: 600; margin-bottom: 6px; color: #111; }
    .ga-item-date { font-size: 12px; color: #999; margin-bottom: 12px; }
    .ga-item-content { font-size: 14px; color: #444; line-height: 1.6; word-wrap: break-word; }

    /* 底部按钮 */
    .ga-footer {
      padding: 16px 24px 24px; text-align: center;
    }
    .ga-btn {
      display: inline-block; width: 60%; max-width: 240px;
      padding: 12px 0; border-radius: 25px;
      background: #007aff; color: #fff;
      font-size: 16px; font-weight: 600;
      border: none; outline: none; cursor: pointer;
      transition: background 0.2s, transform 0.1s;
    }
    .ga-btn:active { background: #0062cc; transform: scale(0.96); }
  `;
  document.head.appendChild(style);

  // ==========================================
  // 3. 构建 DOM 并渲染
  // ==========================================
  const overlay = document.createElement('div');
  overlay.id = 'gameAnnouncementOverlay';
  
  // 生成公告内容 HTML
  let itemsHtml = '';
  ANNOUNCEMENT_DATA.forEach(item => {
    itemsHtml += `
      <div class="ga-item">
        <div class="ga-item-title">${item.title}</div>
        <div class="ga-item-date">${item.date}</div>
        <div class="ga-item-content">${item.content}</div>
      </div>
    `;
  });

  overlay.innerHTML = `
    <div id="gameAnnouncementCard">
      <div class="ga-header">🔔 公告</div>
      <div class="ga-body">
        ${itemsHtml}
      </div>
      <div class="ga-footer">
        <button class="ga-btn" id="gaConfirmBtn">我知道了</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);

  // ==========================================
  // 4. 交互逻辑与事件拦截
  // ==========================================
  
  // 阻止底层游戏接收触摸/点击事件
  const stopEvent = (e) => { e.stopPropagation(); };
  overlay.addEventListener('touchstart', stopEvent, { passive: false });
  overlay.addEventListener('touchmove', stopEvent, { passive: false });
  overlay.addEventListener('touchend', stopEvent, { passive: false });
  overlay.addEventListener('mousedown', stopEvent);
  overlay.addEventListener('mouseup', stopEvent);
  overlay.addEventListener('click', stopEvent);

  // 触发显示动画
  setTimeout(() => { overlay.classList.add('show'); }, 100);

  // 关闭按钮逻辑
  const btn = document.getElementById('gaConfirmBtn');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    
    // 关闭动画
    overlay.classList.remove('show');

    // 等动画播完再移除 DOM
    setTimeout(() => {
      overlay.remove();
      style.remove();
    }, 300);
  });

})();