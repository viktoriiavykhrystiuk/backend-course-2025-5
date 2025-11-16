#!/usr/bin/env node

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Command } = require('commander');
const superagent = require('superagent');

// === 1. Обробка аргументів командного рядка ===
const program = new Command();

program
  .requiredOption('--host <host>', 'server host (required)')
  .requiredOption('--port <port>', 'server port (required)', parseInt)
  .requiredOption('--cache <dir>', 'path to cache directory (required)');

program.parse(process.argv);

const options = program.opts();
const HOST = options.host;
const PORT = options.port;
const CACHE_DIR = path.resolve(options.cache);

// === 2. Перевірка та створення кеш-папки ===
async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (err) {
    console.error('❌ Failed to create cache directory:', err);
    process.exit(1);
  }
}

// === 3. Обробка HTTP-запитів ===
async function handleRequest(req, res) {
  const url = req.url;
  const method = req.method;

  // Наприклад: /200 → код 200
  const match = url.match(/^\/(\d{3})$/);
  if (!match) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Invalid URL. Use /<status_code>');
  }

  const statusCode = match[1];
  const filePath = path.join(CACHE_DIR, `${statusCode}.jpg`);

  if (method === 'GET') {
  // === GET: Повернути файл з кешу або завантажити ===
  try {
    const file = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': 'image/jpeg' });
    return res.end(file);
  } catch {
    try {
      console.log(`🟡 [MISS] Downloading image ${statusCode}...`);
      const response = await superagent.get(`https://http.cat/${statusCode}`);

      await fs.writeFile(filePath, response.body);

      res.writeHead(200, { 'Content-Type': 'image/jpeg' });
      return res.end(response.body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not Found');
    }
  }

} else if (method === 'PUT') {
  // === PUT: Перезаписати файл у кеші ===
  let body = [];
  for await (const chunk of req) body.push(chunk);
  const buffer = Buffer.concat(body);
  await fs.writeFile(filePath, buffer);
  res.writeHead(201, { 'Content-Type': 'text/plain' });
  return res.end(`✅ Cached image for code ${statusCode}`);

} else if (method === 'DELETE') {
  // === DELETE: Видалити файл із кешу ===
  try {
    await fs.unlink(filePath);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end(`🗑️ Deleted cached image ${statusCode}`);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not Found');
  }
 }
}
 

// === 4. Запуск сервера ===
async function startServer() {
  await ensureCacheDir();

  const server = http.createServer(handleRequest);
  server.listen(PORT, HOST, () => {
    console.log(`✅ Server running at http://${HOST}:${PORT}`);
    console.log(`📂 Cache directory: ${CACHE_DIR}`);
    console.log('🚀 Ready for GET, PUT, DELETE requests!');
  });
}

startServer();

