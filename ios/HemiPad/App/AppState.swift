import Combine
import CoreGraphics
import SwiftUI

/// État global de l'application : réglages, arbitrage des entrées, transport.
///
/// Un seul objet observable évite que chaque vue n'invente sa propre vérité sur
/// l'état de la manette — et garantit qu'un bouton verrouillé reste verrouillé
/// quand on passe de l'écran manette à l'écran clavier.
@MainActor
final class AppState: ObservableObject {
    @Published var profile: HemiplegiaProfile {
        didSet {
            guard profile != oldValue else { return }
            arbiter.profile = profile
            sticky.stickyEnabled = profile.stickyModifiers
            sticky.timeout = profile.stickyTimeout
            Haptics.shared.isEnabled = profile.hapticsEnabled
            SettingsStore.save(profile)
            syncTilt()
        }
    }

    @Published var consoleTarget: ConsoleTarget {
        didSet {
            guard consoleTarget != oldValue else { return }
            SettingsStore.save(consoleTarget)
            arbiter.releaseAll()
            // Choisi pendant qu'une machine est connectée, le profil devient
            // le sien : il sera repris à sa prochaine connexion.
            if let id = transport.connectedMachine {
                setConsole(consoleTarget, forMachine: id)
            }
        }
    }

    /// Les machines déjà connectées, la plus récente d'abord.
    @Published private(set) var machines: [RememberedMachine] = []

    @Published var macros: [Macro]
    /// L'écran manette est-il en mode édition ? Dans cet état, les appuis ne
    /// partent pas vers la console : ils déplacent et règlent les commandes.
    @Published var isEditingLayout = false
    /// Message d'aide contextuel affiché en haut de l'écran manette.
    @Published var banner: String?

    let arbiter: InputArbiter
    let transport: TransportCoordinator
    /// Le registre des connexions, en SQLite. Absent si la base n'a pas pu
    /// s'ouvrir : l'application marche alors comme avant, sans mémoire.
    let connections: ConnectionStore?
    let sticky = StickyModifierEngine()
    let tilt = TiltStick()

    private(set) var macroRunner: MacroRunner!
    private var cancellables: Set<AnyCancellable> = []

    var console: ConsoleProfile { ConsoleProfile.profile(for: consoleTarget) }
    var accent: Color { Theme.color(hex: console.accentHex) }

    init(profile: HemiplegiaProfile? = nil, transportKind: TransportKind? = nil) {
        let loadedProfile = profile ?? SettingsStore.loadProfile()
        self.profile = loadedProfile
        consoleTarget = SettingsStore.loadConsole()
        arbiter = InputArbiter(profile: loadedProfile)
        transport = TransportCoordinator(kind: transportKind ?? SettingsStore.loadTransport())
        connections = try? ConnectionStore.standard()
        macros = Macro.codeDefaults + Macro.gameDefaults

        sticky.stickyEnabled = loadedProfile.stickyModifiers
        sticky.timeout = loadedProfile.stickyTimeout
        Haptics.shared.isEnabled = loadedProfile.hapticsEnabled

        arbiter.onStateChange = { [weak self] state in
            self?.transport.submit(state)
        }

        tilt.onUpdate = { [weak self] vector in
            self?.arbiter.applyTilt(vector)
        }

        macroRunner = MacroRunner(
            keyboardSender: { [weak self] stroke in
                await MainActor.run { self?.sendKeystroke(stroke) }
            },
            controlSender: { [weak self] control, pressed in
                guard let self else { return }
                if pressed {
                    self.arbiter.touchDown(control)
                } else {
                    self.arbiter.touchUp(control)
                }
            }
        )

        transport.$kind
            .sink { kind in SettingsStore.save(kind) }
            .store(in: &cancellables)

        transport.machineName = { [weak self] id in
            self?.machines.first(where: { $0.id == id })?.displayName
        }
        transport.onMachineEvent = { [weak self] event in
            self?.handle(event)
        }
        reloadMachines()
    }

    // MARK: - Machines mémorisées

    private func handle(_ event: MachineEvent) {
        guard let connections else { return }
        switch event {
        case .connected(let id):
            guard let machine = try? connections.recordConnection(of: id, transport: transport.kind) else { break }
            reloadMachines()
            // Une machine connue retrouve son profil de console, sans rien
            // demander. Une nouvelle prend celui en cours.
            if let console = machine.console {
                if console != consoleTarget { consoleTarget = console }
            } else {
                setConsole(consoleTarget, forMachine: id)
            }
            banner = machine.connectionCount > 1
                ? "\(machine.displayName) reconnue."
                : "Nouvelle machine : donnez-lui un nom dans Connexion."
        case .disconnected(let id):
            try? connections.recordDisconnection(of: id)
            reloadMachines()
        }
    }

    func reloadMachines() {
        machines = (try? connections?.machines()) ?? []
        transport.refreshMachineName()
    }

    func renameMachine(_ id: UUID, to name: String) {
        try? connections?.rename(id, to: name)
        reloadMachines()
    }

    func setConsole(_ console: ConsoleTarget?, forMachine id: UUID) {
        try? connections?.setConsole(console, for: id)
        reloadMachines()
    }

    func forgetMachine(_ id: UUID) {
        try? connections?.forget(id)
        reloadMachines()
    }

    // MARK: - Cycle de vie

    func onAppear() {
        Haptics.shared.prepare()
        transport.connect()
        syncTilt()
    }

    func onDisappear() {
        arbiter.releaseAll()
        tilt.stop()
    }

    // MARK: - Actions

    /// Appui sur un bouton depuis une vue. Centralise le retour haptique pour
    /// que toutes les commandes se comportent pareil.
    func press(_ control: ControlID) {
        arbiter.touchDown(control)
        if profile.activation(for: control) == .latch && !control.isDirectionalPad {
            Haptics.shared.latch()
        } else {
            Haptics.shared.press()
        }
    }

    func release(_ control: ControlID) {
        arbiter.touchUp(control)
        if profile.activation(for: control) == .direct || control.isDirectionalPad {
            Haptics.shared.release()
        }
    }

    // MARK: - Disposition et réglages par commande

    /// Modifie les réglages d'une commande. Le profil complet est réécrit :
    /// c'est lui qui est observé, et qui déclenche l'enregistrement.
    func updateControl(_ key: String, _ change: (inout ControlPreference) -> Void) {
        var next = profile
        next.updatePreference(for: key, change)
        profile = next
    }

    /// Enregistre la position d'une commande après un glissement.
    /// Sans effet si la commande est verrouillée.
    @discardableResult
    func moveControl(_ key: String, to center: CGPoint, in bounds: CGSize) -> Bool {
        let normalized = ControllerLayout.normalized(center, in: bounds)
        var next = profile
        let moved = next.setFreePosition(normalized, for: key)
        if moved { profile = next }
        return moved
    }

    /// Verrouille ou déverrouille une sélection de commandes.
    func setLocked(_ locked: Bool, for keys: [String]) {
        guard !keys.isEmpty else { return }
        var next = profile
        next.setLocked(locked, for: keys)
        profile = next
        Haptics.shared.latch()
        banner = locked
            ? (keys.count == 1
                ? "Commande verrouillée : elle ne bougera plus."
                : "\(keys.count) commandes verrouillées : elles ne bougeront plus.")
            : (keys.count == 1 ? "Commande déverrouillée." : "\(keys.count) commandes déverrouillées.")
    }

    /// Masque ou affiche une sélection de commandes.
    func setVisible(_ visible: Bool, for keys: [String]) {
        guard !keys.isEmpty else { return }
        var next = profile
        for key in keys {
            next.updatePreference(for: key) { $0.isVisible = visible }
        }
        profile = next
        Haptics.shared.latch()
    }

    func setLayoutMode(_ mode: LayoutMode) {
        guard profile.layoutMode != mode else { return }
        var next = profile
        next.layoutMode = mode
        profile = next
        arbiter.releaseAll()
        Haptics.shared.success()
        banner = mode == .free
            ? "Disposition libre : touchez Modifier, puis faites glisser une commande."
            : "Disposition automatique rétablie."
    }

    /// Oublie les positions choisies, sans toucher aux tailles ni aux modes.
    func resetFreePositions() {
        var next = profile
        next.clearFreePositions()
        profile = next
        Haptics.shared.warning()
        banner = "Toutes les commandes sont revenues à leur place automatique."
    }

    /// Remet chaque commande dans son état d'origine.
    func resetControlPreferences() {
        var next = profile
        next.resetControlPreferences()
        profile = next
        Haptics.shared.warning()
        banner = "Réglages par commande réinitialisés."
    }

    func sendKeystroke(_ stroke: Keystroke) {
        transport.sendKeystroke(stroke, heldModifiers: sticky.effective)
        sticky.consume()
        Haptics.shared.press()
    }

    func toggleModifier(_ modifier: KeyModifier) {
        sticky.tap(modifier)
        Haptics.shared.latch()
        transport.sendModifiers(sticky.effective)
    }

    func run(_ macro: Macro) {
        macroRunner.run(macro)
        Haptics.shared.success()
    }

    func clearEverything() {
        arbiter.releaseAll()
        sticky.clear()
        transport.releaseKeyboard()
        Haptics.shared.warning()
        banner = "Toutes les commandes ont été relâchées."
    }

    func applyPreset(_ preset: HemiplegiaProfile) {
        // La main et le pivot appartiennent à la personne, pas au préréglage.
        var next = preset
        next.dominantHand = profile.dominantHand
        next.thumbPivot = profile.thumbPivot
        profile = next
        Haptics.shared.success()
    }

    private func syncTilt() {
        if profile.tiltReplacesSecondStick {
            tilt.start()
        } else {
            tilt.stop()
            arbiter.centerStick(.right)
        }
    }

    /// Instance de prévisualisation pour les canevas SwiftUI et les tests d'interface.
    static var preview: AppState {
        AppState(profile: .default, transportKind: .loopback)
    }
}
