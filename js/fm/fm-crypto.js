/**
 * fm-crypto.js — AES-GCM encryption para fotos sensiveis no localStorage (LGPD).
 *
 * Geracao da chave:
 *   - Na primeira chamada, gera AES-256-GCM aleatoria via crypto.subtle.
 *   - Exporta como raw bytes, persiste em localStorage como base64.
 *   - Cache em memoria para evitar reimportar a cada save.
 *
 * Formato do payload encriptado (string):
 *   "enc1:" + base64(iv 12 bytes) + ":" + base64(ciphertext)
 *
 * Backward compat: _decryptString reconhece valores sem prefixo "enc1:" e
 * retorna como esta (sessoes antigas continuam carregando).
 *
 * Nota de seguranca: a chave fica acessivel a qualquer JS no dominio. Isto
 * NAO protege contra XSS que ja tenha execucao de codigo no contexto, mas
 * protege contra:
 *   - Inspecao trivial do localStorage (devtools, extensoes leitoras)
 *   - Sync do localStorage para nuvem do navegador
 *   - Vazamento de backups/exports de localStorage
 * Para protecao contra XSS, mover fotos para servidor (Supabase Storage) com
 * RLS por clinic_id.
 */
;(function () {
  'use strict'

  var FM = window._FM
  var KEY_STORAGE = 'fm_master_key_v1'
  var PREFIX = 'enc1:'
  var _cachedKey = null

  function _b64encode(uint8) {
    var s = ''
    for (var i = 0; i < uint8.length; i++) s += String.fromCharCode(uint8[i])
    return btoa(s)
  }

  function _b64decode(str) {
    var bin = atob(str)
    var arr = new Uint8Array(bin.length)
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
    return arr
  }

  function _getKey() {
    if (_cachedKey) return Promise.resolve(_cachedKey)
    if (!window.crypto || !window.crypto.subtle) {
      return Promise.reject(new Error('crypto.subtle indisponivel'))
    }
    var stored = null
    try { stored = localStorage.getItem(KEY_STORAGE) } catch (e) {}
    if (stored) {
      try {
        var raw = _b64decode(stored)
        return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
          .then(function (k) { _cachedKey = k; return k })
      } catch (e) { /* fall through to generate */ }
    }
    return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
      .then(function (k) {
        _cachedKey = k
        return crypto.subtle.exportKey('raw', k).then(function (rawBuf) {
          try { localStorage.setItem(KEY_STORAGE, _b64encode(new Uint8Array(rawBuf))) } catch (e) {}
          return k
        })
      })
  }

  // Encripta string (tipicamente data URL JPEG). Retorna string com prefixo.
  // Em qualquer falha, retorna o plaintext (graceful degradation — nao quebrar
  // o save por causa de erro de cripto). Loga warning.
  FM._encryptString = function (plaintext) {
    if (typeof plaintext !== 'string' || !plaintext) return Promise.resolve(plaintext)
    if (!window.crypto || !window.crypto.subtle) return Promise.resolve(plaintext)
    return _getKey().then(function (key) {
      var iv = crypto.getRandomValues(new Uint8Array(12))
      var data = new TextEncoder().encode(plaintext)
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, data).then(function (ctBuf) {
        return PREFIX + _b64encode(iv) + ':' + _b64encode(new Uint8Array(ctBuf))
      })
    }).catch(function (e) {
      console.warn('[FM crypto] encrypt failed, falling back to plaintext:', e)
      return plaintext
    })
  }

  // Decripta string. Se nao tiver prefixo "enc1:", retorna como esta (legacy).
  FM._decryptString = function (value) {
    if (typeof value !== 'string') return Promise.resolve(value)
    if (value.indexOf(PREFIX) !== 0) return Promise.resolve(value)  // legacy plain
    if (!window.crypto || !window.crypto.subtle) return Promise.resolve(null)
    var parts = value.split(':')
    if (parts.length !== 3) return Promise.resolve(null)
    return _getKey().then(function (key) {
      var iv = _b64decode(parts[1])
      var ct = _b64decode(parts[2])
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct).then(function (ptBuf) {
        return new TextDecoder().decode(ptBuf)
      })
    }).catch(function (e) {
      console.warn('[FM crypto] decrypt failed:', e)
      return null
    })
  }

  // Helpers para encriptar/decriptar mapas {key: dataUrl}
  FM._encryptPhotoMap = function (photos) {
    var keys = Object.keys(photos || {})
    if (!keys.length) return Promise.resolve({})
    var out = {}
    return Promise.all(keys.map(function (k) {
      return FM._encryptString(photos[k]).then(function (enc) { out[k] = enc })
    })).then(function () { return out })
  }

  FM._decryptPhotoMap = function (photos) {
    var keys = Object.keys(photos || {})
    if (!keys.length) return Promise.resolve({})
    var out = {}
    return Promise.all(keys.map(function (k) {
      return FM._decryptString(photos[k]).then(function (dec) {
        if (dec != null) out[k] = dec
      })
    })).then(function () { return out })
  }
})()
