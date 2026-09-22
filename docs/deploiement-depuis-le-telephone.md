# Tout faire depuis un téléphone

Ce document décrit le cycle complet — modifier, vérifier, mettre en ligne —
sans jamais ouvrir un ordinateur. C'est une contrainte du projet, pas un
exercice de style : une application pensée pour une main l'est rarement depuis
un poste de travail à deux écrans.

---

## 1. Mettre le site en ligne sur Heroku

### La voie la plus courte : le bouton

Depuis le navigateur du téléphone, ouvrez le dépôt et touchez **Deploy to
Heroku**. Heroku lit `app.json`, crée l'application, installe les dépendances,
construit le site et le démarre. Rien d'autre à renseigner.

Lien direct :
`https://heroku.com/deploy?template=https://github.com/maxlestage/HemiPad`

### La voie durable : le déploiement automatique

Le bouton crée l'application une fois ; le déploiement automatique la met à
jour à chaque commit. À faire **une seule fois**, depuis le navigateur mobile :

1. `dashboard.heroku.com` → votre application → onglet **Deploy**.
2. *Deployment method* → **GitHub**, puis autoriser l'accès.
3. Chercher `HemiPad`, toucher **Connect**.
4. Section *Automatic deploys* → choisir la branche `master` → **Enable
   Automatic Deploys**.
5. Cocher *Wait for CI to pass before deploy* : la mise en ligne n'aura lieu
   que si les tests passent.

À partir de là, chaque commit poussé depuis GitHub Mobile, github.dev ou Claude
Code met le site à jour tout seul.

### Ce que Heroku exécute

| Étape | Fichier | Commande |
|---|---|---|
| Installation | `package.json` | `npm install` (workspaces) |
| Construction | `package.json` | `heroku-postbuild` → `npm run build --workspace=web` |
| Démarrage | `Procfile` | `node server/index.mjs` |

La variable `PORT` est fournie par Heroku ; aucune autre n'est nécessaire.
`NPM_CONFIG_PRODUCTION=false` (déjà dans `app.json`) garantit que Vite et
TypeScript sont installés au moment de la construction.

### Vérifier que tout va bien

- `https://votre-app.herokuapp.com/healthz` renvoie `{"status":"ok","build":true}`.
- `build: false` signifie que le dossier `web/dist` est absent : la
  construction a échoué, les journaux sont dans l'onglet *More → View logs*.

### Si vous préférez déclencher la mise en ligne depuis GitHub

Le workflow `.github/workflows/deploiement-heroku.yml` pousse vers Heroku quand
les secrets `HEROKU_API_KEY` et `HEROKU_APP_NAME` existent. Ils s'ajoutent
depuis le navigateur : *Settings → Secrets and variables → Actions → New
repository secret*. Sans ces secrets, le workflow ne fait rien et ne signale
aucune erreur.

### Fusion automatique sur `master`

Le workflow `.github/workflows/fusion-automatique.yml` fusionne une *pull
request* dès que **toutes** ses vérifications sont terminées et réussies. Il
n'y a donc plus rien à toucher : on pousse, la CI passe, la branche arrive sur
`master`, et Heroku met le site en ligne.

Deux garde-fous :

- **seules les *pull requests* ouvertes par le propriétaire du dépôt** sont
  fusionnées. Sans cette règle, sur un dépôt public, n'importe qui pourrait
  faire entrer son code sur `master` sans relecture ;
- **l'étiquette `pas-de-fusion-auto`** suspend la fusion d'une *pull request*
  précise, le temps d'y réfléchir. Elle s'ajoute depuis GitHub Mobile.

Pour fusionner à la demande : *Actions → Fusion automatique → Run workflow*,
en laissant le champ vide (toutes celles qui sont prêtes) ou en indiquant un
numéro.

Le workflow se déclenche à la fin de chaque vérification — y compris celles de
GitHub Actions, via `workflow_run`. C'est le déclencheur prévu pour cela :
GitHub refuse qu'une suite de vérifications créée par ses propres actions
redéclenche un workflow, protection anti-boucle qui rendrait la fusion
automatique aveugle à la compilation iOS.

Deux conséquences à connaître :

1. une fusion faite par le jeton d'Actions **ne relance pas** les workflows sur
   `master` — c'est une protection de GitHub contre les boucles. Les
   vérifications de la *pull request* font foi ;
2. le déploiement Heroku, lui, **continue de partir** : il passe par un
   webhook, pas par GitHub Actions.

Pour désactiver la fusion automatique : supprimer le fichier du workflow, ou
le désactiver dans *Actions → Fusion automatique → ⋯ → Disable workflow*.

---

## 2. Modifier le code depuis le téléphone

| Outil | Ce qu'il permet | Remarque |
|---|---|---|
| **GitHub Mobile** | Lire, éditer un fichier, commiter, ouvrir une *pull request* | Le plus direct pour une correction |
| **github.dev** | Remplacer `github.com` par `github.dev` dans l'URL : un éditeur complet dans le navigateur | Recherche multi-fichiers, arborescence |
| **Claude Code sur le web** | Décrire la modification, relire le diff, pousser | Pratique quand la modification touche plusieurs fichiers |
| **Working Copy** (iOS) | Client Git complet, hors ligne | Payant pour l'écriture |

Après avoir ajouté ou supprimé un fichier Swift, **régénérez le projet Xcode**.
Depuis le téléphone, sans Python sous la main : onglet *Actions* → workflow
**Projet Xcode régénérable**. S'il échoue, c'est que `project.pbxproj` ne
correspond plus aux sources ; demandez la régénération (`python3
ios/tools/generate_pbxproj.py`) dans une session Claude Code, ou lancez-la
depuis n'importe quelle machine disposant de Python.

---

## 3. Compiler et tester l'application iOS sans Mac

Le workflow `.github/workflows/ios.yml` s'exécute sur un **Mac fourni par
GitHub** (`macos-14`). Il compile l'application et lance les 28 tests
unitaires — dont ceux qui vérifient qu'aucune commande ne sort de l'écran.

- Il part tout seul à chaque *pull request* touchant `ios/`.
- On peut aussi le lancer à la main : *Actions* → **Application iOS** → *Run
  workflow*.
- En cas d'échec, l'onglet *Summary* contient le rapport `resultats.xcresult`.

Les minutes macOS sont gratuites tant que le dépôt est public. S'il passe en
privé — ce qui est cohérent avec un projet propriétaire —, elles sont décomptées
du quota du compte (au tarif macOS, dix fois celui de Linux) : mieux vaut alors
lancer ce travail à la main plutôt qu'à chaque *pull request*.

Un dépôt privé désactive aussi le bouton « Deploy to Heroku », qui a besoin de
télécharger l'archive du dépôt. Le déploiement automatique décrit plus haut,
lui, continue de fonctionner : il passe par la connexion GitHub autorisée dans
le tableau de bord Heroku.

### Installer l'application sur votre iPhone

Compiler ne suffit pas à installer : il faut signer. Trois voies, de la plus
simple à la plus engageante :

1. **TestFlight par GitHub Actions.** Ajoutez une étape `xcodebuild archive`
   puis `xcrun altool --upload-app`, avec une clé App Store Connect stockée en
   secret. C'est la seule voie entièrement téléphonique, mais elle suppose un
   compte développeur Apple (99 €/an).
2. **Swift Playgrounds sur iPad.** L'application s'y ouvre et s'y installe
   directement, sans Mac. Il faut alors ajouter les fichiers à un projet
   Playgrounds plutôt qu'au projet Xcode.
3. **Un Mac emprunté, une fois.** Ouvrir `ios/HemiPad.xcodeproj`, choisir une
   équipe de signature, lancer sur l'appareil. Une application signée avec un
   compte gratuit reste installée sept jours.

---

## 4. Brancher un pont, si le Bluetooth est refusé

Voir [`bridge/README.md`](../bridge/README.md). Le boîtier se configure une
fois par SSH depuis le téléphone (Termius, Blink, Shelly), puis se contente de
démarrer avec la console.

---

## Récapitulatif

| Tâche | Depuis le téléphone |
|---|---|
| Modifier le site ou l'application | GitHub Mobile, github.dev, Claude Code |
| Vérifier le site | Actions → *Intégration continue* |
| Vérifier l'application iOS | Actions → *Application iOS* (Mac de GitHub) |
| Mettre le site en ligne | Automatique à chaque commit, ou bouton Heroku |
| Surveiller la production | `/healthz` et les journaux Heroku |
