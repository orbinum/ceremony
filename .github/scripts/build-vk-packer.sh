#!/usr/bin/env bash
# build-vk-packer.sh [dir]   (default: .test-inputs)
#
# Builds groth16-proofs' `pack-verifying-key` (the vk_hash packer) at a pinned commit, with the
# dependency versions pinned next to this script (the repository does not commit its
# Cargo.lock), and prints the environment that enables the strict verification tests:
#   ORBINUM_VK_PACKER=<path>
# Always a fresh clone and a fresh build: nothing that runs the tests' vk_hash checks comes from
# a cache another run could have written. The binary's SHA-256 is printed for the log.
set -euo pipefail

DIR=${1:-.test-inputs}
REPO=https://github.com/orbinum/groth16-proofs
COMMIT=d50b78e738eb23fa786b38a122d45c2ec4e36519 # v4.1.0
LOCK="$(cd "$(dirname "$0")" && pwd)/pack-verifying-key.Cargo.lock"
SRC="$DIR/groth16-proofs"

mkdir -p "$DIR"
rm -rf -- "$SRC"
git clone --quiet --filter=blob:none "$REPO" "$SRC"
git -C "$SRC" -c advice.detachedHead=false checkout --quiet "$COMMIT"
if [ "$(git -C "$SRC" rev-parse HEAD)" != "$COMMIT" ] || [ -n "$(git -C "$SRC" status --porcelain)" ]; then
  echo "✗ $SRC is not a clean checkout of $COMMIT" >&2
  exit 1
fi
cp -- "$LOCK" "$SRC/Cargo.lock"
# The toolchain is the one the repository pins (rust-toolchain.toml); --locked refuses any drift.
(cd "$SRC" && cargo build --quiet --release --locked --bin pack-verifying-key) >&2
BIN="$(cd "$SRC" && pwd)/target/release/pack-verifying-key"
SHA=$(python3 -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$BIN")
echo "✓ pack-verifying-key @ ${COMMIT:0:12} (locked, built fresh), sha256 $SHA" >&2

echo "ORBINUM_VK_PACKER=$BIN"
