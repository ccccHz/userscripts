export const SETTINGS_KEY = "douyu-web-enhancer:settings";
export const SETTINGS_SCHEMA_VERSION = 6;

export interface Settings {
  schemaVersion: 6;
  features: {
    chatMemory: boolean;
    chatDecorationCleanup: boolean;
    chatLayout: boolean;
    compactPlayer: boolean;
    danmakuSendCheck: boolean;
    roomMetrics: boolean;
    volumeWheel: boolean;
    liveTimeshiftControls: boolean;
    dailyAutomation: boolean;
    highestVideoQuality: boolean;
    messageContextActionFallback: boolean;
    disableOfflineJump: boolean;
  };
  preferences: {
    /** The user's last Douyu web-fullscreen choice. This replaces the v5 GM key. */
    autoWebFullscreen: boolean;
  };
  automation: {
    /** null means keep auto-fans-continue's established default room. */
    autoFansRestRoomId: string | null;
    /** Individual task gate; the daily scheduler remains enabled independently. */
    autoFansContinue: boolean;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  features: {
    chatMemory: true,
    chatDecorationCleanup: true,
    chatLayout: true,
    compactPlayer: true,
    danmakuSendCheck: true,
    roomMetrics: true,
    volumeWheel: true,
    liveTimeshiftControls: true,
    dailyAutomation: false,
    highestVideoQuality: false,
    messageContextActionFallback: true,
    disableOfflineJump: true,
  },
  preferences: { autoWebFullscreen: true },
  automation: { autoFansRestRoomId: null, autoFansContinue: true },
};

function roomId(value: unknown): string | null {
  return typeof value === "string" && /^[1-9]\d*$/.test(value) ? value : null;
}

export interface SettingsDifference {
  path: string;
  before: string;
  after: string;
}

const featureKeys = [
  "chatMemory", "chatDecorationCleanup", "chatLayout", "compactPlayer",
  "danmakuSendCheck", "roomMetrics", "volumeWheel", "liveTimeshiftControls", "dailyAutomation", "highestVideoQuality", "messageContextActionFallback", "disableOfflineJump",
] as const;
const preferenceKeys = ["autoWebFullscreen"] as const;
const automationKeys = ["autoFansRestRoomId", "autoFansContinue"] as const;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const unknown = Object.keys(value).filter((key) => !keys.includes(key));
  const missing = keys.filter((key) => !(key in value));
  if (unknown.length) throw new Error(`${label} 含未知字段：${unknown.join("、")}`);
  if (missing.length) throw new Error(`${label} 缺少字段：${missing.join("、")}`);
}

function booleanSetting(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} 必须是布尔值`);
  return value;
}

/** Strictly parse an exported Settings v6 snapshot without silently dropping data. */
export function parseSettingsImport(value: unknown): Settings {
  const root = record(value, "设置文件");
  exactKeys(root, ["schemaVersion", "features", "preferences", "automation"], "设置文件");
  if (root.schemaVersion !== SETTINGS_SCHEMA_VERSION) {
    throw new Error(`不支持 Settings v${String(root.schemaVersion)}；请选择完整的 v${SETTINGS_SCHEMA_VERSION} 设置导出文件`);
  }
  const features = record(root.features, "features");
  const preferences = record(root.preferences, "preferences");
  const automation = record(root.automation, "automation");
  exactKeys(features, featureKeys, "features");
  exactKeys(preferences, preferenceKeys, "preferences");
  exactKeys(automation, automationKeys, "automation");
  const importedRoomId = automation.autoFansRestRoomId;
  if (importedRoomId !== null && roomId(importedRoomId) === null) {
    throw new Error("automation.autoFansRestRoomId 必须是 null 或正整数房间号");
  }
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    features: Object.fromEntries(featureKeys.map((key) => [key, booleanSetting(features[key], `features.${key}`)])) as Settings["features"],
    preferences: {
      autoWebFullscreen: booleanSetting(preferences.autoWebFullscreen, "preferences.autoWebFullscreen"),
    },
    automation: {
      autoFansRestRoomId: importedRoomId as string | null,
      autoFansContinue: booleanSetting(automation.autoFansContinue, "automation.autoFansContinue"),
    },
  };
}

const labels: Record<string, string> = {
  "features.chatMemory": "弹幕历史",
  "features.chatDecorationCleanup": "隐藏弹幕前缀",
  "features.chatLayout": "拉高弹幕区",
  "features.compactPlayer": "隐藏礼物栏",
  "features.danmakuSendCheck": "发送检测",
  "features.roomMetrics": "房间统计",
  "features.volumeWheel": "滚轮调音量",
  "features.liveTimeshiftControls": "直播时移控制",
  "features.dailyAutomation": "每日自动化",
  "features.highestVideoQuality": "自动最高画质",
  "features.messageContextActionFallback": "弹幕右键补全",
  "features.disableOfflineJump": "下播后停留当前页",
  "preferences.autoWebFullscreen": "记住网页全屏",
  "automation.autoFansRestRoomId": "剩余荧光棒赠送房间",
  "automation.autoFansContinue": "自动续荧光棒",
};

function displayValue(value: unknown): string {
  if (value === null) return "默认房间 12306";
  return value === true ? "开启" : value === false ? "关闭" : String(value);
}

/** Returns all supported user-editable settings that a full snapshot would change. */
export function diffSettings(before: Settings, after: Settings): SettingsDifference[] {
  const paths = [
    ...featureKeys.map((key) => `features.${key}`),
    ...preferenceKeys.map((key) => `preferences.${key}`),
    ...automationKeys.map((key) => `automation.${key}`),
  ];
  return paths.flatMap((path) => {
    const [group, key] = path.split(".") as [keyof Settings, string];
    const beforeValue = before[group][key as never];
    const afterValue = after[group][key as never];
    return beforeValue === afterValue ? [] : [{ path: labels[path] ?? path, before: displayValue(beforeValue), after: displayValue(afterValue) }];
  });
}

type ValueReader = (key: string, fallback: unknown) => unknown | Promise<unknown>;
type ValueWriter = (key: string, value: unknown) => void | Promise<void>;

function parseSettings(value: unknown): Settings {
  if (!value || typeof value !== "object") return structuredClone(DEFAULT_SETTINGS);
  const record = value as Record<string, unknown>;
  const features =
    record.features && typeof record.features === "object"
      ? (record.features as Record<string, unknown>)
      : {};
  const preferences =
    record.preferences && typeof record.preferences === "object"
      ? (record.preferences as Record<string, unknown>)
      : {};
  const automation =
    record.automation && typeof record.automation === "object"
      ? (record.automation as Record<string, unknown>)
      : {};

  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    features: {
      chatMemory:
        typeof features.chatMemory === "boolean"
          ? features.chatMemory
          : DEFAULT_SETTINGS.features.chatMemory,
      chatDecorationCleanup:
        typeof features.chatDecorationCleanup === "boolean"
          ? features.chatDecorationCleanup
          : DEFAULT_SETTINGS.features.chatDecorationCleanup,
      chatLayout:
        typeof features.chatLayout === "boolean"
          ? features.chatLayout
          : DEFAULT_SETTINGS.features.chatLayout,
      compactPlayer:
        typeof features.compactPlayer === "boolean"
          ? features.compactPlayer
          : DEFAULT_SETTINGS.features.compactPlayer,
      danmakuSendCheck:
        typeof features.danmakuSendCheck === "boolean"
          ? features.danmakuSendCheck
          : DEFAULT_SETTINGS.features.danmakuSendCheck,
      roomMetrics:
        typeof features.roomMetrics === "boolean"
          ? features.roomMetrics
          : DEFAULT_SETTINGS.features.roomMetrics,
      volumeWheel:
        typeof features.volumeWheel === "boolean"
          ? features.volumeWheel
          : DEFAULT_SETTINGS.features.volumeWheel,
      liveTimeshiftControls:
        typeof features.liveTimeshiftControls === "boolean"
          ? features.liveTimeshiftControls
          : DEFAULT_SETTINGS.features.liveTimeshiftControls,
      dailyAutomation:
        typeof features.dailyAutomation === "boolean"
          ? features.dailyAutomation
          : DEFAULT_SETTINGS.features.dailyAutomation,
      highestVideoQuality:
        typeof features.highestVideoQuality === "boolean"
          ? features.highestVideoQuality
          : DEFAULT_SETTINGS.features.highestVideoQuality,
      messageContextActionFallback:
        typeof features.messageContextActionFallback === "boolean"
          ? features.messageContextActionFallback
          : DEFAULT_SETTINGS.features.messageContextActionFallback,
      disableOfflineJump:
        typeof features.disableOfflineJump === "boolean"
          ? features.disableOfflineJump
          : DEFAULT_SETTINGS.features.disableOfflineJump,
    },
    preferences: {
      autoWebFullscreen:
        typeof preferences.autoWebFullscreen === "boolean"
          ? preferences.autoWebFullscreen
          : DEFAULT_SETTINGS.preferences.autoWebFullscreen,
    },
    automation: {
      autoFansRestRoomId: roomId(automation.autoFansRestRoomId),
      autoFansContinue:
        typeof automation.autoFansContinue === "boolean"
          ? automation.autoFansContinue
          : DEFAULT_SETTINGS.automation.autoFansContinue,
    },
  };
}

export class SettingsStore {
  readonly #read: ValueReader;
  readonly #write: ValueWriter;

  constructor(read: ValueReader, write: ValueWriter) {
    this.#read = read;
    this.#write = write;
  }

  async load(): Promise<Settings> {
    return parseSettings(await this.#read(SETTINGS_KEY, DEFAULT_SETTINGS));
  }

  /** Exposed for tests and for the one-way v5 -> v6 migration in main. */
  normalize(value: unknown): Settings {
    return parseSettings(value);
  }

  async save(settings: Settings): Promise<void> {
    await this.#write(SETTINGS_KEY, parseSettings(settings));
  }
}
