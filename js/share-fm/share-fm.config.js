/**
 * ClinicAI - Share FM Config
 *
 * Constantes do modulo de Links Compartilhaveis da Analise Facial.
 * Mantido isolado em window.ShareFmConfig.
 */
;(function () {
  'use strict'
  if (window.ShareFmConfig) return

  // Base URL publica forcada — links gerados sempre apontam para o dominio
  // de producao (mesmo se o profissional estiver testando em localhost).
  // Pode ser sobrescrita por window.ClinicEnv.PUBLIC_BASE_URL.
  var PROD_BASE_URL = 'https://clinicai-dashboard.px1hdq.easypanel.host'

  function _publicBaseUrl() {
    if (window.ClinicEnv && window.ClinicEnv.PUBLIC_BASE_URL) return window.ClinicEnv.PUBLIC_BASE_URL
    var origin = (typeof window !== 'undefined' && window.location) ? window.location.origin : ''
    // Se rodando em localhost / 127.0.0.1 / IP privado, usa producao para
    // que o link compartilhavel funcione no celular do paciente.
    if (/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(origin)) {
      return PROD_BASE_URL
    }
    return origin || PROD_BASE_URL
  }

  window.ShareFmConfig = {
    BUCKET: 'facial-shares',
    SIGNED_URL_TTL_SEC: 300,                  // 5 minutos para signed URLs
    DEFAULT_TTL_DAYS: 30,
    MAX_TTL_DAYS: 90,                          // teto duro de seguranca
    MIN_TOKEN_LENGTH: 32,
    PUBLIC_PAGE_PATH: '/share-fm.html',        // pagina renderer no mesmo dominio
    SHORT_LINK_PREFIX: 'fm',                   // prefixo do code curto
    PROD_BASE_URL: PROD_BASE_URL,
    publicBaseUrl: _publicBaseUrl,             // funcao — chama na hora de gerar

    STATUS: {
      ACTIVE:  'active',
      REVOKED: 'revoked',
      EXPIRED: 'expired',
    },

    // Texto LGPD obrigatorio mostrado no modal de consent. Snapshot vai ao banco.
    CONSENT_TEXT: (
      'Confirmo que tenho autorizacao expressa da paciente para compartilhar ' +
      'estas imagens e a analise facial via link temporario. Sei que: (1) o link ' +
      'fica acessivel por ate {ttl_days} dias; (2) qualquer pessoa com o link ' +
      'pode visualizar; (3) posso revogar o acesso a qualquer momento; (4) o ' +
      'historico de acessos sera registrado para fins de auditoria LGPD.'
    ),
  }
})()
