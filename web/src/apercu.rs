//! La disposition montrée en ouverture, et son image fixe.
//!
//! Elle vit hors des composants pour qu'un test puisse la vérifier sans
//! navigateur : ce que la page d'accueil montre a les mêmes garanties que le
//! reste — rien ne se chevauche, rien ne sort du cadre.

use yew::prelude::*;

use crate::consoles::{CAMERA, FACE, SYSTEME, TRANCHES};
use crate::etat::Appareil;
use crate::solveur::{
    point_sur_arc, resoudre, sens, Anneau, Disposition, Main, Options, Point, Taille,
};

pub struct EcranAccueil {
    pub cadre: Taille,
    /// Bande haute réservée à l'interface — et, sur iPhone, à l'île.
    pub bande_haute: f64,
    pub cible: f64,
}

/// Deux écrans, aux proportions de leurs appareils : un iPhone haut et
/// étroit, un iPad plus carré.
pub fn ecran(appareil: Appareil) -> EcranAccueil {
    match appareil {
        Appareil::Ipad => EcranAccueil {
            cadre: Taille {
                largeur: 420.0,
                hauteur: 560.0,
            },
            bande_haute: 104.0,
            cible: 48.0,
        },
        Appareil::Iphone => EcranAccueil {
            cadre: Taille {
                largeur: 300.0,
                hauteur: 650.0,
            },
            bande_haute: 118.0,
            cible: 44.0,
        },
    }
}

pub const MARGE: f64 = 6.0;
/// Un écart un peu plus large que dans la démonstration : vue en petit, une
/// disposition au contact se lit comme une grappe.
pub const ESPACEMENT: f64 = 1.5;

pub fn disposition(appareil: Appareil, main: Main) -> Disposition {
    let e = ecran(appareil);
    let cible = e.cible;
    let mut options = Options::nouvelles(
        main,
        e.cadre,
        cible,
        vec![
            Anneau {
                ids: FACE.to_vec(),
                taille: Taille {
                    largeur: cible,
                    hauteur: cible,
                },
            },
            Anneau {
                ids: CAMERA.to_vec(),
                taille: Taille {
                    largeur: cible * 0.82,
                    hauteur: cible * 0.82,
                },
            },
            Anneau {
                ids: TRANCHES.to_vec(),
                taille: Taille {
                    largeur: cible * 0.82,
                    hauteur: cible * 0.82,
                },
            },
            Anneau {
                ids: SYSTEME.to_vec(),
                taille: Taille {
                    largeur: cible * 0.92,
                    hauteur: cible * 0.45,
                },
            },
        ],
    );
    options.bande_haute = e.bande_haute;
    options.marge = MARGE;
    options.espacement = ESPACEMENT;
    resoudre(&options)
}

/// Où en est une commande sur le balayage du pouce, entre 0 et 1.
pub fn avancement_sur_arc(centre: Point, pivot: Point, ouverture: f64, main: Main) -> f64 {
    let angle = (centre.y - pivot.y).atan2(centre.x - pivot.x);
    ((sens(main) * (angle + std::f64::consts::PI / 2.0)) / ouverture).clamp(0.0, 1.0)
}

/// Les arcs de guide, en segments (assez fins pour paraître courbes).
pub fn arcs(d: &Disposition) -> Vec<Vec<Point>> {
    d.rayons
        .iter()
        .map(|rayon| {
            (0..=32)
                .map(|i| {
                    let angle = -std::f64::consts::PI / 2.0
                        + sens(d.main) * (i as f64 / 32.0) * d.ouverture;
                    point_sur_arc(d.pivot, *rayon, angle)
                })
                .collect()
        })
        .collect()
}

pub struct Cadre {
    pub bordure: f64,
    pub rayon_coque: f64,
    pub rayon_ecran: f64,
    pub ile: bool,
}

pub fn cadre(appareil: Appareil) -> Cadre {
    match appareil {
        Appareil::Ipad => Cadre {
            bordure: 14.0,
            rayon_coque: 30.0,
            rayon_ecran: 16.0,
            ile: false,
        },
        Appareil::Iphone => Cadre {
            bordure: 11.0,
            rayon_coque: 56.0,
            rayon_ecran: 44.0,
            ile: true,
        },
    }
}

#[derive(Properties, PartialEq)]
pub struct ApercuProps {
    pub appareil: Appareil,
    pub main: Main,
    pub etiquette: AttrValue,
    #[prop_or_default]
    pub class: Classes,
}

/// L'appareil et sa disposition, à plat et immobiles : ce qu'on voit quand
/// les animations sont coupées ou que le WebGL manque. Même sujet que la
/// scène de grains, sans le mouvement.
#[component]
pub fn Apercu(props: &ApercuProps) -> Html {
    let d = disposition(props.appareil, props.main);
    let e = ecran(props.appareil);
    let c = cadre(props.appareil);
    let (l, h, b) = (e.cadre.largeur, e.cadre.hauteur, c.bordure);
    let ile_l = l * 0.3;
    let ile_h = ile_l * 0.3;
    let traces: Vec<String> = arcs(&d)
        .iter()
        .map(|points| {
            let corps: Vec<String> = points
                .iter()
                .map(|p| format!("{:.1} {:.1}", p.x, p.y))
                .collect();
            format!("M {}", corps.join(" L "))
        })
        .collect();

    html! {
        <svg class={props.class.clone()} viewBox={format!("{} {} {} {}", -b, -b, l + b * 2.0, h + b * 2.0)}
            role="img" aria-label={props.etiquette.clone()}
            data-appareil-rendu={props.appareil.code()} data-main-rendu={props.main.code()}>
            <defs>
                <linearGradient id="argent-accueil" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#f6f8fb" />
                    <stop offset="30%" stop-color="#c3c9d4" />
                    <stop offset="55%" stop-color="#eef1f5" />
                    <stop offset="80%" stop-color="#a4acba" />
                    <stop offset="100%" stop-color="#dde2e9" />
                </linearGradient>
            </defs>
            <rect x={(-b + 1.0).to_string()} y={(-b + 1.0).to_string()} width={(l + b * 2.0 - 2.0).to_string()}
                height={(h + b * 2.0 - 2.0).to_string()} rx={c.rayon_coque.to_string()}
                fill="url(#argent-accueil)" stroke="rgba(255, 255, 255, 0.5)" stroke-width="1.5" />
            <rect x="0" y="0" width={l.to_string()} height={h.to_string()} rx={c.rayon_ecran.to_string()} fill="var(--screen-bg)" />
            if c.ile {
                <rect x={((l - ile_l) / 2.0).to_string()} y={(ile_h * 0.9).to_string()} width={ile_l.to_string()}
                    height={ile_h.to_string()} rx={(ile_h / 2.0).to_string()} fill="#000" />
            }
            <g stroke="var(--accent)" fill="none" stroke-width="1.5">
                { for traces.iter().enumerate().map(|(i, t)| html! {
                    <path d={t.clone()} opacity={format!("{:.2}", 0.4 - i as f64 * 0.07)} />
                }) }
            </g>
            <circle cx={d.pivot.x.to_string()} cy={d.pivot.y.to_string()} r="30" fill="var(--warn)" opacity="0.14" />
            <circle cx={d.pivot.x.to_string()} cy={d.pivot.y.to_string()} r="6" fill="var(--warn)" />
            { for d.placements.iter().map(|p| {
                let systeme = SYSTEME.contains(&p.id);
                let croix = p.id == "dpad";
                let zone = croix || p.id == "directional";
                let premier = avancement_sur_arc(p.centre, d.pivot, d.ouverture, d.main) < 0.05;
                let petit = p.taille.largeur.min(p.taille.hauteur);
                html! {
                    <rect class="commande" x={format!("{:.2}", p.centre.x - p.taille.largeur / 2.0)}
                        y={format!("{:.2}", p.centre.y - p.taille.hauteur / 2.0)}
                        width={format!("{:.2}", p.taille.largeur)} height={format!("{:.2}", p.taille.hauteur)}
                        rx={format!("{:.2}", if croix { petit / 4.0 } else { petit / 2.0 })}
                        fill={if systeme { "var(--warn)" } else { "var(--accent)" }}
                        opacity={if zone { "0.28" } else if premier { "0.95" } else { "0.6" }} />
                }
            }) }
        </svg>
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::solveur::se_chevauchent;

    #[test]
    fn la_disposition_d_accueil_tient_et_ne_se_chevauche_pas() {
        for appareil in Appareil::TOUS {
            for main in [Main::Gauche, Main::Droite] {
                let d = disposition(appareil, main);
                let e = ecran(appareil);
                assert!(d.chevauchements.is_empty());
                for (i, a) in d.placements.iter().enumerate() {
                    for b in &d.placements[i + 1..] {
                        assert!(!se_chevauchent(a, b), "{} {}", a.id, b.id);
                    }
                    assert!(a.centre.x - a.taille.largeur / 2.0 >= -0.5);
                    assert!(a.centre.x + a.taille.largeur / 2.0 <= e.cadre.largeur + 0.5);
                    assert!(a.centre.y - a.taille.hauteur / 2.0 >= e.bande_haute - 0.5);
                    assert!(a.centre.y + a.taille.hauteur / 2.0 <= e.cadre.hauteur + 0.5);
                }
            }
        }
    }

    #[test]
    fn la_main_gauche_est_le_miroir_de_la_droite() {
        let droite = disposition(Appareil::Iphone, Main::Droite);
        let gauche = disposition(Appareil::Iphone, Main::Gauche);
        let l = ecran(Appareil::Iphone).cadre.largeur;
        for (a, b) in droite.placements.iter().zip(&gauche.placements) {
            assert!((l - a.centre.x - b.centre.x).abs() < 1.5);
        }
    }

    #[test]
    fn l_avancement_va_de_zero_a_un_le_long_de_l_arc() {
        let d = disposition(Appareil::Ipad, Main::Droite);
        for p in &d.placements {
            let t = avancement_sur_arc(p.centre, d.pivot, d.ouverture, d.main);
            assert!((0.0..=1.0).contains(&t));
        }
    }
}
