/**
 * The environment variable that carries the CLI token (never argv, which other users and the shell
 * history can read), and the `contribute` usage text, printed by `--help` and on a usage error.
 */

export const TOKEN_ENV = "ORBINUM_CEREMONY_TOKEN";

export const CONTRIBUTE_USAGE = `orbinum-ceremony contribute --coordinator <https url> --announcement-sha256 <hex>
    Contributes to every circuit of the ceremony from this machine. First, in the
    browser: sign in with GitHub, link your wallet, join the queue and create a CLI token; then
    run this with the token in ${TOKEN_ENV} and the SHA-256 of ceremony.json from an official
    channel. It waits for your turn, claims it, keeps it alive, contributes to each circuit (fresh
    randomness drawn inside a snarkjs child process that exits after each one), checks every
    contribution itself before uploading it, and ends the session (also on Ctrl-C). Afterwards,
    sign the attestation in the browser with the hashes it prints.
    [--work <dir>]          keep the session's files and summary there (default: a new private
                            directory, removed at the end)`;
