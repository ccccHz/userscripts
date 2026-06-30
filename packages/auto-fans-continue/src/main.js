import { markChecked, shouldRunToday } from "./run-state.js";

"use strict";
// ref: https://github.com/qianjiachun/douyuEx/blob/master/src/packages/FansContinue/FansContinue.js

// 策略
// 每个直播间送1个保底
// 12306 送全部剩余
var sendNum = 1;
var allRid = 12306;

// 12306 送剩余全部荧光棒

function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

function FansContinue() {
    return new Promise((resolve, reject) => {
        fetch("https://www.douyu.com/member/cp/getFansBadgeList", {
            method: "GET",
            mode: "no-cors",
            cache: "default",
            credentials: "include",
        })
            .then((res) => {
                return res.text();
            })
            .then(async (doc) => {
                doc = new DOMParser().parseFromString(doc, "text/html");
                let a =
                    doc.getElementsByClassName("fans-badge-list")[0].lastElementChild;
                let n = a.children.length;
                for (let i = 0; i < n; i++) {
                    let rid = a.children[i].getAttribute("data-fans-room"); // 获取房间号
                    await sleep(250).then(() => {
                        sendGift_bag(268, Number(sendNum), rid)
                            .then((data) => {
                                if (data.msg === "success") {
                                    // showMessage("【续牌】" + rid + "赠送荧光棒成功", "success");
                                    console.log("chz_script", rid + "赠送一根荧光棒成功");
                                } else {
                                    // showMessage("【续牌】" + rid + "赠送失败 " + data.msg, "error");
                                    console.log("chz_script", rid + "赠送失败");
                                    console.log("chz_script", rid, data);
                                }
                            })
                            .catch((err) => {
                                //   showMessage("【续牌】" + rid + "赠送失败", "error");
                                console.log("chz_script", rid, err);
                            });
                    });
                }
            }).then(async () => {
            await sleep(250).then(() => {
                sendAllToOne(allRid).then(()=>resolve())
            })
        }).catch((err) => {
            console.log("chz_script", "请求失败!", err);
            reject()
        });
    })

}

function sendGift_bag(gid, count, rid) {
    // 送背包里的东西
    // gid: 268是荧光棒
    // count: 数量
    // rid: 房间号
    return fetch("https://www.douyu.com/japi/prop/donate/mainsite/v1", {
        method: "POST",
        mode: "no-cors",
        credentials: "include",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body:
            "propId=" +
            gid +
            "&propCount=" +
            count +
            "&roomId=" +
            rid +
            "&bizExt=%7B%22yzxq%22%3A%7B%7D%7D",
    }).then((res) => {
        return res.json();
    });
}

// 获取背包礼物信息
function getBagGifts() {
    return fetch(
        "https://www.douyu.com/japi/prop/backpack/web/v1?rid=9373171"
    ).then((res) => res.json());
}

// 剩余荧光棒全送给某个直播间
function sendAllToOne(rid) {
    return new Promise((resolve, reject) => {
        getBagGifts()
            .then(async (data) => {
                let giftsList = data.data.list;
                let ifFind= false;
                // if len=0
                for (let k = 0; k < giftsList.length; k++) {
                    if ((giftsList[k].id = 268)) {
                        ifFind = true;
                        await sendGift_bag(giftsList[k].id, giftsList[k].count, rid)
                            .then((data) => {
                                if (data.msg === "success") {
                                    console.log("chz_script", rid + "赠送剩余全部荧光棒成功");
                                } else {
                                    console.log("chz_script", rid + "赠送剩余全部失败");
                                    console.log("chz_script", rid, data);
                                }
                            })
                            .catch((err) => {
                                console.log("chz_script", rid, err);
                            });
                        // break 减少遍历 是否有效
                    }
                }
                if(!ifFind){
                    console.log("chz_script", "背包内没有荧光棒，执行赠送全部剩余失败")
                }
            })
            .catch((err) => {
                console.log("chz_script", "查询背包礼物失败", err);
            });
    })

}

function main() {
    console.log("测试环境");
    console.log("chz_script", "start!");
    let today = new Date();

    // 上次执行方法日期不是今天，则执行
    if (shouldRunToday(localStorage, today)) {
        FansContinue().then(() => {
                // 执行完毕，修改最后一次执行脚本的时间
                markChecked(localStorage)
                console.log("chz_script", "执行完成")
            }
        ).catch(() => {
            console.log("chz_script", "执行错误")
        })
    } else {
        console.log("chz_script", "今天已经执行过");
    }
}

(function () {
    main();
})();
