import type { FeatureRuntime } from "./feature.ts";
import type { Settings, SettingsStore } from "./settings.ts";

export type FeatureSettingKey = keyof Settings["features"];

export interface FeatureSettingBinding {
  id: string;
  setting: FeatureSettingKey;
}

export function applyPersistedFeatureSettings(
  settings: Settings,
  runtime: FeatureRuntime,
  bindings: readonly FeatureSettingBinding[],
): void {
  for (const { id, setting } of bindings) {
    try {
      if (settings.features[setting]) runtime.enable(id);
      else runtime.disable(id);
    } catch (error) {
      console.error(`[douyu-web-enhancer] 功能 ${id} 启动失败，继续恢复其他功能`, error);
    }
  }
}

/**
 * Stores a complete Settings snapshot before reconciling feature runtime.
 * A failed write leaves the caller's current settings and runtime untouched.
 */
export async function saveAndApplySettingsSnapshot(
  next: Settings,
  settingsStore: Pick<SettingsStore, "save">,
  runtime: FeatureRuntime,
  bindings: readonly FeatureSettingBinding[],
): Promise<Settings> {
  const snapshot = structuredClone(next);
  await settingsStore.save(snapshot);
  applyPersistedFeatureSettings(snapshot, runtime, bindings);
  return snapshot;
}

export async function togglePersistedFeature(
  setting: FeatureSettingKey,
  settings: Settings,
  settingsStore: SettingsStore,
  runtime: FeatureRuntime,
  bindings: readonly FeatureSettingBinding[],
): Promise<void> {
  const binding = bindings.find((item) => item.setting === setting);
  if (!binding) throw new Error(`Unknown feature setting: ${setting}`);

  const wasEnabled = runtime.isEnabled(binding.id);
  const enabled = !wasEnabled;
  if (enabled) runtime.enable(binding.id);
  else runtime.disable(binding.id);
  settings.features[setting] = runtime.isEnabled(binding.id);

  try {
    await settingsStore.save(settings);
  } catch (error) {
    if (wasEnabled) runtime.enable(binding.id);
    else runtime.disable(binding.id);
    settings.features[setting] = runtime.isEnabled(binding.id);
    throw error;
  }
}
