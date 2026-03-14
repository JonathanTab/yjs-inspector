<?php
/**
 * Blob Storage API
 * ============================================================================
 * Handles binary file uploads and downloads for blob-type documents.
 * Works in conjunction with congruum-doc-manager.php which manages metadata.
 *
 * ENDPOINTS:
 * - upload: Upload binary content for a blob document
 * - download: Download binary content from a blob document
 * - stream: Stream binary content with range support
 * ============================================================================
 */

define('DATA_ROOT', dirname(__DIR__) . '/data/congruum-docs/');
require_once "iauth.php";
define('DB_FILE', DATA_ROOT . 'storage.sqlite');
define('BLOBS_DIR', DATA_ROOT . 'blobs/');

// Rate limiting configuration (for unauthenticated requests)
define('RATE_LIMIT_WINDOW', 3600); // 1 hour window
define('RATE_LIMIT_MAX_UPLOADS', 10); // Max uploads per IP per window for unauthenticated users
define('BLOB_MAX_SIZE', 100 * 1024 * 1024); // 100MB max file size

// Rate limiting state directory
define('RATE_LIMIT_DIR', DATA_ROOT . 'rate-limit/');
if (!is_dir(RATE_LIMIT_DIR)) {
    mkdir(RATE_LIMIT_DIR, 0777, true);
}

// Ensure blobs directory exists
if (!is_dir(BLOBS_DIR)) {
    mkdir(BLOBS_DIR, 0777, true);
}

/**
 * Get database connection
 */
function getDb() {
    static $db = null;
    if ($db === null) {
        $db = new PDO("sqlite:" . DB_FILE, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $db->exec("PRAGMA journal_mode=WAL;");
        $db->exec("PRAGMA foreign_keys=ON;");
    }
    return $db;
}

/**
 * Check if a user has administrative privileges
 */
function isAdmin($user) {
    if (!$user || !function_exists('instrumenta_get_users')) return false;
    $users = instrumenta_get_users();
    return isset($users[$user]['is_admin']) && $users[$user]['is_admin'];
}

/**
 * Get the maximum permissions a user has from folder shares for a given folder
 */
function getFolderSharePermissions($db, $folderId, $user) {
    $stmt = $db->prepare("
        SELECT MAX(fs.can_read) as can_read, MAX(fs.can_write) as can_write
        FROM folder_closure fc
        JOIN folder_shares fs ON fc.ancestor_id = fs.folder_id
        WHERE fc.descendant_id = ? AND fs.username = ?
    ");
    $stmt->execute([$folderId, $user]);
    $result = $stmt->fetch();

    return [
        'can_read' => (bool)($result['can_read'] ?? 0),
        'can_write' => (bool)($result['can_write'] ?? 0)
    ];
}

/**
 * Get the maximum public flags from a folder and all its ancestors.
 * Returns ['public_read' => bool, 'public_write' => bool]
 */
function getFolderPublicFlags($db, $folderId) {
    // First check if folder exists and get its own flags
    $stmt = $db->prepare("SELECT public_read, public_write FROM folders WHERE id = ?");
    $stmt->execute([$folderId]);
    $folder = $stmt->fetch();

    if (!$folder) {
        return ['public_read' => false, 'public_write' => false];
    }

    // Check closure table for ancestors
    $stmt = $db->prepare("
        SELECT MAX(f.public_read) as public_read, MAX(f.public_write) as public_write
        FROM folder_closure fc
        JOIN folders f ON fc.ancestor_id = f.id
        WHERE fc.descendant_id = ?
    ");
    $stmt->execute([$folderId]);
    $result = $stmt->fetch();

    // If no closure entries, return folder's own flags
    if ($result === false || ($result['public_read'] === null && $result['public_write'] === null)) {
        return [
            'public_read' => (bool)$folder['public_read'],
            'public_write' => (bool)$folder['public_write']
        ];
    }

    return [
        'public_read' => (bool)($result['public_read'] ?? 0),
        'public_write' => (bool)($result['public_write'] ?? 0)
    ];
}

/**
 * Check if a user has write access to a document.
 * Supports unauthenticated access via public_write flag.
 * @param PDO $db
 * @param string $docId
 * @param string|null $user Null for unauthenticated (public-only) access
 * @return bool
 */
function hasWriteAccess($db, $docId, $user = null) {
    // Get document with all relevant fields
    $stmt = $db->prepare("
        SELECT d.owner, d.folder_id, d.type, d.public_write, d.parent_id
        FROM files d
        WHERE d.id = ? AND d.deleted = 0
    ");
    $stmt->execute([$docId]);
    $doc = $stmt->fetch();

    if (!$doc) return false;
    if ($doc['type'] !== 'blob') return false;

    // Check document's own public flag (works for both authenticated and unauthenticated)
    if ($doc['public_write']) return true;

    // If no user, only public access is allowed
    if ($user === null) return false;

    // Admin has full access
    if (isAdmin($user)) return true;

    // Owner has full access
    if ($doc['owner'] === $user) return true;

    // Check direct document share
    $stmt = $db->prepare("
        SELECT 1 FROM file_shares
        WHERE file_id = ? AND username = ? AND can_write = 1
    ");
    $stmt->execute([$docId, $user]);
    if ($stmt->fetch()) return true;

    // Check folder share and folder public flags
    if ($doc['folder_id']) {
        // Check folder public flags
        $folderPublic = getFolderPublicFlags($db, $doc['folder_id']);
        if ($folderPublic['public_write']) return true;

        // Check folder shares
        $folderPerms = getFolderSharePermissions($db, $doc['folder_id'], $user);
        if ($folderPerms['can_write']) return true;
    }

    // Check parent document permission (inheritance)
    if ($doc['parent_id']) {
        if (hasWriteAccess($db, $doc['parent_id'], $user)) return true;
    }

    return false;
}

/**
 * Check if a user has read access to a document.
 * Supports unauthenticated access via public_read flag.
 * @param PDO $db
 * @param string $docId
 * @param string|null $user Null for unauthenticated (public-only) access
 * @return bool
 */
function hasReadAccess($db, $docId, $user = null) {
    // Get document with all relevant fields
    $stmt = $db->prepare("
        SELECT d.owner, d.folder_id, d.type, d.public_read, d.parent_id
        FROM files d
        WHERE d.id = ? AND d.deleted = 0
    ");
    $stmt->execute([$docId]);
    $doc = $stmt->fetch();

    if (!$doc) return false;
    if ($doc['type'] !== 'blob') return false;

    // Check document's own public flag (works for both authenticated and unauthenticated)
    if ($doc['public_read']) return true;

    // If no user, only public access is allowed
    if ($user === null) return false;

    // Admin has full access
    if (isAdmin($user)) return true;

    // Owner has full access
    if ($doc['owner'] === $user) return true;

    // Check direct document share
    $stmt = $db->prepare("
        SELECT 1 FROM file_shares
        WHERE file_id = ? AND username = ? AND can_read = 1
    ");
    $stmt->execute([$docId, $user]);
    if ($stmt->fetch()) return true;

    // Check folder share and folder public flags
    if ($doc['folder_id']) {
        // Check folder public flags
        $folderPublic = getFolderPublicFlags($db, $doc['folder_id']);
        if ($folderPublic['public_read']) return true;

        // Check folder shares
        $folderPerms = getFolderSharePermissions($db, $doc['folder_id'], $user);
        if ($folderPerms['can_read']) return true;
    }

    // Check parent document permission (inheritance)
    if ($doc['parent_id']) {
        if (hasReadAccess($db, $doc['parent_id'], $user)) return true;
    }

    return false;
}

/**
 * Get client IP address
 */
function getClientIp() {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    // Handle proxied requests (be careful with trust)
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $forwarded = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
        $ip = trim($forwarded[0]);
    }
    return preg_replace('/[^a-fA-F0-9.:]/', '', $ip);
}

/**
 * Check rate limit for unauthenticated uploads using atomic file locking.
 * @return bool True if within limit, false if exceeded
 */
function checkRateLimit() {
    $ip = getClientIp();
    $hash = hash('sha256', $ip);
    $rateFile = RATE_LIMIT_DIR . $hash . '.json';
    $lockFile = RATE_LIMIT_DIR . $hash . '.lock';

    $now = time();
    $windowStart = $now - RATE_LIMIT_WINDOW;

    // Use file locking for atomicity
    $lockFp = fopen($lockFile, 'c');
    if (!$lockFp) {
        // Can't acquire lock mechanism, fail open (allow the request)
        error_log('[blob-storage] Failed to open lock file for rate limiting');
        return true;
    }

    // Acquire exclusive lock (blocking)
    if (!flock($lockFp, LOCK_EX)) {
        fclose($lockFp);
        error_log('[blob-storage] Failed to acquire lock for rate limiting');
        return true;
    }

    try {
        // Read current count inside lock
        $data = ['count' => 0, 'window_start' => $now];
        if (file_exists($rateFile)) {
            $loaded = json_decode(file_get_contents($rateFile), true);
            if ($loaded && $loaded['window_start'] > $windowStart) {
                $data = $loaded;
            }
        }

        // Check if limit exceeded
        if ($data['count'] >= RATE_LIMIT_MAX_UPLOADS) {
            return false;
        }

        // Increment count and write atomically
        $data['count']++;
        $data['window_start'] = $now;

        // Write to temp file then rename for atomicity
        $tempFile = $rateFile . '.tmp.' . getmypid();
        file_put_contents($tempFile, json_encode($data));
        rename($tempFile, $rateFile);

        return true;
    } finally {
        // Always release lock
        flock($lockFp, LOCK_UN);
        fclose($lockFp);
    }
}

/**
 * Get rate limit remaining count
 */
function getRateLimitRemaining() {
    $ip = getClientIp();
    $hash = hash('sha256', $ip);
    $rateFile = RATE_LIMIT_DIR . $hash . '.json';

    if (file_exists($rateFile)) {
        $data = json_decode(file_get_contents($rateFile), true);
        if ($data) {
            return max(0, RATE_LIMIT_MAX_UPLOADS - ($data['count'] ?? 0));
        }
    }
    return RATE_LIMIT_MAX_UPLOADS;
}

/**
 * Validate document ID format
 */
function validateId($id) {
    return is_string($id) && preg_match('/^[a-zA-Z0-9_\-\.]+$/', $id);
}

/**
 * Send a JSON error response
 */
function jsonError($message, $code = 400) {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode(['error' => $message]);
    exit;
}

// Parse request
$method = $_SERVER['REQUEST_METHOD'];
$pathInfo = $_SERVER['PATH_INFO'] ?? '';
$requestUri = $_SERVER['REQUEST_URI'] ?? '';

// CORS helper for credentials support
function setCorsHeaders() {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
    if (in_array($origin, $allowedOrigins)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Credentials: true');
    } else {
        header('Access-Control-Allow-Origin: *');
    }
}

// Handle CORS preflight requests
if ($method === 'OPTIONS') {
    setCorsHeaders();
    header('Access-Control-Allow-Methods: GET, HEAD, POST, PUT, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Content-Disposition, Range, Authorization');
    header('Access-Control-Max-Age: 86400');
    http_response_code(200);
    exit;
}

// Set CORS headers for all responses
setCorsHeaders();

// Extract document ID from path or query
$docId = null;
$action = null;

// Support both path-based and query-based routing
// Path-based: /blob-storage.php/{docId}/{action}
// Query-based: /blob-storage.php?id={docId}&action={action}
if ($pathInfo && $pathInfo !== '/') {
    $parts = array_filter(explode('/', $pathInfo));
    if (count($parts) >= 1) {
        $docId = $parts[1] ?? null;
        $action = $parts[2] ?? null;
    }
} else {
    $docId = $_GET['id'] ?? null;
    $action = $_GET['action'] ?? null;
}

// If no action specified, infer from method
if (!$action) {
    $action = strtolower($method) === 'get' ? 'download' : 'upload';
}

// Validate document ID
if (!$docId || !validateId($docId)) {
    jsonError('Missing or invalid document ID', 400);
}

try {
    $db = getDb();

    switch ($action) {
        case 'upload':
            if ($method !== 'POST' && $method !== 'PUT') {
                jsonError('Method not allowed. Use POST or PUT for uploads.', 405);
            }

            // Check write access (supports unauthenticated via public_write)
            if (!hasWriteAccess($db, $docId, $authorized_user)) {
                jsonError('Write access denied', 403);
            }

            // Rate limit unauthenticated uploads
            if (!$authorized_user) {
                if (!checkRateLimit()) {
                    http_response_code(429);
                    header('Content-Type: application/json');
                    header('X-RateLimit-Limit: ' . RATE_LIMIT_MAX_UPLOADS);
                    header('X-RateLimit-Remaining: 0');
                    header('X-RateLimit-Reset: ' . (time() + RATE_LIMIT_WINDOW));
                    echo json_encode([
                        'error' => 'Rate limit exceeded. Too many uploads from this IP.',
                        'retry_after' => RATE_LIMIT_WINDOW
                    ]);
                    exit;
                }
                // Add rate limit headers
                header('X-RateLimit-Limit: ' . RATE_LIMIT_MAX_UPLOADS);
                header('X-RateLimit-Remaining: ' . getRateLimitRemaining());
            }

            // Get document info
            $stmt = $db->prepare("SELECT blob_key FROM files WHERE id = ? AND type = 'blob' AND deleted = 0");
            $stmt->execute([$docId]);
            $doc = $stmt->fetch();

            if (!$doc) {
                jsonError('Blob document not found', 404);
            }

            $blobKey = $doc['blob_key'];
            if (!$blobKey) {
                jsonError('Document has no blob key', 500);
            }

            // Get content from request body
            $content = file_get_contents('php://input');
            if ($content === false) {
                jsonError('Failed to read request body', 400);
            }

            $size = strlen($content);

            // Validate file size (default 100MB limit, configurable)
            $maxSize = defined('BLOB_MAX_SIZE') ? BLOB_MAX_SIZE : 100 * 1024 * 1024;
            if ($size > $maxSize) {
                jsonError('File size exceeds maximum allowed (' . round($maxSize / 1024 / 1024, 1) . 'MB)', 413);
            }

            // Check content-length header matches actual size (prevent truncated uploads)
            $contentLength = $_SERVER['CONTENT_LENGTH'] ?? null;
            if ($contentLength !== null && intval($contentLength) !== $size) {
                jsonError('Content-Length mismatch. Upload may be truncated.', 400);
            }

            $mimeType = $_SERVER['CONTENT_TYPE'] ?? 'application/octet-stream';

            // Get filename from Content-Disposition header if available
            $filename = null;
            $disposition = $_SERVER['HTTP_CONTENT_DISPOSITION'] ?? '';
            if (preg_match('/filename[^;=\n]*=((["\']).*?\2|[^;\n]*)/', $disposition, $matches)) {
                $filename = trim($matches[1], "\"'");
            }

            // Write blob file atomically (write to temp, then rename)
            $blobPath = BLOBS_DIR . $blobKey;
            $tempPath = $blobPath . '.tmp.' . getmypid();

            if (file_put_contents($tempPath, $content) === false) {
                @unlink($tempPath);
                jsonError('Failed to write blob file', 500);
            }

            // Atomic rename
            if (!rename($tempPath, $blobPath)) {
                @unlink($tempPath);
                jsonError('Failed to finalize blob file', 500);
            }

            // Update document metadata
            $stmt = $db->prepare("
                UPDATE files
                SET size = ?, mime_type = ?, filename = ?, updated_at = datetime('now')
                WHERE id = ?
            ");
            $stmt->execute([$size, $mimeType, $filename, $docId]);

            header('Content-Type: application/json');
            echo json_encode([
                'success' => true,
                'size' => $size,
                'mime_type' => $mimeType,
                'filename' => $filename
            ]);
            break;

        case 'download':
        case 'stream':
            if ($method !== 'GET' && $method !== 'HEAD') {
                jsonError('Method not allowed. Use GET for downloads.', 405);
            }

            if (!hasReadAccess($db, $docId, $authorized_user)) {
                jsonError('Read access denied', 403);
            }

            // Get document info
            $stmt = $db->prepare("
                SELECT blob_key, filename, mime_type, size
                FROM files
                WHERE id = ? AND type = 'blob' AND deleted = 0
            ");
            $stmt->execute([$docId]);
            $doc = $stmt->fetch();

            if (!$doc) {
                jsonError('Blob document not found', 404);
            }

            $blobKey = $doc['blob_key'];
            if (!$blobKey) {
                jsonError('Document has no blob key', 500);
            }

            $blobPath = BLOBS_DIR . $blobKey;
            if (!file_exists($blobPath)) {
                jsonError('Blob file not found', 404);
            }

            $filesize = filesize($blobPath);
            $mimeType = $doc['mime_type'] ?? 'application/octet-stream';
            $filename = $doc['filename'] ?? $docId;

            // Handle range requests for streaming
            $range = $_SERVER['HTTP_RANGE'] ?? null;
            $offset = 0;
            $length = $filesize;

            if ($range) {
                // Parse range header
                if (preg_match('/bytes=(\d+)-(\d*)/', $range, $matches)) {
                    $offset = intval($matches[1]);
                    $end = $matches[2] !== '' ? intval($matches[2]) : $filesize - 1;
                    $length = $end - $offset + 1;

                    header('HTTP/1.1 206 Partial Content');
                    header('Content-Range: bytes ' . $offset . '-' . $end . '/' . $filesize);
                }
            }

            // Set headers with proper filename encoding (RFC 5987 for Unicode)
            header('Content-Type: ' . $mimeType);
            header('Content-Length: ' . $length);
            // Use both filename and filename* for maximum compatibility
            $encodedFilename = rawurlencode($filename);
            header("Content-Disposition: attachment; filename=\"$encodedFilename\"; filename*=UTF-8''$encodedFilename");
            header('Accept-Ranges: bytes');
            header('Cache-Control: private, max-age=3600');

            // For HEAD requests, just send headers
            if ($method === 'HEAD') {
                exit;
            }

            // Stream the file
            $fp = fopen($blobPath, 'rb');
            if ($offset > 0) {
                fseek($fp, $offset);
            }

            $bufferSize = 8192;
            $sent = 0;
            while (!feof($fp) && $sent < $length) {
                $toRead = min($bufferSize, $length - $sent);
                echo fread($fp, $toRead);
                $sent += $toRead;
                flush();
            }

            fclose($fp);
            break;

        case 'info':
            if ($method !== 'GET') {
                jsonError('Method not allowed. Use GET for info.', 405);
            }

            if (!hasReadAccess($db, $docId, $authorized_user)) {
                jsonError('Read access denied', 403);
            }

            // Get document info
            $stmt = $db->prepare("
                SELECT blob_key, filename, mime_type, size, created_at, updated_at
                FROM files
                WHERE id = ? AND type = 'blob' AND deleted = 0
            ");
            $stmt->execute([$docId]);
            $doc = $stmt->fetch();

            if (!$doc) {
                jsonError('Blob document not found', 404);
            }

            $blobPath = BLOBS_DIR . $doc['blob_key'];
            $exists = file_exists($blobPath);

            header('Content-Type: application/json');
            echo json_encode([
                'id' => $docId,
                'filename' => $doc['filename'],
                'mime_type' => $doc['mime_type'],
                'size' => $doc['size'],
                'blob_exists' => $exists,
                'created_at' => $doc['created_at'],
                'updated_at' => $doc['updated_at']
            ]);
            break;

        default:
            jsonError('Unknown action: ' . $action, 400);
    }

} catch (Exception $e) {
    jsonError('Server error: ' . $e->getMessage(), 500);
}
