# CatNative / webcat 安卓能力桥接 —— API 参考

> **CatNative**（WebCatX 自研原生桥接框架）：项目页面通过全局对象 `window.webcat` 调用安卓能力（预览与打包 APK 均支持，**无需引入**）。同步方法直接返回对象；异步方法返回 Promise，用 `await`。失败：同步返回 `{ok:false,error}`，异步 Reject（Error.message）。
> `window.webcat` 由原生在页面开始/完成时**异步注入**，可能晚于 `load`；建议在 `DOMContentLoaded`/`load` 之后调用，若仍取不到请**重试/轮询** `window.webcat` 再调用（详见 `webcat-quick.md` 的 `whenWebcatReady`）。

## webcat.fs —— 私有文件（应用私有目录，两端一致）
| 接口(中文名) | 类型 | 入参 | 出参 |
|---|---|---|---|
| `fs.readFile`(读取文件) | 异步 | path, encoding?('utf8'/'base64') | `{ok, content}` |
| `fs.writeFile`(写入文件) | 异步 | path, content, encoding? | `{ok, size}`（自动建父目录） |
| `fs.list`(列出目录) | 异步 | dir? | `{ok, items:[{name,isDir,size,modified}]}` |
| `fs.delete`(删除) | 异步 | path | `{ok}`（文件/空目录） |
| `fs.mkdir`(创建目录) | 同步 | dir | `{ok}` |
| `fs.exists`(判断存在) | 同步 | path | `{ok, exists, isDir}` |
| `fs.stat`(文件信息) | 同步 | path | `{ok, size, isDir, modified}` |
| `fs.readAsset`(读取项目文件) | 异步 | path（项目内相对） | `{ok, content}`（打包后只读） |
| `fs.openFile`(系统打开文件) | 同步 | path | `{ok}` |
| `fs.zip`(压缩) | 异步 | source, targetZip(.zip) | `{ok, size}` |
| `fs.unzip`(解压) | 异步 | zipPath, outDir | `{ok, count}` |
| `fs.move`(移动/重命名) | 异步 | source, target | `{ok}` |
| `fs.copy`(复制) | 异步 | source, target | `{ok}` |

## webcat.ext —— 公开文件（target=`"root"`全授权 / SAF handle）
| 接口(中文名) | 类型 | 入参 | 出参 |
|---|---|---|---|
| `ext.isFullAccess`(是否全授权) | 同步 | — | `{ok, granted}` |
| `ext.requestFullAccess`(开启全授权) | 同步 | — | `{ok}`（跳本应用设置） |
| `ext.pickDirectory`(选择目录) | 异步 | — | `{ok, handle}`（授权持久化） |
| `ext.revoke`(撤销授权) | 同步 | handle | `{ok}` |
| `ext.list`(列出) | 异步 | target, path? | `{ok, items}` |
| `ext.readFile`(读取) | 异步 | target, path, encoding? | `{ok, content}` |
| `ext.writeFile`(写入) | 异步 | target, path, content, encoding? | `{ok, size}` |
| `ext.delete`(删除) | 异步 | target, path | `{ok}` |
| `ext.mkdir`(建目录) | 同步 | target, path | `{ok}` |
| `ext.exists`(存在) | 同步 | target, path | `{ok, exists, isDir}` |
| `ext.stat`(信息) | 同步 | target, path | `{ok, size, isDir, modified}` |
| `ext.openFile`(系统打开) | 同步 | target, path | `{ok}` |
| `ext.zip`(压缩) | 异步 | target, source, targetZip | `{ok, size}` |
| `ext.unzip`(解压) | 异步 | target, zipPath, outDir | `{ok, count}` |
| `ext.move`(移动) | 异步 | target, source, dst | `{ok}` |
| `ext.copy`(复制) | 异步 | target, source, dst | `{ok}` |

> `target` 取 `"root"`（需“所有文件访问”，path 为绝对路径）或 SAF `handle`（path 相对授权目录）。

## webcat.media —— 媒体保存 / 选择
| 接口(中文名) | 类型 | 入参 | 出参 / 说明 |
|---|---|---|---|
| `media.saveImage`(存相册) | 异步 | name, data, path? | `{ok, uri?, path?}`，默认存 Pictures |
| `media.saveToDownload`(存下载) | 异步 | name, data, path? | `{ok, uri?, path?}`，默认存 Download |
| `media.save`(自动) | 异步 | name, data, path? | 按扩展名自动图片→相册、其它→Download |
| `media.pickImage`(选图) | 异步 | format?, maxBytes? | `{ok,name,mime,size,base64\|uri\|path}` |
| `media.pickFile`(选文件) | 异步 | mime?, format?, maxBytes? | 同上，mime 默认 `*/*` |

- `data` 支持：裸 base64 / `data:image/png;base64,...` / http(s) URL（自动下载）。
- `path`：省略=默认集合；非 `/` 开头=该集合下子目录（如 `myapp/cards`）；`/` 开头=绝对路径直接写文件（需全盘权限）。
- `format` 默认 `base64`；`uri` 返回 content uri；`path` 尽力解析本地绝对路径，失败会提示改用 uri/base64。
- `maxBytes` 默认 15MB（仅 base64 上限，超限请改用 `format=uri`）。

## webcat.camera —— 相机
| 接口(中文名) | 类型 | 入参 | 出参 / 说明 |
|---|---|---|---|
| `camera.takePhoto` | 异步 | save? | `{ok,name,size,base64}`；调系统相机（免 CAMERA 权限），save=true 同时存相册 |

## webcat.audio —— 音频播放
| 接口 | 类型 | 入参 | 出参 / 说明 |
|---|---|---|---|
| `audio.play` | 异步 | `{url\|source,path,volume?,seek?}` | 播完 resolve `{ok,end:true}`；本地支持 fs/root/SAF，或 http(s) |
| `audio.stop` / `pause` / `resume` | 异步 | — | `{ok}` |
| `audio.setVolume` | 异步 | volume(0~1) | `{ok}` |
| `audio.seek` | 异步 | position(ms) | `{ok}` |
| `audio.isSupported` | 同步 | — | `{ok, supported}` |

## webcat.tts —— 文字转语音（无需权限）
| 接口 | 类型 | 入参 | 出参 / 说明 |
|---|---|---|---|
| `tts.isSupported` | 同步 | — | `{ok, supported, speaking}` |
| `tts.speak` | 异步 | text, {lang?, rate?, pitch?, volume?, queue?} | 读完 resolve `{ok,end:true}`；`lang` 如 `"zh-CN"`；`rate/pitch` 默认 1；`volume` 0~1；`queue=true` 追加不打断 |
| `tts.stop` | 异步 | — | `{ok}` 停止并结束当前朗读 |
| `tts.pause` | 异步 | — | `{ok}` 暂停（系统 TTS 无原生暂停，等价停止） |
| `tts.resume` | 异步 | — | `{ok}` 从头继续最近一次内容 |

## webcat.record —— 麦克风采集 / 录音（需打包勾选“录音/麦克风”）
> 单会话：同一时刻只能有一个采集（压缩录音与实时采集互斥）。默认 `mode=record` 保持旧行为。
> 单加权限无效；网页 `getUserMedia` 未实现，采集请走本模块。

| 接口 | 类型 | 入参 | 出参 / 说明 |
|---|---|---|---|
| `record.start` | 异步 | 见下 opts | `{ok,started,mode,format,sampleRate,channels,bitsPerSample}` |
| `record.stop` | 异步 | — | record 模式 `{ok,path,size,durationMs,format}`（wav 时 format=`wav`） |
| `record.cancel` | 异步 | — | `{ok}` 丢弃 |
| `record.pause` / `record.resume` | 异步 | — | 暂停 / 继续 |
| `record.state` | 同步 | — | `{ok, recording}` |
| `record.amplitude` | 同步 | — | `{ok, amplitude(0~32767), db}` |
| `record.sources` | 同步 | — | `{ok, sources:['mic','camcorder','voice_recognition','voice_communication','unprocessed']}` |

**opts**
- `mode`：`'record'`(存文件，默认) ｜ `'stream'`(实时 PCM) ｜ `'both'`
- `format`：`'m4a'`/`'amr'`(MediaRecorder 压缩) ｜ `'wav'`/`'pcm'`(AudioRecord，`pcm` 仅配合 stream)
- `sampleRate`(44100) · `channels`(1｜2) · `bitsPerSample`(16) · `chunkMs`(stream 分片，默认100) · `amplitudeIntervalMs`
- `source`(输入源，见 `record.sources`) · `path`(record 保存目标，默认 `records/mic_时间戳.wav`) · `aec`/`ns`/`agc`(回声消除/降噪/自动增益)

**事件（`webcat.on`）**
- `record.data` → `{base64, bytes, seq, ts, sampleRate, channels, bitsPerSample}`（stream，PCM 16bit 小端）
- `record.amplitude` → `{amplitude, db, ts}`
- `record.error` → `{error}`

```js
webcat.on("record.data", e => { /* e.base64 为 PCM 分片：自行计算波形/噪音/FFT */ });
webcat.on("record.amplitude", e => console.log(e.db));
await webcat.record.start({ mode: "stream", chunkMs: 100 });               // 实时采集
// await webcat.record.start({ mode: "record", format: "wav", path: "records/a.wav" }); // 存 WAV
await webcat.record.stop();
```


## webcat.scan —— 扫码（需打包勾选“相机”）
| 接口 | 类型 | 入参 | 出参 / 说明 |
|---|---|---|---|
| `scan.scan` | 异步 | — | `{ok,text,format}`（实时扫码；预览返回引导） |
| `scan.decodeImage` | 异步 | `{uri\|base64\|source,path}` | `{ok,text}` |
| `scan.generate` | 同步 | text, size? | `{ok,base64}` 生成二维码 PNG |

## webcat.clipboard —— 剪切板（同步）
| 接口(中文名) | 入参 | 出参 |
|---|---|---|
| `clipboard.get`(读取剪切板) | — | `{ok, text}` |
| `clipboard.set`(写入剪切板) | text | `{ok}` |

## webcat.share —— 分享
| 接口(中文名) | 类型 | 入参 | 出参 / 说明 |
|---|---|---|---|
| `share.text`(分享文本) | 同步 | text, title? | 系统分享面板 |
| `share.file`(分享文件) | 同步 | source('fs'/'root'/handle), path, mime? | fs/root 走 FileProvider |

## webcat.app —— 应用
| 接口(中文名) | 类型 | 入参 | 出参 / 说明 |
|---|---|---|---|
| `app.info`(应用信息) | 同步 | — | `{ok, packageName, versionName, versionCode, appName}` |
| `app.quit`(退出应用) | 同步 | — | `{ok}` |
| `app.openFile`(系统打开文件) | 同步 | source('fs'/'root'/handle), path | `{ok}` |
| `app.install`(安装) | 同步 | source, path | 需允许未知来源；SAF 先复制到 cache |
| `app.openAppSettings` | 同步 | — | 跳本应用设置 |
| `app.isInstalled` | 同步 | packageName | `{ok, installed, appName?, versionName?, limited}`（limited=未勾选“应用列表”，可能误报未安装） |
| `app.listApps` | 异步 | — | 需打包勾选 QUERY_ALL_PACKAGES；`{ok, apps:[{packageName,appName,versionName,versionCode,isSystem}]}` |
| `app.launchPackage` | 同步 | packageName | `{ok,launched}`；按包名打开（勾选“应用列表”更准） |
| `app.openUri` | 同步 | uri | `{ok,launched}`；任意 scheme/url |
| `app.isIgnoringBatteryOptimizations` | 同步 | — | `{ok, ignoring}`；是否已在电池优化白名单 |
| `app.requestIgnoreBatteryOptimizations` | 异步 | — | 申请忽略电池优化；`{ok, ignoring, declared, launched}`。已声明该项权限时弹系统直接授权框；**未声明时回退打开电池优化设置列表页** |

## webcat.service —— 通用前台服务（保活）
| 接口(中文名) | 类型 | 入参 | 出参 / 说明 |
|---|---|---|---|
| `service.start`(启动前台服务) | 异步 | `{title?, body?}` | `{ok, running}`；发常驻通知并保活进程。**需打包勾选「前台服务」**，否则返回 `undeclared`；**Android 12+ 必须在 App 前台时启动** |
| `service.update` | 异步 | `{title?, body?}` | `{ok, running}`；更新常驻通知文案 |
| `service.stop` | 异步 | — | `{ok}`；停止前台服务 |
| `service.isRunning` | 同步 | — | `{ok, running}` |

> 前台服务保活的是**本 App 单个进程**（含所有页面/WebView/JS/单例）；**不抗强制停止、不抗厂商省电**，建议配合 `app.requestIgnoreBatteryOptimizations`。通道：`webcat_service`。

## webcat.permission —— 权限
| 接口(中文名) | 类型 | 入参 | 出参 |
|---|---|---|---|
| `permission.check`(检查权限) | 同步 | perms: string[] | `{ok, granted[], denied[], undeclared[]}` |
| `permission.request`(申请权限) | 异步 | perms: string[] | `{ok, granted[], denied[], undeclared[]}` |

> `undeclared` = 未声明权限（打包时未勾选 / 不支持）→ 提示“打包时勾选”或“系统授予”。特殊权限 MANAGE 走 `ext.requestFullAccess`。

## webcat.sys —— 系统信息（同步）
| 接口(中文名) | 出参 |
|---|---|
| `sys.info` | 见下 |
| `sys.network` | `{ok, online, type:wifi/mobile/none}` |
| `sys.battery` | `{ok, level, charging, present, temperature(°C), voltage(mV), plugged:none/ac/usb/wireless, health:good/overheat/dead/over_voltage/failure/cold/unknown, technology}` |

> `sys.info` 字段（部分，其余兼容保留）：`brand, manufacturer, model, device, product, hardware, board, androidVersion, androidCodename, sdkInt, cpuAbi, abis[], cpuCores, screenWidth, screenHeight, refreshRate, density, densityDpi, scaledDensity, screenWidthDp, screenHeightDp, orientation:portrait/landscape, isTablet, isDarkMode, nightMode:no/yes/auto/custom, fontScale, statusBarHeight, navigationBarHeight, locale, language, country, timeZone, timeZoneOffset(分钟), is24Hour, uptime(ms), bootTime(ms), isEmulator, storageInternalTotal/Free, storageExternalTotal/Free, memoryTotal, memoryAvail, lowMemory`。其中 **`isDarkMode`/`nightMode` 读“系统”全局深色模式**（非本页外观）；`statusBarHeight`/`navigationBarHeight` 个别 ROM 可能为 0；`isEmulator` 为启发式判断，仅供参考。应用信息见 `app.info`。

## webcat.screen —— 屏幕（同步）
| 接口(中文名) | 入参 | 出参 / 说明 |
|---|---|---|
| `screen.keepOn`(屏幕常亮) | on | `FLAG_KEEP_SCREEN_ON` 开/关 |
| `screen.setOrientation` | mode | auto/portrait/landscape/sensor |
| `screen.blockCapture`(禁止截屏) | - | `{ok, blocked:true}`；`FLAG_SECURE` 开，禁止截屏/录屏/最近任务缩略图 |
| `screen.unblockCapture`(恢复截屏) | - | `{ok, blocked:false}`；`FLAG_SECURE` 关 |

> 截屏控制仅作用于当前 Activity 窗口（不做会话共享、无需权限）；悬浮窗环境不支持。挡不住“另一台设备拍照”与 root/定制 ROM。

## webcat.phone —— 电话短信（同步，免权限跳系统）
| 接口 | 入参 | 出参 |
|---|---|---|
| `phone.dial` | number | `{ok}` |
| `phone.sms` | number, text? | `{ok}` |

## webcat.qq —— QQ 跳转（同步）
| 接口 | 入参 | 出参 |
|---|---|---|
| `qq.openProfile` | qq: QQ号 | `{ok, launched}` |
| `qq.openGroup` | qq: 群号 | `{ok, launched}` |

## webcat.browser —— 系统浏览器（同步）
| 接口 | 入参 | 出参 |
|---|---|---|
| `browser.open` | url | `{ok}` |

## webcat.contacts —— 通讯录
| 接口 | 类型 | 入参 | 出参 / 说明 |
|---|---|---|---|
| `contacts.list` | 异步 | — | `{ok, contacts:[{name, phones:[]}]}`（需 READ_CONTACTS，打包勾选） |

## webcat.location —— 定位
| 接口 | 类型 | 入参 | 出参 / 说明 |
|---|---|---|---|
| `location.get` | 异步 | — | `{ok, latitude, longitude, accuracy, provider}`（需定位权限，打包勾选） |

## webcat.download —— 下载
| 接口 | 类型 | 入参 | 出参 / 说明 |
|---|---|---|---|
| `download.download` | 异步 | url, source('fs'/'root'/handle), path | `{ok, path, size}` |
| `download.stream` | 异步 | `{url,source,path,headers?,onProgress}` | `{ok,path,size}`；带进度（中间帧 `{progress:{loaded,total}}`） |

## webcat.network —— 原生网络（无 CORS）
| 接口 | 类型 | 入参 | 出参 / 说明 |
|---|---|---|---|
| `network.request` | 异步 | `{method,url,headers,body,timeout?,returnBase64?}` | `{ok,status,body}`；body 支持 `base64:` 前缀 |
| `network.upload` | 异步 | `{url,method?,headers?,fieldName?,files:[{source:'fs'/'root'/handle,path,name?}],fields?,onProgress}` | `{ok,status,body}`；multipart，已知路径原生直传 |

## webcat.socket —— 局域网 WebSocket（服务端 + 客户端，设备互联）
> 仅需 `INTERNET`。服务端绑 `0.0.0.0`，同局域网其他设备（另一台打包 App / 浏览器）可用 `ws://<本机IP>:<端口>` 连入；本机也可作为客户端连别人。`status().addresses` 给出本机局域网 IPv4。注意路由器 AP 隔离会拦截。

**服务端**
| 接口 | 类型 | 入参 | 出参 / 说明 |
|---|---|---|---|
| `socket.start` | 异步 | `{port?, token?}` | `{ok,listening,port,addresses,clients}`；port=0/省略则随机端口；token 非空则校验 `?token=` |
| `socket.stop` | 异步 | — | `{ok}` 关服务端 |
| `socket.status` | 同步 | — | `{ok,listening,port,addresses,clients:[{id,remote}],client:{connected,url}}` |
| `socket.broadcast` | 同步 | data | `{ok,sent}`：**同步立即返回**，`sent`=成功发送的连接数（0=当前无连接） |
| `socket.send` | 同步 | id, data | `{ok}`；指定连接不存在/发送失败返回 `{ok:false,error}` |

> `socket.broadcast` / `socket.send` 为**同步**接口，**直接返回结果对象**（不是 Promise）；发送前请先用 `socket.status().clients` 确认有连接，否则 `sent` 为 0。客户端侧的 `socket.clientSend` 为异步。

**客户端**
| 接口 | 类型 | 入参 | 出参 / 说明 |
|---|---|---|---|
| `socket.connect` | 异步 | url, token? | `{ok,...}`；连其他设备服务端（自动附加 token） |
| `socket.disconnect` | 异步 | — | `{ok}` |
| `socket.clientSend` | 异步 | data | `{ok}` 客户端发送 |

**事件（`webcat.on`）**：`socket.listening{port,addresses}` · `socket.open{id,remote?}` · `socket.message{id,data}` · `socket.close{id,code,reason}` · `socket.error{error}`（客户端事件 `id="client"`）。

```js
const { port, addresses } = await webcat.socket.start({ port: 8000, token: "abc" });
webcat.on("socket.message", e => webcat.socket.broadcast("hi from " + e.id)); // 同步返回 {ok,sent}
webcat.on("socket.open", e => console.log("连入", e.id));
const r = webcat.socket.broadcast("hello");   // 同步：{ok:true, sent:1}
// 另一台设备：ws://<addresses[0]>:8000/?token=abc
```

### 文件传输（走同一条 socket 连接）
| 接口 | 类型 | 入参 | 说明 |
|---|---|---|---|
| `socket.sendFile` | 异步 | `{id?｜broadcast:'*', source, path, name?, chunkSize?}` | 服务端发送：`id` 指定连接，`'*'` 广播给所有连接 |
| `socket.clientSendFile` | 异步 | `{source, path, name?, chunkSize?}` | 客户端发送给服务端 |
| `socket.cancelFile` | 异步 | `fid` | 取消某次传输 |

- **source**：`fs`(私有相对) · `root`(绝对，需全盘权限) · SAF `handle`(授权目录相对) · `uri`(content://)。
- **接收**：默认**自动接收**并落盘到私有 `received/<原名>`（重名追加 `(1)`）；可在 `start`/`connect` 传 `receiveDir` + `receiveTarget`(`fs`相对/`root`绝对/SAF handle) 指定目录。
- `chunkSize` 默认 65536。

**文件事件（`webcat.on`）**
- `socket.fileBegin{from,fid,name,size}` · `socket.fileProgress{fid,name,direction:'send'|'recv',sent,total,percent}`
- `socket.fileReceived{from,fid,name,size,path}`（接收完成，已落盘） · `socket.fileDone{fid,name,direction:'send',size,to}`（发送完成） · `socket.fileError{fid,error}`

```js
// 发送方（服务端）
webcat.on("socket.fileProgress", e => console.log(e.direction, e.percent + "%"));
await webcat.socket.sendFile({ id: "c1", source: "fs", path: "a.bin" });   // 或 broadcast:'*'
// 接收方（任意端）
webcat.on("socket.fileReceived", e => console.log("收到", e.name, e.path));
// 客户端发送
await webcat.socket.clientSendFile({ source: "root", path: "/storage/emulated/0/Download/b.zip" });
```



## webcat.page —— 页面窗口
| 接口 | 类型 | 入参 | 出参 / 说明 |
|---|---|---|---|
| `page.open` | 同步 | `{url\|path, params?}` | `{ok}`；打开新页面窗口（path 相对当前网页根，或 http(s)/file 绝对） |
| `page.params` | 同步 | — | 本页收到的参数 |
| `page.end` | 同步 | — | 关闭当前页面 |

## webcat.store —— 会话共享（同步，仅内存，App 退出即清）
| 接口 | 入参 | 出参 |
|---|---|---|
| `store.set` | key, value | `{ok}` |
| `store.get` | key | `{ok, value}` |
| `store.remove` | key | `{ok}` |
| `store.keys` | — | `{ok, keys[]}` |

## webcat.statusBar —— 状态栏
> 默认：状态栏/底部导航栏由原生**自动避让**，普通页面**无需任何调用，也不要加 padding**（会重复留白）。
> `setAdaptive(true)` 沉浸时原生不再避让、状态栏覆盖页面；仅当顶部有需要完整显示的内容（标题/按钮等）才加 padding，且 `height` 是**设备px**、CSS 要 `height/density`。

| 接口 | 类型 | 入参 | 出参 / 说明 |
|---|---|---|---|
| `statusBar.setColor` | 同步 | color, darkIcon? | 自定义状态栏颜色（`#RRGGBB`/`#AARRGGBB` 或整数），导航栏同色；`darkIcon` 省略时按亮度自动判断 |
| `statusBar.setDarkIcon` | 同步 | darkIcon | `true`=深色图标，`false`=浅色图标 |
| `statusBar.hide` | 同步 | — | 隐藏状态栏（导航栏保留；焦点变化后保持隐藏） |
| `statusBar.show` | 同步 | — | 显示状态栏 |
| `statusBar.setAdaptive` | 同步 | enabled | `true`=沉浸（原生不再避让），`false`=恢复自动避让（默认）。别名 `setOverlay` |
| `statusBar.height` | 同步 | — | `{ok, height, density}`；`height` 为**设备px（非 dp）**，CSS 用 `height/density` |

```js
webcat.statusBar.setAdaptive(true);
const { height, density } = webcat.statusBar.height();
document.querySelector(".app-header").style.paddingTop = (height / density) + "px";
```
> `setAdaptive` 作用于整个预览/打包窗口（含原生顶栏）；导航栏颜色始终跟随状态栏。

## webcat.ui —— 提示（同步）
| 接口 | 入参 | 出参 / 说明 |
|---|---|---|
| `ui.toast` | msg, long? | `{ok}` |
| `ui.vibrate` | ms | `{ok}`；需打包勾选“震动” |

## webcat.flash —— 手电筒（同步，免权限）
| 接口 | 入参 | 出参 / 说明 |
|---|---|---|
| `flash.has` | — | `{ok, has}` 是否有可用闪光灯 |
| `flash.state` | — | `{ok, on}` 当前开/关 |
| `flash.on` / `flash.off` | — | `{ok, on}` 开/关 |
| `flash.toggle` | — | `{ok, on}` 切换 |

> 无需任何权限；相机被占用时返回 `camera_in_use`。页面关闭（release）时自动关灯。

## webcat.volume —— 音量（同步，免权限）
| 接口 | 入参 | 出参 / 说明 |
|---|---|---|
| `volume.get` | `stream?` | `{ok, stream, level, max, percent}` |
| `volume.set` | `level` 或 `{stream, level}` | `{ok, stream, level}` 设绝对档位 |
| `volume.up` / `volume.down` | `step?`（默认 1） | `{ok, level, percent}` 加/减 |
| `volume.getMax` | `stream?` | `{ok, max}` 最大档位 |
| `volume.isMuted` | — | `{ok, muted}` 媒体流是否静音 |
| `volume.setMuted` | `muted` | `{ok, muted}` 静音/取消 |

> `stream` 取 `music`(默认) / `ring` / `notification` / `alarm` / `voice` / `system` / `call`。

## webcat.brightness —— 亮度（同步，免权限）
| 接口 | 入参 | 出参 / 说明 |
|---|---|---|
| `brightness.get` | — | `{ok, value}` 当前窗口亮度 **0~100**，`-1`=跟随系统 |
| `brightness.set` | `value`(0~100；`<0`=跟随系统) | `{ok, value}` 设窗口亮度，立即生效 |

> 仅作用于当前预览/应用窗口，不修改系统亮度（无需权限）；Activity 重建后回默认。

## webcat.biometric —— 生物识别
| 接口 | 类型 | 入参 | 出参 / 说明 |
|---|---|---|---|
| `biometric.isAvailable` | 同步 | — | `{ok, available, reason}`；`reason`=`none`/`no_hardware`/`hw_unavailable`/`none_enrolled`/`security_update_required`/`unsupported`/`unknown` |
| `biometric.authenticate` | 异步 | `{title?, subtitle?, description?, negativeText?, cancelable?, allowDeviceCredential?}` | 成功 resolve `{ok, authenticated:true}`；失败 Reject：`canceled`/`busy`/`no_hardware`/`not_enrolled`/`lockout`/`unavailable`/`error` |
| `biometric.cancel` | 同步 | — | `{ok}` 取消当前认证框 |

> 需打包勾选“生物识别”（`USE_BIOMETRIC`，普通权限，安装即授予、无运行时弹窗）。
> `allowDeviceCredential=true` 时允许 PIN/密码兜底（API30+ 用组合认证器，30 以下用 `setDeviceCredentialAllowed`），此时忽略 `negativeText`；PIN 兜底同样免权限。
> 认证框弹出期间再次调用 `authenticate` 返回 `busy`；页面关闭时自动取消。

```js
// 手电筒
webcat.flash.toggle();

// 音量（媒体流）
webcat.volume.up(1);
const { level, max } = webcat.volume.get();

// 亮度（0~100）
webcat.brightness.set(60);

// 生物识别（可加 PIN 兜底）
if (webcat.biometric.isAvailable().available) {
  try {
    await webcat.biometric.authenticate({ title: "验证身份", allowDeviceCredential: true });
    // 认证通过
  } catch (e) {
    // e.message = canceled / lockout / ...
  }
}
```

## webcat.image —— 图片处理（异步，免权限）
统一输入：`data`（裸 base64 / `data:image/...;base64,...` / http(s) URL）或 `source`+`path`（`fs`/`root`/SAF handle）。
统一输出：默认 `{ok, base64, width, height, size, format}`；给 `name` 则存相册，返回 `{ok, uri, path, width, height, size, format}`。

| 接口 | 入参 | 说明 |
|---|---|---|
| `image.info` | `{data?/source,path?}` | `{ok, width, height, size, format}` |
| `image.compress` | `{..., format:'jpeg'\|'png'\|'webp', quality:0-100, maxWidth?, maxHeight?, output?, name?, path?}` | 压缩（可同时限最大宽高） |
| `image.resize` | `{..., width?, height?, keepRatio?=true, ...}` | 缩放 |
| `image.crop` | `{..., x, y, width, height, ...}` | 裁剪 |
| `image.rotate` | `{..., degrees, ...}` | 旋转 |
| `image.flip` | `{..., horizontal?, vertical?, ...}` | 翻转（不传则默认垂直翻转） |

```js
const { base64 } = await webcat.image.compress({ data: canvas.toDataURL(), quality: 70, maxWidth: 1280 });
await webcat.image.crop({ data: base64, x: 0, y: 0, width: 200, height: 200, name: "avatar.png" });
```

## webcat.media —— 追加（多选 / 视频，免权限）
| 接口 | 类型 | 入参 | 出参 |
|---|---|---|---|
| `media.pickImages` | 异步 | `{format?, maxBytes?, limit?=9}` | `{ok, files:[{name,mime,size,base64?\|uri?\|path?}], truncated}` |
| `media.pickVideos` | 异步 | 同上（mime `video/*`） | 同上 |
| `media.saveVideo` | 异步 | `name, data, path?` | `{ok, uri?, path?}`（存 Movies） |
| `media.playVideo` | 同步 | `{url?/source, path?, title?, live?, orientation?='auto'\|'landscape'\|'portrait'\|'sensor'}` | `{ok}` 打开全屏播放页 |

> 多选走系统文件选择器（SAF，免权限）；`format` 可取 `base64`(默认)/`uri`/`path`，`maxBytes` 仅对 base64 生效。
> `media.playVideo` 播放页为平台播放器：支持本地/`file://`/`content://`/`http(s)` 渐进式（mp4 等），**不支持 HLS/DASH/RTSP/直播**；方向默认按视频有效宽高自动，可传 `orientation` 指定；页内带旋转/退出全屏按钮。

## webcat.sensor —— 传感器（同步/异步流，免权限，无计步）
| 接口 | 类型 | 入参 | 出参 / 说明 |
|---|---|---|---|
| `sensor.has` | 同步 | `type` | `{ok, has}` 是否有该传感器 |
| `sensor.get` | 异步 | `type` | `{ok, values, accuracy, ts}` 读取一次（约 1.5s 超时） |
| `sensor.watch` | 异步流 | `type, {rate?, limit?}, onProgress` | 中间帧 `{values, accuracy, ts}`；达到 `limit` 或 `unwatch` 时 resolve |
| `sensor.unwatch` | 同步 | `type` | `{ok}` 停止监听 |

- `type`：`accelerometer` / `gyroscope` / `magnetometer` / `light` / `proximity` / `pressure` / `orientation`
- `rate`：`normal`(默认) / `ui` / `game` / `fastest`；`values` 为数组（`orientation` 为旋转矢量）
- 是否真有该传感器取决于设备，先 `sensor.has` 判断

```js
if (webcat.sensor.has("accelerometer").has) {
  const p = webcat.sensor.watch("accelerometer", { rate: "ui", limit: 20 }, v => {
    console.log(v.values);
  });
  // await webcat.sensor.unwatch("accelerometer");  // 提前停止
}
```

## 安全限制
- 网页不可访问 WebCatX 自身目录（`/WebCatX/project`、`/WebCatX/cache`）：`ext.list` 命中返回空列表，其余读/写/删/开/分享命中返回“路径受保护，不允许网页访问 WebCatX 目录”；SAF 授权目录不受限。

## 示例
```js
// 私有文件
await webcat.fs.writeFile("data.json", JSON.stringify({a:1}));
const { content } = await webcat.fs.readFile("data.json");

// 压缩 / 解压（私有）
await webcat.fs.zip("js", "backup.zip");
await webcat.fs.unzip("backup.zip", "restore");

// 剪切板 / 系统信息（同步）
const { text } = webcat.clipboard.get();
const info = webcat.sys.info();

// 权限（异步）
const r = await webcat.permission.request(["android.permission.CAMERA"]);
if (r.undeclared.length) { webcat.ui.toast("该权限未在打包时勾选"); }

// 外部跳转
webcat.qq.openProfile("123456");
webcat.browser.open("https://example.com");

// 下载到私有目录
await webcat.download.download("https://x.com/a.png", "fs", "img/a.png");

// 通讯录 / 定位
const { contacts } = await webcat.contacts.list();
const loc = await webcat.location.get();

// 公开目录
if (webcat.ext.isFullAccess().granted) {
  await webcat.ext.writeFile("root", "/storage/emulated/0/Download/a.txt", "hi");
} else {
  webcat.ext.requestFullAccess();
}
const { handle } = await webcat.ext.pickDirectory();
await webcat.ext.writeFile(handle, "data.json", "{}");
```

## 事件订阅 `webcat.on / off`（原生 → JS）
通知点击、悬浮窗交互、媒体会话状态等由原生主动回传。`window.webcat` 异步注入，冷启动事件会在页面就绪后补发。
```js
const off = webcat.on("notify.click", (e) => { /* {id, action?} */ });
webcat.off("notify.click", handler); // 或调用 off()
```
| 事件 | 载荷 |
|---|---|
| `notify.click` | `{id, action?}` 点通知/动作按钮 |
| `notify.dismiss` | `{id}` 划掉通知 |
| `notify.reply` | `{id, text}` 直接回复内容 |
| `float.event` | `{id, event}` 见下 |
| `mediaSession.button` | `{action, position?}` |
| `mediaSession.state` | `{state, position, duration, index, playing}` |
| `mediaSession.trackChanged` | `{index, item}` |
| `mediaSession.ended` | — |

## webcat.notify —— 通知（需打包勾选「通知」）
| 接口 | 类型 | 入参 | 出参 / 说明 |
|---|---|---|---|
| `notify.isSupported` | 同步 | — | `{ok, supported, enabled}` |
| `notify.hasPermission` | 同步 | — | `{ok, granted, undeclared}` |
| `notify.requestPermission` | 异步 | — | 申请 Android 13+ 通知权限（返回 `{granted,denied,undeclared}`）；**Android 13 以下无此运行时权限，直接返回 granted**；打包时未勾选「通知」→ `undeclared`。Android 13 且**目标<33**时系统只在**首次创建通知通道**时弹框（本接口会先建默认通道并轮询等待结果，最长约 15s）；目标≥33 走标准运行时弹窗 |
| `notify.channel.create` | 同步 | `{id, name, description?, importance?, vibration?, silent?, badge?}` | `{ok}`，importance: `none/min/low/default/high` |
| `notify.channel.delete` | 同步 | `id` | `{ok}` |
| `notify.channel.list` | 同步 | — | `{ok, channels}` |
| `notify.show` | 异步 | `{id?, channel?, type?, title?, body?, subText?, bigText?, lines?, image?, largeIcon?, messages?, reply?, progress?{current,max,indeterminate}, ongoing?, autoCancel?, onlyAlertOnce?, silent?, color?, category?, group?, badgeNumber?, actions?[{id,title,reply?}], click?{url?/path?,params?}}` | `{ok, id}` |
| `notify.update` | 异步 | `id, {...}` | `{ok, id}` |
| `notify.cancel` | 同步 | `id` | `{ok}` |
| `notify.cancelAll` | 同步 | — | `{ok}` |
| `notify.active` | 同步 | — | `{ok, ids}` |
| `notify.get` | 同步 | `id` | `{ok, model}` |

- `type`：`basic`（默认）/`bigText`/`inbox`/`bigPicture`/`message`（聊天，可配 `reply`）。
- `smallIcon` 仅支持内置单色资源名或省略（默认应用图标）。
- `actions` 最多 3 个；`reply:true` 为内联回复（回传 `notify.reply`）。
- 需要通知权限/通道；未授权时 `show` 静默失败。

```js
if (!webcat.notify.hasPermission().granted) await webcat.notify.requestPermission();
await webcat.notify.show({ type: "progress", id: 1, title: "下载中", progress: { current: 40, max: 100 }, ongoing: true });
webcat.on("notify.click", e => webcat.ui.toast("点击通知 " + e.id));
```

## webcat.float —— 悬浮窗 / 悬浮球（需打包勾选「悬浮窗」+「前台服务」）
| 接口 | 类型 | 入参 | 出参 / 说明 |
|---|---|---|---|
| `float.isSupported` | 同步 | — | `{ok, supported, granted, undeclared}` |
| `float.hasPermission` | 同步 | — | `{ok, granted, undeclared}` |
| `float.requestPermission` | 同步 | — | 跳系统设置开启悬浮窗权限 |
| `float.open` | 异步 | `{mode?='window'/'bubble', url?/path?, params?, width?, height?, x?, y?, draggable?, resizable?, fullscreen?, focusable?, titleBar?, dragHandle?, cornerRadius?, size?, icon?, panel?, background?, opacity?, touchMode?, hitRects?, hitSelector?, hitForward?, dragThreshold?, snap?, snapThreshold?, snapMargin?, keepInScreen?, moveEvent?, anchor?, gravity?, layoutInDisplayCutoutMode?}` | `{ok, id}` |
| `float.close` / `closeAll` | 同步 | `id?` / — | `{ok}` |
| `float.update` | 同步 | `id, {x?,y?,width?,height?,focusable?,draggable?,fullscreen?,opacity?,background?,touchMode?,touchable?,hitRects?,hitSelector?,hitForward?,dragThreshold?,snap?,snapThreshold?,snapMargin?,keepInScreen?,moveEvent?}` | `{ok}`（`fullscreen:true/false` 全屏/还原） |
| `float.focus` | 同步 | `id` | `{ok}` |
| `float.list` / `get` | 同步 | — / `id` | `{ok, items}/{ok, item}` |
| `float.post` / `broadcast` | 同步 | `id, data` / `data` | 向悬浮窗发消息（其页内收 `float.message`） |
| `float.closeSelf` | 同步 | — | 悬浮窗内关闭自身（`page.end()` 亦可） |
| `float.postToHost` | 同步 | `data` | 悬浮窗内向宿主发消息（宿主 `webcat.on('float.hostMessage')` 接收） |
| `float.setTouchable` | 同步 | `id, touchable` | `{ok}` `true`=整窗可触摸(block)；`false`=整窗穿透(through) |
| `float.setHitRegion` | 同步 | `id, rects` | `{ok}` 设置命中矩形（归一化 0~1，相对窗口内容区）`[{x,y,w,h}]`；`null` 清除 |
| `float.setHitSelector` | 同步 | `id, selector` | `{ok}` 用页面元素选择器自动取包围盒作为命中区（进入 region 穿透模式） |
| `float.syncHit` | 同步 | `id, selector?` | `{ok}` 形状变化后同步一次命中框（`selector` 省略则用已记录的） |
| `float.watchHit` | 同步 | `id, selector?` | `{ok}` 用 `ResizeObserver` 监听元素尺寸变化自动同步命中框 |
| `float.unwatchHit` | 同步 | `id` | `{ok}` 取消命中框自动同步 |
| `float.getPosition` | 同步 | `id` | `{ok, position}` 见下“位置/靠边信息” |
| `float.screen` | 同步 | — | `{ok, screen}` `{width,height,orientation,density,insets}` |
| `float.snapToEdge` | 同步 | `id` | `{ok}` 自定义拖动结束后调用：限制屏内并按 `snap` 吸附，回传 `move`/`snap`；原生拖动/顶栏拖动不需要调用 |

- `float.list`/`get` 会回显交互状态：`transparent`、`touchMode`、`hitForward`、`draggable`、`hitSelector`、`hitRectCount`，便于排查。

- `mode:'bubble'` 为悬浮球：可拖动，点击展开/收起 `panel` 指定的浮窗；**面板复用不重载**（收起只摘视图，再次展开保留页面与上次位置），长按发 `float.event{longPress}` 交 JS 处理。
- `titleBar`：省略/`true`=默认顶栏（圆角裁剪 + 关闭图标）；`false`=**无顶栏**；`{title?, color?, darkIcon?}`=自定义。
- `dragHandle`：`bar`(默认，拖顶栏) / `overlay`(叠加半透明拖动条 + 关闭按钮) / `none`。
- `resizable`：`true` 时右下角出现拖拽手柄，可**手动调整尺寸**；`fullscreen`：`true` 打开即全屏（`float.update(id,{fullscreen:false})` 还原到原位置/尺寸）；仅对 window 生效，**悬浮球忽略 fullscreen**。
- `icon`（bubble）：悬浮球图标，**只能来自用户项目/外部图片**：**项目内相对路径**（如 `icons/chat.png`，按调用页目录解析）/ `file://` / `content://` / `http(s)://`（异步下载）/ `data:`URL；省略或加载失败用内置默认悬浮球图标。
- 悬浮球 `panel` 展开的面板**默认可获焦**（文本框可唤起键盘），可用 `panel:{focusable:false}` 关闭。
- 息屏/亮屏不影响浮窗（挂在前台服务上），但**进程被杀会消失**（建议加电池白名单）。
- 浮窗内是**独立 WebView 页面**，可调用大部分 webcat 能力；`page.params()` 取 `open` 传入参数，`page.end()`/`float.closeSelf()` 关闭本浮窗。
- 浮窗页**不支持**需要 Activity 的接口（`permission.request`/`camera`/`media.pick*`/`scan`/`record`/`contacts`/`location`/`biometric`/`statusBar`/`screen`/`brightness`/`app.quit`），调用会返回「悬浮窗环境不支持」。
- `path` 相对**调用页目录**解析（按调用页 URL 拼接为绝对地址，file:// 与 http(s) 均可）；也允许绝对 `http(s)`/`file://`。
- 事件：`float.event {id, event, x, y, width, height, screenWidth, screenHeight, orientation, edge, dist}`；event 可为 `open/ready/close/move/resize/tap/longPress/snap/orientation/panelOpen/panelClose/message`。`snap` 为吸附完成，`orientation` 为横竖屏/尺寸变化（窗口已自动重定位）。
- 背景透明：`background:'transparent'|'none'`（或颜色）关闭默认白底，同时自动把 WebView 与页面 `html/body` 背景设为透明；`opacity:0~1` 控制整体透明度；宠物建议配 `titleBar:false`。
- `dragHandle`：`bar`(默认) / `overlay` / `none` / **`any`**（整窗拖动，需页面 `pointer-events:none` 或不消费触摸）。
- 吸附：`snap:'edge'|'corner'`，`snapThreshold`(默认 24dp)、`snapMargin`(默认 8dp)、`keepInScreen`（拖出会被限制在屏幕内）；实测靠边位置见事件 `edge` 与 `float.getPosition`。
- 位置/靠边信息：`x/y/width/height/screenWidth/screenHeight/orientation`、`edge`（`left/right/top/bottom/topLeft/topRight/bottomLeft/bottomRight`，未靠边为 `null`）、`dist:{left,right,top,bottom}`（到各边距离，dp）。
- **触摸穿透**（透明处不挡桌面）：系统悬浮窗按窗口矩形命中，无法逐像素穿透。
  - `touchMode:'block'`（默认）：窗口矩形内吃触摸、矩形外穿透；适合“窗口≈可见形状”。
  - `touchMode:'through'`：整窗只显示不吃触摸（完全穿透，但自身也不能拖/点）。
  - `touchMode:'region'`：主窗口不接收触摸（`FLAG_NOT_TOUCHABLE`），另建透明“命中层”盖在命中矩形上；只有命中矩形内可交互，其余（含窗口内透明区）全部穿透桌面。
    - `hitForward:true`（region 默认）：命中层把触摸**按坐标转发进 WebView**，页内点击、按钮、输入、滚动可用。**不建议用页内自绘拖动（有 bug）**；需要拖动请用 `dragHandle` 的原生拖动（`bar`/`overlay`/`any`），或改用 `hitForward:false` 的原生拖动。
    - `hitForward:false`：命中层不转发 DOM，改派发 `float.event` 的 `tap/longPress`（附命中点局部坐标 `hx/hy`，dp）并做**原生拖动**（需 `draggable:true`）；此时页内 DOM 触摸失效，适合纯宠物/纯展示。
  - 命中矩形用归一化 0~1（相对窗口内容区）；窗口 `width/height/x/y` 变化自动换算。设置命中区：`hitSelector`/`setHitSelector`/`syncHit`（原生兜底，页面未就绪也能设）、`watchHit`（`ResizeObserver` + 80ms 检测，可跟随 `transform` 动画，变化才回设）。页面就绪后会自动重设一次；`selector` 未命中发 `float.event{event:'hitError', reason:'selector-not-found'}`，`region` 无命中矩形发 `reason:'no-hit-region'`。
  - `dragThreshold`：拖动判定阈值(默认 5dp)，避免轻点误拖。
- 悬浮窗浮层**非触摸模态**（`FLAG_NOT_TOUCH_MODAL`）：浮窗范围外的主 App 仍可正常点击/滑动。

```js
if (!webcat.float.hasPermission().granted) webcat.float.requestPermission();
// 普通悬浮窗
const { id } = await webcat.float.open({ url: "panel.html", width: 280, height: 400 });
// 桌面宠物：真透明 + 透明处穿透桌面 + 命中区内可点/输入
const { id: pet } = await webcat.float.open({
  url: "pet.html", width: 160, height: 200, titleBar: false,
  background: "transparent",
  touchMode: "region",            // 主窗口不吃触摸，只有命中区可交互
  hitForward: true,               // 命中区触摸转发进页面（页内按钮/输入可用；不要用页面自绘拖动）
  snap: "corner", snapMargin: 8, keepInScreen: true, moveEvent: "live"
});
webcat.float.watchHit(pet, "#pet");   // 命中区=宠物本体（可跟随动画）
webcat.on("float.event", e => {
  if (e.event === "snap") console.log("靠边:", e.edge, e.dist); // 切换宠物朝向
  if (e.event === "orientation") console.log("屏幕:", e.orientation);
  if (e.event === "hitError") console.warn("命中区异常:", e.reason);
});
// 仅自定义拖动结束后才需要：webcat.float.snapToEdge(id);（不建议页面自绘拖动）
```

## webcat.capture —— 录屏 / 内录 / 截图（需打包勾选「前台服务」，内录另需「屏幕采集」权限）
> 基于 MediaProjection。需 **Activity 环境**（悬浮窗内不支持发起授权）。内录（媒体音）与混音需 **Android 10+(API29)**；录屏（无声）API 24+。同一时刻仅一个 capture 会话，且与 `record` 麦克风会话互斥。
| 接口 | 类型 | 入参 | 出参 / 说明 |
|---|---|---|---|
| `capture.isSupported` | 同步 | — | `{ok, screen, mediaAudio, micAudio, mixed, screenshot, preview, h264, aac, foregroundService, fgsMediaProjection}` |
| `capture.hasPermission` | 同步 | — | `{ok, declared, fgsMediaProjection, recordAudio}` |
| `capture.request` | 异步 | — | 弹系统“屏幕/音频捕获”授权 → `{ok, granted}` |
| `capture.state` | 同步 | — | `{ok, running, kind, screen, audio, code, preview, authorized, durationMs}` |
| `capture.startScreen` | 异步 | `{width?,height?,dpi?,bitrate?,fps?(30),audioSource?:'none'\|'media'\|'mic'\|'both',audioMode?:'record'\|'stream'\|'both',muxAudio?(true),micGain?,mediaGain?,audioSampleRate?(48000),audioChannels?(2),audioBitrate?(128000),audioRealtime?,path?,audioPath?,dir?,source?,preview?{fps?(5),scale?(0.5),quality?(70)},detectCodes?{intervalMs?(300),region?{x,y,w,h},formats?,stopOnFirst?,emitFrames?}}` | `{ok, videoPath?, audioPath?}`（预定路径；最终在 `capture.stopped`） |
| `capture.startAudio` | 异步 | `{audioSource?:'media'(默认)\|'mic'\|'both',mode?:'record'(默认)\|'stream'\|'both',sampleRate?(48000),channels?(2),chunkMs?(100),aec?,ns?,agc?,micGain?,mediaGain?,excludeOwn?,usages?,segmentMs?(0=关),path?,dir?,source?}` | `{ok, path?}`；`segmentMs>0` 时分段落盘并发 `capture.segment` |
| `capture.startCode` | 异步 | `{intervalMs?(300),region?{x,y,w,h}(归一化),formats?(['qr_code'...]),stopOnFirst?,emitFrames?,scale?}` | `{ok}` 事件 `capture.code`（命中才发） |
| `capture.screenshot` | 异步 | `{format?:'png'(默认)\|'jpeg',quality?(90),region?{x,y,w,h}(归一化),base64?(false),path?,dir?,source?}` | `{ok, path, width, height, format, size, base64?}` |
| `capture.startPreview` | 异步 | `{fps?(5),scale?(0.5),quality?(70)}` | `{ok}` 事件 `capture.frame` |
| `capture.stop` | 同步 | — | 同步返回 `{ok}`；结束/落盘结果见事件 `capture.stopped{videoPath?,audioPath?,durationMs,size}` |
| `capture.cancel` | 同步 | — | 同步返回 `{ok}`；丢弃本次、删除临时文件 |

- **输出位置**：`source`=`fs`(默认，应用私有) / `root`(绝对路径，需「所有文件访问」) / SAF 目录授权 URI；`path`(完整文件) 或 `dir`(目录+自动名)。默认：视频 `movies/`、音频 `records/`（fs），截图默认进系统相册 `Pictures/`。
- **音频源**：`none`(不录) / `media`(内录) / `mic`(麦克风) / `both`(混音)。内录仅能录 `usage=MEDIA/GAME/UNKNOWN`；DRM/通话/禁止内录的 App 录不到。**无媒体播放时不会报错**：正常录制，只是音频为静音。
- **视频**：H.264，默认 30fps，码率按分辨率自算(4–8Mbps)；录音默认**混入 MP4**（`muxAudio:true`），`muxAudio:false` 时 `audioPath` 单独 WAV。**音频采集/编码失败时仍会产出可播放的（静音）MP4**（发 `partial-source`），不会出现空文件。
- **麦克风**：`audioSource` 含 `mic`（`mic`/`both`）需运行时 `RECORD_AUDIO`（打包勾选「录音/麦克风」）；未授权会先申请。
- **预览**：默认关闭；`preview` 或 `startPreview` 开启后按 `fps` 发 `capture.frame`（JPEG base64，建议 ≤10fps）；JS 慢则丢帧。
- **二维码/条码识别**：`startCode`（只识别）或 `startScreen({detectCodes})`（录像+识别）。原生 ZXing 按 `intervalMs` 采样识别，**命中才发** `capture.code{text,format,ts,region?}`（相同内容 1s 内去重）；`region` 只识别屏幕某区域（省算力）；可 `stopOnFirst`。
- **内录分段**：`startAudio({segmentMs})` 每段落盘为 `…_<n>.wav` 并发 `capture.segment{path,index,durationMs,ts}`，便于边传边播；`mode:'both'` 同时有 `record.data` 实时 PCM 分片。
- **截图**：可 `region` 裁剪、`base64:true` 回传图像数据；**截图不会结束会话**（投影与前台服务保持），需 `capture.stop()` 才释放。
- **授权/会话**：一次授权后，会话内录屏/识别/截图/内录/预览**复用同一 MediaProjection**，不重复弹窗；**必须 `capture.stop()`/`cancel()`** 才释放（`sessionGraceMs=0`，无自动收尾）；之后再用需重新授权。用户从系统“停止共享”→ `capture.error{reason:'projection-lost',fatal:true}`。
- `FLAG_SECURE` 界面录屏/截图会黑屏。
- 事件：`capture.started` · `capture.frame{base64,width,height,seq,ts}` · `capture.code{text,format,ts,region?}` · `capture.segment{path,index,durationMs,ts}` · `capture.progress` · `capture.stopped{videoPath?,audioPath?,durationMs,size}` · `capture.error{error,reason,fatal}`（reason：`unsupported/need-activity/undeclared/permission-denied/projection-lost/partial-source/encoder-unsupported/code-failed/snapshot-failed/publish-failed`；`fatal:false` 表示降级/非中止，如 `partial-source`）；音频实时复用 `record.data`/`record.amplitude`。

```js
if (webcat.capture.isSupported().mediaAudio) {
  await webcat.capture.request();                       // 弹系统捕获授权
  await webcat.capture.startAudio({ audioSource: 'media', mode: 'both', path: 'records/wx.wav' });
  webcat.on('record.data', e => { /* 实时 PCM */ });
  webcat.on('capture.error', e => console.warn(e.reason));
  // ... webcat.capture.stop();   // 同步返回 {ok}；落盘完成看 capture.stopped 事件
}
// 录屏（媒体音+麦克风混音，混入 MP4）
await webcat.capture.startScreen({ audioSource: 'both', path: 'movies/demo.mp4', fps: 30 });
// 录屏 + 同屏识别二维码（命中回调）
await webcat.capture.startScreen({ audioSource: 'none', path: 'movies/demo.mp4',
  detectCodes: { intervalMs: 300, region: { x: 0.2, y: 0.3, w: 0.6, h: 0.4 } } });
webcat.on('capture.code', e => webcat.ui.toast('扫码: ' + e.text));
// 只识别不录像
await webcat.capture.startCode({ intervalMs: 300 });
// 截图（可裁剪 + 回传 base64）
const shot = await webcat.capture.screenshot({ format: 'png', base64: true, region: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } });
// 内录分段（每 10s 一段，逐段回传）
await webcat.capture.startAudio({ audioSource: 'media', mode: 'record', segmentMs: 10000 });
webcat.on('capture.segment', e => { /* e.path 分段文件，可 socket 发送 */ });
webcat.capture.stop();         // 同步返回 {ok}；释放授权（下次需重新授权）
```

## webcat.mediaSession —— 媒体会话 / 后台播放（需打包勾选「前台服务」）
> 原生播放：JS 提供媒体 URI 队列 + 元数据，原生（MediaPlayer + MediaSession）播放；支持锁屏/通知栏/蓝牙/耳机键，前台服务保活后台播放。WebView 内的 HTML5 音频不受此控制。
| 接口 | 类型 | 入参 | 出参 / 说明 |
|---|---|---|---|
| `mediaSession.isSupported` | 同步 | — | `{ok, supported}` |
| `mediaSession.create` | 异步 | `{background?}` | `{ok}` 启动前台服务 |
| `mediaSession.setQueue` | 异步 | `{items:[{url?/source,path?, title?, artist?, album?, art?, duration?}], startIndex?=0, autoPlay?=false}` | `{ok}` |
| `mediaSession.play/pause/stop` | 同步 | — | `{ok}` |
| `mediaSession.next/prev` | 同步 | — | `{ok}` |
| `mediaSession.seekTo` | 同步 | `position` | `{ok}` |
| `mediaSession.setRepeat` | 同步 | `'off'/'one'/'all'` | `{ok}` |
| `mediaSession.setShuffle` | 同步 | `enabled` | `{ok}` |
| `mediaSession.setVolume` | 同步 | `0~1` | `{ok}` |
| `mediaSession.updateMetadata` | 同步 | `{item}` | `{ok}` |
| `mediaSession.getState` | 同步 | — | `{ok, state, position, duration, index, playing, queueLength}` |
| `mediaSession.getQueue` | 同步 | — | `{ok, index, items}` |
| `mediaSession.add` | 异步 | `item, index?` | 追加/插入（index 省略=末尾）；`item` 同 setQueue 单项 |
| `mediaSession.remove` | 同步 | `index` | 移除；删的是当前曲→自动播下一首（末尾则停止） |
| `mediaSession.move` | 同步 | `from, to` | 调整顺序（自动修正当前 index） |
| `mediaSession.jumpTo` | 同步 | `index, autoPlay?=true` | 跳到第 N 首 |
| `mediaSession.clear` | 同步 | — | 清空队列 |
| `mediaSession.getPosition` | 同步 | — | 当前进度快照 `{position,duration,index,state,playing}` |
| `mediaSession.watchPosition` | 异步流 | `interval?(默认500ms), onProgress` | 持续推送进度帧 `{position,duration,index,state,playing}`；`unwatch`/结束 resolve |
| `mediaSession.unwatchPosition` | 同步 | — | 停止进度订阅 |
| `mediaSession.destroy` | 同步 | — | `{ok}` |

- `art`/`items[].art` 支持 base64 / `data:`URL / `file://` 本地路径 / **`http(s)` URL**（异步下载并缓存，通知稍后自动补图）。
- **音频焦点**：短暂中断自动暂停并在恢复时续播；可闪避（duck）时压低音量；永久失去焦点不续播；耳机拔出暂停。
- **事件多页面**：`mediaSession.*` 事件广播给所有已打开页面（各自 `webcat.on` 订阅）；`webcat.audio` 的结束回调只回到发起页。
- `webcat.audio.*` 已统一到同一播放器：单曲播放也具备后台/锁屏控制能力。
- 事件见「事件订阅」；媒体键/锁屏按钮直接驱动原生播放器。

```js
await webcat.mediaSession.create();
await webcat.mediaSession.setQueue({ items: [{ url: "https://x/a.mp3", title: "歌名", artist: "歌手" }], autoPlay: true });
webcat.on("mediaSession.state", s => console.log(s.state, s.position));
```

## 自定义 URL Scheme —— 对外唤起（打包后其他应用可拉起本 App）

**配置**：项目设置（长按 `appConfig.xlt`）→「外部唤起（URL Scheme）」填入如 `myapp`（留空=不启用）。打包时写入 manifest，其他应用/浏览器即可用 `myapp://...` 拉起本 App。

**入站（本 App 接收）**：解析 `myapp://host/path?k=v` 后向页面派发事件：
```js
webcat.on("scheme.open", e => {
  // e = { url, scheme, host, path, params:{k:v} }
});
```
冷启动（App 未运行被拉起）时事件会在页面就绪后补发（无需担心早于 `webcat.on` 注册）。

**出站（本项目跳其他应用）**：页面内 `<a href="weixin://...">` 或调用 `webcat.app.openUri("weixin://...")` 即可跳转其他 App 的 scheme（返回 `{ok,launched}`，无应用时 `{ok:false,error:"没有应用可处理该链接"}`）。不再受 Android 11+ 的 `<queries>` 预检限制。

> 预览端：预览即 WebcatX 这个已安装 App，**无法注册你项目自己的任意 scheme**；仅当配置了 scheme 时，顶栏菜单出现「模拟 Scheme 跳转」，填入 URL 触发页面的 `scheme.open`（仅测页面逻辑，不涉及系统拉起）。

## 权限（打包时勾选，不写死模板）
通知、悬浮窗、前台服务等能力对应的权限在**打包页勾选**后写入 APK manifest；未勾选时相应接口返回引导错误（`undeclared`）。
- 「通知」→ `POST_NOTIFICATIONS`
- 「悬浮窗」→ `SYSTEM_ALERT_WINDOW`
- 「前台服务（悬浮窗/后台媒体播放）」→ 勾选后一并写入 `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_DATA_SYNC` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK`
- 预览端（WebcatX 编辑器）已内置上述权限，可直接调试（悬浮窗需在系统设置里开启开关）。

## webcat.shizuku — Shizuku 特权命令（需打包勾选「Shizuku」）
> 需要用户安装并启动 Shizuku，并在 Shizuku 中授权本应用。ADB/无线调试启动是 shell 权限（UID 2000）；Shizuku 用 root 启动或 Sui/Magisk 后端才是 root（UID 0）。

| 接口 | 类型 | 入参 | 出参 / 说明 |
|---|---|---|---|
| `shizuku.isSupported` | 同步 | 无 | `{ok, supported}` |
| `shizuku.isAvailable` | 同步 | 无 | `{ok, available}` |
| `shizuku.hasPermission` | 同步 | 无 | `{ok, granted}` |
| `shizuku.requestPermission` | 异步 | 无 | `{ok, granted}` |
| `shizuku.openManager` | 异步 | 无 | `{ok}`；打开 Shizuku App |
| `shizuku.info` | 同步 | 无 | `{ok, supported, available, permission, uid, isRoot, isSui, version, preV11}` |
| `shizuku.exec` | 异步 | command, options | `{ok, code, stdout, stderr, timedOut, truncated}` |

`exec` options：`{timeoutMs?, cwd?, env?:[\"K=V\"], encoding?:'utf8'|'base64', maxOutputBytes?}`。
`timeoutMs` 超时毫秒；`cwd` 工作目录；`env` 环境变量；`encoding` 输出编码；`maxOutputBytes` 输出上限。

事件：`shizuku.ready`、`shizuku.dead`。

## webcat.accessibility — 无障碍自动化（需打包勾选「无障碍」并在系统设置开启服务）
> 无障碍不是普通运行时权限；打包只控制服务组件是否启用，用户仍需到系统设置手动开启。Android 13+ 侧载应用可能需要在应用信息中允许“受限设置”。

| 接口 | 类型 | 入参 | 出参 / 说明 |
|---|---|---|---|
| `accessibility.isSupported` | 同步 | 无 | `{ok, supported}` |
| `accessibility.isEnabled` | 同步 | 无 | `{ok, enabled, connected}` |
| `accessibility.openSettings` | 同步 | 无 | 打开系统无障碍设置 |
| `accessibility.info` | 同步 | 无 | `{ok, enabled, connected, canRetrieveWindowContent, canPerformGestures, canTakeScreenshot}` |
| `accessibility.windows` | 异步 | 无 | `{ok, windows:[{windowId,type,layer,active,focused,packageName,className,bounds}]}` |
| `accessibility.currentApp` | 异步 | 无 | `{ok, packageName, className, windowId, bounds}` |
| `accessibility.dump` | 异步 | options | `{ok, nodes, rootNodeId?, truncated}` |
| `accessibility.find` | 异步 | selector, options | `{ok, nodes, truncated}` |
| `accessibility.node` | 异步 | nodeId | `{ok, node}` |
| `accessibility.exists` | 异步 | selector, options | `{ok, exists, node?}` |
| `accessibility.click` | 异步 | target, options | `{ok, clicked, node}` |
| `accessibility.longClick` | 异步 | target, options | `{ok, clicked, node}` |
| `accessibility.setText` | 异步 | target, text, options | `{ok, updated, node}` |
| `accessibility.scroll` | 异步 | target, direction, options | `{ok, scrolled}` |
| `accessibility.global` | 异步 | action | `{ok}`；back/home/recents/notifications/quickSettings/lockScreen/screenshot |
| `accessibility.gesture` | 异步 | points, durationMs | `{ok}`；API 24+ |
| `accessibility.waitFor` | 异步 | selector, options | `{ok, node}`；超时报错 |
| `accessibility.waitGone` | 异步 | selector, options | `{ok, gone:true}`；超时报错 |
| `accessibility.screenshot` | 异步 | options | `{ok, width, height, base64?}`；API 30+ |
| `accessibility.startEvents` | 同步 | options | 开始事件推送 |
| `accessibility.stopEvents` | 同步 | 无 | 停止事件推送 |

`selector`：`{text?, textContains?, viewId?, className?, description?, clickable?, editable?, scrollable?, checkable?, checked?, enabled?, visible?, index?}`。
`text` 精确文本；`textContains` 包含文本；`viewId` 资源 ID；`className` 类名；`description` 内容描述；`index` 多匹配序号；布尔字段用于过滤。
`target`：`{nodeId}` 或 selector；多匹配时可加 `index`。
`dump/find` options：`{packageName?, windowId?, allWindows?, maxDepth?, maxNodes?, maxResults?}`；前三个用于指定窗口，后三个控制返回量。
`waitFor/waitGone` options：`{timeoutMs?, intervalMs?}`；超时和轮询间隔。
`startEvents` options：`{eventTypes?, packageNames?, excludePackageNames?, throttleMs?, includeSource?}`；事件类型、包名过滤、节流和是否附带源节点。
跨 App 操作时在 `options` 传 `packageName` / `windowId` / `allWindows`，否则默认活动窗口可能是 WebCat 自己。
事件：`accessibility.event`、`accessibility.connected`、`accessibility.disconnected`；`event` 负载包含 `eventType/eventTypeName/packageName/className/text/contentDescription/windowId/timestamp/bounds?/source?`。

```js
const s = webcat.shizuku.info(); // {available, permission, uid, isRoot}
if (!s.available) await webcat.shizuku.openManager(); // 未安装/未运行时引导
if (s.available && !s.permission) await webcat.shizuku.requestPermission(); // 弹 Shizuku 授权
const r = await webcat.shizuku.exec("id", { timeoutMs: 10000 }); // {code, stdout, stderr, timedOut, truncated}
```

```js
if (!webcat.accessibility.isEnabled().enabled) webcat.accessibility.openSettings(); // 用户需手动开启
await webcat.accessibility.waitFor({ text: "确定" }, { timeoutMs: 5000 }); // 等待节点出现，最多 5 秒
await webcat.accessibility.click({ text: "确定" }); // 按精确文本点击
const nodes = await webcat.accessibility.find(
  { textContains: "登录" },
  { packageName: "com.example.target", allWindows: true } // 指定目标包，避免拿到 WebCat 自己
);
const tree = await webcat.accessibility.dump({ packageName: "com.example.target", maxNodes: 1000 });
```
