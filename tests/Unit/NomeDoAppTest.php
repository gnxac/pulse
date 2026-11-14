<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class NomeDoAppTest extends TestCase
{
    public function test_composer_json_nomeia_dependencias_do_laravel(): void
    {
        $composer = json_decode(file_get_contents(__DIR__.'/../../composer.json'), true);

        $this->assertArrayHasKey('laravel/framework', $composer['require']);
    }
}
