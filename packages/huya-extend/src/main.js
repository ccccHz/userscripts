function ad_rm() {
  // 获取当前日期和时间
  const currentDate = new Date();
  const showDate = `${currentDate.getMonth() + 1}/${currentDate.getDate()}/${currentDate.getFullYear()}`;
  const lastShowTime = Math.floor(currentDate.getTime() / 1000);

  // 从 localStorage 读取 preadShow 数据
  let preadShowData = JSON.parse(localStorage.getItem("preadShow"));

  // 如果 preadShowData 不存在，则创建一个默认对象
  if (!preadShowData) {
    preadShowData = {
      showDate: showDate,
      failCount: 0,
      success: 1,
      lastShowTime: lastShowTime,
    };
  } else {
    // 修改 showDate 和 lastShowTime 为当前时间，并递增 success
    preadShowData.showDate = showDate;
    preadShowData.lastShowTime = lastShowTime;
    preadShowData.success += 1;
  }

  // 更新 localStorage 中的 preadShow 数据
  localStorage.setItem("preadShow", JSON.stringify(preadShowData));
}

async function auto_high_rate() {
  const resolu = await mscststs.wait(".player-videotype-list");
  while (
    Array.from(resolu.childNodes).some(
      (node) => node.tagName !== "LI" || node.innerText.length === 0,
    )
  ) {
    await mscststs.sleep(100);
  }
  if (resolu.firstChild.innerText.includes("扫码") && resolu.childNodes.length > 1) {
    resolu.childNodes[1].click();
  } else {
    resolu.firstChild.click();
  }
}

const mscststs = new (class {
  sleep(miliseconds) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, miliseconds);
    });
  }

  async _Step(selector, callback, need_content, timeout) {
    while (timeout--) {
      if (document.querySelector(selector) === null) {
        await this.sleep(100);
        continue;
      }
      if (need_content) {
        if (document.querySelector(selector).innerText.length === 0) {
          await this.sleep(100);
          continue;
        }
      }
      break;
    }

    callback(selector);
  }

  wait(selector, need_content = false, timeout = Infinity) {
    return new Promise((resolve) => {
      this._Step(
        selector,
        function (selector) {
          resolve(document.querySelector(selector));
        },
        need_content,
        timeout,
      );
    });
  }
})();

(async function () {
  "use strict";
  auto_high_rate();
  ad_rm();
})();
