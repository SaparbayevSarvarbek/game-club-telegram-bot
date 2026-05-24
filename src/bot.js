import 'dotenv/config'
import { Telegraf } from 'telegraf'
import { getDailyReport, getMonthlyReport, getYearlyReport } from './api.js'
import { formatReport, startReportScheduler } from './scheduler.js'

const token = process.env.BOT_TOKEN

if (!token) {
  throw new Error('BOT_TOKEN .env faylda kiritilishi kerak')
}

const bot = new Telegraf(token)

bot.start((ctx) =>
  ctx.reply(
    [
      'GameClub bot ishga tushdi.',
      '',
      '/day - bugungi hisobot',
      '/moth yoki /month - oylik hisobot',
      '/yil yoki /year - yillik hisobot',
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

startReportScheduler(bot)
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
