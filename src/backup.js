import { execFile } from 'node:child_process'
import { readFile, unlink, readdir, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const BACKUP_DIR = '/tmp/gameclub_backups'

/**
 * PostgreSQL database backup yaratadi (pg_dump orqali).
 * @returns {{ filepath: string, filename: string, size: number }}
 */
export async function createBackup() {
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    throw new Error('DATABASE_URL o\'rnatilmagan. .env faylda DATABASE_URL ni kiriting.')
  }

  await mkdir(BACKUP_DIR, { recursive: true })

  const today = new Date().toISOString().split('T')[0]
  const filename = `gameclub_backup_${today}.sql`
  const filepath = join(BACKUP_DIR, filename)

  const url = new URL(dbUrl)
  const env = {
    ...process.env,
    PGPASSWORD: url.password,
  }

  try {
    await execFileAsync(
      'pg_dump',
      [
        '-h', url.hostname,
        '-p', url.port || '5432',
        '-U', url.username,
        '-d', url.pathname.replace(/^\//, ''),
        '-f', filepath,
        '--no-owner',
        '--no-acl',
        '--verbose',
      ],
      { env, timeout: 120_000 },
    )
  } catch (err) {
    // pg_dump xatoliklarini tushunarli qilish
    const stderr = err.stderr || ''
    if (err.code === 'ENOENT') {
      throw new Error(
        'pg_dump topilmadi. PostgreSQL client o\'rnatilishi kerak.\n' +
        'Ubuntu/Debian: sudo apt-get install postgresql-client\n' +
        'macOS: brew install postgresql',
      )
    }
    throw new Error(`pg_dump xatoligi: ${err.message}\n${stderr}`)
  }

  const stat = await readFile(filepath)
  return { filepath, filename, size: stat.length }
}

/**
 * Eski backup fayllarni tozaladi — faqat bugungi backup saqlanadi.
 */
export async function cleanupOldBackups() {
  try {
    const files = await readdir(BACKUP_DIR)
    const today = new Date().toISOString().split('T')[0]

    for (const file of files) {
      if (file.startsWith('gameclub_backup_') && !file.includes(today)) {
        await unlink(join(BACKUP_DIR, file)).catch(() => {})
      }
    }
  } catch {
    // papka yo'q bo'lsa — xatolik emas
  }
}

/**
 * Database backup yaratadi va Telegram orqali fayl sifatida yuboradi.
 * @param {import('telegraf').Telegraf} bot — Telegraf bot instance
 * @param {string|number} chatId — yuboriladigan chat ID
 * @returns {{ filename: string, sizeMB: string }}
 */
export async function sendBackupToTelegram(bot, chatId) {
  const { filepath, filename, size } = await createBackup()
  const sizeMB = (size / 1024 / 1024).toFixed(2)

  const dateStr = new Date().toLocaleDateString('uz-UZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Tashkent',
  })

  const caption = [
    '✅ <b>Database backup tayyor</b>',
    '',
    `📅 Sana: <b>${dateStr}</b>`,
    `📦 Hajmi: <b>${sizeMB} MB</b>`,
    `🗄️ Database: <b>gameclub</b>`,
    '',
    '_Eski backup avtomatik o\'chirildi._',
  ].join('\n')

  await bot.telegram.sendDocument(
    chatId,
    { source: filepath, filename },
    { caption, parse_mode: 'HTML' },
  )

  // Backup yuborilgandan keyin faylni tozalash
  await unlink(filepath).catch(() => {})
  // Eski backuplarni ham tozalash
  await cleanupOldBackups()

  return { filename, sizeMB }
}
