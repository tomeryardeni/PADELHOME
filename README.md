# PadelMatch MVP - Production Path

האפליקציה מחולקת ל-2 חלקים:

- `Frontend` (קבצים סטטיים בשורש הפרויקט: `index.html`, `app.js`, `styles.css`)
- `Backend API` בתיקיית [backend](C:\Users\tomer.y\Documents\Codex\2026-04-28\mvp-1-1-2-2-3\backend)

## מה כבר מוכן בקוד

### Frontend
- הרשמה עם שם/אימייל/סיסמה/מיקום
- שאלון חובה (7 שאלו ))
- תוצאת רמה
- התאמת מאמנים לפי מיקום + רמה
- דירוג מאמן
- המלצת מאמן לשינוי רמה
- צ'אט MVP עם טיפים מותאמים

### Backend
- `POST /auth/register`
- `POST /questionnaire/submit`
- `GET /users/me`
- `GET /coaches/match`
- `GET /coaches/:id`
- `POST /reviews`
- `POST /coach-recommendations`
- `POST /chat`

Database schema: [schema.prisma](C:\Users\tomer.y\Documents\Codex\2026-04-28\mvp-1-1-2-2-3\backend\prisma\schema.prisma)

---

## שלבים שאתה צריך לבצע (פעם אחת)

## 1) לפתוח PostgreSQL בענן
אפשר Neon / Supabase / Railway (איזה שנוח לך).
בסוף השלב צריך להיות לך `DATABASE_URL`.

## 2) להרים את ה-Backend
מומלץ Render או Railway.

1. העלה את הריפו לגיטהאב
2. צור Web Service חדש מהתיקייה `backend`
3. הגדר Environment Variables:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `CLIENT_URL` (כתובת ה-Frontend שלך, למשל `https://your-app.vercel.app`)
4. Build command:
   - `npm install && npx prisma generate`
5. Start command:
   - `npm run start`

אחרי שהשרת קם, הרץ פעם אחת migration + seed (ב-console של השירות או מקומית):

```bash
npx prisma migrate deploy
node prisma/seed.js
```

## 3) להעלות את ה-Frontend
מומלץ Vercel/Netlify:

1. העלה את תיקיית השורש (שבה `index.html`)
2. ב-[app.js](C:\Users\tomer.y\Documents\Codex\2026-04-28\mvp-1-1-2-2-3\app.js) עדכן:
   - `const API_BASE = "https://YOUR-BACKEND-URL";`
3. בצע deploy מחדש

## 4) בדיקת תקינות
1. הרשמה למשתמש חדש
2. מילוי שאלון
3. וידוא שהרמה נשמרת
4. פתיחת מסך מאמנים ורייטינג
5. בדיקת פרופיל שההמלצות נשמרו

---

## הרצה לוקלית (לפני Production)

### Backend
```bash
cd backend
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev
node prisma/seed.js
npm run dev
```

### Frontend
פתח את `index.html` בדפדפן עם שרת סטטי פשוט (Live Server למשל), או כל static hosting.

---

## הערה חשובה

בסביבת העבודה הנוכחית כאן לא הצלחתי להריץ `npm/node` בגלל הרשאות מערכת, אז את שלבי ההרצה/פריסה בפועל תבצע אצלך או ב-CI. הקוד והמבנה מוכנים לפריסה.
