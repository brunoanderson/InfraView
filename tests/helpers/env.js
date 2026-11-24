// Variáveis de ambiente de todos os testes. Precisa ser o PRIMEIRO import do
// arquivo de teste, porque o src/config/env.js lê o ambiente ao ser carregado.
// Banco em memória, monitor desligado e segredo próprio (nada vem do .env).
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = ':memory:';
process.env.JWT_SECRET = 'segredo-somente-para-testes-automatizados-123';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.MONITOR_ENABLED = 'false';
process.env.MONITOR_FAILURE_THRESHOLD = '3';
