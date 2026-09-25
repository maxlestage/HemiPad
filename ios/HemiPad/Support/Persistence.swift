import Foundation

/// Stockage des réglages. `UserDefaults` suffit : quelques centaines d'octets,
/// lus une fois au lancement, écrits à chaque modification de réglage.
enum SettingsStore {
    private static let profileKey = "hemipad.profile"
    private static let consoleKey = "hemipad.console"
    private static let transportKey = "hemipad.transport"
    private static let bridgeKey = "hemipad.bridge"

    static func loadProfile() -> HemiplegiaProfile {
        guard let data = UserDefaults.standard.data(forKey: profileKey),
              let profile = try? JSONDecoder().decode(HemiplegiaProfile.self, from: data) else {
            return .default
        }
        return profile
    }

    static func save(_ profile: HemiplegiaProfile) {
        guard let data = try? JSONEncoder().encode(profile) else { return }
        UserDefaults.standard.set(data, forKey: profileKey)
    }

    static func loadConsole() -> ConsoleTarget {
        guard let raw = UserDefaults.standard.string(forKey: consoleKey),
              let target = ConsoleTarget(rawValue: raw) else {
            return .steam
        }
        return target
    }

    static func save(_ target: ConsoleTarget) {
        UserDefaults.standard.set(target.rawValue, forKey: consoleKey)
    }

    static func loadTransport() -> TransportKind {
        guard let raw = UserDefaults.standard.string(forKey: transportKey),
              let kind = TransportKind(rawValue: raw) else {
            // Le Bluetooth direct par défaut : personne n'a à aller l'allumer
            // quelque part avant que la manette serve à quelque chose.
            return .bluetoothHID
        }
        // Le boîtier n'est pas un choix de transport : il tourne à côté.
        return kind == .bridge ? .bluetoothHID : kind
    }

    static func save(_ kind: TransportKind) {
        UserDefaults.standard.set(kind.rawValue, forKey: transportKey)
    }

    /// Nom sous lequel le secret du boîtier est rangé dans le Trousseau.
    private static let bridgeSecretAccount = "bridge.key"

    static func loadBridge() -> BridgeSettings {
        // L'adresse et le port restent dans les réglages ordinaires ; le secret,
        // lui, vient du Trousseau, où il ne part pas dans les sauvegardes.
        var host = ""
        var port = BridgeSettings.defaultPort
        if let data = UserDefaults.standard.data(forKey: bridgeKey),
           let stored = try? JSONDecoder().decode(BridgeAddress.self, from: data) {
            host = stored.host
            port = stored.port
        }
        let keyHex = SecretStore.read(bridgeSecretAccount) ?? ""
        return BridgeSettings(host: host, port: port, keyHex: keyHex)
    }

    static func save(_ settings: BridgeSettings) {
        let address = BridgeAddress(host: settings.host, port: settings.port)
        if let data = try? JSONEncoder().encode(address) {
            UserDefaults.standard.set(data, forKey: bridgeKey)
        }
        SecretStore.write(settings.keyHex, for: bridgeSecretAccount)
    }

    /// La partie non secrète des coordonnées du boîtier, seule à aller dans les
    /// réglages ordinaires.
    private struct BridgeAddress: Codable {
        let host: String
        let port: UInt16
    }
}
