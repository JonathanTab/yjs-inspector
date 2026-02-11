<?php
/**
 * Document Manager API Reference (SQLite Edition)
 *
 * ============================================================================
 * This API provides robust document management for collaborative editing.
 * It ensures data integrity, race-free room creation, and atomic metadata writes
 * using a SQLite backend with WAL (Write-Ahead Logging) mode.
 * ============================================================================
 *
 * AUTHENTICATION
 * ==============
 * Handled via iauth.php. Supports session-based or API key-based (?apikey=...) auth.
 * The $authorized_user variable and instrumenta_get_users() is provided by the authentication layer.
 *
 * BASE URL & METHODS
 * ==================
 * Base URL: https://instrumenta.cf/api/congruum-doc-manager.php
 * 
 * IMPORTANT:
 * - Read-only actions (list, access, generate_id) use GET.
 * - Write/Modify actions (create, rename, share, revoke, delete, create_version) REQUIRE POST.
 * - Responses are ALWAYS JSON-encoded.
 *
 * CORE INVARIANTS
 * ===============
 * 1. One (doc_id, version) maps to exactly one room_id.
 * 2. Room IDs are immutable once created and unique across the system.
 * 3. Soft-deletion is used to prevent room ID resurrection and maintain history.
 * 4. Permissions (Read/Write) are strictly enforced at the database level.
 *
 * SCHEMA OVERVIEW
 * ===============
 * - documents: Primary metadata (owner, title, app, soft-delete flag).
 * - document_versions: Maps document+version to a unique Yjs room_id.
 * - document_shares: Granular user permissions (can_read, can_write).
 *
 * API ENDPOINTS
 * =============
 *
 * 1. CREATE DOCUMENT
 *    Action: create | Method: POST
 *    Params: id (required), app, title, version (default "1")
 *    Logic: Atomically creates document and its initial versioned room.
 *
 * 2. LIST DOCUMENTS
 *    Action: list | Method: GET
 *    Params: all (1 for admins)
 *    Returns: Array of accessible documents with full version maps.
 *
 * 3. LIST BY APP
 *    Action: list_by_app | Method: GET
 *    Params: app (required), all (1 for admins)
 *    Returns: Filtered array of accessible documents.
 *
 * 4. RENAME DOCUMENT
 *    Action: rename | Method: POST
 *    Params: id, title (required)
 *    Permissions: Write access required.
 *
 * 5. SHARE DOCUMENT
 *    Action: share | Method: POST
 *    Params: id, username, permissions (comma-separated "read,write")
 *    Permissions: Owner or Admin only. Uses UPSERT logic.
 *
 * 6. REVOKE ACCESS
 *    Action: revoke | Method: POST
 *    Params: id, username
 *    Permissions: Owner or Admin only.
 *
 * 7. DELETE DOCUMENT (Soft Delete)
 *    Action: delete | Method: POST
 *    Params: id
 *    Permissions: Owner or Admin only. Marks deleted=1.
 *
 * 8. CHECK ACCESS / GET METADATA
 *    Action: access | Method: GET
 *    Params: id, version (optional)
 *    Returns: Metadata + specific room ID + user permissions.
 *
 * 9. CREATE VERSION
 *    Action: create_version | Method: POST
 *    Params: id, version (required)
 *    Logic: Creates a room for the given version if needed. Returns existing room or creates a new one.
 *    Permissions: Write access required.
 *
 * 10. GENERATE ID
 *    Action: generate_id | Method: GET
 *    Params: length (1-128, default 16)
 */

define('DATA_ROOT', dirname(__DIR__) . '/data/congruum-docs/');
require_once "iauth.php";
define('DB_FILE', DATA_ROOT . 'congruum-docs.sqlite');
define('DOCS_JSON_FILE', DATA_ROOT . 'congruum-docs.json');

header('Content-Type: application/json');

/**
 * Initialize SQLite Database
 */
if (!is_dir(DATA_ROOT)) {
    mkdir(DATA_ROOT, 0777, true);
}

try {
    $db = new PDO("sqlite:" . DB_FILE, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    // Enable WAL mode for concurrency and enforce foreign keys
    $db->exec("PRAGMA journal_mode=WAL;");
    $db->exec("PRAGMA foreign_keys=ON;");

    // Initialize Schema
    $db->exec("
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            owner TEXT NOT NULL,
            app TEXT,
            title TEXT NOT NULL,
            deleted INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS document_versions (
            document_id TEXT NOT NULL,
            version TEXT NOT NULL,
            room_id TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (document_id, version),
            UNIQUE (room_id),
            FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS document_shares (
            document_id TEXT NOT NULL,
            username TEXT NOT NULL,
            can_read INTEGER NOT NULL DEFAULT 1,
            can_write INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (document_id, username),
            FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
        );
    ");
} catch (PDOException $e) {
    die(json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]));
}

/**
 * Migration from JSON to SQLite
 */
if (file_exists(DOCS_JSON_FILE)) {
    $stmt = $db->query("SELECT COUNT(*) FROM documents");
    if ($stmt->fetchColumn() == 0) {
        $jsonDocs = json_decode(file_get_contents(DOCS_JSON_FILE), true);
        if ($jsonDocs) {
            $db->beginTransaction();
            foreach ($jsonDocs as $doc) {
                $now = time();
                $stmt = $db->prepare("INSERT INTO documents (id, owner, app, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
                $stmt->execute([$doc['id'], $doc['owner'], $doc['tool'] ?? '', $doc['title'], $now, $now]);

                if (isset($doc['versions'])) {
                    foreach ($doc['versions'] as $v => $rid) {
                        $stmt = $db->prepare("INSERT INTO document_versions (document_id, version, room_id, created_at) VALUES (?, ?, ?, ?)");
                        $stmt->execute([$doc['id'], (string)$v, $rid, $now]);
                    }
                }

                if (isset($doc['shared_with'])) {
                    foreach ($doc['shared_with'] as $share) {
                        $canRead = in_array('read', $share['permissions']) ? 1 : 0;
                        $canWrite = in_array('write', $share['permissions']) ? 1 : 0;
                        $stmt = $db->prepare("INSERT INTO document_shares (document_id, username, can_read, can_write) VALUES (?, ?, ?, ?)");
                        $stmt->execute([$doc['id'], $share['username'], $canRead, $canWrite]);
                    }
                }
            }
            $db->commit();
            rename(DOCS_JSON_FILE, DOCS_JSON_FILE . '.bak');
        }
    }
}

/**
 * Helpers
 */

/**
 * Check if a user has administrative privileges.
 * @param string $user
 * @return bool
 */
function isAdmin($user) {
    if (!$user || !function_exists('instrumenta_get_users')) return false;
    $users = instrumenta_get_users();
    return isset($users[$user]['is_admin']) && $users[$user]['is_admin'];
}

/**
 * Validate document ID format.
 * @param string $id
 * @return bool
 */
function validateId($id) {
    return is_string($id) && preg_match('/^[a-zA-Z0-9_\-\.]+$/', $id);
}

/**
 * Validate version string format.
 * @param string $version
 * @return bool
 */
function validateVersion($version) {
    return is_string($version) && preg_match('/^[a-zA-Z0-9\.]+$/', $version);
}

/**
 * Check if a user has read access to a document.
 * @param PDO $db
 * @param string $docId
 * @param string $user
 * @return bool
 */
function hasReadAccess($db, $docId, $user) {
    if (isAdmin($user)) return true;
    $stmt = $db->prepare("
        SELECT 1 FROM documents d
        LEFT JOIN document_shares s ON d.id = s.document_id
        WHERE d.id = ? AND d.deleted = 0
        AND (d.owner = ? OR (s.username = ? AND s.can_read = 1))
    ");
    $stmt->execute([$docId, $user, $user]);
    return (bool)$stmt->fetch();
}

/**
 * Check if a user has write access to a document.
 * @param PDO $db
 * @param string $docId
 * @param string $user
 * @return bool
 */
function hasWriteAccess($db, $docId, $user) {
    if (isAdmin($user)) return true;
    $stmt = $db->prepare("
        SELECT 1 FROM documents d
        LEFT JOIN document_shares s ON d.id = s.document_id
        WHERE d.id = ? AND d.deleted = 0
        AND (d.owner = ? OR (s.username = ? AND s.can_write = 1))
    ");
    $stmt->execute([$docId, $user, $user]);
    return (bool)$stmt->fetch();
}

function generateRandomId($length = 16) {
    $chars = explode(' ', 'c d e f h j k m n p r t v w x y 2 3 4 5 6 8 9');
    $id = '';
    for ($i = 0; $i < $length; $i++) {
        $id .= $chars[random_int(0, count($chars) - 1)];
    }
    return $id;
}

function getDocumentFull($db, $docId) {
    $stmt = $db->prepare("SELECT * FROM documents WHERE id = ? AND deleted = 0");
    $stmt->execute([$docId]);
    $doc = $stmt->fetch();
    if (!$doc) return null;

    $vStmt = $db->prepare("SELECT version, room_id FROM document_versions WHERE document_id = ?");
    $vStmt->execute([$docId]);
    $doc['versions'] = [];
    foreach ($vStmt->fetchAll() as $v) {
        $doc['versions'][$v['version']] = $v['room_id'];
    }

    $sStmt = $db->prepare("SELECT username, can_read, can_write FROM document_shares WHERE document_id = ?");
    $sStmt->execute([$docId]);
    $doc['shared_with'] = [];
    foreach ($sStmt->fetchAll() as $s) {
        $perms = [];
        if ($s['can_read']) $perms[] = 'read';
        if ($s['can_write']) $perms[] = 'write';
        $doc['shared_with'][] = [
            'username' => $s['username'],
            'permissions' => $perms
        ];
    }
    return $doc;
}

function requireMethod($method) {
    if ($_SERVER['REQUEST_METHOD'] !== strtoupper($method)) {
        http_response_code(405);
        die(json_encode(['error' => "Method Not Allowed. Use $method for this action."]));
    }
}

/**
 * API Logic
 */
$params = array_merge($_GET, $_POST);
$action = $params['action'] ?? '';
$docId = $params['id'] ?? null;

switch ($action) {

    case 'create':
        requireMethod('POST');
        if (!$docId) { http_response_code(400); die(json_encode(['error' => 'Missing id'])); }
        if (!validateId($docId)) { http_response_code(400); die(json_encode(['error' => 'Invalid ID format'])); }
        
        $version = (string)($params['version'] ?? '1');
        if (!validateVersion($version)) { http_response_code(400); die(json_encode(['error' => 'Invalid version format'])); }
        $app = $params['app'] ?? '';
        $title = $params['title'] ?? 'Untitled';
        $now = time();
        $roomId = generateRandomId();

        try {
            $db->beginTransaction();
            $stmt = $db->prepare("SELECT 1 FROM documents WHERE id = ?");
            $stmt->execute([$docId]);
            if ($stmt->fetch()) {
                $db->rollBack();
                http_response_code(409);
                die(json_encode(['error' => 'Document already exists']));
            }

            $stmt = $db->prepare("INSERT INTO documents (id, owner, app, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->execute([$docId, $authorized_user, $app, $title, $now, $now]);

            $stmt = $db->prepare("INSERT INTO document_versions (document_id, version, room_id, created_at) VALUES (?, ?, ?, ?)");
            $stmt->execute([$docId, $version, $roomId, $now]);

            $db->commit();
            echo json_encode(getDocumentFull($db, $docId));
        } catch (Exception $e) {
            if ($db->inTransaction()) $db->rollBack();
            http_response_code(500);
            die(json_encode(['error' => $e->getMessage()]));
        }
        break;

    case 'list':
    case 'list_by_app':
        requireMethod('GET');
        $app = $params['app'] ?? null;
        $all = isset($params['all']) && $params['all'] == '1' && isAdmin($authorized_user);

        $query = "SELECT d.* FROM documents d WHERE d.deleted = 0";
        $sqlParams = [];

        if (!$all) {
            $query .= " AND (d.owner = ? OR EXISTS (SELECT 1 FROM document_shares s WHERE s.document_id = d.id AND s.username = ? AND s.can_read = 1))";
            $sqlParams[] = $authorized_user;
            $sqlParams[] = $authorized_user;
        }

        if ($app) {
            $query .= " AND d.app = ?";
            $sqlParams[] = $app;
        }

        $stmt = $db->prepare($query);
        $stmt->execute($sqlParams);
        $docsList = $stmt->fetchAll();

        foreach ($docsList as &$d) {
            $full = getDocumentFull($db, $d['id']);
            $d['versions'] = $full['versions'];
            $d['shared_with'] = $full['shared_with'];
        }
        echo json_encode(array_values($docsList));
        break;

    case 'rename':
        requireMethod('POST');
        if (!$docId || !isset($params['title'])) { http_response_code(400); die(json_encode(['error' => 'Missing parameters'])); }
        if (!validateId($docId)) { http_response_code(400); die(json_encode(['error' => 'Invalid ID format'])); }
        if (!hasWriteAccess($db, $docId, $authorized_user)) { http_response_code(404); die(json_encode(['error' => 'Access denied or not found'])); }

        $stmt = $db->prepare("UPDATE documents SET title = ?, updated_at = ? WHERE id = ?");
        $stmt->execute([$params['title'], time(), $docId]);
        echo json_encode(getDocumentFull($db, $docId));
        break;

    case 'share':
        requireMethod('POST');
        if (!$docId || !isset($params['username'], $params['permissions'])) { http_response_code(400); die(json_encode(['error' => 'Missing parameters'])); }
        if (!validateId($docId)) { http_response_code(400); die(json_encode(['error' => 'Invalid ID format'])); }
        
        $stmt = $db->prepare("SELECT owner FROM documents WHERE id = ? AND deleted = 0");
        $stmt->execute([$docId]);
        $owner = $stmt->fetchColumn();
        if ($owner !== $authorized_user && !isAdmin($authorized_user)) { http_response_code(404); die(json_encode(['error' => 'Not found or not owner'])); }

        $permsArray = explode(',', $params['permissions']);
        $validPerms = ['read', 'write'];
        foreach ($permsArray as $p) {
            if (!in_array($p, $validPerms)) { http_response_code(400); die(json_encode(['error' => 'Invalid permission: ' . $p])); }
        }

        $canRead = in_array('read', $permsArray) ? 1 : 0;
        $canWrite = in_array('write', $permsArray) ? 1 : 0;

        $stmt = $db->prepare("
            INSERT INTO document_shares (document_id, username, can_read, can_write)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(document_id, username)
            DO UPDATE SET can_read = excluded.can_read, can_write = excluded.can_write
        ");
        $stmt->execute([$docId, $params['username'], $canRead, $canWrite]);
        echo json_encode(getDocumentFull($db, $docId));
        break;

    case 'revoke':
        requireMethod('POST');
        if (!$docId || !isset($params['username'])) { http_response_code(400); die(json_encode(['error' => 'Missing parameters'])); }
        
        $stmt = $db->prepare("SELECT owner FROM documents WHERE id = ? AND deleted = 0");
        $stmt->execute([$docId]);
        $owner = $stmt->fetchColumn();
        if ($owner !== $authorized_user && !isAdmin($authorized_user)) { http_response_code(404); die(json_encode(['error' => 'Not found or not owner'])); }

        $stmt = $db->prepare("DELETE FROM document_shares WHERE document_id = ? AND username = ?");
        $stmt->execute([$docId, $params['username']]);
        echo json_encode(getDocumentFull($db, $docId));
        break;

    case 'delete':
        requireMethod('POST');
        if (!$docId) { http_response_code(400); die(json_encode(['error' => 'Missing id'])); }
        
        $stmt = $db->prepare("SELECT owner FROM documents WHERE id = ? AND deleted = 0");
        $stmt->execute([$docId]);
        $owner = $stmt->fetchColumn();
        if ($owner !== $authorized_user && !isAdmin($authorized_user)) { http_response_code(404); die(json_encode(['error' => 'Not found or not owner'])); }

        $stmt = $db->prepare("UPDATE documents SET deleted = 1, updated_at = ? WHERE id = ?");
        $stmt->execute([time(), $docId]);
        echo json_encode(['success' => true]);
        break;

    case 'access':
        requireMethod('GET');
        if (!$docId) { http_response_code(400); die(json_encode(['error' => 'Missing id'])); }
        if (!validateId($docId)) { http_response_code(400); die(json_encode(['error' => 'Invalid ID format'])); }
        
        $version = (string)($params['version'] ?? '1');
        if (!validateVersion($version)) { http_response_code(400); die(json_encode(['error' => 'Invalid version format'])); }

        $stmt = $db->prepare("
            SELECT d.owner, s.can_read, s.can_write, v.room_id
            FROM documents d
            LEFT JOIN document_shares s ON d.id = s.document_id AND s.username = ?
            LEFT JOIN document_versions v ON d.id = v.document_id AND v.version = ?
            WHERE d.id = ? AND d.deleted = 0
        ");
        $stmt->execute([$authorized_user, $version, $docId]);
        $res = $stmt->fetch();

        if (!$res) { http_response_code(404); die(json_encode(['error' => 'Not found'])); }

        $isOwner = ($res['owner'] === $authorized_user);
        $isAdmin = isAdmin($authorized_user);
        
        if (!$isOwner && !$isAdmin && !$res['can_read']) {
            http_response_code(403);
            die(json_encode(['error' => 'Access denied']));
        }

        // Compute permissions
        $perms = [];
        if ($isOwner || $isAdmin) {
            $perms = ['read', 'write'];
        } else {
            if ($res['can_read']) $perms[] = 'read';
            if ($res['can_write']) $perms[] = 'write';
        }

        echo json_encode([
            'id' => $docId,
            'room' => $res['room_id'], //Fixed, i think
            'user' => $authorized_user,
            'permissions' => $perms
        ]);
        break;

    case 'create_version':
        requireMethod('POST');
        if (!$docId || !isset($params['version'])) { http_response_code(400); die(json_encode(['error' => 'Missing parameters'])); }
        if (!validateId($docId)) { http_response_code(400); die(json_encode(['error' => 'Invalid ID format'])); }

        $version = (string)$params['version'];
        if (!validateVersion($version)) { http_response_code(400); die(json_encode(['error' => 'Invalid version format'])); }

        if (!hasWriteAccess($db, $docId, $authorized_user)) { http_response_code(403); die(json_encode(['error' => 'Access denied or not found'])); }
        try {
            $db->beginTransaction();
            $stmt = $db->prepare("SELECT room_id FROM document_versions WHERE document_id = ? AND version = ?");
            $stmt->execute([$docId, $version]);
            $room = $stmt->fetchColumn();

            if (!$room) {
                $room = generateRandomId();
                $stmt = $db->prepare("INSERT INTO document_versions (document_id, version, room_id, created_at) VALUES (?, ?, ?, ?)");
                $stmt->execute([$docId, $version, $room, time()]);
            }
            $db->commit();
            echo json_encode(['id' => $docId, 'version' => $version, 'room' => $room]);
        } catch (Exception $e) {
            if ($db->inTransaction()) $db->rollBack();
            http_response_code(500);
            die(json_encode(['error' => $e->getMessage()]));
        }
        break;

    case 'generate_id':
        requireMethod('GET');
        $length = isset($params['length']) ? intval($params['length']) : 16;
        if ($length < 1 || $length > 128) { http_response_code(400); die(json_encode(['error' => 'Invalid length (1–128 allowed)'])); }
        echo json_encode(['id' => generateRandomId($length)]);
        break;

    default:
        http_response_code(400);
        echo json_encode(['error' => 'Unknown action']);
        break;
}
