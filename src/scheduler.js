import cron from 'node-cron'
import { getDailyReport, getMonthlyReport } from './api.js'
import { sendBackupToTelegram } from './backup.js'

const money = (value) => `${Number(value || 0).toLocaleString('uz-UZ')} so'm`

export function formatReport(report) {
  if (report.message) {
    return report.message
  }
  return [
    'Kunlik daromad hisoboti',
    `Sana: ${report.date}`,
    '',
    `Naqd pul: ${money(report.cashTotal)}`,
    `Kartada pul: ${money(report.cardTotal)}`,
    `Qarz: ${money(report.debtTotal)}`,
    `Mahsulotlar: ${money(report.productsTotal)}`,
    '',
    `Bugun kiritilgan jami ma'lumotlar soni: ${report.recordsCount} ta`,
    `Bugun daromad kiritgan userlar soni: ${report.usersCount} ta`,
    '',
    `Umumiy summa: ${money(report.totalIncome)}`,
    `Xarajatlar: ${money(report.totalExpense)}`,
    `Sof foyda: ${money(report.netProfit)}`,
  ].join('\n')
}

export function startReportScheduler(bot) {
  // Kunlik hisobot — har kuni 04:00 da guruhga yuboriladi
  const reportChatId = process.env.REPORT_CHAT_ID || process.env.ADMIN_CHAT_ID
  if (!reportChatId) {
    console.warn('REPORT_CHAT_ID kiritilmagan. Scheduler xabar yubormaydi.')
    return
  }

  console.log(`Report scheduler ishga tushdi. Har kuni 04:00 (Asia/Tashkent) da hisobot yuboriladi. Chat ID: ${reportChatId}`)

  // 04:00 da kunlik hisobot
  cron.schedule(
    '0 4 * * *',
    async () => {
      console.log(`[${new Date().toISOString()}] Report scheduler ishga tushdi...`)
      try {
        const report = await getDailyReport()
        await bot.telegram.sendMessage(reportChatId, formatReport(report), { parse_mode: 'HTML' })
        console.log(`Kunlik hisobot guruhga yuborildi: ${reportChatId}`)
      } catch (error) {
        console.error('Hisobot yuborishda xatolik:', error.message)

        // Group supergroup ga o'tkazilgan bo'lsa, yangi chat ID haqida xabar berish
        if (error.message.includes('group chat was upgraded to a supergroup')) {
          console.error('━'.repeat(60))
          console.error('❌ XATOLIK: Group supergroup ga o\'tkazilgan!')
          console.error('')
          console.error('Yangi supergroup chat ID ni topish uchun:')
          console.error('1. Bot /start buyrug\'ini yangi supergroup da yuboring')
          console.error('2. Botdan qaytgan yangi chat ID ni nusxalang')
          console.error('3. Render.com Environment Variables da REPORT_CHAT_ID ni yangilang')
          console.error('')
          console.error(`Hozirgi (eski) chat ID: ${reportChatId}`)
          console.error('━'.repeat(60))
        }

        console.error('Hisobot xatolik stack:', error.stack)
      }
    },
    { timezone: 'Asia/Tashkent' }
  )
}

export function startBackupScheduler(bot) {
  const chatId = process.env.ADMIN_CHAT_ID
  if (!chatId) {
    console.warn('ADMIN_CHAT_ID o\'rnatilmagan. Backup scheduler ishlamaydi.')
    return
  }

  console.log(`Backup scheduler ishga tushdi. Har kuni 03:00 (Asia/Tashkent) da backup olinadi. Chat ID: ${chatId}`)

  // Har kuni 03:00 da (Asia/Tashkent) avtomatik backup olish
  cron.schedule(
    '0 3 * * *',
    async () => {
      console.log(`[${new Date().toISOString()}] Backup scheduler ishga tushdi...`)
      try {
        const { filename, sizeMB } = await sendBackupToTelegram(bot, chatId)
        console.log(`Kunlik backup muvaffaqiyatli: ${filename} (${sizeMB} MB)`)
      } catch (error) {
        console.error('Kunlik backup xatoligi:', error.message)
        console.error('Backup xatolik stack:', error.stack)
        await bot.telegram
          .sendMessage(chatId, `❌ Kunlik backup xatoligi:\n${error.message}`)
          .catch((sendErr) => console.error('Xabar yuborishda xatolik:', sendErr.message))
      }
    },
    { timezone: 'Asia/Tashkent' },
  )
}

const UZ_MONTHS = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
]

export function startMonthlyReportScheduler(bot) {
  const reportChatId = process.env.REPORT_CHAT_ID || process.env.ADMIN_CHAT_ID
  if (!reportChatId) {
    console.warn('REPORT_CHAT_ID kiritilmagan. Oylik hisobot scheduler xabar yubormaydi.')
    return
  }

  console.log(`Oylik hisobot scheduler ishga tushdi. Har oyning 1-sanasi 04:00 (Asia/Tashkent) da o'tgan oylik hisobot yuboriladi. Chat ID: ${reportChatId}`)

  // Har oyning 1-sanasi 04:00 da o'tgan oyning hisobotini yuborish
  cron.schedule(
    '0 4 1 * *',
    async () => {
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tashkent' }))
      // O'tgan oy: hozirgi oydan 1 oy oldin
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const monthStr = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`
      const monthName = `${UZ_MONTHS[prevMonth.getMonth()]} ${prevMonth.getFullYear()}`
      console.log(`[${new Date().toISOString()}] Oylik hisobot scheduler: ${monthName} uchun hisobot yuborilmoqda...`)

      try {
        const report = await getMonthlyReport(monthStr)
        const text = report.message
          ? report.message.replace(/Oylik hisobot/, `${monthName} — Oylik hisobot`)
          : `<b>${monthName} — Oylik hisobot</b>\n\nMa'lumot topilmadi.`
        await bot.telegram.sendMessage(reportChatId, text, { parse_mode: 'HTML' })
        console.log(`Oylik hisobot guruhga yuborildi: ${reportChatId} (${monthName})`)
      } catch (error) {
        console.error(`Oylik hisobot yuborishda xatolik (${monthName}):`, error.message)
        await bot.telegram
          .sendMessage(reportChatId, `❌ Oylik hisobot xatoligi (${monthName}):\n${error.message}`)
          .catch(() => {})
      }
    },
    { timezone: 'Asia/Tashkent' }
  )
}
