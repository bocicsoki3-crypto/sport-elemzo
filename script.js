// --- ALKALMAZÁS ÁLLAPOT ---
const appState = {
    gasUrl: 'https://script.google.com/macros/s/AKfycbyN99ot1yzv4Na9nq0rTIsCSQ2DUlMMCzSKQmtM8fg7qDMAaFzHW8n_2Y8eNxnsFdabvg/exec', // <-- Ellenőrizd!
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
    if (!appState.gasUrl || !appState.gasUrl.startsWith('https://script.google.com')) { document.getElementById('userInfo').textContent='HIBA: GAS URL nincs beállítva!'; document.getElementById('userInfo').style.color = 'var(--danger)'; }
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
    try {
        decodedHome = decodeURIComponent(home);
        decodedAway = decodeURIComponent(away);
    }
    catch (e) {
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
        const body = {
            action: 'runAnalysis',
            openingOdds: JSON.parse(openingOdds)
        };
        
        const response = await fetch(`${appState.gasUrl}?action=runAnalysis&sport=${appState.currentSport}&home=${home}&away=${away}&sheetUrl=${encodeURIComponent(appState.sheetUrl)}`, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) throw new Error(`Hálózati hiba: ${response.status}`);
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
        } else {
            if (bodyChat) bodyChat.style.display = 'none';
        }

        // Portfólió kezelés
        if (data.masterRecommendation) {
            const portfolioData = {
                match: `${decodedHome} vs ${decodedAway}`,
                bestBet: data.masterRecommendation.recommended_bet,
                confidence: data.masterRecommendation.final_confidence
            };
            appState.completedAnalyses.push(portfolioData);
            sessionStorage.setItem('completedAnalyses', JSON.stringify(appState.completedAnalyses));
            updatePortfolioButton();
        }

    } catch (e) {
        console.error("Hiba runAnalysis:", e);
        if (isSummary) {
            return { error: e.message, match: `${decodedHome} vs ${decodedAway}` };
        }
        const modalBody = document.getElementById('modal-body');
        if (modalBody) modalBody.innerHTML = `<p style="color:var(--danger); padding: 1.5rem;">Hiba: ${e.message}</p>`;
        const modalSkeleton = document.querySelector('#modal-container #loading-skeleton');
        if (modalSkeleton) modalSkeleton.classList.remove('active');
        const bodySkeleton = modalBody?.querySelector('#loading-skeleton');
        if (bodySkeleton) bodySkeleton.style.display = 'none';
    }
}

async function summarizeSelectedFixtures() {
    const summaryBtn = document.getElementById('summaryBtn');
    if (summaryBtn) summaryBtn.disabled = true;

    const checkedBoxes = document.querySelectorAll('.fixture-checkbox:checked');
    if (checkedBoxes.length === 0) {
        showToast("Nincs kiválasztott meccs.", "info");
        if (summaryBtn) summaryBtn.disabled = false;
        return;
    }

    openSummaryModal(`Összegzés (${checkedBoxes.length} meccs)`, '<div id="summary-loading-skeleton" class="loading-skeleton active"><div class="skeleton-card"><div class="skeleton-line" style="height: 1.5rem; width: 40%;"></div><div class="skeleton-line" style="width: 90%;"></div><div class="skeleton-line" style="width: 80%;"></div></div></div>');

    appState.analysisQueue = Array.from(checkedBoxes);
    appState.isAnalysisRunning = true;
    let results = [];

    for (const checkbox of appState.analysisQueue) {
        const home = checkbox.dataset.home;
        const away = checkbox.dataset.away;
        const result = await runAnalysis(home, away, true);
        results.push(result);
    }

    appState.isAnalysisRunning = false;
    let html = '<ul class="summary-results-list">';
    results.forEach(res => {
        if (res.error) {
            html += `<li><strong>${res.match || 'Ismeretlen meccs'}</strong><br><span class="muted" style="color: var(--danger);">Hiba: ${res.error}</span></li>`;
        } else {
            let pillClass = 'low';
            if (res.confidence >= 7) pillClass = 'high';
            else if (res.confidence >= 5) pillClass = 'medium';
            html += `
                <li>
                    <strong>${res.match}</strong><br>
                    Tipp: <strong>${res.recommendation}</strong>
                    <span class="recommendation-pill ${pillClass}">${res.confidence.toFixed(1)}/10</span><br>
                    <em class="muted">${res.reasoning}</em>
                </li>`;
        }
    });
    html += '</ul>';

    const summaryBody = document.getElementById('summary-modal-body');
    if (summaryBody) summaryBody.innerHTML = html;
    if (summaryBtn) summaryBtn.disabled = false;
}

async function logBet(betData) {
    if (!appState.sheetUrl) {
        showToast('A naplózáshoz be kell állítani a Google Sheet URL-t.', 'error');
        const url = prompt("Kérlek, add meg a Google Sheet URL-t:", "");
        if (url && url.startsWith('https://docs.google.com/spreadsheets/d/')) {
            appState.sheetUrl = url;
            localStorage.setItem('sheetUrl', url);
            document.getElementById('userInfo').textContent = `Csatlakozva | Napló: Beállítva`;
            showToast('Sheet URL elmentve. Próbáld újra a naplózást.', 'info');
        } else if (url) {
            showToast('Érvénytelen Google Sheet URL.', 'error');
        }
        return;
    }

    try {
        const response = await fetch(`${appState.gasUrl}?action=logBet`, {
            method: 'POST',
            body: JSON.stringify({ sheetUrl: appState.sheetUrl, bet: betData }),
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) throw new Error(`Hálózati hiba: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        
        showToast('Fogadás sikeresen naplózva!', 'success');
        closeModal(); // Bezárja az elemzési ablakot a naplózás után

    } catch (e) {
        console.error("Hiba logBet:", e);
        showToast(`Naplózási hiba: ${e.message}`, 'error');
    }
}

async function openHistoryModal() {
    if (!appState.sheetUrl) {
        const url = prompt("Kérlek, add meg a Google Sheet URL-t az előzmények betöltéséhez:", localStorage.getItem('sheetUrl') || "");
        if (url && url.startsWith('https://docs.google.com/spreadsheets/d/')) {
            appState.sheetUrl = url;
            localStorage.setItem('sheetUrl', url);
            document.getElementById('userInfo').textContent = `Csatlakozva | Napló: Beállítva`;
        } else {
            showToast('Érvénytelen vagy hiányzó Google Sheet URL.', 'error');
            return;
        }
    }

    const loadingHTML = document.getElementById('loading-skeleton')?.outerHTML || '<p>Előzmények betöltése...</p>';
    openModal('Elemzési Előzmények', loadingHTML, isMobile() ? 'modal-fullscreen' : 'modal-lg');
    const modalSkeleton = document.querySelector('#modal-container #loading-skeleton');
    if (modalSkeleton) modalSkeleton.classList.add('active');

    try {
        const response = await fetch(`${appState.gasUrl}?action=getHistory&sheetUrl=${encodeURIComponent(appState.sheetUrl)}`);
        if (!response.ok) throw new Error(`Hálózati hiba: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        const modalBody = document.getElementById('modal-body');
        if (modalBody) modalBody.innerHTML = renderHistory(data.history);

    } catch (e) {
        console.error("Hiba openHistoryModal:", e);
        const modalBody = document.getElementById('modal-body');
        if (modalBody) modalBody.innerHTML = `<p style="color:var(--danger); padding: 1.5rem;">Hiba: ${e.message}</p>`;
    }
}

async function deleteHistoryItem(id) {
    if (!id) return;
    if (!confirm("Biztosan törlöd ezt az elemzést?")) return;

    try {
        const response = await fetch(`${appState.gasUrl}?action=deleteHistoryItem`, {
            method: 'POST',
            body: JSON.stringify({ sheetUrl: appState.sheetUrl, id: id }),
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) throw new Error(`Hálózati hiba: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        showToast('Elemzés sikeresen törölve.', 'success');
        // Frissíti az előzmények listáját
        openHistoryModal();

    } catch (e) {
        console.error("Hiba deleteHistoryItem:", e);
        showToast(`Törlési hiba: ${e.message}`, 'error');
    }
}

async function buildPortfolio() {
    const portfolioBtn = document.getElementById('portfolioBtn');
    if (!portfolioBtn) return;
    
    portfolioBtn.disabled = true;
    portfolioBtn.textContent = 'Portfólió építése...';

    openModal('Napi Portfólió Jelentés', '<div id="portfolio-loading-skeleton" class="loading-skeleton active"><div class="skeleton-card"><div class="skeleton-line" style="height: 1.5rem; width: 40%;"></div><div class="skeleton-line" style="width: 90%;"></div><div class="skeleton-line" style="width: 80%;"></div></div></div>', isMobile() ? 'modal-fullscreen' : 'modal-lg');

    try {
        const response = await fetch(`${appState.gasUrl}?action=buildPortfolio`, {
            method: 'POST',
            body: JSON.stringify({ analyses: appState.completedAnalyses }),
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) throw new Error(`Hálózati hiba: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        const modalBody = document.getElementById('modal-body');
        if (modalBody) {
            // A válasz markdown-t tartalmaz, azt formázni kell
            const formattedReport = data.report
                .replace(/### (.*?)\n/g, '<h4>$1</h4>')
                .replace(/\*\* (.*?):/g, '<strong>$1:</strong>')
                .replace(/\n/g, '<br>');
            modalBody.innerHTML = `<div class="portfolio-report">${formattedReport}</div>`;
        }
        
    } catch (e) {
        console.error("Hiba buildPortfolio:", e);
        const modalBody = document.getElementById('modal-body');
        if (modalBody) modalBody.innerHTML = `<p style="color:var(--danger); padding: 1.5rem;">Hiba: ${e.message}</p>`;
    } finally {
        portfolioBtn.disabled = false;
        updatePortfolioButton(); // Visszaállítja a gomb szövegét
    }
}

async function runFinalCheck(home, away, sport) {
    let decodedHome = home, decodedAway = away;
    try {
        decodedHome = decodeURIComponent(home);
        decodedAway = decodeURIComponent(away);
    } catch (e) { showToast("Csapatnév hiba.", "error"); return; }
    
    const toastId = `toast-${Date.now()}`;
    showToast(`Végső ellenőrzés indul: ${decodedHome} vs ${decodedAway}...`, 'info', 10000, toastId);

    try {
        const openingOdds = sessionStorage.getItem('openingOdds') || '{}';
        const body = {
            action: 'runFinalCheck',
            sport: sport,
            home: decodedHome,
            away: decodedAway,
            openingOdds: JSON.parse(openingOdds)
        };
        
        const response = await fetch(appState.gasUrl, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) throw new Error(`Hálózati hiba: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        // Toast frissítése az eredménnyel
        const toast = document.getElementById(toastId);
        if (toast) {
            toast.classList.remove('info');
            if (data.signal === 'GREEN') {
                toast.classList.add('success');
                toast.innerHTML = `✅ ZÖLD JELZÉS (${decodedHome}): ${data.justification}`;
            } else if (data.signal === 'YELLOW') {
                toast.classList.add('info'); // Inforól infóra váltás (de a tartalom frissül)
                toast.innerHTML = `⚠️ SÁRGA JELZÉS (${decodedHome}): ${data.justification}`;
            } else {
                toast.classList.add('error');
                toast.innerHTML = `🛑 PIROS JELZÉS (${decodedHome}): ${data.justification}`;
            }
            // Hosszabb ideig hagyjuk kint az eredményt
            setTimeout(() => {
                toast.style.animation = 'fadeOut 0.5s ease forwards';
                setTimeout(() => toast.remove(), 500);
            }, 10000); // 10 másodpercig látszik az eredmény
        }

    } catch (e) {
        console.error("Hiba runFinalCheck:", e);
        const toast = document.getElementById(toastId);
        if (toast) {
            toast.classList.remove('info');
            toast.classList.add('error');
            toast.innerHTML = `Hiba az ellenőrzéskor: ${e.message}`;
        } else {
            showToast(`Hiba az ellenőrzéskor: ${e.message}`, 'error');
        }
    }
}

// --- UI KEZELŐ FÜGGVÉNYEK ---

function handleSportChange() {
    appState.currentSport = document.getElementById('sportSelector').value;
    loadFixtures();
}

function updatePortfolioButton(){
    const portfolioBtn = document.getElementById('portfolioBtn');
    if(portfolioBtn){
        const count = appState.completedAnalyses.length;
        portfolioBtn.textContent = `Portfólió Építése (${count}/3)`;
        portfolioBtn.disabled = count < 3;
    }
}

function openManualAnalysisModal(){
    const content = `
        <div class="control-group">
            <label for="manualHome">Hazai csapat</label>
            <input type="text" id="manualHome" placeholder="Pl. Real Madrid">
        </div>
        <div class="control-group" style="margin-top: 1rem;">
            <label for="manualAway">Vendég csapat</label>
            <input type="text" id="manualAway" placeholder="Pl. FC Barcelona">
        </div>
        <button class="btn btn-primary" onclick="runManualAnalysis()" style="margin-top: 1.5rem; width: 100%;">Elemzés Indítása</button>
    `;
    openModal('Kézi Elemzés Indítása', content, 'modal-sm');
}

function runManualAnalysis(){
    const homeEl = document.getElementById('manualHome');
    const awayEl = document.getElementById('manualAway');
    
    if (homeEl && awayEl) {
        const home = homeEl.value;
        const away = awayEl.value;
        
        if (!home || !away) {
            showToast('Mindkét csapatnév megadása kötelező.', 'error');
            return;
        }
        
        // Bezárja a kézi beviteli modált
        closeModal();
        
        // Elindítja az elemzést a megadott nevekkel
        runAnalysis(encodeURIComponent(home), encodeURIComponent(away));
    }
}

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
                    let safeHome = "", safeAway = "";
                    
                    // ---> JAVÍTÁS 1: leagueShort deklarálása <---
                    let leagueShort = "N/A"; 
                    let fixtureId = `fixture-${index}-${Date.now()}`;
                    let isValidFixture = false;

                    try {
                        // ---> JAVÍTÁS 2: Robusztus "szupertisztítás" és ellenőrzés <---
                        const cleanHome = (fx.home || "").replace(/[\s\u00A0]/g, '');
                        const cleanAway = (fx.away || "").replace(/[\s\u00A0]/g, '');
                        const cleanLeague = (fx.league || "").replace(/[\s\u00A0]/g, '');

                        if (!fx || !fx.id || !fx.utcKickoff || cleanHome.length === 0 || cleanAway.length === 0 || cleanLeague.length === 0) {
                            throw new Error("Hiányzó vagy érvénytelen alap adatok (pl. üres nevek).");
                        }
                        
                        displayHome = fx.home.trim(); 
                        displayAway = fx.away.trim(); 
                        displayLeague = fx.league.trim();
                        fixtureId = fx.id;
                        
                        const kickoffDate = new Date(fx.utcKickoff); if (isNaN(kickoffDate.getTime())) throw new Error("Érvénytelen utcKickoff.");
                        displayTime = kickoffDate.toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' });

                        safeHome = encodeURIComponent(displayHome);
                        safeAway = encodeURIComponent(displayAway);
                        leagueShort = displayLeague.substring(0, 25) + (displayLeague.length > 25 ? '...' : '');
                        isValidFixture = true;

                    } catch (validationError) { 
                        console.warn(`Meccs kihagyva (desktop, ${group} #${index + 1}) - Hiba: ${validationError.message}. Adat:`, JSON.stringify(fx)); 
                    }

                    if (isValidFixture) {
                        contentHTML += `
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
                
                // ---> JAVÍTÁS 1: leagueShort deklarálása <---
                let leagueShort = "N/A"; // (Itt nincs használva, de a következetesség miatt)
                let isValidFixture = false;
                let fixtureId = `fixture-mobile-${index}-${Date.now()}`;

                try {
                    // ---> JAVÍTÁS 2: Robusztus "szupertisztítás" és ellenőrzés <---
                    const cleanHome = (fx.home || "").replace(/[\s\u00A0]/g, '');
                    const cleanAway = (fx.away || "").replace(/[\s\u00A0]/g, '');
                    const cleanLeague = (fx.league || "").replace(/[\s\u00A0]/g, '');

                    if (!fx || !fx.id || !fx.utcKickoff || cleanHome.length === 0 || cleanAway.length === 0 || cleanLeague.length === 0) {
                        throw new Error("Hiányzó vagy érvénytelen alap adatok (pl. üres nevek).");
                    }

                    displayHome = fx.home.trim(); 
                    displayAway = fx.away.trim(); 
                    displayLeague = fx.league.trim();
                    fixtureId = fx.id;

                    const kickoffDate = new Date(fx.utcKickoff); if (isNaN(kickoffDate.getTime())) throw new Error("Érvénytelen utcKickoff.");
                    displayTime = kickoffDate.toLocaleTimeString('hu-HU',{timeZone:'Europe/Budapest',hour:'2-digit',minute:'2-digit'});
                    displayDateLabel = formatDateLabel(kickoffDate.toLocaleDateString('hu-HU',{timeZone:'Europe/Budapest'}));
                    safeHome = encodeURIComponent(displayHome); 
                    safeAway = encodeURIComponent(displayAway);
                    isValidFixture = true;

                } catch (validationError) { 
                    console.warn(`Meccs kihagyva (mobil, ${group} #${index + 1}) - Hiba: ${validationError.message}. Adat:`, JSON.stringify(fx)); 
                }

                if (isValidFixture) {
                    html += `
                        <div class="list-item mobile" data-id="${fixtureId}">
                            <input type="checkbox" class="fixture-checkbox" data-home="${safeHome}" data-away="${safeAway}" onchange="updateSummaryButtonCount()">
                            <div class="match-content" onclick='runAnalysis(${JSON.stringify(safeHome)}, ${JSON.stringify(safeAway)})'>
                                <div class="list-item-title">${displayHome} – ${displayAway}</div>
                                <div class="list-item-meta">${displayLeague} - ${displayDateLabel} ${displayTime}</div>
                            </div>
                             <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        </div>`;
                }
            });
        }
    });
    if (!hasFixtures) { container.innerHTML = '<p class="muted"...>Nincsenek meccsek.</p>'; } else { container.innerHTML = html; }
}

// --- MODAL KEZELÉS ---
function openModal(title, content = '', sizeClass = 'modal-sm') {
    const modalContainer = document.getElementById('modal-container');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalContent = modalContainer.querySelector('.modal-content');

    if (!modalContainer || !modalTitle || !modalBody || !modalContent) return;
    
    // Reset size classes
    modalContent.classList.remove('modal-sm', 'modal-lg', 'modal-fullscreen');
    // Add new size class
    modalContent.classList.add(sizeClass);

    modalTitle.textContent = title;
    modalBody.innerHTML = content;
    modalContainer.classList.add('open');
}

function closeModal() {
    const modalContainer = document.getElementById('modal-container');
    if (modalContainer) modalContainer.classList.remove('open');
}

function openSummaryModal(title, content = '') {
    const modalContainer = document.getElementById('summary-modal-container');
    const modalTitle = document.getElementById('summary-modal-title');
    const modalBody = document.getElementById('summary-modal-body');
    if (!modalContainer || !modalTitle || !modalBody) return;
    modalTitle.textContent = title;
    modalBody.innerHTML = content;
    modalContainer.classList.add('open');
}

function closeSummaryModal() {
    const modalContainer = document.getElementById('summary-modal-container');
    if (modalContainer) modalContainer.classList.remove('open');
}

// --- CHAT FUNKCIÓK ---
async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const thinkingIndicator = document.getElementById('chat-thinking-indicator');
    const sendBtn = document.getElementById('chat-send-btn');
    if (!input || !thinkingIndicator || !sendBtn) return;

    const question = input.value.trim();
    if (!question) return;

    addMessageToChat(question, 'user');
    input.value = '';
    thinkingIndicator.style.display = 'block';
    sendBtn.disabled = true;
    
    appState.chatHistory.push({ role: 'user', parts: [{ text: question }] });

    try {
        const response = await fetch(appState.gasUrl, {
            method: 'POST',
            body: JSON.stringify({
                action: 'askChat',
                context: appState.currentAnalysisContext,
                history: appState.chatHistory,
                question: question
            }),
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) throw new Error(`Hálózati hiba: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        addMessageToChat(data.answer, 'ai');
        appState.chatHistory.push({ role: 'model', parts: [{ text: data.answer }] });

    } catch (e) {
        console.error("Hiba sendChatMessage:", e);
        addMessageToChat(`Hiba: ${e.message}`, 'ai');
    } finally {
        thinkingIndicator.style.display = 'none';
        sendBtn.disabled = false;
        input.focus();
    }
}

function addMessageToChat(text, role) {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;
    
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role}`;
    bubble.textContent = text;
    messagesContainer.appendChild(bubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// --- TOAST ÉRTESÍTÉSEK ---
function showToast(message, type = 'info', duration = 4000, toastId = null) {
    const container = document.getElementById('toast-notification-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    toast.textContent = message;
    if (toastId) toast.id = toastId;

    container.appendChild(toast);

    if (duration > 0) {
        setTimeout(() => {
            // Csak akkor távolítsa el, ha még létezik (pl. nem frissült közben)
            if (document.getElementById(toast.id)) {
                toast.style.animation = 'fadeOut 0.5s ease forwards';
                setTimeout(() => toast.remove(), 500);
            }
        }, duration);
    }
}

// --- TÉMAVÁLTÓ ---
function setupThemeSwitcher() {
    const switcher = document.getElementById('theme-switcher');
    const doc = document.documentElement;
    const currentTheme = localStorage.getItem('theme') || 'dark';
    
    if (currentTheme === 'light') {
        doc.classList.remove('dark-theme');
        doc.classList.add('light-theme');
    } else {
        doc.classList.remove('light-theme');
        doc.classList.add('dark-theme');
    }
    
    if(switcher) {
        switcher.onclick = () => {
            if (doc.classList.contains('dark-theme')) {
                doc.classList.remove('dark-theme');
                doc.classList.add('light-theme');
                localStorage.setItem('theme', 'light');
            } else {
                doc.classList.remove('light-theme');
                doc.classList.add('dark-theme');
                localStorage.setItem('theme', 'dark');
            }
        };
    }
}

// --- MARADÉK FÜGGVÉNYEK (Teljes definíciók kellenek a működéshez) ---
function extractDataForPortfolio(html, home, away) { try { const parser = new DOMParser(); const doc = parser.parseFromString(html, 'text/html'); let bestBetCard = Array.from(doc.querySelectorAll('.summary-card h5')).find(h5 => h5.textContent.includes('Értéket Rejtő Tipp')); let isValueBet = true; if (!bestBetCard) { bestBetCard = Array.from(doc.querySelectorAll('.summary-card h5')).find(h5 => h5.textContent.includes('Legvalószínűbb kimenetel')); isValueBet = false; } if (!bestBetCard) { return null; } const card = bestBetCard.closest('.summary-card'); if (!card) return null; const bestBet = card.querySelector('.value')?.textContent?.trim(); const confidenceText = card.querySelector('.details strong')?.textContent?.trim(); if (bestBet && confidenceText) { return { match: `${home} vs ${away}`, bestBet: bestBet, confidence: confidenceText, }; } return null; } catch (e) { console.error("Hiba portfólió adatok kinyerésekor:", e); return null; } }
function renderHistory(historyData) { if (!historyData || !Array.isArray(historyData) || historyData.length === 0) { return '<p class="muted"...>Nincs előzmény.</p>'; } const history = historyData.filter(item => item?.id && item.home && item.away && item.sport && item.date); if (history.length === 0) { return '<p class="muted"...>Nincs megjeleníthető előzmény.</p>'; } const groupedByDate = groupBy(history, item => { try { return new Date(item.date).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }); } catch { return "?"; } }); let html = ''; Object.keys(groupedByDate).sort((a, b)=>{ try{ const dA=new Date(a.split('. ').join('.').split('.').reverse().join('-')); const dB=new Date(b.split('. ').join('.').split('.').reverse().join('-')); return dB - dA; } catch { return 0; } }).forEach(dateKey => { html += `<details class="date-section" open><summary>${formatDateLabel(dateKey)}</summary>`; const sortedItems = groupedByDate[dateKey].sort((a, b) => new Date(b.date) - new Date(a.date)); sortedItems.forEach(item => { let matchTime, timeDiffMinutes=NaN, time='N/A'; try{matchTime=new Date(item.date); time=matchTime.toLocaleTimeString('hu-HU',{timeZone:'Europe/Budapest',hour:'2-digit',minute:'2-digit'}); const now=new Date(); timeDiffMinutes=(matchTime-now)/(1000*60)}catch{} const isCheckable=!isNaN(timeDiffMinutes) && timeDiffMinutes<=60 && timeDiffMinutes>-120; const safeHome=encodeURIComponent(item.home); const safeAway=encodeURIComponent(item.away); const finalCheckButton=` <button class="btn btn-final-check" onclick="runFinalCheck('${safeHome}', '${safeAway}', '${item.sport}'); event.stopPropagation();" title="..." ${!isCheckable ? 'disabled' : ''}> ✔️ </button>`; html += ` <div class="list-item" data-id="${item.id}"> <div style="..." onclick="viewHistoryDetail('${item.id}')"> <div class="list-item-title">${item.home} – ${item.away}</div> <div class="list-item-meta">${item.sport.charAt(0).toUpperCase()+item.sport.slice(1)} - ${time}</div> </div> ${finalCheckButton} <button class="btn" onclick="deleteHistoryItem('${item.id}'); event.stopPropagation();" title="Törlés"> <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> </button> </div>`; }); html += `</details>`; }); return html; }
async function viewHistoryDetail(id) { if (!appState.sheetUrl) { showToast('URL szükséges.','error'); return; } const loadingHTML = document.getElementById('loading-skeleton')?.outerHTML || '<p>...</p>'; openModal('Elemzés...', loadingHTML, isMobile() ? 'modal-fullscreen' : 'modal-lg'); const modalSkeleton = document.querySelector('#modal-container #loading-skeleton'); if (modalSkeleton) modalSkeleton.classList.add('active'); try { const response = await fetch(`${appState.gasUrl}?action=getAnalysisDetail&sheetUrl=${encodeURIComponent(appState.sheetUrl)}&id=${id}`); if (!response.ok) throw new Error(`Hiba: ${response.status}`); const data = await response.json(); if (data.error) throw new Error(data.error); if (!data.record?.html) throw new Error("Hiányos adat."); const { record } = data; const modalTitleEl = document.getElementById('modal-title'); if (modalTitleEl) modalTitleEl.textContent = `${record.home||'?'} vs ${record.away||'?'}`; const modalBody = document.getElementById('modal-body'); const commonElements = document.getElementById('common-elements'); if (!modalBody || !commonElements) throw new Error("UI hiba."); modalBody.innerHTML = commonElements.innerHTML; const bodySkeleton = modalBody.querySelector('#loading-skeleton'); const bodyResults = modalBody.querySelector('#analysis-results'); const bodyChat = modalBody.querySelector('#chat-container'); const chatMessages = bodyChat?.querySelector('#chat-messages'); const chatSendBtn = bodyChat?.querySelector('#chat-send-btn'); const chatInput = bodyChat?.querySelector('#chat-input'); if (bodySkeleton) bodySkeleton.style.display = 'none'; if (bodyResults) bodyResults.innerHTML = `<div class="analysis-body">${record.html}</div>`; if (bodyChat && chatMessages && chatSendBtn && chatInput) { bodyChat.style.display = 'block'; appState.currentAnalysisContext = record.html; appState.chatHistory = []; chatMessages.innerHTML = ''; chatSendBtn.onclick = sendChatMessage; chatInput.onkeyup = (e)=>{if(e.key==="Enter") sendChatMessage();}; } else { if (bodyChat) bodyChat.style.display = 'none'; } } catch(e) { console.error("...", e); const modalBody = document.getElementById('modal-body'); if (modalBody) modalBody.innerHTML = `<p style="color:var(--danger)...">Hiba: ${e.message}</p>`; if (modalSkeleton) modalSkeleton.classList.remove('active'); const bodySkeleton = modalBody?.querySelector('#loading-skeleton'); if (bodySkeleton) bodySkeleton.style.display = 'none'; } }
