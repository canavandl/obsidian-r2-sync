#!/usr/bin/env node
import { Command } from "commander";
import { PACKAGE_VERSION } from "@obsidian-r2-sync/shared";
import { setupCommand } from "./commands/setup.js";
import { deployCommand } from "./commands/deploy.js";
import { addDeviceCommand } from "./commands/add-device.js";
import { statusCommand } from "./commands/status.js";
import { teardownCommand } from "./commands/teardown.js";
import { rotateSecretCommand } from "./commands/rotate-secret.js";

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
