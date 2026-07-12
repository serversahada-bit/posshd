<?php
require_once 'config/database.php';

$successMessage = '';
$errorMessage = '';

$editMode = false;
$editId = '';
$adSourceNameVal = '';
$statusVal = 'active';

// Handle CRUD operations
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_POST['action'])) {
        if ($_POST['action'] === 'create') {
            try {
                $name = trim($_POST['name']);
                $status = $_POST['status'] ?? 'active';

                if (empty($name)) {
                    throw new Exception("Sumber Iklan wajib diisi.");
                }

                $stmt = $pdo->prepare("INSERT INTO ad_sources (name, status) VALUES (?, ?)");
                $stmt->execute([$name, $status]);
                $successMessage = "Sumber iklan baru berhasil ditambahkan.";
            } catch (Exception $e) {
                $errorMessage = "Gagal menambah sumber iklan: " . $e->getMessage();
            }
        } elseif ($_POST['action'] === 'update') {
            try {
                $id = $_POST['id'];
                $name = trim($_POST['name']);
                $status = $_POST['status'] ?? 'active';

                if (empty($name)) {
                    throw new Exception("Sumber Iklan wajib diisi.");
                }

                $stmt = $pdo->prepare("UPDATE ad_sources SET name = ?, status = ? WHERE id = ?");
                $stmt->execute([$name, $status, $id]);
                $successMessage = "Informasi sumber iklan berhasil diperbarui.";
            } catch (Exception $e) {
                $errorMessage = "Gagal memperbarui sumber iklan: " . $e->getMessage();
            }
        } elseif ($_POST['action'] === 'delete') {
            try {
                $id = $_POST['id'];
                $stmt = $pdo->prepare("DELETE FROM ad_sources WHERE id = ?");
                $stmt->execute([$id]);
                $successMessage = "Sumber iklan berhasil dihapus.";
            } catch (Exception $e) {
                $errorMessage = "Gagal menghapus sumber iklan: " . $e->getMessage();
            }
        }
    }
}

// Check if edit mode
if (isset($_GET['edit'])) {
    $editId = $_GET['edit'];
    $stmt = $pdo->prepare("SELECT * FROM ad_sources WHERE id = ?");
    $stmt->execute([$editId]);
    if ($editItem = $stmt->fetch()) {
        $editMode = true;
        $adSourceNameVal = $editItem['name'];
        $statusVal = $editItem['status'];
    }
}

$adSources = $pdo->query("SELECT * FROM ad_sources ORDER BY id DESC")->fetchAll();

require_once 'includes/header.php';
?>

<div class="h-full flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
        <div>
            <h1 class="text-2xl font-bold text-slate-800">Sumber Iklan</h1>
            <p class="text-sm text-slate-400 mt-1">Kelola daftar sumber iklan Anda.</p>
        </div>
        <button onclick="openModal()" class="btn-primary inline-flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
            Tambah Sumber Iklan
        </button>
    </div>

    <?php if($successMessage): ?>
        <div class="mb-5 p-4 bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-xl text-sm font-medium"><?= $successMessage ?></div>
    <?php endif; ?>
    <?php if($errorMessage): ?>
        <div class="mb-5 p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-medium"><?= $errorMessage ?></div>
    <?php endif; ?>

    <!-- Table -->
    <div class="flex-1 card overflow-hidden">
        <div class="overflow-x-auto">
            <table class="w-full text-left clean-table">
                <thead>
                    <tr>
                        <th class="w-12 text-center">#</th>
                        <th>Sumber Iklan</th>
                        <th>Status</th>
                        <th class="text-right">Aksi</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($adSources)): ?>
                        <tr>
                            <td colspan="4" class="text-center text-slate-400 py-12">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 mx-auto mb-2 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" /></svg>
                                Belum ada data sumber iklan.
                            </td>
                        </tr>
                    <?php else: ?>
                        <?php $no = 1; foreach($adSources as $row): ?>
                        <tr>
                            <td class="text-center text-slate-400 font-medium"><?= $no++ ?></td>
                            <td>
                                <p class="font-semibold text-slate-700"><?= htmlspecialchars($row['name']) ?></p>
                            </td>
                            <td>
                                <?php if ($row['status'] === 'active'): ?>
                                    <span class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200">Aktif</span>
                                <?php else: ?>
                                    <span class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-50 text-slate-500 border border-slate-200">Nonaktif</span>
                                <?php endif; ?>
                            </td>
                            <td class="text-right">
                                <div class="flex items-center justify-end gap-1.5">
                                    <button onclick="openEditModal(<?= htmlspecialchars(json_encode($row)) ?>)" class="p-2 rounded-lg text-slate-400 hover:text-brand-500 hover:bg-brand-50 transition-colors" title="Edit">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                    </button>
                                    <form method="POST" onsubmit="return confirm('Hapus sumber iklan ini?');" class="inline">
                                        <input type="hidden" name="action" value="delete">
                                        <input type="hidden" name="id" value="<?= $row['id'] ?>">
                                        <button type="submit" class="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Hapus">
                                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    </form>
                                </div>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>

<!-- Modal Overlay -->
<div id="modalOverlay" class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 hidden items-center justify-center p-4" style="display:none;">
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onclick="event.stopPropagation()">
        <!-- Modal Header -->
        <div class="flex items-center justify-between p-5 border-b border-slate-100">
            <h2 id="modalTitle" class="text-lg font-bold text-slate-800">Tambah Sumber Iklan Baru</h2>
            <button onclick="closeModal()" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>
        <!-- Modal Body -->
        <form method="POST" class="p-5">
            <input type="hidden" name="action" id="formAction" value="create">
            <input type="hidden" name="id" id="formId" value="">

            <div class="space-y-4">
                <div>
                    <label class="block text-xs font-semibold text-slate-500 mb-1.5">Sumber Iklan <span class="text-red-400">*</span></label>
                    <input type="text" name="name" id="fName" required placeholder="Contoh: Facebook Ads" class="form-input">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-slate-500 mb-1.5">Status</label>
                    <select name="status" id="fStatus" class="form-input">
                        <option value="active">Aktif</option>
                        <option value="inactive">Nonaktif</option>
                    </select>
                </div>
            </div>

            <!-- Modal Footer -->
            <div class="flex gap-3 mt-6 pt-5 border-t border-slate-100">
                <button type="button" onclick="closeModal()" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold py-2.5 rounded-lg text-sm transition-colors">Batal</button>
                <button type="submit" id="formSubmitBtn" class="flex-1 btn-primary">Tambah Sumber Iklan</button>
            </div>
        </form>
    </div>
</div>

<script>
function openModal() {
    document.getElementById('modalTitle').textContent = 'Tambah Sumber Iklan Baru';
    document.getElementById('formAction').value = 'create';
    document.getElementById('formId').value = '';
    document.getElementById('fName').value = '';
    document.getElementById('fStatus').value = 'active';
    document.getElementById('formSubmitBtn').textContent = 'Tambah Sumber Iklan';

    const overlay = document.getElementById('modalOverlay');
    overlay.style.display = 'flex';
    setTimeout(() => overlay.classList.remove('hidden'), 10);
}

function openEditModal(data) {
    document.getElementById('modalTitle').textContent = 'Edit Sumber Iklan';
    document.getElementById('formAction').value = 'update';
    document.getElementById('formId').value = data.id;
    document.getElementById('fName').value = data.name;
    document.getElementById('fStatus').value = data.status;
    document.getElementById('formSubmitBtn').textContent = 'Simpan Perubahan';

    const overlay = document.getElementById('modalOverlay');
    overlay.style.display = 'flex';
    setTimeout(() => overlay.classList.remove('hidden'), 10);
}

function closeModal() {
    const overlay = document.getElementById('modalOverlay');
    overlay.classList.add('hidden');
    setTimeout(() => overlay.style.display = 'none', 200);
}

// Close on overlay click
document.getElementById('modalOverlay').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
});

// Close on Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeModal();
});

<?php if($editMode): ?>
    // Auto-open edit modal on page load
    openEditModal(<?= json_encode($editItem) ?>);
<?php endif; ?>
</script>

<?php require_once 'includes/footer.php'; ?>
