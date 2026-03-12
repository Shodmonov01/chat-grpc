npm install @connectrpc/connect @connectrpc/connect-web
npm install @bufbuild/protobuf
npm install -D @bufbuild/buf @bufbuild/protoc-gen-es


npx buf generate --path proto         


1. Установил библиотеки:
Основные зависимости:

@connectrpc/connect и @connectrpc/connect-web - это библиотеки для создания gRPC-подобных сервисов, но работающих через HTTP. Они позволяют клиенту и серверу общаться, используя сгенерированные protobuf типы. Connect более современный и легкий, чем стандартный gRPC-web.

@bufbuild/protobuf - основная библиотека для работы с protobuf сообщениями в рантайме (содержит базовые классы и утилиты).

Инструменты разработки (-D):

@bufbuild/buf - современная замена стандартному компилятору protoc. Упрощает управление proto файлами и их компиляцию.

@bufbuild/protoc-gen-es - плагин для генерации TypeScript/JavaScript кода из proto файлов.

2. Создал конфигурационные файлы:
buf.yaml - корневой конфиг, который говорит Buf, что эта директория - корень вашего protobuf модуля. Простейшая версия просто указывает версию API.

buf.gen.yaml - конфигурация генерации кода:

yaml
version: v1
plugins:
  - plugin: es          # используем плагин для генерации ECMAScript
    out: src/gen        # куда сохранять сгенерированные файлы
    opt: target=ts      # генерируем TypeScript (не просто JS)
3. Запустил генерацию:
npx buf generate --path proto

Эта команда:

Находит все .proto файлы в папке proto

Компилирует их через плагин protoc-gen-es

Создает TypeScript файлы в папке src/gen

Что ты получил в итоге?
Ты получил TypeScript файл, который представляет собой "перевод" твоего proto файла на TypeScript. В нём:

Основные элементы:
Типы сообщений (интерфейсы)

Empty - пустое сообщение

EchoRequest - запрос с полем message

EchoResponse - ответ с message и счетчиком сообщений

и другие для стриминговых вариантов

Схемы (Schemas)

EmptySchema, EchoRequestSchema и т.д. - эти объекты содержат метаданные о структуре сообщений и используются для валидации и сериализации/десериализации данных.

Описание сервиса (EchoService)

Это описание всех доступных RPC методов сервиса:

Unary методы (один запрос - один ответ): Echo, EchoAbort, NoOp

Серверный стриминг: ServerStreamingEcho

Клиентский стриминг: ClientStreamingEcho

Двунаправленный стриминг: FullDuplexEcho, HalfDuplexEcho