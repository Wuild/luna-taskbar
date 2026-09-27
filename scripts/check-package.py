#!/usr/bin/env python3
"""Validate submission archive basics; this is not GNOME review approval."""
import json
from pathlib import PurePosixPath
import sys
import zipfile

with zipfile.ZipFile(sys.argv[1]) as archive:
    names = archive.namelist()
    metadata = json.loads(archive.read('metadata.json'))
    assert 'clipboard' in metadata['description'].lower(), 'Missing clipboard disclosure'
    assert 'version' not in metadata, 'The review service owns the version field'
    assert metadata.get('session-modes') != ['user'], 'Unnecessary session-modes'
    schema = metadata['settings-schema']
    assert schema.startswith('org.gnome.shell.extensions.')
    assert f'schemas/{schema}.gschema.xml' in names
    assert all(name in names for name in ['extension.js', 'prefs.js', 'LICENSE', 'LICENSE-NOTICE'])
    for name in names:
        path = PurePosixPath(name)
        assert not path.is_absolute() and '..' not in path.parts, name
        assert not any(part in ['node_modules', 'tests', 'scripts', '__pycache__', '.git'] for part in path.parts), name
        assert path.suffix not in ['.so', '.typelib', '.pyc', '.ts', '.map'], name
        if name.endswith('/'):
            continue
        data = archive.read(name)
        assert not data.startswith(b'\x7fELF'), f'Native binary: {name}'
        if name.endswith('.py'):
            assert metadata['uuid'] == 'luna-taskbar@wuild' and name == 'compat/tray/x11.py', f'Undocumented helper: {name}'
print(f'SUBMISSION_ARCHIVE_PASS: {metadata["uuid"]}')
