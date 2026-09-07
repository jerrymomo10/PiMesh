#!/usr/bin/env bash
# Run as root on the existing systemd host. Public key is read from the supplied file.
set -euo pipefail
[[ $EUID == 0 && $# == 3 ]] || { echo 'Usage: sudo bash bootstrap.sh public-key health-url trusted-ca-file'; exit 2; }
keyfile=$1
health_url=$2
ca_file=$3
[[ $health_url == https://* && -f $ca_file && -f $keyfile ]]
[[ $(wc -l < "$keyfile") == 1 ]]
grep -Eq '^ssh-ed25519 [A-Za-z0-9+/=]+( .*)?$' "$keyfile"
ROOT=/opt/pimesh/deployment
id pimesh-deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash pimesh-deploy
install -d -o pimesh-deploy -g pimesh-deploy -m 755 "$ROOT" "$ROOT/releases"
install -d -o pimesh-deploy -g pimesh-deploy -m 700 /home/pimesh-deploy/.ssh
install -d -m 755 /usr/local/libexec
install -m 755 "$(dirname "$0")/release.sh" /usr/local/libexec/pimesh-release
printf 'restrict,command="/usr/local/libexec/pimesh-release" %s\n' "$(cat "$keyfile")" > /home/pimesh-deploy/.ssh/authorized_keys
chown pimesh-deploy:pimesh-deploy /home/pimesh-deploy/.ssh/authorized_keys
chmod 600 /home/pimesh-deploy/.ssh/authorized_keys
printf 'pimesh-deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart pimesh-team\n' > /etc/sudoers.d/pimesh-deploy
chmod 440 /etc/sudoers.d/pimesh-deploy
visudo -cf /etc/sudoers.d/pimesh-deploy
install -d -m 755 /etc/pimesh-deploy
install -m 644 "$ca_file" /etc/pimesh-deploy/ca.crt
printf 'url = "%s"\ncacert = "/etc/pimesh-deploy/ca.crt"\n' "$health_url" > /etc/pimesh-deploy/health.conf
chmod 644 /etc/pimesh-deploy/health.conf
if [[ ! -L $ROOT/current ]]; then
  cp -a /opt/pimesh/server "$ROOT/releases/bootstrap"
  chown -R pimesh-deploy:pimesh-deploy "$ROOT/releases/bootstrap"
  chmod -R a+rX "$ROOT/releases/bootstrap"
  ln -s "$ROOT/releases/bootstrap" "$ROOT/current"
fi
install -d -m 755 /etc/systemd/system/pimesh-team.service.d
cat > /etc/systemd/system/pimesh-team.service.d/deployment.conf <<'UNIT'
[Service]
WorkingDirectory=/opt/pimesh/deployment/current
ExecStart=
ExecStart=/usr/bin/node /opt/pimesh/deployment/current/src/index.mjs
UNIT
systemctl daemon-reload
systemctl restart pimesh-team
curl --config /etc/pimesh-deploy/health.conf --retry 10 --retry-connrefused --retry-delay 1 --fail --silent --show-error
