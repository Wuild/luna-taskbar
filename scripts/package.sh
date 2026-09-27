#!/usr/bin/env bash
set -euo pipefail
project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
out_dir=${1:-/tmp/luna-taskbar-build}
mkdir -p "$out_dir"
out_dir=$(cd "$out_dir" && pwd)
cd "$project_dir"
pnpm build
cd dist
gnome-extensions pack --extra-source=LICENSE --extra-source=LICENSE-NOTICE --force --out-dir "$out_dir" \
    --extra-source=appbar --extra-source=compat --extra-source=core \
    --extra-source=panels --extra-source=preferences --extra-source=settings \
    --extra-source=start-menu --extra-source=systray --extra-source=taskbar .

if [[ ${LUNA_PACKAGE_NATIVE:-0} != 1 ]]; then
    python3 ../scripts/check-package.py "$out_dir/luna-taskbar@wuild.shell-extension.zip"
fi
