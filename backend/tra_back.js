const $glossPanel = document.getElementById('glossPanel');

// ---------- TRADUCTOR (lexicones + reglas) ----------
const $ = (id) => document.getElementById(id);

// UI elements
const $src = $('src');
const $tgt = $('tgt');
const $swap = $('swap');
const $in = $('input');
const $out = $('output');
const $go = $('translate');
const $copy = $('copy');
const $bar = $('bar');
const $perf = $('perf');
const $speakIn = $('speakIn');
const $speakOut = $('speakOut');
const $gloss = $('gloss');

///////////////////////////////////////////
// ===== Alert informativo al elegir lengua destino (lado derecho) =====
/*const LANG_INFO = {
    nah: 'Náhuatl: variantes regionales; ortografías pueden diferir. Este traductor usa un léxico base de ejemplo.',
    yua: 'Maya yucateco: considera la glotal (ʼ) y vocales largas. Léxico base de ejemplo.',
    zai: 'Zapoteco istmeño: alta variación por comunidad; léxico base de ejemplo.',
    mie: 'Mixteco (Magdalena Peñasco): lengua tonal; esta versión usa pares léxicos de ejemplo.',
    // es: sin alerta
};

let suppressTgtAlert = false; // bloquea alertas en cambios programáticos

// Dispara solo en cambios iniciados por el usuario
if ($tgt) {
    $tgt.addEventListener('change', (e) => {
        if (suppressTgtAlert) return;          // p.ej. al usar swap
        if (!e.isTrusted) return;               // ignora cambios por script
        const msg = LANG_INFO[$tgt.value];
        if (msg) alert(msg);
    });
}

// Si usas botón ⇄, silencia el alert al hacer el intercambio programático
if ($swap) {
    $swap.addEventListener('click', () => {
        if (!$src || !$tgt) return;
        const a = $src.value, b = $tgt.value;
        if (a !== 'auto') {
            suppressTgtAlert = true;
            $src.value = b;
            $tgt.value = a;
            // reactivamos tras el cambio
            queueMicrotask(() => { suppressTgtAlert = false; });
        }
    });
}
    */

/////////////////////////////////////////////

// Config
const LANGS = ['nah', 'yua', 'zai', 'mie', 'es']; // catálogo posible
const LEX = {}; // Cache de lexicones en memoria

function setProgress(p) {
    if ($bar) $bar.style.width = `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;
}

// Normalización ligera: minúsculas, limpieza básica
function normalize(s) {
    return (s || '')
        .toLowerCase()
        .replace(/[“”«»]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/[.,;:!?()[\]{}]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Carga un lexicón y lo pre-indexa
// Carga un lexicón y lo pre-indexa
async function loadLex(lang) {
    if (LEX[lang]) return LEX[lang];

    const url = `./backend/data/${lang}.json`;  // <-- ruta actual
    let res;
    try {
        res = await fetch(url, { cache: 'no-store' }); // evita cache duro al probar
    } catch (netErr) {
        throw new Error(`No se pudo solicitar ${url}. ¿Estás sirviendo la app con un servidor (http://) y no con file://?`);
    }

    if (!res.ok) {
        throw new Error(`No se pudo cargar ${url} (status ${res.status}). Verifica que el archivo exista y el nombre sea exacto.`);
    }

    const json = await res.json();

    const prep = (obj = { uni: {}, multi: {} }) => {
        const uni = obj.uni || {};
        const multi = obj.multi || {};
        const multiIdx = {}; // { nTokens: Map(frase → traducción) }
        for (const [k, v] of Object.entries(multi)) {
            const norm = normalize(k);
            const n = norm.split(' ').length;
            if (!multiIdx[n]) multiIdx[n] = new Map();
            multiIdx[n].set(norm, v);
        }
        return { uni, multiIdx };
    };

    LEX[lang] = {
        meta: json.meta || {},
        toEs: prep(json.toEs),
        fromEs: prep(json.fromEs),
    };
    return LEX[lang];
}


// Versión "segura": intenta cargar y si falta el archivo, lo ignora
async function loadLexSafe(lang) {
    try {
        return await loadLex(lang);
    } catch (_e) {
        // Silencioso: no existe el archivo; simplemente no estará disponible
        return null;
    }
}

// Carga solo lo necesario para (src, tgt)
// - español siempre (pivot)
// - si src==='auto', intentamos cargar TODOS los que existan de LANGS
// - si no, carga src y tgt
async function ensureLexiconsFor(src, tgt) {
    const needed = new Set(['es']);
    if (src && src !== 'auto') needed.add(src);
    if (tgt) needed.add(tgt);
    if (src === 'auto') LANGS.forEach((l) => needed.add(l));

    // Carga segura en paralelo
    await Promise.all([...needed].map(loadLexSafe));
}

// Detección basada SOLO en lexicones disponibles
function detectLangByLex(text) {
    const t = normalize(text);
    const toks = t.split(' ');
    let best = 'es';
    let bestScore = 0;

    for (const L of LANGS) {
        if (L === 'es') continue;
        const lex = LEX[L]?.toEs?.uni || null;
        if (!lex) continue; // si no se cargó (no existe archivo), lo saltamos
        let score = 0;
        for (const w of toks) if (lex[w]) score++;
        if (score > bestScore) {
            best = L;
            bestScore = score;
        }
    }
    return bestScore > 0 ? best : 'es';
}

// Traduce con diccionario (multi-palabra primero, luego unigramas)
function translateWithDict(text, dict) {
    const src = normalize(text);
    if (!src || !dict) return { out: text, gloss: [] };

    const tokens = src.split(' ');
    const gloss = [];
    const out = [];

    const N = Math.min(4, tokens.length); // n-gramas 4→2

    let i = 0;
    while (i < tokens.length) {
        let matched = false;

        for (let n = Math.min(N, tokens.length - i); n >= 2; n--) {
            const slice = tokens.slice(i, i + n).join(' ');
            const hit = dict.multiIdx?.[n]?.get(slice);
            if (hit) {
                out.push(hit);
                gloss.push({ src: slice, tgt: hit });
                i += n;
                matched = true;
                break;
            }
        }

        if (!matched) {
            const w = tokens[i];
            const t = dict.uni?.[w];
            out.push(t || w);
            gloss.push({ src: w, tgt: t || w });
            i++;
        }
    }

    return { out: out.join(' '), gloss };
}

// Pipeline con pivote en español (src→ES→tgt), tolerante a faltantes
function pivotTranslate(text, srcLang, tgtLang) {
    if (srcLang === tgtLang) return { out: text, gloss: [] };

    // ES → lengua
    if (srcLang === 'es') {
        const dict = LEX[tgtLang]?.fromEs || null;
        return translateWithDict(text, dict);
    }

    // lengua → ES
    if (tgtLang === 'es') {
        const dict = LEX[srcLang]?.toEs || null;
        return translateWithDict(text, dict);
    }

    // Pivot: src→ES, luego ES→tgt
    const step1 = translateWithDict(text, LEX[srcLang]?.toEs || null);
    const step2 = translateWithDict(step1.out, LEX[tgtLang]?.fromEs || null);
    return { out: step2.out, gloss: [...step1.gloss, ...step2.gloss] };
}

// Acción principal
async function doTranslate() {
    try {
        if (!$in || !$out) return;
        if ($go) $go.disabled = true;
        setProgress(0.1);

        const srcSel = $src?.value || 'es';
        const tgtSel = $tgt?.value || 'es';

        // Cargar solo lo necesario
        await ensureLexiconsFor(srcSel, tgtSel);

        // Detección si procede (usando SOLO lexicones cargados/ existentes)
        let src = srcSel;
        if (srcSel === 'auto') src = detectLangByLex($in.value);
        const tgt = tgtSel;

        const t0 = performance.now();
        const { out, gloss } = pivotTranslate($in.value, src, tgt);
        const t1 = performance.now();

        $out.value = out;
        if ($perf) $perf.textContent = `⏱ ${(t1 - t0).toFixed(0)} ms · ${src}→${tgt}`;

        // Glosado opcional
        // ...dentro de doTranslate(), después de setear $out.value y $perf:
        if ($gloss && $gloss.checked) {
            const lines = gloss.map(g => `${g.src} → ${g.tgt}`);
            if (lines.length) {
                if ($glossPanel) {
                    $glossPanel.textContent = `Glosado:\n` + lines.join('\n');
                    $glossPanel.hidden = false;
                }
            } else {
                if ($glossPanel) {
                    $glossPanel.hidden = true;
                    $glossPanel.textContent = '';
                }
            }
        } else {
            if ($glossPanel) {
                $glossPanel.hidden = true;
                $glossPanel.textContent = '';
            }
        }
    } catch (e) {
        console.error(e);
        if ($out) $out.value = 'Error: ' + e.message;
    } finally {
        if ($go) $go.disabled = false;
        setProgress(0);
    }
}

// Listeners
if ($go) $go.addEventListener('click', doTranslate);

if ($swap) {
    $swap.addEventListener('click', () => {
        if (!$src || !$tgt) return;
        const a = $src.value;
        const b = $tgt.value;
        if (a !== 'auto') {
            $src.value = b;
            $tgt.value = a;
        }
    });
}

if ($copy) {
    $copy.addEventListener('click', async () => {
        const txt = ($out?.value || '').trim();

        // Si no hay nada que copiar, da un pequeño feedback y sal
        if (!txt) {
            // feedback visual mínimo (sin CSS extra)
            const prevTitle = $copy.title;
            $copy.title = 'Nada para copiar';
            setTimeout(() => { $copy.title = prevTitle; }, 800);
            return;
        }

        // Guarda el HTML original (para no perder el <img>)
        const prevHTML = $copy.innerHTML;

        try {
            await navigator.clipboard.writeText(txt);
            // Muestra un check temporal (puedes usar tu propio icono)
            $copy.innerHTML = '<img src="frontend/assets/icons/check.png" alt="Copiado">';
        } catch (e) {
            console.error(e);
            $copy.innerHTML = 'Error';
        } finally {
            // Restaura el botón tal como estaba
            setTimeout(() => { $copy.innerHTML = prevHTML; }, 900);
        }
    });
}

// ===== Auto-translate mientras escribes =====
function debounce(fn, delay = 300) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), delay);
    };
}

const autoTranslate = debounce(() => {
    const txt = ($in?.value || '').trim();
    if (!txt) {
        // si está vacío, limpia salida y performance
        if ($out) $out.value = '';
        if ($perf) $perf.textContent = '';
        return;
    }
    doTranslate();
}, 300); // puedes bajar a 200–250ms

// Traducir al tipear
if ($in) $in.addEventListener('input', autoTranslate);

// Traducir al cambiar idioma origen/destino
if ($src) $src.addEventListener('change', () => doTranslate());
if ($tgt) $tgt.addEventListener('change', () => doTranslate());

// Traducir al cargar si ya hay texto (por ejemplo, al recargar)
window.addEventListener('DOMContentLoaded', () => {
    if (($in?.value || '').trim()) doTranslate();
});


/*
// TTS (garantizamos español; otras lenguas dependen de voces instaladas)
if ($speakOut) {
    $speakOut.addEventListener('click', () => {
        const u = new SpeechSynthesisUtterance($out?.value || '');
        const map = { es: 'es-ES' };
        u.lang = map[$tgt?.value] || 'es-ES';
        speechSynthesis.speak(u);
    });
}

// Dictado (fallback a es-ES)
if ($speakIn) {
    $speakIn.addEventListener('click', () => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            alert('Tu navegador no soporta reconocimiento de voz.');
            return;
        }
        const rec = new SR();
        const src = ($src?.value === 'auto') ? 'es' : ($src?.value || 'es');
        rec.lang = (src === 'es' ? 'es-ES' : 'es-ES'); // fallback
        rec.onresult = (e) => {
            if ($in) $in.value = [...e.results].map((r) => r[0].transcript).join(' ');
        };
        rec.onerror = (e) => alert('Error en dictado: ' + e.error);
        rec.start();
    });
}*/

/*
// Atajo: Ctrl/Cmd + Enter
if ($in) {
    $in.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'enter') doTranslate();
    });
}
*/

if ($go) $go.style.display = 'none';

