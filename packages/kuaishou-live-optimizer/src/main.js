import mscststs from "../../../shared/mscststs.js";

(function () {
  "use strict";
  main();
})();

async function getTarget(str) {
  const target = await mscststs.wait(str, true, 50);
  return target;
}

function main() {
  console.log("油猴script，快手直播优化");
  waitForGiftListReady(".gift-list", 100);
}

/**
 * 定期检查 gift-list 是否满足条件
 * @param {string} selector - 选择器
 * @param {number} interval - 检查间隔（毫秒）
 */
async function waitForGiftListReady(selector, interval) {
  const target = await getTarget(selector);

  if (target.childElementCount > 5) {
    console.log("gift-list 已加载完毕，移除 foot 元素");
    const foot = document.querySelector(".foot");
    if (foot) foot.remove();
  } else {
    console.log(
      `gift-list 子元素数量=${target.childElementCount}，未满足条件，${interval}ms后重试`,
    );
    setTimeout(() => waitForGiftListReady(selector, interval), interval);
  }
}
