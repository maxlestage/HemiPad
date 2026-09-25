//! Par où le boîtier fait sortir les rapports, sans que personne n'ait à
//! choisir.
//!
//! Le boîtier a deux chemins vers la console : le câble USB et le Bluetooth.
//! On ne demande pas lequel prendre — c'est exactement le genre de réglage
//! qu'on n'a pas envie de manipuler d'une main, une manette dans l'autre.
//!
//! La règle est simple : **si une console est appairée et connectée en
//! Bluetooth, tout passe par là ; sinon, par le câble.** Et si le Bluetooth
//! lâche en pleine partie, le câble reprend au rapport suivant, sans rien
//! demander.

use std::io::{self, Write};

use hemipad_wire::{wrap, Output, ReportKind};

/// Une destination où écrire des rapports déjà emballés.
pub trait Sink: Write {
    /// Le chemin, qui décide de l'emballage.
    fn output(&self) -> Output;
}

/// Le port USB du boîtier, en mode gadget.
pub struct UsbSink<W: Write> {
    writer: W,
}

impl<W: Write> UsbSink<W> {
    pub fn new(writer: W) -> Self {
        Self { writer }
    }
}

impl<W: Write> Write for UsbSink<W> {
    fn write(&mut self, data: &[u8]) -> io::Result<usize> {
        self.writer.write(data)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.writer.flush()
    }
}

impl<W: Write> Sink for UsbSink<W> {
    fn output(&self) -> Output {
        Output::Usb
    }
}

/// Ce qui est arrivé à un rapport qu'on a voulu envoyer.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Sent {
    /// Parti par ce chemin.
    By(Output),
    /// Le Bluetooth a lâché ; le rapport est reparti par le câble.
    FellBackToUsb,
    /// Personne n'écoute : ni console en Bluetooth, ni câble utilisable.
    Nowhere,
}

/// Les deux chemins, et la règle qui choisit entre eux.
pub struct Outputs {
    usb: Option<Box<dyn Sink>>,
    bluetooth: Option<Box<dyn Sink>>,
}

impl Outputs {
    pub fn new(usb: Option<Box<dyn Sink>>) -> Self {
        Self {
            usb,
            bluetooth: None,
        }
    }

    /// Une console vient de se connecter en Bluetooth : tout passe par elle.
    pub fn attach_bluetooth(&mut self, sink: Box<dyn Sink>) {
        self.bluetooth = Some(sink);
    }

    /// La console Bluetooth est partie.
    pub fn detach_bluetooth(&mut self) {
        self.bluetooth = None;
    }

    pub fn has_bluetooth(&self) -> bool {
        self.bluetooth.is_some()
    }

    /// Le chemin qui serait pris maintenant.
    pub fn current(&self) -> Option<Output> {
        if self.bluetooth.is_some() {
            Some(Output::Bluetooth)
        } else if self.usb.is_some() {
            Some(Output::Usb)
        } else {
            None
        }
    }

    /// Envoie un rapport par le chemin du moment.
    pub fn send(&mut self, kind: ReportKind, payload: &[u8]) -> io::Result<Sent> {
        if self.bluetooth.is_some() {
            match self.write_to(true, kind, payload) {
                Ok(()) => return Ok(Sent::By(Output::Bluetooth)),
                Err(_) => {
                    // Le Bluetooth a lâché. On ne remonte pas l'erreur : on
                    // repasse au câble, ce qui est exactement ce qu'on
                    // voudrait qu'il se passe en pleine partie.
                    self.detach_bluetooth();
                    if self.usb.is_some() {
                        self.write_to(false, kind, payload)?;
                        return Ok(Sent::FellBackToUsb);
                    }
                    return Ok(Sent::Nowhere);
                }
            }
        }
        if self.usb.is_some() {
            self.write_to(false, kind, payload)?;
            return Ok(Sent::By(Output::Usb));
        }
        Ok(Sent::Nowhere)
    }

    fn write_to(&mut self, bluetooth: bool, kind: ReportKind, payload: &[u8]) -> io::Result<()> {
        let sink = if bluetooth {
            self.bluetooth.as_mut()
        } else {
            self.usb.as_mut()
        };
        let Some(sink) = sink else {
            return Err(io::Error::new(io::ErrorKind::NotConnected, "aucun chemin"));
        };
        let Some(frame) = wrap(sink.output(), kind, payload) else {
            // La longueur ne correspond pas au rapport : on n'écrit rien
            // plutôt que d'envoyer n'importe quoi à la console.
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "longueur de rapport inattendue",
            ));
        };
        sink.write_all(frame.as_bytes())?;
        sink.flush()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::rc::Rc;

    const MANETTE: [u8; 9] = [128, 128, 128, 128, 0, 0, 8, 0, 0];

    /// Une destination d'essai, qui note ce qu'on lui écrit et peut tomber en
    /// panne sur commande.
    #[derive(Clone)]
    struct Faux {
        output: Output,
        written: Rc<RefCell<Vec<Vec<u8>>>>,
        broken: Rc<RefCell<bool>>,
    }

    impl Faux {
        fn new(output: Output) -> Self {
            Self {
                output,
                written: Rc::new(RefCell::new(Vec::new())),
                broken: Rc::new(RefCell::new(false)),
            }
        }
    }

    impl Write for Faux {
        fn write(&mut self, data: &[u8]) -> io::Result<usize> {
            if *self.broken.borrow() {
                return Err(io::Error::new(io::ErrorKind::BrokenPipe, "coupé"));
            }
            self.written.borrow_mut().push(data.to_vec());
            Ok(data.len())
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    impl Sink for Faux {
        fn output(&self) -> Output {
            self.output
        }
    }

    #[test]
    fn without_bluetooth_everything_goes_through_the_cable() {
        let usb = Faux::new(Output::Usb);
        let mut outputs = Outputs::new(Some(Box::new(usb.clone())));
        assert_eq!(outputs.current(), Some(Output::Usb));
        assert_eq!(
            outputs.send(ReportKind::Gamepad, &MANETTE).unwrap(),
            Sent::By(Output::Usb)
        );
        assert_eq!(
            usb.written.borrow()[0],
            [1, 128, 128, 128, 128, 0, 0, 8, 0, 0]
        );
    }

    #[test]
    fn a_connected_console_takes_over_without_being_asked() {
        let usb = Faux::new(Output::Usb);
        let bluetooth = Faux::new(Output::Bluetooth);
        let mut outputs = Outputs::new(Some(Box::new(usb.clone())));
        outputs.attach_bluetooth(Box::new(bluetooth.clone()));

        assert_eq!(outputs.current(), Some(Output::Bluetooth));
        assert_eq!(
            outputs.send(ReportKind::Gamepad, &MANETTE).unwrap(),
            Sent::By(Output::Bluetooth)
        );
        // L'en-tête HIDP est ajouté, et rien n'est parti par le câble.
        assert_eq!(bluetooth.written.borrow()[0][0], 0xA1);
        assert!(usb.written.borrow().is_empty());
    }

    /// Le cas qui compte vraiment : le Bluetooth lâche en pleine partie.
    #[test]
    fn if_bluetooth_drops_the_cable_takes_over_at_once() {
        let usb = Faux::new(Output::Usb);
        let bluetooth = Faux::new(Output::Bluetooth);
        let mut outputs = Outputs::new(Some(Box::new(usb.clone())));
        outputs.attach_bluetooth(Box::new(bluetooth.clone()));

        outputs.send(ReportKind::Gamepad, &MANETTE).unwrap();
        *bluetooth.broken.borrow_mut() = true;

        assert_eq!(
            outputs.send(ReportKind::Gamepad, &MANETTE).unwrap(),
            Sent::FellBackToUsb
        );
        assert!(!outputs.has_bluetooth(), "le chemin mort est oublié");
        assert_eq!(usb.written.borrow().len(), 1, "le rapport n'est pas perdu");

        // Les suivants repartent directement par le câble.
        assert_eq!(
            outputs.send(ReportKind::Gamepad, &MANETTE).unwrap(),
            Sent::By(Output::Usb)
        );
        assert_eq!(usb.written.borrow().len(), 2);
    }

    #[test]
    fn with_nothing_connected_nothing_is_written_and_nothing_fails() {
        let mut outputs = Outputs::new(None);
        assert_eq!(outputs.current(), None);
        assert_eq!(
            outputs.send(ReportKind::Gamepad, &MANETTE).unwrap(),
            Sent::Nowhere
        );
    }

    #[test]
    fn bluetooth_alone_works_without_any_cable() {
        let bluetooth = Faux::new(Output::Bluetooth);
        let mut outputs = Outputs::new(None);
        outputs.attach_bluetooth(Box::new(bluetooth.clone()));
        assert_eq!(
            outputs.send(ReportKind::Gamepad, &MANETTE).unwrap(),
            Sent::By(Output::Bluetooth)
        );
        assert_eq!(bluetooth.written.borrow().len(), 1);
    }

    #[test]
    fn a_dead_bluetooth_without_cable_says_so_instead_of_failing() {
        let bluetooth = Faux::new(Output::Bluetooth);
        let mut outputs = Outputs::new(None);
        outputs.attach_bluetooth(Box::new(bluetooth.clone()));
        *bluetooth.broken.borrow_mut() = true;
        assert_eq!(
            outputs.send(ReportKind::Gamepad, &MANETTE).unwrap(),
            Sent::Nowhere
        );
        assert!(!outputs.has_bluetooth());
    }

    #[test]
    fn a_console_that_comes_back_takes_over_again() {
        let usb = Faux::new(Output::Usb);
        let mut outputs = Outputs::new(Some(Box::new(usb.clone())));
        outputs.send(ReportKind::Gamepad, &MANETTE).unwrap();

        let bluetooth = Faux::new(Output::Bluetooth);
        outputs.attach_bluetooth(Box::new(bluetooth.clone()));
        assert_eq!(
            outputs.send(ReportKind::Gamepad, &MANETTE).unwrap(),
            Sent::By(Output::Bluetooth)
        );

        outputs.detach_bluetooth();
        assert_eq!(
            outputs.send(ReportKind::Gamepad, &MANETTE).unwrap(),
            Sent::By(Output::Usb)
        );
        assert_eq!(usb.written.borrow().len(), 2);
    }

    #[test]
    fn a_report_of_the_wrong_length_is_never_written() {
        let usb = Faux::new(Output::Usb);
        let mut outputs = Outputs::new(Some(Box::new(usb.clone())));
        assert!(outputs.send(ReportKind::Gamepad, &[0; 3]).is_err());
        assert!(usb.written.borrow().is_empty());
    }
}
