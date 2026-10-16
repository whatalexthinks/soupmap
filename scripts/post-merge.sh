#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Restore the exact locked dependencies without changing the lockfile.
npm ci --no-audit --no-fund
npm run typecheck
