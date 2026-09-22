# Lancer un build iOS — depuis le téléphone, sans ordinateur

Ce document est une marche à suivre, pas un survol. À la fin, HemiPad tourne
sur votre iPhone et sur votre iPad, installée par TestFlight, et chaque nouvelle
version se livre en appuyant sur un bouton.

Tout ce qui demande habituellement un Mac — compiler, signer, créer les
certificats — est fait par le Mac que GitHub prête à chaque exécution. Ce qui
vous reste tient dans Safari et dans deux applications Apple gratuites.

---

## Étape 0 — Ce que vous pouvez voir aujourd'hui, sans rien payer

Avant toute histoire de compte payant, deux choses fonctionnent déjà.

### Les tests tournent à chaque modification

Le workflow **Intégration continue** et le workflow **Application iOS**
compilent le code Swift et passent les tests sur un Mac, à chaque pull request.
C'est déjà la preuve que le projet compile.

### Voir l'application tourner, en images

Le workflow **Aperçu dans le simulateur** lance réellement HemiPad dans un
simulateur et rapporte des captures d'écran. Pour le déclencher depuis le
téléphone :

1. ouvrez `github.com/maxlestage/HemiPad` dans Safari ;
2. onglet **Actions** → **Aperçu dans le simulateur** ;
3. bouton **Run workflow** ;
4. choisissez l'appareil (`iPad`, `iPhone 15`, `iPhone SE`…) et le thème ;
5. cinq à dix minutes plus tard, les captures sont dans les **Artifacts** de
   l'exécution, en bas de la page.

C'est gratuit, illimité, et c'est le bon réflexe avant chaque livraison : on
voit ce qu'on s'apprête à envoyer.

> **Et l'installer sur un vrai iPhone gratuitement ?** Non. Une signature avec
> un identifiant Apple gratuit dure sept jours et exige un Mac ou un ordinateur
> sous Windows pour transférer l'application. Il n'existe aucun chemin
> téléphone-seulement sans compte payant. Autant le savoir maintenant que
> l'apprendre après deux heures d'essais.

---

## Étape 1 — Le compte développeur Apple

**99 € par an.** C'est la seule dépense, et elle est incontournable pour
installer l'application sur un appareil qui vous appartient.

L'inscription se fait entièrement depuis le téléphone, avec l'application
**Apple Developer** (gratuite sur l'App Store) : onglet **Account** →
**Enroll**. Il faut un identifiant Apple avec l'authentification à deux
facteurs, et une pièce d'identité. Comptez de quelques heures à deux jours pour
la validation — c'est le seul moment où il faut attendre quelqu'un.

Une fois le compte actif, notez votre **Team ID** : dans Safari sur
`developer.apple.com/account` → **Membership details**. Dix caractères, du
genre `A1B2C3D4E5`. C'est le premier des quatre secrets.

---

## Étape 2 — La clé d'API App Store Connect

C'est elle qui autorise le Mac de GitHub à signer et à envoyer en votre nom,
sans jamais manipuler votre mot de passe.

Dans Safari, sur `appstoreconnect.apple.com` (demandez « Version pour
ordinateur » si la page vous paraît trop réduite) :

1. **Users and Access** → onglet **Integrations** → **App Store Connect API** ;
2. **Team Keys** → bouton **+** ;
3. nom : `HemiPad CI` ; accès : **App Manager** — un rôle inférieur ne peut pas
   envoyer de build ;
4. **Generate**.

La page affiche alors trois choses :

| Ce que vous voyez | Ce que ça devient |
|---|---|
| **Issuer ID** (un UUID, en haut de la page) | secret `APPLE_API_ISSUER_ID` |
| **Key ID** (dix caractères, sur la ligne de la clé) | secret `APPLE_API_KEY_ID` |
| Le fichier `AuthKey_XXXXXXXXXX.p8` à télécharger | secret `APPLE_API_KEY_P8` |

> **Le fichier .p8 ne se télécharge qu'une seule fois.** Apple ne le redonne
> jamais. Téléchargez-le, ouvrez-le dans l'app Fichiers, et gardez-le dans un
> endroit sûr — un gestionnaire de mots de passe, pas la pellicule photo. Si
> vous le perdez, il faut révoquer la clé et en créer une autre : ce n'est pas
> un drame, mais c'est dix minutes à refaire.

Pour lire son contenu depuis le téléphone : Fichiers → appui long sur le
`.p8` → **Partager** → **Copier**. Ou ouvrez-le avec une application de texte.
Le contenu commence par `-----BEGIN PRIVATE KEY-----`.

---

## Étape 3 — Les quatre secrets dans GitHub

Dans Safari, sur `github.com/maxlestage/HemiPad` (l'application GitHub ne sait
pas gérer les secrets, il faut passer par le navigateur) :

**Settings** → **Secrets and variables** → **Actions** → **New repository
secret**, quatre fois :

| Nom du secret | Valeur | Où la trouver |
|---|---|---|
| `APPLE_TEAM_ID` | `A1B2C3D4E5` | developer.apple.com → Membership details |
| `APPLE_API_ISSUER_ID` | un UUID | App Store Connect → Integrations, en haut |
| `APPLE_API_KEY_ID` | dix caractères | App Store Connect → la ligne de la clé |
| `APPLE_API_KEY_P8` | tout le fichier `.p8` | le fichier téléchargé |

Pour `APPLE_API_KEY_P8`, collez le contenu **entier**, lignes
`-----BEGIN PRIVATE KEY-----` et `-----END PRIVATE KEY-----` comprises, sans
rien ajouter autour. Le workflow vérifie la première ligne et s'arrête tout de
suite si le collage s'est mal passé — plutôt que d'échouer dix minutes plus
tard sur une erreur d'authentification incompréhensible.

---

## Étape 4 — Le premier build, sans envoi

Ce premier passage sert à créer, côté Apple, l'identifiant d'application et le
certificat de distribution. `xcodebuild` s'en charge seul, en s'authentifiant
avec la clé : c'est le rôle de l'option `-allowProvisioningUpdates`.

1. Safari → onglet **Actions** → **Livraison TestFlight** → **Run workflow** ;
2. **décochez « Envoyer sur TestFlight »** ;
3. lancez.

Comptez dix à vingt minutes. À la fin, l'exécution doit être verte et un
fichier `.ipa` doit apparaître dans les **Artifacts**. Si c'est le cas, toute
la chaîne de signature fonctionne : c'est le passage difficile, et il est
derrière vous.

---

## Étape 5 — Créer la fiche de l'application

TestFlight a besoin d'une fiche, même pour un envoi privé.

Sur `appstoreconnect.apple.com` → **Apps** → **+** → **New App** :

| Champ | Valeur |
|---|---|
| Plateformes | iOS |
| Nom | `HemiPad` (s'il est pris, `HemiPad — manette à une main`) |
| Langue principale | Français |
| Bundle ID | `app.hemipad` — il apparaît dans la liste depuis l'étape 4 |
| SKU | `hemipad-001`, ou ce que vous voulez : c'est votre référence interne |
| Accès utilisateur | Accès complet |

Le nom doit être unique sur tout l'App Store. S'il est refusé, choisissez-en un
autre : il ne s'agit que du nom de la fiche, celui qui s'affiche sous l'icône
sur l'écran d'accueil reste `HemiPad`.

---

## Étape 6 — La livraison

Retour dans **Actions** → **Livraison TestFlight** → **Run workflow**, cette
fois **en laissant « Envoyer sur TestFlight » coché**.

Le workflow valide l'archive avant de l'envoyer : une erreur de conformité se
voit en trente secondes, pas une heure plus tard par courriel.

Puis, sur `appstoreconnect.apple.com` → votre application → onglet
**TestFlight** :

1. le build apparaît après le traitement d'Apple — de cinq à trente minutes ;
2. **Internal Testing** → créez un groupe, ajoutez-vous comme testeur (jusqu'à
   100 personnes, aucune relecture par Apple) ;
3. installez **TestFlight** sur votre iPhone et votre iPad, et HemiPad s'y
   installe comme n'importe quelle application.

Un build TestFlight reste installable 90 jours. Passé ce délai, relancez le
workflow : le numéro de build s'incrémente tout seul.

---

## À partir de là

**Livrer une nouvelle version** : appuyez sur **Run workflow**. Le numéro de
build vaut le numéro d'exécution du workflow, il ne recule jamais.

**Livrer automatiquement** : une étiquette Git suffit. Poussez un tag
`v1.0.1` et la livraison part toute seule — le déclencheur est déjà en place.

**Changer le numéro de version affiché** : le champ « Version » du formulaire
(`1.1.0`, par exemple), ou durablement `MARKETING_VERSION` dans
`ios/tools/generate_pbxproj.py`.

---

## Ce qui peut coincer, et quoi faire

| Symptôme | Cause habituelle | Remède |
|---|---|---|
| `Secrets manquants : …` | un secret n'a pas été enregistré | étape 3 ; les noms sont sensibles à la casse |
| `APPLE_API_KEY_P8 ne ressemble pas à une clé` | collage partiel ou reformaté | recollez le fichier entier, sans guillemets |
| `Authentication credentials are missing or invalid` | la clé n'a pas le rôle App Manager | recréez-la avec le bon rôle |
| `No profiles for 'app.hemipad' were found` | première exécution interrompue | relancez : le profil se crée au passage |
| `You have reached the maximum number of certificates` | limite Apple atteinte (2 ou 3) | developer.apple.com → Certificates → révoquez les anciens |
| `The bundle version must be higher than…` | deux envois avec le même numéro | relancez le workflow, le numéro suit l'exécution |
| `App Name is already in use` | le nom est pris sur l'App Store | choisissez-en un autre à l'étape 5 |
| Les captures de l'aperçu sont noires | l'application n'a pas démarré | lisez `journal-hemipad.txt` dans les artifacts |

---

## Pourquoi ces choix

**Pas d'outil tiers.** Ni fastlane, ni action du Marketplace pour la signature.
`xcodebuild` sait créer les certificats et les profils tout seul depuis Xcode 13
avec `-allowProvisioningUpdates`. Une dépendance de moins, c'est une chose de
moins à mettre à jour, et une chose de moins à qui confier une clé de signature.

**Pas de certificat stocké dans le dépôt.** Aucune clé privée n'y figure.
Apple crée le certificat, le Mac de GitHub l'utilise, la machine est détruite à
la fin de l'exécution. Le seul élément durable est la clé d'API, révocable en
deux touches si elle fuite.

**Xcode Cloud n'est pas utilisé.** Il est excellent, mais sa configuration
initiale exige l'application Xcode, donc un Mac. Il n'aurait pas tenu la règle
du projet : tout depuis le téléphone.

**Le numéro de build vient du workflow.** C'est la seule source qui ne recule
jamais et qui ne demande rien à personne — ni fichier à modifier, ni commit
supplémentaire depuis un téléphone.

---

## Trois corrections faites au passage

Le projet n'aurait pas passé la validation d'Apple en l'état. Trois points, tous
dans `ios/HemiPad/Resources/Info.plist` :

- `UIRequiredDeviceCapabilities` déclarait **`armv7`**, une architecture 32 bits
  qu'aucun appareil sous iOS 16 ne possède. Corrigé en `arm64`.
- `CFBundleVersion` valait `1` en dur. Il vaut désormais
  `$(CURRENT_PROJECT_VERSION)`, que le workflow fixe à chaque envoi : sans cela,
  le deuxième envoi aurait été refusé.
- `ITSAppUsesNonExemptEncryption` est déclaré à `false` — l'application n'emploie
  aucun chiffrement propre. Sans cette clé, App Store Connect pose la question à
  la main après **chaque** envoi.

Un point reste à surveiller : `UIRequiresFullScreen` est à `true`. C'est
justifié pour une manette, qui n'a aucun sens dans une fenêtre partagée, mais
les versions récentes d'iPadOS poussent les applications à accepter le
redimensionnement. À reconsidérer le jour d'une publication publique sur l'App
Store ; sans incidence sur TestFlight.
