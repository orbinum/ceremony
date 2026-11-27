/** The `publish-init` usage text, printed by `--help` and on a usage error. */

export const PUBLISH_INIT_USAGE = `orbinum-ceremony publish-init --dir <ceremony dir> --coordinator <https url> --ptau <file>
    Uploads genesis/ (init.json + genesis zkeys), r1cs/, the ptau mirror and, last, ceremony.json
    to the public bucket through the coordinator, then freezes the setup in it. Every file is
    checked against its pin first, and the bytes checked are the bytes uploaded. A Cloudflare
    Access service token is read from CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET and sent
    only over https (not needed for a local coordinator, the only one reachable over http).`;
