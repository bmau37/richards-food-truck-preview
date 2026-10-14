/* Richard's Food Truck: site behaviour. No dependencies, no tracking, no network calls except loading the
   local JSON files in /data (and Google Maps only if a visitor clicks "Load interactive map"). */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const params = new URLSearchParams(location.search);
  const DEMO = params.has('demo');
  const REVIEW = params.has('review') || DEMO;
  document.documentElement.classList.add('js');
  if (REVIEW) document.body.classList.add('review');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- data loading: live JSON first, bundled snapshot as fallback (file://) ---------- */
  const SNAP = window.RFT_SNAPSHOT || {};
  async function load(name) {
    const file = (DEMO && (name === 'schedule' || name === 'specials')) ? 'demo-' + name : name;
    try {
      const r = await fetch('data/' + file + '.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch (e) {
      if (SNAP[file]) return SNAP[file];
      console.warn('Could not load data/' + file + '.json');
      return null;
    }
  }

  /* ---------- time helpers (always Hendersonville time) ---------- */
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function nowIn(tz) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' })
      .formatToParts(new Date()).map(x => [x.type, x.value]));
    const h = +p.hour % 24;
    return { ymd: `${p.year}-${p.month}-${p.day}`, dow: p.weekday, mins: h * 60 + +p.minute };
  }
  const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
  const fmtTime = t => { let m = toMin(t), h = Math.floor(m / 60), mm = m % 60; const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return mm ? `${h}:${String(mm).padStart(2, '0')} ${ap}` : `${h} ${ap}`; };
  function addDays(ymd, n) {
    const [y, m, d] = ymd.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d + n));
    return { ymd: dt.toISOString().slice(0, 10), dow: DOW[dt.getUTCDay()], day: dt.getUTCDate() };
  }
  function stopsOn(s, ymd, dow) {
    const closed = (s.closures || []).find(c => c.date === ymd);
    if (closed) return { closed: true, note: closed.note || 'Closed' };
    const dated = (s.dates || []).filter(d => d.date === ymd);
    const list = dated.length ? dated : (s.weekly || []).filter(w => (w.days || []).includes(dow));
    return { stops: list.slice().sort((a, b) => toMin(a.start) - toMin(b.start)) };
  }
  function computeStatus(s) {
    const tz = s.timezone || 'America/New_York';
    const now = nowIn(tz);
    const hasData = (s.weekly || []).length || (s.dates || []).length;
    if (!hasData) return { state: 'unknown', label: 'Hours coming soon', short: 'Call for today’s stop', detail: 'Service times are being confirmed. Call (828) 803-1763 before you head over.' };
    const today = stopsOn(s, now.ymd, now.dow);
    if (!today.closed) {
      const open = today.stops.find(x => now.mins >= toMin(x.start) && now.mins < toMin(x.end));
      if (open) {
        const left = toMin(open.end) - now.mins;
        return { state: 'open', label: 'Open now', short: `Open · till ${fmtTime(open.end)}`, detail: `Serving at ${open.place} until ${fmtTime(open.end)}${left <= 45 ? ` (closing in ${left} min)` : ''}.`, stop: open };
      }
      const later = today.stops.find(x => toMin(x.start) > now.mins);
      if (later) return { state: 'soon', label: 'Opens today', short: `Opens ${fmtTime(later.start)}`, detail: `Today ${fmtTime(later.start)}–${fmtTime(later.end)} at ${later.place}.`, stop: later };
    }
    for (let i = 1; i <= 21; i++) {
      const d = addDays(now.ymd, i); const r = stopsOn(s, d.ymd, d.dow);
      if (!r.closed && r.stops.length) {
        const x = r.stops[0]; const when = i === 1 ? 'tomorrow' : d.dow;
        return { state: 'closed', label: today.closed ? 'Closed today' : 'Closed now', short: `Next: ${when} ${fmtTime(x.start)}`, detail: `${today.closed && today.note ? today.note + '. ' : ''}Next stop ${when} at ${fmtTime(x.start)}, ${x.place}.`, stop: x };
      }
    }
    return { state: 'closed', label: 'Closed', short: 'No stops posted', detail: 'No upcoming stops are posted. Call (828) 803-1763.' };
  }
  function renderStatus(s, site) {
    const st = computeStatus(s);
    $$('[data-status-pill]').forEach(el => { el.dataset.state = st.state; $('.txt', el).textContent = st.state === 'unknown' ? 'Call for hours' : st.short; });
    $$('[data-status-card],[data-live-card]').forEach(el => el.dataset.state = st.state);
    $$('[data-status-label]').forEach(el => el.textContent = st.label);
    $$('[data-status-detail]').forEach(el => el.textContent = st.detail);
    const tz = s.timezone || 'America/New_York';
    const clock = $('[data-clock]');
    if (clock) clock.textContent = 'Hendersonville time ' + new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', weekday: 'short' }).format(new Date());
    // Week strip
    const now = nowIn(tz); const week = $('[data-week]');
    if (week) {
      week.innerHTML = Array.from({ length: 7 }, (_, i) => {
        const d = addDays(now.ymd, i); const r = stopsOn(s, d.ymd, d.dow);
        const has = !r.closed && r.stops.length;
        const t = r.closed ? 'Closed' : has ? r.stops.map(x => `${fmtTime(x.start).replace(' ', '')}–${fmtTime(x.end).replace(' ', '')}`).join(', ') : (st.state === 'unknown' ? 'TBA' : 'No stop');
        const title = has ? r.stops.map(x => `${x.place}${x.address ? ', ' + x.address : ''}${x.note ? ' (' + x.note + ')' : ''}`).join('; ') : '';
        return `<li class="${i === 0 ? 'today ' : ''}${has ? 'has ' : ''}${r.closed ? 'off' : ''}" title="${esc(title)}"><b>${i === 0 ? 'Today' : d.dow}</b><span class="d">${d.day}</span><span class="t">${esc(t)}</span></li>`;
      }).join('');
    }
    const note = $('[data-sched-note]');
    if (note) note.textContent = DEMO ? 'SAMPLE DATA: demo schedule, not Richard’s real hours.' : (st.state === 'unknown' ? 'Weekly stops are being confirmed. Check Facebook or call before making the trip.' : 'Schedules can change with weather and events. Call to confirm.');
  }

  /* ---------- specials banner ---------- */
  function renderSpecials(data) {
    const box = $('#specials'); if (!box || !data) return;
    const today = nowIn('America/New_York').ymd;
    const live = (data.specials || []).filter(x => x.title && (!x.from || x.from <= today) && (!x.until || x.until >= today));
    if (!live.length) return;
    box.innerHTML = live.map(x => `<span class="sp-item"><span class="sp-tag${DEMO ? ' demo' : ''}">${DEMO ? 'Sample' : 'Special'}</span>${esc(x.title)}${x.text ? ' · <span style="font-weight:500">' + esc(x.text) + '</span>' : ''}</span>`).join('');
    box.hidden = false;
  }

  /* ---------- menu ---------- */
  const pic = (base, w, alt, sizes = '(min-width:960px) 40vw, 92vw', large) => `<picture><source type="image/webp" srcset="assets/img/${base}-480.webp 480w${large ? `, assets/img/${base}-${large}.webp ${large}w` : ''}" sizes="${sizes}"><img src="assets/img/${base}-480.jpg" srcset="assets/img/${base}-480.jpg 480w${large ? `, assets/img/${base}-${large}.jpg ${large}w` : ''}" sizes="${sizes}" width="480" height="${w}" alt="${esc(alt)}" loading="lazy" decoding="async"></picture>`;
  const PHOTO = { biscuits: [640, 900, 'Biscuits and gravy, photographed at Richard’s'], rye: [640, 900, 'Toasted rye sandwich, photographed at Richard’s'], burger: [853, 675, 'Burger on a sesame bun, photographed at Richard’s'] };
  const CHAR = { biscuit: 'c-biscuit', burger: 'c-burger', fries: 'c-fries', coffee: 'c-coffee', sandwich: 'c-egg' };
  function price(p, cur) {
    if (p === null || p === undefined || p === '') return '<span class="price ask" title="Price not posted yet">Ask</span>';
    if (typeof p === 'number') return `<span class="price">${new Intl.NumberFormat('en-US', { style: 'currency', currency: cur || 'USD' }).format(p)}</span>`;
    return `<span class="price">${esc(p)}</span>`;
  }
  function renderMenu(menu) {
    const grid = $('[data-menu-grid]'); if (!grid || !menu) return;
    const cats = menu.categories || [];
    grid.innerHTML = cats.map((c, i) => {
      const ph = c.photo && PHOTO[c.photo];
      const media = ph ? `<div class="cat-photo">${pic(c.photo, ph[0], ph[2], '(min-width:960px) 40vw, 92vw', ph[1])}<span class="tag">Real photo</span></div>`
        : `<div class="cat-art ${i % 2 ? 'gold' : ''}" aria-hidden="true"><svg viewBox="0 0 100 100" class="wiggle-hover"><use href="#${CHAR[c.icon] || 'c-biscuit'}"/></svg></div>`;
      const items = (c.items || []).map(it => `<li class="item" data-name="${esc(it.name.toLowerCase())} ${esc((it.desc || '').toLowerCase())}" data-tags="${esc((it.tags || []).join(' '))}"><span class="item-name">${esc(it.name)}${(it.tags || []).map(t => `<span class="dtag">${esc((menu.tagLabels || {})[t] || t)}</span>`).join('')}${it.desc ? `<span class="item-desc">${esc(it.desc)}</span>` : ''}</span><span class="lead" aria-hidden="true"></span>${price(it.price, menu.currency)}</li>`).join('');
      return `<article class="menu-cat reveal${i === 0 ? ' wide' : ''}" data-cat="${esc(c.id)}" aria-labelledby="cat-${esc(c.id)}">${media}<div class="cat-body"><div class="cat-head"><svg aria-hidden="true" viewBox="0 0 64 64"><use href="#f-${esc(c.icon || 'sandwich')}"/></svg><h3 id="cat-${esc(c.id)}">${esc(c.name)}</h3></div><p class="cat-blurb">${esc(c.blurb || '')}</p><ul class="items">${items}</ul></div></article>`;
    }).join('') + '<p class="menu-empty" hidden data-menu-empty><svg viewBox="0 0 100 100" aria-hidden="true"><use href="#c-biscuit"/></svg>Aw, shucks. Nothing matches that search. Try “biscuit”, “melt” or “cookie”, or <a href="tel:+18288031763">call the truck</a>.</p>';

    // chips
    const total = cats.reduce((n, c) => n + (c.items || []).length, 0);
    const cc = $('[data-cat-chips]');
    cc.innerHTML = `<button class="chip" type="button" aria-pressed="true" data-cat-chip="all">All <span class="n">${total}</span></button>` + cats.map(c => `<button class="chip" type="button" aria-pressed="false" data-cat-chip="${esc(c.id)}"><svg aria-hidden="true" viewBox="0 0 64 64"><use href="#f-${esc(c.icon)}"/></svg>${esc(c.name)}</button>`).join('');
    const tags = [...new Set(cats.flatMap(c => (c.items || []).flatMap(i => i.tags || [])))];
    const dc = $('[data-diet-chips]');
    if (tags.length) { dc.hidden = false; dc.innerHTML = tags.map(t => `<button class="chip" type="button" aria-pressed="false" data-diet="${esc(t)}">${esc((menu.tagLabels || {})[t] || t)}</button>`).join(''); }

    const state = { cat: 'all', q: '', diets: new Set() };
    const apply = () => {
      let shown = 0;
      $$('.menu-cat', grid).forEach(art => {
        const catOk = state.cat === 'all' || art.dataset.cat === state.cat;
        let n = 0;
        $$('.item', art).forEach(li => {
          const nameEl = $('.item-name', li); const raw = nameEl.firstChild.textContent;
          const okQ = !state.q || li.dataset.name.includes(state.q);
          const okD = [...state.diets].every(d => li.dataset.tags.split(' ').includes(d));
          const ok = catOk && okQ && okD; li.hidden = !ok; if (ok) n++;
          nameEl.firstChild.replaceWith(document.createTextNode(raw));
          if (state.q && ok) { const idx = raw.toLowerCase().indexOf(state.q); if (idx > -1) { const frag = document.createElement('span'); frag.innerHTML = esc(raw.slice(0, idx)) + '<mark>' + esc(raw.slice(idx, idx + state.q.length)) + '</mark>' + esc(raw.slice(idx + state.q.length)); nameEl.firstChild.replaceWith(frag); } }
        });
        art.hidden = n === 0; shown += n;
        art.classList.toggle('wide', art === $('.menu-cat', grid) && state.cat === 'all' && !state.q);
      });
      $('[data-menu-empty]').hidden = shown > 0;
      $('[data-menu-count]').textContent = (state.cat === 'all' && !state.q && !state.diets.size) ? `${total} items · prices confirmed at the window` : `Showing ${shown} of ${total} items`;
    };
    cc.addEventListener('click', e => { const b = e.target.closest('[data-cat-chip]'); if (!b) return; state.cat = b.dataset.catChip; $$('[data-cat-chip]', cc).forEach(x => x.setAttribute('aria-pressed', x === b)); apply(); });
    dc.addEventListener('click', e => { const b = e.target.closest('[data-diet]'); if (!b) return; const t = b.dataset.diet; state.diets.has(t) ? state.diets.delete(t) : state.diets.add(t); b.setAttribute('aria-pressed', state.diets.has(t)); apply(); });
    let tmr; $('[data-menu-search]').addEventListener('input', e => { clearTimeout(tmr); tmr = setTimeout(() => { state.q = e.target.value.trim().toLowerCase(); apply(); if (state.q === 'gravy' || state.q === 'richard') party(state.q === 'gravy' ? 'Gravy lover spotted! Biscuits and gravy are on the breakfast list.' : 'Hey, that’s us! Thanks for stopping by.'); }, 90); });
    apply();
    // ticker
    const tk = $('[data-ticker]');
    if (tk) { const names = cats.flatMap(c => (c.items || []).map(i => i.name)).filter((_, i) => i % 2 === 0); const ch = ['c-biscuit', 'c-burger', 'c-egg', 'c-fries', 'c-coffee', 'c-cookie']; const html = names.map((n, i) => `<span>${esc(n)}<svg class="tk-ch" viewBox="0 0 100 100" aria-hidden="true"><use href="#${ch[i % ch.length]}"/></svg></span>`).join(''); tk.innerHTML = html + html; }
    observeReveals();
  }

  /* ---------- gallery + lightbox ---------- */
  function renderGallery(g) {
    const box = $('[data-gallery]'); if (!box || !g) return;
    const items = g.items || [];
    box.innerHTML = items.map((x, i) => `<button class="g-item reveal" type="button" data-i="${i}" aria-label="Open photo: ${esc(x.caption)}"><picture><source type="image/webp" srcset="assets/img/${esc(x.img)}-480.webp"><img src="assets/img/${esc(x.img)}-480.jpg" width="480" height="${Math.round(480 * x.h / x.w)}" alt="${esc(x.alt)}" loading="lazy" decoding="async"></picture><span class="g-cap">${esc(x.caption)}</span></button>`).join('');
    const dlg = $('[data-lightbox]'); const img = $('[data-lb-img]'); const cap = $('[data-lb-cap]');
    let cur = 0, opener = null;
    const show = i => { cur = (i + items.length) % items.length; const x = items[cur]; const webp = !!document.createElement('canvas').toDataURL('image/webp').match('webp'); img.src = `assets/img/${x.img}-${x.large}.${webp ? 'webp' : 'jpg'}`; img.alt = x.alt; img.width = x.w; img.height = x.h; cap.textContent = `${x.caption} · ${cur + 1} / ${items.length}`; img.style.animation = 'none'; img.offsetWidth; img.style.animation = ''; };
    box.addEventListener('click', e => { const b = e.target.closest('.g-item'); if (!b) return; opener = b; show(+b.dataset.i); dlg.showModal(); });
    $('[data-lb-close]').onclick = () => dlg.close();
    $('[data-lb-prev]').onclick = () => show(cur - 1);
    $('[data-lb-next]').onclick = () => show(cur + 1);
    dlg.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') show(cur - 1); if (e.key === 'ArrowRight') show(cur + 1); });
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => opener && opener.focus());
    let sx = null; dlg.addEventListener('touchstart', e => sx = e.touches[0].clientX, { passive: true });
    dlg.addEventListener('touchend', e => { if (sx === null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1)); sx = null; });
    observeReveals();
  }

  /* ---------- map (click-to-load, privacy friendly) ---------- */
  function setupMap(site) {
    const btn = $('[data-map-load]'); if (!btn || !site || !site.mapEmbed) return;
    btn.hidden = false; $('[data-map-note]').hidden = false;
    btn.addEventListener('click', () => {
      const a = site.address; const q = encodeURIComponent(`${a.street}, ${a.city}, ${a.region}`);
      const f = document.createElement('iframe');
      f.src = `https://www.google.com/maps?q=${q}&output=embed`; f.title = 'Map: ' + a.street + ', ' + a.city; f.loading = 'lazy'; f.referrerPolicy = 'no-referrer-when-downgrade';
      const card = $('[data-map]'); card.innerHTML = ''; card.appendChild(f); $('[data-map-note]').hidden = true;
    }, { once: true });
  }

  /* ---------- site config extras ---------- */
  function applySite(site) {
    if (!site) return;
    if (site.email) { const el = $('[data-email]'); el.innerHTML = `<a href="mailto:${esc(site.email)}">${esc(site.email)}</a>`; el.closest('li').classList.remove('muted'); }
    if (!site.facebook) $$('[data-fb]').forEach(el => el.remove());
    if (site.inquiryEmail) $('[data-form-flag]').textContent = 'Submitting opens your email app with the details filled in. Nothing is stored on this website.';
  }

  /* ---------- catering tabs + form ---------- */
  function setupTabs() {
    const tabs = $$('[role=tab]'); const sel = $('[data-occasion-select]');
    const activate = (t, focus) => { tabs.forEach(x => { const on = x === t; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; $('#' + x.getAttribute('aria-controls')).hidden = !on; }); if (focus) t.focus(); if (sel) sel.value = t.dataset.occasion; };
    tabs.forEach((t, i) => { t.addEventListener('click', () => activate(t)); t.addEventListener('keydown', e => { const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (k) { e.preventDefault(); activate(tabs[(i + k + tabs.length) % tabs.length], true); } }); });
  }
  function setupForm(site) {
    const f = $('[data-inquiry]'); if (!f) return;
    const today = new Date(); f.date.min = today.toISOString().slice(0, 10);
    f.addEventListener('submit', e => {
      e.preventDefault();
      const err = $('[data-form-error]'); const bad = [];
      ['name', 'contact', 'date', 'venue'].forEach(n => { const ok = f[n].value.trim() !== ''; f[n].setAttribute('aria-invalid', !ok); if (!ok) bad.push(f[n]); });
      if (bad.length) { err.textContent = 'Please fill in the highlighted fields.'; err.hidden = false; bad[0].focus(); return; }
      err.hidden = true;
      const d = new FormData(f); const meals = d.getAll('meal').join(', ') || 'Not specified';
      const dateStr = d.get('date') ? new Date(d.get('date') + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '';
      const text = `Catering inquiry for Richard's Food Truck\nName: ${d.get('name')}\nContact: ${d.get('contact')}\nOccasion: ${d.get('occasion')}\nDate: ${dateStr}\nVenue/town: ${d.get('venue')}\nApprox. guests: ${d.get('guests') || 'Not sure'}\nMeal: ${meals}\nNotes: ${d.get('notes') || '-'}`;
      const out = $('[data-form-result]');
      if (site && site.inquiryEmail) {
        location.href = `mailto:${site.inquiryEmail}?subject=${encodeURIComponent('Catering inquiry: ' + d.get('occasion') + ', ' + dateStr)}&body=${encodeURIComponent(text)}`;
        out.innerHTML = '<strong>Your email app should open with everything filled in.</strong> If it didn’t, call <a href="tel:+18288031763">(828) 803-1763</a>.';
      } else {
        out.innerHTML = `<strong>You’re all set to call.</strong> This preview doesn’t send messages yet, so nothing was sent or saved. Call <a href="tel:+18288031763">(828) 803-1763</a> and read off these details:<pre>${esc(text)}</pre><div class="btn-row"><a class="btn btn-red btn-sm" href="tel:+18288031763">Call now</a><button class="btn btn-ghost btn-sm" type="button" data-copy>Copy details</button></div>`;
        $('[data-copy]', out).addEventListener('click', async ev => { try { await navigator.clipboard.writeText(text); ev.target.textContent = 'Copied!'; } catch { ev.target.textContent = 'Select the text above to copy'; } });
      }
      out.hidden = false; out.focus();
    });
    f.addEventListener('input', e => { if (e.target.getAttribute('aria-invalid') === 'true' && e.target.value.trim()) e.target.setAttribute('aria-invalid', 'false'); });
  }

  /* ---------- reveal, header, active nav ---------- */
  let io;
  function observeReveals() {
    if (!('IntersectionObserver' in window)) { $$('.reveal').forEach(el => el.classList.add('in')); return; }
    io = io || new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px' });
    $$('.reveal:not(.in)').forEach(el => io.observe(el));
  }
  function setupChrome() {
    const h = $('.site-header');
    const onScroll = () => { h.classList.toggle('scrolled', scrollY > 10); if (scrollY < innerHeight * 0.5) $$('.main-nav a').forEach(a => a.classList.remove('active')); };
    addEventListener('scroll', onScroll, { passive: true }); onScroll();
    const links = $$('.main-nav a');
    if ('IntersectionObserver' in window) {
      const so = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting && scrollY >= innerHeight * 0.5) links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id)); }), { rootMargin: '-45% 0px -50% 0px' });
      ['menu', 'find', 'catering', 'contact'].forEach(id => { const s = document.getElementById(id); if (s) so.observe(s); });
    }
    // Keep ?review / ?demo when clicking the ribbon toggle
    const rt = $('.review-toggle'); if (rt && REVIEW) { rt.textContent = 'Hide review notes'; rt.href = location.pathname; }
  }

  /* ---------- fun: honk, easter egg ---------- */
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function party(msg) {
    const toast = $('[data-egg-toast]'); const rain = $('[data-egg-rain]');
    if (toast) { toast.innerHTML = `<span>Snack attack!</span> ${esc(msg)}`; toast.hidden = false; clearTimeout(party.t); party.t = setTimeout(() => toast.hidden = true, 4200); }
    if (REDUCED || !rain) return;
    const ch = ['c-biscuit', 'c-burger', 'c-egg', 'c-fries', 'c-coffee', 'c-cookie'];
    for (let i = 0; i < 36; i++) {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 100 100');
      s.innerHTML = `<use href="#${ch[i % ch.length]}"/>`;
      s.style.left = Math.random() * 96 + 'vw'; s.style.animationDuration = (2.2 + Math.random() * 2.2) + 's'; s.style.animationDelay = Math.random() * 1.2 + 's';
      s.style.setProperty('--r', (Math.random() * 720 - 360) + 'deg'); const z = 40 + Math.random() * 40; s.style.width = s.style.height = z + 'px';
      rain.appendChild(s); s.addEventListener('animationend', () => s.remove());
    }
  }
  function setupFun() {
    const truck = $('[data-honk]');
    if (truck) {
      const honk = () => { truck.classList.add('honk'); clearTimeout(honk.t); honk.t = setTimeout(() => truck.classList.remove('honk'), 1400); };
      truck.addEventListener('click', honk);
      truck.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); honk(); } });
    }
    const st = $('[data-egg-sticker]'); let n = 0, tm;
    if (st) st.addEventListener('click', () => { st.classList.remove('boop'); void st.getBoundingClientRect(); st.classList.add('boop'); n++; clearTimeout(tm); tm = setTimeout(() => n = 0, 1500); if (n >= 5) { n = 0; party('You found the easter egg. Come hungry, leave happy!'); } });
    const code = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']; let k = 0;
    addEventListener('keydown', e => { k = (e.key === code[k]) ? k + 1 : (e.key === code[0] ? 1 : 0); if (k === code.length) { k = 0; party('Konami code accepted. Extra biscuits for everyone (in spirit).'); } });
    console.log('%cRichard’s Food Truck%c  Come hungry, leave happy. (Psst: tap the spinning sticker 5 times.)', 'font:900 18px Georgia;color:#c3262f', 'color:#5a4c3f');
  }

  /* ---------- boot ---------- */
  setupChrome(); setupTabs(); setupFun(); observeReveals();
  Promise.all(['site', 'menu', 'schedule', 'specials', 'gallery'].map(load)).then(([site, menu, sched, specials, gallery]) => {
    applySite(site); renderMenu(menu); renderGallery(gallery); renderSpecials(specials); setupMap(site); setupForm(site);
    const s = sched || { weekly: [], dates: [] };
    renderStatus(s, site); setInterval(() => renderStatus(s, site), 60000);
  });
})();
