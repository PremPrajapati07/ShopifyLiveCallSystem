const socket = io(window.location.origin);
const params = new URLSearchParams(window.location.search);
const role = params.get("role") || "user";
const roomId = params.get("room");
const userName = params.get("name") || (role === "admin" ? "Support Agent" : "User");
const returnUrl = params.get("return_url") || "https://vaama.co";
const adminReturnUrl = params.get("admin_return_url") || "https://octastyle-jabbingly-doretha.ngrok-free.dev/admin";

let localStream = null;
let remoteStream = null;
let pc = null;
let videoEnabled = true;
let audioEnabled = true;
let screenShareActive = false;
let screenStream = null;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 3;
let peerConnectionConfigured = false;
let mediaStreamReady = false;
let iceCandidates = [];

// Chat state
let chatMessages = [];
let unreadMessages = 0;
let chatOpen = false;

// DOM Elements - Video Call
const statusEl = document.getElementById("status");
const connectionStatusEl = document.getElementById("connectionStatus");
const retryCountEl = document.getElementById("retryCount");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const localLabel = document.getElementById("localLabel");
const remoteLabel = document.getElementById("remoteLabel");
const toggleVideoBtn = document.getElementById("toggleVideo");
const toggleAudioBtn = document.getElementById("toggleAudio");
const toggleScreenBtn = document.getElementById("toggleScreen");
const endCallBtn = document.getElementById("endCall");
const permissionOverlay = document.getElementById("permissionOverlay");
const permissionMessage = document.getElementById("permissionMessage");
const permissionHint = document.getElementById("permissionHint");
const retryPermissionBtn = document.getElementById("retryPermission");
const skipPermissionBtn = document.getElementById("skipPermission");

// DOM Elements - Chat
const toggleChatBtn = document.getElementById("toggleChat");
const chatToggleIcon = document.getElementById("chatToggleIcon");
const unreadCountEl = document.getElementById("unreadCount");
const chatPanel = document.getElementById("chatPanel");
const closeChatBtn = document.getElementById("closeChat");
const chatUserName = document.getElementById("chatUserName");
const userReturnUrl = document.getElementById("userReturnUrl");
const returnUrlText = document.getElementById("returnUrlText");
const chatUserId = document.getElementById("chatUserId");
const chatMessagesEl = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const sendMessageBtn = document.getElementById("sendMessage");
const quickResponses = document.getElementById("quickResponses");
const quickResponseBtns = document.querySelectorAll(".quick-response-btn");
// Add to DOM Elements section
const catalogPanel = document.getElementById("catalogPanel");
const toggleCatalogBtn = document.getElementById("toggleCatalog");
const productsGrid = document.getElementById("productsGrid");
const productSearch = document.getElementById("productSearch");
const vendorFilter = document.getElementById("vendorFilter");
const typeFilter = document.getElementById("typeFilter");
const prevPage = document.getElementById("prevPage");
const nextPage = document.getElementById("nextPage");
const pageInfo = document.getElementById("pageInfo");
const productModal = document.getElementById("productModal");
const modalProductTitle = document.getElementById("modalProductTitle");
const modalProductImage = document.getElementById("modalProductImage");
const modalProductHandle = document.getElementById("modalProductHandle");
const modalProductVendor = document.getElementById("modalProductVendor");
const modalProductType = document.getElementById("modalProductType");
const modalProductPrice = document.getElementById("modalProductPrice");
const modalProductUrl = document.getElementById("modalProductUrl");
const copyUrlBtn = document.getElementById("copyUrl");
const sendProductBtn = document.getElementById("sendProduct");
const closeModalBtn = document.getElementById("closeModal");

// Add to variable declarations at the top
let products = [];
let filteredProducts = [];
let currentPage = 1;
let productsPerPage = 12;
let vendors = new Set();
let types = new Set();
let currentCatalogProduct = null;
let catalogInitialized = false;
// Update UI labels
localLabel.textContent = userName;
remoteLabel.textContent = role === "admin" ? "Customer" : "Support Agent";

// Update chat user info
chatUserName.textContent = userName;
returnUrlText.textContent = returnUrl;
userReturnUrl.href = returnUrl;

// Show quick responses only for admin
if (role === "admin") {
  quickResponses.style.display = "block";
}

// Apple device detection and fix
const isAppleDevice = /iPad|iPhone|iPod|Mac/.test(navigator.platform) || 
                      (navigator.userAgent.includes("Mac") && "ontouchend" in document);

// CHAT FUNCTIONS
function setupChat() {
  // Set up event listeners for chat
  toggleChatBtn.addEventListener("click", toggleChatPanel);
  closeChatBtn.addEventListener("click", () => {
    chatPanel.classList.remove("open");
    chatOpen = false;
    chatToggleIcon.textContent = "💬";
  });
  
  sendMessageBtn.addEventListener("click", sendMessage);
  chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  // Quick response buttons
  quickResponseBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const message = btn.getAttribute("data-message");
      chatInput.value = message;
      sendMessage();
    });
  });
  
  // Initialize chat with welcome message
  addChatMessage({
    sender: "system",
    message: "Chat connected. You can now message with the other person.",
    timestamp: new Date(),
    senderName: "System"
  });
  
  // If admin, request user info from server
  if (role === "admin" && roomId) {
    socket.emit("get-room-info", roomId);
  }
}

function toggleChatPanel() {
  if (chatPanel.classList.contains("open")) {
    chatPanel.classList.remove("open");
    chatOpen = false;
    chatToggleIcon.textContent = "💬";
    // Clear unread count when opening chat
    if (unreadMessages > 0) {
      unreadMessages = 0;
      updateUnreadCount();
    }
  } else {
    chatPanel.classList.add("open");
    chatOpen = true;
    chatToggleIcon.textContent = "✕";
    // Clear unread count when opening chat
    if (unreadMessages > 0) {
      unreadMessages = 0;
      updateUnreadCount();
    }
    // Scroll to bottom of chat
    scrollChatToBottom();
  }
}

function updateUnreadCount() {
  if (unreadMessages > 0 && !chatOpen) {
    unreadCountEl.textContent = unreadMessages;
    unreadCountEl.style.display = "inline";
    chatToggleIcon.textContent = "💬";
  } else {
    unreadCountEl.style.display = "none";
  }
}

function addChatMessage(messageData) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `chat-message ${messageData.sender}-message`;
  
  const time = new Date(messageData.timestamp).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  let senderName = messageData.senderName || messageData.sender;
  if (messageData.sender === "me") {
    senderName = "You";
  }
  
  messageDiv.innerHTML = `
    <div class="message-header">
      <span class="sender-name">${senderName}</span>
      <span class="message-time">${time}</span>
    </div>
    <div class="message-content">${escapeHtml(messageData.message)}</div>
  `;
  
  chatMessagesEl.appendChild(messageDiv);
  
  // Store message
  chatMessages.push(messageData);
  
  // Scroll to bottom
  scrollChatToBottom();
  
  // If chat is closed and message is from others, increment unread count
  if (!chatOpen && messageData.sender !== "me" && messageData.sender !== "system") {
    unreadMessages++;
    updateUnreadCount();
    
    // Show desktop notification for new message
    if (Notification.permission === "granted" && document.hidden) {
      new Notification(`New message from ${senderName}`, {
        body: messageData.message.substring(0, 100),
        icon: 'https://cdn.shopify.com/s/files/1/0634/8239/6854/files/Vaama_Logo_1_92bf71f9-3c40-4228-ad0a-9f81e8c62b5d.png?v=1751476446'
      });
    }
  }
}

function sendMessage() {
  const message = chatInput.value.trim();
  if (!message || !roomId) return;
  
  // Create message object
  const messageData = {
    sender: "me",
    message: message,
    timestamp: new Date(),
    senderName: userName,
    roomId: roomId
  };
  
  // Add to chat UI
  addChatMessage(messageData);
  
  // Send via socket
  socket.emit("chat-message", {
    room: roomId,
    message: message,
    senderName: userName,
    senderRole: role
  });
  
  // Clear input
  chatInput.value = "";
  
  // Auto-resize textarea
  chatInput.style.height = "auto";
}

function scrollChatToBottom() {
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
// Handle incoming chat messages
socket.on("chat-message", (data) => {
  const messageData = {
    sender: "other",
    message: data.message,
    timestamp: new Date(data.timestamp || Date.now()),
    senderName: data.senderName || (data.senderRole === "admin" ? "Support Agent" : "Customer")
  };
  
  addChatMessage(messageData);
});

// Handle room info response for admin
socket.on("room-info-response", (data) => {
  if (data.exists && data.data && role === "admin") {
    const userData = data.data.userData;
    if (userData) {
      // Update chat user info
      chatUserName.textContent = userData.name || "Customer";
      chatUserId.textContent = data.data.userId || "-";
      
      if (userData.returnUrl) {
        returnUrlText.textContent = userData.returnUrl;
        userReturnUrl.href = userData.returnUrl;
      }
      
      // Add system message about user info
      addChatMessage({
        sender: "system",
        message: `User joined from: ${userData.returnUrl || "Unknown source"}`,
        timestamp: new Date(),
        senderName: "System"
      });
    }
  }
});

// Handle peer joined event - update chat
socket.on("peer-joined", (data) => {
  addChatMessage({
    sender: "system",
    message: `${data.role === "admin" ? "Support agent" : "Customer"} has joined the call`,
    timestamp: new Date(),
    senderName: "System"
  });
});

// Handle media ready event
socket.on("peer-media-ready", (data) => {
  const mediaTypes = [];
  if (data.hasVideo) mediaTypes.push("video");
  if (data.hasAudio) mediaTypes.push("audio");
  
  if (mediaTypes.length > 0) {
    addChatMessage({
      sender: "system",
      message: `Other user has enabled ${mediaTypes.join(" and ")}`,
      timestamp: new Date(),
      senderName: "System"
    });
  }
});
// Handle single product received
// Handle single product received
socket.on("product-shared", (data) => {
  console.log("Received product:", data.product.title);
  
  // Don't show if it's from me (already shown optimistically)
  if (data.sender === socket.id) {
    return;
  }
  
  // Add to chat
  addProductToChat(data.product, false);
});

// Handle multiple products received
socket.on("products-shared", (data) => {
  console.log(`Received ${data.count} products`);
  
  // Don't show if it's from me
  if (data.sender === socket.id) {
    return;
  }
  
  // Add each product to chat
  data.products.forEach((product, index) => {
    setTimeout(() => {
      addProductToChat(product, false);
    }, index * 300); // Small delay between messages
  });
});
// Handle peer disconnected
socket.on("peer-disconnected", (data) => {
  addChatMessage({
    sender: "system",
    message: "Other user has disconnected. They may reconnect...",
    timestamp: new Date(),
    senderName: "System"
  });
});

// Handle user reconnected
socket.on("user-reconnected", (data) => {
  addChatMessage({
    sender: "system",
    message: "User has reconnected",
    timestamp: new Date(),
    senderName: "System"
  });
});

// Enhanced getLocalMedia with retry logic
async function getLocalMedia(retryCount = 0) {
  try {
    const constraints = {
      video: {
        width: { ideal: 1280, min: 640 },
        height: { ideal: 720, min: 480 },
        frameRate: { ideal: 30, min: 20 },
        // Apple-specific constraints
        ...(isAppleDevice && {
          facingMode: { ideal: "user" },
          aspectRatio: { ideal: 1.7777777778 } // 16:9
        })
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    };

    // For Apple devices or if user denied camera, try with just audio first
    if (isAppleDevice && retryCount > 0) {
      constraints.video = false;
      permissionMessage.textContent = "Trying with audio only...";
    }

    console.log("Requesting media with constraints:", constraints);
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    
    // Check if we actually got video
    const videoTracks = localStream.getVideoTracks();
    if (videoTracks.length > 0) {
      console.log("Got video track:", videoTracks[0].label);
      videoEnabled = true;
    } else {
      console.log("No video track available, using audio only");
      videoEnabled = false;
      toggleVideoBtn.textContent = "Camera Not Available";
      toggleVideoBtn.disabled = true;
      toggleVideoBtn.classList.add("inactive");
    }

    // Check audio
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length > 0) {
      console.log("Got audio track:", audioTracks[0].label);
      audioEnabled = true;
    } else {
      console.log("No audio track available");
      audioEnabled = false;
      toggleAudioBtn.textContent = "Microphone Not Available";
      toggleAudioBtn.disabled = true;
      toggleAudioBtn.classList.add("inactive");
    }

    localVideo.srcObject = localStream;
    mediaStreamReady = true;
    
    // Hide permission overlay if shown
    permissionOverlay.style.display = "none";
    
    return true;
  } catch (err) {
    console.error("Error accessing media devices (attempt " + retryCount + "):", err.name, err.message);
    
    if (retryCount < MAX_CONNECTION_ATTEMPTS) {
      // Show user-friendly error message
      permissionMessage.textContent = "Please allow camera and microphone access";
      permissionHint.textContent = "Click 'Allow' when prompted by your browser";
      permissionOverlay.style.display = "flex";
      
      return new Promise(resolve => {
        setTimeout(async () => {
          const success = await getLocalMedia(retryCount + 1);
          resolve(success);
        }, 1000);
      });
    } else {
      // Max attempts reached
      permissionMessage.textContent = "Unable to access camera or microphone";
      permissionHint.textContent = "Please check your browser permissions and refresh the page";
      permissionOverlay.style.display = "flex";
      return false;
    }
  }
}

function createPeerConnection() {
  if (pc) {
    pc.close();
    pc = null;
  }

  const config = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" }
    ],
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
  };

  // Apple-specific RTCPeerConnection config
  if (isAppleDevice) {
    config.sdpSemantics = 'unified-plan';
    config.iceCandidatePoolSize = 5;
  }

  pc = new RTCPeerConnection(config);

  // Handle incoming remote tracks
  pc.ontrack = (event) => {
    console.log("Received remote track:", event.track.kind);
    if (!remoteVideo.srcObject) {
      remoteVideo.srcObject = event.streams[0];
      remoteStream = event.streams[0];
    }
  };

  // ICE candidate handling with buffering
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log("Generated ICE candidate:", event.candidate.type);
      // Buffer candidates if socket not ready
      if (socket.connected && peerConnectionConfigured) {
        socket.emit("ice", { room: roomId, candidate: event.candidate });
      } else {
        iceCandidates.push(event.candidate);
      }
    } else {
      console.log("All ICE candidates generated");
      // Send buffered candidates
      flushIceCandidates();
    }
  };

  // Connection state changes
  pc.onconnectionstatechange = () => {
    console.log("Connection state changed to:", pc.connectionState);
    connectionStatusEl.textContent = `Connection: ${pc.connectionState}`;
    
    switch(pc.connectionState) {
      case "connected":
        statusEl.textContent = "Call Connected";
        connectionStatusEl.style.color = "#4CAF50";
        addChatMessage({
          sender: "system",
          message: "Video call connection established",
          timestamp: new Date(),
          senderName: "System"
        });
        break;
      case "disconnected":
        statusEl.textContent = "Reconnecting...";
        connectionStatusEl.style.color = "#ff9800";
        addChatMessage({
          sender: "system",
          message: "Video connection lost. Attempting to reconnect...",
          timestamp: new Date(),
          senderName: "System"
        });
        // Try to reconnect
        setTimeout(reconnectIfNeeded, 1000);
        break;
      case "failed":
        statusEl.textContent = "Connection Failed";
        connectionStatusEl.style.color = "#f44336";
        addChatMessage({
          sender: "system",
          message: "Video connection failed",
          timestamp: new Date(),
          senderName: "System"
        });
        reconnectIfNeeded();
        break;
      case "closed":
        statusEl.textContent = "Call Ended";
        break;
    }
  };

  // ICE connection state
  pc.oniceconnectionstatechange = () => {
    console.log("ICE connection state:", pc.iceConnectionState);
    
    // Handle ICE failures
    if (pc.iceConnectionState === "failed") {
      console.log("ICE connection failed, restarting ICE...");
      pc.restartIce();
    } else if (pc.iceConnectionState === "disconnected") {
      console.log("ICE disconnected, attempting to reconnect...");
      setTimeout(reconnectIfNeeded, 2000);
    }
  };

  // Signaling state
  pc.onsignalingstatechange = () => {
    console.log("Signaling state:", pc.signalingState);
  };

  peerConnectionConfigured = true;
}

// Flush buffered ICE candidates
function flushIceCandidates() {
  if (socket.connected && peerConnectionConfigured) {
    while (iceCandidates.length > 0) {
      const candidate = iceCandidates.shift();
      socket.emit("ice", { room: roomId, candidate: candidate });
    }
  }
}

// Reconnect logic
function reconnectIfNeeded() {
  if (connectionAttempts < MAX_CONNECTION_ATTEMPTS && 
      pc && 
      (pc.connectionState === "failed" || pc.connectionState === "disconnected")) {
    
    connectionAttempts++;
    retryCountEl.textContent = `Retry attempt ${connectionAttempts} of ${MAX_CONNECTION_ATTEMPTS}`;
    
    console.log(`Reconnection attempt ${connectionAttempts}`);
    statusEl.textContent = `Reconnecting... (${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS})`;
    
    // Create new offer if we're the initiator
    if (role === "admin") {
      setTimeout(createAndSendOffer, 1000);
    }
  } else if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
    statusEl.textContent = "Failed to establish connection";
    connectionStatusEl.textContent = "Please refresh the page or try again";
  }
}

async function createAndSendOffer() {
  try {
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
      voiceActivityDetection: true
    });
    
    // For Apple Safari
    if (isAppleDevice) {
      // Apply codec preferences for Safari
      offer.sdp = preferCodec(offer.sdp, 'H264');
    }
    
    await pc.setLocalDescription(offer);
    socket.emit("offer", { room: roomId, offer });
    console.log("Offer created and sent");
  } catch (err) {
    console.error("Error creating offer:", err);
    setTimeout(createAndSendOffer, 1000);
  }
}

// Helper function for Safari codec preferences
function preferCodec(sdp, codec) {
  const lines = sdp.split('\n');
  let mLineIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('m=video')) {
      mLineIndex = i;
      break;
    }
  }
  
  if (mLineIndex === -1) return sdp;
  
  // Reorder codecs
  const parts = lines[mLineIndex].split(' ');
  for (let i = 3; i < parts.length; i++) {
    if (parts[i] === codec) {
      // Move preferred codec to front
      [parts[3], parts[i]] = [parts[i], parts[3]];
      break;
    }
  }
  
  lines[mLineIndex] = parts.join(' ');
  return lines.join('\n');
}

// Function to handle redirection after call ends
function redirectAfterCall() {
  let redirectUrl;
  
  if (role === "admin") {
    // Admin redirects to admin_return_url or default admin URL
    redirectUrl = adminReturnUrl;
    console.log(`Admin redirecting to: ${redirectUrl}`);
  } else {
    // User redirects to their original return_url or default URL
    redirectUrl = returnUrl;
    console.log(`User redirecting to: ${redirectUrl}`);
  }
  
  // Notify server that user is leaving (optional)
  socket.emit("leave-room", roomId);
  
  // Small delay before redirect to ensure cleanup is done
  setTimeout(() => {
    window.location.href = redirectUrl;
  }, 300);
}

async function joinRoom() {
  if (!roomId) {
    statusEl.textContent = "Error: No room ID provided";
    return;
  }

  statusEl.textContent = `Joining room: ${roomId}`;
  
  // Step 1: Get local media FIRST
  const mediaSuccess = await getLocalMedia();
  if (!mediaSuccess) {
    statusEl.textContent = "Waiting for media permissions...";
    return;
  }

  // Step 2: Join the socket.io room
  socket.emit("join-room", roomId);
  console.log(`Joined room ${roomId} as ${role}`);
  
  // Step 3: Create peer connection AFTER media is ready
  createPeerConnection();
  
  // Step 4: Add tracks to peer connection
  if (localStream) {
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
      console.log(`Added ${track.kind} track to peer connection`);
    });
  }
  
  // Step 5: Notify server we've joined successfully
  socket.emit("room-joined", { room: roomId, role: role });
  
  // Step 6: Setup chat
  setupChat();
  
  // Auto-open chat for admin
if (role === "admin") {
  setTimeout(() => {
    initializeCatalog();
    setupCatalogEventListeners();
  }, 1500);
}
}

// Socket event handlers
socket.on("user-joined", async ({ id }) => {
  console.log("Other user joined:", id);
  
  if (role === "admin") {
    statusEl.textContent = "Customer joined the call";
  } else {
    statusEl.textContent = "Support agent joined the call";
  }

  // Wait a bit to ensure peer connection is ready
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Create and send offer
  await createAndSendOffer();
});

socket.on("offer", async (offer) => {
  console.log("Received offer");
  
  // Ensure we have media before handling offer
  if (!mediaStreamReady) {
    console.log("Waiting for media before handling offer...");
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  try {
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    
    // For Apple Safari - handle special cases
    if (isAppleDevice && pc.signalingState === 'stable') {
      // Safari may need explicit addTrack
      if (localStream) {
        localStream.getTracks().forEach(track => {
          if (!pc.getSenders().some(sender => sender.track === track)) {
            pc.addTrack(track, localStream);
          }
        });
      }
    }
    
    const answer = await pc.createAnswer({
      voiceActivityDetection: true
    });
    
    // For Apple Safari
    if (isAppleDevice) {
      answer.sdp = preferCodec(answer.sdp, 'H264');
    }
    
    await pc.setLocalDescription(answer);
    socket.emit("answer", { room: roomId, answer });
    
    // Send buffered ICE candidates
    flushIceCandidates();
  } catch (err) {
    console.error("Error handling offer:", err);
    // Retry handling offer
    setTimeout(() => socket.emit("offer", { room: roomId, offer }), 1000);
  }
});

socket.on("answer", async (answer) => {
  console.log("Received answer");
  try {
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
    // Send buffered ICE candidates
    flushIceCandidates();
  } catch (err) {
    console.error("Error handling answer:", err);
  }
});

socket.on("ice", async (candidate) => {
  try {
    if (candidate && pc && pc.remoteDescription) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } else if (candidate) {
      // Buffer candidate if remote description not set yet
      iceCandidates.push(candidate);
    }
  } catch (err) {
    console.error("Error adding ICE candidate:", err);
  }
});

socket.on("connection-timeout", () => {
  statusEl.textContent = "Connection timeout";
  connectionStatusEl.textContent = "Please refresh the page and try again";
  permissionMessage.textContent = "Connection timeout. Please try again.";
  permissionOverlay.style.display = "flex";
});

socket.on("disconnect", () => {
  statusEl.textContent = "Disconnected from server";
  connectionStatusEl.textContent = "Attempting to reconnect...";
  
  // Try to reconnect to socket
  setTimeout(() => {
    if (!socket.connected) {
      socket.connect();
    }
  }, 2000);
});

socket.on("reconnect", () => {
  console.log("Reconnected to server");
  statusEl.textContent = "Reconnected to server";
  
  // Rejoin room
  if (roomId && pc) {
    socket.emit("join-room", roomId);
    // Re-send ICE candidates
    flushIceCandidates();
  }
});

// Handle when other party ends the call
socket.on("call-ended", () => {
  statusEl.textContent = "Other party ended the call";
  connectionStatusEl.textContent = "Redirecting...";
  
  // Add chat message
  addChatMessage({
    sender: "system",
    message: "Call ended by other party",
    timestamp: new Date(),
    senderName: "System"
  });
  
  // Clean up
  if (pc) {
    pc.close();
  }
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  
  // Redirect after a short delay
  setTimeout(redirectAfterCall, 1000);
});

// Control buttons
toggleVideoBtn.onclick = () => {
  if (!localStream) return;
  videoEnabled = !videoEnabled;
  localStream.getVideoTracks().forEach(track => {
    track.enabled = videoEnabled;
  });
  toggleVideoBtn.textContent = videoEnabled ? "Turn Off Camera" : "Turn On Camera";
  toggleVideoBtn.classList.toggle("inactive", !videoEnabled);
  
  // Notify in chat
  addChatMessage({
    sender: "system",
    message: `You ${videoEnabled ? "enabled" : "disabled"} your camera`,
    timestamp: new Date(),
    senderName: "System"
  });
};

toggleAudioBtn.onclick = () => {
  if (!localStream) return;
  audioEnabled = !audioEnabled;
  localStream.getAudioTracks().forEach(track => {
    track.enabled = audioEnabled;
  });
  toggleAudioBtn.textContent = audioEnabled ? "Mute Microphone" : "Unmute Microphone";
  toggleAudioBtn.classList.toggle("inactive", !audioEnabled);
  
  // Notify in chat
  addChatMessage({
    sender: "system",
    message: `You ${audioEnabled ? "unmuted" : "muted"} your microphone`,
    timestamp: new Date(),
    senderName: "System"
  });
};

toggleScreenBtn.onclick = async () => {
  if (screenShareActive) {
    // Stop screen share
    screenStream.getTracks().forEach(track => track.stop());
    localVideo.srcObject = localStream;
    screenShareActive = false;
    toggleScreenBtn.textContent = "Share Screen";
    toggleScreenBtn.classList.remove("inactive");
    
    // Notify in chat
    addChatMessage({
      sender: "system",
      message: "You stopped screen sharing",
      timestamp: new Date(),
      senderName: "System"
    });
  } else {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: "always",
          displaySurface: "monitor"
        },
        audio: true
      });
      
      // Replace video track
      const videoTrack = screenStream.getVideoTracks()[0];
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) {
        sender.replaceTrack(videoTrack);
      }
      
      // Update local video display
      localVideo.srcObject = screenStream;
      screenShareActive = true;
      toggleScreenBtn.textContent = "Stop Sharing";
      toggleScreenBtn.classList.add("inactive");
      
      // Notify in chat
      addChatMessage({
        sender: "system",
        message: "You started screen sharing",
        timestamp: new Date(),
        senderName: "System"
      });
      
      // When screen sharing stops
      videoTrack.onended = () => {
        if (screenShareActive) {
          toggleScreenBtn.click();
        }
      };
    } catch (err) {
      console.error("Error sharing screen:", err);
    }
  }
};

endCallBtn.onclick = () => {
  // Notify other party that call is ending
  socket.emit("end-call", { room: roomId });
  
  // Add chat message
  addChatMessage({
    sender: "system",
    message: "You ended the call",
    timestamp: new Date(),
    senderName: "System"
  });
  
  // Clean up resources
  if (pc) {
    pc.close();
  }
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
  }
  
  // Update UI
  statusEl.textContent = "Call ended";
  connectionStatusEl.textContent = "Redirecting...";
  
  // Redirect based on role
  redirectAfterCall();
};

// Permission retry button
retryPermissionBtn.onclick = async () => {
  permissionOverlay.style.display = "none";
  statusEl.textContent = "Requesting permissions...";
  const success = await getLocalMedia();
  if (success && !peerConnectionConfigured) {
    createPeerConnection();
  }
};

// Skip permission button (audio only)
skipPermissionBtn.onclick = async () => {
  try {
    // Try to get audio only
    localStream = await navigator.mediaDevices.getUserMedia({ 
      audio: true,
      video: false 
    });
    localVideo.srcObject = null;
    localLabel.textContent = "Audio Only";
    videoEnabled = false;
    toggleVideoBtn.textContent = "Camera Not Available";
    toggleVideoBtn.disabled = true;
    toggleVideoBtn.classList.add("inactive");
    mediaStreamReady = true;
    permissionOverlay.style.display = "none";
    
    if (!peerConnectionConfigured) {
      createPeerConnection();
    }
  } catch (err) {
    console.error("Failed to get audio only:", err);
  }
};

// Initialize
window.addEventListener("load", () => {
  if (roomId) {
    // Show status immediately
    statusEl.textContent = `In call as ${role === 'admin' ? 'Support Agent' : userName}`;
    
    // Start connection process
    setTimeout(joinRoom, 100); // Small delay to ensure DOM is ready
  } else {
    statusEl.textContent = "Error: No room ID provided";
    connectionStatusEl.textContent = "Please start a call from the main page";
  }
});

// Handle page refresh/close
window.addEventListener("beforeunload", () => {
  // Notify server that user is leaving
  socket.emit("leave-room", roomId);
});

// Request notification permission for chat notifications
if (Notification.permission === "default") {
  Notification.requestPermission();
}


function initializeCatalog() {
  // Only show catalog for admin
  if (role !== "admin") {
    return;
  }
  
  // Show catalog panel
  catalogPanel.style.display = "block";
  
  // Setup catalog toggle
  toggleCatalogBtn.addEventListener("click", () => {
    catalogPanel.classList.toggle("collapsed");
    toggleCatalogBtn.textContent = catalogPanel.classList.contains("collapsed") ? "▶" : "▼";
  });
  
  // Load products
  loadProducts();
  
  // Setup modal events
  setupModalEvents();
  
  catalogInitialized = true;
}

async function loadProducts() {
  try {
    console.log('Loading product catalog...');
    const response = await fetch('/data/products_catalog.json');
    const data = await response.json();
    
    products = data.products || [];
    console.log(`Loaded ${products.length} products`);
    
    // Extract vendors and types for filters
    products.forEach(product => {
      if (product.vendor) vendors.add(product.vendor);
      if (product.product_type) types.add(product.product_type);
    });
    
    // Populate filter dropdowns
    populateFilters();
    
    // Initial render
    filterProducts();
    renderProducts();
    
  } catch (error) {
    console.error('Error loading product catalog:', error);
    productsGrid.innerHTML = `
      <div class="error-message">
        <p>⚠️ Could not load product catalog</p>
        <p>Please ensure products_catalog.json exists in /data folder</p>
        <button onclick="loadProducts()">Retry</button>
      </div>
    `;
  }
}

function populateFilters() {
  // Clear existing options except first
  while (vendorFilter.options.length > 1) vendorFilter.remove(1);
  while (typeFilter.options.length > 1) typeFilter.remove(1);
  
  // Vendor filter
  const vendorOptions = Array.from(vendors).sort();
  vendorOptions.forEach(vendor => {
    const option = document.createElement('option');
    option.value = vendor;
    option.textContent = vendor;
    vendorFilter.appendChild(option);
  });
  
  // Type filter
  const typeOptions = Array.from(types).sort();
  typeOptions.forEach(type => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type;
    typeFilter.appendChild(option);
  });
}

function filterProducts() {
  const searchTerm = productSearch.value.toLowerCase();
  const selectedVendor = vendorFilter.value;
  const selectedType = typeFilter.value;
  
  filteredProducts = products.filter(product => {
    // Search term filter
    if (searchTerm && !product.search_terms.toLowerCase().includes(searchTerm)) {
      return false;
    }
    
    // Vendor filter
    if (selectedVendor && product.vendor !== selectedVendor) {
      return false;
    }
    
    // Type filter
    if (selectedType && product.product_type !== selectedType) {
      return false;
    }
    
    return true;
  });
  
  currentPage = 1;
  updatePagination();
}

function renderProducts() {
  if (filteredProducts.length === 0) {
    productsGrid.innerHTML = `
      <div class="no-products">
        <p>No products found</p>
        <p>Try adjusting your search or filters</p>
      </div>
    `;
    return;
  }
  
  // Calculate pagination
  const startIndex = (currentPage - 1) * productsPerPage;
  const endIndex = startIndex + productsPerPage;
  const pageProducts = filteredProducts.slice(startIndex, endIndex);
  
  // Render products grid
  productsGrid.innerHTML = '';
  
  pageProducts.forEach(product => {
    const productCard = createProductCard(product);
    productsGrid.appendChild(productCard);
  });
  
  updatePagination();
}

function createProductCard(product) {
  const card = document.createElement('div');
  card.className = 'product-card';
  
  // Truncate long titles
  const title = product.title.length > 50 
    ? product.title.substring(0, 50) + '...' 
    : product.title;
  
  // Handle image URL
  let imageUrl = product.image_url || '';
  if (imageUrl && !imageUrl.startsWith('http')) {
    if (imageUrl.startsWith('//')) {
      imageUrl = 'https:' + imageUrl;
    } else if (imageUrl.startsWith('/')) {
      imageUrl = 'https://vaama.co' + imageUrl;
    }
  }
  
  // Product image or placeholder
  const imageHtml = imageUrl 
    ? `<img src="${imageUrl}" alt="${product.title}" class="product-image" onerror="this.onerror=null; this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9IiNmMmYyZjIiPjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIi8+PHRleHQgeD0iNTAiIHk9IjUwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTIiIGZpbGw9IiNjY2MiPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg=='">`
    : `<div class="no-image">No Image</div>`;
  
  card.innerHTML = `
    <div class="product-image-container">
      ${imageHtml}
      <div class="product-actions">
        <button class="view-btn" data-handle="${product.handle}">👁️ View</button>
        <button class="send-btn" data-handle="${product.handle}">📤 Send</button>
      </div>
    </div>
    <div class="product-info">
      <h4 class="product-title" title="${product.title}">${title}</h4>
      <p class="product-handle">${product.handle}</p>
      <p class="product-price">${product.price || 'N/A'}</p>
      <div class="product-meta">
        <span class="vendor">${product.vendor || 'N/A'}</span>
        <span class="type">${product.product_type || 'N/A'}</span>
      </div>
    </div>
  `;
  
  // Add event listeners
  const viewBtn = card.querySelector('.view-btn');
  const sendBtn = card.querySelector('.send-btn');
  
  viewBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showProductModal(product);
  });
  
  sendBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sendProductToCall(product);
  });
  
  return card;
}

function sendProductToCall(product) {
  if (!roomId) {
    alert('No active call to send product to');
    return;
  }
  
  console.log('Sending product to call:', product.title);
  
  // Prepare product data
  const productData = {
    title: product.title,
    url: product.product_url,
    image: product.image_url || '',
    price: product.price || '',
    handle: product.handle,
    vendor: product.vendor || '',
    product_type: product.product_type || ''
  };
  
  // Send via socket
  socket.emit("send-product", {
    room: roomId,
    product: productData
  });
  
  // Also add to chat immediately (optimistic update)
  addProductToChat(productData, true);
  
  // Show success toast
  showToast(`✅ Sent "${product.title}" to chat`);
}
function addProductToChat(product, isFromMe = false) {
  const timestamp = new Date();
  
  // Create product message HTML
  const productCard = createProductChatCard(product, isFromMe);
  
  // Create message container
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${isFromMe ? 'me-message' : 'other-message'} product-message`;
  
  // Add sender info if not from me
  if (!isFromMe) {
    const senderName = role === "admin" ? "Customer" : "Support Agent";
    const time = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'message-header';
    headerDiv.innerHTML = `
      <span class="sender-name">${senderName}</span>
      <span class="message-time">${time}</span>
    `;
    messageDiv.appendChild(headerDiv);
  }
  
  // Add product card
  messageDiv.appendChild(productCard);
  
  // Add to chat
  chatMessagesEl.appendChild(messageDiv);
  
  // Scroll to bottom
  scrollChatToBottom();
  
  // If chat is closed and message is from others, increment unread count
  if (!chatOpen && !isFromMe) {
    unreadMessages++;
    updateUnreadCount();
    
    // Show desktop notification
    if (Notification.permission === "granted" && document.hidden) {
      new Notification(`📦 Product Shared: ${product.title}`, {
        body: product.url,
        icon: product.image || 'https://cdn.shopify.com/s/files/1/0634/8239/6854/files/Vaama_Logo_1_92bf71f9-3c40-4228-ad0a-9f81e8c62b5d.png?v=1751476446'
      });
    }
  }
}

function createProductChatCard(product, isFromMe = false) {
  const productCard = document.createElement('div');
  productCard.className = 'product-chat-card';
  
  // Handle image URL
  let imageUrl = product.image || '';
  if (imageUrl && !imageUrl.startsWith('http')) {
    if (imageUrl.startsWith('//')) {
      imageUrl = 'https:' + imageUrl;
    } else if (imageUrl.startsWith('/')) {
      imageUrl = 'https://vaama.co' + imageUrl;
    }
  }
  
  // If no image, use placeholder
  if (!imageUrl) {
    imageUrl = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9IiNmMmYyZjIiPjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIi8+PHRleHQgeD0iNTAiIHk9IjUwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTIiIGZpbGw9IiNjY2MiPlByb2R1Y3Q8L3RleHQ+PC9zdmc+';
  }
  
  // Truncate title
  const title = product.title.length > 60 
    ? product.title.substring(0, 60) + '...' 
    : product.title;
  
  productCard.innerHTML = `
    <div class="product-chat-image">
      <img src="${imageUrl}" alt="${product.title}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9IiNmMmYyZjIiPjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIi8+PHRleHQgeD0iNTAiIHk9IjUwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTIiIGZpbGw9IiNjY2MiPlByb2R1Y3Q8L3RleHQ+PC9zdmc+'">
    </div>
    <div class="product-chat-info">
      <h4 class="product-chat-title">${escapeHtml(title)}</h4>
      ${product.price ? `<p class="product-chat-price">${escapeHtml(product.price)}</p>` : ''}
      ${product.vendor ? `<p class="product-chat-vendor">${escapeHtml(product.vendor)}</p>` : ''}
      <a href="${product.url}" target="_blank" class="product-chat-link">
        View Product →
      </a>
    </div>
  `;
  
  return productCard;
}
function showProductModal(product) {
  currentCatalogProduct = product;
  
  modalProductTitle.textContent = product.title;
  modalProductHandle.textContent = product.handle;
  modalProductVendor.textContent = product.vendor || 'N/A';
  modalProductType.textContent = product.product_type || 'N/A';
  modalProductPrice.textContent = product.price || 'N/A';
  modalProductUrl.textContent = product.product_url;
  modalProductUrl.href = product.product_url;
  
  // Handle image URL for modal
  let imageUrl = product.image_url || '';
  if (imageUrl && !imageUrl.startsWith('http')) {
    if (imageUrl.startsWith('//')) {
      imageUrl = 'https:' + imageUrl;
    } else if (imageUrl.startsWith('/')) {
      imageUrl = 'https://vaama.co' + imageUrl;
    }
  }
  
  if (imageUrl) {
    modalProductImage.src = imageUrl;
    modalProductImage.style.display = 'block';
  } else {
    modalProductImage.style.display = 'none';
  }
  
  productModal.style.display = 'flex';
}

function setupModalEvents() {
  copyUrlBtn.addEventListener('click', () => {
    if (currentCatalogProduct) {
      navigator.clipboard.writeText(currentCatalogProduct.product_url)
        .then(() => {
          showToast('✅ Product URL copied to clipboard!');
        })
        .catch(err => {
          console.error('Failed to copy:', err);
          alert('Failed to copy URL');
        });
    }
  });
  
  sendProductBtn.addEventListener('click', () => {
    if (currentCatalogProduct) {
      sendProductToCall(currentCatalogProduct);
      productModal.style.display = 'none';
    }
  });
  
  closeModalBtn.addEventListener('click', () => {
    productModal.style.display = 'none';
  });
  
  productModal.addEventListener('click', (e) => {
    if (e.target === productModal) {
      productModal.style.display = 'none';
    }
  });
}

function updatePagination() {
  const totalPages = Math.ceil(filteredProducts.length / productsPerPage);
  
  pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  prevPage.disabled = currentPage === 1;
  nextPage.disabled = currentPage === totalPages || totalPages === 0;
  
  // Update pagination buttons
  prevPage.onclick = () => {
    if (currentPage > 1) {
      currentPage--;
      renderProducts();
    }
  };
  
  nextPage.onclick = () => {
    if (currentPage < totalPages) {
      currentPage++;
      renderProducts();
    }
  };
}

function showToast(message) {
  // Remove existing toast
  const existingToast = document.querySelector('.toast');
  if (existingToast) {
    existingToast.remove();
  }
  
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
function setupCatalogEventListeners() {
  if (role !== "admin") return;
  
  // Search input with debounce
  let searchTimeout;
  productSearch.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      filterProducts();
      renderProducts();
    }, 300);
  });
  
  // Filter changes
  vendorFilter.addEventListener('change', () => {
    filterProducts();
    renderProducts();
  });
  
  typeFilter.addEventListener('change', () => {
    filterProducts();
    renderProducts();
  });
}