<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Questões: uma tabela só, do servidor; só o admin grava (D3). O objeto do front fica inteiro em `data`.
 * Nada é apagado: remover = deleted = true (lápide). Um gatilho barra DELETE até pelo console.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('questions', function (Blueprint $table) {
            $table->text('id')->primary(); // vem do front (MQ.uid) e nunca muda
            $table->foreignId('owner_id')->constrained('users')->restrictOnDelete();
            $table->text('codigo')->nullable();
            $table->boolean('publicada')->default(false);
            $table->timestampTz('publicada_em')->nullable();
            $table->text('dup_of')->nullable(); // id da questão que ficou quando esta era repetida
            $table->text('instituicao')->nullable();
            $table->smallInteger('ano')->nullable(); // a etapa 4 converte para inteiro (ou null) antes de gravar
            $table->text('area')->nullable();
            $table->jsonb('data');
            $table->boolean('deleted')->default(false);
            $table->bigInteger('created_at_ms')->nullable();
            $table->bigInteger('updated_at_ms');
            $table->timestampTz('recebido_em', 6)->useCurrent();

            $table->index('owner_id');
            $table->index('dup_of');
            $table->index('recebido_em'); // ?desde= do estudante
        });

        DB::statement('CREATE INDEX questions_publicadas ON questions (publicada) WHERE NOT deleted');

        // Função compartilhada com a tabela attempts (migração seguinte).
        DB::unprepared(<<<'SQL'
CREATE OR REPLACE FUNCTION pulse_bloquear_delete() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Apagar linhas de % não é permitido: marque deleted = true (lápide).', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
SQL);
        DB::unprepared('CREATE TRIGGER questions_sem_delete BEFORE DELETE ON questions FOR EACH ROW EXECUTE FUNCTION pulse_bloquear_delete()');
        DB::unprepared('CREATE TRIGGER questions_sem_truncate BEFORE TRUNCATE ON questions FOR EACH STATEMENT EXECUTE FUNCTION pulse_bloquear_delete()');

        // recebido_em = relógio do servidor no momento em que a linha entrou ou mudou. Vale também no UPDATE do
        // "o mais novo vence" (a etapa 4 não precisa lembrar de atualizar), e é o que `?desde=` consulta.
        // clock_timestamp() (hora real) e não now() (início da transação), para um lote demorado não ficar para trás.
        DB::unprepared(<<<'SQL'
CREATE OR REPLACE FUNCTION pulse_marcar_recebido() RETURNS trigger AS $$
BEGIN
    NEW.recebido_em := clock_timestamp();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
SQL);
        DB::unprepared('CREATE TRIGGER questions_recebido BEFORE INSERT OR UPDATE ON questions FOR EACH ROW EXECUTE FUNCTION pulse_marcar_recebido()');
    }

    /** Rollback só em desenvolvimento: apaga as tabelas com os dados. Nunca roda em produção. */
    public function down(): void
    {
        // No rollback, a migração de attempts roda antes e já soltou o gatilho dela; aqui as funções podem sair.
        Schema::dropIfExists('questions');
        DB::unprepared('DROP FUNCTION IF EXISTS pulse_bloquear_delete()');
        DB::unprepared('DROP FUNCTION IF EXISTS pulse_marcar_recebido()');
    }
};
