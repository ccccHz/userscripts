import { defineConfig } from "vite";
import monkey, { type MonkeyUserScript } from "vite-plugin-monkey";

const repositoryUrl = "https://github.com/ccccHz/userscripts";
const pagesUrl = "https://ccccHz.github.io/userscripts";

export const devPort = 5173;

type PackageName =
  | "auto-fans-continue"
  | "douyin-live-optimizer"
  | "huya-extend"
  | "kuaishou-live-optimizer"
  | "skip-ads"
  | "vimium-c-blur-input-focus"
  | "weibo-improvement"
  | "wikipedia-auto-dark";

export function createUserscriptConfig(
  packageName: PackageName,
  version: string,
  userscript: Omit<
    MonkeyUserScript,
    "version" | "updateURL" | "downloadURL" | "supportURL"
  >,
  options: {
    mountGmApi?: boolean;
  } = {},
) {
  const fileName = `${packageName}.user.js`;
  const metaFileName = `${packageName}.meta.js`;
  return defineConfig({
    server: {
      host: "localhost",
      port: devPort,
    },
    plugins: [
      monkey({
        entry: "src/main.js",
        server: {
          mountGmApi: options.mountGmApi,
        },
        userscript: {
          ...userscript,
          version,
          supportURL: `${repositoryUrl}/issues`,
          updateURL: `${pagesUrl}/${metaFileName}`,
          downloadURL: `${pagesUrl}/${fileName}`,
        },
        build: {
          autoGrant: false,
          fileName,
          metaFileName,
        },
      }),
    ],
  });
}
