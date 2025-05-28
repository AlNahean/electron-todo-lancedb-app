# Electron Todo App with Semantic Search (LanceDB)

This is a simple desktop Todo List application built with Electron.js. It features standard CRUD (Create, Read, Update, Delete) operations for todos and leverages **LanceDB** for local vector storage, enabling semantic search capabilities. This means you can search for todos based on their meaning rather than just keyword matching.

## Features

- **Add Todos:** Quickly add new tasks to your list.
- **View Todos:** See all your current tasks, sorted by the most recently added/updated.
- **Edit Todos:** Modify the text of existing tasks.
- **Delete Todos:** Remove tasks you no longer need.
- **Semantic Search:** Find todos that are semantically similar to your search query, powered by sentence embeddings and LanceDB's vector search.
- **Local Data Storage:** All todo data and embeddings are stored locally using LanceDB, ensuring privacy and offline access.
- **Cross-Platform:** Being an Electron app, it can be packaged for Windows, macOS, and Linux.

## Core Technologies

- **Electron.js:** Framework for building cross-platform desktop applications using web technologies (HTML, CSS, JavaScript).
- **LanceDB (`vectordb` npm package):** An open-source, serverless vector database designed for AI/ML applications. Used here for storing todo text embeddings and performing efficient similarity searches.
- **Transformers.js (`@xenova/transformers`):** A JavaScript library for running 🤗 Transformers models directly in Node.js or the browser. Used here to generate sentence embeddings for semantic search using the `Xenova/all-MiniLM-L6-v2` model.
- **Apache Arrow (`@apache-arrow/es2015-esm`):** A cross-language development platform for in-memory data. LanceDB uses Arrow for its data format, and we use it here to define the schema for our LanceDB table.
- **Nanoid:** For generating unique IDs for todo items.
- **HTML, CSS, JavaScript:** For the application's user interface and frontend logic.

## How Semantic Search Works

1.  **Embedding Generation:** When you add or update a todo, its text is converted into a numerical representation called an "embedding" (or "vector"). This embedding captures the semantic meaning of the text. We use the `all-MiniLM-L6-v2` model via Transformers.js for this.
2.  **Storing Embeddings:** The todo text, its ID, timestamp, and its generated embedding are stored in a LanceDB table locally on your computer.
3.  **Search Query Embedding:** When you type a search query, that query text is also converted into an embedding using the same model.
4.  **Vector Similarity Search:** LanceDB then compares the query embedding with all the stored todo embeddings in the database. It finds the todos whose embeddings are "closest" (most similar in meaning) to the query embedding.
5.  **Displaying Results:** The most semantically similar todos are displayed as search results.

## Project Structure

```

electron-todo-lancedb-app/
├── main.js # Electron main process: handles app lifecycle, IPC, LanceDB integration
├── preload.js # Electron preload script: securely exposes IPC functions to renderer
├── renderer.js # Electron renderer process: UI logic, DOM manipulation
├── index.html # Main HTML file for the UI
├── styles.css # CSS styles for the UI
├── package.json # Project metadata, dependencies, scripts
├── node_modules/ # Project dependencies
└── (LanceDB data directory) # Created in app's userData path (e.g., %APPDATA%/electron-todo-lancedb-app/todo_lancedb on Windows)

```

## Setup and Installation

1.  **Prerequisites:**

    - Node.js (which includes npm) or pnpm (as specified in `packageManager`). It's recommended to use the `pnpm` version mentioned in `package.json` for consistency. If you don't have pnpm, install it: `npm install -g pnpm`
    - A C++ compiler toolchain might be required by some dependencies of `vectordb` (like `duckdb-wasm`) for building native modules during installation, though prebuilt binaries are often available. (e.g., `windows-build-tools` for Windows, `build-essential` for Linux, Xcode Command Line Tools for macOS).

2.  **Clone the repository (if applicable) or set up the project files.**

3.  **Install Dependencies:**
    Open your terminal in the project's root directory and run:

    ```bash
    pnpm install
    ```

    (or `npm install` if you prefer npm and don't have pnpm, but pnpm is recommended based on the `package.json`)

    _Note: The first time Transformers.js downloads a model (`Xenova/all-MiniLM-L6-v2`), it will be cached locally. This might take a moment on the first run._

4.  **Run the Application:**
    ```bash
    pnpm start
    ```
    (or `npm start`)

## Usage

- **Adding a Todo:** Type your task in the "Enter a new todo" input field and click "Add Todo".
- **Editing a Todo:** Click the "Edit" button next to a todo. The todo text will appear in the main input field. Modify it and click "Update Todo". Click "Cancel" to abort editing.
- **Deleting a Todo:** Click the "Delete" button next to a todo and confirm.
- **Searching Todos:** Type your search query in the "Search todos semantically" input field and click "Search". Results will appear below, ranked by semantic similarity.

## Key Code Explanations

### `main.js` (Main Process)

- **Initialization (`initializeApp`):**
  - Dynamically imports ESM modules (`@xenova/transformers`, `vectordb`, `@apache-arrow/es2015-esm`, `nanoid`).
  - Initializes the sentence embedding pipeline from Transformers.js.
  - Connects to LanceDB or creates the `todos` table if it doesn't exist.
    - The table schema includes fields for `id` (string), `text` (string), `vector` (fixed-size list of floats), and `timestamp` (milliseconds).
    - Table creation uses a dummy record for schema inference due to previous issues with direct schema definition in this specific setup.
- **IPC Handlers:**
  - `add-todo`: Generates an embedding for the new todo text, creates a unique ID, and adds the item (ID, text, vector, timestamp) to the LanceDB table.
  - `get-todos`: Retrieves todos from LanceDB (currently using `table.search().limit().execute()`).
  - `search-todos`: Generates an embedding for the search query and uses `table.search(queryVector)` to find semantically similar todos.
  - `update-todo`: Deletes the old todo by ID and adds a new one with the updated text, new embedding, and the same ID.
  - `delete-todo`: Deletes a todo from LanceDB using its ID via `table.delete()`.
- **Window Management:** Standard Electron BrowserWindow creation and lifecycle event handling.

### `preload.js`

- Exposes specific IPC channels (`addTodo`, `getTodos`, `searchTodos`, `updateTodo`, `deleteTodo`, etc.) from the main process to the renderer process in a secure way using `contextBridge`. This is crucial for Electron's context isolation.

### `renderer.js` (Renderer Process)

- **DOM Manipulation:** Handles all interactions with the HTML elements (input fields, buttons, lists).
- **Event Listeners:**
  - Listens for clicks on "Add Todo", "Search", "Edit", "Delete", "Update Todo", and "Cancel Edit" buttons.
  - Calls the corresponding functions exposed by `preload.js` (e.g., `window.electronAPI.addTodo()`).
- **UI Updates:**
  - `addTodoToDOM()`: Creates and appends new list items for todos and search results, including their content and action buttons.
  - `renderSearchResults()`: Clears and populates the search results list.
  - Manages an "edit mode" UI state to repurpose the main input field for editing tasks, avoiding the unsupported `prompt()`.
- **Initialization Status:** Displays messages about the app's initialization state (e.g., "Initializing...", "App Ready", error messages).

## Potential Improvements & Future Work

- **More Robust "Get All" Todos:** The current `get-todos` relies on `search().limit()`. For very large numbers of todos, a more robust pagination or full table scan method might be needed if `vectordb` supports it directly or via SQL queries through DuckDB if applicable.
- **Advanced Error Handling:** More granular error handling and user feedback.
- **UI/UX Enhancements:**
  - Implement a custom modal dialog for editing todos instead of repurposing the add input.
  - Visual cues for ongoing operations (e.g., spinners).
  - Better styling and layout.
- **Undo/Redo Functionality.**
- **Sorting/Filtering Options:** Allow users to sort todos by date, text, or filter by other criteria.
- **Configuration:** Allow users to change the embedding model or other settings.
- **Build and Packaging:** Add scripts to `package.json` using `electron-builder` or `electron-packager` to create distributable application packages for different operating systems.
- **Distinct `createdTimestamp` and `updatedTimestamp`:** The current update logic in `main.js` uses `Date.now()` for the `timestamp` field on update, effectively making it an "updated at" timestamp. If a separate "created at" is desired, the schema and update logic would need adjustment.

## Troubleshooting

- **"Either data or schema needs to be defined" error during initialization:** This was a persistent issue. The current workaround is to create the LanceDB table by providing a single dummy data record, allowing LanceDB to infer the schema. Direct schema definition with `schemaOverride` was problematic in this Electron+ESM Arrow setup.
- **Model Download:** The first time you run the app, Transformers.js will download the `Xenova/all-MiniLM-L6-v2` model. Ensure you have an internet connection. Subsequent runs will use the cached model.
- **Cache Errors (e.g., `Unable to move the cache: Access is denied.`):** These are often related to Electron's internal caching mechanisms for GPU or network resources. They are generally harmless to the application's core functionality but might indicate permission issues in the user data directory.
- **`prompt()` not supported:** The `prompt()` dialog is not available in Electron's renderer. The current implementation uses an in-page editing mechanism.

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
