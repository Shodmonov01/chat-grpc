import type { FileInfo } from "../gen/proto/chat_pb";

export interface MessageItem {
  id: string;
  username: string;
  text: string;
  timestamp: number;
  isJoin?: boolean;
  isLeave?: boolean;
  file?: FileInfo;
}
