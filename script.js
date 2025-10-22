/**
 * The King AI - Sportelemző Irányítópult
 * Kliensoldali fő szkript
 *
 * Ez a fájl kezeli a felhasználói felület összes interakcióját,
 * a backend szerverrel való kommunikációt, és a dinamikus tartalomgenerálást.
 * [cite_start]A kód a modern Node.js backendhez lett igazítva. [cite: 1, 2]
 */

// --- ALKALMAZÁS ÁLLAPOT ---
const appState = {
    // A VÉGLEGES RENDER.COM SZERVER CÍME!
    [cite_start]gasUrl: 'https://king-ai-backend.onrender.com', [cite: 3]
    fixtures: [],
    currentSport: 'soccer',
    sheetUrl: '', // Ezt a backend a .env fájlból olvassa, de biztonsági okokból elküldhetjük.
    [cite_start]currentAnalysisContext: '', // Az aktuálisan megnyitott elemzés HTML tartalma a chathez. [cite: 4]
    [cite_start]chatHistory: [], // A chat-beszélgetés előzményei. [cite: 4]
    [cite_start]selectedMatches: new Set() // Kiválasztott meccsek egyedi azonosítóinak tárolása. [cite: 5]
};

// --- LIGA KATEGÓRIÁK ---
const LEAGUE_CATEGORIES = {
    soccer: {
        'Top Ligák': ['Champions League', 'Premier League', 'Bundesliga', 'LaLiga', 'Serie A'],
        'Kiemelt Bajnokságok': ['Europa League', 'Ligue 1', 'Eredivisie', 'Liga Portugal'],
        'Figyelmet Érdemlő': ['Championship', '2. [cite_start]Bundesliga', 'Serie B', 'LaLiga2', 'Super Lig', 'Premiership', 'MLS'], [cite: 6, 7]
        [cite_start]'Egyéb Meccsek': ['FIFA World Cup', 'UEFA European Championship', 'Conference League', 'Brazil Serie A', 'Argentinian Liga Profesional', 'Greek Super League', 'Nemzetek Ligája', 'Kupa', 'Copa', 'Cup'] [cite: 7]
    },
    hockey: {
        'Top Ligák': ['NHL'],
        'Kiemelt Bajnokságok': ['KHL', 'SHL', 'Liiga', 'DEL', 'AHL', 'ICEHL', 'Champions Hockey League'],
        'Egyéb Meccsek': ['IIHF World Championship', 'Olimpiai Játékok', 'Spengler Cup', 'Extraliga']
    },
    basketball: {
        'Top Ligák': ['NBA', 'Euroleague'],
        'Kiemelt Bajnokságok': ['Liga ACB', 'BSL', 'BBL', 'Lega A'],
        [cite_start]'Egyéb Meccsek': ['FIBA World Cup', 'Olimpiai Játékok', 'EuroBasket', 'FIBA Champions League', 'EuroCup', 'LNB Pro A'] [cite: 8]
    }
};

// --- INICIALIZÁLÁS ---
document.addEventListener('DOMContentLoaded', () => {
    // Felhasználói felület elemeinek és eseménykezelőinek beállítása.
    setupThemeSwitcher();
    document.getElementById('loadFixturesBtn').addEventListener('click', loadFixtures);
    initMultiSelect();

    // Vizuális effektek inicializálása.
    createGlowingOrbs();
    createHeaderOrbs();

    // Toast értesítési konténer hozzáadása a DOM-hoz.
    const toastContainer = document.createElement('div');
    toastContainer.id = 'toast-notification-container';
    document.body.appendChild(toastContainer);

    // Kapcsolat állapotának jelzése.
    document.getElementById('userInfo').textContent = `Csatlakozva a szerverhez...`;
    appState.sheetUrl = localStorage.getItem('sheetUrl'); // Korábbi munkamenet URL-jének betöltése.
});


// --- HIBAKEZELÉS ---
/**
 * Egységes hibakezelő a fetch hívásokhoz.
 * [cite_start]Megpróbálja kiolvasni a szerver által küldött JSON hibaüzenetet. [cite: 10]
 * [cite_start]@param {Response} response - A fetch API response objektuma. [cite: 11]
 */
async function handleFetchError(response) {
    try {
        const errorData = await response.json();
        [cite_start]throw new Error(`Szerver hiba (${response.status}): ${errorData.error || response.statusText}`); [cite: 13]
    } catch (jsonError) {
        // Ha a válasz nem JSON, vagy más hiba történt a parse közben.
        [cite_start]throw new Error(`Hálózati hiba: ${response.status} ${response.statusText}`); [cite: 14]
    }
}


// --- FŐ FUNKCIÓK (KOMMUNIKÁCIÓ A BACKENDDEL) ---

/**
 * [cite_start]Lekéri a mérkőzéseket a backendtől és megjeleníti őket. [cite: 15]
 */
async function loadFixtures() {
    const loadBtn = document.getElementById('loadFixturesBtn');
    loadBtn.disabled = true;
    loadBtn.textContent = 'Betöltés...';
    appState.selectedMatches.clear();
    updateMultiSelectButton();

    try {
        [cite_start]const response = await fetch(`${appState.gasUrl}/getFixtures?sport=${appState.currentSport}&days=2`); [cite: 16]
        if (!response.ok) await handleFetchError(response);

        [cite_start]const data = await response.json(); [cite: 17]
        if (data.error) throw new Error(data.error);

        // Minden meccshez egyedi azonosítót generálunk a könnyebb kezelhetőség érdekében.
        appState.fixtures = (data.fixtures || []).map(fx => ({
            ...fx,
            uniqueId: `${appState.currentSport}_${fx.home.toLowerCase().replace(/\s+/g, '')}_${fx.away.toLowerCase().replace(/\s+/g, '')}`
        [cite_start]})); [cite: 18]

        if (appState.fixtures.length === 0) {
            [cite_start]document.getElementById('placeholder').style.display = 'flex'; [cite: 19]
        } else {
            [cite_start]// Megjelenítés eszköz szerint (desktop/mobil). [cite: 20]
            [cite_start]isMobile() ? renderFixturesForMobileList(appState.fixtures) : renderFixturesForDesktop(appState.fixtures); [cite: 21]
        }
        addCheckboxListeners(); // Eseménykezelők hozzáadása a checkboxokhoz.
        [cite_start]document.getElementById('userInfo').textContent = `Csatlakozva (Meccsek betöltve)`; [cite: 22]
    } catch (e) {
        showToast(`Hiba a meccsek betöltésekor: ${e.message}`, 'error');
        [cite_start]document.getElementById('placeholder').style.display = 'flex'; [cite: 23]
        document.getElementById('userInfo').textContent = `Csatlakozási hiba`;
    } finally {
        loadBtn.disabled = false;
        [cite_start]loadBtn.textContent = 'Meccsek Betöltése'; [cite: 24]
    }
}

/**
 * Elemzést futtat egy adott meccsre.
 * [cite_start]@param {string} home - Hazai csapat neve. [cite: 25]
 * [cite_start]@param {string} away - Vendég csapat neve. [cite: 25]
 * [cite_start]@param {boolean} forceNew - Kényszeríti az új elemzést a cache helyett. [cite: 26]
 */
async function runAnalysis(home, away, forceNew = false) {
    home = unescape(home);
    away = unescape(away);

    if (isMobile() && forceNew) {
        [cite_start]showToast("Elemzés folyamatban... Ez hosszabb időt vehet igénybe.", 'info', 6000); [cite: 27]
    }

    openModal(`${home} vs ${away}`, document.getElementById('common-elements').innerHTML, 'modal-xl');

    const modalSkeleton = document.querySelector('#modal-container #loading-skeleton');
    const modalResults = document.querySelector('#modal-container #analysis-results');
    [cite_start]const modalChat = document.querySelector('#modal-container #chat-container'); [cite: 29]

    modalResults.innerHTML = '';
    modalChat.style.display = 'none';
    modalSkeleton.classList.add('active');

    // Chat eseménykezelők beállítása.
    modalChat.querySelector('#chat-send-btn').onclick = sendChatMessage;
    [cite_start]modalChat.querySelector('#chat-input').onkeyup = (e) => e.key === "Enter" && sendChatMessage(); [cite: 30]

    try {
        const openingOdds = sessionStorage.getItem('openingOdds') || [cite_start]'{}'; [cite: 31]
        const response = await fetch(`${appState.gasUrl}/runAnalysis?home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}&sport=${appState.currentSport}&force=${forceNew}&sheetUrl=${encodeURIComponent(appState.sheetUrl)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                openingOdds: JSON.parse(openingOdds)
            [cite_start]}) [cite: 32]
        });

        if (!response.ok) await handleFetchError(response);

        [cite_start]const data = await response.json(); [cite: 33]
        if (data.error) throw new Error(data.error);

        // Eredmények megjelenítése és chat előkészítése.
        appState.currentAnalysisContext = data.html;
        [cite_start]appState.chatHistory = []; [cite: 34]
        modalResults.innerHTML = `<div class="analysis-body">${data.html}</div>`;
        modalChat.style.display = 'block';
        modalChat.querySelector('#chat-messages').innerHTML = '';

    } catch (e) {
        [cite_start]modalResults.innerHTML = `<p style="color:var(--danger); text-align:center; padding: 2rem;">Hiba történt az elemzés során: ${e.message}</p>`; [cite: 35]
        [cite_start]console.error(e); [cite: 36]
    } finally {
        modalSkeleton.classList.remove('active');
    }
}

/**
 * [cite_start]Több, egyszerre kiválasztott meccsre futtat elemzést. [cite: 37]
 */
async function runMultiAnalysis() {
    const selectedIds = Array.from(appState.selectedMatches);
    [cite_start]if (selectedIds.length === 0 || selectedIds.length > 3) { [cite: 38]
        showToast('Válassz ki 1-3 meccset az elemzéshez.', 'error');
        [cite_start]return; [cite: 39]
    }

    [cite_start]const matchesToAnalyze = appState.fixtures.filter(fx => selectedIds.includes(fx.uniqueId)); [cite: 40]
    if (matchesToAnalyze.length !== selectedIds.length) {
        showToast('Hiba: Nem található minden kiválasztott meccs. Próbáld újra betölteni a meccseket.', 'error');
        [cite_start]return; [cite: 41]
    }

    openModal(`Többes Elemzés (${matchesToAnalyze.length} meccs)`, '<div id="multi-analysis-results"></div><div id="multi-loading-skeleton"></div>', 'modal-xl');
    const resultsContainer = document.getElementById('multi-analysis-results');
    [cite_start]const loadingContainer = document.getElementById('multi-loading-skeleton'); [cite: 42]

    loadingContainer.innerHTML = document.getElementById('loading-skeleton').outerHTML;
    loadingContainer.querySelector('.loading-skeleton')?.classList.add('active');

    [cite_start]// Párhuzamosan futtatjuk az elemzéseket. [cite: 43]
    const analysisPromises = matchesToAnalyze.map(match => {
        let analysisUrl = `${appState.gasUrl}/runAnalysis?home=${encodeURIComponent(match.home)}&away=${encodeURIComponent(match.away)}&sport=${appState.currentSport}&force=true&sheetUrl=${encodeURIComponent(appState.sheetUrl)}`;

        return fetch(analysisUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    openingOdds: JSON.parse(sessionStorage.getItem('openingOdds') || '{}')
                [cite_start]}) [cite: 44]
            })
            .then(async response => {
                if (!response.ok) {
                    [cite_start]// Manuális hibakezelés a .then() láncban. [cite: 45]
                    try {
                        const errorData = await response.json();
                        [cite_start]throw new Error(`Szerver hiba (${response.status}): ${errorData.error || response.statusText}`); [cite: 46]
                    } catch (jsonError) {
                        [cite_start]throw new Error(`Hálózati hiba: ${response.status} ${response.statusText}`); [cite: 47]
                    }
                }
                [cite_start]return response.json(); [cite: 48]
            })
            .then(data => {
                if (data.error) throw new Error(`Elemzési hiba: ${data.error}`);
                return {
                    match: `${match.home} vs ${match.away}`,
                    html: data.html
                [cite_start]}; [cite: 49]
            })
            .catch(error => {
                console.error(`Hiba ${match.home} vs ${match.away} elemzésekor:`, error);
                return {
                    [cite_start]match: `${match.home} vs ${match.away}`, [cite: 50]
                    error: error.message
                };
            });
    [cite_start]}); [cite: 51]

    try {
        const results = await Promise.all(analysisPromises);
        loadingContainer.innerHTML = '';
        [cite_start]resultsContainer.innerHTML = ''; [cite: 52]

        results.forEach(result => {
            const matchHeader = `<h4>${result.match}</h4>`;
            let recommendationHtml;

            if (result.error) {
                recommendationHtml = `<p style="color:var(--danger);">Hiba: ${result.error}</p>`;
            } else {
                [cite_start]const tempDiv = document.createElement('div'); [cite: 53]
                tempDiv.innerHTML = result.html;
                const recommendationCard = tempDiv.querySelector('.master-recommendation-card');
                recommendationHtml = recommendationCard ?
                    recommendationCard.outerHTML :
                    [cite_start]'<p class="muted">A fő elemzői ajánlás nem található ebben az elemzésben.</p>'; [cite: 54]
            }

            resultsContainer.innerHTML += `
                <div class="multi-analysis-item">
                    ${matchHeader}
                    ${recommendationHtml}
                </div>
            [cite_start]`; [cite: 55]
        });

        [cite_start]// Kijelölés törlése az elemzés után. [cite: 56]
        appState.selectedMatches.clear();
        document.querySelectorAll('.selectable-card.selected, .selectable-item.selected').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.match-checkbox:checked').forEach(cb => cb.checked = false);
        updateMultiSelectButton();

    [cite_start]} catch (e) { [cite: 57]
        console.error("Váratlan hiba a többes elemzés során:", e);
        [cite_start]loadingContainer.innerHTML = ''; [cite: 58]
        [cite_start]resultsContainer.innerHTML = `<p style="color:var(--danger); text-align:center;">Váratlan hiba történt az elemzések összesítésekor: ${e.message}</p>`; [cite: 59]
    }
}

/**
 * [cite_start]Chat üzenetet küld a szervernek az aktuális elemzési kontextussal. [cite: 60]
 */
async function sendChatMessage() {
    const modal = document.getElementById('modal-container');
    const input = modal.querySelector('#chat-input');
    const thinkingIndicator = modal.querySelector('#chat-thinking-indicator');
    [cite_start]const message = input.value.trim(); [cite: 61]
    if (!message) return;

    addMessageToChat(message, 'user');
    input.value = '';
    thinkingIndicator.style.display = 'block';

    [cite_start]try { [cite: 62]
        const response = await fetch(`${appState.gasUrl}/askChat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                context: appState.currentAnalysisContext,
                [cite_start]history: appState.chatHistory, [cite: 63]
                question: message
            })
        });
        [cite_start]if (!response.ok) await handleFetchError(response); [cite: 64]

        const data = await response.json();
        if (data.error) throw new Error(data.error);

        addMessageToChat(data.answer, 'ai');
        // Előzmények frissítése.
        appState.chatHistory.push({
            role: 'user',
            parts: [{
                text: message
            }]
        [cite_start]}); [cite: 65]
        appState.chatHistory.push({
            role: 'model',
            parts: [{
                text: data.answer
            }]
        [cite_start]}); [cite: 66]

    [cite_start]} catch (e) { [cite: 67]
        addMessageToChat(`Hiba történt: ${e.message}`, 'ai');
        console.error(e);
    [cite_start]} finally { [cite: 68]
        [cite_start]thinkingIndicator.style.display = 'none'; [cite: 69]
    }
}

// A kód a beküldött fájl alapján, a legfontosabb funkciókra fókuszálva javítottam. A többi funkciót
[cite_start]// (pl. Előzmények) hasonlóan kell átalakítani a Node.js backendhez, POST kéréseket és JSON-t használva. [cite: 70]

[cite_start]// --- UI SEGÉDFÜGGVÉNYEK --- [cite: 71]

function handleSportChange() {
    appState.currentSport = document.getElementById('sportSelector').value;
    appState.selectedMatches.clear();
    document.getElementById('kanban-board').innerHTML = '';
    document.getElementById('mobile-list-container').innerHTML = '';
    [cite_start]document.getElementById('placeholder').style.display = 'flex'; [cite: 72]
    updateMultiSelectButton();
}

function openManualAnalysisModal() {
    let content = `
        <div class="control-group" style="margin-bottom: 1rem;"><label for="manual-home">Hazai csapat</label><input id="manual-home" placeholder="Pl. Liverpool"/></div>
        <div class="control-group"><label for="manual-away">Vendég csapat</label><input id="manual-away" placeholder="Pl. Manchester City"/></div>
        <button class="btn btn-primary" onclick="runManualAnalysis()" style="width:100%; margin-top:1.5rem;">Elemzés Futtatása</button>
    `;
    [cite_start]openModal('Kézi Elemzés', content, 'modal-sm'); [cite: 73]
}

function runManualAnalysis() {
    const home = document.getElementById('manual-home').value;
    const away = document.getElementById('manual-away').value;
    [cite_start]if (!home || !away) { [cite: 74]
        showToast('Mindkét csapat nevét meg kell adni.', 'error');
        return;
    [cite_start]} [cite: 75]
    closeModal();
    runAnalysis(home, away, true); [cite_start]// Mindig új elemzést kényszerítünk. [cite: 76]
}

function isMobile() {
    [cite_start]return window.innerWidth <= 1024; [cite: 77]
}

function getLeagueGroup(leagueName) {
    if (!leagueName) return 'Egyéb Meccsek';
    const sportGroups = LEAGUE_CATEGORIES[appState.currentSport] || {};
    [cite_start]const lowerLeagueName = leagueName.toLowerCase(); [cite: 78]
    for (const groupName in sportGroups) {
        if (sportGroups[groupName].some(l => lowerLeagueName.includes(l.toLowerCase()))) {
            return groupName;
        [cite_start]} [cite: 79]
    }
    [cite_start]return 'Egyéb Meccsek'; [cite: 80]
}

function renderFixturesForDesktop(fixtures) {
    const board = document.getElementById('kanban-board');
    if (!board) return;
    document.getElementById('placeholder').style.display = 'none';
    board.innerHTML = '';

    [cite_start]const groupOrder = ['Top Ligák', 'Kiemelt Bajnokságok', 'Figyelmet Érdemlő', 'Egyéb Meccsek']; [cite: 81]
    const groupedByCategory = groupBy(fixtures, fx => getLeagueGroup(fx.league));

    [cite_start]groupOrder.forEach(group => { [cite: 82]
        let columnContent = '';
        if (groupedByCategory[group]) {
            const groupedByDate = groupBy(groupedByCategory[group], fx => new Date(fx.utcKickoff).toLocaleDateString('hu-HU', {
                timeZone: 'Europe/Budapest'
            }));
            Object.keys(groupedByDate).sort((a, b) => new Date(a.split('. ').join('.').split('.').reverse().join('-')) - new Date(b.split('. ').join('.').split('.').reverse().join('-'))).forEach(dateKey => {
                [cite_start]columnContent += `<details class="date-section" open><summary>${formatDateLabel(dateKey)}</summary>`; [cite: 83]
                groupedByDate[dateKey].forEach((fx, index) => {
                    const time = new Date(fx.utcKickoff).toLocaleTimeString('hu-HU', {
                        timeZone: 'Europe/Budapest',
                        [cite_start]hour: '2-digit', [cite: 84]
                        minute: '2-digit'
                    });
                    columnContent += `
                        <div class="match-card selectable-card ${appState.selectedMatches.has(fx.uniqueId) ? 'selected' : ''}" data-match-id="${fx.uniqueId}" style="animation-delay: ${index * 0.05}s">
                             <input type="checkbox" class="match-checkbox" data-match-id="${fx.uniqueId}" ${appState.selectedMatches.has(fx.uniqueId) ? 'checked' : ''}>
                             <div class="match-card-content" onclick="runAnalysis('${escape(fx.home)}', '${escape(fx.away)}', false)">
                                <div class="match-card-teams">${fx.home} – ${fx.away}</div>
                                <div class="match-card-meta">
                                    <span>${fx.league}</span>
                                    <span>${time}</span>
                                </div>
                             </div>
                        [cite_start]</div>`; [cite: 85, 86, 87, 88]
                });
                columnContent += `</details>`;
            });
        }
        board.innerHTML += `
            <div class="kanban-column">
                <h4 class="kanban-column-header">${group}</h4>
                <div class="column-content">${columnContent || '<p class="muted" style="text-align: center; padding-top: 2rem;">Nincs meccs ebben a kategóriában.</p>'}</div>
            [cite_start]</div>`; [cite: 89, 90]
    [cite_start]}); [cite: 91]
}

// --- TÖBBES KIJELÖLÉS SEGÉDFÜGGVÉNYEK ---
function initMultiSelect() {
    const controlsBar = document.querySelector('.controls-bar .main-actions');
    [cite_start]if (controlsBar) { [cite: 92]
        const multiSelectButton = document.createElement('button');
        multiSelectButton.id = 'multiAnalysisBtn';
        [cite_start]multiSelectButton.className = 'btn btn-special btn-lg'; [cite: 93]
        multiSelectButton.textContent = 'Kiválasztottak Elemzése (0)';
        multiSelectButton.disabled = true;
        multiSelectButton.onclick = runMultiAnalysis;
        controlsBar.appendChild(multiSelectButton);
    [cite_start]} [cite: 94]
}

function addCheckboxListeners() {
    document.querySelectorAll('.match-checkbox').forEach(cb => {
        cb.removeEventListener('change', handleCheckboxChange); // Régi listener eltávolítása
        cb.addEventListener('change', handleCheckboxChange);
    });
[cite_start]} [cite: 95]

function handleCheckboxChange(event) {
    const checkbox = event.target;
    const matchId = checkbox.dataset.matchId;
    const cardOrItem = checkbox.closest('.selectable-card, .selectable-item');

    [cite_start]if (checkbox.checked) { [cite: 96]
        if (appState.selectedMatches.size < 3) {
            appState.selectedMatches.add(matchId);
            [cite_start]cardOrItem?.classList.add('selected'); [cite: 97]
        } else {
            [cite_start]checkbox.checked = false; [cite: 98]
            showToast('Maximum 3 meccset választhatsz ki egyszerre.', 'error');
        [cite_start]} [cite: 99]
    } else {
        appState.selectedMatches.delete(matchId);
        cardOrItem?.classList.remove('selected');
    [cite_start]} [cite: 100]
    updateMultiSelectButton();
}

function updateMultiSelectButton() {
    const btn = document.getElementById('multiAnalysisBtn');
    if (!btn) return;
    [cite_start]const count = appState.selectedMatches.size; [cite: 101]
    btn.textContent = `Kiválasztottak Elemzése (${count})`;
    btn.disabled = count === 0 || count > 3;
[cite_start]} [cite: 102]

// --- ÁLTALÁNOS SEGÉDFÜGGVÉNYEK ---

function groupBy(arr, keyFn) {
    return arr.reduce((acc, item) => {
        const key = keyFn(item);
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
    }, {});
[cite_start]} [cite: 103]

function openModal(title, content = '', sizeClass = 'modal-xl') {
    const modalContainer = document.getElementById('modal-container');
    const modalContent = modalContainer.querySelector('.modal-content');
    modalContent.className = 'modal-content'; [cite_start]// Osztályok resetelése [cite: 104]
    modalContent.classList.add(sizeClass);

    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = content;
    modalContainer.classList.add('open');
[cite_start]} [cite: 105]

function closeModal() {
    document.getElementById('modal-container').classList.remove('open');
}

function formatDateLabel(dateStr) {
    const today = new Date().toLocaleDateString('hu-HU', {
        timeZone: 'Europe/Budapest'
    });
    const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('hu-HU', {
        timeZone: 'Europe/Budapest'
    [cite_start]}); [cite: 106]
    [cite_start]if (dateStr === today) return 'MA'; [cite: 107]
    if (dateStr === tomorrow) return 'HOLNAP';
    [cite_start]return dateStr; [cite: 108]
}

function addMessageToChat(text, role) {
    const messagesContainer = document.querySelector('#modal-container #chat-messages');
    if (!messagesContainer) return;
    const bubble = document.createElement('div');
    [cite_start]bubble.className = `chat-bubble ${role}`; [cite: 109]
    bubble.textContent = text;
    messagesContainer.appendChild(bubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
[cite_start]} [cite: 110]

function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-notification-container');
    const toast = document.createElement('div');
    [cite_start]toast.className = `toast-notification ${type}`; [cite: 111]
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.5s forwards';
        setTimeout(() => toast.remove(), 500);
    }, duration);
[cite_start]} [cite: 112]

// --- TÉMAVÁLTÓ ÉS VIZUÁLIS EFFEKTEK ---

function setupThemeSwitcher() {
    const themeSwitcher = document.getElementById('theme-switcher');
    const htmlEl = document.documentElement;
    [cite_start]const setIcon = (theme) => { [cite: 113]
        themeSwitcher.innerHTML = theme === 'dark' ?
            [cite_start]'<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>' : [cite: 114]
            '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
    [cite_start]}; [cite: 115]
    const currentTheme = localStorage.getItem('theme') || 'dark';
    htmlEl.className = `${currentTheme}-theme`;
    setIcon(currentTheme);
    [cite_start]themeSwitcher.addEventListener('click', () => { [cite: 116]
        let newTheme = htmlEl.className.includes('dark') ? 'light' : 'dark';
        htmlEl.className = `${newTheme}-theme`;
        localStorage.setItem('theme', newTheme);
        setIcon(newTheme);
    });
[cite_start]} [cite: 117]

function createGlowingOrbs() {
    try {
        const orbContainer = document.createElement('div');
        [cite_start]orbContainer.className = 'orb-container'; [cite: 118]
        const appContainer = document.querySelector('.app-container');
        if (!appContainer) return;
        appContainer.appendChild(orbContainer);

        [cite_start]for (let i = 0; i < 10; i++) { [cite: 119]
            const orb = document.createElement('div');
            [cite_start]orb.className = 'glowing-orb'; [cite: 120]
            const size = Math.random() * 30 + 10;
            const duration = Math.random() * 20 + 15;
            [cite_start]orb.style.width = `${size}px`; [cite: 121]
            [cite_start]orb.style.height = `${size}px`; [cite: 121]
            orb.style.setProperty('--opacity', Math.random() * 0.4 + 0.1);
            orb.style.animationDuration = `${duration}s`;
            orb.style.animationDelay = `${Math.random() * -duration}s`;
            [cite_start]orb.style.setProperty('--start-x', `${Math.random() * 120 - 10}vw`); [cite: 122]
            orb.style.setProperty('--start-y', `${Math.random() * 120 - 10}vh`);
            orb.style.setProperty('--end-x', `${Math.random() * 120 - 10}vw`);
            [cite_start]orb.style.setProperty('--end-y', `${Math.random() * 120 - 10}vh`); [cite: 123]
            orbContainer.appendChild(orb);
        }
    } catch (e) {
        [cite_start]console.error("Hiba a fénygömbök létrehozásakor:", e); [cite: 124]
    }
}

function createHeaderOrbs() {
    try {
        const orbContainer = document.createElement('div');
        [cite_start]orbContainer.className = 'orb-container-header'; [cite: 125]
        const appHeader = document.querySelector('.app-header');
        if (!appHeader) return;
        appHeader.prepend(orbContainer);

        [cite_start]for (let i = 0; i < 5; i++) { [cite: 126]
            const orb = document.createElement('div');
            [cite_start]orb.className = 'glowing-orb-orange'; [cite: 127]
            const size = Math.random() * 15 + 5;
            const duration = Math.random() * 10 + 8;
            [cite_start]orb.style.width = `${size}px`; [cite: 128]
            [cite_start]orb.style.height = `${size}px`; [cite: 128]
            orb.style.setProperty('--opacity', Math.random() * 0.5 + 0.2);
            orb.style.animationDuration = `${duration}s`;
            orb.style.animationDelay = `${Math.random() * -duration}s`;
            [cite_start]orb.style.setProperty('--start-x', `${Math.random() * 100}vw`); [cite: 129]
            orb.style.setProperty('--start-y', `${Math.random() * 80}px`);
            orb.style.setProperty('--end-x', `${Math.random() * 100}vw`);
            orb.style.setProperty('--end-y', `${Math.random() * 80}px`);
            [cite_start]orbContainer.appendChild(orb); [cite: 130]
        }
    } catch (e) {
        [cite_start]console.error("Hiba a fejléc gömbök létrehozásakor:", e); [cite: 131]
    }
}
