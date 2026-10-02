# 设置与播放器运行时首轮试探

状态：隔离 worktree 实现，尚未集成或完成真实直播页验收。版本保持 2026.8.20，userscript.publish=false。

## 已确认范围

- 最终入口为油猴菜单打开弹窗，不采用侧边按钮。设置分为礼物与页面、弹幕、播放，默认全部开启，保持原有默认体验。
- 礼物保留平台原生“屏蔽礼物特效”开关，只改操作可靠性，不增加特效 CSS、消息解码、socket 或网络 API。
- 底部礼物/游戏栏、心愿提示、电商广告改用本脚本独有标记和可卸载 CSS 隐藏，保留现有识别范围，关闭后移除标记恢复节点。
- 送礼信息/福袋口令仍用原生菜单，操作串行执行并回读；关闭本脚本此项后恢复这两类原生开关。
- 声音在视频实例首次就绪时检查一次，恢复原滑块音量，无法取得原音量时维持 50% 兜底；后续不反复解除用户静音。
- 画质优先选择已识别内部 qualityHandler 可用列表中的最高档，确认后结束；内部结构不可用或未确认时降级到原生菜单。不写站点 Cookie。
- 返回可见/focus/pageshow 时仅处理同时出现“长时间无操作”和“暂停播放”的提示。离房、取消设置、卸载时取消旧定时任务。

## 最小权限与页面上下文

当前 metadata 仍为 grant:none；已发出一次 GM_registerMenuCommand 的权限确认，尚未收到授权。本次编辑权限与 userscript 权限是两回事。

面板及可注入的菜单注册函数已准备；boot 在 API 实际存在时注册固定 id 的“抖音直播优化 · 设置”。当前构建的 grant:none 不提供该 API，只可通过 Alt+Shift+O 做开发预览，不代表最终菜单交付完成。不存在侧边按钮。

若用户确认，只拟增加 GM_registerMenuCommand，并显式保持 @sandbox raw；不增加 GM 存储、unsafeWindow、GM 网络或 @connect，不增加远程 @require。设置使用当前域名 localStorage，www.douyin.com 与 live.douyin.com 的配置各自保存；这项跨域差异需用户实测后决定是否另行调整。

Tampermonkey 官方文档说明：grant:none 会关闭 sandbox，GM_* API 不可用；@sandbox raw 请求 MAIN_WORLD，但 CSP 等条件仍可能导致其它上下文降级。因此加入菜单后必须实测 React expando 可访问性、history wrapper 接线、首次启动及 SPA 换房。内部接口不可用时保留 DOM 降级，不能把 raw 当作跨浏览器保证。

来源：[grant](https://www.tampermonkey.net/documentation.php?q=grant)、[sandbox](https://www.tampermonkey.net/documentation.php?q=sandbox)、[menu API](https://www.tampermonkey.net/documentation.php?q=GM_registerMenuCommand)。未修改安装脚本、代理 @require 或站点账号。

## 生命周期与操作预算

按域名/房间路径、播放器 DOM、video、能识别到的播放器实例引用判断作用域。查询参数改变不重复启动。URL、播放器根或视频/原生实例替换取消旧工作，任务每次读取/点击前检查作用域，避免等 MutationObserver 调度时跨房操作。

礼物、弹幕、画质共用串行菜单队列，避免相互抢 hover 菜单；操作期间暂时恢复底部布局。礼物最多三轮，触发器等待最多 50 次、间隔 100ms；开关与回读分别最多 10 次。状态不可读不猜测，连续两次读取一致才确认成功。失败显示“尚未确认，可重试”，不保留跨房 done。

布局和作用域观察器按 100ms 合并 DOM 变化，只监听识别所需的属性，不监听自身隐藏属性，不进行永久轮询。布局标记随当前匹配结果更新：已脱离或被复用为其它内容的节点及时恢复。界面重试仅重新检查礼物、弹幕与画质，不重新解除声音静音。

## 浏览器入口及验收

开发/检查/构建：/Users/chz/.codex/worktrees/douyin-settings-runtime/userscripts，分支 feat/douyin-live-optimizer/settings-runtime-trial。

最终集成与浏览器入口：/Users/chz/myWorkSpace/myJS/直播插件/userscripts/packages/douyin-live-optimizer/dist，沿用现有开发代理。不得把 Tampermonkey 路径改到临时 worktree。主目录仍由斗鱼任务占用，本轮未写入该目录或运行其 watcher。

待取得主目录集成时段后：集成对应提交 → 从该目录重建最新 dist → 刷新直播页 → 执行以下路径，并记录真实观察。

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

## 2026-10-02 本轮检查证据

- worktree 写权限：当前会话有效 writable roots 明确包含上述 worktree，编辑仅发生在此目录。
- `pnpm validate`、`pnpm test`、`pnpm type-check`、`pnpm build` 均通过；最终新增节点复用清理后重跑全部测试（261/261）、抖音类型检查和构建通过。抖音包共 85 项测试。
- 最新产物 `dist/douyin-live-optimizer.user.js`：51.82 kB，gzip 14.25 kB；SHA-256 `fe04a55e0c494b6d09ebfb1d2c09ca938a0054b66d750624a3e9470a7217e456`。
- 本地浏览器使用该产物，模拟 `GM_registerMenuCommand` 注册：确认弹窗可打开、默认八项开启、开关修改后刷新保留、Escape 关闭后焦点回到入口、Shift+Tab/Tab 在首尾循环、快捷键打开。最后重建后重新刷新页面并打开确认；该模拟不证明 Tampermonkey 真实权限或抖音页面功能可用。
- 没有安装或发布脚本，没有操作真实账号，没有改动主项目 watcher 或代理路径。真实直播页、真实菜单注册、全屏手感及跨域保存仍未验收，详见 TODO。

## 2026-10-02 后续可靠性修复

- tooltip/广告节点保持连接但已变为普通内容时，旧隐藏标记随匹配结果清理。后补 id、class、data-e2e、iframe 容器和产品占位属性会触发合并扫描；隐藏标记与 style 属性不在观察范围。卸载后公开 refresh/update 也不会重新添加标记。
- 播放器重建时，空的旧容器不能成为新 video 的作用域；由 video 实际所在根容器识别实例。播放器识别属性后补也可触发生命周期检查，不重复启动同一作用域的自动操作。
- 本地构建复现过菜单注册抛错中断 startOptimizer：现在仅记录异常类型并显示入口状态，运行时及清理函数仍建立。本地模拟正常/异常注册下重复运行构建，均确认新运行时建立、面板数量为 1，异常后快捷键仍可操作设置。未启用或扩大实际 GM 权限。
- 全部 264 项测试、仓库校验、类型检查、构建通过；抖音包为 88 项。最新 dist 为 52.49 kB，gzip 14.39 kB，SHA-256 `1caccba1ddcf4eb197917cb28ad7dce3bf8eb8a34b74d13e32b9285f5f2a0ca0`。
- 本地容器可进入浏览器全屏，但后续输入检查中发生全屏退出，未确定是输入工具行为还是页面行为；因此不把这条路径记为通过。抖音实际全屏、原生 video 全屏和用户手感仍须在最终集成产物上验收。
