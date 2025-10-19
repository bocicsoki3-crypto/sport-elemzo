// --- ALKALMAZÁS ÁLLAPOT ---
const appState = {
    gasUrl: 'https://script.google.com/macros/s/AKfycbyN99ot1yzv4Na9nq0rTIsCSQ2DUlMMCzSKQmtM8fg7qDMAaFzHW8n_2Y8eNxnsFdabvg/exec', // <-- Ellenőrizd, hogy ez a te URL-ed!
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

// ---> Segédfüggvények definíciói ide kerültek az elejére <---
// --- SEGÉDFÜGGVÉNYEK ---
function isMobile() { return window.innerWidth <= 1024; }

function groupBy(arr, keyFn) {
    if (!Array.isArray(arr)) {
        console.error("groupBy: A bemenet nem tömb!");
        return {};
     }
    return arr.reduce((acc, item) => {
        try {
            const key = keyFn(item);
            // Csak akkor adjuk hozzá, ha a kulcs érvényes (nem undefined/null)
            if (key !== undefined && key !== null) {
                (acc[key] = acc[key] || []).push(item);
            } else {
                 console.warn("groupBy: Érvénytelen kulcs generálva egy elemhez:", item);
            }
        } catch (e) {
            console.error("Hiba a csoportosítás során (groupBy):", item, e);
        }
        return acc;
    }, {});
}

function formatDateLabel(dateStr) {
    // Input dateStr is expected as 'YYYY. MM. DD.' from toLocaleDateString
    try {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        // Format today and tomorrow consistently for comparison
        const todayStr = today.toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' });
        const tomorrowStr = tomorrow.toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' });

        if (dateStr === todayStr) return 'MA';
        if (dateStr === tomorrowStr) return 'HOLNAP';

        return dateStr; // Return original formatted date string
    } catch (e) {
        console.error("Hiba a dátumcímke formázásakor:", dateStr, e);
        return dateStr || "Ismeretlen Dátum"; // Fallback
    }
}

function getLeagueGroup(leagueName) {
    // 1. Olvassuk ki az aktuális sportot MINDIG frissen
    const currentSport = appState.currentSport;
    // Naplózzuk a bemenetet
    // console.log(`getLeagueGroup START - Liga: "${leagueName}", Sport: "${currentSport}"`); // Csökkentett naplózás

    // 2. Ellenőrizzük a sportág érvényességét és a kategóriák létezését
    if (!currentSport || !LEAGUE_CATEGORIES[currentSport]) {
        console.error(`getLeagueGroup HIBA: Érvénytelen sport ("${currentSport}") vagy hiányzó kategóriák!`);
        return '❔ Változékony Mezőny'; // Biztonságos alapértelmezett
    }

    // Itt már biztosan van érvényes sportGroups
    const sportGroups = LEAGUE_CATEGORIES[currentSport];

    // 3. Ellenőrizzük a liga nevét
    if (!leagueName || typeof leagueName !== 'string') {
        // console.warn(`getLeagueGroup FIGYELMEZTETÉS: Érvénytelen liga név: "${leagueName}".`); // Csökkentett naplózás
        return '❔ Változékony Mezőny';
    }
    const lowerLeagueName = leagueName.toLowerCase().trim();

    // 4. Keressük a kategóriát
    for (const groupName in sportGroups) {
        if (Object.prototype.hasOwnProperty.call(sportGroups, groupName) && Array.isArray(sportGroups[groupName])) {
            try {
                if (sportGroups[groupName].some(l => typeof l === 'string' && lowerLeagueName.includes(l.toLowerCase()))) {
                    // console.log(`getLeagueGroup TALÁLAT - Liga: "${leagueName}" -> Kategória: "${groupName}"`); // Csökkentett naplózás
                    return groupName; // Találat!
                }
            } catch (e) {
                console.error(`getLeagueGroup HIBA a liga (${lowerLeagueName}) keresése közben a "${groupName}" kategóriában: ${e}`);
            }
        } else {
             console.warn(`getLeagueGroup FIGYELMEZTETÉS: Hibás struktúra a LEAGUE_CATEGORIES alatt: "${currentSport}" -> "${groupName}"`);
        }
    }

    // 5. Kupa ellenőrzés
    if (lowerLeagueName.includes('cup') || lowerLeagueName.includes('kupa') || lowerLeagueName.includes('copa')) {
        // console.log(`getLeagueGroup TALÁLAT (Kupa) -> "🎲 Vad Kártyák"`); // Csökkentett naplózás
        return '🎲 Vad Kártyák';
    }

    // 6. Végső alapértelmezett
    // console.log(`getLeagueGroup ALAPÉRTELMEZETT -> "❔ Változékony Mezőny"`); // Csökkentett naplózás
    return '❔ Változékony Mezőny';
}
// ---> Segédfüggvények definícióinak vége <---


// --- INICIALIZÁLÁS ---
document.addEventListener('DOMContentLoaded', () => {
    appState.currentSport = document.getElementById('sportSelector')?.value || 'soccer';
    setupThemeSwitcher(); // Most már a segédfüggvény definíciója felett van

    if(!appState.gasUrl || !appState.gasUrl.startsWith('https://script.google.com')){
         document.getElementById('userInfo').textContent='HIBA: GAS URL nincs beállítva!';
         document.getElementById('userInfo').style.color = 'var(--danger)';
    } else { document.getElementById('userInfo').textContent=`Csatlakozva`; }

    appState.sheetUrl = localStorage.getItem('sheetUrl');
    if (appState.sheetUrl) { document.getElementById('userInfo').textContent += ` | Napló: Beállítva`; }
    else { document.getElementById('userInfo').textContent += ` | Napló: Nincs beállítva`; }

    const toastContainer = document.createElement('div');
    toastContainer.id = 'toast-notification-container';
    toastContainer.className = 'toast-notification-container';
    document.body.appendChild(toastContainer);

    const savedAnalyses = sessionStorage.getItem('completedAnalyses');
    if (savedAnalyses) {
        try { appState.completedAnalyses = JSON.parse(savedAnalyses); updatePortfolioButton(); }
        catch (e) { console.error("Portfólió betöltési hiba:", e); sessionStorage.removeItem('completedAnalyses'); }
    }

    const kanbanBoard = document.getElementById('kanban-board');
    const mobileList = document.getElementById('mobile-list-container');
    if(kanbanBoard) kanbanBoard.addEventListener('change', handleCheckboxChange);
    if(mobileList) mobileList.addEventListener('change', handleCheckboxChange);

    // loadFixtures(); // Opcionális automatikus betöltés
});

// --- FŐ FUNKCIÓK ---

async function loadFixtures() {
    const loadBtn = document.getElementById('loadFixturesBtn');
    if(loadBtn) { loadBtn.disabled = true; loadBtn.textContent = 'Betöltés...'; }
    const kanbanBoard = document.getElementById('kanban-board');
    const mobileList = document.getElementById('mobile-list-container');
    const placeholder = document.getElementById('placeholder');
    if(kanbanBoard) kanbanBoard.innerHTML = '';
    if(mobileList) mobileList.innerHTML = '';
    if(placeholder) { placeholder.style.display = 'flex'; placeholder.innerHTML = `<p class="muted">Meccsek betöltése...</p>`; }
    updateSummaryButtonCount();

    const sportSelector = document.getElementById('sportSelector');
    const sportToLoad = sportSelector ? sportSelector.value : appState.currentSport;
    appState.currentSport = sportToLoad;
    console.log(`loadFixtures indítva: ${sportToLoad}`);

    try {
        if (!LEAGUE_CATEGORIES[sportToLoad]) { throw new Error(`Ismeretlen sportág (${sportToLoad}).`); }

        const response = await fetch(`${appState.gasUrl}?action=getFixtures&sport=${sportToLoad}&days=2`);
        if (!response.ok) throw new Error(`Hálózati hiba: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        appState.fixtures = data.fixtures || [];
        sessionStorage.setItem('openingOdds', JSON.stringify(data.odds || {}));

        if (appState.fixtures.length === 0) {
            showToast(`Nincsenek ${sportToLoad} meccsek.`, 'info');
            if(placeholder) { placeholder.innerHTML = `<p class="muted">Nincsenek ${sportToLoad} meccsek.</p>`; placeholder.style.display = 'flex'; }
        } else {
            if(placeholder) placeholder.style.display = 'none';
            // Itt már a groupBy biztosan létezik
            if (isMobile()) {
                renderFixturesForMobileList(appState.fixtures);
            } else {
                renderFixturesForDesktop(appState.fixtures);
            }
        }
    } catch (e) {
        console.error("Hiba a meccsek betöltésekor:", e);
        showToast(`Hiba: ${e.message}`, 'error');
        if(placeholder) { placeholder.innerHTML = `<p style="color:var(--danger)">Hiba: ${e.message}</p>`; placeholder.style.display = 'flex'; }
    } finally {
        if(loadBtn) { loadBtn.disabled = false; loadBtn.textContent = 'Meccsek Betöltése'; }
        updateSummaryButtonCount();
    }
}

async function runAnalysis(home, away, isSummary = false) {
    let decodedHome = home, decodedAway = away; // Initialize with potentially encoded values
    try {
        decodedHome = decodeURIComponent(home);
        decodedAway = decodeURIComponent(away);
    } catch (e) {
        console.error("Hiba a csapatnevek dekódolásakor:", e);
        if (!isSummary) showToast("Hiba a csapatnevek feldolgozásakor.", "error");
        return { error: "Hiba a csapatnevek feldolgozásakor." };
    }

    if (!isSummary) {
        if (isMobile()) { showToast("Elemzés folyamatban...", 'info', 6000); }
        const commonElements = document.getElementById('common-elements');
        if (!commonElements) { showToast("Hiba: Hiányzó UI.", "error"); return; }
        openModal(`${decodedHome} vs ${decodedAway}`, commonElements.innerHTML, isMobile() ? 'modal-fullscreen' : 'modal-lg');

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
        let analysisUrl = `${appState.gasUrl}?action=runAnalysis&home=${encodeURIComponent(decodedHome)}&away=${encodeURIComponent(decodedAway)}&sport=${appState.currentSport}&force=false`; // Use decoded then re-encoded names
        if (appState.sheetUrl) { analysisUrl += `&sheetUrl=${encodeURIComponent(appState.sheetUrl)}`; }

        const openingOdds = sessionStorage.getItem('openingOdds') || '{}';
        let openingOddsData = {};
        try { openingOddsData = JSON.parse(openingOdds); } catch (e) { console.error("openingOdds parse hiba:", e); }

        const response = await fetch(analysisUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ openingOdds: openingOddsData }) });
        if (!response.ok) throw new Error(`Szerver hiba: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        if (isSummary) {
            return { home: decodedHome, away: decodedAway, recommendation: data.masterRecommendation || { recommended_bet: "Hiba", final_confidence: 0, brief_reasoning: "N/A" } };
        }

        if (!data.html || !data.masterRecommendation) throw new Error("Hiányos válasz.");

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
        if (data.debugInfo) console.log("Debug Info:", data.debugInfo);

        const portfolioData = extractDataForPortfolio(data.html, decodedHome, decodedAway);
        if (portfolioData && !appState.completedAnalyses.some(a => a.match === portfolioData.match)) {
            if (appState.completedAnalyses.length < 3) { appState.completedAnalyses.push(portfolioData); sessionStorage.setItem('completedAnalyses', JSON.stringify(appState.completedAnalyses)); updatePortfolioButton(); }
            else { showToast("Portfólió megtelt.", "info"); }
        }

    } catch (e) {
        console.error(`Elemzés hiba (${decodedHome} vs ${decodedAway}):`, e);
        if (isSummary) { return { home: decodedHome, away: decodedAway, error: e.message }; }
        else {
            const modalContainer = document.getElementById('modal-container');
            const modalResults = modalContainer?.querySelector('#analysis-results');
            const modalSkeleton = modalContainer?.querySelector('#loading-skeleton');
            const modalChat = modalContainer?.querySelector('#chat-container');
            if (modalResults) modalResults.innerHTML = `<p style="color:var(--danger)...">Hiba: ${e.message}</p>`;
            if (modalSkeleton) modalSkeleton.classList.remove('active');
            if (modalChat) modalChat.style.display = 'none';
        }
    }
}

async function summarizeSelectedFixtures() {
    const checkboxes = document.querySelectorAll('.fixture-checkbox:checked');
    const selectedFixtures = Array.from(checkboxes).map(cb => ({ home: cb.dataset.home, away: cb.dataset.away })); // Collect encoded names

    if (selectedFixtures.length === 0) { showToast("Nincs kiválasztott meccs.", "info"); return; }

    const summaryBtn = document.getElementById('summaryBtn');
    if(summaryBtn){ summaryBtn.disabled = true; summaryBtn.textContent = `Összegzés: 0/${selectedFixtures.length}...`; }

    openSummaryModal('Összegzés Folyamatban', `<div id="summary-progress"><p>Elemzés: 0 / ${selectedFixtures.length}</p><ul id="summary-results-list" class="summary-results-list"></ul></div>`);
    const resultsList = document.getElementById('summary-results-list');
    const progressText = document.querySelector('#summary-progress p');

    appState.analysisQueue = [...selectedFixtures];
    appState.isAnalysisRunning = true;
    let completedCount = 0;
    const allResults = [];

    const runNextAnalysis = async () => {
        if (appState.analysisQueue.length === 0 || !appState.isAnalysisRunning) {
            appState.isAnalysisRunning = false;
            if(summaryBtn) summaryBtn.disabled = false;
            updateSummaryButtonCount();
            if(progressText) progressText.textContent = `Összegzés kész (${completedCount}/${selectedFixtures.length}).`;
            return;
        }

        const fixture = appState.analysisQueue.shift();
        // Pass encoded names to runAnalysis
        const result = await runAnalysis(fixture.home, fixture.away, true);
        completedCount++;
        allResults.push(result);

        if (resultsList) {
            const listItem = document.createElement('li');
            const displayHome = decodeURIComponent(result.home); // Decode for display
            const displayAway = decodeURIComponent(result.away); // Decode for display

            if (result.error) {
                listItem.innerHTML = `<strong>${displayHome} vs ${displayAway}:</strong> <span style="color:var(--danger)">Hiba: ${result.error.substring(0, 100)}...</span>`;
            } else if (result.recommendation) {
                const conf = result.recommendation.final_confidence;
                const confClass = conf >= 7 ? 'high' : conf >= 5 ? 'medium' : 'low';
                listItem.innerHTML = `<strong>${displayHome} vs ${displayAway}:</strong>
                    <span class="recommendation-pill ${confClass}"> ${result.recommendation.recommended_bet} (${conf.toFixed(1)}/10) </span>
                    <em class="muted">- ${result.recommendation.brief_reasoning}</em>`;
            }
            resultsList.appendChild(listItem);
            resultsList.scrollTop = resultsList.scrollHeight;
        }

        if(summaryBtn) summaryBtn.textContent = `Összegzés: ${completedCount}/${selectedFixtures.length}...`;
        if(progressText) progressText.textContent = `Elemzés: ${completedCount} / ${selectedFixtures.length}`;

        if (appState.isAnalysisRunning) { setTimeout(runNextAnalysis, 750); } // Delay
    };

    runNextAnalysis(); // Start the process
}

async function logBet(betData) {
    const logButton = event ? event.target : null;
    if (logButton) { logButton.disabled = true; logButton.textContent = '...'; }

    if (!appState.sheetUrl) {
        showToast("Napló URL szükséges.", "info");
        const url = prompt("Google Táblázat URL:", localStorage.getItem('sheetUrl') || "");
        if (url && url.startsWith('https://docs.google.com/spreadsheets/d/')) {
            appState.sheetUrl = url; localStorage.setItem('sheetUrl', url);
            document.getElementById('userInfo').textContent = `Csatlakozva | Napló: Beállítva`;
            showToast("URL mentve.", "success");
        } else {
            showToast('Érvénytelen URL/Megszakítva.', 'error');
            if (logButton) { logButton.disabled = false; logButton.textContent = 'Naplózás'; }
            return;
        }
    }

    try {
        const response = await fetch(appState.gasUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'logBet', sheetUrl: appState.sheetUrl, bet: betData }) });
        if (!response.ok) { throw new Error(`Szerver hiba: ${response.status}`); }
        const data = await response.json();
        if (data.error) { throw new Error(data.error); }
        if (data.success) {
            showToast(`"${betData.market}" naplózva! Új bankroll: ${data.newBankroll?.toFixed(2) || 'N/A'}`, 'success');
             if (logButton) { logButton.textContent = 'Naplózva ✔️'; }
        } else { throw new Error("Ismeretlen szerver hiba."); }
    } catch (e) {
        console.error("Naplózási hiba:", e); showToast(`Naplózási hiba: ${e.message}`, 'error');
        if (logButton) { logButton.disabled = false; logButton.textContent = 'Naplózás'; }
    }
}

async function openHistoryModal() {
    if (!appState.sheetUrl) { /* ... prompt for URL ... */ return; } // Simplified
    const modalSize = isMobile() ? 'modal-fullscreen' : 'modal-lg';
    const loadingHTML = document.getElementById('loading-skeleton')?.outerHTML || '<p>Betöltés...</p>';
    openModal('Előzmények', loadingHTML, modalSize);
    const modalSkeleton = document.querySelector('#modal-container #loading-skeleton');
    if (modalSkeleton) modalSkeleton.classList.add('active');

    try {
        const response = await fetch(`${appState.gasUrl}?action=getHistory&sheetUrl=${encodeURIComponent(appState.sheetUrl)}`);
        if (!response.ok) throw new Error(`Hálózati hiba: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        const modalBody = document.getElementById('modal-body');
        if (modalBody) { modalBody.innerHTML = renderHistory(data.history); } else { closeModal(); }
        if (modalSkeleton) modalSkeleton.classList.remove('active'); // Hide skeleton after loading
    } catch (e) {
        console.error("Előzmény hiba:", e);
        const modalBody = document.getElementById('modal-body');
        if (modalBody) { modalBody.innerHTML = `<p style="color:var(--danger)...">Hiba: ${e.message}</p>`; }
        if (modalSkeleton) modalSkeleton.classList.remove('active');
    }
}

async function deleteHistoryItem(id) {
    if (!appState.sheetUrl) { showToast('URL szükséges.', 'error'); return; }
    if (!confirm("Biztosan törölni szeretnéd?")) return;
    const listItem = event ? event.target.closest('.list-item') : document.querySelector(`.list-item[data-id="${id}"]`);
    if (listItem) listItem.style.opacity = '0.5';

    try {
        const response = await fetch(appState.gasUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'deleteHistoryItem', sheetUrl: appState.sheetUrl, id: id }) });
        if (!response.ok) throw new Error(`Szerver hiba: ${response.statusText}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        showToast('Elem törölve.', 'success');
        if (listItem) { listItem.remove(); } else { openHistoryModal(); }
    } catch (e) {
        console.error("Törlés hiba:", e); showToast(`Hiba: ${e.message}`, 'error');
        if (listItem) listItem.style.opacity = '1';
    }
}

async function buildPortfolio() {
    if (appState.completedAnalyses.length < 3) { showToast("Minimum 3 elemzés kell.", "info"); return; }
    const loadingHTML = document.getElementById('loading-skeleton')?.outerHTML || '<p>Betöltés...</p>';
    openModal('Napi Portfólió Építése', loadingHTML, 'modal-lg');
    const modalSkeleton = document.querySelector('#modal-container #loading-skeleton');
    if (modalSkeleton) modalSkeleton.classList.add('active');

    try {
        const response = await fetch(appState.gasUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'buildPortfolio', analyses: appState.completedAnalyses }) });
        if (!response.ok) throw new Error(`Szerver hiba: ${response.statusText}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        const reportText = data.report || "Hiba: Riport hiányzik.";
        const formattedReport = reportText.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>').replace(/- /g,'&bull; ').replace(/### (.*?)(<br>|$)/g,'<h4>$1</h4>');
        const modalBody = document.getElementById('modal-body');
        if (modalBody) { modalBody.innerHTML = `<div class="portfolio-report"...>${formattedReport}</div>`; }
        if (modalSkeleton) modalSkeleton.classList.remove('active');
    } catch (e) {
        console.error("Portfólió hiba:", e);
        const modalBody = document.getElementById('modal-body');
        if (modalBody) { modalBody.innerHTML = `<p style="color:var(--danger)...">Hiba: ${e.message}</p>`; }
        if (modalSkeleton) modalSkeleton.classList.remove('active');
    }
}

async function runFinalCheck(home, away, sport) {
    const btn = event ? event.target : null;
    if (btn) { btn.disabled = true; btn.innerHTML = '...'; }
    const loadingHTML = document.getElementById('loading-skeleton')?.outerHTML || '<p>Betöltés...</p>';
    openModal('Végső Ellenőrzés', loadingHTML, 'modal-sm');
    const modalSkeleton = document.querySelector('#modal-container #loading-skeleton');
    if (modalSkeleton) modalSkeleton.classList.add('active');

    try {
        const openingOdds = JSON.parse(sessionStorage.getItem('openingOdds') || '{}');
        const decodedHome = decodeURIComponent(home);
        const decodedAway = decodeURIComponent(away);
        const response = await fetch(appState.gasUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'runFinalCheck', sport, home: decodedHome, away: decodedAway, openingOdds }) });
        if (!response.ok) throw new Error(`Szerver hiba: ${response.statusText}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        if (!data.signal || !data.justification) throw new Error("Hiányos válasz.");

        let signalColor, signalText;
        switch(data.signal?.toUpperCase()) { case 'GREEN': signalColor='var(--success)'; signalText='ZÖLD ✅'; break; case 'YELLOW': signalColor='var(--primary)'; signalText='SÁRGA ⚠️'; break; case 'RED': signalColor='var(--danger)'; signalText='PIROS ❌'; break; default: signalColor='var(--text-secondary)'; signalText='ISMERETLEN (?)'; }
        const lineupStatusHtml = data.lineupStatus ? `<p style="font-size: 0.9rem...">${data.lineupStatus}</p>` : '';
        const resultHtml = `<div style="text-align: center;"><h2 style="color: ${signalColor}...">${signalText}</h2><p style="font-size: 1.1rem...">${data.justification}</p>${lineupStatusHtml}</div>`;
        const modalBody = document.getElementById('modal-body');
        if (modalBody) modalBody.innerHTML = resultHtml;
        if (modalSkeleton) modalSkeleton.classList.remove('active');
    } catch (e) {
        console.error("Végső ellenőrzés hiba:", e);
        const modalBody = document.getElementById('modal-body');
        if (modalBody) modalBody.innerHTML = `<p style="color:var(--danger)...">Hiba: ${e.message}</p>`;
        if (modalSkeleton) modalSkeleton.classList.remove('active');
    } finally { if (btn) { btn.disabled = false; btn.innerHTML = '✔️'; } }
}

// --- UI KEZELŐ FÜGGVÉNYEK ---

function handleCheckboxChange() { updateSummaryButtonCount(); }
function updateSummaryButtonCount() { const count = document.querySelectorAll('.fixture-checkbox:checked').length; const summaryBtn = document.getElementById('summaryBtn'); if (summaryBtn) { summaryBtn.textContent = `Kiválasztottak Összegzése (${count})`; summaryBtn.disabled = count === 0; } }

// --- RENDER FUNCTIONS ---
function renderFixturesForDesktop(fixtures) {
    const board = document.getElementById('kanban-board'); if (!board) return; board.innerHTML = '';
    const groupOrder = ['🎯 Prémium Elemzés', '📈 Stabil Ligák', '❔ Változékony Mezőny', '🎲 Vad Kártyák'];
    let groupedByCategory; try { groupedByCategory = groupBy(fixtures, fx => getLeagueGroup(fx.league)); } catch (e) { console.error("Csoportosítási hiba (desktop):", e); board.innerHTML = `<p style="color:var(--danger)">Hiba a csoportosításkor.</p>`; return; }
    groupOrder.forEach(group => { const column = document.createElement('div'); column.className = 'kanban-column'; const [icon, ...titleParts] = group.split(' '); const title = titleParts.join(' '); let headHTML = `<h4 class="kanban-column-header">${icon} ${title}</h4>`; let contentHTML = '<div class="column-content">'; const categoryFixtures = groupedByCategory ? groupedByCategory[group] : undefined;
        if (categoryFixtures?.length > 0) { const groupedByDate = groupBy(categoryFixtures, fx => { try { return new Date(fx.utcKickoff).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }); } catch { return "?"; } }); const sortedDates = Object.keys(groupedByDate).sort((a, b)=>{ try { const dA=new Date(a.split('. ').join('.').split('.').reverse().join('-')); const dB=new Date(b.split('. ').join('.').split('.').reverse().join('-')); return dA - dB; } catch { return 0; } });
            sortedDates.forEach(dateKey => { contentHTML += `<details class="date-section" open><summary>${formatDateLabel(dateKey)}</summary>`; const sortedFixtures = groupedByDate[dateKey].sort((a, b) => new Date(a.utcKickoff) - new Date(b.utcKickoff));
                sortedFixtures.forEach(fx => { if (!fx?.home || !fx.away || !fx.league || !fx.utcKickoff || !fx.id) { console.warn('Kihagyva (desktop):', fx); return; } let time='N/A'; try{time=new Date(fx.utcKickoff).toLocaleTimeString('hu-HU',{timeZone:'Europe/Budapest',hour:'2-digit',minute:'2-digit'})}catch{} const safeHome=encodeURIComponent(fx.home); const safeAway=encodeURIComponent(fx.away); const leagueShort=fx.league.substring(0,25)+(fx.league.length>25?'...':'');
                    contentHTML += `<div class="match-card" data-id="${fx.id}"><input type="checkbox" class="fixture-checkbox" data-home="${safeHome}" data-away="${safeAway}" onchange="updateSummaryButtonCount()"><div class="match-content" onclick="runAnalysis('${safeHome}', '${safeAway}')"><div class="match-card-teams">${fx.home} – ${fx.away}</div><div class="match-card-meta"><span title="${fx.league}">${leagueShort}</span><span>${time}</span></div></div></div>`; });
                contentHTML += `</details>`; });
        } else { contentHTML += '<p class="muted" style="text-align: center; padding-top: 2rem;">Nincs meccs.</p>'; }
        contentHTML += '</div>'; column.innerHTML = headHTML + contentHTML; board.appendChild(column); });
}
function renderFixturesForMobileList(fixtures) {
    const container = document.getElementById('mobile-list-container'); if (!container) return; container.innerHTML = '';
    const groupOrder = ['🎯 Prémium Elemzés', '📈 Stabil Ligák', '❔ Változékony Mezőny', '🎲 Vad Kártyák'];
    let groupedByCategory; try { groupedByCategory = groupBy(fixtures, fx => getLeagueGroup(fx.league)); } catch (e) { console.error("Csoportosítási hiba (mobil):", e); container.innerHTML = `<p style="color:var(--danger)">Hiba a csoportosításkor.</p>`; return; }
    let html = ''; let hasFixtures = false;
    groupOrder.forEach(group => { const categoryFixtures = groupedByCategory ? groupedByCategory[group] : undefined;
        if (categoryFixtures?.length > 0) { hasFixtures = true; const [icon, ...titleParts] = group.split(' '); const title = titleParts.join(' '); html += `<h4 class="league-header-mobile">${icon} ${title}</h4>`; const sortedFixtures = categoryFixtures.sort((a, b) => new Date(a.utcKickoff) - new Date(b.utcKickoff));
            sortedFixtures.forEach(fx => { if (!fx?.home || !fx.away || !fx.league || !fx.utcKickoff || !fx.id) { console.warn('Kihagyva (mobil):', fx); return; } let time='N/A', dateLabel='N/A'; try{const kickoffDate=new Date(fx.utcKickoff); time=kickoffDate.toLocaleTimeString('hu-HU',{timeZone:'Europe/Budapest',hour:'2-digit',minute:'2-digit'}); dateLabel=formatDateLabel(kickoffDate.toLocaleDateString('hu-HU',{timeZone:'Europe/Budapest'}))}catch{} const safeHome=encodeURIComponent(fx.home); const safeAway=encodeURIComponent(fx.away);
                html += `<div class="list-item mobile" data-id="${fx.id}"><input type="checkbox" class="fixture-checkbox" data-home="${safeHome}" data-away="${safeAway}" onchange="updateSummaryButtonCount()"><div class="match-content" onclick="runAnalysis('${safeHome}', '${safeAway}')"><div class="list-item-title">${fx.home} – ${fx.away}</div><div class="list-item-meta">${fx.league} - ${dateLabel} ${time}</div></div> <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg> </div>`; });
        } });
    if (!hasFixtures) { container.innerHTML = '<p class="muted" style="text-align:center; padding: 2rem;">Nincsenek elérhető mérkőzések.</p>'; } else { container.innerHTML = html; }
}


// --- MODAL KEZELÉS ---
function openModal(title, content = '', sizeClass = 'modal-sm') { const modalContainer = document.getElementById('modal-container'); const modalContent = modalContainer?.querySelector('.modal-content'); const modalTitleEl = document.getElementById('modal-title'); const modalBodyEl = document.getElementById('modal-body'); if (!modalContainer || !modalContent || !modalTitleEl || !modalBodyEl) { console.error("Modal elemek hiányoznak."); return; } modalContent.className = 'modal-content'; modalContent.classList.add(sizeClass); modalTitleEl.textContent = title; modalBodyEl.innerHTML = content; modalContainer.classList.add('open'); }
function closeModal() { const modalContainer = document.getElementById('modal-container'); if (modalContainer) modalContainer.classList.remove('open'); }
function openSummaryModal(title, content = '') { const modalContainer = document.getElementById('summary-modal-container'); const modalTitleEl = document.getElementById('summary-modal-title'); const modalBodyEl = document.getElementById('summary-modal-body'); if (!modalContainer || !modalTitleEl || !modalBodyEl) { console.error("Összegző modal elemek hiányoznak."); return; } modalTitleEl.textContent = title; modalBodyEl.innerHTML = content; modalContainer.classList.add('open'); }
function closeSummaryModal() { const modalContainer = document.getElementById('summary-modal-container'); if (modalContainer) modalContainer.classList.remove('open'); appState.isAnalysisRunning = false; appState.analysisQueue = []; const summaryBtn = document.getElementById('summaryBtn'); if (summaryBtn?.textContent.includes('...')) { summaryBtn.disabled = false; updateSummaryButtonCount(); } }

// --- CHAT FUNKCIÓK ---
async function sendChatMessage() { const modal = document.getElementById('modal-container'); if (!modal?.classList.contains('open')) return; const input = modal.querySelector('#chat-input'); const thinkingIndicator = modal.querySelector('#chat-thinking-indicator'); const sendButton = modal.querySelector('#chat-send-btn'); if (!input || !thinkingIndicator || !sendButton) { return; } const message = input.value.trim(); if (!message) return; addMessageToChat(message,'user'); input.value=''; input.disabled=true; sendButton.disabled=true; thinkingIndicator.style.display='block'; try { if (!appState.currentAnalysisContext) { throw new Error("Nincs kontextus."); } const response = await fetch(appState.gasUrl, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({ action:'askChat', context:appState.currentAnalysisContext, history:appState.chatHistory, question:message }) }); if (!response.ok) throw new Error(`Szerver hiba: ${response.statusText}`); const data = await response.json(); if (data.error) throw new Error(data.error); if (!data.answer) throw new Error("Hiányzó válasz."); addMessageToChat(data.answer,'ai'); appState.chatHistory.push({role:'user',parts:[{text:message}]}); appState.chatHistory.push({role:'model',parts:[{text:data.answer}]}); if(appState.chatHistory.length>20) {appState.chatHistory = appState.chatHistory.slice(-20);} } catch (e) { console.error("Chat hiba:", e); addMessageToChat(`Hiba: ${e.message}`,'ai'); } finally { thinkingIndicator.style.display='none'; input.disabled=false; sendButton.disabled=false; input.focus(); } }
function addMessageToChat(text,role){const messagesContainer=document.querySelector('#modal-container.open #chat-messages');if(!messagesContainer){return}const bubble=document.createElement('div');bubble.className=`chat-bubble ${role}`;bubble.textContent=text;messagesContainer.appendChild(bubble);messagesContainer.scrollTo({top:messagesContainer.scrollHeight,behavior:'smooth'})}

// --- TOAST ÉRTESÍTÉSEK ---
function showToast(message,type='info',duration=4000){const container=document.getElementById('toast-notification-container');if(!container)return;const toast=document.createElement('div');toast.className=`toast-notification ${type}`;toast.textContent=message;container.appendChild(toast);const removeToast=()=>{toast.style.animation='fadeOut 0.5s forwards';toast.addEventListener('animationend',()=>{if(toast.parentNode===container){toast.remove()}},{once:true})};setTimeout(removeToast,duration);toast.addEventListener('click',removeToast)}

// --- TÉMAVÁLTÓ ---
function setupThemeSwitcher(){const themeSwitcher=document.getElementById('theme-switcher');const htmlEl=document.documentElement;if(!themeSwitcher||!htmlEl)return;const setIcon=(theme)=>{themeSwitcher.innerHTML=theme==='dark'?'<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>':'<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';themeSwitcher.setAttribute('width','24');themeSwitcher.setAttribute('height','24');themeSwitcher.setAttribute('viewBox','0 0 24 24');themeSwitcher.setAttribute('fill','none');themeSwitcher.setAttribute('stroke','currentColor');themeSwitcher.setAttribute('stroke-width','2');themeSwitcher.setAttribute('stroke-linecap','round');themeSwitcher.setAttribute('stroke-linejoin','round');themeSwitcher.style.cursor='pointer'};const currentTheme=localStorage.getItem('theme')||'dark';htmlEl.className=`${currentTheme}-theme`;setIcon(currentTheme);themeSwitcher.addEventListener('click',()=>{let newTheme=htmlEl.classList.contains('dark-theme')?'light':'dark';htmlEl.classList.remove('dark-theme','light-theme');htmlEl.classList.add(`${newTheme}-theme`);localStorage.setItem('theme',newTheme);setIcon(newTheme)})}
