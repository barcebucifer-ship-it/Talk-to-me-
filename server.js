const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 25e6 });
app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

io.on("connection", socket => {
  socket.on("create-room", cb => {
    let id;
    do { id = crypto.randomBytes(5).toString("hex"); } while (rooms.has(id));
    rooms.set(id, { host: socket.id, guest: null, pending: null });
    socket.join(id);
    cb({ roomId:id, hostToken: socket.id });
  });

  socket.on("request-join", ({roomId}, cb) => {
    const r=rooms.get(roomId);
    if(!r) return cb({ok:false, reason:"Esta sala ya no existe."});
    if(r.guest) return cb({ok:false, reason:"La sala ya tiene dos personas."});
    r.pending=socket.id;
    socket.to(r.host).emit("join-request", {socketId:socket.id});
    cb({ok:true, waiting:true});
  });

  socket.on("approve", ({roomId, socketId, allow}) => {
    const r=rooms.get(roomId);
    if(!r || r.host!==socket.id || r.pending!==socketId) return;
    if(!allow){ io.to(socketId).emit("join-denied"); r.pending=null; return; }
    r.guest=socketId; r.pending=null;
    const guest=io.sockets.sockets.get(socketId);
    if(guest) guest.join(roomId);
    io.to(socketId).emit("join-approved", {roomId});
    io.to(r.host).emit("peer-ready", {initiator:true});
  });

  socket.on("signal", ({roomId, data}) => socket.to(roomId).emit("signal", data));
  socket.on("chat", ({roomId, message}) => socket.to(roomId).emit("chat", message));
  socket.on("file", ({roomId, name, type, data}) => socket.to(roomId).emit("file", {name,type,data}));

  socket.on("disconnect", () => {
    for(const [id,r] of rooms){
      if(r.host===socket.id){ io.to(id).emit("room-ended"); rooms.delete(id); }
      else if(r.guest===socket.id){ r.guest=null; io.to(r.host).emit("peer-left"); }
      else if(r.pending===socket.id) r.pending=null;
    }
  });
});

server.listen(process.env.PORT || 3000, ()=>console.log("Talk To Me listo"));
