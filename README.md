# Talk To Me
Sala privada de dos personas con WebRTC + Socket.IO.

## Incluye
- enlace de invitación único
- aprobación del invitado por el anfitrión
- video/audio WebRTC
- micrófono, cámara, cambio de cámara y colgar
- chat
- fotos y videos de hasta 20 MB

## Ejecutar
1. `npm install`
2. `npm start`
3. abre `http://localhost:3000`

## Publicar
Necesita un hosting Node.js con HTTPS (no sirve un hosting puramente estático).
Configura el comando de inicio como `npm start`.

## Nota de conectividad
Esta versión usa STUN público. Algunas redes móviles/corporativas requieren un servidor TURN para que WebRTC conecte de forma fiable. Para producción, añade un TURN propio o un proveedor TURN a `iceServers`.
