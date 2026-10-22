# Orbinum Trusted Setup Ceremony

Multi-party Groth16 Phase-2 ceremony for the Orbinum shielded-pool circuits (`transfer`, `unshield`, `shield`). Phase 1 is reused: Hermez `powersOfTau28_hez_final_16.ptau`.

## Layout

| Path                   | Responsibility                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`        | Ceremony domain without I/O                                                                                                       |
| `packages/cli`         | Commands: `init`, `announce`, `publish-init`, `contribute-local`, `contribute`, `download`, `finalize`, `publish-final`, `verify` |
| `packages/verifier`    | Upload verification: the pipeline the cli uses, and the verifier service                                                          |
| `packages/coordinator` | Cloudflare Worker + Durable Object (`wrangler.jsonc`); Phase 3, in progress                                                       |
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

`packages/e2e` also needs a ceremony directory with all three genesis keys and its `genesis/init.json` (e.g. the output of `init`, or `ceremony-verifier`'s `testnet-rehearsal-1` vectors). It runs the coordinator with `wrangler dev`, the verifier service, three contributors (one through stock snarkjs, as the CLI path) and a tampered upload:

```bash
ORBINUM_PTAU=... ORBINUM_REHEARSAL_DIR=artifacts/testnet-rehearsal-1 pnpm --filter @orbinum-ceremony/e2e test
```

The attack suites of `core` and `verifier` walk the same rehearsal's whole chain: every contribution, each final's `vk.json` and `transcript.json` (`artifacts/testnet-rehearsal-1` when `ORBINUM_REHEARSAL_DIR` is unset).

Both inputs can be fetched, checked against their pins, from `ceremony-verifier`'s `test-vectors-1` release; the script prints the environment to use:

```bash
.github/scripts/fetch-test-inputs.sh > .test-inputs.env && set -a && . ./.test-inputs.env && set +a && pnpm test
```

The strict (non-local) verification tests also need groth16-proofs' `pack-verifying-key`; this script builds it at a pinned commit with a pinned lockfile (Rust toolchain required) and prints `ORBINUM_VK_PACKER`:

```bash
.github/scripts/build-vk-packer.sh >> .test-inputs.env
```

CI (`.github/workflows/ci.yml`) runs `format:check`, `lint`, `typecheck` and every test with those inputs (the end-to-end ceremony and the strict verification included), plus a blocking `pnpm audit` and a secrets scan, on every pull request into `main` and every push to `main`. That includes the checks that rebuild the r1cs from a circuits clone (`ORBINUM_CIRCUITS_REPO`, read with the `CIRCUITS_READ_TOKEN` secret) and the independent Rust verifier (`ORBINUM_RUST_VERIFIER`); `.github/scripts/fetch-ci-tools.sh` fetches the verifier and circom pinned by SHA-256.

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

```bash
pnpm --filter @orbinum-ceremony/verifier start
```

## Running a ceremony locally

```bash
PTAU=<path to powersOfTau28_hez_final_16.ptau>
PACKER=../groth16-proofs/target/release/pack-verifying-key

pnpm ceremony init     --ceremony-id rehearsal-1 --circuits-repo ../circuits --circuits-ref v0.16.0 --ptau $PTAU
pnpm ceremony announce --dir artifacts/rehearsal-1 --network testnet --circuits-repo ../circuits \
                       --circuits-tag v0.16.0 --min-contributions 3 --close <ISO time>      # prints the SHA-256 to publish
pnpm ceremony contribute-local --dir artifacts/rehearsal-1 --ptau $PTAU --contributors 3
pnpm ceremony finalize --dir artifacts/rehearsal-1 --ptau $PTAU --vk-packer $PACKER           # after close + beacon round
```

`ceremony.json` (written by `announce`) is the root of trust: it pins `init.json`, the circuits tag and commit, the minimum contributions and the drand round. Its SHA-256 is published before contributions open.

## Publishing a ceremony

With the coordinator deployed (`packages/coordinator`), the operator publishes the frozen setup and opens it. Every file is checked against its pin first; `/admin` sits behind Cloudflare Access, so a service token is needed:

```bash
CF_ACCESS_CLIENT_ID=... CF_ACCESS_CLIENT_SECRET=... \
pnpm ceremony publish-init --dir artifacts/rehearsal-1 --coordinator https://<coordinator> --ptau $PTAU
```

After the close, the operator downloads the published transcript, finalizes it (seals the announced drand round, builds and checks the final keys) and hands the result back; the coordinator checks it against its own transcript, publishes `final/*` and the final `transcript.json`, and becomes read-only:

```bash
pnpm ceremony download --from https://<public bucket> --dir artifacts/rehearsal-1 --announcement-sha256 <hex>
pnpm ceremony finalize --dir artifacts/rehearsal-1 --vk-packer $PACKER
CF_ACCESS_CLIENT_ID=... CF_ACCESS_CLIENT_SECRET=... \
pnpm ceremony publish-final --dir artifacts/rehearsal-1 --coordinator https://<coordinator>
```

## Verifying a ceremony (third parties)

Mirror what was published, every file checked against the chain of pins rooted in the announced SHA-256, then verify the copy:

```bash
pnpm ceremony download --from https://<public bucket> --dir published --announcement-sha256 <hex>
```

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

One version for the whole repository, the same in every `package.json` (the CLI reports `packages/cli`'s to the coordinator). Releases follow [Semantic Versioning](https://semver.org); changes go under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md).

To release, bump `version` in every `package.json` and rename `## [Unreleased]` to `## [x.y.z] - YYYY-MM-DD`. After the merge into `main`, `.github/workflows/release.yml` checks the version and its CHANGELOG section, runs the whole CI on that commit (or reuses a CI run of that commit that already passed), and tags and publishes `vx.y.z` only if All Checks Passed. CI needs the `CIRCUITS_READ_TOKEN` secret: a fine-grained token limited to `orbinum/circuits` with Contents read-only (the organisation disables deploy keys).
