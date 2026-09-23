import Foundation

/// Descripteurs de rapport HID utilisés par HemiPad.
///
/// Ces octets sont publiés dans la caractéristique *Report Map* du profil
/// Bluetooth : c'est la carte que la machine lit pour comprendre les rapports.
/// Garder une source unique évite que l'écran et la machine ne soient plus
/// d'accord sur la signification d'un octet.
enum HIDReportDescriptors {
    /// Identifiants de rapport, communs aux deux descripteurs.
    enum ReportID: UInt8 {
        case gamepad = 1
        case keyboard = 2
    }

    /// Manette : 4 axes de sticks, 2 gâchettes analogiques, un hat switch,
    /// 16 boutons. Charge utile = 9 octets après l'identifiant de rapport.
    static let gamepad: [UInt8] = [
        0x05, 0x01,       // Usage Page (Generic Desktop)
        0x09, 0x05,       // Usage (Game Pad)
        0xA1, 0x01,       // Collection (Application)
        0x85, ReportID.gamepad.rawValue, //   Report ID (1)
        0xA1, 0x00,       //   Collection (Physical)
        0x09, 0x30,       //     Usage (X)   - stick gauche X
        0x09, 0x31,       //     Usage (Y)   - stick gauche Y
        0x09, 0x32,       //     Usage (Z)   - stick droit X
        0x09, 0x35,       //     Usage (Rz)  - stick droit Y
        0x15, 0x00,       //     Logical Minimum (0)
        0x26, 0xFF, 0x00, //     Logical Maximum (255)
        0x75, 0x08,       //     Report Size (8)
        0x95, 0x04,       //     Report Count (4)
        0x81, 0x02,       //     Input (Data, Variable, Absolute)
        0xC0,             //   End Collection
        0x05, 0x02,       //   Usage Page (Simulation Controls)
        0x09, 0xC5,       //   Usage (Brake)        - gâchette gauche
        0x09, 0xC4,       //   Usage (Accelerator)  - gâchette droite
        0x15, 0x00,       //   Logical Minimum (0)
        0x26, 0xFF, 0x00, //   Logical Maximum (255)
        0x75, 0x08,       //   Report Size (8)
        0x95, 0x02,       //   Report Count (2)
        0x81, 0x02,       //   Input (Data, Variable, Absolute)
        0x05, 0x01,       //   Usage Page (Generic Desktop)
        0x09, 0x39,       //   Usage (Hat switch)
        0x15, 0x00,       //   Logical Minimum (0)
        0x25, 0x07,       //   Logical Maximum (7)
        0x35, 0x00,       //   Physical Minimum (0)
        0x46, 0x3B, 0x01, //   Physical Maximum (315)
        0x65, 0x14,       //   Unit (Degrees)
        0x75, 0x04,       //   Report Size (4)
        0x95, 0x01,       //   Report Count (1)
        0x81, 0x42,       //   Input (Data, Variable, Absolute, Null State)
        0x65, 0x00,       //   Unit (None)
        0x75, 0x04,       //   Report Size (4)
        0x95, 0x01,       //   Report Count (1)
        0x81, 0x03,       //   Input (Constant) - bourrage 4 bits
        0x05, 0x09,       //   Usage Page (Button)
        0x19, 0x01,       //   Usage Minimum (Button 1)
        0x29, 0x10,       //   Usage Maximum (Button 16)
        0x15, 0x00,       //   Logical Minimum (0)
        0x25, 0x01,       //   Logical Maximum (1)
        0x75, 0x01,       //   Report Size (1)
        0x95, 0x10,       //   Report Count (16)
        0x81, 0x02,       //   Input (Data, Variable, Absolute)
        0xC0              // End Collection
    ]

    /// Clavier « boot protocol » : 1 octet de modificateurs, 1 octet réservé,
    /// 6 touches simultanées. Charge utile = 8 octets.
    static let keyboard: [UInt8] = [
        0x05, 0x01,       // Usage Page (Generic Desktop)
        0x09, 0x06,       // Usage (Keyboard)
        0xA1, 0x01,       // Collection (Application)
        0x85, ReportID.keyboard.rawValue, //   Report ID (2)
        0x05, 0x07,       //   Usage Page (Keyboard/Keypad)
        0x19, 0xE0,       //   Usage Minimum (Left Control)
        0x29, 0xE7,       //   Usage Maximum (Right GUI)
        0x15, 0x00,       //   Logical Minimum (0)
        0x25, 0x01,       //   Logical Maximum (1)
        0x75, 0x01,       //   Report Size (1)
        0x95, 0x08,       //   Report Count (8)
        0x81, 0x02,       //   Input (Data, Variable, Absolute) - modificateurs
        0x95, 0x01,       //   Report Count (1)
        0x75, 0x08,       //   Report Size (8)
        0x81, 0x03,       //   Input (Constant) - octet réservé
        0x95, 0x05,       //   Report Count (5)
        0x75, 0x01,       //   Report Size (1)
        0x05, 0x08,       //   Usage Page (LEDs)
        0x19, 0x01,       //   Usage Minimum (Num Lock)
        0x29, 0x05,       //   Usage Maximum (Kana)
        0x91, 0x02,       //   Output (Data, Variable, Absolute) - LEDs
        0x95, 0x01,       //   Report Count (1)
        0x75, 0x03,       //   Report Size (3)
        0x91, 0x03,       //   Output (Constant) - bourrage LED
        0x95, 0x06,       //   Report Count (6)
        0x75, 0x08,       //   Report Size (8)
        0x15, 0x00,       //   Logical Minimum (0)
        0x25, 0x65,       //   Logical Maximum (101)
        0x05, 0x07,       //   Usage Page (Keyboard/Keypad)
        0x19, 0x00,       //   Usage Minimum (0)
        0x29, 0x65,       //   Usage Maximum (101)
        0x81, 0x00,       //   Input (Data, Array) - 6 touches
        0xC0              // End Collection
    ]

    /// Carte complète publiée à l'hôte : manette + clavier dans le même
    /// descripteur, ce qui permet à une seule connexion de servir la console
    /// et l'éditeur de code.
    static var combined: [UInt8] { gamepad + keyboard }
}
