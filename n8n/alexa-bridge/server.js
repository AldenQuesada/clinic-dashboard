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
  const fs = require('fs')
  const cookieFile = process.env.ALEXA_COOKIE_FILE || '.alexa-cookie'

  // Tentar ler cookie salvo
  var savedCookie = ''
  try {
    savedCookie = fs.readFileSync(cookieFile, 'utf8').trim()
    if (savedCookie) console.log('[Alexa] Cookie carregado de', cookieFile)
  } catch (e) {
    console.log('[Alexa] Cookie file nao encontrado, sera necessario login via proxy')
  }

  var cookieData = savedCookie || process.env.ALEXA_COOKIE || ''

  // Tentar parsear JSON (formato alexa-cookie2)
  if (cookieData) {
    try {
      var parsed = JSON.parse(cookieData)
      if (parsed && typeof parsed === 'object') {
        cookieData = parsed
        console.log('[Alexa] Cookie parseado como JSON, keys:', Object.keys(parsed))
      }
    } catch (e) {
      // Nao e JSON, usar como string (cookie HTTP raw)
      console.log('[Alexa] Cookie em formato string raw')
    }
  }

  // Se nao tem cookie, usar proxy para obter
  if (!cookieData) {
    var AlexaCookie = require('alexa-cookie2')
    console.log('[Alexa] Iniciando proxy de login na porta', process.env.PROXY_PORT || 3457)
    AlexaCookie.generateAlexaCookie('', {
      proxyOwnIp: process.env.PROXY_HOST || 'localhost',
      proxyPort: parseInt(process.env.PROXY_PORT || '3457'),
      proxyLogLevel: 'info',
      amazonPage: process.env.AMAZON_PAGE || 'amazon.com.br',
      acceptLanguage: 'pt-BR',
      userAgent: 'Mozilla/5.0',
    }, function (err, result) {
      if (err) {
        console.error('[Alexa] Cookie generation falhou:', err)
        return
      }
      console.log('[Alexa] Cookie obtido com sucesso! Keys:', Object.keys(result || {}))
      // alexa-cookie2 pode retornar cookie como string direto ou em result.cookie
      var cookieStr = typeof result === 'string' ? result : (result && result.cookie ? result.cookie : JSON.stringify(result))
      if (cookieStr) {
        try {
          fs.writeFileSync(cookieFile, cookieStr, 'utf8')
          console.log('[Alexa] Cookie salvo em', cookieFile, '(' + cookieStr.length + ' bytes)')
        } catch (writeErr) {
          console.error('[Alexa] Erro ao salvar cookie:', writeErr.message)
        }
        _connectWithCookie(cookieStr)
      } else {
        console.error('[Alexa] Cookie vazio no resultado')
      }
    })
  } else {
    _connectWithCookie(cookieData)
  }
}

function _connectWithCookie(cookieData) {
  alexa = new Alexa()
  alexa.init({
    cookie: cookieData,
    bluetooth: false,
    logger: console.log,
    amazonPage: process.env.AMAZON_PAGE || 'amazon.com.br',
    acceptLanguage: 'pt-BR',
    userAgent: 'Mozilla/5.0',
  }, function (err) {
    if (err) {
      console.error('[Alexa] Conexao falhou:', err.message || err)
      return
    }
    alexaReady = true
    console.log('[Alexa] Conectado com sucesso!')

    // Atualizar cookie se mudou
    if (alexa.cookie) {
      var fs = require('fs')
      fs.writeFileSync(process.env.ALEXA_COOKIE_FILE || '.alexa-cookie', alexa.cookie, 'utf8')
      console.log('[Alexa] Cookie atualizado')
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

// ── Manual login endpoint (primeira vez) ────────────────────
app.get('/api/login-status', authMiddleware, function (req, res) {
  res.json({
    alexa_connected: alexaReady,
    cookie_exists: require('fs').existsSync(process.env.ALEXA_COOKIE_FILE || '.alexa-cookie'),
    proxy_port: parseInt(process.env.PROXY_PORT || '3457'),
    hint: alexaReady
      ? 'Alexa conectada e pronta'
      : 'Acesse http://<host>:3457 no navegador para autenticar na Amazon'
  })
})

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', function () {
  console.log('[Alexa Bridge] Rodando na porta ' + PORT)
  initAlexa()
})
