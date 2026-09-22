import Combine
import Foundation

/// Gère les modificateurs collants du clavier.
///
/// Impossible de faire ⌘ + ⇧ + P avec un seul doigt. Ici, on appuie sur ⌘,
/// puis sur ⇧, puis sur P : les modificateurs restent armés jusqu'à la frappe
/// suivante, puis retombent — sauf s'ils ont été verrouillés par double appui.
@MainActor
final class StickyModifierEngine: ObservableObject {
    /// Modificateurs armés pour la prochaine frappe.
    @Published private(set) var armed: KeyModifier = []
    /// Modificateurs verrouillés jusqu'à nouvel ordre (double appui).
    @Published private(set) var locked: KeyModifier = []

    var timeout: TimeInterval = 6
    var stickyEnabled: Bool = true

    private var expiry: Timer?
    private var lastTap: [UInt8: TimeInterval] = [:]
    private let doubleTapWindow: TimeInterval = 0.45

    /// Ce que le rapport HID doit porter au moment d'une frappe.
    var effective: KeyModifier { armed.union(locked) }

    /// Appui sur une touche modificatrice.
    func tap(_ modifier: KeyModifier) {
        guard stickyEnabled else {
            armed = armed.symmetricDifference(modifier)
            return
        }

        let now = Date.timeIntervalSinceReferenceDate
        if let previous = lastTap[modifier.rawValue], now - previous < doubleTapWindow {
            // Double appui : on verrouille (utile pour ⇧ pendant une session de code).
            locked.formUnion(modifier)
            armed.subtract(modifier)
            lastTap[modifier.rawValue] = nil
            restartExpiry()
            return
        }
        lastTap[modifier.rawValue] = now

        if locked.contains(modifier) {
            locked.subtract(modifier)
        } else if armed.contains(modifier) {
            armed.subtract(modifier)
        } else {
            armed.formUnion(modifier)
        }
        restartExpiry()
    }

    /// À appeler juste après l'envoi d'une frappe normale : consomme l'armement.
    func consume() {
        guard !armed.isEmpty else { return }
        armed = []
        expiry?.invalidate()
        expiry = nil
    }

    func clear() {
        armed = []
        locked = []
        expiry?.invalidate()
        expiry = nil
    }

    /// Un modificateur armé finit par retomber : sans cela, un ⌘ oublié
    /// transforme la frappe suivante en raccourci destructeur.
    private func restartExpiry() {
        expiry?.invalidate()
        guard !armed.isEmpty, timeout > 0 else { return }
        expiry = Timer.scheduledTimer(withTimeInterval: timeout, repeats: false) { [weak self] _ in
            Task { @MainActor in
                self?.armed = []
            }
        }
    }
}
