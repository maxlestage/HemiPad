# Sécurité de HemiPad

Ce qui protège le projet, et ce qui reste à régler à la main dans GitHub.

## Application iOS

- **Aucune frappe sans appairage.** Les rapports manette et clavier exigent un
  lien chiffré, pour les lire *et* pour s'y abonner
  (`.notifyEncryptionRequired`). Un appareil voisin non appairé ne reçoit
  rien ; l'appairage passe par la confirmation de la personne.
- **Tout le service HID est chiffré** : informations, mode de protocole, point
  de contrôle.
- **Une seule machine reçoit ce qui est tapé** : la dernière connectée. Deux
  ordinateurs appairés en même temps ne voient pas tous deux les frappes, et
  une machine qui arrive ne relit jamais la dernière touche d'une autre.
- **Services d'une ancienne version** repris par le système sans ces
  protections : ils sont republiés, jamais réutilisés.
- **Aucune donnée ne quitte l'appareil** : pas de réseau, pas de journal des
  frappes. Le registre des machines (SQLite) est exclu des sauvegardes ; ses
  requêtes sont toutes paramétrées.

### Lecture à distance Xbox (dans l'application)

- La page ne peut naviguer qu'en HTTPS, vers les domaines de la Xbox et du
  compte Microsoft ; tout autre lien s'ouvre dans Safari, hors de HemiPad.
- La manette virtuelle n'est injectée que sur xbox.com, et ne reçoit que des
  nombres (boutons, axes) ; la page ne peut rien demander à l'application.
- Des tests vérifient la liste des domaines, le script injecté (exécuté dans
  JavaScriptCore) et que WebKit voit bien les garde-fous de navigation.

## Le boîtier (pont USB et Bluetooth)

Le boîtier écoute sur le réseau local : sans protection, n'importe qui sur le
même Wi-Fi pourrait jouer à votre place.

- **Secret partagé** de 32 octets tiré au sort à l'installation, qui ne
  circule jamais sur le réseau. Chaque trame porte une signature
  HMAC-SHA-256 ; sans le secret, on ne peut pas en fabriquer une.
- **Compteur qui ne recule jamais** : une trame capturée ne peut pas être
  rejouée.
- **Rien n'est écrit avant vérification** : une trame refusée n'atteint jamais
  le port USB, et même signée, une trame dont l'en-tête annonce une longueur
  fausse est refusée.
- **Signatures comparées à durée constante** : le temps de réponse ne laisse
  rien deviner.
- **Garde-fou** : après une demi-seconde de silence, tout est relâché — une
  coupure de Wi-Fi ne laisse pas une gâchette enfoncée.
- **Service enfermé** : aucune capacité, système en lecture seule, un seul
  périphérique autorisé, appels système filtrés.
- **Le secret est refusé** s'il est lisible par d'autres que son propriétaire.
- **Le boîtier n'usurpe l'identité de personne** : il s'annonce sous le nom
  « HemiPad », en USB comme en Bluetooth, avec l'identifiant générique des
  montages composites Linux.
- **La liaison Bluetooth vers la console est chiffrée et appairée** :
  l'enregistrement du profil l'exige, et le service n'a le droit qu'aux
  familles de sockets qu'il utilise vraiment.

Le détail est dans `bridge/README.md`.

## Site

- **Politique de sécurité (CSP) stricte** : scripts, styles, polices et images
  viennent du site seul ; aucun script en ligne. Les polices sont servies par
  le site, plus aucune requête vers Google.
- **HTTPS imposé** (redirection et HSTS), **pas d'affichage dans un cadre**,
  `nosniff`, `Referrer-Policy`, `Permissions-Policy` (caméra, micro, position…
  coupés ; gyroscope gardé pour l'inclinaison), `Cross-Origin-Opener-Policy`.
- **Erreurs muettes** : le visiteur ne voit jamais un message interne.
- **Service worker** : ne met en cache que le site lui-même.
- Tout cela est vérifié à chaque pull request par `web/tools/verify-site.mjs`,
  y compris l'absence de toute ressource refusée par la CSP.

## Intégration continue

- Chaque workflow n'a que les droits dont il a besoin ; les actions sont
  épinglées par empreinte (SHA), mises à jour par Dependabot.
- **Fusion automatique** : seulement les pull requests du propriétaire, depuis
  ce dépôt, avec les vérifications essentielles présentes *par leur nom* et
  au vert. Une pull request qui touche `.github/` n'est jamais fusionnée
  automatiquement.
- Déploiement Heroku et livraison TestFlight : seulement depuis `master` (ou
  une étiquette de version pour TestFlight). La clé Apple est effacée à la fin
  de chaque livraison ; l'IPA n'est plus publiée comme artefact.

## À régler dans GitHub (réservé au propriétaire)

1. **Le dépôt est public.** Le code d'un projet propriétaire est donc lisible
   par tous. Le passer en privé (Settings › General › Danger Zone) le protège,
   mais les minutes macOS des workflows iOS deviennent alors décomptées du
   quota gratuit.
2. **Settings › Code security** : activer *Secret scanning* et *Push
   protection* (refus d'un push contenant une clé), et *Dependabot alerts*.
3. **Settings › Branches** : une règle sur `master` qui interdit le
   force-push et la suppression.
