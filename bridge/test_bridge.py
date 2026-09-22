#!/usr/bin/env python3
"""Tests du décodage de trames du pont : python3 bridge/test_bridge.py"""

import unittest

from hemipad_bridge import HEADER, REPORT_GAMEPAD, REPORT_KEYBOARD, decode


class DecodeTests(unittest.TestCase):
    def test_trame_manette_valide(self):
        payload = bytes([128, 128, 128, 128, 0, 0, 8, 1, 0])
        frame = bytes([HEADER, REPORT_GAMEPAD, len(payload)]) + payload
        self.assertEqual(decode(frame), (REPORT_GAMEPAD, payload))

    def test_trame_clavier_valide(self):
        payload = bytes([0x08, 0, 0x16, 0, 0, 0, 0, 0])
        frame = bytes([HEADER, REPORT_KEYBOARD, len(payload)]) + payload
        self.assertEqual(decode(frame), (REPORT_KEYBOARD, payload))

    def test_en_tete_inconnu(self):
        self.assertIsNone(decode(bytes([0x00, REPORT_GAMEPAD, 1, 0])))

    def test_trame_tronquee(self):
        self.assertIsNone(decode(bytes([HEADER, REPORT_GAMEPAD, 9, 1, 2, 3])))

    def test_longueur_incoherente(self):
        # Une manette envoie toujours neuf octets : cinq, c'est du bruit.
        frame = bytes([HEADER, REPORT_GAMEPAD, 5]) + bytes(5)
        self.assertIsNone(decode(frame))

    def test_identifiant_inconnu(self):
        frame = bytes([HEADER, 9, 8]) + bytes(8)
        self.assertIsNone(decode(frame))



class DescriptorParityTests(unittest.TestCase):
    """Le pont et l'application doivent décrire le même périphérique.

    Si les deux descripteurs divergent, la console interprète les octets d'une
    manette avec la carte d'une autre : les boutons marchent « presque », ce
    qui est bien plus difficile à diagnostiquer qu'une panne franche.
    """

    @staticmethod
    def swift_descriptor(name: str) -> bytes:
        import pathlib
        import re

        source = pathlib.Path(__file__).resolve().parent.parent / "ios" / "HemiPad" / "HID" / "HIDReportDescriptors.swift"
        text = source.read_text(encoding="utf-8")
        block = text.split(f"static let {name}: [UInt8] = [", 1)[1].split("\n    ]", 1)[0]
        block = re.sub(r"//.*", "", block)
        # Les identifiants de rapport sont écrits symboliquement côté Swift.
        block = block.replace("ReportID.gamepad.rawValue", "0x01")
        block = block.replace("ReportID.keyboard.rawValue", "0x02")
        return bytes(int(value, 16) for value in re.findall(r"0x([0-9A-Fa-f]{2})", block))

    def test_descripteur_manette_identique(self):
        from hemipad_bridge import GAMEPAD_DESCRIPTOR

        self.assertEqual(self.swift_descriptor("gamepad"), GAMEPAD_DESCRIPTOR)

    def test_descripteur_clavier_identique(self):
        from hemipad_bridge import KEYBOARD_DESCRIPTOR

        self.assertEqual(self.swift_descriptor("keyboard"), KEYBOARD_DESCRIPTOR)


if __name__ == "__main__":
    unittest.main()
