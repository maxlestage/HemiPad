import Foundation

/// Les façons dont HemiPad peut atteindre une machine.
///
/// Aucune ne demande de matériel en plus : l'iPhone ou l'iPad fait tout lui-
/// même. Le pont USB a été retiré — il fallait acheter et brancher un boîtier.
enum TransportKind: String, Codable, CaseIterable, Identifiable, Sendable {
    /// HID over GATT : l'iPhone ou l'iPad se présente lui-même comme une
    /// manette Bluetooth, sous le nom HemiPad.
    case bluetoothHID
    /// Par le boîtier, joint en Wi-Fi, qui rejoue les commandes sur le port
    /// USB ou en Bluetooth vers la console.
    case bridge
    /// Boucle locale : rien n'est émis, tout est journalisé. Sert aux essais
    /// et aux aperçus SwiftUI.
    case loopback

    var id: String { rawValue }

    var label: String {
        switch self {
        case .bluetoothHID: return "Bluetooth direct"
        case .bridge: return "Par le boîtier"
        case .loopback: return "Mode démo"
        }
    }

    var detail: String {
        switch self {
        case .bluetoothHID:
            return "L'appareil s'annonce comme manette HemiPad, sans boîtier ni câble. Accepté par les ordinateurs (Windows, Linux) et Android."
        case .bridge:
            return "Les commandes passent par le boîtier, en Wi-Fi. Lui se présente à la console en Bluetooth ou par le câble : c'est ce qui atteint la Switch."
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
    case advertisingRefused
    case bluetoothPaused

    var errorDescription: String? {
        switch self {
        case .bluetoothUnavailable:
            return "Bluetooth indisponible. Activez-le dans les Réglages."
        case .hidServiceRejected:
            return "iOS a refusé de publier le service manette. Coupez puis rallumez le Bluetooth, puis réessayez."
        case .notConnected:
            return "Aucune machine connectée."
        case .advertisingRefused:
            return "iOS a refusé de lancer l'annonce Bluetooth."
        case .bluetoothPaused:
            return "Le Bluetooth s'est arrêté pendant sa mise en route : il est en pause pour que l'application reste utilisable. Touchez « Réessayer » pour le relancer."
        }
    }
}

/// Une machine qui se connecte ou se déconnecte, reconnue par l'identifiant
/// que iOS lui donne. C'est ce qui permet de la mémoriser.
enum MachineEvent: Equatable, Sendable {
    case connected(UUID)
    case disconnected(UUID)
}

/// Contrat commun à tous les transports.
///
/// Un transport ne connaît ni l'accessibilité ni les consoles : il reçoit des
/// octets HID déjà encodés et les achemine.
protocol ControllerTransport: AnyObject {
    var kind: TransportKind { get }
    var state: ConnectionState { get }
    var onStateChange: ((ConnectionState) -> Void)? { get set }
    /// Prévenu quand une machine arrive ou part.
    var onMachineEvent: ((MachineEvent) -> Void)? { get set }

    func start()
    func stop()
    /// Envoie une charge utile déjà encodée pour l'identifiant de rapport donné.
    func send(reportID: HIDReportDescriptors.ReportID, payload: [UInt8])
}
