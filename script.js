// --- script.js (v93.0 - Egységes Adatbeviteli Modál) ---
// MÓDOSÍTÁS (v93.0):
// 1. ÚJ: `createDataInputModal()`: Dinamikusan létrehozza az új, egységes adatbeviteli modált
//    és hozzáadja a document.body-hoz az alkalmazás indításakor.
// 2. ÚJ: `openAnalysisDataModal()`: Ezt hívják az új kártya-gombok. Megnyitja az egységes modált,
//    és betölti a meccs adatait (az appState-ből).
// 3. ÚJ: `runAnalysisFromDataModal()`: Az új modál "Elemzés Indítása" gombja hívja meg.
//    Összegyűjti az összes manuális adatot (xG, Vonal, Hiányzók) és
//    meghívja a MEGLÉVŐ `runAnalysis` függvényt.
// 4. MÓDOSÍTVA: `renderFixturesForDesktop` és `renderFixturesForMobileList`:
//    - Eltávolítva a kártyáról a 'manual-xg-grid' és a 'btn-p1-absentees'.
//    - Az "Elemzés Indítása" gombot egy új "Adatok & Elemzés" gombra cseréltük,
//      ami az `openAnalysisDataModal`-t hívja.
// 5. TÖRÖLVE (OBSOLETE): Az összes P1 drag-and-drop modal logika (v63-v68):
//    - Törölve: `addP1ModalButtonListeners`, `openP1AbsenteesModal`,
//      `_getAndRenderRosterModalHtml`, `_buildRosterModalHtml`, `handleP1Search`,
//      `handleP1DragStart`, `handleP1DragOver`, `handleP1DragEnter`,
//      `handleP1DragLeave`, `handleP1Drop`, `_updateP1ButtonCount`.
// 6. MÓDOSÍTVA: `runAnalysisFromCard` -> Ez a függvény mostantól az `appState`-ből
//    olvassa a P1 adatokat, amelyeket az új modál ment.
// 7. MÓDOSÍTVA: `appState.p1SelectedAbsentees` most már az *összes* manuális adatot tárolja.

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
    rosterCache: new Map(), // v62.1: Ez maradhat, a jövőbeli automatizáláshoz
    // MÓDOSÍTVA (v93.0): Ez az objektum tárolja az összes manuális adatot meccsenként
    // Struktúra: Map<matchId, { manual_H_xG, manual_H_xGA, manual_A_xG, manual_A_xGA, manual_main_line, manual_absentees_home_text, manual_absentees_away_text, context_notes }>
    manualInputs: new Map()
};

// --- 2. LIGA KATEGÓRIÁK ---
const LEAGUE_CATEGORIES = {
    // ... (Változatlan a v68.1-ből) ...
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
// ... (Változatlan a v68.1-ből) ...
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
    appState.manualInputs.clear(); // v93.0
    updateMultiSelectButton();
    try {
        const response = await fetchWithAuth(`${appState.gasUrl}/getFixtures?sport=${appState.currentSport}&days=2`);
        // ... (Változatlan a v68.1-ből) ...
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
        // === TÖRÖLVE (v93.0): A régi P1 listener ===
        // addP1ModalButtonListeners();
        
        (document.getElementById('userInfo')).textContent = `Csatlakozva (Meccsek betöltve)`;
        (document.getElementById('placeholder')).style.display = 'none';
    
    } catch (e) {
        showToast(`Hiba a meccsek betöltésekor: ${e.message}`, 'error');
        // ... (Változatlan a v68.1-ből) ...
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
 * MÓDOSÍTVA (v93.0): Ez a függvény most már az appState-ből veszi az adatokat,
 * amelyeket az új modál mentett el.
 */
function runAnalysisFromCard(buttonElement, home, away, utcKickoff, leagueName) {
    const card = buttonElement.closest('.match-card, .list-item');
    if (!card) return;
    
    const matchId = card.dataset.matchId;
    let manualDataToSend = {};
    
    // 1. Olvassuk az adatokat az appState-ből (amit a modál mentett)
    if (matchId && appState.manualInputs.has(matchId)) {
        const manualData = appState.manualInputs.get(matchId);
        
        // 2. Átalakítás a backend által várt formátumra
        
        // a) xG Komponensek
        if (manualData.manual_H_xG && manualData.manual_H_xGA && manualData.manual_A_xG && manualData.manual_A_xGA) {
            manualDataToSend.manual_H_xG = manualData.manual_H_xG;
            manualDataToSend.manual_H_xGA = manualData.manual_H_xGA;
            manualDataToSend.manual_A_xG = manualData.manual_A_xG;
            manualDataToSend.manual_A_xGA = manualData.manual_A_xGA;
        }

        // b) Hiányzók (A MEGLÉVŐ FÜGGVÉNYEDET HASZNÁLVA)
        const manualAbsentees = {
            home: parseManualAbsentees(manualData.manual_absentees_home_text),
            away: parseManualAbsentees(manualData.manual_absentees_away_text)
        };
        if (manualAbsentees.home.length > 0 || manualAbsentees.away.length > 0) {
            manualDataToSend.manual_absentees = manualAbsentees;
        }

        // c) ÚJ (v93.0) Egyéb adatok (ha a backended fel van készítve rá)
        // Ezeket a `runAnalysis` payload-jába olvasztjuk
        if (manualData.manual_main_line) {
            manualDataToSend.manual_main_line = manualData.manual_main_line;
        }
        if (manualData.context_notes) {
            manualDataToSend.context_notes = manualData.context_notes;
        }
    }
    
    runAnalysis(home, away, utcKickoff, leagueName, true, manualDataToSend, matchId);
}

/**
 * MÓDOSÍTVA (v93.0): A 'manualXg' paraméter most már
 * tartalmazhatja a 'manual_main_line' és 'context_notes' mezőket is.
 */
async function runAnalysis(home, away, utcKickoff, leagueName, forceNew = false, manualData = {}, matchId = null) {
    home = unescape(home);
    away = unescape(away);
    
    if (isMobile() && forceNew) {
        showToast("Elemzés folyamatban... Ez hosszabb időt vehet igénybe.", 'info', 6000);
    }

    openModal(`${home} vs ${away}`, (document.getElementById('common-elements')).innerHTML, 'modal-xl');
    
    // ... (Modal skeleton logika változatlan) ...
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
        if (!matchId) {
             matchId = `${appState.currentSport}_${home.toLowerCase().replace(/\s+/g, '')}_${away.toLowerCase().replace(/\s+/g, '')}`;
        }
        
        const analysisUrl = `${appState.gasUrl}/runAnalysis`;
        const openingOdds = sessionStorage.getItem('openingOdds') || '{}';
        
        // MÓDOSÍTÁS (v93.0): A payload most már a 'manualData' objektumot kapja meg
        const payload = {
            home: home,
            away: away,
            sport: appState.currentSport,
            force: forceNew,
            utcKickoff: utcKickoff,
            leagueName: leagueName || '', 
            sheetUrl: appState.sheetUrl,
            openingOdds: JSON.parse(openingOdds),
            ...manualData // Itt adjuk át az összes manuális adatot (xG, Hiányzók, Vonal, stb.)
        };
        
        const response = await fetchWithAuth(analysisUrl, {
            method: 'POST',
            body: JSON.stringify(payload) 
        });
        // ... (A többi `runAnalysis` logika változatlan a v68.1-ből) ...
        if (!response.ok) await handleFetchError(response);

        const data = await response.json();
        if (data.error) throw new Error(data.error);
        const { analysisData, debugInfo } = data;

        if (analysisData.availableRosters) {
            appState.rosterCache.set(matchId, analysisData.availableRosters);
        }
        
        const finalHtml = buildAnalysisHtml_CLIENTSIDE(
            analysisData.committee,
            analysisData.matchData,
            analysisData.oddsData,
            analysisData.valueBets,
            analysisData.modelConfidence, // Quant Bizalom
            analysisData.finalConfidenceScore, // Stratéga Bizalom
            analysisData.sim,
            analysisData.recommendation,
            analysisData.availableRosters, 
            matchId 
        );
        modalResults.innerHTML = `<div class="analysis-body">${finalHtml}</div>`;
        modalResults.innerHTML += `<p class="muted" style="text-align: center; margin-top: 1rem; font-size: 0.8rem;">xG Forrás: ${analysisData.xgSource || 'Ismeretlen'}</p>`;
        
        const chatWrapper = modalResults.querySelector('#chat-content-wrapper');
        if (chatWrapper) {
            chatWrapper.appendChild(modalChatContainer);
        }

        const { committee, recommendation } = analysisData;
        appState.currentAnalysisContext = `Fő elemzés: ${committee.strategist?.strategic_synthesis || 'N/A'}\n
Prófécia: ${committee.strategist?.prophetic_timeline || 'N/A'}\n
Kritika: ${committee.critic?.tactical_summary || 'N/A'}\n
Ajánlás: ${recommendation.recommended_bet} (Bizalom: ${recommendation.final_confidence})`;
            
        appState.chatHistory = [];
        modalSkeleton.classList.remove('active');
        modalChatContainer.style.display = 'block';
        (modalChatContainer.querySelector('#chat-messages')).innerHTML = '';
        
        // TÖRÖLVE (v93.0): Nincs többé P1 gomb az elemzési modalon belül
        // addP1ModalButtonListeners('#modal-container');
        
    } catch (e) {
        modalResults.innerHTML = `<p style="color:var(--danger); text-align:center; padding: 2rem;">Hiba történt az elemzés során: ${e.message}</p>`;
        modalSkeleton.classList.remove('active'); 
        console.error(e);
    }
}

// ... (openHistoryModal, deleteHistoryItem, runFinalCheck változatlan) ...
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


/**
 * MÓDOSÍTVA (v93.0): Az `addP1ModalButtonListeners` hívás törölve,
 * mivel a P1 gomb már nem létezik az elemzési modalon belül.
 */
async function viewHistoryDetail(id) {
    const originalId = unescape(id);
    openModal('Elemzés Betöltése...', (document.getElementById('loading-skeleton')).outerHTML, 'modal-xl');
    (document.querySelector('#modal-container #loading-skeleton')).classList.add('active');
    
    try {
        // ... (A v68.1-es 'viewHistoryDetail' logika többi része változatlan) ...
        const response = await fetchWithAuth(`${appState.gasUrl}/getAnalysisDetail?id=${encodeURIComponent(originalId)}`);
        if (!response.ok) await handleFetchError(response);
        const data = await response.json();
        if (data.error) throw new Error(data.error); 

        const { record } = data;
        if (!record || !record.html) throw new Error("A szerver nem találta a kért elemzést, vagy az hiányos.");
        
        (document.getElementById('modal-title')).textContent = `${record.home || 'Ismeretlen'} vs ${record.away || 'Ismeretlen'}`;
        const modalBody = document.getElementById('modal-body');

        let contentToDisplay = "";
        
        if (record.html.startsWith("<pre")) {
            try {
                const jsonString = record.html
                    .replace(/<pre[^>]*>/, '')
                    .replace(/<\/pre>$/, '')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&amp;/g, '&');

                const storedResponse = JSON.parse(jsonString);
                
                if (!storedResponse || !storedResponse.analysisData || !storedResponse.analysisData.committee) {
                    throw new Error("A mentett JSON struktúra hiányos ('analysisData' vagy 'committee' kulcs hiányzik).");
                }
                
                const { analysisData, debugInfo } = storedResponse;
                const matchId = record.id; 

                contentToDisplay = buildAnalysisHtml_CLIENTSIDE(
                    analysisData.committee,
                    analysisData.matchData,
                    analysisData.oddsData,
                    analysisData.valueBets,
                    analysisData.modelConfidence,
                    analysisData.finalConfidenceScore,
                    analysisData.sim,
                    analysisData.recommendation,
                    analysisData.availableRosters,
                    matchId
                );
                
            } catch (e) {
                console.error("Hiba az előzmény JSON újrarajzolásakor:", e);
                contentToDisplay = `<p style="color:var(--danger); text-align:center; padding: 2rem;">Hiba a JSON elemzés újrarajzolásakor: ${e.message}</p><div style="text-align:left; margin-top: 1rem; font-size: 0.8rem; opacity: 0.7; max-height: 200px; overflow-y: auto; background: #000; padding: 1rem;">${escapeHTML(record.html)}</div>`;
            }
        } 
        else {
            contentToDisplay = `<div class="analysis-body">${record.html}</div>`;
        }

        modalBody.innerHTML = (document.getElementById('common-elements')).innerHTML;
        (modalBody.querySelector('#loading-skeleton')).style.display = 'none'; 
        (modalBody.querySelector('#analysis-results')).innerHTML = contentToDisplay;
        const modalChat = modalBody.querySelector('#chat-container');
        modalChat.style.display = 'none';

        // TÖRÖLVE (v93.0)
        // addP1ModalButtonListeners('#modal-container');

    } catch(e) {
         (document.getElementById('modal-body')).innerHTML = `<p style="color:var(--danger); text-align:center; padding: 2rem;">Hiba a részletek betöltésekor: ${e.message}</p>`;
        console.error("Hiba a részletek megtekintésekor:", e);
    }
}

// ... (sendChatMessage változatlan) ...
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
 * MÓDOSÍTVA (v93.0): A 'runMultiAnalysis' most már az 'appState.manualInputs'-ból
 * veszi az adatokat, nem a kártyáról.
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
    
    // ... (Modal skeleton logika változatlan) ...
    const resultsContainer = document.getElementById('multi-analysis-results');
    const loadingContainer = document.getElementById('multi-loading-skeleton');
    loadingContainer.innerHTML = (document.getElementById('loading-skeleton')).outerHTML;
    const modalSkeleton = loadingContainer.querySelector('.loading-skeleton');
    if (modalSkeleton) modalSkeleton.classList.add('active');

    const analysisPromises = matchesToAnalyze.map(match => {
        const analysisUrl = `${appState.gasUrl}/runAnalysis`;
        
        let manualDataToSend = {};
        
        // MÓDOSÍTÁS (v93.0): Adatok olvasása az appState-ből
        if (appState.manualInputs.has(match.uniqueId)) {
            const manualData = appState.manualInputs.get(match.uniqueId);
            
            // a) xG Komponensek
            if (manualData.manual_H_xG && manualData.manual_H_xGA && manualData.manual_A_xG && manualData.manual_A_xGA) {
                manualDataToSend.manual_H_xG = manualData.manual_H_xG;
                manualDataToSend.manual_H_xGA = manualData.manual_H_xGA;
                manualDataToSend.manual_A_xG = manualData.manual_A_xG;
                manualDataToSend.manual_A_xGA = manualData.manual_A_xGA;
            }

            // b) Hiányzók
            const manualAbsentees = {
                home: parseManualAbsentees(manualData.manual_absentees_home_text),
                away: parseManualAbsentees(manualData.manual_absentees_away_text)
            };
            if (manualAbsentees.home.length > 0 || manualAbsentees.away.length > 0) {
                manualDataToSend.manual_absentees = manualAbsentees;
            }

            // c) Egyéb adatok
            if (manualData.manual_main_line) {
                manualDataToSend.manual_main_line = manualData.manual_main_line;
            }
            if (manualData.context_notes) {
                manualDataToSend.context_notes = manualData.context_notes;
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
            ...manualDataToSend // Itt adjuk át az összes manuális adatot
        };

        // ... (A fetch és promise logika változatlan a v68.1-ből) ...
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
        // ... (Az eredmények renderelése változatlan a v68.1-ből) ...
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
// ... (parseHungarianDate, handleSportChange változatlan) ...
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
    appState.manualInputs.clear(); // v93.0
    (document.getElementById('kanban-board')).innerHTML = '';
    (document.getElementById('mobile-list-container')).innerHTML = '';
    (document.getElementById('placeholder')).style.display = 'flex'; 
    updateMultiSelectButton();
}


/**
 * MÓDOSÍTVA (v93.0): Ez a függvény most már az *új* egységes
 * adatbeviteli modált nyitja meg, és az `appState`-be ment.
 */
function openManualAnalysisModal() {
    // Generálunk egy ideiglenes matchId-t, mivel ez a meccs még nem létezik
    const tempMatchId = `manual_${Date.now()}`;
    const title = 'Manuális Elemzés Indítása';

    // 1. Megnyitjuk az *új* adatbeviteli modált (amit az `initializeApp` hoz létre)
    const modal = document.getElementById('data-input-modal');
    if (!modal) {
        showToast("Hiba: Az adatbeviteli modál nem található!", "error");
        return;
    }
    
    // 2. Kitöltjük az űrlapot (üresen)
    (document.getElementById('modal-match-id')).value = tempMatchId;
    (document.getElementById('modal-match-title')).textContent = title;
    (document.getElementById('modal-home')).value = '';
    (document.getElementById('modal-away')).value = '';
    (document.getElementById('modal-league')).value = '';
    (document.getElementById('modal-kickoff')).value = getDefaultKickoffTime();
    
    (document.getElementById('modal-xg-home')).value = '';
    (document.getElementById('modal-xg-away')).value = '';
    (document.getElementById('modal-h-xga')).value = ''; // v93.0: Hozzáadva
    (document.getElementById('modal-a-xga')).value = ''; // v93.0: Hozzáadva
    (document.getElementById('modal-main-line')).value = '';
    (document.getElementById('modal-absentees-home')).value = '';
    (document.getElementById('modal-absentees-away')).value = '';
    (document.getElementById('modal-context-notes')).value = '';
    
    // 3. Megjelenítjük a modált
    modal.classList.add('open');
    window.addEventListener('keydown', handleEscKeyDataModal);
    modal.addEventListener('click', handleOutsideClickDataModal);
}

// Helper a Kézi Elemzéshez
function getDefaultKickoffTime() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(15, 0, 0, 0);
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const day = String(tomorrow.getDate()).padStart(2, '0');
    const hours = String(tomorrow.getHours()).padStart(2, '0');
    const minutes = String(tomorrow.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}


/**
 * MÓDOSÍTVA (v93.0): Ez a függvény most már az *új* egységes
 * adatbeviteli modálból hívódik, és az `appState`-be ment.
 */
function runAnalysisFromDataModal() {
    // 1. Adatok olvasása az Űrlapból
    const modal = document.getElementById('data-input-modal');
    const matchId = (document.getElementById('modal-match-id')).value;
    
    // Alap adatok
    const home = (document.getElementById('modal-home')).value;
    const away = (document.getElementById('modal-away')).value;
    const league = (document.getElementById('modal-league')).value;
    const kickoffLocal = (document.getElementById('modal-kickoff')).value;

    // Manuális adatok
    const xgH = (document.getElementById('modal-xg-home')).value.replace(',', '.');
    const xgA = (document.getElementById('modal-xg-away')).value.replace(',', '.');
    const xgaH = (document.getElementById('modal-h-xga')).value.replace(',', '.'); // v93.0
    const xgaA = (document.getElementById('modal-a-xga')).value.replace(',', '.'); // v93.0
    const mainLine = (document.getElementById('modal-main-line')).value.replace(',', '.');
    const absHome = (document.getElementById('modal-absentees-home')).value;
    const absAway = (document.getElementById('modal-absentees-away')).value;
    const context = (document.getElementById('modal-context-notes')).value;

    // 2. Validáció
    if (!home || !away || !kickoffLocal) { 
        showToast('A "Hazai", "Vendég" és "Kezdési idő" mezők kitöltése kötelező.', 'error');
        return;
    }
    
    let kickoffDate, utcKickoff;
    try {
        kickoffDate = new Date(kickoffLocal);
        if (isNaN(kickoffDate.getTime())) throw new Error('Érvénytelen dátum formátum.');
        utcKickoff = kickoffDate.toISOString();
    } catch (e) {
         showToast(`Hiba a dátum feldolgozásakor: ${e.message}`, 'error');
        return;
    }

    // 3. Adatok mentése az appState-be
    const manualData = {
        manual_H_xG: parseFloat(xgH) || null,
        manual_A_xG: parseFloat(xgA) || null,
        manual_H_xGA: parseFloat(xgaH) || null, // v93.0
        manual_A_xGA: parseFloat(xgaA) || null, // v93.0
        manual_main_line: parseFloat(mainLine) || null,
        manual_absentees_home_text: absHome || null,
        manual_absentees_away_text: absAway || null,
        context_notes: context || null
    };
    appState.manualInputs.set(matchId, manualData);
    
    // 4. Backend által várt formátum összeállítása
    const manualDataForBackend = {};
    if (manualData.manual_H_xG && manualData.manual_H_xGA && manualData.manual_A_xG && manualData.manual_A_xGA) {
        manualDataForBackend.manual_H_xG = manualData.manual_H_xG;
        manualDataForBackend.manual_H_xGA = manualData.manual_H_xGA;
        manualDataForBackend.manual_A_xG = manualData.manual_A_xG;
        manualDataForBackend.manual_A_xGA = manualData.manual_A_xGA;
    }
    const manualAbsentees = {
        home: parseManualAbsentees(manualData.manual_absentees_home_text),
        away: parseManualAbsentees(manualData.manual_absentees_away_text)
    };
    if (manualAbsentees.home.length > 0 || manualAbsentees.away.length > 0) {
        manualDataForBackend.manual_absentees = manualAbsentees;
    }
    if (manualData.manual_main_line) {
        manualDataForBackend.manual_main_line = manualData.manual_main_line;
    }
    if (manualData.context_notes) {
        manualDataForBackend.context_notes = manualData.context_notes;
    }

    // 5. Elemzés indítása & Modál bezárása
    closeDataInputModal(); // Bezárjuk az adatbeviteli modált
    // A MEGLÉVŐ `runAnalysis` hívása (ami megnyitja az EREDMÉNY modált)
    runAnalysis(home, away, utcKickoff, (league || 'Manual League'), true, manualDataForBackend, matchId);
}

/**
 * v72.0: ÚJ SEGÉDFÜGGVÉNY: A P1 Manuális Hiányzó stringet {name, pos} objektumokká alakítja.
 * (Változatlan, de most már az új modál használja)
 */
const parseManualAbsentees = (rawString) => {
    if (!rawString) return [];
    return rawString.split(',')
        .map(entry => {
            const match = entry.trim().match(/^(.*?)\s*\(([GDMFN/A]+)\)$/i); 
            if (match) {
                return { name: match[1].trim(), pos: match[2].toUpperCase() };
            }
            return { name: entry.trim(), pos: 'N/A' }; 
        })
        .filter(p => p.name);
};


/**
 * TÖRÖLVE (v93.0): A 'runManualAnalysis' függvényt az 'openManualAnalysisModal'
 * és a 'runAnalysisFromDataModal' váltotta fel.
 */
// function runManualAnalysis() { ... } // TÖRÖLVE


function isMobile() { return window.innerWidth <= 1024; } 
// ... (getLeagueGroup változatlan) ...
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
 * MÓDOSÍTVA (v93.0): A kártya HTML-je drasztikusan leegyszerűsítve.
 * Nincsenek xG beviteli mezők, nincs P1 gomb.
 * Az "Elemzés Indítása" gomb most az `openAnalysisDataModal`-t hívja.
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
                            
                            // === MÓDOSÍTÁS (v93.0) ===
                            const p1State = appState.manualInputs.get(fx.uniqueId);
                            // Ellenőrizzük, van-e bármilyen manuális adat (xG vagy hiányzó)
                            const hasManualData = p1State && 
                                (p1State.manual_H_xG || (p1State.manual_absentees_home_text && p1State.manual_absentees_home_text.length > 0));
                            
                            const buttonText = hasManualData ? "Adatok Módosítása" : "Adatok & Elemzés";
                            const buttonClass = hasManualData ? "btn-secondary" : "btn-primary"; // Különböző stílus, ha van adat

                            columnContent += `
                                <div class="match-card selectable-card ${appState.selectedMatches.has(fx.uniqueId) ? 'selected' : ''}" data-match-id="${fx.uniqueId}" style="animation-delay: ${cardIndex * 0.05}s">
                                    <input type="checkbox" class="match-checkbox" data-match-id="${fx.uniqueId}" ${appState.selectedMatches.has(fx.uniqueId) ? 'checked' : ''}>
                                     <div class="match-card-content">
                                          <div class="match-card-teams">${fx.home} – ${fx.away}</div>
                                          <div class="match-card-meta">
                                              <span>${fx.league || 'Ismeretlen Liga'}</span>
                                              <span>${time}</span>
                                          </div>
                                          
                                          <!-- TÖRÖLVE (v93.0): xG Grid és P1 Gomb -->
                                          
                                          <button class="btn ${buttonClass}" 
                                            style="width: 100%; margin-top: 1rem;"
                                            onclick="openAnalysisDataModal('${fx.uniqueId}', '${escape(fx.home)}', '${escape(fx.away)}', '${escape(fx.utcKickoff)}', '${escape(fx.league || '')}')">
                                            ${buttonText}
                                          </button>
                                    </div>
                                </div>`;
                            // === MÓDOSÍTÁS VÉGE ===
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
 * MÓDOSÍTVA (v93.0): Mobil nézet is leegyszerűsítve.
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
                            
                            // === MÓDOSÍTÁS (v93.0) ===
                            const p1State = appState.manualInputs.get(fx.uniqueId);
                            const hasManualData = p1State && (p1State.manual_H_xG || (p1State.manual_absentees_home_text && p1State.manual_absentees_home_text.length > 0));
                            
                            const buttonText = hasManualData ? "Adatok Módosítása" : "Adatok & Elemzés";
                            const buttonClass = hasManualData ? "btn-secondary" : "btn-primary";
                            
                            html += `
                                <div class="list-item selectable-item ${appState.selectedMatches.has(fx.uniqueId) ? 'selected' : ''}" data-match-id="${fx.uniqueId}">
                                    <input type="checkbox" class="match-checkbox" data-match-id="${fx.uniqueId}" ${appState.selectedMatches.has(fx.uniqueId) ? 'checked' : ''}>
                                     
                                    <div class="list-item-content">
                                        <div class="list-item-title">${fx.home} – ${fx.away}</div>
                                        <div class="list-item-meta">${fx.league || 'Ismeretlen Liga'} - ${time}</div>
                                        
                                        <!-- TÖRÖLVE (v93.0): xG Grid és P1 Gomb -->
                                    </div>

                                    <button class="btn ${buttonClass}" 
                                        style="margin-right: 1rem; align-self: center;"
                                        onclick="openAnalysisDataModal('${fx.uniqueId}', '${escape(fx.home)}', '${escape(fx.away)}', '${escape(fx.utcKickoff)}', '${escape(fx.league || '')}')">
                                        ${buttonText}
                                    </button>
                                </div>`;
                            // === MÓDOSÍTÁS VÉGE ===
                        });
                });
        }
    });
    container.innerHTML = html || '<p class="muted" style="text-align:center; padding: 2rem;">Nincsenek elérhető mérkőzések.</p>';
}

// ... (renderHistory változatlan) ...
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
}

// === UI Segédfüggvények (Modal, Toast, Stílusok) ===
// ... (addMessageToChat, groupBy, formatDateLabel változatlan) ...
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


// ... (openModal, closeModal, handleEscKey, handleOutsideClick, showToast, setupThemeSwitcher, createGlowingOrbs, createHeaderOrbs változatlan) ...
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


// === ÚJ (v93.0): Egységes Adatbeviteli Modál Funkciók ===

/**
 * Létrehozza az egységes adatbeviteli modált, és hozzáadja a body-hoz.
 * Csak egyszer fut le az 'initializeApp' során.
 */
function createDataInputModal() {
    const modalHtml = `
    <div classclassName="modal-container" id="data-input-modal">
        <div class="modal-content modal-lg" id="data-input-modal-content">
            <div class="modal-header">
                <h4 id="modal-match-title">Manuális Adatbevitel</h4>
                <button class="btn btn-close" id="data-modal-close-btn">&times;</button>
            </div>
            <div class="modal-body" id="data-modal-body">
                <form id="analysis-data-form">
                    <input type="hidden" id="modal-match-id">
                    
                    <!-- v93.0: Meccs Alapadatok (ha kézi elemzés) -->
                    <details class="manual-match-details">
                        <summary>Meccs Alapadatok (Kézi Elemzésnél Kötelező)</summary>
                        <div class="control-group" style="margin-top: 1rem;">
                            <label for="modal-home">Hazai csapat</label>
                            <input id="modal-home" placeholder="Pl. Liverpool"/>
                        </div>
                        <div class="control-group" style="margin-top: 1rem;">
                            <label for="modal-away">Vendég csapat</label>
                            <input id="modal-away" placeholder="Pl. Manchester City"/>
                        </div>
                        <div class="control-group" style="margin-top: 1rem;">
                            <label for="modal-league">Bajnokságnév</label>
                            <input id="modal-league" placeholder="Pl. Premier League"/>
                        </div>
                        <div class="control-group" style="margin-top: 1rem;">
                            <label for="modal-kickoff">Kezdési idő (Helyi Dátum és Idő)</label>
                            <input id="modal-kickoff" type="datetime-local" />
                        </div>
                    </details>
                    
                    <h5 style="margin-top: 2rem; margin-bottom: 1rem; color: var(--primary);">Kulcs Adatok (AI Bemenet)</h5>
                    <div class="manual-xg-grid" style="margin-top: 0.5rem; grid-template-columns: repeat(2, 1fr);">
                        <input type="text" inputmode="decimal" placeholder="Hazai xG" class="xg-input" id="modal-xg-home" title="Hazai Csapat (Home) xG/90">
                        <input type="text" inputmode="decimal" placeholder="Vendég xG" class="xg-input" id="modal-xg-away" title="Vendég Csapat (Away) xG/90">
                        <input type="text" inputmode="decimal" placeholder="Hazai xGA" class="xg-input" id="modal-h-xga" title="Hazai Csapat (Home) xGA/90">
                        <input type="text" inputmode="decimal" placeholder="Vendég xGA" class="xg-input" id="modal-a-xga" title="Vendég Csapat (Away) xGA/90">
                    </div>
                    <div class="control-group" style="margin-top: 1rem;">
                        <label for="modal-main-line">Fő Gól Vonal</label>
                        <input type="text" inputmode="decimal" class="xg-input" style="text-align: center;" id="modal-main-line" placeholder="pl. 2.5">
                    </div>

                    <h5 style="margin-top: 1.5rem; margin-bottom: 1rem; color: var(--primary);">Kontextus Adatok (AI Bemenet)</h5>
                    <div class="control-group" style="margin-top: 0.5rem;">
                        <label for="modal-absentees-home">Hazai kulcshiányzók (Név (Pos), ...)</label>
                        <textarea id="modal-absentees-home" rows="2" class="xg-input" style="text-align: left;" placeholder="Pl: Neuer (G), Kimmich (D)"></textarea>
                    </div>
                    <div class="control-group" style="margin-top: 0.5rem;">
                        <label for="modal-absentees-away">Vendég kulcshiányzók (Név (Pos), ...)</label>
                        <textarea id="modal-absentees-away" rows="2" class="xg-input" style="text-align: left;" placeholder="Pl: Gavi (M), Lewandowski (F)"></textarea>
                    </div>
                    <div class="control-group" style="margin-top: 0.5rem;">
                        <label for="modal-context-notes">Időjárás / Morál / Egyéb Hírek</label>
                        <textarea id="modal-context-notes" rows="2" class="xg-input" style="text-align: left;" placeholder="Pl: Erős esőzés várható. Hazai morál magas."></textarea>
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button class="btn" onclick="closeDataInputModal()">Mégse</button>
                <button class="btn btn-primary" id="data-modal-run-btn">Elemzés Indítása</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Eseményfigyelők hozzáadása
    document.getElementById('data-modal-close-btn').addEventListener('click', closeDataInputModal);
    document.getElementById('data-modal-run-btn').addEventListener('click', runAnalysisFromDataModal);
}

/**
 * Megnyitja az egységes adatbeviteli modált a meccs adataival.
 */
function openAnalysisDataModal(matchId, home, away, utcKickoff, league) {
    home = unescape(home);
    away = unescape(away);
    league = unescape(league);
    utcKickoff = unescape(utcKickoff);
    
    const modal = document.getElementById('data-input-modal');
    if (!modal) {
        showToast("Hiba: Az adatbeviteli modál nem inicializálódott!", "error");
        return;
    }
    
    // 1. Cím és rejtett ID beállítása
    (document.getElementById('modal-match-title')).textContent = `${home} vs ${away}`;
    (document.getElementById('modal-match-id')).value = matchId;

    // 2. Alapadatok beállítása (ezek most már nem szerkeszthetőek itt, ha meccskártyáról jön)
    const detailsSection = modal.querySelector('.manual-match-details');
    detailsSection.style.display = 'none'; // Elrejtjük, ha meglévő meccset szerkesztünk
    (document.getElementById('modal-home')).value = home;
    (document.getElementById('modal-away')).value = away;
    (document.getElementById('modal-league')).value = league;
    try {
        const localDate = new Date(utcKickoff).toISOString().slice(0, 16);
        (document.getElementById('modal-kickoff')).value = localDate;
    } catch(e) {
        (document.getElementById('modal-kickoff')).value = '';
    }

    // 3. Mentett manuális adatok betöltése az appState-ből
    const savedData = appState.manualInputs.get(matchId) || {};
    (document.getElementById('modal-xg-home')).value = savedData.manual_H_xG || '';
    (document.getElementById('modal-xg-away')).value = savedData.manual_A_xG || '';
    (document.getElementById('modal-h-xga')).value = savedData.manual_H_xGA || ''; // v93.0
    (document.getElementById('modal-a-xga')).value = savedData.manual_A_xGA || ''; // v93.0
    (document.getElementById('modal-main-line')).value = savedData.manual_main_line || '';
    (document.getElementById('modal-absentees-home')).value = savedData.manual_absentees_home_text || '';
    (document.getElementById('modal-absentees-away')).value = savedData.manual_absentees_away_text || '';
    (document.getElementById('modal-context-notes')).value = savedData.context_notes || '';

    // 4. Modál megjelenítése
    modal.classList.add('open');
    window.addEventListener('keydown', handleEscKeyDataModal);
    modal.addEventListener('click', handleOutsideClickDataModal);
}

function closeDataInputModal() {
    const modalContainer = document.getElementById('data-input-modal');
    modalContainer.classList.remove('open');
    window.removeEventListener('keydown', handleEscKeyDataModal);
    modalContainer.removeEventListener('click', handleOutsideClickDataModal);
}

function handleEscKeyDataModal(event) { if (event.key === 'Escape') closeDataInputModal(); }
function handleOutsideClickDataModal(event) { if (event.target === document.getElementById('data-input-modal')) closeDataInputModal(); }


// === Multi-Select UI Függvények (v62.1) ===
// ... (initMultiSelect változatlan) ...
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


// ... (addCheckboxListeners, handleCheckboxChange, updateMultiSelectButton változatlan) ...
function addCheckboxListeners() {
    const checkboxes = document.querySelectorAll('.match-checkbox');
    checkboxes.forEach(cb => {
        cb.removeEventListener('change', handleCheckboxChange);
        cb.addEventListener('change', handleCheckboxChange);
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


// === TÖRÖLVE (v93.0): Az összes P1 Modal, Drag-and-Drop és kapcsolódó függvények ===
// Törölve: addP1ModalButtonListeners
// Törölve: openP1AbsenteesModal
// Törölve: _getAndRenderRosterModalHtml
// Törölve: _buildRosterModalHtml
// Törölve: handleP1Search
// Törölve: handleP1DragStart
// Törölve: handleP1DragOver
// Törölve: handleP1DragEnter
// Törölve: handleP1DragLeave
// Törölve: handleP1Drop
// Törölve: _updateP1ButtonCount


// === KLIENSOLDALI HTML GENERÁTOROK (v62.1) ===
// ... (escapeHTML, escapeRegExp, _highlightKeywords, processAiText, processAiList változatlan) ...
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

// ... (getRadialChartHtml, getGaugeHtml, getConfidenceInterpretationHtml, getMicroAnalysesHtml változatlan) ...
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


/**
 * TÖRÖLVE (v93.0): A P1 roster gomb az elemzési modalon belül felesleges.
 */
// function _buildRosterSelectorHtml(...) // TÖRÖLVE


/**
 * === FŐ KLIENSOLDALI HTML ÉPÍTŐ (MÓDOSÍTVA v93.0) ===
 * A P1 Absentees gomb el lett távolítva a "NARRATÍVA OSZLOP"-ból.
 */
function buildAnalysisHtml_CLIENTSIDE(
    fullAnalysisReport,
    matchData, 
    oddsData, 
    valueBets, 
    quantConfidence,
    finalConfidenceScore,
    sim, 
    masterRecommendation,
    availableRosters,
    matchId
) {
    
    // ... (1. ADATOK KINYERÉSE - Változatlan) ...
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
    const modelConf = quantConfidence?.toFixed(1) || '1.0';
    const expertConfScore = finalConfidenceScore?.toFixed(1) || '1.0';
    
    // ... (A 'committee' feldolgozása - Változatlan v68.1-ből) ...
    let expertConfHtml, prophetText, synthesisText, microModelsHtml, quantReportHtml, scoutReportHtml, criticReportHtml;
    if (fullAnalysisReport && fullAnalysisReport.strategist) {
        const strategistReport = fullAnalysisReport.strategist;
        const criticReport = fullAnalysisReport.critic;
        expertConfHtml = strategistReport?.final_confidence_report || `**${expertConfScore}/10** - Stratéga hiba.`;
        prophetText = strategistReport?.prophetic_timeline || "A Próféta nem adott meg jóslatot.";
        if (prophetText && !prophetText.includes("Hiba")) {
            prophetText += `\n(Súlyozott xG: ${mu_h} - ${mu_a}. Legvalószínűbb eredmény: ${sim?.topScore?.gh ?? 'N/A'} - ${sim?.topScore?.ga ?? 'N/A'}.)`;
        }
        synthesisText = strategistReport?.strategic_synthesis || "A stratégiai szintézis nem elérhető.";
        microModelsHtml = getMicroAnalysesHtml(strategistReport?.micromodels, teamNames);
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
           
        criticReportHtml = (fullAnalysisReport?.scout) ?
        `
            <div class="committee-card scout">
                <h4>2. Ügynök: Scout Jelentése</h4>
                <p><strong>Összefoglaló:</strong> ${processAiText(fullAnalysisReport.scout.summary, teamNames)}</p>
                <strong>Kulcs Tényezők:</strong>
                <ul class="key-insights">
                    ${processAiList(fullAnalysisReport.scout.key_insights, teamNames)}
                </ul>
            </div>` : '';
            
    } else {
        // ... (Hibakezelés változatlan) ...
        prophetText = fullAnalysisReport?.prophetic_timeline || "Hiba: Az elemzési jelentés ('committee') struktúrája ismeretlen, vagy 'strategist' kulcs hiányzik.";
        synthesisText = fullAnalysisReport?.strategic_synthesis || "Hiba: Az elemzési jelentés ('committee') struktúrája ismeretlen.";
        expertConfHtml = fullAnalysisReport?.final_confidence_report || `**${expertConfScore}/10** - Ismeretlen adatszerkezet.`;
        microModelsHtml = getMicroAnalysesHtml(fullAnalysisReport?.micromodels, teamNames) || "<p>Hiba: Mikromodellek betöltése sikertelen.</p>";
        quantReportHtml = "<p>Hiba: Quant jelentés betöltése sikertelen.</p>";
        scoutReportHtml = "<p>Hiba: Kritikus jelentés betöltése sikertelen.</p>";
        criticReportHtml = "<p>Hiba: Scout jelentés betöltése sikertelen.</p>";
    }

    // ... (2. FŐ AJÁNLÁS - Változatlan) ...
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

    // ... (3. PRÓFÉTA KÁRTYA - Változatlan) ...
    const prophetCardHtml = `
    <div class="prophet-card">
        <h5><strong>🔮 A Próféta Látomása (Várható Meccskép)</strong></h5>
        <p>${processAiText(prophetText, teamNames)}</p>
    </div>`;
    // ... (4. SZINTÉZIS KÁRTYA - Változatlan) ...
    const synthesisCardHtml = `
    <div class="synthesis-card">
        <h5><strong>🧠 Stratégiai Szintézis (A Fő Elemzés)</strong></h5>
        <p>${processAiText(synthesisText, teamNames)}</p>
    </div>`;
    
    // --- 5. TÖRÖLVE (v93.0): P1 HIÁNYZÓ GOMB ---
    const p1AbsenteesHtml = '';
        
    // ... (6. CHAT - Változatlan) ...
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

    // ... (7. ADAT OSZLOP (SIDEBAR) - Változatlan) ...
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
        ${(quantReportHtml || scoutReportHtml || criticReportHtml) ? `
        <details open>
            <summary>Bizottsági Jelentések</summary>
            <div class="accordion-content committee-reports">
                ${quantReportHtml}
                ${criticReportHtml} 
                ${scoutReportHtml} 
            </div>
        </details>` : ''}
    </div>`;

    // --- 8. VÉGLEGES HTML ÖSSZEÁLLÍTÁSA (MÓDOSÍTVA v93.0) ---
    // A 'p1AbsenteesHtml' törölve a 'main' oszlopból.
    return `
        <div class="analysis-layout">
            
            <div class="analysis-layout-main">
                ${masterRecommendationHtml}
                ${prophetCardHtml}
                ${synthesisCardHtml}
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

// --- 4. ALKALMAZÁS INDÍTÓ LOGIKA (MÓDOSÍTVA v93.0) ---

function initializeApp() {
    setupThemeSwitcher();
    document.getElementById('loadFixturesBtn')?.addEventListener('click', loadFixtures);
    document.getElementById('historyBtn')?.addEventListener('click', openHistoryModal);
    document.getElementById('manualBtn')?.addEventListener('click', openManualAnalysisModal);
    createGlowingOrbs();
    createHeaderOrbs();
    initMultiSelect();
    (document.getElementById('userInfo')).textContent = `Csatlakozva...`;
    appState.sheetUrl = localStorage.getItem('sheetUrl') || ''; 
    appState.rosterCache.clear();
    appState.manualInputs.clear(); // v93.0

    const toastContainer = document.createElement('div');
    toastContainer.id = 'toast-notification-container';
    toastContainer.className = 'toast-notification-container';
    document.body.appendChild(toastContainer);
    
    // === ÚJ (v93.0): Az egységes adatbeviteli modál létrehozása indításkor ===
    createDataInputModal();
}

// ... (setupLoginProtection változatlan) ...
function setupLoginProtection() {
    const loginOverlay = document.getElementById('login-overlay');
    const appContainer = document.querySelector('.app-container');
    const storedToken = sessionStorage.getItem('authToken');
    if (storedToken) {
        appState.authToken = storedToken;
        loginOverlay.style.display = 'none';
        appContainer.style.display = 'flex';
        initializeApp();
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
            initializeApp(); 

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
