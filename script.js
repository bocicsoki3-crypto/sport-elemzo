// --- ALKALMAZÁS ÁLLAPOT ---
const appState = {
    gasUrl: '[https://script.google.com/macros/s/AKfycbyN99ot1yzv4Na9nq0rTIsCSQ2DUlMMCzSKQmtM8fg7qDMAaFzHW8n_2Y8eNxnsFdabvg/exec](https://script.google.com/macros/s/AKfycbyN99ot1yzv4Na9nq0rTIsCSQ2DUlMMCzSKQmtM8fg7qDMAaFzHW8n_2Y8eNxnsFdabvg/exec)', // <-- Ellenőrizd!
    fixtures: [],
    currentSport: 'soccer',
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

// --- SEGÉDFÜGGVÉNYEK ---
function isMobile() { return window.innerWidth <= 1024; }

function groupBy(arr, keyFn) {
    if (!Array.isArray(arr)) { console.error("groupBy: Input is not an array!"); return {}; }
    return arr.reduce((acc, item) => {
        try {
            const key = keyFn(item);
            if (key !== undefined && key !== null) { (acc[key] = acc[key] || []).push(item); }
            else { /* console.warn("groupBy: Invalid key generated for item:", item); */ }
        } catch (e) { console.error("Error during grouping (groupBy):", item, e); }
        return acc;
    }, {});
}

function formatDateLabel(dateStr) {
    try {
        const today = new Date(); const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
        const todayStr = today.toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' });
        const tomorrowStr = tomorrow.toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' });
        if (dateStr === todayStr) return 'MA'; if (dateStr === tomorrowStr) return 'HOLNAP';
        return dateStr;
    } catch (e) { console.error("Error formatting date label:", dateStr, e); return dateStr || "Ismeretlen Dátum"; }
}

function getLeagueGroup(leagueName) {
    const currentSport = appState.currentSport;
    if (!currentSport || !LEAGUE_CATEGORIES[currentSport]) { console.error(`getLeagueGroup Error: Invalid sport ("${currentSport}")`); return '❔ Változékony Mezőny'; }
    const sportGroups = LEAGUE_CATEGORIES[currentSport];
    if (!leagueName || typeof leagueName !== 'string') { return '❔ Változékony Mezőny'; }
    const lowerLeagueName = leagueName.toLowerCase().trim();
    for (const groupName in sportGroups) {
        if (Object.prototype.hasOwnProperty.call(sportGroups, groupName) && Array.isArray(sportGroups[groupName])) {
            try { if (sportGroups[groupName].some(l => typeof l === 'string' && lowerLeagueName.includes(l.toLowerCase()))) { return groupName; } }
            catch (e) { console.error(`getLeagueGroup Error (${groupName}): ${e}`); }
        }
    }
    if (lowerLeagueName.includes('cup') || lowerLeagueName.includes('kupa') || lowerLeagueName.includes('copa')) { return '🎲 Vad Kártyák'; }
    return '❔ Változékony Mezőny';
}

// --- INICIALIZÁLÁS ---
document.addEventListener('DOMContentLoaded', () => {
    appState.currentSport = document.getElementById('sportSelector')?.value || 'soccer';
    setupThemeSwitcher();
    if (!appState.gasUrl || !appState.gasUrl.startsWith('[https://script.google.com](https://script.google.com)')) { document.getElementById('userInfo').textContent='HIBA: GAS URL nincs beállítva!'; document.getElementById('userInfo').style.color = 'var(--danger)'; }
    else { document.getElementById('userInfo').textContent = `Csatlakozva`; }
    appState.sheetUrl = localStorage.getItem('sheetUrl');
    if (appState.sheetUrl) { document.getElementById('userInfo').textContent += ` | Napló: Beállítva`; } else { document.getElementById('userInfo').textContent += ` | Napló: Nincs beállítva`; }
    const toastContainer = document.createElement('div'); toastContainer.id = 'toast-notification-container'; toastContainer.className = 'toast-notification-container'; document.body.appendChild(toastContainer);
    const savedAnalyses = sessionStorage.getItem('completedAnalyses');
    if (savedAnalyses) { try { appState.completedAnalyses = JSON.parse(savedAnalyses); updatePortfolioButton(); } catch (e) { console.error("Portfólió betöltési hiba:", e); sessionStorage.removeItem('completedAnalyses'); } }
    const kanbanBoard = document.getElementById('kanban-board'); if(kanbanBoard) kanbanBoard.addEventListener('change', handleCheckboxChange);
    const mobileList = document.getElementById('mobile-list-container'); if(mobileList) mobileList.addEventListener('change', handleCheckboxChange);
});

// --- FŐ FUNKCIÓK ---

async function loadFixtures() {
    const loadBtn = document.getElementById('loadFixturesBtn'); if(loadBtn) { loadBtn.disabled = true; loadBtn.textContent = 'Betöltés...'; }
    const kanbanBoard = document.getElementById('kanban-board'); const mobileList = document.getElementById('mobile-list-container'); const placeholder = document.getElementById('placeholder');
    if(kanbanBoard) kanbanBoard.innerHTML = ''; if(mobileList) mobileList.innerHTML = ''; if(placeholder) { placeholder.style.display = 'flex'; placeholder.innerHTML = `<p class="muted">Meccsek betöltése...</p>`; }
    updateSummaryButtonCount();
    const sportSelector = document.getElementById('sportSelector'); const sportToLoad = sportSelector ? sportSelector.value : appState.currentSport; appState.currentSport = sportToLoad; console.log(`loadFixtures indítva: ${sportToLoad}`);
    try {
        if (!LEAGUE_CATEGORIES[sportToLoad]) { throw new Error(`Ismeretlen sportág (${sportToLoad}).`); }
        const response = await fetch(`${appState.gasUrl}?action=getFixtures&sport=${sportToLoad}&days=2`); if (!response.ok) throw new Error(`Hálózati hiba: ${response.status}`);
        const data = await response.json(); if (data.error) throw new Error(data.error);
        appState.fixtures = data.fixtures || []; sessionStorage.setItem('openingOdds', JSON.stringify(data.odds || {}));
        if (appState.fixtures.length === 0) {
            showToast(`Nincsenek ${sportToLoad} meccsek.`, 'info'); if(placeholder) { placeholder.innerHTML = `<p class="muted">Nincsenek ${sportToLoad} meccsek.</p>`; placeholder.style.display = 'flex'; }
        } else {
            if(placeholder) placeholder.style.display = 'none';
            if (isMobile()) { renderFixturesForMobileList(appState.fixtures); } else { renderFixturesForDesktop(appState.fixtures); }
        }
    } catch (e) { console.error("Hiba loadFixtures:", e); showToast(`Hiba: ${e.message}`, 'error'); if(placeholder) { placeholder.innerHTML = `<p style="color:var(--danger)">Hiba: ${e.message}</p>`; placeholder.style.display = 'flex'; } }
    finally { if(loadBtn) { loadBtn.disabled = false; loadBtn.textContent = 'Meccsek Betöltése'; } updateSummaryButtonCount(); }
}

async function runAnalysis(home, away, isSummary = false) {
    let decodedHome = home, decodedAway = away;
    try { decodedHome = decodeURIComponent(home); decodedAway = decodeURIComponent(away); }
    catch (e) { console.error("Dekódolási hiba:", e); if (!isSummary) showToast("Csapatnév hiba.", "error"); return { error: "Csapatnév hiba." }; }
    if (!isSummary) { /* ... (Modális ablak megnyitása változatlan) ... */ }
    try { /* ... (API hívás és válasz feldolgozás változatlan) ... */ }
    catch (e) { /* ... (Hibakezelés változatlan) ... */ }
}

async function summarizeSelectedFixtures() { /* ... (Változatlan) ... */ }
async function logBet(betData) { /* ... (Változatlan) ... */ }
async function openHistoryModal() { /* ... (Változatlan) ... */ }
async function deleteHistoryItem(id) { /* ... (Változatlan) ... */ }
async function buildPortfolio() { /* ... (Változatlan) ... */ }
async function runFinalCheck(home, away, sport) { /* ... (Változatlan) ... */ }

// --- UI KEZELŐ FÜGGVÉNYEK ---

function handleSportChange() { /* ... (Változatlan) ... */ }
function updatePortfolioButton(){ /* ... (Változatlan) ... */ }
function openManualAnalysisModal(){ /* ... (Változatlan) ... */ }
function runManualAnalysis(){ /* ... (Változatlan) ... */ }
function handleCheckboxChange() { updateSummaryButtonCount(); }
function updateSummaryButtonCount() { const count = document.querySelectorAll('.fixture-checkbox:checked').length; const summaryBtn = document.getElementById('summaryBtn'); if (summaryBtn) { summaryBtn.textContent = `Kiválasztottak Összegzése (${count})`; summaryBtn.disabled = count === 0; } }

// ---> JAVÍTOTT RENDER FUNCTIONS (Bombabiztos Adatkezeléssel és Onclick Javítással) <---
function renderFixturesForDesktop(fixtures) {
    const board = document.getElementById('kanban-board'); if (!board) return; board.innerHTML = '';
    const groupOrder = ['🎯 Prémium Elemzés', '📈 Stabil Ligák', '❔ Változékony Mezőny', '🎲 Vad Kártyák'];
    let groupedByCategory; try { groupedByCategory = groupBy(fixtures, fx => getLeagueGroup(fx.league)); } catch (e) { console.error("Csoportosítási hiba (desktop):", e); board.innerHTML = `<p style="color:var(--danger)">Hiba a csoportosításkor.</p>`; return; }

    groupOrder.forEach(group => {
        const column = document.createElement('div'); column.className = 'kanban-column';
        const [icon, ...titleParts] = group.split(' '); const title = titleParts.join(' ');
        let headHTML = `<h4 class="kanban-column-header">${icon} ${title}</h4>`;
        let contentHTML = '<div class="column-content">';
        const categoryFixtures = groupedByCategory ? groupedByCategory[group] : undefined;

        if (categoryFixtures?.length > 0) {
            const groupedByDate = groupBy(categoryFixtures, fx => { try { return new Date(fx.utcKickoff).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }); } catch { return "Ismeretlen Dátum"; } });
            const sortedDates = Object.keys(groupedByDate).sort((a, b)=>{ try { const dA=new Date(a.split('. ').join('.').split('.').reverse().join('-')); const dB=new Date(b.split('. ').join('.').split('.').reverse().join('-')); return dA - dB; } catch { return 0; } });

            sortedDates.forEach(dateKey => {
                contentHTML += `<details class="date-section" open><summary>${formatDateLabel(dateKey)}</summary>`;
                const sortedFixtures = groupedByDate[dateKey].sort((a, b) => new Date(a.utcKickoff) - new Date(b.utcKickoff));

                sortedFixtures.forEach((fx, index) => {
                    let displayHome = "N/A", displayAway = "N/A", displayLeague = "N/A", displayTime = "N/A";
                    let safeHome = "", safeAway = ""; // Ezek már kódoltak lesznek
                    let leagueShort = "N/A"; // <-- JAVÍTÁS: Hiányzó változó deklarálása
                    let fixtureId = `fixture-${index}-${Date.now()}`; // Egyedi ID hibakereséshez
                    let isValidFixture = false;

                    try {
                        // SZIGORÚ ELLENŐRZÉS
                        if (!fx || typeof fx.home !== 'string' || !fx.home.trim() || typeof fx.away !== 'string' || !fx.away.trim() || typeof fx.league !== 'string' || !fx.league.trim() || !fx.id) { throw new Error("Hiányzó alap adatok."); }
                        displayHome = fx.home.trim(); displayAway = fx.away.trim(); displayLeague = fx.league.trim(); fixtureId = fx.id || fixtureId;
                        if (!fx.utcKickoff) throw new Error("Hiányzó utcKickoff.");
                        const kickoffDate = new Date(fx.utcKickoff); if (isNaN(kickoffDate.getTime())) throw new Error("Érvénytelen utcKickoff.");
                        displayTime = kickoffDate.toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' });

                        // Biztonságos kódolás
                        safeHome = encodeURIComponent(displayHome);
                        safeAway = encodeURIComponent(displayAway);
                        leagueShort = displayLeague.substring(0, 25) + (displayLeague.length > 25 ? '...' : '');
                        isValidFixture = true;

                    } catch (validationError) { console.warn(`Meccs kihagyva (desktop, ${group} #${index + 1}) - Hiba: ${validationError.message}. Adat:`, JSON.stringify(fx)); }

                    if (isValidFixture) {
                        // ---> ONCLICK JAVÍTÁS: JSON.stringify használata <---
                        contentHTML += `
                            <div class="match-card" data-id="${fixtureId}">
                                <input type="checkbox" class="fixture-checkbox" data-home="${safeHome}" data-away="${safeAway}" onchange="updateSummaryButtonCount()">
                                <div class="match-content" onclick='runAnalysis(${JSON.stringify(safeHome)}, ${JSON.stringify(safeAway)})'> {/* JAVÍTÁS ITT */}
                                    <div class="match-card-teams">${displayHome} – ${displayAway}</div>
                                    <div class="match-card-meta">
                                        <span title="${displayLeague}">${leagueShort}</span>
                                        <span>${displayTime}</span>
                                    </div>
                                </div>
                            </div>`;
                        // ---> JAVÍTÁS VÉGE <---
                    }
                });
                contentHTML += `</details>`;
            });
        } else { contentHTML += '<p class="muted"...>Nincs meccs.</p>'; }
        contentHTML += '</div>'; column.innerHTML = headHTML + contentHTML; board.appendChild(column);
    });
}

function renderFixturesForMobileList(fixtures) {
    const container = document.getElementById('mobile-list-container'); if (!container) return; container.innerHTML = '';
    const groupOrder = ['🎯 Prémium Elemzés', '📈 Stabil Ligák', '❔ Változékony Mezőny', '🎲 Vad Kártyák'];
    let groupedByCategory; try { groupedByCategory = groupBy(fixtures, fx => getLeagueGroup(fx.league)); } catch (e) { console.error("Csoportosítási hiba (mobil):", e); container.innerHTML = `<p>Hiba.</p>`; return; }
    let html = ''; let hasFixtures = false;

    groupOrder.forEach(group => {
        const categoryFixtures = groupedByCategory ? groupedByCategory[group] : undefined;
        if (categoryFixtures?.length > 0) {
            hasFixtures = true; const [icon, ...titleParts] = group.split(' '); const title = titleParts.join(' ');
            html += `<h4 class="league-header-mobile">${icon} ${title}</h4>`;
            const sortedFixtures = categoryFixtures.sort((a, b) => new Date(a.utcKickoff) - new Date(b.utcKickoff));

            sortedFixtures.forEach((fx, index) => {
                let displayHome = "N/A", displayAway = "N/A", displayLeague = "N/A", displayTime = "N/A", displayDateLabel = "N/A";
                let safeHome = "", safeAway = "";
                let leagueShort = "N/A"; // <-- JAVÍTÁS: Hiányzó változó deklarálása (konzisztencia)
                let isValidFixture = false;
                let fixtureId = `fixture-mobile-${index}-${Date.now()}`;

                try {
                    // SZIGORÚ ELLENŐRZÉS
                    if (!fx || typeof fx.home !== 'string' || !fx.home.trim() || typeof fx.away !== 'string' || !fx.away.trim() || typeof fx.league !== 'string' || !fx.league.trim() || !fx.id) { throw new Error("Hiányzó alap adatok."); }
                    displayHome = fx.home.trim(); displayAway = fx.away.trim(); displayLeague = fx.league.trim(); fixtureId = fx.id || fixtureId;
                    if (!fx.utcKickoff) throw new Error("Hiányzó utcKickoff.");
                    const kickoffDate = new Date(fx.utcKickoff); if (isNaN(kickoffDate.getTime())) throw new Error("Érvénytelen utcKickoff.");
                    displayTime = kickoffDate.toLocaleTimeString('hu-HU',{timeZone:'Europe/Budapest',hour:'2-digit',minute:'2-digit'});
                    displayDateLabel = formatDateLabel(kickoffDate.toLocaleDateString('hu-HU',{timeZone:'Europe/Budapest'}));
                    safeHome = encodeURIComponent(displayHome); safeAway = encodeURIComponent(displayAway);
                    isValidFixture = true;
                } catch (validationError) { console.warn(`Meccs kihagyva (mobil, ${group} #${index + 1}) - Hiba: ${validationError.message}. Adat:`, JSON.stringify(fx)); }

                if (isValidFixture) {
                    // ---> ONCLICK JAVÍTÁS: JSON.stringify használata <---
                    html += `
                        <div class="list-item mobile" data-id="${fixtureId}">
                            <input type="checkbox" class="fixture-checkbox" data-home="${safeHome}" data-away="${safeAway}" onchange="updateSummaryButtonCount()">
                            <div class="match-content" onclick='runAnalysis(${JSON.stringify(safeHome)}, ${JSON.stringify(safeAway)})'> {/* JAVÍTÁS ITT */}
                                <div class="list-item-title">${displayHome} – ${displayAway}</div>
                                <div class="list-item-meta">${displayLeague} - ${displayDateLabel} ${displayTime}</div>
                            </div>
                             <svg xmlns="[http://www.w3.org/2000/svg](http://www.w3.org/2000/svg)" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        </div>`;
                    // ---> JAVÍTÁS VÉGE <---
                }
            });
        }
    });
    if (!hasFixtures) { container.innerHTML = '<p class="muted"...>Nincsenek meccsek.</p>'; } else { container.innerHTML = html; }
}

// --- MODAL KEZELÉS ---
function openModal(title, content = '', sizeClass = 'modal-sm') { /* ... (Változatlan) ... */ }
function closeModal() { /* ... (Változatlan) ... */ }
function openSummaryModal(title, content = '') { /* ... (Változatlan) ... */ }
function closeSummaryModal() { /* ... (Változatlan) ... */ }

// --- CHAT FUNKCIÓK ---
async function sendChatMessage() { /* ... (Változatlan) ... */ }
function addMessageToChat(text, role) { /* ... (Változatlan) ... */ }

// --- TOAST ÉRTESÍTÉSEK ---
function showToast(message, type = 'info', duration = 4000) { /* ... (Változatlan) ... */ }

// --- TÉMAVÁLTÓ ---
function setupThemeSwitcher() { /* ... (Változatlan) ... */ }

// --- MARADÉK FÜGGVÉNYEK (Teljes definíciók kellenek a működéshez) ---
function extractDataForPortfolio(html, home, away) { try { const parser = new DOMParser(); const doc = parser.parseFromString(html, 'text/html'); let bestBetCard = Array.from(doc.querySelectorAll('.summary-card h5')).find(h5 => h5.textContent.includes('Értéket Rejtő Tipp')); let isValueBet = true; if (!bestBetCard) { bestBetCard = Array.from(doc.querySelectorAll('.summary-card h5')).find(h5 => h5.textContent.includes('Legvalószínűbb kimenetel')); isValueBet = false; } if (!bestBetCard) { return null; } const card = bestBetCard.closest('.summary-card'); if (!card) return null; const bestBet = card.querySelector('.value')?.textContent?.trim(); const confidenceText = card.querySelector('.details strong')?.textContent?.trim(); if (bestBet && confidenceText) { return { match: `${home} vs ${away}`, bestBet: bestBet, confidence: confidenceText, }; } return null; } catch (e) { console.error("Hiba portfólió adatok kinyerésekor:", e); return null; } }
function renderHistory(historyData) { if (!historyData || !Array.isArray(historyData) || historyData.length === 0) { return '<p class="muted"...>Nincs előzmény.</p>'; } const history = historyData.filter(item => item?.id && item.home && item.away && item.sport && item.date); if (history.length === 0) { return '<p class="muted"...>Nincs megjeleníthető előzmény.</p>'; } const groupedByDate = groupBy(history, item => { try { return new Date(item.date).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }); } catch { return "?"; } }); let html = ''; Object.keys(groupedByDate).sort((a, b)=>{ try{ const dA=new Date(a.split('. ').join('.').split('.').reverse().join('-')); const dB=new Date(b.split('. ').join('.').split('.').reverse().join('-')); return dB - dA; } catch { return 0; } }).forEach(dateKey => { html += `<details class="date-section" open><summary>${formatDateLabel(dateKey)}</summary>`; const sortedItems = groupedByDate[dateKey].sort((a, b) => new Date(b.date) - new Date(a.date)); sortedItems.forEach(item => { let matchTime, timeDiffMinutes=NaN, time='N/A'; try{matchTime=new Date(item.date); time=matchTime.toLocaleTimeString('hu-HU',{timeZone:'Europe/Budapest',hour:'2-digit',minute:'2-digit'}); const now=new Date(); timeDiffMinutes=(matchTime-now)/(1000*60)}catch{} const isCheckable=!isNaN(timeDiffMinutes) && timeDiffMinutes<=60 && timeDiffMinutes>-120; const safeHome=encodeURIComponent(item.home); const safeAway=encodeURIComponent(item.away); const finalCheckButton=` <button class="btn btn-final-check" onclick="runFinalCheck('${safeHome}', '${safeAway}', '${item.sport}'); event.stopPropagation();" title="..." ${!isCheckable ? 'disabled' : ''}> ✔️ </button>`; html += ` <div class="list-item" data-id="${item.id}"> <div style="..." onclick="viewHistoryDetail('${item.id}')"> <div class="list-item-title">${item.home} – ${item.away}</div> <div class="list-item-meta">${item.sport.charAt(0).toUpperCase()+item.sport.slice(1)} - ${time}</div> </div> ${finalCheckButton} <button class="btn" onclick="deleteHistoryItem('${item.id}'); event.stopPropagation();" title="Törlés"> <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> </button> </div>`; }); html += `</details>`; }); return html; }
async function viewHistoryDetail(id) { if (!appState.sheetUrl) { showToast('URL szükséges.','error'); return; } const loadingHTML = document.getElementById('loading-skeleton')?.outerHTML || '<p>...</p>'; openModal('Elemzés...', loadingHTML, isMobile() ? 'modal-fullscreen' : 'modal-lg'); const modalSkeleton = document.querySelector('#modal-container #loading-skeleton'); if (modalSkeleton) modalSkeleton.classList.add('active'); try { const response = await fetch(`${appState.gasUrl}?action=getAnalysisDetail&sheetUrl=${encodeURIComponent(appState.sheetUrl)}&id=${id}`); if (!response.ok) throw new Error(`Hiba: ${response.status}`); const data = await response.json(); if (data.error) throw new Error(data.error); if (!data.record?.html) throw new Error("Hiányos adat."); const { record } = data; const modalTitleEl = document.getElementById('modal-title'); if (modalTitleEl) modalTitleEl.textContent = `${record.home||'?'} vs ${record.away||'?'}`; const modalBody = document.getElementById('modal-body'); const commonElements = document.getElementById('common-elements'); if (!modalBody || !commonElements) throw new Error("UI hiba."); modalBody.innerHTML = commonElements.innerHTML; const bodySkeleton = modalBody.querySelector('#loading-skeleton'); const bodyResults = modalBody.querySelector('#analysis-results'); const bodyChat = modalBody.querySelector('#chat-container'); const chatMessages = bodyChat?.querySelector('#chat-messages'); const chatSendBtn = bodyChat?.querySelector('#chat-send-btn'); const chatInput = bodyChat?.querySelector('#chat-input'); if (bodySkeleton) bodySkeleton.style.display = 'none'; if (bodyResults) bodyResults.innerHTML = `<div class="analysis-body">${record.html}</div>`; if (bodyChat && chatMessages && chatSendBtn && chatInput) { bodyChat.style.display = 'block'; appState.currentAnalysisContext = record.html; appState.chatHistory = []; chatMessages.innerHTML = ''; chatSendBtn.onclick = sendChatMessage; chatInput.onkeyup = (e)=>{if(e.key==="Enter") sendChatMessage();}; } else { if (bodyChat) bodyChat.style.display = 'none'; } } catch(e) { console.error("...", e); const modalBody = document.getElementById('modal-body'); if (modalBody) modalBody.innerHTML = `<p style="color:var(--danger)...">Hiba: ${e.message}</p>`; if (modalSkeleton) modalSkeleton.classList.remove('active'); const bodySkeleton = modalBody?.querySelector('#loading-skeleton'); if (bodySkeleton) bodySkeleton.style.display = 'none'; } }
