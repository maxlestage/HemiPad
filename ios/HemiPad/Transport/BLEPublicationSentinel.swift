import Foundation

/// Garde-fou contre une boucle de plantages au lancement.
///
/// La publication du profil manette est l'étape la plus fragile : elle passe
/// par des parties de CoreBluetooth qu'Apple ne documente pas pour cet usage.
/// Les exceptions Objective-C y sont rattrapées, mais un arrêt que rien ne
/// rattrape reste possible. Et comme l'application relance le Bluetooth à
/// l'ouverture, un arrêt pendant la publication se reproduirait à chaque
/// lancement : l'application deviendrait inutilisable.
///
/// Le garde-fou note sur le disque qu'une publication commence, et efface la
/// note quand elle aboutit. Une note encore là au lancement suivant, c'est une
/// publication interrompue : on descend d'un cran.
///
/// 1. **Complet** : profil entier, *Report Reference* compris.
/// 2. **Sans Report Reference** : le descripteur dont iOS ne documente pas le
///    support est retiré.
/// 3. **En pause** : le Bluetooth n'est plus lancé tout seul ; l'écran de
///    connexion le dit, et « Réessayer » repart du profil complet.
struct BLEPublicationSentinel {
    enum Level: Int, Comparable {
        case full = 0
        case withoutReportReference = 1
        case paused = 2

        static func < (lhs: Level, rhs: Level) -> Bool { lhs.rawValue < rhs.rawValue }
    }

    private let defaults: UserDefaults
    private static let inProgressKey = "hemipad.ble.publicationEnCours"
    private static let levelKey = "hemipad.ble.niveauDePublication"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    /// Au lancement, une seule fois : une publication commencée et jamais
    /// terminée veut dire que l'application s'est arrêtée pendant. On descend
    /// d'un cran. Renvoie vrai si c'était le cas.
    @discardableResult
    func recordInterruptedPublication() -> Bool {
        guard defaults.bool(forKey: Self.inProgressKey) else { return false }
        defaults.set(false, forKey: Self.inProgressKey)
        lower(to: Level(rawValue: level.rawValue + 1) ?? .paused)
        return true
    }

    var level: Level {
        Level(rawValue: defaults.integer(forKey: Self.levelKey)) ?? .full
    }

    /// Juste avant d'ajouter les services.
    func willPublish() {
        defaults.set(true, forKey: Self.inProgressKey)
    }

    /// La publication a abouti — réussie ou refusée proprement par iOS, peu
    /// importe : l'application ne s'est pas arrêtée.
    func didPublish() {
        defaults.set(false, forKey: Self.inProgressKey)
    }

    /// Descend au moins jusqu'à `level`, jamais ne remonte.
    func lower(to level: Level) {
        guard level > self.level else { return }
        defaults.set(level.rawValue, forKey: Self.levelKey)
    }

    /// Choix explicite de la personne : repartir du profil complet.
    func reset() {
        defaults.removeObject(forKey: Self.levelKey)
        defaults.removeObject(forKey: Self.inProgressKey)
    }
}
