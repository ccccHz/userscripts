import type { NoticeRecord, FollowNoticeKind, FollowUnreadOverrides, FollowNoticeMode } from "../core/notification-inbox.ts";
import type { RoomEventOptions, RoomEventEntry } from "../features/room-events.ts";
import { LitElement, css, html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { FeatureDiagnostic } from "../core/diagnostics.ts";
import type { FeatureRuntime } from "../core/feature.ts";
import type { FeatureSettingKey } from "../core/feature-settings.ts";
import {
  DEFAULT_SETTINGS,
  diffSettings,
  parseSettingsImport,
  type Settings,
  type SettingsDifference,
} from "../core/settings.ts";
import type { ControlCenterEdgeSide } from "../core/settings.ts";
import { isDouyuWebFullscreen } from "../features/compact-player.ts";
import type { DanmakuAvailabilitySnapshot } from "../features/danmaku-availability.ts";
import type { UserBlockingState } from "../features/user-blocking.ts";
import type { UserBlockHistoryEntry } from "../features/user-block-history.ts";
import type { UserFollowingState, ChatSpeedSnapshot } from "../features/user-following.ts";
import { sortFollowingByRecentActivity } from "../features/user-following.ts";
import type { ActivityCleanupSnapshot } from "../features/activity-cleanup-stats.ts";
import type { ActivityFilterRecord } from "../features/activity-filter-review.ts";
import type { DanmakuTailConfig } from "../core/outgoing-chat-tail.ts";
import type { VerifiedDouyuUser } from "../features/user-lookup.ts";
import type { OfficialFollowView } from '../features/official-follow-sync.ts';
import {
  DANMAKU_SEND_OBSERVATION_TAGS,
  type DanmakuSendObservation,
} from "../features/danmaku-send-observation-store.ts";

export const CONTROL_CENTER_ID = "douyu-web-enhancer-control-center";

export interface AutomationSummary {
  taskId: string;
  outcome?: string;
  summary: string;
  at: string;
}

export interface ControlCenterModel {
  version: string;
  notificationRecords: readonly NoticeRecord[];
  notificationUnread: number;
  notificationStatus: "saved" | "error";
  followUnreadOverrides: FollowUnreadOverrides;
  followNoticeDefaults: Readonly<Record<FollowNoticeKind, FollowNoticeMode>>;
  onSetFollowDefault(kind: FollowNoticeKind, mode: FollowNoticeMode): void;
  onSetFollowUnread(uid: string, kind: FollowNoticeKind, enabled: FollowNoticeMode | null): void;
  onResetFollowUnread(uid: string): void;
  notificationPreferences: Readonly<Record<NoticeRecord["source"], boolean>>;
  onSetNotificationUnread(source: NoticeRecord["source"], enabled: boolean): void;
  onReadVisibleNotifications(ids: readonly string[]): void;
  onReadAllNotifications(source?: NoticeRecord["source"]): void;
  onReadNotification(id: string): void;
  settings: Settings;
  danmakuTail: DanmakuTailConfig;
  onSaveDanmakuTail(config: DanmakuTailConfig): Promise<void>;
  diagnostics: readonly FeatureDiagnostic[];
  runtime: FeatureRuntime;
  automation: readonly AutomationSummary[];
  danmakuObservations: readonly DanmakuSendObservation[];
  userBlocking: UserBlockingState;
  userBlockHistory: readonly UserBlockHistoryEntry[];
  userBlockHistoryStatus: "saved" | "pending" | "error";
  roomEventOptions: RoomEventOptions;
  roomEventEntries: readonly RoomEventEntry[];
  roomEventStatus: "saved" | "pending" | "error";
  onSetRoomEventOption(option: "record" | "remind", enabled: boolean): Promise<void>;
  onPreviewRoomEvent(): void;
  userFollowing: UserFollowingState;
  officialFollowSync: OfficialFollowView;
  userFollowSource(uid: string): string;
  onSetOfficialFollowSync(enabled: boolean): Promise<void>;
  onCheckOfficialFollows(): Promise<void>;
  onApplyOfficialFollows(): Promise<void>;
  onCancelOfficialPreview(): void;
  onRestoreOfficialExclusions(): Promise<void>;
  userFollowHistory: readonly UserBlockHistoryEntry[];
  userFollowHistoryStatus: "saved" | "pending" | "error";
  activityCleanupStats: ActivityCleanupSnapshot;
  activityCleanupStatsStatus: "saved" | "pending" | "error";
  activityFilterRecords: readonly ActivityFilterRecord[];
  activityFilterReviewStatus: "saved" | "pending" | "error";
  userFollowRoomName(roomId: string): string;
  chatSpeed: ChatSpeedSnapshot;
  onSetFollowingOption(option: "chatsEnabled" | "entriesEnabled" | "giftsEnabled" | "chatReminders" | "entryReminders" | "giftReminders" | "speedEnabled", value: boolean): Promise<void>;
  userFollowUnread(uid: string): number;
  onReadUserFollow(uid: string): void;
  onRemoveUserFollow(uid: string): Promise<void>;
  onLookupUser(input: string): Promise<VerifiedDouyuUser>;
  onAddVerifiedUserFollow(user: VerifiedDouyuUser): Promise<void>;
  onAddVerifiedUserBlock(user: VerifiedDouyuUser, roomId: string | null): Promise<void>;
  userBlockRoomName(roomId: string): string;
  currentRoomId: string | null;
  onSetUserBlockingEnabled(enabled: boolean): Promise<void>;
  onSetUserEntryBlockingEnabled(enabled: boolean): Promise<void>;
  onClearUserBlockHistory(uid: string): Promise<void>;
  onRemoveUserBlockRule(uid: string, roomId: string | null): Promise<void>;
  onToggleFeature(setting: FeatureSettingKey): Promise<void>;
  onSetAutoWebFullscreen(value: boolean): Promise<void>;
  onSetControlCenterEdgeSide(value: ControlCenterEdgeSide): Promise<void>;
  onSetControlCenterEdgeY(value: number): Promise<void>;
  onSetAutoFansRoomId(value: string | null): Promise<void>;
  onSetAutoFansEnabled(value: boolean): Promise<void>;
  onApplySettingsSnapshot(settings: Settings): Promise<void>;
  onRestoreDefaultSettings(): Promise<void>;
  onCopyDiagnostics(): void;
  onCopyAutomationAudit(): Promise<void>;
  onDownloadAutomationAudit(): Promise<void>;
  onClearAutomationAudit(): Promise<void>;
  onExportSettings(): void;
  onExportDanmakuObservations(): string;
  onImportDanmakuObservations(serialized: string): Promise<{ imported: number; retained: number }>;
  onSetDanmakuObservationTag(id: string, tag: string, enabled: boolean): Promise<boolean>;
  onSetDanmakuObservationNote(id: string, note: string): Promise<boolean>;
  onRemoveDanmakuObservation(id: string): Promise<boolean>;
}

const featureDefinitions: ReadonlyArray<{
  setting: FeatureSettingKey;
  id: string;
  name: string;
  description: string;
  nearField?: string;
}> = [
  { setting: "compactPlayer", id: "compact-player", name: "隐藏礼物栏", description: "隐藏播放器礼物展示并保留近场快捷开关。", nearField: "播放器菜单与悬浮开关" },
  { setting: "roomMetrics", id: "room-metrics", name: "房间统计", description: "显示在线用户与观看时长；悬停人数查看贵宾和钻粉。今日礼物来源已归档。" },
  { setting: "volumeWheel", id: "volume-wheel", name: "滚轮调音量", description: "仅在音量按钮和展开滑杆内连续调节，兼容鼠标与高分辨率滚动。", nearField: "播放器音量控件" },
  { setting: "liveTimeshiftControls", id: "live-timeshift-controls", name: "直播时移控制", description: "在支持时移的直播间用左右键回看，并可同步到最新位置。", nearField: "播放器同步时间" },
  { setting: "highestVideoQuality", id: "highest-video-quality", name: "自动最高画质", description: "每次进入直播间只选择当前账号可点击的最高画质，之后尊重手动选择。" },
  { setting: "chatMemory", id: "chat-memory", name: "弹幕历史", description: "按直播间保留发送历史，支持输入框方向键浏览。" },
  { setting: "danmakuSendCheck", id: "danmaku-send-check", name: "发送检测", description: "在两秒内未确认回显时给出本地提示。" },
  { setting: "messageContextActionFallback", id: "message-context-action-fallback", name: "弹幕快捷操作", description: "统一“加一”的单次发送；缺少“回复”时补齐，发送后恢复原草稿。" },
  { setting: "disableOfflineJump", id: "disable-offline-jump", name: "下播后停留当前页", description: "主播下播后自动关闭官方推荐跳转弹窗，继续停留当前直播间页面。" },
  { setting: "chatDecorationCleanup", id: "chat-decoration-cleanup", name: "隐藏弹幕前缀", description: "精简弹幕徽章和前缀，不隐藏正文。", nearField: "弹幕栏“前缀”" },
  { setting: "activityLinkCleanup", id: "activity-link-cleanup", name: "屏蔽活动弹幕", description: "过滤新到达的合成大西瓜、保卫鱼娘活动消息。" },
  { setting: "floatingHeadCleanup", id: "floating-head-cleanup", name: "隐藏飘屏头部图像", description: "隐藏普通飘屏开头的钻粉、活动等小图像，保留文字、彩字和表情。特殊背景皮肤暂未覆盖。" },
  { setting: "transientGuidanceCleanup", id: "transient-guidance-cleanup", name: "隐藏瞬态引导", description: "隐藏已拥有徽章的佩戴提示和亲密度 BUFF 横条，不改变粉丝牌、播放器或账号状态。" },
  { setting: "bagInfo", id: "bag-info", name: "背包只读信息", description: "在原生背包中追加只读总价值、总亲密度和期限提示；价值按鱼翅口径统计，不执行赠送或清理。" },
  { setting: "chatLayout", id: "chat-layout", name: "拉高弹幕区", description: "隐藏排行榜并扩大弹幕阅读区域。", nearField: "弹幕栏“拉高”" },
];

function diagnosticFor(model: ControlCenterModel, id: string): FeatureDiagnostic | undefined {
  return model.diagnostics.find((item) => item.id === id);
}

function statusText(status: FeatureDiagnostic["status"] | undefined): string {
  const labels: Record<FeatureDiagnostic["status"], string> = {
    disabled: "已停用", starting: "正在启动", waiting: "等待页面", degraded: "已降级", active: "运行中", error: "异常",
  };
  return status ? labels[status] : "未报告";
}

/** Audit records are UTC ISO strings; the drawer should show the viewer's local time. */
export function formatAutomationLocalTime(value: string | undefined): string {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  const part = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())} ${part(date.getHours())}:${part(date.getMinutes())}:${part(date.getSeconds())}`;
}

export function danmakuObservationEvidenceText(
  evidence: DanmakuSendObservation["evidence"],
): string {
  return evidence === "suspected" ? "疑似未公开" : "未确认";
}

export function danmakuObservationResolutionText(
  resolution: DanmakuSendObservation["resolution"],
): string {
  return resolution === "confirmed-delayed" ? "迟到更正" : "待复核";
}

export function danmakuObservationTagText(tag: string): string {
  return DANMAKU_SEND_OBSERVATION_TAGS.find((item) => item.value === tag)?.label ?? tag;
}

export function filterDanmakuObservations(
  records: readonly DanmakuSendObservation[],
  roomId: string,
  evidence: "all" | DanmakuSendObservation["evidence"],
  resolution: "all" | DanmakuSendObservation["resolution"],
  tag = "all",
  search = "",
): DanmakuSendObservation[] {
  const query = search.trim().toLocaleLowerCase();
  return records
    .filter((record) => !roomId || record.roomId === roomId)
    .filter((record) => evidence === "all" || record.evidence === evidence)
    .filter((record) => resolution === "all" || record.resolution === resolution)
    .filter((record) => tag === "all" || record.tags?.includes(tag) === true)
    .filter((record) => !query || [record.message, record.note ?? "", record.roomId].some((value) => value.toLocaleLowerCase().includes(query)))
    .slice()
    .sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt));
}

function observationPreview(message: string): string {
  return message.length > 72 ? `${message.slice(0, 72)}…` : message;
}

export function isPositiveRoomId(value: string): boolean {
  return /^[1-9]\d*$/.test(value);
}

export function isVisibleChatPanel(document: Document): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(
    ".layout-Player-aside, .layout-Player-asideMain, .Barrage, .chat-container",
  );
  for (const candidate of candidates) {
    const rect = candidate.getBoundingClientRect();
    const style = document.defaultView?.getComputedStyle(candidate);
    if (rect.width >= 180 && rect.height >= 180 && style?.display !== "none" && style?.visibility !== "hidden") return candidate;
  }
  return null;
}

export function isPureVideoFullscreen(document: Document): boolean {
  const fullscreen = Boolean(document.fullscreenElement || (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement);
  return (fullscreen || isDouyuWebFullscreen(document)) && !isVisibleChatPanel(document);
}

/** Shadow DOM retargets events at the host, so inspect the whole composed path. */
export function isControlCenterEdgePath(path: readonly EventTarget[]): boolean {
  return path.some((target) => {
    const classList = (target as { classList?: { contains?(name: string): boolean } } | null)?.classList;
    return classList?.contains?.("edge") === true;
  });
}

/** Shared ObserverHub may see chat churn; geometry is relevant only while open. */
export function createOpenOnlyGeometryRefresh(
  isOpen: () => boolean,
  refreshGeometry: () => void,
): () => void {
  return () => {
    if (isOpen()) refreshGeometry();
  };
}

export class DouyuControlCenterElement extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    hiddenForVideo: { type: Boolean, reflect: true, attribute: "data-dwe-pure-video" },
    model: { attribute: false },
  };

  static styles = css`
    :host { --dwe-cc-accent: #ff6a3d; --dwe-cc-bg: rgba(23,24,29,.84); --dwe-cc-surface: rgba(36,38,46,.88); --dwe-cc-text: #f6f7fb; --dwe-cc-muted: #a9afbd; --dwe-cc-warning: #ffc17c; --dwe-cc-border: rgba(255,255,255,.12); --dwe-cc-radius: 14px; --dwe-cc-duration: 240ms; --dwe-cc-gutter: 16px; position: fixed; inset: 0; z-index: 2147483000; pointer-events: none; color-scheme: dark; font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .edge, .backdrop { pointer-events: auto; } .edge { position:fixed; right:0; top:clamp(28px, var(--dwe-edge-y, 50vh), calc(100vh - 28px)); transform:translateY(-50%); display:grid; place-items:center; width:36px; height:42px; padding:0; box-sizing:border-box; border:1px solid var(--dwe-cc-border); border-right:0; border-radius:14px 0 0 14px; background:#24262e; color:var(--dwe-cc-text); box-shadow:0 3px 12px rgba(0,0,0,.24); cursor:pointer; touch-action:none; user-select:none; }
    .edge.edge-left { left:0; right:auto; border-right:1px solid var(--dwe-cc-border); border-left:0; border-radius:0 14px 14px 0; }
    .edge.edge-right { right:0; left:auto; }
    .edge:hover, .edge:focus-visible { background:#30333d; outline:none; } .edge:focus-visible { box-shadow:0 0 0 3px rgba(255,106,61,.55); } .edge[data-dragging] { cursor:grabbing; }
    .glyph { width:20px; height:20px; display:grid; place-items:center; border-radius:50%; background:var(--dwe-cc-accent); font-weight:800; } .backdrop { position:fixed; inset:0; background:rgba(0,0,0,.12); opacity:0; visibility:hidden; transition:opacity var(--dwe-cc-duration) ease, visibility var(--dwe-cc-duration); } :host([open]) .backdrop { opacity:1; visibility:visible; }
    .panel { position:absolute; top:0; right:0; height:100%; width:min(var(--dwe-control-center-panel-width, 400px), 100vw); box-sizing:border-box; display:flex; flex-direction:column; pointer-events:auto; background:var(--dwe-cc-bg); backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); color:var(--dwe-cc-text); border-left:1px solid var(--dwe-cc-border); box-shadow:-12px 0 36px rgba(0,0,0,.35); transform:translateX(104%); transition:transform var(--dwe-cc-duration) cubic-bezier(.2,.8,.2,1); } :host([open]) .panel { transform:translateX(0); }
    .panel.panel-left { left:0; right:auto; border-left:0; border-right:1px solid var(--dwe-cc-border); box-shadow:12px 0 36px rgba(0,0,0,.35); transform:translateX(-104%); } :host([open]) .panel.panel-left { transform:translateX(0); }
    .backdrop.observation-open { pointer-events:none; background:transparent; }
    header { flex:0 0 auto; display:flex; justify-content:space-between; align-items:center; padding:18px 16px 12px; border-bottom:1px solid var(--dwe-cc-border); } h1 { margin:0; font-size:16px; } .version { color:var(--dwe-cc-muted); font-size:12px; } .header-actions { display:flex; align-items:center; gap:6px; } button { font:inherit; } .edge-side { font-size:11px; padding:6px 8px; } .close { border:0; background:transparent; color:inherit; width:32px; height:32px; border-radius:8px; cursor:pointer; font-size:22px; } .close:hover, .close:focus-visible { background:rgba(255,255,255,.1); outline:none; }
    nav { flex:0 0 44px; display:flex; align-items:center; gap:4px; height:44px; box-sizing:border-box; padding:0 var(--dwe-cc-gutter); overflow:auto; border-bottom:1px solid var(--dwe-cc-border); } nav button { display:inline-flex; align-items:center; height:30px; box-sizing:border-box; border:0; background:transparent; color:var(--dwe-cc-muted); padding:0 9px; border-radius:8px; white-space:nowrap; cursor:pointer; } nav button[aria-current="page"] { color:#fff; background:rgba(255,106,61,.18); } main { flex:1 1 auto; min-height:0; overflow:auto; padding:20px 0 28px; } section { margin:0 var(--dwe-cc-gutter) 24px; } h2 { margin:0 0 10px; font-size:13px; color:#fff; } .hint { margin:0 0 14px; color:var(--dwe-cc-muted); font-size:12px; }
    .row { display:grid; grid-template-columns:1fr auto; gap:10px; padding:12px; border:1px solid var(--dwe-cc-border); border-radius:var(--dwe-cc-radius); background:var(--dwe-cc-surface); } .row + .row { margin-top:8px; } .name { font-weight:650; } .desc, .runtime { color:var(--dwe-cc-muted); font-size:12px; margin-top:3px; } .runtime { display:block; } .runtime[data-status="active"] { color:#93e0ad; } .runtime[data-status="waiting"], .runtime[data-status="starting"] { color:#a9d3ff; } .runtime[data-status="degraded"] { color:var(--dwe-cc-warning); } .runtime[data-status="error"] { color:#ff9eaa; }
    .switch { align-self:center; appearance:none; border:0; width:42px; height:24px; border-radius:999px; background:#626876; cursor:pointer; position:relative; transition:background var(--dwe-cc-duration); } .switch::after { content:""; position:absolute; width:18px; height:18px; border-radius:50%; left:3px; top:3px; background:white; transition:transform var(--dwe-cc-duration); } .switch[aria-checked="true"] { background:var(--dwe-cc-accent); } .switch[aria-checked="true"]::after { transform:translateX(18px); } .switch:focus-visible { outline:3px solid rgba(255,106,61,.55); outline-offset:2px; }
    .follow-lookup { flex-direction:column; } .field-inline { display:flex; gap:8px; } .field-inline input { width:0; }
    .field { display:flex; gap:8px; margin-top:8px; } input, select { min-width:0; flex:1; border:1px solid var(--dwe-cc-border); border-radius:8px; background:#111217; color:inherit; padding:8px; } .action { border:1px solid var(--dwe-cc-border); border-radius:8px; background:#30333d; color:inherit; padding:8px 10px; cursor:pointer; } .action:hover, .action:focus-visible { border-color:var(--dwe-cc-accent); outline:none; }
    .tail-settings { margin:12px 0; border:1px solid var(--dwe-cc-border); border-radius:var(--dwe-cc-radius); overflow:hidden; background:var(--dwe-cc-surface); } .tail-settings > summary { padding:13px 12px; cursor:pointer; font-weight:650; } .tail-settings > summary .runtime { display:inline; margin-left:8px; font-weight:400; } .tail-settings .row { border:0; border-radius:0; background:none; } .tail-editor { display:grid; gap:9px; padding:0 12px 12px; } .tail-editor > label { font-weight:600; } .tail-editor input { width:100%; box-sizing:border-box; } .tail-position,.tail-actions { display:flex; align-items:center; gap:8px; } .tail-position .action { flex:1; } .tail-position .action[aria-pressed="true"] { border-color:var(--dwe-cc-accent); background:rgba(255,106,61,.16); } .tail-actions span { color:var(--dwe-cc-muted); font-size:12px; } .tail-editor .hint { margin:0; }
    .message-group { margin-top:10px; border:1px solid var(--dwe-cc-border); border-radius:var(--dwe-cc-radius); background:var(--dwe-cc-surface); }
    .message-group > summary { display:flex; justify-content:space-between; align-items:center; gap:10px; cursor:pointer; padding:13px 12px; font-weight:650; }
    .message-group > summary span { font-size:12px; color:var(--dwe-cc-muted); font-weight:400; }
    .message-group-body { padding:0 12px 12px; } .message-group-body .row { background:rgba(0,0,0,.12); }
    .message-add-hint { font-size:12px; color:var(--dwe-cc-muted); margin:12px 2px 4px; }
    .history-save-status { font-size:11px; color:var(--dwe-cc-muted); margin:0 2px 12px; } .history-save-status[data-state="error"] { color:var(--dwe-cc-warning); }
    .message-rule-list { list-style:none; margin:0; padding:0; display:grid; gap:10px; }
    .blocked-user { padding:14px; border:1px solid var(--dwe-cc-border); border-radius:12px; background:rgba(0,0,0,.16); min-width:0; }
    .blocked-user-heading { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; }
    .blocked-user-identity { min-width:0; overflow-wrap:anywhere; } .blocked-user-identity .name { font-size:14px; }
    .blocked-user-id { margin-top:3px; font-size:11px; color:var(--dwe-cc-muted); }
    .blocked-user-count { flex-shrink:0; text-align:right; display:grid; gap:2px; } .blocked-user-count strong { font-size:22px; line-height:1.15; font-variant-numeric:tabular-nums; }
    .blocked-user-count span { font-size:10px; color:var(--dwe-cc-muted); }
    .blocked-user-scopes { margin-top:10px; display:grid; gap:6px; }
    .blocked-user-scope { display:flex; justify-content:space-between; align-items:center; gap:8px; }
    .blocked-user-scope > div { min-width:0; overflow-wrap:anywhere; }
    .scope-badge { display:inline-block; font-size:11px; padding:3px 7px; border-radius:6px; background:#ffffff0c; color:var(--dwe-cc-muted); }
    .scope-badge[data-scope="all"] { color:#ffd0ad; background:#ff6d381c; } .scope-badge[data-scope="current"] { color:#b8ddff; background:#5eaeff1c; }
    .blocked-room-id { display:block; margin:3px 7px 0; font-size:10px; color:var(--dwe-cc-muted); }
    .subtle-action { background:transparent; padding:4px 7px; font-size:11px; color:var(--dwe-cc-muted); }
    .blocked-user-history { margin-top:10px; border-top:1px solid var(--dwe-cc-border); }
    .blocked-user-history > summary { cursor:pointer; color:var(--dwe-cc-muted); font-size:12px; padding-top:9px; }
    .blocked-user-history ol { list-style:none; padding:0; margin:8px 0; max-height:320px; overflow:auto; }
    .blocked-user-history li { padding:9px 0; border-bottom:1px solid var(--dwe-cc-border); overflow-wrap:anywhere; }
    .blocked-sample-meta { display:flex; flex-wrap:wrap; justify-content:space-between; gap:4px; font-size:10px; color:var(--dwe-cc-muted); }
    .blocked-sample-text { white-space:pre-wrap; font-size:13px; line-height:1.6; margin-top:4px; }
    .history-clear { appearance:none; border:0; background:transparent; color:var(--dwe-cc-muted); padding:6px 0; font-size:11px; cursor:pointer; }
    .history-clear:hover, .history-clear:focus-visible { color:var(--dwe-cc-warning); }
    .blocked-history-confirm { font-size:12px; color:var(--dwe-cc-warning); padding-top:6px; } .blocked-history-confirm button + button { margin-left:6px; }
    .message-empty { padding:20px 12px; text-align:center; color:var(--dwe-cc-muted); font-size:12px; }
    .notice { padding:12px; border-radius:10px; background:rgba(255,157,64,.12); color:#ffcf98; margin:8px var(--dwe-cc-gutter); } .field-feedback { margin:8px 0 0; color:var(--dwe-cc-muted); font-size:12px; } .field-feedback[data-state="dirty"] { color:#ffcf98; } .field-feedback[data-state="error"] { color:var(--dwe-cc-warning); } .audit { margin:0; padding:8px 12px; list-style:none; border:1px solid var(--dwe-cc-border); border-radius:var(--dwe-cc-radius); background:var(--dwe-cc-surface); } .audit li { padding:10px 0; border-bottom:1px solid var(--dwe-cc-border); font-size:12px; } .audit li:last-child { border-bottom:0; } .audit time { color:var(--dwe-cc-muted); } .actions { display:grid; gap:8px; } .file-picker, .send-observation-file-picker { display:none; } .diff { margin:8px 0 0; padding-left:18px; font-size:12px; } .diff li + li { margin-top:4px; } .confirm-actions { display:flex; gap:8px; margin-top:10px; } .data-status { margin:10px 0 0; color:var(--dwe-cc-muted); font-size:12px; }
    .observation-history { margin-top:12px; padding:12px; border:1px solid var(--dwe-cc-border); border-radius:var(--dwe-cc-radius); background:var(--dwe-cc-surface); } .observation-heading { display:flex; justify-content:space-between; gap:8px; align-items:center; } .observation-heading .hint { margin:3px 0 0; } .observation-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; } .observation-actions .action { font-size:12px; } .observation-filters { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:8px; margin-top:10px; } .observation-filters label { display:grid; gap:4px; color:var(--dwe-cc-muted); font-size:11px; } .observation-filters select { width:100%; font-size:12px; } .observation-list { margin:10px 0 0; padding:0; list-style:none; border-top:1px solid var(--dwe-cc-border); } .observation-list li { padding:10px 0; border-bottom:1px solid var(--dwe-cc-border); } .observation-list li:last-child { border-bottom:0; } .observation-message { margin:8px 0 0; color:var(--dwe-cc-muted); font-size:12px; } .observation-card-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; } .observation-card-heading details { min-width:0; flex:1; } .observation-card-heading summary { cursor:pointer; overflow-wrap:anywhere; } .observation-card-heading details p { margin:7px 0 0; overflow-wrap:anywhere; color:var(--dwe-cc-muted); } .observation-chip { flex:0 0 auto; padding:2px 6px; border-radius:999px; background:rgba(255,193,124,.15); color:#ffcf98; font-size:11px; } .observation-chip[data-resolution="confirmed-delayed"] { background:rgba(114,212,153,.14); color:#93e0ad; } .observation-meta { margin-top:5px; color:var(--dwe-cc-muted); font-size:11px; } .observation-search { width:100%; box-sizing:border-box; margin-top:10px; } .observation-tag-list { display:flex; flex-wrap:wrap; gap:5px; margin-top:8px; } .observation-tag { padding:3px 7px; border:1px solid var(--dwe-cc-border); border-radius:999px; background:rgba(94,174,255,.12); color:#b8ddff; font-size:11px; } .observation-card-note { width:100%; box-sizing:border-box; min-height:54px; margin-top:8px; resize:vertical; } .observation-card-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:8px; } .observation-drawer { position:fixed; top:0; left:0; right:auto; bottom:0; z-index:4; display:flex; flex-direction:column; box-sizing:border-box; width:min(560px,100vw); padding:18px 16px 28px; overflow:hidden; pointer-events:auto; border-right:1px solid var(--dwe-cc-border); background:var(--dwe-cc-bg); backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); box-shadow:12px 0 36px rgba(0,0,0,.35); } .observation-drawer-header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex:0 0 auto; } .observation-drawer-header h2 { margin:0; font-size:18px; } .observation-drawer-header .hint { margin-top:4px; } .observation-drawer-content { flex:1 1 auto; min-height:0; overflow:auto; margin-top:12px; }
    .observation-list { display:grid; gap:10px; margin-top:12px; border-top:0; }
    .observation-list li { padding:14px; border:1px solid var(--dwe-cc-border); border-radius:12px; background:rgba(36,38,46,.78); }
    .observation-record-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
    .observation-record-main { min-width:0; flex:1 1 auto; }
    .observation-record-message { color:var(--dwe-cc-text); font-size:16px; font-weight:650; line-height:1.55; overflow-wrap:anywhere; letter-spacing:.01em; }
    .observation-record-meta { margin-top:6px; color:var(--dwe-cc-muted); font-size:11px; }
    .observation-record-status { display:flex; flex:0 0 auto; flex-wrap:wrap; justify-content:flex-end; gap:4px; max-width:42%; }
    .observation-record-status .observation-chip { white-space:nowrap; }
    .observation-record-tags { display:flex; flex-wrap:wrap; gap:5px; margin-top:10px; }
    .observation-editor { margin-top:12px; border-top:1px solid var(--dwe-cc-border); padding-top:9px; }
    .observation-editor summary { cursor:pointer; color:var(--dwe-cc-muted); font-size:11px; }
    .observation-editor summary:hover, .observation-editor summary:focus-visible { color:var(--dwe-cc-text); }
    .observation-editor-body { display:grid; gap:8px; margin-top:8px; }
    .observation-editor-body .field { margin-top:0; }
    .observation-editor-body .observation-card-note { margin-top:0; }
    .observation-card-actions { margin-top:0; }
    .observation-card-actions .observation-message { margin:0; align-self:center; }
    @media (max-width:640px) { .observation-filters { grid-template-columns:repeat(2, minmax(0, 1fr)); } .observation-record-head { display:block; } .observation-record-status { justify-content:flex-start; max-width:none; margin-top:8px; } }
    :host([data-dwe-pure-video="true"]) .edge, :host([data-dwe-pure-video="true"]) .backdrop { display:none; }
    @media (max-width:640px) { :host(:not([data-dwe-chat-bounded])) .panel { width:100vw; } }

    .users-page { font-size:14px; line-height:1.55; }
    .users-page section { margin:0; }
    .page-intro { margin-bottom:20px; } .page-intro h2 { font-size:22px; letter-spacing:-.4px; margin:0 0 6px; }
    .page-intro p { color:var(--dwe-cc-muted); margin:0; font-size:14px; }
    .users-page .user-section { padding:18px 0; border-top:1px solid var(--dwe-cc-border); }
    .following-section > summary { display:flex; align-items:center; gap:10px; cursor:pointer; list-style:none; }
    .following-section > summary::-webkit-details-marker { display:none; }
    .following-section > summary::before { content:"›"; color:var(--dwe-cc-muted); font-size:22px; line-height:1; transition:transform .12s; }
    .following-section[open] > summary::before { transform:rotate(90deg); }
    .following-section > summary .state-tag { margin-left:auto; }
    .following-section > summary:focus-visible { outline:2px solid var(--dwe-cc-accent); outline-offset:5px; border-radius:4px; }
    .following-list { margin-top:16px; } .following-list > summary { cursor:pointer; font-size:14px; font-weight:600; }
    .following-list > summary .group-note { margin-left:8px; }
    .activity-stats { padding:0 0 16px; font-size:13px; color:var(--dwe-cc-muted); }
    .activity-stats .stats-total { margin:8px 0; font-variant-numeric:tabular-nums; color:var(--dwe-cc-text); }
    .activity-stats table { width:100%; margin:10px 0; border-collapse:collapse; font-size:12px; }
    .activity-stats th,.activity-stats td { text-align:left; padding:6px 3px; border-bottom:1px solid var(--dwe-cc-border); }
    .activity-stats th:nth-child(2),.activity-stats td:nth-child(2) { text-align:right; }
    .activity-stats th:last-child,.activity-stats td:last-child { text-align:right; }
    .activity-review-list { display:grid; gap:8px; list-style:none; margin:10px 0 0; padding:0; }
    .activity-review-list li { min-width:0; padding:12px; border:1px solid var(--dwe-cc-border); border-radius:10px; background:rgba(0,0,0,.13); overflow-wrap:anywhere; }
    .activity-review-heading { display:flex; flex-wrap:wrap; justify-content:space-between; gap:6px; align-items:baseline; color:var(--dwe-cc-text); }
    .activity-review-heading small { color:var(--dwe-cc-muted); font-size:11px; }
    .activity-review-meta { margin-top:5px; font-size:12px; color:var(--dwe-cc-muted); }
    .activity-review-list .activity-review-text { margin:8px 0 0; font-size:14px; color:var(--dwe-cc-text); white-space:pre-wrap; }
    .section-heading,.list-heading,.setting-line { display:flex; align-items:center; justify-content:space-between; gap:10px; }
    .users-page h3 { font-size:17px; margin:0; font-weight:650; } .users-page h4 { font-size:14px; margin:0; }
    .quantity { font-size:12px; border:1px solid var(--dwe-cc-border); padding:2px 8px; border-radius:999px; color:var(--dwe-cc-muted); font-variant-numeric:tabular-nums; }
    .section-description { margin:5px 0 14px; color:var(--dwe-cc-muted); font-size:13px; }
    .toggle-group { padding:12px; margin:8px 0; background:#ffffff05; border:1px solid var(--dwe-cc-border); border-radius:10px; }
    .group-label { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; font-size:14px; font-weight:600; }
    .group-note,.user-source { font-size:12px; color:var(--dwe-cc-muted); font-weight:400; }
    .state-tag { font-size:12px; color:var(--dwe-cc-muted); font-weight:400; } .state-tag[data-on="true"] { color:#a9ddbf; }
    .toggle-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
    .toggle-grid label { display:flex; gap:6px; align-items:center; justify-content:space-between; font-size:13px; }
    .toggle-grid .switch { flex-shrink:0; width:36px; height:22px; } .toggle-grid .switch::after { width:16px; height:16px; } .toggle-grid .switch[aria-checked="true"]::after { transform:translateX(14px); }
    .setting-line { padding:9px 0; } .setting-line .switch { flex-shrink:0; }
    .quiet-details { padding:10px 0; } .quiet-details > summary { color:var(--dwe-cc-muted); font-size:13px; cursor:pointer; } .quiet-details > summary:hover { color:var(--dwe-cc-text); }
    .quiet-details p { color:var(--dwe-cc-muted); font-size:13px; margin:8px 0; }
    .list-heading { margin:18px 0 9px; }
    .lookup-input { display:flex; align-items:stretch; border:1px solid var(--dwe-cc-border); border-radius:9px; overflow:hidden; background:#111217; }
    .lookup-input input { width:0; border:0; background:transparent; padding:11px 10px; font:inherit; outline:none; }
    .lookup-input:focus-within { border-color:var(--dwe-cc-accent); box-shadow:0 0 0 2px #ff6a3d18; }
    .lookup-input .action { flex-shrink:0; border:0; border-left:1px solid var(--dwe-cc-border); border-radius:0; padding:0 12px; }
    .primary-action { background:#ff6a3d20; color:#ffbfaa; font-weight:600; }
    .lookup-result { display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between; padding:12px 0; }
    .users-page a { color:#b7ceff; text-decoration:none; } .users-page a:hover { text-decoration:underline; }
    .list-toolbar { display:flex; gap:8px; margin:10px 0; } .list-toolbar input { width:0; font:inherit; font-size:13px; }
    .filter-chip { padding:6px 10px; border:1px solid var(--dwe-cc-border); border-radius:8px; background:transparent; color:var(--dwe-cc-muted); cursor:pointer; }
    .filter-chip[aria-pressed="true"] { background:#ff6a3d20; color:#ffbfaa; border-color:#ff6a3d70; }
    .compact-list { gap:0; border:1px solid var(--dwe-cc-border); border-radius:10px; overflow:hidden; background:#ffffff03; }
    .compact-list .blocked-user { padding:12px; border:0; border-bottom:1px solid var(--dwe-cc-border); border-radius:0; background:transparent; }
    .compact-list .blocked-user:last-child { border-bottom:0; } .compact-list .blocked-user-id { font-size:12px; }
    .user-stat { font-size:12px; color:var(--dwe-cc-muted); white-space:nowrap; font-variant-numeric:tabular-nums; }
    .user-source { margin-top:4px; } .inline-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
    .users-page .subtle-action { font-size:12px; padding:4px 8px; border-radius:6px; }
    .users-page .blocked-user-history { margin-top:7px; border:0; } .users-page .blocked-user-history > summary { padding-top:0; font-size:13px; }
    .users-page .blocked-sample-meta { font-size:12px; } .users-page .message-empty { padding:16px 12px; color:var(--dwe-cc-muted); font-size:13px; }
    .users-page .load-more { margin-top:10px; width:100%; font-size:13px; background:transparent; }
    .users-page .sync-details { border-bottom:1px solid var(--dwe-cc-border); margin-top:8px; }
    .users-page .sync-details > summary { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:6px; }
    .users-page .sync-details .row { margin-top:10px; background:transparent; border-radius:8px; }
    .users-page .field-feedback { font-size:13px; color:var(--dwe-cc-warning); }
    .users-page button:disabled { opacity:.5; cursor:default; }
    .users-page input:focus-visible,.users-page select:focus-visible { outline:2px solid var(--dwe-cc-accent); outline-offset:1px; }
    .notification-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:18px; }
    .notification-heading h2 { margin:0 0 3px; font-size:20px; letter-spacing:-.3px; }
    .notification-subtitle { font-size:12px; color:var(--dwe-cc-muted); }
    .notification-read-all { padding:5px 0; border:0; background:transparent; color:var(--dwe-cc-accent); cursor:pointer; font-size:12px; white-space:nowrap; }
    .notification-read-all:disabled { color:var(--dwe-cc-muted); opacity:.5; cursor:default; }
    .notification-tabs { display:flex; gap:4px; border-bottom:1px solid var(--dwe-cc-border); padding-bottom:10px; }
    .notification-tabs button { flex:1; border:0; border-radius:7px; background:transparent; color:var(--dwe-cc-muted); padding:6px 4px; font-size:12px; white-space:nowrap; cursor:pointer; }
    .notification-tabs button[aria-pressed="true"] { background:rgba(255,106,61,.13); color:#ff956f; }
    .notification-tabs span { margin-left:4px; font-size:10px; opacity:.7; font-variant-numeric:tabular-nums; }
    .notification-item { position:relative; padding:11px 0 11px 12px; border-bottom:1px solid var(--dwe-cc-border); }
    .notification-item[data-unread="true"]::before { content:""; position:absolute; left:0; top:19px; width:5px; height:5px; border-radius:50%; background:var(--dwe-cc-accent); }
    .notification-item-heading { display:flex; align-items:center; gap:8px; height:20px; font-size:11px; }
    .notification-type { color:#a5b8e8; } .notification-type[data-source="room"] { color:#d7afe9; } .notification-type[data-source="general"] { color:#a6c6bb; }
    .notification-item time { margin-left:auto; color:var(--dwe-cc-muted); font-variant-numeric:tabular-nums; }
    .notification-read,.notification-read-state { width:22px; box-sizing:border-box; text-align:center; font-size:10px; color:var(--dwe-cc-muted); }
    .notification-read { border:0; border-radius:4px; height:22px; padding:0; background:transparent; font-size:14px; cursor:pointer; }
    .notification-read:hover,.notification-read:focus-visible { background:rgba(255,255,255,.08); color:#fff; }
    .notification-title { margin:3px 0; font-size:12px; line-height:1.5; color:var(--dwe-cc-text); overflow-wrap:anywhere; }
    .notification-text { font-size:12px; line-height:1.5; color:var(--dwe-cc-muted); white-space:pre-wrap; overflow-wrap:anywhere; }
    .notification-options { display:flex; justify-content:space-between; gap:12px; padding:10px 0 3px; color:var(--dwe-cc-muted); font-size:12px; }
    .notification-options label { display:flex; align-items:center; gap:4px; cursor:pointer; }
    .follow-unread-settings { margin:8px 0; font-size:12px; } .follow-unread-settings > summary { cursor:pointer; color:var(--dwe-cc-text); } .follow-unread-settings > summary span { margin-left:6px; color:var(--dwe-cc-muted); font-size:11px; }
    .follow-unread-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin-top:10px; } .follow-unread-grid label { display:grid; gap:5px; font-size:12px; } .follow-unread-grid select { width:100%; padding:6px 3px; font-size:11px; }
    .follow-unread-footer { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:8px; font-size:11px; color:var(--dwe-cc-muted); } .follow-unread-footer button { font-size:11px; }
    .notification-manage-toggle,.notification-user-settings { border:0; background:transparent; color:var(--dwe-cc-muted); cursor:pointer; padding:4px 0; font-size:11px; } .notification-manage-toggle { margin:4px 0; color:var(--dwe-cc-accent); }
    .notification-user-settings { margin-left:auto; } .notification-item-heading:has(.notification-user-settings) time { margin-left:0; } .notification-managed-user { padding:10px 0; border-bottom:1px solid var(--dwe-cc-border); font-size:12px; }
    .notification-follow-manager,.notification-person-editor { padding:10px; margin:8px 0; border:1px solid var(--dwe-cc-border); border-radius:8px; background:rgba(255,255,255,.02); } .notification-follow-manager > input { width:100%; box-sizing:border-box; } .notification-person-editor .notification-heading { margin-bottom:0; font-size:12px; }
    .notification-empty { text-align:center; padding:36px 0; color:var(--dwe-cc-muted); font-size:13px; }
    .notification-footnote { margin:16px 0 0; color:var(--dwe-cc-muted); font-size:11px; opacity:.75; }
    @media(max-width:360px) { .toggle-grid label { flex-direction:column; } .inline-actions { gap:5px; } }
    @media (prefers-reduced-motion:reduce) { *, *::before, *::after { transition-duration:1ms !important; scroll-behavior:auto !important; } }
  `;

  declare open: boolean;
  declare hiddenForVideo: boolean;
  declare model: ControlCenterModel;
  #section = "overview";
  #sectionBeforeNotifications = "overview";
  #openNotifications = (): void => {
    if (this.#section !== "notifications") this.#sectionBeforeNotifications = this.#section;
    this.#section = "notifications"; this.requestUpdate();
  };
  #notificationEditingUid: string | null = null;
  #editNotificationUser(uid: string): void {
    this.#notificationEditingUid = uid; this.requestUpdate();
    void this.updateComplete.then(() => this.shadowRoot?.querySelector(".notification-person-editor")?.scrollIntoView({block:"nearest"}));
  }
  #notificationManageUsers = false;
  #notificationManageSearch = "";
  #notificationManageLimit = 20;
  #notificationShowRead = false;
  #notificationSeen = new Set<string>();
  #notificationObserver?: IntersectionObserver;
  #notificationSession = "";
  #notificationLimit = 20;
  #notificationFilter: NoticeRecord["source"] | "all" = "all";
  #userLookupDraft = "";
  #userLookupBusy = false;
  #userLookupError = "";
  #userLookupResult: VerifiedDouyuUser | null = null;
  #userLookupSequence = 0;
  #followVisibleLimit = 20;
  #followSearch = "";
  #followUnreadOnly = false;
  #followingExpanded = false;
  #followingListExpanded = false;
  #activityRoomLimit = 10;
  #blockSearch = "";
  #blockVisibleLimit = 20;
  #blockLookupDraft = "";
  #blockLookupBusy = false;
  #blockLookupError = "";
  #blockLookupResult: VerifiedDouyuUser | null = null;
  #blockLookupSequence = 0;
  #blockScope = "current";
  #clearBlockHistoryUid: string | null = null;
  #confirmDaily = false;
  #message = "";
  #autoFansRoomDraft = "";
  #autoFansRoomSaved = "";
  #autoFansRoomError = "";
  #autoFansRoomFeedback = "";
  #tailSaved = "";
  #tailDraft = "";
  #tailPosition: DanmakuTailConfig["position"] = "suffix";
  #tailError = "";
  #tailFeedback = "";
  #tailOpen = false;
  #dataMessage = "";
  #pendingSettings: Settings | null = null;
  #pendingSettingsKind: "import" | "reset" | null = null;
  #pendingSettingsDiff: SettingsDifference[] = [];
  #confirmClearAudit = false;
  #showDanmakuObservationHistory = false;
  #danmakuObservationSearch = "";
  #danmakuObservationRoomId = "";
  #danmakuObservationEvidence: "all" | DanmakuSendObservation["evidence"] = "all";
  #danmakuObservationResolution: "all" | DanmakuSendObservation["resolution"] = "all";
  #danmakuObservationTag = "all";
  #danmakuObservationSelectedTags: Record<string, string> = {};
  #danmakuObservationMessage = "";
  #confirmRemoveDanmakuObservation: string | null = null;
  #returnFocus: HTMLElement | null = null;
  #edgeDrag: { id: number; startY: number; originalY: number; moved: boolean } | null = null;
  #suppressEdgeClick = false;
  #edgePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.#suppressEdgeClick = false;
    const button = event.currentTarget as HTMLElement;
    this.#edgeDrag = { id: event.pointerId, startY: event.clientY, originalY: button.getBoundingClientRect().top + 21, moved: false };
    button.setPointerCapture(event.pointerId);
  };
  #edgePointerMove = (event: PointerEvent): void => {
    const drag = this.#edgeDrag;
    if (!drag || drag.id !== event.pointerId) return;
    if (Math.abs(event.clientY - drag.startY) > 5) drag.moved = true;
    if (!drag.moved) return;
    const height = this.ownerDocument.defaultView?.innerHeight ?? 1;
    const y = Math.max(28, Math.min(height - 28, drag.originalY + event.clientY - drag.startY));
    this.style.setProperty("--dwe-edge-y", `${y}px`);
    (event.currentTarget as HTMLElement).setAttribute("data-dragging", "");
  };
  #edgePointerEnd = (event: PointerEvent): void => {
    const drag = this.#edgeDrag;
    if (!drag || drag.id !== event.pointerId) return;
    this.#edgeDrag = null;
    const button = event.currentTarget as HTMLElement;
    button.removeAttribute("data-dragging");
    if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
    this.#suppressEdgeClick = drag.moved;
    if (drag.moved && event.type === "pointerup") {
      const height = this.ownerDocument.defaultView?.innerHeight ?? 1;
      const value = (button.getBoundingClientRect().top + 21) / height;
      this.#run(async () => { try { await this.model.onSetControlCenterEdgeY(value); }
        finally { this.style.removeProperty("--dwe-edge-y"); this.requestUpdate(); } });
    } else this.style.removeProperty("--dwe-edge-y");
  };
  #edgeClick = (event: MouseEvent): void => {
    if (this.#suppressEdgeClick) { this.#suppressEdgeClick = false; event.preventDefault(); event.stopPropagation(); return; }
    this.open = true;
  };
  #toggleEdgeSide = (): void => {
    const next: ControlCenterEdgeSide = this.model.settings.preferences.controlCenterEdgeSide === "left" ? "right" : "left";
    this.#run(() => this.model.onSetControlCenterEdgeSide(next));
  };
  showDanmakuSettings(): void {
    this.#section = "chat"; this.#tailOpen = true; this.open = true; this.requestUpdate();
    void this.updateComplete.then(() => {
      this.shadowRoot?.querySelector(".tail-settings")?.scrollIntoView({ block: "nearest" });
      this.shadowRoot?.querySelector<HTMLInputElement>("#dwe-tail-text")?.focus({ preventScroll: true });
    });
  }

  #notificationVisibility = (): void => { this.requestUpdate(); };
  connectedCallback(): void {
    super.connectedCallback();
    this.ownerDocument.addEventListener("visibilitychange",this.#notificationVisibility);
    this.ownerDocument.defaultView?.addEventListener("focus",this.#notificationVisibility);
    this.ownerDocument.defaultView?.addEventListener("blur",this.#notificationVisibility);
    this.addEventListener("keydown", this.#onKeydown);
  }
  disconnectedCallback(): void { this.ownerDocument.defaultView?.removeEventListener("focus",this.#notificationVisibility); this.ownerDocument.defaultView?.removeEventListener("blur",this.#notificationVisibility); this.ownerDocument.removeEventListener("visibilitychange",this.#notificationVisibility); this.#notificationObserver?.disconnect(); this.removeEventListener("keydown", this.#onKeydown); super.disconnectedCallback(); }
  updated(changed: Map<string, unknown>): void {
    if (changed.has("open") && !this.open && this.#section === "notifications") {
      this.#section = this.#sectionBeforeNotifications; this.requestUpdate();
    }
    this.#observeNotificationRead();
    if (changed.has("open")) this.dispatchEvent(new CustomEvent("dwe-control-center-open-change", { detail: this.open }));
    if (changed.has("hiddenForVideo") && this.hiddenForVideo && this.#showDanmakuObservationHistory) {
      this.#showDanmakuObservationHistory = false;
      this.#confirmRemoveDanmakuObservation = null;
      this.requestUpdate();
    }
    if (changed.has("open") && this.open) {
      this.#returnFocus = this.shadowRoot?.activeElement instanceof HTMLElement
        ? this.shadowRoot.activeElement
        : document.activeElement instanceof HTMLElement ? document.activeElement : null;
      queueMicrotask(() => this.shadowRoot?.querySelector<HTMLElement>(".close")?.focus());
    }
    if (changed.has("open") && !this.open) this.#returnFocus?.focus();
  }
  #onKeydown = (event: KeyboardEvent): void => {
    if (!this.open) return;
    if (this.#showDanmakuObservationHistory) return;
    if (event.key === "Escape") { event.preventDefault(); this.#close(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...(this.shadowRoot?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]):not([type="file"]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])') ?? [])];
    if (!focusable.length) return;
    const first = focusable[0]; const last = focusable.at(-1)!;
    const active = this.shadowRoot?.activeElement;
    if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  };
  #close = (): void => { if (this.#section === "notifications") this.#section = this.#sectionBeforeNotifications; this.open = false; this.#confirmDaily = false; this.#showDanmakuObservationHistory = false; this.#confirmRemoveDanmakuObservation = null; this.dispatchEvent(new CustomEvent("dwe-control-center-close", { bubbles: true, composed: true })); };
  #toggleFeature = async (setting: FeatureSettingKey): Promise<void> => {
    if (setting === "dailyAutomation" && !this.model.settings.features.dailyAutomation) { this.#confirmDaily = true; this.requestUpdate(); return; }
    await this.model.onToggleFeature(setting);
  };
  #run = (operation: () => Promise<void> | void): void => {
    this.#message = "";
    void Promise.resolve(operation()).catch((error: unknown) => {
      this.#message = error instanceof Error ? error.message : String(error);
      this.requestUpdate();
    });
  };
  #observeNotificationRead(): void {
    this.#notificationObserver?.disconnect();
    if (!this.open || this.#section !== "notifications" || !this.ownerDocument.hasFocus() || this.ownerDocument.hidden) { this.#notificationSession = ""; return; }
    const Observer = this.ownerDocument.defaultView?.IntersectionObserver;
    if (!Observer) return;
    const root = this.shadowRoot?.querySelector("main");
    if (!root) return;
    this.#notificationObserver = new Observer(entries => {
      if (!this.open || this.#section !== "notifications" || this.ownerDocument.hidden || !this.ownerDocument.hasFocus()) return;
      const ids = entries.filter(entry => entry.isIntersecting && entry.intersectionRatio >= .5).map(entry => (entry.target as HTMLElement).dataset.noticeId!).filter(Boolean);
      if (!ids.length) return;
      for (const id of ids) this.#notificationSeen.add(id);
      this.model.onReadVisibleNotifications(ids);
    }, {root, threshold:.5});
    for (const item of this.shadowRoot!.querySelectorAll('.notification-item[data-unread="true"] .notification-title')) this.#notificationObserver.observe(item);
  }
  #followUnreadName(uid: string): string {
    return this.model.userFollowHistory.find(entry => entry.uid === uid)?.nickname || this.model.notificationRecords.find(entry => entry.uid === uid && entry.nickname)?.nickname || `UID ${uid}`;
  }
  #noticeModeLabel(mode: FollowNoticeMode): string { return {off:"不提醒",toast:"仅 Toast",pending:"Toast＋待看"}[mode]; }
  #renderNoticeModes(uid?: string) {
    const rules = uid ? this.model.followUnreadOverrides[uid] ?? {} : this.model.followNoticeDefaults;
    return html`<div class="follow-unread-grid">${([["chatmsg","发言"],["uenter","进场"],["dgb","礼物"]] as const).map(([kind,label]) => html`<label><span>${label}</span><select aria-label=${`${uid ? `UID ${uid}` : "默认"} ${label}提醒方式`} @change=${(event: Event) => { const value = (event.target as HTMLSelectElement).value; this.#run(() => uid ? this.model.onSetFollowUnread(uid,kind,value === "default" ? null : value as FollowNoticeMode) : this.model.onSetFollowDefault(kind,value as FollowNoticeMode)); }}>${uid ? html`<option value="default" ?selected=${rules[kind] === undefined}>默认 · ${this.#noticeModeLabel(this.model.followNoticeDefaults[kind])}</option>` : nothing}${(["off","toast","pending"] as const).map(mode=>html`<option value=${mode} ?selected=${rules[kind] === mode}>${this.#noticeModeLabel(mode)}</option>`)}</select></label>`)}</div>`;
  }
  #renderFollowUnreadEditor(uid: string) {
    const rules = this.model.followUnreadOverrides[uid] ?? {};
    return html`<div class="follow-unread-editor">${this.#renderNoticeModes(uid)}${this.model.notificationStatus === "error" ? html`<p class="field-feedback" role="alert">设置暂未保存，仅在本页生效。</p>` : nothing}<div class="follow-unread-footer"><span>正在看时不计待看；设置只影响新消息</span>${Object.keys(rules).length ? html`<button class="notification-read-all" @click=${() => this.#run(() => this.model.onResetFollowUnread(uid))}>恢复默认</button>` : nothing}</div></div>`;
  }
  #renderFollowUnreadSettings(uid: string) {
    const rules = this.model.followUnreadOverrides[uid] ?? {};
    const labels = {chatmsg:"发言",uenter:"进场",dgb:"礼物"};
    const customized = Object.keys(rules) as FollowNoticeKind[];
    return html`<details class="follow-unread-settings"><summary>提醒方式 <span>${customized.length ? customized.map(kind => `${labels[kind]} ${this.#noticeModeLabel(rules[kind]!)}`).join(" · ") : "跟随默认"}</span></summary>${this.#renderFollowUnreadEditor(uid)}</details>`;
  }
  #renderFollowUnreadManager() {
    const query = this.#notificationManageSearch.trim().toLocaleLowerCase();
    const uids = this.model.userFollowing.uids.filter(uid => `${uid} ${this.#followUnreadName(uid)}`.toLocaleLowerCase().includes(query));
    return html`<div class="notification-follow-manager"><input type="search" aria-label="搜索提醒设置用户" placeholder="搜索昵称或 UID" .value=${this.#notificationManageSearch} @input=${(event: Event) => {this.#notificationManageSearch = (event.target as HTMLInputElement).value;this.#notificationManageLimit = 20;this.requestUpdate();}} /><p class="hint">按用户设置发言、进场、礼物的提醒方式。</p>${repeat(uids.slice(0,this.#notificationManageLimit),uid=>uid,uid=>html`<div class="notification-managed-user"><strong>${this.#followUnreadName(uid)}</strong>${this.#renderFollowUnreadSettings(uid)}</div>`)}${uids.length === 0 ? html`<p class="hint">没有匹配的关注用户</p>` : nothing}${uids.length > this.#notificationManageLimit ? html`<button class="action" @click=${() => {this.#notificationManageLimit += 20;this.requestUpdate();}}>再显示 20 人</button>` : nothing}</div>`;
  }
  #renderNotifications() {
    const all = this.model.notificationRecords;
    const labels = { general: "系统", follow: "关注", room: "房间事件" };
    const filter = this.#notificationFilter;
    if (this.#notificationSession !== filter) { this.#notificationSeen.clear(); this.#notificationSession = filter; }
    const unread = all.filter(entry => !entry.read && (filter === "all" || entry.source === filter)).length;
    const records = all.filter(entry => (filter === "all" || entry.source === filter) && (this.#notificationShowRead || !entry.read || this.#notificationSeen.has(entry.id)));
    const readLabel = filter === "all" ? "全部看过" : labels[filter] + "全部看过";
    return html`<section class="notification-page">
      <div class="notification-heading"><div><h2>提醒中心</h2><span class="notification-subtitle">${this.model.notificationUnread ? `${this.model.notificationUnread} 条待看` : "暂无待看提醒"}</span></div>${unread ? html`<button class="notification-read-all" @click=${() => { for (const entry of records.slice(0,this.#notificationLimit)) this.#notificationSeen.add(entry.id); this.model.onReadAllNotifications(filter === "all" ? undefined : filter); }}>${readLabel}</button>` : nothing}</div>
      <div class="notification-tabs" role="group" aria-label="提醒类型">${(["all", "follow", "room", "general"] as const).map(source => html`<button aria-pressed=${String(this.#notificationFilter === source)} @click=${() => {this.#notificationEditingUid = null;this.#notificationFilter = source;this.#notificationLimit = 20;this.requestUpdate();}}>${source === "all" ? "全部" : labels[source]}${all.some(entry => !entry.read && (source === "all" || entry.source === source)) ? html`<span>${all.filter(entry => !entry.read && (source === "all" || entry.source === source)).length}</span>` : nothing}</button>`)}</div>
      <div class="notification-options"><label><input type="checkbox" .checked=${this.#notificationShowRead} @change=${(event: Event) => {this.#notificationShowRead = (event.target as HTMLInputElement).checked;this.requestUpdate();}} /> 显示已读</label>${filter !== "all" && filter !== "follow" ? html`<label title="只影响之后收到的提醒，Toast 不变"><input type="checkbox" .checked=${this.model.notificationPreferences[filter]} @change=${(event: Event) => this.model.onSetNotificationUnread(filter,(event.target as HTMLInputElement).checked)} /> 离开时计入待看</label>` : nothing}</div>
      ${this.model.notificationStatus === "error" ? html`<p class="notice" role="alert">存储失败，当前变更仅保留在本页，刷新后可能丢失。</p>` : nothing}
      ${filter === "follow" ? html`<button class="notification-manage-toggle" aria-expanded=${String(this.#notificationManageUsers)} @click=${() => {this.#notificationManageUsers = !this.#notificationManageUsers;this.requestUpdate();}}>管理关注用户的提醒方式</button>${this.#notificationManageUsers ? this.#renderFollowUnreadManager() : nothing}` : nothing}
      ${this.#notificationEditingUid ? html`<div class="notification-person-editor"><div class="notification-heading"><strong>${this.#followUnreadName(this.#notificationEditingUid)}</strong><button class="notification-read-all" @click=${() => {this.#notificationEditingUid=null;this.requestUpdate();}}>收起设置</button></div>${this.#renderFollowUnreadEditor(this.#notificationEditingUid)}</div>` : nothing}
      <div class="notification-list">${records.slice(0,this.#notificationLimit).map(entry => html`<article class="notification-item" data-notice-id=${entry.id} data-unread=${String(!entry.read)}>
        <div class="notification-item-heading"><span class="notification-type" data-source=${entry.source}>${labels[entry.source]}</span>${entry.source === "follow" && entry.uid && /^[1-9]\d{0,19}$/.test(entry.uid) ? html`<button class="notification-user-settings" aria-label=${`设置 UID ${entry.uid} 的提醒方式`} @click=${() => {this.#editNotificationUser(entry.uid!);}}>提醒方式</button>` : nothing}<time title=${new Date(entry.at).toLocaleString()}>${new Date(entry.at).toLocaleDateString(undefined,{month:"numeric",day:"numeric"})} ${new Date(entry.at).toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit",hour12:false})}</time>${entry.read ? html`<span class="notification-read-state">已看</span>` : nothing}</div>
        <div class="notification-title" data-notice-id=${entry.id}>${entry.title}</div><div class="notification-text">${entry.text}</div>
      </article>`)}</div>
      ${records.length === 0 ? html`<p class="notification-empty">${this.#notificationFilter === "all" ? "暂无提醒" : "暂无此类提醒"}</p>` : nothing}
      ${records.length > this.#notificationLimit ? html`<button class="action" @click=${() => {this.#notificationLimit += 20;this.requestUpdate();}}>再显示 20 条</button>` : nothing}
      <p class="notification-footnote">保留 7 天 · 最多 500 条 · 看到即已看 · 仅离开时计入待看</p>
    </section>`;
  }
  #configuredAutoFansRoom(): string {
    return this.model.settings.automation.autoFansRestRoomId ?? "12306";
  }
  #syncAutoFansRoomDraft(): void {
    const saved = this.#configuredAutoFansRoom();
    if (saved === this.#autoFansRoomSaved) return;
    this.#autoFansRoomSaved = saved;
    this.#autoFansRoomDraft = saved;
    this.#autoFansRoomError = "";
  }
  #setAutoFansRoomDraft = (event: Event): void => {
    this.#autoFansRoomDraft = (event.target as HTMLInputElement).value;
    this.#autoFansRoomError = "";
    this.#autoFansRoomFeedback = "";
    this.requestUpdate();
  };
  #syncTailDraft(): void {
    const saved = JSON.stringify(this.model.danmakuTail);
    if (saved === this.#tailSaved) return;
    this.#tailSaved = saved;
    this.#tailDraft = this.model.danmakuTail.text;
    this.#tailPosition = this.model.danmakuTail.position;
    this.#tailError = "";
  }
  #saveTail = async (enabled = this.model.danmakuTail.enabled): Promise<void> => {
    const next: DanmakuTailConfig = { enabled, text: this.#tailDraft.trim(), position: this.#tailPosition };
    if (enabled && !next.text) { this.#tailError = "请先填写小尾巴内容"; this.requestUpdate(); return; }
    try {
      await this.model.onSaveDanmakuTail(next);
      this.#tailError = "";
      this.#tailFeedback = enabled ? "已保存并启用；下一条弹幕发送前添加。" : "已保存；当前未启用。";
    } catch (error) {
      this.#tailError = error instanceof Error ? error.message : String(error);
    }
    this.requestUpdate();
  };
  #saveAutoFansRoom = async (value = this.#autoFansRoomDraft): Promise<void> => {
    const roomId = value.trim();
    if (!isPositiveRoomId(roomId)) {
      this.#autoFansRoomError = "请输入正整数房间号。";
      this.#autoFansRoomFeedback = "";
      this.requestUpdate();
      return;
    }
    this.#autoFansRoomError = "";
    try {
      await this.model.onSetAutoFansRoomId(roomId);
      this.#autoFansRoomSaved = roomId;
      this.#autoFansRoomDraft = roomId;
      this.#autoFansRoomFeedback = `已保存：下次自动任务会将剩余荧光棒赠送到房间 ${roomId}。`;
    } catch (error) {
      this.#autoFansRoomError = error instanceof Error ? error.message : String(error);
      this.#autoFansRoomFeedback = "";
    }
    this.requestUpdate();
  };
  #chooseSettingsFile = (): void => {
    this.shadowRoot?.querySelector<HTMLInputElement>(".file-picker")?.click();
  };
  #readSettingsFile = async (event: Event): Promise<void> => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    this.#dataMessage = "";
    try {
      const imported = parseSettingsImport(JSON.parse(await file.text()) as unknown);
      const differences = diffSettings(this.model.settings, imported);
      if (!differences.length) {
        this.#dataMessage = "导入文件与当前 Settings v6 完全相同，未写入。";
      } else {
        this.#pendingSettings = imported;
        this.#pendingSettingsKind = "import";
        this.#pendingSettingsDiff = differences;
      }
    } catch (error) {
      this.#dataMessage = `未导入：${error instanceof Error ? error.message : String(error)}`;
    }
    this.requestUpdate();
  };
  #prepareDefaultSettings = (): void => {
    const next = structuredClone(DEFAULT_SETTINGS);
    const differences = diffSettings(this.model.settings, next);
    this.#dataMessage = "";
    if (!differences.length) {
      this.#dataMessage = "当前已是默认 Settings，未写入。";
    } else {
      this.#pendingSettings = next;
      this.#pendingSettingsKind = "reset";
      this.#pendingSettingsDiff = differences;
    }
    this.requestUpdate();
  };
  #cancelSettingsChange = (): void => {
    this.#pendingSettings = null;
    this.#pendingSettingsKind = null;
    this.#pendingSettingsDiff = [];
    this.requestUpdate();
  };
  #confirmSettingsChange = async (): Promise<void> => {
    if (!this.#pendingSettings || !this.#pendingSettingsKind) return;
    const next = this.#pendingSettings;
    const kind = this.#pendingSettingsKind;
    const freshDiff = diffSettings(this.model.settings, next);
    if (!freshDiff.length) {
      this.#cancelSettingsChange();
      this.#dataMessage = "设置已在其他标签页同步为相同内容，未重复写入。";
      this.requestUpdate();
      return;
    }
    try {
      if (kind === "reset") await this.model.onRestoreDefaultSettings();
      else await this.model.onApplySettingsSnapshot(next);
      this.#dataMessage = kind === "reset" ? "已恢复默认 Settings，并同步当前运行态。" : "已导入完整 Settings，并同步当前运行态。";
      this.#pendingSettings = null;
      this.#pendingSettingsKind = null;
      this.#pendingSettingsDiff = [];
    } catch (error) {
      this.#dataMessage = `设置未保存：${error instanceof Error ? error.message : String(error)}`;
    }
    this.requestUpdate();
  };
  #clearAudit = async (): Promise<void> => {
    try {
      await this.model.onClearAutomationAudit();
      this.#confirmClearAudit = false;
      this.#dataMessage = "已清空脱敏自动化审计日志；任务账本、锁和设置未改变。";
    } catch (error) {
      this.#dataMessage = `审计日志未清空：${error instanceof Error ? error.message : String(error)}`;
    }
    this.requestUpdate();
  };
  #chooseDanmakuObservationFile = (): void => {
    this.shadowRoot?.querySelector<HTMLInputElement>(".send-observation-file-picker")?.click();
  };
  #downloadDanmakuObservations = (): void => {
    const blob = new Blob([this.model.onExportDanmakuObservations()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `douyu-web-enhancer-danmaku-send-observations-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    this.#danmakuObservationMessage = "已导出本地检测记录；文件包含发送正文和房间号。";
    this.requestUpdate();
  };
  #readDanmakuObservationFile = async (event: Event): Promise<void> => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    this.#danmakuObservationMessage = "";
    try {
      const result = await this.model.onImportDanmakuObservations(await file.text());
      this.#danmakuObservationMessage = `已导入 ${result.imported} 条有效记录，当前保留 ${result.retained} 条。`;
    } catch (error) {
      this.#danmakuObservationMessage = `未导入：${error instanceof Error ? error.message : String(error)}`;
    }
    this.requestUpdate();
  };
  #setDanmakuObservationSearch = (event: Event): void => {
    this.#danmakuObservationSearch = (event.target as HTMLInputElement).value;
    this.requestUpdate();
  };
  #setDanmakuObservationRoom = (event: Event): void => {
    this.#danmakuObservationRoomId = (event.target as HTMLSelectElement).value;
    this.requestUpdate();
  };
  #setDanmakuObservationEvidence = (event: Event): void => {
    this.#danmakuObservationEvidence = (event.target as HTMLSelectElement).value as "all" | DanmakuSendObservation["evidence"];
    this.requestUpdate();
  };
  #setDanmakuObservationResolution = (event: Event): void => {
    this.#danmakuObservationResolution = (event.target as HTMLSelectElement).value as "all" | DanmakuSendObservation["resolution"];
    this.requestUpdate();
  };
  #setDanmakuObservationTagFilter = (event: Event): void => {
    this.#danmakuObservationTag = (event.target as HTMLSelectElement).value;
    this.requestUpdate();
  };
  #setDanmakuObservationTag = (id: string, event: Event): void => {
    this.#danmakuObservationSelectedTags[id] = (event.target as HTMLSelectElement).value;
    this.requestUpdate();
  };
  #addDanmakuObservationTag = async (id: string): Promise<void> => {
    const tag = this.#danmakuObservationSelectedTags[id];
    if (!tag) return;
    try {
      await this.model.onSetDanmakuObservationTag(id, tag, true);
      this.#danmakuObservationSelectedTags[id] = "";
    } catch (error) {
      this.#danmakuObservationMessage = `标签未保存：${error instanceof Error ? error.message : String(error)}`;
    }
    this.requestUpdate();
  };
  #removeDanmakuObservationTag = async (id: string, tag: string): Promise<void> => {
    try {
      await this.model.onSetDanmakuObservationTag(id, tag, false);
    } catch (error) {
      this.#danmakuObservationMessage = `标签未移除：${error instanceof Error ? error.message : String(error)}`;
      this.requestUpdate();
    }
  };
  #saveDanmakuObservationNote = async (id: string, event: Event): Promise<void> => {
    try {
      await this.model.onSetDanmakuObservationNote(id, (event.target as HTMLTextAreaElement).value);
      this.#danmakuObservationMessage = "备注已保存。";
    } catch (error) {
      this.#danmakuObservationMessage = `备注未保存：${error instanceof Error ? error.message : String(error)}`;
    }
    this.requestUpdate();
  };
  #askRemoveDanmakuObservation = (id: string): void => {
    this.#confirmRemoveDanmakuObservation = id;
    this.#danmakuObservationMessage = "";
    this.requestUpdate();
  };
  #cancelRemoveDanmakuObservation = (): void => {
    this.#confirmRemoveDanmakuObservation = null;
    this.requestUpdate();
  };
  #removeDanmakuObservation = async (id: string): Promise<void> => {
    try {
      const removed = await this.model.onRemoveDanmakuObservation(id);
      this.#confirmRemoveDanmakuObservation = null;
      this.#danmakuObservationMessage = removed ? "已按误判记录删除该条记录。" : "记录不存在，未删除。";
    } catch (error) {
      this.#danmakuObservationMessage = `记录未删除：${error instanceof Error ? error.message : String(error)}`;
    }
    this.requestUpdate();
  };
  #renderFeature(definition: (typeof featureDefinitions)[number]) {
    if (definition.setting === "activityLinkCleanup") return this.#renderActivityCleanup();
    const enabled = this.model.settings.features[definition.setting];
    const diagnostic = diagnosticFor(this.model, definition.id);
    return html`<div class="row"><div><div class="name">${definition.name}</div><div class="desc">${definition.description}</div>${definition.nearField ? html`<div class="runtime">近场：${definition.nearField}</div>` : nothing}<div class="runtime" data-status=${diagnostic?.status ?? "disabled"}>${statusText(diagnostic?.status)}${diagnostic?.detail ? ` · ${diagnostic.detail}` : ""}</div></div><button class="switch" role="switch" aria-label=${definition.name} aria-checked=${String(enabled)} @click=${() => this.#run(() => this.#toggleFeature(definition.setting))}></button></div>`;
  }
  #renderActivityCleanup() {
    const stats = this.model.activityCleanupStats;
    const roomId = this.model.currentRoomId;
    const current = stats.rooms.find(room => room.roomId === roomId);
    return html`<section class="activity-stats"><div class="row"><div><div class="name">屏蔽活动弹幕</div><div class="desc">过滤新到达的合成大西瓜、保卫鱼娘消息；影响聊天栏和飘屏。</div></div><button class="switch" role="switch" aria-label="屏蔽活动弹幕" aria-checked=${String(this.model.settings.features.activityLinkCleanup)} @click=${() => this.#run(() => this.#toggleFeature("activityLinkCleanup"))}></button></div>
      <p class="stats-total">${roomId ? `本房间 ${current?.count ?? 0} 条 · ` : ""}累计 ${stats.count} 条</p>
      <details class="quiet-details"><summary>房间统计与说明${stats.lastAt ? ` · 最近 ${this.#formatBlockedTime(stats.lastAt)}` : ""}</summary>
        ${stats.rooms.length ? html`<table aria-label="活动弹幕屏蔽统计"><thead><tr><th>房间</th><th>已屏蔽</th><th>最近屏蔽</th></tr></thead><tbody>${stats.rooms.slice(0, this.#activityRoomLimit).map(room => html`<tr><td>${room.roomId === roomId ? "本房间" : "房间"} ${room.roomId}</td><td>${room.count} 条</td><td><time title=${new Date(room.lastAt).toLocaleString("zh-CN", { hour12:false })}>${this.#formatBlockedTime(room.lastAt)}</time></td></tr>`)}</tbody></table>${stats.rooms.length > this.#activityRoomLimit ? html`<button class="action" @click=${() => { this.#activityRoomLimit += 20; this.requestUpdate(); }}>更多房间</button>` : nothing}` : html`<p>尚未屏蔽活动消息。</p>`}
        <p>新计数仅在 Socket 成功拦截消息后增加；旧统计保留，曾按隐藏的聊天行计数，两个阶段的历史总数无法拆分。关闭后新活动消息恢复投递，先前过滤的消息不会重放。</p><p>统计保存在本机；这里按最近屏蔽时间展示最近 100 个房间及本房间。</p>
        <details class="quiet-details"><summary>最近过滤记录 · ${this.model.activityFilterRecords.length} 条</summary>
          <p>只记录实际拦截的活动消息，最多保留最近 50 条。遇到误判可核对房间、活动类型和原文。</p>
          ${this.model.activityFilterRecords.length ? html`<ul class="activity-review-list" aria-label="活动弹幕过滤记录">${this.model.activityFilterRecords.map(record => html`<li><div class="activity-review-heading"><strong>${record.nickname || (record.nickname !== undefined || record.uid ? "昵称未提供" : "旧记录未保存昵称")}</strong>${record.uid ? html`<small>UID ${record.uid}</small>` : nothing}</div><div class="activity-review-meta"><time>${this.#formatBlockedTime(record.at)}</time> · ${record.roomId === roomId ? "本房间" : "房间"} ${record.roomId}</div><p class="activity-review-text">${record.text || record.activity}</p>${record.text && record.text !== record.activity ? html`<div class="activity-review-meta">活动类型：${record.activity}</div>` : nothing}</li>`)}</ul>` : html`<p>暂无过滤记录。</p>`}
          ${this.model.activityFilterReviewStatus === "error" ? html`<p role="status">最近记录未能保存；过滤计数仍独立保存。</p>` : nothing}
        </details>
      </details>${this.model.activityCleanupStatsStatus === "error" ? html`<p role="status">统计暂未保存，活动屏蔽仍生效。</p>` : nothing}
    </section>`;
  }
  #renderDanmakuAvailability() {
    const diagnostic = diagnosticFor(this.model, "danmaku-availability");
    const data = diagnostic?.data && typeof diagnostic.data === "object"
      ? diagnostic.data as Partial<DanmakuAvailabilitySnapshot>
      : {};
    const installed = data.installed === true;
    const recovering = typeof data.rewrites === "number" && data.rewrites > 0;
    const officiallyAllowed = typeof data.observedEnabled === "number" && data.observedEnabled > 0;
    const runtime = diagnostic?.status === "degraded" || diagnostic?.status === "error"
      ? "运行异常，可能无法恢复飘屏"
      : recovering
        ? "已生效，正在恢复飘屏"
        : officiallyAllowed
          ? "未生效，当前无需恢复"
          : installed
            ? "等待识别弹幕状态"
            : "未运行，刷新页面后重试";
    const status = diagnostic?.status === "error" ? "error" : diagnostic?.status === "degraded" ? "degraded" : recovering ? "active" : officiallyAllowed ? "disabled" : installed ? "waiting" : "error";
    return html`<div class="row"><div><div class="name">特殊时期弹幕恢复</div><div class="desc">特殊日期遇到飘屏限制时自动恢复。</div><div class="runtime" data-status=${status}>${runtime}</div></div></div>`;
  }
  #renderDanmakuTail() {
    this.#syncTailDraft();
    const config = this.model.danmakuTail;
    const dirty = this.#tailDraft !== config.text || this.#tailPosition !== config.position;
    return html`<details class="tail-settings" .open=${this.#tailOpen} @toggle=${(event: Event) => { this.#tailOpen = (event.currentTarget as HTMLDetailsElement).open; }}><summary>弹幕小尾巴<span class="runtime" data-status=${config.enabled ? "active" : "disabled"}>${config.enabled ? "已启用" : "已关闭"}${dirty ? " · 修改未保存" : ""}</span></summary><div class="row"><div><div class="name">发送时添加尾巴</div><div class="desc">只在你通过网页发送普通弹幕时添加；所有直播间生效。</div></div><button class="switch" role="switch" aria-label="弹幕小尾巴" aria-checked=${String(config.enabled)} @click=${() => void this.#saveTail(!config.enabled)}></button></div>
      <div class="tail-editor"><label for="dwe-tail-text">小尾巴内容</label><input id="dwe-tail-text" aria-label="小尾巴内容" maxlength="100" placeholder="输入发送时追加的文字" .value=${this.#tailDraft} @input=${(event: Event) => { this.#tailDraft = (event.target as HTMLInputElement).value; this.#tailError = ""; this.#tailFeedback = ""; this.requestUpdate(); }} />
      <div class="tail-position" role="group" aria-label="小尾巴位置"><button class="action" aria-pressed=${String(this.#tailPosition === "prefix")} @click=${() => { this.#tailPosition = "prefix"; this.requestUpdate(); }}>前缀</button><button class="action" aria-pressed=${String(this.#tailPosition === "suffix")} @click=${() => { this.#tailPosition = "suffix"; this.requestUpdate(); }}>后缀</button></div>
      <div class="tail-actions"><button class="action" @click=${() => void this.#saveTail()}>保存设置</button><span>${dirty ? "修改未保存" : this.#tailFeedback}</span></div>${this.#tailError ? html`<p class="field-feedback" data-state="error" role="alert">${this.#tailError}</p>` : nothing}<p class="hint">已验证总长 64 字的小尾巴弹幕成功显示；更长内容仍以斗鱼实际接收结果为准。</p></div></details>`;
  }
  #formatBlockedTime(at: number): string {
    const date = new Date(at);
    if (!Number.isFinite(date.getTime())) return "时间未知";
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  #renderBlockedUser(uid: string) {
    const entry = this.model.userBlockHistory.find((item) => item.uid === uid);
    const rules = this.model.userBlocking.rules.filter((rule) => rule.uid === uid);
    return html`<li class="blocked-user">
      <div class="blocked-user-heading"><div class="blocked-user-identity"><div class="name">${entry?.nickname || "昵称待更新"}</div><div class="blocked-user-id">UID ${uid}</div></div><div class="user-stat">${entry?.count ?? 0} 条拦截</div></div>
      <div class="blocked-user-scopes">${rules.map((rule) => html`<div class="blocked-user-scope"><div><span class="scope-badge" data-scope=${rule.roomId === null ? "all" : rule.roomId === this.model.currentRoomId ? "current" : "room"}>${rule.roomId ? `${rule.roomId === this.model.currentRoomId ? "本房间" : "房间"} · ${this.model.userBlockRoomName(rule.roomId) || rule.roomId}` : "所有房间"}</span>${rule.roomId && this.model.userBlockRoomName(rule.roomId) ? html`<small class="blocked-room-id">${rule.roomId}</small>` : nothing}</div><button class="action subtle-action" type="button" aria-label=${`取消 UID ${rule.uid} 的${rule.roomId ? `房间 ${rule.roomId}` : "所有房间"}屏蔽`} @click=${() => this.#run(() => this.model.onRemoveUserBlockRule(rule.uid, rule.roomId))}>取消屏蔽</button></div>`)}</div>
      <details class="blocked-user-history"><summary>最近 ${entry?.recent.length ?? 0} 条弹幕</summary>
        ${entry?.recent.length ? html`<ol>${entry.recent.map((sample) => html`<li><div class="blocked-sample-meta"><time title=${new Date(sample.at).toLocaleString("zh-CN", { hour12: false })}>${this.#formatBlockedTime(sample.at)}</time><span>${this.model.userBlockRoomName(sample.roomId) || sample.roomName || `房间 ${sample.roomId}`}</span></div><div class="blocked-sample-text">${sample.text || "（空正文）"}${sample.text.length >= 2048 ? "（最多显示 2048 字）" : nothing}</div></li>`)}</ol>` : html`<p class="hint">尚未记录到该用户的新弹幕。</p>`}
        ${this.#clearBlockHistoryUid === uid ? html`<div class="blocked-history-confirm"><p>清除该用户的累计次数和最近记录？屏蔽规则与名称会保留。</p><button class="action" type="button" @click=${() => this.#run(async () => { await this.model.onClearUserBlockHistory(uid); this.#clearBlockHistoryUid = null; this.requestUpdate(); })}>确认清除</button><button class="action subtle-action" type="button" @click=${() => { this.#clearBlockHistoryUid = null; this.requestUpdate(); }}>取消</button></div>` : html`<button class="history-clear" type="button" @click=${() => { this.#clearBlockHistoryUid = uid; this.requestUpdate(); }}>清除该用户记录</button>`}
      </details></li>`;
  }
  #renderMessageProcessing() {
    const state = this.model.userBlocking;
    const diagnostic = diagnosticFor(this.model, "user-blocking");
    const hook = diagnosticFor(this.model, "page-socket-hook");
    const hookData = hook?.data && typeof hook.data === "object"
      ? hook.data as Record<string, unknown> : {};
    const blockUids = [...new Set(state.rules.map(rule => rule.uid))].filter(uid => {
      const name = this.model.userBlockHistory.find(item => item.uid === uid)?.nickname ?? "";
      return `${uid} ${name}`.toLocaleLowerCase().includes(this.#blockSearch.trim().toLocaleLowerCase());
    });
    return html`<section class="users-page"><div class="page-intro"><h2>关注与屏蔽</h2><p>留意关注的人，隐藏不想看的消息。</p></div>
      ${this.#renderUserFollowing()}
      <section class="user-section"><div class="section-heading"><h3>用户屏蔽</h3><span class="quantity">${new Set(state.rules.map(rule => rule.uid)).size} 人</span></div><p class="section-description">隐藏名单中用户的新消息。</p>
        <div class="setting-line"><span>屏蔽弹幕</span><button class="switch" role="switch" aria-label="指定用户屏蔽" aria-checked=${String(state.enabled)} @click=${() => this.#run(() => this.model.onSetUserBlockingEnabled(!state.enabled))}></button></div>
        <div class="setting-line"><span>屏蔽进场提示</span><button class="switch" role="switch" aria-label="屏蔽进场提示" aria-checked=${String(state.entriesEnabled)} @click=${() => this.#run(() => this.model.onSetUserEntryBlockingEnabled(!state.entriesEnabled))}></button></div>
        ${diagnostic?.status === "degraded" ? html`<p class="field-feedback" role="status">连接暂不可用，消息照常显示。</p>` : nothing}
        <details class="quiet-details"><summary>手动添加屏蔽用户</summary>${this.#renderUserLookup("block")}</details>
        <div class="list-toolbar"><input type="search" aria-label="搜索屏蔽用户" placeholder="搜索昵称或 UID" .value=${this.#blockSearch} @input=${(event: Event) => { this.#blockSearch = (event.target as HTMLInputElement).value; this.#blockVisibleLimit = 20; this.requestUpdate(); }} /></div>
        <ul class="message-rule-list compact-list">${blockUids.length ? repeat(blockUids.slice(0, this.#blockVisibleLimit), uid => uid, uid => this.#renderBlockedUser(uid)) : html`<li class="message-empty">${state.rules.length ? "没有匹配的用户" : "暂无屏蔽用户。也可从用户名卡片添加。"}</li>`}</ul>
        ${blockUids.length > this.#blockVisibleLimit ? html`<button class="action load-more" @click=${() => { this.#blockVisibleLimit += 20; this.requestUpdate(); }}>再显示 20 人 · 共 ${blockUids.length} 人</button>` : nothing}
        ${this.model.userBlockHistoryStatus !== "saved" ? html`<p class="history-save-status" data-state=${this.model.userBlockHistoryStatus}>${this.model.userBlockHistoryStatus === "error" ? "记录暂未保存，屏蔽继续生效。" : "正在保存…"}</p>` : nothing}
        <details class="quiet-details"><summary>屏蔽说明</summary><p>聊天栏用户名卡片中也可添加“增强屏蔽”。规则、累计次数和最近 10 条记录保存在本机；刷新后保留。</p></details>
      </section>
      ${this.#renderRoomEvents()}
      ${this.#renderChatSpeed()}
      <details class="quiet-details"><summary>连接与诊断 · ${hook?.status === "active" ? "已连接" : statusText(hook?.status)}</summary><p>${hook?.detail ?? "等待页面连接"}</p><p>本页已过滤 ${Number(hookData.filteredMessages ?? 0) - Number(hookData.filteredEntryMessages ?? 0)} 条弹幕、${Number(hookData.filteredEntryMessages ?? 0)} 条进场消息；原样放行 ${Number(hookData.filterSkippedFrames ?? 0)} 个无法处理的帧。</p></details>
    </section>`;
  }
  #roomEventsAll = false;
  #roomEventsLimit = 20;
  #renderRoomEvents() {
    const options=this.model.roomEventOptions;
    const entries=this.model.roomEventEntries.filter(e=>this.#roomEventsAll || e.roomId===this.model.currentRoomId);
    return html`<section class="user-section"><div class="setting-line"><h3>房间管理事件</h3><span class="subtle">${options.remind ? "提醒已开启" : options.record ? "仅记录" : "未开启"}</span></div>
      <p class="hint">留意禁言、房管变更和超管消息。</p>
      ${([ ["record","保存事件记录"], ["remind","弹出事件提醒"] ] as const).map(([key,label])=>html`<div class="setting-line"><span>${label}</span><button class="switch" role="switch" aria-label=${label} aria-checked=${String(options[key])} @click=${()=>this.#run(()=>this.model.onSetRoomEventOption(key,!options[key]))}></button></div>`)}
      <button class="action subtle-action" @click=${()=>this.model.onPreviewRoomEvent()}>预览提醒</button>
      <details class="quiet-details"><summary>事件记录 · ${entries.length} 条</summary>
        <label><input type="checkbox" .checked=${this.#roomEventsAll} @change=${(e: Event)=>{this.#roomEventsAll=(e.target as HTMLInputElement).checked;this.#roomEventsLimit=20;this.requestUpdate();}}/>显示其他房间</label>
        ${this.model.roomEventStatus!=="saved" ? html`<p role="status">${this.model.roomEventStatus==="error" ? "暂未保存，记录仍在本页；重新打开面板可重试。" : "正在保存…"}</p>` : nothing}
        <ul class="observation-list">${entries.slice(0,this.#roomEventsLimit).map(e=>html`<li><strong>${e.title}</strong><div class="blocked-sample-meta">${this.#formatBlockedTime(e.at)} · 房间 ${e.roomId}${!e.verified ? " · 语义待核实" : ""}</div><p>${e.text}</p></li>`)}</ul>
        ${entries.length===0 ? html`<p class="hint">还没有记录。开启后保存你访问房间中新收到的事件。</p>` : nothing}
        ${entries.length>this.#roomEventsLimit ? html`<button class="action" @click=${()=>{this.#roomEventsLimit+=20;this.requestUpdate();}}>再显示 20 条</button>` : nothing}
      </details><details class="quiet-details"><summary>记录与提醒说明</summary><p>本机保留最近 200 条事件；提醒停留 15 秒，悬停暂停。关闭开关保留历史。超管与违规消息中尚未核实的处置会明确标注。</p></details>
    </section>`;
  }
  #renderChatSpeed() {
    const speed = this.model.chatSpeed;
    return html`<section class="user-section"><div class="setting-line"><h3>显示弹幕速度</h3><button class="switch" role="switch" aria-label="弹幕速度" aria-checked=${String(this.model.userFollowing.speedEnabled)} @click=${() => this.#run(() => this.model.onSetFollowingOption("speedEnabled", !this.model.userFollowing.speedEnabled))}></button></div>
      <details class="quiet-details"><summary>统计与说明</summary><p>聊天输入框显示最近 5 秒折算的条数／分钟。</p><p>${speed.enabled ? speed.roomId ? speed.observedSeconds < 60 ? `已观察 ${speed.observedSeconds} 秒，收到 ${speed.count} 条` : `最近 60 秒收到 ${speed.count} 条` : "等待进入直播间" : "速度统计已关闭"}</p><p>包含已屏蔽的普通弹幕，不计进场、礼物与特殊弹幕；刷新或换房重新统计。</p></details></section>`;
  }
  #renderUserFollowing() {
    const state = this.model.userFollowing;
    const reminders = Object.values(this.model.followNoticeDefaults).some(mode => mode !== "off") || Object.values(this.model.followUnreadOverrides).some(rules => Object.values(rules).some(mode => mode !== "off"));
    const query = this.#followSearch.trim().toLocaleLowerCase();
    const history = new Map(this.model.userFollowHistory.map(item => [item.uid, item]));
    const uids = sortFollowingByRecentActivity(state.uids, this.model.userFollowHistory).filter(uid => (!this.#followUnreadOnly || this.model.userFollowUnread(uid) > 0) && `${uid} ${history.get(uid)?.nickname ?? ""}`.toLocaleLowerCase().includes(query));
    const recording = state.chatsEnabled || state.entriesEnabled || state.giftsEnabled;
    return html`<details class="user-section following-section" .open=${this.#followingExpanded} @toggle=${(event: Event) => { const open = (event.target as HTMLDetailsElement).open; if (open !== this.#followingExpanded) { this.#followingExpanded = open; this.requestUpdate(); } }}><summary><h3>关注提醒</h3><span class="quantity">${state.uids.length} 人</span><span class="state-tag" data-on=${String(reminders)}>${reminders ? "提醒已开启" : recording ? "仅保存记录" : "提醒未开启"}</span></summary><p class="section-description">关注的人发言、进场或送礼时，弹出提醒卡片。收起不影响提醒和记录。</p>
      <div class="toggle-group"><div class="group-label">默认提醒方式</div>${this.#renderNoticeModes()}<p class="hint">每位用户可单独覆盖。页面可见且窗口有焦点时，新消息不计入待看。</p></div>
      <div class="toggle-group"><div class="group-label">保存记录 <span class="group-note">每人最近 50 条</span></div><div class="toggle-grid">${([["chatsEnabled", "发言"], ["entriesEnabled", "进场"], ["giftsEnabled", "礼物"]] as const).map(([key,label]) => html`<label><span>${label}</span><button class="switch" role="switch" aria-label=${`记录关注用户${label}`} aria-checked=${String(state[key])} @click=${() => this.#run(() => this.model.onSetFollowingOption(key, !state[key]))}></button></label>`)}</div></div>
      <details class="quiet-details"><summary>提醒与记录说明</summary><p>提醒停留 15 秒，悬停暂停，最多同时显示 3 张。开启提醒会同时保存对应消息，原生消息被屏蔽也可提醒。</p><p>仅处理你打开的直播间。待看与历史记录刷新后保留；取消关注保留历史。</p></details>
      <div class="list-heading"><h4>添加关注</h4></div>${this.#renderUserLookup("follow")}
      ${this.#renderOfficialFollowSync()}
      <details class="following-list" .open=${this.#followingListExpanded} @toggle=${(event: Event) => { const open = (event.target as HTMLDetailsElement).open; if (open !== this.#followingListExpanded) { this.#followingListExpanded = open; this.requestUpdate(); } }}><summary>关注名单 · ${state.uids.length} 人<span class="group-note">最近记录优先</span></summary>
      <div class="list-toolbar"><input type="search" aria-label="搜索关注用户" placeholder="搜索昵称或 UID" .value=${this.#followSearch} @input=${(event: Event) => { this.#followSearch = (event.target as HTMLInputElement).value; this.#followVisibleLimit = 20; this.requestUpdate(); }} /><button class="filter-chip" aria-pressed=${String(this.#followUnreadOnly)} @click=${() => { this.#followUnreadOnly = !this.#followUnreadOnly; this.#followVisibleLimit = 20; this.requestUpdate(); }}>待看</button></div>
      <ul class="message-rule-list compact-list">${uids.length ? repeat(uids.slice(0, this.#followVisibleLimit), uid => uid, uid => this.#renderFollowedUser(uid)) : html`<li class="message-empty">${state.uids.length ? "没有匹配的用户" : "暂无关注用户。也可在用户名卡片中点“增强关注”。"}</li>`}</ul>
      ${uids.length > this.#followVisibleLimit ? html`<button class="action load-more" @click=${() => { this.#followVisibleLimit += 20; this.requestUpdate(); }}>再显示 20 人 · 共 ${uids.length} 人</button>` : nothing}
      </details>
      ${this.model.userFollowHistoryStatus !== "saved" ? html`<p class="history-save-status" data-state=${this.model.userFollowHistoryStatus}>${this.model.userFollowHistoryStatus === "error" ? "记录暂未保存，稍后重新打开面板重试。" : "正在保存…"}</p>` : nothing}
    </details>`;
  }
  #renderUserLookup(kind: "follow" | "block") {
    const block = kind === "block";
    const user = block ? this.#blockLookupResult : this.#userLookupResult;
    const busy = block ? this.#blockLookupBusy : this.#userLookupBusy;
    const error = block ? this.#blockLookupError : this.#userLookupError;
    const present = user && (block ? this.model.userBlocking.rules.some(rule => rule.uid === user.uid && rule.roomId === (this.#blockScope === "current" ? this.model.currentRoomId : null)) : this.model.userFollowing.uids.includes(user.uid));
    return html`<div class="lookup-box"><div class="lookup-input"><input aria-label=${block ? "查找屏蔽用户" : "添加关注用户"} placeholder="昵称、UID 或主页链接" .value=${block ? this.#blockLookupDraft : this.#userLookupDraft} @input=${(event: Event) => {
      const value = (event.target as HTMLInputElement).value;
      if (block) { this.#blockLookupDraft = value; this.#blockLookupResult = null; this.#blockLookupError = ""; this.#blockLookupSequence++; this.#blockLookupBusy = false; }
      else { this.#userLookupDraft = value; this.#userLookupResult = null; this.#userLookupError = ""; this.#userLookupSequence++; this.#userLookupBusy = false; }
      this.requestUpdate();
    }} @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter") { event.preventDefault(); void (block ? this.#lookupBlockUser() : this.#lookupFollowUser()); } }} /><button class="action primary-action" ?disabled=${busy} @click=${() => void (block ? this.#lookupBlockUser() : this.#lookupFollowUser())}>${busy ? "查询中…" : "查找"}</button></div>
    ${error ? html`<p class="field-feedback" role="alert">${error}</p>` : nothing}
    ${user ? html`<div class="lookup-result"><div><a class="name" href=${user.profileUrl} target="_blank" rel="noopener noreferrer">${user.nickname}</a><div class="group-note">UID ${user.uid} · 已核对</div></div><div class="inline-actions">${block ? html`<select aria-label="屏蔽作用范围" .value=${this.#blockScope} @change=${(event: Event) => { this.#blockScope = (event.target as HTMLSelectElement).value; this.requestUpdate(); }}>${this.model.currentRoomId ? html`<option value="current">本房间</option>` : nothing}<option value="all">所有房间</option></select>` : nothing}<button class="action" ?disabled=${Boolean(present)} @click=${() => this.#run(async () => { if (block) await this.model.onAddVerifiedUserBlock(user, this.#blockScope === "current" ? this.model.currentRoomId : null); else await this.model.onAddVerifiedUserFollow(user); })}>${present ? "已添加" : block ? "屏蔽" : "增强关注"}</button></div></div>` : nothing}</div>`;
  }
  async #lookupBlockUser(): Promise<void> {
    if (this.#blockLookupBusy) return;
    const sequence = ++this.#blockLookupSequence;
    this.#blockLookupBusy = true; this.#blockLookupResult = null; this.#blockLookupError = ""; this.requestUpdate();
    try { const user = await this.model.onLookupUser(this.#blockLookupDraft); if (sequence === this.#blockLookupSequence) this.#blockLookupResult = user; }
    catch (error) { if (sequence === this.#blockLookupSequence) this.#blockLookupError = error instanceof Error ? error.message : "用户查询失败"; }
    finally { if (sequence === this.#blockLookupSequence) { this.#blockLookupBusy = false; this.requestUpdate(); } }
  }
  #renderOfficialFollowSync() {
    const sync = this.model.officialFollowSync;
    return html`<details class="quiet-details sync-details"><summary>从斗鱼关注列表批量添加 <span class="group-note">${sync.enabled ? "已开启" : "未开启"} · ${sync.count} 人</span></summary>
      <div class="row"><div><div class="name">同步斗鱼关注</div><div class="desc">把你在斗鱼关注的人加入此名单。开启后每天最多检查一次变化。</div></div><button class="switch" role="switch" aria-label="同步斗鱼关注" aria-checked=${String(sync.enabled)} ?disabled=${sync.busy} @click=${() => this.#run(() => this.model.onSetOfficialFollowSync(!sync.enabled))}></button></div>
      <p class="hint">${sync.nickname ? `当前账号：${sync.nickname}` : '尚未确认当前账号名单'} · ${sync.updatedAt ? `上次成功 ${this.#formatBlockedTime(sync.updatedAt)}` : '尚未同步'}。关闭后只保留手动添加的用户；读取失败不会清空名单。</p>
      <button class="action" ?disabled=${sync.busy} @click=${() => this.#run(() => this.model.onCheckOfficialFollows())}>${sync.busy ? '正在读取关注列表…' : '检查关注列表'}</button>
      ${sync.error ? html`<p class="hint" role="alert">${sync.error}</p>` : nothing}
      ${sync.preview ? html`<div class="row"><div><div class="name">${sync.preview.nickname} · ${sync.preview.count} 位</div><div class="desc">新增 ${sync.preview.added} · 移除 ${sync.preview.removed} · 已手动添加 ${sync.preview.overlap} · 已排除 ${sync.preview.excluded}</div><p class="hint">只更新本机名单。确认会开启发言记录；进场、礼物与提醒开关保持当前设置。${sync.enabled ? '确认后名单立即生效。' : '确认后开启上方开关即可使用。'}</p></div></div><button class="action" ?disabled=${sync.busy} @click=${() => this.#run(() => this.model.onApplyOfficialFollows())}>确认同步名单</button><button class="action subtle-action" @click=${() => this.model.onCancelOfficialPreview()}>取消预览</button>` : nothing}
      ${sync.excluded ? html`<p class="hint">已排除 ${sync.excluded} 位，后续同步不会重新关注。</p><button class="action subtle-action" @click=${() => this.#run(() => this.model.onRestoreOfficialExclusions())}>恢复全部排除用户</button>` : nothing}
    </details>`;
  }
  async #lookupFollowUser(): Promise<void> {
    if (this.#userLookupBusy) return;
    const sequence = ++this.#userLookupSequence;
    this.#userLookupBusy = true; this.#userLookupResult = null; this.#userLookupError = ""; this.requestUpdate();
    try { const user = await this.model.onLookupUser(this.#userLookupDraft); if (sequence === this.#userLookupSequence) this.#userLookupResult = user; }
    catch (error) { if (sequence === this.#userLookupSequence) this.#userLookupError = error instanceof Error ? error.message : "用户查询失败"; }
    finally { if (sequence === this.#userLookupSequence) { this.#userLookupBusy = false; this.requestUpdate(); } }
  }
  #renderFollowedUser(uid: string) {
    const entry = this.model.userFollowHistory.find(item => item.uid === uid);
    return html`<li class="blocked-user"><div class="blocked-user-heading"><div class="blocked-user-identity"><div class="name">${entry?.nickname || "昵称待更新"}</div><div class="blocked-user-id">UID ${uid}</div></div><div class="inline-actions"><span class="user-stat">${entry?.count ?? 0} 条记录</span><button class="action subtle-action" type="button" aria-label=${`取消关注 UID ${uid}`} @click=${() => this.#run(() => this.model.onRemoveUserFollow(uid))}>取消</button></div></div>
      <div class="user-source">${this.model.userFollowSource(uid)}</div>${this.#renderFollowUnreadSettings(uid)}
      ${this.model.userFollowUnread(uid) ? html`<button class="action subtle-action" @click=${() => this.model.onReadUserFollow(uid)}>待看 ${this.model.userFollowUnread(uid)} · 标为已读</button>` : nothing}<details class="blocked-user-history"><summary>查看记录 · ${entry?.recent.length ?? 0} 条</summary>${entry?.recent.length ? html`<ol>${entry.recent.map(sample => html`<li><div class="blocked-sample-meta"><time title=${new Date(sample.at).toLocaleString("zh-CN", { hour12: false })}>${this.#formatBlockedTime(sample.at)}</time><span>${sample.kind === "uenter" ? "进场" : sample.kind === "dgb" ? "礼物" : "发言"} · ${this.model.userFollowRoomName(sample.roomId) || sample.roomName || "直播间"} · ${sample.roomId}</span></div><div class="blocked-sample-text">${sample.kind === "uenter" ? "进入直播间" : sample.text || "（空正文）"}</div></li>`)}</ol>` : html`<p class="hint">尚未收到该用户的新消息；记录不代表完整在线状态。</p>`}</details></li>`;
  }
  #renderOverview() { return html`<section><h2>功能概览</h2><p class="hint">开关显示配置状态；状态行显示实际运行状态。页面工具栏中的高频入口仍可直接使用。</p><div class="row"><div><div class="name">关注与屏蔽</div><div class="desc">关注用户的动态提醒、消息记录与屏蔽名单。</div><div class="runtime">${(this.model.userBlocking.enabled || this.model.userBlocking.entriesEnabled) ? "用户屏蔽已开启" : "用户屏蔽已关闭"} · ${this.model.userBlocking.rules.length} 条规则</div></div><button class="action" type="button" @click=${() => { this.#section = "messages"; this.requestUpdate(); }}>打开</button></div>${featureDefinitions.map((item) => this.#renderFeature(item))}</section>`; }
  #renderPlayback() { const diagnostic = diagnosticFor(this.model, "auto-web-fullscreen"); const volumeWheel = featureDefinitions.find((item) => item.setting === "volumeWheel"); const liveTimeshift = featureDefinitions.find((item) => item.setting === "liveTimeshiftControls"); const highestQuality = featureDefinitions.find((item) => item.setting === "highestVideoQuality"); const disableOfflineJump = featureDefinitions.find((item) => item.setting === "disableOfflineJump"); return html`<section><h2>播放与页面</h2><div class="row"><div><div class="name">记住网页全屏</div><div class="desc">打开直播间后定位播放器，并恢复你上次选择的斗鱼网页全屏状态。</div><div class="runtime" data-status=${diagnostic?.status ?? "disabled"}>${statusText(diagnostic?.status)}${diagnostic?.detail ? ` · ${diagnostic.detail}` : ""}</div></div><button class="switch" role="switch" aria-label="记住网页全屏" aria-checked=${String(this.model.settings.preferences.autoWebFullscreen)} @click=${() => this.#run(() => this.model.onSetAutoWebFullscreen(!this.model.settings.preferences.autoWebFullscreen))}></button></div>${volumeWheel ? this.#renderFeature(volumeWheel) : nothing}${liveTimeshift ? this.#renderFeature(liveTimeshift) : nothing}${highestQuality ? this.#renderFeature(highestQuality) : nothing}${disableOfflineJump ? this.#renderFeature(disableOfflineJump) : nothing}</section>`; }
  #renderDanmakuObservationHistory() {
    const count = this.model.danmakuObservations.length;
    return html`<div class="observation-history"><div class="observation-heading"><div><div class="name">弹幕可见性记录（${count}）</div><p class="hint">本地保存未确认、疑似未公开及迟到更正；不会自动断言为确定屏蔽。</p></div><button class="action" @click=${() => { this.#showDanmakuObservationHistory = true; this.#danmakuObservationMessage = ""; this.requestUpdate(); }}>管理记录</button></div></div>`;
  }
  #renderDanmakuObservationDrawer() {
    const allRecords = this.model.danmakuObservations;
    const rooms = [...new Set(allRecords.map((record) => record.roomId))]
      .sort((left, right) => Number(left) - Number(right));
    const records = filterDanmakuObservations(
      allRecords,
      this.#danmakuObservationRoomId,
      this.#danmakuObservationEvidence,
      this.#danmakuObservationResolution,
      this.#danmakuObservationTag,
      this.#danmakuObservationSearch,
    );
    return html`<aside class="observation-drawer" aria-label="弹幕可见性记录">
      <header class="observation-drawer-header">
        <div>
          <h2>弹幕可见性记录</h2>
          <p class="hint">本地 IndexedDB · ${allRecords.length} 条记录；删除仅表示你已确认该条其实收到了。</p>
        </div>
        <button class="close" type="button" aria-label="关闭弹幕可见性记录" @click=${() => {
          this.#showDanmakuObservationHistory = false;
          this.#confirmRemoveDanmakuObservation = null;
          this.requestUpdate();
        }}>×</button>
      </header>
      <div class="observation-drawer-content">
        <input class="observation-search" type="search" placeholder="搜索正文、房间号、备注" .value=${this.#danmakuObservationSearch} @input=${this.#setDanmakuObservationSearch} />
        <div class="observation-filters">
          <label>房间<select .value=${this.#danmakuObservationRoomId} @change=${this.#setDanmakuObservationRoom}><option value="">全部房间</option>${rooms.map((roomId) => html`<option value=${roomId}>${roomId}</option>`)}</select></label>
          <label>证据<select .value=${this.#danmakuObservationEvidence} @change=${this.#setDanmakuObservationEvidence}><option value="all">全部证据</option><option value="unconfirmed">未确认</option><option value="suspected">疑似未公开</option></select></label>
          <label>结果<select .value=${this.#danmakuObservationResolution} @change=${this.#setDanmakuObservationResolution}><option value="all">全部结果</option><option value="pending">待复核</option><option value="confirmed-delayed">迟到更正</option></select></label>
          <label>标签<select .value=${this.#danmakuObservationTag} @change=${this.#setDanmakuObservationTagFilter}><option value="all">全部标签</option>${DANMAKU_SEND_OBSERVATION_TAGS.map((tag) => html`<option value=${tag.value}>${tag.label}</option>`)}</select></label>
        </div>
        <div class="observation-actions">
          <button class="action" @click=${this.#downloadDanmakuObservations}>导出 JSON</button>
          <button class="action" @click=${this.#chooseDanmakuObservationFile}>导入 JSON</button>
          <input class="send-observation-file-picker" type="file" accept="application/json,.json" tabindex="-1" @change=${(event: Event) => void this.#readDanmakuObservationFile(event)} />
        </div>
        ${this.#danmakuObservationMessage ? html`<p class="observation-message" role="status">${this.#danmakuObservationMessage}</p>` : nothing}
        ${records.length ? html`<ul class="observation-list">${records.map((record) => {
          const availableTags = DANMAKU_SEND_OBSERVATION_TAGS.filter((tag) => !record.tags.includes(tag.value));
          return html`<li>
            <div class="observation-record-head">
              <div class="observation-record-main">
                <div class="observation-record-message">「${record.message}」</div>
                <div class="observation-record-meta">${formatAutomationLocalTime(record.observedAt)} · 房间 ${record.roomId}${record.resolvedAt ? ` · ${formatAutomationLocalTime(record.resolvedAt)} 更正` : ""}</div>
              </div>
              <div class="observation-record-status">
                <span class="observation-chip">${danmakuObservationEvidenceText(record.evidence)}</span>
                <span class="observation-chip" data-resolution=${record.resolution}>${danmakuObservationResolutionText(record.resolution)}</span>
              </div>
            </div>
            ${record.tags.length ? html`<div class="observation-record-tags">${record.tags.map((tag) => html`<button class="observation-tag" type="button" title="移除此标签" @click=${() => void this.#removeDanmakuObservationTag(record.id, tag)}>${danmakuObservationTagText(tag)} ×</button>`)}</div>` : nothing}
            <details class="observation-editor">
              <summary>标签与备注${record.note ? " · 已有备注" : ""}</summary>
              <div class="observation-editor-body">
                ${availableTags.length ? html`<div class="field"><select .value=${this.#danmakuObservationSelectedTags[record.id] ?? ""} @change=${(event: Event) => this.#setDanmakuObservationTag(record.id, event)}><option value="">添加标签…</option>${availableTags.map((tag) => html`<option value=${tag.value}>${tag.label}</option>`)}</select><button class="action" ?disabled=${!this.#danmakuObservationSelectedTags[record.id]} @click=${() => void this.#addDanmakuObservationTag(record.id)}>添加</button></div>` : nothing}
                <textarea class="observation-card-note" rows="2" placeholder="复测房间、次数或其他备注（失焦时保存）" .value=${record.note} @change=${(event: Event) => void this.#saveDanmakuObservationNote(record.id, event)}></textarea>
                <div class="observation-card-actions">
                  ${this.#confirmRemoveDanmakuObservation === record.id
                    ? html`<span class="observation-message">仅在确认收到后删除：</span><button class="action" @click=${this.#cancelRemoveDanmakuObservation}>取消</button><button class="action" @click=${() => void this.#removeDanmakuObservation(record.id)}>确认删除</button>`
                    : html`<button class="action" @click=${() => this.#askRemoveDanmakuObservation(record.id)}>删除（确认已收到）</button>`}
                </div>
              </div>
            </details>
          </li>`;
        })}</ul>` : html`<p class="observation-message">没有符合条件的记录。</p>`}
      </div>
    </aside>`;
  }
  #renderChat() {
    const order = ["chatDecorationCleanup", "chatLayout", "chatMemory", "danmakuSendCheck", "messageContextActionFallback", "activityLinkCleanup", "transientGuidanceCleanup", "floatingHeadCleanup"];
    return html`<section><h2>弹幕</h2><p class="hint">“前缀”和“拉高”保留在弹幕工具栏；这里用于统一查看与低频设置。</p>${order.map(setting => featureDefinitions.find(item => item.setting === setting)).filter((item): item is (typeof featureDefinitions)[number] => item !== undefined).map(item => this.#renderFeature(item))}${this.#renderDanmakuObservationHistory()}${this.#renderDanmakuTail()}${this.#renderDanmakuAvailability()}</section>`;
  }
  #renderAutomation() { this.#syncAutoFansRoomDraft(); const roomDirty = this.#autoFansRoomDraft !== this.#autoFansRoomSaved; const daily = diagnosticFor(this.model, "daily-automation"); return html`<section><h2>每日自动化</h2><p class="hint">开启后会维持既有定义：当页自动检查并执行已纳入的每日任务。</p><div class="row"><div><div class="name">每日自动化</div><div class="desc">签到、固定任务、等级奖励检查与自动荧光棒按既有锁和调度执行。</div><div class="runtime" data-status=${daily?.status ?? "disabled"}>${daily?.detail ?? statusText(daily?.status)}</div></div><button class="switch" role="switch" aria-label="每日自动化" aria-checked=${String(this.model.settings.features.dailyAutomation)} @click=${() => this.#run(() => this.#toggleFeature("dailyAutomation"))}></button></div>${this.#confirmDaily ? html`<div class="notice" role="alert"><strong>确认开启每日自动化？</strong><br/>开启后会立即按当前既有规则检查和执行每日任务，可能产生签到、关注后恢复、赠送荧光棒等账号动作。<div class="field"><button class="action" @click=${() => { this.#confirmDaily = false; this.requestUpdate(); }}>取消</button><button class="action" @click=${() => this.#run(async () => { this.#confirmDaily = false; await this.model.onToggleFeature("dailyAutomation"); })}>确认开启</button></div></div>` : nothing}<div class="row"><div><div class="name">自动续荧光棒</div><div class="desc">单独暂停或恢复后续赠送任务；不取消已在执行的请求，也不改变既有跨标签锁、每日状态或赠送流程。</div><div class="runtime">${this.model.settings.automation.autoFansContinue ? "未报告" : "已暂停"}</div></div><button class="switch" role="switch" aria-label="自动续荧光棒" aria-checked=${String(this.model.settings.automation.autoFansContinue)} @click=${() => this.#run(() => this.model.onSetAutoFansEnabled(!this.model.settings.automation.autoFansContinue))}></button></div><div class="row"><div><div class="name">剩余荧光棒赠送房间</div><div class="desc">改动只在下次自动任务生效，不会立即赠送，也不改变既有锁、每日状态、调度或赠送流程。</div><div class="field"><input inputmode="numeric" aria-label="剩余荧光棒赠送房间" .value=${this.#autoFansRoomDraft} @input=${this.#setAutoFansRoomDraft} @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter") { event.preventDefault(); void this.#saveAutoFansRoom(); } }} /><button class="action" @click=${() => void this.#saveAutoFansRoom()}>保存</button></div>${this.#autoFansRoomError ? html`<p class="field-feedback" data-state="error" role="alert">${this.#autoFansRoomError}</p>` : roomDirty ? html`<p class="field-feedback" data-state="dirty">修改未保存。</p>` : this.#autoFansRoomFeedback ? html`<p class="field-feedback">${this.#autoFansRoomFeedback}</p>` : nothing}<div class="field"><button class="action" @click=${() => void this.#saveAutoFansRoom("12306")}>恢复默认 12306</button></div><p class="field-feedback">恢复默认也只在下次自动任务生效。</p></div></div></section><section><h2>最近自动化结果</h2><ul class="audit">${this.model.automation.length ? this.model.automation.map((item) => html`<li><strong>${item.taskId}</strong> ${item.outcome ? `· ${item.outcome}` : ""}<br/>${item.summary}<br/><time>${formatAutomationLocalTime(item.at)}</time></li>`) : html`<li>当前页面尚无可展示的脱敏审计记录。</li>`}</ul></section>`; }
  #renderData() { const pending = this.#pendingSettings; const enablesDaily = Boolean(pending && !this.model.settings.features.dailyAutomation && pending.features.dailyAutomation); return html`<section><h2>数据与诊断</h2><p class="hint">Settings JSON 是完整可配置快照；不包含 Cookie、令牌、身份、聊天内容、任务账本、锁、冷却、审计或发送观测数据。</p><div class="actions"><button class="action" @click=${() => this.model.onCopyDiagnostics()}>复制诊断信息</button><button class="action" @click=${() => void this.model.onCopyAutomationAudit()}>复制脱敏自动化日志</button><button class="action" @click=${() => void this.model.onDownloadAutomationAudit()}>下载脱敏自动化日志 JSON</button><button class="action" @click=${() => this.model.onExportSettings()}>导出完整 Settings JSON</button><button class="action" @click=${this.#chooseSettingsFile}>导入 Settings JSON</button><input class="file-picker" type="file" accept="application/json,.json" tabindex="-1" @change=${(event: Event) => void this.#readSettingsFile(event)} /><button class="action" @click=${this.#prepareDefaultSettings}>恢复默认 Settings</button><button class="action" @click=${() => { this.#confirmClearAudit = true; this.#dataMessage = ""; this.requestUpdate(); }}>清空自动化审计日志</button></div>${pending ? html`<div class="notice" role="alert"><strong>${this.#pendingSettingsKind === "import" ? "确认导入完整 Settings？" : "确认恢复默认 Settings？"}</strong><ul class="diff">${this.#pendingSettingsDiff.map((item) => html`<li>${item.path}：${item.before} → ${item.after}</li>`)}</ul>${enablesDaily ? html`<p>此变更会开启每日自动化；确认保存后将按既有“启用即检查”语义运行，可能产生账号动作。</p>` : nothing}<p>仅 Settings v6 会被一次性保存；任务账本、锁、冷却、审计、Cookie、身份和聊天数据不会导入。</p><div class="confirm-actions"><button class="action" @click=${this.#cancelSettingsChange}>取消</button><button class="action" @click=${() => void this.#confirmSettingsChange()}>确认保存</button></div></div>` : nothing}${this.#confirmClearAudit ? html`<div class="notice" role="alert"><strong>确认清空自动化审计日志？</strong><p>这只会删除可复制的脱敏审计记录；Settings、任务账本、锁和冷却不会改变。</p><div class="confirm-actions"><button class="action" @click=${() => { this.#confirmClearAudit = false; this.requestUpdate(); }}>取消</button><button class="action" @click=${() => void this.#clearAudit()}>确认清空</button></div></div>` : nothing}${this.#dataMessage ? html`<p class="data-status" role="status">${this.#dataMessage}</p>` : nothing}</section>`; }
  render() {
    if (!this.model) return nothing;
    const sections: Array<[string, string]> = [["overview", "概览"], ["playback", "播放"], ["chat", "弹幕"], ["messages", "用户"], ["automation", "自动化"], ["data", "数据"]];
    const content = this.#section === "notifications" ? this.#renderNotifications() : this.#section === "overview" ? this.#renderOverview() : this.#section === "playback" ? this.#renderPlayback() : this.#section === "chat" ? this.#renderChat() : this.#section === "messages" ? this.#renderMessageProcessing() : this.#section === "automation" ? this.#renderAutomation() : this.#renderData();
    const side = this.model.settings.preferences.controlCenterEdgeSide === "left" ? "left" : "right";
    const moveLabel = side === "left" ? "入口移到右侧" : "入口移到左侧";
    return html`<button class=${`edge edge-${side}`} type="button" style=${`top:clamp(28px, ${this.model.settings.preferences.controlCenterEdgeY * 100}vh, calc(100vh - 28px)); top:clamp(28px, var(--dwe-edge-y, ${this.model.settings.preferences.controlCenterEdgeY * 100}vh), calc(100vh - 28px))`} title="打开控制中心；拖动调整高度" aria-label="打开斗鱼增强控制中心" @pointerdown=${this.#edgePointerDown} @pointermove=${this.#edgePointerMove} @pointerup=${this.#edgePointerEnd} @pointercancel=${this.#edgePointerEnd} @click=${this.#edgeClick}><span class="glyph" aria-hidden="true">✦</span></button><div class=${this.#showDanmakuObservationHistory ? "backdrop observation-open" : "backdrop"} @pointerdown=${(event: PointerEvent) => { if (!this.#showDanmakuObservationHistory && event.target === event.currentTarget) this.#close(); }}><aside class=${`panel panel-${side}${this.#section === "messages" ? " users-panel" : ""}`} role="dialog" aria-modal="true" aria-label="斗鱼网页增强控制中心"><header><div><h1>斗鱼网页增强</h1><span class="version">v${this.model.version}</span></div><div class="header-actions"><button class="action edge-side" type="button" @click=${this.#openNotifications}>记录/待看 ${this.model.notificationUnread}${this.model.notificationStatus === "error" ? " · 存储失败" : ""}</button><button class="action edge-side" type="button" aria-label=${moveLabel} @click=${this.#toggleEdgeSide} title=${moveLabel}>${side === "left" ? "→" : "←"}</button><button class="close" type="button" aria-label="关闭控制中心" @click=${this.#close}>×</button></div></header><nav aria-label="控制中心分区">${sections.map(([id, label]) => html`<button aria-current=${this.#section === id ? "page" : "false"} @click=${() => { this.#section = id; this.requestUpdate(); }}>${label}</button>`)}</nav><main aria-live="polite">${this.#message ? html`<div class="notice" role="alert">设置未保存：${this.#message}</div>` : nothing}${content}</main></aside></div>${this.#showDanmakuObservationHistory ? this.#renderDanmakuObservationDrawer() : nothing}`;
  }
}

if (typeof customElements !== "undefined" && !customElements.get(CONTROL_CENTER_ID)) {
  customElements.define(CONTROL_CENTER_ID, DouyuControlCenterElement);
}

export interface ControlCenterMountOptions {
  document: Document;
  model(): ControlCenterModel;
  onOpened?(): void;
  onOpenChange?(open: boolean): void;
}

/** A single host, independent of Douyu's replaceable player/chat DOM. */
export interface MountedControlCenter {
  dispose(): void;
  refreshGeometryWhenOpen(): void;
  showDanmakuSettings(): void;
}

export function mountControlCenter({ document, model, onOpened, onOpenChange }: ControlCenterMountOptions): MountedControlCenter {
  const host = document.createElement(CONTROL_CENTER_ID) as DouyuControlCenterElement;
  host.model = model();
  let disposed = false;
  const updateGeometry = (): void => {
    if (disposed) return;
    const chat = isVisibleChatPanel(document);
    const viewportWidth = document.defaultView?.innerWidth ?? 0;
    const width = host.model.settings.preferences.controlCenterEdgeSide === "right" && chat ? Math.max(0, Math.min(520, viewportWidth - chat.getBoundingClientRect().left)) : 400;
    host.style.setProperty("--dwe-control-center-panel-width", `${width}px`);
    host.toggleAttribute("data-dwe-chat-bounded", Boolean(chat));
    host.hiddenForVideo = false;
    if (host.hiddenForVideo) host.open = false;
    const fullscreen = document.fullscreenElement;
    if (fullscreen && host.parentElement !== fullscreen) fullscreen.append(host);
    else if (!fullscreen && document.body && host.parentElement !== document.body) document.body.append(host);
  };
  const refresh = (): void => { host.model = model(); host.requestUpdate(); updateGeometry(); };
  const onOpen = (): void => { onOpened?.(); refresh(); };
  host.addEventListener("dwe-control-center-refresh", refresh);
  const onOpenState = (event: Event): void => onOpenChange?.(Boolean((event as CustomEvent).detail));
  host.addEventListener("dwe-control-center-open-change", onOpenState);
  host.addEventListener("click", (event) => {
    if (isControlCenterEdgePath(event.composedPath())) onOpen();
  });
  const onFullscreen = () => updateGeometry();
  const onResize = () => updateGeometry();
  document.addEventListener("fullscreenchange", onFullscreen);
  document.defaultView?.addEventListener("resize", onResize);
  (document.body ?? document.documentElement).append(host);
  updateGeometry();
  return {
    showDanmakuSettings() { onOpen(); host.showDanmakuSettings(); },
    dispose() {
      disposed = true;
      host.removeEventListener("dwe-control-center-refresh", refresh);
      host.removeEventListener("dwe-control-center-open-change", onOpenState);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.defaultView?.removeEventListener("resize", onResize);
      host.remove();
    },
    refreshGeometryWhenOpen: createOpenOnlyGeometryRefresh(
      () => host.open,
      updateGeometry,
    ),
  };
}
