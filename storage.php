<?php
/**
 * Storage API
 * ==========
 * Unified file and folder management for the Instrumenta platform.
 *
 * Two scopes:
 *   'drive' - user's file system (folders, sharing, browsing)
 *   'app'   - app-specific flat storage (requires 'app' field, no folders)
 *
 * Two file types:
 *   'yjs'  - real-time collaborative Yjs document (has room_id)
 *   'blob' - binary file (has blob_key = file id)
 *
 * Authentication: session or ?apikey= (via iauth.php)
 */

define('DATA_ROOT', dirname(__DIR__) . '/data/congruum-docs/');
require_once "iauth.php";
define('DB_FILE', DATA_ROOT . 'storage.sqlite');
define('BLOBS_DIR', DATA_ROOT . 'blobs/');

header('Content-Type: application/json');

if (!is_dir(DATA_ROOT)) mkdir(DATA_ROOT, 0777, true);
if (!is_dir(BLOBS_DIR))  mkdir(BLOBS_DIR,  0777, true);

// ============================================================
// Database Init
// ============================================================

try {
    $db = new PDO('sqlite:' . DB_FILE, null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $db->exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');

    $db->exec("
        CREATE TABLE IF NOT EXISTS files (
            id           TEXT PRIMARY KEY,
            owner        TEXT NOT NULL,
            app          TEXT,
            title        TEXT NOT NULL DEFAULT 'Untitled',
            type         TEXT NOT NULL DEFAULT 'yjs',
            scope        TEXT NOT NULL DEFAULT 'drive',
            folder_id    TEXT REFERENCES folders(id) ON DELETE RESTRICT,
            parent_id    TEXT REFERENCES files(id)   ON DELETE CASCADE,
            room_id      TEXT,
            blob_key     TEXT,
            mime_type    TEXT,
            size         INTEGER DEFAULT 0,
            filename     TEXT,
            public_read  INTEGER NOT NULL DEFAULT 0,
            public_write INTEGER NOT NULL DEFAULT 0,
            deleted      INTEGER NOT NULL DEFAULT 0,
            created_at   TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS file_shares (
            file_id   TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
            username  TEXT NOT NULL,
            can_read  INTEGER NOT NULL DEFAULT 1,
            can_write INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (file_id, username)
        );

        CREATE TABLE IF NOT EXISTS folders (
            id           TEXT PRIMARY KEY,
            owner        TEXT NOT NULL,
            name         TEXT NOT NULL,
            parent_id    TEXT REFERENCES folders(id) ON DELETE CASCADE,
            public_read  INTEGER NOT NULL DEFAULT 0,
            public_write INTEGER NOT NULL DEFAULT 0,
            created_at   TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS folder_shares (
            folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
            username  TEXT NOT NULL,
            can_read  INTEGER NOT NULL DEFAULT 1,
            can_write INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (folder_id, username)
        );

        CREATE TABLE IF NOT EXISTS folder_closure (
            ancestor_id   TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
            descendant_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
            depth         INTEGER NOT NULL,
            PRIMARY KEY (ancestor_id, descendant_id)
        );

        CREATE INDEX IF NOT EXISTS idx_files_owner           ON files(owner);
        CREATE INDEX IF NOT EXISTS idx_files_scope           ON files(scope);
        CREATE INDEX IF NOT EXISTS idx_files_folder          ON files(folder_id);
        CREATE INDEX IF NOT EXISTS idx_files_parent          ON files(parent_id);
        CREATE INDEX IF NOT EXISTS idx_files_app             ON files(app);
        CREATE INDEX IF NOT EXISTS idx_file_shares_user      ON file_shares(username);
        CREATE INDEX IF NOT EXISTS idx_folders_owner         ON folders(owner);
        CREATE INDEX IF NOT EXISTS idx_folders_parent        ON folders(parent_id);
        CREATE INDEX IF NOT EXISTS idx_folder_shares_user    ON folder_shares(username);
        CREATE INDEX IF NOT EXISTS idx_closure_descendant    ON folder_closure(descendant_id);
        CREATE INDEX IF NOT EXISTS idx_closure_ancestor      ON folder_closure(ancestor_id);
    ");
} catch (PDOException $e) {
    http_response_code(500);
    die(json_encode(['error' => 'Database error: ' . $e->getMessage()]));
}

// ============================================================
// Response Helpers
// ============================================================

function respond($data, int $code = 200): never {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function error(string $message, int $code = 400): never {
    http_response_code($code);
    echo json_encode(['error' => $message]);
    exit;
}

function requireAuth(): string {
    global $authorized_user;
    if (!$authorized_user) error('Authentication required', 401);
    return $authorized_user;
}

function requirePost(): void {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') error('POST required', 405);
}

// ============================================================
// Utilities
// ============================================================

function isAdmin(string $user): bool {
    $users = instrumenta_get_users();
    return !empty($users[$user]['is_admin']);
}

function validateId(string $id): bool {
    return (bool) preg_match('/^[a-zA-Z0-9_\-\.]+$/', $id);
}

function generateId(): string {
    return bin2hex(random_bytes(12));
}

function generateRoomId(): string {
    $data    = random_bytes(16);
    $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
    $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

function post(string $key, string $default = ''): string {
    return trim($_POST[$key] ?? $default);
}

function postBool(string $key): int {
    return empty($_POST[$key]) ? 0 : 1;
}

// ============================================================
// Normalization
// ============================================================

function parseShares(?string $raw): array {
    if (!$raw) return [];
    $shares = [];
    foreach (explode(',', $raw) as $entry) {
        $parts = explode('|', $entry);
        if (count($parts) !== 3) continue;
        $perms = [];
        if ($parts[1]) $perms[] = 'read';
        if ($parts[2]) $perms[] = 'write';
        $shares[] = ['username' => $parts[0], 'permissions' => $perms];
    }
    return $shares;
}

function normalizeFile(array $row): array {
    return [
        'id'          => $row['id'],
        'owner'       => $row['owner'],
        'app'         => $row['app'] ?? null,
        'title'       => $row['title'],
        'type'        => $row['type'],
        'scope'       => $row['scope'],
        'folderId'    => $row['folder_id']  ?? null,
        'parentId'    => $row['parent_id']  ?? null,
        'roomId'      => $row['room_id']    ?? null,
        'blobKey'     => $row['blob_key']   ?? null,
        'mimeType'    => $row['mime_type']  ?? null,
        'size'        => isset($row['size']) ? (int)$row['size'] : null,
        'filename'    => $row['filename']   ?? null,
        'publicRead'  => (bool)$row['public_read'],
        'publicWrite' => (bool)$row['public_write'],
        'deleted'     => (bool)$row['deleted'],
        'createdAt'   => $row['created_at'],
        'updatedAt'   => $row['updated_at'],
        'sharedWith'  => parseShares($row['shares_raw'] ?? null),
    ];
}

function normalizeFolder(array $row): array {
    return [
        'id'          => $row['id'],
        'owner'       => $row['owner'],
        'name'        => $row['name'],
        'parentId'    => $row['parent_id']  ?? null,
        'publicRead'  => (bool)$row['public_read'],
        'publicWrite' => (bool)$row['public_write'],
        'createdAt'   => $row['created_at'],
        'updatedAt'   => $row['updated_at'],
        'sharedWith'  => parseShares($row['shares_raw'] ?? null),
    ];
}

// ============================================================
// Access Control
// ============================================================

/**
 * Returns whether user has read access to a folder (checks ancestry via closure table).
 */
function canReadFolder(PDO $db, string $folderId, string $user): bool {
    $stmt = $db->prepare("
        SELECT 1 FROM folders fol
        WHERE fol.id = ? AND (
            fol.owner = ?
            OR fol.public_read = 1
            OR EXISTS (
                SELECT 1 FROM folder_closure fc
                JOIN folder_shares fs ON fs.folder_id = fc.ancestor_id
                WHERE fc.descendant_id = fol.id AND fs.username = ? AND fs.can_read = 1
            )
        )
    ");
    $stmt->execute([$folderId, $user, $user]);
    return (bool)$stmt->fetch();
}

/**
 * Returns whether user has write access to a folder.
 */
function canWriteFolder(PDO $db, string $folderId, string $user): bool {
    $stmt = $db->prepare("
        SELECT 1 FROM folders fol
        WHERE fol.id = ? AND (
            fol.owner = ?
            OR fol.public_write = 1
            OR EXISTS (
                SELECT 1 FROM folder_closure fc
                JOIN folder_shares fs ON fs.folder_id = fc.ancestor_id
                WHERE fc.descendant_id = fol.id AND fs.username = ? AND fs.can_write = 1
            )
        )
    ");
    $stmt->execute([$folderId, $user, $user]);
    return (bool)$stmt->fetch();
}

/**
 * Returns whether user has read access to a file.
 * Checks: owner, public_read, direct share, folder access, parent file access.
 */
function canReadFile(PDO $db, string $fileId, ?string $user): bool {
    $stmt = $db->prepare("SELECT owner, folder_id, public_read, parent_id FROM files WHERE id = ? AND deleted = 0");
    $stmt->execute([$fileId]);
    $file = $stmt->fetch();
    if (!$file) return false;
    if ($file['public_read']) return true;
    if (!$user) return false;
    if (isAdmin($user) || $file['owner'] === $user) return true;

    $stmt = $db->prepare("SELECT 1 FROM file_shares WHERE file_id = ? AND username = ? AND can_read = 1");
    $stmt->execute([$fileId, $user]);
    if ($stmt->fetch()) return true;

    if ($file['folder_id'] && canReadFolder($db, $file['folder_id'], $user)) return true;
    if ($file['parent_id'] && canReadFile($db, $file['parent_id'], $user)) return true;

    return false;
}

/**
 * Returns whether user has write access to a file.
 */
function canWriteFile(PDO $db, string $fileId, ?string $user): bool {
    $stmt = $db->prepare("SELECT owner, folder_id, public_write, parent_id FROM files WHERE id = ? AND deleted = 0");
    $stmt->execute([$fileId]);
    $file = $stmt->fetch();
    if (!$file) return false;
    if ($file['public_write']) return true;
    if (!$user) return false;
    if (isAdmin($user) || $file['owner'] === $user) return true;

    $stmt = $db->prepare("SELECT 1 FROM file_shares WHERE file_id = ? AND username = ? AND can_write = 1");
    $stmt->execute([$fileId, $user]);
    if ($stmt->fetch()) return true;

    if ($file['folder_id'] && canWriteFolder($db, $file['folder_id'], $user)) return true;
    if ($file['parent_id'] && canWriteFile($db, $file['parent_id'], $user)) return true;

    return false;
}

// ============================================================
// Fetch Helpers (for responses)
// ============================================================

function fetchFile(PDO $db, string $id): ?array {
    $stmt = $db->prepare("
        SELECT f.*, GROUP_CONCAT(fs.username || '|' || fs.can_read || '|' || fs.can_write, ',') as shares_raw
        FROM files f
        LEFT JOIN file_shares fs ON fs.file_id = f.id
        WHERE f.id = ?
        GROUP BY f.id
    ");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ? normalizeFile($row) : null;
}

function fetchFolder(PDO $db, string $id): ?array {
    $stmt = $db->prepare("
        SELECT fol.*, GROUP_CONCAT(fs.username || '|' || fs.can_read || '|' || fs.can_write, ',') as shares_raw
        FROM folders fol
        LEFT JOIN folder_shares fs ON fs.folder_id = fol.id
        WHERE fol.id = ?
        GROUP BY fol.id
    ");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ? normalizeFolder($row) : null;
}

// ============================================================
// Folder Closure Helpers
// ============================================================

function insertFolderClosure(PDO $db, string $folderId, ?string $parentId): void {
    // Self-reference (depth 0)
    $db->prepare("INSERT INTO folder_closure (ancestor_id, descendant_id, depth) VALUES (?, ?, 0)")
       ->execute([$folderId, $folderId]);

    if ($parentId) {
        // Inherit all ancestor rows from parent, incrementing depth
        $db->prepare("
            INSERT INTO folder_closure (ancestor_id, descendant_id, depth)
            SELECT ancestor_id, ?, depth + 1
            FROM folder_closure WHERE descendant_id = ?
        ")->execute([$folderId, $parentId]);
    }
}

function removeFolderFromClosure(PDO $db, string $folderId): void {
    $db->prepare("DELETE FROM folder_closure WHERE descendant_id = ? OR ancestor_id = ?")
       ->execute([$folderId, $folderId]);
}

// ============================================================
// Request Routing
// ============================================================

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? $_POST['action'] ?? '';

if ($method === 'OPTIONS') {
    http_response_code(200);
    exit;
}

try {
    switch ($action) {

        // ====================================================
        // SYNC
        // ====================================================

        case 'full_sync': {
            $user    = requireAuth();
            $isAdmin = isAdmin($user);

            // Admin mode options (only honoured for real admins)
            $adminAll       = false;
            $viewAs         = $user;
            $includeDeleted = false;

            if ($isAdmin) {
                $impersonate = trim($_GET['impersonate'] ?? '');
                $adminMode   = !empty($_GET['admin_mode']); // explicit request to see all
                
                if ($impersonate && $impersonate !== $user) {
                    $viewAs = $impersonate; // show exactly what this user would see
                } elseif ($adminMode) {
                    $adminAll = true; // explicit admin mode - see everything
                }
                // else: admin sees their normal user scope (no special treatment)
                
                $includeDeleted = !empty($_GET['include_deleted']);
            }

            $deletedClause = $includeDeleted ? '' : 'AND f.deleted = 0';

            if ($adminAll) {
                // Admin all: every file regardless of ownership / sharing
                $filesStmt = $db->prepare("
                    SELECT f.*, GROUP_CONCAT(fs.username || '|' || fs.can_read || '|' || fs.can_write, ',') as shares_raw
                    FROM files f
                    LEFT JOIN file_shares fs ON fs.file_id = f.id
                    WHERE 1=1 $deletedClause
                    GROUP BY f.id
                    ORDER BY f.updated_at DESC
                ");
                $filesStmt->execute();

                $foldersStmt = $db->prepare("
                    SELECT fol.*, GROUP_CONCAT(fs.username || '|' || fs.can_read || '|' || fs.can_write, ',') as shares_raw
                    FROM folders fol
                    LEFT JOIN folder_shares fs ON fs.folder_id = fol.id
                    GROUP BY fol.id
                    ORDER BY fol.updated_at DESC
                ");
                $foldersStmt->execute();
            } else {
                // Standard access-filtered query, evaluated for $viewAs
                $filesStmt = $db->prepare("
                    SELECT f.*, GROUP_CONCAT(fs.username || '|' || fs.can_read || '|' || fs.can_write, ',') as shares_raw
                    FROM files f
                    LEFT JOIN file_shares fs ON fs.file_id = f.id
                    WHERE (1=1 $deletedClause) AND (
                        f.owner = :user
                        OR f.public_read = 1
                        OR EXISTS (SELECT 1 FROM file_shares WHERE file_id = f.id AND username = :user AND can_read = 1)
                        OR (f.folder_id IS NOT NULL AND (
                            EXISTS (SELECT 1 FROM folders WHERE id = f.folder_id AND owner = :user)
                            OR EXISTS (SELECT 1 FROM folders WHERE id = f.folder_id AND public_read = 1)
                            OR EXISTS (
                                SELECT 1 FROM folder_closure fc
                                JOIN folder_shares fsh ON fsh.folder_id = fc.ancestor_id
                                WHERE fc.descendant_id = f.folder_id AND fsh.username = :user AND fsh.can_read = 1
                            )
                        ))
                    )
                    GROUP BY f.id
                    ORDER BY f.updated_at DESC
                ");
                $filesStmt->execute([':user' => $viewAs]);

                $foldersStmt = $db->prepare("
                    SELECT fol.*, GROUP_CONCAT(fs.username || '|' || fs.can_read || '|' || fs.can_write, ',') as shares_raw
                    FROM folders fol
                    LEFT JOIN folder_shares fs ON fs.folder_id = fol.id
                    WHERE (
                        fol.owner = :user
                        OR fol.public_read = 1
                        OR EXISTS (
                            SELECT 1 FROM folder_closure fc
                            JOIN folder_shares fsh ON fsh.folder_id = fc.ancestor_id
                            WHERE fc.descendant_id = fol.id AND fsh.username = :user AND fsh.can_read = 1
                        )
                    )
                    GROUP BY fol.id
                    ORDER BY fol.updated_at DESC
                ");
                $foldersStmt->execute([':user' => $viewAs]);
            }

            $files   = array_map('normalizeFile',   $filesStmt->fetchAll());
            $folders = array_map('normalizeFolder', $foldersStmt->fetchAll());

            respond([
                'files'    => $files,
                'folders'  => $folders,
                'viewAs'   => $viewAs,
                'adminAll' => $adminAll,
            ]);
        }

        // ====================================================
        // FILE OPERATIONS
        // ====================================================

        case 'create': {
            requirePost();
            $user = requireAuth();

            $id          = post('id');
            $title       = post('title') ?: 'Untitled';
            $type        = post('type')  ?: 'yjs';
            $scope       = post('scope') ?: 'drive';
            $app         = post('app')   ?: null;
            $folderId    = post('folder_id')  ?: null;
            $parentId    = post('parent_id')  ?: null;
            $publicRead  = postBool('public_read');
            $publicWrite = postBool('public_write');

            if (!in_array($type,  ['yjs', 'blob']))    error('Invalid type');
            if (!in_array($scope, ['drive', 'app']))   error('Invalid scope');
            if ($scope === 'app' && !$app)             error('app is required for app-scoped files');

            // Generate ID if not provided
            if (!$id) $id = ($app ? $app . '_' : '') . generateId();
            if (!validateId($id)) error('Invalid id format');

            // Access checks
            if ($folderId && !canWriteFolder($db, $folderId, $user)) error('No write access to folder', 403);
            if ($parentId && !canWriteFile($db, $parentId, $user))   error('No write access to parent', 403);

            $roomId  = null;
            $blobKey = null;
            if ($type === 'yjs')  $roomId  = generateRoomId();
            if ($type === 'blob') $blobKey = $id;

            $mimeType = $type === 'blob' ? (post('mime_type') ?: null)  : null;
            $size     = $type === 'blob' ? (int)(post('size') ?: '0')   : null;
            $filename = $type === 'blob' ? (post('filename') ?: null)   : null;

            $db->prepare("
                INSERT INTO files (id, owner, app, title, type, scope, folder_id, parent_id,
                                   room_id, blob_key, mime_type, size, filename, public_read, public_write)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ")->execute([$id, $user, $app, $title, $type, $scope, $folderId, $parentId,
                         $roomId, $blobKey, $mimeType, $size, $filename, $publicRead, $publicWrite]);

            respond(fetchFile($db, $id));
        }

        case 'rename': {
            requirePost();
            $user  = requireAuth();
            $id    = post('id');
            $title = post('title');
            if (!$id || !$title) error('id and title required');
            if (!canWriteFile($db, $id, $user)) error('Access denied', 403);

            $db->prepare("UPDATE files SET title = ?, updated_at = datetime('now') WHERE id = ?")
               ->execute([$title, $id]);
            respond(fetchFile($db, $id));
        }

        case 'delete': {
            requirePost();
            $user = requireAuth();
            $id   = post('id');
            if (!$id) error('id required');
            if (!canWriteFile($db, $id, $user)) error('Access denied', 403);

            $db->prepare("UPDATE files SET deleted = 1, updated_at = datetime('now') WHERE id = ?")
               ->execute([$id]);
            respond(['success' => true]);
        }

        case 'restore': {
            requirePost();
            $user = requireAuth();
            $id   = post('id');
            if (!$id) error('id required');

            $stmt = $db->prepare("SELECT owner FROM files WHERE id = ?");
            $stmt->execute([$id]);
            $file = $stmt->fetch();
            if (!$file || ($file['owner'] !== $user && !isAdmin($user))) error('Access denied', 403);

            $db->prepare("UPDATE files SET deleted = 0, updated_at = datetime('now') WHERE id = ?")
               ->execute([$id]);
            respond(fetchFile($db, $id));
        }

        case 'permanent_delete': {
            requirePost();
            $user = requireAuth();
            $id   = post('id');
            if (!$id) error('id required');

            $stmt = $db->prepare("SELECT owner, blob_key FROM files WHERE id = ?");
            $stmt->execute([$id]);
            $file = $stmt->fetch();
            if (!$file || ($file['owner'] !== $user && !isAdmin($user))) error('Access denied', 403);

            if ($file['blob_key']) {
                $blobPath = BLOBS_DIR . $file['blob_key'];
                if (file_exists($blobPath)) @unlink($blobPath);
            }

            $db->prepare("DELETE FROM files WHERE id = ?")->execute([$id]);
            respond(['success' => true]);
        }

        case 'move_file': {
            requirePost();
            $user           = requireAuth();
            $id             = post('id');
            $targetFolderId = post('target_folder_id') ?: null;
            if (!$id) error('id required');
            if (!canWriteFile($db, $id, $user)) error('Access denied', 403);
            if ($targetFolderId && !canWriteFolder($db, $targetFolderId, $user)) error('No write access to target folder', 403);

            $db->prepare("UPDATE files SET folder_id = ?, updated_at = datetime('now') WHERE id = ?")
               ->execute([$targetFolderId, $id]);
            respond(fetchFile($db, $id));
        }

        case 'set_parent': {
            requirePost();
            $user     = requireAuth();
            $id       = post('id');
            $parentId = post('parent_id') ?: null;
            if (!$id) error('id required');
            if (!canWriteFile($db, $id, $user)) error('Access denied', 403);
            if ($parentId && !canWriteFile($db, $parentId, $user)) error('No write access to parent', 403);

            $db->prepare("UPDATE files SET parent_id = ?, updated_at = datetime('now') WHERE id = ?")
               ->execute([$parentId, $id]);
            respond(fetchFile($db, $id));
        }

        case 'share': {
            requirePost();
            $user        = requireAuth();
            $id          = post('id');
            $shareWith   = post('username');
            $permissions = post('permissions') ?: 'read';
            if (!$id || !$shareWith) error('id and username required');
            if (!canWriteFile($db, $id, $user)) error('Access denied', 403);

            $canRead  = str_contains($permissions, 'read')  ? 1 : 0;
            $canWrite = str_contains($permissions, 'write') ? 1 : 0;

            $db->prepare("
                INSERT INTO file_shares (file_id, username, can_read, can_write) VALUES (?, ?, ?, ?)
                ON CONFLICT(file_id, username) DO UPDATE SET can_read = excluded.can_read, can_write = excluded.can_write
            ")->execute([$id, $shareWith, $canRead, $canWrite]);
            respond(fetchFile($db, $id));
        }

        case 'revoke': {
            requirePost();
            $user       = requireAuth();
            $id         = post('id');
            $revokeUser = post('username');
            if (!$id || !$revokeUser) error('id and username required');
            if (!canWriteFile($db, $id, $user)) error('Access denied', 403);

            $db->prepare("DELETE FROM file_shares WHERE file_id = ? AND username = ?")
               ->execute([$id, $revokeUser]);
            respond(fetchFile($db, $id));
        }

        case 'set_public': {
            requirePost();
            $user        = requireAuth();
            $id          = post('id');
            $publicRead  = postBool('public_read');
            $publicWrite = postBool('public_write');
            if (!$id) error('id required');
            if (!canWriteFile($db, $id, $user)) error('Access denied', 403);

            $db->prepare("UPDATE files SET public_read = ?, public_write = ?, updated_at = datetime('now') WHERE id = ?")
               ->execute([$publicRead, $publicWrite, $id]);
            respond(fetchFile($db, $id));
        }

        // ====================================================
        // FOLDER OPERATIONS
        // ====================================================

        case 'create_folder': {
            requirePost();
            $user        = requireAuth();
            $name        = post('name');
            $parentId    = post('parent_id') ?: null;
            $publicRead  = postBool('public_read');
            $publicWrite = postBool('public_write');
            if (!$name) error('name required');
            if ($parentId && !canWriteFolder($db, $parentId, $user)) error('No write access to parent', 403);

            $id = generateId();
            $db->beginTransaction();
            $db->prepare("
                INSERT INTO folders (id, owner, name, parent_id, public_read, public_write)
                VALUES (?, ?, ?, ?, ?, ?)
            ")->execute([$id, $user, $name, $parentId, $publicRead, $publicWrite]);
            insertFolderClosure($db, $id, $parentId);
            $db->commit();

            respond(fetchFolder($db, $id));
        }

        case 'rename_folder': {
            requirePost();
            $user     = requireAuth();
            $folderId = post('folder_id');
            $name     = post('name');
            if (!$folderId || !$name) error('folder_id and name required');
            if (!canWriteFolder($db, $folderId, $user)) error('Access denied', 403);

            $db->prepare("UPDATE folders SET name = ?, updated_at = datetime('now') WHERE id = ?")
               ->execute([$name, $folderId]);
            respond(fetchFolder($db, $folderId));
        }

        case 'delete_folder': {
            requirePost();
            $user     = requireAuth();
            $folderId = post('folder_id');
            if (!$folderId) error('folder_id required');

            $stmt = $db->prepare("SELECT owner FROM folders WHERE id = ?");
            $stmt->execute([$folderId]);
            $folder = $stmt->fetch();
            if (!$folder || ($folder['owner'] !== $user && !isAdmin($user))) error('Access denied', 403);

            $db->beginTransaction();

            // Soft-delete all files in this folder subtree
            $db->prepare("
                UPDATE files SET deleted = 1, updated_at = datetime('now')
                WHERE folder_id IN (SELECT descendant_id FROM folder_closure WHERE ancestor_id = ?)
            ")->execute([$folderId]);

            // Collect descendant folder IDs (deepest first)
            $stmt = $db->prepare("SELECT descendant_id FROM folder_closure WHERE ancestor_id = ? ORDER BY depth DESC");
            $stmt->execute([$folderId]);
            $descendants = $stmt->fetchAll(PDO::FETCH_COLUMN);

            foreach ($descendants as $descId) {
                removeFolderFromClosure($db, $descId);
                $db->prepare("DELETE FROM folders WHERE id = ?")->execute([$descId]);
            }

            $db->commit();
            respond(['success' => true]);
        }

        case 'move_folder': {
            requirePost();
            $user        = requireAuth();
            $folderId    = post('folder_id');
            $newParentId = post('target_parent_id') ?: null;
            if (!$folderId) error('folder_id required');
            if (!canWriteFolder($db, $folderId, $user)) error('Access denied', 403);
            if ($newParentId && !canWriteFolder($db, $newParentId, $user)) error('No write access to target', 403);

            // Prevent moving into own descendant
            if ($newParentId) {
                $stmt = $db->prepare("SELECT 1 FROM folder_closure WHERE ancestor_id = ? AND descendant_id = ?");
                $stmt->execute([$folderId, $newParentId]);
                if ($stmt->fetch()) error('Cannot move folder into its own descendant');
            }

            $stmt = $db->prepare("SELECT parent_id FROM folders WHERE id = ?");
            $stmt->execute([$folderId]);
            $oldParentId = $stmt->fetchColumn();

            $db->beginTransaction();

            // Detach from old ancestor chain
            if ($oldParentId) {
                $db->prepare("
                    DELETE FROM folder_closure
                    WHERE descendant_id IN (SELECT descendant_id FROM folder_closure WHERE ancestor_id = ?)
                      AND ancestor_id   IN (SELECT ancestor_id   FROM folder_closure WHERE descendant_id = ? AND ancestor_id != descendant_id)
                ")->execute([$folderId, $folderId]);
            }

            // Update parent
            $db->prepare("UPDATE folders SET parent_id = ?, updated_at = datetime('now') WHERE id = ?")
               ->execute([$newParentId, $folderId]);

            // Attach to new ancestor chain
            if ($newParentId) {
                $db->prepare("
                    INSERT INTO folder_closure (ancestor_id, descendant_id, depth)
                    SELECT a.ancestor_id, b.descendant_id, a.depth + b.depth + 1
                    FROM folder_closure a
                    JOIN folder_closure b ON b.ancestor_id = ?
                    WHERE a.descendant_id = ?
                ")->execute([$folderId, $newParentId]);
            }

            $db->commit();
            respond(fetchFolder($db, $folderId));
        }

        case 'share_folder': {
            requirePost();
            $user        = requireAuth();
            $folderId    = post('folder_id');
            $shareWith   = post('username');
            $permissions = post('permissions') ?: 'read';
            if (!$folderId || !$shareWith) error('folder_id and username required');
            if (!canWriteFolder($db, $folderId, $user)) error('Access denied', 403);

            $canRead  = str_contains($permissions, 'read')  ? 1 : 0;
            $canWrite = str_contains($permissions, 'write') ? 1 : 0;

            $db->prepare("
                INSERT INTO folder_shares (folder_id, username, can_read, can_write) VALUES (?, ?, ?, ?)
                ON CONFLICT(folder_id, username) DO UPDATE SET can_read = excluded.can_read, can_write = excluded.can_write
            ")->execute([$folderId, $shareWith, $canRead, $canWrite]);
            respond(fetchFolder($db, $folderId));
        }

        case 'revoke_folder_share': {
            requirePost();
            $user       = requireAuth();
            $folderId   = post('folder_id');
            $revokeUser = post('username');
            if (!$folderId || !$revokeUser) error('folder_id and username required');
            if (!canWriteFolder($db, $folderId, $user)) error('Access denied', 403);

            $db->prepare("DELETE FROM folder_shares WHERE folder_id = ? AND username = ?")
               ->execute([$folderId, $revokeUser]);
            respond(fetchFolder($db, $folderId));
        }

        case 'set_folder_public': {
            requirePost();
            $user        = requireAuth();
            $folderId    = post('folder_id');
            $publicRead  = postBool('public_read');
            $publicWrite = postBool('public_write');
            if (!$folderId) error('folder_id required');
            if (!canWriteFolder($db, $folderId, $user)) error('Access denied', 403);

            $db->prepare("UPDATE folders SET public_read = ?, public_write = ?, updated_at = datetime('now') WHERE id = ?")
               ->execute([$publicRead, $publicWrite, $folderId]);
            respond(fetchFolder($db, $folderId));
        }

        // ====================================================
        // USERS
        // ====================================================

        case 'users': {
            $user    = requireAuth();
            $isAdmin = isAdmin($user);
            $users   = instrumenta_get_users();
            $result  = [];
            foreach ($users as $username => $data) {
                $entry = [
                    'username'    => $username,
                    'displayName' => $data['display_name'] ?? $username,
                    'isAdmin'     => !empty($data['is_admin']),
                ];
                if ($isAdmin) {
                    $entry['invitedApps'] = $data['invited_apps'] ?? [];
                    $entry['hasApiKey']   = !empty($data['api_key']);
                }
                $result[] = $entry;
            }
            respond($result);
        }

        // ====================================================
        // ADMIN OPERATIONS
        // ====================================================

        case 'admin_stats': {
            $user = requireAuth();
            if (!isAdmin($user)) error('Admin required', 403);

            $fileStats = $db->query("
                SELECT
                    COUNT(*) FILTER (WHERE deleted = 0)                    AS total_active,
                    COUNT(*) FILTER (WHERE deleted = 1)                    AS total_deleted,
                    COUNT(*) FILTER (WHERE type = 'yjs'  AND deleted = 0)  AS yjs_count,
                    COUNT(*) FILTER (WHERE type = 'blob' AND deleted = 0)  AS blob_count,
                    COUNT(*) FILTER (WHERE scope = 'drive' AND deleted = 0) AS drive_count,
                    COUNT(*) FILTER (WHERE scope = 'app'  AND deleted = 0)  AS app_count,
                    COALESCE(SUM(CASE WHEN deleted = 0 THEN COALESCE(size, 0) ELSE 0 END), 0) AS total_size,
                    COUNT(DISTINCT owner) AS unique_owners
                FROM files
            ")->fetch();

            $folderCount      = (int)$db->query("SELECT COUNT(*) FROM folders")->fetchColumn();
            $shareCount       = (int)$db->query("SELECT COUNT(*) FROM file_shares")->fetchColumn();
            $folderShareCount = (int)$db->query("SELECT COUNT(*) FROM folder_shares")->fetchColumn();

            $allUsers = instrumenta_get_users();

            respond([
                'totalDocuments'   => (int)$fileStats['total_active'],
                'totalDeleted'     => (int)$fileStats['total_deleted'],
                'totalFolders'     => $folderCount,
                'totalBlobs'       => (int)$fileStats['blob_count'],
                'totalSize'        => (int)$fileStats['total_size'],
                'documentsByType'  => [
                    'yjs'  => (int)$fileStats['yjs_count'],
                    'blob' => (int)$fileStats['blob_count'],
                ],
                'documentsByScope' => [
                    'drive' => (int)$fileStats['drive_count'],
                    'app'   => (int)$fileStats['app_count'],
                ],
                'deletedDocuments'  => (int)$fileStats['total_deleted'],
                'uniqueOwners'      => (int)$fileStats['unique_owners'],
                'totalShares'       => $shareCount,
                'totalFolderShares' => $folderShareCount,
                'totalUsers'        => count($allUsers),
            ]);
        }

        case 'admin_update': {
            requirePost();
            $user = requireAuth();
            if (!isAdmin($user)) error('Admin required', 403);

            $id = post('id');
            if (!$id) error('id required');

            $stmt = $db->prepare("SELECT id FROM files WHERE id = ?");
            $stmt->execute([$id]);
            if (!$stmt->fetch()) error('File not found', 404);

            $allowed = ['title', 'owner', 'type', 'scope', 'app', 'folder_id', 'parent_id', 'room_id', 'blob_key', 'public_read', 'public_write'];
            $updates = [];
            $params  = [];

            foreach ($allowed as $field) {
                if (!array_key_exists($field, $_POST)) continue;
                if ($field === 'public_read' || $field === 'public_write') {
                    $updates[] = "$field = ?";
                    $params[]  = postBool($field);
                } else {
                    $val       = post($field);
                    $updates[] = "$field = ?";
                    $params[]  = ($val === '') ? null : $val;
                }
            }

            if (empty($updates)) error('No fields to update');

            $updates[] = "updated_at = datetime('now')";
            $params[]  = $id;

            $db->prepare("UPDATE files SET " . implode(', ', $updates) . " WHERE id = ?")
               ->execute($params);

            respond(fetchFile($db, $id));
        }

        case 'admin_update_folder': {
            requirePost();
            $user = requireAuth();
            if (!isAdmin($user)) error('Admin required', 403);

            $id = post('folder_id');
            if (!$id) error('folder_id required');

            $stmt = $db->prepare("SELECT id FROM folders WHERE id = ?");
            $stmt->execute([$id]);
            if (!$stmt->fetch()) error('Folder not found', 404);

            $allowed = ['name', 'owner', 'public_read', 'public_write'];
            $updates = [];
            $params  = [];

            foreach ($allowed as $field) {
                if (!array_key_exists($field, $_POST)) continue;
                if ($field === 'public_read' || $field === 'public_write') {
                    $updates[] = "$field = ?";
                    $params[]  = postBool($field);
                } else {
                    $val       = post($field);
                    $updates[] = "$field = ?";
                    $params[]  = ($val === '') ? null : $val;
                }
            }

            if (empty($updates)) error('No fields to update');

            $updates[] = "updated_at = datetime('now')";
            $params[]  = $id;

            $db->prepare("UPDATE folders SET " . implode(', ', $updates) . " WHERE id = ?")
               ->execute($params);

            respond(fetchFolder($db, $id));
        }

        default:
            error('Unknown action: ' . $action, 404);
    }

} catch (PDOException $e) {
    error('Database error: ' . $e->getMessage(), 500);
} catch (Exception $e) {
    error('Server error: ' . $e->getMessage(), 500);
}
