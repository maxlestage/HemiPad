#!/usr/bin/env bash
#
# Monte le gadget USB : c'est ce qui fait apparaître une manette sur le port.
#
# Lancé par le service au démarrage, avant hemipad-relay. Sans rien monter, il
# n'existe pas de /dev/hidg0 où écrire.
set -euo pipefail

gadget=/sys/kernel/config/usb_gadget/hemipad

if [ -d "$gadget" ]; then
  echo "gadget déjà monté"
  exit 0
fi

modprobe libcomposite
mountpoint -q /sys/kernel/config || mount -t configfs none /sys/kernel/config

mkdir -p "$gadget"
cd "$gadget"

# Identité annoncée à la console. L'identifiant est celui, générique, des
# montages composites Linux : HemiPad ne se fait passer pour la manette de
# personne, il s'annonce sous son propre nom.
echo 0x1d6b > idVendor          # Linux Foundation
echo 0x0104 > idProduct         # Multifunction Composite Gadget
echo 0x0100 > bcdDevice         # version 1.0.0 du boîtier
echo 0x0200 > bcdUSB            # USB 2.0

mkdir -p strings/0x409
echo "HemiPad" > strings/0x409/manufacturer
echo "HemiPad" > strings/0x409/product
# Numéro de série stable, tiré de celui de la carte.
serie="$(tr -dc 'A-Za-z0-9' < /proc/cpuinfo | tail -c 12 || true)"
echo "${serie:-HEMIPAD000001}" > strings/0x409/serialnumber

mkdir -p configs/c.1/strings/0x409
echo "Manette HemiPad" > configs/c.1/strings/0x409/configuration
echo 250 > configs/c.1/MaxPower

mkdir -p functions/hid.usb0
echo 0 > functions/hid.usb0/protocol     # ni clavier ni souris « boot »
echo 0 > functions/hid.usb0/subclass
# Le plus long rapport : 1 octet d'identifiant + 9 de manette.
echo 10 > functions/hid.usb0/report_length
# Le descripteur vient du programme lui-même : une seule copie dans le projet.
hemipad-relay --descripteur | xxd -r -p > functions/hid.usb0/report_desc

ln -s functions/hid.usb0 configs/c.1/

# Accrocher le gadget au contrôleur USB de la carte.
controleur="$(find /sys/class/udc -mindepth 1 -maxdepth 1 -printf '%f\n' | head -1)"
if [ -z "$controleur" ]; then
  echo "aucun contrôleur USB : le mode gadget n'est pas actif (dtoverlay=dwc2 ?)" >&2
  exit 1
fi
echo "$controleur" > UDC

echo "gadget monté sur $controleur, /dev/hidg0 prêt"
