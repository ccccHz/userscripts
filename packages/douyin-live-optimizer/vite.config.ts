import { createUserscriptConfig } from "../../shared/userscript-config";
import packageJson from "./package.json";

export default createUserscriptConfig(
  "douyin-live-optimizer",
  packageJson.version,
  {
    name: "抖音直播优化",
    namespace: "http://tampermonkey.net/",
    description: "try to take over the world!",
    author: "You",
    match: ["https://*.douyin.com/**"],
    icon: "https://www.google.com/s2/favicons?sz=64&domain=douyin.com",
    grant: "none",
  },
);
