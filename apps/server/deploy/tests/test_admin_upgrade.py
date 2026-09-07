"""Run the administrator orchestration against disposable files and fake services.

The copied script substitutes only privilege/environment paths; no real systemd,
database, account ownership or production path is used.
"""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'admin-upgrade.sh'
SHA = 'a' * 40


class AdminUpgradeTests(unittest.TestCase):
    def run_upgrade(self, mode):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            deployment = root / 'deployment'
            old = deployment / 'releases/old'
            (old / 'node_modules').mkdir(parents=True)
            (deployment / 'current').symlink_to(old)
            source = root / f'PiMesh-{SHA}/apps/server'
            (source / 'deploy').mkdir(parents=True)
            config = root / 'config'
            config.mkdir()
            (config / 'server.env').write_text('synthetic')
            (config / 'ca.crt').write_text('synthetic')
            binaries = root / 'bin'
            binaries.mkdir()
            scripts = {
                'flock': '#!/bin/sh\nexit 0\n',
                'openssl': '#!/bin/sh\n[ "$MODE" != certificate_failure ]\n',
                'npm': '#!/bin/sh\nexit 0\n',
                'chown': '#!/bin/sh\nexit 0\n',
                'node': '#!/bin/sh\nif [ "$1" = -p ]; then echo 0.3.0; else cat >/dev/null; [ "$MODE" != dependency_failure ]; fi\n',
                'pg_dump': '#!/bin/sh\nexit 0\n',
                'pg_restore': '#!/bin/sh\nexit 0\n',
                'createdb': '#!/bin/sh\nexit 0\n',
                'dropdb': '#!/bin/sh\nexit 0\n',
                'mv': '#!/usr/bin/env python3\nimport os,sys\nos.replace(sys.argv[-2], sys.argv[-1])\n',
                'runuser': '''#!/bin/sh
echo "$*" >> "$TEST_ROOT/calls"
case "$*" in
  *pg_restore*) cat >/dev/null; [ "$MODE" != restore_failure ] ;;
  *) exit 0 ;;
esac
''',
                'systemd-run': '''#!/bin/bash
echo "$*" >> "$TEST_ROOT/calls"
case "$*" in
  *backup-database*) [ "$MODE" != backup_failure ] || exit 1; printf synthetic > "${@: -1}" ;;
  */src/migrate.mjs*) [ "$MODE" != migration_failure ] ;;
  *verify-release*) [ "$MODE" != verify_failure ] ;;
esac
''',
                'systemctl': '''#!/bin/sh
if [ "$(readlink "$TEST_ROOT/deployment/current")" = "$TEST_ROOT/deployment/releases/old" ]; then
  [ "$MODE" != rollback_failure ]
else
  [ "$MODE" != restart_failure ]
fi
''',
                'curl': '''#!/bin/sh
if [ "$(readlink "$TEST_ROOT/deployment/current")" = "$TEST_ROOT/deployment/releases/old" ]; then
  exit 0
else
  [ "$MODE" != health_failure ] && [ "$MODE" != rollback_failure ]
fi
''',
            }
            for name, content in scripts.items():
                file = binaries / name
                file.write_text(content)
                file.chmod(0o755)
            script = source / 'deploy/admin-upgrade.sh'
            script.write_text(SOURCE.read_text()
                              .replace('$EUID == 0', '1 == 1')
                              .replace('root=/opt/pimesh/deployment', f'root={deployment}')
                              .replace('/etc/pimesh/server.env', str(config / 'server.env'))
                              .replace('/etc/pimesh-deploy/ca.crt', str(config / 'ca.crt'))
                              .replace('/var/tmp/pimesh-backup.', str(root / 'pimesh-backup.')))
            result = subprocess.run(['bash', str(script), SHA], capture_output=True, text=True, timeout=20,
                                    env={**os.environ, 'PATH': f'{binaries}:{os.environ["PATH"]}',
                                         'MODE': mode, 'TEST_ROOT': str(root)})
            calls = (root / 'calls').read_text() if (root / 'calls').exists() else ''
            return result.returncode, (deployment / 'current').resolve() == old, result.stdout + result.stderr, calls

    def test_success_verifies_backup_then_migrates(self):
        code, old, output, calls = self.run_upgrade('success')
        self.assertEqual(code, 0, output)
        self.assertFalse(old)
        self.assertLess(calls.index('pg_restore'), calls.index('/src/migrate.mjs'))
        self.assertIn('dropdb pimesh_test_restore_', calls)
        self.assertIn('Server 0.3.0 deployed', output)

    def test_pre_activation_failures_leave_old_service(self):
        for mode in ['certificate_failure', 'dependency_failure', 'backup_failure', 'restore_failure', 'migration_failure']:
            with self.subTest(mode=mode):
                code, old, output, calls = self.run_upgrade(mode)
                self.assertNotEqual(code, 0, output)
                self.assertTrue(old)
                self.assertNotIn('deployed at', output)
                if mode in ['backup_failure', 'restore_failure']:
                    self.assertNotIn('/src/migrate.mjs', calls)
                if mode == 'restore_failure':
                    self.assertIn('dropdb pimesh_test_restore_', calls)

    def test_post_activation_failures_restore_and_check_old_service(self):
        for mode in ['restart_failure', 'health_failure', 'verify_failure']:
            with self.subTest(mode=mode):
                code, old, output, _ = self.run_upgrade(mode)
                self.assertNotEqual(code, 0, output)
                self.assertTrue(old)
                self.assertIn('restored and ready', output)

    def test_failed_rollback_does_not_claim_success(self):
        code, old, output, _ = self.run_upgrade('rollback_failure')
        self.assertNotEqual(code, 0)
        self.assertTrue(old)
        self.assertIn('CRITICAL: rollback failed', output)
        self.assertNotIn('restored and ready', output)


if __name__ == '__main__':
    unittest.main()
