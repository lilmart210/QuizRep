import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { dialog } from 'electron'
import * as fs from 'fs'

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.js
// │
process.env.DIST = path.join(__dirname, '../dist')
process.env.PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')


let win: BrowserWindow | null
// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      devTools : true
    },
    autoHideMenuBar : true
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(process.env.DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  win = null
})

app.whenReady().then(createWindow)

ipcMain.handle('ShowDialog',async (e,msg)=>{
  if(!win) return;

  const {canceled,filePaths} = await dialog.showOpenDialog(
    win,
    {
      defaultPath : msg,
      properties : [
        'openDirectory'
      ]
    }
  )
  if(!canceled) return filePaths[0]
  return null;
})

ipcMain.handle('ListDirectory',(e,dir)=>{
  const allf = fs.readdirSync(dir,{encoding : 'utf-8',withFileTypes : true,})

  const files = allf.filter(itm=>itm.isFile())
  
  return files;
})

ipcMain.handle('ReadFile',(e,path)=>{
  const conts = fs.readFileSync(path,{encoding : 'utf-8'})
  return conts;
})