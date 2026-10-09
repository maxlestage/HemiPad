#!/bin/sh
# Construction du site sur Heroku (appelé par « heroku-postbuild »).
#
# Le buildpack Node n'apporte pas Rust : on installe la chaîne figée par
# web/rust-toolchain.toml, puis on construit comme partout ailleurs. Tout ce
# qui sert à compiler (rustup, cargo, le dossier target, wasm-bindgen) reste
# dans /tmp : seul web/dist rejoint l'application déployée, qui reste légère.
set -eu

export RUSTUP_HOME=/tmp/hemipad-rustup
export CARGO_HOME=/tmp/hemipad-cargo
export CARGO_TARGET_DIR=/tmp/hemipad-target
export HEMIPAD_OUTILS=/tmp/hemipad-outils
export PATH="$CARGO_HOME/bin:$PATH"

if ! command -v rustup > /dev/null 2>&1; then
  echo "• installation de rustup"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --profile minimal --default-toolchain none --no-modify-path
fi

racine="$(cd "$(dirname "$0")/../.." && pwd)"
# Sans argument, rustup installe la version, les composants et la cible
# WebAssembly décrits par rust-toolchain.toml.
(cd "$racine/web" && rustup toolchain install)

cd "$racine"
npm run build
