//! Réglages du boîtier, et lecture du secret partagé.

use std::fs;
use std::io;
use std::os::unix::fs::MetadataExt;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use hemipad_wire::KEY_LEN;

extern "C" {
    fn geteuid() -> u32;
}

/// Identifiant de l'utilisateur qui lance le pont.
fn libc_geteuid() -> u32 {
    // SAFETY : geteuid est toujours sûr, sans effet de bord.
    unsafe { geteuid() }
}

/// Ce dont le programme a besoin pour démarrer.
pub struct Config {
    /// Où écouter. Par défaut toutes les interfaces, port 45_800.
    pub listen: String,
    /// Le fichier du secret partagé.
    pub key_path: PathBuf,
    /// Le périphérique HID exposé par le mode gadget.
    pub device: PathBuf,
    /// Silence toléré avant de tout relâcher, en millisecondes.
    pub watchdog_ms: u64,
    /// N'affiche que le descripteur HID, en hexadécimal, et s'arrête.
    pub print_descriptor: bool,
    /// Proposer aussi le chemin Bluetooth. Actif par défaut : c'est celui qui
    /// évite le câble.
    pub bluetooth: bool,
    /// N'affiche que l'aide, et s'arrête sans erreur.
    pub print_usage: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            listen: "0.0.0.0:45800".to_string(),
            key_path: PathBuf::from("/etc/hemipad/cle"),
            device: PathBuf::from("/dev/hidg0"),
            watchdog_ms: 500,
            print_descriptor: false,
            bluetooth: true,
            print_usage: false,
        }
    }
}

impl Config {
    /// Lit les arguments de la ligne de commande. Volontairement minimal :
    /// quatre options, pas de dépendance.
    pub fn from_args<I: Iterator<Item = String>>(mut args: I) -> Result<Self, String> {
        let mut config = Config::default();
        while let Some(argument) = args.next() {
            let mut value = || {
                args.next()
                    .ok_or_else(|| format!("l'option {argument} attend une valeur"))
            };
            match argument.as_str() {
                "--ecoute" => config.listen = value()?,
                "--cle" => config.key_path = PathBuf::from(value()?),
                "--peripherique" => config.device = PathBuf::from(value()?),
                "--garde-fou" => {
                    let raw = value()?;
                    config.watchdog_ms = raw.parse().map_err(|_| {
                        format!("--garde-fou attend un nombre de millisecondes, pas « {raw} »")
                    })?;
                }
                "--descripteur" => config.print_descriptor = true,
                "--sans-bluetooth" => config.bluetooth = false,
                // Demander l'aide n'est pas une erreur : on la montre et on
                // s'arrête avec succès.
                "--aide" | "-h" => config.print_usage = true,
                other => return Err(format!("option inconnue : {other}\n\n{USAGE}")),
            }
        }
        Ok(config)
    }
}

pub const USAGE: &str = "\
hemipad-relay — présente HemiPad à la console comme une manette.

Par le Bluetooth si une console y est connectée, sinon par le câble USB.
Aucun réglage à faire : le chemin disponible est pris tout seul.

Options :
  --ecoute <adresse:port>   où écouter        (défaut 0.0.0.0:45800)
  --cle <fichier>           secret partagé    (défaut /etc/hemipad/cle)
  --peripherique <fichier>  sortie par câble  (défaut /dev/hidg0)
  --garde-fou <ms>          silence toléré avant de tout relâcher (défaut 500)
  --sans-bluetooth          n'utilise que le câble USB
  --descripteur             affiche le descripteur HID en hexadécimal, et s'arrête
  --aide                    affiche ceci";

/// Lit le secret partagé. Le fichier doit contenir 64 caractères
/// hexadécimaux, et n'être lisible que par son propriétaire : un secret que
/// tout le monde peut lire ne protège plus rien.
pub fn load_key(path: &Path) -> io::Result<[u8; KEY_LEN]> {
    let metadata = fs::metadata(path)?;
    // Le secret doit appartenir à celui qui lance le pont : un fichier 0600
    // d'un autre utilisateur serait lisible par lui.
    let moi = libc_geteuid();
    if metadata.uid() != moi {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            format!(
                "{} appartient à un autre utilisateur (uid {}) : le pont tourne sous l'uid {}",
                path.display(),
                metadata.uid(),
                moi
            ),
        ));
    }
    let mode = metadata.permissions().mode() & 0o077;
    if mode != 0 {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            format!(
                "{} est lisible par d'autres que son propriétaire ({:o}) : \
                 corrigez avec « chmod 600 {} »",
                path.display(),
                metadata.permissions().mode() & 0o777,
                path.display()
            ),
        ));
    }
    let text = fs::read_to_string(path)?;
    parse_key(text.trim()).ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            format!(
                "{} doit contenir {} octets en hexadécimal ({} caractères)",
                path.display(),
                KEY_LEN,
                KEY_LEN * 2
            ),
        )
    })
}

/// Convertit 64 caractères hexadécimaux en 32 octets.
pub fn parse_key(text: &str) -> Option<[u8; KEY_LEN]> {
    if text.len() != KEY_LEN * 2 {
        return None;
    }
    let bytes = text.as_bytes();
    let mut key = [0u8; KEY_LEN];
    for (index, slot) in key.iter_mut().enumerate() {
        let high = digit(bytes[index * 2])?;
        let low = digit(bytes[index * 2 + 1])?;
        *slot = high << 4 | low;
    }
    Some(key)
}

fn digit(character: u8) -> Option<u8> {
    match character {
        b'0'..=b'9' => Some(character - b'0'),
        b'a'..=b'f' => Some(character - b'a' + 10),
        b'A'..=b'F' => Some(character - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn the_defaults_are_usable_as_they_are() {
        let config = Config::from_args(args(&[]).into_iter()).unwrap();
        assert_eq!(config.listen, "0.0.0.0:45800");
        assert_eq!(config.device, PathBuf::from("/dev/hidg0"));
        assert_eq!(config.watchdog_ms, 500);
        assert!(!config.print_descriptor);
        assert!(config.bluetooth, "le Bluetooth est proposé par défaut");
    }

    #[test]
    fn asking_for_help_is_not_an_error() {
        let config = Config::from_args(args(&["--aide"]).into_iter()).unwrap();
        assert!(config.print_usage);
        let court = Config::from_args(args(&["-h"]).into_iter()).unwrap();
        assert!(court.print_usage);
    }

    #[test]
    fn bluetooth_can_be_left_out() {
        let config = Config::from_args(args(&["--sans-bluetooth"]).into_iter()).unwrap();
        assert!(!config.bluetooth);
    }

    #[test]
    fn the_descriptor_can_be_asked_for_alone() {
        let config = Config::from_args(args(&["--descripteur"]).into_iter()).unwrap();
        assert!(config.print_descriptor);
    }

    #[test]
    fn every_option_is_read() {
        let config = Config::from_args(
            args(&[
                "--ecoute",
                "192.168.1.20:5000",
                "--cle",
                "/tmp/cle",
                "--peripherique",
                "/dev/hidg1",
                "--garde-fou",
                "250",
            ])
            .into_iter(),
        )
        .unwrap();
        assert_eq!(config.listen, "192.168.1.20:5000");
        assert_eq!(config.key_path, PathBuf::from("/tmp/cle"));
        assert_eq!(config.device, PathBuf::from("/dev/hidg1"));
        assert_eq!(config.watchdog_ms, 250);
    }

    #[test]
    fn a_bad_option_is_explained_rather_than_ignored() {
        assert!(Config::from_args(args(&["--nimporte"]).into_iter()).is_err());
        assert!(Config::from_args(args(&["--ecoute"]).into_iter()).is_err());
        assert!(Config::from_args(args(&["--garde-fou", "vite"]).into_iter()).is_err());
    }

    #[test]
    fn a_key_is_read_from_its_hexadecimal_form() {
        let text = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
        let key = parse_key(text).unwrap();
        assert_eq!(key[0], 0x00);
        assert_eq!(key[1], 0x11);
        assert_eq!(key[15], 0xff);
        assert_eq!(key[31], 0xff);
        // Les majuscules passent aussi.
        assert_eq!(parse_key(&text.to_uppercase()).unwrap(), key);
    }

    #[test]
    fn a_malformed_key_is_refused() {
        assert!(parse_key("").is_none());
        assert!(parse_key("00112233").is_none(), "trop court");
        assert!(parse_key(&"a".repeat(65)).is_none(), "trop long");
        assert!(
            parse_key(&format!("{}zz", "a".repeat(62))).is_none(),
            "caractère hors de l'hexadécimal"
        );
    }

    #[test]
    fn a_readable_by_everyone_key_file_is_refused() {
        let directory = std::env::temp_dir().join(format!("hemipad-essai-{}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("cle");
        fs::write(&path, "a".repeat(64)).unwrap();

        fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).unwrap();
        let refusal = load_key(&path).unwrap_err();
        assert_eq!(refusal.kind(), io::ErrorKind::PermissionDenied);

        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
        assert!(load_key(&path).is_ok(), "avec 600, le secret est accepté");

        fs::remove_dir_all(&directory).ok();
    }
}
