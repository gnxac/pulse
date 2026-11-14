<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/** Etapa 4 do PLANO-LARAVEL.md: GET /api/dados e POST /api/salvar. */
class DadosTest extends TestCase
{
    use RefreshDatabase;

    /** Saída do GET /api/dados que o tests/mesclagem.test.js (Node) carrega no mergeData do front. */
    private const FIXTURE = __DIR__.'/../fixtures/api-dados.json';

    protected function setUp(): void
    {
        parent::setUp();
        $this->withHeader('Referer', 'http://localhost/');
    }

    /** Corpo cru (string) ou array; cru quando precisa de {} vazio, que o json_encode de array vira []. */
    private function salvar(User $user, string|array $corpo): TestResponse
    {
        $json = is_string($corpo) ? $corpo : json_encode($corpo);

        return $this->actingAs($user)->call('POST', '/api/salvar', [], [], [],
            ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'], $json);
    }

    /** Resposta decodificada com objetos (stdClass), para distinguir {} de []. */
    private function dados(User $user, ?string $desde = null): \stdClass
    {
        $r = $this->actingAs($user)->getJson('/api/dados'.($desde === null ? '' : '?desde='.urlencode($desde)))->assertOk();

        return json_decode($r->getContent(), false);
    }

    private function nota(string $id, string $texto, int $updatedAt): array
    {
        return ['notes' => [$id => ['id' => $id, 'text' => $texto, 'updatedAt' => $updatedAt]]];
    }

    public function test_sem_login_devolve_401(): void
    {
        $this->getJson('/api/dados')->assertUnauthorized();
        $this->postJson('/api/salvar', [])->assertUnauthorized();
    }

    public function test_a_nao_le_nem_grava_dados_de_b(): void
    {
        [$a, $b] = User::factory()->count(2)->create();

        $this->salvar($a, $this->nota('q1', 'de A', 100))->assertOk()->assertJsonPath('aceitos.notes', ['q1']);
        // B grava o mesmo id, mais novo, e tenta se passar por A: o user_id do corpo é ignorado.
        $tentativa = ['notes' => ['q1' => ['id' => 'q1', 'text' => 'de B', 'updatedAt' => 999, 'user_id' => $a->id]]];
        $this->salvar($b, $tentativa)->assertOk()->assertJsonPath('aceitos.notes', ['q1']);
        $this->salvar($b, ['user_id' => $a->id] + $this->nota('q2', 'x', 1))->assertStatus(422);

        $this->assertSame('de A', $this->dados($a)->notes->q1->text);
        $this->assertSame('de B', $this->dados($b)->notes->q1->text);
        $this->assertSame(['q1'], array_keys(get_object_vars($this->dados($a)->notes)));
        $this->assertSame(1, DB::table('notes')->where('user_id', $a->id)->count());
        $this->assertSame(1, DB::table('notes')->where('user_id', $b->id)->count());
    }

    public function test_item_mais_velho_nao_sobrescreve_o_mais_novo(): void
    {
        $user = User::factory()->create();
        $this->salvar($user, $this->nota('q1', 'nova', 200))->assertOk();

        $this->salvar($user, $this->nota('q1', 'velha', 100))->assertOk()->assertJsonPath('aceitos.notes', []);
        $this->salvar($user, $this->nota('q1', 'empate', 200))->assertOk()->assertJsonPath('aceitos.notes', []);
        $this->assertSame('nova', $this->dados($user)->notes->q1->text);

        $this->salvar($user, $this->nota('q1', 'mais nova', 300))->assertOk()->assertJsonPath('aceitos.notes', ['q1']);
        $this->assertSame('mais nova', $this->dados($user)->notes->q1->text);
        $this->assertSame(300, DB::table('notes')->value('updated_at_ms'));
    }

    public function test_reenviar_o_mesmo_lote_nao_muda_nada(): void
    {
        $user = User::factory()->create();
        $lote = '{"attempts":{"a1":{"id":"a1","qid":"q1","choice":"B","correct":true,"ctx":"banco","ts":50,"runId":null,"updatedAt":50}},'
            .'"runs":{"r1":{"id":"r1","listId":"l1","answers":{},"flags":[],"status":"andamento","updatedAt":60}},'
            .'"reviews":{"q1":{"id":"q1","qid":"q1","box":1,"due":86400050,"updatedAt":50}},"marks":{}}';

        $this->salvar($user, $lote)->assertOk()->assertExactJson(['aceitos' => ['attempts' => ['a1'], 'runs' => ['r1'], 'reviews' => ['q1'], 'marks' => []]]);
        $antes = $this->linhas($user);

        $this->salvar($user, $lote)->assertOk()->assertExactJson(['aceitos' => ['attempts' => [], 'runs' => [], 'reviews' => [], 'marks' => []]]);
        $this->assertEquals($antes, $this->linhas($user)); // nem recebido_em muda

        // As colunas de consulta saem do objeto.
        $tentativa = DB::table('attempts')->first();
        $this->assertSame(['q1', true, 50, 'banco', null], [$tentativa->question_id, $tentativa->correct, $tentativa->ts, $tentativa->ctx, $tentativa->run_id]);
        $this->assertSame('andamento', DB::table('runs')->value('status'));
        $this->assertSame(86400050, DB::table('reviews')->value('due'));
    }

    private function linhas(User $user): array
    {
        return collect(['attempts', 'runs', 'reviews'])
            ->mapWithKeys(fn ($t) => [$t => DB::table($t)->where('user_id', $user->id)->get()->map(fn ($l) => (array) $l)->all()])
            ->all();
    }

    public function test_estudante_que_manda_questions_ou_media_recebe_403_e_nada_e_gravado(): void
    {
        $admin = User::factory()->admin()->create();
        $estudante = User::factory()->create();
        $this->salvar($admin, ['questions' => ['q1' => ['id' => 'q1', 'enunciado' => 'original', 'updatedAt' => 10]]])->assertOk();
        DB::table('questions')->update(['publicada' => true]);

        $tentativa = ['attempts' => ['a1' => ['id' => 'a1', 'qid' => 'q1', 'updatedAt' => 20]]];
        $this->salvar($estudante, $tentativa + ['questions' => ['q1' => ['id' => 'q1', 'enunciado' => 'mudada', 'updatedAt' => 99]]])
            ->assertForbidden()->assertJsonPath('message', 'Só o administrador grava questões e imagens.');
        $this->salvar($estudante, $tentativa + ['questions' => ['q2' => ['id' => 'q2', 'updatedAt' => 99]]])->assertForbidden();
        $this->salvar($estudante, $tentativa + ['media' => ['m1' => 'data:image/png;base64,AAAA']])->assertForbidden();

        $this->assertSame(0, DB::table('attempts')->count());
        $this->assertSame(1, DB::table('questions')->count());
        $this->assertSame('original', $this->dados($estudante)->questions->q1->enunciado);
    }

    public function test_admin_edita_questao_sem_mudar_publicada_nem_dono(): void
    {
        [$admin, $outroAdmin] = User::factory()->admin()->count(2)->create();
        $this->salvar($admin, ['questions' => ['q1' => ['id' => 'q1', 'codigo' => 'R1-00007', 'updatedAt' => 10]]])->assertOk();
        DB::table('questions')->update(['publicada' => true]);

        $this->salvar($outroAdmin, ['questions' => ['q1' => ['id' => 'q1', 'codigo' => 'R1-00007', 'publicada' => false, 'updatedAt' => 20]]])->assertOk();

        $linha = DB::table('questions')->first();
        $this->assertTrue($linha->publicada);
        $this->assertSame($admin->id, $linha->owner_id);
        // Imagens não vão por aqui, nem para o admin.
        $this->salvar($admin, ['media' => ['m1' => 'x']])->assertStatus(422);
    }

    public function test_ano_vira_inteiro_ou_null_antes_de_gravar(): void
    {
        $admin = User::factory()->admin()->create();
        $anos = ['texto' => '"2023"', 'numero' => '2021', 'decimal' => '2020.0', 'espacos' => '" 2019 "', 'vazio' => '""',
            'palavra' => '"abc"', 'grande' => '99999', 'quebrado' => '2020.5', 'nulo' => 'null', 'logico' => 'true', 'lista' => '[2020]'];
        $itens = collect($anos)->map(fn ($ano, $id) => "\"{$id}\":{\"id\":\"{$id}\",\"ano\":{$ano},\"updatedAt\":1}")->implode(',');

        $this->salvar($admin, '{"questions":{'.$itens.'}}')->assertOk();

        $this->assertSame(
            ['texto' => 2023, 'numero' => 2021, 'decimal' => 2020, 'espacos' => 2019, 'vazio' => null, 'palavra' => null,
                'grande' => null, 'quebrado' => null, 'nulo' => null, 'logico' => null, 'lista' => null],
            collect($anos)->map(fn ($_, $id) => DB::table('questions')->where('id', $id)->value('ano'))->all(),
        );
        $this->assertSame('2023', $this->dados($admin)->questions->texto->ano); // o objeto volta como veio
    }

    public function test_corpo_acima_do_limite_recebe_413_com_a_mensagem(): void
    {
        $user = User::factory()->create();

        $grande = $this->nota('q1', str_repeat('x', 5 * 1024 * 1024), 1);
        $this->salvar($user, $grande)->assertStatus(413)->assertExactJson(['message' => 'Envio grande demais: máximo de 5 MB.']);

        $muitos = ['attempts' => collect(range(1, 501))->mapWithKeys(fn ($i) => ["a{$i}" => ['id' => "a{$i}", 'updatedAt' => 1]])->all()];
        $this->salvar($user, $muitos)->assertStatus(413)->assertExactJson(['message' => 'Envio grande demais: máximo de 500 itens por vez.']);

        $this->assertSame(0, DB::table('notes')->count() + DB::table('attempts')->count());

        // 500 itens passam.
        array_pop($muitos['attempts']);
        $this->salvar($user, $muitos)->assertOk();
        $this->assertSame(500, DB::table('attempts')->count());
    }

    public function test_lote_invalido_recebe_422_e_nada_e_gravado(): void
    {
        $user = User::factory()->create();
        $bom = $this->nota('q1', 'ok', 1);

        $this->salvar($user, 'isto não é json')->assertStatus(422);
        $this->salvar($user, '[1,2]')->assertStatus(422);
        $this->salvar($user, $bom + ['futuro' => ['x' => ['id' => 'x', 'updatedAt' => 1]]])->assertStatus(422)->assertJsonPath('message', 'Coleção desconhecida: futuro.');
        $this->salvar($user, $bom + ['lists' => ['l1' => ['id' => 'outro', 'updatedAt' => 1]]])->assertStatus(422);
        $this->salvar($user, $bom + ['lists' => ['__proto__' => ['id' => '__proto__', 'updatedAt' => 1]]])->assertStatus(422);
        $this->salvar($user, $bom + ['lists' => ['l1' => ['id' => 'l1', 'updatedAt' => '123']]])->assertStatus(422);
        $this->salvar($user, $bom + ['lists' => ['l1' => 'texto']])->assertStatus(422);
        $this->salvar($user, '{"notes":{"q1":{"id":"q1","text":"a\u0000b","updatedAt":1}}}')->assertStatus(422);
        $this->salvar($user, '{"notes":{"q1":{"id":"q1","nota":1e999,"updatedAt":1}}}')->assertStatus(422);
        $this->salvar($user, '{"notes":{"q1":{"id":"q1","updatedAt":1e999}}}')->assertStatus(422);

        $this->assertSame(0, DB::table('notes')->count() + DB::table('lists')->count());
    }

    public function test_lapide_continua_lapide(): void
    {
        $admin = User::factory()->admin()->create();
        $this->salvar($admin, ['lists' => ['l1' => ['id' => 'l1', 'name' => 'Cardio', 'updatedAt' => 100]]])->assertOk();
        $this->salvar($admin, ['lists' => ['l1' => ['id' => 'l1', 'deleted' => true, 'updatedAt' => 200]]])->assertOk();
        $this->salvar($admin, ['questions' => ['q1' => ['id' => 'q1', 'deleted' => true, 'updatedAt' => 200]]])->assertOk();
        $this->salvar($admin, '{"notes":{"n1":{"id":"n1","deleted":0.0,"updatedAt":1}}}')->assertOk();
        $this->assertFalse(DB::table('notes')->value('deleted')); // como no JS: 0.0 é falso

        // A cópia viva mais velha (ou do mesmo instante) de outro aparelho não ressuscita a lápide.
        foreach ([100, 200] as $quando) {
            $this->salvar($admin, ['lists' => ['l1' => ['id' => 'l1', 'name' => 'Cardio', 'updatedAt' => $quando]],
                'questions' => ['q1' => ['id' => 'q1', 'enunciado' => 'volta?', 'updatedAt' => $quando]]])->assertOk();
        }
        $dados = $this->dados($admin);
        $this->assertTrue($dados->lists->l1->deleted);
        $this->assertTrue($dados->questions->q1->deleted);
        $this->assertTrue(DB::table('lists')->value('deleted'));
        $this->assertTrue(DB::table('questions')->value('deleted'));
    }

    public function test_estudante_nao_recebe_questao_nao_publicada(): void
    {
        $admin = User::factory()->admin()->create();
        $estudante = User::factory()->create();
        $this->salvar($admin, '{"questions":{'
            .'"pub":{"id":"pub","enunciado":"oficial","instituicao":"ENARE","updatedAt":1},'
            .'"curso":{"id":"curso","enunciado":"do curso","instituicao":"Estratégia","updatedAt":1},'
            .'"repetida":{"id":"repetida","deleted":true,"dupOf":"pub","dupMap":{"A":"B"},"enunciado":"segredo","updatedAt":2},'
            .'"removida":{"id":"removida","deleted":true,"updatedAt":2}}}')->assertOk();
        DB::table('questions')->where('id', 'pub')->update(['publicada' => true]);

        $vistas = $this->dados($estudante)->questions;
        $this->assertSame(['pub', 'repetida'], collect(get_object_vars($vistas))->keys()->sort()->values()->all());
        // Lápide chega sem conteúdo, só o que o dedupe.js usa.
        $this->assertEquals((object) ['id' => 'repetida', 'deleted' => true, 'updatedAt' => 2, 'dupOf' => 'pub', 'dupMap' => (object) ['A' => 'B']], $vistas->repetida);

        $this->assertCount(4, get_object_vars($this->dados($admin)->questions));
        $this->assertSame(0, $this->dados($estudante)->counter);
    }

    public function test_desde_traz_so_o_que_chegou_depois(): void
    {
        $user = User::factory()->create();
        $this->salvar($user, ['attempts' => ['a1' => ['id' => 'a1', 'updatedAt' => 1]]])->assertOk();
        $ate = $this->dados($user)->ate;

        $this->salvar($user, ['attempts' => ['a2' => ['id' => 'a2', 'updatedAt' => 2]]])->assertOk();
        $this->salvar($user, ['attempts' => ['a1' => ['id' => 'a1', 'updatedAt' => 1]]])->assertOk(); // repetido: não conta

        $novos = $this->dados($user, $ate);
        $this->assertSame(['a2'], array_keys(get_object_vars($novos->attempts)));
        $this->assertEquals(new \stdClass, $novos->notes);
        $this->assertCount(0, get_object_vars($this->dados($user, $novos->ate)->attempts));

        foreach (['ontem-nao', 'next week', '1 jan', '2026-13-45T99:99:99Z', '2026-02-30T00:00:00Z'] as $ruim) {
            $this->actingAs($user)->getJson('/api/dados?desde='.urlencode($ruim))->assertStatus(422);
        }
        $this->actingAs($user)->getJson('/api/dados?desde=2026-01-01T00:00:00Z')->assertOk(); // sem fração também vale
    }

    public function test_contador_do_admin_lembra_o_maior_codigo_mesmo_removido(): void
    {
        $admin = User::factory()->admin()->create();
        $this->salvar($admin, ['questions' => [
            'q1' => ['id' => 'q1', 'codigo' => 'R1-00009', 'updatedAt' => 1],
            'q2' => ['id' => 'q2', 'codigo' => 'R1-00003', 'updatedAt' => 1],
        ]])->assertOk();
        $this->salvar($admin, ['questions' => ['q1' => ['id' => 'q1', 'deleted' => true, 'updatedAt' => 2]]])->assertOk();

        $this->assertSame(9, $this->dados($admin)->counter);
    }

    /**
     * GET /api/dados devolve o formato de MQ.data. A saída do estudante fica em tests/fixtures/api-dados.json,
     * que o tests/mesclagem.test.js passa pelo mergeData do front. Mudou o formato de propósito? Rode com
     * PULSE_GRAVAR_FIXTURE=1 para regravar o arquivo.
     */
    public function test_formato_de_mq_data_aceito_pelo_front(): void
    {
        $admin = User::factory()->admin()->create();
        $estudante = User::factory()->create();
        $this->salvar($admin, '{"questions":{'
            .'"q1":{"id":"q1","codigo":"R1-00001","enunciado":"Qual?","alternativas":{"A":"a","B":"b"},"gabarito":"A","ano":"2023","instituicao":"ENARE","createdAt":10,"updatedAt":10},'
            .'"q2":{"id":"q2","deleted":true,"dupOf":"q1","dupMap":{"A":"A","B":"B"},"createdAt":5,"updatedAt":11}}}')->assertOk();
        DB::table('questions')->where('id', 'q1')->update(['publicada' => true]);
        $this->salvar($estudante, '{'
            .'"attempts":{"a1":{"id":"a1","qid":"q1","choice":"A","correct":true,"ctx":"banco","ts":20,"timeSec":12.5,"createdAt":20,"updatedAt":20},'
            .'"a2":{"id":"a2","qid":"q2","choice":"B","correct":false,"ctx":"banco","ts":21,"createdAt":21,"updatedAt":21}},'
            .'"folders":{"f1":{"id":"f1","name":"Cardio","createdAt":30,"updatedAt":30}},'
            .'"lists":{"l1":{"id":"l1","name":"Revisão","folderId":"f1","qids":["q1","q2"],"createdAt":31,"updatedAt":31},'
            .'"l2":{"id":"l2","deleted":true,"createdAt":31,"updatedAt":32}},'
            .'"runs":{"r1":{"id":"r1","listId":"l1","qids":["q1"],"answers":{},"flags":[],"status":"andamento","startedAt":40,"createdAt":40,"updatedAt":40}},'
            .'"notes":{"q1":{"id":"q1","text":"Lembrar: ação → reação","createdAt":50,"updatedAt":50}},'
            .'"reviews":{"q1":{"id":"q1","qid":"q1","box":1,"due":86400020,"lastAt":20,"createdAt":20,"updatedAt":20}},'
            .'"prefs":{"meta":{"id":"meta","daily":40,"createdAt":60,"updatedAt":60}},'
            .'"marks":{"q1":{"id":"q1","qid":"q1","m":{"stem":[[0,5,"yellow"]]},"createdAt":70,"updatedAt":70}}}')->assertOk();

        $dados = $this->dados($estudante);
        $this->assertMatchesRegularExpression('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/', $dados->ate);
        unset($dados->ate); // muda a cada chamada

        // Formato de MQ.data: version, counter e cada coleção como objeto { id: item } (vazio = {}, não []).
        $this->assertSame(1, $dados->version);
        foreach (['questions', 'attempts', 'folders', 'lists', 'runs', 'notes', 'reviews', 'prefs', 'marks'] as $c) {
            $this->assertInstanceOf(\stdClass::class, $dados->{$c}, $c);
        }
        $this->assertInstanceOf(\stdClass::class, $dados->runs->r1->answers);
        $this->assertSame([], $dados->runs->r1->flags);
        $this->assertSame(12.5, $dados->attempts->a1->timeSec);

        if (getenv('PULSE_GRAVAR_FIXTURE')) {
            file_put_contents(self::FIXTURE, json_encode($dados, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION)."\n");
        }
        $this->assertEquals(json_decode(file_get_contents(self::FIXTURE), false), $dados,
            'A saída de GET /api/dados mudou; se foi de propósito, regrave com PULSE_GRAVAR_FIXTURE=1 e rode node tests/mesclagem.test.js.');
    }
}
