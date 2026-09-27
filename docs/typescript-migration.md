# TypeScript migration boundaries

The taskbar is the first component of Luna. This change keeps its UI behavior and
settings while introducing a buildable, modular TypeScript source tree. It does
not decide whether a future dock or desktop component needs a separate package.

## Ported

- Extension lifecycle entry point with startup cleanup and idempotent disable.
- All taskbar preferences, split into seven page builders and shared controls.
- All 93 non-desktop settings with schema-derived types and bounded spin controls.
- Start/overview launcher and app-button geometry.
- Application/window grouping, icon decoding, badge state, and app animations.
- Auto-hide/fullscreen visibility and adaptive appearance policy.
- Tray controller lifecycle, action selection, menu action resolution, and addresses.
- Panel repaint ownership, native menu positioning, and system icon definitions.
- Build, packaging, compile-time contract tests, and isolated GNOME smoke testing.

Luna - Taskbar is independent of LunaBar: it has its own UUID
`luna-taskbar@wuild`, schema `org.gnome.shell.extensions.luna-taskbar`, settings
path `/org/gnome/shell/extensions/luna-taskbar/`, CSS classes, actor-property
namespace, development session, and ZIP. The 93 setting definitions/defaults are
ported, but stored values are not shared or automatically imported. The schema
contains no desktop keys. No LunaBar files are needed at build or runtime.

The original LunaBar entry points, metadata, and development/package scripts were
restored in its original directory. Both extensions can be installed independently;
only one should manage the GNOME taskbar at a time.

## Remaining JavaScript

`src/compat/runtime.js` still composes Shell actors and connects app-bar events.
The remaining compatibility modules retain the original native integration:
previews, drag/drop, window icons/placement, overview styling, search providers,
ArcMenu/panel reparenting, calendar/media/system internals, and tray protocols.
The small re-export files redirect existing consumers to their typed replacements.

This boundary is deliberately visible: TypeScript checks new modules strictly,
while JavaScript adapters remain unchecked. There are no catch-all `gi://*`
declarations, `@ts-nocheck` modules, or blanket `any` types in the new TypeScript.
Upstream GNOME declarations themselves include dynamic/private APIs; compile-time
checking cannot replace runtime tests when Shell changes.

Next migration slices should extract typed component interfaces from the runtime
composer, then move app-button rendering/interaction, panel composition, and tray
protocol adapters one at a time. Keep constructor/destructor ownership explicit,
avoid implicit properties on native GObjects, and add regression coverage at native
boundaries rather than mirroring each helper's implementation.
