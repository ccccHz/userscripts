import { createUserscriptConfig } from "../../shared/userscript-config";
import packageJson from "./package.json";

export default createUserscriptConfig(
  "auto-fans-continue",
  packageJson.version,
  {
    name: "斗鱼每日自动保底续荧光棒",
    namespace: "https://github.com/ccccHz/autoFansContinue",
    description:
      "斗鱼荧光棒每日保底赠送。每个直播间送一个，剩余送默认直播间",
    author: "czh",
    match: ["https://www.douyu.com/*"],
    noframes: true,
    icon: "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
    "run-at": "document-start",
    grant: ["GM_log", "GM_registerMenuCommand", "unsafeWindow"],
  },
  {
    mountGmApi: true,
  },
);
