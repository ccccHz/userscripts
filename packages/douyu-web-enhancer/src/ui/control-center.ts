import { LitElement, css, html, nothing } from "lit";
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
import { isDouyuWebFullscreen } from "../features/compact-player.ts";
import type { DanmakuAvailabilitySnapshot } from "../features/danmaku-availability.ts";
import type { DanmakuSendObservation } from "../features/danmaku-send-observation-store.ts";

export const CONTROL_CENTER_ID = "douyu-web-enhancer-control-center";

export interface AutomationSummary {
  taskId: string;
  outcome?: string;
  summary: string;
  at: string;
}

export interface ControlCenterModel {
  version: string;
  settings: Settings;
  diagnostics: readonly FeatureDiagnostic[];
  runtime: FeatureRuntime;
  automation: readonly AutomationSummary[];
  danmakuObservations: readonly DanmakuSendObservation[];
  onToggleFeature(setting: FeatureSettingKey): Promise<void>;
  onSetAutoWebFullscreen(value: boolean): Promise<void>;
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
  onClearDanmakuObservations(): Promise<number>;
}

const featureDefinitions: ReadonlyArray<{
  setting: FeatureSettingKey;
  id: string;
  name: string;
  description: string;
  nearField?: string;
}> = [
  { setting: "compactPlayer", id: "compact-player", name: "隐藏礼物栏", description: "隐藏播放器礼物展示并保留近场快捷开关。", nearField: "播放器菜单与悬浮开关" },
  { setting: "roomMetrics", id: "room-metrics", name: "房间统计", description: "显示礼物收入、贵宾人数与观看信息。" },
  { setting: "volumeWheel", id: "volume-wheel", name: "滚轮调音量", description: "仅在音量按钮和展开滑杆内连续调节，兼容鼠标与高分辨率滚动。", nearField: "播放器音量控件" },
  { setting: "liveTimeshiftControls", id: "live-timeshift-controls", name: "直播时移控制", description: "在支持时移的直播间用左右键回看，并可同步到最新位置。", nearField: "播放器同步时间" },
  { setting: "highestVideoQuality", id: "highest-video-quality", name: "自动最高画质", description: "每次进入直播间只选择当前账号可点击的最高画质，之后尊重手动选择。" },
  { setting: "chatMemory", id: "chat-memory", name: "弹幕历史", description: "按直播间保留发送历史，支持输入框方向键浏览。" },
  { setting: "danmakuSendCheck", id: "danmaku-send-check", name: "发送检测", description: "在两秒内未确认回显时给出本地提示。" },
  { setting: "messageContextActionFallback", id: "message-context-action-fallback", name: "弹幕右键补全", description: "只补齐普通文字弹幕卡片中缺失的“回复”和“+1”；官方已有入口保持不变。" },
  { setting: "disableOfflineJump", id: "disable-offline-jump", name: "下播后停留当前页", description: "主播下播后自动关闭官方推荐跳转弹窗，继续停留当前直播间页面。" },
  { setting: "chatDecorationCleanup", id: "chat-decoration-cleanup", name: "隐藏弹幕前缀", description: "精简弹幕徽章和前缀，不隐藏正文。", nearField: "弹幕栏“前缀”" },
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

export function filterDanmakuObservations(
  records: readonly DanmakuSendObservation[],
  roomId: string,
  evidence: "all" | DanmakuSendObservation["evidence"],
  resolution: "all" | DanmakuSendObservation["resolution"],
): DanmakuSendObservation[] {
  return records
    .filter((record) => !roomId || record.roomId === roomId)
    .filter((record) => evidence === "all" || record.evidence === evidence)
    .filter((record) => resolution === "all" || record.resolution === resolution)
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
    .edge, .backdrop { pointer-events: auto; } .edge { position: fixed; right: -74px; top: 50%; transform: translateY(-50%); display:flex; align-items:center; gap:10px; min-width:110px; height:42px; padding:0 14px; border:1px solid var(--dwe-cc-border); border-right:0; border-radius:22px 0 0 22px; background:var(--dwe-cc-surface); color:var(--dwe-cc-text); box-shadow:0 8px 28px rgba(0,0,0,.3); cursor:pointer; transition:right var(--dwe-cc-duration) ease, background var(--dwe-cc-duration) ease; }
    .edge:hover, .edge:focus-visible, :host([open]) .edge { right:0; background:#30333d; outline:none; } .edge:focus-visible { box-shadow:0 0 0 3px rgba(255,106,61,.55); }
    .glyph { width:20px; height:20px; display:grid; place-items:center; border-radius:50%; background:var(--dwe-cc-accent); font-weight:800; } .backdrop { position:fixed; inset:0; background:rgba(0,0,0,.12); opacity:0; visibility:hidden; transition:opacity var(--dwe-cc-duration) ease, visibility var(--dwe-cc-duration); } :host([open]) .backdrop { opacity:1; visibility:visible; }
    .panel { position:absolute; top:0; right:0; height:100%; width:min(var(--dwe-control-center-panel-width, 400px), 100vw); box-sizing:border-box; display:flex; flex-direction:column; background:var(--dwe-cc-bg); backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); color:var(--dwe-cc-text); border-left:1px solid var(--dwe-cc-border); box-shadow:-12px 0 36px rgba(0,0,0,.35); transform:translateX(104%); transition:transform var(--dwe-cc-duration) cubic-bezier(.2,.8,.2,1); } :host([open]) .panel { transform:translateX(0); }
    header { flex:0 0 auto; display:flex; justify-content:space-between; align-items:center; padding:18px 16px 12px; border-bottom:1px solid var(--dwe-cc-border); } h1 { margin:0; font-size:16px; } .version { color:var(--dwe-cc-muted); font-size:12px; } button { font:inherit; } .close { border:0; background:transparent; color:inherit; width:32px; height:32px; border-radius:8px; cursor:pointer; font-size:22px; } .close:hover, .close:focus-visible { background:rgba(255,255,255,.1); outline:none; }
    nav { flex:0 0 44px; display:flex; align-items:center; gap:4px; height:44px; box-sizing:border-box; padding:0 var(--dwe-cc-gutter); overflow:auto; border-bottom:1px solid var(--dwe-cc-border); } nav button { display:inline-flex; align-items:center; height:30px; box-sizing:border-box; border:0; background:transparent; color:var(--dwe-cc-muted); padding:0 9px; border-radius:8px; white-space:nowrap; cursor:pointer; } nav button[aria-current="page"] { color:#fff; background:rgba(255,106,61,.18); } main { flex:1 1 auto; min-height:0; overflow:auto; padding:20px 0 28px; } section { margin:0 var(--dwe-cc-gutter) 24px; } h2 { margin:0 0 10px; font-size:13px; color:#fff; } .hint { margin:0 0 14px; color:var(--dwe-cc-muted); font-size:12px; }
    .row { display:grid; grid-template-columns:1fr auto; gap:10px; padding:12px; border:1px solid var(--dwe-cc-border); border-radius:var(--dwe-cc-radius); background:var(--dwe-cc-surface); } .row + .row { margin-top:8px; } .name { font-weight:650; } .desc, .runtime { color:var(--dwe-cc-muted); font-size:12px; margin-top:3px; } .runtime { display:block; } .runtime[data-status="error"], .runtime[data-status="degraded"] { color:var(--dwe-cc-warning); }
    .switch { align-self:center; appearance:none; border:0; width:42px; height:24px; border-radius:999px; background:#626876; cursor:pointer; position:relative; transition:background var(--dwe-cc-duration); } .switch::after { content:""; position:absolute; width:18px; height:18px; border-radius:50%; left:3px; top:3px; background:white; transition:transform var(--dwe-cc-duration); } .switch[aria-checked="true"] { background:var(--dwe-cc-accent); } .switch[aria-checked="true"]::after { transform:translateX(18px); } .switch:focus-visible { outline:3px solid rgba(255,106,61,.55); outline-offset:2px; }
    .field { display:flex; gap:8px; margin-top:8px; } input, select { min-width:0; flex:1; border:1px solid var(--dwe-cc-border); border-radius:8px; background:#111217; color:inherit; padding:8px; } .action { border:1px solid var(--dwe-cc-border); border-radius:8px; background:#30333d; color:inherit; padding:8px 10px; cursor:pointer; } .action:hover, .action:focus-visible { border-color:var(--dwe-cc-accent); outline:none; }
    .notice { padding:12px; border-radius:10px; background:rgba(255,157,64,.12); color:#ffcf98; margin:8px var(--dwe-cc-gutter); } .field-feedback { margin:8px 0 0; color:var(--dwe-cc-muted); font-size:12px; } .field-feedback[data-state="dirty"] { color:#ffcf98; } .field-feedback[data-state="error"] { color:var(--dwe-cc-warning); } .audit { margin:0; padding:8px 12px; list-style:none; border:1px solid var(--dwe-cc-border); border-radius:var(--dwe-cc-radius); background:var(--dwe-cc-surface); } .audit li { padding:10px 0; border-bottom:1px solid var(--dwe-cc-border); font-size:12px; } .audit li:last-child { border-bottom:0; } .audit time { color:var(--dwe-cc-muted); } .actions { display:grid; gap:8px; } .file-picker, .send-observation-file-picker { display:none; } .diff { margin:8px 0 0; padding-left:18px; font-size:12px; } .diff li + li { margin-top:4px; } .confirm-actions { display:flex; gap:8px; margin-top:10px; } .data-status { margin:10px 0 0; color:var(--dwe-cc-muted); font-size:12px; }
    .observation-history { margin-top:12px; padding:12px; border:1px solid var(--dwe-cc-border); border-radius:var(--dwe-cc-radius); background:var(--dwe-cc-surface); } .observation-heading { display:flex; justify-content:space-between; gap:8px; align-items:center; } .observation-heading .hint { margin:3px 0 0; } .observation-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; } .observation-actions .action { font-size:12px; } .observation-filters { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:8px; margin-top:10px; } .observation-filters label { display:grid; gap:4px; color:var(--dwe-cc-muted); font-size:11px; } .observation-filters select { width:100%; font-size:12px; } .observation-list { margin:10px 0 0; padding:0; list-style:none; border-top:1px solid var(--dwe-cc-border); } .observation-list li { padding:10px 0; border-bottom:1px solid var(--dwe-cc-border); } .observation-list li:last-child { border-bottom:0; } .observation-message { margin:8px 0 0; color:var(--dwe-cc-muted); font-size:12px; } .observation-card-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; } .observation-card-heading details { min-width:0; flex:1; } .observation-card-heading summary { cursor:pointer; overflow-wrap:anywhere; } .observation-card-heading details p { margin:7px 0 0; overflow-wrap:anywhere; color:var(--dwe-cc-muted); } .observation-chip { flex:0 0 auto; padding:2px 6px; border-radius:999px; background:rgba(255,193,124,.15); color:#ffcf98; font-size:11px; } .observation-chip[data-resolution="confirmed-delayed"] { background:rgba(114,212,153,.14); color:#93e0ad; } .observation-meta { margin-top:5px; color:var(--dwe-cc-muted); font-size:11px; }
    :host([data-dwe-pure-video="true"]) .edge, :host([data-dwe-pure-video="true"]) .backdrop { display:none; }
    @media (max-width:640px) { :host(:not([data-dwe-chat-bounded])) .panel { width:100vw; } }
    @media (prefers-reduced-motion:reduce) { *, *::before, *::after { transition-duration:1ms !important; scroll-behavior:auto !important; } }
  `;

  declare open: boolean;
  declare hiddenForVideo: boolean;
  declare model: ControlCenterModel;
  #section = "overview";
  #confirmDaily = false;
  #message = "";
  #autoFansRoomDraft = "";
  #autoFansRoomSaved = "";
  #autoFansRoomError = "";
  #autoFansRoomFeedback = "";
  #dataMessage = "";
  #pendingSettings: Settings | null = null;
  #pendingSettingsKind: "import" | "reset" | null = null;
  #pendingSettingsDiff: SettingsDifference[] = [];
  #confirmClearAudit = false;
  #showDanmakuObservationHistory = false;
  #danmakuObservationRoomId = "";
  #danmakuObservationEvidence: "all" | DanmakuSendObservation["evidence"] = "all";
  #danmakuObservationResolution: "all" | DanmakuSendObservation["resolution"] = "all";
  #danmakuObservationMessage = "";
  #confirmClearDanmakuObservations = false;
  #returnFocus: HTMLElement | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener("keydown", this.#onKeydown);
  }
  disconnectedCallback(): void { this.removeEventListener("keydown", this.#onKeydown); super.disconnectedCallback(); }
  updated(changed: Map<string, unknown>): void {
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
    if (event.key === "Escape") { event.preventDefault(); this.#close(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...(this.shadowRoot?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]):not([type="file"]), [tabindex]:not([tabindex="-1"])') ?? [])];
    if (!focusable.length) return;
    const first = focusable[0]; const last = focusable.at(-1)!;
    const active = this.shadowRoot?.activeElement;
    if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  };
  #close = (): void => { this.open = false; this.#confirmDaily = false; this.dispatchEvent(new CustomEvent("dwe-control-center-close", { bubbles: true, composed: true })); };
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
  #clearDanmakuObservations = async (): Promise<void> => {
    try {
      const count = await this.model.onClearDanmakuObservations();
      this.#confirmClearDanmakuObservations = false;
      this.#danmakuObservationMessage = count ? `已清空 ${count} 条本地检测记录。` : "当前没有可清空的本地检测记录。";
    } catch (error) {
      this.#danmakuObservationMessage = `检测记录未清空：${error instanceof Error ? error.message : String(error)}`;
    }
    this.requestUpdate();
  };
  #renderFeature(definition: (typeof featureDefinitions)[number]) {
    const enabled = this.model.settings.features[definition.setting];
    const diagnostic = diagnosticFor(this.model, definition.id);
    return html`<div class="row"><div><div class="name">${definition.name}</div><div class="desc">${definition.description}</div>${definition.nearField ? html`<div class="runtime">近场：${definition.nearField}</div>` : nothing}<div class="runtime" data-status=${diagnostic?.status ?? "disabled"}>${statusText(diagnostic?.status)}${diagnostic?.detail ? ` · ${diagnostic.detail}` : ""}</div></div><button class="switch" role="switch" aria-label=${definition.name} aria-checked=${String(enabled)} @click=${() => this.#run(() => this.#toggleFeature(definition.setting))}></button></div>`;
  }
  #renderDanmakuAvailability() {
    const diagnostic = diagnosticFor(this.model, "danmaku-availability");
    const data = diagnostic?.data && typeof diagnostic.data === "object"
      ? diagnostic.data as Partial<DanmakuAvailabilitySnapshot>
      : {};
    const installed = data.installed === true;
    const recovering = typeof data.rewrites === "number" && data.rewrites > 0;
    const officiallyAllowed = typeof data.observedEnabled === "number" && data.observedEnabled > 0;
    const runtime = diagnostic?.status === "degraded"
      ? "运行异常，可能无法恢复飘屏"
      : recovering
        ? "已生效，正在恢复飘屏"
        : officiallyAllowed
          ? "未生效，当前无需恢复"
          : installed
            ? "等待识别弹幕状态"
            : "未运行，刷新页面后重试";
    return html`<div class="row"><div><div class="name">特殊时期弹幕恢复</div><div class="desc">特殊日期遇到飘屏限制时自动恢复。</div><div class="runtime" data-status=${diagnostic?.status ?? "disabled"}>${runtime}</div></div></div>`;
  }
  #renderOverview() { return html`<section><h2>功能概览</h2><p class="hint">开关显示配置状态；状态行显示实际运行状态。页面工具栏中的高频入口仍可直接使用。</p>${featureDefinitions.map((item) => this.#renderFeature(item))}</section>`; }
  #renderPlayback() { const diagnostic = diagnosticFor(this.model, "auto-web-fullscreen"); const volumeWheel = featureDefinitions.find((item) => item.setting === "volumeWheel"); const liveTimeshift = featureDefinitions.find((item) => item.setting === "liveTimeshiftControls"); const highestQuality = featureDefinitions.find((item) => item.setting === "highestVideoQuality"); const disableOfflineJump = featureDefinitions.find((item) => item.setting === "disableOfflineJump"); return html`<section><h2>播放与页面</h2><div class="row"><div><div class="name">记住网页全屏</div><div class="desc">打开直播间后定位播放器，并恢复你上次选择的斗鱼网页全屏状态。</div><div class="runtime" data-status=${diagnostic?.status ?? "disabled"}>${statusText(diagnostic?.status)}${diagnostic?.detail ? ` · ${diagnostic.detail}` : ""}</div></div><button class="switch" role="switch" aria-label="记住网页全屏" aria-checked=${String(this.model.settings.preferences.autoWebFullscreen)} @click=${() => this.#run(() => this.model.onSetAutoWebFullscreen(!this.model.settings.preferences.autoWebFullscreen))}></button></div>${volumeWheel ? this.#renderFeature(volumeWheel) : nothing}${liveTimeshift ? this.#renderFeature(liveTimeshift) : nothing}${highestQuality ? this.#renderFeature(highestQuality) : nothing}${disableOfflineJump ? this.#renderFeature(disableOfflineJump) : nothing}</section>`; }
  #renderDanmakuObservationHistory() {
    const allRecords = this.model.danmakuObservations;
    const rooms = [...new Set(filterDanmakuObservations(allRecords, "", "all", "all").map((record) => record.roomId))];
    const records = filterDanmakuObservations(
      allRecords,
      this.#danmakuObservationRoomId,
      this.#danmakuObservationEvidence,
      this.#danmakuObservationResolution,
    );
    return html`<div class="observation-history"><div class="observation-heading"><div><div class="name">本地发送检测记录（${allRecords.length}）</div><p class="hint">仅保存未确认或疑似未公开的发送及其迟到更正；不代表消息一定被屏蔽。</p></div><button class="action" @click=${() => { this.#showDanmakuObservationHistory = !this.#showDanmakuObservationHistory; this.#confirmClearDanmakuObservations = false; this.requestUpdate(); }}>${this.#showDanmakuObservationHistory ? "收起" : "查看"}</button></div>${this.#showDanmakuObservationHistory ? html`<div class="observation-actions"><button class="action" @click=${this.#downloadDanmakuObservations}>导出 JSON</button><button class="action" @click=${this.#chooseDanmakuObservationFile}>导入 JSON</button><input class="send-observation-file-picker" type="file" accept="application/json,.json" tabindex="-1" @change=${(event: Event) => void this.#readDanmakuObservationFile(event)} /><button class="action" ?disabled=${allRecords.length === 0} @click=${() => { this.#confirmClearDanmakuObservations = true; this.#danmakuObservationMessage = ""; this.requestUpdate(); }}>清空记录</button></div><div class="observation-filters"><label>房间<select .value=${this.#danmakuObservationRoomId} @change=${(event: Event) => { this.#danmakuObservationRoomId = (event.target as HTMLSelectElement).value; this.requestUpdate(); }}><option value="">全部房间</option>${rooms.map((roomId) => html`<option value=${roomId}>${roomId}</option>`)}</select></label><label>证据<select .value=${this.#danmakuObservationEvidence} @change=${(event: Event) => { this.#danmakuObservationEvidence = (event.target as HTMLSelectElement).value as "all" | DanmakuSendObservation["evidence"]; this.requestUpdate(); }}><option value="all">全部证据</option><option value="unconfirmed">未确认</option><option value="suspected">疑似未公开</option></select></label><label>更正<select .value=${this.#danmakuObservationResolution} @change=${(event: Event) => { this.#danmakuObservationResolution = (event.target as HTMLSelectElement).value as "all" | DanmakuSendObservation["resolution"]; this.requestUpdate(); }}><option value="all">全部状态</option><option value="pending">待复核</option><option value="confirmed-delayed">迟到更正</option></select></label></div>${this.#confirmClearDanmakuObservations ? html`<div class="notice" role="alert"><strong>确认清空 ${allRecords.length} 条本地检测记录？</strong><p>这只会删除本地发送检测记录；Settings、草稿、弹幕历史、任务账本和当前运行检测不会改变。</p><div class="confirm-actions"><button class="action" @click=${() => { this.#confirmClearDanmakuObservations = false; this.requestUpdate(); }}>取消</button><button class="action" @click=${() => void this.#clearDanmakuObservations()}>确认清空</button></div></div>` : nothing}${this.#danmakuObservationMessage ? html`<p class="observation-message" role="status">${this.#danmakuObservationMessage}</p>` : nothing}${records.length ? html`<ul class="observation-list">${records.map((record) => html`<li><div class="observation-card-heading"><details><summary>${observationPreview(record.message)}</summary><p>${record.message}</p></details><span class="observation-chip">${danmakuObservationEvidenceText(record.evidence)}</span><span class="observation-chip" data-resolution=${record.resolution}>${danmakuObservationResolutionText(record.resolution)}</span></div><div class="observation-meta">${formatAutomationLocalTime(record.observedAt)} · 房间 ${record.roomId}${record.resolvedAt ? ` · ${formatAutomationLocalTime(record.resolvedAt)} 更正` : ""}</div></li>`)}</ul>` : html`<p class="observation-message">没有符合条件的记录。</p>`}` : nothing}</div>`;
  }
  #renderChat() { return html`<section><h2>弹幕</h2><p class="hint">“前缀”和“拉高”保留在弹幕工具栏；这里用于统一查看与低频设置。</p>${this.#renderDanmakuAvailability()}${featureDefinitions.filter((item) => ["chatMemory", "danmakuSendCheck", "messageContextActionFallback", "chatDecorationCleanup", "chatLayout"].includes(item.setting)).map((item) => this.#renderFeature(item))}${this.#renderDanmakuObservationHistory()}</section>`; }
  #renderAutomation() { this.#syncAutoFansRoomDraft(); const roomDirty = this.#autoFansRoomDraft !== this.#autoFansRoomSaved; const daily = diagnosticFor(this.model, "daily-automation"); return html`<section><h2>每日自动化</h2><p class="hint">开启后会维持既有定义：当页自动检查并执行已纳入的每日任务。</p><div class="row"><div><div class="name">每日自动化</div><div class="desc">签到、固定任务、等级奖励检查与自动荧光棒按既有锁和调度执行。</div><div class="runtime" data-status=${daily?.status ?? "disabled"}>${daily?.detail ?? statusText(daily?.status)}</div></div><button class="switch" role="switch" aria-label="每日自动化" aria-checked=${String(this.model.settings.features.dailyAutomation)} @click=${() => this.#run(() => this.#toggleFeature("dailyAutomation"))}></button></div>${this.#confirmDaily ? html`<div class="notice" role="alert"><strong>确认开启每日自动化？</strong><br/>开启后会立即按当前既有规则检查和执行每日任务，可能产生签到、关注后恢复、赠送荧光棒等账号动作。<div class="field"><button class="action" @click=${() => { this.#confirmDaily = false; this.requestUpdate(); }}>取消</button><button class="action" @click=${() => this.#run(async () => { this.#confirmDaily = false; await this.model.onToggleFeature("dailyAutomation"); })}>确认开启</button></div></div>` : nothing}<div class="row"><div><div class="name">自动续荧光棒</div><div class="desc">单独暂停或恢复后续赠送任务；不取消已在执行的请求，也不改变既有跨标签锁、每日状态或赠送流程。</div><div class="runtime">${this.model.settings.automation.autoFansContinue ? "未报告" : "已暂停"}</div></div><button class="switch" role="switch" aria-label="自动续荧光棒" aria-checked=${String(this.model.settings.automation.autoFansContinue)} @click=${() => this.#run(() => this.model.onSetAutoFansEnabled(!this.model.settings.automation.autoFansContinue))}></button></div><div class="row"><div><div class="name">剩余荧光棒赠送房间</div><div class="desc">改动只在下次自动任务生效，不会立即赠送，也不改变既有锁、每日状态、调度或赠送流程。</div><div class="field"><input inputmode="numeric" aria-label="剩余荧光棒赠送房间" .value=${this.#autoFansRoomDraft} @input=${this.#setAutoFansRoomDraft} @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter") { event.preventDefault(); void this.#saveAutoFansRoom(); } }} /><button class="action" @click=${() => void this.#saveAutoFansRoom()}>保存</button></div>${this.#autoFansRoomError ? html`<p class="field-feedback" data-state="error" role="alert">${this.#autoFansRoomError}</p>` : roomDirty ? html`<p class="field-feedback" data-state="dirty">修改未保存。</p>` : this.#autoFansRoomFeedback ? html`<p class="field-feedback">${this.#autoFansRoomFeedback}</p>` : nothing}<div class="field"><button class="action" @click=${() => void this.#saveAutoFansRoom("12306")}>恢复默认 12306</button></div><p class="field-feedback">恢复默认也只在下次自动任务生效。</p></div></div></section><section><h2>最近自动化结果</h2><ul class="audit">${this.model.automation.length ? this.model.automation.map((item) => html`<li><strong>${item.taskId}</strong> ${item.outcome ? `· ${item.outcome}` : ""}<br/>${item.summary}<br/><time>${formatAutomationLocalTime(item.at)}</time></li>`) : html`<li>当前页面尚无可展示的脱敏审计记录。</li>`}</ul></section>`; }
  #renderData() { const pending = this.#pendingSettings; const enablesDaily = Boolean(pending && !this.model.settings.features.dailyAutomation && pending.features.dailyAutomation); return html`<section><h2>数据与诊断</h2><p class="hint">Settings JSON 是完整可配置快照；不包含 Cookie、令牌、身份、聊天内容、任务账本、锁、冷却、审计或发送观测数据。</p><div class="actions"><button class="action" @click=${() => this.model.onCopyDiagnostics()}>复制诊断信息</button><button class="action" @click=${() => void this.model.onCopyAutomationAudit()}>复制脱敏自动化日志</button><button class="action" @click=${() => void this.model.onDownloadAutomationAudit()}>下载脱敏自动化日志 JSON</button><button class="action" @click=${() => this.model.onExportSettings()}>导出完整 Settings JSON</button><button class="action" @click=${this.#chooseSettingsFile}>导入 Settings JSON</button><input class="file-picker" type="file" accept="application/json,.json" tabindex="-1" @change=${(event: Event) => void this.#readSettingsFile(event)} /><button class="action" @click=${this.#prepareDefaultSettings}>恢复默认 Settings</button><button class="action" @click=${() => { this.#confirmClearAudit = true; this.#dataMessage = ""; this.requestUpdate(); }}>清空自动化审计日志</button></div>${pending ? html`<div class="notice" role="alert"><strong>${this.#pendingSettingsKind === "import" ? "确认导入完整 Settings？" : "确认恢复默认 Settings？"}</strong><ul class="diff">${this.#pendingSettingsDiff.map((item) => html`<li>${item.path}：${item.before} → ${item.after}</li>`)}</ul>${enablesDaily ? html`<p>此变更会开启每日自动化；确认保存后将按既有“启用即检查”语义运行，可能产生账号动作。</p>` : nothing}<p>仅 Settings v6 会被一次性保存；任务账本、锁、冷却、审计、Cookie、身份和聊天数据不会导入。</p><div class="confirm-actions"><button class="action" @click=${this.#cancelSettingsChange}>取消</button><button class="action" @click=${() => void this.#confirmSettingsChange()}>确认保存</button></div></div>` : nothing}${this.#confirmClearAudit ? html`<div class="notice" role="alert"><strong>确认清空自动化审计日志？</strong><p>这只会删除可复制的脱敏审计记录；Settings、任务账本、锁和冷却不会改变。</p><div class="confirm-actions"><button class="action" @click=${() => { this.#confirmClearAudit = false; this.requestUpdate(); }}>取消</button><button class="action" @click=${() => void this.#clearAudit()}>确认清空</button></div></div>` : nothing}${this.#dataMessage ? html`<p class="data-status" role="status">${this.#dataMessage}</p>` : nothing}</section>`; }
  render() {
    if (!this.model) return nothing;
    const sections: Array<[string, string]> = [["overview", "概览"], ["playback", "播放"], ["chat", "弹幕"], ["automation", "自动化"], ["data", "数据"]];
    const content = this.#section === "overview" ? this.#renderOverview() : this.#section === "playback" ? this.#renderPlayback() : this.#section === "chat" ? this.#renderChat() : this.#section === "automation" ? this.#renderAutomation() : this.#renderData();
    return html`<button class="edge" type="button" aria-label="打开斗鱼增强控制中心" @click=${() => { this.open = true; }}><span class="glyph" aria-hidden="true">✦</span><span>增强</span></button><div class="backdrop" @pointerdown=${(event: PointerEvent) => { if (event.target === event.currentTarget) this.#close(); }}><aside class="panel" role="dialog" aria-modal="true" aria-label="斗鱼网页增强控制中心"><header><div><h1>斗鱼网页增强</h1><span class="version">v${this.model.version}</span></div><button class="close" type="button" aria-label="关闭控制中心" @click=${this.#close}>×</button></header><nav aria-label="控制中心分区">${sections.map(([id, label]) => html`<button aria-current=${this.#section === id ? "page" : "false"} @click=${() => { this.#section = id; this.requestUpdate(); }}>${label}</button>`)}</nav><main aria-live="polite">${this.#message ? html`<div class="notice" role="alert">设置未保存：${this.#message}</div>` : nothing}${content}</main></aside></div>`;
  }
}

if (typeof customElements !== "undefined" && !customElements.get(CONTROL_CENTER_ID)) {
  customElements.define(CONTROL_CENTER_ID, DouyuControlCenterElement);
}

export interface ControlCenterMountOptions {
  document: Document;
  model(): ControlCenterModel;
  onOpened?(): void;
}

/** A single host, independent of Douyu's replaceable player/chat DOM. */
export interface MountedControlCenter {
  dispose(): void;
  refreshGeometryWhenOpen(): void;
}

export function mountControlCenter({ document, model, onOpened }: ControlCenterMountOptions): MountedControlCenter {
  const host = document.createElement(CONTROL_CENTER_ID) as DouyuControlCenterElement;
  host.model = model();
  let disposed = false;
  const updateGeometry = (): void => {
    if (disposed) return;
    const chat = isVisibleChatPanel(document);
    const viewportWidth = document.defaultView?.innerWidth ?? 0;
    const width = chat ? Math.max(0, Math.min(520, viewportWidth - chat.getBoundingClientRect().left)) : 400;
    host.style.setProperty("--dwe-control-center-panel-width", `${width}px`);
    host.toggleAttribute("data-dwe-chat-bounded", Boolean(chat));
    host.hiddenForVideo = isPureVideoFullscreen(document);
    if (host.hiddenForVideo) host.open = false;
    const fullscreen = document.fullscreenElement;
    if (fullscreen && chat && fullscreen.contains(chat) && host.parentElement !== fullscreen) fullscreen.append(host);
    else if (!fullscreen && document.body && host.parentElement !== document.body) document.body.append(host);
  };
  const refresh = (): void => { host.model = model(); host.requestUpdate(); updateGeometry(); };
  const onOpen = (): void => { onOpened?.(); refresh(); };
  host.addEventListener("dwe-control-center-refresh", refresh);
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
    dispose() {
      disposed = true;
      host.removeEventListener("dwe-control-center-refresh", refresh);
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
