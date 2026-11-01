import { PathLike } from "node:fs";
import type { Server } from "socket.io";
import { Injectable, Token } from "../di";
export const SocketIoServer = new Token<Server>("SocketIoServer");

type FileAdapter = {
  type: "file";
  url?: PathLike;
};

type RedisAdapter = {
  type: "redis";
  url?: string;
  username?: string;
  password?: string;
};

type AdapterType = FileAdapter | RedisAdapter;

interface BrodcastAble {
  channel: string;
  broadstTo: () => void;
}

@Injectable()
export class MeghSocketIo {
  private io?: Server;

  sendToAll() {}

  sendOnly() {}

  sendRoom() {}

  receive(channel: string) {}
}
