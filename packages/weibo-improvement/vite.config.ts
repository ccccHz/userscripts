import { createUserscriptConfig } from "../../shared/userscript-config";
import packageJson from "./package.json";

export default createUserscriptConfig("weibo-improvement", packageJson.version, {
  name: "weibo improvement",
  namespace: "http://tampermonkey.net/",
  description: "保持系统和其他网站外观设置一致",
  author: "chz",
  match: [
    "https://weibo.com/*",
    "https://www.weibo.com/*",
    "https://s.weibo.com/*",
  ],
  icon: "https://www.google.com/s2/favicons?sz=64&domain=weibo.com",
  "run-at": "document-start",
  grant: "none",
});
