// const grpc = require('@grpc/grpc-js');
// const protoLoader = require('@grpc/proto-loader');
// const crypto = require('crypto');
// const path = require('path');
// const fs = require('fs');

// const PROTO_PATH = './chat.proto';
// const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
//   keepCase: true,
//   longs: String,
//   enums: String,
//   defaults: true,
//   oneofs: true
// });
// const chatProto = grpc.loadPackageDefinition(packageDefinition).chat;

// // ─── Хранилища ────────────────────────────────────────────────────────────

// // Комнаты → Set активных стримов
// const rooms = new Map();

// // Файлы: fileId → { info: FileInfo, buffer: Buffer }
// // В продакшене → S3 / MinIO / GridFS
// const fileStore = new Map();

// // Максимальный размер файла: 50 МБ
// const MAX_FILE_SIZE = 50 * 1024 * 1024;

// // Разрешённые MIME-типы (расширьте по необходимости)
// const ALLOWED_MIME = new Set([
//   'image/jpeg', 'image/png', 'image/gif', 'image/webp',
//   'application/pdf',
//   'text/plain', 'text/csv',
//   'application/zip',
//   'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
//   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',        // xlsx
// ]);

// // ─── Утилиты ──────────────────────────────────────────────────────────────

// function broadcast(room, message) {
//   if (!rooms.has(room)) return;
//   for (const clientCall of rooms.get(room)) {
//     if (!clientCall.writableEnded && !clientCall.destroyed) {
//       try {
//         clientCall.write(message);
//       } catch (err) {
//         console.error('Broadcast error:', err.message);
//       }
//     }
//   }
// }

// function generateFileId() {
//   return crypto.randomUUID();
// }

// // ─── Chat (двунаправленный стриминг) ─────────────────────────────────────

// function handleChat(call) {
//   let myUserId = null;
//   let myUsername = null;
//   let myRoom = null;

//   call.on('data', (msg) => {
//     if (!myUserId) {
//       myUserId   = msg.user_id  || `user_${Date.now().toString(36)}`;
//       myUsername = msg.username || 'Anonymous';
//       myRoom     = msg.room     || 'general';

//       if (!rooms.has(myRoom)) rooms.set(myRoom, new Set());
//       rooms.get(myRoom).add(call);

//       console.log(`→ ${myUsername} joined ${myRoom}`);

//       broadcast(myRoom, {
//         user_id: 'system', username: 'System',
//         text: `${myUsername} joined the room`,
//         timestamp: Date.now(), room: myRoom, join: true
//       });
//       return;
//     }

//     if (msg.leave) { call.end(); return; }

//     if (msg.text?.trim()) {
//       const fullMsg = {
//         user_id: myUserId, username: myUsername,
//         text: msg.text, timestamp: Date.now(), room: myRoom
//       };
//       console.log(`[${myRoom}] ${myUsername}: ${msg.text}`);
//       broadcast(myRoom, fullMsg);
//     }
//   });

//   call.on('end', () => {
//     removeFromRoom(myRoom, call, myUsername);
//     call.end();
//   });

//   call.on('error', (err) => {
//     console.error('Chat stream error:', err.message);
//     if (myRoom) removeFromRoom(myRoom, call, null);
//   });
// }

// // ─── Subscribe ────────────────────────────────────────────────────────────

// function handleSubscribe(call) {
//   const req = call.request;
//   const userId   = req.user_id  || `user_${Date.now().toString(36)}`;
//   const username = req.username || 'Anonymous';
//   const room     = req.room     || 'general';

//   if (!rooms.has(room)) rooms.set(room, new Set());
//   rooms.get(room).add(call);

//   console.log(`→ [Subscribe] ${username} joined ${room}`);

//   broadcast(room, {
//     user_id: 'system', username: 'System',
//     text: `${username} joined the room`,
//     timestamp: Date.now(), room, join: true
//   });

//   call.on('cancelled', () => removeFromRoom(room, call, username));
//   call.on('end',       () => removeFromRoom(room, call, username));
// }

// // ─── SendMessage ──────────────────────────────────────────────────────────

// function handleSendMessage(call, callback) {
//   const msg      = call.request;
//   const room     = msg.room     || 'general';
//   const userId   = msg.user_id  || `user_${Date.now().toString(36)}`;
//   const username = msg.username || 'Anonymous';

//   if (msg.text?.trim()) {
//     const fullMsg = {
//       user_id: userId, username,
//       text: msg.text, timestamp: Date.now(), room
//     };
//     console.log(`[${room}] ${username}: ${msg.text}`);
//     broadcast(room, fullMsg);
//   }
//   callback(null, {});
// }

// // ─── UploadFile ───────────────────────────────────────────────────────────

// function handleUploadFile(call, callback) {
//   let fileInfo = null;
//   const chunks = [];
//   let totalSize = 0;

//   call.on('data', (chunk) => {
//     // Первый чанк содержит метаданные
//     if (chunk.info && chunk.info.filename) {
//       fileInfo = chunk.info;
//       fileInfo.file_id  = generateFileId();
//       fileInfo.timestamp = Date.now();

//       // Валидация MIME
//       if (fileInfo.mime_type && !ALLOWED_MIME.has(fileInfo.mime_type)) {
//         call.destroy(new Error(`MIME type not allowed: ${fileInfo.mime_type}`));
//         return;
//       }
//       console.log(`📁 Upload started: ${fileInfo.filename} (${fileInfo.mime_type}) by ${fileInfo.username}`);
//     }

//     // Собираем бинарные данные
//     if (chunk.data && chunk.data.length > 0) {
//       totalSize += chunk.data.length;

//       if (totalSize > MAX_FILE_SIZE) {
//         call.destroy(new Error(`File too large. Max: ${MAX_FILE_SIZE / 1024 / 1024} MB`));
//         return;
//       }
//       chunks.push(chunk.data);
//     }

//     // Последний чанк → сохраняем
//     if (chunk.is_last) {
//       if (!fileInfo) {
//         callback({ code: grpc.status.INVALID_ARGUMENT, message: 'No file info received' });
//         return;
//       }

//       const buffer = Buffer.concat(chunks);
//       fileInfo.size = buffer.length;

//       fileStore.set(fileInfo.file_id, { info: fileInfo, buffer });

//       console.log(`✅ File saved: ${fileInfo.filename} (${fileInfo.size} bytes) → ID: ${fileInfo.file_id}`);

//       // Уведомляем комнату о новом файле
//       if (fileInfo.room) {
//         broadcast(fileInfo.room, {
//           user_id: fileInfo.user_id,
//           username: fileInfo.username,
//           text: `📎 Файл загружен: ${fileInfo.filename}`,
//           timestamp: Date.now(),
//           room: fileInfo.room,
//           file: fileInfo
//         });
//       }

//       callback(null, fileInfo);
//     }
//   });

//   call.on('error', (err) => {
//     console.error('Upload error:', err.message);
//   });
// }

// // ─── DownloadFile ─────────────────────────────────────────────────────────

// const CHUNK_SIZE = 64 * 1024; // 64 KB за чанк

// function handleDownloadFile(call) {
//   const { file_id } = call.request;
//   const stored = fileStore.get(file_id);

//   if (!stored) {
//     call.destroy({
//       code: grpc.status.NOT_FOUND,
//       message: `File not found: ${file_id}`
//     });
//     return;
//   }

//   const { info, buffer } = stored;
//   const totalChunks = Math.ceil(buffer.length / CHUNK_SIZE);

//   console.log(`⬇️  Download: ${info.filename} (${buffer.length} bytes, ${totalChunks} chunks)`);

//   // Первый чанк — только метаданные
//   call.write({ info, chunk_seq: 0 });

//   // Отправляем данные кусками
//   let seq = 1;
//   for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
//     const slice = buffer.slice(offset, offset + CHUNK_SIZE);
//     const isLast = offset + CHUNK_SIZE >= buffer.length;

//     call.write({
//       data: slice,
//       chunk_seq: seq++,
//       is_last: isLast
//     });
//   }

//   // Пустой буфер — пишем единственный last-чанк
//   if (buffer.length === 0) {
//     call.write({ data: Buffer.alloc(0), chunk_seq: 1, is_last: true });
//   }

//   call.end();
//   console.log(`✅ Download complete: ${info.filename}`);
// }

// // ─── Утилита: удалить из комнаты ─────────────────────────────────────────

// function removeFromRoom(room, call, username) {
//   if (!room || !rooms.has(room)) return;
//   rooms.get(room).delete(call);
//   if (rooms.get(room).size === 0) rooms.delete(room);

//   if (username) {
//     console.log(`← ${username} left ${room}`);
//     broadcast(room, {
//       user_id: 'system', username: 'System',
//       text: `${username} left the room`,
//       timestamp: Date.now(), room, leave: true
//     });
//   }
// }

// // ─── Запуск ───────────────────────────────────────────────────────────────

// function main() {
//   const server = new grpc.Server();

//   server.addService(chatProto.ChatService.service, {
//     Chat:         handleChat,
//     Subscribe:    handleSubscribe,
//     SendMessage:  handleSendMessage,
//     UploadFile:   handleUploadFile,
//     DownloadFile: handleDownloadFile
//   });

//   const PORT = process.env.PORT || 50051;
//   server.bindAsync(`0.0.0.0:${PORT}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
//     if (err) { console.error('Ошибка запуска:', err); process.exit(1); }
//     console.log(`gRPC чат-сервер запущен на порту ${port}`);
//   });
// }

// main();




const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const crypto = require('crypto');

const PROTO_PATH = './chat.proto';
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const chatProto = grpc.loadPackageDefinition(packageDefinition).chat;

// ─── Общие хранилища ──────────────────────────────────────────────────────

const rooms    = new Map(); // room → Set<call>
const fileStore = new Map(); // fileId → { info, buffer }
// upload_id → { info, chunks: Buffer[] } — временные сессии загрузки
const uploadSessions = new Map();

const MAX_FILE_SIZE = 50 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'text/plain', 'text/csv',
  'application/zip',
  'application/octet-stream', // fallback для неизвестных расширений
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

// ─── Утилиты ──────────────────────────────────────────────────────────────

function broadcast(room, message) {
  if (!rooms.has(room)) return;
  for (const call of rooms.get(room)) {
    if (!call.writableEnded && !call.destroyed) {
      try { call.write(message); } catch (_) {}
    }
  }
}

function removeFromRoom(room, call, username) {
  if (!room || !rooms.has(room)) return;
  rooms.get(room).delete(call);
  if (rooms.get(room).size === 0) rooms.delete(room);
  if (username) {
    console.log(`← ${username} left ${room}`);
    broadcast(room, {
      user_id: 'system', username: 'System',
      text: `${username} left the room`,
      timestamp: Date.now(), room, leave: true
    });
  }
}

// ─── gRPC handlers ────────────────────────────────────────────────────────

function handleChat(call) {
  let myUserId = null, myUsername = null, myRoom = null;

  call.on('data', (msg) => {
    if (!myUserId) {
      myUserId   = msg.user_id  || `user_${Date.now().toString(36)}`;
      myUsername = msg.username || 'Anonymous';
      myRoom     = msg.room     || 'general';
      if (!rooms.has(myRoom)) rooms.set(myRoom, new Set());
      rooms.get(myRoom).add(call);
      console.log(`→ ${myUsername} joined ${myRoom}`);
      broadcast(myRoom, { user_id: 'system', username: 'System', text: `${myUsername} joined the room`, timestamp: Date.now(), room: myRoom, join: true });
      return;
    }
    if (msg.leave) { call.end(); return; }
    if (msg.text?.trim()) {
      const fullMsg = { user_id: myUserId, username: myUsername, text: msg.text, timestamp: Date.now(), room: myRoom };
      console.log(`[${myRoom}] ${myUsername}: ${msg.text}`);
      broadcast(myRoom, fullMsg);
    }
  });

  call.on('end', () => { removeFromRoom(myRoom, call, myUsername); call.end(); });
  call.on('error', (err) => { console.error('Chat error:', err.message); if (myRoom) removeFromRoom(myRoom, call, null); });
}

function handleSubscribe(call) {
  const { user_id, username = 'Anonymous', room = 'general' } = call.request;
  const userId = user_id || `user_${Date.now().toString(36)}`;
  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room).add(call);
  console.log(`→ [Subscribe] ${username} joined ${room}`);
  broadcast(room, { user_id: 'system', username: 'System', text: `${username} joined the room`, timestamp: Date.now(), room, join: true });
  call.on('cancelled', () => removeFromRoom(room, call, username));
  call.on('end',       () => removeFromRoom(room, call, username));
}

function handleSendMessage(call, callback) {
  const { room = 'general', user_id, username = 'Anonymous', text } = call.request;
  if (text?.trim()) {
    const msg = { user_id: user_id || `user_${Date.now().toString(36)}`, username, text, timestamp: Date.now(), room };
    console.log(`[${room}] ${username}: ${text}`);
    broadcast(room, msg);
  }
  callback(null, {});
}

const CHUNK_SIZE = 64 * 1024;

// ─── UploadChunk (unary RPC по чанкам) ──────────────────────────────────────

function handleUploadChunk(call, callback) {
  const chunk = call.request;

  if (!chunk.upload_id) {
    callback({ code: grpc.status.INVALID_ARGUMENT, message: 'upload_id required' });
    return;
  }

  const { upload_id, chunk_seq, is_last, info, data } = chunk;

  // Первый чанк — создаём сессию
  if (chunk_seq === 0) {
    if (!info || !info.filename) {
      callback({ code: grpc.status.INVALID_ARGUMENT, message: 'First chunk must contain info' });
      return;
    }
    if (info.mime_type && !ALLOWED_MIME.has(info.mime_type)) {
      callback({ code: grpc.status.INVALID_ARGUMENT, message: `MIME not allowed: ${info.mime_type}` });
      return;
    }
    const fileInfo = {
      file_id: crypto.randomUUID(),
      filename: info.filename,
      mime_type: info.mime_type || 'application/octet-stream',
      size: 0,
      room: info.room || 'general',
      user_id: info.user_id || 'anon',
      username: info.username || 'Anonymous',
      timestamp: Date.now(),
    };
    uploadSessions.set(upload_id, { info: fileInfo, chunks: [], totalSize: 0 });
    console.log(`📁 Upload started: ${fileInfo.filename} (${upload_id})`);
    callback(null, { upload_id, chunk_seq: 0, accepted: true });
    return;
  }

  const session = uploadSessions.get(upload_id);
  if (!session) {
    callback({ code: grpc.status.FAILED_PRECONDITION, message: 'Upload session not found. Send chunk 0 first.' });
    return;
  }

  if (data && data.length > 0) {
    session.totalSize += data.length;
    if (session.totalSize > MAX_FILE_SIZE) {
      uploadSessions.delete(upload_id);
      callback({ code: grpc.status.RESOURCE_EXHAUSTED, message: 'File too large. Max: 50 MB' });
      return;
    }
    session.chunks.push(Buffer.from(data));
  }

  if (is_last) {
    const buffer = Buffer.concat(session.chunks);
    session.info.size = buffer.length;
    fileStore.set(session.info.file_id, { info: session.info, buffer });
    uploadSessions.delete(upload_id);

    console.log(`✅ File saved: ${session.info.filename} (${buffer.length} bytes) → ${session.info.file_id}`);

    if (session.info.room) {
      broadcast(session.info.room, {
        user_id: session.info.user_id,
        username: session.info.username,
        text: `📎 ${session.info.username} загрузил файл: ${session.info.filename}`,
        timestamp: session.info.timestamp,
        room: session.info.room,
        join: false,
        leave: false,
        file: session.info,
      });
    }

    callback(null, {
      upload_id,
      chunk_seq,
      accepted: true,
      file_info: session.info,
    });
  } else {
    callback(null, { upload_id, chunk_seq, accepted: true });
  }
}

function handleDownloadFile(call) {
  const { file_id } = call.request;
  const stored = fileStore.get(file_id);

  if (!stored) {
    call.destroy({ code: grpc.status.NOT_FOUND, message: `File not found: ${file_id}` });
    return;
  }

  const { info, buffer } = stored;
  console.log(`⬇️  Download: ${info.filename} (${buffer.length} bytes)`);

  call.write({ info, chunk_seq: 0 });

  let seq = 1;
  for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
    const slice = buffer.slice(offset, offset + CHUNK_SIZE);
    call.write({ data: slice, chunk_seq: seq++, is_last: offset + CHUNK_SIZE >= buffer.length });
  }
  if (buffer.length === 0) call.write({ data: Buffer.alloc(0), chunk_seq: 1, is_last: true });

  call.end();
}

// ─── Запуск ───────────────────────────────────────────────────────────────

function main() {
  const server = new grpc.Server();

  server.addService(chatProto.ChatService.service, {
    Chat:         handleChat,
    Subscribe:    handleSubscribe,
    SendMessage:  handleSendMessage,
    UploadChunk:  handleUploadChunk,
    DownloadFile: handleDownloadFile,
  });

  const GRPC_PORT = process.env.PORT || 50051;

  server.bindAsync(`0.0.0.0:${GRPC_PORT}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
    if (err) { console.error('gRPC error:', err); process.exit(1); }
    console.log(`gRPC сервер запущен на порту ${port}`);
  });
}

main();