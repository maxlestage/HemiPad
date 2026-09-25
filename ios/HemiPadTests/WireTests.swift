import XCTest
@testable import HemiPad

/// La bibliothèque Rust, appelée comme l'application l'appelle.
///
/// Ces essais ne refont pas ceux du Rust — le format des trames et la règle du
/// choix y sont déjà vérifiés. Ils vérifient l'autre chose, celle qui casserait
/// en silence : que l'enveloppe Swift passe bien les bons octets, dans le bon
/// sens, à travers l'ABI C.
final class WireTests: XCTestCase {
    private let key = [UInt8](repeating: 0x5A, count: 32)

    func testTheLinkedLibraryIsTheOneExpected() {
        XCTAssertTrue(Wire.isUsable, "l'ABI de la bibliothèque liée a changé")
        XCTAssertEqual(Wire.frameLength, 44)
        XCTAssertEqual(Wire.keyLength, 32)
    }

    func testAGamepadReportIsSealedIntoAFrame() throws {
        let payload: [UInt8] = [128, 128, 200, 60, 0, 255, 8, 0x01, 0x80]
        let frame = try Wire.seal(
            reportID: HIDReportDescriptors.ReportID.gamepad.rawValue,
            payload: payload,
            counter: 7,
            key: key
        )
        XCTAssertEqual(frame.count, Wire.frameLength)
        XCTAssertEqual(Array(frame.prefix(4)), Array("HPB2".utf8), "la trame porte sa marque")
        XCTAssertEqual(frame[6], Wire.Direction.toBridge.rawValue, "la trame porte son sens")
        // La charge utile ne passe pas en clair…
        XCTAssertNotEqual(Array(frame[16..<25]), payload)
        // … mais le boîtier la retrouve intacte.
        let opened = try Wire.open(frame, lastCounter: 6, key: key, direction: .toBridge)
        XCTAssertEqual(opened.payload, payload)
        XCTAssertEqual(opened.counter, 7)
    }

    /// Nos propres battements, renvoyés par quelqu'un d'autre sur le Wi-Fi, ne
    /// doivent pas faire croire que le boîtier répond.
    func testAFrameSentBackToTheAppIsRefused() throws {
        let heartbeat = try Wire.seal(reportID: 3, payload: [], counter: 10, key: key)
        XCTAssertThrowsError(try Wire.open(heartbeat, lastCounter: 0, key: key)) { error in
            XCTAssertEqual(error as? Wire.Failure, .wrongDirection)
        }
        let reply = try Wire.seal(reportID: 3, payload: [], counter: 10, key: key, direction: .toApp)
        XCTAssertEqual(try Wire.open(reply, lastCounter: 0, key: key).reportID, 3)
        XCTAssertThrowsError(try Wire.open(reply, lastCounter: 10, key: key)) { error in
            XCTAssertEqual(error as? Wire.Failure, .replay)
        }
    }

    func testTwoFramesOfTheSameReportDifferByTheirSignature() throws {
        let payload = [UInt8](repeating: 0, count: 9)
        let first = try Wire.seal(reportID: 1, payload: payload, counter: 1, key: key)
        let second = try Wire.seal(reportID: 1, payload: payload, counter: 2, key: key)
        XCTAssertNotEqual(first.suffix(16), second.suffix(16), "le compteur est signé")
    }

    func testAPayloadOfTheWrongLengthIsRefused() {
        XCTAssertThrowsError(
            try Wire.seal(reportID: 1, payload: [0, 0, 0], counter: 1, key: key)
        ) { error in
            XCTAssertEqual(error as? Wire.Failure, .badPayloadLength)
        }
    }

    func testAKeyOfTheWrongLengthIsRefused() {
        XCTAssertThrowsError(
            try Wire.seal(
                reportID: 1,
                payload: [UInt8](repeating: 0, count: 9),
                counter: 1,
                key: [1, 2, 3]
            )
        ) { error in
            XCTAssertEqual(error as? Wire.Failure, .badKeyLength)
        }
    }

    func testASecretIsReadFromItsHexadecimalForm() {
        let text = String(repeating: "a1", count: 32)
        let parsed = Wire.key(fromHex: text)
        XCTAssertEqual(parsed?.count, 32)
        XCTAssertEqual(parsed?.first, 0xA1)
        // Les espaces autour ne gênent pas : on recopie depuis un terminal.
        XCTAssertEqual(Wire.key(fromHex: "  \(text)\n"), parsed)
    }

    func testAMalformedSecretIsRefused() {
        XCTAssertNil(Wire.key(fromHex: ""))
        XCTAssertNil(Wire.key(fromHex: "a1a1"), "trop court")
        XCTAssertNil(Wire.key(fromHex: String(repeating: "a", count: 65)), "longueur impaire")
        XCTAssertNil(Wire.key(fromHex: String(repeating: "zz", count: 32)), "hors hexadécimal")
        XCTAssertNil(Wire.key(fromHex: String(repeating: "+f", count: 32)), "signe accepté par Swift, pas ici")
    }
}

/// Le choix du chemin, tel que le coordinateur s'en sert.
final class PathChooserTests: XCTestCase {
    func testWithNothingConnectedThereIsNoPath() {
        let chooser = PathChooser(settleMilliseconds: 1_000, bridgeTimeoutMilliseconds: 2_000)
        XCTAssertEqual(chooser.path(now: 0), .none)
    }

    func testASinglePathIsTakenAtOnce() {
        let direct = PathChooser(settleMilliseconds: 1_000, bridgeTimeoutMilliseconds: 2_000)
        direct.setDirect(connected: true, now: 0)
        XCTAssertEqual(direct.path(now: 0), .direct)

        let bridge = PathChooser(settleMilliseconds: 1_000, bridgeTimeoutMilliseconds: 2_000)
        bridge.bridgeSeen(now: 0)
        XCTAssertEqual(bridge.path(now: 0), .bridge)
    }

    /// Le cas qui compte : le boîtier tient la partie, le Bluetooth direct
    /// revient. On ne lui rend la main qu'une fois qu'il a tenu.
    func testAFreshlyReturnedDirectWaitsItsTurn() {
        let chooser = PathChooser(settleMilliseconds: 1_000, bridgeTimeoutMilliseconds: 2_000)
        chooser.bridgeSeen(now: 0)
        XCTAssertEqual(chooser.path(now: 0), .bridge)

        chooser.setDirect(connected: true, now: 100)
        chooser.bridgeSeen(now: 100)
        XCTAssertEqual(chooser.path(now: 100), .bridge, "à peine arrivé")

        chooser.bridgeSeen(now: 1_100)
        XCTAssertEqual(chooser.path(now: 1_100), .direct, "il a tenu")
    }

    func testADeadPathIsLeftAtOnce() {
        let chooser = PathChooser(settleMilliseconds: 1_000, bridgeTimeoutMilliseconds: 2_000)
        chooser.setDirect(connected: true, now: 0)
        chooser.bridgeSeen(now: 0)
        XCTAssertEqual(chooser.path(now: 1_500), .direct)

        chooser.setDirect(connected: false, now: 1_600)
        chooser.bridgeSeen(now: 1_600)
        XCTAssertEqual(chooser.path(now: 1_600), .bridge, "bascule immédiate")
    }

    func testASilentBridgeIsGivenUp() {
        let chooser = PathChooser(settleMilliseconds: 1_000, bridgeTimeoutMilliseconds: 2_000)
        chooser.bridgeSeen(now: 0)
        XCTAssertEqual(chooser.path(now: 1_999), .bridge)
        XCTAssertEqual(chooser.path(now: 2_000), .none)
    }

    /// Le défaut à ne jamais avoir : un lien qui va et vient ferait alterner
    /// les chemins plusieurs fois par seconde, et la manette deviendrait
    /// inutilisable.
    func testAFlappingDirectNeverMakesThePathDance() {
        let chooser = PathChooser(settleMilliseconds: 1_000, bridgeTimeoutMilliseconds: 2_000)
        chooser.bridgeSeen(now: 0)
        var instant: UInt64 = 0
        for _ in 0..<10 {
            chooser.setDirect(connected: true, now: instant)
            chooser.bridgeSeen(now: instant)
            XCTAssertEqual(chooser.path(now: instant), .bridge)
            instant += 200

            chooser.setDirect(connected: false, now: instant)
            chooser.bridgeSeen(now: instant)
            XCTAssertEqual(chooser.path(now: instant), .bridge)
            instant += 200
        }
    }
}

/// Les coordonnées du boîtier.
final class BridgeSettingsTests: XCTestCase {
    func testIncompleteSettingsAreNotUsable() {
        XCTAssertFalse(BridgeSettings.empty.isComplete)
        XCTAssertFalse(
            BridgeSettings(host: "hemipad.local", port: 45_800, keyHex: "trop court").isComplete
        )
        XCTAssertFalse(
            BridgeSettings(host: "  ", port: 45_800, keyHex: String(repeating: "a1", count: 32))
                .isComplete
        )
    }

    func testCompleteSettingsAreUsable() {
        let settings = BridgeSettings(
            host: "hemipad.local",
            port: 45_800,
            keyHex: String(repeating: "a1", count: 32)
        )
        XCTAssertTrue(settings.isComplete)
        XCTAssertNil(BridgeTransport(settings: .empty), "rien à joindre : pas de transport")
        XCTAssertNotNil(BridgeTransport(settings: settings))
    }
}
