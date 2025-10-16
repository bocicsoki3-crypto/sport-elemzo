let __gasUrl = 'https://script.google.com/macros/s/AKfycbyN99ot1yzv4Na9nq0rTIsCSQ2DUlMMCzSKQmtM8fg7qDMAaFzHW8n_2Y8eNxnsFdabvg/exec';
let __fixtures = [];
let __currentSport = 'soccer';
let __historySportFilter = 'soccer';
let __sheetUrl = '';

// ÚJ, ELEMZÉS-FÓKUSZÚ KATEGÓRIÁK
const LEAGUE_CATEGORIES = {
    soccer: {
        '🎯 Prémium Elemzés': [ 'Champions League', 'Premier League', 'Bundesliga', 'LaLiga', 'Serie A' ],
        '📈 Stabil Ligák': [ 'Europa League', 'Ligue 1', 'Eredivisie', 'Liga Portugal' ],
        '❔ Változékony Mezőny': [ 'Championship', '2. Bundesliga', 'Serie B', 'LaLiga2', 'Super Lig', 'Premiership', 'MLS' ],
        '🎲 Vad Kártyák': [ 'FIFA World Cup', 'UEFA European Championship', 'Conference League', 'Brazil Serie A', 'Argentinian Liga Profesional', 'Greek Super League', 'Nemzetek Ligája', 'Kupa', 'Copa', 'Cup' ]
    },
    hockey: {
        '🎯 Prémium Elemzés': [ 'NHL' ],
        '📈 Stabil Ligák': [ 'KHL', 'SHL', 'Liiga', 'DEL' ],
        '🎲 Vad Kártyák': [ 'IIHF World Championship', 'Olimpiai Játékok', 'Spengler Cup', 'Extraliga' ]
    },
    basketball: {
        '🎯 Prémium Elemzés': [ 'NBA', 'Euroleague' ],
        '📈 Stabil Ligák': [ 'Spanish Liga ACB', 'Turkish BSL', 'German BBL', 'Italian Lega A' ],
        '🎲 Vad Kártyák': [ 'FIBA World Cup', 'Olimpiai Játékok', 'EuroBasket', 'FIBA Champions League', 'EuroCup', 'LNB Pro A' ]
    }
};

// Ikonok és leírások az új kategóriákhoz
const LEAGUE_CHARACTERISTICS = {
    '🎯 Prémium Elemzés': { icon: '🎯', description: 'A legjobb ligák, ahol a legtöbb mélystatisztikai adat áll rendelkezésre. A modell itt a legpontosabb.' },
    '📈 Stabil Ligák': { icon: '📈', description: 'Erős, ismert bajnokságok, ahol jó az adatelérhetőség és a meccsek megbízhatóan elemezhetőek.' },
    '❔ Változékony Mezőny': { icon: '❔', description: 'Kiegyenlített erőviszonyok jellemzik, ahol gyakoriak a meglepetések. Az elemzés nagyobb körültekintést igényel.' },
    '🎲 Vad Kártyák': { icon: '🎲', description: 'A legkiszámíthatatlanabb kategória (kupák, tornák, kisebb ligák). Az adatok hiányosak lehetnek, a kockázat magasabb.' }
};

// Robusztus kategória-kereső függvény
function getLeagueGroupAndIcon(leagueName) {
    const sportGroups = LEAGUE_CATEGORIES[__currentSport] || {};
    const lowerLeagueName = leagueName.toLowerCase();

    for (const groupName in sportGroups) {
        const hasLeague = sportGroups[groupName].some(l => lowerLeagueName.includes(l.toLowerCase()));
        if (hasLeague) {
            const icon = LEAGUE_CHARACTERISTICS[groupName]?.icon || '⚽';
            const description = LEAGUE_CHARACTERISTICS[groupName]?.description || 'Általános bajnokság';
            return { group: groupName, icon, description };
        }
    }
    return { group: '🎲 Vad Kártyák', icon: '🎲', description: 'A legkiszámíthatatlanabb kategória (kupák, tornák, kisebb ligák). Az adatok hiányosak lehetnek, a kockázat magasabb.' }; // Alapértelmezett csoport a legkockázatosabb
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);
}

document.addEventListener('DOMContentLoaded', () => {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            const tabId = button.getAttribute('data-tab');
            tabContents.forEach(content => {
                content.style.display = content.id === tabId ? 'block' : 'none';
                content.classList.toggle('active', content.id === tabId);
            });
            if (tabId === 'tab-history') loadSheetUrl();
        });
    });

    const themeSwitcher = document.getElementById('theme-switcher');
    const currentTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.className = `${currentTheme}-theme`;
    themeSwitcher.addEventListener('click', () => {
        let newTheme = document.documentElement.className === 'dark-theme' ? 'light' : 'dark';
        document.documentElement.className = `${newTheme}-theme`;
        localStorage.setItem('theme', newTheme);
    });

    const controlsAccordion = document.getElementById('controls-accordion');
    if (window.innerWidth <= 1024 && controlsAccordion) {
        controlsAccordion.removeAttribute('open');
    }

    if(!__gasUrl||!__gasUrl.startsWith('https://script.google.com')){
        document.getElementById('userInfo').textContent='HIBA: Web App URL nincs beállítva!';
        document.getElementById('userInfo').style.color = 'var(--danger)';
    } else {
        document.getElementById('userInfo').textContent=`Csatlakozva`;
    }
    loadSheetUrl();
});

async function loadFixtures() {
    const listEl = document.getElementById('fixtures-list');
    const loadBtn = document.getElementById('loadFixturesBtn');
    listEl.innerHTML = '<p class="muted" style="text-align:center;">Adatok lekérése...</p>';
    loadBtn.disabled = true;
    try {
        const response = await fetch(`${__gasUrl}?action=getFixtures&sport=${__currentSport}&days=2`);
        if (!response.ok) throw new Error(`Hálózati hiba: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        __fixtures = data.fixtures || [];
        sessionStorage.setItem('openingOdds', JSON.stringify(data.odds || {}));

        // --- ÚJ RÉSZ: Intelligens csoportosítás az új kategóriák szerint ---
        const groupedByMasterCategory = __fixtures.reduce((acc, fx) => {
            const { group } = getLeagueGroupAndIcon(fx.league);
            if (!acc[group]) {
                acc[group] = { leagues: {} };
            }
            if (!acc[group].leagues[fx.league]) {
                acc[group].leagues[fx.league] = [];
            }
            acc[group].leagues[fx.league].push(fx);
            return acc;
        }, {});

        // Meghatározott sorrend a főcsoportoknak
        const groupOrder = ['🎯 Prémium Elemzés', '📈 Stabil Ligák', '❔ Változékony Mezőny', '🎲 Vad Kártyák'];
        let html = '';

        for (const masterGroup of groupOrder) {
            if (groupedByMasterCategory[masterGroup]) {
                html += `<div class="league-master-group">`;
                html += `<div class="league-master-group-header">${masterGroup}</div>`;

                for (const leagueName in groupedByMasterCategory[masterGroup].leagues) {
                    const { icon, description } = getLeagueGroupAndIcon(leagueName);
                    const tagHtml = `<span class="league-category-tag" title="${description}">${icon}</span>`;

                    html += `<details class="league-group">`;
                    html += `<summary class="league-header"><span>${leagueName}</span>${tagHtml}</summary>`;
                    groupedByMasterCategory[masterGroup].leagues[leagueName].forEach(fx => {
                        const d = new Date(fx.utcKickoff).toLocaleString('hu-HU', { dateStyle: 'short', timeStyle: 'short' });
                        html += `
                            <div class="list-item" onclick="fillAndAnalyze('${escapeHtml(fx.home)}','${escapeHtml(fx.away)}')">
                                <div>
                                    <div class="list-item-title">${escapeHtml(fx.home)} – ${escapeHtml(fx.away)}</div>
                                    <div class="list-item-meta">${d}</div>
                                </div>
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px; color: var(--text-secondary);"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </div>
                        `;
                    });
                    html += `</details>`;
                }
                html += `</div>`;
            }
        }
        // --- Csoportosítás Vége ---

        listEl.innerHTML = html || '<p class="muted" style="text-align:center;">Nincs megjeleníthető mérkőzés.</p>';

    } catch (e) {
        listEl.innerHTML = `<p class="muted" style="color:var(--danger);">${e.message}</p>`;
    } finally {
        loadBtn.disabled = false;
    }
}


function fillAndAnalyze(home, away) {
    document.getElementById('home').value = home;
    document.getElementById('away').value = away;
    runAnalysis(true);
}

async function runAnalysis(forceNew = false) {
    const home = document.getElementById("home").value.trim();
    const away = document.getElementById("away").value.trim();
    const resultsEl = document.getElementById('analysis-results');
    const placeholderEl = document.getElementById('placeholder');
    const skeletonEl = document.getElementById('loading-skeleton');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar-inner');
    const statusEl = document.getElementById('status');

    resultsEl.innerHTML = '';
    placeholderEl.style.display = 'none';
    skeletonEl.style.display = 'block';
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    statusEl.textContent = '';

    if (!home || !away) {
        resultsEl.innerHTML = `<p style="color:var(--danger); text-align:center;">Hiba: Mindkét csapat nevét meg kell adni.</p>`;
        skeletonEl.style.display = 'none';
        progressContainer.style.display = 'none';
        placeholderEl.style.display = 'flex';
        return;
    }

    if (window.innerWidth <= 1024) {
        const controlsAccordion = document.getElementById('controls-accordion');
        if (controlsAccordion) controlsAccordion.removeAttribute('open');
        resultsEl.innerHTML = '';
        placeholderEl.style.display = 'flex';
    }

    let progress = 0;
    const updateProgress = (val, text) => {
        progress = Math.max(progress, val);
        progressBar.style.width = `${progress}%`;
        statusEl.textContent = text;
    };

    try {
        updateProgress(5, "Elemzés indítása...");
        let analysisUrl = `${__gasUrl}?action=runAnalysis&home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}&sport=${__currentSport}&force=${forceNew}&sheetUrl=${encodeURIComponent(__sheetUrl)}`;
        const openingOdds = sessionStorage.getItem('openingOdds') || '{}';

        fetch(analysisUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ openingOdds: JSON.parse(openingOdds) }) });
        updateProgress(10, "Adatok lekérése a szerverről...");

        const interval = setInterval(() => {
            if (progress < 85) updateProgress(progress + Math.random() * 5, "AI elemzés és szimuláció futtatása...");
        }, 800);

        await new Promise(resolve => setTimeout(resolve, 9000));
        clearInterval(interval);
        updateProgress(90, "Válasz feldolgozása...");

        const resultResponse = await fetch(`${analysisUrl}&force=false`);
        if (!resultResponse.ok) throw new Error(`Szerver válasz hiba: ${resultResponse.status}`);

        const data = await resultResponse.json();
        if (data.error) throw new Error(data.error);

        updateProgress(100, "Kész.");

        const analysisHtml = `<div class="analysis-body">${data.html}</div>`;
        if (window.innerWidth <= 1024) {
            openAnalysisModal(analysisHtml);
        } else {
            resultsEl.innerHTML = analysisHtml;
        }

        if (__sheetUrl && document.querySelector('.tab-btn[data-tab="tab-history"]').classList.contains('active')) {
            loadHistory();
        }

    } catch (e) {
        resultsEl.innerHTML = `<p style="color:var(--danger); text-align:center;">Hiba: ${e.message}</p>`;
    } finally {
        skeletonEl.style.display = 'none';
        setTimeout(() => { progressContainer.style.display = 'none'; }, 2000);
    }
}

function openAnalysisModal(htmlContent) {
    const modal = document.getElementById('analysis-modal');
    const modalBody = document.getElementById('modal-body');
    modalBody.innerHTML = htmlContent;
    modal.style.display = 'flex';
}

function closeAnalysisModal(event) {
    const modal = document.getElementById('analysis-modal');
    if (!event || event.target === modal || event.target.classList.contains('modal-close-btn')) {
        modal.style.display = 'none';
        document.getElementById('modal-body').innerHTML = '';
    }
}

function saveSheetUrl() {
    __sheetUrl = document.getElementById('sheetUrl').value;
    if (__sheetUrl && __sheetUrl.startsWith('https://docs.google.com/spreadsheets/d/')) {
        localStorage.setItem('sheetUrl', __sheetUrl);
        alert('Táblázat URL elmentve!');
        loadSheetUrl();
    } else {
        alert('Érvénytelen Google Táblázat URL!');
    }
}

function loadSheetUrl() {
    __sheetUrl = localStorage.getItem('sheetUrl');
    const historyTabContent = document.getElementById('history');

    if (__sheetUrl) {
        if (document.querySelector('.tab-btn[data-tab="tab-history"]').classList.contains('active')) {
            loadHistory();
        }
    } else {
        if (historyTabContent) {
            historyTabContent.innerHTML = `
                <p class="muted">A funkcióhoz add meg a Google Táblázat URL-jét.</p>
                <label for="sheetUrl">Google Táblázat URL</label>
                <input id="sheetUrl" placeholder="https://docs.google.com/spreadsheets/d/..." onchange="saveSheetUrl()">`;
        }
    }
}


async function logBet(betData) {
    if (!__sheetUrl) { alert('Kérlek, add meg a Google Táblázat URL-jét a naplózáshoz!'); return; }
    const button = event.target;
    button.disabled = true;
    button.textContent = 'Naplózás...';
    try {
        await fetch(`${__gasUrl}`, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'logBet', sheetUrl: __sheetUrl, bet: betData })
        });
        button.textContent = 'Sikeresen Naplózva ✅';
    } catch (e) {
        alert(`Hiba a naplózás során: ${e.message}.`);
        button.textContent = 'Naplózás Sikertelen';
    }
}

function handleSportChange() {
    __currentSport = document.getElementById('sportSelector').value;
    document.getElementById('fixtures-list').innerHTML = '';
    __fixtures = [];
}

async function loadHistory() {
    if (!__sheetUrl) return;
    document.getElementById('history').innerHTML = '<p class="muted">Előzmények betöltése...</p>';
    try {
        const response = await fetch(`${__gasUrl}?action=getHistory&sheetUrl=${encodeURIComponent(__sheetUrl)}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        renderHistory(data.history);
    } catch (e) {
        document.getElementById('history').innerHTML = `<p class="muted" style="color:var(--danger)">Hiba a napló betöltésekor: ${e.message}</p>`;
    }
}

function filterHistory(allHistory) {
    const query = document.getElementById('historySearch').value.toLowerCase();
    const filtered = allHistory.filter(item =>
        (item.sport === __historySportFilter) &&
        (item.home.toLowerCase().includes(query) || item.away.toLowerCase().includes(query))
    );
    renderHistory(filtered, true);
}

function renderHistory(history, isFiltering = false) {
    const box = document.getElementById('history');

    if (!isFiltering) {
        sessionStorage.setItem('fullHistory', JSON.stringify(history));
    }

    const searchAndFilterHtml = `
        <input id="historySearch" placeholder="Keresés a naplóban..." oninput="filterHistory(JSON.parse(sessionStorage.getItem('fullHistory') || '[]'))" style="margin-bottom:0.8rem"/>
        <div class="sport-filter-container">
            <button class="sport-filter-btn ${__historySportFilter === 'soccer' ? 'active' : ''}" onclick="filterHistoryBySport('soccer', this)" title="Labdarúgás">⚽</button>
            <button class="sport-filter-btn ${__historySportFilter === 'hockey' ? 'active' : ''}" onclick="filterHistoryBySport('hockey', this)" title="Jégkorong">🏒</button>
            <button class="sport-filter-btn ${__historySportFilter === 'basketball' ? 'active' : ''}" onclick="filterHistoryBySport('basketball', this)" title="Kosárlabda">🏀</button>
        </div>
    `;

    if (!history || history.length === 0) {
        box.innerHTML = searchAndFilterHtml + '<p class="muted" style="text-align:center;">Nincsenek előzmények ebben a kategóriában.</p>';
        return;
    }

    const groupedByDate = history.reduce((acc, item) => {
        const dateKey = new Date(item.date).toISOString().split('T')[0];
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(item);
        return acc;
    }, {});

    let finalHtml = '';
    const sortedDates = Object.keys(groupedByDate).sort((a, b) => new Date(b) - new Date(a));

    for (const date of sortedDates) {
        finalHtml += `<details class="history-group">`;
        finalHtml += `<summary class="history-date-header">${new Date(date).toLocaleDateString('hu-HU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</summary>`;

        groupedByDate[date].sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(item => {
            finalHtml += `
                <div class="list-item">
                    <div onclick="loadAnalysisFromHistory('${item.id}')" style="flex-grow:1;">
                        <div class="list-item-title">${escapeHtml(item.home)} – ${escapeHtml(item.away)}</div>
                        <div class="list-item-meta">${new Date(item.date).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <div style="display:flex;gap:5px">
                        <a href="#" class="action-icon" onclick="loadAnalysisFromHistory('${item.id}')" title="Elemzés Megtekintése"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></a>
                        <a href="#" class="action-icon delete" onclick="deleteHistoryItem('${item.id}')" title="Törlés"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></a>
                    </div>
                </div>
            `;
        });
        finalHtml += `</details>`;
    }
    box.innerHTML = searchAndFilterHtml + finalHtml;
}

function filterHistoryBySport(sport, btn) {
    __historySportFilter = sport;
    document.querySelectorAll('.sport-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filterHistory(JSON.parse(sessionStorage.getItem('fullHistory') || '[]'));
}

async function loadAnalysisFromHistory(id) {
    event.preventDefault();
    if (!__sheetUrl) return;
    const resultsEl = document.getElementById('analysis-results');
    const placeholderEl = document.getElementById('placeholder');
    const skeletonEl = document.getElementById('loading-skeleton');

    resultsEl.innerHTML = '';
    placeholderEl.style.display = 'none';
    skeletonEl.style.display = 'block';

    try {
        const response = await fetch(`${__gasUrl}?action=getAnalysisDetail&sheetUrl=${encodeURIComponent(__sheetUrl)}&id=${id}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        const analysisHtml = `<div class="analysis-body">${data.record.html}</div>`;
        if (window.innerWidth <= 1024) {
            openAnalysisModal(analysisHtml);
        } else {
            resultsEl.innerHTML = analysisHtml;
        }

    } catch (e) {
        resultsEl.innerHTML = `<p style="color:var(--danger); text-align:center;">Hiba az elemzés betöltésekor: ${e.message}</p>`;
    } finally {
        skeletonEl.style.display = 'none';
        if (window.innerWidth > 1024) {
            placeholderEl.style.display = 'none';
        } else {
            placeholderEl.style.display = 'flex';
        }
    }
}

async function deleteHistoryItem(id) {
    event.preventDefault();
    if (!__sheetUrl || !confirm("Biztosan törölni szeretnéd ezt az elemet a központi naplóból?")) return;
    try {
        await fetch(`${__gasUrl}`, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({ action: 'deleteHistoryItem', sheetUrl: __sheetUrl, id: id })
        });
        alert('Elem sikeresen törölve.');
        loadHistory();
    } catch (e) {
        alert(`Hiba a törlés során: ${e.message}`);
    }
}
