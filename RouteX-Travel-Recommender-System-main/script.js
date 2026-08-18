/*   
   ROUTEX ESCAPADE — script.js
   ML Engine: K-Nearest Neighbors (k=5, Euclidean distance)
   Auth     : Per-user localStorage sessions
      */
(function () {
  "use strict";

  /*AUTH MODULE */
  const USERS_KEY   = "voyagerAI_users";
  const SESSION_KEY = "voyagerAI_session";
  const THEME_KEY   = "voyagerAI_theme";

  function hashPassword(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {  hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
  }

  function getUsers()        { try { return JSON.parse(localStorage.getItem(USERS_KEY) || "{}"); } catch(_) { return {}; } }
  function saveUsers(u)      { localStorage.setItem(USERS_KEY, JSON.stringify(u)); }
  function getSession()      { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch(_) { return null; } }
  function saveSession(s)    { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); }
  function historyKey(uname) { return `voyagerAI_history_${uname}`; }

  /* auth DOM refs */
  const authOverlay     = document.getElementById("authOverlay");
  const loginPanel      = document.getElementById("loginPanel");
  const registerPanel   = document.getElementById("registerPanel");
  const loginError      = document.getElementById("loginError");
  const registerError   = document.getElementById("registerError");
  const loginBtn        = document.getElementById("loginBtn");
  const registerBtn     = document.getElementById("registerBtn");
  const goRegister      = document.getElementById("goRegister");
  const goLogin         = document.getElementById("goLogin");
  const userPill        = document.getElementById("userPill");
  const userAvatar      = document.getElementById("userAvatar");
  const userDisplayName = document.getElementById("userDisplayName");
  const logoutBtn       = document.getElementById("logoutBtn");

  function showAuthError(el, msg) { el.textContent = msg; el.hidden = false; }
  function clearAuthError(el)     { el.hidden = true; el.textContent = ""; }
  function showPanel(p) {
    loginPanel.hidden    = p !== "login";
    registerPanel.hidden = p !== "register";
    clearAuthError(loginError);
    clearAuthError(registerError);
  }

  goRegister.addEventListener("click", () => showPanel("register"));
  goLogin.addEventListener("click",    () => showPanel("login"));

  document.getElementById("loginPassword").addEventListener("keydown", (e) => { if (e.key === "Enter") loginBtn.click(); });
  document.getElementById("regPassword").addEventListener("keydown",   (e) => { if (e.key === "Enter") registerBtn.click(); });

  loginBtn.addEventListener("click", () => {
    clearAuthError(loginError);
    const username = document.getElementById("loginUsername").value.trim().toLowerCase();
    const password = document.getElementById("loginPassword").value;
    if (!username || !password) { showAuthError(loginError, "Please fill in both fields."); return; }
    const users = getUsers();
    const user  = users[username];
    if (!user || user.pwHash !== hashPassword(password)) { showAuthError(loginError, "Incorrect username or password."); return; }
    onLoginSuccess(user);
  });

  registerBtn.addEventListener("click", () => {
    clearAuthError(registerError);
    const name     = document.getElementById("regName").value.trim();
    const username = document.getElementById("regUsername").value.trim().toLowerCase();
    const password = document.getElementById("regPassword").value;
    if (!name || !username || !password) { showAuthError(registerError, "Please fill in all fields."); return; }
    if (username.length < 3)             { showAuthError(registerError, "Username must be at least 3 characters."); return; }
    if (password.length < 6)             { showAuthError(registerError, "Password must be at least 6 characters."); return; }
    if (!/^[a-z0-9_]+$/.test(username))  { showAuthError(registerError, "Username: letters, numbers, underscores only."); return; }
    const users = getUsers();
    if (users[username]) { showAuthError(registerError, "Username already taken."); return; }
    const newUser = { name, username, pwHash: hashPassword(password) };
    users[username] = newUser;
    saveUsers(users);
    onLoginSuccess(newUser);
  });

  logoutBtn.addEventListener("click", () => {
    saveSession(null);
    currentSession       = null;
    userPill.hidden      = true;
    authOverlay.classList.remove("hidden");
    resultSection.hidden  = true;
    loadingSection.hidden = true;
    historyList.innerHTML = "";
    historyEmpty.hidden   = false;
    clearHistoryBtn.hidden = true;
    window.latestAIResult  = null;
  });

  function onLoginSuccess(user) {
    currentSession              = { username: user.username, name: user.name };
    saveSession(currentSession);
    authOverlay.classList.add("hidden");
    userPill.hidden             = false;
    userAvatar.textContent      = user.name.charAt(0).toUpperCase();
    userDisplayName.textContent = user.name.split(" ")[0];
    renderHistory();
  }

  let currentSession = getSession();
  if (currentSession) {
    authOverlay.classList.add("hidden");
    userPill.hidden = false;
    const u = getUsers()[currentSession.username];
    if (u) {  userAvatar.textContent      = u.name.charAt(0).toUpperCase();  userDisplayName.textContent = u.name.split(" ")[0];
    }
  }

  /* APP STATE */
  let currentMatches        = [];
  let currentRecommendation = 0;
  let lastUserInput         = null;
  let aiCache               = {};
  window.latestAIResult     = null;

  const MAX_CYCLE_RESULTS = 12;

  /* DOM REFS */
  const form           = document.getElementById("travelForm");
  const resetBtn       = document.getElementById("resetBtn");
  const getRecBtn      = document.getElementById("getRecBtn");
  const anotherBtn     = document.getElementById("anotherBtn");
  const loadingSection = document.getElementById("loadingSection");
  const loadingText    = document.getElementById("loadingText");
  const resultSection  = document.getElementById("resultSection");

  const resultCountry = document.getElementById("resultCountry");
  const resultName    = document.getElementById("resultName");
  const resultDesc    = document.getElementById("resultDesc");
  const statBudget    = document.getElementById("statBudget");
  const statDays      = document.getElementById("statDays");
  const scoreArc      = document.getElementById("scoreArc");
  const dialScore     = document.getElementById("dialScore");
  const whyList       = document.getElementById("whyList");
  const galleryGrid   = document.getElementById("galleryGrid");
  const galleryTitle  = document.getElementById("galleryTitle");
  const matchCount    = document.getElementById("matchCount");

  const historyList      = document.getElementById("historyList");
  const historyEmpty     = document.getElementById("historyEmpty");
  const clearHistoryBtn  = document.getElementById("clearHistoryBtn");
  const themeToggle      = document.getElementById("themeToggle");
  const themeIcon        = document.getElementById("themeIcon");

  /* CHIP GROUPS */
  const chipGroups = {};
  document.querySelectorAll(".chip-row").forEach((row) => {
    const groupName = row.dataset.group;
    const chips     = Array.from(row.querySelectorAll(".chip"));
    const active    = chips.find((c) => c.classList.contains("is-active"));
    chipGroups[groupName] = active ? active.dataset.value : chips[0].dataset.value;
    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        chips.forEach((c) => c.classList.remove("is-active"));
        chip.classList.add("is-active");
        chipGroups[groupName] = chip.dataset.value;
      });
    });
  });

  function resetChipGroups() {
    document.querySelectorAll(".chip-row").forEach((row) => {
      const groupName = row.dataset.group;
      const chips     = Array.from(row.querySelectorAll(".chip"));
      chips.forEach((c) => c.classList.remove("is-active"));
      chips[0].classList.add("is-active");
      chipGroups[groupName] = chips[0].dataset.value;
    });
  }

  /*   
    KNN ML ENGINE
     Feature vector (all normalised 0–1):
       [0] category match       (binary)
       [1] weather proximity    (0 | 0.5 | 1 → normalised)
       [2] budget proximity     (0 | 0.5 | 1 → normalised)
       [3] destination type     (binary)
       [4] days fit             (0 | 0.5 | 1 → normalised)
     */
  const WEATHER_ORDER = ["Cold", "Moderate", "Warm"];
  const BUDGET_ORDER  = ["Low",  "Medium",   "High"];

  /** Encode a destination+userInput pair into a normalised feature vector */
  function encodeFeatures(destination, userInput) {
    // Category match: 1 if exact, 0 otherwise
    const categoryMatch = destination.category === userInput.category ? 1 : 0;

    // Weather proximity: 1=exact, 0.5=one step away, 0=far
    const dW = WEATHER_ORDER.indexOf(destination.weather);
    const uW = WEATHER_ORDER.indexOf(userInput.weather);
    const weatherDiff  = Math.abs(dW - uW);
    const weatherScore = weatherDiff === 0 ? 1 : weatherDiff === 1 ? 0.5 : 0;

    // Budget proximity: same logic
    const dB = BUDGET_ORDER.indexOf(destination.budget);
    const uB = BUDGET_ORDER.indexOf(userInput.budget);
    const budgetDiff  = Math.abs(dB - uB);
    const budgetScore = budgetDiff === 0 ? 1 : budgetDiff === 1 ? 0.5 : 0;

    // Destination type: 1 if India/Foreign preference matches
    const destIsIndia = destination.country === "India";
    const wantsIndia  = userInput.destinationType === "India";
    const typeMatch   = destIsIndia === wantsIndia ? 1 : 0;

    // Days fit: 1=within range, 0.5=within 2 days, 0=outside
    let daysScore = 0;
    if (userInput.days >= destination.minDays && userInput.days <= destination.maxDays) {
      daysScore = 1;
    } else {
      const diff = userInput.days < destination.minDays
        ? destination.minDays - userInput.days
        : userInput.days - destination.maxDays;
      daysScore = diff <= 2 ? 0.5 : 0;
    }

    return [categoryMatch, weatherScore, budgetScore, typeMatch, daysScore];
  }

  /** Euclidean distance between two feature vectors */
  function euclideanDistance(a, b) {
    return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0));
  }

  /*
    KNN: encode user as an "ideal" feature vector [1,1,1,1,1]
    then find the k=5 nearest destinations by Euclidean distance.
    Rank by distance (ascending). Return top MAX_CYCLE_RESULTS.
   */
  function knnGetMatches(userInput, k = 5) {
    // Hard-filter by destination type first
    const wantsIndia = userInput.destinationType === "India";
    const pool       = destinationsData.filter((d) => (d.country === "India") === wantsIndia);

    // Ideal target vector (perfect match)
    const ideal = [1, 1, 1, 1, 1];

    // Score each destination
    const scored = pool.map((destination) => {
      const features = encodeFeatures(destination, userInput);
      const distance = euclideanDistance(features, ideal);

      // Convert distance to a similarity percentage (max distance = sqrt(5) ≈ 2.236)
      const maxDist   = Math.sqrt(5);
      const similarity = Math.round(((maxDist - distance) / maxDist) * 100);

      return { destination, features, distance, percent: similarity };
    });

    // Sort by distance (closest = best match)
    scored.sort((a, b) => a.distance - b.distance);

    return scored.slice(0, MAX_CYCLE_RESULTS);
  }

  /* Generate human-readable reasons for a match */
  function getWhyReasons(destination, userInput) {
    const reasons = [];

    if (destination.category === userInput.category)
      reasons.push(`Your preferred category (${destination.category}) is an exact match`);

    const dB = BUDGET_ORDER.indexOf(destination.budget);
    const uB = BUDGET_ORDER.indexOf(userInput.budget);
    if (dB === uB)             reasons.push("Matches your budget preference exactly");
    else if (Math.abs(dB-uB) === 1) reasons.push("Within one step of your preferred budget range");

    const dW = WEATHER_ORDER.indexOf(destination.weather);
    const uW = WEATHER_ORDER.indexOf(userInput.weather);
    if (dW === uW)             reasons.push("Weather conditions match your preference");
    else if (Math.abs(dW-uW) === 1) reasons.push("Climate is close to your preferred weather");

    if (userInput.days >= destination.minDays && userInput.days <= destination.maxDays)
      reasons.push(`Your ${userInput.days}-day trip fits perfectly within the recommended duration`);
    else
      reasons.push(`Adaptable itinerary for a trip close to ${userInput.days} days`);

    return reasons;
  }

  /*   AI SERVER CALL*/
  async function getAIRecommendation(userInput, topMatches, knnSelected) {
    try {
      const res = await fetch("http://localhost:3000/api/ai-recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userInput,
          topMatches: topMatches.map((m) => ({
            name:        m.destination.name,
            country:     m.destination.country,
            category:    m.destination.category,
            weather:     m.destination.weather,
            budget:      m.destination.budget,
            minDays:     m.destination.minDays,
            maxDays:     m.destination.maxDays,
            description: m.destination.description,
            knnDistance: m.distance,
            knnPercent:  m.percent,
          })),
          knnSelected: {
            name:        knnSelected.destination.name,
            country:     knnSelected.destination.country,
            category:    knnSelected.destination.category,
            weather:     knnSelected.destination.weather,
            budget:      knnSelected.destination.budget,
            minDays:     knnSelected.destination.minDays,
            maxDays:     knnSelected.destination.maxDays,
            description: knnSelected.destination.description,
          },
        }),
      });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn("AI server unavailable:", err.message);
      return null;
    }
  }

  /* RENDERING*/
  function formatRupees(amount) {
    if (!amount) return "—";
    return "₹" + Number(amount).toLocaleString("en-IN");
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str ?? "");
    return div.innerHTML;
  }

  function renderRecommendation(index) {
    const match = currentMatches[index];
    if (!match) return;
    const d = match.destination;

    resultCountry.textContent = `Recommended destination · ${d.country}`;
    resultName.textContent    = d.name;
    resultDesc.textContent    = d.description;
    statDays.textContent      = `${d.minDays}–${d.maxDays} days`;

    // Show placeholder until AI returns real budget
    statBudget.textContent = "Calculating...";

    /* score dial — KNN similarity % */
    const circumference = 2 * Math.PI * 84;
    const offset        = circumference - (match.percent / 100) * circumference;
    scoreArc.style.transition       = "none";
    scoreArc.style.strokeDasharray  = `${circumference}`;
    scoreArc.style.strokeDashoffset = `${circumference}`;
    requestAnimationFrame(() => {
      scoreArc.style.transition       = "stroke-dashoffset 1.1s cubic-bezier(.16,1,.3,1)";
      scoreArc.style.strokeDashoffset = `${offset}`;
    });
    dialScore.textContent = `${match.percent}%`;

    /* why reasons (KNN default) */
    const reasons = getWhyReasons(d, lastUserInput);
    whyList.innerHTML = reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("");

    /* AI server override — richer summary + real budget */
    /* AI server override — richer summary + real budget */
const ai = window.latestAIResult;
const aiMatch = ai && (
  ai.selectedDestinationName?.trim().toLowerCase() === d.name?.trim().toLowerCase() ||
  aiCache[d.name]  // also check cache directly by destination name
);
if (aiMatch) {
  const aiData = aiCache[d.name] || ai;
  resultDesc.textContent = aiData.aiSummary || d.description;
  if (aiData.reasons && aiData.reasons.length) {
    whyList.innerHTML = aiData.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("");
  }
  if (aiData.realBudgetINR) {
    statBudget.textContent = formatRupees(aiData.realBudgetINR);
    if (aiData.budgetBreakdown) {
      statBudget.title = aiData.budgetBreakdown;
      statBudget.style.cursor = "help";
    }
  }
}

    /* gallery */
    galleryTitle.textContent = `Places to explore in ${d.name}`;
    galleryGrid.innerHTML = d.places.map((place, idx) => `
      <div class="attraction-card">
        <div class="attraction-card__img-wrap">
          <img id="place-img-${idx}" src="${escapeHtml(place.image)}"
               alt="${escapeHtml(place.name)}" loading="lazy" class="card-photo"
               referrerpolicy="no-referrer" />
        </div>
        <div class="attraction-card__body">
          <h4>${escapeHtml(place.name)}</h4>
          <p>${escapeHtml(place.description)}</p>
        </div>
      </div>`).join("");

    galleryGrid.querySelectorAll(".attraction-card__img-wrap img").forEach((img) => {
      attachImageFallback(img, img.alt);
    });

    matchCount.textContent = `Match ${index + 1} of ${currentMatches.length}`;
  }

  /* IMAGE HELPERS*/
  const GRADIENT_PALETTES = [
    ["#FF6B4D","#CC9A3D"],["#1C7C72","#0E1B2C"],["#E0512F","#1C7C72"],
    ["#CC9A3D","#0E1B2C"],["#FF6B4D","#1C7C72"],["#0E1B2C","#CC9A3D"],
  ];
  function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
    return Math.abs(h);
  }
  function placeholderImageUri(label) {
    const [c1, c2] = GRADIENT_PALETTES[hashString(label) % GRADIENT_PALETTES.length];
    const initials = label.split(" ").filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/>
      </linearGradient></defs>
      <rect width="800" height="600" fill="url(#g)"/>
      <circle cx="400" cy="255" r="78" fill="rgba(255,255,255,0.16)"/>
      <text x="400" y="270" font-family="Georgia,serif" font-size="58" fill="#fff" text-anchor="middle" dominant-baseline="middle">${escapeHtml(initials)}</text>
      <text x="400" y="430" font-family="Arial,sans-serif" font-size="28" fill="rgba(255,255,255,0.92)" text-anchor="middle" dominant-baseline="middle">${escapeHtml(label)}</text>
    </svg>`;
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }
  function attachImageFallback(imgEl, label) {
    imgEl.addEventListener("error", () => { imgEl.src = placeholderImageUri(label); }, { once: true });
  }

  const IMG_CACHE    = {};
  const COMMONS_BASE = "https://commons.wikimedia.org/w/api.php";
  const WIKI_BASE    = "https://en.wikipedia.org/w/api.php";

  function isGoodImage(url) {
    if (!url) return false;
    const u = url.toLowerCase();
    if (!u.includes(".jpg") && !u.includes(".jpeg") && !u.includes(".png")) return false;
    const BAD = ["map","flag","logo","icon","coat_of_arms","locator","route","location_",
      "blank","schematic","diagram","emblem","seal","shield","insignia","wikimedia",
      "commons-logo","wikidata","question_mark","noimage","stub","pictogram","symbol",
      "signature","_plan","plan_","red_pog","aerial_view_of_location"];
    return !BAD.some((kw) => u.includes(kw));
  }

  /*FORM FLOW*/
  function collectUserInput() {
    return {
      days:            parseInt(document.getElementById("days").value, 10) || 1,
      travelers:       parseInt(document.getElementById("travelers").value, 10) || 1,
      ages:            (document.getElementById("ages").value || "").split(",").map(a=>a.trim()).filter(Boolean),
      budget:          chipGroups.budget,
      destinationType: chipGroups.destinationType,
      category:        chipGroups.category,
      weather:         chipGroups.weather,
    };
  }

  const LOADING_MESSAGES = [
    "Computing…",
    "Researching real travel costs…",
    "Ranking the top matches for your trip…",
  ];

  function runLoadingSequence(onDone) {
    loadingSection.hidden = false;
    resultSection.hidden  = true;
    loadingSection.scrollIntoView({ behavior: "smooth", block: "start" });
    let idx = 0;
    loadingText.textContent = LOADING_MESSAGES[0];
    const iv = setInterval(() => {
      idx = (idx + 1) % LOADING_MESSAGES.length;
      loadingText.textContent = LOADING_MESSAGES[idx];
    }, 600);
    // Allow AI call to finish before revealing result
    onDone(iv);
  }

  form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const userInput = collectUserInput();
  lastUserInput   = userInput;
  getRecBtn.disabled = true;
  window.latestAIResult = null;
  aiCache = {};

  // Show loading screen
  loadingSection.hidden = false;
  resultSection.hidden  = true;
  loadingSection.scrollIntoView({ behavior: "smooth", block: "start" });
  let msgIdx = 0;
  loadingText.textContent = LOADING_MESSAGES[0];
  const iv = setInterval(() => {
    msgIdx = (msgIdx + 1) % LOADING_MESSAGES.length;
    loadingText.textContent = LOADING_MESSAGES[msgIdx];
  }, 600);

  // Run KNN instantly
  currentMatches        = knnGetMatches(userInput, 5);
  currentRecommendation = 0;

  // Wait for AI before showing anything
  const knnBest = currentMatches[0];
 try {
  const aiResult = await getAIRecommendation(userInput, currentMatches.slice(0, 5), knnBest);
  if (aiResult && !aiResult.error) {
    window.latestAIResult = aiResult; // ← SET BEFORE clearInterval
    aiCache[aiResult.selectedDestinationName] = aiResult;
    const aiIdx = currentMatches.findIndex(
      (m) => m.destination.name === aiResult.selectedDestinationName
    );
    if (aiIdx > 0) {
      const [pick] = currentMatches.splice(aiIdx, 1);
      currentMatches.unshift(pick);
      currentRecommendation = 0;
    }
  }
} catch (_) {}

clearInterval(iv);
loadingSection.hidden = true;
resultSection.hidden  = false;
renderRecommendation(currentRecommendation); // latestAIResult already set
resultSection.scrollIntoView({ behavior: "smooth", block: "start" });

  // Save history and unlock button AFTER everything is ready
  saveSearchToHistory(userInput, currentMatches[0]);
  getRecBtn.disabled = false;

  // Prefetch suggestion 2 in background AFTER suggestion 1 is fully done
  setTimeout(() => prefetchNext(), 2000); // 2s delay to avoid rate limit
});

  async function fetchAIForCurrent() {
  const match = currentMatches[currentRecommendation];
  if (!match) return;
  const name = match.destination.name;

  if (!aiCache[name]) {
    resultSection.hidden  = true;
    loadingSection.hidden = false;
    loadingSection.scrollIntoView({ behavior: "smooth", block: "start" });

    let msgIdx = 0;
    loadingText.textContent = LOADING_MESSAGES[0];
    const iv = setInterval(() => {
      msgIdx = (msgIdx + 1) % LOADING_MESSAGES.length;
      loadingText.textContent = LOADING_MESSAGES[msgIdx];
    }, 600);

    try {
  const ai = await getAIRecommendation(lastUserInput, currentMatches.slice(0, 5), match);
  if (ai && !ai.error) {
    aiCache[name] = ai;
    window.latestAIResult = ai; // ← SET HERE, before clearInterval
  }
} catch (_) {}

clearInterval(iv);

// window.latestAIResult is already set above — don't overwrite with null
if (!window.latestAIResult) {
  window.latestAIResult = aiCache[name] ?? null;
}

loadingSection.hidden = true;
resultSection.hidden  = false;
renderRecommendation(currentRecommendation); // now latestAIResult is ready
resultSection.scrollIntoView({ behavior: "smooth", block: "start" });

if (!aiCache[name]) {
  statBudget.textContent = "—";
  const reasons = getWhyReasons(match.destination, lastUserInput);
  whyList.innerHTML = reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("");
}

  } else {
    window.latestAIResult = aiCache[name];
    resultSection.hidden  = false;
    renderRecommendation(currentRecommendation);
    resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}


// Add this function
async function prefetchNext() {
  const nextIdx = (currentRecommendation + 1) % currentMatches.length;
  const nextMatch = currentMatches[nextIdx];
  if (!nextMatch) return;
  const name = nextMatch.destination.name;
  if (aiCache[name]) return; // already cached, skip

  try {
    const ai = await getAIRecommendation(
  lastUserInput,
  currentMatches.slice(0, 5),
  nextMatch  // ← just pass nextMatch directly
);
    if (ai && !ai.error) {
      aiCache[name] = ai;
      console.log("Prefetched:", name);
    }
  } catch (_) {}
}

prefetchNext();

  // REPLACE the old anotherBtn handler with this:
anotherBtn.addEventListener("click", async () => {
  if (!currentMatches.length) return;
  currentRecommendation = (currentRecommendation + 1) % currentMatches.length;
  await fetchAIForCurrent();
});

  resetBtn.addEventListener("click", () => {
    form.reset();
    document.getElementById("days").value      = 5;
    document.getElementById("travelers").value = 2;
    resetChipGroups();
    resultSection.hidden  = true;
    loadingSection.hidden = true;
    window.latestAIResult = null;
    aiCache = {};   
  });

  /* HISTORY — per-user via localStorage*/
  function loadHistory() {
    if (!currentSession) return [];
    try { return JSON.parse(localStorage.getItem(historyKey(currentSession.username)) || "[]"); }
    catch(_) { return []; }
  }

  function saveSearchToHistory(userInput, topMatch) {
    if (!currentSession) return;
    const history = loadHistory();
    history.unshift({
      destination:     topMatch.destination.name,
      country:         topMatch.destination.country,
      category:        userInput.category,
      budget:          userInput.budget,
      weather:         userInput.weather,
      destinationType: userInput.destinationType,
      days:            userInput.days,
      travelers:       userInput.travelers,
      knnPercent:      topMatch.percent,
      timestamp:       new Date().toISOString(),
    });
    localStorage.setItem(historyKey(currentSession.username), JSON.stringify(history.slice(0, 20)));
    renderHistory();
  }

  function renderHistory() {
    const history = loadHistory();
    if (!history.length) {
      historyEmpty.hidden    = false;
      clearHistoryBtn.hidden = true;
      historyList.innerHTML  = "";
      return;
    }
    historyEmpty.hidden    = true;
    clearHistoryBtn.hidden = false;
    historyList.innerHTML  = history.map((entry) => {
      const d = new Date(entry.timestamp).toLocaleString("en-IN", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
      });
      const pct = entry.knnPercent ?? entry.matchPercent ?? "—";
      return `<li class="history-item">
        <div class="history-item__main">
          <span class="history-item__dest">${escapeHtml(entry.destination)}
            <span style="color:var(--ink-soft);font-weight:500">(${escapeHtml(entry.country)})</span>
          </span>
          <span class="history-item__meta">${escapeHtml(entry.category)} · ${escapeHtml(entry.budget)} budget · ${entry.days}d · ${entry.travelers} traveler(s) · ${pct}% match</span>
        </div>
        <span class="history-item__time">${d}</span>
      </li>`;
    }).join("");
  }

  clearHistoryBtn.addEventListener("click", () => {
    if (!currentSession) return;
    localStorage.removeItem(historyKey(currentSession.username));
    renderHistory();
  });

  /* DARK MODE*/
  function applyTheme(theme) {
    document.documentElement.classList.toggle("dark", theme === "dark");
    themeIcon.textContent = theme === "dark" ? "☀️" : "🌙";
  }
  themeToggle.addEventListener("click", () => {
    const newTheme = document.documentElement.classList.contains("dark") ? "light" : "dark";
    applyTheme(newTheme);
    localStorage.setItem(THEME_KEY, newTheme);
  });

  /* INIT*/
  const savedTheme  = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme:dark)").matches;
  applyTheme(savedTheme || (prefersDark ? "dark" : "light"));
  renderHistory();
})();
