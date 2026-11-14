(function () {
  'use strict';

  // ==========================================
// 1. 公告配置（你可以随时修改这里的内容）
// ==========================================
const ANNOUNCEMENT_DATA = [
  // ================== 2026-11-01 最新更新 ==================
  {
    title: '公告十一：全新“娱乐”模块上线🎮',
    date: '2026-11-01',
    content: '1. 可以模拟封号让别人觉得你很强<br>2. 新增Pubg六道仙人同款魂环<br>3. 魂环支持调节颜色间隔等仅供观赏'
  },
  {
    title: '公告十：飞天修复与地图实体广告牌✈️',
    date: '2026-11-01',
    content: '1. 修复了不开飞天模式，按跳跃却直接升天的重力失效 Bug<br>2. 修复了飞天模式无法开关的 Bug，飞行手感改为纯正的“准星指哪飞哪”<br>3. 优化了集装箱的摆放位置，让玩家拥有更好的体验<br>4. 在仓库平台下方增加了一个广告牌，可以用来防护玩家'
  },
  {
    title: '公告九：辅助瞄准与透视增强🎯',
    date: '2026-11-01',
    content: '1. 修复了辅助瞄准会强行锁墙、拉枪乱晃的 Bug<br>2. 辅助瞄准加入【动态提前量预判】与目标平滑锁定，移动靶命中率大幅提升<br>3. 新增【预判线】功能，显示辅助瞄准有效圆圈，并连线当前锁定的目标'
  },
  {
    title: '公告八：移动触动优化📱',
    date: '2026-11-01',
    content: '1. 新增全局【滑动防误触】，滑动翻找设置时减少误触概率<br>2. 减少了触控反应时间'
  },
  {
    title: '公告七：极限画质与性能优化🚀',
    date: '2026-11-01',
    content: '1. 新增专为PC打造的顶级画质（手机端建议不要玩）<br>2. 可以调节帧率（支持 15 ~ 165 FPS 及无限制）<br>3. 新增更强的优化开启后视野外粒子剔除、远距离 AI 降频、后处理降采样，在不降低画质的前提下大幅提升帧数'
  },
  {
    title: '公告六：设置重构🔥',
    date: '2026-11-01',
    content: '1. 设置面板全面重构，划分为 8 大分类（画质、操作、功能、辅助、透视、作弊、娱乐、键位），告别功能杂乱'
  },
  
  {
    title: '公告五：紧急修复与防崩优化🔧',
    date: '2026-10-31',
    content: '1. 修复了设置面板加载报错（SET is not defined）导致屏幕满屏红字、无法进入游戏的问题<br>2. 增加了主循环容错机制，防止其他模块偶发异常导致游戏彻底卡死'
  },
  {
    title: '公告一：核心体验与手感大优化🔰',
    date: '2026-10-31',
    content: '1. 修复手机端卡加载、开始按钮点不动的问题，并新增进度条<br>2. 蹲下和开镜改为“点击切换”，开镜增加平滑动画<br>3. 跳跃开镜不再降速；空中按蹲下，落地自动蹲防<br>4. 加强了手枪移速加快15%<br>5. 开镜优化，开镜时自动隐藏HUD准星'
  },
  {
    title: '公告二：投掷物全面拟真化💣',
    date: '2026-10-31',
    content: '1. 重做手雷、闪光弹、燃烧瓶的3D模型<br>2. 修正手雷握持姿势，新增真实投掷动作<br>3. 修复无延迟扔手雷'
  },
  {
    title: '公告三：战术辅助与画面进阶🛂',
    date: '2026-10-31',
    content: '2. ESP透视大升级，包含了更多更能修复了一些问题<br>3. ESP新增【绘制射线】与【绘制骨骼】，支持自定义颜色<br>4. 画质面板新增实验性功能'
  },
  {
    title: '公告四：作者留言与开源许可🔰',
    date: '2026-10-31',
    content: '1. 感谢支持，后续持续打磨<br>2. 有问题欢迎在评论区反馈<br>3. ⚠️ 郑重声明：本作品完全开源，<b>允许任何人二创、修改和发布</b>，无需授权！'
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
      <div class="ga-header">🔔 更新公告</div>
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