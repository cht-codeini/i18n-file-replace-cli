'use strict';

const fs = require('fs');
const path = require('path');
const { createClient, resolveConfig, readFileUtf8, parseLocales } = require('../client');
const { addCommonOptions } = require('./common');
const { DEFAULT_EXTS, parseExtensions, collectFiles, writeInPlace, writeToDir } = require('../files');
const { resolveResourceSet, validateOptions, resolveProjectId, linkSets } = require('../resourceSet');

/**
 * Registers the `replace` command.
 * @param {import('commander').Command} program
 */
function register(program) {
    addCommonOptions(
        program
            .command('replace <path>')
            .description('将单个文件或整个目录的代码替换为 i18n 版本。文件模式无 --out 时输出到 stdout；目录模式需 --in-place 或 --out-dir')
            .option('--config <config>', '配置文件路径或内联 JSON（与 --profile 二选一）')
            .option('--profile <name>', '使用平台上已保存的配置名（与 --config 二选一）')
            .option('--resource-set <set>', '将生成的 key 写入该资源集（写入平台数据库）')
            .option('--resource-set-by-dir', '目录模式：以base下第一级子目录为单位维护资源集，每个文件按 <base:--resource-set>.<第一级子目录名> 生成（如 portal.setting）')
            .option('--translate-to <locales>', '配合 --resource-set：写入源语言后把每个生成的 key 机翻到这些目标语言（逗号分隔，如 en 或 en,ja），译文同步写入资源库')
            .option('--translate-provider <name>', '机翻提供方（缺省用平台默认提供方）', process.env.I18N_TRANSLATE_PROVIDER)
            .option('--project <id|name>', '把用到的资源集链接到该项目（可传项目 id 或项目名）')
            .option('--out <path>', '文件模式：输出文件路径，缺省输出到 stdout')
            .option('--in-place', '目录模式：直接覆盖原文件（默认先生成 .bak 备份，--no-backup 关闭）')
            .option('--no-backup', '目录模式：--in-place 覆盖时不生成 .bak 备份')
            .option('--out-dir <dir>', '目录模式：输出到该目录（保留相对目录结构），不修改原文件')
            .option('--ext <exts>', '目录模式：处理的扩展名列表，逗号分隔', DEFAULT_EXTS)
            .option('--gitignore', '目录模式：读取 .gitignore 忽略文件（含子目录嵌套、! 否定）')
            .option('--i18nignore [path]', '目录模式：使用自定义忽略文件（gitignore 语法）；缺省自动读取扫描根目录的 .i18nreplaceignore')
    ).action(async (pathArg, opts) => {
        try {
            if (opts.inPlace && opts.outDir) {
                throw new Error('--in-place 与 --out-dir 不能同时使用');
            }
            if (opts.translateTo && !opts.resourceSet) {
                throw new Error('--translate-to 需要同时提供 --resource-set（翻译结果写入该资源集）');
            }
            opts.translateToList = parseLocales(opts.translateTo);

            const client = createClient(opts);
            const { configJson, profileName } = await resolveConfig(opts.config, opts.profile);

            const stats = fs.statSync(pathArg);
            if (stats.isDirectory()) {
                await replaceDirectory(client, pathArg, opts, { configJson, profileName });
            } else {
                await replaceFile(client, pathArg, opts, { configJson, profileName });
            }
        } catch (err) {
            console.error(`错误：${err.message}`);
            process.exit(1);
        }
    });
}

/**
 * Replaces a single file (stdout or --out).
 */
async function replaceFile(client, file, opts, { configJson, profileName }) {
    // Link the single resource set to the project (when provided) before writing.
    if (opts.project && opts.resourceSet) {
        const projectId = await resolveProjectId(client, opts.project);
        await linkSets(client, projectId, [opts.resourceSet]);
    }
    const content = readFileUtf8(file);
    const result = await client.replaceFile({
        fileName: path.basename(file),
        content,
        configJson,
        profileName,
        resourceSet: opts.resourceSet,
        translateTo: opts.translateToList,
        translateProvider: opts.translateProvider
    });

    const transInfo = result.translatedCount ? `，翻译 ${result.translatedCount} 条` : '';
    if (opts.out) {
        fs.writeFileSync(opts.out, result.content, 'utf8');
        console.log(`已写入 ${opts.out}（生成 ${result.keyCount} 个 key${transInfo}）`);
    } else {
        process.stdout.write(result.content);
        if (!result.content.endsWith('\n')) {
            process.stdout.write('\n');
        }
        console.error(`[info] 生成 ${result.keyCount} 个 key${transInfo}`);
    }
}

/**
 * Replaces all matching code files under a directory (in place or to --out-dir).
 */
async function replaceDirectory(client, dir, opts, { configJson, profileName }) {
    if (!opts.inPlace && !opts.outDir) {
        throw new Error('目录模式必须指定 --in-place（覆盖原文件，带 .bak 备份）或 --out-dir（输出到新目录）');
    }
    validateOptions(opts);

    const extensions = parseExtensions(opts.ext);
    const files = collectFiles(dir, extensions, {
        gitignore: opts.gitignore,
        i18nIgnoreFile: typeof opts.i18nignore === 'string' ? opts.i18nignore : undefined
    });
    if (files.length === 0) {
        console.log('没有匹配的文件');
        return;
    }

    // Per-file resource set (single or per-directory).
    const setFor = new Map(files.map(f => [f, resolveResourceSet(opts, path.relative(dir, f))]))

    // Resolve project and link distinct sets before writing.
    if (opts.project) {
        const distinctSets = [...new Set([...setFor.values()].filter(Boolean))];
        if (distinctSets.length > 0) {
            const projectId = await resolveProjectId(client, opts.project);
            await linkSets(client, projectId, distinctSets);
            console.log(`已将 ${distinctSets.length} 个资源集链接到项目 ${opts.project}`);
        }
    }

    console.log(`发现 ${files.length} 个文件，开始处理...`);
    let ok = 0;
    let failed = 0;
    let totalKeys = 0;
    for (const file of files) {
        const rel = path.relative(dir, file);
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
            } else {
                writeToDir(opts.outDir, rel, result.content);
            }
            totalKeys += result.keyCount;
            const transInfo = result.translatedCount ? `，翻译 ${result.translatedCount} 条` : '';
            console.log(`✓ ${rel}（${result.keyCount} 个 key${transInfo}）`);
            ok++;
        } catch (err) {
            failed++;
            console.error(`✗ ${rel}：${err.message}`);
        }
    }

    const mode = opts.inPlace ? '已覆盖原文件' : `已写入 ${opts.outDir}`;
    console.log(`\n完成：成功 ${ok}，失败 ${failed}，生成 key ${totalKeys} 个（${mode}）`);
    if (failed > 0) {
        process.exitCode = 1;
    }
}

module.exports = register;
