const todoInput = document.getElementById("todo-input");
const addTodoBtn = document.getElementById("add-todo-btn");
const todoList = document.getElementById("todo-list");
const searchInput = document.getElementById("search-input");
const searchTodoBtn = document.getElementById("search-todo-btn");
const searchResultsList = document.getElementById("search-results-list");
const initializationStatus = document.getElementById("initialization-status");

window.electronAPI.onInitializationError((errorMsg) => {
  initializationStatus.textContent = `Error: ${errorMsg}. Please restart the app or check console.`;
  initializationStatus.style.color = "red";
});

document.addEventListener("DOMContentLoaded", () => {
  // Wait a bit for main process to initialize
  setTimeout(() => {
    initializationStatus.textContent = "App Ready.";
    initializationStatus.style.color = "green";
    fetchTodos();
  }, 3000); // Adjust timeout as needed, depends on model loading time
});

addTodoBtn.addEventListener("click", async () => {
  const text = todoInput.value.trim();
  if (text) {
    const result = await window.electronAPI.addTodo(text);
    if (result.success) {
      addTodoToDOM(result.item);
      todoInput.value = "";
    } else {
      alert(`Error adding todo: ${result.error}`);
    }
  }
});

searchTodoBtn.addEventListener("click", async () => {
  const query = searchInput.value.trim();
  if (query) {
    const result = await window.electronAPI.searchTodos(query);
    if (result.success) {
      renderSearchResults(result.results);
    } else {
      alert(`Error searching todos: ${result.error}`);
    }
  } else {
    // Clear search results if query is empty
    renderSearchResults([]);
  }
});

async function fetchTodos() {
  const result = await window.electronAPI.getTodos();
  if (result.success) {
    todoList.innerHTML = ""; // Clear existing todos
    result.todos.forEach(addTodoToDOM);
  } else {
    initializationStatus.textContent = `Error fetching todos: ${result.error}`;
    initializationStatus.style.color = "red";
  }
}

function addTodoToDOM(todo) {
  const li = document.createElement("li");
  li.textContent = `${todo.text} (Added: ${new Date(
    todo.timestamp
  ).toLocaleString()})`;
  li.dataset.id = todo.id;
  todoList.prepend(li); // Add to the top
}

function renderSearchResults(results) {
  searchResultsList.innerHTML = ""; // Clear existing results
  if (results.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No results found.";
    searchResultsList.appendChild(li);
    return;
  }
  results.forEach((result) => {
    const li = document.createElement("li");
    const scorePercentage = (1 - result.score) * 100; // LanceDB cosine distance needs conversion to similarity
    li.textContent = `${result.text} (Similarity: ${scorePercentage.toFixed(
      2
    )}%)`;
    searchResultsList.appendChild(li);
  });
}
