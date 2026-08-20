import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const packageNames = [
  "auto-fans-continue",
  "douyin-live-optimizer",
  "huya-extend",
  "kuaishou-live-optimizer",
  "skip-ads",
  "vimium-c-blur-input-focus",
  "weibo-improvement",
  "wikipedia-auto-dark",
];

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function resolvePackageName(value) {
  const normalizedPath = value
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/\/+$/, "");
  const packageName = normalizedPath.startsWith("packages/")
    ? normalizedPath.slice("packages/".length)
    : normalizedPath;

  return packageNames.includes(packageName) ? packageName : null;
}

export function parseArguments(arguments_) {
  let normalized = arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
  const mode = normalized[0] === "--hmr" ? "hmr" : "file";
  if (mode === "hmr") {
    normalized = normalized.slice(1);
    if (normalized[0] === "--") normalized = normalized.slice(1);
  }

  const [packageArgument, ...viteArguments] = normalized;
  if (!packageArgument) {
    throw new Error(
      [
        "请指定一个 package：",
        "  pnpm dev -- <package-name>",
        "  pnpm dev -- packages/<package-name>",
        "  pnpm dev:hmr -- <package-name>",
        "",
        `可选：${packageNames.join(", ")}`,
      ].join("\n"),
    );
  }
  const packageName = resolvePackageName(packageArgument);
  if (!packageName) {
    throw new Error(`未知 package：${packageArgument}`);
  }
  return { mode, packageName, viteArguments };
}

export function createDevelopmentProxy(
  bundleSource,
  { bundlePath, packageName },
) {
  const metadataMatch = bundleSource.match(
    /\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/,
  );
  if (!metadataMatch) {
    throw new Error(`构建产物缺少 userscript 元数据：${bundlePath}`);
  }

  const lines = metadataMatch[0].split("\n");
  const result = [];
  let hasNamespace = false;
  let hasVersion = false;

  for (const line of lines) {
    const directive = line.match(/^(\s*\/\/\s*@)(\S+)(\s+)(.*)$/);
    if (!directive) {
      if (line === "// ==/UserScript==") {
        if (!hasNamespace) {
          result.push(
            `// @namespace    https://github.com/ccccHz/userscripts/dev/${packageName}`,
          );
        }
        if (!hasVersion) result.push("// @version      300");
        result.push(`// @require      ${pathToFileURL(bundlePath).href}`);
      }
      result.push(line);
      continue;
    }

    const [, prefix, key, spacing, value] = directive;
    if (key === "updateURL" || key === "downloadURL") continue;
    if (key === "namespace") {
      hasNamespace = true;
      result.push(
        `${prefix}${key}${spacing}https://github.com/ccccHz/userscripts/dev/${packageName}`,
      );
      continue;
    }
    if (key === "version") {
      hasVersion = true;
      result.push(`${prefix}${key}${spacing}300`);
      continue;
    }
    if (key === "name" || key.startsWith("name:")) {
      result.push(`${prefix}${key}${spacing}[DEV] ${value}`);
      continue;
    }
    result.push(line);
  }

  return `${result.join("\n")}\n`;
}

function delay(milliseconds, signal) {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

export async function startInstallerServer({ packageName, proxyPath }) {
  const installerPath = `/${packageName}.dev.user.js`;
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    if (requestUrl.pathname === "/") {
      response.writeHead(302, { Location: installerPath });
      response.end();
      return;
    }
    if (requestUrl.pathname !== installerPath) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found\n");
      return;
    }

    try {
      const proxy = await readFile(proxyPath, "utf8");
      response.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Content-Type": "application/javascript; charset=utf-8",
      });
      response.end(proxy);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      response.writeHead(503, {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "Retry-After": "1",
      });
      response.end("开发脚本仍在构建，请稍后刷新。\n");
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}${installerPath}`;

  return {
    url,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function maintainDevelopmentProxy(
  packageRoot,
  packageName,
  installUrl,
  signal,
) {
  const distDirectory = join(packageRoot, "dist");
  const bundlePath = join(distDirectory, `${packageName}.user.js`);
  const proxyPath = join(distDirectory, `${packageName}.dev.user.js`);
  let announced = false;

  await mkdir(distDirectory, { recursive: true });
  while (!signal.aborted) {
    try {
      const bundleSource = await readFile(bundlePath, "utf8");
      const proxy = createDevelopmentProxy(bundleSource, {
        bundlePath,
        packageName,
      });
      let currentProxy = "";
      try {
        currentProxy = await readFile(proxyPath, "utf8");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (proxy !== currentProxy) {
        await writeFile(proxyPath, proxy);
      }
      if (!announced) {
        console.log(
          [
            "",
            `开发代理已生成：${proxyPath}`,
            `首次安装（可点击）：${installUrl}`,
            "安装前请在 Tampermonkey 扩展详情中开启“允许访问文件网址”。",
            "之后修改源码，看到 built 提示后刷新目标网页即可。",
            "请停用对应正式版脚本，避免重复执行。",
            "",
          ].join("\n"),
        );
        announced = true;
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await delay(250, signal);
  }
}

export async function main(arguments_ = process.argv.slice(2)) {
  const { mode, packageName, viteArguments } = parseArguments(arguments_);
  const packageRoot = join(workspaceRoot, "packages", packageName);
  const vitePath = join(workspaceRoot, "node_modules", "vite", "bin", "vite.js");

  if (mode === "hmr") {
    const child = spawn(process.execPath, [vitePath, ...viteArguments], {
      cwd: packageRoot,
      stdio: "inherit",
    });
    return new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve(signal ? 1 : (code ?? 1)));
    });
  }

  const abortController = new AbortController();
  const proxyPath = join(
    packageRoot,
    "dist",
    `${packageName}.dev.user.js`,
  );
  const installer = await startInstallerServer({ packageName, proxyPath });
  const proxyTask = maintainDevelopmentProxy(
    packageRoot,
    packageName,
    installer.url,
    abortController.signal,
  );
  const child = spawn(
    process.execPath,
    [
      vitePath,
      "build",
      "--watch",
      "--mode",
      "development",
      "--sourcemap",
      "inline",
      ...viteArguments,
    ],
    {
      cwd: packageRoot,
      stdio: "inherit",
    },
  );

  try {
    return await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve(signal ? 1 : (code ?? 1)));
    });
  } finally {
    abortController.abort();
    await proxyTask;
    await installer.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
