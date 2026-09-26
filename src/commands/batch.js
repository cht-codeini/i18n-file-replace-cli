'use strict';

const path = require('path');
const { createClient, resolveConfig, readFileUtf8, parseLocales } = require('../client');
const { addCommonOptions } = require('./common');
const { DEFAULT_EXTS, parseExtensions, collectFiles, writeInPlace, writeToDir } = require('../files');
const { resolveResourceSet, validateOptions, resolveProjectId, linkSets } = require('../resourceSet');

/**
 * Registers the `batch` command.
 * @param {import('commander').Command} program
 */
function register(program) {
    addCommonOptions(
        program
            .command('batch <dir>')
            .description('递归批量替换目录下的代码文件（跳过 node_modules/.git/dist/bin/obj）。用 --in-place 直接覆盖原文件，或用 --out-dir 输出到新目录')
            .option('--config <config>', '配置文件路径或内联 JSON（与 --profile 二选一）')
            .option('--profile <name>', '使用平台上已保存的配置名（与 --config 二选一）')
            .option('--ext <exts>', '处理的扩展名列表，逗号分隔，如 .vue,.js,.ts,.cs', DEFAULT_EXTS)
            .option('--resource-set <set>', '将生成的 key 写入该资源集（写入平台数据库）')
            .option('--resource-set-by-dir', '以base下第一级子目录为单位维护资源集：每个文件按 <base:--resource-set>.<第一级子目录名> 生成（如 portal.setting），需同时提供 --resource-set 作为 base 前缀')
            .option('--translate-to <locales>', '配合 --resource-set：写入源语言后把每个生成的 key 机翻到这些目标语言（逗号分隔，如 en 或 en,ja），译文同步写入资源库')
            .option('--translate-provider <name>', '机翻提供方（缺省用平台默认提供方）', process.env.I18N_TRANSLATE_PROVIDER)
            .option('--project <id|name>', '把用到的资源集链接到该项目（可传项目 id 或项目名；项目决定资源进入哪张分表并被该账号隔离）')
            .option('--dry-run', '仅列出将处理的文件，不调用 API')
            .option('--in-place', '直接覆盖原文件（默认先生成 .bak 备份，--no-backup 关闭）；与 --out-dir 二选一')
            .option('--no-backup', '--in-place 覆盖时不生成 .bak 备份')
            .option('--out-dir <dir>', '输出目录（保留相对目录结构），不修改原文件；缺省不落盘')
            .option('--gitignore', '读取 .gitignore 忽略文件（含子目录嵌套、! 否定）')
            .option('--i18nignore [path]', '使用自定义忽略文件（gitignore 语法）；缺省自动读取扫描根目录的 .i18nreplaceignore')
    ).action(async (dir, opts) => {
        try {
            if (opts.inPlace && opts.outDir) {
                throw new Error('--in-place 与 --out-dir 不能同时使用');
            }
            if (opts.translateTo && !opts.resourceSet) {
                throw new Error('--translate-to 需要同时提供 --resource-set（翻译结果写入该资源集）');
            }
            opts.translateToList = parseLocales(opts.translateTo);

            const client = createClient(opts);
            const extensions = parseExtensions(opts.ext);
            const files = collectFiles(dir, extensions, {
                gitignore: opts.gitignore,
                i18nIgnoreFile: typeof opts.i18nignore === 'string' ? opts.i18nignore : undefined
            });
            if (files.length === 0) {
                console.log('没有匹配的文件');
                return;
            }

            const { configJson, profileName } = await resolveConfig(opts.config, opts.profile);
            validateOptions(opts);
            
            // Per-file resource set mapping
            const setFor = new Map(files.map(f => [f, resolveResourceSet(opts, path.relative(dir, f))]));
            
            console.log(`发现 ${files.length} 个文件，开始处理...`);

            // Resolve the project and link all distinct resource sets to it before writing,
            // so the generated keys land in the project's shard table (skipped on dry-run).
            if (opts.project && !opts.dryRun) {
                const distinctSets = [...new Set([...setFor.values()].filter(Boolean))];
                if (distinctSets.length > 0) {
                    const projectId = await resolveProjectId(client, opts.project);
                    await linkSets(client, projectId, distinctSets);
                    console.log(`已将 ${distinctSets.length} 个资源集链接到项目 ${opts.project}`);
                }
            }

            let ok = 0;
            let failed = 0;
            let totalKeys = 0;
            let totalTranslated = 0;
            for (const file of files) {
                const rel = path.relative(dir, file);
                if (opts.dryRun) {
                    console.log(`[dry-run] ${rel}`);
                    ok++;
                    continue;
                }
                try {
                    const content = readFileUtf8(file);
                    const result = await client.replaceFile({
                        fileName: path.basename(file),
                        content,
                        configJson,
                        profileName,
                        resourceSet: setFor.get(file),
                        translateTo: opts.translateToList,
                        translateProvider: opts.translateProvider
                    });
                    if (opts.inPlace) {
                        writeInPlace(file, result.content, { backup: !opts.noBackup });
                    } else if (opts.outDir) {
                        writeToDir(opts.outDir, rel, result.content);
                    }
                    totalKeys += result.keyCount;
                    totalTranslated += result.translatedCount || 0;
                    const transInfo = result.translatedCount ? `，翻译 ${result.translatedCount} 条` : '';
                    console.log(`✓ ${rel}（${result.keyCount} 个 key${transInfo}）`);
                    ok++;
                } catch (err) {
                    failed++;
                    console.error(`✗ ${rel}：${err.message}`);
                }
            }

            let suffix = opts.dryRun ? '（dry-run，未调用 API）' : '';
            if (!opts.dryRun) {
                if (opts.inPlace) {
                    suffix += '（已覆盖原文件' + (opts.noBackup ? '，无备份）' : '，带 .bak 备份）');
                } else if (opts.outDir) {
                    suffix += `（已写入 ${opts.outDir}）`;
                } else {
                    suffix += '（未指定 --in-place/--out-dir，结果未写入磁盘）';
                }
            }
            console.log(`\n完成：成功 ${ok}，失败 ${failed}，生成 key ${totalKeys} 个${totalTranslated ? `，翻译 ${totalTranslated} 条` : ''}${suffix}`);
            if (failed > 0) {
                process.exitCode = 1;
            }
        } catch (err) {
            console.error(`错误：${err.message}`);
            process.exit(1);
        }
    });
}

module.exports = register;
