#!/bin/bash
set -euo pipefail

pnpm install --frozen-lockfile

# `@workspace/db` currently defines no tables, so `drizzle-kit push` would be a
# silent no-op that looks like it succeeded. Fail loudly instead of pretending
# the database is in sync.
if grep -q 'export {}' lib/db/src/schema/index.ts; then
  echo "post-merge: lib/db defines no tables yet; skipping schema push." >&2
else
  pnpm --filter @workspace/db run push
fi

# Fail the build if the OpenAPI spec and the generated clients have drifted.
pnpm --filter @workspace/api-spec run codegen
if ! git diff --quiet -- lib/api-client-react/src/generated lib/api-zod/src/generated; then
  echo "post-merge: generated API clients are out of date. Run pnpm --filter @workspace/api-spec codegen and commit the result." >&2
  git diff --stat -- lib/api-client-react/src/generated lib/api-zod/src/generated >&2
  exit 1
fi
