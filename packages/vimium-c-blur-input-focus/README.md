# Vimium C 输入焦点修复

避免鱼吧编辑器、微博评论输入区、豆瓣搜索和淘宝页面抢占 Vimium C 焦点。

## 鱼吧适配（2026-11-02）

鱼吧将编辑器 CSS 类名从 `Editor-module__SR5oVG__editor` 改成了 `SR5oVG_editor`，旧脚本的固定类名规则失配。首页发帖区和动态正文评论区均已在当前 Chrome 实页核对。

现在使用 `contenteditable="true"`、`aria-roledescription="Editor"` 与非空 `data-placeholder` 共同识别鱼吧编辑器，不依赖构建哈希。保留原先每次聚焦即 blur 的行为；安装时及 DOM 就绪时检查当前焦点，以覆盖已经聚焦的输入区。只使用一个可移除的焦点监听，无轮询或 DOM 扫描；站内切换后创建的编辑器同样适用。顶部搜索和其他普通输入框不匹配。

验证：package 的 6 项测试、类型检查和定向构建通过。刷新鱼吧后在测试页临时执行本次完整 dist，连续点击评论编辑器均回到 BODY，搜索框保留 INPUT 焦点；站内切回首页后，连续点击发帖编辑器也回到 BODY。未输入或发布内容。未重跑微博、豆瓣、淘宝实页路径；微博现有回归测试通过。

当前在用入口：油猴启用的 0.2.1 发布版，更新来源仍为 GitHub Pages；`server:` 本地代理停用。本次未更新或替换油猴已安装副本，临时实页代码随页面刷新清除。因此实页验证证明本次构建有效，不代表浏览器日常入口已更新。验证期版本保持 0.2.1，`userscript.publish=false`，未推送、未发布。

构建前产物保存在 `/private/tmp/yuba-auto-blur-previous/`，仅作本轮快速恢复，临时目录不作为长期备份。

```sh
node --test packages/vimium-c-blur-input-focus/test/*.test.mjs
pnpm --filter vimium-c-blur-input-focus type-check
pnpm --filter vimium-c-blur-input-focus build
```
