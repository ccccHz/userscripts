import { defineConfig } from "vite";
import monkey, { type MonkeyUserScript } from "vite-plugin-monkey";

const repositoryUrl = "https://github.com/ccccHz/userscripts";
const pagesUrl = "https://ccccHz.github.io/userscripts";

export const devPort = 5173;

export function createUserscriptConfig(
  packageName: string,
  version: string,
  userscript: Omit<
    MonkeyUserScript,
    "version" | "updateURL" | "downloadURL" | "supportURL"
  >,
  options: {
    entry?: string;
    mountGmApi?: boolean;
    releaseUrls?: boolean;
  } = {},
) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(packageName)) {
    throw new Error(`Invalid userscript package name: ${packageName}`);
  }
  const fileName = `${packageName}.user.js`;
  const metaFileName = `${packageName}.meta.js`;
  return defineConfig({
    server: {
      host: "localhost",
      port: devPort,
    },
    plugins: [
      monkey({
        entry: options.entry ?? "src/main.js",
        server: {
          mountGmApi: options.mountGmApi,
        },
        userscript: {
          ...userscript,
          version,
          ...(options.releaseUrls === false
            ? {}
            : {
                supportURL: `${repositoryUrl}/issues`,
                updateURL: `${pagesUrl}/${metaFileName}`,
                downloadURL: `${pagesUrl}/${fileName}`,
              }),
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
