<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

/**
 * GET /api/dados e POST /api/salvar (PLANO-LARAVEL.md, etapa 4). Mesma regra do mergeData do front: em cada item
 * vence o updatedAt mais novo; empate ou mais velho não muda nada. O usuário vem sempre da sessão, nunca do corpo.
 */
class DadosController extends Controller
{
    /** Coleções de cada pessoa, chave (user_id, id). `questions` é uma tabela só, do servidor (D3). */
    public const PESSOAIS = ['attempts', 'folders', 'lists', 'runs', 'notes', 'reviews', 'prefs', 'marks'];

    public const MAX_ITENS = 500;

    /** Ids que, no front, mexeriam no protótipo dos objetos (o mergeData já os ignora). */
    private const PROIBIDOS = ['__proto__', 'constructor', 'prototype'];

    private const JSON = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR;

    /** Tudo no formato de MQ.data. Com ?desde=, só o que chegou ao servidor depois (o cursor vem em `ate`). */
    public function dados(Request $request): Response
    {
        // Só o formato do `ate` (ISO 8601 em UTC) e data que existe: texto como "next week" passaria no strtotime e quebraria no banco.
        $desde = $request->validate(['desde' => ['nullable', 'string', 'date', 'regex:/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{1,6})?Z$/D']])['desde'] ?? null;
        $user = $request->user();

        // Cursor do próximo ?desde=: a hora atual, recuada até o início de qualquer transação aberta em outra
        // conexão. recebido_em é carimbado na gravação (antes do commit), então um lote ainda não confirmado
        // fica depois do cursor e chega na próxima consulta em vez de se perder. Repetir item não faz mal.
        $ate = DB::selectOne(<<<'SQL'
            SELECT to_char(least(clock_timestamp(), (
                SELECT min(xact_start) FROM pg_stat_activity
                WHERE datname = current_database() AND pid <> pg_backend_pid() AND backend_type = 'client backend'
            )) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS ate
            SQL)->ate;

        $filtro = $desde === null ? '' : ' AND recebido_em > ?::timestamptz';
        $mais = fn (array $p) => $desde === null ? $p : [...$p, $desde];

        if ($user->isAdmin()) {
            // Admin: todas, inclusive privadas (cursos) e lápides. O contador guarda o maior R1-n já usado.
            $counter = "(SELECT coalesce(max(substring(codigo from '^R1-(\\d{1,9})$')::bigint), 0) FROM questions)";
            $questions = "SELECT coalesce(jsonb_object_agg(id, data), '{}') FROM questions WHERE true{$filtro}";
        } else {
            // Estudante: publicadas e não removidas, mais as lápides das que já foram publicadas ou eram repetidas
            // (o dedupe.js remapeia as respostas pelo dupOf). Lápide sai só com o que o front usa, sem conteúdo.
            $counter = '0';
            $questions = <<<SQL
                SELECT coalesce(jsonb_object_agg(id, CASE WHEN deleted THEN jsonb_strip_nulls(jsonb_build_object(
                    'id', id, 'deleted', true, 'updatedAt', updated_at_ms, 'createdAt', created_at_ms,
                    'dupOf', dup_of, 'dupMap', data->'dupMap')) ELSE data END), '{}')
                FROM questions
                WHERE (publicada AND NOT deleted OR deleted AND (publicada OR dup_of IS NOT NULL)){$filtro}
                SQL;
        }

        $partes = ["'version', 1", "'counter', {$counter}", "'ate', ?::text", "'questions', ({$questions})"];
        $params = $mais([$ate]);
        foreach (self::PESSOAIS as $tabela) {
            $partes[] = "'{$tabela}', (SELECT coalesce(jsonb_object_agg(id, data), '{}') FROM {$tabela} WHERE user_id = ?{$filtro})";
            $params = [...$params, ...$mais([$user->id])];
        }

        // O JSON sai pronto do banco: os objetos voltam como foram gravados (um {} vazio continua {}).
        $json = DB::selectOne('SELECT jsonb_build_object('.implode(', ', $partes).')::text AS json', $params)->json;

        return response($json, 200, ['Content-Type' => 'application/json']);
    }

    /** Corpo: { coleção: { id: item } }. Devolve { aceitos: { coleção: [ids gravados] } }; o resto o servidor já tinha mais novo. */
    public function salvar(Request $request): JsonResponse
    {
        $user = $request->user();
        $corpo = $request->getContent();

        try {
            // Objetos como stdClass, e não arrays: assim um {} vazio do front não volta como [].
            $lote = json_decode($corpo, false, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            $lote = null;
        }
        abort_unless($lote instanceof \stdClass, 422, 'Envio inválido: mande um objeto JSON { coleção: { id: item } }.');
        $colecoes = get_object_vars($lote);

        // D3: estudante não grava questões nem imagens; recusa o lote inteiro antes de gravar qualquer coisa.
        if (! $user->isAdmin() && (array_key_exists('questions', $colecoes) || array_key_exists('media', $colecoes))) {
            abort(403, 'Só o administrador grava questões e imagens.');
        }
        abort_if(array_key_exists('media', $colecoes), 422, 'Imagens são enviadas por /api/midia.');
        // O PostgreSQL não aceita o caractere nulo em jsonb.
        abort_if(str_contains($corpo, '\u0000'), 422, 'Envio inválido: texto com caractere nulo (\u0000).');

        $total = 0;
        foreach ($colecoes as $nome => $itens) {
            abort_unless($nome === 'questions' || in_array($nome, self::PESSOAIS, true), 422, "Coleção desconhecida: {$nome}.");
            abort_unless($itens instanceof \stdClass, 422, "Envio inválido: {$nome} precisa ser um objeto { id: item }.");
            $total += count(get_object_vars($itens));
        }
        if ($total > self::MAX_ITENS) {
            return response()->json(['message' => 'Envio grande demais: máximo de '.self::MAX_ITENS.' itens por vez.'], 413);
        }

        $linhas = [];
        foreach (['questions', ...self::PESSOAIS] as $nome) { // ordem fixa (e ids em ordem): lotes simultâneos não se travam
            if (! isset($colecoes[$nome])) {
                continue;
            }
            $itens = get_object_vars($colecoes[$nome]);
            ksort($itens, SORT_STRING);
            $linhas[$nome] = [];
            foreach ($itens as $id => $item) {
                $linhas[$nome][] = $this->linha($nome, (string) $id, $item);
            }
        }

        $aceitos = DB::transaction(function () use ($linhas, $user) {
            $aceitos = [];
            foreach ($linhas as $tabela => $doLote) {
                $aceitos[$tabela] = $doLote ? $this->gravar($tabela, $doLote, $user) : [];
            }

            return $aceitos;
        });

        return response()->json(['aceitos' => (object) $aceitos]);
    }

    /** Confere um item e monta a linha da tabela. O objeto inteiro vai em `data`; as colunas só ajudam consulta. */
    private function linha(string $colecao, string $id, mixed $item): array
    {
        $erro = "Item inválido em {$colecao} ({$id}): ";
        abort_unless($item instanceof \stdClass, 422, $erro.'precisa ser um objeto.');
        abort_unless($id !== '' && strlen($id) <= 200 && ! in_array($id, self::PROIBIDOS, true) && ($item->id ?? null) === $id,
            422, $erro.'o id precisa ser igual à chave (até 200 caracteres).');
        // Sem updatedAt vale 0, como no mergeData: entra se o servidor não tiver o item, nunca passa por cima.
        $updatedAt = self::numero($item->updatedAt ?? 0);
        abort_if($updatedAt === null, 422, $erro.'updatedAt precisa ser um número.');

        try {
            $data = json_encode($item, self::JSON);
        } catch (\JsonException) { // ex.: 1e999 vira INF no json_decode e não volta a JSON
            abort(422, $erro.'número fora da faixa.');
        }

        $linha = [
            'id' => $id,
            'data' => $data,
            // Mesma ideia de "lápide" do front (MQ.get: !o.deleted).
            'deleted' => ! in_array($item->deleted ?? false, [false, null, 0, 0.0, ''], true),
            'created_at_ms' => self::numero($item->createdAt ?? null),
            'updated_at_ms' => $updatedAt,
        ];

        return $linha + match ($colecao) {
            'questions' => [
                'codigo' => self::texto($item->codigo ?? null),
                'dup_of' => self::texto($item->dupOf ?? null),
                'instituicao' => self::texto($item->instituicao ?? null),
                'ano' => self::ano($item->ano ?? null),
                'area' => self::texto($item->area ?? null),
            ],
            'attempts' => [
                'question_id' => self::texto($item->qid ?? null),
                'correct' => is_bool($item->correct ?? null) ? $item->correct : null,
                'ts' => self::numero($item->ts ?? null),
                'ctx' => self::texto($item->ctx ?? null),
                'run_id' => self::texto($item->runId ?? null),
            ],
            'runs' => ['status' => is_string($item->status ?? null) && strlen($item->status) <= 30 ? $item->status : null],
            'reviews' => ['due' => self::numero($item->due ?? null)],
            default => [],
        };
    }

    /** INSERT … ON CONFLICT DO UPDATE só quando o item que chega é mais novo. Devolve os ids gravados. */
    private function gravar(string $tabela, array $linhas, User $user): array
    {
        $pessoal = $tabela !== 'questions';
        $colunas = array_keys($linhas[0]);
        $todas = [$pessoal ? 'user_id' : 'owner_id', ...$colunas];
        $marcas = '('.implode(', ', array_fill(0, count($todas), '?')).')';

        $params = [];
        foreach ($linhas as $linha) {
            array_push($params, $user->id, ...array_values($linha));
        }

        // owner_id e publicada nunca mudam por aqui (publicar é a rota do admin, etapa 8).
        $atualizar = array_map(fn ($c) => "{$c} = excluded.{$c}", array_diff($colunas, ['id']));
        if (! $pessoal) {
            // Lápide não traz codigo; a coluna guarda o último para o contador não repetir um R1-n.
            $atualizar[array_search('codigo = excluded.codigo', $atualizar)] = 'codigo = coalesce(excluded.codigo, questions.codigo)';
        }

        $sql = "INSERT INTO {$tabela} (".implode(', ', $todas).') VALUES '.implode(', ', array_fill(0, count($linhas), $marcas))
            .' ON CONFLICT ('.($pessoal ? 'user_id, id' : 'id').') DO UPDATE SET '.implode(', ', $atualizar)
            ." WHERE excluded.updated_at_ms > {$tabela}.updated_at_ms RETURNING id";

        return array_column(DB::select($sql, $params), 'id');
    }

    /** Milissegundos (ou outro inteiro) que cabem em bigint; o resto vira null. */
    private static function numero(mixed $v): ?int
    {
        return is_int($v) || (is_float($v) && is_finite($v) && abs($v) < 9e15) ? (int) $v : null;
    }

    private static function texto(mixed $v): ?string
    {
        return is_string($v) ? $v : (is_int($v) || is_float($v) ? (string) $v : null);
    }

    /** questions.ano é smallint: "2023", 2023 e 2023.0 viram 2023; vazio, texto ou fora da faixa viram null. */
    private static function ano(mixed $v): ?int
    {
        if (is_float($v) && abs($v) < 1e9 && floor($v) === $v) {
            $v = (int) $v;
        }
        if (! is_int($v) && ! is_string($v)) {
            return null;
        }
        $ano = filter_var(trim((string) $v), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 32767]]);

        return $ano === false ? null : $ano;
    }
}
