# HemiPad

**Une manette de jeu et un clavier de code, sur iPhone, utilisables d'une seule main.**

HemiPad part d'une contrainte et n'en dévie jamais : *une seule main est
disponible, et elle se fatigue*. Tout le reste — la disposition des boutons, la
façon dont un appui est validé, le remplacement du second stick, la composition
des raccourcis clavier — en découle.

[![Déployer sur Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/maxlestage/HemiPad)

| | |
|---|---|
| **Application** | iOS 16+, Swift, SwiftUI, CoreBluetooth, CoreMotion |
| **Site vitrine** | React 18, TypeScript, Vite, servi par Express |
| **Cibles** | Nintendo Switch, PlayStation, Xbox, Steam Deck / PC, émulateurs, ordinateur (clavier) |
| **Mise en ligne** | Heroku, pilotable à 100 % depuis un téléphone |

---

## Ce que l'application fait réellement

L'iPhone produit des **rapports HID standards** — ceux qu'envoie n'importe
quelle manette ou clavier USB — puis les achemine par l'un des deux chemins :

1. **Bluetooth HID** (*HID over GATT*) : l'iPhone s'annonce lui-même comme
   périphérique d'entrée.
2. **Pont HemiPad** : un petit boîtier USB (Raspberry Pi Zero, carte
   équivalente) reçoit les mêmes octets par Wi-Fi et les rejoue sur le port USB
   de la console. Implémentation de référence dans [`bridge/`](bridge/).

> **Limite à connaître.** iOS réserve une partie du profil HID : selon la
> version du système et les droits accordés à l'application,
> `CBPeripheralManager` peut refuser de publier le service 0x1812. HemiPad le
> dit alors explicitement et propose de basculer sur le pont, qui utilise
> exactement les mêmes descripteurs. Ce n'est pas un contournement bricolé :
> c'est le même code d'encodage, sur un autre tuyau — et un test vérifie que
> les deux descripteurs ne divergent jamais.

## Les règles d'accessibilité, en une page

| Geste impossible ou coûteux | Réponse de HemiPad |
|---|---|
| Traverser l'écran avec le pouce | Toutes les commandes sont posées sur des **arcs d'atteinte** centrés sur l'articulation du pouce, calibrables en traçant un geste |
| Maintenir une gâchette | **Appui verrouillant** : un appui active, un appui désactive |
| Appuyer franchement | **Survol prolongé** : poser le doigt et attendre suffit |
| Spasme qui rejoue l'appui | **Anti-rebond** réglable |
| Tremblement pendant la visée | Filtre **one-euro**, qui lisse l'immobilité sans ralentir les gestes francs |
| Utiliser deux sticks | **Visée par inclinaison** en remplacement du stick droit |
| Avancer sans lâcher le stick | **Retour au centre désactivable** |
| Faire ⌘ + ⇧ + P | **Modificateurs collants**, verrouillables par double appui |
| Voir le bouton que le pouce masque | **Retour haptique** distinct par état |

Ces règles ne sont pas des options cosmétiques : la disposition est produite par
un solveur (`ControllerLayout`) qui **réduit la taille des cibles plutôt que
d'en masquer une**, et des tests vérifient, sur cinq tailles d'écran, les deux
mains et les six profils de consoles, qu'aucune commande ne sort de l'écran ni
n'en recouvre une autre.

## Organisation du dépôt

```
ios/                   Application Swift
  HemiPad/
    Accessibility/     Profil hémiplégie, arcs d'atteinte, filtres, appuis
    HID/               Descripteurs et encodeurs de rapports
    Models/            Contrôles, consoles, solveur de disposition
    Transport/         Bluetooth HID, pont réseau, mode démo
    Views/             Écrans SwiftUI
  HemiPadTests/        28 tests unitaires
  tools/               Génération et vérification du projet Xcode
web/                   Site vitrine React + TypeScript
server/                Serveur Express de production
bridge/                Pont USB de référence (Python) et ses tests
docs/                  Déploiement depuis un téléphone
```

## Démarrer

```bash
npm install          # dépendances du site (workspace npm)
npm run dev          # site en développement sur http://localhost:5173
npm test             # tests du solveur de disposition partagé
npm run build        # construction du site
npm start            # serveur de production sur $PORT (3000 par défaut)
```

Côté iOS :

```bash
python3 ios/tools/generate_pbxproj.py     # régénère le projet Xcode
python3 ios/tools/validate_pbxproj.py     # vérifie sa structure
open ios/HemiPad.xcodeproj                # sur un Mac
```

Le fichier `project.pbxproj` est **généré**, jamais édité à la main : ajouter un
fichier Swift depuis un téléphone suffit, la régénération se charge du reste
(et l'intégration continue refuse un projet qui aurait divergé des sources).

## Sans ordinateur

Tout le cycle — écrire, construire, tester, mettre en ligne — se pilote depuis
un téléphone. La marche à suivre est détaillée dans
[docs/deploiement-depuis-le-telephone.md](docs/deploiement-depuis-le-telephone.md) :

- le site part en ligne sur Heroku à chaque commit, via le déploiement
  automatique branché sur GitHub ;
- l'application iOS est compilée et testée par GitHub Actions sur un Mac fourni
  par GitHub, sans qu'aucun Mac ne soit nécessaire de votre côté.

## Licence

MIT. Les noms de consoles appartiennent à leurs détenteurs respectifs ; ce
projet n'est affilié à aucun d'entre eux.
