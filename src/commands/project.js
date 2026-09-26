'use strict';

const { createClient } = require('../client');
const { addCommonOptions } = require('./common');

const GUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Resolves a project id from either a GUID or an exact project name (lists and matches).
 * @param {import('../client').ApiClient} client
 * @param {string} idOrName
 * @returns {Promise<{id: string, name: string}>}
 */
async function resolveProject(client, idOrName) {
    if (GUID_RE.test(idOrName)) return { id: idOrName };
    const list = await client.listProjects();
    const hit = list.find(p => (p.name || '').toLowerCase() === idOrName.toLowerCase());
    if (!hit) throw new Error(`未找到项目：${idOrName}（可用 project list 查看，或用 project create 创建）`);
    return { id: hit.id, name: hit.name };
}

/**
 * Registers the `project` command group.
 * @param {import('commander').Command} program
 */
function register(program) {
    const project = program
        .command('project')
        .description('管理 i18n 项目（project 决定资源的分表与租户隔离，resource set 归属于 project）');
    addCommonOptions(project);

    project
        .command('create <name>')
        .description('创建项目（按名幂等：已存在则返回现有项目）。--resource-set 写入的资源需先链接到该项目才会进入其分表')
        .option('--type <type>', '项目类型（默认 Json）', 'Json')
        .option('--default-locale <locale>', '默认/源语言（默认 zh）', 'zh')
        .option('--locales <list>', '支持的语言列表，逗号分隔，如 zh,en,ja')
        .action(async (name, opts) => {
            try {
                const client = createClient(project.opts());
                const supportedLocales = opts.locales
                    ? String(opts.locales).split(',').map(s => s.trim()).filter(Boolean)
                    : [];
                const p = await client.createProject({
                    name,
                    type: opts.type || 'Json',
                    defaultLocale: opts.defaultLocale || 'zh',
                    supportedLocales
                });
                console.log(`✓ 项目 ${p.name}（id=${p.id}）`);
            } catch (err) {
                console.error(`错误：${err.message}`);
                process.exit(1);
            }
        });

    project
        .command('list')
        .description('列出当前账号的所有项目')
        .action(async () => {
            try {
                const client = createClient(project.opts());
                const list = await client.listProjects();
                if (!list || list.length === 0) {
                    console.log('（暂无项目，可用 project create <name> 创建）');
                    return;
                }
                for (const p of list) {
                    console.log(`${p.id}\t${p.name}\t资源集 ${p.resourceSetCount ?? 0}\t语言 ${(p.supportedLocales || []).join(',')}`);
                }
            } catch (err) {
                console.error(`错误：${err.message}`);
                process.exit(1);
            }
        });

    project
        .command('add-set <project>')
        .description('把资源集链接到项目（按名幂等；<project> 可传项目 id 或项目名）')
        .option('--set <resourceSet>', '资源集名称（batch/replace 的 --resource-set 用的那个）')
        .option('--desc <description>', '资源集描述（可选）')
        .action(async (projectRef, opts) => {
            try {
                if (!opts.set) throw new Error('必须提供 --set <resourceSet>');
                const client = createClient(project.opts());
                const { id } = await resolveProject(client, projectRef);
                await client.addProjectResourceSet(id, opts.set, opts.desc);
                console.log(`✓ 资源集 ${opts.set} 已链接到项目 ${projectRef}`);
            } catch (err) {
                console.error(`错误：${err.message}`);
                process.exit(1);
            }
        });

    project
        .command('update <project>')
        .description('修改项目（全量替换可变字段；未指定的字段会沿用项目当前值）。<project> 可传项目 id 或项目名')
        .option('--name <name>', '新的项目名称')
        .option('--type <type>', '项目类型（如 Json）')
        .option('--default-locale <locale>', '默认/源语言')
        .option('--locales <list>', '支持的语言列表，逗号分隔，如 zh,en,ja')
        .action(async (projectRef, opts) => {
            try {
                const client = createClient(project.opts());
                const { id } = await resolveProject(client, projectRef);
                // Read current values so omitted options are preserved (server does a full replace).
                const cur = await client.getProject(id);
                const dto = {
                    name: opts.name || cur.name,
                    type: opts.type || cur.type || 'Json',
                    defaultLocale: opts.defaultLocale || cur.defaultLocale || 'zh',
                    supportedLocales: opts.locales
                        ? String(opts.locales).split(',').map(s => s.trim()).filter(Boolean)
                        : (cur.supportedLocales || [])
                };
                await client.updateProject(id, dto);
                console.log(`✓ 项目 ${dto.name}（id=${id}）已更新`);
            } catch (err) {
                console.error(`错误：${err.message}`);
                process.exit(1);
            }
        });

    project
        .command('delete <project>')
        .description('删除项目及其资源集链接（不会删除资源分表中的数据）。<project> 可传项目 id 或项目名')
        .option('--yes', '跳过确认')
        .action(async (projectRef, opts) => {
            try {
                const client = createClient(project.opts());
                const { id, name } = await resolveProject(client, projectRef);
                if (!opts.yes) {
                    console.log(`将删除项目 ${name || projectRef}（id=${id}），加 --yes 确认执行`);
                    return;
                }
                await client.deleteProject(id);
                console.log(`✓ 项目 ${name || projectRef} 已删除`);
            } catch (err) {
                console.error(`错误：${err.message}`);
                process.exit(1);
            }
        });

    project
        .command('remove-set <project>')
        .description('把资源集从项目解除链接（不删除资源本身）')
        .option('--set <resourceSet>', '要解除链接的资源集名称')
        .action(async (projectRef, opts) => {
            try {
                if (!opts.set) throw new Error('必须提供 --set <resourceSet>');
                const client = createClient(project.opts());
                const { id } = await resolveProject(client, projectRef);
                await client.removeProjectResourceSet(id, opts.set);
                console.log(`✓ 资源集 ${opts.set} 已从项目 ${projectRef} 解除链接`);
            } catch (err) {
                console.error(`错误：${err.message}`);
                process.exit(1);
            }
        });
}

module.exports = register;
