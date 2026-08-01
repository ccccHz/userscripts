import { startHomePageRedirect } from "./navigation.js";
import {
  installLiveDarkCompatibility,
  installSearchDarkCompatibility,
  startWeiboThemeController,
} from "./theme-controller.js";

const hostname = window.location.hostname;
const pathname = window.location.pathname;

startWeiboThemeController();

if (hostname === "s.weibo.com") {
  installSearchDarkCompatibility();
}

if (
  (hostname === "weibo.com" || hostname === "www.weibo.com") &&
  pathname.startsWith("/l/wblive/")
) {
  installLiveDarkCompatibility();
}

startHomePageRedirect();

console.log("weibo_improve loaded");
