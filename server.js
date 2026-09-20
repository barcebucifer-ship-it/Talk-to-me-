const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  maxHttpBufferSize: 25e6,
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();
const ROOM_GRACE = 5 * 60 * 1000;

function makeId() {
  return crypto.randomBytes(6).toString("hex");
}

function makeToken() {
  return crypto.randomBytes(24).toString("hex");
}

function deleteTimer(room) {
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }
}

io.on("connection", socket => {

  socket.on("create-room", cb => {
    let roomId;

    do {
      roomId = makeId();
    } while (rooms.has(roomId));

    const hostToken = makeToken();

    rooms.set(roomId, {
      host: socket.id,
      hostToken,
      guest: null,
      pending: null,
      timer: null
    });

    socket.data.roomId = roomId;
    socket.data.role = "host";
    socket.join(roomId);

    cb({
      ok: true,
      roomId,
      hostToken
    });
  });

  socket.on("restore-host", ({ roomId, hostToken }, cb) => {
    const room = rooms.get(roomId);

    if (!room || room.hostToken !== hostToken) {
      return cb({ ok: false });
    }

    deleteTimer(room);

    room.host = socket.id;

    socket.data.roomId = roomId;
    socket.data.role = "host";
    socket.join(roomId);

    cb({ ok: true });

    if (room.pending) {
      socket.emit("join-request", {
        socketId: room.pending
      });
    }
  });

  socket.on("request-join", ({ roomId }, cb) => {
    const room = rooms.get(roomId);

    if (!room) {
      return cb({
        ok: false,
        reason: "Esta sala ya no existe."
      });
    }

    if (room.guest) {
      return cb({
        ok: false,
        reason: "La sala ya tiene dos personas."
      });
    }

    room.pending = socket.id;

    socket.data.roomId = roomId;
    socket.data.role = "pending";

    if (room.host) {
      io.to(room.host).emit("join-request", {
        socketId: socket.id
      });
    }

    cb({
      ok: true,
      waiting: true
    });
  });

  socket.on("approve", ({ roomId, socketId, allow }) => {
    const room = rooms.get(roomId);

    if (
      !room ||
      room.host !== socket.id ||
      room.pending !== socketId
    ) return;

    if (!allow) {
      io.to(socketId).emit("join-denied");
      room.pending = null;
      return;
    }

    room.guest = socketId;
    room.pending = null;

    const guest = io.sockets.sockets.get(socketId);

    if (guest) {
      guest.data.roomId = roomId;
      guest.data.role = "guest";
      guest.join(roomId);
    }

    io.to(socketId).emit("join-approved", { roomId });
    io.to(room.host).emit("peer-ready", { initiator: true });
  });

  socket.on("signal", ({ roomId, data }) => {
    socket.to(roomId).emit("signal", data);
  });

  socket.on("chat", ({ roomId, message }) => {
    socket.to(roomId).emit("chat", message);
  });

  socket.on("file", ({ roomId, name, type, data }) => {
    socket.to(roomId).emit("file", {
      name,
      type,
      data
    });
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;

    if (!roomId) return;

    const room = rooms.get(roomId);

    if (!room) return;

    if (room.host === socket.id) {
      room.host = null;

      deleteTimer(room);

      room.timer = setTimeout(() => {
        const current = rooms.get(roomId);

        if (current && !current.host) {
          if (current.guest) {
            io.to(current.guest).emit("room-ended");
          }

          if (current.pending) {
            io.to(current.pending).emit("room-ended");
          }

          rooms.delete(roomId);
        }
      }, ROOM_GRACE);

      return;
    }

    if (room.guest === socket.id) {
      room.guest = null;

      if (room.host) {
        io.to(room.host).emit("peer-left");
      }
    }

    if (room.pending === socket.id) {
      room.pending = null;
    }
  });
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Talk To Me listo en puerto ${PORT}`);
});
