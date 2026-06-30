import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";

export default defineConfig({
  plugins: [
    monkey({
      entry: "src/main.js",
      userscript: {
        name: "斗鱼每日自动保底续荧光棒",
        namespace: "https://github.com/ccccHz/autoFansContinue",
        version: "0.127",
        description: "斗鱼荧光棒每日保底赠送。每个直播间每天送一个荧光棒",
        author: "czh",
        supportURL: "https://github.com/ccccHz/autoFansContinue/issues",
        match: ["https://*.douyu.com/*"],
        icon: "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
        grant: "none",
      },
      build: {
        autoGrant: false,
        fileName: "auto-fans-continue.user.js",
      },
    }),
  ],
});
