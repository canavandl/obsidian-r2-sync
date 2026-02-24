import inquirer from "inquirer";

export async function promptApiToken(): Promise<string> {
  const { token } = await inquirer.prompt([
    {
      type: "password",
      name: "token",
      message: "Enter your Cloudflare API token:",
      mask: "*",
      validate: (input: string) => input.length > 0 || "API token is required",
    },
  ]);
  return token;
}

export async function promptAccountId(
  accounts: Array<{ id: string; name: string }>,
): Promise<string> {
  if (accounts.length === 1) {
    return accounts[0]!.id;
  }

  const { accountId } = await inquirer.prompt([
    {
      type: "list",
      name: "accountId",
      message: "Select a Cloudflare account:",
      choices: accounts.map((a) => ({ name: `${a.name} (${a.id})`, value: a.id })),
    },
  ]);
  return accountId;
}

export async function promptBucketName(): Promise<string> {
  const { name } = await inquirer.prompt([
    {
      type: "input",
      name: "name",
      message: "R2 bucket name:",
      default: "obsidian-vault-sync",
      validate: (input: string) => {
        if (input.length < 3) return "Bucket name must be at least 3 characters";
        if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(input)) {
          return "Bucket name must be lowercase alphanumeric with hyphens";
        }
        return true;
      },
    },
  ]);
  return name;
}

export async function promptWorkerName(): Promise<string> {
  const { name } = await inquirer.prompt([
    {
      type: "input",
      name: "name",
      message: "Worker name:",
      default: "obsidian-r2-sync",
    },
  ]);
  return name;
}

export async function promptDeviceId(): Promise<string> {
  const { id } = await inquirer.prompt([
    {
      type: "input",
      name: "id",
      message: "Device identifier (e.g., macbook, phone, ipad):",
      validate: (input: string) => input.length > 0 || "Device ID is required",
    },
  ]);
  return `device-${id.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
}

export async function confirmAction(message: string): Promise<boolean> {
  const { confirmed } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirmed",
      message,
      default: false,
    },
  ]);
  return confirmed;
}
