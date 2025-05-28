# LanceDB Integration and CRUD in an Electron Todo App

This document details how LanceDB (`vectordb` npm package) is integrated into an Electron.js application to provide local vector storage and semantic search capabilities for a Todo list. It covers initialization, schema definition, and CRUD (Create, Read, Update, Delete) operations with code examples from the project.

## 1. Project Setup and Dependencies

The core dependencies for this functionality in `package.json` are:

```json
{
  "dependencies": {
    "@xenova/transformers": "^2.17.1", // For sentence embeddings
    "vectordb": "^0.5.0", // LanceDB Node.js client
    "@apache-arrow/es2015-esm": "15.0.0", // Apache Arrow for schema (ESM version)
    "nanoid": "^3.3.7", // For unique ID generation
    "electron": "^31.0.0" // Electron framework
    // ... other dependencies
  }
}
```

It's crucial that the Apache Arrow version (`@apache-arrow/es2015-esm`) is compatible with the one expected by `vectordb`.

## 2. Initialization (`main.js`)

All LanceDB operations and embedding generation occur in the Electron **main process** (`main.js`) to avoid blocking the renderer process (UI) and to manage resources centrally.

### 2.1. Importing Modules

Due to the ESM nature of `@xenova/transformers`, `vectordb`, and `@apache-arrow/es2015-esm`, dynamic `import()` is used within an `async` function:

```javascript
// main.js
let pipeline; // For Transformers.js
let lancedb; // For vectordb module
let arrow; // For Apache Arrow module
let nanoidFn; // For nanoid function

async function initializeApp() {
  try {
    console.log("Dynamically importing ESM modules...");
    const transformersModule = await import("@xenova/transformers");
    pipeline = transformersModule.pipeline; // or transformersModule.env (for model paths)

    const lancedbModule = await import("vectordb");
    lancedb = lancedbModule;

    const nanoidESMModule = await import("nanoid");
    nanoidFn = nanoidESMModule.nanoid;

    arrow = await import("@apache-arrow/es2015-esm");
    console.log("ESM modules imported successfully.");

    // ... rest of initialization
  } catch (error) {
    console.error("Failed to import ESM modules:", error);
    // Handle error (e.g., notify renderer)
  }
}
```

### 2.2. Initializing the Embedding Model

The `Xenova/all-MiniLM-L6-v2` model is used for generating sentence embeddings.

```javascript
// main.js (inside initializeApp)
let embedder;
const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";

// ... after importing modules ...
console.log("Initializing embedding pipeline...");
// Access the pipeline function correctly from the imported module
embedder = await pipeline("feature-extraction", EMBEDDING_MODEL);
console.log("Embedding pipeline initialized.");
```

A helper function is used to get embeddings:

```javascript
// main.js
const VECTOR_DIMENSION = 384; // Matches all-MiniLM-L6-v2 output

async function getEmbedding(text) {
  if (!embedder) {
    throw new Error("Embedding pipeline not initialized.");
  }
  const output = await embedder(text, { pooling: "mean", normalize: true });
  return Array.from(output.data); // Convert Float32Array to a plain array
}
```

### 2.3. Connecting to LanceDB and Table Creation

LanceDB is a serverless database, so "connecting" involves specifying a local directory path.

```javascript
// main.js (inside initializeApp)
const { app } = require("electron"); // To get userData path
const path = require("path");

let db; // LanceDB connection object
let table; // LanceDB table object

const DB_PATH = path.join(app.getPath("userData"), "todo_lancedb"); // e.g., %APPDATA%/your-app-name/todo_lancedb
const TABLE_NAME = "todos";

// ... after initializing embedder ...
console.log("Connecting to LanceDB...");
db = await lancedb.connect(DB_PATH);
console.log("Connected to LanceDB.");

const tableNames = await db.tableNames();
if (tableNames.includes(TABLE_NAME)) {
  console.log(`Opening existing table: ${TABLE_NAME}`);
  table = await db.openTable(TABLE_NAME);
} else {
  console.log(`Table ${TABLE_NAME} not found, creating new table...`);

  // Schema Definition (using Apache Arrow from the dynamically imported 'arrow' module)
  const tableFields = [
    new arrow.Field(
      "vector", // Name of the vector column
      new arrow.FixedSizeList(
        VECTOR_DIMENSION,
        new arrow.Field("item", new arrow.Float32())
      )
    ),
    new arrow.Field("text", new arrow.Utf8()), // Todo content
    new arrow.Field("id", new arrow.Utf8()), // Unique identifier
    new arrow.Field("timestamp", new arrow.TimestampMillisecond()), // Creation/update time
  ];
  // const tableSchema = new arrow.Schema(tableFields); // Schema object

  // Workaround: Create table with dummy data for schema inference
  // This was necessary due to issues passing a schema object directly in this setup.
  const dummyVector = new Array(VECTOR_DIMENSION).fill(0.0);
  const dummyData = [
    {
      id: "dummy_id_init", // Unique ID for the dummy record
      text: "dummy_text_init",
      vector: dummyVector,
      timestamp: Date.now(),
    },
  ];

  console.log(
    "Attempting to create table with dummy data for schema inference..."
  );
  table = await db.createTable(TABLE_NAME, dummyData); // Pass data directly
  console.log(
    `Table ${TABLE_NAME} created via schema inference from dummy data.`
  );

  // Delete the dummy data after table creation
  await table.delete('id = "dummy_id_init"');
  console.log("Dummy data deleted from the newly created table.");
}
console.log("LanceDB table ready.");
// Notify renderer that initialization is complete
if (mainWindow) {
  // Assuming mainWindow is your BrowserWindow instance
  mainWindow.webContents.send("initialization-success");
}
```

**Schema Explanation:**

- `vector`: Stores the sentence embedding. It's a `FixedSizeList` of `Float32` values, with the size matching `VECTOR_DIMENSION`.
- `text`: The actual todo string.
- `id`: A unique string ID (generated by `nanoid`) for each todo, used as a primary key for updates/deletes.
- `timestamp`: A millisecond timestamp for when the todo was created or last updated.

**Important Note on Table Creation:** The code uses a workaround for table creation by providing dummy data. In some environments or with different versions, providing a `schemaOverride` option with an `arrow.Schema` object to `db.createTable(TABLE_NAME, [], { schemaOverride: tableSchema })` might work, but it proved problematic in this specific Electron + ESM module setup. Schema inference from data is a reliable alternative.

## 3. Inter-Process Communication (IPC)

The renderer process (UI) cannot directly call Node.js or LanceDB functions. IPC is used:

- `preload.js` securely exposes functions to the renderer.
- `main.js` uses `ipcMain.handle` to listen for calls from the renderer and execute the corresponding logic.

### `preload.js` (Excerpt)

```javascript
// preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  addTodo: (text) => ipcRenderer.invoke("add-todo", text),
  getTodos: () => ipcRenderer.invoke("get-todos"),
  searchTodos: (query) => ipcRenderer.invoke("search-todos", query),
  updateTodo: (id, newText) => ipcRenderer.invoke("update-todo", id, newText),
  deleteTodo: (id) => ipcRenderer.invoke("delete-todo", id),
  onInitializationSuccess: (callback) =>
    ipcRenderer.on("initialization-success", () => callback()),
  // ... other listeners
});
```

### `renderer.js` (Calling an IPC function - Example)

```javascript
// renderer.js
// Example: Adding a new todo
addTodoBtn.addEventListener("click", async () => {
  const text = todoInput.value.trim();
  if (text) {
    const result = await window.electronAPI.addTodo(text); // Calls main process
    if (result.success && result.item) {
      addTodoToDOM(result.item); // Update UI
      todoInput.value = "";
    } else {
      alert(`Error adding todo: ${result.error || "Unknown error"}`);
    }
  }
});
```

## 4. CRUD Operations (`main.js` IPC Handlers)

### 4.1. Create (Add Todo)

```javascript
// main.js
ipcMain.handle("add-todo", async (event, todoText) => {
  if (!table || !embedder) {
    return { success: false, error: "Database or embedder not initialized." };
  }
  try {
    const vector = await getEmbedding(todoText); // Generate embedding
    const todoId = nanoidFn(); // Generate unique ID
    const todoItem = {
      id: todoId,
      text: todoText,
      vector: vector,
      timestamp: Date.now(),
    };
    await table.add([todoItem]); // Add to LanceDB table
    return {
      success: true,
      item: {
        // Return only serializable parts needed by renderer
        id: todoItem.id,
        text: todoItem.text,
        timestamp: todoItem.timestamp,
      },
    };
  } catch (error) {
    console.error("Error adding todo:", error);
    return { success: false, error: error.message };
  }
});
```

- Generates an embedding for the `todoText`.
- Creates a `todoItem` object matching the table schema.
- Uses `table.add([todoItem])` to insert the new record. LanceDB expects an array of records.

### 4.2. Read (Get Todos)

To retrieve todos (e.g., for initial display):

```javascript
// main.js
ipcMain.handle("get-todos", async () => {
  if (!table) {
    return { success: false, error: "Database not initialized.", todos: [] };
  }
  try {
    // Use .search() without a query vector, then .select() and .limit()
    const results = await table
      .search()
      .limit(500) // Arbitrary limit, adjust as needed
      .select(["id", "text", "timestamp"]) // Select specific columns
      .execute(); // Execute the query

    const todos = results
      .map((r) => ({ id: r.id, text: r.text, timestamp: r.timestamp }))
      .sort((a, b) => b.timestamp - a.timestamp); // Sort by newest first
    return { success: true, todos };
  } catch (error) {
    console.error("Error getting todos:", error);
    return { success: false, error: error.message, todos: [] };
  }
});
```

- Uses `table.search()` without a specific query vector.
- `.select([...])` specifies which columns to retrieve.
- `.limit()` restricts the number of results.
- `.execute()` runs the constructed query.
- The results are then mapped and sorted before being sent to the renderer.

### 4.3. Read (Semantic Search Todos)

This is the core vector search functionality:

```javascript
// main.js
ipcMain.handle("search-todos", async (event, query) => {
  if (!table || !embedder) {
    return {
      success: false,
      error: "Database or embedder not initialized.",
      results: [],
    };
  }
  if (!query || query.trim() === "") {
    return { success: true, results: [] }; // Return empty if query is blank
  }
  try {
    const queryVector = await getEmbedding(query); // Embed the search query

    const searchResultsRaw = await table
      .search(queryVector) // Pass the query vector to search
      .limit(10) // Get top N similar results
      .select(["id", "text", "timestamp"]) // Select columns
      .execute();

    const searchResults = searchResultsRaw.map((r) => ({
      id: r.id,
      text: r.text,
      timestamp: r.timestamp,
      score: r._distance, // LanceDB returns similarity score as _distance (e.g., L2 or cosine)
    }));
    return { success: true, results: searchResults };
  } catch (error) {
    console.error("Error searching todos:", error);
    return { success: false, error: error.message, results: [] };
  }
});
```

- The `query` string is first converted into a `queryVector`.
- `table.search(queryVector)` performs the similarity search against the `vector` column in the table.
- `_distance` in the results indicates the similarity (lower is often better for distance metrics).

### 4.4. Update (Edit Todo)

Vector databases often treat records as immutable. A common pattern for updates is to delete the old record and add a new one with the same ID but updated content.

```javascript
// main.js
ipcMain.handle("update-todo", async (event, todoId, newText) => {
  if (!table || !embedder) {
    return { success: false, error: "Database or embedder not initialized." };
  }
  try {
    const newVector = await getEmbedding(newText); // New embedding for updated text
    const newTimestamp = Date.now();

    // Data for the "new" item, retaining the original ID
    const updatedTodoItemData = {
      id: todoId,
      text: newText,
      vector: newVector,
      timestamp: newTimestamp,
    };

    // 1. Delete the old todo item by its ID
    // The filter string syntax depends on LanceDB's SQL-like capabilities.
    await table.delete(`id = "${todoId}"`);
    console.log(`Deleted old todo with id: ${todoId} for update.`);

    // 2. Add the updated todo item (as a new record with the same ID)
    await table.add([updatedTodoItemData]);
    console.log(`Added updated todo with id: ${todoId}`);

    return {
      success: true,
      item: {
        id: todoId,
        text: newText,
        timestamp: newTimestamp,
      },
    };
  } catch (error) {
    console.error(`Error updating todo ${todoId}:`, error);
    return { success: false, error: error.message };
  }
});
```

- A new embedding is generated for `newText`.
- The old record is deleted using `table.delete(filterString)`. The filter string `id = "${todoId}"` targets the specific todo.
- A new record with the `updatedTodoItemData` (including the original `todoId`) is added.

### 4.5. Delete (Remove Todo)

```javascript
// main.js
ipcMain.handle("delete-todo", async (event, todoId) => {
  if (!table) {
    return { success: false, error: "Database not initialized." };
  }
  try {
    await table.delete(`id = "${todoId}"`); // Delete using a filter string
    console.log(`Deleted todo with id: ${todoId}`);
    return { success: true, id: todoId }; // Return ID for UI update
  } catch (error)
    console.error(`Error deleting todo ${todoId}:`, error);
    return { success: false, error: error.message };
  }
});
```

- `table.delete(filterString)` is used to remove the todo item matching the `todoId`.

## 5. Renderer Process (`renderer.js`)

The renderer process handles the UI logic:

- Listens for user actions (button clicks, input).
- Calls the appropriate `window.electronAPI` functions (exposed via `preload.js`).
- Receives results from the main process and updates the DOM to display todos, search results, or status messages.
- Manages the UI state for editing (e.g., switching button visibility, populating input fields).

Example: Displaying fetched todos:

```javascript
// renderer.js
async function fetchTodos() {
  // ... (status updates and checks) ...
  const result = await window.electronAPI.getTodos();
  if (result.success) {
    todoList.innerHTML = ""; // Clear existing list
    if (result.todos && result.todos.length > 0) {
      result.todos.forEach((todo) => addTodoToDOM(todo, false)); // Add each todo to the DOM
      // ...
    }
    // ...
  }
  // ...
}

function addTodoToDOM(todo, isSearchResult = false) {
  // Creates <li> element with todo text, timestamp, edit/delete buttons
  // Appends it to the appropriate list (todoList or searchResultsList)
  // ... (DOM creation logic as shown in previous responses) ...
}
```

## Conclusion

This detailed breakdown illustrates how to integrate LanceDB into an Electron application for local vector storage and semantic search. Key aspects include:

- Using dynamic `import()` for ESM dependencies in the main process.
- Proper initialization of the embedding model and LanceDB connection.
- Schema definition and table creation (with a workaround for schema inference).
- Implementing CRUD operations via IPC, with LanceDB's `add`, `search`, and `delete` methods.
- Handling UI updates in the renderer process based on data received from the main process.

This structure provides a solid foundation for building more complex AI-powered desktop applications with Electron and LanceDB.

```

```
