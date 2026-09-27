# Translations

Luna uses GNU gettext in GNOME Shell, preferences, and (for Desktop) its standalone GTK widget process. English is the fallback; no completed language translations are bundled yet.

Install the GNU gettext tools (`xgettext`, `msginit`, `msgmerge`, `msgfmt`) alongside the normal build dependencies. The translation smoke test also needs one installed non-C UTF-8 locale (for example `en_US.UTF-8`); its language override is confined to the test subprocess.

1. Run `pnpm translations:update` to regenerate the POT template and merge changes into existing PO files.
2. Create a language catalog, for example `msginit --input=po/luna-taskbar.pot --locale=sv --output-file=po/sv.po`. Use the appropriate locale code for your language.
3. Translate the `msgstr` entries with a PO editor. Complete the catalog headers and plural rule; remove fuzzy flags only after reviewing the translation.
4. Run `pnpm translations:check`, then `pnpm build` and `pnpm run pack`.

Builds compile `po/<locale>.po` into `dist/locale/<locale>/LC_MESSAGES/luna-taskbar.mo`; packages compile and include these language files automatically. Test preferences and the desktop session in the target language. Restart the standalone Desktop process or log out and back in after installing new translations.

Wrap displayed source strings with `_()`. Use `ngettext()` for quantities and `pgettext()` when a word needs context. Use `formatText()` for inserted values, keeping placeholders intact; `%1$s` and `%2$d` permit reordering. Add `// Translators:` comments for ambiguous messages. Module-level data uses the identity marker `N_()` and is translated when displayed, after gettext initializes.

Desktop's built-in widget manifest names, descriptions, and setting labels are extracted into generated `po/widget-strings.js`. Edit the original JSON manifests rather than that file. Widget IDs, settings keys, choice values, application metadata, filenames, and user content must remain unchanged. Third-party widgets own their translation domain.

Commit changed source, POT templates, and PO catalogs. Compiled MO files are build artifacts. See the [GNOME translation guide](https://gjs.guide/extensions/development/translations.html).
