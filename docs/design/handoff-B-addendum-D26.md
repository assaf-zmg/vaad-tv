# תוספת למסירה B: טקסט מלא תמיד (D26)

**מאת:** עיצוב לועד-TV. **אל:** פיתוח לועד-TV. הערת בעלים, דרך המנהל: "אי אפשר להציג כותרות חלקיות, לדיירים אין איך ללחוץ עליהן".
**הכלל על כל המסך:** אין `…`, אין line-clamp, אין חצי שורה. כל כותרת וכל הודעה מוצגות במלואן.
**מחליף** את חלק ה-CSS של `handoff-B-addendum-alert.md` (ה-clamps). ה-class `has-alert` על `body` נשאר, ומשמש עכשיו להקטנת השעון במסך נמוך.

## איך זה עובד
- **חדשות:** כותרת נשברת לשורות עד הסוף (עד כ-3 שורות ב-25px). העמודים נבנים לפי גובה: מציירים את כל הכותרות פעם אחת בזמן שהתוכן מוסתר (fade-out), מודדים `offsetHeight`, וממלאים כל עמוד בכותרות שלמות בלבד. בהתרעה יש פחות כותרות בעמוד. אם כותרת אחת גבוהה מכל הקופסה, עוברים מדרגת גופן אחת למטה (`.news-compact`).
- **הודעות ועד:** כותרת וגוף מלאים. מנסים שלוש מדרגות גופן (גוף 25 ← 22 ← 20, כותרת 30 ← 27 ← 24; במסך נמוך 20 ← 18 ← 17). אם גם במדרגה הקטנה זה לא נכנס, הגוף מתחלק לחלקים ("1/2", "2/2") שמתחלפים באותו סבב של 20 שניות. החלוקה מעדיפה ירידת שורה שהוועד הקליד, ואחרת נשברת בין מילים.
- **התרעה במסך נמוך:** השעון יורד ל-56px כדי לפנות מקום לטקסט מלא.
- המדידה רק ב-ES5: `offsetHeight` / `clientHeight`, בלי ResizeObserver.
- **גופן Heebo:** בדפדפן מודרני הוא נטען אחרי הציור הראשון, ולכן מודדים שוב כשהוא מוכן (`document.fonts.ready`, רק אם קיים). במכשיר בלובי אין `document.fonts`, והוא גם לא טוען את הגופן, אז השלב הזה מדולג שם.

## JS (`public/js/dashboard.js`)
1. להחליף את כל הבלוק שמתחיל ב-`// --- Render: Announcements ---` ונגמר ממש לפני `// --- Render: Shabbat ---` בתוכן של `docs/design/handoff-D26-pagination.js`.
2. למחוק את הקבועים `ANNOUNCEMENTS_PER_PAGE` ו-`NEWS_PER_PAGE` ואת המשתנה `announcementPage`, שכבר לא בשימוש.
3. ב-`render()`: במקום `announcementPage = 0; newsPage = 0;` לכתוב:
   ```js
   // Keep the rotation position across polls; re-measure the current item.
   annPart = 0;
   annLayout = null;
   ```
   (בלי זה, כל פולינג של 2 דקות מחזיר את הסבב להודעה הראשונה.)
4. ב-`init()`, אחרי `fetchData();`, להוסיף `relayoutWhenFontsReady();`.

## CSS (`public/css/style.css`)
1. **למחוק את כל ה-clamps:**
   - ב-`.news-item` וב-`.announcement-card .ann-body`: השורות `overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: N; -webkit-box-orient: vertical;`.
   - בתוך `@media (max-height: 820px)`: את `-webkit-line-clamp: 1` מ-`.news-item` ואת `-webkit-line-clamp: 3` מ-`.ann-body`.
   - את כל בלוק "Red alert" מתוספת ההתרעה: 3 כללי `body.has-alert` וה-clamp של `.ann-title`.
2. **להוסיף בסוף הקובץ** את התוכן של `docs/design/handoff-D26.css`.
3. בדיקה: `grep -n "line-clamp\|ellipsis" public/css/style.css` צריך להחזיר רק הערות.

## בדיקה שעשיתי (עותק של `public/` הנוכחי עם השינויים)
- `acorn --ecma5`: עובר. בדיקה בדפדפן: 0 אלמנטים עם line-clamp.
- `docs/design/D26-check-1-normal-1920.jpeg`: יום רגיל. כותרת ה"פוקאצ'ה" המלאה (110 תווים, 3 שורות), והודעת 6 שורות ב-2 חלקים.
- `docs/design/D26-check-2-alert-1920-part1.jpeg` ו-`D26-check-3-alert-1920-part2.jpeg`: התרעה. ההודעה מתחלקת בסוף משפט ("...בין 8:00 ל-16:00."), 2/2 מסיים את הטקסט.
- `docs/design/D26-check-4-alert-1280x720.jpeg`: התרעה במסך נמוך. כל 8 הכותרות קצרות מהקופסה (מקסימום 89 מתוך 93px), וההודעה ב-4 חלקים.
- **לא נבדק:** המכשיר עצמו (גופן Arial במקום Heebo, ולכן העמודים יצאו קצת שונים, וזה תקין כי המדידה נעשית על המכשיר).

## מה לבדוק אחרי היישום
עם השיט האמיתי ועם ה-ynet המסונן, ב-1920×1080 וב-1280×720, עם התרעה ובלי: לעבור על סבב מלא של חדשות והודעות ולוודא שאין שורה חתוכה ואין `…`.
