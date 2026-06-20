import { Download, Edit, Plus, Search, Trash2, Upload } from "lucide-react";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";

const quickReplies = [
  {
    name: "Minta detail kebutuhan",
    createdAt: "16 June 2026",
    private: "No",
    content: "Boleh info lokasi, jumlah titik/perangkat, dan target pengerjaannya?",
  },
  {
    name: "Handoff ke owner",
    createdAt: "16 June 2026",
    private: "No",
    content: "Baik, saya panggilkan owner/admin untuk lanjut bantu ya.",
  },
  {
    name: "Tidak beri harga final",
    createdAt: "16 June 2026",
    private: "No",
    content: "Untuk harga final perlu dicek owner setelah scope dan lokasi jelas.",
  },
];

export default async function QuickRepliesPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  return (
    <AppShell active="quick-replies" businessName="Quick Replies">
      <section className="content-panel">
        <div className="content-toolbar">
          <h1>Quick Replies</h1>
          <div className="content-actions">
            <label className="toolbar-search">
              <input type="search" placeholder="Search Quick Replies" />
              <Search size={16} aria-hidden="true" />
            </label>
            <button className="outline-button" type="button">
              <Upload size={15} aria-hidden="true" />
              Import CSV
            </button>
            <button className="outline-button" type="button">
              <Download size={15} aria-hidden="true" />
              Export CSV
            </button>
            <button className="primary-button" type="button">
              <Plus size={15} aria-hidden="true" />
              Add Quick Reply
            </button>
          </div>
        </div>

        <table className="table quick-reply-table">
          <thead>
            <tr>
              <th>Quick Reply Name</th>
              <th>Created At</th>
              <th>Private Quick Reply</th>
              <th>Content</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {quickReplies.map((reply) => (
              <tr key={reply.name}>
                <td>{reply.name}</td>
                <td>{reply.createdAt}</td>
                <td>{reply.private}</td>
                <td>{reply.content}</td>
                <td>
                  <div className="table-actions">
                    <button className="small-outline-button" type="button">
                      <Edit size={13} aria-hidden="true" />
                      Edit
                    </button>
                    <button className="small-danger-button" type="button">
                      <Trash2 size={13} aria-hidden="true" />
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
