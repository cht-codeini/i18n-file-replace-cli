'use strict';

const fs = require('fs');
const path = require('path');
const { createClient } = require('../client');
const { addCommonOptions } = require('./common');
const { extractZip } = require('../zip');

/**
 * Registers the `download` command: fetch exported i18n resources from the platform.
 * @param {import('commander').Command} program
 */
function register(program) {
    addCommonOptions(
        program
            .command('download')
            .description('下载平台上的多语言资源（i18n-file-replace 批量替换时写入服务端的 key）')
            .option('--resource-set <set>', '要导出的资源集名称（批量替换时 --resource-set 写入的那个）')
            .option('--format <fmt>', '导出格式：.json / .resx / .po / .yaml', '.json')
            .option('--locale <locale>', '仅导出指定语言（缺省导出全部；多语言或 .resx 时返回 ZIP）')
            .option('--out-dir <dir>', '输出目录（必填），单文件直接写入，ZIP 自动解压到该目录')
            .option('--list-sets', '仅列出当前账号可用的资源集，不下载')
    ).action(async (opts) => {
        try {
            const client = createClient(opts);

            if (opts.listSets) {
                const sets = await client.listResourceSets();
                if (!sets || sets.length === 0) {
                    console.log('当前账号没有可用的资源集');
                    return;
                }
                console.log('可用资源集：');
                sets.forEach(s => console.log(`  - ${s}`));
                return;
            }

            if (!opts.resourceSet) {
                throw new Error('必须提供 --resource-set（或使用 --list-sets 查看可用资源集）');
            }
            if (!opts.outDir) {
                throw new Error('必须提供 --out-dir（资源输出目录）');
            }

            const format = opts.format.startsWith('.') ? opts.format : `.${opts.format}`;
            const { buffer, contentType, fileName } = await client.exportResources({
                resourceSet: opts.resourceSet,
                format,
                locale: opts.locale
            });

            fs.mkdirSync(opts.outDir, { recursive: true });
            const isZip = contentType.includes('application/zip')
                || (fileName && fileName.toLowerCase().endsWith('.zip'))
                || buffer.subarray(0, 2).toString('latin1') === 'PK';

            if (isZip) {
                const extracted = extractZip(buffer, opts.outDir);
                console.log(`已解压 ${extracted.length} 个文件到 ${opts.outDir}：`);
                extracted.forEach(f => console.log(`  - ${f}`));
            } else {
                const outName = fileName || `${opts.resourceSet}${opts.locale ? '.' + opts.locale : ''}${format}`;
                const target = path.join(opts.outDir, path.basename(outName));
                fs.writeFileSync(target, buffer);
                console.log(`已写入 ${target}`);
            }
        } catch (err) {
            console.error(`错误：${err.message}`);
            process.exit(1);
        }
    });
}

module.exports = register;
