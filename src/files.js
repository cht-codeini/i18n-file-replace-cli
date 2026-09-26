'use strict';

const fs = require('fs');
const path = require('path');
const { loadRuleSet, matchRuleSets, hasNegation } = require('./ignore');

/** Directories skipped during recursive traversal. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'bin', 'obj']);

/** Default extensions for directory mode. */
const DEFAULT_EXTS = '.vue,.js,.ts,.cs';

/**
 * Parses a comma-separated extension list into a normalized Set.
 * @param {string|undefined} extArg e.g. ".vue,.js,.ts,.cs" or "vue,js"
 * @returns {Set<string>} lower-cased extensions including the dot
 */
function parseExtensions(extArg) {
    return new Set(
        (extArg || DEFAULT_EXTS)
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean)
            .map((s) => (s.startsWith('.') ? s : `.${s}`))
    );
}

/**
 * Recursively collects files under a directory matching the given extensions.
 *
 * Ignore rules (all optional, gitignore syntax):
 *   - `gitignore: true` reads .gitignore files from the scan root and every
 *     nested directory (deeper files take precedence).
 *   - a `.i18nreplaceignore` file in the scan root is loaded automatically,
 *     unless `i18nIgnoreFile` points to a custom file. Its rules are evaluated
 *     last, so they can override .gitignore (e.g. re-include with `!`).
 *   - SKIP_DIRS (node_modules/.git/dist/bin/obj) are always skipped and cannot
 *     be re-included.
 *
 * @param {string} dir root directory
 * @param {Set<string>} extensions lower-cased extensions including the dot
 * @param {object} [options]
 * @param {boolean} [options.gitignore=false] read .gitignore files
 * @param {string} [options.i18nIgnoreFile] custom ignore file path (replaces
 *        the auto-discovered `.i18nreplaceignore`)
 * @returns {string[]} absolute file paths
 */
function collectFiles(dir, extensions, options = {}) {
    const { gitignore = false, i18nIgnoreFile } = options;

    // user-defined ignore file: explicit --i18nignore path, or auto-discovered
    // .i18nreplaceignore in the scan root; evaluated last so it can override
    // .gitignore rules
    let userSet = null;
    if (typeof i18nIgnoreFile === 'string') {
        if (!fs.existsSync(i18nIgnoreFile)) {
            throw new Error(`忽略文件不存在：${i18nIgnoreFile}`);
        }
        userSet = loadRuleSet(i18nIgnoreFile, dir);
    } else {
        const auto = path.join(dir, '.i18nreplaceignore');
        if (fs.existsSync(auto)) {
            userSet = loadRuleSet(auto, dir);
        }
    }

    const files = [];
    const walk = (current, parentChain) => {
        let chain = parentChain;
        if (gitignore) {
            const nested = loadRuleSet(path.join(current, '.gitignore'), current);
            if (nested) {
                chain = [...parentChain, nested];
            }
        }
        const ruleSets = userSet ? [...chain, userSet] : chain;
        const mayReinclude = hasNegation(ruleSets);

        let entries;
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch (err) {
            throw new Error(`无法读取目录 ${current}：${err.message}`);
        }
        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                if (SKIP_DIRS.has(entry.name)) {
                    continue;
                }
                // skip the subtree unless a negation could re-include something
                if (matchRuleSets(ruleSets, fullPath) === true && !mayReinclude) {
                    continue;
                }
                walk(fullPath, chain);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (extensions.size > 0 && !extensions.has(ext)) {
                    continue;
                }
                if (matchRuleSets(ruleSets, fullPath) === true) {
                    continue;
                }
                files.push(fullPath);
            }
        }
    };
    walk(dir, []);
    return files;
}

/**
 * Overwrites a file in place, optionally keeping a .bak backup of the original.
 * @param {string} filePath absolute path of the file to overwrite
 * @param {string} content new content
 * @param {object} [options]
 * @param {boolean} [options.backup=true] copy the original to <file>.bak first
 */
function writeInPlace(filePath, content, { backup = true } = {}) {
    if (backup) {
        fs.copyFileSync(filePath, `${filePath}.bak`);
    }
    fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Writes content under an output directory, preserving the relative path.
 * @param {string} outDir output root directory
 * @param {string} relativePath path relative to the source root
 * @param {string} content new content
 */
function writeToDir(outDir, relativePath, content) {
    const outPath = path.join(outDir, relativePath);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, content, 'utf8');
}

module.exports = { SKIP_DIRS, DEFAULT_EXTS, parseExtensions, collectFiles, writeInPlace, writeToDir };
