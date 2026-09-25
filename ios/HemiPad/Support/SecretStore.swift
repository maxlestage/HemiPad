import Foundation
import Security

/// Le Trousseau (Keychain), pour les secrets qui ne doivent pas voyager.
///
/// Le secret partagé du boîtier authentifie chaque commande envoyée. Rangé
/// dans les réglages ordinaires, il partirait dans les sauvegardes non
/// chiffrées de l'appareil ; ici, il reste sur cet appareil et hors des
/// sauvegardes (`ThisDeviceOnly`).
///
/// Il est lisible dès le premier déverrouillage après un redémarrage
/// (`AfterFirstUnlock`), pas seulement écran déverrouillé : le Bluetooth peut
/// relancer l'application écran verrouillé, et le secret doit alors être là —
/// sinon la manette perdrait son boîtier, et un réglage enregistré dans cet
/// état risquerait d'effacer le secret.
enum SecretStore {
    /// Protection appliquée à chaque écriture ; `SecItemUpdate` la reporte
    /// aussi sur une entrée rangée par une version précédente.
    private static let accessibility = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

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

    /// Le Trousseau est-il fermé pour l'instant (appareil pas encore
    /// déverrouillé depuis son redémarrage) ? Dans cet état, un secret absent
    /// n'est peut-être qu'illisible.
    static func isLocked(_ account: String) -> Bool {
        var query = baseQuery(account)
        query[kSecReturnAttributes as String] = true
        return SecItemCopyMatching(query as CFDictionary, nil) == errSecInteractionNotAllowed
    }

    /// Écrit un secret, en remplaçant l'ancien. Un secret vide efface l'entrée
    /// — sauf si le Trousseau est fermé : un secret qu'on n'a pas pu lire
    /// n'est pas un secret que la personne a effacé.
    static func write(_ value: String, for account: String) {
        guard !value.isEmpty else {
            if !isLocked(account) { delete(account) }
            return
        }
        let data = Data(value.utf8)
        let query = baseQuery(account)
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: accessibility,
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
