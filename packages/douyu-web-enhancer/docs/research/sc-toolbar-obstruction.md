# 付费弹幕（SC）遮挡弹幕工具栏调研

最后更新：2026-09-02

## 问题定义

用户在普通斗鱼直播页看到付费弹幕（下文沿用用户称呼“SC”）时，脚本插入到斗鱼弹幕工具栏的
“前缀”“拉高”按钮发生遮挡并难以点击。本次无 SC DOM 的几何证据显示：若 SC 挂载在顶部悬浮
弹幕列表中，按钮会随浮层向下移动，并可能进入弹幕区与输入区的交界位置，随后被裁剪或由上层
输入区接管命中。

这是超出 DouyuEx 等价迁移范围的独立优化。目标不是隐藏 SC，而是在 SC 出现、更新和消失前后，
同时保证：

- SC 内容可读；
- “前缀”“拉高”始终可见、可点击；
- 斗鱼原生弹幕工具栏和输入区不被遮挡；
- 排行榜、弹幕前缀两个开关的状态语义不变；
- 处理可撤销、幂等，不引入永久轮询或自激观察。

本文把证据标为三类：**已观察**来自 2026-09-02 实机 DOM；**推断**由已观察的 DOM、几何和
源码关系推出；**待验证**必须在下一次自然出现 SC 时补采，不能作为实现事实。

## 采集环境

| 项目 | 记录 |
| --- | --- |
| 页面 | `https://www.douyu.com/5135383`，普通直播页；未保存查询参数 |
| 浏览器 | Chrome，页面缩放 110% |
| 视口 | `1745 × 880` CSS px，`devicePixelRatio = 2.2` |
| 页面形态 | `body.live-next-body`；未进入网页全屏或浏览器全屏 |
| 当前排行榜 | 可见，`.layout-Player-rank` 为 `display:block`，高度 224px |
| 当前 SC | 采集时已经消失；SC 容器为空，高度 10px |
| 操作边界 | 未刷新、导航、点击、切换开关、发送内容或触发 SC；未读取 Cookie、storage、账号和聊天内容 |

另一个已经打开的普通斗鱼直播页也只读确认了同样的空 SC 容器基线。第三个已打开页面正被其他
浏览器会话使用，本次未接管。没有把截图、完整 DOM 或聊天数据写入仓库。

当前页还有一项采集异常：两个脚本按钮仍在 DOM 中且 `aria-pressed="true"`，但 `html` 上没有
对应 `data-dwe-*` 状态属性，排行榜也实际可见。这说明按钮反馈与功能实际状态在该保留标签中
已经失配，可能是开发脚本重载或销毁后留下的旧节点。本文只用实际 DOM 和 computed style 判断
布局，不把这两个 `aria-pressed` 值当作开关状态证据。

## DOM 结构简图

以下结构在无 SC 状态下实机观察到；省略弹幕正文、用户名和无关节点：

```text
.layout-Player-barrageStage
└─ #js-player-barrage.layout-Player-barrage
   └─ .Barrage                         absolute; overflow:hidden; z-index:1
      ├─ .Barrage-topFloater           absolute; top:-1px; z-index:3; overflow:visible
      │  ├─ #js-floatingbarrage-container.Barrage-topFloaterList
      │  │                               顶部悬浮弹幕/SC 候选列表；当前为空；height:10px;
      │  │                               overflow-x:hidden; overflow-y:auto
      │  └─ .Barrage-toolbar           absolute; top:calc(100% + 5px); right:5px
      │     ├─ button.dwe-chat-control[data-dwe-setting="chatDecorationCleanup"]
      │     ├─ button.dwe-chat-control[data-dwe-setting="chatLayout"]
      │     ├─ a.Barrage-toolbarLock
      │     └─ a.Barrage-toolbarClear
      └─ #js-barrage-container.Barrage-container

.layout-Player-chat
└─ .Chat                               relative; z-index:60
   ├─ .ChatToolBar                     380×28px
   │  ├─ .ChatToolBar__left            约 194px；8 个原生子控件
   │  └─ .ChatToolBar__right           约 48px；2 个原生子控件
   └─ .ChatSpeak
      └─ .ChatSend                     输入与发送区域
```

关键关系是 `.Barrage-toolbar` 和顶部悬浮弹幕列表是 `.Barrage-topFloater` 的**直接兄弟子节点**，
不是输入区 `.ChatToolBar` 的子节点。脚本只是在官方 `.Barrage-toolbar` 内 `prepend` 两个按钮。
当前没有 SC 卡片，尚需确认斗鱼是否确实把 SC 直接挂到这个候选列表。

## 稳定选择器候选

稳定性评级只针对当前证据，不代表斗鱼的公开契约。

| 用途 | 候选 | 评级 | 依据与限制 |
| --- | --- | --- | --- |
| 弹幕面板 | `.Barrage` | 高 | 当前页面、现有实现和归档 DouyuEx 都使用；适合作为几何边界 |
| SC/顶部浮层根 | `.Barrage-topFloater` | 高 | 当前页面存在；归档 DouyuEx 也对它设置过层级；不仅承载 SC，不宜把“存在”当作 SC 活跃信号 |
| 顶部悬浮弹幕/SC 候选容器 | `#js-floatingbarrage-container` | 高 | 当前为唯一 ID，直接位于浮层根下；当前为空时仍常驻；是否承载 SC 待实机确认 |
| 候选容器兼容类 | `.Barrage-topFloaterList` | 中高 | 当前与上面的 ID 同节点；类名语义稳定，但优先用 ID，类作 fallback |
| 官方弹幕工具栏 | `.Barrage-toolbar` | 高 | 当前、现有实现和归档 DouyuEx 都使用；直接位于浮层根下 |
| 自定义按钮 | `.dwe-chat-control[data-dwe-setting="chatDecorationCleanup"]` | 高（自有） | 自有属性，准确定位“前缀” |
| 自定义按钮 | `.dwe-chat-control[data-dwe-setting="chatLayout"]` | 高（自有） | 自有属性，准确定位“拉高” |
| 弹幕侧栏根 | `#js-player-barrage` | 高 | 当前唯一 ID；可作为局部重新查询和尺寸观察根 |
| 排行榜 | `.layout-Player-rank` | 高 | 当前、实现及迁移契约已使用 |
| 输入区总根 | `.Chat` | 中高 | 当前结构清晰且有语义；应配合父子关系校验 |
| 输入上方原生工具栏 | `.ChatToolBar` | 中高 | 当前存在；不是现有自定义按钮的宿主 |
| 输入工具栏左右区 | `.ChatToolBar__left` / `.ChatToolBar__right` | 中 | 当前存在，但原生子项会随活动和登录态变化，不能只按子项序号插入 |
| 输入/发送区 | `.ChatSpeak` / `.ChatSend` | 中高 | 当前存在；用于碰撞和误伤验收，不建议作为 SC 活跃信号 |
| SC 卡片 | 未知 | 无 | 本次没有捕获到 SC，禁止猜测卡片类名或依赖消息文案 |

不要使用弹幕列表项的 UUID `id`、哈希类名或聊天文字作为选择器。不要用
`.Barrage-topFloater` 是否存在判断 SC，因为无 SC 时它仍常驻。

## 关键 computed style 与几何

### 无 SC、排行榜可见的已观察值

| 节点 | 位置/尺寸（CSS px） | 关键样式 |
| --- | --- | --- |
| `#js-player-barrage` | `(1196.46, 378.49)`, `380 × 402.69` | `position:absolute; overflow:visible` |
| `.Barrage` | 同上，底边 `781.18` | `position:absolute; top:0; bottom:0; overflow:hidden; z-index:1` |
| `.Barrage-topFloater` | `(1196.46, 377.49)`, `380 × 10` | `position:absolute; top:-1px; left/right:0; overflow:visible; z-index:3` |
| `#js-floatingbarrage-container` | 同浮层，`380 × 10` | `position:static; overflow-x:hidden; overflow-y:auto` |
| `.Barrage-toolbar` | 未悬停时零矩形 | `display:none; position:absolute; top:calc(100% + 5px); right:5px; z-index:auto` |
| `.dwe-chat-control` | 父级隐藏时零矩形 | 自有 CSS 高度 22px；`position:static; z-index:auto` |
| `.layout-Player-rank` | `(1196.46, 154.49)`, `380 × 224` | `display:block` |
| `.Chat` | `(1196.46, 781.18)`, `380 × 89.72` | `position:relative; z-index:60` |
| `.ChatToolBar` | `(1196.46, 782.09)`, `380 × 28` | `display:flex; justify-content:space-between` |
| `.ChatSpeak` | `(1203.45, 810.09)`, `366.01 × 53.81` | `position:relative` |
| `.ChatSend` | `(1260.36, 810.99)`, `308.20 × 52` | `display:flex` |

### 推导出的碰撞阈值

`.Barrage-toolbar` 的顶边由浮层高度决定：

```text
toolbarTop = topFloaterTop + topFloaterHeight + 5px
```

以自定义按钮 22px 高估算，排行榜可见时要让工具栏完整留在 `.Barrage` 的底边之上，顶部悬浮
列表/浮层高度最多约为：

```text
781.18 - 377.49 - 5 - 22 = 376.69px
```

这是**推断值**，因为工具栏在采集时为 `display:none`，没有直接测到显示后的实际外框、边距和换行。
当浮层超过该阈值，工具栏将进入 `.Barrage` 的 `overflow:hidden` 裁剪边界；若继续伸入输入区，
`.Chat` 的 `z-index:60` 又高于浮层的 `z-index:3`，命中测试会优先落到输入区一侧。

“拉高”开启后，现有 CSS 隐藏 224px 高的排行榜并把 `.Barrage` 的 `top` 设为 0。按当前几何，
弹幕面板会从约 402.69px 增至约 626.69px，同一算法的理论阈值增至约 600.69px。因此排行榜关闭
可能显著缓解问题，但不会消除超长/多条 SC 的结构性风险。

110% 缩放下页面可用垂直 CSS 像素减少，是问题更容易暴露的合理解释；本次没有 100% 对照，仍属
待验证假设。

## 生命周期

### 已观察

- `#js-floatingbarrage-container` 在无 SC 时仍常驻，直接子节点为 0，高度为 10px；它是 SC
  容器候选，不是本次已证实的 SC 容器。
- 两次相隔 15 秒的只读快照中，它一直为空且高度不变。
- `.Barrage-topFloater` 与 `.Barrage-toolbar` 也常驻，不能以挂载/卸载作为 SC 信号。
- 页面工具不允许在本次只读执行环境中构造临时 `MutationObserver`；未在页面留下观察器。

### 推断

- 如果下次确认 SC 直接挂在其中，最窄的观察根应是 `#js-floatingbarrage-container`，而不是
  `document`、`.Barrage` 或 `#js-player-barrage`。
- 首选信号应为该容器的直接 `childList` 变化；只有实机证明同一卡片原地更新时，才增加
  `subtree` 或窄化后的 `attributes` 观察。
- “SC 活跃”至少应联合直接子节点数量、容器实际高度与可见性判断，避免 10px 空壳误报。
- 若斗鱼整段重建弹幕面板，现有共享 `ObserverHub` 可负责重新发现容器；容器内部的高频变化不应
  升级为全页扫描。

### 待验证

- SC 是否挂入 `#js-floatingbarrage-container`，以及卡片的标签、稳定类名、`data-*` 属性和
  直接父子结构；
- 新 SC 是追加、替换还是复用已有节点；
- 倒计时/金额/展开状态是文本更新、属性更新还是样式更新；
- 消失时是移除节点、切换类/样式，还是保留隐藏节点；
- 多条 SC 是否同时存在、容器是否固定最大高度，以及滚动是否由官方实现；
- SC 卡片本身的 `position`、`z-index`、`pointer-events` 和真实命中结果。

## 根因判断

### 已观察事实

1. 顶部悬浮弹幕候选列表和工具栏共享 `.Barrage-topFloater`；工具栏绝对定位在父级
   `100% + 5px` 处。
2. 自定义按钮被 `prepend` 到官方工具栏，没有独立层叠上下文。
3. 弹幕面板裁剪溢出，输入区的层级显著高于 SC 浮层。
4. 排行榜可见时弹幕面板比隐藏排行榜时少 224px 垂直空间。

### 从 DOM 推断

如果 SC 确实进入候选列表，主因就是斗鱼官方的“悬浮列表高度驱动工具栏纵向位置”与“弹幕面板
裁剪 + 输入区高层级”的组合。即使没有自定义按钮，官方锁定/清屏工具也使用同一个工具栏，因此
官方布局本身具备碰撞条件。

脚本的放大效应是：两个 22px 高、有横向 padding 和激活态装饰的按钮加入同一工具栏，会增加工具栏
所需宽度，并在 380px 侧栏内提高拥挤、换行或部分命中区域被覆盖的风险。脚本插入位置**不是**纵向
位移的起因，但让受影响的高频开关也进入了这个不稳定层级。

### 尚不能确认

- 用户当时看到的是 `.Barrage` 裁剪、`.Chat` 覆盖、SC 卡片自身覆盖，还是三者共同作用；
- 是否只有多个/特定高度的 SC 才越过约 376.69px 阈值；
- 110% 是否为必要条件；
- 实际被 `elementFromPoint` 命中的节点。

## 候选方案

### 方案 A：限制 SC 列表高度，为原位工具栏保留空间（推荐的最小方案）

继续使用 `.Barrage-toolbar`。在确认 SC 的宿主和活跃信号后，把
`#js-floatingbarrage-container` 的最大高度限制为：

```text
.Barrage 可用高度 - 工具栏实测外框高度 - 5px 间隔 - 安全余量
```

容器已有 `overflow-y:auto`，因此理论上可让超出的 SC 内容滚动，而不是被隐藏；SC 消失后撤销限制。

- **优点：** 不改入口、不复制工具栏、不改变按钮事件；同时保护官方锁定/清屏工具；改动局部且易撤销。
- **副作用：** 超长 SC 需要滚动；若官方并未为 SC 卡片设计滚动，需实机确认滚轮和内部点击不受影响。
- **选择器韧性：** 只依赖高评级的 `.Barrage`、`#js-floatingbarrage-container`、
  `.Barrage-toolbar` 及父子关系校验。
- **性能：** 只在容器直接子节点变化、弹幕区尺寸变化或页面模式变化时重算；不要轮询。
- **实现门槛：** 必须先补到一次有 SC 的卡片结构、工具栏真实高度和滚动验收证据。

### 方案 B：只在 SC 活跃时把自定义按钮迁到 `.ChatToolBar`

将两个自定义按钮临时挂到 `.ChatToolBar` 的独立中间组，SC 消失后放回官方工具栏。

- **优点：** 直接脱离 SC 浮层和 `.Barrage` 裁剪，输入区的 `z-index:60` 可保证可点击。
- **副作用：** 当前 `.ChatToolBar__left` 已占约 194px、右侧约 48px；380px 总宽虽约有 138px 间隙，
  但登录态、活动控件、窄窗口和文案宽度可能挤压或换行。动态迁移还会造成入口跳动。
- **选择器韧性：** `.ChatToolBar` 尚可，但左右子区和原生子项数量不稳定；必须创建自有 wrapper，
  不能依赖子项序号。
- **可撤销性：** 保存原宿主并幂等 reparent；停用、页面重建和 SC 消失都必须恢复。
- **性能：** 与方案 A 使用同一个窄生命周期信号，不轮询。

### 方案 C：提高整个 `.Barrage-topFloater` 的层级

归档 DouyuEx 的 RemoveAD CSS 曾设置 `.Barrage-topFloater{z-index:999}`，可作为历史参考，但不推荐。

- **优点：** CSS 改动最小，可能立刻让工具栏压过 `.Chat`。
- **主要问题：** 它同时抬高 SC 卡片，可能反过来遮住输入框和发送按钮；没有解决列表过高与
  `.Barrage` 裁剪；也不能保证跨层叠上下文生效。
- **结论：** 只可作为诊断对照，不应作为正式修复。

### 推荐结论

优先考虑方案 A，但应把“捕获一条自然 SC，确认宿主并验证容器滚动”设为实现前置门槛。若实机
证明 SC 不在候选容器中，或官方容器不能安全滚动，再选方案 B。不要采用单纯升层级方案，也不要
依赖未知 SC 卡片类名；宿主确认后，用常驻容器的直接子节点和实测高度作为状态信号更有韧性。

## 归档 DouyuEx 检查

只搜索了归档源码与 `douyuEx_meta/src` 的相关入口，排除了 `dist`、`node_modules` 和压缩产物：

- `Refresh_Barrage.js` 与 `Refresh_BarrageFrame.js` 都把自定义入口插入第一个
  `.Barrage-toolbar` 的首位，与当前实现的宿主选择一致；
- `RemoveAD.js` 有通用规则 `.Barrage-topFloater{z-index:999}`；
- 未发现 SC 专用选择器、SC 生命周期监听、工具栏避让、最大高度或重定位逻辑。

因此归档代码没有可直接迁移的完整修复；其 `z-index:999` 还可能把 SC 一并抬到输入区之上。

## 实现文件入口

后续实现任务只需先读本文、包内 `AGENTS.md`，再读以下局部文件：

- `src/ui/simplified-mode-controls.ts`：按钮 CSS、创建、挂载和清理；
- `src/features/chat-layout.ts`：排行榜隐藏和弹幕面板拉高；
- `src/core/observer-hub.ts`：共享、50ms 合并调度的 DOM 观察；
- `src/core/selectors.ts` 与 `src/main.ts`：集中选择器注册和生命周期装配；
- `test/douyu-web-enhancer.test.mjs`：选择器、CSS、幂等挂载和清理测试入口。

若采用方案 A，建议建立独立 feature/UI helper，不要把 SC 几何逻辑塞入
`chat-layout.ts`；它是独立优化，并且必须能在“拉高”关闭时单独工作。

## 测试策略

### 自动化测试

1. 用最小 DOM fixture 表达本文结构：浮层下同时有 SC 容器和工具栏，输入区为相邻高层级节点。
2. 覆盖空容器、单卡片、多卡片、节点原地更新、移除、弹幕面板被整体替换。
3. 验证只订阅最窄容器信号；连续 mutation 合并，不触发自激扫描或永久轮询。
4. 验证重复扫描不重复插入 wrapper/style，不重复绑定监听。
5. 验证停用、`pagehide`、容器替换后撤销所有类、属性、inline style、observer/resize listener。
6. 覆盖 `.Barrage`、SC 容器或工具栏缺失时安全等待，不能影响输入和弹幕。
7. 方案 A 应把高度计算抽成纯函数，覆盖小面板、工具栏换行、安全余量、零/负可用高度。
8. 方案 B 若作为 fallback，应验证原宿主恢复、DOM 顺序和焦点不丢失。

纯文档调研不新增功能测试、不提高版本。实现任务完成时按包规则运行完整门禁。

## 实机验收矩阵

每格都记录按钮可见性、两个按钮中心点的 `elementFromPoint`、SC 内容是否完整可访问、输入/发送区
是否可用、官方锁定/清屏工具是否可用，以及停用后的恢复结果。

| 页面/缩放 | SC | 排行榜/“拉高” | “前缀” | 必验结果 |
| --- | --- | --- | --- | --- |
| 普通页 110% | 无 | 开 | 开/关 | 基线无额外空白、无入口跳动 |
| 普通页 110% | 单条 | 开 | 开/关 | 两按钮可见可点；SC、输入、官方工具不遮挡 |
| 普通页 110% | 多条或高卡片 | 开 | 开/关 | 超高内容可滚动/访问，命中测试正确 |
| 普通页 110% | 单条/多条 | 关（拉高） | 开/关 | 扩展高度正确参与计算，关闭后恢复 |
| 普通页 100% | 无/有 | 开/关 | 开/关 | 对照缩放影响，不依赖固定视口常数 |
| 网页全屏 | 无/有 | 开/关 | 开/关 | 宿主重建和尺寸变化后仍正确 |
| 浏览器全屏 | 无/有 | 开/关 | 开/关 | 层叠、裁剪和清理正确 |
| 普通页 110% | SC 消失 | 任一 | 任一 | 限制/迁移自动撤销，无残留 style/class |
| 普通页 110% | 出现时停用脚本 | 任一 | 任一 | 页面恢复斗鱼原状，不遗留 observer/节点 |

排行榜和“拉高”是同一状态维度。弹幕“前缀”只隐藏 `.Barrage-list` 中的装饰节点，按源码推断不会
改变 SC 浮层高度，但仍纳入矩阵以防斗鱼把 SC 卡片复用了相关装饰类。

## 缺失证据与下次最小采集步骤

目前不足以直接实现的唯一关键缺口是“有 SC”实机样本。下次在普通页 110%、自然出现 SC 时，
不点击页面，按以下最小步骤采集：

1. 只查询 `#js-floatingbarrage-container` 的直接子节点，记录 tag、class、非个人化 `data-*` 属性、
   bounding box 和 computed `position/z-index/overflow/pointer-events`；不记录 `textContent`、图片 URL、
   UUID、用户名或聊天内容。
2. 同时记录 `.Barrage`、`.Barrage-topFloater`、`.Barrage-toolbar`、两个自定义按钮、`.Chat`、
   `.ChatToolBar`、`.ChatSpeak` 的 bounding box；确认工具栏显示后的真实高度和是否换行。
3. 对两个按钮中心点、SC 卡片下缘与输入区上缘执行只读 `document.elementFromPoint`，只保存命中节点
   的 tag/class，不保存文字。
4. 在 SC 更新和消失后各取一次同样快照；如需判断节点复用，使用最多 60 秒、明确自动断开的
   临时 observer，仅观察该容器的 `childList`，确认后立即断开。
5. 如果直接子节点未更换但外观更新，再补一次仅针对该卡片的 `class/style` 属性观察；不要直接
   上升到 `subtree:true` 或全页 observer。
6. 先保持用户当前的排行榜和前缀状态，不为了补矩阵点击开关；其余组合留到实现后的正式验收。

若一次样本确认：SC 子节点增减、容器高度随之变化、工具栏按父高下移、限制后官方滚动仍可用，
方案 A 即具备开工条件。若任一项不成立，先更新本文的根因和推荐方案，再写功能代码。
