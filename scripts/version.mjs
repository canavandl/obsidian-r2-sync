#!/usr/bin/env node

/**
 * Atomically bump the version across all locations in the monorepo.
 *
 * Usage:
 *   node scripts/version.mjs 0.2.0
 *
 * Updates:
 *   - Root package.json
 *   - packages/shared/package.json
 *   - packages/cli/package.json
 *   - packages/plugin/package.json
 *   - packages/worker/package.json
 *   - packages/shared/src/constants.ts  (PACKAGE_VERSION)
 *   - packages/plugin/manifest.json     (version)
 *   - versions.json                     (adds new entry)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const version = process.argv[2];
if (!version) {
  console.error("Usage: node scripts/version.mjs <version>");
  console.error("Example: node scripts/version.mjs 0.2.0");
  process.exit(1);
}

// Validate semver format (basic check)
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error(`Invalid version format: "${version}". Expected semver (e.g. 0.2.0)`);
  process.exit(1);
}

/**
 * Update the "version" field in a JSON file.
 */
function updateJsonVersion(filePath) {
  const content = JSON.parse(readFileSync(filePath, "utf-8"));
  content.version = version;
  writeFileSync(filePath, JSON.stringify(content, null, 2) + "\n");
  console.log(`  ✓ ${filePath.replace(root + "/", "")}`);
}

/**
 * Update PACKAGE_VERSION in shared/src/constants.ts.
 */
function updateConstantsTs(filePath) {
  let content = readFileSync(filePath, "utf-8");
  content = content.replace(
    /export const PACKAGE_VERSION = ".*?";/,
    `export const PACKAGE_VERSION = "${version}";`,
  );
  writeFileSync(filePath, content);
  console.log(`  ✓ ${filePath.replace(root + "/", "")}`);
}

/**
 * Update the manifest.json for the Obsidian plugin.
 */
function updateManifestJson(filePath) {
  const content = JSON.parse(readFileSync(filePath, "utf-8"));
  content.version = version;
  writeFileSync(filePath, JSON.stringify(content, null, "\t") + "\n");
  console.log(`  ✓ ${filePath.replace(root + "/", "")}`);
}

/**
 * Add an entry to versions.json mapping version → minAppVersion.
 */
function updateVersionsJson(filePath, minAppVersion) {
  let content;
  try {
    content = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    content = {};
  }
  content[version] = minAppVersion;
  writeFileSync(filePath, JSON.stringify(content, null, "\t") + "\n");
  console.log(`  ✓ ${filePath.replace(root + "/", "")}`);
}

console.log(`\nBumping version to ${version}:\n`);

// 1. Root package.json
updateJsonVersion(resolve(root, "package.json"));

// 2. All workspace package.json files
updateJsonVersion(resolve(root, "packages/shared/package.json"));
updateJsonVersion(resolve(root, "packages/cli/package.json"));
updateJsonVersion(resolve(root, "packages/plugin/package.json"));
updateJsonVersion(resolve(root, "packages/worker/package.json"));

// 3. Shared constants
updateConstantsTs(resolve(root, "packages/shared/src/constants.ts"));

// 4. Plugin manifest.json
const manifestPath = resolve(root, "packages/plugin/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
updateManifestJson(manifestPath);

// 5. versions.json (uses minAppVersion from the plugin manifest)
updateVersionsJson(resolve(root, "versions.json"), manifest.minAppVersion);

console.log(`\nDone! All files updated to v${version}\n`);
