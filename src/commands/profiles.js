'use strict';

const fs = require('fs');
const { createClient } = require('../client');
const { addCommonOptions } = require('./common');

/**
 * Registers the `profiles` command group.
 * @param {import('commander').Command} program
 */
function register(program) {
    const profiles = program
        .command('profiles')
        .description('管理 i18n 替换配置（config profiles）');
    addCommonOptions(profiles);

    profiles
        .command('list')
        .description('列出当前账号的所有配置')
        .action(async () => {
            try {
                const client = createClient(profiles.opts());
                const list = await client.listProfiles();
                if (list.length === 0) {
                    console.log('（暂无配置，可先在平台界面上创建）');
                    return;
                }
                for (const p of list) {
                    console.log(`${p.id}\t${p.name}\t${p.updatedAt || ''}`);
                }
            } catch (err) {
                console.error(`错误：${err.message}`);
                process.exit(1);
            }
        });

    profiles
        .command('get <name>')
        .description('按名称获取配置详情（含 configJson）')
        .action(async (name) => {
            try {
                const client = createClient(profiles.opts());
                const p = await client.getProfile(name);
                const output = {
                    id: p.id,
                    name: p.name,
                    createdAt: p.createdAt,
                    updatedAt: p.updatedAt,
                    configJson: JSON.parse(p.configJson)
                };
                console.log(JSON.stringify(output, null, 2));
            } catch (err) {
                console.error(`错误：${err.message}`);
                process.exit(1);
            }
        });

    profiles
        .command('save <name>')
        .description('保存配置到服务端（按名幂等 upsert：已存在则更新，不存在则创建）')
        .option('--config <path|json>', '配置文件路径或内联 JSON（必填）')
        .action(async (name, opts) => {
            try {
                const config = opts.config;
                if (!config) throw new Error('必须提供 --config <path|json>');
                // Resolve config: file path or inline JSON
                let configJson;
                if (config.trimStart().startsWith('{')) {
                    configJson = config;
                } else {
                    if (!fs.existsSync(config)) throw new Error(`配置文件不存在：${config}`);
                    configJson = fs.readFileSync(config, 'utf8');
                }
                // Validate JSON
                JSON.parse(configJson);

                const client = createClient(profiles.opts());
                const result = await client.saveProfile(name, configJson);
                console.log(`✓ ${result.message}：${result.profile.name}（id=${result.profile.id}）`);
            } catch (err) {
                console.error(`错误：${err.message}`);
                process.exit(1);
            }
        });

    profiles
        .command('delete <name>')
        .description('按名称删除服务端配置')
        .action(async (name) => {
            try {
                const client = createClient(profiles.opts());
                await client.deleteProfile(name);
                console.log(`✓ 配置 ${name} 已删除`);
            } catch (err) {
                console.error(`错误：${err.message}`);
                process.exit(1);
            }
        });
}

module.exports = register;
