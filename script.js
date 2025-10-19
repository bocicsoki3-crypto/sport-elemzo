// --- ALKALMAZÁS ÁLLAPOT ---
const appState = {
    gasUrl: 'https://script.google.com/macros/s/AKfycbyN99ot1yzv4Na9nq0rTIsCSQ2DUlMMCzSKQmtM8fg7qDMAaFzHW8n_2Y8eNxnsFdabvg/exec', // <-- Ellenőrizd!
    fixtures: [],
    currentSport: 'soccer',
    sheetUrl: '',
    currentAnalysisContext: '',
    chatHistory: [],
    completedAnalyses: [],
    analysisQueue: [], // Új: Tömeges elemzéshez
    isAnalysisRunning: false // Új: Tömeges elemzéshez
};

// --- LIGA KATEGÓRIÁK ---
const LEAGUE_CATEGORIES = {
    soccer: {
        '🎯 Prémium Elemzés': [ 'Champions League', 'Premier League', 'Bundesliga', 'LaLiga', 'Serie A' ],
        '📈 Stabil Ligák': [ 'Europa League', 'Ligue 1', 'Eredivisie', 'Liga Portugal' ],
        '❔ Változékony Mezőny': [ 'Championship', '2. Bundesliga', 'Serie B', 'LaLiga2', 'Super Lig', 'Premiership', 'MLS' ],
        '🎲 Vad Kártyák': [ 'FIFA World Cup', 'UEFA European Championship', 'Conference League', 'Brazil Serie A', 'Argentinian Liga Profesional', 'Greek Super League', 'Nemzetek Ligája', 'Kupa', 'Copa', 'Cup', 'World Cup Qualifier', 'European Championship', 'Nations League' ] // Kiegészítve
    },
    hockey: { '🎯 Prémium Elemzés': [ 'NHL' ], '📈 Stabil Ligák': [ 'KHL', 'SHL', 'Liiga', 'DEL', 'AHL', 'ICEHL', 'Champions Hockey League' ], '🎲 Vad Kártyák': [ 'IIHF World Championship', 'Olimpiai Játékok', 'Spengler Cup', 'Extraliga', 'World U20 Championship' ] }, // Kiegészítve
    basketball: { '🎯 Prémium Elemzés': [ 'NBA', 'Euroleague' ], '📈 Stabil Ligák': [ 'Liga ACB', 'BSL', 'BBL', 'Lega A' ], '🎲 Vad Kártyák': [ 'FIBA World Cup', 'Olimpiai Játékok', 'EuroBasket', 'FIBA Champions League', 'EuroCup', 'LNB Pro A', 'WNBA' ] } // Kiegészítve
};


// --- INICIALIZÁLÁS ---
document.addEventListener('DOMContentLoaded', () => {
    setupThemeSwitcher();

    if(!appState.gasUrl || !appState.gasUrl.startsWith('https://script.google.com')){
        document.getElementById('userInfo').textContent='HIBA: GAS URL nincs beállítva!';
        document.getElementById('userInfo').style.color = 'var(--danger)';
    } else {
        document.getElementById('userInfo').textContent=`Csatlakozva`;
    }
    appState.sheetUrl = localStorage.getItem('sheetUrl');
    if (appState.sheetUrl) {
         document.getElementById('userInfo').textContent += ` | Napló: Beállítva`;
    } else {
         document.getElementById('userInfo').textContent += ` | Napló: Nincs beállítva`;
    }

    const toastContainer = document.createElement('div');
    toastContainer.id = 'toast-notification-container';
    toastContainer.className = 'toast-notification-container';
    document.body.appendChild(toastContainer);

    const savedAnalyses = sessionStorage.getItem('completedAnalyses');
    if (savedAnalyses) {
        try {
            appState.completedAnalyses = JSON.parse(savedAnalyses);
            updatePortfolioButton();
        } catch (e) { console.error("Hiba a portfólió adatok betöltésekor:", e); sessionStorage.removeItem('completedAnalyses'); }
    }

    // Eseményfigyelő a jelölőnégyzetekhez (delegálás)
    document.getElementById('kanban-board').addEventListener('change', handleCheckboxChange);
    document.getElementById('mobile-list-container').addEventListener('change', handleCheckboxChange);

});

// --- FŐ FUNKCIÓK ---

async function loadFixtures() {
    const loadBtn = document.getElementById('loadFixturesBtn');
    loadBtn.disabled = true;
    loadBtn.textContent = 'Betöltés...';
    document.getElementById('kanban-board').innerHTML = '';
    document.getElementById('mobile-list-container').innerHTML = '';
    document.getElementById('placeholder').style.display = 'flex';
    updateSummaryButtonCount(); // Reset summary button

    try {
        const response = await fetch(`${appState.gasUrl}?action=getFixtures&sport=${appState.currentSport}&days=2`);
        if (!response.ok) throw new Error(`Hálózati hiba: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        appState.fixtures = data.fixtures || [];
        sessionStorage.setItem('openingOdds', JSON.stringify(data.odds || {}));

        if (appState.fixtures.length === 0) {
            showToast(`Nincsenek ${appState.currentSport} meccsek a következő 2 napban.`, 'info');
        } else {
            document.getElementById('placeholder').style.display = 'none';
            if (isMobile()) {
                renderFixturesForMobileList(appState.fixtures);
            } else {
                renderFixturesForDesktop(appState.fixtures);
            }
        }
    } catch (e) {
        showToast(`Hiba a meccsek betöltésekor: ${e.message}`, 'error');
        document.getElementById('placeholder').innerHTML = `<p style="color:var(--danger)">Hiba a meccsek betöltésekor: ${e.message}</p>`;
        document.getElementById('placeholder').style.display = 'flex';
    } finally {
        loadBtn.disabled = false;
        loadBtn.textContent = 'Meccsek Betöltése';
        updateSummaryButtonCount(); // Update count after loading
    }
}

async function runAnalysis(home, away, isSummary = false) { // Új paraméter: isSummary
    try {
        home = decodeURIComponent(home);
        away = decodeURIComponent(away);
    } catch (e) {
        console.error("Hiba a csapatnevek dekódolásakor:", e);
        if (!isSummary) showToast("Hiba a csapatnevek feldolgozásakor.", "error");
        return { error: "Hiba a csapatnevek feldolgozásakor." }; // Visszaadja a hibát összegzéshez
    }

    if (!isSummary) { // Csak akkor nyit modalt, ha nem összegzés részeként fut
        if (isMobile()) {
            showToast("Elemzés folyamatban... Ne váltson másik alkalmazásra.", 'info', 6000);
        }
        const commonElements = document.getElementById('common-elements');
        if (!commonElements) { showToast("Hiba: Hiányzó UI elemek.", "error"); return; }
        openModal(`${home} vs ${away}`, commonElements.innerHTML, isMobile() ? 'modal-fullscreen' : 'modal-lg');

        const modalContainer = document.getElementById('modal-container');
        if (!modalContainer) return;
        const modalSkeleton = modalContainer.querySelector('#loading-skeleton');
        const modalResults = modalContainer.querySelector('#analysis-results');
        const modalChat = modalContainer.querySelector('#chat-container');
        if (modalSkeleton) modalSkeleton.classList.add('active');
        if (modalResults) modalResults.innerHTML = '';
        if (modalChat) modalChat.style.display = 'none';

        const chatSendBtn = modalChat?.querySelector('#chat-send-btn');
        const chatInput = modalChat?.querySelector('#chat-input');
        if (chatSendBtn) chatSendBtn.onclick = sendChatMessage;
        if (chatInput) chatInput.onkeyup = (e) => { if (e.key === "Enter") sendChatMessage(); };
    }

    try {
        let analysisUrl = `${appState.gasUrl}?action=runAnalysis&home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}&sport=${appState.currentSport}&force=false`; // force=false az összegzésnél cache használatához
        if (appState.sheetUrl) { analysisUrl += `&sheetUrl=${encodeURIComponent(appState.sheetUrl)}`; }

        const openingOdds = sessionStorage.getItem('openingOdds') || '{}';
        let openingOddsData = {};
        try { openingOddsData = JSON.parse(openingOdds); } catch (e) { console.error("Hiba az openingOdds parse közben:", e); }

        const response = await fetch(analysisUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ openingOdds: openingOddsData })
        });

        if (!response.ok) throw new Error(`Szerver válasz hiba: ${response.status} ${response.statusText}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        // Összegzés esetén csak a masterRecommendation kell
        if (isSummary) {
            return {
                home: home,
                away: away,
                recommendation: data.masterRecommendation || { recommended_bet: "Hiba", final_confidence: 0, brief_reasoning: "Nem érkezett ajánlás." }
            };
        }

        // Normál elemzés esetén:
        if (!data.html || !data.masterRecommendation) throw new Error("Hiányos adatok a szerver válaszában.");

        appState.currentAnalysisContext = data.html;
        appState.chatHistory = [];

        const modalContainer = document.getElementById('modal-container');
        const modalResults = modalContainer?.querySelector('#analysis-results');
        const modalSkeleton = modalContainer?.querySelector('#loading-skeleton');
        const modalChat = modalContainer?.querySelector('#chat-container');
        const chatMessages = modalChat?.querySelector('#chat-messages');

        if (modalResults) modalResults.innerHTML = `<div class="analysis-body">${data.html}</div>`;
        if (modalSkeleton) modalSkeleton.classList.remove('active');
        if (modalChat) modalChat.style.display = 'block';
        if (chatMessages) chatMessages.innerHTML = '';

        if (data.debugInfo) console.log("Szerver Debug Info:", data.debugInfo);

        // Portfólióhoz adás (csak normál elemzésnél)
        const portfolioData = extractDataForPortfolio(data.html, home, away); // Ez most a Mester Ajánlást is figyelhetné
        if (portfolioData && !appState.completedAnalyses.some(a => a.match === portfolioData.match)) {
            if (appState.completedAnalyses.length < 3) {
                appState.completedAnalyses.push(portfolioData);
                sessionStorage.setItem('completedAnalyses', JSON.stringify(appState.completedAnalyses));
                updatePortfolioButton();
            } else { showToast("Portfólió megtelt (max 3).", "info"); }
        }

    } catch (e) {
        console.error(`Hiba az elemzés futtatása során (${home} vs ${away}):`, e);
        if (isSummary) {
            return { home: home, away: away, error: e.message }; // Hibát ad vissza összegzéshez
        } else {
            const modalContainer = document.getElementById('modal-container');
            const modalResults = modalContainer?.querySelector('#analysis-results');
            const modalSkeleton = modalContainer?.querySelector('#loading-skeleton');
            const modalChat = modalContainer?.querySelector('#chat-container');
            if (modalResults) modalResults.innerHTML = `<p style="color:var(--danger); text-align:center; padding: 2rem;">Hiba: ${e.message}</p>`;
            if (modalSkeleton) modalSkeleton.classList.remove('active');
            if (modalChat) modalChat.style.display = 'none';
        }
    }
}

// --- ÚJ FUNKCIÓ: summarizeSelectedFixtures ---
async function summarizeSelectedFixtures() {
    const checkboxes = document.querySelectorAll('.fixture-checkbox:checked');
    const selectedFixtures = [];
    checkboxes.forEach(cb => {
        selectedFixtures.push({
            home: cb.dataset.home,
            away: cb.dataset.away
        });
    });

    if (selectedFixtures.length === 0) {
        showToast("Nincsenek kiválasztott meccsek az összegzéshez.", "info");
        return;
    }

    const summaryBtn = document.getElementById('summaryBtn');
    summaryBtn.disabled = true;
    summaryBtn.textContent = `Összegzés: 0/${selectedFixtures.length}...`;

    openSummaryModal('Összegzés Folyamatban', `<div id="summary-progress"><p>Elemzések lekérése: 0 / ${selectedFixtures.length}</p><ul id="summary-results-list" class="summary-results-list"></ul></div>`);
    const resultsList = document.getElementById('summary-results-list');
    const progressText = document.querySelector('#summary-progress p');

    appState.analysisQueue = [...selectedFixtures]; // Másoljuk a listát
    appState.isAnalysisRunning = true;
    let completedCount = 0;
    const allResults = [];

    // Függvény a következő elemzés futtatásához
    const runNextAnalysis = async () => {
        if (appState.analysisQueue.length === 0) {
            appState.isAnalysisRunning = false;
            summaryBtn.disabled = false; // Re-enable button
            updateSummaryButtonCount(); // Update count based on checkboxes
            progressText.textContent = `Összegzés befejezve (${completedCount} / ${selectedFixtures.length}).`;
            // Itt lehetne véglegesíteni a modalt, pl. bezárás gomb
            return;
        }

        const fixture = appState.analysisQueue.shift(); // Vegyük a következőt
        const result = await runAnalysis(fixture.home, fixture.away, true); // Futtatás összegző módban
        completedCount++;
        allResults.push(result);

        // Eredmény megjelenítése a listában
        const listItem = document.createElement('li');
        if (result.error) {
            listItem.innerHTML = `<strong>${result.home} vs ${result.away}:</strong> <span style="color:var(--danger)">Hiba: ${result.error.substring(0, 100)}...</span>`;
        } else if (result.recommendation) {
            listItem.innerHTML = `<strong>${result.home} vs ${result.away}:</strong> 
                <span class="recommendation-pill ${result.recommendation.final_confidence >= 7 ? 'high' : result.recommendation.final_confidence >= 5 ? 'medium' : 'low'}">
                    ${result.recommendation.recommended_bet} (${result.recommendation.final_confidence.toFixed(1)}/10)
                </span> 
                <em class="muted">- ${result.recommendation.brief_reasoning}</em>`;
        }
        resultsList.appendChild(listItem);
        resultsList.scrollTop = resultsList.scrollHeight; // Görgessen az új elemhez

        // Folyamatjelző frissítése
        summaryBtn.textContent = `Összegzés: ${completedCount}/${selectedFixtures.length}...`;
        progressText.textContent = `Elemzések lekérése: ${completedCount} / ${selectedFixtures.length}`;

        // Kis késleltetés a következő hívás előtt (pl. 750ms)
        setTimeout(runNextAnalysis, 750);
    };

    // Első hívás indítása
    runNextAnalysis();
}
// --- ÚJ FUNKCIÓ VÉGE ---


// [logBet, openHistoryModal, deleteHistoryItem, buildPortfolio, runFinalCheck változatlan]
async function logBet(betData) { /*...*/ }
async function openHistoryModal() { /*...*/ }
async function deleteHistoryItem(id) { /*...*/ }
async function buildPortfolio() { /*...*/ }
async function runFinalCheck(home, away, sport) { /*...*/ }

// --- UI KEZELŐ FÜGGVÉNYEK ---

function handleSportChange() {
    appState.currentSport = document.getElementById('sportSelector').value;
    appState.completedAnalyses = [];
    sessionStorage.removeItem('completedAnalyses');
    updatePortfolioButton();
    document.getElementById('kanban-board').innerHTML = '';
    document.getElementById('mobile-list-container').innerHTML = '';
    document.getElementById('placeholder').style.display = 'flex';
    document.getElementById('placeholder').innerHTML = `...`; // Placeholder text
    updateSummaryButtonCount(); // Reset summary count on sport change
    loadFixtures(); // Automatikus betöltés sportágváltáskor
}

function updatePortfolioButton() { /*...*/ }
function openManualAnalysisModal() { /*...*/ }
function runManualAnalysis() { /*...*/ }
function isMobile() { return window.innerWidth <= 1024; }

function getLeagueGroup(leagueName) {
    if (!leagueName || typeof leagueName !== 'string') return '🎲 Vad Kártyák';
    const sportGroups = LEAGUE_CATEGORIES[appState.currentSport] || {};
    const lowerLeagueName = leagueName.toLowerCase().trim();
    for (const groupName in sportGroups) {
        if (Array.isArray(sportGroups[groupName]) && sportGroups[groupName].some(l => lowerLeagueName.includes(l.toLowerCase()))) {
             return groupName;
         }
    }
    if (lowerLeagueName.includes('cup') || lowerLeagueName.includes('kupa') || lowerLeagueName.includes('copa')) { return '🎲 Vad Kártyák'; }
    return '❔ Változékony Mezőny';
}

function renderFixturesForDesktop(fixtures) {
    const board = document.getElementById('kanban-board');
    if (!board) return;
    board.innerHTML = '';
    const groupOrder = ['🎯 Prémium Elemzés', '📈 Stabil Ligák', '❔ Változékony Mezőny', '🎲 Vad Kártyák'];
    const groupedByCategory = groupBy(fixtures, fx => getLeagueGroup(fx.league));

    groupOrder.forEach(group => {
        const column = document.createElement('div');
        column.className = 'kanban-column';
        const [icon, ...titleParts] = group.split(' ');
        const title = titleParts.join(' ');
        let columnHeaderHTML = `<h4 class="kanban-column-header">${icon} ${title}</h4>`;
        let columnContentHTML = '<div class="column-content">';
        const categoryFixtures = groupedByCategory[group];

        if (categoryFixtures && categoryFixtures.length > 0) {
            const groupedByDate = groupBy(categoryFixtures, fx => new Date(fx.utcKickoff).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }));
            const sortedDates = Object.keys(groupedByDate).sort((a, b) => new Date(a.split('. ').join('.').split('.').reverse().join('-')) - new Date(b.split('. ').join('.').split('.').reverse().join('-')));
            sortedDates.forEach(dateKey => {
                columnContentHTML += `<details class="date-section" open><summary>${formatDateLabel(dateKey)}</summary>`;
                const sortedFixtures = groupedByDate[dateKey].sort((a, b) => new Date(a.utcKickoff) - new Date(b.utcKickoff));
                sortedFixtures.forEach(fx => {
                    let time = new Date(fx.utcKickoff).toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' });
                    const safeHome = encodeURIComponent(fx.home);
                    const safeAway = encodeURIComponent(fx.away);
                    // ---> ÚJ: Checkbox hozzáadása <---
                    columnContentHTML += `
                        <div class="match-card">
                            <input type="checkbox" class="fixture-checkbox" data-home="${safeHome}" data-away="${safeAway}" onchange="updateSummaryButtonCount()">
                            <div class="match-content" onclick="runAnalysis('${safeHome}', '${safeAway}')">
                                <div class="match-card-teams">${fx.home} – ${fx.away}</div>
                                <div class="match-card-meta">
                                    <span title="${fx.league}">${fx.league.substring(0, 25)}${fx.league.length > 25 ? '...' : ''}</span>
                                    <span>${time}</span>
                                </div>
                            </div>
                        </div>`;
                     // ---> VÉGE <---
                });
                columnContentHTML += `</details>`;
            });
        } else {
            columnContentHTML += '<p class="muted" style="text-align: center; padding-top: 2rem;">Nincs meccs.</p>';
        }
        columnContentHTML += '</div>';
        column.innerHTML = columnHeaderHTML + columnContentHTML;
        board.appendChild(column);
    });
}

function renderFixturesForMobileList(fixtures) {
    const container = document.getElementById('mobile-list-container');
    if (!container) return;
    container.innerHTML = '';
    const groupOrder = ['🎯 Prémium Elemzés', '📈 Stabil Ligák', '❔ Változékony Mezőny', '🎲 Vad Kártyák'];
    const groupedByCategory = groupBy(fixtures, fx => getLeagueGroup(fx.league));
    let html = '';
    let hasFixtures = false;

    groupOrder.forEach(group => {
        const categoryFixtures = groupedByCategory[group];
        if (categoryFixtures && categoryFixtures.length > 0) {
            hasFixtures = true;
            const [icon, ...titleParts] = group.split(' ');
            const title = titleParts.join(' ');
            html += `<h4 class="league-header-mobile">${icon} ${title}</h4>`;
            const sortedFixtures = categoryFixtures.sort((a, b) => new Date(a.utcKickoff) - new Date(b.utcKickoff));
            sortedFixtures.forEach(fx => {
                 let time = new Date(fx.utcKickoff).toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' });
                 let dateLabel = formatDateLabel(new Date(fx.utcKickoff).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }));
                const safeHome = encodeURIComponent(fx.home);
                const safeAway = encodeURIComponent(fx.away);
                 // ---> ÚJ: Checkbox hozzáadása <---
                html += `
                    <div class="list-item mobile">
                        <input type="checkbox" class="fixture-checkbox" data-home="${safeHome}" data-away="${safeAway}" onchange="updateSummaryButtonCount()">
                        <div class="match-content" onclick="runAnalysis('${safeHome}', '${safeAway}')">
                            <div class="list-item-title">${fx.home} – ${fx.away}</div>
                            <div class="list-item-meta">${fx.league} - ${dateLabel} ${time}</div>
                        </div>
                         <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </div>`;
                 // ---> VÉGE <---
            });
        }
    });
    if (!hasFixtures) { container.innerHTML = '<p class="muted" style="text-align:center; padding: 2rem;">Nincsenek elérhető mérkőzések.</p>'; }
    else { container.innerHTML = html; }
}

// --- ÚJ FUNKCIÓ: updateSummaryButtonCount ---
function handleCheckboxChange() {
    updateSummaryButtonCount();
}

function updateSummaryButtonCount() {
    const count = document.querySelectorAll('.fixture-checkbox:checked').length;
    const summaryBtn = document.getElementById('summaryBtn');
    if (summaryBtn) {
        summaryBtn.textContent = `Kiválasztottak Összegzése (${count})`;
        summaryBtn.disabled = count === 0;
    }
}
// --- ÚJ FUNKCIÓ VÉGE ---


function extractDataForPortfolio(html, home, away) { /*...*/ }
function renderHistory(historyData) { /*...*/ }
async function viewHistoryDetail(id) { /*...*/ }

// --- MODAL KEZELÉS ---
// [openModal, closeModal változatlan]
function openModal(title, content = '', sizeClass = 'modal-sm') {
    const modalContainer = document.getElementById('modal-container');
    const modalContent = modalContainer?.querySelector('.modal-content');
    const modalTitleEl = document.getElementById('modal-title');
    const modalBodyEl = document.getElementById('modal-body');
    if (!modalContainer || !modalContent || !modalTitleEl || !modalBodyEl) { console.error("Hiba: Modális elemek hiányoznak."); return; }
    modalContent.className = 'modal-content'; // Reset
    modalContent.classList.add(sizeClass);
    modalTitleEl.textContent = title;
    modalBodyEl.innerHTML = content;
    modalContainer.classList.add('open');
}
function closeModal() {
    const modalContainer = document.getElementById('modal-container');
    if (modalContainer) modalContainer.classList.remove('open');
}

// --- ÚJ FUNKCIÓK: Összegző Modal kezelése ---
function openSummaryModal(title, content = '') {
    const modalContainer = document.getElementById('summary-modal-container');
    const modalTitleEl = document.getElementById('summary-modal-title');
    const modalBodyEl = document.getElementById('summary-modal-body');
     if (!modalContainer || !modalTitleEl || !modalBodyEl) { console.error("Hiba: Összegző modális elemek hiányoznak."); return; }
    modalTitleEl.textContent = title;
    modalBodyEl.innerHTML = content;
    modalContainer.classList.add('open');
}
function closeSummaryModal() {
    const modalContainer = document.getElementById('summary-modal-container');
    if (modalContainer) modalContainer.classList.remove('open');
    // Ha fut még az elemzés, esetleg meg kellene szakítani (appState.isAnalysisRunning = false;)
    appState.isAnalysisRunning = false; // Megszakítás jelzése
    appState.analysisQueue = []; // Ürítjük a várakozási sort
    const summaryBtn = document.getElementById('summaryBtn');
    if (summaryBtn && summaryBtn.textContent.includes('...')) { // Ha futott az összegzés
        summaryBtn.disabled = false;
        updateSummaryButtonCount(); // Visszaállítjuk a gombot
    }

}
// --- ÚJ FUNKCIÓK VÉGE ---

// --- SEGÉDFÜGGVÉNYEK ---
// [groupBy, formatDateLabel változatlan]
function groupBy(arr, keyFn) { /*...*/ }
function formatDateLabel(dateStr) { /*...*/ }

// --- CHAT FUNKCIÓK ---
// [sendChatMessage, addMessageToChat változatlan]
async function sendChatMessage() { /*...*/ }
function addMessageToChat(text, role) { /*...*/ }

// --- TOAST ÉRTESÍTÉSEK ---
// [showToast változatlan]
function showToast(message, type = 'info', duration = 4000) { /*...*/ }

// --- TÉMAVÁLTÓ ---
// [setupThemeSwitcher változatlan]
function setupThemeSwitcher() { /*...*/ }
