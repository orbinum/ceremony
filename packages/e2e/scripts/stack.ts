/**
 * A local ceremony to work on the web client against: the e2e stack (coordinator, verifier,
 * published setup), open for `ORBINUM_DEV_HOURS` (default 8), until Ctrl-C. Needs the same inputs
 * as the e2e tests (`ORBINUM_PTAU`, `ORBINUM_REHEARSAL_DIR`).
 */
import { startStack } from "../tests/support";

const { ORBINUM_PTAU: ptau, ORBINUM_REHEARSAL_DIR: source } = process.env;
if (!ptau || !source) {
  console.error(
    "Set ORBINUM_PTAU and ORBINUM_REHEARSAL_DIR (.github/scripts/fetch-test-inputs.sh).",
  );
  process.exit(2);
}
const hours = Number(process.env.ORBINUM_DEV_HOURS ?? 8);

const stack = await startStack(source, ptau, hours * 3_600_000);
console.log(
  `Ceremony ${stack.ceremonyId} open for ${hours} h, until ${stack.announcement.schedule.close}.`,
);
console.log(`Coordinator: ${stack.coordinator.url}`);
console.log(`Announcement SHA-256: ${stack.announcementSha256}`);
console.log(`Operator directory: ${stack.operator}`);
console.log(
  `Client: ORBINUM_DEV_COORDINATOR=${stack.coordinator.url} pnpm --filter @orbinum-ceremony/client dev`,
);

const stop = () => void stack.stop().then(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
