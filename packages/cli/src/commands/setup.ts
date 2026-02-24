import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { CloudflareClient, readWorkerBundle } from "../lib/cloudflare.js";
import { updateConfig } from "../lib/config.js";
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

    // Step 4: Create R2 API token for presigned URLs
    const r2TokenSpinner = ora("Creating R2 API token for presigned URLs...").start();
    let r2AccessKeyId: string | undefined;
    let r2SecretAccessKey: string | undefined;
    try {
      const r2Creds = await cf.createR2Token(bucketName);
      r2AccessKeyId = r2Creds.accessKeyId;
      r2SecretAccessKey = r2Creds.secretAccessKey;
      r2TokenSpinner.succeed("R2 API token created");
    } catch (error) {
      r2TokenSpinner.fail("Failed to create R2 API token (presigned URLs won't work until this is configured)");
      console.error(chalk.red(`  ${(error as Error).message}`));
      console.error(chalk.dim("  Ensure your API token has 'Account / Account API Tokens: Edit' permission."));
      console.error(chalk.dim("  Or create an R2 API token manually:"));
      console.error(chalk.dim("    1. Go to https://dash.cloudflare.com → R2 → Manage R2 API Tokens"));
      console.error(chalk.dim("    2. Create a token with 'Object Read & Write' for your bucket"));
      console.error(chalk.dim("    3. Run 'pnpm cli deploy' with the R2 credentials to update the Worker"));
      // Don't exit — Worker can still be deployed, presigned URLs just won't work
    }

    // Step 5: Generate auth secret
    const authSecret = crypto.randomUUID() + crypto.randomUUID();

    // Step 6: Deploy Worker
    const workerName = await promptWorkerName();
    let workerUrl = "";
    const workerSpinner = ora(`Deploying Worker "${workerName}"...`).start();
    try {
      const bundle = readWorkerBundle();
      const { url } = await cf.deployWorker(workerName, bundle, {
        r2BucketName: bucketName,
        authSecret,
        cfAccountId: accountId,
        cfAccessKeyId: r2AccessKeyId,
        cfSecretAccessKey: r2SecretAccessKey,
      });
      workerUrl = url;
      workerSpinner.succeed(`Worker deployed at ${chalk.cyan(url)}`);
    } catch (error) {
      workerSpinner.fail("Failed to deploy Worker");
      console.error(chalk.red(`  ${(error as Error).message}`));
      console.error(chalk.dim("  You can deploy manually later with: obsidian-r2-sync deploy"));
      // Don't exit — continue to generate the device token
    }

    // Step 7: Generate first device token
    const deviceId = await promptDeviceId();
    const token = await CloudflareClient.generateToken(authSecret, deviceId);

    // Save config for future CLI commands
    updateConfig({
      apiToken,
      accountId,
      workerName,
      bucketName,
      authSecret,
      r2AccessKeyId,
      r2SecretAccessKey,
      workerUrl: workerUrl || undefined,
    });

    // Output results
    console.log(chalk.bold("\n✅ Setup complete!\n"));
    console.log(chalk.dim("Add these to your Obsidian plugin settings:\n"));
    console.log(`  ${chalk.cyan("Endpoint:")} ${workerUrl || `https://${workerName}.<your-subdomain>.workers.dev`}`);
    console.log(`  ${chalk.cyan("Token:")}    ${token}`);
    console.log(
      chalk.dim("\n⚠️  Save the auth secret — you'll need it to add more devices:"),
    );
    console.log(`  ${chalk.cyan("Secret:")}   ${authSecret}\n`);
  });
