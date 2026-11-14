<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Coleções pessoais de cada usuário: attempts, folders, lists, runs, notes, reviews, prefs e marks.
 * Chave (user_id, id); o id vem do front. Sem chave estrangeira para questions (respostas antigas podem
 * apontar para questões que este servidor não tem). Nada é apagado: deleted = true.
 */
return new class extends Migration
{
    private const TABELAS = ['attempts', 'folders', 'lists', 'runs', 'notes', 'reviews', 'prefs', 'marks'];

    public function up(): void
    {
        foreach (self::TABELAS as $nome) {
            Schema::create($nome, function (Blueprint $table) use ($nome) {
                $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
                $table->text('id');
                $table->jsonb('data');
                $table->boolean('deleted')->default(false);
                $table->bigInteger('created_at_ms')->nullable();
                $table->bigInteger('updated_at_ms');
                $table->timestampTz('recebido_em', 6)->useCurrent();
                $table->primary(['user_id', 'id']);
                $table->index(['user_id', 'recebido_em']); // "o que mudou desde" (GET /api/dados?desde=)

                if ($nome === 'attempts') {
                    $table->text('question_id')->nullable();
                    $table->boolean('correct')->nullable();
                    $table->bigInteger('ts')->nullable();
                    $table->text('ctx')->nullable();
                    $table->text('run_id')->nullable();
                    $table->index(['user_id', 'question_id']);
                    $table->index(['user_id', 'ts']);
                }
                if ($nome === 'runs') {
                    $table->string('status', 30)->nullable();
                }
                if ($nome === 'reviews') {
                    $table->bigInteger('due')->nullable();
                    $table->index(['user_id', 'due']); // revisões vencidas
                }
            });

            DB::unprepared("CREATE TRIGGER {$nome}_recebido BEFORE INSERT OR UPDATE ON {$nome} FOR EACH ROW EXECUTE FUNCTION pulse_marcar_recebido()");
        }

        DB::unprepared('CREATE TRIGGER attempts_sem_delete BEFORE DELETE ON attempts FOR EACH ROW EXECUTE FUNCTION pulse_bloquear_delete()');
        DB::unprepared('CREATE TRIGGER attempts_sem_truncate BEFORE TRUNCATE ON attempts FOR EACH STATEMENT EXECUTE FUNCTION pulse_bloquear_delete()');
    }

    /** Rollback só em desenvolvimento: apaga as tabelas com os dados. Nunca roda em produção. */
    public function down(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS attempts_sem_truncate ON attempts');
        DB::unprepared('DROP TRIGGER IF EXISTS attempts_sem_delete ON attempts');
        foreach (array_reverse(self::TABELAS) as $nome) {
            Schema::dropIfExists($nome);
        }
    }
};
