<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Entrar, sair, quem sou eu e trocar a própria senha (PLANO-LARAVEL.md, seção 2).
 */
class ContaController extends Controller
{
    public const ERRO_LOGIN = 'Usuário ou senha incorretos.';

    public function login(Request $request): JsonResponse
    {
        $dados = $request->validate([
            'username' => ['required', 'string', 'max:40', 'regex:'.User::FORMATO_USERNAME],
            'password' => ['required', 'string', 'max:200'],
        ]);

        // 5 erradas por usuário + IP por minuto e 30 por IP por hora.
        $porConta = 'login:'.$dados['username'].'|'.$request->ip();
        $porIp = 'login-ip:'.$request->ip();
        foreach ([$porConta => 5, $porIp => 30] as $chave => $maximo) {
            if (RateLimiter::tooManyAttempts($chave, $maximo)) {
                $segundos = RateLimiter::availableIn($chave);

                return response()->json(['message' => "Muitas tentativas. Tente de novo em {$segundos} segundos."], 429)
                    ->header('Retry-After', (string) $segundos);
            }
        }

        // Conta antes de comparar: requisições em paralelo não furam o limite enquanto o hash é calculado.
        RateLimiter::hit($porConta, 60);
        RateLimiter::hit($porIp, 3600);

        $user = User::where('username', $dados['username'])->first();
        // Sem conta, compara com um hash qualquer: o tempo de resposta não revela quem existe.
        $hashFalso = Cache::rememberForever('login:hash-falso', fn () => Hash::make(Str::random(40)));
        $senhaCerta = Hash::check($dados['password'], $user?->password ?? $hashFalso);

        if (! $senhaCerta || ! $user->active) {
            // Mesma mensagem para senha errada, usuário inexistente e conta desativada.
            throw ValidationException::withMessages(['username' => self::ERRO_LOGIN]);
        }

        // Login certo não conta como erro.
        RateLimiter::clear($porConta);
        RateLimiter::decrement($porIp, 3600);
        Auth::guard('web')->login($user);
        $request->session()->regenerate();

        if (Hash::needsRehash($user->password)) {
            $user->password = $dados['password'];
        }
        $user->last_login_at = now();
        $user->save();

        return response()->json($this->dadosDaConta($user));
    }

    public function logout(Request $request): Response
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json($this->dadosDaConta($request->user()));
    }

    public function trocarSenha(Request $request): Response
    {
        $dados = $request->validate([
            'current_password' => ['required', 'string', 'current_password:web'],
            'password' => [...User::regrasSenha(), 'different:current_password'],
        ]);

        $user = $request->user();
        $user->password = $dados['password'];
        $user->must_change_password = false;
        $user->save();

        // A sessão atual ganha id novo e continua; todas as outras sessões da pessoa são encerradas.
        // Depende de SESSION_DRIVER=database (o padrão do projeto); com outro driver não apaga nada.
        $request->session()->regenerate(true);
        DB::table(config('session.table'))
            ->where('user_id', $user->id)
            ->where('id', '<>', $request->session()->getId())
            ->delete();

        return response()->noContent();
    }

    private function dadosDaConta(User $user): array
    {
        return $user->only(['id', 'username', 'name', 'role', 'must_change_password']);
    }
}
