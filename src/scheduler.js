import cron from 'node-cron'
import { getDailyReport } from './api.js'
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
