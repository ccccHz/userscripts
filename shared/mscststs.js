class MscststsTools {
  sleep(miliseconds) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, miliseconds);
    });
  }

  async _Step(selector, callback, needContent, timeout) {
    while (timeout--) {
      if (document.querySelector(selector) === null) {
        await this.sleep(100);
        continue;
      }

      if (needContent) {
        if (document.querySelector(selector).innerText.length === 0) {
          await this.sleep(100);
          continue;
        }
      }

      break;
    }

    callback(selector);
  }

  wait(selector, needContent = false, timeout = Infinity) {
    return new Promise((resolve) => {
      this._Step(
        selector,
        (matchedSelector) => {
          resolve(document.querySelector(matchedSelector));
        },
        needContent,
        timeout,
      );
    });
  }

  hijackXMLHttpRequest(options, selfWindow = getDefaultWindow()) {
    const rawXHR = selfWindow.XMLHttpRequest;

    selfWindow.XMLHttpRequest = function (...args) {
      const xhrInstance = new rawXHR(...args);

      return new Proxy(xhrInstance, {
        get(target, property) {
          if (typeof target[property] === "function") {
            return function (...methodArgs) {
              const before =
                options[`before${String(property)}`] || ((...beforeArgs) => beforeArgs);
              const after = options[`after${String(property)}`] || ((result) => result);

              return after(target[property](...before(...methodArgs)));
            };
          }

          return target[property];
        },
      });
    };

    return function abort() {
      selfWindow.XMLHttpRequest = rawXHR;
    };
  }
}

function getDefaultWindow() {
  if (typeof self !== "undefined") return self;
  if (typeof window !== "undefined") return window;
  return globalThis;
}

const mscststs = new MscststsTools();
mscststs.sleep = mscststs.sleep.bind(mscststs);
mscststs.wait = mscststs.wait.bind(mscststs);
mscststs.hijackXMLHttpRequest =
  mscststs.hijackXMLHttpRequest.bind(mscststs);

export const sleep = mscststs.sleep;
export const wait = mscststs.wait;
export const hijackXMLHttpRequest = mscststs.hijackXMLHttpRequest;

export { mscststs };
export default mscststs;
