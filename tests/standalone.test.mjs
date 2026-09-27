import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir, lstat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');

test('the install identity and settings schema belong only to Luna - Taskbar', async () => {
    const metadata = JSON.parse(await readFile(path.join(dist, 'metadata.json'), 'utf8'));
    assert.equal(metadata.uuid, 'luna-taskbar@wuild');
    assert.equal(metadata['settings-schema'], 'org.gnome.shell.extensions.luna-taskbar');
    const files = await readdir(path.join(dist, 'schemas'));
    assert.deepEqual(files.filter(file => file.endsWith('.xml')), ['org.gnome.shell.extensions.luna-taskbar.gschema.xml']);
    const schema = await readFile(path.join(dist, 'schemas', files.find(file => file.endsWith('.xml'))), 'utf8');
    assert.match(schema, /path="\/org\/gnome\/shell\/extensions\/luna-taskbar\/"/);
    assert.doesNotMatch(schema, /name="desktop-/);
});

test('compiled modules and relative imports are self-contained', async () => {
    async function visit(directory) {
        for (const entry of await readdir(directory, {withFileTypes: true})) {
            const filename = path.join(directory, entry.name);
            assert.equal(entry.isSymbolicLink(), false, `External link: ${filename}`);
            if (entry.isDirectory()) { await visit(filename); continue; }
            if (!entry.name.endsWith('.js')) continue;
            const source = await readFile(filename, 'utf8');
            assert.doesNotMatch(source, /lunabar@wuild|org\.gnome\.shell\.extensions\.lunabar|_lunabar/);
            for (const [, specifier] of source.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)) {
                const resolved = path.resolve(path.dirname(filename), specifier);
                assert.ok(resolved.startsWith(dist + path.sep), `Import escapes package: ${specifier}`);
                assert.ok((await lstat(resolved)).isFile(), `Missing packaged import: ${specifier}`);
            }
        }
    }
    await visit(dist);
});
