<?php

use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

// Primeiro admin: usuário e senha digitados no terminal. Nada de senha no repositório, no .env ou no log.
Artisan::command('pulse:criar-admin', function () {
    $dados = [
        'username' => (string) $this->ask('Nome de usuário (minúsculas, números, ponto e hífen)'),
        'name' => (string) $this->ask('Nome', 'Administrador'),
        'email' => $this->ask('E-mail (opcional)', 'guilhermeacnx@gmail.com') ?: null,
        'password' => (string) $this->secret('Senha (mínimo de 10 caracteres)'),
        'password_confirmation' => (string) $this->secret('Repita a senha'),
    ];

    $validacao = Validator::make($dados, [
        'username' => ['required', 'max:40', 'regex:'.User::FORMATO_USERNAME, Rule::unique('users', 'username')],
        'name' => ['required', 'max:255'],
        'email' => ['nullable', 'email', 'max:255', Rule::unique('users', 'email')],
        'password' => [...User::regrasSenha(), 'confirmed'],
    ]);
    if ($validacao->fails()) {
        foreach ($validacao->errors()->all() as $erro) {
            $this->error($erro);
        }

        return 1;
    }

    $user = new User(collect($dados)->only(['username', 'name', 'email', 'password'])->all());
    $user->role = 'admin';
    $user->save();
    $this->info("Administrador {$user->username} criado.");

    return 0;
})->purpose('Cria uma conta de administrador (pede usuário e senha no terminal)');
