import { getTenantById } from "@/modules/tenants/service";
import { listLeadsForTenant } from "@/modules/leads/service";
import { notFound } from "next/navigation";

export default async function TenantLeadsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getTenantById(id);
  if (!tenant) notFound();

  const leads = await listLeadsForTenant(id);

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold text-gold mb-1">{tenant.businessName}</h1>
      <p className="text-muted mb-6">{leads.length} lead(s) captured</p>

      {leads.length === 0 ? (
        <div className="border border-border rounded-lg p-8 text-center text-muted">
          No leads yet — once this tenant&apos;s WhatsApp is paired and a
          customer messages them, leads will show up here.
        </div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left text-gold border-b border-border">
              <th className="py-2 pr-4">Phone</th>
              <th className="py-2 pr-4">Intent</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Last message</th>
              <th className="py-2 pr-4">Created</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} className="border-b border-border hover:bg-panel">
                <td className="py-2 pr-4">{l.phone}</td>
                <td className="py-2 pr-4">{l.intent}</td>
                <td className="py-2 pr-4">{l.status}</td>
                <td className="py-2 pr-4">{(l.lastMessage ?? "").slice(0, 60)}</td>
                <td className="py-2 pr-4">{new Date(l.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
