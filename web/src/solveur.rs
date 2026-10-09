//! Géométrie de l'enveloppe d'atteinte du pouce.
//!
//! Ce module reprend, en Rust, le solveur de l'application iOS
//! (`ControllerLayout.swift`). Le site ne se contente donc pas de *décrire* la
//! disposition adaptative : il la calcule, avec les mêmes règles. Ce qui bouge
//! à l'écran du visiteur est ce qui bougera dans l'application.

use std::collections::BTreeMap;
use std::f64::consts::PI;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Main {
    Gauche,
    Droite,
}

impl Main {
    pub fn code(self) -> &'static str {
        match self {
            Main::Gauche => "left",
            Main::Droite => "right",
        }
    }

    pub fn depuis_code(code: &str) -> Option<Self> {
        match code {
            "left" => Some(Main::Gauche),
            "right" => Some(Main::Droite),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub struct Taille {
    pub largeur: f64,
    pub hauteur: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Anneau {
    /// Identifiants des commandes de l'arc, du bord vers l'intérieur.
    pub ids: Vec<&'static str>,
    pub taille: Taille,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum ModeDisposition {
    #[default]
    Arc,
    Libre,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Activation {
    Direct,
    Verrou,
    Survol,
}

impl Activation {
    pub fn code(self) -> &'static str {
        match self {
            Activation::Direct => "direct",
            Activation::Verrou => "latch",
            Activation::Survol => "dwell",
        }
    }

    pub fn depuis_code(code: &str) -> Option<Self> {
        match code {
            "direct" => Some(Activation::Direct),
            "latch" => Some(Activation::Verrou),
            "dwell" => Some(Activation::Survol),
            _ => None,
        }
    }
}

/// Réglages propres à une commande, comme dans l'application.
#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub struct Preference {
    /// Masquée, elle libère de la place pour les autres.
    pub masquee: bool,
    /// Grossissement individuel, multiplié à la taille générale.
    pub echelle: Option<f64>,
    /// Position choisie en disposition libre, en fraction de la zone (0…1).
    pub position_libre: Option<Point>,
    /// Mode d'appui propre ; `None` suit le réglage général.
    pub activation: Option<Activation>,
    /// Commande verrouillée : elle ne se déplace plus, même en mode libre.
    pub verrouillee: bool,
}

pub type Preferences = BTreeMap<String, Preference>;

#[derive(Clone, Debug)]
pub struct Options<'a> {
    pub main: Main,
    pub cadre: Taille,
    /// Pivot souhaité, en fraction de la zone (main droite).
    pub pivot: Point,
    /// Ouverture angulaire balayée par le pouce, en radians.
    pub ouverture: f64,
    /// Côté d'une cible carrée, en unités de la zone de dessin.
    pub cible: f64,
    pub anneaux: Vec<Anneau>,
    /// Marge de sécurité sur les bords.
    pub marge: f64,
    /// Bande haute réservée à l'interface.
    pub bande_haute: f64,
    /// Écart minimal entre deux voisines, en proportion de leur taille.
    pub espacement: f64,
    pub mode: ModeDisposition,
    pub preferences: Option<&'a Preferences>,
    /// Les grosses commandes posées au plus près du pouce, avant tout arc.
    pub interieures: Vec<&'static str>,
}

impl<'a> Options<'a> {
    pub fn nouvelles(main: Main, cadre: Taille, cible: f64, anneaux: Vec<Anneau>) -> Self {
        Options {
            main,
            cadre,
            pivot: Point { x: 0.9, y: 0.9 },
            ouverture: PI / 2.4,
            cible,
            anneaux,
            marge: 6.0,
            bande_haute: 0.0,
            espacement: ESPACEMENT_DEFAUT,
            mode: ModeDisposition::Arc,
            preferences: None,
            interieures: INTERIEURES.to_vec(),
        }
    }

    fn preference(&self, id: &str) -> Preference {
        self.preferences
            .and_then(|preferences| preferences.get(id).copied())
            .unwrap_or_default()
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Placement {
    pub id: &'static str,
    pub centre: Point,
    pub taille: Taille,
    /// Rayon du cercle englobant, utilisé pour l'espacement.
    pub demi_etendue: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Disposition {
    pub placements: Vec<Placement>,
    pub pivot: Point,
    pub rayons: Vec<f64>,
    pub ouverture: f64,
    pub main: Main,
    /// Taille de cible finalement retenue.
    pub cible: f64,
    /// Espacement finalement appliqué.
    pub espacement: f64,
    pub mode: ModeDisposition,
    /// Identifiants des commandes qui se chevauchent (mode libre seulement).
    pub chevauchements: Vec<&'static str>,
}

/// Valeurs par défaut, identiques à celles de l'application.
pub const ESPACEMENT_DEFAUT: f64 = 1.35;
pub const ESPACEMENT_MIN: f64 = 1.06;
/// Le plancher des cibles : 44 points, le minimum des règles d'Apple.
pub const CIBLE_MIN: f64 = 44.0;
pub const CIBLE_MAX: f64 = 150.0;
pub const ESPACEMENT_MAX: f64 = 2.0;

/// Le stick et la croix, posés par le solveur lui-même.
pub const INTERIEURES: [&str; 2] = ["directional", "dpad"];
/// Le second stick, pour la caméra : masqué tant qu'on ne l'a pas demandé.
pub const STICK_CAMERA: &str = "cameraStick";

pub fn demi_etendue(taille: Taille) -> f64 {
    if (taille.largeur - taille.hauteur).abs() < 0.5 {
        taille.largeur / 2.0
    } else {
        taille.largeur.hypot(taille.hauteur) / 2.0
    }
}

pub fn sens(main: Main) -> f64 {
    match main {
        Main::Droite => -1.0,
        Main::Gauche => 1.0,
    }
}

/// Angle d'un élément réparti sur l'arc. L'arc part de la verticale, au-dessus
/// de l'articulation du pouce, et balaie vers l'intérieur de l'écran.
pub fn angle(index: usize, nombre: usize, main: Main, ouverture: f64) -> f64 {
    if nombre <= 1 {
        return -PI / 2.0;
    }
    let t = index as f64 / (nombre - 1) as f64;
    -PI / 2.0 + sens(main) * t * ouverture
}

pub fn point_sur_arc(pivot: Point, rayon: f64, angle: f64) -> Point {
    Point {
        x: pivot.x + angle.cos() * rayon,
        y: pivot.y + angle.sin() * rayon,
    }
}

/// Résout la disposition : automatique sur les arcs, ou libre — l'automatique
/// servant alors de point de départ.
pub fn resoudre(options: &Options) -> Disposition {
    let arc = resoudre_arc(options);
    match options.mode {
        ModeDisposition::Arc => arc,
        ModeDisposition::Libre => appliquer_positions_libres(arc, options),
    }
}

/// Garde les cibles à la taille demandée aussi longtemps que possible : quand
/// ça ne tient pas, c'est l'espacement qui cède d'abord, jusqu'à son plancher,
/// et les cibles ne rétrécissent qu'ensuite. La recherche parcourt une grille
/// fixe, du haut vers le bas : demander plus grand ne donne jamais plus petit.
fn resoudre_arc(options: &Options) -> Disposition {
    let espacement_demande = espacement_grille(options.espacement.max(ESPACEMENT_MIN));
    let cible_demandee = options.cible;
    let plancher = CIBLE_MIN.min(cible_demandee);

    if let Some(direct) = essayer(options, cible_demandee, espacement_demande, false) {
        return direct;
    }

    let mut cible = cible_demandee;
    while cible >= plancher {
        if essayer(options, cible, ESPACEMENT_MIN, false).is_some() {
            let mut centiemes = (espacement_demande * 100.0).round() as i64;
            while centiemes as f64 > ESPACEMENT_MIN * 100.0 {
                if let Some(tentative) = essayer(options, cible, centiemes as f64 / 100.0, false) {
                    return tentative;
                }
                centiemes -= 1;
            }
            return essayer(options, cible, ESPACEMENT_MIN, false).unwrap_or_else(|| vide(options));
        }
        cible = cible.ceil() - 1.0;
    }

    essayer(options, plancher, ESPACEMENT_MIN, true).unwrap_or_else(|| vide(options))
}

fn espacement_grille(espacement: f64) -> f64 {
    (espacement * 100.0 + 1e-9).floor() / 100.0
}

fn vide(options: &Options) -> Disposition {
    Disposition {
        placements: Vec::new(),
        pivot: Point {
            x: options.pivot.x * options.cadre.largeur,
            y: options.pivot.y * options.cadre.hauteur,
        },
        rayons: Vec::new(),
        ouverture: options.ouverture,
        main: options.main,
        cible: options.cible,
        espacement: options.espacement,
        mode: options.mode,
        chevauchements: Vec::new(),
    }
}

struct AnneauMis {
    ids: Vec<&'static str>,
    tailles: Vec<Taille>,
}

fn maximum(valeurs: impl Iterator<Item = f64>) -> f64 {
    valeurs.fold(f64::NEG_INFINITY, f64::max)
}

fn essayer(options: &Options, cible: f64, espacement: f64, force: bool) -> Option<Disposition> {
    let main = options.main;
    let cadre = options.cadre;
    let ouverture = options.ouverture;
    let marge = options.marge;
    let bande_haute = options.bande_haute;

    // Tout rétrécit ensemble : sinon les arcs extérieurs garderaient leur
    // taille et reprendraient la place gagnée sur les boutons de face.
    let echelle = cible / options.cible;
    let mut anneaux: Vec<AnneauMis> = options
        .anneaux
        .iter()
        .map(|anneau| {
            let ids: Vec<&'static str> = anneau
                .ids
                .iter()
                .copied()
                .filter(|id| !options.preference(id).masquee)
                .collect();
            let tailles = ids
                .iter()
                .map(|id| {
                    let propre = options.preference(id).echelle.unwrap_or(1.0);
                    Taille {
                        largeur: anneau.taille.largeur * echelle * propre,
                        hauteur: anneau.taille.hauteur * echelle * propre,
                    }
                })
                .collect();
            AnneauMis { ids, tailles }
        })
        .filter(|anneau| !anneau.ids.is_empty())
        .collect();

    // Le stick et la croix, au plus près du pouce. Visibles ensemble, ils
    // forment le premier arc ; si l'un est masqué, l'autre prend seul la
    // place du stick, sous le premier arc.
    let interieures: Vec<&'static str> = options
        .interieures
        .iter()
        .copied()
        .filter(|id| !options.preference(id).masquee)
        .collect();
    let taille_interieure = |id: &str| cible * 1.6 * options.preference(id).echelle.unwrap_or(1.0);
    if interieures.len() >= 2 {
        let tailles = interieures
            .iter()
            .map(|id| {
                let cote = taille_interieure(id);
                Taille {
                    largeur: cote,
                    hauteur: cote,
                }
            })
            .collect();
        anneaux.insert(
            0,
            AnneauMis {
                ids: interieures.clone(),
                tailles,
            },
        );
    }
    let seule = if interieures.len() == 1 {
        Some(interieures[0])
    } else {
        None
    };
    if anneaux.is_empty() && seule.is_none() {
        return None;
    }

    let pivot = Point {
        x: match main {
            Main::Droite => options.pivot.x,
            Main::Gauche => 1.0 - options.pivot.x,
        } * cadre.largeur,
        y: options.pivot.y * cadre.hauteur,
    };

    // 1. Rayon minimal de chaque arc : corde entre voisines et écart radial.
    let mut rayons: Vec<f64> = Vec::new();
    let mut precedent: Option<(f64, f64)> = None;
    for anneau in &anneaux {
        let demi = maximum(anneau.tailles.iter().map(|taille| demi_etendue(*taille)));
        let mut rayon = 0.0;
        if anneau.ids.len() > 1 {
            let pas = ouverture / (anneau.ids.len() - 1) as f64;
            rayon = (2.0 * demi * espacement) / (2.0 * (pas / 2.0).sin());
        }
        if let Some((rayon_precedent, demi_precedent)) = precedent {
            rayon = rayon.max(rayon_precedent + (demi_precedent + demi) * espacement);
        }
        rayons.push(rayon);
        precedent = Some((rayon, demi));
    }

    // 2. Commande directionnelle seule, au plus près du pouce.
    let mut placements: Vec<Placement> = Vec::new();
    let mut rayon_directionnel = 0.0;
    if let Some(id) = seule {
        let taille = taille_interieure(id);
        if let (Some(premier), Some(&premier_rayon)) = (anneaux.first(), rayons.first()) {
            let premier_demi = maximum(premier.tailles.iter().map(|t| demi_etendue(*t)));
            let plafond = premier_rayon - (taille / 2.0 + premier_demi) * espacement;
            if plafond <= 0.0 && !force {
                return None;
            }
            rayon_directionnel = (taille * 0.35)
                .max(cadre.largeur * 0.12)
                .min(plafond)
                .max(taille * 0.25);
        } else {
            rayon_directionnel = (taille * 0.5).max(cadre.largeur * 0.12);
        }
        placements.push(Placement {
            id,
            centre: point_sur_arc(pivot, rayon_directionnel, angle(1, 4, main, ouverture)),
            taille: Taille {
                largeur: taille,
                hauteur: taille,
            },
            demi_etendue: taille / 2.0,
        });
    }

    // 3. Placement brut.
    for (index_anneau, anneau) in anneaux.iter().enumerate() {
        let rayon = rayons.get(index_anneau).copied().unwrap_or(0.0);
        for (index, id) in anneau.ids.iter().enumerate() {
            let taille = anneau.tailles[index];
            placements.push(Placement {
                id,
                centre: point_sur_arc(
                    pivot,
                    rayon,
                    angle(index, anneau.ids.len(), main, ouverture),
                ),
                taille,
                demi_etendue: demi_etendue(taille),
            });
        }
    }

    if placements.is_empty() {
        return None;
    }

    // 4. Le bloc tient-il dans le cadre ?
    let boite = englobante(&placements);
    let largeur_dispo = cadre.largeur - 2.0 * marge;
    let hauteur_dispo = cadre.hauteur - bande_haute - marge;
    if !force && (boite.largeur > largeur_dispo || boite.hauteur > hauteur_dispo) {
        return None;
    }

    // 5. Translation rigide minimale : le bloc se déplace d'un seul tenant,
    // donc les distances relatives — le geste appris — sont conservées.
    let mut dx = 0.0;
    let mut dy = 0.0;
    if boite.min_x < marge {
        dx = marge - boite.min_x;
    } else if boite.max_x > cadre.largeur - marge {
        dx = cadre.largeur - marge - boite.max_x;
    }
    if boite.min_y < bande_haute {
        dy = bande_haute - boite.min_y;
    } else if boite.max_y > cadre.hauteur - marge {
        dy = cadre.hauteur - marge - boite.max_y;
    }
    for placement in &mut placements {
        placement.centre.x += dx;
        placement.centre.y += dy;
    }

    let mut tous_rayons = Vec::new();
    if seule.is_some() {
        tous_rayons.push(rayon_directionnel);
    }
    tous_rayons.extend(rayons);
    let chevauchements = trouver_chevauchements(&placements);

    Some(Disposition {
        placements,
        pivot: Point {
            x: pivot.x + dx,
            y: pivot.y + dy,
        },
        rayons: tous_rayons,
        ouverture,
        main,
        cible,
        espacement,
        mode: ModeDisposition::Arc,
        chevauchements,
    })
}

/// Remplace les positions calculées par celles choisies, en gardant chaque
/// commande entièrement visible. Les chevauchements sont permis — et signalés.
fn appliquer_positions_libres(mut arc: Disposition, options: &Options) -> Disposition {
    for placement in &mut arc.placements {
        if let Some(choisie) = options.preference(placement.id).position_libre {
            placement.centre = recadrer(
                Point {
                    x: choisie.x * options.cadre.largeur,
                    y: choisie.y * options.cadre.hauteur,
                },
                placement.taille,
                options.cadre,
                options.marge,
                options.bande_haute,
            );
        }
    }
    arc.mode = ModeDisposition::Libre;
    arc.chevauchements = trouver_chevauchements(&arc.placements);
    arc
}

/// Ramène un centre de commande dans le cadre, bande haute comprise.
pub fn recadrer(
    centre: Point,
    taille: Taille,
    cadre: Taille,
    marge: f64,
    bande_haute: f64,
) -> Point {
    let demi_l = taille.largeur / 2.0;
    let demi_h = taille.hauteur / 2.0;
    let min_x = marge + demi_l;
    let max_x = min_x.max(cadre.largeur - marge - demi_l);
    let min_y = bande_haute + demi_h;
    let max_y = min_y.max(cadre.hauteur - marge - demi_h);
    Point {
        x: centre.x.max(min_x).min(max_x),
        y: centre.y.max(min_y).min(max_y),
    }
}

fn trouver_chevauchements(placements: &[Placement]) -> Vec<&'static str> {
    let mut ids: Vec<&'static str> = Vec::new();
    for (i, a) in placements.iter().enumerate() {
        for b in &placements[i + 1..] {
            if se_chevauchent(a, b) {
                if !ids.contains(&a.id) {
                    ids.push(a.id);
                }
                if !ids.contains(&b.id) {
                    ids.push(b.id);
                }
            }
        }
    }
    ids
}

struct Boite {
    min_x: f64,
    max_x: f64,
    min_y: f64,
    max_y: f64,
    largeur: f64,
    hauteur: f64,
}

fn englobante(placements: &[Placement]) -> Boite {
    let mut min_x = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    for p in placements {
        min_x = min_x.min(p.centre.x - p.taille.largeur / 2.0);
        max_x = max_x.max(p.centre.x + p.taille.largeur / 2.0);
        min_y = min_y.min(p.centre.y - p.taille.hauteur / 2.0);
        max_y = max_y.max(p.centre.y + p.taille.hauteur / 2.0);
    }
    Boite {
        min_x,
        max_x,
        min_y,
        max_y,
        largeur: max_x - min_x,
        hauteur: max_y - min_y,
    }
}

/// Deux commandes se chevauchent-elles ?
pub fn se_chevauchent(a: &Placement, b: &Placement) -> bool {
    let distance = (a.centre.x - b.centre.x).hypot(a.centre.y - b.centre.y);
    distance < a.demi_etendue + b.demi_etendue - 0.5
}

/// Chemin SVG d'un arc de guide.
pub fn chemin_arc(pivot: Point, rayon: f64, main: Main, ouverture: f64) -> String {
    let debut = point_sur_arc(pivot, rayon, angle(0, 2, main, ouverture));
    let fin = point_sur_arc(pivot, rayon, angle(1, 2, main, ouverture));
    let balayage = match main {
        Main::Droite => 0,
        Main::Gauche => 1,
    };
    format!(
        "M {:.2} {:.2} A {:.2} {:.2} 0 0 {} {:.2} {:.2}",
        debut.x, debut.y, rayon, rayon, balayage, fin.x, fin.y
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn anneaux(cible: f64) -> Vec<Anneau> {
        vec![
            Anneau {
                ids: vec!["faceW", "faceN", "faceS", "faceE"],
                taille: Taille {
                    largeur: cible,
                    hauteur: cible,
                },
            },
            Anneau {
                ids: vec!["L1", "L2", "R2", "R1"],
                taille: Taille {
                    largeur: cible * 0.82,
                    hauteur: cible * 0.82,
                },
            },
            Anneau {
                ids: vec!["select", "home", "capture", "start"],
                taille: Taille {
                    largeur: 52.0,
                    hauteur: 24.0,
                },
            },
        ]
    }

    fn base(cible: f64) -> Options<'static> {
        Options::nouvelles(
            Main::Droite,
            Taille {
                largeur: 320.0,
                hauteur: 470.0,
            },
            cible,
            anneaux(cible),
        )
    }

    fn cadre(l: f64, h: f64) -> Taille {
        Taille {
            largeur: l,
            hauteur: h,
        }
    }

    fn trouve<'a>(d: &'a Disposition, id: &str) -> &'a Placement {
        d.placements.iter().find(|p| p.id == id).expect(id)
    }

    #[test]
    fn l_arc_part_de_la_verticale_et_balaie_vers_l_interieur() {
        let ouverture = PI / 2.4;
        assert_eq!(angle(0, 4, Main::Droite, ouverture), -PI / 2.0);
        assert!(angle(3, 4, Main::Droite, ouverture) < -PI / 2.0);
        assert!(angle(3, 4, Main::Gauche, ouverture) > -PI / 2.0);
    }

    #[test]
    fn aucune_commande_ne_se_chevauche_quelle_que_soit_la_taille() {
        for c in [
            cadre(260.0, 420.0),
            cadre(320.0, 560.0),
            cadre(420.0, 700.0),
        ] {
            for main in [Main::Gauche, Main::Droite] {
                for cible in [40.0, 56.0, 72.0, 96.0] {
                    let d = resoudre(&Options::nouvelles(main, c, cible, anneaux(cible)));
                    assert!(d.chevauchements.is_empty());
                    for (i, a) in d.placements.iter().enumerate() {
                        for b in &d.placements[i + 1..] {
                            assert!(!se_chevauchent(a, b), "{} et {}", a.id, b.id);
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn rien_ne_sort_du_cadre() {
        for c in [
            cadre(260.0, 420.0),
            cadre(320.0, 560.0),
            cadre(420.0, 700.0),
        ] {
            for main in [Main::Gauche, Main::Droite] {
                let d = resoudre(&Options::nouvelles(main, c, 64.0, anneaux(64.0)));
                for p in &d.placements {
                    assert!(p.centre.x - p.taille.largeur / 2.0 >= -1.0);
                    assert!(p.centre.x + p.taille.largeur / 2.0 <= c.largeur + 1.0);
                    assert!(p.centre.y - p.taille.hauteur / 2.0 >= -1.0);
                    assert!(p.centre.y + p.taille.hauteur / 2.0 <= c.hauteur + 1.0);
                }
            }
        }
    }

    #[test]
    fn la_disposition_est_le_miroir_exact_entre_les_deux_mains() {
        let c = cadre(320.0, 560.0);
        let droite = resoudre(&Options::nouvelles(Main::Droite, c, 64.0, anneaux(64.0)));
        let gauche = resoudre(&Options::nouvelles(Main::Gauche, c, 64.0, anneaux(64.0)));
        assert_eq!(droite.placements.len(), gauche.placements.len());
        for (a, b) in droite.placements.iter().zip(&gauche.placements) {
            assert_eq!(a.id, b.id);
            assert!((c.largeur - a.centre.x - b.centre.x).abs() < 1.5);
            assert!((a.centre.y - b.centre.y).abs() < 1.5);
        }
    }

    #[test]
    fn un_cadre_trop_petit_reduit_les_cibles_au_lieu_d_en_supprimer() {
        let d = resoudre(&Options::nouvelles(
            Main::Droite,
            cadre(220.0, 320.0),
            96.0,
            anneaux(96.0),
        ));
        assert_eq!(d.placements.len(), 14);
        assert!(d.cible < 96.0);
    }

    #[test]
    fn l_espacement_demande_se_retrouve_entre_les_commandes() {
        let mut large = base(56.0);
        large.cadre = cadre(520.0, 820.0);
        large.espacement = 1.5;
        let large = resoudre(&large);
        assert_eq!(large.espacement, 1.5);
        let mut serre = base(56.0);
        serre.cadre = cadre(520.0, 820.0);
        serre.espacement = 1.1;
        let serre = resoudre(&serre);
        let ecart = |d: &Disposition| {
            let mut plus_petit = f64::INFINITY;
            for (i, a) in d.placements.iter().enumerate() {
                for b in &d.placements[i + 1..] {
                    let distance = (a.centre.x - b.centre.x).hypot(a.centre.y - b.centre.y);
                    plus_petit = plus_petit.min(distance - a.demi_etendue - b.demi_etendue);
                }
            }
            plus_petit
        };
        assert!(ecart(&large) > ecart(&serre));
    }

    #[test]
    fn les_cibles_ne_retrecissent_qu_apres_l_espacement() {
        let mut o = base(96.0);
        o.cadre = cadre(220.0, 320.0);
        o.espacement = 1.6;
        let d = resoudre(&o);
        assert!(d.cible < 96.0);
        assert!(d.espacement < 1.6);
        assert!(d.espacement >= 1.06);
        o.espacement = 1.06;
        assert_eq!(d.cible, resoudre(&o).cible);
    }

    #[test]
    fn une_commande_masquee_disparait_et_rend_de_la_place() {
        let mut preferences = Preferences::new();
        for id in ["select", "home", "capture", "start"] {
            preferences.insert(
                id.into(),
                Preference {
                    masquee: true,
                    ..Default::default()
                },
            );
        }
        let complet = resoudre(&base(72.0));
        let mut o = base(72.0);
        o.preferences = Some(&preferences);
        let reduit = resoudre(&o);
        assert_eq!(reduit.placements.len(), complet.placements.len() - 4);
        assert!(!reduit.placements.iter().any(|p| p.id == "start"));
        assert!(reduit.cible > complet.cible);
    }

    #[test]
    fn le_grossissement_par_commande_est_applique() {
        let mut preferences = Preferences::new();
        preferences.insert(
            "faceS".into(),
            Preference {
                echelle: Some(1.5),
                ..Default::default()
            },
        );
        let mut o = base(60.0);
        o.preferences = Some(&preferences);
        let d = resoudre(&o);
        let sud = trouve(&d, "faceS");
        let est = trouve(&d, "faceE");
        assert!((sud.taille.largeur / est.taille.largeur - 1.5).abs() < 0.01);
        assert!(d.chevauchements.is_empty());
    }

    #[test]
    fn la_disposition_libre_part_de_la_disposition_automatique() {
        let auto = resoudre(&base(60.0));
        let mut o = base(60.0);
        o.mode = ModeDisposition::Libre;
        let libre = resoudre(&o);
        for (a, b) in libre.placements.iter().zip(&auto.placements) {
            assert_eq!(a.id, b.id);
            assert!((a.centre.x - b.centre.x).abs() < 0.01);
            assert!((a.centre.y - b.centre.y).abs() < 0.01);
        }
    }

    #[test]
    fn une_position_choisie_est_respectee_et_ramenee_dans_le_cadre() {
        let mut preferences = Preferences::new();
        preferences.insert(
            "faceS".into(),
            Preference {
                position_libre: Some(Point { x: 0.25, y: 0.6 }),
                ..Default::default()
            },
        );
        preferences.insert(
            "faceN".into(),
            Preference {
                position_libre: Some(Point { x: 1.8, y: -0.4 }),
                ..Default::default()
            },
        );
        let mut o = base(60.0);
        o.mode = ModeDisposition::Libre;
        o.bande_haute = 96.0;
        o.preferences = Some(&preferences);
        let d = resoudre(&o);
        let sud = trouve(&d, "faceS");
        assert!((sud.centre.x - 320.0 * 0.25).abs() < 0.5);
        assert!((sud.centre.y - 470.0 * 0.6).abs() < 0.5);
        let nord = trouve(&d, "faceN");
        assert!(nord.centre.x + nord.taille.largeur / 2.0 <= 320.5);
        assert!(nord.centre.y - nord.taille.hauteur / 2.0 >= 95.5);
    }

    #[test]
    fn les_chevauchements_sont_signales_pas_empeches() {
        let mut preferences = Preferences::new();
        for id in ["faceS", "faceE"] {
            preferences.insert(
                id.into(),
                Preference {
                    position_libre: Some(Point { x: 0.5, y: 0.5 }),
                    ..Default::default()
                },
            );
        }
        let mut o = base(60.0);
        o.mode = ModeDisposition::Libre;
        o.preferences = Some(&preferences);
        let d = resoudre(&o);
        assert_eq!(d.placements.len(), 14);
        assert!(d.chevauchements.contains(&"faceS"));
        assert!(d.chevauchements.contains(&"faceE"));
    }

    #[test]
    fn le_recadrage_garde_la_commande_entiere() {
        let c = recadrer(
            Point { x: -40.0, y: 900.0 },
            Taille {
                largeur: 60.0,
                hauteur: 60.0,
            },
            cadre(320.0, 470.0),
            6.0,
            96.0,
        );
        assert_eq!(c.x, 36.0);
        assert_eq!(c.y, 470.0 - 6.0 - 30.0);
    }

    struct Ecran {
        nom: &'static str,
        cadre: Taille,
        bande: f64,
    }

    fn ecrans() -> [Ecran; 3] {
        [
            Ecran {
                nom: "iPad",
                cadre: cadre(768.0, 1024.0),
                bande: 124.0,
            },
            Ecran {
                nom: "iPhone",
                cadre: cadre(393.0, 852.0),
                bande: 118.0,
            },
            Ecran {
                nom: "petit dessin",
                cadre: cadre(320.0, 470.0),
                bande: 96.0,
            },
        ]
    }

    fn resoudre_ecran(e: &Ecran, cible: f64, espacement: f64, main: Main) -> Disposition {
        let mut o = Options::nouvelles(main, e.cadre, cible, anneaux(cible));
        o.bande_haute = e.bande;
        o.espacement = espacement;
        resoudre(&o)
    }

    fn demandes() -> impl Iterator<Item = f64> {
        (0..54).map(|i| CIBLE_MIN + i as f64 * 2.0)
    }

    #[test]
    fn la_plage_va_de_44_a_150_points_et_jusqu_a_x2() {
        assert_eq!(CIBLE_MIN, 44.0);
        assert_eq!(CIBLE_MAX, 150.0);
        assert_eq!(ESPACEMENT_MAX, 2.0);
        assert_eq!(demandes().last(), Some(CIBLE_MAX));
    }

    #[test]
    fn demander_plus_grand_ne_rend_jamais_les_cibles_plus_petites() {
        for e in ecrans() {
            for espacement in [1.1, 1.35, 1.6, 2.0] {
                let mut precedente = 0.0;
                for demande in demandes() {
                    let tenue = resoudre_ecran(&e, demande, espacement, Main::Droite).cible;
                    assert!(
                        tenue >= precedente,
                        "{} ×{espacement} : {demande} → {tenue}",
                        e.nom
                    );
                    precedente = tenue;
                }
            }
        }
    }

    #[test]
    fn ecarter_davantage_ne_grossit_jamais_les_cibles_et_ne_resserre_jamais() {
        for e in ecrans() {
            for demande in [44.0, 58.0, 80.0, 100.0] {
                let mut cible = f64::INFINITY;
                let mut ecart = 0.0;
                for centiemes in (110..=200).step_by(5) {
                    let d = resoudre_ecran(&e, demande, centiemes as f64 / 100.0, Main::Droite);
                    assert!(d.cible <= cible, "{} {demande}", e.nom);
                    assert!(d.espacement >= ecart - 1e-9, "{} {demande}", e.nom);
                    cible = d.cible;
                    ecart = d.espacement;
                }
            }
        }
    }

    #[test]
    fn sur_toute_la_plage_rien_ne_se_chevauche_ni_ne_sort() {
        for e in ecrans() {
            for main in [Main::Gauche, Main::Droite] {
                for espacement in [1.1, 1.35, 1.6, 2.0] {
                    for demande in demandes() {
                        let d = resoudre_ecran(&e, demande, espacement, main);
                        let cas = format!("{} {:?} {demande} ×{espacement}", e.nom, main);
                        assert!(d.cible <= demande, "{cas}");
                        assert!(d.cible >= CIBLE_MIN, "{cas}");
                        assert!(d.espacement <= espacement + 1e-9, "{cas}");
                        assert_eq!(d.placements.len(), 14, "{cas}");
                        assert!(d.chevauchements.is_empty(), "{cas}");
                        for p in &d.placements {
                            assert!(
                                p.centre.x - p.taille.largeur / 2.0 >= -0.5,
                                "{cas} {}",
                                p.id
                            );
                            assert!(
                                p.centre.x + p.taille.largeur / 2.0 <= e.cadre.largeur + 0.5,
                                "{cas} {}",
                                p.id
                            );
                            assert!(
                                p.centre.y - p.taille.hauteur / 2.0 >= e.bande - 0.5,
                                "{cas} {}",
                                p.id
                            );
                            assert!(
                                p.centre.y + p.taille.hauteur / 2.0 <= e.cadre.hauteur + 0.5,
                                "{cas} {}",
                                p.id
                            );
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn de_gros_boutons_100_points_tenus_sur_ipad_plus_de_70_sur_iphone() {
        let [ipad, iphone, _] = ecrans();
        assert_eq!(
            resoudre_ecran(&ipad, 100.0, 1.35, Main::Droite).cible,
            100.0
        );
        let ecarte = resoudre_ecran(&ipad, 100.0, 2.0, Main::Droite);
        assert_eq!(ecarte.cible, 100.0);
        assert!(ecarte.espacement > 1.06 && ecarte.espacement < 2.0);
        assert!(resoudre_ecran(&ipad, 150.0, 1.35, Main::Droite).cible >= 140.0);
        let telephone = resoudre_ecran(&iphone, 100.0, 2.0, Main::Droite);
        assert!(telephone.cible < 100.0);
        assert!(telephone.cible >= 70.0, "{}", telephone.cible);
        assert_eq!(telephone.placements.len(), 14);
    }

    #[test]
    fn toutes_les_manettes_ont_une_croix_a_cote_du_stick() {
        let mut o = base(56.0);
        o.cadre = cadre(520.0, 820.0);
        let d = resoudre(&o);
        let stick = trouve(&d, "directional");
        let croix = trouve(&d, "dpad");
        assert_eq!(croix.taille.largeur, stick.taille.largeur);
        let distance = |p: &Placement| (p.centre.x - d.pivot.x).hypot(p.centre.y - d.pivot.y);
        let plus_loin = distance(stick).max(distance(croix));
        let autres = d
            .placements
            .iter()
            .filter(|p| p.id != "directional" && p.id != "dpad")
            .map(distance)
            .fold(f64::INFINITY, f64::min);
        assert!(plus_loin < autres);
    }

    #[test]
    fn masquer_la_croix_ou_le_stick_rend_sa_place() {
        let c = cadre(393.0, 852.0);
        let mut o = base(150.0);
        o.cadre = c;
        o.bande_haute = 118.0;
        let deux = resoudre(&o);
        for masque in ["dpad", "directional"] {
            let mut preferences = Preferences::new();
            preferences.insert(
                masque.into(),
                Preference {
                    masquee: true,
                    ..Default::default()
                },
            );
            let mut o = base(150.0);
            o.cadre = c;
            o.bande_haute = 118.0;
            o.preferences = Some(&preferences);
            let un = resoudre(&o);
            assert_eq!(un.placements.len(), 13);
            assert!(!un.placements.iter().any(|p| p.id == masque));
            assert!(un.cible > deux.cible, "sans {masque}");
        }
        let mut preferences = Preferences::new();
        for id in ["dpad", "directional"] {
            preferences.insert(
                id.into(),
                Preference {
                    masquee: true,
                    ..Default::default()
                },
            );
        }
        let mut o = base(56.0);
        o.cadre = c;
        o.preferences = Some(&preferences);
        assert_eq!(resoudre(&o).placements.len(), 12);
    }

    #[test]
    fn le_stick_camera_rejoint_le_stick_et_la_croix() {
        let mut o = base(56.0);
        o.cadre = cadre(768.0, 1024.0);
        o.interieures = vec!["directional", "dpad", STICK_CAMERA];
        let d = resoudre(&o);
        assert!(d.chevauchements.is_empty());
        let grosses = ["directional", "dpad", STICK_CAMERA];
        let distance = |p: &Placement| (p.centre.x - d.pivot.x).hypot(p.centre.y - d.pivot.y);
        let plus_loin = grosses
            .iter()
            .map(|id| distance(trouve(&d, id)))
            .fold(0.0, f64::max);
        let autres = d
            .placements
            .iter()
            .filter(|p| !grosses.contains(&p.id))
            .map(distance)
            .fold(f64::INFINITY, f64::min);
        assert!(plus_loin < autres);

        let mut preferences = Preferences::new();
        preferences.insert(
            STICK_CAMERA.into(),
            Preference {
                masquee: true,
                ..Default::default()
            },
        );
        o.preferences = Some(&preferences);
        let sans = resoudre(&o);
        assert!(!sans.placements.iter().any(|p| p.id == STICK_CAMERA));
        assert_eq!(sans.placements.len(), d.placements.len() - 1);
    }
}
