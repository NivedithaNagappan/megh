import type { Server } from "socket.io";
import { Token } from "../di";

/** The Socket.IO server, registered in the container by `useSocketIo()`. */
export const SocketIoServer = new Token<Server>("SocketIoServer");
