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
