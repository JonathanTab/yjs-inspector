import { useBrowserMode } from '@/state/storage';
import type { BrowserMode } from '@/types/storage';
import { FolderTree, LayoutList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ScopeToggle() {
    const [browserMode, setBrowserMode] = useBrowserMode();

    const modes: { value: BrowserMode; label: string; icon: typeof FolderTree }[] = [
        { value: 'tree', label: 'Drive Tree', icon: FolderTree },
        { value: 'list', label: 'App List', icon: LayoutList },
    ];

    return (
        <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
            {modes.map(({ value, label, icon: Icon }) => (
                <Button
                    key={value}
                    variant="ghost"
                    size="sm"
                    onClick={() => setBrowserMode(value)}
                    className={cn(
                        'gap-1 px-2',
                        browserMode === value && 'bg-background shadow-sm'
                    )}
                >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{label}</span>
                </Button>
            ))}
        </div>
    );
}