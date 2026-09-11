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

if command -v npx >/dev/null 2>&1; then
  exec npx electron .
fi

if command -v electron >/dev/null 2>&1; then
  exec electron .
fi

echo "Error: Electron no está disponible en este entorno." >&2
exit 1
