import {cp, mkdir, readdir, rm, readFile, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
if (process.argv.includes('--clean')) {
    await rm(dist, {recursive: true, force: true});
} else {
    await mkdir(path.join(dist, 'schemas'), {recursive: true});
    await cp(path.join(root, 'metadata.json'), path.join(dist, 'metadata.json'));
    await cp(path.join(root, 'LICENSE'), path.join(dist, 'LICENSE'));
    await cp(path.join(root, 'LICENSE-NOTICE'), path.join(dist, 'LICENSE-NOTICE'));
    await cp(path.join(root, 'stylesheet.css'), path.join(dist, 'stylesheet.css'));
    for (const file of await readdir(path.join(root, 'schemas'))) {
        if (file.endsWith('.xml')) await cp(path.join(root, 'schemas', file), path.join(dist, 'schemas', file));
    }
    await cp(path.join(root, 'src/compat/tray/x11.py'), path.join(dist, 'compat/tray/x11.py'));
    execFileSync('python3', [path.join(root, 'scripts/translations.py'), 'compile', '--output', path.join(dist, 'locale')], {stdio: 'inherit'});
    execFileSync('glib-compile-schemas', ['--strict', path.join(dist, 'schemas')], {stdio: 'inherit'});
    await writeFile(path.join(dist, 'package.json'), JSON.stringify({type: 'module'}));
    const metadata = JSON.parse(await readFile(path.join(dist, 'metadata.json'), 'utf8'));
    console.log(`Built ${metadata.name} in dist/`);
}
