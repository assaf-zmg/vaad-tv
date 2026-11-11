# שער דחיפה לפרודקשן (לפי verification-before-completion)
כלל: אין "עובד" או "באוויר" בלי ראיה טרייה מהריצה הנוכחית. דיווח של סשן אחר הוא לא ראיה. המנהל מריץ בעצמו את סעיפים 1–4 ו-9–11.

## לפני commit (פיתוח מריץ, מנהל מריץ שוב)
1. `cd server && npm test`: 0 כשלונות (לוח תמונות + חוזה מסנן ynet מול ה-fixture של התוכן).
2. `npx acorn@8.11.3 --ecma5 --silent public/js/dashboard.js`: יציאה 0.
3. CSS: אין `grid`, `gap:`, `var(--`, `backdrop-filter`, `inset:`, `clamp(` ב-`public/css/style.css`.
4. `git diff --stat` תואם לרשימת הקבצים שדווחה (בלי קבצי mock/test בבאנדל של Vercel).
5. בדיקה בהרצה, 1920×1080, צילום מסך לכל מצב: יום רגיל, חג, אבל, פלייר של ועד, תמונה בהירה/מושלגת, אזעקה, ynet ריק (מצב "החדשות הטובות יחזרו בקרוב").
6. סקירת קוד בלתי תלויה (requesting-code-review): סוכן שלא כתב את הקוד עובר על כל ה-diff. ממצאים קריטיים נסגרים לפני הדחיפה.
7. אישור בעלים על צילומי המסך (D12).

## דחיפה (finishing-a-development-branch, בהתאמה שלנו)
8. commit אחד או כמה מסודרים על ענף, ואז `git push origin "${H}:main"` לפי hash. רק commits שלנו (`git log origin/main..HEAD`).

## אחרי הדחיפה (מנהל)
9. `git fetch && git log origin/main -1`: ה-hash תואם.
10. `curl -s "https://vaad-tv.vercel.app/api/dashboard.json?v=$RANDOM"`: יש `background` עם `url`, ו-`ynet` מסונן. polling עד שהפריסה עולה.
11. `curl -sI "https://vaad-tv.vercel.app/api/bg/0?v=$RANDOM"`: ‏200 ו-image/jpeg. אותו דבר ל-`/api/theme/hanukkah/0`.
12. צילום מסך מהפרודקשן ב-1920×1080. הבעלים מאשר שהמסך בלובי נטען אחרי רענון (הקיוסק הישן הוא הבדיקה האמיתית).
