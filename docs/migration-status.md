# Userscript 迁移状态

最后更新：2026-07-15

## 状态说明

- `[ ]` 未开始
- `[~]` 进行中
- `[x]` 已完成并验证
- `[!]` 阻塞或需要决策

## 当前工作

- [x] 开发方式回归 `vite-plugin-monkey` 官方的单 package `vite serve`；升级到 Vite 8，开发期由 `Disable-CSP` 扩展处理目标站点 CSP。

- [~] 在 Tampermonkey 和斗鱼网页中验证 `auto-fans-continue` 的开发版与生产版 userscript。
- [~] 根据 `docs/tampermonkey-inventory.md`，优先迁移仍在用且依赖 `file://` 本地文件的脚本，目标是让这些脚本进入 git 管理，便于其他机器同步和更新。
- [~] 验证新迁移的 `skip-ads` / `nga` package。
- [~] 验证新迁移的 `huya-extend` / `huya` package。
- [~] 验证新迁移的 `douyin-live-optimizer` / `douyin` package。
- [~] 验证新迁移的 `kuaishou-live-optimizer` package。
- [~] 验证新迁移的 `wikipedia-auto-dark` package。
- [!] 确认 `微博直播夜间模式` 是否删除或补实现；导出包中当前只有空 IIFE。

## 迁移清单

| 原项目 | 候选入口 | 状态 | 备注 |
| --- | --- | --- | --- |
| `autoFansContinue` | 附件中的实际在用脚本 / `AutoFansContinue.user.js` | 等待浏览器验证 | 已按实际在用脚本对齐；每日执行状态使用 `localStorage`；续牌核心参考 `douyuEX_new`。当前策略为每个粉丝牌直播间送 1 个，剩余荧光棒全部送默认房间 `12306`。验证入口收窄为 `https://www.douyu.com/*`，避免从其他子域名跨源读取斗鱼接口。日志优先走 `GM_log`，运行状态也可检查 `window.__chzAutoFansContinue`。 |
| `biliDM` | 未识别 | 阻塞 | 目录中包含库和实验项目，但未发现 `==UserScript==` 入口。 |
| `douyin` | `main.js` / Tampermonkey `抖音直播优化` | 等待浏览器验证 | 已迁移为 `userscripts/packages/douyin-live-optimizer`，metadata 来自源码和导出包；`MSCSTSTS-TOOLS.js` 已改为本地共享模块 `shared/mscststs.js`，避免 dev 阶段缺少全局 `mscststs`。已补底部礼物栏、全屏 `游戏` 入口和 `屏蔽礼物特效` 逻辑；仍需真实直播页验证。`origin.js` 暂作为历史/参考版本保留。 |
| `douyu-ban` | 未确认 | 阻塞 | 存在多个实验入口，并且原目录有未提交修改。 |
| `huya` | `main.js` / Tampermonkey `huya extend` | 等待浏览器验证 | 已迁移为 `userscripts/packages/huya-extend`，metadata 来自 Tampermonkey 导出：`https://www.huya.com/*`，`grant` 保持 `none`。 |
| `kuaishou-live-optimizer` | Tampermonkey `快手直播优化` | 等待浏览器验证 | 已迁移为 `userscripts/packages/kuaishou-live-optimizer`，metadata 来自导出包；`MSCSTSTS-TOOLS.js` 已改为本地共享模块 `shared/mscststs.js`。 |
| `nga` | `main.js` / Tampermonkey `skip ads` | 等待浏览器验证 | 已迁移为 `userscripts/packages/skip-ads`，metadata 来自 Tampermonkey 导出：`https://bbs.nga.cn/*`、`https://nga.178.com/*`，`grant` 保持 `none`。 |
| `weiboLive` | `main.js` | 阻塞 | 当前文件看起来是已经生成的 React userscript bundle。 |
| `weibo-live-dark` | Tampermonkey `微博直播夜间模式` | 需要决策 | 导出包中只有空 IIFE，没有实际行为；先不创建 package。 |
| `wikipedia-auto-dark` | Tampermonkey `wikipedia auto dark` | 等待浏览器验证 | 已迁移为 `userscripts/packages/wikipedia-auto-dark`，metadata 来自导出包；保留 `@run-at document-end`。 |

## 工作区检查表

- [x] 创建迁移追踪文档。
- [x] 创建根 pnpm workspace 配置。
- [x] 增加 workspace 结构验证脚本和测试。
- [x] 增加第一个 userscript package。
- [x] 安装依赖。
- [x] 运行结构验证、类型检查和生产构建。
- [x] 检查生成的 userscript metadata。
- [x] 将 6 个已迁移脚本发布到 GitHub Pages，并逐一验证远程 `.user.js` 与本地构建产物 SHA-256 一致。
- [x] 生成包含 6 个工作区正式版本和 8 个可远程更新第三方脚本的 Tampermonkey 清理导入包。
- [ ] 在 Tampermonkey 中验证开发版 userscript。
- [ ] 在目标网站中验证生产版 userscript。
- [x] 将旧 `UserScript/readme.md` 整理进 `docs/todo.md`。
- [x] 清理旧 `UserScript/` 目录。
- [x] 将 `auto-fans-continue` 对齐为当前实际在用代码。
- [x] 将 `auto-fans-continue` 的每日执行状态从 GM 存储切换到 `localStorage`。
- [x] 为 `userscripts/` 初始化独立 git 仓库并提交基线。
- [x] 将 `auto-fans-continue` 拆分为 API、续牌计划和运行状态模块。
- [x] 将背包查询改为 `web/v5`，并支持 `268` 优先、`2358` 兜底。
- [x] 为续牌计划、斗鱼 API 封装和主流程补充自动化测试。
- [x] 建立 Tampermonkey 全量脚本整理清单。
- [~] 将仍在用且依赖 `file://` 的脚本逐步迁移为 git 管理的 userscript package。
- [x] 将 `skip ads` / `nga/main.js` 迁移为 `userscripts/packages/skip-ads`。
- [x] 将 `huya extend` / `huya/main.js` 迁移为 `userscripts/packages/huya-extend`。
- [x] 将 `抖音直播优化` / `douyin/main.js` 迁移为 `userscripts/packages/douyin-live-optimizer`。
- [x] 将 `快手直播优化` 从导出包迁移为 `userscripts/packages/kuaishou-live-optimizer`。
- [x] 将 `wikipedia auto dark` 从导出包迁移为 `userscripts/packages/wikipedia-auto-dark`。
- [x] 将常用小工具 `MSCSTSTS-TOOLS.js` 本地化为 `shared/mscststs.js`，并让 `douyin-live-optimizer` / `kuaishou-live-optimizer` 通过 ESM import 共享。
- [x] 为 `douyin-live-optimizer` 增加 `#BottomLayout`、`gifts-container`、`gifts-switch`、全屏 `游戏` 入口和旧 `.gitBarOptimizeEnabled` 的底部礼物栏清理规则。
- [x] 为 `douyin-live-optimizer` 增加 `data-e2e="gift-setting"` -> `data-e2e="effect-switch" > div` / `屏蔽礼物特效` 的自动开关逻辑；2026-07-10 通过 Console 确认内层轨道 `.click()` 有效。
- [x] 捕捉 `帮主播完成心愿吧` / 主播心愿 tooltip DOM，并替换当前占位 selector。
- [!] 暂不迁移 `微博直播夜间模式`；导出包中未发现实际逻辑。
- [x] 将 `auto-fans-continue` 的测试阶段策略改为只给每个粉丝牌直播间送 1 个，暂不默认赠送剩余荧光棒。
- [x] 将 `auto-fans-continue` 的默认策略恢复为剩余荧光棒全送 `12306`。
- [x] 移除斗鱼 API 请求里的 `mode: "no-cors"`，避免背包接口响应 body 不可读导致 `Unexpected end of input`。
- [x] 为 `auto-fans-continue` 增加斗鱼页面可用的 `GM_log` 日志通道和 `window.__chzAutoFansContinue` 运行状态入口。
- [x] 为 `auto-fans-continue` 增加状态级 toast 提示。
- [x] 将 `auto-fans-continue` 的赠送请求从串行改为默认最多 4 个并发。
- [ ] 在 Tampermonkey 中验证 `skip-ads` 开发版 userscript。
- [ ] 在 NGA 页面中验证 `skip-ads` 生产版 userscript。
- [ ] 在 Tampermonkey 中验证 `huya-extend` 开发版 userscript。
- [ ] 在虎牙页面中验证 `huya-extend` 生产版 userscript。
- [ ] 在 Tampermonkey 中验证 `douyin-live-optimizer` 开发版 userscript。
- [ ] 在抖音直播页面中验证 `douyin-live-optimizer` 生产版 userscript。
- [ ] 在 Tampermonkey 中验证 `kuaishou-live-optimizer` 开发版 userscript。
- [ ] 在快手直播页面中验证 `kuaishou-live-optimizer` 生产版 userscript。
- [ ] 在 Tampermonkey 中验证 `wikipedia-auto-dark` 开发版 userscript。
- [ ] 在 Wikipedia 页面中验证 `wikipedia-auto-dark` 生产版 userscript。

## 单脚本迁移检查表

每迁移一个 userscript 都使用这份检查表：

- [ ] 确认当前实际使用的源码入口。
- [ ] 记录原始 metadata 和外部依赖。
- [ ] 复制源码，并保持行为不变。
- [ ] 配置 `vite-plugin-monkey`。
- [ ] 首次迁移时显式保留原有 `grant`。
- [ ] 构建并检查生成的 `.user.js`。
- [ ] 安装并验证开发版 userscript。
- [ ] 安装并验证生产版 userscript。
- [ ] 记录浏览器验证结果。
- [ ] 决定是否值得进行代码现代化。

## 未决问题

- `biliDM` 中哪一个功能需要成为浏览器 userscript？
- `douyu-ban` 当前实际使用的入口文件是哪一个？
- `huya/main.js` 和 `nga/main.js` 应该匹配哪些目标 URL？
- `weiboLive/main.js` 是否有可维护源码？
- 行为对齐后，旧脚本是否继续使用全局 GM API，还是改为从 `vite-plugin-monkey` 的 ESM API 导入？
- 在另一浏览器导入清理包后，逐个确认 Tampermonkey 能通过 `.meta.js` 检查版本并从 `.user.js` 更新。

## 活动记录

### 2026-07-15

- 创建并推送公开仓库 `ccccHz/userscripts`，启用 GitHub Actions 作为 GitHub Pages 发布源。
- 发布 6 个已完成 dev 测试的生产构建：`auto-fans-continue@0.129.0`、`douyin-live-optimizer@2026.7.15`、`huya-extend@0.2.0`、`kuaishou-live-optimizer@2026.7.15`、`skip-ads@2026.7.15`、`wikipedia-auto-dark@2026.7.15`。
- 验证 6 份远程 `.meta.js` 的版本和更新地址，并确认 6 份远程 `.user.js` 与本地 `site/` 产物 SHA-256 完全一致。
- 新增 `scripts/prepare_tampermonkey_import.py`，基于原始 Tampermonkey 导出 ZIP 生成清理后的跨浏览器导入包；本次导入包含 14 个启用脚本，其中 6 个为当前正式构建、8 个沿用可信远程更新来源。
- 所有单 package dev server 统一从 `localhost:5173` 启动；端口被占用时由 Vite 自动顺延到 5174、5175 等后续端口。斗鱼 CSP 已允许 `http://localhost:*`，同时仍需在 Chromium 中为目标站点开启本地/环回网络访问权限。

### 2026-07-14

- 将 Vite 升级到 8，并同步升级 `vite-plugin-monkey` 8。
- 每个 package 的 `dev` 改回官方模板使用的 `vite`；根命令要求明确指定一个 package，不再默认并发启动全部脚本。
- 移除 dev gateway、`GM_xmlhttpRequest` loader、bundle 轮询和整页刷新，恢复插件原生安装页与 Vite HMR。
- CSP 处理采用官方文档建议的 `Disable-CSP` 扩展，由开发者仅在调试期间启用。

### 2026-07-12

- 新增单端口路径式 dev gateway：所有开发版固定使用 `127.0.0.1:5173/<package>/install.user.js`，内部 Vite worker 端口不再进入 Tampermonkey 安装地址。
- gateway 代理 `vite-plugin-monkey` 安装/entry 路由、Vite 模块和 HMR WebSocket；实测安装脚本 origin、`/@vite/client`、`/src/main.js` 和 WebSocket 握手均能按 package path 工作。
- `pnpm dev` 默认启动全部 package，并在 worker 就绪后自动打开所有 Tampermonkey 安装页；支持传入 package 子集和 `--no-open`。

### 2026-07-11

- 新增共享 `shared/userscript-config.ts`：统一读取 package 版本，生成 `.user.js` / `.meta.js`，并注入 GitHub Pages 的 `@updateURL` / `@downloadURL`。
- 确定 `ccccHz/userscripts` 为源码仓库，`https://ccccHz.github.io/userscripts/` 为生产版分发入口；保留每个脚本原有 `@namespace`。
- 新增 GitHub Pages workflow 和 `scripts/prepare-pages.mjs`，push 到 `main` 后自动测试、类型检查、构建、汇总并部署所有 userscript。
- 提高所有 package 的首次 Pages 发布版本，确保已安装旧版本能识别生产更新。

### 2026-07-08

- 修复 `douyin-live-optimizer` dev 调试时 `ReferenceError: mscststs is not defined` 的迁移缺口：不再依赖远程 `@require` 提供全局变量。
- 从 Tampermonkey 导出包缓存中提取 `MSCSTSTS-TOOLS.js` 的 `sleep`、`wait`、`hijackXMLHttpRequest` 能力，落为 `userscripts/shared/mscststs.js` 本地共享 ESM 模块。
- `douyin-live-optimizer` 和 `kuaishou-live-optimizer` 改为 `import mscststs from "../../../shared/mscststs.js"`；对应 `vite.config.ts` 移除 `require` 字段。
- 新增 `test/mscststs.test.mjs` 覆盖共享 helper API、DOM 轮询和 `XMLHttpRequest` hook；更新 workspace 结构测试，防止 live optimizer package 回退到远程 `@require`。
- 将 `douyin-live-optimizer` 的底部礼物栏清理抽为 `src/dom-cleanup.js`：优先删除 `#BottomLayout`，没有该容器时通过 `data-e2e="gifts-container"` / `data-e2e="gifts-switch"` / `#giftPanelEntrance` 找到共享礼物栏根节点，并保留旧 `.gitBarOptimizeEnabled` 向上查找兜底。
- 补充全屏底部 `游戏` 入口清理：通过 `iframe[data-container-id^="@annie/web_"]` 作为唤醒目标，再向上确认包含 `游戏` 文本的根容器，避免误删无关 annie iframe。
- 修复全屏底部清理误删播放器的问题：真实页面中播放器 `ServiceCenterLayout` 也存在 `@annie/web_...` iframe，不能无限向上爬到包含底部 `游戏` 文本的大容器；当前只在 iframe 附近几层紧凑布局内寻找游戏栏根节点。
- 将 `屏蔽礼物特效` 从占位 selector 改为本地模块 `src/gift-effects.js`：`data-e2e="gift-setting"` 始终存在，实机 Console 已确认 hover 事件可打开菜单；当前实现随后短轮询 `data-e2e="effect-switch"`，判断状态并点击第一层子节点轨道，100ms 后发送 leave 事件并移动到播放器中央，使菜单立即收起，同时保留任务锁防止 SPA 路由重复切换。
- 新增 `src/wish-popup.js`：使用持续的 `MutationObserver` 监听 `.dylive-tooltip`，匹配 `帮主播完成心愿吧` 或 `点亮展馆帮主播集星` 后删除整块 tooltip，支持多个目标弹层先后出现；同时保留 `[data-e2e="exhibition-banner"] .dylive-tooltip` 作为旧结构兜底，但不再为该 selector 单独启动无限等待。
- 抽出 `src/runtime-events.js` 统一处理 URL 变化和全屏变化：URL 变化继续重跑主流程，`fullscreenchange` 只重新清理底部礼物栏。
- 新增 `packages/douyin-live-optimizer/test/dom-cleanup.test.mjs`、`test/gift-effects.test.mjs`、`test/wish-popup.test.mjs` 和 `test/runtime-events.test.mjs`，覆盖 `#BottomLayout`、普通礼物栏、全屏礼物入口、全屏 `游戏` 入口、播放器服务区 annie iframe 不能被误删、旧标记、礼物特效开关、`effect-switch`、礼物设置菜单延迟渲染、哈希 class 右侧开关、心愿 tooltip 清理和全屏事件重清理。
- 验证命令：`pnpm test`、`pnpm -r type-check`、`pnpm -r build`。

### 2026-07-06

- 将 Tampermonkey 中仍启用的 `skip ads` 从 `file://` 引用迁移为 `userscripts/packages/skip-ads`。
- 保留原 `nga/main.js` 行为：移除 `localStorage` 中的 `adslazyload_bbs_ads12`。
- 根据导出包保留 `skip ads` metadata：匹配 `https://bbs.nga.cn/*` 和 `https://nga.178.com/*`，`grant` 为 `none`。
- 将 Tampermonkey 中仍启用的 `huya extend` 从 `file://` 引用迁移为 `userscripts/packages/huya-extend`。
- 保留原 `huya/main.js` 行为：更新 `localStorage.preadShow`，等待清晰度列表并点击可用的高清晰度选项。
- 根据导出包保留 `huya extend` metadata：匹配 `https://www.huya.com/*`，`grant` 为 `none`。
- 将当前启用的 `抖音直播优化` / `douyin/main.js` 迁移为 `userscripts/packages/douyin-live-optimizer`。
- 保留原抖音脚本的 DOM 移除、继续播放点击、礼物特效开关、清晰度选择和 history URL 变化重新执行逻辑。
- 初次迁移时保留 `MSCSTSTS-TOOLS.js` 为外部 `@require`；将原源码中的 `(timeout = 50)` 改为显式参数 `50`，避免 Vite 产物的 strict mode 下出现隐式全局赋值错误。该外部依赖已在 2026-07-08 改为本地共享模块。
- 将当前启用的 `快手直播优化` 从 Tampermonkey 导出包迁移为 `userscripts/packages/kuaishou-live-optimizer`。
- 保留原快手脚本的礼物列表等待和移除 `.foot` 逻辑；初次迁移时保留 `MSCSTSTS-TOOLS.js` 为外部 `@require`，并将 `(timeout = 50)` 改为显式参数 `50`。该外部依赖已在 2026-07-08 改为本地共享模块。
- 将当前启用的 `wikipedia auto dark` 从 Tampermonkey 导出包迁移为 `userscripts/packages/wikipedia-auto-dark`。
- 保留原 Wikipedia 脚本的主题 class 切换逻辑和 `@run-at document-end`。
- 检查 `微博直播夜间模式` 导出源码，确认当前只有空 IIFE，因此先不创建 package，后续决定删除或补实现。
- 对比 `douyuex` 的 `NoticeJs` toast 后，保留本地轻量 toast；新增 fullscreen host 挂载和 hover 暂停自动消失，减少直播画面层级遮挡。
- 修复恢复剩余全送后的并发顺序问题：粉丝牌房间赠送可并发，剩余全送必须等待续牌批次结束后再执行；全失败时不再标记当天已执行。

### 2026-07-05

- 根据浏览器验证结果，恢复默认“剩余全送 `12306`”行为；当前策略为每个粉丝牌直播间送 1 个，剩余荧光棒送默认房间。
- 记录后续配置需求：默认剩余赠送房间号应支持通过 GM 菜单或页面内 UI 管理。
- 根据测试需求，将 `auto-fans-continue` 默认策略改为每个粉丝牌直播间只送 1 个。
- 暂停默认“剩余全送 `12306`”行为，避免浏览器验证期间一次消耗过多荧光棒。
- 保留续牌计划里的剩余赠送开关，后续确认稳定后可再显式启用。
- 修复开发版验证时背包接口 JSON 解析失败的问题：移除 `no-cors` 请求模式，并将 `@match` 收窄到 `https://www.douyu.com/*`。
- 针对斗鱼页面可能污染 `console.log` 的问题，将主日志通道改为 `GM_log`，并保留 console fallback；脚本在 `document-start` 启动，主流程延后到 `DOMContentLoaded` 后执行，并暴露 `window.__chzAutoFansContinue` 用于浏览器侧确认运行状态。
- 明确剩余全送是最终部署前再启用的策略：当前测试版继续默认不送剩余，`createRenewalPlan` 保留 `sendRest: true` 作为显式开关。
- 增加本地轻量 toast/notifier，用于显示开始、每个直播间赠送结果、预检失败、完成和执行错误；“今天已经执行过”只写 logger，不弹 toast。
- 将赠送请求改为有限并发，默认并发数为 4，减少 20 多个直播间时页面还未执行完就被关闭的风险。

### 2026-07-04

- 确认当前阶段目标收束为最小可用：先保证 `auto-fans-continue` 可安装验证，再迁移仍在用且依赖 `file://` 的 Tampermonkey 脚本。
- 将跨机器迁移需求记录为迁移主线：把本地文件引用转为 git 管理的 package 和可同步更新的产物。
- 接收并纳入 `docs/tampermonkey-inventory.md`，作为全量脚本盘点和后续迁移优先级依据。
- 将浏览器扩展、后台静默执行、Bark 推送记录为 `auto-fans-continue` 的未来升级方向，当前不进入最小可用范围。

### 2026-06-30

- 为 `userscripts/` 初始化独立 git 仓库，并提交当前迁移基线：`b9782ec chore: initialize userscripts workspace`。
- 根据 `douyuEX_new/src/packages/FansContinue/FansContinue.js`，保留经过更多手动测试的续牌核心：先查背包，再选择 `268` 或 `2358`。
- 根据 `douyuEx_meta/src/packages/DailyAuto/dailyAuto.js`，保留每日自动策略：每个有牌子的直播间送 1 个，剩余送 `12306`。
- 将 `auto-fans-continue` 拆成 `douyu-api.js`、`renewal-plan.js`、`run-state.js` 和 `main.js`。
- 新增续牌计划、斗鱼 API 封装和主流程测试，防止背包接口、礼物兜底和每日状态逻辑回退。

### 2026-06-29

- 将旧 `UserScript/readme.md` 整理为 `userscripts/docs/todo.md`，作为后续迁移和斗鱼扩展重构的中文 TODO 清单。
- 确认旧 `UserScript/` 目录只包含 `readme.md` 后清理该目录。
- 对比附件中的实际在用 `autoFansContinue` 代码和已迁移版本，确认移除 userscript 头部后唯一差异是 `allRid`。
- 按实际在用代码将 `userscripts/packages/auto-fans-continue/src/main.js` 的剩余荧光棒目标房间从 `71415` 对齐为 `12306`。
- 根据用户反馈，决定彻底放弃 GM 存储，改用 `localStorage` 记录每日执行状态。
- 新增 `packages/auto-fans-continue/src/run-state.js`，用 `Ex_DailyAuto_LastTime`
  管理每日执行状态，并为缺失、当天、过期和非法日期场景补充测试。
- 将 `auto-fans-continue` 的 userscript `grant` 改为 `none`，移除 GM
  存储和调试暴露逻辑。

### 2026-06-16

- 根据用户要求，将工作区文档改为中文记录。

### 2026-06-15

- 确认 `vite-plugin-monkey` 是 userscript 构建插件，而 pnpm workspace
  管理需要在本项目中自行设计。
- 对照 `vite-plugin-monkey` 官方 README 重新评估迁移方案。
- 创建集中追踪文档。
- 选择 `autoFansContinue` 作为第一个迁移样板，因为它有完整 userscript
  头部和明确源码入口。
- 创建初始 pnpm workspace，并迁移 `autoFansContinue` 源码，未改变脚本主体。
- 发现当前 `pnpm` 运行时使用 Node 18.20.8，因此临时选择 Vite 6，避免
  Vite 7 对 Node 20.19+ 的要求。
- 确认 Volta 可用，并通过固定 Node 22.14.0 暂时取代 Vite 6 决策。
- 曾将根脚本和文档中的单包命令改为通过 Volta 执行，因为全局 pnpm
  当时绑定在 Node 18 上。
- 经用户确认后，选择 Node 24.14.0 作为工作区基线，因为它是 LTS，且已经是用户的 Volta 默认版本。临时 Node 22 决策被取代。
- 调查 pnpm 的 Node 18 绑定期间，曾安装 Vite 6.4.3；该临时依赖状态之后被取代。
- 在 Node 24.14.0 下重新安装 Volta 管理的 pnpm 10.17.1。现在直接运行
  `node` 和 `pnpm exec node` 都报告 Node 24.14.0。
- 安装最终核心工具链基线：Vite 7.3.5、`vite-plugin-monkey` 7.1.9、
  TypeScript 5.9.3、pnpm 10.17.1。
- 验证 workspace 结构测试、package 类型检查、生产构建和生成的 userscript metadata。
- 验证 `packages/auto-fans-continue/src/main.js` 与原脚本移除 userscript
  头部后的主体一致。
- 生成 `packages/auto-fans-continue/dist/auto-fans-continue.user.js`。
- 浏览器验证仍然有意保持未勾选状态。
