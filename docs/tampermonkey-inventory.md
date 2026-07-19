# Tampermonkey 脚本整理清单

最后更新：2026-07-19

来源：`/Users/chz/Desktop/69be9746-2600-415c-9a72-e22c2d5fcbac.zip`

这个文档只做整理和迁移前盘点，不代表已经删除、停用或迁移任何脚本。

## 总览

- 导出包中共有 32 个 `.user.js` 脚本。
- 当前启用 17 个，停用 15 个。
- 有 `file://` 本地依赖的脚本 10 个。
- 有 `@updateURL` 或 `@downloadURL` 的脚本 11 个。
- 本轮优先目标是迁移仍在用、没有远程更新、依赖本地文件或本仓库源码的脚本。
- 当前阶段先解决跨机器迁移问题：把仍在用的 `file://` 本地引用转为 git 管理的 package 和可同步更新的安装产物。

## 整理规则

- **已迁移或迁移中**：已经进入 `userscripts/` 工作区，先完成浏览器验证。
- **迁移优先**：当前启用，且依赖本仓库源码或没有可靠远程更新地址。
- **外部本地脚本**：当前启用，但 `file://` 指向本项目外部目录；需要决定是否纳入这个项目。
- **外部保留**：第三方脚本或已有远程更新地址的脚本，暂时不迁移源码。
- **参考/归档**：停用但可能是旧实现、开发版本或可对照源码；不作为第一批迁移对象。
- **删除候选**：停用、实验性质明显、路径失效、或已有更合适替代脚本；先记录，等人工确认后再删除。

## 建议迁移顺序

1. 完成 `auto-fans-continue` 的 Tampermonkey 和目标网站验证。
2. 迁移本仓库中当前启用且路径明确的脚本：`huya/main.js`、`nga/main.js`、`douyin/main.js`。
3. 迁移当前启用但只有导出包源码的自用小脚本：`快手直播优化`、`微博直播夜间模式`、`wikipedia auto dark`。
4. 决定是否把项目外部的 `basic_TampMonkey_script` 脚本纳入本项目。
5. 最后再处理停用脚本、旧实验入口和第三方脚本同步问题。

## 当前阶段边界

- 先做最小可用迁移，不把浏览器扩展、后台定时任务、Bark 推送和复杂可视化纳入当前批次。
- 迁移完成的脚本应能在另一台机器上通过 git 同步源码，并通过明确的构建或安装产物恢复 Tampermonkey 脚本。
- 对已有远程更新来源的第三方脚本，先记录安装来源，不复制源码。
- 对本机路径失效或停用脚本，只记录归档或删除候选，不在迁移过程中直接删除。

## 已迁移或迁移中

| 脚本 | Tampermonkey 状态 | 导出版本 | 当前判断 | 下一步 |
| --- | --- | --- | --- | --- |
| `斗鱼每日自动保底续荧光棒` | 停用 | `0.126` | 已发布 `auto-fans-continue@0.129.0`，并进入清理导入包 | 导入后验证 Tampermonkey 远程检查更新 |
| `skip ads` | 启用 | `2025-02-28` | 已发布 `skip-ads@2026.7.15`，并用正式版本替换清理包中的 `file://` 安装 | 导入后验证 NGA 页面和远程更新 |
| `huya extend` | 启用 | `0.1` | 已发布 `huya-extend@0.2.0`，并用正式版本替换清理包中的 `file://` 安装 | 导入后验证虎牙页面和远程更新 |
| `抖音直播优化` | 启用 | `2025-07-03` | 已发布 `douyin-live-optimizer@2026.7.15`，并进入清理导入包 | 导入后验证抖音直播页和远程更新 |
| `快手直播优化` | 启用 | `2025-10-04` | 已发布 `kuaishou-live-optimizer@2026.7.15`，并进入清理导入包 | 导入后验证快手直播页和远程更新 |
| `wikipedia auto dark` | 启用 | `2025-01-28` | 已发布 `wikipedia-auto-dark@2026.7.15`，并进入清理导入包 | 导入后验证 Wikipedia 页面和远程更新 |
| `weibo improvement` | 启用 | `0.1` | 已迁移为 `weibo-improvement@0.2.0`，清理包中不再依赖 `file://` | 导入后验证微博页面和远程更新 |
| `vimium-c blur input focus` | 启用 | `0.1` | 已迁移为 `vimium-c-blur-input-focus@0.2.0`，清理包中不再依赖 `file://` | 导入后验证目标页面和远程更新 |

## 迁移优先

| 优先级 | 脚本 | Tampermonkey 状态 | 入口或候选来源 | 判断 | 下一步 |
| --- | --- | --- | --- | --- | --- |
| P1 | `微博直播夜间模式` | 启用 | 导出包中的 `.user.js` | 导出源码只有空 IIFE，未发现实际行为 | 先不迁移；确认是否删除或补实现 |

## 外部本地脚本

这些脚本原本使用本项目外部的 `file://` 依赖；两项实际使用脚本已在 2026-07-19 迁入工作区。

| 脚本 | Tampermonkey 状态 | 本地依赖 | 判断 | 建议 |
| --- | --- | --- | --- | --- |
| `Bilibili Evolved (Local)` | 停用 | `/Users/chz/myWorkSpace/myJS/node/Bilibili-Evolved/dist/bilibili-evolved.dev.user.js` | 本地开发版，当前停用，且已有启用的远程 `Bilibili Evolved` | 不进入第一批迁移；可归档或删除 |

## 外部保留

这些脚本当前启用，且已经有远程更新地址或明显属于第三方脚本。迁移阶段先不处理源码，只记录安装来源。

| 脚本 | 状态 | 版本 | 远程更新 | 备注 |
| --- | --- | --- | --- | --- |
| `DouyuEx-斗鱼直播间增强插件` | 启用 | `2026.06.03.01` | 有 | 斗鱼增强主插件，先保留外部安装 |
| `「CSDNGreener」🍃CSDN广告完全过滤|免登录|个性化排版|最强老牌脚本|持续更新` | 启用 | `5.0.4` | 有 | 第三方脚本，先保留外部安装 |
| `Bilibili Evolved` | 启用 | `2.10.10` | 有 | 已有远程版本；本地开发版停用 |
| `dl-librescore` | 启用 | `0.35.31` | 有 | 第三方脚本，先保留外部安装 |
| `Twitter Block Porn` | 启用 | `1.6.1` | 有 | 第三方脚本，先保留外部安装 |
| `网盘直链下载助手` | 启用 | `6.2.7` | 有 | 第三方脚本，先保留外部安装 |
| `微博PC直播弹幕助手` | 启用 | `1.3.1` | 有 | 仓库中存在 `weiboLive/main.js` 和 `tampermonkey-scripts/packages/weibo-pc-live-comments`，但当前已有 GreasyFork 更新；迁移可后置 |
| `小红书PC端直播美化脚本` | 启用 | `1.0.1` | 有 | 仓库中存在 `tampermonkey-scripts/packages/xhs-pc-live-style`，但当前已有 GreasyFork 更新；迁移可后置 |

## 参考/归档

| 脚本 | 状态 | 本地依赖或来源 | 判断 |
| --- | --- | --- | --- |
| `DouyuEx_Meta` | 停用 | `/Users/chz/myWorkSpace/myJS/直播插件/douyuEx_meta/devtool/dyEx_dev.user.js` | 旧斗鱼增强开发入口，适合作为对照源码，不作为第一批迁移 |
| `bliveproxy-demo1` | 停用 | `/Users/chz/myWorkSpace/myJS/直播插件/socketHook/bliveproxy.user.js` | 用户确认不进入迁移包 |
| `douyu WS hook` | 停用 | `/Users/chz/myWorkSpace/myJS/直播插件/socketHook/dist/douyu-websocket-hook.dev.js` | 用户确认不进入迁移包 |
| `Bilibili Live Banned Danmaku Marker` | 停用 | 远程更新地址 | 用户确认不进入迁移包 |

## 删除候选

这些脚本不建议进入迁移主线。删除前仍建议在 Tampermonkey 中再人工确认一次。

| 脚本 | 状态 | 原因 |
| --- | --- | --- |
| `server:test-vite-monkey` | 启用 | 名称和 namespace 显示是 `vite-plugin-monkey` 测试脚本，虽然当前启用，但不应默认迁移 |
| `server:test` | 停用 | `vite-plugin-monkey` 测试脚本 |
| `mooc auto` | 停用 | `file://` 指向 `/Users/chz/myWorkSpace/myJS/jxjy/main.js`，当前路径检查不存在 |
| `test ban socket` | 停用 | 导出路径是 `/Users/chz/myWorkSpace/myJS/douyu-ban/banBySocket.js`，与当前仓库路径不一致；更像旧实验入口 |
| `New Userscript`（知乎） | 停用 | 默认命名脚本，停用，缺少明确用途 |
| `New Userscript`（百度） | 停用 | 默认命名脚本，停用，缺少明确用途 |
| `New Userscript`（Overleaf） | 停用 | 默认命名脚本，停用，缺少明确用途 |
| `小红书直播优化` | 停用 | 与启用的 `小红书PC端直播美化脚本` 功能接近，且当前停用 |
| `抖音直播保持活跃 - 防止自动暂停` | 停用 | 用户确认不进入迁移包 |
| `赛道网聊天室拉黑助手` | 停用 | 用户确认不进入迁移包 |

## 全量脚本索引

| # | 状态 | 脚本 | 版本 | 匹配数 | `@require` 数 | `file://` | 远程更新 |
| ---: | --- | --- | --- | ---: | ---: | ---: | --- |
| 1 | 启用 | `DouyuEx-斗鱼直播间增强插件` | `2026.06.03.01` | 18 | 6 | 0 | 有 |
| 2 | 启用 | `「CSDNGreener」🍃CSDN广告完全过滤|免登录|个性化排版|最强老牌脚本|持续更新` | `5.0.4` | 1 | 3 | 0 | 有 |
| 3 | 启用 | `Bilibili Evolved` | `2.10.10` | 1 | 1 | 0 | 有 |
| 4 | 启用 | `weibo improvement` | `0.1` | 1 | 1 | 1 | 无 |
| 5 | 启用 | `vimium-c blur input focus` | `0.1` | 4 | 1 | 1 | 无 |
| 6 | 启用 | `server:test-vite-monkey` | `0.0.0` | 1 | 0 | 0 | 无 |
| 7 | 启用 | `dl-librescore` | `0.35.31` | 2 | 0 | 0 | 有 |
| 8 | 启用 | `huya extend` | `0.1` | 1 | 1 | 1 | 无 |
| 9 | 启用 | `Twitter Block Porn` | `1.6.1` | 6 | 3 | 0 | 有 |
| 10 | 启用 | `网盘直链下载助手` | `6.2.7` | 18 | 3 | 0 | 有 |
| 11 | 启用 | `wikipedia auto dark` | `2025-01-28` | 1 | 0 | 0 | 无 |
| 12 | 启用 | `skip ads` | `2025-02-28` | 2 | 1 | 1 | 无 |
| 13 | 启用 | `抖音直播优化` | `2025-07-03` | 1 | 1 | 0 | 无 |
| 14 | 启用 | `快手直播优化` | `2025-10-04` | 1 | 1 | 0 | 无 |
| 15 | 启用 | `微博PC直播弹幕助手` | `1.3.1` | 1 | 2 | 0 | 有 |
| 16 | 启用 | `小红书PC端直播美化脚本` | `1.0.1` | 1 | 0 | 0 | 有 |
| 17 | 启用 | `微博直播夜间模式` | `2025-12-28` | 1 | 0 | 0 | 无 |
| 18 | 停用 | `斗鱼每日自动保底续荧光棒` | `0.126` | 1 | 0 | 0 | 无 |
| 19 | 停用 | `mooc auto` | `0.1` | 1 | 1 | 1 | 无 |
| 20 | 停用 | `test ban socket` | `0.1` | 1 | 1 | 1 | 无 |
| 21 | 停用 | `server:test` | `1.0.0` | 1 | 0 | 0 | 无 |
| 22 | 停用 | `Bilibili Evolved (Local)` | `300.0` | 1 | 2 | 1 | 无 |
| 23 | 停用 | `DouyuEx_Meta` | `2025.11.12.01` | 20 | 6 | 1 | 无 |
| 24 | 停用 | `New Userscript`（知乎） | `0.1` | 1 | 0 | 0 | 无 |
| 25 | 停用 | `New Userscript`（百度） | `0.1` | 1 | 0 | 0 | 无 |
| 26 | 停用 | `New Userscript`（Overleaf） | `0.1` | 1 | 0 | 0 | 无 |
| 27 | 停用 | `Bilibili Live Banned Danmaku Marker` | `0.4` | 1 | 0 | 0 | 有 |
| 28 | 停用 | `bliveproxy-demo1` | `0.1` | 3 | 3 | 1 | 无 |
| 29 | 停用 | `douyu WS hook` | `2025-05-11` | 1 | 1 | 1 | 无 |
| 30 | 停用 | `小红书直播优化` | `2025-07-03` | 1 | 1 | 0 | 无 |
| 31 | 停用 | `抖音直播保持活跃 - 防止自动暂停` | `2025-07-11` | 4 | 0 | 0 | 有 |
| 32 | 停用 | `赛道网聊天室拉黑助手` | `1.6.5` | 1 | 0 | 0 | 有 |

## 迁移时注意

- 首次迁移只对齐行为，不顺手重构逻辑。
- 每个可独立安装的脚本仍使用一个 package。
- 迁移后的 `dist/*.user.js` 需要补齐适合 GitHub 分发的 `@version`、`@updateURL`、`@downloadURL`。
- 对 `file://` 脚本，迁移完成后再从 Tampermonkey 中替换安装为 GitHub 或本地构建产物。
- 每个 package 需要记录推荐安装方式和目标 URL，避免换机器后只剩源码但不知道如何恢复 Tampermonkey 安装。
- 停用脚本先只进入删除候选，不在迁移过程中直接删除。
