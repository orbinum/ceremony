# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`client`**: the contributor's web page, served by the coordinator.
  - A contribution as five guided steps (sign in with GitHub, link a wallet, join the line,
    contribute, sign), each done, current or upcoming; the ceremony's status and window at the
    top; how it works and its common questions beside them.
  - A whole turn in the browser: each circuit's head checked, snarkjs in a fresh Web Worker, the
    output pre-checked as the verifier does before its upload, the verdicts, then the attestation
    signed with the linked wallet and the receipt. When the turn comes the tab's title says so
    (30 s to start), with a countdown and a way to give the turn away.
  - Wallets picked in a dialog, by family as in the Orbinum app: Substrate extensions (only the
    one picked is asked for access; sr25519 or ed25519 accounts), Solana wallets (Wallet
    Standard) and EVM wallets (EIP-6963, each signing through its own provider, EIP-55 address,
    one retry after 4100). Logos are the ones each wallet injects, initials when there is none.
  - The CLI option: a token for `orbinum-ceremony contribute` and the whole command to run.
  - Orbinum's style, as the Hub: its design tokens, square edges, Instrument Sans and JetBrains
    Mono (served from the page's origin, no font CDN), the Orbinum logo, a dark/light switch (the
    system's preference until one is picked; Turnstile follows it), and a layout for phones.
  - A network selector in the header: each network's ceremony is its own deployment on its own
    site, so picking another one goes there (mainnet marked "Soon" until it is deployed).
  - CI builds and tests it.
- The coordinator serves the client as static assets (one origin, no CORS): `/api`, `/auth`,
  `/artifacts`, `/internal` and `/admin` reach the Worker, any other path is the page, with its
  own CSP (scripts, styles and requests on this origin but Turnstile; no framing), HSTS and COOP.
  `pnpm run deploy` and `dev` build the client first.
- `GET /api/config` (`network`, `turnstileSiteKey`) and the Turnstile widget on joining (a new one
  after each attempt).
- A contributor can change the linked wallet (or account) until a contribution names it, never
  during their own turn: `POST /api/link` with another wallet replaces the link, `GET /api/link`
  says whether it can change (`linked.changeRefusal`), and the page offers "Change wallet". The
  transcript still holds one wallet per GitHub account.
- A third wallet signature scheme, **`ed25519`**, for Solana wallets (`solana:signMessage`, the
  message bare) and ed25519 accounts of Substrate extensions (a Ledger, `<Bytes>`-wrapped): the
  account is the SS58 form of the 32-byte public key; links, attestations, the transcript and
  `verify` accept it, and a signature of another curve by the same address is refused.
- A deployment per network in the coordinator's `wrangler.jsonc`, each with its own Worker,
  Durable Object, buckets, rate-limit namespaces, OAuth app, Turnstile key and secrets:
  - `env.testnet`, the public rehearsal on `ceremony.testnet.orbinum.network`;
  - `env.mainnet` on `ceremony.orbinum.network`, prepared: its OAuth app, Access, verifier and
    Turnstile values are filled before its first deploy.
- `pnpm --filter @orbinum-ceremony/e2e stack`: a local ceremony that stays open, to work on the
  client against.

### Changed

- **Releases ship by tag**, as the explorer's: a signed `vX.Y.Z` tag on a commit of `main` that
  passed CI deploys that version to testnet (client built, `wrangler deploy --env testnet`) and
  creates its GitHub release with the client bundle; `gh workflow run release.yml -f
  version=X.Y.Z` ships the same tag to mainnet, only after testnet. CI never cancels a run on
  `main`.
- `GET /api/link` also answers who is signed in (`githubId`, `login`) and the `ceremonyId`:
  everything a link payload names but the nonce.

### Fixed

- The coordinator sends the Access service token of the verifier's Tunnel with every dispatch
  (`VERIFIER_ACCESS_CLIENT_ID` / `VERIFIER_ACCESS_CLIENT_SECRET`, optional secrets, both or
  neither, https only): with Access in front of the verifier, as documented, every dispatch was
  refused.
- `publish-init` and `publish-final` send an operator call again when it is lost to the network,
  a rate limit or a server-side failure (3 attempts, with backoff): every one is idempotent. A
  dropped connection inside `wrangler dev` made the e2e stack fail now and then while publishing.

### Security

From three security audits of the repository (source review; every lead reproduced with a
test before its fix).

- **Every uploaded BN254 point is on its curve**, and a new G2 point is in its subgroup: snarkjs
  reads points as raw bytes and its pairing check accepted an off-curve `g1_s` with secret −1
  (`g1_sx = −g1_s`), which every later key copies and the independent verifier refuses, so one
  turn could lose the circuit's ceremony after the beacon. Core now checks the curve of every
  point it decodes (δ, MPC entries, L and H) in the verifier, `contribute` and the browser.

- **ed25519 signatures follow one strict rule everywhere** (core `verify.ts`): RFC 8032 with
  canonical encodings and a prime-order public key and `R`. The library default the coordinator
  ran (ZIP-215 in its JS backend: workerd cannot load the wasm one) accepted a small-order key
  that verifies any message, so anyone could link a keyless "wallet", and torsion-mixed keys,
  so one secret could link several GitHub accounts; Node's wasm backend refused most of these,
  so a sealed transcript could fail `verify`. sr25519's identity key is refused too.
- `hono` 4.13.19 (GHSA-h7mg-cq63-vhpq: some route sets skipped wildcard middleware, the way this
  coordinator mounts its guards; GHSA-4m76-xfj5-7975, GHSA-46wx-v44x-9hh2,
  GHSA-4h7h-rv7c-7m2v, GHSA-3gg2-335m-rxc6). `wrangler` 4.165.0 and
  `@cloudflare/vitest-plugin` 1.8.5 (development: undici and zod advisories). `pnpm audit`: none.
- The coordinator ↔ verifier MAC carries its direction, follows from the path, and signs no other
  path; both sides refuse a stale or future timestamp before reading the body. The coordinator
  and the verifier must be deployed together. `/internal/*` has no rate limit ahead of the MAC
  (a shared per-network bucket let anyone on the verifier's network throttle it, and a throttled
  report ended the upload as `infra`), and the verifier retries a 429 like a 5xx.
- `SESSION_KEY` and `VERIFIER_HMAC_KEY` must differ as HMAC keys; `ENVIRONMENT` must be `local`,
  `testnet` or `production`.
- `/admin/*` refuses a foreign origin; an Access identity is the token's `email` (with an `@`),
  or a service token's Client ID (`<32 hex>.access`), never another `common_name`.
- Setup files are frozen once the setup is, so configure first checks every r1cs against its pin
  (and the ptau's size outside a local rehearsal); a final file is replaced only over the version
  just seen, and finalization waits while one is being written; a testnet coordinator freezes
  only a testnet announcement, production only mainnet. Sealing arms a publish retry first.
- An `ambiguous` result counts toward the session's infra bound; a verdict of the independent
  verifier that is not ok fails even without a named check; an artifact key longer than R2 allows
  is not found.
- One upload streams per job at a time (a second is refused before its bytes move); joining
  spends a per-identity limit before the Turnstile check.
- The verifier queues at most 32 jobs, runs each against a deadline counted from its dispatch
  (skipping one that waited it out), refuses another spec under an attempt already taken,
  re-checks its staged copy of the upload before blaming the file, counts `EBUSY`, `EAGAIN` and
  `ENOBUFS` as its own faults, checks a staged copy's size, and sweeps what a killed run left in
  tmpdir.
- The client shows only the sign-in refusal reasons it knows, revalidates every download, signs an
  attestation only if the receipt matches the contributions it showed, keeps the first wallet
  announced per rdns, and ships `_headers` that forbid framing; the dev proxy drops identity
  headers a browser sends, signs in only loopback clients, rewrites only its own origin and
  serves no CORS; the e2e stack draws fresh keys per run.
- The CLI takes only tag names git takes, refuses `.git` in every spelling git refuses when it
  exports a release, keeps https on every redirect hop of a download (and loopback on an http
  one, never a private address after https), and `contribute` refuses a head that forks from or
  lags the published transcript.
- `/internal/*` judges the MAC headers' shape and freshness before reading any body byte (a
  body without `Content-Length` was read first). The Worker accepts a Turnstile solve only from
  the join widget (action `join`).
- Each final-file write holds finalization on its own (two writes of one file no longer release
  each other's hold); a verifier report counts as received before the queue's clock catches up,
  so a timely result is never judged late; a commit keeps the publish-retry alarm a later
  commit still needs.
- `contribute` refuses a head whose bytes are not the key the published transcript records last
  (or the pinned genesis), not only one whose contributions differ.
- Releases ship only a tag signed by the release key, on `main`, whose commit passed CI there;
  versions reach shells through the environment; the circuits are cloned by the pinned commit
  (not a ref name someone could move) before any dependency is installed, and installed without
  scripts, pnpmfile or package-manager switch; `packageManager` pins pnpm's hash; the trufflehog
  image is pinned; the client's CI steps fail if their filter matches nothing.

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
