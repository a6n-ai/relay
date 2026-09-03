#!/usr/bin/env bash
# Production deploy. Images are built in CI and pushed to GHCR; this only pulls
# and starts them. Run on the EC2 box (or via the deploy workflow over SSH).
# Requires: docker, awscli, jq, a checked-out repo, and ssm:GetParametersByPath
# on $SSM_PATH via the instance role.
set -euo pipefail
cd "$(dirname "$0")"   # deployment/prod/relay

SSM_PATH="${SSM_PATH:-/relay/prod}"
SSM_REGION="${SSM_REGION:-us-east-1}"
umask 077
aws ssm get-parameters-by-path --region "$SSM_REGION" --path "$SSM_PATH" \
  --recursive --with-decryption --query 'Parameters[].[Name,Value]' --output json \
  | jq -r '.[]
      | (.[0] | split("/") | last) as $k
      | .[1] as $v
      | ([39] | implode) as $q
      | if ($v | explode | index(39))
        then error("\($k): value contains a single quote, which .env.production cannot represent - change the parameter value")
        else "\($k)=\($q)\($v)\($q)"
        end' > .env.production.tmp
test -s .env.production.tmp || { echo "no parameters under $SSM_PATH in $SSM_REGION"; exit 1; }
mv .env.production.tmp .env.production

set -a; . ./.env.production; set +a
export IMAGE_TAG="${IMAGE_TAG:-latest}"

git -C ../../.. pull --ff-only

docker compose pull
docker compose --profile tools pull
docker compose --profile tools run --rm migrate
docker compose up -d
docker image prune -af
