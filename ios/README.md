# HemiPad — application iOS

Manette et clavier tactiles pour une seule main valide, en SwiftUI.

## Ouvrir le projet

```bash
python3 tools/generate_pbxproj.py   # régénère project.pbxproj, le schéma et le workspace
python3 tools/validate_pbxproj.py   # vérifie la structure du projet
open HemiPad.xcodeproj
```

Le projet Xcode est **généré à partir de l'arborescence des sources**. Un
`.pbxproj` écrit à la main se corrompt dès qu'on ajoute un fichier depuis un
outil qui ne connaît pas Xcode — c'est-à-dire depuis un téléphone. Ici, ajouter
un fichier Swift et relancer le générateur suffit ; l'intégration continue
refuse toute divergence entre les sources et le projet.

Cible minimale : iOS 16. Aucune dépendance externe.

## Carte du code

| Dossier | Rôle |
|---|---|
| `App/` | Point d'entrée et état global (`AppState`) |
| `Models/` | Contrôles, état de la manette, profils de consoles, solveur de disposition |
| `Accessibility/` | Profil hémiplégie, arcs d'atteinte, filtre anti-tremblement, arbitrage des appuis, modificateurs collants, macros, visée par inclinaison |
| `HID/` | Descripteurs et encodeurs de rapports manette et clavier |
| `Transport/` | Bluetooth HID (*HID over GATT*), pont réseau, mode démo, coordination |
| `Views/` | Écrans SwiftUI : manette, clavier, connexion, réglages, calibration |
| `Support/` | Thème, haptique, persistance, injection d'environnement |

### Le chemin d'une pression

```
Doigt → PadButtonView → AppState.press → InputArbiter (anti-rebond, verrou,
survol, répétition) → GamepadState → TransportCoordinator (lissage 125 Hz,
suppression des doublons) → GamepadReportEncoder → transport → machine
```

Chaque étage a une responsabilité unique : l'arbitre ne connaît pas le HID,
l'encodeur ne connaît pas l'accessibilité, le transport ne connaît ni l'un ni
l'autre. C'est ce qui permet d'ajouter un chemin de sortie — le pont USB — sans
toucher à une seule règle d'accessibilité.

## Tests

```bash
xcodebuild test -project HemiPad.xcodeproj -scheme HemiPad \
  -destination 'platform=iOS Simulator,name=iPhone 15'
```

28 tests, répartis en quatre familles :

- **Encodage HID** : rapport neutre, bornes des axes, inversion de l'axe
  vertical, masque de boutons, diagonales du *hat switch*, équilibre des
  collections du descripteur.
- **Géométrie d'atteinte** : miroir gauche/droite, sens de balayage de l'arc,
  points hors de portée, translation rigide.
- **Solveur de disposition** : aucun chevauchement et aucun débordement sur
  cinq tailles d'écran, six profils de consoles et six profils d'accessibilité ;
  réduction des cibles plutôt que suppression ; plancher de 44 points respecté.
- **Règles d'appui** : verrouillage, anti-rebond, croix jamais verrouillée,
  relâchement global, stick qui garde sa position, accords clavier composés
  touche par touche.

## Autorisations demandées

| Clé `Info.plist` | Pourquoi |
|---|---|
| `NSBluetoothAlwaysUsageDescription` | S'annoncer comme manette et clavier |
| `NSLocalNetworkUsageDescription` + `NSBonjourServices` | Trouver un pont HemiPad sur le réseau local |
| `NSMotionUsageDescription` | Visée par inclinaison, en remplacement du stick droit |
| `UIBackgroundModes: bluetooth-peripheral` | Rester connecté écran éteint |
