#!/usr/bin/env python3
"""Vérifie qu'un project.pbxproj est structurellement sain.

Xcode ouvre un projet incohérent en le « réparant » silencieusement, ou refuse
de l'ouvrir sans dire pourquoi. Sur un téléphone, sans Xcode sous la main, ces
deux issues sont également inexploitables : on vérifie donc avant de pousser.

Contrôles : délimiteurs équilibrés, aucun identifiant défini deux fois, aucun
identifiant référencé sans définition, présence des sections obligatoires.
"""

from __future__ import annotations

import os
import re
import sys

ID_PATTERN = re.compile(r"\b[0-9A-F]{24}\b")
DEFINITION_PATTERN = re.compile(r"^\t\t([0-9A-F]{24})\b")
REQUIRED_SECTIONS = (
    "PBXBuildFile",
    "PBXFileReference",
    "PBXGroup",
    "PBXNativeTarget",
    "PBXProject",
    "PBXSourcesBuildPhase",
    "XCBuildConfiguration",
    "XCConfigurationList",
)


def validate(path: str) -> list[str]:
    errors: list[str] = []
    with open(path, encoding="utf-8") as handle:
        content = handle.read()

    # Délimiteurs, en ignorant ce qui se trouve dans les commentaires et
    # les chaînes.
    stripped = re.sub(r"/\*.*?\*/", "", content, flags=re.DOTALL)
    stripped = re.sub(r"\"(?:[^\"\\]|\\.)*\"", '""', stripped)
    for opening, closing in (("{", "}"), ("(", ")")):
        if stripped.count(opening) != stripped.count(closing):
            errors.append(
                f"délimiteurs déséquilibrés : {stripped.count(opening)} « {opening} » "
                f"pour {stripped.count(closing)} « {closing} »"
            )

    defined: set[str] = set()
    for line in content.splitlines():
        match = DEFINITION_PATTERN.match(line)
        if not match:
            continue
        identifier = match.group(1)
        if identifier in defined:
            errors.append(f"identifiant défini deux fois : {identifier}")
        defined.add(identifier)

    referenced = set(ID_PATTERN.findall(re.sub(r"/\*.*?\*/", "", content, flags=re.DOTALL)))
    for identifier in sorted(referenced - defined):
        errors.append(f"identifiant référencé mais jamais défini : {identifier}")

    for section in REQUIRED_SECTIONS:
        if f"/* Begin {section} section */" not in content:
            errors.append(f"section manquante : {section}")
        if f"/* End {section} section */" not in content:
            errors.append(f"section non refermée : {section}")

    if not content.startswith("// !$*UTF8*$!"):
        errors.append("en-tête UTF-8 manquant")
    if "rootObject" not in content:
        errors.append("rootObject manquant")

    # Chaque fichier source référencé doit exister sur le disque.
    project_dir = os.path.dirname(os.path.dirname(os.path.abspath(path)))
    for match in re.finditer(r"(?:^|\s)INFOPLIST_FILE = ([^;]+);", content, flags=re.MULTILINE):
        plist = match.group(1).strip().strip('"')
        if not os.path.exists(os.path.join(project_dir, plist)):
            errors.append(f"INFOPLIST_FILE introuvable : {plist}")

    return errors


def main() -> int:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, "HemiPad.xcodeproj", "project.pbxproj")
    if not os.path.exists(path):
        print(f"introuvable : {path}", file=sys.stderr)
        return 1
    errors = validate(path)
    for error in errors:
        print(error, file=sys.stderr)
    if errors:
        return 1
    print(f"{os.path.basename(path)} : structure valide")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
