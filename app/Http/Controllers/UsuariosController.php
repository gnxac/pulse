<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;

/** Painel do administrador: contas. Criar, redefinir senha e desativar entram com a tela de usuários. */
class UsuariosController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(
            User::orderBy('username')->get(['id', 'username', 'name', 'role', 'active', 'last_login_at'])
        );
    }
}
