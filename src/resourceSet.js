'use strict';

const path = require('path');

const GUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * First-level subdirectory name from a scan-root-relative path.
 * "setting/area/list.vue" -> "setting"; "order/list.vue" -> "order";
 * a file at the scan root (no subdir) -> "".
 * @param {string} relPath path relative to the scan root (may use / or \)
 * @returns {string}
 */
function firstLevelSubDirName(relPath) {
    const posixRel = relPath.split(path.sep).join('/');
    const parts = posixRel.split('/').filter(Boolean);
    // parts[0] is the first segment; if it's a directory (not the filename), return it.
    // For "order/list.vue" -> parts=['order','list.vue'] -> 'order'
    // For "config.vue" -> parts=['config.vue'] -> '' (file at root, no subdir)
    if (parts.length <= 1) return '';
    return parts[0];
}

/**
 * Resolves the resource set name for a file.
 * - Default (single set): the --resource-set value.
 * - --resource-set-by-dir: base + first-level subdirectory, e.g. "portal.setting".
 * @param {object} opts parsed commander options
 * @param {string} relPath file path relative to the scan root
 * @returns {string|undefined}
 */
function resolveResourceSet(opts, relPath) {
    const base = opts.resourceSet;
    if (opts.resourceSetByDir) {
        const dirName = firstLevelSubDirName(relPath);
        if (base && dirName) return `${base}.${dirName}`;
        return base || undefined;
    }
    return base;
}

/**
 * Validates the resource-set / project related options up front.
 * @param {object} opts
 */
function validateOptions(opts) {
    if (opts.resourceSetByDir && !opts.resourceSet) {
        throw new Error('--resource-set-by-dir 需要同时提供 --resource-set 作为 base 前缀（用于区分不同子项目）');
    }
}

/**
 * Resolves a --project value (GUID or exact name) to a project id, listing projects when
 * a name is given. Throws a friendly error when a name is not found.
 * @param {import('./client').ApiClient} client
 * @param {string} idOrName
 * @returns {Promise<string>} project id
 */
async function resolveProjectId(client, idOrName) {
    if (GUID_RE.test(idOrName)) return idOrName;
    const list = await client.listProjects();
    const hit = list.find(p => (p.name || '').toLowerCase() === idOrName.toLowerCase());
    if (!hit) {
        throw new Error(`未找到项目「${idOrName}」，请先执行：i18n-replace project create ${idOrName}`);
    }
    return hit.id;
}

/**
 * Ensures the given resource sets are linked to the project (idempotent, de-duplicated).
 * Called before writing so resources land in the project's shard table.
 * @param {import('./client').ApiClient} client
 * @param {string} projectId
 * @param {string[]} sets
 * @returns {Promise<Set<string>>} the sets that were newly linked (for logging)
 */
async function linkSets(client, projectId, sets) {
    const linked = new Set();
    const seen = new Set();
    for (const set of sets) {
        if (!set || seen.has(set)) continue;
        seen.add(set);
        await client.addProjectResourceSet(projectId, set);
        linked.add(set);
    }
    return linked;
}

module.exports = { firstLevelSubDirName, resolveResourceSet, validateOptions, resolveProjectId, linkSets };
