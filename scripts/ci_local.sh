#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[CI] api-gateway"
pushd "$ROOT_DIR/api-gateway" >/dev/null
npm ci
npx tsc --noEmit
npm test
popd >/dev/null

echo "[CI] core"
find_libclang() {
  local libclang_file
  libclang_file="$(find /usr /usr/local \( -name 'libclang.so' -o -name 'libclang.so.*' \) 2>/dev/null | head -n 1 || true)"
  if [[ -n "$libclang_file" ]]; then
    export LIBCLANG_PATH="$(dirname "$libclang_file")"
    echo "[CI] LIBCLANG_PATH=$LIBCLANG_PATH"
    return 0
  fi

  echo "[CI] libclang not found. Install libclang-dev (Ubuntu/Debian) before running core Rust checks." >&2
  echo "[CI] Example: sudo apt-get install -y libclang-dev" >&2
  exit 1
}

find_libclang
pushd "$ROOT_DIR/core" >/dev/null
cargo check -p core-engine -p core-cli
cargo test -p core-engine --test executor_integration
popd >/dev/null

echo "[CI] dashboard"
pushd "$ROOT_DIR/dashboard" >/dev/null
npm ci
npx tsc --noEmit
npm run build
popd >/dev/null

echo "[CI] done"
