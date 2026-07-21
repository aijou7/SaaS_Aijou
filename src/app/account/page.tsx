import { KeyRound, LockKeyhole, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  changePasswordAction,
  cancelAccountDeletionAction,
  requestAccountDeletionAction,
  updateAccountProfileAction,
} from "@/app/account/actions";
import { AppShell } from "@/components/app-shell";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

type AccountPageProps = {
  searchParams: Promise<{
    error?: string;
    saved?: string;
    deleteError?: string;
    deletionCancelled?: string;
  }>;
};

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const session = await getSession();
  if (!session) redirect("/login");

  const [params, user, business] = await Promise.all([
    searchParams,
    prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        name: true,
        email: true,
        phoneNumber: true,
        role: true,
        status: true,
        deletionRequestedAt: true,
        isPlatformAdmin: true,
      },
    }),
    prisma.business.findFirst({
      where: { userId: session.userId },
      select: { businessName: true },
    }),
  ]);

  if (!user) redirect("/login");

  return (
    <AppShell active="account" businessName={business?.businessName}>
      <section className="hero compact-hero">
        <p className="eyebrow">Keamanan akun</p>
        <h1>Jaga akses workspace tetap aman.</h1>
        <p>
          Ganti password secara berkala. Setelah berhasil, seluruh sesi dengan password lama
          otomatis tidak berlaku lagi.
        </p>
      </section>

      <section className="section split-layout">
        <div className="card">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">Account</p>
              <h2>{user.name}</h2>
            </div>
            <ShieldCheck size={24} aria-hidden="true" />
          </div>
          <div className="checklist">
            <div className="checklist-item">
              <KeyRound size={18} aria-hidden="true" />
              <span>
                <strong>{user.email}</strong>
                <small>{user.role.toLowerCase()} workspace</small>
              </span>
            </div>
            <div className="checklist-item">
              <LockKeyhole size={18} aria-hidden="true" />
              <span>
                <strong>Sesi dapat dicabut</strong>
                <small>Perubahan password memutus semua cookie sesi lama.</small>
              </span>
            </div>
          </div>
          <form className="form-grid" action={updateAccountProfileAction}>
            <label className="span-2">
              Nama owner
              <input name="name" type="text" defaultValue={user.name} maxLength={100} required />
            </label>
            <label className="span-2">
              Nomor WhatsApp owner
              <input
                name="phoneNumber"
                type="tel"
                defaultValue={user.phoneNumber ?? ""}
                placeholder="62812..."
                maxLength={24}
                required
              />
              <small>Hanya nomor ini yang boleh menjalankan perintah finance lewat WhatsApp.</small>
            </label>
            <button className="primary-button span-2" type="submit">Simpan profil owner</button>
          </form>
          {params.saved === "1" ? (
            <div className="settings-note" role="status">Profil owner berhasil disimpan.</div>
          ) : null}
          {user.isPlatformAdmin ? (
            <Link className="ghost-button" href="/beta/invites">Kelola private beta invite</Link>
          ) : null}
        </div>

        <div className="card">
          <h2>Ganti password</h2>
          <p className="muted">Gunakan minimal 12 karakter yang memuat huruf dan angka.</p>
          {params.error ? (
            <div className="settings-note" role="alert">
              <strong>Password belum diubah</strong>
              <p>{formatPasswordError(params.error)}</p>
            </div>
          ) : null}
          <form className="form-grid" action={changePasswordAction}>
            <label className="span-2">
              Password saat ini
              <input name="currentPassword" type="password" autoComplete="current-password" required />
            </label>
            <label className="span-2">
              Password baru
              <input
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </label>
            <label className="span-2">
              Ulangi password baru
              <input
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </label>
            <button className="primary-button span-2" type="submit">
              Simpan password baru
            </button>
          </form>
        </div>
      </section>

      <section className="section">
        <div className="card">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">Privasi & data</p>
              <h2>Export atau hapus akun</h2>
            </div>
            <Trash2 size={24} aria-hidden="true" />
          </div>
          <p className="muted">
            Download konfigurasi workspace kapan saja. Penghapusan akun memakai masa tunggu 7 hari
            agar masih dapat dibatalkan jika berubah pikiran.
          </p>
          <div className="quick-actions">
            <a className="ghost-button" href="/api/account/export" download>
              Download data akun
            </a>
          </div>

          {params.deletionCancelled === "1" ? (
            <div className="settings-note" role="status">Penghapusan akun dibatalkan.</div>
          ) : null}
          {params.deleteError ? (
            <div className="settings-note" role="alert">
              {formatDeletionError(params.deleteError)}
            </div>
          ) : null}

          {user.status === "DELETION_PENDING" ? (
            <div className="settings-note" role="alert">
              <strong>Akun dijadwalkan untuk dihapus</strong>
              <p>
                Permintaan dibuat {user.deletionRequestedAt?.toLocaleString("id-ID") ?? "baru saja"}.
                Batalkan sebelum masa tunggu selesai untuk mempertahankan data.
              </p>
              <form action={cancelAccountDeletionAction}>
                <button className="ghost-button" type="submit">Batalkan penghapusan</button>
              </form>
            </div>
          ) : (
            <form className="form-grid" action={requestAccountDeletionAction}>
              <label className="span-2">
                Konfirmasi password untuk menjadwalkan penghapusan
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  maxLength={128}
                  required
                />
              </label>
              <button className="danger-button span-2" type="submit">
                Jadwalkan hapus akun
              </button>
            </form>
          )}
        </div>
      </section>
    </AppShell>
  );
}

function formatDeletionError(value: string) {
  const messages: Record<string, string> = {
    invalid_password: "Password tidak cocok.",
    platform_admin: "Lepaskan akses platform admin sebelum menghapus akun.",
    workspace_has_members:
      "Pindahkan kepemilikan atau nonaktifkan anggota tim sebelum menghapus akun owner.",
    failed: "Permintaan penghapusan belum berhasil. Coba lagi.",
  };
  return messages[value] ?? messages.failed;
}

function formatPasswordError(value: string) {
  const messages: Record<string, string> = {
    current_password_invalid: "Password saat ini tidak cocok.",
    password_mismatch: "Konfirmasi password baru tidak sama.",
    password_unchanged: "Password baru harus berbeda dari password saat ini.",
    password_update_conflict: "Akun berubah di sesi lain. Login ulang lalu coba lagi.",
    name_required: "Nama owner wajib diisi.",
    phone_invalid: "Nomor WhatsApp harus berisi 8–18 digit, misalnya 62812...",
  };

  return messages[value] ?? value;
}
