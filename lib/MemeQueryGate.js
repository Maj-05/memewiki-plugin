/**
 * 判断一条消息「像不像在问梗」，像才去查词库
 *
 * 宁可漏查，不硬塞：闲聊、问状态、纯语气词一律不查。
 * 逻辑沿用 dsh-memewiki 原版（问梗句式 / 裸词 / 缩写 / 停用词过滤）。
 */

const ASK_PATTERN =
    /(?:是)?(?:什么梗|啥梗|什么来头|什么来历|什么出处|什么意思|啥意思|怎么用|怎么接|怎么玩|如何用)(?:啊|呀|呢|的|啊这是)?[？?。！!~～]*$/

const BARE_WORD_PATTERN = /^[\u4e00-\u9fa5A-Za-z0-9·]{2,10}$/

/** 纯字母/数字缩写，2-10 位 */
const ABBR_PATTERN = /^[A-Za-z0-9]{2,10}$/

/** 光秃秃的代词，问「这个什么意思」不该去查「这个」 */
const PRONOUNS = new Set([
    '这',
    '那',
    '它',
    '他',
    '她',
    '这个',
    '那个',
    '你',
    '这句话',
    '那句话',
    '上面',
    '刚才',
    '下文',
    '前面'
])

/** 日常口头语，长得像裸词但不是梗 */
const STOP_WORDS = new Set([
    '在吗',
    '在不在',
    '哈哈',
    '哈哈哈',
    '笑死',
    '好的',
    '好吧',
    '晚安',
    '早安',
    '睡觉',
    '吃饭',
    '干嘛',
    '没事',
    '收到',
    '谢谢',
    '好耶',
    '草',
    '典',
    '乐',
    'ok',
    'okay',
    'yes',
    'no',
    'emmm',
    'hhh'
])

/** 明显在闲聊/问状态的整句 */
const CHITCHAT = new Set([
    '我是谁',
    '错了',
    '情绪',
    '接下一句',
    '你也学一个',
    '今天看什么',
    '到底多少了',
    '搜出来了吗',
    '来点贴吧评价',
    '都是同龄人',
    '你同事',
    '道德这么高',
    '这是谁的手臂',
    '比我能串',
    '宝宝你醒了',
    '中国人能不能飞',
    '你现在什么人格'
])

/** 带这些成分的短句是在问事，不是在问梗 */
const SENTENCE_PARTS = /怎么样|怎么|多少|为什么|能不能|是不是|什么|了吗|了没|一下|你说|要不要|有没有/

/** 唤醒词，剥掉再判断 */
const WAKE_WORDS = ['梗百科', '小鲸鱼', '大鲸鱼', '大肥鲸', '小肥鲸', '大肥鱼', '奶鱼', '鲸鱼', 'deepseek', 'ds']

/** 去掉 @、唤醒词和首尾标点 */
export function cleanText(text) {
    let t = String(text || '').trim()
    t = t.replace(/^(@\S+\s*)+/, '')
    for (const w of WAKE_WORDS) {
        if (t.startsWith(w)) {
            t = t
                .slice(w.length)
                .trim()
                .replace(/^[，,。.！!？?:：]+|[，,。.！!？?:：]+$/g, '')
            break
        }
    }
    return t.trim()
}

/**
 * 从一句话里提取要查的词；不像问梗就返回 null
 * @param {string} text 用户消息
 * @returns {string|null}
 */
export function extractMemeQuery(text) {
    const t = cleanText(text)
    if (!t) return null

    /*
     * 整句里夹着一个纯字母缩写，且带疑问成分，直接把这个缩写当查询词。
     * 处理「kskbl是啥」「kskbl 没见过」这类，缩写本身不受长度和代词限制
     */
    const abbrInSentence = t.match(/\b([A-Za-z]{2,10})\b/)
    if (abbrInSentence && /啥|什么|意思|梗|缩写|怎么|哪来|出处/.test(t)) {
        return abbrInSentence[1]
    }

    const m = ASK_PATTERN.exec(t)
    if (m) {
        let head = t.slice(0, m.index).replace(/^[ ，,。.！!？?]+|[ ，,。.！!？?]+$/g, '')
        head = head.replace(/^[是]+|[是]+$/g, '').trim()
        head = head.replace(/(这个梗|那个梗|这梗|那梗|这个|那个)$/, '').trim()
        head = head.replace(/(到底|究竟)$/, '').trim()
        if (PRONOUNS.has(head)) return null
        if (head.length <= 2 && '这那它他她'.includes(head[0])) return null
        if (head.length > 1 && head.length <= 12) return head
        return null
    }

    // 纯缩写单独发也能查
    if (ABBR_PATTERN.test(t) && !STOP_WORDS.has(t.toLowerCase())) return t

    if (BARE_WORD_PATTERN.test(t) && !STOP_WORDS.has(t) && !CHITCHAT.has(t)) {
        if (SENTENCE_PARTS.test(t)) return null
        return t
    }

    return null
}
