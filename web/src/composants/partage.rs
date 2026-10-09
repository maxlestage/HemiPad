//! Partager HemiPad, et l'installer comme une application.

use std::cell::RefCell;
use std::rc::Rc;

use gloo_timers::callback::Timeout;
use js_sys::{Function, Promise, Reflect};
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use wasm_bindgen_futures::JsFuture;
use yew::platform::spawn_local;
use yew::prelude::*;

use super::commun::{Marque, TeteSection};
use crate::dom;
use crate::etat::use_etat;

fn peut_partager() -> bool {
    Reflect::has(&dom::fenetre().navigator(), &JsValue::from_str("share")).unwrap_or(false)
}

fn installee() -> bool {
    let ios = Reflect::get(
        &dom::fenetre().navigator(),
        &JsValue::from_str("standalone"),
    )
    .ok()
    .and_then(|v| v.as_bool())
    .unwrap_or(false);
    ios || dom::media("(display-mode: standalone)")
}

#[component]
pub fn Partage() -> Html {
    let d = use_etat().dico();
    let s = &d.share;
    let copie = use_state(|| false);
    let partage_natif = use_memo((), |_| peut_partager());
    let invite: Rc<RefCell<Option<JsValue>>> = use_mut_ref(|| None);
    let installable = use_state(|| false);
    let est_installee = use_state(installee);

    // L'invitation à installer : le navigateur la propose quand il le juge
    // bon ; on la garde pour un bouton plutôt que de la subir.
    {
        let invite = invite.clone();
        let installable = installable.clone();
        let est_installee = est_installee.clone();
        use_effect_with((), move |_| {
            let fenetre = dom::fenetre();
            let sur_invite =
                Closure::<dyn FnMut(web_sys::Event)>::new(move |evenement: web_sys::Event| {
                    evenement.prevent_default();
                    *invite.borrow_mut() = Some(evenement.into());
                    installable.set(true);
                });
            let sur_installation =
                Closure::<dyn FnMut(web_sys::Event)>::new(move |_| est_installee.set(true));
            let _ = fenetre.add_event_listener_with_callback(
                "beforeinstallprompt",
                sur_invite.as_ref().unchecked_ref(),
            );
            let _ = fenetre.add_event_listener_with_callback(
                "appinstalled",
                sur_installation.as_ref().unchecked_ref(),
            );
            move || {
                let _ = fenetre.remove_event_listener_with_callback(
                    "beforeinstallprompt",
                    sur_invite.as_ref().unchecked_ref(),
                );
                let _ = fenetre.remove_event_listener_with_callback(
                    "appinstalled",
                    sur_installation.as_ref().unchecked_ref(),
                );
            }
        });
    }

    // « Lien copié » s'efface de lui-même.
    {
        let copie_etat = copie.clone();
        use_effect_with(*copie, move |copie| {
            let minuterie = copie.then(|| Timeout::new(2400, move || copie_etat.set(false)));
            move || drop(minuterie)
        });
    }

    let adresse = dom::fenetre()
        .location()
        .href()
        .unwrap_or_else(|_| "https://hemipad.app".into());
    let partager = {
        let copie = copie.clone();
        let natif = *partage_natif;
        let adresse = adresse.clone();
        let accroche = s.tagline.clone();
        Callback::from(move |_| {
            let copie = copie.clone();
            let adresse = adresse.clone();
            let accroche = accroche.clone();
            spawn_local(async move {
                let navigateur = dom::fenetre().navigator();
                if natif {
                    let donnees = web_sys::ShareData::new();
                    donnees.set_title("HemiPad");
                    donnees.set_text(&accroche);
                    donnees.set_url(&adresse);
                    if JsFuture::from(navigateur.share_with_data(&donnees))
                        .await
                        .is_ok()
                    {
                        return;
                    }
                }
                let ecrit = JsFuture::from(navigateur.clipboard().write_text(&adresse)).await;
                copie.set(ecrit.is_ok());
            });
        })
    };

    let installer = {
        let invite = invite.clone();
        let installable = installable.clone();
        Callback::from(move |_| {
            let Some(evenement) = invite.borrow_mut().take() else {
                return;
            };
            installable.set(false);
            if let Ok(proposer) = Reflect::get(&evenement, &JsValue::from_str("prompt")) {
                if let Some(proposer) = proposer.dyn_ref::<Function>() {
                    if let Ok(promesse) = proposer.call0(&evenement) {
                        let _ = promesse.dyn_into::<Promise>().map(|p| {
                            spawn_local(async move {
                                let _ = JsFuture::from(p).await;
                            })
                        });
                    }
                }
            }
        })
    };

    let affichee = adresse
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .to_string();
    html! {
        <section class="section share" id="partage" aria-labelledby="partage-titre">
            <TeteSection numero="06" sur_titre={s.eyebrow.clone()} titre={s.title.clone()}
                id_titre="partage-titre" chapeau={s.lede.clone()} />
            <div class="share-panel" data-reveler="">
                <article class="share-card" aria-label={s.card_role.clone()}>
                    <div class="share-card-visual" aria-hidden="true"><Marque /></div>
                    <div class="share-card-body">
                        <p class="share-card-name">{ "HemiPad" }</p>
                        <p class="share-card-tagline">{ &s.tagline }</p>
                        <p class="share-card-url">{ affichee }</p>
                    </div>
                </article>
                <div class="share-actions">
                    <button type="button" class="button primary" onclick={partager} data-aimant="">
                        <span>{ if *copie { &s.copied } else if *partage_natif { &s.button } else { &s.copy } }</span>
                    </button>
                    if *installable && !*est_installee {
                        <button type="button" class="button ghost" onclick={installer} data-aimant="">
                            <span>{ &d.install.button }</span>
                        </button>
                    }
                    if *est_installee {
                        <span class="share-installed">{ &d.install.installed }</span>
                    }
                </div>
                <p class="hint">{ &d.install.hint }</p>
            </div>
        </section>
    }
}
