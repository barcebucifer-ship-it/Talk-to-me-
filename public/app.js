const s=io(); const $=x=>document.getElementById(x);
let roomId=null,pending=null,pc=null,stream=null,facing="user";
const rtc={iceServers:[{urls:"stun:stun.l.google.com:19302"},{urls:"stun:stun1.l.google.com:19302"}]};
async function media(){if(stream)return stream;stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:facing},audio:true});$("local").srcObject=stream;return stream}
async function peer(){if(pc)return pc;pc=new RTCPeerConnection(rtc);(await media()).getTracks().forEach(t=>pc.addTrack(t,stream));pc.ontrack=e=>$("remote").srcObject=e.streams[0];pc.onicecandidate=e=>{if(e.candidate)s.emit("signal",{roomId,data:{candidate:e.candidate}})};return pc}
function showCall(){$("home").classList.add("hidden");$("invite").classList.add("hidden");$("call").classList.remove("hidden");media().catch(()=>status("Permite cámara y micrófono."))}
function status(t){$("status").textContent=t}
$("create").onclick=()=>s.emit("create-room",r=>{roomId=r.roomId;$("home").classList.add("hidden");$("invite").classList.remove("hidden");$("link").value=location.origin+location.pathname+"?room="+roomId});
$("copy").onclick=async()=>{await navigator.clipboard.writeText($("link").value);status("Invitación copiada.")};
$("join").onclick=()=>join($("room").value.trim());
function join(id){if(!id)return;roomId=id;s.emit("request-join",{roomId},r=>status(r.ok?"Esperando que el anfitrión te acepte…":r.reason))}
s.on("join-request",x=>{pending=x.socketId;$("approval").classList.remove("hidden")});
$("accept").onclick=()=>{s.emit("approve",{roomId,socketId:pending,allow:true});$("approval").classList.add("hidden");showCall()};
$("reject").onclick=()=>{s.emit("approve",{roomId,socketId:pending,allow:false});$("approval").classList.add("hidden")};
s.on("join-approved",()=>{showCall();status("Conectando…")}); s.on("join-denied",()=>status("El anfitrión no aceptó la entrada."));
s.on("peer-ready",async()=>{showCall();let p=await peer();let offer=await p.createOffer();await p.setLocalDescription(offer);s.emit("signal",{roomId,data:{description:p.localDescription}})});
s.on("signal",async data=>{let p=await peer();if(data.description){await p.setRemoteDescription(data.description);if(data.description.type==="offer"){let ans=await p.createAnswer();await p.setLocalDescription(ans);s.emit("signal",{roomId,data:{description:p.localDescription}})}}else if(data.candidate)try{await p.addIceCandidate(data.candidate)}catch(e){}});
$("mic").onclick=()=>{let t=stream?.getAudioTracks()[0];if(t){t.enabled=!t.enabled;$("mic").textContent=t.enabled?"🎙️":"🔇"}};
$("cam").onclick=()=>{let t=stream?.getVideoTracks()[0];if(t){t.enabled=!t.enabled;$("cam").textContent=t.enabled?"📷":"🚫"}};
$("flip").onclick=async()=>{facing=facing==="user"?"environment":"user";if(!stream)return;stream.getVideoTracks().forEach(t=>t.stop());let ns=await navigator.mediaDevices.getUserMedia({video:{facingMode:facing},audio:false});let nt=ns.getVideoTracks()[0],sender=pc?.getSenders().find(x=>x.track?.kind==="video");if(sender)await sender.replaceTrack(nt);stream.removeTrack(stream.getVideoTracks()[0]);stream.addTrack(nt);$("local").srcObject=stream};
$("hang").onclick=()=>location.reload();
function bubble(text,own=false){let d=document.createElement("div");d.className="bubble";d.textContent=(own?"Tú: ":"Invitado: ")+text;$("messages").appendChild(d)}
$("send").onclick=()=>{let m=$("msg").value.trim();if(m){bubble(m,true);s.emit("chat",{roomId,message:m});$("msg").value=""}};
s.on("chat",m=>bubble(m));
$("file").onchange=async e=>{let f=e.target.files[0];if(!f)return;if(f.size>20*1024*1024)return status("Archivo demasiado grande (máximo 20 MB).");let data=await new Promise(r=>{let fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(f)});renderFile({name:f.name,type:f.type,data},true);s.emit("file",{roomId,name:f.name,type:f.type,data})};
function renderFile(f,own=false){let d=document.createElement("div");d.className="bubble";d.textContent=(own?"Tú: ":"Invitado: ")+f.name;let el=document.createElement(f.type.startsWith("video/")?"video":"img");el.src=f.data;el.className="shared";if(el.tagName==="VIDEO")el.controls=true;d.appendChild(el);$("messages").appendChild(d)}
s.on("file",f=>renderFile(f)); s.on("room-ended",()=>{status("El anfitrión cerró la sala.");pc?.close()});s.on("peer-left",()=>status("La otra persona salió."));
const q=new URLSearchParams(location.search).get("room");if(q){$("room").value=q;join(q)}
