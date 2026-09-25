#!/usr/bin/env python3
"""Le boîtier et l'application décrivent-ils la même manette ?

Le descripteur HID existe à deux endroits : en Swift, publié en Bluetooth, et
en Rust, présenté par le port USB du boîtier. S'ils divergent d'un seul octet,
la console interprète de travers ce qu'elle reçoit — un bouton en active un
autre, un stick part de travers — et rien ne le signalerait.

Ce contrôle compare les deux, octet par octet.

    python3 bridge/scripts/verifier-descripteur.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
SWIFT = RACINE / "ios/HemiPad/HID/HIDReportDescriptors.swift"
RUST = RACINE / "bridge/wire/src/descriptor.rs"

IDENTIFIANTS = {"gamepad": 0x01, "keyboard": 0x02}


def octets_swift(texte: str, nom: str) -> list[int]:
    """Les octets d'un tableau `static let <nom>: [UInt8] = [...]`."""
    entete = f"static let {nom}: [UInt8] = ["
    debut = texte.index(entete) + len(entete) - 1
    profondeur = 0
    fin = None
    for position in range(debut, len(texte)):
        if texte[position] == "[":
            profondeur += 1
        elif texte[position] == "]":
            profondeur -= 1
            if profondeur == 0:
                fin = position
                break
    if fin is None:
        raise SystemExit(f"tableau {nom} non refermé dans {SWIFT}")

    corps = re.sub(r"//[^\n]*", "", texte[debut + 1 : fin])
    corps = corps.replace(f"ReportID.{nom}.rawValue", hex(IDENTIFIANTS[nom]))
    return [
        int(jeton, 16) if jeton.lower().startswith("0x") else int(jeton)
        for jeton in (brut.strip() for brut in corps.split(","))
        if jeton
    ]


def octets_rust(texte: str) -> list[int]:
    corps = texte[texte.index("HID_REPORT_DESCRIPTOR") :]
    corps = corps[corps.index("[") + 1 : corps.index("];")]
    return [int(jeton, 16) for jeton in re.findall(r"0x[0-9A-Fa-f]{2}", corps)]


def main() -> int:
    swift = octets_swift(SWIFT.read_text(encoding="utf-8"), "gamepad")
    swift += octets_swift(SWIFT.read_text(encoding="utf-8"), "keyboard")
    rust = octets_rust(RUST.read_text(encoding="utf-8"))

    if swift == rust:
        print(f"descripteur HID identique des deux côtés ({len(swift)} octets)")
        return 0

    print("Le descripteur HID diffère entre l'application et le boîtier.", file=sys.stderr)
    print(f"  Swift ({SWIFT}) : {len(swift)} octets", file=sys.stderr)
    print(f"  Rust  ({RUST}) : {len(rust)} octets", file=sys.stderr)
    for position, (attendu, trouve) in enumerate(zip(swift, rust)):
        if attendu != trouve:
            print(
                f"  premier écart à l'octet {position} : "
                f"Swift 0x{attendu:02X}, Rust 0x{trouve:02X}",
                file=sys.stderr,
            )
            break
    print(
        "\nRégénérez le côté Rust depuis le Swift plutôt que de le corriger à la main.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
