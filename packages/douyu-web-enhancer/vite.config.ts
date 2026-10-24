import { createUserscriptConfig } from "../../shared/userscript-config";
import packageJson from "./package.json";

export default createUserscriptConfig(
  "douyu-web-enhancer",
  packageJson.version,
  {
    name: "斗鱼网页增强（预览版）",
    namespace: "https://github.com/ccccHz/userscripts/douyu-web-enhancer",
    description: "面向自用、可诊断且低持续开销的斗鱼网页增强脚本。",
    author: "ccccHz",
    match: ["https://www.douyu.com/*"],
    icon: "https://www.douyu.com/favicon.ico",
    noframes: true,
    "run-at": "document-start",
    // The volume control receives its wheel input in Douyu's page realm.
    // DOM sandbox runs in Chrome's isolated world; raw keeps this userscript's
    // event listener in MAIN_WORLD, matching the original working script.
    sandbox: "raw",
    grant: [
      "GM_getValue",
      "GM_registerMenuCommand",
      "GM_setClipboard",
      "GM_setValue",
      "GM.xmlHttpRequest",
      "GM_xmlhttpRequest",
    ],
    connect: [
      "apiv2.douyucdn.cn",
      "mapi-yuba.douyu.com",
      "yuba.douyu.com",
      "msg.douyu.com",
    ],
  },
  {
    entry: "src/main.ts",
    mountGmApi: true,
    releaseUrls: false,
  },
);
