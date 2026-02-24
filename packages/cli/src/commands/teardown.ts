import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { CloudflareClient } from "../lib/cloudflare.js";
import { promptApiToken } from "../lib/prompts.js";
import { confirmAction } from "../lib/prompts.js";
import inquirer from "inquirer";

export const teardownCommand = new Command("teardown")
  .description("Remove Worker and optionally R2 bucket")
  .option("--token <token>", "Cloudflare API token")
  .option("--account-id <id>", "Cloudflare account ID")
  .option("--name <name>", "Worker name", "obsidian-r2-sync")
  .option("--bucket <name>", "R2 bucket name", "obsidian-vault-sync")
  .action(async (options) => {
    console.log(chalk.bold("\n🗑️  Teardown\n"));
    console.log(chalk.red("⚠️  This will permanently delete your sync infrastructure.\n"));

    const confirmed = await confirmAction("Are you sure you want to continue?");
    if (!confirmed) {
      console.log("Cancelled.");
      return;
    }

    const apiToken = options.token || (await promptApiToken());

    let accountId = options.accountId;
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

    const cf = new CloudflareClient(apiToken, accountId);

    // Delete Worker
    const workerSpinner = ora(`Deleting Worker "${options.name}"...`).start();
    try {
      await cf.deleteWorker(options.name);
      workerSpinner.succeed(`Deleted Worker "${options.name}"`);
    } catch (error) {
      workerSpinner.fail(`Failed to delete Worker "${options.name}"`);
    }

    // Optionally delete bucket
    const deleteBucket = await confirmAction(
      `Delete R2 bucket "${options.bucket}"? (This will delete ALL synced data!)`,
    );
    if (deleteBucket) {
      const bucketSpinner = ora(`Deleting R2 bucket "${options.bucket}"...`).start();
      try {
        await cf.deleteBucket(options.bucket);
        bucketSpinner.succeed(`Deleted R2 bucket "${options.bucket}"`);
      } catch (error) {
        bucketSpinner.fail(`Failed to delete R2 bucket "${options.bucket}"`);
        console.error(chalk.dim("  You may need to empty the bucket first."));
      }
    }

    console.log(chalk.bold("\n✅ Teardown complete.\n"));
  });
