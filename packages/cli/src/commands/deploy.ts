import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { CloudflareClient, readWorkerBundle } from "../lib/cloudflare.js";
import { loadConfig } from "../lib/config.js";
import { promptApiToken, promptAccountId } from "../lib/prompts.js";

export const deployCommand = new Command("deploy")
  .description("Build and deploy the Worker")
  .option("--token <token>", "Cloudflare API token")
  .option("--account-id <id>", "Cloudflare account ID")
  .option("--name <name>", "Worker name")
  .option("--bucket <bucket>", "R2 bucket name")
  .option("--bundle <path>", "Path to pre-built Worker bundle")
  .action(async (options) => {
    console.log(chalk.bold("\n📦 Deploy Worker\n"));

    const config = loadConfig();

    // Read the worker bundle
    const bundleSpinner = ora("Reading Worker bundle...").start();
    let bundle: string;
    try {
      bundle = readWorkerBundle(options.bundle);
      bundleSpinner.succeed(`Worker bundle loaded (${(bundle.length / 1024).toFixed(1)} KB)`);
    } catch (error) {
      bundleSpinner.fail((error as Error).message);
      process.exit(1);
    }

    // Auth
    const apiToken = options.token || config.apiToken || (await promptApiToken());
    let accountId = options.accountId || config.accountId;

    if (!accountId) {
      const tempClient = new CloudflareClient(apiToken, "");
      const accounts = await tempClient.listAccounts();
      accountId = await promptAccountId(accounts);
    }

    const cf = new CloudflareClient(apiToken, accountId);

    // Use saved secret or prompt
    let secret: string;
    if (config.authSecret) {
      secret = config.authSecret;
    } else {
      const inquirer = await import("inquirer");
      const response = await inquirer.default.prompt([
        {
          type: "password",
          name: "secret",
          message: "Enter the auth secret (from setup):",
          mask: "*",
          validate: (input: string) => input.length > 0 || "Auth secret is required",
        },
      ]);
      secret = response.secret as string;
    }

    const workerName = options.name || config.workerName || "obsidian-r2-sync";
    const bucketName = options.bucket || config.bucketName || "obsidian-vault-sync";

    // Deploy
    const deploySpinner = ora(`Deploying Worker "${workerName}"...`).start();
    try {
      const { url } = await cf.deployWorker(workerName, bundle, {
        r2BucketName: bucketName,
        authSecret: secret,
        cfAccountId: accountId,
        cfAccessKeyId: config.r2AccessKeyId,
        cfSecretAccessKey: config.r2SecretAccessKey,
      });
      deploySpinner.succeed(`Worker deployed at ${chalk.cyan(url)}`);
    } catch (error) {
      deploySpinner.fail("Failed to deploy Worker");
      console.error(chalk.red(`  ${(error as Error).message}`));
      process.exit(1);
    }
  });
