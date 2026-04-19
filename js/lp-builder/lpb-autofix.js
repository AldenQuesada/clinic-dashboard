/**
 * LP Builder · Autofix
 *
 * Engine que varre a página identificando issues comuns
 * (texto excedendo max, falta de hero/CTA/FAQ, lead curto demais,
 * eyebrow muito longo) e propõe correções.
 *
 * Algumas correções rodam puro JS (truncar). Outras acionam
 * o endpoint de IA (LP_AI_ENDPOINT) com instrução específica.
 *
 * Independente do resto — testável isolado:
 *   var issues = LPBAutofix.scan()
 *   var fixed  = await LPBAutofix.fix(issues[0])
 *   LPBAutofix.open()  // UI
 */
;(function () {
  'use strict'
  if (window.LPBAutofix) return

  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }
  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }

  function _aiEndpoint() {
    var env = window.ClinicEnv || {}
    return env.LP_AI_ENDPOINT || env.MAGAZINE_AI_ENDPOINT || null
  }

  // ────────────────────────────────────────────────────────────
  // SCAN: identifica issues
  // Retorna lista de { blockIdx, fieldKey, severity, code, message,
  //                    fix: 'truncate'|'ai-rewrite'|'ai-shorten',
  //                    current, target_max }
  // ────────────────────────────────────────────────────────────
  function scan() {
    if (!window.LPBuilder || !window.LPBSchema) return []
    var page = LPBuilder.getCurrentPage()
    if (!page) return []
    var issues = []

    // 1. Field-level: max chars excedido
    ;(page.blocks || []).forEach(function (b, i) {
      var meta = LPBSchema.getBlockMeta(b.type)
      if (!meta) return
      meta.fields.forEach(function (f) {
        if (f.type !== 'text' && f.type !== 'textarea' && f.type !== 'richtext') return
        var v = b.props ? b.props[f.k] : ''
        if (typeof v !== 'string' || !v) return
        if (f.max && v.length > f.max) {
          issues.push({
            blockIdx: i, blockType: b.type,
            fieldKey: f.k, fieldLabel: f.label,
            severity: 'warning', code: 'max_exceeded',
            message: f.label + ' tem ' + v.length + ' caracteres (máx. recomendado: ' + f.max + ')',
            fix: 'ai-shorten', current: v, target_max: f.max,
          })
        }
        // Lead muito curto (menos de 20 chars)
        if (f.k === 'lead' && v.length < 20) {
          issues.push({
            blockIdx: i, blockType: b.type,
            fieldKey: f.k, fieldLabel: f.label,
            severity: 'warning', code: 'lead_too_short',
            message: 'Lead muito curto (' + v.length + ' chars). Recomendado: 80-200.',
            fix: 'ai-rewrite', current: v, target_max: f.max,
          })
        }
        // Eyebrow muito longo
        if (f.k === 'eyebrow' && v.length > 50) {
          issues.push({
            blockIdx: i, blockType: b.type,
            fieldKey: f.k, fieldLabel: f.label,
            severity: 'warning', code: 'eyebrow_long',
            message: 'Eyebrow longo demais (' + v.length + ' chars). Quebra em 2 linhas no mobile.',
            fix: 'ai-shorten', current: v, target_max: 40,
          })
        }
      })
    })

    // 2. Page-level: estrutura
    var blocks = page.blocks || []
    var types = blocks.map(function (b) { return b.type })
    if (!types.includes('hero-split')) {
      issues.push({
        scope: 'page', severity: 'warning', code: 'no_hero',
        message: 'Sem bloco hero · página perde impacto visual de abertura.',
        fix: null,
      })
    }
    if (!types.includes('cta-final')) {
      issues.push({
        scope: 'page', severity: 'error', code: 'no_cta_final',
        message: 'Sem CTA final · prejudica a conversão diretamente.',
        fix: null,
      })
    }
    var faqIdx = types.indexOf('faq')
    if (faqIdx >= 0) {
      var items = blocks[faqIdx].props && blocks[faqIdx].props.items
      if (Array.isArray(items) && items.length < 3) {
        issues.push({
          blockIdx: faqIdx, blockType: 'faq',
          severity: 'warning', code: 'faq_too_few',
          message: 'FAQ com apenas ' + items.length + ' pergunta(s). Recomendado: 4-6.',
          fix: null,
        })
      }
    }
    if (!page.meta_description) {
      issues.push({
        scope: 'page', severity: 'warning', code: 'no_meta_desc',
        message: 'Meta descrição vazia · prejudica SEO e compartilhamento.',
        fix: null,
      })
    }

    return issues
  }

  // ────────────────────────────────────────────────────────────
  // FIX: aplica correção específica
  // ────────────────────────────────────────────────────────────
  async function fix(issue) {
    if (!issue) return null
    if (issue.fix === 'ai-shorten' || issue.fix === 'ai-rewrite') {
      return await _aiFix(issue)
    }
    return null
  }

  async function _aiFix(issue) {
    var endpoint = _aiEndpoint()
    if (!endpoint) throw new Error('Endpoint LP_AI_ENDPOINT não configurado')

    var instr
    if (issue.fix === 'ai-shorten') {
      instr = 'Encurtar este texto para no máximo ' + (issue.target_max || 60) + ' caracteres. ' +
              'Manter o significado, tom sereno premium da Clínica Mirian. ' +
              'Retornar apenas o texto encurtado.'
    } else {
      instr = 'Reescrever este texto. Atual está vago/curto demais. ' +
              'Melhorar clareza, ritmo, manter tom sereno premium da Clínica Mirian. ' +
              'Não inventar fatos. Retornar apenas o novo texto.'
    }

    var res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'lp-autofix',
        block_type: issue.blockType,
        field_key: issue.fieldKey,
        original: issue.current,
        instruction: instr,
        variants: 1,
      }),
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    var data = await res.json()
    return (data && (data.text || (data.items && data.items[0]))) || null
  }

  // ────────────────────────────────────────────────────────────
  // Modal UI
  // ────────────────────────────────────────────────────────────
  function open() {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return
    var issues = scan()

    var bodyHtml
    if (!issues.length) {
      bodyHtml = '<div style="padding:60px;text-align:center;color:var(--lpb-text-3);' +
        'font-family:Cormorant Garamond,serif;font-size:20px;font-style:italic">' +
        'Tudo certo. Nenhum problema detectado.' +
        '</div>'
    } else {
      bodyHtml = issues.map(function (it, i) {
        var canFix = !!it.fix
        var color = it.severity === 'error' ? 'var(--lpb-danger)' : 'var(--lpb-warn)'
        var icon  = it.severity === 'error' ? 'alert-circle' : 'alert-triangle'
        var loc = it.scope === 'page'
          ? 'Página'
          : (_esc(it.blockType || '') + ' · #' + it.blockIdx +
             (it.fieldLabel ? ' · ' + _esc(it.fieldLabel) : ''))
        return '<div style="padding:14px 18px;border-bottom:1px solid var(--lpb-border)" data-issue-idx="' + i + '">' +
          '<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:8px">' +
            '<span style="color:' + color + ';margin-top:1px">' + _ico(icon, 14) + '</span>' +
            '<div style="flex:1">' +
              '<div style="font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-text-3)">' + loc + '</div>' +
              '<div style="font-size:12px;color:var(--lpb-text);line-height:1.45;margin-top:2px">' + _esc(it.message) + '</div>' +
            '</div>' +
            (it.blockIdx != null
              ? '<button class="lpb-btn-icon" data-issue-jump="' + i + '" title="Selecionar bloco">' + _ico('eye', 12) + '</button>'
              : '') +
            (canFix
              ? '<button class="lpb-btn sm" data-issue-fix="' + i + '">' + _ico('zap', 11) + ' Corrigir IA</button>'
              : '') +
          '</div>' +
          (it.current ? '<div style="font-size:11px;color:var(--lpb-text-3);font-style:italic;line-height:1.5;padding-left:24px">"' + _esc(it.current.slice(0, 140)) + (it.current.length > 140 ? '...' : '') + '"</div>' : '') +
          '</div>'
      }).join('')
    }

    var fixableCount = issues.filter(function (i) { return !!i.fix }).length

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbAfBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:680px;max-height:88vh;display:flex;flex-direction:column">' +
          '<div class="lpb-modal-h">' +
            '<h3>Autofix · Varredura da página</h3>' +
            '<button class="lpb-btn-icon" id="lpbAfClose">' + _ico('x', 16) + '</button>' +
          '</div>' +
          '<div style="padding:12px 18px;background:var(--lpb-bg);border-bottom:1px solid var(--lpb-border);font-size:11px;color:var(--lpb-text-2)">' +
            '<strong style="color:' + (issues.length ? 'var(--lpb-warn)' : 'var(--lpb-success)') + '">' + issues.length + '</strong> ' +
            (issues.length === 1 ? 'aviso encontrado' : 'avisos encontrados') +
            (fixableCount > 0 ? ' · <strong>' + fixableCount + '</strong> com correção automática (IA)' : '') +
          '</div>' +
          '<div class="lpb-modal-body" id="lpbAfBody" style="flex:1;overflow:auto;padding:0">' + bodyHtml + '</div>' +
          (fixableCount > 0
            ? '<div class="lpb-modal-footer">' +
                '<button class="lpb-btn ghost" id="lpbAfCancel">Fechar</button>' +
                '<div style="flex:1"></div>' +
                '<button class="lpb-btn primary" id="lpbAfFixAll">' + _ico('zap', 12) + ' Corrigir todos com IA' +
                '</button>' +
              '</div>'
            : '<div class="lpb-modal-footer"><button class="lpb-btn ghost" id="lpbAfCancel">Fechar</button></div>')
      + '</div>' +
      '</div>'

    var bg     = document.getElementById('lpbAfBg')
    var close  = document.getElementById('lpbAfClose')
    var cancel = document.getElementById('lpbAfCancel')
    function dismiss() { modalRoot.innerHTML = '' }
    bg.addEventListener('click', dismiss)
    close.onclick = dismiss
    if (cancel) cancel.onclick = dismiss

    // Jump to bloco
    modalRoot.querySelectorAll('[data-issue-jump]').forEach(function (b) {
      b.onclick = function () {
        var i = parseInt(b.dataset.issueJump, 10)
        var it = issues[i]
        if (it && it.blockIdx != null) {
          LPBuilder.selectBlock(it.blockIdx)
          dismiss()
        }
      }
    })

    // Fix individual
    modalRoot.querySelectorAll('[data-issue-fix]').forEach(function (b) {
      b.onclick = async function () {
        var i = parseInt(b.dataset.issueFix, 10)
        var it = issues[i]
        if (!it) return
        b.disabled = true
        b.innerHTML = _ico('loader', 11) + ' Corrigindo...'
        try {
          var newText = await fix(it)
          if (newText) {
            LPBuilder.setBlockProp(it.blockIdx, it.fieldKey, newText)
            if (window.LPBInspector && window.LPBInspector.render) window.LPBInspector.render()
            if (window.LPBCanvas    && window.LPBCanvas.render)    window.LPBCanvas.render()
            // remove o item da lista
            var row = b.closest('[data-issue-idx]')
            if (row) row.style.opacity = '0.4'
            b.innerHTML = _ico('check', 11) + ' Aplicado'
          } else {
            b.innerHTML = _ico('zap', 11) + ' Tentar novamente'
            b.disabled = false
          }
        } catch (e) {
          LPBToast && LPBToast('Erro: ' + e.message, 'error')
          b.innerHTML = _ico('zap', 11) + ' Corrigir IA'
          b.disabled = false
        }
      }
    })

    var fixAll = document.getElementById('lpbAfFixAll')
    if (fixAll) fixAll.onclick = async function () {
      var fixable = issues.filter(function (i) { return !!i.fix })
      if (!fixable.length) return
      if (!confirm('Aplicar correção IA em ' + fixable.length + ' campo(s)?')) return
      fixAll.disabled = true
      var done = 0
      for (var i = 0; i < fixable.length; i++) {
        var it = fixable[i]
        try {
          var newText = await fix(it)
          if (newText) LPBuilder.setBlockProp(it.blockIdx, it.fieldKey, newText)
        } catch (_) {}
        done++
        fixAll.innerHTML = _ico('loader', 12) + ' ' + done + '/' + fixable.length
      }
      if (window.LPBInspector && window.LPBInspector.render) window.LPBInspector.render()
      if (window.LPBCanvas    && window.LPBCanvas.render)    window.LPBCanvas.render()
      LPBToast && LPBToast(done + ' correção(ões) aplicada(s)', 'success')
      dismiss()
    }
  }

  window.LPBAutofix = Object.freeze({
    scan: scan,
    fix:  fix,
    open: open,
  })
})()
