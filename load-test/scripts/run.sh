#!/bin/sh
set -eu

case "${SCENARIO:-100k}" in
  100k|burst|unique|repeat) scenario="${SCENARIO:-100k}" ;;
  *) echo "Unknown scenario. Use: 100k, burst, unique, or repeat" >&2; exit 2 ;;
esac

echo "Authorized infrastructure only. Target: ${TARGET_URL:-http://app:3000}"
exec k6 run "/load-test/scenarios/${scenario}.js"
