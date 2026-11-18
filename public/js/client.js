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
    ASTRONAUT: [['cockpit', 'navMyDash'], ['copilot', 'Copilot'], ['crew', 'navMyFile'], ['nutrition', 'navNutrition'], ['alerts', 'navAlerts'], ['messages', 'navMessages']],
    DOCTOR: [['ward', 'navWard'], ['copilot', 'Copilot'], ['crew', 'navClinical'], ['nutrition', 'navNutrition'], ['alerts', 'navAlerts'], ['messages', 'navMessages']],
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
  let alertWatch = null;

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
    if (typeof window.gcSetAlertAudioRole === 'function') window.gcSetAlertAudioRole(null);
    if (alertWatch) {
      clearInterval(alertWatch);
      alertWatch = null;
    }
    if (typeof window.gcSetRecordAlert === 'function') window.gcSetRecordAlert(false);
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
    if (typeof window.gcSetAlertAudioRole === 'function') window.gcSetAlertAudioRole(state.user?.role);
    labelNav();
    const localIds = state.crew.map(member => CALL_TO_LOCAL[member.callSign]).filter(Boolean);
    window.GC_ALLOWED_LOCAL_IDS = null;
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
    window.GC_MEDICAL_CREW = state.crew;
    window.GC_FETCH_VITALS = astronautId => api(`/api/vitals/astronaut/${encodeURIComponent(astronautId)}?limit=100`);
    window.GC_FETCH_HEALTH_LOGS = astronautId => api(`/api/health-log/${encodeURIComponent(astronautId)}?limit=100`);
    window.GC_CREATE_HEALTH_LOG = (astronautId, payload) => api('/api/health-log', { method: 'POST', body: JSON.stringify({ ...payload, astronautId }) });
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
    const matched = state.crew.find(member => CALL_TO_LOCAL[member.callSign] === currentAstroId);
    const profile = matched || (state.user.role === 'ASTRONAUT' ? null : currentProfile());
    if (!profile) {
      body.textContent = currentLang === 'fr'
        ? 'Le plan nutritionnel s’ouvre sur votre propre profil. Revenez sur votre nom dans l’équipage.'
        : 'The nutrition plan opens on your own profile. Select your name in the crew list.';
      form.classList.add('hidden');
      return;
    }
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

  function alertIsHot(alert) {
    return alert.status !== 'RESOLVED' && (alert.severity === 'WARNING' || alert.severity === 'CRITICAL');
  }

  async function watchAlerts() {
    if (!state.token) return;
    try {
      const alerts = await api('/api/alerts');
      if (typeof window.gcSetRecordAlert === 'function') {
        const ownAstronautAlert = state.user?.role === 'ASTRONAUT'
          && Boolean(state.user.astronautProfileId)
          && alerts.some(alert => alert.astronautId === state.user.astronautProfileId && alertIsHot(alert));
        window.gcSetRecordAlert(ownAstronautAlert);
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function loadAlerts() {
    const lang = currentLang === 'fr' ? 'fr' : 'en';
    const alerts = await api(`/api/alerts?lang=${lang}`);
    if (typeof window.gcSetRecordAlert === 'function') {
      const ownAstronautAlert = state.user?.role === 'ASTRONAUT'
        && Boolean(state.user.astronautProfileId)
        && alerts.some(alert => alert.astronautId === state.user.astronautProfileId && alertIsHot(alert));
      window.gcSetRecordAlert(ownAstronautAlert);
    }
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
    const host = document.getElementById('groundBody');
    if (!host) return;
    const fr = currentLang === 'fr';
    const lang = fr ? 'fr' : 'en';
    host.innerHTML = `<div class="glass-card rounded-2xl p-5 text-sm text-slate-400">${fr ? 'Actualisation de la situation de mission…' : 'Refreshing mission picture…'}</div>`;
    try {
      const [crew, alerts] = await Promise.all([
        api('/api/astronauts'),
        api(`/api/alerts?lang=${lang}`)
      ]);
      const rank = { CRITICAL: 4, WARNING: 3, WATCH: 2, INFO: 1 };
      const openAlerts = alerts.filter(alert => alert.status !== 'RESOLVED');
      const critical = openAlerts.filter(alert => alert.severity === 'CRITICAL').length;
      const attention = openAlerts.filter(alert => alert.severity === 'WARNING' || alert.severity === 'WATCH').length;
      const stable = crew.filter(member => !member.alertSummary?.openCount).length;
      const stamp = new Date().toLocaleTimeString(fr ? 'fr-FR' : 'en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const refreshLabel = fr ? `Dernière actualisation · ${stamp}` : `Last refresh · ${stamp}`;
      const refreshNode = document.getElementById('groundLastRefresh');
      if (refreshNode) refreshNode.textContent = refreshLabel;
      const statCard = (label, value, color, detail) => `
        <article class="glass-card rounded-2xl p-4 border-l-2 ${color}">
          <p class="text-[10px] font-mono uppercase tracking-widest text-slate-400">${esc(label)}</p>
          <div class="font-display text-3xl font-bold text-white mt-2 tabular-nums">${value}</div>
          <p class="text-[11px] text-slate-500 mt-1">${esc(detail)}</p>
        </article>`;
      const stateMeta = (member) => {
        const level = member.alertSummary?.highest;
        if (level === 'CRITICAL') return { label: fr ? 'Critique' : 'Critical', cls: 'text-red-300 bg-red-500/10 border-red-400/30', dot: 'bg-red-400' };
        if (level === 'WARNING') return { label: fr ? 'Alerte' : 'Warning', cls: 'text-orange-300 bg-orange-500/10 border-orange-400/30', dot: 'bg-orange-400' };
        if (level === 'WATCH') return { label: fr ? 'Surveillance' : 'Watch', cls: 'text-amber-300 bg-amber-500/10 border-amber-400/30', dot: 'bg-amber-400' };
        return { label: fr ? 'Aucune alerte ouverte' : 'No open alert', cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-400/30', dot: 'bg-emerald-400' };
      };
      const crewCards = crew.map(member => {
        const meta = stateMeta(member);
        const mission = member.mission?.name || (fr ? 'Mission non renseignée' : 'Mission not specified');
        const missionCode = member.mission?.code || '—';
        const openCount = member.alertSummary?.openCount || 0;
        return `<article class="rounded-2xl border border-slate-800 bg-slate-950/65 p-4 hover:border-sky-400/30 transition-colors">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <div class="h-11 w-11 shrink-0 rounded-xl border border-sky-400/25 bg-sky-500/10 grid place-items-center font-display font-bold text-sky-200">${esc(String(member.crewName || member.callSign || '—').trim().slice(0,2).toUpperCase())}</div>
              <div class="min-w-0"><h3 class="font-display font-bold text-white truncate">${esc(member.crewName || member.callSign)}</h3><p class="text-[10px] font-mono text-slate-500">${esc(member.agency || '—')} · ${esc(missionCode)}</p></div>
            </div>
            <span class="shrink-0 rounded-full border px-2 py-1 text-[9px] font-mono uppercase ${meta.cls}"><span class="inline-block h-1.5 w-1.5 rounded-full ${meta.dot} mr-1"></span>${esc(meta.label)}</span>
          </div>
          <div class="mt-4 grid grid-cols-2 gap-3 border-t border-slate-800 pt-3">
            <div><p class="text-[9px] font-mono uppercase text-slate-500">${fr ? 'Jour de mission' : 'Mission day'}</p><p class="text-sm font-semibold text-slate-200 mt-1">${esc(member.missionDay ?? '—')}</p></div>
            <div><p class="text-[9px] font-mono uppercase text-slate-500">${fr ? 'Alertes ouvertes' : 'Open alerts'}</p><p class="text-sm font-semibold ${openCount ? 'text-amber-300' : 'text-emerald-300'} mt-1">${openCount}</p></div>
          </div>
          <p class="text-[10px] text-slate-500 mt-3 truncate">${esc(mission)}</p>
        </article>`;
      }).join('');
      const orderedAlerts = [...openAlerts].sort((a,b) => (rank[b.severity] || 0) - (rank[a.severity] || 0) || new Date(b.createdAt) - new Date(a.createdAt));
      const alertRows = orderedAlerts.map(alert => {
        const color = alert.severity === 'CRITICAL' ? 'text-red-300 border-red-400/20 bg-red-500/5' : alert.severity === 'WARNING' ? 'text-orange-300 border-orange-400/20 bg-orange-500/5' : alert.severity === 'WATCH' ? 'text-amber-300 border-amber-400/20 bg-amber-500/5' : 'text-sky-300 border-sky-400/20 bg-sky-500/5';
        const date = alert.createdAt ? new Date(alert.createdAt).toLocaleString(fr ? 'fr-FR' : 'en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
        return `<article class="grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto] items-start gap-3 rounded-xl border ${color} p-3">
          <span class="mt-1 h-2.5 w-2.5 rounded-full ${alert.severity === 'CRITICAL' ? 'bg-red-400' : alert.severity === 'WARNING' ? 'bg-orange-400' : alert.severity === 'WATCH' ? 'bg-amber-400' : 'bg-sky-400'}"></span>
          <div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><strong class="text-xs text-white">${esc(alert.crewName || alert.callSign || (fr ? 'Équipage' : 'Crew'))}</strong><span class="text-[9px] font-mono uppercase">${esc(statusLabel(alert.severity))}</span></div><p class="text-xs text-slate-300 mt-1">${esc(alert.title)}</p><p class="text-[10px] text-slate-500 mt-1">${esc(statusLabel(alert.status))}</p></div>
          <time class="col-span-2 sm:col-span-1 text-[10px] font-mono text-slate-500 sm:text-right">${esc(date)}</time>
        </article>`;
      }).join('');
      host.innerHTML = `
        <div class="grid grid-cols-2 xl:grid-cols-4 gap-3">
          ${statCard(fr ? 'Équipage suivi' : 'Crew monitored', crew.length, 'border-sky-400/60', fr ? 'Membres dans le périmètre opérationnel' : 'Members in operational scope')}
          ${statCard(fr ? 'Sans alerte ouverte' : 'No open alerts', stable, 'border-emerald-400/60', fr ? 'Aucun signalement non résolu' : 'No unresolved reports')}
          ${statCard(fr ? 'À surveiller' : 'Needs attention', attention, 'border-amber-400/60', fr ? 'Niveaux WATCH et WARNING' : 'WATCH and WARNING levels')}
          ${statCard(fr ? 'Critiques' : 'Critical', critical, 'border-red-400/60', fr ? 'À transmettre selon le protocole' : 'Escalate per mission protocol')}
        </div>
        <section class="glass-card rounded-2xl p-4 sm:p-5">
          <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
            <div><p class="text-[10px] font-mono uppercase tracking-widest text-sky-300">${fr ? 'ÉTAT DE L’ÉQUIPAGE' : 'CREW STATUS'}</p><h3 class="font-display text-lg font-bold text-white mt-1">${fr ? 'Vue opérationnelle des astronautes' : 'Astronaut operational overview'}</h3><p class="text-[11px] text-slate-500 mt-1">${fr ? 'Identifiant de mission, jour de mission et niveau d’alerte uniquement.' : 'Mission identifier, mission day and alert level only.'}</p></div>
            <label class="text-[10px] font-mono text-slate-400">${fr ? 'RECHERCHER' : 'SEARCH'}<input id="groundCrewSearch" type="search" placeholder="${fr ? 'Rechercher un astronaute…' : 'Search astronaut…'}" class="block mt-1 w-full sm:w-56 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-sky-400"></label>
          </div>
          <div id="groundCrewGrid" class="grid md:grid-cols-2 xl:grid-cols-4 gap-3">${crewCards || `<p class="text-sm text-slate-400">${fr ? 'Aucun membre d’équipage.' : 'No crew members.'}</p>`}</div>
        </section>
        <section class="glass-card rounded-2xl p-4 sm:p-5">
          <div class="flex items-center justify-between gap-3 mb-4"><div><p class="text-[10px] font-mono uppercase tracking-widest text-amber-300">${fr ? 'FILE OPÉRATIONNELLE' : 'OPERATIONS QUEUE'}</p><h3 class="font-display text-lg font-bold text-white mt-1">${fr ? 'Alertes non résolues' : 'Unresolved alerts'}</h3></div><span class="rounded-full bg-slate-800 px-2.5 py-1 text-[10px] font-mono text-slate-300">${openAlerts.length} ${fr ? 'OUVERTE(S)' : 'OPEN'}</span></div>
          <div class="space-y-2">${alertRows || `<div class="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-4 text-xs text-emerald-300">${fr ? 'Aucune alerte non résolue dans la file opérationnelle.' : 'No unresolved alerts in the operations queue.'}</div>`}</div>
        </section>
        <p class="text-[10px] text-slate-600 px-1">${fr ? 'Cette vue est volontairement limitée aux informations opérationnelles. Les constantes vitales, diagnostics, traitements et antécédents restent réservés au personnel médical autorisé.' : 'This view is intentionally limited to operational information. Vital signs, diagnoses, treatments and medical history remain restricted to authorized medical staff.'}</p>`;
      const search = document.getElementById('groundCrewSearch');
      if (search) search.addEventListener('input', () => {
        const query = search.value.trim().toLowerCase();
        host.querySelectorAll('#groundCrewGrid article').forEach(card => {
          card.classList.toggle('hidden', !card.textContent.toLowerCase().includes(query));
        });
      });
      const refreshButton = document.getElementById('groundRefreshBtn');
      if (refreshButton && !refreshButton.dataset.wired) {
        refreshButton.dataset.wired = '1';
        refreshButton.addEventListener('click', () => loadGround().catch(error => console.error(error)));
      }
    } catch (error) {
      console.error('[ground] Unable to load mission picture:', error);
      host.innerHTML = `<div class="rounded-2xl border border-red-400/30 bg-red-500/5 p-4 text-sm text-red-200">${fr ? 'Impossible de charger la situation de mission. Vérifie la connexion puis actualise.' : 'Unable to load the mission picture. Check the connection and refresh.'}</div>`;
    }
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

  function crewName(member) {
    return member.identity?.firstName || member.callSign;
  }

  function healthBand(member) {
    const highest = member.alertSummary?.highest;
    if (highest === 'CRITICAL' || highest === 'WARNING') return 'critical';
    if (highest === 'WATCH') return 'watch';
    return 'stable';
  }

  function wireWardControls() {
    ['wardSearch', 'wardFilter', 'wardSort'].forEach(id => {
      const el = document.getElementById(id);
      if (!el || el.dataset.wired) return;
      el.dataset.wired = '1';
      el.addEventListener('input', () => loadWard());
      el.addEventListener('change', () => loadWard());
    });
  }

  async function loadWard() {
    const host = document.getElementById('wardBody');
    const stats = document.getElementById('wardStats');
    if (!host || !stats) return;
    wireWardControls();
    const fr = currentLang === 'fr';
    const filter = document.getElementById('wardFilter');
    const sort = document.getElementById('wardSort');
    const search = document.getElementById('wardSearch');
    if (filter && filter.options.length >= 4) {
      filter.options[0].text = fr ? 'Tous' : 'All';
      filter.options[1].text = fr ? 'Stable' : 'Stable';
      filter.options[2].text = fr ? 'Surveillance' : 'Watch';
      filter.options[3].text = fr ? 'Critique' : 'Critical';
    }
    if (sort && sort.options.length >= 2) {
      sort.options[0].text = fr ? 'Nom' : 'Name';
      sort.options[1].text = fr ? 'Alerte' : 'Alert';
    }
    if (search) search.placeholder = fr ? 'Alex, Maya…' : 'Alex, Maya…';
    const bands = { stable: 0, watch: 0, critical: 0 };
    state.crew.forEach(member => { bands[healthBand(member)] += 1; });
    const openAlerts = state.crew.reduce((sum, member) => sum + (member.alertSummary?.openCount || 0), 0);
    const stat = (label, value, tone) => `<div class="rounded-2xl border border-slate-800 p-3"><div class="text-[10px] font-mono uppercase text-slate-400">${esc(label)}</div><div class="font-display text-2xl ${tone}">${value}</div></div>`;
    stats.innerHTML = [
      stat(fr ? 'Équipage' : 'Crew', state.crew.length, 'text-white'),
      stat(fr ? 'Stables' : 'Stable', bands.stable, 'text-emerald-300'),
      stat(fr ? 'Sous surveillance' : 'Watch', bands.watch, 'text-amber-300'),
      stat(fr ? 'Alertes actives' : 'Active alerts', openAlerts, 'text-red-300')
    ].join('');
    const query = (search?.value || '').trim().toLowerCase();
    const filterValue = filter?.value || 'all';
    const sortValue = sort?.value || 'name';
    const rank = { critical: 3, watch: 2, stable: 1 };
    const rows = state.crew
      .filter(member => {
        const name = `${crewName(member)} ${member.callSign}`.toLowerCase();
        if (query && !name.includes(query)) return false;
        if (filterValue === 'all') return true;
        return healthBand(member) === filterValue;
      })
      .sort((a, b) => sortValue === 'alert'
        ? rank[healthBand(b)] - rank[healthBand(a)]
        : crewName(a).localeCompare(crewName(b)));
    host.innerHTML = rows.map(member => {
      const local = CALL_TO_LOCAL[member.callSign] || '';
      const band = healthBand(member);
      const tone = band === 'critical' ? 'border-red-400/50' : band === 'watch' ? 'border-amber-400/40' : 'border-emerald-400/30';
      const latest = (member.latestVitals || [])[0];
      const latestText = latest ? `${latest.type} ${latest.value} ${latest.unit}` : (fr ? 'Aucune mesure' : 'No measurement');
      return `<article class="rounded-2xl border ${tone} bg-slate-950/50 p-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-sky-500/20 text-sky-200 font-display font-bold grid place-items-center">${esc(crewName(member).slice(0, 1))}</div>
          <div>
            <div class="font-display font-bold text-white">${esc(crewName(member))}</div>
            <div class="text-[11px] font-mono text-slate-500">${esc(member.callSign)}</div>
          </div>
        </div>
        <dl class="mt-3 text-xs text-slate-300 grid grid-cols-2 gap-y-1">
          <div>${fr ? 'Âge' : 'Age'} ${esc(member.age ?? '—')}</div>
          <div>${esc(statusLabel(member.alertSummary?.highest) || (fr ? 'Stable' : 'Stable'))}</div>
          <div class="col-span-2">${esc(member.mission?.name || '')}</div>
          <div class="col-span-2 font-mono text-[11px] text-slate-400">${esc(latestText)}</div>
        </dl>
        <button type="button" data-id="${esc(member.id)}" data-local="${esc(local)}" class="mt-3 text-xs font-display font-bold text-sky-300">${fr ? 'Voir le profil' : 'View profile'}</button>
      </article>`;
    }).join('') || `<p class="text-sm text-slate-400">${fr ? 'Aucun astronaute pour ce filtre.' : 'No astronaut matches this filter.'}</p>`;
    host.querySelectorAll('[data-id]').forEach(button => {
      button.addEventListener('click', () => openProfile(button.dataset.id, button.dataset.local));
    });
  }

  async function openProfile(id, local) {
    if (local) selectAstronaut(local);
    const panel = document.getElementById('wardProfile');
    const fr = currentLang === 'fr';
    panel.classList.remove('hidden');
    panel.innerHTML = `<p class="text-sm text-slate-400">${fr ? 'Chargement du dossier fictif…' : 'Loading the fictional record…'}</p>`;
    const [record, planWrap] = await Promise.all([
      api(`/api/astronauts/${id}`),
      api(`/api/nutrition/recommendations/${id}?lang=${fr ? 'fr' : 'en'}`)
    ]);
    const plan = planWrap.recommendation;
    const tabs = {
      general: `<p>${esc(record.identity.firstName)} ${esc(record.identity.lastName)} · ${esc(record.callSign)}</p>
        <p class="mt-1">${fr ? 'Âge' : 'Age'} ${esc(record.age ?? '—')} · ${esc(record.mission?.name || '')} · ${fr ? 'jour' : 'day'} ${esc(record.missionDay ?? '—')}</p>
        <p class="mt-1">${record.heightCm ?? '—'} cm · ${record.weightKg ?? '—'} kg</p>
        <p class="mt-1">${fr ? 'Allergies' : 'Allergies'}: ${esc((record.allergies || []).join(', ') || '—')}</p>
        <p class="text-[11px] text-amber-200 mt-2">${fr ? 'Dossier fictif.' : 'Fictional record.'}</p>`,
      health: (record.vitals || []).slice(0, 12).map(v => `<div class="font-mono text-xs">${esc(v.type)} ${esc(v.value)} ${esc(v.unit)}</div>`).join('') || '—',
      history: `<div class="text-xs">${(record.notes || []).map(n => `<p class="mb-2">${esc(n.content)}</p>`).join('') || (fr ? 'Aucune note.' : 'No notes.')}</div>`,
      nutrition: `<p>${esc(plan.energy.estimatedDailyKcal ?? '—')} kcal</p>
        <p>P ${esc(plan.macros.proteinG.target ?? '—')} g · C ${esc(plan.macros.carbsG.target ?? '—')} g · F ${esc(plan.macros.fatG.target ?? '—')} g</p>
        <p>${esc(plan.hydration.targetMl ?? '—')} mL</p>
        <ul class="mt-2 list-disc pl-4">${(plan.priorities || []).slice(0, 4).map(item => `<li>${esc(item)}</li>`).join('')}</ul>`,
      analysis: (record.alertSummary?.items || []).map(item => `<p class="text-xs mb-2">${esc(item.title)}</p>`).join('') || (fr ? 'Aucune alerte ouverte.' : 'No open alert.')
    };
    const labels = fr
      ? [['general', 'Général'], ['health', 'Santé'], ['history', 'Historique'], ['nutrition', 'Nutrition'], ['analysis', 'Analyse']]
      : [['general', 'General'], ['health', 'Health'], ['history', 'History'], ['nutrition', 'Nutrition'], ['analysis', 'Analysis']];
    panel.innerHTML = `<div class="flex flex-wrap gap-2" id="profileTabs">${labels.map(([key, label], index) => `<button type="button" data-tab="${key}" class="px-3 py-1 rounded-full text-xs border ${index === 0 ? 'border-sky-400 text-sky-200' : 'border-slate-700 text-slate-300'}">${label}</button>`).join('')}</div><div id="profilePane" class="mt-3 text-sm text-slate-200">${tabs.general}</div>
      <button type="button" id="openBodyMap" class="mt-3 text-xs text-sky-300">${fr ? 'Carte anatomique' : 'Body map'}</button>`;
    panel.querySelectorAll('[data-tab]').forEach(button => {
      button.addEventListener('click', () => {
        document.getElementById('profilePane').innerHTML = tabs[button.dataset.tab];
      });
    });
    document.getElementById('openBodyMap').addEventListener('click', () => switchView('crew'));
    panel.scrollIntoView({ block: 'nearest' });
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
    await watchAlerts();
    if (alertWatch) clearInterval(alertWatch);
    alertWatch = setInterval(watchAlerts, 8000);
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
