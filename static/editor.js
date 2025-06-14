import PartySocket from "partysocket";
import { h, render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks"; // Import useState
import htm from "htm";
import { signal, computed } from "@preact/signals";
import clsx from "clsx";
import { generateMimeTypes, generatePermittedFileTypes, genUploader } from "uploadthing/client";

const html = htm.bind(h);

const BASE_URL = "http://localhost:3000";

export const { uploadFiles, createUpload } = genUploader({
  url: BASE_URL,
  package: "vanilla",
});

const currentRoomId = signal("all-dreams-become-memes"); // Default room ID
const items = signal([]);
const cursors = signal([]);
const selection = signal([]);
const assets = signal([]);

const UPLOADTHING_API_KEY = "";

// --- Title Generator Logic (Moved In-line) ---
const M1 = ["MARGINS", "MAYBE", "MY", "MUST", "MARGINS", "MARGINS", "MY", "MORE", "MAKE"];
const E1 = [
  "EMBRACE",
  "EVEN",
  "EXPOSING",
  "EAT",
  "ERASE",
  "ENJOY",
  "EXTEND",
  "EVADE",
  "ENTANGLE",
  "EGO",
  "EVERYTHING",
  "ETC",
  "EMANCIPATE",
  "ETHICS",
];
const M2 = ["MY", "MORE", "MEETS", "MAKE", "MARGINS", "MARGINS", "MARGINS"];
const E2 = [
  "ERRORS",
  "EMPTY",
  "ETHICS",
  "EXPECTATIONS",
  "EDGES",
  "EXHAUSTION",
  "EMPATHY",
  "EXPLANATION",
  "EFFORT",
  "EVERYTHING",
  "ETHICS",
  "EUROS",
  "ETC",
  "ENDLESSLY",
  "EXPLODE",
];

function generateRandomTitle() {
  const part1 = M1[Math.floor(Math.random() * M1.length)];
  const part2 = E1[Math.floor(Math.random() * E1.length)];
  const part3 = M2[Math.floor(Math.random() * M2.length)];
  const part4 = E2[Math.floor(Math.random() * E2.length)];
  return `${part1} ${part2} ${part3} ${part4}`;
}

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
  selection.value.map((id) => items.value.find((it) => it.id === id)).filter(Boolean),
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
        case "initial_assets":
          assets.value = message.assets;
          console.log("assets", message.cursors);
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
        case "upload":
          assets.value = [...assets.value, { id: message.id, url: message.url, name: message.name }];
          break;
        case "add_item":
          items.value = [...items.value, message.item];
          break;
        case "delete_item":
          items.value = items.value.filter((item) => item.id !==messageid);
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

  function handleDeleteItem(itemId) {
    // Optimistic update: remove locally first for immediate feedback
    items.value = items.value.filter((item) => item.id !== itemId);
    // Send message to PartyKit server to notify other clients
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "delete_item", id: itemId }));
    }
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
          handleDeleteItem=${handleDeleteItem}
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
        />`,
    )}
  </svg>`;
}

function ImageItem({ item, handleItemMouseDown, handleItemMouseDrag, handleDeleteItem }) {
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

  function handleDoubleClick(event) {
    event.stopPropagation(); // Prevent canvas drag from triggering
    handleDeleteItem(item.id);
  }

  return html`<image x=${item.x} y=${item.y} href=${item.url} onMouseDown=${handleMouseDown} onDblClick=${handleDoubleClick} class="select-none" />`;
}

function TopicButton({ roomId, name }) {
  return html`<button
    class=${clsx("flex-1 h-16 border-r-4 border-red-500 flex items-center justify-center cursor-pointer", {
      "bg-red-500 text-white": currentRoomId.value === roomId,
    })}
    onClick=${() => changeTopic(roomId)}
  >
    ${name}
  </button>`;
}

function AssetViewer() {
  const formRef = useRef();
  const fileInputRef = useRef();

  // Handle file upload
  async function handleUpload(e) {
    e.preventDefault();
    const fileInput = fileInputRef.current;
    console.log(fileInput);
    const files = Array.from(fileInput.files || []);
    console.log(files);
    try {
      const res = await uploadFiles((routeRegistry) => routeRegistry.imageUploader, {
        files,
        //signal: ac.signal,
        // onUploadProgress: ({ totalProgress }) => {
        //   progressBar.value = totalProgress;
        // },
      });
      console.log(res);

      for (const file of res) {
        ws.send(JSON.stringify({ type: "upload", id: file.key, url: file.ufsUrl, name: file.name }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      formRef.current.reset();
    }
  }

  // Handle asset click: add to canvas and broadcast
  function handleAssetClick(asset) {
    // Generate a unique ID for the new item
    const newId = `${asset.id}-${Date.now()}`;
    // Default position (center-ish)
    const x = 400;
    const y = 300;
    const newItem = {
      id: newId,
      type: "image",
      url: asset.url,
      x,
      y,
      name: asset.name,
    };
    // Locally add to items (for immediate feedback)
    items.value = [...items.value, newItem];
    // Send to server so all clients get it
    ws.send(JSON.stringify({ type: "add_item", item: newItem }));
  }

  return html`<div class="p-4 overflow-hidden flex flex-col">
    <h2 class="text-xl font-mono mb-4">Assets</h2>
    <form class="uppercase" ref=${formRef} onSubmit=${handleUpload}>
      <input class="font-mono uppercase cursor-pointer" type="file" ref=${fileInputRef} />
      <button class="cursor-pointer mt-4 mb-8 px-4 py-2 bg-red-500 text-white font-mono rounded hover:bg-white hover:text-red-500 border-2 border-red-500" type="submit">Upload</button>
    </form>
    <ul class="flex-1 overflow-auto">
      ${assets.value &&
      assets.value.map(
        (item) =>
          html`<li key=${item.id} class="mb-2 cursor-pointer" onClick=${() => handleAssetClick(item)}>
            <span class="font-mono text-xs uppercase">${item.name}</span><img src=${item.url} class="w-20" />
          </li>`,
      )}
    </ul>
    
  </div>`;
}

function App() {
  const [randomTitle, setRandomTitle] = useState("");

  useEffect(() => {
    setRandomTitle(generateRandomTitle());

    const intervalInMilliseconds = 0.1 * 60 * 1000; // 6 seconds
    const intervalId = setInterval(() => {
      setRandomTitle(generateRandomTitle());
    }, intervalInMilliseconds);

    // Clean up the interval when the component unmounts
    return () => clearInterval(intervalId);
  }, []); // Empty dependency array ensures this runs only once on mount

  return html`<main class="flex flex-col h-screen">
    <div id="header" class="flex items-center border-b-4 border-red-500">
      <div
        class="w-100 h-16 border-r-4 border-red-500 text-red-500 flex items-center justify-left font-mono text-2xl p-3"
      >
        ${randomTitle}
      </div>
      <div class="flex-1 h-16 flex items-center text-red-500 font-mono">
        <${TopicButton} roomId="all-dreams-become-memes" name="All Dreams Become Memes" />
        <${TopicButton} roomId="the-tools-we-never-asked-for" name="The Tools We Never Asked For" />
        <${TopicButton} roomId="command+c-is-for-collectivity" name="Command+C Is For Collectivity" />
      </div>
    </div>
    <div id="workbench" class="flex-1 flex items-stretch text-red-500">
      <div id="assets" class="w-100 border-r-4 border-red-500"><${AssetViewer} /></div>
      <div id="canvas" class="flex-1"><${Canvas} /></div>
    </div>
  </main> `;
}

render(html`<${App} />`, document.getElementById("root"));
