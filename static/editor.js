import PartySocket from "partysocket";
import { h, render } from "preact";
import { useEffect, useRef } from "preact/hooks";
import htm from "htm";
import { signal, computed } from "@preact/signals";
import clsx from "clsx";

const html = htm.bind(h);

const currentRoomId = signal("all-dreams-become-memes"); // Default room ID
const items = signal([]);
const cursors = signal([]);
const selection = signal([]);
const assets = signal([]);

const UPLOADTHING_API_KEY = "";

function getRandomColorFromId(id) {
  // Use only the first 6 hex characters of the id for the color
  let hex = id.replace(/[^a-fA-F0-9]/g, "").slice(0, 6);
  // If not enough characters, pad with '0'
  hex = hex.padEnd(6, "0");
  return `#${hex}`;
}

function updateCursor(id, x, y) {
  const newCursors = [...cursors.value]; // Create a new array to trigger update
  let cursor = newCursors.find((c) => c.id === id);
  if (!cursor) {
    cursor = { id, x, y, color: getRandomColorFromId(id) };
    newCursors.push(cursor);
  } else {
    cursor.x = x;
    cursor.y = y;
  }
  cursors.value = newCursors; // Update the signal's value
}

function moveItem(id, x, y) {
  const newItems = [...items.value];
  const item = newItems.find((it) => it.id === id);
  if (item) {
    item.x = x;
    item.y = y;
  }
  items.value = newItems;
}

function moveSelectedItems(deltaX, deltaY, startPositions) {
  const newItems = [...items.value];
  for (const item of newItems) {
    if (selection.value.includes(item.id)) {
      const startPos = startPositions.find((pos) => pos.id === item.id);
      if (startPos) {
        item.x = startPos.x + deltaX;
        item.y = startPos.y + deltaY;
      }
    }
  }
  items.value = newItems;
}

function changeTopic(roomId) {
  currentRoomId.value = roomId;
}

// --- Computed Signal (For Derived State) ---
const selectedItems = computed(() =>
  selection.value.map((id) => items.value.find((it) => it.id === id)).filter(Boolean)
);

// WebSocket instance outside of components
let ws = null;

function Canvas() {
  const svgRef = useRef(null);
  const startMousePositionRef = useRef();
  const startItemPositionsRef = useRef();

  useEffect(() => {
    console.log("Opening WebSocket connection to room:", currentRoomId.value);

    ws = new PartySocket({
      host: "localhost:1999",
      room: currentRoomId.value,
    });

    ws.addEventListener("message", (e) => {
      const message = JSON.parse(e.data);

      switch (message.type) {
        case "initial_items":
          items.value = message.items; // Directly update signal
          console.log(message.items);
          break;
        case "initial_cursors":
          cursors.value = message.cursors; // Directly update signal
          console.log(message.cursors);
          break;
        case "cursor":
          updateCursor(message.id, message.x, message.y); // Use action
          break;
        case "item_move":
          moveItem(message.id, message.x, message.y); // Use action
          break;
        case "disconnect":
          // Remove the cursor for the disconnected user
          cursors.value = cursors.value.filter((c) => c.id !== message.id);
          break;
      }
    });

    ws.reconnect();

    const handleMouseMove = (e) => {
      ws.send(JSON.stringify({ type: "cursor", id: ws.id, x: e.clientX, y: e.clientY }));
      // We don't need to update our own cursor locally with signals unless desired
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      console.log("Closing WebSocket connection");
      ws.close();
    };
  }, [currentRoomId.value]);

  function handleItemMouseDown(event, item) {
    selection.value = [item.id];

    startMousePositionRef.current = { x: event.clientX, y: event.clientY };
    startItemPositionsRef.current = [{ id: item.id, x: item.x, y: item.y }];
  }

  function handleItemMouseDrag(event) {
    const startX = startMousePositionRef.current.x;
    const startY = startMousePositionRef.current.y;
    const currentX = event.clientX;
    const currentY = event.clientY;
    const deltaX = currentX - startX;
    const deltaY = currentY - startY;

    moveSelectedItems(deltaX, deltaY, startItemPositionsRef.current);

    // Send updates for each selected item (using the computed signal)
    selectedItems.value.forEach((item) => {
      ws.send(JSON.stringify({ type: "item_move", id: item.id, x: item.x, y: item.y }));
    });
  }

  const bounds = svgRef.current ? svgRef.current.getBoundingClientRect() : { left: 0, top: 0 };

  // --- Render (Access .value to use signals) ---
  // Preact automatically subscribes and re-renders when signals change
  return html`<svg width="800" height="600" viewBox="0 0 800 600" ref=${svgRef} class="cursor-none">
    ${items.value.map((item) => {
      // Access .value here
      if (item.type === "image") {
        return html`<${ImageItem}
          key=${item.id}
          item=${item}
          handleItemMouseDown=${handleItemMouseDown}
          handleItemMouseDrag=${handleItemMouseDrag}
        />`;
      }
    })}
    ${cursors.value.map(
      (cursor) =>
        html`<circle
          cx=${cursor.x - bounds.left}
          cy=${cursor.y - bounds.top}
          r="10"
          fill=${cursor.color}
          class="pointer-events-none"
        />`
    )}
  </svg>`;
}

function ImageItem({ item, handleItemMouseDown, handleItemMouseDrag }) {
  function handleMouseDown(event) {
    handleItemMouseDown(event, item);
    window.addEventListener("mousemove", handleMouseDrag);
    window.addEventListener("mouseup", handleMouseUp);
  }

  function handleMouseDrag(event) {
    handleItemMouseDrag(event);
  }

  function handleMouseUp() {
    window.removeEventListener("mousemove", handleMouseDrag);
    window.removeEventListener("mouseup", handleMouseUp);
  }

  return html`<image x=${item.x} y=${item.y} href=${item.url} onMouseDown=${handleMouseDown} class="select-none" />`;
}

function TopicButton({ roomId, name }) {
  return html`<button
    class=${clsx("flex-1 h-16 border-r-4 border-red-400 flex items-center justify-center cursor-pointer", {
      "bg-red-500": currentRoomId.value === roomId,
    })}
    onClick=${() => changeTopic(roomId)}
  >
    ${name}
  </button>`;
}

function AssetViewer() {
  // Fetch asset list from UploadThing
  async function fetchAssets() {
    const res = await fetch("https://api.uploadthing.com/v6/listFiles", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-uploadthing-api-key": UPLOADTHING_API_KEY,
      },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const data = await res.json();
      // Map UploadThing file objects to your asset format
      assets.value = data.files.map((f) => ({
        id: f.key,
        name: f.name,
        type: f.type,
        url: f.url, // You may need to adjust this depending on UploadThing's response
      }));
    }
  }

  // Handle file upload
  async function uploadAsset() {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      // Prepare upload
      const prepareRes = await fetch("https://api.uploadthing.com/v6/prepareUpload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-uploadthing-api-key": UPLOADTHING_API_KEY,
        },
        body: JSON.stringify({
          files: [{ name: file.name, type: file.type }],
        }),
      });
      const prepareData = await prepareRes.json();
      const { url, fileKey, uploadUrl, uploadHeaders } = prepareData[0];
      // Upload file
      await fetch(uploadUrl, {
        method: "PUT",
        headers: uploadHeaders,
        body: file,
      });
      // Optionally poll for completion or just refresh
      await fetchAssets();
    };
    input.click();
  }

  // Fetch assets on mount
  useEffect(() => {
    fetchAssets();
  }, []);

  return html`<div class="p-4">
    <h2 class="text-xl font-bold mb-4">Assets</h2>
    <ul>
      ${assets.value.map(
        (item) =>
          html`<li key=${item.id} class="mb-2"><span class="font-semibold">${item.name}</span> - ${item.type}</li>`
      )}
    </ul>
    <button class="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600" onClick=${uploadAsset}>
      Add Asset
    </button>
  </div>`;
}

function App() {
  return html`<main class="flex flex-col h-screen">
    <div id="header" class="flex items-center border-b-4 border-red-400">
      <div class="w-64 h-16 border-r-4 border-red-400 flex items-center justify-center">Random Title Generator</div>
      <div class="flex-1 h-16 flex items-center">
        <${TopicButton} roomId="all-dreams-become-memes" name="All Dreams Become Memes" />
        <${TopicButton} roomId="beta" name="Beta" />
        <${TopicButton} roomId="gamma" name="Gamma" />
      </div>
    </div>
    <div id="workbench" class="flex-1 flex items-stretch">
      <div id="assets" class="w-64 border-r-4 border-red-400"><${AssetViewer} /></div>
      <div id="canvas" class="flex-1"><${Canvas} /></div>
    </div>
  </main> `;
}

render(html`<${App} />`, document.getElementById("root"));
