import CoreGraphics
import Foundation

/// Comment les commandes sont placées à l'écran.
enum LayoutMode: String, Codable, CaseIterable, Identifiable, Sendable {
    /// Placement calculé sur les arcs d'atteinte du pouce.
    case arc
    /// Placement choisi par la personne, commande par commande.
    case free

    var id: String { rawValue }

    var label: String {
        switch self {
        case .arc: return "Automatique"
        case .free: return "Libre"
        }
    }

    var explanation: String {
        switch self {
        case .arc:
            return "Les commandes se posent sur l'arc que votre pouce atteint, et se réorganisent quand vous changez de main ou de taille."
        case .free:
            return "Vous placez chaque commande où vous voulez. La disposition automatique sert de point de départ."
        }
    }
}

/// Réglages propres à une commande.
///
/// L'accessibilité n'est pas un réglage unique appliqué à tout le monde, ni même
/// à toutes les commandes d'une même personne : une gâchette gagne à être
/// verrouillante alors que le bouton de saut doit rester direct, et une commande
/// dont on ne se sert jamais vaut mieux masquée que mal placée.
struct ControlPreference: Codable, Equatable, Sendable {
    /// Commande affichée ? Masquée, elle libère de la place pour les autres.
    var isVisible: Bool = true

    /// Mode d'appui propre à la commande. `nil` = suit le réglage général.
    var activation: ActivationMode?

    /// Position choisie en disposition libre, en fraction de la vue (0…1).
    /// `nil` = la commande reste là où le placement automatique la met.
    var freePosition: CGPoint?

    /// Grossissement individuel, multiplié à la taille de cible générale.
    var sizeScale: CGFloat = 1

    /// Commande verrouillée : elle ne bouge plus, même en disposition libre.
    ///
    /// Une disposition mise au point pendant une demi-heure ne doit pas être
    /// défaite par un glissement involontaire — exactement le geste que
    /// l'application passe son temps à filtrer ailleurs.
    var isLocked: Bool = false

    static let `default` = ControlPreference()

    init(
        isVisible: Bool = true,
        activation: ActivationMode? = nil,
        freePosition: CGPoint? = nil,
        sizeScale: CGFloat = 1,
        isLocked: Bool = false
    ) {
        self.isVisible = isVisible
        self.activation = activation
        self.freePosition = freePosition
        self.sizeScale = sizeScale
        self.isLocked = isLocked
    }

    /// Même tolérance que le profil : un réglage ajouté plus tard ne doit pas
    /// rendre illisibles les préférences déjà enregistrées.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        isVisible = (try? container.decodeIfPresent(Bool.self, forKey: .isVisible)) .flatMap { $0 } ?? true
        activation = try? container.decodeIfPresent(ActivationMode.self, forKey: .activation)
        freePosition = try? container.decodeIfPresent(CGPoint.self, forKey: .freePosition)
        sizeScale = (try? container.decodeIfPresent(CGFloat.self, forKey: .sizeScale)) .flatMap { $0 } ?? 1
        isLocked = (try? container.decodeIfPresent(Bool.self, forKey: .isLocked)) .flatMap { $0 } ?? false
    }

    /// Vrai si la commande a été touchée : sert à n'écrire dans les réglages
    /// que ce qui diffère vraiment de la valeur par défaut.
    var isDefault: Bool {
        isVisible && activation == nil && freePosition == nil && abs(sizeScale - 1) < 0.001 && !isLocked
    }

    /// Réglage d'origine d'une commande : visible, sauf les commandes
    /// masquées par défaut.
    static func initial(for key: String) -> ControlPreference {
        ControlPreference(isVisible: !ControlKey.hiddenByDefault.contains(key))
    }

    /// Comme `isDefault`, mais pour une commande précise : un stick caméra
    /// masqué est dans son état d'origine, un stick caméra affiché ne l'est pas.
    func isDefault(for key: String) -> Bool {
        isVisible == !ControlKey.hiddenByDefault.contains(key)
            && activation == nil && freePosition == nil && abs(sizeScale - 1) < 0.001 && !isLocked
    }
}

/// Clés de préférences. Une chaîne stable, parce qu'elle est écrite sur le
/// disque et doit survivre à l'ajout d'une commande dans l'énumération.
enum ControlKey {
    /// Le stick. La clé garde son nom d'origine : elle est déjà écrite sur
    /// les appareils.
    static let directional = "directional"
    static let dpad = "dpad"
    static let cameraStick = "cameraStick"

    /// Commandes masquées tant qu'on ne les a pas demandées : le stick caméra
    /// double l'arc de vision, il ne sert qu'« en cas où ».
    static let hiddenByDefault: Set<String> = [cameraStick]

    static func key(for control: ControlID) -> String {
        control.rawValue
    }
}
