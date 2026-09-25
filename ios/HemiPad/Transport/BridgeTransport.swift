import Foundation
import Network

/// Les coordonnées du boîtier : où le joindre, et avec quel secret.
///
/// Le secret est celui que l'installation du boîtier affiche. Il ne circule
/// jamais sur le réseau : il ne sert qu'à signer les trames.
struct BridgeSettings: Codable, Equatable {
    var host: String
    var port: UInt16
    /// Le secret, en hexadécimal, tel qu'on le recopie depuis le boîtier.
    var keyHex: String

    static let defaultPort: UInt16 = 45_800

    static let empty = BridgeSettings(host: "", port: defaultPort, keyHex: "")

    /// Y a-t-il de quoi tenter une connexion ?
    var isComplete: Bool {
        !host.trimmingCharacters(in: .whitespaces).isEmpty && Wire.key(fromHex: keyHex) != nil
    }
}

/// Le chemin par le boîtier : les commandes partent en Wi-Fi, signées, et le
/// boîtier les rejoue vers la console.
///
/// Rien n'est envoyé en clair et rien ne peut être rejoué : chaque trame porte
/// une signature et un compteur, tous deux calculés par la bibliothèque Rust,
/// la même que celle du boîtier.
final class BridgeTransport: ControllerTransport {
    let kind: TransportKind = .bridge

    private(set) var state: ConnectionState = .idle {
        didSet {
            guard state != oldValue else { return }
            onStateChange?(state)
        }
    }

    var onStateChange: ((ConnectionState) -> Void)?
    var onMachineEvent: ((MachineEvent) -> Void)?
    /// Prévenu chaque fois que le boîtier répond : c'est ce qui permet de
    /// savoir qu'il est là, sans rien demander à personne.
    var onHeartbeat: (() -> Void)?

    private let settings: BridgeSettings
    private let key: [UInt8]
    private var connection: NWConnection?
    private let queue = DispatchQueue(label: "app.hemipad.bridge")
    /// Compteur des trames émises. Jamais remis à zéro dans une session : un
    /// compteur qui recule ferait refuser nos propres trames.
    private var counter: UInt64 = 0
    private var heartbeatTimer: DispatchSourceTimer?

    /// Identifiant stable du boîtier, pour le registre des machines.
    private var machineID: UUID?

    init?(settings: BridgeSettings) {
        guard settings.isComplete, let key = Wire.key(fromHex: settings.keyHex) else { return nil }
        self.settings = settings
        self.key = key
    }

    func start() {
        guard Wire.isUsable else {
            state = .failed("La bibliothèque du pont n'est pas celle attendue.")
            return
        }
        stop()
        state = .connecting(settings.host)

        let endpoint = NWEndpoint.hostPort(
            host: NWEndpoint.Host(settings.host),
            port: NWEndpoint.Port(rawValue: settings.port) ?? .init(integerLiteral: 45_800)
        )
        let connection = NWConnection(to: endpoint, using: .udp)
        self.connection = connection
        connection.stateUpdateHandler = { [weak self] update in
            guard let self else { return }
            switch update {
            case .ready:
                // Prêt ne veut pas dire joignable : en UDP, rien ne le prouve
                // avant que le boîtier ait répondu. On attend son battement.
                self.receive()
                self.startHeartbeat()
            case .failed(let error):
                self.state = .failed("Boîtier injoignable : \(error.localizedDescription)")
            case .cancelled:
                self.state = .idle
            default:
                break
            }
        }
        connection.start(queue: queue)
    }

    func stop() {
        heartbeatTimer?.cancel()
        heartbeatTimer = nil
        connection?.cancel()
        connection = nil
        if let machineID {
            onMachineEvent?(.disconnected(machineID))
            self.machineID = nil
        }
        state = .idle
    }

    func send(reportID: HIDReportDescriptors.ReportID, payload: [UInt8]) {
        send(rawReportID: reportID.rawValue, payload: payload)
    }

    // MARK: - Détails

    private func send(rawReportID: UInt8, payload: [UInt8]) {
        guard let connection, connection.state == .ready else { return }
        counter &+= 1
        guard let frame = try? Wire.seal(
            reportID: rawReportID,
            payload: payload,
            counter: counter,
            key: key
        ) else { return }
        connection.send(content: frame, completion: .idempotent)
    }

    /// Un « es-tu là ? » régulier. Le boîtier renvoie la trame signée ; c'est
    /// à cette réponse, et à elle seule, qu'on le tient pour joignable.
    private func startHeartbeat() {
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now(), repeating: .milliseconds(400))
        timer.setEventHandler { [weak self] in
            self?.send(rawReportID: Self.heartbeatReportID, payload: [])
        }
        heartbeatTimer = timer
        timer.resume()
    }

    private func receive() {
        connection?.receiveMessage { [weak self] data, _, _, error in
            guard let self else { return }
            if let data, self.isGenuineReply(data) {
                self.noteAlive()
            }
            if error == nil {
                self.receive()
            }
        }
    }

    /// La réponse vient-elle bien du boîtier appairé ? Une trame qui ne
    /// s'ouvre pas avec notre secret vient de quelqu'un d'autre.
    private func isGenuineReply(_ data: Data) -> Bool {
        guard data.count == Wire.frameLength else { return false }
        let bytes = [UInt8](data)
        var reportID: UInt8 = 0
        var payload = [UInt8](repeating: 0, count: 16)
        var payloadLength = 0
        var received: UInt64 = 0
        let code = key.withUnsafeBufferPointer { keyBuffer in
            bytes.withUnsafeBufferPointer { frameBuffer in
                payload.withUnsafeMutableBufferPointer { payloadBuffer in
                    hemipad_wire_open(
                        keyBuffer.baseAddress,
                        keyBuffer.count,
                        frameBuffer.baseAddress,
                        frameBuffer.count,
                        0,
                        &reportID,
                        payloadBuffer.baseAddress,
                        payloadBuffer.count,
                        &payloadLength,
                        &received
                    )
                }
            }
        }
        return code == HEMIPAD_WIRE_OK && reportID == Self.heartbeatReportID
    }

    private func noteAlive() {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.onHeartbeat?()
            if self.machineID == nil {
                // Un identifiant stable tiré des coordonnées : le même boîtier
                // est reconnu d'une session à l'autre.
                let id = Self.identifier(for: self.settings)
                self.machineID = id
                self.onMachineEvent?(.connected(id))
            }
            self.state = .connected(self.settings.host)
        }
    }

    /// Identifiant de rapport du battement, côté protocole du pont.
    private static let heartbeatReportID: UInt8 = 3

    /// Un UUID stable, déduit de l'adresse du boîtier.
    private static func identifier(for settings: BridgeSettings) -> UUID {
        var bytes = [UInt8](repeating: 0, count: 16)
        let source = Array("\(settings.host):\(settings.port)".utf8)
        for (index, byte) in source.enumerated() {
            bytes[index % 16] ^= byte
        }
        // Marque de version 4, pour que ce soit un UUID bien formé.
        bytes[6] = (bytes[6] & 0x0F) | 0x40
        bytes[8] = (bytes[8] & 0x3F) | 0x80
        return UUID(uuid: (
            bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
            bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
        ))
    }
}
