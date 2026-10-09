//! L'ouverture : le film de grains piloté par le défilement, ses lignes de
//! texte, puis l'accueil — le titre, la phrase et les premiers choix.
//!
//! Animations apaisées, ou WebGL absent : pas de piste ni de film. Les mêmes
//! lignes se lisent d'un bloc, et l'accueil montre l'image fixe de
//! l'appareil. Le sujet ne change pas, seulement le mouvement.

use std::cell::RefCell;
use std::rc::Rc;

use yew::platform::spawn_local;
use yew::prelude::*;

use super::commun::{mots, segmente, Marque};
use crate::anim::defilement;
use crate::anim::film::{Film, ETAPES};
use crate::anim::inclinaison::{self, EtatOrientation};
use crate::apercu::Apercu;
use crate::dom;
use crate::etat::{use_etat, Action, Appareil};
use crate::solveur::Main;

#[component]
pub fn Ouverture() -> Html {
    let etat = use_etat();
    let d = etat.dico();
    let piste = use_node_ref();
    let scene = use_node_ref();
    let canevas = use_node_ref();
    let film: Rc<RefCell<Option<Film>>> = use_mut_ref(|| None);
    let sans_webgl = use_state_eq(|| false);
    let fixe = etat.reduit() || *sans_webgl;

    // Le film démarre quand les animations sont permises, et s'arrête avec
    // elles.
    {
        let film = film.clone();
        let (piste, scene, canevas) = (piste.clone(), scene.clone(), canevas.clone());
        let sans_webgl = sans_webgl.clone();
        let (main, appareil, sombre) = (etat.main, etat.appareil, etat.sombre());
        use_effect_with(etat.reduit(), move |reduit| {
            if !*reduit {
                let elements = (
                    canevas.cast::<web_sys::HtmlCanvasElement>(),
                    piste.cast::<web_sys::Element>(),
                    scene.cast::<web_sys::Element>(),
                );
                if let (Some(c), Some(p), Some(s)) = elements {
                    match Film::demarrer(c, p, s, main, appareil, sombre) {
                        Some(f) => *film.borrow_mut() = Some(f),
                        None => sans_webgl.set(true),
                    }
                }
            }
            let film = film.clone();
            move || {
                film.borrow_mut().take();
            }
        });
    }
    {
        let film = film.clone();
        use_effect_with((etat.main, etat.appareil), move |(main, appareil)| {
            if let Some(f) = film.borrow().as_ref() {
                f.choisir(*main, *appareil);
            }
        });
    }
    {
        let film = film.clone();
        use_effect_with(etat.sombre(), move |sombre| {
            if let Some(f) = film.borrow().as_ref() {
                f.theme(*sombre);
            }
        });
    }

    let passer = Callback::from(move |_| {
        if let Some(accueil) = dom::par_id("accueil") {
            defilement::aller_a(dom::haut_absolu(&accueil), true);
        }
    });

    let h = &d.hero;
    let mains = vec![
        (Main::Gauche, d.demo.hand_left.clone()),
        (Main::Droite, d.demo.hand_right.clone()),
    ];
    let appareils = vec![
        (Appareil::Ipad, d.demo.device.ipad.clone()),
        (Appareil::Iphone, d.demo.device.iphone.clone()),
    ];
    let choisir_main = {
        let etat = etat.clone();
        Callback::from(move |m| etat.dispatch(Action::Main(m)))
    };
    let choisir_appareil = {
        let etat = etat.clone();
        Callback::from(move |a| etat.dispatch(Action::Appareil(a)))
    };
    let etiquette_apercu = format!(
        "{} · {}",
        if etat.appareil == Appareil::Ipad {
            &d.demo.device.ipad
        } else {
            &d.demo.device.iphone
        },
        d.film.canvas_label
    );

    html! {
        <section class={classes!("ouverture", fixe.then_some("est-fixe"))} id="ouverture"
            aria-label={d.film.label.clone()} data-etapes={(ETAPES - 1).to_string()}>
            <div class="piste" ref={piste}>
                <div class="scene" ref={scene} data-station="0">
                    if !fixe {
                        <canvas class="film" ref={canevas} aria-hidden="true"></canvas>
                    }
                    <div class="voile" aria-hidden="true"></div>
                    <div class="marque-geante" aria-hidden="true">
                        <Marque class="marque-geante-signe" />
                        <p class="marque-geante-nom">{ "HemiPad" }</p>
                        <p class="marque-geante-sous">{ format!("{} {}", h.title_lead, h.title_accent) }</p>
                    </div>
                    <ol class="stations">
                        { for d.film.stations.iter().enumerate().map(|(i, texte)| html! {
                            <li class="station" data-index={(i + 1).to_string()}>
                                <span class="station-numero" aria-hidden="true">{ format!("0{}", i + 1) }</span>
                                <span class="station-texte">{ mots(texte) }</span>
                            </li>
                        }) }
                    </ol>
                    if !fixe {
                        <button type="button" class="passer" onclick={passer}>{ &d.film.skip }</button>
                        <div class="defiler" aria-hidden="true"><span>{ &d.film.scroll }</span><i></i></div>
                    }
                </div>
            </div>

            <header class="accueil hero" id="accueil">
                <div class="accueil-texte">
                    <p class="eyebrow">{ &h.eyebrow }</p>
                    <h1>
                        { &h.title_lead }
                        <span class="gradient-text">{ format!(" {}", h.title_accent) }</span>
                    </h1>
                    <p class="lede">{ &h.lede }<strong>{ format!(" {}", h.lede_strong) }</strong></p>
                    <div class="hero-actions">
                        <a class="button primary" href="#demo" data-aimant=""><span>{ &h.primary }</span></a>
                        <a class="button ghost" href="#accessibilite" data-aimant=""><span>{ &h.secondary }</span></a>
                    </div>
                    <div class="accueil-choix">
                        <fieldset class="choix-appareil">
                            <legend>{ &d.demo.device.label }</legend>
                            { segmente(&appareils, etat.appareil, "segmented-compact", choisir_appareil) }
                        </fieldset>
                        <fieldset class="choix-main">
                            <legend>{ &d.demo.hand }</legend>
                            { segmente(&mains, etat.main, "segmented-compact", choisir_main) }
                        </fieldset>
                    </div>
                    if !fixe && inclinaison::suivi_possible() {
                        <BoutonInclinaison />
                    }
                    <dl class="hero-stats">
                        { for h.stats.iter().map(|s| html! { <div><dt>{ &s.label }</dt><dd>{ &s.value }</dd></div> }) }
                    </dl>
                </div>
                if fixe {
                    <Apercu class="hero-still" appareil={etat.appareil} main={etat.main} etiquette={etiquette_apercu} />
                }
            </header>
        </section>
    }
}

/// « Suivre l'inclinaison » : sur un téléphone, la scène penche avec lui.
#[component]
fn BoutonInclinaison() -> Html {
    let d = use_etat().dico();
    let t = &d.hero.tilt;
    let etat = use_state_eq(|| EtatOrientation::Arrete);
    use_effect_with((), |_| inclinaison::arreter);

    let basculer = {
        let etat = etat.clone();
        Callback::from(move |_| match *etat {
            EtatOrientation::Actif => {
                inclinaison::arreter();
                etat.set(EtatOrientation::Arrete);
            }
            EtatOrientation::Demande => {}
            _ => {
                etat.set(EtatOrientation::Demande);
                let etat = etat.clone();
                spawn_local(async move {
                    let sans = {
                        let etat = etat.clone();
                        move || etat.set(EtatOrientation::SansCapteur)
                    };
                    etat.set(inclinaison::demarrer(sans).await);
                });
            }
        })
    };
    let actif = *etat == EtatOrientation::Actif;
    let etiquette = match *etat {
        EtatOrientation::Actif => &t.following,
        EtatOrientation::Demande => &t.asking,
        _ => &t.follow,
    };
    let message = match *etat {
        EtatOrientation::Refuse => Some(&t.denied),
        EtatOrientation::SansCapteur => Some(&t.unavailable),
        _ => None,
    };
    html! {
        <div class="inclinaison">
            <button type="button" class={classes!("chip", "tilt-toggle", actif.then_some("is-active"))}
                aria-pressed={actif.to_string()} onclick={basculer}>{ etiquette }</button>
            if let Some(texte) = message { <p class="hint" role="status">{ texte }</p> }
        </div>
    }
}
