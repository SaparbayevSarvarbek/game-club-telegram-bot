import 'dotenv/config'
import express from 'express'
import { Telegraf } from 'telegraf'
import { getDailyReport, getMonthlyReport, getYearlyReport, getDebtors } from './api.js'
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

bot.start((ctx) => {
  const chatId = ctx.chat.id
  const firstName = ctx.from?.first_name || ''
  ctx.reply(
    [
      `🎮 Salom, ${firstName}!`,
      '',
      `👤 Sizning chat ID: ${chatId}`,
      '',
      '📊 Hisobotlar:',
      '/day - bugungi hisobot',
      '/moth yoki /month - oylik hisobot',
      '/yil yoki /year - yillik hisobot',
      '',
      '👥 Qarzdorlar:',
      '/debtors yoki /qarzdor - qarzdorlar ro\'yxati',
      '',
      '🗄️ Backup:',
      '/backup - database backup olish',
    ].join('\n')
  )
})

const replyWithReport = async (ctx, loader) => {
  try {
    const chatId = ctx.chat.id
    const statusMsg = await ctx.reply('⏳ Hisobot yuklanmoqda...')

    // Har 4 sekundda "typing" action jo'natish
    const actionInterval = setInterval(() => {
      bot.telegram.sendChatAction(chatId, 'typing').catch(() => {})
    }, 4000)
    bot.telegram.sendChatAction(chatId, 'typing').catch(() => {})

    const report = await loader()

    clearInterval(actionInterval)

    // Xabarni yangilash — hisobot mazmuniga
    await bot.telegram.editMessageText(
      chatId,
      statusMsg.message_id,
      undefined,
      formatReport(report),
      { parse_mode: 'HTML' }
    )
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

  // Chat ID tekshirish — faqat shaxsiy chatda va faqat admin ga ruxsat
  if (adminChatId && String(chatId) !== String(adminChatId)) {
    // Agar bu guruh bo'lsa — oddiy xabar
    if (ctx.chat.type !== 'private') {
      return ctx.reply('⛔ Sizda admin ruxsati yo\'q.')
    }
    // Shaxsiy chatda — chat ID ko'rsatish (admin sozlash uchun)
    console.log(`Backup rad etildi: chatId=${chatId}, adminChatId=${adminChatId}`)
    return ctx.reply(
      `⛔ Sizda admin ruxsati yo'q.\n\n` +
      `Sizning chat ID: <code>${chatId}</code>\n` +
      `Admin chat ID: <code>${adminChatId}</code>\n\n` +
      `Agar bu sizning chat ID bo'lsa, .env faylda ADMIN_CHAT_ID ni o'zgartiring.`,
      { parse_mode: 'HTML' }
    )
  }

  try {
    // Loading animatsiya — backup yuklanayotganda "typing" ko'rsatadi
    const statusMsg = await ctx.reply('⏳ Database backup olinmoqda...')

    // Har 4 sekundda "upload_document" action jo'natish (Telegram 5 sekundda o'chiradi)
    const actionInterval = setInterval(() => {
      bot.telegram.sendChatAction(chatId, 'upload_document').catch(() => {})
    }, 4000)
    // Darhol birinchi action ni jo'natish
    bot.telegram.sendChatAction(chatId, 'upload_document').catch(() => {})

    const { filename, sizeMB } = await sendBackupToTelegram(bot, chatId)

    clearInterval(actionInterval)

    // Xabarni yangilash — "yuklanmoqda" dan "tayyor" ga
    await bot.telegram.editMessageText(
      chatId,
      statusMsg.message_id,
      undefined,
      `✅ Backup muvaffaqiyatli yuborildi!\n📄 Fayl: ${filename}\n📦 Hajm: ${sizeMB} MB`
    )
  } catch (error) {
    console.error('Backup xatoligi:', error.message)
    await ctx.reply(`❌ Backup olishda xatolik:\n${error.message}`)
  }
})

// /debtors — qarzdorlar ro'yxati (chiroyli jadval ko'rinishida)
const formatDebtors = (data) => {
  if (!data.debtors || data.debtors.length === 0) {
    return '📋 Qarzdorlar yo\'q\n\nHozircha hech qanday qarzdor mavjud emas.'
  }

  const lines = ['📋 QARZDORLAR RO\'YXATI', '━'.repeat(20), '']

  data.debtors.forEach((d, i) => {
    const name = d.last_name ? `${d.first_name} ${d.last_name}` : d.first_name
    const phone = d.phone ? `+${d.phone}` : 'raqam yo\'q'
    const debt = new Intl.NumberFormat('uz-UZ').format(d.total_debt)
    const date = d.created_at || '—'

    lines.push(`${i + 1}. ${name}`)
    lines.push(`   📱 ${phone}`)
    lines.push(`   💰 ${debt} so'm`)
    lines.push(`   📅 ${date}`)
    if (d.note) lines.push(`   📝 ${d.note}`)
    lines.push('')
  })

  const totalDebt = data.debtors.reduce((sum, d) => sum + d.total_debt, 0)
  const totalFormatted = new Intl.NumberFormat('uz-UZ').format(totalDebt)
  lines.push('━'.repeat(20))
  lines.push(`📊 Jami: ${data.count} ta qarzdor`)
  lines.push(`💰 Umumiy qarz: ${totalFormatted} so'm`)

  return lines.join('\n')
}

bot.command(['debtors', 'qarzdor'], async (ctx) => {
  const chatId = ctx.chat.id
  try {
    const statusMsg = await ctx.reply('⏳ Qarzdorlar ro\'yxati yuklanmoqda...')

    const actionInterval = setInterval(() => {
      bot.telegram.sendChatAction(chatId, 'typing').catch(() => {})
    }, 4000)
    bot.telegram.sendChatAction(chatId, 'typing').catch(() => {})

    const data = await getDebtors()

    clearInterval(actionInterval)

    const message = formatDebtors(data)
    await bot.telegram.editMessageText(
      chatId,
      statusMsg.message_id,
      undefined,
      `\`\`\`\n${message}\n\`\`\``,
      { parse_mode: 'Markdown' }
    )
  } catch (error) {
    console.error('Debtors xatoligi:', error.message)
    await ctx.reply(`❌ Qarzdorlar ro'yxatini olishda xatolik:\n${error.message}`)
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
