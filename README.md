# i18n-file-replace-cli

**English** | [中文](README.zh-CN.md)

Command-line tool built on the external API of the i18n resource management platform (https://i18n.codeini.com). Converts plain code files into i18n-ready code files and can write the generated keys into the platform resource database.

Requirements: Node.js >= 20 (uses the built-in `fetch`, no Node-side HTTP dependency).

## Installation

```bash
cd i18n-file-replace-cli
npm install
npm link          # optional: register the i18n-replace command globally
```

Or run it directly with npx:

```bash
npx --yes --package @codeini/i18n-file-replace-cli i18n-replace --help
```

## Authentication

Calling the API requires a platform API key, provided in one of two ways:

| Method | Description |
|---|---|
| Environment variable | Set `I18N_API_KEY` (recommended) |
| Command line | Add `--api-key <key>` to each command |

- Get your API key from the i18n platform (https://i18n.codeini.com); platform admins configure keys in `ExternalApi:ApiKeys` in `General.Api/appsettings.json`.
- On authentication failure (401), check whether the key is correct and enabled.

Other environment variables:

| Variable | Description | Default |
|---|---|---|
| `I18N_BASE_URL` | API base URL | `https://i18n.codeini.com` |
| `I18N_API_KEY` | API key sent as `X-Api-Key` | (empty) |
| `I18N_ACCOUNT_ID` | Dev-mode tenant id sent as `X-Dev-Account-Id` (Development only) | (empty) |
| `I18N_EXTERNAL_PREFIX` | External API path prefix; set **empty** when calling through the Gateway (its route already maps `/api/v1/i18n/{all}` → `/api/external/{all}`) | `/api/external` |
| `I18N_TRANSLATE_PROVIDER` | Default machine-translation provider for `--translate-to` (falls back to the platform default when unset) | (platform default) |

When calling the platform through the Gateway billing entry:

```bash
export I18N_BASE_URL=http://<gateway-host>:8201/api/v1/i18n
export I18N_API_KEY=ck_xxx
export I18N_EXTERNAL_PREFIX=   # empty: gateway rewrites /api/v1/i18n/projects -> /api/external/projects
```

## Commands

### `i18n-replace replace <file|dir>`

Replaces a single file or an **entire directory** of code with the i18n version.

- **File mode**: without `--out` the result goes to stdout (info goes to stderr, convenient for piping).
- **Directory mode**: recursively processes all files with matching extensions; you must pass `--in-place` (overwrite originals) or `--out-dir` (write to a new directory).

```bash
# Use a local config file
i18n-replace replace src/views/Home.vue --config ./i18n-config.json --out dist/Home.vue

# Use inline JSON config
i18n-replace replace src/views/Home.vue --config '{"name":"vue","files":[...]}'

# Use a profile saved on the platform and write keys into a resource set
i18n-replace replace Home.vue --profile vue-home --resource-set home --out Home.i18n.vue

# Directory mode: replace the whole directory in place (each file is backed up as .bak first)
i18n-replace replace src --profile vue-home --in-place

# Directory mode: write to a new directory, preserving the relative structure, originals untouched
npx i18n-replace replace src --profile vue-home --out-dir dist-i18n
```

| Option | Description |
|---|---|
| `--config <path\|json>` | Config file path or inline JSON (mutually exclusive with `--profile`) |
| `--profile <name>` | Name of a config profile saved on the platform (mutually exclusive with `--config`) |
| `--resource-set <set>` | Write the generated keys into this resource set (platform database, LocaleId=zh by default) |
| `--resource-set-by-dir` | Directory mode: maintain a resource set per first-level subdirectory — each file's set is `<--resource-set base>.<first subdir>` (e.g. `web.setting`); requires `--resource-set` as the base prefix |
| `--translate-to <locales>` | With `--resource-set`: also machine-translate each generated key into these comma-separated target locales (e.g. `en`) and write them alongside the source into the resource database |
| `--project <id\|name>` | Link every resource set used to this project before writing (so resources land in the project's shard table, isolated by account); accepts a project id or name |
| `--out <path>` | File mode: output file path; defaults to stdout |
| `--in-place` | Directory mode: overwrite the original file (creates a `.bak` backup first unless `--no-backup`) |
| `--no-backup` | Directory mode: skip the `.bak` backup when using `--in-place` |
| `--out-dir <dir>` | Directory mode: write to this directory (preserves the relative structure), originals untouched; mutually exclusive with `--in-place` |
| `--ext <exts>` | Directory mode: comma-separated extensions to process, default `.vue,.js,.ts,.cs`; skips `node_modules`/`.git`/`dist`/`bin`/`obj` |
| `--gitignore` | Directory mode: honor `.gitignore` files (including nested ones, `!` negation) |
| `--i18nignore [path]` | Directory mode: custom ignore file (gitignore syntax); defaults to auto-loading `.i18nreplaceignore` from the scan root |
| `--base-url <url>` | API base URL (default: env `I18N_BASE_URL` or https://i18n.codeini.com) |
| `--api-key <key>` | API key (default: env `I18N_API_KEY`) |
| `--account-id <id>` | Dev-mode tenant AccountId, sends `X-Dev-Account-Id` header (default: env `I18N_ACCOUNT_ID`, only effective in local Development) |
| `--external-prefix <prefix>` | External API path prefix (default: env `I18N_EXTERNAL_PREFIX` or `/api/external`; set `""` when going through the Gateway) |

### `i18n-replace preview <file>`

Previews the replacement result as JSON (`originalContent` / `content` / `generatedKeys` / `keyCount`), without writing to the database.

```bash
i18n-replace preview src/App.vue --profile vue-home
```

### `i18n-replace batch <dir>`

Recursively batch-replaces files in a directory, skipping `node_modules` / `.git` / `dist` / `bin` / `obj`.

```bash
# Dry run (only lists files to process, no API calls)
i18n-replace batch ./src --config ./i18n-config.json --dry-run

# Batch replace, overwriting originals (backed up as .bak first)
i18n-replace batch ./src --config ./i18n-config.json --in-place

# Batch replace, writing to out/ (preserving the relative structure)
i18n-replace batch ./src --config ./i18n-config.json --ext .vue,.js --out-dir ./out

# Batch replace and write keys into a resource set (no file output, stats only)
i18n-replace batch ./src --profile vue-project --resource-set app --ext .vue,.ts
```

| Option | Description |
|---|---|
| `--config <path\|json>` | Config file path or inline JSON (mutually exclusive with `--profile`) |
| `--profile <name>` | Name of a config profile saved on the platform (mutually exclusive with `--config`) |
| `--ext <exts>` | Extensions to process, comma-separated, default `.vue,.js,.ts,.cs` |
| `--resource-set <set>` | Write the generated keys into this resource set |
| `--resource-set-by-dir` | Maintain a resource set per first-level subdirectory: `<--resource-set base>.<first subdir>`; requires `--resource-set` as base |
| `--translate-to <locales>` | With `--resource-set`: also machine-translate each generated key into these comma-separated target locales (e.g. `en` or `en,ja`) and write them alongside the source into the resource database (reported as `翻译 N 条` / `translatedCount`) |
| `--project <id\|name>` | Link each used resource set to this project before writing (project = shard table + account isolation) |
| `--dry-run` | Only list files to process, no API calls |
| `--in-place` | Overwrite originals (creates a `.bak` backup first unless `--no-backup`); mutually exclusive with `--out-dir` |
| `--no-backup` | Skip the `.bak` backup when using `--in-place` |
| `--out-dir <dir>` | Output directory (preserves the relative structure), originals untouched; default: no file output |
| `--gitignore` | Honor `.gitignore` files (including nested ones, `!` negation) |
| `--i18nignore [path]` | Custom ignore file (gitignore syntax); defaults to auto-loading `.i18nreplaceignore` from the scan root |

### Directory scanning & ignore rules

When scanning recursively in directory mode (`replace <dir>` / `batch`), files are processed according to these rules, in order:

1. **Built-in skip directories** (always applied, cannot be overridden): `node_modules` / `.git` / `dist` / `bin` / `obj`
2. **`.gitignore`** (optional, enabled with `--gitignore`): reads `.gitignore` from the scan root and every nested directory; supports comments, `!` negation, `/` anchoring, `*` / `?` / `**` wildcards; deeper files take precedence over shallower ones
3. **`.i18nreplaceignore`** (automatic): loaded automatically when present in the scan root, same syntax as `.gitignore`, **evaluated last** — use `!` to re-include files excluded by `.gitignore`
4. **Custom ignore file** (optional): `--i18nignore <path>` points to another ignore file (replaces the auto-discovered `.i18nreplaceignore`)

```bash
# Example .gitignore content:
#   *.log          # ignore all .log files (any level)
#   temp/          # ignore the temp directory
#   /root-only/    # ignore root-only only at the scan root (anchored)
#   !keep.log      # re-include keep.log

# Honor .gitignore when scanning
i18n-replace batch src --gitignore --dry-run

# Example .i18nreplaceignore content (applied automatically, no flags needed):
#   secret/            # ignore the secret directory
#   !temp/keep.txt     # re-include a file excluded by .gitignore's temp/

# Use a custom ignore file (replaces the auto-discovered .i18nreplaceignore)
i18n-replace replace src --i18nignore .myignore --in-place
```

### `i18n-replace project create <name>` / `list` / `add-set <project>` / `update <project>` / `delete <project>` / `remove-set <project>`

Manages projects. A **project decides the shard table and tenant (account) isolation** — resources written under a resource set only land in the project's shard table once that set is linked to the project (this happens automatically when you pass `--project` to `replace`/`batch`).

```bash
# Create (idempotent by name) a project for a subproject
i18n-replace project create web --default-locale zh --locales zh,en,ja

# List projects of the current account
i18n-replace project list

# Manually link a resource set to a project (id or name accepted)
i18n-replace project add-set web --set web.setting

# Update a project (fields you omit keep their current values)
i18n-replace project update web --locales zh,en,ja,ko

# Delete a project and its resource-set links (requires --yes; shard data is not dropped)
i18n-replace project delete web --yes

# Unlink a resource set from a project (does not delete the resources)
i18n-replace project remove-set web --set web.setting
```

### `i18n-replace profiles list` / `get <name>` / `save <name>` / `delete <name>`

Lists the config profiles of the current account / fetches a profile by name (including configJson) / saves a config profile to the server (idempotent upsert by name) / deletes a profile by name.

```bash
i18n-replace profiles list
i18n-replace profiles get vue-home
i18n-replace profiles save web-vue --config configs/web.vue.json
i18n-replace profiles delete web-vue
```

### `i18n-replace resource list` / `set <set> <key>` / `delete <set> <key>` / `delete-set <set>` / `rename <set> <key> <newKey>` / `import <set>`

Reads, modifies, and deletes individual resources (keys) or whole resource sets on the server — the complement to `download` (which exports an entire set).

```bash
# List all keys in a resource set
i18n-replace resource list --resource-set web.setting

# Add or update a single key's translation (upsert)
i18n-replace resource set web.setting area.title --locale en --value "Area"

# Delete a single key (add --locale to delete only that language)
i18n-replace resource delete web.setting area.title --locale en

# Rename a single key (across all locales)
i18n-replace resource rename web.setting area.title area.name

# Batch import/update from a JSON file (nested JSON supported; feeds `download` output back in)
i18n-replace resource import web.setting --file ./web.setting.en.json --locale en

# Delete an entire resource set (requires --yes)
i18n-replace resource delete-set web.setting --yes
```

### `i18n-replace download`

Downloads the i18n resources that `replace`/`batch --resource-set` wrote into the platform, in the format your language stack needs (`.json` / `.resx` / `.po` / `.yaml`).

- Single locale → one file. Multiple locales (or `.resx`) → a ZIP, which the CLI extracts automatically into `--out-dir` (no external dependency).
- `--list-sets` prints the resource sets available to your account.

```bash
# List available resource sets
i18n-replace download --list-sets

# Download the whole set as JSON (multi-locale -> ZIP, auto-extracted)
i18n-replace download --resource-set home --format .json --out-dir src/locales

# Download a single locale as one file
i18n-replace download --resource-set home --format .json --locale en --out-dir src/locales

# .NET backend: export RESX into the Resources folder
i18n-replace download --resource-set backend --format .resx --out-dir Resources
```

| Option | Description |
|---|---|
| `--resource-set <set>` | Resource set to export (the one passed to `--resource-set` during replace/batch) |
| `--format <fmt>` | Export format: `.json` (default) / `.resx` / `.po` / `.yaml` |
| `--locale <locale>` | Export only this locale as a single file; omit to export all locales |
| `--out-dir <dir>` | Output directory (required); single file is written here, ZIP is extracted here |
| `--list-sets` | Only list available resource sets, no download |
| `--base-url <url>` | API base URL (default: env `I18N_BASE_URL` or https://i18n.codeini.com) |
| `--api-key <key>` | API key (default: env `I18N_API_KEY`) |
| `--account-id <id>` | Dev-mode tenant AccountId (default: env `I18N_ACCOUNT_ID`) |
| `--external-prefix <prefix>` | External API path prefix (default: env `I18N_EXTERNAL_PREFIX` or `/api/external`; set `""` through the Gateway) |

## End-to-end example

```bash
# 1. Generate a config file (use the platform's AI config generator, or the i18n-config-generator skill)
# 2. List available profiles
i18n-replace profiles list

# 3. Preview a single file
i18n-replace preview src/views/Home.vue --profile vue-home > preview.json

# 4. Batch replace and write resources
i18n-replace batch src --profile vue-home --resource-set home --ext .vue --out-dir out

# 5. Export the resources on the platform (json/resx/po/yaml) and integrate them into the frontend
#    (or use the CLI: `i18n-replace download --resource-set home --format .json --out-dir src/locales`)
```

## Common errors

| Symptom | Fix |
|---|---|
| `Authentication failed (401)` | Check `I18N_API_KEY` / `--api-key` and whether the key is enabled |
| `Cannot connect to ...` | Check the network and that `--base-url` / `I18N_BASE_URL` is reachable |
| `Config file not found` | Check the `--config` path |
| `Must provide --config or --profile` | Provide at least one of the two, never both |

## Publishing to npm

A release is cut from a git tag: push `vX.Y.Z` (the same version as `package.json`) and the
**Release** workflow runs the tests, then submits this version with `npm stage publish`.

Staged publishing means the workflow can only queue the package in npm's **staging area** — nobody
installs it from there. Making it live requires a maintainer to approve it on
https://www.npmjs.com under the **Staged Packages** tab (or `npm stage approve <stage-id>` in the
CLI), and **that step needs 2FA**. CI structurally cannot publish on its own. The workflow reads
the `NPM_TOKEN` repository secret, which must carry `@codeini` publish rights.

```bash
npm test                                      # what CI runs, on your machine
npm run publish:npm                           # stage this working copy by hand (needs NPM_TOKEN)
npm stage list @codeini/i18n-file-replace-cli # find the stage-id
npm stage approve <stage-id>                  # make it live (your own npm login + 2FA)
```
