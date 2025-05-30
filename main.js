const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
let arrow;
const {
  Schema,
  Field,
  Utf8,
  FixedSizeList,
  Float32,
  TimestampMillisecond,
} = require("apache-arrow");

let mainWindow;
let db;
let table;
let embedder;

let pipeline;
let lancedb;
let nanoidFn;

const DB_PATH = path.join(app.getPath("userData"), "todo_lancedb");
const TABLE_NAME = "todos";
const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
const VECTOR_DIMENSION = 384;

async function initializeApp() {
  try {
    console.log("Dynamically importing ESM modules...");
    const transformersModule = await import("@xenova/transformers");
    pipeline = transformersModule.pipeline;
    const lancedbModule = await import("vectordb");
    lancedb = lancedbModule;
    const nanoidESMModule = await import("nanoid");
    nanoidFn = nanoidESMModule.nanoid;
    console.log("ESM modules imported successfully.");
    arrow = await import("@apache-arrow/es2015-esm");
    console.log("Initializing embedding pipeline...");
    embedder = await pipeline("feature-extraction", EMBEDDING_MODEL);
    console.log("Embedding pipeline initialized.");

    console.log("Connecting to LanceDB...");
    db = await lancedb.connect(DB_PATH);
    console.log("Connected to LanceDB.");

    const tableNames = await db.tableNames();
    if (tableNames.includes(TABLE_NAME)) {
      console.log(`Opening existing table: ${TABLE_NAME}`);
      table = await db.openTable(TABLE_NAME);
    } else {
      console.log(`Table ${TABLE_NAME} not found, creating new table...`);
      const tableFields = [
        new arrow.Field(
          "vector",
          new arrow.FixedSizeList(
            VECTOR_DIMENSION,
            new arrow.Field("item", new arrow.Float32())
          )
        ),
        new arrow.Field("text", new arrow.Utf8()),
        new arrow.Field("id", new arrow.Utf8()),
        new arrow.Field("timestamp", new arrow.TimestampMillisecond()),
      ];
      const tableSchema = new arrow.Schema(tableFields);
      console.log(
        "Defined target schema structure (for dummy data inference)."
      );
      const dummyVector = new Array(VECTOR_DIMENSION).fill(0.0);
      const dummyData = [
        {
          id: "dummy_id_init",
          text: "dummy_text_init",
          vector: dummyVector,
          timestamp: Date.now(),
        },
      ];
      console.log(
        "Attempting to create table with dummy data for schema inference..."
      );
      try {
        table = await db.createTable(TABLE_NAME, dummyData);
        console.log(
          `Table ${TABLE_NAME} created via schema inference from dummy data.`
        );
        await table.delete('id = "dummy_id_init"');
        console.log("Dummy data deleted from the newly created table.");
      } catch (creationError) {
        console.error(
          "Error during db.createTable call (with dummy data):",
          creationError
        );
        throw creationError;
      }
    }
    console.log("LanceDB table ready.");
    if (mainWindow) {
      mainWindow.webContents.send("initialization-success");
    }
  } catch (error) {
    console.error("Failed to initialize app components:", error);
    if (mainWindow) {
      mainWindow.webContents.send("initialization-error", error.message);
    }
  }
}

async function getEmbedding(text) {
  if (!embedder) {
    throw new Error("Embedding pipeline not initialized.");
  }
  const output = await embedder(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile("index.html");
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.on("ready", async () => {
  createWindow();
  await initializeApp();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

ipcMain.handle("add-todo", async (event, todoText) => {
  if (!table || !embedder) {
    return { success: false, error: "Database or embedder not initialized." };
  }
  try {
    const vector = await getEmbedding(todoText);
    const todoId = nanoidFn();
    const todoItem = {
      id: todoId,
      text: todoText,
      vector: vector,
      timestamp: Date.now(),
    };
    await table.add([todoItem]);
    return {
      success: true,
      item: {
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

ipcMain.handle("get-todos", async () => {
  if (!table) {
    return { success: false, error: "Database not initialized.", todos: [] };
  }
  try {
    // For vectordb, to get records without a specific vector search,
    // you still use .search() but without providing a query vector.
    // Then apply .select() and .limit().
    // This should retrieve records based on insertion order or some internal order
    // up to the specified limit if no other ordering is applied.
    const results = await table
      .search() // No query vector implies fetching based on other criteria or all
      .limit(500) // Get up to 500 todos
      .select(["id", "text", "timestamp"])
      .execute(); // .execute() is typically used with search()

    // The results from .execute() should already be an array of objects.
    const todos = results
      .map((r) => ({ id: r.id, text: r.text, timestamp: r.timestamp }))
      .sort((a, b) => b.timestamp - a.timestamp); // Sort by newest first

    return { success: true, todos };
  } catch (error) {
    console.error("Error getting todos:", error);
    return { success: false, error: error.message, todos: [] };
  }
});
ipcMain.handle("search-todos", async (event, query, startDate, endDate) => {
  if (!table || !embedder) {
    return {
      success: false,
      error: "Database or embedder not initialized.",
      results: [],
    };
  }
  if (!query || query.trim() === "") {
    return { success: true, results: [] };
  }
  try {
    const queryVector = await getEmbedding(query);
    let lanceQuery = table.search(queryVector);

    const filters = [];
    if (startDate) {
      // Expected format: YYYY-MM-DD
      // Get timestamp for 00:00:00 UTC on the start date
      const startTimestamp = new Date(startDate + "T00:00:00.000Z").getTime();
      if (!isNaN(startTimestamp)) {
        filters.push(`timestamp >= ${startTimestamp}`);
      }
    }
    if (endDate) {
      // Expected format: YYYY-MM-DD
      // Get timestamp for 23:59:59.999 UTC on the end date
      const endTimestamp = new Date(endDate + "T23:59:59.999Z").getTime();
      if (!isNaN(endTimestamp)) {
        filters.push(`timestamp <= ${endTimestamp}`);
      }
    }

    if (filters.length > 0) {
      lanceQuery = lanceQuery.where(filters.join(" AND "));
    }

    const searchResultsRaw = await lanceQuery
      .limit(10)
      .select(["id", "text", "timestamp"])
      .execute();
    const searchResults = searchResultsRaw.map((r) => ({
      id: r.id,
      text: r.text,
      timestamp: r.timestamp,
      score: r._distance,
    }));
    return { success: true, results: searchResults };
  } catch (error) {
    console.error("Error searching todos:", error);
    return { success: false, error: error.message, results: [] };
  }
});

ipcMain.handle("seed-demo-data", async () => {
  if (!table || !embedder || !nanoidFn) {
    return {
      success: false,
      error: "Core components (DB, embedder, nanoid) not initialized.",
    };
  }
  try {
    const demoTodos = [];
    const numItems = 100;
    const today = new Date();
    console.log(`Starting to generate ${numItems} demo todos.`);
    for (let i = 0; i < numItems; i++) {
      const text = `Demo task ${i + 1}: Explore ${
        ["Mars", "Jupiter", "Saturn", "ancient ruins", "deep sea"][i % 5]
      } with keyword ${nanoidFn(6)}`;
      const vector = await getEmbedding(text);
      const randomPastDay = new Date(today);
      randomPastDay.setDate(today.getDate() - Math.floor(Math.random() * 90)); // Spread over last 90 days
      randomPastDay.setHours(
        Math.floor(Math.random() * 24),
        Math.floor(Math.random() * 60),
        Math.floor(Math.random() * 60)
      );

      demoTodos.push({
        id: nanoidFn(),
        text: text,
        vector: vector,
        timestamp: randomPastDay.getTime(),
      });
    }
    await table.add(demoTodos);
    console.log(`${demoTodos.length} demo todos added to the database.`);
    return { success: true, count: demoTodos.length };
  } catch (error) {
    console.error("Error seeding demo data:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("update-todo", async (event, todoId, newText) => {
  if (!table || !embedder) {
    return { success: false, error: "Database or embedder not initialized." };
  }
  try {
    const newVector = await getEmbedding(newText);
    const newTimestamp = Date.now();
    const updatedTodoItemData = {
      id: todoId,
      text: newText,
      vector: newVector,
      timestamp: newTimestamp,
    };
    await table.delete(`id = "${todoId}"`);
    console.log(`Deleted old todo with id: ${todoId}`);
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

ipcMain.handle("delete-todo", async (event, todoId) => {
  if (!table) {
    return { success: false, error: "Database not initialized." };
  }
  try {
    await table.delete(`id = "${todoId}"`);
    console.log(`Deleted todo with id: ${todoId}`);
    return { success: true, id: todoId };
  } catch (error) {
    console.error(`Error deleting todo ${todoId}:`, error);
    return { success: false, error: error.message };
  }
});
