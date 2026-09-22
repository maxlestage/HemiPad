import UIKit

/// Retour haptique.
///
/// Quand le pouce masque le bouton qu'il enfonce — ce qui arrive en permanence
/// sur une manette tenue à une main — le retour visuel ne sert à rien. La
/// vibration devient le principal accusé de réception.
@MainActor
final class Haptics {
    static let shared = Haptics()

    var isEnabled = true

    private let light = UIImpactFeedbackGenerator(style: .light)
    private let medium = UIImpactFeedbackGenerator(style: .medium)
    private let rigid = UIImpactFeedbackGenerator(style: .rigid)
    private let notification = UINotificationFeedbackGenerator()

    private init() {}

    /// Prépare le moteur : sans cela, la première vibration arrive en retard.
    func prepare() {
        guard isEnabled else { return }
        light.prepare()
        medium.prepare()
        rigid.prepare()
    }

    func press() {
        guard isEnabled else { return }
        medium.impactOccurred()
    }

    func release() {
        guard isEnabled else { return }
        light.impactOccurred(intensity: 0.5)
    }

    /// Verrouillage d'un bouton ou d'un modificateur : plus sec, pour être
    /// distinguable d'un appui normal sans regarder l'écran.
    func latch() {
        guard isEnabled else { return }
        rigid.impactOccurred()
    }

    func success() {
        guard isEnabled else { return }
        notification.notificationOccurred(.success)
    }

    func warning() {
        guard isEnabled else { return }
        notification.notificationOccurred(.warning)
    }
}
