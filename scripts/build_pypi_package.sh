#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_DIR="${ROOT_DIR}/comfyui_frontend_package"
STATIC_DIR="${PACKAGE_DIR}/comfyui_frontend_package/static"
DIST_DIR="${PACKAGE_DIR}/dist"

PACKAGE_NAME="${COMFYUI_FRONTEND_PACKAGE_NAME:-comfyui-frontend-package}"
PACKAGE_VERSION="${COMFYUI_FRONTEND_VERSION:-}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
PYTHON_BUILD_ISOLATION="${PYTHON_BUILD_ISOLATION:-auto}"

if ! command -v node >/dev/null 2>&1; then
  echo "node is required." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required." >&2
  exit 1
fi

if ! command -v "${PYTHON_BIN}" >/dev/null 2>&1; then
  echo "Python executable '${PYTHON_BIN}' was not found." >&2
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "${NODE_MAJOR}" != "24" ]]; then
  echo "Node 24.x is required by this repo. Current version: $(node --version)" >&2
  exit 1
fi

if [[ -z "${PACKAGE_VERSION}" ]]; then
  PACKAGE_VERSION="$(node -p "require('${ROOT_DIR}/package.json').version")"
fi

if ! "${PYTHON_BIN}" -m build --version >/dev/null 2>&1; then
  echo "Installing python build module..."
  "${PYTHON_BIN}" -m pip install build
fi

BUILD_ARGS=()
case "${PYTHON_BUILD_ISOLATION}" in
  auto)
    if ! "${PYTHON_BIN}" -m pip help 2>/dev/null | grep -q -- '--python'; then
      echo "Detected an older pip that does not support '--python'; using --no-isolation for python package build."
      BUILD_ARGS+=(--no-isolation)
    fi
    ;;
  isolated)
    ;;
  no-isolation)
    BUILD_ARGS+=(--no-isolation)
    ;;
  *)
    echo "Unsupported PYTHON_BUILD_ISOLATION value: ${PYTHON_BUILD_ISOLATION}" >&2
    echo "Expected one of: auto, isolated, no-isolation" >&2
    exit 1
    ;;
esac

echo "Installing frontend dependencies..."
pnpm install --frozen-lockfile

echo "Building frontend assets..."
pnpm build

echo "Refreshing Python package static assets..."
rm -rf "${STATIC_DIR}"
mkdir -p "${STATIC_DIR}"
cp -R "${ROOT_DIR}/dist/." "${STATIC_DIR}/"

echo "Building Python package ${PACKAGE_NAME}==${PACKAGE_VERSION}..."
rm -rf "${DIST_DIR}"
(
  cd "${PACKAGE_DIR}"
  COMFYUI_FRONTEND_PACKAGE_NAME="${PACKAGE_NAME}" \
  COMFYUI_FRONTEND_VERSION="${PACKAGE_VERSION}" \
  "${PYTHON_BIN}" -m build "${BUILD_ARGS[@]}"
)

echo "Build completed:"
ls -lah "${DIST_DIR}"
