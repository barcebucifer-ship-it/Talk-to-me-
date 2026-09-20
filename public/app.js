const s = io();
const $ = x => document.getElementById(x);

let roomId = null;
let pending = null;
let pc = null;
let stream = null;
let facing = "user";

const rtc = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

async function media() {
  if (stream) return stream;

  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: facing },
    audio: true
  });

  $("local").srcObject = stream;
  return stream;
}

async function peer() {
  if (pc) return pc;

  pc = new RTCPeerConnection(rtc);

  (await media()).getTracks().forEach(t => {
    pc.addTrack(t, stream);
  });

  pc.ontrack = e => {
    $("remote").srcObject = e.streams[0];
  };

  pc.onicecandidate = e => {
    if (e.candidate) {
      s.emit("signal", {
        roomId,
        data: { candidate: e.candidate }
      });
    }
  };

  return pc;
}

function status(t) {
  $("status").textContent = t;
}

function showCall() {
  $("home").classList.add("hidden");
  $("invite").classList.add("hidden");
  $("call").classList.remove("hidden");

  media().catch(() => {
    status("Permite cámara y micrófono.");
  });
}

function showHostRoom() {
  $("home").classList.add("hidden");
  $("invite").classList.remove("hidden");

  $("link").value =
    location.origin +
    location.pathname +
    "?room=" +
    roomId;
}

/* CREAR SALA */

$("create").onclick = () => {
  s.emit("create-room", r => {
    if (!r || !r.ok) {
      status("No se pudo crear la sala.");
      return;
    }

    roomId = r.roomId;

    localStorage.setItem("ttmRoomId", r.roomId);
    localStorage.setItem("ttmHostToken", r.hostToken);

    showHostRoom();
    status("Sala privada creada.");
  });
};

/* COPIAR INVITACIÓN */

$("copy").onclick = async () => {
  try {
    await navigator.clipboard.writeText($("link").value);
    status("Invitación copiada.");
  } catch {
    status("Mantén pulsado el enlace para copiarlo.");
  }
};

/* ENTRAR CON CÓDIGO */

$("join").onclick = () => {
  joinRoom($("room").value.trim());
};

function joinRoom(id) {
  if (!id) return;

  roomId = id;

  s.emit("request-join", { roomId }, r => {
    if (!r) {
      status("No hubo respuesta del servidor.");
      return;
    }

    status(
      r.ok
        ? "Esperando que el anfitrión te acepte…"
        : r.reason
    );
  });
}

/* SOLICITUD AL ANFITRIÓN */

s.on("join-request", x => {
  pending = x.socketId;
  $("approval").classList.remove("hidden");
  status("Alguien solicita entrar.");
});

$("accept").onclick = () => {
  if (!pending) return;

  s.emit("approve", {
    roomId,
    socketId: pending,
    allow: true
  });

  $("approval").classList.add("hidden");
  showCall();
};

$("reject").onclick = () => {
  if (!pending) return;

  s.emit("approve", {
    roomId,
    socketId: pending,
    allow: false
  });

  pending = null;
  $("approval").classList.add("hidden");
};

/* INVITADO ACEPTADO */

s.on("join-approved", () => {
  showCall();
  status("Conectando…");
});

s.on("join-denied", () => {
  status("El anfitrión no aceptó la entrada.");
});

/* INICIAR WEBRTC */

s.on("peer-ready", async () => {
  showCall();

  const p = await peer();

  const offer = await p.createOffer();

  await p.setLocalDescription(offer);

  s.emit("signal", {
    roomId,
    data: {
      description: p.localDescription
    }
  });
});

/* SEÑALIZACIÓN */

s.on("signal", async data => {
  const p = await peer();

  if (data.description) {
    await p.setRemoteDescription(data.description);

    if (data.description.type === "offer") {
      const answer = await p.createAnswer();

      await p.setLocalDescription(answer);

      s.emit("signal", {
        roomId,
        data: {
          description: p.localDescription
        }
      });
    }
  } else if (data.candidate) {
    try {
      await p.addIceCandidate(data.candidate);
    } catch {}
  }
});

/* MICRÓFONO */

$("mic").onclick = () => {
  const t = stream?.getAudioTracks()[0];

  if (t) {
    t.enabled = !t.enabled;
    $("mic").textContent = t.enabled ? "🎙️" : "🔇";
  }
};

/* CÁMARA */

$("cam").onclick = () => {
  const t = stream?.getVideoTracks()[0];

  if (t) {
    t.enabled = !t.enabled;
    $("cam").textContent = t.enabled ? "📷" : "🚫";
  }
};

/* CAMBIAR CÁMARA */

$("flip").onclick = async () => {
  facing = facing === "user" ? "environment" : "user";

  if (!stream) return;

  const oldTrack = stream.getVideoTracks()[0];

  if (oldTrack) oldTrack.stop();

  const ns = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: facing },
    audio: false
  });

  const newTrack = ns.getVideoTracks()[0];

  const sender = pc
    ?.getSenders()
    .find(x => x.track?.kind === "video");

  if (sender) {
    await sender.replaceTrack(newTrack);
  }

  if (oldTrack) {
    stream.removeTrack(oldTrack);
  }

  stream.addTrack(newTrack);
  $("local").srcObject = stream;
};

/* COLGAR */

$("hang").onclick = () => {
  localStorage.removeItem("ttmRoomId");
  localStorage.removeItem("ttmHostToken");

  pc?.close();

  if (stream) {
    stream.getTracks().forEach(t => t.stop());
  }

  location.href = location.origin + location.pathname;
};

/* CHAT */

function bubble(text, own = false) {
  const d = document.createElement("div");
  d.className = "bubble";
  d.textContent =
    (own ? "Tú: " : "Invitado: ") + text;

  $("messages").appendChild(d);
}

$("send").onclick = () => {
  const m = $("msg").value.trim();

  if (!m) return;

  bubble(m, true);

  s.emit("chat", {
    roomId,
    message: m
  });

  $("msg").value = "";
};

s.on("chat", m => {
  bubble(m);
});

/* ARCHIVOS */

$("file").onchange = async e => {
  const f = e.target.files[0];

  if (!f) return;

  if (f.size > 20 * 1024 * 1024) {
    status("Archivo demasiado grande (máximo 20 MB).");
    return;
  }

  const data = await new Promise(resolve => {
    const fr = new FileReader();

    fr.onload = () => resolve(fr.result);
    fr.readAsDataURL(f);
  });

  const fileData = {
    name: f.name,
    type: f.type,
    data
  };

  renderFile(fileData, true);

  s.emit("file", {
    roomId,
    ...fileData
  });
};

function renderFile(f, own = false) {
  const d = document.createElement("div");
  d.className = "bubble";

  d.appendChild(
    document.createTextNode(
      (own ? "Tú: " : "Invitado: ") + f.name
    )
  );

  const el = document.createElement(
    f.type.startsWith("video/")
      ? "video"
      : "img"
  );

  el.src = f.data;
  el.className = "shared";

  if (el.tagName === "VIDEO") {
    el.controls = true;
  }

  d.appendChild(el);
  $("messages").appendChild(d);
}

s.on("file", f => {
  renderFile(f);
});

/* SALA TERMINADA */

s.on("room-ended", () => {
  localStorage.removeItem("ttmRoomId");
  localStorage.removeItem("ttmHostToken");

  status("El anfitrión cerró la sala.");
  pc?.close();
});

s.on("peer-left", () => {
  status("La otra persona salió.");
});

/* RECONECTAR ANFITRIÓN */

function restoreHost() {
  const savedRoom = localStorage.getItem("ttmRoomId");
  const savedToken = localStorage.getItem("ttmHostToken");

  if (!savedRoom || !savedToken) {
    return false;
  }

  roomId = savedRoom;

  s.emit(
    "restore-host",
    {
      roomId: savedRoom,
      hostToken: savedToken
    },
    r => {
      if (r && r.ok) {
        showHostRoom();
        status("Sala recuperada.");
      } else {
        localStorage.removeItem("ttmRoomId");
        localStorage.removeItem("ttmHostToken");
      }
    }
  );

  return true;
}

/* AL CONECTAR */

s.on("connect", () => {
  const inviteRoom =
    new URLSearchParams(location.search).get("room");

  if (inviteRoom) {
    $("room").value = inviteRoom;
    joinRoom(inviteRoom);
    return;
  }

  restoreHost();
});
