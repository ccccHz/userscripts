# 背包只读信息增强：实施前调研

日期：2026-09-27。用户确认优先推进；尚未冻结具体 UI、开关及统计口径，未修改功能代码。

## 当前页面证据

在已登录 Codex `@Browser` 房间 52 打开原生背包，仅查看、悬停，未点击任何礼物使用/赠送。
本页无 enhancer DEV 标记，因此是原生调研，不构成新脚本验收。

- 入口：`#js-backpack-enter`。
- 外层：`#js-gift-expandPanel.BackpackExpandPanel.is-show`。
- 头部：`.BackpackExpandPanel-backpackHeader`，本次仅显示“我的背包”。
- 列表：`.BackpackExpandPanel-giftListWrap` → `.ToolBarBackpack-giftList`。
- 礼物项：`.ToolbarBackpack-giftItem`，带 `data-proptype`、`data-propid`、`data-index`。
- 子层为 `--name`、`--count`、`--flags`、`--hoverMask`；本次网格未展示常驻剩余期限或总价值/总亲密度。
- 存在 `is-disabled` 项，不能因为禁用就从背包统计中任意删掉。
- 悬停未获得与 `expiry` 相互验证的剩余期限文案；不能断言官方任何界面都不提供期限。

## 只读接口

归档 `ExpandTool/ExpandTool_ClearBag.js` 定义 `getBagGifts`，请求
`GET /japi/prop/backpack/web/v5?rid=<roomId>`。当前同源单次读取房间 52：HTTP 200、
`error:0`、`msg:success`，无需复制 Cookie 或扩大 userscript 权限。

返回 `data.list/totalNum/unlockLevel/validNum`；礼物含 `id/propType/count/expiry/price/intimate/isValuable`，
另有 `batchInfo/priceType/description/description2/intro/devote` 等字段，后续只读取必要字段。
不将用户完整背包清单、账号标识或凭据写入仓库。

单位证据：归档将 `price` 除以 100；当前某礼物 `price:20` 与原生标价 `0.2 鱼翅` 一致，
但这只验证该样本的标价换算，不证明所有道具、币种或可兑现价值。
当前样本 `isValuable` 均为 0；缺非零自然样本，不能宣称有价值礼物统计已实机验收。
`expiry` 是数值，语义尚需与官方说明/渲染对照，不能仅凭归档 `expiry - 1` 硬减一天。
`intimate` 汇总不应冒充带当期 BUFF 的实际到账收益。

## 归档行为与需要说明的调整

归档 `BagInfo/BagInfo.js` 在打开背包后读接口：

- 各项叠加 `expiry - 1` 的数字，无清晰单位；
- `isValuable == 1` 的项累计 `price × count / 100`，标为“总价值”；
- 全项累计 `intimate × count`，标为“总亲密度”；
- 同文件加入“清空背包”，实际调用赠送接口送出全部礼物，本轮明确不迁移。

建议保留只读核心，但在确认后做以下窄调整：

1. 用 `(propType,id)` 对应 DOM 的 `(data-proptype,data-propid)`，不按数组位置硬配；
   对重复同键/多批次须证明聚合规则，不能选第一个或猜测。
2. 期限加单位和未知/永久语义；先证实接口口径，再确定展示，不复用无依据减一天。
3. 头部保留“总价值/总亲密度”概念，说明价值计入条件和亲密度基础口径；数据不足显示未知而非假零。
4. 独立只读设置与可撤销追加节点，不覆写原头部 innerHTML，不影响原礼物操作。
5. 打开时按需获取、关闭后停止观察、重开不重复插入；失败保留原生背包，换房丢弃过期响应。

## 待确认与执行路径

- UI：头部汇总 + 礼物角标期限；控制中心独立开关，建议默认开启，沿用归档自动展示体验。
- 统计：沿用 `isValuable` 条件而非把所有免费道具标价计入；亲密度显示基础估算、不叠加未知 BUFF。
- 期限：核对原生说明与 `expiry` 语义后再定格式，尚未冻结。
- 尚未发现背包增强的既有独立负责任务；它与当前进行中的简洁模式提示清理是不同交付物。
  如创建专门任务须由用户明确授权；主目录正由简洁模式任务使用，不同时开展写入或切换分支。
- 验收负责人应验证主项目当前 DEV、开启/停用、重开/换房、空背包、数据错误和多批次映射。
  不通过赠送礼物制造刷新样本，未覆盖类型保持待验证。
