import PartySocket from "partysocket";
import { h, render } from "preact";
import { useEffect, useRef } from "preact/hooks";
import htm from "htm";
import { signal, computed } from "@preact/signals";

const html = htm.bind(h);

const items = signal([]);
const cursors = signal([]);
const selection = signal([]);

// --- Actions (Mutate Signals Directly) ---
function getRandomColor() {
  const letters = "0123456789ABCDEF";
  let color = "#";
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

function updateCursor(id, x, y) {
  const newCursors = [...cursors.value]; // Create a new array to trigger update
  let cursor = newCursors.find((c) => c.id === id);
  if (!cursor) {
    cursor = { id, x, y, color: getRandomColor() };
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

// --- Computed Signal (For Derived State) ---
const selectedItems = computed(() =>
  selection.value.map((id) => items.value.find((it) => it.id === id)).filter(Boolean),
);

// WebSocket instance outside of components
let ws = null;

function App() {
  const startMousePositionRef = useRef();
  const startItemPositionsRef = useRef();

  useEffect(() => {
    ws = new PartySocket({
      host: "localhost:1999",
      room: "test",
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
      ws.close();
    };
  }, []);

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

  // --- Render (Access .value to use signals) ---
  // Preact automatically subscribes and re-renders when signals change
  return html`<svg width="800" height="600" viewBox="0 0 800 600">
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
    ${cursors.value.map((cursor) => html`<circle cx=${cursor.x} cy=${cursor.y} r="10" fill=${cursor.color} />`)}
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

  return html`<image x=${item.x} y=${item.y} href=${item.url} onMouseDown=${handleMouseDown} />`;
}

render(html`<${App} />`, document.getElementById("root"));
