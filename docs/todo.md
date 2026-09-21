# Userscript TODO

最后更新：2026-09-02

这个文档承接旧目录 `UserScript/readme.md` 中的仓库级和其他 package 待办内容。
`douyu-web-enhancer` 的待办已归入 `packages/douyu-web-enhancer/docs/todo.md`。

## 当前迁移 TODO

- [x] 在 `userscripts/` 中集中管理本仓库正在使用且需要自行维护的 userscript。
- [x] 使用 `vite-plugin-monkey` 管理开发和构建流程。
- [x] 迁移 `autoFansContinue`，并以当前浏览器实际在用代码为准。
- [x] 对齐 `douyuEX_new` 手动续牌子逻辑和 `douyuEx_meta` 每日自动逻辑，重构 `auto-fans-continue`。
- [x] `auto-fans-continue` 开发版 GM 房间配置菜单、带登录态房间连接，以及新一天自动领取后继续赠送均已完成实机验证。
- [x] 在斗鱼网页中验证当前 `auto-fans-continue` 生产版 userscript；`0.132.0` 的自动领取回退发布后需补一次定向验证。
- [x] 在 Tampermonkey 和抖音直播页面中验证 `douyin-live-optimizer`。
- [x] 在 Tampermonkey 和虎牙页面中验证 `huya-extend`。
- [x] 在 Tampermonkey 和 NGA 页面中验证 `skip-ads`。
- [x] 在 Tampermonkey 和快手直播页面中验证 `kuaishou-live-optimizer`。
- [x] 在 Tampermonkey 和 Wikipedia 页面中验证 `wikipedia-auto-dark`。
- [x] `微博直播夜间模式` 不迁移；导出包中只有空 IIFE，最终迁移包已排除。
- [x] `douyu-ban` 不进入当前 userscript 迁移主线；现有入口属于停用实验代码。
- [x] `weiboLive/main.js` 不迁移；当前使用的 `微博PC直播弹幕助手` 已有可信远程更新来源。
- [x] `biliDM` 不进入当前 userscript 迁移主线；未发现实际使用的浏览器 userscript 入口。
- [x] 按 `docs/tampermonkey-inventory.md` 清单，将仍在用且依赖 `file://` 的自维护脚本迁移为 git 管理的 package。
- [x] 迁移 `skip ads` / `nga/main.js` 为 `userscripts/packages/skip-ads`。
- [x] 迁移 `huya extend` / `huya/main.js` 为 `userscripts/packages/huya-extend`。
- [x] 迁移 `抖音直播优化` / `douyin/main.js` 为 `userscripts/packages/douyin-live-optimizer`。
- [x] 迁移 `快手直播优化` 为 `userscripts/packages/kuaishou-live-optimizer`。
- [x] 迁移 `wikipedia auto dark` 为 `userscripts/packages/wikipedia-auto-dark`。
- [x] 迁移 `weibo improvement` 为 `userscripts/packages/weibo-improvement`，移除跨机器不可用的 `file://` 依赖。
- [x] 迁移 `vimium-c blur input focus` 为 `userscripts/packages/vimium-c-blur-input-focus`，移除跨机器不可用的 `file://` 依赖。
- [x] 将常用 `MSCSTSTS-TOOLS.js` 改为本地共享 `shared/mscststs.js`，修复 dev 调试时全局 `mscststs` 不存在的问题。
- [x] 为 `douyin-live-optimizer` 增加底部礼物栏/`#BottomLayout` 清理规则，覆盖残留空白、新礼物栏容器、全屏礼物入口和全屏 `游戏` 入口；进入或退出全屏时会重新清理。
- [x] 为 `douyin-live-optimizer` 增加自动打开 `data-e2e="gift-setting"` 并开启 `屏蔽礼物特效` 的本地实现；入口始终存在，当前只对它发送实机验证有效的 hover 事件，等待弹层出现后点击 `data-e2e="effect-switch" > div` 内层轨道，再等待 100ms 发送 leave 事件并移动到播放器中央，让弹层立即收起。
- [x] 为 `douyin-live-optimizer` 增加 `帮主播完成心愿吧` tooltip 弹窗清理；通过 `.dylive-tooltip` + 文本匹配删除整块弹层。
- [x] 将 `点亮展馆帮主播集星` 纳入同一套 `.dylive-tooltip` 文本清理，并改为持续的 `MutationObserver`，支持多个目标弹层先后出现；保留 `[data-e2e="exhibition-banner"] .dylive-tooltip` 作为旧页面结构兜底，但不再为它单独启动无限等待。
- [x] 在抖音直播页验证 `douyin-live-optimizer` 的底部栏清理，包括全屏切换后的新礼物栏和 `游戏` 入口。
- [x] 在抖音直播页验证 `屏蔽礼物特效` 开关最终状态，确认脚本直接调用内层轨道 `.click()` 能自动开启，且页面级 `running` / `done` 标记不会导致重复切换。
- [x] 为 `douyin-live-optimizer` 增加恢复播放：从后台切回页面时，只有同时识别到“长时间无操作”和“暂停播放”提示才会点击“继续播放”，并在 0、250、1000、2500ms 重试，兼容提示的延迟渲染。
- [x] 在抖音直播页验证 `帮主播完成心愿吧` / 主播心愿 tooltip 出现后会自动消失。
- [ ] 后续重新评估 `douyin-live-optimizer` 的 URL 注入和 SPA 路由策略；当前暂时保留 `@match https://*.douyin.com/**` 以及 `pushState` / `replaceState` / `popstate` 触发，因为需要覆盖从关注页站内进入直播间的场景，确认替代方案前不收窄匹配范围。

## `auto-fans-continue` TODO
- [ ] 将当前 `auto-fans-continue` 整套并入 `douyu-web-enhancer`，完整保留现有行为、默认值、房间配置、三层防重、运行锁、日志、toast、登录态房间连接和测试；不采用 DouyuEx 归档续牌实现。合并迁移验证完成前保留独立 package 作为可运行基准。
- [x] 为 `douyu-web-enhancer` 建立统一配置页，集中管理现有功能开关、默认行为、自动化参数、目标房间、运行状态和日志入口；自动荧光棒的临时 GM 房间配置菜单已移除，后续功能继续接入同一控制中心。
- [ ] 抽取每日自动化共享基础设施：页面启动认领、带过期时间的每任务跨 tab 锁、独立运行账本、有界持久审计日志、可复制诊断和共享 toast；不得用单一全局“今日完成”掩盖部分失败。
- [x] 每日自动续荧光棒策略恢复为：每个有牌子的直播间送 1 个，剩余荧光棒全部送给默认房间 `12306`。
- [x] 将剩余荧光棒默认赠送房间号做成 GM 菜单配置；无有效配置时继续使用 `12306`，新配置从下次执行生效。
- [x] 为自动续荧光棒增加 toast 提示：开始、每个直播间赠送结果、预检失败、完成和执行错误；“今天已执行”只写日志。
- [x] 将自动续荧光棒赠送请求改为有限并发，默认并发数为 4。
- [x] 开发版验证入口暂时限定为 `https://www.douyu.com/*`，斗鱼 API 请求不使用 `no-cors`。
- [x] 处理斗鱼页面 `console.log` 可能不可用的问题：主日志通道改为 `GM_log`，并提供 `window.__chzAutoFansContinue` 作为运行状态检查入口。
- [x] 为自动续荧光棒增加三层防重：`@noframes`、同一 document 页面启动标记，以及作为最后兜底的 `localStorage` 运行中锁。
- [x] 已实现并完成跨日实机验证每日荧光棒获取时机回退：背包为空或没有荧光棒时，先用当前浏览器登录态连接配置房间，再退避轮询背包、以实际查询到荧光棒作为到账完成条件。2026-07-30 在未进入任何直播间、仅打开关注页的条件下，连接房间 `52` 后首次 500ms 轮询即获取 120 个荧光棒，随后对 22 个粉丝牌房间各赠送 1 个并将剩余 98 个全部赠送，成功 23、失败 0、跳过 0，全程无需刷新等待到账。
- [x] 已实现并实机验证独立的带登录态 `wsproxy` 房间连接模块；使用 `acf_*` Cookie 构造 `loginreq`，收到 `loginres` 后发送 `h5ckreq`，以 `h5ckres` 作为完成信号并立即断开。开发期 GM 测试菜单在验证完成后移除；唯一的房间配置同时用于 Socket 触发领取和剩余全部赠送。
- [ ] 未来评估将 `auto-fans-continue` 升级为浏览器扩展：后台静默执行、读取授权域名 cookie、执行结果推送到 Bark。
- [ ] 未来评估将 `auto-fans-continue` 服务化为 Docker 每日任务：复用已验证的 WebSocket、背包、粉丝牌和赠送协议；以 Asia/Shanghai 定时调度、持久化每日状态、失败通知为常规基础设施。主要待验证难点是服务器侧扫码登录、Cookie 安全保存和失效后的续期；不把 Cookie 提交到仓库、普通日志或通知内容中。

## Userscript 管理 TODO

- [x] 改善单 package 开发命令的选择体验：`pnpm dev` 现在同时接受逻辑 package 名和可由 shell 补全的 `packages/<name>` 路径，例如 `pnpm dev packages/vimium-c-blur-input-focus`。评估后不增加无参数交互式选择，保持命令可脚本化且不依赖 TTY；`pnpm -C packages/<name> dev` 仍可直接使用。
- [x] 选择 `vite-plugin-monkey` 作为 userscript 构建插件。
- [x] 新建 `userscripts/` 工作区，而不是继续使用旧 `UserScript/` 目录。
- [x] 建立中文迁移状态、决策记录和 TODO 文档。
- [x] 为 `userscripts/` 初始化独立 git 仓库，并提交当前迁移基线。
- [x] 建立 Tampermonkey 全量脚本整理清单，标记 `file://` 本地依赖、远程更新来源和迁移优先级。
- [x] 完成最小可用迁移：`file://` 本地引用已经替换为 git 管理和 Pages 分发，不展开复杂后台化或可视化。
- [x] 每个实际使用且需要本仓库维护的 userscript 都已迁移为独立 package。
- [x] `skip-ads` 已用正式 package 产物替换旧 `file://` 脚本并进入最终迁移包。
- [x] `huya-extend` 已用正式 package 产物替换旧 `file://` 脚本并进入最终迁移包。
- [x] `douyin-live-optimizer` 已安装正式 Pages 版本，并完成 `2026.7.15` 到 `2026.7.25` 的自动更新验证。
- [x] `kuaishou-live-optimizer` 已用正式 package 产物替换旧脚本并进入最终迁移包。
- [x] `wikipedia-auto-dark` 已用正式 package 产物替换旧脚本并进入最终迁移包。
- [x] 开发方式回归官方单 package `vite serve`，使用原生 HMR；目标站点 CSP 在开发期通过 `Disable-CSP` 处理。
- [x] 完成 build 发布流程：使用 GitHub Pages 分发，package 版本驱动 `.user.js` / `.meta.js`，注入 `@updateURL` / `@downloadURL`，并由 GitHub Actions 自动测试、构建和发布。
- [x] 明确版本维护策略：当前规模下继续手动提高受影响 package 的 `package.json` `version`，不增加 Git hook、CI 自动递增或版本门禁；具体约束写入 README，要求参与修改代码的 Agent 在交付前检查并报告版本变化。
- [x] 验证 Pages 更新服务端链路：8 个 package 的远程 `.meta.js` 与 `.user.js` 版本、`@updateURL`、`@downloadURL` 全部一致，最终迁移包清单引用相同地址。
- [x] 完成 Tampermonkey 客户端生产更新验证：本地 `douyin-live-optimizer@2026.7.15` 自动检测到 Pages 上的 `2026.7.25`，并成功更新 `.user.js`。
- [x] 首次迁移时保留旧脚本行为，没有在迁移提交中同时进行大规模重构。
- [~] 行为验证通过后，再继续评估是否抽取更多共享工具和 ESM GM API；`mscststs` 已先因 dev 调试问题本地化。

## 备注

- 旧目录 `UserScript/` 已不再作为工作区入口使用。
- 原始 TODO 来自 `UserScript/readme.md`，这里已经补充为后续可勾选的迁移和重构清单。
