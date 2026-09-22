#!/usr/bin/env python3
"""Pont HemiPad : reçoit les rapports HID de l'iPhone et les rejoue en USB.

Ce script est l'implémentation de référence du protocole décrit dans
`NetworkBridgeTransport.swift`. Il tourne sur n'importe quelle machine Linux
capable de se présenter comme périphérique USB (Raspberry Pi Zero, Pi 4 en mode
OTG, carte équivalente), et transforme l'iPhone en manette et clavier pour la
console ou l'ordinateur branché en face.

Pourquoi un pont ? iOS réserve une partie du profil HID over GATT : selon la
version du système, l'iPhone ne peut pas toujours s'annoncer lui-même comme
manette. Le pont contourne la question sans changer une ligne de l'application :
ce sont exactement les mêmes octets, sur un autre tuyau.

Trame reçue (binaire, une par rapport) :

    octet 0      : 0x48, en-tête
    octet 1      : identifiant de rapport (1 = manette, 2 = clavier)
    octet 2      : longueur de la charge utile
    octets 3...n : charge utile HID brute

Mise en place du périphérique USB (à faire une fois sur le Pi) :
    sudo modprobe libcomposite
    # puis configurer un gadget HID exposant /dev/hidg0 avec le descripteur
    # imprimé par : python3 hemipad_bridge.py --descripteur

Dépendance : `pip install websockets`
"""

from __future__ import annotations

import argparse
import asyncio
import sys

HEADER = 0x48
REPORT_GAMEPAD = 1
REPORT_KEYBOARD = 2

# Descripteur identique à HIDReportDescriptors.combined côté Swift : manette
# (identifiant 1) puis clavier (identifiant 2), dans le même périphérique.
GAMEPAD_DESCRIPTOR = bytes([
    0x05, 0x01, 0x09, 0x05, 0xA1, 0x01, 0x85, 0x01, 0xA1, 0x00,
    0x09, 0x30, 0x09, 0x31, 0x09, 0x32, 0x09, 0x35,
    0x15, 0x00, 0x26, 0xFF, 0x00, 0x75, 0x08, 0x95, 0x04, 0x81, 0x02, 0xC0,
    0x05, 0x02, 0x09, 0xC5, 0x09, 0xC4,
    0x15, 0x00, 0x26, 0xFF, 0x00, 0x75, 0x08, 0x95, 0x02, 0x81, 0x02,
    0x05, 0x01, 0x09, 0x39, 0x15, 0x00, 0x25, 0x07,
    0x35, 0x00, 0x46, 0x3B, 0x01, 0x65, 0x14, 0x75, 0x04, 0x95, 0x01, 0x81, 0x42,
    0x65, 0x00, 0x75, 0x04, 0x95, 0x01, 0x81, 0x03,
    0x05, 0x09, 0x19, 0x01, 0x29, 0x10, 0x15, 0x00, 0x25, 0x01,
    0x75, 0x01, 0x95, 0x10, 0x81, 0x02, 0xC0,
])

KEYBOARD_DESCRIPTOR = bytes([
    0x05, 0x01, 0x09, 0x06, 0xA1, 0x01, 0x85, 0x02,
    0x05, 0x07, 0x19, 0xE0, 0x29, 0xE7, 0x15, 0x00, 0x25, 0x01,
    0x75, 0x01, 0x95, 0x08, 0x81, 0x02,
    0x95, 0x01, 0x75, 0x08, 0x81, 0x03,
    0x95, 0x05, 0x75, 0x01, 0x05, 0x08, 0x19, 0x01, 0x29, 0x05, 0x91, 0x02,
    0x95, 0x01, 0x75, 0x03, 0x91, 0x03,
    0x95, 0x06, 0x75, 0x08, 0x15, 0x00, 0x25, 0x65,
    0x05, 0x07, 0x19, 0x00, 0x29, 0x65, 0x81, 0x00, 0xC0,
])

PAYLOAD_LENGTHS = {REPORT_GAMEPAD: 9, REPORT_KEYBOARD: 8}


def decode(frame: bytes) -> tuple[int, bytes] | None:
    """Décode une trame. Renvoie `None` si elle est malformée.

    Une trame incohérente est ignorée plutôt que rejouée : envoyer un rapport
    douteux à une console, c'est risquer un bouton bloqué en plein jeu.
    """
    if len(frame) < 3 or frame[0] != HEADER:
        return None
    report_id = frame[1]
    length = frame[2]
    payload = frame[3:3 + length]
    if len(payload) != length:
        return None
    expected = PAYLOAD_LENGTHS.get(report_id)
    if expected is None or length != expected:
        return None
    return report_id, payload


class HIDGadget:
    """Écrit les rapports sur le périphérique HID exposé par le noyau."""

    def __init__(self, path: str, dry_run: bool = False):
        self.path = path
        self.dry_run = dry_run
        self.handle = None

    def open(self) -> None:
        if self.dry_run:
            print(f"[essai à blanc] aucun écriture réelle sur {self.path}")
            return
        self.handle = open(self.path, "rb+", buffering=0)

    def write(self, report_id: int, payload: bytes) -> None:
        frame = bytes([report_id]) + payload
        if self.dry_run or self.handle is None:
            print(f"rapport {report_id}: {frame.hex(' ')}")
            return
        try:
            self.handle.write(frame)
        except OSError as error:
            # L'hôte s'est endormi ou débranché : on n'arrête pas le pont, la
            # console peut revenir sans que la personne touche à quoi que ce soit.
            print(f"écriture impossible ({error}), rapport ignoré", file=sys.stderr)

    def release_all(self) -> None:
        """Relâche tout : indispensable quand l'iPhone se déconnecte."""
        self.write(REPORT_GAMEPAD, bytes([128, 128, 128, 128, 0, 0, 8, 0, 0]))
        self.write(REPORT_KEYBOARD, bytes(8))

    def close(self) -> None:
        if self.handle is not None:
            self.release_all()
            self.handle.close()
            self.handle = None


async def serve(host: str, port: int, gadget: HIDGadget) -> None:
    try:
        import websockets
    except ImportError:  # pragma: no cover - dépend de l'environnement
        print("installez la dépendance : pip install websockets", file=sys.stderr)
        raise SystemExit(1)

    async def handler(connection):
        print("iPhone connecté")
        # L'application attend « ready » avant d'émettre : c'est ce message qui
        # lui dit que le gadget USB est bien énuméré côté console.
        await connection.send("ready")
        try:
            async for message in connection:
                if isinstance(message, str):
                    continue
                decoded = decode(message)
                if decoded is None:
                    continue
                gadget.write(*decoded)
        finally:
            print("iPhone déconnecté, relâchement de toutes les commandes")
            gadget.release_all()

    async with websockets.serve(handler, host, port):
        print(f"pont HemiPad à l'écoute sur ws://{host}:{port}")
        await asyncio.Future()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--device", default="/dev/hidg0", help="périphérique HID du noyau")
    parser.add_argument(
        "--essai-a-blanc",
        action="store_true",
        help="affiche les rapports au lieu de les écrire (mise au point)",
    )
    parser.add_argument(
        "--descripteur",
        action="store_true",
        help="imprime le descripteur HID à donner au gadget USB, puis quitte",
    )
    arguments = parser.parse_args()

    if arguments.descripteur:
        sys.stdout.buffer.write(GAMEPAD_DESCRIPTOR + KEYBOARD_DESCRIPTOR)
        return 0

    gadget = HIDGadget(arguments.device, dry_run=arguments.essai_a_blanc)
    gadget.open()
    try:
        asyncio.run(serve(arguments.host, arguments.port, gadget))
    except KeyboardInterrupt:
        print("\narrêt demandé")
    finally:
        gadget.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
