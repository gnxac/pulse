<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Imagens das questões, no PostgreSQL (nunca no disco do contêiner). `question_id` decide quem pode ver (etapa 7).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('media', function (Blueprint $table) {
            $table->text('id')->primary();
            $table->foreignId('owner_id')->constrained('users')->restrictOnDelete();
            $table->text('question_id')->nullable();
            $table->string('mime', 100);
            $table->binary('bytes'); // bytea
            $table->integer('size');
            $table->boolean('deleted')->default(false);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('recebido_em', 6)->useCurrent();

            $table->index('question_id');
            $table->index('owner_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('media');
    }
};
