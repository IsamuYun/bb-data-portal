/* Fairfax Donor Exporter - content script (runs on searchresults.aspx) */
(() => {
  if (window.__fdeLoaded) return;
  window.__fdeLoaded = true;

  const BASE = 'https://fairfaxcryobank.com/search/';
  const state = { running: false, stop: false, donors: [] };

  // 站点 Photo Consent 原文（用于在面板中展示，用户勾选同意后插件才会代为提交同意表单）
  const CONSENT_TEXT = 'I agree to use these photographs exclusively for the purpose of selecting a donor. I agree not to share, distribute or otherwise make the photographs available in any manner, or through any medium (including without limitation email, social media or internet feeds) to any third party. I will not use the photographs to seek a donor’s identity or other personally identifying information.';

  // 侧栏附件名称 -> 处理方式
  // 只抓取照片集；Childhood Photo / Summary Profile / Staff Impressions / Donor Essay / Medical Profile /
  // Genetic Testing / Personal Profile / Silhouette / Personality Type 等其余附件一律不抓取
  const PHOTO_CONSENT_ITEMS = ['Adult Child Photo Set', 'Lifetime Photos'];

  // ---------- UI ----------
  function buildPanel() {
    let p = document.getElementById('fde-panel');
    if (p) { p.style.display = ''; return p; }
    p = document.createElement('div');
    p.id = 'fde-panel';
    p.innerHTML = `
      <div class="fde-head"><span>Donor 采集导出</span><span class="fde-close" title="关闭">×</span></div>
      <div class="fde-body">
        <label><input type="checkbox" id="fde-allpages" checked> 遍历所有分页（否则只采集当前页）</label>
        <label><input type="checkbox" id="fde-essay" checked> 包含 "Get to know the donor" 介绍文本</label>
        <div class="fde-group">
          <div class="fde-group-title">附件下载（打包进 ZIP）</div>
          <label><input type="checkbox" id="fde-photoset" checked> Adult Child Photo Set（需同意 Photo Consent）</label>
          <label><input type="checkbox" id="fde-lifetime" checked> Lifetime Photos（需同意 Photo Consent）</label>
        </div>
        <div class="fde-group fde-consent">
          <div class="fde-group-title">Photo Consent（站点原文）</div>
          <div class="fde-consent-text">${CONSENT_TEXT}</div>
          <label><input type="checkbox" id="fde-consent"> 我已阅读并同意以上条款，授权本插件在抓取照片集时代我提交该同意表单</label>
        </div>
        <div class="fde-group">
          <div class="fde-group-title">中文翻译</div>
          <label><input type="checkbox" id="fde-zh" checked> 翻译为中文（字段名与枚举值使用内置词典，离线）</label>
          <label><input type="checkbox" id="fde-zh-online"> 自由文本在线翻译（介绍段落、职业、学位等，调用 Claude API，按量计费）</label>
          <label>Claude API Key <input type="password" id="fde-apikey" placeholder="sk-ant-..." style="width:170px"></label>
        </div>
        <label>请求间隔 <input type="number" id="fde-delay" value="800" min="0" step="100"> ms</label>
        <div class="fde-row">
          <button class="fde-start" id="fde-start">开始采集</button>
          <button class="fde-stop" id="fde-stop" disabled>停止</button>
        </div>
        <div class="fde-row">
          <button class="fde-export" id="fde-zip" disabled>导出 ZIP</button>
          <button class="fde-export2" id="fde-xlsx" disabled>导出 Excel</button>
        </div>
        <div class="fde-bar"><div id="fde-progress"></div></div>
        <div class="fde-status" id="fde-status">就绪。请先完成搜索条件，再点击“开始采集”。</div>
      </div>`;
    document.body.appendChild(p);
    p.querySelector('.fde-close').onclick = () => { p.style.display = 'none'; };
    p.querySelector('#fde-start').onclick = start;
    p.querySelector('#fde-stop').onclick = () => { state.stop = true; setStatus('正在停止…'); };
    p.querySelector('#fde-zip').onclick = () => exportZip().catch(e => setStatus('导出失败：' + e.message));
    p.querySelector('#fde-xlsx').onclick = () => exportExcel().catch(e => setStatus('导出失败：' + e.message));
    // API Key 持久化（chrome.storage.sync），不在导出文件中出现
    try {
      chrome.storage.sync.get('fdeApiKey').then(o => { if (o.fdeApiKey) p.querySelector('#fde-apikey').value = o.fdeApiKey; });
      p.querySelector('#fde-apikey').addEventListener('change', e => chrome.storage.sync.set({ fdeApiKey: e.target.value.trim() }));
    } catch (e) { /* ignore */ }
    return p;
  }
  const $ = (id) => document.getElementById(id);
  const chk = (id) => !!$(id)?.checked;
  function setStatus(t) { const s = $('fde-status'); if (s) s.textContent = t; }
  function setProgress(done, total) { const b = $('fde-progress'); if (b) b.style.width = total ? Math.round(done / total * 100) + '%' : '0'; }
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const tx = (el) => el ? [...el.childNodes].map(n => n.nodeType === 3 ? n.textContent : (n.tagName === 'BR' ? ' ' : tx(n))).join(' ').replace(/\s+/g, ' ').trim() : '';
  const safeName = (s) => String(s).replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'file';
  const extOf = (type, fallback) => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'application/pdf': 'pdf', 'text/html': 'html' }[(type || '').split(';')[0]] || fallback);

  // ---------- Search results page ----------
  function donorsOnCurrentPage() {
    const out = [];
    document.querySelectorAll('.rf01-col').forEach(col => {
      const a = col.querySelector('a[href*="donorprofile"]');
      if (!a) return;
      const m = a.getAttribute('href').match(/number=(\d+)/);
      if (!m) return;
      const quick = {};
      col.querySelectorAll('.rf01-data-clmn').forEach(c => {
        const k = c.querySelector('.rf01-data-clmn-title')?.textContent.replace(/:\s*$/, '').trim();
        const v = c.querySelector('.rf01-data-clmn-info')?.textContent.trim();
        if (k && k !== 'Category') quick[k] = v; // 不保留类别
      });
      out.push({ number: m[1], quick });
    });
    return out;
  }
  const curPage = () => parseInt(document.querySelector('.col-03 .link.here')?.textContent.trim() || '1', 10);
  const totalPages = () => parseInt((document.querySelector('.col-03 .total')?.textContent.match(/\d+/) || ['1'])[0], 10);

  async function clickPager(sel) {
    const el = document.querySelector(sel);
    if (!el || el.classList.contains('inactive')) return false;
    const before = curPage();
    el.click(); // 触发站点自带的 $.cb.sr.getPage (AJAX)
    for (let w = 0; w < 15000; w += 250) {
      await sleep(250);
      if (curPage() !== before && document.querySelector('.rf01-col')) { await sleep(400); return true; }
    }
    return false;
  }

  async function collectAllDonors(allPages) {
    const map = new Map();
    const add = () => donorsOnCurrentPage().forEach(d => { if (!map.has(d.number)) map.set(d.number, d); });
    if (allPages) {
      while (!state.stop && curPage() > 1) {
        setStatus(`正在返回第 1 页（当前第 ${curPage()} 页）…`);
        if (!(await clickPager('.col-03 a.link.prev'))) break;
      }
    }
    add();
    if (allPages) {
      const total = totalPages();
      while (!state.stop && curPage() < total) {
        setStatus(`正在翻页 ${curPage()}/${total}，已收集 ${map.size} 位 donor…`);
        if (!(await clickPager('.col-03 a.link.next'))) break;
        add();
      }
    }
    return [...map.values()];
  }

  // ---------- Donor profile parsing ----------
  function parseProfile(html, number) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const d = { number, fields: {}, essay: '', photoSrc: '', expandedGenetic: false, attachments: [] };
    const title = [...doc.querySelectorAll('.title')].find(e => /Donor Number/i.test(e.textContent));
    const wrap = title ? title.parentElement : doc.body;

    wrap.querySelectorAll('.title-sub .row').forEach(r => {
      const k = r.querySelector('.ts-01, .r-01')?.textContent.replace(/:\s*$/, '').trim();
      const v = tx(r.querySelector('.ts-02, .r-02'));
      if (k && v) d.fields[k] = v;
    });
    delete d.fields['Donor Brand']; delete d.fields['Donor Category']; // 不保留品牌 / 捐献者类别
    const avail = wrap.querySelector('.title-sub')?.textContent.match(/Availability:\s*([A-Za-z ]+)/);
    if (avail && !d.fields['Availability']) d.fields['Availability'] = avail[1].trim();
    d.expandedGenetic = /Expanded Genetic Testing/i.test(wrap.querySelector('.profile-sp')?.textContent || '');

    const main = wrap.querySelector('.main') || wrap;
    main.querySelectorAll('table.height td').forEach(td => {
      const k = td.querySelector('.title-block')?.textContent.replace(/:\s*$/, '').trim();
      if (k) d.fields[k] = tx(td.querySelector('.info'));
    });
    main.querySelectorAll('ul.list-info li').forEach(li => {
      const k = li.querySelector('.width')?.textContent.replace(/:\s*$/, '').trim();
      if (k) d.fields[k] = tx(li.querySelector('.text'));
    });
    d.essay = [...main.querySelectorAll('.foto .text p')].map(p => p.textContent.replace(/\s+/g, ' ').trim()).join('\n\n');
    const img = main.querySelector('.foto img') || wrap.querySelector('img[src*="ChildhoodPhoto"]');
    d.photoSrc = img ? new URL(img.getAttribute('src'), BASE).href : '';

    // 侧栏附件列表（Summary Profile / Adult Child Photo Set / Genetic Testing ...）
    doc.querySelectorAll('.sidebar_01 li').forEach(li => {
      const a = li.querySelector('a.sys__download-link, a.span-04');
      const name = li.querySelector('.span-02')?.textContent.trim();
      if (!a || !name || !a.getAttribute('href')) return;
      d.attachments.push({ name, url: new URL(a.getAttribute('href'), BASE).href });
    });
    return d;
  }

  async function fetchBlob(url, init) {
    const r = await fetch(url, { credentials: 'include', ...(init || {}) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.blob();
  }

  // 把 download.aspx 的 HTML 文档整理成可离线打开的文件：加 <base>，去掉脚本/追踪
  function cleanDocHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, iframe, noscript, img[src*="facebook.com"]').forEach(e => e.remove());
    let base = doc.querySelector('base');
    if (!base) { base = doc.createElement('base'); doc.head.prepend(base); }
    base.setAttribute('href', BASE);
    return '<!doctype html>\n' + doc.documentElement.outerHTML;
  }

  // 照片集：先 GET；若返回同意页且用户已勾选同意，则 POST 同意表单；再解析返回内容里的图片/PDF
  async function fetchPhotoSet(url, consent) {
    const files = []; // {path, blob}
    const isConsentPage = (doc) => !!doc.querySelector('input[name$="consent"]');
    let blob = await fetchBlob(url);
    if (/text\/html/.test(blob.type)) {
      let doc = new DOMParser().parseFromString(await blob.text(), 'text/html');
      if (isConsentPage(doc)) {
        if (!consent) throw new Error('需要先在面板中勾选同意 Photo Consent');
        const form = doc.querySelector('form');
        const body = new URLSearchParams();
        form.querySelectorAll('input[type=hidden]').forEach(i => body.set(i.name, i.value));
        const cb = form.querySelector('input[type=checkbox]');
        if (cb) body.set(cb.name, cb.value || 'on');
        const action = form.getAttribute('action') ? new URL(form.getAttribute('action'), url).href : url;
        blob = await fetchBlob(action, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
        if (/text\/html/.test(blob.type)) {
          doc = new DOMParser().parseFromString(await blob.text(), 'text/html');
          if (isConsentPage(doc)) throw new Error('提交同意表单后仍返回同意页');
        }
      }
      if (/text\/html/.test(blob.type)) {
        // 结果页：收集其中的图片与 PDF 链接
        const refs = new Set();
        doc.querySelectorAll('img[src]').forEach(i => refs.add(new URL(i.getAttribute('src'), url).href));
        doc.querySelectorAll('a[href]').forEach(a => { const h = new URL(a.getAttribute('href'), url).href; if (/\.(jpe?g|png|gif|webp|pdf)(\?|$)|donorfile\.ashx|ChildhoodPhoto|\.ashx/i.test(h)) refs.add(h); });
        let idx = 0;
        for (const ref of refs) {
          if (/logo|images-new\//i.test(ref)) continue;
          try {
            const b = await fetchBlob(ref);
            if (!/^(image\/|application\/pdf)/.test(b.type)) continue;
            idx++;
            files.push({ path: `${String(idx).padStart(2, '0')}.${extOf(b.type, 'bin')}`, blob: b });
          } catch (e) { /* skip */ }
        }
        if (!idx) files.push({ path: 'page.html', blob: new Blob([cleanDocHtml(doc.documentElement.outerHTML)], { type: 'text/html' }) });
        return files;
      }
    }
    if (/^(image\/|application\/pdf)/.test(blob.type)) files.push({ path: `01.${extOf(blob.type, 'bin')}`, blob });
    return files;
  }

  async function fetchDonor(number, opts) {
    const url = `${BASE}donorprofile.aspx?number=${number}`;
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = parseProfile(await r.text(), number);
    d.url = url;
    d.files = [];      // {path (relative to donors/<n>/), blob, kind: 'photoset', label}
    d.errors = [];
    const dir = `donors/${number}/`;
    const addFile = (path, blob, kind, label) => d.files.push({ path: dir + path, blob, kind, label });

    // 童年照仅用作表格缩略图（Base64 内嵌到 index.html），不单独存为附件文件
    d.thumb = null;
    if (d.photoSrc) {
      try { const b = await fetchBlob(d.photoSrc); if (/^image\//.test(b.type)) d.thumb = b; }
      catch (e) { d.errors.push('缩略图: ' + e.message); }
    }
    for (const att of d.attachments) {
      if (state.stop) break;
      if (!PHOTO_CONSENT_ITEMS.includes(att.name) || !opts.items[att.name]) continue; // 其余附件不抓取
      try {
        const files = await fetchPhotoSet(att.url, opts.consent);
        const sub = safeName(att.name);
        files.forEach(f => addFile(`${sub}/${f.path}`, f.blob, 'photoset', att.name));
      } catch (e) { d.errors.push(att.name + ': ' + e.message); }
      if (opts.delay) await sleep(Math.min(opts.delay, 300));
    }
    return d;
  }

  // ---------- Main flow ----------
  async function start() {
    if (state.running) return;
    const opts = {
      allPages: chk('fde-allpages'),
      consent: chk('fde-consent'), delay: Math.max(0, parseInt($('fde-delay').value, 10) || 0),
      items: { 'Adult Child Photo Set': chk('fde-photoset'), 'Lifetime Photos': chk('fde-lifetime') },
    };
    if ((opts.items['Adult Child Photo Set'] || opts.items['Lifetime Photos']) && !opts.consent) {
      setStatus('已勾选照片集，但未勾选同意 Photo Consent。请先阅读并勾选同意，或取消照片集选项。');
      return;
    }
    state.running = true; state.stop = false; state.donors = [];
    $('fde-start').disabled = true; $('fde-stop').disabled = false; $('fde-zip').disabled = true; $('fde-xlsx').disabled = true;
    try {
      const list = await collectAllDonors(opts.allPages);
      setStatus(`共找到 ${list.length} 位 donor，开始抓取详情与附件…`);
      for (let i = 0; i < list.length; i++) {
        if (state.stop) break;
        const { number, quick } = list[i];
        setStatus(`(${i + 1}/${list.length}) 正在抓取 Donor ${number}…`);
        try {
          const d = await fetchDonor(number, opts);
          d.quick = quick;
          state.donors.push(d);
        } catch (e) {
          state.donors.push({ number, fields: { ...quick }, essay: '', files: [], errors: [], url: `${BASE}donorprofile.aspx?number=${number}`, error: String(e) });
        }
        setProgress(i + 1, list.length);
        if (opts.delay) await sleep(opts.delay);
      }
      const nFiles = state.donors.reduce((s, d) => s + (d.files?.length || 0), 0);
      if (state.donors.length) await translateAll();
      setStatus(`${state.stop ? '已停止' : '完成'}：抓取 ${state.donors.length}/${list.length} 位 donor，附件 ${nFiles} 个。正在打包 ZIP…`);
      if (state.donors.length) {
        $('fde-zip').disabled = false; $('fde-xlsx').disabled = false;
        if (!state.stop) await exportZip();
      }
    } catch (e) {
      setStatus('出错：' + e.message);
    } finally {
      state.running = false; $('fde-start').disabled = false; $('fde-stop').disabled = true;
    }
  }

  // ---------- Translation ----------
  async function translateAll() {
    if (!chk('fde-zh') || !window.FdeTranslate) { state.donors.forEach(d => { delete d.zh; }); return; }
    const online = chk('fde-zh-online');
    const apiKey = ($('fde-apikey')?.value || '').trim();
    if (online && !apiKey) { setStatus('已勾选在线翻译但未填写 Claude API Key，将只使用内置词典。'); }
    setStatus('正在翻译为中文…');
    try {
      await FdeTranslate.translateDonors(state.donors, { online: online && !!apiKey, apiKey, onProgress: setStatus });
    } catch (e) {
      setStatus('在线翻译失败：' + e.message + '（已回退为内置词典）');
      await FdeTranslate.translateDonors(state.donors, { online: false });
      state.translateError = e.message;
    }
  }
  const hasZh = () => state.donors.some(d => d.zh);
  const tf = (name) => (hasZh() && window.FdeTranslate) ? FdeTranslate.translateField(name) : name;
  // 双语单元格：中文在上，原文（若不同）灰色小字在下
  function biCell(zh, en) {
    if (!hasZh()) return esc(en);
    if (!zh || zh === en) return esc(en);
    return `<div class="zh">${esc(zh)}</div><div class="en">${esc(en)}</div>`;
  }
  function biHeader(name) { const z = tf(name); return z === name ? esc(name) : `${esc(z)}<div class="en">${esc(name)}</div>`; }

  // ---------- Export ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const FIXED = ['Availability', 'Height', 'Weight', 'Eye Color', 'Skin Tone', 'Hair', 'Blood Type'];

  function essayCell(d) {
    const en = esc(d.essay).replace(/\n\n/g, '<br><br>');
    const zh = d.zh?.essay ? esc(d.zh.essay).replace(/\n\n/g, '<br><br>') : '';
    if (!zh) return en;
    return `<div class="zh">${zh}</div><details><summary>English 原文</summary><div class="en">${en}</div></details>`;
  }

  function buildIndexHtml(donors, { includeEssay, photoSrcOf, filesCell }) {
    const dyn = [];
    donors.forEach(d => Object.keys(d.fields).forEach(k => { if (!FIXED.includes(k) && !dyn.includes(k)) dyn.push(k); }));
    const cols = [...FIXED, ...dyn];
    const now = new Date();
    const rows = donors.map(d => {
      const photos = photoSrcOf(d);
      return `
      <tr id="d${esc(d.number)}">
        <td class="photo">${photos.length ? photos.map(p => `<a href="${esc(p.href)}" target="_blank"><img src="${esc(p.src)}" alt="${esc(p.alt)}" title="${esc(p.alt)}" loading="lazy"></a>`).join('') : '<span class="nophoto">无照片</span>'}</td>
        <td class="num">${esc(d.number)}${d.expandedGenetic ? `<div class="tag">${esc(tf('Expanded Genetic Testing'))}</div>` : ''}${d.error ? `<div class="err">抓取失败: ${esc(d.error)}</div>` : ''}${(d.errors || []).map(e => `<div class="err">${esc(e)}</div>`).join('')}</td>
        ${filesCell ? `<td class="files">${filesCell(d)}</td>` : ''}
        ${cols.map(c => `<td>${biCell(d.zh?.fields?.[c], d.fields[c] ?? '')}</td>`).join('')}
        ${includeEssay ? `<td class="essay">${essayCell(d)}</td>` : ''}
      </tr>`; }).join('');
    return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<title>Donor 列表 (${donors.length})</title>
<style>
  body{font:13px/1.5 -apple-system,"PingFang SC","Microsoft YaHei",Arial,sans-serif;margin:16px;color:#222}
  h1{font-size:18px;margin:0 0 4px} .meta{color:#666;margin-bottom:12px}
  table{border-collapse:collapse;width:100%} th,td{border:1px solid #ddd;padding:6px 8px;vertical-align:top;text-align:left}
  th{background:#f3f5f9;position:sticky;top:0;white-space:nowrap}
  tr:nth-child(even){background:#fafafa}
  td.photo{width:150px} td.photo img{width:130px;height:auto;border-radius:6px;display:block;margin:0 auto 6px}
  td.num{white-space:nowrap;font-weight:600} td.num a{color:#2a6fdb;text-decoration:none}
  td.files{white-space:nowrap;font-weight:400} td.files a{display:block;color:#2a6fdb;text-decoration:none;font-size:12px}
  .tag{font-size:11px;color:#2a9d4b;font-weight:400;white-space:normal} .err{font-size:11px;color:#c00;font-weight:400;white-space:normal}
  td.essay{min-width:360px;max-width:560px;font-size:12px;color:#444}
  .nophoto{color:#999}
  .zh{color:#222} .en{color:#888;font-size:11px;font-weight:400;white-space:normal}
  th .en{margin-top:2px} td.essay details{margin-top:6px} td.essay summary{cursor:pointer;color:#2a6fdb;font-size:11px}
</style></head><body>
<h1>Donor 列表</h1>
<div class="meta">共 ${donors.length} 位 donor · 导出时间 ${esc(now.toLocaleString())}</div>
<table>
<thead><tr><th>照片</th><th>Donor #</th>${filesCell ? '<th>附件</th>' : ''}${cols.map(c => `<th>${biHeader(c)}</th>`).join('')}${includeEssay ? `<th>${biHeader('Get to know the donor')}</th>` : ''}</tr></thead>
<tbody>${rows}</tbody>
</table>
</body></html>`;
  }

  const toDataUrl = (blob) => new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(''); fr.readAsDataURL(blob); });
  async function thumbDataUrls(donors) { const m = new Map(); for (const d of donors) if (d.thumb) m.set(d, await toDataUrl(d.thumb)); return m; }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }
  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

  // ZIP：index.html + donors/<number>/... 照片、PDF、HTML 文档
  async function exportZip() {
    const donors = state.donors;
    if (!donors.length) return;
    setStatus('正在打包 ZIP…');
    const includeEssay = chk('fde-essay');
    const thumbs = await thumbDataUrls(donors);
    const html = buildIndexHtml(donors, {
      includeEssay,
      photoSrcOf: (d) => [
        ...(thumbs.has(d) ? [{ src: thumbs.get(d), href: thumbs.get(d), alt: `Donor ${d.number}` }] : []),
        ...(d.files || []).filter(f => f.kind === 'photoset' && /\.(jpe?g|png|gif|webp)$/i.test(f.path)).map(f => ({ src: f.path, href: f.path, alt: `${f.label} - Donor ${d.number}` })),
      ],
      filesCell: (d) => (d.files || []).map(f => `<a href="${esc(f.path)}" target="_blank">${esc(f.label)}${f.kind === 'photoset' ? ' ' + esc(f.path.split('/').pop()) : ''}</a>`).join('') || '<span class="nophoto">无</span>', // 附件名称与内容均不翻译
    });
    const zip = new FdeZip();
    zip.add('index.html', html);
    zip.add('donors.json', JSON.stringify(donors.map(d => ({ number: d.number, fields: d.fields, fields_zh: d.zh?.fields, essay: d.essay, essay_zh: d.zh?.essay, expandedGenetic: d.expandedGenetic, files: (d.files || []).map(f => f.path), errors: d.errors })), null, 2));
    for (const d of donors) for (const f of (d.files || [])) zip.add(f.path, f.blob);
    const blob = await zip.build();
    download(blob, `donors_${stamp()}.zip`);
    setStatus(`ZIP 已生成（${(blob.size / 1048576).toFixed(1)} MB，${donors.length} 位 donor）。解压后打开 index.html 查看。`);
  }

  // Excel：每行一位 donor，童年照 / 照片集作为嵌入图片（ExcelJS，见 excel.js）
  async function exportExcel() {
    const donors = state.donors;
    if (!donors.length) return;
    if (!window.FdeExcel) throw new Error('Excel 模块未加载');
    setStatus('正在生成 Excel…');
    const blob = await FdeExcel.buildWorkbookBlob(donors, { fixed: FIXED, translateField: tf, onProgress: setStatus });
    download(blob, `donors_${stamp()}.xlsx`);
    setStatus(`Excel 已生成（${(blob.size / 1048576).toFixed(1)} MB，${donors.length} 位 donor）。`);
  }

  // ---------- Entry ----------
  chrome.runtime.onMessage.addListener((msg, _s, send) => {
    if (msg && msg.type === 'FDE_SHOW_PANEL') { buildPanel(); send({ ok: true }); }
  });
  buildPanel();
})();
