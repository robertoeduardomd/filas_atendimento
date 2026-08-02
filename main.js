const { app, BrowserWindow } = require("electron");
const path = require("path");

function createWindow() {
 const mainWindow = new BrowserWindow({
    width: 680,  // Mais largo para caber as 3 filas lado a lado
    height: 320, // Mais baixo/compacto
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile("index.html");
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.stop(); // Ou app.quit()
  }
});
