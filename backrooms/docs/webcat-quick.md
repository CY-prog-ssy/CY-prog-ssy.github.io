# CatNative / window.webcat 速查

> **CatNative**：WebCatX 自研原生桥接框架。页面通过 `window.webcat.*` 调用安卓能力，预览与打包 APK 一致，**无需 import**。
> 同步方法直接返回对象（成功 `{ok:true,...}`，失败 `{ok:false,error}`）；异步方法返回 Promise（`await`），失败 Reject（Error.message）。
> 接口细节见 `docs/webcat-api.md`。

## 通用约定
- 返回信封：成功 `{ok:true,...}`；失败——同步 `{ok:false,error}`，异步 Reject。
- `window.webcat` 由原生在页面开始/完成时**异步注入**（可能晚于 `load`）。建议在 `DOMContentLoaded`/`load` 之后再调用；若仍取不到，请**重试/轮询** `window.webcat`（见下方 `whenWebcatReady`）。
- 权限三态：`granted` / `denied` / `undeclared`（未声明 = 打包时未勾选）。

## 默认行为与易错点
- 状态栏 / 底部导航栏由原生**自动避让**：普通页面**不要加 padding**；仅 `setAdaptive(true)` 沉浸且顶部需完整显示时才加，且 `height()` 是**设备px（非 dp）**，CSS 用 `height/density`。
- `media`：`path` 省略=默认集合；非 `/` 开头=该集合子目录；`/` 开头=绝对路径（需全盘权限）。`maxBytes` 仅对 base64 生效。
- `ext.target`：`"root"`（需全盘权限，path 绝对路径）或 SAF `handle`（path 相对授权目录）。
- 打包未声明权限的能力会返回引导性错误，需在打包权限清单勾选后再用。
- 网页不可访问 `/WebCatX` 目录（`ext.list` 返回空，读写等返回“路径受保护”）；SAF 授权目录不受限。

## 命名空间目录（细节见 webcat-api.md）
`fs` 私有文件 · `ext` 公开文件 · `media` 媒体保存/选择 · `camera` 相机 · `audio` 音频 · `tts` 文字转语音 · `record` 麦克风采集/录音 · `scan` 扫码 · `clipboard` 剪切板 · `share` 分享 · `app` 应用 · `permission` 权限 · `sys` 系统信息 · `screen` 屏幕 · `phone` 电话短信 · `qq` QQ · `browser` 浏览器 · `contacts` 通讯录 · `location` 定位 · `download` 下载 · `network` 网络请求/上传 · `socket` 局域网 WebSocket · `page` 页面窗口 · `store` 会话共享 · `statusBar` 状态栏 · `ui` 提示 · `flash` 手电筒 · `volume` 音量 · `brightness` 亮度 · `biometric` 生物识别 · `image` 图片处理 · `sensor` 传感器 · `notify` 通知 · `float` 悬浮窗/悬浮球 · `mediaSession` 媒体会话/后台播放 · `shizuku` Shizuku 特权命令 · `accessibility` 无障碍自动化

## 桥就绪（异步注入）
`window.webcat` 是异步注入的，可能晚于 `load`。稳妥做法是等就绪后再调用：
```js
function whenWebcatReady(cb) {
  if (window.webcat) return cb(window.webcat);
  var n = 0, t = setInterval(function () {
    if (window.webcat) { clearInterval(t); cb(window.webcat); }
    else if (++n > 120) { clearInterval(t); console.warn("webcat 未注入"); }
  }, 50); // 最多约 6 秒
}
whenWebcatReady(function (webcat) {
  // 在这里调用 webcat.*
});
```

## 高频示例
```js
// 私有文件
await webcat.fs.writeFile("data.json", JSON.stringify({a:1}));
const { content } = await webcat.fs.readFile("data.json");

// 图片 dataURL 存相册子目录 / 选图转 base64
await webcat.media.saveImage("card.png", canvas.toDataURL(), "myapp/cards");
const { base64 } = await webcat.media.pickImage();

// 公开目录（全盘权限）
if (webcat.ext.isFullAccess().granted) {
  await webcat.ext.writeFile("root", "/storage/emulated/0/Download/a.txt", "hi");
} else {
  webcat.ext.requestFullAccess();
}

// 原生网络 / 流式下载
const r = await webcat.network.request({ method: "GET", url: "https://example.com" });
await webcat.download.stream({ url: "https://x.com/a.png", source: "fs", path: "img/a.png" });

// 权限
const p = await webcat.permission.request(["android.permission.CAMERA"]);
if (p.undeclared.length) webcat.ui.toast("该权限未在打包时勾选");

// 状态栏（默认自动避让，普通态不要加 padding）
webcat.statusBar.setAdaptive(true);
const { height, density } = webcat.statusBar.height();
document.querySelector(".app-header").style.paddingTop = (height / density) + "px";

// 通知（需打包勾选「通知」）
if (!webcat.notify.hasPermission().granted) await webcat.notify.requestPermission();
await webcat.notify.show({ id: 1, title: "标题", body: "内容", ongoing: true });

// 悬浮窗 / 悬浮球（需打包勾选「悬浮窗」+「前台服务」）
if (!webcat.float.hasPermission().granted) webcat.float.requestPermission();
await webcat.float.open({ mode: "bubble", panel: { url: "panel.html", width: 280, height: 400 } });

// 桌面宠物：透明背景 + 整窗拖动 + 吸附靠边 + 透明处不挡桌面
const { id: pet } = await webcat.float.open({
  url: "pet.html", width: 160, height: 160, titleBar: false,
  background: "transparent", dragHandle: "any", snap: "corner", keepInScreen: true
});
webcat.float.watchHit(pet, "#pet");  // 仅宠物本体可点/拖，其余穿透桌面

// 事件订阅（原生 → JS）
webcat.on("notify.click", e => webcat.ui.toast("点击了通知 " + e.id));
webcat.on("float.event", e => console.log(e.id, e.event));

// 录屏 / 内录 / 截图（需打包勾选「前台服务」；内录另需「屏幕采集」，Android 10+）
if (webcat.capture.isSupported().mediaAudio) {
  await webcat.capture.request();                              // 系统捕获授权
  await webcat.capture.startAudio({ audioSource: 'both' });    // 媒体音+麦克风
  // webcat.capture.stop();  // 同步返回 {ok}；或改 startScreen / screenshot
}
await webcat.capture.startScreen({ audioSource: 'both', path: 'movies/demo.mp4' });
await webcat.capture.startCode({ intervalMs: 300 });                 // 识别屏幕二维码 -> capture.code
const shot = await webcat.capture.screenshot({ format: 'png', base64: true });

// 媒体后台播放（需打包勾选「前台服务」）
await webcat.mediaSession.create();
await webcat.mediaSession.setQueue({ items: [{ url: "https://x/a.mp3", title: "歌名" }], autoPlay: true });

// 禁止/恢复截屏（仅当前页，无需权限；悬浮窗环境不支持）
webcat.screen.blockCapture();     // 禁止截屏/录屏（FLAG_SECURE）
webcat.screen.unblockCapture();   // 恢复

// 通用前台服务（保活，需打包勾选「前台服务」；Android 12+ 需在 App 前台时启动）
await webcat.service.start({ title: "后台运行中", body: "点击返回应用" });
webcat.service.isRunning();       // {ok, running}
await webcat.service.stop();

// 请求忽略电池优化（打包勾选后弹系统直接授权框；未勾选则打开设置列表页引导）
if (!webcat.app.isIgnoringBatteryOptimizations().ignoring) {
  await webcat.app.requestIgnoreBatteryOptimizations();
}

// 麦克风采集（需打包勾选「录音/麦克风」）：实时 PCM / WAV / 振幅，自行算波形·噪音
webcat.on("record.data", e => { /* e.base64 = PCM 16bit 小端分片 */ });
webcat.on("record.amplitude", e => console.log("dB", e.db));
await webcat.record.start({ mode: "stream", chunkMs: 100 });   // 实时采集
// await webcat.record.start({ mode: "record", format: "wav", path: "records/a.wav" });
webcat.record.amplitude();   // {amplitude, db}
await webcat.record.stop();

// 局域网 WebSocket（设备互联，仅需 INTERNET）：服务端 + 客户端
const { port, addresses } = await webcat.socket.start({ port: 8000, token: "abc" });
webcat.on("socket.message", e => console.log("收到", e.id, e.data));
const r = webcat.socket.broadcast("hello");   // 同步返回 {ok,sent}（sent=成功发送的连接数）
// 另一台设备连本机： ws://<addresses[0]>:8000/?token=abc
// 也可作客户端： await webcat.socket.connect("ws://192.168.1.5:8000", "abc");

// 文件传输（走同一条 socket）：接收端自动落盘 received/，发事件
webcat.on("socket.fileReceived", e => console.log("收到文件", e.name, e.path));
await webcat.socket.sendFile({ id: "*", source: "fs", path: "a.bin" });        // 服务端广播
// await webcat.socket.clientSendFile({ source: "root", path: "/storage/emulated/0/Download/b.zip" });

// 自定义 URL Scheme（项目设置里配置如 myapp；打包后其他应用用 myapp:// 拉起）
webcat.on("scheme.open", e => console.log(e.scheme, e.host, e.path, e.params));
webcat.app.openUri("weixin://");   // 往外跳其他应用 scheme
```

```js
// Shizuku（打包勾选「Shizuku」；用户需安装并启动 Shizuku 并授权）
const s = webcat.shizuku.info();
if (!s.available) await webcat.shizuku.openManager();
if (s.available && !s.permission) await webcat.shizuku.requestPermission();
if (webcat.shizuku.hasPermission().granted) {
  const r = await webcat.shizuku.exec("id", { timeoutMs: 10000 });
  console.log(r.code, r.stdout, r.stderr, r.timedOut);
  if (webcat.shizuku.info().uid === 0) {
    // root/Sui 后端，可执行 root-only 命令
  }
}
webcat.on("shizuku.ready", () => console.log("Shizuku ready"));
webcat.on("shizuku.dead", () => console.log("Shizuku dead"));

// 无障碍（打包勾选「无障碍」；用户需在系统设置开启服务）
if (!webcat.accessibility.isEnabled().enabled) {
  webcat.accessibility.openSettings();
}
await webcat.accessibility.waitFor({ text: "确定" }, { timeoutMs: 5000 });
await webcat.accessibility.click({ text: "确定" });
await webcat.accessibility.setText({ viewId: "id/input" }, "hello");
await webcat.accessibility.scroll({ className: "android.widget.ScrollView" }, "down");
await webcat.accessibility.global("back");

// 跨 App 操作时指定窗口/包名
const nodes = await webcat.accessibility.find(
  { textContains: "登录" },
  { packageName: "com.example.target", allWindows: true }
);

// 事件流
webcat.accessibility.startEvents({ eventTypes: ["windowStateChanged", "viewClicked"], throttleMs: 100 });
webcat.on("accessibility.event", e => console.log(e.eventTypeName, e.packageName, e.text));
webcat.accessibility.stopEvents();
```
