#!/usr/bin/env bash
# Compile un programme C contre la bibliothèque Rust et l'exécute.
#
# C'est le seul contrôle qui attrape un désaccord entre hemipad_wire.h et le
# code Rust : Swift passe par cet en-tête, et un écart s'y verrait autrement
# seulement à l'exécution, sur l'appareil.
set -euo pipefail

racine="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$racine"

cargo build --release -p hemipad-wire
sortie="$(mktemp -d)"
trap 'rm -rf "$sortie"' EXIT

cc -std=c11 -Wall -Wextra -Werror \
  -I wire/include \
  wire/tests/abi.c \
  target/release/libhemipad_wire.a \
  -lpthread -ldl -lm \
  -o "$sortie/abi"

"$sortie/abi"
