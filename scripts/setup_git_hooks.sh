#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"
git config core.hooksPath .githooks
chmod +x .githooks/pre-push

echo "Git hooks configured."
echo "- hooksPath: $(git config --get core.hooksPath)"
echo "- pre-push: .githooks/pre-push"
echo "Use SKIP_LOCAL_CI=1 git push to bypass checks temporarily."
