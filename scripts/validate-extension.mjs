import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const errors = [];

async function exists(relativePath) {
  try {
    await access(path.join(rootDir, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function ensureFile(relativePath) {
  const fullPath = path.join(rootDir, relativePath);
  try {
    const fileStat = await stat(fullPath);
    if (!fileStat.isFile()) {
      errors.push(`${relativePath} exists but is not a file`);
    }
  } catch {
    errors.push(`Missing required file: ${relativePath}`);
  }
}

function ensureNodeSyntax(relativePath) {
  const fullPath = path.join(rootDir, relativePath);
  const result = spawnSync(process.execPath, ["--check", fullPath], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    errors.push(
      `Syntax check failed for ${relativePath}\n${(result.stderr || result.stdout).trim()}`,
    );
  }
}

async function main() {
  const manifestPath = path.join(rootDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  if (manifest.manifest_version !== 3) {
    errors.push(
      `Expected manifest_version 3, got ${manifest.manifest_version}`,
    );
  }

  if (!/^\d+\.\d+\.\d+$/.test(manifest.version || "")) {
    errors.push(
      `Manifest version must be semver-like x.y.z, got ${manifest.version}`,
    );
  }

  const packageJson = JSON.parse(
    await readFile(path.join(rootDir, "package.json"), "utf8"),
  );
  if (packageJson.version !== manifest.version) {
    errors.push(
      `package.json version ${packageJson.version} does not match manifest.json version ${manifest.version}`,
    );
  }

  await ensureFile("background.js");
  await ensureFile("content.js");
  await ensureFile("content.css");
  await ensureFile("popup.html");
  await ensureFile("popup.css");
  await ensureFile("popup.js");
  await ensureFile("README.md");

  ensureNodeSyntax("background.js");
  ensureNodeSyntax("content.js");
  ensureNodeSyntax("popup.js");

  for (const script of manifest.content_scripts || []) {
    for (const jsFile of script.js || []) {
      await ensureFile(jsFile);
    }
    for (const cssFile of script.css || []) {
      await ensureFile(cssFile);
    }
  }

  if (manifest.background?.service_worker) {
    await ensureFile(manifest.background.service_worker);
  } else {
    errors.push("manifest.json is missing background.service_worker");
  }

  for (const iconPath of Object.values(manifest.icons || {})) {
    await ensureFile(iconPath);
  }

  for (const iconPath of Object.values(manifest.action?.default_icon || {})) {
    await ensureFile(iconPath);
  }

  for (const resourceBlock of manifest.web_accessible_resources || []) {
    for (const resource of resourceBlock.resources || []) {
      if (resource.endsWith("/*")) {
        const dirPath = resource.slice(0, -2);
        if (!(await exists(dirPath))) {
          errors.push(`Missing web accessible resource directory: ${dirPath}`);
        }
      } else {
        await ensureFile(resource);
      }
    }
  }

  if (errors.length > 0) {
    console.error("Extension validation failed:\n");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log("Extension validation passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
