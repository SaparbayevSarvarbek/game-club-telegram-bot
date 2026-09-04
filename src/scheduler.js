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
  const chatId = process.env.ADMIN_CHAT_ID
  const reportTime = process.env.REPORT_TIME || '22:00'
  const [hour, minute] = reportTime.split(':')

  if (!chatId) {
    console.warn('ADMIN_CHAT_ID kiritilmagan. Scheduler xabar yubormaydi.')
    return
  }

  cron.schedule(
    `${Number(minute)} ${Number(hour)} * * *`,
    async () => {
      try {
        const report = await getDailyReport()
        await bot.telegram.sendMessage(chatId, formatReport(report), { parse_mode: 'HTML' })
      } catch (error) {
        console.error('Hisobot yuborishda xatolik:', error.message)
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

  // Har kuni 03:00 da (Asia/Tashkent) avtomatik backup olish
  cron.schedule(
    '0 3 * * *',
    async () => {
      try {
        const { filename, sizeMB } = await sendBackupToTelegram(bot, chatId)
        console.log(`Kunlik backup muvaffaqiyatli: ${filename} (${sizeMB} MB)`)
      } catch (error) {
        console.error('Kunlik backup xatoligi:', error.message)
        await bot.telegram
          .sendMessage(chatId, `❌ Kunlik backup xatoligi:\n${error.message}`)
          .catch(() => {})
      }
    },
    { timezone: 'Asia/Tashkent' },
  )
}
