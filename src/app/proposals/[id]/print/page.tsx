import { notFound, redirect } from "next/navigation";
import { PrintButton } from "@/app/proposals/[id]/print/print-button";
import { AijouLogo } from "@/components/aijou-logo";
import { getSession } from "@/lib/session";
import { getProposalDraftForPrint } from "@/server/proposals/proposal-drafts";

type ProposalPrintPageProps = { params: Promise<{ id: string }> };

export default async function ProposalPrintPage({ params }: ProposalPrintPageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;
  const proposal = await getProposalDraftForPrint(session.userId, id);
  if (!proposal) notFound();

  return (
    <main className="proposal-document">
      <header className="proposal-document-header">
        <div className="landing-brand">
          <AijouLogo size={36} />
          {proposal.business.businessName}
        </div>
        <div>
          <strong>{proposal.proposalNumber ?? "DRAFT"}</strong>
          <span>Revision {proposal.version}</span>
          <span>{proposal.createdAt.toLocaleDateString("id-ID")}</span>
        </div>
      </header>
      <section className="proposal-document-title">
        <p>PROPOSAL / ESTIMASI AWAL</p>
        <h1>{proposal.title}</h1>
        <div className="proposal-document-meta">
          <span>Klien: <strong>{proposal.clientName ?? "-"}</strong></span>
          <span>Kontak: <strong>{proposal.lead.customerPhone ?? "-"}</strong></span>
          <span>Lokasi: <strong>{proposal.lead.location ?? "-"}</strong></span>
          <span>Berlaku sampai: <strong>{proposal.validUntil?.toLocaleDateString("id-ID") ?? "-"}</strong></span>
        </div>
      </section>
      <DocumentSection title="Ringkasan project"><p>{proposal.projectSummary}</p></DocumentSection>
      <div className="proposal-document-columns">
        <DocumentList title="Scope of work" items={proposal.scopeOfWork} />
        <DocumentList title="Next steps" items={proposal.nextSteps} />
        <DocumentList title="Assumptions" items={proposal.assumptions} />
        <DocumentList title="Exclusions" items={proposal.exclusions} />
      </div>
      <DocumentSection title="Estimasi awal">
        <p className="proposal-document-price">
          {formatEstimate(proposal.estimatedValueMin?.toString(), proposal.estimatedValueMax?.toString())}
        </p>
        <p>Timeline: {proposal.timeline ?? "Dikonfirmasi setelah scope divalidasi."}</p>
      </DocumentSection>
      <footer className="proposal-document-footer">
        <p>{proposal.disclaimer}</p>
        <div>
          <span>{proposal.business.address ?? ""}</span>
          <span>{proposal.business.whatsappNumber ?? ""}</span>
          <span>{proposal.business.websiteUrl ?? ""}</span>
        </div>
      </footer>
      <PrintButton />
    </main>
  );
}

function DocumentSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="proposal-document-section"><h2>{title}</h2>{children}</section>;
}

function DocumentList({ title, items }: { title: string; items: string[] }) {
  return (
    <DocumentSection title={title}>
      <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
    </DocumentSection>
  );
}

function formatEstimate(min?: string, max?: string) {
  if (!min && !max) return "Menunggu validasi scope";
  const format = (value: string) => new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(Number(value));
  return min && max ? `${format(min)} – ${format(max)}` : format(min ?? max ?? "0");
}
