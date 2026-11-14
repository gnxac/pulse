<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;

/**
 * Conta do Pulse. Criada só pelo admin; nunca apagada (desativa-se com `active`).
 */
// role, active e must_change_password ficam fora do Fillable de propósito: só o código do admin os atribui,
// nunca um fill($request->all()). A factory não é afetada (cria sem proteção).
#[Fillable(['username', 'name', 'email', 'password'])]
#[Hidden(['password'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory;

    /** D6: só minúsculas, números, ponto e hífen. O D evita que "nome\n" passe. Igual ao CHECK do banco. */
    public const FORMATO_USERNAME = '/^[a-z0-9.-]+$/D';

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'active' => 'boolean',
            'must_change_password' => 'boolean',
            'last_login_at' => 'datetime',
        ];
    }

    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }
}
