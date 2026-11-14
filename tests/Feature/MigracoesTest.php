<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * migrate:fresh e migrate:rollback rodam sem erro e sem deixar lixo (tabelas, gatilhos e a função do gatilho).
 * Roda sem RefreshDatabase porque derruba e recria o esquema; termina deixando o banco migrado.
 */
class MigracoesTest extends TestCase
{
    protected function tearDown(): void
    {
        Artisan::call('migrate'); // devolve o esquema para os outros testes
        parent::tearDown();
    }

    public function test_fresh_e_rollback_rodam_sem_erro_e_limpam_tudo(): void
    {
        // migrate:fresh derruba o banco inteiro: nunca no banco de desenvolvimento.
        $this->assertSame('pulse_test', DB::connection()->getDatabaseName());

        $this->assertSame(0, Artisan::call('migrate:fresh'));
        $this->assertTrue(Schema::hasTable('questions'));
        $this->assertTrue(Schema::hasTable('attempts'));
        $this->assertSame(2, $this->funcoesDoGatilho());

        $this->assertSame(0, Artisan::call('migrate:rollback'));

        foreach (['users', 'questions', 'attempts', 'media', 'sessions', 'cache', 'cache_locks', 'marks'] as $tabela) {
            $this->assertFalse(Schema::hasTable($tabela), "$tabela deveria ter saído no rollback");
        }
        $this->assertSame(0, $this->funcoesDoGatilho());
    }

    public function test_migrar_de_novo_depois_do_rollback_funciona(): void
    {
        $this->assertSame(0, Artisan::call('migrate:fresh'));
        $this->assertSame(0, Artisan::call('migrate:rollback'));
        $this->assertSame(0, Artisan::call('migrate'));
        $this->assertTrue(Schema::hasTable('questions'));
    }

    private function funcoesDoGatilho(): int
    {
        return (int) DB::selectOne("select count(*) as n from pg_proc where proname in ('pulse_bloquear_delete', 'pulse_marcar_recebido')")->n;
    }
}
