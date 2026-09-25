#!/usr/bin/env bash
#
# Emballe le boîtier déjà compilé pour une carte, prêt à publier :
#
#     ./scripts/empaqueter-boitier.sh <cible Rust> <nom d'architecture> <dossier de sortie>
#     ./scripts/empaqueter-boitier.sh aarch64-unknown-linux-musl arm64 dist
#
# Le paquet contient le programme, les scripts d'installation et les services :
# tout ce que installer-boitier.sh attend, sans rien à compiler sur la carte.
set -euo pipefail

cible="$1"
architecture="$2"
sortie="$3"

racine="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
binaire="$racine/target/$cible/release/hemipad-relay"
[ -x "$binaire" ] || { echo "Programme introuvable : $binaire (compilez d'abord pour $cible)" >&2; exit 1; }

version="$(sed -n 's/^version = "\(.*\)"/\1/p' "$racine/Cargo.toml" | head -1)"
travail="$(mktemp -d)"
trap 'rm -rf "$travail"' EXIT
paquet="$travail/hemipad-boitier"

install -d "$paquet/scripts" "$paquet/systemd"
install -m 755 "$binaire" "$paquet/hemipad-relay"
for script in installer-boitier.sh monter-gadget.sh annoncer-manette-bluetooth.py; do
  install -m 755 "$racine/scripts/$script" "$paquet/scripts/$script"
done
install -m 644 "$racine"/systemd/*.service "$paquet/systemd/"
install -m 644 "$racine/README.md" "$paquet/README.md"
echo "$version ($architecture, $(git -C "$racine" rev-parse --short HEAD 2> /dev/null || echo inconnu))" > "$paquet/VERSION"

mkdir -p "$sortie"
# Archive reproductible : mêmes fichiers, mêmes octets, quel que soit le jour.
tar --sort=name --owner=0 --group=0 --numeric-owner --mtime='2024-01-01 00:00Z' \
  -C "$travail" -czf "$sortie/hemipad-boitier-$architecture.tar.gz" hemipad-boitier
echo "$sortie/hemipad-boitier-$architecture.tar.gz"
