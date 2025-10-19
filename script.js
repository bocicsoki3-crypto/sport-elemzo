// --- ALKALMAZÁS ÁLLAPOT ---
const appState = {
    gasUrl: 'https://script.google.com/macros/s/AKfycbyN99ot1yzv4Na9nq0rTIsCSQ2DUlMMCzSKQmtM8fg7qDMAaFzHW8n_2Y8eNxnsFdabvg/exec', // <-- Ellenőrizd a saját URL-ed!
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
            if (key !== undefined && key !== null && key !== "") { // Üres kulcsot se engedjünk
                 (acc[key] = acc[key] || []).push(item);
            } else {
                 console.warn("groupBy: Érvénytelen vagy üres kulcs generálva:", item);
            }
        } catch (e) { console.error("Hiba a csoportosításkor (groupBy):", item, e); }
        return acc;
    }, {});
}

function formatDateLabel(dateStr) {
    try {
        // Robusztusabb dátumellenőrzés
        if (!dateStr || typeof dateStr !== 'string') return "Ismeretlen Dátum";
        const dateParts = dateStr.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./);
        if (!dateParts) return dateStr; // Ha nem a várt formátum
        const parsedDate = new Date(Date.UTC(parseInt(dateParts[1]), parseInt(dateParts[2]) - 1, parseInt(dateParts[3])));
        if (isNaN(parsedDate)) return dateStr; // Ha érvénytelen a dátum

        const today = new Date();
        const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
        // UTC dátumok összehasonlítása az időzóna problémák elkerülése végett
        const todayUTCStr = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())).toDateString();
        const tomorrowUTCStr = new Date(Date.UTC(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate())).toDateString();
        const parsedDateUTCStr = parsedDate.toDateString();

        if (parsedDateUTCStr === todayUTCStr) return 'MA';
        if (parsedDateUTCStr === tomorrowUTCStr) return 'HOLNAP';
        // Visszaadjuk az eredeti formátumot, ha nem ma vagy holnap
        return dateStr;
    } catch (e) {
        console.error("Hiba a dátum formázásakor:", dateStr, e);
        return dateStr || "Ismeretlen Dátum";
    }
}


function getLeagueGroup(leagueName) {
    const currentSport = appState.currentSport;
    if (!currentSport || !LEAGUE_CATEGORIES[currentSport]) { return '❔ Változékony Mezőny'; }
    const sportGroups = LEAGUE_CATEGORIES[currentSport];
    // Szigorúbb ellenőrzés: Csak akkor fusson, ha valid string
    if (!leagueName || typeof leagueName !== 'string') { return '❔ Változékony Mezőny'; }
    const lowerLeagueName = leagueName.toLowerCase().trim();
    if (!lowerLeagueName) return '❔ Változékony Mezőny'; // Ha csak szóköz volt

    for (const groupName in sportGroups) {
        if (Object.prototype.hasOwnProperty.call(sportGroups, groupName) && Array.isArray(sportGroups[groupName])) {
            try { if (sportGroups[groupName].some(l => typeof l === 'string' && lowerLeagueName.includes(l.toLowerCase()))) { return groupName; } }
            catch (e) { console.error(`getLeagueGroup Error (${groupName}): ${e}`); }
        }
    }
    // Kupa ellenőrzés marad
    if (lowerLeagueName.includes('cup') || lowerLeagueName.includes('kupa') || lowerLeagueName.includes('copa')) { return '🎲 Vad Kártyák'; }
    return '❔ Változékony Mezőny'; // Alapértelmezett
}


// --- INICIALIZÁLÁS ---
document.addEventListener('DOMContentLoaded', () => {
    appState.currentSport = document.getElementById('sportSelector')?.value || 'soccer';
    setupThemeSwitcher();
    if (!appState.gasUrl || !appState.gasUrl.startsWith('https://script.google.com')) {
         document.getElementById('userInfo').textContent='HIBA: GAS URL nincs beállítva!';
         document.getElementById('userInfo').style.color = 'var(--danger)';
    } else { document.getElementById('userInfo').textContent = `Csatlakozva`; }
    appState.sheetUrl = localStorage.getItem('sheetUrl');
    if (appState.sheetUrl) { document.getElementById('userInfo').textContent += ` | Napló: Beállítva`; } else { document.getElementById('userInfo').textContent += ` | Napló: Nincs beállítva`; }
    const toastContainer = document.createElement('div'); toastContainer.id = 'toast-notification-container'; toastContainer.className = 'toast-notification-container'; document.body.appendChild(toastContainer);
    const savedAnalyses = sessionStorage.getItem('completedAnalyses');
    if (savedAnalyses) { try { appState.completedAnalyses = JSON.parse(savedAnalyses); updatePortfolioButton(); } catch (e) { console.error("Portfólió betöltési hiba:", e); sessionStorage.removeItem('completedAnalyses'); } }
    // Event listener-eket csak akkor adjuk hozzá, ha az elemek léteznek
    const kanbanBoard = document.getElementById('kanban-board'); if(kanbanBoard) kanbanBoard.addEventListener('change', handleCheckboxChange);
    const mobileList = document.getElementById('mobile-list-container'); if(mobileList) mobileList.addEventListener('change', handleCheckboxChange);

    // Automatikus betöltés induláskor
    loadFixtures();
});

// --- FŐ FUNKCIÓK ---

async function loadFixtures() {
    const loadBtn = document.getElementById('loadFixturesBtn'); if(loadBtn) { loadBtn.disabled = true; loadBtn.textContent = 'Betöltés...'; }
    const kanbanBoard = document.getElementById('kanban-board'); const mobileList = document.getElementById('mobile-list-container'); const placeholder = document.getElementById('placeholder');
    // Tisztítás
    if(kanbanBoard) kanbanBoard.innerHTML = ''; if(mobileList) mobileList.innerHTML = '';
    // Placeholder mutatása
    if(placeholder) { placeholder.style.display = 'flex'; placeholder.innerHTML = `<p class="muted">Meccsek betöltése...</p>`; }
    updateSummaryButtonCount(); // Nullázza a gombot
    const sportSelector = document.getElementById('sportSelector'); const sportToLoad = sportSelector ? sportSelector.value : appState.currentSport; appState.currentSport = sportToLoad; console.log(`loadFixtures indítva: ${sportToLoad}`);
    try {
        if (!LEAGUE_CATEGORIES[sportToLoad]) { throw new Error(`Ismeretlen sportág (${sportToLoad}).`); }
        // Fetch hívás
        const response = await fetch(`${appState.gasUrl}?action=getFixtures&sport=${sportToLoad}&days=2`);
        // CORS vagy hálózati hiba ellenőrzése
        if (!response.ok) {
             // Próbáljuk meg kiolvasni a szerver hibaüzenetét, ha van
             let serverErrorMsg = `Hálózati hiba: ${response.status} ${response.statusText}`;
             try { const errorData = await response.json(); if (errorData.error) serverErrorMsg = errorData.error; } catch(e) { /* Hiba a hibaüzenet parseolásakor, marad az alap */ }
             throw new Error(serverErrorMsg);
        }
        const data = await response.json();
        // Szerver oldali üzleti logika hiba ellenőrzése
        if (data.error) throw new Error(data.error);

        appState.fixtures = data.fixtures || [];
        sessionStorage.setItem('openingOdds', JSON.stringify(data.odds || {}));
        console.log(`Betöltött meccsek száma: ${appState.fixtures.length}`); // Loggoljuk a számot

        if (appState.fixtures.length === 0) {
            showToast(`Nincsenek ${sportToLoad} meccsek a következő 2 napra.`, 'info');
            if(placeholder) { placeholder.innerHTML = `<p class="muted">Nincsenek ${sportToLoad} meccsek a következő 2 napra.</p>`; placeholder.style.display = 'flex'; }
            // Fontos: Ha nincsenek meccsek, a kanban/mobil listának üresnek kell maradnia
            if(kanbanBoard) kanbanBoard.innerHTML = '';
            if(mobileList) mobileList.innerHTML = '';
        } else {
            // Csak akkor rejtjük el a placeholdert és renderelünk, ha vannak meccsek
            if(placeholder) placeholder.style.display = 'none';
            if (isMobile()) { renderFixturesForMobileList(appState.fixtures); } else { renderFixturesForDesktop(appState.fixtures); }
        }
    } catch (e) {
        // Részletesebb hibakezelés
        console.error("Hiba loadFixtures:", e);
        showToast(`Hiba a meccsek betöltésekor: ${e.message}`, 'error');
        if(placeholder) { placeholder.innerHTML = `<p style="color:var(--danger)">Hiba a meccsek betöltésekor: ${e.message}</p>`; placeholder.style.display = 'flex'; }
        // Hiba esetén is ürítsük a táblákat
        if(kanbanBoard) kanbanBoard.innerHTML = '';
        if(mobileList) mobileList.innerHTML = '';
    }
    finally { if(loadBtn) { loadBtn.disabled = false; loadBtn.textContent = 'Meccsek Betöltése'; } updateSummaryButtonCount(); } // Gomb visszaállítása
}


async function runAnalysis(home, away, isSummary = false) {
    let decodedHome = home, decodedAway = away;
    try {
        // encodeURIComponent helyett decodeURIComponent kell itt
        decodedHome = decodeURIComponent(home);
        decodedAway = decodeURIComponent(away);
    } catch (e) {
        console.error("Dekódolási hiba:", e);
        if (!isSummary) showToast("Csapatnév hiba.", "error");
        return { error: "Csapatnév hiba." };
    }

    if (!isSummary) {
        const loadingHTML = document.getElementById('loading-skeleton')?.outerHTML || '<p>Elemzés folyamatban...</p>';
        openModal(`${decodedHome} vs ${decodedAway}`, loadingHTML, isMobile() ? 'modal-fullscreen' : 'modal-lg');
        const modalSkeleton = document.querySelector('#modal-container #loading-skeleton');
        if (modalSkeleton) modalSkeleton.classList.add('active');
    }

    try {
        const openingOdds = sessionStorage.getItem('openingOdds') || '{}';
        // --- POST Kérés Javítása ---
        const bodyPayload = {
            action: 'runAnalysis',
            sport: appState.currentSport,
            home: decodedHome, // A dekódolt nevet küldjük
            away: decodedAway, // A dekódolt nevet küldjük
            sheetUrl: appState.sheetUrl,
            openingOdds: JSON.parse(openingOdds),
            force: 'true' // Vagy amilyen paramétereket a backend vár még
        };

        const response = await fetch(appState.gasUrl, { // URL paraméterek nélkül
            method: 'POST',
            // Header: application/json kell a JSON body-hoz
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyPayload),
             // mode: 'cors' // Ez nem kell fetch-nél, a böngésző kezeli
        });
        // --- POST Kérés Javítása VÉGE ---


        if (!response.ok) {
           let serverErrorMsg = `Hálózati hiba: ${response.status} ${response.statusText}`;
           try { const errorData = await response.json(); if (errorData.error) serverErrorMsg = errorData.error; } catch(e) {}
           throw new Error(serverErrorMsg);
        }
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        if (isSummary) {
            return {
                match: `${decodedHome} vs ${decodedAway}`,
                recommendation: data.masterRecommendation?.recommended_bet || 'N/A',
                confidence: data.masterRecommendation?.final_confidence || 0,
                reasoning: data.masterRecommendation?.brief_reasoning || 'N/A'
            };
        }

        // Modális ablak tartalmának frissítése (marad ugyanaz)
        const modalBody = document.getElementById('modal-body');
        const commonElements = document.getElementById('common-elements');
        if (!modalBody || !commonElements) throw new Error("UI hiba: A modális ablak elemei nem találhatók.");

        modalBody.innerHTML = commonElements.innerHTML;
        const bodySkeleton = modalBody.querySelector('#loading-skeleton');
        const bodyResults = modalBody.querySelector('#analysis-results');
        const bodyChat = modalBody.querySelector('#chat-container');
        const chatMessages = bodyChat?.querySelector('#chat-messages');
        const chatSendBtn = bodyChat?.querySelector('#chat-send-btn');
        const chatInput = bodyChat?.querySelector('#chat-input');

        if (bodySkeleton) bodySkeleton.style.display = 'none';
        if (bodyResults) bodyResults.innerHTML = `<div class="analysis-body">${data.html}</div>`;

        if (bodyChat && chatMessages && chatSendBtn && chatInput) {
            bodyChat.style.display = 'block';
            appState.currentAnalysisContext = data.html;
            appState.chatHistory = [];
            chatMessages.innerHTML = '';
            chatSendBtn.onclick = sendChatMessage;
            chatInput.onkeyup = (e) => { if (e.key === "Enter") sendChatMessage(); };
        } else { if (bodyChat) bodyChat.style.display = 'none'; }

        // Portfólió kezelés (marad ugyanaz)
        if (data.masterRecommendation) {
             // extractDataForPortfolio most már csak a HTML-t várja
            const portfolioData = extractDataForPortfolio(data.html, decodedHome, decodedAway);
             if (portfolioData && !appState.completedAnalyses.some(a => a.match === portfolioData.match)) {
                appState.completedAnalyses.push(portfolioData);
                sessionStorage.setItem('completedAnalyses', JSON.stringify(appState.completedAnalyses));
                updatePortfolioButton();
            }
        }

    } catch (e) {
        console.error("Hiba runAnalysis:", e);
        if (isSummary) { return { error: e.message, match: `${decodedHome} vs ${decodedAway}` }; }
        const modalBody = document.getElementById('modal-body');
        if (modalBody) modalBody.innerHTML = `<p style="color:var(--danger); padding: 1.5rem;">Hiba az elemzés futtatásakor: ${e.message}</p>`;
        const modalSkeleton = document.querySelector('#modal-container #loading-skeleton');
        if (modalSkeleton) modalSkeleton.classList.remove('active');
        const bodySkeleton = modalBody?.querySelector('#loading-skeleton');
        if (bodySkeleton) bodySkeleton.style.display = 'none';
    }
}


async function summarizeSelectedFixtures() {
    const summaryBtn = document.getElementById('summaryBtn'); if (summaryBtn) summaryBtn.disabled = true;
    const checkedBoxes = document.querySelectorAll('.fixture-checkbox:checked');
    if (checkedBoxes.length === 0) { showToast("Nincs kiválasztott meccs.", "info"); if (summaryBtn) summaryBtn.disabled = false; return; }

    openSummaryModal(`Összegzés (${checkedBoxes.length} meccs)`, '<div id="summary-loading-skeleton" class="loading-skeleton active">...</div>');
    appState.analysisQueue = Array.from(checkedBoxes); appState.isAnalysisRunning = true; let results = [];

    for (const checkbox of appState.analysisQueue) { results.push(await runAnalysis(checkbox.dataset.home, checkbox.dataset.away, true)); } // home/away már kódolt

    appState.isAnalysisRunning = false; let html = '<ul class="summary-results-list">';
    results.forEach(res => {
        if (res.error) { html += `<li><strong>${res.match || '?'}</strong><br><span class="muted" style="color: var(--danger);">Hiba: ${res.error}</span></li>`; }
        else {
            let confValue = parseFloat(res.confidence); // Biztosítjuk, hogy szám
            if(isNaN(confValue)) confValue = 0;
            let pillClass = confValue >= 7 ? 'high' : confValue >= 5 ? 'medium' : 'low';
            html += `<li><strong>${res.match}</strong><br>Tipp: <strong>${res.recommendation}</strong><span class="recommendation-pill ${pillClass}">${confValue.toFixed(1)}/10</span><br><em class="muted">${res.reasoning}</em></li>`;
        }
    });
    html += '</ul>'; const summaryBody = document.getElementById('summary-modal-body'); if (summaryBody) summaryBody.innerHTML = html; if (summaryBtn) summaryBtn.disabled = false;
}

async function logBet(betData) {
    if (!appState.sheetUrl) { /* ... Sheet URL kérés ... */ return; }
    try {
        const response = await fetch(`${appState.gasUrl}?action=logBet`, { method: 'POST', body: JSON.stringify({ sheetUrl: appState.sheetUrl, bet: betData }), headers: { 'Content-Type': 'application/json' } }); // JSON header
        if (!response.ok) throw new Error(`Hiba: ${response.status}`); const data = await response.json(); if (data.error) throw new Error(data.error);
        showToast('Fogadás naplózva!', 'success'); closeModal();
    } catch (e) { console.error("Hiba logBet:", e); showToast(`Naplózási hiba: ${e.message}`, 'error'); }
}

async function openHistoryModal() {
    if (!appState.sheetUrl) { /* ... Sheet URL kérés ... */ return; }
    const loadingHTML = document.getElementById('loading-skeleton')?.outerHTML || '<p>Betöltés...</p>';
    openModal('Előzmények', loadingHTML, isMobile() ? 'modal-fullscreen' : 'modal-lg');
    const modalSkeleton = document.querySelector('#modal-container #loading-skeleton'); if (modalSkeleton) modalSkeleton.classList.add('active');
    try {
        const response = await fetch(`${appState.gasUrl}?action=getHistory&sheetUrl=${encodeURIComponent(appState.sheetUrl)}`); // GET kérés
        if (!response.ok) throw new Error(`Hiba: ${response.status}`); const data = await response.json(); if (data.error) throw new Error(data.error);
        const modalBody = document.getElementById('modal-body'); if (modalBody) modalBody.innerHTML = renderHistory(data.history);
    } catch (e) { console.error("Hiba openHistoryModal:", e); const modalBody = document.getElementById('modal-body'); if (modalBody) modalBody.innerHTML = `<p style="color:var(--danger); padding: 1.5rem;">Hiba: ${e.message}</p>`; }
}

async function deleteHistoryItem(id) {
    if (!id || !confirm("Biztosan törlöd?")) return;
    try {
        const response = await fetch(appState.gasUrl, { method: 'POST', body: JSON.stringify({ action: 'deleteHistoryItem', sheetUrl: appState.sheetUrl, id: id }), headers: { 'Content-Type': 'application/json' } }); // JSON header
        if (!response.ok) throw new Error(`Hiba: ${response.status}`); const data = await response.json(); if (data.error) throw new Error(data.error);
        showToast('Elemzés törölve.', 'success'); openHistoryModal();
    } catch (e) { console.error("Hiba deleteHistoryItem:", e); showToast(`Törlési hiba: ${e.message}`, 'error'); }
}

async function buildPortfolio() {
    const portfolioBtn = document.getElementById('portfolioBtn'); if (!portfolioBtn) return;
    portfolioBtn.disabled = true; portfolioBtn.textContent = 'Építés...';
    openModal('Napi Portfólió', '<div id="portfolio-loading-skeleton" class="loading-skeleton active">...</div>', isMobile() ? 'modal-fullscreen' : 'modal-lg');
    try {
        const response = await fetch(appState.gasUrl, { method: 'POST', body: JSON.stringify({ action: 'buildPortfolio', analyses: appState.completedAnalyses }), headers: { 'Content-Type': 'application/json' } }); // JSON header
        if (!response.ok) throw new Error(`Hiba: ${response.status}`); const data = await response.json(); if (data.error) throw new Error(data.error);
        const modalBody = document.getElementById('modal-body');
        if (modalBody) {
            const formattedReport = data.report.replace(/### (.*?)\n/g, '<h4>$1</h4>').replace(/\*\* (.*?):/g, '<strong>$1:</strong>').replace(/\n/g, '<br>');
            modalBody.innerHTML = `<div class="portfolio-report">${formattedReport}</div>`;
        }
    } catch (e) { console.error("Hiba buildPortfolio:", e); const modalBody = document.getElementById('modal-body'); if (modalBody) modalBody.innerHTML = `<p style="color:var(--danger); padding: 1.5rem;">Hiba: ${e.message}</p>`;
    } finally { portfolioBtn.disabled = false; updatePortfolioButton(); }
}

async function runFinalCheck(home, away, sport) {
    let decodedHome, decodedAway; try { decodedHome = decodeURIComponent(home); decodedAway = decodeURIComponent(away); } catch (e) { showToast("Csapatnév hiba.", "error"); return; }
    const toastId = `toast-${Date.now()}`; showToast(`Végső ellenőrzés: ${decodedHome} vs ${decodedAway}...`, 'info', 10000, toastId);
    try {
        const openingOdds = sessionStorage.getItem('openingOdds') || '{}';
        const body = { action: 'runFinalCheck', sport, home: decodedHome, away: decodedAway, openingOdds: JSON.parse(openingOdds) };
        const response = await fetch(appState.gasUrl, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }); // JSON header
        if (!response.ok) throw new Error(`Hiba: ${response.status}`); const data = await response.json(); if (data.error) throw new Error(data.error);

        const toast = document.getElementById(toastId);
        if (toast) {
            toast.className = 'toast-notification'; // Reset classes
            let msg = ''; let type = 'info';
            if (data.signal === 'GREEN') { type = 'success'; msg = `✅ ZÖLD (${decodedHome}): ${data.justification}`; }
            else if (data.signal === 'YELLOW') { type = 'info'; msg = `⚠️ SÁRGA (${decodedHome}): ${data.justification}`; }
            else { type = 'error'; msg = `🛑 PIROS (${decodedHome}): ${data.justification}`; }
            toast.classList.add(type); toast.innerHTML = msg;
            // Hosszabb időre hagyjuk kint
             if (toast.timeoutId) clearTimeout(toast.timeoutId); // Clear previous timeout if exists
             toast.timeoutId = setTimeout(() => { if (document.getElementById(toastId)) { toast.style.animation = 'fadeOut 0.5s ease forwards'; setTimeout(() => toast.remove(), 500); } }, 15000); // 15 másodperc
        }
    } catch (e) {
        console.error("Hiba runFinalCheck:", e); const toast = document.getElementById(toastId);
        if (toast) { toast.className = 'toast-notification error'; toast.innerHTML = `Ellenőrzési hiba: ${e.message}`; }
        else { showToast(`Ellenőrzési hiba: ${e.message}`, 'error'); }
         if (toast && toast.timeoutId) clearTimeout(toast.timeoutId); // Clear timeout on error too
         toast.timeoutId = setTimeout(() => { if (document.getElementById(toastId)) { toast.style.animation = 'fadeOut 0.5s ease forwards'; setTimeout(() => toast.remove(), 500); } }, 10000); // Hagyjuk kint a hibaüzenetet is
    }
}


// --- UI KEZELŐ FÜGGVÉNYEK ---

function handleSportChange() { appState.currentSport = document.getElementById('sportSelector').value; loadFixtures(); }

function updatePortfolioButton(){ const pb = document.getElementById('portfolioBtn'); if(pb){ const c = appState.completedAnalyses.length; pb.textContent = `Portfólió (${c}/3)`; pb.disabled = c < 3; } }

function openManualAnalysisModal(){
    const content = `<div class="control-group"><label for="manualHome">Hazai</label><input id="manualHome"></div><div class="control-group" style="margin-top: 1rem;"><label for="manualAway">Vendég</label><input id="manualAway"></div><button class="btn btn-primary" onclick="runManualAnalysis()" style="margin-top: 1.5rem; width: 100%;">Indítás</button>`;
    openModal('Kézi Elemzés', content, 'modal-sm');
}
function runManualAnalysis(){ const hE=document.getElementById('manualHome'); const aE=document.getElementById('manualAway'); if(hE&&aE){ const h=hE.value.trim(); const a=aE.value.trim(); if(!h||!a){showToast('Mindkét név kell.','error'); return;} closeModal(); runAnalysis(encodeURIComponent(h), encodeURIComponent(a)); } } // encodeURIComponent itt is!
function handleCheckboxChange() { updateSummaryButtonCount(); }
function updateSummaryButtonCount() { const c=document.querySelectorAll('.fixture-checkbox:checked').length; const sb=document.getElementById('summaryBtn'); if(sb){ sb.textContent = `Összegzés (${c})`; sb.disabled=c===0; } }


// ==================================================================
// ================== VÉGLEGES JAVÍTOTT RENDER FUNCTIONS ===========
// ==================================================================
function renderFixturesForDesktop(fixtures) {
    const board = document.getElementById('kanban-board'); if (!board) return; board.innerHTML = '';
    const groupOrder = ['🎯 Prémium Elemzés', '📈 Stabil Ligák', '❔ Változékony Mezőny', '🎲 Vad Kártyák'];
    let groupedByCategory; try { groupedByCategory = groupBy(fixtures, fx => getLeagueGroup(fx.league)); } catch (e) { board.innerHTML = `<p style="color:var(--danger)">Csoportosítási hiba.</p>`; return; }

    let hasAnyFixtures = false; // Flag to check if any fixtures are rendered

    groupOrder.forEach(group => {
        const column = document.createElement('div'); column.className = 'kanban-column';
        const [icon, ...titleParts] = group.split(' '); const title = titleParts.join(' ');
        let headHTML = `<h4 class="kanban-column-header">${icon} ${title}</h4>`;
        let contentHTML = '<div class="column-content">';
        const categoryFixtures = groupedByCategory[group] || []; // Üres tömb, ha nincs

        if (categoryFixtures.length > 0) {
            const groupedByDate = groupBy(categoryFixtures, fx => { try { return new Date(fx.utcKickoff).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }); } catch { return "Ismeretlen Dátum"; } });
            const sortedDates = Object.keys(groupedByDate).sort((a, b) => { try { const dA = new Date(a.split('. ').join('.').split('.').reverse().join('-')); const dB = new Date(b.split('. ').join('.').split('.').reverse().join('-')); return dA - dB; } catch { return 0; } });

            sortedDates.forEach(dateKey => {
                let dateContent = ''; // Tartalom az adott dátumhoz
                let hasFixtureForDate = false; // Flag az adott dátumhoz
                const sortedFixtures = groupedByDate[dateKey].sort((a, b) => new Date(a.utcKickoff) - new Date(b.utcKickoff));

                sortedFixtures.forEach((fx, index) => {
                    let displayHome = "", displayAway = "", displayLeague = "", displayTime = "", safeHome = "", safeAway = "", leagueShort = "";
                    let fixtureId = `fixture-${group}-${dateKey}-${index}`; // Egyedibb ID
                    let isValidFixture = false;

                    try {
                        displayHome = (fx.home && typeof fx.home === 'string') ? fx.home.trim() : "";
                        displayAway = (fx.away && typeof fx.away === 'string') ? fx.away.trim() : "";
                        displayLeague = (fx.league && typeof fx.league === 'string') ? fx.league.trim() : "";

                        if (fx && fx.id && fx.utcKickoff &&
                            displayHome.length > 0 && displayAway.length > 0 && displayLeague.length > 0)
                        {
                            fixtureId = String(fx.id);
                            const kickoffDate = new Date(fx.utcKickoff);
                            if (isNaN(kickoffDate.getTime())) throw new Error("Érvénytelen dátum.");
                            displayTime = kickoffDate.toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' });
                            safeHome = encodeURIComponent(displayHome);
                            safeAway = encodeURIComponent(displayAway);
                            leagueShort = displayLeague.substring(0, 25) + (displayLeague.length > 25 ? '...' : '');
                            isValidFixture = true;
                            hasAnyFixtures = true; // Találtunk legalább egy valid meccset
                            hasFixtureForDate = true; // Találtunk ehhez a dátumhoz
                        } else {
                             // Nem valid, de ne logoljunk hibát, csak hagyjuk ki
                             // console.warn(`Kihagyva (desktop): Hiányzó adat - ${fx?.id}`);
                        }
                    } catch (validationError) {
                        console.warn(`Meccs kihagyva (desktop hiba): ${validationError.message}. Adat:`, JSON.stringify(fx));
                    }

                    if (isValidFixture) {
                        // Csak akkor adjuk hozzá, ha valid
                        dateContent += `
                            <div class="match-card" data-id="${fixtureId}">
                                <input type="checkbox" class="fixture-checkbox" data-home="${safeHome}" data-away="${safeAway}" onchange="updateSummaryButtonCount()">
                                <div class="match-content" onclick='runAnalysis(${JSON.stringify(safeHome)}, ${JSON.stringify(safeAway)})'>
                                    <div class="match-card-teams">${displayHome} – ${displayAway}</div>
                                    <div class="match-card-meta">
                                        <span title="${displayLeague}">${leagueShort}</span>
                                        <span>${displayTime}</span>
                                    </div>
                                </div>
                            </div>`;
                    }
                }); // End sortedFixtures.forEach

                // Csak akkor adjuk hozzá a dátum szekciót, ha volt benne valid meccs
                if (hasFixtureForDate) {
                    contentHTML += `<details class="date-section" open><summary>${formatDateLabel(dateKey)}</summary>${dateContent}</details>`;
                }

            }); // End sortedDates.forEach
        }

        // Ha egyáltalán nem volt meccs ebben a kategóriában
        if (!categoryFixtures || categoryFixtures.length === 0 || !hasAnyFixtures) { // Check hasAnyFixtures flag
             // Vagy ha volt meccs, de egyik sem volt valid az adott kategórián belül (ez nem tökéletes, mert a belső ciklus flagjét kéne nézni)
             // Maradjunk az egyszerűbb ellenőrzésnél: Ha a categoryFixtures üres volt
             if(!categoryFixtures || categoryFixtures.length === 0) {
                 contentHTML += '<p class="muted">Nincs meccs ebben a kategóriában.</p>';
             }
        }


        contentHTML += '</div>'; column.innerHTML = headHTML + contentHTML; board.appendChild(column);
    }); // End groupOrder.forEach

    // Ha egyáltalán nem volt megjeleníthető meccs az összes kategóriában
    if (!hasAnyFixtures) {
        const placeholder = document.getElementById('placeholder');
        if (placeholder) {
            placeholder.innerHTML = `<p class="muted">Nem található megjeleníthető meccs a kiválasztott sportágban.</p>`;
            placeholder.style.display = 'flex';
        }
        board.innerHTML = ''; // Ürítjük a táblát is
    }
}


function renderFixturesForMobileList(fixtures) {
    const container = document.getElementById('mobile-list-container'); if (!container) return; container.innerHTML = '';
    const groupOrder = ['🎯 Prémium Elemzés', '📈 Stabil Ligák', '❔ Változékony Mezőny', '🎲 Vad Kártyák'];
    let groupedByCategory; try { groupedByCategory = groupBy(fixtures, fx => getLeagueGroup(fx.league)); } catch (e) { container.innerHTML = `<p>Csoportosítási hiba.</p>`; return; }
    let html = ''; let hasAnyFixtures = false; // Flag

    groupOrder.forEach(group => {
        const categoryFixtures = groupedByCategory[group] || [];
        let groupHtml = ''; // HTML az adott csoporthoz
        let hasFixtureInGroup = false; // Flag az adott csoporthoz

        if (categoryFixtures.length > 0) {
            const sortedFixtures = categoryFixtures.sort((a, b) => new Date(a.utcKickoff) - new Date(b.utcKickoff));
            sortedFixtures.forEach((fx, index) => {
                let displayHome = "", displayAway = "", displayLeague = "", displayTime = "", displayDateLabel = "", safeHome = "", safeAway = "";
                let fixtureId = `fixture-mobile-${group}-${index}`;
                let isValidFixture = false;

                try {
                    displayHome = (fx.home && typeof fx.home === 'string') ? fx.home.trim() : "";
                    displayAway = (fx.away && typeof fx.away === 'string') ? fx.away.trim() : "";
                    displayLeague = (fx.league && typeof fx.league === 'string') ? fx.league.trim() : "";

                    if (fx && fx.id && fx.utcKickoff &&
                        displayHome.length > 0 && displayAway.length > 0 && displayLeague.length > 0)
                    {
                        fixtureId = String(fx.id);
                        const kickoffDate = new Date(fx.utcKickoff); if (isNaN(kickoffDate.getTime())) throw new Error("Érvénytelen dátum.");
                        displayTime = kickoffDate.toLocaleTimeString('hu-HU',{timeZone:'Europe/Budapest',hour:'2-digit',minute:'2-digit'});
                        displayDateLabel = formatDateLabel(kickoffDate.toLocaleDateString('hu-HU',{timeZone:'Europe/Budapest'}));
                        safeHome = encodeURIComponent(displayHome);
                        safeAway = encodeURIComponent(displayAway);
                        isValidFixture = true;
                        hasAnyFixtures = true; // Találtunk legalább egyet
                        hasFixtureInGroup = true; // Találtunk ebben a csoportban
                    } else {
                        // Nem valid
                    }
                } catch (validationError) {
                    console.warn(`Meccs kihagyva (mobil hiba): ${validationError.message}. Adat:`, JSON.stringify(fx));
                }

                if (isValidFixture) {
                    // Hozzáadás a groupHtml-hez
                    groupHtml += `
                        <div class="list-item mobile" data-id="${fixtureId}">
                            <input type="checkbox" class="fixture-checkbox" data-home="${safeHome}" data-away="${safeAway}" onchange="updateSummaryButtonCount()">
                            <div class="match-content" onclick='runAnalysis(${JSON.stringify(safeHome)}, ${JSON.stringify(safeAway)})'>
                                <div class="list-item-title">${displayHome} – ${displayAway}</div>
                                <div class="list-item-meta">${displayLeague} - ${displayDateLabel} ${displayTime}</div>
                            </div>
                             <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        </div>`;
                }
            }); // End sortedFixtures.forEach
        }

        // Csak akkor adjuk hozzá a csoport fejlécet és tartalmat, ha volt benne valid meccs
        if (hasFixtureInGroup) {
            const [icon, ...titleParts] = group.split(' '); const title = titleParts.join(' ');
            html += `<h4 class="league-header-mobile">${icon} ${title}</h4>${groupHtml}`;
        }

    }); // End groupOrder.forEach

    // Végső ellenőrzés és megjelenítés
    if (!hasAnyFixtures) {
         container.innerHTML = '<p class="muted">Nem található megjeleníthető meccs.</p>';
         const placeholder = document.getElementById('placeholder');
         if (placeholder) {
             placeholder.innerHTML = `<p class="muted">Nem található megjeleníthető meccs.</p>`;
             placeholder.style.display = 'flex'; // Placeholder mutatása
         }
    } else {
        container.innerHTML = html;
        const placeholder = document.getElementById('placeholder');
        if (placeholder) placeholder.style.display = 'none'; // Placeholder elrejtése
    }
}
// ==================================================================
// ================== A JAVÍTOTT FUNKCIÓK VÉGE ====================
// ==================================================================


// --- MODAL KEZELÉS --- (Marad változatlan)
function openModal(title, content = '', sizeClass = 'modal-sm') { /* ... */ }
function closeModal() { /* ... */ }
function openSummaryModal(title, content = '') { /* ... */ }
function closeSummaryModal() { /* ... */ }
// --- CHAT FUNKCIÓK --- (Marad változatlan)
async function sendChatMessage() { /* ... */ }
function addMessageToChat(text, role) { /* ... */ }
// --- TOAST ÉRTESÍTÉSEK --- (Marad változatlan, de a timeout javítva a runFinalCheck-ben)
function showToast(message, type = 'info', duration = 4000, toastId = null) { /* ... */ }
// --- TÉMAVÁLTÓ --- (Marad változatlan)
function setupThemeSwitcher() { /* ... */ }
// --- ELŐZMÉNYEK ÉS PORTFÓLIÓ SEGÉDFÜGGVÉNYEK --- (Marad változatlan)
function extractDataForPortfolio(html, home, away) { /* ... */ }
function renderHistory(historyData) { /* ... */ }
async function viewHistoryDetail(id) { /* ... */ }
