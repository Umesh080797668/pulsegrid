#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
GATEWAY_PROTO="$ROOT_DIR/api-gateway/src/proto/pulsecore.proto"
CORE_PROTO_REL='../../../core/core-proto/proto/pulsecore.proto'

if ! grep -q "import \"$CORE_PROTO_REL\";" "$GATEWAY_PROTO"; then
  echo "api-gateway proto does not import canonical core proto."
  echo "Expected import: import \"$CORE_PROTO_REL\";"
  exit 2
fi

echo "Proto import wrapper check passed."
