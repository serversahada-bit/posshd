const fs = require('fs');
const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    port: 3306,
    database: 'pos',
    multipleStatements: true // This is required to run multiple queries in one string
  });

  console.log('Reading pos.sql...');
  const sql = fs.readFileSync('pos.sql', 'utf8');

  console.log('Importing SQL into database pos...');
  // Depending on the file size, executing a massive SQL string at once might use a lot of memory,
  // but for a typical SQL dump, this works fine with multipleStatements: true
  await connection.query(sql);

  console.log('Import completed successfully.');
  await connection.end();
}

main().catch(err => {
  console.error("Error during import:", err);
  process.exit(1);
});
