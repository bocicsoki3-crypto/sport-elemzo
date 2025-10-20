// --- ALKALMAZÁS ÁLLAPOT ---
const appState = {
    // !!! KRITIKUS: CSERÉLD KI A SAJÁT KÖZZÉTETT GOOGLE APPS SCRIPT URL-EDRE !!!
    gasUrl: 'https://script.google.com/macros/s/AKfycbyN99ot1yzv4Na9nq0rTIsCSQ2DUlMMCzSKQmtM8fg7qDMAaFzHW8n_2Y8eNxnsFdabvg/exec',
    fixtures: [],
    currentSport: 'soccer',
    sheetUrl: '',
    currentAnalysisContext: '',
    chatHistory: [],
    completedAnalyses: []
};

// --- LIGA KATEGÓRIÁK ---
const LEAGUE_CATEGORIES = {
    soccer: {
        '🎯 Prémium Elemzés': [ 'Champions League', 'Premier League', 'Bundesliga', 'LaLiga', 'Serie A' ],
        '📈 Stabil Ligák': [ 'Europa League', 'Ligue 1', 'Eredivisie', 'Liga Portugal' ],
        '❔ Változékony Mezőny': [ 'Championship', '2. Bundesliga', 'Serie B', 'LaLiga2', 'Super Lig', 'Premiership', 'MLS' ],
        '🎲 Vad Kártyák': [ 'FIFA World Cup', 'UEFA European Championship', 'Conference League', 'Brazil Serie A', 'Argentinian Liga Profesional', 'Greek Super League', 'Nemzetek Ligája', 'Kupa', 'Copa', 'Cup' ]
    },
    hockey: { '🎯 Prémium Elemzés': [ 'NHL' ], '📈 Stabil Ligák': [ 'KHL', 'SHL', 'Liiga', 'DEL', 'AHL', 'ICEHL', 'Champions Hockey League' ], '🎲 Vad Kártyák': [ 'IIHF World Championship', 'Olimpiai Játékok', 'Spengler Cup', 'Extraliga' ] },
    basketball: { '🎯 Prémium Elemzés': [ 'NBA', 'Euroleague' ], '📈 Stabil Ligák': [ 'Liga ACB', 'BSL', 'BBL', 'Lega A' ], '🎲 Vad Kártyák': [ 'FIBA World Cup', 'Olimpiai Játékok', 'EuroBasket', 'FIBA Champions League', 'EuroCup', 'LNB Pro A' ] }
};

// --- INICIALIZÁLÁS ---
document.addEventListener('DOMContentLoaded', () => {
    setupThemeSwitcher();

    if(!appState.gasUrl || !appState.gasUrl.startsWith('https://script.google.com')){
        document.getElementById('userInfo').textContent='HIBA: URL nincs beállítva!';
        document.getElementById('userInfo').style.color = 'var(--danger)';
    } else {
        document.getElementById('userInfo').textContent=`Csatlakozva`;
    }
    appState.sheetUrl = localStorage.getItem('sheetUrl');

    const toastContainer = document.createElement('div');
    toastContainer.id = 'toast-notification-container';
    toastContainer.className = 'toast-notification-container';
    document.body.appendChild(toastContainer);

    // Portfólió adatainak betöltése a sessionStorage-ből
    const savedAnalyses = sessionStorage.getItem('completedAnalyses');
    if (savedAnalyses) {
        appState.completedAnalyses = JSON.parse(savedAnalyses);
        updatePortfolioButton();
    }
});

// --- FŐ FUNKCIÓK ---

async function loadFixtures() {
    const loadBtn = document.getElementById('loadFixturesBtn');
    loadBtn.disabled = true;
    loadBtn.textContent = 'Betöltés...';

    try {
        const response = await fetch(`${appState.gasUrl}?action=getFixtures&sport=${appState.currentSport}&days=2`);
        if (!response.ok) throw new Error(`Hálózati hiba: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        appState.fixtures = data.fixtures || [];
        sessionStorage.setItem('openingOdds', JSON.stringify(data.odds || {}));

        if (isMobile()) {
            renderFixturesForMobileList(appState.fixtures);
        } else {
            renderFixturesForDesktop(appState.fixtures);
        }
    } catch (e) {
        showToast(`Hiba a meccsek betöltésekor: ${e.message}`, 'error');
    } finally {
        loadBtn.disabled = false;
        loadBtn.textContent = 'Meccsek Betöltése';
    }
}

async function runAnalysis(home, away) {
    home = unescape(home);
    away = unescape(away);

    if (isMobile()) {
        showToast("Elemzés folyamatban... A folyamat megszakadásának elkerülése érdekében ne váltson másik alkalmazásra.", 'info', 6000); // Hosszabb ideig látható
    }

    openModal(`${home} vs ${away}`, document.getElementById('common-elements').innerHTML, isMobile() ? 'modal-fullscreen' : 'modal-lg');

    const modalSkeleton = document.querySelector('#modal-container #loading-skeleton');
    const modalResults = document.querySelector('#modal-container #analysis-results');
    const modalChat = document.querySelector('#modal-container #chat-container');

    modalResults.innerHTML = '';
    modalChat.style.display = 'none';
    modalSkeleton.classList.add('active');

    modalChat.querySelector('#chat-send-btn').onclick = sendChatMessage;
    modalChat.querySelector('#chat-input').onkeyup = (e) => e.key === "Enter" && sendChatMessage();

    try {
        let analysisUrl = `${appState.gasUrl}?action=runAnalysis&home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}&sport=${appState.currentSport}&force=true&sheetUrl=${encodeURIComponent(appState.sheetUrl)}`;
        const openingOdds = sessionStorage.getItem('openingOdds') || '{}';

        const response = await fetch(analysisUrl, {
            method: 'POST',
            body: JSON.stringify({ openingOdds: JSON.parse(openingOdds) }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        if (!response.ok) throw new Error(`Szerver válasz hiba: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        appState.currentAnalysisContext = data.html;
        appState.chatHistory = [];

        modalResults.innerHTML = `<div class="analysis-body">${data.html}</div>`;
        modalSkeleton.classList.remove('active');
        modalChat.style.display = 'block';
        modalChat.querySelector('#chat-messages').innerHTML = '';

        const portfolioData = extractDataForPortfolio(data.html, home, away);
        if (portfolioData && !appState.completedAnalyses.some(a => a.match === portfolioData.match)) {
            appState.completedAnalyses.push(portfolioData);
            sessionStorage.setItem('completedAnalyses', JSON.stringify(appState.completedAnalyses));
            updatePortfolioButton();
        }

    } catch (e) {
        modalResults.innerHTML = `<p style="color:var(--danger); text-align:center; padding: 2rem;">Hiba történt az elemzés során: ${e.message}</p>`;
        modalSkeleton.classList.remove('active');
    }
}

async function openHistoryModal() {
    if (!appState.sheetUrl) {
        const url = prompt("Kérlek, add meg a Google Táblázat URL-jét a napló megtekintéséhez:", "");
        if (url && url.startsWith('https://docs.google.com/spreadsheets/d/')) {
            appState.sheetUrl = url;
            localStorage.setItem('sheetUrl', url);
        } else if(url) {
            showToast('Érvénytelen URL.', 'error');
            return;
        } else { return; }
    }
    const modalSize = isMobile() ? 'modal-fullscreen' : 'modal-lg';
    const loadingHTML = document.getElementById('loading-skeleton').outerHTML;
    openModal('Előzmények', loadingHTML, modalSize);
    document.querySelector('#modal-container #loading-skeleton').classList.add('active');

    try {
        const response = await fetch(`${appState.gasUrl}?action=getHistory&sheetUrl=${encodeURIComponent(appState.sheetUrl)}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        document.getElementById('modal-body').innerHTML = renderHistory(data.history);
    } catch (e) {
        document.getElementById('modal-body').innerHTML = `<p class="muted" style="color:var(--danger); text-align:center; padding: 2rem;">Hiba: ${e.message}</p>`;
    }
}

async function deleteHistoryItem(id) {
    if (!appState.sheetUrl || !confirm("Biztosan törölni szeretnéd ezt az elemet a naplóból?")) return;
    try {
        const response = await fetch(appState.gasUrl, {
            method: 'POST',
            body: JSON.stringify({ action: 'deleteHistoryItem', sheetUrl: appState.sheetUrl, id: id }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        showToast('Elem sikeresen törölve.', 'success');
        openHistoryModal();
    } catch (e) {
        showToast(`Hiba a törlés során: ${e.message}`, 'error');
    }
}

async function buildPortfolio() {
    openModal('Napi Portfólió Építése', document.getElementById('loading-skeleton').outerHTML, 'modal-lg');
    document.querySelector('#modal-container #loading-skeleton').classList.add('active');

    try {
        const response = await fetch(appState.gasUrl, {
            method: 'POST',
            body: JSON.stringify({ action: 'buildPortfolio', analyses: appState.completedAnalyses }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        if (!response.ok) throw new Error(`Szerver hiba: ${response.statusText}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        const formattedReport = data.report.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>').replace(/- /g, '&bull; ');
        document.getElementById('modal-body').innerHTML = `<div class="portfolio-report" style="font-family: var(--font-family-body); line-height: 1.8;">${formattedReport}</div>`;

    } catch (e) {
        document.getElementById('modal-body').innerHTML = `<p style="color:var(--danger); text-align:center;">Hiba: ${e.message}</p>`;
    }
}

async function runFinalCheck(home, away, sport) {
    const btn = event.target;
    btn.disabled = true;
    btn.innerHTML = '...';

    openModal('Végső Elme-Ellenőrzés', document.getElementById('loading-skeleton').outerHTML, 'modal-sm');
    document.querySelector('#modal-container #loading-skeleton').classList.add('active');

    try {
        const openingOdds = JSON.parse(sessionStorage.getItem('openingOdds') || '{}');
        const response = await fetch(appState.gasUrl, {
            method: 'POST',
            body: JSON.stringify({ action: 'runFinalCheck', sport, home: unescape(home), away: unescape(away), openingOdds }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        if (!response.ok) throw new Error(`Szerver hiba: ${response.statusText}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        let signalColor, signalText;
        switch(data.signal) {
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
    } finally {
        btn.disabled = false;
        btn.innerHTML = '✔️';
    }
}

function handleSportChange() {
    appState.currentSport = document.getElementById('sportSelector').value;
    appState.completedAnalyses = [];
    sessionStorage.removeItem('completedAnalyses');
    updatePortfolioButton();
    document.getElementById('kanban-board').innerHTML = '';
    document.getElementById('mobile-list-container').innerHTML = '';
    document.getElementById('placeholder').style.display = 'flex';
}

function updatePortfolioButton() {
    const btn = document.getElementById('portfolioBtn');
    if (!btn) return;
    const count = appState.completedAnalyses.length;
    btn.textContent = `Portfólió Építése (${count}/3)`;
    btn.disabled = count < 3;
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
    runAnalysis(home, away);
}

function isMobile() { return window.innerWidth <= 1024; }

function getLeagueGroup(leagueName) {
    const sportGroups = LEAGUE_CATEGORIES[appState.currentSport] || {};
    const lowerLeagueName = leagueName.toLowerCase();
    for (const groupName in sportGroups) {
        if (sportGroups[groupName].some(l => lowerLeagueName.includes(l.toLowerCase()))) return groupName;
    }
    return '🎲 Vad Kártyák';
}

// === MÓDOSÍTOTT FUNKCIÓ (renderFixturesForDesktop) ===
function renderFixturesForDesktop(fixtures) {
    const board = document.getElementById('kanban-board');
    document.getElementById('placeholder').style.display = 'none';
    board.innerHTML = '';

    const groupOrder = ['🎯 Prémium Elemzés', '📈 Stabil Ligák', '❔ Változékony Mezőny', '🎲 Vad Kártyák'];
    const groupedByCategory = groupBy(fixtures, fx => getLeagueGroup(fx.league));

    groupOrder.forEach(group => {
        let columnContent = '';
        let cardIndex = 0; // Index a késleltetéshez
        
        if (groupedByCategory[group]) {
            const groupedByDate = groupBy(groupedByCategory[group], fx => new Date(fx.utcKickoff).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }));

            Object.keys(groupedByDate).sort((a,b) => new Date(a.split('. ').join('.').split('.').reverse().join('-')) - new Date(b.split('. ').join('.').split('.').reverse().join('-'))).forEach(dateKey => {
                columnContent += `<details class="date-section" open><summary>${formatDateLabel(dateKey)}</summary>`;
                groupedByDate[dateKey].forEach(fx => {
                    const time = new Date(fx.utcKickoff).toLocaleTimeString('hu-HU', {timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit'});
                    
                    // === SOR MÓDOSÍTVA: style="animation-delay:..." hozzáadva ===
                    columnContent += `
                        <div class="match-card" 
                             onclick="runAnalysis('${escape(fx.home)}', '${escape(fx.away)}')"
                             style="animation-delay: ${cardIndex * 0.05}s">
                            <div class="match-card-teams">${fx.home} – ${fx.away}</div>
                            <div class="match-card-meta">
                                <span>${fx.league}</span>
                                <span>${time}</span>
                            </div>
                        </div>`;
                    cardIndex++; // Növeld az indexet
                });
                columnContent += `</details>`;
            });
        }

        const [icon, ...titleParts] = group.split(' ');
        const title = titleParts.join(' ');

        board.innerHTML += `
            <div class="kanban-column">
                <h4 class="kanban-column-header">${icon} ${title}</h4>
                <div class="column-content">
                    ${columnContent || '<p class="muted" style="text-align: center; padding-top: 2rem;">Nincs meccs ebben a kategóriában.</p>'}
                </div>
            </div>`;
    });
}
// === MÓDOSÍTÁS VÉGE ===

function renderFixturesForMobileList(fixtures) {
    const container = document.getElementById('mobile-list-container');
    document.getElementById('placeholder').style.display = 'none';
    container.innerHTML = '';

    const groupOrder = ['🎯 Prémium Elemzés', '📈 Stabil Ligák', '❔ Változékony Mezőny', '🎲 Vad Kártyák'];
    const groupedByCategory = groupBy(fixtures, fx => getLeagueGroup(fx.league));

    let html = '';
    groupOrder.forEach(group => {
        if (groupedByCategory[group]) {
            const [icon, ...titleParts] = group.split(' ');
            const title = titleParts.join(' ');
            html += `<h4 class="league-header-mobile">${icon} ${title}</h4>`;

            groupedByCategory[group].forEach(fx => {
                const time = new Date(fx.utcKickoff).toLocaleTimeString('hu-HU', {timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit'});
                html += `
                    <div class="list-item" onclick="runAnalysis('${escape(fx.home)}', '${escape(fx.away)}')">
                        <div>
                            <div class="list-item-title">${fx.home} – ${fx.away}</div>
                            <div class="list-item-meta">${fx.league} - ${time}</div>
                        </div>
                         <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </div>`;
            });
        }
    });
    container.innerHTML = html || '<p class="muted" style="text-align:center; padding: 2rem;">Nincsenek elérhető mérkőzések.</p>';
}

// --- JAVÍTOTT FUNKCIÓ ---
function extractDataForPortfolio(html, home, away) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // A keresési feltételek javítva, hogy megfeleljenek a HTML_Builder.gs-ben generált címkéknek
        const bestBetCard = Array.from(doc.querySelectorAll('.summary-card h5')).find(h5 => 
            h5.textContent.includes('Értéket Rejtő Tipp') || 
            h5.textContent.includes('Legvalószínűbb kimenetel')
        );
        
        if (!bestBetCard) {
            console.error("Nem található 'Best Bet' kártya a portfólióhoz.");
            return null;
        }

        const bestBet = bestBetCard.nextElementSibling.textContent.trim();
        const confidence = bestBetCard.nextElementSibling.nextElementSibling.querySelector('strong').textContent.trim();

        if (bestBet && confidence) {
            return { match: `${home} vs ${away}`, bestBet: bestBet, confidence: confidence };
        }
        return null;
    } catch (e) {
        console.error("Hiba az adatok kinyerésekor a portfólióhoz:", e);
        return null;
    }
}

function renderHistory(historyData) {
    if (!historyData || historyData.length === 0) {
        return '<p class="muted" style="text-align:center; padding: 2rem;">Nincsenek mentett előzmények.</p>';
    }
    const history = historyData.filter(item => item.home && item.away);
    const groupedByDate = groupBy(history, item => new Date(item.date).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }));

    let html = '';
    Object.keys(groupedByDate).sort((a,b) => new Date(b.split('. ').join('.').split('.').reverse().join('-')) - new Date(a.split('. ').join('.').split('.').reverse().join('-'))).forEach(dateKey => {
        html += `<details class="date-section" open><summary>${formatDateLabel(dateKey)}</summary>`;
        const sortedItems = groupedByDate[dateKey].sort((a,b) => new Date(b.date) - new Date(a.date));

        sortedItems.forEach(item => {
            const matchTime = new Date(item.date);
            const now = new Date();
            // Az elemzés idejéhez képest (nem a meccs idejéhez)
            const timeDiffMinutes = (matchTime - now) / (1000 * 60); 

            // Aktív: meccs előtt 1 órával, és utána 2 óráig
            const isCheckable = timeDiffMinutes <= 60 && timeDiffMinutes > -120;
            const finalCheckButton = `
                <button class="btn btn-final-check" 
                        onclick="runFinalCheck('${escape(item.home)}', '${escape(item.away)}', '${item.sport}'); event.stopPropagation();" 
                        title="Végső Ellenőrzés (meccs előtt 1 órával aktív)" 
                        ${!isCheckable ? 'disabled' : ''}>
                    ✔️
                </button>`;

            const time = matchTime.toLocaleTimeString('hu-HU', {timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit'});
            html += `
                <div class="list-item">
                    <div style="flex-grow:1;" onclick="viewHistoryDetail('${item.id}')">
                        <div class="list-item-title">${item.home} – ${item.away}</div>
                        <div class="list-item-meta">${item.sport.charAt(0).toUpperCase() + item.sport.slice(1)} - ${time}</div>
                    </div>
                     ${finalCheckButton}
                     <button class="btn" onclick="deleteHistoryItem('${item.id}'); event.stopPropagation();" title="Törlés">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                     </button>
                </div>`;
        });
        html += `</details>`;
    });
    return html;
}

async function viewHistoryDetail(id) {
    openModal('Elemzés Betöltése...', document.getElementById('loading-skeleton').outerHTML, isMobile() ? 'modal-fullscreen' : 'modal-lg');
    document.querySelector('#modal-container #loading-skeleton').classList.add('active');

    try {
        const response = await fetch(`${appState.gasUrl}?action=getAnalysisDetail&sheetUrl=${encodeURIComponent(appState.sheetUrl)}&id=${id}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        const { record } = data;
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
    }
}

function openModal(title, content = '', sizeClass = 'modal-sm') {
    const modalContainer = document.getElementById('modal-container');
    const modalContent = modalContainer.querySelector('.modal-content');
    modalContent.className = 'modal-content';
    modalContent.classList.add(sizeClass);
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = content;
    modalContainer.classList.add('open');
}
function closeModal() { document.getElementById('modal-container').classList.remove('open'); }

function groupBy(arr, key) { return arr.reduce((acc, item) => ((acc[key(item)] = [...(acc[key(item)] || []), item]), acc), {}); }

function formatDateLabel(dateStr) {
    const today = new Date().toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' });
    const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' });
    if (dateStr === today) return 'MA';
    if (dateStr === tomorrow) return 'HOLNAP';
    return dateStr;
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
        const response = await fetch(appState.gasUrl, {
            method: 'POST',
            body: JSON.stringify({ action: 'askChat', context: appState.currentAnalysisContext, history: appState.chatHistory, question: message }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        if (!response.ok) throw new Error(`Szerver hiba: ${response.statusText}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        addMessageToChat(data.answer, 'ai');
        appState.chatHistory.push({role: 'user', parts: [{ text: message }]});
        appState.chatHistory.push({role: 'model', parts: [{ text: data.answer }]});
    } catch (e) {
        addMessageToChat(`Hiba történt: ${e.message}`, 'ai');
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

// --- JAVÍTOTT FUNKCIÓ (Duplikáció eltávolítva) ---
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
