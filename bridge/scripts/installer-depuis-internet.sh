#!/usr/bin/env bash
#
# Installe le boîtier HemiPad sans rien compiler, en une commande :
#
#     curl -fsSL https://raw.githubusercontent.com/maxlestage/HemiPad/master/bridge/scripts/installer-depuis-internet.sh | sudo bash
#
# Ou, pour lire le script avant de le lancer (recommandé) :
#
#     curl -fsSLO https://raw.githubusercontent.com/maxlestage/HemiPad/master/bridge/scripts/installer-depuis-internet.sh
#     less installer-depuis-internet.sh
#     sudo bash installer-depuis-internet.sh
#
# Ce qu'il fait : il reconnaît la carte (64 ou 32 bits), télécharge le paquet
# déjà compilé depuis la dernière publication du dépôt, en vérifie l'empreinte
# SHA-256, puis lance l'installation habituelle (installer-boitier.sh).
#
# Le programme publié est compilé en statique : il ne dépend d'aucune version
# particulière du système de la carte.
set -euo pipefail

# Tout le script est dans une fonction, appelée à la dernière ligne : lu par
# « curl … | bash », il est ainsi reçu en entier avant que la moindre commande
# ne s'exécute. Une coupure réseau en plein téléchargement ne laisse pas une
# moitié de script tourner.
installer() {
  if [ "${EUID:-$(id -u)}" -ne 0 ]; then
    echo "À lancer en root : curl … | sudo bash" >&2
    exit 1
  fi

  depot="${HEMIPAD_DEPOT:-maxlestage/HemiPad}"
  version="${HEMIPAD_VERSION:-latest}"

  case "$(uname -m)" in
    aarch64 | arm64) architecture=arm64 ;;
    armv7l | armv8l) architecture=armv7 ;;
    armv6l)
      echo "Cette carte (ARMv6 : Raspberry Pi Zero ou Zero W de première génération) n'est pas prise en charge." >&2
      echo "Prenez un Raspberry Pi Zero 2 W : c'est le plus petit qui convient." >&2
      exit 1
      ;;
    *)
      echo "Architecture $(uname -m) non prise en charge : le boîtier est prévu pour un Raspberry Pi." >&2
      exit 1
      ;;
  esac

  if [ "$version" = latest ]; then
    base="https://github.com/$depot/releases/latest/download"
  else
    base="https://github.com/$depot/releases/download/$version"
  fi
  paquet="hemipad-boitier-$architecture.tar.gz"

  travail="$(mktemp -d)"
  trap 'rm -rf "$travail"' EXIT

  echo "== Téléchargement du boîtier pour $architecture"
  curl -fsSL --proto '=https' --tlsv1.2 -o "$travail/$paquet" "$base/$paquet"
  curl -fsSL --proto '=https' --tlsv1.2 -o "$travail/SHA256SUMS" "$base/SHA256SUMS"

  echo "== Vérification de l'empreinte"
  # Un paquet abîmé ou remplacé en route est refusé avant d'être ouvert.
  (cd "$travail" && grep " $paquet\$" SHA256SUMS | sha256sum -c -)

  tar -xzf "$travail/$paquet" -C "$travail"
  echo "   version : $(cat "$travail/hemipad-boitier/VERSION")"

  "$travail/hemipad-boitier/scripts/installer-boitier.sh" < /dev/null
}

installer "$@"
