/* GravityCare browser client. Talks only to this server. No API key lives here. */
(function () {
  const TOKEN_KEY = 'gc_token';
  const OUTBOX_KEY = 'gc_outbox';
  const CALL_TO_LOCAL = {
    'CDR. Vance': 'vance',
    'PLT. Chen': 'chen',
    'Dr. Diallo': 'diallo',
    'MS-2. Tremblay': 'tremblay'
  };
  const TABS = {
    ASTRONAUT: [['cockpit', 'navMyDash'], ['crew', 'navMyFile'], ['nutrition', 'navNutrition'], ['alerts', 'navAlerts'], ['messages', 'navMessages']],
    DOCTOR: [['ward', 'navWard'], ['crew', 'navClinical'], ['nutrition', 'navNutrition'], ['alerts', 'navAlerts'], ['messages', 'navMessages']],
    GROUND_CREW: [['ground', 'navGround'], ['alerts', 'navAlerts']],
    ADMIN: [['admin', 'navAdmin']]
  };
  const ROLE_KEY = { ASTRONAUT: 'roleAstronaut', DOCTOR: 'roleDoctor', GROUND_CREW: 'roleGround', ADMIN: 'roleAdmin' };

  function t(key) {
    const dict = typeof i18n !== 'undefined' ? i18n[currentLang] : null;
    return dict && dict[key] ? dict[key] : key;
  }

  const state = {
    token: sessionStorage.getItem(TOKEN_KEY),
    user: null,
    crew: [],
    contacts: []
  };

  function headers() {
    return { Authorization: `Bearer ${state.token}`, 'Content-Type': 'application/json' };
  }

  async function api(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
    if (response.status === 401) {
      logout(false);
      throw new Error('Session expired');
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Request failed');
    return body;
  }

  function outbox() {
    try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); } catch { return []; }
  }

  function setOutbox(items) {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
    const label = document.getElementById('outboxCount');
    if (label) label.textContent = items.length ? `${items.length} ${t('outboxWait')}` : t('outboxEmpty');
  }

  function showLogin(message) {
    document.getElementById('loginGate').classList.remove('hidden');
    const error = document.getElementById('loginError');
    if (message) {
      error.textContent = message;
      error.classList.remove('hidden');
    }
  }

  function logout(server) {
    if (server && state.token) {
      fetch('/api/auth/logout', { method: 'POST', headers: headers() }).catch(() => {});
    }
    sessionStorage.removeItem(TOKEN_KEY);
    state.token = null;
    state.user = null;
    showLogin();
  }

  function labelNav() {
    const rows = TABS[state.user?.role] || [];
    const allowed = new Set(rows.map(row => row[0]));
    document.querySelectorAll('.nav-tab').forEach(tab => {
      const name = tab.id.replace('tab-', '');
      const row = rows.find(item => item[0] === name);
      tab.classList.toggle('hidden', !allowed.has(name));
      if (row) tab.textContent = t(row[1]);
    });
    const role = document.getElementById('sessionRole');
    if (role && state.user) role.textContent = t(ROLE_KEY[state.user.role] || '');
    const logout = document.getElementById('logoutBtn');
    if (logout) logout.textContent = currentLang === 'fr' ? 'Déconnexion' : 'Log out';
    const footer = document.getElementById('simFooter');
    if (footer) footer.classList.toggle('hidden', state.user?.role !== 'ASTRONAUT');
    const pills = document.getElementById('topCrewPills');
    if (pills && state.user) pills.classList.toggle('hidden', state.user.role === 'GROUND_CREW' || state.user.role === 'ADMIN');
    document.querySelectorAll('[data-astro-only]').forEach(el => {
      el.classList.toggle('hidden', state.user?.role !== 'ASTRONAUT');
    });
  }

  function applyRole() {
    labelNav();
    const localIds = state.crew.map(member => CALL_TO_LOCAL[member.callSign]).filter(Boolean);
    window.GC_ALLOWED_LOCAL_IDS = state.user.role === 'ASTRONAUT' && localIds.length ? localIds : null;
    if (state.user.role === 'ASTRONAUT' && localIds.length && !localIds.includes(currentAstroId)) {
      selectAstronaut(localIds[0]);
    } else if (typeof renderTopCrewPills === 'function') {
      renderTopCrewPills();
    }
    const home = { ASTRONAUT: 'cockpit', DOCTOR: 'ward', GROUND_CREW: 'ground', ADMIN: 'admin' }[state.user.role] || 'cockpit';
    switchView(home);
  }

  async function loadCrew() {
    state.crew = await api('/api/astronauts');
    const select = document.getElementById('messageReceiver');
    select.innerHTML = '';
    if (state.user.role === 'ASTRONAUT') {
      (state.crew[0]?.physicians || []).forEach(physician => {
        const option = document.createElement('option');
        option.value = physician.id;
        option.textContent = `${physician.name} · ${t('simulatedLink')}`;
        select.appendChild(option);
      });
    } else if (state.user.role === 'DOCTOR') {
      state.crew.forEach(member => {
        const option = document.createElement('option');
        option.value = member.identity ? member.userId : member.id;
        option.value = member.userId;
        option.textContent = `${member.callSign} · ${t('simulatedLink')}`;
        select.appendChild(option);
      });
    }
  }

  function currentProfile() {
    const local = currentAstroId;
    return state.crew.find(member => CALL_TO_LOCAL[member.callSign] === local) || state.crew[0];
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
  }

  async function loadNutrition() {
    const body = document.getElementById('nutritionBody');
    const form = document.getElementById('reviewForm');
    const profile = currentProfile();
    if (!profile) { body.textContent = t('noRecord'); return; }
    const data = await api(`/api/nutrition/recommendations/${profile.id}?lang=${currentLang === 'fr' ? 'fr' : 'en'}`);
    const plan = data.recommendation;
    const slots = currentLang === 'fr'
      ? { BREAKFAST: 'Petit-déjeuner', LUNCH: 'Déjeuner', DINNER: 'Dîner', SNACK: 'Collation' }
      : { BREAKFAST: 'Breakfast', LUNCH: 'Lunch', DINNER: 'Dinner', SNACK: 'Snack' };
    const meals = (plan.mealPlan || []).map(slot => {
      const items = slot.items.map(item => `${esc(currentLang === 'fr' ? item.nameFr : item.nameEn)} × ${item.portions} (${item.kcal} kcal, ${esc(item.reason)})`).join('<br>');
      return `<div class="rounded-xl border border-slate-800 p-3"><div class="font-mono text-[11px] text-sky-300">${esc(slots[slot.slot] || slot.slot)}</div><div class="mt-1">${items || esc(t('noFood'))}</div></div>`;
    }).join('');
    const series = (data.series || []).slice(-7).map(day => {
      const width = Math.max(4, Math.min(100, (day.kcal / (plan.energy.estimatedDailyKcal || day.kcal || 1)) * 100));
      return `<div class="mb-1"><div class="flex justify-between text-[11px] font-mono text-slate-400"><span>${day.date}</span><span>${Math.round(day.kcal)} kcal · ${Math.round(day.hydrationMl)} mL</span></div><div class="h-1.5 bg-slate-800 rounded"><div class="h-1.5 bg-emerald-400 rounded" style="width:${width}%"></div></div></div>`;
    }).join('');
    const unknown = currentLang === 'fr' ? 'inconnu' : 'unknown';
    const notEst = currentLang === 'fr' ? 'non estimée' : 'not estimated';
    const quality = currentLang === 'fr'
      ? { SUFFICIENT: 'suffisante', INSUFFICIENT: 'insuffisante' }
      : { SUFFICIENT: 'sufficient', INSUFFICIENT: 'insufficient' };
    const review = currentLang === 'fr'
      ? { DRAFT: 'brouillon', VALIDATED: 'validé', MODIFIED: 'modifié', REJECTED: 'rejeté' }
      : { DRAFT: 'draft', VALIDATED: 'validated', MODIFIED: 'modified', REJECTED: 'rejected' };
    body.innerHTML = `
      <p class="text-xs text-amber-200 mb-3">${esc(t('fictionalTag'))} · ${esc(plan.callSign)} · ${esc(t('qualityWord'))} ${esc(quality[plan.dataQuality] || plan.dataQuality)} · ${esc(t('reviewWord'))} ${esc(review[data.review.status] || data.review.status)}</p>
      <p><strong>${esc(t('energyLabel'))} :</strong> ${plan.energy.estimatedDailyKcal ?? notEst} kcal. ${esc(plan.energy.method)}</p>
      <p class="mt-1"><strong>${esc(t('macroLabel'))} :</strong> ${plan.macros.proteinG.target ?? '—'} g / ${plan.macros.carbsG.target ?? '—'} g / ${plan.macros.fatG.target ?? '—'} g</p>
      <p class="mt-1"><strong>${esc(t('fluidLabel'))} :</strong> ${plan.hydration.targetMl ?? '—'} mL. ${currentLang === 'fr' ? 'Moyenne consignée' : 'Logged average'}: ${plan.hydration.observedAverageMl ?? unknown}.</p>
      <ul class="mt-3 list-disc pl-5 text-sm">${plan.priorities.map(item => `<li>${esc(item)}</li>`).join('')}</ul>
      ${plan.warnings.length ? `<ul class="mt-3 list-disc pl-5 text-amber-200">${plan.warnings.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}
      <div class="grid md:grid-cols-2 gap-2 mt-4">${meals}</div>
      <div class="mt-4">${series}</div>
      <p class="text-[11px] text-slate-500 mt-3">${esc(plan.disclaimer)} ${esc(plan.foodDataNote)}</p>`;
    form.classList.toggle('hidden', state.user.role !== 'DOCTOR');
  }

  function statusLabel(code) {
    const fr = {
      NEW: 'Nouvelle', ANALYZING: 'En analyse', ANALYZED: 'Analysée', SENT_TO_DOCTOR: 'Envoyée au médecin',
      IN_PROGRESS: 'En cours', RESOLVED: 'Résolue', INFO: 'Information', WATCH: 'Suivi', WARNING: 'Importante', CRITICAL: 'Critique'
    };
    const en = {
      NEW: 'New', ANALYZING: 'Analyzing', ANALYZED: 'Analyzed', SENT_TO_DOCTOR: 'Sent to physician',
      IN_PROGRESS: 'In progress', RESOLVED: 'Resolved', INFO: 'Info', WATCH: 'Watch', WARNING: 'Warning', CRITICAL: 'Critical'
    };
    const table = currentLang === 'fr' ? fr : en;
    return table[code] || code;
  }

  async function loadAlerts() {
    const lang = currentLang === 'fr' ? 'fr' : 'en';
    const alerts = await api(`/api/alerts?lang=${lang}`);
    const host = document.getElementById('alertsBody');
    if (!alerts.length) {
      host.innerHTML = `<p class="text-slate-400">${esc(t('noAlerts'))}</p>`;
      return;
    }
    host.innerHTML = alerts.map(alert => {
      const report = alert.aiReport;
      const engine = currentLang === 'fr' ? 'Moteur' : 'Engine';
      const confidence = currentLang === 'fr' ? 'confiance' : 'confidence';
      const urgent = currentLang === 'fr' ? 'urgent' : 'urgent';
      const immediate = currentLang === 'fr' ? 'Immédiat' : 'Immediate';
      const reportHtml = report && report.summary ? `<div class="mt-2 text-xs text-slate-300"><div>${engine}: ${esc(report.engine)} · ${confidence} ${esc(report.confidence)} · ${urgent}: ${esc(report.urgentMedicalAttention)}</div><div class="mt-1">${esc(report.summary)}</div><div class="mt-1">${immediate}: ${(report.immediateActions || []).map(esc).join(' · ')}</div></div>` : '';
      return `<article class="rounded-xl border border-slate-800 p-3"><div class="flex justify-between gap-2"><strong>${esc(alert.title || alert.type)}</strong><span class="font-mono text-[11px]">${esc(statusLabel(alert.severity))} · ${esc(statusLabel(alert.status))}</span></div><div class="text-[11px] font-mono text-slate-500">${esc(alert.astronaut?.callSign || alert.callSign || '')}</div><p class="text-xs text-slate-400 mt-1">${esc(alert.description || '')}</p>${reportHtml}${state.user.role === 'DOCTOR' ? `<button data-analyze="${esc(alert.id)}" class="mt-2 text-xs text-sky-300" type="button">${esc(t('runAnalysis'))}</button>` : ''}</article>`;
    }).join('');
    host.querySelectorAll('[data-analyze]').forEach(button => {
      button.addEventListener('click', async () => {
        button.disabled = true;
        await api(`/api/alerts/${button.dataset.analyze}/analyze`, { method: 'POST' });
        await loadAlerts();
      });
    });
  }

  async function loadMessages() {
    const messages = await api('/api/messages');
    const link = t('simulatedLink');
    document.getElementById('messagesBody').innerHTML = messages.map(message =>
      `<div class="rounded-xl border border-slate-800 p-2"><div class="text-[11px] font-mono text-slate-500">${esc(message.sender.firstName)} → ${esc(message.receiver.firstName)} · ${esc(link)}</div><div>${esc(message.content)}</div></div>`
    ).join('') || `<p class="text-slate-500">${esc(t('noMessages'))}</p>`;
    setOutbox(outbox());
  }

  async function loadGround() {
    const lang = currentLang === 'fr' ? 'fr' : 'en';
    const crew = await api('/api/astronauts');
    const alerts = await api(`/api/alerts?lang=${lang}`);
    const day = currentLang === 'fr' ? 'jour' : 'day';
    const none = currentLang === 'fr' ? 'aucune' : 'none';
    document.getElementById('groundBody').innerHTML = `
      <div class="grid md:grid-cols-2 gap-3">${crew.map(member => `<div class="rounded-xl border border-slate-800 p-3"><div class="font-bold">${esc(member.callSign)}</div><div class="text-xs text-slate-400">${esc(member.mission?.name || '')} · ${day} ${esc(member.missionDay)}</div><div class="text-xs mt-1">${esc(t('openAlerts'))}: ${esc(member.alertSummary?.openCount)} · ${currentLang === 'fr' ? 'niveau' : 'highest'} ${esc(statusLabel(member.alertSummary?.highest) || none)}</div></div>`).join('')}</div>
      <h3 class="mt-4 font-display">${esc(t('alertsTitle'))}</h3>
      <ul class="mt-2 text-sm">${alerts.map(alert => `<li>${esc(statusLabel(alert.severity))} · ${esc(alert.callSign || '')} · ${esc(alert.title)}</li>`).join('')}</ul>`;
  }

  async function loadAdmin() {
    const [users, audit, missions] = await Promise.all([api('/api/admin/users'), api('/api/admin/audit'), api('/api/admin/missions')]);
    document.getElementById('adminBody').innerHTML = `
      <h3 class="font-display mb-2">${esc(t('missionsLabel'))}</h3>
      <ul>${missions.map(mission => `<li>${esc(mission.code)} · ${esc(mission.name)} · ${esc(mission.status)}</li>`).join('')}</ul>
      <h3 class="font-display mt-4 mb-2">${esc(t('accounts'))}</h3>
      <ul>${users.map(user => `<li class="flex justify-between gap-2 py-1 border-b border-slate-800"><span>${esc(user.email)} · ${esc(t(ROLE_KEY[user.role] || user.role))}</span><button data-user="${esc(user.id)}" data-active="${user.isActive}" class="text-xs text-sky-300" type="button">${user.isActive ? esc(t('disable')) : esc(t('enable'))}</button></li>`).join('')}</ul>
      <h3 class="font-display mt-4 mb-2">${esc(t('securityLog'))}</h3>
      <ul class="text-xs font-mono text-slate-400">${audit.slice(0, 30).map(row => `<li>${esc(row.createdAt)} · ${esc(row.action)} · ${esc(row.user?.email || 'system')}</li>`).join('')}</ul>`;
    document.getElementById('adminBody').querySelectorAll('[data-user]').forEach(button => {
      button.addEventListener('click', async () => {
        await api(`/api/admin/users/${button.dataset.user}`, {
          method: 'PATCH',
          body: JSON.stringify({ isActive: button.dataset.active !== 'true' })
        });
        await loadAdmin();
      });
    });
  }

  async function loadWard() {
    const host = document.getElementById('wardBody');
    if (!host) return;
    host.innerHTML = state.crew.map(member => {
      const local = CALL_TO_LOCAL[member.callSign] || '';
      const highest = member.alertSummary?.highest;
      const tone = highest === 'CRITICAL' ? 'border-red-400/50' : highest === 'WARNING' || highest === 'WATCH' ? 'border-amber-400/40' : 'border-emerald-400/30';
      return `<button type="button" data-local="${esc(local)}" class="text-left rounded-2xl border ${tone} bg-slate-950/50 p-4 hover:bg-slate-900">
        <div class="font-display font-bold text-white">${esc(member.callSign)}</div>
        <div class="text-xs text-slate-400 mt-1">${esc(member.mission?.name || '')}</div>
        <div class="text-[11px] font-mono mt-2 text-slate-300">${esc(t('openAlerts'))}: ${esc(member.alertSummary?.openCount ?? 0)} · ${esc(statusLabel(highest) || '—')}</div>
      </button>`;
    }).join('');
    host.querySelectorAll('[data-local]').forEach(button => {
      button.addEventListener('click', () => {
        if (button.dataset.local) selectAstronaut(button.dataset.local);
        switchView('crew');
      });
    });
  }

  window.onGravityView = function (view) {
    if (!state.token) return;
    const run = {
      ward: loadWard,
      nutrition: loadNutrition,
      alerts: loadAlerts,
      messages: loadMessages,
      ground: loadGround,
      admin: loadAdmin
    }[view];
    if (run) run().catch(error => console.error(error));
  };

  window.onGravityLanguage = function () {
    if (!state.token || !state.user) return;
    labelNav();
    const view = typeof currentView !== 'undefined' ? currentView : '';
    if (window.onGravityView) window.onGravityView(view);
  };

  async function enter(session) {
    state.token = session.token;
    state.user = session.user;
    sessionStorage.setItem(TOKEN_KEY, session.token);
    document.getElementById('loginGate').classList.add('hidden');
    document.getElementById('loginError').classList.add('hidden');
    await loadCrew();
    applyRole();
  }

  document.querySelectorAll('.demo-login').forEach(button => {
    button.addEventListener('click', () => loginWith(button.dataset.email, 'demo1234'));
  });

  async function loginWith(email, password) {
    const error = document.getElementById('loginError');
    error.classList.add('hidden');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Login failed');
      await enter(body);
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
    }
  }

  document.getElementById('loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    await loginWith(
      document.getElementById('loginEmail').value.trim(),
      document.getElementById('loginPassword').value
    );
  });

  document.getElementById('logoutBtn').addEventListener('click', () => logout(true));

  document.getElementById('reviewForm').addEventListener('submit', async event => {
    event.preventDefault();
    const profile = currentProfile();
    await api(`/api/nutrition/recommendations/${profile.id}/review`, {
      method: 'POST',
      body: JSON.stringify({
        status: document.getElementById('reviewStatus').value,
        note: document.getElementById('reviewNote').value
      })
    });
    await loadNutrition();
  });

  document.getElementById('messageForm').addEventListener('submit', async event => {
    event.preventDefault();
    const receiverId = document.getElementById('messageReceiver').value;
    const content = document.getElementById('messageContent').value;
    const payload = { receiverId, content, clientId: crypto.randomUUID() };
    try {
      await api('/api/messages', { method: 'POST', body: JSON.stringify(payload) });
      document.getElementById('messageContent').value = '';
      await loadMessages();
    } catch {
      const queued = outbox();
      queued.push({ clientId: payload.clientId, kind: 'message', payload });
      setOutbox(queued);
      document.getElementById('messageContent').value = '';
    }
  });

  document.getElementById('syncBtn').addEventListener('click', async () => {
    const queued = outbox();
    if (!queued.length) return;
    await api('/api/messages/sync', { method: 'POST', body: JSON.stringify({ operations: queued }) });
    setOutbox([]);
    await loadMessages();
  });

  async function demo(scenario) {
    const profile = currentProfile();
    if (!profile) return;
    await api('/api/demo/measure', { method: 'POST', body: JSON.stringify({ astronautId: profile.id, scenario }) });
    await loadAlerts();
  }
  document.getElementById('demoPhysioBtn').addEventListener('click', () => demo('physio-warning'));
  document.getElementById('demoCriticalBtn').addEventListener('click', () => demo('critical-spo2'));

  const previousLoad = window.onload;
  window.onload = function () {
    if (typeof previousLoad === 'function') previousLoad();
    if (!state.token) return;
    api('/api/auth/me').then(user => enter({ token: state.token, user: { ...user, astronautProfileId: user.astronautProfile?.id || null } })).catch(() => logout(false));
  };
})();
