# 设置与播放器运行时首轮试探

状态：2026-10-24 已将隔离 worktree 的四个提交集成到主目录 main，并从集成源码重建；版本保持 2026.8.20，userscript.publish=false。下文 10 月初的“仅同步 dist / 尚未集成”是历史现场，当前以文末收敛记录为准。

## 当前体验契约

- 入口为油猴菜单弹窗，Alt+Shift+O 备用，不采用侧边按钮。
- 礼物特效、送礼信息/福袋口令、画面弹幕、声音/音量、清晰度、网页全屏、右侧聊天栏共七项支持记忆模式与不接管；布尔状态另有固定开启/关闭（文案按功能解释），清晰度另有固定最高。
- 默认记忆模式。首次无保存值时读取平台状态；旧礼物/过滤开关迁移成对应状态，保持已有屏蔽体验。固定模式不覆盖保存的记忆值，返回记忆模式可恢复原值。
- 记忆模式保存用户通过原生控件做出的选择，进房或播放器重建时恢复；恢复过程不反向覆盖记忆。音量与静音分别保存，送礼/福袋分别保存。
- 当前域 localStorage 按功能独立保存，storage 事件同步同域标签。www 与 live 各自保存，未扩大 GM 权限。
- 网页全屏使用平台原生回调，不请求浏览器全屏。聊天栏只使用平台折叠/展开控件；普通布局缺少折叠控件时保留目标状态，进入网页全屏后重试，不用宽泛 CSS 强行隐藏。
- 礼物特效优先读写挂载控件 context 中的 giftStore，回调与菜单逐级降级；弹幕设置仍需挂载原生弹窗，再操作布尔回调并回读。画质优先旧 qualityHandler，当前新版使用已挂载选项的 React onClick，无须打开下拉菜单；不可用时保留菜单降级，不写 Cookie。
- 底部礼物/游戏栏、心愿提示、电商广告保留可撤销 CSS 与容器保护。无操作暂停恢复仍只在返回页面时处理明确暂停提示。

## 最小权限与页面上下文

用户已在现有 DEV 代理中加入 GM_registerMenuCommand 并保存，确认菜单可打开弹窗。当前构建仅声明这一项 GM 权限，同时显式保持 @sandbox raw。

boot 通过 vite-plugin-monkey 的客户端导入菜单 API，注册固定 id 的“抖音直播优化 · 设置”。菜单异常不会中断屏蔽运行时，Alt+Shift+O 可作备用入口。不存在侧边按钮。

未增加 GM 存储、unsafeWindow、GM 网络或 @connect，也未增加远程 @require。设置使用当前域名 localStorage，www.douyin.com 与 live.douyin.com 的配置各自保存；这项跨域差异需用户实测后决定是否另行调整。

Tampermonkey 官方文档说明：grant:none 会关闭 sandbox，GM_* API 不可用；@sandbox raw 请求 MAIN_WORLD，但 CSP 等条件仍可能导致其它上下文降级。因此加入菜单后必须实测 React expando 可访问性、history wrapper 接线、首次启动及 SPA 换房。内部接口不可用时保留 DOM 降级，不能把 raw 当作跨浏览器保证。

来源：[grant](https://www.tampermonkey.net/documentation.php?q=grant)、[sandbox](https://www.tampermonkey.net/documentation.php?q=sandbox)、[menu API](https://www.tampermonkey.net/documentation.php?q=GM_registerMenuCommand)。未修改安装脚本、代理 @require 或站点账号。

## 生命周期与操作预算

按域名/房间路径、播放器 DOM、video、能识别到的播放器实例引用判断作用域。查询参数改变不重复启动。URL、播放器根或视频/原生实例替换取消旧工作，任务每次读取/点击前检查作用域，避免等 MutationObserver 调度时跨房操作。

需要菜单的弹幕及礼物/画质降级共用串行队列，避免抢 hover；仅菜单操作期间暂时恢复底部布局，直接回调不展开底栏。礼物最多三轮，触发器等待最多 50 次、间隔 100ms；开关与回读分别最多 10 次。状态不可读不猜测，连续两次读取一致才确认成功。失败显示“尚未确认，可重试”，不保留跨房 done。

布局和作用域观察器按 100ms 合并 DOM 变化，只监听识别所需的属性，不监听自身隐藏属性，不进行永久轮询。布局标记随当前匹配结果更新：已脱离或被复用为其它内容的节点及时恢复。界面重试按七项当前策略检查；记忆模式恢复保存值，固定模式保持目标，不接管不操作。原生可信输入取消同项旧恢复任务，并在有限的 100/400/1000ms 窗口回读；卸载及换房取消窗口。

## 浏览器入口及验收

开发/检查/构建：/Users/chz/.codex/worktrees/douyin-settings-runtime/userscripts，分支 feat/douyin-live-optimizer/settings-runtime-trial。

浏览器入口：/Users/chz/myWorkSpace/myJS/直播插件/userscripts/packages/douyin-live-optimizer/dist，沿用现有开发代理。主目录仍由斗鱼任务占用，本轮只同步抖音包被忽略的 user.js/meta.js 构建产物，未改其源码、分支、代理路径或 watcher。同步前的产物已备份到 /private/tmp/douyin-before-settings-h0Smsn。主目录未来重建会覆盖此预览，源码集成需另行安排。

当前实际页面已使用同步后的最新 dist；待取得主目录集成时段后，集成对应提交并从该目录重建，再补齐以下路径。菜单打开和普通页面的底栏/播放器边界已验证，其余不得推断通过。

- 油猴菜单打开设置；普通、网页全屏和播放器全屏下可操作，不遮挡关闭后的播放器或发送区。原生 video 全屏需在用户打开设置时退出全屏再显示弹窗。
- 首次进入 live 域、关注页站内进入直播、SPA 连续换房、刷新、前进/后退；退出直播回普通视频后无直播操作。
- 正常礼物原生开关状态、延迟渲染、点击被忽略、换房/重建后的状态；实际出现礼物时无特效，失败不会被标成成功。
- 面板礼物与弹幕开关正反切换；隐藏类即时恢复，多个开关并存不互相覆盖；刷新及同域另一个 tab 设置同步。
- 自动最高画质；内部接口不可用时菜单降级；选项缺少原画时选最高可用档；随后手动调整不被持续覆盖。
- 初次声音/音量恢复、用户手动静音、同 video 容器重建不解除静音；手动暂停不触发自动恢复。
- 普通及全屏游戏入口、心愿/展馆提示、小黄车、电商产品占位；播放器、服务 iframe、普通弹幕不被误隐藏。
- 后台返回、pageshow、提示延迟渲染、无操作暂停恢复；离房/关闭开关后旧重试不触碰新房。

## 上游参考范围

WhiteSevs/TamperMonkeyScript 固定提交：88918c6248f3320b056a3a0b5d07b718c5c18946。

- [直播设置](https://github.com/WhiteSevs/TamperMonkeyScript/blob/88918c6248f3320b056a3a0b5d07b718c5c18946/scripts-vite/抖音优化/src/setting/view/live.ts)：分类配置设计。
- [布局屏蔽](https://github.com/WhiteSevs/TamperMonkeyScript/blob/88918c6248f3320b056a3a0b5d07b718c5c18946/scripts-vite/抖音优化/src/main/live/DouYinLiveBlock.ts)：可撤销 CSS 思路；礼物特效 CSS 未采用。
- [直播画质](https://github.com/WhiteSevs/TamperMonkeyScript/blob/88918c6248f3320b056a3a0b5d07b718c5c18946/scripts-vite/抖音优化/src/main/live/DouYinLive.ts)：画质名称等级及内部 qualityHandler 识别线索。
- [播放器实例](https://github.com/WhiteSevs/TamperMonkeyScript/blob/88918c6248f3320b056a3a0b5d07b718c5c18946/scripts-vite/抖音优化/src/main/live/player/DouYinLivePlayer.ts)：DOM 上实例身份的候选位置。

本轮独立实现，未整段复制上游代码或导入其库；源码概念不能证明发布 dist 同步或实机可靠。若后续复制源码，另行记录 GPL-3.0 来源及相应许可处理。

## 2026-10-02 首轮历史检查证据（菜单授权前）

- worktree 写权限：当前会话有效 writable roots 明确包含上述 worktree，编辑仅发生在此目录。
- `pnpm validate`、`pnpm test`、`pnpm type-check`、`pnpm build` 均通过；最终新增节点复用清理后重跑全部测试（261/261）、抖音类型检查和构建通过。抖音包共 85 项测试。
- 最新产物 `dist/douyin-live-optimizer.user.js`：51.82 kB，gzip 14.25 kB；SHA-256 `fe04a55e0c494b6d09ebfb1d2c09ca938a0054b66d750624a3e9470a7217e456`。
- 本地浏览器使用该产物，模拟 `GM_registerMenuCommand` 注册：确认弹窗可打开、默认八项开启、开关修改后刷新保留、Escape 关闭后焦点回到入口、Shift+Tab/Tab 在首尾循环、快捷键打开。最后重建后重新刷新页面并打开确认；该模拟不证明 Tampermonkey 真实权限或抖音页面功能可用。
- 没有安装或发布脚本，没有操作真实账号，没有改动主项目 watcher 或代理路径。真实直播页、真实菜单注册、全屏手感及跨域保存仍未验收，详见 TODO。

## 2026-10-02 后续可靠性修复（菜单授权前）

- tooltip/广告节点保持连接但已变为普通内容时，旧隐藏标记随匹配结果清理。后补 id、class、data-e2e、iframe 容器和产品占位属性会触发合并扫描；隐藏标记与 style 属性不在观察范围。卸载后公开 refresh/update 也不会重新添加标记。
- 播放器重建时，空的旧容器不能成为新 video 的作用域；由 video 实际所在根容器识别实例。播放器识别属性后补也可触发生命周期检查，不重复启动同一作用域的自动操作。
- 本地构建复现过菜单注册抛错中断 startOptimizer：现在仅记录异常类型并显示入口状态，运行时及清理函数仍建立。本地模拟正常/异常注册下重复运行构建，均确认新运行时建立、面板数量为 1，异常后快捷键仍可操作设置。未启用或扩大实际 GM 权限。
- 全部 264 项测试、仓库校验、类型检查、构建通过；抖音包为 88 项。最新 dist 为 52.49 kB，gzip 14.39 kB，SHA-256 `1caccba1ddcf4eb197917cb28ad7dce3bf8eb8a34b74d13e32b9285f5f2a0ca0`。
- 本地容器可进入浏览器全屏，但后续输入检查中发生全屏退出，未确定是输入工具行为还是页面行为；因此不把这条路径记为通过。抖音实际全屏、原生 video 全屏和用户手感仍须在最终集成产物上验收。

## 2026-10-02 菜单接线与播放器误隐藏修复

- 用户保存现有 DEV 代理后，确认真实油猴菜单可以打开弹窗。
- 用户随后报告直播黑屏、聊天区移到左侧。实页发现底栏规则将包含 video 的 LeftBackgroundLayout 标记隐藏：页面头部送礼入口与底部礼物栏分属不同区域，旧逻辑错误选择了二者的共同祖先。
- 祖先查找现在不能跨过页面布局、播放器或聊天边界；所有隐藏规则还会拒绝包含 video、播放器、聊天输入或本脚本面板的容器。已隐藏容器后来承载 video 时会清理旧标记。补充六项针对性回归，覆盖这次实页结构、未知共同祖先及旧节点复用。
- 最新 dist 同步到现有 @require 路径后，刷新 live.douyin.com 实际直播页，重新开启“隐藏底部礼物与游戏栏”。八项设置全部开启，隐藏标记仅位于 BottomLayout 与 EcmoCardLayout，均不含 video；播放器可见（960×558、readyState=4），关闭弹窗后截图可见直播画面与右侧聊天。
- 最新 user.js SHA-256：5ac1c5eab9faa4735f3a7db8deabbf06426edfe26d3a48da5a6238ab29f36dbd，大小 53.84 kB，gzip 14.71 kB。截图为本机临时证据 /private/tmp/douyin-player-layout-fixed.png，不提交页面内容。
- 全仓校验、测试 271/271、类型检查及构建全部通过；抖音包 94 项。全屏、SPA 换房、礼物实际出现时的屏蔽、跨域设置和完整原生开关反向恢复仍待实页验收。

## 2026-10-03 原生控制与状态记忆

发现依据：上游源码提供 qualityHandler、播放器实例与原生按钮线索；本轮在实际 DOM 的 React props/fiber 中核对回调与状态。当前新版画质已无旧 qualityHandler，改为已挂载选项回调；礼物 effectSwitchStatus 代表特效开启，需要反转为屏蔽语义。网页全屏 on 代表普通模式，也需反转。未扫描全局 store、执行组件函数或接管网络。源码不能证明上游作者当时如何发现接口，调试 DOM/加载 JS 是推断。

- 最新 dist → 同步现有代理路径 → 刷新实际直播页闭环完成。高清、静音且音量 64%、网页全屏、聊天栏收起均恢复；上一轮不同房间第二标签也继承这四项，同域共享有实页证据。
- 整体弹幕在最新构建中完成固定关闭/开启，原生开关 class 回读分别为关闭/开启；恢复记忆模式后，点击原生开关，保存文案分别变为“关闭/开启”。此前第二标签输入未生效不再视为实现失败；本轮第一标签完成正反路径。用户真实输入手感仍可补验。
- 礼物原生状态已回读确认，尚未覆盖实际礼物出现时的效果；连续 SPA 换房、全屏焦点路径及 www/live 跨域统一仍未验收。
- 全仓 validate、test（291/291）、type-check、build 通过；抖音包 114 项。新增策略存储、跨标签事件、可信输入捕获、取消恢复、原生布尔语义、高清选项回调回归。
- user.js SHA-256：0179a81128d83643756fcce6df5cee11360ff7ba438102b6f23b65fff99aa164。同步前备份 /private/tmp/douyin-before-settings-jUXsoj。截图 /private/tmp/douyin-player-memory-settings.png（本机临时证据，不提交页面内容）。
- 主目录仍有其他任务未提交改动，只导出忽略的抖音 dist，不集成源码或更换其分支；未来主目录重新构建会覆盖该预览。

## 2026-10-24 源码与构建入口收敛

- 四个原提交通过 `7e74aa6` 合并到主目录 main，package 源码与原 worktree 一致；后续在主目录开发和构建，不再以复制 worktree dist 维持日常版本。原 worktree 保留，尚未清理。
- 主目录重建 user.js SHA-256 为 `0179a81128d83643756fcce6df5cee11360ff7ba438102b6f23b65fff99aa164`，与 10-03 记忆功能验收产物一致；整理前的产物、未提交源码差异及检查日志保存在忽略目录 `artifacts/convergence-before-20261024/`。
- 集成后全仓 validate、test（387/387）、type-check、build 通过；其余未改动 package 的重建产物逐字节不变。
- 初次检查时内置浏览器未安装 DEV；之后用户完成已授权安装，来源核对与核心验收已通过，详见下方续验结果。主目录代理为 `dist/douyin-live-optimizer.dev.user.js`。
- 日常 Chrome 兼容性检查：实际直播页通过 Alt+Shift+O 打开新设置面板，七项状态策略可见，关闭后面板消失；video 为 1280×645、readyState=4、持续播放。未改变偏好、发送或操作账号。Chrome 的 CDP 来源检查受页面响应暂停状态阻断，因此本轮未重新证明其外层 @require/权限；固定主目录入口沿用既有记录。
- 本轮未补齐 SPA 连续换房、原生全屏焦点、实际礼物出现及跨域统一；已有自然验证缺口继续保留，不因源码集成而标记通过。

### 内置浏览器安装续验

- 用户已明确授权安装主目录 DEV 代理，权限仅 `GM_registerMenuCommand`、`sandbox raw`，没有新增账号或网络权限。
- 本地 `http://127.0.0.1:54190/douyin-live-optimizer.dev.user.js` 返回 200 和正确元数据；内置浏览器打开后为 `net::ERR_ABORTED`，标签仍为空白，未显示安装确认。工具另明确拒绝操作 Codex 原生界面，原因是安全限制。没有绕过限制或改装 Chrome 副本，也未将尝试记为成功。
- 安装地址已通过 open_in_codex 加入当前聊天的浏览器面板（返回 queued）；该阻塞随后由用户手动安装解除，无需再次申请相同安装授权，结果见下。

### 用户安装后核心验收通过

- 2026-10-24 用户确认安装完成。内置 Browser 的实际执行源码包含主目录完整 user.js，外层 DEV @require 指向主目录 dist，权限仅 GM_registerMenuCommand、sandbox raw；刷新后的执行源码再次逐字匹配同一产物，SHA-256 仍为 `0179a81128d83643756fcce6df5cee11360ff7ba438102b6f23b65fff99aa164`。
- 原样本房间已下播，改从当前直播列表选取房间 93974108982。Alt+Shift+O 打开面板，七项策略可见；Tab 从关闭按钮进入礼物模式，Escape 关闭面板。仅验证快捷键入口，未把它冒充油猴菜单点击证据。
- “隐藏底部礼物与游戏栏”原为开启；关闭并刷新后保持关闭，再恢复开启并刷新后保持开启。最终恢复原设置。实际播放器 960×720、readyState=4、paused=false，未被隐藏。截图 `/private/tmp/userscripts-douyin-iab-20261024.png`。没有登录、发言、关注、送礼或改账号。
- 本轮仅安装与实页验证并更新记录，未修改功能源码，无需重复已通过的全仓 387 项检查；git diff --check 通过。SPA 连续换房、原生全屏焦点、实际礼物特效及跨域统一仍保留原待办。

## 2026-11-01 礼物闪现、状态源与聊天工具

当前在主目录 main 开发并定向构建，沿用主目录 DEV 入口，无新权限、安装、升版或远程修改。

- 礼物栏闪现根因：本项目的菜单串行队列曾临时解除 bottomLayout 隐藏，观察器还合并延迟 100ms；并非照搬 ref 的特效屏蔽。现在菜单期间不解除底栏隐藏；稳定 BottomLayout/gifts 容器使用即时可撤销 CSS，CSS 同时保护自身及包含 video/播放器/输入区的节点。初始 CSS 不再等 video 就绪。重复更新不重写相同样式，避免 observer 自激。
- 当前官方 EffectSwitchPlugin 的回调来自 giftStore.setEffectSwitchStatus；GiftEffectPlugin 与 GiftTrayPlugin 均读取该 store.effectSwitchStatus。脚本现在优先读取控件 React context 中这一真实状态，避免旧 props 回读假成功；限定 16 层、每层 4 个依赖，不遍历全局 store。500ms 稳定回读，最多三轮，取消与用户接管仍有效。旧回调/菜单作为兼容降级。
- UI 降级：菜单之间前后各 400ms，弹幕两个过滤开关间隔 400ms，并在第一项更新后重取第二节点，避免 React 重建导致旧节点点击丢失。礼物菜单展开后等 350ms、点击后等 400ms。增加间隔只用于降级，不代替状态确认。
- 弹幕加一：普通文字消息悬停显示浮动工具栏（暂停、复制、加一）；从虚拟列表 props 核对 msg_id 和正文，拒绝节点复用/换房。使用当前 chatroom.onSend 普通发送一次，无付费参数和自动重试，1 秒防连击。官方 onSend 会先清空编辑器，因此存在草稿或内联表情时停止，保留原草稿，不写富文本 DOM。登录、禁言及字数限制由原生接口处理。当前仅支持能与已解码纯文本对应的普通消息，不承诺富文本/表情消息。
- 弹幕检测第一阶段：旁观同源 /webcast/room/chat/ 的现有 fetch/XHR 回执，保持原发送 Promise 与载荷；识别平台拒绝、待审核/发送者可见字段，成功只能标“已受理，公开可见性未确认”。按返回 msg_id_str 对应原生 message.on(ChatMessage) 服务器回声，排除 is_mock 本地插入。审核/可见性字段在对应消息行标注，换房/关闭/卸载清理；仅存有界 id/标记，不持久化正文、身份、Cookie 或响应。
- 与斗鱼的差距仍明确保留：斗鱼使用独立匿名连接，抖音本阶段仅是发送回执与当前连接服务器回声；没有把它伪装成匿名观众的公开可见性验证。公开采集项目依赖签名、游客身份、protobuf/gzip、心跳和 ack；没有直接复制其反混淆签名程序或引入外部采集服务。独立匿名观察与真正屏蔽/延迟纠正仍是待完成项。

当前官方代码证据（仅用于核对调用链，未复制源码）：
[EffectSwitchPlugin](https://lf-webcast-platform.bytetos.com/obj/webcast-platform-cdn/webcast/douyin_live/chunks/EffectSwitchPlugin.324d68a8.js)、[GiftEffectPlugin](https://lf-webcast-platform.bytetos.com/obj/webcast-platform-cdn/webcast/douyin_live/chunks/GiftEffectPlugin.ba9579dc.js)、[GiftTrayPlugin](https://lf-webcast-platform.bytetos.com/obj/webcast-platform-cdn/webcast/douyin_live/chunks/GiftTrayPlugin.9b8a3447.js)、[ChatRoom](https://lf-webcast-platform.bytetos.com/obj/webcast-platform-cdn/webcast/douyin_live/chunks/ChatRoom.30049f92.js)。[独立采集参考](https://github.com/saermart/DouyinLiveWebFetcher/blob/main/liveMan.py)与[协议字段](https://github.com/saermart/DouyinLiveWebFetcher/blob/main/douyin.proto)仅作可行性参考。

实页：内置浏览器实际加载本轮主目录 dist，新设置和普通消息 +1 可见，关闭/开启 +1 立即撤销/恢复。礼物模式路径为 store，切换始终显示并回到记忆后真实状态对应变化；弹幕菜单操作期间 BottomLayout 高度始终为 0，播放器 readyState=4。未登录时点击 +1 正确停止并提示登录，未触发发送；尚不能验证真实发送、平台拒绝/审核及自然礼物特效是否全部受控。游客连接短时观察未收到自然礼物，临时计数监听已清理，已请求用户协助登录与发送。不能因此声明全部功能已验收。

检查：package 125 项回归、全仓类型检查、validate、定向构建通过。默认 pnpm test 额外扫描了 artifacts/convergence-before-20261024 的不完整历史副本，因副本缺模块失败；限定实际 test/ 与 packages/*/test/ 的仓库测试串行通过；并行时斗鱼现有计时调度测试出现过一次 2!=4，串行复查通过。未修改历史副本、斗鱼代码或共享测试入口。

### 2026-11-01 用户反馈后的修正

- 前次仅验证了按钮可见和游客拦截，没有验证悬停暂停与登录发送，不能作为加一完整验收。本轮改为独立浮动栏，使用原生 WebcastChatroom 的 lock/unlock 句柄暂停列表；移入工具栏保留目标，离开解除本次拥有的锁，已有历史滚动不强制跳底。换房、虚拟行替换、关闭功能与卸载会撤销。
- 官方 [chat island](https://lf-webcast-platform.bytetos.com/obj/webcast-platform-cdn/webcast/douyin_live/chunks/island_237ab.bc5146d9.js) 暴露 lock/unlock/inputClear 句柄，普通发送实际使用 GET /webcast/room/chat/。发送观察原来只接 POST，漏掉普通发送，现接 GET/POST；仅旁观既有请求，无新增发送或重试。
- 关注页进房不再等主文档 video（当前播放器可使用 iframe）。控件晚挂载、giftStore/房间标识变化会刷新任务作用域，避免早期未就绪耗尽后再不执行；作用域回归覆盖迟到控件、相同 DOM 换房和无 video 场景。
- 修复记忆捕获：打开礼物/弹幕设置菜单不代表修改选择。原来会取消恢复并抓到平台初始值；现在只有实际开关操作才保存。实页曾发现 www 的送礼/福袋记忆为显示，与 live 域的屏蔽目标不同；不能据此断言历史上每次失效的原因。www 与 live 仍各自保存，本轮未增加跨域权限。
- 闪现追溯到 7ff937d：withPlayerMenu 将 menuBusy 置真，bottomLayout 随之临时解除隐藏；后续记忆重构沿用了它，再加节点标记延迟导致先显后隐。属于本项目的菜单兼容回归，非 ref 的固有限制。7b47e96 已移除这一解除逻辑。
- giftStore.setEffectSwitchStatus 来自抖音官方页面构建，是内部状态 setter，不是公开 HTTP 接口，也不是从 ref 直接复制。优先 store、其次原生回调、最后 UI；状态回读成功仅证明开关恢复，特殊活动与自然礼物长期表现仍待观察。

实页续验：Chrome 最新本地构建，从关注卡片实际进入 www /follow/live/ 房间；悬停普通弹幕后显示“悬停暂停／复制／加一”，新消息提示由 33 增至 34 时目标行 y 坐标保持 358.755，移出后暂停标记清除。通过原生菜单将该域送礼/福袋两个记忆目标纠正为隐藏，面板回读确认；礼物记忆为屏蔽。真实加一发送由用户选择内容操作，尚未收到成功反馈，不声明发送通过。

最终构建续验：定向重建后重开已观察到的关注直播地址，平台重定向至 live 域；该域底栏高度 0、礼物记忆屏蔽、送礼与福袋原生开关关闭。此项记为 live 域刷新恢复，不冒充 www 域再次 SPA 进房。之前实际关注卡片进入 www 路径及悬停已验证；连续换房仍保留待观察。

本轮检查：抖音 package 132/132、实际 test/ 与 packages/*/test/ 全部串行测试、pnpm validate、package 类型检查、定向构建与 git diff --check 通过。未改其他 package 或用户已有 .codex 配置，版本保持 2026.8.20，未推送或发布。

### 2026-11-01 能力边界与真实 hover 再反馈

用户报告完全无浮动栏且不暂停，之前点击定位的浏览器路径不能证明真实 hover 体验通过，撤回完整验收结论。代码发现暂停依赖 readChatRow 成功，有不支持消息/属性尚未就绪即直接退出的缺口；现在列表暂停独立于可发送消息解析，增加 pointermove 重试及迟到句柄重取，隐藏工具栏时离开也会清理自有锁。新增两项回归，package 134 项通过，类型检查及定向构建通过。最终 dist 已在独立 Chrome 标签刷新加载，纯移动鼠标交由用户验收，尚无结论。

当前检测只能观察发送回执与当前登录连接消息，无法覆盖“回执正常、自己回显、其他人不可见”。产品名称改为“发送结果提示”，没有把改名当作需求完成。公开 proto 中有 visibleToSender/sendReview 字段，但实际暗屏蔽样本及字段语义尚未验证；存在字段不代表已经识别暗屏蔽。

重新对照：本仓库斗鱼实现使用独立匿名弹幕连接，并区分连接健康、超时疑似和迟到确认；查阅的 B 站反诈脚本识别 code=0 时 msg=f/k 隐藏标记（该脚本的解释，不推断所有 B 站实现相同）。抖音要完成需求，需要同等额外证据：经过实测的隐藏过滤标志，或者身份独立的观众接收对照。无信号、连接异常、消息超时须保留不确定性。

来源：[B 站反诈脚本判断分支](https://github.com/li7355608/bili_danmu_disharmony/blob/main/danmu_diff_main.js#L3091)、[抖音公开协议样本](https://github.com/saermart/DouyinLiveWebFetcher/blob/main/douyin.proto#L39)。

用户随后澄清：要求悬停的是视频画面上的飘屏弹幕，右侧 chat hover 实际出现，但并非需求对象。因此根因首先是实现范围理解错误，不能仅归因于事件/属性就绪，也不再请求用户重复验收右侧聊天来证明飘屏需求。设置名称纠正为“右侧聊天复制与加一”，飘屏功能明确未实现。

普通 DOM 已定位 #DanmakuLayout .CanvasDanmakuPlugin canvas；该节点不同于隐藏的 annie iframe。官方 [CanvasDanmakuPlugin.f036c928.js](https://lf-webcast-platform.bytetos.com/obj/webcast-platform-cdn/webcast/douyin_live/chunks/CanvasDanmakuPlugin.f036c928.js) 支持 start/stop，使用 OffscreenCanvas + Worker 或主线程备用实现；未提供逐条 DOM、mousemove 或 hitTest 接口。后续需要针对画布内的实际弹幕做命中与冻结，不以暂停右侧列表替代。
