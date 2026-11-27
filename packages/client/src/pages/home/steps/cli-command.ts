/**
 * The command the CLI option hands out. It never carries the token: `read -rs` takes it at a
 * silent prompt and `export` passes it on, so it stays out of shell history and scrollback. One
 * line, so a paste cannot feed the rest of the command to that prompt.
 */
export const cliCommand = (origin: string): string =>
  `read -rs ORBINUM_CEREMONY_TOKEN && export ORBINUM_CEREMONY_TOKEN && orbinum-ceremony contribute --coordinator ${origin} --announcement-sha256 <sha256-published-by-orbinum>`;
