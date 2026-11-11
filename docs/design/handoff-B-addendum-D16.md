# תוספת למסירה B: חדשות טובות מ-ynet (D16)

**מאת:** עיצוב לועד-TV. **אל:** פיתוח לועד-TV. הקופי מסשן התוכן (D15/D16), בלי סבב בעלים.

## 1. HTML (`public/index.html`), כותרת כרטיס ynet
להחליף
```html
<div class="card-header">כותרות ynet</div>
```
ב:
```html
<div class="card-header">חדשות טובות מ-ynet<span class="news-badge"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="none" stroke="#ffd58a" stroke-width="2"/><g stroke="#ffd58a" stroke-width="2" stroke-linecap="round"><line x1="12" y1="1.5" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22.5"/><line x1="1.5" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22.5" y2="12"/><line x1="4.6" y1="4.6" x2="6.3" y2="6.3"/><line x1="17.7" y1="17.7" x2="19.4" y2="19.4"/><line x1="19.4" y1="4.6" x2="17.7" y2="6.3"/><line x1="6.3" y1="17.7" x2="4.6" y2="19.4"/></g></svg>מסנן אופטימיות פעיל</span></div>
```
שמש ב-SVG inline, לא אימוג'י (פונט האימוג'י באנדרואיד 4.4 לא אמין).

## 2. עיצוב הבאדג' (כבר בתוך `handoff-B-style.css`, `.news-badge`)
- גלולה קטנה ושקטה: 16px (14px במסכים נמוכים), משקל 500, מסגרת `1px rgba(255,255,255,.45)`, רקע `rgba(0,0,0,.25)`, טקסט לבן 92%. השמש ב-15px בצבע `#ffd58a`.
- יושב בשורה של הכותרת, 10px אחריה. נקרא היטב גם על תמונה בהירה בזכות ההצללה של העמודה (נבדק על הדיונה ועל אגם שפולר).

## 3. מצב ריק (`public/js/dashboard.js`, `renderNewsPage`)
המשבצת כבר קיימת: כשאין כותרות, הפונקציה כותבת `<div class="fallback-text">חדשות לא זמינות</div>` לתוך `#news-content`. מחליפים רק את הטקסט:
```js
els.newsContent.innerHTML = '<div class="fallback-text">החדשות הטובות יחזרו בקרוב</div>';
```
הסגנון הוא `.fallback-text` הקיים ב-B: 22px, איטליק, לבן 70%, ממורכז, מתחת לכותרת והבאדג'. הנקודות נעלמות כשאין עמודים.

## בדיקה
- `docs/design/handoff-check-6-ynet-empty.jpeg`: מצב ריק עם באדג', 1920×1080.
- `docs/design/handoff-check-1-alert-urgent-holiday.jpeg`: באדג' עם כותרות, תמונה בהירה.
- `docs/design/handoff-check-4-1280x720-alert.jpeg`: באדג' במסך נמוך.
