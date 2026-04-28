const API_BASE = "https://padelhome-production.up.railway.app";
const app = document.getElementById("app");
const nav = document.getElementById("main-nav");

const questions = [
  { id: 1, title: "כמה זמן אתה משחק פאדל?", options: ["אף פעם לא שיחקתי", "כמה שבועות", "כמה חודשים", "מעל שנה", "מספר שנים"] },
  { id: 2, title: "האם אתה מצליח לקיים ראלי (התמסרות)?", options: ["לא מצליח", "כמה חבטות בודדות", "ראלי איטי", "ראלי יציב", "ראלי מהיר ויציב"] },
  { id: 3, title: "שליטה בוולי", options: ["אין שליטה", "בסיסית מאוד", "סבירה", "טובה", "מצוינת"] },
  { id: 4, title: "שליטה במשחק מהקיר", options: ["לא יודע לשחק עם הקיר", "שליטה בסיסית", "שליטה סבירה", "שליטה טובה", "שליטה גבוהה"] },
  { id: 5, title: "שליטה בלובים וגובה הכדור", options: ["לא שולט", "שליטה בסיסית", "שליטה סבירה", "שליטה טובה", "שליטה מצוינת"] },
  { id: 6, title: "איך אתה מדרג את ההבנה שלך במשחק?", options: ["אין הבנה", "הבנה מועטה", "הבנה בסיסית", "הבנה טובה", "הבנה גבוהה מאוד"] },
  { id: 7, title: "מה רמת המשחק שלך בפועל?", options: ["לא משחק משחקים מלאים", "משחק חברי בלבד", "משחק תחרותי ברמה נמוכה", "משתתף בתחרויות בארץ", "משתתף בתחרויות בארץ ובחו\"ל"] }
];

const state = {
  token: localStorage.getItem("token"),
  user: null,
  answers: [],
  currentCoachId: null
};

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "API error" }));
    throw new Error(err.error || "API error");
  }
  return res.json();
}

function canAccessApp() {
  return !!state.user && state.user.level !== null;
}

function render(route = "register") {
  if (!state.user && route !== "register") route = "register";
  if (state.user && state.user.level === null && route !== "quiz") route = "quiz";
  nav.classList.toggle("hidden", !canAccessApp());
  const template = document.getElementById(`${route}-template`);
  app.innerHTML = "";
  app.appendChild(template.content.cloneNode(true));
  if (route === "register") return initRegister();
  if (route === "quiz") return initQuiz();
  if (route === "result") return initResult();
  if (route === "home") return initHome();
  if (route === "coaches") return initCoaches();
  if (route === "coach") return initCoach();
  if (route === "chat") return initChat();
  if (route === "profile") return initProfile();
}

async function bootstrap() {
  if (!state.token) return render("register");
  try {
    const data = await api("/users/me");
    state.user = data.user;
    render(state.user.level === null ? "quiz" : "home");
  } catch {
    localStorage.removeItem("token");
    state.token = null;
    render("register");
  }
}

function initRegister() {
  document.getElementById("register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const data = await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: fd.get("name").trim(),
          email: fd.get("email").trim(),
          password: fd.get("password"),
          location: fd.get("location").trim()
        })
      });
      state.token = data.token;
      localStorage.setItem("token", data.token);
      state.user = data.user;
      render("quiz");
    } catch (err) {
      alert(err.message);
    }
  });
}

function initQuiz() {
  const form = document.getElementById("quiz-form");
  questions.forEach((q) => {
    const block = document.createElement("fieldset");
    block.className = "card";
    const legend = document.createElement("legend");
    legend.textContent = `שאלה ${q.id}: ${q.title}`;
    block.appendChild(legend);
    q.options.forEach((option, idx) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = `q${q.id}`;
      input.required = true;
      input.value = String(idx);
      label.appendChild(input);
      label.append(` ${option}`);
      block.appendChild(label);
    });
    form.appendChild(block);
  });
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "חשב רמה";
  form.appendChild(submit);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const answers = questions.map((q) => ({ questionId: q.id, answerValue: Number(fd.get(`q${q.id}`)) }));
    try {
      const data = await api("/questionnaire/submit", { method: "POST", body: JSON.stringify({ answers }) });
      state.answers = answers;
      state.user = data.user;
      render("result");
    } catch (err) {
      alert(err.message);
    }
  });
}

function initResult() {
  document.getElementById("level-line").textContent = `הרמה שלך היא ${state.user.level} (ניקוד ${state.user.levelScore})`;
  document.getElementById("level-description").textContent = state.user.levelDescription;
  document.getElementById("to-home").addEventListener("click", () => render("home"));
}

function initHome() {
  document.getElementById("home-name").textContent = state.user.name;
  document.getElementById("home-level").textContent = state.user.level;
  document.getElementById("home-score").textContent = state.user.levelScore;
  document.getElementById("home-location").textContent = state.user.location;
  document.getElementById("find-coaches").addEventListener("click", () => render("coaches"));
}

async function initCoaches() {
  const list = document.getElementById("coaches-list");
  try {
    const data = await api("/coaches/match");
    if (!data.coaches.length) {
      list.innerHTML = "<p>לא נמצאו מאמנים מותאמים כרגע לפי מיקום ורמה.</p>";
      return;
    }
    data.coaches.forEach((coach) => {
      const card = document.createElement("article");
      card.className = "card";
      card.innerHTML = `<h3>${coach.name}</h3><p>מיקום: ${coach.location}</p><p>טווח רמות: ${coach.minLevel} - ${coach.maxLevel}</p><p>דירוג: ${coach.avgRating}</p><div class="coach-actions"><button data-open="${coach.id}">לפרופיל מאמן</button></div>`;
      list.appendChild(card);
    });
    list.querySelectorAll("button[data-open]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.currentCoachId = Number(btn.dataset.open);
        render("coach");
      });
    });
  } catch (err) {
    list.innerHTML = `<p>${err.message}</p>`;
  }
}

async function initCoach() {
  const data = await api(`/coaches/${state.currentCoachId}`);
  const coach = data.coach;
  document.getElementById("coach-name").textContent = coach.name;
  document.getElementById("coach-location").textContent = coach.location;
  document.getElementById("coach-range").textContent = `${coach.minLevel} - ${coach.maxLevel}`;
  document.getElementById("coach-rating").textContent = coach.avgRating;
  const reviewForm = document.getElementById("review-form");
  reviewForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const rating = Number(new FormData(reviewForm).get("rating"));
    await api("/reviews", { method: "POST", body: JSON.stringify({ coachId: coach.id, rating }) });
    alert("הדירוג נשמר.");
    render("coach");
  });
  const select = document.querySelector('select[name="recommendedLevel"]');
  [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].forEach((lvl) => {
    const option = document.createElement("option");
    option.value = String(lvl);
    option.textContent = String(lvl);
    select.appendChild(option);
  });
  const recommendForm = document.getElementById("recommend-form");
  recommendForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(recommendForm);
    await api("/coach-recommendations", {
      method: "POST",
      body: JSON.stringify({ coachId: coach.id, recommendedLevel: Number(fd.get("recommendedLevel")), note: fd.get("note").trim() })
    });
    alert("המלצת המאמן נשלחה וממתינה לאישור.");
    recommendForm.reset();
  });
}

function initChat() {
  const log = document.getElementById("chat-log");
  log.innerHTML = "<p><strong>בוט:</strong> היי! שאל אותי על שיפור משחק או מציאת מאמן.</p>";
  const form = document.getElementById("chat-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const question = new FormData(form).get("question").trim();
    const data = await api("/chat", { method: "POST", body: JSON.stringify({ question }) });
    log.innerHTML += `<p><strong>אתה:</strong> ${question}</p>`;
    log.innerHTML += `<p><strong>בוט:</strong> ${data.reply}</p>`;
    form.reset();
  });
}

async function initProfile() {
  const data = await api("/users/me");
  const { user, recommendations } = data;
  state.user = user;
  document.getElementById("profile-name").textContent = user.name;
  document.getElementById("profile-email").textContent = user.email;
  document.getElementById("profile-location").textContent = user.location;
  document.getElementById("profile-level").textContent = user.level;
  document.getElementById("profile-score").textContent = user.levelScore;
  document.getElementById("profile-description").textContent = user.levelDescription;
  const wrap = document.getElementById("recommendations");
  if (!recommendations.length) {
    wrap.innerHTML = "<p>אין המלצות כרגע.</p>";
    return;
  }
  wrap.innerHTML = "";
  recommendations.forEach((r) => {
    const item = document.createElement("div");
    item.className = "card";
    item.innerHTML = `<p>מאמן: ${r.coach.name}</p><p>רמה מוצעת: ${r.recommendedLevel}</p><p>הערה: ${r.note}</p><p>סטטוס: ${r.status}</p>`;
    wrap.appendChild(item);
  });
}

nav.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-route]");
  if (!btn) return;
  render(btn.dataset.route);
});

bootstrap();
