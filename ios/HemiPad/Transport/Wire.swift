import Foundation

/// La bibliothèque Rust, vue depuis Swift.
///
/// Le format des trames du pont et le choix du chemin sont écrits une fois, en
/// Rust, et appelés des deux côtés : par le boîtier et par l'application. Un
/// seul code, donc aucune chance que les deux bouts cessent d'être d'accord
/// sur un octet — c'est exactement le genre de désaccord qui ne se voit qu'en
/// pleine partie.
enum Wire {
    /// La version d'ABI que cette application sait parler.
    static let expectedABIVersion: Int32 = 2

    /// La bibliothèque liée est-elle celle attendue ? Vérifié une fois au
    /// démarrage : mieux vaut refuser le pont que décaler les octets.
    static var isUsable: Bool {
        hemipad_wire_abi_version() == expectedABIVersion
    }

    static var frameLength: Int { hemipad_wire_frame_len() }
    static var keyLength: Int { hemipad_wire_key_len() }

    /// Dans quel sens va une trame. Le sens est signé : une trame renvoyée
    /// telle quelle à son expéditeur est refusée.
    enum Direction: UInt8 {
        /// De l'application vers le boîtier.
        case toBridge = 0
        /// Du boîtier vers l'application.
        case toApp = 1
    }

    /// Une trame ouverte : ce qu'elle porte, une fois vérifiée et déchiffrée.
    struct Opened: Equatable {
        let reportID: UInt8
        let payload: [UInt8]
        let counter: UInt64
    }

    /// Ce qui a empêché de sceller ou d'ouvrir une trame.
    enum Failure: Error, Equatable {
        case badKeyLength
        case badPayloadLength
        case unknownReport
        case badSignature
        case replay
        case wrongDirection
        case other(Int32)

        init(code: Int32) {
            switch code {
            case HEMIPAD_WIRE_KEY_LENGTH: self = .badKeyLength
            case HEMIPAD_WIRE_PAYLOAD_LENGTH: self = .badPayloadLength
            case HEMIPAD_WIRE_UNKNOWN_REPORT: self = .unknownReport
            case HEMIPAD_WIRE_SIGNATURE: self = .badSignature
            case HEMIPAD_WIRE_REPLAY: self = .replay
            case HEMIPAD_WIRE_DIRECTION: self = .wrongDirection
            default: self = .other(code)
            }
        }
    }

    /// Scelle un rapport dans une trame prête à partir vers le boîtier : la
    /// charge utile est chiffrée, puis le tout signé.
    ///
    /// `counter` doit augmenter à chaque trame : c'est ce qui interdit à
    /// quelqu'un d'autre sur le Wi-Fi de rejouer une trame capturée.
    static func seal(
        reportID: UInt8,
        payload: [UInt8],
        counter: UInt64,
        key: [UInt8],
        direction: Direction = .toBridge
    ) throws -> Data {
        var frame = [UInt8](repeating: 0, count: frameLength)
        let code = key.withUnsafeBufferPointer { keyBuffer in
            payload.withUnsafeBufferPointer { payloadBuffer in
                frame.withUnsafeMutableBufferPointer { frameBuffer in
                    hemipad_wire_seal(
                        keyBuffer.baseAddress,
                        keyBuffer.count,
                        direction.rawValue,
                        reportID,
                        payloadBuffer.baseAddress,
                        payloadBuffer.count,
                        counter,
                        frameBuffer.baseAddress,
                        frameBuffer.count
                    )
                }
            }
        }
        guard code == HEMIPAD_WIRE_OK else { throw Failure(code: code) }
        return Data(frame)
    }

    /// Ouvre une trame reçue : signature, sens et compteur vérifiés, puis
    /// charge utile déchiffrée. `lastCounter` est le dernier compteur accepté.
    static func open(
        _ data: Data,
        lastCounter: UInt64,
        key: [UInt8],
        direction: Direction = .toApp
    ) throws -> Opened {
        let bytes = [UInt8](data)
        var reportID: UInt8 = 0
        // Une trame entière : toujours assez pour sa charge utile.
        var payload = [UInt8](repeating: 0, count: frameLength)
        var payloadLength = 0
        var counter: UInt64 = 0
        let code = key.withUnsafeBufferPointer { keyBuffer in
            bytes.withUnsafeBufferPointer { frameBuffer in
                payload.withUnsafeMutableBufferPointer { payloadBuffer in
                    hemipad_wire_open(
                        keyBuffer.baseAddress,
                        keyBuffer.count,
                        direction.rawValue,
                        frameBuffer.baseAddress,
                        frameBuffer.count,
                        lastCounter,
                        &reportID,
                        payloadBuffer.baseAddress,
                        payloadBuffer.count,
                        &payloadLength,
                        &counter
                    )
                }
            }
        }
        guard code == HEMIPAD_WIRE_OK else { throw Failure(code: code) }
        return Opened(reportID: reportID, payload: Array(payload.prefix(payloadLength)), counter: counter)
    }

    /// Lit un secret partagé écrit en hexadécimal, tel que l'installation du
    /// boîtier l'affiche. Rend `nil` s'il n'a pas la bonne forme.
    static func key(fromHex text: String) -> [UInt8]? {
        let trimmed = Array(text.trimmingCharacters(in: .whitespacesAndNewlines).utf8)
        guard trimmed.count == keyLength * 2 else { return nil }
        // Chiffres hexadécimaux seulement : `UInt8("+f", radix: 16)` serait
        // accepté par Swift, et deux écritures différentes donneraient alors
        // le même secret.
        func digit(_ character: UInt8) -> UInt8? {
            switch character {
            case UInt8(ascii: "0")...UInt8(ascii: "9"): return character - UInt8(ascii: "0")
            case UInt8(ascii: "a")...UInt8(ascii: "f"): return character - UInt8(ascii: "a") + 10
            case UInt8(ascii: "A")...UInt8(ascii: "F"): return character - UInt8(ascii: "A") + 10
            default: return nil
            }
        }
        var bytes: [UInt8] = []
        bytes.reserveCapacity(keyLength)
        var index = 0
        while index < trimmed.count {
            guard let high = digit(trimmed[index]), let low = digit(trimmed[index + 1]) else { return nil }
            bytes.append(high << 4 | low)
            index += 2
        }
        return bytes
    }
}

/// Par où l'application parle à la console.
enum ConnectionPath: UInt8 {
    /// Rien de joignable.
    case none = 0
    /// L'appareil s'annonce lui-même comme manette Bluetooth.
    case direct = 1
    /// Par le boîtier, joint en Wi-Fi.
    case bridge = 2

    var label: String {
        switch self {
        case .none: return "Aucun chemin"
        case .direct: return "Bluetooth direct"
        case .bridge: return "Par le boîtier"
        }
    }
}

/// Le choix du chemin, décidé par la bibliothèque Rust.
///
/// Rien de tout cela n'est un réglage : personne n'a envie d'ouvrir un menu,
/// une manette dans la main valide, parce que le lien vient de tomber. La
/// règle est dans le Rust, avec ses essais ; ici on ne fait que lui donner ce
/// qu'on observe.
final class PathChooser {
    private var state = HemipadChooser()

    init() {
        hemipad_wire_chooser_init(&state)
    }

    /// Règle les délais. Surtout utile aux essais.
    init(settleMilliseconds: UInt64, bridgeTimeoutMilliseconds: UInt64) {
        hemipad_wire_chooser_set_timings(&state, settleMilliseconds, bridgeTimeoutMilliseconds)
    }

    /// Une machine s'est abonnée, ou détachée, en Bluetooth direct.
    func setDirect(connected: Bool, now: UInt64 = PathChooser.now()) {
        hemipad_wire_chooser_set_direct(&state, connected, now)
    }

    /// Le boîtier vient de répondre.
    func bridgeSeen(now: UInt64 = PathChooser.now()) {
        hemipad_wire_chooser_bridge_seen(&state, now)
    }

    /// Le chemin à prendre maintenant.
    func path(now: UInt64 = PathChooser.now()) -> ConnectionPath {
        ConnectionPath(rawValue: hemipad_wire_chooser_path(&state, now)) ?? .none
    }

    /// Une horloge qui ne recule pas, même si l'heure de l'appareil change.
    static func now() -> UInt64 {
        UInt64(DispatchTime.now().uptimeNanoseconds / 1_000_000)
    }
}
