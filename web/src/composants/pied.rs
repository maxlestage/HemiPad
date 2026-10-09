//! Pied de page : qui a fait le produit, sous quelles conditions, et comment
//! l'adapter à soi — langue, thème, animations. Les réglages sont ici, en
//! clair : un réglage qu'on ne trouve pas n'existe pas.

use yew::prelude::*;

use super::commun::{mots, segmente, Marque};
use crate::etat::{use_etat, Action, ChoixMouvement, ChoixTheme};
use crate::i18n::{dico, LANGUES};

#[component]
pub fn Pied() -> Html {
    let etat = use_etat();
    let d = etat.dico();
    let f = &d.footer;
    let annee = js_sys::Date::new_0().get_full_year();

    let themes: Vec<(ChoixTheme, String)> = vec![
        (ChoixTheme::Auto, f.themes.auto.clone()),
        (ChoixTheme::Clair, f.themes.light.clone()),
        (ChoixTheme::Sombre, f.themes.dark.clone()),
    ];
    let mouvements: Vec<(ChoixMouvement, String)> = vec![
        (ChoixMouvement::Auto, f.motions.auto.clone()),
        (ChoixMouvement::Anime, f.motions.full.clone()),
        (ChoixMouvement::Apaise, f.motions.reduced.clone()),
    ];
    let choisir_theme = {
        let etat = etat.clone();
        Callback::from(move |choix| etat.dispatch(Action::Theme(choix)))
    };
    let choisir_mouvement = {
        let etat = etat.clone();
        Callback::from(move |choix| etat.dispatch(Action::Mouvement(choix)))
    };

    html! {
        <footer class="footer">
            <p class="footer-grand" aria-hidden="true" data-reveler="">{ mots(&f.tagline) }</p>
            <div class="footer-inner">
                <div class="footer-brand">
                    <a class="footer-mark" href="#haut" aria-label="HemiPad">
                        <Marque compacte=true />
                        <span>{ "HemiPad" }</span>
                    </a>
                    <p class="footer-tagline">{ &f.tagline }</p>
                    <p class="footer-body">{ &f.body }</p>
                </div>

                <nav class="footer-links" aria-label={d.nav.label.clone()}>
                    { for f.sections.iter().map(|section| html! {
                        <div>
                            <h2>{ &section.title }</h2>
                            <ul>
                                { for section.links.iter().map(|lien| html! {
                                    <li><a href={lien.href.clone()}>{ &lien.label }</a></li>
                                }) }
                            </ul>
                        </div>
                    }) }
                    <div class="footer-credits">
                        <h2>{ &f.credits_title }</h2>
                        <p class="footer-author">{ &f.author }</p>
                        <p class="footer-role">{ &f.credits_role }</p>
                    </div>
                </nav>

                <div class="footer-preferences">
                    <fieldset class="preference preference-langue">
                        <legend>{ &f.language_title }</legend>
                        <div class="segmented segmented-compact">
                            { for LANGUES.iter().map(|langue| {
                                let langue = *langue;
                                let nom = dico(langue).locale_name.clone();
                                let actif = etat.langue == langue;
                                let etat = etat.clone();
                                html! {
                                    <button type="button" lang={langue.code()}
                                        class={classes!(actif.then_some("is-active"))}
                                        aria-pressed={actif.to_string()}
                                        aria-label={format!("{} : {}", d.locale_switch_label, nom)}
                                        onclick={Callback::from(move |_| etat.dispatch(Action::Langue(langue)))}>
                                        { nom }
                                    </button>
                                }
                            }) }
                        </div>
                    </fieldset>
                    <fieldset class="preference preference-theme">
                        <legend>{ &f.theme_title }</legend>
                        { segmente(&themes, etat.theme, "segmented-compact", choisir_theme) }
                    </fieldset>
                    <fieldset class="preference preference-animation">
                        <legend>{ &f.motion_title }</legend>
                        { segmente(&mouvements, etat.mouvement, "segmented-compact", choisir_mouvement) }
                    </fieldset>
                </div>
            </div>

            <div class="footer-legal">
                <p class="footer-copyright">{ format!("© {annee} {}. {}", f.author, f.rights) }</p>
                <p>{ &f.proprietary }</p>
                <p class="footer-trademarks">{ &f.trademarks }</p>
            </div>
        </footer>
    }
}
