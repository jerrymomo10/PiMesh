#!/usr/bin/env bash
# Installed root-owned; invoked by a forced SSH command as pimesh-deploy.
set -euo pipefail
umask 022
ROOT=/opt/pimesh/deployment
HEALTH_CONFIG=/etc/pimesh-deploy/health.conf
SYSTEMCTL=/usr/bin/systemctl
sha=${SSH_ORIGINAL_COMMAND:-}
[[ $sha =~ ^[a-f0-9]{40}$ ]] || { echo 'Expected a full commit SHA' >&2; exit 2; }
exec 9>"$ROOT/deploy.lock"
flock -n 9 || { echo 'Another deployment is running' >&2; exit 1; }
previous=$(readlink -f "$ROOT/current")
[[ -d $previous ]] || { echo 'Missing previous release' >&2; exit 1; }
stage=$(mktemp -d "$ROOT/releases/$sha.XXXXXX")
chmod 755 "$stage"
switched=false
success=false
health() {
  for attempt in {1..15}; do
    if curl --config "$HEALTH_CONFIG" --fail --silent --show-error --max-time 3 --output /dev/null; then
      return 0
    fi
    sleep 2
  done
  return 1
}
activate() {
  ln -s "$1" "$ROOT/current.next"
  mv -Tf "$ROOT/current.next" "$ROOT/current"
}
cleanup() {
  code=$?
  trap - EXIT
  if [[ $success != true ]]; then
    if [[ $switched == true ]]; then
      echo 'Deployment failed; restoring previous application' >&2
      activate "$previous"
      if sudo -n "$SYSTEMCTL" restart pimesh-team && health; then
        echo 'Previous application restored' >&2
      else
        echo 'CRITICAL: rollback health check failed' >&2
      fi
    fi
    rm -rf -- "$stage"
    [[ $code != 0 ]] || code=1
  fi
  exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# Archive is extracted without root privileges; production secrets live elsewhere.
tar -xzf - --no-same-owner --no-same-permissions -C "$stage"
[[ -f $stage/src/index.mjs && -f $stage/node_modules/pg/package.json ]]
if ! diff -qr "$previous/migrations" "$stage/migrations"; then
  echo 'Migration files changed. Apply and verify migration manually before deployment.' >&2
  exit 1
fi
node --check "$stage/src/index.mjs"
printf '%s\n' "$sha" > "$stage/REVISION"
activate "$stage"
switched=true
sudo -n "$SYSTEMCTL" restart pimesh-team
health
success=true
echo "Deployed $sha; previous release retained"
