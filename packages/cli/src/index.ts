#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { setupCommand } from "./commands/setup.js";
import { deployCommand } from "./commands/deploy.js";
import { addDeviceCommand } from "./commands/add-device.js";
import { statusCommand } from "./commands/status.js";
import { teardownCommand } from "./commands/teardown.js";
import { rotateSecretCommand } from "./commands/rotate-secret.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version: PACKAGE_VERSION } = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8"),
);

const program = new Command();

program
  .name("obsidian-r2-sync")
  .description("CLI for managing Obsidian R2 Vault Sync infrastructure")
  .version(PACKAGE_VERSION);

program.addCommand(setupCommand);
program.addCommand(deployCommand);
program.addCommand(addDeviceCommand);
program.addCommand(statusCommand);
program.addCommand(teardownCommand);
program.addCommand(rotateSecretCommand);

program.parse();
