import { app, BrowserWindow } from 'electron';

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1200, height: 800 });
  void win.loadURL('about:blank');
});
