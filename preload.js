const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  addTodo: (text) => ipcRenderer.invoke("add-todo", text),
  getTodos: () => ipcRenderer.invoke("get-todos"),
  searchTodos: (query, startDate, endDate) =>
    ipcRenderer.invoke("search-todos", query, startDate, endDate),
  onInitializationError: (callback) =>
    ipcRenderer.on("initialization-error", (_event, errorMsg) =>
      callback(errorMsg)
    ),
  updateTodo: (id, text) => ipcRenderer.invoke("update-todo", id, text),
  deleteTodo: (id) => ipcRenderer.invoke("delete-todo", id),
  onInitializationSuccess: (callback) =>
    ipcRenderer.on("initialization-success", () => callback()),
  seedDemoData: () => ipcRenderer.invoke("seed-demo-data"),
});
