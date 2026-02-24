import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";

export const statusCommand = new Command("status")
  .description("Check Worker health")
  .requiredOption("--endpoint <url>", "Worker endpoint URL")
  .action(async (options) => {
    const spinner = ora("Checking Worker health...").start();

    try {
      const response = await fetch(`${options.endpoint}/health`);
      const data = (await response.json()) as { ok: boolean; version: string; timestamp: string };

      if (data.ok) {
        spinner.succeed("Worker is healthy");
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
