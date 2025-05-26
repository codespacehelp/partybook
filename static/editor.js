import PartySocket from "https://esm.sh/partysocket";
import { h, render } from "preact";
import { useState, useEffect, useRef, useMemo } from "preact/hooks";
import htm from "htm";
const html = htm.bind(h);

function App() {
  const [items, setItems] = useState([]);
  const [cursors, setCursors] = useState([]);
  const [selection, setSelection] = useState([]); // List of selected IDs
  const startMousePositionRef = useRef();
  const startItemPositionsRef = useRef();
  const wsRef = useRef();

  function getSelectedItems() {
    return selection.map((id) => items.find((it) => it.id === id));
  }

  useEffect(() => {
    // Run this only once at the start.

    // Initialize PartySocket
    wsRef.current = new PartySocket({
      // host: "project-name.username.partykit.dev",
      host: "localhost:1999",
      room: "test",
      // id: "sera"
    });

    // Listen to messages
    wsRef.current.addEventListener("message", (e) => {
      const message = JSON.parse(e.data);
      if (message.type === "initial_items") {
        setItems(message.items);
        console.log(message.items);
      } else if (message.type === "initial_cursors") {
        setCursors(message.cursors);
        console.log(message.cursors);
      } else if (message.type === "connect") {
      } else if (message.type === "disconnect") {
      } else if (message.type === "cursor") {
        setCursors((prevCursors) => {
          const newCursors = structuredClone(prevCursors);
          let newCursor = newCursors.find((c) => c.id === message.id);
          if (!newCursor) {
            newCursor = { id: message.id, x: 0, y: 0 };
            newCursors.push(newCursor);
          }
          newCursor.x = message.x;
          newCursor.y = message.y;
          return newCursors;
        });
      } else if (message.type === "item_move") {
        setItems((prevItems) => {
          const newItems = structuredClone(prevItems);
          const item = newItems.find((it) => it.id === message.id);
          if (item) {
            item.x = message.x;
            item.y = message.y;
          }
          return newItems;
        });
      }
    });

    // Start the connection
    wsRef.current.reconnect();

    // Listen to mouse move events
    window.addEventListener("mousemove", (e) => {
      wsRef.current.send(JSON.stringify({ type: "cursor", id: wsRef.current.id, x: e.clientX, y: e.clientY }));
    });
  }, []);

  function handleItemMouseDown(event, item) {
    setSelection([item.id]);
    startMousePositionRef.current = { x: event.clientX, y: event.clientY };
    startItemPositionsRef.current = [{ id: item.id, x: item.x, y: item.y }];
    console.log(startMousePositionRef.current, startItemPositionsRef.current);
  }

  function handleItemMouseDrag(event) {
    const startX = startMousePositionRef.current.x;
    const startY = startMousePositionRef.current.y;
    const currentX = event.clientX;
    const currentY = event.clientY;
    const deltaX = currentX - startX;
    const deltaY = currentY - startY;

    setItems((prevItems) => {
      const newItems = structuredClone(prevItems);
      for (const item of newItems) {
        if (selection.includes(item.id)) {
          const startPosition = startItemPositionsRef.current.find((pos) => pos.id === item.id);
          if (startPosition) {
            item.x = startPosition.x + deltaX;
            item.y = startPosition.y + deltaY;
            // Tell PartyKit the item has moved.
            wsRef.current.send(JSON.stringify({ type: "item_move", id: item.id, x: item.x, y: item.y }));
          }
        }
      }
      return newItems;
    });
  }

  return html`<svg width="800" height="600" viewBox="0 0 800 600">
    ${items.map((item) => {
      if (item.type === "image") {
        return html`<${ImageItem}
          item=${item}
          handleItemMouseDown=${handleItemMouseDown}
          handleItemMouseDrag=${handleItemMouseDrag}
        />`;
      }
    })}
  </svg>`;
}

function ImageItem({ item, handleItemMouseDown, handleItemMouseDrag }) {
  function handleMouseDown(event) {
    handleItemMouseDown(event, item);
    window.addEventListener("mousemove", handleMouseDrag);
    window.addEventListener("mouseup", handleMouseUp);
  }

  function handleMouseDrag(event) {
    // const newX = item.x + e.movementX;
    // const newY = item.y + e.movementY;
    // console.log(newX, newY);
    handleItemMouseDrag(event);
  }

  function handleMouseUp() {
    window.removeEventListener("mousemove", handleMouseDrag);
    window.removeEventListener("mouseup", handleMouseUp);
  }

  return html`<image x=${item.x} y=${item.y} href=${item.url} onMouseDown=${handleMouseDown} />`;
}

render(html`<${App} />`, document.getElementById("root"));
