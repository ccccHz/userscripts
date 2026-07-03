# Userscript TODO

最后更新：2026-07-05

这个文档承接旧目录 `UserScript/readme.md` 中的待办内容。旧目录原本用于规划 userscript 统一管理和斗鱼相关功能重构；内容已迁移到这里，旧目录随后清理。

## 当前迁移 TODO

- [~] 在 `userscripts/` 中集中管理本仓库正在使用的 userscript。
- [~] 使用 `vite-plugin-monkey` 管理开发和构建流程。
- [x] 迁移 `autoFansContinue`，并以当前浏览器实际在用代码为准。
- [x] 对齐 `douyuEX_new` 手动续牌子逻辑和 `douyuEx_meta` 每日自动逻辑，重构 `auto-fans-continue`。
- [ ] 在 Tampermonkey 中验证 `auto-fans-continue` 开发版 userscript。
- [ ] 在斗鱼网页中验证 `auto-fans-continue` 生产版 userscript。
- [ ] 确认 `douyin/main.js` 是否为下一个迁移入口。
- [ ] 确认 `huya/main.js` 和 `nga/main.js` 的目标 `@match`。
- [ ] 确认 `douyu-ban` 当前实际使用的入口文件。
- [ ] 判断 `weiboLive/main.js` 是否存在可维护源码，而不是只迁移构建产物。
- [ ] 判断 `biliDM` 中是否有需要作为浏览器 userscript 管理的功能。
- [~] 按 `docs/tampermonkey-inventory.md` 清单，将仍在用且依赖 `file://` 的脚本迁移为 git 管理的 package。

## 斗鱼扩展/重构 TODO

- [ ] 给现有 `douyuEx` 扩展功能；如果需要同步上游，先评估是否要拉取 GitHub 仓库更新版本。
- [ ] 解决旧 `douyuEx_meta` 每次上游更新都需要手工 merge 的问题，目标是把本地扩展功能与上游代码解耦。
- [ ] 在现有聊天区隐藏日榜界面上增加显示房间人数。
- [ ] 调研新版 `douyuex` 简洁模式显示贵宾较慢的问题，判断是否需要本地替代实现。
- [~] 测试阶段每日自动续荧光棒策略保持为：每个有牌子的直播间送 1 个，不把剩余荧光棒全送给指定直播间；toast 提示仍待浏览器侧评估。
- [ ] 处理每日荧光棒获取时机问题：必须进入直播间后才会获得当日荧光棒；如果未打开直播间或刚进入直播间就执行赠送，可能出错。
- [ ] 调研是否可以通过 `douyuSocket` 登录任意房间来获得当日荧光棒。
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
- [~] 当前阶段以最小可用为目标：先完成 `file://` 本地引用到 git 管理产物的迁移，不展开复杂后台化或可视化。
- [ ] 每个实际使用的 userscript 都迁移为一个独立 package。
- [ ] 为迁移后的脚本配置适合跨机器同步的安装方式，例如 GitHub raw/release 产物、本地构建产物或明确的更新地址。
- [ ] 首次迁移时保留旧脚本行为，不同时做大规模重构。
- [ ] 行为验证通过后，再评估是否抽取共享工具和 ESM GM API。

## 备注

- 旧目录 `UserScript/` 已不再作为工作区入口使用。
- 原始 TODO 来自 `UserScript/readme.md`，这里已经补充为后续可勾选的迁移和重构清单。
