# תוספת למסירה B: מצב התרעה אדומה (חיתוך הודעת ועד)

**מאת:** עיצוב לועד-TV. **אל:** פיתוח לועד-TV. נשלח בהודעה ב-11.11.2026 (בזמן ההקפאה), ומתויק כאן.

## הבעיה (נמצאה בפיתוח)
עם התרעה אדומה ב-1920×1080 והודעה אמיתית מהשיט (כותרת, גוף של 4 שורות, תאריך), כרטיס ההודעות חותך 56px: שורה נחתכת באמצע והתאריך נעלם. העמודה עצמה נגמרת בתוך המסך, והחיתוך הוא בתוך הכרטיס.

## ההחלטה
אפשרות (a), ועוד שורה אחת לכל כותרת חדשות בזמן התרעה. בזמן התרעה, הודעת הוועד משנית.
- פס ההתרעה נשאר כמו שהוא (87px: טקסט 40px + ריפוד 14px). בהתרעה אמיתית הוא צריך לשלוט במסך.
- הרקע ההדרגתי של `#photo` (‏`#2a3138 → #1a1d20 → #111110`, בקשת המנהל לציור ראשון): מאושר.

## JS (`renderAlert`)
להוסיף/להסיר class על `body`, בלי `classList` (בטוח ל-WebView ישן):
```js
// כשההתרעה מוצגת
if (!/(^|\s)has-alert(\s|$)/.test(document.body.className)) document.body.className += ' has-alert';
// כשההתרעה מוסתרת
document.body.className = document.body.className.replace(/(^|\s)has-alert(?=\s|$)/g, '');
```

## CSS (בסוף `style.css`, אחרי בלוק ה-`@media`, כדי לגבור גם במסכים קטנים)
```css
/* Red alert: the announcement is secondary; trim so nothing is cut mid-line */
body.has-alert .news-item { -webkit-line-clamp: 1; }
body.has-alert .announcement-card .ann-body { -webkit-line-clamp: 2; }
body.has-alert .announcement-card .ann-date { display: none; }

/* Any time: a long committee title must not push the body out of the card */
.announcement-card .ann-title {
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
```

## בדיקה (פיתוח)
צילום מחדש של `6-alert` עם ההודעה של 4 השורות מהשיט, ב-1920×1080 וב-1280×720. אסור ששורה תיחתך באמצע (במדידה ובעין).

## הערות שעלו בדרך (הוחלטו אצל המנהל)
- תאריך עברי באותיות במקום ספרות: D20 (פיתוח, צד שרת).
- אימוג'י בהודעות מוסרים בצד הלקוח: D21.
