(() => {
  'use strict';

  const form = document.getElementById('halloween-form');
  const musicChoice = document.getElementById('music-needed');
  const musicFields = document.getElementById('music-fields');
  const songTitle = document.getElementById('song-title');
  const status = document.getElementById('form-status');
  const submitButton = document.getElementById('submit-button');
  const submitLabel = document.getElementById('submit-label');
  const spinner = document.getElementById('submit-spinner');
  const arrow = document.getElementById('submit-arrow');
  const successPanel = document.getElementById('success-panel');
  const formContent = document.getElementById('form-content');
  const storageKey = 'halloween-pending-submission-v1';
  let submitting = false;
  let pending = readPending();

  function readPending() {
    try {
      const stored = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      return stored && typeof stored.id === 'string' && typeof stored.fingerprint === 'string' ? stored : null;
    } catch {
      return null;
    }
  }

  function savePending(value) {
    pending = value;
    try {
      if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
      else sessionStorage.removeItem(storageKey);
    } catch {
      // The in-memory ID still protects retries while this page stays open.
    }
  }

  function makeId() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    if (globalThis.crypto?.getRandomValues) {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
    return `entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function updateMusicFields() {
    const needsMusic = musicChoice.value === 'yes';
    musicFields.hidden = !needsMusic;
    musicFields.disabled = !needsMusic;
    songTitle.required = needsMusic;
    if (!needsMusic) {
      musicFields.querySelectorAll('input, textarea').forEach(clearFieldError);
    }
  }

  function clearFieldError(field) {
    field.removeAttribute('aria-invalid');
    const message = document.getElementById(`${field.id}-error`);
    if (message) {
      message.hidden = true;
      message.textContent = '';
    }
  }

  function setFieldError(field, message) {
    field.setAttribute('aria-invalid', 'true');
    const error = document.getElementById(`${field.id}-error`);
    if (error) {
      error.textContent = message;
      error.hidden = false;
    }
  }

  function showStatus(message, kind = 'error') {
    status.textContent = message;
    status.dataset.kind = kind;
    status.hidden = false;
  }

  function clearStatus() {
    status.hidden = true;
    status.textContent = '';
  }

  function endpoint() {
    const configured = window.HALLOWEEN_CONFIG?.endpoint;
    if (typeof configured !== 'string' || !configured.trim()) return null;
    try {
      const url = new URL(configured.trim());
      return url.protocol === 'https:' ? url.href : null;
    } catch {
      return null;
    }
  }

  function validate() {
    let firstInvalid = null;
    const fields = Array.from(form.querySelectorAll('input, select, textarea')).filter(field => !field.disabled && field.id !== 'website');
    fields.forEach(field => {
      clearFieldError(field);
      const value = field.value.trim();
      let message = '';
      if (field.required && !value) {
        message = {
          name: 'Escribe tu nombre completo.',
          character: 'Cuéntanos qué personaje o disfraz usarás.',
          'music-needed': 'Selecciona si necesitas música.',
          'song-title': 'Escribe el nombre de la canción y el artista.'
        }[field.id] || 'Completa este campo.';
      } else if (field.id === 'music-url' && value) {
        try {
          const url = new URL(value);
          if (!['https:', 'http:'].includes(url.protocol)) throw new Error('invalid protocol');
        } catch {
          message = 'Usa un enlace completo que comience con https:// o http://.';
        }
      } else if (field.maxLength > 0 && value.length > field.maxLength) {
        message = `Usa ${field.maxLength} caracteres o menos.`;
      }
      if (message) {
        setFieldError(field, message);
        if (!firstInvalid) firstInvalid = field;
      }
    });
    if (firstInvalid) firstInvalid.focus();
    return !firstInvalid;
  }

  function readEntry() {
    const needsMusic = musicChoice.value === 'yes';
    const value = id => document.getElementById(id).value.trim();
    return {
      action: 'submit',
      name: value('name'),
      character: value('character'),
      musicNeeded: needsMusic,
      songTitle: needsMusic ? value('song-title') : '',
      musicUrl: needsMusic ? value('music-url') : '',
      musicTiming: needsMusic ? value('music-timing') : '',
      notes: value('notes'),
      website: value('website')
    };
  }

  function setSubmitting(value) {
    submitting = value;
    submitButton.disabled = value;
    submitLabel.textContent = value ? 'Guardando tu presentación…' : 'Enviar mi presentación';
    spinner.hidden = !value;
    arrow.hidden = value;
    form.setAttribute('aria-busy', String(value));
    form.querySelectorAll('input, select, textarea').forEach(field => {
      if (value) field.dataset.wasDisabled = String(field.disabled);
      field.disabled = value || field.dataset.wasDisabled === 'true';
      if (!value) delete field.dataset.wasDisabled;
    });
    if (!value) updateMusicFields();
  }

  function renderSuccess(entry) {
    const summary = document.getElementById('success-summary');
    summary.replaceChildren();
    const rows = [
      ['Nombre', entry.name],
      ['Personaje', entry.character],
      ['Música', entry.musicNeeded ? entry.songTitle : 'Sin música']
    ];
    rows.forEach(([label, value]) => {
      const row = document.createElement('div');
      row.className = 'summary-row';
      const labelElement = document.createElement('span');
      labelElement.className = 'summary-label';
      labelElement.textContent = label;
      const valueElement = document.createElement('span');
      valueElement.className = 'summary-value';
      valueElement.textContent = value;
      row.append(labelElement, valueElement);
      summary.append(row);
    });
    document.getElementById('success-message').textContent = `${entry.name}, tu presentación quedó registrada.`;
    formContent.hidden = true;
    successPanel.hidden = false;
    successPanel.focus();
    successPanel.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  }

  musicChoice.addEventListener('change', () => {
    clearFieldError(musicChoice);
    updateMusicFields();
  });
  form.addEventListener('input', event => {
    if (event.target.matches('input, textarea, select')) clearFieldError(event.target);
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting) return;
    clearStatus();
    if (!validate()) return;
    const destination = endpoint();
    if (!destination) {
      showStatus('El formulario todavía no está listo para recibir inscripciones. Intenta de nuevo más tarde.', 'notice');
      status.scrollIntoView({ block: 'nearest' });
      return;
    }
    const entry = readEntry();
    const fingerprint = JSON.stringify(entry);
    if (!pending || pending.fingerprint !== fingerprint) savePending({ id: makeId(), fingerprint });
    const payload = { ...entry, submissionId: pending.id };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    setSubmitting(true);
    try {
      const response = await fetch(destination, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow',
        signal: controller.signal
      });
      if (!response.ok) throw new Error('server');
      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error('unconfirmed');
      }
      if (result.saved !== true || result.id !== payload.submissionId) {
        if (result.error === 'closed') throw new Error('closed');
        throw new Error('unconfirmed');
      }
      savePending(null);
      renderSuccess(entry);
    } catch (error) {
      const message = error.message === 'closed'
        ? 'Las inscripciones están cerradas. Contacta a la persona que organiza la presentación.'
        : 'No pudimos confirmar que tu presentación se guardó. Revisa tu conexión y vuelve a enviar; conservamos tu código para evitar duplicados.';
      showStatus(message);
      status.scrollIntoView({ block: 'nearest' });
    } finally {
      clearTimeout(timeout);
      setSubmitting(false);
    }
  });

  document.getElementById('another-entry').addEventListener('click', () => {
    savePending(null);
    form.reset();
    form.querySelectorAll('input, select, textarea').forEach(clearFieldError);
    updateMusicFields();
    clearStatus();
    successPanel.hidden = true;
    formContent.hidden = false;
    document.getElementById('name').focus();
  });

  updateMusicFields();
  if (!endpoint()) {
    showStatus('El formulario todavía no está listo para recibir inscripciones. Intenta de nuevo más tarde.', 'notice');
  }
})();
