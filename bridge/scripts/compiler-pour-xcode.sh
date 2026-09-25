#!/usr/bin/env bash
#
# Compile la bibliothèque Rust pour l'architecture que Xcode demande.
#
# Appelé comme étape de compilation du projet : Xcode fournit PLATFORM_NAME,
# ARCHS et CONFIGURATION, on en déduit la cible Rust, et on dépose l'archive
# là où l'éditeur de liens la cherchera.
#
# Lancé à la main, sans ces variables, il compile pour l'iPhone.
set -euo pipefail

racine="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$racine"

# Xcode ne connaît pas le PATH de la session : rustup s'installe ici.
export PATH="$HOME/.cargo/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

if ! command -v cargo > /dev/null; then
  echo "error: cargo introuvable. Installez Rust : https://rustup.rs" >&2
  exit 1
fi

plateforme="${PLATFORM_NAME:-iphoneos}"
architectures="${ARCHS:-arm64}"
configuration="${CONFIGURATION:-Release}"

# En débogage aussi, la bibliothèque est compilée en « release » : elle ne se
# déboguera pas, et une manette qui traîne n'est pas une manette.
profil=release
dossier_profil=release

cibles=()
for architecture in $architectures; do
  case "$plateforme-$architecture" in
    iphoneos-arm64) cibles+=("aarch64-apple-ios") ;;
    iphonesimulator-arm64) cibles+=("aarch64-apple-ios-sim") ;;
    iphonesimulator-x86_64) cibles+=("x86_64-apple-ios") ;;
    macosx-arm64) cibles+=("aarch64-apple-darwin") ;;
    macosx-x86_64) cibles+=("x86_64-apple-darwin") ;;
    *)
      echo "error: combinaison inconnue : $plateforme / $architecture" >&2
      exit 1
      ;;
  esac
done

sortie="$racine/target/xcode/$configuration-$plateforme"
mkdir -p "$sortie"

archives=()
for cible in "${cibles[@]}"; do
  if ! rustup target list --installed | grep -qx "$cible"; then
    echo "note: installation de la cible Rust $cible"
    rustup target add "$cible"
  fi
  cargo build --"$profil" -p hemipad-wire --target "$cible"
  archives+=("$racine/target/$cible/$dossier_profil/libhemipad_wire.a")
done

if [ "${#archives[@]}" -eq 1 ]; then
  cp "${archives[0]}" "$sortie/libhemipad_wire.a"
else
  # Plusieurs architectures demandées : une seule archive pour toutes.
  lipo -create "${archives[@]}" -output "$sortie/libhemipad_wire.a"
fi

echo "libhemipad_wire.a prête dans $sortie (${cibles[*]})"
