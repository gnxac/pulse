<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Só para desenvolvimento: as 12 questões autorais do antigo www/js/seed.js (questoes-teste.json), publicadas e com
 * dono admin-teste. Ids fixos teste-01…teste-12: rodar de novo não duplica nem mexe nas que já existem.
 */
class QuestoesTesteSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->command?->error('Seeder de teste: só roda com APP_ENV=local ou testing.');

            return;
        }

        $admin = User::where('username', 'admin-teste')->first();
        if (! $admin) {
            $this->command?->error('Falta a conta admin-teste: rode primeiro php artisan db:seed.');

            return;
        }

        $agora = (int) (microtime(true) * 1000);
        $linhas = [];
        foreach (json_decode(file_get_contents(__DIR__.'/questoes-teste.json'), true, 512, JSON_THROW_ON_ERROR) as $i => $q) {
            $n = str_pad((string) ($i + 1), 2, '0', STR_PAD_LEFT);
            $q = ['id' => "teste-{$n}", 'codigo' => "R1-000{$n}", ...$q, 'createdAt' => $agora, 'updatedAt' => $agora];
            $linhas[] = [
                'id' => $q['id'], 'owner_id' => $admin->id, 'codigo' => $q['codigo'],
                'publicada' => true, 'publicada_em' => now(), 'deleted' => false,
                'instituicao' => $q['instituicao'], 'ano' => $q['ano'], 'area' => $q['area'],
                'data' => json_encode($q, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                'created_at_ms' => $agora, 'updated_at_ms' => $agora,
            ];
        }

        // Só insere o que falta: rodar de novo não desfaz lápide nem edição feita pelo app.
        $novas = DB::table('questions')->insertOrIgnore($linhas);
        $this->command?->line("{$novas} questões de teste publicadas (dono: admin-teste); as que já existiam ficaram como estavam.");
    }
}
