# Userscript TODO

最后更新：2026-07-25

这个文档承接旧目录 `UserScript/readme.md` 中的待办内容。旧目录原本用于规划 userscript 统一管理和斗鱼相关功能重构；内容已迁移到这里，旧目录随后清理。

## 当前迁移 TODO

- [x] 在 `userscripts/` 中集中管理本仓库正在使用且需要自行维护的 userscript。
- [x] 使用 `vite-plugin-monkey` 管理开发和构建流程。
- [x] 迁移 `autoFansContinue`，并以当前浏览器实际在用代码为准。
- [x] 对齐 `douyuEX_new` 手动续牌子逻辑和 `douyuEx_meta` 每日自动逻辑，重构 `auto-fans-continue`。
- [ ] 在 Tampermonkey 中验证 `auto-fans-continue` 开发版 userscript。
- [ ] 在斗鱼网页中验证 `auto-fans-continue` 生产版 userscript。
- [ ] 在 Tampermonkey 和抖音直播页面中验证 `douyin-live-optimizer`。
- [ ] 在 Tampermonkey 和虎牙页面中验证 `huya-extend`。
- [ ] 在 Tampermonkey 和 NGA 页面中验证 `skip-ads`。
- [ ] 在 Tampermonkey 和快手直播页面中验证 `kuaishou-live-optimizer`。
- [ ] 在 Tampermonkey 和 Wikipedia 页面中验证 `wikipedia-auto-dark`。
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
- [ ] 在抖音直播页验证 `douyin-live-optimizer` 的底部栏清理，尤其是全屏切换后的新礼物栏和 `游戏` 入口是否被移除。
- [ ] 在抖音直播页验证 `屏蔽礼物特效` 开关最终状态，确认脚本直接调用内层轨道 `.click()` 能自动开启；已增加页面级 `running` / `done` 标记，避免初始化、路由事件或重复脚本实例连续点击导致开关重新关闭。Console 会输出 `userscript: douyin gift effect blocker` 及查找/点击结果。
- [ ] 在抖音直播页验证 `帮主播完成心愿吧` / 主播心愿 tooltip 出现后会自动消失。
- [ ] 后续重新评估 `douyin-live-optimizer` 的 URL 注入和 SPA 路由策略；当前暂时保留 `@match https://*.douyin.com/**` 以及 `pushState` / `replaceState` / `popstate` 触发，因为需要覆盖从关注页站内进入直播间的场景，确认替代方案前不收窄匹配范围。

## 斗鱼扩展/重构 TODO

- [ ] 给现有 `douyuEx` 扩展功能；如果需要同步上游，先评估是否要拉取 GitHub 仓库更新版本。
- [ ] 解决旧 `douyuEx_meta` 每次上游更新都需要手工 merge 的问题，目标是把本地扩展功能与上游代码解耦。
- [ ] 在现有聊天区隐藏日榜界面上增加显示房间人数。
- [ ] 调研新版 `douyuex` 简洁模式显示贵宾较慢的问题，判断是否需要本地替代实现。
- [x] 每日自动续荧光棒策略恢复为：每个有牌子的直播间送 1 个，剩余荧光棒全部送给默认房间 `12306`。
- [x] 将剩余荧光棒默认赠送房间号做成 GM 菜单配置；无有效配置时继续使用 `12306`，新配置从下次执行生效。
- [x] 为自动续荧光棒增加 toast 提示：开始、每个直播间赠送结果、预检失败、完成和执行错误；“今天已执行”只写日志。
- [x] 将自动续荧光棒赠送请求改为有限并发，默认并发数为 4。
- [x] 开发版验证入口暂时限定为 `https://www.douyu.com/*`，斗鱼 API 请求不使用 `no-cors`。
- [x] 处理斗鱼页面 `console.log` 可能不可用的问题：主日志通道改为 `GM_log`，并提供 `window.__chzAutoFansContinue` 作为运行状态检查入口。
- [x] 为自动续荧光棒增加三层防重：`@noframes`、同一 document 页面启动标记，以及作为最后兜底的 `localStorage` 运行中锁。
- [ ] 处理每日荧光棒获取时机问题：必须进入直播间后才会获得当日荧光棒；当前逻辑在背包为空或没有荧光棒时不会标记当天已执行，后续再次打开斗鱼页面会继续尝试。
- [ ] 未来调研并实现通过 `douyuSocket` 手动登录任意房间领取当日荧光棒，再执行赠送；目标是减少依赖用户自然打开直播间后的时机。
- [ ] 未来评估将 `auto-fans-continue` 升级为浏览器扩展：后台静默执行、读取授权域名 cookie、执行结果推送到 Bark。
- [ ] 调研直播间实际人数来源：网页现有贵宾数据不一定等于手机端显示的实际人数，可能需要逆向 socket 包。
- [ ] 删除或禁用 `douyuex` 原版每周 GitHub star 提醒；需要检索原代码仓库，可能是通过 localStorage 时间匹配实现。
- [ ] 对比 `douyuEx_meta` 和 `douyuex`，找出本地版本遗漏的功能。
- [ ] 关闭 `douyuex` 截屏功能；原版只支持关闭 7 天。

## Userscript 管理 TODO

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
