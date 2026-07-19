function autoDark() {
  const matchList = matchMedia("(prefers-color-scheme: dark)");
  const check = (isSystemDark) => {
    const isCurrentDark = document
      .getElementsByTagName("html")[0]
      .getAttribute("data-theme")
      .includes("dark");
    if (isCurrentDark === isSystemDark) return;

    let changeButton = document.querySelector(
      '[title="日间模式"], [title="夜间模式"]',
    );
    if (changeButton) {
      changeButton.click();
      return;
    }

    const fold = document.querySelector(".Nav_fold_3kBjD");
    if (!fold) {
      console.log("exception 当前页面找不到折叠按钮");
      return;
    }
    fold.firstChild?.firstChild.click();

    const observer = new MutationObserver((_mutations, currentObserver) => {
      changeButton = document.querySelector(
        '[class*="Dark"]',
      )?.firstChild?.firstChild?.firstChild;
      if (!changeButton) return;
      changeButton.click();
      fold.firstChild?.firstChild.click();
      currentObserver.disconnect();
    });
    observer.observe(fold, { childList: true, subtree: true });
  };

  check(matchList.matches);
  matchList.addEventListener("change", (event) => check(event.matches));
}

function wait(selector) {
  return new Promise((resolve) => {
    const check = () => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });
}

function homePageRedirect() {
  if (window.location.href === "https://weibo.com/") {
    wait('[title="最新微博"]').then((element) => element.click());
  }
}

console.log("weibo_improve loaded");
autoDark();
homePageRedirect();
