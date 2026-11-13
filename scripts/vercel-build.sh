#!/usr/bin/env bash
set -eo pipefail

case "${VERCEL_GIT_COMMIT_REF:-}" in
  feature/hr-core-foundation)
    npx convex env set DEMIX_BOOTSTRAP_CLERK_SUBJECT "$DEMIX_BOOTSTRAP_CLERK_SUBJECT" --deployment valiant-barracuda-179
    npx convex deploy --cmd 'npm run build'
    ;;
  feature/operations-modules)
    npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL
    ;;
  feature/integrated-operations-modules)
    npx convex codegen
    npm run build
    ;;
  *)
    npm run build
    ;;
esac
