<?php

use App\Http\Controllers\ContaController;
use Illuminate\Support\Facades\Route;

// O site (www/index.html e arquivos estáticos) é servido direto pelo nginx.
// Saúde do app: /up (bootstrap/app.php). Cookie CSRF: GET /sanctum/csrf-cookie (Sanctum).
// Grupo "web": sessão por cookie e CSRF obrigatório em todo POST.
Route::post('/login', [ContaController::class, 'login'])->name('login');
Route::post('/logout', [ContaController::class, 'logout'])->name('logout');
