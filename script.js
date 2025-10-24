// --- ALKALMAZÁS ÁLLAPOT (VÉGLEGES) ---
const appState = {
    // A VÉGLEGES RENDER.COM SZERVER CÍME
    gasUrl: 'https://king-ai-backend.onrender.com', // Ellenőrizd, hogy ez a helyes URL!
    fixtures: [],
    currentSport: 'soccer',
    sheetUrl: '', // Ezt a backend most már a .env-ből olvassa
    currentAnalysisContext: '',
    chatHistory: [],
    selectedMatches: new Set()
};
// === JELSZÓVÉDELEM: Itt add meg a saját jelszavad! ===
const CORRECT_PASSWORD = 'Rmadrid1987!'; // <<< --- CSERÉLD LE EGY SAJÁT, BIZTONSÁGOS JELSZÓRA!

// --- LIGA KATEGÓRIÁK (VÁLTOZATLAN) ---
const LEAGUE_CATEGORIES = {
    soccer: {
        'Top Ligák': [ 'Champions League', 'Premier League', 'Bundesliga', 'LaLiga', 'Serie A' ],
        'Kiemelt Bajnokságok': [ 'Europa League', 'Ligue 1', 'Eredivisie', 'Liga Portugal' ],
        'Figyelmet Érdemlő': [ 'Championship', '2. Bundesliga', 'Serie B', 'LaLiga2', 'Super Lig', 'Premiership', 'MLS' ],
        'Egyéb Meccsek': [ 'FIFA World Cup', 'UEFA European Championship', 'Conference League', 'Brazil Serie A', 'Argentinian Liga Profesional', 'Greek Super League', 'Nemzetek Ligája', 'Kupa', 'Copa', 'Cup' ] // Hozzáadva általánosabb kupamegnevezések
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

// --- INICIALIZÁLÁS (JELSZÓVÉDELEMMEL KIEGÉSZÍTVE) ---
document.addEventListener('DOMContentLoaded', () => {
    setupLoginProtection(); // Jelszó ellenőrzés indítása

    // Csak sikeres bejelentkezés után futnak le a többiek
    // Ezeket áthelyezzük a setupLoginProtection-ön belüli sikeres login ágba
});

// === JELSZÓVÉDELEM LOGIKÁJA ===
function setupLoginProtection() {
    const loginOverlay = document.getElementById('login-overlay');
    const appContainer = document.querySelector('.app-container');

    // Ha már be van jelentkezve (sessionStorage alapján)
    if (sessionStorage.getItem('isLoggedIn') === 'true') {
        loginOverlay.style.display = 'none';
        appContainer.style.display = 'flex'; // Konténer megjelenítése
        initializeApp(); // Alkalmazás inicializálása
        return; // Nincs további teendő itt
    } else {
        // Ha nincs bejelentkezve, alapból a login látszik, a konténer rejtve van
        loginOverlay.style.display = 'flex';
        appContainer.style.display = 'none';
    }

    const loginButton = document.getElementById('login-button');
    const passwordInput = document.getElementById('password-input');

    const handleLogin = () => {
        if (passwordInput.value === CORRECT_PASSWORD) {
            sessionStorage.setItem('isLoggedIn', 'true'); // Bejelentkezett állapot mentése
            loginOverlay.style.display = 'none'; // Login elrejtése
            appContainer.style.display = 'flex'; // Konténer megjelenítése
            initializeApp(); // Alkalmazás inicializálása most, sikeres login után
        } else {
            showToast('Hibás jelszó!', 'error'); // Hiba jelzése
            passwordInput.value = ''; // Jelszómező ürítése
            passwordInput.focus(); // Fókusz vissza a jelszómezőre
        }
    };

    // Eseménykezelők hozzáadása
    loginButton.addEventListener('click', handleLogin);
    passwordInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') { // Enter lenyomására is működjön
            handleLogin();
        }
    });
}

// === ALKALMAZÁS INICIALIZÁLÁSA (Sikeres login után hívódik) ===
function initializeApp() {
    setupThemeSwitcher();
    document.getElementById('loadFixturesBtn').addEventListener('click', loadFixtures);
    createGlowingOrbs(); // Háttér animációk
    createHeaderOrbs(); // Fejléc animációk
    initMultiSelect(); // Többes kiválasztás gomb inicializálása

    // Felhasználói infó és sheet URL betöltése
    document.getElementById('userInfo').textContent = `Csatlakozva...`;
    appState.sheetUrl = localStorage.getItem('sheetUrl') || ''; // Betöltjük a mentett URL-t, ha van

    // Toast üzenetek konténerének létrehozása
    const toastContainer = document.createElement('div');
    toastContainer.id = 'toast-notification-container';
    toastContainer.className = 'toast-notification-container';
    document.body.appendChild(toastContainer);

    // Esetleg itt automatikusan betölthetjük a meccseket az alapértelmezett sportághoz
    // loadFixtures(); // Ha szeretnéd, hogy induláskor betöltsön
}


// --- HIBAKEZELŐ SEGÉDFÜGGVÉNY ---
async function handleFetchError(response) {
    try {
        const errorData = await response.json();
        // A szerver által küldött hibaüzenetet próbáljuk meg kinyerni
        throw new Error(`Szerver hiba (${response.status}): ${errorData.error || response.statusText}`);
    } catch (jsonError) {
        // Ha a válasz nem JSON, vagy más hiba történt
        throw new Error(`Hálózati hiba: ${response.status} ${response.statusText}`);
    }
}

// --- FŐ FUNKCIÓK ---

async function loadFixtures() {
    const loadBtn = document.getElementById('loadFixturesBtn');
    loadBtn.disabled = true;
    loadBtn.textContent = 'Betöltés...';
    appState.selectedMatches.clear(); // Kiválasztottak törlése
    updateMultiSelectButton(); // Gomb frissítése

    try {
        const response = await fetch(`${appState.gasUrl}/getFixtures?sport=${appState.currentSport}&days=2`);
        if (!response.ok) await handleFetchError(response); // Egységes hibakezelés

        const data = await response.json();
        if (data.error) throw new Error(data.error); // Szerver oldali üzleti logika hiba

        // Feldolgozzuk a kapott meccseket
        appState.fixtures = (data.fixtures || []).map((fx) => ({
            ...fx,
            // Egyedi azonosító generálása a sportág, hazai és vendég csapat neve alapján
            uniqueId: `${appState.currentSport}_${fx.home.toLowerCase().replace(/\s+/g, '')}_${fx.away.toLowerCase().replace(/\s+/g, '')}`
        }));
        // Opening odds mentése (bár jelenleg nem tűnik használtnak a frontend oldalon)
        sessionStorage.setItem('openingOdds', JSON.stringify(data.odds || {}));

        // Megjelenítés eszköz alapján
        if (isMobile()) {
            renderFixturesForMobileList(appState.fixtures);
        } else {
            renderFixturesForDesktop(appState.fixtures);
        }
        addCheckboxListeners(); // Checkbox figyelők hozzáadása
        document.getElementById('userInfo').textContent = `Csatlakozva (Meccsek betöltve)`;
        document.getElementById('placeholder').style.display = 'none'; // Placeholder elrejtése
    } catch (e) {
        showToast(`Hiba a meccsek betöltésekor: ${e.message}`, 'error');
        document.getElementById('userInfo').textContent = `Hiba a csatlakozáskor`;
        document.getElementById('placeholder').style.display = 'flex'; // Hiba esetén placeholder mutatása
        document.getElementById('kanban-board').innerHTML = ''; // Tábla ürítése
        document.getElementById('mobile-list-container').innerHTML = ''; // Lista ürítése
        console.error(e);
    } finally {
        loadBtn.disabled = false;
        loadBtn.textContent = 'Meccsek Betöltése';
    }
}

// --- MÓDOSÍTÁS KEZDETE: utcKickoff paraméter hozzáadása ---
async function runAnalysis(home, away, utcKickoff, forceNew = false) { // utcKickoff hozzáadva
    home = unescape(home); // Csapatnevek dekódolása (ha escapelve lettek)
    away = unescape(away);

    // Felhasználói visszajelzés mobil nézetben, ha újratöltés van kényszerítve
    if (isMobile() && forceNew) {
        showToast("Elemzés folyamatban... Ez hosszabb időt vehet igénybe.", 'info', 6000);
    }

    // Modal ablak megnyitása és elemeinek előkészítése
    openModal(`${home} vs ${away}`, document.getElementById('common-elements').innerHTML, 'modal-xl');
    const modalSkeleton = document.querySelector('#modal-container #loading-skeleton');
    const modalResults = document.querySelector('#modal-container #analysis-results');
    const modalChat = document.querySelector('#modal-container #chat-container');

    // Korábbi tartalom törlése, skeleton megjelenítése
    modalResults.innerHTML = '';
    modalChat.style.display = 'none';
    modalSkeleton.classList.add('active');

    // Chat funkciók inicializálása
    modalChat.querySelector('#chat-send-btn').onclick = sendChatMessage;
    modalChat.querySelector('#chat-input').onkeyup = (e) => e.key === "Enter" && sendChatMessage();

    try {
        // API URL összeállítása az ÖSSZES szükséges query paraméterrel
        let analysisUrl = `${appState.gasUrl}/runAnalysis?home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}&sport=${appState.currentSport}&force=${forceNew}&utcKickoff=${encodeURIComponent(utcKickoff)}&leagueName=${encodeURIComponent(getLeagueNameForMatch(home, away) || '')}&sheetUrl=${encodeURIComponent(appState.sheetUrl)}`;
        // --- MÓDOSÍTÁS VÉGE: utcKickoff paraméter hozzáadása az URL-hez ---

        const openingOdds = sessionStorage.getItem('openingOdds') || '{}'; // Opening odds (ha van)

        // API hívás POST metódussal
        const response = await fetch(analysisUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ openingOdds: JSON.parse(openingOdds) })
        });
        if (!response.ok) await handleFetchError(response); // Egységes hibakezelés

        const data = await response.json();
        if (data.error) throw new Error(data.error); // Szerver üzleti logika hiba

        // Eredmény feldolgozása és megjelenítése
        appState.currentAnalysisContext = data.html; // Elemzés HTML mentése a chat kontextushoz
        appState.chatHistory = []; // Chat előzmények törlése új elemzésnél
        modalResults.innerHTML = `<div class="analysis-body">${data.html}</div>`; // HTML beillesztése
        modalSkeleton.classList.remove('active'); // Skeleton elrejtése
        modalChat.style.display = 'block'; // Chat megjelenítése
        modalChat.querySelector('#chat-messages').innerHTML = ''; // Chat üzenetek törlése
    } catch (e) {
        // Hiba megjelenítése a modal ablakban
        modalResults.innerHTML = `<p style="color:var(--danger); text-align:center; padding: 2rem;">Hiba történt az elemzés során: ${e.message}</p>`;
        modalSkeleton.classList.remove('active'); // Skeleton elrejtése hiba esetén is
        console.error(e);
    }
}

// Segédfüggvény a liga nevének lekéréséhez (AnalysisFlow-nak kell)
function getLeagueNameForMatch(home, away) {
    const match = appState.fixtures.find(fx => fx.home === home && fx.away === away);
    return match ? match.league : null;
}


async function openHistoryModal() {
    // Sheet URL bekérése, ha még nincs megadva (bár a backend használja a sajátját)
    if (!appState.sheetUrl) {
        const url = prompt("Kérlek, add meg a Google Táblázat URL-jét (opcionális, a szerver is tárolhatja):", localStorage.getItem('sheetUrl') || "");
        if (url && url.startsWith('https://docs.google.com/spreadsheets/d/')) {
            appState.sheetUrl = url;
            localStorage.setItem('sheetUrl', url); // Mentjük a böngésző tárolójába
        } else if (url) { // Csak akkor szólunk, ha adott meg valamit, de az érvénytelen
            showToast('Érvénytelen Google Sheet URL formátum.', 'error');
        }
    }

    const modalSize = isMobile() ? 'modal-fullscreen' : 'modal-lg';
    const loadingHTML = document.getElementById('loading-skeleton').outerHTML; // Skeleton HTML másolása
    openModal('Előzmények', loadingHTML, modalSize); // Modal megnyitása skeletonnal
    document.querySelector('#modal-container #loading-skeleton').classList.add('active'); // Skeleton aktiválása

    try {
        const response = await fetch(`${appState.gasUrl}/getHistory`); // Előzmények lekérése
        if (!response.ok) await handleFetchError(response); // Hibakezelés

        const data = await response.json();
        if (data.error) throw new Error(data.error); // Szerver hiba

        // Előzmények megjelenítése a renderHistory függvénnyel
        document.getElementById('modal-body').innerHTML = renderHistory(data.history || []);
    } catch (e) {
        // Hiba megjelenítése a modal ablakban
        document.getElementById('modal-body').innerHTML = `<p class="muted" style="color:var(--danger); text-align:center; padding: 2rem;">Hiba az előzmények betöltésekor: ${e.message}</p>`;
        console.error(e);
    }
}

async function deleteHistoryItem(id) {
    // Törlés megerősítése
    if (!confirm("Biztosan törölni szeretnéd ezt az elemet a naplóból? Ez a művelet nem vonható vissza.")) return;

    try {
        const response = await fetch(`${appState.gasUrl}/deleteHistoryItem`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id }) // ID küldése a törléshez
        });
        if (!response.ok) await handleFetchError(response); // Hibakezelés

        const data = await response.json();
        if (data.error) throw new Error(data.error); // Szerver hiba

        showToast('Elem sikeresen törölve.', 'success'); // Sikeres törlés jelzése
        openHistoryModal(); // Előzmények újratöltése a modalban
    } catch (e) {
        showToast(`Hiba a törlés során: ${e.message}`, 'error'); // Hiba jelzése
        console.error(e);
    }
}

// A runFinalCheck funkció jelenleg nincs implementálva a backend oldalon
// Ha szükség van rá, a backendet is bővíteni kell egy /runFinalCheck végponttal
async function runFinalCheck(home, away, sport) {
    alert("A 'Végső Ellenőrzés' funkció jelenleg nincs implementálva a szerver oldalon.");
    // Placeholder - a meglévő kód nagy része kommentelve, mert a backend hiányzik
    /*
    const btn = event.target;
    btn.disabled = true;
    btn.innerHTML = '...';
    openModal('Végső Elme-Ellenőrzés', document.getElementById('loading-skeleton').outerHTML, 'modal-sm');
    document.querySelector('#modal-container #loading-skeleton').classList.add('active');

    try {
        // ... (API hívás a /runFinalCheck végpontra) ...
        // ... (Válasz feldolgozása és megjelenítése) ...
    } catch (e) {
        // ... (Hibakezelés) ...
    } finally {
        // ... (Gomb visszaállítása) ...
    }
    */
}

async function viewHistoryDetail(id) {
    const originalId = unescape(id); // ID dekódolása
    // Modal megnyitása skeletonnal
    openModal('Elemzés Betöltése...', document.getElementById('loading-skeleton').outerHTML, 'modal-xl');
    document.querySelector('#modal-container #loading-skeleton').classList.add('active');

    try {
        // Részletek lekérése ID alapján
        const response = await fetch(`${appState.gasUrl}/getAnalysisDetail?id=${encodeURIComponent(originalId)}`);
        if (!response.ok) await handleFetchError(response); // Hibakezelés

        const data = await response.json();
        if (data.error) throw new Error(data.error); // Szerver hiba

        const { record } = data; // Kinyerjük a record objektumot
        if (!record || !record.html) throw new Error("A szerver nem találta a kért elemzést, vagy az hiányos.");

        // Modal címének beállítása
        document.getElementById('modal-title').textContent = `${record.home || 'Ismeretlen'} vs ${record.away || 'Ismeretlen'}`;
        const modalBody = document.getElementById('modal-body');

        // Modal tartalmának összeállítása a közös elemekből
        modalBody.innerHTML = document.getElementById('common-elements').innerHTML;
        modalBody.querySelector('#loading-skeleton').style.display = 'none'; // Skeleton elrejtése
        // Elemzés HTML beillesztése
        modalBody.querySelector('#analysis-results').innerHTML = `<div class="analysis-body">${record.html}</div>`;

        // Chat inicializálása az elemzés kontextusával
        const modalChat = modalBody.querySelector('#chat-container');
        modalChat.style.display = 'block'; // Chat megjelenítése
        appState.currentAnalysisContext = record.html; // Kontextus mentése
        appState.chatHistory = []; // Előzmények törlése
        modalChat.querySelector('#chat-messages').innerHTML = ''; // Üzenetek törlése
        modalChat.querySelector('#chat-send-btn').onclick = sendChatMessage; // Küldés gomb eseménykezelője
        modalChat.querySelector('#chat-input').onkeyup = (e) => e.key === "Enter" && sendChatMessage(); // Enter leütés eseménykezelője
    } catch(e) {
        // Hiba megjelenítése a modal ablakban
        document.getElementById('modal-body').innerHTML = `<p style="color:var(--danger); text-align:center; padding: 2rem;">Hiba a részletek betöltésekor: ${e.message}</p>`;
        console.error("Hiba a részletek megtekintésekor:", e);
    }
}

async function sendChatMessage() {
    const modal = document.getElementById('modal-container');
    const input = modal.querySelector('#chat-input');
    const messagesContainer = modal.querySelector('#chat-messages'); // Üzenetek konténere
    const thinkingIndicator = modal.querySelector('#chat-thinking-indicator'); // Gondolkodás jelző
    const sendButton = modal.querySelector('#chat-send-btn'); // Küldés gomb

    const message = input.value.trim();
    if (!message) return; // Ne küldjön üres üzenetet

    addMessageToChat(message, 'user'); // Felhasználó üzenetének hozzáadása a chathez
    input.value = ''; // Input mező ürítése
    thinkingIndicator.style.display = 'block'; // Gondolkodás jelző megjelenítése
    sendButton.disabled = true; // Gomb letiltása válaszig
    input.disabled = true; // Input letiltása válaszig

    try {
        const response = await fetch(`${appState.gasUrl}/askChat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                context: appState.currentAnalysisContext, // Aktuális elemzés HTML-je
                history: appState.chatHistory, // Korábbi beszélgetés
                question: message // Felhasználó kérdése
            })
        });
        if (!response.ok) await handleFetchError(response); // Hibakezelés

        const data = await response.json();
        if (data.error) throw new Error(data.error); // Szerver hiba

        addMessageToChat(data.answer, 'ai'); // AI válaszának hozzáadása a chathez

        // Előzmények frissítése
        appState.chatHistory.push({ role: 'user', parts: [{ text: message }] });
        appState.chatHistory.push({ role: 'model', parts: [{ text: data.answer }] });
    } catch (e) {
        addMessageToChat(`Hiba történt a válasszal: ${e.message}`, 'ai'); // Hiba jelzése a chatben
        console.error(e);
    } finally {
        thinkingIndicator.style.display = 'none'; // Gondolkodás jelző elrejtése
        sendButton.disabled = false; // Gomb engedélyezése
        input.disabled = false; // Input engedélyezése
        input.focus(); // Fókusz vissza az input mezőre
        messagesContainer.scrollTop = messagesContainer.scrollHeight; // Görgetés az aljára
    }
}

async function runMultiAnalysis() {
    const selectedIds = Array.from(appState.selectedMatches); // Kiválasztott meccs ID-k
    // Ellenőrizzük a kiválasztott meccsek számát
    if (selectedIds.length === 0 || selectedIds.length > 3) {
        showToast('Válassz ki 1-3 meccset a többes elemzéshez.', 'error');
        return;
    }
    // Megkeressük a teljes meccs adatokat az ID-k alapján
    const matchesToAnalyze = appState.fixtures.filter(fx => selectedIds.includes(fx.uniqueId));
    // Ellenőrizzük, hogy minden kiválasztott meccs megtalálható-e
    if (matchesToAnalyze.length !== selectedIds.length) {
         showToast('Hiba: Nem található minden kiválasztott meccs. Próbáld újra betölteni a meccseket.', 'error');
         return;
    }

    // Modal megnyitása a többes elemzéshez
    openModal(`Többes Elemzés (${matchesToAnalyze.length} meccs)`, '<div id="multi-analysis-results"></div><div id="multi-loading-skeleton" style="padding: 1rem;"></div>', 'modal-xl');
    const resultsContainer = document.getElementById('multi-analysis-results');
    const loadingContainer = document.getElementById('multi-loading-skeleton');

    // Skeleton megjelenítése
    loadingContainer.innerHTML = document.getElementById('loading-skeleton').outerHTML;
    const modalSkeleton = loadingContainer.querySelector('.loading-skeleton');
    if (modalSkeleton) modalSkeleton.classList.add('active');

    // Elemzési kérések párhuzamos indítása
    const analysisPromises = matchesToAnalyze.map(match => {
        // --- MÓDOSÍTÁS KEZDETE: utcKickoff átadása itt is ---
        let analysisUrl = `${appState.gasUrl}/runAnalysis?home=${encodeURIComponent(match.home)}&away=${encodeURIComponent(match.away)}&sport=${appState.currentSport}&force=true&utcKickoff=${encodeURIComponent(match.utcKickoff)}&leagueName=${encodeURIComponent(match.league || '')}&sheetUrl=${encodeURIComponent(appState.sheetUrl)}`;
        // --- MÓDOSÍTÁS VÉGE ---

        return fetch(analysisUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ openingOdds: JSON.parse(sessionStorage.getItem('openingOdds') || '{}') })
        })
        .then(response => { // Válasz feldolgozása
            if (!response.ok) { // Hibás válasz kezelése
                return response.json().then(errorData => { // Próbáljuk kiolvasni a hibaüzenetet
                    throw new Error(`Szerver hiba (${response.status}): ${errorData.error || response.statusText}`);
                }).catch(() => { // Ha nem JSON a hibaüzenet
                    throw new Error(`Hálózati hiba: ${response.status} ${response.statusText}`);
                });
            }
            return response.json(); // Sikeres válasz JSON-ként
        })
        .then(data => { // Sikeres adat feldolgozása
            if (data.error) throw new Error(`Elemzési hiba (${match.home} vs ${match.away}): ${data.error}`);
            // Visszaadjuk a meccs nevét és az elemzés HTML-jét
            return { match: `${match.home} vs ${match.away}`, html: data.html };
        })
        .catch(error => { // Bármilyen hiba elkapása az adott meccsre
             console.error(`Hiba ${match.home} vs ${match.away} elemzésekor:`, error);
             // Visszaadjuk a meccs nevét és a hibaüzenetet
             return { match: `${match.home} vs ${match.away}`, error: error.message };
        });
    });

    try {
        const results = await Promise.all(analysisPromises); // Várjuk meg az összes elemzést
        loadingContainer.innerHTML = ''; // Skeleton eltávolítása
        resultsContainer.innerHTML = ''; // Korábbi eredmények törlése

        // Eredmények megjelenítése
        results.forEach(result => {
             const matchHeader = `<h4>${result.match}</h4>`;
             let recommendationHtml = '<p style="color:var(--danger);">Ismeretlen hiba történt az elemzés során ennél a meccsnél.</p>'; // Alapértelmezett hiba

            if (!result.error && result.html) { // Ha nincs hiba és van HTML
                // Kivesszük csak a fő ajánlás kártyát a teljes HTML-ből
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = result.html;
                const recommendationCard = tempDiv.querySelector('.master-recommendation-card');
                if (recommendationCard) {
                    recommendationHtml = recommendationCard.outerHTML; // Csak a kártya HTML-je kell
                } else {
                     recommendationHtml = '<p class="muted">A fő elemzői ajánlás nem található ebben az elemzésben.</p>';
                }
            } else if (result.error) { // Ha volt hiba
                 recommendationHtml = `<p style="color:var(--danger);">Hiba: ${result.error}</p>`;
            }

            // Hozzáadjuk a meccs eredményét a konténerhez
            resultsContainer.innerHTML += `
                <div class="multi-analysis-item">
                    ${matchHeader}
                    ${recommendationHtml}
                </div>
            `;
        });

         // Kiválasztás törlése és gomb frissítése
         appState.selectedMatches.clear();
         document.querySelectorAll('.selectable-card.selected, .selectable-item.selected').forEach(el => el.classList.remove('selected'));
         document.querySelectorAll('.match-checkbox:checked').forEach(cb => cb.checked = false);
         updateMultiSelectButton();
    } catch (e) { // Váratlan hiba az Promise.all során (bár elvileg a belső catch elkapja)
         console.error("Váratlan hiba a többes elemzés során:", e);
         loadingContainer.innerHTML = ''; // Skeleton eltávolítása
         resultsContainer.innerHTML = `<p style="color:var(--danger); text-align:center;">Váratlan hiba történt az elemzések összesítésekor: ${e.message}</p>`;
    }
}


// --- JAVÍTOTT ÉS VÁLTOZATLAN SEGÉDFÜGGVÉNYEK ---

// JAVÍTÁS: Új segédfüggvény a magyar dátumformátum megbízható feldolgozásához
const parseHungarianDate = (huDate) => {
    // Próbáljuk meg a standard Date konstruktort használni, hátha felismeri
    let date = new Date(huDate);
    if (!isNaN(date.getTime())) {
        return date; // Sikerült standard módon feldolgozni
    }
    // Ha nem sikerült, próbáljuk a pontokkal tagolt formátumot
    const parts = huDate.split('.').map(p => p.trim()).filter(p => p);
    if (parts.length >= 3) {
        // Formátum feltételezése: YYYY. MM. DD. (vagy YYYY. M. D.)
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1; // Hónap 0-indexelt
        const day = parseInt(parts[2]);
        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
            date = new Date(Date.UTC(year, month, day)); // UTC-ként kezeljük, hogy elkerüljük az időzóna problémákat
            if (!isNaN(date.getTime())) {
                return date; // Sikerült
            }
        }
    }
    // Ha sehogy sem sikerült, érvénytelen dátumot adunk vissza
    console.warn(`Nem sikerült feldolgozni a magyar dátumot: ${huDate}`);
    return new Date('invalid date');
};

function handleSportChange() {
    appState.currentSport = document.getElementById('sportSelector').value; // Új sportág beállítása
    appState.selectedMatches.clear(); // Kiválasztottak törlése
    // Felület ürítése
    document.getElementById('kanban-board').innerHTML = '';
    document.getElementById('mobile-list-container').innerHTML = '';
    document.getElementById('placeholder').style.display = 'flex'; // Placeholder mutatása
    updateMultiSelectButton(); // Gomb frissítése
    // Opcionálisan azonnal tölthetjük az új sportág meccseit:
    // loadFixtures();
}

function openManualAnalysisModal() {
    // HTML tartalom a modal ablakhoz
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
            <label for="manual-kickoff">Kezdési idő (UTC Dátum és Idő)</label>
            <input id="manual-kickoff" type="datetime-local" placeholder="Válassz időpontot"/>
             <p class="muted" style="font-size: 0.8rem; margin-top: 5px;">Fontos: A böngésző a helyi időt mutatja, de UTC-ként lesz elküldve.</p>
        </div>
        <button class="btn btn-primary" onclick="runManualAnalysis()" style="width:100%; margin-top:1.5rem;">Elemzés Futtatása</button>
    `;
    openModal('Kézi Elemzés Indítása', content, 'modal-sm'); // Modal megnyitása

    // Előre kitöltjük a dátumot a holnapi nappal és délután 3 órával (helyi idő szerint)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(15, 0, 0, 0);
    const kickoffInput = document.getElementById('manual-kickoff');
    // Az input 'datetime-local' formátuma YYYY-MM-DDTHH:mm
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const day = String(tomorrow.getDate()).padStart(2, '0');
    const hours = String(tomorrow.getHours()).padStart(2, '0');
    const minutes = String(tomorrow.getMinutes()).padStart(2, '0');
    kickoffInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
}

function runManualAnalysis() {
    const home = document.getElementById('manual-home').value.trim();
    const away = document.getElementById('manual-away').value.trim();
    const kickoffLocal = document.getElementById('manual-kickoff').value; // YYYY-MM-DDTHH:mm

    if (!home || !away) {
        showToast('Mindkét csapat nevét meg kell adni.', 'error');
        return;
    }
    if (!kickoffLocal) {
        showToast('Kérlek, add meg a kezdési időpontot.', 'error');
        return;
    }

    try {
        // A 'datetime-local' input a böngésző helyi idejét adja. Ezt kell UTC ISO stringgé alakítani.
        const kickoffDate = new Date(kickoffLocal);
        if (isNaN(kickoffDate.getTime())) {
             throw new Error('Érvénytelen dátum formátum.');
        }
        const utcKickoff = kickoffDate.toISOString(); // Átalakítás UTC ISO stringgé

        closeModal(); // Modal bezárása
        // Indítjuk az elemzést az új utcKickoff értékkel
        runAnalysis(home, away, utcKickoff, true); // forceNew = true
    } catch (e) {
         showToast(`Hiba a dátum feldolgozásakor: ${e.message}`, 'error');
         console.error("Dátum hiba:", e);
    }
}


function isMobile() { return window.innerWidth <= 1024; } // Mobil nézet határának meghatározása

function getLeagueGroup(leagueName) {
    if (!leagueName || typeof leagueName !== 'string') return 'Egyéb Meccsek'; // Védelem null/undefined ellen
    const sportGroups = LEAGUE_CATEGORIES[appState.currentSport] || {}; // Adott sportág kategóriái
    const lowerLeagueName = leagueName.toLowerCase().trim(); // Kisbetűs, trimmelt név

    // Pontosabb illesztés: Először próbáljunk meg pontosabb egyezést találni
    for (const groupName in sportGroups) {
        if (sportGroups[groupName].some(l => lowerLeagueName === l.toLowerCase())) {
            return groupName;
        }
    }
    // Ha nincs pontos egyezés, akkor próbáljuk a tartalmazást
    for (const groupName in sportGroups) {
        if (sportGroups[groupName].some(l => lowerLeagueName.includes(l.toLowerCase()))) {
            return groupName;
        }
    }
    // Ha sehol nem található, 'Egyéb Meccsek'
    return 'Egyéb Meccsek';
}


function renderFixturesForDesktop(fixtures) {
    const board = document.getElementById('kanban-board');
    if (!board) return; // Ha nincs meg a tábla elem, kilépünk
    document.getElementById('placeholder').style.display = 'none'; // Placeholder elrejtése
    board.innerHTML = ''; // Korábbi tartalom törlése
    const groupOrder = ['Top Ligák', 'Kiemelt Bajnokságok', 'Figyelmet Érdemlő', 'Egyéb Meccsek']; // Oszlopok sorrendje
    const groupedByCategory = groupBy(fixtures, fx => getLeagueGroup(fx.league)); // Csoportosítás kategória szerint

    groupOrder.forEach(group => { // Végigmegyünk a kategóriákon a kívánt sorrendben
        let columnContent = ''; // Az oszlop HTML tartalma
        let cardIndex = 0; // Animációhoz index

        if (groupedByCategory[group]) { // Ha van meccs ebben a kategóriában
            // Dátum szerint csoportosítjuk az adott kategória meccseit
            const groupedByDate = groupBy(groupedByCategory[group], fx => {
                try {
                    // Megbízható dátum formázás, időzónával
                    return new Date(fx.utcKickoff).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' });
                } catch (e) { return 'Ismeretlen dátum'; } // Hibakezelés
            });

            // Dátumok szerinti rendezés (legkorábbi elöl)
            Object.keys(groupedByDate)
                .sort((a, b) => parseHungarianDate(a) - parseHungarianDate(b)) // Megbízható dátum összehasonlítás
                .forEach(dateKey => {
                    // Dátum szekció hozzáadása (összecsukható)
                    columnContent += `<details class="date-section" open><summary>${formatDateLabel(dateKey)}</summary>`;

                    // Az adott dátum meccseinek rendezése kezdési idő szerint
                    groupedByDate[dateKey]
                        .sort((a, b) => new Date(a.utcKickoff) - new Date(b.utcKickoff))
                        .forEach(fx => { // Végigmegyünk a meccseken
                            const time = new Date(fx.utcKickoff).toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' });
                            // Meccs kártya HTML összeállítása
                            // --- MÓDOSÍTÁS KEZDETE: utcKickoff átadása az onclick-nek ---
                            columnContent += `
                                <div class="match-card selectable-card ${appState.selectedMatches.has(fx.uniqueId) ? 'selected' : ''}" data-match-id="${fx.uniqueId}" style="animation-delay: ${cardIndex * 0.05}s">
                                     <input type="checkbox" class="match-checkbox" data-match-id="${fx.uniqueId}" ${appState.selectedMatches.has(fx.uniqueId) ? 'checked' : ''}>
                                     <div class="match-card-content" onclick="runAnalysis('${escape(fx.home)}', '${escape(fx.away)}', '${escape(fx.utcKickoff)}', true)">
                                         <div class="match-card-teams">${fx.home} – ${fx.away}</div>
                                         <div class="match-card-meta">
                                             <span>${fx.league || 'Ismeretlen Liga'}</span>
                                             <span>${time}</span>
                                         </div>
                                     </div>
                                </div>`;
                            // --- MÓDOSÍTÁS VÉGE ---
                            cardIndex++; // Animáció index növelése
                        });
                    columnContent += `</details>`; // Dátum szekció lezárása
                });
        }

        // Teljes oszlop HTML hozzáadása a táblához
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
    if (!container) return; // Ha nincs konténer, kilépünk
    document.getElementById('placeholder').style.display = 'none'; // Placeholder elrejtése
    container.innerHTML = ''; // Korábbi tartalom törlése
    const groupOrder = ['Top Ligák', 'Kiemelt Bajnokságok', 'Figyelmet Érdemlő', 'Egyéb Meccsek']; // Csoportok sorrendje
    const groupedByCategory = groupBy(fixtures, fx => getLeagueGroup(fx.league)); // Csoportosítás kategória szerint
    let html = ''; // Teljes HTML tartalom

    groupOrder.forEach(group => { // Végigmegyünk a csoportokon
        if (groupedByCategory[group]) { // Ha van meccs a csoportban
            html += `<h4 class="league-header-mobile">${group}</h4>`; // Csoport fejléc
            // Dátum szerint csoportosítás
            const groupedByDate = groupBy(groupedByCategory[group], fx => {
                try { return new Date(fx.utcKickoff).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }); }
                catch (e) { return 'Ismeretlen dátum'; }
            });

            // Dátumok szerinti rendezés (legkorábbi elöl)
            Object.keys(groupedByDate)
                .sort((a, b) => parseHungarianDate(a) - parseHungarianDate(b)) // Megbízható rendezés
                .forEach(dateKey => {
                    html += `<div class="date-header-mobile">${formatDateLabel(dateKey)}</div>`; // Dátum fejléc

                    // Adott dátum meccseinek rendezése idő szerint
                    groupedByDate[dateKey]
                        .sort((a, b) => new Date(a.utcKickoff) - new Date(b.utcKickoff))
                        .forEach(fx => { // Végigmegyünk a meccseken
                            const time = new Date(fx.utcKickoff).toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' });
                            // Lista elem HTML összeállítása
                            // --- MÓDOSÍTÁS KEZDETE: utcKickoff átadása az onclick-nek ---
                            html += `
                                <div class="list-item selectable-item ${appState.selectedMatches.has(fx.uniqueId) ? 'selected' : ''}" data-match-id="${fx.uniqueId}">
                                    <input type="checkbox" class="match-checkbox" data-match-id="${fx.uniqueId}" ${appState.selectedMatches.has(fx.uniqueId) ? 'checked' : ''}>
                                    <div class="list-item-content" onclick="runAnalysis('${escape(fx.home)}', '${escape(fx.away)}', '${escape(fx.utcKickoff)}', true)">
                                        <div class="list-item-title">${fx.home} – ${fx.away}</div>
                                        <div class="list-item-meta">${fx.league || 'Ismeretlen Liga'} - ${time}</div>
                                    </div>
                                    <svg class="list-item-arrow" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                </div>`;
                            // --- MÓDOSÍTÁS VÉGE ---
                        });
                });
        }
    });
    // Konténer tartalmának beállítása (vagy üzenet, ha nincs meccs)
    container.innerHTML = html || '<p class="muted" style="text-align:center; padding: 2rem;">Nincsenek elérhető mérkőzések.</p>';
}


function renderHistory(historyData) {
    // Ellenőrizzük, hogy van-e adat
    if (!historyData || !Array.isArray(historyData) || historyData.length === 0) {
        return '<p class="muted" style="text-align:center; padding: 2rem;">Nincsenek mentett előzmények.</p>';
    }
    // Hibás vagy hiányos elemek kiszűrése (biztonsági ellenőrzés)
    const history = historyData.filter(item => item && item.id && item.home && item.away && item.date);
    if (history.length === 0) {
         return '<p class="muted" style="text-align:center; padding: 2rem;">Nincsenek érvényes előzmény adatok.</p>';
    }

    // Csoportosítás dátum szerint
    const groupedByDate = groupBy(history, item => {
        try { return new Date(item.date).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }); }
        catch (e) { return 'Ismeretlen dátum'; }
    });

    let html = '';
    // Dátumok szerinti rendezés (legfrissebb elöl)
    Object.keys(groupedByDate)
        .sort((a, b) => parseHungarianDate(b) - parseHungarianDate(a)) // Megbízható csökkenő rendezés
        .forEach(dateKey => {
            // Dátum szekció (alapból csukva)
            html += `<details class="date-section"><summary>${formatDateLabel(dateKey)}</summary>`;

            // Az adott dátum elemeinek rendezése idő szerint (legfrissebb elöl)
            const sortedItems = groupedByDate[dateKey].sort((a, b) => new Date(b.date) - new Date(a.date));

            sortedItems.forEach(item => {
                const analysisTime = new Date(item.date); // Elemzés ideje
                // Ellenőrzés, hogy a "Végső Ellenőrzés" gomb aktív legyen-e
                // (Ez a logika feltételezi, hogy a backend implementálja a /runFinalCheck végpontot)
                // const now = new Date();
                // const startTimeDiffMinutes = (now - analysisTime) / (1000 * 60) - 60; // kb. 1 órával a meccs előtt
                // const endTimeDiffMinutes = (now - analysisTime) / (1000 * 60) - 180; // kb. 3 órával a meccs utánig
                // const isCheckable = startTimeDiffMinutes > 0 && endTimeDiffMinutes < 0;
                const isCheckable = false; // Mivel a backend nincs implementálva, letiltjuk

                // Gomb HTML (most letiltva)
                const finalCheckButton = `
                    <button class="btn btn-final-check"
                             onclick="runFinalCheck('${escape(item.home)}', '${escape(item.away)}', '${item.sport}'); event.stopPropagation();"
                            title="Végső Ellenőrzés (Jelenleg nem elérhető)"
                            disabled>
                        ✔️
                    </button>`;

                // Idő formázása
                const time = isNaN(analysisTime.getTime()) ? 'Ismeretlen idő' : analysisTime.toLocaleTimeString('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' });
                // Biztonságos ID az onclick eseményekhez
                const safeItemId = escape(item.id);

                // Lista elem HTML összeállítása
                html += `
                    <div class="list-item">
                        <div style="flex-grow:1; cursor: pointer;" onclick="viewHistoryDetail('${safeItemId}')">
                            <div class="list-item-title">${item.home || '?'} – ${item.away || '?'}</div>
                            <div class="list-item-meta">${item.sport ? item.sport.charAt(0).toUpperCase() + item.sport.slice(1) : 'Sport?'} - Elemzés: ${time}</div>
                        </div>
                         ${finalCheckButton}
                         <button class="btn" onclick="deleteHistoryItem('${safeItemId}'); event.stopPropagation();" title="Törlés" style="color: var(--danger); border-color: var(--danger);">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                         </button>
                    </div>`;
            });
            html += `</details>`; // Dátum szekció lezárása
        });
    return html; // Visszaadjuk a teljes HTML-t
}


function openModal(title, content = '', sizeClass = 'modal-xl') {
    const modalContainer = document.getElementById('modal-container');
    const modalContent = modalContainer.querySelector('.modal-content');
    // Méret osztályok eltávolítása és az új hozzáadása
    modalContent.classList.remove('modal-sm', 'modal-lg', 'modal-xl', 'modal-fullscreen');
    modalContent.classList.add(sizeClass);
    // Cím és tartalom beállítása
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = content;
    // Modal megjelenítése animációval
    modalContainer.classList.add('open');
    // Esc billentyű figyelése a bezáráshoz
    window.addEventListener('keydown', handleEscKey);
    // Kattintás figyelése a modalon kívül a bezáráshoz
    modalContainer.addEventListener('click', handleOutsideClick);
}

function closeModal() {
    const modalContainer = document.getElementById('modal-container');
    modalContainer.classList.remove('open');
    // Eseményfigyelők eltávolítása a memóriaszivárgás elkerülése érdekében
    window.removeEventListener('keydown', handleEscKey);
    modalContainer.removeEventListener('click', handleOutsideClick);
    // Opcionális: Modal tartalmának törlése bezáráskor
    // document.getElementById('modal-body').innerHTML = '';
    // document.getElementById('modal-title').textContent = '';
}

// Esc billentyű kezelése
function handleEscKey(event) {
    if (event.key === 'Escape') {
        closeModal();
    }
}
// Modal-on kívüli kattintás kezelése
function handleOutsideClick(event) {
    if (event.target === document.getElementById('modal-container')) {
        closeModal();
    }
}


function groupBy(arr, keyFn) {
    // Biztonsági ellenőrzés: csak tömböt fogadunk el
    if (!Array.isArray(arr)) return {};
    return arr.reduce((acc, item) => {
        // Biztosítjuk, hogy a kulcsfüggvény ne dobjon hibát
        let key;
        try {
            key = keyFn(item);
        } catch (e) {
            console.warn("Hiba a groupBy kulcs generálásakor:", e);
            key = 'hibás_kulcs'; // Vagy más alapértelmezett kulcs
        }
        // Inicializáljuk a csoportot, ha még nem létezik
        if (!acc[key]) acc[key] = [];
        acc[key].push(item); // Hozzáadjuk az elemet a csoporthoz
        return acc;
    }, {});
}

function formatDateLabel(dateStr) {
    // Mai és holnapi dátum meghatározása a helyi időzóna szerint
    const today = new Date().toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' });
    const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' });
    // Összehasonlítás és címke visszaadása
    if (dateStr === today) return 'MA';
    if (dateStr === tomorrow) return 'HOLNAP';
    // Ha nem ma vagy holnap, visszaadjuk az eredeti dátum stringet
    return dateStr;
}

function addMessageToChat(text, role) {
    const messagesContainer = document.querySelector('#modal-container #chat-messages');
    if (!messagesContainer) return; // Ha nincs chat ablak, nem csinálunk semmit
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role}`; // Felhasználó vagy AI stílus
    // Javítás: A szöveget biztonságosan kezeljük (HTML escape)
    bubble.textContent = text;
    messagesContainer.appendChild(bubble); // Üzenet hozzáadása
    // Automatikus görgetés az új üzenethez
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-notification-container');
    if (!container) return; // Ha nincs konténer, nem tudunk toast-ot mutatni
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`; // Stílus beállítása (info, success, error)
    toast.textContent = message; // Üzenet beállítása
    container.appendChild(toast); // Toast hozzáadása a konténerhez

    // Időzítő a toast eltüntetéséhez
    const fadeOutTimer = setTimeout(() => {
        toast.style.animation = 'fadeOut 0.5s forwards'; // Eltűnés animáció
        // Animáció után elem eltávolítása a DOM-ból
        const removeTimer = setTimeout(() => toast.remove(), 500);
        // Biztosítjuk, hogy a removeTimer is törlődjön, ha a toast-ra kattintanak
        toast.dataset.removeTimer = removeTimer;
    }, duration);

    // Kattintásra azonnal eltűnik
    toast.addEventListener('click', () => {
        clearTimeout(fadeOutTimer); // Időzítő törlése
        if (toast.dataset.removeTimer) {
             clearTimeout(parseInt(toast.dataset.removeTimer)); // Remove időzítő törlése
        }
        toast.style.animation = 'fadeOut 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    });
}

function setupThemeSwitcher() {
    const themeSwitcher = document.getElementById('theme-switcher');
    const htmlEl = document.documentElement; // A <html> elem
    // Ikon beállító függvény
    const setIcon = (theme) => {
        themeSwitcher.innerHTML = theme === 'dark'
            ? '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>' // Nap ikon
            : '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>'; // Hold ikon
    };
    // Aktuális téma betöltése (localStorage vagy alapértelmezett 'dark')
    const currentTheme = localStorage.getItem('theme') || 'dark';
    htmlEl.className = `${currentTheme}-theme`; // Téma osztály beállítása a <html> elemen
    setIcon(currentTheme); // Ikon beállítása

    // Kattintás eseménykezelő a váltáshoz
    themeSwitcher.addEventListener('click', () => {
        let newTheme = htmlEl.className.includes('dark') ? 'light' : 'dark'; // Téma váltása
        htmlEl.className = `${newTheme}-theme`; // Új téma osztály beállítása
        localStorage.setItem('theme', newTheme); // Új téma mentése localStorage-ba
        setIcon(newTheme); // Ikon frissítése
    });
}

function createGlowingOrbs() {
    try {
        const orbContainer = document.createElement('div');
        orbContainer.className = 'orb-container';
        const appContainer = document.querySelector('.app-container');
        if (!appContainer) return; // Ha nincs meg a fő konténer, kilépünk
        appContainer.appendChild(orbContainer); // Gömb konténer hozzáadása

        const orbCount = isMobile() ? 5 : 10; // Kevesebb gömb mobilon
        for (let i = 0; i < orbCount; i++) {
            const orb = document.createElement('div');
            orb.className = 'glowing-orb'; // Gömb elem létrehozása
            // Véletlenszerű méret, átlátszóság, animáció időtartam és késleltetés
            const size = Math.random() * (isMobile() ? 20 : 30) + 10; // Kisebb gömbök mobilon
            const scale = Math.random() * 0.5 + 0.5;
            const opacity = Math.random() * 0.3 + 0.1; // Halványabb gömbök
            const duration = Math.random() * 20 + 15;
            const delay = Math.random() * -duration; // Negatív késleltetés a folyamatos animációhoz

            // Stílusok beállítása
            orb.style.width = `${size}px`;
            orb.style.height = `${size}px`;
            orb.style.setProperty('--scale', scale);
            orb.style.setProperty('--opacity', opacity);
            orb.style.animationDuration = `${duration}s`;
            orb.style.animationDelay = `${delay}s`;

            // Véletlenszerű kezdő és végpozíciók
            const startX = Math.random() * 120 - 10; // Képernyőn kívülről is indulhat
            const startY = Math.random() * 120 - 10;
            const endX = Math.random() * 120 - 10;
            const endY = Math.random() * 120 - 10;
            orb.style.setProperty('--start-x', `${startX}vw`);
            orb.style.setProperty('--start-y', `${startY}vh`);
            orb.style.setProperty('--end-x', `${endX}vw`);
            orb.style.setProperty('--end-y', `${endY}vh`);

            orbContainer.appendChild(orb); // Gömb hozzáadása a konténerhez
        }
    } catch (e) {
        console.error("Hiba a háttér fénygömbök létrehozásakor:", e);
    }
}

function createHeaderOrbs() {
    try {
        const orbContainer = document.createElement('div');
        orbContainer.className = 'orb-container-header';
        const appHeader = document.querySelector('.app-header');
        if (!appHeader) return;
        appHeader.prepend(orbContainer); // A fejléc elejére szúrjuk be

        const orbCount = 3; // Kevesebb gömb a fejlécbe
        for (let i = 0; i < orbCount; i++) {
            const orb = document.createElement('div');
            orb.className = 'glowing-orb-orange'; // Narancs színű gömbök
            // Kisebb méretek és finomabb animáció
            const size = Math.random() * 10 + 5;
            const scale = Math.random() * 0.4 + 0.6;
            const opacity = Math.random() * 0.4 + 0.2;
            const duration = Math.random() * 8 + 6;
            const delay = Math.random() * -duration;

            orb.style.width = `${size}px`;
            orb.style.height = `${size}px`;
            orb.style.setProperty('--scale', scale);
            orb.style.setProperty('--opacity', opacity);
            orb.style.animationDuration = `${duration}s`;
            orb.style.animationDelay = `${delay}s`;

            // Csak a fejléc területén mozognak
            const startX = Math.random() * 100; // 0% és 100% szélesség között
            const startY = Math.random() * 80 - 10; // Felső 80px-es sávban, kicsit fölé is mehet
            const endX = Math.random() * 100;
            const endY = Math.random() * 80 - 10;
            orb.style.setProperty('--start-x', `${startX}vw`);
            orb.style.setProperty('--start-y', `${startY}px`);
            orb.style.setProperty('--end-x', `${endX}vw`);
            orb.style.setProperty('--end-y', `${endY}px`);

            orbContainer.appendChild(orb);
        }
    } catch (e) {
        console.error("Hiba a fejléc fénygömbök létrehozásakor:", e);
    }
}

function initMultiSelect() {
    // Megkeressük a gombok helyét
    const controlsBarActions = document.querySelector('.controls-bar .main-actions');
    if (controlsBarActions) {
        // Létrehozzuk a gombot
        const multiSelectButton = document.createElement('button');
        multiSelectButton.id = 'multiAnalysisBtn'; // ID a könnyebb eléréshez
        multiSelectButton.className = 'btn btn-special btn-lg'; // Stílus osztályok
        multiSelectButton.textContent = 'Kiválasztottak Elemzése (0)'; // Kezdeti szöveg
        multiSelectButton.disabled = true; // Kezdetben letiltva
        multiSelectButton.onclick = runMultiAnalysis; // Kattintás eseménykezelő
        // Hozzáadjuk a gombot a többi mellé
        controlsBarActions.appendChild(multiSelectButton);
    } else {
        console.warn("Nem található a .controls-bar .main-actions elem a többes elemzés gomb inicializálásához.");
    }
}


function addCheckboxListeners() {
    const checkboxes = document.querySelectorAll('.match-checkbox');
    checkboxes.forEach(cb => {
        // Eltávolítjuk a régi figyelőt (ha volt), hogy ne duplikálódjon
        cb.removeEventListener('change', handleCheckboxChange);
        // Hozzáadjuk az új figyelőt
        cb.addEventListener('change', handleCheckboxChange);
    });
}

function handleCheckboxChange(event) {
    const checkbox = event.target; // A checkbox, amire kattintottak
    const matchId = checkbox.dataset.matchId; // A hozzá tartozó meccs egyedi ID-ja
    // Megkeressük a szülő kártyát/listaelemet a vizuális visszajelzéshez
    const cardOrItem = checkbox.closest('.selectable-card, .selectable-item');

    if (!matchId) return; // Ha nincs matchId, nem csinálunk semmit

    if (checkbox.checked) { // Ha bepipálták
        if (appState.selectedMatches.size < 3) { // Ellenőrizzük, hogy nincs-e már 3 kiválasztva
            appState.selectedMatches.add(matchId); // Hozzáadjuk a Set-hez
            cardOrItem?.classList.add('selected'); // Vizuális jelzés (ha van szülő elem)
        } else {
            checkbox.checked = false; // Visszavonjuk a pipát
            showToast('Maximum 3 meccset választhatsz ki egyszerre többes elemzéshez.', 'error'); // Hibaüzenet
        }
    } else { // Ha kivették a pipát
        appState.selectedMatches.delete(matchId); // Eltávolítjuk a Set-ből
        cardOrItem?.classList.remove('selected'); // Vizuális jelzés eltávolítása
    }
    updateMultiSelectButton(); // Frissítjük a gomb szövegét és állapotát
}

function updateMultiSelectButton() {
    const btn = document.getElementById('multiAnalysisBtn');
    if (!btn) return; // Ha a gomb nem létezik, kilépünk
    const count = appState.selectedMatches.size; // Kiválasztott meccsek száma
    btn.textContent = `Kiválasztottak Elemzése (${count})`; // Szöveg frissítése
    // A gomb akkor aktív, ha 1, 2 vagy 3 meccs van kiválasztva
    btn.disabled = count === 0 || count > 3;
}
