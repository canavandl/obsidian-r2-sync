import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { CloudflareClient } from "../lib/cloudflare.js";
import { loadConfig, updateConfig } from "../lib/config.js";
import { promptApiToken, confirmAction } from "../lib/prompts.js";

export const rotateSecretCommand = new Command("rotate-secret")
  .description("Generate a new AUTH_SECRET and update it on the Worker")
  .option("--token <token>", "Cloudflare API token")
  .option("--account-id <id>", "Cloudflare account ID")
  .option("--name <name>", "Worker name", "obsidian-r2-sync")
  .action(async (options) => {
    console.log(chalk.bold("\n🔑 Rotate Auth Secret\n"));
    console.log(
      chalk.red(
        "⚠️  This will invalidate ALL existing device tokens.\n" +
          "   After rotating, run `add-device` for each device to issue new tokens.\n",
      ),
    );

    const confirmed = await confirmAction("Are you sure you want to continue?");
    if (!confirmed) {
      console.log("Cancelled.");
      return;
    }

    // Resolve credentials from options → config → interactive prompt
    const config = loadConfig();
    const apiToken = options.token || config.apiToken || (await promptApiToken());

    let accountId = options.accountId || config.accountId;
    if (!accountId) {
      const tempClient = new CloudflareClient(apiToken, "");
      const accounts = await tempClient.listAccounts();
      if (accounts.length === 1) {
        accountId = accounts[0]!.id;
      } else {
        const { promptAccountId } = await import("../lib/prompts.js");
        accountId = await promptAccountId(accounts);
      }
    }

    const workerName = options.name || config.workerName || "obsidian-r2-sync";

    // Generate new secret (same approach as setup.ts)
    const newSecret = crypto.randomUUID() + crypto.randomUUID();

    // Update the secret on the Worker
    const cf = new CloudflareClient(apiToken, accountId);
    const spinner = ora("Updating AUTH_SECRET on Worker...").start();
    try {
      await cf.putSecret(workerName, "AUTH_SECRET", newSecret);
      spinner.succeed("AUTH_SECRET updated on Worker");
    } catch (error) {
      spinner.fail("Failed to update AUTH_SECRET on Worker");
      console.error(chalk.red(`  ${(error as Error).message}`));
      process.exit(1);
    }

    // Persist new secret locally only after the Worker update succeeds
    updateConfig({ authSecret: newSecret });

    console.log(chalk.bold("\n✅ Secret rotated successfully!\n"));
    console.log(`  ${chalk.cyan("New secret:")} ${newSecret}\n`);
    console.log(
      chalk.dim(
        "  All previous device tokens are now invalid.\n" +
          "  Run `obsidian-r2-sync add-device` for each device to generate new tokens.\n",
      ),
    );
  });
