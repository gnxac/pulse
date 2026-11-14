<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Laravel\Sanctum\Sanctum;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Só sessão por cookie (Sanctum SPA). Sem tokens: um "Authorization: Bearer" qualquer não consulta tabela nenhuma.
        Sanctum::getAccessTokenFromRequestUsing(fn () => null);
    }
}
