import plugin from '../../lib/plugins/plugin.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { lookupMeme, formatMemeEntry, getMemeWikiStats, setLogger } from './lib/MemeWikiService.js'
import { extractMemeQuery } from './lib/MemeQueryGate.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_FILE = path.join(__dirname, 'config', 'config.yaml')

setLogger(logger)

/** 极简 yaml 读取，只认 key: value，避免为了一个开关拉依赖 */
function loadConfig() {
    const def = {
        enabled: true,
        // 命中词条时是否把「怎么用」也发出来，关掉只发出处
        showUsage: true,
        // 单条回复最大字数
        maxLength: 600
    }
    try {
        if (!fs.existsSync(CONFIG_FILE)) return def
        const raw = fs.readFileSync(CONFIG_FILE, 'utf8')
        for (const line of raw.split(/\r?\n/)) {
            const m = /^\s*([A-Za-z_][\w]*)\s*:\s*(.+?)\s*(?:#.*)?$/.exec(line)
            if (!m) continue
            const [, k, v] = m
            if (!(k in def)) continue
            if (v === 'true') def[k] = true
            else if (v === 'false') def[k] = false
            else if (/^\d+$/.test(v)) def[k] = Number(v)
            else def[k] = v.replace(/^["']|["']$/g, '')
        }
    } catch (e) {
        logger.warn(`[梗百科] 读配置失败，用默认值: ${e.message}`)
    }
    return def
}

export class MemeWiki extends plugin {
    constructor() {
        super({
            name: '梗百科',
            dsc: '本地梗/缩写/黑话查询，词库 6696 条，零联网',
            event: 'message',
            priority: 5000,
            rule: [
                { reg: '^#梗百科\\s*(.+)$', fnc: 'query' },
                { reg: '^#查梗\\s*(.+)$', fnc: 'query' },
                { reg: '^#梗百科统计$', fnc: 'stats' }
            ]
        })
        this.config = loadConfig()
    }

    async query(e) {
        if (!this.config.enabled) return false
        const word = String(e.msg || '')
            .replace(/^#(梗百科|查梗)\s*/, '')
            .trim()
        if (!word) return e.reply('要查哪个词')

        const row = await lookupMeme(word)
        if (!row) {
            return e.reply(`词库里没收录「${word}」`)
        }

        let text = formatMemeEntry(row)
        if (!this.config.showUsage) {
            text = text.replace(/怎么用 \/ 怎么接：[\s\S]*?(?=\n出处与含义：|$)/, '')
        }
        const max = Number(this.config.maxLength) || 600
        if (text.length > max) text = text.slice(0, max) + '…'
        return e.reply(text)
    }

    async stats(e) {
        const s = await getMemeWikiStats()
        if (!s.ok) return e.reply(`词库不可用\n${s.dbPath || ''}`)
        return e.reply(`梗百科词库\n收录：${s.total} 条\n构建：${s.builtAt || '未知'}\n路径：${s.dbPath}`)
    }
}

/**
 * 给别的插件用的预查接口
 * chatai 之类可以在拼 prompt 前调一下，命中就把返回文本塞进系统提示
 * @param {string} message 用户原话
 * @returns {Promise<string|null>} 命中返回「规则+词条」，未命中返回 null
 */
export async function precheckMeme(message) {
    const q = extractMemeQuery(message)
    if (!q) return null
    const row = await lookupMeme(q)
    if (!row) return null
    const { MEME_RULES } = await import('./lib/MemeWikiService.js')
    return MEME_RULES + '\n' + formatMemeEntry(row)
}

export { lookupMeme, formatMemeEntry, extractMemeQuery, getMemeWikiStats }
