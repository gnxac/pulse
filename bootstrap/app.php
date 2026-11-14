<?php

use App\Http\Middleware\ContaAtiva;
use App\Http\Middleware\LimiteDeEnvio;
use App\Http\Middleware\SoAdmin;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\PostTooLargeException;
use Illuminate\Http\Request;

$app = Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Sanctum SPA: /api/* usa a sessão por cookie e exige CSRF nas gravações.
        $middleware->statefulApi();
        $middleware->alias([
            'conta' => ContaAtiva::class,
            'admin' => SoAdmin::class,
            'limite' => LimiteDeEnvio::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(fn (PostTooLargeException $e) => response()->json(
            ['message' => 'Envio grande demais: máximo de 5 MB.'], 413,
        ));
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();

// A pasta pública é www/ (o site em JS puro); o index.php do Laravel fica ao lado do index.html.
$app->usePublicPath(dirname(__DIR__).'/www');

return $app;
