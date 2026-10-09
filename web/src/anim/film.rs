//! Le film de grains : des milliers de points de lumière, dessinés en
//! WebGL2, qui passent d'une forme à la suivante au rythme du défilement.
//!
//! Le défilement est la tête de lecture : la position dans la piste dit
//! quelles deux formes sont en jeu et où en est le passage de l'une à
//! l'autre. Chaque grain garde son identité d'une forme à l'autre ; pendant
//! le passage, il décrit une petite boucle, ce qui donne le remous. Le
//! pointeur écarte les grains autour de lui.
//!
//! Le texte de chaque étape vit dans la page (lisible, traduisible) : le
//! film ne fait que poser `data-station` sur la scène, et les styles
//! montrent la bonne ligne.

use std::cell::RefCell;
use std::rc::Rc;

use js_sys::Float32Array;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{
    Element, HtmlCanvasElement, WebGl2RenderingContext as Gl, WebGlBuffer, WebGlProgram,
    WebGlShader, WebGlUniformLocation, WebGlVertexArrayObject,
};

use super::formes::{self, Forme, Hasard, FILM};
use super::inclinaison;
use super::{Boucle, Ecouteur};
use crate::dom;
use crate::etat::Appareil;
use crate::solveur::Main;

const SOMMETS: &str = r#"#version 300 es
precision highp float;
in vec2 aDe;
in vec2 aVers;
in vec4 aGraine;
uniform float uMelange;
uniform float uTemps;
uniform float uEntree;
uniform vec2 uResolution;
uniform vec2 uCentre;
uniform float uEchelle;
uniform float uTaille;
uniform vec2 uPointeur;
uniform vec2 uInclinaison;
uniform vec3 uCouleurs[3];
out vec3 vCouleur;
out float vAlpha;

void main() {
    // Les grains ne partent pas tous ensemble : chacun a son retard.
    float m = clamp((uMelange - aGraine.x * 0.3) / 0.7, 0.0, 1.0);
    m = m * m * (3.0 - 2.0 * m);
    vec2 p = mix(aDe, aVers, m);

    // Le remous : une boucle propre à chaque grain, au plus fort à mi-chemin.
    float remous = sin(3.14159 * m);
    float a = aGraine.y * 6.2831 + uTemps * (0.5 + aGraine.z);
    p += vec2(cos(a), sin(a * 1.3)) * remous * (0.18 + 0.2 * aGraine.z);

    // Au repos, une respiration à peine visible.
    p += vec2(sin(uTemps * 0.8 + aGraine.x * 40.0), cos(uTemps * 0.6 + aGraine.y * 40.0)) * 0.006;

    // L'entrée : les grains arrivent d'un nuage épars.
    vec2 epars = (aGraine.xy * 2.0 - 1.0) * vec2(2.4, 1.8);
    float e = 1.0 - pow(1.0 - clamp(uEntree * (1.2 - aGraine.w * 0.4), 0.0, 1.0), 3.0);
    p = mix(epars, p, e);

    vec2 ecran = uCentre + p * uEchelle + uInclinaison * uEchelle * 0.1 * (0.4 + aGraine.z);

    // Le pointeur écarte les grains, sans les chasser loin.
    vec2 d = ecran - uPointeur;
    float l = length(d);
    float rayon = uEchelle * 0.24;
    if (l < rayon && l > 0.001) {
        ecran += d / l * (rayon - l) * 0.6;
    }

    vec2 clip = ecran / uResolution * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    gl_PointSize = uTaille * (0.55 + aGraine.z * 0.9);
    int i = aGraine.w < 0.62 ? 0 : (aGraine.w < 0.9 ? 1 : 2);
    vCouleur = uCouleurs[i];
    vAlpha = (0.45 + 0.55 * aGraine.z) * e;
}
"#;

const FRAGMENTS: &str = r#"#version 300 es
precision mediump float;
in vec3 vCouleur;
in float vAlpha;
out vec4 couleur;
void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    float a = smoothstep(0.5, 0.12, r) * vAlpha;
    couleur = vec4(vCouleur * a, a);
}
"#;

struct Uniformes {
    melange: Option<WebGlUniformLocation>,
    temps: Option<WebGlUniformLocation>,
    entree: Option<WebGlUniformLocation>,
    resolution: Option<WebGlUniformLocation>,
    centre: Option<WebGlUniformLocation>,
    echelle: Option<WebGlUniformLocation>,
    taille: Option<WebGlUniformLocation>,
    pointeur: Option<WebGlUniformLocation>,
    inclinaison: Option<WebGlUniformLocation>,
    couleurs: Option<WebGlUniformLocation>,
}

struct Interieur {
    gl: Gl,
    _programme: WebGlProgram,
    vao: WebGlVertexArrayObject,
    tampon_de: WebGlBuffer,
    tampon_vers: WebGlBuffer,
    u: Uniformes,
    n: usize,
    formes: Vec<Vec<f32>>,
    segment: usize,
    canevas: HtmlCanvasElement,
    piste: Element,
    scene: Element,
    debut: f64,
    pointeur: (f64, f64),
    pointeur_cible: (f64, f64),
    inclinaison: (f64, f64),
    sombre: bool,
    station: i32,
    image: Option<i32>,
}

/// Nombre d'étapes de la piste : une par forme.
pub const ETAPES: usize = FILM.len();

pub struct Film {
    interieur: Rc<RefCell<Interieur>>,
    boucle: Boucle<dyn FnMut(f64)>,
    ecouteurs: Vec<Ecouteur<web_sys::PointerEvent>>,
}

fn compiler(gl: &Gl, genre: u32, source: &str) -> Option<WebGlShader> {
    let shader = gl.create_shader(genre)?;
    gl.shader_source(&shader, source);
    gl.compile_shader(&shader);
    if gl
        .get_shader_parameter(&shader, Gl::COMPILE_STATUS)
        .as_bool()
        == Some(true)
    {
        Some(shader)
    } else {
        web_sys::console::warn_1(&gl.get_shader_info_log(&shader).unwrap_or_default().into());
        None
    }
}

fn tampon(gl: &Gl, donnees: &[f32], usage: u32) -> Option<WebGlBuffer> {
    let tampon = gl.create_buffer()?;
    gl.bind_buffer(Gl::ARRAY_BUFFER, Some(&tampon));
    let vue = Float32Array::from(donnees);
    gl.buffer_data_with_array_buffer_view(Gl::ARRAY_BUFFER, &vue, usage);
    Some(tampon)
}

fn attribut(gl: &Gl, programme: &WebGlProgram, nom: &str, tampon: &WebGlBuffer, taille: i32) {
    let position = gl.get_attrib_location(programme, nom);
    if position < 0 {
        return;
    }
    gl.bind_buffer(Gl::ARRAY_BUFFER, Some(tampon));
    gl.enable_vertex_attrib_array(position as u32);
    gl.vertex_attrib_pointer_with_i32(position as u32, taille, Gl::FLOAT, false, 0, 0);
}

fn lisser(x: f64) -> f64 {
    let x = x.clamp(0.0, 1.0);
    x * x * (3.0 - 2.0 * x)
}

/// Où poser une forme, et à quelle taille, selon l'écran.
fn cadrage(forme: Forme, l: f64, h: f64) -> (f64, f64, f64) {
    let large = l >= 900.0 && h >= 560.0;
    match (large, forme) {
        (true, Forme::Appareil) => (l * 0.73, h * 0.52, h * 0.4),
        (true, _) => (l * 0.66, h * 0.37, (l * 0.24).min(h * 0.3)),
        (false, Forme::Appareil) => (l * 0.5, h * 0.4, (l * 0.44).min(h * 0.33)),
        (false, _) => (l * 0.5, h * 0.34, (l * 0.42).min(h * 0.26)),
    }
}

fn couleurs(sombre: bool) -> [f32; 9] {
    if sombre {
        [0.0, 0.9, 1.0, 0.545, 0.49, 1.0, 1.0, 0.71, 0.2]
    } else {
        [0.04, 0.44, 0.51, 0.29, 0.25, 0.82, 0.72, 0.43, 0.0]
    }
}

/// Ce que le film dessine, lisible depuis la page : la main et l'appareil
/// dont les formes sont chargées.
fn annoncer(scene: &Element, main: Main, appareil: Appareil) {
    let _ = scene.set_attribute("data-main-rendu", main.code());
    let _ = scene.set_attribute("data-appareil-rendu", appareil.code());
}

impl Film {
    /// Démarre le film sur ce canevas. `None` si le WebGL2 manque : la page
    /// garde alors son image fixe.
    pub fn demarrer(
        canevas: HtmlCanvasElement,
        piste: Element,
        scene: Element,
        main: Main,
        appareil: Appareil,
        sombre: bool,
    ) -> Option<Film> {
        let options = js_sys::Object::new();
        for (cle, valeur) in [
            ("alpha", true),
            ("antialias", false),
            ("premultipliedAlpha", true),
            ("depth", false),
        ] {
            let _ = js_sys::Reflect::set(&options, &cle.into(), &valeur.into());
        }
        let _ = js_sys::Reflect::set(&options, &"powerPreference".into(), &"low-power".into());
        let gl: Gl = canevas
            .get_context_with_context_options("webgl2", &options)
            .ok()??
            .dyn_into()
            .ok()?;

        let vs = compiler(&gl, Gl::VERTEX_SHADER, SOMMETS)?;
        let fs = compiler(&gl, Gl::FRAGMENT_SHADER, FRAGMENTS)?;
        let programme = gl.create_program()?;
        gl.attach_shader(&programme, &vs);
        gl.attach_shader(&programme, &fs);
        gl.link_program(&programme);
        if gl
            .get_program_parameter(&programme, Gl::LINK_STATUS)
            .as_bool()
            != Some(true)
        {
            return None;
        }
        gl.use_program(Some(&programme));

        // Moins de grains sur un petit écran : la carte graphique d'un
        // téléphone n'a pas à porter ce qu'un ordinateur porte.
        let l = dom::largeur_fenetre();
        let n = if l < 700.0 { 7_000 } else { 14_000 };
        let formes = formes::film(n, main, appareil);

        let mut hasard = Hasard::new(4242);
        let graines: Vec<f32> = (0..n * 4).map(|_| hasard.suivant()).collect();

        let vao = gl.create_vertex_array()?;
        gl.bind_vertex_array(Some(&vao));
        let tampon_de = tampon(&gl, &formes[0], Gl::DYNAMIC_DRAW)?;
        attribut(&gl, &programme, "aDe", &tampon_de, 2);
        let tampon_vers = tampon(&gl, &formes[1], Gl::DYNAMIC_DRAW)?;
        attribut(&gl, &programme, "aVers", &tampon_vers, 2);
        let tampon_graines = tampon(&gl, &graines, Gl::STATIC_DRAW)?;
        attribut(&gl, &programme, "aGraine", &tampon_graines, 4);

        let u = |nom: &str| gl.get_uniform_location(&programme, nom);
        let uniformes = Uniformes {
            melange: u("uMelange"),
            temps: u("uTemps"),
            entree: u("uEntree"),
            resolution: u("uResolution"),
            centre: u("uCentre"),
            echelle: u("uEchelle"),
            taille: u("uTaille"),
            pointeur: u("uPointeur"),
            inclinaison: u("uInclinaison"),
            couleurs: u("uCouleurs"),
        };

        gl.enable(Gl::BLEND);
        let interieur = Rc::new(RefCell::new(Interieur {
            gl,
            _programme: programme,
            vao,
            tampon_de,
            tampon_vers,
            u: uniformes,
            n,
            formes,
            segment: 0,
            canevas,
            piste,
            scene,
            debut: dom::maintenant(),
            pointeur: (-1e4, -1e4),
            pointeur_cible: (-1e4, -1e4),
            inclinaison: (0.0, 0.0),
            sombre,
            station: -1,
            image: None,
        }));
        interieur.borrow_mut().appliquer_couleurs();
        annoncer(&interieur.borrow().scene, main, appareil);

        let boucle: Boucle<dyn FnMut(f64)> = Rc::new(RefCell::new(None));
        {
            let interieur = interieur.clone();
            let boucle_interne = boucle.clone();
            *boucle.borrow_mut() = Some(Closure::new(move |temps: f64| {
                let mut i = interieur.borrow_mut();
                i.image = None;
                i.dessiner(temps);
                if let Some(rappel) = boucle_interne.borrow().as_ref() {
                    i.image = dom::fenetre()
                        .request_animation_frame(rappel.as_ref().unchecked_ref())
                        .ok();
                }
            }));
        }

        let mut ecouteurs = Vec::new();
        let fenetre = dom::fenetre();
        let deplacement = {
            let interieur = interieur.clone();
            Closure::<dyn FnMut(web_sys::PointerEvent)>::new(move |e: web_sys::PointerEvent| {
                interieur.borrow_mut().pointeur_cible = (e.client_x() as f64, e.client_y() as f64);
            })
        };
        let _ = fenetre
            .add_event_listener_with_callback("pointermove", deplacement.as_ref().unchecked_ref());
        ecouteurs.push(("pointermove", deplacement));
        let sortie = {
            let interieur = interieur.clone();
            Closure::<dyn FnMut(web_sys::PointerEvent)>::new(move |_| {
                interieur.borrow_mut().pointeur_cible = (-1e4, -1e4);
            })
        };
        let _ =
            fenetre.add_event_listener_with_callback("pointerup", sortie.as_ref().unchecked_ref());
        ecouteurs.push(("pointerup", sortie));

        let film = Film {
            interieur,
            boucle,
            ecouteurs,
        };
        film.relancer();
        Some(film)
    }

    fn relancer(&self) {
        let mut i = self.interieur.borrow_mut();
        if i.image.is_some() {
            return;
        }
        if let Some(rappel) = self.boucle.borrow().as_ref() {
            i.image = dom::fenetre()
                .request_animation_frame(rappel.as_ref().unchecked_ref())
                .ok();
        }
    }

    /// La main ou l'appareil a changé : les formes qui en dépendent sont
    /// redessinées, et les grains s'y rendent.
    pub fn choisir(&self, main: Main, appareil: Appareil) {
        let mut i = self.interieur.borrow_mut();
        let n = i.n;
        for (index, forme) in FILM.iter().enumerate() {
            if matches!(forme, Forme::Main | Forme::Arc | Forme::Appareil) {
                if let Some(points) = formes::seule(*forme, n, main, appareil) {
                    i.formes[index] = points;
                }
            }
        }
        i.segment = usize::MAX;
        annoncer(&i.scene, main, appareil);
    }

    pub fn theme(&self, sombre: bool) {
        let mut i = self.interieur.borrow_mut();
        i.sombre = sombre;
        i.appliquer_couleurs();
    }
}

impl Interieur {
    fn appliquer_couleurs(&mut self) {
        let gl = &self.gl;
        gl.uniform3fv_with_f32_array(self.u.couleurs.as_ref(), &couleurs(self.sombre));
        if self.sombre {
            // Lumière qui s'additionne : les grains brillent sur le noir.
            gl.blend_func(Gl::ONE, Gl::ONE);
        } else {
            gl.blend_func(Gl::ONE, Gl::ONE_MINUS_SRC_ALPHA);
        }
    }

    fn charger(&mut self, segment: usize) {
        if self.segment == segment {
            return;
        }
        let gl = &self.gl;
        gl.bind_buffer(Gl::ARRAY_BUFFER, Some(&self.tampon_de));
        gl.buffer_sub_data_with_i32_and_array_buffer_view(
            Gl::ARRAY_BUFFER,
            0,
            &Float32Array::from(&self.formes[segment][..]),
        );
        gl.bind_buffer(Gl::ARRAY_BUFFER, Some(&self.tampon_vers));
        gl.buffer_sub_data_with_i32_and_array_buffer_view(
            Gl::ARRAY_BUFFER,
            0,
            &Float32Array::from(&self.formes[segment + 1][..]),
        );
        self.segment = segment;
    }

    fn dessiner(&mut self, temps: f64) {
        let l = dom::largeur_fenetre();
        let h = dom::hauteur_fenetre();
        let rect = self.piste.get_bounding_client_rect();
        // Hors de l'écran : rien à dessiner.
        if rect.bottom() < -h * 0.2 || rect.top() > h {
            return;
        }

        // La tête de lecture : la piste moins l'écran de départ et l'écran
        // de fin, partagée en autant de passages qu'il y a de formes moins une.
        let course = (rect.height() - 2.0 * h).max(1.0);
        let avance = ((-rect.top()) / course).clamp(0.0, 1.0) * (ETAPES - 1) as f64;
        let segment = (avance.floor() as usize).min(ETAPES - 2);
        let local = lisser((avance - segment as f64 - 0.15) / 0.7);
        self.charger(segment);

        let station = avance.round() as i32;
        if station != self.station {
            self.station = station;
            let _ = self
                .scene
                .set_attribute("data-station", &station.to_string());
        }

        // Taille du canevas : celle de la scène, en pixels réels (bornée à
        // deux par point, au-delà l'œil ne voit plus la différence).
        let dpr = dom::fenetre().device_pixel_ratio().min(2.0);
        let (cl, ch) = (
            self.canevas.client_width() as f64,
            self.canevas.client_height() as f64,
        );
        let (pl, ph) = ((cl * dpr) as u32, (ch * dpr) as u32);
        if self.canevas.width() != pl || self.canevas.height() != ph {
            self.canevas.set_width(pl);
            self.canevas.set_height(ph);
        }
        let gl = &self.gl;
        gl.viewport(0, 0, pl as i32, ph as i32);
        gl.clear_color(0.0, 0.0, 0.0, 0.0);
        gl.clear(Gl::COLOR_BUFFER_BIT);

        let (ax, ay, ae) = cadrage(FILM[segment], l, h);
        let (bx, by, be) = cadrage(FILM[segment + 1], l, h);
        let m = local;
        let centre = ((ax + (bx - ax) * m) * dpr, (ay + (by - ay) * m) * dpr);
        let echelle = (ae + (be - ae) * m) * dpr;

        // Le pointeur et l'inclinaison rejoignent leur cible en douceur.
        self.pointeur.0 += (self.pointeur_cible.0 - self.pointeur.0) * 0.2;
        self.pointeur.1 += (self.pointeur_cible.1 - self.pointeur.1) * 0.2;
        if self.pointeur_cible.0 < -1e3 {
            self.pointeur = self.pointeur_cible;
        }
        let cible = inclinaison::actuelle();
        self.inclinaison.0 += (cible.0 - self.inclinaison.0) * 0.08;
        self.inclinaison.1 += (cible.1 - self.inclinaison.1) * 0.08;

        let secondes = (temps - self.debut) / 1000.0;
        let entree = ((secondes - 0.4) / 2.2).clamp(0.0, 1.0);
        let u = &self.u;
        gl.uniform1f(u.melange.as_ref(), m as f32);
        gl.uniform1f(u.temps.as_ref(), secondes as f32);
        gl.uniform1f(u.entree.as_ref(), entree as f32);
        gl.uniform2f(u.resolution.as_ref(), pl as f32, ph as f32);
        gl.uniform2f(u.centre.as_ref(), centre.0 as f32, centre.1 as f32);
        gl.uniform1f(u.echelle.as_ref(), echelle as f32);
        gl.uniform1f(u.taille.as_ref(), (2.6 * dpr) as f32);
        gl.uniform2f(
            u.pointeur.as_ref(),
            (self.pointeur.0 * dpr) as f32,
            ((self.pointeur.1 - self.canevas.get_bounding_client_rect().top()) * dpr) as f32,
        );
        gl.uniform2f(
            u.inclinaison.as_ref(),
            self.inclinaison.0 as f32,
            self.inclinaison.1 as f32,
        );
        gl.bind_vertex_array(Some(&self.vao));
        gl.draw_arrays(Gl::POINTS, 0, self.n as i32);
    }
}

impl Drop for Film {
    fn drop(&mut self) {
        let fenetre = dom::fenetre();
        for (nom, ecouteur) in &self.ecouteurs {
            let _ =
                fenetre.remove_event_listener_with_callback(nom, ecouteur.as_ref().unchecked_ref());
        }
        if let Some(id) = self.interieur.borrow_mut().image.take() {
            let _ = fenetre.cancel_animation_frame(id);
        }
        self.boucle.borrow_mut().take();
        let i = self.interieur.borrow();
        let _ = i.scene.remove_attribute("data-main-rendu");
        let _ = i.scene.remove_attribute("data-appareil-rendu");
    }
}
