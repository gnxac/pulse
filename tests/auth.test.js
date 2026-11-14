/* auth.js: outra pessoa no mesmo navegador não herda o "continuar de onde parei". Rodar: node tests/auth.test.js */
'use strict';
const fs = require('fs'), vm = require('vm'), assert = require('assert');

let salvou = 0;
const MQ = { esc: s => String(s), local: {}, saveLocal: () => { salvou++; } };
vm.runInNewContext(fs.readFileSync(__dirname + '/../www/js/auth.js', 'utf8'), { window: { MQ }, document: {}, console });

// Primeira vez neste navegador: só registra de quem é
MQ.local = { last: 'x', progress: { a: 1 } };
MQ.auth.adopt({ id: 7 });
assert.strictEqual(MQ.local.owner, 7);
assert.strictEqual(MQ.local.last, 'x', 'sem dono anterior, nada é apagado');

// A mesma pessoa de novo: nada muda
MQ.auth.adopt({ id: 7 });
assert.strictEqual(MQ.local.last, 'x');
assert.deepStrictEqual(MQ.local.progress, { a: 1 });

// Outra pessoa: o ponto de "continuar", o progresso das listas e o último backup não valem para ela
MQ.local.lastBackup = 123; MQ.local.theme = 'dark';
MQ.auth.adopt({ id: 8 });
assert.strictEqual(MQ.local.owner, 8);
assert.strictEqual(MQ.local.last, undefined);
assert.strictEqual(MQ.local.progress, undefined);
assert.strictEqual(MQ.local.lastBackup, undefined);
assert.strictEqual(MQ.local.theme, 'dark', 'preferência do aparelho continua');
assert.ok(salvou >= 3);

assert.strictEqual(MQ.auth.roleLabel({ role: 'admin' }), 'Administrador');
assert.strictEqual(MQ.auth.roleLabel({ role: 'estudante' }), 'Estudante');
assert.ok(/Configurações › Dados e backup/.test(MQ.auth.PRIVACY));
console.log('auth: ok');
