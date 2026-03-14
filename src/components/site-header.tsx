import { Database } from "lucide-react";
import { ModeToggle } from "./mode-toggle";

export function Header() {
  return (
    <header className="border-border/40 bg-background/95 supports-backdrop-filter:bg-background/60 w-full border-b backdrop-blur-sm">
      <div className="container flex h-12 max-w-(--breakpoint-2xl) items-center gap-3">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <span className="font-bold text-sm">Instrumenta Storage Inspector</span>
          <span className="text-xs text-muted-foreground hidden sm:inline">— Admin & Debug Tool</span>
        </div>
        <div className="ml-auto" />
        <ModeToggle />
      </div>
    </header>
  );
}
