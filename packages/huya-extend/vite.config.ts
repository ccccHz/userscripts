import { createUserscriptConfig } from "../../shared/userscript-config";
import packageJson from "./package.json";

export default createUserscriptConfig("huya-extend", packageJson.version, {
  name: "huya extend",
  namespace: "http://tampermonkey.net/",
  description: "try to take over the world!",
  author: "You",
  match: ["https://www.huya.com/*"],
  icon: "https://www.google.com/s2/favicons?sz=64&domain=huya.com",
  grant: "none",
});
