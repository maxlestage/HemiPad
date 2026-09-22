import CoreGraphics
import Foundation

/// Filtre « one-euro » : lisse le tremblement sans ajouter de latence perçue
/// sur les gestes rapides.
///
/// Un lissage fixe (moyenne glissante) force un compromis désagréable : soit le
/// tremblement passe, soit la visée devient molle. Le one-euro adapte sa
/// fréquence de coupure à la vitesse du geste : immobile, il filtre fort ;
/// en mouvement franc, il s'efface.
struct OneEuroFilter {
    private var minCutoff: Double
    private var beta: Double
    private var derivativeCutoff: Double

    private var previousValue: Double?
    private var previousDerivative: Double = 0
    private var previousTimestamp: TimeInterval?

    init(minCutoff: Double = 1.0, beta: Double = 0.007, derivativeCutoff: Double = 1.0) {
        self.minCutoff = max(0.0001, minCutoff)
        self.beta = beta
        self.derivativeCutoff = max(0.0001, derivativeCutoff)
    }

    private static func alpha(cutoff: Double, deltaTime: Double) -> Double {
        let tau = 1.0 / (2 * Double.pi * cutoff)
        return 1.0 / (1.0 + tau / max(deltaTime, 0.0001))
    }

    mutating func filter(_ value: Double, timestamp: TimeInterval) -> Double {
        guard let previous = previousValue, let previousTime = previousTimestamp else {
            previousValue = value
            previousTimestamp = timestamp
            return value
        }

        let deltaTime = max(timestamp - previousTime, 0.0001)
        let rawDerivative = (value - previous) / deltaTime
        let derivativeAlpha = Self.alpha(cutoff: derivativeCutoff, deltaTime: deltaTime)
        let derivative = derivativeAlpha * rawDerivative + (1 - derivativeAlpha) * previousDerivative

        let cutoff = minCutoff + beta * abs(derivative)
        let valueAlpha = Self.alpha(cutoff: cutoff, deltaTime: deltaTime)
        let filtered = valueAlpha * value + (1 - valueAlpha) * previous

        previousValue = filtered
        previousDerivative = derivative
        previousTimestamp = timestamp
        return filtered
    }

    mutating func reset() {
        previousValue = nil
        previousDerivative = 0
        previousTimestamp = nil
    }
}

/// Filtre 2D appliqué à un stick, paramétré par l'intensité choisie dans le
/// profil d'accessibilité.
struct TremorFilter2D {
    private var xFilter: OneEuroFilter
    private var yFilter: OneEuroFilter
    private let deadzone: Double

    /// - Parameter damping: 0 = pas de filtrage, 1 = filtrage maximal.
    init(damping: Double, deadzone: Double) {
        let clamped = min(max(damping, 0), 1)
        // Plus l'amortissement monte, plus la fréquence de coupure descend.
        let minCutoff = 6.0 - 5.6 * clamped
        let beta = 0.02 * (1 - clamped) + 0.002
        xFilter = OneEuroFilter(minCutoff: minCutoff, beta: beta)
        yFilter = OneEuroFilter(minCutoff: minCutoff, beta: beta)
        self.deadzone = min(max(deadzone, 0), 0.9)
    }

    mutating func filter(_ point: CGPoint, timestamp: TimeInterval) -> CGPoint {
        let x = xFilter.filter(Double(point.x), timestamp: timestamp)
        let y = yFilter.filter(Double(point.y), timestamp: timestamp)
        return Self.applyDeadzone(CGPoint(x: x, y: y), deadzone: deadzone)
    }

    mutating func reset() {
        xFilter.reset()
        yFilter.reset()
    }

    /// Zone morte radiale avec remise à l'échelle : au-delà du seuil, la course
    /// utile repart de 0 pour ne pas perdre de précision.
    static func applyDeadzone(_ point: CGPoint, deadzone: Double) -> CGPoint {
        let magnitude = sqrt(Double(point.x * point.x + point.y * point.y))
        guard magnitude > 0 else { return .zero }
        guard magnitude > deadzone else { return .zero }
        let rescaled = (magnitude - deadzone) / (1 - deadzone)
        let clamped = min(rescaled, 1)
        let scale = clamped / magnitude
        return CGPoint(x: point.x * CGFloat(scale), y: point.y * CGFloat(scale))
    }
}
