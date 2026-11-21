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
    Constants: { BUILTIN_WHITELIST: ['input_helper_toolbar'], EXTENSION_NAME: 'qr-assistant', CLASS_ACTION_ITEM: 'action-item' },
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
        tagName: 'DIV', children: [], parentElement: null, isEqualNode() { return false; },
        classList: { contains: name => classes.has(name), add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)) },
        appendChild(child) { this.children.push(child); child.parentElement = this; },
        querySelectorAll(selector) {
            const matches = node => selector.split(',').some(part => {
                part = part.trim();
                if (part.startsWith('.')) return part.slice(1).split('.').every(name => node.classList.contains(name));
                if (part.startsWith('#')) return node.id === part.slice(1);
                const exact = part.match(/^\[id="(.*)"\]$/);
                if (exact) return node.id === exact[1];
                const prefix = part.match(/^\[id\^="(.*)"\]$/);
                if (prefix) return node.id.startsWith(prefix[1]);
                throw new Error(`Unhandled test selector: ${part}`);
            });
            const descendants = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
            return selector === '*' ? descendants : descendants.filter(matches);
        },
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    };
}
function check(element, whitelist, api, visible) {
    context.processElement(element, whitelist, api);
    assert.equal(element.classList.contains('qrq-whitelisted-original'), visible);
    assert.equal(element.classList.contains('qrq-hidden-by-plugin'), !visible);
}
// Exercise the complete pass: registered controls are handled by preprocessing.
// A registered script_container_* still belongs to the JSR namespace. Treating
// it as RawDomElement hides this parent, including any whitelisted control inside.
registry.push({ dom_id: 'script_container_st_phone_inline_reply' });
const body = element('body');
const qrBar = element('qr--bar');
body.appendChild(qrBar);
const phone = element('script_container_st_phone_inline_reply', 'qr--buttons');
const control = element('gai-qc-wrapper', 'qr--buttons');
const pencil = element('st-bottom-remote-edit-wrapper', 'qr--buttons');
qrBar.appendChild(phone);
phone.appendChild(control);
qrBar.appendChild(pencil);
const qrSettings = { enabled: true, whitelist: [] };
context.document = {
    body, getElementById: id => id === 'qr--bar' ? qrBar : body.querySelector(`#${id}`),
    querySelectorAll: selector => body.querySelectorAll(selector),
};
context.window = {
    SillyTavern: { getContext: () => ({ extensionSettings: { 'qr-assistant': qrSettings } }) },
    quickReplyApi: {},
};
const apply = () => vm.runInContext('applyWhitelistDOMChanges()', context);
qrSettings.whitelist = ['JSR::st_phone_inline_reply', 'gai-qc-wrapper', 'st-bottom-remote-edit-wrapper'];
apply();
for (const node of [phone, control, pencil]) {
    assert(node.classList.contains('qrq-whitelisted-original'), `${node.id} should be visible`);
    assert(!node.classList.contains('qrq-hidden-by-plugin'), `${node.id} should not hide nested controls`);
}
qrSettings.whitelist = ['JSR::st_phone_inline_reply'];
apply();
assert(!phone.classList.contains('qrq-hidden-by-plugin'));
assert(control.classList.contains('qrq-hidden-by-plugin'));
assert(pencil.classList.contains('qrq-hidden-by-plugin'));
qrSettings.enabled = false;
apply();
assert(!control.classList.contains('qrq-hidden-by-plugin'), 'Disabling QR restores original visibility');
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
console.log('Passed: module syntax, metadata, full whitelist pass, registered JSR parent/nested controls, disable restoration, quiet logging, sorting translations.');
