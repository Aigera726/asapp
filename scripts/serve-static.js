#!/usr/bin/env node
/**
 * Статический сервер для веб-экспорта (npx expo export --platform web).
 *
 * Без зависимостей намеренно: демо надо поднимать на машине, где npx может
 * не иметь выхода в интернет, а тянуть ради этого пакет нечем оправдать.
 *
 * Слушает 0.0.0.0, чтобы демо открывалось с других компьютеров, а не только
 * локально. Отдаёт файлы из dist/, неизвестные пути уводит на index.html —
 * приложение одностраничное, и без этого прямая ссылка на маршрут давала 404.
 *
 *   node scripts/serve-static.js [порт] [каталог] [--api=http://127.0.0.1:9100]
 *
 * --api включает проксирование /api/* на указанный адрес. Нужно там, где
 * бэкенд снаружи недоступен: браузер стучится в уже открытый порт раздачи,
 * а тот пересылает запрос на локальный бэкенд. Заодно снимает вопрос CORS —
 * для страницы это тот же origin.
 *
 * Каталог по умолчанию берётся относительно корня проекта, а не текущей
 * директории: команду запускают из разных мест (в том числе из домашнего
 * каталога пользователя), и раздача не должна от этого зависеть.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL: NodeURL } = require('url');

const args = process.argv.slice(2);
const apiFlag = args.find((a) => a.startsWith('--api='));
const API_TARGET = apiFlag ? apiFlag.slice('--api='.length).replace(/\/+$/, '') : null;
const positional = args.filter((a) => !a.startsWith('--'));
const PORT = Number(positional[0] || 8090);
const PROJECT_ROOT = path.resolve(__dirname, '..');
// Явно переданный каталог — относительно текущей директории, как и ожидается
// от аргумента командной строки. Без аргумента — dist в корне проекта.
const ROOT = positional[1]
  ? path.resolve(positional[1])
  : path.join(PROJECT_ROOT, 'dist');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

function send(res, code, body, type) {
  res.writeHead(code, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    // Демо пересобирается часто — иначе аналитики видели бы старую версию.
    'Cache-Control': 'no-cache',
  });
  res.end(body);
}

/** Пересылает запрос на бэкенд и отдаёт ответ как есть. */
function proxy(req, res) {
  const target = new NodeURL(API_TARGET);
  const upstream = http.request(
    {
      hostname: target.hostname,
      port: target.port || 80,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: target.host },
    },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    }
  );
  upstream.on('error', (e) => {
    console.error('[proxy] ' + req.method + ' ' + req.url + ' -> ' + e.message);
    send(res, 502, 'Бэкенд недоступен: ' + e.message);
  });
  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  if (API_TARGET && req.url.startsWith('/api/')) return proxy(req, res);

  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return send(res, 400, 'Bad request');
  }

  // Выход за пределы каталога недопустим: сервер слушает наружу.
  const target = path.resolve(ROOT, '.' + rel);
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
    return send(res, 403, 'Forbidden');
  }

  let file = target;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    file = path.join(file, 'index.html');
  }
  if (!fs.existsSync(file)) {
    // SPA-fallback: маршруты приложения не соответствуют файлам.
    file = path.join(ROOT, 'index.html');
    if (!fs.existsSync(file)) return send(res, 404, 'Not found');
  }

  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  if (!fs.existsSync(ROOT)) {
    console.error(`ВНИМАНИЕ: каталог ${ROOT} не найден — сначала соберите экспорт`);
  }
  console.log(`Статика из ${ROOT}`);
  if (API_TARGET) console.log(`/api/* -> ${API_TARGET}`);
  console.log(`Слушаю 0.0.0.0:${PORT} — доступно и с других компьютеров`);
});
