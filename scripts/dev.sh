#!/usr/bin/env bash
set -euo pipefail
project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
if [[ ${1:-} == '--session' ]]; then
    python3 - <<'PY'
import json, os
keys = ['DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR', 'XDG_DATA_HOME',
        'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'GSETTINGS_BACKEND', 'GSETTINGS_SCHEMA_DIR']
with open(os.path.join(os.environ['LUNA_TASKBAR_DEV_DIR'], 'environment.json'), 'w') as f:
    json.dump({key: os.environ[key] for key in keys if key in os.environ}, f)
PY
    python3 - <<'PYWALL'
import json, os, subprocess
with open(os.path.join(os.environ['LUNA_TASKBAR_DEV_DIR'], 'wallpaper.json')) as f:
    values = json.load(f)
for key, value in values.items():
    subprocess.run(['gsettings', 'set', 'org.gnome.desktop.background', key, value], check=True)
PYWALL
    pipewire >"$LUNA_TASKBAR_DEV_DIR/pipewire.log" 2>&1 &
    pipewire_pid=$!
    trap 'kill "$pipewire_pid" 2>/dev/null || true' EXIT INT TERM
    for ((attempt=0; attempt<50; attempt++)); do
        [[ -S "$XDG_RUNTIME_DIR/pipewire-0" ]] && break
        kill -0 "$pipewire_pid" 2>/dev/null || exit 1
        sleep 0.1
    done
    wireplumber --profile=policy >"$LUNA_TASKBAR_DEV_DIR/wireplumber.log" 2>&1 &
    policy_pid=$!
    trap 'kill "$policy_pid" "$pipewire_pid" 2>/dev/null || true' EXIT INT TERM
    gsettings set org.gnome.shell enabled-extensions "['luna-taskbar@wuild']"
    gsettings set org.gnome.shell disable-user-extensions false
    gsettings set org.gnome.shell disable-extension-version-validation false
    gsettings set org.gnome.desktop.session idle-delay 0
    gsettings set org.gnome.desktop.screensaver lock-enabled false
    gsettings set org.gnome.shell welcome-dialog-last-shown-version '50.4'
    if [[ -x /usr/libexec/mutter-devkit ]]; then
        gnome-shell --devkit --wayland --wayland-display luna-taskbar-dev
        exit
    fi
    gnome-shell --devkit --wayland --wayland-display luna-taskbar-dev &
    shell_pid=$!
    trap 'kill "$shell_pid" "$policy_pid" "$pipewire_pid" 2>/dev/null || true' EXIT INT TERM
    for ((attempt=0; attempt<100; attempt++)); do
        if gdbus introspect --session --dest org.gnome.Mutter.Devkit \
            --object-path /org/gnome/Mutter/Devkit >/dev/null 2>&1; then
            break
        fi
        kill -0 "$shell_pid" 2>/dev/null || exit 1
        sleep 0.1
    done
    set +e
    GSK_RENDERER=cairo "$LUNA_TASKBAR_DEVKIT"
    viewer_status=$?
    set -e
    printf 'Luna - Taskbar devkit viewer exited with status %s\n' "$viewer_status"
    exit
fi
(cd "$project_dir" && pnpm build)
command -v gnome-shell >/dev/null
command -v dbus-run-session >/dev/null
command -v pipewire >/dev/null
command -v wireplumber >/dev/null
outer_wayland=${WAYLAND_DISPLAY:-wayland-0}
if [[ $outer_wayland != /* ]]; then
    outer_wayland="${XDG_RUNTIME_DIR:?No desktop runtime directory}/$outer_wayland"
fi
# Persist the private development profile across launches. Import the previous
# temporary profile once so existing development preferences are not lost.
dev_config="$project_dir/.dev-config"
if [[ ! -d "$dev_config" ]]; then
    mkdir -p "$dev_config"
    if [[ -f "$project_dir/.dev-session" ]]; then
        previous_dev_dir=$(cat "$project_dir/.dev-session")
        if [[ $previous_dev_dir == /tmp/luna-taskbar-dev.* && -d "$previous_dev_dir/config" ]]; then
            cp -a "$previous_dev_dir/config/." "$dev_config/"
        fi
    fi
fi
dev_dir=$(mktemp -d /tmp/luna-taskbar-dev.XXXXXX)
printf '%s\n' "$dev_dir" > "$project_dir/.dev-session"
mkdir -p "$dev_dir"/{config,cache,data/gnome-shell/extensions,runtime}
chmod 700 "$dev_dir/runtime"
ln -s "$project_dir/dist" "$dev_dir/data/gnome-shell/extensions/luna-taskbar@wuild"
# Snapshot wallpaper preferences before switching to isolated settings.
python3 - "$dev_dir/wallpaper.json" <<'PYWALL'
import json, subprocess, sys
keys = ['picture-uri', 'picture-uri-dark', 'picture-options',
        'primary-color', 'secondary-color', 'color-shading-type']
values = {key: subprocess.check_output(
    ['gsettings', 'get', 'org.gnome.desktop.background', key], text=True).strip()
    for key in keys}
with open(sys.argv[1], 'w') as f:
    json.dump(values, f)
PYWALL
export XDG_CONFIG_HOME="$dev_config"
export XDG_CACHE_HOME="$dev_dir/cache"
export XDG_DATA_HOME="$dev_dir/data"
export XDG_RUNTIME_DIR="$dev_dir/runtime"
export GSETTINGS_BACKEND=keyfile
export WAYLAND_DISPLAY="$outer_wayland"
if [[ ! -x /usr/libexec/mutter-devkit ]]; then
    export LUNA_TASKBAR_DEVKIT=${LUNA_TASKBAR_DEVKIT:-/tmp/luna-taskbar-devkit/usr/libexec/mutter-devkit}
    if [[ ! -x $LUNA_TASKBAR_DEVKIT ]]; then
        printf 'Install the mutter-devkit package, then rerun this script.\n' >&2
        exit 1
    fi
    export GSETTINGS_SCHEMA_DIR="$(dirname "$LUNA_TASKBAR_DEVKIT")/../share/glib-2.0/schemas"
fi
export SHELL_DEBUG=backtrace-warnings
export GTK_A11Y=none
export LUNA_TASKBAR_DEV_DIR="$dev_dir"
printf 'Luna - Taskbar dev session: %s\nClose the devkit window to exit.\nLogs: %s/shell.log\n' "$dev_dir" "$dev_dir"
# Never update the real session's D-Bus/systemd activation environment.
dbus-run-session -- bash "$project_dir/scripts/dev.sh" --session 2>&1 | tee "$dev_dir/shell.log"
