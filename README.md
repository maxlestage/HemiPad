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
| **Site vitrine** | Rust (Yew 0.23), compilé en WebAssembly, film de particules WebGL2, servi par Express · application installable (PWA) |
| **Langues** | Français, anglais, espagnol · thèmes clair, sombre et automatique |
| **Cibles** | Nintendo Switch, PlayStation, Xbox, Steam Deck / PC, émulateurs, ordinateur (clavier) |
| **Appareil de référence** | **iPad** — posé sur une table ou un support, il libère la main du poids de l'appareil et offre des cibles bien plus grandes. L'iPhone est géré, en second. |
| **Mise en ligne** | Heroku, pilotable à 100 % depuis un téléphone |

---

## Ce que l'application fait réellement

L'iPhone ou l'iPad produit des **rapports HID standards** — ceux qu'envoie
n'importe quelle manette ou clavier — et les émet lui-même en **Bluetooth**
(*HID over GATT*) : il s'annonce comme une manette nommée HemiPad. Aucun
boîtier, aucun câble, rien à acheter.

> **Ce qu'Apple et les consoles imposent.** iOS refuse aux applications
> l'identifiant court du service HID (0x1812) : HemiPad le publie sous sa forme
> longue de 128 bits, la même valeur pour la machine. Le nom affiché après
> l'appairage reste celui de l'appareil — l'application propose de le renommer
> « HemiPad ». Le Bluetooth classique n'est pas ouvert aux applications, et
> Switch, PS5 et Xbox n'acceptent en Bluetooth que leurs propres manettes :
> HemiPad vise les ordinateurs (Windows, Linux) et Android. Aucune connexion
> filaire n'est possible : iOS ne laisse aucune application changer ce que le
> port USB annonce.

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

Le site est écrit en **Rust, avec Yew**, et compilé en **WebAssembly**. Ce
n'est pas qu'une plaquette : il **rejoue le solveur de disposition de
l'application**, porté en Rust (`web/src/solveur.rs`, couvert par ses propres
tests). Basculer la main ou agrandir les cibles recalcule vraiment la
géométrie, avec les mêmes règles que sur l'iPhone.

- **Trois langues** — français, anglais, espagnol (`web/i18n/*.json`). La
  langue est détectée depuis le navigateur, changeable dans le pied de page, et
  mémorisée.
- **Trois thèmes** — clair, sombre et automatique (le mode par défaut, qui suit
  le réglage du système). Le thème est appliqué avant le premier rendu, sans
  l'éclair blanc habituel.
- **Application installable** — manifeste, icônes adaptatives, service worker :
  le site s'ajoute à l'écran d'accueil et reste consultable hors connexion, le
  programme WebAssembly compris.
- **Fiche de partage** — image d'aperçu 1200 × 630 pour les messageries, plus
  un bouton qui utilise le partage natif du téléphone, ou copie le lien.
- **Des commandes qui glissent** — dans la démonstration, changer de main ou
  écarter les cibles fait *voyager* les commandes au lieu de les téléporter :
  on voit le solveur travailler.
- **« Suivant »** — un bouton centré en bas de l'écran, atteignable par l'un
  ou l'autre pouce, descend d'une section à la suivante ; au bout de la page,
  il remonte. Pour qui n'a qu'un pouce qui se fatigue, un appui répété au même
  endroit remplace une longue suite de glissements.

### Le mouvement

L'ouverture se joue comme un court film, piloté par le défilement :

- **La porte** — pendant que le programme se charge, le signe HemiPad se
  trace trait par trait, un compteur monte jusqu'à 100, puis la porte se lève.
  Elle est en CSS pur : elle s'anime avant même que le WebAssembly arrive, et
  s'ouvre d'elle-même s'il n'arrivait jamais.
- **Le film de grains** — quatorze mille particules (sept mille sur
  téléphone), dessinées en WebGL2, passent d'une forme à l'autre au fil du
  défilement : la marque, une main, une manette, l'arc du pouce, un clavier,
  des ondes, puis l'appareil choisi avec la disposition que le solveur calcule
  pour la main choisie. Cinq phrases viennent se poser, mot à mot, à chaque
  étape. Le pointeur écarte les grains ; sur téléphone, ils peuvent suivre
  l'inclinaison (iOS ne donne les capteurs qu'à la demande : d'où un bouton).
- **Les détails d'atelier** — un grain de pellicule, un curseur dessiné qui
  grossit sur ce qui se clique, des boutons aimantés qui se laissent attirer
  par le pointeur, un défilement adouci à la molette, des titres qui montent
  mot à mot.

Animer un site qui parle d'accessibilité demande quelques garanties, et elles
sont toutes tenues :

- **« Réduire les animations » est respecté.** Ni film, ni porte, ni grain :
  les cinq phrases se lisent d'un bloc et l'accueil montre une image fixe qui
  dessine **la même disposition**, issue du même solveur. Un réglage explicite
  — *Animations : automatique, animées, apaisées* — est offert dans le pied de
  page, dans les deux sens.
- **WebGL absent** : même repli, sans erreur.
- **Le doigt garde son défilement.** Le défilement adouci et le curseur ne
  s'allument qu'avec une souris ou un trackpad ; au doigt, rien n'est
  détourné, et le clavier, la barre de défilement et les ancres restent natifs.
- **Le film s'arrête de dessiner** dès qu'il sort de l'écran.
- **L'apparition des blocs ne cache rien.** L'état masqué n'existe que si le
  programme a pris la main ; sans lui, tout s'affiche d'emblée.
- **Aucun script en ligne.** La politique de sécurité n'autorise que les
  fichiers du site, plus `'wasm-unsafe-eval'` — la compilation du
  WebAssembly, pas `eval()`. Les styles en ligne restent interdits, attributs
  compris : les couleurs par profil passent par des attributs `data-*` et des
  règles CSS.

Ces garanties sont vérifiées dans un vrai navigateur : chaque étape du film
affiche sa phrase et elle seule, les grains **bougent réellement** (deux
captures espacées doivent différer), la porte se lève — même si le programme
ne se charge pas —, le réglage « apaisées » arrête le film et survit au
rechargement, une commande **glisse au lieu de sauter** quand on change de
main, et « Suivant » arrive exactement au début de chaque section, sur
téléphone comme sur iPad.

### Construction

Pas de Trunk : son chargeur est un script en ligne, que la politique de
sécurité refuse. [`web/tools/construire.mjs`](web/tools/construire.mjs)
compile la crate pour `wasm32-unknown-unknown`, génère les liaisons avec
`wasm-bindgen` (la version exacte de la crate, téléchargée et vérifiée par son
empreinte si elle manque), assemble la feuille de style et les polices servies
par le site lui-même, et écrit `index.html` avec des noms de fichiers qui
changent à chaque version. La version de Rust est figée par
`web/rust-toolchain.toml`.

## Identité visuelle

La marque retenue est **« la moitié manquante »** : une manette dont une moitié
est pleine et l'autre en pointillés. *Hémi*, littéralement — et la moitié
absente n'est pas un manque, c'est ce que l'application remplace. La croix
directionnelle est un **trou** dans le corps, pas une forme posée dessus : un
trou se voit sur n'importe quel fond, une forme peinte suppose de connaître
celui-ci.

Tout part d'un seul fichier, [`web/tools/mark.mjs`](web/tools/mark.mjs) :
l'icône iOS 1024 px, la favicon, les icônes installables, l'image de partage.
Le site en reprend les tracés ([`web/src/composants/commun.rs`](web/src/composants/commun.rs),
et la porte d'entrée de `web/index.html`), et un test Rust compare les trois
exemplaires pour qu'ils ne puissent pas diverger en silence.

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
    Transport/         Bluetooth HID, mode démo
    Storage/           Machines connues, en SQLite
    Views/             Écrans SwiftUI
  HemiPadTests/        58 tests unitaires
  tools/               Génération et vérification du projet Xcode
web/                   Site vitrine Rust (Yew) → WebAssembly
server/                Serveur Express de production
docs/                  Déploiement depuis un téléphone
```

## Démarrer

```bash
rustup toolchain install  # dans web/ : la version de Rust et la cible wasm32
npm install          # polices et serveur (workspace npm)
npm test             # tests Rust : solveur, clavier, traductions, formes
npm run lint         # clippy (sans la moindre alerte) et rustfmt
npm run build        # construction du site, optimisée
npm run dev          # construction rapide, sans optimisation
npm start            # serveur de production sur $PORT (3000 par défaut)
```

Deux outils demandent en plus un Chromium (via `playwright-core`) ;
`verify:site` tourne aussi en intégration continue :

```bash
npm run assets       # régénère icônes et image de partage
npm run verify:site  # près de trois cents vérifications dans un vrai navigateur
```

`verify:site` contrôle ce qu'aucun test unitaire ne voit : les trois langues,
les trois thèmes, l'absence de défilement horizontal de 320 à 1280 px,
l'espacement et la taille des cibles, le contraste du texte dans les deux
thèmes, l'installation de l'application, son fonctionnement hors connexion, la
fiche de partage, le film et ses étapes, la porte, le curseur et les animations
apaisées.

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
- elle se livre sur **TestFlight** d'un appui sur un bouton, signature et
  certificats compris — la marche à suivre complète est dans
  [docs/build-ios-depuis-le-telephone.md](docs/build-ios-depuis-le-telephone.md) ;
- le workflow **Aperçu dans le simulateur** lance l'application sur un Mac
  distant et rapporte des captures d'écran : de quoi voir l'interface tourner
  sans compte développeur et sans rien payer ;
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
