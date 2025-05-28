const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  addTodo: (text) => ipcRenderer.invoke("add-todo", text),
  getTodos: () => ipcRenderer.invoke("get-todos"),
  searchTodos: (query) => ipcRenderer.invoke("search-todos", query),
  onInitializationError: (callback) =>
    ipcRenderer.on("initialization-error", (_event, errorMsg) =>
      callback(errorMsg)
    ),
  updateTodo: (id, newText) => ipcRenderer.invoke("update-todo", id, newText),
  deleteTodo: (id) => ipcRenderer.invoke("delete-todo", id),
  onInitializationSuccess: (callback) =>
    ipcRenderer.on("initialization-success", () => callback()),
});
