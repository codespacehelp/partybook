import PartySocket from "https://esm.sh/partysocket";
import { h, render } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import htm from "htm";
const html = htm.bind(h);

const cursors = new Map();
let items = [];
const svgEl = document.querySelector("svg#canvas");
let activeItemId = null;

function App() {
  const [items, setItems] = useState([]);
  const [cursors, setCursors] = useState([]);

  useEffect(() => {
    // Run this only once at the start.

    // Initialize PartySocket
    const ws = new PartySocket({
      // host: "project-name.username.partykit.dev",
      host: "localhost:1999",
      room: "test",
      // id: "sera"
    });

    // Listen to messages
    ws.addEventListener("message", (e) => {
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
        const newCursors = structuredClone(cursors);
        const newCursor = newCursors.find((c) => c.id === message.id);
        newCursor.x = message.x;
        newCursor.y = message.y;
        setCursors(newCursors);
      } else if (message.type === "item_move") {
        const newItems = structuredClone(items);
        const item = newItems.find((it) => it.id === message.id);
        item.x = message.x;
        item.y = message.y;
        setItems(newItems);
      }
    });

    // Start the connection
    ws.reconnect();

    // Listen to mouse move events
    window.addEventListener("mousemove", (e) => {
      ws.send(JSON.stringify({ type: "cursor", id: ws.id, x: e.clientX, y: e.clientY }));
    });
  }, []);

  function handleUpdateItem(item) {
    const newItems = structuredClone(items);
    const idx = newItems.findIndex((it) => it.id === item.id);
    newItems[idx] = item;
    setItems(newItems);
  }

  return html`<svg width="800" height="600" viewBox="0 0 800 600">
    ${items.map((item) => {
      if (item.type === "image") {
        return html`<${ImageItem} item=${item} handleUpdateItem=${handleUpdateItem} />`;
      }
    })}
  </svg>`;
}

function ImageItem({ item, handleUpdateItem }) {
  // const startPosition = useRef({ x: 0, y: 0 });

  function handleMouseDown() {
    // originalPosition.current = { x: item.x, y: item.y };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  function handleMouseMove(e) {
    const newX = item.x + e.movementX;
    const newY = item.y + e.movementY;
    console.log(newX, newY);
    handleUpdateItem({ ...item, x: newX, y: newY });
  }

  function handleMouseUp() {
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
  }

  return html`<image x=${item.x} y=${item.y} href=${item.url} onMouseDown=${handleMouseDown} />`;
}

// document.querySelector("#test-send").addEventListener("click", () => {
//   ws.send("hello!");
// });

function createOrUpdateItems(items) {
  svgEl.innerHTML = "";
  for (const item of items) {
    if (item.type === "image") {
      const imageEl = document.createElementNS("http://www.w3.org/2000/svg", "image");
      imageEl.dataset.itemId = item.id;
      imageEl.setAttribute("x", item.x);
      imageEl.setAttribute("y", item.y);
      imageEl.setAttribute("href", item.url);
      // imageEl.setAttribute("transform", "scale(0.2)");
      imageEl.addEventListener("mousedown", handleItemMouseDown);
      itemMap.set(item.id, imageEl);
      svgEl.appendChild(imageEl);
    }
  }
}

function handleItemMouseDown(e) {
  // console.log(e);
  activeItemId = e.target.dataset.itemId;

  window.addEventListener("mousemove", handleItemMouseMove);
  window.addEventListener("mouseup", handleItemMouseUp);
}

function handleItemMouseMove(e) {
  const imageEl = itemMap.get(activeItemId);
  console.log(imageEl.getAttribute("x"), imageEl.getAttribute("y"));
  const oldX = parseInt(imageEl.getAttribute("x"));
  const oldY = parseInt(imageEl.getAttribute("y"));
  const newX = oldX + e.movementX;
  const newY = oldY + e.movementY;
  imageEl.setAttribute("x", newX);
  imageEl.setAttribute("y", newY);
  ws.send(JSON.stringify({ type: "item_move", id: ws.id, itemId: activeItemId, x: newX, y: newY }));
}

function handleItemMouseUp(e) {
  window.removeEventListener("mousemove", handleItemMouseMove);
  window.removeEventListener("mouseup", handleItemMouseUp);
  activeItemId = null;
}

render(html`<${App} />`, document.getElementById("root"));
