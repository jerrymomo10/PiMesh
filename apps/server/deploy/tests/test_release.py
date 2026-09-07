"""Exercise activation and rollback with temporary releases and fake system services."""
import io
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'release.sh'


class ReleaseTests(unittest.TestCase):
    def run_release(self, mode='success', migration='initial', sha='a' * 40):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            old = root / 'releases/old'
            (old / 'migrations').mkdir(parents=True)
            (old / 'migrations/001.sql').write_text('initial')
            (root / 'current').symlink_to(old)
            binaries = root / 'bin'
            binaries.mkdir()
            scripts = {
                'flock': '#!/bin/sh\nexit 0\n',
                'node': '#!/bin/sh\nexit 0\n',
                'sleep': '#!/bin/sh\nexit 0\n',
                'sudo': '#!/bin/sh\n[ "$MODE" != restart_failure ] || [ "$(readlink "$TEST_ROOT/current")" = "$TEST_ROOT/releases/old" ]\n',
                'curl': '#!/bin/sh\n[ "$MODE" != health_failure ] || [ "$(readlink "$TEST_ROOT/current")" = "$TEST_ROOT/releases/old" ]\n',
                'mv': '#!/usr/bin/env python3\nimport os,sys\nos.replace(sys.argv[-2], sys.argv[-1])\n',
            }
            for name, content in scripts.items():
                path = binaries / name
                path.write_text(content)
                path.chmod(0o755)
            script = root / 'release.sh'
            script.write_text(SOURCE.read_text().replace('ROOT=/opt/pimesh/deployment', f'ROOT={root}'))
            archive = io.BytesIO()
            with tarfile.open(fileobj=archive, mode='w:gz') as tar:
                for name, content in {'src/index.mjs': '', 'node_modules/pg/package.json': '{}', 'migrations/001.sql': migration}.items():
                    encoded = content.encode()
                    entry = tarfile.TarInfo(name)
                    entry.size = len(encoded)
                    tar.addfile(entry, io.BytesIO(encoded))
            result = subprocess.run(['bash', str(script)], input=archive.getvalue(), capture_output=True,
                                    env={**os.environ, 'PATH': f'{binaries}:{os.environ["PATH"]}',
                                         'SSH_ORIGINAL_COMMAND': sha, 'MODE': mode, 'TEST_ROOT': str(root)})
            current = (root / 'current').resolve()
            if result.returncode == 0:
                self.assertEqual(current.stat().st_mode & 0o755, 0o755)
            return result.returncode, current == old, result.stderr.decode()

    def test_success(self):
        code, old, error = self.run_release()
        self.assertEqual(code, 0, error)
        self.assertFalse(old)

    def test_restart_failure_rolls_back(self):
        code, old, error = self.run_release(mode='restart_failure')
        self.assertNotEqual(code, 0)
        self.assertTrue(old, error)
        self.assertIn('Previous application restored', error)

    def test_health_failure_rolls_back(self):
        code, old, error = self.run_release(mode='health_failure')
        self.assertNotEqual(code, 0)
        self.assertTrue(old, error)
        self.assertIn('Previous application restored', error)

    def test_migration_change_does_not_activate(self):
        code, old, error = self.run_release(migration='changed')
        self.assertNotEqual(code, 0)
        self.assertTrue(old)
        self.assertIn('Migration files changed', error)

    def test_invalid_revision_rejected(self):
        code, old, _ = self.run_release(sha='main; echo no')
        self.assertNotEqual(code, 0)
        self.assertTrue(old)


if __name__ == '__main__':
    unittest.main()
