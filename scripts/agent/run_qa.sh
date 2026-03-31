#!/usr/bin/env bash

set -u

slug=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --slug)
      slug="$2"
      shift 2
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -z "$slug" ]]; then
  echo "Usage: scripts/agent/run_qa.sh --slug <slug>" >&2
  exit 2
fi

run_check() {
  local name="$1"
  local cmd="$2"
  local output
  local status
  local notes
  output=$(eval "$cmd" 2>&1)
  if [[ $? -eq 0 ]]; then
    status="PASS"
    if [[ -n "$output" ]]; then
      notes=$(echo "$output" | tail -n 2 | tr '\n' ' ' | sed 's/  */ /g')
    else
      notes="OK"
    fi
  else
    status="FAIL"
    notes=$(echo "$output" | tail -n 4 | tr '\n' ' ' | sed 's/  */ /g')
  fi
  results+=("$name|$status|$cmd|$notes")
  if [[ "$status" == "FAIL" ]]; then
    failures=$((failures + 1))
  fi
}

results=()
failures=0
today=$(date +%F)

run_check "preflight" "python3 scripts/agent/preflight.py --slug $slug"
run_check "validate_results" "python3 scripts/agent/validate_results.py --slug $slug"
run_check "check_nis_codes" "python3 scripts/agent/check_nis_codes.py --slug $slug"
run_check "check_embed_config" "python3 scripts/agent/check_embed_config.py --slug $slug"
run_check "validate_component_usage" "python3 .github/skills/blog-post-creator/scripts/validate_component_usage.py"
run_check "validate_mdx" "python3 .github/skills/blog-post-creator/scripts/validate_mdx.py"
run_check "validate_embed_consistency" "node .github/skills/blog-post-creator/scripts/validate_embed_consistency.js"
run_check "press_publish_existing" "python3 .github/press-format/scripts/format_press.py --publish-existing"

echo "QA Report - $slug - $today"
echo ""
echo "Checks:"
for item in "${results[@]}"; do
  IFS="|" read -r name status cmd notes <<< "$item"
  echo "- $name: $status"
  echo "  command: $cmd"
  echo "  notes: ${notes:-OK}"
done
echo ""
echo "Summary:"
if [[ $failures -gt 0 ]]; then
  overall="FAIL"
  next_action="fix failing checks and re-run"
else
  overall="PASS"
  next_action="none"
fi
echo "- overall: $overall"
echo "- blockers: $failures"
echo "- next_action: $next_action"
