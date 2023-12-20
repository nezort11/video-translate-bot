#!/usr/bin/env bash

PACKAGE_FILE="package.json"
PACKAGE_RUN_COMMAND="pnpm"
RUN_COMMAND="sudo bash run.sh"

# Check the package.json file
if [ -f "$PACKAGE_FILE" ]; then
  SCRIPT=$1

  # Extract the script command using jq (Install jq: https://stedolan.github.io/jq/download/)
  script_command=$(jq -r ".scripts.\"$SCRIPT\"" "$PACKAGE_FILE")

  if [ ! -z "$script_command" ] && [ "$script_command" != "null" ]; then
    eval "$(echo $script_command | sed -e "s/${PACKAGE_RUN_COMMAND}/${RUN_COMMAND}/g") ${@:2}"
  else
    echo "Script '$SCRIPT' not found in $PACKAGE_FILE"
  fi
else
  echo "$PACKAGE_FILE not found"
fi
