//! Par où sortent les rapports : le port USB, ou le Bluetooth.
//!
//! Les deux transportent exactement les mêmes octets de manette — le même
//! descripteur HID, les mêmes rapports. Seul l'emballage change :
//!
//! - **USB** (`/dev/hidg0`) attend l'identifiant de rapport, puis la charge
//!   utile. Le noyau se charge du reste.
//! - **Bluetooth** (HIDP, canal d'interruption) attend en plus un octet
//!   d'en-tête qui dit de quelle sorte de transaction il s'agit : `0xA1`,
//!   c'est-à-dire « données » + « rapport d'entrée ».
//!
//! Un octet d'écart, mais qui décide si la console comprend ou ignore. Le
//! mettre ici, avec ses essais, évite de le chercher un jour dans le code du
//! boîtier.

use crate::frame::ReportKind;

/// Le plus long rapport emballé : en-tête + identifiant + 9 octets de manette.
pub const MAX_OUTPUT_LEN: usize = 11;

/// En-tête HIDP d'un rapport d'entrée : transaction « données » (0xA0) plus le
/// type « entrée » (0x01).
pub const HIDP_INPUT_HEADER: u8 = 0xA1;

/// Le chemin par lequel un rapport rejoint la console.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Output {
    /// Le port USB du boîtier, en mode gadget.
    Usb,
    /// Le Bluetooth du boîtier, canal d'interruption HIDP.
    Bluetooth,
}

impl Output {
    pub const fn code(self) -> u8 {
        match self {
            Output::Usb => 0,
            Output::Bluetooth => 1,
        }
    }

    pub const fn from_code(code: u8) -> Option<Self> {
        match code {
            0 => Some(Output::Usb),
            1 => Some(Output::Bluetooth),
            _ => None,
        }
    }

    /// Nombre d'octets ajoutés devant l'identifiant de rapport.
    pub const fn header_len(self) -> usize {
        match self {
            Output::Usb => 0,
            Output::Bluetooth => 1,
        }
    }
}

/// Un rapport prêt à être écrit sur un chemin donné.
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct OutputFrame {
    bytes: [u8; MAX_OUTPUT_LEN],
    len: usize,
}

impl OutputFrame {
    pub fn as_bytes(&self) -> &[u8] {
        &self.bytes[..self.len]
    }

    pub fn len(&self) -> usize {
        self.len
    }

    pub fn is_empty(&self) -> bool {
        self.len == 0
    }
}

impl core::fmt::Debug for OutputFrame {
    fn fmt(&self, formatter: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(formatter, "OutputFrame{:?}", self.as_bytes())
    }
}

/// Emballe un rapport pour le chemin choisi.
///
/// La longueur de la charge utile doit être celle qu'annonce le descripteur
/// pour cette sorte de rapport : une longueur inventée ferait comprendre
/// n'importe quoi à la console.
pub fn wrap(output: Output, kind: ReportKind, payload: &[u8]) -> Option<OutputFrame> {
    if payload.len() != kind.payload_len() {
        return None;
    }
    let mut bytes = [0u8; MAX_OUTPUT_LEN];
    let mut position = 0;
    if output == Output::Bluetooth {
        bytes[position] = HIDP_INPUT_HEADER;
        position += 1;
    }
    bytes[position] = kind.id();
    position += 1;
    bytes[position..position + payload.len()].copy_from_slice(payload);
    Some(OutputFrame {
        bytes,
        len: position + payload.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const MANETTE: [u8; 9] = [128, 128, 128, 128, 0, 0, 8, 0, 0];
    const CLAVIER: [u8; 8] = [0x02, 0, 0x04, 0, 0, 0, 0, 0];

    #[test]
    fn usb_sends_the_identifier_then_the_payload() {
        let frame = wrap(Output::Usb, ReportKind::Gamepad, &MANETTE).unwrap();
        assert_eq!(frame.as_bytes()[0], 1);
        assert_eq!(&frame.as_bytes()[1..], &MANETTE);
        assert_eq!(frame.len(), 10);
    }

    #[test]
    fn bluetooth_adds_the_hidp_header() {
        let frame = wrap(Output::Bluetooth, ReportKind::Gamepad, &MANETTE).unwrap();
        assert_eq!(frame.as_bytes()[0], HIDP_INPUT_HEADER, "en-tête HIDP");
        assert_eq!(frame.as_bytes()[1], 1, "puis l'identifiant de rapport");
        assert_eq!(&frame.as_bytes()[2..], &MANETTE);
        assert_eq!(frame.len(), 11);
    }

    /// Les deux chemins portent les mêmes octets de manette : c'est ce qui
    /// permet à la console de voir la même chose, par le câble ou sans.
    #[test]
    fn both_paths_carry_the_same_report() {
        let usb = wrap(Output::Usb, ReportKind::Gamepad, &MANETTE).unwrap();
        let bluetooth = wrap(Output::Bluetooth, ReportKind::Gamepad, &MANETTE).unwrap();
        assert_eq!(usb.as_bytes(), &bluetooth.as_bytes()[1..]);
    }

    #[test]
    fn the_keyboard_travels_on_both_paths_too() {
        let usb = wrap(Output::Usb, ReportKind::Keyboard, &CLAVIER).unwrap();
        assert_eq!(usb.as_bytes()[0], 2);
        assert_eq!(usb.len(), 9);

        let bluetooth = wrap(Output::Bluetooth, ReportKind::Keyboard, &CLAVIER).unwrap();
        assert_eq!(bluetooth.as_bytes()[0], HIDP_INPUT_HEADER);
        assert_eq!(bluetooth.as_bytes()[1], 2);
        assert_eq!(bluetooth.len(), 10);
    }

    #[test]
    fn a_payload_of_the_wrong_length_is_refused() {
        assert!(wrap(Output::Usb, ReportKind::Gamepad, &CLAVIER).is_none());
        assert!(wrap(Output::Bluetooth, ReportKind::Keyboard, &MANETTE).is_none());
        assert!(wrap(Output::Usb, ReportKind::Gamepad, &[]).is_none());
    }

    #[test]
    fn nothing_ever_overflows_the_buffer() {
        // Le plus long cas possible tient exactement dans MAX_OUTPUT_LEN.
        let longest = wrap(Output::Bluetooth, ReportKind::Gamepad, &MANETTE).unwrap();
        assert_eq!(longest.len(), MAX_OUTPUT_LEN);
    }

    #[test]
    fn the_paths_survive_a_round_trip_through_their_code() {
        for output in [Output::Usb, Output::Bluetooth] {
            assert_eq!(Output::from_code(output.code()), Some(output));
        }
        assert_eq!(Output::from_code(2), None);
        assert_eq!(Output::Usb.header_len(), 0);
        assert_eq!(Output::Bluetooth.header_len(), 1);
    }
}
