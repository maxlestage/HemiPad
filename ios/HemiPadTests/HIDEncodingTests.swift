import CoreGraphics
import XCTest
@testable import HemiPad

/// Les rapports HID sont le contrat avec la console : une erreur d'octet et
/// le personnage part à gauche quand le pouce va à droite.
final class HIDEncodingTests: XCTestCase {
    private let encoder = GamepadReportEncoder()

    func testNeutralStateIsCentered() {
        let payload = encoder.encode(.neutral)
        XCTAssertEqual(payload.count, GamepadReportEncoder.payloadLength)
        XCTAssertEqual(payload[0], 128, "stick gauche X au repos")
        XCTAssertEqual(payload[1], 128, "stick gauche Y au repos")
        XCTAssertEqual(payload[2], 128)
        XCTAssertEqual(payload[3], 128)
        XCTAssertEqual(payload[4], 0, "gâchette gauche relâchée")
        XCTAssertEqual(payload[5], 0)
        XCTAssertEqual(payload[6], 8, "hat switch à l'état nul")
        XCTAssertEqual(payload[7], 0)
        XCTAssertEqual(payload[8], 0)
    }

    func testAxisBoundsMapToFullRange() {
        XCTAssertEqual(GamepadReportEncoder.encodeAxis(-1), 0)
        XCTAssertEqual(GamepadReportEncoder.encodeAxis(1), 255)
        XCTAssertEqual(GamepadReportEncoder.encodeAxis(0), 128)
        // Une valeur hors bornes ne doit pas déborder l'octet.
        XCTAssertEqual(GamepadReportEncoder.encodeAxis(4.2), 255)
        XCTAssertEqual(GamepadReportEncoder.encodeAxis(-9), 0)
    }

    func testVerticalAxisIsInvertedForHID() {
        var state = GamepadState()
        state.leftStick = CGPoint(x: 0, y: 1) // pouce vers le haut de l'écran
        let payload = encoder.encode(state)
        XCTAssertEqual(payload[1], 0, "en HID, l'axe Y croît vers le bas")
    }

    func testButtonMaskUsesDeclaredIndices() {
        var state = GamepadState()
        state.set(.faceSouth, pressed: true)   // bouton 1
        state.set(.stickRightPress, pressed: true) // bouton 12
        let mask = GamepadReportEncoder.buttonMask(for: state)
        XCTAssertEqual(mask, 0b0000_1000_0000_0001)
    }

    func testAnalogTriggerFollowsButtonPress() {
        var state = GamepadState()
        state.set(.triggerRight, pressed: true)
        let payload = encoder.encode(state)
        XCTAssertEqual(payload[5], 255, "la gâchette droite part à fond")
        XCTAssertEqual(GamepadReportEncoder.buttonMask(for: state), 1 << 7)
    }

    func testHatSwitchCoversDiagonals() {
        var state = GamepadState()
        state.set(.dpadUp, pressed: true)
        XCTAssertEqual(state.hatSwitch, 0)
        state.set(.dpadRight, pressed: true)
        XCTAssertEqual(state.hatSwitch, 1, "haut + droite = diagonale")
        state.set(.dpadUp, pressed: false)
        XCTAssertEqual(state.hatSwitch, 2)
        // Deux directions opposées s'annulent plutôt que d'envoyer du bruit.
        state.set(.dpadLeft, pressed: true)
        XCTAssertEqual(state.hatSwitch, 8)
    }

    func testDescriptorsAreWellFormedCollections() {
        // Autant d'ouvertures que de fermetures de collection : un descripteur
        // déséquilibré est rejeté silencieusement par l'hôte.
        for descriptor in [HIDReportDescriptors.gamepad, HIDReportDescriptors.keyboard] {
            var open = 0
            var index = 0
            while index < descriptor.count {
                let item = descriptor[index]
                if item == 0xA1 { open += 1 }
                if item == 0xC0 { open -= 1 }
                // Taille de l'élément encodée dans les deux bits de poids faible.
                let size = Int(item & 0x03)
                index += 1 + (size == 3 ? 4 : size)
            }
            XCTAssertEqual(open, 0)
        }
    }
}

final class KeyboardEncodingTests: XCTestCase {
    private let encoder = KeyboardReportEncoder()

    func testReportLayout() {
        let payload = encoder.encode(modifiers: [.leftShift, .leftGUI], keys: [.a, .b])
        XCTAssertEqual(payload.count, 8)
        XCTAssertEqual(payload[0], KeyModifier.leftShift.rawValue | KeyModifier.leftGUI.rawValue)
        XCTAssertEqual(payload[1], 0)
        XCTAssertEqual(payload[2], KeyUsage.a.rawValue)
        XCTAssertEqual(payload[3], KeyUsage.b.rawValue)
    }

    func testAtMostSixKeys() {
        let keys: [KeyUsage] = [.a, .b, .c, .d, .e, .f, .g]
        let payload = encoder.encode(modifiers: [], keys: keys)
        XCTAssertEqual(payload.count, 8)
        XCTAssertEqual(payload[7], KeyUsage.f.rawValue, "la septième touche est ignorée")
    }

    func testUppercaseImpliesShift() {
        let stroke = Keystroke.stroke(for: "Q")
        XCTAssertEqual(stroke?.usage, .q)
        XCTAssertEqual(stroke?.modifiers, .leftShift)
    }

    func testCodePunctuationIsTypable() {
        // Sans ces caractères, écrire du code au clavier HemiPad est impossible.
        for character in "{}[]()<>;:=+-_/\\|*&^%$#@!?~`'\"" {
            XCTAssertNotNil(Keystroke.stroke(for: character), "caractère manquant : \(character)")
        }
    }

    func testPressAndReleaseAlwaysReleases() {
        let frames = encoder.pressAndRelease(Keystroke(.s, modifiers: .leftGUI))
        XCTAssertEqual(frames.count, 2)
        XCTAssertEqual(frames[1], [UInt8](repeating: 0, count: 8))
    }
}
