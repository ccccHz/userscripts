import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { Diagnostics } from "../packages/douyu-web-enhancer/src/core/diagnostics.ts";
import { FeatureRuntime } from "../packages/douyu-web-enhancer/src/core/feature.ts";
import {
  applyPersistedFeatureSettings,
  saveAndApplySettingsSnapshot,
  togglePersistedFeature,
} from "../packages/douyu-web-enhancer/src/core/feature-settings.ts";
import { ObserverHub } from "../packages/douyu-web-enhancer/src/core/observer-hub.ts";
import { SelectorRegistry } from "../packages/douyu-web-enhancer/src/core/selectors.ts";
import {
  DEFAULT_SETTINGS,
  diffSettings,
  parseSettingsImport,
  SETTINGS_KEY,
  SettingsStore,
} from "../packages/douyu-web-enhancer/src/core/settings.ts";
import {
  AUTOMATION_AUDIT_KEY,
  AUTOMATION_TASK_KEY_PREFIX,
  AutomationAuditLog,
  AutomationTaskStore,
  DailyAutomationRunner,
  acquireAutomationLease,
  localDay,
  releaseAutomationLease,
} from "../packages/douyu-web-enhancer/src/core/automation.ts";
import {
  DAILY_AUTOMATION_ID,
  FIXED_TASK_ROOM_ID,
  FOLLOW_RESTORE_KEY,
  LevelTaskClaimScheduler,
  LEVEL_TASK_SCHEDULER_DIAGNOSTIC_ID,
  claimLevelTasks,
  createDouyuDailyTasks,
  createDouyuToken,
  currentAutomationRoomId,
  hasVerifiedSuccess,
} from "../packages/douyu-web-enhancer/src/features/daily-automation.ts";
import {
  ChatHistoryNavigator,
  ChatMemoryStore,
  CHAT_MEMORY_KEY,
  CHAT_MEMORY_PER_ROOM_LIMIT,
  CHAT_MEMORY_ROOM_LIMIT,
  parseChatMemory,
  shouldTakeOverHistoryNavigation,
} from "../packages/douyu-web-enhancer/src/features/chat-memory.ts";
import {
  DanmakuSendObservationStore,
  createBrowserDanmakuSendObservationPersistence,
  DANMAKU_SEND_CHECK_TIMEOUT_MS,
  DANMAKU_SEND_CHECK_CSS,
  DANMAKU_SEND_OBSERVATIONS_FALLBACK_KEY,
  DANMAKU_SEND_OBSERVATIONS_KEY,
  DANMAKU_SEND_OBSERVATIONS_LIMIT,
  exportDanmakuSendObservations,
  parseDanmakuSendObservationImport,
  parseDanmakuSendObservations,
  resolveDouyuRoomId,
  emitConfirmedDanmaku,
} from "../packages/douyu-web-enhancer/src/features/danmaku-send-check.ts";
import { PendingChatSends } from "../packages/douyu-web-enhancer/src/core/chat-send-tracker.ts";
import {
  ANONYMOUS_DANMAKU_URLS,
  createAnonymousDanmakuConnection,
  decodeDouyuPackets,
  encodeDouyuPacket,
  parseDouyuStt,
} from "../packages/douyu-web-enhancer/src/core/anonymous-danmaku.ts";
import {
  CHAT_DECORATION_CLEANUP_ID,
  CHAT_DECORATION_CLEANUP_CSS,
  chatDecorationCleanupFeature,
} from "../packages/douyu-web-enhancer/src/features/chat-decoration-cleanup.ts";
import {
  CHAT_LAYOUT_ID,
  CHAT_LAYOUT_CSS,
  chatLayoutFeature,
} from "../packages/douyu-web-enhancer/src/features/chat-layout.ts";
import {
  TRANSIENT_GUIDANCE_CLEANUP_ID,
  TRANSIENT_GUIDANCE_CLEANUP_CSS,
  transientGuidanceCleanupFeature,
} from "../packages/douyu-web-enhancer/src/features/transient-guidance-cleanup.ts";
import {
  BAG_INFO_ID,
  BAG_INFO_CSS,
  backpackItemKey,
  calculateBackpackSummary,
  extractBackpackRoomId,
  formatBackpackExpiry,
  parseBackpackResponse,
  requestBackpackData,
} from "../packages/douyu-web-enhancer/src/features/bag-info.ts";
import {
  COMPACT_PLAYER_ID,
  COMPACT_PLAYER_CSS,
  COMPACT_PLAYER_TOOLBAR_HOST_ATTRIBUTE,
  compactPlayerFeature,
  compactPlayerSelectors,
} from "../packages/douyu-web-enhancer/src/features/compact-player.ts";
import {
  AUTO_WEB_FULLSCREEN_STATE_KEY,
  AUTO_WEB_FULLSCREEN_ID,
  createAutoWebFullscreenFeature,
  hasDouyuWebFullscreenIconSignature,
  autoWebFullscreenSelectors,
  createAutoWebFullscreenPreference,
  isAutoWebFullscreenUserScrollIntent,
  isDouyuNumericRoomPath,
} from "../packages/douyu-web-enhancer/src/features/auto-web-fullscreen.ts";
import {
  ROOM_METRICS_ID,
  ROOM_METRICS_CSS,
  encodeAggregatePayload,
  extractRoomId,
  formatDuration,
  metricsMarkup,
  parseAggregateResponse,
  parseBroadcastStatus,
  parseTodayWatch,
  requestAggregate,
} from "../packages/douyu-web-enhancer/src/features/room-metrics.ts";
import {
  VOLUME_WHEEL_STEP,
  applyVolumeStep,
  createVolumeWheelFeature,
  nextVolume,
  volumeDeltaForWheel,
} from "../packages/douyu-web-enhancer/src/features/volume-wheel.ts";
import {
  LIVE_TIMESHIFT_STEP_SECONDS,
  clampSeekTarget,
  isDouyuLiveRoomPage,
  readSeekableRanges,
  shouldIgnoreTimeshiftKey,
} from "../packages/douyu-web-enhancer/src/features/live-timeshift-controls.ts";
import {
  fallbackActionPresentation,
  isOfficialActionText,
  isDouyuLiveRoomPath,
  messageContextActionSelectors,
  replyText,
  sameMessageTarget,
  shouldInjectAction,
} from "../packages/douyu-web-enhancer/src/features/message-context-action-fallback.ts";
import {
  DISABLE_OFFLINE_JUMP_ID,
  DISABLE_OFFLINE_JUMP_INTERVAL_MS,
  DISABLE_OFFLINE_JUMP_SELECTOR,
  createDisableOfflineJumpFeature,
  isDouyuLiveRoomPage as isDisableOfflineJumpLiveRoomPage,
} from "../packages/douyu-web-enhancer/src/features/disable-offline-jump.ts";
import {
  installDanmakuAvailabilityHook,
  replacePlayerBarrage,
} from "../packages/douyu-web-enhancer/src/features/danmaku-availability.ts";
import {
  CHAT_CONTROL_DEFINITIONS,
  SIMPLIFIED_MODE_CONTROLS_CSS,
  simplifiedModeControlSelectors,
} from "../packages/douyu-web-enhancer/src/ui/simplified-mode-controls.ts";
import {
  createOpenOnlyGeometryRefresh,
  danmakuObservationEvidenceText,
  danmakuObservationResolutionText,
  filterDanmakuObservations,
  formatAutomationLocalTime,
  isControlCenterEdgePath,
  isPositiveRoomId,
  isPureVideoFullscreen,
  isVisibleChatPanel,
} from "../packages/douyu-web-enhancer/src/ui/control-center.ts";

function createDanmakuAvailabilityTarget() {
  class FakeNode {
    children = [];
    lastThis = null;
    lastArgs = null;
    returnToken = { kind: "return" };
    appendChild(...args) {
      this.lastThis = this;
      this.lastArgs = args;
      if (args[0]?.throwOnAppend) throw new Error("append failed");
      this.children.push(args[0]);
      return this.returnToken;
    }
    insertBefore(...args) {
      this.lastThis = this;
      this.lastArgs = args;
      if (args[0]?.throwOnInsert) throw new Error("insert failed");
      this.children.push(args[0]);
      return this.returnToken;
    }
  }
  class FakeXHR {
    constructor(url, text) {
      this.responseURL = url;
      this.text = text;
    }
  }
  Object.defineProperty(FakeXHR.prototype, "responseText", {
    configurable: true,
    get() {
      return this.text;
    },
  });
  return { Node: FakeNode, XMLHttpRequest: FakeXHR };
}

test("danmaku availability replaces only proven payloads and cleans reversible hooks", () => {
  const payload = String.raw`{"player_barrage":0,"player_barrage":0,"label":"player_barrage":0,"similar_player_barrage":0}`;
  const result = replacePlayerBarrage(payload);
  assert.equal(result.replacements, 2);
  assert.equal(result.text, String.raw`{"player_barrage":1,"player_barrage":1,"label":"player_barrage":0,"similar_player_barrage":0}`);
  assert.equal(result.observedEnabled, false);
  assert.equal(replacePlayerBarrage(String.raw`{"player_barrage":1}`).text, String.raw`{"player_barrage":1}`);
  assert.equal(replacePlayerBarrage(String.raw`{"label":"player_barrage":0}`).replacements, 0);
  assert.equal(replacePlayerBarrage(String.raw`{"player_barrage\":0}`).replacements, 1);

  const target = createDanmakuAvailabilityTarget();
  const hook = installDanmakuAvailabilityHook(target);
  const script = { tagName: "SCRIPT", src: "", textContent: String.raw`{"player_barrage":0}` };
  const parent = new target.Node();
  const appendResult = parent.appendChild(script);
  assert.equal(appendResult, parent.returnToken);
  assert.equal(parent.lastThis, parent);
  assert.deepEqual(parent.lastArgs, [script]);
  assert.equal(parent.children[0], script);
  assert.equal(script.textContent, String.raw`{"player_barrage":1}`);

  const secondScript = { nodeName: "script", src: "", textContent: String.raw`{"player_barrage":0}` };
  const reference = {};
  const insertResult = parent.insertBefore(secondScript, reference);
  assert.equal(insertResult, parent.returnToken);
  assert.deepEqual(parent.lastArgs, [secondScript, reference]);
  assert.equal(secondScript.textContent, String.raw`{"player_barrage":1}`);

  const externalScript = { tagName: "SCRIPT", src: "https://cdn.example/firstqueue.js", textContent: String.raw`{"player_barrage":0}` };
  parent.appendChild(externalScript);
  assert.equal(externalScript.textContent, String.raw`{"player_barrage":0}`);
  const div = { tagName: "DIV", textContent: String.raw`{"player_barrage":0}` };
  parent.appendChild(div);
  assert.equal(div.textContent, String.raw`{"player_barrage":0}`);

  const throwingScript = { tagName: "SCRIPT", src: "", textContent: String.raw`{"player_barrage":0}`, throwOnAppend: true };
  assert.throws(() => parent.appendChild(throwingScript), /append failed/);
  assert.equal(throwingScript.textContent, String.raw`{"player_barrage":0}`);
  const throwingInsertScript = { tagName: "SCRIPT", src: "", textContent: String.raw`{"player_barrage":0}`, throwOnInsert: true };
  assert.throws(() => parent.insertBefore(throwingInsertScript, reference), /insert failed/);
  assert.equal(throwingInsertScript.textContent, String.raw`{"player_barrage":0}`);

  const targetXhr = new target.XMLHttpRequest(
    "https://www.douyu.com/betard/123",
    String.raw`{"player_barrage":0,"player_barrage":1}`,
  );
  assert.equal(targetXhr.responseText, String.raw`{"player_barrage":1,"player_barrage":1}`);
  const nonTargetXhr = new target.XMLHttpRequest(
    "https://www.douyu.com/other",
    String.raw`{"player_barrage":0}`,
  );
  assert.equal(nonTargetXhr.responseText, String.raw`{"player_barrage":0}`);

  const duplicate = installDanmakuAvailabilityHook(target);
  assert.equal(duplicate.snapshot().inlineHooks, 2);
  duplicate.dispose();
  assert.equal(parent.appendChild(script), parent.returnToken);
  hook.dispose();
  assert.equal(hook.snapshot().installed, false);
  const cleanScript = { tagName: "SCRIPT", src: "", textContent: String.raw`{"player_barrage":0}` };
  assert.equal(parent.appendChild(cleanScript), parent.returnToken);
  assert.equal(cleanScript.textContent, String.raw`{"player_barrage":0}`);
  assert.equal(targetXhr.responseText, String.raw`{"player_barrage":0,"player_barrage":1}`);
});

test("danmaku availability safely degrades when descriptors are not configurable", () => {
  const target = createDanmakuAvailabilityTarget();
  Object.defineProperty(target.Node.prototype, "appendChild", { configurable: false });
  const hook = installDanmakuAvailabilityHook(target);
  const snapshot = hook.snapshot();
  assert.equal(snapshot.inlineHooks, 1);
  assert.equal(snapshot.responseHook, true);
  assert.equal(snapshot.degraded, 1);
  hook.dispose();
});

test("settings use safe defaults and retain supported values", async () => {
  const writes = [];
  const defaults = new SettingsStore(() => "invalid", (key, value) =>
    writes.push([key, value]),
  );
  assert.deepEqual(await defaults.load(), DEFAULT_SETTINGS);

  const configured = new SettingsStore(
    () => ({ schemaVersion: 99, features: { compactPlayer: false } }),
    (key, value) => writes.push([key, value]),
  );
  const settings = await configured.load();
  assert.equal(settings.schemaVersion, 6);
  assert.equal(settings.features.chatMemory, true);
  assert.equal(settings.features.danmakuSendCheck, true);
  assert.equal(settings.features.chatDecorationCleanup, true);
  assert.equal(settings.features.chatLayout, true);
  assert.equal(settings.features.transientGuidanceCleanup, true);
  assert.equal(settings.features.bagInfo, true);
  assert.equal(settings.features.compactPlayer, false);
  assert.equal(settings.features.roomMetrics, true);
  assert.equal(settings.features.volumeWheel, true);
  assert.equal(settings.features.liveTimeshiftControls, true);
  assert.equal(settings.features.dailyAutomation, false);
  assert.equal(settings.features.highestVideoQuality, false);
  assert.equal(settings.features.messageContextActionFallback, true);
  assert.equal(settings.features.disableOfflineJump, true);
  assert.equal(settings.preferences.autoWebFullscreen, true);
  assert.equal(settings.automation.autoFansRestRoomId, null);
  await configured.save(settings);
  assert.equal(writes.at(-1)[0], SETTINGS_KEY);

  const existingDailyEnabled = new SettingsStore(
    () => ({ features: { dailyAutomation: true } }),
    () => undefined,
  );
  assert.equal((await existingDailyEnabled.load()).features.dailyAutomation, true, "an existing user choice is never reset by the new-install default");
});

test("Settings JSON import is exact, strict, and reports every supported change", () => {
  const current = structuredClone(DEFAULT_SETTINGS);
  const imported = parseSettingsImport({
    schemaVersion: 6,
    features: {
      chatMemory: false,
      chatDecorationCleanup: false,
      chatLayout: false,
      transientGuidanceCleanup: false,
      bagInfo: false,
      compactPlayer: false,
      danmakuSendCheck: false,
      roomMetrics: false,
      volumeWheel: false,
      liveTimeshiftControls: false,
      dailyAutomation: true,
      highestVideoQuality: true,
      messageContextActionFallback: true,
      disableOfflineJump: false,
    },
    preferences: { autoWebFullscreen: false },
    automation: { autoFansRestRoomId: "52", autoFansContinue: false },
  });
  assert.deepEqual(imported, {
    schemaVersion: 6,
    features: {
      chatMemory: false,
      chatDecorationCleanup: false,
      chatLayout: false,
      transientGuidanceCleanup: false,
      bagInfo: false,
      compactPlayer: false,
      danmakuSendCheck: false,
      roomMetrics: false,
      volumeWheel: false,
      liveTimeshiftControls: false,
      dailyAutomation: true,
      highestVideoQuality: true,
      messageContextActionFallback: true,
      disableOfflineJump: false,
    },
    preferences: { autoWebFullscreen: false },
    automation: { autoFansRestRoomId: "52", autoFansContinue: false },
  });
  assert.equal(diffSettings(current, imported).length, 16, "all supported fields participate in preview");
  assert.deepEqual(diffSettings(imported, structuredClone(imported)), [], "an idempotent import has no write-worthy change");
  const legacyImport = structuredClone(imported);
  delete legacyImport.features.transientGuidanceCleanup;
  delete legacyImport.features.bagInfo;
  assert.equal(parseSettingsImport(legacyImport).features.transientGuidanceCleanup, true, "older Settings v6 exports default the visual cleanup on");
  assert.equal(parseSettingsImport(legacyImport).features.bagInfo, true, "older Settings v6 exports default bag info on");
  assert.throws(
    () => parseSettingsImport({ ...imported, unexpected: true }),
    /未知字段：unexpected/,
  );
  assert.throws(
    () => parseSettingsImport({ ...imported, schemaVersion: 5 }),
    /不支持 Settings v5/,
  );
  assert.throws(
    () => parseSettingsImport({
      ...imported,
      features: { ...imported.features, unknown: true },
    }), /未知字段：unknown/);
  assert.throws(
    () => parseSettingsImport({
      ...imported,
      automation: { ...imported.automation, autoFansRestRoomId: "052" },
    }), /null 或正整数房间号/);
});

test("message context actions stay scoped to numeric Douyu rooms and preserve archived reply text", () => {
  assert.equal(isDouyuLiveRoomPath({ hostname: "www.douyu.com", pathname: "/5135383" }), true);
  assert.equal(isDouyuLiveRoomPath({ hostname: "www.douyu.com", pathname: "/room/5135383" }), false);
  assert.equal(isDouyuLiveRoomPath({ hostname: "v.douyu.com", pathname: "/5135383" }), false);
  assert.equal(replyText("作者", "原始弹幕"), "@作者：原始弹幕");
  assert.equal(messageContextActionSelectors.floatingBarrageItem[0], "#comment-higher-container [data-comment-uuid]");
  assert.ok(messageContextActionSelectors.messageItem.includes(messageContextActionSelectors.barrageItem[0]));
});

test("official action presence wins and fallback waits for a missing capability", () => {
  assert.equal(shouldInjectAction(true, "missing"), false);
  assert.equal(shouldInjectAction(false, "unknown"), false);
  assert.equal(shouldInjectAction(false, "missing"), true);
  assert.equal(isOfficialActionText("+1", "+1"), true);
  assert.equal(isOfficialActionText("+1", "加一"), true, "the official Chinese label is the same +1 capability");
  assert.equal(isOfficialActionText("回复", "回复"), true);
  assert.equal(isOfficialActionText("+1", "回复"), false);
  assert.deepEqual(fallbackActionPresentation("+1"), {
    label: "加一",
    buttonClass: "labelfisrt-407af4 danmuMenuAddOneButton-ab0d98",
    iconClass: "danmuMenuIcon-bd4b11 danmuMenuAddOneIcon-45cfa0",
  });
  assert.deepEqual(fallbackActionPresentation("回复"), {
    label: "回复",
    buttonClass: "labelfisrt-407af4 danmuMenuReplyButton-f2de67",
    iconClass: "danmuMenuIcon-bd4b11 danmuMenuReplyIcon-c5a916",
  });

  const item = { isConnected: true };
  const snapshot = { item, roomPath: "/5135383", identity: "uid:1", author: "主播", text: "你好" };
  assert.equal(sameMessageTarget(snapshot, item, "/5135383", "uid:1"), true);
  assert.equal(sameMessageTarget(snapshot, { isConnected: true }, "/5135383", "uid:1"), false);
  assert.equal(sameMessageTarget(snapshot, item, "/9999999", "uid:1"), false);
  item.isConnected = false;
  assert.equal(sameMessageTarget(snapshot, item, "/5135383", "uid:1"), false);
});

test("Settings snapshot save is atomic: runtime follows one successful write and failures leave it untouched", async () => {
  const next = structuredClone(DEFAULT_SETTINGS);
  next.features.chatMemory = false;
  const calls = [];
  const runtime = {
    enable(id) { calls.push(`enable:${id}`); },
    disable(id) { calls.push(`disable:${id}`); },
  };
  const saved = [];
  const applied = await saveAndApplySettingsSnapshot(
    next,
    { async save(value) { saved.push(value); } },
    runtime,
    [{ id: "chat-memory", setting: "chatMemory" }],
  );
  assert.deepEqual(saved, [next], "the full snapshot is saved once");
  assert.deepEqual(calls, ["disable:chat-memory"], "runtime only follows the successful write");
  assert.notEqual(applied, next, "caller mutation cannot alter the saved snapshot");
  calls.length = 0;
  await assert.rejects(
    saveAndApplySettingsSnapshot(
      DEFAULT_SETTINGS,
      { async save() { throw new Error("write failed"); } },
      runtime,
      [{ id: "chat-memory", setting: "chatMemory" }],
    ),
    /write failed/,
  );
  assert.deepEqual(calls, [], "no runtime reconcile occurs after a failed write");
});

test("volume wheel maps continuous input without quantizing precision scrolls", () => {
  assert.equal(VOLUME_WHEEL_STEP, 0.05);
  assert.equal(nextVolume(0.96, 1), 1);
  assert.equal(nextVolume(0.01, -1), 0);

  const mutedPlayer = { volume: 0.4, muted: true };
  assert.equal(applyVolumeStep(mutedPlayer, 1), 0.45);
  assert.deepEqual(mutedPlayer, { volume: 0.45, muted: false });

  const quietPlayer = { volume: 0.05, muted: false };
  assert.equal(applyVolumeStep(quietPlayer, -1), 0);
  assert.deepEqual(quietPlayer, { volume: 0, muted: true });

  assert.equal(volumeDeltaForWheel({ deltaY: -100, deltaMode: 0 }), 0.05, "a conventional 100 px notch remains 5%");
  assert.equal(volumeDeltaForWheel({ deltaY: -20, deltaMode: 0 }), 0.01, "precision input retains its smaller magnitude");
  assert.equal(volumeDeltaForWheel({ deltaY: 100, deltaMode: 0 }), -0.05);
  assert.equal(volumeDeltaForWheel({ deltaY: -3, deltaMode: 1 }), 0.05, "line input is normalized to the same scale");
  assert.equal(volumeDeltaForWheel({ deltaY: -1, deltaMode: 2 }), 0.05, "page input is normalized to the same scale");
  assert.equal(volumeDeltaForWheel({ deltaY: -1000, deltaMode: 0 }), 0.08, "one display frame has a safe upper bound");
});

test("live timeshift uses seekable as the only operation boundary", () => {
  assert.equal(LIVE_TIMESHIFT_STEP_SECONDS, 3);
  assert.equal(isDouyuLiveRoomPage({ hostname: "www.douyu.com", pathname: "/5135383" }), true);
  assert.equal(isDouyuLiveRoomPage({ hostname: "v.douyu.com", pathname: "/show/1" }), false);
  assert.equal(isDouyuLiveRoomPage({ hostname: "www.douyu.com", pathname: "/room/5135383" }), false);

  const ranges = readSeekableRanges({
    length: 2,
    start(index) { return index === 0 ? 10 : 30; },
    end(index) { return index === 0 ? 20 : 40; },
  });
  assert.deepEqual(ranges, [{ start: 10, end: 20 }, { start: 30, end: 40 }]);
  assert.equal(clampSeekTarget(15, -3, ranges), 12);
  assert.equal(clampSeekTarget(15, 10, ranges), 30, "forward seeks clamp to the next segment start");
  assert.equal(clampSeekTarget(35, -10, ranges), 20, "backward seeks clamp to the previous segment end");
  assert.equal(clampSeekTarget(15, -100, ranges), 10);
  assert.equal(clampSeekTarget(35, 100, ranges), 40);
  assert.equal(clampSeekTarget(15, 3, []), null);
});

test("live timeshift key guard preserves editable, selected, composing, and modified input", () => {
  const selection = { isCollapsed: true };
  const document = { getSelection() { return selection; } };
  const base = {
    key: "ArrowLeft",
    keyCode: 37,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    target: { isContentEditable: false, closest() { return null; } },
    composedPath() { return []; },
  };
  assert.equal(shouldIgnoreTimeshiftKey(base, document), false);
  assert.equal(shouldIgnoreTimeshiftKey({ ...base, shiftKey: true }, document), true);
  assert.equal(shouldIgnoreTimeshiftKey({ ...base, isComposing: true }, document), true);
  assert.equal(shouldIgnoreTimeshiftKey({ ...base, target: { isContentEditable: true } }, document), true);
  selection.isCollapsed = false;
  assert.equal(shouldIgnoreTimeshiftKey(base, document), true);
});

test("volume wheel rebinds after Douyu replaces the volume root and cleans up", () => {
  const listeners = new Map();
  let control = {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
  const videoListeners = new Map();
  let video = {
    volume: 0.4,
    muted: false,
    addEventListener(type, listener) { videoListeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (videoListeners.get(type) === listener) videoListeners.delete(type);
    },
  };
  let scheduledFrame;
  const cancelledFrames = [];
  const document = {
    documentElement: { dataset: {} },
    defaultView: {
      requestAnimationFrame(callback) {
        scheduledFrame = callback;
        return 1;
      },
      cancelAnimationFrame(frame) { cancelledFrames.push(frame); },
    },
    querySelector(selector) {
      if (selector === ".volume-07c230") return control;
      return null;
    },
    getElementById(id) { return id === "__video2" ? video : null; },
  };
  let rescan;
  const observerHub = {
    subscribe(callback) {
      rescan = callback;
      return () => { rescan = undefined; };
    },
  };
  const diagnostics = new Diagnostics();
  const dispose = createVolumeWheelFeature().start({ diagnostics, document, observerHub });
  const event = {
    deltaY: -100,
    deltaMode: 0,
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
  };
  listeners.get("wheel")(event);

  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.equal(video.volume, 0.4, "input is deferred to the browser paint");
  scheduledFrame();
  assert.equal(video.volume, 0.45);
  assert.equal(diagnostics.snapshot("test", "https://www.douyu.com/1").features[0].status, "active");

  const oldVideo = video;
  const replacementListeners = new Map();
  control = {
    addEventListener(type, listener) { replacementListeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (replacementListeners.get(type) === listener) replacementListeners.delete(type);
    },
  };
  const replacementVideoListeners = new Map();
  video = {
    volume: 0.6,
    muted: false,
    addEventListener(type, listener) { replacementVideoListeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (replacementVideoListeners.get(type) === listener) replacementVideoListeners.delete(type);
    },
  };
  rescan();
  replacementListeners.get("wheel")(event);
  scheduledFrame();
  assert.equal(oldVideo.volume, 0.45);
  assert.equal(video.volume, 0.65);
  assert.equal(listeners.has("wheel"), false);

  replacementListeners.get("wheel")(event);
  dispose();
  assert.equal(replacementListeners.has("wheel"), false);
  assert.equal(replacementVideoListeners.has("volumechange"), false);
  assert.equal(rescan, undefined);
  assert.deepEqual(cancelledFrames, [1], "pending paint work is cancelled on cleanup");
});

test("settings v6 discards unsupported fields and keeps UI-owned preferences separate", () => {
  const store = new SettingsStore(() => undefined, () => undefined);
  const migrated = store.normalize({
    schemaVersion: 5,
    features: { chatLayout: false, unknown: true },
    preferences: { autoWebFullscreen: false, secret: "never-export" },
    automation: { autoFansRestRoomId: "12306", audit: [{ token: "private" }] },
  });
  assert.equal(migrated.schemaVersion, 6);
  assert.equal(migrated.features.chatLayout, false);
  assert.equal(migrated.preferences.autoWebFullscreen, false);
  assert.equal(migrated.automation.autoFansRestRoomId, "12306");
  assert.equal(migrated.automation.autoFansContinue, true);
  assert.equal("unknown" in migrated.features, false);
  assert.equal("secret" in migrated.preferences, false);
  assert.equal("audit" in migrated.automation, false);
  assert.equal(store.normalize({ automation: { autoFansRestRoomId: "0123" } }).automation.autoFansRestRoomId, null);
});

test("diagnostics subscriptions expose runtime state changes without a polling loop", () => {
  const diagnostics = new Diagnostics();
  let calls = 0;
  const stop = diagnostics.subscribe(() => { calls += 1; });
  diagnostics.update("feature", "waiting", { detail: "mounting" });
  stop();
  diagnostics.update("feature", "active");
  assert.equal(calls, 1);
  assert.equal(diagnostics.snapshot("test", "https://www.douyu.com/1").features[0].status, "active");
});

function createDisableOfflineJumpHarness(pathname = "/12306") {
  let button = null;
  let observerScan;
  let nextTimer = 0;
  const intervals = new Map();
  const clearedTimers = [];
  const listeners = new Map();
  const location = { hostname: "www.douyu.com", pathname };
  const view = {
    location,
    setInterval(callback, delay) {
      const id = ++nextTimer;
      intervals.set(id, { callback, delay });
      return id;
    },
    clearInterval(id) {
      clearedTimers.push(id);
      intervals.delete(id);
    },
    addEventListener(type, callback) { listeners.set(type, callback); },
    removeEventListener(type, callback) {
      if (listeners.get(type) === callback) listeners.delete(type);
    },
    history: {
      pushState(_state, _title, nextPath) { location.pathname = nextPath; },
      replaceState(_state, _title, nextPath) { location.pathname = nextPath; },
    },
  };
  const document = {
    defaultView: view,
    querySelector(selector) {
      assert.equal(selector, DISABLE_OFFLINE_JUMP_SELECTOR);
      return button;
    },
  };
  const observerHub = {
    subscribe(callback) {
      observerScan = callback;
      return () => { observerScan = undefined; };
    },
  };
  return {
    document,
    observerHub,
    view,
    location,
    intervals,
    clearedTimers,
    listeners,
    setButton(nextButton) { button = nextButton; },
    notifyMutation() { observerScan?.(); },
    tick() { [...intervals.values()][0]?.callback(); },
  };
}

test("disable-offline-jump scans immediately only on live room pages", () => {
  assert.equal(isDisableOfflineJumpLiveRoomPage({ hostname: "www.douyu.com", pathname: "/12306" }), true);
  assert.equal(isDisableOfflineJumpLiveRoomPage({ hostname: "www.douyu.com", pathname: "/0" }), false);
  assert.equal(isDisableOfflineJumpLiveRoomPage({ hostname: "v.douyu.com", pathname: "/12306" }), false);

  const harness = createDisableOfflineJumpHarness();
  let clicks = 0;
  harness.setButton({ click() { clicks += 1; } });
  const diagnostics = new Diagnostics();
  const dispose = createDisableOfflineJumpFeature().start({
    diagnostics,
    document: harness.document,
    observerHub: harness.observerHub,
  });

  assert.equal(clicks, 1, "startup performs an immediate scan");
  assert.deepEqual([...harness.intervals.values()].map(({ delay }) => delay), [DISABLE_OFFLINE_JUMP_INTERVAL_MS]);
  assert.deepEqual(diagnostics.snapshot("test", "https://www.douyu.com/12306").features[0], {
    id: DISABLE_OFFLINE_JUMP_ID,
    status: "active",
    detail: "已点击官方下播推荐关闭按钮；若弹窗仍在则继续轮询",
    selector: DISABLE_OFFLINE_JUMP_SELECTOR,
    data: {
      roomPath: "/12306",
      scanCount: 1,
      clickCount: 1,
      pollIntervalMs: DISABLE_OFFLINE_JUMP_INTERVAL_MS,
    },
    updatedAt: diagnostics.snapshot("test", "https://www.douyu.com/12306").features[0].updatedAt,
  });
  dispose();
  assert.equal(harness.intervals.size, 0, "dispose clears the room poll");
  assert.equal(harness.clearedTimers.length, 1);
});

test("disable-offline-jump retries delayed and persistent official close buttons", () => {
  const harness = createDisableOfflineJumpHarness();
  let clicks = 0;
  const button = { click() { clicks += 1; } };
  const dispose = createDisableOfflineJumpFeature().start({
    diagnostics: new Diagnostics(),
    document: harness.document,
    observerHub: harness.observerHub,
  });

  assert.equal(clicks, 0, "missing DOM is a silent wait");
  harness.setButton(button);
  harness.tick();
  harness.tick();
  assert.equal(clicks, 2, "a still-present button is retried on later polls");
  dispose();
});

test("disable-offline-jump keeps one timer through DOM rebuilds and cleans on leave or disable", () => {
  const harness = createDisableOfflineJumpHarness();
  let clicks = 0;
  harness.setButton({ click() { clicks += 1; } });
  const dispose = createDisableOfflineJumpFeature().start({
    diagnostics: new Diagnostics(),
    document: harness.document,
    observerHub: harness.observerHub,
  });
  assert.equal(harness.intervals.size, 1);
  harness.notifyMutation();
  harness.notifyMutation();
  assert.equal(harness.intervals.size, 1, "shared observer scans never add a second timer");
  assert.equal(clicks, 1, "shared DOM churn does not turn into extra close-button clicks");

  harness.view.history.pushState({}, "", "/directory/all");
  harness.listeners.get("popstate")?.();
  assert.equal(harness.intervals.size, 0, "leaving the room clears the timer");
  assert.equal(harness.clearedTimers.length, 1);

  harness.view.history.replaceState({}, "", "/23456");
  harness.notifyMutation();
  assert.equal(harness.intervals.size, 1, "a new SPA room starts a fresh singleton timer");
  dispose();
  assert.equal(harness.intervals.size, 0, "feature disable clears the new room timer");
  assert.equal(harness.listeners.has("popstate"), false);
  assert.equal(harness.listeners.has("hashchange"), false);
});

test("disable-offline-jump does not intercept user navigation or visibility", async () => {
  const source = await readFile(
    new URL("../packages/douyu-web-enhancer/src/features/disable-offline-jump.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /history\.(pushState|replaceState)/);
  assert.doesNotMatch(source, /visibility(State|change)/);
  const harness = createDisableOfflineJumpHarness();
  const dispose = createDisableOfflineJumpFeature().start({
    diagnostics: new Diagnostics(),
    document: harness.document,
    observerHub: harness.observerHub,
  });
  harness.view.history.pushState({}, "", "/23456");
  harness.tick();
  assert.equal(harness.location.pathname, "/23456");
  dispose();
});

test("control center only constrains itself to a visible chat panel and hides in pure fullscreen video", () => {
  const panel = {
    getBoundingClientRect() { return { width: 420, height: 700 }; },
  };
  const plainDocument = {
    fullscreenElement: null,
    querySelector() { return null; },
    querySelectorAll() { return [panel]; },
    defaultView: { getComputedStyle() { return { display: "block", visibility: "visible" }; } },
  };
  assert.equal(isVisibleChatPanel(plainDocument), panel);
  assert.equal(isPureVideoFullscreen(plainDocument), false);
  const videoOnlyDocument = {
    fullscreenElement: {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    defaultView: { getComputedStyle() { return { display: "block", visibility: "visible" }; } },
  };
  assert.equal(isVisibleChatPanel(videoOnlyDocument), null);
  assert.equal(isPureVideoFullscreen(videoOnlyDocument), true);
});

test("control center opens when an edge glyph or label receives the click", () => {
  const glyph = { classList: { contains: () => false } };
  const edge = { classList: { contains: (name) => name === "edge" } };
  const label = { classList: { contains: () => false } };

  assert.equal(isControlCenterEdgePath([glyph, edge, label]), true);
  assert.equal(isControlCenterEdgePath([glyph, label]), false);
});

test("ordinary chat DOM churn skips model refresh and only updates open drawer geometry", () => {
  let open = false;
  let geometryRefreshes = 0;
  let modelRefreshes = 0;
  const refreshModel = () => { modelRefreshes += 1; };
  const onMutation = createOpenOnlyGeometryRefresh(
    () => open,
    () => { geometryRefreshes += 1; },
  );

  for (let index = 0; index < 20; index += 1) onMutation();
  assert.equal(geometryRefreshes, 0);
  assert.equal(modelRefreshes, 0, "chat mutations have no complete model refresh path");

  open = true;
  onMutation();
  assert.equal(geometryRefreshes, 1);
  assert.equal(modelRefreshes, 0);
  void refreshModel;
});

test("control center keeps its navigation outside the scrolling flex region", async () => {
  const source = await readFile(
    new URL("../packages/douyu-web-enhancer/src/ui/control-center.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /header \{ flex:0 0 auto;/);
  assert.match(source, /nav \{ flex:0 0 44px;/);
  assert.match(source, /main \{ flex:1 1 auto; min-height:0; overflow:auto;/);
});

test("danmaku availability is automatic and exposes a concise outcome state", async () => {
  const [mainSource, controlCenterSource, settingsSource] = await Promise.all([
    readFile(new URL("../packages/douyu-web-enhancer/src/main.ts", import.meta.url), "utf8"),
    readFile(new URL("../packages/douyu-web-enhancer/src/ui/control-center.ts", import.meta.url), "utf8"),
    readFile(new URL("../packages/douyu-web-enhancer/src/core/settings.ts", import.meta.url), "utf8"),
  ]);

  assert.match(mainSource, /const danmakuAvailabilityHook = installDanmakuAvailabilityHook\(\);/);
  assert.doesNotMatch(settingsSource, /danmakuAvailability/);
  assert.match(controlCenterSource, /未生效，当前无需恢复/);
  assert.match(controlCenterSource, /已生效，正在恢复飘屏/);
  assert.match(controlCenterSource, /等待识别弹幕状态/);
  assert.match(controlCenterSource, /运行异常，可能无法恢复飘屏/);
  assert.doesNotMatch(controlCenterSource, /脚本 Hook/);
  assert.doesNotMatch(controlCenterSource, /未命中/);
  assert.doesNotMatch(controlCenterSource, /aria-label="特殊时期弹幕恢复"/);
});

test("control center formats audit timestamps locally and validates saved room ids", () => {
  const instant = new Date("2026-09-16T00:00:01.250Z");
  const pad = (value) => String(value).padStart(2, "0");
  assert.equal(
    formatAutomationLocalTime(instant.toISOString()),
    `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())} ${pad(instant.getHours())}:${pad(instant.getMinutes())}:${pad(instant.getSeconds())}`,
  );
  assert.equal(formatAutomationLocalTime("not-a-time"), "时间未知");
  assert.equal(formatAutomationLocalTime(undefined), "时间未知");
  assert.equal(isPositiveRoomId("12306"), true);
  assert.equal(isPositiveRoomId(""), false);
  assert.equal(isPositiveRoomId("0"), false);
  assert.equal(isPositiveRoomId("012306"), false);
  assert.equal(isPositiveRoomId("12.3"), false);
});

test("daily automation leases reject overlap, expire, and only release their owner", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  const start = new Date("2026-09-13T08:00:00+08:00");
  const first = acquireAutomationLease(storage, "task", start, 1_000);
  assert.ok(first);
  assert.equal(acquireAutomationLease(storage, "task", start, 1_000), null);
  releaseAutomationLease(storage, "task", "not-owner");
  assert.equal(acquireAutomationLease(storage, "task", start, 1_000), null);
  const second = acquireAutomationLease(storage, "task", new Date(start.getTime() + 1_001), 1_000);
  assert.ok(second);
  releaseAutomationLease(storage, "task", second);
  assert.ok(acquireAutomationLease(storage, "task", new Date(start.getTime() + 1_002), 1_000));
});

test("daily automation keeps per-task completion, order, audit redaction and retry state", async () => {
  const gm = new Map();
  const local = new Map();
  const read = (key, fallback) => gm.has(key) ? gm.get(key) : fallback;
  const write = (key, value) => gm.set(key, structuredClone(value));
  const storage = {
    getItem: (key) => local.get(key) ?? null,
    setItem: (key, value) => local.set(key, String(value)),
    removeItem: (key) => local.delete(key),
  };
  const order = [];
  const notices = [];
  const runner = new DailyAutomationRunner({
    tasks: [
      { id: "action", name: "动作", async run() { order.push("action"); return { outcome: "success", summary: "ok", complete: true, detail: { token: "secret", code: 0 } }; } },
      { id: "claim", name: "领奖", async run() { order.push("claim"); return { outcome: "failed", summary: "later", complete: false }; } },
    ],
    store: new AutomationTaskStore(read, write),
    audit: new AutomationAuditLog(read, write),
    storage,
    notifier: { info() {}, success: (text) => notices.push(text), warning: (text) => notices.push(text), error() {} },
  });
  const now = new Date("2026-09-13T08:00:00+08:00");
  const result = await runner.run(now);
  assert.deepEqual(order, ["action", "claim"]);
  assert.equal(result.results[0].result.complete, true);
  assert.equal(result.results[1].result.complete, false);
  assert.equal((await new AutomationTaskStore(read, write).load("action")).lastSuccessDay, localDay(now));
  assert.equal((await new AutomationTaskStore(read, write).load("claim")).lastSuccessDay, undefined);
  const audit = gm.get(AUTOMATION_AUDIT_KEY);
  assert.equal(audit.find((event) => event.taskId === "action" && event.phase === "finish").detail.token, undefined);
  assert.equal(audit.find((event) => event.taskId === "action" && event.phase === "finish").detail.code, 0);
  assert.match(notices.at(-1), /待重试 1/);
  await runner.run(new Date(now.getTime() + 60_000));
  assert.ok(gm.get(AUTOMATION_AUDIT_KEY).some((event) => event.taskId === "claim" && event.phase === "skip" && /冷却期/.test(event.summary)));
});

test("automation audit sanitizes legacy raw details when they are read", async () => {
  const gm = new Map([[AUTOMATION_AUDIT_KEY, [{
    at: "2026-09-13T08:00:00.000Z", taskId: "legacy", phase: "finish", summary: "old",
    detail: { userId: "private", token: "secret", nested: { messages: [{ nickname: "private" }], useful: "ok" } },
  }]]]);
  const audit = new AutomationAuditLog((key, fallback) => gm.get(key) ?? fallback, () => undefined);
  const [event] = await audit.list();
  assert.equal(event.detail.userId, undefined);
  assert.equal(event.detail.token, undefined);
  assert.equal(event.detail.nested.messages, undefined);
  assert.equal(event.detail.nested.useful, "ok");
});

test("clearing automation audit only clears the bounded audit record", async () => {
  const gm = new Map([
    [AUTOMATION_AUDIT_KEY, [{ at: "2026-09-17T08:00:00.000Z", taskId: "task", phase: "finish", summary: "done" }]],
    [`${AUTOMATION_TASK_KEY_PREFIX}task`, { completed: true }],
  ]);
  const audit = new AutomationAuditLog((key, fallback) => gm.get(key) ?? fallback, (key, value) => gm.set(key, value));
  await audit.clear();
  assert.deepEqual(gm.get(AUTOMATION_AUDIT_KEY), []);
  assert.deepEqual(gm.get(`${AUTOMATION_TASK_KEY_PREFIX}task`), { completed: true }, "task state remains outside the audit-clear scope");
});

test("daily task contract is opt-in for new installs, uses the fixed targets and leaves room sign out", () => {
  const cookie = "acf_uid=1; acf_biz=2; acf_stk=3; acf_ct=4; acf_ltkid=5";
  assert.equal(createDouyuToken(cookie), "1_2_3_4_5");
  assert.equal(createDouyuToken("acf_uid=1"), null);
  assert.equal(currentAutomationRoomId("/12306"), "12306");
  assert.equal(currentAutomationRoomId("/directory/myFollow"), "12306");
  const tasks = createDouyuDailyTasks({
    request() {}, cookie, pathname: "/12306",
    storage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    notifier: { info() {}, success() {}, warning() {}, error() {} },
    logger: { log() {} },
  });
  assert.deepEqual(tasks.map((task) => task.id), [
    "sign-yuba", "sign-client", "sign-fans-home", "sign-super-fans",
    "sign-read-post", "sign-follow-task", "auto-fans-continue",
  ]);
  assert.equal(tasks.some((task) => task.id === "sign-room"), false);
  assert.equal(tasks.some((task) => task.id === "level-task-auto-claim"), false);
  assert.equal(DEFAULT_SETTINGS.features.dailyAutomation, false);
  assert.equal(DAILY_AUTOMATION_ID, "daily-automation");
  assert.equal(FIXED_TASK_ROOM_ID, "3186571");
});

test("auto-fans task can be paused by its settings gate without invoking its gift runtime", async () => {
  const tasks = createDouyuDailyTasks({
    request() { throw new Error("not expected"); },
    cookie: "", pathname: "/12306",
    storage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    notifier: { info() {}, success() {}, warning() {}, error() {} },
    logger: { log() {} },
    autoFansContinueEnabled: () => false,
  });
  const result = await tasks.find((task) => task.id === "auto-fans-continue").run();
  assert.equal(result.outcome, "skipped");
  assert.equal(result.complete, true);
  assert.match(result.summary, /已停用/);
});

test("fixed follow task restores the original unfollowed state", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let csrf = "before-add";
  globalThis.fetch = async (url, init = {}) => {
    calls.push([String(url), init.method ?? "GET", init.body ?? ""]);
    if (String(url).includes("/follow/add")) csrf = "after-add";
    const payload = String(url).includes("/follow/list")
      ? { error: 0, data: { pageCount: 1, list: [] } }
      : { error: 0, msg: "" };
    return { ok: true, status: 200, async json() { return payload; } };
  };
  try {
    const tasks = createDouyuDailyTasks({
      request() {},
      cookie: () => `acf_uid=1; acf_biz=2; acf_stk=3; acf_ct=4; acf_ltkid=5; acf_ccn=${csrf}`,
      pathname: "/12306",
      storage: { getItem() { return null; }, setItem() {}, removeItem() {} },
      notifier: { info() {}, success() {}, warning() {}, error() {} },
      logger: { log() {} },
    });
    const result = await tasks.find((task) => task.id === "sign-follow-task").run();
    assert.equal(result.complete, true);
    assert.match(result.summary, /恢复未关注状态/);
    assert.deepEqual(calls.map(([url]) => url.match(/follow\/(list|add|rm)/)?.[1]), ["list", "add", "rm"]);
    assert.match(calls[1][2], /ctn=before-add/);
    assert.match(calls[2][2], /ctn=after-add/);
    assert.match(calls[1][2], new RegExp(`rid=${FIXED_TASK_ROOM_ID}`));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fixed follow task repairs a prior interrupted remove instead of preserving residue", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const gm = new Map([
    [`${AUTOMATION_TASK_KEY_PREFIX}sign-follow-task`, { lastOutcome: "failed", summary: "取消关注失败：用户csrf token无效" }],
  ]);
  globalThis.fetch = async (url, init = {}) => {
    calls.push([String(url), init.method ?? "GET", init.body ?? ""]);
    const payload = String(url).includes("/follow/list")
      ? { error: 0, data: { pageCount: 1, list: [{ room_id: FIXED_TASK_ROOM_ID }] } }
      : { error: 0, msg: "" };
    return { ok: true, status: 200, async json() { return payload; } };
  };
  try {
    const tasks = createDouyuDailyTasks({
      request() {}, cookie: "acf_uid=1; acf_biz=2; acf_stk=3; acf_ct=4; acf_ltkid=5; acf_ccn=fresh",
      pathname: "/12306", storage: { getItem() { return null; }, setItem() {}, removeItem() {} },
      read: (key, fallback) => gm.has(key) ? gm.get(key) : fallback,
      write: (key, value) => gm.set(key, value),
      notifier: { info() {}, success() {}, warning() {}, error() {} }, logger: { log() {} },
    });
    const result = await tasks.find((task) => task.id === "sign-follow-task").run();
    assert.equal(result.complete, true);
    assert.match(result.summary, /恢复上次中断/);
    assert.deepEqual(calls.map(([url]) => url.match(/follow\/(list|add|rm)/)?.[1]), ["list", "rm"]);
    assert.equal(gm.get(FOLLOW_RESTORE_KEY), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("obsolete super-fans sign is recorded without calling the retired endpoint", async () => {
  const tasks = createDouyuDailyTasks({
    request() {}, cookie: "acf_uid=1; acf_biz=2; acf_stk=3; acf_ct=4; acf_ltkid=5",
    pathname: "/12306", storage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    notifier: { info() {}, success() {}, warning() {}, error() {} }, logger: { log() {} },
  });
  const result = await tasks.find((task) => task.id === "sign-super-fans").run();
  assert.equal(result.outcome, "unsupported");
  assert.equal(result.complete, true);
  assert.match(result.summary, /接口已下线/);
});

test("daily automation treats deleted Yuba groups as a terminal skip and never treats an empty response as success", async () => {
  const request = (details) => {
    const response = details.url.includes("myFollow")
      ? { error: 0, data: { list: [{ group_id: "1577965" }], count_page: 1 } }
      : details.url.includes("fastSign")
        ? undefined
        : { error: 1, message: "小组不存在" };
    details.onload({ status: 200, response });
  };
  const tasks = createDouyuDailyTasks({
    request, cookie: "acf_uid=1; acf_biz=2; acf_stk=3; acf_ct=4; acf_ltkid=5",
    pathname: "/12306", storage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    notifier: { info() {}, success() {}, warning() {}, error() {} }, logger: { log() {} },
  });
  const result = await tasks.find((task) => task.id === "sign-yuba").run();
  assert.equal(result.complete, true);
  assert.match(result.summary, /失效小组 1/);
  assert.match(result.summary, /收益未证实/);
  assert.equal(result.detail.groups[0].outcome, "invalid-group");
  assert.equal(hasVerifiedSuccess(undefined), false);
  assert.equal(hasVerifiedSuccess({}), false);
  assert.equal(hasVerifiedSuccess({ error: 0 }), true);
});

test("level rewards claim every server-completed task without treating incomplete tasks as completed", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push([String(url), init.method ?? "GET"]);
    const payload = String(url).includes("userLevelDetail")
      ? { error: 0, data: { taskIds: ["login", "watch5", "watch30", "share"] } }
      : String(url).includes("getTaskStatus")
        ? { error: 0, data: { list: [
          { taskId: "login", name: "每日登录", taskStatus: 1, prizeStatus: 0 },
          { taskId: "watch5", name: "观看直播5分钟", taskStatus: 1, prizeStatus: 0 },
          { taskId: "watch30", name: "观看直播30分钟", taskStatus: 1, prizeStatus: 0 },
          { taskId: "share", name: "分享QQ", taskStatus: 0, prizeStatus: 0 },
        ] } }
        : { error: 0, data: { list: [] } };
    return { ok: true, status: 200, async json() { return payload; } };
  };
  try {
    const result = await claimLevelTasks("12306", () => "acf_ccn=fresh");
    assert.equal(result.outcome, "success");
    assert.equal(result.detail.claims.length, 3);
    assert.equal(result.detail.primaryGoals.login, "claimed");
    assert.equal(result.detail.primaryGoals["watch-5"], "claimed");
    assert.equal(result.detail.primaryGoals["watch-30"], "claimed");
    assert.equal(result.detail.primaryGoals.follow, "missing");
    assert.equal(calls.filter(([url]) => url.includes("getPrize")).length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("level reward scheduler is bounded, event-driven, debounced, and cross-tab locked", async () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  const listeners = new Map();
  const document = {
    visibilityState: "visible",
    defaultView: { CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } } },
    addEventListener(type, listener) { (listeners.get(type) ?? listeners.set(type, new Set()).get(type)).add(listener); },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    dispatchEvent(event) { for (const listener of listeners.get(event.type) ?? []) listener(event); return true; },
  };
  const audit = new AutomationAuditLog(() => [], () => undefined);
  let calls = 0;
  const scheduler = new LevelTaskClaimScheduler({
    claim: async () => ({ outcome: "already-done", summary: "nothing yet", complete: true, detail: { primaryGoals: { login: "claimed", "watch-5": "pending", "watch-30": "pending", follow: "missing" } } }),
    storage, audit, document, debounceMs: 2, milestoneMs: [5, 80], retryMs: [3, 7],
  });
  const originalClaim = scheduler.check.bind(scheduler);
  scheduler.check = async (reason) => { calls += 1; return originalClaim(reason); };
  const stop = scheduler.start();
  await new Promise((resolve) => setTimeout(resolve, 28));
  assert.equal(calls, 4, "initial, five-minute surrogate, and its two bounded retries only");
  document.dispatchEvent({ type: "visibilitychange" });
  emitConfirmedDanmaku(document, "12306");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(calls, 5, "visibility and successful-danmaku events share one debounce");
  stop();
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.equal(calls, 5, "dispose cancels the later milestone rather than leaving a poll running");

  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const first = new LevelTaskClaimScheduler({ claim: async () => { await held; return { outcome: "already-done", summary: "held", complete: true, detail: {} }; }, storage, audit, document });
  const second = new LevelTaskClaimScheduler({ claim: async () => { throw new Error("second tab must not claim"); }, storage, audit, document });
  const pending = first.check("first tab");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(await second.check("second tab"), null);
  release();
  await pending;
});

test("level reward scheduler stops milestone timers once the primary goals are all claimed", async () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
  const listeners = new Map();
  const document = { visibilityState: "visible", addEventListener(type, listener) { listeners.set(type, listener); }, removeEventListener() {} };
  let calls = 0;
  const scheduler = new LevelTaskClaimScheduler({
    claim: async () => { calls += 1; return { outcome: "already-done", summary: "all claimed", complete: true, detail: { primaryGoals: { login: "claimed", "watch-5": "claimed", "watch-30": "claimed", follow: "claimed" } } }; },
    storage, audit: new AutomationAuditLog(() => [], () => undefined), document, milestoneMs: [4, 8], retryMs: [2],
  });
  const stop = scheduler.start();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls, 1, "share/video tasks are not a condition for a permanent waiting loop");
  stop();
});

test("level reward scheduler exposes bounded acceptance evidence without changing its triggers", async () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
  const document = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
  const diagnostics = [];
  const scheduler = new LevelTaskClaimScheduler({
    claim: async () => ({ outcome: "already-done", summary: "all claimed", complete: true, detail: { primaryGoals: { login: "claimed", "watch-5": "claimed", "watch-30": "claimed", follow: "claimed" } } }),
    storage,
    audit: new AutomationAuditLog(() => [], () => undefined),
    document,
    milestoneMs: [40, 80],
    retryMs: [10, 20],
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
  });
  const stop = scheduler.start();
  await new Promise((resolve) => setTimeout(resolve, 10));
  const complete = scheduler.diagnostic();
  assert.equal(LEVEL_TASK_SCHEDULER_DIAGNOSTIC_ID, "level-task-claim-scheduler");
  assert.equal(complete.lifecycle, "running", "event listeners remain available until the feature is disabled");
  assert.equal(complete.timeSchedulingStopped, true);
  assert.equal(complete.timers.total, 0);
  assert.deepEqual(complete.remainingPrimaryGoals, []);
  assert.match(complete.stopReason, /已取消全部时间里程碑和延迟复查/);
  assert.ok(diagnostics.some((diagnostic) => diagnostic.nextTrigger?.kind === "milestone"), "the snapshot records the finite next trigger before completion");
  stop();
  const disposed = scheduler.diagnostic();
  assert.equal(disposed.lifecycle, "stopped");
  assert.equal(disposed.timers.total, 0);
  assert.match(disposed.stopReason, /停用或页面正在卸载/);
});

test("auto webpage fullscreen uses one global default-on preference and numeric room paths", async () => {
  const writes = [];
  const defaultPreference = createAutoWebFullscreenPreference(
    () => undefined,
    (key, value) => writes.push([key, value]),
  );
  assert.equal(await defaultPreference.load(), true);
  await defaultPreference.save(false);
  assert.deepEqual(writes, [[AUTO_WEB_FULLSCREEN_STATE_KEY, false]]);

  const disabledPreference = createAutoWebFullscreenPreference(
    () => false,
    () => undefined,
  );
  assert.equal(await disabledPreference.load(), false);
  assert.equal(isDouyuNumericRoomPath("/12306"), true);
  assert.equal(isDouyuNumericRoomPath("/12306/"), false);
  assert.equal(isDouyuNumericRoomPath("/directory/all"), false);
  assert.deepEqual(autoWebFullscreenSelectors.webFullscreenControl, [
    'button[aria-label*="网页全屏"]',
    '[role="button"][aria-label*="网页全屏"]',
    '[title*="网页全屏"]',
    '[data-action="web-fullscreen"]',
  ]);
});

test("auto webpage fullscreen distinguishes trusted user scroll intent from programmatic scroll", () => {
  assert.equal(isAutoWebFullscreenUserScrollIntent({ type: "wheel", isTrusted: true }), true);
  assert.equal(isAutoWebFullscreenUserScrollIntent({ type: "keydown", key: "Home", isTrusted: true }), true);
  assert.equal(isAutoWebFullscreenUserScrollIntent({ type: "keydown", key: "PageUp", isTrusted: true }), true);
  assert.equal(isAutoWebFullscreenUserScrollIntent({ type: "keydown", key: "Home", isTrusted: false }), false);
  assert.equal(isAutoWebFullscreenUserScrollIntent({ type: "scroll", isTrusted: true }), false);
  assert.equal(
    isAutoWebFullscreenUserScrollIntent({ type: "keydown", key: "Home", ctrlKey: true, isTrusted: true }),
    false,
  );
});

test("auto webpage fullscreen corrects scroll restoration and only records stable manual mode after recovery", async () => {
  const originalLocation = globalThis.location;
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { pathname: "/12306" },
  });
  let mode = false;
  let observerScan;
  let scrolls = 0;
  let playerTop = 1_200;
  const writes = [];
  const diagnostics = new Diagnostics();
  const document = {
    defaultView: {
      innerHeight: 829,
      addEventListener() {},
      removeEventListener() {},
    },
    querySelector(selector) {
      return selector.includes("wfs-2a8e83") && mode ? {} : null;
    },
  };
  try {
    const dispose = createAutoWebFullscreenFeature({
      async load() {
        return false;
      },
      async save(value) {
        writes.push(value);
      },
    }).start({
      diagnostics,
      document,
      observerHub: {
        subscribe(callback) {
          observerScan = callback;
          return () => undefined;
        },
      },
      selectors: {
        find(name) {
          if (name === "player") {
            return {
              element: {
                scrollIntoView() {
                  scrolls += 1;
                  if (scrolls > 1) playerTop = 120;
                },
                getBoundingClientRect() {
                  return { top: playerTop, bottom: playerTop + 681 };
                },
              },
              selector: ".real-player",
            };
          }
          return null;
        },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.equal(scrolls, 2, "a later geometry check corrects restored top-of-page scroll");
    assert.equal(
      diagnostics.snapshot("test", "https://www.douyu.com/12306").features[0].status,
      "active",
    );

    playerTop = 1_200;
    observerScan();
    observerScan();
    await new Promise((resolve) => setTimeout(resolve, 220));
    assert.equal(scrolls, 2, "successful initial positioning is terminal for this room");

    mode = true;
    observerScan();
    await new Promise((resolve) => setTimeout(resolve, 220));
    assert.deepEqual(writes, [true]);
    dispose();

    mode = true;
    playerTop = 120;
    let clicks = 0;
    const exitWrites = [];
    const exitDispose = createAutoWebFullscreenFeature({
      async load() {
        return true;
      },
      async save(value) {
        exitWrites.push(value);
      },
    }).start({
      diagnostics: new Diagnostics(),
      document,
      observerHub: {
        subscribe(callback) {
          observerScan = callback;
          return () => undefined;
        },
      },
      selectors: {
        find(name) {
          if (name === "player") {
            return {
              element: {
                scrollIntoView() {},
                getBoundingClientRect() { return { top: playerTop, bottom: playerTop + 681 }; },
              },
              selector: ".real-player",
            };
          }
          return {
            element: { click() { clicks += 1; } },
            selector: '[aria-label*="网页全屏"]',
          };
        },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    mode = false;
    observerScan();
    await new Promise((resolve) => setTimeout(resolve, 220));
    assert.equal(clicks, 0, "a stable user exit must not trigger re-entry");
    assert.deepEqual(exitWrites, [false]);
    exitDispose();
  } finally {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: originalLocation,
    });
  }
});

test("auto webpage fullscreen ends positioning after bounded failure and starts fresh on room change", async () => {
  const originalLocation = globalThis.location;
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { pathname: "/12306" },
  });
  let observerScan;
  let playerTop = 1_200;
  let scrolls = 0;
  const document = {
    defaultView: { innerHeight: 829, addEventListener() {}, removeEventListener() {} },
    querySelector() { return null; },
  };
  try {
    const dispose = createAutoWebFullscreenFeature({
      async load() { return false; },
      async save() {},
    }).start({
      diagnostics: new Diagnostics(),
      document,
      observerHub: {
        subscribe(callback) {
          observerScan = callback;
          return () => undefined;
        },
      },
      selectors: {
        find(name) {
          if (name !== "player") return null;
          return {
            element: {
              scrollIntoView() { scrolls += 1; },
              getBoundingClientRect() { return { top: playerTop, bottom: playerTop + 681 }; },
            },
            selector: ".real-player",
          };
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 2_500));
    assert.equal(scrolls, 4, "position correction remains bounded");
    playerTop = 1_200;
    observerScan();
    await new Promise((resolve) => setTimeout(resolve, 220));
    assert.equal(scrolls, 4, "bounded failure permanently ends positioning for this room");

    globalThis.location.pathname = "/23456";
    observerScan();
    assert.equal(scrolls, 5, "a real room change starts a new positioning transaction");
    dispose();
  } finally {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: originalLocation,
    });
  }
});

test("auto webpage fullscreen yields remaining position correction to user navigation and resets on SPA room change", async () => {
  const originalLocation = globalThis.location;
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { pathname: "/12306" },
  });
  const listeners = new Map();
  let observerScan;
  let playerTop = 1_200;
  let scrolls = 0;
  const document = {
    defaultView: {
      innerHeight: 829,
      addEventListener(type, callback) { listeners.set(type, callback); },
      removeEventListener(type, callback) {
        if (listeners.get(type) === callback) listeners.delete(type);
      },
    },
    querySelector() { return null; },
  };
  try {
    const dispose = createAutoWebFullscreenFeature({
      async load() { return false; },
      async save() {},
    }).start({
      diagnostics: new Diagnostics(),
      document,
      observerHub: {
        subscribe(callback) {
          observerScan = callback;
          return () => undefined;
        },
      },
      selectors: {
        find(name) {
          if (name !== "player") return null;
          return {
            element: {
              scrollIntoView() { scrolls += 1; },
              getBoundingClientRect() { return { top: playerTop, bottom: playerTop + 681 }; },
            },
            selector: ".real-player",
          };
        },
      },
    });

    assert.equal(scrolls, 1, "initial lifecycle may make its first positioning attempt");
    listeners.get("keydown")({ type: "keydown", key: "Home", isTrusted: true, target: null });
    playerTop = 1_200;
    await new Promise((resolve) => setTimeout(resolve, 180));
    observerScan();
    assert.equal(scrolls, 1, "Home abandons all remaining correction for this room");

    globalThis.location.pathname = "/23456";
    observerScan();
    assert.equal(scrolls, 2, "a SPA room change starts a fresh, independent positioning lifecycle");
    dispose();
    assert.equal(listeners.has("wheel"), false, "dispose removes user-intent listeners");
    assert.equal(listeners.has("touchmove"), false, "dispose removes touch listener");
    assert.equal(listeners.has("keydown"), false, "dispose removes key listener");
  } finally {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: originalLocation,
    });
  }
});

test("auto webpage fullscreen does not treat its own scroll event as user navigation", async () => {
  const originalLocation = globalThis.location;
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { pathname: "/12306" },
  });
  const listeners = new Map();
  let playerTop = 1_200;
  let scrolls = 0;
  const document = {
    defaultView: {
      innerHeight: 829,
      addEventListener(type, callback) { listeners.set(type, callback); },
      removeEventListener(type, callback) {
        if (listeners.get(type) === callback) listeners.delete(type);
      },
    },
    querySelector() { return null; },
  };
  try {
    const dispose = createAutoWebFullscreenFeature({
      async load() { return false; },
      async save() {},
    }).start({
      diagnostics: new Diagnostics(),
      document,
      observerHub: { subscribe() { return () => undefined; } },
      selectors: {
        find(name) {
          if (name !== "player") return null;
          return {
            element: {
              scrollIntoView() {
                scrolls += 1;
                if (scrolls === 2) playerTop = 120;
              },
              getBoundingClientRect() { return { top: playerTop, bottom: playerTop + 681 }; },
            },
            selector: ".real-player",
          };
        },
      },
    });
    assert.equal(listeners.has("scroll"), false, "scroll events are too ambiguous to represent user intent");
    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.equal(scrolls, 2, "a non-user restoration still receives bounded geometry correction");
    dispose();
  } finally {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: originalLocation,
    });
  }
});

test("auto webpage fullscreen restores only the verified diagonal-corner control", async () => {
  const originalLocation = globalThis.location;
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { pathname: "/12306" },
  });
  let mode = false;
  let clicks = 0;
  const writes = [];
  const icon = {
    querySelectorAll() {
      return [
        { getAttribute() { return "M20 25h6v-6M14 7H8v6"; } },
        { getAttribute() { return "M13 12L8 7M26 25l-5-5"; } },
      ];
    },
    click() {
      clicks += 1;
      mode = true;
    },
  };
  const browserFullscreenIcon = {
    querySelectorAll() {
      return [{
        getAttribute() {
          return "M20 25h5v-5M20 7h5v5M12 7H7v5M12 25H7v-5";
        },
      }];
    },
  };
  assert.equal(hasDouyuWebFullscreenIconSignature(icon), true);
  assert.equal(hasDouyuWebFullscreenIconSignature({
    querySelectorAll() {
      return [{ getAttribute() { return "M20 25h6v-6M14 7H8v6"; } }];
    },
  }), false, "one SVG path alone cannot identify the webpage fullscreen icon");
  assert.equal(hasDouyuWebFullscreenIconSignature(browserFullscreenIcon), false);

  const document = {
    defaultView: { innerHeight: 829, addEventListener() {}, removeEventListener() {} },
    querySelector(selector) {
      return selector.includes("wfs-2a8e83") && mode ? {} : null;
    },
  };
  try {
    const dispose = createAutoWebFullscreenFeature({
      async load() { return true; },
      async save(value) { writes.push(value); },
    }).start({
      diagnostics: new Diagnostics(),
      document,
      observerHub: { subscribe() { return () => undefined; } },
      selectors: {
        find(name) {
          if (name === "player") {
            return {
              element: {
                scrollIntoView() {},
                getBoundingClientRect() { return { top: 0, bottom: 681 }; },
              },
              selector: "#js-player-video-case",
            };
          }
          return null;
        },
        findAll(name) {
          assert.equal(name, "webFullscreenIconCandidates");
          return [{ element: icon, selector: '#js-player-controlbar [class^="right-"] > i.icon-c8be96' }];
        },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.equal(clicks, 1);
    assert.deepEqual(writes, [true]);
    dispose();
  } finally {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: originalLocation,
    });
  }
});

test("chat history is bounded, room-scoped, persistent, and restores drafts", async () => {
  const writes = [];
  const store = new ChatMemoryStore({
    rooms: {
      "1": { messages: ["old", " newest "], updatedAt: 10 },
      "2": { messages: ["other"], updatedAt: 20 },
    },
  }, (key, value) => writes.push([key, value]));
  assert.deepEqual(store.messages("1"), ["old", " newest ".trim()]);
  assert.deepEqual(store.messages("2"), ["other"]);
  await store.add("1", " next ", 30);
  await store.add("1", "next", 31);
  await store.add("2", "room two", 32);
  assert.equal(writes.at(-1)[0], CHAT_MEMORY_KEY);
  assert.deepEqual(writes.at(-1)[1].rooms["1"].messages, ["old", "newest", "next", "next"]);
  assert.deepEqual(writes.at(-1)[1].rooms["2"].messages, ["other", "room two"]);

  const bounded = parseChatMemory({
    rooms: Object.fromEntries(Array.from({ length: CHAT_MEMORY_ROOM_LIMIT + 5 }, (_, index) => [
      String(index), { messages: Array.from({ length: CHAT_MEMORY_PER_ROOM_LIMIT + 2 }, () => "x"), updatedAt: index },
    ])),
  });
  assert.equal(Object.keys(bounded.rooms).length, CHAT_MEMORY_ROOM_LIMIT);
  assert.ok(Object.values(bounded.rooms).every(({ messages }) => messages.length <= CHAT_MEMORY_PER_ROOM_LIMIT));

  const navigator = new ChatHistoryNavigator();
  assert.equal(navigator.move("older", "draft", ["a", "b"]), "b");
  assert.equal(navigator.move("older", "b", ["a", "b"]), "a");
  assert.equal(navigator.move("newer", "a", ["a", "b"]), "b");
  assert.equal(navigator.move("newer", "b", ["a", "b"]), "draft");
});

test("chat history takes over every arrow only while browsing", () => {
  const navigator = new ChatHistoryNavigator();
  const shouldHandle = (caretAtDirectionalBoundary, caretCollapsed = true) =>
    shouldTakeOverHistoryNavigation({
      isBrowsing: navigator.isBrowsing(),
      caretCollapsed,
      caretAtDirectionalBoundary,
    });

  assert.equal(shouldHandle(false), false, "ArrowUp at the end keeps native editing");
  assert.equal(shouldHandle(true), true, "ArrowUp at the start can enter history");
  assert.equal(navigator.move("older", "draft", ["oldest", "newest"]), "newest");
  assert.equal(navigator.isBrowsing(), true);

  assert.equal(shouldHandle(false), true, "browsing ignores the directional boundary");
  assert.equal(navigator.move("older", "newest", ["oldest", "newest"]), "oldest");
  assert.equal(shouldHandle(false), true);
  assert.equal(navigator.move("newer", "oldest", ["oldest", "newest"]), "newest");
  assert.equal(navigator.move("newer", "newest", ["oldest", "newest"]), "draft");
  assert.equal(navigator.isBrowsing(), false);
  assert.equal(shouldHandle(false), false, "restoring the draft exits history browsing");

  navigator.move("older", "edited draft", ["oldest", "newest"]);
  navigator.reset();
  assert.equal(navigator.isBrowsing(), false, "a trusted user edit resets browsing");
  assert.equal(shouldHandle(false), false);

  navigator.move("older", "draft", ["oldest", "newest"]);
  assert.equal(shouldHandle(false, false), false, "a non-collapsed selection stays native");
});

test("send-check queue matches only exact same-room echoes in FIFO order", () => {
  assert.equal(DANMAKU_SEND_CHECK_TIMEOUT_MS, 2000);
  assert.match(DANMAKU_SEND_CHECK_CSS, /position: absolute/);
  assert.match(DANMAKU_SEND_CHECK_CSS, /text-decoration-style: dashed/);
  const queue = new PendingChatSends();
  const first = queue.add(" same  text ", 1);
  const second = queue.add("same text", 2);
  assert.equal(queue.confirm("unrelated own message"), null);
  assert.equal(queue.size, 2);
  assert.equal(queue.confirm("same text").id, first.id);
  assert.equal(queue.markUnconfirmed(second.id).timedOut, true);
  assert.equal(queue.confirm("same text").id, second.id);
  assert.equal(queue.size, 0);
  const scoped = new PendingChatSends();
  scoped.add("room message", 1, "room-a");
  assert.equal(scoped.confirm("room message", "room-b"), null);
  assert.equal(scoped.confirm("different own message", "room-a"), null);
  assert.equal(scoped.confirm("room message", "room-a").scope, "room-a");
});

test("Douyu room resolution prefers the real $ROOM id over a numeric alias", () => {
  const page = {
    location: { pathname: "/37777" },
    $ROOM: { room_id: "3903192" },
  };
  assert.equal(resolveDouyuRoomId(page), "3903192");
  assert.equal(resolveDouyuRoomId({ location: { pathname: "/12345" }, $ROOM: {} }), "12345");
  assert.equal(resolveDouyuRoomId({ location: { pathname: "/directory/all" }, $ROOM: { room_id: "bad" } }), null);
  assert.equal(resolveDouyuRoomId({ location: { pathname: "/37777" }, $ROOM: null }), "37777");

  page.location.pathname = "/54321";
  page.$ROOM = { room_id: 998877 };
  assert.equal(resolveDouyuRoomId(page), "998877", "SPA route changes re-read the current page identity");
  page.$ROOM = { room_id: "" };
  assert.equal(resolveDouyuRoomId(page), "54321");

  const isolatedPage = {
    location: { pathname: "/37777" },
    document: {
      querySelectorAll(selector) {
        assert.equal(selector, "[data-room-id]");
        return [{ getAttribute(name) {
          assert.equal(name, "data-room-id");
          return "3903192";
        } }];
      },
    },
    $ROOM: undefined,
  };
  assert.equal(
    resolveDouyuRoomId(isolatedPage),
    "3903192",
    "isolated userscript worlds can resolve the rid from the player DOM",
  );
});

test("unconfirmed send observations persist with evidence level and correct late echoes", async () => {
  const commits = [];
  const persistence = {
    async load() {
      return [];
    },
    async commit(changed, removedIds, snapshot) {
      commits.push({ changed, removedIds, snapshot });
    },
  };
  const store = new DanmakuSendObservationStore(null, persistence);
  await store.ready();
  const attempt = {
    id: 7,
    message: " maybe hidden ",
    normalizedMessage: "maybe hidden",
    submittedAt: 10,
    timedOut: true,
    scope: "/12345",
  };
  assert.equal(
    await store.addUnconfirmed("session:7", attempt, new Date("2026-09-05T01:02:03Z")),
    true,
  );
  assert.equal(DANMAKU_SEND_OBSERVATIONS_KEY, "douyu-web-enhancer:danmaku-send-observations");
  assert.equal(commits.at(-1).changed[0].id, "session:7");
  assert.deepEqual(store.events()[0], {
    id: "session:7",
    observedAt: "2026-09-05T01:02:03.000Z",
    roomId: "12345",
    message: "maybe hidden",
    evidence: "unconfirmed",
    resolution: "pending",
    tags: [],
    note: "",
  });
  await store.setEvidence("session:7", "suspected");
  assert.equal(store.events()[0].evidence, "suspected");
  assert.equal(await store.setTag("session:7", "manual-hidden", true), true);
  assert.equal(await store.setNote("session:7", "复测 2 次，均未在公共流出现"), true);
  assert.equal(
    await store.markConfirmedDelayed("session:7", new Date("2026-09-05T01:02:05Z")),
    true,
  );
  assert.equal(store.events()[0].resolution, "confirmed-delayed");
  assert.equal(store.events()[0].resolvedAt, "2026-09-05T01:02:05.000Z");
  assert.deepEqual(store.events()[0].tags, ["manual-hidden"]);
  assert.equal(store.events()[0].note, "复测 2 次，均未在公共流出现");

  const invalidRoom = { ...attempt, id: 8, scope: "/directory/all" };
  assert.equal(await store.addUnconfirmed("session:8", invalidRoom), false);
  assert.equal(store.events().length, 1);
  assert.equal(parseDanmakuSendObservations({ events: commits.at(-1).snapshot }).events.length, 1);

  const bounded = parseDanmakuSendObservations({
    events: Array.from({ length: DANMAKU_SEND_OBSERVATIONS_LIMIT + 2 }, (_, index) => ({
      id: String(index),
      observedAt: "2026-09-05T01:02:03.000Z",
      roomId: "12345",
      message: "sample",
      evidence: "unconfirmed",
      resolution: "pending",
    })),
  });
  assert.equal(bounded.events.length, DANMAKU_SEND_OBSERVATIONS_LIMIT);
  assert.equal(bounded.events[0].id, "2");
});

test("send observations migrate legacy GM records and retain newer database state", async () => {
  const commits = [];
  const stored = {
    id: "existing",
    observedAt: "2026-09-05T01:02:03.000Z",
    roomId: "12345",
    message: "existing",
    evidence: "suspected",
    resolution: "confirmed-delayed",
    resolvedAt: "2026-09-05T01:02:06.000Z",
  };
  const legacy = {
    schemaVersion: 1,
    events: [
      { ...stored, evidence: "unconfirmed", resolution: "pending", resolvedAt: undefined },
      {
        id: "legacy-only",
        observedAt: "2026-09-05T01:02:04.000Z",
        roomId: "12345",
        message: "legacy",
        evidence: "unconfirmed",
        resolution: "pending",
      },
    ],
  };
  const store = new DanmakuSendObservationStore(legacy, {
    async load() {
      return [stored];
    },
    async commit(changed, removedIds, snapshot) {
      commits.push({ changed, removedIds, snapshot });
    },
  });
  await store.ready();
  assert.equal(store.events().length, 2);
  assert.equal(store.events().find(event => event.id === "existing").resolution, "confirmed-delayed");
  assert.deepEqual(commits[0].changed.map(event => event.id), ["legacy-only"]);
});

test("send observation persistence deletes the oldest record at its capacity", async () => {
  const baseTime = Date.parse("2026-09-05T00:00:00.000Z");
  const stored = Array.from({ length: DANMAKU_SEND_OBSERVATIONS_LIMIT }, (_, index) => ({
    id: `stored-${index}`,
    observedAt: new Date(baseTime + index).toISOString(),
    roomId: "12345",
    message: `message-${index}`,
    evidence: "unconfirmed",
    resolution: "pending",
  }));
  const commits = [];
  const store = new DanmakuSendObservationStore(null, {
    async load() {
      return stored;
    },
    async commit(changed, removedIds, snapshot) {
      commits.push({ changed, removedIds, snapshot });
    },
  });
  await store.ready();
  await store.addUnconfirmed("newest", {
    id: 1,
    message: "newest",
    normalizedMessage: "newest",
    submittedAt: baseTime + DANMAKU_SEND_OBSERVATIONS_LIMIT,
    timedOut: true,
    scope: "/12345",
  }, new Date(baseTime + DANMAKU_SEND_OBSERVATIONS_LIMIT));
  assert.deepEqual(commits.at(-1).removedIds, ["stored-0"]);
  assert.equal(commits.at(-1).snapshot.length, DANMAKU_SEND_OBSERVATIONS_LIMIT);
});

test("send observation history is shared, exportable, importable, and clearable", async () => {
  const commits = [];
  const store = new DanmakuSendObservationStore(null, {
    async load() { return []; },
    async commit(changed, removedIds, snapshot) { commits.push({ changed, removedIds, snapshot }); },
  });
  const snapshots = [];
  const stop = store.subscribe(events => snapshots.push(events));
  await store.ready();
  const attempt = {
    id: 8, message: "one", normalizedMessage: "one", submittedAt: 1, timedOut: true, scope: "/12345",
  };
  await store.addUnconfirmed("current", attempt, new Date("2026-09-05T01:02:03Z"));
  await store.markConfirmedDelayed("current", new Date("2026-09-05T01:02:05Z"));
  const exported = store.exportJson();
  assert.deepEqual(parseDanmakuSendObservationImport(JSON.parse(exported)).map(event => event.id), ["current"]);
  const imported = JSON.parse(exportDanmakuSendObservations([{ ...store.events()[0], resolution: "pending", resolvedAt: undefined }, {
    ...store.events()[0], id: "imported", message: "two", observedAt: "2026-09-05T01:02:04.000Z",
  }]));
  assert.deepEqual(await store.importJson(JSON.stringify(imported)), { imported: 2, retained: 2 });
  assert.equal(store.events().find(event => event.id === "current").resolution, "confirmed-delayed", "stale import cannot remove a local late correction");
  assert.equal(store.events().length, 2);
  assert.equal(await store.clear(), 2);
  assert.deepEqual(store.events(), []);
  assert.deepEqual(commits.at(-1).removedIds.sort(), ["current", "imported"]);
  assert.ok(snapshots.some(events => events.length === 2), "subscribers receive the shared repository snapshot");
  stop();
  assert.throws(() => parseDanmakuSendObservationImport({ events: [] }), /不支持/);
});

test("send observation review labels and filters retain the evidence distinction", () => {
  const records = [
    { id: "a", observedAt: "2026-09-05T01:02:03.000Z", roomId: "1", message: "pending", evidence: "unconfirmed", resolution: "pending", tags: ["manual-hidden"], note: "第一次复测" },
    { id: "b", observedAt: "2026-09-05T01:02:04.000Z", roomId: "2", message: "corrected", evidence: "suspected", resolution: "confirmed-delayed", tags: ["false-positive"], note: "后来收到了", resolvedAt: "2026-09-05T01:02:05.000Z" },
  ];
  assert.deepEqual(filterDanmakuObservations(records, "", "all", "all").map(record => record.id), ["b", "a"]);
  assert.deepEqual(filterDanmakuObservations(records, "2", "suspected", "confirmed-delayed").map(record => record.id), ["b"]);
  assert.deepEqual(filterDanmakuObservations(records, "", "all", "all", "false-positive", "后来").map(record => record.id), ["b"]);
  assert.equal(danmakuObservationEvidenceText("unconfirmed"), "未确认");
  assert.equal(danmakuObservationEvidenceText("suspected"), "疑似未公开");
  assert.equal(danmakuObservationResolutionText("confirmed-delayed"), "迟到更正");
});

test("send observation metadata safely migrates v1 imports and removes one confirmed false positive", async () => {
  const commits = [];
  const store = new DanmakuSendObservationStore(null, {
    async load() { return []; },
    async commit(changed, removedIds, snapshot) { commits.push({ changed, removedIds, snapshot }); },
  });
  await store.ready();
  const imported = await store.importJson(JSON.stringify({
    schema: "douyu-web-enhancer:danmaku-send-observations",
    version: 1,
    exportedAt: "2026-09-05T01:02:03.000Z",
    events: [{ id: "legacy", observedAt: "2026-09-05T01:02:03.000Z", roomId: "1", message: "legacy", evidence: "suspected", resolution: "pending" }],
  }));
  assert.deepEqual(imported, { imported: 1, retained: 1 });
  assert.deepEqual(store.events()[0].tags, []);
  assert.equal(store.events()[0].note, "");
  assert.equal(await store.setTag("legacy", "manual-visible", true), true);
  assert.equal(await store.setNote("legacy", "确认收到"), true);
  await store.importJson(JSON.stringify({
    schema: "douyu-web-enhancer:danmaku-send-observations",
    version: 1,
    exportedAt: "2026-09-05T01:02:04.000Z",
    events: [{ id: "legacy", observedAt: "2026-09-05T01:02:04.000Z", roomId: "1", message: "legacy re-import", evidence: "suspected", resolution: "pending" }],
  }));
  assert.deepEqual(store.events()[0].tags, ["manual-visible"], "v1 import cannot erase local tags");
  assert.equal(store.events()[0].note, "确认收到", "v1 import cannot erase local note");
  const exported = JSON.parse(store.exportJson());
  assert.equal(exported.version, 2);
  assert.deepEqual(exported.events[0].tags, ["manual-visible"]);
  assert.equal(await store.remove("legacy"), true);
  assert.deepEqual(commits.at(-1).removedIds, ["legacy"]);
  assert.equal(await store.remove("legacy"), false);
});

test("send observations use localStorage only when IndexedDB is unavailable", async () => {
  const values = new Map();
  const storage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
  const persistence = createBrowserDanmakuSendObservationPersistence({
    indexedDB: undefined,
    localStorage: storage,
  });
  const event = {
    id: "fallback",
    observedAt: "2026-09-05T01:02:03.000Z",
    roomId: "12345",
    message: "fallback",
    evidence: "unconfirmed",
    resolution: "pending",
    tags: [],
    note: "",
  };
  await persistence.commit([event], [], [event]);
  assert.ok(values.has(DANMAKU_SEND_OBSERVATIONS_FALLBACK_KEY));
  assert.deepEqual(await persistence.load(), [event]);
});

test("anonymous danmaku socket uses only room login, group join, and public chat messages", () => {
  class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static instances = [];
    readyState = FakeWebSocket.CONNECTING;
    sent = [];
    binaryType = "blob";
    onopen = null;
    onmessage = null;
    onerror = null;
    onclose = null;

    constructor(url) {
      this.url = url;
      FakeWebSocket.instances.push(this);
    }

    send(data) {
      this.sent.push(data);
    }

    close() {
      this.readyState = 3;
    }
  }

  const statuses = [];
  const messages = [];
  const stop = createAnonymousDanmakuConnection({
    roomId: "12345",
    WebSocketCtor: FakeWebSocket,
    random: () => 0,
    now: () => 99,
    onStatus: (status) => statuses.push(status),
    onMessage: (message) => messages.push(message),
  });
  const socket = FakeWebSocket.instances[0];
  assert.equal(socket.url, ANONYMOUS_DANMAKU_URLS[0]);
  socket.readyState = FakeWebSocket.OPEN;
  socket.onopen();
  assert.deepEqual(socket.sent.flatMap(decodeDouyuPackets), [
    "type@=loginreq/roomid@=12345/",
    "type@=joingroup/rid@=12345/gid@=-9999/",
  ]);
  assert.doesNotMatch(socket.sent.flatMap(decodeDouyuPackets).join(""), /cookie|token|uid/i);

  socket.onmessage({ data: encodeDouyuPacket("type@=loginres/") });
  socket.onmessage({
    data: encodeDouyuPacket(
      "type@=chatmsg/rid@=12345/uid@=7/nn@=viewer/txt@=hello@Sworld/cid@=abc/",
    ),
  });
  assert.deepEqual(statuses, ["connecting", "ready"]);
  assert.deepEqual(messages, [{
    roomId: "12345",
    text: "hello/world",
    receivedAt: 99,
  }]);
  assert.deepEqual(parseDouyuStt("type@=chatmsg/uid@=ignored/nn@=ignored/txt@=a@Sb@Acd/"), {
    type: "chatmsg",
    txt: "a/b@cd",
  });
  stop();
  assert.equal(socket.readyState, 3);

  const aliasRealRoomId = resolveDouyuRoomId({
    location: { pathname: "/37777" },
    $ROOM: { room_id: "3903192" },
  });
  const aliasStop = createAnonymousDanmakuConnection({
    roomId: aliasRealRoomId,
    WebSocketCtor: FakeWebSocket,
    random: () => 0,
  });
  const aliasSocket = FakeWebSocket.instances.at(-1);
  aliasSocket.readyState = FakeWebSocket.OPEN;
  aliasSocket.onopen();
  assert.deepEqual(aliasSocket.sent.flatMap(decodeDouyuPackets), [
    "type@=loginreq/roomid@=3903192/",
    "type@=joingroup/rid@=3903192/gid@=-9999/",
  ], "a live alias never gets subscribed as if it were the display number");
  aliasStop();
});

test("chat history records submissions independently from DOM echo detection", async () => {
  const memorySource = await readFile(
    new URL(
      "../packages/douyu-web-enhancer/src/features/chat-memory.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const sendCheckSource = await readFile(
    new URL(
      "../packages/douyu-web-enhancer/src/features/danmaku-send-check.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(memorySource, /createChatSubmissionListener/);
  assert.doesNotMatch(memorySource, /createChatSendTracker|onConfirmed|\.is-self/);
  assert.doesNotMatch(sendCheckSource, /ChatMemoryStore|CHAT_MEMORY_KEY/);
  assert.doesNotMatch(sendCheckSource, /onObservedOwn|danmaku-blocked/);
});

test("room metrics keeps gift revenue, nobles, and the archived time semantics", async () => {
  assert.equal(extractRoomId("/60937"), "60937");
  assert.equal(extractRoomId("/60937/"), "60937");
  assert.equal(extractRoomId("/directory/all"), null);
  assert.equal(encodeAggregatePayload("60937"), "=ATP0RmJ3MTOwYTPklmc");
  assert.deepEqual(
    parseAggregateResponse({
      code: 200,
      data: {
        "active.uv": 8123,
        "chat.uv": 7574,
        "gift.all.uv": 944,
        "gift.paid.uv": 17,
        "gift.all.price": 528730,
        "gift.paid.price": 17250,
      },
    }),
    {
      paidGiftValue: "172.50",
      totalGiftValue: "5287.30",
    },
  );
  assert.equal(parseAggregateResponse({ code: 500 }), null);
  assert.equal(parseAggregateResponse({ code: 200, data: {} }), null);
  assert.deepEqual(
    parseAggregateResponse(
      JSON.stringify({
        code: 200,
        data: { "gift.all.price": 528730, "gift.paid.price": 17250 },
      }),
    ),
    { paidGiftValue: "172.50", totalGiftValue: "5287.30" },
  );
  assert.match(metricsMarkup(), /data-dwe-metric="money"/);
  assert.match(metricsMarkup(), /data-dwe-metric="nobles"/);
  assert.match(metricsMarkup(), /data-dwe-metric="watch-time"/);
  assert.doesNotMatch(metricsMarkup(), /data-dwe-metric="broadcast-time"/);
  assert.match(metricsMarkup(), /data-dwe-metric="watch-time"[^>]*tabindex="0"/);
  assert.doesNotMatch(metricsMarkup(), /title="已播时长加载中"/);
  assert.doesNotMatch(metricsMarkup(), /data-dwe-metric="active"/);
  assert.doesNotMatch(metricsMarkup(), /data-dwe-metric="chatters"/);
  assert.deepEqual(parseBroadcastStatus({ data: { show_time: 1_700_000_000, show_status: 1 } }), {
    showTime: 1_700_000_000,
    isLive: true,
  });
  assert.deepEqual(parseBroadcastStatus({ data: { show_time: "1700000000", show_status: 2 } }), {
    showTime: 1_700_000_000,
    isLive: false,
  });
  assert.equal(parseBroadcastStatus({ data: {} }), null);
  assert.equal(parseTodayWatch({ error: 0, data: { todayWatch: 3661 } }), 3661);
  assert.equal(parseTodayWatch({ error: 1, data: { todayWatch: 3661 } }), null);
  assert.equal(formatDuration(3661.9), "01:01:01");
  assert.match(ROOM_METRICS_CSS, /\.dwe-room-metrics/);
  assert.match(ROOM_METRICS_CSS, /\.dwe-room-metrics[\s\S]*height: 28px/);
  assert.match(ROOM_METRICS_CSS, /\.dwe-room-metrics[\s\S]*align-items: center/);
  assert.match(ROOM_METRICS_CSS, /\.dwe-room-metrics[\s\S]*border-bottom: 1px solid rgba\(90, 96, 116, 0\.14\)/);
  assert.match(ROOM_METRICS_CSS, /\.dwe-room-metrics__values[\s\S]*display: flex/);
  assert.match(ROOM_METRICS_CSS, /\.dwe-room-metrics__tooltip/);
  assert.match(ROOM_METRICS_CSS, /\.layout-Player-rank[\s\S]*top: 34px !important/);

  const source = await readFile(
    new URL(
      "../packages/douyu-web-enhancer/src/features/room-metrics.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /swf_api\/h5room/);
  assert.match(source, /getCardTaskInfo/);
  assert.match(source, /Origin: "https:\/\/www\.doseeing\.com"/);
  assert.match(source, /Referer: `https:\/\/www\.doseeing\.com\/room\/\$\{roomId\}`/);
  assert.doesNotMatch(source, /anonymous: true/);
  assert.match(source, /responseType: "text"/);
  assert.match(source, /responseText \?\? response/);
  assert.match(source, /querySelector\('\[data-dwe-metric="money"\]'\)\?\.addEventListener/);
  assert.doesNotMatch(source, /element\.addEventListener\("click"/);
  assert.match(source, /fetch\(`https:\/\/www\.douyu\.com\/swf_api\/h5room/);
  assert.doesNotMatch(source, /document\.defaultView\?\.fetch/);
  assert.doesNotMatch(source, /switchTimer/);
  assert.match(source, /let broadcastText = "本场已播 \*\*\*\*"/);
  assert.match(source, /broadcastIsLive \? Math\.max\(0, now - watchSampledAt\) \/ 1000 : 0/);
  assert.match(source, /element\.getAttribute\(name\) !== value/);
  assert.match(source, /setInterval\(\(\) => \{[\s\S]*renderTimes\(\);[\s\S]*\}, 1_000\)/);
  assert.doesNotMatch(source, /mount\(\);\s*if \(!element\) return;/);
  assert.match(source, /let moneyText = "\*\*\*\*"/);
  assert.match(
    source,
    /catch \(error\)[\s\S]*moneyTitle = "礼物收入暂不可用，将自动重试";[\s\S]*updateNobles\(\)/,
  );

  const aggregate = await requestAggregate("60937", (details) => {
    assert.equal(details.responseType, "text");
    details.onload({
      status: 0,
      responseText: JSON.stringify({
        code: 200,
        data: { "gift.all.price": 528730, "gift.paid.price": 17250 },
      }),
    });
  });
  assert.deepEqual(aggregate, { paidGiftValue: "172.50", totalGiftValue: "5287.30" });
});

test("selector registry records the first matching fallback", () => {
  const matched = { id: "player" };
  const queried = [];
  const registry = new SelectorRegistry(
    {
      querySelector(selector) {
        queried.push(selector);
        return selector === ".stream__T55I3" ? matched : null;
      },
    },
    compactPlayerSelectors,
  );

  assert.deepEqual(registry.find("player"), {
    element: matched,
    selector: ".stream__T55I3",
  });
  assert.deepEqual(queried, [".layout-Player-video", ".stream__T55I3"]);
});

test("transient guidance cleanup scopes the two observed prompts and preserves nearby UI", () => {
  assert.match(TRANSIENT_GUIDANCE_CLEANUP_CSS, /FansMedalDialog-normal:has\(> \.FansMedalDialog-desc\.is-geted/);
  assert.match(TRANSIENT_GUIDANCE_CLEANUP_CSS, /#js-layout-fixed-buff-content > \.AnchorPocketTips/);
  assert.match(TRANSIENT_GUIDANCE_CLEANUP_CSS, /#js-layout-fixed-buff[^{}]*\.close__D27HS/);
  assert.match(TRANSIENT_GUIDANCE_CLEANUP_CSS, /pointer-events: none/);
  assert.doesNotMatch(TRANSIENT_GUIDANCE_CLEANUP_CSS, /#js-layout-fixed-buff\s*\{/);
});

test("bag info parses the read-only contract without treating exp as expiry", () => {
  const data = parseBackpackResponse({
    error: 0,
    msg: "success",
    data: {
      totalNum: 60,
      validNum: 60,
      list: [
        { id: 5, propType: 2, count: 1, price: 20, intimate: 2, isValuable: 0, exp: 2, expiry: 31, met: 1793030649 },
        {
          id: 23,
          propType: 2,
          count: 2,
          price: 10,
          intimate: 1,
          isValuable: 1,
          exp: 1,
          expiry: 18,
          met: 1791956514,
          batchInfo: { "520": { batchNum: 520, name: "我爱你" } },
        },
      ],
    },
  });
  assert.ok(data);
  assert.equal(data.items[0].exp, 2);
  assert.equal(data.items[0].met, 1793030649);
  assert.deepEqual(data.items[1].batchInfo["520"], { batchNum: 520, name: "我爱你" });
  assert.equal(backpackItemKey(2, 23), "2:23");
  assert.deepEqual(calculateBackpackSummary(data.items), { totalValue: 0.2, totalIntimacy: 4 });
  assert.equal(extractBackpackRoomId({ pathname: "/52" }), "52");
  assert.equal(extractBackpackRoomId({ pathname: "/room/52" }), null);
});

test("bag expiry uses met seconds, permanent/expired/unknown states, and conservative fallback", () => {
  const now = 1_790_443_790_000;
  const timed = formatBackpackExpiry({ met: 1_793_030_649, exp: 2, expiry: 31 }, now);
  assert.equal(timed.status, "timed");
  assert.match(timed.text, /天|小时/);
  assert.match(timed.title, /2026/);
  assert.doesNotMatch(timed.title, /1970/);
  assert.equal(formatBackpackExpiry({ met: -1, exp: 2, expiry: 31 }, now).text, "永久有效");
  assert.equal(formatBackpackExpiry({ met: 1, exp: 2, expiry: 31 }, 2_000).text, "已到期");
  assert.equal(formatBackpackExpiry({ met: null, exp: 2, expiry: 1 }, now).text, "今天到期");
  assert.equal(formatBackpackExpiry({ met: null, exp: 1, expiry: 2 }, now).text, "明天到期");
  assert.equal(formatBackpackExpiry({ met: null, exp: 1, expiry: null }, now).text, "期限未知");
});

test("bag API request is same-origin, single-read, and rejects business errors", async () => {
  const calls = [];
  const data = await requestBackpackData("52", async (url, init) => {
    calls.push([url, init]);
    return new Response(JSON.stringify({ error: 0, data: { list: [] } }), { status: 200 });
  });
  assert.deepEqual(data.items, []);
  assert.deepEqual(calls, [[
    "/japi/prop/backpack/web/v5?rid=52",
    { credentials: "same-origin", signal: calls[0][1].signal },
  ]]);
  await assert.rejects(
    () => requestBackpackData("52", async () => new Response(JSON.stringify({ error: 9, msg: "请登录" }), { status: 200 })),
    /请登录/,
  );
  assert.match(BAG_INFO_CSS, /data-dwe-bag-info-expiry/);
  assert.equal(BAG_INFO_ID, "bag-info");
});

test("feature runtime is idempotent and cleans up on disable", () => {
  let starts = 0;
  let disposals = 0;
  const diagnostics = new Diagnostics();
  const runtime = new FeatureRuntime(
    { diagnostics },
    [
      {
        id: "example",
        start() {
          starts += 1;
          return () => {
            disposals += 1;
          };
        },
      },
    ],
  );

  runtime.enable("example");
  runtime.enable("example");
  runtime.disable("example");
  assert.equal(starts, 1);
  assert.equal(disposals, 1);
  assert.equal(diagnostics.snapshot("test", "https://example.com").features[0].status, "disabled");
});

test("persisted feature restoration isolates startup failures", () => {
  const diagnostics = new Diagnostics();
  const runtime = new FeatureRuntime(
    { diagnostics },
    [
      {
        id: "broken-send-check",
        start() {
          throw new Error("missing echo DOM");
        },
      },
      {
        id: "working-chat-memory",
        start() {
          diagnostics.update("working-chat-memory", "active");
        },
      },
    ],
  );
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args);
  try {
    applyPersistedFeatureSettings(structuredClone(DEFAULT_SETTINGS), runtime, [
      { id: "broken-send-check", setting: "danmakuSendCheck" },
      { id: "working-chat-memory", setting: "chatMemory" },
    ]);
  } finally {
    console.error = originalError;
  }
  assert.equal(runtime.isEnabled("broken-send-check"), false);
  assert.equal(runtime.isEnabled("working-chat-memory"), true);
  assert.equal(errors.length, 1);
});

test("persisted simplified-mode settings restore the actual feature runtime", async () => {
  const persisted = structuredClone(DEFAULT_SETTINGS);
  const settingsStore = new SettingsStore(() => persisted, () => undefined);
  const settings = await settingsStore.load();
  const diagnostics = new Diagnostics();
  const attributes = new Map();
  const installedStyles = new Set();
  const toolbarHost = {
    closest() {
      return null;
    },
    setAttribute() {},
  };
  const document = {
    defaultView: {
      dispatchEvent() {},
    },
    fullscreenElement: null,
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
    removeEventListener() {},
  };
  const runtime = new FeatureRuntime(
    {
      diagnostics,
      document,
      observerHub: {
        subscribe() {
          return () => undefined;
        },
      },
      root: {
        setAttribute(key, value) {
          attributes.set(key, value);
        },
        removeAttribute(key) {
          attributes.delete(key);
        },
      },
      selectors: {
        find(key) {
          return {
            element: key === "playerToolbar" ? { parentElement: toolbarHost } : {},
            selector: `.${key}`,
          };
        },
      },
      styles: {
        add(id) {
          installedStyles.add(id);
          return () => installedStyles.delete(id);
        },
      },
    },
    [
      compactPlayerFeature,
      chatLayoutFeature,
      chatDecorationCleanupFeature,
      transientGuidanceCleanupFeature,
      {
        id: ROOM_METRICS_ID,
        start({ diagnostics, root, styles }) {
          root.setAttribute("data-dwe-room-metrics-test", "on");
          const removeStyle = styles.add(ROOM_METRICS_ID, ROOM_METRICS_CSS);
          diagnostics.update(ROOM_METRICS_ID, "active");
          return () => {
            root.removeAttribute("data-dwe-room-metrics-test");
            removeStyle();
          };
        },
      },
    ],
  );
  const bindings = [
    { id: COMPACT_PLAYER_ID, setting: "compactPlayer" },
    { id: CHAT_LAYOUT_ID, setting: "chatLayout" },
    { id: CHAT_DECORATION_CLEANUP_ID, setting: "chatDecorationCleanup" },
    { id: TRANSIENT_GUIDANCE_CLEANUP_ID, setting: "transientGuidanceCleanup" },
    { id: ROOM_METRICS_ID, setting: "roomMetrics" },
  ];

  applyPersistedFeatureSettings(settings, runtime, bindings);

  for (const { id } of bindings) assert.equal(runtime.isEnabled(id), true);
  assert.equal(attributes.get("data-dwe-room-metrics-test"), "on");
  for (const { id } of bindings) assert.equal(installedStyles.has(id), true);
  assert.deepEqual(
    diagnostics
      .snapshot("test", "https://www.douyu.com/60937")
      .features.map(({ id, status }) => [id, status]),
    [
      [CHAT_DECORATION_CLEANUP_ID, "active"],
      [CHAT_LAYOUT_ID, "active"],
      [COMPACT_PLAYER_ID, "active"],
      [ROOM_METRICS_ID, "active"],
      [TRANSIENT_GUIDANCE_CLEANUP_ID, "active"],
    ],
  );

  await togglePersistedFeature(
    "chatLayout",
    settings,
    settingsStore,
    runtime,
    bindings,
  );
  assert.equal(settings.features.chatLayout, false);
  assert.equal(runtime.isEnabled(CHAT_LAYOUT_ID), false);
  assert.equal(installedStyles.has(CHAT_LAYOUT_ID), false);
});

test("observer hub rate-limits mutation storms and cancels pending scans", async () => {
  let notify;
  let scans = 0;
  let disconnected = false;
  const hub = new ObserverHub({}, (callback) => {
    notify = callback;
    return {
      observe() {},
      disconnect() {
        disconnected = true;
      },
    };
  });
  hub.subscribe(() => {
    scans += 1;
  });

  for (let index = 0; index < 100; index += 1) notify([], {});
  assert.equal(scans, 0);
  await new Promise((resolve) => setTimeout(resolve, 70));
  assert.equal(scans, 1);

  notify([], {});
  hub.destroy();
  await new Promise((resolve) => setTimeout(resolve, 70));
  assert.equal(scans, 1);
  assert.equal(disconnected, true);
});

test("compact player activation is controlled by style registration", () => {
  assert.doesNotMatch(COMPACT_PLAYER_CSS, /data-dwe-compact-player=/);
  assert.match(COMPACT_PLAYER_CSS, /\.PlayerToolbar-ContentRow/);
  assert.match(
    COMPACT_PLAYER_CSS,
    /\.PlayerToolbar > \.PlayerToolbar-ContentRow:first-child/,
  );
  assert.doesNotMatch(COMPACT_PLAYER_CSS, /\.InteractABAd/);
  assert.match(COMPACT_PLAYER_CSS, /bottom: 0 !important/);
  assert.deepEqual(compactPlayerSelectors.giftBar, [
    "#js-player-toolbar .PlayerToolbar > .PlayerToolbar-ContentRow:first-child",
    ".PlayerToolbar > .PlayerToolbar-ContentRow:first-child",
  ]);
  assert.deepEqual(compactPlayerSelectors.player, [
    ".layout-Player-video",
    ".stream__T55I3",
  ]);
  assert.deepEqual(compactPlayerSelectors.playerToolbar, ["#js-player-toolbar"]);
  assert.match(COMPACT_PLAYER_CSS, /#js-player-toolbar[\s\S]*z-index: 30 !important/);
  assert.match(
    COMPACT_PLAYER_CSS,
    new RegExp(`\\[${COMPACT_PLAYER_TOOLBAR_HOST_ATTRIBUTE}="on"\\][\\s\\S]*z-index: 20 !important`),
  );
  assert.match(COMPACT_PLAYER_CSS, /\.case__f4yex[\s\S]*bottom: -84px !important/);
});

test("chat layout hides rankings and lifts the barrage panel", () => {
  assert.doesNotMatch(CHAT_LAYOUT_CSS, /data-dwe-chat-layout/);
  assert.match(CHAT_LAYOUT_CSS, /\.layout-Player-rank/);
  assert.match(CHAT_LAYOUT_CSS, /#js-room-activity/);
  assert.match(CHAT_LAYOUT_CSS, /\.Barrage[\s\S]*top: 0 !important/);
});

test("chat decoration cleanup keeps messages and hides only prefixes", () => {
  assert.doesNotMatch(CHAT_DECORATION_CLEANUP_CSS, /data-dwe-chat-decoration-cleanup/);
  for (const selector of [
    ".Barrage-icon",
    ".ChatAchievement",
    ".Baby",
    ".FansMedalWrap",
  ]) {
    assert.ok(CHAT_DECORATION_CLEANUP_CSS.includes(selector));
  }
  assert.doesNotMatch(CHAT_DECORATION_CLEANUP_CSS, /\.Barrage-listItem\s*\{/);
});

test("simplified chat features remove their registered styles when disabled", () => {
  for (const feature of [chatLayoutFeature, chatDecorationCleanupFeature]) {
    let styleRemoved = false;
    const dispose = feature.start({
      diagnostics: new Diagnostics(),
      observerHub: {
        subscribe() {
          return () => void 0;
        },
      },
      root: {},
      selectors: {
        find(key) {
          return { element: {}, selector: `.${key}` };
        },
      },
      styles: {
        add() {
          return () => {
            styleRemoved = true;
          };
        },
      },
    });

    dispose();
    assert.equal(styleRemoved, true);
  }
});

test("simplified mode keeps frequent controls next to their page context", async () => {
  assert.deepEqual(
    CHAT_CONTROL_DEFINITIONS.map(({ setting, label }) => [setting, label]),
    [
      ["chatDecorationCleanup", "前缀"],
      ["chatLayout", "拉高"],
    ],
  );
  assert.deepEqual(simplifiedModeControlSelectors.barrageToolbar, [
    ".Barrage-toolbar",
  ]);
  assert.deepEqual(simplifiedModeControlSelectors.playerDialog, [
    "#js-player-dialog",
  ]);
  assert.deepEqual(simplifiedModeControlSelectors.playerSettingsMenu, [
    ".menu-da2a9e",
  ]);
  assert.match(SIMPLIFIED_MODE_CONTROLS_CSS, /\.dwe-chat-control/);
  assert.match(SIMPLIFIED_MODE_CONTROLS_CSS, /\.dwe-compact-player-float/);
  assert.match(SIMPLIFIED_MODE_CONTROLS_CSS, /left: 18px/);
  assert.match(SIMPLIFIED_MODE_CONTROLS_CSS, /bottom: 58px/);
  assert.doesNotMatch(SIMPLIFIED_MODE_CONTROLS_CSS, /\.dwe-confirm-/);
  assert.match(
    SIMPLIFIED_MODE_CONTROLS_CSS,
    /\.dwe-chat-control\[aria-pressed="true"\][^{]*\{[^}]*background:/s,
  );
  assert.ok(
    CHAT_CONTROL_DEFINITIONS.every(({ iconPath }) => iconPath.length > 20),
  );
  assert.ok(
    CHAT_CONTROL_DEFINITIONS.every(
      (definition) => !("enableConfirmation" in definition),
    ),
  );

  const mainSource = await readFile(
    new URL(
      "../packages/douyu-web-enhancer/src/main.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(mainSource.match(/GM_registerMenuCommand\(/g)?.length, 2);
  assert.match(mainSource, /复制自动化日志/);
  assert.match(mainSource, /mountSimplifiedModeControls/);

  const controlsSource = await readFile(
    new URL(
      "../packages/douyu-web-enhancer/src/ui/simplified-mode-controls.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(controlsSource, /dialog\.insertBefore\(floatingControl, dialog\.firstChild\)/);
  assert.match(controlsSource, /menu\.insertBefore\(item, menu\.lastChild\)/);
  assert.match(controlsSource, /floatingControl\.ariaLabel = enabled/);
  assert.match(
    controlsSource,
    /if \(menuControl\.textContent !== label\) menuControl\.textContent = label/,
  );
  assert.doesNotMatch(controlsSource, /playerVolumeControl/);
  assert.doesNotMatch(controlsSource, /confirmAction|dwe-confirm-container/);
});

test("preview package has narrow userscript permissions", async () => {
  const packageJson = JSON.parse(
    await readFile(
      new URL("../packages/douyu-web-enhancer/package.json", import.meta.url),
      "utf8",
    ),
  );
  const viteConfig = await readFile(
    new URL("../packages/douyu-web-enhancer/vite.config.ts", import.meta.url),
    "utf8",
  );

  assert.equal(packageJson.userscript.publish, false);
  assert.match(viteConfig, /match: \["https:\/\/www\.douyu\.com\/\*"\]/);
  assert.match(viteConfig, /releaseUrls: false/);
  assert.match(viteConfig, /"GM_xmlhttpRequest"/);
  assert.match(viteConfig, /"GM\.xmlHttpRequest"/);
  for (const host of [
    "www.doseeing.com",
    "apiv2.douyucdn.cn",
    "mapi-yuba.douyu.com",
    "yuba.douyu.com",
  ]) {
    assert.match(viteConfig, new RegExp(`"${host.replaceAll(".", "\\.")}"`));
  }
  assert.doesNotMatch(viteConfig, /require:/);
});
