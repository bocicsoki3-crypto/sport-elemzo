// --- script.js (v62.1 - P1 Manuális Roster Választó - 5. Lépés) ---
// MÓDOSÍTÁS:
// 1. A 'runAnalysis' most már fogadja az 'availableRosters'
//    adatot az 'AnalysisFlow.ts' (v62.1) fájltól.
// 2. ÚJ FUNKCIÓ: '_buildRosterSelectorHtml' hozzáadva, amely
//    dinamikusan generál 'checkbox' listákat a kapott keretadatokból.
// 3. A 'renderFixtures...' és 'openManualAnalysisModal'
//    függvények frissítve, hogy megjelenítsék ezt az új UI elemet.
// 4. A 'runAnalysisFromCard' és 'runManualAnalysis'
//    függvények frissítve, hogy összegyűjtsék a kiválasztott hiányzókat
//    és elküldjék őket a 'manual_absentees' kulcs alatt.
// 5. A v61.0-ás (4-komponensű P1) és v59.0-ás (vizuális)
//    logika érintetlen marad.
// 6. JAVÍTVA: Minden szintaktikai hiba eltávolítva.

// --- ALKALMAZÁS ÁLLAPOT ---
const appState = {
    gasUrl: 'https://king-ai-backend.onrender.com', 
    fixtures: [], 
    currentSport: 'soccer',
    sheetUrl: '',
    currentAnalysisContext: '',
    chatHistory: [],
    selectedMatches: new Set(),
    authToken: null,
    // v62.1: Globális gyorsítótár a kereteknek, hogy a 'runMultiAnalysis' is elérje
    rosterCache: new Map() 
};

// --- LIGA KATEGÓRIÁK (Változatlan) ---
const LEAGUE_CATEGORIES = {
    soccer: {
        'Top Ligák': [ 'Champions League', 'Premier League', 'Bundesliga', 'LaLiga', 'Serie A' ],
        'Kiemelt Bajnokságok': [ 'Europa League', 'Ligue 1', 'Eredivisie', 'Liga Portugal' ],
        'Figyelmet Érdemlő': [ 'Championship', '2. Bundesliga', 'Serie B', 'LaLiga2', 'Super Lig', 'Premiership', 'MLS' ],
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

// --- INICIALIZÁLÁS (Változatlan) ---
document.addEventListener('DOMContentLoaded', () => {
    setupLoginProtection(); 
});

// === JELSZÓVÉDELEM LOGIKÁJA (JWT) (Változatlan) ===
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

// === ALKALMAZÁS INICIALIZÁLÁSA (v62.1 - Roster Cache törlés) ===
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
    appState.rosterCache.clear(); // Cache törlése indításkor

    const toastContainer = document.createElement('div');
    toastContainer.id = 'toast-notification-container';
    toastContainer.className = 'toast-notification-container';
    document.body.appendChild(toastContainer);
}


// --- BIZTONSÁGOS FETCH SEGÉDFÜGGVÉNY (Változatlan) ---
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
            ...options.headers,
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

// --- HIBAKEZELŐ SEGÉDFÜGGVÉNY (Változatlan) ---
async function handleFetchError(response) {
    try {
        const errorData = await response.json();
        throw new Error(`Szerver hiba (${response.status}): ${errorData.error || response.statusText}`);
    } catch (jsonError) {
        throw new Error(`Hálózati hiba: ${response.status} ${response.statusText}`);
    }
}

// --- FŐ FUNKCIÓK ---

// --- loadFixtures (v62.1 - Roster Cache törlés) ---
async function loadFixtures() {
    const loadBtn = document.getElementById('loadFixturesBtn');
    loadBtn.disabled = true;
    loadBtn.textContent = 'Betöltés...';
    appState.selectedMatches.clear(); 
    appState.rosterCache.clear(); // Roster cache törlése új meccsek betöltésekor
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

// --- runAnalysisFromCard (MÓDOSÍTVA v62.1 - P1 Hiányzókat olvas) ---
function runAnalysisFromCard(buttonElement, home, away, utcKickoff, leagueName) {
    const card = buttonElement.closest('.match-card, .list-item');
    if (!card) return;
    
    // 1. P1 Komponens (4 mező)  olvasása
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

    // 2. ÚJ (v62.1): P1 Manuális Hiányzók olvasása
    const manualAbsentees = {
        home: [],
        away: []
    };
    
    card.querySelectorAll('.roster-checkbox-home:checked').forEach(cb => {
        manualAbsentees.home.push(cb.value);
    });
    card.querySelectorAll('.roster-checkbox-away:checked').forEach(cb => {
        manualAbsentees.away.push(cb.value);
    });
    
    if (manualAbsentees.home.length > 0 || manualAbsentees.away.length > 0) {
        manualXgData.manual_absentees = manualAbsentees; // Hozzáadjuk a payload-hoz
        console.log('Manuális (P1) Hiányzókat küldök:', manualAbsentees);
    }
    
    runAnalysis(home, away, utcKickoff, leagueName, true, manualXgData);
}

// --- runAnalysis (MÓDOSÍTVA v62.1 - P1 Hiányzókat küld) ---
async function runAnalysis(home, away, utcKickoff, leagueName, forceNew = false, manualXg = {}) {
    home = unescape(home);
    away = unescape(away);
    
    if (isMobile() && forceNew) {
        showToast("Elemzés folyamatban... Ez hosszabb időt vehet igénybe.", 'info', 6000);
    }

    // A 'common-elements' tartalmát másoljuk, ami tartalmazza a #loading-skeleton-t
    openModal(`${home} vs ${away}`, (document.getElementById('common-elements')).innerHTML, 'modal-xl');
    
    const modalSkeleton = document.querySelector('#modal-container #loading-skeleton');
    const modalResults = document.querySelector('#modal-container #analysis-results');
    const modalChatContainer = document.querySelector('#modal-container #chat-container');
    
    modalResults.innerHTML = '';
    modalChatContainer.style.display = 'none';
    modalSkeleton.classList.add('active');
    
    // Eseménykezelők beállítása a *klónozott* chat-hez
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
            ...manualXg // Itt adjuk át a P1 Komponenst  és a P1 Hiányzókat
        };
        
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
        
        // Ez hívja a v59.0-ás HTML építőt és a kiemelőt
        const finalHtml = buildAnalysisHtml_CLIENTSIDE(
            analysisData.committeeResults,
            analysisData.matchData,
            analysisData.oddsData,
            analysisData.valueBets,
            analysisData.modelConfidence,
            analysisData.sim,
            analysisData.recommendation,
            analysisData.availableRosters // ÚJ (v62.1)
        );
        
        modalResults.innerHTML = `<div class="analysis-body">${finalHtml}</div>`;
        modalResults.innerHTML += `<p class="muted" style="text-align: center; margin-top: 1rem; font-size: 0.8rem;">xG Forrás: ${analysisData.xgSource || 'Ismeretlen'}</p>`;

        // v59.0: A #chat-container áthelyezése a 'common-elements'-ből a 'chat-content-wrapper'-be
        const chatWrapper = modalResults.querySelector('#chat-content-wrapper');
        if (chatWrapper) {
            chatWrapper.appendChild(modalChatContainer);
        }

        // Chat Kontexus (v55.1)
        const { committeeResults, recommendation } = analysisData;
        appState.currentAnalysisContext = `Fő elemzés: ${committeeResults.strategic_synthesis}\n
Prófécia: ${committeeResults.prophetic_timeline || 'N/A'}\n
Quant következtetés: ${committeeResults.data_driven_conclusion}\n
Scout következtetés: ${committeeResults.narrative_conclusion}\n
Ajánlás: ${recommendation.recommended_bet} (Bizalom: ${recommendation.final_confidence})`;
            
        appState.chatHistory = [];
        modalSkeleton.classList.remove('active');
        modalChatContainer.style.display = 'block'; // Láthatóvá tesszük a konténert
        (modalChatContainer.querySelector('#chat-messages')).innerHTML = '';
        
    } catch (e) {
        modalResults.innerHTML = `<p style="color:var(--danger); text-align:center; padding: 2rem;">Hiba történt az elemzés során: ${e.message}</p>`;
        modalSkeleton.classList.remove('active'); 
        console.error(e);
    }
}


// --- openHistoryModal (Változatlan) ---
async function openHistoryModal() {
    // ... (Kód változatlan)
}

// --- deleteHistoryItem (Változatlan) ---
async function deleteHistoryItem(id) {
    // ... (Kód változatlan)
}

// --- runFinalCheck (Változatlan) ---
async function runFinalCheck(home, away, sport) {
    // ... (Kód változatlan)
}

// --- viewHistoryDetail (Változatlan v59.0) ---
async function viewHistoryDetail(id) {
    // ... (Kód változatlan)
}

// --- sendChatMessage (Változatlan v59.0) ---
async function sendChatMessage() {
    // ... (Kód változatlan)
}

// --- runMultiAnalysis (MÓDOSÍTVA v62.1 - P1 Hiányzókat küld) ---
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
        
        // v62.1: Ellenőrizzük a P1 adatokat a kártyáról
        const card = document.querySelector(`.selectable-card[data-match-id="${match.uniqueId}"], .selectable-item[data-match-id="${match.uniqueId}"]`);
        let manualXgData = {};
        
        if (card) {
            // 1. P1 Komponens  xG
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
            
            // 2. P1 Hiányzók
            const manualAbsentees = { home: [], away: [] };
            card.querySelectorAll('.roster-checkbox-home:checked').forEach(cb => {
                manualAbsentees.home.push(cb.value);
            });
            card.querySelectorAll('.roster-checkbox-away:checked').forEach(cb => {
                manualAbsentees.away.push(cb.value);
            });
            if (manualAbsentees.home.length > 0 || manualAbsentees.away.length > 0) {
                manualXgData.manual_absentees = manualAbsentees;
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
         document.querySelectorAll('.match-checkbox:checked').forEach(cb => (cb).checked = false);
         updateMultiSelectButton();
         
    } catch (e) { 
         console.error("Váratlan hiba a többes elemzés során:", e);
         loadingContainer.innerHTML = ''; 
         resultsContainer.innerHTML = `<p style="color:var(--danger); text-align:center;">Váratlan hiba történt az elemzések összesítésekor: ${e.message}</p>`;
    }
}


// --- parseHungarianDate (Változatlan) ---
const parseHungarianDate = (huDate) => {
    // ... (Kód változatlan)
};

// --- handleSportChange (v62.1 - Roster Cache törlés) ---
function handleSportChange() {
    appState.currentSport = (document.getElementById('sportSelector')).value;
    appState.selectedMatches.clear(); 
    appState.rosterCache.clear(); // Töröljük a keret cache-t sportágváltáskor
    (document.getElementById('kanban-board')).innerHTML = '';
    (document.getElementById('mobile-list-container')).innerHTML = '';
    (document.getElementById('placeholder')).style.display = 'flex'; 
    updateMultiSelectButton();
}

// --- openManualAnalysisModal (MÓDOSÍTVA v62.1 - 4-komponensű és P1 Hiányzó) ---
function openManualAnalysisModal() {
    // Mivel a keretadatok (roster) itt nem érhetők el,
    // a kézi megnyitásnál csak szöveges bevitelt használhatunk a hiányzókhoz.
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
        
        <h5 style="margin-top: 2rem; margin-bottom: 1rem; color: var(--primary);">Opcionális P1 xG Felülbírálás (4-Komponensű) </h5>
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

    // Alapértelmezett idő (holnap 15:00)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(15, 0, 0, 0);
    const kickoffInput = document.getElementById('manual-kickoff');
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const day = String(tomorrow.getDate()).padStart(2, '0');
    const hours = String(tomorrow.getHours()).padStart(2, '0');
    const minutes = String(tomorrow.getMinutes()).padStart(2, '0');
    kickoffInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
}

// --- runManualAnalysis (MÓDOSÍTVA v62.1 - P1 Hiányzókat küld) ---
function runManualAnalysis() {
    const home = (document.getElementById('manual-home')).value.trim();
    const away = (document.getElementById('manual-away')).value.trim();
    const leagueName = (document.getElementById('manual-league')).value.trim();
    const kickoffLocal = (document.getElementById('manual-kickoff')).value;
    
    // P1 Komponens (4 mező)  adatok olvasása
    const H_xG_raw = (document.getElementById('manual-h-xg')).value;
    const H_xGA_raw = (document.getElementById('manual-h-xga')).value;
    const A_xG_raw = (document.getElementById('manual-a-xg')).value;
    const A_xGA_raw = (document.getElementById('manual-a-xga')).value;
    
    // P1 Manuális Hiányzók olvasása
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

    // P1 Komponens adatok feldolgozása
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
    
    // P1 Hiányzó adatok feldolgozása
    const manualAbsentees = {
        home: Abs_H_raw.split(',').map(s => s.trim()).filter(Boolean),
        away: Abs_A_raw.split(',').map(s => s.trim()).filter(Boolean)
    };
    if (manualAbsentees.home.length > 0 || manualAbsentees.away.length > 0) {
        manualXgData.manual_absentees = manualAbsentees;
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

// --- isMobile (Változatlan) ---
function isMobile() { return window.innerWidth <= 1024; } 
// ... (többi segédfüggvény változatlan)

// --- renderFixturesForDesktop (MÓDOSÍTVA v62.1 - P1 Hiányzó UI) ---
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
                              
                              // v62.1: A keret-választó HTML-je (kezdetben rejtve)
                              const rosterHtml = `
                                <details style="margin-top: 0.5rem;">
                                    <summary style="font-size: 0.8rem; color: var(--text-secondary); cursor: pointer;">P1 Hiányzók Felülbírálása (Keret betöltése...)</summary>
                                    <div class="roster-selector-container" data-match-id="${fx.uniqueId}" style="margin-top: 0.5rem; text-align: left;">
                                        <p class="muted" style="font-size: 0.8rem;">Kattints az "Elemzés Indítása" gombra a keretek betöltéséhez...</p>
                                    </div>
                                </details>`;
                              
                              columnContent += `
                                <div class="match-card selectable-card ${appState.selectedMatches.has(fx.uniqueId) ? 'selected' : ''}" data-match-id="${fx.uniqueId}" style="animation-delay: ${cardIndex * 0.05}s">
                                    <input type="checkbox" class="match-checkbox" data-match-id="${fx.uniqueId}" ${appState.selectedMatches.has(fx.uniqueId) ? 'checked' : ''}>
                                     
                                     <div class="match-card-content">
                       
                                          <div class="match-card-teams">${fx.home} – ${fx.away}</div>
                                         <div class="match-card-meta">
                                             <span>${fx.league || 'Ismeretlen Liga'}</span>
                                             <span>${time}</span>
                                         </div>
             
                                         <p class="muted" style="font-size: 0.8rem; margin-top: 1rem; margin-bottom: 0.5rem; text-align: left;">P1 (Komponens) xG :</p>
                                         <div class="manual-xg-grid" style="margin-top: 0.5rem;">
                                            <input type="text" inputmode="decimal" placeholder="H xG" class="xg-input xg-input-h-xg" title="Hazai Csapat (Home) xG/90">
                                            <input type="text" inputmode="decimal" placeholder="H xGA" class="xg-input xg-input-h-xga" title="Hazai Csapat (Home) xGA/90">
                                            <input type="text" inputmode="decimal" placeholder="V xG" class="xg-input xg-input-a-xg" title="Vendég Csapat (Away) xG/90">
                                            <input type="text" inputmode="decimal" placeholder="V xGA" class="xg-input xg-input-a-xga" title="Vendég Csapat (Away) xGA/90">
                                         </div>
                                         
                                         ${(appState.currentSport === 'soccer') ? rosterHtml : ''}
                                         
                                         <button class="btn btn-primary" 
                                                 style="width: 100%; margin-top: 1rem;"
                                                 onclick="runAnalysisFromCard(this, '${escape(fx.home)}', '${escape(fx.away)}', '${escape(fx.utcKickoff)}', '${escape(fx.league)}')">
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

// --- renderFixturesForMobileList (MÓDOSÍTVA v62.1 - P1 Hiányzó UI) ---
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
            const groupedByDate = groupBy(fixtures, (fx) => {
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
                            
                            // v62.1: A keret-választó HTML-je (kezdetben rejtve)
                            const rosterHtml = `
                                <details style="margin-top: 0.5rem;">
                                    <summary style="font-size: 0.8rem; color: var(--text-secondary); cursor: pointer;">P1 Hiányzók Felülbírálása (Keret betöltése...)</summary>
                                    <div class="roster-selector-container" data-match-id="${fx.uniqueId}" style="margin-top: 0.5rem; text-align: left;">
                                        <p class="muted" style="font-size: 0.8rem;">Kattints az "Elemzés Indítása" gombra a keretek betöltéséhez...</p>
                                    </div>
                                </details>`;
                            
                             html += `
                                <div class="list-item selectable-item ${appState.selectedMatches.has(fx.uniqueId) ? 'selected' : ''}" data-match-id="${fx.uniqueId}">
                                    <input type="checkbox" class="match-checkbox" data-match-id="${fx.uniqueId}" ${appState.selectedMatches.has(fx.uniqueId) ? 'checked' : ''}>
                                     
                                    <div class="list-item-content">
                                        <div class="list-item-title">${fx.home} – ${fx.away}</div>
                                        <div class="list-item-meta">${fx.league || 'Ismeretlen Liga'} - ${time}</div>
                                        
                                        <p class="muted" style="font-size: 0.8rem; margin-top: 0.75rem; margin-bottom: 0.5rem;">P1 (Komponens) xG :</p>
                                        <div class="manual-xg-grid" style="margin-top: 0.5rem;">
                                           <input type="text" inputmode="decimal" placeholder="H xG" class="xg-input xg-input-h-xg" title="Hazai Csapat (Home) xG/90">
                                           <input type="text" inputmode="decimal" placeholder="H xGA" class="xg-input xg-input-h-xga" title="Hazai Csapat (Home) xGA/90">
                                           <input type="text" inputmode="decimal" placeholder="V xG" class="xg-input xg-input-a-xg" title="Vendég Csapat (Away) xG/90">
                                           <input type="text" inputmode="decimal" placeholder="V xGA" class="xg-input xg-input-a-xga" title="Vendég Csapat (Away) xGA/90">
                                        </div>
                                        
                                        ${(appState.currentSport === 'soccer') ? rosterHtml : ''}
                                    </div>

                                    <button class="btn btn-primary" 
                                            style="margin-right: 1rem; align-self: center;"
                                            onclick="runAnalysisFromCard(this, '${escape(fx.home)}', '${escape(fx.away)}', '${escape(fx.utcKickoff)}', '${escape(fx.league)}')">
                                        Elemzés
                                    </button>
                                 </div>`;
                        });
                });
        }
    });
    container.innerHTML = html || '<p class="muted" style="text-align:center; padding: 2rem;">Nincsenek elérhető mérkőzések.</p>';
}

// ... (többi segédfüggvény változatlan) ...

// === ÚJ (v62.1) Keret-választó UI Építő ===
/**
 * Felépíti a HTML-t a P1-es manuális hiányzó-kiválasztó listához.
 * Ezt a 'buildAnalysisHtml_CLIENTSIDE' hívja meg, miután az 'availableRosters' megérkezett.
 * @param {object} availableRosters - A kliensnek küldött { home: [], away: [] } objektum.
 */
function _buildRosterSelectorHtml(availableRosters) {
    if (!availableRosters || (!availableRosters.home?.length && !availableRosters.away?.length)) {
        return '<p class="muted" style="font-size: 0.8rem;">A P1-es keret-kiválasztó nem érhető el (az API nem adott vissza keretadatot).</p>';
    }

    const buildList = (players, teamType) => {
        if (!players || players.length === 0) return `<p class="muted" style="font-size: 0.8rem;">Nincs ${teamType} keretadat.</p>`;
        
        // Csoportosítás pozíció szerint (G, D, M, F)
        const grouped = groupBy(players, p => p.pos || 'N/A');
        
        let html = '';
        // Pozíciók sorrendje
        ['G', 'D', 'M', 'F', 'N/A'].forEach(pos => {
            if (grouped[pos]) {
                html += `<div class="roster-position-group">`;
                html += `<strong>${pos} (Kapus/Védő/Közép/Támadó):</strong>`;
                html += grouped[pos].map(player => `
                    <label class="roster-checkbox-label">
                        <input type="checkbox" class="roster-checkbox-${teamType}" value="${escapeHTML(player.name)}">
                        ${escapeHTML(player.name)}
                    </label>
                `).join('');
                html += `</div>`;
            }
        });
        return html;
    };

    return `
        <div class="roster-selector-grid">
            <div class="roster-selector-column">
                <h5>Hazai Keret (P1 Hiányzók)</h5>
                ${buildList(availableRosters.home, 'home')}
            </div>
            <div class="roster-selector-column">
                <h5>Vendég Keret (P1 Hiányzók)</h5>
                ${buildList(availableRosters.away, 'away')}
            </div>
        </div>
        <style>
            .roster-selector-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 0.5rem; }
            .roster-selector-column { max-height: 200px; overflow-y: auto; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 0.75rem; font-size: 0.85rem; }
            .roster-position-group { margin-bottom: 0.5rem; }
            .roster-position-group strong { font-size: 0.75rem; text-transform: uppercase; color: var(--text-secondary); }
            .roster-checkbox-label { display: block; margin: 0.25rem 0; cursor: pointer; }
            .roster-checkbox-label:hover { color: var(--primary); }
            .roster-checkbox-label input { margin-right: 0.5rem; }
        </style>
    `;
}


/**
 * === FŐ KLIENSOLDALI HTML ÉPÍTŐ (ÁTÍRVA v62.1) ===
 * Most már fogadja az 'availableRosters'-t és beépíti a P1 hiányzó-választót.
 */
function buildAnalysisHtml_CLIENTSIDE(
    fullAnalysisReport, 
    matchData, 
    oddsData, 
    valueBets, 
    modelConfidence, 
    sim, 
    masterRecommendation,
    availableRosters // ÚJ (v62.1)
) {
    
    // --- 1. ADATOK KINYERÉSE ÉS ELŐKÉSZÍTÉS (Változatlan v59.0) ---
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
    const modelConf = modelConfidence?.toFixed(1) || '1.0';
    const expertConfHtml = fullAnalysisReport?.final_confidence_report || "**1.0/10** - Hiba.";
    let expertConfScore = 1.0;
    try {
        const match = expertConfHtml.match(/\*\*(\d+(\.\d+)?)\/10\*\*/);
        if (match && match[1]) { expertConfScore = parseFloat(match[1]); }
    } catch(e) { /* Hiba figyelmen kívül hagyása */ }

    // --- 2. FŐ AJÁNLÁS (STRATÉGA) (v59.0 - Kiemelőt használ) ---
    const finalRec = masterRecommendation || { recommended_bet: "Hiba", final_confidence: 1.0, brief_reasoning: "Hiba" };
    const finalReasoningHtml = processAiText(finalRec.brief_reasoning, teamNames);
    const finalConfInterpretationHtml = getConfidenceInterpretationHtml(finalRec.final_confidence, teamNames);
    
    const masterRecommendationHtml = `
    <div class="master-recommendation-card">
        <h5>👑 Vezető Stratéga Ajánlása 👑</h5>
        <div class="master-bet"><strong>${escapeHTML(finalRec.recommended_bet)}</strong></div>
        <div class="master-confidence">
            Végső Bizalom: <strong class="glowing-text-white">${(finalRec.final_confidence || 1.0).toFixed(1)}/10</strong>
        </div>
        <div class="master-reasoning">${finalReasoningHtml}</div>
        ${finalConfInterpretationHtml}
    </div>`;

    // --- 3. PRÓFÉTA KÁRTYA (NARRATÍVA OSZLOP) (v59.0 - Kiemelőt használ) ---
    let prophetText = fullAnalysisReport?.prophetic_timeline || "A Próféta nem adott meg jóslatot.";
    if (prophetText && !prophetText.includes("Hiba")) {
        prophetText += `\n(Várható gólok: ${mu_h} - ${mu_a}. Legvalószínűbb eredmény: ${sim?.topScore?.gh ?? 'N/A'} - ${sim?.topScore?.ga ?? 'N/A'}.)`;
    }
    const prophetCardHtml = `
    <div class="prophet-card">
        <h5><strong>🔮 A Próféta Látomása (Várható Meccskép)</strong></h5>
        <p>${processAiText(prophetText, teamNames)}</p>
    </div>`;

    // --- 4. SZINTÉZIS KÁRTYA (NARRATÍVA OSZLOP) (v59.0 - Kiemelőt használ) ---
    const synthesisText = fullAnalysisReport?.strategic_synthesis || "A stratégiai szintézis nem elérhető.";
    const synthesisCardHtml = `
    <div class="synthesis-card">
        <h5><strong>🧠 Stratégiai Szintézis (A Fő Elemzés)</strong></h5>
        <p>${processAiText(synthesisText, teamNames)}</p>
    </div>`;

    // --- 5. ÚJ (v62.1): P1 HIÁNYZÓ VÁLASZTÓ (NARRATÍVA OSZLOP) ---
    const rosterSelectorHtml = _buildRosterSelectorHtml(availableRosters);
    const p1AbsenteesHtml = `
    <div class="sidebar-accordion" style="margin-top: 1.5rem;">
        <details>
            <summary>P1 Manuális Hiányzó Felülbírálás</summary>
            <div class="accordion-content">
                ${rosterSelectorHtml}
            </div>
        </details>
    </div>`;

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


    // --- 7. ADAT OSZLOP (SIDEBAR) (Változatlan v59.0) ---
    
    // 7a. At-a-Glance Adatok
    const atAGlanceHtml = `
    <div class="at-a-glance-grid">
        <div class="summary-card">
            <h5>Alap Valószínűségek (Sim)</h5>
            ${getRadialChartHtml(pHome, pDraw, pAway, matchData.sport)}
        </div>
        <div class="summary-card">
            <h5>Várható Eredmény (xG)</h5>
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
    
    // 7b. Bizalmi Híd
    const expertConfReasoning = processAiText(expertConfHtml.split(' - ')[1] || 'N/A', teamNames);
    const confidenceBridgeHtml = `
    <div class="confidence-bridge-card">
        <h5>Bizalmi Híd (Quant vs. Stratéga)</h5>
        <div class="confidence-bridge-values">
            ${getGaugeHtml(modelConf, "Quant")}
            <div class="arrow">→</div>
            ${getGaugeHtml(expertConfScore, "Stratéga")}
        </div>
        <div class="confidence-bridge-reasoning">${expertConfReasoning}</div>
    </div>`;

    // 7c. Érték Elemzés (Value Betting)
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
    
    // 7d. Oldalsáv Harmonika (Mikromodellek + Quant/Scout)
    const microModelsHtml = getMicroAnalysesHtml(fullAnalysisReport?.micromodels, teamNames);
    const quantReportHtml = (fullAnalysisReport?.quantitative_summary) ? `
        <div class="committee-card quant">
            <h4>Quant 7 Jelentése (Adatvezérelt)</h4>
            <p><strong>Összefoglaló:</strong> ${processAiText(fullAnalysisReport?.quantitative_summary, teamNames)}</p>
            <p><strong>Következtetés:</strong> ${processAiText(fullAnalysisReport?.data_driven_conclusion, teamNames)}</p>
            <strong>Kulcs Statisztikák:</strong>
            <ul class="key-insights">
                ${processAiList(fullAnalysisReport?.key_statistical_insights, teamNames)}
            </ul>
         </div>` : '';
    const scoutReportHtml = (fullAnalysisReport?.tactical_summary) ? `
         <div class="committee-card scout">
            <h4>Scout 3 Jelentése (Kontextus-vezérelt)</h4>
            <p><strong>Összefoglaló:</strong> ${processAiText(fullAnalysisReport?.tactical_summary, teamNames)}</p>
            <p><strong>Következtetés:</strong> ${processAiText(fullAnalysisReport?.narrative_conclusion, teamNames)}</p>
            <strong>Kulcs Kontextusok:</strong>
            <ul class="key-insights">
                ${processAiList(fullAnalysisReport?.key_contextual_insights, teamNames)}
            </ul>
         </div>` : '';
    const sidebarAccordionHtml = `
    <div class="sidebar-accordion">
        <details>
            <summary>Piaci Mikromodellek</summary>
            <div class="accordion-content micromodel-grid">
                ${microModelsHtml}
            </div>
        </details>
        ${(quantReportHtml || scoutReportHtml) ? `
        <details>
            <summary>Szakértői Jelentések (Régi)</summary>
            <div class="accordion-content committee-reports">
                ${quantReportHtml}
                ${scoutReportHtml}
            </div>
        </details>` : ''}
    </div>`;


    // --- 8. VÉGLEGES HTML ÖSSZEÁLLÍTÁSA (v62.1 Elrendezés) ---
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
