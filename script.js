// --- ALKALMAZÁS ÁLLAPOT ---
const appState = {
    gasUrl: 'https://script.google.com/macros/s/AKfycbyN99ot1yzv4Na9nq0rTIsCSQ2DUlMMCzSKQmtM8fg7qDMAaFzHW8n_2Y8eNxnsFdabvg/exec', // <-- Ellenőrizd!
    fixtures: [],
    currentSport: 'soccer', // Kezdőérték biztosan jó
    sheetUrl: '',
    currentAnalysisContext: '',
    chatHistory: [],
    completedAnalyses: [],
    analysisQueue: [],
    isAnalysisRunning: false
};

// --- LIGA KATEGÓRIÁK ---
const LEAGUE_CATEGORIES = {
    soccer: {
        '🎯 Prémium Elemzés': [ 'Champions League', 'Premier League', 'Bundesliga', 'LaLiga', 'Serie A' ],
        '📈 Stabil Ligák': [ 'Europa League', 'Ligue 1', 'Eredivisie', 'Liga Portugal' ],
        '❔ Változékony Mezőny': [ 'Championship', '2. Bundesliga', 'Serie B', 'LaLiga2', 'Super Lig', 'Premiership', 'MLS' ],
        '🎲 Vad Kártyák': [ 'FIFA World Cup', 'UEFA European Championship', 'Conference League', 'Brazil Serie A', 'Argentinian Liga Profesional', 'Greek Super League', 'Nemzetek Ligája', 'Kupa', 'Copa', 'Cup', 'World Cup Qualifier', 'European Championship', 'Nations League' ]
    },
    hockey: { '🎯 Prémium Elemzés': [ 'NHL' ], '📈 Stabil Ligák': [ 'KHL', 'SHL', 'Liiga', 'DEL', 'AHL', 'ICEHL', 'Champions Hockey League' ], '🎲 Vad Kártyák': [ 'IIHF World Championship', 'Olimpiai Játékok', 'Spengler Cup', 'Extraliga', 'World U20 Championship' ] },
    basketball: { '🎯 Prémium Elemzés': [ 'NBA', 'Euroleague' ], '📈 Stabil Ligák': [ 'Liga ACB', 'BSL', 'BBL', 'Lega A' ], '🎲 Vad Kártyák': [ 'FIBA World Cup', 'Olimpiai Játékok', 'EuroBasket', 'FIBA Champions League', 'EuroCup', 'LNB Pro A', 'WNBA' ] }
};


// --- INICIALIZÁLÁS ---
document.addEventListener('DOMContentLoaded', () => {
    // Biztosítjuk, hogy a currentSport a selectből jöjjön induláskor is
    appState.currentSport = document.getElementById('sportSelector').value || 'soccer'; // Default soccer
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

    // Eseményfigyelők
    const kanbanBoard = document.getElementById('kanban-board');
    const mobileList = document.getElementById('mobile-list-container');
    if(kanbanBoard) kanbanBoard.addEventListener('change', handleCheckboxChange);
    if(mobileList) mobileList.addEventListener('change', handleCheckboxChange);

    // Automatikus betöltés induláskor (opcionális, ha akarod)
    // loadFixtures();

});

// --- FŐ FUNKCIÓK ---

async function loadFixtures() {
    const loadBtn = document.getElementById('loadFixturesBtn');
    loadBtn.disabled = true;
    loadBtn.textContent = 'Betöltés...';
    document.getElementById('kanban-board').innerHTML = '';
    document.getElementById('mobile-list-container').innerHTML = '';
    document.getElementById('placeholder').style.display = 'flex';
    document.getElementById('placeholder').innerHTML = `<p class="muted">Meccsek betöltése...</p>`; // Loading text
    updateSummaryButtonCount();

    // ---> BIZTOSÍTÁS: Használjuk az aktuálisan beállított sportágat <---
    const sportToLoad = appState.currentSport;
    console.log(`loadFixtures indítva a következő sportággal: ${sportToLoad}`); // Debug log

    try {
        const response = await fetch(`${appState.gasUrl}?action=getFixtures&sport=${sportToLoad}&days=2`);
        if (!response.ok) throw new Error(`Hálózati hiba: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        appState.fixtures = data.fixtures || [];
        sessionStorage.setItem('openingOdds', JSON.stringify(data.odds || {}));

        if (appState.fixtures.length === 0) {
            showToast(`Nincsenek ${sportToLoad} meccsek a következő 2 napban.`, 'info');
            document.getElementById('placeholder').innerHTML = `<p class="muted">Nincsenek ${sportToLoad} meccsek a következő 2 napban.</p>`;
            document.getElementById('placeholder').style.display = 'flex';
        } else {
            document.getElementById('placeholder').style.display = 'none';
            if (isMobile()) {
                renderFixturesForMobileList(appState.fixtures);
            } else {
                renderFixturesForDesktop(appState.fixtures);
            }
        }
    } catch (e) {
        console.error("Hiba a meccsek betöltésekor:", e); // Log error to console
        showToast(`Hiba a meccsek betöltésekor: ${e.message}`, 'error');
        document.getElementById('placeholder').innerHTML = `<p style="color:var(--danger)">Hiba a meccsek betöltésekor: ${e.message}</p>`;
        document.getElementById('placeholder').style.display = 'flex';
    } finally {
        loadBtn.disabled = false;
        loadBtn.textContent = 'Meccsek Betöltése';
        updateSummaryButtonCount();
    }
}

// [runAnalysis, summarizeSelectedFixtures, logBet, openHistoryModal, deleteHistoryItem, buildPortfolio, runFinalCheck változatlan]
async function runAnalysis(home, away, isSummary = false) { /*...*/ }
async function summarizeSelectedFixtures() { /*...*/ }
async function logBet(betData) { /*...*/ }
async function openHistoryModal() { /*...*/ }
async function deleteHistoryItem(id) { /*...*/ }
async function buildPortfolio() { /*...*/ }
async function runFinalCheck(home, away, sport) { /*...*/ }


// --- UI KEZELŐ FÜGGVÉNYEK ---

function handleSportChange() {
    // Közvetlenül a select elemből olvassuk ki az értéket
    const sportSelector = document.getElementById('sportSelector');
    if (sportSelector) {
        appState.currentSport = sportSelector.value;
        console.log(`Sportág váltva: ${appState.currentSport}`); // Debug log
    } else {
        console.error("Sportválasztó elem nem található!");
        appState.currentSport = 'soccer'; // Fallback
    }

    appState.completedAnalyses = [];
    sessionStorage.removeItem('completedAnalyses');
    updatePortfolioButton();
    document.getElementById('kanban-board').innerHTML = '';
    document.getElementById('mobile-list-container').innerHTML = '';
    document.getElementById('placeholder').style.display = 'flex';
    document.getElementById('placeholder').innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20v-6M6 20v-10M18 20V4"/></svg> <h3>Válassz sportágat és töltsd be a meccseket.</h3> <p>A mérkőzések kategóriák szerint fognak megjelenni.</p>`;
    updateSummaryButtonCount();
    loadFixtures(); // Automatikus betöltés
}

function updatePortfolioButton() { /*...*/ }
function openManualAnalysisModal() { /*...*/ }
function runManualAnalysis() { /*...*/ }
function isMobile() { return window.innerWidth <= 1024; }

// ---> JAVÍTOTT getLeagueGroup <---
function getLeagueGroup(leagueName) {
    // 1. Check currentSport validity
    const currentSport = appState.currentSport;
    if (!currentSport || !LEAGUE_CATEGORIES[currentSport]) {
        console.error(`getLeagueGroup: Érvénytelen vagy hiányzó appState.currentSport: ${currentSport}`);
        return '❔ Változékony Mezőny'; // Safe default category
    }

    // 2. Check leagueName validity
    if (!leagueName || typeof leagueName !== 'string') {
        // console.warn(`getLeagueGroup: Érvénytelen leagueName: ${leagueName}`); // Reduce noise
        return '❔ Változékony Mezőny'; // Default for invalid league names
    }


    // 3. Proceed with existing logic (|| {} is still a good fallback here)
    const sportGroups = LEAGUE_CATEGORIES[currentSport] || {};
    const lowerLeagueName = leagueName.toLowerCase().trim();

    for (const groupName in sportGroups) {
        // Check if groupName is a valid key and the value is an array
        if (Object.prototype.hasOwnProperty.call(sportGroups, groupName) && Array.isArray(sportGroups[groupName])) {
            // Use try-catch for the 'some' method just in case of unexpected data
            try {
                if (sportGroups[groupName].some(l => typeof l === 'string' && lowerLeagueName.includes(l.toLowerCase()))) {
                    return groupName;
                }
            } catch (e) {
                console.error(`Hiba a liga keresésekor (${groupName}): ${e}`);
                // Continue to the next group in case of error
            }
        }
    }

    // Check for common 'Cup' or 'Kupa' variations for Wild Cards
    if (lowerLeagueName.includes('cup') || lowerLeagueName.includes('kupa') || lowerLeagueName.includes('copa')) {
        return '🎲 Vad Kártyák';
    }

    // Default category if no specific match found
    return '❔ Változékony Mezőny';
}
// ---> JAVÍTÁS VÉGE <---

function renderFixturesForDesktop(fixtures) { /*...*/ } // Marad ugyanaz, de a javított getLeagueGroup-ot használja
function renderFixturesForMobileList(fixtures) { /*...*/ } // Marad ugyanaz, de a javított getLeagueGroup-ot használja

function handleCheckboxChange() { /*...*/ }
function updateSummaryButtonCount() { /*...*/ }
function extractDataForPortfolio(html, home, away) { /*...*/ }
function renderHistory(historyData) { /*...*/ }
async function viewHistoryDetail(id) { /*...*/ }

// --- MODAL KEZELÉS ---
function openModal(title, content = '', sizeClass = 'modal-sm') { /*...*/ }
function closeModal() { /*...*/ }
function openSummaryModal(title, content = '') { /*...*/ }
function closeSummaryModal() { /*...*/ }

// --- SEGÉDFÜGGVÉNYEK ---
function groupBy(arr, keyFn) { /*...*/ }
function formatDateLabel(dateStr) { /*...*/ }

// --- CHAT FUNKCIÓK ---
async function sendChatMessage() { /*...*/ }
function addMessageToChat(text, role) { /*...*/ }

// --- TOAST ÉRTESÍTÉSEK ---
function showToast(message, type = 'info', duration = 4000) { /*...*/ }

// --- TÉMAVÁLTÓ ---
function setupThemeSwitcher() { /*...*/ }


// --- A RENDER FUNCTIONS (renderFixturesForDesktop, renderFixturesForMobileList) MARADNAK VÁLTOZATLANOK ---
// ... (Másold be ide a korábbi, checkbox-szal kiegészített renderFixturesForDesktop és renderFixturesForMobileList kódokat) ...
function renderFixturesForDesktop(fixtures) {
    const board = document.getElementById('kanban-board');
    if (!board) return;
    board.innerHTML = '';
    const groupOrder = ['🎯 Prémium Elemzés', '📈 Stabil Ligák', '❔ Változékony Mezőny', '🎲 Vad Kártyák'];
    const groupedByCategory = groupBy(fixtures, fx => getLeagueGroup(fx.league)); // Ez már a javítottat hívja

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
    const groupedByCategory = groupBy(fixtures, fx => getLeagueGroup(fx.league)); // Ez már a javítottat hívja
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
                html += `
                    <div class="list-item mobile">
                        <input type="checkbox" class="fixture-checkbox" data-home="${safeHome}" data-away="${safeAway}" onchange="updateSummaryButtonCount()">
                        <div class="match-content" onclick="runAnalysis('${safeHome}', '${safeAway}')">
                            <div class="list-item-title">${fx.home} – ${fx.away}</div>
                            <div class="list-item-meta">${fx.league} - ${dateLabel} ${time}</div>
                        </div>
                         <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </div>`;
            });
        }
    });
    if (!hasFixtures) { container.innerHTML = '<p class="muted" style="text-align:center; padding: 2rem;">Nincsenek elérhető mérkőzések.</p>'; }
    else { container.innerHTML = html; }
}
