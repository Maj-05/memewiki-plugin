/**
 * 梗百科核心服务
 *
 * 词库：data/memes.db（SQLite，只读）
 * 数据来源 cnmeme.wiki 公开词条，词库移植自 dsh-memewiki（作者 thawline，MIT）
 *
 * 依赖只有 Node 自带的 node:sqlite（Node 22.5+），不需要 npm install
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN_ROOT = path.resolve(__dirname, '..')
const DB_FILE = path.join(PLUGIN_ROOT, 'data', 'memes.db')

const MAX_USAGE_LEN = 700
const MAX_SUMMARY_LEN = 500
const MAX_TAGS_LEN = 120

let DatabaseSync = null
let db = null
let loadTried = false
let logger = console

/** 注入日志器（云崽的 logger），不注入就用 console */
export function setLogger(l) {
    if (l) logger = l
}

async function getDb() {
    if (loadTried) return db
    loadTried = true
    try {
        if (!fs.existsSync(DB_FILE)) {
            logger.warn?.(`[梗百科] 词库不存在: ${DB_FILE}`)
            return null
        }
        if (!DatabaseSync) {
            ;({ DatabaseSync } = await import('node:sqlite'))
        }
        db = new DatabaseSync(DB_FILE, { readOnly: true })
        logger.debug?.(`[梗百科] 词库已加载: ${DB_FILE}`)
    } catch (e) {
        logger.warn?.(`[梗百科] 打开词库失败: ${e.message}`)
        db = null
    }
    return db
}

function truncate(s, n) {
    const t = String(s == null ? '' : s)
        .replace(/\s+/g, ' ')
        .trim()
    return t.length > n ? t.slice(0, n) + '…' : t
}

/**
 * 查词库。命中返回词条行，未命中返回 null
 * 匹配顺序：完全一致 → 别名 → 标题前缀 → 查询词含标题 → 标题含查询词
 */
export async function lookupMeme(query) {
    const q = String(query || '').trim()
    if (!q) return null
    const conn = await getDb()
    if (!conn) return null
    try {
        const exact = conn.prepare('SELECT * FROM memes WHERE title = ?').get(q)
        if (exact) return exact

        const alias = conn
            .prepare(
                "SELECT * FROM memes WHERE aliases IS NOT NULL AND instr(',' || lower(aliases) || ',', ',' || lower(?) || ',') > 0 LIMIT 1"
            )
            .get(q)
        if (alias) return alias

        const prefix = conn
            .prepare("SELECT * FROM memes WHERE lower(title) LIKE lower(?) || '%' ORDER BY length(title) ASC LIMIT 1")
            .get(q)
        if (prefix) return prefix

        const reverse = conn
            .prepare(
                'SELECT * FROM memes WHERE length(title) >= 2 AND instr(?, title) > 0 ORDER BY length(title) DESC LIMIT 1'
            )
            .get(q)
        if (reverse) return reverse

        const shortAllowed = q.length >= 2 && /^[0-9a-z]+$/i.test(q)
        if (q.length >= 3 || shortAllowed) {
            const forward = conn
                .prepare('SELECT * FROM memes WHERE instr(title, ?) > 0 ORDER BY length(title) ASC LIMIT 1')
                .get(q)
            if (forward) return forward
        }
        return null
    } catch (e) {
        logger.warn?.(`[梗百科] 查询失败: ${e.message}`)
        return null
    }
}

/** 词条 → 给模型看的文本，「怎么用」放前面方便直接接梗 */
export function formatMemeEntry(row) {
    if (!row) return ''
    const lines = [`[梗百科]「${row.title}」`]
    const tags = truncate(row.tags, MAX_TAGS_LEN)
    const usage = truncate(row.usage, MAX_USAGE_LEN)
    const summary = truncate(row.summary || row.origin, MAX_SUMMARY_LEN)
    if (tags) lines.push(`标签：${tags}`)
    if (usage) lines.push(`怎么用 / 怎么接：\n${usage}`)
    if (summary) lines.push(`出处与含义：\n${summary}`)
    return lines.join('\n')
}

/** 接梗规则，只在命中时随词条一起注入 */
export const MEME_RULES =
    '[梗百科·内置用法]\n' +
    '1. 查到词条就先接梗、别科普：照「怎么用/怎么接」回一句，像本来就会；\n' +
    '2. 只有对方明确问「这是什么梗」才解释出处，一两句就够，不要念词条；\n' +
    '3. 查不到就说不知道，别硬编，也别把两个不相干的梗拼一起；\n' +
    '4. 说话用短句，别用客服腔。'

/** 词库统计 */
export async function getMemeWikiStats() {
    const conn = await getDb()
    if (!conn) return { ok: false, total: 0, dbPath: DB_FILE }
    try {
        const total = conn.prepare('SELECT COUNT(*) AS n FROM memes').get().n
        let builtAt = ''
        try {
            const meta = conn.prepare("SELECT value FROM meta WHERE key = 'built_at'").get()
            builtAt = meta ? String(meta.value || '') : ''
        } catch {
            /* 老库没有 meta 表 */
        }
        return { ok: true, total, builtAt, dbPath: DB_FILE }
    } catch (e) {
        return { ok: false, total: 0, dbPath: DB_FILE, error: e.message }
    }
}
