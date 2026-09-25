//! Le format de trame du pont USB HemiPad, et son ABI C.
//!
//! Le même code sert des deux côtés du fil : l'application iOS scelle les
//! trames, le boîtier les ouvre. Un seul code, donc aucune chance que les deux
//! bouts cessent d'être d'accord sur un octet.
//!
//! Côté Swift, tout passe par l'ABI C déclarée dans `include/hemipad_wire.h`
//! et reprise par le pont d'en-têtes de l'application. Les fonctions `extern
//! "C"` ci-dessous ne renvoient jamais d'erreur par panique : elles rendent un
//! code négatif, que Swift transforme en erreur.

pub mod aes;
pub mod connection;
pub mod descriptor;
pub mod frame;
pub mod output;
pub mod sha256;

pub use connection::{Chooser, Path, DEFAULT_BRIDGE_TIMEOUT_MS, DEFAULT_SETTLE_MS};
pub use descriptor::HID_REPORT_DESCRIPTOR;
pub use frame::{
    open, seal, Direction, Frame, FrameError, ReportKind, FRAME_LEN, KEY_LEN, MAGIC, MAX_PAYLOAD,
    TAG_LEN,
};
pub use output::{wrap, Output, OutputFrame, HIDP_INPUT_HEADER, MAX_OUTPUT_LEN};

use core::slice;

/// Version de l'ABI. Swift la lit au démarrage : si la bibliothèque liée
/// n'est pas celle attendue, mieux vaut le savoir tout de suite que de
/// découvrir un décalage d'octets en pleine partie.
pub const ABI_VERSION: i32 = 2;

/// Codes rendus par l'ABI C. Zéro veut dire « c'est fait ».
pub mod status {
    pub const OK: i32 = 0;
    pub const NULL_POINTER: i32 = -1;
    pub const KEY_LENGTH: i32 = -2;
    pub const PAYLOAD_LENGTH: i32 = -3;
    pub const OUTPUT_TOO_SMALL: i32 = -4;
    pub const FRAME_LENGTH: i32 = -5;
    pub const MAGIC: i32 = -6;
    pub const UNKNOWN_REPORT: i32 = -7;
    pub const SIGNATURE: i32 = -8;
    pub const REPLAY: i32 = -9;
    pub const UNKNOWN_OUTPUT: i32 = -10;
    pub const DIRECTION: i32 = -11;
}

fn code(error: FrameError) -> i32 {
    match error {
        FrameError::Length => status::FRAME_LENGTH,
        FrameError::Magic => status::MAGIC,
        FrameError::UnknownReport => status::UNKNOWN_REPORT,
        FrameError::PayloadLength => status::PAYLOAD_LENGTH,
        FrameError::KeyLength => status::KEY_LENGTH,
        FrameError::Signature => status::SIGNATURE,
        FrameError::Replay => status::REPLAY,
        FrameError::Direction => status::DIRECTION,
        FrameError::OutputTooSmall => status::OUTPUT_TOO_SMALL,
    }
}

/// Emprunte une tranche à un pointeur venu de C. Un pointeur nul avec une
/// longueur non nulle est refusé plutôt que déréférencé.
///
/// # Safety
/// L'appelant garantit que `pointer` adresse bien `len` octets lisibles.
unsafe fn borrow<'a>(pointer: *const u8, len: usize) -> Option<&'a [u8]> {
    if len == 0 {
        return Some(&[]);
    }
    if pointer.is_null() {
        return None;
    }
    Some(slice::from_raw_parts(pointer, len))
}

/// # Safety
/// L'appelant garantit que `pointer` adresse `len` octets accessibles en
/// écriture.
unsafe fn borrow_mut<'a>(pointer: *mut u8, len: usize) -> Option<&'a mut [u8]> {
    if len == 0 {
        return Some(&mut []);
    }
    if pointer.is_null() {
        return None;
    }
    Some(slice::from_raw_parts_mut(pointer, len))
}

/// Version de l'ABI de cette bibliothèque.
#[no_mangle]
pub extern "C" fn hemipad_wire_abi_version() -> i32 {
    ABI_VERSION
}

/// Taille d'une trame, en octets.
#[no_mangle]
pub extern "C" fn hemipad_wire_frame_len() -> usize {
    FRAME_LEN
}

/// Taille du secret partagé, en octets.
#[no_mangle]
pub extern "C" fn hemipad_wire_key_len() -> usize {
    KEY_LEN
}

/// Longueur utile attendue pour un identifiant de rapport, ou 0 s'il est
/// inconnu.
#[no_mangle]
pub extern "C" fn hemipad_wire_payload_len(report_id: u8) -> usize {
    match ReportKind::from_id(report_id) {
        Some(kind) => kind.payload_len(),
        None => 0,
    }
}

/// Scelle un rapport dans `out`, qui doit pouvoir recevoir `frame_len` octets.
/// `direction` vaut 0 vers le boîtier, 1 vers l'application.
///
/// # Safety
/// Les trois pointeurs doivent adresser le nombre d'octets annoncé.
#[allow(clippy::too_many_arguments)]
#[no_mangle]
pub unsafe extern "C" fn hemipad_wire_seal(
    key: *const u8,
    key_len: usize,
    direction: u8,
    report_id: u8,
    payload: *const u8,
    payload_len: usize,
    counter: u64,
    out: *mut u8,
    out_len: usize,
) -> i32 {
    let (Some(key), Some(payload), Some(out)) = (
        borrow(key, key_len),
        borrow(payload, payload_len),
        borrow_mut(out, out_len),
    ) else {
        return status::NULL_POINTER;
    };
    let Some(direction) = Direction::from_id(direction) else {
        return status::DIRECTION;
    };
    let Some(kind) = ReportKind::from_id(report_id) else {
        return status::UNKNOWN_REPORT;
    };
    match seal(key, direction, kind, payload, counter, out) {
        Ok(()) => status::OK,
        Err(error) => code(error),
    }
}

/// Ouvre une trame reçue. En cas de succès, écrit l'identifiant de rapport, la
/// charge utile, sa longueur et le compteur dans les emplacements fournis.
/// `direction` est le sens attendu des trames reçues (1 pour l'application).
///
/// Les pointeurs de sortie facultatifs peuvent être nuls.
///
/// # Safety
/// Chaque pointeur non nul doit adresser le nombre d'octets annoncé.
#[allow(clippy::too_many_arguments)]
#[no_mangle]
pub unsafe extern "C" fn hemipad_wire_open(
    key: *const u8,
    key_len: usize,
    direction: u8,
    frame: *const u8,
    frame_len: usize,
    last_counter: u64,
    out_report_id: *mut u8,
    out_payload: *mut u8,
    out_payload_capacity: usize,
    out_payload_len: *mut usize,
    out_counter: *mut u64,
) -> i32 {
    let (Some(key), Some(frame)) = (borrow(key, key_len), borrow(frame, frame_len)) else {
        return status::NULL_POINTER;
    };
    let Some(direction) = Direction::from_id(direction) else {
        return status::DIRECTION;
    };
    let opened = match open(key, direction, frame, last_counter) {
        Ok(opened) => opened,
        Err(error) => return code(error),
    };
    let payload = opened.payload();
    if out_payload_capacity < payload.len() {
        return status::OUTPUT_TOO_SMALL;
    }
    let Some(destination) = borrow_mut(out_payload, out_payload_capacity) else {
        return status::NULL_POINTER;
    };
    destination[..payload.len()].copy_from_slice(payload);
    if !out_report_id.is_null() {
        *out_report_id = opened.kind.id();
    }
    if !out_payload_len.is_null() {
        *out_payload_len = payload.len();
    }
    if !out_counter.is_null() {
        *out_counter = opened.counter;
    }
    status::OK
}

/// Emballe un rapport pour le chemin par lequel il sortira : le port USB, ou
/// le Bluetooth, qui demande un octet d'en-tête de plus.
///
/// Rend le nombre d'octets écrits, ou un code négatif.
///
/// # Safety
/// `payload` et `out` doivent adresser le nombre d'octets annoncé.
#[no_mangle]
pub unsafe extern "C" fn hemipad_wire_wrap_output(
    output: u8,
    report_id: u8,
    payload: *const u8,
    payload_len: usize,
    out: *mut u8,
    out_len: usize,
) -> i32 {
    let (Some(payload), Some(out)) = (borrow(payload, payload_len), borrow_mut(out, out_len))
    else {
        return status::NULL_POINTER;
    };
    let Some(output) = Output::from_code(output) else {
        return status::UNKNOWN_OUTPUT;
    };
    let Some(kind) = ReportKind::from_id(report_id) else {
        return status::UNKNOWN_REPORT;
    };
    let Some(frame) = wrap(output, kind, payload) else {
        return status::PAYLOAD_LENGTH;
    };
    let bytes = frame.as_bytes();
    if out.len() < bytes.len() {
        return status::OUTPUT_TOO_SMALL;
    }
    out[..bytes.len()].copy_from_slice(bytes);
    bytes.len() as i32
}

/// Place à prévoir pour un rapport emballé, quel que soit le chemin.
#[no_mangle]
pub extern "C" fn hemipad_wire_max_output_len() -> usize {
    MAX_OUTPUT_LEN
}

// --- Choix du chemin, pour l'application -----------------------------------
//
// Swift détient la structure et la passe à chaque appel : aucune allocation,
// rien à libérer, et l'état reste visible du côté qui s'en sert.

/// Prépare un choix de chemin neuf.
///
/// # Safety
/// `chooser` doit adresser une structure `HemipadChooser` accessible en
/// écriture.
#[no_mangle]
pub unsafe extern "C" fn hemipad_wire_chooser_init(chooser: *mut Chooser) {
    if chooser.is_null() {
        return;
    }
    *chooser = Chooser::new();
}

/// Règle les deux délais : combien de temps le chemin direct doit tenir avant
/// de reprendre la main, et le silence du boîtier toléré.
///
/// # Safety
/// `chooser` doit adresser une structure accessible en écriture.
#[no_mangle]
pub unsafe extern "C" fn hemipad_wire_chooser_set_timings(
    chooser: *mut Chooser,
    settle_ms: u64,
    bridge_timeout_ms: u64,
) {
    if chooser.is_null() {
        return;
    }
    *chooser = Chooser::with_timings(settle_ms, bridge_timeout_ms);
}

/// Une machine s'est abonnée, ou détachée, en Bluetooth direct.
///
/// # Safety
/// `chooser` doit adresser une structure accessible en écriture.
#[no_mangle]
pub unsafe extern "C" fn hemipad_wire_chooser_set_direct(
    chooser: *mut Chooser,
    connected: bool,
    now_ms: u64,
) {
    let Some(chooser) = chooser.as_mut() else {
        return;
    };
    chooser.set_direct(connected, now_ms);
}

/// Le boîtier vient de répondre.
///
/// # Safety
/// `chooser` doit adresser une structure accessible en écriture.
#[no_mangle]
pub unsafe extern "C" fn hemipad_wire_chooser_bridge_seen(chooser: *mut Chooser, now_ms: u64) {
    let Some(chooser) = chooser.as_mut() else {
        return;
    };
    chooser.bridge_seen(now_ms);
}

/// Le chemin à prendre maintenant : 0 aucun, 1 direct, 2 le boîtier.
///
/// # Safety
/// `chooser` doit adresser une structure accessible en écriture.
#[no_mangle]
pub unsafe extern "C" fn hemipad_wire_chooser_path(chooser: *mut Chooser, now_ms: u64) -> u8 {
    let Some(chooser) = chooser.as_mut() else {
        return Path::None.code();
    };
    chooser.path(now_ms).code()
}

/// Taille de la structure, pour que Swift lui réserve la bonne place.
#[no_mangle]
pub extern "C" fn hemipad_wire_chooser_size() -> usize {
    core::mem::size_of::<Chooser>()
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: [u8; KEY_LEN] = [3; KEY_LEN];
    const GAMEPAD: [u8; 9] = [128, 128, 128, 128, 0, 0, 8, 1, 0];

    /// Le trajet complet, tel que Swift l'appellera : sceller d'un côté,
    /// ouvrir de l'autre, sans rien perdre.
    #[test]
    fn the_c_abi_makes_a_round_trip() {
        let mut frame = [0u8; FRAME_LEN];
        let sealed = unsafe {
            hemipad_wire_seal(
                KEY.as_ptr(),
                KEY.len(),
                0,
                1,
                GAMEPAD.as_ptr(),
                GAMEPAD.len(),
                42,
                frame.as_mut_ptr(),
                frame.len(),
            )
        };
        assert_eq!(sealed, status::OK);

        let mut report_id = 0u8;
        let mut payload = [0u8; MAX_PAYLOAD];
        let mut payload_len = 0usize;
        let mut counter = 0u64;
        let opened = unsafe {
            hemipad_wire_open(
                KEY.as_ptr(),
                KEY.len(),
                0,
                frame.as_ptr(),
                frame.len(),
                41,
                &mut report_id,
                payload.as_mut_ptr(),
                payload.len(),
                &mut payload_len,
                &mut counter,
            )
        };
        assert_eq!(opened, status::OK);
        assert_eq!(report_id, 1);
        assert_eq!(counter, 42);
        assert_eq!(&payload[..payload_len], &GAMEPAD);
    }

    #[test]
    fn the_c_abi_reports_refusals_instead_of_panicking() {
        let mut frame = [0u8; FRAME_LEN];
        // Pointeur nul.
        assert_eq!(
            unsafe {
                hemipad_wire_seal(
                    core::ptr::null(),
                    KEY_LEN,
                    0,
                    1,
                    GAMEPAD.as_ptr(),
                    GAMEPAD.len(),
                    1,
                    frame.as_mut_ptr(),
                    frame.len(),
                )
            },
            status::NULL_POINTER
        );
        // Rapport inconnu.
        assert_eq!(
            unsafe {
                hemipad_wire_seal(
                    KEY.as_ptr(),
                    KEY.len(),
                    0,
                    9,
                    GAMEPAD.as_ptr(),
                    GAMEPAD.len(),
                    1,
                    frame.as_mut_ptr(),
                    frame.len(),
                )
            },
            status::UNKNOWN_REPORT
        );
        // Secret de la mauvaise taille.
        assert_eq!(
            unsafe {
                hemipad_wire_seal(
                    KEY.as_ptr(),
                    8,
                    0,
                    1,
                    GAMEPAD.as_ptr(),
                    GAMEPAD.len(),
                    1,
                    frame.as_mut_ptr(),
                    frame.len(),
                )
            },
            status::KEY_LENGTH
        );
        // Tampon de sortie trop court.
        assert_eq!(
            unsafe {
                hemipad_wire_seal(
                    KEY.as_ptr(),
                    KEY.len(),
                    0,
                    1,
                    GAMEPAD.as_ptr(),
                    GAMEPAD.len(),
                    1,
                    frame.as_mut_ptr(),
                    FRAME_LEN - 1,
                )
            },
            status::OUTPUT_TOO_SMALL
        );
    }

    #[test]
    fn opening_reports_a_forgery() {
        let mut frame = [0u8; FRAME_LEN];
        unsafe {
            hemipad_wire_seal(
                KEY.as_ptr(),
                KEY.len(),
                0,
                1,
                GAMEPAD.as_ptr(),
                GAMEPAD.len(),
                1,
                frame.as_mut_ptr(),
                frame.len(),
            );
        }
        frame[20] ^= 0xFF;
        let mut payload = [0u8; MAX_PAYLOAD];
        let refusal = unsafe {
            hemipad_wire_open(
                KEY.as_ptr(),
                KEY.len(),
                0,
                frame.as_ptr(),
                frame.len(),
                0,
                core::ptr::null_mut(),
                payload.as_mut_ptr(),
                payload.len(),
                core::ptr::null_mut(),
                core::ptr::null_mut(),
            )
        };
        assert_eq!(refusal, status::SIGNATURE);
    }

    #[test]
    fn the_c_abi_wraps_for_both_paths() {
        let payload = [128u8, 128, 128, 128, 0, 0, 8, 0, 0];
        let mut out = [0u8; MAX_OUTPUT_LEN];

        let usb = unsafe {
            hemipad_wire_wrap_output(
                0,
                1,
                payload.as_ptr(),
                payload.len(),
                out.as_mut_ptr(),
                out.len(),
            )
        };
        assert_eq!(usb, 10);
        assert_eq!(out[0], 1);

        let bluetooth = unsafe {
            hemipad_wire_wrap_output(
                1,
                1,
                payload.as_ptr(),
                payload.len(),
                out.as_mut_ptr(),
                out.len(),
            )
        };
        assert_eq!(bluetooth, 11);
        assert_eq!(out[0], HIDP_INPUT_HEADER);
        assert_eq!(out[1], 1);

        // Chemin inconnu, rapport inconnu, longueur fausse, tampon trop court.
        assert_eq!(
            unsafe {
                hemipad_wire_wrap_output(
                    9,
                    1,
                    payload.as_ptr(),
                    payload.len(),
                    out.as_mut_ptr(),
                    out.len(),
                )
            },
            status::UNKNOWN_OUTPUT
        );
        assert_eq!(
            unsafe {
                hemipad_wire_wrap_output(
                    0,
                    9,
                    payload.as_ptr(),
                    payload.len(),
                    out.as_mut_ptr(),
                    out.len(),
                )
            },
            status::UNKNOWN_REPORT
        );
        assert_eq!(
            unsafe {
                hemipad_wire_wrap_output(0, 1, payload.as_ptr(), 3, out.as_mut_ptr(), out.len())
            },
            status::PAYLOAD_LENGTH
        );
        assert_eq!(
            unsafe {
                hemipad_wire_wrap_output(1, 1, payload.as_ptr(), payload.len(), out.as_mut_ptr(), 4)
            },
            status::OUTPUT_TOO_SMALL
        );
    }

    /// Le même enchaînement que fera l'application : le boîtier répond, le
    /// direct arrive, puis s'installe.
    #[test]
    fn the_c_abi_chooses_the_path_on_its_own() {
        let mut chooser = Chooser::new();
        unsafe {
            hemipad_wire_chooser_set_timings(&mut chooser, 1_000, 2_000);
            assert_eq!(hemipad_wire_chooser_path(&mut chooser, 0), 0, "rien encore");

            hemipad_wire_chooser_bridge_seen(&mut chooser, 0);
            assert_eq!(hemipad_wire_chooser_path(&mut chooser, 0), 2, "le boîtier");

            hemipad_wire_chooser_set_direct(&mut chooser, true, 100);
            hemipad_wire_chooser_bridge_seen(&mut chooser, 100);
            assert_eq!(hemipad_wire_chooser_path(&mut chooser, 100), 2, "trop tôt");

            hemipad_wire_chooser_bridge_seen(&mut chooser, 1_100);
            assert_eq!(
                hemipad_wire_chooser_path(&mut chooser, 1_100),
                1,
                "le direct"
            );
        }
    }

    #[test]
    fn the_chooser_abi_survives_a_null_pointer() {
        unsafe {
            hemipad_wire_chooser_init(core::ptr::null_mut());
            hemipad_wire_chooser_set_timings(core::ptr::null_mut(), 1, 2);
            hemipad_wire_chooser_set_direct(core::ptr::null_mut(), true, 0);
            hemipad_wire_chooser_bridge_seen(core::ptr::null_mut(), 0);
            assert_eq!(hemipad_wire_chooser_path(core::ptr::null_mut(), 0), 0);
        }
    }

    #[test]
    fn the_abi_announces_its_shape() {
        assert_eq!(hemipad_wire_abi_version(), 2);
        assert_eq!(hemipad_wire_frame_len(), FRAME_LEN);
        assert_eq!(hemipad_wire_key_len(), KEY_LEN);
        assert_eq!(hemipad_wire_payload_len(1), 9);
        assert_eq!(hemipad_wire_payload_len(2), 8);
        assert_eq!(hemipad_wire_payload_len(3), 0);
        assert_eq!(hemipad_wire_max_output_len(), MAX_OUTPUT_LEN);
        assert_eq!(hemipad_wire_chooser_size(), core::mem::size_of::<Chooser>());
    }

    #[test]
    fn the_c_abi_refuses_an_unknown_direction_and_a_reflected_frame() {
        let mut frame = [0u8; FRAME_LEN];
        assert_eq!(
            unsafe {
                hemipad_wire_seal(
                    KEY.as_ptr(),
                    KEY.len(),
                    7,
                    1,
                    GAMEPAD.as_ptr(),
                    GAMEPAD.len(),
                    1,
                    frame.as_mut_ptr(),
                    frame.len(),
                )
            },
            status::DIRECTION
        );
        let sealed = unsafe {
            hemipad_wire_seal(
                KEY.as_ptr(),
                KEY.len(),
                0,
                1,
                GAMEPAD.as_ptr(),
                GAMEPAD.len(),
                1,
                frame.as_mut_ptr(),
                frame.len(),
            )
        };
        assert_eq!(sealed, status::OK);
        let mut payload = [0u8; MAX_PAYLOAD];
        let reflected = unsafe {
            hemipad_wire_open(
                KEY.as_ptr(),
                KEY.len(),
                1,
                frame.as_ptr(),
                frame.len(),
                0,
                core::ptr::null_mut(),
                payload.as_mut_ptr(),
                payload.len(),
                core::ptr::null_mut(),
                core::ptr::null_mut(),
            )
        };
        assert_eq!(reflected, status::DIRECTION);
    }
}
