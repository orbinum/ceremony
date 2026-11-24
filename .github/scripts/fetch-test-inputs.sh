#!/usr/bin/env bash
# fetch-test-inputs.sh [dir]   (default: .test-inputs)
#
# Downloads the inputs the real-key tests need, each checked against its pin before it
# is kept, and prints the environment that enables those tests:
#   - the Hermez ptau (BLAKE2b-512, the pin of packages/core/src/config/ptau.ts);
#   - the testnet-rehearsal-2 vectors (SHA-256): the finished rehearsal of circuits v0.17.1 with
#     its whole chain — genesis, contributions, finals and their vk.json, r1cs, ceremony.json,
#     genesis/init.json and transcript.json — which the e2e, the cli and the attack suites of
#     core and verifier use.
# Both live in ceremony-verifier's releases, each published once and never changed: the ptau in
# `ptau-hez-final-16` (its original hosts answer 403 since September 2026), the vectors in
# `vectors-<ceremony>` (rebuilt byte for byte by its scripts/pack-vectors.py). A cached file with
# the right digest is kept.
set -euo pipefail

DIR=${1:-.test-inputs}
RELEASES=https://github.com/orbinum/ceremony-verifier/releases/download
PTAU=powersOfTau28_hez_final_16.ptau
PTAU_BLAKE2B=6a6277a2f74e1073601b4f9fed6e1e55226917efb0f0db8a07d98ab01df1ccf43eb0e8c3159432acd4960e2f29fe84a4198501fa54c8dad9e43297453efec125
PTAU_URL=${TEST_PTAU_URL:-$RELEASES/ptau-hez-final-16/$PTAU}
VECTORS=testnet-rehearsal-2
VECTORS_SHA256=310f4bb449f3d5fa83cc4b8f887424d5b74101494ea13375d0e95e7b408d6d27
VECTORS_URL=${TEST_VECTORS_URL:-$RELEASES/vectors-$VECTORS/$VECTORS.tar.gz}

# python3's hashlib: the same on Linux and macOS (macOS has no b2sum).
digest() {
  python3 - "$1" "$2" <<'PY'
import hashlib, sys
algo, path = sys.argv[1], sys.argv[2]
h = hashlib.blake2b(digest_size=64) if algo == "blake2b" else hashlib.new(algo)
with open(path, "rb") as f:
    for chunk in iter(lambda: f.read(1 << 20), b""):
        h.update(chunk)
print(h.hexdigest())
PY
}

# fetch <url> <algo> <digest> <dest>: nothing unverified is ever left at <dest>.
fetch() {
  local url=$1 algo=$2 expected=$3 dest=$4
  if [ -f "$dest" ] && [ "$(digest "$algo" "$dest")" = "$expected" ]; then
    echo "✓ $dest (pinned $algo, cached)" >&2
    return
  fi
  curl -fL --retry 3 --silent --show-error -o "$dest.part" "$url"
  if [ "$(digest "$algo" "$dest.part")" != "$expected" ]; then
    rm -f -- "$dest.part"
    echo "✗ $url does not match its pinned $algo" >&2
    exit 1
  fi
  mv -f -- "$dest.part" "$dest"
  echo "✓ $dest (pinned $algo)" >&2
}

mkdir -p "$DIR"
fetch "$PTAU_URL" blake2b "$PTAU_BLAKE2B" "$DIR/$PTAU"
fetch "$VECTORS_URL" sha256 "$VECTORS_SHA256" "$DIR/$VECTORS.tar.gz"
tar -xzf "$DIR/$VECTORS.tar.gz" -C "$DIR"

echo "ORBINUM_PTAU=$(cd "$DIR" && pwd)/$PTAU"
echo "ORBINUM_REHEARSAL_DIR=$(cd "$DIR" && pwd)/$VECTORS"
