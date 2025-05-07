/* eslint-env browser */

// @ts-check
// Optional JS type checking, powered by TypeScript.
/** @typedef {import("partykit/server").Room} Room */
/** @typedef {import("partykit/server").Server} Server */
/** @typedef {import("partykit/server").Connection} Connection */
/** @typedef {import("partykit/server").ConnectionContext} ConnectionContext */

const DEFAULT_BOOK_ITEMS = [
  {
    id: "abc123",
    type: "image",
    url: "https://6fsz3xa0qw.ufs.sh/f/obk1n6xKKhmuob4mcD2KKhmubZUGIXl9zFH6We5SR8kdysCg",
    x: 150,
    y: 150,
  },
  {
    id: "cdb23",
    type: "image",
    url: "https://6fsz3xa0qw.ufs.sh/f/obk1n6xKKhmufaS2r942bs5vPCWA7xTnqNljHgkYmdZcByK8",
    x: 200,
    y: 200,
  },
  {
    id: "def987",
    type: "image",
    url: "https://6fsz3xa0qw.ufs.sh/f/obk1n6xKKhmuW3QdLCrH6RA8bTiLjEPzeq2rfoNhdvOkXyIc",
    x: 500,
    y: 500,
  },
];

/**
 * @implements {Server}
 */
class PartyServer {
  /**
   * @param {Room} room - The Room object.
   */
  constructor(room) {
    /** @type {Room} */
    this.room = room;
  }

  async onStart() {
    this.items = (await this.room.storage.get("items")) ?? DEFAULT_BOOK_ITEMS;
  }

  /**
   * @param {Connection} conn - The connection object.
   * @param {ConnectionContext} ctx - The context object.
   */
  onConnect(conn, ctx) {
    // A websocket just connected!
    console.log(`Connected: id: ${conn.id} room: ${this.room.id}`);

    // Send a message to the connection
    conn.send(JSON.stringify({ type: "initial_items", id: conn.id, items: this.items }));

    // this.room.broadcast(`${conn.id} has connected`);
    this.room.broadcast(JSON.stringify({ type: "connect", id: conn.id }));
  }

  /**
   * @param {Connection} conn - The connection object.
   */
  onClose(conn) {
    console.log("disconnected", conn.id);
    this.room.broadcast(JSON.stringify({ type: "disconnect", id: conn.id }));
  }

  /**
   * @param {string} message
   * @param {Connection} sender
   */
  onMessage(message, sender) {
    // console.log(`connection ${sender.id} sent message: ${message}`);
    // Broadcast the received message to all other connections in the room except the sender
    const data = JSON.parse(message);
    if (data.type !== "cursor") {
      console.log(data);
    }
    // this.room.broadcast(JSON.stringify(data));
    this.room.broadcast(JSON.stringify(data), [sender.id]);
  }
}

export default PartyServer;
