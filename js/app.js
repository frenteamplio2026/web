const SIGNUP_URL = 'https://frenteamplio-signup.frenteamplio.workers.dev/signup';
const COUNT_URL = 'https://frenteamplio-signup.frenteamplio.workers.dev/count';
const TURNSTILE_SITE_KEY = '0x4AAAAAAFQRcrN2tzmkFM46';
const TOKEN_TIMEOUT = 30 * 1000; // milisegundos

// Idioma: redirige según localStorage o el idioma del navegador; las páginas viven en /, /cat/, /gal/, /eu/.
const LANG_PATHS = { es: '/', ca: '/cat/', gl: '/gal/', eu: '/eu/' };
const LANG_KEY = 'lang';
const currentLang = document.documentElement.lang in LANG_PATHS ? document.documentElement.lang : 'es';

function storeLang(lang) {
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* almacenamiento no disponible */ }
}

function preferredLang() {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored in LANG_PATHS) return stored;
  } catch { /* almacenamiento no disponible */ }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = String(tag).toLowerCase().split('-')[0];
    if (base in LANG_PATHS) return base;
  }
  return 'es';
}

const targetLang = preferredLang();
if (targetLang !== currentLang) {
  const page = location.pathname.endsWith('gracias.html') ? 'gracias.html' : '';
  location.replace(LANG_PATHS[targetLang] + page + location.search + location.hash);
} else {
  storeLang(currentLang);
}

for (const link of document.querySelectorAll('.lang-switch a[data-lang]')) {
  link.addEventListener('click', () => storeLang(link.dataset.lang));
}

const MESSAGES = {
  es: {
    success: 'Registrado con éxito! Gracias por apuntarte!',
    fields: { name: 'nombre', surname: 'apellidos', email: 'email', postal_code: 'código postal', consent: 'aceptación de la política de privacidad' },
    errors: {
      captcha_failed: 'No hemos podido verificar el envío. Recarga la página e inténtalo de nuevo.',
      rate_limited: 'Demasiados envíos. Espera un minuto e inténtalo de nuevo.',
      turnstile_not_loaded: 'No se pudo cargar la verificación antispam. Si usas un bloqueador de contenido, desactívalo para esta página.'
    },
    defaultError: 'Algo ha debido de salir mal. Por favor, inténtalo de nuevo en unos minutos.',
    review: 'Revisa estos campos:',
    sending: 'Enviando...',
    submit: 'Apuntarme',
    count: 'apoyos recibidos'
  },
  ca: {
    success: 'Registrat amb èxit! Gràcies per apuntar-te!',
    fields: { name: 'nom', surname: 'cognoms', email: 'correu electrònic', postal_code: 'codi postal', consent: 'acceptació de la política de privacitat' },
    errors: {
      captcha_failed: 'No hem pogut verificar l\'enviament. Recarrega la pàgina i torna-ho a provar.',
      rate_limited: 'Massa enviaments. Espera un minut i torna-ho a provar.',
      turnstile_not_loaded: 'No s\'ha pogut carregar la verificació antispam. Si fas servir un bloquejador de contingut, desactiva\'l per a aquesta pàgina.'
    },
    defaultError: 'Alguna cosa hauria de sortir malament. Si us plau, torna-ho a provar en uns minuts.',
    review: 'Revisa aquests camps:',
    sending: 'Enviant...',
    submit: 'Apuntar-me',
    count: 'suports rebuts'
  },
  gl: {
    success: 'Rexistrado con éxito! Grazas por apuntarte!',
    fields: { name: 'nome', surname: 'apelidos', email: 'correo electrónico', postal_code: 'código postal', consent: 'aceptación da política de privacidade' },
    errors: {
      captcha_failed: 'Non puidemos verificar o envío. Recarga a páxina e téntao de novo.',
      rate_limited: 'Demasiados envíos. Agarda un minuto e téntao de novo.',
      turnstile_not_loaded: 'Non se puido cargar a verificación antispam. Se usas un bloqueador de contido, desactívao para esta páxina.'
    },
    defaultError: 'Algo fallou. Por favor, téntao de novo en uns minutos.',
    review: 'Revisa estes campos:',
    sending: 'Enviando...',
    submit: 'Apuntarme',
    count: 'apoios recibidos'
  },
  eu: {
    success: 'Ondo erregistratu da! Eskerrik asko izena emateagatik!',
    fields: { name: 'izena', surname: 'abizenak', email: 'posta elektronikoa', postal_code: 'posta kodea', consent: 'pribatutasun-politikaren onarpena' },
    errors: {
      captcha_failed: 'Ezin izan dugu bidalketa egiaztatu. Kargatu orria berriro eta saiatu berriro.',
      rate_limited: 'Bidalketa gehiegi. Itxaron minutu bat eta saiatu berriro.',
      turnstile_not_loaded: 'Ezin izan da spam-aren aurkako egiaztapena kargatu. Eduki-blokeatzailerik erabiltzen baduzu, desaktibatu orri honetarako.'
    },
    defaultError: 'Zerbait gaizki atera da. Mesedez, saiatu berriro minutu batzuetara.',
    review: 'Berrikusi eremu hauek:',
    sending: 'Bidaltzen...',
    submit: 'Izena eman',
    count: 'babes jaso dira'
  }
};
const T = MESSAGES[currentLang];
const SUCCESS_MESSAGE = T.success;
const FIELD_LABELS = T.fields;
const ERROR_MESSAGES = T.errors;
const DEFAULT_ERROR = T.defaultError;
const LOCALES = { es: 'es-ES', ca: 'ca-ES', gl: 'gl-ES', eu: 'eu-ES' };

const form = document.querySelector('#registration-form');
const submitButton = document.querySelector('#submit-button');
const formMessage = document.querySelector('#form-message');
const hdp = document.querySelector(`#country`);
const signupCount = document.querySelector('#signup-count');

async function loadSignupCount() {
  if (!signupCount) return;
  try {
    const response = await fetch(COUNT_URL);
    if (!response.ok) return;
    const { count } = await response.json();
    if (!Number.isInteger(count) || count < 10000) return;
    signupCount.innerHTML = `<strong>${count.toLocaleString(LOCALES[currentLang])}</strong> ${T.count}`;
    signupCount.hidden = false;
  } catch {}
}

loadSignupCount();

let widgetId = null;
let turnstileLoadFailed = false;
let challengeVisible = false;
let turnstileToken = null;
let tokenWaiters = [];

function settleWaiters(error) {
  for (const { resolve, reject } of tokenWaiters.splice(0)) {
    if (error) {
      reject(error);
    } else {
      resolve(turnstileToken);
    }
  }
}

// Llamada si el script de Turnstile no carga (p. ej. por un bloqueador; atributo onerror en index.html).
window.onTurnstileLoadError = () => {
  turnstileLoadFailed = true;
  settleWaiters(new Error('turnstile_not_loaded'));
};

// Llamada por el script de Turnstile al cargar (parámetro onload en index.html).
window.onTurnstileLoad = () => {
  widgetId = turnstile.render('#turnstile', {
    sitekey: TURNSTILE_SITE_KEY,
    action: 'signup',
    appearance: 'interaction-only',
    'refresh-expired': 'auto',
    'before-interactive-callback': () => {
      challengeVisible = true;
    },
    'after-interactive-callback': () => {
      challengeVisible = false;
    },
    callback: (token) => {
      turnstileToken = token;
      settleWaiters();
    },
    'expired-callback': () => {
      turnstileToken = null;
    },
    'error-callback': () => {
      turnstileToken = null;
      settleWaiters(new Error('turnstile'));
    }
  });
};

// El token se genera en segundo plano al cargar la página; normalmente ya está listo al enviar.
// Si el script aún está cargando (conexión lenta) o se está generando el token, se espera.
function getTurnstileToken() {
  if (turnstileToken) return Promise.resolve(turnstileToken);
  if (turnstileLoadFailed) return Promise.reject(new Error('turnstile_not_loaded'));
  return new Promise((resolve, reject) => {
    let timer;
    const waiter = {
      resolve: (token) => { clearTimeout(timer); resolve(token); },
      reject: (error) => { clearTimeout(timer); reject(error); }
    };
    const onTimeout = () => {
      // No se corta a una persona que está resolviendo el reto interactivo.
      if (challengeVisible) {
        timer = setTimeout(onTimeout, TOKEN_TIMEOUT);
        return;
      }
      tokenWaiters = tokenWaiters.filter((w) => w !== waiter);
      reject(new Error(widgetId === null ? 'turnstile_not_loaded' : 'turnstile_timeout'));
    };
    timer = setTimeout(onTimeout, TOKEN_TIMEOUT);
    tokenWaiters.push(waiter);
  });
}

function resetTurnstile() {
  // Cada token es de un solo uso.
  turnstileToken = null;
  if (widgetId !== null) turnstile.reset(widgetId);
}

function showMessage(text, type) {
  formMessage.textContent = text;
  formMessage.className = `form-message is-${type}`;
}

function clearFeedback() {
  showMessage('', 'empty');
  for (const input of form.querySelectorAll('[aria-invalid]')) input.removeAttribute('aria-invalid');
}

function showError(error, fields = []) {
  if (error !== 'invalid_fields' || !fields.length) {
    showMessage(ERROR_MESSAGES[error] ?? DEFAULT_ERROR, 'error');
    return;
  }
  for (const field of fields) form.elements[field]?.setAttribute('aria-invalid', 'true');
  form.elements[fields[0]]?.focus();
  showMessage(`${T.review} ${fields.map((f) => FIELD_LABELS[f] ?? f).join(', ')}.`, 'error');
}

function showSuccess() {
  form.reset();
  showMessage(SUCCESS_MESSAGE, 'success');
}

form?.addEventListener('input', (event) => event.target.removeAttribute('aria-invalid'));

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearFeedback();

  if (hdp.value.trim()) {
    showSuccess();
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = T.sending;

  try {
    const body = new URLSearchParams(new FormData(form));
    body.delete(hdp.name);
    body.set('cf-turnstile-response', await getTurnstileToken());

    // URLSearchParams se envía como application/x-www-form-urlencoded: petición CORS simple, sin preflight.
    const response = await fetch(SIGNUP_URL, { method: 'POST', body });
    if (response.ok) {
      window.location.assign('./gracias.html');
    } else {
      const { error, fields } = await response.json().catch(() => ({}));
      showError(error, Array.isArray(fields) ? fields : []);
    }
  } catch (err) {
    showError(err.message);
  } finally {
    resetTurnstile();
    submitButton.disabled = false;
    submitButton.textContent = T.submit;
  }
});
