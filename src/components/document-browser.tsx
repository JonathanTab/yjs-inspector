import { Plus, Search, Share, Trash2, RotateCcw, User, AlertTriangle, RefreshCw, GitBranch, SquarePen } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Badge } from "./ui/badge";
import { Switch } from "./ui/switch";
import { useToast } from "./ui/use-toast";
import {
  createDocumentManagerApi,
  type Document,
  type DocumentManagerConfig,
} from "../lib/document-manager-api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

interface DocumentBrowserProps {
  config: DocumentManagerConfig;
  onConfigChange: (config: DocumentManagerConfig) => void;
  onSelectDocument: (id: string, version: string) => void;
  onCreateDocument: () => void;
}

export function DocumentBrowser({
  config,
  onConfigChange,
  onSelectDocument,
  onCreateDocument,
}: DocumentBrowserProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [deletedDocuments, setDeletedDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [appFilter, setAppFilter] = useState<string>("");
  const [selectedVersions, setSelectedVersions] = useState<Record<string, string>>({});
  const [showDeleted, setShowDeleted] = useState(false);
  const [permanentDeleteDoc, setPermanentDeleteDoc] = useState<Document | null>(null);
  const { toast } = useToast();

  // Memoize the API client to prevent recreation on every render
  const api = useMemo(() => createDocumentManagerApi(config), [config]);

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const [activeDocs, deletedDocs] = await Promise.all([
        api.listDocuments(config.adminMode ?? false),
        api.listDeletedDocuments(config.adminMode ?? false),
      ]);
      setDocuments(activeDocs || []);
      setDeletedDocuments(deletedDocs || []);

      // Initialize selected versions to latest for each document
      const latestVersions: Record<string, string> = {};
      [...(activeDocs || []), ...(deletedDocs || [])].forEach((doc) => {
        const versions = Object.keys(doc.versions || {}).sort((a, b) =>
          b.localeCompare(a, undefined, { numeric: true })
        );
        latestVersions[doc.id] = versions[0] || "1";
      });
      setSelectedVersions(latestVersions);
    } catch (error) {
      console.error("Failed to load documents:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load documents",
      });
    } finally {
      setLoading(false);
    }
  }, [api, config.adminMode, toast]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const currentDocs = showDeleted ? deletedDocuments : documents;

  const filteredDocuments = currentDocs.filter((doc) => {
    const matchesSearch =
      doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.owner.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesApp = !appFilter || doc.app === appFilter;
    return matchesSearch && matchesApp;
  });

  const uniqueApps = Array.from(
    new Set(documents.map((doc) => doc.app).filter(Boolean))
  );

  // Handle app filter selection
  const handleAppFilterChange = (value: string) => {
    setAppFilter(value === "all-apps" ? "" : value);
  };

  const handleVersionChange = (docId: string, version: string) => {
    setSelectedVersions((prev) => ({ ...prev, [docId]: version }));
  };

  const handleDeleteDocument = async (id: string) => {
    if (!api) return;

    try {
      await api.deleteDocument(id);
      toast({
        title: "Success",
        description: "Document deleted successfully",
      });
      loadDocuments();
    } catch (error) {
      console.error("Failed to delete document:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete document",
      });
    }
  };

  const handleRestoreDocument = async (id: string) => {
    if (!api) return;

    try {
      await api.restoreDocument(id);
      toast({
        title: "Success",
        description: "Document restored successfully",
      });
      loadDocuments();
    } catch (error) {
      console.error("Failed to restore document:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to restore document",
      });
    }
  };

  const handlePermanentDelete = async () => {
    if (!api || !permanentDeleteDoc) return;

    try {
      await api.permanentDeleteDocument(permanentDeleteDoc.id);
      toast({
        title: "Success",
        description: "Document permanently deleted",
      });
      setPermanentDeleteDoc(null);
      loadDocuments();
    } catch (error) {
      console.error("Failed to permanently delete document:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to permanently delete document",
      });
    }
  };

  // Get sorted versions for a document (newest first)
  const getSortedVersions = (versions: Record<string, string> | null | undefined) => {
    return Object.keys(versions || {}).sort((a, b) =>
      b.localeCompare(a, undefined, { numeric: true })
    );
  };

  // Rename functionality
  const [renameDoc, setRenameDoc] = useState<Document | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const handleRename = async () => {
    if (!api || !renameDoc || !newTitle.trim()) return;

    try {
      await api.renameDocument(renameDoc.id, newTitle);
      toast({
        title: "Success",
        description: "Document renamed successfully",
      });
      setRenameDoc(null);
      setNewTitle("");
      loadDocuments();
    } catch (error) {
      console.error("Failed to rename document:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to rename document",
      });
    }
  };

  // Share functionality
  const [shareDoc, setShareDoc] = useState<Document | null>(null);
  const [shareUsername, setShareUsername] = useState("");
  const [sharePermissions, setSharePermissions] = useState<string[]>(["read"]);

  const handleShare = async () => {
    if (!api || !shareDoc || !shareUsername.trim()) return;

    try {
      await api.shareDocument(shareDoc.id, shareUsername, sharePermissions);
      toast({
        title: "Success",
        description: `Document shared with ${shareUsername}`,
      });
      setShareDoc(null);
      setShareUsername("");
      setSharePermissions(["read"]);
      loadDocuments();
    } catch (error) {
      console.error("Failed to share document:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to share document",
      });
    }
  };

  const handleRevokeShare = async (username: string) => {
    if (!api || !shareDoc) return;

    try {
      await api.revokeShare(shareDoc.id, username);
      toast({
        title: "Success",
        description: `Access revoked for ${username}`,
      });
      loadDocuments();
    } catch (error) {
      console.error("Failed to revoke share:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to revoke share",
      });
    }
  };

  // Create Version functionality
  const [createVersionDoc, setCreateVersionDoc] = useState<Document | null>(null);
  const [newVersion, setNewVersion] = useState("");

  const handleCreateVersion = async () => {
    if (!api || !createVersionDoc || !newVersion.trim()) return;

    try {
      await api.createVersion(createVersionDoc.id, newVersion);
      toast({
        title: "Success",
        description: `Version ${newVersion} created successfully`,
      });
      setCreateVersionDoc(null);
      setNewVersion("");
      loadDocuments();
    } catch (error) {
      console.error("Failed to create version:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to create version",
      });
    }
  };

  const [showConfig, setShowConfig] = useState(false);

  return (
    <div className="flex flex-col h-200">
      {/* Config Section - Collapsible */}
      {showConfig && (
        <div className="mb-6 p-4 border rounded-lg bg-muted/30">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="base-url" className="text-xs">
                Base URL
              </Label>
              <Input
                id="base-url"
                value={config.baseUrl}
                onInput={(e) =>
                  onConfigChange({ ...config, baseUrl: e.currentTarget.value })
                }
                placeholder="https://instrumenta.cf"
                className="mt-1 h-8"
              />
            </div>
            <div>
              <Label htmlFor="api-key" className="text-xs">
                API Key
              </Label>
              <Input
                id="api-key"
                type="password"
                value={config.apiKey}
                onInput={(e) =>
                  onConfigChange({ ...config, apiKey: e.currentTarget.value })
                }
                placeholder="Optional API key"
                className="mt-1 h-8"
              />
            </div>
          </div>
        </div>
      )}

      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Browse Documents</h2>
            <p className="text-sm text-muted-foreground">
              Select a document to connect to
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowConfig(!showConfig)}
              className="text-muted-foreground"
            >
              {showConfig ? "Hide Config" : "Show Config"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadDocuments}
              disabled={loading}
              className="text-muted-foreground"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <div className="flex items-center gap-2">
              <Label htmlFor="admin-mode" className="text-sm">
                Admin Mode
              </Label>
              <Switch
                id="admin-mode"
                checked={config.adminMode}
                onCheckedChange={(checked) =>
                  onConfigChange({ ...config, adminMode: checked })
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="show-deleted" className="text-sm">
                Show deleted
              </Label>
              <Switch
                id="show-deleted"
                checked={showDeleted}
                onCheckedChange={setShowDeleted}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-4 mb-4">
        <div className="flex-1">
          <Label htmlFor="search">Search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="search"
              placeholder="Search documents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="w-48">
          <Label htmlFor="app-filter">Filter by App</Label>
          <Select
            value={appFilter || "all-apps"}
            onValueChange={handleAppFilterChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="All apps" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-apps">All apps</SelectItem>
              {uniqueApps.map((app) => (
                <SelectItem key={app} value={app}>
                  {app}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!showDeleted && (
          <div className="flex items-end">
            <Button onClick={onCreateDocument} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              New Document
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-center py-8">Loading documents...</div>
        ) : filteredDocuments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {documents.length === 0 && !showDeleted
              ? "No documents found"
              : showDeleted
              ? "No deleted documents found"
              : "No documents match your search"}
          </div>
        ) : (
          <div className="grid gap-3">
            {filteredDocuments.map((doc) => {
              const versions = getSortedVersions(doc.versions);
              const selectedVersion = selectedVersions[doc.id] || versions[0] || "1";
              const isDeleted = showDeleted;

              return (
                <div
                  key={doc.id}
                  className={`border rounded-lg p-4 ${
                    isDeleted
                      ? "bg-gray-50 dark:bg-gray-900 border-dashed"
                      : "bg-white hover:shadow-sm transition-shadow dark:bg-gray-800"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-lg truncate">{doc.title}</h3>
                        {isDeleted && (
                          <Badge variant="destructive" className="text-xs">
                            Deleted
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">ID: {doc.id}</p>
                      <p className="text-sm text-muted-foreground">
                        Owner: {doc.owner}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {doc.app && <Badge variant="secondary">{doc.app}</Badge>}
                        <Badge variant="outline">v{selectedVersion}</Badge>
                      </div>

                      {(doc.shared_with || []).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {(doc.shared_with || []).map((shared) => (
                            <Badge
                              key={shared.username}
                              variant="outline"
                              className="text-xs flex items-center gap-1"
                            >
                              <User className="h-3 w-3" />
                              {shared.username}
                              {shared.permissions.includes("write")
                                ? " (RW)"
                                : " (R)"}
                              {!isDeleted && (
                                <button
                                  onClick={() => {
                                    setShareDoc(doc);
                                    handleRevokeShare(shared.username);
                                  }}
                                  className="ml-1 text-red-500 hover:text-red-700"
                                  title="Revoke access"
                                >
                                  ×
                                </button>
                              )}
                            </Badge>
                          ))}
                          {(doc.shared_with || []).length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{(doc.shared_with || []).length - 3} more
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2 ml-4">
                      {isDeleted ? (
                        // Deleted document actions
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            onClick={() => handleRestoreDocument(doc.id)}
                            className="flex items-center gap-2"
                          >
                            <RotateCcw className="h-4 w-4" />
                            Restore
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setPermanentDeleteDoc(doc)}
                            className="flex items-center gap-2"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete Permanently
                          </Button>
                        </div>
                      ) : (
                        // Active document actions
                        <>
                          <div className="flex items-center gap-2">
                            <Select
                              value={selectedVersion}
                              onValueChange={(v) =>
                                handleVersionChange(doc.id, v)
                              }
                            >
                              <SelectTrigger className="w-24">
                                <SelectValue placeholder="Version" />
                              </SelectTrigger>
                              <SelectContent>
                                {versions.map((version) => (
                                  <SelectItem key={version} value={version}>
                                    v{version}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              onClick={() =>
                                onSelectDocument(doc.id, selectedVersion)
                              }
                              className="flex items-center gap-2"
                            >
                              Select
                            </Button>
                          </div>

                          <div className="flex items-center gap-2">
                            {(doc.shared_with || []).length > 0 && (
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Share className="h-4 w-4" />
                                <span>{(doc.shared_with || []).length}</span>
                              </div>
                            )}

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCreateVersionDoc(doc)}
                              title="Create new version"
                            >
                              <GitBranch className="h-4 w-4" />
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShareDoc(doc)}
                              title="Share document"
                            >
                              <Share className="h-4 w-4" />
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setRenameDoc(doc);
                                setNewTitle(doc.title);
                              }}
                              title="Rename document"
                            >
                              <SquarePen className="h-4 w-4" />
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteDocument(doc.id)}
                              className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Permanent Delete Confirmation Dialog */}
      <Dialog
        open={!!permanentDeleteDoc}
        onOpenChange={() => setPermanentDeleteDoc(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Permanently Delete Document
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete "
              <strong>{permanentDeleteDoc?.title}</strong>"? This action cannot be
              undone and all version data will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermanentDeleteDoc(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handlePermanentDelete}>
              Permanently Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={!!renameDoc} onOpenChange={() => setRenameDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Document</DialogTitle>
            <DialogDescription>
              Enter a new title for "{renameDoc?.title}"
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="new-title" className="text-sm">
              New Title
            </Label>
            <Input
              id="new-title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Document Title"
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDoc(null)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!newTitle.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog open={!!shareDoc} onOpenChange={() => setShareDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Document</DialogTitle>
            <DialogDescription>
              Share "{shareDoc?.title}" with another user
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label htmlFor="share-username" className="text-sm">
                Username
              </Label>
              <Input
                id="share-username"
                value={shareUsername}
                onChange={(e) => setShareUsername(e.target.value)}
                placeholder="Username"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm">Permissions</Label>
              <div className="flex gap-4 mt-1">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={sharePermissions.includes("read")}
                    onChange={(e) => {
                      const newPerms = e.target.checked
                        ? [...sharePermissions, "read"]
                        : sharePermissions.filter(p => p !== "read");
                      setSharePermissions(newPerms);
                    }}
                  />
                  Read
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={sharePermissions.includes("write")}
                    onChange={(e) => {
                      const newPerms = e.target.checked
                        ? [...sharePermissions, "write"]
                        : sharePermissions.filter(p => p !== "write");
                      setSharePermissions(newPerms);
                    }}
                  />
                  Write
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareDoc(null)}>
              Cancel
            </Button>
            <Button onClick={handleShare} disabled={!shareUsername.trim()}>
              Share
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Version Dialog */}
      <Dialog open={!!createVersionDoc} onOpenChange={() => setCreateVersionDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Version</DialogTitle>
            <DialogDescription>
              Create a new version of "{createVersionDoc?.title}"
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="new-version" className="text-sm">
              Version Number
            </Label>
            <Input
              id="new-version"
              value={newVersion}
              onChange={(e) => setNewVersion(e.target.value)}
              placeholder="e.g., 2, 2.0, v2"
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateVersionDoc(null)}>
              Cancel
            </Button>
            <Button onClick={handleCreateVersion} disabled={!newVersion.trim()}>
              Create Version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
