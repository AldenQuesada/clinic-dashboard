#!/usr/bin/env node
/**
 * Patch do workflow n8n da Mira: adiciona branch de audio (Groq Whisper).
 *
 * Modifica:
 *  1. Parse Message — detecta audioMessage em vez de descartar
 *  2. Injeta nos apos "Should Skip?":
 *      Is Audio?  → (true)  Cap Duration → Download Media → Transcribe Groq → Process Voice
 *                   (false) Tier 1 — Handle Message (existente)
 *  3. Ambos convergem em "Need Tier 2?" (mantem Tier 2 pra texto unknown)
 *
 * Uso: node scripts/patch-mira-workflow-voice.cjs
 */

const fs = require('fs');
const path = require('path');

const INPUT  = path.join(__dirname, '..', 'n8n', 'mira-whatsapp-workflow.json');
const OUTPUT = INPUT; // in-place

const wf = JSON.parse(fs.readFileSync(INPUT, 'utf8'));

// ============================================================
// 1. Substitui Parse Message — agora detecta audio
// ============================================================
const newParseCode = `
const body = $input.first().json.body || $input.first().json;
const data = body.data || body;
const instance = body.instance || '';
const event = body.event || 'messages.upsert';

if (event !== 'messages.upsert') return [{ json: { skip: true, reason: 'not messages.upsert' } }];
const key = data.key || {};
if (key.fromMe) return [{ json: { skip: true, reason: 'fromMe' } }];
const rawJid = key.remoteJid || '';
if (rawJid.includes('@g.us') || rawJid.includes('@broadcast') || rawJid.includes('@newsletter')) {
  return [{ json: { skip: true, reason: 'group/broadcast' } }];
}

// Phone extraction (mesma logica)
let phoneSource = '';
if (rawJid.includes('@lid') && key.senderPn) phoneSource = key.senderPn;
else if (key.senderPn) phoneSource = key.senderPn;
else if (key.participantPn) phoneSource = key.participantPn;
else phoneSource = rawJid;
const phone = phoneSource.replace(/@.*/, '').replace(/\\D/g, '');
if (!phone || phone.length < 10) return [{ json: { skip: true, reason: 'no phone' } }];

const msg = data.message || {};

// Detecta audio (voice notes do WhatsApp, opus)
const audioMsg = msg.audioMessage || msg.ephemeralMessage?.message?.audioMessage;
if (audioMsg) {
  const durationS = parseInt(audioMsg.seconds || 0, 10);
  return [{ json: {
    skip: false,
    type: 'audio',
    phone,
    instance,
    text: '',
    messageId: key.id || null,
    audioMime: audioMsg.mimetype || 'audio/ogg',
    audioDurationS: durationS
  } }];
}

// Texto
const text = msg.conversation || msg.extendedTextMessage?.text || '';
if (!text) return [{ json: { skip: true, reason: 'no text' } }];

return [{ json: {
  skip: false,
  type: 'text',
  phone,
  instance,
  text: text.trim().slice(0, 500),
  messageId: key.id || null
} }];
`.trim();

const parseNode = wf.nodes.find(n => n.name === 'Parse Message');
if (!parseNode) throw new Error('Parse Message node nao encontrado');
parseNode.parameters.jsCode = newParseCode;

// ============================================================
// 2. Novo node: "Is Audio?" — roteia audio vs texto
// ============================================================
const isAudioNode = {
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [
        { id: 'audio-check', leftValue: '={{ $json.type }}', rightValue: 'audio', operator: { type: 'string', operation: 'equals' } }
      ],
      combinator: 'and'
    },
    options: {}
  },
  id: 'mira-is-audio-if',
  name: 'Is Audio?',
  type: 'n8n-nodes-base.if',
  typeVersion: 2,
  position: [900, 300]
};

// ============================================================
// 3. Cap Duration — rejeita audio > 60s sem chamar Groq
// ============================================================
const capDurationNode = {
  parameters: {
    jsCode: `
const j = $input.first().json;
const dur = parseInt(j.audioDurationS || 0, 10);
const MAX_S = 60;
if (dur > MAX_S) {
  // Flag pra skip download + transcription; process_voice vai responder "muito longo"
  return [{ json: { ...j, voiceStatus: 'too_long', skipTranscribe: true } }];
}
return [{ json: { ...j, voiceStatus: 'ok', skipTranscribe: false } }];
`.trim()
  },
  id: 'mira-cap-duration',
  name: 'Cap Duration',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [1120, 180]
};

// ============================================================
// 4. Skip Transcribe? — IF pra pular Groq quando too_long
// ============================================================
const skipTranscribeIfNode = {
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [
        { id: 'skip-trans', leftValue: '={{ $json.skipTranscribe }}', rightValue: true, operator: { type: 'boolean', operation: 'true' } }
      ],
      combinator: 'and'
    },
    options: {}
  },
  id: 'mira-skip-trans-if',
  name: 'Skip Transcribe?',
  type: 'n8n-nodes-base.if',
  typeVersion: 2,
  position: [1340, 180]
};

// ============================================================
// 5. Download Media (Evolution API)
//    POST http://n8n_evolution-api:8080/chat/getBase64FromMediaMessage/{instance}
//    body: { message: { key: { id: messageId } } }
// ============================================================
const downloadMediaNode = {
  parameters: {
    method: 'POST',
    url: '=http://n8n_evolution-api:8080/chat/getBase64FromMediaMessage/{{ $json.instance }}',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendHeaders: true,
    headerParameters: {
      parameters: [ { name: 'Content-Type', value: 'application/json' } ]
    },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={\n  "message": {\n    "key": {\n      "id": "{{ $json.messageId }}"\n    }\n  },\n  "convertToMp4": false\n}',
    options: { timeout: 15000 }
  },
  id: 'mira-download-media',
  name: 'Download Media',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [1560, 80],
  credentials: {
    httpHeaderAuth: { id: 'ezmaPVK9AyfxTg4c', name: 'Mira — Evolution API' }
  }
};

// ============================================================
// 6. Transcribe (Groq Whisper)
//    POST https://api.groq.com/openai/v1/audio/transcriptions
//    multipart: file=base64->binary, model=whisper-large-v3-turbo, language=pt
// ============================================================
const transcribeNode = {
  parameters: {
    jsCode: `
// Converte base64 da Evolution pra multipart e chama Groq Whisper
const prev = $('Cap Duration').first().json;
const down = $input.first().json;

// Evolution retorna { base64: '...', mimetype: '...' } ou similar
const base64 = down.base64 || down.buffer || down.data;
if (!base64) {
  return [{ json: {
    ...prev,
    voiceStatus: 'failed',
    voiceError: 'no base64 from evolution',
    transcript: ''
  } }];
}

const buffer = Buffer.from(base64, 'base64');
const GROQ_KEY = $env.GROQ_API_KEY || '{{GROQ_API_KEY_PLACEHOLDER}}';

if (!GROQ_KEY || GROQ_KEY.includes('PLACEHOLDER')) {
  return [{ json: {
    ...prev,
    voiceStatus: 'failed',
    voiceError: 'GROQ_API_KEY nao configurada',
    transcript: ''
  } }];
}

// multipart/form-data manual (n8n sem ambiente node_modules completo)
const boundary = '----n8nmira' + Math.random().toString(36).slice(2);
const CRLF = '\\r\\n';
const parts = [];
parts.push(Buffer.from('--' + boundary + CRLF));
parts.push(Buffer.from('Content-Disposition: form-data; name="file"; filename="audio.ogg"' + CRLF));
parts.push(Buffer.from('Content-Type: ' + (prev.audioMime || 'audio/ogg') + CRLF + CRLF));
parts.push(buffer);
parts.push(Buffer.from(CRLF + '--' + boundary + CRLF));
parts.push(Buffer.from('Content-Disposition: form-data; name="model"' + CRLF + CRLF));
parts.push(Buffer.from('whisper-large-v3-turbo'));
parts.push(Buffer.from(CRLF + '--' + boundary + CRLF));
parts.push(Buffer.from('Content-Disposition: form-data; name="language"' + CRLF + CRLF));
parts.push(Buffer.from('pt'));
parts.push(Buffer.from(CRLF + '--' + boundary + CRLF));
parts.push(Buffer.from('Content-Disposition: form-data; name="response_format"' + CRLF + CRLF));
parts.push(Buffer.from('json'));
parts.push(Buffer.from(CRLF + '--' + boundary + '--' + CRLF));
const body = Buffer.concat(parts);

const resp = await this.helpers.httpRequest({
  method: 'POST',
  url: 'https://api.groq.com/openai/v1/audio/transcriptions',
  headers: {
    'Authorization': 'Bearer ' + GROQ_KEY,
    'Content-Type': 'multipart/form-data; boundary=' + boundary
  },
  body: body,
  returnFullResponse: false,
  timeout: 20000
});

const transcript = (resp && resp.text) || '';

// Custo estimado: Groq whisper-large-v3-turbo = $0.04/h
const costUsd = Number(((prev.audioDurationS || 0) / 3600 * 0.04).toFixed(6));

return [{ json: {
  ...prev,
  voiceStatus: 'ok',
  transcript: transcript.trim(),
  costUsd,
  provider: 'groq',
  model: 'whisper-large-v3-turbo'
} }];
`.trim()
  },
  id: 'mira-transcribe',
  name: 'Transcribe Groq',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [1780, 80]
};

// ============================================================
// 7. Call Process Voice (Supabase RPC)
// ============================================================
const processVoiceNode = {
  parameters: {
    method: 'POST',
    url: 'https://oqboitkpcvuaudouwvkl.supabase.co/rest/v1/rpc/wa_pro_process_voice',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpCustomAuth',
    sendHeaders: true,
    headerParameters: {
      parameters: [ { name: 'Content-Type', value: 'application/json' } ]
    },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "p_phone": "{{ $json.phone }}",\n  "p_transcript": {{ JSON.stringify($json.transcript || '') }},\n  "p_duration_s": {{ $json.audioDurationS || 0 }},\n  "p_message_id": {{ JSON.stringify($json.messageId || '') }},\n  "p_audio_mime": {{ JSON.stringify($json.audioMime || '') }},\n  "p_model": "whisper-large-v3-turbo",\n  "p_provider": "groq",\n  "p_cost_usd": {{ $json.costUsd || 0 }},\n  "p_status": "{{ $json.voiceStatus || 'ok' }}",\n  "p_error": {{ JSON.stringify($json.voiceError || null) }}\n}`,
    options: {}
  },
  id: 'mira-process-voice',
  name: 'Process Voice',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [2000, 80],
  credentials: {
    httpCustomAuth: { id: 'X79lxjrmGuRpBo7r', name: 'Mira — Supabase Service' }
  }
};

// ============================================================
// 8. Insere os novos nodes antes do Tier 1
// ============================================================
const existingNodes = wf.nodes.filter(n =>
  !['Is Audio?', 'Cap Duration', 'Skip Transcribe?', 'Download Media', 'Transcribe Groq', 'Process Voice'].includes(n.name)
);
wf.nodes = [
  ...existingNodes,
  isAudioNode,
  capDurationNode,
  skipTranscribeIfNode,
  downloadMediaNode,
  transcribeNode,
  processVoiceNode
];

// ============================================================
// 9. Reconecta: Should Skip? (false) → Is Audio?
//    Is Audio? (true)  → Cap Duration → Skip Transcribe? → Download Media → Transcribe → Process Voice → Need Tier 2?
//    Is Audio? (false) → Tier 1 — Handle Message (caminho existente)
//    Skip Transcribe? (true)  → Process Voice (pula download/transcribe)
//                     (false) → Download Media
// ============================================================
wf.connections['Should Skip?'] = {
  main: [
    [{ node: 'Respond Skip', type: 'main', index: 0 }],
    [{ node: 'Is Audio?', type: 'main', index: 0 }]
  ]
};
wf.connections['Is Audio?'] = {
  main: [
    [{ node: 'Cap Duration', type: 'main', index: 0 }],
    [{ node: 'Tier 1 — Handle Message', type: 'main', index: 0 }]
  ]
};
wf.connections['Cap Duration'] = {
  main: [[{ node: 'Skip Transcribe?', type: 'main', index: 0 }]]
};
wf.connections['Skip Transcribe?'] = {
  main: [
    [{ node: 'Process Voice', type: 'main', index: 0 }],
    [{ node: 'Download Media', type: 'main', index: 0 }]
  ]
};
wf.connections['Download Media'] = {
  main: [[{ node: 'Transcribe Groq', type: 'main', index: 0 }]]
};
wf.connections['Transcribe Groq'] = {
  main: [[{ node: 'Process Voice', type: 'main', index: 0 }]]
};
// Process Voice termina o fluxo de audio — ja tem intent+response, vai direto pro Merge
wf.connections['Process Voice'] = {
  main: [[{ node: 'Merge', type: 'main', index: 0 }]]
};

fs.writeFileSync(OUTPUT, JSON.stringify(wf, null, 2) + '\n', 'utf8');
console.log('✅ Workflow patched:', OUTPUT);
console.log('   Nodes:', wf.nodes.length);
console.log('   New audio branch: Is Audio? → Cap Duration → Skip Transcribe? → Download Media → Transcribe Groq → Process Voice → Merge');
console.log('\n⚠️  Antes de importar no n8n:');
console.log('   1. Configure env GROQ_API_KEY no container n8n');
console.log('   2. Ou substitua {{GROQ_API_KEY_PLACEHOLDER}} no node Transcribe Groq');
