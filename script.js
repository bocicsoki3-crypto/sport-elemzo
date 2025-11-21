// --- script.js (v71.0 - Redesigned History & Details Fix) ---

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
    rosterCache: new Map(),
    // Map<matchId, { home: { name: string, pos: string }[], away: { name: string, pos: string }[] }>
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
    appState.rosterCache.clear(); 
    appState.p1SelectedAbsentees.clear(); 
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
        addP1ModalButtonListeners();
        
        (document.getElementById('userInfo')).textContent = `Csatlakozva`;
        (document.getElementById('placeholder')).style.display = 'none';
    
    } catch (e) {
        showToast(`Hiba a meccsek betöltésekor: ${e.message}`, 'error');
        (document.getElementById('userInfo')).textContent = `Hiba`;
        (document.getElementById('placeholder')).style.display = 'flex'; 
        (document.getElementById('kanban-board')).innerHTML = '';
        (document.getElementById('mobile-list-container')).innerHTML = '';
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

    if (matchId && appState.p1SelectedAbsentees.has(matchId)) {
        const manualAbsentees = appState.p1SelectedAbsentees.get(matchId);
        if (manualAbsentees.home.length > 0 || manualAbsentees.away.length > 0) {
            (manualXgData).manual_absentees = manualAbsentees;
            console.log('Manuális (P1) Hiányzókat (objektumokkal) küldök az appState-ből:', manualAbsentees);
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
        const { analysisData, debugInfo } = data;

        if (analysisData.availableRosters) {
            appState.rosterCache.set(matchId, analysisData.availableRosters);
        }
        
        const finalHtml = buildAnalysisHtml_CLIENTSIDE(
            analysisData.committee,
            analysisData.matchData,
            analysisData.oddsData,
            analysisData.valueBets,
            analysisData.confidenceScores, 
            analysisData.finalConfidenceScore, 
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

                // === JAVÍTÁS (v70.0): Robusztusabb adatkinyerés és Committee fallback ===
                // Ha a 'committee' objektum hiányos (mert a mentéskor karcsúsítva lett),
                // megpróbálunk fallback értékeket adni, hogy ne omoljon össze a renderelés.
                const safeCommittee = analysisData.committee || {};
                
                // Ha hiányzik a 'quant', 'scout' stb., kitöltjük üres objektummal vagy "N/A" szöveggel
                if (!safeCommittee.quant) safeCommittee.quant = { source: "N/A", mu_h: 0, mu_a: 0 };
                
                // A 'scout' és 'critic' sokszor hiányozhat a korábbi mentésekből.
                // Ezeket a megjelenítőben kezeljük le (processAiText), de itt is biztosítjuk a létüket.
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
                    analysisData.availableRosters || { home: [], away: [] },
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

        addP1ModalButtonListeners('#modal-container');

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

async function runMultiAnalysis() {
    // ... (Ez a funkció változatlan maradhat, de a biztonság kedvéért benne hagyom a teljes kódot)
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
        
        const card = document.querySelector(`.selectable-card[data-match-id="${match.uniqueId}"], .selectable-item[data-match-id="${match.uniqueId}"], .mobile-match-card[data-match-id="${match.uniqueId}"]`);
        let manualXgData = {};
        
        if (card) {
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
            ...manualXg 
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
    return new Date('invalid date');
};

function handleSportChange() {
    appState.currentSport = (document.getElementById('sportSelector')).value;
    appState.selectedMatches.clear(); 
    appState.rosterCache.clear();
    appState.p1SelectedAbsentees.clear(); 
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
        
        <h5 style="margin-top: 2rem; margin-bottom: 1rem; color: var(--primary);">Opcionális P1 xG Felülbírálás (4-Komponensű)</h5>
        <div class="manual-xg-grid" style="margin-top: 0.5rem;">
            <input type="text" inputmode="decimal" placeholder="H xG" class="xg-input" id="manual-h-xg" title="Hazai Csapat (Home) xG/90">
            <input type="text" inputmode="decimal" placeholder="H xGA" class="xg-input" id="manual-h-xga" title="Hazai Csapat (Home) xGA/90">
            <input type="text" inputmode="decimal" placeholder="V xG" class="xg-input" id="manual-a-xg" title="Vendég Csapat (Away) xG/90">
            <input type="text" inputmode="decimal" placeholder="V xGA" class="xg-input" id="manual-a-xga" title="Vendég Csapat (Away) xGA/90">
        </div>

        <h5 style="margin-top: 1.5rem; margin-bottom: 1rem; color: var(--primary);">Opcionális P1 Hiányzó Felülbírálás</h5>
        <div class="control-group" style="margin-top: 0.5rem;">
            <label for="manual-abs-home">Hazai kulcshiányzók (Név (Pos), ...)</label>
            <input id="manual-abs-home" class="xg-input" style="text-align: left;" placeholder="Pl: Neuer (G), Kimmich (D)"/>
        </div>
        <div class="control-group" style="margin-top: 0.5rem;">
            <label for="manual-abs-away">Vendég kulcshiányzók (Név (Pos), ...)</label>
            <input id="manual-abs-away" class="xg-input" style="text-align: left;" placeholder="Pl: Gavi (M), Lewandowski (F)"/>
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
        } else {
            showToast('Manuális Komponens xG: Érvénytelen számformátum. Az xG felülbírálás kihagyva.', 'error');
        }
    }
    
    const manualAbsentees = {
        home: parseManualAbsentees(Abs_H_raw),
        away: parseManualAbsentees(Abs_A_raw)
    };

    if (manualAbsentees.home.length > 0 || manualAbsentees.away.length > 0) {
        (manualXgData).manual_absentees = manualAbsentees;
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
                    columnContent += `<div style="padding: 10px 0; color: var(--primary); font-size: 0.85rem; font-weight: 700; letter-spacing: 1px; text-align: center; position:sticky; top:0; background: var(--glass-bg); z-index:5; border-bottom:1px solid var(--glass-border); margin-bottom:10px;">${formatDateLabel(dateKey)}</div>`;
                    
                    groupedByDate[dateKey]
                        .sort((a, b) => new Date(a.utcKickoff).getTime() - new Date(b.utcKickoff).getTime())
                        .forEach((fx) => { 
                            const time = new Date(fx.utcKickoff).toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' });
                            
                            const p1State = appState.p1SelectedAbsentees.get(fx.uniqueId) || { home: [], away: [] };
                            const p1Count = p1State.home.length + p1State.away.length;
                            
                            const rosterButtonHtml = `
                                <button class="btn-p1-absentees" data-match-id="${fx.uniqueId}" 
                                    data-home="${escape(fx.home)}" 
                                    data-away="${escape(fx.away)}" 
                                    data-league="${escape(fx.league || '')}" 
                                    data-kickoff="${escape(fx.utcKickoff)}">
                                    👥 P1 Hiányzók (${p1Count})
                                </button>`;

                            columnContent += `
                                <div class="match-card selectable-card ${appState.selectedMatches.has(fx.uniqueId) ? 'selected' : ''}" data-match-id="${fx.uniqueId}">
                                    <div style="position:absolute; top:10px; right:10px;">
                                        <input type="checkbox" class="match-checkbox" data-match-id="${fx.uniqueId}" ${appState.selectedMatches.has(fx.uniqueId) ? 'checked' : ''}>
                                    </div>
                                    
                                    <div class="match-card-meta" style="margin-bottom:8px;">
                                        <span>${fx.league || 'Liga'}</span> • <span style="color:var(--primary)">${time}</span>
                                    </div>
                                    
                                    <div class="match-card-teams" style="font-size: 1.1rem; margin-bottom: 15px;">
                                        <div style="margin-bottom:4px;">${fx.home}</div>
                                        <div style="color:var(--text-secondary); font-size:0.8em;">vs</div>
                                        <div style="margin-top:4px;">${fx.away}</div>
                                    </div>
                                    
                                    <div class="manual-xg-grid">
                                        <input type="text" inputmode="decimal" placeholder="H xG" class="xg-input xg-input-h-xg">
                                        <input type="text" inputmode="decimal" placeholder="H xGA" class="xg-input xg-input-h-xga">
                                        <input type="text" inputmode="decimal" placeholder="V xG" class="xg-input xg-input-a-xg">
                                        <input type="text" inputmode="decimal" placeholder="V xGA" class="xg-input xg-input-a-xga">
                                    </div>
                                    
                                    ${(appState.currentSport === 'soccer') ? rosterButtonHtml : ''}
                                    
                                    <button class="btn btn-primary" 
                                        style="width: 100%; margin-top: 15px;"
                                        onclick="runAnalysisFromCard(this, '${escape(fx.home)}', '${escape(fx.away)}', '${escape(fx.utcKickoff)}', '${escape(fx.league || '')}')">
                                        ELEMZÉS INDÍTÁSA
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
    container.innerHTML = '';
    
    const groupOrder = ['Top Ligák', 'Kiemelt Bajnokságok', 'Figyelmet Érdemlő', 'Egyéb Meccsek'];
    const groupedByCategory = groupBy(fixtures, (fx) => getLeagueGroup(fx.league));
    
    let html = '';
    groupOrder.forEach(group => { 
        if (groupedByCategory[group]) { 
            html += `<div style="margin: 20px 0 10px 0; color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; padding-left: 5px; border-left: 3px solid var(--primary);">${group}</div>`;
            
            const groupedByDate = groupBy(groupedByCategory[group], (fx) => {
                try { return new Date(fx.utcKickoff).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }); }
                 catch (e) { return 'Ismeretlen dátum'; }
            });
            
            Object.keys(groupedByDate)
                .sort((a, b) => parseHungarianDate(a).getTime() - parseHungarianDate(b).getTime()) 
                .forEach(dateKey => {
                    html += `<div class="mobile-date-header"><span>${formatDateLabel(dateKey)}</span></div>`; 
                
                    groupedByDate[dateKey]
                         .sort((a, b) => new Date(a.utcKickoff).getTime() - new Date(b.utcKickoff).getTime())
                        .forEach((fx) => { 
                            const time = new Date(fx.utcKickoff).toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' });
                            
                            const p1State = appState.p1SelectedAbsentees.get(fx.uniqueId) || { home: [], away: [] };
                            const p1Count = p1State.home.length + p1State.away.length;
                            
                            const rosterButtonHtml = `
                                <button class="btn-p1-absentees" data-match-id="${fx.uniqueId}" 
                                    data-home="${escape(fx.home)}" 
                                    data-away="${escape(fx.away)}" 
                                    data-league="${escape(fx.league || '')}" 
                                    data-kickoff="${escape(fx.utcKickoff)}">
                                    👥 P1 Hiányzók (${p1Count})
                                </button>`;

                            html += `
                                <div class="mobile-match-card selectable-item ${appState.selectedMatches.has(fx.uniqueId) ? 'selected' : ''}" data-match-id="${fx.uniqueId}">
                                    <div class="mm-header">
                                        <div class="mm-league">${fx.league || 'Liga'}</div>
                                        <div class="mm-time">${time}</div>
                                    </div>
                                    <div class="mm-body">
                                        <div class="mm-teams">
                                            <span>${fx.home}</span>
                                            <span style="color:var(--text-secondary); font-size:0.9em;">vs</span>
                                            <span>${fx.away}</span>
                                        </div>
                                        
                                        <div class="manual-xg-grid" style="margin-top: 10px;">
                                           <input type="text" inputmode="decimal" placeholder="H xG" class="xg-input xg-input-h-xg">
                                           <input type="text" inputmode="decimal" placeholder="H xGA" class="xg-input xg-input-h-xga">
                                           <input type="text" inputmode="decimal" placeholder="V xG" class="xg-input xg-input-a-xg">
                                           <input type="text" inputmode="decimal" placeholder="V xGA" class="xg-input xg-input-a-xga">
                                        </div>
                                        
                                        ${(appState.currentSport === 'soccer') ? rosterButtonHtml : ''}
                                        
                                        <div class="mm-actions">
                                            <button class="btn btn-primary" style="width:100%"
                                                onclick="runAnalysisFromCard(this, '${escape(fx.home)}', '${escape(fx.away)}', '${escape(fx.utcKickoff)}', '${escape(fx.league || '')}')">
                                                ELEMZÉS ⚡
                                            </button>
                                            <div class="mm-checkbox-wrapper">
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

// === JAVÍTÁS (v70.0): Modern Grid Layout az Előzményeknek ===
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
                const time = isNaN(analysisTime.getTime()) ? '?' : analysisTime.toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' });
                const safeItemId = escape(item.id);
                
                const wlp = (item.status || item['Helyes (W/L/P)'])?.toUpperCase(); // Ha van WLP státusz
                let statusClass = 'status-NA';
                let statusText = 'N/A';
                let resultClass = '';
                
                if (wlp === 'W') { statusClass = 'status-W'; statusText = 'NYERT'; resultClass = 'result-W'; }
                else if (wlp === 'L') { statusClass = 'status-L'; statusText = 'VESZTETT'; resultClass = 'result-L'; }
                else if (wlp === 'P') { statusClass = 'status-P'; statusText = 'PUSH'; resultClass = 'result-P'; }
                
                const confidenceVal = item.confidence ? `${parseFloat(item.confidence).toFixed(1)}/10` : 'N/A';

                html += `
                    <div class="history-card ${resultClass}" onclick="viewHistoryDetail('${safeItemId}')">
                        <div class="hc-header">
                            <span>${item.sport ? item.sport.toUpperCase() : 'SPORT'}</span>
                            <span>⏰ ${time}</span>
                        </div>
                        <div class="hc-teams">
                            <div>${item.home || '?'}</div>
                            <div style="font-size:0.8em; color:var(--text-muted); font-weight:400;">vs</div>
                            <div>${item.away || '?'}</div>
                        </div>
                        <div class="hc-tip">
                            <strong>Tipp:</strong> ${item.tip || 'N/A'}
                        </div>
                        <div class="hc-footer">
                            <span class="status-badge ${statusClass}">${statusText}</span>
                            <span style="font-size:0.85rem; color:var(--text-secondary);">Bizalom: <strong style="color:#fff;">${confidenceVal}</strong></span>
                            <button class="delete-btn-icon" onclick="deleteHistoryItem('${safeItemId}'); event.stopPropagation();" title="Törlés">
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
    // Reset classes
    modalContent.className = 'modal-content glass-panel';
    // Add specific size class if needed via JS, though CSS handles responsive mainly
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
    const themeSwitcher = document.getElementById('theme-switcher');
    // Currently only dark theme is fully styled in new CSS, but keeping placeholder
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

function addP1ModalButtonListeners(scopeSelector = '') {
    const scope = scopeSelector ? document.querySelector(scopeSelector) : document;
    if (!scope) return;
    
    const buttons = scope.querySelectorAll('.btn-p1-absentees');
    buttons.forEach(btn => {
        btn.removeEventListener('click', openP1AbsenteesModal);
        btn.addEventListener('click', openP1AbsenteesModal);
    });
}

async function openP1AbsenteesModal(event) {
    const button = event.currentTarget;
    const matchId = button.dataset.matchId;
    
    if (!matchId) {
        showToast("Hiba: A meccs azonosítója (matchId) hiányzik a gomb adatattribútumából.", "error");
        return;
    }

    const { home, away, league, kickoff } = button.dataset;
    const homeName = unescape(home);
    const awayName = unescape(away);

    const title = `P1 Hiányzók: ${homeName} vs ${awayName}`;
    const loadingHTML = (document.getElementById('loading-skeleton')).outerHTML;
    openModal(title, loadingHTML, 'modal-lg');
    (document.querySelector('#modal-container #loading-skeleton')).classList.add('active');

    await _getAndRenderRosterModalHtml(matchId, homeName, awayName, unescape(league), unescape(kickoff));
}

async function _getAndRenderRosterModalHtml(matchId, homeName, awayName, leagueName, utcKickoff) {
    const modalBody = document.getElementById('modal-body');
    if (!modalBody) return;

    try {
        let rosters = appState.rosterCache.get(matchId);
        
        if (!rosters) {
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
        }

        const modalHtml = _buildRosterModalHtml(matchId, homeName, awayName, rosters);
        
        const currentSearch = (modalBody.querySelector('#p1-search-input'))?.value || '';
        
        modalBody.innerHTML = modalHtml;

        const searchInput = modalBody.querySelector('#p1-search-input');
        if (searchInput) {
            searchInput.value = currentSearch;
            if (currentSearch) {
                handleP1Search({ target: searchInput });
            }
            searchInput.addEventListener('keyup', handleP1Search);
        }

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

function _buildRosterModalHtml(matchId, homeName, awayName, availableRosters) {
    const p1State = appState.p1SelectedAbsentees.get(matchId) || { home: [], away: [] };
    const absentHomeNames = new Set(p1State.home.map(p => p.name));
    const absentAwayNames = new Set(p1State.away.map(p => p.name));

    const allHomePlayers = availableRosters?.home || [];
    const allAwayPlayers = availableRosters?.away || [];

    const availableHome = allHomePlayers.filter(p => !absentHomeNames.has(p.name));
    const availableAway = allAwayPlayers.filter(p => !absentAwayNames.has(p.name));
    
    const absentHome = p1State.home;
    const absentAway = p1State.away;

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
                    return `
                    <div class="player-card" 
                         draggable="true"
                         data-match-id="${matchId}"
                         data-player-name="${playerName}"
                         data-player-pos="${playerPos}" 
                         data-column="${columnType}"
                         data-team="${columnType.includes('home') ? 'home' : 'away'}">
                        ${playerName}
                        <span class="player-pos-badge pos-${playerPos.replace('/', '\\/')}">${playerPos}</span>
                    </div>`;
                }).join('');
                html += `</div>`;
            }
        });
        return html;
    };
    
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

function handleP1Search(event) {
    const searchTerm = event.target.value.toLowerCase();
    const modalBody = event.target.closest('.modal-body');
    if (!modalBody) return;
    
    modalBody.querySelectorAll('.player-card').forEach(card => {
        const playerName = card.dataset.playerName.toLowerCase();
        const playerPos = (card.dataset.playerPos || 'N/A').toLowerCase();
        
        if (playerName.includes(searchTerm) || playerPos.includes(searchTerm)) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}

function handleP1DragStart(event) {
    const target = event.target.closest('.player-card'); 
    if (!target) return;
    
    target.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', target.dataset.playerName);
    event.dataTransfer.setData('source-column', target.dataset.column);
    event.dataTransfer.setData('match-id', target.dataset.matchId);
    event.dataTransfer.setData('player-pos', target.dataset.playerPos);
}

function handleP1DragOver(event) {
    event.preventDefault();
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

async function handleP1Drop(event) {
    event.preventDefault();
    const column = event.target.closest('.kanban-column');
    if (!column) return;
    
    column.classList.remove('drag-over');
    const draggingCard = document.querySelector('.player-card.dragging');
    if (draggingCard) {
        draggingCard.classList.remove('dragging');
    }

    const playerName = event.dataTransfer.getData('text/plain');
    const sourceColumn = event.dataTransfer.getData('source-column');
    const matchId = event.dataTransfer.getData('match-id');
    const playerPos = event.dataTransfer.getData('player-pos') || 'N/A';
    const targetColumn = column.dataset.column;

    if (!playerName || !sourceColumn || !matchId || !targetColumn) {
        console.error("Drag-and-Drop hiba: Hiányzó adatok.");
        return;
    }
    
    if (sourceColumn === targetColumn) {
        return;
    }

    if (!appState.p1SelectedAbsentees.has(matchId)) {
        appState.p1SelectedAbsentees.set(matchId, { home: [], away: [] });
    }
    const p1State = appState.p1SelectedAbsentees.get(matchId);
    const playerObject = { name: playerName, pos: playerPos };

    if (sourceColumn === 'absent-home') {
        p1State.home = p1State.home.filter(p => p.name !== playerName);
    } else if (sourceColumn === 'absent-away') {
        p1State.away = p1State.away.filter(p => p.name !== playerName);
    }
    
    if (targetColumn === 'absent-home') {
        if (!p1State.home.find(p => p.name === playerName)) { 
            p1State.home.push(playerObject);
        }
    } else if (targetColumn === 'absent-away') {
        if (!p1State.away.find(p => p.name === playerName)) { 
            p1State.away.push(playerObject);
        }
    }
    
    const modal = document.getElementById('modal-container');
    const h5Home = modal.querySelector('.kanban-column[data-column="absent-home"] h5');
    const h5Away = modal.querySelector('.kanban-column[data-column="absent-away"] h5');
    
    const homeName = h5Home ? h5Home.textContent.replace(' HIÁNYZÓK', '') : 'Hazai';
    const awayName = h5Away ? h5Away.textContent.replace(' HIÁNYZÓK', '') : 'Vendég';

    await _getAndRenderRosterModalHtml(
        matchId, 
        homeName, 
        awayName, 
        "", 
        ""
    );

    _updateP1ButtonCount(matchId);
}

function _updateP1ButtonCount(matchId) {
    const p1State = appState.p1SelectedAbsentees.get(matchId) || { home: [], away: [] };
    const p1Count = p1State.home.length + p1State.away.length;

    document.querySelectorAll(`.btn-p1-absentees[data-match-id="${matchId}"]`).forEach(btn => {
        const originalText = btn.innerText.split('(')[0].trim();
        btn.innerHTML = `${originalText} (${p1Count})`;
    });
}

function handleCheckboxChange(event) {
    // Logic preserved for potential multi-select use cases
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

function _buildRosterSelectorHtml(availableRosters, matchId, homeName, awayName) {
    const p1State = appState.p1SelectedAbsentees.get(matchId) || { home: [], away: [] };
    const p1Count = p1State.home.length + p1State.away.length;

    const rosterButtonHtml = `
        <button class="btn-p1-absentees" data-match-id="${matchId}" 
            data-home="${escape(homeName)}" 
            data-away="${escape(awayName)}" 
            data-league="" 
            data-kickoff="">
            👥 P1 Hiányzók (${p1Count})
        </button>`;

    return `
    <div class="sidebar-accordion" style="margin-top: 1.5rem;">
        <div class="accordion-content">
            ${rosterButtonHtml}
            <p class="muted" style="font-size: 0.8rem; text-align: center; margin-top: 0.5rem;">A P1 hiányzók felülbírálják az automatikus (Sofascore/API) adatokat.</p>
        </div>
    </div>`;
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
    availableRosters, 
    matchId 
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
           
        // JAVÍTÁS: Biztosítjuk, hogy a scout mező létezzen vagy fallback
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
    
    const p1AbsenteesHtml = (matchData.sport === 'soccer' && matchId) ? 
        _buildRosterSelectorHtml(availableRosters, matchId, matchData.home, matchData.away) 
        : '';
        
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
