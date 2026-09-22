import CoreGraphics
import Foundation

/// État instantané de la manette virtuelle.
///
/// C'est la seule structure que les vues manipulent ; l'encodage HID en dérive.
struct GamepadState: Equatable, Sendable {
    /// Boutons actuellement enfoncés (physiquement ou verrouillés).
    var pressed: Set<ControlID> = []

    /// Axes des sticks, dans [-1, 1]. Y positif = vers le haut à l'écran.
    var leftStick: CGPoint = .zero
    var rightStick: CGPoint = .zero

    /// Course analogique des gâchettes, dans [0, 1].
    var leftTrigger: Double = 0
    var rightTrigger: Double = 0

    func isPressed(_ control: ControlID) -> Bool {
        pressed.contains(control)
    }

    mutating func set(_ control: ControlID, pressed isDown: Bool) {
        if isDown {
            pressed.insert(control)
        } else {
            pressed.remove(control)
        }
        if control.isAnalogTrigger {
            let value: Double = isDown ? 1 : 0
            if control == .triggerLeft { leftTrigger = value } else { rightTrigger = value }
        }
    }

    mutating func stick(_ id: StickID, movedTo point: CGPoint) {
        switch id {
        case .left: leftStick = point
        case .right: rightStick = point
        }
    }

    func stick(_ id: StickID) -> CGPoint {
        id == .left ? leftStick : rightStick
    }

    /// Valeur 0…7 du « hat switch » HID (8 = repos), déduite de la croix.
    var hatSwitch: UInt8 {
        let up = isPressed(.dpadUp)
        let down = isPressed(.dpadDown)
        let left = isPressed(.dpadLeft)
        let right = isPressed(.dpadRight)

        switch (up, right, down, left) {
        case (true, false, false, false): return 0
        case (true, true, false, false): return 1
        case (false, true, false, false): return 2
        case (false, true, true, false): return 3
        case (false, false, true, false): return 4
        case (false, false, true, true): return 5
        case (false, false, false, true): return 6
        case (true, false, false, true): return 7
        default: return 8 // état nul
        }
    }

    static let neutral = GamepadState()
}
