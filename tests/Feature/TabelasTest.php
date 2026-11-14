<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class TabelasTest extends TestCase
{
    use RefreshDatabase;

    private const PESSOAIS = ['attempts', 'folders', 'lists', 'runs', 'notes', 'reviews', 'prefs', 'marks'];

    private function linhaDeColecao(int $userId, string $id, array $extra = []): array
    {
        return array_merge([
            'user_id' => $userId,
            'id' => $id,
            'data' => json_encode(['id' => $id, 'campo_que_esta_versao_nao_conhece' => 'fica']),
            'updated_at_ms' => 1000,
        ], $extra);
    }

    /** Roda dentro de um savepoint: o erro do banco não derruba a transação do teste (PostgreSQL aborta tudo depois dele). */
    private function barrado(callable $fn): QueryException
    {
        try {
            DB::transaction($fn);
        } catch (QueryException $e) {
            return $e;
        }
        $this->fail('esperava um erro do banco');
    }

    private function questao(int $ownerId, string $id = 'q1'): void
    {
        DB::table('questions')->insert([
            'id' => $id,
            'owner_id' => $ownerId,
            'data' => json_encode(['id' => $id, 'enunciado' => 'x']),
            'updated_at_ms' => 1000,
        ]);
    }

    public function test_todas_as_tabelas_do_plano_existem(): void
    {
        foreach (array_merge(['users', 'questions', 'media', 'sessions', 'cache', 'cache_locks'], self::PESSOAIS) as $tabela) {
            $this->assertTrue(Schema::hasTable($tabela), "falta a tabela $tabela");
        }
        // Sem recuperação de senha por e-mail e sem fila (QUEUE_CONNECTION=sync).
        $this->assertFalse(Schema::hasTable('password_reset_tokens'));
        $this->assertFalse(Schema::hasTable('jobs'));
    }

    public function test_delete_em_questions_falha(): void
    {
        $admin = User::factory()->admin()->create();
        $this->questao($admin->id);

        $e = $this->barrado(fn () => DB::table('questions')->where('id', 'q1')->delete());

        $this->assertStringContainsString('não é permitido', $e->getMessage());

        $this->assertSame(1, DB::table('questions')->where('id', 'q1')->count());
    }

    public function test_delete_em_attempts_falha(): void
    {
        $aluno = User::factory()->create();
        DB::table('attempts')->insert($this->linhaDeColecao($aluno->id, 'a1', ['question_id' => 'q1', 'correct' => true, 'ts' => 5]));

        $e = $this->barrado(fn () => DB::table('attempts')->where('id', 'a1')->delete());

        $this->assertStringContainsString('não é permitido', $e->getMessage());
        $this->assertSame(1, DB::table('attempts')->count());
    }

    public function test_truncate_em_questions_e_attempts_falha(): void
    {
        foreach (['questions', 'attempts'] as $tabela) {
            $e = $this->barrado(fn () => DB::statement("TRUNCATE TABLE $tabela"));
            $this->assertStringContainsString('não é permitido', $e->getMessage(), $tabela);
        }
    }

    public function test_recebido_em_acompanha_insert_e_update(): void
    {
        $aluno = User::factory()->create();
        // Um valor antigo gravado à força é sobrescrito pelo servidor, já no insert...
        DB::table('notes')->insert($this->linhaDeColecao($aluno->id, 'q1', ['recebido_em' => '2000-01-01 00:00:00+00']));
        $this->assertTrue($this->recebidoDepoisDe('2000-01-02 00:00:00+00'), 'insert deveria carimbar recebido_em');

        // ...e a cada update (é o que `?desde=` consulta para ver edições e lápides).
        DB::table('notes')->where('id', 'q1')->update(['recebido_em' => '2000-01-01 00:00:00+00']);
        $this->assertTrue($this->recebidoDepoisDe('2000-01-02 00:00:00+00'), 'update deveria carimbar recebido_em');

        $antes = DB::selectOne("select recebido_em as t from notes where id = 'q1'")->t;
        usleep(20000);
        DB::table('notes')->where('id', 'q1')->update(['deleted' => true, 'updated_at_ms' => 2000]);
        $avancou = DB::selectOne("select recebido_em > ?::timestamptz as ok from notes where id = 'q1'", [$antes])->ok;

        $this->assertTrue((bool) $avancou, 'recebido_em deve avançar a cada mudança');
    }

    private function recebidoDepoisDe(string $instante): bool
    {
        return (bool) DB::selectOne("select recebido_em > ?::timestamptz as ok from notes where id = 'q1'", [$instante])->ok;
    }

    public function test_lapide_e_update_continuam_permitidos(): void
    {
        $admin = User::factory()->admin()->create();
        $this->questao($admin->id);

        DB::table('questions')->where('id', 'q1')->update(['deleted' => true, 'updated_at_ms' => 2000]);

        $this->assertTrue((bool) DB::table('questions')->where('id', 'q1')->value('deleted'));
    }

    public function test_dados_do_front_voltam_identicos_inclusive_campos_desconhecidos(): void
    {
        $aluno = User::factory()->create();
        $objeto = [
            'id' => 'q9', 'text' => 'Anotação com acentos: ção, é, ü',
            'updatedAt' => 1731600000000, 'nota' => 7.5, 'ativo' => true, 'vazio' => null,
            'aninhado' => ['lista' => [1, 2, ['x' => 'y']], 'conf' => 3, 'why' => 'li errado'],
            'campo_que_esta_versao_nao_conhece' => 'fica',
        ];
        DB::table('notes')->insert($this->linhaDeColecao($aluno->id, 'q9', ['data' => json_encode($objeto)]));

        $data = json_decode(DB::table('notes')->where('id', 'q9')->value('data'), true);

        // jsonb não guarda a ordem das chaves, mas o conteúdo volta igual.
        $this->assertEquals($objeto, $data);
    }

    public function test_chave_e_por_usuario_e_id(): void
    {
        $a = User::factory()->create();
        $b = User::factory()->create();

        // O mesmo id (id da questão) pode existir para dois usuários...
        foreach (self::PESSOAIS as $tabela) {
            DB::table($tabela)->insert($this->linhaDeColecao($a->id, 'mesmo-id'));
            DB::table($tabela)->insert($this->linhaDeColecao($b->id, 'mesmo-id'));
            $this->assertSame(2, DB::table($tabela)->where('id', 'mesmo-id')->count(), $tabela);
        }

        // ...mas não duas vezes para o mesmo usuário.
        $e = $this->barrado(fn () => DB::table('notes')->insert($this->linhaDeColecao($a->id, 'mesmo-id')));
        $this->assertSame('23505', $e->getCode()); // unique_violation
        $this->assertSame(2, DB::table('notes')->count());
    }

    public function test_resposta_pode_apontar_para_questao_que_nao_existe(): void
    {
        $aluno = User::factory()->create();

        DB::table('attempts')->insert($this->linhaDeColecao($aluno->id, 'a1', ['question_id' => 'questao-inexistente']));

        $this->assertSame(1, DB::table('attempts')->count());
    }

    public function test_conta_com_dados_nao_pode_ser_apagada(): void
    {
        $aluno = User::factory()->create();
        DB::table('notes')->insert($this->linhaDeColecao($aluno->id, 'q1'));

        $e = $this->barrado(fn () => DB::table('users')->where('id', $aluno->id)->delete());

        $this->assertSame('23503', $e->getCode()); // foreign_key_violation (RESTRICT)
        $this->assertSame(1, User::count());
    }

    public function test_nome_de_usuario_so_aceita_minusculas_numeros_ponto_e_hifen(): void
    {
        User::factory()->create(['username' => 'ana.souza-2']);

        foreach (['Ana', 'ana souza', 'ana_souza', 'ana@x', 'anã', ''] as $ruim) {
            $e = $this->barrado(fn () => User::factory()->create(['username' => $ruim]));
            $this->assertStringContainsString('users_username_formato', $e->getMessage(), "usuário '$ruim'");
        }
    }

    public function test_usuario_e_email_sao_unicos_sem_diferenciar_maiusculas(): void
    {
        User::factory()->create(['username' => 'maria', 'email' => 'Maria@Exemplo.com']);

        $e = $this->barrado(fn () => User::factory()->create(['username' => 'outro', 'email' => 'maria@exemplo.com']));

        $this->assertStringContainsString('users_email_unico', $e->getMessage());
    }

    public function test_varios_usuarios_sem_email(): void
    {
        User::factory()->count(2)->create(['email' => null]);

        $this->assertSame(2, User::count());
    }

    public function test_papel_so_admin_ou_estudante(): void
    {
        $e = $this->barrado(fn () => User::factory()->create(['role' => 'superuser']));

        $this->assertStringContainsString('users_role_valido', $e->getMessage());
    }

    public function test_imagem_fica_no_banco_como_bytea(): void
    {
        $admin = User::factory()->admin()->create();
        $bytes = random_bytes(64);

        DB::table('media')->insert([
            'id' => 'img1', 'owner_id' => $admin->id, 'question_id' => 'q1',
            'mime' => 'image/png', 'bytes' => DB::raw("decode('".bin2hex($bytes)."', 'hex')"), 'size' => 64,
        ]);

        $lido = DB::selectOne("select encode(bytes, 'hex') as h, size from media where id = 'img1'");
        $this->assertSame(bin2hex($bytes), $lido->h);
        $this->assertSame(64, $lido->size);
    }

    public function test_tabelas_de_sessao_e_cache_funcionam_no_banco(): void
    {
        cache()->store('database')->put('pulse', 'ok', 60);

        $this->assertSame('ok', cache()->store('database')->get('pulse'));
    }
}
