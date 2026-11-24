// Acesso ao Supabase pelas funções do site (chave de servidor, nunca vai para o navegador).
import { createClient } from '@supabase/supabase-js'

const URL_DB = process.env.SUPABASE_URL || ''
const KEY_DB = process.env.SUPABASE_SERVICE_KEY || ''
export const configurado = () => !!(URL_DB && KEY_DB)
export const db = () => createClient(URL_DB, KEY_DB, { auth: { persistSession: false } })
