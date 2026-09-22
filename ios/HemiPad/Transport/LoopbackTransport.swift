import Foundation
import OSLog

/// Transport de démonstration : journalise les rapports au lieu de les émettre.
///
/// Indispensable pour régler la géométrie d'accessibilité dans le train, et
/// pour les aperçus SwiftUI qui n'ont ni Bluetooth ni pont.
final class LoopbackTransport: ControllerTransport {
    let kind: TransportKind = .loopback

    private(set) var state: ConnectionState = .idle {
        didSet { onStateChange?(state) }
    }
    var onStateChange: ((ConnectionState) -> Void)?

    /// Dernier rapport émis, exposé pour les tests et l'écran de diagnostic.
    private(set) var lastPayloads: [HIDReportDescriptors.ReportID: [UInt8]] = [:]

    private let logger = Logger(subsystem: "app.hemipad", category: "loopback")

    func start() {
        state = .connected("Mode démo")
    }

    func stop() {
        state = .idle
    }

    func send(reportID: HIDReportDescriptors.ReportID, payload: [UInt8]) {
        lastPayloads[reportID] = payload
        logger.debug("report \(reportID.rawValue): \(payload.map { String(format: "%02X", $0) }.joined(separator: " "))")
    }
}
