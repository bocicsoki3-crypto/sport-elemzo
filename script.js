// --- ALKALMAZÁS ÁLLAPOT ---
// --- ALKALMAZÁS ÁLLAPOT (MÓDOSÍTVA) ---
// --- ALKALMAZÁS ÁLLAPOT (VÉGLEGES) ---
const appState = {
    // !!! KRITIKUS: CSERÉLD KI A SAJÁT KÖZZÉTETT GOOGLE APPS SCRIPT URL-EDRE !!!
    gasUrl: 'http://localhost:3000',
    // !!! KRITIKUS: Ez most már a Node.js szervered címe !!!
    gasUrl: 'http://localhost:3000', // Fejlesztés közben a laptopod címe
    // gasUrl: 'https://king-ai-backend.onrender.com', // Később, ha feltöltjük Renderre
    // !!! A VÉGLEGES RENDER.COM SZERVER CÍME !!!
    gasUrl: 'https://king-ai-backend.onrender.com',
    fixtures: [],
    currentSport: 'soccer',
    sheetUrl: '',
    sheetUrl: '', // Ezt a backend most már a .env-ből olvassa, de a frontend még küldheti
    sheetUrl: '', // Ezt a backend most már a .env-ből olvassa
    currentAnalysisContext: '',
    chatHistory: [],
    selectedMatches: new Set() // ÚJ: Kiválasztott meccsek tárolása (ID alapján)
};

// --- LIGA KATEGÓRIÁK (MÓDOSÍTVA) ---
// --- LIGA KATEGÓRIÁK (VÁLTOZATLAN) ---
const LEAGUE_CATEGORIES = {
    soccer: {
        'Top Ligák': [ 'Champions League', 'Premier League', 'Bundesliga', 'LaLiga', 'Serie A' ],
@@ -25,74 +26,77 @@ const LEAGUE_CATEGORIES = {
        'Kiemelt Bajnokságok': [ 'Europa League', 'Ligue 1', 'Eredivisie', 'Liga Portugal' ],
        'Figyelmet Érdemlő': [ 'Championship', '2. Bundesliga', 'Serie B', 'LaLiga2', 'Super Lig', 'Premiership', 'MLS' ],
        'Egyéb Meccsek': [ 'FIFA World Cup', 'UEFA European Championship', 'Conference League', 'Brazil Serie A', 'Argentinian Liga Profesional', 'Greek Super League', 'Nemzetek Ligája', 'Kupa', 'Copa', 'Cup' ]
    },
    hockey: { 'Top Ligák': [ 'NHL' ], 'Kiemelt Bajnokságok': [ 'KHL', 'SHL', 'Liiga', 'DEL', 'AHL', 'ICEHL', 'Champions Hockey League' ], 'Egyéb Meccsek': [ 'IIHF World Championship', 'Olimpiai Játékok', 'Spengler Cup', 'Extraliga' ] },
    basketball: { 'Top Ligák': [ 'NBA', 'Euroleague' ], 'Kiemelt Bajnokságok': [ 'Liga ACB', 'BSL', 'BBL', 'Lega A' ], 'Egyéb Meccsek': [ 'FIBA World Cup', 'Olimpiai Játékok', 'EuroBasket', 'FIBA Champions League', 'EuroCup', 'LNB Pro A' ] }
};

// --- INICIALIZÁLÁS (MÓDOSÍTVA) ---
document.addEventListener('DOMContentLoaded', () => {
    setupThemeSwitcher();
    // A 'loadFixturesBtn' eseménykezelőjét hozzáadjuk
    document.getElementById('loadFixturesBtn').addEventListener('click', loadFixtures);
    createGlowingOrbs(); // Fénygömbök hozzáadása
    createHeaderOrbs(); // Narancssárga gömbök a fejlécbe
    initMultiSelect(); // Többes kiválasztás inicializálása

    if(!appState.gasUrl || !appState.gasUrl.startsWith('https://script.google.com')){
        document.getElementById('userInfo').textContent='HIBA: URL nincs beállítva!';
        document.getElementById('userInfo').style.color = 'var(--danger)';
    } else {
        document.getElementById('userInfo').textContent=`Csatlakozva`;
    }
    // Ellenőrzés (már nem a gasUrl-t ellenőrizzük, csak kiírjuk)
    document.getElementById('userInfo').textContent = `Csatlakozva a szerverhez...`;
    createGlowingOrbs();
    createHeaderOrbs();
    initMultiSelect();

    // A 'sheetUrl' beolvasása (bár a backend már nem feltétlenül használja)
    appState.sheetUrl = localStorage.getItem('sheetUrl');
    document.getElementById('userInfo').textContent = `Csatlakozva...`;
    appState.sheetUrl = localStorage.getItem('sheetUrl'); // Ezt még beolvassuk, hátha kell

    const toastContainer = document.createElement('div');
    toastContainer.id = 'toast-notification-container';
    toastContainer.className = 'toast-notification-container';
    document.body.appendChild(toastContainer);

});

// --- FŐ FUNKCIÓK ---
// --- HIBAKEZELŐ SEGÉDFÜGGVÉNY ---
async function handleFetchError(response) {
    // Próbáljuk meg kiolvasni a szerver JSON hibaüzenetét
    try {
        const errorData = await response.json();
        throw new Error(`Szerver hiba (${response.status}): ${errorData.error || response.statusText}`);
    } catch (jsonError) {
        // Ha a válasz nem JSON, akkor általános hiba
        throw new Error(`Hálózati hiba: ${response.status} ${response.statusText}`);
    }
}

// --- FŐ FUNKCIÓK (NODE.JS SZERVERHEZ IGAZÍTVA) ---

// === MÓDOSÍTVA: Hívás az új '/getFixtures' végpontra ===
async function loadFixtures() {
    const loadBtn = document.getElementById('loadFixturesBtn');
    loadBtn.disabled = true;
    loadBtn.textContent = 'Betöltés...';
    appState.selectedMatches.clear(); // Töröljük a kiválasztást újratöltéskor
    updateMultiSelectButton(); // Frissítjük a gombot
    appState.selectedMatches.clear();
    updateMultiSelectButton();

    try {
        const response = await fetch(`${appState.gasUrl}?action=getFixtures&sport=${appState.currentSport}&days=2`);
        if (!response.ok) throw new Error(`Hálózati hiba: ${response.status}`);
        // A hívás most már a Node.js szerver /getFixtures végpontjára mutat
        // GET hívás az új /getFixtures végpontra
        const response = await fetch(`${appState.gasUrl}/getFixtures?sport=${appState.currentSport}&days=2`);
        if (!response.ok) throw new Error(`Hálózati hiba: ${response.status} ${response.statusText}`);
        if (!response.ok) await handleFetchError(response);

        const data = await response.json();
        if (data.error) throw new Error(data.error);

        // Adjunk egyedi ID-t minden meccshez a kiválasztáshoz
        // Adjunk egyedi ID-t minden meccshez
        appState.fixtures = (data.fixtures || []).map((fx, index) => ({
            ...fx,
            // Egyszerűbb ID generálás: sport_hazai_vendég (kisbetűvel, szóközök nélkül)
            // Ez feltételezi, hogy egy napon belül nincs két azonos nevű párosítás ugyanabban a sportban
            uniqueId: `${appState.currentSport}_${fx.home.toLowerCase().replace(/\s+/g, '')}_${fx.away.toLowerCase().replace(/\s+/g, '')}`
        }));

@@ -88,7 +80,6 @@ async function loadFixtures() {
        } else {
            renderFixturesForDesktop(appState.fixtures);
        }
        addCheckboxListeners(); // Adjunk listenereket a checkboxokhoz
        addCheckboxListeners();
        document.getElementById('userInfo').textContent = `Csatlakozva (Meccsek betöltve)`;
    } catch (e) {
@@ -101,93 +92,79 @@ async function loadFixtures() {
    }
}

// === MÓDOSÍTVA: forceNew paraméter hozzáadva ===
// === MÓDOSÍTVA: Hívás az új '/runAnalysis' végpontra (POST, application/json) ===
async function runAnalysis(home, away, forceNew = false) {
    home = unescape(home);
    away = unescape(away);

    if (isMobile() && forceNew) { // Csak akkor jelezzen mobilon, ha új elemzés indul
        showToast("Elemzés folyamatban... A folyamat megszakadásának elkerülése érdekében ne váltson másik alkalmazásra.", 'info', 6000);
    if (isMobile() && forceNew) {
        showToast("Elemzés folyamatban... Ez hosszabb időt vehet igénybe.", 'info', 6000);
    }

    openModal(`${home} vs ${away}`, document.getElementById('common-elements').innerHTML, 'modal-xl');

    const modalSkeleton = document.querySelector('#modal-container #loading-skeleton');
    const modalResults = document.querySelector('#modal-container #analysis-results');
    const modalChat = document.querySelector('#modal-container #chat-container');
@@ -105,20 +109,27 @@ async function runAnalysis(home, away, forceNew = false) {

    modalResults.innerHTML = '';
    modalChat.style.display = 'none';
    modalSkeleton.classList.add('active');

    modalChat.querySelector('#chat-send-btn').onclick = sendChatMessage;
    modalChat.querySelector('#chat-input').onkeyup = (e) => e.key === "Enter" && sendChatMessage();

    try {
        // === MÓDOSÍTVA: &force=${forceNew} használata ===
        let analysisUrl = `${appState.gasUrl}?action=runAnalysis&home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}&sport=${appState.currentSport}&force=${forceNew}&sheetUrl=${encodeURIComponent(appState.sheetUrl)}`;
        // A query paraméterek maradnak
        // POST hívás az új /runAnalysis végpontra, JSON body-val
        let analysisUrl = `${appState.gasUrl}/runAnalysis?home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}&sport=${appState.currentSport}&force=${forceNew}&sheetUrl=${encodeURIComponent(appState.sheetUrl)}`;
        
        const openingOdds = sessionStorage.getItem('openingOdds') || '{}';

        // A fetch hívás MÓDOSUL:
        const response = await fetch(analysisUrl, {
            method: 'POST',
            body: JSON.stringify({ openingOdds: JSON.parse(openingOdds) }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            method: 'POST', // POST metódus
            headers: {
                'Content-Type': 'application/json' // A tartalom típusa JSON
            },
            // A body-ba küldjük az openingOdds-ot JSON stringként
            body: JSON.stringify({ openingOdds: JSON.parse(openingOdds) })
            body: JSON.stringify({ openingOdds: JSON.parse(openingOdds) }) // JSON-ként küldjük
        });
        if (!response.ok) throw new Error(`Szerver válasz hiba: ${response.status}`);

        if (!response.ok) throw new Error(`Szerver válasz hiba: ${response.status} ${response.statusText}`);
        if (!response.ok) await handleFetchError(response);

        const data = await response.json();
        if (data.error) throw new Error(data.error);

        appState.currentAnalysisContext = data.html;
        appState.currentAnalysisContext = data.html; // Feltételezzük, hogy a válasz { html: "..." }
        appState.chatHistory = [];

        modalResults.innerHTML = `<div class="analysis-body">${data.html}</div>`;
@@ -129,56 +140,73 @@ async function runAnalysis(home, away, forceNew = false) {
        modalSkeleton.classList.remove('active');
        modalChat.style.display = 'block';
        modalChat.querySelector('#chat-messages').innerHTML = '';

    } catch (e) {
        modalResults.innerHTML = `<p style="color:var(--danger); text-align:center; padding: 2rem;">Hiba történt az elemzés során: ${e.message}</p>`;
        modalSkeleton.classList.remove('active');
        console.error(e);
    }
}

// === MÓDOSÍTVA: Hívás az új '/getHistory' végpontra ===
async function openHistoryModal() {
    if (!appState.sheetUrl) {
        const url = prompt("Kérlek, add meg a Google Táblázat URL-jét a napló megtekintéséhez:", "");
        const url = prompt("Kérlek, add meg a Google Táblázat URL-jét (bár a szerver már tudhatja):", "");
        const url = prompt("Kérlek, add meg a Google Táblázat URL-jét (opcionális, a szerver is tárolhatja):", "");
        if (url && url.startsWith('https://docs.google.com/spreadsheets/d/')) {
            appState.sheetUrl = url;
            localStorage.setItem('sheetUrl', url);
        } else if(url) {
            showToast('Érvénytelen URL.', 'error');
            return;
        } else { return; }
        }
    }

    const modalSize = isMobile() ? 'modal-fullscreen' : 'modal-lg';
    const loadingHTML = document.getElementById('loading-skeleton').outerHTML;
    openModal('Előzmények', loadingHTML, modalSize);
    document.querySelector('#modal-container #loading-skeleton').classList.add('active'); // Activate skeleton
    document.querySelector('#modal-container #loading-skeleton').classList.add('active');

    try {
        const response = await fetch(`${appState.gasUrl}?action=getHistory&sheetUrl=${encodeURIComponent(appState.sheetUrl)}`);
        // A hívás most már a Node.js szerver /getHistory végpontjára mutat
        // GET hívás az új /getHistory végpontra
        const response = await fetch(`${appState.gasUrl}/getHistory`);
        
        if (!response.ok) throw new Error(`Szerver válasz hiba: ${response.status} ${response.statusText}`);
        if (!response.ok) await handleFetchError(response);

        const data = await response.json();
        if (data.error) throw new Error(data.error);
@@ -199,56 +176,45 @@ async function openHistoryModal() {
    }
}

// === MÓDOSÍTVA: Hívás az új '/deleteHistoryItem' végpontra (POST, application/json) ===
async function deleteHistoryItem(id) {
    if (!appState.sheetUrl || !confirm("Biztosan törölni szeretnéd ezt az elemet a naplóból?")) return;
    if (!confirm("Biztosan törölni szeretnéd ezt az elemet a naplóból?")) return;
    try {
        const response = await fetch(appState.gasUrl, {
        // A hívás most már a Node.js szerver /deleteHistoryItem végpontjára mutat
        // POST hívás az új /deleteHistoryItem végpontra, JSON body-val
        const response = await fetch(`${appState.gasUrl}/deleteHistoryItem`, {
            method: 'POST',
            body: JSON.stringify({ action: 'deleteHistoryItem', sheetUrl: appState.sheetUrl, id: id }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            headers: {
                'Content-Type': 'application/json' // JSON-t küldünk
                'Content-Type': 'application/json'
            },
            // A body-ban küldjük az ID-t
            body: JSON.stringify({ id: id })
        });

        if (!response.ok) throw new Error(`Szerver válasz hiba: ${response.status} ${response.statusText}`);
        if (!response.ok) await handleFetchError(response);

        const data = await response.json();
        if (data.error) throw new Error(data.error);

        showToast('Elem sikeresen törölve.', 'success');
        openHistoryModal();
        openHistoryModal(); // Újratöltjük az előzményeket
    } catch (e) {
        showToast(`Hiba a törlés során: ${e.message}`, 'error');
        console.error(e);
    }
}


// === MÓDOSÍTVA: Hívás az új '/runFinalCheck' végpontra (POST, application/json) ===
async function runFinalCheck(home, away, sport) {
    // Ez a funkció változatlan marad
    const btn = event.target;
    btn.disabled = true;
    btn.innerHTML = '...';
@@ -188,17 +216,28 @@ async function runFinalCheck(home, away, sport) {

    openModal('Végső Elme-Ellenőrzés', document.getElementById('loading-skeleton').outerHTML, 'modal-sm');
    document.querySelector('#modal-container #loading-skeleton').classList.add('active');

    try {
        const openingOdds = JSON.parse(sessionStorage.getItem('openingOdds') || '{}');
        const response = await fetch(appState.gasUrl, {

        // Hívás az új végpontra
        // POST hívás az új /runFinalCheck végpontra, JSON body-val
        const response = await fetch(`${appState.gasUrl}/runFinalCheck`, {
            method: 'POST',
            body: JSON.stringify({ action: 'runFinalCheck', sport, home: unescape(home), away: unescape(away), openingOdds }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            headers: {
                'Content-Type': 'application/json'
            },
@@ -260,150 +226,335 @@ async function runFinalCheck(home, away, sport) {
            })
        });

        if (!response.ok) throw new Error(`Szerver hiba: ${response.statusText}`);
        if (!response.ok) await handleFetchError(response);

        const data = await response.json();
        if (data.error) throw new Error(data.error);

        let signalColor, signalText;
        switch(data.signal) {
        switch (data.signal) {
            case 'GREEN': signalColor = 'var(--success)'; signalText = 'ZÖLD JELZÉS ✅'; break;
            case 'YELLOW': signalColor = 'var(--primary)'; signalText = 'SÁRGA JELZÉS⚠️'; break;
            case 'RED': signalColor = 'var(--danger)'; signalText = 'PIROS JELZÉS ❌'; break;
@@ -215,7 +254,9 @@ async function runFinalCheck(home, away, sport) {
            default: signalColor = 'var(--text-secondary)'; signalText = 'ISMERETLEN JELZÉS';
        }

        const resultHtml = `
            <div style="text-align: center;">
                <h2 style="color: ${signalColor}; font-size: 2rem;">${signalText}</h2>
                <p style="font-size: 1.1rem; color: var(--text-secondary); border-top: 1px solid var(--border-color); padding-top: 1rem; margin-top: 1rem;">${data.justification}</p>
            </div>
        `;
        document.getElementById('modal-body').innerHTML = resultHtml;

    } catch (e) {
        document.getElementById('modal-body').innerHTML = `<p style="color:var(--danger); text-align:center;">Hiba: ${e.message}</p>`;
        console.error(e);
    } finally {
        // Gomb visszaállítása
        const currentBtn = document.querySelector(`button[onclick*="'${escape(home)}'"][onclick*="'${escape(away)}'"].btn-final-check`);
        if (currentBtn) {
            currentBtn.disabled = false;
@@ -226,14 +267,13 @@ async function runFinalCheck(home, away, sport) {
            currentBtn.innerHTML = '✔️';
        }
    }
}

async function viewHistoryDetail(id) {
    const originalId = unescape(id);
    openModal('Elemzés Betöltése...', document.getElementById('loading-skeleton').outerHTML, 'modal-xl');
    document.querySelector('#modal-container #loading-skeleton').classList.add('active');

    try {
        // GET hívás az új /getAnalysisDetail végpontra
        const response = await fetch(`${appState.gasUrl}/getAnalysisDetail?id=${encodeURIComponent(originalId)}`);
        if (!response.ok) await handleFetchError(response);
        
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        const { record } = data;
        if (!record) throw new Error("A szerver nem találta a kért elemzést.");

        document.getElementById('modal-title').textContent = `${record.home} vs ${record.away}`;
        const modalBody = document.getElementById('modal-body');
        modalBody.innerHTML = document.getElementById('common-elements').innerHTML;
        modalBody.querySelector('#loading-skeleton').style.display = 'none';
        modalBody.querySelector('#analysis-results').innerHTML = `<div class="analysis-body">${record.html}</div>`;

        const modalChat = modalBody.querySelector('#chat-container');
        modalChat.style.display = 'block';
        appState.currentAnalysisContext = record.html;
        appState.chatHistory = [];
        modalChat.querySelector('#chat-messages').innerHTML = '';
        modalChat.querySelector('#chat-send-btn').onclick = sendChatMessage;
        modalChat.querySelector('#chat-input').onkeyup = (e) => e.key === "Enter" && sendChatMessage();

    } catch(e) {
        document.getElementById('modal-body').innerHTML = `<p style="color:var(--danger); text-align:center; padding: 2rem;">Hiba: ${e.message}</p>`;
        console.error("Hiba a részletek megtekintésekor:", e);
    }
}

async function sendChatMessage() {
    const modal = document.getElementById('modal-container');
    const input = modal.querySelector('#chat-input');
    const thinkingIndicator = modal.querySelector('#chat-thinking-indicator');
    const message = input.value.trim();
    if (!message) return;
    addMessageToChat(message, 'user');
    input.value = '';
    thinkingIndicator.style.display = 'block';

    try {
        // POST hívás az új /askChat végpontra, JSON body-val
        const response = await fetch(`${appState.gasUrl}/askChat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                context: appState.currentAnalysisContext,
                history: appState.chatHistory,
                question: message
            })
        });

        if (!response.ok) await handleFetchError(response);
        
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        
        addMessageToChat(data.answer, 'ai');
        appState.chatHistory.push({ role: 'user', parts: [{ text: message }] });
        appState.chatHistory.push({ role: 'model', parts: [{ text: data.answer }] });
    } catch (e) {
        addMessageToChat(`Hiba történt: ${e.message}`, 'ai');
        console.error(e);
    } finally {
        thinkingIndicator.style.display = 'none';
    }
}

async function runMultiAnalysis() {
    const selectedIds = Array.from(appState.selectedMatches);
    if (selectedIds.length === 0 || selectedIds.length > 3) {
        showToast('Válassz ki 1-3 meccset az elemzéshez.', 'error');
        return;
    }
    const matchesToAnalyze = appState.fixtures.filter(fx => selectedIds.includes(fx.uniqueId));
    if (matchesToAnalyze.length !== selectedIds.length) {
         showToast('Hiba: Nem található minden kiválasztott meccs. Próbáld újra betölteni a meccseket.', 'error');
         return;
    }

    openModal(`Többes Elemzés (${matchesToAnalyze.length} meccs)`, '<div id="multi-analysis-results"></div><div id="multi-loading-skeleton"></div>', 'modal-xl');
    const resultsContainer = document.getElementById('multi-analysis-results');
    const loadingContainer = document.getElementById('multi-loading-skeleton');
    
    loadingContainer.innerHTML = document.getElementById('loading-skeleton').outerHTML;
    const modalSkeleton = loadingContainer.querySelector('.loading-skeleton');
    if (modalSkeleton) modalSkeleton.classList.add('active');

    const analysisPromises = matchesToAnalyze.map(match => {
        // Ugyanazt a runAnalysis hívást használjuk, force=true-val
        let analysisUrl = `${appState.gasUrl}/runAnalysis?home=${encodeURIComponent(match.home)}&away=${encodeURIComponent(match.away)}&sport=${appState.currentSport}&force=true&sheetUrl=${encodeURIComponent(appState.sheetUrl)}`;
        
        return fetch(analysisUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ openingOdds: JSON.parse(sessionStorage.getItem('openingOdds') || '{}') })
        })
        .then(response => {
            if (!response.ok) {
                // Itt nem tudjuk az await handleFetchError-t használni, mert .then()-ben vagyunk
                // Ezért manuálisan próbáljuk parse-olni a hibát
                return response.json().then(errorData => {
                    throw new Error(`Szerver hiba (${response.status}): ${errorData.error || response.statusText}`);
                }).catch(jsonError => {
                    throw new Error(`Hálózati hiba: ${response.status} ${response.statusText}`);
                });
            }
            return response.json();
        })
        .then(data => {
            if (data.error) throw new Error(`Elemzési hiba (${match.home} vs ${match.away}): ${data.error}`);
            return { match: `${match.home} vs ${match.away}`, html: data.html };
        })
        .catch(error => {
             console.error(`Hiba ${match.home} vs ${match.away} elemzésekor:`, error);
             return { match: `${match.home} vs ${match.away}`, error: error.message };
        });
    });

    try {
        const results = await Promise.all(analysisPromises);
        loadingContainer.innerHTML = '';
        resultsContainer.innerHTML = '';

        results.forEach(result => {
             const matchHeader = `<h4>${result.match}</h4>`;
             let recommendationHtml = '<p style="color:var(--danger);">Hiba történt az elemzés során ennél a meccsnél.</p>';

            if (!result.error && result.html) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = result.html;
                const recommendationCard = tempDiv.querySelector('.master-recommendation-card');
                if (recommendationCard) {
                    recommendationHtml = recommendationCard.outerHTML;
                } else {
                     recommendationHtml = '<p class="muted">A fő elemzői ajánlás nem található ebben az elemzésben.</p>';
                }
            } else if (result.error) {
                 recommendationHtml = `<p style="color:var(--danger);">Hiba: ${result.error}</p>`;
            }

            resultsContainer.innerHTML += `
                <div class="multi-analysis-item">
                    ${matchHeader}
                    ${recommendationHtml}
                </div>
            `;
        });

         appState.selectedMatches.clear();
         document.querySelectorAll('.selectable-card.selected, .selectable-item.selected').forEach(el => el.classList.remove('selected'));
         document.querySelectorAll('.match-checkbox:checked').forEach(cb => cb.checked = false);
         updateMultiSelectButton();
    } catch (e) {
         console.error("Váratlan hiba a többes elemzés során:", e);
         loadingContainer.innerHTML = '';
         resultsContainer.innerHTML = `<p style="color:var(--danger); text-align:center;">Váratlan hiba történt az elemzések összesítésekor: ${e.message}</p>`;
    }
}

// --- VÁLTOZATLAN SEGÉDFÜGGVÉNYEK (Renderelés, UI, stb.) ---

function handleSportChange() {
    appState.currentSport = document.getElementById('sportSelector').value;
    appState.selectedMatches.clear(); // Töröljük a kiválasztást sportváltáskor
    appState.selectedMatches.clear();
    document.getElementById('kanban-board').innerHTML = '';
    document.getElementById('mobile-list-container').innerHTML = '';
    document.getElementById('placeholder').style.display = 'flex';
    updateMultiSelectButton(); // Frissítjük a gombot
    updateMultiSelectButton();
}


function openManualAnalysisModal() {
    let content = `
        <div class="control-group"><label for="manual-home">Hazai csapat</label><input id="manual-home" placeholder="Pl. Liverpool"/></div>
@@ -251,8 +291,7 @@ function runManualAnalysis() {
        <div class="control-group" style="margin-top: 1rem;"><label for="manual-away">Vendég csapat</label><input id="manual-away" placeholder="Pl. Manchester City"/></div>
        <button class="btn btn-primary" onclick="runManualAnalysis()" style="width:100%; margin-top:1.5rem;">Elemzés Futtatása</button>
    `;
    openModal('Kézi Elemzés', content, 'modal-sm');
}

function runManualAnalysis() {
    const home = document.getElementById('manual-home').value;
    const away = document.getElementById('manual-away').value;
    if (!home || !away) {
        showToast('Mindkét csapat nevét meg kell adni.', 'error');
        return;
    }
    closeModal();
    // === MÓDOSÍTVA: forceNew=true átadása ===
    runAnalysis(home, away, true);
    runAnalysis(home, away, true); // forceNew=true
}

function isMobile() { return window.innerWidth <= 1024; }
@@ -269,26 +308,20 @@ function getLeagueGroup(leagueName) {

function getLeagueGroup(leagueName) {
    if (!leagueName) return 'Egyéb Meccsek';
    const sportGroups = LEAGUE_CATEGORIES[appState.currentSport] || {};
    const lowerLeagueName = leagueName.toLowerCase();
    for (const groupName in sportGroups) {
        if (sportGroups[groupName].some(l => lowerLeagueName.includes(l.toLowerCase()))) return groupName;
    }
    return 'Egyéb Meccsek';
}

function renderFixturesForDesktop(fixtures) {
    const board = document.getElementById('kanban-board');
    if (!board) return;
    document.getElementById('placeholder').style.display = 'none';
    board.innerHTML = '';

    // === MÓDOSÍTVA: groupOrder ===
    const groupOrder = ['Top Ligák', 'Kiemelt Bajnokságok', 'Figyelmet Érdemlő', 'Egyéb Meccsek'];
    const groupedByCategory = groupBy(fixtures, fx => getLeagueGroup(fx.league));

    groupOrder.forEach(group => {
        let columnContent = '';
        let cardIndex = 0;

        if (groupedByCategory[group]) {
            const groupedByDate = groupBy(groupedByCategory[group], fx => new Date(fx.utcKickoff).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }));

            Object.keys(groupedByDate).sort((a,b) => new Date(a.split('. ').join('.').split('.').reverse().join('-')) - new Date(b.split('. ').join('.').split('.').reverse().join('-'))).forEach(dateKey => {
            Object.keys(groupedByDate).sort((a, b) => new Date(a.split('. ').join('.').split('.').reverse().join('-')) - new Date(b.split('. ').join('.').split('.').reverse().join('-'))).forEach(dateKey => {
                columnContent += `<details class="date-section" open><summary>${formatDateLabel(dateKey)}</summary>`;
                groupedByDate[dateKey].forEach(fx => {
                    const time = new Date(fx.utcKickoff).toLocaleTimeString('hu-HU', {timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit'});

                    // === MÓDOSÍTVA: Checkbox és data-id hozzáadva, onclick módosítva ===
                    const time = new Date(fx.utcKickoff).toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' });
                    columnContent += `
                        <div class="match-card selectable-card ${appState.selectedMatches.has(fx.uniqueId) ? 'selected' : ''}" data-match-id="${fx.uniqueId}" style="animation-delay: ${cardIndex * 0.05}s">
                             <input type="checkbox" class="match-checkbox" data-match-id="${fx.uniqueId}" ${appState.selectedMatches.has(fx.uniqueId) ? 'checked' : ''}>
@@ -305,8 +338,6 @@ function renderFixturesForDesktop(fixtures) {
                             <div class="match-card-content" onclick="runAnalysis('${escape(fx.home)}', '${escape(fx.away)}', true)">
                                <div class="match-card-teams">${fx.home} – ${fx.away}</div>
                                <div class="match-card-meta">
                                    <span>${fx.league}</span>
                                    <span>${time}</span>
                                </div>
                             </div>
                        </div>`;
                    cardIndex++;
                });
                columnContent += `</details>`;
            });
        }

        // === MÓDOSÍTVA: Cím renderelés (nincs ikon) ===
        board.innerHTML += `
            <div class="kanban-column">
                <h4 class="kanban-column-header">${group}</h4>
@@ -319,22 +350,17 @@ function renderFixturesForDesktop(fixtures) {
                <div class="column-content">
                    ${columnContent || '<p class="muted" style="text-align: center; padding-top: 2rem;">Nincs meccs ebben a kategóriában.</p>'}
                </div>
            </div>`;
    });
}

function renderFixturesForMobileList(fixtures) {
    const container = document.getElementById('mobile-list-container');
    if (!container) return;
    document.getElementById('placeholder').style.display = 'none';
    container.innerHTML = '';

    // === MÓDOSÍTVA: groupOrder ===
    const groupOrder = ['Top Ligák', 'Kiemelt Bajnokságok', 'Figyelmet Érdemlő', 'Egyéb Meccsek'];
    const groupedByCategory = groupBy(fixtures, fx => getLeagueGroup(fx.league));

    let html = '';
    groupOrder.forEach(group => {
        if (groupedByCategory[group]) {
            // === MÓDOSÍTVA: Cím renderelés (nincs ikon) ===
            html += `<h4 class="league-header-mobile">${group}</h4>`;

            groupedByCategory[group].forEach(fx => {
                const time = new Date(fx.utcKickoff).toLocaleTimeString('hu-HU', {timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit'});
                // === MÓDOSÍTVA: Checkbox és data-id hozzáadva, onclick módosítva ===
                const time = new Date(fx.utcKickoff).toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' });
                html += `
                    <div class="list-item selectable-item ${appState.selectedMatches.has(fx.uniqueId) ? 'selected' : ''}" data-match-id="${fx.uniqueId}">
                        <input type="checkbox" class="match-checkbox" data-match-id="${fx.uniqueId}" ${appState.selectedMatches.has(fx.uniqueId) ? 'checked' : ''}>
@@ -350,41 +376,30 @@ function renderFixturesForMobileList(fixtures) {
                        <div class="list-item-content" onclick="runAnalysis('${escape(fx.home)}', '${escape(fx.away)}', true)">
                            <div class="list-item-title">${fx.home} – ${fx.away}</div>
                            <div class="list-item-meta">${fx.league || 'Ismeretlen Liga'} - ${time}</div>
                        </div>
                         <svg class="list-item-arrow" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </div>`;
            });
        }
    });
    container.innerHTML = html || '<p class="muted" style="text-align:center; padding: 2rem;">Nincsenek elérhető mérkőzések.</p>';
}


// === MÓDOSÍTOTT FUNKCIÓ (renderHistory) ===
function renderHistory(historyData) {
    if (!historyData || historyData.length === 0) {
        return '<p class="muted" style="text-align:center; padding: 2rem;">Nincsenek mentett előzmények.</p>';
    }
    const history = historyData.filter(item => item && item.id && item.home && item.away && item.date);
    const groupedByDate = groupBy(history, item => new Date(item.date).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }));

    let html = '';
    Object.keys(groupedByDate).sort((a,b) => new Date(b.split('. ').join('.').split('.').reverse().join('-')) - new Date(a.split('. ').join('.').split('.').reverse().join('-'))).forEach(dateKey => {
        // === MÓDOSÍTVA: 'open' attribútum eltávolítva ===
    Object.keys(groupedByDate).sort((a, b) => new Date(b.split('. ').join('.').split('.').reverse().join('-')) - new Date(a.split('. ').join('.').split('.').reverse().join('-'))).forEach(dateKey => {
        html += `<details class="date-section"><summary>${formatDateLabel(dateKey)}</summary>`;
        const sortedItems = groupedByDate[dateKey].sort((a,b) => new Date(b.date) - new Date(a.date));

        const sortedItems = groupedByDate[dateKey].sort((a, b) => new Date(b.date) - new Date(a.date));
        sortedItems.forEach(item => {
            const analysisTime = new Date(item.date); // Elemzés ideje
            const analysisTime = new Date(item.date);
            const now = new Date();

            // Jobb logika a Final Check gombhoz: Tegyük fel a meccs az elemzés után ~2 órával kezdődik
            // Aktív: Elemzés után 1 órával kezdődik az aktív időszak és 3 óráig tart (kb. meccs vége)
            const startTimeDiffMinutes = (now - analysisTime) / (1000 * 60) - 60; // Elemzés után 1 órával indul
            const endTimeDiffMinutes = (now - analysisTime) / (1000 * 60) - 180; // Elemzés után 3 óráig tart
            const isCheckable = startTimeDiffMinutes > 0 && endTimeDiffMinutes < 0; // Aktív az intervallumban

            const startTimeDiffMinutes = (now - analysisTime) / (1000 * 60) - 60;
            const endTimeDiffMinutes = (now - analysisTime) / (1000 * 60) - 180;
            const isCheckable = startTimeDiffMinutes > 0 && endTimeDiffMinutes < 0;
@@ -414,171 +565,106 @@ function renderHistory(historyData) {
                        ${!isCheckable ? 'disabled' : ''}>
                    ✔️
                </button>`;

            const time = analysisTime.toLocaleTimeString('hu-HU', {timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit'});
            // === MÓDOSÍTVA: Biztonságosabb ID átadás ===
            const time = analysisTime.toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' });
            const safeItemId = escape(item.id);
            html += `
                <div class="list-item">
@@ -402,52 +417,47 @@ function renderHistory(historyData) {
                    <div style="flex-grow:1;" onclick="viewHistoryDetail('${safeItemId}')">
                        <div class="list-item-title">${item.home} – ${item.away}</div>
                        <div class="list-item-meta">${item.sport ? item.sport.charAt(0).toUpperCase() + item.sport.slice(1) : ''} - Elemzés ideje: ${time}</div>
                    </div>
                     ${finalCheckButton}
                     <button class="btn" onclick="deleteHistoryItem('${safeItemId}'); event.stopPropagation();" title="Törlés">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                     </button>
                </div>`;
        });
        html += `</details>`;
    });
    return html;
}
// === MÓDOSÍTÁS VÉGE ===

// === MÓDOSÍTVA: Hívás az új '/getAnalysisDetail' végpontra ===
async function viewHistoryDetail(id) {
    // === MÓDOSÍTVA: unescape az id-re ===
    const originalId = unescape(id);
    openModal('Elemzés Betöltése...', document.getElementById('loading-skeleton').outerHTML, 'modal-xl');
    document.querySelector('#modal-container #loading-skeleton').classList.add('active'); // Activate skeleton
    document.querySelector('#modal-container #loading-skeleton').classList.add('active');

    try {
        // === MÓDOSÍTVA: az originalId encodeURIComponent-be került ===
        const response = await fetch(`${appState.gasUrl}?action=getAnalysisDetail&sheetUrl=${encodeURIComponent(appState.sheetUrl)}&id=${encodeURIComponent(originalId)}`);
        const response = await fetch(`${appState.gasUrl}/getAnalysisDetail?id=${encodeURIComponent(originalId)}`);
        if (!response.ok) throw new Error(`Szerver válasz hiba: ${response.status} ${response.statusText}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        const { record } = data;
        if (!record) throw new Error("A szerver nem találta a kért elemzést."); // Extra ellenőrzés
        if (!record) throw new Error("A szerver nem találta a kért elemzést.");

        document.getElementById('modal-title').textContent = `${record.home} vs ${record.away}`;

        const modalBody = document.getElementById('modal-body');
        modalBody.innerHTML = document.getElementById('common-elements').innerHTML;
        modalBody.querySelector('#loading-skeleton').style.display = 'none'; // Skeleton eltüntetése
        modalBody.querySelector('#loading-skeleton').style.display = 'none';
        modalBody.querySelector('#analysis-results').innerHTML = `<div class="analysis-body">${record.html}</div>`;

        const modalChat = modalBody.querySelector('#chat-container');
        modalChat.style.display = 'block';
        appState.currentAnalysisContext = record.html;
        appState.chatHistory = [];

        modalChat.querySelector('#chat-messages').innerHTML = '';
        modalChat.querySelector('#chat-send-btn').onclick = sendChatMessage;
        modalChat.querySelector('#chat-input').onkeyup = (e) => e.key === "Enter" && sendChatMessage();

    } catch(e) {
    } catch (e) {
        document.getElementById('modal-body').innerHTML = `<p style="color:var(--danger); text-align:center; padding: 2rem;">Hiba: ${e.message}</p>`;
        console.error("Hiba a részletek megtekintésekor:", e); // Logolás a konzolra is
        console.error(e);
    }
}

function openModal(title, content = '', sizeClass = 'modal-xl') {
    const modalContainer = document.getElementById('modal-container');
    const modalContent = modalContainer.querySelector('.modal-content');

    modalContent.classList.remove('modal-sm', 'modal-lg', 'modal-xl', 'modal-fullscreen');
    modalContent.classList.add(sizeClass);

    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = content;
    modalContainer.classList.add('open');
@@ -472,6 +482,7 @@ function formatDateLabel(dateStr) {
    return dateStr;
}

// === MÓDOSÍTVA: Hívás az új '/askChat' végpontra (POST, application/json) ===
async function sendChatMessage() {
    const modal = document.getElementById('modal-container');
    const input = modal.querySelector('#chat-input');
@@ -483,19 +494,28 @@ async function sendChatMessage() {
    thinkingIndicator.style.display = 'block';
function closeModal() { document.getElementById('modal-container').classList.remove('open'); }

    try {
        const response = await fetch(appState.gasUrl, {
        const response = await fetch(`${appState.gasUrl}/askChat`, {
            method: 'POST',
            body: JSON.stringify({ action: 'askChat', context: appState.currentAnalysisContext, history: appState.chatHistory, question: message }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                context: appState.currentAnalysisContext,
                history: appState.chatHistory,
                question: message
            })
        });
function groupBy(arr, keyFn) {
    return arr.reduce((acc, item) => {
        const key = keyFn(item);
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
    }, {});
}

        if (!response.ok) throw new Error(`Szerver hiba: ${response.statusText}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        
        addMessageToChat(data.answer, 'ai');
        appState.chatHistory.push({role: 'user', parts: [{ text: message }]});
        appState.chatHistory.push({role: 'model', parts: [{ text: data.answer }]});
        appState.chatHistory.push({ role: 'user', parts: [{ text: message }] });
        appState.chatHistory.push({ role: 'model', parts: [{ text: data.answer }] });
    } catch (e) {
        addMessageToChat(`Hiba történt: ${e.message}`, 'ai');
        console.error(e);
    } finally {
        thinkingIndicator.style.display = 'none';
    }
@@ -516,9 +536,7 @@ function showToast(message, type = 'info', duration = 4000) {
function formatDateLabel(dateStr) {
    const today = new Date().toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' });
    const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' });
    if (dateStr === today) return 'MA';
    if (dateStr === tomorrow) return 'HOLNAP';
    return dateStr;
}

function addMessageToChat(text, role) {
    const messagesContainer = document.querySelector('#modal-container #chat-messages');
    if (!messagesContainer) return;
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role}`;
    bubble.textContent = text;
    messagesContainer.appendChild(bubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-notification-container');
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.5s forwards';
        setTimeout(() => toast.remove(), 500);
@@ -528,17 +546,14 @@ function showToast(message, type = 'info', duration = 4000) {
    }, duration);
}

function setupThemeSwitcher() {
    const themeSwitcher = document.getElementById('theme-switcher');
    const htmlEl = document.documentElement;

    const setIcon = (theme) => {
        themeSwitcher.innerHTML = theme === 'dark'
            ? '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>'
            : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
    };

    const currentTheme = localStorage.getItem('theme') || 'dark';
    htmlEl.className = `${currentTheme}-theme`;
    setIcon(currentTheme);

    themeSwitcher.addEventListener('click', () => {
        let newTheme = htmlEl.className.includes('dark') ? 'light' : 'dark';
        htmlEl.className = `${newTheme}-theme`;
@@ -547,108 +562,87 @@ function setupThemeSwitcher() {
        localStorage.setItem('theme', newTheme);
        setIcon(newTheme);
    });
}

// === ÚJ FUNKCIÓ: FÉNYGÖMBÖK LÉTREHOZÁSA ===
function createGlowingOrbs() {
    try {
        const orbContainer = document.createElement('div');
        orbContainer.className = 'orb-container';
        const appContainer = document.querySelector('.app-container');
        if (!appContainer) return; // Ne fusson hibára, ha nincs meg a konténer

        if (!appContainer) return;
        appContainer.appendChild(orbContainer);
        const orbCount = 10; // Gömbök száma

        const orbCount = 10;
        for (let i = 0; i < orbCount; i++) {
            const orb = document.createElement('div');
            orb.className = 'glowing-orb';

            const size = Math.random() * 30 + 10; // 10px - 40px
            const scale = Math.random() * 0.5 + 0.5; // 0.5 - 1.0
            const opacity = Math.random() * 0.4 + 0.1; // 0.1 - 0.5
            const duration = Math.random() * 20 + 15; // 15s - 35s
            const delay = Math.random() * -duration; // Véletlenszerű indítási pont

            const size = Math.random() * 30 + 10;
            const scale = Math.random() * 0.5 + 0.5;
            const opacity = Math.random() * 0.4 + 0.1;
@@ -590,105 +676,81 @@ function createGlowingOrbs() {
            orb.style.setProperty('--opacity', opacity);
            orb.style.animationDuration = `${duration}s`;
            orb.style.animationDelay = `${delay}s`;

            // Véletlenszerű kezdő és végpontok
            const startX = Math.random() * 120 - 10; // -10% - 110%
            const startY = Math.random() * 120 - 10; // -10% - 110%
            const startX = Math.random() * 120 - 10;
            const startY = Math.random() * 120 - 10;
            const endX = Math.random() * 120 - 10;
            const endY = Math.random() * 120 - 10;

            orb.style.setProperty('--start-x', `${startX}vw`);
            orb.style.setProperty('--start-y', `${startY}vh`);
            orb.style.setProperty('--end-x', `${endX}vw`);
            orb.style.setProperty('--end-y', `${endY}vh`);

            orbContainer.appendChild(orb);
        }
    } catch (e) {
        console.error("Hiba a fénygömbök létrehozásakor:", e);
    }
}
// === ÚJ FUNKCIÓ VÉGE ===

// === ÚJ FUNKCIÓ: FEJLÉC FÉNYGÖMBÖK ===
function createHeaderOrbs() {
    try {
        const orbContainer = document.createElement('div');
        orbContainer.className = 'orb-container-header';
        const appHeader = document.querySelector('.app-header');
        if (!appHeader) return;

        appHeader.prepend(orbContainer); // Prepend to be behind other content
        const orbCount = 5; // Fewer orbs for the header

        appHeader.prepend(orbContainer);
        const orbCount = 5;
        for (let i = 0; i < orbCount; i++) {
            const orb = document.createElement('div');
            orb.className = 'glowing-orb-orange';

            const size = Math.random() * 15 + 5; // 5px - 20px (smaller)
            const size = Math.random() * 15 + 5;
            const scale = Math.random() * 0.5 + 0.5;
            const opacity = Math.random() * 0.5 + 0.2; // 0.2 - 0.7
            const duration = Math.random() * 10 + 8; // 8s - 18s (faster)
            const opacity = Math.random() * 0.5 + 0.2;
            const duration = Math.random() * 10 + 8;
            const delay = Math.random() * -duration;

            orb.style.width = `${size}px`;
            orb.style.height = `${size}px`;
            orb.style.setProperty('--scale', scale);
            orb.style.setProperty('--opacity', opacity);
            orb.style.animationDuration = `${duration}s`;
            orb.style.animationDelay = `${delay}s`;

            // Constrained to header (vw) and (px limited to header height)
            const startX = Math.random() * 100; // 0% - 100% vw
            const startY = Math.random() * 80; // 0px - 80px (header height)
            const startX = Math.random() * 100;
            const startY = Math.random() * 80;
            const endX = Math.random() * 100;
            const endY = Math.random() * 80;

            orb.style.setProperty('--start-x', `${startX}vw`);
            orb.style.setProperty('--start-y', `${startY}px`);
            orb.style.setProperty('--end-x', `${endX}vw`);
            orb.style.setProperty('--end-y', `${endY}px`);

            orbContainer.appendChild(orb);
        }
    } catch (e) {
        console.error("Hiba a fejléc gömbök létrehozásakor:", e);
    }
}
// === ÚJ FUNKCIÓ VÉGE ===

// === ÚJ FUNKCIÓK A TÖBBES KIJELÖLÉSHEZ ===

// --- TÖBBES KIJELÖLÉS FUNKCIÓK (VÁLTOZATLAN) ---
// --- TÖBBES KIJELÖLÉS FUNKCIÓK ---
function initMultiSelect() {
    const controlsBar = document.querySelector('.controls-bar .main-actions');
    if (controlsBar) {
        const multiSelectButton = document.createElement('button');
        multiSelectButton.id = 'multiAnalysisBtn';
        multiSelectButton.className = 'btn btn-special btn-lg'; // Új class
        multiSelectButton.className = 'btn btn-special btn-lg';
        multiSelectButton.textContent = 'Kiválasztottak Elemzése (0)';
        multiSelectButton.disabled = true;
        multiSelectButton.onclick = runMultiAnalysis;
@@ -659,7 +653,7 @@ function initMultiSelect() {
        controlsBar.appendChild(multiSelectButton);
    }
}

function addCheckboxListeners() {
    const checkboxes = document.querySelectorAll('.match-checkbox');
    checkboxes.forEach(cb => {
        cb.removeEventListener('change', handleCheckboxChange); // Eltávolítjuk a régit, ha volt
        cb.removeEventListener('change', handleCheckboxChange);
        cb.addEventListener('change', handleCheckboxChange);
    });
}
@@ -668,13 +662,12 @@ function handleCheckboxChange(event) {

function handleCheckboxChange(event) {
    const checkbox = event.target;
    const matchId = checkbox.dataset.matchId;
    const cardOrItem = checkbox.closest('.selectable-card, .selectable-item');
@@ -698,115 +760,20 @@ function addCheckboxListeners() {
            appState.selectedMatches.add(matchId);
            cardOrItem?.classList.add('selected');
        } else {
            checkbox.checked = false; // Ne engedjünk többet kiválasztani
            checkbox.checked = false;
            showToast('Maximum 3 meccset választhatsz ki egyszerre.', 'error');
        }
    } else {
@@ -692,62 +685,60 @@ function updateMultiSelectButton() {
    btn.disabled = count === 0 || count > 3;
}

// === MÓDOSÍTVA: Hívás az új '/runAnalysis' végpontra (POST, application/json) ===
async function runMultiAnalysis() {
    const selectedIds = Array.from(appState.selectedMatches);
    if (selectedIds.length === 0 || selectedIds.length > 3) {
        showToast('Válassz ki 1-3 meccset az elemzéshez.', 'error');
        return;
    }

    const matchesToAnalyze = appState.fixtures.filter(fx => selectedIds.includes(fx.uniqueId));

    if (matchesToAnalyze.length !== selectedIds.length) {
         showToast('Hiba: Nem található minden kiválasztott meccs. Próbáld újra betölteni a meccseket.', 'error');
         return;
        showToast('Hiba: Nem található minden kiválasztott meccs. Próbáld újra betölteni a meccseket.', 'error');
        return;
        appState.selectedMatches.delete(matchId);
        cardOrItem?.classList.remove('selected');
    }
    updateMultiSelectButton();
}

    openModal(`Többes Elemzés (${matchesToAnalyze.length} meccs)`, '<div id="multi-analysis-results"></div><div id="multi-loading-skeleton"></div>', 'modal-xl');
    const resultsContainer = document.getElementById('multi-analysis-results');
    const loadingContainer = document.getElementById('multi-loading-skeleton');

    // === MÓDOSÍTVA: Skeleton loader használata ===
    
    loadingContainer.innerHTML = document.getElementById('loading-skeleton').outerHTML;
    const modalSkeleton = loadingContainer.querySelector('.loading-skeleton');
    if (modalSkeleton) modalSkeleton.classList.add('active'); // Aktívvá tesszük a skeletont
    if (modalSkeleton) modalSkeleton.classList.add('active');

    const analysisPromises = matchesToAnalyze.map(match => {
        return fetch(`${appState.gasUrl}?action=runAnalysis&home=${encodeURIComponent(match.home)}&away=${encodeURIComponent(match.away)}&sport=${appState.currentSport}&force=true&sheetUrl=${encodeURIComponent(appState.sheetUrl)}`, {
        let analysisUrl = `${appState.gasUrl}/runAnalysis?home=${encodeURIComponent(match.home)}&away=${encodeURIComponent(match.away)}&sport=${appState.currentSport}&force=true&sheetUrl=${encodeURIComponent(appState.sheetUrl)}`;
        
        return fetch(analysisUrl, {
            method: 'POST',
            body: JSON.stringify({ openingOdds: JSON.parse(sessionStorage.getItem('openingOdds') || '{}') }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ openingOdds: JSON.parse(sessionStorage.getItem('openingOdds') || '{}') })
        })
        .then(response => {
            if (!response.ok) throw new Error(`Szerver hiba (${match.home} vs ${match.away}): ${response.status}`);
            if (!response.ok) throw new Error(`Szerver hiba (${match.home} vs ${match.away}): ${response.statusText}`);
            return response.json();
        })
        .then(data => {
            if (data.error) throw new Error(`Elemzési hiba (${match.home} vs ${match.away}): ${data.error}`);
            return { match: `${match.home} vs ${match.away}`, html: data.html }; // Csak a HTML-t adjuk vissza
            return { match: `${match.home} vs ${match.away}`, html: data.html };
        })
        .catch(error => {
             // Hibakezelés minden egyes meccsre külön
             console.error(`Hiba ${match.home} vs ${match.away} elemzésekor:`, error);
             // Visszaadunk egy hiba objektumot, hogy tudjuk, melyik volt sikertelen
             return { match: `${match.home} vs ${match.away}`, error: error.message };
        });
    });

    try {
        const results = await Promise.all(analysisPromises);
        loadingContainer.innerHTML = ''; // Töltő eltüntetése
        resultsContainer.innerHTML = ''; // Korábbi tartalom törlése
        loadingContainer.innerHTML = '';
        resultsContainer.innerHTML = '';

        results.forEach(result => {
             const matchHeader = `<h4>${result.match}</h4>`;
             let recommendationHtml = '<p style="color:var(--danger);">Hiba történt az elemzés során ennél a meccsnél.</p>'; // Alapértelmezett hibaüzenet

             let recommendationHtml = '<p style="color:var(--danger);">Hiba történt az elemzés során ennél a meccsnél.</p>';
            if (!result.error && result.html) {
                // Próbáljuk meg kinyerni a .master-recommendation-card részt
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = result.html;
                const recommendationCard = tempDiv.querySelector('.master-recommendation-card');
@@ -759,7 +750,6 @@ async function runMultiAnalysis() {
            } else if (result.error) {
                 recommendationHtml = `<p style="color:var(--danger);">Hiba: ${result.error}</p>`;
            }

            resultsContainer.innerHTML += `
                <div class="multi-analysis-item">
                    ${matchHeader}
@@ -768,18 +758,13 @@ async function runMultiAnalysis() {
            `;
        });

         // Töröljük a kijelölést az elemzés után
         appState.selectedMatches.clear();
         document.querySelectorAll('.selectable-card.selected, .selectable-item.selected').forEach(el => el.classList.remove('selected'));
         document.querySelectorAll('.match-checkbox:checked').forEach(cb => cb.checked = false);
         updateMultiSelectButton();


    } catch (e) {
         // Ez az ág elvileg nem fut le a Promise.all miatt, mert a hibákat már a .catch kezeli
         console.error("Váratlan hiba a többes elemzés során:", e);
         loadingContainer.innerHTML = '';
         resultsContainer.innerHTML = `<p style="color:var(--danger); text-align:center;">Váratlan hiba történt az elemzések összesítésekor: ${e.message}</p>`;
    }
function updateMultiSelectButton() {
    const btn = document.getElementById('multiAnalysisBtn');
    if (!btn) return;
    const count = appState.selectedMatches.size;
    btn.textContent = `Kiválasztottak Elemzése (${count})`;
    btn.disabled = count === 0 || count > 3;
}
// === ÚJ FUNKCIÓK VÉGE ===
