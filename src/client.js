'use strict';

const DEFAULT_BASE_URL = 'https://i18n.codeini.com';
const DEFAULT_EXTERNAL_PREFIX = '/api/external';

/**
 * Parses a comma-separated locale list (e.g. "en,ja") into a clean string array.
 * @param {string|string[]|undefined} value
 * @returns {string[]|undefined} undefined when nothing usable
 */
function parseLocales(value) {
    if (!value) return undefined;
    const list = (Array.isArray(value) ? value : String(value).split(','))
        .map(s => s.trim()).filter(Boolean);
    return list.length > 0 ? list : undefined;
}

/**
 * Minimal HTTP client for the i18n platform external API.
 * Uses the built-in fetch (Node.js >= 20), no third-party HTTP dependency.
 */
class ApiClient {
    /**
     * @param {object} [options]
     * @param {string} [options.baseUrl] API base URL (default: I18N_BASE_URL env or https://i18n.codeini.com)
     * @param {string} [options.apiKey] API key (default: I18N_API_KEY env)
     * @param {string} [options.accountId] Dev-mode AccountId override (default: I18N_ACCOUNT_ID env)
     * @param {string} [options.externalPrefix] External API path prefix (default: I18N_EXTERNAL_PREFIX env or /api/external; set empty when calling through the Gateway, whose ocelot route already maps /api/v1/i18n/{all} -> /api/external/{all})
     */
    constructor(options = {}) {
        this.baseUrl = (options.baseUrl || process.env.I18N_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
        this.apiKey = options.apiKey || process.env.I18N_API_KEY || '';
        this.accountId = options.accountId || process.env.I18N_ACCOUNT_ID || '';
        this.externalPrefix = options.externalPrefix ?? process.env.I18N_EXTERNAL_PREFIX ?? DEFAULT_EXTERNAL_PREFIX;
    }

    /**
     * Maps an internal /api/external/... path to the configured prefix
     * (e.g. '' for the Gateway entry which already rewrites to /api/external).
     * @param {string} path
     * @returns {string}
     */
    resolvePath(path) {
        if (this.externalPrefix === DEFAULT_EXTERNAL_PREFIX) return path;
        if (path === DEFAULT_EXTERNAL_PREFIX) return this.externalPrefix || '/';
        if (path.startsWith(DEFAULT_EXTERNAL_PREFIX + '/')) {
            return this.externalPrefix + path.slice(DEFAULT_EXTERNAL_PREFIX.length);
        }
        return path;
    }

    /**
     * Sends a JSON request to the external API.
     * @param {string} path API path, e.g. /api/external/i18n-file-replace
     * @param {object} [options] fetch options (method, body)
     * @returns {Promise<object>} parsed JSON response
     */
    async request(path, options = {}) {
        const headers = { ...(options.headers || {}) };
        if (this.apiKey) {
            headers['X-Api-Key'] = this.apiKey;
        }
        if (this.accountId) {
            headers['X-Dev-Account-Id'] = this.accountId;
        }
        if (options.body !== undefined) {
            headers['Content-Type'] = 'application/json';
        }

        path = this.resolvePath(path);
        let res;
        try {
            res = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
        } catch (err) {
            throw new Error(`无法连接到 ${this.baseUrl}：${err.message}`);
        }

        if (res.status === 401) {
            throw new Error('认证失败 (401)：请检查 API Key（--api-key 或环境变量 I18N_API_KEY）是否正确');
        }
        if (res.status === 404) {
            throw new Error(`资源不存在 (404)：${path}`);
        }
        if (!res.ok) {
            let message = await res.text();
            try {
                const body = JSON.parse(message);
                message = body.message || body.error || message;
            } catch {
                // keep raw text
            }
            throw new Error(`请求失败 (${res.status})：${message}`);
        }
        return res.json();
    }

    /**
     * Sends a request and returns the raw binary body together with the
     * content type and the filename parsed from Content-Disposition.
     * Used by the resource-export (download) endpoint.
     * @param {string} path API path (with query string)
     * @param {object} [options] fetch options (method, headers)
     * @returns {Promise<{buffer: Buffer, contentType: string, fileName: string|null}>}
     */
    async requestRaw(path, options = {}) {
        const headers = { ...(options.headers || {}) };
        if (this.apiKey) {
            headers['X-Api-Key'] = this.apiKey;
        }
        if (this.accountId) {
            headers['X-Dev-Account-Id'] = this.accountId;
        }

        path = this.resolvePath(path);
        let res;
        try {
            res = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
        } catch (err) {
            throw new Error(`无法连接到 ${this.baseUrl}：${err.message}`);
        }

        if (res.status === 401) {
            throw new Error('认证失败 (401)：请检查 API Key（--api-key 或环境变量 I18N_API_KEY）是否正确');
        }
        if (res.status === 404) {
            // 404 body may carry a JSON error message (e.g. empty resource set)
            let message = await res.text();
            try { message = JSON.parse(message).message || message; } catch { /* keep raw */ }
            throw new Error(`资源不存在 (404)：${message || path}`);
        }
        if (!res.ok) {
            let message = await res.text();
            try { message = JSON.parse(message).message || message; } catch { /* keep raw */ }
            throw new Error(`请求失败 (${res.status})：${message}`);
        }

        const buf = Buffer.from(await res.arrayBuffer());
        const contentType = res.headers.get('content-type') || '';
        let fileName = null;
        const cd = res.headers.get('content-disposition') || '';
        const m = /filename\*?="?([^";]+)"?/i.exec(cd);
        if (m) {
            try { fileName = decodeURIComponent(m[1].replace(/^UTF-8''/, '').replace(/"/g, '')); } catch { fileName = m[1]; }
        }
        return { buffer: buf, contentType, fileName };
    }

    /**
     * Replaces a single file content with i18n-ready code.
     * @param {object} payload { fileName, content, configJson?, profileName?, resourceSet?, translateTo?, translateProvider? }
     * @returns {Promise<{fileName: string, content: string, generatedKeys: object, keyCount: number, translatedCount?: number}>}
     */
    async replaceFile(payload) {
        return this.request('/api/external/i18n-file-replace', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    /**
     * Previews the replacement without side effects.
     * @param {object} payload { fileName, content, configJson?, profileName? }
     * @returns {Promise<{fileName, originalContent, content, generatedKeys, keyCount}>}
     */
    async preview(payload) {
        return this.request('/api/external/i18n-file-replace/preview', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    /**
     * Lists config profiles of the current account.
     * @returns {Promise<Array<{id: number, name: string, createdAt: string, updatedAt: string}>>}
     */
    async listProfiles() {
        return this.request('/api/external/i18n-config-profiles');
    }

    /**
     * Gets a config profile by name including its config JSON.
     * @param {string} name profile name
     * @returns {Promise<{id: number, name: string, configJson: string, createdAt: string, updatedAt: string}>}
     */
    async getProfile(name) {
        return this.request(`/api/external/i18n-config-profiles/${encodeURIComponent(name)}`);
    }

    /**
     * Creates or updates (upsert by name) a config profile on the server.
     * @param {string} name profile name
     * @param {string} configJson the config JSON string
     * @returns {Promise<{message: string, profile: object}>}
     */
    async saveProfile(name, configJson) {
        return this.request('/api/external/i18n-config-profiles', {
            method: 'POST',
            body: JSON.stringify({ name, configJson })
        });
    }

    /**
     * Deletes a config profile by name.
     * @param {string} name profile name
     * @returns {Promise<{message: string, name: string}>}
     */
    async deleteProfile(name) {
        return this.request(`/api/external/i18n-config-profiles/${encodeURIComponent(name)}`, {
            method: 'DELETE'
        });
    }

    /**
     * Exports a resource set as a file (single locale) or ZIP (multi locale / resx).
     * @param {object} params { resourceSet, format, locale? }
     * @returns {Promise<{buffer: Buffer, contentType: string, fileName: string|null}>}
     */
    async exportResources({ resourceSet, format = '.json', locale }) {
        const qs = new URLSearchParams({ resourceSet, format });
        if (locale) qs.set('locale', locale);
        return this.requestRaw(`/api/external/i18n-resources/export?${qs.toString()}`);
    }

    /**
     * Lists resource sets available to the current account.
     * @returns {Promise<string[]>}
     */
    async listResourceSets() {
        return this.request('/api/external/i18n-resources/sets');
    }

    /**
     * Lists the resource keys (resourceIds) in a resource set.
     * @param {string} resourceSet
     * @param {string} [projectId]
     * @returns {Promise<Array<{resourceId: string, hasValue: boolean}>>}
     */
    async listResourceKeys(resourceSet, projectId) {
        const qs = new URLSearchParams({ resourceSet });
        if (projectId) qs.set('projectId', projectId);
        return this.request(`/api/external/i18n-resources/keys?${qs.toString()}`);
    }

    /**
     * Creates or updates (upsert) a single resource key value.
     * @param {object} dto { resourceId, resourceSet, localeId, value, comment?, projectId? }
     */
    async upsertResource(dto) {
        return this.request('/api/external/i18n-resources/entry', {
            method: 'POST',
            body: JSON.stringify(dto)
        });
    }

    /**
     * Deletes a single resource key (all locales when localeId omitted).
     * @param {object} params { resourceId, resourceSet, localeId?, projectId? }
     */
    async deleteResource({ resourceId, resourceSet, localeId, projectId }) {
        const qs = new URLSearchParams({ resourceId, resourceSet });
        if (localeId) qs.set('localeId', localeId);
        if (projectId) qs.set('projectId', projectId);
        return this.request(`/api/external/i18n-resources/entry?${qs.toString()}`, {
            method: 'DELETE'
        });
    }

    /**
     * Deletes an entire resource set.
     * @param {string} resourceSet
     * @param {string} [projectId]
     */
    async deleteResourceSet(resourceSet, projectId) {
        const qs = new URLSearchParams({ resourceSet });
        if (projectId) qs.set('projectId', projectId);
        return this.request(`/api/external/i18n-resources/set?${qs.toString()}`, {
            method: 'DELETE'
        });
    }

    /**
     * Renames a resource key across all locales.
     * @param {object} params { resourceId, newResourceId, resourceSet, projectId? }
     */
    async renameResource({ resourceId, newResourceId, resourceSet, projectId }) {
        return this.request('/api/external/i18n-resources/rename', {
            method: 'POST',
            body: JSON.stringify({ resourceId, newResourceId, resourceSet, projectId })
        });
    }

    /**
     * Batch upsert of resource key values in one round-trip.
     * @param {Array<object>} resources list of { resourceId, resourceSet, localeId, value, comment?, projectId? }
     * @returns {Promise<{message: string, saved: number, failed: string[]}>}
     */
    async upsertResources(resources) {
        return this.request('/api/external/i18n-resources/entry/batch', {
            method: 'POST',
            body: JSON.stringify(resources)
        });
    }

    /**
     * Lists projects of the current account.
     * @returns {Promise<Array<{id: string, name: string, type: string, defaultLocale: string, supportedLocales: string[], resourceSetCount: number}>>}
     */
    async listProjects() {
        return this.request('/api/external/projects');
    }

    /**
     * Creates a project (idempotent by name on the server). Body fields are camelCase.
     * @param {object} dto { name, type?, defaultLocale?, supportedLocales? }
     * @returns {Promise<{id: string, name: string, type: string, defaultLocale: string, supportedLocales: string[]}>}
     */
    async createProject(dto) {
        return this.request('/api/external/projects', {
            method: 'POST',
            body: JSON.stringify(dto)
        });
    }

    /**
     * Resolves a project id by exact name (case-insensitive), creating it if missing.
     * @param {object} opts { name, type?, defaultLocale?, supportedLocales? }
     * @returns {Promise<{id: string, name: string}>}
     */
    async ensureProject(opts) {
        const created = await this.createProject({
            name: opts.name,
            type: opts.type || 'Json',
            defaultLocale: opts.defaultLocale || 'zh',
            supportedLocales: opts.supportedLocales || []
        });
        return created;
    }

    /**
     * Links a resource set to a project (idempotent on the server).
     * @param {string} projectId project GUID
     * @param {string} resourceSet resource set name
     * @param {string} [description]
     */
    async addProjectResourceSet(projectId, resourceSet, description) {
        return this.request(`/api/external/projects/${encodeURIComponent(projectId)}/resourcesets`, {
            method: 'POST',
            body: JSON.stringify({ resourceSet, description })
        });
    }

    /**
     * Gets a single project by id.
     * @param {string} projectId project GUID
     */
    async getProject(projectId) {
        return this.request(`/api/external/projects/${encodeURIComponent(projectId)}`);
    }

    /**
     * Updates an existing project (full replace of mutable fields).
     * @param {string} projectId project GUID
     * @param {object} dto { name, type?, defaultLocale?, supportedLocales? }
     */
    async updateProject(projectId, dto) {
        return this.request(`/api/external/projects/${encodeURIComponent(projectId)}`, {
            method: 'PUT',
            body: JSON.stringify(dto)
        });
    }

    /**
     * Deletes a project and its resource-set links.
     * @param {string} projectId project GUID
     */
    async deleteProject(projectId) {
        return this.request(`/api/external/projects/${encodeURIComponent(projectId)}`, {
            method: 'DELETE'
        });
    }

    /**
     * Unlinks a resource set from a project.
     * @param {string} projectId project GUID
     * @param {string} resourceSet resource set name
     */
    async removeProjectResourceSet(projectId, resourceSet) {
        return this.request(`/api/external/projects/${encodeURIComponent(projectId)}/resourcesets/${encodeURIComponent(resourceSet)}`, {
            method: 'DELETE'
        });
    }
}

/**
 * Creates an ApiClient from commander options.
 * @param {object} opts commander options (may include --base-url / --api-key)
 * @returns {ApiClient}
 */
function createClient(opts = {}) {
    return new ApiClient({ baseUrl: opts.baseUrl, apiKey: opts.apiKey, accountId: opts.accountId, externalPrefix: opts.externalPrefix });
}

/**
 * Resolves the effective config JSON string.
 * @param {string|undefined} config --config value (file path or inline JSON)
 * @param {string|undefined} profile --profile value
 * @returns {Promise<{configJson?: string, profileName?: string}>}
 */
async function resolveConfig(config, profile) {
    if (config && profile) {
        throw new Error('--config 与 --profile 不能同时使用');
    }
    if (config) {
        const trimmed = config.trim();
        if (trimmed.startsWith('{')) {
            // inline JSON
            try {
                JSON.parse(trimmed);
            } catch (err) {
                throw new Error(`无效的内联 JSON：${err.message}`);
            }
            return { configJson: trimmed };
        }
        const fs = require('fs');
        if (!fs.existsSync(config)) {
            throw new Error(`配置文件不存在：${config}`);
        }
        return { configJson: fs.readFileSync(config, 'utf8') };
    }
    if (profile) {
        return { profileName: profile };
    }
    throw new Error('必须提供 --config（配置文件路径或内联 JSON）或 --profile（已保存的配置名）');
}

/**
 * Reads a file as UTF-8 with friendly error handling.
 * @param {string} filePath
 * @returns {string}
 */
function readFileUtf8(filePath) {
    const fs = require('fs');
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (err) {
        throw new Error(`无法读取文件 ${filePath}：${err.message}`);
    }
}

module.exports = { ApiClient, createClient, resolveConfig, readFileUtf8, parseLocales, DEFAULT_BASE_URL, DEFAULT_EXTERNAL_PREFIX };
