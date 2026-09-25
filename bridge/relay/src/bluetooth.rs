//! La sortie Bluetooth du boîtier.
//!
//! C'est ici que le boîtier fait ce qu'un iPhone ne peut pas : se présenter
//! comme une vraie manette Bluetooth. Le profil HID classique passe par deux
//! canaux L2CAP — le contrôle (PSM 17) et l'interruption (PSM 19) — et c'est
//! ce profil-là que les consoles acceptent. iOS ne l'expose à aucune
//! application ; Linux, si.
//!
//! Ce module ne contient que l'ouverture des sockets et l'écriture. Tout ce
//! qui se décide — quel chemin prendre, quoi envoyer, quand tout relâcher —
//! vit dans `outputs` et `session`, qui eux se vérifient sans matériel.
//!
//! L'enregistrement du profil auprès de BlueZ (l'annonce SDP, sans laquelle la
//! console ne sait pas que le boîtier est une manette) est fait à
//! l'installation par `scripts/enregistrer-profil-bluetooth.py`.

use std::io::{self, Write};
use std::os::unix::io::{AsRawFd, FromRawFd, OwnedFd, RawFd};

use hemipad_wire::Output;

use crate::outputs::Sink;

/// Canal de contrôle du profil HID.
pub const PSM_CONTROL: u16 = 17;
/// Canal d'interruption : c'est par lui que partent les rapports.
pub const PSM_INTERRUPT: u16 = 19;

const AF_BLUETOOTH: i32 = 31;
const SOCK_SEQPACKET: i32 = 5;
const BTPROTO_L2CAP: i32 = 0;

// `struct sockaddr_l2` du noyau : famille, PSM, adresse, identifiant de canal,
// type d'adresse. Les champs multi-octets sont en petit-boutiste.
#[repr(C, packed)]
#[derive(Clone, Copy)]
struct SockaddrL2 {
    family: u16,
    psm: u16,
    bdaddr: [u8; 6],
    cid: u16,
    bdaddr_type: u8,
}

extern "C" {
    fn socket(domain: i32, kind: i32, protocol: i32) -> i32;
    fn bind(fd: i32, address: *const SockaddrL2, length: u32) -> i32;
    fn listen(fd: i32, backlog: i32) -> i32;
    fn accept(fd: i32, address: *mut SockaddrL2, length: *mut u32) -> i32;
    fn send(fd: i32, buffer: *const u8, length: usize, flags: i32) -> isize;
}

/// Une socket L2CAP qui attend qu'une console se connecte.
pub struct Listener {
    fd: OwnedFd,
    psm: u16,
}

impl Listener {
    /// Ouvre l'écoute sur un canal, pour n'importe quelle console.
    pub fn bind(psm: u16) -> io::Result<Self> {
        // SAFETY : appels système ordinaires ; chaque retour est vérifié, et
        // le descripteur est confié à OwnedFd qui le refermera.
        let raw = unsafe { socket(AF_BLUETOOTH, SOCK_SEQPACKET, BTPROTO_L2CAP) };
        if raw < 0 {
            return Err(io::Error::last_os_error());
        }
        let fd = unsafe { OwnedFd::from_raw_fd(raw) };

        let address = SockaddrL2 {
            family: AF_BLUETOOTH as u16,
            psm: psm.to_le(),
            bdaddr: [0; 6], // BDADDR_ANY : n'importe quelle console.
            cid: 0,
            bdaddr_type: 0, // BDADDR_BREDR : le Bluetooth classique, celui des manettes.
        };
        let bound = unsafe {
            bind(
                fd.as_raw_fd(),
                &address,
                core::mem::size_of::<SockaddrL2>() as u32,
            )
        };
        if bound < 0 {
            return Err(io::Error::last_os_error());
        }
        if unsafe { listen(fd.as_raw_fd(), 1) } < 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(Self { fd, psm })
    }

    pub fn psm(&self) -> u16 {
        self.psm
    }

    /// Attend qu'une console se connecte. Bloquant.
    pub fn accept(&self) -> io::Result<Channel> {
        let mut address = SockaddrL2 {
            family: 0,
            psm: 0,
            bdaddr: [0; 6],
            cid: 0,
            bdaddr_type: 0,
        };
        let mut length = core::mem::size_of::<SockaddrL2>() as u32;
        let raw = unsafe { accept(self.fd.as_raw_fd(), &mut address, &mut length) };
        if raw < 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(Channel {
            fd: unsafe { OwnedFd::from_raw_fd(raw) },
            peer: address.bdaddr,
        })
    }
}

impl AsRawFd for Listener {
    fn as_raw_fd(&self) -> RawFd {
        self.fd.as_raw_fd()
    }
}

/// Un canal ouvert vers une console connectée.
pub struct Channel {
    fd: OwnedFd,
    peer: [u8; 6],
}

impl Channel {
    /// L'adresse Bluetooth de la console, telle qu'on l'affiche.
    pub fn peer(&self) -> String {
        let a = self.peer;
        format!(
            "{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}",
            a[5], a[4], a[3], a[2], a[1], a[0]
        )
    }
}

impl Write for Channel {
    fn write(&mut self, data: &[u8]) -> io::Result<usize> {
        // Un rapport HID part d'un seul tenant : L2CAP en mode SEQPACKET
        // garde les limites du message, ce qu'un flux perdrait.
        let sent = unsafe { send(self.fd.as_raw_fd(), data.as_ptr(), data.len(), 0) };
        if sent < 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(sent as usize)
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

impl Sink for Channel {
    fn output(&self) -> Output {
        Output::Bluetooth
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// La disposition de `sockaddr_l2` doit correspondre exactement à celle du
    /// noyau : un octet de décalage, et le noyau lirait un autre canal.
    #[test]
    fn the_address_has_the_shape_the_kernel_expects() {
        assert_eq!(core::mem::size_of::<SockaddrL2>(), 13);
        assert_eq!(
            core::mem::align_of::<SockaddrL2>(),
            1,
            "structure compactée"
        );
    }

    #[test]
    fn the_hid_channels_are_the_ones_consoles_use() {
        assert_eq!(PSM_CONTROL, 17);
        assert_eq!(PSM_INTERRUPT, 19);
    }

    #[test]
    fn a_bluetooth_address_reads_in_the_usual_order() {
        let channel_peer = [0x56, 0x34, 0x12, 0xAB, 0x89, 0x67];
        let formatted = format!(
            "{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}",
            channel_peer[5],
            channel_peer[4],
            channel_peer[3],
            channel_peer[2],
            channel_peer[1],
            channel_peer[0]
        );
        assert_eq!(formatted, "67:89:AB:12:34:56");
    }
}
