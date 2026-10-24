import { RoomAudience } from "./core/room-messages.ts";
import { RoomEvents, ROOM_EVENTS_OPTIONS_KEY, parseRoomEventOptions, createRoomEventPersistence } from "./features/room-events.ts";
import {
  GM,
  GM_getValue,
  GM_registerMenuCommand,
  GM_setClipboard,
  GM_setValue,
  GM_xmlhttpRequest,
} from "$";
import packageJson from "../package.json";
import { mountChatSpeedPlaceholder } from "./features/chat-speed-placeholder.ts";
import { mountDanmakuTailShortcut } from "./ui/danmaku-tail-shortcut.ts";
import { ACTIVITY_LINK_CLEANUP_ID, createActivityLinkCleanupFeature } from "./features/activity-link-cleanup.ts";
import { FLOATING_HEAD_CLEANUP_ID, floatingHeadCleanupFeature } from "./features/floating-head-cleanup.ts";
import { ActivityCleanupStats, createBrowserActivityCleanupPersistence } from "./features/activity-cleanup-stats.ts";
import { ActivityFilterReview } from "./features/activity-filter-review.ts";
import { DANMAKU_TAIL_KEY, normalizeDanmakuTail, rewriteOutgoingChatTail, validateDanmakuTail, type DanmakuTailConfig } from "./core/outgoing-chat-tail.ts";

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
import { DEFAULT_SETTINGS, type ControlCenterEdgeSide, type Settings, SettingsStore } from "./core/settings.ts";
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
  changeUserBlockRuleFromShortcut,
  normalizeUserBlockingState,
  removeUserBlockRule,
  shouldBlockUser,
  shouldBlockUserEntry,
  USER_BLOCKING_ID,
  USER_BLOCKING_KEY,
  type UserBlockingState,
} from "./features/user-blocking.ts";
import { mountUserBlockShortcuts } from "./features/user-block-shortcuts.ts";
import { USER_FOLLOWING_KEY, normalizeUserFollowingState, changeUserFollow, followHistoryRules, selectFollowedMessages, shouldRemindUser, ChatSpeedWindow, type UserFollowingState } from "./features/user-following.ts";
import { lookupDouyuUser } from "./features/user-lookup.ts";
import { OfficialFollowSync, OFFICIAL_FOLLOW_SYNC_KEY, currentFollowAccountUid, effectiveFollowUids } from './features/official-follow-sync.ts';
import { UserFollowReminders } from "./features/user-follow-reminders.ts";
import { UserBlockHistory, createBrowserUserBlockHistoryPersistence } from "./features/user-block-history.ts";
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
const roomAudience = new RoomAudience();
const audienceRoomId = (): string | null => /^\/([1-9]\d{0,11})$/.exec(document.defaultView?.location.pathname ?? "")?.[1] ?? null;
const stopRoomAudience = pageSocketHook.observeRoomMessages(packets => roomAudience.record(packets, audienceRoomId()));
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
          : snapshot.filterEnabled ? "正在按已开启的规则过滤页面消息" : "正在只读观察斗鱼页面 WebSocket",
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
  let danmakuTail = normalizeDanmakuTail(await GM_getValue(DANMAKU_TAIL_KEY, null));
  let tailShortcut: ReturnType<typeof mountDanmakuTailShortcut> | undefined;
  const applyDanmakuTail = (): void => {
    pageSocketHook.setOutgoingChatTransform(danmakuTail.enabled ? data => rewriteOutgoingChatTail(data, danmakuTail) : null);
    diagnostics.update("danmaku-tail", danmakuTail.enabled ? "active" : "disabled", {
      detail: danmakuTail.enabled ? `已在页面发送前添加${danmakuTail.position === "prefix" ? "前缀" : "后缀"}` : "已关闭；原生发送保持不变",
    });
  };
  applyDanmakuTail();
  let danmakuTailWrite = Promise.resolve();
  const saveDanmakuTail = (candidate: DanmakuTailConfig): Promise<void> => {
    const next = normalizeDanmakuTail(candidate);
    const error = validateDanmakuTail(candidate);
    if (error) return Promise.reject(new Error(error));
    const run = danmakuTailWrite.then(async () => {
      await GM_setValue(DANMAKU_TAIL_KEY, next);
      danmakuTail = next;
      applyDanmakuTail();
      tailShortcut?.refresh();
      document.dispatchEvent(new Event("dwe-settings-changed"));
    });
    danmakuTailWrite = run.catch(() => undefined);
    return run;
  };
  let userBlocking = normalizeUserBlockingState(await GM_getValue(USER_BLOCKING_KEY, null));
  const userBlockHistory = new UserBlockHistory(createBrowserUserBlockHistoryPersistence(document.defaultView));
  await userBlockHistory.setRules(userBlocking.rules);
  const currentRoomId = (): string | null => /^\/([1-9]\d{0,11})$/.exec(document.defaultView?.location.pathname ?? "")?.[1] ?? null;
  const activityCleanupStats = new ActivityCleanupStats(createBrowserActivityCleanupPersistence(document.defaultView), currentRoomId);
  await activityCleanupStats.load();
  const activityFilterReview = new ActivityFilterReview(document.defaultView);
  await activityFilterReview.load();
  const savedUserFollowing = await GM_getValue(USER_FOLLOWING_KEY, null);
  let manualUserFollowing = normalizeUserFollowingState(savedUserFollowing);
  let userFollowing = manualUserFollowing;
  let officialFollowSync: OfficialFollowSync | undefined;
  const readFollowOwner = () => currentFollowAccountUid(document.cookie);
  const effectiveFollowing = (): UserFollowingState => ({ ...manualUserFollowing, uids: officialFollowSync ? effectiveFollowUids(manualUserFollowing.uids, officialFollowSync.state, readFollowOwner()) : manualUserFollowing.uids });
  const userFollowHistory = new UserBlockHistory(createBrowserUserBlockHistoryPersistence(document.defaultView, "douyu-web-enhancer:user-follow-history", 50), 50);
  await userFollowHistory.setRules(followHistoryRules(userFollowing));
  const chatSpeed = new ChatSpeedWindow();
  const followReminders = new UserFollowReminders(document, () => document.dispatchEvent(new Event("dwe-settings-changed")));
  let roomEventOptions = parseRoomEventOptions(await GM_getValue(ROOM_EVENTS_OPTIONS_KEY, null));
  const eventReminders = followReminders;
  const roomEvents = new RoomEvents(createRoomEventPersistence(document.defaultView), () => document.dispatchEvent(new Event("dwe-settings-changed")));
  await roomEvents.load();
  const showRoomEvent = (event: import("./core/room-messages.ts").RoomEvent): void => eventReminders.record({uid:"room-event", roomId:event.roomId, nickname:event.title, text:event.text, kind:"chatmsg"}, document.querySelector(".Title-anchorName")?.textContent ?? "", true, "房间事件", event.kind === "preview");
  const stopRoomEvents = pageSocketHook.observeRoomMessages(packets => roomEvents.observe(packets,currentRoomId(),roomEventOptions,showRoomEvent));
  let roomEventOptionsWrite = Promise.resolve();
  const setRoomEventOption = (option: "record" | "remind", enabled: boolean): Promise<void> => {
    const run = roomEventOptionsWrite.then(async () => {
      const next = {...roomEventOptions, [option]:enabled};
      await GM_setValue(ROOM_EVENTS_OPTIONS_KEY,next); roomEventOptions=next;
      if (!next.remind) eventReminders.clear(true);
      document.dispatchEvent(new Event("dwe-settings-changed"));
    });
    roomEventOptionsWrite=run.catch(()=>undefined); return run;
  };
  followReminders.center.inbox.migrateFollowDefaults({chatmsg:savedUserFollowing === null || manualUserFollowing.chatReminders,uenter:savedUserFollowing === null || manualUserFollowing.entryReminders,dgb:savedUserFollowing === null || manualUserFollowing.giftReminders});
  const reminderFollowing = (): UserFollowingState => ({...effectiveFollowing(),
    chatReminders:followReminders.center.inbox.followsKind("chatmsg"),
    entryReminders:followReminders.center.inbox.followsKind("uenter"),
    giftReminders:followReminders.center.inbox.followsKind("dgb")});
  let panelOpen = false;
  let speedTimer: ReturnType<typeof setInterval> | undefined;
  let stopUserMessageObserver: () => void = () => undefined;
  const syncFollowingObserver = (): void => {
    userFollowing = reminderFollowing();
    stopUserMessageObserver();
    chatSpeed.configure(userFollowing.speedEnabled, currentRoomId());
    followReminders.sync(userFollowing.uids, userFollowing.chatReminders || userFollowing.entryReminders || userFollowing.giftReminders);
    if (!userFollowing.speedEnabled && (!userFollowing.uids.length || (!userFollowing.chatsEnabled && !userFollowing.entriesEnabled && !userFollowing.giftsEnabled && !userFollowing.chatReminders && !userFollowing.entryReminders && !userFollowing.giftReminders))) return;
    stopUserMessageObserver = pageSocketHook.observeUserMessages((messages) => {
      rememberHistoryRoom();
      chatSpeed.configure(userFollowing.speedEnabled, currentRoomId());
      chatSpeed.record(messages);
      const activeFollowing = reminderFollowing();
      const followed = selectFollowedMessages(activeFollowing, currentRoomId(), messages);
      userFollowHistory.record(followed);
      for (const message of followed) followReminders.record(message, userFollowHistory.roomName(message.roomId), shouldRemindUser(activeFollowing, message));
    });
  };
  let userFollowingWrite: Promise<void> = Promise.resolve();
  const mutateUserFollowing = (change: (state: UserFollowingState) => UserFollowingState): Promise<void> => {
    const run = userFollowingWrite.then(async () => {
      const next = normalizeUserFollowingState(change(manualUserFollowing));
      if (JSON.stringify(next) === JSON.stringify(manualUserFollowing)) return;
      await GM_setValue(USER_FOLLOWING_KEY, next);
      manualUserFollowing = next;
      userFollowing = effectiveFollowing();
      await userFollowHistory.setRules(followHistoryRules(userFollowing));
      syncFollowingObserver(); updateSpeedTicker();
      document.dispatchEvent(new Event("dwe-settings-changed"));
    });
    userFollowingWrite = run.catch(() => undefined);
    return run;
  };
  syncFollowingObserver();
  const updateUserBlockDiagnostics = (): void => {
    const hook = pageSocketHook.snapshot();
    const roomId = currentRoomId();
    const applicableRuleCount = roomId === null ? 0
      : userBlocking.rules.filter((rule) => rule.roomId === null || rule.roomId === roomId).length;
    diagnostics.update(USER_BLOCKING_ID,
      !(userBlocking.enabled || userBlocking.entriesEnabled) ? "disabled"
        : !hook.installed || hook.filterErrors > 0 ? "degraded"
          : applicableRuleCount === 0 ? "waiting" : "active",
      {
        detail: !(userBlocking.enabled || userBlocking.entriesEnabled) ? "本地屏蔽已关闭"
          : !hook.installed ? "页面 Socket Hook 不可用，原生弹幕照常显示"
            : userBlocking.rules.length === 0 ? "等待添加 UID 规则"
              : roomId === null ? "仅数字直播间生效"
                : applicableRuleCount === 0 ? "当前房间没有适用规则"
                  : `当前房间有 ${applicableRuleCount} 条适用规则；仅影响之后到达且已开启的消息类型`,
        data: {
          ruleCount: userBlocking.rules.length,
          applicableRuleCount,
          filteredMessages: hook.filteredMessages,
          filteredEntryMessages: hook.filteredEntryMessages,
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
      : null, (messages) => userBlockHistory.record(messages),
      userBlocking.entriesEnabled && userBlocking.rules.length > 0
        ? (uid, roomId) => shouldBlockUserEntry(userBlocking, currentRoomId(), uid, roomId) : null);
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
      await userBlockHistory.setRules(next.rules);
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
  officialFollowSync = new OfficialFollowSync({
    request, owner: readFollowOwner, manual: () => manualUserFollowing.uids,
    read: async () => GM_getValue(OFFICIAL_FOLLOW_SYNC_KEY, null), write: async state => { await GM_setValue(OFFICIAL_FOLLOW_SYNC_KEY, state); },
    lock: async action => {
      if (!navigator.locks) throw new Error('浏览器不支持安全同步锁，原名单保留');
      return navigator.locks.request('douyu-web-enhancer:official-follow-sync', action);
    },
    changed: async () => {
      userFollowing = effectiveFollowing();
      await userFollowHistory.setRules(followHistoryRules(userFollowing));
      for (const user of officialFollowSync?.account()?.users ?? []) userFollowHistory.rememberNickname(user.uid, user.nickname);
      syncFollowingObserver(); updateSpeedTicker();
      document.dispatchEvent(new Event('dwe-settings-changed'));
    },
  });
  await officialFollowSync.reload();
  userFollowing = effectiveFollowing();
  await userFollowHistory.setRules(followHistoryRules(userFollowing));
  syncFollowingObserver();
  const chatMemoryStore = new ChatMemoryStore(
    await GM_getValue(CHAT_MEMORY_KEY, null),
    GM_setValue,
  );
  const runtime = new FeatureRuntime(
    { diagnostics, document, observerHub, root, selectors, styles },
    [
      chatDecorationCleanupFeature,
      createActivityLinkCleanupFeature(activityCleanupStats, currentRoomId, pageSocketHook, activityFilterReview),
      floatingHeadCleanupFeature,
      createChatMemoryFeature(chatMemoryStore, pageSocketHook),
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
      createRoomMetricsFeature(() => roomAudience.snapshot(currentRoomId(), pageSocketHook.snapshot().openConnections > 0)),
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
      id: ACTIVITY_LINK_CLEANUP_ID,
      setting: "activityLinkCleanup",
    },
    {
      id: FLOATING_HEAD_CLEANUP_ID,
      setting: "floatingHeadCleanup",
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
  const removeUserBlockShortcuts = mountUserBlockShortcuts({
    document,
    observerHub,
    styles,
    getRoomId: currentRoomId,
    getState: () => userBlocking,
    getFollowingState: () => userFollowing,
    setFollowing: async (uid, add, nickname) => {
      await officialFollowSync!.exclude(uid, !add);
      await mutateUserFollowing(state => changeUserFollow(state, uid, add));
      if (add) userFollowHistory.rememberNickname(uid, nickname);
      rememberHistoryRoom();
      await userFollowHistory.flush();
      document.dispatchEvent(new Event("dwe-settings-changed"));
    },
    setRule: async (uid, roomId, add, nickname) => {
      await mutateUserBlocking((state) => changeUserBlockRuleFromShortcut(state, uid, roomId, add));
      if (add && nickname) userBlockHistory.rememberNickname(uid, nickname);
      rememberHistoryRoom();
      await userBlockHistory.flush();
      document.dispatchEvent(new Event("dwe-settings-changed"));
    },
  });
  function rememberHistoryRoom(): void {
    chatSpeed.configure(userFollowing.speedEnabled, currentRoomId());
    if (!userBlocking.rules.length && !userFollowing.uids.length) return;
    const name = document.querySelector<HTMLElement>('h3[class^="anchorName__"]')?.textContent?.trim() ?? "";
    if (userBlocking.rules.length) userBlockHistory.rememberRoom(currentRoomId(), name);
    if (userFollowing.uids.length) userFollowHistory.rememberRoom(currentRoomId(), name);
  }
  const stopHistoryRoomObserver = observerHub.subscribe(rememberHistoryRoom);
  rememberHistoryRoom();

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
  const saveControlCenterEdgeSide = async (value: ControlCenterEdgeSide): Promise<void> => {
    const previous = settings.preferences.controlCenterEdgeSide;
    settings.preferences.controlCenterEdgeSide = value;
    try {
      await settingsStore.save(settings);
      document.dispatchEvent(new Event("dwe-settings-changed"));
    } catch (error) {
      settings.preferences.controlCenterEdgeSide = previous;
      throw error;
    }
  };
  const saveControlCenterEdgeY = async (value: number): Promise<void> => {
    const previous = settings.preferences.controlCenterEdgeY;
    settings.preferences.controlCenterEdgeY = Math.max(0, Math.min(1, value));
    try {
      await settingsStore.save(settings);
      document.dispatchEvent(new Event("dwe-settings-changed"));
    } catch (error) { settings.preferences.controlCenterEdgeY = previous; throw error; }
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
      danmakuTail,
      onSaveDanmakuTail: saveDanmakuTail,
      diagnostics: diagnostics.snapshot(packageJson.version, location.href).features,
      runtime,
      automation: automationSummaries,
      danmakuObservations: danmakuObservations.events(),
      userBlocking,
      userBlockHistory: userBlockHistory.snapshot(),
      userBlockHistoryStatus: userBlockHistory.status,
      userFollowing,
      roomEventOptions,
      roomEventEntries: roomEvents.entries,
      roomEventStatus: roomEvents.status,
      onSetRoomEventOption: setRoomEventOption,
      onPreviewRoomEvent: () => showRoomEvent({roomId:currentRoomId() ?? "0",at:Date.now(),kind:"preview",title:"房间事件提醒预览",text:"这是提醒样式预览，不是真实事件，也不会写入日志。",verified:true}),
      officialFollowSync: officialFollowSync!.view(),
      userFollowSource: uid => {
        const manual = manualUserFollowing.uids.includes(uid);
        const official = officialFollowSync!.state.enabled && officialFollowSync!.account()?.users.some(user => user.uid === uid) && !officialFollowSync!.account()?.excluded.includes(uid);
        return manual && official ? '手动 + 官方同步' : official ? '官方同步' : '手动关注';
      },
      onSetOfficialFollowSync: enabled => officialFollowSync!.setEnabled(enabled),
      onCheckOfficialFollows: () => officialFollowSync!.check(),
      onApplyOfficialFollows: async () => { await officialFollowSync!.apply(); await mutateUserFollowing(state => ({ ...state, chatsEnabled: true })); },
      onCancelOfficialPreview: () => { officialFollowSync!.discard(); document.dispatchEvent(new Event('dwe-settings-changed')); },
      onRestoreOfficialExclusions: () => officialFollowSync!.restoreExcluded(),
      userFollowHistory: userFollowHistory.snapshot(),
      userFollowHistoryStatus: userFollowHistory.status,
      activityCleanupStats: activityCleanupStats.snapshot(),
      activityCleanupStatsStatus: activityCleanupStats.status,
      activityFilterRecords: activityFilterReview.snapshot(),
      activityFilterReviewStatus: activityFilterReview.status,
      userFollowRoomName: (roomId) => userFollowHistory.roomName(roomId),
      chatSpeed: chatSpeed.snapshot(),
      onSetFollowingOption: (option, value) => mutateUserFollowing(state => ({ ...state, [option]: value })),
      onRemoveUserFollow: async (uid) => { await officialFollowSync!.exclude(uid, true); await mutateUserFollowing(state => changeUserFollow(state, uid, false)); },
      onLookupUser: (input) => lookupDouyuUser(input, request),
      notificationRecords: followReminders.center.inbox.snapshot(),
      notificationUnread: followReminders.center.inbox.unread(),
      notificationStatus: followReminders.center.inbox.status,
      followUnreadOverrides: followReminders.center.inbox.followOverrides,
      onSetFollowUnread: (uid, kind, enabled) => { followReminders.center.inbox.setFollowUnread(uid, kind, enabled); syncFollowingObserver(); },
      followNoticeDefaults: followReminders.center.inbox.followDefaults,
      onSetFollowDefault: (kind, mode) => { followReminders.center.inbox.setFollowDefault(kind, mode); syncFollowingObserver(); },
      onResetFollowUnread: (uid) => { followReminders.center.inbox.resetFollowUnread(uid); syncFollowingObserver(); },
      notificationPreferences: followReminders.center.inbox.preferences,
      onSetNotificationUnread: (source, enabled) => followReminders.center.inbox.setRetainUnread(source, enabled),
      onReadVisibleNotifications: (ids) => followReminders.center.inbox.markManyRead(ids),
      onReadAllNotifications: (source) => followReminders.center.inbox.markAllRead(source),
      onReadNotification: (id) => followReminders.center.inbox.markRead(id),
      userFollowUnread: (uid) => followReminders.unread(uid),
      onReadUserFollow: (uid) => followReminders.markRead(uid),
      onAddVerifiedUserFollow: async (user) => {
        await officialFollowSync!.exclude(user.uid, false);
        await mutateUserFollowing(state => changeUserFollow(state, user.uid, true));
        userFollowHistory.rememberNickname(user.uid, user.nickname);
        document.dispatchEvent(new Event("dwe-settings-changed"));
      },
      userBlockRoomName: (roomId) => userBlockHistory.roomName(roomId),
      currentRoomId: currentRoomId(),
      onSetUserBlockingEnabled: (enabled) => mutateUserBlocking((state) => ({ ...state, enabled })),
      onSetUserEntryBlockingEnabled: (entriesEnabled) => mutateUserBlocking((state) => ({ ...state, entriesEnabled })),
      onClearUserBlockHistory: (uid) => userBlockHistory.clear(uid),
      onAddVerifiedUserBlock: async (user, roomId) => {
        rememberHistoryRoom();
        await mutateUserBlocking(state => changeUserBlockRuleFromShortcut(state, user.uid, roomId, true));
        userBlockHistory.rememberNickname(user.uid, user.nickname);
        document.dispatchEvent(new Event("dwe-settings-changed"));
      },
      onRemoveUserBlockRule: (uid, roomId) => mutateUserBlocking((state) => removeUserBlockRule(state, uid, roomId)),
      onToggleFeature: toggleFeature,
      onSetAutoWebFullscreen: saveAutoWebFullscreen,
      onSetControlCenterEdgeSide: saveControlCenterEdgeSide,
      onSetControlCenterEdgeY: saveControlCenterEdgeY,
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
    onOpened: () => {
      void roomEvents.flush();
      void Promise.all([refreshAutomationSummaries(), userBlockHistory.setRules(userBlocking.rules), userFollowHistory.setRules(followHistoryRules(userFollowing))]).then(() => {
        rememberHistoryRoom();
        refreshControlCenter();
      });
    },
    onOpenChange: (open) => { panelOpen = open; updateSpeedTicker(); },
  });
  tailShortcut = mountDanmakuTailShortcut({ document, observerHub, enabled: () => danmakuTail.enabled, open: () => controlCenter.showDanmakuSettings() });
  const refreshControlCenter = (): void => {
    document.querySelector<HTMLElement>("douyu-web-enhancer-control-center")?.dispatchEvent(new Event("dwe-control-center-refresh"));
  };
  const speedPlaceholder = mountChatSpeedPlaceholder(document, observerHub, () => {
    chatSpeed.configure(userFollowing.speedEnabled, currentRoomId());
    return chatSpeed.snapshot();
  });
  function updateSpeedTicker(): void {
    if (speedTimer !== undefined) { clearInterval(speedTimer); speedTimer = undefined; }
    speedPlaceholder.refresh();
    if (userFollowing.speedEnabled && document.visibilityState !== "hidden") speedTimer = setInterval(() => {
      speedPlaceholder.refresh();
      if (panelOpen) refreshControlCenter();
    }, 1000);
  }
  updateSpeedTicker();
  const stopDiagnosticsSubscription = diagnostics.subscribe(refreshControlCenter);
  const stopRuntimeSubscription = runtime.subscribe(refreshControlCenter);
  const stopDanmakuObservationsSubscription = danmakuObservations.subscribe(refreshControlCenter);
  const stopUserBlockHistorySubscription = userBlockHistory.subscribe(refreshControlCenter);
  const stopUserFollowHistorySubscription = userFollowHistory.subscribe(refreshControlCenter);
  const stopActivityCleanupStatsSubscription = activityCleanupStats.subscribe(() => { if (panelOpen) refreshControlCenter(); });
  const stopActivityFilterReviewSubscription = activityFilterReview.subscribe(() => { if (panelOpen) refreshControlCenter(); });
  // Chat mutations can be frequent. They may change an open drawer's geometry,
  // but must never rebuild its complete Lit model unless an actual state event fires.
  const stopControlCenterObserver = observerHub.subscribe(
    controlCenter.refreshGeometryWhenOpen,
  );
  document.addEventListener("dwe-settings-changed", refreshControlCenter);
  const syncSettingsOnFocus = () => { void syncSettingsFromStore().catch((error: unknown) => console.error("[douyu-web-enhancer] 设置同步失败", error)); };
  const syncDanmakuTailOnFocus = () => {
    void danmakuTailWrite.then(() => GM_getValue(DANMAKU_TAIL_KEY, null)).then((stored: unknown) => {
      const next = normalizeDanmakuTail(stored);
      if (JSON.stringify(next) === JSON.stringify(danmakuTail)) return;
      danmakuTail = next;
      applyDanmakuTail();
      tailShortcut?.refresh();
      document.dispatchEvent(new Event("dwe-settings-changed"));
    }).catch(() => undefined);
  };
  const syncUserFollowingOnFocus = () => {
    void userFollowingWrite.then(() => GM_getValue(USER_FOLLOWING_KEY, null)).then(async (stored: unknown) => {
      manualUserFollowing = normalizeUserFollowingState(stored);
      await officialFollowSync!.reload();
      userFollowing = effectiveFollowing();
      await userFollowHistory.setRules(followHistoryRules(userFollowing));
      syncFollowingObserver(); rememberHistoryRoom(); updateSpeedTicker();
      document.dispatchEvent(new Event("dwe-settings-changed"));
      void officialFollowSync!.check(true);
    }).catch(() => undefined);
  };
  const syncUserBlockingOnFocus = () => {
    void userBlockingWrite.then(() => GM_getValue(USER_BLOCKING_KEY, null)).then(async (stored: unknown) => {
      const next = normalizeUserBlockingState(stored);
      const changed = JSON.stringify(next) !== JSON.stringify(userBlocking);
      userBlocking = next;
      await userBlockHistory.setRules(next.rules);
      if (changed) syncUserBlockFilter();
      rememberHistoryRoom();
      document.dispatchEvent(new Event("dwe-settings-changed"));
    }).catch((error: unknown) => console.error("[douyu-web-enhancer] 用户屏蔽规则同步失败", error));
  };
  const syncSettingsOnVisibility = () => {
    if (document.visibilityState === "visible") { syncSettingsOnFocus(); syncDanmakuTailOnFocus(); syncUserBlockingOnFocus(); syncUserFollowingOnFocus(); }
    else { void userBlockHistory.flush(); void userFollowHistory.flush(); void activityCleanupStats.flush(); }
    updateSpeedTicker();
  };
  document.addEventListener("visibilitychange", syncSettingsOnVisibility);
  document.defaultView?.addEventListener("focus", syncSettingsOnFocus);
  document.defaultView?.addEventListener("focus", syncDanmakuTailOnFocus);
  document.defaultView?.addEventListener("focus", syncUserBlockingOnFocus);
  document.defaultView?.addEventListener("focus", syncUserFollowingOnFocus);

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
      removeUserBlockShortcuts();
      stopHistoryRoomObserver();
      stopUserBlockHistorySubscription();
      stopUserFollowHistorySubscription();
      stopActivityCleanupStatsSubscription();
      stopActivityFilterReviewSubscription();
      void activityCleanupStats.flush().finally(() => activityCleanupStats.dispose());
      stopUserMessageObserver();
      if (speedTimer !== undefined) clearInterval(speedTimer);
      speedPlaceholder.dispose();
      void userFollowHistory.flush().finally(() => userFollowHistory.dispose());
      followReminders.dispose();
      stopRoomEvents(); stopRoomAudience();
      void roomEvents.flush().finally(()=>roomEvents.dispose());
      void userBlockHistory.flush().finally(() => userBlockHistory.dispose());
      document.removeEventListener("dwe-settings-changed", refreshControlCenter);
      tailShortcut?.dispose();
      document.removeEventListener("visibilitychange", syncSettingsOnVisibility);
      document.defaultView?.removeEventListener("focus", syncSettingsOnFocus);
      document.defaultView?.removeEventListener("focus", syncDanmakuTailOnFocus);
      document.defaultView?.removeEventListener("focus", syncUserBlockingOnFocus);
      document.defaultView?.removeEventListener("focus", syncUserFollowingOnFocus);
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
  void officialFollowSync.check(true);
}

void start().catch((error: unknown) => {
  console.error("[douyu-web-enhancer] 启动失败", error);
});
