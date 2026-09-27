#!/usr/bin/env bash
set -euo pipefail
project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
test_dir=$(mktemp -d /tmp/luna-taskbar-shell.XXXXXX)
# A portal may leave a FUSE mount briefly while its private bus shuts down.
# Never traverse that mount, and do not turn a successful test into a cleanup failure.
trap 'rm -rf --one-file-system "$test_dir" 2>/dev/null || printf "Temporary portal mount remains at %s\n" "$test_dir" >&2' EXIT
mkdir -p "$test_dir"/{config,cache,data/gnome-shell/extensions,runtime}
chmod 700 "$test_dir/runtime"
ln -s "$project_dir/dist" "$test_dir/data/gnome-shell/extensions/luna-taskbar@wuild"
export XDG_CONFIG_HOME="$test_dir/config" XDG_CACHE_HOME="$test_dir/cache"
export XDG_DATA_HOME="$test_dir/data" XDG_RUNTIME_DIR="$test_dir/runtime"
export GSETTINGS_BACKEND=keyfile GIO_USE_VFS=local GTK_A11Y=none
export LUNA_TEST_ROOT="$project_dir"
export LUNA_SHELL_SCRIPT="${1:-$project_dir/tests/taskbar-shell-smoke.js}"
export LUNA_TEST_EXTENSIONS="['luna-taskbar@wuild']"
if [[ ${LUNA_TEST_ARCMENU:-0} == 1 ]]; then
    arc_path=${LUNA_ARCMENU_PATH:-$HOME/.local/share/gnome-shell/extensions/arcmenu@arcmenu.com}
    test -f "$arc_path/metadata.json"
    ln -s "$arc_path" "$test_dir/data/gnome-shell/extensions/arcmenu@arcmenu.com"
    export LUNA_TEST_EXTENSIONS="['luna-taskbar@wuild', 'arcmenu@arcmenu.com']"
fi
dbus-run-session -- bash -c '
    gsettings set org.gnome.shell enabled-extensions "$LUNA_TEST_EXTENSIONS"
    gsettings set org.gnome.shell disable-user-extensions false
    gsettings set org.gnome.shell welcome-dialog-last-shown-version "50.4"
    monitor_args=()
    for monitor in ${LUNA_TEST_MONITORS:-1280x800}; do
        monitor_args+=(--virtual-monitor "$monitor")
    done
    timeout 75s gnome-shell --headless --wayland --no-x11 "${monitor_args[@]}" \
        --automation-script "$LUNA_SHELL_SCRIPT"
'
