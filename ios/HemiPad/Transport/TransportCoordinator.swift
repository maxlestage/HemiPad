import Combine
import Foundation

/// Point d'entrée unique pour parler à la machine.
///
/// Il choisit le transport, encode les rapports et **lisse le débit** : un
/// geste tactile produit des dizaines d'événements par seconde, une manette
/// n'en a besoin que de 100 au plus, et la radio Bluetooth sature bien avant.
/// Les rapports identiques ne sont jamais renvoyés.
@MainActor
final class TransportCoordinator: ObservableObject {
    @Published private(set) var state: ConnectionState = .idle
    @Published var kind: TransportKind {
        didSet {
            guard kind != oldValue else { return }
            switchTransport()
        }
    }
    /// Nombre de rapports réellement émis, affiché dans l'écran de diagnostic.
    @Published private(set) var sentReports: Int = 0

    private var transport: ControllerTransport?
    private let gamepadEncoder = GamepadReportEncoder()
    private let keyboardEncoder = KeyboardReportEncoder()
    private var lastGamepadPayload: [UInt8] = []
    private var flushTimer: Timer?
    private var pendingGamepadState: GamepadState?

    /// Période minimale entre deux rapports manette (125 Hz).
    private let minimumInterval: TimeInterval = 0.008

    init(kind: TransportKind = .loopback) {
        self.kind = kind
    }

    func connect() {
        switchTransport()
    }

    func disconnect() {
        flushTimer?.invalidate()
        flushTimer = nil
        transport?.stop()
        transport = nil
        state = .idle
    }

    /// Nouvel état de manette à transmettre. L'appel est bon marché : il ne
    /// fait que mémoriser l'état, l'émission a lieu au prochain battement.
    func submit(_ gamepadState: GamepadState) {
        pendingGamepadState = gamepadState
        startFlushTimerIfNeeded()
    }

    /// Envoi immédiat d'une frappe clavier (appui puis relâchement).
    func sendKeystroke(_ stroke: Keystroke, heldModifiers: KeyModifier = []) {
        for payload in keyboardEncoder.pressAndRelease(stroke, heldModifiers: heldModifiers) {
            transport?.send(reportID: .keyboard, payload: payload)
            sentReports += 1
        }
    }

    /// Maintient explicitement un jeu de modificateurs (aperçu de l'accord en
    /// cours sur l'ordinateur, utile avec les modificateurs collants).
    func sendModifiers(_ modifiers: KeyModifier) {
        transport?.send(reportID: .keyboard, payload: keyboardEncoder.encode(modifiers: modifiers, keys: []))
        sentReports += 1
    }

    func releaseKeyboard() {
        transport?.send(reportID: .keyboard, payload: keyboardEncoder.releaseAll())
    }

    // MARK: - Détails

    private func switchTransport() {
        transport?.stop()
        let newTransport: ControllerTransport
        switch kind {
        case .bluetoothHID:
            newTransport = BLEHIDPeripheralTransport()
        case .loopback:
            newTransport = LoopbackTransport()
        }
        newTransport.onStateChange = { [weak self] state in
            guard let self else { return }
            Task { @MainActor in
                self.state = state
                if case .failed = state {
                    self.handleFailure()
                }
            }
        }
        transport = newTransport
        newTransport.start()
        state = newTransport.state
    }

    /// Quand le Bluetooth échoue, l'erreur reste visible telle quelle : pas de
    /// bascule silencieuse vers le mode démo, qui ferait croire que la
    /// manette fonctionne alors que rien ne part.
    private func handleFailure() {}

    private func startFlushTimerIfNeeded() {
        guard flushTimer == nil else { return }
        flushTimer = Timer.scheduledTimer(withTimeInterval: minimumInterval, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in self.flush() }
        }
    }

    private func flush() {
        guard let pending = pendingGamepadState else { return }
        pendingGamepadState = nil
        let payload = gamepadEncoder.encode(pending)
        guard payload != lastGamepadPayload else { return }
        lastGamepadPayload = payload
        transport?.send(reportID: .gamepad, payload: payload)
        sentReports += 1
    }
}
