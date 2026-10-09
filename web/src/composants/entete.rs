//! La barre du haut : la marque, les sections, et un appel à essayer.
//!
//! Sur téléphone, elle s'efface quand on descend et revient quand on
//! remonte : l'écran est au contenu.

use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use yew::prelude::*;

use super::commun::Marque;
use crate::dom;
use crate::etat::use_etat;

#[component]
pub fn Entete() -> Html {
    let d = use_etat().dico();
    let cachee = use_state_eq(|| false);
    let remplie = use_state_eq(|| false);

    {
        let cachee = cachee.clone();
        let remplie = remplie.clone();
        use_effect_with((), move |_| {
            let mut dernier = dom::defilement();
            let ecouteur = Closure::<dyn FnMut()>::new(move || {
                let y = dom::defilement();
                // Au-delà de la largeur d'un téléphone, la barre reste.
                let etroit = dom::largeur_fenetre() < 760.0;
                if (y - dernier).abs() > 6.0 {
                    cachee.set(etroit && y > dernier && y > 120.0);
                    dernier = y;
                }
                remplie.set(y > 24.0);
            });
            let fenetre = dom::fenetre();
            let options = web_sys::AddEventListenerOptions::new();
            options.set_passive(true);
            let _ = fenetre.add_event_listener_with_callback_and_add_event_listener_options(
                "scroll",
                ecouteur.as_ref().unchecked_ref(),
                &options,
            );
            move || {
                let _ = fenetre.remove_event_listener_with_callback(
                    "scroll",
                    ecouteur.as_ref().unchecked_ref(),
                );
            }
        });
    }

    let liens = [
        ("#demo", &d.nav.demo),
        ("#accessibilite", &d.nav.accessibility),
        ("#clavier", &d.nav.keyboard),
        ("#consoles", &d.nav.consoles),
        ("#technique", &d.nav.tech),
    ];

    html! {
        <nav class={classes!("nav", cachee.then_some("is-hidden"), remplie.then_some("is-filled"))}
            aria-label={d.nav.label.clone()}>
            <a class="nav-brand" href="#haut">
                <Marque class="nav-mark" compacte=true />
                <span>{ "HemiPad" }</span>
            </a>
            <ul class="nav-links">
                { for liens.iter().map(|(href, etiquette)| html! {
                    <li><a href={*href}>{ etiquette.to_string() }</a></li>
                }) }
            </ul>
            <a class="nav-cta" href="#demo" data-aimant=""><span>{ &d.hero.primary }</span></a>
        </nav>
    }
}
