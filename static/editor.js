import PartySocket from "partysocket";
import { h, render } from "preact";
import { useEffect, useRef, useState, useCallback } from "preact/hooks";
import htm from "htm";
import { signal, computed } from "@preact/signals";
import clsx from "clsx";
import { generateMimeTypes, generatePermittedFileTypes, genUploader } from "uploadthing/client";

const html = htm.bind(h);

const BASE_URL = "http://localhost:3000";

// Uploader for assets (existing)
export const { uploadFiles: uploadAssetFiles, createUpload: createAssetUpload } = genUploader({
  url: BASE_URL,
  package: "vanilla",
});

// NEW: Uploader for saved canvas images (assuming a different Uploadthing endpoint/router for this)
export const { uploadFiles: uploadCanvasFiles, createUpload: createCanvasUpload } = genUploader({
  url: BASE_URL,
  package: "vanilla",
});


const currentRoomId = signal("all-dreams-become-memes"); // Default room ID
const items = signal([]);
const cursors = signal([]);
const selection = signal([]);
const assets = signal([]);

const UPLOADTHING_API_KEY = ""; // Keep this as an empty string as per instructions

// --- Title Generator Logic ---
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
let ws = null; // This will hold the PartySocket instance

function Canvas() {
  const svgRef = useRef(null);
  const startMousePositionRef = useRef(null); // Stores SVG coordinates of mouse start
  const startItemPositionsRef = useRef(null); // Stores SVG coordinates of item start

  // Using a ref for ws to ensure useCallback has a stable reference to the latest ws instance
  const wsRef = useRef(null);

  // State to manage loading feedback for saving
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    console.log("Opening WebSocket connection to room:", currentRoomId.value);

    // Close existing connection if switching rooms
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }

    const newWs = new PartySocket({
      host: "localhost:1999",
      room: currentRoomId.value,
    });

    wsRef.current = newWs; // Store the new websocket instance in the ref
    ws = newWs; // Also update the global 'let ws' for other parts of the app

    newWs.addEventListener("message", (e) => {
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
        case "delete_item": // New case for deleting items
          items.value = items.value.filter((item) => item.id !== message.id);
          break;
        case "clear_canvas": // Handle clear_canvas message
          items.value = []; // Clear all items locally
          break;
      }
    });

    const handleMouseMove = (e) => {
      const svg = svgRef.current;
      if (!svg) return;

      const CTM = svg.getScreenCTM();
      if (!CTM) return;

      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;

      const svgP = pt.matrixTransform(CTM.inverse());

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "cursor", id: wsRef.current.id, x: svgP.x, y: svgP.y }));
      }
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      console.log("Closing WebSocket connection");
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [currentRoomId.value]);

  const handleItemMouseDrag = useCallback((event) => {
    if (!startMousePositionRef.current || !startItemPositionsRef.current) {
        console.warn("Drag cancelled: start position refs are null or undefined.");
        window.removeEventListener("mousemove", handleItemMouseDrag);
        window.removeEventListener("mouseup", handleItemMouseUp);
        return;
    }

    const svg = svgRef.current;
    if (!svg) {
        console.warn("Drag cancelled: SVG ref is null.");
        window.removeEventListener("mousemove", handleItemMouseDrag);
        window.removeEventListener("mouseup", handleItemMouseUp);
        return;
    }
    const CTM = svg.getScreenCTM();
    if (!CTM) {
        console.warn("Drag cancelled: CTM is null.");
        window.removeEventListener("mousemove", handleItemMouseDrag);
        window.removeEventListener("mouseup", handleItemMouseUp);
        return;
    }

    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const currentSvgP = pt.matrixTransform(CTM.inverse()); // Current mouse position in SVG coords

    const startX = startMousePositionRef.current.x;
    const startY = startMousePositionRef.current.y;
    const deltaX = currentSvgP.x - startX; // Delta in SVG coords
    const deltaY = currentSvgP.y - startY; // Delta in SVG coords

    const newItems = [...items.value];
    let itemsMoved = false;
    for (const item of newItems) {
      if (selection.value.includes(item.id)) {
        const startPos = startItemPositionsRef.current.find((pos) => pos.id === item.id);
        if (startPos) {
          item.x = startPos.x + deltaX;
          item.y = startPos.y + deltaY;
          itemsMoved = true;
        }
      }
    }
    if (itemsMoved) {
      items.value = newItems;
    }


    selectedItems.value.forEach((item) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "item_move", id: item.id, x: item.x, y: item.y }));
      }
    });
  }, [items.value, selection.value, selectedItems.value, svgRef, wsRef]);


  const handleItemMouseUp = useCallback(() => {
    console.log("handleItemMouseUp triggered");
    window.removeEventListener("mousemove", handleItemMouseDrag);
    window.removeEventListener("mouseup", handleItemMouseUp);
    startMousePositionRef.current = null;
    startItemPositionsRef.current = null;
  }, [handleItemMouseDrag]);


  function handleItemMouseDown(event, item) {
    console.log("handleItemMouseDown triggered for item:", item.id);
    if (event.detail === 1) {
      const svg = svgRef.current;
      if (!svg) {
        console.error("handleItemMouseDown: SVG ref is null.");
        return;
      }
      const CTM = svg.getScreenCTM();
      if (!CTM) {
        console.error("handleItemMouseDown: CTM is null.");
        return;
      }

      const pt = svg.createSVGPoint();
      pt.x = event.clientX;
      pt.y = event.clientY;
      const svgP = pt.matrixTransform(CTM.inverse());

      startMousePositionRef.current = { x: svgP.x, y: svgP.y };
      startItemPositionsRef.current = [{ id: item.id, x: item.x, y: item.y }];
      selection.value = [item.id];

      console.log("Attaching mousemove/mouseup listeners.");
      window.addEventListener("mousemove", handleItemMouseDrag);
      window.addEventListener("mouseup", handleItemMouseUp);
    }
  }

  function handleDeleteItem(itemId) {
    items.value = items.value.filter((item) => item.id !== itemId);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "delete_item", id: itemId }));
    }
  }

  function handleClearCanvas() {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "clear_canvas" }));
    }
    items.value = [];
  }

  // NEW: Function to save the canvas as an image
  async function handleSaveCanvas() {
    setIsSaving(true);
    setSaveMessage("Saving canvas...");
    const svgElement = svgRef.current;
    if (!svgElement) {
      setSaveMessage("Error: Canvas not found.");
      setIsSaving(false);
      return;
    }

    try {
      // Create a temporary clone of the SVG to manipulate (e.g., inline images)
      const clonedSvg = svgElement.cloneNode(true);

      // Important: Fetch and inline external images to avoid CORS issues when drawing to canvas.
      // This is necessary because canvas.toDataURL will "taint" the canvas if it draws cross-origin images.
      const imageElements = Array.from(clonedSvg.querySelectorAll('image'));
      const promises = imageElements.map(async (img) => {
        const href = img.getAttribute('href');
        if (href && !href.startsWith('data:')) {
          try {
            const response = await fetch(href);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const blob = await response.blob();
            return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                img.setAttribute('href', reader.result); // Replace original href with data URL
                resolve();
              };
              reader.readAsDataURL(blob);
            });
          } catch (error) {
            console.error('Error inlining image:', href, error);
            // Optionally, replace with a placeholder or remove the image if it fails
            img.remove();
          }
        }
      });

      await Promise.all(promises); // Wait for all images to be inlined

      // Get the serialized SVG XML string
      const svgData = new XMLSerializer().serializeToString(clonedSvg);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        // Set canvas dimensions to match SVG viewBox for clear output
        canvas.width = svgElement.viewBox.baseVal.width || 800;
        canvas.height = svgElement.viewBox.baseVal.height || 600;
        const ctx = canvas.getContext('2d');

        // Add white background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw the SVG image onto the canvas
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url); // Clean up the object URL

        // Convert canvas to Blob (e.g., PNG)
        canvas.toBlob(async (blob) => {
          if (blob) {
            const fileName = `canvas-snapshot-${Date.now()}.png`;
            const file = new File([blob], fileName, { type: 'image/png' });

            try {
              // Assuming 'canvasSaver' is the route in your Uploadthing config for saving canvases
              const res = await uploadCanvasFiles((routeRegistry) => routeRegistry.canvasSaver, {
                files: [file],
                onUploadProgress: ({ totalProgress }) => {
                  setSaveMessage(`Uploading: ${totalProgress}%`);
                },
              });
              console.log("Canvas saved to Uploadthing:", res);
              setSaveMessage("Canvas saved successfully!");
            } catch (uploadError) {
              console.error("Error uploading canvas to Uploadthing:", uploadError);
              setSaveMessage(`Error uploading: ${uploadError.message}`);
            }
          } else {
            setSaveMessage("Error: Could not convert canvas to image.");
          }
          setIsSaving(false);
          setTimeout(() => setSaveMessage(""), 3000); // Clear message after a few seconds
        }, 'image/png');
      };
      img.onerror = (error) => {
        URL.revokeObjectURL(url);
        console.error("Error loading SVG image for canvas conversion:", error);
        setSaveMessage("Error converting SVG to image.");
        setIsSaving(false);
        setTimeout(() => setSaveMessage(""), 3000);
      };
      img.src = url;

    } catch (error) {
      console.error("Error during canvas save process:", error);
      setSaveMessage(`Error: ${error.message}`);
      setIsSaving(false);
      setTimeout(() => setSaveMessage(""), 3000);
    }
  }


  // --- Render (Access .value to use signals) ---
  return html`<div class="relative w-full h-full">
    <svg width="100%" height="100%" viewBox="0 0 800 600" ref=${svgRef} class="cursor-none">
    ${items.value.map((item) => {
      if (item.type === "image") {
        return html`<${ImageItem}
          key=${item.id}
          item=${item}
          handleItemMouseDown=${handleItemMouseDown}
          handleItemMouseDrag=${handleItemMouseDrag}
          handleDeleteItem=${handleDeleteItem} // Pass the new handler
        />`;
      }
    })}
    ${cursors.value.map(
      (cursor) =>
        html`<circle
          cx=${cursor.x}
          cy=${cursor.y}
          r="10"
          fill=${cursor.color}
          class="pointer-events-none"
        />`,
    )}
    </svg>
    <div class="absolute bottom-4 right-4 flex flex-col items-end space-y-2">
      <button
        class="px-4 py-2 bg-red-500 text-white font-mono rounded hover:bg-white hover:text-red-500 border-2 border-red-500 uppercase"
        onClick=${handleSaveCanvas}
        disabled=${isSaving}
      >
        ${isSaving ? 'Saving...' : 'Save Canvas'}
      </button>
      <button
        class="px-4 py-2 bg-red-500 text-white font-mono rounded hover:bg-white hover:text-red-500 border-2 border-red-500 uppercase"
        onClick=${handleClearCanvas}
      >
        Clear Canvas
      </button>
      ${saveMessage && html`<div class="text-red-500 font-mono text-sm">${saveMessage}</div>`}
    </div>
  </div>`;
}

function ImageItem({ item, handleItemMouseDown, handleItemMouseDrag, handleDeleteItem }) {
  function handleMouseDown(event) {
    handleItemMouseDown(event, item);
  }

  function handleDoubleClick(event) {
    event.stopPropagation(); // Prevent canvas drag from triggering
    handleDeleteItem(item.id);
  }

  return html`<image
    x=${item.x}
    y=${item.y}
    href=${item.url}
    onMouseDown=${handleMouseDown}
    onDblClick=${handleDoubleClick}
    class="select-none" />`;
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

  // Handle file upload for assets
  async function handleUpload(e) {
    e.preventDefault();
    const fileInput = fileInputRef.current;
    console.log(fileInput);
    const files = Array.from(fileInput.files || []);
    console.log(files);
    try {
      const res = await uploadAssetFiles((routeRegistry) => routeRegistry.imageUploader, { // Changed to uploadAssetFiles
        files,
        //signal: ac.signal,
        // onUploadProgress: ({ totalProgress }) => {
        //   progressBar.value = totalProgress;
        // },
      });
      console.log(res);

      for (const file of res) {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "upload", id: file.key, url: file.ufsUrl, name: file.name }));
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      formRef.current.reset();
    }
  }

  // Handle asset click: add to canvas and broadcast
  function handleAssetClick(asset) {
    const newId = `${asset.id}-${Date.now()}`;
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
    items.value = [...items.value, newItem];
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "add_item", item: newItem }));
    }
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

    return () => clearInterval(intervalId);
  }, []);

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
