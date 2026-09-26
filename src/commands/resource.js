'use strict';

const fs = require('fs');
const { createClient } = require('../client');
const { addCommonOptions } = require('./common');

const GUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Resolves an optional --project reference (GUID or exact name) to a project id.
 * @param {import('../client').ApiClient} client
 * @param {string|undefined} idOrName
 * @returns {Promise<string|undefined>} project id, or undefined when not provided
 */
async function resolveProjectId(client, idOrName) {
    if (!idOrName) return undefined;
    if (GUID_RE.test(idOrName)) return idOrName;
    const list = await client.listProjects();
    const hit = list.find(p => (p.name || '').toLowerCase() === idOrName.toLowerCase());
    if (!hit) throw new Error(`未找到项目：${idOrName}`);
    return hit.id;
}

/**
 * Flattens a (possibly nested) i18n JSON object into a flat { 'a.b.c': value } map.
 * Leaf values are coerced to strings; arrays are rejected as unsupported.
 * Lets `import` consume the nested JSON produced by `download`.
 * @param {object} obj
 * @param {string} [prefix]
 * @returns {Object<string,string>}
 */
function flattenJson(obj, prefix = '') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            Object.assign(out, flattenJson(v, key));
        } else if (v !== null && v !== undefined) {
            out[key] = String(v);
        }
    }
    return out;
}

/**
 * Registers the `resource` command group: read/modify/delete individual i18n resources
 * (keys) on the server. Complements `download` (which exports whole sets).
 * @param {import('commander').Command} program
 */
function register(program) {
    const resource = program
        .command('resource')
        .description('查看/修改/删除服务端的多语言资源（单个 key 或整个资源集）');
    addCommonOptions(resource);

    resource
        .command('list')
        .description('列出资源集内的所有 key')
        .requiredOption('--resource-set <set>', '资源集名称')
        .option('--project <idOrName>', '项目 id 或名称（可选，用于定位资源分表）')
        .action(async (opts) => {
            try {
                const client = createClient(resource.opts());
                const projectId = await resolveProjectId(client, opts.project);
                const keys = await client.listResourceKeys(opts.resourceSet, projectId);
                if (!keys || keys.length === 0) {
                    console.log(`资源集 ${opts.resourceSet} 没有 key`);
                    return;
                }
                console.log(`资源集 ${opts.resourceSet} 共 ${keys.length} 个 key：`);
                for (const k of keys) {
                    console.log(`  - ${k.resourceId}${k.hasValue ? '' : ' (空值)'}`);
                }
            } catch (err) {
                console.error(`错误：${err.message}`);
                process.exit(1);
            }
        });

    resource
        .command('set <resourceSet> <key>')
        .description('新增或修改单个资源 key 的译文（upsert）')
        .requiredOption('--locale <locale>', '语言（如 zh / en）')
        .option('--value <value>', '译文内容（与 --value-file 二选一）')
        .option('--value-file <path>', '从文件读取译文内容')
        .option('--comment <comment>', '备注（可选）')
        .option('--project <idOrName>', '项目 id 或名称（可选）')
        .action(async (resourceSet, key, opts) => {
            try {
                let value = opts.value;
                if (opts.valueFile) {
                    if (!fs.existsSync(opts.valueFile)) throw new Error(`值文件不存在：${opts.valueFile}`);
                    value = fs.readFileSync(opts.valueFile, 'utf8');
                }
                if (value === undefined) throw new Error('必须提供 --value <text> 或 --value-file <path>');
                const client = createClient(resource.opts());
                const projectId = await resolveProjectId(client, opts.project);
                await client.upsertResource({
                    resourceId: key,
                    resourceSet,
                    localeId: opts.locale,
                    value,
                    comment: opts.comment,
                    projectId
                });
                console.log(`✓ ${resourceSet} / ${key} [${opts.locale}] 已保存`);
            } catch (err) {
                console.error(`错误：${err.message}`);
                process.exit(1);
            }
        });

    resource
        .command('delete <resourceSet> <key>')
        .description('删除单个资源 key（省略 --locale 时删除该 key 的所有语言）')
        .option('--locale <locale>', '仅删除指定语言（可选）')
        .option('--project <idOrName>', '项目 id 或名称（可选）')
        .action(async (resourceSet, key, opts) => {
            try {
                const client = createClient(resource.opts());
                const projectId = await resolveProjectId(client, opts.project);
                await client.deleteResource({
                    resourceId: key,
                    resourceSet,
                    localeId: opts.locale,
                    projectId
                });
                console.log(`✓ ${resourceSet} / ${key}${opts.locale ? ` [${opts.locale}]` : ''} 已删除`);
            } catch (err) {
                console.error(`错误：${err.message}`);
                process.exit(1);
            }
        });

    resource
        .command('delete-set <resourceSet>')
        .description('删除整个资源集（所有 key、所有语言）')
        .option('--project <idOrName>', '项目 id 或名称（可选）')
        .option('--yes', '跳过确认')
        .action(async (resourceSet, opts) => {
            try {
                if (!opts.yes) {
                    console.log(`将删除整个资源集 ${resourceSet}（所有 key/语言），加 --yes 确认执行`);
                    return;
                }
                const client = createClient(resource.opts());
                const projectId = await resolveProjectId(client, opts.project);
                await client.deleteResourceSet(resourceSet, projectId);
                console.log(`✓ 资源集 ${resourceSet} 已删除`);
            } catch (err) {
                console.error(`错误：${err.message}`);
                process.exit(1);
            }
        });

    resource
        .command('rename <resourceSet> <key> <newKey>')
        .description('重命名单个资源 key（跨所有语言，一次改完）')
        .option('--project <idOrName>', '项目 id 或名称（可选）')
        .action(async (resourceSet, key, newKey, opts) => {
            try {
                if (key === newKey) throw new Error('新旧 key 相同，无需重命名');
                const client = createClient(resource.opts());
                const projectId = await resolveProjectId(client, opts.project);
                await client.renameResource({ resourceId: key, newResourceId: newKey, resourceSet, projectId });
                console.log(`✓ ${resourceSet} / ${key} 已重命名为 ${newKey}`);
            } catch (err) {
                console.error(`错误：${err.message}`);
                process.exit(1);
            }
        });

    resource
        .command('import <resourceSet>')
        .description('从 JSON 文件批量导入/更新资源 key（upsert，支持嵌套 JSON，单次请求）')
        .requiredOption('--file <path>', 'JSON 文件：扁平 { "a.b": "值" } 或嵌套 { "a": { "b": "值" } }（download 导出的格式可直接回灌）')
        .requiredOption('--locale <locale>', '这批 key 所属语言（如 zh / en）')
        .option('--project <idOrName>', '项目 id 或名称（可选）')
        .action(async (resourceSet, opts) => {
            try {
                if (!fs.existsSync(opts.file)) throw new Error(`JSON 文件不存在：${opts.file}`);
                let parsed;
                try {
                    parsed = JSON.parse(fs.readFileSync(opts.file, 'utf8'));
                } catch (err) {
                    throw new Error(`无效的 JSON：${err.message}`);
                }
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    throw new Error('文件顶层必须是对象（key→值 或 嵌套对象）');
                }
                const flat = flattenJson(parsed);
                const entries = Object.entries(flat);
                if (entries.length === 0) {
                    console.log('文件内没有可导入的 key');
                    return;
                }
                const client = createClient(resource.opts());
                const projectId = await resolveProjectId(client, opts.project);
                const resources = entries.map(([resourceId, value]) => ({
                    resourceId, resourceSet, localeId: opts.locale, value, projectId
                }));
                const result = await client.upsertResources(resources);
                console.log(`✓ 导入 ${result.saved} 个 key 到 ${resourceSet} [${opts.locale}]`);
                if (result.failed && result.failed.length) {
                    console.error(`失败 ${result.failed.length} 个：${result.failed.join(', ')}`);
                }
            } catch (err) {
                console.error(`错误：${err.message}`);
                process.exit(1);
            }
        });
}

module.exports = register;
