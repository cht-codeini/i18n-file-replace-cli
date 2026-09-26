'use strict';

const path = require('path');
const { createClient, resolveConfig, readFileUtf8 } = require('../client');
const { addCommonOptions } = require('./common');

/**
 * Registers the `preview` command.
 * @param {import('commander').Command} program
 */
function register(program) {
    addCommonOptions(
        program
            .command('preview <file>')
            .description('预览替换结果（输出包含 originalContent/generatedKeys 的 JSON，不写库）')
            .option('--config <config>', '配置文件路径或内联 JSON（与 --profile 二选一）')
            .option('--profile <name>', '使用平台上已保存的配置名（与 --config 二选一）')
    ).action(async (file, opts) => {
        try {
            const client = createClient(opts);
            const content = readFileUtf8(file);
            const { configJson, profileName } = await resolveConfig(opts.config, opts.profile);

            const result = await client.preview({
                fileName: path.basename(file),
                content,
                configJson,
                profileName
            });

            console.log(JSON.stringify(result, null, 2));
        } catch (err) {
            console.error(`错误：${err.message}`);
            process.exit(1);
        }
    });
}

module.exports = register;
