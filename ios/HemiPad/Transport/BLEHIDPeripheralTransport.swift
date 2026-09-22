import CoreBluetooth
import Foundation
import OSLog

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
final class BLEHIDPeripheralTransport: NSObject, ControllerTransport {
    let kind: TransportKind = .bluetoothHID

    private(set) var state: ConnectionState = .idle {
        didSet { onStateChange?(state) }
    }
    var onStateChange: ((ConnectionState) -> Void)?

    private var manager: CBPeripheralManager?
    private var gamepadReport: CBMutableCharacteristic?
    private var keyboardReport: CBMutableCharacteristic?
    private var subscribers: [CBCentral] = []
    private let logger = Logger(subsystem: "app.hemipad", category: "ble")

    private let advertisedName: String

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

    func start() {
        state = .preparing
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
        subscribers.removeAll()
        state = .idle
    }

    func send(reportID: HIDReportDescriptors.ReportID, payload: [UInt8]) {
        guard let manager, !subscribers.isEmpty else { return }
        let characteristic: CBMutableCharacteristic?
        switch reportID {
        case .gamepad: characteristic = gamepadReport
        case .keyboard: characteristic = keyboardReport
        }
        guard let characteristic else { return }
        // updateValue renvoie false quand la file d'émission est pleine : on
        // laisse tomber le rapport plutôt que de le mettre en file. Un rapport
        // d'entrée périmé est pire qu'un rapport manquant.
        _ = manager.updateValue(Data(payload), for: characteristic, onSubscribedCentrals: subscribers)
    }

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
        manager?.startAdvertising([
            CBAdvertisementDataLocalNameKey: advertisedName,
            CBAdvertisementDataServiceUUIDsKey: [UUIDs.hidService]
        ])
    }
}

extension BLEHIDPeripheralTransport: CBPeripheralManagerDelegate {
    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        switch peripheral.state {
        case .poweredOn:
            publishServices()
        case .poweredOff:
            state = .failed(TransportError.bluetoothUnavailable.localizedDescription)
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
            state = .failed(error.localizedDescription)
        } else {
            state = .advertising
        }
    }

    func peripheralManager(
        _ peripheral: CBPeripheralManager,
        central: CBCentral,
        didSubscribeTo characteristic: CBCharacteristic
    ) {
        if !subscribers.contains(where: { $0.identifier == central.identifier }) {
            subscribers.append(central)
        }
        state = .connected(central.identifier.uuidString.prefix(8).description)
    }

    func peripheralManager(
        _ peripheral: CBPeripheralManager,
        central: CBCentral,
        didUnsubscribeFrom characteristic: CBCharacteristic
    ) {
        subscribers.removeAll { $0.identifier == central.identifier }
        if subscribers.isEmpty {
            state = .advertising
        }
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveRead request: CBATTRequest) {
        if request.characteristic.uuid == UUIDs.batteryLevel {
            request.value = Data([UInt8(90)])
            peripheral.respond(to: request, withResult: .success)
            return
        }
        peripheral.respond(to: request, withResult: .requestNotSupported)
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
        logger.debug("restauration de l'état du périphérique")
    }
}
