;(function () {
  'use strict'
  if (window.QAList) return

  function _renderQuizList() {
    var listEl = document.getElementById('qa-quiz-list')
    if (!listEl) return

    var _quizzes = QA.quizzes()
    var _activeQuiz = QA.quiz()

    if (!_quizzes.length) {
      listEl.innerHTML = '<div class="qa-empty"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="13" y2="13"/></svg>Nenhum quiz criado.</div>'
      return
    }

    listEl.innerHTML = _quizzes.map(function(q, idx) {
      var isActive = _activeQuiz && _activeQuiz.id === q.id
      var activeCls = isActive ? ' active' : ''
      var kanbanLabel = (QA.KANBAN_OPTIONS.find(function(k) { return k.value === q.kanban_target }) || {}).label || q.kanban_target
      var statusBadge = q.active
        ? '<span class="qa-badge qa-badge-green">Ativo</span>'
        : '<span class="qa-badge qa-badge-gray">Inativo</span>'

      return '<div class="qa-quiz-card' + activeCls + '" data-idx="' + idx + '" id="qa-card-' + idx + '">' +
        '<div class="qa-quiz-card-title">' +
          '<span style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' + QA.esc(q.title || q.slug) + '</span>' +
          '<div class="qa-card-actions">' +
            '<label class="qa-toggle" title="Ativar/Desativar" onclick="event.stopPropagation()">' +
              '<input type="checkbox"' + (q.active ? ' checked' : '') + ' data-qid="' + QA.esc(q.id) + '">' +
              '<span class="qa-toggle-slider"></span>' +
            '</label>' +
            '<button class="qa-icon-btn danger" data-del="' + idx + '" title="Excluir" onclick="event.stopPropagation()">' + QA.ICON.trash + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="qa-quiz-card-meta">' +
          '<span class="qa-badge qa-badge-indigo">' + QA.esc(kanbanLabel) + '</span>' +
          statusBadge +
        '</div>' +
      '</div>'
    }).join('')

    // Click to select
    listEl.querySelectorAll('.qa-quiz-card').forEach(function(card) {
      card.addEventListener('click', function(e) {
        if (e.target.closest('.qa-card-actions')) return
        var idx = parseInt(card.getAttribute('data-idx'), 10)
        QA.selectQuiz(idx)
      })
    })

    // Toggle active
    listEl.querySelectorAll('.qa-toggle input').forEach(function(inp) {
      inp.onchange = function() {
        var qid  = inp.getAttribute('data-qid')
        var quiz = _quizzes.find(function(q) { return q.id === qid })
        if (!quiz) return
        quiz.active = inp.checked
        QA.repo().updateTemplate(qid, { active: inp.checked }).catch(function(err) {
          quiz.active = !inp.checked
          inp.checked = !inp.checked
          _renderQuizList()
          alert('Erro ao atualizar: ' + (err.message || err))
        })
        _renderQuizList()
        var activeQuiz = QA.quiz()
        if (activeQuiz && activeQuiz.id === qid) {
          activeQuiz.active = inp.checked
        }
      }
    })

    // Delete
    listEl.querySelectorAll('[data-del]').forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation()
        var idx  = parseInt(btn.getAttribute('data-del'), 10)
        var quiz = _quizzes[idx]
        if (!quiz) return
        if (!confirm('Excluir o quiz "' + (quiz.title || quiz.slug) + '"?')) return
        QA.repo().deleteTemplate(quiz.id).then(function() {
          _quizzes.splice(idx, 1)
          var activeQuiz = QA.quiz()
          if (activeQuiz && activeQuiz.id === quiz.id) {
            document.getElementById('qa-editor-area').innerHTML = '<div class="qa-no-selection">Selecione um quiz ou crie um novo.</div>'
            QA.renderPreview()
          }
          _renderQuizList()
        }).catch(function(err) {
          alert('Erro ao excluir: ' + (err.message || err))
        })
      }
    })
  }

  window.QAList = { render: _renderQuizList }

})()
