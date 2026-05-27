#!/bin/bash
# Opens a localhost capture URL for Figma html-to-design.
# Usage: ./scripts/figma-capture-open.sh <capture-scene> <capture-id>

SCENE="$1"
CAPTURE_ID="$2"
PORT="${VITE_PORT:-5190}"
ENDPOINT="https%3A%2F%2Fmcp.figma.com%2Fmcp%2Fcapture%2F${CAPTURE_ID}%2Fsubmit"
URL="http://localhost:${PORT}/?capture-scene=${SCENE}#figmacapture=${CAPTURE_ID}&figmaendpoint=${ENDPOINT}&figmadelay=3000"
echo "Opening: $URL"
open "$URL"
