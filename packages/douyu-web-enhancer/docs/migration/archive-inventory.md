# DouyuEx 归档功能索引

最后审计：2026-09-04
归档基线：`archive/douyuEx-2026.06.03.01`，提交 `a6acc60a382e0007272e158bbdc3ff0bb3e0c754`

本文是未来迁移任务的发现入口，不是迁移承诺。审计读取了 `source/src/main.js`、
`source/src/routers/router.js`、各 `source/src/packages/` 注册入口、设置/UI 入口和必要源码；排除了
`dist/`、`node_modules/`、压缩产物、归档包和生成文件。

接口来源、时间字段语义、公开项目对比和后续候选见
[DouyuEx 接口研究与对比](../research/douyuex-api-landscape.md)。

## 证据与字段约定

- **事实**：可直接从归档注册、源码、文案或持久化键确认。
- **推断**：根据源码结构判断的用户价值、依赖或风险，尚未在当前斗鱼验证。
- **待用户确认**：是否仍需要、是否接受行为变化或风险。
- **待实测**：当前 DOM、接口、权限或自然事件样本才能确认。
- **默认/存储**中的“自动”表示归档主流程会注册；“动作”表示点击即执行、没有持续开关；“关”表示
  控件初始未勾选；“未注册”表示源码存在但没有从 2026.06.03.01 主流程到达。
- **处理**只使用“提取 / 窄适配 / 调研 / 放弃”四类建议；最终保留范围由
  [用户决策](user-decisions.md) 决定。

归档的公共能力包括 `DomHook`、`ScriptHook`、`ResponseHook`、`StyleHook`、登录/未登录 WebSocket、
`CClick`、通知和跨平台真实流解析，入口在 `source/src/require/`。它们是依赖索引，不应整包迁移；每个
功能只提取必要部分。

## 体验组合

这里的组合按用户连续体验登记，不按源码目录、接口来源或 package 归属机械分组。同一页面区域、同一
操作路径、共同显示/切换、相互遮挡或必须共同验收的功能，先作为一个体验簇完成盘点、优先级和组合
验收契约；内部仍可保持独立模块、状态所有者和失败隔离，跨 package 实现也仍分别交付。

简短例子：简洁模式的 `chat-layout` 负责聊天区几何，`room-metrics` 负责统计摘要，二者源码和数据源
不同，却在聊天区共同显示并可能互相遮挡。因此验收必须检查“聊天区拉高后统计摘要仍可见”；这不要求
把二者合并为同一模块或让一个功能接管另一个功能的状态。

| 体验组合 | 原子功能 | 组合验收边界 |
| --- | --- | --- |
| `simplified-mode` 简洁模式 | `compact-player`、`chat-decoration-cleanup`、`chat-layout`、`room-metrics` | 双入口、三个独立开关、统计摘要、普通/网页全屏/浏览器全屏、刷新/换房/动态重建与相邻区域保留必须共同成立。 |
| `playback-control-suite` 播放控制 | `volume-wheel`、`video-speed`、`cinema-mode`、`video-sync`、`video-recall`、`prevent-auto-pause`、`video-zoom`、`video-filter` | 入口统一位于播放器近场；功能各自独立启停和清理，不能因共用菜单而合成一个 runtime。 |
| `stream-tools` 直播流工具 | `copy-live-stream`、`audio-only-line`、`popup-multiview`、`enhanced-pip` | 共用真实流解析，但复制、音频、多画面、画中画分别验收；跨平台能力另行授权。 |
| `chat-sending-experience` 弹幕发送体验 | `danmaku-tail`、`chat-memory`、`danmaku-send-check`、`chat-length-extension`、`image-danmaku` | 输入、历史导航、发送回显与失败提示按连续操作路径成组验收；每项仍保持独立 runtime、状态所有者和失败隔离，图片上传不得与纯本地功能合并。 |
| `chat-reading` 弹幕阅读 | `danmaku-collection`、`message-context-*`、`shield-*`、`barrage-speed` | 右键卡片和屏蔽面板可以共享宿主，外部查询、禁言和纯展示必须拆开。 |
| `room-information` 房间信息 | `room-metrics`、`last-live-time`、`bag-info`、`room-vip-expiry`、`anchor-pocket`、`fans-badge-date`、`monthly-spend` | 都是信息增强，但接口、登录要求和页面宿主不同，只组合体验，不合并实现任务。 |
| `daily-automation` 每日自动化 | 本包 `daily-sign-in` 的已选 `sign-*`、等级奖励领取；现有 `packages/auto-fans-continue` | 共享调度、按任务锁、运行账本、审计日志、toast 和统一配置页；自动荧光棒整套并入且只以现有 package 为基准。原子请求仍单独授权、判定和验收。 |
| `live-automation` 直播自动化 | `auto-welcome`、`keyword-mute`、`keyword-reply`、`gift-thanks`、`treasure-auto`、`chat-vote` | 共用弹幕 WebSocket，但账号动作、频率和权限不同，必须独立任务；共享连接只能在多个功能确认保留后再设计。 |

## A. 当前已有迁移契约

| ID / 用户价值 | 归档源码与入口 | 默认 / 持久化 | 接口、依赖与当前失效点 | 建议 / 优先级 / 独立验收边界 |
| --- | --- | --- | --- | --- |
| `compact-player`：隐藏礼物展示栏、扩大播放器 | `packages/Refresh/Refresh_Video.js`；播放器菜单“隐藏礼物栏”+ 播放区悬浮快捷开关 | 关；`localStorage.ExSave_Refresh.video` | DOM/样式；依赖 ExPanel 浮动宿主和全屏状态；**待实测**动态重建与两类全屏 | 窄适配；P0；两入口反馈一致，三种页面模式及同页恢复通过。 |
| `chat-decoration-cleanup`：隐藏粉丝牌、贵族等前缀 | `packages/Refresh/Refresh_Barrage.js`；弹幕工具栏“前缀” | 关；`ExSave_Refresh.barrage` | CSS 选择器；**待实测**新消息类型和系统消息误伤 | 窄适配；P0；正文/昵称/图片表情保留，入口、刷新与重建恢复正确。 |
| `chat-layout`：隐藏榜单/活动并拉高弹幕区 | `packages/Refresh/Refresh_BarrageFrame.js`；弹幕工具栏“拉高” | 关；`ExSave_Refresh.barrageFrame` | DOM/几何；依赖房间统计保留；**待实测**全屏、SC 和活动区域变化 | 窄适配；P0；实际高度、相邻摘要和所有开关组合通过。 |
| `room-metrics`：礼物、贵宾与已播/已观看时间摘要 | `packages/RealAudience/RealAudience.js`；排行榜顶部统计条，点击打开 doseeing 房间页 | 自动；运行时房间数据不持久化 | 斗鱼 `show_time`/`todayWatch`、`www.doseeing.com`；2026-09-04 用户批准移除失效人数指标，保留礼物、页面贵宾和归档版时间轮换，各来源独立降级；**待实测**新版成功样本与换房 | 窄适配；P0；礼物失败不遮蔽贵宾或时长，换房、重建和排行榜隐藏状态通过。 |
| `danmaku-availability`：特殊时期恢复飘屏弹幕 | 归档 `packages/ShowDanmaku/ShowDanmaku.js`；当前 `src/features/danmaku-availability.ts` 在 document-start/MAIN_WORLD 改写动态内联 script 与 `/betard` responseText 中精确 `player_barrage:0`；控制中心“弹幕”分区提供只读状态 | 自动；无持久化设置；pagehide 恢复 | 只覆盖转义 JSON/普通 JSON；不抓取或重放外链；状态卡区分 Hook 安装、官方已允许、实际恢复和降级/异常；普通页只有 `1`，缺特殊时期 `0` 样本 | verifying；P1；纯替换、双 DOM 方法、目标/非目标 XHR、幂等/清理/降级已自动化，真实特殊限制保持长期自然验证。 |
| `daily-sign-in`：聚合每日任务 | `packages/Sign/Sign.js`；ExPanel 签到图标，单击仅开播房间、长按全部 | 动作；无统一存储 | 多个账号请求、跨子域与旧活动接口；详见 H 表 | 调研；优先级待全量筛选及跨 package 评估；只作为体验组合，原子请求逐项验收，部分成功不得伪装全部成功。 |

## B. 页面壳、导航与只读信息

| ID / 用户价值 | 归档源码与入口 | 默认 / 持久化 | 接口、依赖与当前失效点 | 建议 / 优先级 / 独立验收边界 |
| --- | --- | --- | --- | --- |
| `extension-entry-shell`：精灵球、工具条、右侧面板及播放器菜单 | `ExIcon/`、`ExPanel/`、`VideoTools/VideoToolbarMenu/`；礼物栏、播放器控制栏 | 自动；无 | DOM；所有高频入口依赖它；**待实测**礼物栏隐藏和工具栏重建 | 提取；P0；入口可发现、关闭/悬停、焦点、重建、简洁模式浮动宿主通过。 |
| `page-cleanup`：隐藏广告、引导、二维码和冗余浮层 | `RemoveAD/RemoveAD.js`；无开关 | 自动且无法停用；无 | 大型 CSS 选择器表；与 `shield-enter`、简洁模式、SC 层级交叉；大量选择器可能过期 | 窄适配；P1；拆成语义规则并逐条证明目标隐藏、相邻功能保留、停用恢复。 |
| `message-badge-cleanup`：隐藏私信/聊天角标提醒 | `RemoveAD/RemoveMsgNotice.js`；私信框内“关闭角标提醒” | 关；`ExSave_isRemoveMsgNotice` | CSS；入口只在特定私信面板存在 | 窄适配；P3；两个角标目标、入口重建与停用恢复。 |
| `no-login-overlay-cleanup`：移除未登录遮罩 | `NoLogin/NoLogin.js`；无入口 | 自动；无 | DOM/CSS；可能改变站点登录提示；**待用户确认**是否保留 | 调研；P3；未登录页仍可观看且不破坏登录入口。 |
| `night-mode`：旧版页面夜间配色 | `Night/Night.js`；页头日/月按钮 | 关；`localStorage.ExSave_Mode` | 巨型 CSS、iframe 同步；源码对 `live-next-body` 直接退出，说明新版已不工作 | 调研；P2；先截图确认仍有价值，再用小范围主题 token，覆盖弹窗和恢复。 |
| `follow-list`：关注列表只显示在播、展示开播时长、点击/长按打开 | `FollowList/FollowList.js`；页头关注下拉 | 自动；`GM.Ex_LoadInCurrentPage` 默认 false | 登录态 `follow/list`；长按依赖多画面；**待实测**新版下拉重建 | 窄适配；P2；默认新页、可选当前页、中键与长按互不冲突，失败保留原列表。 |
| `last-live-time`：未开播时显示上次开播时间 | `LastLiveTime/LastLiveTime.js`；播放器内自动卡片，可关闭 | 自动；无 | 从页面 HTML 取 `show_status/show_time`，最多轮询 180 次；字段和 `.LastLiveTime` 可能失效 | rejected；当前斗鱼离线房间已提供足够的上次直播时间，不再重构离线播放器画面；如仍有广告问题另建窄范围清理功能。 |
| `bag-info`：背包礼物过期天数、总价值和亲密度 | `BagInfo/BagInfo.js`；打开背包时增强头部和礼物项 | 自动；无 | 登录态背包 API、动态 DOM；与危险的 `bag-clear-all` 同文件 | 窄适配；P2；只读数据与礼物项一一对应，重复打开不重复插入，失败不触发赠送。 |
| `room-vip-expiry`：VIP 五天内到期提醒 | `RoomVip/RoomVip.js`；背包入口附近自动提示 | 自动；阈值常量 5 天 | 登录态 HTML `effect_list`、固定 property id；接口/结构可能失效 | 调研；P3；仅匹配当前房间的 VIP，日期边界与无权限失败安全。 |
| `anchor-pocket`：粉丝牌弹窗展示主播口袋活动 | `CheckAnchorPocket/CheckAnchorPocket.js`；粉丝牌面板自动追加 | 自动；仅内存按日缓存 | `getBindGroup`/`fsjk` 类接口；活动很可能过期 | 放弃候选；P3；若保留须先证明当前活动仍存在并有自然样本。 |
| `fans-badge-date`：粉丝牌列表显示获得日期 | `FansBadgeList/FansBadgeList.js`；专用 `getFansBadgeList` 页面路由 | 自动（仅该路由）；无 | 依赖特定账号页面 DOM；路由可能已下线 | 调研；P3；日期来源、列表对应和无牌账号实测。 |
| `monthly-spend`：用户卡片展示当月消费 | `MonthCost/MonthCost.js`；右键弹幕用户卡片 | 自动；无 | 外部/斗鱼数据查询与弹幕 DOM；涉及账号消费隐私 | 调研；P3；**待用户确认**隐私边界，数值来源和空状态实测。 |
| `account-switching`：保存、切换、删除多个斗鱼账号 | `AccountList/` + `routers/router.js` passport/msg/yuba/video/cz 路由；页头账号下拉 | 旧版页面自动；GM `Ex_accountList*` | `GM_cookie`、跨子域 iframe、删除/重建 Cookie；高账号风险且 beta 直接禁用 | 放弃候选；P3；必须单独授权，不能迁移 Cookie 数据；沙箱账号端到端验收。 |
| `weekly-star-prompt`：每周 GitHub 收藏提醒 | `WeeklyPanel/WeeklyPanel.js`；全屏弹层 | 每周自动；`localStorage.Ex_WeeklyPanel_NextTime` | 外部 GitHub 链接；打扰主体验 | 放弃；P3；若用户反向要求保留再建任务。 |
| `upstream-update-check`：检查旧 DouyuEx 更新 | `Update/Update.js`；启动检查+ExPanel 图标 | 自动；无 | `douyuex.com`、GreasyFork，指向旧项目且会打开旧安装页 | 放弃；P3；新包发布链另行实现，不复用旧源。 |
| `settings-reset`：清理 DouyuEx 保存数据 | `Reset/Reset.js`；GM 菜单确认后清理 | 动作；删除本地/GM 键 | 数据删除；旧版按前缀/已知键处理 | 提取；P2；只删除本包命名空间、二次确认、列出影响、可重新初始化。 |
| `diagnostic-banner`：控制台版本提示和使用统计 | `Console/Console.js`、`Statistics/Statistics.js`、`Menu/Menu.js` | 自动；无 | 统计模块当前源码很小但 metadata 标记 tracking；价值有限 | 放弃统计、保留本地诊断；P3；不得外发数据。 |

## C. 播放控制与媒体处理

| ID / 用户价值 | 归档源码与入口 | 默认 / 持久化 | 接口、依赖与当前失效点 | 建议 / 优先级 / 独立验收边界 |
| --- | --- | --- | --- | --- |
| `volume-wheel`：在音量控件滚轮调节 5% | `VolumeMouseScrolling/VolumeMouseScrolling.js`；原音量按钮 | 自动；写斗鱼自身音量键 | video/固定哈希类；新版类名很可能变化 | 窄适配；P1；每格 5%、边界/静音/UI 同步、停用后滚轮恢复页面默认。 |
| `video-speed`：直播播放速度调节 | `VideoTools/VideoSpeed/`；播放器控制栏 | 动作/瞬时状态；无 | HTMLVideoElement；斗鱼回看直播官方已有多档速度 | rejected；用户不需要增强版，不迁移。 |
| `cinema-mode`：影院布局 | `VideoTools/Cinema/`；播放器近场按钮 | 关；无 | DOM/CSS 布局；可能与官方网页全屏重叠 | 调研；P2；先确认与官方模式差异，几何和退出恢复通过。 |
| `video-sync`：将直播追到最新时间点 | `VideoTools/VideoSync/`；“同步时间”按钮 | 动作；无 | video buffered/currentTime | 提取；P1；播放/暂停、无缓冲、重复点击和提示。 |
| `prevent-auto-pause`：写入斗鱼防挂机标志，避免自动暂停 | `ExpandTool/ExpandTool_TabSwitch.js` 的 `enableIgnoreAutoPause()`；无入口 | 自动写 `localStorage.freetimed=1` | 依赖斗鱼私有存储键；语义可能已失效，且没有停用 | 调研；P1；先用真实后台/前台行为证明必要性，再提供独立开关和恢复。 |
| `video-recall`：方向键前后跳转 3 秒追看片段 | `VideoTools/VideoRecall/VideoRecall.js`；页面按 ←/→，输入中禁用 | 自动；无 | video `currentTime` + 全局 keydown；直播是否允许回看取决于缓冲 | 提取；P1；输入焦点不劫持、边界、无缓冲、停用移除监听。 |
| `video-zoom`：局部放大直播画面 | `VideoTools/VideoZoom/VideoZoom.js`；播放器交互 | 动作；无 | CSS transform/鼠标事件；与全屏、滤镜交叉 | 提取；P2；缩放中心、拖移、全屏和重置无残留。 |
| `video-filter`：亮度/对比度/饱和度/镜像/旋转/全景 | `VideoTools/VideoFilter/`；播放器 DouyuEx 菜单“画面滤镜” | 关；无 | CSS filter/transform，`PanoramaVideo`/three.js；全景依赖远程库 | 窄适配普通滤镜；全景独立调研；P2；每项可重置，组合顺序、全屏和性能通过。 |
| `joysound-enhancement`：启停独立 Joysound 音效脚本 | `VideoTools/Joysound/Joysound.js`；播放器菜单“Joysound 音效” | 外部脚本存在时读取其状态；`Ex_isJoysound` 由外部脚本管理 | 调用页面全局 `enable/disableJoysound`；未安装时打开旧远程脚本 | 放弃；P3；不引入运行时远程代码，若需要音效应在本包另行设计。 |
| `camera-capture`：截图和长按录制 GIF | `VideoTools/Camera/Main/` 与 `Camera/Video/`；播放器按钮；可选 7 天隐藏 | 自动显示；`ExSave_Camera_Hidden` | canvas、gif.js、下载；跨域画面可能污染 canvas；用户已有“关闭”诉求 | 放弃候选；P3；**待用户确认**永久不迁移还是提供永久隐藏。 |
| `streamer-metadata`：显示主播 CPU/GPU/设备/系统/场景 | `VideoTools/MetaData/`；播放器面板 | 动作；无 | 依赖直播流 metadata/真实流；字段可能不存在 | 调研；P3；自然样本中字段准确且空字段不占位。 |
| `copy-live-stream`：复制当前斗鱼真实直播流 | `CopyRealLive/` + `require/RealLive/Douyu/`；标题区与播放器菜单 | 动作；无 | `GM_xmlhttpRequest`、斗鱼加密签名、剪贴板；接口易变 | 调研；P2；清晰度选择、过期链接提示、失败无剪贴板污染。 |
| `audio-only-line`：切换到音频流降低带宽 | `AudioLine/AudioLine.js`；标题区与播放器菜单 | 动作；无 | 依赖 `copy-live-stream` 解析与 PopupPlayer 音频实例；会暂停原视频 | 调研；P2；切换/返回、音量、后台播放和失败恢复。 |
| `enhanced-pip`：带弹幕、发送、刷新、低功耗和设置的画中画 | `VideoTools/PictureInPictureControl/`；播放器菜单，可选原生/增强 | 默认使用面板默认值；`ExSave_PipSet` | Document Picture-in-Picture、弹幕 WS、发送接口、多事件清理；浏览器要求高 | 调研；P3；必须独立史诗任务，配置、窗口生命周期、发送、回退和功耗分别验收。 |
| `popup-multiview`：同页多窗口播放斗鱼/虎牙/B站或自定义流 | `PopupPlayer/` + `require/RealLive/*`；ExPanel“同屏播放”、关注列表长按 | 动作；无 | flv.js、跨平台 API、跨域、iframe、拖拽；外部权限面大 | 调研；P3；平台分别授权和验收，单窗口失败不影响主播放器。 |
| `video-download`：斗鱼视频页下载视频/复制 m3u8 | `DyVideoDownload/DyVideoDownload.js`、`apis.js`；`v.douyu.com/show/` 下载按钮 | 动作；无 | 视频 API、M3U8、剪贴板、Blob；2GB 限制和接口变化 | 调研；P3；小样本下载、取消、错误和内容变化检测。 |
| `video-danmaku-export`：视频页导出 XLSX/ASS 弹幕 | `DyVideoDownload/DyVideoDownload.js` + `require/ASS/`；下载面板 | 动作；无 | 弹幕分页 API、xlsx 远程库、文件下载 | 调研；P3；分页完整、编码/时间轴正确、无聊天隐私泄露。 |
| `video-danmaku-heatmap`：视频弹幕高能进度条 | `DyVideoDownload/DyVideoBarrageLine.js`；视频页自动加载 | 自动（仅视频页）；无 | 视频弹幕 API/进度条 DOM | 窄适配；P3；峰值算法、进度同步、失败提示和页面切集。 |
| `video-absolute-time`：视频进度预览同时显示原直播日期时间 | `VideoTime/VideoTime.js`；视频页进度条悬浮预览 | 自动（仅视频页）；无 | 视频详情 API + 多层 Shadow DOM；页面组件很可能已变化 | 窄适配；P2；切集、预览秒数、时区/日期换算和 observer 清理。 |

## D. 弹幕编辑、收藏与右键卡片

| ID / 用户价值 | 归档源码与入口 | 默认 / 持久化 | 接口、依赖与当前失效点 | 建议 / 优先级 / 独立验收边界 |
| --- | --- | --- | --- | --- |
| `danmaku-tail`：发送前自动添加自定义前/后缀 | `DanmakuTail/`；输入区工具栏图标+面板 | 关；`ExSave_DanmakuTail` | 归档版直接拦截输入框 Enter 和发送按钮，动态重建会丢监听 | deferred；不单独迁移归档实现。后续与用户自定义的 WebSocket Hook 发送功能共同深化，届时重新冻结插入时机、发送语义与验收边界。 |
| `chat-memory`：用上下方向键恢复最近提交的弹幕 | `ChatTools/ChatMemory/`；输入框首/尾位置按 ↑/↓ | 归档为自动、仅内存、最多 200 条；新契约为每房间本地持久化 | 归档在 Enter/点击时无条件记录，会收入空内容，丢草稿且动态重建会丢监听 | 已实现，待实机；P2；保留提交时入库，过滤空内容，委托事件覆盖重建并恢复草稿；每房间 200 条，LRU 保留 50 个房间；不依赖发送检测。 |
| `message-plus-one`：右键弹幕后一键复读文本/图片标记 | `BarragePanel/BarragePanel_Tip.js`；原评论浮层“+1” | 自动；无 | 直接调用发送函数；图片分支依赖 `image-danmaku`，会产生账号发言 | 调研；P3；文本与图片拆分、发送前确认/频控和服务端结果。 |
| `chat-length-extension`：把原 50 字限制增至 70 | `RemoveChatLengthLimit/ChangeDanmakuLengthLimit.js`；无入口 | 自动；无 | 改按钮 class/maxLength；服务端限制可能不同 | 调研；P2；先测当前服务端/客户端限制，超限反馈真实，不仅验证属性。 |
| `danmaku-collection`：云收藏满后本地无限收藏并搜索 | `DanmakuCollect/` + `ResponseHook`；原收藏弹窗内搜索 | 自动；`ExSave_DanmakuCollect` | 改写收藏 query/add/del 响应；可能污染全局 XHR，DOM 选择器易变；归档将所有添加失败误当云收藏满 | deferred；P3；用户 2026-09-27 确认因复杂度暂缓，不进入近期排期。未来重启须区分本地/云项和失败原因，并验证增删/搜索/重开及 Hook 可撤销、不改无关响应。 |
| `image-danmaku`：上传图片并用标记在插件用户间显示 | `ImageDanmaku/`、`BarragePanel/`；输入区上传图标和消息渲染 | **未注册**；无 | 鱼吧预签名、douyucdn 上传、DOMPurify、私有标记；外部上传与内容风险 | 放弃候选；P3；若保留须单独确认上传、可见性和内容边界。 |
| `message-context-info`：右键卡片补粉丝牌、房管/贵族/等级 | `BarragePanel/BarragePanel.js`；原弹幕右键面板 | 自动；无 | 从最近弹幕克隆信息；哈希类名极易失效 | 窄适配；P2；不同消息类型、同名用户和动态卡片不串数据。 |
| `message-context-reply`：一键把“@用户：内容”填入输入框 | 同上；右键面板“回复” | 自动；无 | 只写输入框；依赖 card 解析 | 提取；P1；textarea/contenteditable、光标/特殊字符、只填充不自动发送。 |
| `message-context-search`：跳转外站查用户弹幕 | 同上；“查弹幕” | 自动；无 | `www.doseeing.com`、旧 `fz996.com` 代码；会发送昵称并打开外站 | 放弃候选；P3；**待用户确认**数据披露后再调研。 |
| `message-context-mute`：按 1 分钟至 360 天禁言 | 同上；“禁言”+时长选择 | 自动；无 | 账号管理接口；高风险外部影响 | 调研；P3；必须房管账号单独授权、确认对象/时长和成功回读。 |
| `shield-danmaku-background`：隐藏彩色/特殊弹幕背景 | `Shield/RemoveDanmakuBackground.js`；归档版曾放在斗鱼屏蔽面板；当前样本见 [特殊弹幕背景屏蔽调研](../research/danmaku-background.md) | 关；`ExSave_isRemoveDanmakuBackground` | 本质是 CSS 选择器规则集；2024-03 至 2025-11 历史多次因哈希 class、贵族/自定义背景和图片前缀变化而修正，并曾误伤整条弹幕或钻粉彩字；2026-09 单条实机样本由内联 PNG/WebP 与独立左右装饰图组成 | P1 高优先级多类型样本采集，暂停实现（用户 2026-09-27 确认）；待排除头像、表情、图片正文与彩字误伤后再窄适配。未来入口为脚本默认控制中心独立开关，不融入斗鱼原生面板；只清除经证明的背景/装饰属性，并验证停用恢复。 |
| `shield-plugin-images`：屏蔽 DouyuEx 图片弹幕 | `Shield/RemoveDanmakuImage.js`；屏蔽面板 | 关；`ExSave_isRemoveDanmakuImage` | 依赖 `image-danmaku` 标记 | 放弃随图片功能；P3；仅在图片弹幕保留时迁移。 |
| `shield-entry-messages`：隐藏进场消息 | `Shield/RemoveEnter.js` + `RemoveAD` CSS 变量；屏蔽面板 | 关；`ExSave_isRemoveEnterBarrage` | `#js-barrage-extend-container`；与通用去广告规则冲突 | 窄适配；P2；只影响进场消息，礼物/系统消息和开关恢复正确。 |
| `shield-repeated-danmaku`：按时间窗屏蔽重复弹幕 | `Shield/RemoveRepeatedDanmaku.js` + ScriptHook；屏蔽面板 | 关；启用与秒数键 | 前置脚本 Hook、消息归一化；可能误伤同文不同用户 | 调研；P2；时间窗边界、内存上限、系统消息与停用清理。 |

## E. WebSocket 展示与直播自动化

这些功能在归档中共用 `LiveTool/LiveTool.js` 创建的未登录弹幕 WebSocket。共享连接是**源码事实**，
不是必须沿用的架构。涉及发送、禁言、自动回复或领奖的项必须独立确认。

| ID / 用户价值 | 归档源码与入口 | 默认 / 持久化 | 接口、依赖与当前失效点 | 建议 / 优先级 / 独立验收边界 |
| --- | --- | --- | --- | --- |
| `barrage-speed`：显示每分钟弹幕速度 | `LiveTool/BarrageSpeed/`；弹幕区统计文字 | 自动；无 | 未登录 WS 消息计数；协议可能变化 | 提取；P2；采样窗、断线/换房、空闲归零和销毁。 |
| `danmaku-send-check`：检查自己弹幕是否真正出现 | `LiveTool/BarrageSendCheck/`；发送后在弹幕项后标记 | 自动；新实现本地保存有限观察事件 | 归档实际以未登录 WS 中的用户名更新“最后消息”，再与 DOM `.is-self` 项延迟 300ms 比较；同名、并发和页面延迟可误报 | `0.6.0` 匿名检测已经用户实测，`0.7.0` 改为 IndexedDB 主存储、`localStorage` 回退并迁移旧 GM 记录；P2；不用 UID/Cookie/Token；公共流覆盖完整 2 秒且本人 DOM 匹配行存在时才产生 `suspected` 行标记，否则只记 `unconfirmed`；迟到恢复行并更正，重复文本按 FIFO 次数配对。 |
| `live-rank-value`：显示贡献榜贡献值 | `LiveTool/RankList/`；排行榜节点 | 自动；无 | WS 排名消息+DOM | 调研；P3；榜单更新、隐藏排行榜和匿名数据。 |
| `live-notice`：开播系统通知 | `LiveTool/LiveNotice/`；Notification 点击回房 | **处理函数注册但初始化未注册**；无 | 浏览器通知+WS；没有完整 UI/授权流程 | 调研；P3；通知权限、去重、关闭和多房间语义先确认。 |
| `auto-welcome`：按规则自动欢迎进场用户 | `LiveTool/Enter/`；直播间工具面板 | 关；`ExSave_Enter/isEnter/LastEnterWord` | WS + 自动发送弹幕；频率/账号风险 | 调研；P3；单独授权、速率限制、白名单、停用立即停止。 |
| `keyword-mute`：匹配关键词自动禁言 | `LiveTool/Mute/`；直播间工具面板 | 关；`ExSave_Mute/isMute` | WS + 房管接口；对他人产生外部影响 | 调研；P3；规则预览、确认、审计日志、误杀回退。 |
| `keyword-reply`：匹配关键词自动回复 | `LiveTool/Reply/`；直播间工具面板 | 关；`ExSave_Reply/isReply/ReplyCd` | WS + 自动发送；反刷屏/账号风险 | 调研；P3；冷却、命中、循环回复防护与停用。 |
| `gift-thanks`：收到礼物后自动致谢 | `LiveTool/Gift/`；直播间工具面板 | 关；`ExSave_Gift/isGift` | WS + 自动发送；礼物协议/合并消息变化 | 调研；P3；合并窗口、模板、频控、匿名礼物和停用。 |
| `barrage-loop`：按列表循环/随机/变色发送弹幕 | `BarrageLoop/`；ExPanel“弹幕发送小助手”，面板内开始开关 | 关；`ExSave_BarrageLoopOptions` | 自动发送、点击颜色 UI、可选外部“舔狗”文本；账号/反检测风险 | 放弃候选；P3；除非用户明确要求，并限制频率、时长、来源和停止可靠性。 |
| `treasure-auto`：半自动抢直播间宝箱/红包 | `ExpandTool/ExpandTool_Treasure.js` 提供扩展面板开关/延迟，`LiveTool/Treasure/` 处理 WS 与验证码 | 关；`ExSave_Treasure` | `socketProxy`/WS、`pcapi.douyucdn.cn`、token、Geetest；高账号/反自动化风险 | 放弃候选；P3；除非用户明确要求并接受验证码/封控风险。 |
| `chat-vote`：用弹幕关键词发起限时投票 | `LiveTool/Vote/`；直播间工具面板，主题/选项/时限 | 关；`ExSave_Vote` | WS；主要本地统计，无账号写入（除提示） | 窄适配；P3；一人多票规则、时间窗、结果面板和断线。 |

## F. 扩展工具与账号动作

| ID / 用户价值 | 归档源码与入口 | 默认 / 持久化 | 接口、依赖与当前失效点 | 建议 / 优先级 / 独立验收边界 |
| --- | --- | --- | --- | --- |
| `block-p2p-upload`：阻止 WebRTC/P2P 上传 | `ExpandTool/ExpandTool_P2P.js`；扩展面板复选框，启动早期 Hook | 关；`ExSave_P2P` | 替换 `RTCPeerConnection`；可能影响播放器和其他页面 WebRTC | 调研；P2；网络证据、播放回退、停用/刷新语义和权限说明。 |
| `auto-web-fullscreen`：定位真实播放器并按全局记忆恢复网页全屏 | `ExpandTool/ExpandTool_FullScreen.js`；归档扩展面板复选框 | **用户确认默认启用**；GM `douyu-web-enhancer:auto-web-fullscreen` 全局 boolean，缺失为 true | `12306` 样本实测：`#js-player-controlbar` 的 right 容器中双对角角箭头 `i.icon-c8be96` 点击后出现 `.toggle__P8TKM`、`body.is-fullScreenPage` 且播放器铺满视口；相邻四角图标是浏览器全屏，`.msrceen-*` 不是目标 | 窄适配；P2；四次有界几何纠偏后才视为定位完成，控制栏 SVG 图形签名限定一次进入尝试，稳定手动进/退写全局记忆；点击后必须验证标记和布局。与 `compact-player` 组成 `player-arrival-fullscreen` 验收簇。 |
| `highest-quality`：自动选择最高画质 | 同上；扩展面板复选框 | 关；`ExSave_HighestVideoQuality` | 点击画质菜单；登录/VIP/线路差异 | 窄适配；P1；可用档位中选最高，失败不循环点击，用户手动选择优先级明确。 |
| `tab-keepalive`：防后台页签冻结/防切走暂停 | `ExpandTool/ExpandTool_TabSwitch.js`；扩展面板 | 关；`ExSave_TabSwitch` | visibility/focus 等页面 API Hook；和 `prevent-auto-pause` 重叠 | 调研；P2；先合并需求定义但分别测冻结和自动暂停，避免重复 Hook。 |
| `room-red-packet`：自动抢房间礼物红包 | `ExpandTool/ExpandTool_RedPacket_Room.js`；扩展面板 | 关；`ExSave_RedPacket_Room` | 登录态红包列表/领取 API；账号/反自动化风险 | 放弃候选；P3；必须单独授权和当前接口调研。 |
| `auto-fishing`：粉丝活动自动钓鱼/收杆 | `ExpandTool/ExpandTool_AutoFish.js`；扩展面板 | 关；`ExSave_AutoFish` | 多个 `actfans/fishing` 接口和时间窗；活动可能过期 | 放弃候选；P3；先证明活动仍存在。 |
| `bag-send-selected`：按礼物 ID/数量送背包礼物 | `ExpandTool/ExpandTool_ClearBag.js`；扩展面板表单 | 动作；无 | 背包/送礼接口；真实资产操作 | 调研；P3；每次确认目标房间、礼物、数量，成功回读。 |
| `fans-badge-renewal`：向全部粉丝牌房间分配荧光棒续牌 | `FansContinue/FansContinue.js`；ExPanel“一键续牌”，输入每房数量或 0 平均 | 动作；`ExSave_FansContinue` 只保存数量 | 读取背包/粉丝牌并跨房批量送礼；真实资产和关注数据；产品层需与独立 `auto-fans-continue` 对照 | 调研；优先级待跨 package 评估；必须单独授权，预览房间/总数后再确认，逐房回读且可中止。 |
| `bag-clear-all`：把背包全部礼物送到当前房间 | `BagInfo/BagInfo.js`；背包头部“清空背包”+确认 | 动作；无 | 批量真实资产操作；名称易误解为删除 | 放弃候选；P3；若保留必须改清晰文案并强确认，不能与 `bag-info` 同任务。 |
| `send-gift-by-id`：按 ID/数量/间隔送礼 | `ExpandTool/ExpandTool_SendGift.js`；扩展面板 | 动作；无 | `japi/gift/donate`；真实资产/付费风险 | 放弃候选；P3；仅在用户明确需求和逐次确认后调研。 |
| `phantom-mode`：把自己消息/礼物视觉改成高等级效果 | `ExpandTool/ExpandTool_Gold.js`；扩展面板 | 关；`ExSave_Gold/GoldGift` | 大量 DOM 重写、远程素材、SVGA；易误导且选择器脆弱 | 放弃候选；P3；不为“完整”强迁。 |
| `custom-barrage-size`：设置弹幕字号 | `ExpandTool/ExpandTool_BarrageSize.js`；扩展面板 | **模块注册已注释**；`ExSave_BarrageSize` | CSS/DOM；官方已有字号能力的可能性高 | 放弃候选；P3；先比较官方能力。 |
| `global-lottery-feed`：展示全站抽奖并跳房 | `Lottery/`；ExPanel/右侧抽奖面板 | 自动；`ExSave_Lottery` | 外部/WS 抽奖源、自动跳房可能触发账号行为 | 调研；P3；数据源、过滤、无自动参与默认和停用清理。 |
| `level-task-auto-claim`：定时领取等级任务奖励 | `LevelTask/LevelTask.js`；无入口、总定时器 | 自动；无 | 登录态任务 API、周期轮询；账号动作 | 放弃候选；P3；若保留改为用户触发并逐项报告。 |
| `disable-offline-jump`：自动关闭下播推荐跳转 | `DisableCloseJump/DisableCloseJump.js`；每秒查找并点击关闭 | 自动；无 | 永久轮询+模拟点击；选择器易变 | 窄适配；P1；按冻结契约保留直播间内 1 秒轮询，生命周期清理由 FeatureRuntime 管理，用户主动导航不拦截。 |

## G. 外部站点入口与专用路由

| ID / 用户价值 | 归档源码与入口 | 默认 / 持久化 | 接口、依赖与当前失效点 | 建议 / 优先级 / 独立验收边界 |
| --- | --- | --- | --- | --- |
| `restore-closed-yuba`：把已关闭鱼吧映射到主播现有鱼吧内容 | `RestoreYuba/` + 鱼吧路由；自动重定向/全局 fetch/XHR 改写 | 自动；无 | 鱼吧接口、全局网络 Hook、跨页面改 ID；写操作误投风险 | 调研；P3；只读浏览先行，发帖/关注等请求禁止改写，必须有关闭鱼吧样本。 |
| `external-auto-anchor-star`：打开外站代抢星推荐红包 | `AutoAnchorStar/`；ExPanel 图标 | 自动显示；无 | `xtj.douyuex.com` 外站，业务/安全未知 | 放弃；P3；不迁旧外站入口。 |
| `external-fkbuff`：打开 fkbuff | `Fkbuff/`；ExPanel 图标 | 自动显示；无 | 外站用途/存续未知 | 放弃；P3。 |
| `external-monitor`：打开在线弹幕助手 | `Monitor/`；ExPanel 图标 | 自动显示；无 | 旧外站服务与数据边界未知 | 放弃；P3。 |
| `firepower-random-room`：跳转随机“火力全开”房间 | `FirePower/`；源码有 ExPanel 图标但主流程未注册 | 未注册；无 | 旧活动/外站数据可能失效 | 放弃；P3。 |

## H. 签到组合的原子请求

这些原子项都由 `Sign/Sign.js` 的同一个图标触发，但应独立建任务。归档事实显示：单击只对开播关注房
签到、长按对全部关注房签到；鱼吧、客户端和活动请求无论单击/长按都会一起触发。

| ID / 用户价值 | 归档源码与入口 | 默认 / 持久化 | 接口、依赖与当前失效点 | 建议 / 优先级 / 独立验收边界 |
| --- | --- | --- | --- | --- |
| `sign-room`：关注直播间逐房签到 | `Sign/Sign_Room.js`；签到组合按钮 | 动作；无 | 关注列表 + Android checkIn；旧版不读取响应；2026-09-19 单房实测返回 `error: 8 / 功能已下线` | 放弃；当前接口明确下线，无替代收益证据。 |
| `sign-yuba`：关注鱼吧签到/补签 | `Sign/Sign_Yuba.js`；组合按钮 | 动作；无 | 多个鱼吧移动/Web API、跨域、token；接口变化大 | 保留普通签到并实测；补签明确暂缓。 |
| `sign-client`：模拟客户端签到 | `Sign/Sign_Client.js`；组合按钮 | 动作；无 | `apiv2.douyucdn.cn/h5nc/sign/sendSign` | 调研；P3；明确模拟客户端风险和返回值。 |
| `sign-activities`：通用活动签到/开礼盒 | `Sign/Sign_Act.js`；组合按钮 | 动作；无 | 活动 alias/奖品接口；高度时效性 | 放弃候选；P3；只有当前明确活动才临时调研。 |
| `sign-card-arena`：右侧卡牌/球星活动签到 | `Sign/Sign_ActqzsUserTask.js`；组合按钮 | 动作；无 | 按日期加载 webconf JSON + 活动接口 | 放弃候选；P3；旧活动过期即登记放弃。 |
| `sign-read-post`：读取固定鱼吧帖子完成任务 | `Sign/Sign_ReadPosts.js`；组合按钮 | 动作；无 | 固定帖子 ID；会产生账号任务状态 | 保留原固定帖子；任务未完成时才执行，以任务前后状态验证效果。 |
| `sign-follow-churn`：通过关注/取关完成任务 | `Sign/Sign_Follow.js`；组合按钮 | 动作；无 | 改关注关系；外部可见账号动作 | 保留原固定房间；执行前读取关注状态，结束后恢复，任务未完成时才执行。 |
| `sign-fans-home`：粉丝家园签到 | `Sign/Sign_FansTree.js`；组合按钮 | 动作；无 | 当前房间/粉丝接口 | 第一批保留并实测，以真实响应和收益状态判定。 |
| `sign-super-fans`：超级粉丝签到 | `Sign/Sign_SuperFans.js`；组合按钮 | 动作；无 | 活动接口 | 第一批保留并实测，以真实响应和收益状态判定。 |
| `sign-points-watch`：积分签到/观看奖励 | `Sign/Sign_OPFOY.js`；组合按钮且总定时器再次调用 | 自动+动作；无 | carnival/gametask API、周期请求 | 延伸验证 TODO；先以实际页面、响应和收益判断，不直接迁入旧轮询。 |
| `sign-anchor-star`：星推签到/关注任务上报 | `Sign/Sign_AnchorStar.js`；组合按钮 | 动作；无 | 主播星推活动接口，可能改关注状态 | 延伸验证 TODO；先证明当前活动和动作语义。 |
| `sign-motorcade`：车队签到 | `Sign/Sign_Motorcade.js`；组合内调用已注释 | 未注册；无 | msg.douyu + 腾讯 IM 登录、跨域、复杂账号数据 | 放弃；P3。 |
| `sign-tv` / `sign-ad` / `sign-yuba-like`：电视端、广告鱼丸、鱼吧点赞 | `Sign/Sign_TV.js`、`Sign_Ad_Sign.js`、`Sign_Yuba_Like.js` | 源码明确注释为 2022-09-01 失效 | 旧客户端/广告/点赞接口 | 放弃；P3；保留登记即完成。 |

## I. 归档存在但未注册的实验能力

| ID / 用户价值 | 归档源码与入口 | 默认 / 持久化 | 接口、依赖与当前失效点 | 建议 / 优先级 / 独立验收边界 |
| --- | --- | --- | --- | --- |
| `ad-video-rewards`：模拟观看广告领取多类鱼丸 | `AdVideo/`；`initPkg_AdVideo()` 在主流程注释 | 未注册；无 | 多个广告 API、等待/签名、账号和反自动化风险 | 放弃；P3。 |
| `mobile-mini-program`：移动端/小程序入口 | `MiniProgram/`；主流程注释 | 未注册；无 | 旧外部页面/二维码 | 放弃；P3。 |
| `syncjoy`：外部游戏/手柄同步入口 | `SyncJoy/`；主流程注释 | 未注册；无 | 外部服务语义不清 | 放弃；P3。 |

## 按需补证据清单

以下事实无法仅靠源码补齐，但不要求用户一次性整理。M0 只收集简洁模式需要的材料；以后每个功能
进入排期前，先从代码填完事实，再询问 1–3 个会改变范围或验收契约的问题：

1. **截图与操作记忆**：只针对即将排期的功能，记录入口是否实际使用、点击/长按顺序、常开或临时开、
   依赖的反馈和使用频率；不含用户名、头像、聊天正文或账号数据。
2. **页面模式包**：普通、网页全屏、浏览器全屏、未开播页和切换房间后的无敏感截图/几何；标明
   页面缩放。用于所有近场入口和布局任务。
3. **自然样本包**：特殊时期弹幕受限、SC 出现/更新/消失、被拦截弹幕、收藏已满、下播跳转、
   视频页长视频/弹幕、关闭鱼吧。只保存结构、非个人化 class/data 属性、计算样式和命中结果。
4. **账号动作包**仅到具体任务再采：签到返回码、粉丝牌/背包/VIP、房管禁言、关注变更等必须在
   用户明确授权的测试账号/当前账号操作中采集，不预先批量执行。

## 审计结论

- **归档代码事实**：2026.06.03.01 主流程实际注册了大量能力，也明确保留了未注册和已注明失效的
  源码；单凭文件存在不能算“原版可用功能”。
- **基于源码推断**：低摩擦价值主要集中在简洁模式、播放器纯本地控制、弹幕编辑/阅读和只读信息；
  最大风险来自 Cookie、自动发送/禁言/送礼、活动签到、全局网络 Hook、跨平台流与复杂 WebSocket。
- **需要用户确认**：D1/D2 已确认；各功能的最终保留与排序、每日自动化跨 package 关系、外部服务/
  账号动作以及相机功能是否永久排除仍按排期确认。
- **需要当前页面实测**：所有哈希 DOM 入口、当前接口、全屏/动态重建、自然事件样本和用户可见结果。
