/**
 * Ez a szkript felel a "The King AI" sportelemző irányítópult kliensoldali működéséért.
 * Kezeli a mérkőzések betöltését, a felhasználói interakciókat (kiválasztás, elemzés indítása),
 * és dinamikusan generálja a modális ablak tartalmát.
 */

// Az eseményfigyelő biztosítja, hogy a szkript csak a teljes HTML dokumentum betöltődése után fusson le.
document.addEventListener('DOMContentLoaded', () => {
    // Kezdeti meccsek betöltése az oldal indulásakor a felhasználói élmény javítása érdekében.
    loadFixtures();
});

// --- GLOBÁLIS VÁLTOZÓK ÉS DOM ELEMEK ---
// A gyakran használt elemeket egyszerre olvassuk be a DOM-ból a jobb teljesítmény érdekében.
let selectedMatches = [];
const kanbanBoard = document.getElementById('kanban-board');
const selectedCountSpan = document.getElementById('selected-count');
const openAnalysisBtn = document.getElementById('openAnalysisBtn');
const sportSelect = document.getElementById('sportSelect');
const modalContainer = document.getElementById('modal-container');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');


// --- FŐ FUNKCIÓK ---

/**
 * Betölti és megjeleníti a mérkőzéseket a Kanban táblán.
 * A valós működéshez ezt a részt kell összekötni a saját backend API-val.
 */
function loadFixtures() {
    kanbanBoard.innerHTML = ''; // Előző meccsek törlése egy új betöltés előtt.
    selectedMatches = [];
    updateSelectedCount();

    // MINTA ADATOK - Ezt a részt cseréld le a saját API hívásodra!
    const mockFixtures = {
        "Mai Kiemelt": [
            { id: 1, home: 'Ferencváros', away: 'Debrecen', league: 'NB I', utcKickoff: new Date() },
            { id: 2, home: 'Real Madrid', away: 'Barcelona', league: 'La Liga', utcKickoff: new Date(Date.now() + 2 * 60 * 60 * 1000) }
        ],
        "Holnapi Rangadók": [
            { id: 3, home: 'Liverpool', away: 'Man City', league: 'Premier League', utcKickoff: new Date(Date.now() + 24 * 60 * 60 * 1000) },
        ],
        "Közelgő": [
             { id: 4, home: 'Bayern München', away: 'Dortmund', league: 'Bundesliga', utcKickoff: new Date(Date.now() + 48 * 60 * 60 * 1000) }
        ]
    };

    // Oszlopok és kártyák dinamikus létrehozása az adatok alapján.
    for (const category in mockFixtures) {
        const column = createKanbanColumn(category);
        mockFixtures[category].forEach(fixture => {
            const card = createMatchCard(fixture);
            column.querySelector('.kanban-column-body').appendChild(card);
        });
        kanbanBoard.appendChild(column);
    }
}

/**
 * Megnyitja az elemző modális ablakot a kiválasztott mérkőzés(ek)hez.
 * Jelenleg az első kiválasztott meccset elemzi.
 */
function openAnalysisForSelected() {
    if (selectedMatches.length === 0) return; [cite_start]// Ne csináljon semmit, ha nincs kiválasztott meccs. [cite: 9]
    
    const matchData = selectedMatches[0]; [cite_start]// [cite: 10]
    const sport = sportSelect.value;
    
    openModal(`Elemzés: ${matchData.home} vs ${matchData.away}`);
    // Professzionális betöltésjelző használata, melynek stílusát a CSS kezeli.
    modalBody.innerHTML = '<div class="loading-spinner"></div>'; [cite_start]// [cite: 11]

    // Az elemzési folyamat elindítása a te logikád szerint.
    analyzeMatch(sport, matchData.home, matchData.away);
}

/**
 * FONTOS: Ez a te elemző függvényed helye.
 * Ebbe a függvénybe kell beillesztened a saját, szerverrel kommunikáló elemző logikádat.
 * A hívás végén meg kell hívnia a `renderAnalysisContent` függvényt az eredménnyel.
 * @param {string} sport - A kiválasztott sportág (pl. 'soccer').
 * @param {string} homeTeam - A hazai csapat neve.
 * @param {string} awayTeam - A vendég csapat neve.
 */
function analyzeMatch(sport, homeTeam, awayTeam) {
    console.log(`Elemzés indítva: Sportág=${sport}, Meccs=${homeTeam} vs ${awayTeam}`);
    
    // ----- IDE ILLSZD BE A SAJÁT API HÍVÁSODAT ÉS ADATFELDOLGOZÁSODAT -----
    
    // Egy hálózati kérés szimulálása (1.5 másodperc késleltetés).
    // A valóságban itt egy fetch() vagy axios hívás lenne.
    setTimeout(() => {
        // A te kódodban ez az adat az API válaszából fog érkezni.
        const analysisResult = getMockAnalysisData({ home: homeTeam, away: awayTeam });

        // Az eredmény megjelenítése a modális ablakban az adatokkal.
        renderAnalysisContent(analysisResult);
    }, 1500);
}


// --- SEGÉDFÜGGVÉNYEK: UI ELEMEK, KIVÁLASZTÁS, MODÁLIS ABLAK ---

/**
 * Létrehoz egy Kanban oszlopot a megadott címmel.
 * @param {string} title - Az oszlop címe.
 * @returns {HTMLElement} A kész HTML elem.
 */
function createKanbanColumn(title) {
    const column = document.createElement('div');
    column.className = 'kanban-column';
    column.innerHTML = `
        <div class="kanban-column-header">${title}</div>
        <div class="kanban-column-body"></div>
    `;
    return column;
}

/**
 * [cite_start]Létrehoz egy meccskártyát a megadott adatokból. [cite: 1]
 * @param {object} fixture - A mérkőzés adatai.
 * @returns {HTMLElement} A kész HTML elem.
 */
function createMatchCard(fixture) {
    const card = document.createElement('div');
    card.className = 'match-card';
    card.dataset.matchId = fixture.id || `${fixture.home}-${fixture.away}`; [cite_start]// [cite: 2]
    card.innerHTML = `
        <div class="match-card-teams">${fixture.home} vs ${fixture.away}</div>
        <div class="match-card-meta">
            <span>${new Date(fixture.utcKickoff).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            <span>${fixture.league}</span>
        </div>
    `;
    // Eseményfigyelő hozzáadása a kiválasztás kezeléséhez.
    card.addEventListener('click', () => toggleMatchSelection(card, fixture)); [cite_start]// [cite: 3]
    return card;
}

/**
 * Kezeli egy meccskártya kiválasztását vagy a kiválasztás megszüntetését.
 * A kinézetet CSS osztályokkal kezeli a direkt stílusmódosítás helyett, ami a helyes gyakorlat.
 * @param {HTMLElement} card - A HTML kártya elem, amire kattintottak.
 * @param {object} fixture - A kártyához tartozó meccs adatai.
 */
function toggleMatchSelection(card, fixture) {
    const matchId = card.dataset.matchId;
    const index = selectedMatches.findIndex(m => (m.id || `${m.home}-${m.away}`) === matchId); [cite_start]// [cite: 4]

    [cite_start]if (index > -1) { // [cite: 5]
        selectedMatches.splice(index, 1); [cite_start]// Eltávolítás a listából [cite: 5]
    } else {
        selectedMatches.push(fixture); // Hozzáadás a listához
    }
    
    // A `.selected` CSS osztály ki-be kapcsolása. A stílust a style.css kezeli.
    [cite_start]// Ez lecseréli a régi "card.style.border = '...'" megoldást. [cite: 6, 7]
    card.classList.toggle('selected');
    updateSelectedCount();
[cite_start]} // [cite: 8]

/**
 * Frissíti a kiválasztott meccsek számát a felületen.
 */
function updateSelectedCount() {
    selectedCountSpan.textContent = selectedMatches.length;
    openAnalysisBtn.disabled = selectedMatches.length === 0; [cite_start]// [cite: 9]
}

/**
 * Megnyitja a modális ablakot.
 * @param {string} title - Az ablak címe.
 */
function openModal(title) {
    modalTitle.textContent = title;
    modalContainer.classList.add('open');
}

/**
 * Bezárja a modális ablakot.
 */
function closeModal() {
    modalContainer.classList.remove('open');
}

// --- TARTALOMGENERÁLÓ FÜGGVÉNYEK ---

/**
 * Ez a függvény felel az elemzés vizuális megjelenítéséért a modális ablakban.
 * Egyetlen adat objektumot vár, és abból építi fel a teljes HTML struktúrát.
 * A modern "template literal" használata gyors és könnyen karbantartható.
 * @param {object} data - Az elemzés eredményeit tartalmazó objektum.
 */
function renderAnalysisContent(data) {
    modalBody.innerHTML = `
        <h3 class="analysis-section-title">Pillanatkép</h3>
        <div class="at-a-glance-grid">
            <div class="summary-card">
                <h5>Alap Valószínűségek</h5>
                <div class="details">
                    <span style="color: var(--primary);">${(data.probabilities.home * 100).toFixed(0)}%</span> H / 
                    ${(data.probabilities.draw * 100).toFixed(0)}% D / 
                    ${(data.probabilities.away * 100).toFixed(0)}% V
                </div>
            </div>
            <div class="summary-card">
                <h5>Várható Eredmény (xG)</h5>
                <div class="value">${data.xG.home.toFixed(2)} - ${data.xG.away.toFixed(2)}</div>
            </div>
            <div class="summary-card">
                <h5>Fő Gólszám Vonal (2.5)</h5>
                <div class="details">
                    Over: <strong class="glow-text">${data.overUnder.over}%</strong><br>
                    Under: <strong class="glow-text">${data.overUnder.under}%</strong>
                </div>
            </div>
             <div class="summary-card">
                <h5>Modell Bizalom</h5>
                <div class="value">${data.confidence}/10</div>
            </div>
        </div>

        <h3 class="analysis-section-title">Fogadási Piacok</h3>
        <div class="market-card-grid">
            <div class="market-card"><div class="market-card-title">1X2</div><div class="market-card-value">${data.markets['1x2'].join(' / ')}</div></div>
            <div class="market-card"><div class="market-card-title">Gólok O/U 2.5</div><div class="market-card-value">${data.markets.ou2_5[0]} / ${data.markets.ou2_5[1]}</div></div>
            <div class="market-card"><div class="market-card-title">BTTS</div><div class="market-card-value">${data.markets.btts[0]} / ${data.markets.btts[1]}</div></div>
            <div class="market-card"><div class="market-card-title">Szögletek O/U 9.5</div><div class="market-card-value">${data.markets.corners[0]} / ${data.markets.corners[1]}</div></div>
            <div class="market-card"><div class="market-card-title">Lapok O/U 4.5</div><div class="market-card-value">${data.markets.cards[0]} / ${data.markets.cards[1]}</div></div>
            <div class="market-card"><div class="market-card-title">Félidő 1X2</div><div class="market-card-value">${data.markets.halftime.join(' / ')}</div></div>
        </div>

        <h3 class="analysis-section-title">Szöveges Elemzés</h3>
        <div class="analysis-text-content">
            <h4>Általános Elemzés</h4>
            <p>${data.analysis.general}</p>
            <h4>Profétal Forgatókönyv</h4>
            <p>${data.analysis.scenario}</p>
        </div>
    `;
}

/**
 * Mintaadatokat generál az elemzéshez.
 * A te kódodban az itt lévő adatokat a szerver fogja szolgáltatni.
 */
function getMockAnalysisData(match) {
    return {
        probabilities: { home: 0.71, draw: 0.19, away: 0.10 },
        xG: { home: 2.24, away: 0.50 },
        overUnder: { over: 51.6, under: 48.4 },
        confidence: 8.5,
        markets: {
            '1x2': [1.30, 4.50, 8.00],
            'ou2_5': [1.85, 1.95],
            'btts': [1.90, 1.80],
            'corners': [1.88, 1.88],
            'cards': [1.92, 1.82],
            'halftime': [1.80, 2.50, 6.50]
        },
        analysis: {
            general: `A statisztikai modellek és a várható gólok (xG) mutatói egyértelműen a <strong class="highlight">${match.home}</strong> fölényét vetítik előre. A 71%-os győzelmi valószínűség, valamint a 2.24-es hazai és mindössze 0.50-es vendég xG <strong class="highlight">erős hazai dominanciát sugall</strong>. Ezt a képet azonban némileg árnyalja a vendégek stabil védekezése, amely a kontratámadásokra épülhet.`,
            scenario: `A mérkőzés forgatókönyve szerint a <strong class="highlight">${match.home}</strong> a kezdő sípszótól magához ragadja a kezdeményezést. Védelmük azonban a gyors kontrák ellen sebezhető lehet, főleg ha a <strong class="highlight">${match.away}</strong> meg tudja tartani a labdát a kritikus pillanatokban.`
        }
    };
}
