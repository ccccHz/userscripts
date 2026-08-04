import { createUserscriptConfig } from "../../shared/userscript-config";
import packageJson from "./package.json";

export default createUserscriptConfig(
  "vimium-c-blur-input-focus",
  packageJson.version,
  {
    name: "vimium-c blur input focus",
    namespace: "http://tampermonkey.net/",
    description: "避免页面输入框自动抢占 Vimium C 焦点",
    author: "chz",
    match: [
      "https://www.douban.com/*",
      "https://weibo.com/*",
      "https://yuba.douyu.com/*",
      "https://www.taobao.com/*",
    ],
    icon: "https://www.google.com/s2/favicons?sz=64&domain=douyu.com",
    "run-at": "document-start",
    sandbox: "raw",
    grant: "none",
  },
);
