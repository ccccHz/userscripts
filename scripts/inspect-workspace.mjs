import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)));

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function inspectWorkspace(root = workspaceRoot) {
  const packagesRoot = join(root, "packages");
  const directoryEntries = (await exists(packagesRoot))
    ? await readdir(packagesRoot, { withFileTypes: true })
    : [];
  const packageDirectories = directoryEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const errors = [];
  const packages = [];

  for (const directoryName of packageDirectories) {
    const packageRoot = join(packagesRoot, directoryName);
    const files = {
      packageJson: await exists(join(packageRoot, "package.json")),
      viteConfig: await exists(join(packageRoot, "vite.config.ts")),
      entry: await exists(join(packageRoot, "src/main.js")),
    };

    for (const [fileName, present] of Object.entries(files)) {
      if (!present) errors.push(`${directoryName}: missing ${fileName}`);
    }

    let name = directoryName;
    if (files.packageJson) {
      const packageJson = JSON.parse(
        await readFile(join(packageRoot, "package.json"), "utf8"),
      );
      name = packageJson.name;
      if (name !== directoryName) {
        errors.push(
          `${directoryName}: package name "${name}" must match directory name`,
        );
      }
    }

    packages.push({ name, files });
  }

  return { errors, packages };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await inspectWorkspace();
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length > 0) process.exitCode = 1;
}

