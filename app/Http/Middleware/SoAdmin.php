<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Rotas /api/admin/*: o papel é conferido aqui, no servidor; o front esconder botões é só conforto. */
class SoAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless($request->user()?->isAdmin(), 403, 'Só o administrador pode fazer isso.');

        return $next($request);
    }
}
