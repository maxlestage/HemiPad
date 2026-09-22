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
        }
    }

    @Published var macros: [Macro]
    /// Message d'aide contextuel affiché en haut de l'écran manette.
    @Published var banner: String?

    let arbiter: InputArbiter
    let transport: TransportCoordinator
    let sticky = StickyModifierEngine()
    let tilt = TiltStick()
    let bridges = BridgeBrowser()

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
        if profile.activationMode == .latch && !control.isDirectionalPad {
            Haptics.shared.latch()
        } else {
            Haptics.shared.press()
        }
    }

    func release(_ control: ControlID) {
        arbiter.touchUp(control)
        if profile.activationMode == .direct || control.isDirectionalPad {
            Haptics.shared.release()
        }
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
