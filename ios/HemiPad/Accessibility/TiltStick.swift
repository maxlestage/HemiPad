import CoreGraphics
import CoreMotion
import Foundation

/// Remplace le second stick par l'inclinaison de l'appareil.
///
/// Avec une seule main, le pouce ne peut pas être à deux endroits : le stick
/// gauche sert à se déplacer, et la visée passe par le poignet. Le zéro est
/// recalibré à la demande pour épouser la position réelle de la main, qui n'est
/// presque jamais « écran à plat ».
@MainActor
final class TiltStick: ObservableObject {
    @Published private(set) var vector: CGPoint = .zero
    @Published private(set) var isAvailable = false

    private let motion = CMMotionManager()
    private var neutralPitch: Double = 0
    private var neutralRoll: Double = 0
    /// Amplitude d'inclinaison correspondant à une course complète (radians).
    private let fullScale: Double = 0.55

    var onUpdate: ((CGPoint) -> Void)?

    func start() {
        guard motion.isDeviceMotionAvailable else {
            isAvailable = false
            return
        }
        isAvailable = true
        guard !motion.isDeviceMotionActive else { return }
        motion.deviceMotionUpdateInterval = 1.0 / 60.0
        motion.startDeviceMotionUpdates(to: .main) { [weak self] data, _ in
            guard let attitude = data?.attitude else { return }
            let pitch = attitude.pitch
            let roll = attitude.roll
            // La file est déjà la principale, mais le compilateur ne le sait
            // pas : le saut explicite évite de dépendre de cette promesse.
            Task { @MainActor [weak self] in
                self?.handle(pitch: pitch, roll: roll)
            }
        }
    }

    func stop() {
        motion.stopDeviceMotionUpdates()
        vector = .zero
        onUpdate?(.zero)
    }

    /// Fige la position actuelle comme position neutre.
    func calibrate() {
        guard let attitude = motion.deviceMotion?.attitude else { return }
        neutralPitch = attitude.pitch
        neutralRoll = attitude.roll
        vector = .zero
        onUpdate?(.zero)
    }

    private func handle(pitch: Double, roll: Double) {
        let x = (roll - neutralRoll) / fullScale
        let y = -(pitch - neutralPitch) / fullScale
        let clamped = InputArbiter.clampToUnitCircle(CGPoint(x: x, y: y))
        vector = clamped
        onUpdate?(clamped)
    }
}
