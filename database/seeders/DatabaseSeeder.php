<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    /**
     * Só para desenvolvimento: contas admin-teste e estudante-teste com senha aleatória nova a cada execução,
     * mostrada no terminal (nunca gravada em código, .env ou log). O admin real vem de `php artisan pulse:criar-admin`.
     */
    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->command?->error('Seeder de teste: só roda com APP_ENV=local ou testing.');

            return;
        }

        foreach (['admin-teste' => 'admin', 'estudante-teste' => 'estudante'] as $username => $role) {
            $senha = Str::password(16, symbols: false);
            $user = User::firstOrNew(['username' => $username]);
            $user->name = $role === 'admin' ? 'Admin de teste' : 'Estudante de teste';
            $user->password = $senha;
            $user->role = $role;
            $user->active = true;
            $user->must_change_password = false;
            $user->save();
            $this->command?->line("{$username}: {$senha}");
        }
    }
}
