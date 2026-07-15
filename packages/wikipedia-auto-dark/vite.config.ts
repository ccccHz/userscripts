import { createUserscriptConfig } from "../../shared/userscript-config";
import packageJson from "./package.json";

export default createUserscriptConfig("wikipedia-auto-dark", packageJson.version, {
  name: "wikipedia auto dark",
  namespace: "http://tampermonkey.net/",
  description: "wikipedia auto dark",
  author: "chz",
  match: ["https://*.wikipedia.org/*"],
  icon: "https://www.google.com/s2/favicons?sz=64&domain=wikipedia.org",
  "run-at": "document-start",
  grant: "none",
});
