import Foundation
import Security

/// Le Trousseau (Keychain), pour les secrets qui ne doivent pas voyager.
///
/// Le secret partagé du boîtier authentifie chaque commande envoyée. Rangé
/// dans les réglages ordinaires, il partirait dans les sauvegardes non
/// chiffrées de l'appareil ; ici, il reste sur cet appareil, déverrouillé,
/// et hors des sauvegardes (`ThisDeviceOnly`).
enum SecretStore {
    /// Lit un secret, ou `nil` s'il n'y en a pas.
    static func read(_ account: String) -> String? {
        var query = baseQuery(account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess,
              let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            return nil
        }
        return value
    }

    /// Écrit un secret, en remplaçant l'ancien. Un secret vide efface l'entrée.
    static func write(_ value: String, for account: String) {
        guard !value.isEmpty else {
            delete(account)
            return
        }
        let data = Data(value.utf8)
        let query = baseQuery(account)
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        ]

        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var insert = query
            insert.merge(attributes) { current, _ in current }
            SecItemAdd(insert as CFDictionary, nil)
        }
    }

    static func delete(_ account: String) {
        SecItemDelete(baseQuery(account) as CFDictionary)
    }

    private static func baseQuery(_ account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "app.hemipad.secret",
            kSecAttrAccount as String: account,
        ]
    }
}
