#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_PATH="${NEXIO_WORKSPACE_ROOT:-$ROOT_DIR}"

usage() {
  cat <<EOF
Uso: ./start-desktop.sh [workspace_path]

Opciones:
  workspace_path   Ruta del directorio del proyecto a abrir en el editor.
  --help           Muestra esta ayuda.

Variables de entorno:
  NEXIO_WORKSPACE_ROOT   Define la carpeta base del workspace.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if [[ $# -gt 1 ]]; then
  echo "Error: demasiados argumentos." >&2
  usage >&2
  exit 1
fi

if [[ $# -eq 1 ]]; then
  WORKSPACE_PATH="$1"
fi

if [[ ! -d "$WORKSPACE_PATH" ]]; then
  echo "Error: la ruta del workspace no existe: $WORKSPACE_PATH" >&2
  exit 1
fi

cd "$ROOT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm no está instalado o no está en PATH." >&2
  exit 1
fi

if [[ ! -f package.json ]]; then
  echo "Error: no se encontró package.json en $ROOT_DIR" >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Instalando dependencias..."
  npm install
fi

export NEXIO_WORKSPACE_ROOT="$WORKSPACE_PATH"

echo "Arrancando Nexio IDE con workspace: $WORKSPACE_PATH"
npm run build

ELECTRON_CMD=()
if command -v npx >/dev/null 2>&1; then
  ELECTRON_CMD=(npx electron . --no-sandbox --disable-gpu --disable-software-rasterizer)
elif command -v electron >/dev/null 2>&1; then
  ELECTRON_CMD=(electron . --no-sandbox --disable-gpu --disable-software-rasterizer)
else
  echo "Error: Electron no está disponible en este entorno." >&2
  exit 1
fi

is_display_usable() {
  [[ -n "${DISPLAY:-}" ]] || return 1
  if command -v xdpyinfo >/dev/null 2>&1; then
    xdpyinfo >/dev/null 2>&1
  else
    return 0
  fi
}

if is_display_usable; then
  echo "Sesión gráfica válida detectada en DISPLAY=$DISPLAY"
  exec "${ELECTRON_CMD[@]}"
fi

if command -v xvfb-run >/dev/null 2>&1; then
  echo "No hay DISPLAY válida disponible; arrancando Electron con xvfb-run."
  exec xvfb-run -a --server-args='-screen 0 1440x900x24' "${ELECTRON_CMD[@]}"
fi

if command -v Xvfb >/dev/null 2>&1; then
  echo "xvfb-run no está disponible; iniciando Xvfb manualmente en :99."
  Xvfb :99 -screen 0 1440x900x24 >/tmp/nexio-xvfb.log 2>&1 &
  export DISPLAY=:99
  exec "${ELECTRON_CMD[@]}"
fi

echo "Error: no hay una sesión gráfica disponible. Instala xvfb o ejecuta la app desde un entorno con DISPLAY." >&2
exit 1
