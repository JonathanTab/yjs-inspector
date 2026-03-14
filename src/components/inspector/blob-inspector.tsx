import { useState, useEffect } from 'react';
import type { FileDescriptor, BlobInfo } from '@/types/storage';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createServerApi } from '@/lib/server-api';
import { useConnectionConfig } from '@/state/storage';
import { Download, Upload, FileImage, File, ExternalLink, Loader2, FileText, Copy, Check } from 'lucide-react';

interface BlobInspectorProps {
    file: FileDescriptor;
    onUpdate?: (file: FileDescriptor) => void;
}

function isPreviewable(mimeType: string | null): boolean {
    if (!mimeType) return false;
    return mimeType.startsWith('image/') || mimeType === 'application/pdf';
}

function isTextMime(mimeType: string | null): boolean {
    if (!mimeType) return false;
    
    const textTypes = [
        'text/',
        'application/json',
        'application/javascript',
        'application/xml',
        'application/x-yaml',
        'application/yaml',
    ];
    
    return textTypes.some(t => mimeType.includes(t)) || 
           mimeType.endsWith('+json') || 
           mimeType.endsWith('+xml');
}

export function BlobInspector({ file }: BlobInspectorProps) {
    const [connectionConfig] = useConnectionConfig();
    const [blobInfo, setBlobInfo] = useState<BlobInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [streamUrl, setStreamUrl] = useState<string | null>(null);
    const [textContent, setTextContent] = useState<string | null>(null);
    const [textLoading, setTextLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (file.type !== 'blob' || !file.blobKey) return;

        const loadBlobInfo = async () => {
            setLoading(true);
            try {
                const api = createServerApi(connectionConfig);
                const info = await api.getBlobInfo(file.id);
                setBlobInfo(info);

                // Set stream URL for all blobs (used by Open button)
                const url = api.getBlobStreamUrl(file.id);
                setStreamUrl(url);
                if (isPreviewable(file.mimeType)) {
                    setPreviewUrl(url);
                }
            } catch (error) {
                console.error('Failed to load blob info:', error);
            } finally {
                setLoading(false);
            }
        };

        loadBlobInfo();
    }, [file, connectionConfig]);

    // Load text content for text files
    useEffect(() => {
        if (file.type !== 'blob' || !isTextMime(file.mimeType)) {
            setTextContent(null);
            return;
        }

        const loadTextContent = async () => {
            setTextLoading(true);
            try {
                const api = createServerApi(connectionConfig);
                const blob = await api.downloadBlob(file.id);
                const text = await blob.text();
                setTextContent(text);
            } catch (error) {
                console.error('Failed to load text content:', error);
                setTextContent(null);
            } finally {
                setTextLoading(false);
            }
        };

        loadTextContent();
    }, [file, connectionConfig]);

    const handleDownload = async () => {
        try {
            const api = createServerApi(connectionConfig);
            const blob = await api.downloadBlob(file.id);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.filename || file.title || 'download';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to download blob:', error);
        }
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const uploadedFile = e.target.files?.[0];
        if (!uploadedFile) return;

        setLoading(true);
        try {
            const api = createServerApi(connectionConfig);
            await api.uploadBlob(file.id, uploadedFile);
            // Refresh blob info
            const info = await api.getBlobInfo(file.id);
            setBlobInfo(info);
        } catch (error) {
            console.error('Failed to upload blob:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCopyText = async () => {
        if (textContent) {
            await navigator.clipboard.writeText(textContent);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (file.type !== 'blob') {
        return (
            <div className="p-4 text-center text-muted-foreground">
                This file is not a blob
            </div>
        );
    }

    return (
        <div className="p-4 space-y-6">
            {/* Blob Info */}
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <File className="h-4 w-4" />
                    <Label className="text-base">Blob Content</Label>
                </div>

                {loading && (
                    <div className="flex items-center justify-center p-8">
                        <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                )}

                {!loading && blobInfo && (
                    <div className="space-y-3 pl-6">
                        <div className="flex items-center justify-between p-2 bg-muted rounded">
                            <span className="text-sm">Filename</span>
                            <span className="text-sm font-mono">
                                {blobInfo.filename || 'N/A'}
                            </span>
                        </div>

                        <div className="flex items-center justify-between p-2 bg-muted rounded">
                            <span className="text-sm">MIME Type</span>
                            <Badge variant="outline">
                                {blobInfo.mimeType || 'Unknown'}
                            </Badge>
                        </div>

                        <div className="flex items-center justify-between p-2 bg-muted rounded">
                            <span className="text-sm">Size</span>
                            <span className="text-sm">
                                {blobInfo.size != null
                                    ? `${(blobInfo.size / 1024).toFixed(2)} KB`
                                    : 'N/A'}
                            </span>
                        </div>

                        <div className="flex items-center justify-between p-2 bg-muted rounded">
                            <span className="text-sm">Blob Exists</span>
                            <Badge variant={blobInfo.blobExists ? 'default' : 'destructive'}>
                                {blobInfo.blobExists ? 'Yes' : 'No'}
                            </Badge>
                        </div>
                    </div>
                )}
            </div>

            {/* Image Preview */}
            {previewUrl && isPreviewable(file.mimeType) && file.mimeType?.startsWith('image/') && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <FileImage className="h-4 w-4" />
                        <Label className="text-base">Preview</Label>
                    </div>

                    <div className="pl-6">
                        <img
                            src={previewUrl}
                            alt={file.title}
                            className="max-w-full rounded border"
                            style={{ maxHeight: '300px' }}
                        />
                    </div>
                </div>
            )}

            {/* PDF Preview */}
            {previewUrl && file.mimeType === 'application/pdf' && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <File className="h-4 w-4" />
                        <Label className="text-base">PDF Preview</Label>
                    </div>

                    <div className="pl-6">
                        <iframe
                            src={previewUrl}
                            className="w-full rounded border"
                            style={{ height: '300px' }}
                            title="PDF Preview"
                        />
                    </div>
                </div>
            )}

            {/* Text Preview */}
            {isTextMime(file.mimeType) && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            <Label className="text-base">Text Content</Label>
                        </div>
                        {textContent && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleCopyText}
                            >
                                {copied ? (
                                    <>
                                        <Check className="h-3 w-3 mr-1" />
                                        Copied
                                    </>
                                ) : (
                                    <>
                                        <Copy className="h-3 w-3 mr-1" />
                                        Copy
                                    </>
                                )}
                            </Button>
                        )}
                    </div>

                    <div className="pl-6">
                        {textLoading ? (
                            <div className="flex items-center justify-center p-8 border rounded bg-muted">
                                <Loader2 className="h-5 w-5 animate-spin" />
                            </div>
                        ) : textContent ? (
                            <pre className="p-3 border rounded bg-muted overflow-auto text-xs font-mono max-h-[300px] whitespace-pre-wrap break-all">
                                {textContent.substring(0, 10000)}
                                {textContent.length > 10000 && (
                                    <span className="text-muted-foreground">
                                        {'\n\n... truncated'}
                                    </span>
                                )}
                            </pre>
                        ) : (
                            <div className="p-4 border rounded bg-muted text-sm text-muted-foreground">
                                Unable to load text content
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 flex-wrap">
                <Button variant="outline" onClick={handleDownload}>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                </Button>

                <Button variant="outline" asChild>
                    <label className="cursor-pointer">
                        <Upload className="h-4 w-4 mr-2" />
                        Upload
                        <input
                            type="file"
                            className="hidden"
                            onChange={handleUpload}
                            accept={file.mimeType || undefined}
                        />
                    </label>
                </Button>

                {streamUrl && (
                    <Button variant="ghost" onClick={() => window.open(streamUrl, '_blank')}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Open
                    </Button>
                )}
            </div>

            {/* Blob Key */}
            {file.blobKey && (
                <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">Blob Key</Label>
                    <div className="text-xs font-mono p-2 bg-muted rounded break-all">
                        {file.blobKey}
                    </div>
                </div>
            )}
        </div>
    );
}