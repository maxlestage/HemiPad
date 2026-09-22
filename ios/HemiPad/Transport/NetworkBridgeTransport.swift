import Foundation
import Network
import OSLog

/// Transport « pont » : les rapports HID partent vers un petit boîtier qui les
/// rejoue sur le port USB de la console ou de l'ordinateur.
///
/// Le boîtier peut être un ESP32, un Raspberry Pi Zero en mode gadget USB, ou
/// l'agent de bureau HemiPad. Le protocole est volontairement trivial — une
/// trame binaire par rapport — pour qu'un microcontrôleur puisse le décoder
/// sans allocation :
///
///     octet 0      : 0xHE (0xHE = 0x48) en-tête
///     octet 1      : identifiant de rapport (1 = manette, 2 = clavier)
///     octet 2      : longueur de la charge utile
///     octets 3...n : charge utile HID brute
///
/// Le même flux binaire peut voyager en WebSocket (Wi‑Fi) ou en série USB.
final class NetworkBridgeTransport: NSObject, ControllerTransport {
    let kind: TransportKind = .bridge

    private(set) var state: ConnectionState = .idle {
        didSet { onStateChange?(state) }
    }
    var onStateChange: ((ConnectionState) -> Void)?

    /// Adresse du pont, ex. `ws://hemipad-bridge.local:8787`.
    var endpoint: URL

    private var session: URSSessionBox?
    private var task: URLSessionWebSocketTask?
    private var reconnectAttempts = 0
    private var keepAlive: Timer?
    private let logger = Logger(subsystem: "app.hemipad", category: "bridge")

    /// Boîte pour éviter de recréer une session à chaque reconnexion.
    private final class URSSessionBox {
        let session: URLSession
        init() {
            let configuration = URLSessionConfiguration.default
            configuration.waitsForConnectivity = true
            configuration.timeoutIntervalForRequest = 8
            session = URLSession(configuration: configuration)
        }
    }

    init(endpoint: URL) {
        self.endpoint = endpoint
        super.init()
    }

    func start() {
        state = .connecting(endpoint.host ?? "pont")
        let box = session ?? URSSessionBox()
        session = box
        let webSocket = box.session.webSocketTask(with: endpoint)
        task = webSocket
        webSocket.resume()
        listen()
        sendHandshake()
    }

    func stop() {
        keepAlive?.invalidate()
        keepAlive = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        reconnectAttempts = 0
        state = .idle
    }

    func send(reportID: HIDReportDescriptors.ReportID, payload: [UInt8]) {
        guard let task, state.isConnected else { return }
        var frame: [UInt8] = [0x48, reportID.rawValue, UInt8(min(payload.count, 255))]
        frame.append(contentsOf: payload)
        task.send(.data(Data(frame))) { [weak self] error in
            guard let error else { return }
            self?.handleFailure(error)
        }
    }

    // MARK: - Détails

    private func sendHandshake() {
        // Le pont répond par « ready » une fois le gadget USB énuméré côté hôte.
        let hello = ["type": "hello", "client": "HemiPad-iOS", "version": "1"]
        guard let data = try? JSONSerialization.data(withJSONObject: hello) else { return }
        task?.send(.data(data)) { [weak self] error in
            if let error {
                self?.handleFailure(error)
            }
        }
    }

    private func listen() {
        task?.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let message):
                self.handle(message)
                self.listen()
            case .failure(let error):
                self.handleFailure(error)
            }
        }
    }

    private func handle(_ message: URLSessionWebSocketTask.Message) {
        guard case .string(let text) = message else { return }
        if text.contains("ready") {
            reconnectAttempts = 0
            state = .connected(endpoint.host ?? "Pont HemiPad")
            startKeepAlive()
        } else if text.contains("detached") {
            state = .connecting(endpoint.host ?? "pont")
        }
    }

    private func startKeepAlive() {
        keepAlive?.invalidate()
        keepAlive = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            self?.task?.sendPing { error in
                if let error {
                    self?.handleFailure(error)
                }
            }
        }
    }

    private func handleFailure(_ error: Error) {
        logger.error("pont: \(error.localizedDescription)")
        keepAlive?.invalidate()
        keepAlive = nil
        state = .failed(TransportError.bridgeUnreachable(endpoint.host ?? "?").localizedDescription)
        scheduleReconnect()
    }

    /// Reconnexion à intervalle croissant : une console qui redémarre ne doit
    /// pas obliger la personne à rouvrir l'application.
    private func scheduleReconnect() {
        guard reconnectAttempts < 6 else { return }
        let delay = min(pow(2.0, Double(reconnectAttempts)), 16)
        reconnectAttempts += 1
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self, !self.state.isConnected else { return }
            self.start()
        }
    }
}

/// Découverte Bonjour des ponts présents sur le réseau local.
///
/// Évite de taper une adresse IP à une main : le pont s'annonce en
/// `_hemipad._tcp`, l'application propose la liste.
@MainActor
final class BridgeBrowser: ObservableObject {
    struct Discovered: Identifiable, Hashable {
        let id: String
        let name: String
        let endpoint: URL
    }

    @Published private(set) var found: [Discovered] = []

    private var browser: NWBrowser?

    func start() {
        guard browser == nil else { return }
        let parameters = NWParameters()
        parameters.includePeerToPeer = true
        let browser = NWBrowser(for: .bonjour(type: "_hemipad._tcp", domain: nil), using: parameters)
        browser.browseResultsChangedHandler = { [weak self] results, _ in
            Task { @MainActor in
                self?.found = results.compactMap { Self.discovered(from: $0) }
            }
        }
        browser.start(queue: .main)
        self.browser = browser
    }

    func stop() {
        browser?.cancel()
        browser = nil
        found = []
    }

    private static func discovered(from result: NWBrowser.Result) -> Discovered? {
        guard case .service(let name, _, _, _) = result.endpoint else { return nil }
        guard let url = URL(string: "ws://\(name).local:8787") else { return nil }
        return Discovered(id: name, name: name, endpoint: url)
    }
}
