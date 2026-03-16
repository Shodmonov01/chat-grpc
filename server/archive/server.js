const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const PROTO_PATH = './chat.proto';
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const chatProto = grpc.loadPackageDefinition(packageDefinition).chat;

// Хранилище подключений (in-memory, для продакшена → Redis / NATS / Kafka)
const rooms = new Map(); // room → Set<call>

function broadcast(room, message) {
  if (!rooms.has(room)) return;
  for (const clientCall of rooms.get(room)) {
    if (!clientCall.writableEnded && !clientCall.destroyed) {
      clientCall.write(message);
    }
  }
}

function handleSubscribe(call) {
  const req = call.request;
  const userId = req.user_id || `user_${Date.now().toString(36)}`;
  const username = req.username || 'Anonymous';
  const room = req.room || 'general';

  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room).add(call);

  console.log(`→ [Subscribe] ${username} joined ${room} (${userId})`);

  const joinMsg = {
    user_id: 'system',
    username: 'System',
    text: `${username} joined the room`,
    timestamp: Date.now(),
    room,
    join: true
  };
  broadcast(room, joinMsg);

  call.on('cancelled', () => removeFromRoom(room, call, username));
  call.on('end', () => removeFromRoom(room, call, username));
}

function removeFromRoom(room, call, username) {
  if (rooms.has(room)) {
    rooms.get(room).delete(call);
    if (rooms.get(room).size === 0) rooms.delete(room);
    if (username) {
      console.log(`← [Subscribe] ${username} left ${room}`);
      const leaveMsg = {
        user_id: 'system',
        username: 'System',
        text: `${username} left the room`,
        timestamp: Date.now(),
        room,
        leave: true
      };
      broadcast(room, leaveMsg);
    }
  }
}

function handleSendMessage(call, callback) {
  const msg = call.request;
  const room = msg.room || 'general';
  const userId = msg.user_id || `user_${Date.now().toString(36)}`;
  const username = msg.username || 'Anonymous';

  if (msg.text?.trim()) {
    const fullMsg = {
      user_id: userId,
      username,
      text: msg.text,
      timestamp: Date.now(),
      room
    };
    console.log(`[${room}] ${username}: ${msg.text}`);
    broadcast(room, fullMsg);
  }
  callback(null, {});
}

function handleChat(call) {
  let myUserId = null;
  let myUsername = null;
  let myRoom = null;

  call.on('data', (msg) => {
    // Первое сообщение — join / авторизация
    if (!myUserId) {
      myUserId = msg.user_id || `user_${Date.now().toString(36)}`;
      myUsername = msg.username || 'Anonymous';
      myRoom = msg.room || 'general';

      if (!rooms.has(myRoom)) rooms.set(myRoom, new Set());
      rooms.get(myRoom).add(call);

      console.log(`→ ${myUsername} joined ${myRoom} (${myUserId})`);

      // Отправляем приветственное сообщение в комнату
      const joinMsg = {
        user_id: 'system',
        username: 'System',
        text: `${myUsername} joined the room`,
        timestamp: Date.now(),
        room: myRoom,
        join: true
      };
      broadcast(myRoom, joinMsg);

      // Можно отправить последние N сообщений новому юзеру (опционально)
      return;
    }

    // Обычное сообщение
    if (msg.leave) {
      // Явный выход
      call.end();
      return;
    }

    if (msg.text?.trim()) {
      const fullMsg = {
        user_id: myUserId,
        username: myUsername,
        text: msg.text,
        timestamp: Date.now(),
        room: myRoom
      };

      console.log(`[${myRoom}] ${myUsername}: ${msg.text}`);
      broadcast(myRoom, fullMsg);
    }
  });

  call.on('end', () => {
    if (myRoom && rooms.has(myRoom)) {
      rooms.get(myRoom).delete(call);
      if (rooms.get(myRoom).size === 0) rooms.delete(myRoom);

      if (myUsername) {
        console.log(`← ${myUsername} left ${myRoom}`);
        const leaveMsg = {
          user_id: 'system',
          username: 'System',
          text: `${myUsername} left the room`,
          timestamp: Date.now(),
          room: myRoom,
          leave: true
        };
        broadcast(myRoom, leaveMsg);
      }
    }
    call.end();
  });

  call.on('error', (err) => {
    console.error('Stream error:', err.message);
    // Удаляем из комнаты при ошибке
    if (myRoom && rooms.has(myRoom)) {
      rooms.get(myRoom).delete(call);
    }
  });
}

function main() {
  const server = new grpc.Server();

  server.addService(chatProto.ChatService.service, {
    Chat: handleChat,
    Subscribe: handleSubscribe,
    SendMessage: handleSendMessage
  });

  const PORT = process.env.PORT || 50052;
  const credentials = grpc.ServerCredentials.createInsecure(); // для прод → TLS!

  server.bindAsync(`0.0.0.0:${PORT}`, credentials, (err, port) => {
    if (err) {
      console.error('Ошибка запуска:', err);
      process.exit(1);
      return;
    }
    console.log(`gRPC чат-сервер запущен на порту ${port}`);
  });
}

main();