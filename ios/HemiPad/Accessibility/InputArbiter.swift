import Combine
import CoreGraphics
import Foundation

/// Traduit des gestes tactiles imparfaits en appuis de manette nets.
///
/// C'est ici que vivent les compromis propres à l'hémiplégie :
/// anti-rebond, verrouillage, survol prolongé, répétition automatique.
/// Les vues n'ont qu'à dire « le doigt est arrivé / le doigt est parti ».
@MainActor
final class InputArbiter: ObservableObject {
    @Published private(set) var state = GamepadState()
    /// Contrôles verrouillés (mode `latch`) : affichés avec un liseré plein.
    @Published private(set) var latched: Set<ControlID> = []
    /// Progression de survol en cours, pour dessiner l'anneau de remplissage.
    @Published private(set) var dwellProgress: [ControlID: Double] = [:]

    var profile: HemiplegiaProfile {
        didSet {
            guard profile != oldValue else { return }
            cancelAllTimers()
            resetStickFilters()
        }
    }

    /// Appelé à chaque changement d'état, après filtrage : c'est ce que le
    /// transport envoie à la machine.
    var onStateChange: ((GamepadState) -> Void)?

    private var lastPressTimestamps: [ControlID: TimeInterval] = [:]
    private var dwellTimers: [ControlID: Timer] = [:]
    private var repeatTimers: [ControlID: Timer] = [:]
    private var leftFilter: TremorFilter2D
    private var rightFilter: TremorFilter2D

    init(profile: HemiplegiaProfile = .default) {
        self.profile = profile
        leftFilter = TremorFilter2D(damping: profile.tremorDamping, deadzone: profile.stickDeadzone)
        rightFilter = TremorFilter2D(damping: profile.tremorDamping, deadzone: profile.stickDeadzone)
    }

    // MARK: - Boutons

    /// Le doigt vient de se poser sur un contrôle.
    func touchDown(_ control: ControlID) {
        let now = Date.timeIntervalSinceReferenceDate
        if let last = lastPressTimestamps[control], now - last < profile.debounceInterval {
            // Ré-appui parasite (spasme, rebond du doigt) : ignoré.
            return
        }
        lastPressTimestamps[control] = now

        switch mode(for: control) {
        case .direct:
            apply(control, pressed: true)
            scheduleAutoRepeat(control)
        case .latch:
            let shouldPress = !latched.contains(control)
            if shouldPress { latched.insert(control) } else { latched.remove(control) }
            apply(control, pressed: shouldPress)
        case .dwell:
            startDwell(control)
        }
    }

    /// Le doigt quitte le contrôle (ou glisse en dehors).
    func touchUp(_ control: ControlID) {
        cancelRepeat(control)
        switch mode(for: control) {
        case .direct:
            apply(control, pressed: false)
        case .latch:
            // L'état verrouillé survit au relâchement : c'est tout l'intérêt.
            break
        case .dwell:
            cancelDwell(control)
            if state.isPressed(control) {
                apply(control, pressed: false)
            }
        }
    }

    /// Relâche tout : utilisé à la déconnexion et au changement d'écran, pour
    /// ne jamais laisser une gâchette coincée dans un jeu.
    func releaseAll() {
        cancelAllTimers()
        latched.removeAll()
        dwellProgress.removeAll()
        state = GamepadState()
        publish()
    }

    /// Libère les seuls verrous : bouton « tout relâcher » de la barre d'état.
    func clearLatches() {
        for control in latched {
            state.set(control, pressed: false)
        }
        latched.removeAll()
        publish()
    }

    private func mode(for control: ControlID) -> ActivationMode {
        // La croix directionnelle reste toujours en appui direct : la verrouiller
        // ferait tourner le personnage en rond, ce qui n'aide personne.
        guard !control.isDirectionalPad else { return .direct }
        // Le réglage propre à la commande l'emporte sur le réglage général :
        // une gâchette gagne à rester enfoncée là où le bouton de saut doit
        // suivre le doigt.
        return profile.activation(for: control)
    }

    private func apply(_ control: ControlID, pressed: Bool) {
        state.set(control, pressed: pressed)
        publish()
    }

    // MARK: - Survol prolongé

    private func startDwell(_ control: ControlID) {
        cancelDwell(control)
        let duration = profile.dwellDuration
        let start = Date.timeIntervalSinceReferenceDate
        dwellProgress[control] = 0

        // Les minuteries appellent leur bloc hors de tout acteur : on rebascule
        // explicitement sur l'acteur principal, et on lie `self` fortement
        // *avant* ce saut. Lier `self` à l'intérieur reviendrait à capturer la
        // référence faible de la closure englobante dans du code concurrent,
        // ce que le compilateur refuse à juste titre.
        let timer = Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { [weak self] timer in
            guard let self else {
                timer.invalidate()
                return
            }
            Task { @MainActor in
                self.advanceDwell(control, start: start, duration: duration, timer: timer)
            }
        }
        dwellTimers[control] = timer
    }

    /// Un battement de survol : avance l'anneau de progression et valide
    /// l'appui une fois la durée atteinte.
    private func advanceDwell(
        _ control: ControlID,
        start: TimeInterval,
        duration: TimeInterval,
        timer: Timer
    ) {
        let elapsed = Date.timeIntervalSinceReferenceDate - start
        let progress = duration > 0 ? min(elapsed / duration, 1) : 1
        dwellProgress[control] = progress
        guard progress >= 1 else { return }
        timer.invalidate()
        dwellTimers[control] = nil
        dwellProgress[control] = nil
        apply(control, pressed: true)
        scheduleAutoRepeat(control)
    }

    private func cancelDwell(_ control: ControlID) {
        dwellTimers[control]?.invalidate()
        dwellTimers[control] = nil
        dwellProgress[control] = nil
    }

    // MARK: - Répétition automatique

    private func scheduleAutoRepeat(_ control: ControlID) {
        guard profile.autoRepeat, !control.isAnalogTrigger else { return }
        cancelRepeat(control)
        let timer = Timer.scheduledTimer(withTimeInterval: profile.autoRepeatDelay, repeats: false) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                guard self.state.isPressed(control) else { return }
                self.startRepeating(control)
            }
        }
        repeatTimers[control] = timer
    }

    private func startRepeating(_ control: ControlID) {
        repeatTimers[control]?.invalidate()
        let timer = Timer.scheduledTimer(withTimeInterval: profile.autoRepeatInterval, repeats: true) { [weak self] timer in
            guard let self else {
                timer.invalidate()
                return
            }
            Task { @MainActor in
                self.emitRepeat(control, timer: timer)
            }
        }
        repeatTimers[control] = timer
    }

    /// Un battement de répétition : relâché puis ré-appuyé, parce que les jeux
    /// lisent un front montant, pas un état maintenu.
    private func emitRepeat(_ control: ControlID, timer: Timer) {
        guard state.isPressed(control) else {
            timer.invalidate()
            return
        }
        state.set(control, pressed: false)
        publish()
        state.set(control, pressed: true)
        publish()
    }

    private func cancelRepeat(_ control: ControlID) {
        repeatTimers[control]?.invalidate()
        repeatTimers[control] = nil
    }

    private func cancelAllTimers() {
        dwellTimers.values.forEach { $0.invalidate() }
        repeatTimers.values.forEach { $0.invalidate() }
        dwellTimers.removeAll()
        repeatTimers.removeAll()
        dwellProgress.removeAll()
    }

    // MARK: - Sticks

    /// Déplace un stick avec une valeur brute ; le filtrage anti-tremblement
    /// et la zone morte sont appliqués ici, pas dans la vue.
    func moveStick(_ id: StickID, to raw: CGPoint) {
        let now = Date.timeIntervalSinceReferenceDate
        let filtered: CGPoint
        switch id {
        case .left: filtered = leftFilter.filter(raw, timestamp: now)
        case .right: filtered = rightFilter.filter(raw, timestamp: now)
        }
        state.stick(id, movedTo: filtered)
        publish()
    }

    /// Le doigt quitte le stick.
    func releaseStick(_ id: StickID) {
        switch id {
        case .left: leftFilter.reset()
        case .right: rightFilter.reset()
        }
        guard profile.stickAutoCenter else { return }
        state.stick(id, movedTo: .zero)
        publish()
    }

    /// Remet un stick au centre même en mode « garde la position ».
    func centerStick(_ id: StickID) {
        state.stick(id, movedTo: .zero)
        publish()
    }

    /// Alimenté par le gyroscope quand le second stick est remplacé par l'inclinaison.
    func applyTilt(_ vector: CGPoint) {
        guard profile.tiltReplacesSecondStick else { return }
        let scaled = CGPoint(
            x: vector.x * CGFloat(profile.tiltSensitivity),
            y: vector.y * CGFloat(profile.tiltSensitivity)
        )
        state.stick(.right, movedTo: Self.clampToUnitCircle(scaled))
        publish()
    }

    private func resetStickFilters() {
        leftFilter = TremorFilter2D(damping: profile.tremorDamping, deadzone: profile.stickDeadzone)
        rightFilter = TremorFilter2D(damping: profile.tremorDamping, deadzone: profile.stickDeadzone)
    }

    static func clampToUnitCircle(_ point: CGPoint) -> CGPoint {
        let magnitude = sqrt(point.x * point.x + point.y * point.y)
        guard magnitude > 1 else { return point }
        return CGPoint(x: point.x / magnitude, y: point.y / magnitude)
    }

    private func publish() {
        onStateChange?(state)
    }
}
