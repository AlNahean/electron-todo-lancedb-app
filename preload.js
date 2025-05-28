const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  addTodo: (text) => ipcRenderer.invoke("add-todo", text),
  getTodos: () => ipcRenderer.invoke("get-todos"),
  searchTodos: (query) => ipcRenderer.invoke("search-todos", query),
  onInitializationError: (callback) =>
    ipcRenderer.on("initialization-error", (_event, errorMsg) =>
      callback(errorMsg)
    ),
});
