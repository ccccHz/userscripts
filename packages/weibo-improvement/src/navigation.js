export function waitForElement(
  selector,
  {
    documentObject = document,
    setTimeoutFunction = setTimeout,
    interval = 100,
  } = {},
) {
  return new Promise((resolve) => {
    const check = () => {
      const element = documentObject.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }
      setTimeoutFunction(check, interval);
    };
    check();
  });
}

export function startHomePageRedirect({
  documentObject = document,
  windowObject = window,
  waitForElementFunction = waitForElement,
} = {}) {
  if (windowObject.location?.href !== "https://weibo.com/") return null;

  return waitForElementFunction('[title="最新微博"]', {
    documentObject,
  }).then((element) => element.click());
}
