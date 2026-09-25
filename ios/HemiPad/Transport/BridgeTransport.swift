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

/// Le chemin par le boîtier : les commandes partent en Wi-Fi, chiffrées et
/// signées, et le boîtier les rejoue vers la console.
///
/// Le contenu des trames ne passe pas en clair (ce qui est tapé au clavier ne
/// se lit pas sur le Wi-Fi), et rien ne peut être rejoué ni renvoyé : chaque
/// trame porte un compteur, son sens et une signature, le tout calculé par la
/// bibliothèque Rust, la même que celle du boîtier. Restent visibles : la
/// sorte de rapport et le rythme des trames.
///
/// Le compteur, la connexion et le minuteur ne sont touchés que depuis
/// `queue` : l'interface appelle `send` depuis le fil principal, le battement
/// part depuis `queue`, et deux trames ne doivent jamais porter le même
/// compteur.
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
    /// Compteur des trames émises. Il ne recule jamais, même d'une session à
    /// l'autre : un compteur qui recule ferait refuser nos propres trames par
    /// le boîtier, et — pire — réutiliserait le chiffrement d'une trame déjà
    /// partie, ce qui permettrait d'en deviner le contenu.
    ///
    /// Au démarrage, il repart au-dessus de tout ce qui a pu être émis : de
    /// l'heure (millisecondes), et de la réserve notée sur l'appareil. La
    /// réserve est inscrite *avant* d'être entamée : même si l'application
    /// s'arrête net, la session suivante repart plus haut. Et si l'heure de
    /// l'appareil est reculée, la réserve tient bon.
    private var counter: UInt64
    /// Jusqu'où le compteur peut monter avant d'inscrire une nouvelle réserve.
    private var reservedUpTo: UInt64
    /// Dernier compteur d'une réponse acceptée du boîtier. Sans lui, une
    /// réponse « battement » authentique captée sur le Wi-Fi pourrait être
    /// rejouée à l'infini pour faire croire le boîtier vivant.
    private var lastReplyCounter: UInt64 = 0
    private var heartbeatTimer: DispatchSourceTimer?

    /// Identifiant stable du boîtier, pour le registre des machines.
    private var machineID: UUID?

    init?(settings: BridgeSettings) {
        guard settings.isComplete, let key = Wire.key(fromHex: settings.keyHex) else { return nil }
        self.settings = settings
        self.key = key
        let clock = UInt64(max(0, Date().timeIntervalSince1970 * 1000))
        let start = max(clock, Self.storedReservation())
        counter = start
        reservedUpTo = start
        reserve(from: start)
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
            port: NWEndpoint.Port(rawValue: settings.port) ?? .init(integerLiteral: BridgeSettings.defaultPort)
        )
        let connection = NWConnection(to: endpoint, using: .udp)
        connection.stateUpdateHandler = { [weak self, weak connection] update in
            // Une connexion déjà remplacée (ou arrêtée) ne parle plus pour le
            // boîtier : son « annulée » ne doit pas écraser l'état de la
            // suivante.
            guard let self, let connection, self.connection === connection else { return }
            switch update {
            case .ready:
                // Prêt ne veut pas dire joignable : en UDP, rien ne le prouve
                // avant que le boîtier ait répondu. On attend son battement.
                self.receive()
                self.startHeartbeat()
            case .failed(let error):
                let message = "Boîtier injoignable : \(error.localizedDescription)"
                DispatchQueue.main.async { self.state = .failed(message) }
            case .cancelled:
                DispatchQueue.main.async { self.state = .idle }
            default:
                break
            }
        }
        queue.sync { self.connection = connection }
        connection.start(queue: queue)
    }

    func stop() {
        queue.sync {
            heartbeatTimer?.cancel()
            heartbeatTimer = nil
            connection?.cancel()
            connection = nil
        }
        if let machineID {
            onMachineEvent?(.disconnected(machineID))
            self.machineID = nil
        }
        state = .idle
    }

    func send(reportID: HIDReportDescriptors.ReportID, payload: [UInt8]) {
        queue.async { [weak self] in
            self?.transmit(rawReportID: reportID.rawValue, payload: payload)
        }
    }

    // MARK: - Détails

    /// Scelle et envoie une trame. Toujours sur `queue`.
    private func transmit(rawReportID: UInt8, payload: [UInt8]) {
        dispatchPrecondition(condition: .onQueue(queue))
        guard let connection, connection.state == .ready else { return }
        counter &+= 1
        if counter >= reservedUpTo {
            reserve(from: counter)
        }
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
            self?.transmit(rawReportID: Self.heartbeatReportID, payload: [])
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

    /// La réponse vient-elle bien du boîtier appairé, et n'est-elle ni une
    /// rejouée, ni une de nos propres trames renvoyée ? Une trame qui ne
    /// s'ouvre pas avec notre secret vient de quelqu'un d'autre ; une trame
    /// dont le compteur ne dépasse pas le dernier accepté est une rediffusion ;
    /// une trame qui va vers le boîtier n'est pas une réponse — refusée dans
    /// les trois cas.
    private func isGenuineReply(_ data: Data) -> Bool {
        guard data.count == Wire.frameLength,
              let opened = try? Wire.open(data, lastCounter: lastReplyCounter, key: key, direction: .toApp),
              opened.reportID == Self.heartbeatReportID else { return false }
        lastReplyCounter = opened.counter
        return true
    }

    // MARK: - Réserve du compteur

    private static let reservationKey = "hemipad.bridge.compteur"
    /// Taille d'une réserve : à 125 trames par seconde, de quoi tenir plus
    /// de dix minutes avant d'écrire à nouveau.
    private static let reservationBlock: UInt64 = 100_000

    private static func storedReservation() -> UInt64 {
        (UserDefaults.standard.object(forKey: reservationKey) as? NSNumber)?.uint64Value ?? 0
    }

    /// Inscrit une nouvelle réserve avant de l'entamer.
    private func reserve(from value: UInt64) {
        let (next, overflow) = value.addingReportingOverflow(Self.reservationBlock)
        reservedUpTo = overflow ? .max : next
        UserDefaults.standard.set(NSNumber(value: reservedUpTo), forKey: Self.reservationKey)
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
