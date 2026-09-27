# 直播间粉丝亲密度/粉丝牌弹窗调研

最后更新：2026-09-27

可复用采集方法与失败复盘见 [瞬态 DOM 采集指南](../transient-dom-capture.md)。

## 问题定义

用户报告进入或刷新斗鱼直播间时可出现两类瞬态弹窗：

- 粉丝亲密度加倍提示；
- 已有该直播间粉丝牌/徽章的提示。

目标是先采集真实 DOM、挂载位置、显示时序和关闭行为，再决定是否做窄范围视觉清理。
不得点击佩戴、领取、开卡或其他会改变账号状态的按钮。

## 2026-09-27 首轮只读采集（已被后续捕获补充）

| 项目 | 记录 |
| --- | --- |
| 页面 | `https://www.douyu.com/52` |
| 浏览器 | Codex `@Browser`，已登录，Full CDP |
| 操作 | 原标签刷新一次；同登录态新建标签再加载一次；只读 DOM、截图、resource timing 和同源 GET |
| 结果 | 当时没有捕获两类提示；不是“两类提示没有出现”的证明，后续已捕获两者 DOM |
| 初始房间牌状态 | 输入区曾显示“未拥有”；用户后续确认这是早期加载状态，不能据此判断触发条件 |
| DEV 构建 | 未运行；本次只能采集斗鱼原生事实，不能做脚本验收 |

页面确实加载了与粉丝/钻粉体系相关的模块与配置，包括 `live-super-fans` 脚本、
`inter_com_w_diamond_fans.json` 以及粉丝亲密度倍率相关配置。这只证明功能基础资源存在，
不证明当前账号/房间应弹窗，也不足以推断 DOM。

## 用户补充证据与结论修正

2026-09-27 用户在原 Chrome 与 Codex 内置浏览器均观察到相同提示；内置浏览器卡顿使
加载顺序更明显：先显示“未拥有”，随后显示“您已拥有该主播徽章 17 火星包 立即佩戴”，
再出现“亲密度BUFF 2倍亲密度+4倍亲密度上限(23：45：07)”。

用户截图可确认两处不同的视觉区域：徽章提示为聊天输入区上方的黑色气泡卡片，含橙色
“立即佩戴”按钮；亲密度提示为播放器左下角黄色圆角横条，含倒计时与关闭图标。
这些是截图证据，不等于已确认 DOM 宿主、class 或两个组件的生命周期。

撤回此前以“未拥有”推断不符合触发条件的判断，也不再用日期差异猜测活动或账号条件变化。
后续采集应覆盖延迟初始化阶段，不能只检查首屏。补充只读检查中，新开房间 52 从早期
“未拥有”变为登录态与粉丝牌等级 17，但最终文本 DOM 查询仍未命中两处目标提示；
有界观察的 CDP 返回超时，未获得完整时序结果，不能宣称观察期间完全未出现。
本次仍未检测到 enhancer DEV 标记，不构成脚本验收；未安装脚本或改用其他工作区产物。

## 未强制触发的原因

- 清除 localStorage/sessionStorage/cookie 会改变页面和账号体验状态，不属于本次只读授权；
- 修改接口响应、伪造粉丝牌或触发佩戴/开卡都会产生不可信的样本或账号副作用；
- 首屏或单次未捕获不等于不存在，不据此推断账号资格或活动条件。

## 修正方法后的实际捕获

同一登录态房间 52，刷新后通过 CDP 在约 0.64 秒接入有界 MutationObserver。
仅检查新增/变化子树，排除聊天正文和播放器飞行弹幕；命中即保存节点、父链、样式和
`performance.now()`，安装调用立即返回，分段读取。未清理 storage，未伪造响应，未暂停或修改站点逻辑。

- 徽章提示节点创建于本轮约 **13.20 秒**；创建瞬间提示框 `opacity:0`、尺寸为零，
  因此这个时间是 DOM 创建时间，不冒充实际显示时间。
- 亲密度 BUFF 在约 **24.47 秒**捕获，`opacity:1`、`visibility:visible`，文字层尺寸 `400 × 28px`。
- 泛文案匹配同时捕获了活动挂件中的“5.4倍亲密度”，它属于不同组件，明确排除，
  证明不能把“含亲密度文案”直接用作隐藏规则。

### 徽章提示

```html
<div class="FansMedalPanel-container">
  <div class="FansMedalDialog">
    <div class="FansMedalDialog-normal is-middle" style="display: block;">
      <i class="FansMedalDialog-arrowIcon"></i>
      <div class="FansMedalDialog-desc is-geted">
        <span class="FansMedalDialog-text">您已拥有该主播徽章</span>
        <dy-fan-medal medal-level="17" medal-name="火星包" medal-id="52"
          medal-suffix="false" medal-protected="false" medal-month="0"></dy-fan-medal>
        <p class="FansMedalDialog-wareMedal">立即佩戴</p>
      </div>
    </div>
  </div>
  <div class="FansMedalPanel-enter">…原有粉丝牌入口…</div>
</div>
```

提示框 `.FansMedalDialog-normal` 为 `position:absolute; z-index:20`，父宿主
`.FansMedalPanel-container` 为 `position:relative; display:flex; z-index:3`。
提示与原有粉丝牌入口是独立子区域；如后续清理，应保留 `.FansMedalPanel-enter` 和其交互，
不隐藏整个粉丝牌容器。`dy-fan-medal` 是自定义元素，徽章内容由属性指定。
本次没有点击“立即佩戴”，没有证明佩戴后的行为。

### 亲密度 BUFF

```html
<div class="buff__cG0xb buff__2wlKm" id="js-layout-fixed-buff">
  <div class="content__Fawms" id="js-layout-fixed-buff-content">
    <div class="AnchorPocketTips">
      <span>2倍亲密度+4倍亲密度上限</span>
      <span class="AnchorPocketCount">（倒计时）</span>
    </div>
  </div>
  <i class="close__D27HS"></i>
</div>
```

父链为 `.case__f4yex` → `.video__VfhVg`；与徽章提示不共用宿主。该 BUFF 外框
`416 × 28px`，文字层 `400 × 28px`；样本视口为 `1441 × 858px`，外框位置约
`x:32, y:617.81`，文字层 `x:48`。文字层 `display:block; position:static; opacity:1`，
背景为 `new-buff-bg@2x_3961317.png`，采样伪元素无图片。关闭图标为外框直接子节点，
没有点击它，未证明关闭持久化。

`#js-layout-fixed-buff-content` 是共享挂载区，后续不能因本次样本就清空它或隐藏全区；
如做清理，应定向匹配 `.AnchorPocketTips`，并验证同宿主关闭图标及其他内容不遗留/误伤。

### 可见生命周期补证

第三轮刷新后约 0.55 秒接入定向采样，只读取上轮已证明的两处节点，每 250ms 检查一次，
40 秒后自动停止。记录只在节点存在状态、几何或显示属性变化时保存。以下时间均相对该轮页面导航，
是采样时刻，不宣称为毫秒精确的站点计时；页面卡顿会延迟采样。

| 阶段 | 徽章提示 | 亲密度 BUFF |
| --- | --- | --- |
| 初始 | 约 4.90s 已有未获徽章说明，`display:none` | 不存在 |
| 数据更新 | 约 13.90s 改为已有徽章和立即佩戴，`display:block; opacity:0`，尺寸零 | 不存在 |
| 可见 | 约 22.96s，`opacity:1`，`300 × 40px`，`x:1037, y:684.81` | 约 26.00s，`opacity:1`，`400 × 28px`，`x:48, y:627.81` |
| 消失 | 约 24.53s 查询不到该提示节点 | 约 30.80s 查询不到 `.AnchorPocketTips` |

这轮确实证明了“晚到的登录/徽章状态 → 可见徽章提示 → 自动消失 → BUFF → 自动消失”
的页面表现，不能再把首屏“未拥有”或消失后的空查询解释成未触发。
两者自然出现和消失，无需人为佩戴、领取、清缓存或暂停站点 JavaScript。
未测手动关闭、SPA 换房或不同徽章状态，也未验收清理功能。

## 后续验收缺口

1. 弹窗最小外层的 `outerHTML`，包括稳定 id/class/role/aria/data 属性；
2. 直接父链至页面宿主，判断是 portal、播放器子层还是 body 全局层；
3. 弹窗、遮罩、关闭按钮与主操作按钮的 computed `display/visibility/position/z-index/pointer-events`；
4. 创建、自动消失、手动关闭和刷新后重现的时序；
5. 两弹窗是否共用宿主/组件，是同时出现还是排队出现；
6. 当时实际页面截图，不记录聊天正文、Cookie 或其他账号私密数据。

本轮已取得这两处真实 DOM 和可见生命周期。后续可据此制定精确组件规则，但不把通用“弹窗”、
文案包含或高 `z-index` 当作隐藏依据；实现与浏览器验收仍由既有功能负责任务承接。
