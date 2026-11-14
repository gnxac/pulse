<?php

// O resto vem do padrão do Laravel (as chaves de cima são mescladas com as do framework).
return [
    'bcrypt' => [
        'rounds' => env('BCRYPT_ROUNDS', 12),
        'verify' => env('HASH_VERIFY', true),
        // O bcrypt só usa os primeiros 72 bytes: acima disso, Hash::make recusa em vez de cortar calado.
        // A validação (User::regrasSenha) avisa antes, com mensagem clara.
        'limit' => 72,
    ],
];
