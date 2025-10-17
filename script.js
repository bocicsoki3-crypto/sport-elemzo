let __gasUrl = 'https://script.google.com/macros/s/AKfycbyN99ot1yzv4Na9nq0rTIsCSQ2DUlMMCzSKQmtM8fg7qDMAaFzHW8n_2Y8eNxnsFdabvg/exec';
let __fixtures = [];
let __currentSport = 'soccer';
let __sheetUrl = '';
let __currentAnalysisContext = '';
let __chatHistory = [];
let __completedAnalyses = [];

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

document.addEventListener('DOMContentLoaded', () => {
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

    if(!__gasUrl||!__gasUrl.startsWith('https://script.google.com')){
        document.getElementById('userInfo').textContent='HIBA: URL nincs beállítva!';
        document.getElementById('userInfo').style.color = 'var(--danger)';
    } else {
        document.getElementById('userInfo').textContent=`Csatlakozva`;
    }
    __sheetUrl = localStorage.getItem('sheetUrl');
});

function isMobile() { return window.innerWidth <= 1024; }

function getLeagueGroup(leagueName) {
    const sportGroups = LEAGUE_CATEGORIES[__currentSport] || {};
    const lowerLeagueName = leagueName.toLowerCase();
    for (const groupName in sportGroups) {
        if (sportGroups[groupName].some(l => lowerLeagueName.includes(l.toLowerCase()))) return groupName;
    }
    return '🎲 Vad Kártyák';
}

async function loadFixtures() {
    const loadBtn = document.getElementById('loadFixturesBtn');
    loadBtn.disabled = true;
    loadBtn.textContent = 'Betöltés...';
    
    try {
        const response = await fetch(`${__gasUrl}?action=getFixtures&sport=${__currentSport}&days=2`);
        if (!response.ok) throw new Error(`Hálózati hiba: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        __fixtures = data.fixtures || [];
        sessionStorage.setItem('openingOdds', JSON.stringify(data.odds || {}));

        if (isMobile()) {
            openModal('Mérkőzések', renderFixturesForMobile(__fixtures), 'modal-fullscreen');
        } else {
            renderFixturesForDesktop(__fixtures);
        }
    } catch (e) {
        alert(`Hiba a meccsek betöltésekor: ${e.message}`);
    } finally {
        loadBtn.disabled = false;
        loadBtn.textContent = 'Meccsek Betöltése';
    }
}

function renderFixturesForDesktop(fixtures) {
    const board = document.getElementById('kanban-board');
    document.getElementById('placeholder').style.display = 'none';
    board.innerHTML = '';

    const groupOrder = ['🎯 Prémium Elemzés', '📈 Stabil Ligák', '❔ Változékony Mezőny', '🎲 Vad Kártyák'];
    const groupedByCategory = groupBy(fixtures, fx => getLeagueGroup(fx.league));

    groupOrder.forEach(group => {
        let columnContent = '';
        if (groupedByCategory[group]) {
            const groupedByDate = groupBy(groupedByCategory[group], fx => new Date(fx.utcKickoff).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }));
            
            Object.keys(groupedByDate).sort((a,b) => new Date(a.split('. ').join('.').split('.').reverse().join('-')) - new Date(b.split('. ').join('.').split('.').reverse().join('-'))).forEach(dateKey => {
                columnContent += `<details class="date-section" open><summary>${formatDateLabel(dateKey)}</summary>`;
                groupedByDate[dateKey].forEach(fx => {
                    const time = new Date(fx.utcKickoff).toLocaleTimeString('hu-HU', {timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit'});
                    columnContent += `
                        <div class="match-card" onclick="runAnalysis('${escape(fx.home)}', '${escape(fx.away)}')">
                            <div class="match-card-teams">${fx.home} – ${fx.away}</div>
                            <div class="match-card-meta">
                                <span>${fx.league}</span>
                                <span>${time}</span>
                            </div>
                        </div>`;
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

function renderFixturesForMobile(fixtures) {
    const groupedByDate = groupBy(fixtures, fx => new Date(fx.utcKickoff).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }));
    let html = '';

    Object.keys(groupedByDate).sort((a,b) => new Date(a.split('. ').join('.').split('.').reverse().join('-')) - new Date(b.split('. ').join('.').split('.').reverse().join('-'))).forEach(dateKey => {
        html += `<h4 class="date-header" style="padding: 1rem; border-bottom: 1px solid var(--border-color);">${formatDateLabel(dateKey)}</h4>`;
        groupedByDate[dateKey].forEach(fx => {
            const time = new Date(fx.utcKickoff).toLocaleTimeString('hu-HU', {timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit'});
            html += `
                <div class="list-item" onclick="runAnalysis('${escape(fx.home)}', '${escape(fx.away)}')">
                    <div>
                        <div class="list-item-title">${fx.home} – ${fx.away}</div>
                        <div class="list-item-meta">${fx.league} - ${time}</div>
                    </div>
                     <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>`;
        });
    });
    return html;
}

async function runAnalysis(home, away) {
    home = unescape(home);
    away = unescape(away);
    
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
        let analysisUrl = `${__gasUrl}?action=runAnalysis&home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}&sport=${__currentSport}&force=true&sheetUrl=${encodeURIComponent(__sheetUrl)}`;
        const openingOdds = sessionStorage.getItem('openingOdds') || '{}';

        const response = await fetch(analysisUrl, {
            method: 'POST',
            body: JSON.stringify({ openingOdds: JSON.parse(openingOdds) }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        if (!response.ok) throw new Error(`Szerver válasz hiba: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        __currentAnalysisContext = data.html;
        __chatHistory = [];
        
        modalResults.innerHTML = `<div class="analysis-body">${data.html}</div>`;
        modalSkeleton.classList.remove('active');
        modalChat.style.display = 'block';
        modalChat.querySelector('#chat-messages').innerHTML = '';

        const portfolioData = extractDataForPortfolio(data.html, home, away);
        if (portfolioData && !__completedAnalyses.some(a => a.match === portfolioData.match)) {
            __completedAnalyses.push(portfolioData);
            updatePortfolioButton();
        }

    } catch (e) {
        modalResults.innerHTML = `<p style="color:var(--danger); text-align:center; padding: 2rem;">Hiba történt az elemzés során: ${e.message}</p>`;
        modalSkeleton.classList.remove('active');
    }
}

function updatePortfolioButton() {
    const btn = document.getElementById('portfolioBtn');
    const count = __completedAnalyses.length;
    btn.textContent = `Portfólió Építése (${count}/3)`;
    if (count >= 3) {
        btn.disabled = false;
    } else {
        btn.disabled = true;
    }
}

function extractDataForPortfolio(html, home, away) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        const bestBetCard = Array.from(doc.querySelectorAll('.summary-card h5')).find(h5 => h5.textContent.includes('AI Legjobb Tipp') || h5.textContent.includes('Legvalószínűbb kimenetel'));
        if (!bestBetCard) return null;

        const bestBet = bestBetCard.nextElementSibling.textContent.trim();
        const confidence = bestBetCard.nextElementSibling.nextElementSibling.querySelector('strong').textContent.trim();
        
        if (bestBet && confidence) {
            return {
                match: `${home} vs ${away}`,
                bestBet: bestBet,
                confidence: confidence
            };
        }
        return null;
    } catch (e) {
        console.error("Hiba az adatok kinyerésekor a portfólióhoz:", e);
        return null;
    }
}

async function buildPortfolio() {
    openModal('Napi Portfólió Építése', document.getElementById('loading-skeleton').outerHTML, 'modal-lg');
    document.querySelector('#modal-container #loading-skeleton').classList.add('active');

    try {
        const response = await fetch(__gasUrl, {
            method: 'POST',
            body: JSON.stringify({ action: 'buildPortfolio', analyses: __completedAnalyses }),
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

function handleSportChange() {
    __currentSport = document.getElementById('sportSelector').value;
    __completedAnalyses = [];
    updatePortfolioButton();
    if (!isMobile()) {
        document.getElementById('kanban-board').innerHTML = '';
        document.getElementById('placeholder').style.display = 'flex';
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

async function openHistoryModal() {
    if (!__sheetUrl) {
        const url = prompt("Kérlek, add meg a Google Táblázat URL-jét a napló megtekintéséhez:", "");
        if (url && url.startsWith('https://docs.google.com/spreadsheets/d/')) {
            __sheetUrl = url;
            localStorage.setItem('sheetUrl', url);
        } else if(url) {
            alert('Érvénytelen URL.');
            return;
        } else { return; }
    }
    const modalSize = isMobile() ? 'modal-fullscreen' : 'modal-lg';
    const loadingHTML = document.getElementById('loading-skeleton').outerHTML;
    openModal('Előzmények', loadingHTML, modalSize);
    document.querySelector('#modal-container #loading-skeleton').classList.add('active');

    try {
        const response = await fetch(`${__gasUrl}?action=getHistory&sheetUrl=${encodeURIComponent(__sheetUrl)}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        document.getElementById('modal-body').innerHTML = renderHistory(data.history);
    } catch (e) {
        document.getElementById('modal-body').innerHTML = `<p class="muted" style="color:var(--danger); text-align:center; padding: 2rem;">Hiba: ${e.message}</p>`;
    }
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
        alert('Mindkét csapat nevét meg kell adni.');
        return;
    }
    closeModal();
    runAnalysis(home, away);
}

function renderHistory(historyData) {
    if (!historyData || historyData.length === 0) {
        return '<p class="muted" style="text-align:center; padding: 2rem;">Nincsenek mentett előzmények.</p>';
    }
    const history = historyData.filter(item => item.home && item.away);
    const groupedByDate = groupBy(history, item => new Date(item.date).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }));
    
    let html = '';
    Object.keys(groupedByDate).sort((a,b) => new Date(b.split('. ').join('.').split('.').reverse().join('-')) - new Date(a.split('. ').join('.').split('.').reverse().join('-'))).forEach(dateKey => {
        html += `<details class="date-section"><summary>${formatDateLabel(dateKey)}</summary>`;
        const sortedItems = groupedByDate[dateKey].sort((a,b) => new Date(b.date) - new Date(a.date));
        
        sortedItems.forEach(item => {
            const time = new Date(item.date).toLocaleTimeString('hu-HU', {timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit'});
            html += `
                <div class="list-item">
                    <div style="flex-grow:1;" onclick="viewHistoryDetail('${item.id}')">
                        <div class="list-item-title">${item.home} – ${item.away}</div>
                        <div class="list-item-meta">${item.sport.charAt(0).toUpperCase() + item.sport.slice(1)} - ${time}</div>
                    </div>
                     <button class="btn" onclick="deleteHistoryItem('${item.id}'); event.stopPropagation();" title="Törlés">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
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
        const response = await fetch(`${__gasUrl}?action=getAnalysisDetail&sheetUrl=${encodeURIComponent(__sheetUrl)}&id=${id}`);
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
        __currentAnalysisContext = record.html;
        __chatHistory = [];
        
        modalChat.querySelector('#chat-messages').innerHTML = '';
        modalChat.querySelector('#chat-send-btn').onclick = sendChatMessage;
        modalChat.querySelector('#chat-input').onkeyup = (e) => e.key === "Enter" && sendChatMessage();

    } catch(e) {
        document.getElementById('modal-body').innerHTML = `<p style="color:var(--danger); text-align:center; padding: 2rem;">Hiba: ${e.message}</p>`;
    }
}

async function deleteHistoryItem(id) {
    if (!__sheetUrl || !confirm("Biztosan törölni szeretnéd ezt az elemet a naplóból?")) return;
    try {
        await fetch(__gasUrl, {
            method: 'POST',
            body: JSON.stringify({ action: 'deleteHistoryItem', sheetUrl: __sheetUrl, id: id }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        openHistoryModal();
    } catch (e) {
        alert(`Hiba a törlés során: ${e.message}`);
    }
}

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
        const response = await fetch(__gasUrl, {
            method: 'POST',
            body: JSON.stringify({ action: 'askChat', context: __currentAnalysisContext, history: __chatHistory, question: message }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        if (!response.ok) throw new Error(`Szerver hiba: ${response.statusText}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        addMessageToChat(data.answer, 'ai');
        __chatHistory.push({role: 'user', parts: [{ text: message }]});
        __chatHistory.push({role: 'model', parts: [{ text: data.answer }]});
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
