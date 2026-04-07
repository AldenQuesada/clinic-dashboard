/**
 * Alexa Bridge Service — Minimal HTTP → Alexa Announce
 *
 * Recebe POST /api/announce com { device, message, type }
 * e faz o announce no dispositivo Echo via alexa-remote2.
 *
 * Setup:
 *   1. npm install alexa-remote2 express dotenv
 *   2. Copie .env.example para .env e configure
 *   3. node server.js
 *   4. Na primeira exececao, abra o URL de login no navegador
 *
 * Endpoints:
 *   POST /api/announce  — faz announce em um dispositivo
 *   POST /api/speak     — faz speak (TTS) em um dispositivo
 *   GET  /api/devices   — lista dispositivos disponiveis
 *   GET  /health        — health check
 */

require('dotenv').config()
const express = require('express')
const Alexa = require('alexa-remote2')

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 3456
const AUTH_TOKEN = process.env.AUTH_TOKEN || ''

// ── Alexa Client ─────────────────────────────────────────────
let alexa = null
let alexaReady = false

function initAlexa() {
  alexa = new Alexa()

  const config = {
    cookie: process.env.ALEXA_COOKIE || '',
    proxyOwnIp: process.env.PROXY_HOST || 'localhost',
    proxyPort: parseInt(process.env.PROXY_PORT || '3457'),
    proxyLogLevel: 'warn',
    bluetooth: false,
    logger: console.log,
    amazonPage: process.env.AMAZON_PAGE || 'amazon.com.br',
    acceptLanguage: 'pt-BR',
    userAgent: 'Mozilla/5.0',
  }

  // Se tem cookie salvo, usar direto
  if (process.env.ALEXA_COOKIE_FILE) {
    try {
      const fs = require('fs')
      config.cookie = fs.readFileSync(process.env.ALEXA_COOKIE_FILE, 'utf8').trim()
    } catch (e) {
      console.log('[Alexa] Cookie file nao encontrado, iniciando proxy de login...')
    }
  }

  alexa.init(config, function (err) {
    if (err) {
      console.error('[Alexa] Init falhou:', err)
      console.log('[Alexa] Abra http://localhost:' + config.proxyPort + ' no navegador para fazer login')
      return
    }
    alexaReady = true
    console.log('[Alexa] Conectado com sucesso!')

    // Salvar cookie para reuso
    if (alexa.cookie) {
      const fs = require('fs')
      fs.writeFileSync('.alexa-cookie', alexa.cookie, 'utf8')
      console.log('[Alexa] Cookie salvo em .alexa-cookie')
    }
  })
}

// ── Auth middleware ───────────────────────────────────────────
function authMiddleware(req, res, next) {
  if (!AUTH_TOKEN) return next()
  const token = (req.headers.authorization || '').replace('Bearer ', '')
  if (token !== AUTH_TOKEN) return res.status(401).json({ error: 'Unauthorized' })
  next()
}

// ── Routes ───────────────────────────────────────────────────

app.get('/health', function (req, res) {
  res.json({ status: 'ok', alexa_connected: alexaReady })
})

app.get('/api/devices', authMiddleware, function (req, res) {
  if (!alexaReady) return res.status(503).json({ error: 'Alexa nao conectada' })

  const devices = alexa.serialNumbers
    ? Object.values(alexa.serialNumbers).map(function (d) {
        return { name: d.accountName, serial: d.serialNumber, family: d.deviceFamily, online: d.online }
      })
    : []

  res.json({ devices: devices })
})

app.post('/api/announce', authMiddleware, function (req, res) {
  if (!alexaReady) return res.status(503).json({ error: 'Alexa nao conectada' })

  var device = req.body.device
  var message = req.body.message
  var type = req.body.type || 'announce'

  if (!device || !message) {
    return res.status(400).json({ error: 'device e message sao obrigatorios' })
  }

  console.log('[Alexa] ' + type + ' → ' + device + ': ' + message)

  if (type === 'announce') {
    alexa.sendSequenceCommand(device, 'announcement', message, function (err) {
      if (err) {
        console.error('[Alexa] Announce falhou:', err)
        return res.status(500).json({ error: 'Announce falhou', details: String(err) })
      }
      res.json({ ok: true, device: device, type: 'announce' })
    })
  } else if (type === 'speak') {
    alexa.sendSequenceCommand(device, 'speak', message, function (err) {
      if (err) {
        console.error('[Alexa] Speak falhou:', err)
        return res.status(500).json({ error: 'Speak falhou', details: String(err) })
      }
      res.json({ ok: true, device: device, type: 'speak' })
    })
  } else {
    res.status(400).json({ error: 'type deve ser announce ou speak' })
  }
})

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, function () {
  console.log('[Alexa Bridge] Rodando na porta ' + PORT)
  initAlexa()
})
