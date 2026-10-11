/**
 * Halloween form: private, append-only Google Sheets storage.
 *
 * Replace SPREADSHEET_ID with the private response spreadsheet ID, then deploy
 * as a Web app: execute as the spreadsheet owner, access = Anyone.
 * Send text/plain JSON to the deployment's /exec URL to avoid a CORS preflight.
 * The spreadsheet itself does not need public sharing.
 *
 * Request:
 * { action: 'submit', submissionId: UUID, name, character, musicNeeded: boolean,
 *   songTitle, musicUrl, musicTiming, notes, website: '' }
 * A successful response is returned only after the write has been flushed,
 * or when the same UUID already exists from a previously completed write.
 */
const SPREADSHEET_ID = 'REPLACE_WITH_PRIVATE_SPREADSHEET_ID';
const RESPONSE_TAB = 'Respuestas';
const HEADERS = [
  'Fecha',
  'ID',
  'Nombre',
  'Personaje',
  'Necesita música',
  'Canción',
  'Enlace',
  'Indicaciones de música',
  'Notas',
];

/** Public health check. Never returns participants or spreadsheet metadata. */
function doGet() {
  return json_({ ok: true, form: 'halloween' });
}

function doPost(event) {
  let lock;
  let locked = false;

  try {
    const record = validateSubmission_(event);
    lock = LockService.getScriptLock();
    locked = lock.tryLock(10000);
    if (!locked) {
      throw publicError_('BUSY', 'Hay varios envíos en curso. Intenta de nuevo.');
    }

    const sheet = responseSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const duplicate = sheet.getRange(2, 2, lastRow - 1, 1)
        .createTextFinder(record.submissionId)
        .matchEntireCell(true)
        .matchCase(false)
        .findNext();
      if (duplicate) {
        return json_({ saved: true, id: record.submissionId });
      }
    }

    const values = [
      new Date(),
      record.submissionId,
      record.name,
      record.character,
      record.musicNeeded ? 'Sí' : 'No',
      record.songTitle,
      record.musicUrl,
      record.musicTiming,
      record.notes,
    ].map(spreadsheetValue_);

    sheet.getRange(lastRow + 1, 1, 1, HEADERS.length).setValues([values]);
    SpreadsheetApp.flush();
    return json_({ saved: true, id: record.submissionId });
  } catch (error) {
    if (!error.publicCode) {
      console.error('Halloween submission failed:', String(error));
    }
    return json_({
      saved: false,
      error: error.publicCode || 'SAVE_FAILED',
      message: error.publicMessage || 'No pudimos guardar tu respuesta. Intenta de nuevo.',
    });
  } finally {
    if (locked) lock.releaseLock();
  }
}

/**
 * Optional one-time setup/authorization from the Apps Script editor.
 * Creates the response tab and headers if absent; never overwrites data.
 * Deploy only doGet/doPost as the public web app.
 */
function setupHalloweenSheet() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    responseSheet_();
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

function responseSheet_() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID === 'REPLACE_WITH_PRIVATE_SPREADSHEET_ID') {
    throw new Error('Configure SPREADSHEET_ID before deploying.');
  }
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(RESPONSE_TAB) || spreadsheet.insertSheet(RESPONSE_TAB);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  } else {
    const existing = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
    if (!HEADERS.every(function (header, index) { return existing[index] === header; })) {
      throw new Error('Response tab headers do not match; no data was overwritten.');
    }
  }
  return sheet;
}

function validateSubmission_(event) {
  const body = event && event.postData && event.postData.contents;
  if (typeof body !== 'string' || !body || body.length > 16000) {
    throw publicError_('INVALID_REQUEST', 'El envío no es válido.');
  }

  let input;
  try {
    input = JSON.parse(body);
  } catch (error) {
    throw publicError_('INVALID_REQUEST', 'El envío no es válido.');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.action !== 'submit') {
    throw publicError_('INVALID_REQUEST', 'El envío no es válido.');
  }

  const website = textField_(input.website, 'website', 200, false);
  if (website) throw publicError_('INVALID_REQUEST', 'El envío no es válido.');

  const submissionId = textField_(input.submissionId, 'ID', 36, true).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(submissionId)) {
    throw publicError_('INVALID_REQUEST', 'El identificador del envío no es válido.');
  }
  if (typeof input.musicNeeded !== 'boolean') {
    throw publicError_('VALIDATION_ERROR', 'Indica si necesitas música.');
  }

  const record = {
    submissionId: submissionId,
    name: textField_(input.name, 'Nombre', 120, true),
    character: textField_(input.character, 'Personaje', 160, true),
    musicNeeded: input.musicNeeded,
    songTitle: textField_(input.songTitle, 'Canción', 200, input.musicNeeded),
    musicUrl: textField_(input.musicUrl, 'Enlace', 2048, false),
    musicTiming: textField_(input.musicTiming, 'Indicaciones de música', 1000, false),
    notes: textField_(input.notes, 'Notas', 2000, false),
  };

  if (record.musicUrl && !/^https?:\/\/[^\s]+$/i.test(record.musicUrl)) {
    throw publicError_('VALIDATION_ERROR', 'El enlace de música debe comenzar con https:// o http://.');
  }
  if (!record.musicNeeded) {
    record.songTitle = '';
    record.musicUrl = '';
    record.musicTiming = '';
  }
  return record;
}

function textField_(value, label, maxLength, required) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') {
    throw publicError_('VALIDATION_ERROR', label + ' debe ser texto.');
  }
  const result = value.replace(/\r\n?/g, '\n').trim();
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)) {
    throw publicError_('VALIDATION_ERROR', label + ' contiene caracteres no válidos.');
  }
  if (required && !result) {
    throw publicError_('VALIDATION_ERROR', 'Completa el campo ' + label + '.');
  }
  if (result.length > maxLength) {
    throw publicError_('VALIDATION_ERROR', label + ' supera el máximo de ' + maxLength + ' caracteres.');
  }
  return result;
}

/** Prefix formula-like user text so Sheets stores it as literal text. */
function spreadsheetValue_(value) {
  if (typeof value === 'string' && /^[\s\uFEFF]*[=+\-@]/.test(value)) {
    return "'" + value;
  }
  return value;
}

function publicError_(code, message) {
  const error = new Error(message);
  error.publicCode = code;
  error.publicMessage = message;
  return error;
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
