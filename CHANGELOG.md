# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-21

### Added

- **Multi-party Groth16 phase-2 ceremony** for the Orbinum shielded-pool circuits (`shield`,
  `unshield`, `transfer`), on top of the Hermez `powersOfTau28_hez_final_16.ptau` (phase 1,
  pinned by BLAKE2b-512). Soundness rests on one honest contributor per circuit.
- **`core`**: the ceremony domain without I/O. Announcement and `init.json` (circuits release,
  pins, policy), strict zkey/r1cs/ptau readers, the transcript and `h_k` chain, the drand
  beacon, the queue's state machine (slots, heartbeats, retries, held identities) and the
  coordination protocol shared by the coordinator, the verifier service and the CLI.
- **`cli`** (`pnpm ceremony`):
  - operator commands: `init`, `announce`, `publish-init`, `download`, `finalize` (drand
    beacon) and `publish-final`;
  - `contribute-local` for an offline contribution;
  - `contribute`, the CLI path against the coordinator with a short-lived token minted in the
    browser;
  - `verify`, the strict third-party verification: announcement, circuits rebuilt from their
    release, genesis, every contribution, beacon, final keys, `vk_hash`, and the independent
    Rust verifier ([ceremony-verifier](https://github.com/orbinum/ceremony-verifier) ≥ 0.1.0).
- **`coordinator`**: Cloudflare Worker and Durable Object. GitHub sign-in, Turnstile, one wallet
  per GitHub identity, the queue and its slots, uploads to R2, rate limits, operator routes
  behind Cloudflare Access, and the CLI token.
- **`verifier`**: the upload verification pipeline and its service, which talks to
  the coordinator over an HMAC-authenticated channel and runs snarkjs 0.7.6 in isolated, bounded
  child processes.
- **`e2e`**: a whole ceremony through `wrangler dev` and the verifier service, with three
  contributors (one through the CLI path), the attacks of the threat model and a real drand
  round.
- **Hardening**: every value validated where it enters, hostile-input tests (`*.attacks.test.ts`)
  for each package.
- **CI** on every push to `main` and pull request into `main`: format, lint and typecheck, and
  every test as parallel jobs (core and coordinator, verifier, the cli in three shards, e2e),
  each with only the real inputs it reads, each pinned: the finished testnet-rehearsal-1 with its
  whole chain, the ptau, the vk packer, a circuits clone, circom and the independent Rust
  verifier. A CI sentinel test in `core`, `verifier` and `cli` fails if an input is missing, so
  no suite is skipped. A blocking `pnpm audit`, trufflehog and gitleaks; every action pinned by
  commit, read-only tokens.
- **Releases** on a push to `main` that changes `package.json`: only a new version, the same in
  every `package.json`, with its dated CHANGELOG section, after the whole CI passes on that
  commit (a passed CI run of that commit on `main` is reused). A `vX.Y.Z` tag and a GitHub
  release with the CHANGELOG section.
