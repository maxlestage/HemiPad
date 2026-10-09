//! Une manette, six façons d'être lue.

use yew::prelude::*;

use super::commun::TeteSection;
use crate::consoles::PROFILS;
use crate::etat::use_etat;

#[component]
pub fn Profils() -> Html {
    let d = use_etat().dico();
    let c = &d.consoles;
    html! {
        <section class="section consoles" id="consoles" aria-labelledby="consoles-titre">
            <TeteSection numero="04" sur_titre={c.eyebrow.clone()} titre={c.title.clone()}
                id_titre="consoles-titre" chapeau={c.lede.clone()} />
            <ul class="console-row">
                { for PROFILS.iter().enumerate().map(|(i, profil)| html! {
                    <li class="console-card" data-reveler=""
                        data-profil={profil.id} data-rang={(i % 3).to_string()}>
                        <div class="console-glyphs" aria-hidden="true">
                            { for ["faceN", "faceW", "faceE", "faceS"].iter().map(|id| html! {
                                <span>{ profil.glyphe(id) }</span>
                            }) }
                        </div>
                        <h3>{ profil.nom }</h3>
                        <p>{ c.summaries.get(profil.id).cloned().unwrap_or_default() }</p>
                    </li>
                }) }
            </ul>
        </section>
    }
}
