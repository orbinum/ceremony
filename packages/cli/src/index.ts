/**
 * Entry point: picks the command, prints its usage on `--help` or a usage error (exit 2), and any
 * other error as one terminal-safe line (exit 1).
 */
import { stripControl } from "@orbinum-ceremony/core";
import { UsageError } from "./args";
import { COMMANDS } from "./commands";

const usage = () =>
  [
    "Usage: orbinum-ceremony <command> [options]   (orbinum-ceremony <command> --help)",
    "",
    ...Object.entries(COMMANDS).map(([name, c]) => `  ${name.padEnd(16)} ${c.summary}`),
  ].join("\n");

const [name, ...argv] = process.argv.slice(2);
const command = name ? COMMANDS[name] : undefined;

if (!command) {
  console.error(
    name && name !== "--help" ? `unknown command: ${stripControl(name)}\n\n${usage()}` : usage(),
  );
  process.exitCode = name === "--help" ? 0 : 2;
} else if (argv.includes("--help") || argv.includes("-h")) {
  console.log(command.usage);
} else {
  try {
    await command.run(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`error: ${stripControl(error.message)}\n\n${command.usage}`);
      process.exitCode = 2;
    } else {
      console.error(`error: ${stripControl((error as Error).message)}`);
      process.exitCode = 1;
    }
  }
}
