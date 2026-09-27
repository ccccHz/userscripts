# 特殊弹幕背景屏蔽调研

最后更新：2026-09-27

后续多类型飘屏样本采集参考 [瞬态 DOM 采集指南](../transient-dom-capture.md)，
优先观察新增弹幕并即时保存，避免消失后才查询。

## 目标与边界

本次只读采集当前斗鱼播放器特殊背景弹幕的 DOM、class、图片层、伪元素和
computed style，不注入屏蔽样式，不修改页面或功能代码。用户已确认未来入口放在脚本默认控制
中心，不融入斗鱼原生屏蔽面板。

2026-09-27 用户补充决定：**暂停实现，P1 高优先级补充自然样本**。现有单条样本不足以
证明不同背景下头像、表情、图片正文和钻粉彩字均不会误伤。下文实现建议仅为待验证方案，
不代表已批准按当前样本直接开发。

## 采集环境

| 项目 | 记录 |
| --- | --- |
| 页面 | `https://www.douyu.com/52`，普通直播页 |
| 时间 | 2026-09-27 |
| 浏览器 | Codex `@Browser`，已登录，Full CDP 只读采集 |
| 样本 | 一条当时可见的贵族/活动特殊背景弹幕 |
| 页面主题 | Dark Reader 正在运行；computed text color 受其影响，背景资产及 DOM 为该环境下实测，未做停用主题的对照 |
| DEV 构建 | 未运行：页面无 `#douyu-web-enhancer-control-center`、`dwe-*` 标记或 localhost/127.0.0.1 资源；因此本次不做脚本验收 |
| 操作边界 | 未发送弹幕、签到、关注、送礼、修改账号或删除数据 |

## 实际 DOM

正文已省略，用 `TEXT` 表示；个人头像 URL 不写入仓库。

```html
<div class="danmuItem-a8616a noble-d35c82" data-comment-uuid="…">
  <img class="super-user-icon-f04849" style="opacity: 0; margin-top: 9px">
  <img class="super-noble-icon-eb79c7" src="…/351a34….webp" style="margin-left: -46px">
  <div
    class="super-text-f60bfa customBarrage"
    style="color: rgb(255,255,255); text-shadow: …; background-image: url(…/fe1cd2….png); height: 47px; padding-top: 6px"
  >
    <div
      style="width: 100%; height: 52px; position: absolute; top: 1px; left: 0;
             pointer-events: none; background: url(…/f4e178….webp) 0 0 / 65px 52px repeat-x"
    ></div>
    TEXT
    <div class="afterpic-e66834" style="margin-top: 7px; margin-left: -1px"></div>
  </div>
  <img class="super-tail-b436b7" src="…/a8d8cd….webp">
</div>
```

所有背景资产均来自 `sta-op.douyucdn.cn/dygev/2026/09/22/`：

- `.super-text-f60bfa.customBarrage` 的内联 `background-image` 是 PNG 中心层；
- 其直接子 `div` 使用另一张 WebP 做 `repeat-x` 重复背景；
- `.super-noble-icon-eb79c7` 是左侧贵族/活动装饰图；
- `.super-tail-b436b7` 是右侧收尾装饰图；
- `.super-user-icon-f04849` 是用户头像层，本样本中 `opacity:0`，不能因为它是 `img` 就当作背景删除；
- `.afterpic-e66834` 本样本的 computed background 为 `none`，暂无证据需要处理。

## computed style

| 节点 | 尺寸 | 关键值 |
| --- | --- | --- |
| `.danmuItem-a8616a.noble-d35c82` | 约 `602.66 × 53px` | `position:absolute`; `background-image:none`; `border-radius:21px`; `opacity:1`; `visibility:visible`; `z-index:999` 来自内联样式 |
| `.super-noble-icon-eb79c7` | 约 `58.99 × 52px` | `display:inline-block`; 图片本体是左侧装饰 |
| `.super-text-f60bfa.customBarrage` | 约 `521.68 × 47px` | `position:relative`; `display:inline-block`; `background-image:url(...png)`; `background-size:auto 52px`; 白字+紫色多层 `text-shadow` |
| `.customBarrage > div[style*="background"]` | 约 `521.68 × 52px` | `position:absolute`; `pointer-events:none`; `background-image:url(...webp)`; `background-size:65px 52px`; `repeat-x` |
| `.super-tail-b436b7` | 约 `25.99 × 52px` | `display:inline-block`; 图片本体是右侧收尾装饰 |

样本内所有节点的 `::before` / `::after` 均没有背景图。外层 `::after` 存在空 `content:""`，
但 computed background 为 `none`；其余伪元素的 `content` 为 `none` 或空值。因此当前样本不需要靠全局
`::before/::after` 规则清除背景。

## 与归档 Git 历史的对照

归档原仓库从 2024-03-29 开始实现此功能，后续至少经历了下列类型的修正：

- 2024-03-31：避免误屏蔽钻粉炫彩弹幕；
- 2024-07-29：更换 `danmuItem-*` / `super-text-*` 哈希 class，并修复“直接隐藏整条弹幕”的误伤；
- 2024-08-04 至 08-10：补贵族背景、`customBarrage` 和子背景层；
- 2025-06-20 至 06-30：再次切换哈希 class，新增 `PlayerCustomBarrage-prefixPlugin--text`；
- 2025-08-28 / 09-04：为图片前缀扩大规则后又因误伤钻粉彩字回退；
- 2025-11-25：更新到 `danmuItem-a8616a`、`super-text-f60bfa`、`noble-d35c82`。

2026-09-27 的实机样本仍使用这三个 2025-11 class，但装饰图的资产 URL 和额外图片 class
由当期活动动态下发。结论是：精确哈希 class 并非每次都变，但原版“对所有后代 `div/img`
一刀切”会随新背景类型和新内容层产生误伤，仍需维护。

## 推荐的最窄实现

1. 将规则限定到 `#comment-higher-container > [data-comment-uuid]`，不对全页 `div` / `img` 生效。
2. 使用语义 class 前缀和结构组合，例如 `.customBarrage`、`[class^="super-text-"]`、
   `[class^="super-noble-icon-"]` 和 `[class^="super-tail-"]`；精确哈希只作已知样本证据，不作唯一依赖。
3. 对文字层只清除 `background` / `background-image`；只隐藏已证明是左右背景收边的
   `super-noble-icon-*` / `super-tail-*`，不再隐藏任意头像、表情或正文图片。
4. 保留文字 `color` 和 `text-shadow`，因为它们不是背景，且移除后可能降低浅色画面上的可读性。
5. 开关状态只由设置 schema 所有；runtime 注入/移除一个命名 style，不需要 MutationObserver。
6. 诊断记录当前页命中的特殊文字层、子背景层和左右装饰层数量；“开关已开”不代表
   “当期背景已覆盖”。

这种做法不能消除斗鱼新增完全不同渲染器时的更新需求，但能把维护从“追每个哈希并冒险隐藏
所有后代”降为“为新的语义背景层增加一条有样本的规则”。WebSocket Hook 不适合作为本功能的
默认实现：背景的最终图片层和内联样式由页面渲染器生成，直接处理渲染结果更窄、更可撤销。

## 待验证

- 开关的控制中心交互、刷新持久化与停用恢复；
- 本样本移除中心背景和左右收边后，正文仍可读且尺寸/运动轨迹不异常；
- 普通弹幕、钻粉彩字、表情/图片正文、非贵族 `customBarrage` 和其他活动背景无误伤；
- 斗鱼如改用 canvas、Shadow DOM 或不同宿主，需新样本后再增规则，不预先扩大选择器。
