# The verifier service as a Cloudflare Container (packages/coordinator/wrangler.jsonc,
# `containers`; COORDINATOR §5). Built from the repository root. Its disk starts empty: at startup
# it mirrors the published inputs from COORDINATOR_URL, checked against INIT_SHA256 and the pins.
# The coordinator's VerifierContainer passes COORDINATOR_URL, VERIFIER_HMAC_KEY and INIT_SHA256.
# The base image is pinned by digest (the multi-arch index of node:22.15.0-bookworm-slim).
FROM node:22.15.0-bookworm-slim@sha256:557e52a0fcb928ee113df7e1fb5d4f60c1341dbda53f55e3d815ca10807efdce

WORKDIR /app

# Dependencies first (cached while only sources change): only core's and the verifier's, from
# the lockfile, with pnpm as `packageManager` pins it (version and hash). Every workspace manifest
# is present so the lockfile is checked whole.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/cli/package.json packages/cli/
COPY packages/client/package.json packages/client/
COPY packages/coordinator/package.json packages/coordinator/
COPY packages/core/package.json packages/core/
COPY packages/e2e/package.json packages/e2e/
COPY packages/verifier/package.json packages/verifier/
RUN corepack enable \
  && pnpm install --frozen-lockfile --prod --filter "@orbinum-ceremony/verifier..." \
  && pnpm store prune

COPY tsconfig.base.json ./
COPY packages/core/tsconfig.json packages/core/
COPY packages/core/src packages/core/src
COPY packages/verifier/tsconfig.json packages/verifier/
COPY packages/verifier/src packages/verifier/src

# Inputs, staged copies and attempt logs live on the container's own disk, owned by `node`.
ENV CEREMONY_DIR=/home/node/ceremony \
    PTAU=/home/node/ceremony/ptau/powersOfTau28_hez_final_16.ptau \
    HOST=0.0.0.0 \
    PORT=8788 \
    NODE_ENV=production
USER node
EXPOSE 8788

WORKDIR /app/packages/verifier
CMD ["node", "--import", "tsx", "src/service/main.ts"]
