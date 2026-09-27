# extensions.gnome.org submission review

Reviewed against the [GNOME Shell extension review guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html) on 2026-09-27. These checks prepare a submission; they do not constitute approval.

## Submission package

Use `pnpm run pack`. The archive check verifies metadata and XML schemas, GPL license notices, and absence of native binaries, typelibs, build/test directories and source maps. Metadata declares that activating certain search results writes their supplied text to the clipboard. The service assigns the version.

## Runtime review

- The runtime is constructed inside `enable()`; disabling restores borrowed panel actors and methods, removes actors and signals, cancels search/weather work, and destroys tray, menu, hover and animation controllers.
- Search-provider readiness timers now settle and are removed immediately on cancellation. Native tray dismissal helpers and their polling/timeout sources are tracked and terminated on disable; teardown no longer starts asynchronous dismissal work.
- GTK/GDK/libadwaita stay in preferences. Shell imports use Clutter/St/Shell. The package contains readable JavaScript emitted from TypeScript, with no minification.
- Weather uses Open-Meteo for the city entered by the user. Search uses enabled GNOME search providers; clipboard writes occur on result activation. No telemetry is implemented.

## Python helper: reviewer decision required

`compat/tray/x11.py` is the only Python file in the submission ZIP. It uses Python's standard-library ctypes to call libX11 directly, sends Escape press/release events to one known native tray-menu XID, synchronizes, and closes its display connection. These Xlib operations have no GObject Introspection interface available to GJS. The helper avoids injecting Escape into an unrelated focused window. It uses no third-party Python packages, runs without privileges, and is covered by the package's GPL license. Child execution is bounded and cleaned up by the owner.

Explain this exception to reviewers and request feedback before submission. Approval is not guaranteed; a reviewer may require a different implementation or omission of this compatibility feature. Do not describe the package as already approved.

## Validation and submission notes

Run unit/settings tests and isolated Shell checks for disable/re-enable, tray menus, notification groups and applet placement. Manually exercise native X11/Wine tray menus and lock/unlock on GNOME Shell 50. Optional ArcMenu integration, reparenting other panel applets, and reading Luna Desktop snap-group state need disclosure because they interact with other extensions. No other extension is installed, enabled or reloaded automatically. The maintainer must be able to explain the submitted implementation, including tool-assisted changes.
