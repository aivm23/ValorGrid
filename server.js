const { server, host, port } = require('./src/app-core');

if (require.main === module) {
  server.listen(port, host, () => {
    console.log(`Dashboard disponible en http://${host}:${port}`);
  });
}

module.exports = require('./src/app-core');
