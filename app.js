(function () {
  'use strict';

  var STORAGE_KEY = 'talklocal_v1';
  var allSentences = [];

  // ── Storage ────────────────────────────────────────────────────────────────

  function readData() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : { sentences: [] };
    } catch (e) { return { sentences: [] }; }
  }

  function writeData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  // ── Date & SM-2 ───────────────────────────────────────────────────────────

  function todayCST() {
    return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  }

  function addDays(dateStr, days) {
    var d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function applyReview(sr, result) {
    var today = todayCST();
    if (result === 'forgot') {
      sr.repetitions = 0;
      sr.lapses += 1;
      sr.interval = 1;
      sr.easeFactor = Math.max(1.3, sr.easeFactor - 0.2);
      sr.dueDate = addDays(today, 1);
    } else {
      if (sr.repetitions === 0) sr.interval = 1;
      else if (sr.repetitions === 1) sr.interval = 6;
      else sr.interval = Math.round(sr.interval * sr.easeFactor);
      sr.easeFactor = Math.min(2.5, sr.easeFactor + 0.1);
      sr.repetitions += 1;
      sr.dueDate = addDays(today, sr.interval);
    }
    return sr;
  }

  function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  // ── Tab switching ──────────────────────────────────────────────────────────

  document.querySelectorAll('nav a').forEach(function (tab) {
    tab.addEventListener('click', function (e) {
      e.preventDefault();
      document.querySelectorAll('nav a').forEach(function (t) { t.classList.remove('active'); });
      document.querySelectorAll('main section').forEach(function (s) { s.classList.remove('active'); });
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
  });

  // ── Export / Import ────────────────────────────────────────────────────────

  var exportToggle = document.getElementById('exportToggle');
  var exportMenu   = document.getElementById('exportMenu');
  exportToggle.addEventListener('click', function (e) {
    e.stopPropagation();
    exportMenu.classList.toggle('open');
  });
  document.addEventListener('click', function () { exportMenu.classList.remove('open'); });

  document.getElementById('exportJSON').addEventListener('click', function (e) {
    e.preventDefault();
    var data = readData();
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'sentences-' + todayCST() + '.json');
  });

  document.getElementById('exportCSV').addEventListener('click', function (e) {
    e.preventDefault();
    var data = readData();
    var headers = ['id','english','chinese','source_url','source_ts','createdAt','interval','easeFactor','dueDate','repetitions','lapses'];
    function esc(v) {
      var s = String(v == null ? '' : v);
      return (s.includes('"') || s.includes(',') || s.includes('\n')) ? '"' + s.replace(/"/g,'""') + '"' : s;
    }
    var rows = data.sentences.map(function (s) {
      var src = s.source || {};
      return [s.id, s.english, s.chinese,
        typeof src === 'string' ? src : (src.url || ''),
        typeof src === 'string' ? '' : (src.timestamp || ''),
        s.createdAt, s.sr.interval, s.sr.easeFactor,
        s.sr.dueDate, s.sr.repetitions, s.sr.lapses
      ].map(esc).join(',');
    });
    var csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), 'sentences-' + todayCST() + '.csv');
  });

  document.getElementById('importBtn').addEventListener('click', function (e) {
    e.preventDefault();
    document.getElementById('importFile').click();
  });

  document.getElementById('importFile').addEventListener('change', function () {
    var file = this.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        if (!Array.isArray(data.sentences)) throw new Error();
        writeData(data);
        refresh();
        alert('导入成功，共 ' + data.sentences.length + ' 条');
      } catch (err) { alert('文件格式错误，请导入有效的 JSON 文件'); }
    };
    reader.readAsText(file);
    this.value = '';
  });

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

  function escHtml(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function renderSource(source) {
    var url = '', ts = '';
    if (!source) return '';
    if (typeof source === 'string') { url = source; }
    else { url = source.url || ''; ts = source.timestamp || ''; }
    var html = '';
    if (url) {
      try {
        var p = new URL(url);
        if (p.protocol === 'http:' || p.protocol === 'https:') {
          html += '<a class="source-link" href="' + escHtml(url) + '" target="_blank" rel="noopener">' + escHtml(p.hostname.replace(/^www\./,'')) + '</a>';
        } else { html += escHtml(url); }
      } catch (e) { html += escHtml(url); }
    }
    if (ts) html += (html ? ' ' : '') + '<span class="source-ts">' + escHtml(ts) + '</span>';
    return html;
  }

  function highlightKeywords(text, keywords) {
    if (!keywords || !keywords.length) return escHtml(text);
    var lower = text.toLowerCase();
    var flags = new Array(text.length).fill(false);
    keywords.forEach(function (k) {
      var w = k.word.toLowerCase();
      if (!w) return;
      var idx = 0;
      while ((idx = lower.indexOf(w, idx)) !== -1) {
        for (var i = idx; i < idx + w.length; i++) flags[i] = true;
        idx += w.length;
      }
    });
    var result = '', inMark = false;
    for (var i = 0; i < text.length; i++) {
      if (flags[i] && !inMark)  { result += '<mark>'; inMark = true; }
      if (!flags[i] && inMark)  { result += '</mark>'; inMark = false; }
      var c = text[i];
      result += c==='&'?'&amp;':c==='<'?'&lt;':c==='>'?'&gt;':c==='"'?'&quot;':c;
    }
    if (inMark) result += '</mark>';
    return result;
  }

  function renderKeywordChips(keywords) {
    if (!keywords || !keywords.length) return '';
    return '<div class="keyword-chips">' + keywords.map(function (k) {
      return '<span class="keyword-chip"><span class="chip-word">' + escHtml(k.word) + '</span>' +
        (k.translation ? '<span class="chip-trans">' + escHtml(k.translation) + '</span>' : '') + '</span>';
    }).join('') + '</div>';
  }

  function parseKeywords(text) {
    return text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var sep = l.indexOf(':'); if (sep < 0) sep = l.indexOf('=');
      return sep > 0 ? { word: l.slice(0,sep).trim(), translation: l.slice(sep+1).trim() } : { word: l, translation: '' };
    }).filter(function (k) { return k.word; });
  }

  function serializeKeywords(kw) {
    return (kw || []).map(function (k) { return k.translation ? k.word+': '+k.translation : k.word; }).join('\n');
  }

  function srcUrl(s) { return !s ? '' : typeof s==='string' ? s : (s.url||''); }
  function srcTs(s)  { return !s || typeof s==='string' ? '' : (s.timestamp||''); }

  // ── Render: Today's Review ─────────────────────────────────────────────────

  function renderReview(sentences) {
    var list  = document.getElementById('reviewList');
    var badge = document.getElementById('dueBadge');
    var count = document.getElementById('reviewCount');
    badge.textContent = sentences.length;
    if (!sentences.length) {
      list.innerHTML = '<div class="all-done">今日复习已完成，继续保持！</div>';
      count.textContent = ''; return;
    }
    count.textContent = '共 ' + sentences.length + ' 条待复习';
    list.innerHTML = sentences.map(function (s) {
      var kw = s.keywords || [];
      return ['<div class="card" data-id="'+s.id+'">',
        '<div class="card-chinese"><span>'+escHtml(s.chinese)+'</span><span class="toggle-hint">点击展开英文</span></div>',
        '<div class="card-english"><div class="card-english-text">'+highlightKeywords(s.english,kw)+'</div>'+renderKeywordChips(kw)+'</div>',
        '<div class="card-actions"><button class="btn btn-knew" data-action="knew">会了 ✓</button><button class="btn btn-forgot" data-action="forgot">不会 ✗</button></div>',
        '</div>'].join('');
    }).join('');

    list.querySelectorAll('.card-chinese').forEach(function (el) {
      el.addEventListener('click', function () {
        var card = el.closest('.card');
        if (!card.classList.contains('reviewed')) card.classList.toggle('expanded');
      });
    });

    list.querySelectorAll('.btn-knew, .btn-forgot').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var card = btn.closest('.card');
        if (card.classList.contains('reviewed')) return;
        card.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
        var id = card.dataset.id;
        var data = readData();
        var s = data.sentences.find(function (x) { return x.id === id; });
        if (s) { s.sr = applyReview(s.sr, btn.dataset.action); writeData(data); }
        card.classList.add('reviewed');
        var remaining = list.querySelectorAll('.card:not(.reviewed)').length;
        badge.textContent = remaining;
        count.textContent = remaining > 0 ? '共 ' + remaining + ' 条待复习' : '今日复习已完成';
        loadAll();
      });
    });
  }

  // ── Render: All Sentences ──────────────────────────────────────────────────

  function renderAll(sentences) {
    var list  = document.getElementById('allList');
    var badge = document.getElementById('allBadge');
    var count = document.getElementById('allCount');
    badge.textContent = sentences.length;
    count.textContent = '共 ' + sentences.length + ' 条';
    if (!sentences.length) {
      list.innerHTML = '<div class="empty">暂无句子，先去添加几条吧</div>'; return;
    }
    list.innerHTML = sentences.map(renderListCard).join('');
    bindListCardEvents(list);
  }

  function renderListCard(s) {
    var kw = s.keywords || [];
    var src = renderSource(s.source);
    var meta = (src ? '<span class="lc-source">'+src+'</span> · ' : '') +
               '下次复习: '+s.sr.dueDate+' · 已复习 '+s.sr.repetitions+' 次';
    return ['<div class="list-card" data-id="'+s.id+'">',
      '<div class="lc-view">',
        '<div class="lc-chinese">'+escHtml(s.chinese)+'</div>',
        '<div class="lc-english">'+highlightKeywords(s.english,kw)+'</div>',
        renderKeywordChips(kw),
        '<div class="lc-meta"><span class="lc-meta-left">'+meta+'</span>',
          '<span class="lc-actions"><button class="btn btn-edit">编辑</button><button class="btn btn-delete">删除</button></span></div>',
      '</div>',
      '<div class="lc-edit" style="display:none">',
        '<div class="form-group"><label>中文</label><textarea class="edit-chinese">'+escHtml(s.chinese)+'</textarea></div>',
        '<div class="form-group"><label>英文</label><textarea class="edit-english">'+escHtml(s.english)+'</textarea></div>',
        '<div class="form-group"><label>视频链接</label><input class="edit-source-url" type="text" value="'+escHtml(srcUrl(s.source))+'"></div>',
        '<div class="form-group"><label>时间戳</label><input class="edit-source-ts" type="text" placeholder="例如 2:30" value="'+escHtml(srcTs(s.source))+'"></div>',
        '<div class="form-group"><label>关键词汇（每行一个）</label><textarea class="edit-keywords" style="min-height:72px">'+escHtml(serializeKeywords(kw))+'</textarea></div>',
        '<div class="form-footer"><button class="btn btn-primary btn-save">保存</button><button class="btn btn-cancel">取消</button></div>',
      '</div>',
    '</div>'].join('');
  }

  function bindListCardEvents(container) {
    container.querySelectorAll('.btn-delete').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var card = btn.closest('.list-card');
        if (!confirm('确认删除这条句子？删除后无法恢复。')) return;
        var data = readData();
        data.sentences = data.sentences.filter(function (s) { return s.id !== card.dataset.id; });
        writeData(data); refresh();
      });
    });
    container.querySelectorAll('.btn-edit').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var card = btn.closest('.list-card');
        card.querySelector('.lc-view').style.display = 'none';
        card.querySelector('.lc-edit').style.display = 'block';
      });
    });
    container.querySelectorAll('.btn-cancel').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var card = btn.closest('.list-card');
        card.querySelector('.lc-view').style.display = '';
        card.querySelector('.lc-edit').style.display = 'none';
      });
    });
    container.querySelectorAll('.btn-save').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var card = btn.closest('.list-card');
        var chinese  = card.querySelector('.edit-chinese').value.trim();
        var english  = card.querySelector('.edit-english').value.trim();
        if (!chinese || !english) { alert('中文和英文不能为空'); return; }
        var source   = { url: card.querySelector('.edit-source-url').value.trim(), timestamp: card.querySelector('.edit-source-ts').value.trim() };
        var keywords = parseKeywords(card.querySelector('.edit-keywords').value);
        var data = readData();
        var s = data.sentences.find(function (x) { return x.id === card.dataset.id; });
        if (s) { s.chinese = chinese; s.english = english; s.source = source; s.keywords = keywords; writeData(data); }
        var tmp = document.createElement('div');
        tmp.innerHTML = renderListCard(s);
        var newEl = tmp.firstElementChild;
        card.replaceWith(newEl);
        bindListCardEvents(newEl);
        for (var i = 0; i < allSentences.length; i++) {
          if (allSentences[i].id === s.id) { allSentences[i] = s; break; }
        }
        loadDue();
      });
    });
  }

  // ── Search ─────────────────────────────────────────────────────────────────

  document.getElementById('searchInput').addEventListener('input', function () {
    var q = this.value.trim().toLowerCase();
    renderAll(q ? allSentences.filter(function (s) {
      return s.chinese.toLowerCase().includes(q) || s.english.toLowerCase().includes(q);
    }) : allSentences);
  });

  // ── Add Form ───────────────────────────────────────────────────────────────

  document.getElementById('addForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var chinese  = document.getElementById('f-chinese').value.trim();
    var english  = document.getElementById('f-english').value.trim();
    if (!chinese || !english) return;
    var today = todayCST();
    var sentence = {
      id: generateId(), chinese: chinese, english: english,
      source: { url: document.getElementById('f-source-url').value.trim(), timestamp: document.getElementById('f-source-ts').value.trim() },
      keywords: parseKeywords(document.getElementById('f-keywords').value),
      createdAt: new Date().toISOString(),
      sr: { interval: 1, easeFactor: 2.5, dueDate: today, repetitions: 0, lapses: 0 }
    };
    var data = readData();
    data.sentences.push(sentence);
    writeData(data);
    ['f-chinese','f-english','f-source-url','f-source-ts','f-keywords'].forEach(function (id) {
      document.getElementById(id).value = '';
    });
    var notice = document.getElementById('addNotice');
    notice.style.display = 'inline';
    setTimeout(function () { notice.style.display = 'none'; }, 2000);
    refresh();
  });

  // ── Load & Refresh ─────────────────────────────────────────────────────────

  function loadDue() {
    var today = todayCST();
    var data  = readData();
    renderReview(data.sentences.filter(function (s) { return s.sr.dueDate <= today; }));
  }

  function loadAll() {
    var data = readData();
    allSentences = data.sentences.slice().sort(function (a, b) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    var q = document.getElementById('searchInput').value.trim().toLowerCase();
    renderAll(q ? allSentences.filter(function (s) {
      return s.chinese.toLowerCase().includes(q) || s.english.toLowerCase().includes(q);
    }) : allSentences);
  }

  function refresh() { loadDue(); loadAll(); }

  refresh();

})();
