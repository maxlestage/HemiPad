//! Ce que le boîtier décide d'envoyer à la console, et quand.
//!
//! Séparé de la lecture du réseau et des chemins de sortie pour être
//! vérifiable sans matériel : on lui donne des trames et le temps qui passe,
//! on regarde ce qu'il veut envoyer. Par où cela sort — le câble ou le
//! Bluetooth — ne le regarde pas : c'est l'affaire de `outputs`.

use hemipad_wire::{open, FrameError, ReportKind, MAX_PAYLOAD};

/// Manette au repos : sticks au centre, rien d'enfoncé, croix en position
/// nulle. Les mêmes octets que `GamepadState.neutral` côté iOS.
pub const NEUTRAL_GAMEPAD: [u8; 9] = [128, 128, 128, 128, 0, 0, 8, 0, 0];
/// Clavier au repos : aucun modificateur, aucune touche.
pub const NEUTRAL_KEYBOARD: [u8; 8] = [0; 8];

/// Un rapport à faire parvenir à la console, tel quel : c'est le chemin de
/// sortie qui décidera comment l'emballer.
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct Report {
    pub kind: ReportKind,
    payload: [u8; MAX_PAYLOAD],
    len: usize,
}

impl Report {
    fn new(kind: ReportKind, payload: &[u8]) -> Self {
        let mut bytes = [0u8; MAX_PAYLOAD];
        bytes[..payload.len()].copy_from_slice(payload);
        Self {
            kind,
            payload: bytes,
            len: payload.len(),
        }
    }

    pub fn payload(&self) -> &[u8] {
        &self.payload[..self.len]
    }
}

impl core::fmt::Debug for Report {
    fn fmt(&self, formatter: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(formatter, "Report({:?}, {:?})", self.kind, self.payload())
    }
}

/// La liaison avec un appareil appairé : son secret, et le dernier compteur vu.
pub struct Session {
    key: [u8; hemipad_wire::KEY_LEN],
    last_counter: u64,
    /// Depuis combien de temps rien n'est arrivé, en millisecondes.
    silence: u64,
    /// Au-delà de ce silence, tout est relâché.
    watchdog: u64,
    released: bool,
}

impl Session {
    pub fn new(key: [u8; hemipad_wire::KEY_LEN], watchdog_ms: u64) -> Self {
        Self {
            key,
            last_counter: 0,
            silence: 0,
            watchdog: watchdog_ms,
            released: true,
        }
    }

    pub fn last_counter(&self) -> u64 {
        self.last_counter
    }

    /// Une trame vient d'arriver. Rend le rapport à écrire, ou la raison du
    /// refus.
    pub fn accept(&mut self, frame: &[u8]) -> Result<Report, FrameError> {
        let opened = open(&self.key, frame, self.last_counter)?;
        self.last_counter = opened.counter;
        self.silence = 0;
        self.released = false;
        Ok(Report::new(opened.kind, opened.payload()))
    }

    /// Le temps passe sans rien recevoir. Si le silence dure, tout est
    /// relâché : une coupure de Wi-Fi avec une gâchette enfoncée laisserait
    /// sinon la console appuyer indéfiniment.
    pub fn tick(&mut self, elapsed_ms: u64) -> Vec<Report> {
        if self.released {
            return Vec::new();
        }
        self.silence = self.silence.saturating_add(elapsed_ms);
        if self.silence < self.watchdog {
            return Vec::new();
        }
        self.released = true;
        vec![
            Report::new(ReportKind::Gamepad, &NEUTRAL_GAMEPAD),
            Report::new(ReportKind::Keyboard, &NEUTRAL_KEYBOARD),
        ]
    }

    /// Tout relâcher sur-le-champ : à l'arrêt du programme.
    pub fn release_everything() -> Vec<Report> {
        vec![
            Report::new(ReportKind::Gamepad, &NEUTRAL_GAMEPAD),
            Report::new(ReportKind::Keyboard, &NEUTRAL_KEYBOARD),
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use hemipad_wire::{seal, FRAME_LEN, KEY_LEN};

    const KEY: [u8; KEY_LEN] = [5; KEY_LEN];

    fn frame(counter: u64, kind: ReportKind, payload: &[u8]) -> [u8; FRAME_LEN] {
        let mut bytes = [0u8; FRAME_LEN];
        seal(&KEY, kind, payload, counter, &mut bytes).unwrap();
        bytes
    }

    #[test]
    fn an_accepted_frame_becomes_a_report() {
        let mut session = Session::new(KEY, 500);
        let payload = [1u8, 2, 3, 4, 5, 6, 8, 9, 10];
        let report = session
            .accept(&frame(1, ReportKind::Gamepad, &payload))
            .unwrap();
        assert_eq!(report.kind, ReportKind::Gamepad);
        assert_eq!(report.payload(), &payload);
    }

    #[test]
    fn the_keyboard_keeps_its_own_kind() {
        let mut session = Session::new(KEY, 500);
        let keys = [0x01u8, 0, 0x04, 0, 0, 0, 0, 0];
        let report = session
            .accept(&frame(1, ReportKind::Keyboard, &keys))
            .unwrap();
        assert_eq!(report.kind, ReportKind::Keyboard);
        assert_eq!(report.payload(), &keys);
    }

    #[test]
    fn a_replayed_frame_changes_nothing() {
        let mut session = Session::new(KEY, 500);
        let first = frame(1, ReportKind::Gamepad, &NEUTRAL_GAMEPAD);
        assert!(session.accept(&first).is_ok());
        assert_eq!(session.accept(&first), Err(FrameError::Replay));
        assert_eq!(session.last_counter(), 1);
    }

    /// Un refus ne doit pas faire avancer le compteur : sinon une trame
    /// forgée, même refusée, ferait rejeter les vraies trames suivantes.
    #[test]
    fn a_refused_frame_does_not_move_the_counter() {
        let mut session = Session::new(KEY, 500);
        session
            .accept(&frame(1, ReportKind::Gamepad, &NEUTRAL_GAMEPAD))
            .unwrap();
        let mut forged = frame(1000, ReportKind::Gamepad, &NEUTRAL_GAMEPAD);
        forged[30] ^= 0xFF;
        assert_eq!(session.accept(&forged), Err(FrameError::Signature));
        assert_eq!(session.last_counter(), 1);
        // La vraie trame suivante passe toujours.
        assert!(session
            .accept(&frame(2, ReportKind::Gamepad, &NEUTRAL_GAMEPAD))
            .is_ok());
    }

    #[test]
    fn a_long_silence_releases_everything() {
        let mut session = Session::new(KEY, 500);
        session
            .accept(&frame(1, ReportKind::Gamepad, &[255; 9]))
            .unwrap();
        assert!(session.tick(200).is_empty(), "silence court : rien à faire");
        assert!(session.tick(299).is_empty());
        let released = session.tick(1);
        assert_eq!(released.len(), 2, "la manette et le clavier sont relâchés");
        assert_eq!(released[0].kind, ReportKind::Gamepad);
        assert_eq!(released[0].payload(), &NEUTRAL_GAMEPAD);
        assert_eq!(released[1].kind, ReportKind::Keyboard);
        assert_eq!(released[1].payload(), &NEUTRAL_KEYBOARD);
    }

    #[test]
    fn nothing_is_released_twice() {
        let mut session = Session::new(KEY, 100);
        session
            .accept(&frame(1, ReportKind::Gamepad, &[255; 9]))
            .unwrap();
        assert_eq!(session.tick(100).len(), 2);
        assert!(session.tick(10_000).is_empty(), "déjà relâché");
        // Une nouvelle trame réarme le garde-fou.
        session
            .accept(&frame(2, ReportKind::Gamepad, &[255; 9]))
            .unwrap();
        assert_eq!(session.tick(100).len(), 2);
    }

    #[test]
    fn a_fresh_session_releases_nothing() {
        let mut session = Session::new(KEY, 100);
        assert!(session.tick(10_000).is_empty());
    }
}
