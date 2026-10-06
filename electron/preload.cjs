const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isDesktop: true,
});
