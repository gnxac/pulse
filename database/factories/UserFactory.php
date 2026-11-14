<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    protected static ?string $password;

    public function definition(): array
    {
        return [
            'username' => 'aluno'.fake()->unique()->numberBetween(1, 999999),
            'name' => fake()->name(),
            'email' => null,
            'password' => static::$password ??= Hash::make('senha-de-teste-123'),
            'role' => 'estudante',
            'active' => true,
            'must_change_password' => false,
        ];
    }

    public function admin(): static
    {
        return $this->state(fn () => ['role' => 'admin']);
    }

    public function desativado(): static
    {
        return $this->state(fn () => ['active' => false]);
    }
}
