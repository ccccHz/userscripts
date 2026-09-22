/**
 * Restore the narrow DouyuEx player_barrage workaround without fetching or
 * replaying any page script. This module is intentionally independent from
 * FeatureRuntime: the hooks must exist before Douyu's bootstrap runs.
 */

export const DANMAKU_AVAILABILITY_ID = "danmaku-availability";

const HOOK_STATE_KEY = Symbol.for("douyu-web-enhancer.danmaku-availability");
const TARGET_RESPONSE_MARKER = "/betard";
const ESCAPED_DISABLED = 'player_barrage\\":0';
const ESCAPED_ENABLED = 'player_barrage\\":1';
const JSON_DISABLED = '"player_barrage":0';
const JSON_ENABLED = '"player_barrage":1';

export interface DanmakuReplacementResult {
  text: string;
  replacements: number;
  observedEnabled: boolean;
}

export interface DanmakuAvailabilitySnapshot {
  installed: boolean;
  inlineHooks: number;
  responseHook: boolean;
  observedEnabled: number;
  rewrites: number;
  misses: number;
  degraded: number;
  errors: number;
  lastError?: string;
}

export interface DanmakuAvailabilityHook {
  snapshot(): DanmakuAvailabilitySnapshot;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

type HookTarget = Window & typeof globalThis;
type HookState = {
  target: HookTargetWithState;
  refs: number;
  snapshot: DanmakuAvailabilitySnapshot;
  subscribers: Set<() => void>;
  restore: Array<() => void>;
};

type HookTargetWithState = HookTarget & {
  [HOOK_STATE_KEY]?: HookState;
};

function isKeyBoundary(text: string, index: number, escaped: boolean): boolean {
  let boundary = escaped ? index - 2 : index - 1;
  if (escaped && text[index - 1] !== "\"") return false;
  if (escaped && text[index - 2] === "\\") boundary -= 1;
  while (boundary >= 0 && /\s/.test(text[boundary])) boundary -= 1;
  return boundary < 0 || text[boundary] === "{" || text[boundary] === ",";
}

function replaceDelimitedOccurrences(
  text: string,
  marker: string,
  replacement: string,
  escaped: boolean,
): { text: string; count: number } {
  let count = 0;
  let offset = 0;
  let result = "";
  while (true) {
    const index = text.indexOf(marker, offset);
    if (index === -1) {
      result += text.slice(offset);
      return { text: result, count };
    }
    if (!isKeyBoundary(text, index, escaped)) {
      result += text.slice(offset, index + marker.length);
      offset = index + marker.length;
      continue;
    }
    result += text.slice(offset, index) + replacement;
    offset = index + marker.length;
    count += 1;
  }
}

function hasDelimitedOccurrence(text: string, marker: string, escaped: boolean): boolean {
  let offset = 0;
  while (true) {
    const index = text.indexOf(marker, offset);
    if (index === -1) return false;
    if (isKeyBoundary(text, index, escaped)) return true;
    offset = index + marker.length;
  }
}

/** Purely replace the two serialized forms proven by the archived script. */
export function replacePlayerBarrage(text: string): DanmakuReplacementResult {
  const escaped = replaceDelimitedOccurrences(text, ESCAPED_DISABLED, ESCAPED_ENABLED, true);
  const json = replaceDelimitedOccurrences(escaped.text, JSON_DISABLED, JSON_ENABLED, false);
  return {
    text: json.text,
    replacements: escaped.count + json.count,
    observedEnabled:
      hasDelimitedOccurrence(text, ESCAPED_ENABLED, true) ||
      hasDelimitedOccurrence(text, JSON_ENABLED, false),
  };
}

function isInlineScript(node: unknown): node is HTMLScriptElement {
  if (!node || typeof node !== "object") return false;
  const candidate = node as Partial<HTMLScriptElement> & { nodeName?: unknown; tagName?: unknown };
  const name = typeof candidate.tagName === "string"
    ? candidate.tagName
    : typeof candidate.nodeName === "string"
      ? candidate.nodeName
      : "";
  if (name.toUpperCase() !== "SCRIPT") return false;
  if (typeof candidate.src === "string" && candidate.src.length > 0) return false;
  return typeof candidate.textContent === "string";
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function notify(state: HookState): void {
  for (const subscriber of state.subscribers) {
    try {
      subscriber();
    } catch {
      // Diagnostics/UI subscribers must never change page method semantics.
    }
  }
}

function recordError(state: HookState, error: unknown): void {
  state.snapshot.errors += 1;
  state.snapshot.lastError = errorText(error);
  notify(state);
}

function recordTextObservation(state: HookState, result: DanmakuReplacementResult): void {
  if (result.observedEnabled) state.snapshot.observedEnabled += 1;
  if (result.replacements > 0) state.snapshot.rewrites += result.replacements;
  else state.snapshot.misses += 1;
  notify(state);
}

function installInlineHook(
  state: HookState,
  target: HookTarget,
  methodName: "appendChild" | "insertBefore",
): void {
  const nodePrototype = target.Node?.prototype;
  if (!nodePrototype) {
    state.snapshot.degraded += 1;
    return;
  }
  const descriptor = Object.getOwnPropertyDescriptor(nodePrototype, methodName);
  if (!descriptor || typeof descriptor.value !== "function" || !descriptor.configurable) {
    state.snapshot.degraded += 1;
    return;
  }

  const original = descriptor.value as (...args: unknown[]) => unknown;
  const wrapped = function (this: Node, ...args: unknown[]): unknown {
    const script = args[0];
    if (!isInlineScript(script)) return Reflect.apply(original, this, args);

    const originalText = script.textContent;
    const result = replacePlayerBarrage(originalText);
    recordTextObservation(state, result);
    if (result.replacements === 0) return Reflect.apply(original, this, args);

    try {
      script.textContent = result.text;
    } catch (error) {
      recordError(state, error);
      return Reflect.apply(original, this, args);
    }
    try {
      return Reflect.apply(original, this, args);
    } catch (error) {
      try {
        script.textContent = originalText;
      } catch (error) {
        recordError(state, error);
      }
      throw error;
    }
  };

  try {
    Object.defineProperty(nodePrototype, methodName, {
      ...descriptor,
      value: wrapped,
    });
    state.snapshot.inlineHooks += 1;
    state.restore.push(() => {
      const current = Object.getOwnPropertyDescriptor(nodePrototype, methodName);
      if (current?.value !== wrapped) return;
      try {
        Object.defineProperty(nodePrototype, methodName, descriptor);
      } catch (error) {
        recordError(state, error);
      }
    });
  } catch (error) {
    state.snapshot.degraded += 1;
    recordError(state, error);
  }
}

function installResponseHook(state: HookState, target: HookTarget): void {
  const xhrPrototype = target.XMLHttpRequest?.prototype;
  if (!xhrPrototype) {
    state.snapshot.degraded += 1;
    return;
  }
  const descriptor = Object.getOwnPropertyDescriptor(xhrPrototype, "responseText");
  if (!descriptor || typeof descriptor.get !== "function" || !descriptor.configurable) {
    state.snapshot.degraded += 1;
    return;
  }
  const originalGetter = descriptor.get;
  const wrappedGetter = function (this: XMLHttpRequest): string {
    const text = originalGetter.call(this);
    if (typeof text !== "string") return text;

    let url = "";
    try {
      url = typeof this.responseURL === "string" ? this.responseURL : "";
    } catch (error) {
      recordError(state, error);
      return text;
    }
    if (!url.includes(TARGET_RESPONSE_MARKER)) return text;

    const result = replacePlayerBarrage(text);
    recordTextObservation(state, result);
    return result.text;
  };

  try {
    Object.defineProperty(xhrPrototype, "responseText", {
      ...descriptor,
      get: wrappedGetter,
    });
    state.snapshot.responseHook = true;
    state.restore.push(() => {
      const current = Object.getOwnPropertyDescriptor(xhrPrototype, "responseText");
      if (current?.get !== wrappedGetter) return;
      try {
        Object.defineProperty(xhrPrototype, "responseText", descriptor);
      } catch (error) {
        recordError(state, error);
      }
    });
  } catch (error) {
    state.snapshot.degraded += 1;
    recordError(state, error);
  }
}

function createHandle(state: HookState): DanmakuAvailabilityHook {
  let disposed = false;
  return {
    snapshot: () => ({ ...state.snapshot }),
    subscribe(listener) {
      state.subscribers.add(listener);
      return () => state.subscribers.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      state.refs -= 1;
      if (state.refs > 0) return;
      for (const restore of state.restore.splice(0).reverse()) restore();
      state.snapshot.installed = false;
      notify(state);
      // Only remove our own registry entry. A page script may have replaced it.
      if (state.target[HOOK_STATE_KEY] === state) {
        try {
          delete state.target[HOOK_STATE_KEY];
        } catch {
          // A non-configurable page property must be left alone.
        }
      }
    },
  };
}

/** Install once per page realm; repeated calls share the same reversible hooks. */
export function installDanmakuAvailabilityHook(
  target: HookTarget = globalThis as HookTarget,
): DanmakuAvailabilityHook {
  const registry = target as HookTargetWithState;
  const existing = registry[HOOK_STATE_KEY];
  if (existing) {
    existing.refs += 1;
    return createHandle(existing);
  }

  const state: HookState = {
    target: registry,
    refs: 1,
    snapshot: {
      installed: true,
      inlineHooks: 0,
      responseHook: false,
      observedEnabled: 0,
      rewrites: 0,
      misses: 0,
      degraded: 0,
      errors: 0,
    },
    subscribers: new Set(),
    restore: [],
  };

  try {
    Object.defineProperty(registry, HOOK_STATE_KEY, {
      configurable: true,
      value: state,
    });
  } catch (error) {
    state.snapshot.degraded += 1;
    recordError(state, error);
  }

  installInlineHook(state, target, "appendChild");
  installInlineHook(state, target, "insertBefore");
  installResponseHook(state, target);
  notify(state);
  return createHandle(state);
}
