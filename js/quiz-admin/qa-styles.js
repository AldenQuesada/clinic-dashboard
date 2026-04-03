;(function () {
  'use strict'
  if (window.QAStyles) return

  function _injectStyles() {
    if (document.getElementById('quiz-admin-styles')) return
    var style = document.createElement('style')
    style.id = 'quiz-admin-styles'
    style.textContent = [
      /* Layout */
      '#quizAdminRoot{display:flex;flex-direction:column;height:100%;font-family:"Inter",sans-serif;color:#111827;font-size:14px}',
      '.qa-topbar{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid #e5e7eb;background:#fff;flex-shrink:0}',
      '.qa-topbar-title{font-size:15px;font-weight:700;color:#111827}',
      '.qa-topbar-actions{display:flex;gap:8px;align-items:center}',

      /* Main columns */
      '.qa-body{display:flex;flex:1;overflow:hidden;background:#f9fafb}',
      '.qa-col-left{width:260px;min-width:220px;border-right:1px solid #e5e7eb;overflow-y:auto;background:#fff;flex-shrink:0;display:flex;flex-direction:column}',
      '.qa-col-center{flex:1;overflow-y:auto;display:flex;flex-direction:column;margin-right:310px}',
      '.qa-col-right{width:310px;min-width:280px;border-left:1px solid #e5e7eb;background:#fff;flex-shrink:0;display:flex;flex-direction:column;position:fixed;right:0;top:56px;bottom:0;z-index:50}',

      /* Responsive: collapse to tabs on <1024px */
      '@media(max-width:1023px){',
        '.qa-body{flex-direction:column}',
        '.qa-col-left,.qa-col-right{width:100%;border:none;border-bottom:1px solid #e5e7eb}',
        '.qa-col-right{display:none}',
        '.qa-mobile-tabs{display:flex!important}',
      '}',
      '.qa-mobile-tabs{display:none;gap:0;border-bottom:1px solid #e5e7eb;background:#fff;flex-shrink:0}',
      '.qa-mobile-tab{flex:1;padding:10px;text-align:center;font-size:13px;font-weight:600;color:#6b7280;cursor:pointer;border-bottom:2px solid transparent}',
      '.qa-mobile-tab.active{color:#6366F1;border-color:#6366F1}',

      /* Left column */
      '.qa-left-header{padding:12px 14px;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;justify-content:space-between}',
      '.qa-left-header span{font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em}',
      '.qa-quiz-list{flex:1;overflow-y:auto}',
      '.qa-quiz-card{padding:12px 14px;border-bottom:1px solid #f3f4f6;cursor:pointer;transition:background .12s;display:flex;flex-direction:column;gap:4px}',
      '.qa-quiz-card:hover{background:#f5f3ff}',
      '.qa-quiz-card.active{background:#eef2ff;border-left:3px solid #6366F1}',
      '.qa-quiz-card-title{font-size:13px;font-weight:700;color:#111827;display:flex;align-items:center;gap:6px}',
      '.qa-quiz-card-meta{display:flex;align-items:center;gap:6px}',
      '.qa-badge{display:inline-flex;align-items:center;padding:2px 7px;border-radius:20px;font-size:11px;font-weight:600}',
      '.qa-badge-indigo{background:#eef2ff;color:#4338CA}',
      '.qa-badge-gray{background:#f3f4f6;color:#6b7280}',
      '.qa-badge-green{background:#d1fae5;color:#065f46}',
      '.qa-badge-red{background:#fee2e2;color:#b91c1c}',
      '.qa-card-actions{display:flex;gap:4px;margin-left:auto}',
      '.qa-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;background:none;border-radius:7px;cursor:pointer;color:#6b7280;transition:background .12s,color .12s}',
      '.qa-icon-btn:hover{background:#f3f4f6;color:#111827}',
      '.qa-icon-btn.danger:hover{background:#fee2e2;color:#ef4444}',

      /* Toggle switch */
      '.qa-toggle{position:relative;display:inline-flex;width:34px;height:20px;flex-shrink:0}',
      '.qa-toggle input{opacity:0;width:0;height:0;position:absolute}',
      '.qa-toggle-slider{position:absolute;inset:0;background:#d1d5db;border-radius:20px;cursor:pointer;transition:background .2s}',
      '.qa-toggle-slider::before{content:"";position:absolute;left:2px;top:2px;width:16px;height:16px;background:#fff;border-radius:50%;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.2)}',
      '.qa-toggle input:checked~.qa-toggle-slider{background:#6366F1}',
      '.qa-toggle input:checked~.qa-toggle-slider::before{transform:translateX(14px)}',

      /* Editor area */
      '.qa-editor-topbar{padding:10px 16px;background:#fff;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}',
      '.qa-editor-tabs{display:flex;gap:2px}',
      '.qa-editor-tab{padding:6px 12px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:none;color:#6b7280;transition:background .12s,color .12s;font-family:"Inter",sans-serif}',
      '.qa-editor-tab.active{background:#eef2ff;color:#6366F1}',
      '.qa-editor-content{flex:1;overflow-y:auto;padding:16px}',

      /* Form groups */
      '.qa-form-group{display:flex;flex-direction:column;gap:5px;margin-bottom:14px}',
      '.qa-label{font-size:12px;font-weight:600;color:#374151}',
      '.qa-input,.qa-textarea,.qa-select{width:100%;padding:8px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;font-family:"Inter",sans-serif;color:#111827;background:#fff;outline:none;transition:border-color .15s;-webkit-appearance:none}',
      '.qa-input:focus,.qa-textarea:focus,.qa-select:focus{border-color:#6366F1}',
      '.qa-textarea{resize:vertical;min-height:70px}',
      '.qa-select{background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%236B7280\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'%3E%3C/polyline%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;padding-right:30px}',
      '.qa-input-row{display:flex;align-items:center;gap:6px}',
      '.qa-link-display{font-size:11px;color:#6366F1;word-break:break-all;flex:1}',
      '.qa-section-title{font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;margin-top:18px}',
      '.qa-collapse-header{display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:10px 0;margin-top:4px;user-select:none}',
      '.qa-collapse-header:hover .qa-section-title{color:#6366F1}',
      '.qa-collapse-header .qa-section-title{margin:0}',
      '.qa-collapse-arrow{transition:transform .2s ease;color:#9ca3af}',
      '.qa-collapse-arrow.open{transform:rotate(180deg)}',
      '.qa-collapse-body{overflow:hidden;transition:max-height .3s ease}',
      '.qa-collapse-body.closed{max-height:0!important;overflow:hidden}',
      '.qa-divider{height:1px;background:#f3f4f6;margin:14px 0}',

      /* Question list */
      '.qa-q-list{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}',
      '.qa-q-item{display:flex;align-items:center;gap:8px;padding:9px 10px;background:#fff;border:1.5px solid #e5e7eb;border-radius:10px;cursor:pointer;transition:border-color .12s}',
      '.qa-q-item:hover{border-color:#a5b4fc}',
      '.qa-q-item.active{border-color:#6366F1;background:#eef2ff}',
      '.qa-q-item-title{font-size:13px;font-weight:600;color:#111827;flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}',
      '.qa-q-item-type{font-size:10px;font-weight:600;color:#6b7280;background:#f3f4f6;padding:2px 6px;border-radius:5px;white-space:nowrap}',
      '.qa-grip{color:#d1d5db;cursor:grab;flex-shrink:0}',

      /* Options editor */
      '.qa-opt-list{display:flex;flex-direction:column;gap:6px;margin-bottom:8px}',
      '.qa-opt-row{display:flex;align-items:center;gap:6px}',
      '.qa-opt-row .qa-input{flex:1}',
      '.qa-opt-score{width:60px;flex-shrink:0}',

      /* Question inline editor */
      '.qa-q-editor{background:#f9fafb;border:1.5px solid #e5e7eb;border-radius:12px;padding:14px;margin-top:4px}',
      '.qa-q-editor-title{font-size:12px;font-weight:700;color:#6366F1;margin-bottom:10px}',

      /* Preview panel */
      '.qa-preview-header{padding:10px 14px;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;justify-content:space-between}',
      '.qa-preview-header span{font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em}',
      '.qa-preview-wrap{flex:1;display:flex;align-items:flex-start;justify-content:center;padding:20px 14px;background:#f1f5f9}',
      '.qa-phone-frame{width:280px;height:580px;border:6px solid #1f2937;border-radius:28px;box-shadow:0 20px 60px rgba(0,0,0,.25);overflow:hidden;background:#fff;position:relative;flex-shrink:0}',
      '.qa-phone-screen{height:100%;overflow-y:auto;background:linear-gradient(180deg,#fff 0%,#F0EEF6 60%,#E8E5F0 100%);display:flex;flex-direction:column}',
      '.qa-preview-intro{padding:12px 12px 0;text-align:center;flex:1}',
      '.qa-preview-logo{width:auto;height:auto;background:transparent;display:flex;align-items:center;justify-content:center;margin:4px auto 0;font-size:16px;font-weight:800;color:#5B6CFF;letter-spacing:1px}',
      '.qa-preview-logo img{width:auto;height:28px;max-width:120px;object-fit:contain;border-radius:0;transform:scale(1.6)}',
      '.qa-preview-divider{width:100%;height:1px;background:linear-gradient(90deg,transparent,#D1D5DB,transparent);margin:6px 0 8px}',
      '.qa-preview-cover{width:100%;height:120px;object-fit:cover;border-radius:10px;margin-bottom:10px;box-shadow:0 2px 8px rgba(0,0,0,0.08)}',
      '.qa-preview-title{font-size:14px;font-weight:800;color:#1a1a2e;margin-bottom:6px;line-height:1.3;white-space:pre-line}',
      '.qa-preview-desc{font-size:10px;color:#8B8BA3;margin-bottom:10px;line-height:1.5;white-space:pre-line}',
      '.qa-preview-cta-wrap{padding:8px 12px 14px;background:linear-gradient(180deg,rgba(255,255,255,0),#fff 30%)}',
      '.qa-preview-cta{display:block;width:100%;padding:12px;background:linear-gradient(135deg,#5B6CFF,#7B68EE,#9B6DFF);color:#fff;border:none;border-radius:24px;font-size:12px;font-weight:700;font-family:"Inter",sans-serif;cursor:pointer;letter-spacing:1px;text-transform:uppercase;box-shadow:0 4px 16px rgba(91,108,255,0.3)}',

      /* Save button / feedback */
      '.qa-save-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;background:#6366F1;color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;font-family:"Inter",sans-serif;cursor:pointer;transition:background .15s}',
      '.qa-save-btn:hover{background:#4f46e5}',
      '.qa-save-btn:disabled{opacity:.5;cursor:not-allowed}',
      '.qa-save-ok{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;color:#059669}',

      /* Empty state */
      '.qa-empty{padding:40px 20px;text-align:center;color:#9ca3af;font-size:13px}',
      '.qa-empty svg{margin:0 auto 10px;display:block;color:#d1d5db}',

      /* Add btn */
      '.qa-add-btn{display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border:1.5px dashed #d1d5db;border-radius:9px;font-size:13px;font-weight:600;color:#6b7280;background:none;cursor:pointer;font-family:"Inter",sans-serif;transition:border-color .12s,color .12s;width:100%}',
      '.qa-add-btn:hover{border-color:#6366F1;color:#6366F1}',

      /* Color input */
      '.qa-color-row{display:flex;align-items:center;gap:8px;margin-bottom:8px}',
      '.qa-color-input{width:36px;height:36px;border:none;border-radius:8px;cursor:pointer;padding:0;background:none}',

      /* Checkbox row */
      '.qa-checkbox-row{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:#374151;cursor:pointer;user-select:none}',
      '.qa-checkbox-row input[type=checkbox]{width:15px;height:15px;accent-color:#6366F1;cursor:pointer}',

      /* No quiz selected */
      '.qa-no-selection{flex:1;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:13px;text-align:center;padding:20px}',

      /* ── Analytics Dashboard ─────────────────────────────── */
      '.qa-analytics-loading{padding:40px;text-align:center;color:#9ca3af;font-size:13px}',
      '.qa-analytics-error{padding:20px;text-align:center;color:#ef4444;font-size:13px;background:#fef2f2;border-radius:10px;margin:16px 0}',

      /* Period selector */
      '.qa-period-bar{display:flex;gap:4px;margin-bottom:16px;flex-wrap:wrap}',
      '.qa-period-btn{padding:5px 12px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;border:1.5px solid #e5e7eb;background:#fff;color:#6b7280;font-family:"Inter",sans-serif;transition:all .12s}',
      '.qa-period-btn.active{background:#eef2ff;color:#6366F1;border-color:#c7d2fe}',
      '.qa-period-btn:hover{border-color:#a5b4fc}',
      '.qa-date-input{width:130px!important;padding:4px 8px!important;font-size:12px!important;font-weight:600!important}',

      /* KPI cards */
      '.qa-kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:20px}',
      '.qa-kpi-card{background:#fff;border:1.5px solid #e5e7eb;border-radius:12px;padding:14px;text-align:center;transition:border-color .12s;min-height:120px;display:flex;flex-direction:column;align-items:center;justify-content:center}',
      '.qa-kpi-card:hover{border-color:#c7d2fe}',
      '.qa-kpi-icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;margin:0 auto 8px}',
      '.qa-kpi-value{font-size:24px;font-weight:800;color:#111827;line-height:1.2}',
      '.qa-kpi-label{font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.04em;margin-top:4px}',
      '.qa-kpi-sub{font-size:11px;color:#6b7280;margin-top:2px}',

      /* Chart container */
      '.qa-chart-wrap{background:#fff;border:1.5px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:16px}',
      '.qa-chart-title{font-size:12px;font-weight:700;color:#374151;margin-bottom:12px;display:flex;align-items:center;gap:6px}',
      '.qa-chart-title svg{color:#6366F1}',
      '.qa-chart-empty{text-align:center;padding:30px 10px;color:#9ca3af;font-size:12px}',

      /* SVG chart */
      '.qa-line-chart{width:100%;height:200px}',
      '.qa-line-chart .grid-line{stroke:#f3f4f6;stroke-width:1}',
      '.qa-line-chart .data-line{fill:none;stroke:#6366F1;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}',
      '.qa-line-chart .data-area{fill:url(#qa-gradient);opacity:.15}',
      '.qa-line-chart .data-dot{fill:#6366F1;stroke:#fff;stroke-width:2}',
      '.qa-line-chart .axis-label{font-size:10px;fill:#9ca3af;font-family:"Inter",sans-serif}',
      '.qa-line-chart .value-label{font-size:9px;fill:#6366F1;font-weight:700;font-family:"Inter",sans-serif}',

      /* Funnel bars */
      '.qa-funnel-row{display:flex;align-items:center;gap:10px;margin-bottom:8px}',
      '.qa-funnel-label{font-size:12px;font-weight:600;color:#374151;min-width:120px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.qa-funnel-bar-wrap{flex:1;height:28px;background:#f3f4f6;border-radius:7px;overflow:hidden;position:relative}',
      '.qa-funnel-bar{height:100%;border-radius:7px;transition:width .4s ease;display:flex;align-items:center;padding:0 8px;min-width:28px}',
      '.qa-funnel-bar-text{font-size:11px;font-weight:700;color:#fff;white-space:nowrap}',
      '.qa-funnel-count{font-size:12px;font-weight:700;color:#374151;min-width:28px;text-align:center;padding:2px 6px;border-radius:6px}',
      '.qa-funnel-count.qa-funnel-exit-1{background:#ef4444;color:#fff}',
      '.qa-funnel-count.qa-funnel-exit-2{background:#f59e0b;color:#fff}',

      /* Exit points */
      '.qa-exit-row{display:flex;align-items:center;gap:8px;padding:8px 10px;background:#fff;border:1px solid #fee2e2;border-radius:8px;margin-bottom:6px}',
      '.qa-exit-rank{width:22px;height:22px;border-radius:50%;background:#fef2f2;color:#ef4444;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
      '.qa-exit-rank.qa-exit-rank-1{background:#ef4444;color:#fff}',
      '.qa-exit-rank.qa-exit-rank-2{background:#f59e0b;color:#fff}',
      '.qa-exit-label{font-size:12px;font-weight:600;color:#374151;flex:1;display:flex;flex-direction:column;gap:2px}',
      '.qa-exit-count{font-size:13px;font-weight:700;color:#ef4444}',
      '.qa-exit-pct{font-size:11px;color:#9ca3af;margin-left:2px}',
      '.qa-exit-revised{font-size:10px;font-weight:600;color:#22c55e;display:inline-flex;align-items:center;gap:3px}',

      /* Abandoned leads table */
      '.qa-abandoned-tag{display:inline-block;padding:2px 7px;border-radius:5px;font-size:10px;font-weight:700;text-transform:uppercase}',
      '.qa-abandoned-tag.recoverable{background:#dbeafe;color:#1d4ed8}',
      '.qa-abandoned-tag.anonymous{background:#f3f4f6;color:#9ca3af}',
      '.qa-progress-bar{width:60px;height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden;display:inline-block;vertical-align:middle;margin-right:6px}',
      '.qa-progress-fill{height:100%;border-radius:4px;min-width:4px}',

      /* Leads table */
      '.qa-leads-wrap{max-height:900px;overflow-y:auto;border:1.5px solid #e5e7eb;border-radius:12px}',
      '.qa-leads-table{width:100%;border-collapse:collapse;font-size:12px}',
      '.qa-leads-table th{position:sticky;top:0;background:#f9fafb;padding:8px 10px;text-align:left;font-weight:700;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #e5e7eb}',
      '.qa-leads-table td{padding:8px 10px;border-bottom:1px solid #f3f4f6;color:#374151;vertical-align:top}',
      '.qa-leads-table tr:hover td{background:#f9fafb}',
      '.qa-leads-name{font-weight:700;color:#111827;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.qa-leads-phone{color:#6366F1;font-weight:600}',
      '.qa-leads-temp{display:inline-block;padding:2px 7px;border-radius:5px;font-size:10px;font-weight:700;text-transform:uppercase}',
      '.qa-leads-temp.hot{background:#fef2f2;color:#dc2626}',
      '.qa-leads-temp.warm{background:#fffbeb;color:#d97706}',
      '.qa-leads-temp.cold{background:#eff6ff;color:#2563eb}',
      '.qa-leads-date{color:#9ca3af;font-size:11px;white-space:nowrap}',
      '.qa-leads-answers{font-size:11px;color:#6b7280;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',

      /* Refresh btn */
      '.qa-refresh-btn{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border:1.5px solid #e5e7eb;border-radius:7px;font-size:11px;font-weight:600;color:#6b7280;background:#fff;cursor:pointer;font-family:"Inter",sans-serif;transition:all .12s}',
      '.qa-refresh-btn:hover{border-color:#6366F1;color:#6366F1}',

      /* Tooltip */
      '.qa-tooltip-wrap{position:relative;display:inline-flex;cursor:help}',
      '.qa-tooltip{display:none;position:fixed;z-index:9999;background:#1f2937;color:#fff;font-size:11px;font-weight:500;line-height:1.4;padding:8px 12px;border-radius:8px;white-space:normal;width:220px;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,.25);pointer-events:none}',

      /* Answers popup overlay */
      '.qa-answers-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:100;display:flex;align-items:center;justify-content:center;animation:qa-fade-in .15s ease}',
      '@keyframes qa-fade-in{from{opacity:0}to{opacity:1}}',
      '.qa-answers-modal{background:#fff;border-radius:16px;width:90%;max-width:480px;max-height:80vh;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.2);display:flex;flex-direction:column;animation:qa-slide-up .2s ease}',
      '@keyframes qa-slide-up{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}',
      '.qa-answers-header{padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}',
      '.qa-answers-header-title{font-size:14px;font-weight:700;color:#111827}',
      '.qa-answers-header-sub{font-size:11px;color:#9ca3af;margin-top:2px}',
      '.qa-answers-close{width:28px;height:28px;border:none;background:#f3f4f6;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#6b7280;transition:all .12s;flex-shrink:0}',
      '.qa-answers-close:hover{background:#fee2e2;color:#ef4444}',
      '.qa-answers-body{padding:16px 20px;overflow-y:auto;flex:1}',
      '.qa-answer-item{padding:12px 14px;background:#f9fafb;border-radius:10px;margin-bottom:8px;border:1px solid #f3f4f6}',
      '.qa-answer-q{font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.03em;margin-bottom:4px}',
      '.qa-answer-a{font-size:13px;font-weight:600;color:#111827;line-height:1.4}',
      '.qa-answer-score{display:inline-block;margin-left:6px;font-size:10px;font-weight:700;color:#6366F1;background:#eef2ff;padding:1px 6px;border-radius:4px}',

      /* Answers button in table */
      '.qa-answers-btn{padding:4px 10px;border:1.5px solid #e5e7eb;border-radius:7px;font-size:11px;font-weight:600;color:#6366F1;background:#fff;cursor:pointer;font-family:"Inter",sans-serif;transition:all .12s;white-space:nowrap}',
      '.qa-answers-btn:hover{border-color:#6366F1;background:#eef2ff}',

      /* KPI split card (left: metric, divider, right: rate) */
      '.qa-kpi-split{display:flex;height:100%;min-height:110px}',
      '.qa-kpi-split{min-height:120px;height:100%}',
      '.qa-kpi-split-left{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:14px 10px}',
      '.qa-kpi-split-divider{width:1px;background:#e5e7eb;flex-shrink:0;align-self:stretch}',
      '.qa-kpi-split-right{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:14px 10px;gap:4px;border-radius:0 11px 11px 0}',
      '.qa-kpi-rate-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;text-align:center}',
      '.qa-kpi-rate-value{font-size:20px;font-weight:800;line-height:1.2;text-align:center}',

      /* Gear button (threshold config) */
      '.qa-kpi-gear{position:absolute;top:6px;right:6px;width:22px;height:22px;border:none;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#d1d5db;z-index:2;transition:color .12s;padding:0}',
      '.qa-kpi-gear:hover{color:#6366F1}',

      /* ── Alerts ─────────────────────────────────── */
      '.qa-alerts-loading{padding:40px;text-align:center;color:#9ca3af;font-size:13px}',

      /* Alert badge (campaninha) */
      '.qa-alert-badge{position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;border-radius:8px;background:#ef4444;color:#fff;font-size:9px;font-weight:800;display:none;align-items:center;justify-content:center;padding:0 4px;line-height:1}',
      '@keyframes qa-bell-ring{0%{transform:rotate(0)}10%{transform:rotate(14deg)}20%{transform:rotate(-14deg)}30%{transform:rotate(10deg)}40%{transform:rotate(-10deg)}50%{transform:rotate(6deg)}60%{transform:rotate(-6deg)}70%{transform:rotate(2deg)}80%{transform:rotate(-2deg)}90%{transform:rotate(0)}100%{transform:rotate(0)}}',
      '.qa-bell-active svg{animation:qa-bell-ring 1s ease infinite;transform-origin:top center}',
      '@keyframes qa-badge-pulse{0%{transform:scale(1)}50%{transform:scale(1.2)}100%{transform:scale(1)}}',
      '.qa-alert-badge[style*="display: flex"]{animation:qa-badge-pulse 1.5s ease infinite}',

      /* Alert card */
      '.qa-alert-card{background:#fff;border:1.5px solid #e5e7eb;border-left:4px solid #6b7280;border-radius:10px;padding:14px 16px;margin-bottom:10px;transition:opacity .2s}',
      '.qa-alert-card.qa-alert-done{opacity:.55}',
      '.qa-alert-header{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}',
      '.qa-alert-severity{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;font-size:10px;font-weight:700;text-transform:uppercase}',
      '.qa-alert-type{font-size:10px;font-weight:600;color:#9ca3af;background:#f3f4f6;padding:2px 6px;border-radius:4px}',
      '.qa-alert-variation{font-size:12px;font-weight:800}',
      '.qa-alert-date{font-size:10px;color:#9ca3af;margin-left:auto}',
      '.qa-alert-title{font-size:13px;font-weight:700;color:#111827;margin-bottom:4px}',
      '.qa-alert-desc{font-size:12px;color:#6b7280;margin-bottom:8px;line-height:1.4}',
      '.qa-alert-recommendation{display:flex;align-items:flex-start;gap:6px;padding:8px 10px;background:#eff6ff;border-radius:8px;font-size:11px;font-weight:600;color:#1d4ed8;line-height:1.4;margin-bottom:8px}',
      '.qa-alert-recommendation svg{flex-shrink:0;margin-top:1px}',
      '.qa-alert-done-btn{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border:1.5px solid #d1fae5;border-radius:7px;font-size:11px;font-weight:600;color:#059669;background:#f0fdf4;cursor:pointer;font-family:"Inter",sans-serif;transition:all .12s}',
      '.qa-alert-done-btn:hover{background:#dcfce7;border-color:#059669}',
      '.qa-alert-done-info{font-size:10px;color:#9ca3af;font-style:italic}',

      /* Alert groups */
      '.qa-alert-group{margin-bottom:20px}',
      '.qa-alert-group-title{font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;display:flex;align-items:center;gap:6px;padding-bottom:6px;border-bottom:1px solid #f3f4f6}',
    ].join('')
    document.head.appendChild(style)
  }

  window.QAStyles = { inject: _injectStyles }

})()
