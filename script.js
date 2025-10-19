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

    // Automatikus betöltés induláskor (opcionális, ha akarod)
    // loadFixtures();

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
        placeholder.innerHTML = `<p class="muted">Meccsek betöltése...</p>`; // Loading text
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
        console.error("Hiba a meccsek betöltésekor:", e); // Log error to console
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

async function summarizeSelectedFixtures() {
    const checkboxes = document.querySelectorAll('.fixture-checkbox:checked');
    const selectedFixtures = [];
    checkboxes.forEach(cb => {
        selectedFixtures.push({
            home: cb.dataset.home, // Már kódolt
            away: cb.dataset.away  // Már kódolt
        });
    });

    if (selectedFixtures.length === 0) {
        showToast("Nincsenek kiválasztott meccsek az összegzéshez.", "info");
        return;
    }

    const summaryBtn = document.getElementById('summaryBtn');
    if(summaryBtn){
        summaryBtn.disabled = true;
        summaryBtn.textContent = `Összegzés: 0/${selectedFixtures.length}...`;
    }

    openSummaryModal('Összegzés Folyamatban', `<div id="summary-progress"><p>Elemzések lekérése: 0 / ${selectedFixtures.length}</p><ul id="summary-results-list" class="summary-results-list"></ul></div>`);
    const resultsList = document.getElementById('summary-results-list');
    const progressText = document.querySelector('#summary-progress p');

    appState.analysisQueue = [...selectedFixtures]; // Use the already encoded names
    appState.isAnalysisRunning = true;
    let completedCount = 0;
    const allResults = [];

    const runNextAnalysis = async () => {
        if (appState.analysisQueue.length === 0 || !appState.isAnalysisRunning) { // Check isAnalysisRunning flag
            appState.isAnalysisRunning = false;
            if(summaryBtn) summaryBtn.disabled = false;
            updateSummaryButtonCount();
            if(progressText) progressText.textContent = `Összegzés befejezve (${completedCount} / ${selectedFixtures.length}).`;
            return;
        }

        const fixture = appState.analysisQueue.shift();
        // Pass encoded names directly to runAnalysis
        const result = await runAnalysis(fixture.home, fixture.away, true);
        completedCount++;
        allResults.push(result);

        if (resultsList) { // Check if resultsList exists
            const listItem = document.createElement('li');
            // Decode names for display
            const displayHome = decodeURIComponent(result.home);
            const displayAway = decodeURIComponent(result.away);

            if (result.error) {
                listItem.innerHTML = `<strong>${displayHome} vs ${displayAway}:</strong> <span style="color:var(--danger)">Hiba: ${result.error.substring(0, 100)}...</span>`;
            } else if (result.recommendation) {
                const conf = result.recommendation.final_confidence;
                const confClass = conf >= 7 ? 'high' : conf >= 5 ? 'medium' : 'low';
                listItem.innerHTML = `<strong>${displayHome} vs ${displayAway}:</strong>
                    <span class="recommendation-pill ${confClass}">
                        ${result.recommendation.recommended_bet} (${conf.toFixed(1)}/10)
                    </span>
                    <em class="muted">- ${result.recommendation.brief_reasoning}</em>`;
            }
            resultsList.appendChild(listItem);
            resultsList.scrollTop = resultsList.scrollHeight;
        }


        if(summaryBtn) summaryBtn.textContent = `Összegzés: ${completedCount}/${selectedFixtures.length}...`;
        if(progressText) progressText.textContent = `Elemzések lekérése: ${completedCount} / ${selectedFixtures.length}`;

        // Delay only if analysis is still running
        if (appState.isAnalysisRunning) {
            setTimeout(runNextAnalysis, 750);
        }
    };

    runNextAnalysis();
}

async function logBet(betData) {
    const logButton = event ? event.target : null;
    if (logButton) { logButton.disabled = true; logButton.textContent = '...'; }

    if (!appState.sheetUrl) {
        showToast("Naplózáshoz URL szükséges.", "info");
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
        const response = await fetch(appState.gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'logBet', sheetUrl: appState.sheetUrl, bet: betData })
        });
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
    if (!appState.sheetUrl) {
        showToast("URL szükséges.", "info");
        const url = prompt("Google Táblázat URL:", localStorage.getItem('sheetUrl') || "");
        if (url && url.startsWith('https://docs.google.com/spreadsheets/d/')) {
            appState.sheetUrl = url; localStorage.setItem('sheetUrl', url);
            document.getElementById('userInfo').textContent = `Csatlakozva | Napló: Beállítva`;
            showToast("URL mentve.", "success");
        } else { if (url) { showToast('Érvénytelen URL.', 'error'); } return; }
    }
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
        if (modalBody) { modalBody.innerHTML = renderHistory(data.history); }
        else { closeModal(); }
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
    const listItem = event ? event.target.closest('.list-item') : document.querySelector(`.list-item[data-id="${id}"]`); // Find item by data-id
    if (listItem) listItem.style.opacity = '0.5';

    try {
        const response = await fetch(appState.gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'deleteHistoryItem', sheetUrl: appState.sheetUrl, id: id })
        });
        if (!response.ok) throw new Error(`Szerver hiba: ${response.statusText}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        showToast('Elem törölve.', 'success');
        if (listItem) { listItem.remove(); }
        else { openHistoryModal(); } // Refresh if item not found
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
        const response = await fetch(appState.gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'buildPortfolio', analyses: appState.completedAnalyses })
        });
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
        const response = await fetch(appState.gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'runFinalCheck', sport, home: decodedHome, away: decodedAway, openingOdds })
        });
        if (!response.ok) throw new Error(`Szerver hiba: ${response.statusText}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        if (!data.signal || !data.justification) throw new Error("Hiányos válasz.");

        let signalColor, signalText; /*...*/
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

// --- UI Segédfüggvények ---

function updatePortfolioButton(){const btn=document.getElementById('portfolioBtn');if(!btn)return;const count=appState.completedAnalyses.length;btn.textContent=`Portfólió Építése (${count}/3)`;btn.disabled=count<3}
function openManualAnalysisModal(){let content=`<p class="muted"...</p><div class="control-group"><label...>Hazai...</label><input id="manual-home".../></div><div class="control-group"...><label...>Vendég...</label><input id="manual-away".../></div><button class="btn btn-primary" onclick="runManualAnalysis()" ...>Elemzés...</button>`;openModal('Kézi Elemzés...',content,'modal-sm')}
function runManualAnalysis(){const homeInput=document.getElementById('manual-home');const awayInput=document.getElementById('manual-away');const home=homeInput?.value?.trim();const away=awayInput?.value?.trim();if(!home||!away){showToast('Mindkét név kell.','error');return}closeModal();runAnalysis(home,away)}
function isMobile() { return window.innerWidth <= 1024; }

// --- getLeagueGroup változatlan ---
function getLeagueGroup(leagueName) {
    const currentSport = appState.currentSport;
    console.log(`getLeagueGroup START - Liga: "${leagueName}", Sport: "${currentSport}"`);
    if (!currentSport || !LEAGUE_CATEGORIES[currentSport]) { console.error(`getLeagueGroup HIBA: Érvénytelen sport ("${currentSport}")`); return '❔ Változékony Mezőny'; }
    const sportGroups = LEAGUE_CATEGORIES[currentSport];
    if (!leagueName || typeof leagueName !== 'string') { console.warn(`getLeagueGroup FIGYELMEZTETÉS: Érvénytelen liga név: "${leagueName}"`); return '❔ Változékony Mezőny'; }
    const lowerLeagueName = leagueName.toLowerCase().trim();
    for (const groupName in sportGroups) {
        if (Object.prototype.hasOwnProperty.call(sportGroups, groupName) && Array.isArray(sportGroups[groupName])) {
            try { if (sportGroups[groupName].some(l => typeof l === 'string' && lowerLeagueName.includes(l.toLowerCase()))) { console.log(`getLeagueGroup TALÁLAT - Liga: "${leagueName}" -> Kategória: "${groupName}"`); return groupName; }
            } catch (e) { console.error(`Hiba a liga keresésekor (${groupName}): ${e}`); }
        } else { console.warn(`getLeagueGroup FIGYELMEZTETÉS: Hibás struktúra: "${currentSport}" -> "${groupName}"`); }
    }
    if (lowerLeagueName.includes('cup') || lowerLeagueName.includes('kupa') || lowerLeagueName.includes('copa')) { console.log(`getLeagueGroup TALÁLAT (Kupa) - Liga: "${leagueName}" -> Kategória: "🎲 Vad Kártyák"`); return '🎲 Vad Kártyák'; }
    console.log(`getLeagueGroup ALAPÉRTELMEZETT - Liga: "${leagueName}" -> Kategória: "❔ Változékony Mezőny"`);
    return '❔ Változékony Mezőny';
}

// --- renderFixturesForDesktop változatlan ---
function renderFixturesForDesktop(fixtures) {
    const board = document.getElementById('kanban-board'); if (!board) return; board.innerHTML = '';
    const groupOrder = ['🎯 Prémium Elemzés', '📈 Stabil Ligák', '❔ Változékony Mezőny', '🎲 Vad Kártyák'];
    let groupedByCategory; try { groupedByCategory = groupBy(fixtures, fx => getLeagueGroup(fx.league)); } catch (e) { console.error("Csoportosítási hiba (desktop):", e); board.innerHTML = `<p>Hiba.</p>`; return; }
    groupOrder.forEach(group => { const column = document.createElement('div'); column.className = 'kanban-column'; const [icon, ...titleParts] = group.split(' '); const title = titleParts.join(' '); let columnHeaderHTML = `<h4 class="kanban-column-header">${icon} ${title}</h4>`; let columnContentHTML = '<div class="column-content">'; const categoryFixtures = groupedByCategory ? groupedByCategory[group] : undefined;
        if (categoryFixtures?.length > 0) { const groupedByDate = groupBy(categoryFixtures, fx => { try { return new Date(fx.utcKickoff).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }); } catch { return "?"; } }); const sortedDates = Object.keys(groupedByDate).sort((a, b)=>{ try { const dA=new Date(a.split('. ').join('.').split('.').reverse().join('-')); const dB=new Date(b.split('. ').join('.').split('.').reverse().join('-')); return dA - dB; } catch { return 0; } });
            sortedDates.forEach(dateKey => { columnContentHTML += `<details class="date-section" open><summary>${formatDateLabel(dateKey)}</summary>`; const sortedFixtures = groupedByDate[dateKey].sort((a, b) => new Date(a.utcKickoff) - new Date(b.utcKickoff));
                sortedFixtures.forEach(fx => { if (!fx?.home || !fx.away || !fx.league || !fx.utcKickoff || !fx.id) { console.warn('Kihagyva (desktop):', fx); return; } let time='N/A'; try{time=new Date(fx.utcKickoff).toLocaleTimeString('hu-HU',{timeZone:'Europe/Budapest',hour:'2-digit',minute:'2-digit'})}catch{} const safeHome=encodeURIComponent(fx.home); const safeAway=encodeURIComponent(fx.away); const leagueShort=fx.league.substring(0,25)+(fx.league.length>25?'...':'');
                    columnContentHTML += `<div class="match-card" data-id="${fx.id}"><input type="checkbox" class="fixture-checkbox" data-home="${safeHome}" data-away="${safeAway}" onchange="updateSummaryButtonCount()"><div class="match-content" onclick="runAnalysis('${safeHome}', '${safeAway}')"><div class="match-card-teams">${fx.home} – ${fx.away}</div><div class="match-card-meta"><span title="${fx.league}">${leagueShort}</span><span>${time}</span></div></div></div>`; });
                columnContentHTML += `</details>`; });
        } else { columnContentHTML += '<p class="muted"...>Nincs meccs.</p>'; }
        columnContentHTML += '</div>'; column.innerHTML = columnHeaderHTML + columnContentHTML; board.appendChild(column); });
}
// --- renderFixturesForMobileList változatlan ---
function renderFixturesForMobileList(fixtures) {
    const container = document.getElementById('mobile-list-container'); if (!container) return; container.innerHTML = '';
    const groupOrder = ['🎯 Prémium Elemzés', '📈 Stabil Ligák', '❔ Változékony Mezőny', '🎲 Vad Kártyák'];
    let groupedByCategory; try { groupedByCategory = groupBy(fixtures, fx => getLeagueGroup(fx.league)); } catch (e) { console.error("Csoportosítási hiba (mobil):", e); container.innerHTML = `<p>Hiba.</p>`; return; }
    let html = ''; let hasFixtures = false;
    groupOrder.forEach(group => { const categoryFixtures = groupedByCategory ? groupedByCategory[group] : undefined;
        if (categoryFixtures?.length > 0) { hasFixtures = true; const [icon, ...titleParts] = group.split(' '); const title = titleParts.join(' '); html += `<h4 class="league-header-mobile">${icon} ${title}</h4>`; const sortedFixtures = categoryFixtures.sort((a, b) => new Date(a.utcKickoff) - new Date(b.utcKickoff));
            sortedFixtures.forEach(fx => { if (!fx?.home || !fx.away || !fx.league || !fx.utcKickoff || !fx.id) { console.warn('Kihagyva (mobil):', fx); return; } let time='N/A', dateLabel='N/A'; try{const kickoffDate=new Date(fx.utcKickoff); time=kickoffDate.toLocaleTimeString('hu-HU',{timeZone:'Europe/Budapest',hour:'2-digit',minute:'2-digit'}); dateLabel=formatDateLabel(kickoffDate.toLocaleDateString('hu-HU',{timeZone:'Europe/Budapest'}))}catch{} const safeHome=encodeURIComponent(fx.home); const safeAway=encodeURIComponent(fx.away);
                html += `<div class="list-item mobile" data-id="${fx.id}"><input type="checkbox" class="fixture-checkbox" data-home="${safeHome}" data-away="${safeAway}" onchange="updateSummaryButtonCount()"><div class="match-content" onclick="runAnalysis('${safeHome}', '${safeAway}')"><div class="list-item-title">${fx.home} – ${fx.away}</div><div class="list-item-meta">${fx.league} - ${dateLabel} ${time}</div></div> <svg ...>...</svg> </div>`; });
        } });
    if (!hasFixtures) { container.innerHTML = '<p class="muted"...>Nincsenek meccsek.</p>'; } else { container.innerHTML = html; }
}

function handleCheckboxChange() { updateSummaryButtonCount(); }
function updateSummaryButtonCount() { const count = document.querySelectorAll('.fixture-checkbox:checked').length; const summaryBtn = document.getElementById('summaryBtn'); if (summaryBtn) { summaryBtn.textContent = `Kiválasztottak Összegzése (${count})`; summaryBtn.disabled = count === 0; } }

function extractDataForPortfolio(html, home, away) { /*...*/ }
function renderHistory(historyData) { /*...*/ }
async function viewHistoryDetail(id) { /*...*/ }

// --- MODAL KEZELÉS ---
function openModal(title, content = '', sizeClass = 'modal-sm') { /*...*/ }
function closeModal() { /*...*/ }
function openSummaryModal(title, content = '') { /*...*/ }
function closeSummaryModal() { /*...*/ }

// --- SEGÉDFÜGGVÉNYEK ---
// function groupBy(arr, keyFn) { /*...*/ } // Már fentebb van
// function formatDateLabel(dateStr) { /*...*/ } // Már fentebb van

// --- CHAT FUNKCIÓK ---
async function sendChatMessage() { /*...*/ }
function addMessageToChat(text, role) { /*...*/ }

// --- TOAST ÉRTESÍTÉSEK ---
function showToast(message, type = 'info', duration = 4000) { /*...*/ }

// --- TÉMAVÁLTÓ ---
function setupThemeSwitcher() { /*...*/ }
