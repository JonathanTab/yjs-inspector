<?php
/**
 * Document Manager API Reference
 *
 * ========
 * This API provides document management capabilities for a collaborative editing system.
 * Documents are stored as JSON objects with metadata including ownership, sharing permissions,
 * and tool-specific information. All operations require user authentication.
 *
 * AUTHENTICATION
 * =============
 * User authentication is handled via iauth.php. Either a session or a api key works.
 *
 * BASE URL & REQUEST FORMAT
 * ========================
 * GET https://instrumenta.cf/api/congruum-doc-manager.php?action={action}&{parameters}
 * 
 * Optionally add &apikey={apikey} for key based authentication
 * 
 * All requests use GET method with URL parameters. Responses are JSON-encoded.
 *
 * DATA STRUCTURES
 * ===============
 *
 * Document Object:
 * {
 *   "id": "string",              // Unique, stable document identifier
 *   "owner": "string",           // Username of document owner
 *   "tool": "string",            // Tool identifier (optional, e.g., "text", "draw")
 *   "title": "string",           // Human-readable title
 *   "versions": {                // Map of schema versions to room IDs
 *     "1": "room_xxx",           // version -> roomID mapping
 *     "2": "room_yyy"
 *   },
 *   "shared_with": [             // Array of shared users
 *     {
 *       "username": "string",
 *       "permissions": ["read", "write"]  // Array of permission strings
 *     }
 *   ]
 * }
 *
 * API ENDPOINTS
 * ============
 *
 * 1. CREATE DOCUMENT
 *    Action: create
 *    Method: GET
 *    Parameters:
 *      - id (required): string - Unique document identifier
 *      - tool (optional): string - Tool type identifier
 *      - title (optional): string - Document title (default: "Untitled")
 *      - version (optional): string - Schema version (default: "1")
 *    Returns: Document object with versions map
 *    Errors: "Missing id", "Document already exists"
 *    Permissions: Any authenticated user
 *    Example: ?action=create&id=doc123&tool=text&title=My%20Document
 *
 * 2. LIST DOCUMENTS
 *    Action: list
 *    Method: GET
 *    Parameters:
 *      - all (optional): integer - Set to 1 for admins to list all documents (not just accessible ones)
 *    Returns: Array of accessible documents (or all documents for admins with all=1)
 *    Errors: None
 *    Permissions: Any authenticated user (shows only accessible documents unless admin with all=1)
 *    Example: ?action=list
 *    Admin Example: ?action=list&all=1
 *
 * 3. LIST DOCUMENTS BY TOOL
 *    Action: list_by_tool
 *    Method: GET
 *    Parameters:
 *      - tool (required): string - Tool type to filter by
 *      - all (optional): integer - Set to 1 for admins to list all documents of that tool
 *    Returns: Array of matching documents accessible to user (or all matching documents for admins with all=1)
 *    Errors: "Missing tool"
 *    Permissions: Any authenticated user
 *    Example: ?action=list_by_tool&tool=text
 *    Admin Example: ?action=list_by_tool&tool=text&all=1
 *
 * 4. RENAME DOCUMENT
 *    Action: rename
 *    Method: GET
 *    Parameters:
 *      - id (required): string - Document identifier
 *      - title (required): string - New title
 *    Returns: Updated document object
 *    Errors: "Missing parameters", "Not found or access denied"
 *    Permissions: Owner, user with write access, or admin
 *    Example: ?action=rename&id=doc123&title=New%20Title
 *
 * 5. SHARE DOCUMENT
 *    Action: share
 *    Method: GET
 *    Parameters:
 *      - id (required): string - Document identifier
 *      - username (required): string - Username to share with
 *      - permissions (required): string - Comma-separated permissions (e.g., "read,write")
 *    Returns: Updated document object
 *    Errors: "Missing parameters", "Not found or not owner"
 *    Permissions: Owner or admin
 *    Notes: Replaces existing permissions for the user if already shared
 *    Example: ?action=share&id=doc123&username=john&permissions=read,write
 *
 * 6. REVOKE SHARE
 *    Action: revoke
 *    Method: GET
 *    Parameters:
 *      - id (required): string - Document identifier
 *      - username (required): string - Username to revoke access from
 *    Returns: Updated document object
 *    Errors: "Missing parameters", "Not found or not owner"
 *    Permissions: Owner or admin
 *    Example: ?action=revoke&id=doc123&username=john
 *
 * 7. DELETE DOCUMENT
 *    Action: delete
 *    Method: GET
 *    Parameters:
 *      - id (required): string - Document identifier
 *    Returns: {"success": true}
 *    Errors: "Missing id", "Not found or not owner"
 *    Permissions: Owner or admin
 *    Example: ?action=delete&id=doc123
 *
 * 8. CHECK ACCESS
 *    Action: access
 *    Method: GET
 *    Parameters:
 *      - id (required): string - Document identifier
 *      - version (optional): string - Schema version to check access for
 *    Returns: {"id": "string", "room": "string", "user": "string", "permissions": ["read", "write"]}
 *    Errors: "Missing id", "Not found"
 *    Permissions: Any authenticated user (used by backend for access verification)
 *    Example: ?action=access&id=doc123&version=1
 *
 * 9. GET ROOM FOR VERSION
 *    Action: get_room
 *    Method: GET
 *    Parameters:
 *      - id (required): string - Document identifier
 *      - version (required): string - Schema version to get room for
 *    Returns: {"id": "string", "version": "string", "room": "string"}
 *    Errors: "Missing parameters", "Not found"
 *    Permissions: Any authenticated user with access to the document
 *    Notes: Creates a new room for the version if it doesn't exist
 *    Example: ?action=get_room&id=doc123&version=2
 *
 * 10. GENERATE ID
 *    Action: generate_id
 *    Method: GET
 *    Parameters:
 *      - length (optional): integer - ID length (1-128, default: 16)
 *    Returns: {"id": "generated_id"}
 *    Errors: "Invalid length (1–128 allowed)"
 *    Permissions: Any authenticated user
 *    Notes: Generates random IDs using safe characters (no confusing letters/numbers)
 *    Example: ?action=generate_id&length=32
 *
 * RESPONSE FORMATS
 * ================
 *
 * Success Response:
 * {
 *   // Varies by endpoint - see individual endpoint documentation
 * }
 *
 * Error Response:
 * {
 *   "error": "Error message string"
 * }
 */

define('DATA_ROOT', dirname(__DIR__) . '/data/congruum-docs/');
require_once "iauth.php";
define('DOCS_FILE', DATA_ROOT . 'congruum-docs.json');

header('Content-Type: application/json');

function readDocs() {
    if (!file_exists(DOCS_FILE)) return [];
    return json_decode(file_get_contents(DOCS_FILE), true) ?: [];
}

function writeDocs($docs) {
    file_put_contents(DOCS_FILE, json_encode($docs, JSON_PRETTY_PRINT));
}

function getDocById($id, &$docs = null) {
    $docs = $docs ?? readDocs();
    foreach ($docs as &$doc) {
        if ($doc['id'] === $id) return $doc;
    }
    return null;
}

function hasAccess($doc, $user) {
    if ($doc['owner'] === $user || isAdmin($user)) return true;
    foreach ($doc['shared_with'] as $s) {
        if ($s['username'] === $user) return true;
    }
    return false;
}

function getUserPermissions($doc, $user) {
    if ($doc['owner'] === $user || isAdmin($user)) return ['read', 'write'];
    foreach ($doc['shared_with'] as $s) {
        if ($s['username'] === $user) return $s['permissions'];
    }
    return [];
}

function isAdmin($user) {
    $users = instrumenta_get_users();
    return isset($users[$user]['is_admin']) && $users[$user]['is_admin'];
}

function generateRoomId() {
    $chars = explode(' ', 'c d e f h j k m n p r t v w x y 2 3 4 5 6 8 9');
    $length = 16;
    $id = '';
    for ($i = 0; $i < $length; $i++) {
        $id .= $chars[random_int(0, count($chars) - 1)];
    }
    return $id;
}

$action = $_GET['action'] ?? '';
$docId = $_GET['id'] ?? null;
$docs = readDocs();

switch ($action) {

    // Create Document and return details
    // action: create
    // params: id (required), tool (optional), title (optional), version (optional, default: "1")
    // returns: created document object with versions map
    // errors: Missing id, Document already exists
    case 'create':
        if (!$docId) die(json_encode(['error' => 'Missing id']));
        if (getDocById($docId, $docs)) {
            echo json_encode(['error' => 'Document already exists']);
            exit;
        }
        $version = $_GET['version'] ?? '1';
        $roomId = generateRoomId();
        $doc = [
            'id' => $docId,
            'owner' => $authorized_user,
            'tool' => $_GET['tool'] ?? '',
            'title' => $_GET['title'] ?? 'Untitled',
            'versions' => [
                $version => $roomId
            ],
            'shared_with' => []
        ];
        $docs[] = $doc;
        writeDocs($docs);
        echo json_encode($doc);
        break;

    // List Documents visible to the user
    // action: list
    // params: all (optional) - admins can set to 1 to see all documents
    // returns: array of accessible documents (with full versions map)
    // errors: none
    case 'list':
        if (isset($_GET['all']) && $_GET['all'] == '1' && isAdmin($authorized_user)) {
            $userDocs = array_values($docs);
        } else {
            $userDocs = array_values(array_filter($docs, fn($d) => hasAccess($d, $authorized_user)));
        }
        echo json_encode($userDocs);
        break;
        
    // Lists documents visible to user filtered by tool
    // action: list_by_tool
    // params: tool, all (optional) - admins can set to 1 to see all documents of that tool
    // returns: array of matching documents (with full versions map)
    // errors: Missing tool
    case 'list_by_tool':
        $tool = $_GET['tool'] ?? '';
        if (!$tool) {
            echo json_encode(['error' => 'Missing tool']);
            break;
        }
        if (isset($_GET['all']) && $_GET['all'] == '1' && isAdmin($authorized_user)) {
            $filteredDocs = array_values(array_filter($docs, function ($d) use ($tool) {
                return $d['tool'] === $tool;
            }));
        } else {
            $filteredDocs = array_values(array_filter($docs, function ($d) use ($tool, $authorized_user) {
                return $d['tool'] === $tool && hasAccess($d, $authorized_user);
            }));
        }
        echo json_encode($filteredDocs);
        break;

    // Rename Document and return details
    // action: rename
    // params: id, title
    // returns: updated document object
    // errors: Missing parameters, Not found or access denied
    // permissions: Owner, user with write access, or admin
    case 'rename':
        if (!$docId || !isset($_GET['title'])) {
            echo json_encode(['error' => 'Missing parameters']);
            break;
        }
        foreach ($docs as &$d) {
            if ($d['id'] === $docId && (hasAccess($d, $authorized_user) || isAdmin($authorized_user))) {
                $d['title'] = $_GET['title'];
                writeDocs($docs);
                echo json_encode($d);
                exit;
            }
        }
        echo json_encode(['error' => 'Not found or access denied']);
        break;

    // Share document with new user
    // action: share
    // params: id, username, permissions
    // returns: updated document object
    // errors: Missing parameters, Not found or not owner
    // permissions: Owner or admin
    case 'share':
        if (!$docId || !isset($_GET['username'], $_GET['permissions'])) {
            echo json_encode(['error' => 'Missing parameters']);
            break;
        }
        foreach ($docs as &$d) {
            if ($d['id'] === $docId && ($d['owner'] === $authorized_user || isAdmin($authorized_user))) {
                $d['shared_with'] = array_filter($d['shared_with'], fn($s) => $s['username'] !== $_GET['username']);
                $d['shared_with'][] = [
                    'username' => $_GET['username'],
                    'permissions' => explode(',', $_GET['permissions'])
                ];
                writeDocs($docs);
                echo json_encode($d);
                exit;
            }
        }
        echo json_encode(['error' => 'Not found or not owner']);
        break;

    // Revoke document share from user
    // action: revoke
    // params: id, username
    // returns: updated document object
    // errors: Missing parameters, Not found or not owner
    // permissions: Owner or admin
    case 'revoke':
        if (!$docId || !isset($_GET['username'])) {
            echo json_encode(['error' => 'Missing parameters']);
            break;
        }
        foreach ($docs as &$d) {
            if ($d['id'] === $docId && ($d['owner'] === $authorized_user || isAdmin($authorized_user))) {
                $d['shared_with'] = array_filter($d['shared_with'], fn($s) => $s['username'] !== $_GET['username']);
                writeDocs($docs);
                echo json_encode($d);
                exit;
            }
        }
        echo json_encode(['error' => 'Not found or not owner']);
        break;

    // Delete document
    // action: delete
    // params: id
    // returns: {success: true}
    // errors: Missing id, Not found or not owner
    // permissions: Owner or admin
    case 'delete':
        if (!$docId) {
            echo json_encode(['error' => 'Missing id']);
            break;
        }
        foreach ($docs as $i => $d) {
            if ($d['id'] === $docId && ($d['owner'] === $authorized_user || isAdmin($authorized_user))) {
                unset($docs[$i]);
                writeDocs($docs);
                echo json_encode(['success' => true]);
                exit;
            }
        }
        echo json_encode(['error' => 'Not found or not owner']);
        break;

    // Return access list for document and optionally specific version
    // action: access
    // params: id, version (optional)
    // returns: {id, room, user, permissions: []}
    // errors: Missing id, Not found
    case 'access':
        if (!$docId) {
            echo json_encode(['error' => 'Missing id']);
            break;
        }
        $doc = getDocById($docId, $docs);
        if (!$doc) {
            echo json_encode(['error' => 'Not found']);
            break;
        }
        $version = $_GET['version'] ?? null;
        $room = $version && isset($doc['versions'][$version]) 
            ? $doc['versions'][$version] 
            : null;
        
        // If version specified but not found, return error
        if ($version && !$room) {
            echo json_encode(['error' => 'Version not found']);
            break;
        }
        
        echo json_encode([
            'id' => $docId,
            'room' => $room,
            'user' => $authorized_user,
            'permissions' => getUserPermissions($doc, $authorized_user)
        ]);
        break;

    // Get room for a specific version, creating it if needed
    // action: get_room
    // params: id, version
    // returns: {id, version, room}
    // errors: Missing parameters, Not found, Version not found
    // permissions: Any authenticated user with access or admin
    case 'get_room':
        if (!$docId || !isset($_GET['version'])) {
            echo json_encode(['error' => 'Missing parameters']);
            break;
        }
        $version = $_GET['version'];
        $doc = getDocById($docId, $docs);
        if (!$doc) {
            echo json_encode(['error' => 'Not found']);
            break;
        }
        if (!hasAccess($doc, $authorized_user) && !isAdmin($authorized_user)) {
            echo json_encode(['error' => 'Access denied']);
            break;
        }
        
        // Check if version already exists
        if (isset($doc['versions'][$version])) {
            $room = $doc['versions'][$version];
        } else {
            // Generate new room for this version
            $room = generateRoomId();
            // Update the document
            foreach ($docs as &$d) {
                if ($d['id'] === $docId) {
                    $d['versions'][$version] = $room;
                    writeDocs($docs);
                    break;
                }
            }
        }
        
        echo json_encode([
            'id' => $docId,
            'version' => $version,
            'room' => $room
        ]);
        break;

    // Generate a random id
    // action: generate_id
    // params: length (optional, 1-128, default 16)
    // returns: {id: "generated_id"}
    // errors: Invalid length
    case 'generate_id':
        $chars = explode(' ', 'c d e f h j k m n p r t v w x y 2 3 4 5 6 8 9');
    
        $length = isset($_GET['length']) ? intval($_GET['length']) : 16;
        if ($length < 1 || $length > 128) {
            echo json_encode(['error' => 'Invalid length (1–128 allowed)']);
            break;
        }
    
        $id = '';
        for ($i = 0; $i < $length; $i++) {
            $id .= $chars[random_int(0, count($chars) - 1)];
        }
    
        echo json_encode(['id' => $id]);
        break;

    default:
        echo json_encode(['error' => 'Unknown action']);
        break;
}
