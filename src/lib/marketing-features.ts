export type MarketingFeature = {
  slug: string;
  category: "Chat" | "CRM" | "Commerce" | "Control";
  icon:
    | "bot"
    | "whatsapp"
    | "layers"
    | "book"
    | "wand"
    | "hand"
    | "contact"
    | "pipeline"
    | "payment";
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
    category: "Chat",
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
    category: "Chat",
    icon: "whatsapp",
    navTitle: "AI untuk WhatsApp",
    title: "AI customer service langsung di WhatsApp",
    eyebrow: "Terhubung ke WhatsApp Cloud API",
    summary: "Balas pelanggan otomatis dan lanjutkan sebagai manusia dari inbox yang sama.",
    hero: "Pelanggan tetap memakai WhatsApp. Tim Anda mendapat cara kerja yang jauh lebih rapi.",
    description:
      "Pesan WhatsApp masuk ke Aijou melalui integrasi resmi Meta. AI menangani pertanyaan rutin, sementara percakapan penting dapat langsung diambil alih oleh tim.",
    outcomes: [
      { title: "Integrasi resmi Meta", description: "Menggunakan WhatsApp Business Platform dan webhook terverifikasi." },
      { title: "Status pesan terlihat", description: "Pesan masuk, terkirim, dan terbaca tercatat di percakapan." },
      { title: "Human takeover", description: "Tim dapat membalas dari dashboard tanpa memutus konteks." },
    ],
    steps: [
      { title: "Hubungkan WABA", description: "Masukkan WABA ID, Phone Number ID, dan System User token." },
      { title: "Verifikasi webhook", description: "Aijou memeriksa nomor, izin token, dan koneksi Meta." },
      { title: "Aktifkan AI", description: "Mulai dari simulator, lalu nyalakan balasan otomatis ketika siap." },
    ],
  },
  {
    slug: "omnichannel-inbox",
    category: "Chat",
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
      { title: "Pasang kanal", description: "Aktifkan widget web, Telegram, atau WhatsApp dari Integrasi." },
      { title: "Pesan masuk", description: "Percakapan baru otomatis muncul di inbox." },
      { title: "Kerjakan bersama", description: "AI menangani rutinitas dan tim masuk saat diperlukan." },
    ],
  },
  {
    slug: "knowledge-base",
    category: "Control",
    icon: "book",
    navTitle: "Knowledge Bisnis",
    title: "Ajarkan AI memakai informasi yang benar",
    eyebrow: "Pengetahuan yang bisa Anda kendalikan",
    summary: "Kelola profil, FAQ, katalog, harga, batasan, dan panduan jawaban AI.",
    hero: "Jawaban AI hanya akan berguna jika sumber pengetahuannya jelas dan mudah dirawat.",
    description:
      "Aijou menyediakan tempat khusus untuk menyimpan informasi bisnis yang perlu dijadikan acuan. Perubahan pada layanan, harga, atau aturan dapat diperbarui tanpa mengubah kode.",
    outcomes: [
      { title: "Sumber terstruktur", description: "Pisahkan layanan, kebijakan, FAQ, serta informasi harga." },
      { title: "Mudah diperbarui", description: "Tim dapat merawat pengetahuan langsung dari dashboard." },
      { title: "Mengurangi jawaban ngawur", description: "AI diarahkan untuk mengaku tidak tahu dan melakukan handoff." },
    ],
    steps: [
      { title: "Tambahkan sumber", description: "Tulis informasi bisnis yang paling sering ditanyakan." },
      { title: "Atur batas jawaban", description: "Tentukan hal yang boleh dijawab dan harus diteruskan." },
      { title: "Uji dan rapikan", description: "Gunakan simulator untuk menemukan informasi yang masih kurang." },
    ],
  },
  {
    slug: "buat-ai-agent",
    category: "Control",
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
      { title: "Batas aman", description: "Aturan handoff mencegah AI menangani kasus yang bukan kewenangannya." },
    ],
    steps: [
      { title: "Tentukan karakter", description: "Pilih nama, bahasa, tone, dan pesan pembuka." },
      { title: "Tulis instruksi", description: "Tambahkan tujuan layanan dan cara menangani pelanggan." },
      { title: "Tentukan handoff", description: "Atur kondisi yang membutuhkan keputusan manusia." },
    ],
  },
  {
    slug: "human-takeover",
    category: "Control",
    icon: "hand",
    navTitle: "Human Takeover",
    title: "Manusia dapat mengambil alih kapan saja",
    eyebrow: "AI membantu, tim tetap memutuskan",
    summary: "Jeda balasan AI, balas sebagai tim, lalu kembalikan percakapan saat sudah aman.",
    hero: "Otomatisasi terbaik tahu kapan harus berhenti dan memanggil orang yang tepat.",
    description:
      "Percakapan sensitif, komplain, negosiasi, atau permintaan khusus dapat masuk ke antrean human takeover. Tim melanjutkan langsung dari konteks terakhir.",
    outcomes: [
      { title: "Tidak berebut balasan", description: "Status takeover mencegah AI menjawab di atas respons manusia." },
      { title: "Konteks tetap terlihat", description: "Tim membaca percakapan lengkap sebelum mengambil keputusan." },
      { title: "Bisa dikembalikan", description: "Setelah selesai, percakapan dapat diserahkan kembali ke AI." },
    ],
    steps: [
      { title: "AI menandai kasus", description: "Aturan dan intent pelanggan memicu kebutuhan manusia." },
      { title: "Tim mengambil alih", description: "Owner atau anggota tim membalas dari inbox." },
      { title: "Aktifkan kembali", description: "AI dapat dilanjutkan setelah kasus penting selesai." },
    ],
  },
  {
    slug: "data-pelanggan",
    category: "CRM",
    icon: "contact",
    navTitle: "Data Pelanggan",
    title: "Data pelanggan yang tumbuh bersama percakapan",
    eyebrow: "CRM percakapan yang praktis",
    summary: "Simpan kontak, channel, riwayat kebutuhan, status, catatan, dan penanggung jawab.",
    hero: "Kenali pelanggan dari percakapan nyata, bukan dari spreadsheet yang cepat basi.",
    description:
      "Setiap percakapan membentuk konteks pelanggan yang dapat dipakai untuk tindak lanjut. Tim melihat riwayat, kebutuhan, status, dan sumber channel dalam satu tempat.",
    outcomes: [
      { title: "Profil terpusat", description: "Identitas dan sumber channel tersimpan bersama riwayat chat." },
      { title: "Catatan tim", description: "Konteks internal tidak perlu dikirim ke pelanggan." },
      { title: "Tindak lanjut jelas", description: "Owner dan status membantu tim mengetahui langkah berikutnya." },
    ],
    steps: [
      { title: "Pelanggan menghubungi", description: "Kontak terbentuk dari kanal yang sudah terhubung." },
      { title: "Konteks dirangkum", description: "Kebutuhan dan percakapan tetap tersedia untuk tim." },
      { title: "Lanjutkan hubungan", description: "Ubah percakapan menjadi lead dan tindak lanjut." },
    ],
  },
  {
    slug: "lead-pipeline",
    category: "CRM",
    icon: "pipeline",
    navTitle: "Lead & Pipeline",
    title: "Bawa chat menuju keputusan berikutnya",
    eyebrow: "Dari percakapan menjadi peluang",
    summary: "Kelola lead, status, skor, pemilik, dan perpindahan pipeline dari satu workspace.",
    hero: "Chat yang bagus seharusnya berakhir dengan langkah lanjut yang jelas.",
    description:
      "Aijou membantu tim memisahkan percakapan biasa dari peluang nyata. Lead dapat dinilai, diberi pemilik, dan dipindahkan sepanjang pipeline sampai selesai.",
    outcomes: [
      { title: "Lead capture", description: "Kebutuhan penting dapat disimpan tanpa menyalin chat secara manual." },
      { title: "Pipeline terlihat", description: "Status setiap peluang dapat dipantau dalam tampilan kolom." },
      { title: "Prioritas lebih tajam", description: "Skor dan konteks membantu tim memilih lead yang perlu didahulukan." },
    ],
    steps: [
      { title: "Identifikasi peluang", description: "Tandai percakapan yang memiliki kebutuhan dan potensi nyata." },
      { title: "Tetapkan pemilik", description: "Berikan lead kepada anggota tim yang akan melanjutkan." },
      { title: "Gerakkan pipeline", description: "Perbarui status sampai menang, kalah, atau perlu tindak lanjut." },
    ],
  },
  {
    slug: "order-pembayaran",
    category: "Commerce",
    icon: "payment",
    navTitle: "Order & Pembayaran",
    title: "Lanjutkan percakapan menjadi transaksi",
    eyebrow: "Workflow penjualan dalam satu tempat",
    summary: "Susun order, buat payment link, dan pantau perubahan status pembayaran.",
    hero: "Jangan biarkan pelanggan berhenti setelah berkata setuju.",
    description:
      "Tim dapat menyusun transaksi dari kebutuhan pelanggan dan membuat payment session. Integrasi Xendit mendukung metode pembayaran seperti QRIS, virtual account, dan e-wallet setelah kredensial diaktifkan.",
    outcomes: [
      { title: "Order terhubung", description: "Detail transaksi tetap berkaitan dengan pelanggan dan percakapan." },
      { title: "Payment link", description: "Buat tautan pembayaran tanpa berpindah ke alat lain." },
      { title: "Status otomatis", description: "Webhook memperbarui status setelah pembayaran diterima." },
    ],
    steps: [
      { title: "Susun transaksi", description: "Pilih pelanggan dan masukkan detail nilai order." },
      { title: "Buat pembayaran", description: "Kirim payment link dari payment session Xendit." },
      { title: "Pantau status", description: "Lihat pembayaran berhasil, kedaluwarsa, atau masih menunggu." },
    ],
  },
];

export const marketingFeatureCategories = ["Chat", "CRM", "Commerce", "Control"] as const;

export function getMarketingFeature(slug: string) {
  return marketingFeatures.find((feature) => feature.slug === slug);
}
