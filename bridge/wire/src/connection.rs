//! Par où l'application parle à la console — sans jamais le demander.
//!
//! HemiPad a deux façons d'atteindre une machine :
//!
//! - **en direct**, l'iPhone s'annonçant lui-même comme manette Bluetooth :
//!   c'est le plus court, donc le plus vif, et cela marche avec les
//!   ordinateurs, Android et le Steam Deck ;
//! - **par le boîtier**, joint en Wi-Fi, qui se présente ensuite à la console
//!   en Bluetooth ou par le câble : c'est ce qui atteint les consoles qui
//!   refusent tout le reste.
//!
//! Choisir entre les deux n'est pas un réglage : c'est une chose que le
//! logiciel doit faire seul. Personne n'a envie d'ouvrir un menu, une manette
//! dans la main valide, parce que le lien vient de tomber.
//!
//! Les règles, dans l'ordre :
//!
//! 1. rien de connecté, rien à faire ;
//! 2. un seul chemin disponible : c'est celui-là ;
//! 3. les deux : le direct, parce qu'il est plus vif — mais seulement une fois
//!    qu'il tient depuis un moment ;
//! 4. le chemin en cours meurt : on bascule tout de suite sur l'autre.
//!
//! Le point 3 est ce qui évite le pire défaut possible : un lien qui va et
//! vient ferait alterner les deux chemins plusieurs fois par seconde, et la
//! manette deviendrait inutilisable. Un chemin qui vient d'apparaître doit
//! donc tenir un moment avant qu'on lui confie la partie ; un chemin qui
//! tombe, lui, est abandonné sur-le-champ.

/// Par où partent les commandes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Path {
    /// Aucun chemin : rien à envoyer.
    None,
    /// L'iPhone s'annonce lui-même comme manette Bluetooth.
    Direct,
    /// Le boîtier, joint en Wi-Fi.
    Bridge,
}

impl Path {
    pub const fn code(self) -> u8 {
        match self {
            Path::None => 0,
            Path::Direct => 1,
            Path::Bridge => 2,
        }
    }
}

/// Combien de temps le chemin direct doit tenir avant qu'on lui reprenne la
/// partie. Assez pour qu'un lien instable ne fasse pas d'aller-retour, assez
/// court pour qu'on ne joue pas longtemps par le chemin le plus lent.
pub const DEFAULT_SETTLE_MS: u64 = 1_500;

/// Sans nouvelle du boîtier pendant ce temps, on le considère parti.
pub const DEFAULT_BRIDGE_TIMEOUT_MS: u64 = 2_000;

// Le direct doit pouvoir s'installer avant qu'on abandonne le boîtier : sinon
// le chemin tomberait à « aucun » au lieu de passer de l'un à l'autre.
// Vérifié à la compilation, pas à l'exécution.
const _: () = assert!(DEFAULT_SETTLE_MS < DEFAULT_BRIDGE_TIMEOUT_MS);

/// L'état du choix. Volontairement une structure plate, sans allocation :
/// Swift la détient et la passe par l'ABI C.
#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct Chooser {
    /// Depuis quand le chemin direct est connecté, 0 s'il ne l'est pas.
    direct_since_ms: u64,
    /// Le direct est-il connecté en ce moment ?
    direct_connected: bool,
    /// Dernière fois que le boîtier a donné signe de vie.
    bridge_seen_ms: u64,
    /// Le boîtier s'est-il déjà manifesté ?
    bridge_ever: bool,
    /// Le chemin en cours.
    current: u8,
    /// Combien de temps le direct doit tenir avant de reprendre la main.
    settle_ms: u64,
    /// Silence du boîtier toléré.
    bridge_timeout_ms: u64,
}

impl Default for Chooser {
    fn default() -> Self {
        Self::new()
    }
}

impl Chooser {
    pub const fn new() -> Self {
        Self {
            direct_since_ms: 0,
            direct_connected: false,
            bridge_seen_ms: 0,
            bridge_ever: false,
            current: 0,
            settle_ms: DEFAULT_SETTLE_MS,
            bridge_timeout_ms: DEFAULT_BRIDGE_TIMEOUT_MS,
        }
    }

    /// Règle les deux délais. Surtout utile aux essais.
    pub fn with_timings(settle_ms: u64, bridge_timeout_ms: u64) -> Self {
        Self {
            settle_ms,
            bridge_timeout_ms,
            ..Self::new()
        }
    }

    /// Une machine s'est abonnée, ou s'est détachée, en Bluetooth direct.
    pub fn set_direct(&mut self, connected: bool, now_ms: u64) {
        if connected && !self.direct_connected {
            self.direct_since_ms = now_ms;
        }
        self.direct_connected = connected;
        if !connected {
            self.direct_since_ms = 0;
        }
    }

    /// Le boîtier vient de répondre.
    pub fn bridge_seen(&mut self, now_ms: u64) {
        self.bridge_seen_ms = now_ms;
        self.bridge_ever = true;
    }

    /// Le boîtier est-il tenu pour vivant ?
    pub fn bridge_alive(&self, now_ms: u64) -> bool {
        self.bridge_ever && now_ms.saturating_sub(self.bridge_seen_ms) < self.bridge_timeout_ms
    }

    /// Le chemin direct tient-il depuis assez longtemps ?
    fn direct_settled(&self, now_ms: u64) -> bool {
        self.direct_connected && now_ms.saturating_sub(self.direct_since_ms) >= self.settle_ms
    }

    /// Le chemin à prendre maintenant. À appeler à chaque fois qu'on veut
    /// envoyer, ou au fil du temps : la décision ne dépend que de l'état et de
    /// l'heure, jamais de l'ordre des appels.
    pub fn path(&mut self, now_ms: u64) -> Path {
        let bridge = self.bridge_alive(now_ms);
        let chosen = match (self.direct_connected, bridge) {
            (false, false) => Path::None,
            (true, false) => Path::Direct,
            (false, true) => Path::Bridge,
            (true, true) => {
                // Les deux répondent. Le direct est plus vif, mais on ne lui
                // rend la partie qu'une fois qu'il a prouvé qu'il tient.
                if self.current == Path::Direct.code() || self.direct_settled(now_ms) {
                    Path::Direct
                } else {
                    Path::Bridge
                }
            }
        };
        self.current = chosen.code();
        chosen
    }

    /// Le chemin retenu au dernier appel, sans rien recalculer.
    pub fn last_path(&self) -> Path {
        match self.current {
            1 => Path::Direct,
            2 => Path::Bridge,
            _ => Path::None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SETTLE: u64 = 1_000;
    const TIMEOUT: u64 = 2_000;

    fn chooser() -> Chooser {
        Chooser::with_timings(SETTLE, TIMEOUT)
    }

    #[test]
    fn with_nothing_connected_there_is_no_path() {
        let mut c = chooser();
        assert_eq!(c.path(0), Path::None);
        assert_eq!(c.path(10_000), Path::None);
    }

    #[test]
    fn a_single_path_is_taken_without_waiting() {
        let mut direct = chooser();
        direct.set_direct(true, 0);
        assert_eq!(direct.path(0), Path::Direct, "seul chemin : tout de suite");

        let mut bridge = chooser();
        bridge.bridge_seen(0);
        assert_eq!(bridge.path(0), Path::Bridge);
    }

    /// Le cas qui compte : le boîtier tient la partie, le direct réapparaît.
    /// On ne lui rend la main qu'une fois qu'il a tenu.
    #[test]
    fn a_freshly_returned_direct_waits_its_turn() {
        let mut c = chooser();
        c.bridge_seen(0);
        assert_eq!(c.path(0), Path::Bridge);

        c.set_direct(true, 1_000);
        c.bridge_seen(1_000);
        assert_eq!(c.path(1_000), Path::Bridge, "à peine arrivé : on attend");
        c.bridge_seen(1_500);
        assert_eq!(c.path(1_500), Path::Bridge, "toujours pas assez tenu");

        c.bridge_seen(2_000);
        assert_eq!(
            c.path(2_000),
            Path::Direct,
            "une seconde tenue : il reprend"
        );
    }

    /// Le défaut à ne jamais avoir : un lien qui va et vient ferait alterner
    /// les chemins plusieurs fois par seconde.
    #[test]
    fn a_flapping_direct_never_makes_the_path_dance() {
        let mut c = chooser();
        c.bridge_seen(0);
        let mut taken = [0usize; 3];
        let mut instant = 0;
        // Le direct apparaît et disparaît toutes les 200 ms, dix fois.
        for round in 0..10 {
            c.set_direct(true, instant);
            c.bridge_seen(instant);
            taken[c.path(instant).code() as usize] += 1;
            instant += 200;

            c.set_direct(false, instant);
            c.bridge_seen(instant);
            taken[c.path(instant).code() as usize] += 1;
            instant += 200;
            let _ = round;
        }
        assert_eq!(taken[Path::Direct.code() as usize], 0, "jamais de bascule");
        assert_eq!(taken[Path::Bridge.code() as usize], 20);
    }

    #[test]
    fn a_dead_path_is_left_at_once() {
        let mut c = chooser();
        c.set_direct(true, 0);
        c.bridge_seen(0);
        assert_eq!(c.path(2_000), Path::Direct, "installé sur le direct");

        // Le direct tombe : le boîtier reprend sans délai.
        c.set_direct(false, 2_100);
        c.bridge_seen(2_100);
        assert_eq!(c.path(2_100), Path::Bridge);
    }

    #[test]
    fn a_silent_bridge_is_given_up() {
        let mut c = chooser();
        c.bridge_seen(0);
        assert_eq!(c.path(1_999), Path::Bridge, "encore dans le délai");
        assert_eq!(c.path(2_000), Path::None, "silence trop long");

        // Le direct prend le relais s'il est là.
        c.set_direct(true, 2_000);
        assert_eq!(c.path(2_000), Path::Direct);
    }

    /// Une fois installé sur le direct, on y reste tant qu'il tient : pas de
    /// retour en arrière parce que le boîtier a répondu.
    #[test]
    fn staying_on_direct_does_not_need_to_settle_again() {
        let mut c = chooser();
        c.set_direct(true, 0);
        assert_eq!(c.path(0), Path::Direct);
        c.bridge_seen(100);
        assert_eq!(
            c.path(100),
            Path::Direct,
            "le boîtier ne reprend pas la main"
        );
        assert_eq!(c.path(200), Path::Direct);
    }

    #[test]
    fn a_bridge_never_seen_is_never_chosen() {
        let mut c = chooser();
        assert!(!c.bridge_alive(0));
        assert_eq!(c.path(0), Path::None);
    }

    #[test]
    fn the_last_path_is_remembered_without_recomputing() {
        let mut c = chooser();
        assert_eq!(c.last_path(), Path::None);
        c.set_direct(true, 0);
        c.path(0);
        assert_eq!(c.last_path(), Path::Direct);
    }

    /// Le temps qui recule (l'horloge remise à zéro) ne doit pas provoquer de
    /// soustraction qui déborde.
    #[test]
    fn a_clock_going_backwards_changes_nothing() {
        let mut c = chooser();
        c.bridge_seen(10_000);
        c.set_direct(true, 10_000);
        assert_eq!(
            c.path(0),
            Path::Bridge,
            "pas de débordement, pas de panique"
        );
    }

    #[test]
    fn the_default_timings_are_the_ones_announced() {
        let c = Chooser::new();
        assert_eq!(c.settle_ms, DEFAULT_SETTLE_MS);
        assert_eq!(c.bridge_timeout_ms, DEFAULT_BRIDGE_TIMEOUT_MS);
    }
}
