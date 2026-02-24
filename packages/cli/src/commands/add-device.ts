import { Command } from "commander";
import chalk from "chalk";
import { CloudflareClient } from "../lib/cloudflare.js";
import { promptDeviceId } from "../lib/prompts.js";
import inquirer from "inquirer";

export const addDeviceCommand = new Command("add-device")
  .description("Generate auth token for a new device")
  .action(async () => {
    console.log(chalk.bold("\n🔑 Add Device\n"));

    const { secret } = await inquirer.prompt([
      {
        type: "password",
        name: "secret",
        message: "Enter the auth secret (from setup):",
        mask: "*",
        validate: (input: string) => input.length > 0 || "Auth secret is required",
      },
    ]);

    const deviceId = await promptDeviceId();
    const token = await CloudflareClient.generateToken(secret, deviceId);

    console.log(chalk.bold("\n✅ Device token generated!\n"));
    console.log(`  ${chalk.cyan("Device ID:")} ${deviceId}`);
    console.log(`  ${chalk.cyan("Token:")}     ${token}\n`);
    console.log(chalk.dim("Add this token to the Obsidian plugin settings on the new device.\n"));
  });
