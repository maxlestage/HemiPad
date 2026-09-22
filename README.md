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
| **Site vitrine** | React 18, TypeScript, Vite, servi par Express · application installable (PWA) |
| **Langues** | Français, anglais, espagnol · thèmes clair, sombre et automatique |
| **Cibles** | Nintendo Switch, PlayStation, Xbox, Steam Deck / PC, émulateurs, ordinateur (clavier) |
| **Appareil de référence** | **iPad** — posé sur une table ou un support, il libère la main du poids de l'appareil et offre des cibles bien plus grandes. L'iPhone est géré, en second. |
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
| Une disposition qui ne convient à personne | **Disposition libre** : chaque commande se déplace au doigt, l'automatique servant de point de départ |
| Un réglage unique pour des commandes différentes | **Chaque commande** a son mode d'appui, sa taille et sa visibilité |
| Des boutons trop serrés | **Espacement réglable** ; à l'étroit, les cibles rétrécissent d'abord, l'espacement ne cède qu'ensuite |
| Une disposition défaite par un geste involontaire | **Verrouillage** d'une commande ou de plusieurs à la fois |
| Porter l'appareil *et* jouer avec la même main | L'**iPad** est l'appareil mis en avant : posé, il ne pèse plus rien et ses cibles sont bien plus grandes |
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

En disposition libre, l'application cesse d'imposer et se contente
d'avertir : les positions choisies sont respectées, simplement ramenées dans
l'écran, et les chevauchements sont signalés au lieu d'être corrigés.

## Le site vitrine

Le site n'est pas qu'une plaquette : il **rejoue le solveur de disposition de
l'application**, porté en TypeScript. Basculer la main ou agrandir les cibles
recalcule vraiment la géométrie, avec les mêmes règles que sur l'iPhone.

- **Trois langues** — français, anglais, espagnol. La langue est détectée
  depuis le navigateur, changeable dans le pied de page, et mémorisée.
- **Trois thèmes** — clair, sombre et automatique (le mode par défaut, qui suit
  le réglage du système). Le thème est appliqué avant le premier rendu, sans
  l'éclair blanc habituel.
- **Application installable** — manifeste, icônes adaptatives, service worker :
  le site s'ajoute à l'écran d'accueil et reste consultable hors connexion.
- **Fiche de partage** — image d'aperçu 1200 × 630 pour les messageries, plus
  un bouton qui utilise le partage natif du téléphone, ou copie le lien.

## Identité visuelle

La marque retenue est **« la moitié manquante »** : une manette dont une moitié
est pleine et l'autre en pointillés. *Hémi*, littéralement — et la moitié
absente n'est pas un manque, c'est ce que l'application remplace. La croix
directionnelle est un **trou** dans le corps, pas une forme posée dessus : un
trou se voit sur n'importe quel fond, une forme peinte suppose de connaître
celui-ci.

Tout part d'un seul fichier, [`web/tools/mark.mjs`](web/tools/mark.mjs) :
l'icône iOS 1024 px, la favicon, les icônes installables, l'image de partage.
Le composant React [`web/src/components/Mark.tsx`](web/src/components/Mark.tsx)
en reprend les tracés, et un test compare les deux fichiers pour qu'ils ne
puissent pas diverger en silence.

Deux variantes, chacune pour une contrainte réelle : la marque complète à
partir de 32 px, et une variante d'onglet en dessous — à 16 px le pointillé
n'est plus qu'une bouillie grise, trois points pleins gardent l'idée.

Les six directions comparées avant le choix restent consultables dans
[`docs/logos/propositions.html`](docs/logos/propositions.html), également servie
par le site à l'adresse `/logos/`. Chaque proposition s'y teste sur fond clair,
sur fond sombre et sur l'écran de l'application, jusqu'à 16 pixels — la taille
où une marque trop détaillée s'effondre.

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

Deux outils demandent en plus un Chromium (via `playwright-core`) et ne sont
donc pas branchés sur l'intégration continue :

```bash
npm run assets       # régénère icônes et image de partage
npm run verify:site  # 67 vérifications dans un vrai navigateur
```

`verify:site` contrôle ce qu'aucun test unitaire ne voit : les trois langues,
les trois thèmes, l'absence de défilement horizontal de 320 à 1280 px,
l'espacement et la taille des cibles, le contraste du texte dans les deux
thèmes, l'installation de l'application, son fonctionnement hors connexion et
la fiche de partage.

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
  par GitHub, sans qu'aucun Mac ne soit nécessaire de votre côté ;
- une *pull request* dont toutes les vérifications passent est **fusionnée
  automatiquement sur `master`** — réservé aux *pull requests* du propriétaire
  du dépôt, et suspendu par l'étiquette `pas-de-fusion-auto`.

## Conditions d'utilisation

**Logiciel propriétaire — tous droits réservés.** HemiPad n'est pas un projet
libre et ne le deviendra pas : aucune licence open source n'est accordée, et
toute reproduction, modification ou redistribution du code demande une
autorisation écrite. Voir [LICENSE.md](LICENSE.md).

Le dépôt peut être consultable sans être libre : la visibilité d'un dépôt et
les droits accordés sur son code sont deux choses distinctes.

Les noms de consoles appartiennent à leurs détenteurs respectifs ; ce projet
n'est affilié à aucun d'entre eux.
