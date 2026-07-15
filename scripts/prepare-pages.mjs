import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { inspectWorkspace } from "./inspect-workspace.mjs";

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function preparePages(root = workspaceRoot) {
  const { errors, packages } = await inspectWorkspace(root);
  if (errors.length > 0) {
    throw new Error(`工作区检查失败：\n${errors.join("\n")}`);
  }

  const siteRoot = join(root, "site");
  await rm(siteRoot, { recursive: true, force: true });
  await mkdir(siteRoot, { recursive: true });

  const releases = [];
  for (const pkg of packages) {
    const packageRoot = join(root, "packages", pkg.name);
    const packageJson = JSON.parse(
      await readFile(join(packageRoot, "package.json"), "utf8"),
    );
    const userFile = `${pkg.name}.user.js`;
    const metaFile = `${pkg.name}.meta.js`;

    await cp(join(packageRoot, "dist", userFile), join(siteRoot, userFile));
    await cp(join(packageRoot, "dist", metaFile), join(siteRoot, metaFile));
    releases.push({ name: pkg.name, version: packageJson.version, userFile });
  }

  const items = releases
    .map(
      ({ name, version, userFile }) =>
        `      <li><a href="./${escapeHtml(userFile)}">${escapeHtml(name)}</a> <code>${escapeHtml(version)}</code></li>`,
    )
    .join("\n");
  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ccccHz userscripts</title>
  </head>
  <body>
    <main>
      <h1>ccccHz userscripts</h1>
      <p>点击脚本名称，通过 userscript 管理器安装或更新。</p>
      <ul>
${items}
      </ul>
    </main>
  </body>
</html>
`;

  await writeFile(join(siteRoot, "index.html"), html);
  await writeFile(join(siteRoot, ".nojekyll"), "");
  return releases;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const releases = await preparePages();
  console.log(`已准备 ${releases.length} 个 userscript 的 Pages 产物。`);
}
