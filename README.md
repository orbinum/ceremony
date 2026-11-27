# Orbinum Trusted Setup Ceremony

Multi-party Groth16 Phase-2 ceremony for the Orbinum shielded-pool circuits (`transfer`, `unshield`, `shield`). Phase 1 is reused: Hermez `powersOfTau28_hez_final_16.ptau`.

## Layout

| Path                   | Responsibility                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`        | Ceremony domain without I/O                                                                                                       |
| `packages/cli`         | Commands: `init`, `announce`, `publish-init`, `contribute-local`, `contribute`, `download`, `finalize`, `publish-final`, `verify` |
| `packages/verifier`    | Upload verification: the pipeline the cli uses, and the verifier service                                                          |
| `packages/coordinator` | Cloudflare Worker + Durable Object (`wrangler.jsonc`); Phase 3, in progress                                                       |
| `packages/client`      | Contributor web client (Vite + React): sign-in, wallet link, queue, in-browser contribution, attestation; Phase 5, in progress    |
| `packages/e2e`         | A whole ceremony through `wrangler dev` + the verifier service (test only)                                                        |

The full target architecture is in the plan, §5.1. The independent verifier (Rust + arkworks) has its own repository: [orbinum/ceremony-verifier](https://github.com/orbinum/ceremony-verifier).

## Development

Requirements: Node ≥ 22, pnpm 10.

```bash
pnpm install --frozen-lockfile
pnpm check          # format:check + lint + typecheck + test
pnpm format         # Oxfmt
pnpm lint           # Oxlint
```

End-to-end tests run a real (shield-only) ceremony and need the 75 MB Hermez ptau, which is not in the repo. Its original hosts are offline since September 2026: get a copy from any mirror and check `b2sum -l 512` against the pin in `packages/core/src/config/ptau.ts`; every tool checks it again. The tests are skipped unless it is provided:

```bash
ORBINUM_PTAU=/path/to/powersOfTau28_hez_final_16.ptau pnpm test
```

`packages/e2e` also needs a ceremony directory with all three genesis keys and its `genesis/init.json` (e.g. the output of `init`, or `ceremony-verifier`'s `testnet-rehearsal-2` vectors). It runs the coordinator with `wrangler dev`, the verifier service, three contributors (one through stock snarkjs, as the CLI path) and a tampered upload:

```bash
ORBINUM_PTAU=... ORBINUM_REHEARSAL_DIR=artifacts/testnet-rehearsal-2 pnpm --filter @orbinum-ceremony/e2e test
```

The attack suites of `core` and `verifier` walk the same rehearsal's whole chain: every contribution, each final's `vk.json` and `transcript.json` (`artifacts/testnet-rehearsal-2` when `ORBINUM_REHEARSAL_DIR` is unset).

Both inputs can be fetched, checked against their pins, from `ceremony-verifier`'s releases (`ptau-hez-final-16` and `vectors-testnet-rehearsal-2`, each published once and never changed); the script prints the environment to use:

```bash
.github/scripts/fetch-test-inputs.sh > .test-inputs.env && set -a && . ./.test-inputs.env && set +a && pnpm test
```

The strict (non-local) verification tests also need groth16-proofs' `pack-verifying-key`; this script builds it at a pinned commit with a pinned lockfile (Rust toolchain required) and prints `ORBINUM_VK_PACKER`:

```bash
.github/scripts/build-vk-packer.sh >> .test-inputs.env
```

CI (`.github/workflows/ci.yml`) runs `format:check`, `lint`, `typecheck` and every test with those inputs (the end-to-end ceremony and the strict verification included), plus a blocking `pnpm audit` and a secrets scan, on every pull request into `main` and every push to `main`. That includes the checks that rebuild the r1cs from a circuits clone (`ORBINUM_CIRCUITS_REPO`, read with the `CIRCUITS_READ_TOKEN` secret) and the independent Rust verifier (`ORBINUM_RUST_VERIFIER`); `.github/scripts/fetch-ci-tools.sh` fetches the verifier and circom pinned by SHA-256.

### Code conventions

These rules apply to every `.ts`/`.tsx` file under `packages/*/src` and `packages/*/tests`.

- **One thing per file, named after it in kebab-case.** For example, `canonicalJson` lives in `canonical-json.ts` and `CoordinatorRefusal` in `coordinator-refusal.ts`. Each folder's shared types go in its `types.ts` and its constants in its `constants.ts`. Each error gets its own file. Lint enforces kebab-case (`unicorn/filename-case`).
- **Barrels only re-export.** Every directory has an `index.ts`, and imports from another directory go through it. Oxlint enforces the layer order of each package (`.oxlintrc.json`).
- **One comment per file.** It is the `/** … */` header above the imports, which says what the file holds and why. Nothing else is commented except lint directives and `///` references. The `ceremony/header-only-comments` rule in [`scripts/oxlint-ceremony-plugin.mjs`](scripts/oxlint-ceremony-plugin.mjs) enforces this.
- **Tests live in `tests/`**, mirroring the `src` folders. Attack and fuzz suites end in `.attacks.test.ts` and `.fuzz.test.ts`.

## Web client

`packages/client` (Vite + React) is served by the coordinator from its own origin. To work on it, start a local ceremony (the e2e stack, with the same inputs as the e2e tests) and the dev server, which sends `/api`, `/auth` and `/artifacts` to that coordinator:

```bash
set -a; . ./.test-inputs.env; set +a
pnpm --filter @orbinum-ceremony/e2e stack        # prints the coordinator's URL
ORBINUM_DEV_COORDINATOR=<url> ORBINUM_DEV_GITHUB_ID=4242 pnpm --filter @orbinum-ceremony/client dev
```

A turn runs in the page: each circuit's head is downloaded and checked (hash, csHash), snarkjs contributes in a fresh Web Worker (`contribution/worker.ts`, entropy drawn there), the output passes the verifier's own pre-checks before it is uploaded, and the linked wallet signs the attestation at the end. `pnpm --filter @orbinum-ceremony/client test` runs the unit tests (core's fixture keys, a fake coordinator).

Without a GitHub OAuth app, `ORBINUM_DEV_GITHUB_ID` (and `ORBINUM_DEV_GITHUB_LOGIN`) signs every request in as that identity; the coordinator honours it only in a local run on a loopback host. Wallets are picked in a dialog with three families, as in the Orbinum app: Substrate extensions (`window.injectedWeb3`: Talisman, SubWallet, polkadot-js; sr25519 or ed25519 accounts), Solana wallets (Wallet Standard: Phantom, Solflare…; ed25519) and EVM wallets (EIP-6963, falling back to `window.ethereum`). Every signature goes through the picked wallet, and the attestation is signed by the wallet the account was linked with.

## Verifier service

The service the coordinator dispatches uploads to. Configuration by environment:

| Variable            | Meaning                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `COORDINATOR_URL`   | The coordinator's origin (`/internal/objects`, `/internal/verifications`)                                                                        |
| `VERIFIER_HMAC_KEY` | Shared with the coordinator; authenticates both directions                                                                                       |
| `CEREMONY_DIR`      | `genesis/init.json` and `genesis/<circuit>.genesis.zkey`, checked at startup                                                                     |
| `PTAU`              | `powersOfTau28_hez_final_16.ptau`, checked against its pin                                                                                       |
| `HOST`, `PORT`      | Listen address (default `127.0.0.1:8788`)                                                                                                        |
| `LOG_DIR`           | one record per attempt (job, verdict, timings, snarkjs log, report delivery; default `<CEREMONY_DIR>/logs`); created and write-probed at startup |
| `VERIFY_TIMEOUT_MS` | snarkjs time limit per upload, below the coordinator's 5-min deadline (default 270000)                                                           |
| `INIT_SHA256`       | Set: the inputs are mirrored from `COORDINATOR_URL`'s `/artifacts` at startup, init.json must hash to it (the container)                         |

```bash
pnpm --filter @orbinum-ceremony/verifier start
```

On testnet and mainnet it runs as a **Cloudflare Container** (`packages/verifier/Dockerfile`), started on demand by the coordinator's `VerifierContainer` Durable Object, which passes `COORDINATOR_URL`, `VERIFIER_HMAC_KEY` and the setup's `INIT_SHA256`; `wrangler deploy` builds and pushes the image (Docker needed). Nothing to host: no VPS, Tunnel or Access application. `VERIFIER_URL` still points a coordinator at a verifier run elsewhere (a VPS, or a local process as in the e2e tests).

## Running a ceremony locally

```bash
PTAU=<path to powersOfTau28_hez_final_16.ptau>
PACKER=../groth16-proofs/target/release/pack-verifying-key

pnpm ceremony init     --ceremony-id rehearsal-1 --circuits-repo ../circuits --circuits-ref v0.17.1 \
                       --circuit-ids shield=3,unshield=2,transfer=1 --ptau $PTAU
pnpm ceremony announce --dir artifacts/rehearsal-1 --network testnet --circuits-repo ../circuits \
                       --circuits-tag v0.17.1 --min-contributions 3 --close <ISO time>      # prints the SHA-256 to publish
pnpm ceremony contribute-local --dir artifacts/rehearsal-1 --ptau $PTAU --contributors 3
pnpm ceremony finalize --dir artifacts/rehearsal-1 --ptau $PTAU --vk-packer $PACKER           # after close + beacon round
```

`init` takes the ceremony's circuits and their on-chain ids from `--circuit-ids` and everything else from the tagged release: each r1cs must be the one its `manifest.json` publishes for the active version, and the ceremony key becomes the next version. Any circuits of the release, including new ones, work without changing this code; circuits larger than the session and verifier bounds were measured for (40,000 constraints each, 60,000 in all) are refused until those bounds are re-measured and `--beyond-measured-bounds` is passed.

`ceremony.json` (written by `announce`) is the root of trust: it pins `init.json`, the circuits tag and commit, the minimum contributions, the invited contributors and the drand round. Its SHA-256 is published before contributions open.

`announce --invite <id,id,…>` names invited GitHub accounts by numeric id (`gh api users/<login> --jq .id`): they skip the GitHub thresholds and are queued ahead of everyone else. Adding `--closed` admits only them, for private rehearsals; a mainnet ceremony is always open. `verify` fails a closed ceremony with any contributor outside the list. The list is public with the announcement (and stays in the archive), invitees who never contribute included: tell invitees before collecting their ids.

## Publishing a ceremony

With the coordinator deployed (`packages/coordinator`), the operator publishes the frozen setup and opens it. Every file is checked against its pin first; `/admin` sits behind Cloudflare Access, so a service token is needed:

```bash
CF_ACCESS_CLIENT_ID=... CF_ACCESS_CLIENT_SECRET=... \
pnpm ceremony publish-init --dir artifacts/rehearsal-1 --coordinator https://<coordinator> --ptau $PTAU
```

After the close, the operator downloads the published transcript, finalizes it (seals the announced drand round, builds and checks the final keys) and hands the result back; the coordinator checks it against its own transcript, publishes `final/*` and the final `transcript.json`, and becomes read-only:

```bash
pnpm ceremony download --from https://<coordinator>/artifacts --dir artifacts/rehearsal-1 --announcement-sha256 <hex>
pnpm ceremony finalize --dir artifacts/rehearsal-1 --vk-packer $PACKER
CF_ACCESS_CLIENT_ID=... CF_ACCESS_CLIENT_SECRET=... \
pnpm ceremony publish-final --dir artifacts/rehearsal-1 --coordinator https://<coordinator>
```

## Verifying a ceremony (third parties)

Mirror what was published, every file checked against the chain of pins rooted in the announced SHA-256, then verify the copy:

```bash
pnpm ceremony download --from https://<coordinator>/archive/<ceremony_id> --dir published --announcement-sha256 <hex> [--transcript-sha256 <hex>]
```

Each network keeps one pair of buckets, and each ceremony its own folder in them (`<ceremony_id>/…`), so a deployment moves to its next ceremony by changing `CEREMONY_ID` and every earlier one stays published. `/artifacts/*` serves the current ceremony; `/archive/<ceremony_id>/*` serves any ceremony the network published, the current one included, and `GET /api/archive` lists them. The site's **Archive** page (`/archive`) shows each one, links its files and gives the `download` command to verify it.

```bash
git clone https://github.com/orbinum/ceremony-verifier ../ceremony-verifier
make -C ../ceremony-verifier release   # independent verifier (Rust, no snarkjs code)
git clone https://github.com/orbinum/circuits ../circuits   # the circuits repo; verify checks the clone's origin
pnpm ceremony verify --dir <published ceremony> --announcement-sha256 <SHA-256 from an official channel> \
  --network mainnet --ptau $PTAU --circuits-repo ../circuits --vk-packer $PACKER \
  --rust-verifier ../ceremony-verifier/target/release/ceremony-verifier [--rebuild-genesis]
```

`--ptau` must be exactly `powersOfTau28_hez_final_16.ptau` (the CLI rejects any other file): a larger Hermez file of the same Phase 1 gives transfer another csHash.

The Rust verifier checks every final key against its genesis and re-derives each genesis from the pinned r1cs + ptau; `--rebuild-genesis` repeats the latter with snarkjs.

Verification is strict: a security check that cannot run (no `--circuits-repo`, `--vk-packer` or `--rust-verifier`) is a failure. Only ceremonies announced as `local` may be verified with `--local`, which allows those skips and says so in the report.

## Versions and releases

One version for the whole repository, in the root `package.json` only (the packages stay at `0.0.0`); the client, the CLI and the verifier all report it. Releases follow [Semantic Versioning](https://semver.org); changes go under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md).

Each network's ceremony is its own deployment of the coordinator (which serves the client): `env.testnet` and `env.mainnet` in `packages/coordinator/wrangler.jsonc`, each with its own Worker, Durable Object, buckets, secrets and domain. One tag ships one version to them, testnet first (`.github/workflows/release.yml`):

| Action                                         | Result                                                                                                          |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Push a signed tag `vX.Y.Z`                     | **Testnet**: client built, `wrangler deploy --env testnet` (`ceremony.testnet.orbinum.network`), GitHub release |
| `gh workflow run release.yml -f version=X.Y.Z` | **Mainnet**: the same tag, `wrangler deploy --env mainnet`; only a version testnet already shipped              |

1. Bump `version` in the root `package.json` and rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`; merge into `main` and wait for CI to pass there.
2. Tag that commit of `main` with the release key and push it: `git tag -s vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z`.
3. Check testnet, then ship to mainnet with the command above.

A run fails before deploying when the tag is not signed by the release key, not on `main`, not the version of the root `package.json`, has no CHANGELOG section, its commit's CI did not pass on `main`, or (mainnet) testnet never shipped it. A failed run is retried with "Re-run failed jobs".

Secrets: `RELEASE_GPG_PUBLIC_KEY` (the release key's public part); `CLOUDFLARE_API_TOKEN` (Workers Scripts edit and Containers edit, on this account) and `CLOUDFLARE_ACCOUNT_ID` in the GitHub environments `testnet` and `mainnet` (required reviewers on `mainnet`); `CIRCUITS_READ_TOKEN` for CI (a fine-grained token limited to `orbinum/circuits`, Contents read-only; the organisation disables deploy keys; only the CI job that clones circuits sees it). The Worker's own secrets (`SESSION_KEY`, `VERIFIER_HMAC_KEY`, `GITHUB_CLIENT_SECRET`, `TURNSTILE_SECRET`, optional `VERIFIER_ACCESS_CLIENT_ID`/`_SECRET`) are set once per network with `wrangler secret put <NAME> --env <network>`; a deploy is refused while one is missing. Mainnet is not live yet: `env.mainnet` in `wrangler.jsonc` needs its empty values filled (OAuth app, Access, verifier, Turnstile site key, and `ANNOUNCEMENT_SHA256`, the published `ceremony.json`'s SHA-256, before `/admin/configure`: the deployment then freezes no other ceremony), its first deploy by hand (`wrangler deploy --env mainnet --secrets-file …`, a new Worker cannot inherit secrets) and "Soon" removed from the client's network selector.
