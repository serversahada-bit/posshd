const mysql = require('mysql2/promise');

async function checkDb() {
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'pos',
      port: 3306,
    });

    const [products] = await connection.query('SELECT COUNT(*) as c FROM products');
    const [gifts] = await connection.query('SELECT COUNT(*) as c FROM gifts');
    console.log('Products count:', products[0].c);
    console.log('Gifts count:', gifts[0].c);
    
    if (products[0].c > 0) {
      const [sample] = await connection.query('SELECT id, product_name, status FROM products LIMIT 3');
      console.log('Sample products:', sample);
    }
    await connection.end();
  } catch(e) {
    console.error(e);
  }
}

checkDb();
