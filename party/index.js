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
    url: "https://el0fpba1yn.ufs.sh/f/srNDdO9Sv6AuJFJJ2LwYMArKS1hjxlXk94ToVm5esG7FctBg",
    x: 150,
    y: 150,
  },
  {
    id: "cdb23",
    type: "image",
    url: "https://el0fpba1yn.ufs.sh/f/srNDdO9Sv6Aut4rLJLhesuEVHvNgkKDIRm7JPy24SXp65hxU",
    x: 200,
    y: 200,
  },
  {
    id: "def987",
    type: "image",
    url: "https://el0fpba1yn.ufs.sh/f/srNDdO9Sv6AutNKukhesuEVHvNgkKDIRm7JPy24SXp65hxUT",
    x: 200,
    y: 200,
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
    console.log(`Room ${this.room.id} started. Loaded ${this.items.length} items.`);
    this.cursors = [];

    this.assets = await this.listAssets();
  }

  async listAssets() {
    const targetUrl = "https://api.uploadthing.com/v6/listFiles";
    const headers = {
      "Content-Type": "application/json",
      "X-Uploadthing-Api-Key": process.env.UPLOADTHING_SECRET_KEY,
    };
    const requestBody = JSON.stringify({});
    const res = await fetch(targetUrl, { method: "POST", headers, body: requestBody });
    if (!res.ok) {
      const errorText = await response.text();
      console.error(`Uploadthing API request failed with status ${response.status}: ${errorText}`);
      return [];
    }
    const data = await res.json();
    const urlPrefix = "https://el0fpba1yn.ufs.sh/f";
    const assets = data.files.map((file) => ({ id: file.id, name: file.name, url: `${urlPrefix}/${file.key}` }));
    return assets;
  }

  /**
   * @param {Connection} conn - The connection object.
   * @param {ConnectionContext} ctx - The context object.
   */
  onConnect(conn, ctx) {
    // A websocket just connected!
    console.log(`Connected: id: ${conn.id} room: ${this.room.id}`);

    // Send all initial items to the connection
    conn.send(JSON.stringify({ type: "initial_items", id: conn.id, items: this.items }));

    // Send all initial cursors
    conn.send(JSON.stringify({ type: "initial_cursors", cursors: this.cursors }));

    // Send all initial cursors
    conn.send(JSON.stringify({ type: "initial_assets", assets: this.assets }));

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
   * @param {string} message - The message received from a client.
   * @param {Connection} sender - The connection object of the sender.
   */
  async onMessage(message, sender) {
    const data = JSON.parse(message);
    // console.log(`Received message from ${sender.id}:`, data);

    switch (data.type) {
      case "cursor":
        this.room.broadcast(JSON.stringify(data));
        break;

      case "item_move":
        // Find the item in the current room state and update its position
        let itemFound = false;
        this.items = this.items.map((item) => {
          if (item.id === data.id) {
            itemFound = true;
            return { ...item, x: data.x, y: data.y }; // Update x and y
          }
          return item;
        });

        // If the item wasn't found in the current state (e.g., a new item was added
        // via a drag from the asset viewer, assuming the client sends enough info),
        // add it to the items array.
        // NOTE: For a robust system, you might want a separate "add_item" message
        // that provides the full item data (id, type, url, initial x/y).
        // This simplified approach assumes 'item_move' might implicitly add if not found.
        if (!itemFound) {
          console.warn(`Item with ID ${data.id} not found in room state. Adding it with received coordinates.`);
          // You'll need more information (like 'type' and 'url') if this is a new item.
          // For now, we'll make assumptions. Ideally, the client sends a full item object on 'add'.
          this.items.push({
            id: data.id,
            x: data.x,
            y: data.y,
            type: "image", // Assuming it's an image. Client should provide this.
            url: "https://placehold.co/100x100/aabbcc/ffffff?text=New+Item", // Placeholder. Client should provide this.
          });
        }

        // Persist the updated items array to the room's storage
        await this.room.storage.put("items", this.items);
        console.log(`Item ${data.id} moved to (${data.x}, ${data.y}). State saved.`);

        // Broadcast the updated item position to all clients in the room (including the sender)
        // Broadcasting to sender ensures their UI is consistent with the server's authoritative state.
        this.room.broadcast(JSON.stringify(data));
        break;

      // Add other message types here as needed (e.g., "add_item", "remove_item")
      case "add_item":
        // Assuming data contains the full item object to add
        this.items.push(data.item);
        await this.room.storage.put("items", this.items);
        this.room.broadcast(JSON.stringify({ type: "add_item", item: data.item }));
        break;

      default:
        console.warn(`Unknown message type received: ${data.type}`);
        // For any other unknown message type, you might still want to broadcast it
        // or log it for debugging.
        this.room.broadcast(JSON.stringify(data));
        break;
    }
  }
}

export default PartyServer;
