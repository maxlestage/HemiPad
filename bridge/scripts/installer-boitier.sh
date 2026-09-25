#!/usr/bin/env bash
#
# Prépare le boîtier : mode gadget USB, secret partagé, service au démarrage.
#
# À lancer une seule fois, sur la carte (Raspberry Pi Zero 2 W ou équivalent),
# en root :
#
#     sudo ./installer-boitier.sh
#     sudo reboot
#
# Après le redémarrage, la carte branchée au port USB de la console s'y
# présente comme une manette. Elle n'usurpe l'identité de personne : elle
# s'annonce sous le nom « HemiPad », avec l'identifiant générique des montages
# Linux composites.
set -euo pipefail

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "À lancer en root : sudo $0" >&2
  exit 1
fi

racine="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
binaire=/usr/local/bin/hemipad-relay
dossier_secret=/etc/hemipad
fichier_secret="$dossier_secret/cle"
gadget=/sys/kernel/config/usb_gadget/hemipad

echo "== 1. Le programme"
if [ -x "$racine/hemipad-relay" ]; then
  # Paquet publié, déjà compilé pour la carte : rien à compiler ici.
  install -m 755 "$racine/hemipad-relay" "$binaire"
elif [ -x "$racine/target/release/hemipad-relay" ]; then
  install -m 755 "$racine/target/release/hemipad-relay" "$binaire"
elif command -v cargo > /dev/null; then
  (cd "$racine" && cargo build --release -p hemipad-relay)
  install -m 755 "$racine/target/release/hemipad-relay" "$binaire"
else
  echo "Ni binaire compilé ni cargo : compilez d'abord avec « cargo build --release »." >&2
  exit 1
fi
echo "   installé dans $binaire"

echo "== 2. Le secret partagé"
install -d -m 700 "$dossier_secret"
if [ -s "$fichier_secret" ]; then
  echo "   déjà en place, laissé tel quel"
else
  # 32 octets tirés du générateur du noyau.
  od -An -tx1 -N32 /dev/urandom | tr -d ' \n' > "$fichier_secret"
  chmod 600 "$fichier_secret"
  echo "   créé"
fi
echo
echo "   Secret à saisir dans HemiPad, sur le téléphone :"
echo
echo "     $(cat "$fichier_secret")"
echo

echo "== 3. Le mode gadget USB"
# Sans ces deux lignes, le port USB de la carte ne sait qu'être un hôte : il
# ne peut pas se présenter comme une manette.
config=/boot/firmware/config.txt
[ -f "$config" ] || config=/boot/config.txt
cmdline=/boot/firmware/cmdline.txt
[ -f "$cmdline" ] || cmdline=/boot/cmdline.txt

if ! grep -q '^dtoverlay=dwc2' "$config"; then
  printf '\n# HemiPad : le port USB doit pouvoir être un périphérique.\ndtoverlay=dwc2\n' >> "$config"
  echo "   dtoverlay=dwc2 ajouté à $config"
fi
if ! grep -q 'modules-load=dwc2' "$cmdline"; then
  sed -i 's/rootwait/rootwait modules-load=dwc2/' "$cmdline"
  echo "   modules-load=dwc2 ajouté à $cmdline"
fi
grep -qx 'libcomposite' /etc/modules 2> /dev/null || echo libcomposite >> /etc/modules

echo "== 4. Le Bluetooth"
# Le greffon « input » de BlueZ veut tenir le rôle HID : tant qu'il le tient,
# le boîtier ne peut pas se présenter comme une manette.
reglage=/etc/systemd/system/bluetooth.service.d/hemipad.conf
install -d -m 755 "$(dirname "$reglage")"
cat > "$reglage" <<'REGLAGE'
# HemiPad tient lui-même le rôle de manette : le greffon « input » de BlueZ
# doit lui laisser la place.
[Service]
ExecStart=
ExecStart=/usr/libexec/bluetooth/bluetoothd -P input
REGLAGE
if [ ! -x /usr/libexec/bluetooth/bluetoothd ] && [ -x /usr/lib/bluetooth/bluetoothd ]; then
  sed -i 's|/usr/libexec/bluetooth/bluetoothd|/usr/lib/bluetooth/bluetoothd|' "$reglage"
fi
echo "   greffon « input » de BlueZ désactivé"

if ! python3 -c 'import dbus' 2> /dev/null; then
  echo "   installation de python3-dbus"
  apt-get update -qq && apt-get install -y -qq python3-dbus
fi
install -m 755 "$racine/scripts/annoncer-manette-bluetooth.py" /usr/local/bin/hemipad-annoncer-bluetooth
echo "   annonce installée"

echo "== 5. Le service"
install -m 755 "$racine/scripts/monter-gadget.sh" /usr/local/bin/hemipad-monter-gadget
for unite in hemipad-gadget hemipad-bluetooth hemipad-relay; do
  install -m 644 "$racine/systemd/$unite.service" "/etc/systemd/system/$unite.service"
done
systemctl daemon-reload
systemctl enable hemipad-gadget.service hemipad-bluetooth.service hemipad-relay.service > /dev/null
echo "   les trois services sont activés au démarrage"

echo
echo "Terminé. Redémarrez la carte : sudo reboot"
echo
echo "Ensuite, deux façons de jouer, au choix, sans rien régler :"
echo "  · sans fil : cherchez une manette depuis la console, elle verra « HemiPad » ;"
echo "  · par câble : branchez la carte au port USB de la console."
echo
echo "Le gadget se monte dans $gadget au démarrage."
