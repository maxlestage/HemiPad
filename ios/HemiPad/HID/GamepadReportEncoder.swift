import CoreGraphics
import Foundation

/// Transforme un `GamepadState` en charge utile HID de 9 octets.
///
/// L'encodeur est volontairement sans état : il est testable directement et
/// peut être appelé depuis n'importe quelle file.
struct GamepadReportEncoder {
    static let payloadLength = 9

    /// Convertit un axe de [-1, 1] vers l'intervalle HID [0, 255] (128 = centre).
    /// L'axe Y est inversé : à l'écran Y monte, en HID Y descend.
    static func encodeAxis(_ value: Double, invert: Bool = false) -> UInt8 {
        let clamped = min(max(value, -1), 1)
        let oriented = invert ? -clamped : clamped
        let scaled = (oriented + 1) * 127.5
        return UInt8(min(max(scaled.rounded(), 0), 255))
    }

    /// Convertit une course de gâchette de [0, 1] vers [0, 255].
    static func encodeTrigger(_ value: Double) -> UInt8 {
        let clamped = min(max(value, 0), 1)
        return UInt8((clamped * 255).rounded())
    }

    /// Masque 16 bits des boutons, selon la table `ControlID.hidButtonIndex`.
    static func buttonMask(for state: GamepadState) -> UInt16 {
        var mask: UInt16 = 0
        for control in state.pressed {
            guard let index = control.hidButtonIndex, (1...16).contains(index) else { continue }
            mask |= UInt16(1) << UInt16(index - 1)
        }
        return mask
    }

    func encode(_ state: GamepadState) -> [UInt8] {
        let mask = Self.buttonMask(for: state)
        return [
            Self.encodeAxis(Double(state.leftStick.x)),
            Self.encodeAxis(Double(state.leftStick.y), invert: true),
            Self.encodeAxis(Double(state.rightStick.x)),
            Self.encodeAxis(Double(state.rightStick.y), invert: true),
            Self.encodeTrigger(state.leftTrigger),
            Self.encodeTrigger(state.rightTrigger),
            state.hatSwitch & 0x0F,
            UInt8(mask & 0x00FF),
            UInt8((mask >> 8) & 0x00FF)
        ]
    }
}
