<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class EsqueletoTest extends TestCase
{
    public function test_up_responde_200(): void
    {
        $this->get('/up')->assertStatus(200);
    }

    public function test_pasta_publica_e_www(): void
    {
        $this->assertSame(base_path('www'), public_path());
        $this->assertFileExists(public_path('index.html'));
        $this->assertFileExists(public_path('index.php'));
    }

    public function test_banco_de_teste_e_postgres_separado(): void
    {
        $this->assertSame('pgsql', DB::connection()->getDriverName());
        $this->assertSame('pulse_test', DB::connection()->getDatabaseName());
        $this->assertSame(1, (int) DB::selectOne('select 1 as ok')->ok);
    }
}
