import { CONFIG } from "./config.js";

const ui = {
  adminStatus: document.getElementById("adminStatus"),
  signOutBtn: document.getElementById("signOutBtn"),
  memberForm: document.getElementById("memberForm"),
  memberEmail: document.getElementById("memberEmail"),
  memberUsername: document.getElementById("memberUsername"),
  memberAdmin: document.getElementById("memberAdmin"),
  memberMessage: document.getElementById("memberMessage"),
  memberTable: document.getElementById("memberTable"),
  memberCount: document.getElementById("memberCount"),
  memoryList: document.getElementById("memoryList"),
  memoryCount: document.getElementById("memoryCount"),
  memoryMessage: document.getElementById("memoryMessage"),
  editPanel: document.getElementById("editPanel"),
  editForm: document.getElementById("editForm"),
  editTitle: document.getElementById("editTitle"),
  editDate: document.getElementById("editDate"),
  editLocation: document.getElementById("editLocation"),
  editTags: document.getElementById("editTags"),
  editCaption: document.getElementById("editCaption"),
  editStory: document.getElementById("editStory"),
  editMessage: document.getElementById("editMessage"),
  cancelEditBtn: document.getElementById("cancelEditBtn")
};

let supabaseClient = null;
let currentUser = null;
let currentMember = null;
let editingMemoryId = null;
let memoryCache = [];

const normalize = (value) => value.trim().toLowerCase();

const showMessage = (node, message, isError = false) => {
  node.textContent = message;
  node.style.color = isError ? "#a0412d" : "#3c6e58";
};

const setAdminStatus = (text, isError = false) => {
  ui.adminStatus.textContent = text;
  ui.adminStatus.style.color = isError ? "#a0412d" : "#6f645d";
};

const isAdmin = (email) => {
  if (currentMember && currentMember.is_admin) return true;
  return (CONFIG.allowedAdmins || []).map(normalize).includes(normalize(email || ""));
};

const renderMembers = (members) => {
  ui.memberTable.innerHTML = "";
  ui.memberCount.textContent = `${members.length} members`;

  if (!members.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "No members yet.";
    row.appendChild(cell);
    ui.memberTable.appendChild(row);
    return;
  }

  members.forEach((member) => {
    const row = document.createElement("tr");

    const emailCell = document.createElement("td");
    emailCell.textContent = member.email;

    const userCell = document.createElement("td");
    userCell.textContent = member.username || "--";

    const adminCell = document.createElement("td");
    adminCell.textContent = member.is_admin ? "Yes" : "No";

    const actionCell = document.createElement("td");
    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = member.is_admin ? "Remove admin" : "Make admin";
    toggleBtn.addEventListener("click", () =>
      handleToggleAdmin(member.email, !member.is_admin)
    );

    const button = document.createElement("button");
    button.textContent = "Remove";
    button.addEventListener("click", () => handleRemoveMember(member.email));
    actionCell.appendChild(toggleBtn);
    actionCell.appendChild(button);

    row.appendChild(emailCell);
    row.appendChild(userCell);
    row.appendChild(adminCell);
    row.appendChild(actionCell);
    ui.memberTable.appendChild(row);
  });
};

const renderMemories = (memories) => {
  memoryCache = memories;
  ui.memoryList.innerHTML = "";
  ui.memoryCount.textContent = `${memories.length} memories`;

  if (!memories.length) {
    ui.memoryList.textContent = "No memories yet.";
    return;
  }

  memories.forEach((memory) => {
    const item = document.createElement("div");
    item.className = "memory-item";

    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = memory.title || "Untitled moment";

    const meta = document.createElement("div");
    meta.className = "muted";
    const date = memory.memory_date || memory.created_at;
    meta.textContent = `${date ? new Date(date).toLocaleDateString() : "--"} · ${
      memory.owner_email || "Unknown"
    }`;

    info.appendChild(title);
    info.appendChild(meta);

    const actions = document.createElement("div");
    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => startEditMemory(memory.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => handleDeleteMemory(memory.id));

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    item.appendChild(info);
    item.appendChild(actions);
    ui.memoryList.appendChild(item);
  });
};

const loadMembers = async () => {
  const { data, error } = await supabaseClient
    .from("family_members")
    .select("email, username, is_admin")
    .order("username", { ascending: true });

  if (error) {
    showMessage(
      ui.memberMessage,
      "Could not load family members. Check RLS policies.",
      true
    );
    return;
  }

  renderMembers(data || []);
};

const loadMemories = async () => {
  const { data, error } = await supabaseClient
    .from("memories")
    .select(
      "id, title, story, tags, location, memory_date, created_at, owner_email, media_caption"
    )
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    showMessage(
      ui.memoryMessage,
      "Could not load memories. Check RLS policies.",
      true
    );
    return;
  }

  renderMemories(data || []);
};

const startEditMemory = (memoryId) => {
  const memory = memoryCache.find((item) => item.id === memoryId);
  if (!memory) return;

  editingMemoryId = memoryId;
  ui.editTitle.value = memory.title || "";
  ui.editDate.value = memory.memory_date || "";
  ui.editLocation.value = memory.location || "";
  ui.editTags.value = (memory.tags || []).join(", ");
  ui.editCaption.value = memory.media_caption || "";
  ui.editStory.value = memory.story || "";
  ui.editMessage.textContent = "";
  ui.editPanel.classList.remove("hidden");
  ui.editPanel.scrollIntoView({ behavior: "smooth", block: "start" });
};

const clearEditForm = () => {
  editingMemoryId = null;
  ui.editForm.reset();
  ui.editPanel.classList.add("hidden");
  ui.editMessage.textContent = "";
};

const handleAddMember = async (event) => {
  event.preventDefault();
  const email = ui.memberEmail.value.trim();
  const username = ui.memberUsername.value.trim();
  const isAdminMember = ui.memberAdmin.value === "yes";

  if (!email || !username) return;

  const { error } = await supabaseClient
    .from("family_members")
    .insert({ email, username, is_admin: isAdminMember });

  if (error) {
    showMessage(ui.memberMessage, error.message, true);
    return;
  }

  ui.memberForm.reset();
  ui.memberAdmin.value = "no";
  showMessage(ui.memberMessage, "Member added.");
  await loadMembers();
};

const handleRemoveMember = async (email) => {
  const { error } = await supabaseClient
    .from("family_members")
    .delete()
    .eq("email", email);

  if (error) {
    showMessage(ui.memberMessage, error.message, true);
    return;
  }

  showMessage(ui.memberMessage, "Member removed.");
  await loadMembers();
};

const handleToggleAdmin = async (email, isAdminFlag) => {
  const { error } = await supabaseClient
    .from("family_members")
    .update({ is_admin: isAdminFlag })
    .eq("email", email);

  if (error) {
    showMessage(ui.memberMessage, error.message, true);
    return;
  }

  showMessage(ui.memberMessage, "Admin access updated.");
  await loadMembers();
};

const handleDeleteMemory = async (memoryId) => {
  const { error } = await supabaseClient.from("memories").delete().eq("id", memoryId);

  if (error) {
    showMessage(ui.memoryMessage, error.message, true);
    return;
  }

  showMessage(ui.memoryMessage, "Memory deleted.");
  await loadMemories();
};

const handleEditSubmit = async (event) => {
  event.preventDefault();
  if (!editingMemoryId) return;

  const tags = ui.editTags.value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  const payload = {
    title: ui.editTitle.value.trim(),
    story: ui.editStory.value.trim(),
    tags,
    location: ui.editLocation.value.trim(),
    memory_date: ui.editDate.value || null,
    media_caption: ui.editCaption.value.trim()
  };

  const { error } = await supabaseClient
    .from("memories")
    .update(payload)
    .eq("id", editingMemoryId);

  if (error) {
    showMessage(ui.editMessage, error.message, true);
    return;
  }

  showMessage(ui.editMessage, "Memory updated.");
  await loadMemories();
  clearEditForm();
};

const handleSignOut = async () => {
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
};

const initAdmin = async () => {
  supabaseClient = window.supabase.createClient(
    CONFIG.supabaseUrl,
    CONFIG.supabaseAnonKey
  );

  const { data } = await supabaseClient.auth.getSession();
  currentUser = data.session?.user || null;

  if (!currentUser) {
    window.location.href = "index.html";
    return;
  }

  const { data: memberData } = await supabaseClient
    .from("family_members")
    .select("email, is_admin")
    .eq("email", currentUser.email)
    .single();
  currentMember = memberData || null;

  if (!isAdmin(currentUser.email)) {
    await supabaseClient.auth.signOut();
    setAdminStatus("This account is not an admin.", true);
    return;
  }

  setAdminStatus(`Signed in as ${currentUser.email}`);
  await loadMembers();
  await loadMemories();
};

ui.memberForm.addEventListener("submit", handleAddMember);
ui.signOutBtn.addEventListener("click", handleSignOut);
ui.editForm.addEventListener("submit", handleEditSubmit);
ui.cancelEditBtn.addEventListener("click", clearEditForm);

initAdmin();
