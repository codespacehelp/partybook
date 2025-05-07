import PartySocket from "https://esm.sh/partysocket";

const cursors = new Map();

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
    console.log(message);
    const cursorEl = cursors.get(message.id);
    cursorEl.style.left = `${message.x}px`;
    cursorEl.style.top = `${message.y}px`;
  }
});

ws.reconnect();

document.querySelector("#test-send").addEventListener("click", () => {
  ws.send("hello!");
});

window.addEventListener("mousemove", (e) => {
  ws.send(
    JSON.stringify({ type: "cursor", id: ws.id, x: e.clientX, y: e.clientY }),
  );
});
