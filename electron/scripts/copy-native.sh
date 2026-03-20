#!/bin/bash
set -e

APP_DIR="release/mac-arm64/LumiTask.app/Contents/Resources/standalone"
if [ -d "$APP_DIR" ]; then
  cp node_modules/better-sqlite3/build/Release/better_sqlite3.node \
     "$APP_DIR/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
  echo "✅ Native module copied to app bundle"
else
  echo "⚠️ App bundle not found at: $APP_DIR"
fi
