//! La démonstration interactive de la disposition adaptative.
//!
//! Le visiteur bascule la main, écarte les commandes, change de console,
//! passe en disposition libre et déplace chaque bouton : le même solveur que
//! l'application recalcule tout. Ce n'est pas un habillage, ce sont de vraies
//! règles de placement.

use std::collections::{BTreeMap, BTreeSet};
use std::rc::Rc;

use gloo_timers::callback::Timeout;
use yew::prelude::*;

use super::commun::{segmente, TeteSection};
use crate::consoles::{Profil, CAMERA, FACE, PROFILS, SYSTEME, TRANCHES};
use crate::etat::{use_etat, Action, Appareil};
use crate::solveur::{
    chemin_arc, recadrer, resoudre, Activation, Anneau, ModeDisposition, Options, Placement, Point,
    Preference, Preferences, Taille, CIBLE_MAX, CIBLE_MIN, ESPACEMENT_MAX, INTERIEURES,
    STICK_CAMERA,
};

/// Les écrans sont mesurés en vrais points — ceux d'un iPad 9,7 pouces et
/// d'un iPhone 15 — pour que « 100 pt » veuille dire quelque chose. `chrome`
/// agrandit ce qui n'est pas une commande (bandeau, île, pivot) pour qu'il
/// garde à l'écran la taille qu'il avait.
struct Ecran {
    cadre: Taille,
    bande_haute: f64,
    chrome: f64,
}

fn ecran(appareil: Appareil) -> Ecran {
    match appareil {
        Appareil::Ipad => Ecran {
            cadre: Taille {
                largeur: 768.0,
                hauteur: 1024.0,
            },
            bande_haute: 124.0,
            chrome: 1.7,
        },
        Appareil::Iphone => Ecran {
            cadre: Taille {
                largeur: 393.0,
                hauteur: 852.0,
            },
            bande_haute: 118.0,
            chrome: 393.0 / 320.0,
        },
    }
}

const MARGE: f64 = 6.0;
const BRANCHES: [&str; 4] = ["dpadUp", "dpadRight", "dpadDown", "dpadLeft"];

fn anneaux(profil: &Profil, cible: f64) -> Vec<Anneau> {
    let mut anneaux = vec![Anneau {
        ids: FACE.to_vec(),
        taille: Taille {
            largeur: cible,
            hauteur: cible,
        },
    }];
    // L'arc de vision, juste après les boutons de façade.
    if profil.a_camera() {
        anneaux.push(Anneau {
            ids: CAMERA.to_vec(),
            taille: Taille {
                largeur: cible * 0.82,
                hauteur: cible * 0.82,
            },
        });
    }
    anneaux.push(Anneau {
        ids: TRANCHES.to_vec(),
        taille: Taille {
            largeur: cible * 0.82,
            hauteur: cible * 0.82,
        },
    });
    anneaux.push(Anneau {
        ids: SYSTEME
            .iter()
            .copied()
            .filter(|id| !profil.omis.contains(id))
            .collect(),
        taille: Taille {
            largeur: cible * 0.92,
            hauteur: cible * 0.45,
        },
    });
    anneaux
}

/// Une préférence revenue à son état neutre n'a pas à être gardée. Le
/// stick caméra est masqué d'origine : c'est son état neutre.
fn neutre(id: &str, p: &Preference) -> bool {
    p.masquee == (id == STICK_CAMERA)
        && !p.verrouillee
        && p.position_libre.is_none()
        && p.activation.is_none()
        && p.echelle.map(|e| (e - 1.0).abs() < 0.001).unwrap_or(true)
}

fn defaut(id: &str) -> Preference {
    Preference {
        masquee: id == STICK_CAMERA,
        ..Default::default()
    }
}

#[derive(Clone, PartialEq)]
struct Glisse {
    id: &'static str,
    centre: Point,
    bouge: bool,
}

#[derive(Clone, PartialEq, Default)]
struct Reglages {
    commun: Preferences,
    /// Les consoles qui ont leur propre disposition.
    propres: BTreeMap<&'static str, Preferences>,
}

#[component]
pub fn Demo() -> Html {
    let etat = use_etat();
    let d = etat.dico();
    let main = etat.main;
    let appareil = etat.appareil;
    // 100 points : la taille par défaut de l'application.
    let cible = use_state(|| 100.0_f64);
    let espacement = use_state(|| 1.35_f64);
    let mode = use_state(|| Activation::Verrou);
    let disposition_mode = use_state(|| ModeDisposition::Arc);
    let reglages = use_state(Reglages::default);
    let index_console = use_state(|| 0usize);
    let actifs = use_state(BTreeSet::<String>::new);
    let en_attente = use_state(|| None::<String>);
    let edition = use_state(|| false);
    let selection = use_state(BTreeSet::<&'static str>::new);
    let glisse = use_state(|| None::<Glisse>);
    let svg = use_node_ref();
    let minuteries = use_mut_ref(Vec::<Timeout>::new);

    let profil = &PROFILS[*index_console];
    let camera = profil.a_camera();
    let propre = reglages.propres.contains_key(profil.id);
    let stockees = reglages
        .propres
        .get(profil.id)
        .unwrap_or(&reglages.commun)
        .clone();
    // Le stick caméra est masqué tant qu'on ne l'a pas demandé.
    let preferences: Rc<Preferences> = {
        let mut p = stockees;
        if camera && !p.contains_key(STICK_CAMERA) {
            p.insert(STICK_CAMERA.into(), defaut(STICK_CAMERA));
        }
        Rc::new(p)
    };
    let e = ecran(appareil);
    let k = e.chrome;

    let disposition = {
        let mut options = Options::nouvelles(main, e.cadre, *cible, anneaux(profil, *cible));
        options.bande_haute = e.bande_haute;
        options.marge = MARGE;
        options.espacement = *espacement;
        options.mode = *disposition_mode;
        options.preferences = Some(&preferences);
        options.interieures = if camera {
            vec![INTERIEURES[0], INTERIEURES[1], STICK_CAMERA]
        } else {
            INTERIEURES.to_vec()
        };
        resoudre(&options)
    };
    let tenue = disposition.cible.round();
    let espacement_tenu = disposition.espacement;

    let pref = |id: &str| preferences.get(id).copied().unwrap_or_else(|| defaut(id));

    let masquees: Vec<&'static str> = {
        let mut ids: Vec<&'static str> = vec!["directional", "dpad"];
        if camera {
            ids.push(STICK_CAMERA);
        }
        ids.extend(FACE);
        if camera {
            ids.extend(CAMERA);
        }
        ids.extend(TRANCHES);
        ids.extend(
            SYSTEME
                .iter()
                .copied()
                .filter(|id| !profil.omis.contains(id)),
        );
        ids.into_iter().filter(|id| pref(id).masquee).collect()
    };

    // Modifie les préférences de la console affichée (ou communes).
    let modifier = {
        let reglages = reglages.clone();
        let profil_id = profil.id;
        Rc::new(
            move |ids: Vec<&'static str>, changement: Rc<dyn Fn(Preference) -> Preference>| {
                let mut r = (*reglages).clone();
                let cible = if r.propres.contains_key(profil_id) {
                    r.propres.get_mut(profil_id).unwrap()
                } else {
                    &mut r.commun
                };
                for id in ids {
                    let actuelle = cible.get(id).copied().unwrap_or_else(|| defaut(id));
                    let suivante = changement(actuelle);
                    if neutre(id, &suivante) {
                        cible.remove(id);
                    } else {
                        cible.insert(id.to_string(), suivante);
                    }
                }
                reglages.set(r);
            },
        )
    };

    let basculer_selection = {
        let selection = selection.clone();
        Rc::new(move |id: &'static str| {
            let mut s = (*selection).clone();
            if !s.remove(id) {
                s.insert(id);
            }
            selection.set(s);
        })
    };

    let appuyer = {
        let actifs = actifs.clone();
        let en_attente = en_attente.clone();
        let mode = *mode;
        let preferences = preferences.clone();
        let minuteries = minuteries.clone();
        Rc::new(move |id: String| {
            // La croix et l'arc de vision restent en appui direct, comme dans
            // l'application : verrouillés, ils tourneraient sans fin.
            let direction = id.starts_with("dpad") || id.starts_with("look");
            let activation = if direction {
                Activation::Direct
            } else {
                preferences
                    .get(&id)
                    .and_then(|p| p.activation)
                    .unwrap_or(mode)
            };
            match activation {
                Activation::Verrou => {
                    let mut a = (*actifs).clone();
                    if !a.remove(&id) {
                        a.insert(id);
                    }
                    actifs.set(a);
                }
                Activation::Survol => {
                    en_attente.set(Some(id.clone()));
                    let (actifs, en_attente, minuteries_internes) =
                        (actifs.clone(), en_attente.clone(), minuteries.clone());
                    minuteries.borrow_mut().push(Timeout::new(450, move || {
                        en_attente.set(None);
                        let mut a = (*actifs).clone();
                        a.insert(id.clone());
                        actifs.set(a.clone());
                        let actifs = actifs.clone();
                        minuteries_internes
                            .borrow_mut()
                            .push(Timeout::new(420, move || {
                                let mut a = (*actifs).clone();
                                a.remove(&id);
                                actifs.set(a);
                            }));
                    }));
                }
                Activation::Direct => {
                    let mut a = (*actifs).clone();
                    a.insert(id.clone());
                    actifs.set(a);
                    let actifs = actifs.clone();
                    minuteries.borrow_mut().push(Timeout::new(320, move || {
                        let mut a = (*actifs).clone();
                        a.remove(&id);
                        actifs.set(a);
                    }));
                }
            }
            let mut m = minuteries.borrow_mut();
            if m.len() > 24 {
                m.drain(..12);
            }
        })
    };

    // Coordonnées du pointeur dans le repère du dessin.
    let vers_dessin = {
        let svg = svg.clone();
        let cadre = e.cadre;
        Rc::new(move |x: i32, y: i32| -> Option<Point> {
            let rect = svg.cast::<web_sys::Element>()?.get_bounding_client_rect();
            Some(Point {
                x: (x as f64 - rect.left()) / rect.width() * cadre.largeur,
                y: (y as f64 - rect.top()) / rect.height() * cadre.hauteur,
            })
        })
    };
    let recadre = {
        let cadre = e.cadre;
        let bande = e.bande_haute;
        move |p: Point, placement: &Placement| recadrer(p, placement.taille, cadre, MARGE, bande)
    };

    let mode_actuel = d.demo.modes.iter().find(|m| m.id == mode.code());
    let main_etiquette = match main {
        crate::solveur::Main::Droite => &d.demo.hand_right,
        crate::solveur::Main::Gauche => &d.demo.hand_left,
    };
    let selectionnes: Vec<&'static str> = selection.iter().copied().collect();
    let etiquette_appareil = if appareil == Appareil::Ipad {
        &d.demo.device.ipad
    } else {
        &d.demo.device.iphone
    };
    let ecran_etiquette = format!(
        "{} · {}",
        etiquette_appareil,
        crate::i18n::remplir(
            &d.demo.screen_label,
            &[("console", profil.nom), ("hand", main_etiquette)]
        )
    );

    // Les commandes, dessinées.
    let commandes = disposition.placements.iter().map(|placement| {
        let id = placement.id;
        let centre = match &*glisse {
            Some(g) if g.id == id => g.centre,
            _ => placement.centre,
        };
        let p = pref(id);
        let branches: Vec<&str> = if id == "dpad" { BRANCHES.iter().copied().filter(|b| actifs.contains(*b)).collect() } else { vec![] };
        let est_actif = actifs.contains(id);
        let enfonce = if id == "dpad" { !branches.is_empty() } else { est_actif };
        let glyphe = profil.glyphe(id);
        let nom = d.nom_commande(id).to_string();
        let etiquette = if glyphe.is_empty() { nom } else { format!("{nom}, {glyphe}") };
        let placement_c = placement.clone();

        let au_pointeur_bas = {
            let edition = *edition;
            let libre = *disposition_mode == ModeDisposition::Libre;
            let verrouillee = p.verrouillee;
            let glisse = glisse.clone();
            let vers_dessin = vers_dessin.clone();
            let appuyer = appuyer.clone();
            let placement = placement_c.clone();
            Callback::from(move |evenement: PointerEvent| {
                if edition {
                    // Une commande verrouillée ne se déplace pas : c'est tout
                    // l'intérêt.
                    if !libre || verrouillee {
                        return;
                    }
                    let Some(point) = vers_dessin(evenement.client_x(), evenement.client_y()) else { return };
                    if let Some(cible) = evenement.target_dyn_into::<web_sys::Element>() {
                        let _ = cible.set_pointer_capture(evenement.pointer_id());
                    }
                    glisse.set(Some(Glisse { id: placement.id, centre: recadre(point, &placement), bouge: false }));
                } else if placement.id == "dpad" {
                    // La branche sous le doigt : la direction dominante depuis
                    // le centre. Toute la croix est une cible.
                    let branche = vers_dessin(evenement.client_x(), evenement.client_y())
                        .map(|point| {
                            let dx = point.x - placement.centre.x;
                            let dy = point.y - placement.centre.y;
                            if dx.abs() > dy.abs() {
                                if dx > 0.0 { "dpadRight" } else { "dpadLeft" }
                            } else if dy > 0.0 {
                                "dpadDown"
                            } else {
                                "dpadUp"
                            }
                        })
                        .unwrap_or("dpadUp");
                    appuyer(branche.to_string());
                } else {
                    appuyer(placement.id.to_string());
                }
            })
        };
        let au_deplacement = {
            let glisse = glisse.clone();
            let vers_dessin = vers_dessin.clone();
            let placement = placement_c.clone();
            Callback::from(move |evenement: PointerEvent| {
                let Some(g) = &*glisse else { return };
                if g.id != placement.id {
                    return;
                }
                let Some(point) = vers_dessin(evenement.client_x(), evenement.client_y()) else { return };
                glisse.set(Some(Glisse { id: g.id, centre: recadre(point, &placement), bouge: true }));
            })
        };
        let au_relachement = {
            let edition = *edition;
            let glisse = glisse.clone();
            let modifier = modifier.clone();
            let basculer_selection = basculer_selection.clone();
            let cadre = e.cadre;
            Callback::from(move |_: PointerEvent| {
                if !edition {
                    return;
                }
                // Un glissement place la commande ; un simple appui la
                // sélectionne. Les confondre rendrait le panneau incontrôlable.
                let deplacee = match &*glisse {
                    Some(g) if g.id == id && g.bouge => {
                        let fraction = Point { x: g.centre.x / cadre.largeur, y: g.centre.y / cadre.hauteur };
                        modifier(vec![id], Rc::new(move |mut p| {
                            p.position_libre = Some(fraction);
                            p
                        }));
                        true
                    }
                    _ => false,
                };
                glisse.set(None);
                if !deplacee {
                    basculer_selection(id);
                }
            })
        };
        let au_clavier = {
            let edition = *edition;
            let appuyer = appuyer.clone();
            let basculer_selection = basculer_selection.clone();
            Callback::from(move |evenement: KeyboardEvent| {
                // Au clavier, les flèches actionnent les branches de la croix.
                let branche = match evenement.key().as_str() {
                    "ArrowUp" => Some("dpadUp"),
                    "ArrowDown" => Some("dpadDown"),
                    "ArrowLeft" => Some("dpadLeft"),
                    "ArrowRight" => Some("dpadRight"),
                    _ => None,
                };
                if id == "dpad" && !edition {
                    if let Some(b) = branche {
                        evenement.prevent_default();
                        appuyer(b.to_string());
                        return;
                    }
                }
                if evenement.key() == "Enter" || evenement.key() == " " {
                    evenement.prevent_default();
                    if edition {
                        basculer_selection(id);
                    } else {
                        appuyer(id.to_string());
                    }
                }
            })
        };

        let taille = placement.taille;
        let pastille = (taille.largeur - taille.hauteur).abs() > 0.5;
        let directionnelle = id == "directional" || id == STICK_CAMERA;
        let croix = id == "dpad";
        let classes = classes!(
            "control",
            est_actif.then_some("is-active"),
            (en_attente.as_deref() == Some(id)).then_some("is-pending"),
            edition.then_some("is-editing"),
            selection.contains(id).then_some("is-selected"),
            p.verrouillee.then_some("is-locked"),
            glisse.as_ref().map(|g| g.id == id).unwrap_or(false).then_some("is-dragged"),
            disposition.chevauchements.contains(&id).then_some("is-overlapping")
        );
        let taille_glyphe = if pastille {
            taille.hauteur * 0.5
        } else {
            taille.largeur * if id.starts_with("look") { 0.5 } else { 0.34 }
        };
        html! {
            <g key={id} transform={format!("translate({:.3} {:.3})", centre.x, centre.y)} class={classes}
                onpointerdown={au_pointeur_bas} onpointermove={au_deplacement} onpointerup={au_relachement}
                onkeydown={au_clavier} role="button" tabindex="0" data-control={id}
                aria-label={etiquette} aria-pressed={enfonce.to_string()}
                data-profil={profil.id}>
                if pastille {
                    <rect x={format!("{:.2}", -taille.largeur / 2.0)} y={format!("{:.2}", -taille.hauteur / 2.0)}
                        width={format!("{:.2}", taille.largeur)} height={format!("{:.2}", taille.hauteur)}
                        rx={format!("{:.2}", taille.hauteur / 2.0)} class="control-shape" filter="url(#ombre-commande)" />
                } else {
                    <circle cx="0" cy="0" r={format!("{:.2}", taille.largeur / 2.0)} class="control-shape" filter="url(#ombre-commande)" />
                }
                if directionnelle {
                    <circle cx="0" cy="0" r={format!("{:.2}", taille.largeur * 0.22)} class="stick-knob" />
                    <path d={{
                        let s = taille.largeur * 0.17;
                        format!("M {:.2} 0 H {:.2} M 0 {:.2} V {:.2}", -s, s, -s, s)
                    }} class="stick-cross" />
                }
                if croix { { branches_croix(taille.largeur, &branches) } }
                if !directionnelle && !croix {
                    <text x="0" y="0" class="control-glyph" text-anchor="middle" dominant-baseline="central"
                        font-size={format!("{:.2}", taille_glyphe)}>{ glyphe }</text>
                }
                if p.verrouillee && *edition {
                    <text x={format!("{:.2}", -taille.largeur / 2.0 + 6.0 * k)} y={format!("{:.2}", taille.hauteur / 2.0 - 4.0 * k)}
                        class="control-lock" font-size={format!("{:.2}", 13.0 * k)}>{ "🔒" }</text>
                }
            </g>
        }
    });

    // Les commandes masquées, rangées en bas de l'écran pendant l'édition :
    // on ne peut pas réafficher ce qu'on ne voit plus.
    let pastilles_masquees = masquees.iter().enumerate().map(|(index, id)| {
        let id = *id;
        let total = masquees.len() as f64;
        let ecart = 10.0 * k;
        let cote = (34.0 * k).min((e.cadre.largeur - 2.0 * ecart - (total - 1.0) * ecart) / total);
        let largeur = total * cote + (total - 1.0) * ecart;
        let x = (e.cadre.largeur - largeur) / 2.0 + index as f64 * (cote + ecart) + cote / 2.0;
        let y = e.cadre.hauteur - cote / 2.0 - ecart;
        let glyphe = profil.glyphe(id);
        let choisir = {
            let basculer_selection = basculer_selection.clone();
            Callback::from(move |_: PointerEvent| basculer_selection(id))
        };
        let au_clavier = {
            let basculer_selection = basculer_selection.clone();
            Callback::from(move |evenement: KeyboardEvent| {
                if evenement.key() == "Enter" || evenement.key() == " " {
                    evenement.prevent_default();
                    basculer_selection(id);
                }
            })
        };
        html! {
            <g key={format!("masquee-{id}")} class={classes!("control", "is-hidden-control", selection.contains(id).then_some("is-selected"))}
                role="button" tabindex="0" data-hidden-control={id}
                aria-label={format!("{}, {}", d.nom_commande(id), glyphe)} onpointerdown={choisir} onkeydown={au_clavier}>
                <circle cx={format!("{x:.2}")} cy={format!("{y:.2}")} r={format!("{:.2}", cote / 2.0)} class="control-shape" />
                <text x={format!("{x:.2}")} y={format!("{y:.2}")} class="control-glyph" text-anchor="middle"
                    dominant-baseline="central" font-size={format!("{:.2}", cote * 0.34)}>
                    { if glyphe.is_empty() { "·" } else { glyphe } }
                </text>
                <title>{ id }</title>
            </g>
        }
    });

    let choisir_appareil = {
        let etat = etat.clone();
        Callback::from(move |a| etat.dispatch(Action::Appareil(a)))
    };
    let choisir_main = {
        let etat = etat.clone();
        Callback::from(move |m| etat.dispatch(Action::Main(m)))
    };
    let choisir_disposition = {
        let disposition_mode = disposition_mode.clone();
        let edition = edition.clone();
        Callback::from(move |m: ModeDisposition| {
            disposition_mode.set(m);
            if m == ModeDisposition::Libre {
                edition.set(true);
            }
        })
    };
    let choisir_mode = {
        let mode = mode.clone();
        let actifs = actifs.clone();
        Callback::from(move |m: Activation| {
            mode.set(m);
            actifs.set(BTreeSet::new());
        })
    };
    let basculer_edition = {
        let edition = edition.clone();
        let selection = selection.clone();
        Callback::from(move |_| {
            edition.set(!*edition);
            selection.set(BTreeSet::new());
        })
    };
    let tout_replacer = {
        let modifier = modifier.clone();
        let ids: Vec<&'static str> = disposition.placements.iter().map(|p| p.id).collect();
        Callback::from(move |_| {
            modifier(
                ids.clone(),
                Rc::new(|mut p| {
                    p.position_libre = None;
                    p
                }),
            )
        })
    };
    let basculer_propre = {
        let reglages = reglages.clone();
        let profil_id = profil.id;
        Callback::from(move |_| {
            let mut r = (*reglages).clone();
            if r.propres.remove(profil_id).is_none() {
                r.propres.insert(profil_id, r.commun.clone());
            }
            reglages.set(r);
        })
    };
    let changer_cible = {
        let cible = cible.clone();
        Callback::from(move |evenement: InputEvent| {
            if let Some(champ) = evenement.target_dyn_into::<web_sys::HtmlInputElement>() {
                if let Ok(v) = champ.value().parse::<f64>() {
                    cible.set(v);
                }
            }
        })
    };
    let changer_espacement = {
        let espacement = espacement.clone();
        Callback::from(move |evenement: InputEvent| {
            if let Some(champ) = evenement.target_dyn_into::<web_sys::HtmlInputElement>() {
                if let Ok(v) = champ.value().parse::<f64>() {
                    espacement.set(v);
                }
            }
        })
    };
    let tout_relacher = {
        let actifs = actifs.clone();
        Callback::from(move |_| actifs.set(BTreeSet::new()))
    };

    let modes: Vec<(Activation, String)> = d
        .demo
        .modes
        .iter()
        .filter_map(|m| Activation::depuis_code(&m.id).map(|a| (a, m.label.clone())))
        .collect();
    let appareils = vec![
        (Appareil::Ipad, d.demo.device.ipad.clone()),
        (Appareil::Iphone, d.demo.device.iphone.clone()),
    ];
    let mains = vec![
        (crate::solveur::Main::Gauche, d.demo.hand_left.clone()),
        (crate::solveur::Main::Droite, d.demo.hand_right.clone()),
    ];
    let dispositions = vec![
        (ModeDisposition::Arc, d.demo.layout.arc.clone()),
        (ModeDisposition::Libre, d.demo.layout.free.clone()),
    ];
    let libre = *disposition_mode == ModeDisposition::Libre;

    html! {
        <section class="section demo" id="demo" aria-labelledby="demo-titre">
            <TeteSection numero="01" sur_titre={d.demo.eyebrow.clone()} titre={d.demo.title.clone()}
                id_titre="demo-titre" chapeau={d.demo.lede.clone()} />

            <div class="demo-grid">
                <div class={classes!("phone", if appareil == Appareil::Ipad { "is-ipad" } else { "is-iphone" })}
                    data-device={appareil.code()} role="img" aria-label={ecran_etiquette} data-reveler="">
                    <svg ref={svg} viewBox={format!("0 0 {} {}", e.cadre.largeur, e.cadre.hauteur)}
                        class={classes!("phone-screen", edition.then_some("is-editing"))}>
                        <defs>
                            <radialGradient id="halo" cx="50%" cy="50%">
                                <stop offset="0%" stop-color={profil.teinte} stop-opacity="0.28" />
                                <stop offset="100%" stop-color={profil.teinte} stop-opacity="0" />
                            </radialGradient>
                            // L'ombre en filtre SVG, pas en `filter` CSS : Safari ne
                            // peint pas un drop-shadow CSS sur un élément de dessin.
                            <filter id="ombre-commande" x="-50%" y="-50%" width="200%" height="200%">
                                <feDropShadow dx="0" dy="3" stdDeviation="4.5" flood-color={profil.teinte} flood-opacity="0.5" />
                            </filter>
                        </defs>
                        <circle cx={disposition.pivot.x.to_string()} cy={disposition.pivot.y.to_string()}
                            r={(e.cadre.largeur * 0.55).to_string()} fill="url(#halo)" />
                        if !libre {
                            { for disposition.rayons.iter().enumerate().map(|(i, r)| html! {
                                <path key={format!("arc-{i}")} d={chemin_arc(disposition.pivot, *r, disposition.main, disposition.ouverture)} class="reach-arc" />
                            }) }
                            <circle cx={disposition.pivot.x.to_string()} cy={disposition.pivot.y.to_string()} r={(7.0 * k).to_string()} class="pivot" />
                        }
                        if appareil == Appareil::Iphone {
                            <rect class="phone-island" x={((e.cadre.largeur - 96.0 * k) / 2.0).to_string()} y={(12.0 * k).to_string()}
                                width={(96.0 * k).to_string()} height={(26.0 * k).to_string()} rx={(13.0 * k).to_string()} />
                        }
                        <g class="screen-status" aria-hidden="true"
                            transform={format!("scale({k}){}", if appareil == Appareil::Iphone { " translate(0 22)" } else { "" })}>
                            <rect x="14" y="22" width={(e.cadre.largeur / k - 28.0).to_string()} height="46" rx="14" />
                            <circle cx="34" cy="45" r="5" fill={profil.teinte} />
                            <text x="50" y="39" class="status-title">{ profil.nom }</text>
                            <text x="50" y="56" class="status-detail">
                                { format!("{} · {}", d.demo.connected, mode_actuel.map(|m| m.label.to_lowercase()).unwrap_or_default()) }
                            </text>
                            if !actifs.is_empty() {
                                <rect x={(e.cadre.largeur / k - 96.0).to_string()} y="32" width="74" height="26" rx="13" class="status-badge" />
                                <text x={(e.cadre.largeur / k - 59.0).to_string()} y="46" class="status-badge-text">{ d.demo.active.n(actifs.len()) }</text>
                            }
                        </g>
                        { for commandes }
                        if *edition { { for pastilles_masquees } }
                    </svg>
                </div>

                <div class="demo-controls">
                    <fieldset class="control-block">
                        <legend>{ &d.demo.device.label }</legend>
                        { segmente(&appareils, appareil, "", choisir_appareil) }
                        <p class="hint">{ &d.demo.device.hint }</p>
                    </fieldset>

                    <fieldset class="control-block">
                        <legend>{ &d.demo.layout.label }</legend>
                        { segmente(&dispositions, *disposition_mode, "segmented-wrap", choisir_disposition) }
                        <p class="hint">{ if libre { &d.demo.layout.free_detail } else { &d.demo.layout.arc_detail } }</p>
                        <div class="edit-row">
                            <button type="button" class={classes!("chip", edition.then_some("is-active"))}
                                aria-pressed={edition.to_string()} onclick={basculer_edition}>
                                { if *edition { &d.demo.edit.done } else { &d.demo.edit.start } }
                            </button>
                            if *edition && libre {
                                <button type="button" class="chip" onclick={tout_replacer}>{ &d.demo.edit.reset_positions }</button>
                            }
                        </div>
                        <div class="edit-row">
                            <button type="button" class={classes!("chip", propre.then_some("is-active"))}
                                aria-pressed={propre.to_string()} onclick={basculer_propre}>
                                { crate::i18n::remplir(&d.demo.own_layout.label, &[("console", profil.nom)]) }
                            </button>
                        </div>
                        <p class="hint">{ if propre { &d.demo.own_layout.on } else { &d.demo.own_layout.off } }</p>
                        if *edition {
                            <p class={classes!("hint", (!disposition.chevauchements.is_empty()).then_some("is-warning"))}>
                                { if !disposition.chevauchements.is_empty() {
                                    d.demo.edit.overlap.n(disposition.chevauchements.len())
                                } else if libre { d.demo.edit.hint_free.clone() } else { d.demo.edit.hint.clone() } }
                            </p>
                        }
                    </fieldset>

                    if *edition && !selectionnes.is_empty() {
                        <PanneauCommande ids={selectionnes.clone()} preferences={preferences.clone()} libre={libre}
                            modifier={Callback::from({
                                let modifier = modifier.clone();
                                let ids = selectionnes.clone();
                                move |changement: Rc<dyn Fn(Preference) -> Preference>| modifier(ids.clone(), changement)
                            })}
                            fermer={Callback::from({
                                let selection = selection.clone();
                                move |_| selection.set(BTreeSet::new())
                            })} />
                    }

                    <fieldset class="control-block">
                        <legend>{ &d.demo.hand }</legend>
                        { segmente(&mains, main, "", choisir_main) }
                    </fieldset>

                    // Les curseurs affichent ce qui est demandé, et ce que
                    // l'écran tient quand il ne peut pas suivre : « 100 → 84 pt ».
                    <fieldset class="control-block">
                        <legend>
                            { format!("{} ", d.demo.target_size) }
                            <span class="value" data-valeur="cible" data-demande={cible.to_string()} data-tenue={tenue.to_string()}>
                                { if tenue < *cible { format!("{} → {} {}", *cible, tenue, d.demo.unit) } else { format!("{} {}", *cible, d.demo.unit) } }
                            </span>
                        </legend>
                        <input type="range" min={CIBLE_MIN.to_string()} max={CIBLE_MAX.to_string()} step="2"
                            value={cible.to_string()} oninput={changer_cible}
                            aria-label={d.demo.target_size.clone()} aria-valuetext={format!("{} {}", *cible, d.demo.unit)} />
                        if tenue < *cible { <p class="hint">{ &d.demo.downscaled }</p> }
                    </fieldset>

                    <fieldset class="control-block">
                        <legend>
                            { format!("{} ", d.demo.spacing) }
                            <span class="value" data-valeur="espacement" data-demande={espacement.to_string()} data-tenue={espacement_tenu.to_string()}>
                                { if espacement_tenu < *espacement - 0.005 {
                                    format!("×{:.2} → ×{:.2}", *espacement, espacement_tenu)
                                } else { format!("×{:.2}", *espacement) } }
                            </span>
                        </legend>
                        <input type="range" min="1.1" max={ESPACEMENT_MAX.to_string()} step="0.05"
                            value={espacement.to_string()} oninput={changer_espacement}
                            aria-label={d.demo.spacing.clone()} aria-valuetext={format!("×{:.2}", *espacement)} />
                        <p class="hint">{ if espacement_tenu < *espacement - 0.005 { &d.demo.tightened } else { &d.demo.spacing_hint } }</p>
                    </fieldset>

                    <fieldset class="control-block">
                        <legend>{ &d.demo.activation }</legend>
                        { segmente(&modes, *mode, "segmented-wrap", choisir_mode) }
                        <p class="hint">{ mode_actuel.map(|m| m.detail.clone()).unwrap_or_default() }</p>
                    </fieldset>

                    <fieldset class="control-block">
                        <legend>{ &d.demo.console }</legend>
                        <div class="chip-row">
                            { for PROFILS.iter().enumerate().map(|(i, p)| {
                                let index_console = index_console.clone();
                                let actif = i == *index_console;
                                html! {
                                    <button type="button" class={classes!("chip", actif.then_some("is-active"))}
                                        aria-pressed={actif.to_string()} data-profil={p.id}
                                        onclick={Callback::from(move |_| index_console.set(i))}>{ p.nom }</button>
                                }
                            }) }
                        </div>
                    </fieldset>

                    if !actifs.is_empty() {
                        <button type="button" class="release-all" onclick={tout_relacher}>
                            { format!("{} ({})", d.demo.release_all, actifs.len()) }
                        </button>
                    }
                </div>
            </div>
        </section>
    }
}

/// Les quatre branches de la croix ; chacune s'allume seule.
fn branches_croix(cote: f64, actives: &[&str]) -> Html {
    let largeur = cote * 0.3;
    let longueur = cote * 0.4;
    let branche = format!(
        "M {a} {b} Q {a} {c} {d} {c} H {e} Q {f} {c} {f} {b} V {g} H {a} Z",
        a = -largeur / 2.0,
        b = -longueur + largeur * 0.3,
        c = -longueur,
        d = -largeur / 2.0 + largeur * 0.3,
        e = largeur / 2.0 - largeur * 0.3,
        f = largeur / 2.0,
        g = -largeur / 2.0,
    );
    let pointe = cote * 0.08;
    html! {
        <g class="dpad" aria-hidden="true">
            { for BRANCHES.iter().enumerate().map(|(i, b)| html! {
                <g key={*b} transform={format!("rotate({})", i * 90)}>
                    <path d={branche.clone()} class={classes!("dpad-arm", actives.contains(b).then_some("is-active"))} />
                    <path d={format!("M 0 {:.2} l {:.2} {:.2} h {:.2} Z", -longueur * 0.78, pointe, pointe * 1.1, -pointe * 2.0)} class="dpad-arrow" />
                </g>
            }) }
            <rect x={format!("{:.2}", -largeur / 2.0)} y={format!("{:.2}", -largeur / 2.0)}
                width={format!("{largeur:.2}")} height={format!("{largeur:.2}")} class="dpad-arm dpad-center" />
        </g>
    }
}

#[derive(Properties)]
struct PanneauProps {
    ids: Vec<&'static str>,
    preferences: Rc<Preferences>,
    libre: bool,
    modifier: Callback<Rc<dyn Fn(Preference) -> Preference>>,
    fermer: Callback<()>,
}

impl PartialEq for PanneauProps {
    fn eq(&self, autre: &Self) -> bool {
        self.ids == autre.ids && self.preferences == autre.preferences && self.libre == autre.libre
    }
}

/// Les réglages d'une commande — ou de toute une sélection : régler quatre
/// boutons un par un est exactement la corvée que le projet supprime.
#[component]
fn PanneauCommande(props: &PanneauProps) -> Html {
    let d = use_etat().dico();
    let c = &d.demo.control;
    let pref = |id: &str| {
        props
            .preferences
            .get(id)
            .copied()
            .unwrap_or_else(|| defaut(id))
    };
    let tous =
        |predicat: &dyn Fn(Preference) -> bool| props.ids.iter().all(|id| predicat(pref(id)));
    let premiere = pref(props.ids[0]);
    let masquee = tous(&|p| p.masquee);
    let verrouillee = tous(&|p| p.verrouillee);
    let etiquette = if props.ids.len() > 1 {
        c.multiple.n(props.ids.len())
    } else {
        d.nom_commande(props.ids[0]).to_string()
    };
    let appliquer = |changement: Rc<dyn Fn(Preference) -> Preference>| {
        let modifier = props.modifier.clone();
        Callback::from(move |_| modifier.emit(changement.clone()))
    };
    let heritee = tous(&|p| p.activation.is_none());
    let echelle = premiere.echelle.unwrap_or(1.0);
    let changer_echelle = {
        let modifier = props.modifier.clone();
        Callback::from(move |evenement: InputEvent| {
            if let Some(champ) = evenement.target_dyn_into::<web_sys::HtmlInputElement>() {
                if let Ok(v) = champ.value().parse::<f64>() {
                    modifier.emit(Rc::new(move |mut p| {
                        p.echelle = Some(v);
                        p
                    }));
                }
            }
        })
    };
    let fermer = {
        let fermer = props.fermer.clone();
        Callback::from(move |_| fermer.emit(()))
    };

    html! {
        <fieldset class="control-block control-panel">
            <legend>{ &c.settings }</legend>
            <p class="panel-title">
                { etiquette }
                if props.ids.len() > 1 { <span class="panel-badge">{ c.selection.n(props.ids.len()) }</span> }
                if masquee { <span class="panel-badge">{ &c.hidden_badge }</span> }
                if verrouillee { <span class="panel-badge">{ &c.locked_badge }</span> }
            </p>
            <div class="panel-row">
                <button type="button" class={classes!("chip", verrouillee.then_some("is-active"))} aria-pressed={verrouillee.to_string()}
                    onclick={appliquer(Rc::new(move |mut p| { p.verrouillee = !verrouillee; p }))}>
                    { if verrouillee { &c.unlock } else { &c.lock } }
                </button>
                <button type="button" class={classes!("chip", (!masquee).then_some("is-active"))} aria-pressed={(!masquee).to_string()}
                    onclick={appliquer(Rc::new(move |mut p| { p.masquee = !masquee; p }))}>
                    { if masquee { &c.show } else { &c.hide } }
                </button>
                if props.libre && !verrouillee && premiere.position_libre.is_some() {
                    <button type="button" class="chip" onclick={appliquer(Rc::new(|mut p| { p.position_libre = None; p }))}>{ &c.reposition }</button>
                }
                <button type="button" class="chip" onclick={appliquer(Rc::new(|_| Preference::default()))}>{ &c.reset }</button>
            </div>
            <p class="hint">{ &c.locked_hint }</p>
            <p class="panel-label">{ &c.activation }</p>
            <div class="segmented segmented-wrap">
                <button type="button" class={classes!(heritee.then_some("is-active"))} aria-pressed={heritee.to_string()}
                    onclick={appliquer(Rc::new(|mut p| { p.activation = None; p }))}>{ &c.inherit }</button>
                { for d.demo.modes.iter().filter_map(|m| Activation::depuis_code(&m.id).map(|a| (a, m))).map(|(a, m)| {
                    let actif = tous(&|p| p.activation == Some(a));
                    html! {
                        <button type="button" class={classes!(actif.then_some("is-active"))} aria-pressed={actif.to_string()}
                            onclick={appliquer(Rc::new(move |mut p| { p.activation = Some(a); p }))}>{ &m.label }</button>
                    }
                }) }
            </div>
            <p class="panel-label">{ format!("{} ", c.size) }<span class="value">{ format!("×{echelle:.2}") }</span></p>
            <input type="range" min="0.7" max="2" step="0.05" value={echelle.to_string()}
                aria-label={c.size.clone()} oninput={changer_echelle} />
            <div class="panel-row panel-footer">
                <button type="button" class="chip" onclick={fermer}>{ &c.deselect }</button>
            </div>
        </fieldset>
    }
}
