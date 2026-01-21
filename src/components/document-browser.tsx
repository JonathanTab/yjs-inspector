import { Plus, Search, Share, Trash2, User } from "lucide-react";
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
import { useToast } from "./ui/use-toast";
import {
  createDocumentManagerApi,
  Document,
  DocumentManagerConfig,
} from "../lib/document-manager-api";

interface DocumentBrowserProps {
  config: DocumentManagerConfig;
  onSelectDocument: (id: string, version: string) => void;
  onCreateDocument: () => void;
}

export function DocumentBrowser({
  config,
  onSelectDocument,
  onCreateDocument,
}: DocumentBrowserProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [toolFilter, setToolFilter] = useState<string>("");
  const [selectedVersions, setSelectedVersions] = useState<Record<string, string>>({});
  const { toast } = useToast();

  // Memoize the API client to prevent recreation on every render
  const api = useMemo(() => createDocumentManagerApi(config), [config]);

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const docs = await api.listDocuments(config.adminMode ?? false);
      setDocuments(docs);
      
      // Initialize selected versions to latest for each document
      const latestVersions: Record<string, string> = {};
      docs.forEach((doc) => {
        const versions = Object.keys(doc.versions).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
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

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.owner.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTool = !toolFilter || doc.tool === toolFilter;
    return matchesSearch && matchesTool;
  });

  const uniqueTools = Array.from(
    new Set(documents.map((doc) => doc.tool).filter(Boolean)),
  );

  // Handle tool filter selection
  const handleToolFilterChange = (value: string) => {
    setToolFilter(value === "all-tools" ? "" : value);
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

  // Get sorted versions for a document (newest first)
  const getSortedVersions = (versions: Record<string, string>) => {
    return Object.keys(versions).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Browse Documents</h2>
        <p className="text-sm text-muted-foreground">Select a document to connect to</p>
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
          <Label htmlFor="tool-filter">Filter by Tool</Label>
          <Select
            value={toolFilter || "all-tools"}
            onValueChange={handleToolFilterChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="All tools" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-tools">All tools</SelectItem>
              {uniqueTools.map((tool) => (
                <SelectItem key={tool} value={tool}>
                  {tool}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-end">
          <Button onClick={onCreateDocument} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New Document
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-center py-8">Loading documents...</div>
        ) : filteredDocuments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {documents.length === 0
              ? "No documents found"
              : "No documents match your search"}
          </div>
        ) : (
          <div className="grid gap-3">
            {filteredDocuments.map((doc) => {
              const versions = getSortedVersions(doc.versions);
              const selectedVersion = selectedVersions[doc.id] || versions[0];
              
              return (
                <div
                  key={doc.id}
                  className="border rounded-lg p-4 bg-white hover:shadow-sm transition-shadow dark:bg-gray-800"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-lg truncate">{doc.title}</h3>
                      <p className="text-sm text-muted-foreground">ID: {doc.id}</p>
                      <p className="text-sm text-muted-foreground">Owner: {doc.owner}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {doc.tool && (
                          <Badge variant="secondary">
                            {doc.tool}
                          </Badge>
                        )}
                        <Badge variant="outline">
                          v{selectedVersion}
                        </Badge>
                      </div>

                      {doc.shared_with.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {doc.shared_with.slice(0, 3).map((shared) => (
                            <Badge key={shared.username} variant="outline" className="text-xs">
                              <User className="h-3 w-3 mr-1" />
                              {shared.username}
                              {shared.permissions.includes("write") ? " (RW)" : " (R)"}
                            </Badge>
                          ))}
                          {doc.shared_with.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{doc.shared_with.length - 3} more
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2 ml-4">
                      <div className="flex items-center gap-2">
                        <Select
                          value={selectedVersion}
                          onValueChange={(v) => handleVersionChange(doc.id, v)}
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
                          onClick={() => onSelectDocument(doc.id, selectedVersion)}
                          className="flex items-center gap-2"
                        >
                          Select
                        </Button>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {doc.shared_with.length > 0 && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Share className="h-4 w-4" />
                            <span>{doc.shared_with.length}</span>
                          </div>
                        )}

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteDocument(doc.id)}
                          className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
