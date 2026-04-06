#!/bin/bash
export PATH="$HOME/.local/node-v20.11.1-darwin-arm64/bin:$PATH"
cd "$(dirname "$0")/server"
exec node server.js
