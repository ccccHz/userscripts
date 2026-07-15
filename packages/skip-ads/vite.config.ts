import { createUserscriptConfig } from "../../shared/userscript-config";
import packageJson from "./package.json";

export default createUserscriptConfig("skip-ads", packageJson.version, {
  name: "skip ads",
  namespace: "http://tampermonkey.net/",
  description: "try to take over the world!",
  author: "You",
  match: ["https://bbs.nga.cn/*", "https://nga.178.com/*"],
  icon: "https://www.google.com/s2/favicons?sz=64&domain=nga.cn",
  grant: "none",
});
