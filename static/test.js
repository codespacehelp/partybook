import PartySocket from "https://esm.sh/partysocket";

const cursors = new Map();
const itemMap = new Map();
const svgEl = document.querySelector("svg#canvas");
let activeItemId = null;

const ws = new PartySocket({
  // host: "project-name.username.partykit.dev",
  host: "localhost:1999",
  room: "test",
  // id: "sera"
});

ws.addEventListener("message", (e) => {
  const message = JSON.parse(e.data);
  if (message.type === "connect") {
    const cursorEl = document.createElement("div");
    cursorEl.className = "cursor";
    cursorEl.textContent = message.id;
    document.querySelector("#cursors").appendChild(cursorEl);
    cursors.set(message.id, cursorEl);
  } else if (message.type === "disconnect") {
    const cursorEl = cursors.get(message.id);
    document.querySelector("#cursors").removeChild(cursorEl);
    cursors.delete(message.id);
  } else if (message.type === "cursor") {
    // console.log(message);
    const cursorEl = cursors.get(message.id);
    cursorEl.style.left = `${message.x}px`;
    cursorEl.style.top = `${message.y}px`;
  } else if (message.type === "initial_items") {
    createOrUpdateItems(message.items);
  } else if (message.type === "item_move") {
    console.log(message);
    const itemEl = itemMap.get(message.itemId);
    itemEl.setAttribute("x", message.x);
    itemEl.setAttribute("y", message.y);

    // createOrUpdateItems(message.items);
  }
});

ws.reconnect();

document.querySelector("#test-send").addEventListener("click", () => {
  ws.send("hello!");
});

window.addEventListener("mousemove", (e) => {
  ws.send(JSON.stringify({ type: "cursor", id: ws.id, x: e.clientX, y: e.clientY }));
});

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
