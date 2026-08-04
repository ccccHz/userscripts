import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
  const normalized = arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
  const [packageArgument, ...viteArguments] = normalized;
  if (!packageArgument) {
    throw new Error(
      [
        "请指定一个 package：",
        "  pnpm dev -- <package-name>",
        "  pnpm dev -- packages/<package-name>",
        "",
        `可选：${packageNames.join(", ")}`,
      ].join("\n"),
    );
  }
  const packageName = resolvePackageName(packageArgument);
  if (!packageName) {
    throw new Error(`未知 package：${packageArgument}`);
  }
  return { packageName, viteArguments };
}

export async function main(arguments_ = process.argv.slice(2)) {
  const { packageName, viteArguments } = parseArguments(arguments_);
  const child = spawn(
    process.execPath,
    [
      join(workspaceRoot, "node_modules", "vite", "bin", "vite.js"),
      ...viteArguments,
    ],
    {
      cwd: join(workspaceRoot, "packages", packageName),
      stdio: "inherit",
    },
  );

  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(signal ? 1 : (code ?? 1)));
  });
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
