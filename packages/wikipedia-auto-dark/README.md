# wikipedia auto dark

自动选择 Wikipedia 跟随系统的主题，并收起 Vector 外观侧栏。

## 2026.9.8 卡死修复

根因：监听 html 的 class 时，无条件对已有主题类调用 classList.add，仍会产生属性变更通知。
在 Vector 未就绪或控件缺失时观察器不会断开，形成 MutationObserver 微任务自激循环。
修复：仅在自动主题类不存在时添加，使重复同步不再写入相同属性。

验证：6 项 package 测试、package 类型检查与构建通过。新增测试模拟 DOMTokenList 对已有
类名重复添加仍产生通知的行为，覆盖页面初始化中和控件缺失；旧实现两项失败，修复后通过。

浏览器验收：2026-09-08 已在 Tampermonkey 中重装开发版，并由用户在 Wikipedia
页面确认未再出现卡死。自动化测试另以有界 mutation 队列确认通知停止。系统主题切换、
慢速网络加载和停用后恢复仍可在后续发布回归中单独覆盖。
