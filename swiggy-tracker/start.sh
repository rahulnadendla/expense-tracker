#!/bin/bash
# Use Node 18+ (Homebrew). System Node may be old (e.g. v4) and will break the build.
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "$(dirname "$0")"

echo "Using Node: $(node -v)"
echo "Building..."
npm run build || exit 1
echo "Starting server on http://localhost:4000"
npm start
