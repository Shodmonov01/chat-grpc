/**
 * Проверка работы gRPC сервера.
 * Запуск: npm run dev (в одном терминале), затем npm test (в другом)
 */
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const PROTO_PATH = './chat.proto';
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const chatProto = grpc.loadPackageDefinition(packageDefinition).chat;

const client = new chatProto.ChatService(
  '127.0.0.1:50052',
  grpc.credentials.createInsecure()
);

const stream = client.Subscribe({
  user_id: 'test',
  username: 'TestUser',
  room: 'general',
});

let received = false;
stream.on('data', (msg) => {
  received = true;
  console.log('✅ Получено:', msg.username, '-', msg.text || '(join)');
});
stream.on('end', () => {
  console.log(received ? '✅ Сервер работает' : '⚠️ Stream закрыт без данных');
  process.exit(received ? 0 : 1);
});
stream.on('error', (e) => {
  if (e.code === grpc.status.CANCELLED && received) {
    console.log('✅ Сервер работает (stream отменён)');
    process.exit(0);
  }
  if (e.code === grpc.status.UNAVAILABLE) {
    console.error('❌ Ошибка: сервер не запущен. Запустите: npm run dev');
  } else {
    console.error('❌ Ошибка:', e.message);
  }
  process.exit(1);
});
setTimeout(() => stream.cancel(), 2000);
