// --- ALKALMAZÁS ÁLLAPOT ---
const appState = {
    gasUrl: 'https://script.google.com/macros/s/AKfycbyN99ot1yzv4Na9nq0rTIsCSQ2DUlMMCzSKQmtM8fg7qDMAaFzHW8n_2Y8eNxnsFdabvg/exec', // <-- Ellenőrizd!
    fixtures: [],
    currentSport: 'soccer', // Kezdőérték
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
    appState.currentSport = document.getElementById('sportSelector')?.value || 'soccer'; // Default soccer
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

    // Eseményfigyelők (biztonságosabb hozzáadás)
    const kanbanBoard = document.getElementById('kanban-board');
    const mobileList = document.getElementById('mobile-list-container');
    if(kanbanBoard) kanbanBoard.addEventListener('change', handleCheckboxChange);
    if(mobileList) mobileList.addEventListener('change', handleCheckboxChange);

});

// --- FŐ FUNKCIÓK ---

async function loadFixtures() {
    const loadBtn = document.getElementById('loadFixturesBtn');
    if(loadBtn) {
        loadBtn.disabled = true;
        loadBtn.textContent = 'Betöltés...';
    }
    const kanbanBoard = document.getElementById('kanban-board');
    const mobileList = document.getElementById('mobile-list-container');
    const placeholder = document.getElementById('placeholder');

    if(kanbanBoard) kanbanBoard.innerHTML = '';
    if(mobileList) mobileList.innerHTML = '';
    if(placeholder) {
        placeholder.style.display = 'flex';
        placeholder.innerHTML = `<p class="muted">Meccsek betöltése...</p>`;
    }
    updateSummaryButtonCount();

    // ---> MÓDOSÍTÁS: Explicit sportág olvasás itt <---
    const sportSelector = document.getElementById('sportSelector');
    const sportToLoad = sportSelector ? sportSelector.value : appState.currentSport; // Használja a select értékét, fallback az appState-re
    appState.currentSport = sportToLoad; // Frissítjük az appState-et is biztosan
    console.log(`loadFixtures indítva: ${sportToLoad}`); // Debug log
    // ---> MÓDOSÍTÁS VÉGE <---

    try {
        // Ellenőrizzük, hogy a sportToLoad érvényes kulcs-e a LEAGUE_CATEGORIES-ben
        if (!LEAGUE_CATEGORIES[sportToLoad]) {
             throw new Error(`Belső hiba: Ismeretlen sportág (${sportToLoad}) a kategóriákhoz.`);
        }

        const response = await fetch(`${appState.gasUrl}?action=getFixtures&sport=${sportToLoad}&days=2`);
        if (!response.ok) throw new Error(`Hálózati hiba: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        appState.fixtures = data.fixtures || [];
        sessionStorage.setItem('openingOdds', JSON.stringify(data.odds || {}));

        if (appState.fixtures.length === 0) {
            showToast(`Nincsenek ${sportToLoad} meccsek a következő 2 napban.`, 'info');
            if(placeholder) {
                placeholder.innerHTML = `<p class="muted">Nincsenek ${sportToLoad} meccsek a következő 2 napban.</p>`;
                placeholder.style.display = 'flex';
            }
        } else {
            if(placeholder) placeholder.style.display = 'none';
            // Itt hívjuk a renderelést, ami a getLeagueGroup-ot használja
            if (isMobile()) {
                renderFixturesForMobileList(appState.fixtures);
            } else {
                renderFixturesForDesktop(appState.fixtures);
            }
        }
    } catch (e) {
        console.error("Hiba a meccsek betöltésekor:", e);
        showToast(`Hiba a meccsek betöltésekor: ${e.message}`, 'error');
        if(placeholder) {
            placeholder.innerHTML = `<p style="color:var(--danger)">Hiba a meccsek betöltésekor: ${e.message}</p>`;
            placeholder.style.display = 'flex';
        }
    } finally {
        if(loadBtn) {
            loadBtn.disabled = false;
            loadBtn.textContent = 'Meccsek Betöltése';
        }
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
    const kanbanBoard = document.getElementById('kanban-board');
    const mobileList = document.getElementById('mobile-list-container');
    const placeholder = document.getElementById('placeholder');
    if(kanbanBoard) kanbanBoard.innerHTML = '';
    if(mobileList) mobileList.innerHTML = '';
    if(placeholder) {
        placeholder.style.display = 'flex';
        placeholder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20v-6M6 20v-10M18 20V4"/></svg> <h3>Válassz sportágat és töltsd be a meccseket.</h3> <p>A mérkőzések kategóriák szerint fognak megjelenni.</p>`;
    }
    updateSummaryButtonCount();
    loadFixtures(); // Automatikus betöltés
}

function updatePortfolioButton() { /*...*/ }
function openManualAnalysisModal() { /*...*/ }
function runManualAnalysis() { /*...*/ }
function isMobile() { return window.innerWidth <= 1024; }

// ---> JAVÍTOTT ÉS RÉSZLETESEBBEN NAPLÓZÓ getLeagueGroup <---
function getLeagueGroup(leagueName) {
    // 1. Olvassuk ki az aktuális sportot MINDIG frissen
    const currentSport = appState.currentSport;
    // Naplózzuk a bemenetet
    console.log(`getLeagueGroup START - Liga: "${leagueName}", Sport: "${currentSport}"`);

    // 2. Ellenőrizzük a sportág érvényességét és a kategóriák létezését
    if (!currentSport || !LEAGUE_CATEGORIES[currentSport]) {
        console.error(`getLeagueGroup HIBA: Érvénytelen sport ("${currentSport}") vagy hiányzó kategóriák! LEAGUE_CATEGORIES kulcsok: ${Object.keys(LEAGUE_CATEGORIES)}`);
        return '❔ Változékony Mezőny'; // Biztonságos alapértelmezett
    }

    // Itt már biztosan van érvényes sportGroups
    const sportGroups = LEAGUE_CATEGORIES[currentSport];
    // console.log(`getLeagueGroup: "${currentSport}" kategóriái használatban.`); // Csak ha szükséges

    // 3. Ellenőrizzük a liga nevét
    if (!leagueName || typeof leagueName !== 'string') {
        console.warn(`getLeagueGroup FIGYELMEZTETÉS: Érvénytelen vagy hiányzó liga név: "${leagueName}". Alapértelmezett kategória használata.`);
        return '❔ Változékony Mezőny';
    }
    const lowerLeagueName = leagueName.toLowerCase().trim();

    // 4. Keressük a kategóriát
    for (const groupName in sportGroups) {
        // Ellenőrizzük, hogy a groupName valóban a sportGroups saját tulajdonsága-e, és hogy a hozzá tartozó érték tömb-e
        if (Object.prototype.hasOwnProperty.call(sportGroups, groupName) && Array.isArray(sportGroups[groupName])) {
            // console.log(`  -> Ellenőrzés: "${groupName}"`); // Csak ha szükséges
            try {
                // Biztonságos ellenőrzés a 'some' metódussal
                if (sportGroups[groupName].some(l => typeof l === 'string' && lowerLeagueName.includes(l.toLowerCase()))) {
                    console.log(`getLeagueGroup TALÁLAT - Liga: "${leagueName}" -> Kategória: "${groupName}"`);
                    return groupName; // Találat!
                }
            } catch (e) {
                console.error(`getLeagueGroup HIBA a liga (${lowerLeagueName}) keresése közben a "${groupName}" kategóriában: ${e}`);
                // Hiba esetén megyünk tovább a következő kategóriára
            }
        } else {
             console.warn(`getLeagueGroup FIGYELMEZTETÉS: Hibás struktúra a LEAGUE_CATEGORIES alatt: "${currentSport}" -> "${groupName}" nem tömb.`);
        }
    }

    // 5. Kupa ellenőrzés (ha nem volt specifikus találat)
    // console.log(`getLeagueGroup: Nincs specifikus találat "${lowerLeagueName}"-re, kupa ellenőrzése...`); // Csak ha szükséges
    if (lowerLeagueName.includes('cup') || lowerLeagueName.includes('kupa') || lowerLeagueName.includes('copa')) {
        console.log(`getLeagueGroup TALÁLAT (Kupa) - Liga: "${leagueName}" -> Kategória: "🎲 Vad Kártyák"`);
        return '🎲 Vad Kártyák';
    }

    // 6. Végső alapértelmezett
    console.log(`getLeagueGroup ALAPÉRTELMEZETT - Liga: "${leagueName}" -> Kategória: "❔ Változékony Mezőny"`);
    return '❔ Változékony Mezőny';
}
// ---> JAVÍTÁS VÉGE <---

function renderFixturesForDesktop(fixtures) {
    const board = document.getElementById('kanban-board');
    if (!board) return;
    board.innerHTML = '';
    const groupOrder = ['🎯 Prémium Elemzés', '📈 Stabil Ligák', '❔ Változékony Mezőny', '🎲 Vad Kártyák'];

    // ---> MÓDOSÍTÁS: Hibakezelés a groupBy körül <---
    let groupedByCategory;
    try {
        groupedByCategory = groupBy(fixtures, fx => getLeagueGroup(fx.league)); // getLeagueGroup már naplóz
    } catch (e) {
        console.error("Hiba a meccsek kategóriákba csoportosításakor:", e);
        showToast("Hiba a meccsek csoportosításakor. Ellenőrizd a konzolt.", "error");
        board.innerHTML = `<p style="color:var(--danger)">Hiba a meccsek csoportosításakor.</p>`;
        return; // Ne folytassuk a renderelést hiba esetén
    }
    // ---> MÓDOSÍTÁS VÉGE <---


    groupOrder.forEach(group => {
        const column = document.createElement('div');
        column.className = 'kanban-column';
        const [icon, ...titleParts] = group.split(' ');
        const title = titleParts.join(' ');
        let columnHeaderHTML = `<h4 class="kanban-column-header">${icon} ${title}</h4>`;
        let columnContentHTML = '<div class="column-content">';
        // ---> MÓDOSÍTÁS: Biztonságos hozzáférés a groupedByCategory-hez <---
        const categoryFixtures = groupedByCategory ? groupedByCategory[group] : undefined; // Biztonságos hozzáférés
        // ---> MÓDOSÍTÁS VÉGE <---

        if (categoryFixtures && categoryFixtures.length > 0) {
            // ... (A dátum szerinti csoportosítás és renderelés logikája változatlan) ...
             const groupedByDate = groupBy(categoryFixtures, fx => { try { return new Date(fx.utcKickoff).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }); } catch { return "Ismeretlen Dátum"; } });
            const sortedDates = Object.keys(groupedByDate).sort((a, b) => { try { const dateA = new Date(a.split('. ').join('.').split('.').reverse().join('-')); const dateB = new Date(b.split('. ').join('.').split('.').reverse().join('-')); return dateA - dateB; } catch { return 0; } });
            sortedDates.forEach(dateKey => {
                columnContentHTML += `<details class="date-section" open><summary>${formatDateLabel(dateKey)}</summary>`;
                const sortedFixtures = groupedByDate[dateKey].sort((a, b) => new Date(a.utcKickoff) - new Date(b.utcKickoff));
                sortedFixtures.forEach(fx => {
                    let time = 'N/A'; try { time = new Date(fx.utcKickoff).toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' }); } catch {}
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
    // ---> MÓDOSÍTÁS: Hibakezelés a groupBy körül <---
    let groupedByCategory;
     try {
         groupedByCategory = groupBy(fixtures, fx => getLeagueGroup(fx.league));
     } catch (e) {
        console.error("Hiba a meccsek kategóriákba csoportosításakor (mobil):", e);
        showToast("Hiba a meccsek csoportosításakor. Ellenőrizd a konzolt.", "error");
        container.innerHTML = `<p style="color:var(--danger)">Hiba a meccsek csoportosításakor.</p>`;
        return;
     }
    // ---> MÓDOSÍTÁS VÉGE <---
    let html = '';
    let hasFixtures = false;

    groupOrder.forEach(group => {
        // ---> MÓDOSÍTÁS: Biztonságos hozzáférés <---
        const categoryFixtures = groupedByCategory ? groupedByCategory[group] : undefined;
        // ---> MÓDOSÍTÁS VÉGE <---
        if (categoryFixtures && categoryFixtures.length > 0) {
            hasFixtures = true;
            const [icon, ...titleParts] = group.split(' ');
            const title = titleParts.join(' ');
            html += `<h4 class="league-header-mobile">${icon} ${title}</h4>`;
            const sortedFixtures = categoryFixtures.sort((a, b) => new Date(a.utcKickoff) - new Date(b.utcKickoff));
            sortedFixtures.forEach(fx => {
                 let time = 'N/A', dateLabel = 'N/A';
                 try { const kickoffDate = new Date(fx.utcKickoff); time = kickoffDate.toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' }); dateLabel = formatDateLabel(kickoffDate.toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' })); } catch {}
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


function handleCheckboxChange() { updateSummaryButtonCount(); }
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


// --- BIZTOSÍTSUK, HOGY A FÜGGVÉNYEK LÉTEZNEK (CSAK A TELJESSÉG KEDVÉÉRT) ---
// (Ezeknek a függvényeknek a definíciói a korábbi kódrészletekből származnak,
// csak ide másoljuk őket, hogy biztosan meglegyenek ebben a fájlban.)

function updatePortfolioButton() {
    const btn = document.getElementById('portfolioBtn');
    if (!btn) return;
    const count = appState.completedAnalyses.length;
    btn.textContent = `Portfólió Építése (${count}/3)`;
    btn.disabled = count < 3;
}
function openManualAnalysisModal() {
    let content = ` <p class="muted" style="margin-bottom: 1.5rem;">Add meg a csapatneveket pontosan...</p> <div class="control-group"> <label for="manual-home">Hazai csapat</label> <input id="manual-home" placeholder="Pl. Liverpool"/> </div> <div class="control-group" style="margin-top: 1rem;"> <label for="manual-away">Vendég csapat</label> <input id="manual-away" placeholder="Pl. Manchester City"/> </div> <button class="btn btn-primary" onclick="runManualAnalysis()" style="width:100%; margin-top:1.5rem;">Elemzés Futtatása</button> `;
    openModal('Kézi Elemzés Indítása', content, 'modal-sm');
}
function runManualAnalysis() {
    const homeInput = document.getElementById('manual-home');
    const awayInput = document.getElementById('manual-away');
    const home = homeInput?.value?.trim();
    const away = awayInput?.value?.trim();
    if (!home || !away) { showToast('Mindkét csapat nevét meg kell adni.', 'error'); return; }
    closeModal();
    runAnalysis(home, away);
}
function groupBy(arr, keyFn) { if (!Array.isArray(arr)) return {}; return arr.reduce((acc, item) => { try { const key = keyFn(item); if (key === undefined || key === null) return acc; (acc[key] = acc[key] || []).push(item); } catch (e) { console.error("Hiba a csoportosítás során:", item, e); } return acc; }, {}); }
function formatDateLabel(dateStr) { try { const today = new Date(); const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1); const todayStr = today.toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }); const tomorrowStr = tomorrow.toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }); if (dateStr === todayStr) return 'MA'; if (dateStr === tomorrowStr) return 'HOLNAP'; return dateStr; } catch (e) { console.error("Hiba a dátumcímke formázásakor:", dateStr, e); return dateStr || "Ismeretlen Dátum"; } }
async function sendChatMessage() { /* ... (teljes kód innen) ... */ }
function addMessageToChat(text, role) { /* ... (teljes kód innen) ... */ }
function showToast(message, type = 'info', duration = 4000) { /* ... (teljes kód innen) ... */ }
function setupThemeSwitcher() { /* ... (teljes kód innen) ... */ }
function extractDataForPortfolio(html, home, away) { try { const parser = new DOMParser(); const doc = parser.parseFromString(html, 'text/html'); let bestBetCard = Array.from(doc.querySelectorAll('.summary-card h5')).find(h5 => h5.textContent.includes('Értéket Rejtő Tipp')); let isValueBet = true; if (!bestBetCard) { bestBetCard = Array.from(doc.querySelectorAll('.summary-card h5')).find(h5 => h5.textContent.includes('Legvalószínűbb kimenetel')); isValueBet = false; } if (!bestBetCard) { return null; } const card = bestBetCard.closest('.summary-card'); if (!card) return null; const bestBet = card.querySelector('.value')?.textContent?.trim(); const confidenceText = card.querySelector('.details strong')?.textContent?.trim(); if (bestBet && confidenceText) { return { match: `${home} vs ${away}`, bestBet: bestBet, confidence: confidenceText, }; } return null; } catch (e) { console.error("Hiba portfólió adatok kinyerésekor:", e); return null; } }
function renderHistory(historyData) { if (!historyData || !Array.isArray(historyData) || historyData.length === 0) { return '<p class="muted" style="text-align:center; padding: 2rem;">Nincsenek mentett előzmények.</p>'; } const history = historyData.filter(item => item && item.id && item.home && item.away && item.sport && item.date); if (history.length === 0) { return '<p class="muted" style="text-align:center; padding: 2rem;">Nincsenek megjeleníthető előzmények.</p>'; } const groupedByDate = groupBy(history, item => { try { return new Date(item.date).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }); } catch { return "Ismeretlen Dátum"; } }); let html = ''; Object.keys(groupedByDate).sort((a, b) => { try { const dateA = new Date(a.split('. ').join('.').split('.').reverse().join('-')); const dateB = new Date(b.split('. ').join('.').split('.').reverse().join('-')); return dateB - dateA; } catch { return 0; } }).forEach(dateKey => { html += `<details class="date-section" open><summary>${formatDateLabel(dateKey)}</summary>`; const sortedItems = groupedByDate[dateKey].sort((a, b) => new Date(b.date) - new Date(a.date)); sortedItems.forEach(item => { let matchTime, timeDiffMinutes = NaN, time = 'N/A'; try { matchTime = new Date(item.date); time = matchTime.toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' }); const now = new Date(); timeDiffMinutes = (matchTime - now) / (1000 * 60); } catch {} const isCheckable = !isNaN(timeDiffMinutes) && timeDiffMinutes <= 60 && timeDiffMinutes > -120; const safeHome = encodeURIComponent(item.home); const safeAway = encodeURIComponent(item.away); const finalCheckButton = ` <button class="btn btn-final-check" onclick="runFinalCheck('${safeHome}', '${safeAway}', '${item.sport}'); event.stopPropagation();" title="Végső Ellenőrzés..." ${!isCheckable ? 'disabled' : ''}> ✔️ </button>`; html += ` <div class="list-item" data-id="${item.id}"> <div style="flex-grow:1; cursor: pointer;" onclick="viewHistoryDetail('${item.id}')"> <div class="list-item-title">${item.home} – ${item.away}</div> <div class="list-item-meta">${item.sport.charAt(0).toUpperCase() + item.sport.slice(1)} - ${time}</div> </div> ${finalCheckButton} <button class="btn" onclick="deleteHistoryItem('${item.id}'); event.stopPropagation();" title="Törlés"> <svg ...>...</svg> </button> </div>`; }); html += `</details>`; }); return html; }
async function viewHistoryDetail(id) { if (!appState.sheetUrl) { showToast('...', 'error'); return; } const loadingHTML = document.getElementById('loading-skeleton')?.outerHTML || '<p>Betöltés...</p>'; openModal('Elemzés Betöltése...', loadingHTML, isMobile() ? 'modal-fullscreen' : 'modal-lg'); const modalSkeleton = document.querySelector('#modal-container #loading-skeleton'); if (modalSkeleton) modalSkeleton.classList.add('active'); try { const response = await fetch(`${appState.gasUrl}?action=getAnalysisDetail&sheetUrl=${encodeURIComponent(appState.sheetUrl)}&id=${id}`); if (!response.ok) throw new Error(`Hálózati hiba: ${response.status}`); const data = await response.json(); if (data.error) throw new Error(data.error); if (!data.record?.html) throw new Error("Hiányos adat."); const { record } = data; const modalTitleEl = document.getElementById('modal-title'); if (modalTitleEl) modalTitleEl.textContent = `${record.home || '?'} vs ${record.away || '?'}`; const modalBody = document.getElementById('modal-body'); const commonElements = document.getElementById('common-elements'); if (!modalBody || !commonElements) throw new Error("Hiányzó UI elemek."); modalBody.innerHTML = commonElements.innerHTML; const bodySkeleton = modalBody.querySelector('#loading-skeleton'); const bodyResults = modalBody.querySelector('#analysis-results'); const bodyChat = modalBody.querySelector('#chat-container'); const chatMessages = bodyChat?.querySelector('#chat-messages'); const chatSendBtn = bodyChat?.querySelector('#chat-send-btn'); const chatInput = bodyChat?.querySelector('#chat-input'); if (bodySkeleton) bodySkeleton.style.display = 'none'; if (bodyResults) bodyResults.innerHTML = `<div class="analysis-body">${record.html}</div>`; if (bodyChat && chatMessages && chatSendBtn && chatInput) { bodyChat.style.display = 'block'; appState.currentAnalysisContext = record.html; appState.chatHistory = []; chatMessages.innerHTML = ''; chatSendBtn.onclick = sendChatMessage; chatInput.onkeyup = (e) => { if (e.key === "Enter") sendChatMessage(); }; } else { if (bodyChat) bodyChat.style.display = 'none'; } } catch(e) { console.error("...", e); const modalBody = document.getElementById('modal-body'); if (modalBody) modalBody.innerHTML = `<p style="color:var(--danger); ...">Hiba: ${e.message}</p>`; if (modalSkeleton) modalSkeleton.classList.remove('active'); const bodySkeleton = modalBody?.querySelector('#loading-skeleton'); if (bodySkeleton) bodySkeleton.style.display = 'none'; } }
