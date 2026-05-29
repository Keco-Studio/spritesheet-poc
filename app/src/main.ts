import { Engine, Color } from "excalibur";

const game = new Engine({
  canvasElementId: "game",
  width: 800,
  height: 600,
  backgroundColor: Color.fromHex("#0c0c0c"),
  antialiasing: false,
  pixelArt: true,
});
await game.start();
console.log("editor booted");
