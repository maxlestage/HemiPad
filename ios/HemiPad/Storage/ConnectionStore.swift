import Foundation

/// Une machine qui s'est déjà connectée à HemiPad.
struct RememberedMachine: Identifiable, Equatable {
    /// L'identifiant Bluetooth que iOS donne à la machine. Stable pour un
    /// même appareil HemiPad : c'est ce qui permet de la reconnaître.
    let id: UUID
    /// Le nom que la personne lui a donné, s'il y en a un.
    var name: String?
    /// Le profil de console à reprendre quand elle se reconnecte.
    var console: ConsoleTarget?
    let firstConnection: Date
    var lastConnection: Date
    var connectionCount: Int

    /// Ce que l'interface affiche : le nom donné, sinon un nom lisible tiré
    /// de l'identifiant.
    var displayName: String {
        if let name, !name.trimmingCharacters(in: .whitespaces).isEmpty { return name }
        return "Machine \(id.uuidString.prefix(4))"
    }
}

/// Le registre des connexions, dans une base SQLite sur l'appareil.
///
/// Chaque machine qui s'appaire est retenue : son nom, le profil de console qui
/// lui va, quand elle s'est connectée et combien de fois. Quand elle revient,
/// HemiPad la reconnaît, l'affiche sous son nom et reprend son profil — sans
/// rien demander. Rien ne quitte l'appareil.
///
/// Deux tables :
/// - `machine` : une ligne par machine connue ;
/// - `connexion` : le journal des sessions, borné à 200 par machine, effacé
///   avec elle.
final class ConnectionStore {
    private let database: SQLiteDatabase
    private static let schemaVersion = 1
    private static let sessionsKeptPerMachine = 200

    /// Ouvre le registre. `path` vaut `":memory:"` pour les tests.
    init(path: String) throws {
        database = try SQLiteDatabase(path: path)
        try migrate()
    }

    /// Le registre de l'application, dans *Application Support*.
    static func standard() throws -> ConnectionStore {
        let folder = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        ).appendingPathComponent("HemiPad", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        // Hors des sauvegardes : les identifiants Bluetooth ne valent que pour
        // cet appareil (un nouvel iPhone doit de toute façon être réappairé),
        // et le journal des connexions n'a rien à faire dans un nuage.
        var excluded = folder
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? excluded.setResourceValues(values)
        return try ConnectionStore(path: folder.appendingPathComponent("connexions.sqlite").path)
    }

    // MARK: - Schéma

    private func migrate() throws {
        let version = database.userVersion
        guard version < Self.schemaVersion else { return }
        try database.transaction { () throws -> Void in
            if version < 1 {
                try database.execute("""
                    CREATE TABLE IF NOT EXISTS machine (
                        id TEXT PRIMARY KEY NOT NULL,
                        nom TEXT,
                        console TEXT,
                        premiere_connexion REAL NOT NULL,
                        derniere_connexion REAL NOT NULL,
                        connexions INTEGER NOT NULL DEFAULT 0
                    );
                    CREATE TABLE IF NOT EXISTS connexion (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        machine_id TEXT NOT NULL REFERENCES machine(id) ON DELETE CASCADE,
                        debut REAL NOT NULL,
                        fin REAL,
                        transport TEXT NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS connexion_par_machine
                        ON connexion(machine_id, debut);
                    """)
            }
            try database.setUserVersion(Self.schemaVersion)
        }
    }

    // MARK: - Connexions

    /// Une machine vient de se connecter. Crée sa fiche au besoin, compte la
    /// connexion, ouvre une session. Renvoie la fiche à jour.
    @discardableResult
    func recordConnection(of id: UUID, at date: Date = Date(), transport: TransportKind) throws -> RememberedMachine {
        try database.transaction { () throws -> RememberedMachine in
            let key = SQLiteDatabase.Value.text(id.uuidString)
            let time = SQLiteDatabase.Value.real(date.timeIntervalSince1970)
            try database.run("""
                INSERT INTO machine (id, premiere_connexion, derniere_connexion, connexions)
                VALUES (?, ?, ?, 1)
                ON CONFLICT(id) DO UPDATE SET
                    derniere_connexion = excluded.derniere_connexion,
                    connexions = connexions + 1
                """, [key, time, time])
            // Une session restée ouverte (application arrêtée pendant la
            // connexion) est close à l'instant où la suivante commence.
            try database.run(
                "UPDATE connexion SET fin = ? WHERE machine_id = ? AND fin IS NULL",
                [time, key]
            )
            try database.run(
                "INSERT INTO connexion (machine_id, debut, transport) VALUES (?, ?, ?)",
                [key, time, SQLiteDatabase.Value.text(transport.rawValue)]
            )
            try database.run("""
                DELETE FROM connexion WHERE machine_id = ? AND id NOT IN (
                    SELECT id FROM connexion WHERE machine_id = ?
                    ORDER BY debut DESC LIMIT \(Self.sessionsKeptPerMachine)
                )
                """, [key, key])
            guard let fiche = try self.machine(id) else {
                throw SQLiteDatabase.Error(code: 0, message: "fiche introuvable après l'écriture")
            }
            return fiche
        }
    }

    /// La machine s'est déconnectée : sa session se referme.
    func recordDisconnection(of id: UUID, at date: Date = Date()) throws {
        try database.run(
            "UPDATE connexion SET fin = ? WHERE machine_id = ? AND fin IS NULL",
            [.real(date.timeIntervalSince1970), .text(id.uuidString)]
        )
    }

    // MARK: - Lecture

    /// Toutes les machines connues, la plus récemment connectée d'abord.
    func machines() throws -> [RememberedMachine] {
        try database.query("SELECT * FROM machine ORDER BY derniere_connexion DESC").compactMap(Self.machine(from:))
    }

    func machine(_ id: UUID) throws -> RememberedMachine? {
        try database.query("SELECT * FROM machine WHERE id = ?", [.text(id.uuidString)])
            .first
            .flatMap(Self.machine(from:))
    }

    /// Nombre de sessions gardées pour une machine.
    func sessionCount(of id: UUID) throws -> Int {
        let rows = try database.query(
            "SELECT COUNT(*) AS n FROM connexion WHERE machine_id = ?",
            [.text(id.uuidString)]
        )
        return Int(rows.first?["n"]?.integerValue ?? 0)
    }

    /// Nombre de sessions encore ouvertes pour une machine.
    func openSessionCount(of id: UUID) throws -> Int {
        let rows = try database.query(
            "SELECT COUNT(*) AS n FROM connexion WHERE machine_id = ? AND fin IS NULL",
            [.text(id.uuidString)]
        )
        return Int(rows.first?["n"]?.integerValue ?? 0)
    }

    // MARK: - Réglages par machine

    /// Nomme la machine. Un nom vide efface le nom.
    func rename(_ id: UUID, to name: String) throws {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        try database.run(
            "UPDATE machine SET nom = ? WHERE id = ?",
            [trimmed.isEmpty ? SQLiteDatabase.Value.null : .text(trimmed), .text(id.uuidString)]
        )
    }

    /// Associe un profil de console à la machine, repris à chaque connexion.
    func setConsole(_ console: ConsoleTarget?, for id: UUID) throws {
        try database.run(
            "UPDATE machine SET console = ? WHERE id = ?",
            [console.map { SQLiteDatabase.Value.text($0.rawValue) } ?? .null, .text(id.uuidString)]
        )
    }

    /// Oublie la machine et tout son historique.
    func forget(_ id: UUID) throws {
        try database.run("DELETE FROM machine WHERE id = ?", [.text(id.uuidString)])
    }

    // MARK: - Détails

    private static func machine(from row: SQLiteDatabase.Row) -> RememberedMachine? {
        guard let rawID = row["id"]?.textValue,
              let id = UUID(uuidString: rawID),
              let first = row["premiere_connexion"]?.realValue,
              let last = row["derniere_connexion"]?.realValue else { return nil }
        return RememberedMachine(
            id: id,
            name: row["nom"]?.textValue,
            console: row["console"]?.textValue.flatMap(ConsoleTarget.init(rawValue:)),
            firstConnection: Date(timeIntervalSince1970: first),
            lastConnection: Date(timeIntervalSince1970: last),
            connectionCount: Int(row["connexions"]?.integerValue ?? 0)
        )
    }
}
