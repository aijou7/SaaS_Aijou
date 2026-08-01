export const marketingFeatureCategories = [
  "Percakapan",
  "Pelanggan",
  "AI & Otomasi",
  "Operasional",
] as const;

export type MarketingFeatureCategory = (typeof marketingFeatureCategories)[number];

export type MarketingFeatureIcon =
  | "bot"
  | "whatsapp"
  | "web"
  | "telegram"
  | "layers"
  | "hand"
  | "contact"
  | "pipeline"
  | "segment"
  | "complaint"
  | "wand"
  | "book"
  | "clock"
  | "automation"
  | "broadcast"
  | "product"
  | "order"
  | "shipping";

export type MarketingFeature = {
  slug: string;
  category: MarketingFeatureCategory;
  icon: MarketingFeatureIcon;
  navTitle: string;
  title: string;
  eyebrow: string;
  summary: string;
  hero: string;
  description: string;
  outcomes: Array<{ title: string; description: string }>;
  steps: Array<{ title: string; description: string }>;
};

export const marketingFeatures: MarketingFeature[] = [
  {
    slug: "chatbot-ai",
    category: "Percakapan",
    icon: "bot",
    navTitle: "Chatbot AI",
    title: "Chatbot AI yang memahami konteks bisnis",
    eyebrow: "Jawaban natural, bukan skrip kaku",
    summary: "Menjawab dari knowledge, produk, harga, dan riwayat percakapan bisnis Anda.",
    hero: "Bukan sekadar membalas. Aijou memahami apa yang sedang pelanggan usahakan.",
    description:
      "Aijou memakai konteks percakapan dan sumber pengetahuan yang Anda kelola sendiri. Jawaban tetap ringkas, relevan, dan bisa diteruskan manusia tanpa mengulang pembicaraan.",
    outcomes: [
      { title: "Jawaban berbasis bisnis", description: "Profil, FAQ, layanan, produk, dan harga menjadi acuan jawaban." },
      { title: "Konteks tidak terputus", description: "Pertanyaan lanjutan dipahami dari percakapan sebelumnya." },
      { title: "Tetap dalam kendali", description: "Atur gaya bahasa, batas jawaban, dan kapan AI harus berhenti." },
    ],
    steps: [
      { title: "Isi pengetahuan", description: "Tambahkan profil, FAQ, produk, dan aturan penting bisnis." },
      { title: "Uji di simulator", description: "Lihat kualitas jawaban sebelum AI diaktifkan ke pelanggan." },
      { title: "Pantau percakapan", description: "Tinjau respons dan perbaiki konteks langsung dari workspace." },
    ],
  },
  {
    slug: "whatsapp-ai",
    category: "Percakapan",
    icon: "whatsapp",
    navTitle: "AI untuk WhatsApp",
    title: "AI customer service langsung di WhatsApp",
    eyebrow: "Terhubung ke WhatsApp Cloud API",
    summary: "Balas pelanggan otomatis dan lanjutkan sebagai manusia dari inbox yang sama.",
    hero: "Pelanggan tetap memakai WhatsApp. Tim Anda mendapat cara kerja yang jauh lebih rapi.",
    description:
      "Pesan WhatsApp masuk melalui integrasi resmi Meta. AI menangani pertanyaan rutin, sementara percakapan penting dapat langsung diambil alih oleh tim.",
    outcomes: [
      { title: "Integrasi resmi Meta", description: "Menggunakan WhatsApp Business Platform dan webhook terverifikasi." },
      { title: "Status pesan terlihat", description: "Pesan masuk, terkirim, dan terbaca tercatat di percakapan." },
      { title: "Human takeover", description: "Tim membalas dari dashboard tanpa memutus konteks." },
    ],
    steps: [
      { title: "Hubungkan WABA", description: "Masukkan WABA ID, Phone Number ID, dan System User token." },
      { title: "Verifikasi webhook", description: "Aijou memeriksa nomor, izin token, dan koneksi Meta." },
      { title: "Aktifkan AI", description: "Nyalakan balasan otomatis setelah pengujian selesai." },
    ],
  },
  {
    slug: "web-live-chat",
    category: "Percakapan",
    icon: "web",
    navTitle: "Web Live Chat",
    title: "Live chat AI yang siap dipasang di website",
    eyebrow: "Widget ringan untuk situs bisnis",
    summary: "Terima chat dari website, simpan konteks 24 jam, dan balas dari dashboard.",
    hero: "Ubah pengunjung website menjadi percakapan yang bisa ditindaklanjuti.",
    description:
      "Widget Aijou dipasang dengan satu snippet JavaScript. Riwayat pengunjung tersimpan sementara, AI memakai knowledge workspace, dan tim dapat mengambil alih dari inbox yang sama.",
    outcomes: [
      { title: "Mudah dipasang", description: "Satu snippet dapat dipakai di website statis maupun framework modern." },
      { title: "Konteks 24 jam", description: "Refresh halaman tidak langsung menghapus alur percakapan pengunjung." },
      { title: "Terhubung ke inbox", description: "Chat website terlihat bersama channel lain di dashboard." },
    ],
    steps: [
      { title: "Salin snippet", description: "Ambil kode widget dari menu Integrasi." },
      { title: "Pasang di website", description: "Tempel sebelum penutup body lalu publikasikan." },
      { title: "Uji percakapan", description: "Pastikan domain diizinkan dan jawaban AI sudah sesuai." },
    ],
  },
  {
    slug: "telegram-ai",
    category: "Percakapan",
    icon: "telegram",
    navTitle: "AI untuk Telegram",
    title: "Bot Telegram yang terhubung ke workspace",
    eyebrow: "Satu knowledge, channel tambahan",
    summary: "Hubungkan bot Telegram dan tangani pesannya dari percakapan Aijou.",
    hero: "Layani komunitas Telegram tanpa membuat alur kerja baru untuk tim.",
    description:
      "Bot Telegram memakai pengetahuan dan aturan agent yang sama. Pesan masuk melalui webhook aman lalu muncul di inbox untuk dijawab AI atau manusia.",
    outcomes: [
      { title: "Setup langsung", description: "Masukkan bot token lalu Aijou menyiapkan webhook." },
      { title: "Knowledge konsisten", description: "Tidak perlu melatih agent terpisah untuk Telegram." },
      { title: "Inbox yang sama", description: "Tim tetap bekerja dari satu daftar percakapan." },
    ],
    steps: [
      { title: "Buat bot", description: "Dapatkan bot token resmi dari BotFather." },
      { title: "Tes koneksi", description: "Aijou memvalidasi bot dan memasang webhook." },
      { title: "Mulai melayani", description: "Pesan baru langsung masuk ke workspace." },
    ],
  },
  {
    slug: "omnichannel-inbox",
    category: "Percakapan",
    icon: "layers",
    navTitle: "Omnichannel Inbox",
    title: "Satu inbox untuk semua percakapan aktif",
    eyebrow: "WhatsApp, web, dan Telegram",
    summary: "Satukan tiga kanal agar tim tidak berpindah aplikasi untuk membaca pelanggan.",
    hero: "Semua chat masuk ke satu ruang kerja, lengkap dengan konteks dan penanggung jawab.",
    description:
      "WhatsApp, live chat website, dan Telegram hadir dalam satu daftar percakapan. Tim dapat mencari, memfilter, menugaskan, dan mengambil alih chat dari tempat yang sama.",
    outcomes: [
      { title: "Satu tampilan kerja", description: "Tidak perlu membuka tiga dashboard untuk menangani pelanggan." },
      { title: "Riwayat terpusat", description: "Pesan AI dan manusia tersimpan dalam alur yang sama." },
      { title: "Tugas lebih jelas", description: "Status dan penanggung jawab percakapan terlihat oleh tim." },
    ],
    steps: [
      { title: "Pasang channel", description: "Aktifkan widget web, Telegram, atau WhatsApp dari Integrasi." },
      { title: "Pesan masuk", description: "Percakapan baru otomatis muncul di inbox." },
      { title: "Kerjakan bersama", description: "AI menangani rutinitas dan tim masuk saat diperlukan." },
    ],
  },
  {
    slug: "human-takeover",
    category: "Percakapan",
    icon: "hand",
    navTitle: "Human Takeover",
    title: "Manusia dapat mengambil alih kapan saja",
    eyebrow: "AI membantu, tim tetap memutuskan",
    summary: "Jeda AI, balas sebagai tim, lalu aktifkan kembali ketika percakapan sudah aman.",
    hero: "Otomatisasi terbaik tahu kapan harus berhenti dan memanggil orang yang tepat.",
    description:
      "Percakapan sensitif, komplain, negosiasi, atau permintaan khusus dapat masuk ke antrean human takeover. Tim melanjutkan langsung dari konteks terakhir.",
    outcomes: [
      { title: "Tidak berebut balasan", description: "Status takeover mencegah AI menjawab di atas respons manusia." },
      { title: "Konteks tetap terlihat", description: "Tim membaca percakapan lengkap sebelum mengambil keputusan." },
      { title: "Bisa dikembalikan", description: "Percakapan dapat diserahkan kembali ke AI setelah selesai." },
    ],
    steps: [
      { title: "AI menandai kasus", description: "Aturan dan intent pelanggan memicu kebutuhan manusia." },
      { title: "Tim mengambil alih", description: "Owner atau anggota tim membalas dari inbox." },
      { title: "Aktifkan kembali", description: "AI dapat dilanjutkan setelah kasus penting selesai." },
    ],
  },
  {
    slug: "data-pelanggan",
    category: "Pelanggan",
    icon: "contact",
    navTitle: "Data Pelanggan",
    title: "Data pelanggan yang tumbuh bersama percakapan",
    eyebrow: "CRM percakapan yang praktis",
    summary: "Simpan kontak, channel, riwayat kebutuhan, status, dan penanggung jawab.",
    hero: "Kenali pelanggan dari percakapan nyata, bukan spreadsheet yang cepat basi.",
    description:
      "Setiap percakapan membentuk konteks pelanggan yang dapat dipakai untuk tindak lanjut. Tim melihat riwayat, kebutuhan, status, dan sumber channel dalam satu tempat.",
    outcomes: [
      { title: "Profil terpusat", description: "Identitas dan channel tersimpan bersama riwayat chat." },
      { title: "Catatan tim", description: "Konteks internal tidak perlu dikirim ke pelanggan." },
      { title: "Tindak lanjut jelas", description: "Owner dan status membantu menentukan langkah berikutnya." },
    ],
    steps: [
      { title: "Pelanggan menghubungi", description: "Kontak terbentuk dari channel yang terhubung." },
      { title: "Konteks dirangkum", description: "Kebutuhan dan percakapan tersedia untuk tim." },
      { title: "Lanjutkan hubungan", description: "Ubah percakapan menjadi lead dan tindak lanjut." },
    ],
  },
  {
    slug: "lead-pipeline",
    category: "Pelanggan",
    icon: "pipeline",
    navTitle: "Lead & Pipeline",
    title: "Bawa chat menuju keputusan berikutnya",
    eyebrow: "Dari percakapan menjadi peluang",
    summary: "Kelola lead, status, skor, pemilik, dan perpindahan pipeline.",
    hero: "Chat yang bagus seharusnya berakhir dengan langkah lanjut yang jelas.",
    description:
      "Aijou membantu tim memisahkan percakapan biasa dari peluang nyata. Lead dapat dinilai, diberi pemilik, dan dipindahkan sepanjang pipeline sampai selesai.",
    outcomes: [
      { title: "Lead capture", description: "Simpan kebutuhan penting tanpa menyalin chat secara manual." },
      { title: "Pipeline terlihat", description: "Status setiap peluang dapat dipantau dalam tampilan kolom." },
      { title: "Prioritas lebih tajam", description: "Skor dan konteks membantu memilih lead yang didahulukan." },
    ],
    steps: [
      { title: "Identifikasi peluang", description: "Tandai percakapan dengan kebutuhan dan potensi nyata." },
      { title: "Tetapkan pemilik", description: "Berikan lead kepada anggota tim yang melanjutkan." },
      { title: "Gerakkan pipeline", description: "Perbarui status sampai menang, kalah, atau follow-up." },
    ],
  },
  {
    slug: "segmentasi-pelanggan",
    category: "Pelanggan",
    icon: "segment",
    navTitle: "Segmentasi Pelanggan",
    title: "Kelompokkan pelanggan untuk tindakan yang lebih relevan",
    eyebrow: "Audiens yang rapi dan terukur",
    summary: "Atur segmen, membership, dan consent marketing pada setiap kontak.",
    hero: "Berhenti memperlakukan semua pelanggan dengan pesan yang sama.",
    description:
      "Kontak dapat dikelompokkan berdasarkan kebutuhan, status, atau kampanye. Consent WhatsApp tercatat agar tim tahu siapa yang aman untuk dihubungi.",
    outcomes: [
      { title: "Segmen fleksibel", description: "Buat kelompok sesuai kebutuhan operasional bisnis." },
      { title: "Consent tercatat", description: "Status opt-in dan opt-out terlihat pada setiap kontak." },
      { title: "Broadcast lebih tepat", description: "Pilih audiens yang relevan untuk setiap kampanye." },
    ],
    steps: [
      { title: "Buat segmen", description: "Tentukan kelompok pelanggan yang ingin dikelola." },
      { title: "Masukkan kontak", description: "Tambahkan pelanggan dan catat persetujuan marketing." },
      { title: "Gunakan audiens", description: "Pakai segmen pada broadcast atau tindak lanjut." },
    ],
  },
  {
    slug: "manajemen-komplain",
    category: "Pelanggan",
    icon: "complaint",
    navTitle: "Manajemen Komplain",
    title: "Komplain tidak berhenti sebagai pesan yang tenggelam",
    eyebrow: "Kasus, prioritas, dan SLA",
    summary: "Catat komplain, prioritas, penanggung jawab, status, dan riwayat penanganan.",
    hero: "Setiap keluhan memiliki pemilik, status, dan langkah penyelesaian yang jelas.",
    description:
      "Aijou mengubah keluhan pelanggan menjadi kasus yang dapat dilacak. Tim melihat prioritas, SLA, penanggung jawab, dan kronologi perubahan tanpa mencari chat lama.",
    outcomes: [
      { title: "Kasus terstruktur", description: "Komplain memiliki kategori, prioritas, dan status." },
      { title: "SLA terlihat", description: "Tenggat penanganan membantu tim mencegah kasus terlambat." },
      { title: "Riwayat lengkap", description: "Setiap perubahan tercatat untuk evaluasi tim." },
    ],
    steps: [
      { title: "Catat komplain", description: "Buat kasus dari pelanggan dan isi detail masalah." },
      { title: "Tetapkan PIC", description: "Pilih penanggung jawab serta target penyelesaian." },
      { title: "Tutup dengan jelas", description: "Perbarui kronologi sampai kasus selesai." },
    ],
  },
  {
    slug: "buat-ai-agent",
    category: "AI & Otomasi",
    icon: "wand",
    navTitle: "Buat AI Agent",
    title: "AI agent yang mengikuti cara kerja bisnis Anda",
    eyebrow: "Atur karakter dan batas otomatisasi",
    summary: "Ganti nama, bahasa, gaya bicara, instruksi, pembuka, dan aturan handoff.",
    hero: "Buat AI terasa seperti bagian dari tim, tanpa membuatnya berpura-pura menjadi manusia.",
    description:
      "Setiap workspace memiliki agent yang dapat disesuaikan. Anda menentukan identitas, gaya komunikasi, tujuan, dan keadaan ketika agent wajib menyerahkan percakapan kepada manusia.",
    outcomes: [
      { title: "Identitas fleksibel", description: "Gunakan nama dan gaya komunikasi yang sesuai merek." },
      { title: "Instruksi bisnis", description: "Jelaskan tujuan, larangan, serta standar jawaban agent." },
      { title: "Batas aman", description: "Aturan handoff mencegah AI menangani hal di luar kewenangannya." },
    ],
    steps: [
      { title: "Tentukan karakter", description: "Pilih nama, bahasa, tone, dan pesan pembuka." },
      { title: "Tulis instruksi", description: "Tambahkan tujuan layanan dan cara menangani pelanggan." },
      { title: "Tentukan handoff", description: "Atur kondisi yang membutuhkan keputusan manusia." },
    ],
  },
  {
    slug: "knowledge-base",
    category: "AI & Otomasi",
    icon: "book",
    navTitle: "Knowledge Bisnis",
    title: "Ajarkan AI memakai informasi yang benar",
    eyebrow: "Pengetahuan yang bisa Anda kendalikan",
    summary: "Kelola profil, FAQ, katalog, harga, batasan, dan panduan jawaban AI.",
    hero: "Jawaban AI hanya akan berguna jika sumber pengetahuannya jelas dan mudah dirawat.",
    description:
      "Aijou menyimpan informasi bisnis yang dijadikan acuan agent. Perubahan layanan, harga, atau aturan dapat diperbarui dari satu halaman tanpa mengubah kode.",
    outcomes: [
      { title: "Sumber terstruktur", description: "Pisahkan layanan, kebijakan, FAQ, serta informasi harga." },
      { title: "Mudah diperbarui", description: "Tim merawat pengetahuan langsung dari dashboard." },
      { title: "Mengurangi jawaban ngawur", description: "AI diarahkan mengaku tidak tahu dan melakukan handoff." },
    ],
    steps: [
      { title: "Tambahkan sumber", description: "Tulis, impor, atau sinkronkan informasi bisnis." },
      { title: "Atur batas jawaban", description: "Tentukan hal yang boleh dijawab dan harus diteruskan." },
      { title: "Uji dan rapikan", description: "Gunakan simulator untuk menemukan informasi yang kurang." },
    ],
  },
  {
    slug: "jam-kerja-ai",
    category: "AI & Otomasi",
    icon: "clock",
    navTitle: "Jam Kerja AI",
    title: "Atur kapan AI aktif dan kapan tim mengambil alih",
    eyebrow: "Jadwal layanan yang dapat diprediksi",
    summary: "Atur zona waktu, jadwal mingguan, hari libur, dan perilaku di luar jam kerja.",
    hero: "AI bekerja mengikuti jam layanan bisnis, bukan sekadar selalu menyala.",
    description:
      "Workspace memiliki jadwal operasional yang mengontrol respons otomatis. Tim dapat membuat jam berbeda per hari dan menentukan pesan ketika layanan sedang tutup.",
    outcomes: [
      { title: "Zona waktu tepat", description: "Jadwal mengikuti lokasi bisnis, termasuk Lombok." },
      { title: "Jadwal mingguan", description: "Atur jam buka dan tutup berbeda untuk setiap hari." },
      { title: "Perilaku di luar jam", description: "Pilih pesan otomatis atau tahan balasan sampai tim aktif." },
    ],
    steps: [
      { title: "Pilih zona waktu", description: "Gunakan zona waktu operasional bisnis." },
      { title: "Susun jadwal", description: "Atur hari aktif dan rentang jam layanan." },
      { title: "Tentukan fallback", description: "Tulis pesan yang muncul di luar jam kerja." },
    ],
  },
  {
    slug: "workflow-builder",
    category: "AI & Otomasi",
    icon: "automation",
    navTitle: "Workflow Builder",
    title: "Susun otomatisasi operasional tanpa mengubah kode",
    eyebrow: "Trigger dan aksi yang mudah dibaca",
    summary: "Buat workflow dari pesan, lead, order, tag, notifikasi, dan tindakan tim.",
    hero: "Ubah pekerjaan berulang menjadi alur yang konsisten dan dapat dipantau.",
    description:
      "Workflow builder menghubungkan trigger dengan rangkaian aksi. Setiap workflow dapat dijeda, diaktifkan, dan dipantau riwayat jalannya dari dashboard.",
    outcomes: [
      { title: "No-code builder", description: "Susun trigger dan aksi dari pilihan yang sudah tersedia." },
      { title: "Bisa dijeda", description: "Kontrol workflow tanpa menghapus konfigurasinya." },
      { title: "Riwayat eksekusi", description: "Lihat jumlah proses, waktu terakhir, dan error." },
    ],
    steps: [
      { title: "Pilih trigger", description: "Tentukan kejadian yang memulai workflow." },
      { title: "Susun aksi", description: "Tambahkan tag, notifikasi, assignment, atau aksi lain." },
      { title: "Aktifkan dan pantau", description: "Jalankan workflow lalu periksa hasilnya." },
    ],
  },
  {
    slug: "broadcast-whatsapp",
    category: "Operasional",
    icon: "broadcast",
    navTitle: "Broadcast WhatsApp",
    title: "Broadcast WhatsApp yang aman dan patuh Meta",
    eyebrow: "Template approved dan audiens opt-in",
    summary: "Kirim kampanye hanya ke kontak berizin dengan template WhatsApp yang disetujui.",
    hero: "Jangkau pelanggan tanpa mengorbankan consent dan kesehatan nomor bisnis.",
    description:
      "Aijou mengharuskan template resmi dan audiens yang memiliki consent. Kampanye dapat disiapkan, dijadwalkan, serta dipantau hasil pengirimannya.",
    outcomes: [
      { title: "Patuh consent", description: "Penerima wajib memiliki opt-in marketing aktif." },
      { title: "Template resmi", description: "Gunakan template yang sudah disetujui Meta." },
      { title: "Hasil tercatat", description: "Status penerima dan kegagalan terlihat per kampanye." },
    ],
    steps: [
      { title: "Pilih audiens", description: "Gunakan segmen pelanggan yang relevan dan berizin." },
      { title: "Pilih template", description: "Masukkan template WhatsApp yang telah approved." },
      { title: "Kirim atau jadwalkan", description: "Pantau hasil setiap penerima dari dashboard." },
    ],
  },
  {
    slug: "produk-katalog",
    category: "Operasional",
    icon: "product",
    navTitle: "Produk & Katalog",
    title: "Produk, layanan, dan harga menjadi sumber jawaban AI",
    eyebrow: "Katalog yang terhubung ke percakapan",
    summary: "Kelola nama, deskripsi, harga, dan status produk dari workspace.",
    hero: "Saat pelanggan bertanya harga, AI memakai katalog yang benar.",
    description:
      "Katalog menyimpan produk atau layanan yang dapat dipakai oleh AI dan tim. Harga awal, detail, serta status aktif diperbarui dari satu tempat.",
    outcomes: [
      { title: "Harga konsisten", description: "AI dan tim mengacu pada nilai yang sama." },
      { title: "Mudah dirawat", description: "Ubah detail produk tanpa menulis ulang instruksi agent." },
      { title: "Siap menjadi order", description: "Produk aktif dapat dipilih ketika membuat pesanan." },
    ],
    steps: [
      { title: "Tambah produk", description: "Isi nama, deskripsi, harga, dan status." },
      { title: "Uji pertanyaan", description: "Pastikan agent dapat menjawab detail produk." },
      { title: "Gunakan pada order", description: "Pilih produk saat menyusun pesanan pelanggan." },
    ],
  },
  {
    slug: "manajemen-order",
    category: "Operasional",
    icon: "order",
    navTitle: "Manajemen Order",
    title: "Ubah kebutuhan pelanggan menjadi order yang terstruktur",
    eyebrow: "Dari percakapan ke pemenuhan",
    summary: "Buat order, item, diskon, ongkir, alamat, status pembayaran, dan pengiriman.",
    hero: "Jangan biarkan persetujuan pelanggan berhenti sebagai chat.",
    description:
      "Tim dapat menyusun order dari katalog atau item custom, menambahkan alamat serta ongkir, lalu memantau status pesanan sampai selesai.",
    outcomes: [
      { title: "Detail lengkap", description: "Item, jumlah, diskon, alamat, dan catatan tersimpan bersama." },
      { title: "Status terpantau", description: "Order, pembayaran manual, dan pengiriman memiliki status terpisah." },
      { title: "Terhubung ke pelanggan", description: "Riwayat order tetap terkait dengan kontak." },
    ],
    steps: [
      { title: "Susun order", description: "Pilih produk atau masukkan item custom." },
      { title: "Tambahkan fulfillment", description: "Isi alamat, layanan ongkir, dan catatan." },
      { title: "Perbarui status", description: "Pantau order sampai dikirim dan selesai." },
    ],
  },
  {
    slug: "cek-ongkir",
    category: "Operasional",
    icon: "shipping",
    navTitle: "Cek Ongkir",
    title: "Perhitungan ongkir yang konsisten saat membuat order",
    eyebrow: "Zona dan rate card milik bisnis",
    summary: "Atur zona, layanan, berat, tarif dasar, biaya per kilogram, dan estimasi.",
    hero: "Hitung ongkir dari aturan yang Anda tentukan, langsung di dalam order.",
    description:
      "Aijou menyediakan rate card internal untuk zona pengiriman. Tim dapat menghitung biaya berdasarkan berat dan memilih layanan saat membuat order.",
    outcomes: [
      { title: "Tarif fleksibel", description: "Atur biaya dasar dan tambahan per kilogram." },
      { title: "Zona terkontrol", description: "Buat layanan berbeda untuk area pengiriman bisnis." },
      { title: "Masuk ke order", description: "Hasil pilihan ongkir tersimpan bersama pesanan." },
    ],
    steps: [
      { title: "Buat zona", description: "Masukkan wilayah, layanan, dan rentang berat." },
      { title: "Atur tarif", description: "Tentukan biaya dasar, biaya per kilogram, dan estimasi." },
      { title: "Pakai di order", description: "Pilih layanan yang sesuai ketika menyusun pesanan." },
    ],
  },
];

export function getMarketingFeature(slug: string) {
  return marketingFeatures.find((feature) => feature.slug === slug);
}

export function getMarketingFeatureGroups() {
  return marketingFeatureCategories.map((category) => ({
    category,
    features: marketingFeatures
      .filter((feature) => feature.category === category)
      .map(({ slug, icon, navTitle }) => ({ slug, icon, navTitle })),
  }));
}
