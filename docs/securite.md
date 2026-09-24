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
