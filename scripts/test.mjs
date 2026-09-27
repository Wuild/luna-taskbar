import {cp, mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const tests = ['appInteractions', 'taskModel', 'colors', 'badgeState', 'appLabel', 'windowAppearance',
    'windowGeometry', 'menuGeometry', 'trayActions', 'trayAddress', 'tray-recovery'];
const temp = await mkdtemp(path.join(tmpdir(), 'luna-taskbar-tests-'));
try {
    for (const test of tests) {
        const source = await readFile(path.join(root, 'tests', `${test}.test.js`), 'utf8');
        const rewritten = source.replace(/from '\.\.\/([^']+)'/g,
            (_match, module) => `from '${pathToFileURL(path.join(root, 'dist/compat', module)).href}'`);
        const filename = path.join(temp, `${test}.js`);
        await writeFile(filename, rewritten);
        execFileSync('dbus-run-session', ['--', 'gjs', '-m', filename], {stdio: 'inherit', timeout: 20000, env: {...process.env, GIO_USE_VFS: 'local'}});
    }
    execFileSync(process.execPath, ['--test', 'tests/typescript-core.test.mjs', 'tests/standalone.test.mjs'], {cwd: root, stdio: 'inherit'});
    await cp(path.join(root, 'tests/fixtures/org.gnome.shell.extensions.lunabar.gschema.xml'), path.join(temp, 'org.gnome.shell.extensions.lunabar.gschema.xml'));
    execFileSync('glib-compile-schemas', ['--strict', temp]);
    execFileSync('gjs', ['-m', 'tests/taskbar-settings-smoke.js'], {
        cwd: root, stdio: 'inherit', env: {...process.env, GSETTINGS_BACKEND: 'memory', LUNA_LEGACY_SCHEMA_DIR: temp}, timeout: 20000,
    });
} finally {
    await rm(temp, {recursive: true, force: true});
}
