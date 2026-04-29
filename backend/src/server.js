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

async function understandAndAnswerWithAI({ question, user, answers, recentMessages = [] }) {
  if (!process.env.OPENAI_API_KEY) {
    return {
      answer: `לפי הרמה שלך (${user.level ?? "לא נקבעה"}), תתמקד בעקביות, מיקום ודיוק. שאל אותי שוב עם פירוט מטרה ואבנה תרגול מדויק.`,
      resourcesQuery: `padel ${question}`,
      drills: ["3 סטים של 10 דקות תרגול ממוקד", "מעקב טעויות חוזרות", "סיכום 3 לקחים בסוף אימון"]
    };
  }

  const system = `
אתה מאמן פאדל מקצועי. תענה בעברית, קצר וקונקרטי.
הבן לבד את הכוונה מהשאלה והקונטקסט (למשל סרב=הגשה בפאדל).
החזר JSON בלבד בפורמט:
{
  "intent": "short string",
  "subtopic": "short string",
  "answer": "4-6 שורות מעשיות",
  "resourcesQuery": "query for YouTube/articles",
  "drills": ["...", "...", "..."]
}
אין טקסט מחוץ ל-JSON.
`;

  const payload = {
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    input: [
      { role: "system", content: system },
      {
        role: "user",
        content: JSON.stringify({
          question,
          user: {
            level: user.level,
            levelScore: user.levelScore,
            location: user.location
          },
          answers,
          recentMessages
        })
      }
    ]
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error("AI request failed");
  const data = await response.json();
  const text = (data.output_text || "").trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const jsonText = start >= 0 && end > start ? text.slice(start, end + 1) : "{}";
  const parsed = JSON.parse(jsonText);

  return {
    answer: parsed.answer || "לא הצלחתי לייצר תשובה כרגע.",
    resourcesQuery: parsed.resourcesQuery || `padel ${question}`,
    drills: Array.isArray(parsed.drills) ? parsed.drills : []
  };
}

function buildResourcesFromQuery(resourcesQuery) {
  const q = encodeURIComponent(resourcesQuery || "padel training");
  return [
    { title: "YouTube results", url: `https://www.youtube.com/results?search_query=${q}` },
    { title: "Google results", url: `https://www.google.com/search?q=${q}` }
  ];
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
  try {
    const { question } = req.body;
    if (!question || !String(question).trim()) return res.status(400).json({ error: "Missing question" });

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    const answers = await prisma.levelAnswer.findMany({ where: { userId: req.userId }, orderBy: { questionId: "asc" } });
    const recentMessages = [];

    const ai = await understandAndAnswerWithAI({
      question: String(question),
      user,
      answers,
      recentMessages
    });

    const resources = buildResourcesFromQuery(ai.resourcesQuery);

    res.json({
      reply: ai.answer,
      drills: ai.drills,
      resources
    });
  } catch {
    res.status(500).json({ error: "Chat failed" });
  }
});

app.post("/insights/weekly-plan", auth, async (req, res) => {
  try {
    const { goal } = req.body || {};
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    const plan = {
      summary: `תוכנית 7 ימים לרמה ${user.level ?? "לא נקבעה"} עם דגש על ${goal || "שיפור כללי"}.`,
      days: [
        { day: 1, focus: "יציבות ראלי", drill: "4 סטים של 6 דק' ראלי", target: "15 חבטות רצופות" },
        { day: 2, focus: "וולי", drill: "3 סטים של 20 חזרות", target: "80% דיוק" },
        { day: 3, focus: "משחק מהקיר", drill: "3 סטים של 15 חזרות", target: "10 כדורים עמוקים" },
        { day: 4, focus: "לוב והגנה", drill: "3 סטים של 12 לובים", target: "70% עומק" },
        { day: 5, focus: "טקטיקה זוגית", drill: "45 דק' מיקום", target: "פחות טעויות מיקום" },
        { day: 6, focus: "משחקון לחץ", drill: "2 משחקונים ל-10 נק'", target: "החלטות נכונות" },
        { day: 7, focus: "סיכום", drill: "סט מלא + תיעוד", target: "3 לקחים" }
      ]
    };
    res.json({ plan });
  } catch {
    res.status(500).json({ error: "Plan failed" });
  }
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`API running on ${port}`));
