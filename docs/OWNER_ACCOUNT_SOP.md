# SOP akun, role workspace, dan email owner

## Prinsip dasar

- Satu email adalah satu identitas login Aijou.
- Satu akun dapat mengakses lebih dari satu workspace.
- Role selalu ditentukan per workspace. Seorang pengguna boleh menjadi Owner di workspace sendiri, Admin di workspace lain, Agent di workspace ketiga, dan Viewer di workspace berikutnya.
- Menerima undangan tidak boleh mengubah atau menghapus workspace yang sudah dimiliki pengguna.

## Menerima undangan workspace

1. Owner atau Admin mengirim undangan ke email akun tujuan dan memilih role.
2. Pengguna harus login menggunakan email yang sama dengan alamat undangan.
3. Setelah diterima, role undangan hanya berlaku di workspace pengundang.
4. Workspace pengundang otomatis menjadi workspace aktif setelah penerimaan.
5. Pengguna dapat berpindah workspace melalui pemilih `Workspace aktif` tanpa berganti akun.

## Mengganti email login owner

Alur ini hanya untuk mengganti alamat email orang/akun yang sama. Ini bukan transfer kepemilikan.

1. Owner membuka `Pengaturan > Keamanan akun` pada workspace miliknya.
2. Owner mengisi email baru dan password saat ini.
3. Sistem menolak email baru yang sudah menjadi akun Aijou untuk mencegah penggabungan dua identitas.
4. Sistem mengirim OTP berbeda ke email lama dan email baru. Keduanya berlaku 30 menit.
5. Owner memasukkan kedua OTP dan password saat ini sekali lagi.
6. Sistem mengganti email, menandai email baru terverifikasi, mencabut token autentikasi, memutar versi password tanpa mengubah password, dan mencabut semua sesi lama.
7. Sistem mencatat audit log serta mengirim pemberitahuan ke email lama dan email baru.

## Transfer kepemilikan ke orang lain

Transfer kepemilikan harus menjadi operasi terpisah dari pergantian email:

1. Undang calon owner sebagai Admin.
2. Pastikan calon owner menerima undangan dan dapat login.
3. Pastikan tidak ada pekerjaan, integrasi, atau pembayaran yang sedang berubah.
4. Minta persetujuan eksplisit dari owner lama dan calon owner.
5. Jalankan transfer kepemilikan yang mencatat audit log dan mengubah owner workspace secara atomik.
6. Pertahankan owner lama sebagai Admin atau keluarkan sesuai keputusan kedua pihak.

Jangan pernah mengganti email owner menjadi email akun lain sebagai jalan pintas transfer kepemilikan.
