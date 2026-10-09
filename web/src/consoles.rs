//! Profils de consoles : étiquettes et teintes, comme dans l'application.
//!
//! Les noms de machines et les glyphes ne se traduisent pas — « A » reste
//! « A ». Le résumé, lui, est une phrase : il vit dans les dictionnaires.

pub struct Profil {
    pub id: &'static str,
    pub nom: &'static str,
    pub teinte: &'static str,
    glyphes: &'static [(&'static str, &'static str)],
    /// Ce que la machine n'a pas : bouton de capture, caméra.
    pub omis: &'static [&'static str],
}

/// La croix et l'arc de vision : les mêmes sur toutes les consoles.
const DIRECTIONS: [(&str, &str); 6] = [
    ("dpad", "✛"),
    ("lookLeft", "⇠"),
    ("lookUp", "⇡"),
    ("lookDown", "⇣"),
    ("lookRight", "⇢"),
    ("cameraStick", "◎"),
];

/// L'arc de vision : quatre boutons qui déplacent le champ de vision.
pub const CAMERA: [&str; 4] = ["lookLeft", "lookUp", "lookDown", "lookRight"];
pub const FACE: [&str; 4] = ["faceW", "faceN", "faceS", "faceE"];
pub const TRANCHES: [&str; 4] = ["L1", "L2", "R2", "R1"];
pub const SYSTEME: [&str; 4] = ["select", "home", "capture", "start"];

const SANS_CAMERA: [&str; 6] = [
    "capture",
    "lookLeft",
    "lookUp",
    "lookDown",
    "lookRight",
    "cameraStick",
];

impl Profil {
    pub fn glyphe(&self, id: &str) -> &'static str {
        self.glyphes
            .iter()
            .chain(DIRECTIONS.iter())
            .find(|(cle, _)| *cle == id)
            .map(|(_, glyphe)| *glyphe)
            .unwrap_or("")
    }

    /// La console a-t-elle une caméra à piloter ? Les jeux rétro et le
    /// clavier d'ordinateur n'en ont pas : ni arc de vision, ni stick caméra.
    pub fn a_camera(&self) -> bool {
        !self.omis.contains(&"lookUp")
    }
}

pub const PROFILS: [Profil; 6] = [
    Profil {
        id: "switch",
        nom: "Nintendo Switch",
        teinte: "#ff4d5e",
        glyphes: &[
            ("faceS", "B"),
            ("faceE", "A"),
            ("faceW", "Y"),
            ("faceN", "X"),
            ("L1", "L"),
            ("L2", "ZL"),
            ("R2", "ZR"),
            ("R1", "R"),
            ("select", "−"),
            ("home", "⌂"),
            ("capture", "◉"),
            ("start", "+"),
        ],
        omis: &[],
    },
    Profil {
        id: "playstation",
        nom: "PlayStation",
        teinte: "#4d8dff",
        glyphes: &[
            ("faceS", "✕"),
            ("faceE", "○"),
            ("faceW", "□"),
            ("faceN", "△"),
            ("L1", "L1"),
            ("L2", "L2"),
            ("R2", "R2"),
            ("R1", "R1"),
            ("select", "Créer"),
            ("home", "PS"),
            ("capture", "Mic"),
            ("start", "Opt"),
        ],
        omis: &[],
    },
    Profil {
        id: "xbox",
        nom: "Xbox",
        teinte: "#4ce660",
        glyphes: &[
            ("faceS", "A"),
            ("faceE", "B"),
            ("faceW", "X"),
            ("faceN", "Y"),
            ("L1", "LB"),
            ("L2", "LT"),
            ("R2", "RT"),
            ("R1", "RB"),
            ("select", "Vue"),
            ("home", "Xbox"),
            ("capture", "Part."),
            ("start", "Menu"),
        ],
        omis: &[],
    },
    Profil {
        id: "steam",
        nom: "Steam Deck / PC",
        teinte: "#8b7dff",
        glyphes: &[
            ("faceS", "A"),
            ("faceE", "B"),
            ("faceW", "X"),
            ("faceN", "Y"),
            ("L1", "L1"),
            ("L2", "L2"),
            ("R2", "R2"),
            ("R1", "R1"),
            ("select", "Sel."),
            ("home", "Steam"),
            ("capture", "⋯"),
            ("start", "Start"),
        ],
        omis: &[],
    },
    Profil {
        id: "retro",
        nom: "Rétro / Émulateur",
        teinte: "#ffa33d",
        glyphes: &[
            ("faceS", "B"),
            ("faceE", "A"),
            ("faceW", "Y"),
            ("faceN", "X"),
            ("L1", "L"),
            ("L2", "L2"),
            ("R2", "R2"),
            ("R1", "R"),
            ("select", "Sel."),
            ("home", "Menu"),
            ("start", "Start"),
        ],
        omis: &SANS_CAMERA,
    },
    Profil {
        id: "desktop",
        nom: "Ordinateur",
        teinte: "#00e5ff",
        glyphes: &[
            ("faceS", "↵"),
            ("faceE", "esc"),
            ("faceW", "⇥"),
            ("faceN", "⌫"),
            ("L1", "⌘"),
            ("L2", "⇧"),
            ("R2", "⌃"),
            ("R1", "⌥"),
            ("select", "F2"),
            ("home", "⌂"),
            ("start", "F5"),
        ],
        omis: &SANS_CAMERA,
    },
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chaque_profil_nomme_ses_boutons() {
        for profil in &PROFILS {
            for id in FACE.iter().chain(&TRANCHES) {
                assert!(!profil.glyphe(id).is_empty(), "{} {id}", profil.id);
            }
            assert_eq!(profil.glyphe("dpad"), "✛");
        }
    }

    #[test]
    fn retro_et_ordinateur_n_ont_pas_de_camera() {
        let sans: Vec<_> = PROFILS
            .iter()
            .filter(|p| !p.a_camera())
            .map(|p| p.id)
            .collect();
        assert_eq!(sans, ["retro", "desktop"]);
    }
}
