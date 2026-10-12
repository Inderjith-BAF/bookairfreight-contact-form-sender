import { CentralLeadInventory } from "@/components/central-lead-inventory";
import { BlueprintNav } from "@/components/blueprint-nav";
export const dynamic = "force-dynamic";
export default function LeadInventoryPage() {
  return <div className="min-h-screen bg-slate-50 p-3 md:p-5"><div className="mx-auto max-w-[1800px]"><BlueprintNav/><CentralLeadInventory/></div></div>;
}