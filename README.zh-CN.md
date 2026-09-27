# i18n-file-replace-cli

[English](README.md) | **中文**

基于 i18n 资源管理系统（https://i18n.codeini.com）外部 API 的文件替换命令行工具。
将普通代码文件转换为支持 i18n 的代码文件，并可把生成的 key 写入平台资源库。

要求：Node.js >= 20（使用内置 `fetch`，无 Node 侧 HTTP 依赖）。

## 安装

```bash
cd i18n-file-replace-cli
npm install
npm link          # 全局注册 i18n-replace 命令（可选）
```

也可以不安装，直接用 npx：

```bash
npx --yes --package @codeini/i18n-file-replace-cli i18n-replace --help
```

## 认证

调用 API 需要平台 API Key，通过两种方式提供（二选一）：

| 方式 | 说明 |
|---|---|
| 环境变量 | 设置 `I18N_API_KEY`（推荐） |
| 命令行参数 | 每个命令加 `--api-key <key>` |

- 先在 [https://www.codeini.com](https://www.codeini.com) 注册账号，然后在控制台创建 API Key。API Key 是访问 Codeini 平台服务（含 i18n 平台）的通用凭证。
- 认证失败（401）时，请检查 Key 是否正确、是否已启用。

其他环境变量：

| 变量 | 说明 | 默认 |
|---|---|---|
| `I18N_BASE_URL` | API 基础地址 | `https://i18n.codeini.com` |
| `I18N_API_KEY` | API Key，以 `X-Api-Key` 头发送 | （空） |
| `I18N_ACCOUNT_ID` | 开发模式租户 ID，以 `X-Dev-Account-Id` 头发送（仅 Development 生效） | （空） |
| `I18N_EXTERNAL_PREFIX` | 外部 API 路径前缀；经 Gateway 调用时置为**空**（Gateway 路由已把 `/api/v1/i18n/{all}` 映射到 `/api/external/{all}`） | `/api/external` |
| `I18N_TRANSLATE_PROVIDER` | `--translate-to` 的默认机翻提供方（未设置时用平台默认提供方） | （平台默认） |

经 Gateway 计费入口调用平台时：

```bash
export I18N_BASE_URL=http://<gateway-host>:8201/api/v1/i18n
export I18N_API_KEY=ck_xxx
export I18N_EXTERNAL_PREFIX=   # 置空：/api/v1/i18n/projects → /api/external/projects
```

## 命令

### `i18n-replace replace <file|dir>`

替换单个文件或**整个目录**的代码为 i18n 版本。

- **文件模式**：未指定 `--out` 时结果输出到 stdout（信息输出到 stderr，便于管道重定向）。
- **目录模式**：递归处理目录下所有匹配扩展名的文件，必须指定 `--in-place`（直接覆盖原文件）或 `--out-dir`（输出到新目录）。

```bash
# 使用本地配置文件
i18n-replace replace src/views/Home.vue --config ./i18n-config.json --out dist/Home.vue

# 使用内联 JSON 配置
i18n-replace replace src/views/Home.vue --config '{"name":"vue","files":[...]}'

# 使用平台上保存的配置，并把 key 写入资源集
i18n-replace replace Home.vue --profile vue-home --resource-set home --out Home.i18n.vue

# 目录模式：直接替换整个目录（每个文件先备份为 .bak 再覆盖）
i18n-replace replace src --profile vue-home --in-place

# 目录模式：输出到新目录，保留相对目录结构，不修改原文件
npx i18n-replace replace src --profile vue-home --out-dir dist-i18n
```

| 参数 | 说明 |
|---|---|
| `--config <path\|json>` | 配置文件路径或内联 JSON（与 `--profile` 二选一） |
| `--profile <name>` | 使用平台上已保存的配置名（与 `--config` 二选一） |
| `--resource-set <set>` | 将生成的 key 写入该资源集（写入平台数据库，默认 LocaleId=zh） |
| `--resource-set-by-dir` | 目录模式：以base下第一级子目录为单位维护资源集，每个文件的 set = `<--resource-set base>.<第一级子目录名>`（如 `web.setting`）；需同时提供 `--resource-set` 作为 base |
| `--translate-to <locales>` | 配合 `--resource-set`：写入源语言(zh)后，把每个生成的 key 机翻到这些目标语言（逗号分隔，如 `en`），译文以相同 id 一并写入资源库 |
| `--project <id\|name>` | 写入前把用到的每个资源集链接到该项目（资源因此进入项目分表并按账号隔离）；可传项目 id 或名称 |
| `--out <path>` | 文件模式：输出文件路径；缺省输出到 stdout |
| `--in-place` | 目录模式：直接覆盖原文件（默认先生成 `.bak` 备份，`--no-backup` 关闭） |
| `--no-backup` | 目录模式：`--in-place` 覆盖时不生成 `.bak` 备份 |
| `--out-dir <dir>` | 目录模式：输出到该目录（保留相对目录结构），不修改原文件；与 `--in-place` 二选一 |
| `--ext <exts>` | 目录模式：处理的扩展名，逗号分隔，默认 `.vue,.js,.ts,.cs`；跳过 `node_modules`/`.git`/`dist`/`bin`/`obj` |
| `--gitignore` | 目录模式：读取 `.gitignore` 忽略文件（含子目录嵌套、`!` 否定） |
| `--i18nignore [path]` | 目录模式：使用自定义忽略文件（gitignore 语法）；缺省自动读取扫描根目录的 `.i18nreplaceignore` |
| `--base-url <url>` | API 基础地址（默认环境变量 `I18N_BASE_URL` 或 https://i18n.codeini.com） |
| `--api-key <key>` | API Key（默认取环境变量 `I18N_API_KEY`） |
| `--account-id <id>` | 开发模式租户 ID，发送 `X-Dev-Account-Id` 头（默认取环境变量 `I18N_ACCOUNT_ID`，仅本地 Development 生效） |
| `--external-prefix <prefix>` | 外部 API 路径前缀（默认环境变量 `I18N_EXTERNAL_PREFIX` 或 `/api/external`；经 Gateway 时传 `""`） |

### `i18n-replace preview <file>`

预览替换结果，输出 JSON（含 `originalContent` / `content` / `generatedKeys` / `keyCount`），不写库。

```bash
i18n-replace preview src/App.vue --profile vue-home
```

### `i18n-replace batch <dir>`

递归批量替换目录下的文件，跳过 `node_modules` / `.git` / `dist` / `bin` / `obj` 目录。

```bash
# 试运行（只列出将处理的文件，不调用 API）
i18n-replace batch ./src --config ./i18n-config.json --dry-run

# 批量替换，直接覆盖原文件（先备份为 .bak）
i18n-replace batch ./src --config ./i18n-config.json --in-place

# 批量替换，输出到 out/ 目录（保留相对目录结构）
i18n-replace batch ./src --config ./i18n-config.json --ext .vue,.js --out-dir ./out

# 批量替换并把 key 写入资源集（不落盘，仅统计）
i18n-replace batch ./src --profile vue-project --resource-set app --ext .vue,.ts
```

| 参数 | 说明 |
|---|---|
| `--config <path\|json>` | 配置文件路径或内联 JSON（与 `--profile` 二选一） |
| `--profile <name>` | 使用平台上已保存的配置名（与 `--config` 二选一） |
| `--ext <exts>` | 处理的扩展名，逗号分隔，默认 `.vue,.js,.ts,.cs` |
| `--resource-set <set>` | 将生成的 key 写入该资源集 |
| `--resource-set-by-dir` | 以base下第一级子目录为单位维护资源集：`<--resource-set base>.<第一级子目录名>`；需提供 `--resource-set` 作为 base |
| `--translate-to <locales>` | 配合 `--resource-set`：把每个生成的 key 机翻到这些目标语言（逗号分隔，如 `en` 或 `en,ja`）并随源语言一并写入资源库（汇总时显示「翻译 N 条」） |
| `--project <id\|name>` | 写入前把用到的资源集链接到该项目（project = 分表 + 账号隔离） |
| `--dry-run` | 仅列出将处理的文件，不调用 API |
| `--in-place` | 直接覆盖原文件（默认先生成 `.bak` 备份，`--no-backup` 关闭）；与 `--out-dir` 二选一 |
| `--no-backup` | `--in-place` 覆盖时不生成 `.bak` 备份 |
| `--out-dir <dir>` | 输出目录（保留相对目录结构），不修改原文件；缺省不落盘 |
| `--gitignore` | 读取 `.gitignore` 忽略文件（含子目录嵌套、`!` 否定） |
| `--i18nignore [path]` | 使用自定义忽略文件（gitignore 语法）；缺省自动读取扫描根目录的 `.i18nreplaceignore` |

### 目录扫描与忽略规则

目录模式（`replace <dir>` / `batch`）递归扫描时，按以下顺序决定文件是否被处理：

1. **内置跳过目录**（始终生效，不可覆盖）：`node_modules` / `.git` / `dist` / `bin` / `obj`
2. **`.gitignore`**（可选，加 `--gitignore` 开启）：读取扫描根目录及各级子目录的 `.gitignore`，支持注释、`!` 否定、`/` 锚定、`*` / `?` / `**` 通配符；子目录规则优先于父目录
3. **`.i18nreplaceignore`**（自动）：扫描根目录存在该文件时自动加载，语法同 `.gitignore`，**规则最后生效**——可用 `!` 重新包含被 `.gitignore` 排除的文件
4. **自定义忽略文件**（可选）：`--i18nignore <path>` 指定其他路径的忽略文件（代替自动发现的 `.i18nreplaceignore`）

```bash
# .gitignore 内容示例：
#   *.log          # 忽略所有 .log（任意层级）
#   temp/          # 忽略 temp 目录
#   /root-only/    # 仅忽略扫描根目录下的 root-only（锚定）
#   !keep.log      # 重新包含 keep.log

# 扫描时遵循 .gitignore
i18n-replace batch src --gitignore --dry-run

# .i18nreplaceignore 内容示例（无需任何参数即自动生效）：
#   secret/            # 忽略 secret 目录
#   !temp/keep.txt     # 重新包含被 .gitignore 的 temp/ 排除的文件

# 使用自定义忽略文件（替换自动发现的 .i18nreplaceignore）
i18n-replace replace src --i18nignore .myignore --in-place
```

### `i18n-replace project create <name>` / `list` / `add-set <project>` / `update <project>` / `delete <project>` / `remove-set <project>`

管理项目。**project 决定资源的分表与租户（账号）隔离**——`--resource-set` 写入的 key，只有当该资源集已链接到 project 时才会进入该 project 的分表（在向 `replace`/`batch` 传 `--project` 时会自动完成链接）。

```bash
# 为一个子项目创建 project（按名幂等）
i18n-replace project create web --default-locale zh --locales zh,en,ja

# 列出当前账号的所有项目
i18n-replace project list

# 手动把资源集链接到项目（<project> 可传 id 或名称）
i18n-replace project add-set web --set web.setting

# 修改项目（未指定的字段沿用当前值）
i18n-replace project update web --locales zh,en,ja,ko

# 删除项目及其资源集链接（需 --yes 确认；不删除分表数据）
i18n-replace project delete web --yes

# 把资源集从项目解除链接（不删除资源本身）
i18n-replace project remove-set web --set web.setting
```

### `i18n-replace profiles list` / `get <name>` / `save <name>` / `delete <name>`

查看当前账号的配置文件列表 / 按名称获取配置（含 configJson） / 保存配置到服务端（按名幂等 upsert） / 按名称删除配置。

```bash
i18n-replace profiles list
i18n-replace profiles get vue-home
i18n-replace profiles save web-vue --config configs/web.vue.json
i18n-replace profiles delete web-vue
```

### `i18n-replace resource list` / `set <set> <key>` / `delete <set> <key>` / `delete-set <set>` / `rename <set> <key> <newKey>` / `import <set>`

直接查看/修改/删除服务端的单条资源（key）或整个资源集，是对 `download`（按集导出）的补充。

```bash
# 列出资源集内所有 key
i18n-replace resource list --resource-set web.setting

# 新增或修改单个 key 的译文（upsert）
i18n-replace resource set web.setting area.title --locale en --value "Area"

# 删除单个 key（加 --locale 只删该语言）
i18n-replace resource delete web.setting area.title --locale en

# 重命名单个 key（跨所有语言）
i18n-replace resource rename web.setting area.title area.name

# 从 JSON 文件批量导入/更新（支持嵌套，可直灌 download 导出的文件）
i18n-replace resource import web.setting --file ./web.setting.en.json --locale en

# 删除整个资源集（需 --yes 确认）
i18n-replace resource delete-set web.setting --yes
```

### `i18n-replace download`

下载 `replace`/`batch --resource-set` 写入服务端的 i18n 资源，输出为各语言栈需要的格式（`.json` / `.resx` / `.po` / `.yaml`）。

- 单一语言 → 单文件。多语言（或 `.resx`）→ ZIP，CLI 自动解压到 `--out-dir`（无外部依赖）。
- `--list-sets` 列出当前账号可用的资源集。

```bash
# 列出可用资源集
i18n-replace download --list-sets

# 下载整个资源集为 JSON（多语言 -> ZIP，自动解压）
i18n-replace download --resource-set home --format .json --out-dir src/locales

# 仅下载单一语言为单文件
i18n-replace download --resource-set home --format .json --locale en --out-dir src/locales

# .NET 后端：导出 RESX 到 Resources 目录
i18n-replace download --resource-set backend --format .resx --out-dir Resources
```

| 选项 | 说明 |
|---|---|
| `--resource-set <set>` | 要导出的资源集（替换/批量时 `--resource-set` 写入的那个） |
| `--format <fmt>` | 导出格式：`.json`（默认）/ `.resx` / `.po` / `.yaml` |
| `--locale <locale>` | 仅导出该语言为单文件；不传则导出全部语言 |
| `--out-dir <dir>` | 输出目录（必填）；单文件写入此目录，ZIP 解压到此目录 |
| `--list-sets` | 仅列出可用资源集，不下载 |
| `--base-url <url>` | API 基础地址（默认取环境变量 `I18N_BASE_URL` 或 https://i18n.codeini.com） |
| `--api-key <key>` | API Key（默认取环境变量 `I18N_API_KEY`） |
| `--account-id <id>` | 开发模式租户 ID（默认环境变量 `I18N_ACCOUNT_ID`） |
| `--external-prefix <prefix>` | 外部 API 路径前缀（默认环境变量 `I18N_EXTERNAL_PREFIX` 或 `/api/external`；经 Gateway 时传 `""`） |

## 使用示例（端到端）

```bash
# 1. 生成配置文件（可用平台的 AI 配置生成功能，或参考 i18n-config-generator skill）
# 2. 查看可用配置
i18n-replace profiles list

# 3. 预览单个文件
i18n-replace preview src/views/Home.vue --profile vue-home > preview.json

# 4. 批量替换并写入资源
i18n-replace batch src --profile vue-home --resource-set home --ext .vue --out-dir out

# 5. 在平台上导出资源（json/resx/po/yaml），整合进前端
#    （或使用 CLI：i18n-replace download --resource-set home --format .json --out-dir src/locales）
```

## 常见错误

| 现象 | 处理 |
|---|---|
| `认证失败 (401)` | 检查 `I18N_API_KEY` / `--api-key` 是否正确、Key 是否启用 |
| `无法连接到 ...` | 检查网络，确认 `--base-url` / `I18N_BASE_URL` 可达 |
| `配置文件不存在` | 检查 `--config` 路径 |
| `必须提供 --config 或 --profile` | 两个参数至少提供一个，且不能同时提供 |

## 发布到 npm

发版由 git tag 触发：推一个 `vX.Y.Z`（要和 `package.json` 的 version 一致），**Release** workflow
会跑完测试再用 `npm stage publish` 把这一版交出去。

staged publishing 意味着 workflow 只能把包放进注册表的**待审区** —— 从那儿谁都 install 不到。
真正上架要维护者在 https://www.npmjs.com 的 **Staged Packages** 页点 Approve（或 CLI 的
`npm stage approve <stage-id>`），**这一步要 2FA**。所以 CI 结构上没有自主发布的能力。
workflow 用仓库 secret `NPM_TOKEN` 鉴权，它必须带 `@codeini` 的发布权。

```bash
npm test                                      # CI 跑什么，你本机就能跑什么
npm run publish:npm                           # 手工把当前工作副本交进待审区（要 NPM_TOKEN）
npm stage list @codeini/i18n-file-replace-cli # 拿 stage-id
npm stage approve <stage-id>                  # 上架（要你本人的 npm 登录 + 2FA）
```
