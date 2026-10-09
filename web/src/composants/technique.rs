//! Comment ça marche : Bluetooth direct, ce qui l'accepte, et les relais.

use yew::prelude::*;

use super::commun::TeteSection;
use crate::etat::use_etat;

#[component]
pub fn Technique() -> Html {
    let d = use_etat().dico();
    let a = &d.architecture;
    html! {
        <section class="section architecture" id="technique" aria-labelledby="technique-titre">
            <TeteSection numero="05" sur_titre={a.eyebrow.clone()} titre={a.title.clone()}
                id_titre="technique-titre" chapeau={a.lede.clone()} />

            <div class="path-grid">
                { for a.paths.iter().map(|chemin| html! {
                    <article class="path-card" data-reveler="">
                        <h3>{ &chemin.title }</h3>
                        <p class="path-subtitle">{ &chemin.subtitle }</p>
                        if chemin.kind.as_deref() == Some("list") {
                            <ul class="path-steps is-list">
                                { for chemin.steps.iter().map(|etape| html! { <li>{ etape }</li> }) }
                            </ul>
                        } else {
                            <ol class="path-steps">
                                { for chemin.steps.iter().map(|etape| html! { <li>{ etape }</li> }) }
                            </ol>
                        }
                        <p class="path-note">{ &chemin.note }</p>
                    </article>
                }) }
            </div>

            <div class="route-block" data-reveler="">
                <h3>{ &a.routes.title }</h3>
                <p class="path-note">{ &a.routes.lede }</p>
                <div class="route-grid">
                    { for a.routes.items.iter().enumerate().map(|(i, route)| html! {
                        <article class="path-card route-card" data-reveler="" data-rang={i.to_string()}>
                            <h4>{ &route.name }</h4>
                            <p class={classes!("route-verdict", route.steps.is_empty().then_some("is-none"))}>{ &route.verdict }</p>
                            if !route.steps.is_empty() {
                                <ol class="route-steps">
                                    { for route.steps.iter().map(|etape| html! { <li>{ etape }</li> }) }
                                </ol>
                            }
                            <p class="path-note">{ &route.note }</p>
                        </article>
                    }) }
                </div>
            </div>

            <dl class="spec-list" data-reveler="">
                { for a.specs.iter().map(|spec| html! {
                    <div><dt>{ &spec.label }</dt><dd>{ &spec.value }</dd></div>
                }) }
            </dl>
        </section>
    }
}
