import type { ObserverHub } from "../core/observer-hub.ts";
import type { SelectorRegistry } from "../core/selectors.ts";
import type { Settings } from "../core/settings.ts";
import type { StyleRegistry } from "../core/styles.ts";

export const SIMPLIFIED_MODE_CONTROLS_ID = "simplified-mode-controls";

export const simplifiedModeControlSelectors = {
  barrageToolbar: [".Barrage-toolbar"],
  playerDialog: ["#js-player-dialog"],
  playerSurface: [".layout-Player-video", ".stream__T55I3"],
  playerBox: [".room-Player-Box"],
  playerSettingsMenu: [".menu-da2a9e"],
} as const;

export const SIMPLIFIED_MODE_CONTROLS_CSS = `
.dwe-chat-control {
  appearance: none;
  display: inline-flex;
  align-items: center;
  vertical-align: top;
  margin: 0 2px;
  padding: 0 8px;
  height: 22px;
  line-height: 21px;
  color: inherit;
  background-color: #fff;
  border: 1px solid #e5e4e4;
  border-radius: 4px;
  cursor: pointer;
  font: inherit;
  user-select: none;
}

.live-next-body .dwe-chat-control {
  background-color: var(--front-background-color);
  border-color: var(--front-border-color);
}

.dwe-chat-control[aria-pressed="true"] {
  color: #fff;
  background: linear-gradient(180deg, rgb(38, 169, 235), rgb(18, 150, 219));
  border-color: rgb(18, 150, 219);
  box-shadow: 0 0 0 2px rgba(18, 150, 219, 0.22), 0 8px 16px rgba(18, 150, 219, 0.28);
  font-weight: 700;
}

.dwe-chat-control[aria-pressed="true"]::after {
  content: "";
  width: 6px;
  height: 6px;
  margin-left: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.22);
}

.dwe-chat-control:focus-visible {
  outline: 2px solid rgba(18, 150, 219, 0.45);
  outline-offset: 1px;
}

.dwe-chat-control[aria-disabled="true"] {
  cursor: wait;
  opacity: 0.45;
  pointer-events: none;
}

.dwe-chat-control__icon {
  display: block;
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  fill: #afafaf;
}

.dwe-chat-control[aria-pressed="true"] .dwe-chat-control__icon {
  fill: #fff;
}

.dwe-chat-control__label {
  line-height: 21px;
  white-space: nowrap;
}

.dwe-compact-player-float {
  appearance: none;
  position: absolute;
  left: 18px;
  bottom: 58px;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0 10px;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  border: 0;
  border-radius: 14px;
  cursor: pointer;
  font: inherit;
  opacity: 0;
  pointer-events: none;
  transform: scale(0.9);
  transition: opacity 0.15s ease, transform 0.15s ease, background-color 0.15s ease, box-shadow 0.3s ease;
  user-select: none;
}

.dwe-compact-player-float[data-dwe-visible="true"] {
  opacity: 1;
  pointer-events: auto;
  transform: scale(1);
}

.dwe-compact-player-float:hover,
.dwe-compact-player-float:focus-visible {
  background-color: rgba(0, 0, 0, 0.7);
  transform: scale(1.08);
}

.dwe-compact-player-float__content {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dwe-compact-player-float__label {
  font-size: 12px;
  white-space: nowrap;
}

.dwe-compact-player-switch {
  position: relative;
  width: 26px;
  height: 14px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 7px;
  transition: background 0.3s;
}

.dwe-compact-player-switch::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 10px;
  height: 10px;
  background: #fff;
  border-radius: 50%;
  transition: left 0.3s;
}

.dwe-compact-player-float[aria-pressed="true"] .dwe-compact-player-switch {
  background: #f60;
}

.dwe-compact-player-float[aria-pressed="true"] .dwe-compact-player-switch::after {
  left: 14px;
}

.dwe-compact-player-float[data-dwe-emphasis="true"] {
  opacity: 1;
  pointer-events: auto;
  transform: scale(1.1);
  background-color: rgba(0, 0, 0, 0.8);
  box-shadow: 0 0 15px rgba(255, 102, 0, 0.6);
}

`;

type SettingKey = keyof Settings["features"];

interface ControlDefinition {
  setting: SettingKey;
  label: string;
  iconPath: string;
  enabledTitle: string;
  disabledTitle: string;
}

export const CHAT_CONTROL_DEFINITIONS: readonly ControlDefinition[] = [
  {
    setting: "chatDecorationCleanup",
    label: "前缀",
    iconPath:
      "M588.416 516.096 787.2 317.312a54.016 54.016 0 1 0-76.416-76.416L512 439.68 313.216 241.024A54.016 54.016 0 1 0 236.8 317.376l198.784 198.848-198.016 197.888a54.016 54.016 0 1 0 76.416 76.416L512 592.576l197.888 197.952a54.016 54.016 0 1 0 76.416-76.416L588.416 516.096z",
    enabledTitle: "显示弹幕前缀",
    disabledTitle: "隐藏弹幕前缀",
  },
  {
    setting: "chatLayout",
    label: "拉高",
    iconPath: "M512 128 192 448h192v448h256V448h192L512 128z",
    enabledTitle: "恢复礼物榜和弹幕区高度",
    disabledTitle: "隐藏礼物榜并拉高弹幕区",
  },
] as const;

interface SimplifiedModeControlsOptions {
  document: Document;
  observerHub: ObserverHub;
  selectors: SelectorRegistry;
  styles: StyleRegistry;
  getSettings: () => Settings;
  toggle: (setting: SettingKey) => Promise<void>;
}

function updateButton(
  button: HTMLElement,
  definition: ControlDefinition,
  enabled: boolean,
): void {
  button.setAttribute("aria-pressed", String(enabled));
  button.title = enabled ? definition.enabledTitle : definition.disabledTitle;
}

export function mountSimplifiedModeControls({
  document,
  observerHub,
  selectors,
  styles,
  getSettings,
  toggle,
}: SimplifiedModeControlsOptions): () => void {
  const removeStyle = styles.add(
    SIMPLIFIED_MODE_CONTROLS_ID,
    SIMPLIFIED_MODE_CONTROLS_CSS,
  );
  const abortController = new AbortController();
  const observedHoverTargets = new WeakSet<EventTarget>();
  let hideTimer: number | undefined;
  let floatingControl: HTMLButtonElement | null = null;
  let floatingHovered = false;

  const updateAllControls = (): void => {
    for (const definition of CHAT_CONTROL_DEFINITIONS) {
      const button = document.querySelector<HTMLElement>(
        `[data-dwe-setting="${definition.setting}"]`,
      );
      if (button) {
        updateButton(button, definition, getSettings().features[definition.setting]);
      }
    }

    const enabled = getSettings().features.compactPlayer;
    const menuControl = document.querySelector<HTMLElement>(
      '[data-dwe-setting="compactPlayer"][data-dwe-control="menu"]',
    );
    if (menuControl) {
      const label = enabled ? "✓ 隐藏礼物栏" : "隐藏礼物栏";
      if (menuControl.textContent !== label) menuControl.textContent = label;
      menuControl.setAttribute("aria-pressed", String(enabled));
    }
    if (floatingControl) {
      floatingControl.setAttribute("aria-pressed", String(enabled));
      floatingControl.ariaLabel = enabled ? "显示礼物栏" : "隐藏礼物栏";
      floatingControl.title = enabled ? "点击显示礼物栏" : "点击隐藏礼物栏";
    }
  };

  const runToggle = async (
    control: HTMLElement,
    definition: ControlDefinition,
  ): Promise<void> => {
    control.setAttribute("aria-disabled", "true");
    try {
      await toggle(definition.setting);
      updateAllControls();
      if (
        definition.setting === "compactPlayer" &&
        getSettings().features.compactPlayer &&
        floatingControl
      ) {
        floatingControl.dataset.dweEmphasis = "true";
        document.defaultView?.setTimeout(() => {
          floatingControl?.removeAttribute("data-dwe-emphasis");
          showFloatingControl();
        }, 800);
      }
    } finally {
      control.removeAttribute("aria-disabled");
    }
  };

  const createChatButton = (definition: ControlDefinition): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dwe-chat-control";
    button.dataset.dweSetting = definition.setting;
    button.dataset.dweControl = "chat-toolbar";
    button.addEventListener(
      "click",
      (event) => {
        event.stopPropagation();
        void runToggle(button, definition);
      },
      { signal: abortController.signal },
    );

    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("class", "dwe-chat-control__icon");
    icon.setAttribute("viewBox", "0 0 1024 1024");
    icon.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", definition.iconPath);
    icon.append(path);
    const spacer = document.createElement("i");
    spacer.className = "Barrage-toolbarIcon";
    const label = document.createElement("span");
    label.className = "dwe-chat-control__label Barrage-toolbarText";
    label.textContent = definition.label;
    button.append(icon, spacer, label);
    return button;
  };

  const mountChatControls = (): void => {
    const toolbar = selectors.find<HTMLElement>("barrageToolbar")?.element;
    if (!toolbar) return;
    for (const definition of [...CHAT_CONTROL_DEFINITIONS].reverse()) {
      let button = toolbar.querySelector<HTMLButtonElement>(
        `[data-dwe-setting="${definition.setting}"]`,
      );
      if (!button) {
        button = createChatButton(definition);
        toolbar.prepend(button);
      }
    }
  };

  const compactDefinition: ControlDefinition = {
    setting: "compactPlayer",
    label: "隐藏礼物栏",
    iconPath: "",
    enabledTitle: "点击显示礼物栏",
    disabledTitle: "点击隐藏礼物栏",
  };

  const mountPlayerMenuControl = (): void => {
    const menu = selectors.find<HTMLElement>("playerSettingsMenu")?.element;
    if (!menu) return;
    let item = menu.querySelector<HTMLElement>(
      '[data-dwe-setting="compactPlayer"][data-dwe-control="menu"]',
    );
    if (!item) {
      item = document.createElement("li");
      item.tabIndex = 0;
      item.dataset.dweSetting = "compactPlayer";
      item.dataset.dweControl = "menu";
      item.addEventListener("click", (event) => {
        event.stopPropagation();
        void runToggle(item!, compactDefinition);
      }, { signal: abortController.signal });
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          void runToggle(item!, compactDefinition);
        }
      }, { signal: abortController.signal });
      menu.insertBefore(item, menu.lastChild);
    }
  };

  const hideFloatingControl = (): void => {
    if (!floatingControl || floatingHovered) return;
    floatingControl.dataset.dweVisible = "false";
    if (hideTimer !== undefined) document.defaultView?.clearTimeout(hideTimer);
  };

  const showFloatingControl = (): void => {
    if (!floatingControl) return;
    floatingControl.dataset.dweVisible = "true";
    if (hideTimer !== undefined) document.defaultView?.clearTimeout(hideTimer);
    hideTimer = document.defaultView?.setTimeout(hideFloatingControl, 2000);
  };

  const observeHoverTarget = (target: HTMLElement, move = false): void => {
    if (observedHoverTargets.has(target)) return;
    observedHoverTargets.add(target);
    target.addEventListener(move ? "mousemove" : "mouseenter", showFloatingControl, {
      signal: abortController.signal,
    });
    if (!move) {
      target.addEventListener("mouseleave", hideFloatingControl, {
        signal: abortController.signal,
      });
    }
  };

  const mountFloatingControl = (): void => {
    const dialog = selectors.find<HTMLElement>("playerDialog")?.element;
    if (!dialog) return;
    floatingControl = dialog.querySelector<HTMLButtonElement>(
      '[data-dwe-setting="compactPlayer"][data-dwe-control="floating"]',
    );
    if (!floatingControl) {
      floatingControl = document.createElement("button");
      floatingControl.type = "button";
      floatingControl.className = "dwe-compact-player-float";
      floatingControl.dataset.dweSetting = "compactPlayer";
      floatingControl.dataset.dweControl = "floating";
      floatingControl.dataset.dweVisible = "false";
      floatingControl.innerHTML = '<span class="dwe-compact-player-float__content"><span class="dwe-compact-player-float__label">隐藏礼物栏</span><span class="dwe-compact-player-switch" aria-hidden="true"></span></span>';
      floatingControl.addEventListener("click", (event) => {
        event.stopPropagation();
        void runToggle(floatingControl!, compactDefinition).then(showFloatingControl);
      }, { signal: abortController.signal });
      floatingControl.addEventListener("mouseenter", () => {
        floatingHovered = true;
        if (hideTimer !== undefined) document.defaultView?.clearTimeout(hideTimer);
      }, { signal: abortController.signal });
      floatingControl.addEventListener("mouseleave", () => {
        floatingHovered = false;
        showFloatingControl();
      }, { signal: abortController.signal });
      dialog.insertBefore(floatingControl, dialog.firstChild);
    }

    const surface = selectors.find<HTMLElement>("playerSurface")?.element;
    const box = selectors.find<HTMLElement>("playerBox")?.element;
    if (surface) observeHoverTarget(surface);
    if (box) observeHoverTarget(box, true);
  };

  const scan = (): void => {
    mountChatControls();
    mountPlayerMenuControl();
    mountFloatingControl();
    updateAllControls();
  };
  const stopWatching = observerHub.subscribe(scan);
  const onSettingsChanged = (): void => updateAllControls();
  document.addEventListener("dwe-settings-changed", onSettingsChanged);
  scan();

  return () => {
    stopWatching();
    document.removeEventListener("dwe-settings-changed", onSettingsChanged);
    abortController.abort();
    if (hideTimer !== undefined) document.defaultView?.clearTimeout(hideTimer);
    removeStyle();
    for (const control of document.querySelectorAll("[data-dwe-control]")) {
      control.remove();
    }
  };
}
