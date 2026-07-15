import { createUserscriptConfig } from "../../shared/userscript-config";
import packageJson from "./package.json";

export default createUserscriptConfig(
  "kuaishou-live-optimizer",
  packageJson.version,
  {
    name: "快手直播优化",
    namespace: "http://tampermonkey.net/",
    description: "try to take over the world!",
    author: "You",
    match: ["https://live.kuaishou.com/**"],
    icon: "https://www.google.com/s2/favicons?sz=64&domain=kuaishou.com",
    grant: "none",
  },
);
