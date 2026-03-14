import { ExportButton } from "./export-button";
import { FilterButton } from "./filter-button";

export function ConfigPanel() {
  return (
    <div className="flex w-64 flex-col gap-4">
      <h2 className="text-xl">Configure</h2>
      <FilterButton />
      <ExportButton />
    </div>
  );
}