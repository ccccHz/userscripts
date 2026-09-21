import type { FeatureDefinition } from "../core/feature.ts";

export const HIGHEST_VIDEO_QUALITY_ID = "highest-video-quality";
export const HIGHEST_VIDEO_QUALITY_MAX_ATTEMPTS = 12;
export const HIGHEST_VIDEO_QUALITY_WAIT_MS = 250;
export const HIGHEST_VIDEO_QUALITY_VERIFY_MS = 350;

export function isDouyuNumericRoomPage(locationLike: Pick<Location, "hostname" | "pathname">): boolean {
  return locationLike.hostname === "www.douyu.com" && /^\/\d+$/.test(locationLike.pathname);
}

function textOf(element: Element): string {
  return element.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function classText(element: Element): string {
  return typeof element.className === "string" ? element.className : "";
}

export function isSelectedQualityOption(element: Element): boolean {
  return (
    /(?:^|\s)selected(?:-|\s|$)/i.test(classText(element)) ||
    element.getAttribute("aria-selected") === "true" ||
    element.getAttribute("data-selected") === "true"
  );
}

export function isQualityOptionRestricted(element: Element): boolean {
  const state = `${classText(element)} ${element.getAttribute("aria-label") ?? ""} ${textOf(element)}`;
  return /disabled|disable|unavailable|forbidden|locked|lock|vip|pay|paid|login|登录|VIP|付费|收费|锁定|未开通|不可用/i.test(state)
    || element.hasAttribute("disabled")
    || element.getAttribute("aria-disabled") === "true"
    || Boolean(element.closest("[disabled], [aria-disabled='true'], [inert]"));
}

export function isActionableQualityOption(element: Element): boolean {
  if (!textOf(element) || isSelectedQualityOption(element) && isQualityOptionRestricted(element)) return false;
  if (isQualityOptionRestricted(element)) return false;
  const ownerDocument = element.ownerDocument;
  const style = ownerDocument.defaultView?.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style?.display !== "none" &&
    style?.visibility !== "hidden" &&
    style?.pointerEvents !== "none"
  );
}

interface QualityMenu {
  root: HTMLElement;
  options: HTMLElement[];
}

function findQualityMenus(player: Element): QualityMenu[] {
  const roots = new Set<HTMLElement>();
  for (const input of player.querySelectorAll<HTMLInputElement>("input[value^='画质']")) {
    let current: HTMLElement | null = input.parentElement;
    for (let depth = 0; current && depth < 4; depth += 1, current = current.parentElement) {
      const options = [...current.querySelectorAll<HTMLElement>("ul > li")];
      if (options.length > 0) {
        roots.add(current);
        break;
      }
    }
  }
  return [...roots].map((root) => ({
    root,
    options: [...root.querySelectorAll<HTMLElement>("ul > li")].filter((option) => textOf(option)),
  }));
}

function hasVisibleRect(element: Element): boolean {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && style?.display !== "none" && style?.visibility !== "hidden";
}

function findQualityTrigger(menu: QualityMenu): HTMLElement | null {
  const rate = menu.root.closest<HTMLElement>("[class^='rate-']");
  if (!rate) return null;
  const selected = menu.options.find(isSelectedQualityOption)?.textContent?.trim();
  if (!selected) return null;
  return [...rate.querySelectorAll<HTMLElement>("div,span,button")]
    .filter((element) => element !== menu.root && !menu.root.contains(element))
    .filter((element) => textOf(element) === selected && hasVisibleRect(element))
    .sort((left, right) => right.getBoundingClientRect().width - left.getBoundingClientRect().width)[0] ?? null;
}

function closeQualityMenu(player: Element): void {
  const menus = findQualityMenus(player);
  if (menus.length !== 1 || !menus[0].options.some(hasVisibleRect)) return;
  const trigger = findQualityTrigger(menus[0]);
  if (trigger && hasVisibleRect(trigger)) trigger.click();
}

function qualityLabelIsVisible(player: Element, label: string): boolean {
  return [...player.querySelectorAll<HTMLElement>("[class^='textLabel-'], [class^='text-']")]
    .some((element) => textOf(element) === label && hasVisibleRect(element));
}

export const highestVideoQualityFeature: FeatureDefinition = {
  id: HIGHEST_VIDEO_QUALITY_ID,
  start({ diagnostics, document, observerHub, selectors }) {
    let disposed = false;
    let roomPath = "";
    let playerElement: Element | null = null;
    let attempts = 0;
    let menuOpened = false;
    let transactionDone = false;
    let clickIssued = false;
    let targetLabel = "";
    let targetIndex = -1;
    let waitTimer: ReturnType<typeof setTimeout> | undefined;
    let verifyTimer: ReturnType<typeof setTimeout> | undefined;
    let ignoredPlayerUntil = 0;
    let manualTakeoverRoom: string | null = null;

    const currentLocation = (): Pick<Location, "hostname" | "pathname"> => ({
      hostname: globalThis.location?.hostname ?? "",
      pathname: globalThis.location?.pathname ?? "",
    });

    const clearTimers = () => {
      if (waitTimer !== undefined) clearTimeout(waitTimer);
      if (verifyTimer !== undefined) clearTimeout(verifyTimer);
      waitTimer = undefined;
      verifyTimer = undefined;
    };

    const finish = (status: "active" | "degraded", detail: string, selector?: string) => {
      clearTimers();
      transactionDone = true;
      clickIssued = false;
      diagnostics.update(HIGHEST_VIDEO_QUALITY_ID, status, { detail, selector });
    };

    const beginTransaction = (path: string, player: Element | null) => {
      clearTimers();
      roomPath = path;
      playerElement = player;
      attempts = 0;
      menuOpened = false;
      transactionDone = manualTakeoverRoom === path;
      clickIssued = false;
      targetLabel = "";
      targetIndex = -1;
      if (transactionDone) {
        diagnostics.update(HIGHEST_VIDEO_QUALITY_ID, "active", {
          detail: "用户已接管本直播间画质，不再自动抢回",
        });
      }
    };

    const scheduleWait = (scan: () => void) => {
      if (waitTimer !== undefined || transactionDone || clickIssued) return;
      if (attempts >= HIGHEST_VIDEO_QUALITY_MAX_ATTEMPTS) {
        finish("degraded", "播放器或画质菜单在有界等待内不可操作，未执行点击");
        return;
      }
      attempts += 1;
      waitTimer = setTimeout(() => {
        waitTimer = undefined;
        if (!disposed) scan();
      }, HIGHEST_VIDEO_QUALITY_WAIT_MS);
    };

    const verify = (player: Element): boolean => {
      const menus = findQualityMenus(player);
      const menu = menus.length === 1 ? menus[0] : undefined;
      const option = menu?.options[targetIndex];
      return Boolean(
        option &&
        textOf(option) === targetLabel &&
        isSelectedQualityOption(option),
      ) || qualityLabelIsVisible(player, targetLabel);
    };

    const onQualityInteraction = (event: Event) => {
      if (disposed || event.isTrusted === false || !playerElement) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const option = target.closest<HTMLElement>("ul > li");
      if (!option || !playerElement.contains(option)) return;
      if (!isActionableQualityOption(option) || isSelectedQualityOption(option)) return;
      manualTakeoverRoom = roomPath;
      ignoredPlayerUntil = Date.now() + 4_000;
      finish("active", "用户已手动选择画质，本直播间不再自动抢回");
    };

    const scan = () => {
      if (disposed) return;
      const current = currentLocation();
      if (roomPath !== current.pathname) {
        manualTakeoverRoom = null;
        beginTransaction(current.pathname, null);
      }
      if (!isDouyuNumericRoomPage(current)) {
        clearTimers();
        diagnostics.update(HIGHEST_VIDEO_QUALITY_ID, "waiting", {
          detail: "页面不适用：仅作用于 www.douyu.com 数字直播间",
        });
        return;
      }

      const player = selectors.find<HTMLElement>("player");
      if (!player) {
        diagnostics.update(HIGHEST_VIDEO_QUALITY_ID, "waiting", { detail: "等待真实播放器挂载" });
        scheduleWait(scan);
        return;
      }
      if (playerElement && player.element && player.element !== playerElement) {
        if (manualTakeoverRoom === current.pathname || Date.now() < ignoredPlayerUntil) {
          playerElement = player.element;
        } else {
          beginTransaction(current.pathname, player.element);
        }
      } else if (!playerElement && player) {
        playerElement = player.element;
      }
      if (transactionDone) return;
      if (clickIssued) {
        if (verify(player.element)) {
          finish("active", `已选择当前账号可用的最高画质：${targetLabel}`, `画质菜单第 ${targetIndex + 1} 项`);
        }
        return;
      }

      const menus = findQualityMenus(player.element);
      if (menus.length !== 1) {
        diagnostics.update(HIGHEST_VIDEO_QUALITY_ID, "waiting", {
          detail: menus.length === 0 ? "等待官方画质菜单挂载" : "画质候选不唯一，安全结束本次事务",
        });
        if (menus.length > 1) finish("degraded", "画质候选不唯一，未猜测点击");
        else scheduleWait(scan);
        return;
      }
      const menu = menus[0];
      const visibleOptions = menu.options.some(hasVisibleRect);
      if (!visibleOptions) {
        const trigger = findQualityTrigger(menu);
        if (!trigger || !hasVisibleRect(trigger)) {
          diagnostics.update(HIGHEST_VIDEO_QUALITY_ID, "waiting", { detail: "等待官方画质控件达到可操作状态" });
          scheduleWait(scan);
          return;
        }
        if (!menuOpened) {
          menuOpened = true;
          trigger.click();
          diagnostics.update(HIGHEST_VIDEO_QUALITY_ID, "waiting", { detail: "已打开官方画质菜单，等待档位可操作" });
        }
        scheduleWait(scan);
        return;
      }

      const candidates = menu.options.filter(isActionableQualityOption);
      const target = candidates[0];
      if (!target) {
        finish("degraded", "当前账号没有可实际点击的画质档位");
        return;
      }
      const duplicateTarget = candidates.filter((option) => textOf(option) === textOf(target)).length > 1;
      if (duplicateTarget) {
        finish("degraded", "最高可用画质候选不唯一，未猜测点击");
        return;
      }
      if (isSelectedQualityOption(target)) {
        finish("active", `当前已是最高可用画质：${textOf(target)}`);
        return;
      }

      targetLabel = textOf(target);
      targetIndex = menu.options.indexOf(target);
      clickIssued = true;
      ignoredPlayerUntil = Date.now() + 4_000;
      target.click();
      closeQualityMenu(player.element);
      diagnostics.update(HIGHEST_VIDEO_QUALITY_ID, "waiting", { detail: `已尝试选择最高画质，正在验证：${targetLabel}` });
      verifyTimer = setTimeout(() => {
        verifyTimer = undefined;
        if (disposed || !playerElement || !clickIssued) return;
        if (verify(playerElement)) {
          closeQualityMenu(playerElement);
          finish("active", `已选择当前账号可用的最高画质：${targetLabel}`, `画质菜单第 ${targetIndex + 1} 项`);
        } else {
          finish("degraded", `最高画质选择验证失败：${targetLabel}，本直播间不再重复点击`);
        }
      }, HIGHEST_VIDEO_QUALITY_VERIFY_MS);
    };

    const stopWatching = observerHub.subscribe(scan);
    document.addEventListener("click", onQualityInteraction, true);
    document.addEventListener("pointerdown", onQualityInteraction, true);
    document.defaultView?.addEventListener("popstate", scan);
    scan();

    return () => {
      disposed = true;
      clearTimers();
      stopWatching();
      document.removeEventListener("click", onQualityInteraction, true);
      document.removeEventListener("pointerdown", onQualityInteraction, true);
      document.defaultView?.removeEventListener("popstate", scan);
    };
  },
};
