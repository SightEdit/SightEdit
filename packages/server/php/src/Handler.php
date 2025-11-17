<?php

namespace SightEdit;

class Handler {
    private $options;
    private $storage;
    
    public function __construct(array $options = []) {
        $this->options = array_merge([
            'storage' => 'memory',
            'storagePath' => './sightedit-data',
            'auth' => null,
            'beforeSave' => null,
            'afterSave' => null,
            'cors' => true,
            'rateLimit' => [
                'windowMs' => 60000,
                'max' => 60
            ]
        ], $options);
        
        $this->storage = $this->createStorage();
    }
    
    public function handle(array $request = null) {
        if ($request === null) {
            $request = $_POST;
        }
        
        // Handle CORS
        if ($this->options['cors']) {
            $this->applyCors();
        }
        
        // Handle OPTIONS request
        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
        
        // Check authentication
        if ($this->options['auth'] && !call_user_func($this->options['auth'], $request)) {
            $this->jsonResponse(['success' => false, 'error' => 'Unauthorized'], 401);
            return;
        }
        
        // Get the path
        $path = $_SERVER['PATH_INFO'] ?? '';
        
        try {
            switch ($path) {
                case '/save':
                    $this->handleSave($request);
                    break;
                    
                case '/batch':
                    $this->handleBatch($request);
                    break;
                    
                case (preg_match('/^\/schema\/(.+)$/', $path, $matches) ? true : false):
                    $this->handleSchema($matches[1]);
                    break;
                    
                case '/upload':
                    $this->handleUpload();
                    break;
                    
                default:
                    $this->jsonResponse(['success' => false, 'error' => 'Not found'], 404);
            }
        } catch (\Exception $e) {
            $this->jsonResponse(['success' => false, 'error' => 'Internal server error'], 500);
        }
    }
    
    private function handleSave(array $data) {
        if (!isset($data['sight']) || !isset($data['value'])) {
            $this->jsonResponse([
                'success' => false,
                'error' => 'Missing required fields: sight and value'
            ], 400);
            return;
        }
        
        if ($this->options['beforeSave']) {
            $data = call_user_func($this->options['beforeSave'], $data);
        }
        
        $data['timestamp'] = time() * 1000;
        
        $key = $this->generateKey($data);
        $this->storage->set($key, $data);
        
        if ($this->options['afterSave']) {
            call_user_func($this->options['afterSave'], $data, ['key' => $key]);
        }
        
        $this->jsonResponse([
            'success' => true,
            'data' => $data['value'],
            'version' => $data['timestamp']
        ]);
    }
    
    private function handleBatch(array $request) {
        if (!isset($request['operations']) || !is_array($request['operations'])) {
            $this->jsonResponse([
                'success' => false,
                'error' => 'Operations must be an array'
            ], 400);
            return;
        }
        
        $results = [];
        
        foreach ($request['operations'] as $operation) {
            try {
                $key = $this->generateKey($operation['data']);
                
                switch ($operation['type']) {
                    case 'create':
                    case 'update':
                        $this->storage->set($key, $operation['data']);
                        $results[] = ['success' => true];
                        break;
                        
                    case 'delete':
                        $this->storage->delete($key);
                        $results[] = ['success' => true];
                        break;
                        
                    default:
                        $results[] = ['success' => false, 'error' => 'Invalid operation type'];
                }
            } catch (\Exception $e) {
                $results[] = ['success' => false, 'error' => $e->getMessage()];
            }
        }
        
        $this->jsonResponse([
            'success' => true,
            'results' => $results
        ]);
    }
    
    private function handleSchema(string $sight) {
        // TODO: Implement schema storage and retrieval
        $this->jsonResponse([
            'type' => 'text',
            'label' => $sight,
            'placeholder' => "Enter $sight"
        ]);
    }
    
    private function handleUpload() {
        // TODO: Implement file upload
        $this->jsonResponse([
            'success' => false,
            'error' => 'Upload not implemented yet'
        ], 501);
    }
    
    private function createStorage() {
        if (is_object($this->options['storage'])) {
            return $this->options['storage'];
        }
        
        switch ($this->options['storage']) {
            case 'file':
                return new FileStorage($this->options['storagePath']);
                
            case 'database':
                throw new \Exception('Database storage not implemented. Please provide a custom storage adapter.');
                
            case 'memory':
            default:
                return new MemoryStorage();
        }
    }
    
    private function generateKey(array $data): string {
        $parts = [$data['sight']];
        
        if (isset($data['context']['recordId'])) {
            $parts[] = $data['context']['recordId'];
        }
        
        if (isset($data['id'])) {
            $parts[] = $data['id'];
        }
        
        return implode(':', $parts);
    }
    
    private function applyCors() {
        if ($this->options['cors'] === true) {
            header('Access-Control-Allow-Origin: *');
            header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
            header('Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key, X-SightEdit-Version');
            header('Access-Control-Allow-Credentials: true');
        } elseif (is_array($this->options['cors'])) {
            $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
            
            if (isset($this->options['cors']['origin'])) {
                if (is_string($this->options['cors']['origin'])) {
                    header('Access-Control-Allow-Origin: ' . $this->options['cors']['origin']);
                } elseif (is_array($this->options['cors']['origin']) && in_array($origin, $this->options['cors']['origin'])) {
                    header('Access-Control-Allow-Origin: ' . $origin);
                }
            }
            
            if (isset($this->options['cors']['methods'])) {
                header('Access-Control-Allow-Methods: ' . implode(', ', $this->options['cors']['methods']));
            }
            
            if (isset($this->options['cors']['allowedHeaders'])) {
                header('Access-Control-Allow-Headers: ' . implode(', ', $this->options['cors']['allowedHeaders']));
            }
            
            if (isset($this->options['cors']['credentials'])) {
                header('Access-Control-Allow-Credentials: true');
            }
        }
    }
    
    private function jsonResponse(array $data, int $statusCode = 200) {
        http_response_code($statusCode);
        header('Content-Type: application/json');
        echo json_encode($data);
    }
}

interface StorageAdapter {
    public function get(string $key);
    public function set(string $key, $value): void;
    public function delete(string $key): void;
    public function list(string $prefix = null): array;
}

class MemoryStorage implements StorageAdapter {
    private static $data = [];
    
    public function get(string $key) {
        return self::$data[$key] ?? null;
    }
    
    public function set(string $key, $value): void {
        self::$data[$key] = $value;
    }
    
    public function delete(string $key): void {
        unset(self::$data[$key]);
    }
    
    public function list(string $prefix = null): array {
        if ($prefix === null) {
            return array_keys(self::$data);
        }
        
        return array_filter(array_keys(self::$data), function($key) use ($prefix) {
            return strpos($key, $prefix) === 0;
        });
    }
}

class FileStorage implements StorageAdapter {
    private $basePath;

    public function __construct(string $basePath) {
        $this->basePath = realpath($basePath) ?: $basePath;

        if (!is_dir($this->basePath)) {
            // Use secure permissions (0750 = owner rwx, group r-x, others none)
            mkdir($this->basePath, 0750, true);
        }
    }

    public function get(string $key) {
        $file = $this->getFilePath($key);
        $this->validateFilePath($file);

        if (file_exists($file)) {
            return json_decode(file_get_contents($file), true);
        }
        return null;
    }

    public function set(string $key, $value): void {
        $file = $this->getFilePath($key);
        $this->validateFilePath($file);

        $dir = dirname($file);
        if (!is_dir($dir)) {
            // Use secure permissions (0750)
            mkdir($dir, 0750, true);
        }

        file_put_contents($file, json_encode($value));
        // Set secure file permissions (0640 = owner rw, group r, others none)
        chmod($file, 0640);
    }

    public function delete(string $key): void {
        $file = $this->getFilePath($key);
        $this->validateFilePath($file);

        if (file_exists($file)) {
            unlink($file);
        }
    }

    public function list(string $prefix = null): array {
        // TODO: Implement file listing with proper security checks
        return [];
    }

    private function getFilePath(string $key): string {
        // Sanitize key to prevent path traversal
        $safe_key = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $key);
        return $this->basePath . DIRECTORY_SEPARATOR . $safe_key . '.json';
    }

    /**
     * Validate file path to prevent path traversal attacks
     */
    private function validateFilePath(string $filePath): void {
        // Get the real path (resolves symlinks and relative paths)
        $realPath = file_exists($filePath) ? realpath($filePath) : realpath(dirname($filePath)) . DIRECTORY_SEPARATOR . basename($filePath);
        $realBasePath = realpath($this->basePath);

        // Check if the file is within the base directory
        if ($realBasePath === false || strpos($realPath, $realBasePath . DIRECTORY_SEPARATOR) !== 0) {
            throw new \Exception('Path traversal attempt detected: access denied');
        }

        // Prevent access to hidden files
        $fileName = basename($filePath);
        if (strpos($fileName, '.') === 0 && $fileName !== '.json') {
            throw new \Exception('Access to hidden files not allowed');
        }
    }
}