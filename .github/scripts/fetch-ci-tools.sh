#!/usr/bin/env bash
# fetch-ci-tools.sh [dir]   (default: .test-inputs; Linux x86_64, as CI runs)
#
# Downloads the external tools of the strict verification, each checked against its pin before
# it is kept, and prints the environment that enables the tests that need them:
#   - ceremony-verifier, the independent Rust verifier, from its release (SHA-256 from the
#     release's checksums file; the package also carries signed build provenance);
#   - circom, the compiler the circuits are rebuilt with (core's TOOLING.circom). iden3 publishes
#     no checksums, so the pin is the SHA-256 of the release binary as first downloaded.
# circom goes to <dir>/bin; CI adds it to PATH. A cached file with the right digest is kept.
set -euo pipefail

DIR=${1:-.test-inputs}
VERIFIER_VERSION=v0.1.0
VERIFIER=ceremony-verifier-${VERIFIER_VERSION}-x86_64-unknown-linux-gnu
VERIFIER_SHA256=e4907bff5f75c6cc5951716a89392ebcf4ff839125101ce6ebfa79674cf5c62f
CIRCOM_VERSION=v2.2.3
CIRCOM_SHA256=85342c7ff332d948df7c0c50ecf201e6129349aef550ce873f3c811b79fe53a3

digest() { python3 -c 'import hashlib, sys; print(hashlib.sha256(open(sys.argv[1], "rb").read()).hexdigest())' "$1"; }

# fetch <url> <sha256> <dest>: nothing unverified is ever left at <dest>.
fetch() {
  local url=$1 expected=$2 dest=$3
  if [ -f "$dest" ] && [ "$(digest "$dest")" = "$expected" ]; then
    echo "✓ $dest (pinned sha256, cached)" >&2
    return
  fi
  curl -fL --retry 3 --silent --show-error -o "$dest.part" "$url"
  if [ "$(digest "$dest.part")" != "$expected" ]; then
    rm -f -- "$dest.part"
    echo "✗ $url does not match its pinned sha256" >&2
    exit 1
  fi
  mv -f -- "$dest.part" "$dest"
  echo "✓ $dest (pinned sha256)" >&2
}

mkdir -p "$DIR/bin"
fetch "https://github.com/orbinum/ceremony-verifier/releases/download/$VERIFIER_VERSION/$VERIFIER.tar.gz" \
  "$VERIFIER_SHA256" "$DIR/$VERIFIER.tar.gz"
tar -xzf "$DIR/$VERIFIER.tar.gz" -C "$DIR"
fetch "https://github.com/iden3/circom/releases/download/$CIRCOM_VERSION/circom-linux-amd64" \
  "$CIRCOM_SHA256" "$DIR/bin/circom"
chmod +x "$DIR/bin/circom"

echo "ORBINUM_RUST_VERIFIER=$(cd "$DIR" && pwd)/$VERIFIER/ceremony-verifier"
