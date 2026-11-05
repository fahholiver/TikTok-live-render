/**
 * Veo -> Google Drive
 *
 * Web app do Apps Script: você digita o prompt no celular, o script pede o
 * vídeo à API Gemini (Veo) e um gatilho de 1 em 1 minuto verifica o andamento.
 * Quando o vídeo fica pronto, ele é baixado e salvo numa pasta do seu Drive.
 *
 * Propriedades do script (Configurações do projeto > Propriedades do script):
 *   GEMINI_API_KEY  (obrigatória) chave criada no Google AI Studio
 *   VEO_MODEL       (opcional)    padrão: veo-3.1-fast-generate-preview
 *   DRIVE_FOLDER    (opcional)    nome da pasta, padrão: Veo
 */

var API_BASE = 'https://generativelanguage.googleapis.com/v1beta/';
var DEFAULT_MODEL = 'veo-3.1-fast-generate-preview';
var DEFAULT_FOLDER = 'Veo';
var JOBS_KEY = 'VEO_JOBS';
var MAX_JOBS_LISTED = 20;

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Veo → Drive')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Chamado pela página: inicia a geração e devolve a lista de trabalhos. */
function startJob(form) {
  var prompt = String(form && form.prompt || '').trim();
  if (!prompt) throw new Error('Escreva um prompt.');
  if (prompt.length > 4000) throw new Error('Prompt longo demais.');

  var aspect = form.aspectRatio === '9:16' ? '9:16' : '16:9';
  var model = config_('VEO_MODEL', DEFAULT_MODEL);

  var body = {
    instances: [{ prompt: prompt }],
    parameters: { aspectRatio: aspect }
  };
  var negative = String(form.negativePrompt || '').trim();
  if (negative) body.parameters.negativePrompt = negative;

  var res = api_('models/' + model + ':predictLongRunning', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(body)
  });

  updateJobs_(function (jobs) {
    jobs.unshift({
      id: Utilities.getUuid(),
      operation: res.name,
      prompt: prompt,
      aspect: aspect,
      model: model,
      status: 'gerando',
      createdAt: new Date().toISOString()
    });
    return jobs;
  });
  ensurePollTrigger_();
  return listJobs();
}

/** Chamado pela página para mostrar o andamento. */
function listJobs() {
  return readJobs_().slice(0, MAX_JOBS_LISTED);
}

/** Executado pelo gatilho a cada minuto (e pelo botão "Atualizar"). */
function pollJobs() {
  var pending = readJobs_().filter(function (j) { return j.status === 'gerando'; });
  pending.forEach(function (job) {
    var patch;
    try {
      patch = checkJob_(job);
    } catch (err) {
      patch = { status: 'erro', error: String(err.message || err) };
    }
    if (patch) {
      updateJobs_(function (jobs) {
        jobs.forEach(function (j) {
          if (j.id === job.id) Object.keys(patch).forEach(function (k) { j[k] = patch[k]; });
        });
        return jobs;
      });
    }
  });

  var stillPending = readJobs_().some(function (j) { return j.status === 'gerando'; });
  if (!stillPending) removePollTrigger_();
  return listJobs();
}

/** Remove da lista os trabalhos concluídos ou com erro (os vídeos ficam no Drive). */
function clearFinished() {
  updateJobs_(function (jobs) {
    return jobs.filter(function (j) { return j.status === 'gerando'; });
  });
  return listJobs();
}

/** Rode uma vez pelo editor para autorizar o script e testar a chave. */
function setup() {
  config_('GEMINI_API_KEY');
  api_('models/' + config_('VEO_MODEL', DEFAULT_MODEL), { method: 'get' });
  getFolder_();
  Logger.log('Tudo certo. Agora faça Implantar > Nova implantação > App da Web.');
}

// ---------------------------------------------------------------- internos

function checkJob_(job) {
  var op = api_(job.operation, { method: 'get' });
  if (!op.done) {
    // A API descarta operações depois de alguns dias; evita ficar preso para sempre.
    var ageHours = (Date.now() - new Date(job.createdAt).getTime()) / 36e5;
    return ageHours > 24 ? { status: 'erro', error: 'Tempo esgotado.' } : null;
  }
  if (op.error) return { status: 'erro', error: op.error.message || 'Falha na geração.' };

  var gen = op.response && op.response.generateVideoResponse;
  var sample = gen && gen.generatedSamples && gen.generatedSamples[0];
  var uri = sample && sample.video && sample.video.uri;
  if (!uri) {
    var reason = gen && gen.raiFilteredReasons && gen.raiFilteredReasons.join(' ');
    return { status: 'erro', error: reason || 'A API não devolveu vídeo (possível filtro de segurança).' };
  }

  var video = UrlFetchApp.fetch(uri, {
    headers: { 'x-goog-api-key': config_('GEMINI_API_KEY') },
    followRedirects: true,
    muteHttpExceptions: true
  });
  if (video.getResponseCode() !== 200) {
    throw new Error('Download falhou (HTTP ' + video.getResponseCode() + ').');
  }

  var name = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HH-mm-ss') +
    '_' + slug_(job.prompt) + '.mp4';
  var file = getFolder_().createFile(video.getBlob().setName(name).setContentType('video/mp4'));
  file.setDescription('Veo (' + job.model + ', ' + job.aspect + '): ' + job.prompt);
  return { status: 'pronto', fileUrl: file.getUrl(), fileName: name, finishedAt: new Date().toISOString() };
}

function api_(path, options) {
  options.headers = { 'x-goog-api-key': config_('GEMINI_API_KEY') };
  options.muteHttpExceptions = true;
  var res = UrlFetchApp.fetch(API_BASE + path, options);
  var text = res.getContentText();
  var data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (e) { /* resposta não JSON */ }
  if (res.getResponseCode() >= 300) {
    var msg = (data.error && data.error.message) || text.slice(0, 300);
    throw new Error('API Gemini (HTTP ' + res.getResponseCode() + '): ' + msg);
  }
  return data;
}

function config_(key, fallback) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  if (value) return value.trim();
  if (fallback !== undefined) return fallback;
  throw new Error('Defina a propriedade do script ' + key + '.');
}

function getFolder_() {
  var name = config_('DRIVE_FOLDER', DEFAULT_FOLDER);
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

function readJobs_() {
  var raw = PropertiesService.getScriptProperties().getProperty(JOBS_KEY);
  return raw ? JSON.parse(raw) : [];
}

function updateJobs_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var jobs = fn(readJobs_()).slice(0, 50); // mantém a propriedade abaixo do limite de 9 KB
    PropertiesService.getScriptProperties().setProperty(JOBS_KEY, JSON.stringify(jobs));
  } finally {
    lock.releaseLock();
  }
}

function ensurePollTrigger_() {
  var exists = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'pollJobs';
  });
  if (!exists) ScriptApp.newTrigger('pollJobs').timeBased().everyMinutes(1).create();
}

function removePollTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'pollJobs') ScriptApp.deleteTrigger(t);
  });
}

function slug_(text) {
  return String(text).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 40) || 'video';
}
