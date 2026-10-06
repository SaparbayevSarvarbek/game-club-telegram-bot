# Telegram Bot Deployment Guide

## O'zgartirilgan Fayllar

### 1. `src/bot.js`
**O'zgarishlar:**
- `bot.launch()` ga `dropPendingUpdates: true` va `allowedUpdates` parametrlari qo'shildi
- Webhook avtomatik o'chirish logikasi qo'shildi (`deleteWebhook`)
- 409 Conflict xatoligi uchun batafsil xabar qo'shildi
- Graceful shutdown funksiyasi qo'shildi (`SIGTERM`, `SIGINT` signal handlerlar)

**Nima uchun:**
- **409 Conflict** xatosi webhook va polling bir vaqtda ishlaganda yuzaga keladi
- Render.com deploy qilganda eski instance hali to'xtamagan bo'lsa, yangi instance ishga tushishda conflict bo'ladi
- `deleteWebhook()` bot polling rejimida ishlashini ta'minlaydi
- Graceful shutdown Render.com yangi deploy qilganda eski instanceni to'g'ri to'xtatadi

### 2. `src/scheduler.js`
**O'zgarishlar:**
- `startReportScheduler` funksiyasiga supergroup migration xatosi uchun maxsus error handling qo'shildi
- Xato yuz berganda yangi chat ID ni qanday topish bo'yicha batafsil ko'rsatmalar logda chiqadi

**Nima uchun:**
- Group supergroup ga o'tkazilganda eski chat ID (`-4853010931`) ishlamaydi
- Yangi supergroup ID kerak (`-1001234567890` formatida)
- Xatolik yuz berganda adminlarga aniq yo'riqnoma beradi

### 3. `.env.example`
**Yangi fayl yaratildi**

**Nima uchun:**
- Barcha environment variablelar uchun namuna va dokumentatsiya
- Chat ID ni qanday topish bo'yicha batafsil yo'riqnoma
- Development va production uchun sozlamalar

---

## Render.com Environment Variables

Quyidagi environment variablelarni Render.com dashboard da sozlang:

### Majburiy (Required):
```
BOT_TOKEN=<BotFather dan olingan token>
ADMIN_CHAT_ID=<Sizning shaxsiy chat ID>
DATABASE_URL=<Render avtomatik o'rnatadi>
```

### Ixtiyoriy (Optional):
```
REPORT_CHAT_ID=<Supergroup chat ID, agar kiritilmasa ADMIN_CHAT_ID ishlatiladi>
BACKEND_API_URL=https://game-club-backend.onrender.com/api
PORT=10000
```

---

## Chat ID ni Qanday Topish

### 1. Shaxsiy Chat ID (ADMIN_CHAT_ID):
1. Botga shaxsiy chatda `/start` buyrug'ini yuboring
2. Bot sizga chat ID ni ko'rsatadi
3. Shu raqamni `ADMIN_CHAT_ID` ga kiriting

### 2. Supergroup Chat ID (REPORT_CHAT_ID):

#### Yangi Supergroup uchun:
1. Botni guruhga qo'shing
2. Guruhda `/start` buyrug'ini yuboring
3. Bot chat ID ni ko'rsatadi (masalan: `-1001234567890`)
4. Shu raqamni `REPORT_CHAT_ID` ga kiriting

#### Eski Group Supergroup ga o'tkazilgan bo'lsa:
1. Render loglarida quyidagi xato ko'rinadi:
   ```
   400: Bad Request: group chat was upgraded to a supergroup chat
   ```
2. Botga supergroup da `/start` buyrug'ini yuboring
3. Bot yangi supergroup chat ID ni ko'rsatadi
4. Render.com dashboard da `REPORT_CHAT_ID` ni yangilang

---

## Telegram Webhook ni O'chirish

Agar 409 Conflict xatosi davom etsa:

### Usul 1: BotFather orqali (Tavsiya etiladi)
1. Telegram da `@BotFather` ga o'ting
2. `/deletewebhook` buyrug'ini yuboring
3. Botingizni tanlang
4. Webhook o'chiriladi

### Usul 2: API orqali
```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/deleteWebhook?drop_pending_updates=true"
```

### Usul 3: Kod avtomatik o'chiradi
Kod allaqachon `bot.telegram.deleteWebhook()` ni chaqiradi, lekin agar muammo davom etsa yuqoridagi usullarni sinab ko'ring.

---

## Deploy Qilishdan Oldin Tekshirish

### 1. Local da test qiling:
```bash
cd telegram-bot
npm install
npm run start
```

Xatosiz ishga tushishi va quyidagi loglar chiqishi kerak:
```
HTTP server port 10000 da ishlayapti
Report scheduler ishga tushdi. Har kuni 04:00 (Asia/Tashkent) da hisobot yuboriladi. Chat ID: ...
Backup scheduler ishga tushdi. Har kuni 03:00 (Asia/Tashkent) da backup olinadi. Chat ID: ...
GameClub Telegram bot ishga tushdi.
✅ Webhook o'chirildi, polling rejimida ishlamoqda
✅ Bot commandlari default scope uchun o'rnatildi
✅ Bot commandlari guruhlar uchun o'rnatildi
✅ Bot commandlari shaxsiy chatlar uchun o'rnatildi
```

### 2. Environment variablelarni tekshiring:
- `BOT_TOKEN` to'g'ri formatda (`1234567890:ABCdefGHI...`)
- `ADMIN_CHAT_ID` raqam (manfiy bo'lishi mumkin)
- `REPORT_CHAT_ID` supergroup uchun `-100` bilan boshlanadi

### 3. Git commit va push:
```bash
git add .
git commit -m "Fix: 409 Conflict va supergroup chat ID muammolarini hal qilish"
git push
```

### 4. Render.com da deploy:
- Render avtomatik deploy qiladi (agar Auto-Deploy yoqilgan bo'lsa)
- Yoki manual deploy qiling: Render dashboard → Manual Deploy

---

## Deploy Qilingandan Keyin

### 1. Loglarni kuzating:
```
Render dashboard → Logs
```

Quyidagilarni tekshiring:
- ✅ Bot muvaffaqiyatli ishga tushdi
- ✅ Webhook o'chirildi
- ✅ Scheduler ishga tushdi
- ❌ 409 Conflict xatosi yo'q
- ❌ "group chat was upgraded" xatosi yo'q

### 2. Bot funksiyalarini test qiling:
- `/start` - chat ID ni ko'rsatadi
- `/day` - bugungi hisobot
- `/month` - oylik hisobot
- `/backup` - database backup (faqat admin)
- `/debtors` - qarzdorlar ro'yxati

### 3. Scheduler test qilish:
- Kunlik hisobot: har kuni 04:00 (Asia/Tashkent)
- Kunlik backup: har kuni 03:00 (Asia/Tashkent)

---

## Tez-tez Uchraydigan Muammolar

### Muammo: 409 Conflict
**Sabab:** Boshqa bot instance ishlayotgan yoki webhook aktiv

**Yechim:**
1. Webhook ni o'chiring (yuqoridagi yo'riqnomaga qarang)
2. Render da eski instanceni to'xtatib, yangisini ishga tushiring
3. Kod allaqachon avtomatik webhook ni o'chiradi

### Muammo: Group upgraded to supergroup
**Sabab:** Eski group chat ID ishlamaydi

**Yechim:**
1. Botga supergroup da `/start` yuboring
2. Yangi chat ID ni oling
3. Render da `REPORT_CHAT_ID` ni yangilang

### Muammo: Bot xabar yubormayapti
**Sabab:** Chat ID noto'g'ri yoki bot guruhdan chiqarilgan

**Yechim:**
1. Botning guruhda ekanligini tekshiring
2. Chat ID to'g'ri formatda ekanligini tekshiring
3. Bot admin huquqiga ega ekanligini tekshiring (guruhda xabar yuborish uchun)

---

## Xavfsizlik

- ❌ `.env` faylini git ga commit qilmang (`.gitignore` da bor)
- ❌ `BOT_TOKEN` ni hech qachon kodga hardcode qilmang
- ✅ Barcha secretlarni Render Environment Variables da saqlang
- ✅ `ADMIN_CHAT_ID` ni to'g'ri sozlang, aks holda har kim backup olishi mumkin

---

## Qo'shimcha Yordam

Agar muammo davom etsa:
1. Render loglarini to'liq tekshiring
2. Bot tokenini BotFather da regenerate qiling
3. Webhook holatini tekshiring: `https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo`
