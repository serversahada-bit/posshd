const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('\n=== Import Database dari POIN/database.sql ===\n');

  // Koneksi ke server tanpa milih db dulu
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    multipleStatements: true,
    charset: 'utf8mb4',
  });

  try {
    const sqlFile = path.join(__dirname, 'POIN', 'database.sql');
    let sql = fs.readFileSync(sqlFile, 'utf8');

    console.log('⏳ Menjalankan script database.sql...');
    // multipleStatements: true memungkinkan kita kirim query sekaligus
    await conn.query('SET FOREIGN_KEY_CHECKS = 0;');
    await conn.query(sql);
    await conn.query('SET FOREIGN_KEY_CHECKS = 1;');
    console.log('✅ Skema berhasil diimport!');

    // Pindah koneksi ke DB yang baru dibuat
    await conn.query('USE `db_sahada_order`');

    // Cek users
    const [userCount] = await conn.query('SELECT COUNT(*) as c FROM `users`');
    const count = userCount[0].c;
    console.log(`\n👥 Jumlah user: ${count}`);

    if (count === 0) {
      await conn.query(
        "INSERT INTO `users` (name, email, password, role) VALUES ('Administrator', 'admin', 'admin123', 'admin')"
      );
      console.log('✅ User admin dibuat: email=admin, password=admin123');
    }

    const [users] = await conn.query('SELECT id, name, email, role FROM `users`');
    console.log('\n📋 Daftar User yang bisa login:');
    users.forEach(u => console.log(`   - [${u.role}] ${u.name} | email: "${u.email}" | password: "${u.password || '(tersembunyi)'}"`));

  } catch (err) {
    console.error('\n❌ Error:', err.message);
  } finally {
    await conn.end();
    console.log('\n=== Selesai ===\n');
  }
}

main();
