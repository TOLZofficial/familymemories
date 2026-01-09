import { CONFIG } from "./config.js";

const ui = {
  statusChip: document.getElementById("statusChip"),
  loginView: document.getElementById("loginView"),
  loginForm: document.getElementById("loginForm"),
  loginEmail: document.getElementById("loginEmail"),
  loginUsername: document.getElementById("loginUsername"),
  loginMessage: document.getElementById("loginMessage"),
  appView: document.getElementById("appView"),
  welcomeName: document.getElementById("welcomeName"),
  memoryCount: document.getElementById("memoryCount"),
  latestMemory: document.getElementById("latestMemory"),
  familyCount: document.getElementById("familyCount"),
  timelineToggles: document.getElementById("timelineToggles"),
  timelineDate: document.getElementById("timelineDate"),
  timelineSummary: document.getElementById("timelineSummary"),
  timeline: document.getElementById("timeline"),
  addMemoryBtn: document.getElementById("addMemoryBtn"),
  adminLink: document.getElementById("adminLink"),
  signOutBtn: document.getElementById("signOutBtn"),
  memoryModal: document.getElementById("memoryModal"),
  memoryModalTitle: document.getElementById("memoryModalTitle"),
  memoryForm: document.getElementById("memoryForm"),
  memoryTitle: document.getElementById("memoryTitle"),
  memoryDate: document.getElementById("memoryDate"),
  memoryEntryDate: document.getElementById("memoryEntryDate"),
  memoryStory: document.getElementById("memoryStory"),
  memoryTags: document.getElementById("memoryTags"),
  memoryLocation: document.getElementById("memoryLocation"),
  memoryMedia: document.getElementById("memoryMedia"),
  memoryCaptions: document.getElementById("memoryCaptions"),
  memoryMessage: document.getElementById("memoryMessage"),
  cancelMemoryBtn: document.getElementById("cancelMemoryBtn"),
  memorySubmitBtn: document.getElementById("memorySubmitBtn"),
  setupHint: document.getElementById("setupHint")
};

let supabaseClient = null;
let currentUser = null;
let currentMember = null;
let memories = [];
let editingMemoryId = null;
let timelineView = "day";
let timelineAnchor = new Date();
let timelineInitialized = false;

const normalize = (value) => value.trim().toLowerCase();

const allowedLookup = () =>
  CONFIG.allowedUsers.map((user) => ({
    email: normalize(user.email),
    username: normalize(user.username)
  }));

const ensureConfigured = () =>
  CONFIG.supabaseUrl && CONFIG.supabaseAnonKey && CONFIG.allowedUsers.length > 0;

const isAdmin = (email) => {
  if (currentMember && currentMember.is_admin) return true;
  return (CONFIG.allowedAdmins || []).map(normalize).includes(normalize(email || ""));
};

const showMessage = (node, message, isError = false) => {
  node.textContent = message;
  node.style.color = isError ? "#a0412d" : "#3c6e58";
};

const toLocalDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const startOfWeek = (date) => {
  const d = startOfDay(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d;
};

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

const startOfYear = (date) => new Date(date.getFullYear(), 0, 1);

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const getMemoryDate = (memory) =>
  memory.memory_date
    ? new Date(memory.memory_date)
    : memory.entry_date
    ? new Date(memory.entry_date)
    : new Date(memory.created_at);

const getAutoCaption = (memory) => {
  if (memory.title) return memory.title;
  if (memory.story) {
    const firstSentence = memory.story.split(/[.!?]/)[0].trim();
    if (firstSentence) return firstSentence.slice(0, 80);
  }
  if (memory.location) return `Moment in ${memory.location}`;
  if (memory.memory_date) return `Memory from ${formatDate(memory.memory_date)}`;
  return "A family memory";
};

const getDisplayCaption = (memory) =>
  memory.media_caption && memory.media_caption.trim()
    ? memory.media_caption.trim()
    : getAutoCaption(memory);

const getCaptionLines = (value) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const buildCaptionForFile = (baseMemory, file, providedCaption) => {
  if (providedCaption) return providedCaption;
  if (baseMemory.title || baseMemory.story || baseMemory.location) {
    return getAutoCaption(baseMemory);
  }
  if (file && file.name) {
    return file.name.replace(/[-_]+/g, " ").replace(/\.[^.]+$/, "");
  }
  return "Family memory";
};

const getMediaItems = (memory) => {
  if (Array.isArray(memory.media_items) && memory.media_items.length) {
    return memory.media_items;
  }
  if (memory.media_url) {
    return [
      {
        url: memory.media_url,
        type: memory.media_type || "",
        caption: memory.media_caption || ""
      }
    ];
  }
  return [];
};

const getMediaCaptionSummary = (items) => {
  const captions = items
    .map((item) => (item.caption || "").trim())
    .filter(Boolean);
  if (!captions.length) return "";
  const sample = captions.slice(0, 3).join(" • ");
  if (captions.length > 3) {
    return `${sample} • +${captions.length - 3} more`;
  }
  return sample;
};

const getHighlight = (memory) =>
  memory.title ||
  (memory.media_caption && memory.media_caption.trim()) ||
  (memory.story && memory.story.trim().slice(0, 40)) ||
  "Family moment";

const buildSummaryText = (list) => {
  if (!list.length) return "No memories yet for this period.";
  const highlights = list.map(getHighlight).filter(Boolean);
  const sample = highlights.slice(0, 3);
  const remaining = highlights.length - sample.length;
  const line =
    sample.length === 1
      ? sample[0]
      : sample.length === 2
      ? `${sample[0]} and ${sample[1]}`
      : `${sample[0]}, ${sample[1]}, and ${sample[2]}`;
  if (remaining > 0) {
    return `${list.length} memories: ${line} and ${remaining} more.`;
  }
  return `${list.length} memories: ${line}.`;
};

const toggleModal = (open) => {
  ui.memoryModal.classList.toggle("active", open);
  ui.memoryModal.setAttribute("aria-hidden", String(!open));
};

const setView = (isSignedIn) => {
  ui.loginView.classList.toggle("hidden", isSignedIn);
  ui.appView.classList.toggle("hidden", !isSignedIn);
};

const formatDate = (isoDate) => {
  if (!isoDate) return "--";
  const date = new Date(isoDate);
  if (Number.isNaN(date.valueOf())) return "--";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
};

const summarizeMemories = () => {
  ui.memoryCount.textContent = memories.length.toString();
  ui.familyCount.textContent = CONFIG.allowedUsers.length.toString();
  const dates = memories
    .map((memory) => memory.memory_date || memory.entry_date || memory.created_at)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a));
  ui.latestMemory.textContent = dates[0] ? formatDate(dates[0]) : "--";
};

const createMemoryCard = (memory) => {
  const card = document.createElement("article");
  card.className = "memory-card";

  const media = document.createElement("div");
  media.className = "memory-media";

  const mediaItems = getMediaItems(memory);

  if (mediaItems.length > 1) {
    media.classList.add("multi");
    const grid = document.createElement("div");
    grid.className = "memory-media-grid";
    mediaItems.forEach((item) => {
      const wrapper = document.createElement("div");
      wrapper.className = "media-item";

      if (item.type && item.type.startsWith("video")) {
        const video = document.createElement("video");
        video.src = item.url;
        video.controls = true;
        video.preload = "metadata";
        wrapper.appendChild(video);
      } else {
        const img = document.createElement("img");
        img.src = item.url;
        img.alt = memory.title || "Family memory";
        wrapper.appendChild(img);
      }

      if (item.caption) {
        const label = document.createElement("span");
        label.className = "media-label";
        label.textContent = item.caption;
        wrapper.appendChild(label);
      }

      grid.appendChild(wrapper);
    });
    media.appendChild(grid);
  } else if (mediaItems.length === 1) {
    const item = mediaItems[0];
    if (item.type && item.type.startsWith("video")) {
      const video = document.createElement("video");
      video.src = item.url;
      video.controls = true;
      video.preload = "metadata";
      media.appendChild(video);
    } else {
      const img = document.createElement("img");
      img.src = item.url;
      img.alt = memory.title || "Family memory";
      media.appendChild(img);
    }
  } else {
    media.textContent = "No media yet";
  }

  const body = document.createElement("div");
  body.className = "memory-body";

  const title = document.createElement("h3");
  title.textContent = memory.title || "Untitled moment";

  const meta = document.createElement("div");
  meta.className = "memory-meta";
  const dateText = formatDate(memory.memory_date || memory.entry_date || memory.created_at);
  meta.textContent = `${dateText}${memory.location ? ` - ${memory.location}` : ""}`;

  const story = document.createElement("div");
  story.textContent = memory.story || "";

  const tagsWrap = document.createElement("div");
  tagsWrap.className = "tags";
  (memory.tags || []).forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = "tag";
    chip.textContent = tag;
    tagsWrap.appendChild(chip);
  });

  body.appendChild(title);
  body.appendChild(meta);

  if (mediaItems.length === 1) {
    const caption = document.createElement("div");
    caption.className = "memory-caption";
    caption.textContent = mediaItems[0].caption || getDisplayCaption(memory);
    body.appendChild(caption);
  } else if (mediaItems.length > 1) {
    const summary = getMediaCaptionSummary(mediaItems);
    if (summary) {
      const caption = document.createElement("div");
      caption.className = "memory-caption";
      caption.textContent = summary;
      body.appendChild(caption);
    }
  }

  if (memory.story) body.appendChild(story);
  if (memory.tags && memory.tags.length) body.appendChild(tagsWrap);

  if (currentUser && (memory.owner_email === currentUser.email || isAdmin(currentUser.email))) {
    const actions = document.createElement("div");
    actions.className = "memory-actions";
    const editBtn = document.createElement("button");
    editBtn.className = "btn-soft";
    editBtn.type = "button";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => startEditMemory(memory.id));
    actions.appendChild(editBtn);
    body.appendChild(actions);
  }

  card.appendChild(media);
  card.appendChild(body);
  return card;
};

const getRangeForView = (view, anchor) => {
  let start = startOfDay(anchor);
  let end = addDays(start, 1);
  let label = formatDate(start);

  if (view === "week") {
    start = startOfWeek(anchor);
    end = addDays(start, 7);
    label = `${formatDate(start)} - ${formatDate(addDays(end, -1))}`;
  } else if (view === "month") {
    start = startOfMonth(anchor);
    end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    label = start.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric"
    });
  } else if (view === "year") {
    start = startOfYear(anchor);
    end = new Date(start.getFullYear() + 1, 0, 1);
    label = start.getFullYear().toString();
  }

  return { start, end, label };
};

const groupMemories = (list, view) => {
  const groups = new Map();

  list.forEach((memory) => {
    const date = getMemoryDate(memory);
    let key = toLocalDateKey(date);
    let label = formatDate(date);

    if (view === "year") {
      key = `${date.getFullYear()}-${date.getMonth()}`;
      label = date.toLocaleDateString(undefined, { month: "long" });
    }

    if (!groups.has(key)) {
      groups.set(key, { label, items: [] });
    }

    groups.get(key).items.push(memory);
  });

  const groupArray = Array.from(groups.values());
  groupArray.forEach((group) =>
    group.items.sort((a, b) => getMemoryDate(b) - getMemoryDate(a))
  );
  groupArray.sort((a, b) => getMemoryDate(b.items[0]) - getMemoryDate(a.items[0]));
  return groupArray;
};

const renderTimeline = () => {
  ui.timeline.innerHTML = "";

  const { start, end, label } = getRangeForView(timelineView, timelineAnchor);
  const filtered = memories
    .filter((memory) => {
      const date = getMemoryDate(memory);
      return date >= start && date < end;
    })
    .sort((a, b) => getMemoryDate(b) - getMemoryDate(a));

  ui.timelineSummary.innerHTML = "";
  const summaryTitle = document.createElement("strong");
  summaryTitle.textContent = `Summary for ${label}`;
  const summaryText = document.createElement("div");
  summaryText.textContent = buildSummaryText(filtered);
  const summaryNote = document.createElement("div");
  summaryNote.className = "helper";
  summaryNote.textContent = "Auto summary based on captions and stories (offline).";
  ui.timelineSummary.appendChild(summaryTitle);
  ui.timelineSummary.appendChild(summaryText);
  ui.timelineSummary.appendChild(summaryNote);

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "panel";
    empty.textContent = "No memories yet for this period.";
    ui.timeline.appendChild(empty);
    summarizeMemories();
    return;
  }

  const groups = groupMemories(filtered, timelineView);
  groups.forEach((group) => {
    const section = document.createElement("section");
    section.className = "timeline-group";
    const header = document.createElement("h3");
    header.textContent = group.label;
    const grid = document.createElement("div");
    grid.className = "timeline-grid";
    group.items.forEach((memory) => grid.appendChild(createMemoryCard(memory)));
    section.appendChild(header);
    section.appendChild(grid);
    ui.timeline.appendChild(section);
  });

  summarizeMemories();
};

const setTimelineView = (view) => {
  timelineView = view;
  ui.timelineToggles
    .querySelectorAll(".toggle-button")
    .forEach((button) =>
      button.classList.toggle("active", button.dataset.view == view)
    );
  renderTimeline();
};

const setTimelineDate = (value) => {
  timelineAnchor = value ? new Date(value) : new Date();
  renderTimeline();
};

const initTimelineControls = () => {
  const todayKey = toLocalDateKey(new Date());
  ui.timelineDate.value = todayKey;
  timelineAnchor = new Date(todayKey);

  ui.timelineToggles.addEventListener("click", (event) => {
    const button = event.target.closest(".toggle-button");
    if (!button) return;
    setTimelineView(button.dataset.view);
  });

  ui.timelineDate.addEventListener("change", (event) => {
    setTimelineDate(event.target.value);
  });
};


const loadMemories = async () => {
  if (!supabaseClient || !currentUser) return;

  const { data, error } = await supabaseClient
    .from("memories")
    .select(
      "id, title, story, tags, location, memory_date, entry_date, created_at, media_url, media_type, media_caption, media_items, owner_email"
    )
    .order("memory_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    ui.setupHint.textContent =
      "Setup needed: add `media_caption` to the `memories` table and update RLS policies. See app.js for details.";
    console.error(error);
    return;
  }

  memories = data || [];
  renderTimeline();
};

const loadMemberProfile = async () => {
  if (!supabaseClient || !currentUser) return;
  const { data, error } = await supabaseClient
    .from("family_members")
    .select("email, username, is_admin")
    .eq("email", currentUser.email)
    .single();

  if (error) {
    currentMember = null;
    return;
  }

  currentMember = data;
};

const isAllowed = (email, username) => {
  const list = allowedLookup();
  const normalizedEmail = normalize(email);
  const normalizedUser = normalize(username);
  return list.some(
    (entry) => entry.email === normalizedEmail && entry.username === normalizedUser
  );
};

const sendInviteLink = async (email, username) => {
  if (!isAllowed(email, username)) {
    showMessage(ui.loginMessage, "That email/username combo is not on the family list.", true);
    return;
  }

  const redirectUrl = `${CONFIG.siteUrl || window.location.origin}/`;
  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectUrl,
      redirectTo: redirectUrl
    }
  });

  if (error) {
    showMessage(ui.loginMessage, error.message, true);
    return;
  }

  showMessage(ui.loginMessage, "Invite link sent! Check your email.");
};

const handleLoginSubmit = async (event) => {
  event.preventDefault();
  if (!supabaseClient) return;
  const email = ui.loginEmail.value;
  const username = ui.loginUsername.value;
  await sendInviteLink(email, username);
};

const handleSignOut = async () => {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
};

const handleAddMemory = () => {
  ui.memoryForm.reset();
  ui.memoryMessage.textContent = "";
  ui.memoryModalTitle.textContent = "Add a memory";
  ui.memorySubmitBtn.textContent = "Save memory";
  editingMemoryId = null;
  toggleModal(true);
};

const handleCancelMemory = () => {
  editingMemoryId = null;
  toggleModal(false);
};

const startEditMemory = (memoryId) => {
  const memory = memories.find((item) => item.id === memoryId);
  if (!memory) return;

  editingMemoryId = memoryId;
  ui.memoryModalTitle.textContent = "Edit memory";
  ui.memorySubmitBtn.textContent = "Update memory";
  ui.memoryTitle.value = memory.title || "";
  ui.memoryDate.value = memory.memory_date || "";
  ui.memoryEntryDate.value = memory.entry_date || "";
  ui.memoryStory.value = memory.story || "";
  ui.memoryTags.value = (memory.tags || []).join(", ");
  ui.memoryLocation.value = memory.location || "";
  const existingItems = getMediaItems(memory);
  if (existingItems.length) {
    ui.memoryCaptions.value = existingItems
      .map((item) => item.caption || "")
      .filter((caption) => caption.length || existingItems.length === 1)
      .join("\n");
  } else {
    ui.memoryCaptions.value = "";
  }
  ui.memoryMedia.value = "";
  ui.memoryMessage.textContent = "";
  toggleModal(true);
};

const uploadMediaFile = async (file) => {
  if (!file) return { url: "", type: "" };
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${currentUser.id}/${timestamp}-${safeName}`;
  const { error } = await supabaseClient.storage.from(CONFIG.bucketName).upload(path, file);

  if (error) {
    throw new Error(error.message);
  }

  const { data } = supabaseClient.storage.from(CONFIG.bucketName).getPublicUrl(path);
  return { url: data.publicUrl, type: file.type };
};

const uploadMediaFiles = async (files, captions, baseMemory) => {
  const items = [];
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const media = await uploadMediaFile(file);
    items.push({
      url: media.url,
      type: media.type,
      caption: buildCaptionForFile(baseMemory, file, captions[i] || "")
    });
  }
  return items;
};

const handleMemorySubmit = async (event) => {
  event.preventDefault();
  if (!supabaseClient || !currentUser) return;

  ui.memoryMessage.textContent = "Saving...";

  try {
    const existingMemory = editingMemoryId
      ? memories.find((item) => item.id === editingMemoryId)
      : null;
    const mediaFiles = Array.from(ui.memoryMedia.files || []);
    const captionLines = getCaptionLines(ui.memoryCaptions.value);

    const tags = ui.memoryTags.value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    const baseMemory = {
      title: ui.memoryTitle.value.trim(),
      story: ui.memoryStory.value.trim(),
      location: ui.memoryLocation.value.trim(),
      memory_date: ui.memoryDate.value || null,
      entry_date: ui.memoryEntryDate.value || null
    };

    let mediaItems = existingMemory ? getMediaItems(existingMemory) : [];

    if (mediaFiles.length) {
      mediaItems = await uploadMediaFiles(mediaFiles, captionLines, baseMemory);
    } else if (mediaItems.length && captionLines.length) {
      mediaItems = mediaItems.map((item, index) => ({
        ...item,
        caption: captionLines[index]
          ? captionLines[index]
          : item.caption || buildCaptionForFile(baseMemory, null, "")
      }));
    }

    const primaryItem = mediaItems[0] || { url: "", type: "", caption: "" };

    const payload = {
      title: baseMemory.title,
      story: baseMemory.story,
      tags,
      location: baseMemory.location,
      memory_date: baseMemory.memory_date,
      entry_date: baseMemory.entry_date,
      media_url: primaryItem.url,
      media_type: primaryItem.type,
      media_caption: primaryItem.caption,
      media_items: mediaItems,
      owner_email: currentUser.email
    };

    let error = null;

    if (editingMemoryId) {
      const response = await supabaseClient
        .from("memories")
        .update(payload)
        .eq("id", editingMemoryId);
      error = response.error;
    } else {
      const response = await supabaseClient.from("memories").insert(payload);
      error = response.error;
    }

    if (error) {
      throw new Error(error.message);
    }

    toggleModal(false);
    editingMemoryId = null;
    await loadMemories();
  } catch (err) {
    showMessage(ui.memoryMessage, err.message || "Could not save memory.", true);
  }
};

const applyAuthState = async (session) => {
  currentUser = session?.user || null;

  if (currentUser) {
    const allowed = CONFIG.allowedUsers.find(
      (entry) => normalize(entry.email) === normalize(currentUser.email)
    );
    if (!allowed) {
      await supabaseClient.auth.signOut();
      setView(false);
      showMessage(ui.loginMessage, "This account is not on the family list.", true);
      return;
    }

    await loadMemberProfile();
    ui.welcomeName.textContent = `Hello, ${allowed.username}`;
    ui.statusChip.textContent = "Family lane unlocked";
    ui.adminLink.classList.toggle(
      "hidden",
      !isAdmin(currentUser.email)
    );
    if (!timelineInitialized) {
      initTimelineControls();
      timelineInitialized = true;
    }
    setView(true);
    await loadMemories();
  } else {
    ui.statusChip.textContent = "Invite-only family circle";
    ui.adminLink.classList.add("hidden");
    setView(false);
  }
};

const setupHints = () => {
  if (!ensureConfigured()) {
    ui.setupHint.textContent =
      "Open app.js and add your Supabase keys + family allowlist to activate login.";
    return;
  }

  ui.setupHint.textContent =
    "Need help? Create a Supabase bucket named `memory-lane` and add `media_caption`, `media_items`, `entry_date`, and `is_admin` columns with RLS.";
};

const initSupabase = async () => {
  if (!ensureConfigured()) {
    setupHints();
    return;
  }

  supabaseClient = window.supabase.createClient(
    CONFIG.supabaseUrl,
    CONFIG.supabaseAnonKey
  );

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    applyAuthState(session);
  });

  const { data } = await supabaseClient.auth.getSession();
  await applyAuthState(data.session);
};

const registerServiceWorker = () => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => null);
  }
};

ui.loginForm.addEventListener("submit", handleLoginSubmit);
ui.addMemoryBtn.addEventListener("click", handleAddMemory);
ui.signOutBtn.addEventListener("click", handleSignOut);
ui.cancelMemoryBtn.addEventListener("click", handleCancelMemory);
ui.memoryForm.addEventListener("submit", handleMemorySubmit);
ui.memoryModal.addEventListener("click", (event) => {
  if (event.target === ui.memoryModal) {
    toggleModal(false);
  }
});

setupHints();
registerServiceWorker();
initSupabase();
