<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Contas do Pulse. Só o admin cria; ninguém é apagado (desativa-se com active = false).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('username', 40);
            $table->string('name');
            $table->string('email')->nullable();
            $table->string('password');
            $table->string('role', 20)->default('estudante');
            $table->boolean('active')->default(true);
            $table->boolean('must_change_password')->default(false);
            $table->timestampTz('last_login_at')->nullable();
            $table->timestampsTz();
        });

        // Nome de usuário (D6): só minúsculas, números, ponto e hífen. Único sem diferenciar maiúsculas.
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_username_formato CHECK (username ~ '^[a-z0-9.-]+$')");
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_role_valido CHECK (role IN ('admin', 'estudante'))");
        DB::statement('CREATE UNIQUE INDEX users_username_unico ON users (lower(username))');
        DB::statement('CREATE UNIQUE INDEX users_email_unico ON users (lower(email)) WHERE email IS NOT NULL');
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
