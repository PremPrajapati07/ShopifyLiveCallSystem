const socket = io(window.location.origin);
const callList = document.getElementById("callList");
const emptyQueue = document.getElementById("emptyQueue");
const connectionStatus = document.getElementById("connectionStatus");
const statusText = document.getElementById("statusText");
const queueCount = document.getElementById("queueCount");
const activeCalls = document.getElementById("activeCalls");
const waitingCallsCount = document.getElementById("waitingCallsCount");
const activeCallsCount = document.getElementById("activeCallsCount");
const totalCallsToday = document.getElementById("totalCallsToday");
const notificationSound = document.getElementById("notificationSound");

// Notification elements
const soundToggle = document.getElementById("soundToggle");
const desktopNotificationToggle = document.getElementById("desktopNotificationToggle");
const browserTabNotificationToggle = document.getElementById("browserTabNotificationToggle");
const testSoundBtn = document.getElementById("testSoundBtn");
const testNotificationBtn = document.getElementById("testNotificationBtn");
const notificationStatus = document.getElementById("notificationStatus");
const managePermissionsBtn = document.getElementById("managePermissionsBtn");

// Permission modal elements
const permissionModal = document.getElementById("permissionModal");
const allowNotificationsBtn = document.getElementById("allowNotifications");
const denyNotificationsBtn = document.getElementById("denyNotifications");
const askLaterBtn = document.getElementById("askLater");

// State
let waitingCalls = [];
let activeCallsList = [];
let callHistory = [];
let notificationPermission = null;
let tabTitleOriginal = document.title;
let notificationInterval = null;
let hasAskedForPermission = false;

// Check if notifications are supported
const notificationsSupported = "Notification" in window;

// Load settings from localStorage
function loadSettings() {
    const soundEnabled = localStorage.getItem('soundEnabled') !== 'false';
    const desktopNotificationsEnabled = localStorage.getItem('desktopNotificationsEnabled') !== 'false';
    const browserTabNotificationsEnabled = localStorage.getItem('browserTabNotificationsEnabled') !== 'false';
    const hasAsked = localStorage.getItem('hasAskedForNotificationPermission') === 'true';
    
    soundToggle.checked = soundEnabled;
    desktopNotificationToggle.checked = desktopNotificationsEnabled;
    browserTabNotificationToggle.checked = browserTabNotificationsEnabled;
    hasAskedForPermission = hasAsked;
}

// Save settings to localStorage
function saveSettings() {
    localStorage.setItem('soundEnabled', soundToggle.checked);
    localStorage.setItem('desktopNotificationsEnabled', desktopNotificationToggle.checked);
    localStorage.setItem('browserTabNotificationsEnabled', browserTabNotificationToggle.checked);
}

// Update notification status display
function updateNotificationStatus() {
    if (!notificationsSupported) {
    notificationStatus.textContent = "Notifications not supported";
    notificationStatus.style.color = "#f44336";
    return;
    }
    
    switch(Notification.permission) {
    case "granted":
        notificationStatus.textContent = "✓ Notifications enabled";
        notificationStatus.style.color = "#4CAF50";
        desktopNotificationToggle.disabled = false;
        break;
    case "denied":
        notificationStatus.textContent = "✗ Notifications blocked";
        notificationStatus.style.color = "#f44336";
        desktopNotificationToggle.checked = false;
        desktopNotificationToggle.disabled = true;
        break;
    case "default":
        notificationStatus.textContent = "? Notifications not set";
        notificationStatus.style.color = "#ff9800";
        desktopNotificationToggle.disabled = false;
        break;
    }
}

// Request notification permission with modal
async function requestNotificationPermission() {
    if (!notificationsSupported) {
    console.log("This browser does not support desktop notifications");
    updateNotificationStatus();
    return false;
    }
    
    // If already granted or denied, don't show modal
    if (Notification.permission === "granted") {
    updateNotificationStatus();
    return true;
    }
    
    if (Notification.permission === "denied") {
    updateNotificationStatus();
    return false;
    }
    
    // Show modal if not asked before
    if (!hasAskedForPermission) {
    showPermissionModal();
    }
    
    return false;
}

// Show permission modal
function showPermissionModal() {
    permissionModal.style.display = "flex";
    localStorage.setItem('hasAskedForNotificationPermission', 'true');
    hasAskedForPermission = true;
}

// Hide permission modal
function hidePermissionModal() {
    permissionModal.style.display = "none";
}

// Actually request permission from browser
async function requestBrowserNotificationPermission() {
    try {
    const permission = await Notification.requestPermission();
    updateNotificationStatus();
    return permission === "granted";
    } catch (error) {
    console.error("Error requesting notification permission:", error);
    updateNotificationStatus();
    return false;
    }
}

// Play notification sound
function playNotificationSound() {
    if (soundToggle.checked && notificationSound) {
    notificationSound.currentTime = 0;
    notificationSound.play().catch(e => console.log("Could not play sound:", e));
    }
}

// Show desktop notification
function showDesktopNotification(title, options) {
    if (!desktopNotificationToggle.checked) return;
    
    if (Notification.permission === "granted") {
    const notification = new Notification(title, {
        icon: 'https://vaama.co/cdn/shop/files/vaama-logo.png',
        badge: 'https://vaama.co/cdn/shop/files/vaama-logo.png',
        ...options
    });
    
    notification.onclick = () => {
        window.focus();
        notification.close();
    };
    
    setTimeout(() => notification.close(), 5000);
    }
}

// Show browser tab notification
function showBrowserTabNotification(message) {
    if (!browserTabNotificationToggle.checked) return;
    
    document.title = `📞 ${message} - Admin Panel`;
    
    if (notificationInterval) clearInterval(notificationInterval);
    
    let flash = true;
    notificationInterval = setInterval(() => {
    document.title = flash ? `📞 ${message} - Admin Panel` : tabTitleOriginal;
    flash = !flash;
    }, 1000);
    
    // Stop flashing after 10 seconds
    setTimeout(() => {
    if (notificationInterval) {
        clearInterval(notificationInterval);
        document.title = tabTitleOriginal;
    }
    }, 10000);
}

// Update stats display
function updateStatsDisplay() {
    queueCount.textContent = `${waitingCalls.length} call${waitingCalls.length !== 1 ? 's' : ''} waiting`;
    waitingCallsCount.textContent = waitingCalls.length;
    activeCallsCount.textContent = activeCallsList.length;
    
    // Update active calls text
    if (activeCallsList.length > 0) {
    activeCalls.textContent = `• ${activeCallsList.length} active call${activeCallsList.length !== 1 ? 's' : ''}`;
    } else {
    activeCalls.textContent = '';
    }
    
    if (waitingCalls.length === 0) {
    callList.style.display = "none";
    emptyQueue.style.display = "block";
    } else {
    callList.style.display = "block";
    emptyQueue.style.display = "none";
    }
}

// Calculate waiting time
function calculateWaitingTime(timestamp) {
    if (!timestamp) return "Just now";
    
    const waitTime = Math.floor((new Date() - new Date(timestamp)) / 1000);
    const minutes = Math.floor(waitTime / 60);
    const seconds = waitTime % 60;
    
    if (minutes === 0 && seconds < 30) return "Just now";
    if (minutes === 0) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ${seconds}s ago`;
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m ago`;
}

// Add call to UI list
function addCallToList(user, isNew = true) {
    const li = document.createElement("li");
    li.id = `call-${user.id}`;
    li.className = `call-item ${isNew ? 'new' : ''}`;
    
    const waitTime = calculateWaitingTime(user.timestamp);
    const phone = user.userData?.phone || 'Not provided';
    const userAgent = user.userData?.userAgent || '';
    const source = user.userData?.source || '';
    const productUrl = user.userData?.productUrl || '';
    
    li.innerHTML = `
    <div class="call-info">
        <div class="user-name">${user.userData?.name || "Anonymous User"}</div>
        <div class="user-phone">${phone}</div>
        <div class="waiting-time">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        ${waitTime}
        </div>
        ${userAgent ? `<div class="user-agent" title="${userAgent}">${userAgent.substring(0, 50)}...</div>` : ''}
        ${productUrl ? `<div class="user-extra">From: ${new URL(productUrl).pathname}</div>` : ''}
    </div>
    <button class="accept-btn" onclick="acceptCall('${user.id}')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 5px;">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
        </svg>
        Accept Call
    </button>
    `;
    
    callList.prepend(li);
    
    // Remove 'new' animation after 3 seconds
    if (isNew) {
    setTimeout(() => {
        li.classList.remove('new');
    }, 3000);
    }
}

// Socket connection
socket.on("connect", () => {
    console.log("Admin connected:", socket.id);
    connectionStatus.className = "status-indicator connected";
    statusText.textContent = "Connected";
    
    // Join admin room
    socket.emit("admin-join");
    
    // Request queue info
    socket.emit("get-queue");
});

socket.on("disconnect", () => {
    connectionStatus.className = "status-indicator disconnected";
    statusText.textContent = "Disconnected - Reconnecting...";
});

socket.on("reconnect", () => {
    console.log("Reconnected to server");
    connectionStatus.className = "status-indicator connected";
    statusText.textContent = "Connected";
    socket.emit("admin-join");
});

// New call comes in
socket.on("new-call", (user) => {
    console.log("New call:", user);
    
    // Check if already in list
    if (!waitingCalls.find(call => call.id === user.id)) {
    waitingCalls.push(user);
    updateStatsDisplay();
    addCallToList(user, true);
    
    // Show notifications
    showNewCallNotification(user);
    
    // Add to history
    addToHistory(user, 'new');
    }
});

// Show notifications for new call
function showNewCallNotification(user) {
    const userName = user.userData?.name || "Anonymous User";
    const phone = user.userData?.phone || 'No phone provided';
    
    // Play sound
    playNotificationSound();
    
    // Show desktop notification
    showDesktopNotification("📞 New Call Request", {
    body: `${userName} is waiting for support\nPhone: ${phone}`,
    tag: `call-${user.id}`,
    requireInteraction: true
    });
    
    // Show browser tab notification
    showBrowserTabNotification(`New call from ${userName}`);
}

// Remove call from list
socket.on("remove-call", ({ userId }) => {
    console.log("Remove call:", userId);
    waitingCalls = waitingCalls.filter(user => user.id !== userId);
    updateStatsDisplay();
    
    const callElement = document.getElementById(`call-${userId}`);
    if (callElement) {
    callElement.remove();
    }
    
    // Add to history
    const removedCall = waitingCalls.find(call => call.id === userId) || { id: userId };
    addToHistory(removedCall, 'removed');
});

// Admin accepted call - redirect to video call
socket.on("call-accepted-admin", ({ roomId, userId, userData }) => {
    console.log("Call accepted, redirecting to room:", roomId);
    
    // Remove from local list immediately
    waitingCalls = waitingCalls.filter(user => user.id !== userId);
    updateStatsDisplay();
    
    // Add to active calls
    activeCallsList.push({ roomId, userId, userData, acceptedAt: new Date() });
    updateStatsDisplay();
    
    // Add to history
    addToHistory({ id: userId, userData }, 'accepted');
    
    // Show redirect message with notification
    showDesktopNotification("✅ Call Accepted", {
    body: `Connecting to ${userData.name || "User"}`,
    icon: 'https://vaama.co/cdn/shop/files/vaama-logo.png'
    });
    
    // Show browser notification
    document.title = `✅ Connecting to ${userData.name} - Admin Panel`;
    setTimeout(() => {
    document.title = tabTitleOriginal;
    }, 3000);
    
    // Redirect after short delay
    setTimeout(() => {
    window.location.href = `/video-call?room=${roomId}&role=admin`;
    }, 500);
});

// Active rooms update
socket.on("active-rooms", ({ count, rooms }) => {
    console.log(`Active rooms: ${count}`, rooms);
    activeCallsList = rooms.map(roomId => ({ roomId }));
    updateStatsDisplay();
});

// Queue info response
socket.on("queue-info", ({ count, users, timestamp }) => {
    console.log(`Queue info: ${count} users`);
    waitingCalls = users;
    updateStatsDisplay();
    
    // Add all users to list (not as new)
    callList.innerHTML = '';
    users.forEach(user => addCallToList(user, false));
});

// Admin connected confirmation
socket.on("admin-connected", ({ socketId, waitingCount, timestamp }) => {
    console.log(`Admin ${socketId} connected with ${waitingCount} waiting calls`);
});

// Accept failed
socket.on("accept-failed", ({ reason, userId }) => {
    console.log(`Accept failed for ${userId}:`, reason);
    
    // Show notification
    showDesktopNotification("❌ Call Accept Failed", {
    body: `Could not accept call: ${reason}`,
    icon: 'https://vaama.co/cdn/shop/files/vaama-logo.png'
    });
});

// Add to call history
function addToHistory(call, action) {
    const historyItem = {
    id: call.id,
    name: call.userData?.name || "Unknown",
    phone: call.userData?.phone || "N/A",
    action: action,
    timestamp: new Date().toISOString(),
    userAgent: call.userData?.userAgent || ""
    };
    
    callHistory.unshift(historyItem);
    
    // Keep only last 50 items
    if (callHistory.length > 50) {
    callHistory = callHistory.slice(0, 50);
    }
    
    // Update total calls today
    updateTotalCallsToday();
}

// Update total calls today
function updateTotalCallsToday() {
    const today = new Date().toDateString();
    const todayCalls = callHistory.filter(item => 
    new Date(item.timestamp).toDateString() === today
    );
    totalCallsToday.textContent = todayCalls.length;
}

// Global function for accept button
window.acceptCall = function(userId) {
    console.log("Accepting call from:", userId);
    
    // Show accepting notification
    showDesktopNotification("⏳ Accepting Call...", {
    body: "Please wait while we connect the call",
    icon: 'https://vaama.co/cdn/shop/files/vaama-logo.png'
    });
    
    socket.emit("accept-call", { userId });
};

// Event Listeners for permission modal
allowNotificationsBtn.addEventListener('click', async () => {
    const granted = await requestBrowserNotificationPermission();
    hidePermissionModal();
    
    if (granted) {
    // Show success notification
    showDesktopNotification("✅ Notifications Enabled", {
        body: "You'll now receive notifications for new calls",
        icon: 'https://vaama.co/cdn/shop/files/vaama-logo.png'
    });
    }
});

denyNotificationsBtn.addEventListener('click', () => {
    hidePermissionModal();
    // Don't request permission, just close modal
});

askLaterBtn.addEventListener('click', () => {
    hidePermissionModal();
    // User can enable manually later
});

// Test sound button
testSoundBtn.addEventListener('click', () => {
    playNotificationSound();
});

// Test notification button
testNotificationBtn.addEventListener('click', async () => {
    if (Notification.permission !== "granted") {
    const granted = await requestBrowserNotificationPermission();
    if (!granted) {
        alert("Please allow notifications in your browser settings to see desktop notifications.");
        return;
    }
    }
    
    showDesktopNotification("🔔 Test Notification", {
    body: "This is a test notification from Live Support Admin Panel",
    icon: 'https://vaama.co/cdn/shop/files/vaama-logo.png',
    tag: 'test-notification'
    });
    
    // Also test browser tab notification
    showBrowserTabNotification("Test notification");
});

// Manage browser permissions button
managePermissionsBtn.addEventListener('click', () => {
    // This opens browser settings - exact behavior varies by browser
    if (Notification.permission === "denied") {
    alert("Notifications are blocked. Please go to your browser settings to enable them:\n\n" +
            "Chrome: Settings → Privacy and Security → Site Settings → Notifications\n" +
            "Firefox: Options → Privacy & Security → Permissions → Notifications → Settings\n" +
            "Safari: Preferences → Websites → Notifications");
    } else {
    // Try to show the permission request again
    requestBrowserNotificationPermission();
    }
});

// Save settings when toggles change
soundToggle.addEventListener('change', saveSettings);
desktopNotificationToggle.addEventListener('change', saveSettings);
browserTabNotificationToggle.addEventListener('change', saveSettings);

// Stop tab notifications when page becomes visible
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && notificationInterval) {
    clearInterval(notificationInterval);
    document.title = tabTitleOriginal;
    }
});

// Initialize
window.addEventListener('load', () => {
    // Load settings
    loadSettings();
    
    // Update notification status
    updateNotificationStatus();
    
    // Set original tab title
    tabTitleOriginal = document.title;
    
    // Update stats
    updateStatsDisplay();
    updateTotalCallsToday();
    
    // Focus on page to ensure notifications work
    window.focus();
    
    // Request notification permission on page load (shows modal)
    setTimeout(() => {
    requestNotificationPermission();
    }, 1000); // Small delay to let page load
});

// Keep connection alive
setInterval(() => {
    if (socket.connected) {
    socket.emit("ping");
    }
}, 30000);
