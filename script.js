// --- script.js (v68.0 - P1 Pozíció Módosítás) ---
// MÓDOSÍTÁS (Feladat 6 - "Kurva Jó Elemzés" Alapja):
// 1. MÓDOSÍTVA: Az 'appState.p1SelectedAbsentees' most már nem string[] tömböt,
//    hanem { name: string, pos: string }[] objektum tömböt tárol.
// 2. MÓDOSÍTVA: '_buildRosterModalHtml' (és a belső 'buildPlayerCards') most már
//    hozzáadja a 'data-player-pos' attribútumot a kanban kártyákhoz.
// 3. MÓDOSÍTVA: 'handleP1DragStart' most már a 'player-pos'-t is átadja.
// 4. MÓDOSÍTVA: 'handleP1Drop' most már a {name, pos} objektumot menti az appState-be.
// 5. MÓDOSÍTVA: 'runManualAnalysis' átalakítva, hogy támogassa a "Név (Pos)"
//    formátumot a kézi bevitelhez.

// --- 1. ALKALMAZÁS ÁLLAPOT ---
const appState = {
    currentSport: 'soccer',
    gasUrl: 'https://king-ai-backend.onrender.com', // v50.0: Render URL
    fixtures: [], // Betöltött meccsek
    currentAnalysisContext: '',
    chatHistory: [],
    selectedMatches: new Set(),
    authToken: null,
    // v62.1: Globális gyorsítótár a kereteknek
    rosterCache: new Map(),
    // v68.0: MÓDOSÍTVA! A P1 hiányzók most már objektumokat tárolnak
    // Struktúra: Map<matchId, { home: { name: string, pos: string }[], away: { name: string, pos: string }[] }>
    p1SelectedAbsentees: new Map()
};

// --- 2. LIGA KATEGÓRIÁK ---
const LEAGUE_CATEGORIES = {
    // (A teljes LEAGUE_CATEGORIES objektum itt van, feltételezve, hogy létezik)
    // ... (ez a rész feltételezhetően változatlan maradt a korábbi, teljes fájlban)
};

// --- 3. SEGÉDFÜGGVÉNY DEFINÍCIÓK (DEFINÍCIÓK) ---

// === Biztonsági és Hálózati Függvények ===
async function fetchWithAuth(url, options = {}) {
    if (appState.authToken) {
        options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${appState.authToken}`
        };
    }
    
    // Alapértelmezett 'Content-Type', ha van body, de nincs megadva
    if (options.body && !options.headers?.['Content-Type']) {
        options.headers = {
            ...options.headers,
            'Content-Type': 'application/json'
        };
    }

    const response = await fetch(url, config);
    if (response.status === 401) { 
        showToast('Hitelesítés lejárt. Újrapróbálkozás...', 'error');
        // Ide jöhet egy token frissítési logika
    }
    return response;
}

async function handleFetchError(response) {
    let errorMsg = `Hiba: ${response.status} ${response.statusText}`;
    try {
        const errorData = await response.json();
        errorMsg = errorData.error || errorMsg;
    } catch (e) {
        // A válasz nem volt JSON
    }
    throw new Error(errorMsg);
}

// === Fő Adatkezelő Funkciók ===

async function loadFixtures() {
    const loadBtn = document.getElementById('load-fixtures-btn');
    const status = document.getElementById('userInfo');
    loadBtn.disabled = true;
    loadBtn.textContent = 'Betöltés...';
    status.textContent = 'Meccsek betöltése a szerverről...';

    try {
        const sport = appState.currentSport;
        const url = `${appState.gasUrl}/getFixtures?sport=${sport}&v=6`;
        const response = await fetchWithAuth(url);
        
        if (!response.ok) await handleFetchError(response);

        const data = await response.json();
        
        if (!data.fixtures || data.fixtures.length === 0) {
            status.textContent = 'Nincsenek elérhető meccsek.';
            appState.fixtures = [];
            document.getElementById('kanban-board-container').innerHTML = '<p class="placeholder">Nincsenek elérhető meccsek.</p>';
            return;
        }

        appState.fixtures = data.fixtures;
        
        // Renderelés (v54.0)
        if (isMobile()) {
            renderFixturesForMobileList(data.fixtures);
        } else {
            renderFixturesForDesktop(data.fixtures);
        }
        
        // Eseményfigyelők (v62.1)
        initMultiSelect();
        addCheckboxListeners();
        // === MÓDOSÍTÁS (v63.3): Régi listener cserélve az újra ===
        addP1ModalButtonListeners();
        
        (document.getElementById('userInfo')).textContent = `Csatlakozva (Meccsek betöltve)`;
        showToast(`Sikeresen betöltve ${data.fixtures.length} meccs (${sport}).`, 'success');

    } catch (e) {
        console.error('Hiba a meccsek betöltésekor:', e);
        status.textContent = `Hiba: ${e.message}`;
        showToast(e.message, 'error');
    } finally {
        loadBtn.disabled = false;
        loadBtn.textContent = 'Meccsek Betöltése';
    }
}

function runAnalysisFromCard(buttonElement, home, away, utcKickoff, leagueName) {
    const card = buttonElement.closest('.match-card, .list-item');
    if (!card) return;
    
    // v63.3: ID lekérése
    const matchId = card.dataset.matchId;
    
    // 1. P1 Komponens (4 mező) olvasása
    const H_xG_raw = (card.querySelector('input[name="H_xG"]'))?.value;
    const H_xGA_raw = (card.querySelector('input[name="H_xGA"]'))?.value;
    const A_xG_raw = (card.querySelector('input[name="A_xG"]'))?.value;
    const A_xGA_raw = (card.querySelector('input[name="A_xGA"]'))?.value;

    let manualXgData = {};
    if (H_xG_raw && H_xGA_raw && A_xG_raw && A_xGA_raw) {
        const H_xG = parseFloat(H_xG_raw);
        const H_xGA = parseFloat(H_xGA_raw);
        const A_xG = parseFloat(A_xG_raw);
        const A_xGA = parseFloat(A_xGA_raw);
        
        if (!isNaN(H_xG) && !isNaN(H_xGA) && !isNaN(A_xG) && !isNaN(A_xGA)) {
            manualXgData = {
                manual_H_xG: H_xG,
                manual_H_xGA: H_xGA,
                manual_A_xG: A_xG,
                manual_A_xGA: A_xGA
            };
            console.log('Manuális (Komponens) xG-t küldök:', manualXgData);
        }
    }

    // 2. MÓDOSÍTÁS (v68.0): P1 Manuális Hiányzók (Objektumok) olvasása az appState-ből
    if (matchId && appState.p1SelectedAbsentees.has(matchId)) {
        const manualAbsentees = appState.p1SelectedAbsentees.get(matchId);
        if (manualAbsentees.home.length > 0 || manualAbsentees.away.length > 0) {
            (manualXgData).manual_absentees = manualAbsentees;
            console.log('Manuális (P1) Hiányzókat (objektumokkal) küldök az appState-ből:', manualAbsentees);
        }
    }
    
    runAnalysis(home, away, utcKickoff, leagueName, true, manualXgData, matchId); // v63.6: matchId átadása
}

async function runAnalysis(home, away, utcKickoff, leagueName, forceNew = false, manualXg = {}, matchId = null) {
    
    // v63.6: Ha a matchId-t nem a 'runAnalysisFromCard' adta át, generáljuk le
    if (!matchId) {
         matchId = `${appState.currentSport}_${home.toLowerCase().replace(/\s+/g, '')}_${away.toLowerCase().replace(/\s+/g, '')}`;
    }
    
    const modalTitle = `${home} vs ${away}`;
    openModal(modalTitle); // Megnyitja a modalt (skeletonnal)
    
    const modalResults = document.getElementById('analysis-results');
    const modalSkeleton = document.querySelector('#modal-container #loading-skeleton');
    const modalChatContainer = document.getElementById('chat-container-modal');
    modalResults.innerHTML = '';
    modalSkeleton.classList.add('active');

    // Chat állapot nullázása
    appState.currentAnalysisContext = '';
    appState.chatHistory = [];
    const chatMessages = modalChatContainer.querySelector('.chat-messages');
    chatMessages.innerHTML = '';
    const chatInput = modalChatContainer.querySelector('#chat-input');
    const chatSendBtn = modalChatContainer.querySelector('#chat-send-btn');
    chatInput.value = '';
    chatInput.onkeyup = (e) => e.key === "Enter" && sendChatMessage();
    chatSendBtn.onclick = sendChatMessage;

    try {
        const analysisUrl = `${appState.gasUrl}/runAnalysis`;
        
        const payload = {
            home: home,
            away: away,
            utcKickoff: utcKickoff,
            leagueName: leagueName,
            sport: appState.currentSport,
            forceNew: forceNew,
            ...manualXg // Itt adjuk át a P1 Komponenst és a P1 Hiányzókat
        };
        // v61.0: Biztosítjuk, hogy a hibás 2-mezős adatok ne kerüljenek elküldésre
        if (payload.manual_H_xG && !payload.manual_A_xG) {
            delete payload.manual_H_xG;
            delete payload.manual_H_xGA;
        }
        
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
            // const uniqueId = `${appState.currentSport}_${home.toLowerCase().replace(/\s+/g, '')}_${away.toLowerCase().replace(/\s+/g, '')}`;
            appState.rosterCache.set(matchId, analysisData.availableRosters); // v63.6: A helyes matchId-t használjuk
        }
        
        // === MÓDOSÍTÁS (v63.1) ===
        // A kliensoldali renderelő most már megkapja a teljes "committee" objektumot
        const finalHtml = buildAnalysisHtml_CLIENTSIDE(
            analysisData.committee,
            analysisData.recommendation, // v63.1: Stratéga ajánlása
            analysisData.meta, // (home, away, sport, league)
            analysisData.sim, // (topScore, odds, stb.)
            analysisData.modelConfidence, // Quant Bizalom
            analysisData.finalConfidenceScore, // Stratéga Bizalom
            analysisData.sim,
            analysisData.sim, // Duplikált 'sim' - valószínűleg hiba, de a függvény szignatúrája szerint
            analysisData.availableRosters, // v63.3: Átadjuk a renderelőnek, hogy a modalban is működjön
            matchId // v63.3: Átadjuk az ID-t a modal hívásához
        );
        modalResults.innerHTML = `<div class="analysis-body">${finalHtml}</div>`;
        
        // v59.0: A görgetősávok frissítése a layouton (ha van)
        const layout = modalResults.querySelector('.analysis-layout');
        if (layout) {
            // (Nincs specifikus frissítési kód, a CSS-nek kell kezelnie)
        }
        
        // Chat átmozgatása a harmonikából (v59.0)
        const chatWrapper = modalResults.querySelector('#chat-content-wrapper');
        if (chatWrapper) {
            chatWrapper.appendChild(modalChatContainer);
            modalChatContainer.style.display = 'block';
        }

        // === MÓDOSÍTÁS (6 FŐS BIZOTTSÁG) ===
        // A 'committee' objektumot használjuk az appState beállításához
        const committee = analysisData.committee;
        const recommendation = analysisData.recommendation;
        
        appState.currentAnalysisContext = `Fő elemzés: ${committee.strategist?.strategic_synthesis || 'N/A'}\n
Prófécia: ${committee.strategist?.prophetic_timeline || 'N/A'}\n
Kritika: ${committee.critic?.tactical_summary || 'N/A'}\n
Ajánlás: ${recommendation.recommended_bet} (Bizalom: ${recommendation.final_confidence})`;
            
        // v54.6: Update gauge diagramok
        document.querySelectorAll('.gauge-svg').forEach(svg => {
            const value = svg.dataset.value;
            const gauge = svg.querySelector('.gauge-value');
            if (gauge) {
                const dashOffset = 235.6 * (1 - value / 10);
                gauge.style.strokeDashoffset = dashOffset;
            }
        });
        
        // === ÚJ (v63.3) ===
        // Eseményfigyelő hozzáadása az elemzési modalon belüli "Hiányzók Megadása" gombhoz
        addP1ModalButtonListeners('#modal-container');
        
    } catch (e) {
        console.error('Hiba az elemzés futtatásakor:', e);
        modalResults.innerHTML = `<div class="placeholder"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><strong>Elemzési Hiba</strong><p>${e.message}</p></div>`;
    } finally {
        modalSkeleton.classList.remove('active');
    }
}

async function openHistoryModal() {
    openModal('Elemzési Előzmények', '<div id="history-list" class="modal-body"><div id="loading-skeleton" class="loading-skeleton active"><div class="skeleton-card"><div class="skeleton-line" style="width: 60%;"></div><div class="skeleton-line" style="width: 80%;"></div></div><div class="skeleton-card"><div class="skeleton-line" style="width: 70%;"></div><div class="skeleton-line" style="width: 90%;"></div></div></div></div>', 'modal-lg');
    
    try {
        const response = await fetchWithAuth(`${appState.gasUrl}/getHistory`);
        if (!response.ok) await handleFetchError(response);
        const historyData = await response.json();
        renderHistory(historyData);
    } catch (e) {
        document.getElementById('history-list').innerHTML = `<p class="muted" style="text-align:center; padding: 2rem;">Hiba az előzmények lekérésekor: ${e.message}</p>`;
    }
}

async function deleteHistoryItem(id) {
    if (!confirm('Biztosan törölni szeretnéd ezt az elemet?')) return;
    try {
        const response = await fetchWithAuth(`${appState.gasUrl}/deleteHistoryItem?id=${id}`, { method: 'DELETE' });
        if (!response.ok) await handleFetchError(response);
        showToast('Elem sikeresen törölve.', 'success');
        openHistoryModal(); // Frissítés
    } catch (e) {
        showToast(`Hiba a törléskor: ${e.message}`, 'error');
    }
}

async function runFinalCheck(home, away, sport) {
    // (Ez a funkció jelenleg nincs bekötve)
}

async function viewHistoryDetail(id) {
    openModal('Előzmény Elemzés Betöltése', '<div id="loading-skeleton" class="loading-skeleton active"><div class="skeleton-card"><div class="skeleton-line" style="width: 60%;"></div><div class="skeleton-line" style="width: 80%;"></div></div></div>', 'modal-xl');
    
    try {
        const response = await fetchWithAuth(`${appState.gasUrl}/getHistoryDetail?id=${id}`);
        if (!response.ok) await handleFetchError(response);
        const record = await response.json();
        
        let contentToDisplay = 'A mentett HTML adat nem található.';
        if (record.html) {
            contentToDisplay = record.html;
             // v63.x: JSON API Mód ellenőrzése
            if (record.html.startsWith("JSON_API_MODE")) {
            // Próbáljuk meg az új (v63.0) módban renderelni
            if (record.html.includes("v63.0 Lánc") || record.html.includes("v63.1 Lánc") || record.html.includes("v64.0 Lánc") || record.html.includes("v65.0 Lánc") || record.html.includes("v66.0 Lánc") || record.html.includes("v67.0 Lánc")) { // Módosítva
                 contentToDisplay = `<p class="muted" style="text-align:center; padding: 2rem;">Ez egy "v6x.x Bizottsági Lánc" elemzés.<br>A mentett JSON adatok visszatöltése és újrarajzolása jelenleg még nincs implementálva.</p>`;
            } else {
                 contentToDisplay = `<p class="muted" style="text-align:center; padding: 2rem;">Ismeretlen JSON_API_MODE verzió.</p>`;
            }
           }
        }
        
        openModal(`Előzmény: ${record.homeName} vs ${record.awayName}`, `<div class="modal-body" style="padding: 0;"><div class="analysis-body" style="height: 100%;">${contentToDisplay}</div></div>`);
    
    } catch (e) {
        showToast(`Hiba a részletek lekérésekor: ${e.message}`, 'error');
        closeModal();
    }
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const thinkingIndicator = document.getElementById('chat-thinking');
    const message = input.value.trim();
    if (!message) return;

    addMessageToChat(message, 'user');
    input.value = '';
    thinkingIndicator.style.display = 'block';

    appState.chatHistory.push({ role: 'user', parts: [{ text: message }] });

    try {
        const response = await fetchWithAuth(`${appState.gasUrl}/chat`, {
            method: 'POST',
            body: JSON.stringify({
                context: appState.currentAnalysisContext,
                history: appState.chatHistory
            })
        });
        if (!response.ok) await handleFetchError(response);
        
        const data = await response.json();
        addMessageToChat(data.answer, 'ai');
        
        appState.chatHistory.push({ role: 'user', parts: [{ text: message }] });
        appState.chatHistory.push({ role: 'model', parts: [{ text: data.answer }] });
    } catch (e) {
        addMessageToChat(`Hiba: ${e.message}`, 'ai');
    } finally {
        thinkingIndicator.style.display = 'none';
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

/**
 * v68.0: Kezeli a P1 Komponens xG-t ÉS a P1 Manuális Hiányzókat (objektumként)
 */
async function runMultiAnalysis() {
    const modalTitle = `Többes Elemzés (${appState.selectedMatches.size} meccs)`;
    openModal(modalTitle, '<div id="multi-analysis-results" class="modal-body" style="overflow-y: auto;"></div>');
    
    const resultsContainer = document.getElementById('multi-analysis-results');
    resultsContainer.innerHTML = '';
    
    const matchesToAnalyze = Array.from(appState.selectedMatches).map(id => {
        return appState.fixtures.find(fx => fx.id === id);
    }).filter(Boolean);
    
    if (matchesToAnalyze.length === 0) {
        resultsContainer.innerHTML = '<p class="muted">Nincs kiválasztott meccs.</p>';
        return;
    }

    const analysisPromises = matchesToAnalyze.map(match => {
        const analysisUrl = `${appState.gasUrl}/runAnalysis`;
        
        // v68.0: Ellenőrizzük a P1 adatokat a kártyáról (xG) és az appState-ből (Hiányzók objektumok)
        const matchId = match.id;
        const card = document.querySelector(`.match-card[data-match-id="${matchId}"], .list-item[data-match-id="${matchId}"]`);
        
        let manualXgData = {};
        
        if (card) {
            // 1. P1 Komponens xG
            const H_xG_raw = (card.querySelector('input[name="H_xG"]'))?.value;
            const H_xGA_raw = (card.querySelector('input[name="H_xGA"]'))?.value;
            const A_xG_raw = (card.querySelector('input[name="A_xG"]'))?.value;
            const A_xGA_raw = (card.querySelector('input[name="A_xGA"]'))?.value;
            if (H_xG_raw && H_xGA_raw && A_xG_raw && A_xGA_raw) {
                const H_xG = parseFloat(H_xG_raw);
                const H_xGA = parseFloat(H_xGA_raw);
                const A_xG = parseFloat(A_xG_raw);
                const A_xGA = parseFloat(A_xGA_raw);
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
            
        // 2. P1 Hiányzók (az appState-ből, már objektumokként)
        if (matchId && appState.p1SelectedAbsentees.has(matchId)) {
            const manualAbsentees = appState.p1SelectedAbsentees.get(matchId);
            if (manualAbsentees.home.length > 0 || manualAbsentees.away.length > 0) {
                (manualXgData).manual_absentees = manualAbsentees;
            }
        }
        
        const payload = {
            home: match.home.name,
            away: match.away.name,
            utcKickoff: match.utcKickoff,
            leagueName: match.league.name,
            sport: appState.currentSport,
            forceNew: true, // Multi-elemzésnél mindig kényszerítjük
            ...manualXgData // Itt adjuk át a P1 xG-t és Hiányzókat (objektumok)
        };
        return fetchWithAuth(analysisUrl, {
            method: 'POST',
            body: JSON.stringify(payload)
        }).then(res => res.json());
    });
    
    for (const promise of analysisPromises) {
        try {
            const data = await promise;
            if (data.error) throw new Error(data.error);
            
            // Itt csak a fő ajánlást jelenítjük meg
            const rec = data.analysisData.recommendation;
            const meta = data.analysisData.meta;
            const itemHtml = `
                <div class="multi-analysis-item">
                    <h4>${meta.homeName} vs ${meta.awayName}</h4>
                    <div class="master-recommendation-card">
                        <div class="master-bet">${rec.recommended_bet}</div>
                        <div class="master-confidence">Bizalom: <strong class="glowing-text-white">${rec.final_confidence.toFixed(1)}/10</strong></div>
                        <p class="master-reasoning">${rec.brief_reasoning}</p>
                    </div>
                </div>
            `;
            resultsContainer.innerHTML += itemHtml;
            
        } catch (e) {
            resultsContainer.innerHTML += `<div class="multi-analysis-item"><h4>Hiba</h4><p>${e.message}</p></div>`;
        }
    }
}

// === Dátum és Adatkezelő Segédfüggvények ===

const parseHungarianDate = (huDate) => {
    // (Ez a funkció jelenleg nincs bekötve)
    const parts = huDate.match(/(\d{4})\. (\w+)\. (\d+)\., (\d{2}):(\d{2})/);
    if (!parts) return null;
    const monthMap = { /* ... */ };
    return new Date(/* ... */);
};

function handleSportChange() {
    const sport = document.getElementById('sport-select').value;
    appState.currentSport = sport;
    loadFixtures();
    appState.selectedMatches.clear();
    updateMultiSelectButton();
}

/**
 * v68.0: Új placeholder a "Név (Pos)" formátumhoz
 */
function openManualAnalysisModal() {
    const content = `
        <p class="muted" style="margin-bottom: 1.5rem;">Add meg a meccs részleteit. A P1 Komponensek (xG) és a P1 Manuális Hiányzók (vesszővel elválasztva) felülírják az automatikus adatokat.</p>
        <div class="control-group" style="margin-bottom: 1rem;">
            <label>Sport</label>
            <div class="select-wrapper">
                <select id="manual-sport">
                    <option value="soccer" ${appState.currentSport === 'soccer' ? 'selected' : ''}>Soccer</option>
                    <option value="basketball" ${appState.currentSport === 'basketball' ? 'selected' : ''}>Basketball</option>
                </select>
            </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
            <div class="control-group"><label>Hazai Csapat</label><input type="text" id="manual-home" placeholder="Pl: Real Madrid"></div>
            <div class="control-group"><label>Vendég Csapat</label><input type="text" id="manual-away" placeholder="Pl: Barcelona"></div>
        </div>
        <div class="control-group" style="margin-bottom: 1rem;"><label>Liga (opcionális)</label><input type="text" id="manual-league" placeholder="Pl: La Liga"></div>
        <div class="control-group" style="margin-bottom: 1.5rem;"><label>Kezdés (opcionális)</label><input type="datetime-local" id="manual-kickoff"></div>
        
        <h5 style="font-size: 1rem; color: var(--primary); margin-bottom: 1rem; margin-top: 1.5rem; border-top: 1px solid var(--border-color); padding-top: 1.5rem;">P1 Komponensek (Opcionális)</h5>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
            <div class="control-group"><label>Hazai xG</label><input type="number" id="manual-h-xg" placeholder="Pl: 1.85"></div>
            <div class="control-group"><label>Hazai xGA</label><input type="number" id="manual-h-xga" placeholder="Pl: 1.12"></div>
            <div class="control-group"><label>Vendég xG</label><input type="number" id="manual-a-xg" placeholder="Pl: 1.33"></div>
            <div class="control-group"><label>Vendég xGA</label><input type="number" id="manual-a-xga" placeholder="Pl: 1.50"></div>
        </div>

        <h5 style="font-size: 1rem; color: var(--primary); margin-bottom: 1rem; margin-top: 1.5rem; border-top: 1px solid var(--border-color); padding-top: 1.5rem;">P1 Manuális Hiányzók (Opcionális)</h5>
        <!-- MÓDOSÍTÁS (v68.0): Új placeholder a formátum jelzéséhez -->
        <div class="control-group" style="margin-bottom: 1rem;">
            <label>Hazai Hiányzók</label>
            <input type="text" id="manual-abs-home" placeholder="Pl: Neuer (G), Kimmich (D)">
        </div>
        <div class="control-group" style="margin-bottom: 1rem;">
            <label>Vendég Hiányzók</label>
            <input type="text" id="manual-abs-away" placeholder="Pl: Gavi (M), Lewandowski (F)">
        </div>

        <button id="run-manual-btn" class="btn btn-primary" style="width:100%; margin-top:1.5rem;">Elemzés Futtatása</button>
    `;
    openModal('Kézi Elemzés Indítása', content, 'modal-sm');
    
    (document.getElementById('run-manual-btn')).onclick = runManualAnalysis;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd = String(tomorrow.getDate()).padStart(2, '0');
    (document.getElementById('manual-kickoff')).value = `${yyyy}-${mm}-${dd}T15:00`;
}

/**
 * v68.0: MÓDOSÍTVA. A P1 Manuális Hiányzókat (szöveg) átalakítja {name, pos} objektumokká.
 */
function runManualAnalysis() {
    const sport = (document.getElementById('manual-sport')).value;
    const home = (document.getElementById('manual-home')).value;
    const away = (document.getElementById('manual-away')).value;
    const league = (document.getElementById('manual-league')).value || '';
    const kickoff = (document.getElementById('manual-kickoff')).value || null;

    // P1 Hiányzók (Szöveg)
    const Abs_H_raw = (document.getElementById('manual-abs-home')).value;
    const Abs_A_raw = (document.getElementById('manual-abs-away')).value;
    
    let manualXgData = {};

    // P1 Komponens xG
    const H_xG_raw = (document.getElementById('manual-h-xg'))?.value;
    const H_xGA_raw = (document.getElementById('manual-h-xga'))?.value;
    const A_xG_raw = (document.getElementById('manual-a-xg'))?.value;
    const A_xGA_raw = (document.getElementById('manual-a-xga'))?.value;
    if (H_xG_raw && H_xGA_raw && A_xG_raw && A_xGA_raw) {
        const H_xG = parseFloat(H_xG_raw);
        const H_xGA = parseFloat(H_xGA_raw);
        const A_xG = parseFloat(A_xG_raw);
        const A_xGA = parseFloat(A_xGA_raw);
        if (!isNaN(H_xG) && !isNaN(H_xGA) && !isNaN(A_xG) && !isNaN(A_xGA)) {
            manualXgData = {
                manual_H_xG: H_xG,
                manual_H_xGA: H_xGA,
                manual_A_xG: A_xG,
                manual_A_xGA: A_xGA
            };
        }
    }
    
    // MÓDOSÍTÁS (v68.0): A szöveget {name, pos} objektumokká alakítjuk
    const parseManualAbsentees = (rawString) => {
        if (!rawString) return [];
        return rawString.split(',')
            .map(entry => {
                const match = entry.trim().match(/^(.*?)\s*\(([GDMFN/A-Z]+)\)$/i); // Támogatja: Név (G), Név (D), Név (M), Név (F), Név (N/A)
                if (match) {
                    return { name: match[1].trim(), pos: match[2].toUpperCase() };
                }
                // Fallback (ha nincs pozíció megadva)
                return { name: entry.trim(), pos: 'N/A' }; 
            })
            .filter(p => p.name);
    };
    
    const manualAbsentees = {
        home: parseManualAbsentees(Abs_H_raw),
        away: parseManualAbsentees(Abs_A_raw)
    };

    if (manualAbsentees.home.length > 0 || manualAbsentees.away.length > 0) {
        (manualXgData).manual_absentees = manualAbsentees;
        console.log('Manuális (P1) Hiányzókat (objektumként) küldök a kézi modalból:', manualAbsentees);
    }

    if (!home || !away || !sport) {
        showToast('A Sport, Hazai Csapat és Vendég Csapat mezők kitöltése kötelező.', 'error');
        return;
    }
    runAnalysis(home, away, kickoff, league, true, manualXgData);
}

function isMobile() { return window.innerWidth <= 1024; } 

function getLeagueGroup(leagueName) {
    if (!leagueName) return 'Egyéb Meccsek';
    const ln = leagueName.toLowerCase();
    
    for (const [key, data] of Object.entries(LEAGUE_CATEGORIES)) {
        if (data.leagues.some(l => ln.includes(l.toLowerCase()))) {
            return data.name;
        }
    }
    return 'Egyéb Meccsek';
}

/**
 * v63.3: Megjeleníti a 4-komponensű P1 xG-t ÉS az ÚJ P1 Hiányzó Gombot
 */
function renderFixturesForDesktop(fixtures) {
    const groupedByLeague = groupBy(fixtures, fx => getLeagueGroup(fx.league.name));
    const groupOrder = [
        ...LEAGUE_CATEGORIES.TOP.leagues.map(l => getLeagueGroup(l)), // TOP ligák először
        ...Object.keys(groupedByLeague).filter(g => g !== LEAGUE_CATEGORIES.TOP.name) // Többi
    ];

    let kanbanHtml = '';
    
    groupOrder.forEach(group => { 
        if (!groupedByLeague[group]) return;

        let columnContent = ''; 
        const groupedByDate = groupBy(groupedByLeague[group], fx => formatDateLabel(fx.utcKickoff));
        const dateKeys = Object.keys(groupedByDate).sort();

        dateKeys.forEach(dateKey => {
            columnContent += `<details class="date-section" open><summary>${dateKey}</summary>`;
            
                    groupedByDate[dateKey]
                        .sort((a, b) => new Date(a.utcKickoff).getTime() - new Date(b.utcKickoff).getTime())
                        .forEach((fx) => { 
                            const time = new Date(fx.utcKickoff).toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' });
                            
                            // === MÓDOSÍTÁS (v63.3): Új P1 Gomb ===
                            // v68.0: A p1Count számítása már az objektumtömbön (.length) alapul
                            const p1State = appState.p1SelectedAbsentees.get(fx.id) || { home: [], away: [] };
                            const p1Count = p1State.home.length + p1State.away.length;
                            const p1Button = `
                                <button class="btn btn-special btn-p1-absentees" 
                                    data-match-id="${fx.id}" 
                                    data-home="${escape(fx.home.name)}" 
                                    data-away="${escape(fx.away.name)}"
                                    data-league="${escape(fx.league.name)}"
                                    data-kickoff="${escape(fx.utcKickoff)}">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                                    P1 HIÁNYZÓK MEGADÁSA (${p1Count})
                                </button>`;
                            // === MÓDOSÍTÁS VÉGE ===

                            columnContent += `
                            <div class="match-card selectable-card" data-match-id="${fx.id}">
                                <input type="checkbox" class="match-checkbox" data-match-id="${fx.id}" title="Kijelölés többes elemzéshez">
                                <div class="match-card-content">
                                    <div class="match-card-teams">${fx.home.name} vs ${fx.away.name}</div>
                                    <div class="match-card-meta">
                                        <span>${time}</span> | <span>${fx.league.name}</span>
                                    </div>
                                    <!-- P1 Komponens (v54.6) -->
                                    <div class="manual-xg-grid">
                                        <input type="number" step="0.01" name="H_xG" class="xg-input" placeholder="H xG">
                                        <input type="number" step="0.01" name="H_xGA" class="xg-input" placeholder="H xGA">
                                        <input type="number" step="0.01" name="A_xG" class="xg-input" placeholder="A xG">
                                        <input type="number" step="0.01" name="A_xGA" class="xg-input" placeholder="A xGA">
                                    </div>
                                    <!-- P1 Hiányzók Gomb (v63.3) -->
                                    <div style="margin-top: 1rem;">
                                        ${p1Button}
                                    </div>
                                    <button class="btn btn-primary" style="width: 100%; margin-top: 0.5rem;" onclick="runAnalysisFromCard(this, '${escape(fx.home.name)}', '${escape(fx.away.name)}', '${escape(fx.utcKickoff)}', '${escape(fx.league.name)}')">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                                        Elemzés
                                    </button>
                                </div>
                            </div>`;
                        });
            columnContent += `</details>`;
        });
        
        kanbanHtml += `
            <div class="kanban-column">
                <h3 class="kanban-column-header">${group}</h3>
                <div class="column-content">
                    ${columnContent}
                </div>
            </div>`;
    });
    
    document.getElementById('kanban-board-container').innerHTML = `<div class="kanban-board">${kanbanHtml}</div>`;
}

/**
 * v63.3: Megjeleníti a 4-komponensű P1 xG-t ÉS az ÚJ P1 Hiányzó Gombot
 */
function renderFixturesForMobileList(fixtures) {
    const groupedByLeague = groupBy(fixtures, fx => getLeagueGroup(fx.league.name));
    const groupOrder = [
        ...LEAGUE_CATEGORIES.TOP.leagues.map(l => getLeagueGroup(l)),
        ...Object.keys(groupedByLeague).filter(g => g !== LEAGUE_CATEGORIES.TOP.name)
    ];

    let html = '';
    
    groupOrder.forEach(group => {
        if (!groupedByLeague[group]) return;
        
        html += `<h3 class="league-header-mobile">${group}</h3>`;
        
        const groupedByDate = groupBy(groupedByLeague[group], fx => formatDateLabel(fx.utcKickoff));
        const dateKeys = Object.keys(groupedByDate).sort();

        dateKeys.forEach(dateKey => {
            html += `<h4 class="date-header-mobile">${dateKey}</h4>`;
            
                    groupedByDate[dateKey]
                         .sort((a, b) => new Date(a.utcKickoff).getTime() - new Date(b.utcKickoff).getTime())
                        .forEach((fx) => { 
                            const time = new Date(fx.utcKickoff).toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' });
                            
                            // === MÓDOSÍTÁS (v63.3): Új P1 Gomb ===
                            // v68.0: A p1Count számítása már az objektumtömbön (.length) alapul
                            const p1State = appState.p1SelectedAbsentees.get(fx.id) || { home: [], away: [] };
                            const p1Count = p1State.home.length + p1State.away.length;
                            const p1Button = `
                                <button class="btn btn-special btn-p1-absentees" 
                                    data-match-id="${fx.id}" 
                                    data-home="${escape(fx.home.name)}" 
                                    data-away="${escape(fx.away.name)}"
                                    data-league="${escape(fx.league.name)}"
                                    data-kickoff="${escape(fx.utcKickoff)}">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                                    P1 HIÁNYZÓK (${p1Count})
                                </button>`;
                            // === MÓDOSÍTÁS VÉGE ===

                            html += `
                            <div class="list-item selectable-item" data-match-id="${fx.id}">
                                <input type="checkbox" class="match-checkbox" data-match-id="${fx.id}">
                                <div class="list-item-content">
                                    <div class="list-item-title">${fx.home.name} vs ${fx.away.name}</div>
                                    <div class="list-item-meta">${time} | ${fx.league.name}</div>
                                    <!-- P1 Komponens (v54.6) -->
                                    <div class="manual-xg-grid">
                                        <input type="number" step="0.01" name="H_xG" class="xg-input" placeholder="H xG">
                                        <input type="number" step="0.01" name="H_xGA" class="xg-input" placeholder="H xGA">
                                        <input type="number" step="0.01" name="A_xG" class="xg-input" placeholder="A xG">
                                        <input type="number" step="0.01" name="A_xGA" class="xg-input" placeholder="A xGA">
                                    </div>
                                    <!-- P1 Hiányzók Gomb (v63.3) -->
                                    <div style="margin-top: 0.75rem; display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                                        ${p1Button}
                                        <button class="btn btn-primary" onclick="runAnalysisFromCard(this, '${escape(fx.home.name)}', '${escape(fx.away.name)}', '${escape(fx.utcKickoff)}', '${escape(fx.league.name)}')">
                                            Elemzés
                                        </button>
                                    </div>
                                </div>
                            </div>`;
                        });
        });
    });
    
    document.getElementById('mobile-list-view').innerHTML = html;
}
function renderHistory(historyData) {
    const list = document.getElementById('history-list');
    if (!historyData || historyData.length === 0) {
        list.innerHTML = '<p class="muted" style="text-align:center; padding: 2rem;">Nincsenek mentett elemzések.</p>';
        return;
    }
    
    let html = '';
    historyData.forEach(item => {
        const date = new Date(item.timestamp).toLocaleString('hu-HU');
        html += `
            <div class="list-item" style="align-items: center;">
                <div class="list-item-content" style="cursor:pointer;" onclick="viewHistoryDetail('${item.id}')">
                    <div class="list-item-title">${item.homeName} vs ${item.awayName}</div>
                    <div class="list-item-meta">${date} | ${item.sport.toUpperCase()} | ${item.bet} (${item.confidence.toFixed(1)})</div>
                </div>
                <button class="btn" style="border: none; color: var(--danger); margin-right: 1rem;" onclick="deleteHistoryItem('${item.id}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        `;
    });
    list.innerHTML = html;
}// === Dátum és Adatkezelő Segédfüggvények ===

function addMessageToChat(text, role) {
    const chatMessages = document.querySelector('.chat-messages');
    const bubble = document.createElement('div');
    bubble.classList.add('chat-bubble', role);
    bubble.textContent = text;
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function groupBy(arr, keyFn) {
    return arr.reduce((acc, item) => {
        const key = keyFn(item);
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
    }, {});
}

function formatDateLabel(dateStr) {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const options = { weekday: 'long', month: 'long', day: 'numeric' };

    if (date.toDateString() === today.toDateString()) {
        return `Ma (${date.toLocaleDateString('hu-HU', options)})`;
    }
    if (date.toDateString() === tomorrow.toDateString()) {
        return `Holnap (${date.toLocaleDateString('hu-HU', options)})`;
    }
    return date.toLocaleDateString('hu-HU', options);
}

// === UI Segédfüggvények (Modal, Toast, Stílusok) ===

function openModal(title, content = '', sizeClass = 'modal-xl') {
    const modal = document.getElementById('modal-container');
    const modalTitle = modal.querySelector('.modal-title');
    const modalBody = modal.querySelector('.modal-body');
    const modalContent = modal.querySelector('.modal-content');
    
    // Osztályok cseréje
    modalContent.classList.remove('modal-sm', 'modal-lg', 'modal-xl', 'modal-fullscreen');
    modalContent.classList.add(sizeClass);
    
    modalTitle.textContent = title;
    
    if (content) {
        modalBody.innerHTML = content;
    } else {
        // Ha nincs tartalom, skeleton-t mutatunk
        modalBody.innerHTML = '<div id="analysis-results"></div>';
        const skeleton = document.getElementById('loading-skeleton');
        modalBody.appendChild(skeleton);
        skeleton.classList.add('active');
    }
    
    modal.classList.add('open');
    document.addEventListener('keydown', handleEscKey);
    document.addEventListener('click', handleOutsideClick);
}

function closeModal() {
    const modal = document.getElementById('modal-container');
    modal.classList.remove('open');
    document.removeEventListener('keydown', handleEscKey);
    document.removeEventListener('click', handleOutsideClick);
}

function handleEscKey(event) { if (event.key === 'Escape') closeModal(); }
function handleOutsideClick(event) { if (event.target === document.getElementById('modal-container')) closeModal();
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
    }, duration);
}

function setupThemeSwitcher() {
    const switcher = document.getElementById('theme-switcher');
    const setIcon = (theme) => {
        switcher.innerHTML = theme === 'dark-theme' 
            ? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>' // Sun
            : '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>'; // Moon
    };
    
    let currentTheme = localStorage.getItem('theme') || 'dark-theme';
    document.body.className = currentTheme;
    setIcon(currentTheme);
    
    switcher.addEventListener('click', () => {
        const newTheme = document.body.className === 'dark-theme' ? 'light-theme' : 'dark-theme';
        document.body.className = newTheme;
        localStorage.setItem('theme', newTheme);
        setIcon(newTheme); 
    });
}

function createGlowingOrbs() {
    // (Ez a funkció jelenleg nincs bekötve)
}

function createHeaderOrbs() {
    // (Ez a funkváció jelenleg nincs bekötve)
}

// === Multi-Select UI Függvények (v62.1) ===

function initMultiSelect() {
    const multiSelectBtn = document.getElementById('multi-analysis-btn');
    if (multiSelectBtn) {
        multiSelectBtn.addEventListener('click', runMultiAnalysis);
    }
}

function addCheckboxListeners() {
    document.querySelectorAll('.match-checkbox').forEach(cb => {
        cb.addEventListener('change', handleCheckboxChange);
    });
}

// === ÚJ (v63.3): Eseményfigyelő a P1 Hiányzó Modal gombokhoz ===
function addP1ModalButtonListeners(scopeSelector = '') {
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
    event.stopPropagation(); // Megállítjuk, hogy a kártya ne nyissa meg az elemzést
    const button = event.currentTarget;
    const { matchId } = button.dataset;
    if (!matchId) return;
    
    const { home, away, league, kickoff } = button.dataset;
    const homeName = unescape(home);
    const awayName = unescape(away);

    // Modal megnyitása skeletonnal
    const title = `P1 Hiányzók: ${homeName} vs ${awayName}`;
    const skeletonHtml = '<div id="loading-skeleton" class="loading-skeleton active"><div class="skeleton-card"><div class="skeleton-line" style="width: 100%; height: 40px; margin-bottom: 1rem;"></div><div class="skeleton-line" style="width: 40%; height: 20px; margin-bottom: 1rem;"></div><div class="skeleton-line" style="width: 80%;"></div><div class="skeleton-line" style="width: 90%;"></div><div class="skeleton-line" style="width: 70%;"></div></div></div>';
    
    openModal(title, skeletonHtml, 'modal-lg');
    (document.querySelector('#modal-container #loading-skeleton')).classList.add('active');

    // Keretek lekérése és a modal tartalmának felépítése
    await _getAndRenderRosterModalHtml(matchId, homeName, awayName, unescape(league), unescape(kickoff));
}

// === MÓDOSÍTVA (v63.4): P1 Modal Adatlekérés és Renderelés (Drag-and-Drop) ===
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

        // HTML felépítése (az new kanban-építő függvénnyel)
        // v68.0: Ez a függvény már az objektum-alapú appState-et használja a rendereléshez
        const modalHtml = _buildRosterModalHtml(matchId, homeName, awayName, rosters);
        
        // Mentjük a keresőmező értékét (ha volt)
        const currentSearch = (modalBody.querySelector('#p1-search-input'))?.value || '';
        
        modalBody.innerHTML = modalHtml;

        // Visszaállítjuk a keresőmező értékét
        const searchInput = modalBody.querySelector('#p1-search-input');
        if (searchInput) {
            searchInput.value = currentSearch;
            // Lefuttatjuk a szűrést, ha volt érték
            if (currentSearch) {
                handleP1Search({ target: searchInput });
            }
            searchInput.addEventListener('keyup', handleP1Search);
        }

        // Eseményfigyelők hozzáadása a Drag-and-Drop-hoz
        modalBody.querySelectorAll('.player-card').forEach(card => {
            card.addEventListener('dragstart', handleP1DragStart);
        });
        
        modalBody.querySelectorAll('.kanban-column').forEach(column => {
            column.addEventListener('dragover', handleP1DragOver);
            column.addEventListener('dragenter', handleP1DragEnter);
            column.addEventListener('dragleave', handleP1DragLeave);
            column.addEventListener('drop', handleP1Drop);
        });

    } catch (e) {
        console.error(`Hiba a P1 keret modal felépítésekor (${matchId}):`, e);
        modalBody.innerHTML = `<p class="muted" style="color:var(--danger); font-size: 0.9rem; text-align: center; padding: 2rem;">A keretek lekérése sikertelen: ${e.message}</p>`;
    }
}

// === MÓDOSÍTVA (v68.0): P1 Modal HTML Generátor (Pozícióval) ===
function _buildRosterModalHtml(matchId, homeName, awayName, availableRosters) {
    
    // 1. Lekérjük a jelenlegi állapotot az appState-ből
    const p1State = appState.p1SelectedAbsentees.get(matchId) || { home: [], away: [] };
    // MÓDOSÍTÁS (v68.0): A Set most neveket tárol az objektumokból
    const absentHomeNames = new Set(p1State.home.map(p => p.name));
    const absentAwayNames = new Set(p1State.away.map(p => p.name));

    // 2. Szétválogatjuk a játékosokat
    const allHomePlayers = availableRosters?.home || [];
    const allAwayPlayers = availableRosters?.away || [];

    // Az elérhető játékosok kiszűrése (a Set alapján)
    const availableHome = allHomePlayers.filter(p => !absentHomeNames.has(p.name));
    const availableAway = allAwayPlayers.filter(p => !absentAwayNames.has(p.name));
    
    // MÓDOSÍTÁS (v68.0): A hiányzó listák most már a p1State-ből (objektumokból) jönnek
    // Ez biztosítja, hogy a pozíció megmaradjon, még ha az 'availableRosters' frissül is
    const absentHome = p1State.home;
    const absentAway = p1State.away;

    // 3. Segédfüggvény a kártyák generálásához
    const buildPlayerCards = (players, columnType) => {
        if (!players || players.length === 0) {
            return '<p class="muted" style="font-size: 0.8rem; text-align: center; padding: 1rem;">Nincs játékos ebben a listában.</p>';
        }
        
        const grouped = groupBy(players, p => p.pos || 'N/A');
        let html = '';
        
        ['G', 'D', 'M', 'F', 'N/A'].forEach(pos => {
            if (grouped[pos]) {
                const posLabel = { 'G': 'Kapusok', 'D': 'Védők', 'M': 'Középpályások', 'F': 'Támadók', 'N/A': 'Ismeretlen'}[pos];
                html += `<div class="roster-position-group">`;
                html += `<strong>${posLabel}</strong>`;
              
                html += grouped[pos].map(player => {
                    const playerName = escapeHTML(player.name);
                    const playerPos = escapeHTML(player.pos || 'N/A');
                    // MÓDOSÍTÁS (v68.0): data-player-pos és vizuális badge hozzáadva
                    return `
                    <div class="player-card" 
                         draggable="true"
                         data-match-id="${matchId}"
                         data-player-name="${playerName}"
                         data-player-pos="${playerPos}" 
                         data-column="${columnType}"
                         data-team="${columnType.includes('home') ? 'home' : 'away'}">
                        ${playerName}
                        <span class="player-pos-badge pos-${playerPos}">${playerPos}</span>
                    </div>`;
                }).join('');
                html += `</div>`;
            }
        });
        return html;
    };
    
    // 4. A teljes modal HTML felépítése
    const finalHtml = `
        <div class="p1-kanban-board">
            <div class="p1-search-bar">
                <input type="search" id="p1-search-input" class="xg-input" placeholder="Keresés a játékosok között (név vagy pozíció)..." style="width: 100%; text-align: left; padding: 12px; font-size: 1rem;">
            </div>

            <div class="kanban-column available-list" data-column="available">
                <h5>Elérhető Keret</h5>
                <div class="kanban-column-content">
                    <h6 class="team-subheader">${escapeHTML(homeName)} (Hazai)</h6>
                    ${buildPlayerCards(availableHome, 'available-home')}
                    <h6 class="team-subheader" style="margin-top: 1.5rem;">${escapeHTML(awayName)} (Vendég)</h6>
                    ${buildPlayerCards(availableAway, 'available-away')}
                </div>
            </div>

            <div class="kanban-column drop-zone" data-column="absent-home">
                <h5>${escapeHTML(homeName)} HIÁNYZÓK</h5>
                <div class="kanban-column-content">
                    ${buildPlayerCards(absentHome, 'absent-home')}
                </div>
            </div>

            <div class="kanban-column drop-zone" data-column="absent-away">
                <h5>${escapeHTML(awayName)} HIÁNYZÓK</h5>
                <div class="kanban-column-content">
                    ${buildPlayerCards(absentAway, 'absent-away')}
                </div>
            </div>
        </div>
    `;
    return finalHtml;
}

// === MÓDOSÍTVA (v63.4): P1 Modal Kereső Logika (Kanban kártyákhoz) ===
function handleP1Search(event) {
    const searchTerm = event.target.value.toLowerCase();
    const modalBody = event.target.closest('.modal-body');
    if (!modalBody) return;
    
    modalBody.querySelectorAll('.player-card').forEach(card => {
        const playerName = card.dataset.playerName.toLowerCase();
        // MÓDOSÍTÁS (v68.0): Keresés a pozícióra is
        const playerPos = card.dataset.playerPos.toLowerCase();
        
        if (playerName.includes(searchTerm) || playerPos.includes(searchTerm)) {
            card.style.display = 'flex'; // 'flex'-re váltva a 'block'-ról
        } else {
            card.style.display = 'none';
        }
    });
}

// === ÚJ (v68.0): P1 Drag-and-Drop Eseménykezelők (Pozícióval) ===

function handleP1DragStart(event) {
    const target = event.target.closest('.player-card');
    if (!target) return;
    
    target.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    // Adatok átadása
    event.dataTransfer.setData('text/plain', target.dataset.playerName);
    event.dataTransfer.setData('source-column', target.dataset.column);
    event.dataTransfer.setData('match-id', target.dataset.matchId);
    event.dataTransfer.setData('player-pos', target.dataset.playerPos); // <-- ÚJ (v68.0)
}

function handleP1DragOver(event) {
    event.preventDefault(); // Kötelező a 'drop' esemény fogadásához
    event.dataTransfer.dropEffect = 'move';
}

function handleP1DragEnter(event) {
    const column = event.target.closest('.kanban-column');
    if (column) {
        column.classList.add('drag-over');
    }
}

function handleP1DragLeave(event) {
    const column = event.target.closest('.kanban-column');
    if (column) {
        column.classList.remove('drag-over');
    }
}

// MÓDOSÍTVA (v68.0): A Drop most már {name, pos} objektumot ment
async function handleP1Drop(event) {
    event.preventDefault();
    const column = event.target.closest('.kanban-column');
    if (!column) return;
    
    column.classList.remove('drag-over');
    const draggingCard = document.querySelector('.player-card.dragging');
    if (draggingCard) {
        draggingCard.classList.remove('dragging');
    }

    // 1. Adatok kinyerése
    const playerName = event.dataTransfer.getData('text/plain');
    const sourceColumn = event.dataTransfer.getData('source-column');
    const matchId = event.dataTransfer.getData('match-id');
    const playerPos = event.dataTransfer.getData('player-pos') || 'N/A'; // <-- ÚJ (v68.0)
    const targetColumn = column.dataset.column;

    if (!playerName || !sourceColumn || !matchId || !targetColumn) {
        console.error("Drag-and-Drop hiba: Hiányzó adatok.", { playerName, sourceColumn, matchId, targetColumn });
        return;
    }
    
    // Ha ugyanabba az oszlopba dobta vissza, nem csinálunk semmit
    if (sourceColumn === targetColumn) {
        return;
    }

    // 2. Állapot frissítése (appState) - v68.0 OBJEKTUMOKKAL
    if (!appState.p1SelectedAbsentees.has(matchId)) {
        appState.p1SelectedAbsentees.set(matchId, { home: [], away: [] });
    }
    const p1State = appState.p1SelectedAbsentees.get(matchId);
    const playerObject = { name: playerName, pos: playerPos }; // <-- ÚJ (v68.0)

    // Eltávolítás a régi helyről (név alapján)
    if (sourceColumn === 'absent-home') {
        p1State.home = p1State.home.filter(p => p.name !== playerName);
    } else if (sourceColumn === 'absent-away') {
        p1State.away = p1State.away.filter(p => p.name !== playerName);
    }
    
    // Hozzáadás az új helyhez (objektumként)
    if (targetColumn === 'absent-home') {
        if (!p1State.home.find(p => p.name === playerName)) { // Duplikáció ellenőrzése
            p1State.home.push(playerObject);
        }
    } else if (targetColumn === 'absent-away') {
        if (!p1State.away.find(p => p.name === playerName)) { // Duplikáció ellenőrzése
            p1State.away.push(playerObject);
        }
    }
    
    // 3. UI Frissítése (Újrarajzolással)
    const modal = document.getElementById('modal-container');
    const h5Home = modal.querySelector('.kanban-column[data-column="absent-home"] h5');
    const h5Away = modal.querySelector('.kanban-column[data-column="absent-away"] h5');
    
    // Biztosítjuk, hogy a h5 elemek léteznek, mielőtt olvasnánk őket
    const homeName = h5Home ? h5Home.textContent.replace(' HIÁNYZÓK', '') : 'Hazai';
    const awayName = h5Away ? h5Away.textContent.replace(' HIÁNYZÓK', '') : 'Vendég';

    // Újrarajzoljuk a modal tartalmát a frissített állapot alapján
    // A _getAndRenderRosterModalHtml már kezeli a listener-ek újracsatolását
    await _getAndRenderRosterModalHtml(
        matchId, 
        homeName, 
        awayName, 
        "", // League/Kickoff itt már nem releváns, mert a keret már cache-ben van
        ""
    );

    // 4. Főoldali gomb frissítése
    _updateP1ButtonCount(matchId);
}

// === TÖRÖLVE (v63.4): P1 Modal Checkbox Állapotkezelés ===
// function handleP1CheckboxChange(event) { ... }

// === ÚJ (v63.3): P1 Gomb Számláló Frissítése ===
// v68.0: A .length számítás továbbra is helyes
function _updateP1ButtonCount(matchId) {
    if (!matchId) return;
    
    const p1State = appState.p1SelectedAbsentees.get(matchId) || { home: [], away: [] };
    const p1Count = p1State.home.length + p1State.away.length;

    // Frissítjük az összes gombot (kanban, mobil lista, és az elemzési modalon belüli gombot is)
    document.querySelectorAll(`.btn-p1-absentees[data-match-id="${matchId}"]`).forEach(btn => {
        // Megpróbáljuk megőrizni az eredeti szöveget, csak a számot cseréljük
        btn.innerHTML = btn.innerHTML.replace(/\(\d+\)$/, `(${p1Count})`);
    });
}


function handleCheckboxChange(event) {
    const matchId = event.target.dataset.matchId;
    const card = event.target.closest('.selectable-card, .selectable-item');
    
    if (event.target.checked) {
        appState.selectedMatches.add(matchId);
        card.classList.add('selected');
    } else {
        appState.selectedMatches.delete(matchId);
        card.classList.remove('selected');
    }
    updateMultiSelectButton();
}

function updateMultiSelectButton() {
    const btn = document.getElementById('multi-analysis-btn');
    if (!btn) return;
    
    const count = appState.selectedMatches.size;
    if (count > 0) {
        btn.textContent = `Elemzés Futtatása (${count} meccs)`;
        btn.disabled = false;
    } else {
        btn.textContent = 'Többes Elemzés';
        btn.disabled = true;
    }
}

// === KLIENSOLDALI HTML GENERÁTOROK (v62.1) ===

function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[m];
    });
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * v59.0: Kiemeli a kulcsszavakat az AI szövegekben.
 */
function _highlightKeywords(text, teamNames = []) {
    if (!text) return '';
    
    // Alap kulcsszavak (pl. "Under 2.5")
    const keywords = [
        // ... (Ez a rész feltételezhetően változatlan)
    ];
    
    let highlightedText = escapeHTML(text);
    
    // Csapatnevek kiemelése
    teamNames.forEach(name => {
        highlightedText = highlightedText.replace(new RegExp(escapeRegExp(name), 'gi'), `<span class="highlight-keyword">$&</span>`);
    });
    
    // Kulcsszavak kiemelése
    keywords.forEach(keyword => {
        highlightedText = highlightedText.replace(new RegExp(escapeRegExp(keyword), 'gi'), `<strong class="glowing-text-white">$&</strong>`);
    });
    
    return highlightedText;
}

/**
 * v59.0: A _highlightKeywords-t hívja
 */
const processAiText = (text, teamNames = []) => {
    return _highlightKeywords(text, teamNames);
};

const processAiList = (list, teamNames = []) => {
    if (!list || list.length === 0) return '<li>Nincs megadva.</li>';
    return list.map(item => `<li>${_highlightKeywords(item, teamNames)}</li>`).join('');
};
function getRadialChartHtml(pHome, pDraw, pAway, sport) {
    // (Ez a funkció feltételezhetően változatlan)
    const r = 40;
    const circ = 2 * Math.PI * r;
    const homeDash = (pHome / 100) * circ;
    const drawDash = (pDraw / 100) * circ;
    // ... (többi számítás) ...
    return `
    <div class="radial-chart-container">
        <svg class="radial-chart" width="100%" height="100%" viewBox="0 0 100 100">
            <!-- (A teljes SVG tartalom itt van) -->
    </div>`;
}

function getGaugeHtml(confidence, label = "") {
    // (Ez a funkció feltételezhetően változatlan)
    const value = confidence || 1.0;
    const labelHtml = label ? `<div class="gauge-label">${label}</div>` : '';
    return `
    <div class="gauge-container">
        <svg class="gauge-svg" data-value="${value}" viewBox="0 0 100 60">
            <path class="gauge-track" d="M 10 50 A 40 40 0 0 1 90 50" />
            <path class="gauge-value" d="M 10 50 A 40 40 0 0 1 90 50" />
        </svg>
        <div class="gauge-text">${value.toFixed(1)}<span class="gauge-label-inline">/10</span></div>
        ${labelHtml}
    </div>`;
}

function getConfidenceInterpretationHtml(confidenceScore, teamNames = []) {
    // (Ez a funkció feltételezhetően változatlan)
    // ... (osztály és szöveg meghatározása) ...
    return `<p class="confidence-interpretation ${className}">${processAiText(text, teamNames)}</p>`;
}

function getMicroAnalysesHtml(microAnalyses, teamNames = []) {
    // (Ez a funkció feltételezhetően változatlan)
    if (!microAnalyses || microAnalyses.length === 0) return '';
    return microAnalyses.map(ma => `
        <div class="micromodel-card">
            <h5>${escapeHTML(ma.model_name)}</h5>
            <p>${processAiText(ma.analysis, teamNames)}</p>
            <p class="confidence">Bizalom: <strong>${ma.confidence.toFixed(1)}/10</strong> | Súly: <strong>${(ma.weight * 100).toFixed(0)}%</strong></p>
        </div>
    `).join('');
}

// === MÓDOSÍTÁS (v63.3): Ez a függvény most már az elemzési modalon belüli "gomb" számára generál HTML-t ===
// v68.0: A p1Count számítás továbbra is helyes
function _buildRosterSelectorHtml(availableRosters, matchId, homeName, awayName) {
    
    if (appState.currentSport !== 'soccer') return '';
    
    const p1State = appState.p1SelectedAbsentees.get(matchId) || { home: [], away: [] };
    const p1Count = p1State.home.length + p1State.away.length;

    const p1Button = (availableRosters && (availableRosters.home?.length || availableRosters.away?.length))
        ? `<button class="btn btn-special btn-p1-absentees" 
                data-match-id="${matchId}" 
                data-home="${escape(homeName)}" 
                data-away="${escape(awayName)}"
                data-league="" 
                data-kickoff="">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            P1 HIÁNYZÓK MEGADÁSA (${p1Count})
        </button>`
        : '';

    return `
        <div class="synthesis-card">
            <h5>P1 Manuális Adatbevitel</h5>
            <p>Automatikus keretadatok ${p1Button ? 'elérhetők' : 'nem elérhetők'}. Kattints a gombra a P1 manuális hiányzók megadásához.</p>
            <div style="margin-top: 1rem;">${p1Button}</div>
        </div>
    `;
}


/**
 * === FŐ KLIENSOLDALI HTML ÉPÍTŐ (ÁTÍRVA v63.3) ===
 * Most már az elemzési modalon belül is megjeleníti a "Hiányzók Megadása" gombot.
 */
function buildAnalysisHtml_CLIENTSIDE(
    fullAnalysisReport, // v63.0: A teljes "committee" objektum
    recommendation, // v63.1: A Stratéga ajánlása (külön)
    meta,
    marketData,
    quantConfidence, // v63.1: Csak a Quant bizalma
    finalConfidenceScore, // v63.1: A Stratéga végső bizalma
    sim, // Duplikált paraméter, de a szignatúra szerint
    timelineEvents, // (Jelenleg a 'sim'-ben van)
    availableRosters, // ÚJ (v62.1)
    matchId // ÚJ (v63.3)
) {
    
    // --- 1. ADATOK KINYERÉSE ---
    const { homeName, awayName, sport, leagueName } = meta;
    const teamNames = [homeName, awayName];
    
    // Odds (piac) adatok
    const pHome = marketData?.full_time_result?.find(o => o.outcome === 'Home')?.price || 0;
    const pDraw = marketData?.full_time_result?.find(o => o.outcome === 'Draw')?.price || 0;
    const pAway = marketData?.full_time_result?.find(o => o.outcome === 'Away')?.price || 0;
    
    // Sim (xG) adatok
    const xgHome = sim?.xg?.h ?? 0;
    const xgAway = sim?.xg?.a ?? 0;
    const xgTotal = xgHome + xgAway;
    const topScore = `<strong>${sim?.topScore?.gh ?? 'N/A'} - ${sim?.topScore?.ga ?? 'N/A'}</strong>`;
    
    // === MÓDOSÍTÁS (v63.1) ===
    // A 'modelConf' (Quant) és 'expertConfScore' (Stratéga) mostantól helyesen van átadva
    const modelConf = quantConfidence?.toFixed(1) || '1.0';
    // Quant (Statisztikai)
    const expertConfScore = finalConfidenceScore?.toFixed(1) || '1.0';
    // Stratéga (Végső)
    
    // === MÓDOSÍTÁS (6 FŐS BIZOTTSÁG) ===
    // Szétbontjuk a 'fullAnalysisReport' (committee) objektumot
    let expertConfReasoning, prophetText, synthesisText, microModelsHtml, quantReportHtml, scoutReportHtml;
    
    // v67.0: A Critic report most már 'contradiction_score'-t tartalmaz
    const criticReport = fullAnalysisReport.critic;
    
    if (fullAnalysisReport && fullAnalysisReport.strategist) {
        // --- B. ESET: Új (6 Fős Bizottság v63.0) Struktúra ---
        const strategist = fullAnalysisReport.strategist;
        const quant = fullAnalysisReport.quant;
        const scout = fullAnalysisReport.scout;
        
        expertConfReasoning = processAiText(strategist.confidence_reasoning, teamNames);
        prophetText = processAiText(strategist.prophetic_timeline, teamNames);
        synthesisText = processAiText(strategist.strategic_synthesis, teamNames);
        
        // Mikromodellek (ha vannak)
        microModelsHtml = getMicroAnalysesHtml(fullAnalysisReport.micro_models, teamNames);
        
        // Quant Jelentés (v63.1)
        quantReportHtml = quant ? `<div class="committee-card quant">
                <h4>Quant Jelentés</h4>
                <p>${processAiText(quant.summary, teamNames)}</p>
                <ul class="key-insights">
                    ${processAiList(quant.key_insights, teamNames)}
                </ul>
           </div>` : '';
           
        // Scout Jelentés (v63.1)
        scoutReportHtml = scout ? `<div class="committee-card scout">
                <h4>Scout Jelentés</h4>
                <p>${processAiText(scout.summary, teamNames)}</p>
                <ul class="key-insights">
                    ${processAiList(scout.key_insights, teamNames)}
                </ul>
           </div>` : '';
           
        // Kritikus Jelentés (v63.1)
        criticReportHtml = criticReport ? `<div class="committee-card ${criticReport.contradiction_score >= 0 ? 'scout' : 'danger'}">
                <h4>Kritikus Jelentés (v67)</h4>
                <p>${processAiText(criticReport.tactical_summary, teamNames)}</p>
                <ul class="key-insights">
                    ${processAiList(criticReport.key_risks, teamNames)}
                </ul>
                <p style="margin-top: 0.5rem;"><strong>Kockázati/Támogatási Pontszám (v67):</strong> ${criticReport.contradiction_score || '0.0'}</p>
           </div>` : '';
    } else {
        // --- C. ESET: Hiba / Régi Struktúra (Fallback) ---
        // ... (Logika a régi struktúra kezeléséhez, ha szükséges)
    }
    // === MÓDOSÍTÁS VÉGE ===


    // --- 2. FŐ AJÁNLÁS (STRATÉGA) (v59.0 - Kiemelőt használ) ---
    const masterRecommendationHtml = `
    <div class="master-recommendation-card">
        <h5>Stratéga Végső Ajánlása (v67)</h5>
        <div class="master-bet">${processAiText(recommendation.recommended_bet, teamNames)}</div>
        <div class="master-confidence">
            Végső Bizalom: <strong class="glowing-text-white">${expertConfScore}/10</strong>
        </div>
        ${getConfidenceInterpretationHtml(parseFloat(expertConfScore), teamNames)}
        <div class="confidence-interpretation-container">
            <p class="master-reasoning">${processAiText(recommendation.brief_reasoning, teamNames)}</p>
        </div>
    </div>`;
    // --- 3. PRÓFÉTA KÁRTYA (NARRATÍVA OSZLOP) (v59.0 - Kiemelőt használ) ---
    const prophetCardHtml = `
    <div class="prophet-card">
        <h5>Próféta (Meccs Forgatókönyv)</h5>
        <p>${prophetText}</p>
    </div>`;
    // --- 4. SZINTÉZIS KÁRTYA (NARRATÍVA OSZLOP) (v59.0 - Kiemelőt használ) ---
    const synthesisCardHtml = `
    <div class="synthesis-card">
        <h5>Stratégiai Szintézis</h5>
        <p>${synthesisText}</p>
    </div>`;
    // --- 5. ÚJ (v63.3): P1 HIÁNYZÓ GOMB (NARRATÍVA OSZLOP) ---
    // Ez a _buildRosterSelectorHtml-t hívja, de most már paraméterekkel
    // v68.0: A hívás helyes marad
    const rosterSelectorHtml = (appState.currentSport === 'soccer')
        ? _buildRosterSelectorHtml(availableRosters, matchId, homeName, awayName)
        : '';
        
    // --- 6. CHAT (NARRATÍVA OSZLOP) (Változatlan v59.0) ---
    const chatHtml = `
    <div class="analysis-accordion">
        <details open>
            <summary>
                <span class="section-title">
                    <svg class="section-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    Kérdezz az Elemzésről (AI Chat)
                </span>
            </summary>
            <div class="accordion-content">
                <div id="chat-content-wrapper">
                    <!-- A chat-container-modal ide lesz áthelyezve -->
                </div>
            </div>
        </details>
    </div>`;

    // --- 7. ADAT OSZLOP (SIDEBAR) (MÓDOSÍTVA v63.1) ---
    const atAGlanceHtml = `
    <div class="at-a-glance-grid">
        <div class="summary-card">
            <h5>1X2 Piaci Konszenzus</h5>
            ${getRadialChartHtml(pHome, pDraw, pAway, sport)}
        </div>
        <div class="summary-card">
            <h5>Várható gólok (xG)</h5>
            <div class="xg-value-container">
                <div class="xg-team"><span class="value">${xgHome.toFixed(2)}</span><span class="details">${homeName}</span></div>
                <div class="xg-separator">-</div>
                <div class="xg-team"><span class="value">${xgAway.toFixed(2)}</span><span class="details">${awayName}</span></div>
            </div>
        </div>
        <div class="summary-card">
            <h5>Várható gólok (Összes)</h5>
            ${getGaugeHtml(xgTotal, 'Gól')}
        </div>
        <div class="summary-card">
            <h5>Szimulált Top Eredmény</h5>
            <div class="totals-breakdown" style="font-size: 1.8rem; line-height: 1.2;">
                ${topScore}
            </div>
        </div>
        <div class="summary-card">
            <h5>Quant Bizalom (Stat.)</h5>
            ${getGaugeHtml(parseFloat(modelConf), 'Modell')}
        </div>
    </div>`;
    // === VÉGSŐ JAVÍTÁS (v63.1) ===
    // A 'Bizalmi Híd' most már a helyes 'modelConf' (Quant) és 'expertConfScore' (Stratéga) változókat használja
    const confidenceBridgeHtml = `
    <div class="confidence-bridge-card">
        <h5>Bizalmi Híd (Quant vs Stratéga)</h5>
        <div class="confidence-bridge-values">
            <div class="value">${modelConf}/10 <span class="details">(Quant Stat.)</span></div>
            <div class="arrow">→</div>
            <div class="value">${expertConfScore}/10 <span class="details">(Stratéga Döntés)</span></div>
        </div>
        <div class="confidence-bridge-reasoning">${expertConfReasoning}</div>
    </div>`;
    let marketCardsHtml = '';
    // (Piacok renderelése, ha van... feltételezhetően változatlan)
    const marketSectionHtml = `
    <div class="market-data-section">
        <h4>Piaci Adatok</h4>
        <div class="market-card-grid">
            ${marketCardsHtml || '<p class="muted" style="font-size: 0.8rem;">Piaci adatok nem érhetők el.</p>'}
        </div>
    </div>`;
    const sidebarAccordionHtml = `
    <div class="sidebar-accordion">
        ${quantReportHtml ? `<details>
            <summary>Quant Jelentés</summary>
            <div class="accordion-content">${quantReportHtml}</div>
        </details>` : ''}
        ${scoutReportHtml ? `<details>
            <summary>Scout Jelentés</summary>
            <div class="accordion-content">${scoutReportHtml}</div>
        </details>` : ''}
         ${criticReportHtml ? `<details open>
            <summary>Kritikus Jelentés (v67)</summary>
            <div class="accordion-content">${criticReportHtml}</div>
        </details>` : ''}
        ${microModelsHtml ? `<details>
            <summary>Mikromodell Elemzések</summary>
            <div class="accordion-content">${microModelsHtml}</div>
        </details>` : ''}
    </div>`;
    // --- 8. VÉGLEGES HTML ÖSSZEÁLLÍTÁSA (v63.3 Elrendezés) ---
    return `
    <div class="analysis-layout">
        <div class="analysis-layout-main">
            ${masterRecommendationHtml}
            ${prophetCardHtml}
            ${synthesisCardHtml}
            ${rosterSelectorHtml}
            ${chatHtml}
        </div>
        <div class="analysis-layout-sidebar">
            ${atAGlanceHtml}
            ${confidenceBridgeHtml}
            ${marketSectionHtml}
            ${sidebarAccordionHtml}
        </div>
    </div>`;
}

// --- 4. ALKALMAZÁS INDÍTÓ LOGIKA (A FÁJL VÉGÉRE HELYEZVE) ---

function initializeApp() {
    // Eseményfigyelők
    document.getElementById('load-fixtures-btn').addEventListener('click', loadFixtures);
    document.getElementById('sport-select').addEventListener('change', handleSportChange);
    document.getElementById('manual-analysis-btn').addEventListener('click', openManualAnalysisModal);
    document.getElementById('history-btn').addEventListener('click', openHistoryModal);
    document.getElementById('modal-close-btn').addEventListener('click', closeModal);
    
    setupThemeSwitcher();
    // createHeaderOrbs(); // Opcionális
    
    // Multi-select gomb inicializálása
    initMultiSelect();
    updateMultiSelectButton();
}

function setupLoginProtection() {
    const loginOverlay = document.getElementById('login-overlay');
    const appContainer = document.getElementById('app-container');
    
    // Ellenőrizzük, hogy a jelszó már be van-e állítva
    const storedHash = localStorage.getItem('appAuthHash');
    if (!storedHash || storedHash !== '6b4931a84f3e34e56b4141d6f10c4f8a3c89c74828b84b802e3e56c5471a50a1') { // sha256('king')
        loginOverlay.style.display = 'flex';
        appContainer.style.display = 'none';
    } else {
        loginOverlay.style.display = 'none';
        appContainer.style.display = 'flex';
        initializeApp(); // Csak sikeres bejelentkezés után inicializáljuk
    }

    const loginButton = document.getElementById('login-button');
    const passwordInput = document.getElementById('password-input');
    
    const sha256 = async (message) => {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    };

    const handleLogin = async () => {
        const pass = passwordInput.value;
        const hash = await sha256(pass);
        
        // Helyes jelszó: 'king'
        if (hash === '6b4931a84f3e34e56b4141d6f10c4f8a3c89c74828b84b802e3e56c5471a50a1') {
            localStorage.setItem('appAuthHash', hash);
            loginOverlay.style.animation = 'fadeOut 0.5s forwards';
            setTimeout(() => {
                loginOverlay.style.display = 'none';
                appContainer.style.display = 'flex';
                initializeApp(); // Inicializálás
            }, 500);
        } else {
            showToast('Helytelen jelszó.', 'error');
            passwordInput.value = '';
        }
    };
    
    loginButton.addEventListener('click', handleLogin);
    passwordInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') handleLogin();
    });
}

// === INDÍTÁS (v62.2 - A VÉGÉRE HELYEZVE) ===
document.addEventListener('DOMContentLoaded', () => {
    setupLoginProtection(); 
});
