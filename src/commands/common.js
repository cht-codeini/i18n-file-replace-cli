'use strict';

const { DEFAULT_BASE_URL, DEFAULT_EXTERNAL_PREFIX } = require('../client');

/**
 * Adds the shared --base-url / --api-key / --account-id / --external-prefix options to a commander command.
 * @param {import('commander').Command} command
 * @returns {import('commander').Command}
 */
function addCommonOptions(command) {
    return command
        .option('--base-url <url>', `API 基础地址（默认 ${DEFAULT_BASE_URL}，可用环境变量 I18N_BASE_URL 覆盖）`)
        .option('--api-key <key>', 'API Key（默认取环境变量 I18N_API_KEY）')
        .option('--account-id <id>', '开发模式租户 ID（默认取环境变量 I18N_ACCOUNT_ID，发送 X-Dev-Account-Id 头）')
        .option('--external-prefix <prefix>', `外部 API 路径前缀（默认 ${DEFAULT_EXTERNAL_PREFIX}；经 Gateway 计费入口时置空，如 --external-prefix "" 或 I18N_EXTERNAL_PREFIX=）`);
}

module.exports = { addCommonOptions };
