import Foundation

/// Les trois façons dont HemiPad peut atteindre une machine.
enum TransportKind: String, Codable, CaseIterable, Identifiable, Sendable {
    /// HID over GATT : l'iPhone se présente lui-même comme une manette Bluetooth.
    case bluetoothHID
    /// Pont matériel ou logiciel (ESP32, Raspberry Pi en gadget USB, agent de
    /// bureau) qui rejoue les rapports HID sur le port USB de la machine.
    case bridge
    /// Boucle locale : rien n'est émis, tout est journalisé. Sert aux essais
    /// et aux aperçus SwiftUI.
    case loopback

    var id: String { rawValue }

    var label: String {
        switch self {
        case .bluetoothHID: return "Bluetooth HID"
        case .bridge: return "Pont HemiPad"
        case .loopback: return "Mode démo"
        }
    }

    var detail: String {
        switch self {
        case .bluetoothHID:
            return "L'iPhone s'annonce comme manette. Dépend du niveau d'accès HID accordé par iOS."
        case .bridge:
            return "Un petit boîtier USB (ESP32, Pi Zero) ou l'agent de bureau reçoit les rapports et les rejoue."
        case .loopback:
            return "Aucune émission : pour régler la manette sans console sous la main."
        }
    }
}

/// État d'une connexion, affiché tel quel dans la barre d'état.
enum ConnectionState: Equatable, Sendable {
    case idle
    case preparing
    case advertising
    case connecting(String)
    case connected(String)
    case failed(String)

    var isConnected: Bool {
        if case .connected = self { return true }
        return false
    }

    var label: String {
        switch self {
        case .idle: return "Hors ligne"
        case .preparing: return "Préparation"
        case .advertising: return "Visible · appairez depuis la console"
        case .connecting(let name): return "Connexion à \(name)"
        case .connected(let name): return "Connecté · \(name)"
        case .failed(let reason): return reason
        }
    }
}

/// Erreurs remontées à l'interface sans jargon.
enum TransportError: LocalizedError, Equatable {
    case bluetoothUnavailable
    case hidServiceRejected
    case notConnected
    case bridgeUnreachable(String)

    var errorDescription: String? {
        switch self {
        case .bluetoothUnavailable:
            return "Bluetooth indisponible. Activez-le dans les Réglages."
        case .hidServiceRejected:
            return "iOS a refusé de publier le service HID. Passez par le pont HemiPad."
        case .notConnected:
            return "Aucune machine connectée."
        case .bridgeUnreachable(let host):
            return "Pont injoignable à l'adresse \(host)."
        }
    }
}

/// Contrat commun à tous les transports.
///
/// Un transport ne connaît ni l'accessibilité ni les consoles : il reçoit des
/// octets HID déjà encodés et les achemine. Cette frontière permet d'ajouter
/// un pont (USB, réseau, matériel) sans toucher au reste de l'application.
protocol ControllerTransport: AnyObject {
    var kind: TransportKind { get }
    var state: ConnectionState { get }
    var onStateChange: ((ConnectionState) -> Void)? { get set }

    func start()
    func stop()
    /// Envoie une charge utile déjà encodée pour l'identifiant de rapport donné.
    func send(reportID: HIDReportDescriptors.ReportID, payload: [UInt8])
}
