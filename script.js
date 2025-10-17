let __gasUrl = 'https://script.google.com/macros/s/AKfycbyN99ot1yzv4Na9nq0rTIsCSQ2DUlMMCzSKQmtM8fg7qDMAaFzHW8n_2Y8eNxnsFdabvg/exec';
let __fixtures = [];
let __currentSport = 'soccer';
let __sheetUrl = '';
let __currentAnalysisContext = '';
let __chatHistory = [];

const LEAGUE_CATEGORIES = {
    soccer: {
        '🎯 Prémium Elemzés': [ 'Champions League', 'Premier League', 'Bundesliga', 'LaLiga', 'Serie A' ],
        '📈 Stabil Ligák': [ 'Europa League', 'Ligue 1', 'Eredivisie', 'Liga Portugal' ],
        '❔ Változékony Mezőny': [ 'Championship', '2. Bundesliga', 'Serie B', 'LaLiga2', 'Super Lig', 'Premiership', 'MLS' ],
        '🎲 Vad Kártyák': [ 'FIFA World Cup', 'UEFA European Championship', 'Conference League', 'Brazil Serie A', 'Argentinian Liga Profesional', 'Greek Super League', 'Nemzetek Ligája', 'Kupa', 'Copa', 'Cup' ]
    },
    hockey: { '🎯 Prémium Elemzés': [ 'NHL' ], '📈 Stabil Ligák': [ 'KHL', 'SHL', 'Liiga', 'DEL', 'AHL', 'ICEHL', 'Champions Hockey League' ], '🎲 Vad Kártyák': [ 'IIHF World Championship', 'Olimpiai Játékok', 'Spengler Cup', 'Extraliga' ] },
    basketball: { '🎯 Prémium Elemzés': [ 'NBA', 'Euroleague' ], '📈 Stabil Ligák': [ 'Spanish Liga ACB', 'Turkish BSL', 'German BBL', 'Italian Lega A' ], '🎲 Vad Kártyák': [ 'FIBA World Cup', 'Olimpiai Játékok', 'EuroBasket', 'FIBA Champions League', 'EuroCup', 'LNB Pro A' ] }
};

document.addEventListener('DOMContentLoaded', () => {
    const themeSwitcher = document.getElementById('theme-switcher');
    const currentTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.className = `${currentTheme}-theme`;
    themeSwitcher.addEventListener('click', () => {
        let newTheme = document.documentElement.className === 'dark-theme' ? 'light' : 'dark';
        document.documentElement.className = `${newTheme}-theme`;
        localStorage.setItem('theme', newTheme);
    });

    if(!__gasUrl||!__gasUrl.startsWith('https://script.google.com')){
        document.getElementById('userInfo').textContent='HIBA: URL nincs beállítva!';
        document.getElementById('userInfo').style.color = 'var(--danger)';
    } else {
        document.getElementById('userInfo').textContent=`Csatlakozva`;
    }
    document.getElementById('chat-send-btn').addEventListener('click', sendChatMessage);
    document.getElementById('chat-input').addEventListener('keyup', (e) => e.key === "Enter" && sendChatMessage());
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
            renderFixturesForMobile(__fixtures);
            openModal('Mérkőzések');
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
    const groupedByDate = groupBy(fixtures, fx => new Date(fx.utcKickoff).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }));

    let columns = groupOrder.reduce((acc, group) => ({...acc, [group]: ''}), {});

    Object.keys(groupedByDate).sort((a,b) => new Date(a.split('. ').join('.').split('.').reverse().join('-')) - new Date(b.split('. ').join('.').split('.').reverse().join('-'))).forEach(dateKey => {
        const fixturesForDate = groupedByDate[dateKey];
        const groupedByCategory = groupBy(fixturesForDate, fx => getLeagueGroup(fx.league));

        groupOrder.forEach(group => {
            if (groupedByCategory[group]) {
                columns[group] += `<h5 class="date-header">${formatDateLabel(dateKey)}</h5>`;
                groupedByCategory[group].forEach(fx => {
                    const time = new Date(fx.utcKickoff).toLocaleTimeString('hu-HU', {timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit'});
                    columns[group] += `
                        <div class="match-card" onclick="runAnalysis('${escape(fx.home)}', '${escape(fx.away)}')">
                            <div class="match-card-teams">${fx.home} – ${fx.away}</div>
                            <div class="match-card-meta">
                                <span>${fx.league}</span>
                                <span>${time}</span>
                            </div>
                        </div>`;
                });
            }
        });
    });

    groupOrder.forEach(group => {
        board.innerHTML += `
            <div class="kanban-column">
                <h4 class="kanban-column-header">${group}</h4>
                <div class="column-content">
                    ${columns[group] || '<p class="muted">Nincs meccs ebben a kategóriában.</p>'}
                </div>
            </div>`;
    });
}

function renderFixturesForMobile(fixtures) {
    const mobileBody = document.getElementById('modal-body');
    const groupedByDate = groupBy(fixtures, fx => new Date(fx.utcKickoff).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }));
    let html = '';

    Object.keys(groupedByDate).sort((a,b) => new Date(a.split('. ').join('.').split('.').reverse().join('-')) - new Date(b.split('. ').join('.').split('.').reverse().join('-'))).forEach(dateKey => {
        html += `<h4 class="date-header">${formatDateLabel(dateKey)}</h4>`;
        groupedByDate[dateKey].forEach(fx => {
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
    });
    mobileBody.innerHTML = html;
}

async function runAnalysis(home, away) {
    home = unescape(home);
    away = unescape(away);

    const skeleton = document.getElementById('loading-skeleton');
    const resultsEl = document.getElementById('analysis-results');
    const chatContainer = document.getElementById('chat-container');

    resultsEl.innerHTML = '';
    chatContainer.style.display = 'none';
    skeleton.classList.add('active');

    if(isMobile()) {
        openModal('Elemzés');
        const modalBody = document.getElementById('modal-body');
        modalBody.innerHTML = '';
        modalBody.appendChild(skeleton);
        modalBody.appendChild(resultsEl);
        modalBody.appendChild(chatContainer);
    } else {
        openAnalysisPanel(`${home} vs ${away}`);
    }

    try {
        let analysisUrl = `${__gasUrl}?action=runAnalysis&home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}&sport=${__currentSport}&force=true&sheetUrl=${encodeURIComponent(__sheetUrl)}`;
        const openingOdds = sessionStorage.getItem('openingOdds') || '{}';

        const response = await fetch(analysisUrl, {
            method: 'POST',
            body: JSON.stringify({ openingOdds: JSON.parse(openingOdds) }),
            headers: { 'Content-Type': 'text/plain' }
        });
        if (!response.ok) throw new Error(`Szerver válasz hiba: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        __currentAnalysisContext = data.html;
        __chatHistory = [];
        
        const targetResultsEl = isMobile() ? document.querySelector('#modal-body #analysis-results') : document.getElementById('analysis-results');
        const targetSkeleton = isMobile() ? document.querySelector('#modal-body #loading-skeleton') : document.getElementById('loading-skeleton');
        const targetChat = isMobile() ? document.querySelector('#modal-body #chat-container') : document.getElementById('chat-container');

        targetResultsEl.innerHTML = `<div class="analysis-body">${data.html}</div>`;
        targetSkeleton.classList.remove('active');
        targetChat.style.display = 'block';
        targetChat.querySelector('#chat-messages').innerHTML = '';

    } catch (e) {
        const targetEl = isMobile() ? document.querySelector('#modal-body #analysis-results') : resultsEl;
        targetEl.innerHTML = `<p style="color:var(--danger); text-align:center;">Hiba: ${e.message}</p>`;
        if(isMobile()) document.querySelector('#modal-body #loading-skeleton').classList.remove('active');
        else skeleton.classList.remove('active');
    }
}

function handleSportChange() {
    __currentSport = document.getElementById('sportSelector').value;
    if (!isMobile()) {
        document.getElementById('kanban-board').innerHTML = '';
        document.getElementById('placeholder').style.display = 'flex';
    }
}

function openAnalysisPanel(title) {
    document.getElementById('panel-title').textContent = title;
    document.getElementById('analysis-panel').classList.add('open');
}
function closeAnalysisPanel() { document.getElementById('analysis-panel').classList.remove('open'); }

function openModal(title, content = '') {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = content;
    document.getElementById('modal-container').classList.add('open');
}
function closeModal() { document.getElementById('modal-container').classList.remove('open'); }

async function openHistoryModal() {
    if (!__sheetUrl) {
        const url = prompt("Kérlek, add meg a Google Táblázat URL-jét a napló megtekintéséhez:", "");
        if (url && url.startsWith('https://docs.google.com/spreadsheets/d/')) {
            __sheetUrl = url;
            localStorage.setItem('sheetUrl', url);
        } else {
            alert('Érvénytelen URL.');
            return;
        }
    }
    openModal('Előzmények', '<p class="muted">Előzmények betöltése...</p>');
    try {
        const response = await fetch(`${__gasUrl}?action=getHistory&sheetUrl=${encodeURIComponent(__sheetUrl)}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        renderHistory(data.history, 'modal-body');
    } catch (e) {
        document.getElementById('modal-body').innerHTML = `<p class="muted" style="color:var(--danger)">Hiba: ${e.message}</p>`;
    }
}

function openManualAnalysisModal() {
    let content = `
        <div class="control-group"><label for="manual-home">Hazai csapat</label><input id="manual-home" placeholder="Pl. Liverpool"/></div>
        <div class="control-group" style="margin-top: 1rem;"><label for="manual-away">Vendég csapat</label><input id="manual-away" placeholder="Pl. Manchester City"/></div>
        <button class="btn btn-primary" onclick="runManualAnalysis()" style="width:100%; margin-top:1.5rem;">Elemzés Futtatása</button>
    `;
    openModal('Kézi Elemzés', content);
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

function renderHistory(historyData, targetElementId) {
    const targetEl = document.getElementById(targetElementId);
    const history = historyData.filter(item => item.home && item.away);
    if (!history || history.length === 0) {
        targetEl.innerHTML = '<p class="muted">Nincsenek mentett előzmények.</p>';
        return;
    }
    let html = '';
    history.forEach(item => {
        const date = new Date(item.date).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest', dateStyle: 'short', timeStyle: 'short'});
        html += `<div class="list-item" onclick="runAnalysis('${escape(item.home)}', '${escape(item.away)}')">
                    <div>
                        <div class="list-item-title">${item.home} – ${item.away}</div>
                        <div class="list-item-meta">${item.sport} - ${date}</div>
                    </div>
                     <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>`;
    });
    targetEl.innerHTML = html;
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
    const input = document.querySelector('#chat-input');
    const message = input.value.trim();
    if (!message) return;
    addMessageToChat(message, 'user');
    input.value = '';
    document.querySelector('#chat-thinking-indicator').style.display = 'block';

    try {
        const response = await fetch(__gasUrl, {
            method: 'POST',
            body: JSON.stringify({ action: 'askChat', context: __currentAnalysisContext, history: __chatHistory, question: message }),
            headers: { 'Content-Type': 'text/plain' }
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
        document.querySelector('#chat-thinking-indicator').style.display = 'none';
    }
}

function addMessageToChat(text, role) {
    const messagesContainer = document.querySelector('#chat-messages');
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role}`;
    bubble.textContent = text;
    messagesContainer.appendChild(bubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
