/* Teste da mesclagem de sincronização (db.js) entre versões antiga e nova.
   Rodar: node tests/mesclagem.test.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let t = 1000;
const store = {};
const ctx = {
  console,
  localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } },
  setTimeout: () => 0, clearTimeout: () => {},
  addEventListener: () => {}, document: { addEventListener: () => {} }
};
ctx.window = ctx;
ctx.MQ = { uid: () => 'id' + (++t), now: () => ++t };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../www/js/db.js'), 'utf8'), ctx);
const MQ = ctx.MQ;
const fresh = () => { MQ.data = JSON.parse(JSON.stringify(MQ.data)); Object.keys(MQ.data).forEach(k => { if (typeof MQ.data[k] === 'object') MQ.data[k] = {}; }); MQ.data.counter = 0; };

// 1. Dados vazios já trazem as coleções novas
['questions', 'attempts', 'folders', 'lists', 'runs', 'notes', 'reviews', 'prefs'].forEach(c => assert.ok(MQ.data[c] && !Object.keys(MQ.data[c]).length, c));

// 2. Aparelho novo recebe arquivo de versão antiga: guarda o que é local e soma o remoto
fresh();
MQ.data.notes.q1 = { id: 'q1', text: 'local', updatedAt: 50 };
const antigo = { version: 1, counter: 7, questions: { q1: { id: 'q1', updatedAt: 10 } }, attempts: { a1: { id: 'a1', qid: 'q1', updatedAt: 10 } }, folders: {}, lists: {}, runs: {} };
assert.strictEqual(MQ.mergeData(antigo), 2);
assert.strictEqual(MQ.data.notes.q1.text, 'local');
assert.ok(MQ.data.attempts.a1);
assert.strictEqual(MQ.data.counter, 7);

// 3. Arquivo com coleções novas e uma ainda desconhecida: tudo entra e volta no upload
fresh();
const novo = {
  version: 1, counter: 3,
  notes: { q1: { id: 'q1', text: 'remota', updatedAt: 20 } },
  reviews: { q1: { id: 'q1', box: 2, updatedAt: 20 } },
  prefs: { meta: { id: 'meta', daily: 40, updatedAt: 20 } },
  futuro: { x: { id: 'x', updatedAt: 20 } }
};
assert.strictEqual(MQ.mergeData(novo), 4);
const enviado = JSON.parse(JSON.stringify(MQ.data));
['notes', 'reviews', 'prefs', 'futuro'].forEach(c => assert.ok(Object.keys(enviado[c]).length, c));
assert.strictEqual(enviado.version, 1);

// 4. Em cada item vence a edição mais recente, também nas coleções novas
MQ.data.notes.q1 = { id: 'q1', text: 'local nova', updatedAt: 99 };
MQ.mergeData({ notes: { q1: { id: 'q1', text: 'remota velha', updatedAt: 30 } } });
assert.strictEqual(MQ.data.notes.q1.text, 'local nova');
MQ.mergeData({ notes: { q1: { id: 'q1', text: 'remota nova', updatedAt: 200 } } });
assert.strictEqual(MQ.data.notes.q1.text, 'remota nova');

// 5. Lápide remota mais nova apaga; números e listas soltas não viram coleção
MQ.mergeData({ notes: { q1: { id: 'q1', deleted: true, updatedAt: 300 } }, version: 2, lixo: [1, 2], texto: 'x' });
assert.strictEqual(MQ.get('notes', 'q1'), null);
assert.strictEqual(MQ.data.version, 1);
assert.strictEqual(MQ.data.lixo, undefined);
assert.strictEqual(MQ.data.texto, undefined);

// 7. JSON malicioso do Drive não contamina protótipos; item que não é objeto é ignorado
const mau = JSON.parse('{"__proto__":{"poluido":{"id":"p","updatedAt":9}},"constructor":{"x":{"id":"x"}},"notes":{"__proto__":{"id":"y","updatedAt":9},"q9":5}}');
MQ.mergeData(mau);
assert.strictEqual(({}).poluido, undefined);
assert.strictEqual(vm.runInContext('({}).poluido', ctx), undefined);
assert.strictEqual(MQ.data.notes.q9, undefined);
assert.strictEqual(MQ.data.notes.id, undefined); // o item "__proto__" não virou protótipo da coleção

// 8. Marca-texto é a coleção "marks" (vai no backup e para o servidor); restaurar de novo não muda nada
fresh();
MQ.put('marks', { id: 'q1', qid: 'q1', m: { stem: [[0, 5, 'yellow']] } });
const backup = JSON.parse(JSON.stringify(Object.assign({}, MQ.data, { media: {} })));
assert.deepStrictEqual(backup.marks.q1.m.stem, [[0, 5, 'yellow']]);
fresh();
assert.strictEqual(MQ.mergeData(Object.assign({}, backup, { marks: MQ.cleanMarks(backup.marks) })), 1);
assert.deepStrictEqual(MQ.get('marks', 'q1').m.stem, [[0, 5, 'yellow']]);
assert.strictEqual(MQ.mergeData(Object.assign({}, backup, { marks: MQ.cleanMarks(backup.marks) })), 0);

// 9. Backup malformado: só entram trechos válidos em alvos conhecidos (nada de classe CSS solta); lápide fica lápide
const limpo = MQ.cleanMarks(JSON.parse('{"__proto__":{"m":{}},"y":5,"z":{"id":"z","m":{"stem":[]}},' +
  '"q4":{"m":{"stem":"abc","A":[5],"B":[[0,3,"x hidden"]],"C":[[3,1,"red"]]}},' +
  '"q5":{"updatedAt":9,"m":{"stem":[[5,8,"green"],[0,2,"red"],[1,4,"pink"],[1,9,"blue",4]],"zz":[[0,1,"red"]]}},' +
  '"q6":{"deleted":true,"m":{"stem":[[0,1,"red"]]},"updatedAt":7}}'));
const plain = o => JSON.parse(JSON.stringify(o)); // objetos criados no contexto do vm têm outro protótipo
assert.deepStrictEqual(Object.keys(limpo).sort(), ['q5', 'q6']);
assert.deepStrictEqual(plain(limpo.q5), { id: 'q5', qid: 'q5', updatedAt: 9, m: { stem: [[0, 2, 'red'], [5, 8, 'green']] } });
assert.deepStrictEqual(plain(limpo.q6), { id: 'q6', deleted: true, updatedAt: 7 });
assert.deepStrictEqual(plain(MQ.cleanMarks(undefined)), {});

// 10. A saída de GET /api/dados (gravada pelo tests/Feature/DadosTest.php) entra inteira pelo mergeData
fresh();
const api = Object.assign(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/api-dados.json'), 'utf8')), { ate: '2026-11-14T13:00:00.000000Z' });
const itens = Object.keys(api).filter(c => typeof api[c] === 'object').reduce((n, c) => n + Object.keys(api[c]).length, 0);
assert.strictEqual(MQ.mergeData(api), itens);
assert.strictEqual(MQ.data.ate, undefined); // o cursor (texto) não vira coleção
assert.strictEqual(MQ.get('questions', 'q1').enunciado, 'Qual?');
assert.strictEqual(MQ.get('questions', 'q2'), null); // lápide
assert.strictEqual(MQ.data.questions.q2.dupOf, 'q1');
assert.strictEqual(MQ.get('lists', 'l2'), null);
assert.deepStrictEqual(MQ.get('lists', 'l1').qids, ['q1', 'q2']);
assert.ok(MQ.get('runs', 'r1').answers && !Array.isArray(MQ.get('runs', 'r1').answers)); // {} continua objeto
assert.deepStrictEqual(MQ.get('marks', 'q1').m.stem, [[0, 5, 'yellow']]);
assert.strictEqual(MQ.attemptsByQ().q1.length, 1);
assert.strictEqual(MQ.mergeData(api), 0); // carregar de novo não muda nada

console.log('mesclagem: ok');
