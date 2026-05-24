import axios from 'axios'

const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:8000/api'
const BOT_API_KEY = process.env.BOT_API_KEY || 'change-bot-secret'

export async function getDailyReport() {
  const response = await axios.get(`${BACKEND_API_URL}/bot/daily-report`, {
    headers: { 'x-bot-api-key': BOT_API_KEY },
  })
  return response.data
}

export async function getMonthlyReport(month) {
  const response = await axios.get(`${BACKEND_API_URL}/bot/monthly-report`, {
    params: month ? { month } : {},
    headers: { 'x-bot-api-key': BOT_API_KEY },
  })
  return response.data
}

export async function getYearlyReport(year) {
  const response = await axios.get(`${BACKEND_API_URL}/bot/yearly-report`, {
    params: year ? { year } : {},
    headers: { 'x-bot-api-key': BOT_API_KEY },
  })
  return response.data
}
