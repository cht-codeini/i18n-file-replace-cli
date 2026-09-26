'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Minimal gitignore-style pattern matching with "last match wins" semantics.
 *
 * Supported syntax:
 *   - blank lines and lines starting with '#' are ignored
 *   - leading '!' negates (re-includes) a pattern
 *   - trailing '/' restricts to directories (approximated: also matches contents)
 *   - leading '/' anchors the pattern to the ignore file location
 *   - '*' matches any run of non-separator chars, '?' one char, '**' directory wildcards
 *
 * A rule set is { base, rules }: patterns are evaluated against paths relative
 * to `base`. Multiple rule sets are evaluated in order and the last matching
 * rule wins, so nested .gitignore files take precedence over shallower ones,
 * and a user ignore file evaluated last can override everything else.
 */

function escapeRegExpChar(c) {
    return c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compiles a single ignore line into a rule, or returns null for
 * blank/comment/empty lines.
 * @param {string} line
 * @returns {{negated: boolean, regex: RegExp}|null}
 */
function compileRule(line) {
    let p = line.replace(/\s+$/, '').replace(/\r$/, '');
    if (p === '' || p.startsWith('#')) return null;

    let negated = false;
    if (p.startsWith('!')) { negated = true; p = p.slice(1); }
    if (p.startsWith('\\')) p = p.slice(1); // escaped leading char (e.g. \# or \!)

    if (p.endsWith('/')) p = p.slice(0, -1); // directory-only marker
    if (p === '') return null;

    // a trailing '/**' is equivalent to matching everything inside
    if (p.endsWith('/**')) p = p.slice(0, -3);

    let anchored = false;
    if (p.startsWith('/')) { anchored = true; p = p.slice(1); }
    if (p === '') return null;

    const hasSlash = p.includes('/');

    // translate the glob into a regex body
    let body = '';
    let i = 0;
    const len = p.length;
    while (i < len) {
        const c = p[i];
        if (c === '*') {
            if (p[i + 1] === '*') {
                if (i === 0) body += '(?:.*/)?';            // leading **/
                else if (i + 2 === len) body += '(?:/.*)?'; // trailing /**
                else body += '(?:/.+)?';                    // middle /**/
                i += 2;
                continue;
            }
            body += '[^/]*';
        } else if (c === '?') {
            body += '[^/]';
        } else if (c === '/') {
            if (p[i + 1] === '*' && p[i + 2] === '*') { i++; continue; }
            body += '/';
        } else if (c === '\\') {
            i++;
            if (i < len) body += escapeRegExpChar(p[i]);
        } else {
            body += escapeRegExpChar(c);
        }
        i++;
    }
    if (body === '') return null;

    let regex;
    if (anchored || hasSlash || body.startsWith('(?:.*/)?')) {
        // path relative to the ignore file location (matches contents too)
        regex = new RegExp(`^${body}(?:/.*)?$`);
    } else {
        // basename pattern: matches at any level below the ignore file
        regex = new RegExp(`(^|/)${body}(/|$)`);
    }
    return { negated, regex };
}

/**
 * Loads an ignore file into a rule set.
 * @param {string} filePath path of the ignore file
 * @param {string} baseDir directory the patterns are relative to
 * @returns {{base: string, rules: Array}|null} null when the file cannot be read
 */
function loadRuleSet(filePath, baseDir) {
    let text;
    try {
        text = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
        return null;
    }
    // strip UTF-8 BOM (Windows editors often write one) so the first rule parses
    if (text.charCodeAt(0) === 0xfeff) {
        text = text.slice(1);
    }
    const rules = [];
    for (const line of text.split(/\r?\n/)) {
        const rule = compileRule(line);
        if (rule) rules.push(rule);
    }
    return { base: baseDir, rules };
}

/** @returns {boolean} true when any rule in the sets is a negation */
function hasNegation(ruleSets) {
    return ruleSets.some((rs) => rs.rules.some((r) => r.negated));
}

/**
 * Tests an absolute path against an ordered list of rule sets.
 * @param {Array<{base: string, rules: Array}>} ruleSets
 * @param {string} absPath
 * @returns {boolean|null} true = ignored, false = explicitly re-included, null = no rule matches
 */
function matchRuleSets(ruleSets, absPath) {
    let ignored = null;
    for (const rs of ruleSets) {
        const rel = path.relative(rs.base, absPath).split(path.sep).join('/');
        if (rel === '..' || rel.startsWith('../') || path.isAbsolute(rel)) continue;
        for (const rule of rs.rules) {
            if (rule.regex.test(rel)) {
                ignored = rule.negated ? false : true;
            }
        }
    }
    return ignored;
}

module.exports = { compileRule, loadRuleSet, matchRuleSets, hasNegation };
