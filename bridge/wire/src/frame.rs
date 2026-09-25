//! Le format des trames échangées entre HemiPad et le boîtier.
//!
//! Le boîtier écoute sur le réseau local. Sans protection, n'importe qui sur
//! le même Wi-Fi pourrait lui envoyer des appuis et jouer à votre place — ou
//! pire, sur votre compte — et lire ce qui est tapé au clavier. Chaque trame
//! porte donc :
//!
//! - un **compteur** qui ne recule jamais, ce qui interdit de rejouer une
//!   trame capturée ;
//! - un **sens** (vers le boîtier, ou vers l'application), signé lui aussi :
//!   une trame renvoyée telle quelle à son expéditeur est refusée ;
//! - une charge utile **chiffrée** (AES-128 en mode compteur) : les touches
//!   tapées ne passent pas en clair sur le Wi-Fi ;
//! - une **signature** HMAC-SHA-256, calculée sur le tout, chiffré compris,
//!   ce qui interdit d'en fabriquer ou d'en modifier une.
//!
//! Le secret est tiré au sort une fois, à l'appairage, et ne circule jamais
//! sur le réseau. Il ne sert pas tel quel : on en tire une clé pour signer et
//! une autre pour chiffrer, pour qu'aucune ne serve à deux usages.
//!
//! ```text
//! position  taille  contenu
//! 0         4       « HPB2 », la marque et la version du format
//! 4         1       identifiant de rapport (1 manette, 2 clavier, 3 battement)
//! 5         1       longueur utile (9 pour la manette, 8 pour le clavier)
//! 6         1       sens : 0 vers le boîtier, 1 vers l'application
//! 7         1       réservé, à zéro
//! 8         8       compteur, en gros-boutiste
//! 16        12      charge utile complétée de zéros, chiffrée
//! 28        16      signature : les 16 premiers octets du HMAC des 28 premiers
//! ```
//!
//! Ce qui reste visible sur le réseau : la sorte de rapport et le rythme des
//! trames. Pas leur contenu.

use crate::aes::ctr_xor;
use crate::sha256::{equal_in_constant_time, hmac_sha256};

/// Marque de début : identifie le format *et* sa version. Un boîtier d'une
/// autre version refuse la trame au lieu de l'interpréter de travers.
pub const MAGIC: [u8; 4] = *b"HPB2";

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

/// Dans quel sens va une trame. Il est signé avec le reste : sans lui, la
/// réponse du boîtier à un battement serait la copie exacte du battement, et
/// n'importe qui sur le Wi-Fi pourrait renvoyer à l'application ses propres
/// trames pour lui faire croire le boîtier présent.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Direction {
    /// De l'application vers le boîtier.
    ToBridge,
    /// Du boîtier vers l'application.
    ToApp,
}

impl Direction {
    pub const fn id(self) -> u8 {
        match self {
            Direction::ToBridge => 0,
            Direction::ToApp => 1,
        }
    }

    pub const fn from_id(id: u8) -> Option<Self> {
        match id {
            0 => Some(Direction::ToBridge),
            1 => Some(Direction::ToApp),
            _ => None,
        }
    }
}

/// La clé de signature, tirée du secret partagé.
fn signing_key(secret: &[u8]) -> [u8; 32] {
    hmac_sha256(secret, b"HemiPad HPB2 signature")
}

/// La clé de chiffrement, tirée du secret partagé, distincte de la première.
fn cipher_key(secret: &[u8]) -> [u8; 16] {
    let derived = hmac_sha256(secret, b"HemiPad HPB2 chiffrement");
    let mut key = [0u8; 16];
    key.copy_from_slice(&derived[..16]);
    key
}

/// Chiffre ou déchiffre la place de la charge utile (l'opération est la
/// même). Le point de départ du mode compteur est fait du compteur de la
/// trame et de son sens : chaque trame a le sien, tant que le compteur de
/// l'expéditeur ne se répète pas — ce que le destinataire refuse de toute
/// façon.
fn apply_cipher(secret: &[u8], direction: Direction, counter: u64, region: &mut [u8]) {
    let mut nonce = [0u8; 16];
    nonce[..8].copy_from_slice(&counter.to_be_bytes());
    nonce[8] = direction.id();
    ctr_xor(&cipher_key(secret), &nonce, region);
}

/// Les sortes de rapports que le pont sait transporter.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReportKind {
    Gamepad,
    Keyboard,
    /// Ni manette ni clavier : « es-tu là ? ». Le boîtier renvoie la même
    /// trame, signée. C'est ce qui permet à l'application de savoir qu'il
    /// répond, et donc de choisir le chemin toute seule.
    Heartbeat,
}

impl ReportKind {
    /// L'identifiant tel qu'il apparaît dans le descripteur HID.
    pub const fn id(self) -> u8 {
        match self {
            ReportKind::Gamepad => 1,
            ReportKind::Keyboard => 2,
            ReportKind::Heartbeat => 3,
        }
    }

    /// Ce rapport va-t-il à la console, ou ne concerne-t-il que le pont ?
    pub const fn reaches_console(self) -> bool {
        !matches!(self, ReportKind::Heartbeat)
    }

    /// La longueur exacte attendue. Une trame qui annonce autre chose est
    /// refusée : mieux vaut perdre un appui que d'écrire n'importe quoi dans
    /// le port USB.
    pub const fn payload_len(self) -> usize {
        match self {
            ReportKind::Gamepad => 9,
            ReportKind::Keyboard => 8,
            ReportKind::Heartbeat => 0,
        }
    }

    pub const fn from_id(id: u8) -> Option<Self> {
        match id {
            1 => Some(ReportKind::Gamepad),
            2 => Some(ReportKind::Keyboard),
            3 => Some(ReportKind::Heartbeat),
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
    /// La trame va dans l'autre sens : c'est une des nôtres, renvoyée.
    Direction,
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
    direction: Direction,
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
    frame[6] = direction.id();
    // frame[7] reste à zéro : réservé.
    frame[8..16].copy_from_slice(&counter.to_be_bytes());
    frame[16..16 + payload.len()].copy_from_slice(payload);
    // Chiffrer d'abord, signer ensuite : la signature couvre ce qui passe
    // réellement sur le réseau, et se vérifie avant tout déchiffrement.
    apply_cipher(key, direction, counter, &mut frame[16..SIGNED_LEN]);

    let tag = hmac_sha256(&signing_key(key), &frame[..SIGNED_LEN]);
    frame[SIGNED_LEN..FRAME_LEN].copy_from_slice(&tag[..TAG_LEN]);
    Ok(())
}

/// Vérifie une trame reçue. `direction` est le sens attendu : celui des
/// trames que l'on reçoit, jamais celui de celles qu'on envoie.
/// `last_counter` est le dernier compteur accepté : une trame qui ne le
/// dépasse pas est refusée.
pub fn open(
    key: &[u8],
    direction: Direction,
    frame: &[u8],
    last_counter: u64,
) -> Result<Frame, FrameError> {
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
    let expected = hmac_sha256(&signing_key(key), &frame[..SIGNED_LEN]);
    if !equal_in_constant_time(&frame[SIGNED_LEN..FRAME_LEN], &expected[..TAG_LEN]) {
        return Err(FrameError::Signature);
    }
    if frame[6] != direction.id() {
        return Err(FrameError::Direction);
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

    let mut region = [0u8; MAX_PAYLOAD];
    region.copy_from_slice(&frame[16..SIGNED_LEN]);
    apply_cipher(key, direction, counter, &mut region);
    let mut payload = [0u8; MAX_PAYLOAD];
    payload[..payload_len].copy_from_slice(&region[..payload_len]);
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
    const IN: Direction = Direction::ToBridge;

    fn sealed(counter: u64) -> [u8; FRAME_LEN] {
        let mut frame = [0u8; FRAME_LEN];
        seal(&KEY, IN, ReportKind::Gamepad, &GAMEPAD, counter, &mut frame).unwrap();
        frame
    }

    /// Signe une trame fabriquée à la main, comme le ferait un appareil qui
    /// connaît le secret mais enverrait n'importe quoi.
    fn sign(frame: &mut [u8; FRAME_LEN]) {
        let tag = hmac_sha256(&signing_key(&KEY), &frame[..SIGNED_LEN]);
        frame[SIGNED_LEN..].copy_from_slice(&tag[..TAG_LEN]);
    }

    #[test]
    fn a_sealed_frame_opens_again() {
        let frame = sealed(1);
        let opened = open(&KEY, IN, &frame, 0).unwrap();
        assert_eq!(opened.kind, ReportKind::Gamepad);
        assert_eq!(opened.counter, 1);
        assert_eq!(opened.payload(), &GAMEPAD);
    }

    #[test]
    fn the_keyboard_travels_too() {
        let keys = [0x02, 0, 0x04, 0, 0, 0, 0, 0];
        let mut frame = [0u8; FRAME_LEN];
        seal(&KEY, IN, ReportKind::Keyboard, &keys, 9, &mut frame).unwrap();
        let opened = open(&KEY, IN, &frame, 8).unwrap();
        assert_eq!(opened.kind, ReportKind::Keyboard);
        assert_eq!(opened.payload(), &keys);
    }

    #[test]
    fn another_key_is_refused() {
        let frame = sealed(1);
        assert_eq!(
            open(&[9; KEY_LEN], IN, &frame, 0),
            Err(FrameError::Signature)
        );
    }

    #[test]
    fn every_altered_byte_is_caught() {
        // Chaque octet signé compte : en changer un seul, où que ce soit,
        // doit faire échouer la vérification.
        for index in 0..SIGNED_LEN {
            let mut frame = sealed(1);
            frame[index] ^= 0x01;
            let refusal = open(&KEY, IN, &frame, 0).unwrap_err();
            assert!(
                matches!(refusal, FrameError::Signature | FrameError::Magic),
                "octet {index} modifié, refus inattendu : {refusal:?}"
            );
        }
        // Et la signature elle-même n'est pas rattrapable.
        for index in SIGNED_LEN..FRAME_LEN {
            let mut frame = sealed(1);
            frame[index] ^= 0x01;
            assert_eq!(open(&KEY, IN, &frame, 0), Err(FrameError::Signature));
        }
    }

    #[test]
    fn a_replayed_frame_is_refused() {
        let frame = sealed(5);
        assert!(open(&KEY, IN, &frame, 4).is_ok());
        // Rejouée après coup : refusée, même signature valide.
        assert_eq!(open(&KEY, IN, &frame, 5), Err(FrameError::Replay));
        assert_eq!(open(&KEY, IN, &frame, 99), Err(FrameError::Replay));
    }

    #[test]
    fn a_truncated_frame_is_refused_before_being_read() {
        let frame = sealed(1);
        assert_eq!(
            open(&KEY, IN, &frame[..FRAME_LEN - 1], 0),
            Err(FrameError::Length)
        );
        assert_eq!(open(&KEY, IN, &[], 0), Err(FrameError::Length));
    }

    #[test]
    fn a_frame_from_another_format_is_refused() {
        let mut frame = sealed(1);
        // Une trame de l'ancien format HPB1 : refusée d'emblée.
        frame[3] = b'1';
        assert_eq!(open(&KEY, IN, &frame, 0), Err(FrameError::Magic));
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
            sign(&mut frame);
            assert_eq!(open(&KEY, IN, &frame, 0), Err(FrameError::PayloadLength));
        }
    }

    #[test]
    fn an_unknown_report_is_refused_even_when_signed() {
        let mut frame = [0u8; FRAME_LEN];
        frame[0..4].copy_from_slice(&MAGIC);
        frame[4] = 7;
        frame[5] = 9;
        frame[8..16].copy_from_slice(&1u64.to_be_bytes());
        sign(&mut frame);
        assert_eq!(open(&KEY, IN, &frame, 0), Err(FrameError::UnknownReport));
    }

    #[test]
    fn a_heartbeat_carries_nothing_and_comes_back() {
        let mut frame = [0u8; FRAME_LEN];
        seal(&KEY, IN, ReportKind::Heartbeat, &[], 12, &mut frame).unwrap();
        let opened = open(&KEY, IN, &frame, 11).unwrap();
        assert_eq!(opened.kind, ReportKind::Heartbeat);
        assert_eq!(opened.counter, 12);
        assert!(opened.payload().is_empty());
        assert!(!opened.kind.reaches_console(), "ne va pas à la console");
        assert!(ReportKind::Gamepad.reaches_console());
        assert!(ReportKind::Keyboard.reaches_console());
    }

    /// Un battement signé mais qui prétendrait porter des octets serait une
    /// façon d'envoyer n'importe quoi à la console : refusé.
    #[test]
    fn a_heartbeat_that_claims_a_payload_is_refused() {
        let mut frame = [0u8; FRAME_LEN];
        frame[0..4].copy_from_slice(&MAGIC);
        frame[4] = 3;
        frame[5] = 9;
        frame[8..16].copy_from_slice(&1u64.to_be_bytes());
        sign(&mut frame);
        assert_eq!(open(&KEY, IN, &frame, 0), Err(FrameError::PayloadLength));
    }

    #[test]
    fn sealing_refuses_a_bad_key_or_payload() {
        let mut frame = [0u8; FRAME_LEN];
        assert_eq!(
            seal(&[1; 16], IN, ReportKind::Gamepad, &GAMEPAD, 1, &mut frame),
            Err(FrameError::KeyLength)
        );
        assert_eq!(
            seal(&KEY, IN, ReportKind::Gamepad, &[0; 4], 1, &mut frame),
            Err(FrameError::PayloadLength)
        );
        let mut small = [0u8; FRAME_LEN - 1];
        assert_eq!(
            seal(&KEY, IN, ReportKind::Gamepad, &GAMEPAD, 1, &mut small),
            Err(FrameError::OutputTooSmall)
        );
    }

    /// Deux trames identiques sauf le compteur doivent avoir deux signatures
    /// différentes, sinon le compteur ne protégerait rien.
    #[test]
    fn the_counter_is_part_of_what_is_signed() {
        assert_ne!(sealed(1)[SIGNED_LEN..], sealed(2)[SIGNED_LEN..]);
    }

    /// Ce qui est tapé au clavier ne doit pas se lire sur le Wi-Fi.
    #[test]
    fn the_payload_does_not_travel_in_clear() {
        let keys = [0x02, 0, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09];
        let mut frame = [0u8; FRAME_LEN];
        seal(&KEY, IN, ReportKind::Keyboard, &keys, 1, &mut frame).unwrap();
        assert_ne!(&frame[16..24], &keys, "les touches passent chiffrées");
        // Même rapport, autre compteur : autre chiffré. Sinon on verrait
        // qu'une même touche est tapée deux fois.
        let mut again = [0u8; FRAME_LEN];
        seal(&KEY, IN, ReportKind::Keyboard, &keys, 2, &mut again).unwrap();
        assert_ne!(&frame[16..28], &again[16..28]);
        // Et à l'arrivée, les octets reviennent intacts.
        assert_eq!(open(&KEY, IN, &frame, 0).unwrap().payload(), &keys);
    }

    /// Une trame renvoyée telle quelle à son expéditeur est refusée : c'est
    /// ce qui empêche de faire croire à l'application que le boîtier répond
    /// en lui renvoyant ses propres battements.
    #[test]
    fn a_frame_sent_back_to_its_sender_is_refused() {
        let mut heartbeat = [0u8; FRAME_LEN];
        seal(&KEY, IN, ReportKind::Heartbeat, &[], 5, &mut heartbeat).unwrap();
        assert_eq!(
            open(&KEY, Direction::ToApp, &heartbeat, 0),
            Err(FrameError::Direction)
        );

        let mut reply = [0u8; FRAME_LEN];
        seal(
            &KEY,
            Direction::ToApp,
            ReportKind::Heartbeat,
            &[],
            5,
            &mut reply,
        )
        .unwrap();
        assert_ne!(
            reply, heartbeat,
            "la réponse n'est pas la copie du battement"
        );
        assert!(open(&KEY, Direction::ToApp, &reply, 0).is_ok());
        assert_eq!(open(&KEY, IN, &reply, 0), Err(FrameError::Direction));
    }

    /// Les deux sens chiffrent différemment, même avec le même compteur :
    /// sinon la réponse du boîtier trahirait le chiffré de l'application.
    #[test]
    fn both_directions_use_their_own_keystream() {
        let mut to_bridge = [0u8; MAX_PAYLOAD];
        let mut to_app = [0u8; MAX_PAYLOAD];
        apply_cipher(&KEY, Direction::ToBridge, 9, &mut to_bridge);
        apply_cipher(&KEY, Direction::ToApp, 9, &mut to_app);
        assert_ne!(to_bridge, to_app);
    }

    /// Le secret ne sert jamais tel quel, et ses deux usages restent séparés.
    #[test]
    fn the_secret_is_split_into_two_distinct_keys() {
        let signing = signing_key(&KEY);
        let cipher = cipher_key(&KEY);
        assert_ne!(&signing[..], &KEY[..]);
        assert_ne!(&signing[..16], &cipher[..]);
    }

    #[test]
    fn directions_round_trip_through_their_identifier() {
        for direction in [Direction::ToBridge, Direction::ToApp] {
            assert_eq!(Direction::from_id(direction.id()), Some(direction));
        }
        assert_eq!(Direction::from_id(2), None);
    }
}
