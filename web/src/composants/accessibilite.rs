//! Neuf gestes impossibles, neuf réponses.

use yew::prelude::*;

use super::commun::TeteSection;
use crate::etat::use_etat;

#[component]
pub fn Accessibilite() -> Html {
    let d = use_etat().dico();
    let f = &d.features;
    html! {
        <section class="section features" id="accessibilite" aria-labelledby="features-titre">
            <TeteSection numero="02" sur_titre={f.eyebrow.clone()} titre={f.title.clone()}
                id_titre="features-titre" chapeau={f.lede.clone()} />
            <ul class="feature-grid">
                { for f.items.iter().enumerate().map(|(i, item)| html! {
                    <li class="feature-card" data-reveler="" data-rang={(i % 3).to_string()}>
                        <span class="feature-icon" aria-hidden="true">{ &item.icon }</span>
                        <h3>{ &item.title }</h3>
                        <p class="feature-problem">
                            <span class="tag">{ &f.problem_tag }</span>
                            { &item.problem }
                        </p>
                        <p class="feature-answer">
                            <span class="tag tag-answer">{ &f.answer_tag }</span>
                            { &item.answer }
                        </p>
                    </li>
                }) }
            </ul>
        </section>
    }
}
