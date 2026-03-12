const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const packageDefinition = protoLoader.loadSync('./chat.proto');
const chatProto = grpc.loadPackageDefinition(packageDefinition).chat;

const client = new chatProto.ChatService('localhost:50051', grpc.credentials.createInsecure());

const call = client.Chat();

call.on('data', (msg) => {
  if (msg.join) {
    console.log(`→ ${msg.text}`);
  } else if (msg.leave) {
    console.log(`← ${msg.text}`);
  } else if (msg.user_id === 'system') {
    console.log(msg.text);
  } else {
    console.log(`[${msg.username}]: ${msg.text}`);
  }
});

call.on('end', () => {
  console.log('Соединение закрыто сервером');
  process.exit(0);
});

call.on('error', (err) => {
  console.error('Ошибка:', err.message);
  process.exit(1);
});

// Присоединяемся
call.write({
  username: 'Alice',
  room: 'general'
});

// Отправляем сообщения каждые 3 сек
let i = 1;
const interval = setInterval(() => {
  call.write({
    text: `Привет всем! Сообщение #${i++}`
  });
}, 3000);

// Через 20 сек выходим
setTimeout(() => {
  call.write({ leave: true });
  clearInterval(interval);
}, 20000);