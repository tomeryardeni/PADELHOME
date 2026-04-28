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

app.get("/health", (_req, res) => res.json({ ok: true }));

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
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  const answers = await prisma.levelAnswer.findMany({ where: { userId: req.userId } });
  const tips = [];
  const map = Object.fromEntries(answers.map((a) => [a.questionId, a.answerValue]));
  if ((map[4] ?? 4) <= 1) tips.push("מומלץ לתרגל משחק קיר פעמיים בשבוע.");
  if ((map[3] ?? 4) <= 1) tips.push("כדאי לתרגל וולי קצר עם דגש על מיקום.");
  if ((map[6] ?? 4) <= 2) tips.push("לשפר הבנה טקטית דרך תרגילי מיקום זוגי.");
  if (!tips.length) tips.push("המשך לעבוד על עקביות ולחץ נקודתי.");
  const coaches = await prisma.coach.findMany({
    where: { minLevel: { lte: user.level ?? 1 }, maxLevel: { gte: user.level ?? 1 } },
    select: { name: true }
  });
  const names = coaches.map((c) => c.name).join(", ") || "אין כרגע מאמנים מתאימים";
  res.json({ reply: `לפי רמה ${user.level ?? "לא נקבעה"}: ${tips.join(" ")} מאמנים רלוונטיים: ${names}.` });
});

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

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`API running on ${port}`));
