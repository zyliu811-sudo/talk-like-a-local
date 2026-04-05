(function () {
  'use strict';

  var allSentences = [];

  // ── API helpers ────────────────────────────────────────────────────────────

  function apiFetch(method, url, body) {
    var opts = {
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body) opts.body = JSON.stringify(body);
    return fetch(url, opts).then(function (r) {
      if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || r.status); });
      return r.json();
    });
  }

  // ── Tab switching ──────────────────────────────────────────────────────────

  var tabs = document.querySelectorAll('nav a');
  var sections = document.querySelectorAll('main section');

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function (e) {
      e.preventDefault();
      var target = tab.dataset.tab;
      tabs.forEach(function (t) { t.classList.remove('active'); });
      sections.forEach(function (s) { s.classList.remove('active'); });
      tab.classList.add('active');
      document.getElementById('tab-' + target).classList.add('active');
    });
  });

  // ── Export dropdown ────────────────────────────────────────────────────────

  var exportToggle = document.getElementById('exportToggle');
  var exportMenu = document.getElementById('exportMenu');

  exportToggle.addEventListener('click', function (e) {
    e.stopPropagation();
    exportMenu.classList.toggle('open');
  });

  document.addEventListener('click', function () {
    exportMenu.classList.remove('open');
  });

  // ── Utilities ─────────────────────────────────────────────────────────────

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Render source object { url, timestamp } or legacy string → HTML
  function renderSource(source) {
    var url = '', ts = '';
    if (!source) return '';
    if (typeof source === 'string') { url = source; }
    else { url = source.url || ''; ts = source.timestamp || ''; }

    var html = '';
    if (url) {
      try {
        var parsed = new URL(url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          var host = parsed.hostname.replace(/^www\./, '');
          html += '<a class="source-link" href="' + escHtml(url) + '" target="_blank" rel="noopener">' + escHtml(host) + '</a>';
        } else {
          html += escHtml(url);
        }
      } catch (e) {
        html += escHtml(url);
      }
    }
    if (ts) html += (html ? ' ' : '') + '<span class="source-ts">' + escHtml(ts) + '</span>';
    return html;
  }

  // Highlight keyword occurrences inside English text (case-insensitive)
  function highlightKeywords(text, keywords) {
    if (!keywords || keywords.length === 0) return escHtml(text);

    var lower = text.toLowerCase();
    // Mark character positions that belong to a keyword
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

    // Build HTML char by char, wrapping runs of flagged chars in <mark>
    var result = '';
    var inMark = false;
    for (var i = 0; i < text.length; i++) {
      if (flags[i] && !inMark)  { result += '<mark>'; inMark = true; }
      if (!flags[i] && inMark)  { result += '</mark>'; inMark = false; }
      // Escape each character individually (only & < > " need escaping)
      var c = text[i];
      if (c === '&') result += '&amp;';
      else if (c === '<') result += '&lt;';
      else if (c === '>') result += '&gt;';
      else if (c === '"') result += '&quot;';
      else result += c;
    }
    if (inMark) result += '</mark>';
    return result;
  }

  // Render keyword chips row
  function renderKeywordChips(keywords) {
    if (!keywords || keywords.length === 0) return '';
    var chips = keywords.map(function (k) {
      var inner = '<span class="chip-word">' + escHtml(k.word) + '</span>';
      if (k.translation) inner += '<span class="chip-trans">' + escHtml(k.translation) + '</span>';
      return '<span class="keyword-chip">' + inner + '</span>';
    }).join('');
    return '<div class="keyword-chips">' + chips + '</div>';
  }

  // Parse keywords textarea: each non-empty line → {word, translation}
  // Formats accepted: "word: translation"  or  "word=translation"  or  just "word"
  function parseKeywords(text) {
    return text.split('\n')
      .map(function (line) { return line.trim(); })
      .filter(function (line) { return line.length > 0; })
      .map(function (line) {
        var sep = line.indexOf(':');
        if (sep < 0) sep = line.indexOf('=');
        if (sep > 0) {
          return { word: line.slice(0, sep).trim(), translation: line.slice(sep + 1).trim() };
        }
        return { word: line, translation: '' };
      })
      .filter(function (k) { return k.word.length > 0; });
  }

  // ── Render: Today's Review ─────────────────────────────────────────────────

  function renderReview(sentences) {
    var list = document.getElementById('reviewList');
    var badge = document.getElementById('dueBadge');
    var count = document.getElementById('reviewCount');

    badge.textContent = sentences.length;

    if (sentences.length === 0) {
      list.innerHTML = '<div class="all-done">今日复习已完成，继续保持！</div>';
      count.textContent = '';
      return;
    }

    count.textContent = '共 ' + sentences.length + ' 条待复习';

    list.innerHTML = sentences.map(function (s) {
      var kw = s.keywords || [];
      return [
        '<div class="card" data-id="' + s.id + '">',
        '  <div class="card-chinese">',
        '    <span>' + escHtml(s.chinese) + '</span>',
        '    <span class="toggle-hint">点击展开英文</span>',
        '  </div>',
        '  <div class="card-english">',
        '    <div class="card-english-text">' + highlightKeywords(s.english, kw) + '</div>',
             renderKeywordChips(kw),
        '  </div>',
        '  <div class="card-actions">',
        '    <button class="btn btn-knew" data-action="knew">会了 ✓</button>',
        '    <button class="btn btn-forgot" data-action="forgot">不会 ✗</button>',
        '  </div>',
        '</div>'
      ].join('');
    }).join('');

    list.querySelectorAll('.card-chinese').forEach(function (el) {
      el.addEventListener('click', function () {
        var card = el.closest('.card');
        if (card.classList.contains('reviewed')) return;
        card.classList.toggle('expanded');
      });
    });

    list.querySelectorAll('.btn-knew, .btn-forgot').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var card = btn.closest('.card');
        if (card.classList.contains('reviewed')) return;
        var id = card.dataset.id;
        var result = btn.dataset.action;

        card.querySelectorAll('button').forEach(function (b) { b.disabled = true; });

        apiFetch('PUT', '/api/sentences/' + id + '/review', { result: result })
          .then(function () {
            card.classList.add('reviewed');
            var remaining = document.querySelectorAll('.card:not(.reviewed)').length;
            document.getElementById('dueBadge').textContent = remaining;
            document.getElementById('reviewCount').textContent =
              remaining > 0 ? '共 ' + remaining + ' 条待复习' : '今日复习已完成';
            loadAll();
          })
          .catch(function (err) {
            alert('操作失败：' + err.message);
            card.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
          });
      });
    });
  }

  // ── Render: All Sentences ──────────────────────────────────────────────────

  function renderAll(sentences) {
    var list = document.getElementById('allList');
    var badge = document.getElementById('allBadge');
    var count = document.getElementById('allCount');

    badge.textContent = sentences.length;
    count.textContent = '共 ' + sentences.length + ' 条';

    if (sentences.length === 0) {
      list.innerHTML = '<div class="empty">暂无句子，先去添加几条吧</div>';
      return;
    }

    list.innerHTML = sentences.map(function (s) {
      return renderListCard(s);
    }).join('');

    bindListCardEvents(list);
  }

  function renderListCard(s) {
    var kw = s.keywords || [];
    var metaParts = [];
    metaParts.push('下次复习: ' + s.sr.dueDate);
    metaParts.push('已复习 ' + s.sr.repetitions + ' 次');

    return [
      '<div class="list-card" data-id="' + s.id + '">',
      '  <div class="lc-view">',
      '    <div class="lc-chinese">' + escHtml(s.chinese) + '</div>',
      '    <div class="lc-english">' + highlightKeywords(s.english, kw) + '</div>',
           renderKeywordChips(kw),
      '    <div class="lc-meta">',
      '      <span class="lc-meta-left">',
               s.source ? '<span class="lc-source">' + renderSource(s.source) + '</span> · ' : '',
      '        ' + metaParts.join(' · '),
      '      </span>',
      '      <span class="lc-actions">',
      '        <button class="btn btn-edit">编辑</button>',
      '        <button class="btn btn-delete">删除</button>',
      '      </span>',
      '    </div>',
      '  </div>',
      '  <div class="lc-edit" style="display:none">',
      '    <div class="form-group"><label>中文</label>',
      '      <textarea class="edit-chinese">' + escHtml(s.chinese) + '</textarea></div>',
      '    <div class="form-group"><label>英文</label>',
      '      <textarea class="edit-english">' + escHtml(s.english) + '</textarea></div>',
      '    <div class="form-group"><label>视频链接</label>',
      '      <input class="edit-source-url" type="text" value="' + escHtml(srcUrl(s.source)) + '"></div>',
      '    <div class="form-group"><label>时间戳</label>',
      '      <input class="edit-source-ts" type="text" placeholder="例如 2:30" value="' + escHtml(srcTs(s.source)) + '"></div>',
      '    <div class="form-group"><label>关键词汇（每行一个）</label>',
      '      <textarea class="edit-keywords" style="min-height:72px">' + escHtml(serializeKeywords(kw)) + '</textarea></div>',
      '    <div class="form-footer">',
      '      <button class="btn btn-primary btn-save">保存</button>',
      '      <button class="btn btn-cancel">取消</button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('');
  }

  // Extract url/timestamp from either new object or legacy string
  function srcUrl(source) {
    if (!source) return '';
    if (typeof source === 'string') return source;
    return source.url || '';
  }
  function srcTs(source) {
    if (!source || typeof source === 'string') return '';
    return source.timestamp || '';
  }

  function serializeKeywords(keywords) {
    if (!keywords || keywords.length === 0) return '';
    return keywords.map(function (k) {
      return k.translation ? k.word + ': ' + k.translation : k.word;
    }).join('\n');
  }

  function bindListCardEvents(list) {
    list.querySelectorAll('.btn-delete').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var card = btn.closest('.list-card');
        var id = card.dataset.id;
        if (!confirm('确认删除这条句子？删除后无法恢复。')) return;
        apiFetch('DELETE', '/api/sentences/' + id)
          .then(function () { loadAll(); loadDue(); })
          .catch(function (err) { alert('删除失败：' + err.message); });
      });
    });

    list.querySelectorAll('.btn-edit').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var card = btn.closest('.list-card');
        card.querySelector('.lc-view').style.display = 'none';
        card.querySelector('.lc-edit').style.display = 'block';
      });
    });

    list.querySelectorAll('.btn-cancel').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var card = btn.closest('.list-card');
        card.querySelector('.lc-view').style.display = '';
        card.querySelector('.lc-edit').style.display = 'none';
      });
    });

    list.querySelectorAll('.btn-save').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var card = btn.closest('.list-card');
        var id = card.dataset.id;
        var chinese  = card.querySelector('.edit-chinese').value.trim();
        var english  = card.querySelector('.edit-english').value.trim();
        var source   = {
          url:       card.querySelector('.edit-source-url').value.trim(),
          timestamp: card.querySelector('.edit-source-ts').value.trim()
        };
        var keywords = parseKeywords(card.querySelector('.edit-keywords').value);

        if (!chinese || !english) { alert('中文和英文不能为空'); return; }

        btn.disabled = true;
        apiFetch('PUT', '/api/sentences/' + id, { chinese: chinese, english: english, source: source, keywords: keywords })
          .then(function (updated) {
            var tmp = document.createElement('div');
            tmp.innerHTML = renderListCard(updated);
            var newEl = tmp.firstElementChild;
            card.replaceWith(newEl);
            bindListCardEvents(newEl);
            for (var i = 0; i < allSentences.length; i++) {
              if (allSentences[i].id === id) { allSentences[i] = updated; break; }
            }
            loadDue();
          })
          .catch(function (err) {
            alert('保存失败：' + err.message);
            btn.disabled = false;
          });
      });
    });
  }

  // ── Search ─────────────────────────────────────────────────────────────────

  document.getElementById('searchInput').addEventListener('input', function () {
    var q = this.value.trim().toLowerCase();
    if (!q) { renderAll(allSentences); return; }
    var filtered = allSentences.filter(function (s) {
      return s.chinese.toLowerCase().includes(q) || s.english.toLowerCase().includes(q);
    });
    renderAll(filtered);
  });

  // ── Add Form ───────────────────────────────────────────────────────────────

  document.getElementById('addForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var chinese  = document.getElementById('f-chinese').value.trim();
    var english  = document.getElementById('f-english').value.trim();
    var source   = {
      url:       document.getElementById('f-source-url').value.trim(),
      timestamp: document.getElementById('f-source-ts').value.trim()
    };
    var kwRaw    = document.getElementById('f-keywords').value;
    var keywords = parseKeywords(kwRaw);

    if (!chinese || !english) return;

    var submitBtn = this.querySelector('button[type=submit]');
    submitBtn.disabled = true;

    apiFetch('POST', '/api/sentences', { chinese: chinese, english: english, source: source, keywords: keywords })
      .then(function () {
        document.getElementById('f-chinese').value     = '';
        document.getElementById('f-english').value     = '';
        document.getElementById('f-source-url').value  = '';
        document.getElementById('f-source-ts').value   = '';
        document.getElementById('f-keywords').value    = '';

        var notice = document.getElementById('addNotice');
        notice.style.display = 'inline';
        setTimeout(function () { notice.style.display = 'none'; }, 2000);

        loadAll();
        loadDue();
      })
      .catch(function (err) { alert('添加失败：' + err.message); })
      .finally(function () { submitBtn.disabled = false; });
  });

  // ── Data loading ───────────────────────────────────────────────────────────

  function loadDue() {
    return fetch('/api/sentences/due')
      .then(function (r) { return r.json(); })
      .then(function (sentences) { renderReview(sentences); });
  }

  function loadAll() {
    return fetch('/api/sentences')
      .then(function (r) { return r.json(); })
      .then(function (sentences) {
        allSentences = sentences;
        var q = document.getElementById('searchInput').value.trim().toLowerCase();
        if (q) {
          var filtered = sentences.filter(function (s) {
            return s.chinese.toLowerCase().includes(q) || s.english.toLowerCase().includes(q);
          });
          renderAll(filtered);
        } else {
          renderAll(sentences);
        }
      });
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  loadDue();
  loadAll();

})();
