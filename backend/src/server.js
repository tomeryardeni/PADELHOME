import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.CLIENT_URL?.split(",") || "*" }));

const levels = [
  { min: 0, max: 3, level: 1, description: "שחקן מתחיל מאוד, היכרות ראשונית עם המשחק." },
  { min: 4, max: 6, level: 1.5, description: "שחקן מתחיל עם יכולת בסיסית מאוד." },
  { min: 7, max: 10, level: 2, description: "שחקן בעל שליטה בסיסית מהקו האחורי, ללא שליטה בקיר וללא משחק רשת." },
  { min: 11, max: 14, level: 2.5, description: "שחקן ביניים בתחילת הדרך, ראלי יציב בקצב מתון." },
  { min: 15, max: 18, level: 3, description: "שחקן ביניים עם יסודות טובים, מתחיל לשחק טקטית." },
  { min: 19, max: 21, level: 3.5, description: "שחקן מתקדם עם משחק רשת משופר והבנת נקודות." },
  { min: 22, max: 24, level: 4, description: "שחקן בעל שליטה גבוהה, הבנה טקטית טובה, משחק מהיר ויכולת לסיים נקודות." },
  { min: 25, max: 26, level: 4.5, description: "שחקן מתקדם מאוד עם עקביות גבוהה תחת לחץ." },
  { min: 27, max: 28, level: 5, description: "שחקן תחרותי בכיר עם שליטה מלאה בכל מרכיבי המשחק." }
];

function levelByScore(score) {
  return levels.find((x) => score >= x.min && score <= x.max);
}

function tokenFor(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "30d" });
}

function auth(req, res, next) {
  const raw = req.headers.authorization;
  if (!raw) return res.status(401).json({ error: "Missing token" });
  try {
    const payload = jwt.verify(raw.replace("Bearer ", ""), process.env.JWT_SECRET);
    req.userId = payload.userId;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    location: user.location,
    level: user.level,
    levelScore: user.levelScore,
    levelDescription: user.levelDescription
  };
}

function inferTopic(question) {
  const q = question.toLowerCase();
  if (q.includes("וולי") || q.includes("volley")) return "volley";
  if (q.includes("קיר") || q.includes("wall") || q.includes("glass")) return "wall";
  if (q.includes("לוב") || q.includes("lob")) return "lob";
  if (q.includes("טקט") || q.includes("position") || q.includes("strategy")) return "tactics";
  if (q.includes("ראלי") || q.includes("consistency")) return "consistency";
  return "general";
}

function buildResources(question, topic) {
  const encoded = encodeURIComponent(`padel ${question}`);
  const byTopic = {
    volley: [
      { title: "YouTube: Padel Volley Drills", url: "https://www.youtube.com/results?search_query=padel+volley+drills" },
      { title: "Article: Padel Volley Technique", url: "https://thepadelschool.com/" }
    ],
    wall: [
      { title: "YouTube: Padel Wall Shots", url: "https://www.youtube.com/results?search_query=padel+wall+shots+tutorial" },
      { title: "Article: Playing Off The Glass", url: "https://www.redbull.com/int-en/padel-rules-and-tips" }
    ],
    lob: [
      { title: "YouTube: Padel Lob Tutorial", url: "https://www.youtube.com/results?search_query=padel+lob+tutorial" },
      { title: "Article: Lob Decision Making", url: "https://thepadelpaper.com/" }
    ],
    tactics: [
      { title: "YouTube: Padel Tactics", url: "https://www.youtube.com/results?search_query=padel+tactics+positioning" },
      { title: "Article: Tactical Basics", url: "https://thepadelschool.com/" }
    ],
    consistency: [
      { title: "YouTube: Padel Consistency Drills", url: "https://www.youtube.com/results?search_query=padel+consistency+drills" },
      { title: "Article: Improving Rally Control", url: "https://www.worldpadeltourtv.com/" }
    ],
    general: [
      { title: "YouTube: General Padel Tips", url: "https://www.youtube.com/results?search_query=padel+tips+for+beginners" },
      { title: "Article: Padel Fundamentals", url: "https://www.padelfip.com/" }
    ]
  };
  return [
    ...(byTopic[topic] || byTopic.general),
    { title: "More results for your exact question", url: `https://www.youtube.com/results?search_query=${encoded}` }
  ];
}

function buildConcreteReply(topic, userLevel, tips) {
  const opening = `לפי הרמה שלך (${userLevel ?? "לא נקבעה"}) הנה תשובה ממוקדת:`;
  const topicLine = {
    volley: "בוולי: שמור מחבט גבוה לפני המגע, פגוש את הכדור מוקדם, וסגור זווית עם צעד קדמי קטן.",
    wall: "במשחק מהקיר: תן לכדור לצאת מהזכוכית לפני החבטה, שמור מרחק גוף יציב מהקיר, וכוון עומק למרכז המגרש.",
    lob: "בלוב: עדיף חצי-גבוה עם עומק מאשר לוב מהיר ונמוך; המטרה היא להחזיר עמדה לרשת.",
    tactics: "בטקטיקה: שחקו כזוג ברוחב מתואם, הימנעו מ'חור' באמצע, והעדיפו כדור בטוח לפני ניסיון ווינר.",
    consistency: "בראלי: עדיפות לדיוק וקצב קבוע; ספור 8-10 חבטות יציבות לפני העלאת סיכון.",
    general: "כרגע הכי חשוב לבנות עקביות, מיקום, והבנת החלטות בסיסיות בכל נקודה."
  };
  return `${opening} ${topicLine[topic] || topicLine.general} ${tips.join(" ")}`.trim();
}

async function generateEnhancedReply({ question, user, answers, baseReply }) {
  if (!process.env.OPENAI_API_KEY) return baseReply;
  try {
    const prompt = `
You are a professional padel coach assistant.
User level: ${user.level ?? "unknown"}
User score: ${user.levelScore ?? "unknown"}
Question: ${question}
Answers summary: ${JSON.stringify(answers)}

Give a concise and concrete Hebrew answer in 4-6 lines with practical drills.
`;
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: prompt
      })
    });
    if (!response.ok) return baseReply;
    const data = await response.json();
    const text = data?.output_text?.trim();
    return text || baseReply;
  } catch {
    return baseReply;
  }
}

async function rankCoachesWithAI({ user, coaches, goal }) {
  if (!coaches.length) return [];
  if (!process.env.OPENAI_API_KEY) {
    return coaches
      .map((c) => ({
        coachId: c.id,
        score: 70 + Math.min(20, c.reviews.length * 2),
        reason: "התאמה לפי רמה/מיקום ודירוג."
      }))
      .sort((a, b) => b.score - a.score);
  }

  const prompt = `
Rank these padel coaches for this user.
User level: ${user.level}
User location: ${user.location}
Goal: ${goal || "general improvement"}
Coaches: ${JSON.stringify(
    coaches.map((c) => ({
      id: c.id,
      name: c.name,
      location: c.location,
      minLevel: c.minLevel,
      maxLevel: c.maxLevel,
      reviews: c.reviews.length
    }))
  )}
Return JSON array: [{coachId:number, score:number, reason:string}] sorted desc by score.
`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: prompt
      })
    });
    if (!response.ok) return [];
    const data = await response.json();
    const text = data?.output_text || "[]";
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

async function buildWeeklyPlan({ user, answers, goal }) {
  const base = {
    summary: `תוכנית 7 ימים לרמה ${user.level ?? "לא נקבעה"} עם דגש על ${goal || "שיפור כללי"}.`,
    days: [
      { day: 1, focus: "יציבות ראלי", drill: "4 סטים של 6 דק' ראלי בקצב בינוני", target: "15 חבטות רצופות" },
      { day: 2, focus: "וולי", drill: "3 סטים של 20 חזרות וולי פור-הנד/בק-הנד", target: "80% דיוק" },
      { day: 3, focus: "משחק מהקיר", drill: "3 סטים של 15 חזרות יציאה מהקיר", target: "10 כדורים עמוקים" },
      { day: 4, focus: "לוב והגנה", drill: "3 סטים של 12 לובים לעומק", target: "70% עומק קו אחורי" },
      { day: 5, focus: "טקטיקה בזוגות", drill: "45 דק' תרגיל מיקום וחילוף קווי כיסוי", target: "צמצום טעויות מיקום" },
      { day: 6, focus: "משחקון לחץ", drill: "2 משחקונים ל-10 נקודות בקצב גבוה", target: "שמירה על קבלת החלטה נכונה" },
      { day: 7, focus: "סיכום ובקרה", drill: "סט אחד מלא + תיעוד טעויות חוזרות", target: "3 לקחים לשבוע הבא" }
    ]
  };

  if (!process.env.OPENAI_API_KEY) return base;

  try {
    const prompt = `
Create a specific 7-day padel plan in Hebrew as JSON.
User level: ${user.level}
User score: ${user.levelScore}
Goal: ${goal || "general"}
Answers: ${JSON.stringify(answers)}
Return:
{
 "summary": "...",
 "days": [{"day":1,"focus":"...","drill":"...","target":"..."}]
}
`;
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: prompt
      })
    });
    if (!response.ok) return base;
    const data = await response.json();
    const parsed = JSON.parse(data?.output_text || "{}");
    if (!parsed?.days || !Array.isArray(parsed.days)) return base;
    return parsed;
  } catch {
    return base;
  }
}

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/", (_req, res) => res.send("PadelMatch API is running"));

app.post("/auth/register", async (req, res) => {
  const { name, email, password, location } = req.body;
  if (!name || !email || !password || !location) return res.status(400).json({ error: "Missing required fields" });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 chars" });
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return res.status(409).json({ error: "Email already exists" });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { name, email, passwordHash, location } });
  const token = tokenFor(user.id);
  res.status(201).json({ token, user: sanitizeUser(user) });
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Missing email or password" });
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: "Invalid email or password" });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid email or password" });
  const token = tokenFor(user.id);
  res.json({ token, user: sanitizeUser(user) });
});

app.post("/questionnaire/submit", auth, async (req, res) => {
  const { answers } = req.body;
  if (!Array.isArray(answers) || answers.length !== 7) return res.status(400).json({ error: "Expected 7 answers" });
  const score = answers.reduce((sum, a) => sum + Number(a.answerValue || 0), 0);
  const lv = levelByScore(score);
  await prisma.$transaction([
    prisma.levelAnswer.deleteMany({ where: { userId: req.userId } }),
    prisma.levelAnswer.createMany({
      data: answers.map((a) => ({ userId: req.userId, questionId: Number(a.questionId), answerValue: Number(a.answerValue) }))
    }),
    prisma.user.update({
      where: { id: req.userId },
      data: { levelScore: score, level: lv.level, levelDescription: lv.description }
    })
  ]);
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  res.json({ user: sanitizeUser(user) });
});

app.get("/users/me", auth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  const recommendations = await prisma.coachRecommendation.findMany({
    where: { userId: req.userId },
    include: { coach: true },
    orderBy: { createdAt: "desc" }
  });
  res.json({ user: sanitizeUser(user), recommendations });
});

app.get("/coaches/match", auth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (user.level === null) return res.status(400).json({ error: "Questionnaire not completed" });
  const coaches = await prisma.coach.findMany({
    where: { location: user.location, minLevel: { lte: user.level }, maxLevel: { gte: user.level } },
    include: { reviews: true }
  });
  res.json({
    coaches: coaches.map((c) => ({
      ...c,
      avgRating: c.reviews.length ? (c.reviews.reduce((s, r) => s + r.rating, 0) / c.reviews.length).toFixed(1) : "N/A"
    }))
  });
});

app.get("/coaches/:id", auth, async (req, res) => {
  const coach = await prisma.coach.findUnique({ where: { id: Number(req.params.id) }, include: { reviews: true } });
  if (!coach) return res.status(404).json({ error: "Coach not found" });
  const avgRating = coach.reviews.length ? (coach.reviews.reduce((s, r) => s + r.rating, 0) / coach.reviews.length).toFixed(1) : "N/A";
  res.json({ coach: { ...coach, avgRating } });
});

app.post("/reviews", auth, async (req, res) => {
  const { coachId, rating } = req.body;
  if (rating < 1 || rating > 5) return res.status(400).json({ error: "rating must be 1-5" });
  const review = await prisma.review.create({ data: { coachId: Number(coachId), userId: req.userId, rating: Number(rating) } });
  res.status(201).json({ review });
});

app.post("/coach-recommendations", auth, async (req, res) => {
  const { coachId, recommendedLevel, note } = req.body;
  const rec = await prisma.coachRecommendation.create({
    data: {
      coachId: Number(coachId),
      userId: req.userId,
      recommendedLevel: Number(recommendedLevel),
      note: String(note || ""),
      status: "pending"
    }
  });
  res.status(201).json({ recommendation: rec });
});

app.post("/chat", auth, async (req, res) => {
  const { question } = req.body;
  if (!question || !String(question).trim()) return res.status(400).json({ error: "Missing question" });

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  const answers = await prisma.levelAnswer.findMany({ where: { userId: req.userId } });
  const byQ = Object.fromEntries(answers.map((a) => [a.questionId, a.answerValue]));
  const tips = [];
  if ((byQ[4] ?? 4) <= 1) tips.push("מומלץ לתרגל משחק קיר פעמיים בשבוע.");
  if ((byQ[3] ?? 4) <= 1) tips.push("כדאי לתרגל וולי קצר עם דגש על מיקום.");
  if ((byQ[6] ?? 4) <= 2) tips.push("שפר הבנה טקטית דרך תרגילי מיקום זוגי.");
  if (!tips.length) tips.push("המשך לעבוד על עקביות ולחץ נקודתי.");

  const topic = inferTopic(String(question));
  const baseReply = buildConcreteReply(topic, user.level, tips);
  const reply = await generateEnhancedReply({ question, user, answers, baseReply });
  const resources = buildResources(String(question), topic);

  res.json({ reply, resources });
});

app.post("/ai/coach-match", auth, async (req, res) => {
  const { goal } = req.body || {};
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  const coaches = await prisma.coach.findMany({
    where: {
      location: user.location,
      minLevel: { lte: user.level ?? 1 },
      maxLevel: { gte: user.level ?? 1 }
    },
    include: { reviews: true }
  });

  const ranking = await rankCoachesWithAI({ user, coaches, goal });
  const byId = new Map(coaches.map((c) => [c.id, c]));
  const ranked = ranking
    .map((r) => ({
      coachId: r.coachId,
      score: r.score,
      reason: r.reason,
      coach: byId.get(r.coachId)
    }))
    .filter((x) => x.coach);

  res.json({ rankedCoaches: ranked });
});

app.post("/insights/weekly-plan", auth, async (req, res) => {
  const { goal } = req.body || {};
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  const answers = await prisma.levelAnswer.findMany({ where: { userId: req.userId } });
  const plan = await buildWeeklyPlan({ user, answers, goal });
  res.json({ plan });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`API running on ${port}`));
