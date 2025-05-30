const todoInput = document.getElementById("todo-input");
const addTodoBtn = document.getElementById("add-todo-btn");
const todoList = document.getElementById("todo-list");
const searchInput = document.getElementById("search-input");
const searchTodoBtn = document.getElementById("search-todo-btn");
const searchResultsList = document.getElementById("search-results-list");
const initializationStatus = document.getElementById("initialization-status");
const seedDataBtn = document.getElementById("seed-data-btn");
const searchStartDateInput = document.getElementById("search-start-date");
const clearSearchFiltersBtn = document.getElementById(
  "clear-search-filters-btn"
);
const searchEndDateInput = document.getElementById("search-end-date");

// --- NEW: Tab elements ---
const tabButtons = document.querySelectorAll(".tab-navigation .tab-button");
const tabContents = document.querySelectorAll(".tabs-container .tab-content");

// --- NEW: Elements for edit mode ---
const editingTodoIdInput = document.getElementById("editing-todo-id");
const updateTodoBtn = document.getElementById("update-todo-btn");
const cancelEditBtn = document.getElementById("cancel-edit-btn");

// --- Global state for original DOM elements during edit ---
let originalTextSpanForEdit = null;
let originalTimestampSpanForEdit = null;
let originalTodoObjectForEdit = null;

window.electronAPI.onInitializationError((errorMsg) => {
  initializationStatus.textContent = `Error: ${errorMsg}. App may not function correctly. Please restart or check console.`;
  initializationStatus.style.color = "red";
  // Disable inputs if initialization fails
  todoInput.disabled = true;
  addTodoBtn.disabled = true;
  searchInput.disabled = true;
  searchTodoBtn.disabled = true;
  updateTodoBtn.disabled = true;
  cancelEditBtn.disabled = true;
  seedDataBtn.disabled = true;
  searchStartDateInput.disabled = true;
  searchEndDateInput.disabled = true;
  clearSearchFiltersBtn.disabled = true;
  tabButtons.forEach((button) => (button.style.pointerEvents = "none"));
});

window.electronAPI.onInitializationSuccess(() => {
  initializationStatus.textContent = "App Ready. LanceDB initialized.";
  initializationStatus.style.color = "green";
  // Enable inputs
  todoInput.disabled = false;
  addTodoBtn.disabled = false;
  searchInput.disabled = false;
  searchTodoBtn.disabled = false;
  seedDataBtn.disabled = false;
  searchStartDateInput.disabled = false;
  searchEndDateInput.disabled = false;
  clearSearchFiltersBtn.disabled = false;
  tabButtons.forEach((button) => (button.style.pointerEvents = "auto"));
  // Update/Cancel buttons remain hidden until edit mode is entered
  fetchTodos();
  showTab("todos-tab"); // Show default tab
});

addTodoBtn.addEventListener("click", async () => {
  const text = todoInput.value.trim();
  if (text) {
    const result = await window.electronAPI.addTodo(text);
    if (result.success && result.item) {
      addTodoToDOM(result.item);
      todoInput.value = "";
    } else {
      alert(`Error adding todo: ${result.error || "Unknown error"}`);
    }
  }
});

// --- NEW: Update Todo Button Event Listener ---
updateTodoBtn.addEventListener("click", async () => {
  const todoId = editingTodoIdInput.value;
  const newText = todoInput.value.trim();

  if (!todoId || !newText) {
    alert("Error: Todo ID or text is missing for update.");
    exitEditMode();
    return;
  }

  // Check if text actually changed
  if (originalTodoObjectForEdit && newText === originalTodoObjectForEdit.text) {
    alert("No changes made to the todo text.");
    exitEditMode();
    return;
  }

  const result = await window.electronAPI.updateTodo(todoId, newText);
  if (result.success && result.item) {
    // Update the main list item if it exists
    const mainListItem = todoList.querySelector(`li[data-id="${todoId}"]`);
    if (mainListItem) {
      mainListItem.querySelector(".todo-text").textContent = result.item.text;
      mainListItem.querySelector(
        ".todo-timestamp"
      ).textContent = ` (Updated: ${new Date(
        result.item.timestamp
      ).toLocaleString()})`;
    }

    // Update the search result item if it was being edited from search results
    if (originalTextSpanForEdit && originalTimestampSpanForEdit) {
      // Check if these elements are still part of the DOM (e.g. search results not cleared)
      if (document.body.contains(originalTextSpanForEdit)) {
        originalTextSpanForEdit.textContent = result.item.text;
        originalTimestampSpanForEdit.textContent = ` (Updated: ${new Date(
          result.item.timestamp
        ).toLocaleString()})`;
      }
    }

    // If text changes, semantic search results might change.
    // Consider re-running search or clearing results.
    if (
      searchInput.value.trim() &&
      originalTodoObjectForEdit &&
      newText !== originalTodoObjectForEdit.text
    ) {
      console.log("Todo text changed, re-running search.");
      searchTodoBtn.click();
    }
  } else {
    alert(`Error updating todo: ${result.error || "Unknown error"}`);
  }
  exitEditMode();
});

// --- NEW: Cancel Edit Button Event Listener ---
cancelEditBtn.addEventListener("click", () => {
  exitEditMode();
});

searchTodoBtn.addEventListener("click", async () => {
  const query = searchInput.value.trim();
  const startDate = searchStartDateInput.value; // YYYY-MM-DD or empty
  const endDate = searchEndDateInput.value; // YYYY-MM-DD or empty

  if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
    alert("End date cannot be before start date.");
    return;
  }

  // Pass null if dates are not set, so backend can ignore them
  const result = await window.electronAPI.searchTodos(
    query,
    startDate || null,
    endDate || null
  );
  if (result.success) {
    showTab("search-results-tab"); // Switch to search results tab
    renderSearchResults(result.results);
  } else {
    alert(`Error searching todos: ${result.error || "Unknown error"}`);
    showTab("search-results-tab"); // Still switch to show error or empty state
    searchResultsList.innerHTML = `<li>Error: ${
      result.error || "Unknown error"
    }</li>`;
  }
});

clearSearchFiltersBtn.addEventListener("click", () => {
  if (editingTodoIdInput.value !== "") {
    alert("Please finish or cancel your current edit before clearing filters.");
    return;
  }
  searchInput.value = "";
  searchStartDateInput.value = "";
  searchEndDateInput.value = "";
  searchResultsList.innerHTML = ""; // Clear the displayed search results

  // Optionally, if on search tab and it's now empty, switch to todos tab
  if (
    document
      .querySelector('.tab-button[data-tab="search-results-tab"]')
      .classList.contains("active")
  ) {
    showTab("todos-tab");
  }
});

async function fetchTodos() {
  if (todoInput.disabled) {
    initializationStatus.textContent =
      "Waiting for initialization to complete...";
    return;
  }
  initializationStatus.textContent = "Fetching todos...";
  const result = await window.electronAPI.getTodos();
  if (result.success) {
    todoList.innerHTML = "";
    if (result.todos && result.todos.length > 0) {
      result.todos.forEach((todo) => addTodoToDOM(todo, false));
      initializationStatus.textContent = "Todos loaded.";
    } else {
      initializationStatus.textContent = "No todos yet. Add one!";
    }
  } else {
    initializationStatus.textContent = `Error fetching todos: ${
      result.error || "Unknown error"
    }`;
    initializationStatus.style.color = "red";
  }
}

// --- MODIFIED: enterEditMode and exitEditMode ---
function enterEditMode(
  todoId,
  currentText,
  textSpan,
  timestampSpan,
  todoObject
) {
  if (editingTodoIdInput.value !== "") {
    alert(
      "Already editing another todo. Please finish or cancel that edit first."
    );
    return;
  }
  todoInput.value = currentText;
  editingTodoIdInput.value = todoId;

  addTodoBtn.classList.add("hidden");
  updateTodoBtn.classList.remove("hidden");
  cancelEditBtn.classList.remove("hidden");

  todoInput.focus();

  // Store original elements for potential update
  originalTextSpanForEdit = textSpan;
  originalTimestampSpanForEdit = timestampSpan;
  originalTodoObjectForEdit = { ...todoObject }; // Store a copy of the todo object

  // Optionally, disable other interactions
  searchInput.disabled = true;
  searchTodoBtn.disabled = true;
  document
    .querySelectorAll('.search-filters input[type="date"]')
    .forEach((input) => (input.disabled = true));
  // Disable tab switching during edit
  tabButtons.forEach((button) => (button.style.pointerEvents = "none"));

  document
    .querySelectorAll("#todo-list li button, #search-results-list li button")
    .forEach((b) => {
      if (b !== updateTodoBtn && b !== cancelEditBtn) b.disabled = true;
    });
}

function exitEditMode() {
  todoInput.value = "";
  editingTodoIdInput.value = "";

  addTodoBtn.classList.remove("hidden");
  updateTodoBtn.classList.add("hidden");
  cancelEditBtn.classList.add("hidden");

  originalTextSpanForEdit = null;
  originalTimestampSpanForEdit = null;
  originalTodoObjectForEdit = null;

  // Re-enable other interactions
  if (!initializationStatus.textContent.startsWith("Error")) {
    // Only if not in init error state
    searchInput.disabled = false;
    searchTodoBtn.disabled = false;
    document
      .querySelectorAll('.search-filters input[type="date"]')
      .forEach((input) => (input.disabled = false));
    // Re-enable tab switching
    tabButtons.forEach((button) => (button.style.pointerEvents = "auto"));
    document
      .querySelectorAll("#todo-list li button, #search-results-list li button")
      .forEach((b) => (b.disabled = false));
  }
}

function addTodoToDOM(todo, isSearchResult = false) {
  const li = document.createElement("li");
  li.dataset.id = todo.id;

  const contentDiv = document.createElement("div");
  contentDiv.className = "todo-content";

  const textSpan = document.createElement("span");
  textSpan.className = "todo-text";
  textSpan.textContent = todo.text;
  contentDiv.appendChild(textSpan);

  const timestampSpan = document.createElement("span");
  timestampSpan.className = "todo-timestamp";
  const datePrefix =
    todo.updatedTimestamp && todo.updatedTimestamp > todo.timestamp
      ? "Updated"
      : "Added";
  timestampSpan.textContent = ` (${datePrefix}: ${new Date(
    todo.updatedTimestamp || todo.timestamp
  ).toLocaleString()})`;
  contentDiv.appendChild(timestampSpan);

  if (isSearchResult && typeof todo.score !== "undefined") {
    const scoreSpan = document.createElement("span");
    scoreSpan.className = "todo-score";
    let scoreText = `(Score: ${todo.score.toFixed(4)})`;
    if (todo.score >= 0 && todo.score <= 2) {
      const similarity = 1 - todo.score / 2;
      scoreText = ` (Similarity: ${(similarity * 100).toFixed(2)}%)`;
    }
    scoreSpan.textContent = scoreText;
    contentDiv.appendChild(scoreSpan);
  }

  const actionsDiv = document.createElement("div");
  actionsDiv.className = "todo-actions";

  const editButton = document.createElement("button");
  editButton.textContent = "Edit";
  editButton.className = "edit-btn";
  // --- MODIFIED: Pass elements to enterEditMode ---
  editButton.addEventListener("click", () =>
    enterEditMode(todo.id, todo.text, textSpan, timestampSpan, todo)
  );

  const deleteButton = document.createElement("button");
  deleteButton.textContent = "Delete";
  deleteButton.className = "delete-btn";
  deleteButton.addEventListener("click", () => handleDeleteTodo(todo.id));

  actionsDiv.appendChild(editButton);
  actionsDiv.appendChild(deleteButton);

  li.appendChild(contentDiv);
  li.appendChild(actionsDiv);

  if (isSearchResult) {
    searchResultsList.appendChild(li);
  } else {
    todoList.prepend(li);
  }
}

// --- REMOVE OLD handleEditTodo that uses prompt ---
// async function handleEditTodo(todoId, textSpanElement, timestampSpanElement, originalTodoObject) {
//   const currentText = originalTodoObject ? originalTodoObject.text : textSpanElement.textContent;
//   const newText = prompt("Enter new text for the todo:", currentText); // THIS LINE CAUSES THE ERROR

//   if (newText && newText.trim() !== "" && newText.trim() !== currentText) {
//     // ... rest of the old logic ...
//   }
// }

async function handleDeleteTodo(todoId) {
  if (editingTodoIdInput.value === todoId) {
    alert(
      "Cannot delete a todo that is currently being edited. Please cancel editing first."
    );
    return;
  }
  if (confirm("Are you sure you want to delete this todo?")) {
    const result = await window.electronAPI.deleteTodo(todoId);
    if (result.success) {
      const mainListItem = todoList.querySelector(`li[data-id="${result.id}"]`);
      if (mainListItem) {
        mainListItem.remove();
      }
      const searchResultItem = searchResultsList.querySelector(
        `li[data-id="${result.id}"]`
      );
      if (searchResultItem) {
        searchResultItem.remove();
      }
    } else {
      alert(`Error deleting todo: ${result.error || "Unknown error"}`);
    }
  }
}

function renderSearchResults(results) {
  searchResultsList.innerHTML = "";
  if (results.length === 0 && searchInput.value.trim() !== "") {
    const li = document.createElement("li");
    li.textContent = "No semantic matches found.";
    li.style.justifyContent = "center";
    searchResultsList.appendChild(li);
    return;
  }
  if (results.length === 0 && searchInput.value.trim() === "") {
    return;
  }
  results.forEach((result) => {
    addTodoToDOM(
      {
        id: result.id,
        text: result.text,
        timestamp: result.timestamp,
        updatedTimestamp: result.updatedTimestamp,
        score: result.score,
      },
      true
    );
  });
}

seedDataBtn.addEventListener("click", async () => {
  if (editingTodoIdInput.value !== "") {
    alert("Please finish or cancel your current edit before seeding data.");
    return;
  }
  if (
    confirm(
      "Are you sure you want to add 100 demo todos? This can clutter your list."
    )
  ) {
    seedDataBtn.disabled = true;
    seedDataBtn.textContent = "Seeding...";
    const result = await window.electronAPI.seedDemoData();
    if (result.success) {
      alert(
        `${result.count} demo todos seeded successfully! Refreshing list...`
      );
      showTab("todos-tab"); // Switch to todos tab to see new data
      fetchTodos(); // Refresh the main todo list
    } else {
      alert(`Error seeding data: ${result.error || "Unknown error"}`);
    }
    seedDataBtn.disabled = false;
    seedDataBtn.textContent = "Seed 100 Demo Todos";
  }
});

// --- NEW: Tab Switching Logic ---
tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (editingTodoIdInput.value !== "") {
      alert("Please finish or cancel your current edit before switching tabs.");
      return;
    }
    showTab(button.dataset.tab);
  });
});

function showTab(tabIdToShow) {
  tabContents.forEach((content) => {
    content.classList.remove("active");
  });
  tabButtons.forEach((button) => {
    button.classList.remove("active");
  });

  const contentElementId = tabIdToShow + "-content";
  const contentElement = document.getElementById(contentElementId);
  if (contentElement) {
    contentElement.classList.add("active");
  } else {
    console.error(
      `Tab content element with ID "${contentElementId}" not found.`
    );
  }

  const buttonElement = document.querySelector(
    `.tab-button[data-tab="${tabIdToShow}"]`
  );
  if (buttonElement) {
    buttonElement.classList.add("active");
  } else {
    console.error(`Tab button with data-tab "${tabIdToShow}" not found.`);
  }
}
