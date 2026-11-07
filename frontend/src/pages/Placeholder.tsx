import { EmptyState } from "../components/ui";
import type { NavItem } from "../nav";

export default function Placeholder({ item }: { item: NavItem }) {
  return (
    <div>
      <PageHeader title={item.label} subtitle={item.blurb} />
      <div className="rounded-xl border border-dashed border-line">
        <EmptyState icon={item.icon} title={`${item.label} is on the roadmap`} text={`This module is built in Phase ${item.phase}. Nothing here is mocked, so there is no data to show until then.`} />
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
    </div>
  );
}
