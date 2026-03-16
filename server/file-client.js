/**
 * Пример загрузки и скачивания файлов через gRPC.
 * 
 * Использование:
 *   node file-client.js upload ./photo.jpg general Alice
 *   node file-client.js download <file_id> ./downloaded.jpg
 */

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const packageDefinition = protoLoader.loadSync('./chat.proto', {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const chatProto = grpc.loadPackageDefinition(packageDefinition).chat;

const client = new chatProto.ChatService(
  '127.0.0.1:50052',
  grpc.credentials.createInsecure()
);

const CHUNK_SIZE = 512 * 1024; // 512 КБ за чанк

// ─── MIME helper ──────────────────────────────────────────────────────────

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.gif': 'image/gif',
    '.webp': 'image/webp', '.pdf': 'application/pdf',
    '.txt': 'text/plain', '.csv': 'text/csv',
    '.zip': 'application/zip',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return map[ext] || 'application/octet-stream';
}

// ─── Upload (unary RPC по чанкам) ──────────────────────────────────────────

async function uploadFile(filePath, room, username, userId) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const buffer = fs.readFileSync(filePath);
  const filename = path.basename(filePath);
  const mimeType = getMimeType(filePath);
  const uploadId = crypto.randomUUID();
  const totalChunks = Math.ceil(buffer.length / CHUNK_SIZE) + 1;

  console.log(`📤 Uploading: ${filename} (${buffer.length} bytes, ${totalChunks} chunks via unary)`);

  // Чанк 0 — метаданные
  await new Promise((resolve, reject) => {
    client.UploadChunk({
      upload_id: uploadId,
      chunk_seq: 0,
      is_last: false,
      data: Buffer.alloc(0),
      info: {
        filename,
        mime_type: mimeType,
        room: room || 'general',
        user_id: userId || 'anon',
        username: username || 'Anonymous',
        timestamp: Date.now(),
      },
    }, (err, res) => {
      if (err) reject(err);
      else if (!res.accepted) reject(new Error('Chunk 0 rejected'));
      else resolve();
    });
  });

  // Чанки с данными
  let seq = 1;
  for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
    const slice = buffer.slice(offset, offset + CHUNK_SIZE);
    const isLast = offset + CHUNK_SIZE >= buffer.length;
    const res = await new Promise((resolve, reject) => {
      client.UploadChunk({
        upload_id: uploadId,
        chunk_seq: seq++,
        is_last: isLast,
        data: slice,
      }, (err, r) => err ? reject(err) : resolve(r));
    });
    if (res.file_info) {
      console.log(`✅ Upload complete!`);
      console.log(`   File ID : ${res.file_info.file_id}`);
      console.log(`   Name    : ${res.file_info.filename}`);
      console.log(`   Size    : ${res.file_info.size} bytes`);
      return res.file_info;
    }
  }

  // Пустой файл
  if (buffer.length === 0) {
    const res = await new Promise((resolve, reject) => {
      client.UploadChunk({
        upload_id: uploadId,
        chunk_seq: 1,
        is_last: true,
        data: Buffer.alloc(0),
      }, (err, r) => err ? reject(err) : resolve(r));
    });
    if (res.file_info) return res.file_info;
  }

  throw new Error('Upload did not complete');
}

// ─── Download ─────────────────────────────────────────────────────────────

async function downloadFile(fileId, outputPath) {
  return new Promise((resolve, reject) => {
    console.log(`📥 Downloading file ID: ${fileId}`);

    const call = client.DownloadFile({ file_id: fileId });
    const chunks = [];
    let fileInfo = null;

    call.on('data', (chunk) => {
      // Первый чанк — метаданные
      if (chunk.info && chunk.info.filename) {
        fileInfo = chunk.info;
        // Если путь не указан — берём оригинальное имя файла
        if (!outputPath) outputPath = fileInfo.filename;
        console.log(`📄 File: ${fileInfo.filename} (${fileInfo.mime_type})`);
      }

      if (chunk.data && chunk.data.length > 0) {
        chunks.push(chunk.data);
        process.stdout.write('.');
      }
    });

    call.on('end', () => {
      process.stdout.write('\n');
      const buffer = Buffer.concat(chunks);
      fs.writeFileSync(outputPath, buffer);
      console.log(`✅ Saved to: ${outputPath} (${buffer.length} bytes)`);
      resolve({ fileInfo, outputPath });
    });

    call.on('error', (err) => {
      reject(err);
    });
  });
}

// ─── CLI ──────────────────────────────────────────────────────────────────

const [, , command, ...args] = process.argv;

if (command === 'upload') {
  const [filePath, room, username, userId] = args;
  if (!filePath) { console.error('Usage: node file-client.js upload <file> [room] [username]'); process.exit(1); }
  uploadFile(filePath, room, username, userId).catch(err => {
    console.error('❌ Upload failed:', err.message);
    process.exit(1);
  });

} else if (command === 'download') {
  const [fileId, outputPath] = args;
  if (!fileId) { console.error('Usage: node file-client.js download <file_id> [output_path]'); process.exit(1); }
  downloadFile(fileId, outputPath).catch(err => {
    console.error('❌ Download failed:', err.message);
    process.exit(1);
  });

} else {
  console.log('Commands:');
  console.log('  node file-client.js upload <file> [room] [username]');
  console.log('  node file-client.js download <file_id> [output_path]');
}

module.exports = { uploadFile, downloadFile };
