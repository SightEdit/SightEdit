<?php

// Example usage of SightEdit PHP handler

require_once __DIR__ . '/src/Handler.php';

use SightEdit\Handler;

// Create handler with options
$handler = new Handler([
    'storage' => 'file',
    'storagePath' => __DIR__ . '/data',
    'auth' => function($request) {
        // Example: Check if user is logged in
        session_start();
        return isset($_SESSION['user_id']) && $_SESSION['is_admin'];
    },
    'beforeSave' => function($data) {
        // Example: Add user info to save data
        $data['user_id'] = $_SESSION['user_id'] ?? null;
        $data['ip'] = $_SERVER['REMOTE_ADDR'];
        return $data;
    },
    'afterSave' => function($data, $result) {
        // Example: Log the change
        error_log("Content updated: {$data['sight']} by user {$data['user_id']}");
    },
    'cors' => [
        'origin' => ['http://localhost:3000', 'https://yourdomain.com'],
        'credentials' => true
    ]
]);

// Handle the request
$handler->handle();

// Or if you want to handle a custom request array:
// $handler->handle($_POST);