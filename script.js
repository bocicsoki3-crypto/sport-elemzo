// --- script.js (v77.0 - Smart Scout Edition) ---
// MÓDOSÍTÁS (v77.0):
// 1. ÚJ: 'ELITE_TEAMS' lista a világ legjobb csapataival.
// 2. ÚJ: 'getMatchPotentialHTML' függvény, ami ikonokkal jelöli a meccs típusát.
// 3. UI: A meccs kártyák renderelésekor (Desktop és Mobil) ezek a jelvények megjelennek.

// --- 1. ALKALMAZÁS ÁLLAPOT ---
const appState = {
    gasUrl: 'https://king-ai-backend.onrender.com', 
    fixtures: [], 
    currentSport: 'soccer',
    sheetUrl: '',
    currentAnalysisContext: '',
    chatHistory: [],
    selectedMatches: new Set(),
    authToken: null
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

// === ÚJ (v77.0): ELIT CSAPAT ADATBÁZIS (SMART SCOUT) ===
// Ezek azok a csapatok, ahol az AI a legpontosabb adatokkal rendelkezik.
const ELITE_TEAMS = new Set([
    // Soccer
    'manchester city', 'liverpool', 'arsenal', 'real madrid', 'barcelona', 'bayern munich', 
    'inter', 'ac milan', 'juventus', 'psg', 'bayer leverkusen', 'atletico madrid', 
    'tottenham', 'chelsea', 'borussia dortmund', 'napoli', 'benfica', 'porto', 'sporting cp',
    // NBA
    'boston celtics', 'denver nuggets', 'milwaukee bucks', 'los angeles lakers', 'golden state warriors', 
    'phoenix suns', 'dallas mavericks', 'philadelphia 76ers',
    // NHL
    'edmonton oilers', 'colorado avalanche', 'florida panthers', 'new york rangers', 'boston bruins',
    'toronto maple leafs', 'vegas golden knights', 'dallas stars'
]);

function isElite(teamName) {
    if (!teamName) return false;
    const lower = teamName.toLowerCase();
    // Részleges egyezést is keresünk (pl. "Inter Milan" -> "inter")
    for (const elite of ELITE_TEAMS) {
        if (lower.includes(elite)) return true;
    }
    return false;
}

/**
 * Kiszámolja a meccs potenciálját és visszaadja a megfelelő HTML jelvényeket.
 */
function getMatchPotentialHTML(home, away, league) {
    const homeElite = isElite(home);
    const awayElite = isElite(away);
    
    let badges = '';
    let frameClass = ''; // CSS osztály a kártya keretéhez

    if (homeElite && awayElite) {
        // Két elit csapat: RANGADÓ
        badges += `<span class="scout-badge badge-fire">🔥 RANGADÓ</span>`;
        badges += `<span class="scout-badge badge-diamond">💎 PRÉMIUM ADAT</span>`;
        frameClass = 'card-highlight-elite';
    } else if (homeElite || awayElite) {
        // Egy elit csapat: DÁVID vs GÓLIÁT vagy Sima ügy
        badges += `<span class="scout-badge badge-diamond">💎 PRÉMIUM ADAT</span>`;
        // Ha a liga is Top Liga, akkor ez egy nagyon megbízható meccs lehet
        if (LEAGUE_CATEGORIES.soccer['Top Ligák'].includes(league) || 
            LEAGUE_CATEGORIES.basketball['Top Ligák'].includes(league) ||
            LEAGUE_CATEGORIES.hockey['Top Ligák'].includes(league)) {
             badges += `<span class="scout-badge badge-star">⭐ KIEMELT</span>`;
             frameClass = 'card-highlight-strong';
        }
    } else {
        // Egyéb meccsek: Itt lehet Value, de nagyobb a szórás
        // Nem adunk jelvényt, hogy ne legyen zajos a felület
    }

    return { html: badges, frameClass: frameClass };
}
// === VÉGE (v77.0) ===


// --- 3. SEGÉDFÜGGVÉNY DEFINÍCIÓK ---

// === Biztonsági és Hálózati Függvények ===
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
            ...(options.headers || {}), 
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
    appState.selectedMatches.clear(); 
    
    const board = document.getElementById('kanban-board');
    const mobileContainer = document.getElementById('mobile-list-container');
    if (board) board.innerHTML = '';
    if (mobileContainer) mobileContainer.innerHTML = '';
    
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
        
        (document.getElementById('userInfo')).textContent = `Csatlakozva`;
        (document.getElementById('placeholder')).style.display = 'none';
    
    } catch (e) {
        showToast(`Hiba a meccsek betöltésekor: ${e.message}`, 'error');
        (document.getElementById('userInfo')).textContent = `Hiba`;
        (document.getElementById('placeholder')).style.display = 'flex'; 
        console.error(e);
    } finally {
        loadBtn.disabled = false;
    }
}

function runAnalysisFromCard(buttonElement, home, away, utcKickoff, leagueName) {
    const card = buttonElement.closest('.match-card, .list-item, .mobile-match-card');
    if (!card) return;
    
    const matchId = card.dataset.matchId;
    
    const H_xG_raw = card.querySelector('.xg-input-h-xg')?.value;
    const H_xGA_raw = card.querySelector('.xg-input-h-xga')?.value;
    const A_xG_raw = card.querySelector('.xg-input-a-xg')?.value;
    const A_xGA_raw = card.querySelector('.xg-input-a-xga')?.value;
    
    // === ÚJ v144.0: PPG értékek beolvasása ===
    const H_PPG_raw = card.querySelector('.xg-input-h-ppg')?.value;
    const A_PPG_raw = card.querySelector('.xg-input-a-ppg')?.value;
    
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
        } else {
            showToast('Manuális xG: Érvénytelen számformátum. Az xG felülbírálás kihagyva.', 'error');
        }
    }
    
    // === ÚJ v144.0: PPG értékek hozzáadása ===
    if (H_PPG_raw && A_PPG_raw) {
        const H_PPG = parseFloat(H_PPG_raw.replace(',', '.'));
        const A_PPG = parseFloat(A_PPG_raw.replace(',', '.'));
        if (!isNaN(H_PPG) && !isNaN(A_PPG)) {
            manualXgData.manual_H_PPG = H_PPG;
            manualXgData.manual_A_PPG = A_PPG;
        }
    }

    runAnalysis(home, away, utcKickoff, leagueName, true, manualXgData, matchId); 
}

async function runAnalysis(home, away, utcKickoff, leagueName, forceNew = false, manualXg = {}, matchId = null) { 
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
        if (!matchId) {
             matchId = `${appState.currentSport}_${home.toLowerCase().replace(/\s+/g, '')}_${away.toLowerCase().replace(/\s+/g, '')}`;
        }
        
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
            ...manualXg 
        };
        delete (payload).manual_xg_home;
        delete (payload).manual_xg_away;
        
        const response = await fetchWithAuth(analysisUrl, {
            method: 'POST',
            body: JSON.stringify(payload) 
        });
        if (!response.ok) await handleFetchError(response);

        const data = await response.json();
        if (data.error) throw new Error(data.error);
        const { analysisData } = data;
        
        const finalHtml = buildAnalysisHtml_CLIENTSIDE(
            analysisData.committee,
            analysisData.matchData,
            analysisData.oddsData,
            analysisData.valueBets,
            analysisData.confidenceScores, 
            analysisData.finalConfidenceScore, 
            analysisData.sim,
            analysisData.recommendation,
            matchId,
            analysisData.dataQualityWarning 
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
    if (!confirm("Biztosan törölni szeretnéd ezt az elemet?")) return;
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

async function viewHistoryDetail(id) {
    const originalId = unescape(id);
    
    // Betöltő képernyő
    openModal('Elemzés Betöltése...', document.getElementById('loading-skeleton').outerHTML, 'modal-xl');
    document.querySelector('#modal-container #loading-skeleton').classList.add('active');
    
    try {
        const response = await fetchWithAuth(`${appState.gasUrl}/getAnalysisDetail?id=${encodeURIComponent(originalId)}`);
        if (!response.ok) await handleFetchError(response);
        const data = await response.json();
        if (data.error) throw new Error(data.error); 

        const { record } = data;
        if (!record || !record.html) throw new Error("A szerver nem találta a kért elemzést, vagy az hiányos.");
        
        document.getElementById('modal-title').textContent = `${record.home || 'Ismeretlen'} vs ${record.away || 'Ismeretlen'}`;
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
                
                if (!storedResponse || !storedResponse.analysisData) {
                    throw new Error("A mentett JSON struktúra hiányos.");
                }
                
                const { analysisData } = storedResponse;
                const matchId = record.id; 

                const safeCommittee = analysisData.committee || {};
                
                if (!safeCommittee.quant) safeCommittee.quant = { source: "N/A", mu_h: 0, mu_a: 0 };
                if (!safeCommittee.scout) safeCommittee.scout = { summary: "A részletes jelentés nem került mentésre.", key_insights: [] };
                if (!safeCommittee.critic) safeCommittee.critic = { tactical_summary: "A részletes jelentés nem került mentésre.", key_risks: [] };

                const quantConfidenceData = analysisData.confidenceScores || { 
                    winner: analysisData.modelConfidence || 1.0, 
                    totals: analysisData.modelConfidence || 1.0, 
                    overall: analysisData.modelConfidence || 1.0 
                };

                contentToDisplay = buildAnalysisHtml_CLIENTSIDE(
                    safeCommittee,
                    analysisData.matchData,
                    analysisData.oddsData,
                    analysisData.valueBets,
                    quantConfidenceData, 
                    analysisData.finalConfidenceScore,
                    analysisData.sim,
                    analysisData.recommendation,
                    matchId,
                    analysisData.dataQualityWarning 
                );
                
            } catch (e) {
                console.error("Hiba az előzmény JSON újrarajzolásakor:", e);
                contentToDisplay = `<p style="color:var(--danger); text-align:center; padding: 2rem;">Hiba a JSON elemzés újrarajzolásakor: ${e.message}</p><div style="text-align:left; margin-top: 1rem; font-size: 0.8rem; opacity: 0.7; max-height: 200px; overflow-y: auto; background: #000; padding: 1rem;">${escapeHTML(record.html)}</div>`;
            }
        } 
        else {
            contentToDisplay = `<div class="analysis-body">${record.html}</div>`;
        }

        // --- VISSZA GOMB BEILLESZTÉSE ---
        const backButtonHtml = `
            <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center;">
                <button onclick="openHistoryModal()" class="nav-btn" style="padding: 10px 20px; font-size: 0.9rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);">
                    <span style="margin-right: 8px;">⬅</span> Vissza a listához
                </button>
            </div>
        `;

        modalBody.innerHTML = backButtonHtml + document.getElementById('common-elements').innerHTML;
        modalBody.querySelector('#loading-skeleton').style.display = 'none'; 
        modalBody.querySelector('#analysis-results').innerHTML = contentToDisplay;
        const modalChat = modalBody.querySelector('#chat-container');
        modalChat.style.display = 'none';

    } catch(e) {
         // Hiba esetén is megjelenítjük a vissza gombot
         document.getElementById('modal-body').innerHTML = `
            <div style="margin-bottom: 20px;">
                <button onclick="openHistoryModal()" class="nav-btn">⬅ Vissza</button>
            </div>
            <p style="color:var(--danger); text-align:center; padding: 2rem;">Hiba a részletek betöltésekor: ${e.message}</p>`;
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
    return new Date('invalid date');
};

function handleSportChange() {
    appState.currentSport = (document.getElementById('sportSelector')).value;
    appState.selectedMatches.clear(); 
    (document.getElementById('kanban-board')).innerHTML = '';
    (document.getElementById('mobile-list-container')).innerHTML = '';
    (document.getElementById('placeholder')).style.display = 'flex'; 
    updateMultiSelectButton();
}

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
        
        <h5 style="margin-top: 2rem; margin-bottom: 1rem; color: var(--primary);">Opcionális xG Felülbírálás (4-Komponensű)</h5>
        <div class="manual-xg-grid" style="margin-top: 0.5rem;">
            <input type="text" inputmode="decimal" placeholder="H xG" class="xg-input" id="manual-h-xg" title="Hazai Csapat (Home) xG/90">
            <input type="text" inputmode="decimal" placeholder="H xGA" class="xg-input" id="manual-h-xga" title="Hazai Csapat (Home) xGA/90">
            <input type="text" inputmode="decimal" placeholder="V xG" class="xg-input" id="manual-a-xg" title="Vendég Csapat (Away) xG/90">
            <input type="text" inputmode="decimal" placeholder="V xGA" class="xg-input" id="manual-a-xga" title="Vendég Csapat (Away) xGA/90">
        </div>
        
        <h5 style="margin-top: 1.5rem; margin-bottom: 1rem; color: var(--primary);">Opcionális PPG (Points Per Game)</h5>
        <div class="manual-xg-grid" style="margin-top: 0.5rem;">
            <input type="text" inputmode="decimal" placeholder="H PPG" class="xg-input" id="manual-h-ppg" title="Hazai Csapat (Home) Points Per Game">
            <input type="text" inputmode="decimal" placeholder="V PPG" class="xg-input" id="manual-a-ppg" title="Vendég Csapat (Away) Points Per Game">
        </div>

        <button id="run-manual-btn" class="btn btn-analyze" style="width:100%; margin-top:1.5rem;">Elemzés Futtatása</button>
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

function runManualAnalysis() {
    const home = (document.getElementById('manual-home')).value.trim();
    const away = (document.getElementById('manual-away')).value.trim();
    const leagueName = (document.getElementById('manual-league')).value.trim();
    const kickoffLocal = (document.getElementById('manual-kickoff')).value;
    
    const H_xG_raw = (document.getElementById('manual-h-xg')).value;
    const H_xGA_raw = (document.getElementById('manual-h-xga')).value;
    const A_xG_raw = (document.getElementById('manual-a-xg')).value;
    const A_xGA_raw = (document.getElementById('manual-a-xga')).value;
    
    // === ÚJ v144.0: PPG értékek beolvasása ===
    const H_PPG_raw = (document.getElementById('manual-h-ppg')).value;
    const A_PPG_raw = (document.getElementById('manual-a-ppg')).value;
    
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
        }
    }
    
    // === ÚJ v144.0: PPG értékek hozzáadása ===
    if (H_PPG_raw && A_PPG_raw) {
        const H_PPG = parseFloat(H_PPG_raw.replace(',', '.'));
        const A_PPG = parseFloat(A_PPG_raw.replace(',', '.'));
        if (!isNaN(H_PPG) && !isNaN(A_PPG)) {
            manualXgData.manual_H_PPG = H_PPG;
            manualXgData.manual_A_PPG = A_PPG;
        }
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

function isMobile() { return window.innerWidth <= 768; } 

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

function renderFixturesForDesktop(fixtures) {
    const board = document.getElementById('kanban-board');
    if (!board) return;
    
    (document.getElementById('placeholder')).style.display = 'none';
    
    // === v133.1 FIX: DESKTOP NÉZET HELYES DISPLAY ===
    const kanbanContainer = document.getElementById('kanban-container');
    if (kanbanContainer) kanbanContainer.style.display = 'flex'; // Kanban CONTAINER látható
    board.style.display = 'flex'; // v133.1 FIX: FLEX, nem grid!
    const mobileContainer = document.getElementById('mobile-list-container');
    if (mobileContainer) mobileContainer.style.display = 'none'; // Mobil lista elrejtése
    // === VÉGE v133.1 ===
    
    board.innerHTML = '';
    const groupOrder = ['Top Ligák', 'Kiemelt Bajnokságok', 'Figyelmet Érdemlő', 'Egyéb Meccsek'];
    const groupedByCategory = groupBy(fixtures, (fx) => getLeagueGroup(fx.league));
    
    groupOrder.forEach(group => { 
        let columnContent = ''; 
        
        if (groupedByCategory[group]) { 
            const groupedByDate = groupBy(groupedByCategory[group], (fx) => {
                try { return new Date(fx.utcKickoff).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }); } 
                catch (e) { return 'Ismeretlen dátum'; } 
            });

            Object.keys(groupedByDate)
                .sort((a, b) => parseHungarianDate(a).getTime() - parseHungarianDate(b).getTime()) 
                .forEach(dateKey => {
                    columnContent += `<div class="kanban-date-header">${formatDateLabel(dateKey)}</div>`;
                    
                    groupedByDate[dateKey]
                        .sort((a, b) => new Date(a.utcKickoff).getTime() - new Date(b.utcKickoff).getTime())
                        .forEach((fx) => { 
                            const time = new Date(fx.utcKickoff).toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' });
                            
                            // === ÚJ (v77.0): Potenciál Ellenőrzés ===
                            const scoutInfo = getMatchPotentialHTML(fx.home, fx.away, fx.league);
                            // ========================================

                            columnContent += `
                                <div class="match-card selectable-card ${appState.selectedMatches.has(fx.uniqueId) ? 'selected' : ''} ${scoutInfo.frameClass}" data-match-id="${fx.uniqueId}">
                                    <div style="position:absolute; top:15px; right:15px;">
                                        <input type="checkbox" class="match-checkbox" data-match-id="${fx.uniqueId}" ${appState.selectedMatches.has(fx.uniqueId) ? 'checked' : ''}>
                                    </div>
                                    
                                    <div class="match-card-meta">
                                        <span class="meta-league">${fx.league || 'Liga'}</span> 
                                        <span class="meta-time">${time}</span>
                                    </div>
                                    
                                    <div class="match-card-teams">
                                        <div class="team-name">${fx.home}</div>
                                        <div class="vs-badge">VS</div>
                                        <div class="team-name">${fx.away}</div>
                                    </div>
                                    
                                    <div style="text-align:center; margin-bottom:10px;">
                                        ${scoutInfo.html}
                                    </div>
                                    
                                    <div class="manual-xg-grid">
                                        <input type="text" inputmode="decimal" placeholder="H xG" class="xg-input xg-input-h-xg">
                                        <input type="text" inputmode="decimal" placeholder="H xGA" class="xg-input xg-input-h-xga">
                                        <input type="text" inputmode="decimal" placeholder="V xG" class="xg-input xg-input-a-xg">
                                        <input type="text" inputmode="decimal" placeholder="V xGA" class="xg-input xg-input-a-xga">
                                    </div>
                                    <div class="manual-xg-grid" style="margin-top: 0.5rem;">
                                        <input type="text" inputmode="decimal" placeholder="H PPG" class="xg-input xg-input-h-ppg" title="Hazai Csapat Points Per Game">
                                        <input type="text" inputmode="decimal" placeholder="V PPG" class="xg-input xg-input-a-ppg" title="Vendég Csapat Points Per Game">
                                    </div>
                                    
                                    <button class="btn btn-analyze" 
                                        onclick="runAnalysisFromCard(this, '${escape(fx.home)}', '${escape(fx.away)}', '${escape(fx.utcKickoff)}', '${escape(fx.league || '')}')">
                                        ELEMZÉS INDÍTÁSA ⚡
                                    </button>
                                </div>`;
                        });
                });
        }

        board.innerHTML += `
            <div class="kanban-column">
                <h4 class="kanban-column-header">${group}</h4>
                <div class="column-content">
                    ${columnContent || '<div style="text-align:center; padding:20px; opacity:0.5;">Nincs meccs</div>'}
                </div>
            </div>`;
    });
}

function renderFixturesForMobileList(fixtures) {
    const container = document.getElementById('mobile-list-container');
    if (!container) return;
    (document.getElementById('placeholder')).style.display = 'none'; 
    
    // === v133.1: MOBIL LISTA LÁTHATÓVÁ TÉTELE ===
    container.style.display = 'block'; // Mobil lista látható
    const kanbanContainer = document.getElementById('kanban-container');
    if (kanbanContainer) kanbanContainer.style.display = 'none'; // Kanban container elrejtése
    const kanbanBoard = document.getElementById('kanban-board');
    if (kanbanBoard) kanbanBoard.style.display = 'none'; // Desktop nézet elrejtése
    // === VÉGE v133.1 ===
    
    container.innerHTML = '';
    
    const groupOrder = ['Top Ligák', 'Kiemelt Bajnokságok', 'Figyelmet Érdemlő', 'Egyéb Meccsek'];
    const groupedByCategory = groupBy(fixtures, (fx) => getLeagueGroup(fx.league));
    
    let html = '';
    groupOrder.forEach(group => { 
        if (groupedByCategory[group]) { 
            html += `<div style="margin: 20px 0 10px 0; color: var(--text-secondary); font-size: 0.9rem; text-transform: uppercase; letter-spacing: 2px; font-weight: 700; padding-left: 5px; border-left: 4px solid var(--primary); text-shadow: 0 0 10px rgba(0,0,0,0.5);">${group}</div>`;
            
            const groupedByDate = groupBy(groupedByCategory[group], (fx) => {
                try { return new Date(fx.utcKickoff).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }); }
                 catch (e) { return 'Ismeretlen dátum'; }
            });
            
            Object.keys(groupedByDate)
                .sort((a, b) => parseHungarianDate(a).getTime() - parseHungarianDate(b).getTime()) 
                .forEach(dateKey => {
                    html += `<div class="mobile-date-header kanban-date-header" style="background:transparent; position:static; border:none; box-shadow:none;">${formatDateLabel(dateKey)}</div>`; 
                
                    groupedByDate[dateKey]
                         .sort((a, b) => new Date(a.utcKickoff).getTime() - new Date(b.utcKickoff).getTime())
                        .forEach((fx) => { 
                            const time = new Date(fx.utcKickoff).toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' });
                            
                            // === ÚJ (v77.0): Potenciál Ellenőrzés Mobilra ===
                            const scoutInfo = getMatchPotentialHTML(fx.home, fx.away, fx.league);
                            // ===============================================

                            html += `
                                <div class="mobile-match-card selectable-item ${appState.selectedMatches.has(fx.uniqueId) ? 'selected' : ''} ${scoutInfo.frameClass}" data-match-id="${fx.uniqueId}">
                                    <div class="mm-header">
                                        <div class="mm-league kanban-glow-text">${fx.league || 'Liga'}</div>
                                        <div class="mm-time kanban-glow-text" style="color:var(--primary);">${time}</div>
                                    </div>
                                    <div class="mm-body">
                                        <div class="mm-teams">
                                            <div class="kanban-glow-text" style="margin-bottom:5px; font-size:1.2rem;">${fx.home}</div>
                                            <div style="font-size:0.8rem; color:var(--primary); opacity:0.8;">VS</div>
                                            <div class="kanban-glow-text" style="margin-top:5px; font-size:1.2rem;">${fx.away}</div>
                                        </div>
                                        
                                        <div style="text-align:center; margin-bottom:15px;">
                                            ${scoutInfo.html}
                                        </div>

                                        <div class="manual-xg-grid" style="margin-top: 15px;">
                                           <input type="text" inputmode="decimal" placeholder="H xG" class="xg-input xg-input-h-xg">
                                           <input type="text" inputmode="decimal" placeholder="H xGA" class="xg-input xg-input-h-xga">
                                           <input type="text" inputmode="decimal" placeholder="V xG" class="xg-input xg-input-a-xg">
                                           <input type="text" inputmode="decimal" placeholder="V xGA" class="xg-input xg-input-a-xga">
                                        </div>
                                        <div class="manual-xg-grid" style="margin-top: 0.5rem;">
                                           <input type="text" inputmode="decimal" placeholder="H PPG" class="xg-input xg-input-h-ppg" title="Hazai Csapat Points Per Game">
                                           <input type="text" inputmode="decimal" placeholder="V PPG" class="xg-input xg-input-a-ppg" title="Vendég Csapat Points Per Game">
                                        </div>
                                        
                                        <div class="mm-actions" style="margin-top: 20px; display:flex; gap:10px; align-items:center;">
                                            <button class="btn btn-analyze" style="flex:1;"
                                                onclick="runAnalysisFromCard(this, '${escape(fx.home)}', '${escape(fx.away)}', '${escape(fx.utcKickoff)}', '${escape(fx.league || '')}')">
                                                ELEMZÉS ⚡
                                            </button>
                                            <div style="display:flex; align-items:center; justify-content:center;">
                                                <input type="checkbox" class="match-checkbox" data-match-id="${fx.uniqueId}" ${appState.selectedMatches.has(fx.uniqueId) ? 'checked' : ''}>
                                            </div>
                                        </div>
                                    </div>
                                </div>`;
                        });
                });
        }
    });
    container.innerHTML = html || '<div style="text-align:center; padding: 40px; color: var(--text-secondary);">Nincsenek elérhető mérkőzések.</div>';
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
            
            const sortedItems = groupedByDate[dateKey].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            
            html += `
            <div class="history-date-group">
                <h4>${formatDateLabel(dateKey)}</h4>
                <div class="history-grid">`;
                
            sortedItems.forEach((item) => {
                const analysisTime = new Date(item.date); 
                const time = isNaN(analysisTime.getTime()) ? '?' : analysisTime.toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest' });
                const safeItemId = escape(item.id);
                
                const wlp = (item.status || item['Helyes (W/L/P)'])?.toUpperCase(); 
                let resultClass = '';
                let statusText = 'N/A';
                
                if (wlp === 'W') { resultClass = 'result-W'; statusText = 'NYERT'; }
                else if (wlp === 'L') { resultClass = 'result-L'; statusText = 'VESZTETT'; }
                else if (wlp === 'P') { resultClass = 'result-P'; statusText = 'PUSH'; }
                
                const confidenceVal = item.confidence ? `${parseFloat(item.confidence).toFixed(1)}/10` : 'N/A';

                html += `
                    <div class="history-card ${resultClass}" onclick="viewHistoryDetail('${safeItemId}')">
                        <div style="display:flex; justify-content:space-between; color:var(--text-secondary); font-size:0.8rem; margin-bottom:10px;">
                            <span>${item.sport ? item.sport.toUpperCase() : 'SPORT'}</span>
                            <span>⏰ ${time}</span>
                        </div>
                        <div style="text-align:center; font-size:1.1rem; font-weight:bold; margin-bottom:10px;">
                            ${item.home} <span style="color:var(--primary); font-size:0.8em;">vs</span> ${item.away}
                        </div>
                        <div style="background:rgba(0,0,0,0.3); padding:10px; border-radius:8px; text-align:center; margin-bottom:10px; border:1px solid rgba(255,255,255,0.05);">
                            <div style="font-size:0.8rem; color:var(--text-secondary);">Tipp</div>
                            <div style="color:var(--primary); font-weight:bold;">${item.tip || 'N/A'}</div>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.05); padding-top:10px;">
                            <span style="font-size:0.8rem;">Bizalom: <strong>${confidenceVal}</strong></span>
                            <button class="delete-btn-icon" style="background:none; border:none; color:var(--text-muted); cursor:pointer;" onclick="deleteHistoryItem('${safeItemId}'); event.stopPropagation();">
                                🗑️
                            </button>
                        </div>
                    </div>`;
            });
            html += `</div></div>`; 
        });
    return html;
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

// === UI Segédfüggvények ===

function openModal(title, content = '', sizeClass = 'modal-xl') {
    const modalContainer = document.getElementById('modal-container');
    const modalContent = modalContainer.querySelector('.modal-content');
    modalContent.className = 'modal-content'; // Reset
    if (sizeClass) modalContent.classList.add(sizeClass);

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
    // Theme logic preserved but simplifed for new CSS structure
}

function initMultiSelect() {
    // Not strictly needed in new design as buttons are per-card, but keeping logic for compatibility
}

function addCheckboxListeners() {
    const checkboxes = document.querySelectorAll('.match-checkbox');
    checkboxes.forEach(cb => {
        cb.removeEventListener('change', handleCheckboxChange);
        cb.addEventListener('change', handleCheckboxChange);
    });
}

function handleCheckboxChange(event) {
    updateMultiSelectButton();
}

function updateMultiSelectButton() {
    // Placeholder
}

// === HTML Generátorok ===

function escapeHTML(str) {
    if (str == null) return '';
    let tempStr = String(str);
    const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
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
    const keywords = ['gól', 'gólpassz', 'gólok', 'gólszerző', 'lap', 'szöglet', 'xG', 'várható gól', 'hazai', 'vendég', 'sérülés', 'hiányzó', 'eltiltott', 'bíró', 'edző'];
    const allNames = [...teamNames].filter(name => name && name.length > 2).sort((a, b) => b.length - a.length);
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

/**
 * Formázza a részletes indoklásokat olvashatóbbá (v124.0)
 * - Felsorolásokat listává alakít (1., 2., stb.)
 * - Vastag szövegeket (**text**) <strong>-gá alakít
 * - Bekezdéseket <p>-be csomagol
 * - Emotikon karaktereket megtart
 */
function formatDetailedReasoning(text, teamNames = []) {
    if (!text || typeof text !== 'string') return '';
    
    let formatted = String(text);
    
    // Először kulcsszavak kiemelése (ez escape-eli a HTML-t is)
    formatted = _highlightKeywords(formatted, teamNames);
    
    // Számozott listák felismerése (pl: "1. ", "2. ", "3. ")
    // Egysoros számozott elemek
    formatted = formatted.replace(/(\d+\.)\s+\*\*([^:]+):\*\*/g, '<li><strong>$1 $2:</strong> ');
    formatted = formatted.replace(/(\d+\.)\s+([^<\n]+)/g, '<li><strong>$1</strong> $2</li>');
    
    // Ha van <li>, csomagoljuk <ol>-ba
    if (formatted.includes('<li>')) {
        // Összefüggő <li> elemeket egy <ol>-ba
        formatted = formatted.replace(/((?:<li>.*?<\/li>\s*)+)/gs, '<ol class="reasoning-list">$1</ol>');
    }
    
    // Bekezdések (dupla soremelés) -> <p>
    // De előbb csináljunk egysoros sortöréseket <br>-ré
    formatted = formatted.replace(/\n(?!\n)/g, '<br>');
    
    // Dupla soremelések bekezdéssé
    const paragraphs = formatted.split(/\n\n+/);
    if (paragraphs.length > 1 && !formatted.includes('<ol')) {
        formatted = paragraphs.map(p => {
            const trimmed = p.trim();
            if (!trimmed) return '';
            if (trimmed.startsWith('<ol')) return trimmed;
            return `<p>${trimmed}</p>`;
        }).filter(p => p).join('');
    } else if (!formatted.includes('<p>') && !formatted.includes('<ol>')) {
        formatted = `<p>${formatted}</p>`;
    }
    
    // Tisztítás: dupla <p> tagek eltávolítása
    formatted = formatted.replace(/<p>\s*<p>/g, '<p>');
    formatted = formatted.replace(/<\/p>\s*<\/p>/g, '</p>');
    
    return formatted;
}

const processAiList = (list, teamNames = []) => {
    if (!list || !Array.isArray(list) || list.length === 0) {
        return '<li>Nincs adat.</li>';
    }
    return list.map(item => `<li>${_highlightKeywords(item, teamNames)}</li>`).join('');
};

// === ÚJ (v71.0): Modern Lineáris Erőviszony Sáv (Nincs több fekete lyuk) ===
function getProbabilityBarHtml(pHome, pDraw, pAway, sport) {
    const isMoneyline = sport === 'hockey' || sport === 'basketball';
    
    let h = parseFloat(String(pHome)) || 0;
    let d = parseFloat(String(pDraw)) || 0;
    let a = parseFloat(String(pAway)) || 0;
    
    // Normalizálás 100%-ra, ha esetleg eltérne
    const total = h + d + a;
    if (total > 0) {
        h = (h / total) * 100;
        d = (d / total) * 100;
        a = (a / total) * 100;
    }

    // Színkódok (Neon hatás)
    const colorHome = 'var(--success)'; // Hazai (Zöldes)
    const colorDraw = 'var(--text-secondary)'; // Döntetlen (Szürke)
    const colorAway = 'var(--accent)'; // Vendég (Kék)

    let barsHtml = '';
    if (isMoneyline) {
        barsHtml = `
            <div class="prob-bar-segment" style="width: ${h}%; background: ${colorHome}; box-shadow: 0 0 10px ${colorHome};"></div>
            <div class="prob-bar-segment" style="width: ${a}%; background: ${colorAway}; box-shadow: 0 0 10px ${colorAway};"></div>
        `;
    } else {
        barsHtml = `
            <div class="prob-bar-segment" style="width: ${h}%; background: ${colorHome}; box-shadow: 0 0 10px ${colorHome};"></div>
            <div class="prob-bar-segment" style="width: ${d}%; background: ${colorDraw}; opacity: 0.5;"></div>
            <div class="prob-bar-segment" style="width: ${a}%; background: ${colorAway}; box-shadow: 0 0 10px ${colorAway};"></div>
        `;
    }

    return `
    <div class="prob-chart-container">
        <div class="prob-bar-wrapper">
            ${barsHtml}
        </div>
        <div class="prob-legend">
            <div style="color:${colorHome}">Hazai: <strong>${h.toFixed(1)}%</strong></div>
            ${!isMoneyline ? `<div style="color:#ccc">Döntetlen: <strong>${d.toFixed(1)}%</strong></div>` : ''}
            <div style="color:${colorAway}">Vendég: <strong>${a.toFixed(1)}%</strong></div>
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
        'LAPOK': microAnalyses.card_analysis,
        'GYŐZTES (HOKI)': microAnalyses.hockey_winner_analysis,
        'GÓL O/U (HOKI)': microAnalyses.hockey_goals_ou_analysis,
        'GYŐZTES (KOSÁR)': microAnalyses.basketball_winner_analysis,
        'PONTOK O/U (KOSÁR)': microAnalyses.basketball_total_points_analysis
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

function buildAnalysisHtml_CLIENTSIDE(
    fullAnalysisReport, 
    matchData, 
    oddsData, 
    valueBets, 
    confidenceScores,      
    finalConfidenceScore, 
    sim, 
    masterRecommendation,
    matchId,
    dataQualityWarning 
) {
    
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
    
    const modelConf = confidenceScores?.winner?.toFixed(1) || '1.0';
    const expertConfScore = finalConfidenceScore?.toFixed(1) || '1.0';
    
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
                <strong>Kulcs Kockázatok:</strong>
                <ul class="key-insights">
                    ${processAiList(criticReport.key_risks, teamNames)}
                </ul>
                <p style="margin-top: 0.5rem;"><strong>Kockázati Pontszám:</strong> ${criticReport.contradiction_score || '0.0'}</p>
           </div>` : '';
           
        const scoutSummary = fullAnalysisReport.scout?.summary || "Nincs elérhető scout jelentés.";
        const scoutInsights = fullAnalysisReport.scout?.key_insights || [];

        criticReportHtml = (fullAnalysisReport.scout) ?
        `
            <div class="committee-card scout">
                <h4>2. Ügynök: Scout Jelentése</h4>
                <p><strong>Összefoglaló:</strong> ${processAiText(scoutSummary, teamNames)}</p>
                <strong>Kulcs Tényezők:</strong>
                <ul class="key-insights">
                    ${processAiList(scoutInsights, teamNames)}
                </ul>
            </div>` : '';
            
    } else {
        // Fallback ha a struktúra sérült
        prophetText = fullAnalysisReport?.prophetic_timeline || "Hiba: Az elemzési jelentés ('committee') struktúrája ismeretlen.";
        synthesisText = fullAnalysisReport?.strategic_synthesis || "Hiba: Az elemzési jelentés ('committee') struktúrája ismeretlen.";
        expertConfHtml = fullAnalysisReport?.final_confidence_report || `**${expertConfScore}/10** - Ismeretlen adatszerkezet.`;
        microModelsHtml = getMicroAnalysesHtml(fullAnalysisReport?.micromodels, teamNames) || "<p>Hiba: Mikromodellek betöltése sikertelen.</p>";
        quantReportHtml = "<p>Hiba: Quant jelentés betöltése sikertelen.</p>";
        scoutReportHtml = "<p>Hiba: Kritikus jelentés betöltése sikertelen.</p>";
        criticReportHtml = "<p>Hiba: Scout jelentés betöltése sikertelen.</p>"; 
    }

    const finalRec = masterRecommendation || { recommended_bet: "Hiba", final_confidence: 1.0, brief_reasoning: "Hiba" };
    
    // === ÚJ (v124.0): RÉSZLETES TIPP MEGJELENÍTÉS ===
    let tipsHtml = '';

    if (finalRec.primary && finalRec.secondary) {
        // RÉSZLETES DUAL MODE (v124.0)
        const primaryReasonFormatted = formatDetailedReasoning(finalRec.primary.reason || '', teamNames);
        const secondaryReasonFormatted = formatDetailedReasoning(finalRec.secondary.reason || '', teamNames);
        const verdictFormatted = formatDetailedReasoning(finalRec.verdict || '', teamNames);
        
        // Betting Strategy feldolgozása
        let bettingStrategyHtml = '';
        if (finalRec.betting_strategy) {
            const bs = finalRec.betting_strategy;
            bettingStrategyHtml = `
            <div class="betting-strategy-panel">
                <h6>📊 Fogadási Stratégia</h6>
                <div class="strategy-grid">
                    ${bs.stake_recommendation ? `<div class="strategy-item"><span class="label">Tét:</span><span class="value">${escapeHTML(bs.stake_recommendation)}</span></div>` : ''}
                    ${bs.market_timing ? `<div class="strategy-item"><span class="label">Időzítés:</span><span class="value">${escapeHTML(bs.market_timing)}</span></div>` : ''}
                    ${bs.hedge_suggestion && bs.hedge_suggestion !== 'Nincs' ? `<div class="strategy-item"><span class="label">Fedezés:</span><span class="value">${escapeHTML(bs.hedge_suggestion)}</span></div>` : ''}
                </div>
            </div>`;
        }
        
        // Key Risks feldolgozása
        let keyRisksHtml = '';
        if (finalRec.key_risks && Array.isArray(finalRec.key_risks) && finalRec.key_risks.length > 0) {
            keyRisksHtml = `
            <div class="key-risks-panel">
                <h6>⚠️ Fő Kockázatok</h6>
                <ul class="risks-list">
                    ${finalRec.key_risks.map(risk => {
                        // v133.0: Támogatás az új {risk, probability} formátumhoz
                        if (typeof risk === 'object' && risk.risk) {
                            return `<li>${processAiText(risk.risk, teamNames)} <span style="color:var(--danger); font-weight:700; margin-left:5px;">(${risk.probability || 15}% esély)</span></li>`;
                        } else {
                            // Fallback a régi formátumhoz (sima string)
                            return `<li>${processAiText(risk, teamNames)} <span style="color:var(--danger); font-weight:700; margin-left:5px;">(~15% esély)</span></li>`;
                        }
                    }).join('')}
                </ul>
            </div>`;
        }
        
        // Why Not Alternatives feldolgozása
        let alternativesHtml = '';
        if (finalRec.why_not_alternatives && finalRec.why_not_alternatives !== 'Nincs adat') {
            alternativesHtml = `
            <div class="alternatives-panel">
                <h6>🤔 Miért nem más opció?</h6>
                <p>${processAiText(finalRec.why_not_alternatives, teamNames)}</p>
            </div>`;
        }
        
        tipsHtml = `
        <!-- VERDICT - A LÉNYEG (Központi kiemelés) -->
        ${verdictFormatted ? `
        <div class="verdict-highlight">
            <div class="verdict-icon">💡</div>
            <div class="verdict-content">
                <h6>A LÉNYEG</h6>
                <p>${verdictFormatted}</p>
            </div>
        </div>` : ''}

        <!-- KÉT TIPP MEGJELENÍTÉS (Modernizált v124.0) -->
        <div class="tips-container-v124">
            
            <!-- 1. TIPP (BANKER) - Részletes -->
            <div class="tip-card primary-tip">
                <div class="tip-header">
                    <span class="tip-badge primary">👑 FŐ TIPP (BANKER)</span>
                    <span class="tip-confidence primary-conf">${(finalRec.primary.confidence || 0).toFixed(1)}/10</span>
            </div>
                <div class="tip-market">${escapeHTML(finalRec.primary.market)}</div>
                <div class="tip-reasoning">${primaryReasonFormatted}</div>
            </div>
            
            <!-- 2. TIPP (ALTERNATÍV) - Részletes -->
            <div class="tip-card secondary-tip">
                <div class="tip-header">
                    <span class="tip-badge secondary">⚡ ALTERNATÍV OPCIÓ</span>
                    <span class="tip-confidence secondary-conf">${(finalRec.secondary.confidence || 0).toFixed(1)}/10</span>
                </div>
                <div class="tip-market">${escapeHTML(finalRec.secondary.market)}</div>
                <div class="tip-reasoning">${secondaryReasonFormatted}</div>
            </div>
        </div>
        
        <!-- STRATÉGIA, KOCKÁZATOK, ALTERNATÍVÁK -->
        <div class="additional-insights">
            ${bettingStrategyHtml}
            ${keyRisksHtml}
            ${alternativesHtml}
        </div>
        `;
    } else {
        // RÉGI (EGY TIPP) MEGJELENÍTÉS (Fallback)
        const finalReasoningHtml = processAiText(finalRec.brief_reasoning, teamNames);
        tipsHtml = `
            <div class="master-bet"><strong>${escapeHTML(finalRec.recommended_bet)}</strong></div>
            <div class="master-confidence">
                Végső Bizalom: <strong class="glowing-text-white">${(finalRec.final_confidence || 1.0).toFixed(1)}/10</strong>
            </div>
            <div class="master-reasoning">${finalReasoningHtml}</div>
        `;
    }

    const finalConfInterpretationHtml = getConfidenceInterpretationHtml(finalRec.final_confidence, teamNames);
    
    // === Display Data Quality Warning ===
    let warningHtml = '';
    if (dataQualityWarning) {
        warningHtml = `
        <div style="background-color: rgba(255, 165, 0, 0.2); border: 1px solid orange; color: orange; padding: 10px; margin-bottom: 15px; border-radius: 8px; text-align: center;">
            <strong>⚠️ Figyelem:</strong> ${escapeHTML(dataQualityWarning)}
        </div>`;
    }

    const masterRecommendationHtml = `
    <div class="master-recommendation-card">
        ${warningHtml}
        <h5 style="margin-bottom: 20px; text-align: center; font-size: 1.3rem; color: var(--primary); text-transform: uppercase; letter-spacing: 2px; text-shadow: 0 0 15px rgba(255, 215, 0, 0.5);">👑 6. Ügynök: A Főnök Részletes Ajánlása 👑</h5>
        ${tipsHtml}
        ${finalConfInterpretationHtml}
    </div>`;
    
    const prophetCardHtml = `
    <div class="prophet-card">
        <h5><strong>🔮 A Próféta Látomása (Várható Meccskép)</strong></h5>
        <p>${processAiText(prophetText, teamNames)}</p>
    </div>`;
    
    const synthesisCardHtml = `
    <div class="synthesis-card">
        <h5><strong>🧠 Stratégiai Szintézis (A Fő Elemzés)</strong></h5>
        <p>${processAiText(synthesisText, teamNames)}</p>
    </div>`;
    
    const chatHtml = `
    <div class="analysis-accordion" style="margin-top: 1.5rem;">
        <!-- Chat removed from accordion for cleaner layout, it's now below -->
        <div id="chat-content-wrapper"></div>
    </div>`;

    const atAGlanceHtml = `
    <div class="at-a-glance-grid">
        <!-- 1. Kártya: Szimuláció (Új Dizájn) -->
        <div class="summary-card highlight-card">
            <h5>4. Ügynök: Szimuláció</h5>
            ${getProbabilityBarHtml(pHome, pDraw, pAway, matchData.sport)}
        </div>

        <!-- 2. Kártya: xG (Letisztult) -->
        <div class="summary-card">
            <h5>3. Ügynök: Súlyozott xG</h5>
            <div class="xg-value-container">
                <div class="xg-team">
                    <div class="value glowing-text-white">${mu_h}</div>
                    <div class="details" style="font-size:0.75rem; opacity:0.8;">${escapeHTML(matchData.home)}</div>
                </div>
                <div class="xg-separator">vs</div>
                <div class="xg-team">
                    <div class="value glowing-text-white">${mu_a}</div>
                    <div class="details" style="font-size:0.75rem; opacity:0.8;">${escapeHTML(matchData.away)}</div>
                </div>
            </div>
            <div class="details" style="margin-top:10px; border-top:1px solid rgba(255,255,255,0.1); padding-top:5px;">
                Várható eredmény: ${topScore}
            </div>
        </div>

        <!-- 3. Kártya: Piac (Különítve) -->
        <div class="summary-card">
            <h5>Fő Vonal (${mainTotalsLine})</h5>
            <div class="totals-breakdown">
                <div class="total-line">
                    <span class="total-label">Over</span>
                    <strong class="glowing-text-white">${pOver}%</strong>
                </div>
                <div class="total-line">
                    <span class="total-label">Under</span>
                    <strong class="glowing-text-white">${pUnder}%</strong>
                </div>
            </div>
            ${matchData.sport === 'soccer' ? `<div class="details" style="margin-top:8px;">BTTS Igen: <strong class="glowing-text-white">${sim?.pBTTS?.toFixed(1) ?? 'N/A'}%</strong></div>` : ''}
        </div>
    </div>`;
    
    // v133.0: Bizalmi Híd - új formátum a backendről
    const bridgeData = (masterRecommendation || {}).confidence_bridge || null;
    
    const expertConfReasoning = bridgeData 
        ? bridgeData.explanation 
        : processAiText(expertConfHtml.split(' - ')[1] || 'Nincs részletes adat.', teamNames);
    
    const quantConf = bridgeData ? bridgeData.quant_confidence : parseFloat(modelConf);
    const specialistConf = bridgeData ? bridgeData.specialist_confidence : parseFloat(expertConfScore);
    
    const confidenceBridgeHtml = `
    <div class="confidence-bridge-card">
        <h5>🌉 Bizalmi Híd (Quant vs. Specialist)</h5>
        <div class="confidence-bridge-values">
            ${getGaugeHtml(quantConf, "Quant")}
            <div class="arrow">→</div>
            ${getGaugeHtml(specialistConf,"Specialist")}
        </div>
        <div class="confidence-bridge-reasoning">${expertConfReasoning}</div>
        ${bridgeData ? `<div style="text-align:center; margin-top:10px; font-size:0.85rem; color:var(--text-muted);">Gap: ${bridgeData.gap.toFixed(1)} pont</div>` : ''}
    </div>`;

    let marketCardsHtml = '';
    (valueBets || []).forEach(bet => {
        // Pozitív érték ellenőrzése a zöld kerethez
        const isPositive = bet.value && bet.value.includes('+');
        const valueClass = isPositive ? 'positive-value' : '';
        
        marketCardsHtml += `
        <div class="market-card ${valueClass}">
            <div class="mc-header">${escapeHTML(bet.market)}</div>
            <div class="mc-odds">${bet.odds}</div>
            <div class="mc-footer">
                <div class="mc-probability">Becsült: ${bet.probability}</div>
                <div class="mc-value-badge">${bet.value}</div>
            </div>
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
    
    // MÓDOSÍTÁS: A "Piaci Mikromodellek" átnevezése "Egyéb Piacok"-ra, hogy egyértelműbb legyen
    const sidebarAccordionHtml = `
    <div class="sidebar-accordion">
        <details>
            <summary>Egyéb Piacok (Szöglet, Lap, Gólok)</summary>
            <div class="accordion-content micromodel-grid">
                ${microModelsHtml}
            </div>
        </details>
        ${(quantReportHtml || scoutReportHtml || criticReportHtml) ? `
        <details open>
            <summary>Részletes Bizottsági Jelentések</summary>
            <div class="accordion-content committee-reports">
                ${quantReportHtml}
                ${criticReportHtml} 
                ${scoutReportHtml} 
            </div>
        </details>` : ''}
    </div>`;
    
    // === v133.2: TAB NAVIGÁCIÓ (4 FÜL) ===
    const tabNavigationHtml = `
    <div class="analysis-tabs">
        <div class="tab-buttons">
            <button class="tab-btn active" data-tab="tab-1">📊 Összefoglaló</button>
            <button class="tab-btn" data-tab="tab-2">🔮 Próféta & Szintézis</button>
            <button class="tab-btn" data-tab="tab-3">📋 Részletes Elemzés</button>
            <button class="tab-btn" data-tab="tab-4">💬 AI Chat</button>
        </div>
        
        <div class="tab-content">
            <!-- 1. FÜL: BANKER/ÖSSZEFOGLALÓ -->
            <div class="tab-pane active" id="tab-1">
                ${atAGlanceHtml}
                ${confidenceBridgeHtml}
                ${masterRecommendationHtml}
            </div>
            
            <!-- 2. FÜL: PRÓFÉTA & SZINTÉZIS -->
            <div class="tab-pane" id="tab-2">
                ${prophetCardHtml}
                ${synthesisCardHtml}
            </div>
            
            <!-- 3. FÜL: RÉSZLETES ELEMZÉS -->
            <div class="tab-pane" id="tab-3">
                ${marketSectionHtml}
                ${sidebarAccordionHtml}
            </div>
            
            <!-- 4. FÜL: AI CHAT -->
            <div class="tab-pane" id="tab-4">
                ${chatHtml}
        </div>
        </div>
    </div>`;
    
    return tabNavigationHtml;
}

function initializeApp() {
    setupThemeSwitcher();
    document.getElementById('loadFixturesBtn')?.addEventListener('click', loadFixtures);
    document.getElementById('historyBtn')?.addEventListener('click', openHistoryModal);
    document.getElementById('manualBtn')?.addEventListener('click', openManualAnalysisModal);
    initMultiSelect();
    
    // Use a shorter status text
    const userInfo = document.getElementById('userInfo');
    if (userInfo) userInfo.textContent = `Online`;
    
    appState.sheetUrl = localStorage.getItem('sheetUrl') || ''; 
    appState.rosterCache.clear();
    appState.p1SelectedAbsentees.clear(); 

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

document.addEventListener('DOMContentLoaded', () => {
    setupLoginProtection(); 
});
