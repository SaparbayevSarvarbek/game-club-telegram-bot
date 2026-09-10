# Telegram Bot Commands Setup

## Avtomatik usul (kod orqali)

Bot ishga tushganda `setMyCommands` API orqali commandlar avtomatik o'rnatiladi.

Deploy qilgandan keyin bot loglarida ko'rasiz:
```
✅ Bot commandlari default scope uchun o'rnatildi
✅ Bot commandlari guruhlar uchun o'rnatildi
✅ Bot commandlari shaxsiy chatlar uchun o'rnatildi
```

## Manual usul (BotFather orqali)

Agar avtomatik usul ishlamasa yoki commandlarni qo'lda sozlamoqchi bo'lsangiz:

### 1️⃣ BotFather chatini oching
Telegram'da `@BotFather` ni toping

### 2️⃣ `/mybots` buyrug'ini yuboring

### 3️⃣ O'z botingizni tanlang
Ro'yxatdan `@YourBotUsername` ni bosing

### 4️⃣ **Edit Bot** → **Edit Commands** ni tanlang

### 5️⃣ Quyidagi matnni ko'chirib yuboring:

```
start - Botni ishga tushirish
day - Bugungi hisobot
month - Oylik hisobot
year - Yillik hisobot
debtors - Qarzdorlar ro'yxati
backup - Database backup olish
```

### 6️⃣ Botni restart qiling

Telegram chatda botni `/start` bilan qayta ishga tushiring yoki botdan chiqqan bo'lsangiz, qaytadan kiring.

---

## Tekshirish

1. Telegram chatda `/` belgisini bosing
2. Botning commandlari ro'yxat ko'rinishida chiqishi kerak:
   - 📋 start — Botni ishga tushirish
   - 📊 day — Bugungi hisobot
   - 📊 month — Oylik hisobot
   - 📊 year — Yillik hisobot
   - 👥 debtors — Qarzdorlar ro'yxati
   - 🗄️ backup — Database backup olish

---

## Muammolarni bartaraf qilish

### Commandlar ko'rinmayapti?

1. **Botni restart qiling** — Telegram'dan chiqib, qaytadan kiring
2. **Telegram keshini tozalang** — Telegram'ni to'liq yopib, qayta oching
3. **Bot loglarini tekshiring** — Deploy platformada (Render) loglarni oching va `setMyCommands` xatolarini qidiring
4. **Manual usul bilan sozlang** — BotFather orqali qo'lda commandlarni kiriting

### Faqat ba'zi commandlar ko'rinadi?

BotFather orqali commandlarni yangilang — eski commandlar o'chirilmagan bo'lishi mumkin.

### Guruhlarda ko'rinmaydi?

Bot guruhlarda admin bo'lishi kerak. Yoki botni guruhdan chiqarib, qaytadan qo'shing.
