/**
 * ClinicAI - Share FM Config
 *
 * Constantes do modulo de Links Compartilhaveis da Analise Facial.
 * Mantido isolado em window.ShareFmConfig.
 */
;(function () {
  'use strict'
  if (window.ShareFmConfig) return

  window.ShareFmConfig = {
    BUCKET: 'facial-shares',
    SIGNED_URL_TTL_SEC: 300,                  // 5 minutos para signed URLs
    DEFAULT_TTL_DAYS: 30,
    MAX_TTL_DAYS: 90,                          // teto duro de seguranca
    MIN_TOKEN_LENGTH: 32,
    PUBLIC_PAGE_PATH: '/share-fm.html',        // pagina renderer no mesmo dominio
    SHORT_LINK_PREFIX: 'fm',                   // prefixo do code curto

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
