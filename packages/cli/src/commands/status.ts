import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { loadConfig } from "../lib/config.js";

export const statusCommand = new Command("status")
  .description("Check Worker health")
  .option("--endpoint <url>", "Worker endpoint URL")
  .action(async (options) => {
    const config = loadConfig();
    const endpoint = options.endpoint || config.workerUrl;

    if (!endpoint) {
      console.error(chalk.red("Error: No endpoint specified."));
      console.error(chalk.dim("  Provide --endpoint <url> or run setup first."));
      process.exit(1);
    }

    const spinner = ora("Checking Worker health...").start();

    try {
      const response = await fetch(`${endpoint}/health`);
      const data = (await response.json()) as { ok: boolean; version: string; timestamp: string };

      if (data.ok) {
        spinner.succeed("Worker is healthy");
        console.log(`  ${chalk.cyan("Endpoint:")}  ${endpoint}`);
        console.log(`  ${chalk.cyan("Version:")}   ${data.version}`);
        console.log(`  ${chalk.cyan("Timestamp:")} ${data.timestamp}`);
      } else {
        spinner.fail("Worker returned unhealthy status");
      }
    } catch (error) {
      spinner.fail("Failed to reach Worker");
      console.error(chalk.red(`  Error: ${error instanceof Error ? error.message : "Unknown error"}`));
    }
  });
