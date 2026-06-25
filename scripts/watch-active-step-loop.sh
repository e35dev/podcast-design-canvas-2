#!/usr/bin/env bash
set -euo pipefail

REPO="e35dev/podcast-design-canvas-2"
LABEL="bl:active-step"
DELAY_SECONDS="${DELAY_SECONDS:-1}"
REPO_DIR="/home/ubuntu/codes/tmimmanuel/podcast-design-canvas-2"

has_closer_pr() {
  local number="$1"
  local pr_list
  pr_list="$(gh pr list --repo "$REPO" --state all --json number,title,body,url,state \
    --search "#${number}" --jq '.')"
  if [[ -z "$pr_list" ]]; then
    return 1
  fi
  if echo "$pr_list" | jq -r '.[] | ((.title // "") + "\n" + (.body // ""))' \
    | tr "[:upper:]" "[:lower:]" \
    | grep -E "closes|fixes|resolves|resolved|fix|close|resolve" \
    | grep -q "#${number}"; then
    return 0
  fi
  return 1
}

claim_issue_if_uncovered() {
  local number="$1"
  local title="$2"
  local branch="feat/issue-${number}-active-step-$(date +%s)"

  git -C "$REPO_DIR" fetch upstream
  git -C "$REPO_DIR" checkout -b "$branch" upstream/main

  echo "No closer PR found for #$number ($title). Branch created: $branch"
  echo "Implement fix on this branch before opening a PR."
}

while true; do
  issues="$(gh issue list --repo "$REPO" --state open --label "$LABEL" --json number,title,url,state,createdAt)"
  if [[ -z "$issues" ]]; then
    echo "No open issues with $LABEL at $(date -u +%FT%TZ)"
  else
    echo "$issues" | jq -c '.[]' | while read -r issue; do
      number="$(echo "$issue" | jq -r '.number')"
      title="$(echo "$issue" | jq -r '.title')"
      state="$(echo "$issue" | jq -r '.state')"

      if [[ "${state,,}" != "open" ]]; then
        continue
      fi

      if has_closer_pr "$number"; then
        echo "Skipping #$number ($title): existing PR already closes it."
        continue
      fi

      # Double-check the issue state immediately before branch/PR work.
      current_state="$(gh issue view "$number" --repo "$REPO" --json state --jq '.state')"
      if [[ "$current_state" != "OPEN" ]]; then
        echo "Skipping #$number: not open anymore ($current_state)."
        continue
      fi

      echo "Eligible issue found: #$number — ${title}"
      claim_issue_if_uncovered "$number" "$title"
      exit 0
    done
  fi

  if [[ "${WATCH_ONCE:-0}" == "1" ]]; then
    break
  fi
  sleep "$DELAY_SECONDS"
done
