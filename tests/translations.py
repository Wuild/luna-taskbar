#!/usr/bin/env python3
"""Exercise compiled gettext catalogs in GJS, including plural and context lookup."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
# GLib deliberately keeps gettext in English for the C locale, including C.UTF-8.
locales = subprocess.check_output(['locale', '-a'], text=True).splitlines()
locale = next((name for name in locales if 'utf8' in name.lower().replace('-', '') and not name.lower().startswith('c.')), None)
if locale is None:
    raise SystemExit('Translation tests require one installed non-C UTF-8 locale (for example en_US.UTF-8).')
with tempfile.TemporaryDirectory(prefix='luna-translations-') as directory:
    fixture = Path(directory)
    (fixture / 'scripts').mkdir()
    (fixture / 'po').mkdir()
    shutil.copy(root / 'scripts/translations.py', fixture / 'scripts/translations.py')
    shutil.copy(root / 'metadata.json', fixture / 'metadata.json')
    (fixture / 'po/sv.po').write_text(r'''msgid ""
msgstr ""
"Project-Id-Version: translation-test 1\n"
"Report-Msgid-Bugs-To: test@example.invalid\n"
"POT-Creation-Date: 2026-09-27 00:00+0000\n"
"PO-Revision-Date: 2026-09-27 00:00+0000\n"
"Last-Translator: Test <test@example.invalid>\n"
"Language-Team: Test\n"
"Language: sv\n"
"MIME-Version: 1.0\n"
"Content-Type: text/plain; charset=UTF-8\n"
"Content-Transfer-Encoding: 8bit\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\n"

msgid "Translation probe"
msgstr "Översättningsprov"

#, javascript-format
msgid "%d window"
msgid_plural "%d windows"
msgstr[0] "%d fönster singular"
msgstr[1] "%d fönster plural"

msgctxt "menu"
msgid "Open"
msgstr "Öppna"

#, javascript-format
msgid "%s: %d"
msgstr "%2$d: %1$s"
''')
    subprocess.run(['python3', str(fixture / 'scripts/translations.py'), 'compile'], check=True)
    module = (root / 'dist/i18n.js').as_uri()
    source = f"import {{_, ngettext, pgettext, formatText, initTranslations}} from {json.dumps(module)};\n"
    source += f"initTranslations({json.dumps(str(fixture / 'dist'))});\n"
    source += """
function equal(actual, expected) {
    if (actual !== expected) throw new Error(JSON.stringify({actual, expected}));
}
equal(_('Translation probe'), 'Översättningsprov');
equal(_('Untranslated fallback'), 'Untranslated fallback');
equal(_(''), '');
equal(formatText(ngettext('%d window', '%d windows', 1), 1), '1 fönster singular');
equal(formatText(ngettext('%d window', '%d windows', 2), 2), '2 fönster plural');
equal(pgettext('menu', 'Open'), 'Öppna');
equal(formatText(_('%s: %d'), 'Windows', 2), '2: Windows');
equal(formatText('%% %s %d', 'text', 3), '% text 3');
"""
    if (root / 'dist/widgets/catalog.js').exists():
        widget = fixture / 'dist/desktop/widgets/translation-fixture'
        widget.mkdir(parents=True)
        (widget / 'widget.json').write_text(json.dumps({'apiVersion': 1, 'id': 'translation-fixture', 'name': 'Translation probe', 'description': 'Translation probe', 'settings': [{'key': 'probe', 'label': 'Translation probe', 'default': 'Translation probe', 'choices': [{'value': 'Translation probe', 'label': 'Translation probe'}]}]}))
        source += f"const {{discoverWidgets}} = await import({json.dumps((root / 'dist/widgets/catalog.js').as_uri())});\n"
        source += f"const widget = discoverWidgets({json.dumps(str(fixture / 'dist'))}).find(item => item.id === 'translation-fixture');\n"
        source += """
equal(widget.name, 'Översättningsprov');
equal(widget.description, 'Översättningsprov');
equal(widget.settings[0].label, 'Översättningsprov');
equal(widget.settings[0].key, 'probe');
equal(widget.settings[0].default, 'Translation probe');
equal(widget.settings[0].choices[0].value, 'Translation probe');
equal(widget.settings[0].choices[0].label, 'Översättningsprov');
"""
    source += "print('Translation catalog, fallback, plurals, context and positional formatting passed');\n"
    test = fixture / 'test.js'
    test.write_text(source)
    subprocess.run(['gjs', '-m', str(test)], check=True, env={**os.environ, 'LANGUAGE': 'sv', 'LC_ALL': locale})
