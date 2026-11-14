<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CriarAdminTest extends TestCase
{
    use RefreshDatabase;

    private function criarAdmin(string $username, string $senha = 'senha-do-admin-1', ?string $repetida = null)
    {
        return $this->artisan('pulse:criar-admin')
            ->expectsQuestion('Nome de usuário (minúsculas, números, ponto e hífen)', $username)
            ->expectsQuestion('Nome', 'Guilherme')
            ->expectsQuestion('E-mail (opcional)', 'admin@example.com')
            ->expectsQuestion('Senha (mínimo de 10 caracteres)', $senha)
            ->expectsQuestion('Repita a senha', $repetida ?? $senha);
    }

    public function test_cria_admin_com_senha_em_hash(): void
    {
        $this->criarAdmin('guilherme')->expectsOutput('Administrador guilherme criado.')->assertExitCode(0);

        $user = User::where('username', 'guilherme')->firstOrFail();
        $this->assertSame('admin', $user->role);
        $this->assertTrue($user->active);
        $this->assertNotSame('senha-do-admin-1', $user->getRawOriginal('password'));
        $this->assertTrue(Hash::check('senha-do-admin-1', $user->password));
    }

    public function test_recusa_maiuscula_espaco_senha_curta_e_repeticao_diferente(): void
    {
        $this->criarAdmin('Guilherme')->assertExitCode(1);
        $this->criarAdmin('gui lherme')->assertExitCode(1);
        $this->criarAdmin("guilherme\n")->assertExitCode(1);
        $this->criarAdmin('guilherme', 'curta')->assertExitCode(1);
        $this->criarAdmin('guilherme', 'senha-do-admin-1', 'outra-senha-xx')->assertExitCode(1);

        $this->assertSame(0, User::count());
    }

    public function test_seeder_cria_contas_de_teste_com_senha_aleatoria(): void
    {
        Artisan::call('db:seed', ['--class' => DatabaseSeeder::class]);
        $saida = Artisan::output();

        preg_match('/^admin-teste: (\S+)$/m', $saida, $admin);
        preg_match('/^estudante-teste: (\S+)$/m', $saida, $estudante);
        $this->assertTrue(Hash::check($admin[1], User::where('username', 'admin-teste')->value('password')));
        $this->assertTrue(Hash::check($estudante[1], User::where('username', 'estudante-teste')->value('password')));
        $this->assertSame('admin', User::where('username', 'admin-teste')->value('role'));

        // Rodar de novo troca as senhas e não duplica.
        Artisan::call('db:seed', ['--class' => DatabaseSeeder::class]);
        $this->assertSame(2, User::count());
        $this->assertStringNotContainsString($admin[1], Artisan::output());
    }
}
