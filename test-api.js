fetch('http://localhost:3000/api/data/initial')
  .then(r => r.json())
  .then(d => console.log(JSON.stringify(d).substring(0, 500)))
  .catch(console.error);
