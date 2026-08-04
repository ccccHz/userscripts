import {
  installWeiboPreventScrollFocus,
  isWeiboCommentInput,
} from "./weibo-focus-guard.js";

const targets = [
  { url: "yuba.douyu.com", selector: "Editor-module__SR5oVG__editor" },
  { url: "douban.com/search?", selector: "[autofocus]" },
  { url: "weibo.com", matches: isWeiboCommentInput },
];

function waitForElements(selector) {
  return new Promise((resolve) => {
    const startObserving = () => {
      if (document.querySelector(selector)) {
        resolve(document.querySelectorAll(selector));
        return;
      }

      const observer = new MutationObserver(() => {
        if (!document.querySelector(selector)) return;
        resolve(document.querySelectorAll(selector));
        observer.disconnect();
      });
      observer.observe(document.body ?? document.documentElement, {
        childList: true,
        subtree: true,
      });
    };

    if (document.body || document.documentElement) {
      startObserving();
    } else {
      document.addEventListener("DOMContentLoaded", startObserving, {
        once: true,
      });
    }
  });
}

function startBlur() {
  for (const target of targets) {
    if (!location.href.includes(target.url)) continue;

    if (target.url.includes("weibo")) {
      document.addEventListener("focusin", (event) => {
        if (target.matches(event.target)) event.target.blur();
      });
      continue;
    }

    if (target.url.includes("yuba")) {
      document.addEventListener("focusin", (event) => {
        const className =
          typeof event.target?.className === "string"
            ? event.target.className
            : "";
        if (className.includes(target.selector)) event.target.blur();
      });
      continue;
    }

    waitForElements(target.selector).then((elements) => {
      for (const element of elements) element.blur();
    });
  }
}

function blurTaobao() {
  if (location.href.includes("taobao.com")) document.activeElement?.blur();
}

if (location.href.includes("weibo.com")) {
  installWeiboPreventScrollFocus();
}
startBlur();
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", blurTaobao, { once: true });
} else {
  blurTaobao();
}
