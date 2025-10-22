// --- ALKALMAZÁS ÁLLAPOT (MÓDOSÍTVA) ---
const appState = {
    // !!! KRITIKUS: Ez most már a Node.js szervered címe !!!
    gasUrl: 'http://localhost:3000', // Fejlesztés közben a laptopod címe
    // gasUrl: 'https://king-ai-backend.onrender.com', // Később, ha feltöltjük Renderre
    fixtures: [],
    currentSport: 'soccer',
    sheetUrl: '', // Ezt a backend most már a .env-ből olvassa, de a frontend még küldheti
    currentAnalysisContext: '',
    chatHistory: [],
    selectedMatches: new Set()
};

// --- LIGA KATEGÓRIÁK (VÁLTOZATLAN) ---
const LEAGUE_CATEGORIES = {
    soccer: {
        'Top Ligák': [ 'Champions League', 'Premier League', 'Bundesliga', 'LaLiga', 'Serie A' ],
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

    // Ellenőrzés (már nem a gasUrl-t ellenőrizzük, csak kiírjuk)
    document.getElementById('userInfo').textContent = `Csatlakozva a szerverhez...`;

    // A 'sheetUrl' beolvasása (bár a backend már nem feltétlenül használja)
    appState.sheetUrl = localStorage.getItem('sheetUrl');

    const toastContainer = document.createElement('div');
    toastContainer.id = 'toast-notification-container';
    toastContainer.className = 'toast-notification-container';
    document.body.appendChild(toastContainer);
});

// --- FŐ FUNKCIÓK ---

// === MÓDOSÍTVA: Hívás az új '/getFixtures' végpontra ===
async function loadFixtures() {
    const loadBtn = document.getElementById('loadFixturesBtn');
    loadBtn.disabled = true;
    loadBtn.textContent = 'Betöltés...';
    appState.selectedMatches.clear();
    updateMultiSelectButton();

    try {
        // A hívás most már a Node.js szerver /getFixtures végpontjára mutat
        const response = await fetch(`${appState.gasUrl}/getFixtures?sport=${appState.currentSport}&days=2`);
        
        // Hibakezelés
        if (!response.ok) {
            // Próbáljuk meg kiolvasni a szerver JSON hibaüzenetét
            try {
                const errorData = await response.json();
                throw new Error(`Szerver hiba (${response.status}): ${errorData.error || response.statusText}`);
            } catch (jsonError) {
                // Ha a válasz nem JSON, akkor általános hiba
                throw new Error(`Hálózati hiba: ${response.status} ${response.statusText}`);
            }
        }
        
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        // Adjunk egyedi ID-t minden meccshez
        appState.fixtures = (data.fixtures || []).map((fx, index) => ({
            ...fx,
            uniqueId: `${appState.currentSport}_${fx.home.toLowerCase().replace(/\s+/g, '')}_${fx.away.toLowerCase().replace(/\s+/g, '')}`
        }));
        
        // A nyitó oddsokat a sessionStorage-be mentjük, ahogy a régi kód tette
        sessionStorage.setItem('openingOdds', JSON.stringify(data.odds || {}));

        if (isMobile()) {
            renderFixturesForMobileList(appState.fixtures);
        } else {
            renderFixturesForDesktop(appState.fixtures);
        }
        addCheckboxListeners();
        document.getElementById('userInfo').textContent = `Csatlakozva (Meccsek betöltve)`;
    } catch (e) {
        showToast(`Hiba a meccsek betöltésekor: ${e.message}`, 'error');
        document.getElementById('userInfo').textContent = `Hiba a csatlakozáskor`;
        console.error(e);
    } finally {
        loadBtn.disabled = false;
        loadBtn.textContent = 'Meccsek Betöltése';
    }
}

// === MÓDOSÍTVA: Hívás az új '/runAnalysis' végpontra (POST, application/json) ===
async function runAnalysis(home, away, forceNew = false) {
    home = unescape(home);
    away = unescape(away);

    if (isMobile() && forceNew) { // Csak akkor jelezzen mobilon, ha új elemzés indul
        showToast("Elemzés folyamatban... Ez hosszabb időt vehet igénybe.", 'info', 6000);
    }

    openModal(`${home} vs ${away}`, document.getElementById('common-elements').innerHTML, 'modal-xl');
    const modalSkeleton = document.querySelector('#modal-container #loading-skeleton');
    const modalResults = document.querySelector('#modal-container #analysis-results');
    const modalChat = document.querySelector('#modal-container #chat-container');

    modalResults.innerHTML = '';
    modalChat.style.display = 'none';
    modalSkeleton.classList.add('active');

    modalChat.querySelector('#chat-send-btn').onclick = sendChatMessage;
    modalChat.querySelector('#chat-input').onkeyup = (e) => e.key === "Enter" && sendChatMessage();

    try {
        // A query paraméterek maradnak
        let analysisUrl = `${appState.gasUrl}/runAnalysis?home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}&sport=${appState.currentSport}&force=${forceNew}&sheetUrl=${encodeURIComponent(appState.sheetUrl)}`;
        
        const openingOdds = sessionStorage.getItem('openingOdds') || '{}';

        // A fetch hívás MÓDOSUL:
        const response = await fetch(analysisUrl, {
            method: 'POST', // POST metódus
            headers: {
                'Content-Type': 'application/json' // A tartalom típusa JSON
            },
            // A body-ba küldjük az openingOdds-ot JSON stringként
            body: JSON.stringify({ openingOdds: JSON.parse(openingOdds) })
        });
        
        if (!response.ok) {
            try {
                const errorData = await response.json();
                throw new Error(`Szerver hiba (${response.status}): ${errorData.error || response.statusText}`);
            } catch (jsonError) {
                throw new Error(`Hálózati hiba: ${response.status} ${response.statusText}`);
            }
        }
        
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        appState.currentAnalysisContext = data.html; // Feltételezzük, hogy a válasz { html: "..." }
        appState.chatHistory = [];

        modalResults.innerHTML = `<div class="analysis-body">${data.html}</div>`;
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
        // Még mindig bekérhetjük, bár a szerver már a .env-ből is tudhatja
        const url = prompt("Kérlek, add meg a Google Táblázat URL-jét (opcionális, a szerver is tárolhatja):", "");
        if (url && url.startsWith('https://docs.google.com/spreadsheets/d/')) {
            appState.sheetUrl = url;
            localStorage.setItem('sheetUrl', url);
        } else if(url) {
            showToast('Érvénytelen URL.', 'error');
            // Nem állunk meg, hátha a szerver tudja a címet
        }
    }
    
    const modalSize = isMobile() ? 'modal-fullscreen' : 'modal-lg';
    const loadingHTML = document.getElementById('loading-skeleton').outerHTML;
    openModal('Előzmények', loadingHTML, modalSize);
    document.querySelector('#modal-container #loading-skeleton').classList.add('active'); // Activate skeleton

    try {
        // A hívás most már a Node.js szerver /getHistory végpontjára mutat
        const response = await fetch(`${appState.gasUrl}/getHistory`);
        
        if (!response.ok) {
            try {
                const errorData = await response.json();
                throw new Error(`Szerver hiba (${response.status}): ${errorData.error || response.statusText}`);
            } catch (jsonError) {
                throw new Error(`Hálózati hiba: ${response.status} ${response.statusText}`);
            }
        }
        
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        
        document.getElementById('modal-body').innerHTML = renderHistory(data.history);
    } catch (e) {
        document.getElementById('modal-body').innerHTML = `<p class="muted" style="color:var(--danger); text-align:center; padding: 2rem;">Hiba: ${e.message}</p>`;
        console.error(e);
    }
}

// === MÓDOSÍTVA: Hívás az új '/deleteHistoryItem' végpontra (POST, application/json) ===
async function deleteHistoryItem(id) {
    if (!confirm("Biztosan törölni szeretnéd ezt az elemet a naplóból?")) return;
    try {
        // A hívás most már a Node.js szerver /deleteHistoryItem végpontjára mutat
        const response = await fetch(`${appState.gasUrl}/deleteHistoryItem`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json' // JSON-t küldünk
            },
            // A body-ban küldjük az ID-t
            body: JSON.stringify({ id: id })
        });

        if (!response.ok) {
             try {
                const errorData = await response.json();
                throw new Error(`Szerver hiba (${response.status}): ${errorData.error || response.statusText}`);
            } catch (jsonError) {
                throw new Error(`Hálózati hiba: ${response.status} ${response.statusText}`);
            }
        }
        
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        showToast('Elem sikeresen törölve.', 'success');
        openHistoryModal(); // Újratöltjük az előzményeket
    } catch (e) {
        showToast(`Hiba a törlés során: ${e.message}`, 'error');
        console.error(e);
    }
}


// === MÓDOSÍTVA: Hívás az új '/runFinalCheck' végpontra (POST, application/json) ===
async function runFinalCheck(home, away, sport) {
    const btn = event.target;
    btn.disabled = true;
    btn.innerHTML = '...';

    openModal('Végső Elme-Ellenőrzés', document.getElementById('loading-skeleton').outerHTML, 'modal-sm');
    document.querySelector('#modal-container #loading-skeleton').classList.add('active');

    try {
        const openingOdds = JSON.parse(sessionStorage.getItem('openingOdds') || '{}');
        
        // Hívás az új végpontra
        const response = await fetch(`${appState.gasUrl}/runFinalCheck`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                sport, 
                home: unescape(home), 
                away: unescape(away), 
                openingOdds 
            })
        });

        if (!response.ok) {
             try {
                const errorData = await response.json();
                throw new Error(`Szerver hiba (${response.status}): ${errorData.error || response.statusText}`);
            } catch (jsonError) {
                throw new Error(`Hálózati hiba: ${response.status} ${response.statusText}`);
            }
        }
        
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        let signalColor, signalText;
        switch (data.signal) {
            case 'GREEN': signalColor = 'var(--success)'; signalText = 'ZÖLD JELZÉS ✅'; break;
            case 'YELLOW': signalColor = 'var(--primary)'; signalText = 'SÁRGA JELZÉS⚠️'; break;
            case 'RED': signalColor = 'var(--danger)'; signalText = 'PIROS JELZÉS ❌'; break;
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
            currentBtn.innerHTML = '✔️';
        }
    }
}

function handleSportChange() {
    appState.currentSport = document.getElementById('sportSelector').value;
    appState.selectedMatches.clear(); // Töröljük a kiválasztást sportváltáskor
    document.getElementById('kanban-board').innerHTML = '';
    document.getElementById('mobile-list-container').innerHTML = '';
    document.getElementById('placeholder').style.display = 'flex';
    updateMultiSelectButton(); // Frissítjük a gombot
}


function openManualAnalysisModal() {
    let content = `
        <div class="control-group"><label for="manual-home">Hazai csapat</label><input id="manual-home" placeholder="Pl. Liverpool"/></div>
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
    runAnalysis(home, away, true); // forceNew=true
}

function isMobile() { return window.innerWidth <= 1024; }

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
    const groupOrder = ['Top Ligák', 'Kiemelt Bajnokságok', 'Figyelmet Érdemlő', 'Egyéb Meccsek'];
    const groupedByCategory = groupBy(fixtures, fx => getLeagueGroup(fx.league));
    groupOrder.forEach(group => {
        let columnContent = '';
        let cardIndex = 0;
        if (groupedByCategory[group]) {
            const groupedByDate = groupBy(groupedByCategory[group], fx => new Date(fx.utcKickoff).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }));
            Object.keys(groupedByDate).sort((a, b) => new Date(a.split('. ').join('.').split('.').reverse().join('-')) - new Date(b.split('. ').join('.').split('.').reverse().join('-'))).forEach(dateKey => {
                columnContent += `<details class="date-section" open><summary>${formatDateLabel(dateKey)}</summary>`;
                groupedByDate[dateKey].forEach(fx => {
                    const time = new Date(fx.utcKickoff).toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' });
                    columnContent += `
                        <div class="match-card selectable-card ${appState.selectedMatches.has(fx.uniqueId) ? 'selected' : ''}" data-match-id="${fx.uniqueId}" style="animation-delay: ${cardIndex * 0.05}s">
                             <input type="checkbox" class="match-checkbox" data-match-id="${fx.uniqueId}" ${appState.selectedMatches.has(fx.uniqueId) ? 'checked' : ''}>
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
        board.innerHTML += `
            <div class="kanban-column">
                <h4 class="kanban-column-header">${group}</h4>
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
    const groupOrder = ['Top Ligák', 'Kiemelt Bajnokságok', 'Figyelmet Érdemlő', 'Egyéb Meccsek'];
    const groupedByCategory = groupBy(fixtures, fx => getLeagueGroup(fx.league));
    let html = '';
    groupOrder.forEach(group => {
        if (groupedByCategory[group]) {
            html += `<h4 class="league-header-mobile">${group}</h4>`;
            groupedByCategory[group].forEach(fx => {
                const time = new Date(fx.utcKickoff).toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' });
                html += `
                    <div class="list-item selectable-item ${appState.selectedMatches.has(fx.uniqueId) ? 'selected' : ''}" data-match-id="${fx.uniqueId}">
                        <input type="checkbox" class="match-checkbox" data-match-id="${fx.uniqueId}" ${appState.selectedMatches.has(fx.uniqueId) ? 'checked' : ''}>
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

function renderHistory(historyData) {
    if (!historyData || historyData.length === 0) {
        return '<p class="muted" style="text-align:center; padding: 2rem;">Nincsenek mentett előzmények.</p>';
    }
    const history = historyData.filter(item => item && item.id && item.home && item.away && item.date);
    const groupedByDate = groupBy(history, item => new Date(item.date).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }));
    let html = '';
    Object.keys(groupedByDate).sort((a, b) => new Date(b.split('. ').join('.').split('.').reverse().join('-')) - new Date(a.split('. ').join('.').split('.').reverse().join('-'))).forEach(dateKey => {
        html += `<details class="date-section"><summary>${formatDateLabel(dateKey)}</summary>`;
        const sortedItems = groupedByDate[dateKey].sort((a, b) => new Date(b.date) - new Date(a.date));
        sortedItems.forEach(item => {
            const analysisTime = new Date(item.date);
            const now = new Date();
            const startTimeDiffMinutes = (now - analysisTime) / (1000 * 60) - 60;
            const endTimeDiffMinutes = (now - analysisTime) / (1000 * 60) - 180;
            const isCheckable = startTimeDiffMinutes > 0 && endTimeDiffMinutes < 0;
            const finalCheckButton = `
                <button class="btn btn-final-check"
                        onclick="runFinalCheck('${escape(item.home)}', '${escape(item.away)}', '${item.sport}'); event.stopPropagation();"
                        title="Végső Ellenőrzés (kb. meccs előtt aktív)"
                        ${!isCheckable ? 'disabled' : ''}>
                    ✔️
                </button>`;
            const time = analysisTime.toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' });
            const safeItemId = escape(item.id);
            html += `
                <div class="list-item">
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

// === MÓDOSÍTVA: Hívás az új '/getAnalysisDetail' végpontra ===
async function viewHistoryDetail(id) {
    const originalId = unescape(id);
    openModal('Elemzés Betöltése...', document.getElementById('loading-skeleton').outerHTML, 'modal-xl');
    document.querySelector('#modal-container #loading-skeleton').classList.add('active');

    try {
        // A hívás most már a Node.js szerver /getAnalysisDetail végpontjára mutat
        const response = await fetch(`${appState.gasUrl}/getAnalysisDetail?id=${encodeURIComponent(originalId)}`);
        
        if (!response.ok) {
             try {
                const errorData = await response.json();
                throw new Error(`Szerver hiba (${response.status}): ${errorData.error || response.statusText}`);
            } catch (jsonError) {
                throw new Error(`Hálózati hiba: ${response.status} ${response.statusText}`);
            }
        }
        
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

    } catch (e) {
        document.getElementById('modal-body').innerHTML = `<p style="color:var(--danger); text-align:center; padding: 2rem;">Hiba: ${e.message}</p>`;
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
}

function closeModal() { document.getElementById('modal-container').classList.remove('open'); }

function groupBy(arr, keyFn) {
    return arr.reduce((acc, item) => {
        const key = keyFn(item);
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

// === MÓDOSÍTVA: Hívás az új '/askChat' végpontra (POST, application/json) ===
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
        // A hívás most már a Node.js szerver /askChat végpontjára mutat
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

        if (!response.ok) {
             try {
                const errorData = await response.json();
                throw new Error(`Szerver hiba (${response.status}): ${errorData.error || response.statusText}`);
            } catch (jsonError) {
                throw new Error(`Hálózati hiba: ${response.status} ${response.statusText}`);
            }
        }
        
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
        const orbCount = 10;
        for (let i = 0; i < orbCount; i++) {
            const orb = document.createElement('div');
            orb.className = 'glowing-orb';
            const size = Math.random() * 30 + 10;
            const scale = Math.random() * 0.5 + 0.5;
            const opacity = Math.random() * 0.4 + 0.1;
            const duration = Math.random() * 20 + 15;
            const delay = Math.random() * -duration;
            orb.style.width = `${size}px`;
            orb.style.height = `${size}px`;
            orb.style.setProperty('--scale', scale);
            orb.style.setProperty('--opacity', opacity);
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
        console.error("Hiba a fénygömbök létrehozásakor:", e);
    }
}

function createHeaderOrbs() {
    try {
        const orbContainer = document.createElement('div');
        orbContainer.className = 'orb-container-header';
        const appHeader = document.querySelector('.app-header');
        if (!appHeader) return;
        appHeader.prepend(orbContainer);
        const orbCount = 5;
        for (let i = 0; i < orbCount; i++) {
            const orb = document.createElement('div');
            orb.className = 'glowing-orb-orange';
            const size = Math.random() * 15 + 5;
            const scale = Math.random() * 0.5 + 0.5;
            const opacity = Math.random() * 0.5 + 0.2;
            const duration = Math.random() * 10 + 8;
            const delay = Math.random() * -duration;
            orb.style.width = `${size}px`;
            orb.style.height = `${size}px`;
            orb.style.setProperty('--scale', scale);
            orb.style.setProperty('--opacity', opacity);
            orb.style.animationDuration = `${duration}s`;
            orb.style.animationDelay = `${delay}s`;
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

// --- TÖBBES KIJELÖLÉS FUNKCIÓK ---
function initMultiSelect() {
    const controlsBar = document.querySelector('.controls-bar .main-actions');
    if (controlsBar) {
        const multiSelectButton = document.createElement('button');
        multiSelectButton.id = 'multiAnalysisBtn';
        multiSelectButton.className = 'btn btn-special btn-lg';
        multiSelectButton.textContent = 'Kiválasztottak Elemzése (0)';
        multiSelectButton.disabled = true;
        multiSelectButton.onclick = runMultiAnalysis;
        controlsBar.appendChild(multiSelectButton);
    }
}

function addCheckboxListeners() {
    const checkboxes = document.querySelectorAll('.match-checkbox');
    checkboxes.forEach(cb => {
        cb.removeEventListener('change', handleCheckboxChange);
        cb.addEventListener('change', handleCheckboxChange);
    });
}

function handleCheckboxChange(event) {
    const checkbox = event.target;
    const matchId = checkbox.dataset.matchId;
    const cardOrItem = checkbox.closest('.selectable-card, .selectable-item');

    if (checkbox.checked) {
        if (appState.selectedMatches.size < 3) {
            appState.selectedMatches.add(matchId);
            cardOrItem?.classList.add('selected');
        } else {
            checkbox.checked = false;
            showToast('Maximum 3 meccset választhatsz ki egyszerre.', 'error');
        }
    } else {
        appState.selectedMatches.delete(matchId);
        cardOrItem?.classList.remove('selected');
    }
    updateMultiSelectButton();
}

function updateMultiSelectButton() {
    const btn = document.getElementById('multiAnalysisBtn');
    if (!btn) return;
    const count = appState.selectedMatches.size;
    btn.textContent = `Kiválasztottak Elemzése (${count})`;
    btn.disabled = count === 0 || count > 3;
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
    
    // MÓDOSÍTVA: Skeleton loader használata
    loadingContainer.innerHTML = document.getElementById('loading-skeleton').outerHTML;
    const modalSkeleton = loadingContainer.querySelector('.loading-skeleton');
    if (modalSkeleton) modalSkeleton.classList.add('active');

    const analysisPromises = matchesToAnalyze.map(match => {
        // Ugyanazt a runAnalysis hívást használjuk, force=true-val
        return fetch(`${appState.gasUrl}?action=runAnalysis&home=${encodeURIComponent(match.home)}&away=${encodeURIComponent(match.away)}&sport=${appState.currentSport}&force=true&sheetUrl=${encodeURIComponent(appState.sheetUrl)}`, {
            method: 'POST',
            body: JSON.stringify({ openingOdds: JSON.parse(sessionStorage.getItem('openingOdds') || '{}') }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        })
        .then(response => {
            if (!response.ok) throw new Error(`Szerver hiba (${match.home} vs ${match.away}): ${response.status}`);
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

         // Töröljük a kijelölést az elemzés után
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
Kész, itt vagyunk

Rendben, köszönöm a türelmet! Látom a `Gemini.txt` tartalmát, ami az egész eddigi beszélgetésünket tartalmazza a Google Apps Script fejlesztéséről és hibakereséséről.

**Megerősítem a helyzetet:**

1.  **A Cél:** Át akarjuk költöztetni a teljes backend logikádat (az összes `.gs` fájlt) Google Apps Scriptről egy Node.js alapú rendszerre.
2.  [cite_start]**Az Ok:** Meg akarunk szabadulni a Google 6 perces futási időkorlátjától [cite: 3348, 3349, 3379-3382][cite_start], ami a `net::ERR_FAILED` hibákat okozza [cite: 3379-3382, 3125, 3127, 3153, 3156][cite_start], mert az elemzéseid már túl bonyolultak és hosszúak lettek [cite: 3348-3349, 3386-3387, 3224].
3.  **Hol tartottunk:** Elkezdtük a laptopodon a környezet beállítását a Visual Studio Code (VS Code) segítségével. [cite_start]Létrehoztad a `king-ai-backend` mappát [cite: 3355][cite_start], és megpróbáltad létrehozni a `package.json` fájlt [cite: 3353-3354, 3359-3360, 3362][cite_start], de elakadtunk az `npm install` parancsnál [cite: 3365, 3368, 3369-3371][cite_start], mert a Node.js nem volt telepítve a gépedre[cite: 3365].
4.  [cite_start]**A Terv:** Megbeszéltük, hogy otthon, a saját gépeden telepíted a Node.js-t [cite: 3365, 3372, 3373, 3390, 3398] [cite_start]és a VS Code-ot[cite: 3359, 3373, 3398], majd folytatjuk.

**Szuper, hogy itt vagy! Kezdjük.**

Most, hogy feltöltötted a teljes beszélgetést, én is felkészültem. Kezdjük azzal, ahol abbahagytuk:

### 1. Lépés: Node.js Telepítése (Ha még nem tetted meg)

Mielőtt bármit csinálnánk a VS Code-ban, a gépedre telepítened kell a **Node.js**-t.

1.  Menj a hivatalos weboldalra: [https://nodejs.org/](https://nodejs.org/)
2.  Kattints a **bal oldali, "LTS" feliratú** gombra. [cite_start]Ez a stabil, ajánlott verzió[cite: 3366, 3373, 3398].
3.  Futtasd a letöltött telepítőt. [cite_start]Menj végig a telepítési lépéseken, **hagyd az alapértelmezett beállításokat** (a "Add to PATH" opció maradjon bepipálva) [cite: 3365-3366].
4.  Miután a telepítés befejeződött, **indítsd újra a Visual Studio Code-ot** (ha nyitva volt).

### 2. Lépés: Projekt Beállítása és Csomagok Telepítése (VS Code-ban)

Most, hogy a Node.js (és vele az `npm` parancs) telepítve van, befejezhetjük a projekt alapozását.

1.  **Mappa Megnyitása:** Nyisd meg a VS Code-ot. [cite_start]A felső menüben válaszd: **File -> Open Folder...** (Fájl -> Mappa megnyitása...) és nyisd meg a `king-ai-backend` mappádat [cite: 3355-3356, 3359, 3398].
2.  **`package.json` Fájl Létrehozása:**
    * [cite_start]A bal oldali Fájlkezelőben (ahol a `KING-AI-BACKEND` mappa neve van) kattints a mappa neve melletti kis **"Új fájl" ikonra** 📄 [cite: 3360, 3362-3363].
    * Nevezd el a fájlt pontosan így: `package.json`
    * Nyomj Enter-t.
3.  [cite_start]**Tartalom Bemásolása:** Másold be az alábbi teljes tartalmat ebbe az új, üres `package.json` fájlba[cite: 3360, 3362]:

    ```json
    {
      "name": "king-ai-backend",
      "version": "1.0.0",
      "description": "A sportelemző backend Node.js-re átírva.",
      "main": "index.js",
      "type": "module",
      "scripts": {
        "start": "node index.js"
      },
      "keywords": [
        "ai",
        "sports",
        "analysis"
      ],
      "author": "The King AI",
      "license": "ISC",
      "dependencies": {
        "axios": "^1.7.2",
        "cors": "^2.8.5",
        "dotenv": "^16.4.5",
        "express": "^4.19.2",
        "node-cache": "^5.1.2"
      }
    }
    ```
4.  **Mentés:** Nyomj egy **Ctrl+S** billentyűt (vagy File -> Save), hogy elmented a fájlt. [cite_start](Ez volt a hiba, amit korábban a fehér pötty jelzett [cite: 3367-3369, 3382-3383, 3394, 3399]).

5.  [cite_start]**Terminál Megnyitása:** Nyiss egy új terminált a VS Code-on belül (felső menü: **Terminal -> New Terminal**)[cite: 3356, 3361, 3364, 3373, 3385, 3399].

6.  [cite_start]**Telepítés:** Gépeld be az alul megjelenő terminál ablakba a következő parancsot, majd nyomj Enter-t [cite: 3357, 3361, 3364-3365, 3370-3371, 3383, 3385, 3394, 3399]:

    ```bash
    npm install
    ```

Ha mindent jól csináltunk, ennek a parancsnak most már hiba nélkül le kell futnia. Látni fogod, ahogy letölti a csomagokat, és megjelenik a `node_modules` mappa és a `package-lock.json` fájl.

Szólj, ha idáig eljutottál!
