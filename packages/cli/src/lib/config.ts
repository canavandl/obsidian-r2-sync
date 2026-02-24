import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_FILE = join(homedir(), ".obsidian-r2-sync.json");

export interface CliConfig {
  apiToken?: string;
  accountId?: string;
  workerName?: string;
  bucketName?: string;
  authSecret?: string;
  r2AccessKeyId?: string;
  r2SecretAccessKey?: string;
  workerUrl?: string;
}

/**
 * Load saved CLI config from ~/.obsidian-r2-sync.json
 */
export function loadConfig(): CliConfig {
  try {
    const content = readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(content) as CliConfig;
  } catch {
    return {};
  }
}

/**
 * Save CLI config to ~/.obsidian-r2-sync.json
 */
export function saveConfig(config: CliConfig): void {
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

/**
 * Merge new values into the existing config and save.
 */
export function updateConfig(partial: Partial<CliConfig>): void {
  const existing = loadConfig();
  saveConfig({ ...existing, ...partial });
}
