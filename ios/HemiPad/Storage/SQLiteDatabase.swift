import Foundation
import SQLite3

/// Une base SQLite, sans dépendance : la bibliothèque est déjà dans iOS.
///
/// Juste ce dont HemiPad a besoin — requêtes préparées, paramètres liés,
/// transactions, numéro de version du schéma — et rien qui ne puisse planter :
/// chaque échec de SQLite devient une erreur Swift, avec le message de SQLite.
final class SQLiteDatabase {
    struct Error: Swift.Error, LocalizedError, Equatable {
        let code: Int32
        let message: String
        var errorDescription: String? { "SQLite \(code) : \(message)" }
    }

    /// Une valeur liée à un paramètre, ou lue dans une colonne.
    enum Value: Equatable {
        case null
        case integer(Int64)
        case real(Double)
        case text(String)
    }

    typealias Row = [String: Value]

    private var handle: OpaquePointer?

    /// Ouvre (ou crée) la base. `":memory:"` donne une base éphémère, pour les
    /// tests.
    init(path: String) throws {
        let flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX
        let result = sqlite3_open_v2(path, &handle, flags, nil)
        guard result == SQLITE_OK else {
            let error = Self.error(for: handle, code: result)
            sqlite3_close(handle)
            handle = nil
            throw error
        }
        // Les clés étrangères ne sont pas actives par défaut dans SQLite :
        // sans elles, oublier une machine laisserait son historique orphelin.
        try execute("PRAGMA foreign_keys = ON")
        if path != ":memory:" {
            // Journal WAL : une écriture interrompue (application tuée,
            // batterie vide) ne corrompt pas la base.
            try execute("PRAGMA journal_mode = WAL")
        }
    }

    deinit {
        sqlite3_close(handle)
    }

    /// Numéro de version du schéma, rangé dans la base elle-même.
    var userVersion: Int {
        let rows = (try? query("PRAGMA user_version")) ?? []
        return Int(rows.first?["user_version"]?.integerValue ?? 0)
    }

    func setUserVersion(_ version: Int) throws {
        try execute("PRAGMA user_version = \(version)")
    }

    /// Exécute une ou plusieurs instructions sans résultat ni paramètre.
    func execute(_ sql: String) throws {
        var message: UnsafeMutablePointer<CChar>?
        let result = sqlite3_exec(handle, sql, nil, nil, &message)
        guard result == SQLITE_OK else {
            let text = message.map { String(cString: $0) } ?? "erreur inconnue"
            sqlite3_free(message)
            throw Error(code: result, message: text)
        }
    }

    /// Exécute une instruction avec paramètres ; renvoie le nombre de lignes
    /// modifiées.
    @discardableResult
    func run(_ sql: String, _ parameters: [Value] = []) throws -> Int {
        let statement = try prepare(sql, parameters)
        defer { sqlite3_finalize(statement) }
        let result = sqlite3_step(statement)
        guard result == SQLITE_DONE || result == SQLITE_ROW else {
            throw Self.error(for: handle, code: result)
        }
        return Int(sqlite3_changes(handle))
    }

    /// Exécute une requête et renvoie toutes ses lignes.
    func query(_ sql: String, _ parameters: [Value] = []) throws -> [Row] {
        let statement = try prepare(sql, parameters)
        defer { sqlite3_finalize(statement) }
        var rows: [Row] = []
        while true {
            let result = sqlite3_step(statement)
            if result == SQLITE_DONE { break }
            guard result == SQLITE_ROW else { throw Self.error(for: handle, code: result) }
            var row: Row = [:]
            for index in 0..<sqlite3_column_count(statement) {
                let name = String(cString: sqlite3_column_name(statement, index))
                row[name] = Self.value(of: statement, at: index)
            }
            rows.append(row)
        }
        return rows
    }

    /// Tout ou rien : si `body` échoue, rien de ce qu'il a écrit ne reste.
    func transaction<T>(_ body: () throws -> T) throws -> T {
        try execute("BEGIN IMMEDIATE")
        do {
            let result = try body()
            try execute("COMMIT")
            return result
        } catch {
            try? execute("ROLLBACK")
            throw error
        }
    }

    var lastInsertedRowID: Int64 { sqlite3_last_insert_rowid(handle) }

    // MARK: - Détails

    /// SQLite doit copier le texte lié : la chaîne Swift ne vit pas assez
    /// longtemps pour qu'il la garde par référence.
    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    private func prepare(_ sql: String, _ parameters: [Value]) throws -> OpaquePointer? {
        var statement: OpaquePointer?
        let result = sqlite3_prepare_v2(handle, sql, -1, &statement, nil)
        guard result == SQLITE_OK else {
            sqlite3_finalize(statement)
            throw Self.error(for: handle, code: result)
        }
        for (offset, parameter) in parameters.enumerated() {
            let index = Int32(offset + 1)
            let bound: Int32
            switch parameter {
            case .null: bound = sqlite3_bind_null(statement, index)
            case .integer(let value): bound = sqlite3_bind_int64(statement, index, value)
            case .real(let value): bound = sqlite3_bind_double(statement, index, value)
            case .text(let value): bound = sqlite3_bind_text(statement, index, value, -1, Self.transient)
            }
            guard bound == SQLITE_OK else {
                sqlite3_finalize(statement)
                throw Self.error(for: handle, code: bound)
            }
        }
        return statement
    }

    private static func value(of statement: OpaquePointer?, at index: Int32) -> Value {
        switch sqlite3_column_type(statement, index) {
        case SQLITE_INTEGER: return .integer(sqlite3_column_int64(statement, index))
        case SQLITE_FLOAT: return .real(sqlite3_column_double(statement, index))
        case SQLITE_TEXT:
            guard let text = sqlite3_column_text(statement, index) else { return .null }
            return .text(String(cString: text))
        default: return .null
        }
    }

    private static func error(for handle: OpaquePointer?, code: Int32) -> Error {
        guard let handle, let pointer = sqlite3_errmsg(handle) else {
            return Error(code: code, message: "erreur inconnue")
        }
        return Error(code: code, message: String(cString: pointer))
    }
}

extension SQLiteDatabase.Value {
    var integerValue: Int64? {
        if case .integer(let value) = self { return value }
        return nil
    }

    var realValue: Double? {
        switch self {
        case .real(let value): return value
        case .integer(let value): return Double(value)
        default: return nil
        }
    }

    var textValue: String? {
        if case .text(let value) = self { return value }
        return nil
    }
}
