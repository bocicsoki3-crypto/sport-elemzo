// --- script.js (v63.3 - P1 Hiányzó Modal UI) ---
// MÓDOSÍTÁS (Feladat 5):
// 1. MEGVÁLTOZTATVA: 'renderFixtures...' funkciók. A lenyíló <details> elem
//    eltávolítva, helyette egy "Hiányzók Megadása (0)" gomb jelenik meg.
// 2. ÚJ FUNKCIÓK: 'openP1AbsenteesModal', '_getAndRenderRosterModalHtml',
//    '_buildRosterModalHtml', 'handleP1CheckboxChange', 'handleP1Search'.
//    Ezek kezelik az új felugró ablakot, az API hívást, a kereshető
//    játékoslista renderelését és a kiválasztást.
// 3. ÚJ ÁLLAPOT: 'appState.p1SelectedAbsentees' (Map) hozzáadva,
//    hogy a kiválasztott hiányzókat a DOM helyett a memóriában tárolja.
// 4. MEGVÁLTOZTATVA: 'runAnalysisFromCard' és 'runMultiAnalysis' frissítve,
//    hogy a hiányzókat az 'appState.p1SelectedAbsentees' Map-ből olvassák ki.
// 5. TÖRÖLVE: 'handleRosterToggle' és 'addRosterToggleListeners' (már nincs rájuk szükség).

// --- 1. ALKALMAZÁS ÁLLAPOT ---
const appState = {
    gasUrl: 'https://king-ai-backend.onrender.com', 
    fixtures: [], 
    currentSport: 'soccer',
    sheetUrl: '',
    currentAnalysisContext: '',
    chatHistory: [],
    selectedMatches: new Set(),
    authToken: null,
    // v62.1: Globális gyorsítótár a kereteknek
    rosterCache: new Map(),
    // v63.3: Globális gyorsítótár a P1 kiválasztott hiányzóknak
    // Struktúra: Map<matchId, { home: string[], away: string[] }>
    p1SelectedAbsentees: new Map()
};
// --- 2. LIGA KATEGÓRIÁK ---
const LEAGUE_CATEGORIES = {
    soccer: {
        'Top Ligák': [ 'Champions League', 'Premier League', 'Bundesliga', 'LaLiga', 'Serie A' ],
        'Kiemelt Bajnokságok': [ 'Europa League', 'Ligue 1', 'Eredivisie', 'Liga Portugal' ],
        'Figyelmet Érdemlő': [ 'Championship', '2.Bundesliga', 'Serie B', 'LaLiga2', 'Super Lig', 'Premiership', 'MLS' ],
        'Egyéb Meccsek': [ 'FIFA World Cup', 'UEFA European Championship', 'Conference League', 'Serie A (Brazil)', 'Argentinian Liga Profesional', 'J1 League', 'Allsvenskan', 'Super League 1' ]
    },
    hockey: {
        'Top Ligák': [ 'NHL' ],
        'Kiemelt Bajnokságok': [ 'KHL', 'SHL', 'Liiga', 'DEL', 'AHL', 'ICEHL', 'Champions Hockey League' ],
        'Egyéb Meccsek': [ 'IIHF World Championship', 'Olimpiai Játékok', 'Spengler Cup', 'Extraliga' ]
 
   },
    basketball: {
        'Top Ligák': [ 'NBA', 'Euroleague' ],
        'Kiemelt Bajnokságok': [ 'Liga ACB', 'BSL', 'BBL', 'Lega A' ],
        'Egyéb Meccsek': [ 'FIBA World Cup', 'Olimpiai Játékok', 'EuroBasket', 'FIBA Champions League', 'EuroCup', 'LNB Pro A' ]
    }
};
// --- 3. SEGÉDFÜGGVÉNY DEFINÍCIÓK (DEFINÍCIÓK) ---

// === Biztonsági és Hálózati Függvények ===

/**
 * Biztonságos fetch hívás a JWT token hozzáadásával.
 */
async function fetchWithAuth(url, options = {}) {
    if (!appState.authToken) {
        showToast("Hitelesítés lejárt. Kérlek, lépj be újra.", "error");
        sessionStorage.removeItem('authToken');
        location.reload();
        throw new Error("Nincs hitelesítési token.");
    }
    const defaultHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${appState.authToken}`
    };
    const config = {
         ...options,
        headers: {
            ...defaultHeaders,
            ...(options.headers || {}), // Biztonságosabb objektum kiterjesztés
        }
    };
    const response = await fetch(url, config);
    if (response.status === 401) { 
        showToast("Hitelesítés lejárt vagy érvénytelen. Kérlek, lépj be újra.", "error");
        sessionStorage.removeItem('authToken');
        appState.authToken = null;
        (document.getElementById('login-overlay')).style.display = 'flex';
        (document.querySelector('.app-container')).style.display = 'none';
        throw new Error("Hitelesítés sikertelen (401).");
    }
    return response;
}

/**
 * Egységes hibakezelő a fetch válaszokhoz.
 */
async function handleFetchError(response) {
    try {
        const errorData = await response.json();
        throw new Error(`Szerver hiba (${response.status}): ${errorData.error || response.statusText}`);
    } catch (jsonError) {
        throw new Error(`Hálózati hiba: ${response.status} ${response.statusText}`);
    }
}

// === Fő Adatkezelő Funkciók ===

async function loadFixtures() {
    const loadBtn = document.getElementById('loadFixturesBtn');
    loadBtn.disabled = true;
    loadBtn.textContent = 'Betöltés...';
    appState.selectedMatches.clear(); 
    appState.rosterCache.clear(); // v62.1
    appState.p1SelectedAbsentees.clear(); // v63.3
    updateMultiSelectButton();
    try {
        const response = await fetchWithAuth(`${appState.gasUrl}/getFixtures?sport=${appState.currentSport}&days=2`);
        if (!response.ok) await handleFetchError(response);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        appState.fixtures = (data.fixtures || []).map((fx) => ({
             ...fx,
            uniqueId: `${appState.currentSport}_${fx.home.toLowerCase().replace(/\s+/g, '')}_${fx.away.toLowerCase().replace(/\s+/g, '')}`
        }));
        sessionStorage.setItem('openingOdds', JSON.stringify(data.odds || {}));
        
        if (isMobile()) {
            renderFixturesForMobileList(appState.fixtures);
        } else {
            renderFixturesForDesktop(appState.fixtures);
        }
        
        addCheckboxListeners();
        // === MÓDOSÍTÁS (v63.3): Régi listener cserélve az újra ===
        addP1ModalButtonListeners();
        
        (document.getElementById('userInfo')).textContent = `Csatlakozva (Meccsek betöltve)`;
        (document.getElementById('placeholder')).style.display = 'none';
    
    } catch (e) {
        showToast(`Hiba a meccsek betöltésekor: ${e.message}`, 'error');
        (document.getElementById('userInfo')).textContent = `Hiba a csatlakozáskor`;
        (document.getElementById('placeholder')).style.display = 'flex'; 
        (document.getElementById('kanban-board')).innerHTML = '';
        (document.getElementById('mobile-list-container')).innerHTML = '';
        console.error(e);
    } finally {
        loadBtn.disabled = false;
        loadBtn.textContent = 'Meccsek Betöltése';
    }
}

/**
 * v63.3: Kezeli a P1 Komponens (4-mezős) xG-t ÉS a P1 Manuális Hiányzókat (az appState-ből)
 */
function runAnalysisFromCard(buttonElement, home, away, utcKickoff, leagueName) {
    const card = buttonElement.closest('.match-card, .list-item');
    if (!card) return;
    
    const matchId = card.dataset.matchId;
    
    // 1. P1 Komponens (4 mező) olvasása
    const H_xG_raw = card.querySelector('.xg-input-h-xg')?.value;
    const H_xGA_raw = card.querySelector('.xg-input-h-xga')?.value;
    const A_xG_raw = card.querySelector('.xg-input-a-xg')?.value;
    const A_xGA_raw = card.querySelector('.xg-input-a-xga')?.value;
    
    let manualXgData = {};
    if (H_xG_raw && H_xGA_raw && A_xG_raw && A_xGA_raw) {
        const H_xG = parseFloat(H_xG_raw.replace(',', '.'));
        const H_xGA = parseFloat(H_xGA_raw.replace(',', '.'));
        const A_xG = parseFloat(A_xG_raw.replace(',', '.'));
        const A_xGA = parseFloat(A_xGA_raw.replace(',', '.'));
        if (!isNaN(H_xG) && !isNaN(H_xGA) && !isNaN(A_xG) && !isNaN(A_xGA)) {
            manualXgData = {
                manual_H_xG: H_xG,
                manual_H_xGA: H_xGA,
                manual_A_xG: A_xG,
                manual_A_xGA: A_xGA
            };
            console.log('Manuális (Komponens) xG-t küldök:', manualXgData);
        } else {
            showToast('Manuális Komponens xG: Érvénytelen számformátum. Az xG felülbírálás kihagyva.', 'error');
        }
    }

    // 2. MÓDOSÍTÁS (v63.3): P1 Manuális Hiányzók olvasása az appState-ből (nem a DOM-ból)
    if (matchId && appState.p1SelectedAbsentees.has(matchId)) {
        const manualAbsentees = appState.p1SelectedAbsentees.get(matchId);
        if (manualAbsentees.home.length > 0 || manualAbsentees.away.length > 0) {
            (manualXgData).manual_absentees = manualAbsentees;
            console.log('Manuális (P1) Hiányzókat küldök az appState-ből:', manualAbsentees);
        }
    }
    
    runAnalysis(home, away, utcKickoff, leagueName, true, manualXgData);
}

/**
 * v62.1: Kezeli a P1 Komponens xG-t ÉS a P1 Manuális Hiányzókat
 */
async function runAnalysis(home, away, utcKickoff, leagueName, forceNew = false, manualXg = {}) {
    home = unescape(home);
    away = unescape(away);
    
    if (isMobile() && forceNew) {
        showToast("Elemzés folyamatban... Ez hosszabb időt vehet igénybe.", 'info', 6000);
    }

    openModal(`${home} vs ${away}`, (document.getElementById('common-elements')).innerHTML, 'modal-xl');
    
    const modalSkeleton = document.querySelector('#modal-container #loading-skeleton');
    const modalResults = document.querySelector('#modal-container #analysis-results');
    const modalChatContainer = document.querySelector('#modal-container #chat-container');
    
    modalResults.innerHTML = '';
    modalChatContainer.style.display = 'none';
    modalSkeleton.classList.add('active');
    
    const chatInput = modalChatContainer.querySelector('#chat-input');
    const chatSendBtn = modalChatContainer.querySelector('#chat-send-btn');
    chatSendBtn.onclick = sendChatMessage;
    chatInput.onkeyup = (e) => e.key === "Enter" && sendChatMessage();
    try {
        const analysisUrl = `${appState.gasUrl}/runAnalysis`;
        const openingOdds = sessionStorage.getItem('openingOdds') || '{}';
        const payload = {
            home: home,
            away: away,
            sport: appState.currentSport,
            force: forceNew,
            utcKickoff: utcKickoff,
            leagueName: leagueName || '', 
            sheetUrl: appState.sheetUrl,
            openingOdds: JSON.parse(openingOdds),
            ...manualXg // Itt adjuk át a P1 Komponenst és a P1 Hiányzókat
        };
        // v61.0: Biztosítjuk, hogy a hibás 2-mezős adatok ne kerüljenek elküldésre
        delete (payload).manual_xg_home;
        delete (payload).manual_xg_away;
        
        const response = await fetchWithAuth(analysisUrl, {
            method: 'POST',
            body: JSON.stringify(payload) 
        });
        if (!response.ok) await handleFetchError(response);

        const data = await response.json();
        if (data.error) throw new Error(data.error);
        const { analysisData, debugInfo } = data;

        // v62.1: A kapott keretadatok mentése a globális cache-be
        if (analysisData.availableRosters) {
            const uniqueId = `${appState.currentSport}_${home.toLowerCase().replace(/\s+/g, '')}_${away.toLowerCase().replace(/\s+/g, '')}`;
            appState.rosterCache.set(uniqueId, analysisData.availableRosters);
        }
        
        // === MÓDOSÍTÁS (v63.1) ===
        // Most már átadjuk a 'finalConfidenceScore'-t is, hogy a "Bizalmi Híd" a helyes (Stratéga) pontszámot mutassa
        const finalHtml = buildAnalysisHtml_CLIENTSIDE(
            analysisData.committee,
            analysisData.matchData,
            analysisData.oddsData,
            analysisData.valueBets,
            analysisData.modelConfidence, // Quant Bizalom
            analysisData.finalConfidenceScore, // Stratéga Bizalom
            analysisData.sim,
            analysisData.recommendation,
            analysisData.availableRosters, // v63.3: Átadjuk a renderelőnek, hogy a modalban is működjön
            matchId // v63.3: Átadjuk az ID-t a modal hívásához
        );
        modalResults.innerHTML = `<div class="analysis-body">${finalHtml}</div>`;
        modalResults.innerHTML += `<p class="muted" style="text-align: center; margin-top: 1rem; font-size: 0.8rem;">xG Forrás: ${analysisData.xgSource || 'Ismeretlen'}</p>`;
        // v59.0: A #chat-container áthelyezése a 'common-elements'-ből a 'chat-content-wrapper'-be
        const chatWrapper = modalResults.querySelector('#chat-content-wrapper');
        if (chatWrapper) {
            chatWrapper.appendChild(modalChatContainer);
        }

        // === MÓDOSÍTÁS (6 FŐS BIZOTTSÁG) ===
        // Az appState.currentAnalysisContext feltöltése az ÚJ lánc kimenetével
        const { committee, recommendation } = analysisData;
        appState.currentAnalysisContext = `Fő elemzés: ${committee.strategist?.strategic_synthesis || 'N/A'}\n
Prófécia: ${committee.strategist?.prophetic_timeline || 'N/A'}\n
Kritika: ${committee.critic?.tactical_summary || 'N/A'}\n
Ajánlás: ${recommendation.recommended_bet} (Bizalom: ${recommendation.final_confidence})`;
            
        appState.chatHistory = [];
        modalSkeleton.classList.remove('active');
        modalChatContainer.style.display = 'block';
        (modalChatContainer.querySelector('#chat-messages')).innerHTML = '';
        
        // === ÚJ (v63.3) ===
        // Eseményfigyelő hozzáadása az elemzési modalon belüli "Hiányzók Megadása" gombhoz
        addP1ModalButtonListeners('#modal-container');
        
    } catch (e) {
        modalResults.innerHTML = `<p style="color:var(--danger); text-align:center; padding: 2rem;">Hiba történt az elemzés során: ${e.message}</p>`;
        modalSkeleton.classList.remove('active'); 
        console.error(e);
    }
}

async function openHistoryModal() {
    const modalSize = isMobile() ? 'modal-fullscreen' : 'modal-lg';
    const loadingHTML = (document.getElementById('loading-skeleton')).outerHTML;
    openModal('Előzmények', loadingHTML, modalSize); 
    (document.querySelector('#modal-container #loading-skeleton')).classList.add('active');
    
    try {
        const response = await fetchWithAuth(`${appState.gasUrl}/getHistory`);
        if (!response.ok) await handleFetchError(response);
        
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        
        (document.getElementById('modal-body')).innerHTML = renderHistory(data.history || []);
    } catch (e) {
        (document.getElementById('modal-body')).innerHTML = `<p class="muted" style="color:var(--danger); text-align:center; padding: 2rem;">Hiba az előzmények betöltésekor: ${e.message}</p>`;
        console.error(e);
    }
}

async function deleteHistoryItem(id) {
    if (!confirm("Biztosan törölni szeretnéd ezt az elemet a naplóból? Ez a művelet nem vonható vissza.")) return;
    try {
        const response = await fetchWithAuth(`${appState.gasUrl}/deleteHistoryItem`, {
            method: 'POST',
            body: JSON.stringify({ id: id }) 
        });
        if (!response.ok) await handleFetchError(response); 

        const data = await response.json();
        if (data.error) throw new Error(data.error); 

        showToast('Elem sikeresen törölve.', 'success');
        openHistoryModal();
    } catch (e) {
        showToast(`Hiba a törlés során: ${e.message}`, 'error');
        console.error(e);
    }
}

async function runFinalCheck(home, away, sport) {
    alert("A 'Végső Ellenőrzés' funkció jelenleg nincs implementálva a szerver oldalon.");
}

async function viewHistoryDetail(id) {
    const originalId = unescape(id);
    openModal('Elemzés Betöltése...', (document.getElementById('loading-skeleton')).outerHTML, 'modal-xl');
    (document.querySelector('#modal-container #loading-skeleton')).classList.add('active');
    try {
        const response = await fetchWithAuth(`${appState.gasUrl}/getAnalysisDetail?id=${encodeURIComponent(originalId)}`);
        if (!response.ok) await handleFetchError(response);
        const data = await response.json();
        if (data.error) throw new Error(data.error); 

        const { record } = data;
        if (!record || !record.html) throw new Error("A szerver nem találta a kért elemzést, vagy az hiányos.");
        
        (document.getElementById('modal-title')).textContent = `${record.home || 'Ismeretlen'} vs ${record.away || 'Ismeretlen'}`;
        const modalBody = document.getElementById('modal-body');

        let contentToDisplay = "";
        if (record.html.startsWith("JSON_API_MODE")) {
            // Próbáljuk meg az új (v63.0) módban renderelni
            if (record.html.includes("v63.0 Lánc") || record.html.includes("v63.1 Lánc")) { // Módosítva
                 contentToDisplay = `<p class="muted" style="text-align:center; padding: 2rem;">Ez egy "v63.x Bizottsági Lánc" elemzés.<br>A mentett JSON adatok visszatöltése és újrarajzolása jelenleg még nincs implementálva.</p>`;
            } else {
                 contentToDisplay = `<p class="muted" style="text-align:center; padding: 2rem;">Ez egy régebbi (v55-v62) JSON API-n keresztül mentett elemzés.<br>A JSON adatok újrafeldolgozása a v63.x nézethez nem lehetséges.<br><br><i>${escapeHTML(record.html)}</i></p>`;
            }
        } else {
            contentToDisplay = `<div class="analysis-body">${record.html}</div>`;
            // Régi HTML-alapú mentések
        }

        modalBody.innerHTML = (document.getElementById('common-elements')).innerHTML;
        (modalBody.querySelector('#loading-skeleton')).style.display = 'none'; 
        (modalBody.querySelector('#analysis-results')).innerHTML = contentToDisplay;
        const modalChat = modalBody.querySelector('#chat-container');
        modalChat.style.display = 'none';
    } catch(e) {
         (document.getElementById('modal-body')).innerHTML = `<p style="color:var(--danger); text-align:center; padding: 2rem;">Hiba a részletek betöltésekor: ${e.message}</p>`;
        console.error("Hiba a részletek megtekintésekor:", e);
    }
}

async function sendChatMessage() {
    const modal = document.getElementById('modal-container');
    const input = modal.querySelector('#chat-input');
    const messagesContainer = modal.querySelector('#chat-messages'); 
    const thinkingIndicator = modal.querySelector('#chat-thinking-indicator');
    const sendButton = modal.querySelector('#chat-send-btn'); 

    const message = input.value.trim();
    if (!message) return;
    addMessageToChat(message, 'user');
    input.value = '';
    thinkingIndicator.style.display = 'block'; 
    sendButton.disabled = true;
    input.disabled = true;
    try {
        const response = await fetchWithAuth(`${appState.gasUrl}/askChat`, {
            method: 'POST',
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
        addMessageToChat(`Hiba történt a válasszal: ${e.message}`, 'ai');
        console.error(e);
    } finally {
        thinkingIndicator.style.display = 'none';
        sendButton.disabled = false;
        input.disabled = false;
        input.focus();
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

/**
 * v63.3: Kezeli a P1 Komponens xG-t ÉS a P1 Manuális Hiányzókat (az appState-ből)
 */
async function runMultiAnalysis() {
    const selectedIds = Array.from(appState.selectedMatches);
    if (selectedIds.length === 0 || selectedIds.length > 3) {
        showToast('Válassz ki 1-3 meccset a többes elemzéshez.', 'error');
        return;
    }
    
    const matchesToAnalyze = appState.fixtures.filter(fx => selectedIds.includes(fx.uniqueId));
    if (matchesToAnalyze.length !== selectedIds.length) {
         showToast('Hiba: Nem található minden kiválasztott meccs. Próbáld újra betölteni a meccseket.', 'error');
        return;
    }

    openModal(`Többes Elemzés (${matchesToAnalyze.length} meccs)`, '<div id="multi-analysis-results"></div><div id="multi-loading-skeleton" style="padding: 1rem;"></div>', 'modal-xl');
    
    const resultsContainer = document.getElementById('multi-analysis-results');
    const loadingContainer = document.getElementById('multi-loading-skeleton');

    loadingContainer.innerHTML = (document.getElementById('loading-skeleton')).outerHTML;
    const modalSkeleton = loadingContainer.querySelector('.loading-skeleton');
    if (modalSkeleton) modalSkeleton.classList.add('active');
    const analysisPromises = matchesToAnalyze.map(match => {
        const analysisUrl = `${appState.gasUrl}/runAnalysis`;
        
        // v63.3: Ellenőrizzük a P1 adatokat a kártyáról (xG) és az appState-ből (Hiányzók)
        const card = document.querySelector(`.selectable-card[data-match-id="${match.uniqueId}"], .selectable-item[data-match-id="${match.uniqueId}"]`);
        let manualXgData = {};
        
        if (card) {
            // 1. P1 Komponens xG
            const H_xG_raw = card.querySelector('.xg-input-h-xg')?.value;
            const H_xGA_raw = card.querySelector('.xg-input-h-xga')?.value;
            const A_xG_raw = card.querySelector('.xg-input-a-xg')?.value;
            const A_xGA_raw = card.querySelector('.xg-input-a-xga')?.value;
            
            if (H_xG_raw && H_xGA_raw && A_xG_raw && A_xGA_raw) {
                const H_xG = parseFloat(H_xG_raw.replace(',', '.'));
                const H_xGA = parseFloat(H_xGA_raw.replace(',', '.'));
                const A_xG = parseFloat(A_xG_raw.replace(',', '.'));
                const A_xGA = parseFloat(A_xGA_raw.replace(',', '.'));
                if (!isNaN(H_xG) && !isNaN(H_xGA) && !isNaN(A_xG) && !isNaN(A_xGA)) {
                    manualXgData = {
                        manual_H_xG: H_xG,
                        manual_H_xGA: H_xGA,
                        manual_A_xG: A_xG,
                        manual_A_xGA: A_xGA
                    };
                }
            }
        }
            
        // 2. P1 Hiányzók (az appState-ből)
        if (appState.p1SelectedAbsentees.has(match.uniqueId)) {
            const manualAbsentees = appState.p1SelectedAbsentees.get(match.uniqueId);
            if (manualAbsentees.home.length > 0 || manualAbsentees.away.length > 0) {
                (manualXgData).manual_absentees = manualAbsentees;
            }
        }
        
        const payload = {
            home: match.home,
            away: match.away,
             sport: appState.currentSport,
            force: true, 
             utcKickoff: match.utcKickoff,
            leagueName: match.league || '',
            sheetUrl: appState.sheetUrl,
            openingOdds: JSON.parse(sessionStorage.getItem('openingOdds') || '{}'),
            ...manualXgData // Itt adjuk át a P1 xG-t és Hiányzókat
        };
        return fetchWithAuth(analysisUrl, {
            method: 'POST',
            body: JSON.stringify(payload) 
         })
         .then(response => { 
            if (!response.ok) { 
                return response.json().then(errorData => { 
                    throw new Error(`Szerver hiba (${response.status}): ${errorData.error || response.statusText}`);
                }).catch(() => { 
                    throw new Error(`Hálózati hiba: ${response.status} ${response.statusText}`);
                });
            }
            return response.json();
       })
        .then(data => { 
            if (data.error) throw new Error(`Elemzési hiba (${match.home} vs ${match.away}): ${data.error}`);
            return { match: `${match.home} vs ${match.away}`, analysisData: data.analysisData };
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
             let recommendationHtml = '<p style="color:var(--danger);">Ismeretlen hiba történt az elemzés során ennél a meccsnél.</p>'; 

            if (!result.error && result.analysisData) { 
                const rec = result.analysisData.recommendation;
                if (rec) {
                    const highlightedReasoning = _highlightKeywords(rec.brief_reasoning, [result.analysisData.matchData.home, result.analysisData.matchData.away]);
                    recommendationHtml = `
                        <div class="master-recommendation-card" style="margin-top:0; padding: 1rem; border: none; box-shadow: none; animation: none; background: transparent;">
                            <div class="master-bet"><strong>${escapeHTML(rec.recommended_bet)}</strong></div>
                             <div class="master-confidence">
                                Végső Bizalom: <strong class="glowing-text-white">${parseFloat(rec.final_confidence || 1.0).toFixed(1)}/10</strong>
                            </div>
                             <div class="master-reasoning" style="font-size: 0.9rem;">${highlightedReasoning}</div>
                        </div>`;
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
         document.querySelectorAll('.match-checkbox:checked').forEach(cb => ((cb)).checked = false);
         updateMultiSelectButton();
    } catch (e) { 
         console.error("Váratlan hiba a többes elemzés során:", e);
        loadingContainer.innerHTML = ''; 
         resultsContainer.innerHTML = `<p style="color:var(--danger); text-align:center;">Váratlan hiba történt az elemzések összesítésekor: ${e.message}</p>`;
    }
}

// === Dátum és Adatkezelő Segédfüggvények ===

const parseHungarianDate = (huDate) => {
    let date = new Date(huDate);
    if (!isNaN(date.getTime())) { return date; }
    const parts = huDate.split('.').map(p => p.trim()).filter(p => p);
    if (parts.length >= 3) {
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1; 
        const day = parseInt(parts[2]);
        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
            date = new Date(Date.UTC(year, month, day));
            if (!isNaN(date.getTime())) { return date; }
        }
    }
    console.warn(`Nem sikerült feldolgozni a magyar dátumot: ${huDate}`);
    return new Date('invalid date');
};

function handleSportChange() {
    appState.currentSport = (document.getElementById('sportSelector')).value;
    appState.selectedMatches.clear(); 
    appState.rosterCache.clear();
    appState.p1SelectedAbsentees.clear(); // v63.3
    (document.getElementById('kanban-board')).innerHTML = '';
    (document.getElementById('mobile-list-container')).innerHTML = '';
    (document.getElementById('placeholder')).style.display = 'flex'; 
    updateMultiSelectButton();
}

/**
 * v62.1: Kezeli a P1 Komponens xG-t ÉS a P1 Manuális Hiányzókat (szövegesen)
 */
function openManualAnalysisModal() {
    let content = `
        <div class="control-group">
            <label for="manual-home">Hazai csapat</label>
            <input id="manual-home" placeholder="Pl. Liverpool"/>
        </div>
        <div class="control-group" style="margin-top: 1rem;">
            <label for="manual-away">Vendég csapat</label>
            <input id="manual-away" placeholder="Pl. Manchester City"/>
        </div>
        <div class="control-group" style="margin-top: 1rem;">
            <label for="manual-league">Bajnokságnév (Pontos ESPN név)</label>
            <input id="manual-league" placeholder="Pl. Premier League"/>
        </div>
        <div class="control-group" style="margin-top: 1rem;">
            <label for="manual-kickoff">Kezdési idő (UTC Dátum és Idő)</label>
            <input id="manual-kickoff" type="datetime-local" placeholder="Válassz időpontot"/>
        </div>
        
        <h5 style="margin-top: 2rem; margin-bottom: 1rem; color: var(--primary);">Opcionális P1 xG Felülbírálás (4-Komponensű)</h5>
        <div class="manual-xg-grid" style="margin-top: 0.5rem;">
            <input type="text" inputmode="decimal" placeholder="H xG" class="xg-input" id="manual-h-xg" title="Hazai Csapat (Home) xG/90">
            <input type="text" inputmode="decimal" placeholder="H xGA" class="xg-input" id="manual-h-xga" title="Hazai Csapat (Home) xGA/90">
            <input type="text" inputmode="decimal" placeholder="V xG" class="xg-input" id="manual-a-xg" title="Vendég Csapat (Away) xG/90">
            <input type="text" inputmode="decimal" placeholder="V xGA" class="xg-input" id="manual-a-xga" title="Vendég Csapat (Away) xGA/90">
        </div>

        <h5 style="margin-top: 1.5rem; margin-bottom: 1rem; color: var(--primary);">Opcionális P1 Hiányzó Felülbírálás</h5>
        <div class="control-group" style="margin-top: 0.5rem;">
            <label for="manual-abs-home">Hazai kulcshiányzók (vesszővel elválasztva)</label>
            <input id="manual-abs-home" class="xg-input" style="text-align: left;" placeholder="Pl. Kovács, Nagy"/>
        </div>
        <div class="control-group" style="margin-top: 0.5rem;">
            <label for="manual-abs-away">Vendég kulcshiányzók (vesszővel elválasztva)</label>
            <input id="manual-abs-away" class="xg-input" style="text-align: left;" placeholder="Pl. Szabó"/>
        </div>
        
        <button id="run-manual-btn" class="btn btn-primary" style="width:100%; margin-top:1.5rem;">Elemzés Futtatása</button>
    `;
    openModal('Kézi Elemzés Indítása', content, 'modal-sm');
    
    (document.getElementById('run-manual-btn')).onclick = runManualAnalysis;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(15, 0, 0, 0);
    const kickoffInput = (document.getElementById('manual-kickoff'));
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const day = String(tomorrow.getDate()).padStart(2, '0');
    const hours = String(tomorrow.getHours()).padStart(2, '0');
    const minutes = String(tomorrow.getMinutes()).padStart(2, '0');
    kickoffInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * v62.1: Kezeli a P1 Komponens xG-t ÉS a P1 Manuális Hiányzókat (szövegesen)
 */
function runManualAnalysis() {
    const home = (document.getElementById('manual-home')).value.trim();
    const away = (document.getElementById('manual-away')).value.trim();
    const leagueName = (document.getElementById('manual-league')).value.trim();
    const kickoffLocal = (document.getElementById('manual-kickoff')).value;
    
    const H_xG_raw = (document.getElementById('manual-h-xg')).value;
    const H_xGA_raw = (document.getElementById('manual-h-xga')).value;
    const A_xG_raw = (document.getElementById('manual-a-xg')).value;
    const A_xGA_raw = (document.getElementById('manual-a-xga')).value;
    
    const Abs_H_raw = (document.getElementById('manual-abs-home')).value;
    const Abs_A_raw = (document.getElementById('manual-abs-away')).value;
    
    let manualXgData = {};
    if (!home || !away || !leagueName) { 
        showToast('Minden kötelező mezőt ki kell tölteni (Hazai, Vendég, Bajnokságnév).', 'error');
        return;
    }
    if (!kickoffLocal) {
        showToast('Kérlek, add meg a kezdési időpontot.', 'error');
        return;
    }

    if (H_xG_raw && H_xGA_raw && A_xG_raw && A_xGA_raw) {
        const H_xG = parseFloat(H_xG_raw.replace(',', '.'));
        const H_xGA = parseFloat(H_xGA_raw.replace(',', '.'));
        const A_xG = parseFloat(A_xG_raw.replace(',', '.'));
        const A_xGA = parseFloat(A_xGA_raw.replace(',', '.'));
        if (!isNaN(H_xG) && !isNaN(H_xGA) && !isNaN(A_xG) && !isNaN(A_xGA)) {
            manualXgData = {
                manual_H_xG: H_xG,
                manual_H_xGA: H_xGA,
                manual_A_xG: A_xG,
                manual_A_xGA: A_xGA
            };
            console.log('Manuális (Komponens) xG-t küldök a kézi modalból:', manualXgData);
        } else {
            showToast('Manuális Komponens xG: Érvénytelen számformátum. Az xG felülbírálás kihagyva.', 'error');
        }
    }
    
    const manualAbsentees = {
        home: Abs_H_raw.split(',').map(s => s.trim()).filter(Boolean),
        away: Abs_A_raw.split(',').map(s => s.trim()).filter(Boolean)
    };
    if (manualAbsentees.home.length > 0 || manualAbsentees.away.length > 0) {
        (manualXgData).manual_absentees = manualAbsentees;
        console.log('Manuális (P1) Hiányzókat küldök a kézi modalból:', manualAbsentees);
    }

    try {
        const kickoffDate = new Date(kickoffLocal);
        if (isNaN(kickoffDate.getTime())) {
             throw new Error('Érvénytelen dátum formátum.');
        }
        const utcKickoff = kickoffDate.toISOString();

        closeModal();
        runAnalysis(home, away, utcKickoff, leagueName, true, manualXgData);
    } catch (e) {
         showToast(`Hiba a dátum feldolgozásakor: ${e.message}`, 'error');
        console.error("Dátum hiba:", e);
    }
}

function isMobile() { return window.innerWidth <= 1024; } 

function getLeagueGroup(leagueName) {
    if (!leagueName || typeof leagueName !== 'string') return 'Egyéb Meccsek';
    const sportGroups = LEAGUE_CATEGORIES[appState.currentSport] || {};
    const lowerLeagueName = leagueName.toLowerCase().trim();
    for (const groupName in sportGroups) {
        if (sportGroups[groupName].some(l => lowerLeagueName === l.toLowerCase())) {
            return groupName;
        }
    }
    for (const groupName in sportGroups) {
        if (sportGroups[groupName].some(l => lowerLeagueName.includes(l.toLowerCase()))) {
            return groupName;
        }
    }
    return 'Egyéb Meccsek';
}

/**
 * v63.3: Megjeleníti a 4-komponensű P1 xG-t ÉS az ÚJ P1 Hiányzó Gombot
 */
function renderFixturesForDesktop(fixtures) {
    const board = document.getElementById('kanban-board');
    if (!board) return;
    
    (document.getElementById('placeholder')).style.display = 'none';
    board.innerHTML = '';
    const groupOrder = ['Top Ligák', 'Kiemelt Bajnokságok', 'Figyelmet Érdemlő', 'Egyéb Meccsek'];
    const groupedByCategory = groupBy(fixtures, (fx) => getLeagueGroup(fx.league));
    
    groupOrder.forEach(group => { 
        let columnContent = ''; 
        let cardIndex = 0; 

        if (groupedByCategory[group]) { 
            const groupedByDate = groupBy(groupedByCategory[group], (fx) => {
                try { return new Date(fx.utcKickoff).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }); } 
                catch (e) { return 'Ismeretlen dátum'; } 
            });

            Object.keys(groupedByDate)
                .sort((a, b) => parseHungarianDate(a).getTime() - parseHungarianDate(b).getTime()) 
                .forEach(dateKey => {
                    columnContent += `<details class="date-section" open><summary>${formatDateLabel(dateKey)}</summary>`;
                    groupedByDate[dateKey]
                        .sort((a, b) => new Date(a.utcKickoff).getTime() - new Date(b.utcKickoff).getTime())
                        .forEach((fx) => { 
                            const time = new Date(fx.utcKickoff).toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' });
                            
                            // === MÓDOSÍTÁS (v63.3): Új P1 Gomb ===
                            const p1State = appState.p1SelectedAbsentees.get(fx.uniqueId) || { home: [], away: [] };
                            const p1Count = p1State.home.length + p1State.away.length;
                            
                            const rosterButtonHtml = `
                                <button class="btn btn-p1-absentees" data-match-id="${fx.uniqueId}" 
                                    data-home="${escape(fx.home)}" 
                                    data-away="${escape(fx.away)}" 
                                    data-league="${escape(fx.league || '')}" 
                                    data-kickoff="${escape(fx.utcKickoff)}"
                                    style="width: 100%; margin-top: 0.75rem; background: rgba(255,255,255,0.05);">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                                    P1 HIÁNYZÓK MEGADÁSA (${p1Count})
                                </button>`;
                            // === MÓDOSÍTÁS VÉGE ===

                            columnContent += `
                                <div class="match-card selectable-card ${appState.selectedMatches.has(fx.uniqueId) ? 'selected' : ''}" data-match-id="${fx.uniqueId}" style="animation-delay: ${cardIndex * 0.05}s">
                                    <input type="checkbox" class="match-checkbox" data-match-id="${fx.uniqueId}" ${appState.selectedMatches.has(fx.uniqueId) ? 'checked' : ''}>
                                     <div class="match-card-content">
                                          <div class="match-card-teams">${fx.home} – ${fx.away}</div>
                                          <div class="match-card-meta">
                                              <span>${fx.league || 'Ismeretlen Liga'}</span>
                                              <span>${time}</span>
                                          </div>
                                          <p class="muted" style="font-size: 0.8rem; margin-top: 1rem; margin-bottom: 0.5rem; text-align: left;">P1 (Komponens) xG:</p>
                                          <div class="manual-xg-grid" style="margin-top: 0.5rem;">
                                              <input type="text" inputmode="decimal" placeholder="H xG" class="xg-input xg-input-h-xg" title="Hazai Csapat (Home) xG/90">
                                              <input type="text" inputmode="decimal" placeholder="H xGA" class="xg-input xg-input-h-xga" title="Hazai Csapat (Home) xGA/90">
                                              <input type="text" inputmode="decimal" placeholder="V xG" class="xg-input xg-input-a-xg" title="Vendég Csapat (Away) xG/90">
                                              <input type="text" inputmode="decimal" placeholder="V xGA" class="xg-input xg-input-a-xga" title="Vendég Csapat (Away) xGA/90">
                                          </div>
                                          
                                          ${(appState.currentSport === 'soccer') ? rosterButtonHtml : ''}
                                          
                                          <button class="btn btn-primary" 
                                            style="width: 100%; margin-top: 1rem;"
                                            onclick="runAnalysisFromCard(this, '${escape(fx.home)}', '${escape(fx.away)}', '${escape(fx.utcKickoff)}', '${escape(fx.league || '')}')">
                                            Elemzés Indítása
                                          </button>
                                    </div>
                                </div>`;
                            cardIndex++;
                        });
                    columnContent += `</details>`; 
                });
        }

        board.innerHTML += `
            <div class="kanban-column">
                <h4 class="kanban-column-header">${group}</h4>
                <div class="column-content">
                    ${columnContent || '<p class="muted" style="text-align: center; padding-top: 2rem;">Nincs meccs ebben a kategóriában.</p>'}
                </div>
            </div>`;
    });
}

/**
 * v63.3: Megjeleníti a 4-komponensű P1 xG-t ÉS az ÚJ P1 Hiányzó Gombot
 */
function renderFixturesForMobileList(fixtures) {
    const container = document.getElementById('mobile-list-container');
    if (!container) return;
    (document.getElementById('placeholder')).style.display = 'none'; 
    container.innerHTML = '';
    
    const groupOrder = ['Top Ligák', 'Kiemelt Bajnokságok', 'Figyelmet Érdemlő', 'Egyéb Meccsek'];
    const groupedByCategory = groupBy(fixtures, (fx) => getLeagueGroup(fx.league));
    let html = '';
    groupOrder.forEach(group => { 
        if (groupedByCategory[group]) { 
            html += `<h4 class="league-header-mobile">${group}</h4>`; 
            const groupedByDate = groupBy(groupedByCategory[group], (fx) => {
                try { return new Date(fx.utcKickoff).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }); }
                 catch (e) { return 'Ismeretlen dátum'; }
            });
            Object.keys(groupedByDate)
                .sort((a, b) => parseHungarianDate(a).getTime() - parseHungarianDate(b).getTime()) 
                .forEach(dateKey => {
                    html += `<div class="date-header-mobile">${formatDateLabel(dateKey)}</div>`; 
                
                    groupedByDate[dateKey]
                         .sort((a, b) => new Date(a.utcKickoff).getTime() - new Date(b.utcKickoff).getTime())
                        .forEach((fx) => { 
                            const time = new Date(fx.utcKickoff).toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' });
                            
                            // === MÓDOSÍTÁS (v63.3): Új P1 Gomb ===
                            const p1State = appState.p1SelectedAbsentees.get(fx.uniqueId) || { home: [], away: [] };
                            const p1Count = p1State.home.length + p1State.away.length;
                            
                            const rosterButtonHtml = `
                                <button class="btn btn-p1-absentees" data-match-id="${fx.uniqueId}" 
                                    data-home="${escape(fx.home)}" 
                                    data-away="${escape(fx.away)}" 
                                    data-league="${escape(fx.league || '')}" 
                                    data-kickoff="${escape(fx.utcKickoff)}"
                                    style="width: 100%; margin-top: 0.75rem; background: rgba(255,255,255,0.05); padding: 10px 16px; font-size: 0.9rem;">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                                    P1 HIÁNYZÓK (${p1Count})
                                </button>`;
                            // === MÓDOSÍTÁS VÉGE ===

                            html += `
                                <div class="list-item selectable-item ${appState.selectedMatches.has(fx.uniqueId) ? 'selected' : ''}" data-match-id="${fx.uniqueId}">
                                    <input type="checkbox" class="match-checkbox" data-match-id="${fx.uniqueId}" ${appState.selectedMatches.has(fx.uniqueId) ? 'checked' : ''}>
                                     
                                    <div class="list-item-content">
                                        <div class="list-item-title">${fx.home} – ${fx.away}</div>
                                        <div class="list-item-meta">${fx.league || 'Ismeretlen Liga'} - ${time}</div>
                                        
                                        <p class="muted" style="font-size: 0.8rem; margin-top: 0.75rem; margin-bottom: 0.5rem;">P1 (Komponens) xG:</p>
                                        <div class="manual-xg-grid" style="margin-top: 0.5rem;">
                                           <input type="text" inputmode="decimal" placeholder="H xG" class="xg-input xg-input-h-xg" title="Hazai Csapat (Home) xG/90">
                                           <input type="text" inputmode="decimal" placeholder="H xGA" class="xg-input xg-input-h-xga" title="Hazai Csapat (Home) xGA/90">
                                           <input type="text" inputmode="decimal" placeholder="V xG" class="xg-input xg-input-a-xg" title="Vendég Csapat (Away) xG/90">
                                           <input type="text" inputmode="decimal" placeholder="V xGA" class="xg-input xg-input-a-xga" title="Vendég Csapat (Away) xGA/90">
                                        </div>
                                        
                                        ${(appState.currentSport === 'soccer') ? rosterButtonHtml : ''}
                                    </div>

                                    <button class="btn btn-primary" 
                                        style="margin-right: 1rem; align-self: center;"
                                        onclick="runAnalysisFromCard(this, '${escape(fx.home)}', '${escape(fx.away)}', '${escape(fx.utcKickoff)}', '${escape(fx.league || '')}')">
                                        Elemzés
                                    </button>
                                </div>`;
                        });
                });
        }
    });
    container.innerHTML = html || '<p class="muted" style="text-align:center; padding: 2rem;">Nincsenek elérhető mérkőzések.</p>';
}
function renderHistory(historyData) {
    if (!historyData || !Array.isArray(historyData) || historyData.length === 0) {
        return '<p class="muted" style="text-align:center; padding: 2rem;">Nincsenek mentett előzmények.</p>';
    }
    const history = historyData.filter(item => item && item.id && item.home && item.away && item.date);
    if (history.length === 0) {
         return '<p class="muted" style="text-align:center; padding: 2rem;">Nincsenek érvényes előzmény adatok.</p>';
    }
    const groupedByDate = groupBy(history, (item) => {
        try { return new Date(item.date).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }); }
        catch (e) { return 'Ismeretlen dátum'; }
    });
    let html = '';
    Object.keys(groupedByDate)
        .sort((a, b) => parseHungarianDate(b).getTime() - parseHungarianDate(a).getTime()) 
        .forEach(dateKey => {
         html += `<details class="date-section"><summary>${formatDateLabel(dateKey)}</summary>`;
            const sortedItems = groupedByDate[dateKey].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            sortedItems.forEach((item) => {
                const analysisTime = new Date(item.date); 
                const time = isNaN(analysisTime.getTime()) ? 'Ismeretlen idő' : analysisTime.toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' });
                const safeItemId = escape(item.id);
                html += `
                    <div class="list-item">
                        <div style="flex-grow:1; cursor: pointer;" onclick="viewHistoryDetail('${safeItemId}')">
                             <div class="list-item-title">${item.home || '?'} – ${item.away || '?'}</div>
                            <div class="list-item-meta">${item.sport ? item.sport.charAt(0).toUpperCase() + item.sport.slice(1) : 'Sport?'} - Elemzés: ${time}</div>
                        </div>
                         <button class="btn" onclick="deleteHistoryItem('${safeItemId}'); event.stopPropagation();"
                            title="Törlés" style="color: var(--danger); border-color: var(--danger);">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                         </button>
                    </div>`;
            });
            html += `</details>`; 
        });
    return html;
}// === Dátum és Adatkezelő Segédfüggvények ===

function addMessageToChat(text, role) {
    const messagesContainer = document.querySelector('#modal-container #chat-messages');
    if (!messagesContainer) return;
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role}`;
    bubble.textContent = text;
    messagesContainer.appendChild(bubble); 
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function groupBy(arr, keyFn) {
    if (!Array.isArray(arr)) return {};
    return arr.reduce((acc, item) => {
        let key;
        try { key = keyFn(item); } catch (e) { key = 'hibás_kulcs'; }
        if (!acc[key]) acc[key] = [];
        acc[key].push(item); 
        return acc;
    }, {});
}

function formatDateLabel(dateStr) {
    const today = new Date().toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' });
    const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' });
    if (dateStr === today) return 'MA';
    if (dateStr === tomorrow) return 'HOLNAP';
    return dateStr;
}

// === UI Segédfüggvények (Modal, Toast, Stílusok) ===

function openModal(title, content = '', sizeClass = 'modal-xl') {
    const modalContainer = document.getElementById('modal-container');
    const modalContent = modalContainer.querySelector('.modal-content');
    modalContent.classList.remove('modal-sm', 'modal-lg', 'modal-xl', 'modal-fullscreen');
    modalContent.classList.add(sizeClass);
    (document.getElementById('modal-title')).textContent = title;
    (document.getElementById('modal-body')).innerHTML = content;
    modalContainer.classList.add('open');
    window.addEventListener('keydown', handleEscKey);
    modalContainer.addEventListener('click', handleOutsideClick);
}

function closeModal() {
    const modalContainer = document.getElementById('modal-container');
    modalContainer.classList.remove('open');
    window.removeEventListener('keydown', handleEscKey);
    modalContainer.removeEventListener('click', handleOutsideClick);
}

function handleEscKey(event) { if (event.key === 'Escape') closeModal(); }
function handleOutsideClick(event) { if (event.target === document.getElementById('modal-container')) closeModal();
}

function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-notification-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    toast.textContent = message; 
    container.appendChild(toast);
    const fadeOutTimer = setTimeout(() => {
        toast.style.animation = 'fadeOut 0.5s forwards'; 
        const removeTimer = setTimeout(() => toast.remove(), 500);
        (toast).dataset.removeTimer = removeTimer.toString();
    }, duration);
    toast.addEventListener('click', () => {
        clearTimeout(fadeOutTimer); 
        if ((toast).dataset.removeTimer) {
             clearTimeout(parseInt((toast).dataset.removeTimer)); 
        }
        toast.style.animation = 'fadeOut 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    });
}

function setupThemeSwitcher() {
    const themeSwitcher = document.getElementById('theme-switcher');
    const htmlEl = document.documentElement;
    const setIcon = (theme) => {
        themeSwitcher.innerHTML = theme === 'dark'
            ?
            '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>'
            : '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
    };
    const currentTheme = localStorage.getItem('theme') || 'dark';
    htmlEl.className = `${currentTheme}-theme`; 
    setIcon(currentTheme);
    themeSwitcher.addEventListener('click', () => {
        let newTheme = htmlEl.className.includes('dark') ? 'light' : 'dark'; 
        htmlEl.className = `${newTheme}-theme`; 
        localStorage.setItem('theme', newTheme); 
        setIcon(newTheme); 
    });
}

function createGlowingOrbs() {
    try {
        const orbContainer = document.createElement('div');
        orbContainer.className = 'orb-container';
        const appContainer = document.querySelector('.app-container');
        if (!appContainer) return;
        appContainer.appendChild(orbContainer);
        const orbCount = isMobile() ? 5 : 10;
        for (let i = 0; i < orbCount; i++) {
            const orb = document.createElement('div');
            orb.className = 'glowing-orb'; 
            const size = Math.random() * (isMobile() ? 20 : 30) + 10;
            const scale = Math.random() * 0.5 + 0.5;
            const opacity = Math.random() * 0.3 + 0.1;
            const duration = Math.random() * 20 + 15;
            const delay = Math.random() * -duration; 
            orb.style.width = `${size}px`;
            orb.style.height = `${size}px`;
            orb.style.setProperty('--scale', scale.toString());
            orb.style.setProperty('--opacity', opacity.toString());
            orb.style.animationDuration = `${duration}s`;
            orb.style.animationDelay = `${delay}s`;
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
        console.error("Hiba a háttér fénygömbök létrehozásakor:", e.message);
    }
}

function createHeaderOrbs() {
    try {
        const orbContainer = document.createElement('div');
        orbContainer.className = 'orb-container-header';
        const appHeader = document.querySelector('.app-header');
        if (!appHeader) return;
        appHeader.prepend(orbContainer);
        const orbCount = 3;
        for (let i = 0; i < orbCount; i++) {
            const orb = document.createElement('div');
            orb.className = 'glowing-orb-orange'; 
            const size = Math.random() * 10 + 5;
            const scale = Math.random() * 0.4 + 0.6;
            const opacity = Math.random() * 0.4 + 0.2;
            const duration = Math.random() * 8 + 6;
            const delay = Math.random() * -duration;
            orb.style.width = `${size}px`;
            orb.style.height = `${size}px`;
            orb.style.setProperty('--scale', scale.toString());
            orb.style.setProperty('--opacity', opacity.toString());
            orb.style.animationDuration = `${duration}s`;
            orb.style.animationDelay = `${delay}s`;
            const startX = Math.random() * 100;
            const startY = Math.random() * 80 - 10;
            const endX = Math.random() * 100;
            const endY = Math.random() * 80 - 10;
            orb.style.setProperty('--start-x', `${startX}vw`);
            orb.style.setProperty('--start-y', `${startY}px`);
            orb.style.setProperty('--end-x', `${endX}vw`);
            orb.style.setProperty('--end-y', `${endY}px`);
            orbContainer.appendChild(orb);
        }
    } catch (e) {
        console.error("Hiba a fejléc fénygömbök létrehozásakor:", e.message);
    }
}

// === Multi-Select UI Függvények (v62.1) ===

function initMultiSelect() {
    const controlsBarActions = document.querySelector('.controls-bar .main-actions');
    if (controlsBarActions) {
        const multiSelectButton = document.createElement('button');
        multiSelectButton.id = 'multiAnalysisBtn';
        multiSelectButton.className = 'btn btn-special btn-lg';
        multiSelectButton.textContent = 'Kiválasztottak Elemzése (0)';
        multiSelectButton.disabled = true;
        multiSelectButton.onclick = runMultiAnalysis;
        controlsBarActions.appendChild(multiSelectButton);
    } else {
        console.warn("Nem található a .controls-bar .main-actions elem a többes elemzés gomb inicializálásához.");
    }
}

function addCheckboxListeners() {
    const checkboxes = document.querySelectorAll('.match-checkbox');
    checkboxes.forEach(cb => {
        cb.removeEventListener('change', handleCheckboxChange);
        cb.addEventListener('change', handleCheckboxChange);
    });
}

// === ÚJ (v63.3): Eseményfigyelő a P1 Hiányzó Modal gombokhoz ===
function addP1ModalButtonListeners(scopeSelector = '') {
    // A scopeSelector lehetővé teszi, hogy csak a frissen megnyitott modalon belül keressünk
    const scope = scopeSelector ? document.querySelector(scopeSelector) : document;
    if (!scope) return;
    
    const buttons = scope.querySelectorAll('.btn-p1-absentees');
    buttons.forEach(btn => {
        // Eltávolítjuk a régi eseményfigyelőt, hogy elkerüljük a duplikálódást
        btn.removeEventListener('click', openP1AbsenteesModal);
        btn.addEventListener('click', openP1AbsenteesModal);
    });
}

// === ÚJ (v63.3): P1 Modal Megnyitása ===
async function openP1AbsenteesModal(event) {
    const button = event.currentTarget;
    const matchId = button.dataset.matchId;
    
    if (!matchId) {
        showToast("Hiba: A meccs azonosítója (matchId) hiányzik a gomb adatattribútumából.", "error");
        return;
    }

    // Adatok kinyerése a gomb data attribútumaiból
    const { home, away, league, kickoff } = button.dataset;
    const homeName = unescape(home);
    const awayName = unescape(away);

    // Modal megnyitása skeletonnal
    const title = `P1 Hiányzók: ${homeName} vs ${awayName}`;
    const loadingHTML = (document.getElementById('loading-skeleton')).outerHTML;
    openModal(title, loadingHTML, 'modal-lg');
    (document.querySelector('#modal-container #loading-skeleton')).classList.add('active');

    // Keretek lekérése és a modal tartalmának felépítése
    await _getAndRenderRosterModalHtml(matchId, homeName, awayName, unescape(league), unescape(kickoff));
}

// === ÚJ (v63.3): P1 Modal Adatlekérés és Renderelés ===
async function _getAndRenderRosterModalHtml(matchId, homeName, awayName, leagueName, utcKickoff) {
    const modalBody = document.getElementById('modal-body');
    if (!modalBody) return;

    try {
        let rosters = appState.rosterCache.get(matchId);
        
        if (!rosters) {
            console.log(`P1 Keret: Nincs cache (${matchId}). API hívás...`);
            // Nincs Cache, API hívás
            const response = await fetchWithAuth(`${appState.gasUrl}/getRosters`, {
                method: 'POST',
                body: JSON.stringify({
                    home: homeName,
                    away: awayName,
                    leagueName: leagueName,
                    utcKickoff: utcKickoff,
                    sport: appState.currentSport
                })
            });
            if (!response.ok) await handleFetchError(response);
            
            rosters = await response.json();
            
            if (!rosters || (!rosters.home?.length && !rosters.away?.length)) {
                throw new Error("Az API nem adott vissza érvényes keretadatot.");
            }
            
            appState.rosterCache.set(matchId, rosters);
            console.log(`P1 Keret: API hívás sikeres, mentve a cache-be (${matchId}).`);
        } else {
            console.log(`P1 Keret: Cache találat (${matchId})`);
        }

        // HTML felépítése
        const modalHtml = _buildRosterModalHtml(matchId, homeName, awayName, rosters);
        modalBody.innerHTML = modalHtml;

        // Eseményfigyelők hozzáadása a modalon belül
        const searchInput = modalBody.querySelector('#p1-search-input');
        searchInput?.addEventListener('keyup', handleP1Search);
        
        modalBody.querySelectorAll('.p1-player-checkbox').forEach(cb => {
            cb.addEventListener('change', handleP1CheckboxChange);
        });

    } catch (e) {
        console.error(`Hiba a P1 keret modal felépítésekor (${matchId}):`, e);
        modalBody.innerHTML = `<p class="muted" style="color:var(--danger); font-size: 0.9rem; text-align: center; padding: 2rem;">A keretek lekérése sikertelen: ${e.message}</p>`;
    }
}

// === ÚJ (v63.3): P1 Modal HTML Generátor (Keresővel és Kártyákkal) ===
function _buildRosterModalHtml(matchId, homeName, awayName, availableRosters) {
    
    // Lekérjük a jelenlegi állapotot az appState-ből
    const p1State = appState.p1SelectedAbsentees.get(matchId) || { home: [], away: [] };
    
    const buildList = (players, teamType) => {
        if (!players || players.length === 0) return `<p class="muted" style="font-size: 0.8rem; text-align: center; padding: 1rem;">Nincs ${teamType} keretadat.</p>`;
        
        const grouped = groupBy(players, p => p.pos || 'N/A');
        
        let html = '';
        ['G', 'D', 'M', 'F', 'N/A'].forEach(pos => {
            if (grouped[pos]) {
                const posLabel = { 'G': 'Kapusok', 'D': 'Védők', 'M': 'Középpályások', 'F': 'Támadók', 'N/A': 'Ismeretlen'}[pos];
                html += `<div class="roster-position-group">`;
                html += `<strong>${posLabel}</strong>`;
              
                html += grouped[pos].map(player => {
                    const playerName = escapeHTML(player.name);
                    // Ellenőrizzük, hogy a játékos ki van-e pipálva az appState alapján
                    const isChecked = (teamType === 'home' ? p1State.home : p1State.away).includes(playerName);
                    
                    return `
                    <label class="roster-checkbox-label" data-name="${playerName.toLowerCase()}">
                        <input type="checkbox" 
                               class="p1-player-checkbox" 
                               data-match-id="${matchId}"
                               data-team-type="${teamType}"
                               value="${playerName}"
                               ${isChecked ? 'checked' : ''}>
                        ${playerName}
                    </label>`;
                }).join('');
                html += `</div>`;
            }
        });
        return html;
    };

    const finalHtml = `
        <div class="p1-roster-modal-container">
            <div class="p1-search-bar">
                <input type="search" id="p1-search-input" class="xg-input" placeholder="Keresés a játékosok között..." style="width: 100%; text-align: left; padding: 12px; font-size: 1rem;">
            </div>
            <div class="roster-selector-grid">
                <div class="roster-selector-column">
                    <h5>${escapeHTML(homeName)} (Hazai)</h5>
                    <div class="roster-player-list">
                        ${buildList(availableRosters?.home, 'home')}
                    </div>
                </div>
                <div class="roster-selector-column">
                    <h5>${escapeHTML(awayName)} (Vendég)</h5>
                    <div class="roster-player-list">
                        ${buildList(availableRosters?.away, 'away')}
                    </div>
                </div>
            </div>
        </div>
    `;
    return finalHtml;
}

// === ÚJ (v63.3): P1 Modal Kereső Logika ===
function handleP1Search(event) {
    const searchTerm = event.target.value.toLowerCase();
    const modalBody = event.target.closest('.modal-body');
    if (!modalBody) return;
    
    modalBody.querySelectorAll('.roster-checkbox-label').forEach(label => {
        const playerName = label.dataset.name;
        if (playerName.includes(searchTerm)) {
            label.style.display = 'block';
        } else {
            label.style.display = 'none';
        }
    });
}

// === ÚJ (v63.3): P1 Modal Checkbox Állapotkezelés ===
function handleP1CheckboxChange(event) {
    const checkbox = event.currentTarget;
    const matchId = checkbox.dataset.matchId;
    const teamType = checkbox.dataset.teamType; // 'home' or 'away'
    const playerName = checkbox.value;

    if (!matchId || !teamType) return;

    // 1. Állapot inicializálása (ha még nem létezik)
    if (!appState.p1SelectedAbsentees.has(matchId)) {
        appState.p1SelectedAbsentees.set(matchId, { home: [], away: [] });
    }
    
    const currentState = appState.p1SelectedAbsentees.get(matchId);
    const targetArray = (teamType === 'home' ? currentState.home : currentState.away);

    // 2. Állapot frissítése
    if (checkbox.checked) {
        if (!targetArray.includes(playerName)) {
            targetArray.push(playerName);
        }
    } else {
        const index = targetArray.indexOf(playerName);
        if (index > -1) {
            targetArray.splice(index, 1);
        }
    }

    // 3. Gomb frissítése a főoldalon (Kanban/Lista)
    _updateP1ButtonCount(matchId);
}

// === ÚJ (v63.3): P1 Gomb Számláló Frissítése ===
function _updateP1ButtonCount(matchId) {
    const p1State = appState.p1SelectedAbsentees.get(matchId) || { home: [], away: [] };
    const p1Count = p1State.home.length + p1State.away.length;

    // Frissítjük az összes gombot (kanban, mobil lista, és az elemzési modalon belüli gombot is)
    document.querySelectorAll(`.btn-p1-absentees[data-match-id="${matchId}"]`).forEach(btn => {
        // Megpróbáljuk megtartani az SVG-t
        const svgIcon = btn.querySelector('svg')?.outerHTML || '';
        btn.innerHTML = `${svgIcon} P1 HIÁNYZÓK MEGADÁSA (${p1Count})`;
    });
}


function handleCheckboxChange(event) {
    const checkbox = (event.target);
    const matchId = checkbox.dataset.matchId;
    const cardOrItem = checkbox.closest('.selectable-card, .selectable-item');
    if (!matchId) return;
    if (checkbox.checked) { 
        if (appState.selectedMatches.size < 3) { 
            appState.selectedMatches.add(matchId);
            cardOrItem?.classList.add('selected');
        } else {
            checkbox.checked = false;
            showToast('Maximum 3 meccset választhatsz ki egyszerre többes elemzéshez.', 'error');
        }
    } else { 
        appState.selectedMatches.delete(matchId);
        cardOrItem?.classList.remove('selected');
    }
    updateMultiSelectButton();
}

function updateMultiSelectButton() {
    const btn = (document.getElementById('multiAnalysisBtn'));
    if (!btn) return;
    const count = appState.selectedMatches.size;
    btn.textContent = `Kiválasztottak Elemzése (${count})`;
    btn.disabled = count === 0 || count > 3;
}

// === KLIENSOLDALI HTML GENERÁTOROK (v62.1) ===

function escapeHTML(str) {
    if (str == null) return '';
    let tempStr = String(str);
    const escapeMap = {
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    };
    tempStr = tempStr.replace(/[&<>"']/g, (match) => escapeMap[match]);
    tempStr = tempStr.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    return tempStr;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * v59.0: Kiemeli a kulcsszavakat az AI szövegekben.
 */
function _highlightKeywords(text, teamNames = []) {
    if (!text || typeof text !== 'string') return text;
    let highlightedText = escapeHTML(text);
    const keywords = [
        'gól', 'gólpassz', 'gólok', 'gólszerző',
        'lap', 'lapot', 'lapok', 'piros lap', 'sárga lap',
        'szöglet', 'szögletet', 'szögletek',
        'xG', 'várható gól',
        'hazai', 'vendég',
        'sérülés', 'hiányzó', 'eltiltott',
        'bíró', 'edző'
    ];
    const allNames = [...teamNames]
        .filter(name => name && name.length > 2) 
        .sort((a, b) => b.length - a.length);
    try {
        allNames.forEach(name => {
            const regex = new RegExp(`\\b(${escapeRegExp(name)})\\b`, 'gi');
            highlightedText = highlightedText.replace(regex, `<span class="highlight-keyword">$1</span>`);
        });
        keywords.forEach(keyword => {
            const regex = new RegExp(`\\b(${escapeRegExp(keyword)})\\b`, 'gi');
            highlightedText = highlightedText.replace(regex, `<span class="highlight-keyword">$1</span>`);
        });
    } catch (e) {
        console.error("Hiba a kulcsszavak kiemelésekor:", e.message);
        return escapeHTML(text);
    }
    return highlightedText.replace(/\n/g, '<br>');
}

/**
 * v59.0: A _highlightKeywords-t hívja
 */
const processAiText = (text, teamNames = []) => {
    const safeText = String(text || '');
    if (safeText.includes("Hiba") || safeText.trim() === 'N/A') {
        return `<p>${escapeHTML(safeText || "N/A.")}</p>`;
    }
    return _highlightKeywords(safeText, teamNames);
};

const processAiList = (list, teamNames = []) => {
    if (!list || !Array.isArray(list) || list.length === 0) {
        return '<li>Nincs adat.</li>';
    }
    return list.map(item => `<li>${_highlightKeywords(item, teamNames)}</li>`).join('');
};
function getRadialChartHtml(pHome, pDraw, pAway, sport) {
    const r = 40;
    const circumference = 2 * Math.PI * r;
    const isMoneylineSport = sport === 'hockey' || sport === 'basketball';
    let pHomeSafe, pDrawSafe, pAwaySafe;
    if (isMoneylineSport) {
        const total = (parseFloat(String(pHome)) || 0) + (parseFloat(String(pAway)) || 0);
        pHomeSafe = (total > 0) ? (parseFloat(String(pHome)) / total) * 100 : 50;
        pAwaySafe = (total > 0) ?
        (parseFloat(String(pAway)) / total) * 100 : 50;
        pDrawSafe = 0;
    } else {
        pHomeSafe = parseFloat(String(pHome)) || 0;
        pDrawSafe = parseFloat(String(pDraw)) || 0;
        pAwaySafe = parseFloat(String(pAway)) || 0;
    }
    const homeSegment = (pHomeSafe / 100) * circumference;
    const drawSegment = (pDrawSafe / 100) * circumference;
    const awaySegment = (pAwaySafe / 100) * circumference;
    const homeOffset = 0;
    const drawOffset = -homeSegment;
    const awayOffset = -(homeSegment + drawSegment);
    const drawSvgCircle = `
        <circle class="progress draw" cx="50" cy="50" r="${r}"
                stroke-dasharray="${drawSegment} ${circumference}"
                style="stroke-dashoffset: ${drawOffset};"></circle>
    `;
    const drawLegendItem = `
        <div class="legend-item">
             <span class="legend-color-box"></span>
             <span>Döntetlen (<strong class="glowing-text-white">${pDrawSafe.toFixed(1)}%</strong>)</span>
        </div>
    `;
    return `
    <div class="radial-chart-container">
        <svg class="radial-chart" width="100%" height="100%" viewBox="0 0 100 100">
            <circle class="track" cx="50" cy="50" r="${r}" ></circle>
            <circle class="progress home" cx="50" cy="50" r="${r}"
                    stroke-dasharray="${homeSegment} ${circumference}"
                    style="stroke-dashoffset: ${homeOffset};"></circle>
            ${!isMoneylineSport ? drawSvgCircle : ''}
            <circle class="progress away" cx="50" cy="50" r="${r}"
                     stroke-dasharray="${awaySegment} ${circumference}"
                     style="stroke-dashoffset: ${awayOffset};"></circle>
        </svg>
    </div>
    <div class="diagram-legend">
        <div class="legend-item">
             <span class="legend-color-box"></span>
            <span>Hazai (<strong class="glowing-text-white">${pHomeSafe.toFixed(1)}%</strong>)</span>
        </div>
        ${!isMoneylineSport ? drawLegendItem : ''}
        <div class="legend-item">
             <span class="legend-color-box"></span>
             <span>Vendég (<strong class="glowing-text-white">${pAwaySafe.toFixed(1)}%</strong>)</span>
        </div>
    </div>`;
}

function getGaugeHtml(confidence, label = "") {
    const safeConf = Math.max(0, Math.min(10, parseFloat(String(confidence)) || 0));
    const percentage = safeConf * 10;
    const circumference = 235.6;
    return `
    <div class="gauge-container">
        <svg class="gauge-svg" viewBox="0 0 100 85">
             <path class="gauge-track" d="M 12.5 50 A 37.5 37.5 0 1 1 87.5 50"></path>
             <path class="gauge-value" d="M 12.5 50 A 37.5 37.5 0 1 1 87.5 50"
                  style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${circumference}; --value: ${percentage}; animation: fillGauge 1s ease-out forwards 0.5s;"></path>
        </svg>
        <div class="gauge-text glowing-text-white">
            ${safeConf.toFixed(1)}<span class="gauge-label-inline">/10</span>
        </div>
        ${label ? `<div class="gauge-label">${escapeHTML(label)}</div>` : ''}
    </div>
    `;
}

function getConfidenceInterpretationHtml(confidenceScore, teamNames = []) {
    let text = "";
    let className = "";
    const score = parseFloat(String(confidenceScore)) || 0;
    if (score >= 8.5) { text = "**Nagyon Magas Bizalom:** Az elemzés rendkívül erős egybeesést mutat a statisztikák, a kontextus és a kockázati tényezők között. A jelzett kimenetel kiemelkedően valószínű."; className = "very-high"; }
    else if (score >= 7.0) { text = "**Magas Bizalom:** Több kulcstényező (statisztika, hiányzók, forma) egyértelműen alátámasztja az ajánlást. Kisebb kérdőjelek lehetnek, de az irány egyértelműnek tűnik."; className = "high"; }
    else if (score >= 5.0) { text = "**Közepes Bizalom:** Az elemzés a jelzett kimenetel felé hajlik, de vannak ellentmondó tényezők (pl. piaci mozgás, szoros H2H, kulcs hiányzó) vagy a modell bizonytalansága magasabb."; className = "medium"; }
    else if (score >= 3.0) { text = "**Alacsony Bizalom:** Jelentős ellentmondások vannak az adatok között (pl. statisztika vs. kontextus), vagy a meccs kimenetele rendkívül bizonytalan (pl. 50-50% esélyek). Ez inkább egy spekulatív tipp."; className = "low"; }
    else { text = "**Nagyon Alacsony Bizalom:** Kritikus ellentmondások (pl. kulcsjátékosok hiánya a favorizált oldalon, erős piaci mozgás a tipp ellen) vagy teljes kiszámíthatatlanság jellemzi a meccset."; className = "very-low"; }
    
    return `
    <div class="confidence-interpretation-container">
        <p class="confidence-interpretation ${className}">${processAiText(text, teamNames)}</p>
    </div>`;
}

function getMicroAnalysesHtml(microAnalyses, teamNames = []) {
    if (!microAnalyses || Object.keys(microAnalyses).length === 0) {
        return "<p>Nem futottak speciális modellek ehhez a sporthoz.</p>";
    }
    let html = '';
    const analyses = { 
        'BTTS': microAnalyses.btts_analysis, 
        'GÓL O/U': microAnalyses.goals_ou_analysis,
        'SZÖGLET': microAnalyses.corner_analysis,
        'LAPOK': microAnalyses.card_analysis
    };
    Object.entries(analyses).forEach(([key, text]) => {
        if (!text || text === 'N/A' || text.includes('N/A')) return; 
        
        const title = key.toUpperCase().replace(/_/g, ' ');
        const parts = (text || "Hiba.").split('Bizalom:');
        const analysisText = processAiText(parts[0] || "Elemzés nem elérhető.", teamNames);
        const confidenceText = parts[1] ? `**Bizalom: ${parts[1].trim()}**` : "**Bizalom: N/A**";
        
        html += `
        <div class="micromodel-card">
            <h5><strong>${escapeHTML(title)} Specialista</strong></h5>
            <p>${analysisText}</p>
            <p class="confidence"><em>${processAiText(confidenceText, teamNames)}</em></p>
        </div>`;
    });
    if (html === '') { return "<p>Nem futottak speciális modellek ehhez a sporthoz.</p>"; }
    return html;
}

// === MÓDOSÍTÁS (v63.3): Ez a függvény most már az elemzési modalon belüli "gomb" számára generál HTML-t ===
function _buildRosterSelectorHtml(availableRosters, matchId, homeName, awayName) {
    
    const p1State = appState.p1SelectedAbsentees.get(matchId) || { home: [], away: [] };
    const p1Count = p1State.home.length + p1State.away.length;

    const rosterButtonHtml = `
        <button class="btn btn-p1-absentees" data-match-id="${matchId}" 
            data-home="${escape(homeName)}" 
            data-away="${escape(awayName)}" 
            data-league="" 
            data-kickoff=""
            style="width: 100%; margin-top: 0.75rem; background: rgba(255,255,255,0.05);">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            P1 HIÁNYZÓK MEGADÁSA (${p1Count})
        </button>`;

    return `
    <div class="sidebar-accordion" style="margin-top: 1.5rem;">
        <div class="accordion-content">
            ${rosterButtonHtml}
            <p class="muted" style="font-size: 0.8rem; text-align: center; margin-top: 0.5rem;">A P1 hiányzók felülbírálják az automatikus (Sofascore/API) adatokat.</p>
        </div>
    </div>`;
}


/**
 * === FŐ KLIENSOLDALI HTML ÉPÍTŐ (ÁTÍRVA v63.3) ===
 * Most már az elemzési modalon belül is megjeleníti a "Hiányzók Megadása" gombot.
 */
function buildAnalysisHtml_CLIENTSIDE(
    fullAnalysisReport, // Ez most már a 'committee' objektum
    matchData, 
    oddsData, 
    valueBets, 
    quantConfidence,      // 4. Ügynök (Statisztikai) bizalom
    finalConfidenceScore, // 6. Ügynök (Végső, Súlyozott) bizalom
    sim, 
    masterRecommendation,
    availableRosters, // ÚJ (v62.1)
    matchId // ÚJ (v63.3)
) {
    
    // --- 1. ADATOK KINYERÉSE ---
    const teamNames = [matchData.home, matchData.away];
    const pHome = sim?.pHome?.toFixed(1) || '0.0';
    const pDraw = sim?.pDraw?.toFixed(1) || '0.0';
    const pAway = sim?.pAway?.toFixed(1) || '0.0';
    const mu_h = sim?.mu_h_sim?.toFixed(2) || 'N/A';
    const mu_a = sim?.mu_a_sim?.toFixed(2) || 'N/A';
    const pOver = sim?.pOver?.toFixed(1) || 'N/A';
    const pUnder = sim?.pUnder?.toFixed(1) || 'N/A';
    const mainTotalsLine = sim?.mainTotalsLine || 'N/A';
    const topScore = `<strong>${sim?.topScore?.gh ?? 'N/A'} - ${sim?.topScore?.ga ?? 'N/A'}</strong>`;
    
    // === MÓDOSÍTÁS (v63.1) ===
    const modelConf = quantConfidence?.toFixed(1) || '1.0';
    // Quant (Statisztikai)
    const expertConfScore = finalConfidenceScore?.toFixed(1) || '1.0';
    // Stratéga (Végső)
    
    // === MÓDOSÍTÁS (6 FŐS BIZOTTSÁG) ===
    // Az új 'committee' objektum feldolgozása
    let expertConfHtml, prophetText, synthesisText, microModelsHtml, quantReportHtml, scoutReportHtml;
    if (fullAnalysisReport && fullAnalysisReport.strategist) {
        // --- B. ESET: Új (6 Fős Bizottság v63.0) Struktúra ---
        // Itt már az AnalysisFlow.ts-ben definiált új 'committee' objektumot várjuk
        const strategistReport = fullAnalysisReport.strategist;
        const criticReport = fullAnalysisReport.critic;
        
        expertConfHtml = strategistReport?.final_confidence_report || `**${expertConfScore}/10** - Stratéga hiba.`;
        // A pontszámot már a TS kódból kapjuk, nem az AI szövegéből olvassuk ki

        prophetText = strategistReport?.prophetic_timeline || "A Próféta nem adott meg jóslatot.";
        if (prophetText && !prophetText.includes("Hiba")) {
            prophetText += `\n(Súlyozott xG: ${mu_h} - ${mu_a}. Legvalószínűbb eredmény: ${sim?.topScore?.gh ?? 'N/A'} - ${sim?.topScore?.ga ?? 'N/A'}.)`;
        }
        synthesisText = strategistReport?.strategic_synthesis || "A stratégiai szintézis nem elérhető.";
        // A mikromodellek most már a 'strategist' alatt fészkelve érkeznek
        microModelsHtml = getMicroAnalysesHtml(strategistReport?.micromodels, teamNames);
        // A Quant/Scout jelentések
        quantReportHtml = (fullAnalysisReport?.quant) ?
        `
            <div class="committee-card quant">
                <h4>1. Ügynök: Quant Jelentése</h4>
                <p><strong>Forrás:</strong> ${fullAnalysisReport.quant.source}</p>
                <p><strong>Tiszta xG:</strong> ${fullAnalysisReport.quant.mu_h?.toFixed(2)} - ${fullAnalysisReport.quant.mu_a?.toFixed(2)}</p>
            </div>` : '';
        scoutReportHtml = (criticReport?.tactical_summary) ? `
            <div class="committee-card scout">
                <h4>5. Ügynök: Kritikus Jelentése</h4>
                <p><strong>Összefoglaló:</strong> ${processAiText(criticReport.tactical_summary, teamNames)}</p>
                <strong>Kulcs Kockázatok (v63.1):</strong>
                <ul class="key-insights">
                    ${processAiList(criticReport.key_risks, teamNames)}
                </ul>
                <p style="margin-top: 0.5rem;"><strong>Kockázati Pontszám:</strong> ${criticReport.contradiction_score || '0.0'}</p>
           </div>` : '';
    } else {
        // --- C. ESET: Hiba / Régi Struktúra (Fallback) ---
        prophetText = fullAnalysisReport?.prophetic_timeline || "Hiba: Az elemzési jelentés ('committee') struktúrája ismeretlen, vagy 'strategist' kulcs hiányzik.";
        synthesisText = fullAnalysisReport?.strategic_synthesis || "Hiba: Az elemzési jelentés ('committee') struktúrája ismeretlen.";
        expertConfHtml = fullAnalysisReport?.final_confidence_report || `**${expertConfScore}/10** - Ismeretlen adatszerkezet.`;
        microModelsHtml = getMicroAnalysesHtml(fullAnalysisReport?.micromodels, teamNames) || "<p>Hiba: Mikromodellek betöltése sikertelen.</p>";
        quantReportHtml = "<p>Hiba: Quant jelentés betöltése sikertelen.</p>";
        scoutReportHtml = "<p>Hiba: Kritikus jelentés betöltése sikertelen.</p>";
    }
    // === MÓDOSÍTÁS VÉGE ===


    // --- 2. FŐ AJÁNLÁS (STRATÉGA) (v59.0 - Kiemelőt használ) ---
    const finalRec = masterRecommendation || { recommended_bet: "Hiba", final_confidence: 1.0, brief_reasoning: "Hiba" };
    const finalReasoningHtml = processAiText(finalRec.brief_reasoning, teamNames);
    const finalConfInterpretationHtml = getConfidenceInterpretationHtml(finalRec.final_confidence, teamNames);
    const masterRecommendationHtml = `
    <div class="master-recommendation-card">
        <h5>👑 6. Ügynök: Vezető Stratéga Ajánlása 👑</h5>
        <div class="master-bet"><strong>${escapeHTML(finalRec.recommended_bet)}</strong></div>
        <div class="master-confidence">
            Végső Bizalom: <strong class="glowing-text-white">${(finalRec.final_confidence || 1.0).toFixed(1)}/10</strong>
        </div>
        <div class="master-reasoning">${finalReasoningHtml}</div>
        ${finalConfInterpretationHtml}
    </div>`;
    // --- 3. PRÓFÉTA KÁRTYA (NARRATÍVA OSZLOP) (v59.0 - Kiemelőt használ) ---
    const prophetCardHtml = `
    <div class="prophet-card">
        <h5><strong>🔮 A Próféta Látomása (Várható Meccskép)</strong></h5>
        <p>${processAiText(prophetText, teamNames)}</p>
    </div>`;
    // --- 4. SZINTÉZIS KÁRTYA (NARRATÍVA OSZLOP) (v59.0 - Kiemelőt használ) ---
    const synthesisCardHtml = `
    <div class="synthesis-card">
        <h5><strong>🧠 Stratégiai Szintézis (A Fő Elemzés)</strong></h5>
        <p>${processAiText(synthesisText, teamNames)}</p>
    </div>`;
    // --- 5. ÚJ (v63.3): P1 HIÁNYZÓ GOMB (NARRATÍVA OSZLOP) ---
    // Ez a _buildRosterSelectorHtml-t hívja, de most már paraméterekkel
    const p1AbsenteesHtml = (matchData.sport === 'soccer' && matchId) ? 
        _buildRosterSelectorHtml(availableRosters, matchId, matchData.home, matchData.away) 
        : '';
        
    // --- 6. CHAT (NARRATÍVA OSZLOP) (Változatlan v59.0) ---
    const chatHtml = `
    <div class="analysis-accordion" style="margin-top: 1.5rem;">
        <details class="analysis-accordion-item" open>
            <summary class="analysis-accordion-header">
                <span class="section-title">
                    <svg class="section-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    Beszélgetés az AI Elemzővel
                </span>
            </summary>
            <div class="accordion-content" id="chat-content-wrapper">
                </div>
        </details>
    </div>`;

    // --- 7. ADAT OSZLOP (SIDEBAR) (MÓDOSÍTVA v63.1) ---
    const atAGlanceHtml = `
    <div class="at-a-glance-grid">
        <div class="summary-card">
            <h5>4. Ügynök: Szimuláció</h5>
            ${getRadialChartHtml(pHome, pDraw, pAway, matchData.sport)}
        </div>
        <div class="summary-card">
            <h5>3. Ügynök: Súlyozott xG</h5>
            <div class="xg-value-container">
                <div class="xg-team">
                    <div class="value glowing-text-white">${mu_h}</div>
                    <div class="details">${escapeHTML(matchData.home)}</div>
                </div>
                <div class="xg-separator">-</div>
                <div class="xg-team">
                    <div class="value glowing-text-white">${mu_a}</div>
                    <div class="details">${escapeHTML(matchData.away)}</div>
                </div>
            </div>
            <div class="details">Legvalószínűbb: ${topScore}</div>
        </div>
        <div class="summary-card">
            <h5>Fő Összesített Vonal (${mainTotalsLine})</h5>
            <div class="totals-breakdown">
                <div class="total-line">
                    <span class="total-label">Over ${mainTotalsLine}</span>
                    <strong class="glowing-text-white">${pOver}%</strong>
                </div>
                <div class="total-line">
                    <span class="total-label">Under ${mainTotalsLine}</span>
                    <strong class="glowing-text-white">${pUnder}%</strong>
                </div>
            </div>
            ${matchData.sport === 'soccer' ? `<div class="details">BTTS Igen: <strong class="glowing-text-white">${sim?.pBTTS?.toFixed(1) ?? 'N/A'}%</strong></div>` : ''}
        </div>
    </div>`;
    // === VÉGSŐ JAVÍTÁS (v63.1) ===
    // A 'Bizalmi Híd' most már a helyes 'modelConf' (Quant) és 'expertConfScore' (Stratéga) változókat használja
    const expertConfReasoning = processAiText(expertConfHtml.split(' - ')[1] || 'N/A', teamNames);
    const confidenceBridgeHtml = `
    <div class="confidence-bridge-card">
        <h5>Bizalmi Híd (Quant vs. Stratéga)</h5>
        <div class="confidence-bridge-values">
            ${getGaugeHtml(modelConf, "Quant")}
            <div class="arrow">→</div>
            ${getGaugeHtml(expertConfScore,"Stratéga")}
        </div>
        <div class="confidence-bridge-reasoning">${expertConfReasoning}</div>
    </div>`;
    let marketCardsHtml = '';
    (valueBets || []).forEach(bet => {
        marketCardsHtml += `
        <div class="market-card">
            <div class="market-card-title"><strong>${escapeHTML(bet.market)}</strong></div>
            <div class="market-card-value"><strong>${bet.odds}</strong></div>
            <div class="details">Becsült: ${bet.probability} (<strong>${bet.value}</strong>)</div>
        </div>`;
    });
    if (!marketCardsHtml) {
        marketCardsHtml = '<p class="muted" style="text-align: center; grid-column: 1 / -1;">Jelenleg nincsenek kiemelt értékű fogadások a piacon (min. 5% value).</p>';
    }
    const marketSectionHtml = `
    <div class="market-data-section">
        <h4>Érték Elemzés (Value Betting)</h4>
         <div class="market-card-grid">${marketCardsHtml}</div>
    </div>`;
    const sidebarAccordionHtml = `
    <div class="sidebar-accordion">
        <details>
            <summary>Piaci Mikromodellek</summary>
            <div class="accordion-content micromodel-grid">
                ${microModelsHtml}
            </div>
        </details>
        ${(quantReportHtml || scoutReportHtml) ? `
        <details open>
            <summary>Bizottsági Jelentések</summary>
            <div class="accordion-content committee-reports">
                ${quantReportHtml}
                ${scoutReportHtml}
            </div>
        </details>` : ''}
    </div>`;
    // --- 8. VÉGLEGES HTML ÖSSZEÁLLÍTÁSA (v63.3 Elrendezés) ---
    return `
        <div class="analysis-layout">
            
            <div class="analysis-layout-main">
                ${masterRecommendationHtml}
                ${prophetCardHtml}
                ${synthesisCardHtml}
                ${(appState.currentSport === 'soccer') ? p1AbsenteesHtml : ''}
                ${chatHtml}
            </div>
            
            <div class="analysis-layout-sidebar">
                ${atAGlanceHtml}
                ${confidenceBridgeHtml}
                ${marketSectionHtml}
                ${sidebarAccordionHtml}
            </div>
            
        </div>
    `;
}

// --- 4. ALKALMAZÁS INDÍTÓ LOGIKA (A FÁJL VÉGÉRE HELYEZVE) ---

function initializeApp() {
    setupThemeSwitcher();
    // Ez a hívás most már biztonságos
    document.getElementById('loadFixturesBtn')?.addEventListener('click', loadFixtures);
    document.getElementById('historyBtn')?.addEventListener('click', openHistoryModal);
    document.getElementById('manualBtn')?.addEventListener('click', openManualAnalysisModal);
    createGlowingOrbs();
    createHeaderOrbs();
    initMultiSelect();
    (document.getElementById('userInfo')).textContent = `Csatlakozva...`;
    appState.sheetUrl = localStorage.getItem('sheetUrl') || ''; 
    appState.rosterCache.clear();
    appState.p1SelectedAbsentees.clear(); // v63.3

    const toastContainer = document.createElement('div');
    toastContainer.id = 'toast-notification-container';
    toastContainer.className = 'toast-notification-container';
    document.body.appendChild(toastContainer);
}

function setupLoginProtection() {
    const loginOverlay = document.getElementById('login-overlay');
    const appContainer = document.querySelector('.app-container');
    const storedToken = sessionStorage.getItem('authToken');
    if (storedToken) {
        appState.authToken = storedToken;
        loginOverlay.style.display = 'none';
        appContainer.style.display = 'flex';
        initializeApp();
        // Ez hívja a setupThemeSwitcher-t
        return;
    } else {
        loginOverlay.style.display = 'flex';
        appContainer.style.display = 'none';
    }

    const loginButton = document.getElementById('login-button');
    const passwordInput = document.getElementById('password-input');
    const handleLogin = async () => {
        if (!passwordInput.value) {
            showToast('Kérlek, add meg a jelszót.', 'error');
            return;
        }
        
        loginButton.disabled = true;
        loginButton.textContent = 'Hitelesítés...';
        
        try {
            const response = await fetch(`${appState.gasUrl}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: passwordInput.value })
            });
            if (!response.ok) {
                 const errorData = await response.json();
                throw new Error(errorData.error || `Hiba (${response.status})`);
            }

            const data = await response.json();
            if (!data.token) {
                throw new Error("A szerver nem küldött tokent.");
            }
            
            appState.authToken = data.token;
            sessionStorage.setItem('authToken', data.token); 

            loginOverlay.style.display = 'none';
            appContainer.style.display = 'flex';
            initializeApp(); // Ez hívja a setupThemeSwitcher-t

        } catch (e) {
            showToast(`Sikertelen belépés: ${e.message}`, 'error');
            passwordInput.value = '';
            passwordInput.focus();
            loginButton.disabled = false;
            loginButton.textContent = 'Belépés';
        }
    };
    
    loginButton.addEventListener('click', handleLogin);
    passwordInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') handleLogin();
    });
}

// === INDÍTÁS (v62.2 - A VÉGÉRE HELYEZVE) ===
document.addEventListener('DOMContentLoaded', () => {
    setupLoginProtection(); 
});
