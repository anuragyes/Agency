// ─────────────────────────────────────────────────────────────
// services/inbox/socketService.js — Real-time Socket.IO gateway
//
// OPTIMIZATION #1:
// Socket.IO is NOT used to receive raw incoming webhook traffic.
// Instead, Socket.IO only pushes verified, filtered, or AI-processed
// updates to the brand dashboard.
// ─────────────────────────────────────────────────────────────
const { Server } = require("socket.io");

let ioInstance = null;

/**
 * Initialize Socket.IO with the HTTP server
 * @param {import("http").Server} httpServer
 */
function initSocket(httpServer) {
  if (ioInstance) return ioInstance;

  ioInstance = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PATCH"],
    },
  });

  ioInstance.on("connection", (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    // Join brand room if needed
    socket.on("join_brand", (brandId) => {
      const room = `brand_${brandId || "default"}`;
      socket.join(room);
      console.log(`[Socket.IO] ${socket.id} joined ${room}`);
    });

    socket.on("disconnect", () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });

  return ioInstance;
}

/**
 * Get the active Socket.IO server instance
 */
function getIo() {
  return ioInstance;
}

/**
 * Emit an update to the brand dashboard (only relevant updates!)
 * @param {string} event
 * @param {any} data
 */
function notifyDashboard(event, data) {
  if (!ioInstance) {
    console.warn(`[Socket.IO] Cannot emit "${event}": Socket.IO not initialized yet.`);
    return;
  }
  // Emit to all connected dashboards or room
  ioInstance.emit(event, data);
  console.log(`[Socket.IO] Emitted "${event}" to dashboard (optimized update)`);
}

module.exports = {
  initSocket,
  getIo,
  notifyDashboard,
};
