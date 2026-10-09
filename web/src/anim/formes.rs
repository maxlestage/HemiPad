//! Les formes que prennent les grains.
//!
//! Chaque forme est dessinée sur un canevas invisible, puis échantillonnée :
//! les pixels remplis deviennent des positions de grains. N'importe quel
//! dessin devient ainsi un nuage — la marque, une main, une manette, et la
//! vraie disposition calculée par le solveur.
//!
//! Les coordonnées rendues vont de -1 à 1, l'origine au centre, y vers le bas.

use wasm_bindgen::JsCast;
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement, Path2d};

use crate::apercu;
use crate::composants::commun::{CORPS_DROIT, CORPS_GAUCHE};
use crate::dom;
use crate::etat::Appareil;
use crate::solveur::{Main, Placement};

/// Côté du canevas d'échantillonnage. Assez fin pour les détails de la
/// marque, assez petit pour se lire en un instant.
const COTE: f64 = 360.0;

/// Un générateur pseudo-aléatoire déterministe : le même nuage à chaque
/// visite, sans dépendre d'un tirage du navigateur.
pub struct Hasard(u32);

impl Hasard {
    pub fn new(graine: u32) -> Self {
        Hasard(graine.max(1))
    }

    pub fn suivant(&mut self) -> f32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        (x as f64 / u32::MAX as f64) as f32
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Forme {
    Marque,
    Main,
    Manette,
    Arc,
    Clavier,
    Ondes,
    Appareil,
}

pub const FILM: [Forme; 7] = [
    Forme::Marque,
    Forme::Main,
    Forme::Manette,
    Forme::Arc,
    Forme::Clavier,
    Forme::Ondes,
    Forme::Appareil,
];

struct Toile {
    ctx: CanvasRenderingContext2d,
}

impl Toile {
    fn nouvelle() -> Option<Self> {
        let canevas: HtmlCanvasElement = dom::document()
            .create_element("canvas")
            .ok()?
            .dyn_into()
            .ok()?;
        canevas.set_width(COTE as u32);
        canevas.set_height(COTE as u32);
        // Lu pixel par pixel : le navigateur garde alors l'image en mémoire
        // vive plutôt que sur la carte graphique.
        let options = js_sys::Object::new();
        let _ = js_sys::Reflect::set(&options, &"willReadFrequently".into(), &true.into());
        let ctx: CanvasRenderingContext2d = canevas
            .get_context_with_context_options("2d", &options)
            .ok()??
            .dyn_into()
            .ok()?;
        Some(Toile { ctx })
    }

    fn effacer(&self) {
        let c = &self.ctx;
        let _ = c.reset_transform();
        c.clear_rect(0.0, 0.0, COTE, COTE);
        c.set_fill_style_str("#fff");
        c.set_stroke_style_str("#fff");
        c.set_line_cap("round");
        c.set_line_join("round");
        c.set_global_composite_operation("source-over").ok();
        c.set_line_dash(&js_sys::Array::new()).ok();
    }

    /// Place un dessin de `largeur` × `hauteur` unités au centre, avec une
    /// marge, à l'échelle du canevas.
    fn cadrer(&self, largeur: f64, hauteur: f64) -> f64 {
        let echelle = (COTE * 0.92) / largeur.max(hauteur);
        let _ = self.ctx.translate(
            (COTE - largeur * echelle) / 2.0,
            (COTE - hauteur * echelle) / 2.0,
        );
        let _ = self.ctx.scale(echelle, echelle);
        echelle
    }

    fn pastille(&self, p: &Placement, plein: bool, epaisseur: f64) {
        let c = &self.ctx;
        let (l, h) = (p.taille.largeur, p.taille.hauteur);
        c.begin_path();
        let rayon = l.min(h) / 2.0;
        let _ = c.round_rect_with_f64(p.centre.x - l / 2.0, p.centre.y - h / 2.0, l, h, rayon);
        if plein {
            c.fill();
        } else {
            c.set_line_width(epaisseur);
            c.stroke();
        }
    }

    /// Les pixels remplis, tirés au hasard jusqu'à `n` grains.
    fn echantillonner(&self, n: usize, hasard: &mut Hasard) -> Vec<f32> {
        let mut remplis: Vec<(u16, u16)> = Vec::new();
        if let Ok(image) = self.ctx.get_image_data(0.0, 0.0, COTE, COTE) {
            let donnees = image.data();
            let cote = COTE as usize;
            for y in 0..cote {
                for x in 0..cote {
                    if donnees[(y * cote + x) * 4 + 3] > 110 {
                        remplis.push((x as u16, y as u16));
                    }
                }
            }
        }
        let mut points = Vec::with_capacity(n * 2);
        for _ in 0..n {
            if remplis.is_empty() {
                points.push(hasard.suivant() * 2.0 - 1.0);
                points.push(hasard.suivant() * 2.0 - 1.0);
                continue;
            }
            let i = ((hasard.suivant() * remplis.len() as f32) as usize).min(remplis.len() - 1);
            let (x, y) = remplis[i];
            // Un grain tombe n'importe où dans son pixel, pas sur une grille.
            let fx = (x as f32 + hasard.suivant()) / COTE as f32;
            let fy = (y as f32 + hasard.suivant()) / COTE as f32;
            points.push(fx * 2.0 - 1.0);
            points.push(fy * 2.0 - 1.0);
        }
        points
    }
}

fn chemin(d: &str) -> Option<Path2d> {
    Path2d::new_with_path_string(d).ok()
}

fn marque(t: &Toile) {
    let c = &t.ctx;
    t.cadrer(56.0, 33.0);
    let _ = c.translate(-4.0, -18.5);
    if let Some(gauche) = chemin(CORPS_GAUCHE) {
        c.fill_with_path_2d_and_winding(&gauche, web_sys::CanvasWindingRule::Evenodd);
    }
    if let Some(droite) = chemin(CORPS_DROIT) {
        c.set_line_width(2.6);
        let tirets = js_sys::Array::of2(&5.5.into(), &4.5.into());
        let _ = c.set_line_dash(&tirets);
        c.stroke_with_path(&droite);
        let _ = c.set_line_dash(&js_sys::Array::new());
    }
    for (x, y) in [(44.5, 29.5), (50.5, 35.5)] {
        c.begin_path();
        let _ = c.arc(x, y, 3.4, 0.0, std::f64::consts::TAU);
        c.fill();
    }
}

/// Une main ouverte, paume vers soi : le pouce du côté de la main valide
/// choisie. Des traits épais et arrondis, une paume pleine.
fn main_ouverte(t: &Toile, main: Main) {
    let c = &t.ctx;
    t.cadrer(100.0, 100.0);
    if main == Main::Gauche {
        let _ = c.translate(100.0, 0.0);
        let _ = c.scale(-1.0, 1.0);
    }
    c.begin_path();
    let _ = c.round_rect_with_f64(34.0, 46.0, 38.0, 42.0, 14.0);
    c.fill();
    c.set_line_width(10.5);
    for ((x1, y1), (x2, y2)) in [
        ((40.0, 50.0), (37.0, 14.0)),
        ((50.0, 48.0), (50.5, 8.0)),
        ((60.0, 49.0), (63.0, 13.0)),
        ((68.0, 54.0), (75.0, 26.0)),
        ((37.0, 70.0), (20.0, 50.0)),
    ] {
        c.begin_path();
        c.move_to(x1, y1);
        c.line_to(x2, y2);
        c.stroke();
    }
}

/// La manette entière : les deux moitiés de la marque, pleines toutes les
/// deux. Les manettes demandent deux mains.
fn manette(t: &Toile) {
    let c = &t.ctx;
    t.cadrer(56.0, 33.0);
    let _ = c.translate(-4.0, -18.5);
    if let Some(gauche) = chemin(CORPS_GAUCHE) {
        c.fill_with_path_2d_and_winding(&gauche, web_sys::CanvasWindingRule::Evenodd);
        c.save();
        let _ = c.translate(64.0, 0.0);
        let _ = c.scale(-1.0, 1.0);
        if let Some(droite) = chemin(
            "M32 20H20c-7 0-11 4-12.5 11L5.5 41c-1 5.5 2.5 9 6.5 9 3.5 0 6-2.5 8-5.5L22.5 41H32Z",
        ) {
            c.fill_with_path_2d(&droite);
        }
        c.restore();
    }
    // Les quatre boutons, évidés.
    let _ = c.set_global_composite_operation("destination-out");
    for (x, y) in [(44.0, 30.5), (48.5, 26.0), (53.0, 30.5), (48.5, 35.0)] {
        c.begin_path();
        let _ = c.arc(x, y, 2.4, 0.0, std::f64::consts::TAU);
        c.fill();
    }
    let _ = c.set_global_composite_operation("source-over");
}

/// Les arcs d'atteinte du pouce, et les commandes posées dessus : la vraie
/// disposition, calculée par le solveur.
fn arc(t: &Toile, main: Main) {
    let c = &t.ctx;
    let d = apercu::disposition(Appareil::Ipad, main);
    let e = apercu::ecran(Appareil::Ipad);
    // On cadre sur ce qui est dessiné, pas sur tout l'écran.
    let (mut x0, mut y0, mut x1, mut y1) = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
    for p in &d.placements {
        x0 = x0.min(p.centre.x - p.taille.largeur / 2.0);
        x1 = x1.max(p.centre.x + p.taille.largeur / 2.0);
        y0 = y0.min(p.centre.y - p.taille.hauteur / 2.0);
        y1 = y1.max(p.centre.y + p.taille.hauteur / 2.0);
    }
    x1 = x1.max(d.pivot.x).min(e.cadre.largeur);
    y1 = y1.max(d.pivot.y).min(e.cadre.hauteur);
    t.cadrer(x1 - x0, y1 - y0);
    let _ = c.translate(-x0, -y0);
    c.set_line_width(2.4);
    for points in apercu::arcs(&d) {
        c.begin_path();
        for (i, p) in points.iter().enumerate() {
            if i == 0 {
                c.move_to(p.x, p.y);
            } else {
                c.line_to(p.x, p.y);
            }
        }
        c.stroke();
    }
    for p in &d.placements {
        let interieure = p.id == "dpad" || p.id == "directional";
        t.pastille(p, !interieure, 3.0);
    }
    c.begin_path();
    let _ = c.arc(d.pivot.x, d.pivot.y, 9.0, 0.0, std::f64::consts::TAU);
    c.fill();
}

/// Un clavier : trois rangées de touches et une barre d'espace.
fn clavier(t: &Toile) {
    let c = &t.ctx;
    t.cadrer(112.0, 46.0);
    let rangees: [(f64, usize); 3] = [(0.0, 10), (4.0, 9), (9.0, 8)];
    for (ligne, (decalage, nombre)) in rangees.iter().enumerate() {
        for i in 0..*nombre {
            c.begin_path();
            let _ = c.round_rect_with_f64(
                2.0 + decalage + i as f64 * 11.0,
                2.0 + ligne as f64 * 11.0,
                9.0,
                9.0,
                2.2,
            );
            c.fill();
        }
    }
    for (x, l) in [
        (2.0, 13.0),
        (17.0, 13.0),
        (32.0, 46.0),
        (80.0, 13.0),
        (95.0, 13.0),
    ] {
        c.begin_path();
        let _ = c.round_rect_with_f64(x, 35.0, l, 9.0, 2.2);
        c.fill();
    }
}

/// Un téléphone qui émet vers un écran d'ordinateur.
fn ondes(t: &Toile) {
    let c = &t.ctx;
    t.cadrer(120.0, 70.0);
    c.set_line_width(4.0);
    c.begin_path();
    let _ = c.round_rect_with_f64(4.0, 14.0, 24.0, 44.0, 6.0);
    c.stroke();
    c.begin_path();
    let _ = c.round_rect_with_f64(76.0, 10.0, 40.0, 30.0, 3.0);
    c.stroke();
    c.begin_path();
    c.move_to(96.0, 40.0);
    c.line_to(96.0, 50.0);
    c.move_to(86.0, 51.0);
    c.line_to(106.0, 51.0);
    c.stroke();
    c.set_line_width(3.2);
    for (i, rayon) in [10.0, 19.0, 28.0].iter().enumerate() {
        c.begin_path();
        let _ = c.arc(36.0, 36.0, *rayon, -0.75, 0.75);
        c.set_global_alpha(1.0 - i as f64 * 0.12);
        c.stroke();
    }
    c.set_global_alpha(1.0);
}

/// L'appareil choisi, sa disposition dedans.
fn appareil(t: &Toile, appareil: Appareil, main: Main) {
    let c = &t.ctx;
    let d = apercu::disposition(appareil, main);
    let e = apercu::ecran(appareil);
    let cadre = apercu::cadre(appareil);
    let b = cadre.bordure;
    t.cadrer(e.cadre.largeur + b * 2.0, e.cadre.hauteur + b * 2.0);
    let _ = c.translate(b, b);
    c.set_line_width(5.0);
    c.begin_path();
    let _ = c.round_rect_with_f64(
        -b + 3.0,
        -b + 3.0,
        e.cadre.largeur + b * 2.0 - 6.0,
        e.cadre.hauteur + b * 2.0 - 6.0,
        cadre.rayon_coque,
    );
    c.stroke();
    if cadre.ile {
        let ile_l = e.cadre.largeur * 0.3;
        let ile_h = ile_l * 0.3;
        c.begin_path();
        let _ = c.round_rect_with_f64(
            (e.cadre.largeur - ile_l) / 2.0,
            ile_h * 0.9,
            ile_l,
            ile_h,
            ile_h / 2.0,
        );
        c.fill();
    }
    c.set_line_width(2.0);
    for points in apercu::arcs(&d) {
        c.begin_path();
        for (i, p) in points.iter().enumerate() {
            if i == 0 {
                c.move_to(p.x, p.y);
            } else {
                c.line_to(p.x, p.y);
            }
        }
        c.stroke();
    }
    for p in &d.placements {
        let interieure = p.id == "dpad" || p.id == "directional";
        t.pastille(p, !interieure, 3.0);
    }
}

/// Toutes les formes du film, dans l'ordre, pour `n` grains chacune.
pub fn film(n: usize, main: Main, appareil_choisi: Appareil) -> Vec<Vec<f32>> {
    let Some(toile) = Toile::nouvelle() else {
        let mut hasard = Hasard::new(7);
        return FILM
            .iter()
            .map(|_| (0..n * 2).map(|_| hasard.suivant() * 2.0 - 1.0).collect())
            .collect();
    };
    FILM.iter()
        .enumerate()
        .map(|(i, forme)| {
            une(
                &toile,
                *forme,
                n,
                main,
                appareil_choisi,
                17 + i as u32 * 7919,
            )
        })
        .collect()
}

/// Une seule forme : sert à redessiner la main ou l'appareil quand le choix
/// change, sans tout recalculer.
pub fn seule(forme: Forme, n: usize, main: Main, appareil_choisi: Appareil) -> Option<Vec<f32>> {
    let toile = Toile::nouvelle()?;
    let i = FILM.iter().position(|f| *f == forme)?;
    Some(une(
        &toile,
        forme,
        n,
        main,
        appareil_choisi,
        17 + i as u32 * 7919,
    ))
}

fn une(
    toile: &Toile,
    forme: Forme,
    n: usize,
    main: Main,
    appareil_choisi: Appareil,
    graine: u32,
) -> Vec<f32> {
    toile.effacer();
    toile.ctx.save();
    match forme {
        Forme::Marque => marque(toile),
        Forme::Main => main_ouverte(toile, main),
        Forme::Manette => manette(toile),
        Forme::Arc => arc(toile, main),
        Forme::Clavier => clavier(toile),
        Forme::Ondes => ondes(toile),
        Forme::Appareil => appareil(toile, appareil_choisi, main),
    }
    toile.ctx.restore();
    toile.echantillonner(n, &mut Hasard::new(graine))
}
