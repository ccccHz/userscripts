const targets = [
  { url: "yuba.douyu.com", selector: "Editor-module__SR5oVG__editor" },
  { url: "douban.com/search?", selector: "[autofocus]" },
  { url: "weibo.com", selector: "_input_1fox3_8" },
];

function waitForElements(selector) {
  return new Promise((resolve) => {
    if (document.querySelector(selector)) {
      resolve(document.querySelectorAll(selector));
      return;
    }

    const observer = new MutationObserver(() => {
      if (!document.querySelector(selector)) return;
      resolve(document.querySelectorAll(selector));
      observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

function startBlur() {
  for (const target of targets) {
    if (!location.href.includes(target.url)) continue;

    if (target.url.includes("weibo") || target.url.includes("yuba")) {
      document.addEventListener("focusin", (event) => {
        if (event.target.className.indexOf(target.selector) > -1) {
          event.target.blur();
        }
      });
      continue;
    }

    waitForElements(target.selector).then((elements) => {
      for (const element of elements) element.blur();
    });
  }
}

function blurTaobao() {
  if (location.href.includes("taobao.com")) document.activeElement.blur();
}

startBlur();
blurTaobao();
