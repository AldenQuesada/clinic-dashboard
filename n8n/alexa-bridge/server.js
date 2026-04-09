/**
 * Alexa Bridge Service — HTTP → Alexa Announce
 *
 * Endpoints:
 *   POST /api/announce  — announce em um dispositivo
 *   POST /api/speak     — TTS em um dispositivo
 *   GET  /api/devices   — lista dispositivos
 *   GET  /health        — health check com cookie age e metricas
 *   GET  /api/login-status — status de autenticacao
 */

require('dotenv').config()
var express = require('express')
var Alexa = require('alexa-remote2')
var fs = require('fs')

var app = express()

var ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://clinicai-dashboard.px1hdq.easypanel.host'

// CORS — restrito ao dominio do dashboard
app.use(function (req, res, next) {
  var origin = req.headers.origin || ''
  if (origin === ALLOWED_ORIGIN || ALLOWED_ORIGIN === '*') {
    res.header('Access-Control-Allow-Origin', origin)
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.use(express.json())

var PORT = process.env.PORT || 3456
var AUTH_TOKEN = process.env.AUTH_TOKEN || ''

// ── Metricas ────────────────────────────────────────────────
var _metrics = { sent: 0, failed: 0, lastSentAt: null, lastError: null, startedAt: new Date().toISOString() }

// ── Rate Limiter — 1 announce por segundo por device ────────
var _lastAnnounce = {}
var RATE_LIMIT_MS = 1500

function _checkRateLimit(device) {
  var now = Date.now()
  var last = _lastAnnounce[device] || 0
  if (now - last < RATE_LIMIT_MS) return false
  _lastAnnounce[device] = now
  return true
}

// ── Alexa Client ────────────────────────────────────────────
var alexa = null
var alexaReady = false
var _cookieLoadedAt = null
var _lastAuthCheck = null

function initAlexa() {
  var cookieFile = process.env.ALEXA_COOKIE_FILE || '.alexa-cookie'

  var savedCookie = ''
  try {
    savedCookie = fs.readFileSync(cookieFile, 'utf8').trim()
    if (savedCookie) {
      console.log('[Alexa] Cookie carregado de', cookieFile)
      _cookieLoadedAt = new Date().toISOString()
    }
  } catch (e) {
    console.log('[Alexa] Cookie file nao encontrado')
  }

  var cookieData = savedCookie || process.env.ALEXA_COOKIE || ''

  // Parsear JSON (formato alexa-cookie2)
  if (cookieData) {
    try {
      var parsed = JSON.parse(cookieData)
      if (parsed && typeof parsed === 'object') {
        cookieData = parsed
        console.log('[Alexa] Cookie JSON, keys:', Object.keys(parsed))
      }
    } catch (e) {
      console.log('[Alexa] Cookie formato string')
    }
  }

  if (!cookieData) {
    console.error('[Alexa] Sem cookie. Necessario login via proxy.')
    return
  }

  _connectWithCookie(cookieData)
}

function _connectWithCookie(cookieData) {
  alexa = new Alexa()
  alexa.init({
    cookie: cookieData,
    bluetooth: false,
    logger: function() {}, // silenciar logs verbose do alexa-remote2
    amazonPage: process.env.AMAZON_PAGE || 'amazon.com.br',
    acceptLanguage: 'pt-BR',
    userAgent: 'Mozilla/5.0',
  }, function (err) {
    if (err) {
      console.error('[Alexa] Conexao falhou:', err.message || err)
      alexaReady = false
      _metrics.lastError = { message: String(err.message || err), at: new Date().toISOString() }

      // Retry apos 60s
      console.log('[Alexa] Retry em 60s...')
      setTimeout(initAlexa, 60000)
      return
    }
    alexaReady = true
    _lastAuthCheck = new Date().toISOString()
    console.log('[Alexa] Conectado com sucesso!')
    // NAO sobrescrever cookie JSON original
  })
}

// ── Auth middleware ──────────────────────────────────────────
function authMiddleware(req, res, next) {
  if (!AUTH_TOKEN) return next()
  var token = (req.headers.authorization || '').replace('Bearer ', '')
  if (token !== AUTH_TOKEN) return res.status(401).json({ error: 'Unauthorized' })
  next()
}

// ── Util: strip accents + normalize spaces ──────────────────
function _stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function _resolveDevice(deviceInput) {
  if (!alexa || !alexa.serialNumbers) return deviceInput
  var inputStripped = _stripAccents(deviceInput)
  var found = Object.values(alexa.serialNumbers).find(function (d) {
    if (d.serialNumber === deviceInput) return true
    if (!d.accountName) return false
    return _stripAccents(d.accountName) === inputStripped
  })
  return found ? found.serialNumber : deviceInput
}

// ── Routes ──────────────────────────────────────────────────

app.get('/health', function (req, res) {
  var cookieAgeDays = null
  if (_cookieLoadedAt) {
    cookieAgeDays = Math.floor((Date.now() - new Date(_cookieLoadedAt).getTime()) / 86400000)
  }
  res.json({
    status: 'ok',
    alexa_connected: alexaReady,
    cookie_age_days: cookieAgeDays,
    cookie_warning: cookieAgeDays !== null && cookieAgeDays > 25,
    metrics: _metrics,
    last_auth_check: _lastAuthCheck,
  })
})

app.get('/api/devices', authMiddleware, function (req, res) {
  if (!alexaReady) return res.status(503).json({ error: 'Alexa nao conectada' })

  var devices = alexa.serialNumbers
    ? Object.values(alexa.serialNumbers).map(function (d) {
        return { name: d.accountName, serial: d.serialNumber, family: d.deviceFamily, online: d.online }
      })
    : []

  res.json({ devices: devices })
})

app.post('/api/announce', authMiddleware, function (req, res) {
  if (!alexaReady) return res.status(503).json({ error: 'Alexa nao conectada', code: 'NOT_CONNECTED' })

  var deviceInput = req.body.device
  var message = req.body.message
  var type = req.body.type || 'announce'

  if (!deviceInput || !message) {
    return res.status(400).json({ error: 'device e message sao obrigatorios' })
  }

  // Rate limit
  if (!_checkRateLimit(deviceInput)) {
    return res.status(429).json({ error: 'Rate limit: aguarde 1.5s entre announces para o mesmo device', code: 'RATE_LIMITED' })
  }

  var device = _resolveDevice(deviceInput)

  console.log('[Alexa] ' + type + ' -> ' + deviceInput + ' (serial: ' + device + ')')

  var command = type === 'speak' ? 'speak' : 'announcement'

  alexa.sendSequenceCommand(device, command, message, function (err) {
    if (err) {
      var errMsg = String(err.message || err)
      console.error('[Alexa] ' + type + ' falhou:', errMsg)
      _metrics.failed++
      _metrics.lastError = { message: errMsg, device: deviceInput, at: new Date().toISOString() }

      // Detectar cookie expirado
      if (errMsg.indexOf('no JSON') >= 0 || errMsg.indexOf('401') >= 0 || errMsg.indexOf('Authentication') >= 0) {
        alexaReady = false
        return res.status(503).json({ error: 'Cookie expirado. Necessario re-autenticar.', code: 'COOKIE_EXPIRED' })
      }

      return res.status(500).json({ error: type + ' falhou', details: errMsg, code: 'ANNOUNCE_FAILED' })
    }

    _metrics.sent++
    _metrics.lastSentAt = new Date().toISOString()
    res.json({ ok: true, device: device, type: type })
  })
})

app.get('/api/login-status', authMiddleware, function (req, res) {
  res.json({
    alexa_connected: alexaReady,
    cookie_exists: fs.existsSync(process.env.ALEXA_COOKIE_FILE || '.alexa-cookie'),
    hint: alexaReady ? 'Alexa conectada e pronta' : 'Cookie expirado ou ausente'
  })
})

// ── Start ───────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', function () {
  console.log('[Alexa Bridge] Porta ' + PORT)
  initAlexa()
})
