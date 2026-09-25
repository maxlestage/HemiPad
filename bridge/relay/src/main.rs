//! Le programme du boîtier : il reçoit les commandes HemiPad par le réseau
//! local et les rejoue sur le port USB, où la console voit une manette.
//!
//! Il tourne sur une carte capable du « mode gadget » USB — un Raspberry Pi
//! Zero 2 W, par exemple — branchée d'un côté au port USB de la console, de
//! l'autre au Wi-Fi de la maison.
//!
//! Ce qu'il fait, dans l'ordre :
//!
//! 1. il lit le secret partagé, refusé s'il est lisible par d'autres ;
//! 2. il écoute les trames, et n'accepte que celles qui sont signées ;
//! 3. il écrit le rapport reçu dans `/dev/hidg0` ;
//! 4. si le réseau se tait, il relâche tout — une gâchette restée enfoncée
//!    parce que le Wi-Fi a coupé serait pire qu'une déconnexion franche.

mod config;
mod session;

use std::fs::OpenOptions;
use std::io::{self, Write};
use std::net::UdpSocket;
use std::process::ExitCode;
use std::time::{Duration, Instant};

use config::{load_key, Config};
use hemipad_wire::{FrameError, FRAME_LEN};
use session::{Report, Session};

/// Attente maximale sur le réseau avant de reprendre la main pour vérifier le
/// garde-fou.
const POLL: Duration = Duration::from_millis(50);

fn main() -> ExitCode {
    let config = match Config::from_args(std::env::args().skip(1)) {
        Ok(config) => config,
        Err(message) => {
            eprintln!("{message}");
            return ExitCode::from(2);
        }
    };
    if config.print_descriptor {
        // L'installation écrit ces octets dans configfs : les sortir d'ici
        // évite d'en garder une seconde copie dans un script.
        let mut hex = String::with_capacity(hemipad_wire::HID_REPORT_DESCRIPTOR.len() * 2);
        for byte in hemipad_wire::HID_REPORT_DESCRIPTOR {
            hex.push_str(&format!("{byte:02x}"));
        }
        println!("{hex}");
        return ExitCode::SUCCESS;
    }
    match run(&config) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("hemipad-relay : {error}");
            ExitCode::FAILURE
        }
    }
}

fn run(config: &Config) -> io::Result<()> {
    if hemipad_wire::ABI_VERSION != 1 {
        return Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "bibliothèque de trames d'une autre version",
        ));
    }

    let key = load_key(&config.key_path)?;
    let mut device = OpenOptions::new().write(true).open(&config.device)?;
    let socket = UdpSocket::bind(&config.listen)?;
    socket.set_read_timeout(Some(POLL))?;

    println!(
        "hemipad-relay écoute sur {} et écrit dans {}",
        config.listen,
        config.device.display()
    );

    let mut session = Session::new(key, config.watchdog_ms);
    // Au démarrage, la console ne doit rien croire d'enfoncé.
    write_all(&mut device, &Session::release_everything())?;

    let mut buffer = [0u8; FRAME_LEN * 2];
    let mut last_tick = Instant::now();
    let mut refusals: u64 = 0;

    loop {
        match socket.recv_from(&mut buffer) {
            Ok((length, from)) => match session.accept(&buffer[..length]) {
                Ok(report) => write_all(&mut device, std::slice::from_ref(&report))?,
                Err(reason) => {
                    refusals += 1;
                    // Une trame refusée n'est jamais écrite. On le signale
                    // sans inonder le journal : un attaquant qui insiste ne
                    // doit pas pouvoir remplir le disque.
                    if refusals.is_power_of_two() {
                        eprintln!(
                            "trame refusée de {from} ({}) — {refusals} au total, \
                             dernier compteur accepté {}",
                            explain(reason),
                            session.last_counter()
                        );
                    }
                }
            },
            Err(error) if timed_out(&error) => {}
            Err(error) => return Err(error),
        }

        let now = Instant::now();
        let elapsed = now.duration_since(last_tick);
        if elapsed >= POLL {
            last_tick = now;
            let released = session.tick(elapsed.as_millis() as u64);
            if !released.is_empty() {
                eprintln!("silence du réseau : tout est relâché");
                write_all(&mut device, &released)?;
            }
        }
    }
}

fn write_all(device: &mut impl Write, reports: &[Report]) -> io::Result<()> {
    for report in reports {
        device.write_all(report.as_bytes())?;
    }
    device.flush()
}

fn timed_out(error: &io::Error) -> bool {
    matches!(
        error.kind(),
        io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut
    )
}

fn explain(reason: FrameError) -> &'static str {
    match reason {
        FrameError::Length => "mauvaise taille",
        FrameError::Magic => "format inconnu",
        FrameError::UnknownReport => "rapport inconnu",
        FrameError::PayloadLength => "longueur annoncée fausse",
        FrameError::KeyLength => "secret de mauvaise taille",
        FrameError::Signature => "signature fausse",
        FrameError::Replay => "trame rejouée",
        FrameError::OutputTooSmall => "tampon trop petit",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use hemipad_wire::{seal, ReportKind, KEY_LEN};

    /// Un faux port USB, pour regarder ce qui y serait écrit.
    #[derive(Default)]
    struct Recorder {
        written: Vec<Vec<u8>>,
    }

    impl Write for Recorder {
        fn write(&mut self, data: &[u8]) -> io::Result<usize> {
            self.written.push(data.to_vec());
            Ok(data.len())
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    #[test]
    fn only_accepted_frames_reach_the_usb_port() {
        let key = [4u8; KEY_LEN];
        let mut session = Session::new(key, 500);
        let mut device = Recorder::default();

        let mut good = [0u8; FRAME_LEN];
        seal(
            &key,
            ReportKind::Gamepad,
            &[1, 2, 3, 4, 5, 6, 8, 0, 0],
            1,
            &mut good,
        )
        .unwrap();
        let report = session.accept(&good).unwrap();
        write_all(&mut device, std::slice::from_ref(&report)).unwrap();

        // Une trame forgée : rien de plus n'est écrit.
        let mut forged = good;
        forged[40] ^= 0xFF;
        assert!(session.accept(&forged).is_err());

        assert_eq!(device.written.len(), 1);
        assert_eq!(device.written[0], vec![1, 1, 2, 3, 4, 5, 6, 8, 0, 0]);
    }

    #[test]
    fn a_timeout_is_not_a_failure() {
        assert!(timed_out(&io::Error::new(io::ErrorKind::WouldBlock, "")));
        assert!(timed_out(&io::Error::new(io::ErrorKind::TimedOut, "")));
        assert!(!timed_out(&io::Error::new(io::ErrorKind::BrokenPipe, "")));
    }

    #[test]
    fn every_refusal_can_be_explained() {
        for reason in [
            FrameError::Length,
            FrameError::Magic,
            FrameError::UnknownReport,
            FrameError::PayloadLength,
            FrameError::KeyLength,
            FrameError::Signature,
            FrameError::Replay,
            FrameError::OutputTooSmall,
        ] {
            assert!(!explain(reason).is_empty());
        }
    }
}
