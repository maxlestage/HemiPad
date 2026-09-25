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
//! 3. il envoie le rapport à la console, par le Bluetooth si une console y est
//!    connectée, sinon par le câble USB — sans que personne n'ait à choisir ;
//! 4. si le réseau se tait, il relâche tout — une gâchette restée enfoncée
//!    parce que le Wi-Fi a coupé serait pire qu'une déconnexion franche.

mod bluetooth;
mod config;
mod outputs;
mod session;

use std::fs::OpenOptions;
use std::io;
use std::net::UdpSocket;
use std::process::ExitCode;
use std::sync::mpsc::{self, Receiver, TryRecvError};
use std::thread;
use std::time::{Duration, Instant};

use config::{load_key, Config};
use hemipad_wire::{FrameError, FRAME_LEN};
use outputs::{Outputs, Sent, Sink, UsbSink};
use session::{Accepted, Report, Session};

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
    if config.print_usage {
        println!("{}", config::USAGE);
        return ExitCode::SUCCESS;
    }
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
    let socket = UdpSocket::bind(&config.listen)?;
    socket.set_read_timeout(Some(POLL))?;

    // Les deux chemins sont tentés, aucun n'est exigé : le boîtier marche
    // avec le câble seul, avec le Bluetooth seul, ou avec les deux.
    let usb: Option<Box<dyn Sink>> = match OpenOptions::new().write(true).open(&config.device) {
        Ok(file) => {
            println!("câble : {} prêt", config.device.display());
            Some(Box::new(UsbSink::new(file)))
        }
        Err(error) => {
            eprintln!("câble indisponible ({}) : {error}", config.device.display());
            None
        }
    };
    let consoles = if config.bluetooth {
        listen_for_consoles()
    } else {
        None
    };
    if usb.is_none() && consoles.is_none() {
        return Err(io::Error::new(
            io::ErrorKind::NotConnected,
            "aucun chemin vers la console : ni câble ni Bluetooth",
        ));
    }

    let mut outputs = Outputs::new(usb);
    println!(
        "hemipad-relay écoute sur {} — chemin actuel : {}",
        config.listen,
        describe(outputs.current())
    );

    let mut session = Session::new(key, config.watchdog_ms);
    // Au démarrage, la console ne doit rien croire d'enfoncé.
    send_all(&mut outputs, &Session::release_everything());

    let mut buffer = [0u8; FRAME_LEN * 2];
    let mut last_tick = Instant::now();
    let mut refusals: u64 = 0;

    loop {
        // Une console qui vient de se connecter prend la main tout de suite.
        if let Some(consoles) = consoles.as_ref() {
            match consoles.try_recv() {
                Ok(channel) => {
                    println!("console connectée en Bluetooth : {}", channel.peer());
                    outputs.attach_bluetooth(Box::new(channel));
                    println!("chemin actuel : {}", describe(outputs.current()));
                }
                Err(TryRecvError::Empty) => {}
                Err(TryRecvError::Disconnected) => {}
            }
        }

        match socket.recv_from(&mut buffer) {
            Ok((length, from)) => match session.accept(&buffer[..length]) {
                Ok(Accepted::Report(report)) => {
                    if let Sent::FellBackToUsb = send_one(&mut outputs, &report) {
                        eprintln!("Bluetooth coupé : le câble prend la suite");
                        debug_assert!(!outputs.has_bluetooth());
                    }
                }
                Ok(Accepted::Heartbeat(reply)) => {
                    // « Je suis là. » C'est sur cette réponse que
                    // l'application décide de passer par le boîtier.
                    if let Err(error) = socket.send_to(&reply, from) {
                        eprintln!("réponse au battement impossible : {error}");
                    }
                }
                Err(reason) => {
                    refusals += 1;
                    // Une trame refusée n'est jamais envoyée. On le signale
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
                send_all(&mut outputs, &released);
            }
        }
    }
}

/// Ouvre l'écoute Bluetooth. Les consoles qui se connectent arrivent par le
/// canal rendu. Rend `None` si le Bluetooth n'est pas disponible : le boîtier
/// continue alors avec le câble seul.
fn listen_for_consoles() -> Option<Receiver<bluetooth::Channel>> {
    let control = match bluetooth::Listener::bind(bluetooth::PSM_CONTROL) {
        Ok(listener) => listener,
        Err(error) => {
            eprintln!("Bluetooth indisponible (canal de contrôle) : {error}");
            return None;
        }
    };
    let interrupt = match bluetooth::Listener::bind(bluetooth::PSM_INTERRUPT) {
        Ok(listener) => listener,
        Err(error) => {
            eprintln!("Bluetooth indisponible (canal d'interruption) : {error}");
            return None;
        }
    };

    // Relevés avant que les écoutes ne partent dans leurs fils d'exécution.
    let control_psm = control.psm();
    let interrupt_psm = interrupt.psm();

    // Le canal de contrôle doit rester OUVERT toute la connexion : le profil
    // HID classique s'en sert en continu, et le fermer aussitôt ferait rompre
    // la session côté console. On garde donc le dernier canal accepté vivant.
    // Une erreur d'accept est transitoire (une console qui raccroche) : on la
    // journalise et on continue d'écouter, sans jamais tuer la boucle.
    thread::spawn(move || {
        let mut ouvert: Option<bluetooth::Channel> = None;
        let mut echecs: u64 = 0;
        loop {
            match control.accept() {
                Ok(channel) => {
                    echecs = 0;
                    // Garde le canal vivant ; le précédent, remplacé, se ferme.
                    if ouvert.replace(channel).is_some() {
                        eprintln!("canal de contrôle : nouvelle connexion");
                    }
                }
                Err(error) => backoff_apres_echec(&mut echecs, "canal de contrôle", &error),
            }
        }
    });

    let (sender, receiver) = mpsc::channel();
    thread::spawn(move || {
        let mut echecs: u64 = 0;
        loop {
            match interrupt.accept() {
                Ok(channel) => {
                    echecs = 0;
                    if sender.send(channel).is_err() {
                        return;
                    }
                }
                Err(error) => backoff_apres_echec(&mut echecs, "canal d'interruption", &error),
            }
        }
    });

    println!(
        "Bluetooth : en attente d'une console (canaux {} et {})",
        control_psm, interrupt_psm
    );
    Some(receiver)
}

/// Envoie un rapport, et rend ce qui lui est arrivé. Une écriture qui échoue
/// ne fait pas tomber le boîtier : la console reviendra peut-être.
fn send_one(outputs: &mut Outputs, report: &Report) -> Sent {
    match outputs.send(report.kind, report.payload()) {
        Ok(sent) => sent,
        Err(error) => {
            eprintln!("rapport non envoyé : {error}");
            Sent::Nowhere
        }
    }
}

fn send_all(outputs: &mut Outputs, reports: &[Report]) {
    for report in reports {
        send_one(outputs, report);
    }
}

/// Par où ça passe, en une ligne lisible dans le journal.
fn describe(output: Option<hemipad_wire::Output>) -> &'static str {
    match output {
        Some(hemipad_wire::Output::Bluetooth) => "Bluetooth",
        Some(hemipad_wire::Output::Usb) => "câble USB",
        None => "aucun",
    }
}

/// Après un échec d'accept Bluetooth : on attend un court instant et on ne
/// journalise que de loin en loin. Sans cela, une panne persistante (plus de
/// descripteurs, adaptateur réinitialisé) ferait tourner la boucle à plein
/// régime et remplirait le journal — une ligne par tour.
fn backoff_apres_echec(echecs: &mut u64, canal: &str, error: &io::Error) {
    *echecs += 1;
    if echecs.is_power_of_two() {
        eprintln!("{canal} : {error} — {echecs} échec(s), on continue d'écouter");
    }
    thread::sleep(Duration::from_millis(200));
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
    use hemipad_wire::{seal, Output, ReportKind, KEY_LEN};

    /// Un faux port USB, pour regarder ce qui y serait écrit.
    #[derive(Default)]
    struct Recorder {
        written: Vec<Vec<u8>>,
    }

    impl io::Write for Recorder {
        fn write(&mut self, data: &[u8]) -> io::Result<usize> {
            self.written.push(data.to_vec());
            Ok(data.len())
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    #[test]
    fn only_accepted_frames_reach_the_console() {
        let key = [4u8; KEY_LEN];
        let mut session = Session::new(key, 500);
        let recorder = Recorder::default();
        let mut outputs = Outputs::new(Some(Box::new(UsbSink::new(recorder))));

        let mut good = [0u8; FRAME_LEN];
        seal(
            &key,
            ReportKind::Gamepad,
            &[1, 2, 3, 4, 5, 6, 8, 0, 0],
            1,
            &mut good,
        )
        .unwrap();
        let Accepted::Report(report) = session.accept(&good).unwrap() else {
            panic!("un rapport était attendu")
        };
        assert_eq!(send_one(&mut outputs, &report), Sent::By(Output::Usb));

        // Une trame forgée : refusée avant d'atteindre le moindre chemin.
        let mut forged = good;
        forged[40] ^= 0xFF;
        assert!(session.accept(&forged).is_err());
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
