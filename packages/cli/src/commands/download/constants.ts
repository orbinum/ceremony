/** The `download` usage text, printed by `--help` and on a usage error. */

export const DOWNLOAD_USAGE = `orbinum-ceremony download --from <published https URL> --dir <out dir> --announcement-sha256 <hex>
    Mirrors a published ceremony into a directory that \`verify\` reads. Nothing unverified is
    kept: ceremony.json must have the pinned SHA-256, init.json the one it announces, r1cs and
    genesis files the hashes in init.json, and the transcript must be anchored in that
    ceremony.json with an intact chain before any file it names is fetched.
    A local transcript is only replaced by one that extends it: never by an older one, nor one
    without its sealed beacon or finals.
    [--transcript-sha256 <hex>]  the sealed transcript.json's SHA-256 from an official channel:
                    no other transcript (an invented chain from a mirror) is fetched from
    [--with-ptau]   also fetch ptau/ (checked against the pinned BLAKE2b-512)
    [--force]       replace the local transcript even when the new one does not extend it`;
