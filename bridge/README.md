# Pont HemiPad

Le pont reçoit les rapports HID de l'iPhone par Wi-Fi et les rejoue sur le port
USB de la console ou de l'ordinateur. Il existe parce qu'iOS réserve une partie
du profil HID *over GATT* : quand le système refuse que l'iPhone s'annonce
lui-même comme manette, le pont prend le relais **sans rien changer à
l'application** — ce sont les mêmes descripteurs et les mêmes octets.

## Matériel

N'importe quelle carte Linux capable de se présenter comme périphérique USB :
Raspberry Pi Zero / Zero 2 W, Pi 4 (port USB-C en mode OTG), ou toute carte
gérant `libcomposite`.

## Installation

```bash
sudo apt install python3-pip
pip install websockets
sudo modprobe libcomposite
```

Créez ensuite un gadget USB HID exposant `/dev/hidg0`, avec le descripteur
que le pont lui-même imprime :

```bash
python3 hemipad_bridge.py --descripteur > /tmp/hemipad.desc
```

Ce descripteur décrit un périphérique composite : manette (identifiant de
rapport 1) et clavier (identifiant 2).

## Lancement

```bash
python3 hemipad_bridge.py                 # écoute sur ws://0.0.0.0:8787
python3 hemipad_bridge.py --essai-a-blanc # affiche les rapports sans rien écrire
```

Dans l'application : onglet **Connexion** → *Pont HemiPad* → adresse
`ws://adresse-du-pont:8787`. Si le pont s'annonce en Bonjour (`_hemipad._tcp`),
il apparaît directement dans la liste.

## Protocole

Une trame binaire par rapport, volontairement décodable sans allocation par un
microcontrôleur :

```
octet 0      0x48, en-tête
octet 1      identifiant de rapport (1 = manette, 2 = clavier)
octet 2      longueur de la charge utile
octets 3...n charge utile HID brute
```

Longueurs attendues : 9 octets pour la manette, 8 pour le clavier. Toute trame
qui s'en écarte est ignorée : rejouer un rapport douteux, c'est risquer un
bouton bloqué au milieu d'une partie.

Le pont répond `ready` dès que le gadget USB est énuméré côté hôte ;
l'application n'émet qu'à partir de ce moment. À la déconnexion, le pont
relâche toutes les commandes — sticks au centre, boutons relevés, clavier vide.

## Tests

```bash
python3 test_bridge.py
```

Ils couvrent le décodage des trames et, surtout, vérifient que les descripteurs
HID du pont sont **identiques** à ceux de l'application Swift. Deux
descripteurs qui divergent donnent une manette qui marche « presque » : le pire
des symptômes à diagnostiquer.
