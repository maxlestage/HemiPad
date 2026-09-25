# Le pont USB HemiPad

Un petit boîtier posé près de la console. HemiPad lui envoie les commandes par
le Wi-Fi ; lui se présente à la console comme une manette ordinaire — **par
Bluetooth, ou par le câble USB**, selon ce qui est branché.

C'est la seule façon de sortir de la limite d'iOS : une application iPhone ne
peut ni parler le Bluetooth des manettes (iOS n'expose que le Bluetooth basse
consommation, et pas le profil manette), ni changer ce que le port USB de
l'appareil annonce. Le boîtier, lui, n'a aucune de ces deux contraintes : il
tourne sous Linux, où les deux sont ouverts.

## Sans fil, et sans rien régler

On ne choisit pas le chemin. La règle tient en une phrase : **si une console
est connectée en Bluetooth, tout passe par là ; sinon, par le câble.** Et si
le Bluetooth lâche en pleine partie, le câble reprend au rapport suivant, sans
rien demander.

Le boîtier marche donc avec le Bluetooth seul (aucun câble vers la console),
avec le câble seul, ou avec les deux.

## Ce que ça change vraiment

« Bluetooth depuis l'iPhone » veut dire : l'application seule, sans boîtier.
« Avec le pont » veut dire : par le boîtier, sans fil ou par câble.

| Machine | Bluetooth depuis l'iPhone | Avec le pont |
| --- | --- | --- |
| Windows, Linux, Android | déjà bon | bon aussi |
| Steam Deck, Raspberry Pi | déjà bon | bon aussi |
| **Nintendo Switch** | **refusé** | **devrait marcher, avec ou sans fil** |
| PlayStation 5 | refusé | refusé |
| Xbox Series / One | refusé | refusé |

La Switch accepte les manettes ordinaires, en Bluetooth comme en USB : c'est
elle que le pont débloque. À confirmer sur la vôtre, je n'ai pas pu l'essayer.

La PS5 et la Xbox, non. Elles ne se contentent pas de lire une manette : elles
lui demandent de prouver qu'elle est authentifiée, par une puce que seuls
Sony et Microsoft délivrent à leurs fabricants sous licence. Sans cette
preuve, la manette est ignorée, qu'elle arrive par Bluetooth ou par USB. Ce
n'est pas un obstacle que du code contourne : il faudrait la puce, ou les
secrets qu'elle contient. Pour ces deux consoles, la lecture à distance reste
le chemin — la Xbox se joue déjà dans HemiPad, et la PS5 par un ordinateur.

Autrement dit : « que ça marche avec toutes les consoles » n'est pas atteignable,
ni en Bluetooth ni en USB. Le pont apporte la Switch, et c'est déjà la console
qu'aucun autre chemin n'atteignait.

## Comment c'est fait

Deux morceaux, un seul code :

- **`wire/`** — le format des trames et leur authentification. Compilé en
  bibliothèque statique avec une **ABI C** (`wire/include/hemipad_wire.h`),
  il est appelé aussi bien par le boîtier que par l'application iOS. Une seule
  source, donc aucune chance que les deux bouts cessent d'être d'accord sur un
  octet.
- **`relay/`** — le programme du boîtier : il écoute le réseau, vérifie chaque
  trame, et envoie le rapport par le chemin du moment. Les deux chemins portent
  exactement les mêmes octets de manette ; seul l'emballage change, d'un octet
  d'en-tête que le Bluetooth demande en plus.

Le descripteur HID — la carte que la console lit pour comprendre les octets —
est le même que celui publié en Bluetooth. Les deux copies sont comparées à
chaque intégration continue par `scripts/verifier-descripteur.py` : si l'une
bouge sans l'autre, la vérification échoue.

## Sécurité

Le boîtier écoute sur le réseau local. Sans protection, n'importe qui sur le
même Wi-Fi pourrait lui envoyer des appuis et jouer à votre place. Donc :

- **Un secret partagé** de 32 octets, tiré au sort à l'installation, qui ne
  circule jamais sur le réseau. Chaque trame porte une signature
  HMAC-SHA-256 : sans le secret, on ne peut pas en fabriquer une.
- **Un compteur qui ne recule jamais** : une trame capturée ne peut pas être
  rejouée plus tard.
- **Rien n'est écrit avant vérification.** Une trame refusée n'atteint jamais
  le port USB. Même signée, une trame dont l'en-tête annonce une longueur
  fausse est refusée.
- **Comparaison à durée constante** des signatures : le temps de réponse ne
  laisse rien deviner.
- **Un garde-fou** : si le réseau se tait plus d'une demi-seconde, tout est
  relâché. Une coupure de Wi-Fi avec une gâchette enfoncée laisserait sinon la
  console appuyer indéfiniment — sur un jeu, c'est au mieux agaçant.
- **Le service est enfermé** : aucune capacité, système en lecture seule, un
  seul périphérique autorisé, appels système filtrés (voir
  `systemd/hemipad-relay.service`).
- **Le boîtier n'usurpe l'identité de personne.** Il s'annonce sous le nom
  « HemiPad », avec l'identifiant générique des montages composites Linux.

Le secret est lu depuis `/etc/hemipad/cle`, et le programme **refuse de
démarrer** si ce fichier est lisible par d'autres que son propriétaire.

## Installer le boîtier

Il faut une carte avec du Bluetooth et le mode gadget USB : un Raspberry Pi
Zero 2 W fait très bien l'affaire, et c'est le moins cher. Pour le câble, le
port à utiliser est celui marqué « USB », pas celui de l'alimentation.

```bash
git clone <ce dépôt> && cd HemiPad/bridge
cargo build --release
sudo ./scripts/installer-boitier.sh
sudo reboot
```

L'installation affiche le secret partagé : c'est lui qu'on saisit dans
HemiPad, sur le téléphone.

Après le redémarrage, au choix :

- **sans fil** : cherchez une manette depuis la console, elle verra
  « HemiPad » ;
- **par câble** : branchez la carte au port USB de la console.

Rien d'autre à régler : le boîtier prend le chemin disponible.

Pour vérifier que tout tourne :

```bash
systemctl status hemipad-gadget hemipad-bluetooth hemipad-relay
journalctl -u hemipad-relay -f   # dit par où ça passe à chaque changement
```

## Développer

```bash
cargo test                         # 59 vérifications
cargo clippy --all-targets -- -D warnings
cargo fmt --all --check
./scripts/verifier-abi-c.sh        # l'en-tête C correspond-il à la bibliothèque ?
python3 scripts/verifier-descripteur.py   # le boîtier et l'app décrivent-ils la même manette ?
```

Le contrôle de l'ABI C compte : c'est le seul qui attrape un désaccord entre
`hemipad_wire.h` et le code Rust. Swift passe par cet en-tête, et un écart ne
se verrait autrement qu'à l'exécution, sur l'appareil.

## Le format des trames

```text
position  taille  contenu
0         4       « HPB1 », la marque et la version du format
4         1       identifiant de rapport (1 manette, 2 clavier)
5         1       longueur utile (9 pour la manette, 8 pour le clavier)
6         2       réservé, à zéro
8         8       compteur, en gros-boutiste
16        12      charge utile, complétée de zéros
28        16      signature : les 16 premiers octets du HMAC des 28 premiers
```

Total : 44 octets, toujours. Une trame d'une autre taille est refusée sans
être lue.

Ce que le boîtier écrit ensuite, une fois la trame vérifiée :

```text
par le câble USB   [identifiant de rapport][charge utile]        10 octets
par le Bluetooth   [0xA1][identifiant de rapport][charge utile]  11 octets
```

L'octet `0xA1` est l'en-tête HIDP d'un rapport d'entrée. Un octet d'écart, mais
qui décide si la console comprend ou ignore.
