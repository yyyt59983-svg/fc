const { app, BrowserWindow } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

const { fork } = require('child_process');

let serverProcess;

function createWindow() {
  // Start the server
  serverProcess = fork(path.join(__dirname, '../server.js'));

  const win = new BrowserWindow({
    width: 450,
    height: 850,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    frame: false, // Tactical borderless look
    transparent: true,
    resizable: false,
    icon: path.join(__dirname, '../public/aegis-icon.png')
  });

  // Wait a moment for server to start, then load it
  setTimeout(() => {
    win.loadURL('http://localhost:3000');
  }, 1000);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
