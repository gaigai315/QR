import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

// Parse browser modules without running SillyTavern's browser imports.
for (const file of readdirSync('.').filter(name => name.endsWith('.js'))) {
    const result = spawnSync(process.execPath, ['--input-type=module', '--check'], {
        input: readFileSync(file, 'utf8'), encoding: 'utf8',
    });
    assert.equal(result.status, 0, `${file}: ${result.stderr}`);
}
JSON.parse(readFileSync('manifest.json', 'utf8'));

const source = readFileSync('whitelist.js', 'utf8');
const logs = [];
const registry = [{ dom_id: 'gai-qc-wrapper' }, { dom_id: 'st-bottom-remote-edit-wrapper' }];
const context = vm.createContext({
    Constants: { BUILTIN_WHITELIST: ['input_helper_toolbar'] },
    getThirdPartyRegistry: () => registry,
    LogCategory: { CORE: 'core', WHITELIST: 'whitelist' },
    Logger: Object.fromEntries(['debug', 'info', 'warn', 'error'].map(level =>
        [level, (...args) => logs.push({ level, args })])),
});
vm.runInContext(source.replace(/^import .*;\s*$/gm, '').replace(/^export /gm, ''), context);
function element(id, ...names) {
    const classes = new Set(names);
    return {
        id, className: names.join(' '), innerHTML: '', outerHTML: `<div id="${id}"></div>`,
        tagName: 'DIV', children: [], isEqualNode() { return false; },
        classList: { contains: name => classes.has(name), add: name => classes.add(name), remove: name => classes.delete(name) },
    };
}
function check(element, whitelist, api, visible) {
    context.processElement(element, whitelist, api);
    assert.equal(element.classList.contains('qrq-whitelisted-original'), visible);
    assert.equal(element.classList.contains('qrq-hidden-by-plugin'), !visible);
}
// Registered .qr--buttons must be treated as third-party controls, not QR sets.
for (const entry of registry) {
    const button = element(entry.dom_id, 'qr--buttons');
    check(button, [entry.dom_id], {}, true);
    check(button, [], {}, false);
    check(button, [entry.dom_id], {}, true);
}
const jsr = element('script_container_example', 'qr--buttons');
check(jsr, ['JSR::example'], {}, true);
check(jsr, [], {}, false);
check(element('input_helper_toolbar'), [], {}, true);
const set = element('qr-set', 'qr--buttons');
const api = { settings: { config: { setList: [{ set: { dom: set, name: 'Example' } }] } } };
check(set, ['QRV2::Example'], api, true);
check(set, [], api, false);
context.processElement(element('third-party-unknown', 'qr--buttons'), [], {});
assert.equal(logs.filter(log => log.level !== 'debug').length, 0,
    'Routine whitelist scans must not produce info/warning/error spam');

// Both sort-setting entry points must keep the enabled translation attribute.
const settings = readFileSync('settings.js', 'utf8');
for (const button of ['sortBtn', 'mainSortBtn']) {
    assert.match(settings, new RegExp(`${button}\\.setAttribute\\(['"]data-i18n['"],\\s*['"]qra_sort_btn_enabled['"]\\)`),
        `${button} must preserve the fork's sorting translation fix`);
}
console.log('Passed: module syntax, metadata, third-party/JSR/QR whitelist transitions, quiet logging, sorting translations.');
