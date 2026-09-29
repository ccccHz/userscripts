import {
  GM,
  GM_getValue,
  GM_registerMenuCommand,
  GM_setClipboard,
  GM_setValue,
  GM_xmlhttpRequest,
} from "$";
import packageJson from "../package.json";

import { AutomationAuditLog } from "./core/automation.ts";
import { Diagnostics } from "./core/diagnostics.ts";
import { FeatureRuntime } from "./core/feature.ts";
import {
  applyPersistedFeatureSettings,
  saveAndApplySettingsSnapshot,
  togglePersistedFeature,
} from "./core/feature-settings.ts";
import { ObserverHub } from "./core/observer-hub.ts";
import {
  installPageSocketHook,
  PAGE_SOCKET_HOOK_ID,
} from "./core/page-socket-hook.ts";
import { SelectorRegistry } from "./core/selectors.ts";
import { DEFAULT_SETTINGS, type Settings, SettingsStore } from "./core/settings.ts";
import { StyleRegistry } from "./core/styles.ts";
import {
  CHAT_DECORATION_CLEANUP_ID,
  chatDecorationCleanupFeature,
  chatDecorationSelectors,
} from "./features/chat-decoration-cleanup.ts";
import {
  CHAT_MEMORY_ID,
  CHAT_MEMORY_KEY,
  ChatMemoryStore,
  chatInputSelectors,
  createChatMemoryFeature,
} from "./features/chat-memory.ts";
import {
  CHAT_LAYOUT_ID,
  chatLayoutFeature,
  chatLayoutSelectors,
} from "./features/chat-layout.ts";
import {
  COMPACT_PLAYER_ID,
  compactPlayerFeature,
  compactPlayerSelectors,
} from "./features/compact-player.ts";
import {
  AUTO_WEB_FULLSCREEN_ID,
  AUTO_WEB_FULLSCREEN_STATE_KEY,
  autoWebFullscreenSelectors,
  createAutoWebFullscreenFeature,
} from "./features/auto-web-fullscreen.ts";
import { normalizeRoomId, REST_ROOM_ID_KEY } from "../../auto-fans-continue/src/config.js";
import { DEFAULT_REST_ROOM_ID } from "../../auto-fans-continue/src/renewal-plan.js";
import {
  DANMAKU_SEND_CHECK_ID,
  createDanmakuSendCheckFeature,
  danmakuSendCheckSelectors,
} from "./features/danmaku-send-check.ts";
import {
  createBrowserDanmakuSendObservationPersistence,
  DANMAKU_SEND_OBSERVATIONS_KEY,
  DanmakuSendObservationStore,
  parseDanmakuSendObservations,
} from "./features/danmaku-send-observation-store.ts";
import {
  ROOM_METRICS_ID,
  createRoomMetricsFeature,
  roomMetricsSelectors,
} from "./features/room-metrics.ts";
import {
  DAILY_AUTOMATION_ID,
  createDailyAutomationFeature,
  type GmRequest,
  type GmRequestDetails,
} from "./features/daily-automation.ts";
import {
  VOLUME_WHEEL_ID,
  createVolumeWheelFeature,
  volumeWheelSelectors,
} from "./features/volume-wheel.ts";
import {
  LIVE_TIMESHIFT_CONTROLS_ID,
  createLiveTimeshiftControlsFeature,
  liveTimeshiftControlsSelectors,
} from "./features/live-timeshift-controls.ts";
import {
  HIGHEST_VIDEO_QUALITY_ID,
  highestVideoQualityFeature,
} from "./features/highest-video-quality.ts";
import {
  MESSAGE_CONTEXT_ACTION_FALLBACK_ID,
  messageContextActionFallbackFeature,
  messageContextActionSelectors,
} from "./features/message-context-action-fallback.ts";
import {
  DISABLE_OFFLINE_JUMP_ID,
  createDisableOfflineJumpFeature,
  disableOfflineJumpSelectors,
} from "./features/disable-offline-jump.ts";
import {
  TRANSIENT_GUIDANCE_CLEANUP_ID,
  transientGuidanceCleanupFeature,
  transientGuidanceSelectors,
} from "./features/transient-guidance-cleanup.ts";
import {
  BAG_INFO_ID,
  bagInfoSelectors,
  createBagInfoFeature,
} from "./features/bag-info.ts";
import {
  addUserBlockRule,
  normalizeUserBlockingState,
  removeUserBlockRule,
  shouldBlockUser,
  USER_BLOCKING_ID,
  USER_BLOCKING_KEY,
  type UserBlockingState,
} from "./features/user-blocking.ts";
import {
  DANMAKU_AVAILABILITY_ID,
  installDanmakuAvailabilityHook,
} from "./features/danmaku-availability.ts";
import {
  mountSimplifiedModeControls,
  simplifiedModeControlSelectors,
} from "./ui/simplified-mode-controls.ts";
import {
  mountControlCenter,
  type AutomationSummary,
} from "./ui/control-center.ts";

// This must run before the async settings/runtime bootstrap: Douyu's inline
// bootstrap can be inserted immediately after the userscript starts.
const danmakuAvailabilityHook = installDanmakuAvailabilityHook();
globalThis.addEventListener?.("pagehide", () => danmakuAvailabilityHook.dispose(), { once: true });
// Tampermonkey can give a userscript its own global object even in raw mode.
// Patch the document's window so page-created sockets pass through this Hook.
const pageSocketHook = installPageSocketHook(document.defaultView ?? undefined);
globalThis.addEventListener?.("pagehide", () => pageSocketHook.dispose(), { once: true });

function updatePageSocketDiagnostics(diagnostics: Diagnostics): void {
  const snapshot = pageSocketHook.snapshot();
  diagnostics.update(
    PAGE_SOCKET_HOOK_ID,
    !snapshot.installed || snapshot.hookErrors > 0 ? "degraded"
      : snapshot.capturedConnections > 0 ? "active" : "waiting",
    {
      detail: !snapshot.installed ? "页面 WebSocket Hook 未安装"
        : snapshot.capturedConnections === 0 ? "等待斗鱼页面创建直播间 WebSocket"
          : snapshot.filterEnabled ? "正在按 UID 本地过滤普通弹幕" : "正在只读观察斗鱼页面 WebSocket",
      data: snapshot,
    },
  );
}

function updateDanmakuAvailabilityDiagnostics(diagnostics: Diagnostics): void {
  const snapshot = danmakuAvailabilityHook.snapshot();
  diagnostics.update(
    DANMAKU_AVAILABILITY_ID,
    snapshot.errors > 0 || snapshot.degraded > 0 ? "degraded" : snapshot.installed ? "active" : "disabled",
    {
      detail: snapshot.installed
        ? "document-start 页面主世界 Hook 已安装；只观察/改写精确 player_barrage 序列"
        : "Hook 未安装；刷新页面后重试",
      data: snapshot,
    },
  );
}

async function waitForRoot(): Promise<HTMLElement> {
  if (document.documentElement) return document.documentElement;
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (!document.documentElement) return;
      observer.disconnect();
      resolve(document.documentElement);
    });
    observer.observe(document, { childList: true });
  });
}

async function start(): Promise<void> {
  const root = await waitForRoot();
  const diagnostics = new Diagnostics();
  const stopDanmakuAvailabilityDiagnostics = danmakuAvailabilityHook.subscribe(() => updateDanmakuAvailabilityDiagnostics(diagnostics));
  updateDanmakuAvailabilityDiagnostics(diagnostics);
  const stopPageSocketDiagnostics = pageSocketHook.subscribe(() => updatePageSocketDiagnostics(diagnostics));
  updatePageSocketDiagnostics(diagnostics);
  const observerHub = new ObserverHub(root);
  const styles = new StyleRegistry(document);
  const selectors = new SelectorRegistry(document, {
    ...chatDecorationSelectors,
    ...chatInputSelectors,
    ...chatLayoutSelectors,
    ...autoWebFullscreenSelectors,
    ...compactPlayerSelectors,
    ...danmakuSendCheckSelectors,
    ...roomMetricsSelectors,
    ...volumeWheelSelectors,
    liveTimeshiftVideo: liveTimeshiftControlsSelectors.video,
    liveTimeshiftSyncToolbar: liveTimeshiftControlsSelectors.syncToolbar,
    ...messageContextActionSelectors,
    ...disableOfflineJumpSelectors,
    ...transientGuidanceSelectors,
    ...bagInfoSelectors,
    ...simplifiedModeControlSelectors,
  });
  const settingsStore = new SettingsStore(GM_getValue, GM_setValue);
  const automationAudit = new AutomationAuditLog(GM_getValue, GM_setValue);
  const persistedSettings = await GM_getValue("douyu-web-enhancer:settings", null);
  let settings = settingsStore.normalize(persistedSettings);
  const persistedRecord = persistedSettings && typeof persistedSettings === "object"
    ? persistedSettings as Record<string, unknown>
    : {};
  const persistedFeatures = persistedRecord.features && typeof persistedRecord.features === "object"
    ? persistedRecord.features as Record<string, unknown>
    : {};
  const needsSettingsMigration = !persistedRecord.preferences || !persistedRecord.automation || typeof persistedFeatures.disableOfflineJump !== "boolean" || typeof persistedFeatures.transientGuidanceCleanup !== "boolean" || typeof persistedFeatures.bagInfo !== "boolean";
  if (!persistedRecord.preferences) {
    settings.preferences.autoWebFullscreen = (await GM_getValue(AUTO_WEB_FULLSCREEN_STATE_KEY, null)) !== false;
  }
  if (!persistedRecord.automation) {
    settings.automation.autoFansRestRoomId = normalizeRoomId(localStorage.getItem(REST_ROOM_ID_KEY));
  }
  if (needsSettingsMigration) await settingsStore.save(settings);
  let userBlocking = normalizeUserBlockingState(await GM_getValue(USER_BLOCKING_KEY, null));
  const currentRoomId = (): string | null => /^\/([1-9]\d{0,11})$/.exec(document.defaultView?.location.pathname ?? "")?.[1] ?? null;
  const updateUserBlockDiagnostics = (): void => {
    const hook = pageSocketHook.snapshot();
    const roomId = currentRoomId();
    const applicableRuleCount = roomId === null ? 0
      : userBlocking.rules.filter((rule) => rule.roomId === null || rule.roomId === roomId).length;
    diagnostics.update(USER_BLOCKING_ID,
      !userBlocking.enabled ? "disabled"
        : !hook.installed || hook.filterErrors > 0 ? "degraded"
          : applicableRuleCount === 0 ? "waiting" : "active",
      {
        detail: !userBlocking.enabled ? "本地屏蔽已关闭"
          : !hook.installed ? "页面 Socket Hook 不可用，原生弹幕照常显示"
            : userBlocking.rules.length === 0 ? "等待添加 UID 规则"
              : roomId === null ? "仅数字直播间生效"
                : applicableRuleCount === 0 ? "当前房间没有适用规则"
                  : `当前房间有 ${applicableRuleCount} 条适用规则；仅影响之后到达的普通弹幕`,
        data: {
          ruleCount: userBlocking.rules.length,
          applicableRuleCount,
          filteredMessages: hook.filteredMessages,
          filterSkippedFrames: hook.filterSkippedFrames,
          filterErrors: hook.filterErrors,
        },
      });
  };
  const stopUserBlockDiagnostics = pageSocketHook.subscribe(updateUserBlockDiagnostics);
  const syncUserBlockFilter = (): void => {
    const active = userBlocking.enabled && userBlocking.rules.length > 0;
    pageSocketHook.setIncomingChatFilter(active
      ? (uid, roomId) => shouldBlockUser(userBlocking, currentRoomId(), uid, roomId)
      : null);
    updateUserBlockDiagnostics();
  };
  syncUserBlockFilter();
  let userBlockingWrite: Promise<void> = Promise.resolve();
  const mutateUserBlocking = (change: (state: UserBlockingState) => UserBlockingState): Promise<void> => {
    const run = userBlockingWrite.then(async () => {
      const next = normalizeUserBlockingState(change(userBlocking));
      if (JSON.stringify(next) === JSON.stringify(userBlocking)) return;
      await GM_setValue(USER_BLOCKING_KEY, next);
      userBlocking = next;
      syncUserBlockFilter();
      document.dispatchEvent(new Event("dwe-settings-changed"));
    });
    userBlockingWrite = run.catch(() => undefined);
    return run;
  };
  const legacyDanmakuObservations = await GM_getValue(DANMAKU_SEND_OBSERVATIONS_KEY, null);
  const danmakuObservations = new DanmakuSendObservationStore(
    legacyDanmakuObservations,
    createBrowserDanmakuSendObservationPersistence(document.defaultView),
  );
  void danmakuObservations.ready().then(async () => {
    if (parseDanmakuSendObservations(legacyDanmakuObservations).events.length === 0) return;
    await GM_setValue(DANMAKU_SEND_OBSERVATIONS_KEY, { schemaVersion: 1, events: [] });
  }).catch((error: unknown) => console.error("[douyu-web-enhancer] 弹幕发送观测存储初始化失败", error));
  const request: GmRequest = (details) => {
    if (typeof GM_xmlhttpRequest === "function") {
      return GM_xmlhttpRequest(details as Parameters<typeof GM_xmlhttpRequest>[0]);
    }
    if (typeof GM?.xmlHttpRequest === "function") {
      return GM.xmlHttpRequest(details as Parameters<typeof GM.xmlHttpRequest>[0]);
    }
    throw new Error("当前脚本管理器未提供跨域请求 API");
  };
  const chatMemoryStore = new ChatMemoryStore(
    await GM_getValue(CHAT_MEMORY_KEY, null),
    GM_setValue,
  );
  const runtime = new FeatureRuntime(
    { diagnostics, document, observerHub, root, selectors, styles },
    [
      chatDecorationCleanupFeature,
      createChatMemoryFeature(chatMemoryStore),
      chatLayoutFeature,
      compactPlayerFeature,
      createAutoWebFullscreenFeature(
        {
          async load() { return settings.preferences.autoWebFullscreen; },
          async save(value: boolean) {
            const previous = settings.preferences.autoWebFullscreen;
            settings.preferences.autoWebFullscreen = value;
            try {
              await settingsStore.save(settings);
              document.dispatchEvent(new Event("dwe-settings-changed"));
            } catch (error) {
              settings.preferences.autoWebFullscreen = previous;
              throw error;
            }
          },
        },
      ),
      createDanmakuSendCheckFeature(danmakuObservations),
      createRoomMetricsFeature(request),
      createVolumeWheelFeature(),
      createLiveTimeshiftControlsFeature(),
      highestVideoQualityFeature,
      messageContextActionFallbackFeature,
      createDisableOfflineJumpFeature(),
      transientGuidanceCleanupFeature,
      createBagInfoFeature(),
      createDailyAutomationFeature({
        request: (details: GmRequestDetails) => request(details),
        read: GM_getValue,
        write: GM_setValue,
        autoFansRestRoomId: () => settings.automation.autoFansRestRoomId ?? DEFAULT_REST_ROOM_ID,
        autoFansContinueEnabled: () => settings.automation.autoFansContinue,
      }),
    ],
  );

  // This is a default-on recovery behavior, not a user-toggleable feature.
  runtime.enable(AUTO_WEB_FULLSCREEN_ID);

  const featureSettings = [
    {
      id: CHAT_MEMORY_ID,
      setting: "chatMemory",
    },
    {
      id: COMPACT_PLAYER_ID,
      setting: "compactPlayer",
    },
    {
      id: DANMAKU_SEND_CHECK_ID,
      setting: "danmakuSendCheck",
    },
    {
      id: CHAT_LAYOUT_ID,
      setting: "chatLayout",
    },
    {
      id: CHAT_DECORATION_CLEANUP_ID,
      setting: "chatDecorationCleanup",
    },
    {
      id: ROOM_METRICS_ID,
      setting: "roomMetrics",
    },
    {
      id: VOLUME_WHEEL_ID,
      setting: "volumeWheel",
    },
    {
      id: LIVE_TIMESHIFT_CONTROLS_ID,
      setting: "liveTimeshiftControls",
    },
    {
      id: HIGHEST_VIDEO_QUALITY_ID,
      setting: "highestVideoQuality",
    },
    {
      id: MESSAGE_CONTEXT_ACTION_FALLBACK_ID,
      setting: "messageContextActionFallback",
    },
    {
      id: DISABLE_OFFLINE_JUMP_ID,
      setting: "disableOfflineJump",
    },
    {
      id: TRANSIENT_GUIDANCE_CLEANUP_ID,
      setting: "transientGuidanceCleanup",
    },
    {
      id: BAG_INFO_ID,
      setting: "bagInfo",
    },
    {
      id: DAILY_AUTOMATION_ID,
      setting: "dailyAutomation",
    },
  ] as const;

  applyPersistedFeatureSettings(settings, runtime, featureSettings);

  const toggleFeature = async (
    setting: (typeof featureSettings)[number]["setting"],
  ): Promise<void> => {
    await togglePersistedFeature(
      setting,
      settings,
      settingsStore,
      runtime,
      featureSettings,
    );
    document.dispatchEvent(new Event("dwe-settings-changed"));
  };

  const applySettingsSnapshot = async (next: Settings): Promise<void> => {
    settings = await saveAndApplySettingsSnapshot(
      next,
      settingsStore,
      runtime,
      featureSettings,
    );
    document.dispatchEvent(new Event("dwe-settings-changed"));
  };

  const syncSettingsFromStore = async (): Promise<void> => {
    const stored = await settingsStore.load();
    if (JSON.stringify(stored) === JSON.stringify(settings)) return;
    settings = stored;
    applyPersistedFeatureSettings(settings, runtime, featureSettings);
    document.dispatchEvent(new Event("dwe-settings-changed"));
  };

  const removeControls = mountSimplifiedModeControls({
    document,
    observerHub,
    selectors,
    styles,
    getSettings: () => settings,
    toggle: toggleFeature,
  });

  const saveAutoWebFullscreen = async (value: boolean): Promise<void> => {
    const previous = settings.preferences.autoWebFullscreen;
    settings.preferences.autoWebFullscreen = value;
    try {
      await settingsStore.save(settings);
      document.dispatchEvent(new Event("dwe-settings-changed"));
    } catch (error) {
      settings.preferences.autoWebFullscreen = previous;
      throw error;
    }
  };
  const saveAutoFansRoomId = async (value: string | null): Promise<void> => {
    const normalized = value === null ? null : normalizeRoomId(value);
    if (value !== null && !normalized) throw new Error("房间号必须是非 0 开头的纯数字");
    const previous = settings.automation.autoFansRestRoomId;
    settings.automation.autoFansRestRoomId = normalized;
    try {
      await settingsStore.save(settings);
      document.dispatchEvent(new Event("dwe-settings-changed"));
    } catch (error) {
      settings.automation.autoFansRestRoomId = previous;
      throw error;
    }
  };
  const saveAutoFansEnabled = async (value: boolean): Promise<void> => {
    const previous = settings.automation.autoFansContinue;
    settings.automation.autoFansContinue = value;
    try {
      await settingsStore.save(settings);
      document.dispatchEvent(new Event("dwe-settings-changed"));
    } catch (error) {
      settings.automation.autoFansContinue = previous;
      throw error;
    }
  };
  let automationSummaries: AutomationSummary[] = [];
  const refreshAutomationSummaries = async (): Promise<void> => {
    const latest = new Map<string, AutomationSummary>();
    for (const item of (await automationAudit.list()).slice().reverse()) {
      if (!latest.has(item.taskId)) latest.set(item.taskId, {
        taskId: item.taskId,
        outcome: item.outcome,
        summary: item.summary,
        at: item.at,
      });
    }
    automationSummaries = [...latest.values()].slice(0, 12);
  };
  const exportSettings = (): void => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `douyu-web-enhancer-settings-v${settings.schemaVersion}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const downloadAutomationAudit = async (): Promise<void> => {
    const blob = new Blob([JSON.stringify(await automationAudit.list(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "douyu-web-enhancer-automation-audit.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const clearAutomationAudit = async (): Promise<void> => {
    await automationAudit.clear();
    await refreshAutomationSummaries();
    document.dispatchEvent(new Event("dwe-settings-changed"));
  };
  const controlCenter = mountControlCenter({
    document,
    model: () => ({
      version: packageJson.version,
      settings,
      diagnostics: diagnostics.snapshot(packageJson.version, location.href).features,
      runtime,
      automation: automationSummaries,
      danmakuObservations: danmakuObservations.events(),
      userBlocking,
      currentRoomId: currentRoomId(),
      onSetUserBlockingEnabled: (enabled) => mutateUserBlocking((state) => ({ ...state, enabled })),
      onAddUserBlockRule: (uid, roomId) => mutateUserBlocking((state) => addUserBlockRule(state, uid, roomId)),
      onRemoveUserBlockRule: (uid, roomId) => mutateUserBlocking((state) => removeUserBlockRule(state, uid, roomId)),
      onToggleFeature: toggleFeature,
      onSetAutoWebFullscreen: saveAutoWebFullscreen,
      onSetAutoFansRoomId: saveAutoFansRoomId,
      onSetAutoFansEnabled: saveAutoFansEnabled,
      onApplySettingsSnapshot: applySettingsSnapshot,
      onRestoreDefaultSettings: () => applySettingsSnapshot(DEFAULT_SETTINGS),
      onCopyDiagnostics: () => GM_setClipboard(JSON.stringify(diagnostics.snapshot(packageJson.version, location.href), null, 2), "text/plain"),
      onCopyAutomationAudit: async () => GM_setClipboard(JSON.stringify(await automationAudit.list(), null, 2), "text/plain"),
      onDownloadAutomationAudit: downloadAutomationAudit,
      onClearAutomationAudit: clearAutomationAudit,
      onExportSettings: exportSettings,
      onExportDanmakuObservations: () => danmakuObservations.exportJson(),
      onImportDanmakuObservations: (serialized) => danmakuObservations.importJson(serialized),
      onSetDanmakuObservationTag: (id, tag, enabled) => danmakuObservations.setTag(id, tag, enabled),
      onSetDanmakuObservationNote: (id, note) => danmakuObservations.setNote(id, note),
      onRemoveDanmakuObservation: (id) => danmakuObservations.remove(id),
    }),
    onOpened: () => { void refreshAutomationSummaries().then(() => refreshControlCenter()); },
  });
  const refreshControlCenter = (): void => {
    document.querySelector<HTMLElement>("douyu-web-enhancer-control-center")?.dispatchEvent(new Event("dwe-control-center-refresh"));
  };
  const stopDiagnosticsSubscription = diagnostics.subscribe(refreshControlCenter);
  const stopRuntimeSubscription = runtime.subscribe(refreshControlCenter);
  const stopDanmakuObservationsSubscription = danmakuObservations.subscribe(refreshControlCenter);
  // Chat mutations can be frequent. They may change an open drawer's geometry,
  // but must never rebuild its complete Lit model unless an actual state event fires.
  const stopControlCenterObserver = observerHub.subscribe(
    controlCenter.refreshGeometryWhenOpen,
  );
  document.addEventListener("dwe-settings-changed", refreshControlCenter);
  const syncSettingsOnFocus = () => { void syncSettingsFromStore().catch((error: unknown) => console.error("[douyu-web-enhancer] 设置同步失败", error)); };
  const syncUserBlockingOnFocus = () => {
    void userBlockingWrite.then(() => GM_getValue(USER_BLOCKING_KEY, null)).then((stored: unknown) => {
      const next = normalizeUserBlockingState(stored);
      if (JSON.stringify(next) === JSON.stringify(userBlocking)) return;
      userBlocking = next;
      syncUserBlockFilter();
      document.dispatchEvent(new Event("dwe-settings-changed"));
    }).catch((error: unknown) => console.error("[douyu-web-enhancer] 用户屏蔽规则同步失败", error));
  };
  const syncSettingsOnVisibility = () => {
    if (document.visibilityState === "visible") { syncSettingsOnFocus(); syncUserBlockingOnFocus(); }
  };
  document.addEventListener("visibilitychange", syncSettingsOnVisibility);
  document.defaultView?.addEventListener("focus", syncSettingsOnFocus);
  document.defaultView?.addEventListener("focus", syncUserBlockingOnFocus);

  GM_registerMenuCommand("复制诊断信息", () => {
    GM_setClipboard(
      JSON.stringify(
        diagnostics.snapshot(packageJson.version, location.href),
        null,
        2,
      ),
      "text/plain",
    );
  });

  GM_registerMenuCommand("复制自动化日志", async () => {
    GM_setClipboard(
      JSON.stringify(await automationAudit.list(), null, 2),
      "text/plain",
    );
  });

  Object.defineProperty(globalThis, "__douyuWebEnhancer", {
    configurable: true,
    value: {
      diagnostics: () =>
        diagnostics.snapshot(packageJson.version, location.href),
      runtime,
    },
  });

  addEventListener(
    "pagehide",
    () => {
      runtime.destroy();
      removeControls();
      document.removeEventListener("dwe-settings-changed", refreshControlCenter);
      document.removeEventListener("visibilitychange", syncSettingsOnVisibility);
      document.defaultView?.removeEventListener("focus", syncSettingsOnFocus);
      document.defaultView?.removeEventListener("focus", syncUserBlockingOnFocus);
      stopControlCenterObserver();
      stopRuntimeSubscription();
      stopDiagnosticsSubscription();
      stopDanmakuObservationsSubscription();
      stopDanmakuAvailabilityDiagnostics();
      stopPageSocketDiagnostics();
      stopUserBlockDiagnostics();
      controlCenter.dispose();
      observerHub.destroy();
      styles.destroy();
    },
    { once: true },
  );
}

void start().catch((error: unknown) => {
  console.error("[douyu-web-enhancer] 启动失败", error);
});
