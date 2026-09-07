#!/usr/bin/env bash
# Administrator-only upgrade from an extracted, reviewed exact-commit archive.
# Usage: sudo bash apps/server/deploy/admin-upgrade.sh FULL_COMMIT_SHA
set -euo pipefail
umask 077
[[ $EUID == 0 && $# == 1 && $1 =~ ^[a-f0-9]{40}$ ]] || { echo 'Run as root with the full source commit SHA'; exit 2; }
revision=$1
source_dir=$(cd "$(dirname "$0")/.." && pwd)
source_root=$(cd "$source_dir/../.." && pwd)
[[ $(basename "$source_root") == "PiMesh-$revision" ]] || { echo 'Use the extracted exact-commit PiMesh archive'; exit 2; }
root=/opt/pimesh/deployment
previous=$(readlink -f "$root/current")
[[ -d $previous && -f /etc/pimesh/server.env && -f /etc/pimesh-deploy/ca.crt ]]
for tool in node pg_dump pg_restore createdb dropdb runuser flock openssl; do command -v "$tool" >/dev/null; done
openssl x509 -in /etc/pimesh-deploy/ca.crt -checkend 86400 -noout
exec 9>"$root/deploy.lock"
flock -n 9 || { echo 'Another deployment is running'; exit 1; }
stage=$(mktemp -d "$root/releases/$revision.XXXXXX")
cp -a "$source_dir/." "$stage/"
# Reuse existing dependencies only when their full lock metadata matches.
node --input-type=module - "$previous" "$stage" <<'NODE'
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const locks = process.argv.slice(2).map((dir) => {
  const lock = JSON.parse(readFileSync(`${dir}/package-lock.json`, 'utf8'));
  delete lock.version; delete lock.packages[''].version; return lock;
});
assert.deepStrictEqual(locks[0], locks[1], 'Dependency changes require a separately prepared release package');
NODE
cp -a "$previous/node_modules" "$stage/"
npm run check --prefix "$stage"
npm ls --prefix "$stage" --omit=dev
chown -R pimesh-deploy:pimesh-deploy "$stage"
chmod -R a+rX "$stage"
backup_dir=$(mktemp -d /var/tmp/pimesh-backup.XXXXXX)
backup="$backup_dir/database.dump"
restore_db="pimesh_test_restore_$(date +%s)_$$"
restore_created=false
switched=false
success=false
activate() {
  local link="$root/current.admin-$$"
  ln -s "$1" "$link"
  mv -Tf "$link" "$root/current"
}
cleanup() {
  code=$?
  trap - EXIT
  if [[ $restore_created == true ]]; then runuser -u postgres -- dropdb "$restore_db" || true; fi
  if [[ $success != true && $switched == true ]]; then
    activate "$previous"
    systemctl restart pimesh-team || true
    echo 'New application failed; previous application restored. Database extensions retained.'
  fi
  if [[ $success != true ]]; then echo "Upgrade incomplete. Backup/log directory retained: $backup_dir"; fi
  exit "$code"
}
trap cleanup EXIT
systemd-run --wait --pipe --collect --unit="pimesh-backup-$$" \
  --property=EnvironmentFile=/etc/pimesh/server.env \
  /usr/bin/node "$stage/deploy/backup-database.mjs" "$backup"
test -s "$backup"
chmod 600 "$backup"
runuser -u postgres -- createdb "$restore_db"
restore_created=true
# Do not print restored production data or database errors into the terminal.
if ! runuser -u postgres -- pg_restore --exit-on-error --no-owner --no-privileges --dbname "$restore_db" < "$backup" > "$backup_dir/restore.log" 2>&1; then
  echo "Backup restore verification failed; inspect $backup_dir/restore.log locally"; exit 1
fi
runuser -u postgres -- dropdb "$restore_db"
restore_created=false
echo 'Backup restore verification passed'
systemd-run --wait --pipe --collect --unit="pimesh-migrate-$$" \
  --property=User=pimesh --property=Group=pimesh --property=EnvironmentFile=/etc/pimesh/server.env \
  /usr/bin/node "$stage/src/migrate.mjs"
printf '%s\n' "$revision" > "$stage/REVISION"
activate "$stage"
switched=true
systemctl restart pimesh-team
curl --config /etc/pimesh-deploy/health.conf --connect-timeout 5 --max-time 10 \
  --retry 5 --retry-connrefused --retry-delay 2 --fail --silent --show-error
version=$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1])).version" "$stage/package.json")
systemd-run --wait --pipe --collect --unit="pimesh-verify-$$" \
  --property=EnvironmentFile=/etc/pimesh/server.env \
  /usr/bin/node "$stage/deploy/verify-release.mjs" "$version"
success=true
echo "Server $version deployed at $revision"
echo "Backup retained at $backup (keep private; do not upload to GitHub)"
