import 'dotenv/config'
import express from 'express'
import { Telegraf } from 'telegraf'
import { getDailyReport, getMonthlyReport, getYearlyReport } from './api.js'
import { formatReport, startReportScheduler, startBackupScheduler } from './scheduler.js'
import { sendBackupToTelegram } from './backup.js'

// ---------------------------------------------------------------------------
// HTTP server — Render Web Service port ochilishini talab qiladi
// ---------------------------------------------------------------------------
const app = express()
const PORT = process.env.PORT || 3000

app.get('/', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'gameclub-telegram-bot' })
})

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP server port ${PORT} da ishlayapti`)
})

// ---------------------------------------------------------------------------
// Telegram Bot
// ---------------------------------------------------------------------------
const token = process.env.BOT_TOKEN

if (!token) {
  throw new Error('BOT_TOKEN .env faylda kiritilishi kerak')
}

const bot = new Telegraf(token)

bot.start((ctx) =>
  ctx.reply(
    [
      '🎮 GameClub bot ishga tushdi.',
      '',
      '📊 Hisobotlar:',
      '/day - bugungi hisobot',
      '/moth yoki /month - oylik hisobot',
      '/yil yoki /year - yillik hisobot',
      '',
      '🗄️ Backup:',
      '/backup - database backup olish',
    ].join('\n')
  )
)

const replyWithReport = async (ctx, loader) => {
  try {
    const report = await loader()
    await ctx.reply(formatReport(report), { parse_mode: 'HTML' })
  } catch (error) {
    await ctx.reply(`Hisobot olishda xatolik: ${error.message}`)
  }
}

bot.command(['report', 'day'], (ctx) => replyWithReport(ctx, getDailyReport))
bot.command(['moth', 'month', 'oy'], (ctx) => replyWithReport(ctx, getMonthlyReport))
bot.command(['yil', 'year'], (ctx) => replyWithReport(ctx, getYearlyReport))

// /backup — admin foydalanuvchi uchun database backup
bot.command('backup', async (ctx) => {
  const chatId = ctx.chat.id
  const adminChatId = process.env.ADMIN_CHAT_ID

  if (String(chatId) !== String(adminChatId)) {
    return ctx.reply('⛔ Sizda admin ruxsati yo\'q.')
  }

  try {
    await ctx.reply('⏳ Database backup olinmoqda...')
    const { filename, sizeMB } = await sendBackupToTelegram(bot, chatId)
    await ctx.reply(`✅ Backup muvaffaqiyatli yuborildi!\n📄 Fayl: ${filename}\n📦 Hajm: ${sizeMB} MB`)
  } catch (error) {
    console.error('Backup xatoligi:', error.message)
    await ctx.reply(`❌ Backup olishda xatolik:\n${error.message}`)
  }
})

startReportScheduler(bot)
startBackupScheduler(bot)
bot
  .launch()
  .then(() => {
    console.log('GameClub Telegram bot ishga tushdi.')
  })
  .catch((error) => {
    const message = error?.message || String(error)
    console.error('Telegram bot ishga tushmadi:', message)
    if (message.includes('ENOTFOUND') || message.includes('api.telegram.org')) {
      console.error('api.telegram.org ochilmayapti. Internet, DNS, VPN/proxy yoki firewall sozlamalarini tekshiring.')
    }
    process.exit(1)
  })

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
