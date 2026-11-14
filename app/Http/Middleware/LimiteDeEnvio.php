<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Exceptions\PostTooLargeException;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * /api/salvar (e /api/midia, etapa 7): no máximo 5 MB por chamada. A resposta 413 com a mensagem clara sai do
 * bootstrap/app.php, igual à do limite do PHP (post_max_size). O nginx e o PHP aceitam um pouco mais (6 MB) para
 * que a mensagem venha daqui.
 */
class LimiteDeEnvio
{
    public const BYTES = 5 * 1024 * 1024;

    public function handle(Request $request, Closure $next): Response
    {
        // Content-Length pode faltar (envio em partes); o tamanho real do corpo é o que vale.
        if ((int) $request->header('Content-Length') > self::BYTES || strlen($request->getContent()) > self::BYTES) {
            throw new PostTooLargeException;
        }

        return $next($request);
    }
}
