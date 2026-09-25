#!/usr/bin/env python3
"""Génère HemiPad.xcodeproj/project.pbxproj à partir de l'arborescence des sources.

Un .pbxproj écrit à la main pourrit vite : chaque fichier ajouté demande trois
entrées cohérentes (référence, fichier de build, groupe) avec des identifiants
uniques. Ce script les dérive du chemin, ce qui rend le projet reproductible —
et régénérable depuis un téléphone via l'action GitHub `Régénérer le projet
Xcode`, sans jamais ouvrir Xcode.

Usage :
    python3 ios/tools/generate_pbxproj.py [--check]

--check ne réécrit rien et sort en erreur si le fichier généré diffère de celui
du dépôt : c'est ce que l'intégration continue exécute.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # ios/
APP_NAME = "HemiPad"
TEST_NAME = "HemiPadTests"
BUNDLE_ID = "app.hemipad"
DEPLOYMENT_TARGET = "16.0"
SWIFT_VERSION = "5.0"
MARKETING_VERSION = "1.0.0"

FILE_TYPES = {
    ".swift": "sourcecode.swift",
    ".m": "sourcecode.c.objc",
    ".h": "sourcecode.c.h",
    ".plist": "text.plist.xml",
    ".xcassets": "folder.assetcatalog",
    ".md": "net.daringfireball.markdown",
    ".json": "text.json",
}


def uid(*parts: str) -> str:
    """Identifiant stable de 24 caractères hexadécimaux, dérivé du chemin."""
    digest = hashlib.md5("::".join(parts).encode("utf-8")).hexdigest()
    return digest[:24].upper()


SAFE_PATH = re.compile(r"[A-Za-z0-9_+.\- /]+")


def collect(directory: str, extension: str) -> list[str]:
    """Chemins relatifs à `ios/`, triés, des fichiers d'une extension donnée."""
    found = []
    for base, dirs, files in os.walk(os.path.join(ROOT, directory)):
        dirs[:] = sorted(d for d in dirs if not d.endswith(".xcassets") and not d.startswith("."))
        for name in sorted(files):
            if name.endswith(extension):
                full = os.path.join(base, name)
                relative = os.path.relpath(full, ROOT)
                # Un nom de fichier finit tel quel dans le .pbxproj, parfois
                # dans un commentaire : `*/`, `;` ou `}` y injecteraient du
                # contenu. On refuse tout ce qui sort d'un alphabet sûr.
                if not SAFE_PATH.fullmatch(relative):
                    raise SystemExit(f"nom de fichier refusé (caractères non sûrs) : {relative!r}")
                found.append(relative)
    return sorted(found)


def quoted(value: str) -> str:
    """Une valeur du .pbxproj : entre guillemets dès qu'elle sort de
    l'alphabet que le format accepte nu (un tiret, par exemple)."""
    if value and all(c.isalnum() or c in "_./$" for c in value):
        return value
    return '"' + value.replace('"', '\\"') + '"'


def file_type(path: str) -> str:
    _, extension = os.path.splitext(path)
    return FILE_TYPES.get(extension, "text")


class Tree:
    """Arbre de groupes reflétant les dossiers sur disque."""

    def __init__(self, name: str, path: str | None = None):
        self.name = name
        self.path = path
        self.children: dict[str, "Tree"] = {}
        self.files: list[str] = []

    def add(self, relative: str, full: str) -> None:
        """Range `full` (chemin relatif à `ios/`) dans le groupe décrit par `relative`."""
        parts = relative.split(os.sep)
        node = self
        for part in parts[:-1]:
            if part not in node.children:
                node.children[part] = Tree(part, part)
            node = node.children[part]
        node.files.append(full)

    def group_uid(self, prefix: str = "") -> str:
        return uid("group", prefix, self.name)

    def emit(self, lines: list[str], prefix: str = "") -> None:
        for child in sorted(self.children.values(), key=lambda c: c.name):
            child.emit(lines, prefix + self.name + "/")
        children_ids = [
            f"\t\t\t\t{child.group_uid(prefix + self.name + '/')} /* {child.name} */,"
            for child in sorted(self.children.values(), key=lambda c: c.name)
        ]
        file_ids = [
            f"\t\t\t\t{uid('file', path)} /* {os.path.basename(path)} */,"
            for path in sorted(self.files)
        ]
        lines.append(f"\t\t{self.group_uid(prefix)} /* {self.name} */ = {{")
        lines.append("\t\t\tisa = PBXGroup;")
        lines.append("\t\t\tchildren = (")
        lines.extend(children_ids + file_ids)
        lines.append("\t\t\t);")
        if self.path is not None:
            lines.append(f"\t\t\tpath = {quoted(self.path)};")
        else:
            lines.append(f"\t\t\tname = {self.name};")
        lines.append("\t\t\tsourceTree = \"<group>\";")
        lines.append("\t\t};")


def bridging_header() -> str | None:
    """L'en-tête qui expose à Swift le peu d'Objective-C de l'application.

    Il n'y en a qu'une raison : rattraper les exceptions Objective-C que
    CoreBluetooth peut lever, et que Swift ne sait pas intercepter.
    """
    path = os.path.join(APP_NAME, "Support", f"{APP_NAME}-Bridging-Header.h")
    return path if os.path.exists(os.path.join(ROOT, path)) else None


def build_project() -> str:
    # Swift et Objective-C sont compilés ; les en-têtes sont seulement rangés
    # dans le projet, pour qu'on les voie et qu'on les ouvre.
    app_sources = sorted(collect(APP_NAME, ".swift") + collect(APP_NAME, ".m"))
    app_headers = collect(APP_NAME, ".h")
    test_sources = collect(TEST_NAME, ".swift")
    resources = [os.path.join(APP_NAME, "Resources", "Assets.xcassets")]
    info_plist = os.path.join(APP_NAME, "Resources", "Info.plist")

    if not app_sources:
        raise SystemExit("aucun fichier Swift trouvé : lancez le script depuis le dépôt")

    app_target = uid("target", APP_NAME)
    test_target = uid("target", TEST_NAME)
    project_uid = uid("project", APP_NAME)
    product_group = uid("group", "Products")
    app_product = uid("product", APP_NAME)
    test_product = uid("product", TEST_NAME)
    main_group = uid("group", "mainGroup")

    lines: list[str] = []
    add = lines.append

    add("// !$*UTF8*$!")
    add("{")
    add("\tarchiveVersion = 1;")
    add("\tclasses = {")
    add("\t};")
    add("\tobjectVersion = 56;")
    add("\tobjects = {")

    # --- PBXBuildFile -------------------------------------------------------
    add("")
    add("/* Begin PBXBuildFile section */")
    for path in app_sources:
        add(
            f"\t\t{uid('build', APP_NAME, path)} /* {os.path.basename(path)} in Sources */ = "
            f"{{isa = PBXBuildFile; fileRef = {uid('file', path)} /* {os.path.basename(path)} */; }};"
        )
    for path in test_sources:
        add(
            f"\t\t{uid('build', TEST_NAME, path)} /* {os.path.basename(path)} in Sources */ = "
            f"{{isa = PBXBuildFile; fileRef = {uid('file', path)} /* {os.path.basename(path)} */; }};"
        )
    for path in resources:
        add(
            f"\t\t{uid('build', APP_NAME, path)} /* {os.path.basename(path)} in Resources */ = "
            f"{{isa = PBXBuildFile; fileRef = {uid('file', path)} /* {os.path.basename(path)} */; }};"
        )
    add("/* End PBXBuildFile section */")

    # --- PBXContainerItemProxy ---------------------------------------------
    proxy = uid("proxy", TEST_NAME)
    dependency = uid("dependency", TEST_NAME)
    add("")
    add("/* Begin PBXContainerItemProxy section */")
    add(f"\t\t{proxy} /* PBXContainerItemProxy */ = {{")
    add("\t\t\tisa = PBXContainerItemProxy;")
    add(f"\t\t\tcontainerPortal = {project_uid} /* Project object */;")
    add("\t\t\tproxyType = 1;")
    add(f"\t\t\tremoteGlobalIDString = {app_target};")
    add(f"\t\t\tremoteInfo = {APP_NAME};")
    add("\t\t};")
    add("/* End PBXContainerItemProxy section */")

    # --- PBXFileReference ---------------------------------------------------
    add("")
    add("/* Begin PBXFileReference section */")
    for path in app_sources + app_headers + test_sources + resources + [info_plist]:
        name = os.path.basename(path)
        add(
            f"\t\t{uid('file', path)} /* {name} */ = {{isa = PBXFileReference; "
            f"lastKnownFileType = {file_type(path)}; path = {quoted(name)}; sourceTree = \"<group>\"; }};"
        )
    add(
        f"\t\t{app_product} /* {APP_NAME}.app */ = {{isa = PBXFileReference; explicitFileType = "
        f"wrapper.application; includeInIndex = 0; path = {APP_NAME}.app; sourceTree = BUILT_PRODUCTS_DIR; }};"
    )
    add(
        f"\t\t{test_product} /* {TEST_NAME}.xctest */ = {{isa = PBXFileReference; explicitFileType = "
        f"wrapper.cfbundle; includeInIndex = 0; path = {TEST_NAME}.xctest; sourceTree = BUILT_PRODUCTS_DIR; }};"
    )
    add("/* End PBXFileReference section */")

    # --- PBXFrameworksBuildPhase -------------------------------------------
    add("")
    add("/* Begin PBXFrameworksBuildPhase section */")
    for target_name, target in ((APP_NAME, app_target), (TEST_NAME, test_target)):
        add(f"\t\t{uid('frameworks', target_name)} /* Frameworks */ = {{")
        add("\t\t\tisa = PBXFrameworksBuildPhase;")
        add("\t\t\tbuildActionMask = 2147483647;")
        add("\t\t\tfiles = (")
        add("\t\t\t);")
        add("\t\t\trunOnlyForDeploymentPostprocessing = 0;")
        add("\t\t};")
    add("/* End PBXFrameworksBuildPhase section */")

    # --- PBXGroup -----------------------------------------------------------
    app_tree = Tree(APP_NAME, APP_NAME)
    for path in app_sources + app_headers + resources + [info_plist]:
        app_tree.add(os.path.relpath(path, APP_NAME), path)

    test_tree = Tree(TEST_NAME, TEST_NAME)
    for path in test_sources:
        test_tree.add(os.path.relpath(path, TEST_NAME), path)

    add("")
    add("/* Begin PBXGroup section */")
    add(f"\t\t{main_group} = {{")
    add("\t\t\tisa = PBXGroup;")
    add("\t\t\tchildren = (")
    add(f"\t\t\t\t{app_tree.group_uid()} /* {APP_NAME} */,")
    add(f"\t\t\t\t{test_tree.group_uid()} /* {TEST_NAME} */,")
    add(f"\t\t\t\t{product_group} /* Products */,")
    add("\t\t\t);")
    add("\t\t\tsourceTree = \"<group>\";")
    add("\t\t};")
    add(f"\t\t{product_group} /* Products */ = {{")
    add("\t\t\tisa = PBXGroup;")
    add("\t\t\tchildren = (")
    add(f"\t\t\t\t{app_product} /* {APP_NAME}.app */,")
    add(f"\t\t\t\t{test_product} /* {TEST_NAME}.xctest */,")
    add("\t\t\t);")
    add("\t\t\tname = Products;")
    add("\t\t\tsourceTree = \"<group>\";")
    add("\t\t};")
    app_tree.emit(lines)
    test_tree.emit(lines)
    add("/* End PBXGroup section */")

    # --- PBXShellScriptBuildPhase -------------------------------------------
    # La bibliothèque Rust est compilée avant le Swift : c'est elle qui porte
    # le format des trames et le choix du chemin, que l'application appelle
    # par son ABI C.
    add("")
    add("/* Begin PBXShellScriptBuildPhase section */")
    add(f"\t\t{uid('rust', APP_NAME)} /* Bibliothèque Rust */ = {{")
    add("\t\t\tisa = PBXShellScriptBuildPhase;")
    add("\t\t\tbuildActionMask = 2147483647;")
    add("\t\t\tfiles = (")
    add("\t\t\t);")
    add("\t\t\tinputPaths = (")
    add("\t\t\t\t\"$(SRCROOT)/../bridge/wire/src\",")
    add("\t\t\t\t\"$(SRCROOT)/../bridge/wire/Cargo.toml\",")
    add("\t\t\t);")
    add("\t\t\tname = \"Bibliothèque Rust\";")
    add("\t\t\toutputPaths = (")
    add(
        "\t\t\t\t\"$(SRCROOT)/../bridge/target/xcode/"
        "$(CONFIGURATION)-$(PLATFORM_NAME)/libhemipad_wire.a\","
    )
    add("\t\t\t);")
    add("\t\t\trunOnlyForDeploymentPostprocessing = 0;")
    add("\t\t\tshellPath = /bin/sh;")
    add(
        "\t\t\tshellScript = \"\\\"$SRCROOT/../bridge/scripts/"
        "compiler-pour-xcode.sh\\\"\\n\";"
    )
    add("\t\t};")
    add("/* End PBXShellScriptBuildPhase section */")

    # --- PBXNativeTarget ----------------------------------------------------
    add("")
    add("/* Begin PBXNativeTarget section */")
    add(f"\t\t{app_target} /* {APP_NAME} */ = {{")
    add("\t\t\tisa = PBXNativeTarget;")
    add(
        f"\t\t\tbuildConfigurationList = {uid('configlist', APP_NAME)} "
        f"/* Build configuration list for PBXNativeTarget \"{APP_NAME}\" */;"
    )
    add("\t\t\tbuildPhases = (")
    add(f"\t\t\t\t{uid('rust', APP_NAME)} /* Bibliothèque Rust */,")
    add(f"\t\t\t\t{uid('sources', APP_NAME)} /* Sources */,")
    add(f"\t\t\t\t{uid('frameworks', APP_NAME)} /* Frameworks */,")
    add(f"\t\t\t\t{uid('resources', APP_NAME)} /* Resources */,")
    add("\t\t\t);")
    add("\t\t\tbuildRules = (")
    add("\t\t\t);")
    add("\t\t\tdependencies = (")
    add("\t\t\t);")
    add(f"\t\t\tname = {APP_NAME};")
    add(f"\t\t\tproductName = {APP_NAME};")
    add(f"\t\t\tproductReference = {app_product} /* {APP_NAME}.app */;")
    add("\t\t\tproductType = \"com.apple.product-type.application\";")
    add("\t\t};")
    add(f"\t\t{test_target} /* {TEST_NAME} */ = {{")
    add("\t\t\tisa = PBXNativeTarget;")
    add(
        f"\t\t\tbuildConfigurationList = {uid('configlist', TEST_NAME)} "
        f"/* Build configuration list for PBXNativeTarget \"{TEST_NAME}\" */;"
    )
    add("\t\t\tbuildPhases = (")
    add(f"\t\t\t\t{uid('sources', TEST_NAME)} /* Sources */,")
    add(f"\t\t\t\t{uid('frameworks', TEST_NAME)} /* Frameworks */,")
    add("\t\t\t);")
    add("\t\t\tbuildRules = (")
    add("\t\t\t);")
    add("\t\t\tdependencies = (")
    add(f"\t\t\t\t{dependency} /* PBXTargetDependency */,")
    add("\t\t\t);")
    add(f"\t\t\tname = {TEST_NAME};")
    add(f"\t\t\tproductName = {TEST_NAME};")
    add(f"\t\t\tproductReference = {test_product} /* {TEST_NAME}.xctest */;")
    add("\t\t\tproductType = \"com.apple.product-type.bundle.unit-test\";")
    add("\t\t};")
    add("/* End PBXNativeTarget section */")

    # --- PBXProject ---------------------------------------------------------
    add("")
    add("/* Begin PBXProject section */")
    add(f"\t\t{project_uid} /* Project object */ = {{")
    add("\t\t\tisa = PBXProject;")
    add("\t\t\tattributes = {")
    add("\t\t\t\tBuildIndependentTargetsInParallel = 1;")
    add("\t\t\t\tLastSwiftUpdateCheck = 1500;")
    add("\t\t\t\tLastUpgradeCheck = 1500;")
    add("\t\t\t\tTargetAttributes = {")
    add(f"\t\t\t\t\t{app_target} = {{")
    add("\t\t\t\t\t\tCreatedOnToolsVersion = 15.0;")
    add("\t\t\t\t\t};")
    add(f"\t\t\t\t\t{test_target} = {{")
    add("\t\t\t\t\t\tCreatedOnToolsVersion = 15.0;")
    add(f"\t\t\t\t\t\tTestTargetID = {app_target};")
    add("\t\t\t\t\t};")
    add("\t\t\t\t};")
    add("\t\t\t};")
    add(
        f"\t\t\tbuildConfigurationList = {uid('configlist', 'project')} "
        f"/* Build configuration list for PBXProject \"{APP_NAME}\" */;"
    )
    add("\t\t\tcompatibilityVersion = \"Xcode 14.0\";")
    add("\t\t\tdevelopmentRegion = fr;")
    add("\t\t\thasScannedForEncodings = 0;")
    add("\t\t\tknownRegions = (")
    add("\t\t\t\tfr,")
    add("\t\t\t\tBase,")
    add("\t\t\t);")
    add(f"\t\t\tmainGroup = {main_group};")
    add(f"\t\t\tproductRefGroup = {product_group} /* Products */;")
    add("\t\t\tprojectDirPath = \"\";")
    add("\t\t\tprojectRoot = \"\";")
    add("\t\t\ttargets = (")
    add(f"\t\t\t\t{app_target} /* {APP_NAME} */,")
    add(f"\t\t\t\t{test_target} /* {TEST_NAME} */,")
    add("\t\t\t);")
    add("\t\t};")
    add("/* End PBXProject section */")

    # --- PBXResourcesBuildPhase --------------------------------------------
    add("")
    add("/* Begin PBXResourcesBuildPhase section */")
    add(f"\t\t{uid('resources', APP_NAME)} /* Resources */ = {{")
    add("\t\t\tisa = PBXResourcesBuildPhase;")
    add("\t\t\tbuildActionMask = 2147483647;")
    add("\t\t\tfiles = (")
    for path in resources:
        add(f"\t\t\t\t{uid('build', APP_NAME, path)} /* {os.path.basename(path)} in Resources */,")
    add("\t\t\t);")
    add("\t\t\trunOnlyForDeploymentPostprocessing = 0;")
    add("\t\t};")
    add("/* End PBXResourcesBuildPhase section */")

    # --- PBXSourcesBuildPhase ----------------------------------------------
    add("")
    add("/* Begin PBXSourcesBuildPhase section */")
    for target_name, sources in ((APP_NAME, app_sources), (TEST_NAME, test_sources)):
        add(f"\t\t{uid('sources', target_name)} /* Sources */ = {{")
        add("\t\t\tisa = PBXSourcesBuildPhase;")
        add("\t\t\tbuildActionMask = 2147483647;")
        add("\t\t\tfiles = (")
        for path in sources:
            add(
                f"\t\t\t\t{uid('build', target_name, path)} "
                f"/* {os.path.basename(path)} in Sources */,"
            )
        add("\t\t\t);")
        add("\t\t\trunOnlyForDeploymentPostprocessing = 0;")
        add("\t\t};")
    add("/* End PBXSourcesBuildPhase section */")

    # --- PBXTargetDependency ------------------------------------------------
    add("")
    add("/* Begin PBXTargetDependency section */")
    add(f"\t\t{dependency} /* PBXTargetDependency */ = {{")
    add("\t\t\tisa = PBXTargetDependency;")
    add(f"\t\t\ttarget = {app_target} /* {APP_NAME} */;")
    add(f"\t\t\ttargetProxy = {proxy} /* PBXContainerItemProxy */;")
    add("\t\t};")
    add("/* End PBXTargetDependency section */")

    # --- XCBuildConfiguration ----------------------------------------------
    add("")
    add("/* Begin XCBuildConfiguration section */")
    for configuration in ("Debug", "Release"):
        add(f"\t\t{uid('config', 'project', configuration)} /* {configuration} */ = {{")
        add("\t\t\tisa = XCBuildConfiguration;")
        add("\t\t\tbuildSettings = {")
        for key, value in project_settings(configuration).items():
            add(f"\t\t\t\t{key} = {value};")
        add("\t\t\t};")
        add(f"\t\t\tname = {configuration};")
        add("\t\t};")
    for configuration in ("Debug", "Release"):
        add(f"\t\t{uid('config', APP_NAME, configuration)} /* {configuration} */ = {{")
        add("\t\t\tisa = XCBuildConfiguration;")
        add("\t\t\tbuildSettings = {")
        for key, value in app_settings(configuration, info_plist).items():
            add(f"\t\t\t\t{key} = {value};")
        add("\t\t\t};")
        add(f"\t\t\tname = {configuration};")
        add("\t\t};")
    for configuration in ("Debug", "Release"):
        add(f"\t\t{uid('config', TEST_NAME, configuration)} /* {configuration} */ = {{")
        add("\t\t\tisa = XCBuildConfiguration;")
        add("\t\t\tbuildSettings = {")
        for key, value in test_settings(configuration).items():
            add(f"\t\t\t\t{key} = {value};")
        add("\t\t\t};")
        add(f"\t\t\tname = {configuration};")
        add("\t\t};")
    add("/* End XCBuildConfiguration section */")

    # --- XCConfigurationList ------------------------------------------------
    add("")
    add("/* Begin XCConfigurationList section */")
    for name, label in (
        ("project", f"PBXProject \"{APP_NAME}\""),
        (APP_NAME, f"PBXNativeTarget \"{APP_NAME}\""),
        (TEST_NAME, f"PBXNativeTarget \"{TEST_NAME}\""),
    ):
        add(f"\t\t{uid('configlist', name)} /* Build configuration list for {label} */ = {{")
        add("\t\t\tisa = XCConfigurationList;")
        add("\t\t\tbuildConfigurations = (")
        add(f"\t\t\t\t{uid('config', name, 'Debug')} /* Debug */,")
        add(f"\t\t\t\t{uid('config', name, 'Release')} /* Release */,")
        add("\t\t\t);")
        add("\t\t\tdefaultConfigurationIsVisible = 0;")
        add("\t\t\tdefaultConfigurationName = Release;")
        add("\t\t};")
    add("/* End XCConfigurationList section */")

    add("\t};")
    add(f"\trootObject = {project_uid} /* Project object */;")
    add("}")
    return "\n".join(lines) + "\n"


def project_settings(configuration: str) -> dict[str, str]:
    settings = {
        "ALWAYS_SEARCH_USER_PATHS": "NO",
        "ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS": "YES",
        "CLANG_ANALYZER_NONNULL": "YES",
        "CLANG_ENABLE_MODULES": "YES",
        "CLANG_ENABLE_OBJC_ARC": "YES",
        "CLANG_WARN_DOCUMENTATION_COMMENTS": "YES",
        "CLANG_WARN_UNREACHABLE_CODE": "YES",
        "COPY_PHASE_STRIP": "NO",
        "ENABLE_STRICT_OBJC_MSGSEND": "YES",
        "GCC_C_LANGUAGE_STANDARD": "gnu17",
        "GCC_NO_COMMON_BLOCKS": "YES",
        "GCC_WARN_UNDECLARED_SELECTOR": "YES",
        "GCC_WARN_UNUSED_FUNCTION": "YES",
        "GCC_WARN_UNUSED_VARIABLE": "YES",
        "IPHONEOS_DEPLOYMENT_TARGET": DEPLOYMENT_TARGET,
        "LOCALIZATION_PREFERS_STRING_CATALOGS": "YES",
        "MTL_FAST_MATH": "YES",
        "SDKROOT": "iphoneos",
        "SWIFT_VERSION": SWIFT_VERSION,
    }
    if configuration == "Debug":
        settings.update(
            {
                "DEBUG_INFORMATION_FORMAT": "dwarf",
                "ENABLE_TESTABILITY": "YES",
                "GCC_DYNAMIC_NO_PIC": "NO",
                "GCC_OPTIMIZATION_LEVEL": "0",
                "GCC_PREPROCESSOR_DEFINITIONS": "(\n\t\t\t\t\t\"DEBUG=1\",\n\t\t\t\t\t\"$(inherited)\",\n\t\t\t\t)",
                "MTL_ENABLE_DEBUG_INFO": "INCLUDE_SOURCE",
                "ONLY_ACTIVE_ARCH": "YES",
                "SWIFT_ACTIVE_COMPILATION_CONDITIONS": "\"DEBUG $(inherited)\"",
                "SWIFT_OPTIMIZATION_LEVEL": "\"-Onone\"",
            }
        )
    else:
        settings.update(
            {
                "DEBUG_INFORMATION_FORMAT": "\"dwarf-with-dsym\"",
                "ENABLE_NS_ASSERTIONS": "NO",
                "MTL_ENABLE_DEBUG_INFO": "NO",
                "SWIFT_COMPILATION_MODE": "wholemodule",
                "VALIDATE_PRODUCT": "YES",
            }
        )
    return settings


def app_settings(configuration: str, info_plist: str) -> dict[str, str]:
    settings = {
        "ASSETCATALOG_COMPILER_APPICON_NAME": "AppIcon",
        "ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME": "AccentColor",
        "CODE_SIGN_STYLE": "Automatic",
        "CURRENT_PROJECT_VERSION": "1",
        "DEVELOPMENT_ASSET_PATHS": "\"\"",
        "ENABLE_PREVIEWS": "YES",
        "GENERATE_INFOPLIST_FILE": "NO",
        "INFOPLIST_FILE": info_plist,
        "IPHONEOS_DEPLOYMENT_TARGET": DEPLOYMENT_TARGET,
        "LD_RUNPATH_SEARCH_PATHS": "(\n\t\t\t\t\t\"$(inherited)\",\n\t\t\t\t\t\"@executable_path/Frameworks\",\n\t\t\t\t)",
        "MARKETING_VERSION": MARKETING_VERSION,
        "PRODUCT_BUNDLE_IDENTIFIER": BUNDLE_ID,
        "PRODUCT_NAME": "\"$(TARGET_NAME)\"",
        "SWIFT_EMIT_LOC_STRINGS": "YES",
        "SWIFT_VERSION": SWIFT_VERSION,
        "TARGETED_DEVICE_FAMILY": "\"1,2\"",
    }
    # La bibliothèque Rust : où trouver son en-tête, son archive, et le nom
    # sous lequel la lier.
    settings["HEADER_SEARCH_PATHS"] = (
        "(\n\t\t\t\t\t\"$(inherited)\",\n"
        "\t\t\t\t\t\"$(SRCROOT)/../bridge/wire/include\",\n\t\t\t\t)"
    )
    settings["LIBRARY_SEARCH_PATHS"] = (
        "(\n\t\t\t\t\t\"$(inherited)\",\n"
        "\t\t\t\t\t\"$(SRCROOT)/../bridge/target/xcode/"
        "$(CONFIGURATION)-$(PLATFORM_NAME)\",\n\t\t\t\t)"
    )
    settings["OTHER_LDFLAGS"] = (
        "(\n\t\t\t\t\t\"$(inherited)\",\n\t\t\t\t\t\"-lhemipad_wire\",\n\t\t\t\t)"
    )

    header = bridging_header()
    if header:
        settings["SWIFT_OBJC_BRIDGING_HEADER"] = f"\"{header}\""
    return settings


def test_settings(configuration: str) -> dict[str, str]:
    # Les essais se lient à l'application (BUNDLE_LOADER), qui porte déjà la
    # bibliothèque Rust. Ils ont quand même besoin de trouver son en-tête.
    return {
        "HEADER_SEARCH_PATHS": (
            "(\n\t\t\t\t\t\"$(inherited)\",\n"
            "\t\t\t\t\t\"$(SRCROOT)/../bridge/wire/include\",\n\t\t\t\t)"
        ),
        "ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES": "YES",
        "BUNDLE_LOADER": "\"$(TEST_HOST)\"",
        "CODE_SIGN_STYLE": "Automatic",
        "CURRENT_PROJECT_VERSION": "1",
        "GENERATE_INFOPLIST_FILE": "YES",
        "IPHONEOS_DEPLOYMENT_TARGET": DEPLOYMENT_TARGET,
        "MARKETING_VERSION": MARKETING_VERSION,
        "PRODUCT_BUNDLE_IDENTIFIER": f"{BUNDLE_ID}.tests",
        "PRODUCT_NAME": "\"$(TARGET_NAME)\"",
        "SWIFT_EMIT_LOC_STRINGS": "NO",
        "SWIFT_VERSION": SWIFT_VERSION,
        "TARGETED_DEVICE_FAMILY": "\"1,2\"",
        "TEST_HOST": f"\"$(BUILT_PRODUCTS_DIR)/{APP_NAME}.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/{APP_NAME}\"",
    }


SCHEME_TEMPLATE = """<?xml version="1.0" encoding="UTF-8"?>
<Scheme
   LastUpgradeVersion = "1500"
   version = "1.7">
   <BuildAction
      parallelizeBuildables = "YES"
      buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry
            buildForTesting = "YES"
            buildForRunning = "YES"
            buildForProfiling = "YES"
            buildForArchiving = "YES"
            buildForAnalyzing = "YES">
            <BuildableReference
               BuildableIdentifier = "primary"
               BlueprintIdentifier = "{app_target}"
               BuildableName = "{app}.app"
               BlueprintName = "{app}"
               ReferencedContainer = "container:{app}.xcodeproj">
            </BuildableReference>
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      shouldUseLaunchSchemeArgsEnv = "YES">
      <Testables>
         <TestableReference
            skipped = "NO">
            <BuildableReference
               BuildableIdentifier = "primary"
               BlueprintIdentifier = "{test_target}"
               BuildableName = "{tests}.xctest"
               BlueprintName = "{tests}"
               ReferencedContainer = "container:{app}.xcodeproj">
            </BuildableReference>
         </TestableReference>
      </Testables>
   </TestAction>
   <LaunchAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      launchStyle = "0"
      useCustomWorkingDirectory = "NO"
      ignoresPersistentStateOnLaunch = "NO"
      debugDocumentVersioning = "YES"
      debugServiceExtension = "internal"
      allowLocationSimulation = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = "{app_target}"
            BuildableName = "{app}.app"
            BlueprintName = "{app}"
            ReferencedContainer = "container:{app}.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
   </LaunchAction>
   <ProfileAction
      buildConfiguration = "Release"
      shouldUseLaunchSchemeArgsEnv = "YES"
      savedToolIdentifier = ""
      useCustomWorkingDirectory = "NO"
      debugDocumentVersioning = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = "{app_target}"
            BuildableName = "{app}.app"
            BlueprintName = "{app}"
            ReferencedContainer = "container:{app}.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
   </ProfileAction>
   <AnalyzeAction
      buildConfiguration = "Debug">
   </AnalyzeAction>
   <ArchiveAction
      buildConfiguration = "Release"
      revealArchiveInOrganizer = "YES">
   </ArchiveAction>
</Scheme>
"""

WORKSPACE_TEMPLATE = """<?xml version="1.0" encoding="UTF-8"?>
<Workspace
   version = "1.0">
   <FileRef
      location = "self:">
   </FileRef>
</Workspace>
"""


def companion_files() -> dict[str, str]:
    """Schéma partagé et workspace, dérivés des mêmes identifiants que le projet."""
    scheme = SCHEME_TEMPLATE.format(
        app=APP_NAME,
        tests=TEST_NAME,
        app_target=uid("target", APP_NAME),
        test_target=uid("target", TEST_NAME),
    )
    return {
        os.path.join(f"{APP_NAME}.xcodeproj", "xcshareddata", "xcschemes", f"{APP_NAME}.xcscheme"): scheme,
        os.path.join(f"{APP_NAME}.xcodeproj", "project.xcworkspace", "contents.xcworkspacedata"): WORKSPACE_TEMPLATE,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="vérifie sans réécrire")
    arguments = parser.parse_args()

    outputs = {os.path.join(f"{APP_NAME}.xcodeproj", "project.pbxproj"): build_project()}
    outputs.update(companion_files())

    if arguments.check:
        stale = []
        for relative, content in sorted(outputs.items()):
            destination = os.path.join(ROOT, relative)
            if not os.path.exists(destination):
                stale.append(f"{relative} : absent")
                continue
            with open(destination, encoding="utf-8") as handle:
                if handle.read() != content:
                    stale.append(f"{relative} : périmé")
        for line in stale:
            print(line, file=sys.stderr)
        if stale:
            print(
                "relancez python3 ios/tools/generate_pbxproj.py puis committez le résultat",
                file=sys.stderr,
            )
            return 1
        print("le projet Xcode est à jour")
        return 0

    for relative, content in sorted(outputs.items()):
        destination = os.path.join(ROOT, relative)
        os.makedirs(os.path.dirname(destination), exist_ok=True)
        with open(destination, "w", encoding="utf-8") as handle:
            handle.write(content)
        print(f"écrit ios/{relative}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
