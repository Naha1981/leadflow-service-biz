import { listTenants } from "@/modules/tenants/service";
import Link from "next/link";

const STATUS_COLORS: Record<string, string> = {
  trial: "bg-indigo",
  active: "bg-green-700",
  pending_connect: "bg-amber-700",
  paused: "bg-gray-600",
  churned: "bg-red-800",
};

export default async function DashboardPage() {
  const tenants = await listTenants();

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold text-gold mb-1">LeadFlow Admin</h1>
      <p className="text-muted mb-6">Every business you&apos;ve onboarded, at a glance.</p>

      {tenants.length === 0 ? (
        <div className="border border-border rounded-lg p-8 text-center text-muted">
          No tenants yet — onboard your first business via{" "}
          <code className="text-gold">POST /api/v1/tenants</code>.
        </div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left text-gold border-b border-border">
              <th className="py-2 pr-4">Business</th>
              <th className="py-2 pr-4">Niche</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Monthly Fee</th>
              <th className="py-2 pr-4">Created</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id} className="border-b border-border hover:bg-panel">
                <td className="py-2 pr-4">{t.businessName}</td>
                <td className="py-2 pr-4">{t.niche}</td>
                <td className="py-2 pr-4">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[t.status] ?? "bg-gray-600"}`}
                  >
                    {t.status}
                  </span>
                </td>
                <td className="py-2 pr-4">R{t.monthlyFee}</td>
                <td className="py-2 pr-4">{new Date(t.createdAt).toLocaleDateString()}</td>
                <td className="py-2 pr-4">
                  <Link href={`/dashboard/${t.id}`} className="text-indigo underline">
                    View leads
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
