/** The `publish-final` usage text, printed by `--help` and on a usage error. */

export const PUBLISH_FINAL_USAGE = `orbinum-ceremony publish-final --dir <finalized ceremony dir> --coordinator <https url>
    After \`finalize\`: uploads every final/ file (each checked against its final record first, and
    the bytes checked are the bytes uploaded), then hands the sealed beacon and the final records
    to the coordinator, which checks them against its transcript and freezes the ceremony.
    Re-running it after a success changes nothing. A Cloudflare Access service token is read from
    CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET and sent only over https (not needed for a
    local coordinator, the only one reachable over http).`;
