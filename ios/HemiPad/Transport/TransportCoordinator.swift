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
    /// Par où les commandes partent en ce moment. Personne ne le choisit :
    /// c'est la bibliothèque Rust qui décide, et cette valeur ne sert qu'à
    /// l'afficher.
    @Published private(set) var path: ConnectionPath = .none
    /// Les coordonnées du boîtier. Vides tant qu'il n'a pas été appairé.
    @Published var bridgeSettings: BridgeSettings {
        didSet {
            guard bridgeSettings != oldValue else { return }
            SettingsStore.save(bridgeSettings)
            switchBridge()
        }
    }
    /// La machine connectée en ce moment, si elle est reconnue.
    @Published private(set) var connectedMachine: UUID?

    /// Prévenu quand une machine arrive ou part : c'est ainsi qu'elle est
    /// mémorisée.
    var onMachineEvent: ((MachineEvent) -> Void)?
    /// Le nom sous lequel afficher une machine connue, tiré du registre des
    /// connexions. Sans lui, la barre d'état montre un identifiant.
    var machineName: ((UUID) -> String?)?
    /// Reçoit chaque nouvel état de manette, en plus du transport : c'est par
    /// là que la lecture à distance de la Xbox, dans HemiPad, reçoit les
    /// commandes.
    var gamepadMirror: (@MainActor (GamepadState) -> Void)?

    private var transport: ControllerTransport?
    /// Le chemin par le boîtier, s'il est appairé. Il tourne en même temps que
    /// le Bluetooth direct : c'est ce qui permet de basculer sans rien
    /// demander quand l'un des deux tombe.
    private var bridge: BridgeTransport?
    /// La règle du choix, écrite en Rust.
    private let chooser = PathChooser()
    private let gamepadEncoder = GamepadReportEncoder()
    private let keyboardEncoder = KeyboardReportEncoder()
    private var lastGamepadPayload: [UInt8] = []
    private var flushTimer: Timer?
    private var pendingGamepadState: GamepadState?

    /// Période minimale entre deux rapports manette (125 Hz).
    private let minimumInterval: TimeInterval = 0.008

    init(kind: TransportKind = .loopback) {
        self.kind = kind
        bridgeSettings = SettingsStore.loadBridge()
    }

    func connect() {
        switchTransport()
        switchBridge()
    }

    /// « Réessayer » après un échec : c'est un choix explicite de la personne,
    /// le seul qui sorte le Bluetooth de sa pause de sécurité. On repart du
    /// profil complet.
    func retry() {
        BLEPublicationSentinel().reset()
        switchTransport()
    }

    func disconnect() {
        flushTimer?.invalidate()
        flushTimer = nil
        transport?.stop()
        transport = nil
        bridge?.stop()
        bridge = nil
        chooser.setDirect(connected: false)
        path = .none
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
            route(reportID: .keyboard, payload: payload)
            sentReports += 1
        }
    }

    /// Envoie un rapport par le chemin du moment.
    ///
    /// Le chemin n'est pas un réglage : la bibliothèque Rust le décide à
    /// partir de ce qui répond, et bascule d'elle-même quand l'un des deux
    /// tombe. Ici on ne fait que suivre sa décision.
    private func route(reportID: HIDReportDescriptors.ReportID, payload: [UInt8]) {
        let chosen = chooser.path()
        if chosen != path { path = chosen }
        switch chosen {
        case .direct:
            transport?.send(reportID: reportID, payload: payload)
        case .bridge:
            bridge?.send(reportID: reportID, payload: payload)
        case .none:
            // Aucun chemin : rien ne part. Rejouer plus tard des appuis tapés
            // dans le vide serait pire que les perdre.
            break
        }
    }

    /// Maintient explicitement un jeu de modificateurs (aperçu de l'accord en
    /// cours sur l'ordinateur, utile avec les modificateurs collants).
    func sendModifiers(_ modifiers: KeyModifier) {
        route(reportID: .keyboard, payload: keyboardEncoder.encode(modifiers: modifiers, keys: []))
        sentReports += 1
    }

    func releaseKeyboard() {
        route(reportID: .keyboard, payload: keyboardEncoder.releaseAll())
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
        case .bridge:
            // Le boîtier n'est pas un choix : il tourne à côté du Bluetooth
            // direct, allumé dès qu'il est appairé. Si ce réglage traîne d'une
            // ancienne version, on revient au Bluetooth direct.
            kind = .bluetoothHID
            newTransport = BLEHIDPeripheralTransport()
        }
        newTransport.onStateChange = { [weak self] state in
            guard let self else { return }
            Task { @MainActor in
                self.state = self.presented(state)
                if case .failed = state {
                    self.handleFailure()
                }
            }
        }
        newTransport.onMachineEvent = { [weak self] event in
            guard let self else { return }
            Task { @MainActor in self.handle(event) }
        }
        connectedMachine = nil
        transport = newTransport
        newTransport.start()
        state = presented(newTransport.state)
    }

    /// Allume ou éteint le chemin par le boîtier selon ce qui est appairé.
    private func switchBridge() {
        bridge?.stop()
        bridge = nil
        guard bridgeSettings.isComplete, let bridge = BridgeTransport(settings: bridgeSettings) else {
            path = chooser.path()
            return
        }
        bridge.onHeartbeat = { [weak self] in
            guard let self else { return }
            self.chooser.bridgeSeen()
            let chosen = self.chooser.path()
            if chosen != self.path { self.path = chosen }
        }
        bridge.onMachineEvent = { [weak self] event in
            guard let self else { return }
            Task { @MainActor in self.handle(event) }
        }
        self.bridge = bridge
        bridge.start()
    }

    private func handle(_ event: MachineEvent) {
        switch event {
        case .connected(let id):
            connectedMachine = id
        case .disconnected(let id):
            if connectedMachine == id { connectedMachine = nil }
        }
        chooser.setDirect(connected: connectedMachine != nil)
        path = chooser.path()
        onMachineEvent?(event)
        if let current = transport?.state {
            state = presented(current)
        }
    }

    /// « Connecté · PC du salon » plutôt qu'un morceau d'identifiant, quand
    /// la machine est connue.
    private func presented(_ state: ConnectionState) -> ConnectionState {
        guard case .connected = state,
              let id = connectedMachine,
              let name = machineName?(id) else { return state }
        return .connected(name)
    }

    /// À appeler quand le nom d'une machine change : la barre d'état suit.
    func refreshMachineName() {
        if let current = transport?.state {
            state = presented(current)
        }
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
        gamepadMirror?(pending)
        route(reportID: .gamepad, payload: payload)
        sentReports += 1
    }
}
