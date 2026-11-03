# memewiki-plugin

云崽（Yunzai-Bot）梗百科插件。本地词库，6696 条梗 / 缩写 / 黑话，零联网零依赖。

## 安装

放进 `plugins/` 目录即可，不需要 `npm install`。

要求 Node **22.5.0+**（用的是内置 `node:sqlite`，不是 `sqlite3` 包）。

## 用法

```
#梗百科 尼罗河二圣
#查梗 kskbl
#梗百科统计
```

## 配置

`config/config.yaml`

```yaml
enabled: true      # 是否启用指令
showUsage: true    # 是否发「怎么用 / 怎么接」
maxLength: 600     # 单条回复最大字数
```

## 给别的插件用

别的插件想在拼 prompt 前预查，可以 import：

```js
import { precheckMeme } from '../memewiki-plugin/index.js'

const extra = await precheckMeme('kskbl是啥')
if (extra) systemPrompt += '\n\n' + extra
```

`precheckMeme` 会先判断这句话像不像在问梗，不像直接返回 `null`，所以闲聊不会被塞内容。

也可以只用底层接口：

```js
import { lookupMeme, formatMemeEntry, extractMemeQuery } from '../memewiki-plugin/index.js'
```

## 词库

`data/memes.db`，SQLite 只读。表结构：

```sql
CREATE TABLE memes (
  id      INTEGER PRIMARY KEY,
  title   TEXT NOT NULL,
  aliases TEXT,
  tags    TEXT,
  usage   TEXT,
  summary TEXT,
  origin  TEXT
);
```

词条数据来自 [cnmeme.wiki](https://cnmeme.wiki) 公开内容，词库移植自 [dsh-memewiki](https://github.com/thawline/dsh-memewiki)（MIT）。

## 匹配顺序

完全一致 → 别名 → 标题前缀 → 查询词含标题 → 标题含查询词

## License

MIT
