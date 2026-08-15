const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    port: 3306,
  });

  console.log('Dropping database pos if exists...');
  await connection.query('DROP DATABASE IF EXISTS pos');
  console.log('Creating database pos...');
  await connection.query('CREATE DATABASE pos');
  console.log('Database pos created successfully.');
  
  await connection.end();
}

main().catch(console.error);
