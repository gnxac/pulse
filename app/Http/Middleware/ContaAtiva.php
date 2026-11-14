<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Roda depois de auth:sanctum. Conta desativada perde a sessão na hora; com senha provisória
 * só dá para ler /api/me e trocar a senha.
 */
class ContaAtiva
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user->active) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            abort(401, 'Não autenticado.');
        }

        if ($user->must_change_password && ! $request->routeIs('me', 'senha')) {
            abort(403, 'Troque a senha provisória antes de continuar.');
        }

        return $next($request);
    }
}
