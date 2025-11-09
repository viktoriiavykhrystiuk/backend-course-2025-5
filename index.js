#!/usr/bin/env node
import { Command } from "commander";
import http from "http";
import { promises as fs } from "fs";
import path from "path";
import superagent from "superagent";

// -------------------------
// 1. Налаштування Commander
// -------------------------
const program = new Command();

program
  .requiredOption("-h, --host <host>", "Host address")
  .requiredOption("-p, --port <port>", "Port number")
  .requiredOption("-c, --cache <path>", "Cache directory path");

program.parse(process.argv);

const { host, port, cache } = program.opts();

// -------------------------
// 2. Перевірка кеш-директорії
// -------------------------
async function ensureCacheDir() {
  try {
    await fs.access(cache);
  } catch {
    await fs.mkdir(cache, { recursive: true });
    console.log(`✅ Створено теку для кешу: ${cache}`);
  }
}

// -------------------------
// 3. Обробка HTTP-запитів
// -------------------------
const server = http.createServer(async (req, res) => {
  const urlParts = req.url.split("/");
  const code = urlParts[1];

  // якщо не передано код (наприклад, просто /)
  if (!code) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad request: відсутній HTTP код у URL (наприклад, /200)");
    return;
  }

  const filePath = path.join(cache, `${code}.jpg`);

  try {
    switch (req.method) {
      // -------------------------
      // GET — отримання з кешу або з http.cat
      // -------------------------
      case "GET":
        try {
          const data = await fs.readFile(filePath);
          res.writeHead(200, { "Content-Type": "image/jpeg" });
          res.end(data);
        } catch {
          console.log(`📥 Завантаження з http.cat: ${code}`);
          try {
            const response = await superagent.get(`https://http.cat/${code}`);
            const image = response.body;
            await fs.writeFile(filePath, image);
            res.writeHead(200, { "Content-Type": "image/jpeg" });
            res.end(image);
          } catch {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Not Found");
          }
        }
        break;

      // -------------------------
      // PUT — зберегти/оновити картинку в кеші
      // -------------------------
      case "PUT":
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        await fs.writeFile(filePath, buffer);
        res.writeHead(201, { "Content-Type": "text/plain" });
        res.end("Created");
        break;

      // -------------------------
      // DELETE — видалити з кешу
      // -------------------------
      case "DELETE":
        try {
          await fs.unlink(filePath);
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("Deleted");
        } catch {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not Found");
        }
        break;

      // -------------------------
      // Інші методи
      // -------------------------
      default:
        res.writeHead(405, { "Content-Type": "text/plain" });
        res.end("Method Not Allowed");
    }
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  }
});

// -------------------------
// 4. Запуск сервера
// -------------------------
await ensureCacheDir();

server.listen(port, host, () => {
  console.log(`✅ Проксі-сервер запущено на http://${host}:${port}`);
  console.log(`📂 Кеш-директорія: ${cache}`);
});
