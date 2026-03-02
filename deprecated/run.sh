#!/usr/bin/env bash

PACKAGE_FILE="package.json"
PACKAGE_RUN_COMMAND="npm"
RUN_COMMAND="bash ${0}"
SCRIPT="$1"

# Check package manager
if [ -f "package-lock.json" ]; then
  PACKAGE_RUN_COMMAND="npm"
fi
if [ -f "yarn.lock" ]; then
  PACKAGE_RUN_COMMAND="yarn"
fi
if [ -f "pnpm-lock.yaml" ]; then
  PACKAGE_RUN_COMMAND="pnpm"
fi

# Check run as superuser
if [ "$EUID" -eq 0 ]; then
  RUN_COMMAND="sudo $RUN_COMMAND"
fi

# Check package file
if [ -f "$PACKAGE_FILE" ]; then
  # Extract the script command using jq (Install jq: https://stedolan.github.io/jq/download/)
  script_command=$(jq -r ".scripts.\"$SCRIPT\"" "$PACKAGE_FILE")

  if [ ! -z "$script_command" ] && [ "$script_command" != "null" ]; then
    eval "$(echo $script_command | sed -e "s@${PACKAGE_RUN_COMMAND}@${RUN_COMMAND}@g") ${@:2}"
  else
    echo "Script '$SCRIPT' not found in $PACKAGE_FILE"
  fi
else
  echo "$PACKAGE_FILE not found"
fi
