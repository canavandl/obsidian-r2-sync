import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { CloudflareClient } from "../lib/cloudflare.js";
import {
  promptApiToken,
  promptAccountId,
  promptBucketName,
  promptWorkerName,
  promptDeviceId,
} from "../lib/prompts.js";

export const setupCommand = new Command("setup")
  .description("Provision R2 bucket and deploy Worker")
  .action(async () => {
    console.log(chalk.bold("\n🚀 Obsidian R2 Sync — Setup\n"));

    // Step 1: Get API token
    const apiToken = await promptApiToken();
    const spinner = ora("Verifying API token...").start();

    let cf: CloudflareClient;
    let accountId: string;

    try {
      // Step 2: Detect account
      const tempClient = new CloudflareClient(apiToken, "");
      const accounts = await tempClient.listAccounts();
      spinner.succeed("API token verified");

      accountId = await promptAccountId(accounts);
      cf = new CloudflareClient(apiToken, accountId);
    } catch (error) {
      spinner.fail("Invalid API token");
      process.exit(1);
    }

    // Step 3: Create R2 bucket
    const bucketName = await promptBucketName();
    const bucketSpinner = ora(`Creating R2 bucket "${bucketName}"...`).start();
    try {
      const { created } = await cf.ensureBucket(bucketName);
      if (created) {
        bucketSpinner.succeed(`Created R2 bucket "${bucketName}"`);
      } else {
        bucketSpinner.succeed(`R2 bucket "${bucketName}" already exists`);
      }
    } catch (error) {
      bucketSpinner.fail("Failed to create R2 bucket");
      console.error(error);
      process.exit(1);
    }

    // Step 4: Generate auth secret
    const authSecret = crypto.randomUUID() + crypto.randomUUID();

    // Step 5: Deploy Worker
    const workerName = await promptWorkerName();
    const workerSpinner = ora(`Deploying Worker "${workerName}"...`).start();
    try {
      // TODO: Bundle the worker and pass the script content here
      // For now, we indicate that wrangler deploy should be used
      workerSpinner.warn(
        `Worker deployment via SDK is a placeholder — use "cd packages/worker && pnpm deploy" for now`,
      );
    } catch (error) {
      workerSpinner.fail("Failed to deploy Worker");
      console.error(error);
      process.exit(1);
    }

    // Step 6: Generate first device token
    const deviceId = await promptDeviceId();
    const token = await CloudflareClient.generateToken(authSecret, deviceId);

    // Output results
    console.log(chalk.bold("\n✅ Setup complete!\n"));
    console.log(chalk.dim("Add these to your Obsidian plugin settings:\n"));
    console.log(`  ${chalk.cyan("Endpoint:")}  https://${workerName}.${accountId.slice(0, 8)}.workers.dev`);
    console.log(`  ${chalk.cyan("Token:")}     ${token}`);
    console.log(`  ${chalk.cyan("Device ID:")} ${deviceId}`);
    console.log(
      chalk.dim("\n⚠️  Save the auth secret — you'll need it to add more devices:"),
    );
    console.log(`  ${chalk.cyan("Secret:")}    ${authSecret}\n`);
  });
