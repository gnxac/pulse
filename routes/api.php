<?php

use App\Http\Controllers\ContaController;
use App\Http\Controllers\DadosController;
use App\Http\Controllers\UsuariosController;
use Illuminate\Support\Facades\Route;

// Prefixo /api. statefulApi() em bootstrap/app.php: sessão por cookie e CSRF obrigatório em toda gravação.
Route::middleware(['auth:sanctum', 'conta'])->group(function () {
    Route::get('/me', [ContaController::class, 'me'])->name('me');
    Route::post('/senha', [ContaController::class, 'trocarSenha'])->middleware('throttle:10,1')->name('senha');

    Route::get('/dados', [DadosController::class, 'dados']);
    Route::post('/salvar', [DadosController::class, 'salvar'])->middleware('limite');

    Route::middleware('admin')->prefix('admin')->group(function () {
        Route::get('/usuarios', [UsuariosController::class, 'index']);
    });
});
