#!/usr/bin/env python3
"""Annonce le boîtier comme une manette Bluetooth.

Ouvrir les canaux L2CAP ne suffit pas : une console ne s'y connecte que si le
boîtier s'annonce comme une manette. Cette annonce — le profil HID, décrit par
un enregistrement SDP — passe par BlueZ, sur D-Bus.

Ce que fait ce script :

1. il rend l'adaptateur visible et appairable ;
2. il lui donne la classe d'appareil « manette de jeu », celle que les
   consoles cherchent ;
3. il enregistre le profil HID (UUID 0x1124) avec le descripteur de rapport de
   HemiPad, celui-là même que le boîtier utilise sur le port USB.

Le programme `hemipad-relay` fait le reste : il écoute les deux canaux et
envoie les rapports.

Lancé au démarrage par hemipad-bluetooth.service. À la main :

    sudo python3 annoncer-manette-bluetooth.py
"""

from __future__ import annotations

import subprocess
import sys
import xml.sax.saxutils

# Classe d'appareil : ordinateur/périphérique (0x05) + manette (0x08).
# C'est ce que lit une console quand elle cherche une manette à appairer.
CLASSE_MANETTE = "0x002508"

# Le profil HID, tel que BlueZ le connaît.
UUID_HID = "00001124-0000-1000-8000-00805f9b34fb"
CHEMIN_PROFIL = "/org/bluez/hemipad"


def descripteur() -> bytes:
    """Le descripteur de rapport, demandé au programme lui-même.

    Une seule copie dans le projet : celle du code Rust, déjà comparée au
    Swift à chaque intégration continue.
    """
    for binaire in ("/usr/local/bin/hemipad-relay", "hemipad-relay"):
        try:
            sortie = subprocess.run(
                [binaire, "--descripteur"],
                capture_output=True,
                text=True,
                check=True,
            ).stdout.strip()
            return bytes.fromhex(sortie)
        except (FileNotFoundError, subprocess.CalledProcessError):
            continue
    raise SystemExit(
        "hemipad-relay introuvable : lancez d'abord installer-boitier.sh"
    )


def enregistrement_sdp(rapport: bytes) -> str:
    """L'enregistrement SDP du profil HID, avec notre descripteur dedans."""
    hexa = rapport.hex()
    return f"""<?xml version="1.0" encoding="UTF-8" ?>
<record>
  <attribute id="0x0001">
    <sequence><uuid value="0x1124" /></sequence>
  </attribute>
  <attribute id="0x0004">
    <sequence>
      <sequence><uuid value="0x0100" /><uint16 value="0x0011" /></sequence>
      <sequence><uuid value="0x0011" /></sequence>
    </sequence>
  </attribute>
  <attribute id="0x0005">
    <sequence><uuid value="0x1002" /></sequence>
  </attribute>
  <attribute id="0x0006">
    <sequence>
      <uint16 value="0x656e" /><uint16 value="0x006a" /><uint16 value="0x0100" />
    </sequence>
  </attribute>
  <attribute id="0x0009">
    <sequence>
      <sequence><uuid value="0x1124" /><uint16 value="0x0100" /></sequence>
    </sequence>
  </attribute>
  <attribute id="0x000d">
    <sequence>
      <sequence>
        <sequence>
          <sequence><uuid value="0x0100" /><uint16 value="0x0013" /></sequence>
          <sequence><uuid value="0x0011" /></sequence>
        </sequence>
      </sequence>
    </sequence>
  </attribute>
  <attribute id="0x0100"><text value={xml.sax.saxutils.quoteattr("HemiPad")} /></attribute>
  <attribute id="0x0101"><text value={xml.sax.saxutils.quoteattr("Manette accessible HemiPad")} /></attribute>
  <attribute id="0x0102"><text value={xml.sax.saxutils.quoteattr("HemiPad")} /></attribute>
  <!-- 0x0205 : la manette peut réveiller la console. -->
  <attribute id="0x0205"><boolean value="true" /></attribute>
  <!-- 0x0206 : la liste des descripteurs. 0x22 = descripteur de rapport. -->
  <attribute id="0x0206">
    <sequence>
      <sequence>
        <uint8 value="0x22" />
        <text encoding="hex" value="{hexa}" />
      </sequence>
    </sequence>
  </attribute>
  <!-- 0x0207 : langue de l'interface. -->
  <attribute id="0x0207">
    <sequence>
      <sequence><uint16 value="0x0409" /><uint16 value="0x0100" /></sequence>
    </sequence>
  </attribute>
  <attribute id="0x020b"><uint16 value="0x0100" /></attribute>
  <!-- 0x020d : la connexion doit être chiffrée. -->
  <attribute id="0x020d"><boolean value="true" /></attribute>
  <attribute id="0x020e"><boolean value="false" /></attribute>
  <attribute id="0x0209"><boolean value="true" /></attribute>
  <attribute id="0x020c"><uint16 value="0x0c80" /></attribute>
  <attribute id="0x0214"><uint16 value="0x0640" /></attribute>
  <attribute id="0x0215"><uint16 value="0x0320" /></attribute>
</record>
"""


def regler_adaptateur() -> None:
    """Nom, classe et visibilité de l'adaptateur."""
    commandes = [
        ["hciconfig", "hci0", "up"],
        ["hciconfig", "hci0", "name", "HemiPad"],
        ["hciconfig", "hci0", "class", CLASSE_MANETTE],
        ["hciconfig", "hci0", "piscan"],
    ]
    for commande in commandes:
        resultat = subprocess.run(commande, capture_output=True, text=True)
        if resultat.returncode != 0:
            print(
                f"  {' '.join(commande)} a échoué : {resultat.stderr.strip()}",
                file=sys.stderr,
            )


def enregistrer_profil(xml_sdp: str) -> None:
    """Déclare le profil HID à BlueZ."""
    try:
        import dbus  # type: ignore
    except ImportError:
        raise SystemExit(
            "le paquet python3-dbus manque : sudo apt install python3-dbus"
        )

    bus = dbus.SystemBus()
    gestionnaire = dbus.Interface(
        bus.get_object("org.bluez", "/org/bluez"), "org.bluez.ProfileManager1"
    )
    options = {
        "ServiceRecord": xml_sdp,
        "Role": "server",
        "RequireAuthentication": dbus.Boolean(True),
        "RequireAuthorization": dbus.Boolean(False),
        "AutoConnect": dbus.Boolean(True),
        "Name": "HemiPad",
    }
    try:
        gestionnaire.RegisterProfile(CHEMIN_PROFIL, UUID_HID, options)
    except dbus.exceptions.DBusException as erreur:
        if "AlreadyExists" in str(erreur):
            print("  profil déjà enregistré")
            return
        raise


def main() -> int:
    print("Annonce de la manette HemiPad")
    rapport = descripteur()
    print(f"  descripteur : {len(rapport)} octets")
    regler_adaptateur()
    print("  adaptateur réglé en manette, visible et appairable")
    enregistrer_profil(enregistrement_sdp(rapport))
    print("  profil HID enregistré auprès de BlueZ")
    print()
    print("La console peut maintenant chercher une manette : elle verra « HemiPad ».")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
