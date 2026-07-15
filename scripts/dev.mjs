import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const packageNames = [
  "auto-fans-continue",
  "douyin-live-optimizer",
  "huya-extend",
  "kuaishou-live-optimizer",
  "skip-ads",
  "wikipedia-auto-dark",
];

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export function parseArguments(arguments_) {
  const normalized = arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
  const [packageName, ...viteArguments] = normalized;
  if (!packageName) {
    throw new Error(
      `请指定一个 package：\n  pnpm dev -- <package-name>\n\n可选：${packageNames.join(", ")}`,
    );
  }
  if (!packageNames.includes(packageName)) {
    throw new Error(`未知 package：${packageName}`);
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
