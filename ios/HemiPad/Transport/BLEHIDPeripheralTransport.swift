import CoreBluetooth
import Foundation
import OSLog
import UIKit

/// Transport HID over GATT : l'iPhone se comporte en périphérique Bluetooth.
///
/// ## Ce que fait réellement ce code
/// Il publie un profil HID complet (service 0x1812, *Report Map*, *HID
/// Information*, caractéristiques de rapport pour la manette et le clavier,
/// plus le service Batterie et Device Information), puis s'annonce. Une console
/// ou un PC qui accepte un périphérique HID générique le voit comme une manette
/// et un clavier combinés.
///
/// ## La limite à connaître
/// iOS réserve certains services GATT, dont 0x1812 : selon la version du
/// système et les droits accordés à l'application, `CBPeripheralManager` peut
/// refuser l'ajout du service ou le retirer de l'annonce. Dans ce cas, l'erreur
/// remonte telle quelle (`hidServiceRejected`) et l'application bascule vers le
/// `NetworkBridgeTransport`, qui rejoue exactement les mêmes octets depuis un
/// petit boîtier USB. Les descripteurs sont donc partagés entre les deux
/// chemins : ce qui marche sur le pont marchera en Bluetooth le jour où l'accès
/// est accordé.
///
/// ## Ce qui le rend robuste
/// - **Aucun rapport perdu quand la radio sature.** `updateValue` refuse un
///   rapport dès que sa file est pleine ; il était jeté, et c'était souvent le
///   relâchement : bouton coincé côté console. Les refus attendent maintenant
///   dans une `HIDSendQueue` et partent au prochain « prêt » de la radio.
/// - **La console reçoit l'état courant dès qu'elle s'abonne**, au lieu
///   d'attendre le prochain geste.
/// - **Latence de connexion basse** demandée à chaque abonnement : c'est la
///   différence entre un bouton qui répond et un bouton qui traîne.
/// - **Abonnements suivis caractéristique par caractéristique** : une machine
///   qui se désabonne du clavier reste connectée à la manette.
/// - **L'annonce redémarre seule** après un échec (trois essais espacés), et
///   tout est republié quand le Bluetooth revient.
/// - **Les lectures reçoivent une réponse** : mode de protocole, dernier
///   rapport, niveau de batterie réel. Certains hôtes lisent ces valeurs à
///   l'appairage et abandonnent si elles manquent.
/// - **Relance par le système** : si iOS relance l'application pour un
///   événement Bluetooth, les services et les abonnements restaurés sont
///   repris tels quels, sans couper la machine connectée.
final class BLEHIDPeripheralTransport: NSObject, ControllerTransport {
    let kind: TransportKind = .bluetoothHID

    private(set) var state: ConnectionState = .idle {
        didSet {
            guard state != oldValue else { return }
            onStateChange?(state)
        }
    }
    var onStateChange: ((ConnectionState) -> Void)?

    private var manager: CBPeripheralManager?
    private var gamepadReport: CBMutableCharacteristic?
    private var keyboardReport: CBMutableCharacteristic?
    /// Machines abonnées, et à quelles caractéristiques.
    private var subscriptions: [UUID: (central: CBCentral, characteristics: Set<ObjectIdentifier>)] = [:]
    /// Rapports refusés par une radio saturée, en attente du prochain « prêt ».
    private var queue = HIDSendQueue()
    /// Dernier rapport de chaque sorte : c'est l'état courant, renvoyé à toute
    /// machine qui s'abonne et à toute lecture.
    private var lastPayloads: [HIDReportDescriptors.ReportID: [UInt8]] = [:]
    /// Services repris d'une relance par le système : on les garde tels quels.
    private var restoredServices = false
    private var advertisingAttempts = 0
    private let logger = Logger(subsystem: "app.hemipad", category: "ble")

    private let advertisedName: String
    private static let maximumAdvertisingAttempts = 3

    // UUID standards du profil HID over GATT.
    private enum UUIDs {
        static let hidService = CBUUID(string: "1812")
        static let reportMap = CBUUID(string: "2A4B")
        static let hidInformation = CBUUID(string: "2A4A")
        static let hidControlPoint = CBUUID(string: "2A4C")
        static let report = CBUUID(string: "2A4D")
        static let protocolMode = CBUUID(string: "2A4E")
        static let batteryService = CBUUID(string: "180F")
        static let batteryLevel = CBUUID(string: "2A19")
    }

    init(advertisedName: String = "HemiPad") {
        self.advertisedName = advertisedName
        super.init()
    }

    private var isConnected: Bool { !subscriptions.isEmpty }

    func start() {
        state = .preparing
        advertisingAttempts = 0
        if manager == nil {
            manager = CBPeripheralManager(delegate: self, queue: .main, options: [
                CBPeripheralManagerOptionRestoreIdentifierKey: "app.hemipad.peripheral"
            ])
        } else if manager?.state == .poweredOn {
            publishServices()
        }
    }

    func stop() {
        manager?.stopAdvertising()
        manager?.removeAllServices()
        subscriptions.removeAll()
        queue.removeAll()
        restoredServices = false
        state = .idle
    }

    func send(reportID: HIDReportDescriptors.ReportID, payload: [UInt8]) {
        lastPayloads[reportID] = payload
        // Sans machine abonnée, rien ne part : rejouer à la connexion des
        // frappes tapées dans le vide serait pire que les perdre. L'état de la
        // manette, lui, est gardé et envoyé à l'abonnement.
        guard isConnected else { return }
        queue.enqueue(reportID, payload: payload)
        flushQueue()
    }

    // MARK: - Émission

    private func characteristic(for reportID: HIDReportDescriptors.ReportID) -> CBMutableCharacteristic? {
        switch reportID {
        case .gamepad: return gamepadReport
        case .keyboard: return keyboardReport
        }
    }

    private func flushQueue() {
        guard let manager else { return }
        queue.drain { entry in
            // Caractéristique absente (services en cours de publication) : le
            // rapport n'a nulle part où aller, on le laisse tomber.
            guard let target = self.characteristic(for: entry.reportID) else { return true }
            // `nil` : toutes les machines abonnées à *cette* caractéristique.
            return manager.updateValue(Data(entry.payload), for: target, onSubscribedCentrals: nil)
        }
    }

    /// Valeur d'un rapport pour une lecture : le dernier envoyé, sinon l'état
    /// neutre — rien d'enfoncé, sticks au centre.
    private func currentValue(for reportID: HIDReportDescriptors.ReportID) -> [UInt8] {
        if let last = lastPayloads[reportID] { return last }
        switch reportID {
        case .gamepad: return GamepadReportEncoder().encode(GamepadState())
        case .keyboard: return KeyboardReportEncoder().releaseAll()
        }
    }

    private func batteryPercent() -> UInt8 {
        let device = UIDevice.current
        device.isBatteryMonitoringEnabled = true
        let level = device.batteryLevel
        // -1 : niveau inconnu (simulateur). On annonce pleine charge plutôt
        // qu'une batterie vide qui ferait avertir la console.
        guard level >= 0 else { return 100 }
        return UInt8(max(1, min(100, (level * 100).rounded())))
    }

    // MARK: - Publication et annonce

    private func publishServices() {
        guard let manager else { return }
        manager.removeAllServices()

        let reportMap = CBMutableCharacteristic(
            type: UUIDs.reportMap,
            properties: [.read],
            value: Data(HIDReportDescriptors.combined),
            permissions: [.readEncryptionRequired]
        )

        // bcdHID 1.11, code pays 0, flags : NormallyConnectable | RemoteWake
        let hidInformation = CBMutableCharacteristic(
            type: UUIDs.hidInformation,
            properties: [.read],
            value: Data([0x11, 0x01, 0x00, 0x03]),
            permissions: [.readable]
        )

        let controlPoint = CBMutableCharacteristic(
            type: UUIDs.hidControlPoint,
            properties: [.writeWithoutResponse],
            value: nil,
            permissions: [.writeable]
        )

        let protocolMode = CBMutableCharacteristic(
            type: UUIDs.protocolMode,
            properties: [.read, .writeWithoutResponse],
            value: nil,
            permissions: [.readable, .writeable]
        )

        let gamepad = CBMutableCharacteristic(
            type: UUIDs.report,
            properties: [.read, .notify],
            value: nil,
            permissions: [.readEncryptionRequired]
        )
        let keyboard = CBMutableCharacteristic(
            type: UUIDs.report,
            properties: [.read, .notify],
            value: nil,
            permissions: [.readEncryptionRequired]
        )
        gamepadReport = gamepad
        keyboardReport = keyboard

        let hidService = CBMutableService(type: UUIDs.hidService, primary: true)
        hidService.characteristics = [reportMap, hidInformation, controlPoint, protocolMode, gamepad, keyboard]

        let battery = CBMutableService(type: UUIDs.batteryService, primary: true)
        let batteryLevel = CBMutableCharacteristic(
            type: UUIDs.batteryLevel,
            properties: [.read, .notify],
            value: nil,
            permissions: [.readable]
        )
        battery.characteristics = [batteryLevel]

        manager.add(battery)
        manager.add(hidService)
    }

    private func advertise() {
        guard let manager else { return }
        guard !manager.isAdvertising else {
            updateConnectionState()
            return
        }
        advertisingAttempts += 1
        manager.startAdvertising([
            CBAdvertisementDataLocalNameKey: advertisedName,
            CBAdvertisementDataServiceUUIDsKey: [UUIDs.hidService]
        ])
    }

    /// Un échec d'annonce est souvent passager (radio occupée, bascule du
    /// Bluetooth) : on réessaie, de plus en plus espacé, avant de l'afficher.
    private func retryAdvertising(after error: Error) {
        guard advertisingAttempts < Self.maximumAdvertisingAttempts else {
            state = .failed(error.localizedDescription)
            return
        }
        let delay = pow(2, Double(advertisingAttempts - 1))
        logger.notice("annonce refusée, nouvel essai dans \(delay) s : \(error.localizedDescription)")
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self, self.manager?.state == .poweredOn else { return }
            self.advertise()
        }
    }

    private func updateConnectionState() {
        if let first = subscriptions.values.first {
            state = .connected(first.central.identifier.uuidString.prefix(8).description)
        } else if manager?.isAdvertising == true {
            state = .advertising
        }
    }
}

extension BLEHIDPeripheralTransport: CBPeripheralManagerDelegate {
    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        switch peripheral.state {
        case .poweredOn:
            advertisingAttempts = 0
            if restoredServices {
                // Relance par le système : les services sont encore publiés
                // et une machine est peut-être connectée. Tout republier la
                // déconnecterait.
                restoredServices = false
                advertise()
                updateConnectionState()
            } else {
                publishServices()
            }
        case .poweredOff, .resetting:
            // Les abonnements ne survivent pas à une coupure de la radio :
            // au retour, tout est republié et la machine se reconnecte.
            subscriptions.removeAll()
            queue.removeAll()
            state = peripheral.state == .poweredOff
                ? .failed(TransportError.bluetoothUnavailable.localizedDescription)
                : .preparing
        case .unauthorized:
            state = .failed("HemiPad n'a pas l'autorisation Bluetooth.")
        case .unsupported:
            state = .failed("Cet appareil ne gère pas le Bluetooth basse consommation.")
        default:
            state = .preparing
        }
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBService, error: Error?) {
        if let error {
            logger.error("ajout du service refusé: \(error.localizedDescription)")
            if service.uuid == UUIDs.hidService {
                state = .failed(TransportError.hidServiceRejected.localizedDescription)
            }
            return
        }
        if service.uuid == UUIDs.hidService {
            advertise()
        }
    }

    func peripheralManagerDidStartAdvertising(_ peripheral: CBPeripheralManager, error: Error?) {
        if let error {
            retryAdvertising(after: error)
        } else {
            advertisingAttempts = 0
            updateConnectionState()
        }
    }

    func peripheralManager(
        _ peripheral: CBPeripheralManager,
        central: CBCentral,
        didSubscribeTo characteristic: CBCharacteristic
    ) {
        var entry = subscriptions[central.identifier] ?? (central: central, characteristics: [])
        entry.characteristics.insert(ObjectIdentifier(characteristic))
        subscriptions[central.identifier] = entry

        // Une manette doit répondre au doigt : on demande l'intervalle de
        // connexion le plus court que la machine accepte.
        peripheral.setDesiredConnectionLatency(.low, for: central)

        // L'état courant, tout de suite : sans lui, la machine attendait le
        // prochain geste pour savoir ce qui est enfoncé.
        if characteristic === gamepadReport {
            queue.enqueue(.gamepad, payload: currentValue(for: .gamepad))
        } else if characteristic === keyboardReport {
            queue.enqueue(.keyboard, payload: currentValue(for: .keyboard))
        }
        flushQueue()
        updateConnectionState()
    }

    func peripheralManager(
        _ peripheral: CBPeripheralManager,
        central: CBCentral,
        didUnsubscribeFrom characteristic: CBCharacteristic
    ) {
        guard var entry = subscriptions[central.identifier] else { return }
        entry.characteristics.remove(ObjectIdentifier(characteristic))
        subscriptions[central.identifier] = entry.characteristics.isEmpty ? nil : entry
        if subscriptions.isEmpty {
            queue.removeAll()
        }
        updateConnectionState()
    }

    /// La radio a de nouveau de la place : on vide ce qui attendait.
    func peripheralManagerIsReady(toUpdateSubscribers peripheral: CBPeripheralManager) {
        flushQueue()
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveRead request: CBATTRequest) {
        let value: [UInt8]?
        switch request.characteristic.uuid {
        case UUIDs.batteryLevel:
            value = [batteryPercent()]
        case UUIDs.protocolMode:
            // 0x01 : mode « rapport », le seul que HemiPad parle.
            value = [0x01]
        case UUIDs.report:
            value = request.characteristic === keyboardReport
                ? currentValue(for: .keyboard)
                : currentValue(for: .gamepad)
        default:
            value = nil
        }
        guard let value else {
            peripheral.respond(to: request, withResult: .requestNotSupported)
            return
        }
        guard request.offset <= value.count else {
            peripheral.respond(to: request, withResult: .invalidOffset)
            return
        }
        request.value = Data(value[request.offset...])
        peripheral.respond(to: request, withResult: .success)
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
        // Le point de contrôle HID sert surtout à la mise en veille : on accuse
        // réception sans rien changer, l'état d'entrée reste géré côté iPhone.
        guard let first = requests.first else { return }
        peripheral.respond(to: first, withResult: .success)
    }

    func peripheralManager(
        _ peripheral: CBPeripheralManager,
        willRestoreState dict: [String: Any]
    ) {
        // iOS relance l'application pour un événement Bluetooth : on reprend
        // les services qu'il a gardés, et les machines qui y sont abonnées.
        guard let services = dict[CBPeripheralManagerRestoredStateServicesKey] as? [CBMutableService],
              let hid = services.first(where: { $0.uuid == UUIDs.hidService }) else {
            logger.debug("restauration sans service HID : tout sera republié")
            return
        }
        let reports = (hid.characteristics ?? [])
            .compactMap { $0 as? CBMutableCharacteristic }
            .filter { $0.uuid == UUIDs.report }
        // Les rapports sont publiés dans l'ordre manette, clavier : c'est le
        // même ordre qui revient.
        guard reports.count == 2 else { return }
        gamepadReport = reports[0]
        keyboardReport = reports[1]
        for report in reports {
            for central in report.subscribedCentrals ?? [] {
                var entry = subscriptions[central.identifier] ?? (central: central, characteristics: [])
                entry.characteristics.insert(ObjectIdentifier(report))
                subscriptions[central.identifier] = entry
            }
        }
        restoredServices = true
        logger.debug("restauration : \(self.subscriptions.count) machine(s) toujours abonnée(s)")
    }
}
