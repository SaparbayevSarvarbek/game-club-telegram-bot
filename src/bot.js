import 'dotenv/config'
import express from 'express'
import { Telegraf } from 'telegraf'
import { getDailyReport, getMonthlyReport, getYearlyReport, getDebtors, getDailyReportByDate } from './api.js'
import { formatReport, startReportScheduler, startBackupScheduler, startMonthlyReportScheduler } from './scheduler.js'
import { sendBackupToTelegram } from './backup.js'

// ---------------------------------------------------------------------------
// HTTP server — Render Web Service port ochilishini talab qiladi
// ---------------------------------------------------------------------------
const app = express()
const PORT = process.env.PORT || 3000

app.get('/', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'gameclub-telegram-bot' })
})

// Cron/monitoring vositalari (masalan cron-job.org) "output too large" xatosini
// bermasligi uchun javob har doim kichik va barqaror bo'lishi kerak.
// `uptime` ni yaxlitlab, o'zgaruvchan uzun kasr qiymatdan qutulamiz — javob taxminan 30 byte.
app.get(['/health', '/health/'], (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: Math.round(process.uptime()) })
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
      '📊 Buyruqlar:',
      '/day yoki /kun — bugungi hisobot',
      '/kun 06.08.2026 — muayyan sana hisoboti',
      '/06.08.2026 — sana bo\'yicha tezkor hisobot',
      '/month yoki /oy — joriy oylik hisobot',
      '/oy 08.2026 — muayyan oy hisoboti',
      '/year yoki /yil — joriy yillik hisobot',
      '/yil 2026 — muayyan yil hisoboti',
      '/debtors — qarzdorlar ro\'yxati',
      '/backup — database backup',
    ].join('\n')
  )
})

const replyWithReport = async (ctx, loader) => {
  const chatId = ctx.chat.id
  let actionInterval = null
  try {
    const statusMsg = await ctx.reply('⏳ Hisobot yuklanmoqda...')

    // Har 4 sekundda "typing" action jo'natish
    actionInterval = setInterval(() => {
      bot.telegram.sendChatAction(chatId, 'typing').catch(() => {})
    }, 4000)
    bot.telegram.sendChatAction(chatId, 'typing').catch(() => {})

    const report = await loader()

    // Xabarni yangilash — hisobot mazmuniga
    await bot.telegram.editMessageText(
      chatId,
      statusMsg.message_id,
      undefined,
      formatReport(report),
      { parse_mode: 'HTML' }
    )
  } catch (error) {
    console.error('replyWithReport xatoligi:', error.message)
    await ctx.reply(`❌ Hisobot olishda xatolik:\n${error.message}`).catch(() => {})
  } finally {
    // Intervalni har doim tozalash — xato bo'lsa ham, muvaffaqiyatli bo'lsa ham
    if (actionInterval) clearInterval(actionInterval)
  }
}

// Matndan sana (YYYY-MM-DD) ajratib olish
function parseDateText(text) {
  if (!text) return null
  const cleaned = text.trim().replace(/@\w+/g, '').trim()
  const withoutCmd = cleaned.replace(/^\/(day|kun|report|sana)\s*/i, '').replace(/^\//, '').trim()

  // 1) DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY
  const dmy = withoutCmd.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (dmy) {
    const day = dmy[1].padStart(2, '0')
    const month = dmy[2].padStart(2, '0')
    const year = dmy[3]
    return `${year}-${month}-${day}`
  }

  // 2) YYYY-MM-DD, YYYY.MM.DD, YYYY/MM/DD
  const ymd = withoutCmd.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/)
  if (ymd) {
    const year = ymd[1]
    const month = ymd[2].padStart(2, '0')
    const day = ymd[3].padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  return null
}

// Matndan oy (YYYY-MM) ajratib olish
function parseMonthText(text) {
  if (!text) return null
  const cleaned = text.trim().replace(/@\w+/g, '').trim()
  const withoutCmd = cleaned.replace(/^\/(month|moth|oy)\s*/i, '').replace(/^\//, '').trim()

  // MM.YYYY, MM/YYYY, MM-YYYY
  const my = withoutCmd.match(/^(\d{1,2})[./-](\d{4})$/)
  if (my) {
    const month = my[1].padStart(2, '0')
    const year = my[2]
    return `${year}-${month}`
  }

  // YYYY-MM, YYYY.MM
  const ym = withoutCmd.match(/^(\d{4})[./-](\d{1,2})$/)
  if (ym) {
    const year = ym[1]
    const month = ym[2].padStart(2, '0')
    return `${year}-${month}`
  }

  return null
}

// Matndan yil (YYYY) ajratib olish
function parseYearText(text) {
  if (!text) return null
  const cleaned = text.trim().replace(/@\w+/g, '').trim()
  const withoutCmd = cleaned.replace(/^\/(year|yil)\s*/i, '').replace(/^\//, '').trim()

  const y = withoutCmd.match(/^(\d{4})$/)
  if (y) {
    const year = parseInt(y[1], 10)
    if (year >= 2000 && year <= 2100) {
      return year
    }
  }
  return null
}

// /day, /kun, /report [sana]
bot.command(['report', 'day', 'kun', 'sana'], (ctx) => {
  const text = ctx.message?.text || ''
  const dateStr = parseDateText(text)
  if (dateStr) {
    return replyWithReport(ctx, () => getDailyReport(dateStr))
  }
  return replyWithReport(ctx, () => getDailyReport())
})

// /month, /oy [oy]
bot.command(['moth', 'month', 'oy'], (ctx) => {
  const text = ctx.message?.text || ''
  const monthStr = parseMonthText(text)
  if (monthStr) {
    return replyWithReport(ctx, () => getMonthlyReport(monthStr))
  }
  return replyWithReport(ctx, () => getMonthlyReport())
})

// /year, /yil [yil]
bot.command(['yil', 'year'], (ctx) => {
  const text = ctx.message?.text || ''
  const yearNum = parseYearText(text)
  if (yearNum) {
    return replyWithReport(ctx, () => getYearlyReport(yearNum))
  }
  return replyWithReport(ctx, () => getYearlyReport())
})

// To'g'ridan-to'g'ri sana kiritilganda (masalan /06.08.2026 yoki 06.08.2026 yoki /2026-08-06)
bot.hears(/^(\/)?(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})(@\w+)?$/, async (ctx) => {
  const text = ctx.message?.text || ''
  const dateStr = parseDateText(text)
  if (dateStr) {
    return replyWithReport(ctx, () => getDailyReport(dateStr))
  }
  return ctx.reply('❌ Sana noto\'g\'ri. Namuna: /06.08.2026 yoki 06.08.2026')
})

// To'g'ridan-to'g'ri oy kiritilganda (masalan /08.2026 yoki 08.2026 yoki /2026-08)
bot.hears(/^(\/)?(\d{1,2}[./-]\d{4}|\d{4}[./-]\d{1,2})(@\w+)?$/, async (ctx) => {
  const text = ctx.message?.text || ''
  const monthStr = parseMonthText(text)
  if (monthStr) {
    return replyWithReport(ctx, () => getMonthlyReport(monthStr))
  }
})

// To'g'ridan-to'g'ri 4 xonali yil kiritilganda (masalan /2026)
bot.hears(/^\/(\d{4})(@\w+)?$/, async (ctx) => {
  const text = ctx.message?.text || ''
  const yearNum = parseYearText(text)
  if (yearNum) {
    return replyWithReport(ctx, () => getYearlyReport(yearNum))
  }
})

// /backup — admin foydalanuvchi uchun database backup
bot.command('backup', async (ctx) => {
  const chatId = ctx.chat.id
  const adminChatId = process.env.ADMIN_CHAT_ID
  let actionInterval = null

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
    actionInterval = setInterval(() => {
      bot.telegram.sendChatAction(chatId, 'upload_document').catch(() => {})
    }, 4000)
    // Darhol birinchi action ni jo'natish
    bot.telegram.sendChatAction(chatId, 'upload_document').catch(() => {})

    const { filename, sizeMB } = await sendBackupToTelegram(bot, chatId)

    // Xabarni yangilash — "yuklanmoqda" dan "tayyor" ga
    await bot.telegram.editMessageText(
      chatId,
      statusMsg.message_id,
      undefined,
      `✅ Backup muvaffaqiyatli yuborildi!\n📄 Fayl: ${filename}\n📦 Hajm: ${sizeMB} MB`
    )
  } catch (error) {
    console.error('Backup xatoligi:', error.message)
    console.error('Backup xatolik stack:', error.stack)
    await ctx.reply(`❌ Backup olishda xatolik:\n${error.message}`).catch(() => {})
  } finally {
    // Intervalni har doim tozalash
    if (actionInterval) clearInterval(actionInterval)
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
  let actionInterval = null
  try {
    const statusMsg = await ctx.reply('⏳ Qarzdorlar ro\'yxati yuklanmoqda...')

    actionInterval = setInterval(() => {
      bot.telegram.sendChatAction(chatId, 'typing').catch(() => {})
    }, 4000)
    bot.telegram.sendChatAction(chatId, 'typing').catch(() => {})

    const data = await getDebtors()

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
    console.error('Debtors xatolik stack:', error.stack)
    await ctx.reply(`❌ Qarzdorlar ro'yxatini olishda xatolik:\n${error.message}`).catch(() => {})
  } finally {
    // Intervalni har doim tozalash
    if (actionInterval) clearInterval(actionInterval)
  }
})

startReportScheduler(bot)
startBackupScheduler(bot)
startMonthlyReportScheduler(bot)

// Webhook ni o'chirish va polling rejimida ishga tushirish
bot
  .launch({
    dropPendingUpdates: true,
    allowedUpdates: ['message', 'callback_query']
  })
  .then(async () => {
    console.log('GameClub Telegram bot ishga tushdi.')
    console.log('Bot token:', token ? `${token.substring(0, 10)}...` : 'yo\'q')
    console.log('ADMIN_CHAT_ID:', process.env.ADMIN_CHAT_ID || 'yo\'q')
    console.log('REPORT_CHAT_ID:', process.env.REPORT_CHAT_ID || 'yo\'q')
    console.log('BACKEND_API_URL:', process.env.BACKEND_API_URL || 'localhost:8000/api')

    // Webhook o'chirilganini tasdiqlash
    try {
      await bot.telegram.deleteWebhook({ drop_pending_updates: true })
      console.log('✅ Webhook o\'chirildi, polling rejimida ishlamoqda')
    } catch (error) {
      console.warn('⚠️ Webhook o\'chirishda xatolik:', error.message)
    }

    // Bot commandlarini ro'yxatga olish — "/" bosilganda ko'rinadi
    try {
      const commands = [
        { command: 'start', description: 'Botni ishga tushirish' },
        { command: 'day', description: 'Bugungi hisobot' },
        { command: 'month', description: 'Oylik hisobot' },
        { command: 'year', description: 'Yillik hisobot' },
        { command: 'debtors', description: 'Qarzdorlar ro\'yxati' },
        { command: 'backup', description: 'Database backup olish' },
      ]

      // Barcha scopelar uchun commandlarni o'rnatish
      await bot.telegram.setMyCommands(commands)
      console.log('✅ Bot commandlari default scope uchun o\'rnatildi')

      // Guruhlar uchun ham
      await bot.telegram.setMyCommands(commands, { scope: { type: 'all_group_chats' } })
      console.log('✅ Bot commandlari guruhlar uchun o\'rnatildi')

      // Shaxsiy chatlar uchun ham
      await bot.telegram.setMyCommands(commands, { scope: { type: 'all_private_chats' } })
      console.log('✅ Bot commandlari shaxsiy chatlar uchun o\'rnatildi')
    } catch (error) {
      console.error('⚠️ Bot commandlarini o\'rnatishda xatolik:', error.message)
    }
  })
  .catch((error) => {
    const message = error?.message || String(error)
    console.error('Telegram bot ishga tushmadi:', message)
    if (message.includes('ENOTFOUND') || message.includes('api.telegram.org')) {
      console.error('api.telegram.org ochilmayapti. Internet, DNS, VPN/proxy yoki firewall sozlamalarini tekshiring.')
    }
    if (message.includes('409') || message.includes('Conflict')) {
      console.error('409 Conflict: Boshqa bot instance ishlayotgan yoki webhook aktiv. Webhook ni o\'chirish uchun BotFather da /deletewebhook buyrug\'ini yuboring yoki await bot.telegram.deleteWebhook() ni chaqiring.')
    }
    process.exit(1)
  })

// Graceful shutdown — SIGTERM/SIGINT signallarida botni to'g'ri to'xtatish
const shutdown = async (signal) => {
  console.log(`${signal} signali qabul qilindi, bot to'xtatilmoqda...`)
  try {
    await bot.stop(signal)
    console.log('Bot muvaffaqiyatli to\'xtatildi')
    process.exit(0)
  } catch (error) {
    console.error('Bot to\'xtatishda xatolik:', error.message)
    process.exit(1)
  }
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
