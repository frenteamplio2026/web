const PRESS_URL = 'https://frenteamplio-signup.frenteamplio.workers.dev/press';
const TURNSTILE_SITE_KEY = '0x4AAAAAAFQRcrN2tzmkFM46';
const TOKEN_TIMEOUT = 30 * 1000; // milisegundos

const SUCCESS_MESSAGE = 'Solicitud recibida. Os confirmaremos la acreditación por email.';
const FIELD_LABELS = {
  name: 'nombre',
  surname: 'apellidos',
  outlet: 'medio',
  role: 'función en el medio',
  phone: 'teléfono',
  email: 'email',
  consent: 'aceptación de la política de privacidad'
};
const ERROR_MESSAGES = {
  captcha_failed: 'No hemos podido verificar el envío. Recarga la página e inténtalo de nuevo.',
  rate_limited: 'Demasiados envíos. Espera un minuto e inténtalo de nuevo.',
  turnstile_not_loaded: 'No se pudo cargar la verificación antispam. Si usas un bloqueador de contenido, desactívalo para esta página.'
};
const DEFAULT_ERROR = 'No se pudo enviar la solicitud. Por favor, inténtalo de nuevo.';
const BUTTON_LABEL = 'Solicitar acreditación';

const form = document.querySelector('#press-form');
const submitButton = document.querySelector('#submit-button');
const formMessage = document.querySelector('#form-message');
const hdp = document.querySelector('#country');

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

window.onTurnstileLoadError = () => {
  turnstileLoadFailed = true;
  settleWaiters(new Error('turnstile_not_loaded'));
};

window.onTurnstileLoad = () => {
  widgetId = turnstile.render('#turnstile', {
    sitekey: TURNSTILE_SITE_KEY,
    action: 'press',
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
  showMessage(`Revisa estos campos: ${fields.map((f) => FIELD_LABELS[f] ?? f).join(', ')}.`, 'error');
}

function showSuccess() {
  form.reset();
  showMessage(SUCCESS_MESSAGE, 'success');
}

form.addEventListener('input', (event) => event.target.removeAttribute('aria-invalid'));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearFeedback();

  if (hdp.value.trim()) {
    showSuccess();
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Enviando...';

  try {
    const body = new URLSearchParams(new FormData(form));
    body.delete(hdp.name);
    body.set('cf-turnstile-response', await getTurnstileToken());

    const response = await fetch(PRESS_URL, { method: 'POST', body });
    if (response.ok) {
      showSuccess();
    } else {
      const { error, fields } = await response.json().catch(() => ({}));
      showError(error, Array.isArray(fields) ? fields : []);
    }
  } catch (err) {
    showError(err.message);
  } finally {
    resetTurnstile();
    submitButton.disabled = false;
    submitButton.textContent = BUTTON_LABEL;
  }
});
