<?php

namespace Tests\Feature;

use App\Http\Controllers\ContaController;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/** Etapa 3 do PLANO-LARAVEL.md: login, sessão, papéis e CSRF. */
class LoginTest extends TestCase
{
    use RefreshDatabase;

    private const SENHA = 'senha-de-teste-123'; // a da UserFactory

    protected function setUp(): void
    {
        parent::setUp();
        // O navegador manda Referer; sem ele o Sanctum não liga a sessão nas rotas /api.
        $this->withHeader('Referer', 'http://localhost/');
        // Sem isto, getJson/postJson não mandam os cookies de withCookie (o navegador manda).
        $this->withCredentials();
    }

    private function entrar(string $username, string $senha = self::SENHA)
    {
        return $this->postJson('/login', ['username' => $username, 'password' => $senha]);
    }

    /** O Laravel desliga o CSRF nos testes; aqui ele volta a valer como em produção. */
    private function comCsrfDeVerdade(): void
    {
        $csrf = new class($this->app, $this->app['encrypter']) extends ValidateCsrfToken
        {
            protected function runningUnitTests()
            {
                return false;
            }
        };
        $this->app->instance(ValidateCsrfToken::class, $csrf);
        $this->app->instance(PreventRequestForgery::class, $csrf);
    }

    /** Entre requisições o guard e a sessão ficam na memória do teste; o navegador real só tem o cookie. */
    private function esquecerLogin(): void
    {
        $this->app['auth']->forgetGuards();
        $this->app['session']->forgetDrivers();
        $this->app->forgetInstance('session.store');
    }

    public function test_senha_certa_entra(): void
    {
        $user = User::factory()->create(['username' => 'ana']);

        $this->entrar('ana')
            ->assertOk()
            ->assertExactJson([
                'id' => $user->id, 'username' => 'ana', 'name' => $user->name,
                'role' => 'estudante', 'must_change_password' => false,
            ]);

        $this->assertAuthenticatedAs($user);
        $this->assertNotNull($user->fresh()->last_login_at);
        $this->getJson('/api/me')->assertOk()->assertJsonPath('username', 'ana');
    }

    public function test_senha_errada_nao_entra(): void
    {
        User::factory()->create(['username' => 'ana']);

        $this->entrar('ana', 'senha-errada-999')
            ->assertStatus(422)
            ->assertJsonPath('errors.username.0', ContaController::ERRO_LOGIN);
        $this->assertGuest();
    }

    public function test_desativada_nao_entra_e_mensagem_nao_revela_quem_existe(): void
    {
        User::factory()->create(['username' => 'ana']);
        User::factory()->desativado()->create(['username' => 'bia']);

        $senhaErrada = $this->entrar('ana', 'senha-errada-999')->assertStatus(422)->json();
        $naoExiste = $this->entrar('ninguem')->assertStatus(422)->json();
        $desativada = $this->entrar('bia')->assertStatus(422)->json(); // senha certa, conta desativada

        $this->assertSame($senhaErrada, $naoExiste);
        $this->assertSame($senhaErrada, $desativada);
        $this->assertGuest();
    }

    public function test_conta_desativada_depois_do_login_perde_a_sessao(): void
    {
        config(['session.driver' => 'database']);
        $nome = config('session.cookie');
        $user = User::factory()->create();
        $id = $this->entrar($user->username)->assertOk()->getCookie($nome)->getValue();

        // Desativada direto no banco (como o admin fará), sem tocar no objeto em memória.
        User::whereKey($user->id)->update(['active' => false]);
        $this->esquecerLogin();
        $this->withCookie($nome, $id)->getJson('/api/me')->assertUnauthorized();
    }

    public function test_sexta_tentativa_em_um_minuto_recebe_429(): void
    {
        User::factory()->create(['username' => 'ana']);

        for ($i = 1; $i <= 5; $i++) {
            $this->entrar('ana', "errada-$i-xxxxx")->assertStatus(422);
        }

        // Nem a senha certa passa na 6ª.
        $resposta = $this->entrar('ana')->assertStatus(429);
        $this->assertMatchesRegularExpression('/^Muitas tentativas\. Tente de novo em \d+ segundos\.$/', $resposta->json('message'));
        $this->assertGuest();

        // Passado o minuto, entra.
        $this->travel(61)->seconds();
        $this->entrar('ana')->assertOk();
    }

    public function test_trinta_erradas_por_ip_em_uma_hora_bloqueiam_qualquer_usuario(): void
    {
        User::factory()->create(['username' => 'ana']);

        for ($i = 1; $i <= 30; $i++) {
            $this->entrar("chute$i", 'errada-xxxxx')->assertStatus(422);
        }
        $this->entrar('ana')->assertStatus(429);
    }

    public function test_nome_de_usuario_com_maiuscula_ou_espaco_e_recusado(): void
    {
        User::factory()->create(['username' => 'ana']);

        // Espaço nas pontas o Laravel já apara (TrimStrings); no meio, é recusado.
        foreach (['Ana', 'ANA', 'ana silva', 'ana_silva', 'ána'] as $invalido) {
            $this->entrar($invalido)->assertStatus(422)->assertJsonValidationErrors('username');
        }
        $this->assertGuest();
    }

    public function test_senha_so_com_hash_no_banco(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->postJson('/api/senha', [
            'current_password' => self::SENHA,
            'password' => 'nova-senha-segura-1',
        ])->assertNoContent();

        $gravada = DB::table('users')->where('id', $user->id)->value('password');
        $this->assertStringNotContainsString('nova-senha-segura-1', $gravada);
        $this->assertTrue(Hash::check('nova-senha-segura-1', $gravada));
        $this->assertTrue(Hash::isHashed($gravada));
        // Nem /api/me nem a lista do admin devolvem o hash.
        $this->getJson('/api/me')->assertJsonMissingPath('password');
    }

    public function test_login_regenera_a_sessao(): void
    {
        User::factory()->create(['username' => 'ana']);
        $this->app['session']->start();
        $antiga = $this->app['session']->getId();

        $this->withCookie(config('session.cookie'), $antiga)->entrar('ana')->assertOk();

        $this->assertNotSame($antiga, $this->app['session']->getId());
    }

    public function test_logout_invalida_a_sessao_e_troca_o_token_csrf(): void
    {
        $this->entrar(User::factory()->create()->username)->assertOk();
        $id = $this->app['session']->getId();
        $token = $this->app['session']->token();

        $this->postJson('/logout')->assertNoContent();

        $this->assertGuest();
        $this->assertNotSame($id, $this->app['session']->getId());
        $this->assertNotSame($token, $this->app['session']->token());
        $this->esquecerLogin();
        $this->getJson('/api/me')->assertUnauthorized();
    }

    public function test_trocar_senha_encerra_as_outras_sessoes(): void
    {
        config(['session.driver' => 'database']);
        $user = User::factory()->create();
        $outro = User::factory()->create();
        $sessao = fn (string $id, int $userId) => ['id' => $id, 'user_id' => $userId, 'payload' => '', 'last_activity' => time()];
        DB::table('sessions')->insert([$sessao('celular-da-ana', $user->id), $sessao('pc-da-ana', $user->id), $sessao('sessao-de-outro', $outro->id)]);

        // Senha atual errada não troca nada.
        $this->actingAs($user)->postJson('/api/senha', ['current_password' => 'errada-xxxxx', 'password' => 'nova-senha-segura-1'])
            ->assertStatus(422)->assertJsonValidationErrors('current_password');
        $this->assertSame(2, DB::table('sessions')->whereIn('id', ['celular-da-ana', 'pc-da-ana'])->count());
        DB::table('sessions')->whereNotIn('id', ['celular-da-ana', 'pc-da-ana', 'sessao-de-outro'])->delete();

        $this->postJson('/api/senha', ['current_password' => self::SENHA, 'password' => 'nova-senha-segura-1'])->assertNoContent();

        $this->assertSame(['sessao-de-outro'], DB::table('sessions')->whereIn('id', ['celular-da-ana', 'pc-da-ana', 'sessao-de-outro'])->pluck('id')->all());
        // A sessão de quem trocou continua (gravada no fim da requisição, com id novo).
        $this->assertSame(1, DB::table('sessions')->where('user_id', $user->id)->count());
        $this->assertTrue(Hash::check('nova-senha-segura-1', $user->fresh()->password));
    }

    public function test_nova_senha_precisa_de_10_caracteres(): void
    {
        $this->actingAs(User::factory()->create())
            ->postJson('/api/senha', ['current_password' => self::SENHA, 'password' => 'curta123'])
            ->assertStatus(422)->assertJsonValidationErrors('password');
    }

    public function test_nova_senha_ate_72_bytes(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        foreach ([str_repeat('á', 37), str_repeat('a', 73)] as $longa) { // 74 e 73 bytes
            $this->postJson('/api/senha', ['current_password' => self::SENHA, 'password' => $longa])
                ->assertStatus(422)->assertJsonPath('errors.password.0', User::SENHA_LONGA);
        }
        $this->assertTrue(Hash::check(self::SENHA, $user->fresh()->password));

        $this->postJson('/api/senha', ['current_password' => self::SENHA, 'password' => str_repeat('á', 36)])->assertNoContent();
        $this->assertTrue(Hash::check(str_repeat('á', 36), $user->fresh()->password));
    }

    public function test_senha_provisoria_so_deixa_ler_me_e_trocar_a_senha(): void
    {
        $admin = User::factory()->admin()->create(['must_change_password' => true]);

        $this->actingAs($admin)->getJson('/api/me')->assertOk()->assertJsonPath('must_change_password', true);
        $this->getJson('/api/admin/usuarios')->assertForbidden();

        $this->postJson('/api/senha', ['current_password' => self::SENHA, 'password' => 'nova-senha-segura-1'])->assertNoContent();
        $this->assertFalse($admin->fresh()->must_change_password);
        $this->actingAs($admin->fresh())->getJson('/api/admin/usuarios')->assertOk();
    }

    public function test_rota_de_admin_devolve_403_ao_estudante(): void
    {
        $this->getJson('/api/admin/usuarios')->assertUnauthorized();

        $this->actingAs(User::factory()->create())->getJson('/api/admin/usuarios')->assertForbidden();

        $this->actingAs(User::factory()->admin()->create(['username' => 'chefe']))
            ->getJson('/api/admin/usuarios')
            ->assertOk()
            ->assertJsonFragment(['username' => 'chefe', 'role' => 'admin'])
            ->assertJsonMissingPath('0.password');
    }

    public function test_sem_token_csrf_a_gravacao_devolve_419(): void
    {
        $this->comCsrfDeVerdade();
        User::factory()->create(['username' => 'ana']);

        $this->entrar('ana')->assertStatus(419);
        $this->assertGuest();

        $user = User::factory()->create();
        $this->actingAs($user)->postJson('/api/senha', ['current_password' => self::SENHA, 'password' => 'nova-senha-segura-1'])
            ->assertStatus(419);
        $this->assertTrue(Hash::check(self::SENHA, $user->fresh()->password));
        $this->postJson('/logout')->assertStatus(419);

        // Com o token da sessão (o que o front manda em X-XSRF-TOKEN), passa.
        $this->withSession(['_token' => 'token-de-teste'])
            ->postJson('/api/senha', ['current_password' => self::SENHA, 'password' => 'nova-senha-segura-1'], ['X-CSRF-TOKEN' => 'token-de-teste'])
            ->assertNoContent();
    }

    public function test_cookie_csrf_e_sessao_seguros(): void
    {
        $resposta = $this->get('/sanctum/csrf-cookie')->assertNoContent();
        $xsrf = $resposta->getCookie('XSRF-TOKEN', false);
        $this->assertNotNull($xsrf);
        $this->assertFalse($xsrf->isHttpOnly()); // o front precisa ler para mandar em X-XSRF-TOKEN

        $sessao = $this->entrar(User::factory()->create()->username)->getCookie(config('session.cookie'), false);
        $this->assertTrue($sessao->isHttpOnly());
        $this->assertSame('lax', $sessao->getSameSite());
    }

    public function test_sessao_dura_30_dias_e_renova_a_cada_uso(): void
    {
        config(['session.driver' => 'database']);
        $this->assertSame(43200, config('session.lifetime'));
        $nome = config('session.cookie');

        $resposta = $this->entrar(User::factory()->create()->username)->assertOk();
        $this->assertEqualsWithDelta(now()->addDays(30)->getTimestamp(), $resposta->getCookie($nome, false)->getExpiresTime(), 5);
        $id = $resposta->getCookie($nome)->getValue();

        $usar = function () use ($nome, &$id) {
            $this->esquecerLogin();
            $r = $this->withCookie($nome, $id)->getJson('/api/me');
            $id = $r->getCookie($nome)?->getValue() ?? $id;

            return $r;
        };

        // Usada a cada 20 dias, passa dos 30 sem cair.
        $this->travel(20)->days();
        $usar()->assertOk();
        $this->travel(20)->days();
        $usar()->assertOk();

        // 31 dias parada: expira.
        $this->travel(31)->days();
        $usar()->assertUnauthorized();
    }

    public function test_cabecalho_bearer_nao_autentica_nem_quebra(): void
    {
        $this->withHeader('Authorization', 'Bearer 1|qualquer-coisa')->getJson('/api/me')->assertUnauthorized();
    }
}
