npm run dev - для запуска
npm test  - для тестинга

# Загрузить файл в комнату "general"
node file-client.js upload ./photo.jpg general Alice

# Скачать по ID (возвращается после upload)
node file-client.js download <file_id> ./output.jpg