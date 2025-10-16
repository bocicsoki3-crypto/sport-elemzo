let __gasUrl = 'https://script.google.com/macros/s/AKfycbyN99ot1yzv4Na9nq0rTIsCSQ2DUlMMCzSKQmtM8fg7qDMAaFzHW8n_2Y8eNxnsFdabvg/exec';
let __fixtures = [];
let __currentSport = 'soccer';
let __historySportFilter = 'soccer';
let __sheetUrl = '';

// Kategóriák hierarchikus csoportosítása
const LEAGUE_CATEGORIES = {
    soccer: {
        '👑 Top Ligák': [ 'Champions League', 'Premier League', 'LaLiga', 'Bundesliga', 'Serie A' ],
        '🌍 Nemzetközi': [ 'FIFA World Cup', 'UEFA European Championship', 'Europa League', 'Conference League', 'UEFA Nations League', 'World Cup Qualifier' ],
        '🥈 Másodvonal': [ 'Championship', '2. Bundesliga', 'Ligue 2', 'Serie B', 'LaLiga2' ],
        '🌎 Világ Bajnokságai': [ 'MLS', 'Brazil Serie A', 'Argentinian Liga Profesional', 'Super Lig', 'Liga MX', 'Eredivisie', 'Liga Portugal', 'Jupiler Pro League', 'Premiership', 'Swiss Super League', 'Allsvenskan', 'Superliga', 'Eliteserien', 'Australian A-League', 'J1 League', 'K League 1', 'Primera A' ],
        '🏆 Kisebb Európai Ligák': [ 'Greek Super League', 'Austrian Bundesliga', 'HNL', 'Ekstraklasa', 'Chance Liga', 'NB I', 'Premier Division', 'Serie A Betano' ]
    },
    hockey: {
        '👑 Top Ligák': [ 'NHL' ],
        '🌍 Nemzetközi': [ 'IIHF World Championship', 'Olimpiai Játékok', 'Spengler Cup' ],
        '🏆 Kiemelt Európai Ligák': [ 'KHL', 'SHL', 'Finnish Liiga', 'German DEL', 'Swiss National League', 'Czech Extraliga' ]
    },
    basketball: {
        '👑 Top Ligák': [ 'NBA' ],
        '🌍 Nemzetközi': [ 'Euroleague', 'FIBA World Cup', 'Olimpiai Játékok', 'EuroBasket', 'FIBA Champions League', 'EuroCup' ],
        '🏆 Kiemelt Európai Ligák': [ 'Spanish Liga ACB', 'Italian Lega A', 'French LNB Pro A', 'German BBL', 'Turkish BSL' ]
    }
};

// Ikonok és leírások a kategóriákhoz
const LEAGUE_CHARACTERISTICS = {
    '👑 Top Ligák': { icon: '👑', description: 'A sportág abszolút csúcsa, a legjobb csapatokkal és játékosokkal.' },
    '🌍 Nemzetközi': { icon: '🌍', description: 'Válogatott és nemzetközi klubtornák.' },
    '🥈 Másodvonal': { icon: '🥈', description: 'A top ligák alatti, erős másodosztályú bajnokságok.' },
    '🌎 Világ Bajnokságai': { icon: '🌎', description: 'Jelentős bajnokságok Európán kívül.' },
    '🏆 Kiemelt Európai Ligák': { icon: '🏆', description: 'Erős, kiemelt európai nemzeti bajnokságok.' },
    '🏆 Kisebb Európai Ligák': { icon: '🏆', description: 'Közepes erősségű európai nemzeti bajnokságok.' }
};

// Robusztusabb kategória-kereső függvény
function getLeagueGroupAndIcon(leagueName) {
    const sportGroups = LEAGUE_CATEGORIES[__currentSport] || {};
    const lowerLeagueName = leagueName.toLowerCase();

    for (const groupName in sportGroups) {
        const hasLeague = sportGroups[groupName].some(l => lowerLeagueName.includes(l.toLowerCase()));
        if (hasLeague) {
            const icon = LEAGUE_CHARACTERISTICS[groupName]?.icon || '⚽';
            const description = LEAGUE_CHARACTERISTICS[groupName]?.description || 'Általános bajnokság';
            return { group: groupName, icon, description };
        }
    }
    return { group: 'Egyéb', icon: '⚽', description: 'Egyéb bajnokság' }; // Alapértelmezett csoport
}


function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);
}

document.addEventListener('DOMContentLoaded', () => {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            const tabId = button.getAttribute('data-tab');
            tabContents.forEach(content => {
                content.style.display = content.id === tabId ? 'block' : 'none';
                content.classList.toggle('active', content.id === tabId);
            });
            if (tabId === 'tab-history') loadSheetUrl();
        });
    });

    const themeSwitcher = document.getElementById('theme-switcher');
    const currentTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.className = `${currentTheme}-theme`;
    themeSwitcher.addEventListener('click', () => {
        let newTheme = document.documentElement.className === 'dark-theme' ? 'light' : 'dark';
        document.documentElement.className = `${newTheme}-theme`;
        localStorage.setItem('theme', newTheme);
    });

    const controlsAccordion = document.getElementById('controls-accordion');
    if (window.innerWidth <= 1024 && controlsAccordion) {
        controlsAccordion.removeAttribute('open');
    }

    if(!__gasUrl||!__gasUrl.startsWith('https://script.google.com')){
        document.getElementById('userInfo').textContent='HIBA: Web App URL nincs beállítva!';
        document.getElementById('userInfo').style.color = 'var(--danger)';
    } else {
        document.getElementById('userInfo').textContent=`Csatlakozva`;
    }
    loadSheetUrl();
});

async function loadFixtures() {
    const listEl = document.getElementById('fixtures-list');
    const loadBtn = document.getElementById('loadFixturesBtn');
    listEl.innerHTML = '<p class="muted" style="text-align:center;">Adatok lekérése...</p>';
    loadBtn.disabled = true;
    try {
        const response = await fetch(`${__gasUrl}?action=getFixtures&sport=${__currentSport}&days=2`);
        if (!response.ok) throw new Error(`Hálózati hiba: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        __fixtures = data.fixtures || [];
        sessionStorage.setItem('openingOdds', JSON.stringify(data.odds || {}));

        // --- ÚJ RÉSZ: Intelligens csoportosítás ---
        const groupedByMasterCategory = __fixtures.reduce((acc, fx) => {
            const { group, icon, description } = getLeagueGroupAndIcon(fx.league);
            if (!acc[group]) {
                acc[group] = { leagues: {}, icon, description };
            }
            if (!acc[group].leagues[fx.league]) {
                acc[group].leagues[fx.league] = [];
            }
            acc[group].leagues[fx.league].push(fx);
            return acc;
        }, {});

        // Meghatározott sorrend a főcsoportoknak
        const groupOrder = ['👑 Top Ligák', '🌍 Nemzetközi', '🏆 Kiemelt Európai Ligák', '🥈 Másodvonal', '🌎 Világ Bajnokságai', '🏆 Kisebb Európai Ligák', 'Egyéb'];
        let html = '';

        for (const masterGroup of groupOrder) {
            if (groupedByMasterCategory[masterGroup]) {
                html += `<div class="league-master-group">`;
                html += `<div class="league-master-group-header">${masterGroup}</div>`;

                for (const leagueName in groupedByMasterCategory[masterGroup].leagues) {
                    const { icon, description } = getLeagueGroupAndIcon(leagueName);
                    const tagHtml = `<span class="league-category-tag" title="${description}">${icon}</span>`;

                    html += `<details class="league-group">`;
                    html += `<summary class="league-header"><span>${leagueName}</span>${tagHtml}</summary>`;
                    groupedByMasterCategory[masterGroup].leagues[leagueName].forEach(fx => {
                        const d = new Date(fx.utcKickoff).toLocaleString('hu-HU', { dateStyle: 'short', timeStyle: 'short' });
                        html += `
                            <div class="list-item" onclick="fillAndAnalyze('${escapeHtml(fx.home)}','${escapeHtml(fx.away)}')">
                                <div>
                                    <div class="list-item-title">${escapeHtml(fx.home)} – ${escapeHtml(fx.away)}</div>
                                    <div class="list-item-meta">${d}</div>
                                </div>
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px; color: var(--text-secondary);"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </div>
                        `;
                    });
                    html += `</details>`;
                }
                html += `</div>`;
            }
        }
        // --- Csoportosítás Vége ---

        listEl.innerHTML = html || '<p class="muted" style="text-align:center;">Nincs megjeleníthető mérkőzés.</p>';

    } catch (e) {
        listEl.innerHTML = `<p class="muted" style="color:var(--danger);">${e.message}</p>`;
    } finally {
        loadBtn.disabled = false;
    }
}


// --- A kód többi része változatlan ---
function handleSportChange(){__currentSport=document.getElementById('sportSelector').value;document.getElementById('fixtures-list').innerHTML='';__fixtures=[]}
function fillAndAnalyze(a,b){document.getElementById("home").value=a;document.getElementById("away").value=b;runAnalysis(!0)}
async function runAnalysis(a=!1){const b=document.getElementById("home").value.trim(),c=document.getElementById("away").value.trim(),d=document.getElementById("analysis-results"),e=document.getElementById("placeholder"),f=document.getElementById("loading-skeleton"),g=document.getElementById("progress-container"),h=document.getElementById("progress-bar-inner"),i=document.getElementById("status");if(d.innerHTML="",e.style.display="none",f.style.display="block",g.style.display="block",h.style.width="0%",i.textContent="",!b||!c)return d.innerHTML='<p style="color:var(--danger); text-align:center;">Hiba: Mindkét csapat nevét meg kell adni.</p>',f.style.display="none",g.style.display="none",void(e.style.display="flex");if(window.innerWidth<=1024){const j=document.getElementById("controls-accordion");j&&j.removeAttribute("open"),d.innerHTML="",e.style.display="flex"}let k=0;const l=(n,o)=>{k=Math.max(k,n),h.style.width=`${k}%`,i.textContent=o};try{l(5,"Elemzés indítása...");let m=`${__gasUrl}?action=runAnalysis&home=${encodeURIComponent(b)}&away=${encodeURIComponent(c)}&sport=${__currentSport}&force=${a}&sheetUrl=${encodeURIComponent(__sheetUrl)}`;const p=sessionStorage.getItem("openingOdds")||"{}";fetch(m,{method:"POST",mode:"no-cors",body:JSON.stringify({openingOdds:JSON.parse(p)})}),l(10,"Adatok lekérése a szerverről...");const q=setInterval(()=>{k<85&&l(k+5*Math.random(),"AI elemzés és szimuláció futtatása...")},800);await new Promise(r=>setTimeout(r,9e3)),clearInterval(q),l(90,"Válasz feldolgozása...");const s=await fetch(`${m}&force=false`);if(!s.ok)throw new Error(`Szerver válasz hiba: ${s.status}`);const t=await s.json();if(t.error)throw new Error(t.error);l(100,"Kész.");const u=`<div class="analysis-body">${t.html}</div>`;window.innerWidth<=1024?openAnalysisModal(u):d.innerHTML=u,__sheetUrl&&document.querySelector('.tab-btn[data-tab="tab-history"]').classList.contains("active")&&loadHistory()}catch(v){d.innerHTML=`<p style="color:var(--danger); text-align:center;">Hiba: ${v.message}</p>`}finally{f.style.display="none",setTimeout(()=>{g.style.display="none"},2e3)}}
function openAnalysisModal(a){const b=document.getElementById("analysis-modal"),c=document.getElementById("modal-body");c.innerHTML=a,b.style.display="flex"}
function closeAnalysisModal(a){const b=document.getElementById("analysis-modal");(!a||a.target===b||a.target.classList.contains("modal-close-btn"))&&(b.style.display="none",document.getElementById("modal-body").innerHTML="")}
function saveSheetUrl(){(__sheetUrl=document.getElementById("sheetUrl").value)&&__sheetUrl.startsWith("https://docs.google.com/spreadsheets/d/")?(localStorage.setItem("sheetUrl",__sheetUrl),alert("Táblázat URL elmentve!"),loadSheetUrl()):alert("Érvénytelen Google Táblázat URL!")}
function loadSheetUrl(){if(__sheetUrl=localStorage.getItem("sheetUrl")){document.querySelector('.tab-btn[data-tab="tab-history"]').classList.contains("active")&&loadHistory()}else{const a=document.getElementById("history");a&&(a.innerHTML=`
                <p class="muted">A funkcióhoz add meg a Google Táblázat URL-jét.</p>
                <label for="sheetUrl">Google Táblázat URL</label>
                <input id="sheetUrl" placeholder="https://docs.google.com/spreadsheets/d/..." onchange="saveSheetUrl()">`)}}
async function logBet(a){if(!__sheetUrl)return void alert("Kérlek, add meg a Google Táblázat URL-jét a naplózáshoz!");const b=event.target;b.disabled=!0,b.textContent="Naplózás...";try{await fetch(`${__gasUrl}`,{method:"POST",mode:"no-cors",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"logBet",sheetUrl:__sheetUrl,bet:a})}),b.textContent="Sikeresen Naplózva ✅"}catch(c){alert(`Hiba a naplózás során: ${c.message}.`),b.textContent="Naplózás Sikertelen"}}
async function loadHistory(){if(!__sheetUrl)return;document.getElementById("history").innerHTML='<p class="muted">Előzmények betöltése...</p>';try{const a=await fetch(`${__gasUrl}?action=getHistory&sheetUrl=${encodeURIComponent(__sheetUrl)}`),b=await a.json();if(b.error)throw new Error(b.error);renderHistory(b.history)}catch(c){document.getElementById("history").innerHTML=`<p class="muted" style="color:var(--danger)">Hiba a napló betöltésekor: ${c.message}</p>`}}
function filterHistory(a){const b=document.getElementById("historySearch").value.toLowerCase(),c=a.filter(d=>d.sport===__historySportFilter&&(d.home.toLowerCase().includes(b)||d.away.toLowerCase().includes(b)));renderHistory(c,!0)}
function renderHistory(a,b=!1){const c=document.getElementById("history");b||sessionStorage.setItem("fullHistory",JSON.stringify(a));const d=`
        <input id="historySearch" placeholder="Keresés a naplóban..." oninput="filterHistory(JSON.parse(sessionStorage.getItem('fullHistory') || '[]'))" style="margin-bottom:0.8rem"/>
        <div class="sport-filter-container">
            <button class="sport-filter-btn ${"soccer"===__historySportFilter?"active":""}" onclick="filterHistoryBySport('soccer', this)" title="Labdarúgás">⚽</button>
            <button class="sport-filter-btn ${"hockey"===__historySportFilter?"active":""}" onclick="filterHistoryBySport('hockey', this)" title="Jégkorong">🏒</button>
            <button class="sport-filter-btn ${"basketball"===__historySportFilter?"active":""}" onclick="filterHistoryBySport('basketball', this)" title="Kosárlabda">🏀</button>
        </div>
    `;if(!a||0===a.length)return void(c.innerHTML=d+'<p class="muted" style="text-align:center;">Nincsenek előzmények ebben a kategóriában.</p>');const e=a.reduce((f,g)=>{const h=(new Date(g.date)).toISOString().split("T")[0];return f[h]||(f[h]=[]),f[h].push(g),f},{});let i="";const j=Object.keys(e).sort((f,g)=>new Date(g)-new Date(f));for(const k of j){i+='<details class="history-group">',i+=`<summary class="history-date-header">${(new Date(k)).toLocaleDateString("hu-HU",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</summary>`,e[k].sort((f,g)=>new Date(g.date)-new Date(f.date)).forEach(l=>{i+=`
                <div class="list-item">
                    <div onclick="loadAnalysisFromHistory('${l.id}')" style="flex-grow:1;">
                        <div class="list-item-title">${escapeHtml(l.home)} – ${escapeHtml(l.away)}</div>
                        <div class="list-item-meta">${(new Date(l.date)).toLocaleTimeString("hu-HU",{hour:"2-digit",minute:"2-digit"})}</div>
                    </div>
                    <div style="display:flex;gap:5px">
                        <a href="#" class="action-icon" onclick="loadAnalysisFromHistory('${l.id}')" title="Elemzés Megtekintése"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></a>
                        <a href="#" class="action-icon delete" onclick="deleteHistoryItem('${l.id}')" title="Törlés"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></a>
                    </div>
                </div>
            `}),i+="</details>"}c.innerHTML=d+i}
function filterHistoryBySport(a,b){__historySportFilter=a,document.querySelectorAll(".sport-filter-btn").forEach(c=>c.classList.remove("active")),b.classList.add("active"),filterHistory(JSON.parse(sessionStorage.getItem("fullHistory")||"[]"))}
async function loadAnalysisFromHistory(a){if(event.preventDefault(),!__sheetUrl)return;const b=document.getElementById("analysis-results"),c=document.getElementById("placeholder"),d=document.getElementById("loading-skeleton");b.innerHTML="",c.style.display="none",d.style.display="block";try{const e=await fetch(`${__gasUrl}?action=getAnalysisDetail&sheetUrl=${encodeURIComponent(__sheetUrl)}&id=${a}`),f=await e.json();if(f.error)throw new Error(f.error);const g=`<div class="analysis-body">${f.record.html}</div>`;window.innerWidth<=1024?openAnalysisModal(g):b.innerHTML=g}catch(h){b.innerHTML=`<p style="color:var(--danger); text-align:center;">Hiba az elemzés betöltésekor: ${h.message}</p>`}finally{d.style.display="none",window.innerWidth>1024?c.style.display="none":c.style.display="flex"}}
async function deleteHistoryItem(a){event.preventDefault(),__sheetUrl&&confirm("Biztosan törölni szeretnéd ezt az elemet a központi naplóból?")&&await fetch(`${__gasUrl}`,{method:"POST",mode:"no-cors",body:JSON.stringify({action:"deleteHistoryItem",sheetUrl:__sheetUrl,id:a})}).then(()=>{alert("Elem sikeresen törölve."),loadHistory()}).catch(b=>{alert(`Hiba a törlés során: ${b.message}`)})}
