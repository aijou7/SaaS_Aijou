import { AlertTriangle, CheckCircle2, Clock3, LifeBuoy, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createComplaintAction, updateComplaintAction } from "@/app/complaints/actions";
import { AppShell } from "@/components/app-shell";
import { OpsModal } from "@/components/ops-modal";
import { ComplaintPriority, ComplaintStatus } from "@/generated/prisma-beta/client";
import { getSession } from "@/lib/session";
import { getComplaintsPage } from "@/server/operations/complaints";

export default async function ComplaintsPage({ searchParams }: { searchParams: Promise<{ status?: string; create?: string }> }) {
  const session = await getSession(); if (!session) redirect("/login");
  const params = await searchParams; const page = await getComplaintsPage(session.userId, params.status); const readOnly = session.role === "VIEWER";
  return <AppShell active="complaints" businessName={page.businessName} workspaceRole={session.role??"VIEWER"}><section className="ops-page">
    <header className="ops-header"><div><p className="eyebrow">Customer care</p><h1>Manajemen komplain</h1><p>Ticket, prioritas, penanggung jawab, SLA, dan riwayat tindakan dalam satu tempat.</p></div>{!readOnly?<Link className="primary-button" href="/complaints?create=1"><Plus size={17}/>Buat ticket</Link>:null}</header>
    <div className="ops-metrics"><Metric icon={LifeBuoy} label="Aktif" value={(page.counts.OPEN ?? 0)+(page.counts.IN_PROGRESS ?? 0)} /><Metric icon={Clock3} label="Menunggu customer" value={page.counts.WAITING_CUSTOMER ?? 0}/><Metric icon={AlertTriangle} label="Lewat SLA" value={page.overdue} warning/><Metric icon={CheckCircle2} label="Selesai" value={(page.counts.RESOLVED ?? 0)+(page.counts.CLOSED ?? 0)}/></div>
    <nav className="filter-pills" aria-label="Filter komplain"><Link className={!params.status?"active":""} href="/complaints">Semua</Link>{Object.values(ComplaintStatus).map(status=><Link className={params.status===status?"active":""} href={`/complaints?status=${status}`} key={status}>{label(status)}</Link>)}</nav>
    <div className="ticket-grid">{page.complaints.length===0?<div className="ops-empty"><LifeBuoy size={28}/><h2>Belum ada komplain</h2><p>Ticket baru akan muncul di sini lengkap dengan batas SLA.</p></div>:page.complaints.map(item=><article className="ticket-card" key={item.id}>
      <div className="ticket-card-head"><div><span className="ticket-number">{item.ticketNumber}</span><h2>{item.title}</h2></div><span className={`priority-badge ${item.priority.toLowerCase()}`}>{label(item.priority)}</span></div>
      <p>{item.description}</p><div className="ticket-facts"><span>{item.contact?.displayName??item.contact?.phoneNumber??"Tanpa kontak"}</span><span>{item.assignedToUser?.name??"Belum ditugaskan"}</span><span className={item.slaDueAt&&item.slaDueAt<new Date()&&!['RESOLVED','CLOSED'].includes(item.status)?"danger-text":""}>SLA {item.slaDueAt?formatDate(item.slaDueAt):"-"}</span></div>
      {!readOnly?<form className="ticket-update-form" action={updateComplaintAction}><input type="hidden" name="complaintId" value={item.id}/><select name="status" defaultValue={item.status}>{Object.values(ComplaintStatus).map(v=><option key={v} value={v}>{label(v)}</option>)}</select><select name="priority" defaultValue={item.priority}>{Object.values(ComplaintPriority).map(v=><option key={v} value={v}>{label(v)}</option>)}</select><select name="assignedToUserId" defaultValue={item.assignedToUser?.id??""}><option value="">Belum ditugaskan</option>{page.users.map(user=><option value={user.id} key={user.id}>{user.name}</option>)}</select><input name="note" placeholder="Catatan tindak lanjut" maxLength={2000}/><button className="small-outline-button" type="submit">Simpan</button></form>:<small className="muted">Mode hanya lihat</small>}
    </article>)}</div>
    {!readOnly&&params.create?<OpsModal action={createComplaintAction} closeHref="/complaints" eyebrow="Ticket baru" id="create-complaint-title" submitLabel="Buat ticket" title="Catat komplain"><label>Judul<input name="title" required maxLength={180}/></label><label>Detail<textarea name="description" rows={5} required maxLength={4000}/></label><div className="form-grid"><label>Kontak<select name="contactId"><option value="">Tanpa kontak</option>{page.contacts.map(c=><option value={c.id} key={c.id}>{c.displayName??c.phoneNumber}</option>)}</select></label><label>Kategori<input name="category" placeholder="Layanan, produk, pengiriman…"/></label><label>Prioritas<select name="priority" defaultValue="NORMAL">{Object.values(ComplaintPriority).map(v=><option value={v} key={v}>{label(v)}</option>)}</select></label><label>Penanggung jawab<select name="assignedToUserId"><option value="">Belum ditugaskan</option>{page.users.map(u=><option value={u.id} key={u.id}>{u.name}</option>)}</select></label></div></OpsModal>:null}
  </section></AppShell>;
}
function Metric({icon:Icon,label:labelText,value,warning}:{icon:typeof LifeBuoy;label:string;value:number;warning?:boolean}){return <div className={`ops-metric ${warning?"warning":""}`}><Icon size={19}/><span>{labelText}</span><strong>{value}</strong></div>}
function label(value:string){return value.toLowerCase().split('_').map(p=>p[0].toUpperCase()+p.slice(1)).join(' ')}
function formatDate(value:Date){return new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Makassar'}).format(value)}
