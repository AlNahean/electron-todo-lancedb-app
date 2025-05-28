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
          id: "dummy_id",
          text: "dummy_text",
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
        await table.delete('id = "dummy_id"');
        console.log("Dummy data deleted from the newly created table.");
      } catch (creationError) {
        console.error(
          "Error during db.createTable call (with dummy data):",
          creationError
        );
        throw creationError;
      }

      const createOptions = { schema: tableSchemaToUse };

      console.log("---- Pre-createTable Call ----");
      console.log(
        "Using createOptions:",
        JSON.stringify(
          createOptions,
          (key, value) => {
            if (value instanceof arrow.Schema) return "[Arrow Schema Object]";
            if (value instanceof arrow.Field)
              return `[Arrow Field: ${value.name}]`;
            if (value instanceof arrow.DataType)
              return `[Arrow DataType: ${value.constructor.name}]`;
            return value;
          },
          2
        )
      );
      console.log(
        "Is schema in options an arrow.Schema?",
        createOptions.schema instanceof arrow.Schema
      );
      console.log("--------------------------------");

      try {
        table = await db.createTable(TABLE_NAME, undefined, createOptions);
      } catch (creationError) {
        console.error("Error during db.createTable call:", creationError);
        console.error("Schema object used at time of error:", tableSchemaToUse);
        console.error("Options object used at time of error:", createOptions);
        throw creationError;
      }
      console.log(`Table ${TABLE_NAME} created.`);
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
    height: 600,
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
  await initializeApp();
  createWindow();
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
    const todoItem = {
      id: nanoidFn(),
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
    const results = await table
      .search()
      .limit(100)
      .select(["id", "text", "timestamp"])
      .execute();
    const todos = results
      .map((r) => ({ id: r.id, text: r.text, timestamp: r.timestamp }))
      .sort((a, b) => b.timestamp - a.timestamp);
    return { success: true, todos };
  } catch (error) {
    console.error("Error getting todos:", error);
    return { success: false, error: error.message, todos: [] };
  }
});

ipcMain.handle("search-todos", async (event, query) => {
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
    const results = await table
      .search(queryVector)
      .limit(10)
      .select(["id", "text", "timestamp"])
      .execute();
    const searchResults = results.map((r) => ({
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
