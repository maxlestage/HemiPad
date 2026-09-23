import XCTest
@testable import HemiPad

/// Le registre des connexions, sur une vraie base SQLite.
final class ConnectionStoreTests: XCTestCase {
    private let pc = UUID()
    private let tablette = UUID()

    private func memoryStore() throws -> ConnectionStore {
        try ConnectionStore(path: ":memory:")
    }

    func testAFirstConnectionCreatesTheMachine() throws {
        let store = try memoryStore()
        let date = Date(timeIntervalSince1970: 1_000)
        let machine = try store.recordConnection(of: pc, at: date, transport: .bluetoothHID)
        XCTAssertEqual(machine.id, pc)
        XCTAssertEqual(machine.connectionCount, 1)
        XCTAssertEqual(machine.firstConnection, date)
        XCTAssertEqual(machine.lastConnection, date)
        XCTAssertNil(machine.name)
        XCTAssertNil(machine.console)
    }

    func testReconnectingCountsAndKeepsTheFirstDate() throws {
        let store = try memoryStore()
        try store.recordConnection(of: pc, at: Date(timeIntervalSince1970: 1_000), transport: .bluetoothHID)
        try store.recordDisconnection(of: pc, at: Date(timeIntervalSince1970: 1_500))
        let again = try store.recordConnection(of: pc, at: Date(timeIntervalSince1970: 2_000), transport: .bluetoothHID)
        XCTAssertEqual(again.connectionCount, 2)
        XCTAssertEqual(again.firstConnection, Date(timeIntervalSince1970: 1_000))
        XCTAssertEqual(again.lastConnection, Date(timeIntervalSince1970: 2_000))
        XCTAssertEqual(try store.sessionCount(of: pc), 2)
        XCTAssertEqual(try store.openSessionCount(of: pc), 1)
    }

    func testASessionLeftOpenIsClosedByTheNextOne() throws {
        let store = try memoryStore()
        // L'application s'est arrêtée pendant la connexion : pas de départ noté.
        try store.recordConnection(of: pc, at: Date(timeIntervalSince1970: 1_000), transport: .bluetoothHID)
        try store.recordConnection(of: pc, at: Date(timeIntervalSince1970: 2_000), transport: .bluetoothHID)
        XCTAssertEqual(try store.openSessionCount(of: pc), 1, "une seule session ouverte à la fois")
    }

    func testTheMostRecentMachineComesFirst() throws {
        let store = try memoryStore()
        try store.recordConnection(of: pc, at: Date(timeIntervalSince1970: 1_000), transport: .bluetoothHID)
        try store.recordConnection(of: tablette, at: Date(timeIntervalSince1970: 3_000), transport: .bluetoothHID)
        XCTAssertEqual(try store.machines().map(\.id), [tablette, pc])
        try store.recordConnection(of: pc, at: Date(timeIntervalSince1970: 5_000), transport: .bluetoothHID)
        XCTAssertEqual(try store.machines().map(\.id), [pc, tablette])
    }

    func testNameAndConsoleAreRemembered() throws {
        let store = try memoryStore()
        try store.recordConnection(of: pc, transport: .bluetoothHID)
        try store.rename(pc, to: "  PC du salon  ")
        try store.setConsole(.steam, for: pc)
        let machine = try XCTUnwrap(try store.machine(pc))
        XCTAssertEqual(machine.name, "PC du salon")
        XCTAssertEqual(machine.displayName, "PC du salon")
        XCTAssertEqual(machine.console, .steam)

        // Un nom vide efface le nom : l'affichage retombe sur l'identifiant.
        try store.rename(pc, to: "   ")
        let unnamed = try XCTUnwrap(try store.machine(pc))
        XCTAssertNil(unnamed.name)
        XCTAssertTrue(unnamed.displayName.hasPrefix("Machine "))
    }

    func testForgettingRemovesTheMachineAndItsHistory() throws {
        let store = try memoryStore()
        try store.recordConnection(of: pc, transport: .bluetoothHID)
        try store.recordConnection(of: tablette, transport: .bluetoothHID)
        try store.forget(pc)
        XCTAssertNil(try store.machine(pc))
        XCTAssertEqual(try store.sessionCount(of: pc), 0, "l'historique part avec la machine")
        XCTAssertEqual(try store.machines().map(\.id), [tablette])
    }

    func testTheHistoryIsBounded() throws {
        let store = try memoryStore()
        for index in 0..<230 {
            try store.recordConnection(of: pc, at: Date(timeIntervalSince1970: Double(index)), transport: .bluetoothHID)
        }
        XCTAssertEqual(try store.sessionCount(of: pc), 200)
        XCTAssertEqual(try store.machine(pc)?.connectionCount, 230, "le compteur, lui, n'est pas borné")
    }

    func testEverythingSurvivesReopeningTheFile() throws {
        let path = FileManager.default.temporaryDirectory
            .appendingPathComponent("hemipad-\(UUID().uuidString).sqlite").path
        defer {
            for suffix in ["", "-wal", "-shm"] {
                try? FileManager.default.removeItem(atPath: path + suffix)
            }
        }
        do {
            let store = try ConnectionStore(path: path)
            try store.recordConnection(of: pc, transport: .bluetoothHID)
            try store.rename(pc, to: "PC du salon")
            try store.setConsole(.xbox, for: pc)
        }
        // Rouvrir ne refait pas le schéma et retrouve tout.
        let reopened = try ConnectionStore(path: path)
        let machine = try XCTUnwrap(try reopened.machine(pc))
        XCTAssertEqual(machine.name, "PC du salon")
        XCTAssertEqual(machine.console, .xbox)
        XCTAssertEqual(machine.connectionCount, 1)
    }

    func testSQLiteErrorsBecomeSwiftErrorsInsteadOfCrashing() throws {
        let database = try SQLiteDatabase(path: ":memory:")
        XCTAssertThrowsError(try database.execute("CECI N'EST PAS DU SQL")) { error in
            XCTAssertTrue(error is SQLiteDatabase.Error)
        }
        XCTAssertThrowsError(try database.query("SELECT * FROM table_absente"))
    }

    func testAFailedTransactionLeavesNothingBehind() throws {
        let database = try SQLiteDatabase(path: ":memory:")
        try database.execute("CREATE TABLE t (v INTEGER NOT NULL)")
        XCTAssertThrowsError(try database.transaction {
            try database.run("INSERT INTO t (v) VALUES (?)", [.integer(1)])
            try database.run("INSERT INTO t (v) VALUES (?)", [.null])
        })
        XCTAssertEqual(try database.query("SELECT COUNT(*) AS n FROM t").first?["n"], .integer(0))
    }
}
