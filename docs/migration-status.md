# Userscript 迁移状态

最后更新：2026-07-05

## 状态说明

- `[ ]` 未开始
- `[~]` 进行中
- `[x]` 已完成并验证
- `[!]` 阻塞或需要决策

## 当前工作

- [~] 在 Tampermonkey 和斗鱼网页中验证 `auto-fans-continue` 的开发版与生产版 userscript。
- [~] 根据 `docs/tampermonkey-inventory.md`，优先迁移仍在用且依赖 `file://` 本地文件的脚本，目标是让这些脚本进入 git 管理，便于其他机器同步和更新。
- [ ] 确认下一个迁移入口，候选为 `huya/main.js`、`nga/main.js`、`douyin/main.js`。

## 迁移清单

| 原项目 | 候选入口 | 状态 | 备注 |
| --- | --- | --- | --- |
| `autoFansContinue` | 附件中的实际在用脚本 / `AutoFansContinue.user.js` | 等待浏览器验证 | 已按实际在用脚本对齐；每日执行状态使用 `localStorage`；续牌核心参考 `douyuEX_new`。当前测试阶段只给每个粉丝牌直播间送 1 个，不默认把剩余送 `12306`；最终部署前再恢复剩余全送。验证入口收窄为 `https://www.douyu.com/*`，避免从其他子域名跨源读取斗鱼接口。日志优先走 `GM_log`，运行状态也可检查 `window.__chzAutoFansContinue`。 |
| `biliDM` | 未识别 | 阻塞 | 目录中包含库和实验项目，但未发现 `==UserScript==` 入口。 |
| `douyin` | `main.js` | 未开始 | `origin.js` 暂作为历史/参考版本保留。 |
| `douyu-ban` | 未确认 | 阻塞 | 存在多个实验入口，并且原目录有未提交修改。 |
| `huya` | `main.js` | 阻塞 | 裸脚本，需要确认目标 `@match` metadata。 |
| `nga` | `main.js` | 阻塞 | 裸脚本，需要确认目标 `@match` metadata。 |
| `weiboLive` | `main.js` | 阻塞 | 当前文件看起来是已经生成的 React userscript bundle。 |

## 工作区检查表

- [x] 创建迁移追踪文档。
- [x] 创建根 pnpm workspace 配置。
- [x] 增加 workspace 结构验证脚本和测试。
- [x] 增加第一个 userscript package。
- [x] 安装依赖。
- [x] 运行结构验证、类型检查和生产构建。
- [x] 检查生成的 userscript metadata。
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
- [x] 将 `auto-fans-continue` 的测试阶段策略改为只给每个粉丝牌直播间送 1 个，暂不默认赠送剩余荧光棒。
- [~] 将 `auto-fans-continue` 的最终部署策略记录为剩余荧光棒全送 `12306`，但当前测试版暂不启用。
- [x] 移除斗鱼 API 请求里的 `mode: "no-cors"`，避免背包接口响应 body 不可读导致 `Unexpected end of input`。
- [x] 为 `auto-fans-continue` 增加斗鱼页面可用的 `GM_log` 日志通道和 `window.__chzAutoFansContinue` 运行状态入口。
- [x] 为 `auto-fans-continue` 增加状态级 toast 提示。
- [x] 将 `auto-fans-continue` 的赠送请求从串行改为默认最多 4 个并发。

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
- 迁移后的脚本优先使用 GitHub raw、release 产物，还是继续保留本地构建产物安装？

## 活动记录

### 2026-07-05

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
