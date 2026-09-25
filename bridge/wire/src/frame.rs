//! Le format des trames échangées entre HemiPad et le boîtier.
//!
//! Le boîtier écoute sur le réseau local. Sans protection, n'importe qui sur
//! le même Wi-Fi pourrait lui envoyer des appuis et jouer à votre place — ou
//! pire, sur votre compte. Chaque trame porte donc :
//!
//! - un **compteur** qui ne recule jamais, ce qui interdit de rejouer une
//!   trame capturée ;
//! - une **signature** HMAC-SHA-256 calculée avec un secret partagé, ce qui
//!   interdit d'en fabriquer une.
//!
//! Le secret est tiré au sort une fois, à l'appairage, et ne circule jamais
//! sur le réseau.
//!
//! ```text
//! position  taille  contenu
//! 0         4       « HPB1 », la marque et la version du format
//! 4         1       identifiant de rapport (1 manette, 2 clavier)
//! 5         1       longueur utile (9 pour la manette, 8 pour le clavier)
//! 6         2       réservé, à zéro
//! 8         8       compteur, en gros-boutiste
//! 16        12      charge utile, complétée de zéros
//! 28        16      signature : les 16 premiers octets du HMAC des 28 premiers
//! ```

use crate::sha256::{equal_in_constant_time, hmac_sha256};

/// Marque de début : identifie le format *et* sa version. Un boîtier d'une
/// autre version refuse la trame au lieu de l'interpréter de travers.
pub const MAGIC: [u8; 4] = *b"HPB1";

/// Longueur d'une trame, toujours la même : une trame plus courte ou plus
/// longue est refusée sans être lue.
pub const FRAME_LEN: usize = 44;

/// Longueur du secret partagé, en octets.
pub const KEY_LEN: usize = 32;

/// Place réservée à la charge utile dans la trame.
pub const MAX_PAYLOAD: usize = 12;

/// Longueur de la signature retenue. Seize octets suffisent largement ici :
/// il faudrait en moyenne 2^127 essais pour en deviner une, et le compteur
/// interdit déjà de réessayer avec la même trame.
pub const TAG_LEN: usize = 16;

const SIGNED_LEN: usize = FRAME_LEN - TAG_LEN;

/// Les sortes de rapports que le pont sait transporter.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReportKind {
    Gamepad,
    Keyboard,
}

impl ReportKind {
    /// L'identifiant tel qu'il apparaît dans le descripteur HID.
    pub const fn id(self) -> u8 {
        match self {
            ReportKind::Gamepad => 1,
            ReportKind::Keyboard => 2,
        }
    }

    /// La longueur exacte attendue. Une trame qui annonce autre chose est
    /// refusée : mieux vaut perdre un appui que d'écrire n'importe quoi dans
    /// le port USB.
    pub const fn payload_len(self) -> usize {
        match self {
            ReportKind::Gamepad => 9,
            ReportKind::Keyboard => 8,
        }
    }

    pub const fn from_id(id: u8) -> Option<Self> {
        match id {
            1 => Some(ReportKind::Gamepad),
            2 => Some(ReportKind::Keyboard),
            _ => None,
        }
    }
}

/// Pourquoi une trame a été refusée.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FrameError {
    /// La trame n'a pas la bonne taille.
    Length,
    /// Ce n'est pas une trame HemiPad, ou pas cette version du format.
    Magic,
    /// Identifiant de rapport inconnu.
    UnknownReport,
    /// La longueur annoncée ne correspond pas à la sorte de rapport.
    PayloadLength,
    /// Le secret n'a pas la bonne taille.
    KeyLength,
    /// Signature fausse : la trame ne vient pas de l'appareil appairé.
    Signature,
    /// Compteur déjà vu : trame rejouée, ou arrivée dans le désordre.
    Replay,
    /// Le tampon de sortie est trop petit.
    OutputTooSmall,
}

/// Une trame déchiffrée et vérifiée.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Frame {
    pub kind: ReportKind,
    pub counter: u64,
    payload: [u8; MAX_PAYLOAD],
    payload_len: usize,
}

impl Frame {
    pub fn payload(&self) -> &[u8] {
        &self.payload[..self.payload_len]
    }
}

/// Scelle un rapport dans une trame prête à partir.
pub fn seal(
    key: &[u8],
    kind: ReportKind,
    payload: &[u8],
    counter: u64,
    out: &mut [u8],
) -> Result<(), FrameError> {
    if key.len() != KEY_LEN {
        return Err(FrameError::KeyLength);
    }
    if payload.len() != kind.payload_len() {
        return Err(FrameError::PayloadLength);
    }
    if out.len() < FRAME_LEN {
        return Err(FrameError::OutputTooSmall);
    }

    let frame = &mut out[..FRAME_LEN];
    frame.fill(0);
    frame[0..4].copy_from_slice(&MAGIC);
    frame[4] = kind.id();
    frame[5] = payload.len() as u8;
    // frame[6..8] reste à zéro : réservé.
    frame[8..16].copy_from_slice(&counter.to_be_bytes());
    frame[16..16 + payload.len()].copy_from_slice(payload);

    let tag = hmac_sha256(key, &frame[..SIGNED_LEN]);
    frame[SIGNED_LEN..FRAME_LEN].copy_from_slice(&tag[..TAG_LEN]);
    Ok(())
}

/// Vérifie une trame reçue. `last_counter` est le dernier compteur accepté :
/// une trame qui ne le dépasse pas est refusée.
pub fn open(key: &[u8], frame: &[u8], last_counter: u64) -> Result<Frame, FrameError> {
    if key.len() != KEY_LEN {
        return Err(FrameError::KeyLength);
    }
    if frame.len() != FRAME_LEN {
        return Err(FrameError::Length);
    }
    if frame[0..4] != MAGIC {
        return Err(FrameError::Magic);
    }

    // La signature d'abord : tant qu'elle n'est pas vérifiée, le contenu de la
    // trame vient de n'importe qui et ne mérite aucune confiance.
    let expected = hmac_sha256(key, &frame[..SIGNED_LEN]);
    if !equal_in_constant_time(&frame[SIGNED_LEN..FRAME_LEN], &expected[..TAG_LEN]) {
        return Err(FrameError::Signature);
    }

    let kind = ReportKind::from_id(frame[4]).ok_or(FrameError::UnknownReport)?;
    let payload_len = frame[5] as usize;
    if payload_len != kind.payload_len() {
        return Err(FrameError::PayloadLength);
    }

    let mut counter_bytes = [0u8; 8];
    counter_bytes.copy_from_slice(&frame[8..16]);
    let counter = u64::from_be_bytes(counter_bytes);
    if counter <= last_counter {
        return Err(FrameError::Replay);
    }

    let mut payload = [0u8; MAX_PAYLOAD];
    payload[..payload_len].copy_from_slice(&frame[16..16 + payload_len]);
    Ok(Frame {
        kind,
        counter,
        payload,
        payload_len,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: [u8; KEY_LEN] = [7; KEY_LEN];
    const GAMEPAD: [u8; 9] = [128, 128, 128, 128, 0, 0, 8, 0, 0];

    fn sealed(counter: u64) -> [u8; FRAME_LEN] {
        let mut frame = [0u8; FRAME_LEN];
        seal(&KEY, ReportKind::Gamepad, &GAMEPAD, counter, &mut frame).unwrap();
        frame
    }

    #[test]
    fn a_sealed_frame_opens_again() {
        let frame = sealed(1);
        let opened = open(&KEY, &frame, 0).unwrap();
        assert_eq!(opened.kind, ReportKind::Gamepad);
        assert_eq!(opened.counter, 1);
        assert_eq!(opened.payload(), &GAMEPAD);
    }

    #[test]
    fn the_keyboard_travels_too() {
        let keys = [0x02, 0, 0x04, 0, 0, 0, 0, 0];
        let mut frame = [0u8; FRAME_LEN];
        seal(&KEY, ReportKind::Keyboard, &keys, 9, &mut frame).unwrap();
        let opened = open(&KEY, &frame, 8).unwrap();
        assert_eq!(opened.kind, ReportKind::Keyboard);
        assert_eq!(opened.payload(), &keys);
    }

    #[test]
    fn another_key_is_refused() {
        let frame = sealed(1);
        assert_eq!(open(&[9; KEY_LEN], &frame, 0), Err(FrameError::Signature));
    }

    #[test]
    fn every_altered_byte_is_caught() {
        // Chaque octet signé compte : en changer un seul, où que ce soit,
        // doit faire échouer la vérification.
        for index in 0..SIGNED_LEN {
            let mut frame = sealed(1);
            frame[index] ^= 0x01;
            let refusal = open(&KEY, &frame, 0).unwrap_err();
            assert!(
                matches!(refusal, FrameError::Signature | FrameError::Magic),
                "octet {index} modifié, refus inattendu : {refusal:?}"
            );
        }
        // Et la signature elle-même n'est pas rattrapable.
        for index in SIGNED_LEN..FRAME_LEN {
            let mut frame = sealed(1);
            frame[index] ^= 0x01;
            assert_eq!(open(&KEY, &frame, 0), Err(FrameError::Signature));
        }
    }

    #[test]
    fn a_replayed_frame_is_refused() {
        let frame = sealed(5);
        assert!(open(&KEY, &frame, 4).is_ok());
        // Rejouée après coup : refusée, même signature valide.
        assert_eq!(open(&KEY, &frame, 5), Err(FrameError::Replay));
        assert_eq!(open(&KEY, &frame, 99), Err(FrameError::Replay));
    }

    #[test]
    fn a_truncated_frame_is_refused_before_being_read() {
        let frame = sealed(1);
        assert_eq!(
            open(&KEY, &frame[..FRAME_LEN - 1], 0),
            Err(FrameError::Length)
        );
        assert_eq!(open(&KEY, &[], 0), Err(FrameError::Length));
    }

    #[test]
    fn a_frame_from_another_format_is_refused() {
        let mut frame = sealed(1);
        frame[3] = b'2';
        assert_eq!(open(&KEY, &frame, 0), Err(FrameError::Magic));
    }

    /// Une trame signée mais dont l'en-tête annonce une longueur fausse ne
    /// doit pas faire écrire n'importe quoi dans le port USB.
    #[test]
    fn a_lying_length_is_refused_even_when_signed() {
        for (id, length) in [(1u8, 8u8), (2, 9), (1, 12), (2, 0)] {
            let mut frame = [0u8; FRAME_LEN];
            frame[0..4].copy_from_slice(&MAGIC);
            frame[4] = id;
            frame[5] = length;
            frame[8..16].copy_from_slice(&1u64.to_be_bytes());
            let tag = crate::sha256::hmac_sha256(&KEY, &frame[..SIGNED_LEN]);
            frame[SIGNED_LEN..].copy_from_slice(&tag[..TAG_LEN]);
            assert_eq!(open(&KEY, &frame, 0), Err(FrameError::PayloadLength));
        }
    }

    #[test]
    fn an_unknown_report_is_refused_even_when_signed() {
        let mut frame = [0u8; FRAME_LEN];
        frame[0..4].copy_from_slice(&MAGIC);
        frame[4] = 7;
        frame[5] = 9;
        frame[8..16].copy_from_slice(&1u64.to_be_bytes());
        let tag = crate::sha256::hmac_sha256(&KEY, &frame[..SIGNED_LEN]);
        frame[SIGNED_LEN..].copy_from_slice(&tag[..TAG_LEN]);
        assert_eq!(open(&KEY, &frame, 0), Err(FrameError::UnknownReport));
    }

    #[test]
    fn sealing_refuses_a_bad_key_or_payload() {
        let mut frame = [0u8; FRAME_LEN];
        assert_eq!(
            seal(&[1; 16], ReportKind::Gamepad, &GAMEPAD, 1, &mut frame),
            Err(FrameError::KeyLength)
        );
        assert_eq!(
            seal(&KEY, ReportKind::Gamepad, &[0; 4], 1, &mut frame),
            Err(FrameError::PayloadLength)
        );
        let mut small = [0u8; FRAME_LEN - 1];
        assert_eq!(
            seal(&KEY, ReportKind::Gamepad, &GAMEPAD, 1, &mut small),
            Err(FrameError::OutputTooSmall)
        );
    }

    /// Deux trames identiques sauf le compteur doivent avoir deux signatures
    /// différentes, sinon le compteur ne protégerait rien.
    #[test]
    fn the_counter_is_part_of_what_is_signed() {
        assert_ne!(sealed(1)[SIGNED_LEN..], sealed(2)[SIGNED_LEN..]);
    }
}
